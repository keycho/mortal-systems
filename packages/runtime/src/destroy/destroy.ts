import { readEnv } from "../util/env.js";
import {
  DESTRUCTION_CAVEATS,
  type DestroyStep,
  type DestructionReport,
  type DestructionStepResult,
  type Tombstone,
} from "@mortal/schema";
import { errors } from "../errors.js";
import { parseStoredManifest } from "../identity/service.js";
import type { Repo } from "../store/repo.js";
import { assertTransition } from "../identity/state.js";
import { insideRoot } from "../util/paths.js";
import { rmrfWithRetry } from "../util/fsx.js";
import { log } from "../util/log.js";

/**
 * the deletion contract, implemented exactly as documented in
 * docs/deletion-contract.md:
 *
 *   D0 capture   resolve absolute paths; write destroy_journal row
 *   D1 fence     state->destroying; cancel lifecycle jobs; refuse launch/resume
 *   D2 halt      sigterm process tree; sigkill stragglers; verify exit
 *   D3 profile   rm -rf profile dir (retry loop for file locks)
 *   D4 files     rm -rf files root + downloads + companion instance dir
 *   D5 rows      delete ai_messages, notes, bookmarks for the identity
 *   D6 record    identities row -> tombstone {id, name, destroyedAt}
 *   D7 finalize  activity destroyed event with the report; delete journal row
 *
 * ordered: the first failing step aborts the run and leaves the journal in
 * place, so the destruction resumes from that step on the next startup.
 * idempotent: every step is safe to repeat. D7 is deliberately not journaled —
 * it is the step that clears the journal; its completion is observable as the
 * finalized "destroyed" activity event plus the missing journal row.
 *
 * a simulated crash hook (MORTAL_CRASH_AFTER_STEP, test-only) exits the
 * process immediately after the named step is journaled.
 */

/** halts the identity's browser process tree; provided by the launcher (a no-op before day 2 wiring) */
export type HaltFn = (identityId: string) => Promise<{ halted: boolean; detail: string }>;

export interface DestroyPaths extends Record<string, string> {
  profileDir: string;
  filesDir: string;
  downloadsDir: string;
  companionDir: string;
}

export interface DestroyerOptions {
  repo: Repo;
  root: string;
  halt: HaltFn;
  now?: () => string;
  /** test hook: crash (throw/exit) after this step completes and is journaled */
  crashAfterStep?: (step: DestroyStep) => void;
}

interface PlannedStep {
  step: DestroyStep;
  /** D7 clears the journal instead of writing to it */
  journaled: boolean;
  fn: () => Promise<string> | string;
}

export class Destroyer {
  private readonly repo: Repo;
  private readonly root: string;
  private halt: HaltFn;
  private readonly now: () => string;
  private readonly crashAfterStep: (step: DestroyStep) => void;
  private readonly inFlight = new Map<string, Promise<DestructionReport>>();

  constructor(opts: DestroyerOptions) {
    this.repo = opts.repo;
    this.root = opts.root;
    this.halt = opts.halt;
    this.now = opts.now ?? (() => new Date().toISOString());
    this.crashAfterStep =
      opts.crashAfterStep ??
      ((step) => {
        if (readEnv("MORTAL_CRASH_AFTER_STEP") === step) {
          log.error(`MORTAL_CRASH_AFTER_STEP=${step} set — simulating crash now`);
          process.exit(1);
        }
      });
  }

  /** day-2 wiring point: replace the no-op halt with the real launcher halt */
  setHalt(halt: HaltFn): void {
    this.halt = halt;
  }

  /** destroy an identity, or join the destruction already in flight for it */
  destroy(identityId: string, opts?: { reason?: string }): Promise<DestructionReport> {
    const existing = this.inFlight.get(identityId);
    if (existing) return existing;
    const run = this.run(identityId, { reason: opts?.reason, resumed: false }).finally(() => {
      this.inFlight.delete(identityId);
    });
    this.inFlight.set(identityId, run);
    return run;
  }

  /** on startup: resume every journaled destruction from its first incomplete step */
  async resumeAll(): Promise<DestructionReport[]> {
    const journals = this.repo.listDestroyJournals();
    const reports: DestructionReport[] = [];
    for (const journal of journals) {
      log.warn(`resuming interrupted destruction of ${journal.identity_id}`, {
        completed: journal.steps_completed,
      });
      reports.push(await this.run(journal.identity_id, { resumed: true }));
    }
    return reports;
  }

  private async run(
    identityId: string,
    opts: { reason?: string; resumed: boolean }
  ): Promise<DestructionReport> {
    const row = this.repo.getIdentity(identityId);
    if (!row) throw errors.notFound("identity", identityId);

    const journal = this.repo.getDestroyJournal(identityId);
    if (row.state === "destroyed" && !journal) {
      throw errors.invalidState(`identity "${identityId}" is already destroyed`);
    }

    const startedAt = journal?.started_at ?? this.now();
    const completedBefore = new Set<DestroyStep>(journal?.steps_completed ?? []);
    const steps: DestructionStepResult[] = [];

    // D0 captures paths once; resumed runs reuse the journaled paths and never
    // re-derive them (the manifest may already be a tombstone by then)
    let paths: DestroyPaths;
    if (journal) {
      paths = journal.paths_json as DestroyPaths;
    } else {
      const manifest = parseStoredManifest(row.manifest_json);
      paths = {
        profileDir: insideRoot(this.root, manifest.surfaces.browser.profilePath),
        filesDir: insideRoot(this.root, manifest.surfaces.files.root),
        downloadsDir: insideRoot(this.root, `${manifest.surfaces.files.root}/downloads`),
        companionDir: insideRoot(this.root, `companion-instances/${identityId}`),
      };
    }

    const report: DestructionReport = {
      identityId,
      startedAt,
      completedAt: startedAt,
      resumed: opts.resumed,
      steps,
      caveats: [...DESTRUCTION_CAVEATS],
    };

    const plan: PlannedStep[] = [
      {
        step: "D0",
        journaled: true,
        fn: () => {
          this.repo.upsertDestroyJournal(identityId, startedAt, paths);
          if (!opts.resumed) {
            this.repo.appendActivity(
              identityId,
              "destroy_started",
              { reason: opts.reason ?? null },
              this.now()
            );
          }
          return `captured ${Object.keys(paths).length} paths`;
        },
      },
      {
        step: "D1",
        journaled: true,
        fn: () => {
          const current = this.repo.getIdentity(identityId);
          if (!current) throw new Error("identity row vanished");
          if (current.state !== "destroying" && current.state !== "destroyed") {
            assertTransition(identityId, current.state, "destroying");
            this.repo.updateIdentityState(identityId, "destroying");
          }
          const cancelled = this.repo.cancelLifecycleJobs(identityId);
          return `state=destroying, cancelled ${cancelled} pending job(s)`;
        },
      },
      {
        step: "D2",
        journaled: true,
        fn: async () => {
          const { halted, detail } = await this.halt(identityId);
          return halted ? `halted: ${detail}` : detail;
        },
      },
      {
        step: "D3",
        journaled: true,
        fn: async () => {
          const res = await rmrfWithRetry(paths.profileDir);
          if (!res.ok) {
            throw new Error(`profile dir removal failed after ${res.attempts} attempts: ${res.error}`);
          }
          return `removed ${paths.profileDir} (attempt ${res.attempts})`;
        },
      },
      {
        step: "D4",
        journaled: true,
        fn: async () => {
          const results = await Promise.all([
            rmrfWithRetry(paths.filesDir),
            rmrfWithRetry(paths.companionDir),
          ]);
          const failed = results.find((r) => !r.ok);
          if (failed) throw new Error(`files removal failed: ${failed.error}`);
          return `removed ${paths.filesDir} and ${paths.companionDir}`;
        },
      },
      {
        step: "D5",
        journaled: true,
        fn: () => {
          const counts = this.repo.deleteIdentityChildRows(identityId);
          return `deleted rows: ${counts.notes} notes, ${counts.aiMessages} ai messages, ${counts.bookmarks} bookmarks`;
        },
      },
      {
        step: "D6",
        journaled: true,
        fn: () => {
          const current = this.repo.getIdentity(identityId);
          if (!current) throw new Error("identity row vanished");
          if (current.state !== "destroyed") {
            const tombstone: Tombstone = {
              id: identityId,
              name: current.name,
              destroyedAt: this.now(),
            };
            this.repo.tombstoneIdentity(identityId, JSON.stringify(tombstone), tombstone.destroyedAt);
          }
          return "identity row tombstoned";
        },
      },
      {
        step: "D7",
        journaled: false,
        fn: () => {
          const completedAt = this.now();
          const finalized: DestructionReport = {
            ...report,
            completedAt,
            steps: [
              ...steps,
              { step: "D7", ok: true, detail: "activity finalized, journal cleared" },
            ],
          };
          this.repo.appendActivity(
            identityId,
            "destroyed",
            { report: finalized as unknown as Record<string, unknown> },
            completedAt
          );
          this.repo.deleteDestroyJournal(identityId);
          return "activity finalized, journal cleared";
        },
      },
    ];

    let aborted: DestructionStepResult | null = null;
    for (const planned of plan) {
      if (completedBefore.has(planned.step)) {
        steps.push({ step: planned.step, ok: true, detail: "completed before resume (journal)" });
        continue;
      }
      let result: DestructionStepResult;
      try {
        const detail = await planned.fn();
        if (planned.journaled) this.repo.appendDestroyJournalStep(identityId, planned.step);
        this.repo.appendActivity(
          identityId,
          "destroy_step",
          { step: planned.step, ok: true, detail },
          this.now()
        );
        result = { step: planned.step, ok: true, detail };
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        this.repo.appendActivity(
          identityId,
          "destroy_step",
          { step: planned.step, ok: false, detail },
          this.now()
        );
        result = { step: planned.step, ok: false, detail };
      }
      steps.push(result);
      // the crash hook fires after journaling, outside the try/catch, so a
      // simulated crash cannot be mistaken for a step failure
      if (result.ok) this.crashAfterStep(planned.step);
      if (!result.ok) {
        aborted = result;
        break;
      }
    }

    report.completedAt = this.now();

    if (aborted) {
      log.error(`destruction of ${identityId} stopped at ${aborted.step}; journal retained for resume`, {
        detail: aborted.detail,
      });
      this.repo.appendActivity(
        identityId,
        "error",
        {
          message: `destruction stopped at ${aborted.step}; journal retained for resume`,
          step: aborted.step,
          detail: aborted.detail,
        },
        report.completedAt
      );
    }

    return report;
  }
}
