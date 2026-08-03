import { identityManifestSchema } from "@liminal/schema";
import { canTransition } from "../identity/state.js";
import { log } from "../util/log.js";
import type { LiminalRuntime } from "../runtime.js";

/**
 * lifecycle enforcement, three points exactly as specified:
 *
 * 1. live tick: while the runtime runs, a loop checks lifecycle_jobs every
 *    15s (configurable for tests); due jobs fire.
 * 2. startup catch-up: on every start, any identity whose expires_at is in
 *    the past and whose onExpiry action has not yet been honored is
 *    transitioned immediately and logged as expired_late. missed expiry is
 *    honored late, never skipped.
 * 3. the companion countdown/warnings are ux only; enforcement lives here.
 *
 * expiry with the browser open: a grace notice goes out over sse, the
 * browser gets graceSeconds (default 60) to wind down, then the process tree
 * is terminated and the onExpiry action proceeds.
 */

export interface SchedulerOptions {
  /** default 15000; LIMINAL_TICK_MS overrides; tests pass small values */
  tickMs?: number;
  /** default 60; LIMINAL_GRACE_SECONDS overrides */
  graceSeconds?: number;
}

type ExpiryAction = "destroy" | "suspend" | "archive";

export class Scheduler {
  private readonly runtime: LiminalRuntime;
  private readonly tickMs: number;
  private readonly graceMs: number;
  private timer: NodeJS.Timeout | null = null;
  private readonly inFlight = new Set<string>();

  constructor(runtime: LiminalRuntime, opts: SchedulerOptions = {}) {
    this.runtime = runtime;
    this.tickMs = opts.tickMs ?? Number(process.env.LIMINAL_TICK_MS ?? 15_000);
    this.graceMs = (opts.graceSeconds ?? Number(process.env.LIMINAL_GRACE_SECONDS ?? 60)) * 1_000;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.tickMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** point 2: honor everything that expired while the runtime was not running */
  async catchUp(): Promise<void> {
    const nowIso = new Date().toISOString();
    for (const row of this.runtime.repo.listIdentities()) {
      if (row.state === "destroyed" || row.state === "destroying") continue;
      if (row.expires_at === null || row.expires_at > nowIso) continue;

      let action: ExpiryAction;
      try {
        action = identityManifestSchema.parse(JSON.parse(row.manifest_json)).lifecycle.onExpiry;
      } catch {
        continue;
      }
      // skip identities whose action was already honored in a previous run
      if (action === "suspend" && (row.state === "suspended" || row.state === "archived")) continue;
      if (action === "archive" && row.state === "archived") continue;

      log.warn(`catch-up: ${row.id} expired at ${row.expires_at} while the runtime was stopped`);
      this.runtime.repo.appendActivity(
        row.id,
        "expired_late",
        { expiresAt: row.expires_at, action },
        new Date().toISOString()
      );
      // catch-up is immediate: the browser cannot be open for an identity
      // whose runtime was down, so no grace period applies
      await this.fire(row.id, action, { grace: false, via: "catch-up" });
    }
    // tidy any due jobs that the actions above superseded
    for (const job of this.runtime.repo.duePendingJobs(new Date().toISOString())) {
      const row = this.runtime.repo.getIdentity(job.identity_id);
      if (!row || row.state === "destroyed" || row.state === "suspended" || row.state === "archived") {
        this.runtime.repo.markJobFired(job.id);
      }
    }
  }

  /** point 1: fire due jobs */
  private async tick(): Promise<void> {
    const due = this.runtime.repo.duePendingJobs(new Date().toISOString());
    for (const job of due) {
      this.runtime.repo.markJobFired(job.id);
      const action = job.action as ExpiryAction;
      await this.fire(job.identity_id, action, { grace: true, via: "scheduled" });
    }
  }

  private async fire(
    identityId: string,
    action: ExpiryAction,
    opts: { grace: boolean; via: "scheduled" | "catch-up" }
  ): Promise<void> {
    if (this.inFlight.has(identityId)) return;
    this.inFlight.add(identityId);
    try {
      const row = this.runtime.repo.getIdentity(identityId);
      if (!row || row.state === "destroyed" || row.state === "destroying") return;

      if (canTransition(row.state, "expiring")) {
        this.runtime.identities.transition(identityId, "expiring");
      }
      this.runtime.repo.appendActivity(
        identityId,
        "expiring",
        { action, via: opts.via },
        new Date().toISOString()
      );

      // grace: only when a supervised browser is actually open
      const running =
        this.runtime.launcher !== null &&
        this.runtime.launcher.cdpEndpointFor(identityId) !== null;
      if (opts.grace && running && this.graceMs > 0) {
        this.runtime.events.pushGrace(
          identityId,
          `space closing in ${Math.round(this.graceMs / 1000)}s. unsaved in-page work will be lost.`
        );
        await new Promise((r) => setTimeout(r, this.graceMs));
      }
      if (this.runtime.launcher) {
        await this.runtime.launcher.haltIfRunning(identityId);
      }

      await this.runtime.applyOnExpiry(identityId, action);
    } catch (err) {
      log.error(`expiry of ${identityId} failed`, {
        message: err instanceof Error ? err.message : String(err),
      });
      this.runtime.repo.appendActivity(
        identityId,
        "error",
        { message: `expiry failed: ${err instanceof Error ? err.message : String(err)}` },
        new Date().toISOString()
      );
    } finally {
      this.inFlight.delete(identityId);
    }
  }
}
