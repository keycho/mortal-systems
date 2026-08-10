# witness.run

launch private identities that disappear when their work is done.

a programmable privacy and identity runtime for humans and autonomous agents. every identity is a manifest-defined runtime object with its own real chromium instance, notes, ai context, files, permissions, and a finite lifecycle. the user-facing environment is a **space**; the canonical term in all code, schemas, and apis is `identity`.

**github note:** the repository was renamed for the mortal systems brand; github redirects the old name.

build status is tracked honestly** in [docs/PROGRESS.md](docs/PROGRESS.md) (per-day gates with pasted test output) and [docs/DECISIONS.md](docs/DECISIONS.md) (every deviation from the poc spec). days 1–4 of the poc are built and gated; the lifecycle scheduler, blueprint pipeline, browser-level isolation suite, and public site are not built yet.

## structure

```
apps/
  manager/     mortal manager — react ui + tauri 2 shell (ui only, never a browser)
  companion/   mortal companion — mv3 extension stamped per identity
  web/         public witness.run site (day-7 scope, not built yet)
packages/
  schema/      @mortal/schema — zod manifests, api types, constants (imported by everything)
  runtime/     @mortal/runtime — the local service: identities, lifecycle, deletion, api
  cli/         @mortal/cli — the `mortal` command: scriptable client for the runtime
  sdk/         @mortal/sdk — stub, types only
  mcp/         @mortal/mcp — stub, empty
docs/          PROGRESS.md · DECISIONS.md
```

all identity state lives under the runtime root (`~/.mortal` by default): `mortal.db`, `profiles/`, `files/`, `companion-instances/`. never inside the repository.

## commands

```
pnpm install
pnpm build            # all packages + apps
pnpm test             # vitest suites (includes real-chromium smoke tests)
pnpm lint / typecheck
pnpm check            # lint + typecheck + guarantees gate (gate fails by design until day 6)
```

## dev flow (three processes)

the manager talks to the runtime over loopback http; in dev you run them separately:

1. **runtime** — `pnpm dev:runtime`
   starts the mortal runtime on port 4923 with the dev admin token (`mortal-dev`), root at `~/.mortal` (override with `MORTAL_ROOT`).
2. **manager ui (browser dev mode)** — `pnpm dev:manager`
   vite on http://localhost:5173, proxying `/runtime` to the runtime above. this is a browser tab, not the native window; it is the primary dev loop and works on any platform with no rust toolchain.
3. **native window (optional)** — `pnpm --filter manager tauri:dev`
   tauri dev owns starting vite itself (`beforeDevCommand`) and opens the real webview window. requires rust plus the tauri platform deps (macos: xcode clt; linux: webkit2gtk). the shell is scaffolded but has not been compiled anywhere yet — deliberately deferred until after the money test.

the runtime writes `runtime.json` and `admin.token` into its root at startup; the tauri shell reads those to broker rpc calls so the token never enters the webview.

## honesty rules

every permission and privacy control carries an enforcement label — `enforced`, `advisory`, or `roadmap` — and the schema constrains which labels each field may carry, so an over-claiming manifest is unrepresentable. every `enforced` field must map to a passing automated test or the build fails (`pnpm check:guarantees`). mortal separates browser state, files, and context; it does not make identities anonymous in version one.

## screenshot pipeline

`pnpm screenshots` boots the real runtime + manager dev stack against a dedicated throwaway fixture root (created by the script, destroyed on exit — never `~/.mortal`), provisions the showcase state through the public rpc surface — persistent client operations; an onchain investigation running with ~18m remaining of a 45m lifetime; one destroyed investigator with its complete destruction receipt — and captures real app renders with playwright at 1600×1000 (consistent theme, reduced motion, no caret). output lands in `artifacts/screenshots/` under stable filenames:

```
home.png  identity-overview.png  permissions.png  lifecycle.png  receipt.png
```

these are the images the marketing site embeds. they are real renders of the real app against a real runtime — regenerate them whenever the manager ui changes and commit the results. the ~18m countdown is staged by moving the identity's actual deadline rows (the same technique the scheduler tests use); the runtime then honors that deadline for real.

## the mortal mcp server (agent identity layer, v1)

`@mortal/mcp` gives any mcp agent identity primitives as a thin wrapper over the runtime's typed api. add it to an mcp client (claude code, etc.):

```jsonc
{ "mcpServers": { "mortal": { "command": "node", "args": ["packages/mcp/dist/cli.js"] } } }
```

v1 tools — exactly six, deliberately: `identity_create` · `identity_launch` · `identity_status` · `identity_destroy` · `blueprint_list` · `capabilities`. discovery reads `runtime.json` + `admin.token` from the runtime root (`--root` / `$MORTAL_ROOT` / `~/.mortal`), or `$MORTAL_PORT` + `$MORTAL_ADMIN_TOKEN`.

hard safety properties (tested in `packages/mcp/test`): an agent can only attach to identities mortal launched — no api enumerates or reaches the operator's browser; no tool extends a lifetime (expiry is the runtime scheduler's); every permission in every result carries its enforcement level so agent code can feature-detect (`capabilities` also lists mortal's explicit non-guarantees); destruction is scoped and journaled.

`pnpm demo:agent` runs the flagship loop end to end against a throwaway root: scoped identity created with a 15m lifetime → cdp endpoint for that one browser → real work → destruction receipt handed back → a persistent identity untouched throughout. receipt signing lands in a later phase; until then the receipt is real but unsigned, and the demo says so.



