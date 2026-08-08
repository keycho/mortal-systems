import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WallStore, type PayloadFor } from "@mortal/wall";
import { TerrariumStore } from "terrarium";
import {
  LAUNCH_CAST,
  MuxProvider,
  SelfHostedHlsProvider,
  Showrunner,
  StreamManager,
  StreamNotImplementedError,
  StubRuntimePort,
  buildAnthropicThinker,
  castNames,
  createWallApi,
  ffmpegArgs,
  parseThought,
  scriptedThinker,
  selectStreamProvider,
  selectThinker,
  storeTerrariumClient,
  type CastMember,
  type Encoder,
  type FrameSource,
} from "../src/index.js";

const FLAGS = { platformAllowlist: ["terrarium"], sponsorEnabled: false };

describe("restart continuity (resume)", () => {
  let dir: string;
  let wallStore: WallStore;
  let terrariumStore: TerrariumStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "resume-"));
    wallStore = new WallStore(join(dir, "wall.db"));
    terrariumStore = new TerrariumStore(join(dir, "t.db"));
  });
  afterEach(() => {
    wallStore.close();
    terrariumStore.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const mkShowrunner = () =>
    new Showrunner({
      store: wallStore,
      runtime: new StubRuntimePort(),
      terrarium: storeTerrariumClient(terrariumStore),
      think: scriptedThinker,
      flags: { ...FLAGS },
    });

  it("resumes living agents without respawning, continues serial numbering, honors late deaths", async () => {
    const first = mkShowrunner();
    Object.assign(first.names, castNames());
    const marlowe = LAUNCH_CAST.find((m) => m.agent_id === "ag_marlowe") as CastMember;
    const ash = LAUNCH_CAST.find((m) => m.agent_id === "ag_ash") as CastMember;
    first.registerSerialMember(ash);
    await first.spawn(marlowe);
    await first.heartbeat("ag_marlowe"); // publishes a post
    await first.spawn(ash, { inherited_fragments: [] });
    await first.die("ag_ash_1", "ttl"); // ash-1 lived and died before the restart

    // the process restarts: a second showrunner over the same stores
    const second = mkShowrunner();
    Object.assign(second.names, castNames());
    const { recovered, unspawned } = await second.resume(LAUNCH_CAST);

    // marlowe recovered, not respawned: still exactly one spawn event
    expect(recovered).toContain("ag_marlowe");
    expect(wallStore.list({ kinds: ["spawn"], agentId: "ag_marlowe" })).toHaveLength(1);
    const lostTime = wallStore.list({ kinds: ["system"], agentId: "ag_marlowe" });
    expect(lostTime).toHaveLength(1);
    expect((lostTime[0]?.payload as PayloadFor<"system">).what).toBe("lost_time");

    // his memory carries his own public record
    const live = second.live.get("ag_marlowe");
    expect(live?.post_count).toBe(1);
    expect(live?.memory.join(" ")).toContain("published");

    // yuki never spawned and comes back as unspawned; dead ash-1 stays dead
    expect(unspawned.map((m) => m.agent_id)).toContain("ag_yuki");
    expect(second.live.has("ag_ash_1")).toBe(false);
    // serial numbering continues: the next ash is 2, never a reused 1
    const nextAsh = await second.spawn(ash, { inherited_fragments: [] });
    expect(nextAsh.agent_id).toBe("ag_ash_2");
  });

  it("refuses to resume through a port without reattach", async () => {
    const first = mkShowrunner();
    const marlowe = LAUNCH_CAST.find((m) => m.agent_id === "ag_marlowe") as CastMember;
    await first.spawn(marlowe);

    const portNoReattach = new StubRuntimePort();
    (portNoReattach as { reattach?: unknown }).reattach = undefined;
    const second = new Showrunner({
      store: wallStore,
      runtime: portNoReattach,
      terrarium: storeTerrariumClient(terrariumStore),
      think: scriptedThinker,
      flags: { ...FLAGS },
    });
    await expect(second.resume(LAUNCH_CAST)).rejects.toThrow(/fake a birth/);
  });

  it("the wall api serves /health with live facts", async () => {
    const showrunner = mkShowrunner();
    const marlowe = LAUNCH_CAST.find((m) => m.agent_id === "ag_marlowe") as CastMember;
    await showrunner.spawn(marlowe);
    const api = createWallApi({
      store: wallStore,
      names: () => showrunner.names,
      health: () => ({ agents_live: showrunner.live.size, thinker: "scripted" }),
    });
    await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
    const address = api.address();
    const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    try {
      const health = (await (await fetch(`${base}/health`)).json()) as Record<string, unknown>;
      expect(health.ok).toBe(true);
      expect(health.agents_live).toBe(1);
      expect(health.thinker).toBe("scripted");
      expect(typeof health.last_public_event_ts).toBe("string");
    } finally {
      await new Promise((resolve) => api.close(resolve));
    }
  });
});

describe("anthropic thinker", () => {
  const fakeResponse = (thought: unknown) =>
    new Response(
      JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-test",
        content: [{ type: "text", text: JSON.stringify(thought) }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  const mkContext = (tier: "ambient" | "set_piece", occasion?: string) => ({
    agent_id: "ag_marlowe",
    name: "marlowe",
    role: "slow blog",
    locale: "en-GB",
    tier,
    occasion,
    memory: ["published \"on graves\""],
    reading: ["conrad: who taught you grief"],
    ttl_remaining_seconds: 3600,
    inherited_fragments: [],
  });

  it("routes ambient beats to the haiku-class model and set pieces to the big model", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const think = buildAnthropicThinker({
      apiKey: "sk-test",
      fetch: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return fakeResponse({ monologue: "the archive is patient", act: null, final_words: null });
      },
    });
    const ambient = await think(mkContext("ambient"));
    expect(ambient.monologue).toBe("the archive is patient");
    await think(mkContext("set_piece", "final_hour"));
    expect(bodies[0]?.model).toBe("claude-haiku-4-5");
    expect(bodies[1]?.model).toBe("claude-opus-5");
  });

  it("caches the static prefix and keeps volatile facts out of it", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const think = buildAnthropicThinker({
      apiKey: "sk-test",
      personas: { ag_marlowe: "your name is marlowe. the slow blog is yours." },
      fetch: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return fakeResponse({ monologue: "x", act: null, final_words: null });
      },
    });
    await think(mkContext("ambient"));
    const body = bodies[0] as {
      system: Array<{ text: string; cache_control?: { type: string } }>;
      messages: Array<{ content: string }>;
      output_config: { format: { type: string } };
    };
    // breakpoint on the last stable block; nothing volatile before it
    const lastSystem = body.system[body.system.length - 1];
    expect(lastSystem?.cache_control).toEqual({ type: "ephemeral" });
    const prefix = body.system.map((b) => b.text).join("\n");
    expect(prefix).toContain("marlowe");
    expect(prefix).not.toContain("who taught you grief");
    expect(prefix).not.toContain("minutes");
    // volatile beat rides in the user turn
    expect(body.messages[0]?.content).toContain("who taught you grief");
    expect(body.output_config.format.type).toBe("json_schema");
  });

  it("returns downtime, never invented lines, on refusal or bad output", async () => {
    const refusing = buildAnthropicThinker({
      apiKey: "sk-test",
      fetch: async () =>
        new Response(
          JSON.stringify({
            id: "msg_r",
            type: "message",
            role: "assistant",
            model: "m",
            content: [],
            stop_reason: "refusal",
            usage: { input_tokens: 1, output_tokens: 0 },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ),
    });
    expect(await refusing(mkContext("ambient"))).toEqual({});
    expect(parseThought("not json at all")).toEqual({});
    expect(parseThought(JSON.stringify({ monologue: "x".repeat(300) })).monologue).toHaveLength(140);
    const withAct = parseThought(
      JSON.stringify({ monologue: "m", act: { kind: "publish_post", title: "t", body_md: "b" } })
    );
    expect(withAct.act?.kind).toBe("publish_post");
  });

  it("thinker selection fails loudly instead of silently degrading", () => {
    expect(() => selectThinker({ WALL_THINKER: "anthropic" } as NodeJS.ProcessEnv, scriptedThinker)).toThrow(
      /refusing to fall back/
    );
    const scripted = selectThinker({} as NodeJS.ProcessEnv, scriptedThinker);
    expect(scripted.label).toContain("scripted");
    const anthropic = selectThinker(
      { WALL_THINKER: "anthropic", ANTHROPIC_API_KEY: "sk-test" } as NodeJS.ProcessEnv,
      scriptedThinker
    );
    expect(anthropic.label).toContain("anthropic");
  });
});

describe("streaming phase one", () => {
  it("selects providers from env and stubs the self-hosted exit honestly", async () => {
    expect(selectStreamProvider({} as NodeJS.ProcessEnv)).toBeNull();
    expect(() => selectStreamProvider({ STREAM_PROVIDER: "mux" } as NodeJS.ProcessEnv)).toThrow(
      /MUX_TOKEN_ID/
    );
    const mux = selectStreamProvider({
      STREAM_PROVIDER: "mux",
      MUX_TOKEN_ID: "id",
      MUX_TOKEN_SECRET: "secret",
    } as NodeJS.ProcessEnv);
    expect(mux?.name).toBe("mux");
    const stub = selectStreamProvider({ STREAM_PROVIDER: "ffmpeg" } as NodeJS.ProcessEnv);
    expect(stub).toBeInstanceOf(SelfHostedHlsProvider);
    await expect((stub as SelfHostedHlsProvider).createChannel()).rejects.toThrow(
      StreamNotImplementedError
    );
  });

  it("mux stays inside the provider: generic hls out, rtmp ingest, clean teardown", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const provider = new MuxProvider({
      tokenId: "id",
      tokenSecret: "secret",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? undefined });
        if (init?.method === "DELETE") return new Response(null, { status: 204 });
        return new Response(
          JSON.stringify({
            data: { id: "ls_1", stream_key: "key_1", playback_ids: [{ id: "pb_1" }] },
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      },
    });
    const channel = await provider.createChannel("ag_marlowe");
    expect(channel.playback_url).toBe("https://stream.mux.com/pb_1.m3u8");
    expect(channel.ingest).toEqual({
      kind: "rtmp",
      url: "rtmps://global-live.mux.com:443/app/key_1",
    });
    expect(calls[0]?.url).toBe("https://api.mux.com/video/v1/live-streams");
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Basic ${Buffer.from("id:secret").toString("base64")}`);
    await provider.destroyChannel("ag_marlowe");
    expect(calls[1]?.url).toBe("https://api.mux.com/video/v1/live-streams/ls_1");
    expect(calls[1]?.init?.method).toBe("DELETE");
  });

  it("the manager wires capture to encoder and answers a generic playback url", async () => {
    const frames: Buffer[] = [];
    let stopped = 0;
    const fakeEncoder: Encoder = {
      writeFrame: (jpeg) => void frames.push(jpeg),
      stop: async () => void stopped++,
    };
    let emit: ((jpeg: Buffer) => void) | null = null;
    const fakeSource: FrameSource = {
      start: async (onFrame) => void (emit = onFrame),
      stop: async () => void stopped++,
    };
    const manager = new StreamManager(
      {
        name: "fake",
        createChannel: async (agentId) => ({
          agent_id: agentId,
          ingest: { kind: "rtmp", url: "rtmp://x" },
          playback_url: "https://cdn.example/agent.m3u8",
        }),
        destroyChannel: async () => undefined,
      },
      {} as NodeJS.ProcessEnv,
      { encoderFactory: () => fakeEncoder, sourceFactory: () => fakeSource }
    );
    const url = await manager.startAgent("ag_marlowe", "ws://cdp");
    expect(url).toBe("https://cdn.example/agent.m3u8");
    expect(manager.playbackUrl("ag_marlowe")).toBe(url);
    (emit as unknown as (jpeg: Buffer) => void)(Buffer.from("jpeg1"));
    expect(frames).toHaveLength(1);
    await manager.stopAgent("ag_marlowe");
    expect(stopped).toBe(2);
    expect(manager.playbackUrl("ag_marlowe")).toBeNull();
  });

  it("ffmpeg args encode both targets without provider assumptions", () => {
    const rtmp = ffmpegArgs({ kind: "rtmp", url: "rtmps://ingest/app/key" });
    expect(rtmp.join(" ")).toContain("-f flv rtmps://ingest/app/key");
    const hls = ffmpegArgs({ kind: "hls_dir", dir: "/data/hls/ag_x" });
    expect(hls.join(" ")).toContain("-f hls");
    expect(hls.join(" ")).toContain("/data/hls/ag_x/index.m3u8");
  });
});
