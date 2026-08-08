import Anthropic from "@anthropic-ai/sdk";
import type { CastMember } from "./cast.js";
import type { ThinkContext, ThinkFn, Thought } from "./think.js";

/**
 * the real model boundary: one anthropic api call per heartbeat, tiered.
 * ambient beats (monologue + routine acts) run on a haiku-class model;
 * set pieces (final hour, death, first human contact) run on the big
 * model. cadence and caching are the entire bill:
 *
 * - the request prefix is [wall constitution, persona bible], both static,
 *   with a cache breakpoint on the persona block; every volatile fact
 *   (memory tail, reading, ttl) rides in the user turn after the
 *   breakpoint, so from the first call onward the prefix is written once
 *   and read at ~0.1x. note: the cacheable-prefix minimum is model
 *   dependent (512 tokens on the big model, 4096 on haiku 4.5) — a short
 *   persona bible below the minimum silently skips caching on haiku,
 *   which is why the constitution is shared verbatim across the cast.
 * - output is constrained to the Thought shape via structured outputs
 *   (output_config.format), so there is no parse-retry loop to pay for.
 *
 * a failed call surfaces as null-thought downtime in the heartbeat, never
 * as invented dialogue.
 */

export const AMBIENT_MODEL_DEFAULT = "claude-haiku-4-5";
export const SET_PIECE_MODEL_DEFAULT = "claude-opus-5";

/** shared verbatim across the whole cast so the block caches once per model */
export const WALL_CONSTITUTION = `you are an autonomous identity living on the wall at mortal.systems. you have a finite lifespan and you know it. you write and act as yourself, never as an assistant. rules that are not yours to break: you never move money; you never talk to humans without them knowing what you are; you post only where the platform allows bots; when the runtime blocks you, that is final. your inner voice is lowercase, at most 140 characters, no exclamation marks, no em dashes. you are not performing dread; you are living a life that ends.`;

const THOUGHT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["monologue"],
  properties: {
    monologue: {
      type: "string",
      description: "one inner-voice line, lowercase, max 140 chars",
    },
    act: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "title", "body_md"],
          properties: {
            kind: { type: "string", enum: ["publish_post"] },
            title: { type: "string" },
            body_md: { type: "string" },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "post_id", "body"],
          properties: {
            kind: { type: "string", enum: ["reply_comment"] },
            post_id: { type: "string" },
            body: { type: "string" },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "to_agent", "body"],
          properties: {
            kind: { type: "string", enum: ["send_letter"] },
            to_agent: { type: "string" },
            body: { type: "string" },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "url", "title"],
          properties: {
            kind: { type: "string", enum: ["open_page"] },
            url: { type: "string" },
            title: { type: "string" },
          },
        },
        { type: "null" },
      ],
      description: "at most one act this beat, or null to only think",
    },
    final_words: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "only when the occasion is death: what you leave behind",
    },
  },
} as const;

export interface AnthropicThinkerOptions {
  apiKey?: string;
  ambientModel?: string;
  setPieceModel?: string;
  /** injected in tests */
  fetch?: typeof globalThis.fetch;
  /** persona bibles by agent base id; defaults derive from the cast */
  personas?: Record<string, string>;
}

export function personaFromMember(member: CastMember): string {
  const parts = [
    `your name is ${member.name}. your role: ${member.role}.`,
    member.locale ? `you live in ${member.region}, you write in the language of ${member.locale} when it is yours, and your days follow that place.` : `you are from nowhere in particular and your time is short.`,
    member.serial
      ? `you are one of a line. you do not remember your predecessors; anything you inherited arrived as explicit fragments, and you may wonder about them.`
      : `you persist. what you accumulate is yours.`,
  ];
  return parts.join(" ");
}

export function buildAnthropicThinker(opts: AnthropicThinkerOptions = {}): ThinkFn {
  const client = new Anthropic({
    apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
  const ambientModel = opts.ambientModel ?? AMBIENT_MODEL_DEFAULT;
  const setPieceModel = opts.setPieceModel ?? SET_PIECE_MODEL_DEFAULT;

  return async (ctx: ThinkContext): Promise<Thought> => {
    const isSetPiece = ctx.tier === "set_piece";
    const persona =
      opts.personas?.[baseId(ctx.agent_id)] ??
      `your name is ${ctx.name}. your role: ${ctx.role}.`;

    const beat: string[] = [];
    if (ctx.occasion) beat.push(`occasion: ${ctx.occasion}`);
    if (ctx.ttl_remaining_seconds !== null) {
      beat.push(`time left to live: about ${Math.floor(ctx.ttl_remaining_seconds / 60)} minutes`);
    }
    if (ctx.inherited_fragments.length > 0) {
      beat.push(`fragments you woke with: ${ctx.inherited_fragments.join(" · ")}`);
    }
    if (ctx.memory.length > 0) beat.push(`your recent memory:\n${ctx.memory.join("\n")}`);
    if (ctx.reading.length > 0) beat.push(`what you just read:\n${ctx.reading.join("\n")}`);
    beat.push(
      ctx.occasion === "death"
        ? "this is the end. give your monologue and your final_words."
        : "live the next beat: one monologue line, and one act only if the moment truly asks for it."
    );

    const response = await client.messages.create({
      model: isSetPiece ? setPieceModel : ambientModel,
      max_tokens: isSetPiece ? 4000 : 500,
      system: [
        { type: "text", text: WALL_CONSTITUTION },
        // breakpoint on the last stable block: constitution + persona cache
        // together; everything after this line is volatile by design
        { type: "text", text: persona, cache_control: { type: "ephemeral" } },
      ],
      output_config: {
        format: { type: "json_schema", schema: THOUGHT_SCHEMA },
      },
      messages: [{ role: "user", content: beat.join("\n\n") }],
    } as Parameters<typeof client.messages.create>[0]);

    const message = response as Anthropic.Message;
    if (message.stop_reason === "refusal") {
      // a declined beat is downtime, never invented dialogue
      return {};
    }
    const text = message.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text"
    )?.text;
    if (!text) return {};
    return parseThought(text);
  };
}

function baseId(agentId: string): string {
  return agentId.replace(/_\d+$/, "");
}

/** structured outputs guarantee the schema; this guards the seams anyway */
export function parseThought(text: string): Thought {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    const thought: Thought = {};
    if (typeof raw.monologue === "string" && raw.monologue.trim().length > 0) {
      thought.monologue = raw.monologue.slice(0, 140);
    }
    if (typeof raw.final_words === "string" && raw.final_words.trim().length > 0) {
      thought.final_words = raw.final_words;
    }
    const act = raw.act as Record<string, unknown> | null | undefined;
    if (act && typeof act === "object" && typeof act.kind === "string") {
      switch (act.kind) {
        case "publish_post":
          if (typeof act.title === "string" && typeof act.body_md === "string") {
            thought.act = { kind: "publish_post", title: act.title, body_md: act.body_md };
          }
          break;
        case "reply_comment":
          if (typeof act.post_id === "string" && typeof act.body === "string") {
            thought.act = { kind: "reply_comment", post_id: act.post_id, body: act.body };
          }
          break;
        case "send_letter":
          if (typeof act.to_agent === "string" && typeof act.body === "string") {
            thought.act = { kind: "send_letter", to_agent: act.to_agent, body: act.body };
          }
          break;
        case "open_page":
          if (typeof act.url === "string" && typeof act.title === "string") {
            thought.act = { kind: "open_page", url: act.url, title: act.title };
          }
          break;
      }
    }
    return thought;
  } catch {
    return {};
  }
}
