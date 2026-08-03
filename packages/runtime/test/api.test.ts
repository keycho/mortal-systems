import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { composeManifest, generateIdentityId, type RpcResponse } from "@mortal/schema";
import { MortalRuntime } from "../src/runtime.js";

let runtime: MortalRuntime;
let root: string;

function rpc<T = unknown>(
  method: string,
  params?: unknown,
  token?: string
): Promise<{ status: number; body: RpcResponse<T> }> {
  return fetch(`http://127.0.0.1:${runtime.port}/v1/rpc`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token ?? runtime.adminToken}`,
    },
    body: JSON.stringify({ method, params }),
  }).then(async (res) => ({ status: res.status, body: (await res.json()) as RpcResponse<T> }));
}

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "mortal-api-"));
  runtime = await MortalRuntime.start({ root, port: 0 });
});

afterAll(async () => {
  await runtime.stop();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("loopback api", () => {
  it("serves health without auth", async () => {
    const res = await fetch(`http://127.0.0.1:${runtime.port}/v1/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("mortal-runtime");
  });

  it("writes runtime.json and admin.token into the root", () => {
    const meta = JSON.parse(fs.readFileSync(path.join(root, "runtime.json"), "utf8"));
    expect(meta.port).toBe(runtime.port);
    expect(meta.pid).toBe(process.pid);
    const tok = JSON.parse(fs.readFileSync(path.join(root, "admin.token"), "utf8"));
    expect(tok.token).toBe(runtime.adminToken);
  });

  it("rejects missing and wrong bearer tokens", async () => {
    const noAuth = await fetch(`http://127.0.0.1:${runtime.port}/v1/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: "identity.list" }),
    });
    expect(noAuth.status).toBe(401);
    const wrong = await rpc("identity.list", {}, "not-the-token");
    expect(wrong.status).toBe(401);
    expect(wrong.body.ok).toBe(false);
  });

  it("rejects oversized bodies with PAYLOAD_TOO_LARGE", async () => {
    const res = await rpc("identity.create", { manifest: { pad: "x".repeat(700 * 1024) } });
    expect(res.status).toBe(413);
    if (!res.body.ok) expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("returns NOT_IMPLEMENTED with roadmap enforcement for reserved methods", async () => {
    const res = await rpc("identity.attachAgent", { id: "idn_abcdefghijklmnopqrstu" });
    expect(res.status).toBe(501);
    if (!res.body.ok) {
      expect(res.body.error.code).toBe("NOT_IMPLEMENTED");
      expect(res.body.error.enforcement).toBe("roadmap");
    }
  });

  it("serves blueprint.list (implemented on day 5; empty on a fresh root)", async () => {
    const res = await rpc<unknown[]>("blueprint.list", {});
    expect(res.status).toBe(200);
    if (res.body.ok) expect(res.body.result).toEqual([]);
  });

  it("404s unknown methods", async () => {
    const res = await rpc("identity.evaporate", {});
    expect(res.status).toBe(404);
  });
});

describe("identity create/list/get over rpc", () => {
  const idA = generateIdentityId();
  const idB = generateIdentityId();
  const now = () => new Date().toISOString();

  it("creates a persistent identity and returns its summary", async () => {
    const manifest = composeManifest({
      id: idA,
      name: "client acme",
      createdAt: now(),
      color: "#F59E0B",
    });
    const res = await rpc<{ id: string; spaceNumber: number; state: string }>("identity.create", {
      manifest,
    });
    expect(res.status).toBe(200);
    if (res.body.ok) {
      expect(res.body.result.id).toBe(idA);
      expect(res.body.result.state).toBe("created");
      expect(res.body.result.spaceNumber).toBe(1);
    }
  });

  it("creates a finite-lifetime identity and schedules expiry", async () => {
    const manifest = composeManifest({
      id: idB,
      name: "onchain investigator",
      createdAt: now(),
      color: "#C8FF4D",
      lifetime: "12h",
      retainHistory: false,
    });
    const created = await rpc<{ expiresAt: string | null }>("identity.create", { manifest });
    expect(created.status).toBe(200);
    if (created.body.ok) expect(created.body.result.expiresAt).not.toBeNull();

    const activity = await rpc<Array<{ event: string }>>("activity.read", { identityId: idB });
    if (activity.body.ok) {
      const events = activity.body.result.map((e) => e.event);
      expect(events).toContain("created");
      expect(events).toContain("expiry_scheduled");
    }
  });

  it("rejects duplicate ids with CONFLICT", async () => {
    const manifest = composeManifest({ id: idA, name: "again", createdAt: now() });
    const res = await rpc("identity.create", { manifest });
    expect(res.status).toBe(409);
    if (!res.body.ok) expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects an over-claiming manifest with field-level issues", async () => {
    const manifest = composeManifest({ id: generateIdentityId(), name: "x", createdAt: now() });
    const evil = JSON.parse(JSON.stringify(manifest)) as Record<string, any>;
    evil.permissions.wallet.enforcement = "enforced";
    const res = await rpc("identity.create", { manifest: evil });
    expect(res.status).toBe(400);
    if (!res.body.ok) {
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.error.issues?.some((i) => i.path.includes("permissions.wallet"))).toBe(true);
    }
  });

  it("rejects manifests whose paths do not match the runtime layout", async () => {
    const manifest = composeManifest({ id: generateIdentityId(), name: "x", createdAt: now() });
    const forged = JSON.parse(JSON.stringify(manifest)) as Record<string, any>;
    forged.surfaces.browser.profilePath = "profiles/somewhere-else";
    const res = await rpc("identity.create", { manifest: forged });
    expect(res.status).toBe(400);
  });

  it("gets summary + manifest and lists with a state filter", async () => {
    const got = await rpc<{ summary: { name: string }; manifest: { id: string } | null }>(
      "identity.get",
      { id: idA }
    );
    if (got.body.ok) {
      expect(got.body.result.summary.name).toBe("client acme");
      expect(got.body.result.manifest?.id).toBe(idA);
    }

    const all = await rpc<Array<{ id: string }>>("identity.list", {});
    if (all.body.ok) expect(all.body.result.map((s) => s.id)).toEqual([idA, idB]);

    const created = await rpc<Array<{ id: string }>>("identity.list", {
      filter: { state: ["created"] },
    });
    if (created.body.ok) expect(created.body.result).toHaveLength(2);
  });

  it("404s a missing identity", async () => {
    const res = await rpc("identity.get", { id: "idn_zzzzzzzzzzzzzzzzzzzzz" });
    expect(res.status).toBe(404);
  });

  it("reports status and capabilities from the enforcement table", async () => {
    const status = await rpc<{ version: string; identitiesRunning: number }>("runtime.status", {});
    if (status.body.ok) {
      expect(status.body.result.version).toBeTruthy();
      expect(status.body.result.identitiesRunning).toBe(0);
    }
    const caps = await rpc<{ enforceable: string[]; reservedMethods: string[] }>(
      "runtime.capabilities",
      {}
    );
    if (caps.body.ok) {
      expect(caps.body.result.enforceable).toContain("permissions.filesystem");
      expect(caps.body.result.enforceable).toContain("lifecycle.destruction");
      expect(caps.body.result.reservedMethods).toContain("identity.attachAgent");
    }
  });
});
