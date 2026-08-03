# progress log — poc days 1–2

one line per completed step. failures recorded honestly.

- 2026-08-03 day1/step0: inspected existing repo per spec — zero commits, zero files; nothing to preserve; recorded in DECISIONS.md
- 2026-08-03 day1/step1: scaffolded pnpm+turborepo monorepo root (package.json, workspace, turbo, tsconfig base, eslint flat config, gitignore)
- 2026-08-03 day1/step2: @liminal/schema complete — zod manifests with per-field enforcement ceilings (over-claiming unrepresentable), duration grammar, blueprint schema (banned content schema-impossible), typed rpc contract; 41/41 unit tests pass; sdk+mcp stubs compile
- 2026-08-03 day1/step3: runtime store — better-sqlite3 wal + foreign keys, migration 0001 (spec schema + state index), typed repo, 7/7 unit tests (chain integrity, transactional migration, tombstone-stable space numbers, D5 idempotency)
- 2026-08-03 day1/step4: runtime api + identity service + journaled destroy — loopback rpc (bearer auth, body caps, typed errors), create/list/get/destroy + activity + status/capabilities, deletion contract D0-D7 with crash-resume; 27/27 runtime tests (2 bugs found by tests and fixed: D7 self-journaling, 413 socket reset)
- 2026-08-03 day1/step5: manager skeleton — react 18 + vite + tailwind identity cards ("space NNN", state pill, countdown), create form, status bar, typed rpc client (tauri broker or vite proxy); src-tauri scaffolded but NOT compiled here (no webkit2gtk, flagged); vite build green, 4/4 component tests

## day-1 gate — PASS (2026-08-03)

```
@liminal/schema:test:  Test Files  4 passed (4)
@liminal/schema:test:       Tests  41 passed (41)
@liminal/runtime:test:  Test Files  3 passed (3)
@liminal/runtime:test:       Tests  27 passed (27)
manager:test:          Test Files  1 passed (1)
manager:test:               Tests  4 passed (4)
Tasks: 4 successful, 4 total   (turbo run test — includes builds of schema/runtime deps)
```

day-1 scope delivered: repo inspected (empty), monorepo scaffold, @liminal/schema (manifest invariants, enforcement ceilings, duration grammar, blueprint schema), sqlite store + migration 0001, identity create/list/get over loopback rpc, journaled destroy D0-D7 with crash-resume unit coverage, manager skeleton listing identity cards. src-tauri shell: scaffold only, unbuilt in this container (honest flag). proceeding to day 2.
- 2026-08-03 day2/step1: chromium discovery (env override > chrome > chromium > brave, per-os paths, version parse, branded-chrome r3 warning) + provisioning (partition dirs, preferences seed: downloads dir/profile name/bookmark bar/theme color best-effort, bookmarks file from db)
- 2026-08-03 day2/step2: launcher — spawn with per-identity --user-data-dir, DevToolsActivePort -> cdpEndpoint plumb-through, process-tree supervision (sigterm/sigkill-after-5s/verify), suspend/resume, real D2 halt wired into destroy, retainHistory scrub on session end, stale-state reconciliation at startup

## day-2 gate — PASS (2026-08-03)

```
@liminal/schema:test:   Test Files  4 passed (4)   Tests  41 passed (41)
@liminal/runtime:test:  Test Files  4 passed (4)   Tests  32 passed (32)
manager:test:           Test Files  1 passed (1)   Tests   4 passed (4)
Tasks: 4 successful, 4 total

launcher smoke suite (real chromium 141, headless, bundled at /opt/pw-browsers/chromium):
 ✓ discovers a launchable browser and reports it in status
 ✓ launches two identities simultaneously with separate user-data dirs and live cdp endpoints
 ✓ suspend terminates the process tree, preserves the profile; resume relaunches
 ✓ scrubs history artifacts on session end iff retainHistory is false
 ✓ destroys a running identity (real D2 halt) without touching its neighbor
```

environment caveats, stated honestly: verified with headless chromium 141 on linux (real chromium: same profile/storage/process semantics). macos windowed behavior (window title, theme color, visible ui) untested here; windows process/paths written but untested. proceeding to day 3.
- 2026-08-03 day3/step1: per-identity token auth — hmac-derived companion tokens (no token table, secret in settings, plaintext only in stamped configs), /v1/self surface (self, notes crud, ai context/messages, in-memory ai key, permissions with enforcement labels, expire, sse events with tick + t-10m/t-1m warnings), per-token rate limit, chrome-extension origin pinning via computed unpacked-extension id
- 2026-08-03 day3/step2: companion template (mv3, esbuild) — background badge (identity color + remaining), content-script corner badge + title suffix (collects nothing), side panel with live sse countdown + expire confirm, day-4 panels stubbed honestly; launcher stamps template per identity and rewrites config every launch (random port per start)

## day-3 gate — PASS (2026-08-03)

```
@liminal/schema:test:   Test Files  4 passed (4)   Tests  41 passed (41)
@liminal/runtime:test:  Test Files  6 passed (6)   Tests  47 passed (47)
companion:test:         Test Files  1 passed (1)   Tests   2 passed (2)
manager:test:           Test Files  1 passed (1)   Tests   4 passed (4)
Tasks: 6 successful, 6 total

day-3 specifics inside the runtime suite:
 self-api (G18 shape, no browser): distinct per-identity tokens · all self routes 401 without/with garbage tokens ·
   A's note invisible/immutable/undeletable via B's token (404 everywhere) · ai context+messages+keys scoped per token ·
   ai key never persisted (db scan) · permissions carry enforced/advisory/roadmap labels · origin pinning: foreign
   Origin and foreign chrome-extension origin -> 403 · sse tick stream live · POST /v1/self/expire destroys (onExpiry)
   and the dead identity's token stops resolving; neighbor untouched
 companion smoke (real chromium 141): one stamped instance per identity (own token, current port) · chromium assigns
   exactly the runtime-computed unpacked extension id per identity (sha256-path algorithm verified against the real
   browser) · A's companion absent from B and vice versa · stamped token + pinned origin authenticate end to end
```

caveat, stated honestly: G18 here is the runtime-level token-scoping test; the full in-browser companion-to-companion variant belongs to the day-6 isolation suite (waiting on user go-ahead). visual badge/side-panel rendering not asserted headlessly. proceeding to day 4.
