# manual checks — honest pass/fail record

checks that cannot run in the headless linux build container. each entry
records who ran it, where, and exactly what happened. nothing here is marked
pass without having been performed.

## M1 · macos launcher + companion smoke suites — PASS (brave), FAIL-then-explained (branded chrome)

- **2026-08-03 · founder-run · macos, brave via `MORTAL_BROWSER_PATH` → 55/55 runtime tests green**, including both companion smoke suites (per-identity extension ids, origin pinning, symlinked-root regression).
- earlier failures on the same machine, fully explained and closed:
  - **branded chrome 141 ignores `--load-extension`** (removed in 137, risk r3). the only `chrome-extension://` target was chrome's built-in hangouts component (`nkeimhogjdpnpccoofpliimaahmaaome`, constant key-derived id), which the old observation logic mispinned and the id tests compared against. fixed: companion-shaped target chooser + explicit "companion did not load" runtime warning; verified chain in DECISIONS.md.
  - **environmental noise on the test machine**: gatekeeper first-launch latency on the browser binary, and an overbroad `pkill` that killed the esbuild service process; a clean `node_modules` resolved the latter.
- consequence, stated plainly: on branded google chrome the companion currently cannot load at all. chromium and brave work. store distribution (with a pairing handshake) is designed but not built — see DECISIONS.md and threat-model.md.

## R1 · google sign-in completes inside an identity (electron-trap regression) — PASS

- **2026-08-03 · founder-run · macos, renamed (mortal systems) build:** sign-in completed inside an identity with no "browser not secure" block; session persisted. recorded alongside the migration verification (spaces survived the ~/.liminal -> ~/.mortal move).

original steps kept for re-runs:

steps, for whoever runs it on macos with a windowed browser:
1. `pnpm dev:runtime`, create an identity in the manager, launch it (chromium or brave until store distribution exists).
2. in the identity's window, sign in to a google account (accounts.google.com).
3. pass = sign-in completes without the "this browser may not be secure" block, session persists across a suspend/resume.
record the result here with date, os, browser + version.

## R2 · metamask or phantom operates inside a crypto identity — PASS

- **2026-08-03 · founder-run · macos, renamed build:** wallet extension installed from the store inside the crypto identity, unlocked, connected to a dapp; absent from other identities' windows. a live expiry was witnessed and recorded in the same session (countdown -> grace -> close -> destruction report).

original steps kept for re-runs:

steps:
1. create an identity from the crypto-operations blueprint (day-5 build) or any persistent identity.
2. install metamask (`nkbihfbeogaeaoehlefnkodbefgpgknn`) or phantom from the chrome web store inside that identity's window.
3. create/unlock a throwaway wallet, connect to a dapp.
4. pass = extension installs, unlocks, connects; and it is absent from every other identity's window.
record the result here with date, os, browser + version.
