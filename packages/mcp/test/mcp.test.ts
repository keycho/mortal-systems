// phase-2 gate: the mcp server's create → launch → status → destroy loop runs
// against a REAL runtime, and the scoping safety properties hold.
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { DestructionReport } from "@mortal/schema";
import { MortalClient } from "../src/client.js";
import { buildServer } from "../src/server.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CLI = path.join(repo, "packages", "runtime", "dist", "cli.js");
const PORT = 4967;
const TOKEN = "mortal-mcp-test";
const TEST_TIMEOUT = 120_000;

let root: string;
let noteFile: string;
let runtime: ChildProcess;
let sdk: MortalClient;

async function waitForRuntime(): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/v1/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("runtime did not come up");
}

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "mortal-mcp-"));
  // the operator's registry, written before the runtime starts. the fixture
  // server is real and its tools really work (see tests/isolation/tools.test.ts).
  noteFile = path.join(root, "note.txt");
  fs.writeFileSync(noteFile, "brokered note");
  fs.writeFileSync(
    path.join(root, "tool-servers.json"),
    JSON.stringify({
      servers: [
        {
          name: "notes",
          command: process.execPath,
          args: [path.join(repo, "tests", "fixtures", "tool-servers", "notes-server.mjs")],
          env: { NOTES_FILE: noteFile },
        },
      ],
    })
  );
  runtime = spawn(
    "node",
    [CLI, "serve", "--root", root, "--port", String(PORT), "--admin-token", TOKEN, "--seed-first-party"],
    {
      stdio: "ignore",
      env: {
        ...process.env,
        MORTAL_HEADLESS: "1",
        ...(process.env.MORTAL_BROWSER_PATH === undefined &&
        fs.existsSync("/opt/pw-browsers/chromium")
          ? { MORTAL_BROWSER_PATH: "/opt/pw-browsers/chromium" }
          : {}),
      },
    }
  );
  await waitForRuntime();
  sdk = new MortalClient({ port: PORT, token: TOKEN });
}, TEST_TIMEOUT);

afterAll(async () => {
  runtime.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 500));
  fs.rmSync(root, { recursive: true, force: true });
});

async function mcpClient(): Promise<Client> {
  const server = buildServer(sdk);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

function parse(result: Awaited<ReturnType<Client["callTool"]>>): any {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0]!.text);
}

describe("the mortal mcp server (real runtime)", () => {
  it(
    "exposes exactly the v1 tool surface — no attach, no extend, no expire",
    async () => {
      const client = await mcpClient();
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual([
        "blueprint_list",
        "capabilities",
        "identity_call_tool",
        "identity_create",
        "identity_destroy",
        "identity_launch",
        "identity_status",
        "identity_tools",
      ]);
      // the tool surface brokers calls; it never registers a server. an agent
      // that could add one could name it into its own scope.
      expect(names.some((n) => /register|mount|server_add/.test(n))).toBe(false);
      // lifetime is the runtime's to enforce: nothing here can lengthen it,
      // and nothing here can reach a browser mortal did not launch.
      for (const banned of ["extend", "attach", "expire", "browser", "session"]) {
        expect(names.some((n) => n.includes(banned))).toBe(false);
      }
    },
    TEST_TIMEOUT
  );

  it(
    "runs the full loop: create → launch (scoped cdp) → status → destroy (receipt)",
    async () => {
      const client = await mcpClient();

      const created = parse(
        await client.callTool({
          name: "identity_create",
          arguments: { name: "agent research", lifetime: "30m" },
        })
      );
      expect(created.summary.state).toBe("created");
      expect(created.remainingMs).toBeGreaterThan(0);
      expect(created.remainingMs).toBeLessThanOrEqual(30 * 60_000);
      // every permission carries its enforcement level — feature-detectable
      expect(created.manifest.permissions.filesystem.enforcement).toBe("enforced");
      expect(created.manifest.permissions.email.enforcement).toBe("roadmap");
      // no route requested → this identity's network control is NOT enforced,
      // whatever the global ceiling says. the identity is authoritative.
      expect(created.manifest.permissions.network.value).toBe("standard");
      expect(created.manifest.permissions.network.enforcement).toBe("advisory");

      const id = created.summary.id as string;
      const launched = parse(await client.callTool({ name: "identity_launch", arguments: { id } }));
      expect(launched.pid).toBeGreaterThan(0);
      expect(launched.cdpEndpoint).toMatch(/^ws:\/\/127\.0\.0\.1:/);

      const status = parse(await client.callTool({ name: "identity_status", arguments: { id } }));
      expect(status.summary.state).toBe("running");

      const receipt = parse(
        await client.callTool({ name: "identity_destroy", arguments: { id } })
      ) as DestructionReport;
      expect(receipt.identityId).toBe(id);
      expect(receipt.steps.map((s) => s.step)).toEqual([
        "D0",
        "D1",
        "D2",
        "D3",
        "D4",
        "D5",
        "D6",
        "D7",
      ]);
      expect(receipt.steps.every((s) => s.ok)).toBe(true);
      expect(receipt.caveats.length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(root, "profiles", id))).toBe(false);
    },
    TEST_TIMEOUT
  );

  it(
    "an agent that asks for a network route gets an identity whose network control is really enforced",
    async () => {
      const client = await mcpClient();
      const routed = parse(
        await client.callTool({
          name: "identity_create",
          arguments: {
            name: "routed agent",
            lifetime: "30m",
            networkRoute: { proxy: "http://127.0.0.1:8899", label: "egress-a" },
          },
        })
      );
      // the schema only lets this say "enforced" because a route is attached
      expect(routed.manifest.permissions.network.value).toBe("routed");
      expect(routed.manifest.permissions.network.enforcement).toBe("enforced");
      expect(routed.manifest.permissions.network.route.proxy).toBe("http://127.0.0.1:8899");
      expect(routed.manifest.permissions.network.route.label).toBe("egress-a");
      await client.callTool({ name: "identity_destroy", arguments: { id: routed.summary.id } });
    },
    TEST_TIMEOUT
  );

  it(
    "an agent that declares a tool scope is held to it, through the mcp surface",
    async () => {
      const client = await mcpClient();
      const scoped = parse(
        await client.callTool({
          name: "identity_create",
          arguments: {
            name: "scoped tool agent",
            lifetime: "30m",
            toolScope: { servers: [{ server: "notes", tools: ["read_note"] }] },
          },
        })
      );
      expect(scoped.manifest.permissions.tools.value).toBe("scoped");
      expect(scoped.manifest.permissions.tools.enforcement).toBe("enforced");
      const id = scoped.summary.id as string;

      // it sees only what it may call, though the server exposes two tools
      const listed = parse(await client.callTool({ name: "identity_tools", arguments: { id } }));
      expect(listed.map((t: any) => t.name)).toEqual(["read_note"]);

      // the in-scope call really works
      const ok = parse(
        await client.callTool({
          name: "identity_call_tool",
          arguments: { id, server: "notes", tool: "read_note" },
        })
      );
      expect(JSON.stringify(ok.content)).toContain("brokered note");

      // write_note is live — an unscoped identity uses it and the file changes
      const unscoped = parse(
        await client.callTool({
          name: "identity_create",
          arguments: { name: "unscoped tool agent", lifetime: "30m" },
        })
      );
      await client.callTool({
        name: "identity_call_tool",
        arguments: {
          id: unscoped.summary.id,
          server: "notes",
          tool: "write_note",
          arguments: { text: "written by the unscoped identity" },
        },
      });
      expect(fs.readFileSync(noteFile, "utf8")).toBe("written by the unscoped identity");

      // …and the scoped identity is still refused it
      const refused = await client.callTool({
        name: "identity_call_tool",
        arguments: {
          id,
          server: "notes",
          tool: "write_note",
          arguments: { text: "should-never-be-written" },
        },
      });
      expect(refused.isError).toBe(true);
      expect(fs.readFileSync(noteFile, "utf8")).toBe("written by the unscoped identity");

      await client.callTool({ name: "identity_destroy", arguments: { id } });
      await client.callTool({
        name: "identity_destroy",
        arguments: { id: unscoped.summary.id },
      });
    },
    TEST_TIMEOUT
  );

  it(
    "scopes destruction: destroying one agent identity never touches another",
    async () => {
      const client = await mcpClient();
      const a = parse(
        await client.callTool({
          name: "identity_create",
          arguments: { name: "identity a", lifetime: "1h" },
        })
      );
      const b = parse(
        await client.callTool({
          name: "identity_create",
          arguments: { name: "identity b", lifetime: "1h" },
        })
      );
      const la = parse(
        await client.callTool({ name: "identity_launch", arguments: { id: a.summary.id } })
      );
      const lb = parse(
        await client.callTool({ name: "identity_launch", arguments: { id: b.summary.id } })
      );
      // per-identity endpoints, distinct by construction
      expect(la.cdpEndpoint).not.toBe(lb.cdpEndpoint);

      await client.callTool({ name: "identity_destroy", arguments: { id: a.summary.id } });
      const after = parse(
        await client.callTool({ name: "identity_status", arguments: { id: b.summary.id } })
      );
      expect(after.summary.state).toBe("running");
      expect(fs.existsSync(path.join(root, "profiles", b.summary.id))).toBe(true);
      await client.callTool({ name: "identity_destroy", arguments: { id: b.summary.id } });
    },
    TEST_TIMEOUT
  );

  it(
    "refuses identities mortal does not own, and surfaces honest capabilities",
    async () => {
      const client = await mcpClient();
      const bad = await client.callTool({
        name: "identity_launch",
        arguments: { id: "idn_doesnotexist000000000" },
      });
      expect(bad.isError).toBe(true);

      const caps = parse(await client.callTool({ name: "capabilities", arguments: {} }));
      expect(caps.enforceable.length).toBeGreaterThan(0);
      expect(caps.roadmap.length).toBeGreaterThan(0);
      expect(caps.reservedMethods).toContain("identity.attachAgent");
      expect(caps.nonGuarantees.length).toBeGreaterThan(0);

      // network is enforceable (G19 backs it) but CONDITIONALLY so: agent code
      // that reads only the enforceable set would over-trust a routeless
      // identity, so the precondition ships alongside it.
      expect(caps.enforceable).toContain("permissions.network");
      expect(caps.advisory).not.toContain("permissions.network");
      expect(caps.conditional["permissions.network"]).toMatch(/route/);
      const network = caps.enforcementTable.find((r: any) => r.field === "permissions.network");
      expect(network.enforcement).toBe("enforced");
      expect(network.verifiedBy).toContain("G19");
      expect(network.conditional).toMatch(/route/);

      // tool scoping flipped the same way, behind G20, and carries the same
      // precondition — an identity with no declared scope is open, not scoped
      expect(caps.enforceable).toContain("permissions.tools");
      expect(caps.advisory).not.toContain("permissions.tools");
      expect(caps.conditional["permissions.tools"]).toMatch(/scope/);
      const tools = caps.enforcementTable.find((r: any) => r.field === "permissions.tools");
      expect(tools.enforcement).toBe("enforced");
      expect(tools.verifiedBy).toContain("G20");

      const blueprints = parse(await client.callTool({ name: "blueprint_list", arguments: {} }));
      expect(blueprints).toHaveLength(3);
    },
    TEST_TIMEOUT
  );
});
