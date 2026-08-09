import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WallStore, agentNow, type PayloadFor } from "@mortal/wall";
import { TerrariumStore } from "terrarium";
import {
  LAUNCH_CAST,
  Showrunner,
  StubRuntimePort,
  bootWallService,
  castNames,
  storeTerrariumClient,
  type CastMember,
  type PolicyFlags,
  type WallService,
} from "../src/index.js";

/**
 * mortality integrity: death is append-only and inviolable. ash-1 died
 * on the record and was resumed alive anyway — a dangling drift wrote a
 * state_change after the death, the fold believed it, resume believed
 * the fold, and the wall showed one identity dead and alive at once
 * (/health 5 vs /now 6). every layer that made that possible is pinned
 * here: the fold freezes at death, resume checks the tombstones
 * directly, nothing can write on a corpse, a serial death produces its
 * successor at once (and at the next boot when the process was down),
 * and last words are captured from the agent's own material, never
 * empty.
 */

const FLAGS: PolicyFlags = { platformAllowlist: ["terrarium"], sponsorEnabled: false };

const ashMember = () => LAUNCH_CAST.find((m) => m.agent_id === "ag_ash") as CastMember;
const marloweMember = () => LAUNCH_CAST.find((m) => m.agent_id === "ag_marlowe") as CastMember;

/** the exact shape of the production corruption: a life, its death, and
 * a state_change appended after the death by a dangling async */
function writeCorruptedAsh(store: WallStore): void {
  store.append({
    agent_id: "ag_ash_1",
    kind: "spawn",
    visibility: "public",
    primitive: "identity.create()",
    payload: {
      class: "burner",
      region: null,
      locale: null,
      ttl_seconds: 6 * 3600,
      fingerprint_short: "fp_a1",
      inherited_fragments: [],
    },
  });
  store.append({
    agent_id: "ag_ash_1",
    kind: "death",
    visibility: "public",
    primitive: "identity.destroy()",
    payload: { lived_seconds: 21_607, cause: "ttl", final_words: "", receipt: "rt_ash1" },
  });
  // the poison: a post-death state_change from an in-flight drift
  store.append({
    agent_id: "ag_ash_1",
    kind: "state_change",
    visibility: "public",
    payload: { state: "reading", detail: "a page opened after death" },
  });
}

describe("death is the last word in every projection", () => {
  let dir: string;
  let store: WallStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mortality-"));
    store = new WallStore(join(dir, "wall.db"));
  });
  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("a post-death event cannot fold a dead agent back to life", () => {
    writeCorruptedAsh(store);
    const [ash] = agentNow(store.list());
    expect(ash?.state).toBe("dead");
    // the store stamps its own receipt over death events; the fold keeps it
    const stamped = store.list({ kinds: ["death"] })[0]?.receipt;
    expect(ash?.death?.receipt).toBe(stamped);
    // the alive count agrees: nobody is alive in this store
    const alive = agentNow(store.list()).filter(
      (a) => a.state !== "dead" && a.state !== "unborn"
    );
    expect(alive).toHaveLength(0);
  });

  it("resume refuses the tombstoned even if a fold ever said otherwise", async () => {
    writeCorruptedAsh(store);
    const terrariumStore = new TerrariumStore(join(dir, "t.db"));
    try {
      const showrunner = new Showrunner({
        store,
        runtime: new StubRuntimePort(),
        terrarium: storeTerrariumClient(terrariumStore),
        think: async () => ({}),
        flags: { ...FLAGS },
      });
      Object.assign(showrunner.names, castNames());
      const { recovered, unspawned } = await showrunner.resume(LAUNCH_CAST);
      expect(recovered).not.toContain("ag_ash_1");
      expect(showrunner.live.has("ag_ash_1")).toBe(false);
      // the dead serial's base surfaces for succession at boot
      expect(unspawned.map((m) => m.agent_id)).toContain("ag_ash");
      // a dead NON-serial member does not: nothing brings yuki back
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
          fingerprint_short: "fp_y",
          inherited_fragments: [],
        },
      });
      store.append({
        agent_id: "ag_yuki",
        kind: "death",
        visibility: "public",
        primitive: "identity.destroy()",
        payload: { lived_seconds: 100, cause: "manual", final_words: "done", receipt: "rt_y" },
      });
      const again = new Showrunner({
        store,
        runtime: new StubRuntimePort(),
        terrarium: storeTerrariumClient(terrariumStore),
        think: async () => ({}),
        flags: { ...FLAGS },
      });
      const result = await again.resume(LAUNCH_CAST);
      expect(result.unspawned.map((m) => m.agent_id)).not.toContain("ag_yuki");
      expect(again.live.has("ag_yuki")).toBe(false);
    } finally {
      terrariumStore.close();
    }
  });

  it("nothing writes on a corpse: acts and state changes after death append nothing", async () => {
    const terrariumStore = new TerrariumStore(join(dir, "t.db"));
    try {
      const showrunner = new Showrunner({
        store,
        runtime: new StubRuntimePort(),
        terrarium: storeTerrariumClient(terrariumStore),
        think: async () => ({}),
        flags: { ...FLAGS, externalBrowsing: true, readingAllowlist: ["en.wikipedia.org"] },
      });
      Object.assign(showrunner.names, castNames());
      showrunner.registerSerialMember(ashMember());
      await showrunner.spawn(ashMember(), { inherited_fragments: [] });
      const agent = showrunner.live.get("ag_ash_1");
      if (!agent) throw new Error("no agent");
      showrunner.driver = {
        busy: () => false,
        openPage: async (_id, url) => ({ landed: url, detour: false }),
        publishPost: async () => ({ id: "p", url: "/x" }),
        replyComment: async () => undefined,
      };
      await showrunner.die("ag_ash_1", "ttl");
      const before = store.list({ agentId: "ag_ash_1" }).length;

      // the dangling async, replayed deliberately: a drift's act and a
      // state emit arriving after the death
      await (
        showrunner as unknown as { performAct: (a: unknown, act: unknown) => Promise<boolean> }
      ).performAct(agent, {
        kind: "open_page",
        url: "https://en.wikipedia.org/wiki/Manifesto",
        title: "manifesto",
      });
      (showrunner as unknown as { emitState: (id: string, s: string) => void }).emitState(
        "ag_ash_1",
        "reading"
      );
      await (
        showrunner as unknown as { driftWhileIdle: (a: unknown) => Promise<void> }
      ).driftWhileIdle(agent);
      expect(store.list({ agentId: "ag_ash_1" }).length).toBe(before);
      // and the record still folds dead
      const ash = agentNow(store.list()).find((a) => a.agent_id === "ag_ash_1");
      expect(ash?.state).toBe("dead");
    } finally {
      terrariumStore.close();
    }
  });

  it("a serial death produces its successor at once; last words are never empty", async () => {
    const terrariumStore = new TerrariumStore(join(dir, "t.db"));
    try {
      const showrunner = new Showrunner({
        store,
        runtime: new StubRuntimePort(),
        terrarium: storeTerrariumClient(terrariumStore),
        // the set-piece call comes back with nothing, as ash-1's did
        think: async () => ({}),
        flags: { ...FLAGS },
      });
      Object.assign(showrunner.names, castNames());
      showrunner.registerSerialMember(ashMember());
      await showrunner.spawn(ashMember(), { inherited_fragments: [] });
      const living = showrunner.live.get("ag_ash_1");
      living?.monologues.push("the door was already open");
      await showrunner.die("ag_ash_1", "ttl");

      // the successor lives, inheriting through the same rule as ever
      expect(showrunner.live.has("ag_ash_2")).toBe(true);
      expect(showrunner.live.has("ag_ash_1")).toBe(false);
      // the death captured the agent's own last utterance
      const death = store.list({ kinds: ["death"], agentId: "ag_ash_1" })[0];
      expect((death?.payload as PayloadFor<"death">).final_words).toBe(
        "the door was already open"
      );

      // a life that never said anything still leaves stated words, not a blank
      await showrunner.die("ag_ash_2", "manual");
      const second = store.list({ kinds: ["death"], agentId: "ag_ash_2" })[0];
      const words = (second?.payload as PayloadFor<"death">).final_words;
      expect(words.length).toBeGreaterThan(0);
    } finally {
      terrariumStore.close();
    }
  });

  it("marlowe's death spawns nobody: succession is for serials only", async () => {
    const terrariumStore = new TerrariumStore(join(dir, "t.db"));
    try {
      const showrunner = new Showrunner({
        store,
        runtime: new StubRuntimePort(),
        terrarium: storeTerrariumClient(terrariumStore),
        think: async () => ({}),
        flags: { ...FLAGS },
      });
      Object.assign(showrunner.names, castNames());
      await showrunner.spawn(marloweMember());
      const count = showrunner.live.size;
      await showrunner.die("ag_marlowe", "manual");
      expect(showrunner.live.size).toBe(count - 1);
    } finally {
      terrariumStore.close();
    }
  });
});

describe("the corrupted wall reconciles at boot", () => {
  let root: string;
  let service: WallService | null = null;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "mortality-boot-"));
  });
  afterEach(async () => {
    await service?.stop();
    service = null;
    rmSync(root, { recursive: true, force: true });
  });

  it("ash-1 stays in the graveyard, ash-2 wakes, and /health agrees with /now", async () => {
    // the store the box actually has: ash-1 dead with a post-death write
    mkdirSync(join(root, "wall"), { recursive: true });
    const store = new WallStore(join(root, "wall", "wall.db"));
    writeCorruptedAsh(store);
    store.close();

    service = await bootWallService({
      root,
      port: 0,
      cast: [ashMember()],
      flags: { ...FLAGS },
    });
    const base = `http://127.0.0.1:${service.port}`;

    const now = (await (await fetch(`${base}/now`)).json()) as {
      agents: Array<{ agent_id: string; state: string }>;
      alive: number;
    };
    const ash1 = now.agents.find((a) => a.agent_id === "ag_ash_1");
    const ash2 = now.agents.find((a) => a.agent_id === "ag_ash_2");
    // dead is dead; the successor lives
    expect(ash1?.state).toBe("dead");
    expect(ash2).toBeDefined();
    expect(ash2?.state).not.toBe("dead");
    expect(service.showrunner.live.has("ag_ash_1")).toBe(false);
    expect(service.showrunner.live.has("ag_ash_2")).toBe(true);

    // the counts agree everywhere: /now's alive, /health's agents_live,
    // and the live map are one number
    const health = (await (await fetch(`${base}/health`)).json()) as {
      agents_live: number;
    };
    expect(now.alive).toBe(1);
    expect(health.agents_live).toBe(1);
    expect(service.showrunner.live.size).toBe(1);

    // the graveyard holds ash-1 exactly once, receipt intact
    const graveyard = (await (await fetch(`${base}/graveyard`)).json()) as {
      dead: Array<{ agent_id: string; receipt: string }>;
    };
    const buried = graveyard.dead.filter((d) => d.agent_id === "ag_ash_1");
    expect(buried).toHaveLength(1);
    expect(buried[0]?.receipt?.length).toBeGreaterThan(0);
    // and the successor inherited the predecessor's spawn lineage: one
    // spawn event for ash-2, none re-faked for ash-1
    const spawns = service.wallStore.list({ kinds: ["spawn"] });
    expect(spawns.filter((s) => s.agent_id === "ag_ash_1")).toHaveLength(1);
    expect(spawns.filter((s) => s.agent_id === "ag_ash_2")).toHaveLength(1);
  }, 30_000);
});
