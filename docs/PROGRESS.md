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
