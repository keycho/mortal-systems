# mcp v1 — runtime inspection notes

> **historical record.** this inspection was written for the v1 six-tool
> exploration of the mcp server (branch `claude/mortal-mcp-server-v1`). the
> runtime properties it confirms at the bottom are still the load-bearing
> ones and still hold; the tool table below describes the superseded surface.
> the server that shipped is the eight-tool `@mortal/mcp` in this package
> (see README.md), which grew `identity_tools` / `identity_call_tool` with
> the G20 tool-scope enforcement and dropped the session-scope registry in
> favor of possession-of-id authority (see DECISIONS).

pre-build inspection record for the mortal mcp server. everything below was
read from the current code before any mcp code was written. the four
properties the product depends on are confirmed at the bottom, with quotes.

## what the mcp server wraps

transport: the existing loopback admin api, exactly as the manager and the
lifecycle test suite use it. the runtime writes `<root>/runtime.json`
(`{ port, pid, version, root, startedAt }`) and `<root>/admin.token`
(`{ token }`, mode 0600) at startup (`packages/runtime/src/runtime.ts:156-165`);
clients POST `{"method", "params"}` to `http://127.0.0.1:<port>/v1/rpc` with
`Authorization: Bearer <token>` and receive the `RpcResponse<T>` envelope
(`packages/runtime/src/api/server.ts:125-145`). the mcp server reuses this
mechanism verbatim — no new transport.

rpc methods used (dispatch: `packages/runtime/src/api/rpc.ts`; typed contract:
`RpcContract` in `packages/schema/src/api.ts:182-232`):

| mcp tool | runtime rpc method(s) | result types (`@mortal/schema`) |
| --- | --- | --- |
| `mortal_create_identity` | `identity.createFromBlueprint` (blueprint path) or `identity.create` (manifest path, composed client-side with `composeManifest`) | `IdentitySummary` |
| `mortal_launch_identity` | `identity.launch` + `identity.get` (for state/expiresAt) | `{ pid, cdpEndpoint }`, `IdentitySummary` |
| `mortal_identity_status` | `identity.get` | `IdentitySummary`, `IdentityManifest \| null` |
| `mortal_list_identities` | `identity.list` (server-side session filter applied) | `IdentitySummary[]` |
| `mortal_list_blueprints` | `blueprint.list` (+ `blueprint.get` for permission detail) | `BlueprintSummary[]`, `BlueprintManifest` |
| `mortal_destroy_identity` | `identity.destroy` | `DestructionReport` |
| `mortal_capabilities` | `runtime.capabilities` + `ENFORCEMENT_TABLE` from `@mortal/schema` | `RuntimeCapabilities`, `EnforcementRow[]` |

types imported from `@mortal/schema` (never duplicated): `RpcContract`,
`RpcMethod`, `RpcResponse`, `RpcError`, `IdentitySummary`, `IdentityManifest`,
`BlueprintSummary`, `BlueprintManifest`, `DestructionReport`,
`RuntimeCapabilities`, `EnforcementRow`, `ENFORCEMENT_TABLE`,
`DESTRUCTION_CAVEATS`, `composeManifest`, `generateIdentityId`,
`lifetimeSchema` / `parseLifetimeMs`, `identityIdSchema`.

manifest composition for the no-blueprint create path uses the pure
`composeManifest` (`packages/schema/src/compose.ts:42-90`) — the same function
the runtime's own blueprint pipeline and the isolation suite use — then
submits the result to `identity.create`, where the runtime re-validates it
against the canonical schema and pins runtime-assigned paths
(`packages/runtime/src/identity/service.ts:91-98`).

## the four properties, confirmed in current code

### 1. `launch` returns a cdp endpoint scoped to that identity's own browser process — HOLDS

`Launcher.launch(id)` (`packages/runtime/src/launcher/launch.ts`) spawns a
fresh chromium per identity with that identity's own profile dir and an
os-assigned debug port:

```ts
const profileDir = insideRoot(this.runtime.root, manifest.surfaces.browser.profilePath);  // launch.ts:165
...
const args = [
  `--user-data-dir=${profileDir}`,
  ...
  "--remote-debugging-port=0",          // launch.ts:171-175
```

the endpoint is read back from that same profile dir's `DevToolsActivePort`
file — the port belongs to the process just spawned for this identity, no
shared or well-known port exists:

```ts
const portFile = path.join(profileDir, "DevToolsActivePort");                 // launch.ts:166
...
const portFileContent = await waitForFile(portFile, 30_000);                  // launch.ts:214
...
cdpEndpoint = `ws://127.0.0.1:${cdpPort}${(wsPath ?? "").trim()}`;            // launch.ts:220
```

processes are tracked in a map keyed by identity id (`launch.ts:76`
`private readonly procs = new Map<string, Proc>()`), and
`cdpEndpointFor(id)` (`launch.ts:116-118`) only ever returns the endpoint of
the process the launcher spawned for that id. profile paths are schema-pinned
relative paths (`relativePathSchema`, `packages/schema/src/manifest.ts:47-62`
rejects absolute paths, `..`, `~`) resolved through `insideRoot`
(`packages/runtime/src/util/paths.ts`), which throws if the resolved path
escapes the runtime root — so a profile can never point at the user's real
browser profile directory.

### 2. no runtime method enumerates, attaches to, or controls a browser the runtime did not launch — HOLDS

the rpc surface is a closed switch (`packages/runtime/src/api/rpc.ts:68-135`);
every browser-touching method resolves through the launcher, and the launcher
only operates on `this.procs` — processes it spawned itself
(`spawn(browser.path, args, ...)`, `launch.ts:198`). the reserved future
methods (`identity.attachAgent`, `identity.attachNetworkRoute`, …) throw
`NOT_IMPLEMENTED` before dispatch (`rpc.ts:60-64`).

browser *discovery* (`packages/runtime/src/launcher/discover.ts`) inspects
executables only — `fs.accessSync(p, fs.constants.X_OK)` on standard install
paths and `execFileP(executable, ["--version"])` — it never scans ports,
never reads a user profile, never connects to a running process:

```ts
function firstExisting(paths: string[]): string | null {
  for (const p of paths) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
```

the only place the runtime dials a cdp port is `observeCompanion`
(`launch.ts:365-402`), and the port it dials is `cdpPort` of a `Proc` it just
created (guarded by `if (this.procs.get(id)?.cdpPort !== cdpPort) return;`,
`launch.ts:372`). `halt`/`suspend`/`terminate` kill only pids from `procs`
(`launch.ts:267-312`). grep confirms there is no `connectOverCDP`, no default
`9222`, and no user-profile path anywhere in `packages/runtime/src`.

conclusion: through the runtime api there is **no path to the operator's real
chrome/brave/chromium instance or profile** — the mcp server, sitting behind
that api, cannot offer one.

### 3. destroy is scoped to one identity and returns a report — HOLDS

`identity.destroy` → `runtime.destroyIdentity(id)` → `Destroyer.run`
(`packages/runtime/src/destroy/destroy.ts`). every path D0 captures is derived
from *that identity's* manifest and resolved via `insideRoot`:

```ts
paths = {
  profileDir: insideRoot(this.root, manifest.surfaces.browser.profilePath),   // destroy.ts:142
  filesDir: insideRoot(this.root, manifest.surfaces.files.root),
  downloadsDir: insideRoot(this.root, `${manifest.surfaces.files.root}/downloads`),
  companionDir: insideRoot(this.root, `companion-instances/${identityId}`),
};
```

row deletion is per-identity (`D5: this.repo.deleteIdentityChildRows(identityId)`,
`destroy.ts:225`), D6 tombstones only that identity's row, and the process
halt (D2) goes through `launcher.halt(identityId)` which touches only that
identity's proc. the return value is the typed `DestructionReport`
(`packages/schema/src/api.ts:34-43`): `{ identityId, startedAt, completedAt,
resumed, steps: DestructionStepResult[], caveats: string[] }` — caveats are
`DESTRUCTION_CAVEATS`, "always present, never trimmed."

**no signature field exists on the report.** destroy receipts are unsigned in
the current runtime; the mcp server surfaces the report as-is and
`mortal_capabilities` reports receipt signing as `roadmap`. it will not invent
a signature. non-contagion is already covered by the lifecycle suite
("G12 + G13: destruction is complete, and the neighbor keeps running
untouched", `tests/lifecycle/lifecycle.test.ts:126`); the mcp suite re-asserts
it through the mcp path.

### 4. permissions carry enforcement levels — HOLDS

enforcement ceilings are literal types in the manifest schema
(`packages/schema/src/manifest.ts:115-133`) — an over-claiming manifest is
unrepresentable:

```ts
wallet: z.object({ value: z.enum(["none", "read-intent", "declared"]), enforcement: z.literal("advisory") }).strict(),
email:  z.object({ value: z.enum(["none", "temporary", "dedicated"]),  enforcement: z.literal("roadmap") }).strict(),
network: z.object({ value: z.literal("standard"), enforcement: z.literal("advisory") }).strict(),
```

(filesystem and memoryScope are pinned `z.literal("enforced")`; privacy:
`retainHistory` enforced, `redaction` roadmap.) the single source of truth for
labels is `ENFORCEMENT_TABLE` (`packages/schema/src/enforcement.ts:32-122`)
with `ENFORCED_FIELDS` / `ADVISORY_FIELDS` / `ROADMAP_FIELDS` derived from it,
and `runtime.capabilities()` (`packages/runtime/src/runtime.ts:197-204`)
returns exactly those lists plus `RESERVED_METHODS`. the ci gate
(`scripts/check-guarantees.ts`) fails the build if an enforced field is not
mapped to a passing test. `mortal_capabilities` reads from these sources —
never hardcoded lists.

## lifetime enforcement (property 3 of the safety list)

there is **no rpc method that mutates an identity's lifetime after creation**
— the contract has create/get/list/launch/suspend/resume/expire/destroy plus
blueprint and activity methods; nothing updates `expires_at`
(`packages/schema/src/api.ts:182-232`). expiry is enforced by the runtime's
scheduler (`packages/runtime/src/scheduler/scheduler.ts`): a live tick fires
due jobs, startup catch-up honors missed expiries late ("honored late, never
skipped"), and `identity.expire` only *ends* a lifetime early. so an agent on
the mcp surface has no self-extension path to close — the mcp server simply
must not add one (and does not: no extend/update tool exists).

## least authority for the mcp session (property 6) — honest v1 posture

the runtime has exactly two auth planes today: the **admin token** (full rpc)
and **per-identity companion tokens** (identity-scoped `/v1/self` surface,
`packages/runtime/src/api/self.ts` — routes derive the identity from the
token; the surface cannot create/launch/destroy). there is **no per-session
admin scoping in the runtime**; scoped runtime sessions are a roadmap item.

v1 therefore does the honest next-best thing: the mcp server process holds
the admin token (the agent never sees it) and enforces a **session scope at
the mcp boundary** — tools can only see and operate on identities created
through this server instance; everything else answers "not found". this is
real enforcement against the mcp client, and it is *not* runtime-level
isolation: an attacker who compromises the mcp server process itself holds
admin authority. `mortal_capabilities` states this exactly
(`mcpSessionScoping: enforced at the mcp server boundary; runtime-level
session tokens: roadmap`). identities orphaned by a dead mcp session remain
visible to the operator in the manager, and their lifetimes still expire on
schedule because enforcement lives in the runtime scheduler, not the agent.

## build notes

- workspace rule respected: `@mortal/mcp` depends on `@mortal/schema` via
  `workspace:*` and resolves it only through turbo-ordered builds
  (`dependsOn: ["^build"]` for build/typecheck/test).
- the demo identity is neutral (vendor audit); no crypto framing anywhere in
  the mcp package. the first-party blueprint set is unchanged.
- deferred, reported as such by `mortal_capabilities`: per-identity network
  routes, credential injection, tool/mcp mount enforcement (reserved rpc
  methods return NOT_IMPLEMENTED with `enforcement: "roadmap"`), signed
  destruction receipts, runtime-level per-session tokens.
