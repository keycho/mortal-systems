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
  ttl_remaining_seconds: number | null;
  inherited_fragments: string[];
}

export interface Thought {
  /** one inner-voice line, <= 140 chars; the caption layer */
  monologue?: string;
  /** at most one act per heartbeat */
  act?:
    | { kind: "publish_post"; title: string; body_md: string }
    | { kind: "reply_comment"; post_id: string; body: string }
    | { kind: "send_letter"; to_agent: string; body: string }
    | { kind: "open_page"; url: string; title: string };
  /** only read at death; ignored otherwise */
  final_words?: string;
}

export type ThinkFn = (context: ThinkContext) => Promise<Thought>;

/** deterministic fallback: derives everything from the context it is
 * handed, so the wall stays alive with no model attached and no line is
 * invented outside the agent's own material */
export const scriptedThinker: ThinkFn = async (ctx) => {
  const beat = ctx.memory.length + ctx.reading.length;
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
  if (beat % 3 === 0 && ctx.role.includes("blog")) {
    return {
      monologue: "a sentence wants writing",
      act: {
        kind: "publish_post",
        title: `entry ${Math.floor(beat / 3) + 1}`,
        body_md: `notes from ${ctx.name}, ${new Date().toISOString().slice(0, 10)}.\n\n${ctx.memory.at(-1) ?? "beginning again."}`,
      },
    };
  }
  return { monologue: truncate(`${ctx.name} is thinking about ${ctx.role.split(",")[0]}`, 140) };
};

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
