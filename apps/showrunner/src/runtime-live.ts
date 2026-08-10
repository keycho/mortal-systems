import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { startVirtualScreen, xvfbAvailable, type VirtualScreen } from "./xvfb.js";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import type {
  DestroyResult,
  IdentityStats,
  RuntimePort,
  SpawnResult,
  SpawnSpec,
} from "./runtime-port.js";

/**
 * the live runtime port: every identity gets an actual chrome instance,
 * one browser process per identity, headless, containerized. spawn is a
 * real launch, destroy is a real close with a receipt hashed over the
 * real teardown record, stats count real cookies. the pages the agents
 * visit are the terrarium and wall pages this same service serves.
 *
 * containerization reality, stated plainly: chromium's sandbox cannot run
 * as root without user namespaces, which most container platforms do not
 * grant. by default we launch with the sandbox off (CHROME_SANDBOX=1
 * turns it back on where userns is available). the honest risk math for
 * v1: these browsers render only pages this service itself serves, so
 * the sandbox is defending us from our own output. the flag flips before
 * open-web browsing ships. /dev/shm in containers is tiny, so
 * --disable-dev-shm-usage moves shared memory to /tmp.
 *
 * a browser that dies is recorded, reported via health(), and never
 * papered over: the streaming layer loses its page, cells fall back to
 * the activity view, and the driver falls back to the client path.
 */

export interface LiveRuntimeOptions {
  /** chrome binary; default lets playwright-core resolve its own */
  executablePath?: string;
  /** re-enable the chromium sandbox (userns-capable hosts only) */
  sandbox?: boolean;
  /** launch flags proved by the boot sandbox probe on this host. the
   * probe tries several combinations because which one survives is a
   * property of the container, and the identities have to launch on the
   * combination that lived rather than on a hardcoded guess. */
  launchArgs?: string[];
  headless?: boolean;
  /**
   * tier 2: per-agent stored session state ({dir}/{agent_id}.json,
   * playwright storageState), provisioned by the operator. agents never
   * create accounts and never see a login form: the session arrives
   * already signed in or the capability simply is not there.
   */
  sessionStateDir?: string;
  /** hosts where non-GET requests are permitted (write-capable tier-2
   * domains, only when the tier is enabled); everything else external
   * stays structurally read-only */
  writeHosts?: string[];
  /**
   * render each identity as a real browser window on its own virtual
   * screen, so tabs, toolbar and url bar are in frame. requires Xvfb.
   * failure is per-agent and never fatal: that identity falls back to
   * headless viewport capture and /health names which mode it got.
   */
  headfulScreens?: boolean;
  /** first X display number to allocate; each identity takes the next */
  displayBase?: number;
  /** the screen size, which is also the capture frame */
  screenWidth?: number;
  screenHeight?: number;
  /**
   * device pixel ratio for every page. this is the legibility knob: at 2
   * the browser lays a 960x600 window out as a 480x300 page and draws it
   * at twice the resolution, so text is twice as tall in the captured
   * frame and survives the trip into a 416px cell. the page is not
   * zoomed; it genuinely renders at 2x for its css width.
   */
  pageScale?: number;
}

/** how an identity ended up being drawn, and why if it is not the ideal */
export interface RenderMode {
  mode: "headful_x11" | "headless_viewport";
  display?: string;
  width: number;
  height: number;
  reason?: string;
}

interface LiveIdentity {
  identity_id: string;
  agent_id: string;
  spec: SpawnSpec;
  created_at: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  screen: VirtualScreen | null;
  render: RenderMode;
}

export class LiveRuntimePort implements RuntimePort {
  readonly label = "live";
  private readonly opts: LiveRuntimeOptions;
  private readonly live = new Map<string, LiveIdentity>();
  private readonly byAgent = new Map<string, LiveIdentity>();
  private deadCount = 0;
  private lastError: string | null = null;
  private counter = 0;
  private displaySeq = 0;
  private homeUrl: string | null = null;
  private homeForAgent: ((agentId: string) => string) | null = null;
  private homeOrigin: string | null = null;

  constructor(opts: LiveRuntimeOptions = {}) {
    this.opts = opts;
  }

  /**
   * where a fresh browser wakes: the terrarium's front page. set by the
   * service once it knows its own origin. this matters beyond flavor: an
   * about:blank page never paints, so the screencast would have no first
   * frame to send until the agent's first act.
   */
  /** how this agent is being drawn, for the capture layer and /health */
  renderFor(agentId: string): RenderMode | null {
    return this.byAgent.get(agentId)?.render ?? null;
  }

  /** every live agent, so the gallery can keep a channel per identity */
  liveAgentIds(): string[] {
    return [...this.byAgent.keys()];
  }

  setHome(url: string, homeFor?: (agentId: string) => string): void {
    this.homeUrl = url;
    this.homeOrigin = new URL(url).origin;
    if (homeFor) this.homeForAgent = homeFor;
    // browsers spawned before the server was listening catch up
    for (const identity of this.live.values()) {
      if (identity.page.url() === "about:blank") {
        void identity.page
          .goto(this.homeUrlFor(identity.agent_id), { waitUntil: "domcontentloaded", timeout: 15_000 })
          .catch(() => undefined);
      }
    }
  }

  /**
   * where this identity rests. an agent at rest sits on its OWN blog --
   * the writing it has published -- rather than the terrarium's shared
   * lobby. an idle cell should show a life's work, not a directory, and
   * a viewer landing on the wall should be able to read what that
   * identity has actually made.
   */
  homeUrlFor(agentId: string): string {
    return this.homeForAgent?.(agentId) ?? this.homeUrl ?? "about:blank";
  }

  /**
   * where an identity's browser sits between reads.
   *
   * the honest answer is: exactly where it left off. an agent that has
   * just finished a page is still on that page, and the frozen browser
   * on real ground is the truest picture of what it is doing -- it read
   * that, a moment ago, and is thinking about it now. sending it home
   * on every idle gap was the wall going dark while everybody worked:
   * six agents mid-thought looked like six agents gone.
   *
   * so idle stays put, and only a browser with nothing real on screen
   * (a fresh tab, an error page, a page that never painted) is sent
   * home, because something must be on camera.
   */
  async settleIdle(agentId: string): Promise<void> {
    const identity = this.byAgent.get(agentId);
    if (!identity) return;
    if (await this.showingRealPage(identity.page)) return;
    await this.restAtHome(agentId);
  }

  /** is there a page on this screen a viewer would recognize as one */
  private async showingRealPage(page: Page): Promise<boolean> {
    const at = page.url();
    if (!at || at === "about:blank" || at.startsWith("chrome-error")) return false;
    const painted = await page
      .evaluate(() => (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().length)
      .catch(() => 0);
    return painted >= 40;
  }

  /**
   * send an identity to its own blog. this is the fallback when there is
   * nothing real on screen, so it is also the last place a blank window
   * can come from: a browser sitting on about:blank is never "already
   * home", and a home that paints nothing falls back to the terrarium's
   * own front rather than leaving the cell white.
   */
  async restAtHome(agentId: string): Promise<void> {
    const identity = this.byAgent.get(agentId);
    if (!identity) return;
    const home = this.homeUrlFor(agentId);
    const at = identity.page.url();
    if (at !== "about:blank" && at.startsWith(home)) return;
    await identity.page
      .goto(home, { waitUntil: "domcontentloaded", timeout: 15_000 })
      .catch(() => undefined);
    if (await this.showingRealPage(identity.page)) return;
    // an identity with no blog of its own (or a tenant page that has not
    // painted) still gets a real page to rest on
    if (this.homeUrl && home !== this.homeUrl) {
      await identity.page
        .goto(this.homeUrl, { waitUntil: "domcontentloaded", timeout: 15_000 })
        .catch(() => undefined);
    }
  }

  private async launchBrowser(
    screen: VirtualScreen | null,
    width: number,
    height: number
  ): Promise<Browser> {
    return chromium.launch({
      // headful only makes sense pointed at a screen; without one there
      // is nowhere for a window to be
      headless: screen ? false : (this.opts.headless ?? true),
      chromiumSandbox: this.opts.sandbox ?? false,
      ...(this.opts.executablePath ? { executablePath: this.opts.executablePath } : {}),
      ...(screen ? { env: { ...process.env, DISPLAY: screen.display } } : {}),
      args: [
        ...(this.opts.launchArgs ?? ["--disable-dev-shm-usage", "--disable-gpu"]),
        "--hide-scrollbars",
        `--window-size=${width},${height}`,
        `--force-device-scale-factor=${this.opts.pageScale ?? 2}`,
        ...(screen ? ["--window-position=0,0"] : []),
      ],
    });
  }

  /**
   * a virtual screen for this identity, or null with a reason. never
   * throws: losing the browser chrome is a downgrade in how the wall
   * looks, and it must not cost an identity its life or its channel.
   */
  private async screenFor(agentId: string, profileW: number, profileH: number): Promise<{
    screen: VirtualScreen | null;
    reason?: string;
  }> {
    if (!this.opts.headfulScreens) {
      return { screen: null, reason: "headful screens not requested" };
    }
    if (!xvfbAvailable()) {
      return { screen: null, reason: "Xvfb is not installed in this image" };
    }
    const displayNumber = (this.opts.displayBase ?? 99) + this.displaySeq++;
    try {
      return {
        screen: await startVirtualScreen({
          displayNumber,
          width: profileW,
          height: profileH,
        }),
      };
    } catch (err) {
      return {
        screen: null,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async launch(spec: SpawnSpec, identityId: string, createdAt: string): Promise<LiveIdentity> {
    const width = this.opts.screenWidth ?? 1280;
    const height = this.opts.screenHeight ?? 720;
    const { screen, reason } = await this.screenFor(spec.agent_id, width, height);
    let render: RenderMode = screen
      ? { mode: "headful_x11", display: screen.display, width, height }
      : { mode: "headless_viewport", width, height, ...(reason ? { reason } : {}) };

    let browser: Browser;
    try {
      browser = await this.launchBrowser(screen, width, height);
    } catch (err) {
      // the window was the ambition; the identity is the point. a headful
      // launch that fails takes its screen down with it and the agent
      // lives on headless, with the reason kept for /health.
      if (!screen) throw err;
      screen.stop();
      render = {
        mode: "headless_viewport",
        width,
        height,
        reason: `headful launch failed: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
      };
      console.warn(`runtime-live: ${spec.agent_id} falling back to headless: ${render.reason}`);
      browser = await this.launchBrowser(null, width, height);
    }
    const storageStatePath = this.opts.sessionStateDir
      ? join(this.opts.sessionStateDir, `${spec.agent_id}.json`)
      : null;
    const hasSession = storageStatePath !== null && existsSync(storageStatePath);
    if (hasSession) console.log(`runtime-live: ${spec.agent_id} wakes with provisioned session state`);
    const scale = this.opts.pageScale ?? 2;
    const context = await browser.newContext({
      // css pixels, not device pixels: the same layout the headful window
      // gets, rendered at the same density
      viewport: {
        width: Math.round((this.opts.screenWidth ?? 960) / scale),
        height: Math.round((this.opts.screenHeight ?? 600) / scale),
      },
      deviceScaleFactor: scale,
      ...(spec.locale ? { locale: spec.locale } : {}),
      ...(hasSession ? { storageState: storageStatePath as string } : {}),
      userAgent: `mortal-wall/${spec.agent_id} (autonomous identity; witness.run)`,
    });
    // read-only outside our own service, structurally: any non-GET
    // request to a foreign origin is aborted at the network layer, so no
    // form on any external page can submit even if something clicked it.
    // homeOrigin is read at request time, so browsers launched before the
    // server was listening are covered the moment setHome runs.
    await context.route("**/*", (route) => {
      const request = route.request();
      if (request.method() === "GET") return route.continue();
      const url = request.url();
      if (this.homeOrigin !== null && url.startsWith(this.homeOrigin)) return route.continue();
      // tier-2 write hosts (empty until the tier flips) are the one
      // exception; every other foreign non-GET dies at the network layer
      try {
        const host = new URL(url).hostname.toLowerCase();
        const writable = (this.opts.writeHosts ?? []).some(
          (d) => host === d || host.endsWith(`.${d}`)
        );
        if (writable) return route.continue();
      } catch {
        // unparseable url: fall through to the abort
      }
      return route.abort("accessdenied");
    });
    const page = await context.newPage();
    const identity: LiveIdentity = {
      identity_id: identityId,
      agent_id: spec.agent_id,
      spec,
      created_at: createdAt,
      browser,
      context,
      page,
      screen,
      render,
    };
    browser.on("disconnected", () => {
      // the screen exists for the window; with the window gone it is an
      // X server holding memory for nobody
      identity.screen?.stop();
      // only count deaths we did not order; destroy() removes first
      if (this.live.has(identityId)) {
        this.live.delete(identityId);
        this.byAgent.delete(spec.agent_id);
        this.deadCount += 1;
        this.lastError = `browser for ${spec.agent_id} disconnected`;
        console.error(`runtime-live: ${this.lastError}`);
      }
    });
    this.live.set(identityId, identity);
    this.byAgent.set(spec.agent_id, identity);
    if (this.homeUrl) {
      await page
        .goto(this.homeUrl, { waitUntil: "domcontentloaded", timeout: 15_000 })
        .catch(() => undefined);
    }
    return identity;
  }

  async spawn(spec: SpawnSpec): Promise<SpawnResult> {
    const identityId = `idn_live_${++this.counter}_${spec.agent_id}`;
    const createdAt = new Date().toISOString();
    const identity = await this.launch(spec, identityId, createdAt);
    const fingerprint = createHash("sha256")
      .update(`${identityId}:${createdAt}:${identity.browser.version()}`)
      .digest("hex");
    return { identity_id: identityId, fingerprint_short: `fp_${fingerprint.slice(0, 4)}` };
  }

  async destroy(identityId: string, cause: string): Promise<DestroyResult> {
    const identity = this.live.get(identityId);
    if (!identity) throw new Error(`no live identity ${identityId}`);
    this.live.delete(identityId);
    this.byAgent.delete(identity.agent_id);
    const cookies = await identity.context.cookies().catch(() => []);
    await identity.context.clearCookies().catch(() => undefined);
    await identity.browser.close().catch(() => undefined);
    const record = {
      identity_id: identityId,
      agent_id: identity.agent_id,
      created_at: identity.created_at,
      destroyed_at: new Date().toISOString(),
      cause,
      cookies_cleared: cookies.length,
      browser_closed: true,
    };
    return { receipt: createHash("sha256").update(JSON.stringify(record)).digest("hex") };
  }

  async stats(identityId: string): Promise<IdentityStats> {
    const identity = this.live.get(identityId);
    if (!identity) throw new Error(`no live identity ${identityId}`);
    const cookies = await identity.context.cookies().catch(() => []);
    return { cookie_count: cookies.length, account_count: 0, memory_bytes: 0 };
  }

  /** the browser process did not survive the restart; the identity did
   * (its record and archive are the continuity). reattach relaunches a
   * browser for it with the original spawn timestamp in the books. */
  async reattach(agentId: string, spawnedAt: string): Promise<SpawnResult | null> {
    const identityId = `idn_live_resumed_${++this.counter}_${agentId}`;
    const spec: SpawnSpec = {
      agent_id: agentId,
      class: "unknown",
      region: null,
      locale: null,
      ttl_seconds: 0,
    };
    const identity = await this.launch(spec, identityId, spawnedAt || new Date().toISOString());
    const fingerprint = createHash("sha256")
      .update(`${identityId}:${identity.browser.version()}`)
      .digest("hex");
    return { identity_id: identityId, fingerprint_short: `fp_${fingerprint.slice(0, 4)}` };
  }

  /** the streaming layer and the driver reach the real page here; null
   * means the browser is gone and callers degrade honestly */
  pageFor(agentId: string): Page | null {
    return this.byAgent.get(agentId)?.page ?? null;
  }

  health(): Record<string, unknown> {
    return {
      browsers_live: this.live.size,
      browsers_dead: this.deadCount,
      ...(this.lastError ? { last_error: this.lastError } : {}),
    };
  }

  async close(): Promise<void> {
    for (const identity of [...this.live.values()]) {
      this.live.delete(identity.identity_id);
      this.byAgent.delete(identity.agent_id);
      await identity.browser.close().catch(() => undefined);
    }
  }
}
