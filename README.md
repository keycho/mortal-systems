# liminal

launch private identities that disappear when their work is done.

a programmable privacy and identity runtime for humans and autonomous agents. every identity is a manifest-defined runtime object with its own real chromium instance, notes, ai context, files, permissions, and a finite lifecycle. the user-facing environment is a **space**; the canonical term in all code, schemas, and apis is `identity`.

**build status is tracked honestly** in [docs/PROGRESS.md](docs/PROGRESS.md) (per-day gates with pasted test output) and [docs/DECISIONS.md](docs/DECISIONS.md) (every deviation from the poc spec). days 1–4 of the poc are built and gated; the lifecycle scheduler, blueprint pipeline, browser-level isolation suite, and public site are not built yet.

## structure

```
apps/
  manager/     liminal manager — react ui + tauri 2 shell (ui only, never a browser)
  companion/   liminal companion — mv3 extension stamped per identity
  web/         public liminal.id site (day-7 scope, not built yet)
packages/
  schema/      @liminal/schema — zod manifests, api types, constants (imported by everything)
  runtime/     @liminal/runtime — the local service: identities, lifecycle, deletion, api
  sdk/         @liminal/sdk — stub, types only
  mcp/         @liminal/mcp — stub, empty
docs/          PROGRESS.md · DECISIONS.md
```

all identity state lives under the runtime root (`~/.liminal` by default): `liminal.db`, `profiles/`, `files/`, `companion-instances/`. never inside the repository.

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
   starts the liminal runtime on port 4923 with the dev admin token (`liminal-dev`), root at `~/.liminal` (override with `LIMINAL_ROOT`).
2. **manager ui (browser dev mode)** — `pnpm dev:manager`
   vite on http://localhost:5173, proxying `/runtime` to the runtime above. this is a browser tab, not the native window; it is the primary dev loop and works on any platform with no rust toolchain.
3. **native window (optional)** — `pnpm --filter manager tauri:dev`
   tauri dev owns starting vite itself (`beforeDevCommand`) and opens the real webview window. requires rust plus the tauri platform deps (macos: xcode clt; linux: webkit2gtk). the shell is scaffolded but has not been compiled anywhere yet — deliberately deferred until after the money test.

the runtime writes `runtime.json` and `admin.token` into its root at startup; the tauri shell reads those to broker rpc calls so the token never enters the webview.

## honesty rules

every permission and privacy control carries an enforcement label — `enforced`, `advisory`, or `roadmap` — and the schema constrains which labels each field may carry, so an over-claiming manifest is unrepresentable. every `enforced` field must map to a passing automated test or the build fails (`pnpm check:guarantees`). liminal separates browser state, files, and context; it does not make identities anonymous in version one.
