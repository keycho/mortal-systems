import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MONOLOGUE_MAX_CHARS,
  WallStore,
  agentNow,
  depthScore,
  directorPick,
  humanizeEvent,
  recap,
  recapFallback,
  shortReceipt,
  spotlightAt,
  tickerLines,
  ulid,
  verifyReceipt,
  type WallEvent,
} from "../src/index.js";

let dir: string;
let store: WallStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wall-"));
  store = new WallStore(join(dir, "wall.db"));
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const spawnMarlowe = (ttl = 9 * 30 * 86_400) =>
  store.append({
    agent_id: "ag_marlowe",
    kind: "spawn",
    visibility: "public",
    primitive: "identity.create()",
    payload: {
      class: "persona",
      region: "uk-london",
      locale: "en-GB",
      ttl_seconds: ttl,
      fingerprint_short: "fp_2b1a",
      inherited_fragments: [],
    },
  });

describe("ulid", () => {
  it("sorts in append order even within one millisecond", () => {
    const ids = Array.from({ length: 200 }, () => ulid(1700000000000));
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(200);
    expect(ids[0]).toHaveLength(26);
  });
});

describe("WallStore", () => {
  it("appends, stamps id and ts, and validates payload against the kind", () => {
    const event = spawnMarlowe();
    expect(event.id).toHaveLength(26);
    expect(Date.parse(event.ts)).toBeGreaterThan(0);
    expect(() =>
      store.append({
        agent_id: "ag_marlowe",
        kind: "monologue",
        visibility: "public",
        // over the 140-char caption budget
        payload: { text: "x".repeat(MONOLOGUE_MAX_CHARS + 1) },
      })
    ).toThrow();
    expect(() =>
      store.append({
        agent_id: "ag_marlowe",
        kind: "death",
        visibility: "public",
        // wrong shape for the kind
        payload: { verb: "published_post" } as never,
      })
    ).toThrow();
  });

  it("is append-only at the sqlite layer: update and delete raise", () => {
    const event = spawnMarlowe();
    expect(() =>
      store.db.prepare("UPDATE wall_events SET agent_id = 'ag_x' WHERE id = ?").run(event.id)
    ).toThrow(/append-only/);
    expect(() => store.db.prepare("DELETE FROM wall_events WHERE id = ?").run(event.id)).toThrow(
      /append-only/
    );
  });

  it("stamps verifiable receipts on spawn, death and enforcement", () => {
    const spawn = spawnMarlowe();
    expect(spawn.receipt).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyReceipt(spawn)).toBe(true);
    expect(verifyReceipt({ ...spawn, agent_id: "ag_forged" })).toBe(false);
    expect(shortReceipt(spawn.receipt as string)).toMatch(/^[0-9a-f]{4}…[0-9a-f]{2}$/);

    const death = store.append({
      agent_id: "ag_marlowe",
      kind: "death",
      visibility: "public",
      primitive: "identity.destroy()",
      payload: { lived_seconds: 100, cause: "ttl", final_words: "so it goes", receipt: "rt_abc" },
    });
    expect(verifyReceipt(death)).toBe(true);

    const mono = store.append({
      agent_id: "ag_marlowe",
      kind: "monologue",
      visibility: "public",
      payload: { text: "quiet" },
    });
    expect(mono.receipt).toBeUndefined();
  });

  it("filters by cursor, agent, kind and visibility", () => {
    const first = spawnMarlowe();
    store.append({
      agent_id: "ag_marlowe",
      kind: "monologue",
      visibility: "internal",
      payload: { text: "scheduler-only" },
    });
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
        fingerprint_short: "fp_9f10",
        inherited_fragments: [],
      },
    });
    expect(store.list({ publicOnly: true })).toHaveLength(2);
    expect(store.list({ agentId: "ag_yuki" })).toHaveLength(1);
    expect(store.list({ afterId: first.id })).toHaveLength(2);
    expect(store.list({ kinds: ["spawn"] })).toHaveLength(2);
    expect(store.list({ newestFirst: true, limit: 1 })[0]?.agent_id).toBe("ag_yuki");
  });

  it("fans out to subscribers on append", () => {
    const seen: WallEvent[] = [];
    const unsubscribe = store.subscribe((e) => seen.push(e));
    spawnMarlowe();
    unsubscribe();
    spawnMarlowe();
    expect(seen).toHaveLength(1);
  });
});

describe("read models", () => {
  it("agent_now folds spawn, state, monologue, extension and death", () => {
    spawnMarlowe(7200);
    store.append({
      agent_id: "ag_marlowe",
      kind: "state_change",
      visibility: "public",
      payload: { state: "writing", detail: "eulogy draft" },
    });
    store.append({
      agent_id: "ag_marlowe",
      kind: "ttl_extended",
      visibility: "public",
      payload: { added_seconds: 3600, source: "system" },
    });
    store.append({
      agent_id: "ag_marlowe",
      kind: "monologue",
      visibility: "public",
      payload: { text: "the archive is patient" },
    });
    const now = new Date(Date.now() + 1000);
    const [marlowe] = agentNow(store.list(), { now });
    expect(marlowe?.name).toBe("marlowe");
    expect(marlowe?.state).toBe("writing");
    expect(marlowe?.last_monologue).toBe("the archive is patient");
    // 2h ttl + 1h extension, about 1s elapsed
    expect(marlowe?.ttl_remaining_seconds).toBeGreaterThan(3 * 3600 - 10);
    expect(marlowe?.final_hour).toBe(false);

    store.append({
      agent_id: "ag_marlowe",
      kind: "death",
      visibility: "public",
      primitive: "identity.destroy()",
      payload: { lived_seconds: 7200, cause: "ttl", final_words: "done", receipt: "rt_1" },
    });
    const [dead] = agentNow(store.list());
    expect(dead?.state).toBe("dead");
    expect(dead?.death?.final_words).toBe("done");
    expect(dead?.ttl_remaining_seconds).toBeNull();
  });

  it("the wire humanizes public events newest first and skips internal ones", () => {
    spawnMarlowe();
    store.append({
      agent_id: "ag_marlowe",
      kind: "monologue",
      visibility: "internal",
      payload: { text: "hidden" },
    });
    store.append({
      agent_id: "ag_marlowe",
      kind: "action",
      visibility: "public",
      payload: { verb: "published_post", title: "on graves" },
    });
    const lines = tickerLines(store.list(), { limit: 10 });
    expect(lines).toHaveLength(2);
    expect(lines[0]?.line).toBe('marlowe published "on graves"');
    expect(lines.some((l) => l.line.includes("hidden"))).toBe(false);
  });

  it("depth is a coarse fold over real accumulated state", () => {
    expect(depthScore({ cookie_count: 0, account_count: 0, memory_bytes: 0, post_count: 0 })).toBe(0);
    expect(
      depthScore({ cookie_count: 150, account_count: 4, memory_bytes: 2_000_000, post_count: 25 })
    ).toBe(8);
    expect(
      depthScore({ cookie_count: 12, account_count: 1, memory_bytes: 100_000, post_count: 5 })
    ).toBe(4);
  });

  it("recap falls back deterministically and never blanks", async () => {
    spawnMarlowe();
    store.append({
      agent_id: "ag_marlowe",
      kind: "death",
      visibility: "public",
      primitive: "identity.destroy()",
      payload: { lived_seconds: 60, cause: "ttl", final_words: "brief", receipt: "rt_2" },
    });
    const text = recapFallback(store.list());
    expect(text).toContain("marlowe is gone");
    const viaFailingSummarizer = await recap(store.list(), {
      summarizer: async () => {
        throw new Error("model down");
      },
    });
    expect(viaFailingSummarizer).toBe(text);
    expect(recapFallback([])).toBe("nothing happened while you were away");
  });
});

describe("director", () => {
  const mkAgent = (id: string, state: string, ttl: number | null) =>
    ({
      agent_id: id,
      name: id.replace(/^ag_/, ""),
      class: "persona",
      region: null,
      locale: null,
      state,
      spawned_at: null,
      dies_at: null,
      ttl_remaining_seconds: ttl,
      ttl_label: null,
      final_hour: ttl !== null && ttl < 3600,
      last_monologue: null,
      current_url_title: null,
      last_event_id: null,
      inherited_fragments: [],
    }) as never;

  it("cuts by priority: death imminent beats human contact beats writing", () => {
    const now = new Date();
    const contactEvent: WallEvent = {
      id: ulid(),
      ts: now.toISOString(),
      agent_id: "ag_yuki",
      kind: "human_contact",
      payload: { platform: "terrarium", excerpt: "hello", url: "https://x" },
      visibility: "public",
    };
    const agents = [
      mkAgent("ag_marlowe", "writing", 86_400),
      mkAgent("ag_yuki", "reading", 86_400),
      mkAgent("ag_ash_1", "idle", 600),
    ];
    expect(directorPick(agents, [contactEvent], { now })?.agent_id).toBe("ag_ash_1");
    const noImminent = agents.slice(0, 2);
    expect(directorPick(noImminent, [contactEvent], { now })?.agent_id).toBe("ag_yuki");
    expect(directorPick(noImminent, [], { now })?.agent_id).toBe("ag_marlowe");
    // manual pin wins outright
    expect(
      directorPick(agents, [contactEvent], { now, pinnedId: "ag_marlowe" })?.agent_id
    ).toBe("ag_marlowe");
  });

  it("spotlight shows one caption at a time and rotates deterministically", () => {
    spawnMarlowe();
    store.append({
      agent_id: "ag_marlowe",
      kind: "monologue",
      visibility: "public",
      payload: { text: "first voice" },
    });
    store.append({
      agent_id: "ag_yuki",
      kind: "monologue",
      visibility: "public",
      payload: { text: "second voice" },
    });
    const events = store.list();
    const a = spotlightAt(events, new Date(0));
    const b = spotlightAt(events, new Date(25_000));
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a?.agent_id).not.toBe(b?.agent_id);
    expect(spotlightAt(events, new Date(50_000))?.agent_id).toBe(a?.agent_id);
    expect(spotlightAt([], new Date())).toBeNull();
  });

  it("humanized copy carries no banned brand vocabulary", () => {
    const ash = store.append({
      agent_id: "ag_ash_1",
      kind: "spawn",
      visibility: "public",
      primitive: "identity.create()",
      payload: {
        class: "burner",
        region: null,
        locale: null,
        ttl_seconds: 6 * 3600,
        fingerprint_short: "fp_00aa",
        inherited_fragments: ["the manifesto was never finished"],
      },
    });
    const line = humanizeEvent(ash);
    expect(line).toBe("ash-1 is alive: ash, nowhere, 6h to live, carrying 1 fragment");
    expect(line).not.toMatch(/burner/i);
    expect(line).not.toMatch(/—/);
  });
});
