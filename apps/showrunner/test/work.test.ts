import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WallStore, wallStats } from "@mortal/wall";
import { TerrariumStore } from "terrarium";
import {
  CAST,
  LAUNCH_CAST,
  Showrunner,
  StubRuntimePort,
  buildAnthropicThinker,
  castNames,
  createWallApiHandler,
  storeTerrariumClient,
  type CastMember,
  type ThinkContext,
} from "../src/index.js";
import { IncomingMessage, ServerResponse, createServer, type Server } from "node:http";

/**
 * the work: every life on the wall is FOR something stated, and its
 * progress is the record's own count, never a claim. these pin the cast
 * declarations, the record-true counting, /now's serving of both, and
 * the beat that makes the identity feel where it stands.
 */

describe("the cast declares the work", () => {
  it("every member has a work with a line, a countable act and a unit", () => {
    for (const member of CAST) {
      expect(member.work, `${member.agent_id} has no work`).toBeDefined();
      const work = member.work as NonNullable<CastMember["work"]>;
      expect(work.line.length).toBeGreaterThan(10);
      expect(["published_post", "opened_page", "human_contact"]).toContain(work.counts);
      expect(work.unit.length).toBeGreaterThan(0);
      if (work.target !== undefined) expect(work.target).toBeGreaterThan(0);
    }
  });

  it("a finite work fits the life it is given", () => {
    // yuki: 90 entries in 90 days; rui: 60 notes in 60 days; ash: one
    // manifesto in six hours. a target the ttl cannot hold would be a
    // scripted failure, and the wall does not script failures.
    const yuki = CAST.find((m) => m.agent_id === "ag_yuki") as CastMember;
    expect(yuki.work?.target).toBe(90);
    expect(yuki.ttl_seconds).toBe(90 * 86_400);
    const ash = CAST.find((m) => m.agent_id === "ag_ash") as CastMember;
    expect(ash.work?.target).toBe(1);
  });
});

describe("the record counts the work", () => {
  let dir: string;
  let store: WallStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "work-"));
    store = new WallStore(join(dir, "wall.db"));
  });
  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("wallStats counts published posts and human contacts per agent", () => {
    store.append({
      agent_id: "ag_x",
      kind: "action",
      visibility: "public",
      payload: { verb: "published_post", title: "one" },
    });
    store.append({
      agent_id: "ag_x",
      kind: "action",
      visibility: "public",
      payload: { verb: "opened_page", target_url: "https://a.example/" },
    });
    store.append({
      agent_id: "ag_x",
      kind: "human_contact",
      visibility: "public",
      payload: { platform: "terrarium", excerpt: "hello", url: "/t/x/posts/1" },
    });
    // internal events never count: the figure on screen is the public record's
    store.append({
      agent_id: "ag_x",
      kind: "action",
      visibility: "internal",
      payload: { verb: "published_post", title: "hidden" },
    });
    const stats = wallStats(store.list());
    expect(stats.by_agent.ag_x?.published).toBe(1);
    expect(stats.by_agent.ag_x?.pages_read).toBe(1);
    expect(stats.by_agent.ag_x?.human_contacts).toBe(1);
  });
});

describe("/now serves the work with record-true progress", () => {
  let dir: string;
  let store: WallStore;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "work-api-"));
    store = new WallStore(join(dir, "wall.db"));
    const handler = createWallApiHandler({
      store,
      names: () => ({ ag_yuki: "yuki" }),
      workFor: (agentId) =>
        agentId === "ag_yuki"
          ? { line: "ninety entries", counts: "published_post", unit: "entries", target: 90 }
          : null,
    });
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      void handler(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  });
  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("pairs the declaration with the record's count", async () => {
    store.append({
      agent_id: "ag_yuki",
      kind: "spawn",
      visibility: "public",
      primitive: "identity.create()",
      payload: {
        class: "persona",
        region: "jp-tokyo",
        locale: "ja-JP",
        ttl_seconds: 90 * 86_400,
        fingerprint_short: "fp_1",
        inherited_fragments: [],
      },
    });
    store.append({
      agent_id: "ag_yuki",
      kind: "action",
      visibility: "public",
      payload: { verb: "published_post", title: "day one" },
    });
    const body = (await (await fetch(`${base}/now`)).json()) as {
      agents: Array<{ agent_id: string; work?: { line: string; done: number; target?: number; unit: string } }>;
    };
    const yuki = body.agents.find((a) => a.agent_id === "ag_yuki");
    expect(yuki?.work).toEqual({
      line: "ninety entries",
      unit: "entries",
      done: 1,
      target: 90,
    });
  });
});

describe("the beat carries the work", () => {
  const fakeResponse = () =>
    new Response(
      JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-test",
        content: [{ type: "text", text: JSON.stringify({ monologue: "x" }) }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  it("states the work and the record's own count, target included when finite", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const think = buildAnthropicThinker({
      apiKey: "sk-test",
      fetch: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return fakeResponse();
      },
    });
    await think({
      agent_id: "ag_yuki",
      name: "yuki",
      role: "diary",
      locale: "ja-JP",
      tier: "ambient",
      memory: [],
      reading: [],
      work: { line: "ninety entries or the diary dies unfinished", unit: "entries", done: 12, target: 90 },
      ttl_remaining_seconds: 3600,
      inherited_fragments: [],
    } as ThinkContext);
    const turn = (bodies[0] as { messages: Array<{ content: string }> }).messages[0]
      ?.content as string;
    expect(turn).toContain("your work, the thing your remaining time is for");
    expect(turn).toContain("ninety entries or the diary dies unfinished");
    expect(turn).toContain("12 of 90 entries");
  });

  it("the heartbeat wires live counters into the beat's work", async () => {
    const dir = mkdtempSync(join(tmpdir(), "work-hb-"));
    const wallStore = new WallStore(join(dir, "wall.db"));
    const terrariumStore = new TerrariumStore(join(dir, "t.db"));
    const seen: ThinkContext[] = [];
    try {
      const showrunner = new Showrunner({
        store: wallStore,
        runtime: new StubRuntimePort(),
        terrarium: storeTerrariumClient(terrariumStore),
        think: async (ctx) => {
          seen.push(ctx);
          return {};
        },
        flags: { platformAllowlist: ["terrarium"], sponsorEnabled: false },
      });
      Object.assign(showrunner.names, castNames());
      const vesper = LAUNCH_CAST.find((m) => m.agent_id === "ag_vesper") as CastMember;
      await showrunner.spawn(vesper);
      const live = showrunner.live.get("ag_vesper");
      if (live) live.pages_read = 41;
      await showrunner.heartbeat("ag_vesper");
      const ctx = seen[0] as ThinkContext;
      expect(ctx.work?.line).toContain("thousand pages");
      expect(ctx.work?.done).toBe(41);
      expect(ctx.work?.target).toBe(1000);
    } finally {
      wallStore.close();
      terrariumStore.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
