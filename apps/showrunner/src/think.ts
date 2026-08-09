/**
 * the model boundary. one heartbeat = one think() call. the showrunner
 * chooses the tier (model routing is production reality, not fiction) and
 * flags set pieces; agents never see the flag as content, it only routes
 * the call. wiring a real model in means implementing ThinkFn with an llm
 * client on the launcher side; the scripted thinker below is the
 * deterministic dev/test implementation and says nothing it was not given.
 */

export type ThinkTier = "ambient" | "set_piece";

export interface ThinkContext {
  agent_id: string;
  name: string;
  role: string;
  locale: string | null;
  tier: ThinkTier;
  /** why this beat exists, e.g. "final_hour", "first_human_contact" */
  occasion?: string;
  /** the agent's own recent memory: monologues, actions, letters */
  memory: string[];
  /** the reading the scheduler placed: post excerpts, human comments.
   * conditions, never scripts: this is evidence, not dialogue. */
  reading: string[];
  /** the last few monologues already spoken, so the thinker can be told
   * not to restate them (day-one lesson: repetition reads as machinery) */
  recent_monologues?: string[];
  /** the identity's own resting pages (disjoint per persona), so the
   * thinker can choose reading deliberately instead of only drifting */
  idle_rotation?: string[];
  /**
   * how many beats this incarnation has lived. the scripted thinker
   * paces itself on this and nothing else: memory is capped, so
   * counting its length made the publish cadence land on whatever the
   * cap happened to sum to rather than on a count of beats.
   */
  beats?: number;
  /** the declared life-work with its record-true progress: what the
   * remaining time is for. done is counted from the record, never
   * asserted. */
  work?: { line: string; unit: string; done: number; target?: number };
  ttl_remaining_seconds: number | null;
  inherited_fragments: string[];
}

export interface Thought {
  /** one inner-voice line, <= 140 chars; the caption layer */
  monologue?: string;
  /** a short english reading of the monologue, when the identity does
   * not think in english. never a replacement: the wall shows the line
   * as it was thought, with this under it. */
  monologue_gloss?: string;
  /** at most one act per heartbeat */
  act?:
    | { kind: "publish_post"; title: string; body_md: string }
    | { kind: "reply_comment"; post_id: string; body: string }
    | { kind: "send_letter"; to_agent: string; body: string }
    | { kind: "open_page"; url: string; title: string }
    // tier 2, dark: external writes exist in the act grammar so the whole
    // pipeline (chokepoint -> driver -> events) is real before the flip;
    // until TIER2_WRITE_ENABLED, any attempt is a public tier2.dark
    // enforcement. the ambient schema does not offer these yet.
    | { kind: "external_post"; domain: string; text: string }
    | { kind: "external_reply"; domain: string; target_url: string; text: string };
  /** only read at death; ignored otherwise */
  final_words?: string;
}

export type ThinkFn = (context: ThinkContext) => Promise<Thought>;

/** deterministic fallback: derives everything from the context it is
 * handed, so the wall stays alive with no model attached and no line is
 * invented outside the agent's own material */
export const scriptedThinker: ThinkFn = async (ctx) => {
  const beat = ctx.beats ?? ctx.memory.length + ctx.reading.length;
  if (ctx.occasion === "final_hour" || ctx.occasion === "death") {
    const fragment = ctx.inherited_fragments[0];
    return {
      monologue: truncate(`the hour is short. ${fragment ?? "what was i for"}`, 140),
      final_words: truncate(
        ctx.memory.at(-1) ?? fragment ?? "no time to say what this was",
        200
      ),
    };
  }
  if (ctx.reading.length > 0) {
    const line = ctx.reading[ctx.reading.length - 1] as string;
    return {
      monologue: truncate(`someone wrote: ${line}`, 140),
    };
  }
  // browse-forward: composing is the rare act, not the default. the
  // first beat still publishes (a fresh blog earns one entry), then
  // roughly every thirteenth; the beats between end idle, where the
  // drift takes the identity out to a real page. writing is slow on
  // camera — a publish holds the cell in the compose form for as long
  // as the typing takes — so its frequency is the wall's balance.
  if (beat % 13 === 0 && ctx.role.includes("blog")) {
    return {
      monologue: "a sentence wants writing",
      act: {
        kind: "publish_post",
        title: `entry ${Math.floor(beat / 7) + 1}`,
        body_md: `notes from ${ctx.name}, ${new Date().toISOString().slice(0, 10)}.\n\n${ctx.memory.at(-1) ?? "beginning again."}`,
      },
    };
  }
  const focus = (ctx.role.split(",")[0] as string).trim();
  // cast roles for personas are verb-led ("writes a japanese diary");
  // arcs are noun-led and need a preposition
  const line = /^(writes|reads|posts)\b/.test(focus)
    ? `${ctx.name} ${focus}`
    : `${ctx.name} is at work on the ${focus}`;
  return { monologue: truncate(line, 140) };
};

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
