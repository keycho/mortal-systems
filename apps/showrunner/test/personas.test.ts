import { describe, expect, it } from "vitest";
import { LAUNCH_CAST, READING_ALLOWLIST_DEFAULT, hostAllowed, personaFor } from "../src/index.js";

/**
 * the cast has to be visibly different from across a room. what is
 * guarded here is not prose quality, which no test can judge, but the
 * mechanical facts a viewer sees: that yuki's world is japanese, that
 * every identity drifts somewhere different when idle, and that the
 * drifting cannot leave the allowlist.
 */

function member(id: string) {
  const found = LAUNCH_CAST.find((m) => m.agent_id === id);
  if (!found) throw new Error(`no cast member ${id}`);
  return found;
}

describe("yuki lives in japanese", () => {
  it("is told to think and write in japanese, with a gloss rather than a replacement", () => {
    const bible = personaFor(member("ag_yuki"));
    expect(bible).toContain("japanese");
    expect(bible).toContain("monologue_gloss");
    // the instruction that matters: the line is japanese, the english
    // rides underneath. a persona told to "translate" would produce
    // english cells with japanese subtitles, which is the wrong way up.
    expect(bible).toMatch(/never write a monologue in english/i);
  });

  it("reads japanese sources, and they are on the allowlist", () => {
    const rotation = member("ag_yuki").idle_rotation ?? [];
    const japanese = rotation.filter((url) => /ja\.wikipedia|aozora|nhk/.test(url));
    expect(japanese.length).toBeGreaterThanOrEqual(4);
    for (const url of rotation) {
      expect(hostAllowed(new URL(url).hostname, READING_ALLOWLIST_DEFAULT)).toBe(true);
    }
  });
});

describe("an idle identity drifts somewhere, and somewhere different", () => {
  it("gives every launch identity a rotation of its own", () => {
    for (const m of LAUNCH_CAST) {
      const rotation = m.idle_rotation ?? [];
      expect(rotation.length).toBeGreaterThanOrEqual(4);
      // consecutive glances at a cell must not look the same
      expect(new Set(rotation).size).toBe(rotation.length);
    }
  });

  it("gives them different rotations from each other", () => {
    // six cells all showing hacker news is one cell shown six times, so
    // no two identities may share a resting page at all
    for (const a of LAUNCH_CAST) {
      for (const b of LAUNCH_CAST) {
        if (a.agent_id >= b.agent_id) continue;
        const shared = (a.idle_rotation ?? []).filter((u) =>
          (b.idle_rotation ?? []).includes(u)
        );
        expect({ pair: `${a.name}/${b.name}`, shared }).toEqual({
          pair: `${a.name}/${b.name}`,
          shared: [],
        });
      }
    }
  });

  it("fills the wall: six identities for six cells", () => {
    // three agents in a six-cell grid reads as a wall that lost half its
    // cast, not one that has not filled it yet
    expect(LAUNCH_CAST).toHaveLength(6);
    expect(LAUNCH_CAST.map((m) => m.name).sort()).toEqual(
      ["ash", "marlowe", "odile", "rui", "vesper", "yuki"].sort()
    );
  });

  it("cannot drift off the allowlist", () => {
    for (const m of LAUNCH_CAST) {
      for (const url of m.idle_rotation ?? []) {
        expect(hostAllowed(new URL(url).hostname, READING_ALLOWLIST_DEFAULT)).toBe(true);
      }
    }
  });
});

describe("the slow blog stays slow", () => {
  it("caps marlowe's publishing without capping his writing", () => {
    expect(member("ag_marlowe").max_posts_per_day).toBe(1);
    // the ceiling is on publishing only; nothing in the cast data limits
    // drafting, which is what the wall actually shows
    expect(member("ag_marlowe")).not.toHaveProperty("max_drafts_per_day");
  });
});
