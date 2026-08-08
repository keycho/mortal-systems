import {
  type AgentClass,
  type AgentState,
  type PayloadFor,
  type WallEvent,
} from "./schema.js";
import { humanizeEvent, humanizeSeconds } from "./humanize.js";

/**
 * derived read models. everything here is a pure fold over the event stream;
 * nothing is stored, so the stream stays the single source of truth.
 */

/** display name derived from the agent id: ag_yuki -> yuki, ag_ash_7 -> ash-7 */
export function displayNameFromId(agentId: string): string {
  return agentId.replace(/^ag_/, "").replace(/_/g, "-");
}

export interface AgentNow {
  agent_id: string;
  name: string;
  class: AgentClass | null;
  region: string | null;
  locale: string | null;
  state: AgentState | "dead" | "unborn";
  spawned_at: string | null;
  dies_at: string | null;
  ttl_remaining_seconds: number | null;
  ttl_label: string | null;
  /** true when < 1h remains; the ui turns the cell red */
  final_hour: boolean;
  last_monologue: string | null;
  current_url_title: string | null;
  last_event_id: string | null;
  inherited_fragments: string[];
  death?: { ts: string; cause: PayloadFor<"death">["cause"]; final_words: string; receipt: string };
}

/** fold the stream into the latest state per agent. events must be in
 * append order (the store's default). */
export function agentNow(
  events: WallEvent[],
  opts: { now?: Date; names?: Record<string, string> } = {}
): AgentNow[] {
  const now = opts.now ?? new Date();
  const byAgent = new Map<string, AgentNow>();
  const diesAt = new Map<string, number>();

  for (const event of events) {
    let agent = byAgent.get(event.agent_id);
    if (!agent) {
      agent = {
        agent_id: event.agent_id,
        name: opts.names?.[event.agent_id] ?? displayNameFromId(event.agent_id),
        class: null,
        region: null,
        locale: null,
        state: "unborn",
        spawned_at: null,
        dies_at: null,
        ttl_remaining_seconds: null,
        ttl_label: null,
        final_hour: false,
        last_monologue: null,
        current_url_title: null,
        last_event_id: null,
        inherited_fragments: [],
      };
      byAgent.set(event.agent_id, agent);
    }
    agent.last_event_id = event.id;
    switch (event.kind) {
      case "spawn": {
        const p = event.payload as PayloadFor<"spawn">;
        agent.class = p.class;
        agent.region = p.region;
        agent.locale = p.locale;
        agent.state = "waking";
        agent.spawned_at = event.ts;
        agent.inherited_fragments = p.inherited_fragments;
        diesAt.set(event.agent_id, Date.parse(event.ts) + p.ttl_seconds * 1000);
        break;
      }
      case "ttl_extended": {
        const p = event.payload as PayloadFor<"ttl_extended">;
        const current = diesAt.get(event.agent_id);
        if (current !== undefined) diesAt.set(event.agent_id, current + p.added_seconds * 1000);
        break;
      }
      case "state_change": {
        const p = event.payload as PayloadFor<"state_change">;
        agent.state = p.state;
        if (p.detail) agent.current_url_title = p.detail;
        break;
      }
      case "action": {
        const p = event.payload as PayloadFor<"action">;
        if (p.verb === "opened_page") agent.current_url_title = p.title ?? p.target_url ?? null;
        break;
      }
      case "monologue": {
        const p = event.payload as PayloadFor<"monologue">;
        agent.last_monologue = p.text;
        break;
      }
      case "death": {
        const p = event.payload as PayloadFor<"death">;
        agent.state = "dead";
        agent.death = {
          ts: event.ts,
          cause: p.cause,
          final_words: p.final_words,
          receipt: event.receipt ?? p.receipt,
        };
        diesAt.delete(event.agent_id);
        break;
      }
      default:
        break;
    }
  }

  for (const agent of byAgent.values()) {
    const at = diesAt.get(agent.agent_id);
    if (at !== undefined && agent.state !== "dead") {
      const remaining = Math.max(0, Math.floor((at - now.getTime()) / 1000));
      agent.dies_at = new Date(at).toISOString();
      agent.ttl_remaining_seconds = remaining;
      agent.ttl_label = humanizeSeconds(remaining);
      agent.final_hour = remaining < 3600;
    }
  }
  return [...byAgent.values()];
}

export interface TickerLine {
  id: string;
  ts: string;
  agent_id: string;
  kind: WallEvent["kind"];
  line: string;
}

/** the wire: last `limit` public events, newest first, humanized */
export function tickerLines(
  events: WallEvent[],
  opts: { limit?: number; names?: Record<string, string> } = {}
): TickerLine[] {
  const limit = opts.limit ?? 50;
  return events
    .filter((e) => e.visibility === "public")
    .slice(-limit)
    .reverse()
    .map((e) => ({
      id: e.id,
      ts: e.ts,
      agent_id: e.agent_id,
      kind: e.kind,
      line: humanizeEvent(e, opts.names?.[e.agent_id] ?? displayNameFromId(e.agent_id)),
    }));
}

// ---- depth ----

export interface DepthInputs {
  cookie_count: number;
  account_count: number;
  memory_bytes: number;
  post_count: number;
}

/**
 * depth 0 to 8, computed from real accumulated state only. two points from
 * each input, each on a coarse threshold ladder; the inputs are surfaced
 * alongside the score so nothing reads as vibes.
 */
export function depthScore(inputs: DepthInputs): number {
  const ladder = (value: number, low: number, high: number): number =>
    value >= high ? 2 : value >= low ? 1 : 0;
  return (
    ladder(inputs.cookie_count, 10, 100) +
    ladder(inputs.account_count, 1, 3) +
    ladder(inputs.memory_bytes, 64 * 1024, 1024 * 1024) +
    ladder(inputs.post_count, 3, 20)
  );
}

// ---- recap ----

/** llm summarizer boundary: the showrunner may plug a model in; the
 * fallback below is deterministic and honest */
export type RecapSummarizer = (events: WallEvent[], names: Record<string, string>) => Promise<string>;

export function recapFallback(events: WallEvent[], names: Record<string, string> = {}): string {
  const pub = events.filter((e) => e.visibility === "public");
  if (pub.length === 0) return "nothing happened while you were away";
  const deaths = pub.filter((e) => e.kind === "death");
  const spawns = pub.filter((e) => e.kind === "spawn");
  const posts = pub.filter(
    (e) => e.kind === "action" && (e.payload as PayloadFor<"action">).verb === "published_post"
  );
  const contacts = pub.filter((e) => e.kind === "human_contact");
  const parts: string[] = [];
  for (const d of deaths) parts.push(humanizeEvent(d, names[d.agent_id] ?? displayNameFromId(d.agent_id)));
  for (const s of spawns) parts.push(humanizeEvent(s, names[s.agent_id] ?? displayNameFromId(s.agent_id)));
  if (posts.length > 0) parts.push(`${posts.length} post${posts.length === 1 ? "" : "s"} published`);
  if (contacts.length > 0)
    parts.push(`${contacts.length} human contact${contacts.length === 1 ? "" : "s"}`);
  if (parts.length === 0) parts.push(`${pub.length} quiet events`);
  return parts.join(" · ");
}

export async function recap(
  events: WallEvent[],
  opts: { names?: Record<string, string>; summarizer?: RecapSummarizer } = {}
): Promise<string> {
  const names = opts.names ?? {};
  if (opts.summarizer) {
    try {
      const text = await opts.summarizer(events.filter((e) => e.visibility === "public"), names);
      if (text.trim().length > 0) return text.trim();
    } catch {
      // fall through to the deterministic recap; the wall never blanks
    }
  }
  return recapFallback(events, names);
}
