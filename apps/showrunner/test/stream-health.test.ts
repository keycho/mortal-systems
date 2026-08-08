import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PROFILE_720,
  PlaywrightScreencast,
  SelfHostedHlsProvider,
  StreamManager,
  type Encoder,
  type EncoderFactory,
  type FrameSource,
} from "../src/index.js";

/**
 * the wall reported "capturing ag_marlowe, 720p6" while /hls answered
 * "no such stream" for the whole boot. two things made that possible and
 * both are covered here: a capture that produces no frames at all (a
 * screencast alone is silent on a page nobody is touching), and a health
 * report that described what the service had intended rather than what
 * was on disk.
 */

/** an encoder that swallows frames and counts them */
function fakeEncoder(): Encoder & { written: () => number } {
  let written = 0;
  return {
    writeFrame: () => {
      written += 1;
    },
    onExit: () => undefined,
    stop: async () => undefined,
    lastStderr: () => "",
    written: () => written,
  };
}

const silentSource: FrameSource = {
  start: async () => undefined,
  stop: async () => undefined,
};

describe("health is read from the segments, not from the intent", () => {
  let root: string;
  let manager: StreamManager;
  let encoder: ReturnType<typeof fakeEncoder>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hls-"));
    encoder = fakeEncoder();
    const factory: EncoderFactory = () => encoder;
    manager = new StreamManager(new SelfHostedHlsProvider({ rootDir: root }), process.env, {
      encoderFactory: factory,
    });
  });
  afterEach(async () => {
    await manager.stopAll();
    rmSync(root, { recursive: true, force: true });
  });

  function writePlaylist(agentId: string, ageSeconds = 0): void {
    const dir = join(root, agentId);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "index.m3u8");
    writeFileSync(file, "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:3\n");
    if (ageSeconds > 0) {
      const when = new Date(Date.now() - ageSeconds * 1000);
      utimesSync(file, when, when);
    }
  }

  it("is not ok while the encoder has produced no playlist, and says it is still starting", async () => {
    await manager.startAgent("ag_test", silentSource, PROFILE_720);
    const health = manager.health();
    // the first segment cannot exist before hls_time seconds of frames,
    // so this window is honest rather than a failure
    expect(health.ok).toBe(false);
    expect(health.capturing).toBe("ag_test");
    expect(health.reason).toContain("startup window");
  });

  it("names a silent capture once the startup window has passed", async () => {
    await manager.startAgent("ag_test", silentSource, PROFILE_720);
    // grace collapsed to zero: the encoder has had its chance
    const health = manager.health(0);
    expect(health.ok).toBe(false);
    expect(health.reason).toContain("written no playlist");
  });

  it("is ok once a playlist exists and is fresh", async () => {
    await manager.startAgent("ag_test", silentSource, PROFILE_720);
    writePlaylist("ag_test");
    const health = manager.health();
    expect(health.ok).toBe(true);
    expect(health.capturing).toBe("ag_test");
    expect(health.playlist_age_seconds).toBeLessThanOrEqual(1);
  });

  it("is not ok when the playlist has stopped advancing", async () => {
    await manager.startAgent("ag_test", silentSource, PROFILE_720);
    writePlaylist("ag_test", 120);
    const health = manager.health(12, 30);
    expect(health.ok).toBe(false);
    expect(health.reason).toContain("not advanced");
  });

  // the cell asks for a url; handing it one that 404s buys a spinner
  // where the activity view would have told the truth
  it("offers no playback url until there is something to play", async () => {
    await manager.startAgent("ag_test", silentSource, PROFILE_720);
    expect(manager.playbackUrl("ag_test")).toBeNull();
    writePlaylist("ag_test");
    expect(manager.playbackUrl("ag_test")).toBe("/hls/ag_test/index.m3u8");
  });
});

describe("a capture keeps producing frames when nothing on the page moves", () => {
  /** a cdp session that never emits a screencast frame, like chromium on
   * a page nobody is touching, but answers a screenshot request */
  function stillPage(): {
    page: ConstructorParameters<typeof PlaywrightScreencast>[0];
    shots: () => number;
  } {
    let shots = 0;
    const session = {
      send: async (method: string) => {
        if (method === "Page.captureScreenshot") {
          shots += 1;
          return { data: Buffer.from(`frame-${shots}`).toString("base64") };
        }
        return {};
      },
      on: () => undefined,
      detach: async () => undefined,
    };
    return {
      page: { context: () => ({ newCDPSession: async () => session }) },
      shots: () => shots,
    };
  }

  it("delivers a real first frame immediately instead of waiting for motion", async () => {
    const { page, shots } = stillPage();
    const capture = new PlaywrightScreencast(page, PROFILE_720);
    const frames: Buffer[] = [];
    await capture.start((jpeg) => frames.push(jpeg));
    await capture.stop();
    // this is the whole bug: a screencast on a static page emits nothing,
    // the encoder waits on stdin forever, and no playlist is ever written
    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(shots()).toBeGreaterThanOrEqual(1);
    expect(frames[0]?.toString()).toBe("frame-1");
    expect(capture.frameCount).toBe(frames.length);
  });
});
