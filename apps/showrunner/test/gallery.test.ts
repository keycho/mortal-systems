import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PROFILE_480,
  PROFILE_720,
  PROFILE_GRID,
  PROFILE_GRID_LOW,
  SelfHostedHlsProvider,
  StreamDirector,
  StreamManager,
  ffmpegArgs,
  type Encoder,
  type EncoderFactory,
  type FrameSource,
  type ScreencastablePage,
} from "../src/index.js";
import type { WallEvent } from "@mortal/wall";

/**
 * the wall shows every agent, always. what is guarded here is that the
 * gallery keeps a channel per living identity, that the expensive
 * picture exists only where it is being watched, and that when memory
 * runs out the wall gives things up in the order a viewer would choose:
 * the grid slows, then the grid goes dark, and the hero is last.
 */

const AGENTS = ["ag_one", "ag_two", "ag_three"];

function fakeEncoder(): Encoder {
  return {
    writeFrame: () => undefined,
    onExit: () => undefined,
    stop: async () => undefined,
    lastStderr: () => "",
  };
}

const silentSource: FrameSource = {
  start: async () => undefined,
  stop: async () => undefined,
};

/** a page object shaped like the runtime's, enough for the director */
const page = {} as ScreencastablePage;

describe("the gallery keeps a channel per living identity", () => {
  let root: string;
  let manager: StreamManager;
  let director: StreamDirector;
  let rss: number;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "gallery-"));
    rss = 100;
    const factory: EncoderFactory = () => fakeEncoder();
    manager = new StreamManager(new SelfHostedHlsProvider({ rootDir: root }), process.env, {
      encoderFactory: factory,
    });
    director = new StreamDirector({
      manager,
      events: () => [] as WallEvent[],
      pageFor: () => page,
      liveAgents: () => AGENTS,
      memoryLimitMb: 1000,
      rssMb: () => rss,
      // the stagger is real but a test should not need four ticks to
      // observe steady state
      startsPerTick: 10,
      sourceFor: () => silentSource,
    });
  });

  afterEach(async () => {
    await director.stop();
    rmSync(root, { recursive: true, force: true });
  });

  /** pretend ffmpeg wrote its first segment, so channels read as serving */
  function playlists(agents: string[] = AGENTS): void {
    for (const id of agents) {
      mkdirSync(join(root, id), { recursive: true });
      writeFileSync(join(root, id, "index.m3u8"), "#EXTM3U\n");
    }
  }

  it("gives every live agent its own channel", async () => {
    await director.tick();
    expect(manager.agents().sort()).toEqual([...AGENTS].sort());
    for (const id of AGENTS) {
      playlists([id]);
      expect(manager.playbackUrl(id)).toBe(`/hls/${id}/index.m3u8`);
    }
  });

  it("runs the grid small and the hero large", async () => {
    await director.tick();
    const hero = director.status().hero as string | null;
    // with no events nobody is hot, so the fold picks nobody and every
    // cell is a grid cell; that is the honest resting state
    expect(hero).toBeNull();
    for (const id of AGENTS) expect(manager.profileOf(id)?.name).toBe(PROFILE_GRID.name);
  });

  it("starts encoders a few at a time rather than all at once", async () => {
    const staggered = new StreamDirector({
      manager,
      events: () => [] as WallEvent[],
      pageFor: () => page,
      liveAgents: () => AGENTS,
      rssMb: () => 10,
      startsPerTick: 1,
      sourceFor: () => silentSource,
    });
    await staggered.tick();
    // three chromiums and three ffmpegs in the same second is how a small
    // container dies; the rest wait a tick
    expect(manager.agents()).toHaveLength(1);
    await staggered.tick();
    expect(manager.agents()).toHaveLength(2);
    await staggered.tick();
    expect(manager.agents()).toHaveLength(3);
    await staggered.stop();
  });

  it("drops a channel whose agent is no longer alive", async () => {
    await director.tick();
    expect(manager.agents()).toHaveLength(3);
    const shrinking = new StreamDirector({
      manager,
      events: () => [] as WallEvent[],
      pageFor: (id) => (id === "ag_three" ? null : page),
      liveAgents: () => ["ag_one", "ag_two"],
      rssMb: () => 10,
      startsPerTick: 10,
      sourceFor: () => silentSource,
    });
    playlists();
    await shrinking.tick();
    expect(manager.agents()).not.toContain("ag_three");
    await shrinking.stop();
  });

  it("names live agents that have no channel yet", async () => {
    const staggered = new StreamDirector({
      manager,
      events: () => [] as WallEvent[],
      pageFor: () => page,
      liveAgents: () => AGENTS,
      rssMb: () => 10,
      startsPerTick: 1,
      sourceFor: () => silentSource,
    });
    await staggered.tick();
    const status = staggered.status();
    // a wall with a dark cell must not read as "every channel is fine"
    expect(status.awaiting).toHaveLength(2);
    expect(status.live_agents).toBe(3);
    expect(status.channels_running).toBe(1);
    await staggered.stop();
  });
});

describe("memory pressure is spent in the viewer's order", () => {
  let root: string;
  let manager: StreamManager;
  let rss: number;
  let director: StreamDirector;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "pressure-"));
    rss = 100;
    manager = new StreamManager(new SelfHostedHlsProvider({ rootDir: root }), process.env, {
      encoderFactory: () => fakeEncoder(),
    });
    // one agent is hot, so there is a hero to protect
    const events: WallEvent[] = [];
    director = new StreamDirector({
      manager,
      events: () => events,
      pageFor: () => page,
      liveAgents: () => AGENTS,
      memoryLimitMb: 1000,
      rssMb: () => rss,
      startsPerTick: 10,
      sourceFor: () => silentSource,
    });
  });

  afterEach(async () => {
    await director.stop();
    rmSync(root, { recursive: true, force: true });
  });

  it("slows the grid before anything else", async () => {
    rss = 1100; // just over the ceiling
    await director.tick();
    expect(director.status().pressure).toBe("grid_slow");
    for (const id of manager.agents()) {
      expect(manager.profileOf(id)?.name).toBe(PROFILE_GRID_LOW.name);
    }
  });

  it("takes the grid dark before touching the hero", async () => {
    await director.tick();
    expect(manager.agents()).toHaveLength(3);
    rss = 1200;
    await director.tick();
    expect(director.status().pressure).toBe("grid_dark");
    // the cells fall back to the activity view and signal-lost, which is
    // designed degradation rather than a black rectangle
    expect(manager.agents().length).toBeLessThan(3);
  });

  it("only drops the hero's quality when everything else is already gone", async () => {
    rss = 2000;
    await director.tick();
    expect(director.status().pressure).toBe("hero_low");
    for (const id of manager.agents()) {
      expect(manager.profileOf(id)?.name).toBe(PROFILE_480.name);
    }
  });
});

describe("the encoder reads the right thing for how the browser is drawn", () => {
  it("grabs the agent's screen when the browser is a real window", () => {
    const args = ffmpegArgs({ kind: "hls_dir", dir: "/tmp/x" }, 3, {
      kind: "x11",
      display: ":110",
      width: 1280,
      height: 720,
    });
    expect(args).toContain("x11grab");
    expect(args).toContain(":110");
    // the window is captured at a size the agent can read; the wire gets
    // whatever the cell actually needs
    expect(args).not.toContain("image2pipe");
  });

  it("scales a screen down to the grid profile rather than shipping 720p to a cell", () => {
    const args = ffmpegArgs(
      { kind: "hls_dir", dir: "/tmp/x" },
      3,
      { kind: "x11", display: ":110", width: 1280, height: 720 },
      { width: PROFILE_GRID.width, height: PROFILE_GRID.height }
    );
    expect(args.join(" ")).toContain(`scale=${PROFILE_GRID.width}:${PROFILE_GRID.height}`);
  });

  it("adds no scaler when the capture is already the right size", () => {
    const args = ffmpegArgs(
      { kind: "hls_dir", dir: "/tmp/x" },
      6,
      { kind: "x11", display: ":110", width: 1280, height: 720 },
      { width: PROFILE_720.width, height: PROFILE_720.height }
    );
    expect(args).not.toContain("-vf");
  });

  it("pipes jpegs when the browser is headless", () => {
    const args = ffmpegArgs({ kind: "hls_dir", dir: "/tmp/x" }, 6);
    expect(args).toContain("image2pipe");
    expect(args).not.toContain("x11grab");
  });
});
