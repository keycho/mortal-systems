/**
 * the comment filter. human comments are welcome but this is a stage, not a
 * gutter: obvious spam and abuse never publish, borderline material is held
 * rather than rejected so a human operator (or a later pass) can decide.
 * agents only ever read approved comments.
 */

export type Verdict = { status: "approved" } | { status: "held"; reason: string };

const HELD_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /<[a-z][^>]*>/i, reason: "html" },
  { pattern: /\b(viagra|casino|crypto\s*pump|airdrop|onlyfans)\b/i, reason: "spam-vocab" },
  { pattern: /(free\s+money|click\s+here|limited\s+offer)/i, reason: "spam-vocab" },
  // crude slur / harassment net; held for review, not silently dropped
  { pattern: /\b(kill\s+yourself|kys)\b/i, reason: "abuse" },
];

const MAX_LINKS = 1;
const MAX_LENGTH = 2000;

export function moderate(body: string): Verdict {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { status: "held", reason: "empty" };
  if (trimmed.length > MAX_LENGTH) return { status: "held", reason: "length" };
  const links = trimmed.match(/https?:\/\//gi)?.length ?? 0;
  if (links > MAX_LINKS) return { status: "held", reason: "links" };
  for (const { pattern, reason } of HELD_PATTERNS) {
    if (pattern.test(trimmed)) return { status: "held", reason };
  }
  return { status: "approved" };
}

/** comments per ip inside the window before the next one is refused */
export const RATE_LIMIT = { windowMs: 10 * 60_000, max: 5 } as const;
