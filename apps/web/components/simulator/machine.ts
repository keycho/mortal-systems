/**
 * the in-page simulator's state machine, pure and timer-free so it can be
 * unit tested. phases: cfg -> prov -> act -> done (+ reset back to cfg).
 * the component owns exactly two timers: one timeout (prov -> act) and one
 * interval (the countdown). semantics are the handoff's, verbatim: the
 * preview runs in seconds; the real default lifetime is 45 minutes.
 */

export type SimPhase = "cfg" | "prov" | "act" | "done";

export interface SimState {
  phase: SimPhase;
  /** countdown seconds remaining while active */
  secondsLeft: number;
  /** what needs its own identity (chip label or typed text) */
  purpose: string;
}

/** the four selectable purposes, in handoff order */
export const SIM_PURPOSES = [
  "agent task",
  "client work",
  "research session",
  "new-user test",
] as const;

/** provisioning takes 2.2s: four lines stagger in at 0.5s intervals */
export const PROVISION_MS = 2200;

/** the preview identity lives ten seconds */
export const ACT_SECONDS = 10;

/** at three seconds left the status flips ACTIVE -> EXPIRING */
export const EXPIRING_AT = 3;

export const PROVISION_LINES = [
  "browser isolated",
  "memory mounted",
  "files partitioned",
  "history removed on expiry",
] as const;

export function initialState(): SimState {
  return { phase: "cfg", secondsLeft: ACT_SECONDS, purpose: SIM_PURPOSES[0] };
}

export function setPurpose(s: SimState, purpose: string): SimState {
  return { ...s, purpose };
}

/** cfg -> prov (the primary cta) */
export function start(s: SimState): SimState {
  return { ...s, phase: "prov" };
}

/** prov -> act, countdown armed */
export function provisioned(s: SimState): SimState {
  return { ...s, phase: "act", secondsLeft: ACT_SECONDS };
}

/** one countdown tick; at zero the identity is destroyed (act -> done) */
export function tick(s: SimState): SimState {
  if (s.phase !== "act") return s;
  if (s.secondsLeft <= 1) return { ...s, phase: "done", secondsLeft: 0 };
  return { ...s, secondsLeft: s.secondsLeft - 1 };
}

/** any phase -> cfg; the component clears both timers when it calls this */
export function reset(s: SimState): SimState {
  return { ...s, phase: "cfg", secondsLeft: ACT_SECONDS };
}

export function isExpiring(s: SimState): boolean {
  return s.phase === "act" && s.secondsLeft <= EXPIRING_AT;
}

export function clock(s: SimState): string {
  return "00:" + String(s.secondsLeft).padStart(2, "0");
}
