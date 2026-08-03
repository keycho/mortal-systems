import {
  composeManifest,
  DESTROY_STEPS,
  DESTROY_STEP_LABELS,
  DESTRUCTION_CAVEATS,
  DurationError,
  generateIdentityId,
  manifestInputFromBlueprint,
  parseLifetimeMs,
  type BlueprintManifest,
  type DestructionReport,
  type IdentityManifest,
  type IdentityState,
} from "@mortal/schema";
import { ZodError } from "zod";

/**
 * the simulator's state machine. pure functions, react-free, fully covered by
 * unit tests. everything semantic is imported from @mortal/schema — the
 * duration grammar, the manifest shape, the state names, the destroy steps
 * and caveats — so the simulation can never drift from the product.
 *
 * simulation only: no runtime, no network, no persistence. the labeling
 * contract lives in the components.
 */

export interface SimEvent {
  at: string;
  event: string;
  detail?: string;
}

export interface SimIdentity {
  manifest: IdentityManifest;
  state: IdentityState;
  /** null iff persistent */
  expiresAtMs: number | null;
  events: SimEvent[];
  notes: string;
  report: DestructionReport | null;
  spaceNumber: number;
}

export type CreateResult = { ok: true; identity: SimIdentity } | { ok: false; error: string };

let simSpaceCounter = 0;

export function nextSpaceNumber(): number {
  simSpaceCounter += 1;
  return simSpaceCounter;
}

/** reset for tests */
export function resetSpaceNumbers(): void {
  simSpaceCounter = 0;
}

function seedIdentity(manifest: IdentityManifest, now: number): SimIdentity {
  const lifetimeMs = parseLifetimeMs(manifest.lifecycle.lifetime);
  return {
    manifest,
    state: "created",
    expiresAtMs: lifetimeMs === null ? null : now + lifetimeMs,
    events: [
      { at: new Date(now).toISOString(), event: "created", detail: manifest.lifecycle.lifetime },
      ...(lifetimeMs !== null
        ? [
            {
              at: new Date(now).toISOString(),
              event: "expiry_scheduled",
              detail: `destroy at t+${manifest.lifecycle.lifetime}`,
            },
          ]
        : []),
    ],
    notes: "",
    report: null,
    spaceNumber: nextSpaceNumber(),
  };
}

/** create from scratch: the REAL grammar and manifest schema validate the input */
export function createSimIdentity(
  input: { name: string; color: string; lifetime: string },
  now: number
): CreateResult {
  try {
    const manifest = composeManifest({
      id: generateIdentityId(),
      name: input.name.trim(),
      createdAt: new Date(now).toISOString(),
      color: input.color,
      lifetime: input.lifetime.trim(),
    });
    return { ok: true, identity: seedIdentity(manifest, now) };
  } catch (err) {
    if (err instanceof DurationError) return { ok: false, error: err.message };
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return { ok: false, error: `${first?.path.join(".") ?? "manifest"}: ${first?.message ?? "invalid"}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** install a real first-party blueprint through the real mapping helpers */
export function createFromBlueprint(
  blueprint: BlueprintManifest,
  opts: { lifetime?: string; consentedExtensionIds?: string[] },
  now: number
): CreateResult {
  try {
    const manifest = composeManifest(
      manifestInputFromBlueprint(blueprint, {
        id: generateIdentityId(),
        createdAt: new Date(now).toISOString(),
        source: `simulation:${blueprint.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        signature: null,
        overrides: {
          lifetime: opts.lifetime,
          consentedExtensionIds: opts.consentedExtensionIds,
        },
      })
    );
    return { ok: true, identity: seedIdentity(manifest, now) };
  } catch (err) {
    if (err instanceof DurationError) return { ok: false, error: err.message };
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return { ok: false, error: `${first?.path.join(".") ?? "manifest"}: ${first?.message ?? "invalid"}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** the launch arc mirrors the real lifecycle states with honest labels */
export const LAUNCH_SEQUENCE: ReadonlyArray<{ state: IdentityState; ms: number }> = [
  { state: "provisioning", ms: 800 },
  { state: "ready", ms: 500 },
  { state: "running", ms: 0 },
];

export function withState(sim: SimIdentity, state: IdentityState, now: number, detail?: string): SimIdentity {
  return {
    ...sim,
    state,
    events: [...sim.events, { at: new Date(now).toISOString(), event: state, detail }],
  };
}

export function appendEvent(sim: SimIdentity, event: string, now: number, detail?: string): SimIdentity {
  return { ...sim, events: [...sim.events, { at: new Date(now).toISOString(), event, detail }] };
}

export function remainingMs(sim: SimIdentity, now: number): number | null {
  if (sim.expiresAtMs === null) return null;
  return Math.max(0, sim.expiresAtMs - now);
}

/**
 * the destruction report, in the REAL DestructionReport shape: every D-step
 * from the schema, the fixed caveats, honest simulated details.
 */
export function buildDestructionReport(sim: SimIdentity, startedMs: number, completedMs: number): DestructionReport {
  return {
    identityId: sim.manifest.id,
    startedAt: new Date(startedMs).toISOString(),
    completedAt: new Date(completedMs).toISOString(),
    resumed: false,
    steps: DESTROY_STEPS.map((step) => ({
      step,
      ok: true,
      detail: `${DESTROY_STEP_LABELS[step]} (simulated)`,
    })),
    caveats: [...DESTRUCTION_CAVEATS],
  };
}
