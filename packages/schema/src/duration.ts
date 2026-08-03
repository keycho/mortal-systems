import { z } from "zod";

/**
 * lifetime grammar.
 *
 * a lifetime is either the literal "persistent" or `<positive integer><unit>`
 * where unit is one of s|m|h|d. examples: "30m", "5m", "12h", "7d", "60s".
 * bounds: 30 seconds to 365 days. no compound forms ("1h30m" is invalid).
 */

export const PERSISTENT = "persistent" as const;

const DURATION_RE = /^([1-9]\d{0,5})(s|m|h|d)$/;

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export const MIN_LIFETIME_MS = 30_000;
export const MAX_LIFETIME_MS = 365 * 86_400_000;

export class DurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DurationError";
  }
}

/**
 * parse a lifetime into milliseconds. returns null for "persistent".
 * throws DurationError on anything else invalid.
 */
export function parseLifetimeMs(lifetime: string): number | null {
  if (lifetime === PERSISTENT) return null;
  const m = DURATION_RE.exec(lifetime);
  if (!m) {
    throw new DurationError(
      `invalid lifetime "${lifetime}": expected "persistent" or <integer><s|m|h|d>, e.g. "30m", "12h", "7d"`
    );
  }
  const count = Number(m[1]);
  const unit = m[2] as string;
  const ms = count * (UNIT_MS[unit] as number);
  if (ms < MIN_LIFETIME_MS) {
    throw new DurationError(`lifetime "${lifetime}" is below the 30s minimum`);
  }
  if (ms > MAX_LIFETIME_MS) {
    throw new DurationError(`lifetime "${lifetime}" exceeds the 365d maximum`);
  }
  return ms;
}

export function isValidLifetime(value: string): boolean {
  try {
    parseLifetimeMs(value);
    return true;
  } catch {
    return false;
  }
}

/** zod schema for the lifetime grammar, reusable in manifests and blueprints */
export const lifetimeSchema = z.string().superRefine((value, ctx) => {
  try {
    parseLifetimeMs(value);
  } catch (err) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: err instanceof Error ? err.message : "invalid lifetime",
    });
  }
});

/**
 * compute the expiry instant for a lifetime starting at createdAt.
 * returns null iff the lifetime is persistent.
 */
export function computeExpiresAt(createdAtIso: string, lifetime: string): string | null {
  const ms = parseLifetimeMs(lifetime);
  if (ms === null) return null;
  const created = Date.parse(createdAtIso);
  if (Number.isNaN(created)) {
    throw new DurationError(`invalid createdAt datetime "${createdAtIso}"`);
  }
  return new Date(created + ms).toISOString();
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * format a remaining-time value for countdown display.
 * "45s" -> "00m 45s" · 5m -> "05m 00s" · 4.3h -> "04h 18m" · 3d -> "03d 00h"
 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "00m 00s";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 3600) {
    return `${pad(Math.floor(totalSeconds / 60))}m ${pad(totalSeconds % 60)}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 1440) {
    return `${pad(Math.floor(totalMinutes / 60))}h ${pad(totalMinutes % 60)}m`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  return `${pad(Math.floor(totalHours / 24))}d ${pad(totalHours % 24)}h`;
}
