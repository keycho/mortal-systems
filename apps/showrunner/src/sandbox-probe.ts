import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync, statfsSync } from "node:fs";
import { chromium } from "playwright-core";

/**
 * the boot-time sandbox probe. tier-1 open-web browsing has one hard
 * precondition: external pages never render in an unsandboxed browser.
 * whether chromium's sandbox can actually start here depends on the
 * host — it needs unprivileged user namespaces, it refuses outright
 * under root, and it can still die afterwards over shared memory or a
 * missing library. so the answer is not a config value, it is a
 * measurement. CHROME_SANDBOX=1 asks; this probe decides.
 *
 * it decides by trying, in order, the flag combinations that are known
 * to matter in a container, and reporting which one lived. the first
 * version guessed a single combination and reported one adjective when
 * it failed; a boot that says "browser_crashed" and nothing else cannot
 * be diagnosed without a shell on the box. so every attempt now keeps
 * chromium's own stderr, the container facts come back with it, and the
 * winning args are handed to the real browsers — a probe that passes on
 * flags the runtime does not use has proved nothing.
 */

/**
 * why a probe failed, because the causes need different actions:
 * running as root is our own packaging bug (fix the entrypoint), a
 * userns denial is the host's policy (nothing to fix here, external
 * reading stays off), a crashed browser is an image or resource problem
 * (shared memory, libraries, headroom), and a missing one is a bad
 * CHROME_PATH. collapsing them into one "sandbox failed" line sent an
 * operator looking in the wrong place.
 */
export type SandboxFailure =
  | "root"
  | "userns_denied"
  | "setuid_helper_broken"
  | "browser_missing"
  | "browser_crashed"
  | "unknown";

/** what the container looked like when the probe ran. this is the half
 * of the diagnosis that is not chromium's to give: a 64mb /dev/shm or a
 * cgroup ceiling explains a crash that the stderr alone does not. */
export interface SandboxEnvironment {
  uid: number | null;
  /** bytes available on /dev/shm; docker's default 64mb is the usual bite */
  shm_bytes: number | null;
  /** cgroup memory ceiling, and what was actually free at probe time */
  memory_limit_bytes: number | null;
  memory_available_bytes: number | null;
  /** the sysctl, when the kernel exposes it */
  unprivileged_userns: string | null;
  /** the setuid helper, if this build shipped one */
  chrome_sandbox_helper: string | null;
  chromium_version: string | null;
  /** shared objects the dynamic linker cannot resolve; empty is healthy */
  missing_libraries: string[];
}

export interface SandboxAttempt {
  label: string;
  args: string[];
  ok: boolean;
  failure?: SandboxFailure;
  /** chromium's own stderr, trimmed to something a log can carry */
  stderr?: string;
}

export interface SandboxProbeResult {
  ok: boolean;
  failure?: SandboxFailure;
  reason?: string;
  /** the launch args that survived, for the real browsers to reuse */
  args?: string[];
  environment?: SandboxEnvironment;
  attempts?: SandboxAttempt[];
}

/** chromium's own words when the kernel refuses it a user namespace */
const USERNS_DENIED =
  /clone\(\) returned|Failed to move to new namespace|No usable sandbox|namespace sandbox|CLONE_NEWUSER|unprivileged_userns/i;
/** chromium aborting over its own suid helper rather than the kernel */
const SETUID_HELPER_BROKEN =
  /SUID sandbox helper binary was found, but is not configured correctly|Running without the SUID sandbox|suid_sandbox_host|chrome-sandbox.*(owned by root|mode 4755)/i;
const BROWSER_MISSING = /ENOENT|Executable doesn't exist|spawn .* ENOENT|not found/i;
const BROWSER_CRASHED =
  /Target (page|browser)?.*closed|Browser closed unexpectedly|crashed|SIGSEGV|SIGABRT|SIGTRAP|Received signal|Segmentation fault|Aborted|Timeout .* exceeded|bus error|Out of memory|shared memory|exited early/i;

export function classifySandboxFailure(message: string): SandboxFailure {
  // order matters: a userns denial often also reports a closed target,
  // and the denial is the cause worth naming
  if (SETUID_HELPER_BROKEN.test(message)) return "setuid_helper_broken";
  if (USERNS_DENIED.test(message)) return "userns_denied";
  if (BROWSER_MISSING.test(message)) return "browser_missing";
  if (BROWSER_CRASHED.test(message)) return "browser_crashed";
  return "unknown";
}

/**
 * a browser that started and stopped without ever announcing a debugging
 * port died, whatever it printed on the way out. chromium's crash lines
 * are not a fixed vocabulary ("Received signal 11", a bare non-zero exit,
 * silence), so an unrecognized message from a process we watched exit is
 * a crash rather than a mystery. only an empty message stays unknown.
 */
function classifyLaunchFailure(message: string): SandboxFailure {
  const named = classifySandboxFailure(message);
  if (named !== "unknown") return named;
  return message.trim().length > 0 ? "browser_crashed" : "unknown";
}

const EXPLAIN: Record<SandboxFailure, string> = {
  root: "running as root: chromium refuses to sandbox under uid 0. the deploy image drops to the node user in its entrypoint; this boot did not.",
  userns_denied:
    "this host denies unprivileged user namespaces, so chromium cannot build its sandbox. nothing in this image can fix that: external reading stays off until the platform allows userns (or the service runs with a seccomp profile that permits it).",
  setuid_helper_broken:
    "chromium found its setuid sandbox helper and refused to use it, so it aborted rather than run unsandboxed. this is not a kernel refusal: the namespace sandbox is very likely available. the helper needs to be root-owned mode 4755, and a platform that runs containers with no-new-privileges cannot use it at all -- in which case the answer is --disable-setuid-sandbox, which keeps the sandbox and builds it from user namespaces instead. the probe tries that combination on its own.",
  browser_missing:
    "the chromium binary is missing or not executable at CHROME_PATH. this is an image problem, not a host policy one.",
  browser_crashed:
    "a sandboxed chromium started and then died under every flag combination the probe knows. the environment block below carries the usual culprits: /dev/shm size, the memory ceiling at probe time, and any library the linker could not resolve.",
  unknown: "the sandboxed probe failed for a reason this build does not recognize.",
};

/**
 * the flag combinations worth trying, in the order that matters in a
 * container. --disable-dev-shm-usage is the standard answer to docker's
 * 64mb /dev/shm (shared memory moves to /tmp), but it is not free with
 * the sandbox on: the renderer is chrooted into an empty directory after
 * launch, so the two mechanisms have to agree about where shared memory
 * lives. which one works is a property of the host, so the probe tries
 * both rather than picking a side, and the order is chosen from the
 * measured /dev/shm rather than assumed.
 */
export const SANDBOX_CANDIDATES: Array<{
  label: string;
  args: string[];
  why: string;
  /** true when this candidate uses /dev/shm rather than /tmp */
  realShm: boolean;
}> = [
  {
    label: "userns sandbox, shm-to-tmp",
    args: ["--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    why: "the namespace sandbox with the small-/dev/shm container workaround",
    realShm: false,
  },
  {
    label: "userns sandbox, real shm",
    args: ["--disable-setuid-sandbox", "--disable-gpu"],
    why: "the namespace sandbox using /dev/shm as chromium prefers",
    realShm: true,
  },
  {
    label: "setuid helper allowed, shm-to-tmp",
    args: ["--disable-dev-shm-usage", "--disable-gpu"],
    why: "lets chromium choose its helper; correct where the helper is intact",
    realShm: false,
  },
  {
    label: "setuid helper allowed, real shm",
    args: ["--disable-gpu"],
    why: "helper plus /dev/shm, the configuration chromium picks unaided",
    realShm: true,
  },
  {
    label: "userns sandbox, single gpu process",
    args: [
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--in-process-gpu",
    ],
    why: "one process fewer, and no gpu-process shared memory at all",
    realShm: false,
  },
  {
    label: "userns sandbox, no compositor sharing",
    args: [
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-features=VizDisplayCompositor",
    ],
    why: "last resort: drops the compositor's shared-memory transport",
    realShm: false,
  },
];

const SHM_COMFORTABLE = 256 * 1024 * 1024;

/**
 * order the candidates against what this container actually provides.
 * the only adaptive decision is where shared memory should live: a
 * platform that gave us a real /dev/shm is telling us to use it, and a
 * 64mb one has to be routed around. everything else keeps its order.
 */
export function orderCandidates(env: SandboxEnvironment): typeof SANDBOX_CANDIDATES {
  const comfortable = env.shm_bytes !== null && env.shm_bytes >= SHM_COMFORTABLE;
  const preferred = SANDBOX_CANDIDATES.filter((c) => c.realShm === comfortable);
  const rest = SANDBOX_CANDIDATES.filter((c) => c.realShm !== comfortable);
  return [...preferred, ...rest];
}

export function describeSandboxEnvironment(executablePath?: string): SandboxEnvironment {
  return {
    uid: typeof process.getuid === "function" ? process.getuid() : null,
    shm_bytes: readShmBytes(),
    memory_limit_bytes: readCgroupMemoryLimit(),
    memory_available_bytes: readMemAvailable(),
    unprivileged_userns: readFirst([
      "/proc/sys/kernel/unprivileged_userns_clone",
      "/proc/sys/user/max_user_namespaces",
    ]),
    chrome_sandbox_helper: findSandboxHelper(executablePath),
    chromium_version: readChromiumVersion(executablePath),
    missing_libraries: findMissingLibraries(executablePath),
  };
}

export async function probeSandbox(
  executablePath?: string,
  opts: { timeoutMs?: number; environment?: SandboxEnvironment } = {}
): Promise<SandboxProbeResult> {
  // the facts are normally measured here; an injected set lets a test
  // drive the ladder without being the uid it happens to run as
  const environment = opts.environment ?? describeSandboxEnvironment(executablePath);
  if (environment.uid === 0) {
    return { ok: false, failure: "root", reason: EXPLAIN.root, environment };
  }
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const attempts: SandboxAttempt[] = [];

  for (const candidate of orderCandidates(environment)) {
    // spawn the binary directly first: it is the only way to keep
    // chromium's stderr, which is where the sandbox says what it could
    // not do. playwright reports that the target closed and throws the
    // reason away.
    const raw = await launchForStderr(candidate.args, executablePath, timeoutMs);
    if (!raw.ok) {
      const failure = classifyLaunchFailure(`${raw.stderr}\n${raw.exitReason}`);
      attempts.push({
        label: candidate.label,
        args: candidate.args,
        ok: false,
        failure,
        ...(raw.stderr ? { stderr: trim(raw.stderr) } : {}),
      });
      // a userns denial or a missing binary is a property of the host or
      // the image, not of the flags. trying three more combinations
      // cannot change it and only delays the boot.
      if (failure === "userns_denied" || failure === "browser_missing") {
        // note: setuid_helper_broken is deliberately NOT here. the kernel
        // has not refused anything; the next candidate drops the helper
        // and asks for the namespace sandbox directly.
        return {
          ok: false,
          failure,
          reason: `${EXPLAIN[failure]} ${describeFor(environment)} (chromium said: ${firstMeaningful(raw.stderr)})`,
          environment,
          attempts,
        };
      }
      continue;
    }
    // it launched. now prove the path the service actually uses, with
    // the same args, including a paint: shared-memory limits bite when a
    // frame is composited, not when the browser opens.
    const driver = await confirmThroughPlaywright(candidate.args, executablePath, timeoutMs);
    if (driver.ok) {
      attempts.push({ label: candidate.label, args: candidate.args, ok: true });
      return { ok: true, args: candidate.args, environment, attempts };
    }
    attempts.push({
      label: candidate.label,
      args: candidate.args,
      ok: false,
      failure: classifyLaunchFailure(driver.message),
      stderr: trim(`${raw.stderr}\nplaywright: ${driver.message}`),
    });
  }

  const failure = attempts.find((a) => a.failure)?.failure ?? "unknown";
  return {
    ok: false,
    failure,
    reason: `${EXPLAIN[failure]} ${describeFor(environment)} tried ${attempts.length} flag combinations: ${attempts
      .map((a) => a.label)
      .join(", ")}.`,
    environment,
    attempts,
  };
}

/** the one-line summary of the container that belongs next to a failure */
function describeFor(env: SandboxEnvironment): string {
  const bits = [
    `/dev/shm ${env.shm_bytes === null ? "unknown" : mb(env.shm_bytes)}`,
    `memory ${env.memory_available_bytes === null ? "unknown" : mb(env.memory_available_bytes)} free`,
    env.memory_limit_bytes === null ? null : `of a ${mb(env.memory_limit_bytes)} ceiling`,
    env.missing_libraries.length > 0
      ? `missing libraries: ${env.missing_libraries.join(", ")}`
      : "no missing libraries",
  ].filter(Boolean);
  return `[${bits.join(", ")}]`;
}

function mb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}mb`;
}

/**
 * launch chromium as a plain child process and wait for it to say it is
 * listening. success is killed immediately; failure comes back with
 * everything it printed.
 */
function launchForStderr(
  args: string[],
  executablePath: string | undefined,
  timeoutMs: number
): Promise<{ ok: boolean; stderr: string; exitReason: string }> {
  const bin = executablePath ?? chromium.executablePath();
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        bin,
        [
          "--headless=new",
          "--remote-debugging-port=0",
          // a throwaway profile per attempt: a half-written one from a
          // previous crash is its own source of crashes
          `--user-data-dir=${mkTempProfile()}`,
          ...args,
          "about:blank",
        ],
        { stdio: ["ignore", "ignore", "pipe"] }
      );
    } catch (err) {
      resolve({ ok: false, stderr: "", exitReason: `spawn failed: ${String(err)} ENOENT` });
      return;
    }
    let stderr = "";
    let settled = false;
    const done = (ok: boolean, exitReason: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill("SIGKILL");
      } catch {
        // already gone; the answer does not change
      }
      resolve({ ok, stderr, exitReason });
    };
    const timer = setTimeout(
      () => done(false, "Timeout exceeded: chromium never reported a listening port"),
      timeoutMs
    );
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      // chromium prints this only once the browser process is up with a
      // working sandbox; it is the earliest honest success signal
      if (/DevTools listening on ws:/i.test(stderr)) done(true, "");
    });
    child.on("error", (err) => done(false, `spawn error: ${err.message}`));
    child.on("exit", (code, signal) =>
      done(false, `chromium exited early with code ${code ?? "null"} signal ${signal ?? "none"}`)
    );
  });
}

/** the same args through the driver the service really uses, with a paint */
async function confirmThroughPlaywright(
  args: string[],
  executablePath: string | undefined,
  timeoutMs: number
): Promise<{ ok: boolean; message: string }> {
  try {
    const browser = await chromium.launch({
      headless: true,
      chromiumSandbox: true,
      ...(executablePath ? { executablePath } : {}),
      args,
      timeout: timeoutMs,
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.setContent("<h1 style='font-size:120px'>mortal</h1>".repeat(40));
      await page.screenshot();
    } finally {
      await browser.close();
    }
    return { ok: true, message: "" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

function mkTempProfile(): string {
  // deliberately not mkdtemp: the directory must not exist yet for
  // chromium to treat it as a fresh profile, and the pid keeps parallel
  // boots from sharing one
  return `${process.env.TMPDIR ?? "/tmp"}/wall-sandbox-probe-${process.pid}-${probeSeq++}`;
}
let probeSeq = 0;

function trim(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^\[\d+:\d+.*Fontconfig|dbus|GLib/i.test(l));
  // the front carries the sandbox complaint; the tail carries the crash
  const kept = lines.length <= 24 ? lines : [...lines.slice(0, 16), "...", ...lines.slice(-8)];
  return kept.join("\n").slice(0, 4000);
}

function firstMeaningful(stderr: string): string {
  const line = stderr
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !/^\[/.test(l));
  return (line ?? stderr.split("\n")[0] ?? "nothing on stderr").slice(0, 200);
}

function readShmBytes(): number | null {
  try {
    const st = statfsSync("/dev/shm");
    return Number(st.bsize) * Number(st.blocks);
  } catch {
    return null;
  }
}

function readCgroupMemoryLimit(): number | null {
  for (const path of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    try {
      const raw = readFileSync(path, "utf8").trim();
      if (raw === "max") return null;
      const value = Number(raw);
      // cgroup v1 reports a sentinel near 2^63 when unlimited
      if (Number.isFinite(value) && value > 0 && value < Number.MAX_SAFE_INTEGER) return value;
    } catch {
      // try the next layout
    }
  }
  return null;
}

function readMemAvailable(): number | null {
  try {
    const match = /MemAvailable:\s+(\d+) kB/.exec(readFileSync("/proc/meminfo", "utf8"));
    return match?.[1] ? Number(match[1]) * 1024 : null;
  } catch {
    return null;
  }
}

function readFirst(paths: string[]): string | null {
  for (const path of paths) {
    try {
      return `${path.split("/").pop()}=${readFileSync(path, "utf8").trim()}`;
    } catch {
      // not every kernel exposes every knob
    }
  }
  return null;
}

function findSandboxHelper(executablePath?: string): string | null {
  const candidates = [
    executablePath ? `${executablePath.replace(/\/[^/]+$/, "")}/chrome-sandbox` : null,
    "/usr/lib/chromium/chrome-sandbox",
    "/usr/lib/chromium-browser/chrome-sandbox",
  ].filter((p): p is string => p !== null);
  for (const path of candidates) {
    try {
      const st = statSync(path);
      const setuid = (st.mode & 0o4000) !== 0;
      return `${path} (mode ${(st.mode & 0o7777).toString(8)}${setuid ? ", setuid" : ", NOT setuid"})`;
    } catch {
      // the namespace sandbox does not need one; absence is not a fault
    }
  }
  return null;
}

function readChromiumVersion(executablePath?: string): string | null {
  const bin = executablePath ?? safeExecutablePath();
  if (!bin || !existsSync(bin)) return null;
  try {
    return execFileSync(bin, ["--version"], {
      timeout: 10_000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function findMissingLibraries(executablePath?: string): string[] {
  const bin = executablePath ?? safeExecutablePath();
  if (!bin || !existsSync(bin)) return [];
  try {
    const out = execFileSync("ldd", [bin], {
      timeout: 10_000,
      encoding: "utf8",
      // a static binary makes ldd complain on stderr; that is not our news
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out
      .split("\n")
      .filter((line) => line.includes("not found"))
      .map((line) => line.trim().split(/\s+/)[0] ?? line.trim())
      .slice(0, 20);
  } catch {
    // no ldd (or a static binary): absence of evidence, reported as such
    return [];
  }
}

function safeExecutablePath(): string | null {
  try {
    return chromium.executablePath();
  } catch {
    return null;
  }
}
