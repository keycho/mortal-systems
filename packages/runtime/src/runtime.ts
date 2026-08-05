import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ADVISORY_FIELDS,
  CONDITIONAL_ENFORCEMENT,
  ENFORCED_FIELDS,
  generateToken,
  RESERVED_METHODS,
  ROADMAP_FIELDS,
  type ActivityEvent,
  type DestructionReport,
  type DetectedBrowser,
  type RuntimeCapabilities,
  type RuntimeStatus,
} from "@mortal/schema";
import { errors } from "./errors.js";
import { IdentityService } from "./identity/service.js";
import { Destroyer } from "./destroy/destroy.js";
import { openDb } from "./store/db.js";
import { Repo } from "./store/repo.js";
import { ensureDir, writeJson } from "./util/fsx.js";
import { resolveRoot } from "./util/paths.js";
import { log } from "./util/log.js";
import { RUNTIME_VERSION } from "./version.js";
import { createApiServer, type ApiServer } from "./api/server.js";
import { EventBus } from "./api/events.js";
import { findIdentityByToken, getOrCreateTokenSecret, tokenForIdentity } from "./api/tokens.js";
import { Scheduler, type SchedulerOptions } from "./scheduler/scheduler.js";
import { BlueprintService } from "./blueprints/pipeline.js";

/**
 * the contract the day-2 chromium launcher fulfills. kept as an interface so
 * the runtime core has no compile-time dependency on the launcher module.
 */
export interface LauncherApi {
  browsers: DetectedBrowser[];
  warnings: string[];
  /** discovery + stale-state reconciliation; runtime startup awaits it when present */
  init?(): Promise<void>;
  runningCount(): number;
  cdpEndpointFor(id: string): string | null;
  /** the extension id chromium actually assigned to the identity's companion, once observed */
  observedExtensionIdFor(id: string): string | null;
  launch(id: string): Promise<{ pid: number; cdpEndpoint: string | null }>;
  suspend(id: string): Promise<void>;
  resume(id: string): Promise<{ pid: number; cdpEndpoint: string | null }>;
  halt(id: string): Promise<{ halted: boolean; detail: string }>;
  haltIfRunning(id: string): Promise<void>;
  stopAll(reason: string): Promise<void>;
}

/** day-2 injection point; assigned by the launcher module when present */
export type AttachLauncher = (runtime: MortalRuntime) => LauncherApi;
let attachLauncher: AttachLauncher | null = null;
export function registerLauncher(factory: AttachLauncher): void {
  attachLauncher = factory;
}

export interface RuntimeOptions {
  /** runtime root; defaults to ~/.mortal. all identity state lives under it. */
  root?: string;
  /** api port; 0 (default) selects a random loopback port */
  port?: number;
  /** admin bearer token; generated when omitted */
  adminToken?: string;
  /** skip binding the http api (for in-process unit tests) */
  noServer?: boolean;
  /** scheduler pacing overrides (tests); defaults 15s tick / 60s grace */
  scheduler?: SchedulerOptions;
}

export class MortalRuntime {
  readonly root: string;
  readonly repo: Repo;
  readonly identities: IdentityService;
  readonly destroyer: Destroyer;
  readonly events: EventBus;
  readonly adminToken: string;
  readonly startedAt: string;
  readonly blueprints: BlueprintService;
  scheduler: Scheduler | null = null;
  /** wired by the day-2 launcher; null means launch/suspend/resume are unavailable */
  launcher: LauncherApi | null = null;
  port = 0;
  private api: ApiServer | null = null;
  private readonly tokenSecret: string;

  private constructor(root: string, repo: Repo, adminToken: string) {
    this.root = root;
    this.repo = repo;
    this.adminToken = adminToken;
    this.startedAt = new Date().toISOString();
    this.events = new EventBus(repo);
    this.tokenSecret = getOrCreateTokenSecret(repo);
    this.identities = new IdentityService(repo, undefined, (id, state) =>
      this.events.pushState(id, state)
    );
    this.destroyer = new Destroyer({
      repo,
      root,
      halt: async () => ({ halted: false, detail: "no process (launcher not attached)" }),
    });
    this.blueprints = new BlueprintService(this);
  }

  /** the per-identity companion bearer token (stamped into the instance config) */
  companionTokenFor(identityId: string): string {
    return tokenForIdentity(this.tokenSecret, identityId);
  }

  /** resolve a companion bearer token to its identity, or null */
  identityForCompanionToken(token: string): string | null {
    return findIdentityByToken(this.repo, this.tokenSecret, token);
  }

  static async start(opts: RuntimeOptions = {}): Promise<MortalRuntime> {
    migrateLegacyArtifacts(resolveRoot(opts.root));
    ensureDir(resolveRoot(opts.root));
    // canonicalize the root once, at startup: on macos, tmp and user paths
    // resolve through symlinks (/tmp -> /private/tmp) and chromium
    // canonicalizes extension paths before hashing them into extension ids.
    // every path the runtime derives must start from the same canonical form.
    const root = fs.realpathSync(resolveRoot(opts.root));
    ensureDir(path.join(root, "profiles"));
    ensureDir(path.join(root, "files"));
    ensureDir(path.join(root, "companion-instances"));

    const db = openDb(path.join(root, "mortal.db"));
    const repo = new Repo(db);
    const runtime = new MortalRuntime(root, repo, opts.adminToken ?? generateToken());

    // attach the launcher (when the day-2 module has registered) before any
    // destruction resume, so the halt step is real
    if (attachLauncher) {
      runtime.launcher = attachLauncher(runtime);
      runtime.destroyer.setHalt((id) => runtime.launcher!.halt(id));
      if (runtime.launcher.init) await runtime.launcher.init();
    }

    // crash recovery: resume interrupted destructions before serving anything
    const resumed = await runtime.destroyer.resumeAll();
    if (resumed.length > 0) {
      log.warn(`resumed ${resumed.length} interrupted destruction(s) on startup`);
    }

    // lifecycle enforcement: catch-up runs before the api serves, so a
    // missed expiry is honored before any client can act on the identity
    runtime.scheduler = new Scheduler(runtime, opts.scheduler);
    await runtime.scheduler.catchUp();
    runtime.scheduler.start();

    if (!opts.noServer) {
      runtime.api = createApiServer(runtime, runtime.adminToken);
      runtime.port = await runtime.api.listen(opts.port ?? 0);
      runtime.events.startTicking();
      writeJson(path.join(root, "runtime.json"), {
        port: runtime.port,
        pid: process.pid,
        version: RUNTIME_VERSION,
        root,
        startedAt: runtime.startedAt,
      });
      // local single-user poc: the manager and tests read this to connect.
      // mvp moves token custody to the os keychain (see docs/DECISIONS.md).
      writeJson(path.join(root, "admin.token"), { token: runtime.adminToken }, { mode: 0o600 });
      log.info(`api listening on 127.0.0.1:${runtime.port}`, { root });
    }

    return runtime;
  }

  async stop(): Promise<void> {
    this.scheduler?.stop();
    if (this.launcher) await this.launcher.stopAll("runtime shutdown");
    this.events.stop();
    if (this.api) await this.api.close();
    this.repo.db.close();
  }

  // ---- api surface ----

  status(): RuntimeStatus {
    const browsers = this.launcher?.browsers ?? [];
    return {
      version: RUNTIME_VERSION,
      root: this.root,
      port: this.port,
      pid: process.pid,
      startedAt: this.startedAt,
      browsers,
      defaultBrowser: browsers[0] ?? null,
      identitiesRunning: this.launcher?.runningCount() ?? 0,
      warnings: this.launcher?.warnings ?? [],
    };
  }

  capabilities(): RuntimeCapabilities {
    return {
      enforceable: [...ENFORCED_FIELDS],
      advisory: [...ADVISORY_FIELDS],
      roadmap: [...ROADMAP_FIELDS],
      conditional: { ...CONDITIONAL_ENFORCEMENT },
      reservedMethods: [...RESERVED_METHODS],
    };
  }

  readActivity(identityId: string, limit?: number): ActivityEvent[] {
    // the identity row survives destruction as a tombstone, so this stays
    // readable for destroyed identities by design
    this.identities.mustGetRow(identityId);
    return this.repo.readActivity(identityId, limit ?? 100);
  }

  async launch(id: string): Promise<{ pid: number; cdpEndpoint: string | null }> {
    if (!this.launcher) {
      throw errors.notImplemented('"identity.launch" is day-2 scope; the launcher is not attached in this build');
    }
    return this.launcher.launch(id);
  }

  async suspend(id: string): Promise<void> {
    if (!this.launcher) {
      throw errors.notImplemented('"identity.suspend" is day-2 scope; the launcher is not attached in this build');
    }
    await this.launcher.suspend(id);
  }

  async resume(id: string): Promise<{ pid: number; cdpEndpoint: string | null }> {
    if (!this.launcher) {
      throw errors.notImplemented('"identity.resume" is day-2 scope; the launcher is not attached in this build');
    }
    return this.launcher.resume(id);
  }

  /**
   * manual lifecycle end: run the manifest's onExpiry action now. the
   * scheduler (day 5) reuses this for scheduled expiry.
   */
  async expire(id: string): Promise<void> {
    const row = this.identities.mustGetRow(id);
    if (row.state === "destroyed" || row.state === "destroying") {
      throw errors.invalidState(`identity "${id}" is already ${row.state}`);
    }
    const manifest = this.identities.get(id).manifest;
    if (!manifest) throw errors.invalidState(`identity "${id}" has no manifest`);
    const action = manifest.lifecycle.onExpiry;
    const now = new Date().toISOString();

    this.identities.transition(id, "expiring");
    this.repo.appendActivity(id, "expiring", { action, manual: true }, now);

    // manual expiry is user-confirmed in the ui; no grace period applies
    if (this.launcher) {
      await this.launcher.haltIfRunning(id);
    }
    await this.applyOnExpiry(id, action);
  }

  /** run an onExpiry action; shared by manual expire and the scheduler */
  async applyOnExpiry(id: string, action: "destroy" | "suspend" | "archive"): Promise<void> {
    switch (action) {
      case "destroy":
        await this.destroyIdentity(id, { reason: "expired" });
        break;
      case "suspend":
        this.identities.transition(id, "suspended");
        this.repo.appendActivity(id, "suspended", { via: "expiry" }, new Date().toISOString());
        this.repo.cancelLifecycleJobs(id);
        break;
      case "archive":
        this.identities.transition(id, "archived");
        this.repo.appendActivity(id, "archived", { via: "expiry" }, new Date().toISOString());
        this.repo.cancelLifecycleJobs(id);
        break;
    }
  }

  destroyIdentity(id: string, opts?: { reason?: string }): Promise<DestructionReport> {
    // ensure the identity exists before entering the contract
    this.identities.mustGetRow(id);
    return this.destroyer.destroy(id, opts);
  }
}

/**
 * one-release migration for the mortal systems rename: an existing
 * ~/.liminal root moves to ~/.mortal (identities and their spaces survive),
 * a liminal.db inside any root becomes mortal.db (wal/shm sidecars included),
 * and stale pre-rename companion configs are removed — the launcher stamps
 * fresh mortal.identity.json files on the next launch.
 */
function migrateLegacyArtifacts(root: string): void {
  const legacyDefault = path.join(os.homedir(), ".liminal");
  const newDefault = path.join(os.homedir(), ".mortal");
  if (root === newDefault && fs.existsSync(legacyDefault) && !fs.existsSync(newDefault)) {
    fs.renameSync(legacyDefault, newDefault);
    log.info("migrated runtime root ~/.liminal -> ~/.mortal (identities preserved)");
  }
  if (!fs.existsSync(root)) return;
  for (const suffix of ["", "-wal", "-shm"]) {
    const oldDb = path.join(root, `liminal.db${suffix}`);
    const newDb = path.join(root, `mortal.db${suffix}`);
    if (fs.existsSync(oldDb) && !fs.existsSync(newDb)) {
      fs.renameSync(oldDb, newDb);
      if (suffix === "") log.info("migrated liminal.db -> mortal.db");
    }
  }
  const instances = path.join(root, "companion-instances");
  if (fs.existsSync(instances)) {
    for (const entry of fs.readdirSync(instances)) {
      const stale = path.join(instances, entry, "liminal.identity.json");
      try {
        if (fs.existsSync(stale)) fs.rmSync(stale, { force: true });
      } catch {}
    }
  }
}
