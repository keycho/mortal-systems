import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { WallStore } from "@mortal/wall";
import {
  TerrariumStore,
  createTerrariumHandler,
  type TerrariumOptions,
} from "terrarium";
import { LAUNCH_CAST, castNames, type CastMember } from "./cast.js";
import { flagsFromEnv, type PolicyFlags } from "./policy.js";
import { StubRuntimePort, type RuntimePort } from "./runtime-port.js";
import { LiveRuntimePort } from "./runtime-live.js";
import { BrowserDriver } from "./driver.js";
import { scriptedThinker } from "./think.js";
import { selectThinker, type SelectedThinker } from "./think-select.js";
import { storeTerrariumClient } from "./terrarium-client.js";
import { Showrunner } from "./showrunner.js";
import { createWallApiHandler } from "./api.js";
import { StreamDirector, StreamManager, selectStreamProvider } from "./stream/index.js";

/**
 * the whole wall service as one composable boot: stores, showrunner,
 * both http surfaces on one port, resume-or-spawn, and the cadence
 * timers. serve.ts is a thin env wrapper around this, and the death-path
 * smoke drives the very same composition — prod-shaped by construction,
 * not by imitation.
 */

export interface WallServiceOptions {
  root: string;
  /** 0 for an ephemeral port (tests, smoke) */
  port: number;
  env?: NodeJS.ProcessEnv;
  /** defaults to the launch cast */
  cast?: CastMember[];
  runtime?: RuntimePort;
  thinker?: SelectedThinker;
  flags?: PolicyFlags;
  tickSeconds?: number;
  heartbeatSeconds?: number;
  log?: (line: string) => void;
}

export interface WallService {
  server: Server;
  port: number;
  showrunner: Showrunner;
  wallStore: WallStore;
  terrariumStore: TerrariumStore;
  stop(): Promise<void>;
}

export async function bootWallService(opts: WallServiceOptions): Promise<WallService> {
  const env = opts.env ?? process.env;
  const log = opts.log ?? console.log;
  const cast = opts.cast ?? LAUNCH_CAST;
  mkdirSync(join(opts.root, "wall"), { recursive: true });
  mkdirSync(join(opts.root, "terrarium"), { recursive: true });

  const wallStore = new WallStore(join(opts.root, "wall", "wall.db"));
  const terrariumStore = new TerrariumStore(join(opts.root, "terrarium", "terrarium.db"));
  const terrariumToken = env.TERRARIUM_ADMIN_TOKEN ?? "terrarium-dev";
  if (terrariumToken === "terrarium-dev" && env.NODE_ENV === "production") {
    console.warn("warning: TERRARIUM_ADMIN_TOKEN is the dev default in production");
  }

  const thinker = opts.thinker ?? selectThinker(env, scriptedThinker);
  const hlsRoot = join(opts.root, "hls");
  const streamProvider = selectStreamProvider(env, { hlsRoot });
  const streams = streamProvider ? new StreamManager(streamProvider, env) : null;

  // WALL_RUNTIME=live gives every identity an actual chrome instance;
  // the stub remains the dev/test default and says so in /health.
  // tier-1 external browsing is earned, not configured: CHROME_SANDBOX=1
  // asks, and the boot-time probe decides. a failed probe launches the
  // browsers unsandboxed for home-ground pages only and gates external
  // navigation off entirely, with the reason in /health.
  const wantLive = !opts.runtime && (env.WALL_RUNTIME ?? "stub").toLowerCase() === "live";
  const sandboxWanted = env.CHROME_SANDBOX === "1";
  let sandboxStatus: { wanted: boolean; ok: boolean; reason?: string } = {
    wanted: sandboxWanted,
    ok: false,
    ...(sandboxWanted ? {} : { reason: "not requested (CHROME_SANDBOX unset)" }),
  };
  if (wantLive && sandboxWanted) {
    const { probeSandbox } = await import("./sandbox-probe.js");
    const probe = await probeSandbox(env.CHROME_PATH);
    sandboxStatus = { wanted: true, ok: probe.ok, ...(probe.reason ? { reason: probe.reason } : {}) };
    if (!probe.ok) {
      console.warn(`sandbox probe failed, external browsing OFF: ${probe.reason}`);
    }
  }
  const preFlags = opts.flags ?? flagsFromEnv(env);
  const liveRuntime = wantLive
    ? new LiveRuntimePort({
        executablePath: env.CHROME_PATH,
        sandbox: sandboxStatus.ok,
        // tier 2: operator-provisioned session state; agents never see a
        // login form because the session arrives signed in or not at all
        sessionStateDir: env.WALL_SESSIONS_DIR ?? join(opts.root, "sessions"),
        // non-GET stays blocked everywhere external except write-capable
        // domains, and only once the tier is actually enabled
        writeHosts: (preFlags.tier2WriteEnabled ?? false)
          ? (preFlags.writeAllowlist ?? []).map((c) => c.domain)
          : [],
      })
    : null;
  const runtime = opts.runtime ?? liveRuntime ?? new StubRuntimePort();
  const runtimeLabel =
    (runtime as { label?: string }).label ?? (opts.runtime ? "custom" : "stub");
  const flags = preFlags;
  flags.externalBrowsing = Boolean(liveRuntime) && sandboxStatus.ok;

  const showrunner = new Showrunner({
    store: wallStore,
    runtime,
    // in-process store client: same store the public routes serve, same
    // frozen-tenant refusals; the http client remains for split deployments
    terrarium: storeTerrariumClient(terrariumStore),
    think: thinker.think,
    flags,
  });
  Object.assign(showrunner.names, castNames());

  const terrariumOpts: TerrariumOptions = {
    store: terrariumStore,
    adminToken: terrariumToken,
    baseHost: env.TERRARIUM_BASE_HOST,
    publicBase: env.TERRARIUM_PUBLIC_BASE,
  };
  const terrariumHandler = createTerrariumHandler(terrariumOpts);
  let director: StreamDirector | null = null;
  const wallHandler = createWallApiHandler({
    store: wallStore,
    names: () => showrunner.names,
    corsOrigin: env.WALL_CORS_ORIGIN,
    depthInputs: (agentId) => {
      const agent = showrunner.live.get(agentId);
      if (!agent) return null;
      return {
        cookie_count: 0,
        account_count: agent.tenant ? 1 : 0,
        memory_bytes: Buffer.byteLength(agent.memory.join("\n")),
        post_count: agent.post_count,
      };
    },
    streamUrl: (agentId) => streams?.playbackUrl(agentId) ?? null,
    maxSseConnections: Number(env.WALL_SSE_MAX ?? 200),
    health: () => ({
      agents_live: showrunner.live.size,
      thinker: thinker.label,
      stream_provider: streamProvider?.name ?? "none",
      runtime_port: runtimeLabel,
      ...(liveRuntime ? { runtime: liveRuntime.health() } : {}),
      ...(director ? { stream: director.status() } : {}),
      ...(wantLive
        ? {
            sandbox: sandboxStatus,
            external_browsing: flags.externalBrowsing ?? false,
            tier2_write: flags.tier2WriteEnabled ?? false,
          }
        : {}),
    }),
  });

  const server = createServer((req, res) => {
    if (req.url?.startsWith("/hls/")) return serveHls(hlsRoot, req, res);
    if (wallHandler(req, res)) return;
    terrariumHandler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(opts.port, "0.0.0.0", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : opts.port;
  log(
    `wall service on :${port} (root ${opts.root}, thinker ${thinker.label}, stream ${streamProvider?.name ?? "none"}, runtime ${runtimeLabel})`
  );

  // the driver needs the service's own origin, so it attaches after listen:
  // from here acts go through real browsers on real pages at human speed
  if (liveRuntime) {
    liveRuntime.setHome(`http://127.0.0.1:${port}/`);
    showrunner.driver = new BrowserDriver({
      runtime: liveRuntime,
      baseUrl: `http://127.0.0.1:${port}`,
      terrariumToken,
      readingAllowlist: flags.readingAllowlist ?? [],
      externalEnabled: flags.externalBrowsing ?? false,
    });
  }

  // restart continuity first, fresh spawns only for lives never lived
  const { recovered, unspawned } = await showrunner.resume(cast);
  if (recovered.length > 0) log(`resumed: ${recovered.join(", ")}`);
  for (const member of cast) if (member.serial) showrunner.registerSerialMember(member);
  for (const member of unspawned) {
    if (member.serial) {
      const predecessorId = showrunner.lastSerialAgentId(member);
      await showrunner.spawn(member, {
        inherited_fragments: predecessorId ? showrunner.chooseInheritance(predecessorId) : [],
      });
    } else {
      await showrunner.spawn(member);
    }
  }

  // the director cam points the one camera at the hot agent; it needs
  // both a stream manager and real browsers to point at
  if (streams && liveRuntime) {
    director = new StreamDirector({
      manager: streams,
      events: () => wallStore.list({ publicOnly: true, newestFirst: true, limit: 200 }).reverse(),
      pageFor: (agentId) => liveRuntime.pageFor(agentId),
      memoryLimitMb: Number(env.WALL_STREAM_MEM_MB ?? 1800),
      intervalMs: Number(env.WALL_DIRECTOR_INTERVAL_MS ?? 10_000),
    });
    director.start();
  }

  const tickSeconds = opts.tickSeconds ?? Number(env.TICK_SECONDS ?? 30);
  const heartbeatSeconds = opts.heartbeatSeconds ?? Number(env.HEARTBEAT_SECONDS ?? 60);
  const tick = setInterval(() => {
    void showrunner
      .tick()
      .then(() => showrunner.calendarTick())
      .then(() => showrunner.assignDailyReading())
      .catch(console.error);
  }, tickSeconds * 1000);
  tick.unref();
  let rotation = 0;
  const heartbeat = setInterval(() => {
    const ids = [...showrunner.live.keys()];
    if (ids.length === 0) return;
    const id = ids[rotation++ % ids.length] as string;
    void showrunner.heartbeat(id).catch(console.error);
  }, heartbeatSeconds * 1000);
  heartbeat.unref();

  return {
    server,
    port,
    showrunner,
    wallStore,
    terrariumStore,
    async stop(): Promise<void> {
      clearInterval(tick);
      clearInterval(heartbeat);
      await director?.stop();
      await streams?.stopAll();
      await liveRuntime?.close();
      await new Promise((resolve) => server.close(resolve));
      wallStore.close();
      terrariumStore.close();
    },
  };
}

const HLS_TYPES: Record<string, string> = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".m4s": "video/iso.segment",
  ".mp4": "video/mp4",
};

/** live-only video files under the state root; playlists never cache,
 * segments cache briefly so a cdn in front can absorb the viewers */
function serveHls(hlsRoot: string, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://wall.local");
  const match = /^\/hls\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+\.(?:m3u8|ts|m4s|mp4))$/.exec(
    url.pathname
  );
  if (!match) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }
  const file = join(hlsRoot, match[1] as string, match[2] as string);
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "no such stream" }));
    return;
  }
  const ext = (match[2] as string).slice((match[2] as string).lastIndexOf("."));
  res.writeHead(200, {
    "content-type": HLS_TYPES[ext] ?? "application/octet-stream",
    "cache-control": ext === ".m3u8" ? "no-store" : "public, max-age=60",
    "access-control-allow-origin": "*",
  });
  createReadStream(file).pipe(res);
}
