import type { AgentNow } from "./read.js";
import type { WallEvent, PayloadFor } from "./schema.js";

/**
 * the director cam's auto-cut and the gate's monologue spotlight. pure
 * functions shared by the watch page and the gate so both screens cut the
 * same way and can be tested without a browser.
 *
 * auto-cut priority:
 *   death imminent > human_contact > enforcement > WRITING > published
 *   > reading > idle
 *
 * writing sits above publishing on purpose. a published post is a thing
 * that already happened and can be read at leisure; an identity composing
 * one is the only moment the wall exists to show, and it is happening
 * now, in a real form, at typing speed. the older order cut away from a
 * draft to feature the announcement of somebody else's finished one.
 */

const STATE_RANK: Record<string, number> = {
  writing: 3,
  replying: 3,
  reading: 2,
  waking: 1,
  idle: 1,
  sleeping: 0,
};

/** an agent at the keyboard outranks a finished post (400) and yields
 * only to enforcement (600), human contact (800) and an imminent death */
export const WRITING_BOOST = 500;

/** recent-event boosts decay after this window */
export const DIRECTOR_EVENT_WINDOW_MS = 5 * 60_000;

export function directorScore(
  agent: AgentNow,
  recentEvents: WallEvent[],
  now: Date = new Date()
): number {
  if (agent.state === "dead" || agent.state === "unborn") return -1;
  // death imminent dominates everything
  if (agent.ttl_remaining_seconds !== null && agent.ttl_remaining_seconds < 3600) {
    return 1000 + Math.max(0, 3600 - agent.ttl_remaining_seconds) / 10;
  }
  // composing, on camera, in the real form: the priority shot
  if (agent.state === "writing") return WRITING_BOOST + (STATE_RANK.writing ?? 0);
  const cutoff = now.getTime() - DIRECTOR_EVENT_WINDOW_MS;
  let boost = 0;
  for (const event of recentEvents) {
    if (event.agent_id !== agent.agent_id) continue;
    if (Date.parse(event.ts) < cutoff) continue;
    if (event.kind === "human_contact") boost = Math.max(boost, 800);
    else if (event.kind === "enforcement") boost = Math.max(boost, 600);
    else if (
      event.kind === "action" &&
      (event.payload as PayloadFor<"action">).verb === "published_post"
    )
      boost = Math.max(boost, 400);
  }
  return boost + (STATE_RANK[agent.state] ?? 0);
}

/** pick the hero agent; pinnedId wins outright (manual override) */
export function directorPick(
  agents: AgentNow[],
  recentEvents: WallEvent[],
  opts: { pinnedId?: string | null; now?: Date } = {}
): AgentNow | null {
  if (opts.pinnedId) {
    const pinned = agents.find((a) => a.agent_id === opts.pinnedId);
    if (pinned) return pinned;
  }
  const now = opts.now ?? new Date();
  let best: AgentNow | null = null;
  let bestScore = -Infinity;
  for (const agent of agents) {
    const score = directorScore(agent, recentEvents, now);
    if (score < 0) continue;
    if (score > bestScore) {
      best = agent;
      bestScore = score;
    }
  }
  return best;
}

export interface Spotlight {
  agent_id: string;
  text: string;
  /** monologue event id, for keying the caption */
  event_id: string;
}

export const SPOTLIGHT_SECONDS = 25;

/**
 * the gate's monologue spotlight: one caption at a time, rotating across
 * agents' latest monologues. deterministic in (events, slot) so every
 * viewer sees the same caption at the same moment.
 */
export function spotlightAt(events: WallEvent[], now: Date = new Date()): Spotlight | null {
  const latest = new Map<string, WallEvent>();
  for (const event of events) {
    if (event.kind !== "monologue" || event.visibility !== "public") continue;
    latest.set(event.agent_id, event);
  }
  const candidates = [...latest.values()].sort((a, b) => (a.agent_id < b.agent_id ? -1 : 1));
  if (candidates.length === 0) return null;
  const slot = Math.floor(now.getTime() / (SPOTLIGHT_SECONDS * 1000));
  const chosen = candidates[slot % candidates.length] as WallEvent;
  return {
    agent_id: chosen.agent_id,
    text: (chosen.payload as PayloadFor<"monologue">).text,
    event_id: chosen.id,
  };
}
