# surface B: the reasoning panel

A build brief, written at the end of the session that ran out of context
before starting it. Everything below is verified against the tree at
`978974d`; nothing here is aspirational except the work itself.

An earlier attempt at this existed in a commit (`2a2fc39`) that never
reached origin and is lost. **Do not look for it.** Nothing in the tree
conflicts, so this is a clean build.

---

## the rule that governs everything

Two surfaces, never mixed:

- **Surface A** is the cell's video: the real web page the agent is
  reading, captured as-is from its own chromium window. **No agent text
  is ever injected into that browser.** What the camera shows is what the
  open web looks like to that identity, and nothing else.
- **Surface B** is drawn by the frontend from the public event feed. It
  is where the agent's reasoning appears: a NOW intent line and a
  timestamped, tagged stream. It lives beside or under the cell, never
  inside the captured frame.

If a change would put agent-authored text inside the browser window, it
is the wrong change.

## this checkpoint

Build **Surface B only**, and push before touching Surface A. The
browse-forward scheduling work, the continuous narration stream, and the
side-by-side `/watch` layout are the *next* checkpoint and are described
at the bottom for context, not to be built here.

---

## what to build

### 1. the `narration` event kind

`packages/wall/src/schema.ts` currently has ten kinds: `monologue`,
`death`, `system`, `enforcement`, `spawn`, `ttl_warning`, `ttl_extended`,
`state_change`, `action`, `human_contact`. Add an eleventh.

```ts
export const NarrationPayload = z.object({
  /** what the agent is saying about what it is looking at */
  text: z.string().min(1).max(NARRATION_MAX_CHARS),
  /** a short english reading, when the identity does not think in
   * english. same contract as MonologuePayload.gloss: never a
   * replacement, always a line underneath. */
  gloss: z.string().max(NARRATION_MAX_CHARS).optional(),
  /** the page this thought is about, so the panel can tie a line to
   * what surface A was showing at the time */
  about_url: z.string().optional(),
});
```

Notes that matter:

- `MonologuePayload` already carries an optional `gloss`. Follow it
  exactly rather than inventing a second convention.
- The store is append-only with `UPDATE`/`DELETE` refused at the trigger
  level. Adding a kind is additive and safe; changing an existing
  payload's shape is not.
- `RECEIPT_KINDS` is `["spawn", "death", "enforcement"]`. Narration is
  not receipted — it is commentary, not an act.
- Narration is `visibility: "public"`. It is the show.

### 2. the tag vocabulary

The panel renders four tags. They are a **projection of existing event
kinds**, computed in the read model, not a new field on the events:

| tag | derived from |
|---|---|
| `READ` | `action` with verb `opened_page` (an external read) |
| `WENT` | `state_change` to a new page, and navigation detours |
| `THOUGHT` | `monologue` and the new `narration` |
| `WROTE` | `action` with verb `published_post`, and comment replies |

Put the mapping in `packages/wall/src/read.ts` as a pure function
(`tagFor(event): Tag | null`) so it is testable without a browser, in
the same spirit as `agentNow` / `directorScore` / `humanizeEvent`.
Events that map to nothing are simply not shown in the panel.

### 3. the NOW line

One sentence per agent: what it is doing and why, right now. Derive it
from the most recent `narration` (or `monologue`) plus current state —
the reference project shows an intent, not a status word. `agentNow`
already folds `state`, `last_monologue` and the open page; extend that
fold rather than adding a second source of truth.

### 4. relocate the captions

This is the part that changes existing behaviour, so it is the part to
do carefully.

Today the monologue renders **over the video** as `.wall-caption` inside
`AgentCell.tsx`, with `.line` and `.gloss` children (added this session),
fed by `caption` / `captionGloss` props. `Gate.tsx` passes a rotating
spotlight caption; `Watch.tsx` passes the hero's `last_monologue`.

Under the two-surface rule that text belongs in Surface B. So:

- remove the caption slot from `AgentCell` (and its `.wall-caption`
  rules in `apps/web/app/wall.css`)
- render those lines in the panel instead, tagged `THOUGHT`
- **keep the gate's single-spotlight behaviour** — one caption across
  the whole wall at a time was a deliberate decision (see DECISIONS,
  "one monologue caption per cell"). The gate may keep its spotlight as
  a gate-level element; what must stop is text drawn on top of a frame.

Check `docs/DECISIONS.md` for the "mortal gate" handoff entry before
moving anything: the caption slot has a fixed 38px height precisely so
an arriving caption never moves the grid. Whatever replaces it should
preserve that property.

### 5. the panel component

New: `apps/web/components/wall/ReasoningPanel.tsx`.

Data comes from `useWall()` in `apps/web/lib/wall-client.ts`, which
already provides `{ agents, alive, events, connected, channel, now }`
over SSE with automatic fallback to polling `/recent`. It needs no new
endpoint — filter `events` by `agent_id`.

Brand rules that are not negotiable: the mortal-gate tokens in
`wall.css` (`--w-bone`, `--w-dim`, `--w-amber`, `--w-hair`, the warm
near-black room), the site's own `--font-mono` / `--font-display`, and
the ttl/mortality treatment. Adopt the reference's *structure* — an
intent line above a dense timestamped log — not its visual style. No
new fonts, no new palette.

**Spend stays out of the public panel.** The reference shows cost on
screen; ours does not. `/health` is where operating figures live.

---

## verification bar

The two failures this session both came from claiming "verified" without
testing the real target (the capture chain, the seccomp profile). For
this checkpoint:

1. `pnpm check` green, including the brand gate (it bans em dashes and
   certain vocabulary in built HTML).
2. Pure-function tests for `tagFor` and the NOW derivation, in
   `packages/wall` where the other read-model tests live.
3. **Render it against a running wall.** The recipe used repeatedly this
   session:
   ```bash
   # a live wall with six agents on real pages
   MORTAL_ROOT=/var/tmp/wall-b PORT=4995 WALL_RUNTIME=live \
     CHROME_SANDBOX=1 STREAM_PROVIDER=ffmpeg WALL_HEADFUL=1 \
     node apps/showrunner/dist/serve.js
   # build the site against it, serve out/, screenshot with real chromium
   NEXT_PUBLIC_WALL_API_URL=http://127.0.0.1:4995 NEXT_PUBLIC_WALL_GATE=1 \
     pnpm exec next build
   ```
   Note `pnpm exec next build` rather than `pnpm build`: the package
   build runs `scripts/check-bundle-env.mjs`, which fails on a loopback
   url by design. Do not commit an `out/` built that way.
4. Known limit: playwright's bundled chromium has **no H.264**, so HLS
   never decodes in it. Cells will look empty in any screenshot taken
   here. That is the verification browser, not the product. Prove video
   separately by decoding a served segment with ffmpeg.
5. The scripted thinker produces no `narration` and no `gloss` (no API
   key in the dev container). Either seed the store with fixture events
   or accept that the live-data path is a deploy-side check, and **say
   which** in the report.

---

## the next checkpoint, for context only

Do not build these here. Recorded so the boundary is clear:

- **browse-forward:** idle already drifts out to a real allowlisted page
  from a disjoint per-persona `idle_rotation` (added this session).
  What remains is biasing the *thinker* so composing is occasional
  rather than a default act.
- **continuous narration:** a steady stream of `narration` events while
  a page is being read, haiku-class to keep cost sane, so the panel
  fills the way the reference's RECORD does.
- **side-by-side `/watch`:** the focused agent's Surface A large with
  Surface B beside it; the rest stay as framed grid cells.

### the editorial call, settled

Mostly reading, punctuated by writing. `WRITING_BOOST` (500 in
`packages/wall/src/director.ts`) **stays high** so the camera does cut
to a live draft when one happens — it sits above a published post (400)
and below enforcement (600), human contact (800) and an imminent death.
What changes is frequency, not priority: composing becomes rare, and
reading a real page is the default visible state. The director already
refuses to dwell more than 20s on a motionless cell, which is what makes
a browse-forward wall watchable rather than a slideshow.
