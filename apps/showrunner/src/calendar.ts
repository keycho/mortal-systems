import type { CastMember } from "./cast.js";

/**
 * the spawn calendar and the timezone stagger (wall spec section 7).
 * everything here is a pure function of a Date so the whole calendar is
 * testable without clocks: ashes spawn monday and thursday at peak hour so
 * deaths land while people watch; marlowe publishes sundays; the rotating
 * slot arrives on the first of the month; sleep windows follow each
 * agent's local time so the wall is never all asleep.
 */

/** utc hour when ash spawns land (18:00 utc: evening europe, midday us) */
export const ASH_SPAWN_HOUR_UTC = 18;
export const ASH_SPAWN_DAYS_UTC: readonly number[] = [1, 4]; // mon, thu

export function isAshSpawnSlot(now: Date): boolean {
  return (
    ASH_SPAWN_DAYS_UTC.includes(now.getUTCDay()) && now.getUTCHours() === ASH_SPAWN_HOUR_UTC
  );
}

export function nextAshSpawn(after: Date): Date {
  const candidate = new Date(after.getTime());
  candidate.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 24 * 8; i++) {
    candidate.setUTCHours(candidate.getUTCHours() + 1);
    if (isAshSpawnSlot(candidate)) return candidate;
  }
  throw new Error("unreachable: no ash slot inside 8 days");
}

/** marlowe publishes sundays (his local time) */
export function isPublishDay(member: CastMember, now: Date): boolean {
  if (member.agent_id === "ag_marlowe") return localDay(member.tz, now) === 0;
  // default cadence for other writers: any day
  return true;
}

/** the rotating slot arrives on the 1st of the month */
export function isRotatingSlotArrival(now: Date): boolean {
  return now.getUTCDate() === 1;
}

/** sleep window: 01:00 to 07:00 in the agent's local time. members with no
 * timezone (short-lived ashes, vesper) never sleep. */
export function isAsleep(member: CastMember, now: Date): boolean {
  if (!member.tz) return false;
  const hour = localHour(member.tz, now);
  return hour >= 1 && hour < 7;
}

export function localHour(tz: string, now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(now)
  );
}

export function localDay(tz: string | null, now: Date): number {
  if (!tz) return now.getUTCDay();
  const name = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: tz }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}
