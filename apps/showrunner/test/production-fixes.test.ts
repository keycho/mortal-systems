import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WallStore, type PayloadFor } from "@mortal/wall";
import { TerrariumStore, createTerrariumServer } from "terrarium";
import {
  LAUNCH_CAST,
  Showrunner,
  StubRuntimePort,
  TargetGoneError,
  buildAnthropicThinker,
  castNames,
  parseThought,
  scriptedThinker,
  storeTerrariumClient,
  type ActDriver,
  type CastMember,
} from "../src/index.js";

const FLAGS = { platformAllowlist: ["terrarium"], sponsorEnabled: false };

describe("terrarium errors render in-world", () => {
  let dir: string;
  let store: TerrariumStore;
  let base: string;
  let server: ReturnType<typeof createTerrariumServer>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "err-"));
    store = new TerrariumStore(join(dir, "t.db"));
    store.createTenant({ name: "marlowe", agent_id: "ag_marlowe", title: "the slow blog" });
    server = createTerrariumServer({ store, adminToken: "tok" });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });
  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("a missing post is an in-world page with a way home, never raw json", async () => {
    const res = await fetch(`${base}/t/marlowe/posts/pst_nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("this post does not exist.");
    expect(html).toContain("mortal systems");
    expect(html).toContain('href="/t/marlowe/"');
    expect(html).not.toContain('{"error"');
  });

  it("missing tenants and frozen archives render the same way", async () => {
    const gone = await fetch(`${base}/t/nobody/`);
    expect(gone.status).toBe(404);
    expect(await gone.text()).toContain("nobody lives at this address.");

    store.freezeTenant("marlowe");
    const frozen = await fetch(`${base}/t/marlowe/compose`);
    expect(frozen.status).toBe(410);
    const frozenHtml = await frozen.text();
    expect(frozenHtml).toContain("read-only");
    expect(frozenHtml).toContain("back to the blog");
  });

  it("json callers still get json", async () => {
    const res = await fetch(`${base}/t/marlowe/posts/pst_nope`, {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toContain("does not exist");
  });
});

describe("driver targets that are gone", () => {
  let dir: string;
  let wallStore: WallStore;
  let terrariumStore: TerrariumStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gone-"));
    wallStore = new WallStore(join(dir, "w.db"));
    terrariumStore = new TerrariumStore(join(dir, "t.db"));
  });
  afterEach(() => {
    wallStore.close();
    terrariumStore.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const boot = async (driver: ActDriver) => {
    const showrunner = new Showrunner({
      store: wallStore,
      runtime: new StubRuntimePort(),
      terrarium: storeTerrariumClient(terrariumStore),
      think: scriptedThinker,
      flags: { ...FLAGS },
    });
    Object.assign(showrunner.names, castNames());
    const marlowe = LAUNCH_CAST.find((m) => m.agent_id === "ag_marlowe") as CastMember;
    await showrunner.spawn(marlowe);
    showrunner.driver = driver;
    return showrunner;
  };

  it("a reply to a vanished post becomes an honest opened_page event, never a client-side reply", async () => {
    let clientReplies = 0;
    const showrunner = await boot({
      busy: () => false,
      openPage: async () => ({ landed: "/t/marlowe/", detour: false }),
      publishPost: async () => ({ id: "p", url: "/t/marlowe/posts/p" }),
      replyComment: async () => {
        throw new TargetGoneError("post pst_gone is not on marlowe's page", "/t/marlowe/");
      },
    });
    const internals = showrunner as unknown as {
      terrarium: { reply: (...args: unknown[]) => Promise<void> };
      performAct: (agent: unknown, act: unknown) => Promise<void>;
    };
    const original = internals.terrarium.reply.bind(internals.terrarium);
    internals.terrarium.reply = async (...args: unknown[]) => {
      clientReplies += 1;
      return original(...args);
    };

    await internals.performAct(showrunner.live.get("ag_marlowe"), {
      kind: "reply_comment",
      post_id: "pst_gone",
      body: "too late",
    });

    expect(clientReplies).toBe(0);
    const actions = wallStore.list({ kinds: ["action"], agentId: "ag_marlowe" });
    const last = actions[actions.length - 1];
    const payload = last?.payload as PayloadFor<"action">;
    expect(payload.verb).toBe("opened_page");
    expect(payload.target_url).toBe("/t/marlowe/");
    expect(payload.title).toBe("a page that was gone");
  });

  it("an open_page detour records where the reader actually landed", async () => {
    const showrunner = await boot({
      busy: () => false,
      openPage: async () => ({ landed: "/t/yuki/", detour: true }),
      publishPost: async () => ({ id: "p", url: "/x" }),
      replyComment: async () => undefined,
    });
    await (
      showrunner as unknown as { performAct: (agent: unknown, act: unknown) => Promise<void> }
    ).performAct(showrunner.live.get("ag_marlowe"), {
      kind: "open_page",
      url: "/t/yuki/posts/pst_gone",
      title: "yuki on winter",
    });
    const actions = wallStore.list({ kinds: ["action"], agentId: "ag_marlowe" });
    const payload = actions[actions.length - 1]?.payload as PayloadFor<"action">;
    expect(payload.target_url).toBe("/t/yuki/");
    expect(payload.title).toBe("a page that was gone");
    const agent = showrunner.live.get("ag_marlowe");
    expect(agent?.memory.join(" ")).toContain("the page was gone");
  });
});

describe("anti-repetition context", () => {
  const fakeResponse = (thought: unknown) =>
    new Response(
      JSON.stringify({
        id: "m",
        type: "message",
        role: "assistant",
        model: "m",
        content: [{ type: "text", text: JSON.stringify(thought) }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  it("the last monologues ride in the volatile turn with a do-not-restate instruction", async () => {
    const bodies: Array<{ system: Array<{ text: string }>; messages: Array<{ content: string }> }> = [];
    const think = buildAnthropicThinker({
      apiKey: "sk-test",
      fetch: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as (typeof bodies)[number]);
        return fakeResponse({ monologue: null, act: null, final_words: null });
      },
    });
    const thought = await think({
      agent_id: "ag_marlowe",
      name: "marlowe",
      role: "r",
      locale: null,
      tier: "ambient",
      memory: [],
      reading: [],
      recent_monologues: ["the archive is patient", "rain again"],
      ttl_remaining_seconds: 60,
      inherited_fragments: [],
    });
    const body = bodies[0] as (typeof bodies)[number];
    const user = body.messages[0]?.content as string;
    expect(user).toContain("the archive is patient");
    expect(user).toContain("do not restate");
    expect(user).toContain("go quiet");
    // spoken lines stay volatile: never in the cached prefix
    expect(body.system.map((s) => s.text).join("\n")).not.toContain("the archive is patient");
    // a null monologue is an honest quiet beat
    expect(thought.monologue).toBeUndefined();
  });

  it("parseThought treats null and empty monologues as silence", () => {
    expect(parseThought(JSON.stringify({ monologue: null }))).toEqual({});
    expect(parseThought(JSON.stringify({ monologue: "  " }))).toEqual({});
  });

  it("the showrunner tracks spoken monologues, capped at three", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mono-"));
    const wallStore = new WallStore(join(dir, "w.db"));
    const terrariumStore = new TerrariumStore(join(dir, "t.db"));
    try {
      const showrunner = new Showrunner({
        store: wallStore,
        runtime: new StubRuntimePort(),
        terrarium: storeTerrariumClient(terrariumStore),
        think: scriptedThinker,
        flags: { ...FLAGS },
      });
      Object.assign(showrunner.names, castNames());
      const marlowe = LAUNCH_CAST.find((m) => m.agent_id === "ag_marlowe") as CastMember;
      await showrunner.spawn(marlowe);
      for (let i = 0; i < 5; i++) await showrunner.heartbeat("ag_marlowe");
      const agent = showrunner.live.get("ag_marlowe");
      expect(agent?.monologues.length).toBeLessThanOrEqual(3);
      expect(agent?.monologues.length).toBeGreaterThan(0);

      // and resume rebuilds them from the public record
      const second = new Showrunner({
        store: wallStore,
        runtime: new StubRuntimePort(),
        terrarium: storeTerrariumClient(terrariumStore),
        think: scriptedThinker,
        flags: { ...FLAGS },
      });
      Object.assign(second.names, castNames());
      await second.resume(LAUNCH_CAST);
      const resumed = second.live.get("ag_marlowe");
      expect(resumed?.monologues.length).toBeGreaterThan(0);
      expect(resumed?.monologues.length).toBeLessThanOrEqual(3);
    } finally {
      wallStore.close();
      terrariumStore.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
