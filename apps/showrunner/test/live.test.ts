import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WallStore, verifyReceipt, type WallEvent } from "@mortal/wall";
import { TerrariumStore } from "terrarium";
import {
  CAST,
  LAUNCH_CAST,
  SHARED_LORE_BLOCKS,
  Showrunner,
  StubRuntimePort,
  bootWallService,
  buildAnthropicThinker,
  castNames,
  createWallApi,
  personaFor,
  scriptedThinker,
  storeTerrariumClient,
  type CastMember,
} from "../src/index.js";

const FLAGS = { platformAllowlist: ["terrarium"], sponsorEnabled: false };

describe("lore sizing (the haiku cache floor)", () => {
  it("the shared prefix clears 4096 tokens even under a conservative tokenizer", () => {
    const sharedChars = SHARED_LORE_BLOCKS.reduce((sum, block) => sum + block.length, 0);
    // ~4 chars/token is typical for lowercase prose; 4.5 is the safety
    // divisor so an unfavorable tokenizer still clears the minimum
    expect(sharedChars / 4.5).toBeGreaterThan(4096);
  });

  it("every cast member has a real bible, and the lore keeps its own voice rules", () => {
    for (const member of CAST) {
      const persona = personaFor(member);
      expect(persona.length, member.agent_id).toBeGreaterThan(1000);
    }
    const everything = [...SHARED_LORE_BLOCKS, ...CAST.map((m) => personaFor(m))].join("\n");
    expect(everything).not.toMatch(/—/);
    expect(everything).not.toMatch(/!/);
  });

  it("the shared blocks are byte-identical across agents and volatile facts stay out", async () => {
    const systems: Array<Array<{ text: string; cache_control?: { type: string } }>> = [];
    const think = buildAnthropicThinker({
      apiKey: "sk-test",
      fetch: async (_url, init) => {
        systems.push(
          (JSON.parse(String(init?.body)) as { system: (typeof systems)[number] }).system
        );
        return new Response(
          JSON.stringify({
            id: "m",
            type: "message",
            role: "assistant",
            model: "m",
            content: [{ type: "text", text: JSON.stringify({ monologue: "x" }) }],
            stop_reason: "end_turn",
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    });
    const mkCtx = (agentId: string, name: string) => ({
      agent_id: agentId,
      name,
      role: "r",
      locale: null,
      tier: "ambient" as const,
      memory: ["volatile memory line"],
      reading: [],
      ttl_remaining_seconds: 60,
      inherited_fragments: [],
    });
    await think(mkCtx("ag_yuki", "yuki"));
    await think(mkCtx("ag_marlowe", "marlowe"));
    const [a, b] = systems as [NonNullable<(typeof systems)[0]>, NonNullable<(typeof systems)[0]>];
    // shared blocks byte-identical; persona (last block) differs
    for (let i = 0; i < a.length - 1; i++) {
      expect(a[i]?.text).toBe(b[i]?.text);
    }
    expect(a[a.length - 1]?.text).not.toBe(b[b.length - 1]?.text);
    // breakpoint on the last shared block and on the persona
    expect(a[a.length - 2]?.cache_control?.type).toBe("ephemeral");
    expect(a[a.length - 1]?.cache_control?.type).toBe("ephemeral");
    // volatile facts never enter the system prefix
    expect(a.map((s) => s.text).join("\n")).not.toContain("volatile memory line");
  });
});

describe("ash spawn calendar", () => {
  let dir: string;
  let wallStore: WallStore;
  let terrariumStore: TerrariumStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "calendar-"));
    wallStore = new WallStore(join(dir, "wall.db"));
    terrariumStore = new TerrariumStore(join(dir, "t.db"));
  });
  afterEach(() => {
    wallStore.close();
    terrariumStore.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("successors arrive on the mon+thu slot with inheritance; living ashes block duplicates", async () => {
    let clock = new Date("2026-08-08T12:00:00Z"); // saturday
    const showrunner = new Showrunner({
      store: wallStore,
      runtime: new StubRuntimePort(),
      terrarium: storeTerrariumClient(terrariumStore),
      think: scriptedThinker,
      flags: { ...FLAGS },
      now: () => clock,
    });
    Object.assign(showrunner.names, castNames());
    const ash = LAUNCH_CAST.find((m) => m.agent_id === "ag_ash") as CastMember;
    showrunner.registerSerialMember(ash);

    // first incarnation off-calendar (launch day), then dies
    await showrunner.spawn(ash, { inherited_fragments: [] });
    await showrunner.die("ag_ash_1", "ttl");

    // saturday: no successor
    await showrunner.calendarTick();
    expect(showrunner.live.has("ag_ash_2")).toBe(false);

    // monday 18:05 utc: the slot fires, successor carries fragments
    clock = new Date("2026-08-10T18:05:00Z");
    await showrunner.calendarTick();
    const second = showrunner.live.get("ag_ash_2");
    expect(second).toBeDefined();
    expect(second?.memory.length).toBeGreaterThan(0);

    // still inside the slot hour: the living ash blocks a duplicate
    clock = new Date("2026-08-10T18:40:00Z");
    await showrunner.calendarTick();
    expect(showrunner.live.has("ag_ash_3")).toBe(false);
  });
});

describe("live delivery: /recent and the sse cap", () => {
  let dir: string;
  let wallStore: WallStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "live-"));
    wallStore = new WallStore(join(dir, "wall.db"));
  });
  afterEach(() => {
    wallStore.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("/recent serves raw public events from a cursor for polling clients", async () => {
    const spawn = wallStore.append({
      agent_id: "ag_marlowe",
      kind: "spawn",
      visibility: "public",
      primitive: "identity.create()",
      payload: {
        class: "persona",
        region: "uk-london",
        locale: "en-GB",
        ttl_seconds: 86_400,
        fingerprint_short: "fp_1",
        inherited_fragments: [],
      },
    });
    wallStore.append({
      agent_id: "ag_marlowe",
      kind: "monologue",
      visibility: "internal",
      payload: { text: "hidden" },
    });
    const mono = wallStore.append({
      agent_id: "ag_marlowe",
      kind: "monologue",
      visibility: "public",
      payload: { text: "the archive is patient" },
    });
    const api = createWallApi({ store: wallStore, names: () => ({}) });
    await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
    const address = api.address();
    const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    try {
      const all = (await (await fetch(`${base}/recent`)).json()) as {
        events: WallEvent[];
        latest_id: string;
      };
      expect(all.events.map((e) => e.id)).toEqual([spawn.id, mono.id]);
      expect(all.latest_id).toBe(mono.id);
      expect(JSON.stringify(all.events)).not.toContain("hidden");

      const after = (await (await fetch(`${base}/recent?after=${spawn.id}`)).json()) as {
        events: WallEvent[];
      };
      expect(after.events.map((e) => e.id)).toEqual([mono.id]);
    } finally {
      await new Promise((resolve) => api.close(resolve));
    }
  });

  it("the sse cap turns extra viewers away with 503 + poll advice, and frees slots on close", async () => {
    const api = createWallApi({ store: wallStore, names: () => ({}), maxSseConnections: 2 });
    await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
    const address = api.address();
    const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    try {
      const open = async () => {
        const controller = new AbortController();
        const res = await fetch(`${base}/events`, { signal: controller.signal });
        return { res, controller };
      };
      const first = await open();
      const second = await open();
      expect(first.res.status).toBe(200);
      expect(second.res.status).toBe(200);

      const third = await fetch(`${base}/events`);
      expect(third.status).toBe(503);
      expect(third.headers.get("retry-after")).toBe("30");
      expect(((await third.json()) as { error: string }).error).toContain("/recent");

      // closing a stream frees the slot
      first.controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const fourth = await open();
      expect(fourth.res.status).toBe(200);
      fourth.controller.abort();
      second.controller.abort();
    } finally {
      await new Promise((resolve) => api.close(resolve));
    }
  });
});

describe("the death path through the real service composition", () => {
  it("a short-ttl ash dies on schedule: graveyard, frozen archive, verified receipt", async () => {
    const root = mkdtempSync(join(tmpdir(), "svc-death-"));
    const throwaway: CastMember = {
      agent_id: "ag_smoke_ash",
      name: "smoke-ash",
      class: "burner",
      region: null,
      locale: null,
      tz: null,
      ttl_seconds: 2,
      serial: true,
      role: "throwaway manifesto blog for the death-path test",
      runtime_feature: "clean teardown, verified end to end",
      wave: 1,
      tenant: "smoke-ash",
    };
    const service = await bootWallService({
      root,
      port: 0,
      cast: [throwaway],
      tickSeconds: 0.4,
      heartbeatSeconds: 3600,
      env: { WALL_THINKER: "scripted", STREAM_PROVIDER: "none" } as NodeJS.ProcessEnv,
      log: () => undefined,
    });
    const base = `http://127.0.0.1:${service.port}`;
    try {
      // the ash lives a beat, then the real tick honors the ttl
      await service.showrunner.heartbeat("ag_smoke_ash_1");
      const deadline = Date.now() + 15_000;
      let dead: { name: string; cause: string; receipt: string } | null = null;
      while (Date.now() < deadline && !dead) {
        const graveyard = (await (await fetch(`${base}/graveyard`)).json()) as {
          dead: Array<{ name: string; cause: string; receipt: string }>;
        };
        dead = graveyard.dead[0] ?? null;
        if (!dead) await new Promise((resolve) => setTimeout(resolve, 300));
      }
      expect(dead?.name).toBe("smoke-ash-1");
      expect(dead?.cause).toBe("ttl");
      expect(dead?.receipt).toMatch(/^[0-9a-f]{64}$/);

      const recent = (await (await fetch(`${base}/recent`)).json()) as { events: WallEvent[] };
      const death = recent.events.find((e) => e.kind === "death");
      expect(death?.primitive).toBe("identity.destroy()");
      expect(verifyReceipt(death as never)).toBe(true);

      const archive = await fetch(`${base}/t/smoke-ash-1/`);
      expect(archive.status).toBe(200);
      expect(await archive.text()).toContain("frozen read-only");
    } finally {
      await service.stop();
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});
