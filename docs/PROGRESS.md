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
