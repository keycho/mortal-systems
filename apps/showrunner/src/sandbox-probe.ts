import { chromium } from "playwright-core";

/**
 * the boot-time sandbox probe. tier-1 open-web browsing has one hard
 * precondition: external pages never render in an unsandboxed browser.
 * whether chromium's sandbox can actually start here depends on the
 * host — it needs either the setuid helper or unprivileged user
 * namespaces, and it refuses outright under root. so the answer is not
 * a config value, it is a measurement: launch one sandboxed chromium,
 * and if that fails, external navigation stays off for the whole boot
 * (the terrarium, our own output, remains browsable) and /health names
 * the reason. CHROME_SANDBOX=1 asks; this probe decides.
 */

/**
 * why a probe failed, because the three causes need different actions:
 * running as root is our own packaging bug (fix the entrypoint), a
 * userns denial is the host's policy (nothing to fix here, external
 * reading stays off), and a crashed or missing browser is an image
 * problem (fix the image). collapsing them into one "sandbox failed"
 * line sent an operator looking in the wrong place.
 */
export type SandboxFailure =
  | "root"
  | "userns_denied"
  | "browser_missing"
  | "browser_crashed"
  | "unknown";

export interface SandboxProbeResult {
  ok: boolean;
  failure?: SandboxFailure;
  reason?: string;
}

/** chromium's own words when the kernel refuses it a user namespace */
const USERNS_DENIED =
  /clone\(\) returned|Failed to move to new namespace|No usable sandbox|namespace sandbox|Operation not permitted|CLONE_NEWUSER|unprivileged_userns/i;
const BROWSER_MISSING = /ENOENT|Executable doesn't exist|spawn .* ENOENT|not found/i;
const BROWSER_CRASHED =
  /Target (page|browser)?.*closed|Browser closed unexpectedly|crashed|SIGSEGV|SIGABRT|Timeout .* exceeded/i;

export function classifySandboxFailure(message: string): SandboxFailure {
  // order matters: a userns denial often also reports a closed target,
  // and the denial is the cause worth naming
  if (USERNS_DENIED.test(message)) return "userns_denied";
  if (BROWSER_MISSING.test(message)) return "browser_missing";
  if (BROWSER_CRASHED.test(message)) return "browser_crashed";
  return "unknown";
}

const EXPLAIN: Record<SandboxFailure, string> = {
  root: "running as root: chromium refuses to sandbox under uid 0. the deploy image drops to the node user in its entrypoint; this boot did not.",
  userns_denied:
    "this host denies unprivileged user namespaces, so chromium cannot build its sandbox. nothing in this image can fix that: external reading stays off until the platform allows userns (or the service runs with a seccomp profile that permits it).",
  browser_missing:
    "the chromium binary is missing or not executable at CHROME_PATH. this is an image problem, not a host policy one.",
  browser_crashed:
    "the sandboxed probe browser started and then died. this is an image or resource problem (missing shared libraries, /dev/shm, or memory), not a userns policy one.",
  unknown: "the sandboxed probe failed for a reason this build does not recognize.",
};

export async function probeSandbox(executablePath?: string): Promise<SandboxProbeResult> {
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    return { ok: false, failure: "root", reason: EXPLAIN.root };
  }
  try {
    const browser = await chromium.launch({
      headless: true,
      chromiumSandbox: true,
      ...(executablePath ? { executablePath } : {}),
      args: ["--disable-dev-shm-usage", "--disable-gpu"],
      timeout: 20_000,
    });
    await browser.close();
    return { ok: true };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const failure = classifySandboxFailure(raw);
    return {
      ok: false,
      failure,
      reason: `${EXPLAIN[failure]} (chromium said: ${(raw.split("\n")[0] ?? raw).slice(0, 160)})`,
    };
  }
}
