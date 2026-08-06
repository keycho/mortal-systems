// pure-logic tests for the agent sdk's runtime discovery and rpc envelope,
// observed behaviorally through a fake loopback runtime (a real http server
// that records what the client sends). the full safety suite — real runtime,
// real chromium, real mcp protocol — lives in tests/mcp/mcp-safety.test.ts.
import { createServer, type Server } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MCP_TRUST_BOUNDARY, MortalClient, MortalRpcError } from "../src/client.js";

interface Seen {
  authorization: string | undefined;
  method: string;
}

const servers: Server[] = [];
const roots: string[] = [];

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mortal-mcp-unit-"));
  roots.push(dir);
  return dir;
}

/** a fake runtime: answers /v1/rpc with the given envelope, records requests */
async function fakeRuntime(
  envelope: unknown
): Promise<{ port: number; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body) as { method: string };
      seen.push({ authorization: req.headers.authorization, method: parsed.method });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(envelope));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return { port: address.port, seen };
}

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.MORTAL_PORT;
  delete process.env.MORTAL_ADMIN_TOKEN;
});

describe("runtime discovery", () => {
  it("explicit port and token bypass the files and are sent as the bearer", async () => {
    const { port, seen } = await fakeRuntime({ ok: true, result: { pong: true } });
    const client = new MortalClient({ port, token: "explicit-token" });
    await client.rpc("runtime.status", {});
    expect(seen).toHaveLength(1);
    expect(seen[0]!.authorization).toBe("Bearer explicit-token");
    expect(seen[0]!.method).toBe("runtime.status");
  });

  it("reads runtime.json and admin.token from the root", async () => {
    const { port, seen } = await fakeRuntime({ ok: true, result: {} });
    const root = tmpRoot();
    fs.writeFileSync(path.join(root, "runtime.json"), JSON.stringify({ port }));
    fs.writeFileSync(path.join(root, "admin.token"), JSON.stringify({ token: "file-token" }));
    const client = new MortalClient({ root });
    await client.rpc("runtime.status", {});
    expect(seen[0]!.authorization).toBe("Bearer file-token");
  });

  it("environment variables fill in when options are absent", async () => {
    const { port, seen } = await fakeRuntime({ ok: true, result: {} });
    process.env.MORTAL_PORT = String(port);
    process.env.MORTAL_ADMIN_TOKEN = "env-token";
    const client = new MortalClient({ root: tmpRoot() });
    await client.rpc("runtime.status", {});
    expect(seen[0]!.authorization).toBe("Bearer env-token");
  });

  it("refuses at construction when no runtime is discoverable, instead of guessing", () => {
    expect(() => new MortalClient({ root: tmpRoot() })).toThrowError();
  });
});

describe("rpc envelope", () => {
  it("unwraps ok results", async () => {
    const { port } = await fakeRuntime({ ok: true, result: { state: "serving" } });
    const client = new MortalClient({ port, token: "t" });
    await expect(client.rpc("runtime.status", {})).resolves.toEqual({ state: "serving" });
  });

  it("surfaces runtime errors as MortalRpcError with the code preserved", async () => {
    const { port } = await fakeRuntime({
      ok: false,
      error: { code: "NOT_FOUND", message: 'identity "idn_x" not found' },
    });
    const client = new MortalClient({ port, token: "t" });
    const failure = client.rpc("identity.get", { id: "idn_x" });
    await expect(failure).rejects.toBeInstanceOf(MortalRpcError);
    await expect(failure).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("createIdentity without a name or blueprint refuses locally with a typed error", async () => {
    const { port, seen } = await fakeRuntime({ ok: true, result: {} });
    const client = new MortalClient({ port, token: "t" });
    await expect(client.createIdentity({})).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    // the refusal happened before anything touched the runtime
    expect(seen).toHaveLength(0);
  });
});

describe("the trust boundary, single-sourced", () => {
  it("capabilities() ships the canonical trust boundary alongside the runtime's lists", async () => {
    const { port } = await fakeRuntime({
      ok: true,
      result: {
        enforceable: [],
        advisory: [],
        roadmap: [],
        conditional: {},
        reservedMethods: [],
      },
    });
    const client = new MortalClient({ port, token: "t" });
    const caps = await client.capabilities();
    expect(caps.trustBoundary).toBe(MCP_TRUST_BOUNDARY);
    expect(caps.enforcementTable.length).toBeGreaterThan(0);
    expect(caps.nonGuarantees.length).toBeGreaterThan(0);
  });

  it("states possession-of-id authority and forbids the cross-session inference, naming the upgrade", () => {
    expect(MCP_TRUST_BOUNDARY).toContain("possession of the id");
    expect(MCP_TRUST_BOUNDARY).toContain("never infer cross-session isolation");
    expect(MCP_TRUST_BOUNDARY).toContain("runtime-level session tokens");
    expect(MCP_TRUST_BOUNDARY).toContain("candidate enforcement upgrade");
  });

  it("the readme carries the canonical sentence verbatim (doc sync)", () => {
    const readme = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "README.md"),
      "utf8"
    );
    const normalize = (s: string) => s.replace(/^>\s?/gm, "").replace(/\s+/g, " ").trim();
    expect(normalize(readme)).toContain(normalize(MCP_TRUST_BOUNDARY));
  });
});
