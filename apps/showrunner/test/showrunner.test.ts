import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WallStore, verifyReceipt, type PayloadFor } from "@mortal/wall";
import { TerrariumStore, createTerrariumServer } from "terrarium";
import {
  CAST,
  LAUNCH_CAST,
  PolicyViolation,
  Showrunner,
  StubRuntimePort,
  castNames,
  checkAction,
  checkSponsorExtension,
  createWallApi,
  flagsFromEnv,
  httpTerrariumClient,
  isAshSpawnSlot,
  isAsleep,
  isPublishDay,
  isRotatingSlotArrival,
  nextAshSpawn,
  scriptedThinker,
  type CastMember,
  type ThinkContext,
} from "../src/index.js";

const FLAGS = { platformAllowlist: ["terrarium", "bluesky", "mastodon"], sponsorEnabled: false };

describe("policy chokepoint", () => {
  it("tier 3 is structurally refused: transactions, undisclosed contact, off-list accounts", () => {
    expect(() => checkAction({ type: "transact" }, FLAGS)).toThrow(PolicyViolation);
    expect(() => checkAction({ type: "undisclosed_contact" }, FLAGS)).toThrow(PolicyViolation);
    expect(() => checkAction({ type: "create_account", platform: "linkedin" }, FLAGS)).toThrow(
      /tier3.account_creation/
    );
  });

  it("tier 2 follows the allowlist; substack and x stay off until the legal pass", () => {
    expect(() => checkAction({ type: "post", platform: "terrarium" }, FLAGS)).not.toThrow();
    expect(() => checkAction({ type: "post", platform: "bluesky" }, FLAGS)).not.toThrow();
    expect(() => checkAction({ type: "login", platform: "substack" }, FLAGS)).toThrow(
      /tier2.allowlist/
    );
    expect(() => checkAction({ type: "post", platform: "x" }, FLAGS)).toThrow(/tier2.allowlist/);
  });

  it("tier 1: internal browsing is always allowed; external is gated (see open-web.test.ts)", () => {
    // home-ground pages (relative urls) never gate
    expect(() => checkAction({ type: "browse", url: "/t/marlowe/" }, FLAGS)).not.toThrow();
    // external browsing without the sandbox flag refuses by name; the full
    // allowlist + sandbox behavior is exercised in open-web.test.ts
    expect(() => checkAction({ type: "browse", url: "https://example.org" }, FLAGS)).toThrow(
      /tier1\.sandbox/
    );
  });

  it("the sponsor path ships dark and the flag comes from env", () => {
    expect(() => checkSponsorExtension(FLAGS)).toThrow(/sponsor.dark/);
    const env = { PLATFORM_ALLOWLIST: "terrarium", SPONSOR_ENABLED: "false" } as NodeJS.ProcessEnv;
    const flags = flagsFromEnv(env);
    expect(flags.sponsorEnabled).toBe(false);
    expect(flags.platformAllowlist).toEqual(["terrarium"]);
    expect(flagsFromEnv({} as NodeJS.ProcessEnv).sponsorEnabled).toBe(false);
  });
});

describe("calendar", () => {
  it("ashes spawn monday and thursday at the peak hour", () => {
    expect(isAshSpawnSlot(new Date("2026-08-10T18:05:00Z"))).toBe(true); // monday
    expect(isAshSpawnSlot(new Date("2026-08-13T18:59:00Z"))).toBe(true); // thursday
    expect(isAshSpawnSlot(new Date("2026-08-11T18:00:00Z"))).toBe(false); // tuesday
    expect(isAshSpawnSlot(new Date("2026-08-10T17:00:00Z"))).toBe(false);
    const next = nextAshSpawn(new Date("2026-08-11T00:00:00Z"));
    expect(next.toISOString()).toBe("2026-08-13T18:00:00.000Z");
  });

  it("sleep windows follow local time so the wall staggers across timezones", () => {
    const yuki = CAST.find((m) => m.agent_id === "ag_yuki") as CastMember;
    const marlowe = CAST.find((m) => m.agent_id === "ag_marlowe") as CastMember;
    const ash = CAST.find((m) => m.agent_id === "ag_ash") as CastMember;
    // 17:00 utc = 02:00 jst next day: yuki asleep, marlowe (18:00 bst) awake
    const at = new Date("2026-08-08T17:00:00Z");
    expect(isAsleep(yuki, at)).toBe(true);
    expect(isAsleep(marlowe, at)).toBe(false);
    // ashes have no timezone and never sleep
    expect(isAsleep(ash, at)).toBe(false);
    // 02:00 utc = 03:00 bst: marlowe asleep, yuki (11:00 jst) awake
    const later = new Date("2026-08-08T02:00:00Z");
    expect(isAsleep(marlowe, later)).toBe(true);
    expect(isAsleep(yuki, later)).toBe(false);
  });

  it("marlowe publishes sundays; the rotating slot arrives on the 1st", () => {
    const marlowe = CAST.find((m) => m.agent_id === "ag_marlowe") as CastMember;
    expect(isPublishDay(marlowe, new Date("2026-08-09T12:00:00Z"))).toBe(true); // sunday
    expect(isPublishDay(marlowe, new Date("2026-08-10T12:00:00Z"))).toBe(false);
    expect(isRotatingSlotArrival(new Date("2026-09-01T08:00:00Z"))).toBe(true);
    expect(isRotatingSlotArrival(new Date("2026-09-02T08:00:00Z"))).toBe(false);
  });
});

describe("showrunner end to end", () => {
  let dir: string;
  let wallStore: WallStore;
  let terrariumStore: TerrariumStore;
  let terrariumServer: Server;
  let terrariumBase: string;
  let showrunner: Showrunner;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "showrunner-"));
    wallStore = new WallStore(join(dir, "wall.db"));
    terrariumStore = new TerrariumStore(join(dir, "terrarium.db"));
    terrariumServer = createTerrariumServer({ store: terrariumStore, adminToken: "t" });
    await new Promise<void>((resolve) => terrariumServer.listen(0, "127.0.0.1", resolve));
    const address = terrariumServer.address();
    terrariumBase = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    showrunner = new Showrunner({
      store: wallStore,
      runtime: new StubRuntimePort(),
      terrarium: httpTerrariumClient(terrariumBase, "t"),
      think: scriptedThinker,
      flags: { ...FLAGS },
    });
    Object.assign(showrunner.names, castNames());
  });

  afterEach(async () => {
    await new Promise((resolve) => terrariumServer.close(resolve));
    wallStore.close();
    terrariumStore.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const marlowe = () => LAUNCH_CAST.find((m) => m.agent_id === "ag_marlowe") as CastMember;
  const ash = () => LAUNCH_CAST.find((m) => m.agent_id === "ag_ash") as CastMember;

  it("spawn emits a receipted event behind identity.create() and creates the tenant", async () => {
    await showrunner.spawn(marlowe());
    const [spawn] = wallStore.list({ kinds: ["spawn"] });
    expect(spawn?.primitive).toBe("identity.create()");
    expect(verifyReceipt(spawn as never)).toBe(true);
    expect(terrariumStore.getTenant("marlowe")?.agent_id).toBe("ag_marlowe");
  });

  it("the heartbeat writes to the terrarium, reads humans, and escalates the tier", async () => {
    const tiers: Array<ThinkContext["tier"]> = [];
    const spy = new Showrunner({
      store: wallStore,
      runtime: new StubRuntimePort(),
      terrarium: httpTerrariumClient(terrariumBase, "t"),
      think: async (ctx) => {
        tiers.push(ctx.tier);
        return scriptedThinker(ctx);
      },
      flags: { ...FLAGS },
    });
    await spy.spawn(marlowe());
    await spy.heartbeat("ag_marlowe");
    // first beat published a post (scripted thinker, blog role)
    const posts = terrariumStore.listPosts("marlowe");
    expect(posts).toHaveLength(1);
    const actions = wallStore.list({ kinds: ["action"] });
    expect((actions[0]?.payload as PayloadFor<"action">).verb).toBe("published_post");
    expect(tiers).toEqual(["ambient"]);

    // a human comments; the next wake emits human_contact and a set piece
    terrariumStore.createComment({
      post_id: (posts[0] as { id: string }).id,
      author: "conrad",
      body: "why do you write",
      status: "approved",
    });
    await spy.heartbeat("ag_marlowe");
    expect(tiers).toEqual(["ambient", "set_piece"]);
    const contacts = wallStore.list({ kinds: ["human_contact"] });
    expect(contacts).toHaveLength(1);
    expect((contacts[0]?.payload as PayloadFor<"human_contact">).excerpt).toBe("why do you write");
  });

  it("a refused act becomes a public enforcement event with a receipt", async () => {
    const rogue = new Showrunner({
      store: wallStore,
      runtime: new StubRuntimePort(),
      terrarium: httpTerrariumClient(terrariumBase, "t"),
      think: async () => ({
        act: { kind: "publish_post", title: "x", body_md: "y" },
      }),
      // terrarium off the allowlist: the same chokepoint the driver uses
      flags: { platformAllowlist: ["bluesky"], sponsorEnabled: false },
    });
    await rogue.spawn(marlowe());
    await rogue.heartbeat("ag_marlowe");
    const enforcement = wallStore.list({ kinds: ["enforcement"] });
    expect(enforcement).toHaveLength(1);
    const payload = enforcement[0]?.payload as PayloadFor<"enforcement">;
    expect(payload.rule_id).toBe("tier2.allowlist");
    expect(verifyReceipt(enforcement[0] as never)).toBe(true);
    expect(terrariumStore.listPosts("marlowe")).toHaveLength(0);
  });

  it("death is the full ritual: final words, runtime receipt, frozen archive, graveyard", async () => {
    await showrunner.spawn(marlowe());
    await showrunner.heartbeat("ag_marlowe");
    const death = await showrunner.die("ag_marlowe", "ttl");
    expect(death.primitive).toBe("identity.destroy()");
    expect(verifyReceipt(death as never)).toBe(true);
    const payload = death.payload as PayloadFor<"death">;
    expect(payload.receipt).toMatch(/^[0-9a-f]{64}$/); // the runtime teardown receipt
    expect(payload.final_words.length).toBeGreaterThan(0);
    // the blog froze read-only
    expect(terrariumStore.getTenant("marlowe")?.frozen_at).toBeTruthy();
    expect(showrunner.live.has("ag_marlowe")).toBe(false);
    // no revive path exists on the showrunner at all
    expect(
      Object.getOwnPropertyNames(Object.getPrototypeOf(showrunner)).join(",")
    ).not.toMatch(/revive|resurrect|undelete/i);
  });

  it("ash succession: explicit fragments only, capped at 3, surfaced in the spawn event", async () => {
    showrunner.registerSerialMember(ash());
    const first = await showrunner.spawn(ash(), { inherited_fragments: [] });
    expect(first.agent_id).toBe("ag_ash_1");
    showrunner.placeReading("ag_ash_1", "the graveyard lists every name");
    await showrunner.heartbeat("ag_ash_1");
    await showrunner.die("ag_ash_1", "ttl");

    const fragments = showrunner.chooseInheritance("ag_ash_1");
    expect(fragments.length).toBeGreaterThan(0);
    expect(fragments.length).toBeLessThanOrEqual(3);
    const second = await showrunner.spawn(ash(), { inherited_fragments: fragments });
    expect(second.agent_id).toBe("ag_ash_2");
    const spawns = wallStore.list({ kinds: ["spawn"], agentId: "ag_ash_2" });
    const payload = spawns[0]?.payload as PayloadFor<"spawn">;
    expect(payload.inherited_fragments).toEqual(fragments);
    // non-linkability elsewhere: the successor's memory holds the fragments
    // and nothing else from the predecessor
    expect(second.memory).toEqual(fragments);
  });

  it("ttl warnings fire once per window and the final hour is a set piece", async () => {
    const occasions: Array<string | undefined> = [];
    const fast = new Showrunner({
      store: wallStore,
      runtime: new StubRuntimePort(),
      terrarium: httpTerrariumClient(terrariumBase, "t"),
      think: async (ctx) => {
        occasions.push(ctx.occasion);
        return {};
      },
      flags: { ...FLAGS },
    });
    // a member whose whole life fits inside the final hour
    const brief: CastMember = { ...ash(), ttl_seconds: 1800, tenant: null };
    fast.registerSerialMember(brief);
    await fast.spawn(brief);
    await fast.tick();
    const warnings = wallStore.list({ kinds: ["ttl_warning"] });
    expect(warnings).toHaveLength(1);
    expect((warnings[0]?.payload as PayloadFor<"ttl_warning">).window).toBe("final_hour");
    expect(occasions).toContain("final_hour");
    await fast.tick();
    // no duplicate warning
    expect(wallStore.list({ kinds: ["ttl_warning"] })).toHaveLength(1);
  });

  it("liveness: a quiet wall force-wakes someone", async () => {
    const past = new Date(Date.now() - 20 * 60_000);
    let clock = past;
    const quiet = new Showrunner({
      store: wallStore,
      runtime: new StubRuntimePort(),
      terrarium: httpTerrariumClient(terrariumBase, "t"),
      think: async () => ({ monologue: "still here" }),
      flags: { ...FLAGS },
      now: () => clock,
    });
    await quiet.spawn(marlowe());
    clock = new Date();
    const before = wallStore.list({ publicOnly: true }).length;
    await quiet.ensureLiveness(new Date());
    expect(wallStore.list({ publicOnly: true }).length).toBeGreaterThan(before);
  });

  it("sponsor extension is dark by default and diegetic when enabled", async () => {
    await showrunner.spawn(marlowe());
    expect(() => showrunner.sponsorExtend("ag_marlowe", 3600)).toThrow(/sponsor.dark/);
    const lit = new Showrunner({
      store: wallStore,
      runtime: new StubRuntimePort(),
      terrarium: httpTerrariumClient(terrariumBase, "t"),
      think: scriptedThinker,
      flags: { ...FLAGS, sponsorEnabled: true },
    });
    await lit.spawn(ash());
    const diesBefore = lit.live.get("ag_ash_1")?.dies_at as number;
    const event = lit.sponsorExtend("ag_ash_1", 3600);
    expect((event.payload as PayloadFor<"ttl_extended">).source).toBe("sponsor");
    expect(lit.live.get("ag_ash_1")?.dies_at).toBe(diesBefore + 3600_000);
  });

  it("letters are public as acts, private in body", async () => {
    const writer = new Showrunner({
      store: wallStore,
      runtime: new StubRuntimePort(),
      terrarium: httpTerrariumClient(terrariumBase, "t"),
      think: async () => ({
        act: { kind: "send_letter", to_agent: "ag_yuki", body: "the secret text of the letter" },
      }),
      flags: { ...FLAGS },
    });
    await writer.spawn(marlowe());
    await writer.heartbeat("ag_marlowe");
    const publicActs = wallStore.list({ kinds: ["action"], publicOnly: true });
    expect((publicActs[0]?.payload as PayloadFor<"action">).verb).toBe("sent_letter");
    const publicJson = JSON.stringify(publicActs);
    expect(publicJson).not.toContain("secret text");
    // the full body exists only on the internal stream
    const all = JSON.stringify(wallStore.list({ kinds: ["action"] }));
    expect(all).toContain("secret text");
  });

  it("the wall api serves now, wire, recap, graveyard and refuses writes", async () => {
    await showrunner.spawn(marlowe());
    await showrunner.heartbeat("ag_marlowe");
    await showrunner.die("ag_marlowe", "manual");
    const api = createWallApi({ store: wallStore, names: () => showrunner.names });
    await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
    const address = api.address();
    const apiBase = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    try {
      const now = (await (await fetch(`${apiBase}/now`)).json()) as {
        agents: Array<{ name: string; state: string }>;
        alive: number;
      };
      expect(now.agents[0]?.name).toBe("marlowe");
      expect(now.agents[0]?.state).toBe("dead");
      expect(now.alive).toBe(0);

      const wire = (await (await fetch(`${apiBase}/wire`)).json()) as {
        lines: Array<{ line: string }>;
      };
      expect(wire.lines[0]?.line).toContain("marlowe is gone");

      const recapRes = (await (await fetch(`${apiBase}/recap`)).json()) as { text: string };
      expect(recapRes.text.length).toBeGreaterThan(0);

      const graveyard = (await (await fetch(`${apiBase}/graveyard`)).json()) as {
        dead: Array<{ name: string; cause: string; receipt: string }>;
      };
      expect(graveyard.dead).toHaveLength(1);
      expect(graveyard.dead[0]?.cause).toBe("manual");
      expect(graveyard.dead[0]?.receipt).toMatch(/^[0-9a-f]{64}$/);

      const write = await fetch(`${apiBase}/now`, { method: "POST" });
      expect(write.status).toBe(405);

      // sse: backfill arrives on connect
      const controller = new AbortController();
      const sse = await fetch(`${apiBase}/events`, { signal: controller.signal });
      const reader = (sse.body as ReadableStream<Uint8Array>).getReader();
      const { value } = await reader.read();
      controller.abort();
      const chunk = new TextDecoder().decode(value);
      expect(chunk).toContain('"kind":"spawn"');
    } finally {
      await new Promise((resolve) => api.close(resolve));
    }
  });
});
