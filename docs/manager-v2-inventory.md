# manager v2 — stage 1/2 inventory of the current manager

captured 2026-08-03 on branch `manager/v2`, before any redesign code. the current
manager was run via the vite dev flow (runtime cli on 4923, vite on 5173 — the
tauri shell is never compiled in this environment) and every screen was
screenshotted with playwright against real runtime data (three identities, one
destroyed, three seeded first-party blueprints).

## screens that exist today

one screen. a card grid (identity cards + "new identity" form card + "blueprints"
panel card) with an optional right drawer that stacks manifest + activity, and a
status bar. there is no navigation, no dashboard, no settings, no dedicated
activity or guarantees view.

## real (wired to the runtime, verified live)

- identity list, 2s polling: `identity.list` → SpaceCard grid with live countdowns
- runtime status bar: `runtime.status` → version, running count, detected browser,
  warnings, reachability dot
- create: `composeManifest` client-side (schema-validated) → `identity.create`
- launch / suspend / destroy (with inline confirm) → real state transitions
- blueprint list/preview/install: `blueprint.list` / `blueprint.get` /
  `identity.createFromBlueprint` with lifetime override + explicit extension
  consent; unsigned badge; punycode warnings
- detail drawer: `identity.get` manifest render with enforcement badges straight
  from manifest values; `activity.read` log; destruction report (D0–D7 + caveats)
  parsed from the real `destroyed` event detail
- destroyed identities render the tombstone message ("only the tombstone and the
  activity log remain") — verified against a really-destroyed identity

## mocked or fake

none found. no hardcoded activity, no fabricated screenshots, no fake browser
embeds. the v1 manager under-presents rather than over-claims.

## incomplete / v1 gaps the redesign addresses

- no navigation or information architecture: everything is one crowded grid
- the drawer crams manifest + activity into 420px; no room for lifecycle,
  destruction receipt, or per-tab focus
- no overview/dashboard, no cross-identity activity view, no guarantees screen,
  no settings screen
- all-mono typography reads as terminal styling (explicitly on the v2 avoid
  list); mono should be reserved for machine values
- design tokens are local to `apps/manager/src/styles.css` and have diverged
  from `apps/web/app/tokens.css` (different palette, different names)
- polling only; the runtime's SSE event bus is unused by the manager
- minimal empty/loading/error states (single red strip)
- destroy confirm is an inline strip, not a deliberate confirmation surface

## rpc surface constraint (governs the v2 workspace tabs)

`RpcContract` today: identity create/createFromBlueprint/get/list/launch/
suspend/resume/expire/destroy, blueprint validate/install/export/list/get,
activity.read, runtime.status, runtime.capabilities. there are **no** rpc
methods for notes, files, or ai memory — those live inside the identity's own
space and are served only to its companion over `/v1/self`. consequence: the
v2 Files and Memory tabs describe where that data lives and what the runtime
enforces about it; they do not render identity content the manager cannot read,
and they never fake it.

## v1 screenshots

captured to the session scratchpad (not committed): main grid, detail drawer,
tombstone detail with destruction report, blueprint preview, destroy confirm.
