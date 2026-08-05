# manager dark aesthetic — two directions, one token sheet

both directions are live in the real app behind a dev-only switch
(`/?theme=instrument` · `/?theme=glass`; the default theme is untouched until a
direction is chosen). the comparison captures are real renders of the running
identity overview against a live runtime. after the pick, the chosen column
below ports verbatim into `packages/tokens/tokens.css` (application tier) and
the loser + switch are deleted.

## shared, non-negotiable (both directions)

| token | value | rule |
| --- | --- | --- |
| `--state-persistent` | `#f59e0b` | amber = persistent, semantic only |
| `--state-active` | `#a8dc66` | green = active/running, semantic only |
| `--state-expiring` | `#d7a84a` | orange = expiring, semantic only |
| `--state-destroying` | `#d86a5d` | red = destructive/failed ONLY, never brand |
| `--app-brand` | `#d9754f` | the one accent: primary action, active nav/tab, focus rings, receipt id + seal. burnt ochre, deliberately NOT amber so it can never collide with persistent |
| sans | Geist Sans (bundled 400/500/600) | all ui text |
| mono | JetBrains Mono / SF Mono stack | ids, paths, timestamps, countdowns, receipt ids only; `tabular-nums` on every changing number |
| type scale | 28/600 title · 25 page · 17 section · 15 body · 14 secondary · 13 metadata · 12.5 floor | line-height 1.6 body, 1.12 title |
| radii | 8 controls · 12 panels · 16 cards/dialogs | never mixed per component class |
| focus ring | 2px `--app-brand` at 60% | every interactive element |
| motion | 140ms ease color/opacity; state changes, provisioning, countdown, destruction, panel transitions only; all off under `prefers-reduced-motion` | no decorative animation |
| aa floor | every text/surface pair ≥ 4.5:1 (12.5–14px) or ≥ 3:1 (≥18px semibold) | state never color-alone; always paired with a label |

## direction a — "instrument" (crisp black)

laboratory-instrument black: a disciplined 4-step surface scale from true
near-black, hairline borders, depth from 1px light — no blur anywhere.

| token | value |
| --- | --- |
| `--bg-app` | `#0b0b0c` |
| `--bg-sidebar` | `#060607` |
| `--bg-surface` | `#131315` |
| `--bg-surface-hover` | `#1a1a1d` |
| `--bg-elevated` | `#202024` |
| `--bg-input` | `#101012` |
| `--border-subtle` | `rgba(255,255,255,0.09)` |
| `--border-strong` | `rgba(255,255,255,0.16)` |
| `--text-primary` | `#f5f5f4` |
| `--text-secondary` | `#cfcfca` |
| `--text-muted` | `#97978f` |
| elevation (surface/elevated) | `inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 0 rgba(0,0,0,0.55)` |
| blur | none, ever |

character: the numbered spaces, countdowns and receipt read like instrument
readouts on black glass. the state colors carry all the life; the chrome
disappears.

## direction b — "glass" (translucent black)

darker still, with selective material: alpha surfaces + backdrop blur on
layered elements, soft inner light, one restrained glow on the running state.
no neon, no gradients-as-decoration, no gloss.

| token | value |
| --- | --- |
| `--bg-app` | `#09090a` + ambient `radial-gradient(1100px 600px at 78% -10%, rgba(217,117,79,0.05), transparent 60%)` |
| `--bg-sidebar` | `rgba(255,255,255,0.028)` |
| `--bg-surface` | `rgba(255,255,255,0.045)` |
| `--bg-surface-hover` | `rgba(255,255,255,0.075)` |
| `--bg-elevated` | `rgba(255,255,255,0.07)` |
| `--bg-input` | `rgba(255,255,255,0.04)` |
| `--border-subtle` | `rgba(255,255,255,0.08)` |
| `--border-strong` | `rgba(255,255,255,0.15)` |
| `--text-primary` | `#f6f6f5` |
| `--text-secondary` | `#d2d2cd` |
| `--text-muted` | `#97978f` |
| material (surface/elevated/sidebar/input) | `backdrop-filter: blur(16px) saturate(1.12)` + `inset 0 1px 0 rgba(255,255,255,0.07)` |
| running glow | `0 0 14px rgba(168,220,102,0.16)` on the running state pill only |

character: layered panes of smoked glass over near-black; the running identity
literally carries a faint pulse of its state color. costs: blur has a real gpu
cost in the webview, and translucent surfaces need the aa floor re-verified
wherever content scrolls beneath them.

## decision notes

- the brief asked for a warm amber accent; amber is already the persistent
  state color and the brief also declares accent/state collision forbidden —
  the sheet resolves this by keeping the established mortal burnt-ochre
  (`#d9754f`) as the accent in both directions. if amber-as-accent is wanted
  anyway, persistent needs a new color first.
- direction a is the lower-risk "own the look" bet: it keeps every aa
  guarantee trivially checkable and costs nothing at runtime. direction b is
  distinctive but must be re-checked for contrast wherever panels overlap
  content, and the glow must stay exactly one element deep.
