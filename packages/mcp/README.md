# @mortal/mcp — the mortal mcp server + agent sdk

lets an autonomous agent (claude code, or any mcp client) create, launch,
operate inside, and destroy **its own isolated identities** through a running
mortal runtime — never the operator's browser. every identity is a real
chromium instance with its own profile, files, notes, permissions, and a
finite lifetime the agent cannot extend. a thin typed layer over the
runtime's existing rpc contract: no new transport, no duplicated types, no
pretended enforcement.

the original pre-build inspection record (which runtime methods are wrapped,
with the code-level proof of the four properties the product depends on) is
in [NOTES.md](./NOTES.md).

## running the server

prerequisites: a built workspace and a running runtime.

```
pnpm install && pnpm build      # once
pnpm dev:runtime                # terminal 1 — the runtime, root ~/.mortal
node packages/mcp/dist/cli.js   # terminal 2 — the mcp server on stdio
```

the server discovers the runtime through the same mechanism the manager
uses: `<root>/runtime.json` (port) and `<root>/admin.token` (bearer token),
written by the runtime at startup. it refuses to start without one — a
server that cannot do real work does not pretend.

| flag / env | meaning |
| --- | --- |
| `--root <dir>` / `MORTAL_ROOT` | runtime root for discovery (default `~/.mortal`) |
| `MORTAL_PORT` | explicit api port, skips `runtime.json` |
| `MORTAL_ADMIN_TOKEN` | explicit admin token, skips `admin.token` |

stdout carries the mcp protocol; all logging goes to stderr.

### adding it to an mcp client

any stdio-capable mcp client works. generic config shape:

```json
{
  "mcpServers": {
    "mortal": {
      "command": "node",
      "args": ["/absolute/path/to/mortal-systems/packages/mcp/dist/cli.js"]
    }
  }
}
```

claude code: `claude mcp add mortal -- node /absolute/path/to/mortal-systems/packages/mcp/dist/cli.js`

## the tools (v1) — exactly these eight

| tool | input | returns |
| --- | --- | --- |
| `capabilities` | — | what is **enforceable / advisory / roadmap** right now, `conditional` (ceilings that apply only to configured identities), the full enforcement table with the tests behind each control, reserved methods, and mortal's explicit non-guarantees |
| `blueprint_list` | — | installed blueprints — reviewed starting points for scoped identities |
| `identity_create` | `blueprintId?`, `name?`, `lifetime?`, `networkRoute?`, `toolScope?` | the identity (summary + full manifest): every permission carries its enforcement level. a route makes network **enforced** for this identity; a declared scope makes tools **enforced**; without them both stay advisory |
| `identity_launch` | `id` | `{ pid, cdpEndpoint }` — the endpoint controls **only this identity's browser**; relaunch while running returns the same endpoint |
| `identity_status` | `id` | state, remaining lifetime (ms), full manifest with enforcement levels; tombstone after destroy |
| `identity_tools` | `id` | the brokered tools this identity may reach, already filtered by its declared scope |
| `identity_call_tool` | `id`, `server`, `tool`, `arguments?` | calls a brokered tool as this identity; an out-of-scope call is refused (`FORBIDDEN`) and journaled, even when the tool is live |
| `identity_destroy` | `id`, `reason?` | the `DestructionReport` (steps D0–D7, per-step detail, caveats). **real but unsigned** — signing is roadmap |

agents should call `capabilities` first and feature-detect, then read the
identity's own `manifest.permissions.<field>.enforcement` — the identity is
always authoritative. an advisory control is a declaration, not a technical
control; nothing in this package upgrades a label. refusals are typed
(`{ error: { code, message } }`: `NOT_FOUND`, `INVALID_STATE`, `FORBIDDEN`,
…) so agent code branches on codes, never on prose.

## safety properties — each one tested, not asserted

these are the product. the suite runs against a **real** in-proc runtime,
**real** chromium processes, and the **real** mcp protocol:
`tests/mcp/mcp-safety.test.ts`, plus the loop/scope suite in
`packages/mcp/test/mcp.test.ts` and the sdk unit tests in
`packages/mcp/test/unit.test.ts`.

| # | property | test id |
| --- | --- | --- |
| 1 | **no access to the operator's real browser.** a running non-mortal browser (devtools open, attachable in principle — the test proves that first) is invisible and unreachable through everything the mcp surface returns; a tool-surface audit shows no input accepts a port/endpoint/pid. proven, not assumed. | `MCP-1` |
| 2 | **per-identity cdp scoping.** identity A's endpoint cannot see or reach identity B's browser; endpoints are distinct processes on distinct ports, proven by driving marker pages through each. | `MCP-2` |
| 3 | **agents cannot self-extend lifetime.** no extend/update tool exists, and a 30s-lifetime identity is destroyed by the runtime scheduler **while the agent actively polls it** — then cannot be relaunched (`INVALID_STATE`). | `MCP-3` |
| 4 | **destruction is scoped and non-contagious.** destroying A through the mcp path leaves B's process driveable, dirs present, rows intact; destroying twice refuses. | `MCP-4` |
| 5 | **enforcement honesty.** the capability lists equal the schema's own derived lists exactly (drift fails, a legitimate flip with its test does not); conditional enforcement is stated, never flattened; blueprint and hand-made identities carry their real labels end-to-end. | `MCP-5` |
| 6 | **least authority at the surface.** no tool lists, searches, or enumerates identities — possession of an unguessable id is the capability; unknown ids refuse with uniform typed `NOT_FOUND`; no tool input can name outside state. | `MCP-6` |

run them: `pnpm --filter mortal-tests test` (or the whole suite,
`pnpm turbo test`). a boot smoke — the built cli on real stdio, handshake,
tools/list, schema-equal capabilities, typed refusals, over a real runtime —
is wired into `pnpm check` as `check:mcp`. the guarantee map
(`tests/guarantees.map.ts`) includes the MCP ids, so the ci gate fails if
these tests disappear.

## enforced vs advisory vs roadmap, today

machine-readable truth: the `capabilities` tool (sourced from
`@mortal/schema`'s enforcement table and the live runtime — never
hardcoded). human-readable summary:

| level | controls |
| --- | --- |
| **enforced** (each maps to a passing test, by ci gate) | browser state isolation · filesystem partition · memory scope · history retention · lifecycle expiry · destruction contract D0–D7 · network route (**conditional**: only for identities with a route attached) · tool scope (**conditional**: only for identities that declare one) |
| **advisory** (declaration shown in the ui, not a technical control) | wallet · network on routeless identities (they share your ip) · tools on scopeless identities |
| **roadmap** (not built; the field exists so intent can be declared) | email aliasing · redaction · receipt signing |

reserved rpc methods (`identity.attachAgent`, `identity.issueCredential`, …)
return `NOT_IMPLEMENTED` with `enforcement: "roadmap"` so agents
feature-detect instead of guessing.

## the trust boundary, stated plainly

the runtime has two auth planes today: the admin token and per-identity
companion tokens. there is no runtime-level per-session scope. the mcp
server holds the admin token itself (agents never see it), and authority
over an identity is possession of its unguessable id: the surface offers no
enumeration, so an agent holds exactly the ids it created or was handed.
compromising the mcp server process yields admin authority over the runtime;
the `capabilities` tool's non-guarantees say what is and is not held.
identities from a dead agent still expire on schedule — lifecycle lives in
the runtime scheduler, not the agent — and the operator sees everything in
the manager. what mortal brokers is scoped (G20); a connection an agent
opens on its own is outside that boundary, and that is a printed
non-guarantee.

## the flagship demo

the full loop, from the same sdk the server exposes, against a real runtime,
with a persistent bystander identity verified untouched throughout:

```
pnpm demo:agent
```

capabilities → create (15m lifetime) → launch → real work in the identity's
browser → destroy → the D0–D7 receipt, real but unsigned — while a
persistent identity sits untouched and is verified so at the end. the demo
exits non-zero if any assertion fails, so a green run on camera is a true
run.
