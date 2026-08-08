import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WallStore } from "@mortal/wall";
import {
  LiveRuntimePort,
  PROFILE_480,
  PlaywrightScreencast,
  StreamDirector,
  StreamManager,
  SelfHostedHlsProvider,
  type Encoder,
  type FrameSource,
  type ScreencastablePage,
} from "../src/index.js";

/** chromium for the live tests: CHROME_PATH, a playwright browsers dir,
 * or nothing (the suite skips) */
function resolveChromium(): string | null {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const browsersRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (browsersRoot && existsSync(browsersRoot)) {
    for (const entry of readdirSync(browsersRoot)) {
      if (/^chromium-\d+$/.test(entry)) {
        const candidate = join(browsersRoot, entry, "chrome-linux", "chrome");
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}
const chromiumPath = resolveChromium();
const hasChromium = chromiumPath !== null;

describe("stream director (pure logic, no browsers)", () => {
  const mkStore = () => {
    const dir = mkdtempSync(join(tmpdir(), "director-"));
    return { store: new WallStore(join(dir, "w.db")), dir };
  };
  const spawnEvent = (store: WallStore, agentId: string, ttl: number) =>
    store.append({
      agent_id: agentId,
      kind: "spawn",
      visibility: "public",
      primitive: "identity.create()",
      payload: {
        class: "persona",
        region: null,
        locale: null,
        ttl_seconds: ttl,
        fingerprint_short: "fp",
        inherited_fragments: [],
      },
    });

  const fakePage: ScreencastablePage = {
    context: () => ({
      newCDPSession: async () => ({
        send: async () => undefined,
        on: () => undefined,
        detach: async () => undefined,
      }),
    }),
  };

  const mkManagerParts = () => {
    const started: string[] = [];
    const stopped: string[] = [];
    const encoder: Encoder = { writeFrame: () => undefined, stop: async () => undefined };
    const manager = new StreamManager(
      {
        name: "fake",
        createChannel: async (agentId) => {
          started.push(agentId);
          return {
            agent_id: agentId,
            ingest: { kind: "rtmp" as const, url: "rtmp://x" },
            playback_url: `/hls/${agentId}/index.m3u8`,
          };
        },
        destroyChannel: async (agentId) => void stopped.push(agentId),
      },
      {} as NodeJS.ProcessEnv,
      { encoderFactory: () => encoder }
    );
    return { manager, started, stopped };
  };
  const noopSource: FrameSource = { start: async () => undefined, stop: async () => undefined };

  it("captures the hot agent, cuts when the heat moves, and drops profile under memory pressure", async () => {
    const { store, dir } = mkStore();
    try {
      spawnEvent(store, "ag_marlowe", 86_400 * 30);
      spawnEvent(store, "ag_ash_1", 86_400 * 30);
      const { manager, started, stopped } = mkManagerParts();
      let rss = 500;
      const director = new StreamDirector({
        manager,
        events: () => store.list({ publicOnly: true }),
        pageFor: () => fakePage,
        memoryLimitMb: 1800,
        rssMb: () => rss,
        sourceFor: () => noopSource,
      });

      await director.tick();
      expect(started).toHaveLength(1);
      const first = started[0] as string;
      expect(manager.playbackUrl(first)).toContain("/hls/");

      // the other agent enters its final hour: death imminent outranks all
      const other = first === "ag_marlowe" ? "ag_ash_1" : "ag_marlowe";
      store.append({
        agent_id: other,
        kind: "ttl_warning",
        visibility: "public",
        payload: { window: "final_hour", remaining_seconds: 3599 },
      });
      store.append({
        agent_id: other,
        kind: "human_contact",
        visibility: "public",
        payload: { platform: "terrarium", excerpt: "hey", url: "/t/x" },
      });
      await director.tick();
      expect(stopped).toContain(first);
      expect(started).toContain(other);
      expect(manager.playbackUrl(first)).toBeNull();
      expect(manager.playbackUrl(other)).toContain("/hls/");

      // memory pressure: same target, lower profile, restart
      rss = 2400;
      await director.tick();
      expect(director.status().profile).toBe(PROFILE_480.name);
      await director.stop();
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("an agent whose browser died is never picked; no capturable agent means poster everywhere", async () => {
    const { store, dir } = mkStore();
    try {
      spawnEvent(store, "ag_marlowe", 86_400);
      const { manager, started } = mkManagerParts();
      const director = new StreamDirector({
        manager,
        events: () => store.list({ publicOnly: true }),
        pageFor: () => null, // every browser is gone
        rssMb: () => 500,
        sourceFor: () => noopSource,
      });
      await director.tick();
      expect(started).toHaveLength(0);
      expect(director.status().capturing).toBeNull();
      expect(director.status().last_cut).toContain("no capturable agent");
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!hasChromium)("live runtime (real chromium)", () => {
  it("spawns a real browser, screencasts real frames, dies with a real receipt", async () => {
    const port = new LiveRuntimePort({
      executablePath: chromiumPath as string,
    });
    try {
      const spawned = await port.spawn({
        agent_id: "ag_test",
        class: "persona",
        region: null,
        locale: "en-GB",
        ttl_seconds: 60,
      });
      expect(spawned.identity_id).toContain("ag_test");
      expect(port.health().browsers_live).toBe(1);

      const page = port.pageFor("ag_test");
      expect(page).not.toBeNull();
      await page?.setContent(
        "<html><body style='background:#070708;color:#e8e8e8'><h1>the wall</h1></body></html>"
      );

      // real frames out of a real page
      const frames: Buffer[] = [];
      const screencast = new PlaywrightScreencast(page as never);
      await screencast.start((jpeg) => void frames.push(jpeg));
      // keep the page visibly changing until a frame lands: a single
      // mutation can coalesce into zero compositor frames
      const deadline = Date.now() + 10_000;
      let ticks = 0;
      while (frames.length === 0 && Date.now() < deadline) {
        await page?.evaluate((n) => {
          document.body.style.background = n % 2 ? "#0d0d0f" : "#171719";
          const h1 = document.querySelector("h1");
          if (h1) h1.textContent = `the wall ${n}`;
        }, ticks++);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      await screencast.stop();
      expect(frames.length).toBeGreaterThan(0);
      // jpeg magic bytes: these are actual encoded frames
      expect(frames[0]?.[0]).toBe(0xff);
      expect(frames[0]?.[1]).toBe(0xd8);

      const destroyed = await port.destroy(spawned.identity_id, "ttl");
      expect(destroyed.receipt).toMatch(/^[0-9a-f]{64}$/);
      expect(port.health().browsers_live).toBe(0);
      expect(port.pageFor("ag_test")).toBeNull();
    } finally {
      await port.close();
    }
  }, 60_000);
});

describe.skipIf(!hasChromium)("driver click-through navigation (real chromium)", () => {
  it("reaches posts by clicking listed links, replies in the real form, and lands home when the post is gone", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clicknav-"));
    const { TerrariumStore, createTerrariumServer } = await import("terrarium");
    const { BrowserDriver } = await import("../src/driver.js");
    const { TargetGoneError } = await import("../src/showrunner.js");
    const store = new TerrariumStore(join(dir, "t.db"));
    store.createTenant({ name: "marlowe", agent_id: "ag_marlowe", title: "the slow blog" });
    const post = store.createPost({ tenant: "marlowe", title: "on graves", body_md: "notes." });
    const server = createTerrariumServer({ store, adminToken: "tok" });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    const port = new LiveRuntimePort({ executablePath: chromiumPath as string });
    // the read-only network guard permits non-GET only to the home origin;
    // the service always sets this, so the test does too
    port.setHome(`${baseUrl}/`);
    try {
      await port.spawn({
        agent_id: "ag_marlowe",
        class: "persona",
        region: null,
        locale: null,
        ttl_seconds: 60,
      });
      const driver = new BrowserDriver({
        runtime: port,
        baseUrl,
        terrariumToken: "tok",
        paceScale: 0,
      });

      // the reply is reached by clicking the listing, typed into the real
      // form, and lands approved with the agent id
      await driver.replyComment("ag_marlowe", "marlowe", post.id, "marlowe", "thank you.");
      const comments = store.listComments(post.id);
      expect(comments).toHaveLength(1);
      expect(comments[0]?.status).toBe("approved");
      expect(comments[0]?.agent_id).toBe("ag_marlowe");

      // a vanished post leaves the reader on the front page, reported
      await expect(
        driver.replyComment("ag_marlowe", "marlowe", "pst_gone", "marlowe", "x")
      ).rejects.toThrow(TargetGoneError);
      const page = port.pageFor("ag_marlowe");
      expect(new URL(page?.url() ?? "").pathname).toBe("/t/marlowe/");

      // open_page detours the same way and says where it landed
      const landing = await driver.openPage("ag_marlowe", "/t/marlowe/posts/pst_gone", 0);
      expect(landing.detour).toBe(true);
      expect(landing.landed).toBe("/t/marlowe/");
    } finally {
      await port.close();
      await new Promise((resolve) => server.close(resolve));
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("hls provider path safety", () => {
  it("agent ids are sanitized into segment dirs", async () => {
    const root = mkdtempSync(join(tmpdir(), "hls-safe-"));
    try {
      const provider = new SelfHostedHlsProvider({ rootDir: root });
      const channel = await provider.createChannel("../../etc/passwd");
      expect(channel.playback_url).toBe("/hls/etcpasswd/index.m3u8");
      expect(existsSync(join(root, "etcpasswd"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
