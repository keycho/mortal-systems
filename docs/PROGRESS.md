# progress log — poc days 1–2

one line per completed step. failures recorded honestly.

- 2026-08-03 day1/step0: inspected existing repo per spec — zero commits, zero files; nothing to preserve; recorded in DECISIONS.md
- 2026-08-03 day1/step1: scaffolded pnpm+turborepo monorepo root (package.json, workspace, turbo, tsconfig base, eslint flat config, gitignore)
- 2026-08-03 day1/step2: @mortal/schema complete — zod manifests with per-field enforcement ceilings (over-claiming unrepresentable), duration grammar, blueprint schema (banned content schema-impossible), typed rpc contract; 41/41 unit tests pass; sdk+mcp stubs compile
- 2026-08-03 day1/step3: runtime store — better-sqlite3 wal + foreign keys, migration 0001 (spec schema + state index), typed repo, 7/7 unit tests (chain integrity, transactional migration, tombstone-stable space numbers, D5 idempotency)
- 2026-08-03 day1/step4: runtime api + identity service + journaled destroy — loopback rpc (bearer auth, body caps, typed errors), create/list/get/destroy + activity + status/capabilities, deletion contract D0-D7 with crash-resume; 27/27 runtime tests (2 bugs found by tests and fixed: D7 self-journaling, 413 socket reset)
- 2026-08-03 day1/step5: manager skeleton — react 18 + vite + tailwind identity cards ("space NNN", state pill, countdown), create form, status bar, typed rpc client (tauri broker or vite proxy); src-tauri scaffolded but NOT compiled here (no webkit2gtk, flagged); vite build green, 4/4 component tests

## day-1 gate — PASS (2026-08-03)

```
@mortal/schema:test:  Test Files  4 passed (4)
@mortal/schema:test:       Tests  41 passed (41)
@mortal/runtime:test:  Test Files  3 passed (3)
@mortal/runtime:test:       Tests  27 passed (27)
manager:test:          Test Files  1 passed (1)
manager:test:               Tests  4 passed (4)
Tasks: 4 successful, 4 total   (turbo run test — includes builds of schema/runtime deps)
```

day-1 scope delivered: repo inspected (empty), monorepo scaffold, @mortal/schema (manifest invariants, enforcement ceilings, duration grammar, blueprint schema), sqlite store + migration 0001, identity create/list/get over loopback rpc, journaled destroy D0-D7 with crash-resume unit coverage, manager skeleton listing identity cards. src-tauri shell: scaffold only, unbuilt in this container (honest flag). proceeding to day 2.
- 2026-08-03 day2/step1: chromium discovery (env override > chrome > chromium > brave, per-os paths, version parse, branded-chrome r3 warning) + provisioning (partition dirs, preferences seed: downloads dir/profile name/bookmark bar/theme color best-effort, bookmarks file from db)
- 2026-08-03 day2/step2: launcher — spawn with per-identity --user-data-dir, DevToolsActivePort -> cdpEndpoint plumb-through, process-tree supervision (sigterm/sigkill-after-5s/verify), suspend/resume, real D2 halt wired into destroy, retainHistory scrub on session end, stale-state reconciliation at startup

## day-2 gate — PASS (2026-08-03)

```
@mortal/schema:test:   Test Files  4 passed (4)   Tests  41 passed (41)
@mortal/runtime:test:  Test Files  4 passed (4)   Tests  32 passed (32)
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
@mortal/schema:test:   Test Files  4 passed (4)   Tests  41 passed (41)
@mortal/runtime:test:  Test Files  6 passed (6)   Tests  47 passed (47)
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
- 2026-08-03 day4/step1: companion panels — notes editor (crud against /v1/self), ai panel (scoped instructions, local chat log, byok key held in runtime memory, direct provider call from panel with graceful no-key degradation), permissions panel with solid/outlined/dashed badges + wallet declaration disclaimer; pure renderers unit-tested (BADGE-1 companion half)
- 2026-08-03 day4/step2: manager — manifest view (permissions/privacy with enforcement badges, lifecycle, ai instructions, blueprint ref with unsigned marker, raw json toggle), activity log with full destruction-report rendering (steps table, caveats, resumed flag), detail drawer wired to cards; EnforcementBadge solid/outlined/dashed tested (BADGE-1 manager half)
- 2026-08-03 day4/step3: guarantees gate script added — fails by design until tests/guarantees.map.ts exists (day 6); lint clean; typecheck green across 7 packages

## day-4 gate — PASS (2026-08-03)

```
@mortal/schema:test:   Test Files  4 passed (4)   Tests  41 passed (41)
@mortal/runtime:test:  Test Files  6 passed (6)   Tests  47 passed (47)
companion:test:         Test Files  2 passed (2)   Tests   6 passed (6)
manager:test:           Test Files  2 passed (2)   Tests   9 passed (9)
Tasks: 6 successful, 6 total          (103 tests)

pnpm lint:        clean
pnpm typecheck:   Tasks: 7 successful, 7 total
check:guarantees: FAIL BY DESIGN — tests/guarantees.map.ts is day-6 scope; 6 enforced fields currently unmapped
```

---

# final status report — stopped at end of day 4 as instructed (2026-08-03)

## what works, each behind a passing automated test
- @mortal/schema: canonical zod manifest with per-field enforcement ceilings (an over-claiming manifest is unrepresentable), lifetime grammar (30s..365d + persistent), blueprint schema where banned content (cookies/sessions/passwords/keys/seeds/accounts) is schema-impossible, url hygiene (http(s) only, no creds, punycode surfaced), typed rpc contract. 41 tests.
- runtime store: better-sqlite3 wal + fk, migration 0001 per spec (forward-only, transactional, chain-gap detection), tombstone-stable space numbers. 
- identity lifecycle: create/list/get over loopback rpc with bearer admin auth; state machine enforcing legal transitions; activity log append-only, surviving destruction.
- deletion contract D0-D7: journaled, ordered, aborts at first failure, idempotent, crash-resumable (simulated crash between D2 and D3 resumes to completion); tombstone + finalized destruction report with fixed caveats. implemented early (day-1 window) per DECISIONS.md; unit-tested, including failure-retention and resume.
- chromium launcher (day 2): discovery (env override, chrome/chromium/brave, per-os paths, branded-chrome r3 warning), provisioning (partition dirs, preferences seed for downloads dir + profile name + bookmark bar, bookmarks file), launch with per-identity --user-data-dir, DevToolsActivePort -> cdpEndpoint, process-tree supervision, suspend/resume, retainHistory scrub, real D2 halt. verified against real chromium 141 headless: two identities simultaneously, distinct live cdp endpoints, destroy-while-running with non-contagion.
- companion + tokens (day 3): mv3 template (badge, corner content badge + title suffix, side panel with live sse countdown + expire confirm), per-identity stamping with hmac-derived tokens (config rewritten each launch for the rotating port), /v1/self surface (self/notes/ai/permissions/expire/events), per-token rate limit, origin pinned to the runtime-computed unpacked extension id — the sha256-path algorithm was verified against what chromium actually assigned. runtime-level G18 shape green: token A against B's resources fails everywhere; destroyed identities' tokens stop resolving.
- day 4: companion notes/ai/permissions panels (byok key in runtime memory only, verified never persisted), manager manifest view + activity log with destruction-report rendering, enforcement badges solid/outlined/dashed tested in both uis (BADGE-1 both halves).

103 automated tests green at the day-4 gate; every day gate output is pasted above; every step committed and pushed to claude/new-session-lz1cvn.

## what is partial or unverified, honestly
- src-tauri shell: scaffolded (Cargo.toml, tauri.conf.json, runtime_call broker, sidecar spawn) but NEVER COMPILED — this container lacks webkit2gtk and the poc targets macos. treat all rust code as unreviewed-by-a-compiler.
- macos and windows: all launcher paths written per spec but only linux was executed. windowed (non-headless) behavior — window title suffix, theme color, visible badges/panels — is implemented but visually unverified here.
- countdown/expiry: countdowns and warnings are live (sse), and expiry RUNS ONLY when triggered manually (identity.expire rpc or the side panel's close-early). the scheduler that fires expiry automatically at the deadline — plus startup catch-up (expired_late) and the 60s grace path — is day-5 scope and NOT BUILT. nothing currently auto-destroys at zero; the ui does not pretend otherwise (it shows remaining time, not a promise).
- ai chat: provider call implemented (byok, direct from panel) but not exercised against the live api (no key in this environment).

## not built (waiting on your go-ahead, per your instruction)
- day 5: blueprint pipeline (validate/install/preview/export), the 3 first-party blueprints, lifecycle scheduler (tick, catch-up, grace).
- day 6: browser-level isolation suite G1-G17 + lifecycle suite G10-G14, self-hosted login fixture server, tests/guarantees.map.ts (the check:guarantees gate fails by design until then).
- day 7: apps/web (landing + guarantees page + vercel config), guarantees.md / deletion-contract.md / threat-model.md / manual-checks.md, acceptance-criteria run.
- manual checks R1 (google sign-in) and R2 (metamask): impossible in this headless container; recorded as NOT RUN.

## the honest one-liner
days 1-4 of the poc are built, gated, and green (103 tests, real chromium for launch/isolation-surface/companion smoke); automatic scheduled expiry, blueprints, the full G-suite, and the public site are deliberately untouched and wait for founder go-ahead on days 5-7.
- 2026-08-03 fix/macos-extension-id: canonicalized runtime root at startup (realpath) + launcher now observes the chromium-assigned extension id via cdp and the origin check pins to it (computed id as pre-observation fallback); linux repro with symlinked root added and green (105 tests total); macos re-run pending on reporter's machine — see DECISIONS.md
- 2026-08-03 dev-flow: README added documenting the three-process dev flow (dev:runtime, dev:manager browser mode, optional 'pnpm --filter manager tauri:dev' where tauri owns vite); manager gains tauri:dev script; native window compile stays deferred until after the money test
- 2026-08-03 fix/macos-constant-id: verified nkeimhog… is chrome's built-in hangouts component (constant key-derived id) and bare linux chromium has zero extension targets — mac failure = branded chrome 141 ignoring --load-extension (r3), observation mispinned the only visible extension; no manifest key exists (pasted); chooser now accepts only companion-shaped targets (/background.js), refuses to guess, and surfaces a companion-did-not-load runtime warning; 6 new chooser unit tests, both smoke tests re-asserted on the chosen model; 111 tests green on linux; mac re-run pending (chromium/brave or MORTAL_BROWSER_PATH)
- 2026-08-03 macos-verified: founder re-ran on macos under brave — 55/55 green incl. both companion smokes; root cause chain closed (branded chrome --load-extension removal + gatekeeper latency + overbroad pkill on the test machine); recorded as manual check M1; store-distribution pairing handshake designed into DECISIONS.md + threat-model.md (no store submission, no implementation)
- 2026-08-03 day5/step1: lifecycle scheduler — tick over lifecycle_jobs (15s default, test-injectable), startup catch-up before the api serves (missed expiry honored late, expired_late logged, already-honored actions never refire), 60s grace via sse when a browser is open then halt then onExpiry; manual expire stays graceless (user-confirmed); 4/4 scheduler tests incl. real-browser grace; 59/59 runtime tests
- 2026-08-03 day5/step2: blueprint pipeline + first-party blueprints — @mortal/blueprints (client-operations with meeting-notes template + empty client folders, onchain-investigator 12h/destroy/no-history, crypto-operations with declared-wallet disclaimer + metamask/phantom store ids); pipeline: 256kb size gate -> json -> strict zod -> url hygiene, idempotent install, blueprint.get for preview, createFromBlueprint (bookmark/note/folder seeding, expiry job, consent-gated extension declarations), export strips ids/paths/timestamps/notes and must re-pass the import pipeline; cli --seed-first-party; 11 pipeline tests + 4 blueprint content tests; 1 stale day-1 assertion updated (blueprint.list now real)

## day-5 gate — PASS (2026-08-03)

```
@mortal/schema:test:      Test Files  4 passed (4)    Tests  41 passed (41)
@mortal/blueprints:test:  Test Files  1 passed (1)    Tests   4 passed (4)
@mortal/runtime:test:     Test Files 10 passed (10)   Tests  70 passed (70)
companion:test:            Test Files  2 passed (2)    Tests   6 passed (6)
manager:test:              Test Files  2 passed (2)    Tests   9 passed (9)
Tasks: 8 successful, 8 total          (130 tests)

pnpm lint: clean · pnpm typecheck: Tasks: 8 successful, 8 total

day-5 specifics:
 scheduler: due job auto-destroys within tolerance (G10 shape, full deletion contract) · suspend/archive actions run
   once and never refire · startup catch-up honors missed expiry with expired_late before the api serves (G11 shape) ·
   running identity gets an sse grace notice, then halt, then destroy (real chromium)
 blueprints (G17 shape): 256kb gate · malformed json · banned/unknown fields with field-level issues · javascript:/creds
   urls · path extension refs · over-claimed enforcement — all rejected; 3 first-party installed (unsigned, standard
   tier), investigator 5m demo override, consent-gated extension declarations, client-ops folders provisioned into
   chrome bookmarks, export contains nothing session-shaped and re-imports cleanly
```

honest gaps at day-5 close: manager ui has no blueprint install/preview screen yet (the pipeline, preview data api, and consent semantics exist and are tested; the screen itself is upcoming ui work alongside day 6/7). browser-level G10-G14/G1-G17 remain day-6 scope.
- 2026-08-03 fix/brave-interstitial: audited (zero page-open primitives) + verified empirically (zero page-type extension targets after launch on chromium) — the only scriptable surface was toolbar-click sidePanel.open; replaced with native setPanelBehavior (guarded fallback, never a tab), smoke regression guard added asserting the companion never opens a page; brave-specific note added to the store-mode design; companion 6/6 + smoke 3/3 green
- 2026-08-03 day6: browser-level suites — isolation G1-G8+G15+G16+G18b over per-identity cdp with a self-hosted login/cache/download fixture (10/10), lifecycle G10-G14 over a real child-process runtime incl. downtime expiry and mid-destroy crash-resume (4/4); guarantees.map.ts + gate green for real (enforced fields mapped, badge tests verified, mapped test ids must exist); two fix rounds recorded honestly: G8 required un-hijacking playwright's browser-wide download interception, and headless chromium keeps the crdownload name — the partition, not the filename, is the guarantee

## day-6 gate — PASS (2026-08-03)

```
@mortal/schema:test:      Tests  41 passed   @mortal/blueprints:test:  Tests   4 passed
@mortal/runtime:test:     Tests  70 passed   companion:test:            Tests   6 passed
manager:test:              Tests   9 passed   mortal-tests:test:        Tests  14 passed
Tasks: 10 successful, 10 total          (144 tests)

check:guarantees: OK — 6 enforced fields mapped, 4 advisory/roadmap fields badge-tested
pnpm lint: clean · pnpm typecheck: green
```

full pnpm check now passes end to end: every "enforced" label maps to at least one existing, passing test.
- 2026-08-03 rename: liminal -> mortal systems executed as one atomic commit — packages, imports, companion + stamped config, env vars (MORTAL_* with deprecated LIMINAL_* fallback), ~/.liminal -> ~/.mortal migration with db + config renames, legacy manifest upgrade at read time, ui strings, domain refs; 3 migration tests added; github-side repo rename is a founder action (no tool here)
- 2026-08-03 day7: blueprint install preview + consent screen in the manager (full render: badges, unsigned marker, punycode warnings, consent checkboxes, lifetime override, explicit confirm; 2 tests) — closes the day-5 gap; apps/web under the mortal systems brand (landing with approved copy, guarantees page generated from the enforcement table, blueprint previews labeled preview, honest coming-soon download page, vercel config with root dir apps/web); docs: guarantees.md, deletion-contract.md (incl. windows r6 caveat), deploy-web.md

## day-7 / final gate — PASS (2026-08-03)

```
@mortal/schema 41 · @mortal/blueprints 4 · @mortal/runtime 73 · companion 6 · manager 11 · mortal-tests 14
Tasks: 10 successful, 10 total          (149 tests)
pnpm lint: clean · pnpm typecheck: green · check:guarantees: OK · pnpm build:web: green (zero native deps)
```

---

# acceptance criteria — honest final status (2026-08-03)

1. manager opens; create persistent "client acme" — VERIFIED at api + component level; windowed end-to-end run is a founder action on macos
2. investigator blueprint installs with preview + consent; launches < 10s — PASS (pipeline + preview ui tested; real launches complete in ~1-2s on linux chromium and macos brave)
3. both identities run real chrome, separate user-data dirs, simultaneously — PASS (launcher smoke + isolation suite)
4. same site, two accounts at once — PASS (G7, self-hosted login fixture)
5. metamask or phantom operates inside the crypto identity — NOT RUN (R2 manual, needs a windowed browser; steps in docs/manual-checks.md)
6. each window shows unmistakable name, color, countdown — logic tested (badge text, corner badge, sse countdown); visual confirmation partially covered by the founder's macos/brave session, full windowed check open
7. separate notes and ai instructions per identity — PASS (G9 token scoping)
8. investigator runs with a 5-minute demo lifetime visibly counting down — PASS (5m override + sse ticks + warnings tested)
9. permission ui distinguishes enforced / advisory / roadmap — PASS (BADGE-1 in manager, companion, and install preview)
10. expiry fires automatically; deletion contract completes — PASS (G10, G12)
11. client identity unaffected — PASS (G13)
12. activity log shows the full lifecycle incl. destruction report — PASS (api + component tests)
13. google sign-in works inside an identity — NOT RUN (R1 manual; steps in docs/manual-checks.md)
14. malformed/banned blueprints rejected with clear errors — PASS (G17 corpus)
15. runtime killed mid-destroy resumes and completes on restart — PASS (G14, real process kill)

definition-of-done deltas, stated plainly: R1 and R2 are recorded NOT RUN — by the spec's own rule the poc is not "done" until they pass on a windowed machine; everything automatable is green (149 tests), pnpm check passes end to end, build:web carries zero native deps, and the site never claims it can launch identities. remaining founder actions: run R1/R2 on macos, rename the github repo, point vercel at apps/web.
- 2026-08-03 fix/dev-freshness+ci: root dev:* now goes through turbo (deps build before persistent tasks), schema+blueprints gained a development export condition and runtime dev runs tsx --conditions=development (verified resolving from source with dist deleted); new pnpm check:cli boots the built dist/cli.js on a clean root (health, authed rpc, 3 seeded blueprints, clean shutdown) and is wired into pnpm check plus a new github actions workflow running build -> tests -> check on ubuntu
- 2026-08-03 fix/vercel-build: web deploys now build through turbo (`cd ../.. && pnpm turbo run build --filter=web`; install includes the root project for the turbo binary) — verified with a full clean + filtered install exactly as vercel runs it; the "nothing resolves a workspace package without turbo guaranteeing its build" rule recorded in DECISIONS.md

---

# acceptance report — STAMPED (2026-08-03)

founder verification on the renamed (mortal systems) build closed every open item:
- migration verified: ~/.liminal -> ~/.mortal move performed by the runtime; existing spaces 001/002 survived intact
- R1 google sign-in: PASS (founder-run, macos) — recorded in docs/manual-checks.md
- R2 wallet extension operates in the crypto identity: PASS (founder-run, macos) — recorded in docs/manual-checks.md
- expiry witnessed live and recorded: countdown -> grace notice -> browser close -> destruction report in the activity log
- github repository renamed for the brand; web deployed (vercel build fixed to route through turbo)

**all 15 acceptance criteria now PASS.** criteria 1 and 6 (manager create flow; unmistakable name/color/countdown per window) are confirmed by the founder's windowed sessions on top of the component/api coverage; 5 and 13 are the R2/R1 records above; the remaining eleven were already green under the automated suites (149 tests, guarantees gate, cli boot gate, ci workflow).

per the spec's definition of done, the proof of concept is **done**: an identity can be created from a blueprint, launched as an isolated real chromium environment, operated, expired, and destroyed without affecting another identity — every enforced label maps to a passing test, every deviation is in DECISIONS.md, and the non-guarantees are printed where users can see them.

# post-poc — human on-ramp blockers (2026-08-05)

- 2026-08-05 branded-chrome/r3-upgrade: branded google chrome cannot load the companion — killswitch removed in chrome >=141, observed on ci runners (both active branches, same signature). claim upgraded from hedged to definitive everywhere live, single-sourced as BRANDED_CHROME_COMPANION_CAVEAT in @mortal/schema with a check-guarantees wording gate; isolation itself unaffected (--user-data-dir works on branded chrome). ci browser suites moved to playwright chromium (deps + userns + boot-proof).
- **BLOCKER (human on-ramp): companion web store listing.** with sideloading gone from branded chrome, the web store listing is no longer a nice-to-have — it is what makes the companion work for most users (chrome-majority); until it ships, the companion requires chromium or brave. design for store distribution + pairing handshake already exists in docs/threat-model.md. deliberately not built yet.
- manager/v2 stages 1-5: v1 inspected+screenshotted live (inventory in docs/manager-v2-inventory.md, nothing mocked found), @mortal/tokens shared css source, new shell (left nav overview·identities·blueprints·activity·guarantees·settings), identities list, identity workspace with 7 tabs wired to real runtime data (files/memory tabs honest about unreadable data, receipt tab renders the real D0-D7 report); manager tests 11 -> 16, lint+typecheck 12/12+build green; pushed for founder review, stopping per addendum 5
- manager/v2 visual pass: layered charcoal surfaces (+surface tokens in @mortal/tokens), 14px sans base, rich identity rows w/ compact variant, dashboard (metrics, health, expiring-soon, recent events, needs-attention), workspace header, card-based overview tab, icon timeline, state-machine + d0-d7 stepper lifecycle, flagship destruction receipt; 16 tests green, lint+typecheck+build green; 6 screens shot at 1600x1000 against a live runtime (incl. running identity + real receipt)
- manager/v2 three-pane pass: identity navigator (search, groups, countdowns, browser dots) · centre operations pane (header, purpose from real blueprint description, state machine, timeline, honest notes statement) · 400px contextual inspector (browser/files/memory/permissions/lifecycle/receipt, disabled-not-fake focus action, on-screen statements for what rpc cannot show) · receipt v3 (id, outcome grid, evidence collapsed, copy/export) · operational dashboard (running-now dominant card, health strip); 17 tests green, lint clean, build green; 6 states shot at 1600x1000 against a live runtime
- manager/v2 polish pass: application design system in @mortal/tokens (neutral layered surfaces, alpha borders, light-filled primary, status-only colors), 15px sans base, collapsible icon sidebar w/ grouped identities, module-based overview w/ progressive disclosure, grouped activity, destroy behind menu+dialog, toasts, skeleton/empty/error states, receipt restyle w/ summary card + collapsed evidence; lucide icons; 18 tests green, lint+typecheck+build green; 12 states shot at 1600x1000 + 1280/1440 checks
- manager/v2 structural rewrite: home ("what needs its own identity?" prompt -> real create flow, blueprint suggestion chips, active/recent, attention-only-when-relevant, runtime stats out), calmer palette (#212121/#171717/#2b2b2b), sidebar groups active/persistent/ready/receipts w/o color dots, single 880px workspace column (purpose, current-environment list, technical-details drawer), human-readable grouped permissions w/ technical-guarantees disclosures, receipt first-view simplified (d0-d7 behind technical timeline); 18 tests green, lint+typecheck+build green; 10 required states shot at 1600x1000 live
- manager/v2 final polish: burnt-orange brand accent (#c96442) for selected/lifecycle-critical states, brighter text tiers, 960px column, 28px header w/ accent countdown, accent-underline tabs, refined destroy modal (cancel / destroy identity), receipt as proof surface (accent receipt id, real resource counts from step evidence, warnings, subtle seal, d0-d7 collapsed); 18 tests green, lint+typecheck+build green
- manager/v2 receipt correction: surfaces lifted one step (#303030/#3a3a3a/#3d3d3d, 0.08/0.14 borders), text brightened, accent lifted to #d9754f; receipt constrained to 860px as a certificate (accent edge, 0.55 seal, uppercase label + 21px verdict header, elevated verified-outcomes inset, compact metric counts, one visible caveat + collapsed "limits of this receipt"); 18 tests, lint, typecheck, build green
- manager/v2 typography foundation: geist sans bundled locally (@fontsource, 400/500/600) as the primary manager font; identity header rebuilt as glyph + title/metadata block (28/600/1.12/-0.025em/#f7f7f7, 13px spaced metadata, mono only for the short id, sans tabular countdown in accent); tabs 14/500 near-white active over orange underline; sidebar names 14/500; header+tabs constrained to the receipt's 860px; 18 tests, lint, typecheck, build green
- screenshot pipeline: pnpm screenshots boots runtime+manager against a throwaway fixture root, provisions the showcase state via rpc (persistent ops; investigation running ~18m/45m via real deadline rows; destroyed investigator w/ receipt), captures 5 stable-named 1600x1000 renders into artifacts/screenshots (committed; the site embeds these); readme documented
- manager/v2 finish pass: 3-step surface depth w/ bordered panels + shadowed receipt, body copy up one step, accent-filled primary actions + accent focus rings everywhere, pressed states, strict outcome icon grid, tabular numerals, crisper font rendering, ~15% tighter rhythm; 18 tests, lint, typecheck, build green; before/after regenerated via the pipeline
- design exploration: directions a (instrument: true-black 4-step scale, hairline borders, 1px light, no blur) and b (glass: alpha surfaces + 16px backdrop blur, inner light, one running-state glow) implemented as ?theme= overrides on the real app, both captured on the same live running-identity screen; token sheet for both in docs/design/manager-directions.md; default theme untouched; awaiting founder pick before applying across all screens
