import type { IdentityState } from "@liminal/schema";
import type { Repo } from "../store/repo.js";

/**
 * per-identity event stream for the companion (sse transport lives in
 * self.ts). emits:
 *   tick     every second: state + remaining lifetime
 *   warning  once when crossing t-10m and t-1m before expiry
 *   state    on explicit state transitions (best effort; ticks carry state too)
 *   grace    when expiry wants the browser closed (day-5 scheduler emits this)
 */

export interface SelfEvent {
  type: "tick" | "warning" | "state" | "grace";
  identityId: string;
  state: IdentityState;
  expiresAt: string | null;
  remainingMs: number | null;
  message?: string;
}

interface Subscriber {
  identityId: string;
  push: (event: SelfEvent) => void;
  lastRemainingMs: number | null;
}

const WARNINGS: Array<{ thresholdMs: number; message: string }> = [
  {
    thresholdMs: 10 * 60_000,
    message: "space closing in 10 minutes. unsaved in-page work will be lost at expiry.",
  },
  { thresholdMs: 60_000, message: "space closing in 1 minute." },
];

export class EventBus {
  private readonly repo: Repo;
  private readonly subscribers = new Set<Subscriber>();
  private timer: NodeJS.Timeout | null = null;

  constructor(repo: Repo) {
    this.repo = repo;
  }

  startTicking(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1_000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.subscribers.clear();
  }

  subscribe(identityId: string, push: (event: SelfEvent) => void): () => void {
    const sub: Subscriber = { identityId, push, lastRemainingMs: null };
    this.subscribers.add(sub);
    return () => this.subscribers.delete(sub);
  }

  /** explicit state-change signal from the identity service */
  pushState(identityId: string, state: IdentityState): void {
    for (const sub of this.subscribers) {
      if (sub.identityId !== identityId) continue;
      const row = this.repo.getIdentity(identityId);
      sub.push({
        type: "state",
        identityId,
        state,
        expiresAt: row?.expires_at ?? null,
        remainingMs: remainingFrom(row?.expires_at ?? null),
      });
    }
  }

  /** day-5 scheduler signal: the browser closes after the grace period */
  pushGrace(identityId: string, message: string): void {
    for (const sub of this.subscribers) {
      if (sub.identityId !== identityId) continue;
      const row = this.repo.getIdentity(identityId);
      sub.push({
        type: "grace",
        identityId,
        state: (row?.state ?? "expiring") as IdentityState,
        expiresAt: row?.expires_at ?? null,
        remainingMs: remainingFrom(row?.expires_at ?? null),
        message,
      });
    }
  }

  private tick(): void {
    if (this.subscribers.size === 0) return;
    const byIdentity = new Map<string, Subscriber[]>();
    for (const sub of this.subscribers) {
      const list = byIdentity.get(sub.identityId) ?? [];
      list.push(sub);
      byIdentity.set(sub.identityId, list);
    }
    for (const [identityId, subs] of byIdentity) {
      const row = this.repo.getIdentity(identityId);
      if (!row) continue;
      const remainingMs = remainingFrom(row.expires_at);
      const event: SelfEvent = {
        type: "tick",
        identityId,
        state: row.state,
        expiresAt: row.expires_at,
        remainingMs,
      };
      for (const sub of subs) {
        sub.push(event);
        if (remainingMs !== null && sub.lastRemainingMs !== null) {
          for (const warning of WARNINGS) {
            if (sub.lastRemainingMs > warning.thresholdMs && remainingMs <= warning.thresholdMs) {
              sub.push({ ...event, type: "warning", message: warning.message });
            }
          }
        }
        sub.lastRemainingMs = remainingMs;
      }
    }
  }
}

function remainingFrom(expiresAt: string | null): number | null {
  if (expiresAt === null) return null;
  return Math.max(0, Date.parse(expiresAt) - Date.now());
}
