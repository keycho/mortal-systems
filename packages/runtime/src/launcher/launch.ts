import { spawn, execFile, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DetectedBrowser, IdentityManifest } from "@liminal/schema";
import { errors } from "../errors.js";
import { LAUNCHABLE_STATES } from "../identity/state.js";
import type { LauncherApi, LiminalRuntime } from "../runtime.js";
import { dirSizeBytes } from "../util/fsx.js";
import { insideRoot } from "../util/paths.js";
import { log } from "../util/log.js";
import { discoverBrowsers, discoveryWarnings } from "./discover.js";
import {
  computeUnpackedExtensionId,
  pickCompanionExtensionId,
  type ObservedTarget,
} from "./extension-id.js";
import { provisionIdentity, scrubHistory } from "./provision.js";

interface Proc {
  child: ChildProcess;
  pid: number;
  cdpPort: number;
  cdpEndpoint: string;
  exited: Promise<void>;
  /** true while a deliberate stop (suspend/halt) is in progress */
  stopping: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForFile(file: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const content = fs.readFileSync(file, "utf8");
      if (content.trim().length > 0) return content;
    } catch {}
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${file}`);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** kill the process group on posix; taskkill tree on windows (untested here, flagged) */
function killTree(pid: number, signal: NodeJS.Signals): void {
  if (os.platform() === "win32") {
    if (signal === "SIGKILL") {
      execFile("taskkill", ["/pid", String(pid), "/T", "/F"], () => {});
    } else {
      execFile("taskkill", ["/pid", String(pid), "/T"], () => {});
    }
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {}
  }
}

export class Launcher implements LauncherApi {
  browsers: DetectedBrowser[] = [];
  warnings: string[] = [];
  private readonly procs = new Map<string, Proc>();
  private readonly observedIds = new Map<string, string>();
  private readonly runtime: LiminalRuntime;

  constructor(runtime: LiminalRuntime) {
    this.runtime = runtime;
  }

  /** discovery + state reconciliation; called once by runtime startup */
  async init(): Promise<void> {
    try {
      this.browsers = await discoverBrowsers();
      this.warnings = discoveryWarnings(this.browsers);
    } catch (err) {
      // no browser is a hard error for launch, not for runtime startup
      this.browsers = [];
      this.warnings = [err instanceof Error ? err.message : String(err)];
    }

    // no chromium process survives a runtime restart under our supervision;
    // rows stuck in live/transitional states are reconciled to their resting
    // state. (a runtime crash can orphan a browser; the poc accepts that and
    // logs it — see docs/DECISIONS.md.)
    for (const row of this.runtime.repo.listIdentities(["running", "expiring"])) {
      log.warn(`reconciling stale state for ${row.id}: ${row.state} -> ready (no supervised process)`);
      this.runtime.identities.transition(row.id, row.state === "expiring" ? "destroying" : "ready");
      if (row.state === "expiring") {
        // an interrupted expiry is honored, never skipped
        await this.runtime.destroyIdentity(row.id, { reason: "expiry interrupted by restart" });
      }
    }
    for (const row of this.runtime.repo.listIdentities(["provisioning"])) {
      this.runtime.identities.transition(row.id, "created");
    }
  }

  runningCount(): number {
    return this.procs.size;
  }

  cdpEndpointFor(id: string): string | null {
    return this.procs.get(id)?.cdpEndpoint ?? null;
  }

  private defaultBrowser(): DetectedBrowser {
    const browser = this.browsers[0];
    if (!browser) {
      throw errors.browserNotFound(
        "no chromium-based browser available. install google chrome, chromium, or brave, " +
          "or set LIMINAL_BROWSER_PATH."
      );
    }
    return browser;
  }

  async launch(id: string): Promise<{ pid: number; cdpEndpoint: string | null }> {
    const existing = this.procs.get(id);
    if (existing && pidAlive(existing.pid)) {
      return { pid: existing.pid, cdpEndpoint: existing.cdpEndpoint };
    }

    const row = this.runtime.identities.mustGetRow(id);
    if (!LAUNCHABLE_STATES.includes(row.state)) {
      throw errors.invalidState(
        `identity "${id}" cannot launch from state "${row.state}"`
      );
    }
    const resuming = row.state === "suspended";
    const browser = this.defaultBrowser();
    const manifest = this.runtime.identities.get(id).manifest;
    if (!manifest) throw errors.invalidState(`identity "${id}" has no manifest`);

    // first launch provisions the partition
    if (row.state === "created") {
      this.runtime.identities.transition(id, "provisioning");
      try {
        provisionIdentity(this.runtime.root, this.runtime.repo, manifest);
        this.runtime.repo.appendActivity(id, "provisioned", null, new Date().toISOString());
        this.runtime.identities.transition(id, "ready");
      } catch (err) {
        this.runtime.identities.transition(id, "created");
        throw err;
      }
    }

    // stamp or refresh the companion instance on every launch — the runtime
    // port is random per start, so the stamped config must be rewritten
    this.stampCompanion(id, manifest);

    const profileDir = insideRoot(this.runtime.root, manifest.surfaces.browser.profilePath);
    const portFile = path.join(profileDir, "DevToolsActivePort");
    try {
      fs.rmSync(portFile, { force: true });
    } catch {}

    const args = [
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      "--password-store=basic",
      "--disable-background-networking",
      "--disable-component-update",
    ];
    const companionDir = this.companionInstanceDir(id);
    if (companionDir !== null) {
      args.push(`--load-extension=${companionDir}`);
      if (browser.kind === "chrome") {
        // branded chrome 136+ gates --load-extension behind this feature flag
        args.push("--disable-features=DisableLoadExtensionCommandLineSwitch");
      }
    }
    const headless =
      process.env.LIMINAL_HEADLESS === "1" ||
      (os.platform() === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY);
    if (headless) {
      args.push("--headless=new", "--disable-gpu", "--disable-dev-shm-usage");
    }
    if (os.platform() !== "win32" && typeof process.getuid === "function" && process.getuid() === 0) {
      args.push("--no-sandbox", "--disable-setuid-sandbox");
    }

    const child = spawn(browser.path, args, {
      detached: os.platform() !== "win32",
      stdio: "ignore",
    });
    const pid = child.pid;
    if (pid === undefined) {
      throw errors.internal(`failed to spawn browser process for "${id}"`);
    }

    const exited = new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
    });

    let cdpEndpoint: string;
    let cdpPort: number;
    try {
      const portFileContent = await waitForFile(portFile, 30_000);
      const [portLine, wsPath] = portFileContent.split("\n");
      cdpPort = Number(portLine?.trim());
      if (!Number.isInteger(cdpPort) || cdpPort <= 0) {
        throw new Error(`unparseable DevToolsActivePort: ${JSON.stringify(portFileContent)}`);
      }
      cdpEndpoint = `ws://127.0.0.1:${cdpPort}${(wsPath ?? "").trim()}`;
    } catch (err) {
      killTree(pid, "SIGKILL");
      throw errors.internal(
        `browser started but devtools endpoint never appeared: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const proc: Proc = { child, pid, cdpPort, cdpEndpoint, exited, stopping: false };
    this.procs.set(id, proc);
    void exited.then(() => this.onExit(id, proc));
    this.observeCompanion(id, cdpPort);

    const now = new Date().toISOString();
    this.runtime.identities.transition(id, "running");
    this.runtime.repo.setIdentityLaunched(id, now);
    this.runtime.repo.appendActivity(
      id,
      resuming ? "resumed" : "launched",
      { pid, cdpPort, browser: browser.kind, headless },
      now
    );

    return { pid, cdpEndpoint };
  }

  resume(id: string): Promise<{ pid: number; cdpEndpoint: string | null }> {
    return this.launch(id);
  }

  async suspend(id: string): Promise<void> {
    const row = this.runtime.identities.mustGetRow(id);
    const proc = this.procs.get(id);
    if (!proc) {
      if (row.state === "running") {
        // stale state without a process; reconcile quietly
        this.runtime.identities.transition(id, "suspended");
        return;
      }
      throw errors.invalidState(`identity "${id}" is not running`);
    }
    await this.terminate(id, proc);
    this.finishStop(id, "suspended");
    this.runtime.repo.appendActivity(id, "suspended", null, new Date().toISOString());
  }

  /** terminate without owning state transitions; used by destroy (D2) and expiry */
  async halt(id: string): Promise<{ halted: boolean; detail: string }> {
    const proc = this.procs.get(id);
    if (!proc || !pidAlive(proc.pid)) {
      this.procs.delete(id);
      return { halted: false, detail: "no process" };
    }
    await this.terminate(id, proc);
    return { halted: true, detail: `terminated pid ${proc.pid}` };
  }

  async haltIfRunning(id: string): Promise<void> {
    await this.halt(id);
  }

  async stopAll(reason: string): Promise<void> {
    const ids = [...this.procs.keys()];
    for (const id of ids) {
      log.info(`stopping browser for ${id} (${reason})`);
      await this.halt(id);
    }
  }

  /** sigterm the tree, sigkill stragglers after 5s, verify exit */
  private async terminate(id: string, proc: Proc): Promise<void> {
    proc.stopping = true;
    killTree(proc.pid, "SIGTERM");
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (!pidAlive(proc.pid)) break;
      await sleep(100);
    }
    if (pidAlive(proc.pid)) {
      log.warn(`browser for ${id} ignored SIGTERM; escalating to SIGKILL`);
      killTree(proc.pid, "SIGKILL");
      const killDeadline = Date.now() + 5_000;
      while (Date.now() < killDeadline) {
        if (!pidAlive(proc.pid)) break;
        await sleep(100);
      }
    }
    if (pidAlive(proc.pid)) {
      throw errors.internal(`browser process ${proc.pid} for "${id}" survived SIGKILL`);
    }
    this.procs.delete(id);
    this.afterProcessGone(id);
  }

  /** browser exited on its own (user closed the window, crash, expiry kill) */
  private onExit(id: string, proc: Proc): void {
    if (this.procs.get(id) !== proc) return; // already handled by terminate()
    if (proc.stopping) return;
    this.procs.delete(id);
    this.afterProcessGone(id);
    const row = this.runtime.repo.getIdentity(id);
    if (row && row.state === "running") {
      this.runtime.identities.transition(id, "ready");
    }
  }

  private finishStop(id: string, state: "suspended"): void {
    const row = this.runtime.repo.getIdentity(id);
    if (row && (row.state === "running" || row.state === "ready")) {
      this.runtime.identities.transition(id, state);
    }
  }

  /** post-exit housekeeping: history scrub (enforced when retainHistory=false) + storage accounting */
  private afterProcessGone(id: string): void {
    const row = this.runtime.repo.getIdentity(id);
    if (!row || row.state === "destroyed") return;
    let manifest: IdentityManifest | null = null;
    try {
      manifest = this.runtime.identities.get(id).manifest;
    } catch {
      return;
    }
    if (!manifest) return;
    const profileDir = insideRoot(this.runtime.root, manifest.surfaces.browser.profilePath);
    if (manifest.privacy.retainHistory.value === false) {
      const removed = scrubHistory(profileDir);
      if (removed.length > 0) {
        log.info(`scrubbed history artifacts for ${id}`, { removed });
      }
    }
    try {
      const filesDir = insideRoot(this.runtime.root, manifest.surfaces.files.root);
      this.runtime.repo.setIdentityStorageBytes(id, dirSizeBytes(profileDir) + dirSizeBytes(filesDir));
    } catch {}
  }

  /**
   * observe which extension id chromium ACTUALLY assigned to the stamped
   * companion, via the browser's own target list. prediction (sha256 of the
   * canonical path) can diverge from chromium's canonicalization on some
   * platforms (macos firmlinks/symlinked tmp), so the origin check pins to
   * the observed id once available. best-effort, background, cached on disk
   * in the instance dir so restarts keep the pin without a relaunch.
   */
  private observeCompanion(id: string, cdpPort: number): void {
    const instanceDir = path.join(this.runtime.root, "companion-instances", id);
    if (!fs.existsSync(path.join(instanceDir, "manifest.json"))) return;
    const computed = computeUnpackedExtensionId(fs.realpathSync(instanceDir));
    void (async () => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        if (this.procs.get(id)?.cdpPort !== cdpPort) return; // stopped or relaunched
        try {
          const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
          const targets = (await res.json()) as ObservedTarget[];
          // only companion-shaped targets count; branded chrome ships
          // constant-id component extensions (hangouts et al.) that must
          // never be pinned as an identity's companion origin
          const chosen = pickCompanionExtensionId(targets, computed);
          if (chosen !== null) {
            this.observedIds.set(id, chosen);
            try {
              fs.writeFileSync(path.join(instanceDir, "observed-extension-id"), chosen);
            } catch {}
            if (chosen !== computed) {
              log.warn(
                `companion for ${id}: chromium assigned ${chosen} but the computed id was ${computed}; origin pinned to the observed id`
              );
            }
            return;
          }
        } catch {}
        await sleep(250);
      }
      // timeout without a companion-shaped target: the extension did not load.
      // branded chrome ignores --load-extension since 137 (risk r3); say so.
      const warning =
        "companion did not load in at least one identity's browser (branded chrome ignores --load-extension since 137; use chromium or brave, or set LIMINAL_BROWSER_PATH). the side panel/badge are unavailable there and /v1/self has no browser client.";
      log.warn(`companion for ${id} never appeared in the browser's target list`);
      if (!this.warnings.includes(warning)) this.warnings.push(warning);
    })();
  }

  observedExtensionIdFor(id: string): string | null {
    const cached = this.observedIds.get(id);
    if (cached !== undefined) return cached;
    try {
      const value = fs
        .readFileSync(path.join(this.runtime.root, "companion-instances", id, "observed-extension-id"), "utf8")
        .trim();
      if (/^[a-p]{32}$/.test(value)) {
        this.observedIds.set(id, value);
        return value;
      }
    } catch {}
    return null;
  }

  // ---- companion stamping: one identity, one instance, one token ----

  private companionInstanceDir(id: string): string | null {
    const dir = path.join(this.runtime.root, "companion-instances", id);
    return fs.existsSync(path.join(dir, "manifest.json")) ? fs.realpathSync(dir) : null;
  }

  /** locate the built companion template: env override, then the monorepo build output */
  private companionTemplateDir(): string | null {
    const override = process.env.LIMINAL_COMPANION_TEMPLATE;
    if (override && fs.existsSync(path.join(override, "manifest.json"))) return override;
    const monorepo = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "../../../../apps/companion/dist"
    );
    if (fs.existsSync(path.join(monorepo, "manifest.json"))) return monorepo;
    return null;
  }

  /**
   * copy the template into companion-instances/<id>/ (first launch) and
   * (re)write the stamped config. the config is rewritten on every launch
   * because the runtime port is random per start. missing template is honest:
   * the identity launches without a companion and status carries a warning.
   */
  private stampCompanion(id: string, manifest: IdentityManifest): void {
    const template = this.companionTemplateDir();
    const instanceDir = path.join(this.runtime.root, "companion-instances", id);
    if (template === null) {
      if (!this.warnings.some((w) => w.includes("companion template"))) {
        this.warnings.push(
          "companion template not built; identities launch without the liminal companion (run: pnpm --filter companion build)"
        );
      }
      return;
    }
    if (!fs.existsSync(path.join(instanceDir, "manifest.json"))) {
      fs.cpSync(template, instanceDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(instanceDir, "liminal.identity.json"),
      JSON.stringify(
        {
          identityId: id,
          runtimePort: this.runtime.port,
          token: this.runtime.companionTokenFor(id),
          name: manifest.name,
          color: manifest.color,
        },
        null,
        2
      )
    );
  }
}
