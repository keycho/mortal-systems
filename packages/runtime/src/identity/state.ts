import type { IdentityState } from "@liminal/schema";
import { errors } from "../errors.js";

/**
 * the identity lifecycle state machine. transitions not listed here are
 * invalid and refused with INVALID_STATE — this is what makes "fence: refuse
 * launch/resume while destroying" a property rather than an if-statement.
 */
const TRANSITIONS: Record<IdentityState, readonly IdentityState[]> = {
  created: ["provisioning", "expiring", "destroying"],
  provisioning: ["ready", "created", "destroying"],
  ready: ["running", "suspended", "expiring", "archived", "destroying"],
  running: ["ready", "suspended", "expiring", "destroying"],
  suspended: ["running", "expiring", "archived", "destroying"],
  expiring: ["suspended", "archived", "destroying"],
  destroying: ["destroyed"],
  destroyed: [],
  archived: ["destroying"],
};

export function canTransition(from: IdentityState, to: IdentityState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(id: string, from: IdentityState, to: IdentityState): void {
  if (from === to) return;
  if (!canTransition(from, to)) {
    throw errors.invalidState(`identity "${id}" cannot go ${from} -> ${to}`);
  }
}

/** states in which a chromium process may exist for the identity */
export const LIVE_STATES: readonly IdentityState[] = ["running", "expiring"];

/** states from which launch/resume is permitted */
export const LAUNCHABLE_STATES: readonly IdentityState[] = ["created", "ready", "suspended"];
