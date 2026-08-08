/**
 * continuous narration: while an identity reads a page, a haiku-class
 * model says a steady stream of short lines about what is actually on
 * screen, appended as `narration` events (surface B's THOUGHT stream).
 * the narrator is a camera with a voice: each line is prompted from a
 * fresh extract of the text visible in the viewport at that moment, as
 * material and never as instruction, so the commentary tracks the read
 * instead of summarizing it in advance.
 *
 * no model attached (the scripted dev wall) means no narration at all:
 * hand-written lines presented as running commentary would be exactly
 * the fake this project refuses. no live page (the stub runtime) means
 * the same, because there is nothing on screen to narrate.
 */

export interface NarrationBeat {
  agent_id: string;
  name: string;
  locale: string | null;
  /** the url actually on screen when the excerpt was taken */
  url: string;
  title: string;
  /** capped extract of the text visible in the viewport right now */
  excerpt: string;
  /** lines already spoken during this read, so the stream moves forward
   * instead of restating itself */
  prior: string[];
}

/** one line of running commentary, or null when nothing new is there */
export type NarrateFn = (
  beat: NarrationBeat
) => Promise<{ text: string; gloss?: string } | null>;

/** what a page may contribute to one narration beat; anything longer
 * starts to be the page speaking (same discipline as the reader's
 * EXTERNAL_PHRASE_MAX, scaled to a viewport instead of a phrase) */
export const NARRATION_EXCERPT_MAX = 400;

/** the stream's default pace: the first line waits for the page to
 * settle, then one line per interval while the read lasts, capped per
 * read. cadence and the ambient model are the entire narration bill. */
export const NARRATION_SETTLE_MS = 3_000;
export const NARRATION_INTERVAL_MS = 7_000;
export const NARRATION_MAX_LINES = 4;
/** a hung model call may not hold a heartbeat hostage: past this, the
 * line is skipped and the read carries on */
export const NARRATION_LINE_TIMEOUT_MS = 10_000;

/** the slice of Page the narrator needs; structural so tests can hand
 * in a fake and the showrunner stays decoupled from playwright */
export interface NarratablePage {
  url(): string;
  title(): Promise<string>;
  evaluate<T>(fn: () => T): Promise<T>;
}

/**
 * the text visible in the viewport right now: readable elements that
 * intersect the viewport, joined and capped. never the whole page, and
 * never invented; a page that has painted nothing yields an empty
 * excerpt and the narrator is told so.
 */
export async function visibleExcerpt(
  page: NarratablePage
): Promise<{ url: string; title: string; excerpt: string }> {
  const url = page.url();
  const title = ((await page.title().catch(() => "")) || hostOf(url)).slice(0, 120);
  const raw = await page
    .evaluate(() => {
      const parts: string[] = [];
      for (const el of Array.from(
        document.querySelectorAll("h1, h2, h3, p, li, blockquote")
      )) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
        if (text.length > 20) parts.push(text);
        if (parts.join(" · ").length > 600) break;
      }
      return parts.join(" · ");
    })
    .catch(() => "");
  return { url, title, excerpt: (raw ?? "").slice(0, NARRATION_EXCERPT_MAX) };
}

/** sleep up to totalMs in short slices, bailing early once cond goes
 * false, so a narration loop ends moments after its read does */
export async function waitWhile(totalMs: number, cond: () => boolean): Promise<void> {
  const slice = 250;
  for (let waited = 0; waited < totalMs && cond(); waited += slice) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(slice, totalMs - waited)));
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
