import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PROFILE_720,
  PROFILE_GRID,
  SelfHostedHlsProvider,
  StreamManager,
  ffmpegArgs,
  parseCgroupStat,
  type Encoder,
  type FrameSource,
} from "../src/index.js";

/**
 * the cell-startup path, pinned after it was measured. the first frame a
 * viewer can see waits on: the encoder's first completed segment (gop
 * and hls_time are its floor), the playlist surviving profile changes
 * (a teardown used to rm -rf mid-cut), and the pressure ladder not
 * misreading page cache as working memory (measured: 2.5gb raw vs
 * 1.3gb working set took a healthy grid dark).
 */

describe("encoder startup latency args", () => {
  it("keeps the first frame close: 1s gop, 2s segments, 1s first segment", () => {
    const args = ffmpegArgs({ kind: "hls_dir", dir: "/tmp/x" }, 3).join(" ");
    // the hls muxer can only cut at keyframes, so the gop floors both
    // the first segment and every join
    expect(args).toContain("-g 3");
    expect(args).toContain("-hls_time 2");
    expect(args).toContain("-hls_init_time 1");
    expect(args).toContain("-hls_list_size 10");
  });

  it("numbers segments from the epoch and never declares a live stream over", () => {
    const args = ffmpegArgs({ kind: "hls_dir", dir: "/tmp/x" }, 6).join(" ");
    // monotonic numbering across encoder restarts into the same dir is
    // what lets a player ride through a profile change
    expect(args).toContain("-hls_start_number_source epoch");
    expect(args).toContain("omit_endlist");
    expect(args).toContain("delete_segments");
    expect(args).toContain("independent_segments");
  });

  it("the gop scales with fps so it is one second at any profile", () => {
    expect(ffmpegArgs({ kind: "hls_dir", dir: "/x" }, 6)).toContain("6");
    const grid = ffmpegArgs({ kind: "hls_dir", dir: "/x" }, PROFILE_GRID.fps);
    const gIndex = grid.indexOf("-g");
    expect(grid[gIndex + 1]).toBe(String(PROFILE_GRID.fps));
  });
});

describe("the pressure ladder reads the working set, not the page cache", () => {
  it("parses exact keys only: inactive_file is not total_inactive_file", () => {
    const v2 = "anon 100\ninactive_file 200\nactive_file 50";
    expect(parseCgroupStat(v2, "inactive_file")).toBe(200);
    const v1 = "total_rss 100\ntotal_inactive_file 300\ntotal_active_file 50";
    expect(parseCgroupStat(v1, "total_inactive_file")).toBe(300);
    expect(parseCgroupStat(v1, "inactive_file")).toBeNull();
    expect(parseCgroupStat("", "inactive_file")).toBeNull();
    expect(parseCgroupStat("inactive_file notanumber", "inactive_file")).toBeNull();
  });
});

describe("profile changes keep the channel serving", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hls-restart-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const noopEncoder = (): Encoder => ({
    writeFrame: () => undefined,
    stop: async () => undefined,
  });
  const noopSource: FrameSource = { start: async () => undefined, stop: async () => undefined };

  it("a quality switch restarts the encoder into the same dir; only a real stop tears down", async () => {
    const manager = new StreamManager(
      new SelfHostedHlsProvider({ rootDir: root }),
      {} as NodeJS.ProcessEnv,
      { encoderFactory: noopEncoder }
    );
    await manager.startAgent("ag_x", noopSource, PROFILE_GRID, { kind: "frames" });
    const dir = join(root, "ag_x");
    // the running encoder's evidence: a playlist and a fresh segment
    writeFileSync(join(dir, "index.m3u8"), "#EXTM3U\nindex100.ts\n");
    writeFileSync(join(dir, "index100.ts"), "segment");

    await manager.setProfile("ag_x", noopSource, PROFILE_720, { kind: "frames" });
    // the old playlist bridges the restart: a viewer's next refresh finds
    // a playlist, never a deleted dir
    expect(existsSync(join(dir, "index.m3u8"))).toBe(true);
    expect(existsSync(join(dir, "index100.ts"))).toBe(true);
    expect(manager.profileOf("ag_x")?.name).toBe(PROFILE_720.name);
    expect(manager.playbackUrl("ag_x")).toBe("/hls/ag_x/index.m3u8");

    await manager.stopAgent("ag_x");
    expect(existsSync(dir)).toBe(false);
  });

  it("sweeps segments old enough to be outside any viewer's window, keeps fresh ones", async () => {
    const manager = new StreamManager(
      new SelfHostedHlsProvider({ rootDir: root }),
      {} as NodeJS.ProcessEnv,
      { encoderFactory: noopEncoder }
    );
    await manager.startAgent("ag_x", noopSource, PROFILE_GRID, { kind: "frames" });
    const dir = join(root, "ag_x");
    writeFileSync(join(dir, "index.m3u8"), "#EXTM3U\n");
    writeFileSync(join(dir, "index1.ts"), "old");
    writeFileSync(join(dir, "index200.ts"), "fresh");
    const old = (Date.now() - 10 * 60_000) / 1000;
    utimesSync(join(dir, "index1.ts"), old, old);

    await manager.setProfile("ag_x", noopSource, PROFILE_720, { kind: "frames" });
    expect(existsSync(join(dir, "index1.ts"))).toBe(false);
    expect(existsSync(join(dir, "index200.ts"))).toBe(true);
    expect(existsSync(join(dir, "index.m3u8"))).toBe(true);
    await manager.stopAgent("ag_x");
  });
});
