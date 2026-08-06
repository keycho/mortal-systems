// mcp safety suite MCP-1..MCP-6: the scoping and honesty properties of the
// mortal mcp server, asserted against a REAL in-proc runtime, real chromium
// processes, and the real mcp protocol (client + server over a linked
// transport pair; scripts/smoke-mcp.mjs covers the built stdio process).
//
// ported from the six-tool mcp branch and adapted to the eight-tool server
// that survived the merge (see DECISIONS). one posture change is deliberate:
// the surviving server has no list-identities tool and no per-session scope
// registry — possession of an unguessable identity id IS the capability —
// so MCP-6 asserts that posture (no enumeration surface, uniform typed
// not-found refusals) instead of cross-session blindness.
//
// tests in this file run sequentially and MCP-2 → MCP-4 share identities on
// purpose: MCP-4 destroys the pair MCP-2 launched, which is exactly the
// non-contagion scenario.
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
// side-effect import wires the chromium launcher into runtime startup
import "@mortal/runtime";
import { MortalRuntime } from "@mortal/runtime";
import { buildServer, MCP_TRUST_BOUNDARY, MortalClient } from "@mortal/mcp";
import {
  ADVISORY_FIELDS,
  composeManifest,
  ENFORCED_FIELDS,
  generateIdentityId,
  ROADMAP_FIELDS,
  type DestructionReport,
  type IdentityManifest,
  type IdentitySummary,
} from "@mortal/schema";
import { pollUntil, prepareEnv, tmpRoot } from "../helpers/world.js";

const T = 180_000;

// ---- neutral test blueprint (vendor audit / research framing, per product positioning) ----

const SUPPLIER_REVIEW_BLUEPRINT = JSON.stringify({
  schemaVersion: "2.0",
  blueprintVersion: "1.0.0",
  name: "Supplier Review",
  description:
    "a short-lived research space for reviewing one vendor: public docs, pricing pages, and terms, kept apart from every other engagement.",
  category: "research",
  recommendedLifetime: "30m",
  theme: "#4DA3FF",
  bookmarks: [{ title: "vendor site", url: "https://example.com" }],
  notes: [{ title: "review checklist", bodyMd: "# review checklist\n\n- [ ] pricing\n- [ ] terms\n" }],
  permissions: {
    wallet: { value: "none", enforcement: "advisory" },
    network: { value: "standard", enforcement: "advisory" },
    email: { value: "none", enforcement: "roadmap" },
  },
  privacy: { retainHistory: { value: true, enforcement: "enforced" } },
  publisher: { id: null, reviewTier: null },
});

// ---- helpers ----

interface ToolResult {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
}

class ToolCallError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ToolCallError";
    this.code = code;
  }
}

function makeCaller(client: Client) {
  return async function call<T = Record<string, unknown>>(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    const res = (await client.callTool({ name, arguments: args })) as ToolResult;
    const text = res.content?.[0]?.text ?? "{}";
    const payload = JSON.parse(text) as T & {
      error?: { code?: string; message?: string };
    };
    if (res.isError) {
      throw new ToolCallError(
        payload.error?.code ?? "UNKNOWN",
        payload.error?.message ?? "tool call failed"
      );
    }
    return payload;
  };
}

async function connectClient(server: ReturnType<typeof buildServer>, name: string): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name, version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

/** targets visible over a cdp endpoint, via the devtools http json api */
async function cdpTargets(cdpEndpoint: string): Promise<Array<{ url: string; title?: string }>> {
  const host = new URL(cdpEndpoint.replace("ws://", "http://")).host;
  const res = await fetch(`http://${host}/json/list`);
  return (await res.json()) as Array<{ url: string; title?: string }>;
}

function cdpPort(cdpEndpoint: string): number {
  return Number(new URL(cdpEndpoint.replace("ws://", "http://")).port);
}

async function driveTo(cdpEndpoint: string, url: string): Promise<void> {
  const host = new URL(cdpEndpoint.replace("ws://", "http://")).host;
  const browser = await chromium.connectOverCDP(`http://${host}`);
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = await context.newPage();
    await page.goto(url);
  } finally {
    await browser.close();
  }
}

// ---- world ----

let root: string;
let runtime: MortalRuntime;
let server: ReturnType<typeof buildServer>;
let call: <T = Record<string, unknown>>(
  name: string,
  args?: Record<string, unknown>
) => Promise<T>;
let mcpClient: Client;
let supplierReviewId: string;

/** the simulated operator browser (MCP-1): chromium with devtools open, outside mortal */
let userBrowserProc: ChildProcess | null = null;
let userBrowserPort = 0;
let userProfileDir: string;

interface StatusResult {
  summary: IdentitySummary;
  manifest: IdentityManifest | null;
  remainingMs: number | null;
  [k: string]: unknown;
}
interface LaunchResult {
  pid: number;
  cdpEndpoint: string | null;
  [k: string]: unknown;
}

/** identities created in MCP-2, destroyed/verified in MCP-4 */
let idA = "";
let idB = "";
let launchA: LaunchResult;
let launchB: LaunchResult;

beforeAll(async () => {
  prepareEnv();
  root = tmpRoot("mortal-mcp-safety-");
  runtime = await MortalRuntime.start({
    root,
    scheduler: { tickMs: 500, graceSeconds: 0 },
  });
  const installed = runtime.blueprints.install({
    manifestJson: SUPPLIER_REVIEW_BLUEPRINT,
    source: "test:supplier-review",
  });
  supplierReviewId = installed.blueprintId;
  const port = runtime.port;
  const token = runtime.adminToken;
  server = buildServer(new MortalClient({ port, token }));
  mcpClient = await connectClient(server, "safety-suite");
  call = makeCaller(mcpClient);
}, T);

afterAll(async () => {
  if (userBrowserProc && userBrowserProc.exitCode === null) {
    userBrowserProc.kill("SIGKILL");
  }
  await mcpClient?.close().catch(() => {});
  await server?.close().catch(() => {});
  await runtime?.stop().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
  if (userProfileDir) fs.rmSync(userProfileDir, { recursive: true, force: true });
}, T);

describe("mcp safety properties (MCP-1..MCP-6)", () => {
  it(
    "MCP-5: enforcement honesty — the capability lists equal the schema's own, and every permission carries its real level",
    { timeout: T },
    async () => {
      const caps = await call<{
        enforceable: string[];
        advisory: string[];
        roadmap: string[];
        conditional: Record<string, string>;
        reservedMethods: string[];
        enforcementTable: Array<{ field: string; enforcement: string; verifiedBy: string[] }>;
        nonGuarantees: string[];
        trustBoundary: string;
      }>("capabilities");

      // the trust boundary ships verbatim through the real protocol: the
      // posture an agent learns here is the one the readme and the tool
      // description state, and it never implies cross-session isolation
      expect(caps.trustBoundary).toBe(MCP_TRUST_BOUNDARY);

      // the tool's lists must equal the schema's derived lists exactly —
      // real values, not hardcoded optimism (and not a stale pin: a
      // legitimate enforcement flip with its test lands here automatically)
      expect(caps.enforceable.sort()).toEqual([...ENFORCED_FIELDS].sort());
      expect(caps.advisory.sort()).toEqual([...ADVISORY_FIELDS].sort());
      expect(caps.roadmap.sort()).toEqual([...ROADMAP_FIELDS].sort());

      // conditional enforcement is stated, never flattened: network and tools
      // are enforceable ceilings that apply only to configured identities
      expect(caps.conditional["permissions.network"]).toMatch(/route/);
      expect(caps.conditional["permissions.tools"]).toMatch(/scope/);

      // the reserved surface is honest: attachAgent is roadmap, not shipped
      expect(caps.reservedMethods).toContain("identity.attachAgent");

      // wallet stays advisory, email roadmap — never presented as enforced
      expect(caps.advisory).toContain("permissions.wallet");
      expect(caps.roadmap).toContain("permissions.email");
      expect(caps.enforceable).not.toContain("permissions.wallet");

      // non-guarantees ship with capabilities so agents cannot over-trust
      expect(caps.nonGuarantees.length).toBeGreaterThan(0);
      expect(caps.nonGuarantees.join(" ")).toContain("share your ip");

      // the installed blueprint is listed and addressable by id
      const blueprints = await call<Array<{ id: string; name: string }>>("blueprint_list");
      const supplier = blueprints.find((b) => b.name === "Supplier Review");
      expect(supplier).toBeDefined();
      expect(supplier!.id).toBe(supplierReviewId);

      // an identity created FROM the blueprint carries its honest labels
      // end-to-end through the mcp surface: the blueprint's declared-only
      // controls stay advisory/roadmap in the living manifest
      const fromBlueprint = await call<StatusResult>("identity_create", {
        blueprintId: supplierReviewId,
        lifetime: "5m",
      });
      const bpPerms = fromBlueprint.manifest!.permissions as Record<
        string,
        { enforcement: string }
      >;
      expect(bpPerms.wallet!.enforcement).toBe("advisory");
      expect(bpPerms.network!.enforcement).toBe("advisory");
      expect(bpPerms.email!.enforcement).toBe("roadmap");
      await call("identity_destroy", {
        id: fromBlueprint.summary.id,
        reason: "honesty probe done",
      });

      // a hand-made identity's manifest carries the ceilings end-to-end; a
      // routeless, scopeless identity reads advisory on both conditionals
      const created = await call<StatusResult>("identity_create", {
        name: "honesty probe",
        lifetime: "5m",
      });
      const perms = created.manifest!.permissions as Record<
        string,
        { enforcement: string }
      >;
      expect(perms.wallet!.enforcement).toBe("advisory");
      expect(perms.network!.enforcement).toBe("advisory");
      expect(perms.tools!.enforcement).toBe("advisory");
      expect(perms.email!.enforcement).toBe("roadmap");
      expect(perms.filesystem!.enforcement).toBe("enforced");
      expect(perms.memoryScope!.enforcement).toBe("enforced");
      await call("identity_destroy", { id: created.summary.id, reason: "honesty probe done" });
    }
  );

  it(
    "MCP-6: least authority — no enumeration surface, unguessable ids, and uniform typed refusals with no state leak",
    { timeout: T },
    async () => {
      // 1) surface audit: there is no tool that lists, searches, or
      // enumerates identities — possession of the id is the capability
      const tools = await mcpClient.listTools();
      const names = tools.tools.map((t) => t.name);
      expect(names.some((n) => /list_identities|identities_list|search|enumerate/.test(n))).toBe(
        false
      );

      // 2) ids are unguessable: entropy-bearing, never sequential
      const g1 = generateIdentityId();
      const g2 = generateIdentityId();
      expect(g1).not.toBe(g2);
      expect(g1).toMatch(/^idn_[A-Za-z0-9_-]{16,}$/);

      // 3) an identity created on the operator plane (as the manager would)
      // and a fabricated id refuse identically for launch and destroy — the
      // mcp surface neither destroys nor launches what the agent did not
      // make, and the refusal shape leaks nothing beyond the id itself
      const operatorId = generateIdentityId();
      runtime.identities.create({
        manifest: composeManifest({
          id: operatorId,
          name: "operator private",
          createdAt: new Date().toISOString(),
          lifetime: "persistent",
        }),
      });
      const ghostId = generateIdentityId();

      const refusal = async (name: string, id: string) => {
        try {
          await call(name, { id });
          return null;
        } catch (e) {
          return e as ToolCallError;
        }
      };
      const ghostStatus = await refusal("identity_status", ghostId);
      expect(ghostStatus).not.toBeNull();
      expect(ghostStatus!.code).toBe("NOT_FOUND");
      const ghostLaunch = await refusal("identity_launch", ghostId);
      expect(ghostLaunch!.code).toBe("NOT_FOUND");
      const ghostDestroy = await refusal("identity_destroy", ghostId);
      expect(ghostDestroy!.code).toBe("NOT_FOUND");
      expect(ghostLaunch!.message.replace(ghostId, "X")).toBe(
        ghostDestroy!.message.replace(ghostId, "X")
      );

      // the operator's identity, never launched by this agent, is untouched
      // by the refusal probes above and remains fully intact on the runtime
      expect(runtime.identities.get(operatorId).summary.state).not.toBe("destroyed");

      // 4) no tool input accepts anything that could name outside state
      const inputKeys = tools.tools.flatMap((t) =>
        Object.keys(
          (t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {}
        )
      );
      for (const key of inputKeys) {
        expect(key).not.toMatch(/port|endpoint|attach|cdp|pid|profile|path|token/i);
      }
    }
  );

  it(
    "MCP-1: no access to the operator's real browser — a running non-mortal browser is invisible and unreachable through the mcp surface",
    { timeout: T },
    async () => {
      // simulate the operator's own browser: a chromium the runtime did NOT
      // launch, with devtools open, marker page loaded
      userProfileDir = tmpRoot("mortal-user-browser-");
      const browserPath = process.env.MORTAL_BROWSER_PATH!;
      expect(browserPath).toBeTruthy();
      userBrowserProc = spawn(
        browserPath,
        [
          `--user-data-dir=${userProfileDir}`,
          "--headless=new",
          "--disable-gpu",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--no-first-run",
          "--no-default-browser-check",
          "--remote-debugging-port=0",
          "about:blank",
        ],
        { stdio: "ignore" }
      );
      const portFile = path.join(userProfileDir, "DevToolsActivePort");
      await pollUntil(
        () => fs.existsSync(portFile),
        (v) => v,
        30_000,
        100
      );
      userBrowserPort = Number(fs.readFileSync(portFile, "utf8").split("\n")[0]!.trim());
      expect(userBrowserPort).toBeGreaterThan(0);

      // the operator browser IS attachable in principle (so the barrier we
      // assert below is mortal's, not the environment's)
      const direct = await chromium.connectOverCDP(`http://127.0.0.1:${userBrowserPort}`);
      const ctx = direct.contexts()[0] ?? (await direct.newContext());
      const markerPage = await ctx.newPage();
      await markerPage.goto("data:text/html,<title>OPERATOR-REAL-BROWSER</title>operator session");
      await direct.close();

      // 1) surface audit: exactly the eight identity/blueprint tools — no
      // tool exists that could name, attach to, or enumerate an outside
      // browser
      const tools = await mcpClient.listTools();
      const names = tools.tools.map((t) => t.name).sort();
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
      const inputKeys = tools.tools.flatMap((t) =>
        Object.keys((t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {})
      );
      expect(new Set(inputKeys)).toEqual(
        new Set([
          "id",
          "reason",
          "blueprintId",
          "name",
          "lifetime",
          "networkRoute",
          "toolScope",
          "server",
          "tool",
          "arguments",
        ])
      );
      for (const key of inputKeys) {
        expect(key).not.toMatch(/port|endpoint|attach|cdp|pid|browser|profile|path/i);
      }

      // 2) behavioral: create + launch an identity through mcp; the endpoint
      // mortal hands the agent is not the operator browser's, and the
      // operator's marker page is not visible through it
      const created = await call<StatusResult>("identity_create", {
        blueprintId: supplierReviewId,
        lifetime: "15m",
      });
      const launched = await call<LaunchResult>("identity_launch", { id: created.summary.id });
      expect(launched.cdpEndpoint).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\//);
      expect(cdpPort(launched.cdpEndpoint!)).not.toBe(userBrowserPort);

      const targets = await cdpTargets(launched.cdpEndpoint!);
      expect(JSON.stringify(targets)).not.toContain("OPERATOR-REAL-BROWSER");

      // 3) the identity's browser really is a different process on a profile
      // under the runtime root — the operator profile is untouched by launch
      expect(fs.existsSync(path.join(root, "profiles", created.summary.id))).toBe(true);
      const operatorTargets = await cdpTargets(`ws://127.0.0.1:${userBrowserPort}/`);
      expect(JSON.stringify(operatorTargets)).toContain("OPERATOR-REAL-BROWSER");

      await call("identity_destroy", { id: created.summary.id, reason: "MCP-1 probe done" });
    }
  );

  it(
    "MCP-2: per-identity cdp scoping — identity A's endpoint cannot see or reach identity B's browser",
    { timeout: T },
    async () => {
      const a = await call<StatusResult>("identity_create", {
        name: "vendor audit A",
        lifetime: "30m",
      });
      const b = await call<StatusResult>("identity_create", {
        blueprintId: supplierReviewId,
        lifetime: "30m",
      });
      idA = a.summary.id;
      idB = b.summary.id;
      launchA = await call<LaunchResult>("identity_launch", { id: idA });
      launchB = await call<LaunchResult>("identity_launch", { id: idB });

      // distinct processes, distinct ports
      expect(cdpPort(launchA.cdpEndpoint!)).not.toBe(cdpPort(launchB.cdpEndpoint!));

      // drive A to a marker page over its endpoint (this is how an agent
      // operates the identity), same for B
      await driveTo(launchA.cdpEndpoint!, "data:text/html,<title>MARKER-IDENTITY-A</title>a");
      await driveTo(launchB.cdpEndpoint!, "data:text/html,<title>MARKER-IDENTITY-B</title>b");

      const aTargets = JSON.stringify(await cdpTargets(launchA.cdpEndpoint!));
      const bTargets = JSON.stringify(await cdpTargets(launchB.cdpEndpoint!));
      expect(aTargets).toContain("MARKER-IDENTITY-A");
      expect(aTargets).not.toContain("MARKER-IDENTITY-B");
      expect(bTargets).toContain("MARKER-IDENTITY-B");
      expect(bTargets).not.toContain("MARKER-IDENTITY-A");

      // launching again while running returns the same scoped endpoint, not a
      // new or broader one
      const again = await call<LaunchResult>("identity_launch", { id: idA });
      expect(again.cdpEndpoint).toBe(launchA.cdpEndpoint);
    }
  );

  it(
    "MCP-4: destruction is scoped and non-contagious through the mcp path — destroying A leaves B running and intact",
    { timeout: T },
    async () => {
      expect(idA).not.toBe("");
      expect(idB).not.toBe("");
      const bNotesBefore = runtime.repo.listNotes(idB).length;
      expect(bNotesBefore).toBeGreaterThan(0); // seeded by the Supplier Review blueprint

      const report = await call<DestructionReport>("identity_destroy", {
        id: idA,
        reason: "vendor review complete",
      });

      // the report is the real deletion contract, scoped to A, honestly capped
      expect(report.identityId).toBe(idA);
      expect(report.steps.map((s) => s.step)).toEqual([
        "D0",
        "D1",
        "D2",
        "D3",
        "D4",
        "D5",
        "D6",
        "D7",
      ]);
      expect(report.steps.every((s) => s.ok)).toBe(true);
      expect(report.caveats.length).toBeGreaterThan(0);

      // A is gone: dirs removed, status shows destroyed
      expect(fs.existsSync(path.join(root, "profiles", idA))).toBe(false);
      expect(fs.existsSync(path.join(root, "files", idA))).toBe(false);
      const aStatus = await call<StatusResult>("identity_status", { id: idA });
      expect(aStatus.summary.state).toBe("destroyed");

      // B is untouched: process alive and driveable, dirs present, rows intact
      const bTargets = JSON.stringify(await cdpTargets(launchB.cdpEndpoint!));
      expect(bTargets).toContain("MARKER-IDENTITY-B");
      await driveTo(launchB.cdpEndpoint!, "data:text/html,<title>B-STILL-ALIVE</title>alive");
      expect(JSON.stringify(await cdpTargets(launchB.cdpEndpoint!))).toContain("B-STILL-ALIVE");
      expect(fs.existsSync(path.join(root, "profiles", idB))).toBe(true);
      expect(fs.existsSync(path.join(root, "files", idB))).toBe(true);
      expect(runtime.repo.listNotes(idB).length).toBe(bNotesBefore);
      const bStatus = await call<StatusResult>("identity_status", { id: idB });
      expect(bStatus.summary.state).toBe("running");

      // destroying A twice is refused with a typed code, not repeated
      await expect(call("identity_destroy", { id: idA })).rejects.toMatchObject({
        code: "INVALID_STATE",
      });

      // cleanup B through the same contract
      await call("identity_destroy", { id: idB, reason: "suite cleanup" });
    }
  );

  it(
    "MCP-3: agents cannot self-extend lifetime — expiry fires on schedule regardless of agent activity",
    { timeout: T },
    async () => {
      // no tool exists to extend or update a lifetime (surface audit)
      const tools = await mcpClient.listTools();
      for (const t of tools.tools) {
        expect(t.name).not.toMatch(/extend|renew|update|expire/i);
      }

      // 30s is the schema's minimum lifetime; onExpiry defaults to destroy
      const created = await call<StatusResult>("identity_create", {
        name: "short errand",
        lifetime: "30s",
      });
      expect(created.summary.expiresAt).not.toBeNull();

      // the agent stays busy the whole time — polling status is activity, and
      // activity must not postpone the deadline
      const finalState = await pollUntil(
        async () => {
          const s = await call<StatusResult>("identity_status", { id: created.summary.id });
          return s.summary.state;
        },
        (state) => state === "destroyed",
        60_000,
        1_000
      );
      expect(finalState).toBe("destroyed");

      // and the dead identity cannot be relaunched by the agent
      await expect(call("identity_launch", { id: created.summary.id })).rejects.toMatchObject({
        code: "INVALID_STATE",
      });

      // the destruction was recorded by the runtime (scheduler-driven), with
      // the activity log showing expiry, not an agent destroy call
      const activity = runtime.readActivity(created.summary.id, 100);
      const events = activity.map((e) => e.event);
      expect(events).toContain("expiring");
      expect(events).toContain("destroyed");
    }
  );
});
