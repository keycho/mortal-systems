# mortal cli — runtime inspection notes (pre-implementation)

what the cli wraps, recorded before writing code. the mortal cli is a **client**
of the running runtime; it adds no runtime capability.

## two clis, not one

`packages/runtime/src/cli.ts` (bin `mortal-runtime`) **serves** the runtime
(`serve`, `version`). the mortal cli (bin `mortal`, this package) is the
user-facing client that talks to an already-running runtime over its local api.
they are separate programs; nothing here forks or embeds the runtime.

## transport (reused, not invented)

- loopback http on `127.0.0.1:<port>`. the port is random per start (dev:
  `pnpm dev:runtime` pins 4923).
- discovery: once serving, the runtime writes into its root
  (`~/.mortal` by default, `MORTAL_ROOT` override, `resolveRoot()` expands `~`):
  - `runtime.json` — `{ port, pid, version, root, startedAt }`
  - `admin.token` — `{ token }` (mode 0600)
  the manager's tauri shell and the lifecycle test suite connect exactly this
  way; the cli does the same. stale `runtime.json` is possible after a crash,
  so reachability is verified with `GET /v1/health` (no auth) →
  `{ ok, service: "mortal-runtime", version }`.
- admin rpc: `POST /v1/rpc` with `Authorization: Bearer <admin token>`, body
  `{"method": string, "params"?: object}`, response envelope
  `RpcResponse<T> = { ok: true, result } | { ok: false, error: RpcError }`.
  `RpcError = { code, message, enforcement?, issues? }` — `issues` carries real
  zod paths/messages; `enforcement: "roadmap"` rides on NOT_IMPLEMENTED so
  clients can feature-detect. http status mirrors the code (404/409/400/501/
  401/424/...) but the json body is authoritative.
- max request body 600kb; keep-alive is not worth reusing (1s server timeout) —
  one fetch per call.
- `/v1/self` is the **companion's** identity-scoped surface with per-identity
  hmac tokens. the cli never touches it; admin rpc only.

## rpc contract (from `@mortal/schema` api.ts — the cli's type source)

`RpcContract` maps method → params/result end to end. methods the cli uses:

| method | params | result |
|---|---|---|
| `runtime.status` | `{}` | `RuntimeStatus` (version, root, port, pid, startedAt, browsers[], defaultBrowser, identitiesRunning, warnings[]) |
| `runtime.capabilities` | `{}` | `RuntimeCapabilities` `{ enforceable[], advisory[], roadmap[], reservedMethods[] }` — real schema field lists |
| `identity.list` | `{ filter?: { state?: IdentityState[] } }` | `IdentitySummary[]` |
| `identity.get` | `{ id }` (id must match `idn_…`) | `{ summary, manifest \| null }` (manifest null once destroyed; tombstone remains) |
| `identity.create` | `{ manifest: IdentityManifest }` | `IdentitySummary` — takes a **full manifest**; clients compose it |
| `identity.createFromBlueprint` | `{ blueprintId, overrides? }` | `IdentitySummary` |
| `identity.launch` / `identity.resume` | `{ id }` | `{ pid, cdpEndpoint \| null }` |
| `identity.suspend` | `{ id }` | `null` |
| `identity.destroy` | `{ id, reason? }` | `DestructionReport` |
| `blueprint.list` | `{}` | `BlueprintSummary[]` (no permissions — fetch `blueprint.get` per id for those) |
| `blueprint.get` | `{ id }` (`bpt_…`) | `{ summary, manifest: BlueprintManifest }` |
| `activity.read` | `{ identityId, limit? }` | `ActivityEvent[]` (readable after destruction, by design) |

`RESERVED_METHODS` (network routes, credential injection, aliases, providers…)
return typed NOT_IMPLEMENTED with `enforcement: "roadmap"`. the cli never calls
them and `mortal capabilities` reports them verbatim.

## creation semantics

`identity.create` validates a complete manifest. the manager composes it
client-side with `composeManifest({ id: generateIdentityId(), name,
createdAt: new Date().toISOString(), color?, lifetime? })` from
`@mortal/schema` — the cli does the same for `mortal create <name>` without
`--blueprint`. profile/files paths are runtime-assigned (`profiles/<id>`,
`files/<id>`); compose emits exactly those. with `--blueprint`, the cli calls
`identity.createFromBlueprint` with `overrides.lifetime`/`name` and never
carries recommended extensions implicitly (consent is explicit by contract).

## duration grammar (real validation, real errors)

`@mortal/schema` duration.ts: `"persistent"` or `<positive int><s|m|h|d>`,
bounds 30s–365d, no compound forms. `parseLifetimeMs` throws `DurationError`
with the canonical messages — the cli validates `--lifetime` with it and prints
that error text, not a homemade one. `formatRemaining(ms)` is the countdown
formatter (`05m 00s`, `04h 18m`, `03d 00h` — zero-padded fixed width, which is
the tabular-numerals feel for terminal columns).

## identity states and lifecycle

states: created → provisioning → ready → running ⇄ suspended, expiring,
destroying → destroyed, archived. launch is permitted from
`created | ready | suspended` only (`LAUNCHABLE_STATES`); everything else is a
typed INVALID_STATE. `identity.resume` is literally launch; suspend terminates
the process and keeps all state. destroyed rows are tombstones
(`{ id, name, destroyedAt }`) with summary placeholders (lifetime `"-"`,
storage 0). names are **not** unique — only ids are. the cli resolves
`<id|name>` client-side via `identity.list`: exact id first, then exact name
among non-destroyed identities; ambiguity is an error listing candidates.

## launcher / cdp endpoint

each identity's browser is its own chromium process on its own
`--user-data-dir`, with `--remote-debugging-port=0`; the launcher reads
`DevToolsActivePort` and records `ws://127.0.0.1:<port><wsPath>`. the endpoint
is scoped because it is that identity's process — controlling it controls
nothing else. launch re-returns the existing `{ pid, cdpEndpoint }` if already
running (idempotent). browser discovery: `MORTAL_BROWSER_PATH` override, then
chrome stable, chromium, brave standard paths; no browser found is a
`BROWSER_NOT_FOUND` (http 424) whose message already contains install
instructions — print it verbatim. `runtime.status.warnings` carries honest
operational warnings, notably branded chrome being unable to load the
companion (killswitch removed in chrome >=141; chromium/brave are the
fallback, the web store listing the eventual chrome path; isolation via
--user-data-dir is unaffected) — `mortal status` must surface these, not
swallow them.

## destroy contract

`identity.destroy` runs the journaled deletion contract D0–D7
(`DESTROY_STEP_LABELS` has the human labels: capture, fence, halt process
tree, remove profile, remove files/downloads/companion, delete
notes/ai/bookmarks rows, tombstone, finalize). result is a
`DestructionReport { identityId, startedAt, completedAt, resumed, steps:
[{ step, ok, detail }], caveats }`. step details carry real counts ("deleted
rows: 2 notes, 0 ai messages, 5 bookmarks"). `caveats` is always the full
`DESTRUCTION_CAVEATS` list — **never trimmed** in cli output, human or json.
destroying an already-destroyed identity → INVALID_STATE. concurrent destroys
join the in-flight run.

## enforcement honesty (the labels the cli must carry everywhere)

`ENFORCEMENT_TABLE` in schema enforcement.ts is the single source: field,
label, value space, enforcement (`enforced | advisory | roadmap`), honest
description. `runtime.capabilities` returns the derived
`ENFORCED_FIELDS / ADVISORY_FIELDS / ROADMAP_FIELDS`. manifests carry
per-permission `{ value, enforcement }` with schema-level ceilings (wallet
can literally not claim "enforced"). cli rules that follow: every permission
printed shows its enforcement label; `capabilities` renders the real table;
advisory is never styled or worded as enforced. `DESTROYED_MEANS` /
`NON_GUARANTEES` are available verbatim where destruction is displayed.

## repo rules that bind this package

- **workspace-build rule** (docs/DECISIONS.md 2026-08-03): nothing resolves a
  workspace package without turbo guaranteeing its build. the cli builds via
  the root turbo `build` task (`dependsOn ^build` → `@mortal/schema` dist
  exists first), and every documented entry point boots turbo-built artifacts.
- **cli-boot-smoke discipline**: `pnpm check:cli` boots the runtime's BUILT
  dist against a clean root (scripts/smoke-cli.mjs). the mortal cli gets the
  same: a smoke script that turbo-builds runtime + cli (+ companion for
  launch), starts a fixture runtime on a temp root, then runs the built
  `mortal` bin through status/create/launch/list/destroy/capabilities and
  asserts exit codes. headless launch works in ci via
  `MORTAL_BROWSER_PATH=/opt/pw-browsers/chromium` + `MORTAL_HEADLESS=1`
  (the pattern tests/helpers/world.ts already uses).
- **honesty labels**: see above; also no crypto framing in help/examples —
  neutral examples (research session, vendor audit, contract review).

## dependencies plan (small on purpose)

node ≥20 is guaranteed by the repo. `node:util` `parseArgs` handles flags;
command dispatch is a switch (same as the runtime cli). color = raw ansi
behind a tty check (`NO_COLOR`/`TERM=dumb`/pipe → plain). table = a
column-width formatter over `formatRemaining`. so runtime deps =
`@mortal/schema` only; dev deps = typescript/vitest/@types/node from the
catalog. json mode prints rpc results (the already-typed contract shapes) to
stdout, errors to stderr, exit 0/1/2 (2 = usage, 1 = runtime/remote failure).
