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
  /** a short english reading of last_monologue, when the identity does
   * not think in english. shown under the line, never instead of it. */
  last_monologue_gloss?: string | null;
  last_narration: string | null;
  /** same contract as last_monologue_gloss, for the narration */
  last_narration_gloss?: string | null;
  /** the page the latest narration says it is about, when it says so */
  last_narration_about?: string | null;
  /** surface B's NOW line: what the agent is doing and why, one
   * sentence, folded from state, the open page and the latest thought
   * (narration or monologue, whichever spoke last). an intent, not a
   * status word. */
  now_line: string | null;
  /** english reading of the thought inside now_line, when it has one */
  now_gloss?: string | null;
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
  // the latest thought of either kind, for the NOW line: a fresh
  // monologue outranks an old narration and the other way round
  const lastThought = new Map<string, { text: string; gloss: string | null }>();

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
        last_monologue_gloss: null,
        last_narration: null,
        last_narration_gloss: null,
        last_narration_about: null,
        now_line: null,
        now_gloss: null,
        current_url_title: null,
        last_event_id: null,
        inherited_fragments: [],
      };
      byAgent.set(event.agent_id, agent);
    }
    // death is the last word in every projection: an event appended
    // after a death (a dangling async act, a crash-timing artifact)
    // must never fold a dead agent back to life. the stream is
    // append-only and cannot be repaired, so the read model refuses
    // the resurrection instead.
    if (agent.state === "dead") continue;
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
        agent.last_monologue_gloss = p.gloss ?? null;
        lastThought.set(event.agent_id, { text: p.text, gloss: p.gloss ?? null });
        break;
      }
      case "narration": {
        const p = event.payload as PayloadFor<"narration">;
        agent.last_narration = p.text;
        agent.last_narration_gloss = p.gloss ?? null;
        agent.last_narration_about = p.about_url ?? null;
        lastThought.set(event.agent_id, { text: p.text, gloss: p.gloss ?? null });
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
    const derived = nowLine(agent, lastThought.get(agent.agent_id) ?? null);
    agent.now_line = derived.line;
    agent.now_gloss = derived.gloss;
  }
  return [...byAgent.values()];
}

/**
 * the NOW derivation, pure in (folded agent, latest thought): the doing
 * half comes from state and the open page, the why half is the latest
 * narration or monologue. joined with a period, lowercase, one line;
 * either half stands alone when the other is missing.
 */
export function nowLine(
  agent: Pick<AgentNow, "state" | "current_url_title">,
  thought: { text: string; gloss: string | null } | null
): { line: string | null; gloss: string | null } {
  if (agent.state === "dead" || agent.state === "unborn") return { line: null, gloss: null };
  const page = agent.current_url_title;
  const doing =
    agent.state === "reading" && page
      ? `reading ${page}`
      : agent.state === "writing" && page
        ? `writing, ${page}`
        : agent.state === "replying" && page
          ? `replying, ${page}`
          : agent.state;
  if (!thought) return { line: doing, gloss: null };
  return { line: `${doing}. ${thought.text}`, gloss: thought.gloss };
}

// ---- surface B: the reasoning panel's projection ----

/** the panel's four tags: a projection of existing event kinds computed
 * here in the read model, never a field on the events themselves */
export const PANEL_TAGS = ["READ", "WENT", "THOUGHT", "WROTE"] as const;
export type PanelTag = (typeof PANEL_TAGS)[number];

/**
 * which tag an event renders under, or null for events the panel does
 * not show. READ is an external read; WENT is movement, a page inside
 * the world or a navigation detour landing; THOUGHT is the agent's
 * voice; WROTE is a post or a comment reply.
 */
export function tagFor(event: WallEvent): PanelTag | null {
  switch (event.kind) {
    case "monologue":
    case "narration":
      return "THOUGHT";
    case "action": {
      const p = event.payload as PayloadFor<"action">;
      switch (p.verb) {
        case "opened_page":
          // the humanizer's own test for an external read; anything else
          // (a world page, a detour landing) is movement
          return p.target_url && /^https?:\/\//i.test(p.target_url) ? "READ" : "WENT";
        case "published_post":
        case "left_comment":
          return "WROTE";
        default:
          return null;
      }
    }
    case "state_change": {
      // arriving on a page as a state: reading with the page named
      const p = event.payload as PayloadFor<"state_change">;
      return p.state === "reading" && p.detail ? "WENT" : null;
    }
    default:
      return null;
  }
}

export interface PanelEntry {
  id: string;
  ts: string;
  tag: PanelTag;
  /** the object of the line: the page, the thought, the piece. the
   * panel belongs to one agent, so no name prefix here. */
  text: string;
  /** english reading under a THOUGHT that is not in english */
  gloss?: string;
  /** the page a narration line says it is about */
  about_url?: string;
}

/** the panel's stream for one agent: public events only, tagged lines
 * only, newest first, capped */
export function panelEntries(
  events: WallEvent[],
  agentId: string,
  opts: { limit?: number } = {}
): PanelEntry[] {
  const limit = opts.limit ?? 60;
  const entries: PanelEntry[] = [];
  for (let i = events.length - 1; i >= 0 && entries.length < limit; i--) {
    const event = events[i] as WallEvent;
    if (event.agent_id !== agentId || event.visibility !== "public") continue;
    const tag = tagFor(event);
    if (!tag) continue;
    entries.push({ id: event.id, ts: event.ts, tag, ...panelText(event) });
  }
  return entries;
}

function panelText(event: WallEvent): { text: string; gloss?: string; about_url?: string } {
  switch (event.kind) {
    case "monologue": {
      const p = event.payload as PayloadFor<"monologue">;
      return { text: p.text, ...(p.gloss ? { gloss: p.gloss } : {}) };
    }
    case "narration": {
      const p = event.payload as PayloadFor<"narration">;
      return {
        text: p.text,
        ...(p.gloss ? { gloss: p.gloss } : {}),
        ...(p.about_url ? { about_url: p.about_url } : {}),
      };
    }
    case "action": {
      const p = event.payload as PayloadFor<"action">;
      if (p.verb === "published_post")
        return { text: p.title ? `published "${p.title}"` : "published a post" };
      if (p.verb === "left_comment")
        return { text: p.target_agent ? `a reply, for ${p.target_agent}` : "a reply" };
      return { text: p.title ?? p.target_url ?? "a page" };
    }
    case "state_change": {
      const p = event.payload as PayloadFor<"state_change">;
      return { text: p.detail ?? p.state };
    }
    default:
      return { text: event.kind };
  }
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

// ---- wall stats ----

/** per-agent slice of the running figures, for the gate's corner chips
 * and each identity's declared work (published and human_contacts are
 * what the work counters count) */
export interface AgentStats {
  pages_read: number;
  thoughts_today: number;
  published: number;
  human_contacts: number;
}

/**
 * the plate-border figures: every number the corner chips print. counted
 * from the same public stream every other surface renders from, so the
 * chips can never disagree with the wall. a "page read" is an opened_page
 * action; a "thought" is a monologue or a narration; "destroyed to date"
 * is the death count. thoughts_today resets at utc midnight (the wall's
 * clock chip is utc, so the day boundary is the one the viewer can see).
 */
export interface WallStats {
  destroyed: number;
  pages_read: number;
  thoughts: number;
  by_agent: Record<string, AgentStats>;
}

export function wallStats(events: WallEvent[], opts: { todayStart?: string } = {}): WallStats {
  const todayStart = opts.todayStart ?? `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const stats: WallStats = { destroyed: 0, pages_read: 0, thoughts: 0, by_agent: {} };
  const agent = (id: string): AgentStats =>
    (stats.by_agent[id] ??= {
      pages_read: 0,
      thoughts_today: 0,
      published: 0,
      human_contacts: 0,
    });
  for (const event of events) {
    if (event.visibility !== "public") continue;
    switch (event.kind) {
      case "death":
        stats.destroyed += 1;
        break;
      case "action": {
        const verb = (event.payload as PayloadFor<"action">).verb;
        if (verb === "opened_page") {
          stats.pages_read += 1;
          agent(event.agent_id).pages_read += 1;
        } else if (verb === "published_post") {
          agent(event.agent_id).published += 1;
        }
        break;
      }
      case "human_contact":
        agent(event.agent_id).human_contacts += 1;
        break;
      case "monologue":
      case "narration": {
        stats.thoughts += 1;
        if (event.ts >= todayStart) agent(event.agent_id).thoughts_today += 1;
        break;
      }
      default:
        break;
    }
  }
  return stats;
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
