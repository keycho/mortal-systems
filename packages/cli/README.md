# @mortal/cli — the `mortal` command

drive the local mortal runtime from the shell: create, launch, inspect,
suspend, and destroy identities, scriptably. a thin client over the runtime's
existing local api (loopback http + admin token, the same transport the
manager uses) — it adds no runtime capability and invents no protocol.

not to be confused with `mortal-runtime` (packages/runtime), which *serves*
the runtime. the `mortal` command talks to a runtime that is already running.

## install (from the workspace)

v1 is a working local bin; publishing to npm is a later release step.

```
pnpm install
pnpm build            # turbo builds @mortal/schema, then this package
pnpm exec mortal --help
```

`pnpm exec mortal` works from the repo root (the bin is linked into
`node_modules/.bin`). for scripts where startup latency matters, call the
built artifact directly: `node packages/cli/dist/cli.js` — the same thing the
boot smoke runs. per the repo's workspace-build rule, always build through
turbo (`pnpm build`); never assume `dist/` exists.

## quick start

the runtime must be running: `pnpm dev:runtime` (root `~/.mortal`, port 4923),
or `mortal-runtime serve --root <dir>`. then a full session, copy-paste:

```
mortal create research --lifetime 15m
mortal launch research            # prints a scoped CDP endpoint
mortal list                       # shows it running, counting down
mortal show research              # environment + enforcement levels
mortal destroy research --yes     # prints the receipt: what was removed
mortal list                       # gone; a persistent identity untouched
```

the agent angle, one line — a script or agent grabs an isolated, scoped
browser endpoint in one command:

```
mortal launch research --json | jq -r .cdpEndpoint
```

the endpoint is that identity's own chromium process; controlling it controls
nothing else. anything speaking cdp (playwright, puppeteer, a raw websocket)
can attach.

## finding the runtime

the runtime writes `runtime.json` (port) and `admin.token` into its root when
it starts; the cli reads them from `~/.mortal` by default. override the root
with `--root <dir>` or `MORTAL_ROOT`. for unusual setups, `MORTAL_RUNTIME_PORT`
and `MORTAL_ADMIN_TOKEN` bypass the files. if the runtime is not reachable,
every command says so and prints how to start it, and exits 1.

## commands

every command takes `--json`, `--root <dir>`, and `--help`.

### `mortal status [<id|name>]`
runtime health: version, root, api address, detected browser, identities
running, and any honest operational warnings (e.g. branded chrome ignoring
`--load-extension`). with an argument it behaves as `mortal show`.
`--json`: the runtime's `RuntimeStatus`.

### `mortal list [--state <state>[,<state>...]]`
identities with name, state, remaining lifetime (fixed-width countdown), id.
destroyed identities are hidden by default — a hint line says how many;
`--state destroyed` shows the tombstones. states: created, provisioning,
ready, running, suspended, expiring, destroying, destroyed, archived, plus
the pseudo-state `persistent` (selects by lifetime, not lifecycle state).
`--json`: `IdentitySummary[]` for the same selection.

### `mortal blueprints`
installed blueprints with description, publisher, recommended lifetime, and
the permissions an identity created from each would get — every permission
with its real enforcement level. `--json`:
`[{ ...BlueprintSummary, permissions, privacy }]` where permissions/privacy
are `{ value, enforcement }` maps.

### `mortal create <name> [--blueprint <id|name>] [--lifetime <l>]`
create an identity from a blueprint (`bpt_` id or exact name) or from a
minimal composed manifest. `--lifetime` is validated with the schema's real
grammar — `persistent` or `<integer><s|m|h|d>` (30s to 365d, no compound
forms); invalid input shows the schema's own error and exits 2 before any
rpc. prints the identity id and its manifest permissions with enforcement
levels. names are not unique — creating a duplicate warns on stderr, since
name-addressing then turns ambiguous. `--json`: `{ summary, manifest }` as
stored by the runtime.

```
mortal create vendor-audit --lifetime 12h
mortal create contract-review --blueprint "Client Operations"
```

### `mortal launch <id|name>` / `mortal resume <id|name>`
launch the identity's isolated browser (resume relaunches a suspended one —
same operation, state intact). prints state, remaining lifetime, pid, and the
scoped cdp endpoint. launching an already-running identity is idempotent and
re-prints its endpoint. `--json` (stable shape):

```json
{ "id": "idn_…", "name": "research", "state": "running",
  "pid": 4242, "cdpEndpoint": "ws://127.0.0.1:…", "expiresAt": "2026-…" }
```

### `mortal show <id|name>` / `mortal status <id|name>`
one identity in detail: state, remaining lifetime and what happens at expiry,
environment surfaces (browser profile, files root, memory scope, ai config),
every permission with its enforcement level, and recent activity. destroyed
identities show the tombstone plus, verbatim, what destruction did and did
not remove. `--json`: `{ summary, manifest, activity }`.

### `mortal suspend <id|name>`
terminate the browser process; profile, files, notes, and ai context are
kept. a finite lifetime keeps counting down while suspended. `--json`: the
updated `IdentitySummary`.

### `mortal destroy <id|name> [--yes]`
run the deletion contract (D0–D7) and print the destruction report: every
step with its outcome and counts, and the caveats — what destruction can
never remove (server-side data, exports, os artifacts, forensic recovery).
the caveats are never trimmed. on a terminal it asks for confirmation and
requires typing the identity's exact name or id; the prompt states exactly
what will be removed. non-interactive use must pass `--yes` (otherwise exit
2, nothing destroyed). a destruction interrupted mid-contract exits 1 and is
resumed from its journal by the runtime on next start. `--json`: the
`DestructionReport`.

### `mortal capabilities`
what is enforced vs advisory vs roadmap right now, from the runtime's own
capability report — plus the reserved api methods that return
`NOT_IMPLEMENTED`. scripts should feature-detect here and never trust an
unenforced control. `--json`: `RuntimeCapabilities`
(`{ enforceable, advisory, roadmap, reservedMethods }`).

## scripting contract

- data to stdout, errors to stderr. with `--json`, errors are a single-line
  json envelope on stderr: `{ "error": { "code", "message", … } }`.
- exit codes: `0` success · `1` failure (runtime unreachable, rpc error,
  aborted confirmation, incomplete destruction) · `2` usage (bad flags,
  invalid lifetime, refusing to destroy without `--yes` off-terminal).
- `--json` shapes are the runtime's typed contract objects (`@mortal/schema`)
  and the documented launch shape above; they are stable across patch
  releases.
- color is ansi only on a tty; piped output is plain. `NO_COLOR` and
  `TERM=dumb` are respected. countdowns are fixed-width and zero-padded so
  columns of them stay aligned.

## enforced vs advisory vs roadmap, today

every permission the cli prints carries one of three labels, straight from
the schema — the same source the guarantees page and the ci gate read:

- **enforced** — backed by the runtime and a passing automated test:
  browser-state isolation (per-identity chromium profile), filesystem
  partition, memory scope, history retention, lifecycle expiry, and the
  journaled destruction contract.
- **advisory** — recorded and shown, not technically enforced: wallet
  declarations, network (identities on one machine share your ip). do not
  rely on these.
- **roadmap** — not built; declares intent only: email aliasing, redaction.
  per-identity network routes and credential issuance are reserved api
  methods that return `NOT_IMPLEMENTED`.

`mortal capabilities --json` is the machine-readable version; trust only the
`enforceable` list.

## troubleshooting

- **"no mortal runtime found" / "not responding"** — start it:
  `pnpm dev:runtime`, or `mortal-runtime serve --root <dir>`. a stale
  `runtime.json` after a crash reads as "not responding"; restarting the
  runtime rewrites it.
- **"no chromium-based browser found"** — install chromium or brave (or
  google chrome), or point `MORTAL_BROWSER_PATH` at a chromium executable.
- **companion doesn't load in branded chrome** — chrome ≥137 may ignore
  `--load-extension`; `mortal status` surfaces the warning. chromium or
  brave avoid it.

## development

```
pnpm --filter @mortal/cli test        # unit tests (parsing, shapes, gates)
pnpm --filter @mortal/cli typecheck
pnpm check:mortal-cli                 # boot smoke: built bin vs fixture runtime
```

the boot smoke (`scripts/smoke-mortal-cli.mjs`, part of `pnpm check`) drives
the full create → launch → list → destroy → capabilities loop against the
built artifact and a clean runtime root, real browser included. NOTES.md in
this package records the runtime surface the cli wraps, written before the
first line of code.
