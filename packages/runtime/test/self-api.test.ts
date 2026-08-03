import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { composeManifest, generateIdentityId } from "@liminal/schema";
import { LiminalRuntime } from "../src/runtime.js";

/**
 * day-3 gate, token half: the companion surface is identity-scoped by
 * construction. this is the runtime-level G18 shape — token A against B's
 * resources fails everywhere, with no browser in the loop. the full
 * in-browser variant belongs to the day-6 isolation suite.
 */

let runtime: LiminalRuntime;
let root: string;
const idA = generateIdentityId();
const idB = generateIdentityId();
let tokenA = "";
let tokenB = "";

function selfFetch(
  token: string,
  subpath: string,
  init?: RequestInit & { origin?: string }
): Promise<Response> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    ...(init?.body !== undefined ? { "content-type": "application/json" } : {}),
  };
  if (init?.origin !== undefined) headers["origin"] = init.origin;
  return fetch(`http://127.0.0.1:${runtime.port}/v1/self${subpath}`, { ...init, headers });
}

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "liminal-self-"));
  runtime = await LiminalRuntime.start({ root });
  const now = () => new Date().toISOString();
  runtime.identities.create({
    manifest: composeManifest({
      id: idA,
      name: "alpha",
      createdAt: now(),
      color: "#F59E0B",
      lifetime: "12h",
      systemInstructions: "assistant scoped to alpha only.",
    }),
  });
  runtime.identities.create({
    manifest: composeManifest({
      id: idB,
      name: "beta",
      createdAt: now(),
      color: "#C8FF4D",
      lifetime: "12h",
      wallet: "declared",
    }),
  });
  tokenA = runtime.companionTokenFor(idA);
  tokenB = runtime.companionTokenFor(idB);
});

afterAll(async () => {
  await runtime?.stop();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

describe("companion token auth", () => {
  it("derives stable, distinct per-identity tokens", () => {
    expect(tokenA).toMatch(/^[A-Za-z0-9_-]{40,50}$/);
    expect(tokenA).not.toBe(tokenB);
    expect(runtime.companionTokenFor(idA)).toBe(tokenA);
    expect(runtime.identityForCompanionToken(tokenA)).toBe(idA);
    expect(runtime.identityForCompanionToken(tokenB)).toBe(idB);
    expect(runtime.identityForCompanionToken("forged-token-forged-token-forged-token-forg")).toBeNull();
  });

  it("rejects missing/garbage tokens on every self route", async () => {
    for (const subpath of ["", "/notes", "/ai/context", "/ai/messages", "/permissions"]) {
      const res = await fetch(`http://127.0.0.1:${runtime.port}/v1/self${subpath}`);
      expect(res.status, `unauthenticated ${subpath || "/"}`).toBe(401);
      const bad = await selfFetch("not-a-real-token-not-a-real-token-not-a-rea", subpath);
      expect(bad.status, `garbage token ${subpath || "/"}`).toBe(401);
    }
  });

  it("GET /v1/self returns only the token's own identity", async () => {
    const a = (await (await selfFetch(tokenA, "")).json()) as {
      summary: { id: string; name: string };
      remainingMs: number | null;
    };
    expect(a.summary.id).toBe(idA);
    expect(a.summary.name).toBe("alpha");
    expect(a.remainingMs).toBeGreaterThan(0);

    const b = (await (await selfFetch(tokenB, "")).json()) as { summary: { id: string } };
    expect(b.summary.id).toBe(idB);
  });
});

describe("memory scope: notes and ai are invisible across tokens (G9/G18 shape)", () => {
  let noteA = "";

  it("notes crud works within one identity", async () => {
    const created = await selfFetch(tokenA, "/notes", {
      method: "POST",
      body: JSON.stringify({ title: "engagement", bodyMd: "alpha's private notes" }),
    });
    expect(created.status).toBe(201);
    noteA = ((await created.json()) as { id: string }).id;

    const list = (await (await selfFetch(tokenA, "/notes")).json()) as Array<{ id: string }>;
    expect(list.map((n) => n.id)).toContain(noteA);

    const updated = await selfFetch(tokenA, `/notes/${noteA}`, {
      method: "PUT",
      body: JSON.stringify({ bodyMd: "updated" }),
    });
    expect(updated.status).toBe(200);
    expect(((await updated.json()) as { bodyMd: string }).bodyMd).toBe("updated");
  });

  it("B's token cannot see, update, or delete A's note — 404 everywhere", async () => {
    const listB = (await (await selfFetch(tokenB, "/notes")).json()) as unknown[];
    expect(listB).toHaveLength(0);

    expect((await selfFetch(tokenB, `/notes/${noteA}`)).status).toBe(404);
    expect(
      (
        await selfFetch(tokenB, `/notes/${noteA}`, {
          method: "PUT",
          body: JSON.stringify({ bodyMd: "stolen" }),
        })
      ).status
    ).toBe(404);
    expect((await selfFetch(tokenB, `/notes/${noteA}`, { method: "DELETE" })).status).toBe(404);

    // and A still has it, unmodified
    const mine = (await (await selfFetch(tokenA, `/notes/${noteA}`)).json()) as { bodyMd: string };
    expect(mine.bodyMd).toBe("updated");
  });

  it("ai context and messages are scoped per token", async () => {
    const ctxA = (await (await selfFetch(tokenA, "/ai/context")).json()) as {
      systemInstructions: string;
    };
    expect(ctxA.systemInstructions).toContain("alpha");
    const ctxB = (await (await selfFetch(tokenB, "/ai/context")).json()) as {
      systemInstructions: string;
    };
    expect(ctxB.systemInstructions).not.toContain("alpha");

    await selfFetch(tokenA, "/ai/messages", {
      method: "POST",
      body: JSON.stringify({ role: "user", content: "what am i working on?" }),
    });
    const messagesA = (await (await selfFetch(tokenA, "/ai/messages")).json()) as unknown[];
    const messagesB = (await (await selfFetch(tokenB, "/ai/messages")).json()) as unknown[];
    expect(messagesA).toHaveLength(1);
    expect(messagesB).toHaveLength(0);
  });

  it("ai keys live in runtime memory per identity and never round-trip across tokens", async () => {
    await selfFetch(tokenA, "/ai/key", { method: "POST", body: JSON.stringify({ key: "sk-alpha-test" }) });
    const mine = (await (await selfFetch(tokenA, "/ai/key")).json()) as { key: string | null };
    const theirs = (await (await selfFetch(tokenB, "/ai/key")).json()) as { key: string | null };
    expect(mine.key).toBe("sk-alpha-test");
    expect(theirs.key).toBeNull();
    // never persisted: nothing in the database contains the key
    const rows = runtime.repo.db
      .prepare("SELECT COUNT(*) AS n FROM settings WHERE value LIKE '%sk-alpha-test%'")
      .get() as { n: number };
    expect(rows.n).toBe(0);
  });
});

describe("permissions endpoint carries enforcement labels", () => {
  it("returns every permission with its ceiling-constrained label", async () => {
    const rows = (await (await selfFetch(tokenB, "/permissions")).json()) as Array<{
      field: string;
      value: string;
      enforcement: string;
    }>;
    const byField = new Map(rows.map((r) => [r.field, r]));
    expect(byField.get("permissions.filesystem")?.enforcement).toBe("enforced");
    expect(byField.get("permissions.memoryScope")?.enforcement).toBe("enforced");
    expect(byField.get("permissions.wallet")?.enforcement).toBe("advisory");
    expect(byField.get("permissions.wallet")?.value).toBe("declared");
    expect(byField.get("permissions.email")?.enforcement).toBe("roadmap");
    expect(byField.get("privacy.retainHistory")?.enforcement).toBe("enforced");
    expect(byField.get("privacy.redaction")?.enforcement).toBe("roadmap");
  });
});

describe("origin pinning", () => {
  it("refuses browser-originated requests that are not the identity's companion", async () => {
    const evil = await selfFetch(tokenA, "", { origin: "https://evil.example" });
    expect(evil.status).toBe(403);
    const otherExt = await selfFetch(tokenA, "", {
      origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(otherExt.status).toBe(403);
  });

  it("accepts token-only requests from the local trust boundary (no origin header)", async () => {
    expect((await selfFetch(tokenA, "")).status).toBe(200);
  });
});

describe("sse events", () => {
  it("streams countdown ticks with remaining lifetime", async () => {
    const controller = new AbortController();
    const res = await fetch(`http://127.0.0.1:${runtime.port}/v1/self/events`, {
      headers: { authorization: `Bearer ${tokenA}` },
      signal: controller.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const deadline = Date.now() + 5_000;
    let tick: { remainingMs: number | null; state: string } | null = null;
    while (Date.now() < deadline && tick === null) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const m = buffer.match(/event: tick\ndata: (.+)\n\n/);
      if (m) tick = JSON.parse(m[1] as string);
    }
    controller.abort();
    expect(tick).not.toBeNull();
    expect(tick!.state).toBe("created");
    expect(tick!.remainingMs).toBeGreaterThan(0);
  }, 15_000);
});

describe("early expiry via the companion surface", () => {
  it("POST /v1/self/expire runs the identity's onExpiry action (destroy)", async () => {
    const res = await selfFetch(tokenB, "/expire", { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    expect(runtime.identities.get(idB).summary.state).toBe("destroyed");
    // the token dies with the identity
    expect((await selfFetch(tokenB, "")).status).toBe(401);
    // and A is untouched
    expect(runtime.identities.get(idA).summary.state).toBe("created");
  });
});
