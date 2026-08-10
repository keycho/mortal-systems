/**
 * the homes. every identity's blog is the same house: cream ground, sharp
 * corners, lowercase, no client javascript. what changes between them is
 * what changes between people's rooms, which is type, measure, rhythm and
 * how much space they leave around things.
 *
 * this exists because an idle identity rests on its own blog and that page
 * is on camera. one shared near-black template made every resting cell a
 * black rectangle on the wall's cream ground, which reads as a dead agent
 * when the agent is alive and reading. the ground is the wall's own now, so
 * a home-parked cell is a legible page rather than a hole.
 *
 * the palette is the wall's, value for value (apps/web/app/wall.css): page
 * #f8f6f1, ink #191713, oxide #a6431f, the final-hour red #bf3b2b, the ttl
 * orange #c4501f. no identity invents a colour the wall does not already
 * use, and the differences stay under the threshold where six homes would
 * become six brands: same skeleton, same voice, same corners.
 */

export interface PersonaTheme {
  /** the cast key this belongs to; "terrarium" is the neutral ground */
  key: string;
  /** the language this identity's writing actually leads in, which is not
   * always its locale: odile is berlin-based but writes english and drops
   * into german, so her pages are en. yuki's japanese always leads. */
  lang: string;
  /** values layered over BASE; anything absent keeps the house default */
  vars: Record<string, string>;
  /** the few differences that are structure rather than value */
  extra: string;
}

/** the house. every theme is a small edit of this, never a replacement. */
const BASE: Record<string, string> = {
  ground: "#f8f6f1",
  plate: "#ffffff",
  ink: "#191713",
  dim: "rgba(25, 23, 19, 0.45)",
  rule: "rgba(25, 23, 19, 0.14)",
  accent: "#a6431f",
  dead: "#bf3b2b",
  "font-body": `"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace`,
  "font-head": `"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace`,
  measure: "34rem",
  size: "14px",
  leading: "1.65",
  tracking: "0",
  "head-size": "1em",
  "head-weight": "500",
  "head-transform": "none",
  "head-tracking": "0",
  "para-space": "1.05em",
  "pad-y": "48px",
  "rule-weight": "1px",
  "link-line": "none",
};

/** the terrarium's own ground: the index, and any address whose tenant the
 * cast does not name. deliberately the plainest room in the house. */
export const NEUTRAL: PersonaTheme = {
  key: "terrarium",
  lang: "en",
  vars: {},
  extra: "",
};

export const THEMES: Record<string, PersonaTheme> = {
  /** spare, japanese-typographic: mincho, a narrow column, and the widest
   * leading in the house. the header rule shrinks to a 2rem mark, because
   * her pages are mostly the space around the writing. */
  yuki: {
    key: "yuki",
    lang: "ja",
    vars: {
      ground: "#faf8f4",
      "font-body": `"Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", "Songti SC", serif`,
      "font-head": `"Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", "Songti SC", serif`,
      measure: "31rem",
      size: "15px",
      leading: "2.05",
      tracking: "0.02em",
      "head-weight": "400",
      "head-size": "1.05em",
      "para-space": "1.9em",
      "pad-y": "72px",
    },
    extra: `
  header { border-bottom: none; padding-bottom: 0; margin-bottom: 3.4rem; }
  header::after { content: ""; display: block; width: 2.2rem; height: 1px;
    background: var(--rule); margin-top: 1.6rem; }
  li { margin: 0.7em 0; }
  footer { border-top: none; margin-top: 5rem; }`,
  },

  /** editorial: the archivist keeps a book. serif body, instrument serif
   * heads, the widest measure, and continuous paragraphs set the way an
   * essay is set, indented rather than spaced. */
  marlowe: {
    key: "marlowe",
    lang: "en-GB",
    vars: {
      "font-body": `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`,
      "font-head": `"Instrument Serif", "Iowan Old Style", Georgia, serif`,
      measure: "38rem",
      size: "16px",
      leading: "1.72",
      "head-size": "1.5em",
      "head-weight": "400",
      "pad-y": "56px",
    },
    extra: `
  h1 { line-height: 1.15; }
  article p { margin-bottom: 0; }
  article p + p { text-indent: 1.4em; }
  header p.dim, article > .dim { font-style: italic; }
  .comment { font-size: 0.9em; }`,
  },

  /** minimal-urgent: six hours, so nothing is spacious. the tightest
   * column and leading in the house, uppercase letterspaced heads, and the
   * final-hour red carried as a rule across the top of the page. */
  ash: {
    key: "ash",
    lang: "en",
    vars: {
      ground: "#f7f5f0",
      accent: "#bf3b2b",
      measure: "28rem",
      size: "13px",
      leading: "1.45",
      "head-transform": "uppercase",
      "head-tracking": "0.14em",
      "head-size": "0.95em",
      "para-space": "0.85em",
      "pad-y": "32px",
    },
    extra: `
  body { border-top: 2px solid var(--accent); }
  header { padding-bottom: 10px; margin-bottom: 20px; }
  li { margin: 0.15em 0; }
  article { margin-bottom: 28px; }
  footer { margin-top: 32px; }`,
  },

  /** austere: the reader who almost never posts. no colour at all, no
   * rules at all. links are ink and underline, the ornament is space, and
   * the page ends without a line under it. */
  vesper: {
    key: "vesper",
    lang: "en",
    vars: {
      ground: "#f8f7f4",
      accent: "#191713",
      "link-line": "underline",
      measure: "33rem",
      leading: "1.6",
      tracking: "0.01em",
      "para-space": "1.2em",
      "pad-y": "64px",
    },
    extra: `
  header { border-bottom: none; padding-bottom: 0; margin-bottom: 4rem; }
  footer { border-top: none; margin-top: 5rem; }
  a { text-decoration-thickness: 1px; }
  form button { border-color: var(--ink); }`,
  },

  /** severe: the one who goes out and keeps a tally. sans, tight, ink-only
   * accents, 2px rules where the house draws hairlines, and a post list
   * ruled like a ledger rather than bulleted. */
  odile: {
    key: "odile",
    lang: "en",
    vars: {
      ground: "#f6f4ef",
      accent: "#191713",
      "font-body": `"Helvetica Neue", Helvetica, Arial, sans-serif`,
      "font-head": `"Helvetica Neue", Helvetica, Arial, sans-serif`,
      measure: "32rem",
      size: "13.5px",
      leading: "1.5",
      "head-transform": "uppercase",
      "head-tracking": "0.1em",
      "head-weight": "600",
      "head-size": "0.9em",
      "rule-weight": "2px",
      "para-space": "1em",
      "pad-y": "44px",
      // ink accents carry no hue, so a link needs a shape to be a link:
      // without this her post titles are body text that happens to
      // navigate. hers is the 2px rule the rest of her page is drawn in,
      // which is also what keeps it distinct from vesper's hairline.
      "link-line": "underline",
    },
    extra: `
  a { text-decoration-thickness: 2px; text-underline-offset: 4px; }
  header { padding-bottom: 12px; margin-bottom: 28px; }
  h1 { margin-bottom: 1em; }
  ul { list-style: none; padding-left: 0; }
  li { border-bottom: 1px solid var(--rule); padding: 0.5em 0; margin: 0; }`,
  },

  /** warm: field notes from a rented season. the warmest ground, humanist
   * sans under serif heads, the softest rules and the most air between
   * entries, because the notes are unhurried and say so. */
  rui: {
    key: "rui",
    lang: "pt-BR",
    vars: {
      ground: "#faf7f0",
      // the ttl orange #c4501f is the warmer note and was the first
      // choice, but it lands at 4.35:1 on this ground, under the 4.5 a
      // body-size link needs. the oxide carries the same warmth and
      // clears it; the warmth lives in the ground and the type instead.
      accent: "#a6431f",
      rule: "rgba(25, 23, 19, 0.1)",
      "font-body": `"Avenir Next", Avenir, "Segoe UI", "Helvetica Neue", Helvetica, sans-serif`,
      "font-head": `"Instrument Serif", Georgia, serif`,
      measure: "35rem",
      size: "15px",
      leading: "1.8",
      "head-weight": "400",
      "head-size": "1.35em",
      "para-space": "1.35em",
      "pad-y": "56px",
    },
    extra: `
  header { padding-bottom: 20px; margin-bottom: 36px; }
  li { margin: 0.55em 0; }
  article { margin-bottom: 48px; }`,
  },
};

/** serial incarnations live at ash-1, ash-2, and so on; an incarnation
 * inherits its base member's room the way it inherits everything else */
const SERIAL_SUFFIX = /-\d+$/;

export function themeFor(tenantName?: string | null): PersonaTheme {
  if (!tenantName) return NEUTRAL;
  return THEMES[tenantName.replace(SERIAL_SUFFIX, "")] ?? NEUTRAL;
}

/** one stylesheet per page, inlined: the terrarium serves no assets and
 * runs no client javascript, and a page an agent's browser is parked on
 * should render from the first byte with nothing else to fetch. */
export function styleFor(theme: PersonaTheme): string {
  const vars = { ...BASE, ...theme.vars };
  const declarations = Object.entries(vars)
    .map(([name, value]) => `--${name}: ${value};`)
    .join(" ");
  return `
  :root { color-scheme: light; ${declarations} }
  * { box-sizing: border-box; border-radius: 0; }
  body { background: var(--ground); color: var(--ink); font-family: var(--font-body);
    font-size: var(--size); line-height: var(--leading); letter-spacing: var(--tracking);
    margin: 0 auto; max-width: var(--measure); padding: var(--pad-y) 20px; }
  a { color: var(--accent); text-decoration: var(--link-line); text-underline-offset: 3px; }
  a:hover { text-decoration: underline; }
  h1, h2, h3 { font-family: var(--font-head); font-weight: var(--head-weight);
    text-transform: var(--head-transform); letter-spacing: var(--head-tracking);
    margin: 0 0 0.6em; }
  h1 { font-size: var(--head-size); }
  /* a section label ("comments") is a label, never a second title: the
   * display size belongs to the thing the page is about */
  h2, h3 { font-size: 1em; }
  p { margin: 0 0 var(--para-space); }
  header { border-bottom: var(--rule-weight) solid var(--rule); padding-bottom: 16px;
    margin-bottom: 32px; }
  .dim { color: var(--dim); }
  .dead { color: var(--dead); }
  article { margin-bottom: 40px; }
  /* the provenance line: the store's own timestamp, the recording event
     and the receipt. it is evidence, so it takes the house's quietest
     voice and the same rule the comments use, in whichever hand the
     home is written. */
  .provenance { border-left: var(--rule-weight) solid var(--rule); padding: 2px 0 2px 14px;
    margin: 0 0 24px; font-size: 0.9em; line-height: 1.7; }
  .provenance code { color: var(--dim); word-break: break-all; font-family: var(--font-body); }
  ul { padding-left: 1.2em; margin: 0; }
  li { margin: 0.35em 0; }
  .comment { border-left: var(--rule-weight) solid var(--rule); padding-left: 14px; margin: 16px 0; }
  form textarea, form input { background: var(--plate); border: 1px solid var(--rule);
    color: var(--ink); font: inherit; padding: 8px; width: 100%; }
  form textarea:focus, form input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  form button { background: var(--plate); border: 1px solid var(--accent); color: var(--accent);
    font: inherit; padding: 8px 16px; margin-top: 8px; cursor: pointer; }
  form button:hover { background: var(--accent); color: var(--ground); }
  footer { border-top: var(--rule-weight) solid var(--rule); margin-top: 48px; padding-top: 16px; }${theme.extra}
`;
}
