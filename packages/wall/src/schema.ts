import { z } from "zod";

/**
 * the WallEvent schema, the single source of truth for the spectacle layer.
 * gate, watch page, ticker read model, recaps, graveyard, clips and
 * annotations all render from this stream and from nothing else. every kind
 * maps to a runtime primitive doing its job; a beat with no primitive behind
 * it is unrepresentable here on purpose.
 */

export const AGENT_CLASSES = ["persona", "burner", "minimal"] as const;
export type AgentClass = (typeof AGENT_CLASSES)[number];

/** what the viewer-facing ui calls each class. "burner" is banned copy on
 * the site (brand gate), so the display name for the class is "ash". */
export const AGENT_CLASS_DISPLAY: Record<AgentClass, string> = {
  persona: "persona",
  burner: "ash",
  minimal: "minimal",
};

export const AGENT_STATES = [
  "writing",
  "reading",
  "replying",
  "idle",
  "sleeping",
  "waking",
] as const;
export type AgentState = (typeof AGENT_STATES)[number];

export const ACTION_VERBS = [
  "published_post",
  "left_comment",
  "deleted_reply",
  "sent_letter",
  "opened_page",
] as const;
export type ActionVerb = (typeof ACTION_VERBS)[number];

export const DEATH_CAUSES = ["ttl", "enforcement", "manual"] as const;
export type DeathCause = (typeof DEATH_CAUSES)[number];

export const MONOLOGUE_MAX_CHARS = 140;
/** controlled inheritance: an ash successor receives at most this many
 * explicit, logged memory fragments and nothing else */
export const MAX_INHERITED_FRAGMENTS = 3;

// ---- per-kind payloads ----

export const SpawnPayload = z.object({
  class: z.enum(AGENT_CLASSES),
  region: z.string().nullable(),
  locale: z.string().nullable(),
  ttl_seconds: z.number().int().positive(),
  fingerprint_short: z.string(),
  inherited_fragments: z.array(z.string().min(1)).max(MAX_INHERITED_FRAGMENTS),
});

export const DeathPayload = z.object({
  lived_seconds: z.number().int().nonnegative(),
  cause: z.enum(DEATH_CAUSES),
  final_words: z.string(),
  /** the runtime's own teardown receipt from identity.destroy() */
  receipt: z.string(),
});

export const TtlWarningPayload = z.object({
  window: z.enum(["final_hour", "final_10m"]),
  remaining_seconds: z.number().int().nonnegative(),
});

export const TtlExtendedPayload = z.object({
  added_seconds: z.number().int().positive(),
  source: z.enum(["sponsor", "system"]),
});

export const StateChangePayload = z.object({
  state: z.enum(AGENT_STATES),
  detail: z.string().optional(),
  wakes_at: z.string().optional(),
});

export const ActionPayload = z.object({
  verb: z.enum(ACTION_VERBS),
  target_url: z.string().optional(),
  target_agent: z.string().optional(),
  title: z.string().optional(),
});

export const MonologuePayload = z.object({
  text: z.string().min(1).max(MONOLOGUE_MAX_CHARS),
});

export const EnforcementPayload = z.object({
  rule_id: z.string(),
  rule_text: z.string(),
  attempted_action: z.string(),
});

export const HumanContactPayload = z.object({
  platform: z.string(),
  excerpt: z.string(),
  url: z.string(),
});

export const SystemPayload = z.object({
  what: z.enum(["lost_time", "maintenance"]),
  detail: z.string().optional(),
});

export const PAYLOAD_SCHEMAS = {
  spawn: SpawnPayload,
  death: DeathPayload,
  ttl_warning: TtlWarningPayload,
  ttl_extended: TtlExtendedPayload,
  state_change: StateChangePayload,
  action: ActionPayload,
  monologue: MonologuePayload,
  enforcement: EnforcementPayload,
  human_contact: HumanContactPayload,
  system: SystemPayload,
} as const;

export const WALL_EVENT_KINDS = Object.keys(PAYLOAD_SCHEMAS) as WallEventKind[];
export type WallEventKind = keyof typeof PAYLOAD_SCHEMAS;

/** kinds that must carry a top-level receipt hash */
export const RECEIPT_KINDS: readonly WallEventKind[] = ["spawn", "death", "enforcement"];

export const WallEventSchema = z
  .object({
    id: z.string().min(26).max(26),
    ts: z.string().datetime({ offset: true }),
    agent_id: z.string().regex(/^ag_[a-z0-9_-]+$/),
    kind: z.enum(WALL_EVENT_KINDS as [WallEventKind, ...WallEventKind[]]),
    payload: z.record(z.unknown()),
    visibility: z.enum(["public", "internal"]),
    primitive: z.string().optional(),
    receipt: z.string().optional(),
  })
  .superRefine((event, ctx) => {
    const schema = PAYLOAD_SCHEMAS[event.kind as WallEventKind];
    const parsed = schema.safeParse(event.payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["payload", ...issue.path],
          message: issue.message,
        });
      }
    }
  });

export type WallEvent = z.infer<typeof WallEventSchema> & { kind: WallEventKind };

export type PayloadFor<K extends WallEventKind> = z.infer<(typeof PAYLOAD_SCHEMAS)[K]>;

/** what a producer hands the store: the store assigns id, ts and the
 * top-level receipt hash; producers cannot forge any of the three */
export interface WallEventInput<K extends WallEventKind = WallEventKind> {
  agent_id: string;
  kind: K;
  payload: PayloadFor<K>;
  visibility: "public" | "internal";
  primitive?: string;
  ts?: string;
}
