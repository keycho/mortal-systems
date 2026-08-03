# decisions log

implementation choices not specified in the poc spec, and deviations from it.
format: date · decision · reason · alternatives rejected.

---

## 2026-08-03 · repository inspection result: empty repo, nothing to preserve

- **decision:** the canonical `keycho/liminal.id` repository was inspected as the first action. it contained zero commits and zero files (fresh clone, unborn branch). the monorepo is scaffolded from scratch at the repository root; no existing files were moved, restructured, or destroyed.
- **reason:** the spec requires inventorying existing contents before scaffolding and preserving anything useful. there was nothing to preserve or conflict with.
- **alternatives rejected:** none applicable.

## 2026-08-03 · build environment: linux container, node 22, bundled chromium

- **decision:** development and verification happen in a headless linux container (node 22.22.2, pnpm 10, chromium 141 at `/opt/pw-browsers/chromium`). the runtime targets node >= 20 as specified; node 22 is what executes here. chromium launches in tests use `--headless=new`, `--no-sandbox` (process runs as uid 0), and `--disable-dev-shm-usage`, and tests point discovery at the bundled chromium via the `LIMINAL_BROWSER_PATH` env override.
- **reason:** the spec targets macos first with system chrome; neither macos nor a display server exists in this environment. headless-new chromium is a real chromium (same profile/network/storage stacks), so isolation and lifecycle behavior verified here is real, but macos-specific paths and windowed behavior (window title, theme color, visible countdown) are **untested here** and flagged as such. windows paths/process handling are written but untested, as the spec allows.
- **alternatives rejected:** skipping real-browser verification entirely (would violate the honesty rules); bundling a separate chromium download (unnecessary, one is present).

## 2026-08-03 · at-rest encryption of notes/ai content deferred to mvp

- **decision:** `notes.body_md` and `ai_messages.content` are stored unencrypted in sqlite for the poc.
- **reason:** the poc spec explicitly allows this simplification. mvp will add at-rest encryption with key custody in the os keychain (macos keychain / windows credential manager / linux secret service).
- **alternatives rejected:** ad-hoc passphrase encryption now (would ship a fake control with no real key custody story, violating the honesty rules).

## 2026-08-03 · manager/tests transport: loopback http rpc with an admin bearer token

- **decision:** the runtime exposes one typed rpc surface (`POST /v1/rpc`) on `127.0.0.1` with a random port and an admin bearer token, defined in `@liminal/schema`. the tauri shell will broker this to the manager ui via a thin `runtime_call` command (spawning the runtime as a sidecar and passing it the endpoint + token); in browser dev mode the vite server proxies to the same endpoint. the companion's identity-scoped `/v1/self/*` surface (day 3) is separate and uses per-identity tokens.
- **reason:** one api implementation serves the manager, tests, and future sdk identically, and it is exercisable headlessly in ci. implementing a parallel pure-tauri-ipc contract would duplicate the api surface without adding enforcement.
- **alternatives rejected:** direct tauri ipc as the only manager transport (untestable without a display and a rust build), unix domain sockets (worse windows story for the poc).

## 2026-08-03 · deletion contract implemented in day-1/day-2 window, scheduler stays day 5

- **decision:** the journaled destroy contract (D0–D7) is implemented alongside the store rather than as a day-5 rewrite of a temporary "rows-only" destroy. on day 1 the filesystem steps (D2–D4) are naturally no-ops because nothing is provisioned yet; once the day-2 launcher exists they operate on real profile/files directories with no code change. the lifecycle scheduler (tick, catch-up, grace) remains day-5 scope and is not built yet.
- **reason:** a throwaway rows-only destroy would be replaced within 24 hours; the contract's halt/remove primitives are also exactly what suspend/teardown needs on day 2. every step is idempotent, so running the full contract against an unprovisioned identity is correct, not speculative.
- **alternatives rejected:** shipping a temporary destroy and rewriting it (churn, and two deletion behaviors to document honestly).

## 2026-08-03 · companion token scheme: per-identity hmac, no schema change

- **decision:** per-identity companion bearer tokens are derived as `base64url(hmac-sha256(secret, identityId))` where the secret is generated once per runtime install and stored in the `settings` table. verification is recomputation; the plaintext token is written only into the stamped companion instance config (day 3).
- **reason:** the spec's sqlite schema (migration 0001) has no token table, and adding one would deviate from the specified schema. hmac derivation gives stable per-identity tokens, strict token→identity mapping, and no plaintext token storage in the db.
- **alternatives rejected:** a new tokens table (schema deviation), storing plaintext tokens in `settings` (worse at-rest posture).

## 2026-08-03 · react versions: manager pinned to react 18, web will use next 15 defaults

- **decision:** the manager app uses react 18 as the spec pins; `apps/web` (day 7 scope, not yet built) will use next.js 15 with its default react 19.
- **reason:** the spec pins react 18 for the manager only. pnpm workspaces isolate the two react majors cleanly.
- **alternatives rejected:** forcing one react version across both apps (no benefit, fights framework defaults).
