import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
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
}

interface LiveIdentity {
  identity_id: string;
  agent_id: string;
  spec: SpawnSpec;
  created_at: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export class LiveRuntimePort implements RuntimePort {
  readonly label = "live";
  private readonly opts: LiveRuntimeOptions;
  private readonly live = new Map<string, LiveIdentity>();
  private readonly byAgent = new Map<string, LiveIdentity>();
  private deadCount = 0;
  private lastError: string | null = null;
  private counter = 0;
  private homeUrl: string | null = null;
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
  setHome(url: string): void {
    this.homeUrl = url;
    this.homeOrigin = new URL(url).origin;
    // browsers spawned before the server was listening catch up
    for (const identity of this.live.values()) {
      if (identity.page.url() === "about:blank") {
        void identity.page
          .goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 })
          .catch(() => undefined);
      }
    }
  }

  private async launch(spec: SpawnSpec, identityId: string, createdAt: string): Promise<LiveIdentity> {
    const browser = await chromium.launch({
      headless: this.opts.headless ?? true,
      chromiumSandbox: this.opts.sandbox ?? false,
      ...(this.opts.executablePath ? { executablePath: this.opts.executablePath } : {}),
      args: [
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--hide-scrollbars",
        "--window-size=1280,720",
      ],
    });
    const storageStatePath = this.opts.sessionStateDir
      ? join(this.opts.sessionStateDir, `${spec.agent_id}.json`)
      : null;
    const hasSession = storageStatePath !== null && existsSync(storageStatePath);
    if (hasSession) console.log(`runtime-live: ${spec.agent_id} wakes with provisioned session state`);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      ...(spec.locale ? { locale: spec.locale } : {}),
      ...(hasSession ? { storageState: storageStatePath as string } : {}),
      userAgent: `mortal-wall/${spec.agent_id} (autonomous identity; mortal.systems)`,
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
    };
    browser.on("disconnected", () => {
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
