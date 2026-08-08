import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
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

  // the state root is the life of the wall. a store that will not open
  // is fatal and must say exactly why: an operator reading this line
  // should not have to guess at ownership.
  const wallStore = openStore(
    "wall",
    join(opts.root, "wall"),
    (dir) => new WallStore(join(dir, "wall.db")),
    opts.root
  );
  const terrariumStore = openStore(
    "terrarium",
    join(opts.root, "terrarium"),
    (dir) => new TerrariumStore(join(dir, "terrarium.db")),
    opts.root
  );
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
  let sandboxStatus: {
    wanted: boolean;
    ok: boolean;
    failure?: string;
    reason?: string;
    /** the flags that actually survived here, reused by the browsers */
    args?: string[];
    environment?: Record<string, unknown>;
    attempts?: Array<Record<string, unknown>>;
  } = {
    wanted: sandboxWanted,
    ok: false,
    ...(sandboxWanted ? {} : { reason: "not requested (CHROME_SANDBOX unset)" }),
  };
  // the probe runs here, before a single identity is spawned and before
  // any capture starts, so it measures an empty container rather than
  // competing with three browsers and an encoder for headroom.
  if (wantLive && sandboxWanted) {
    const { probeSandbox } = await import("./sandbox-probe.js");
    const probe = await probeSandbox(env.CHROME_PATH);
    sandboxStatus = {
      wanted: true,
      ok: probe.ok,
      ...(probe.failure ? { failure: probe.failure } : {}),
      ...(probe.reason ? { reason: probe.reason } : {}),
      ...(probe.args ? { args: probe.args } : {}),
      ...(probe.environment ? { environment: probe.environment as unknown as Record<string, unknown> } : {}),
      ...(probe.attempts ? { attempts: probe.attempts as unknown as Array<Record<string, unknown>> } : {}),
    };
    if (probe.ok) {
      log(`sandbox probe passed on "${probe.attempts?.find((a) => a.ok)?.label}" flags; tier-1 external reading ON`);
    } else {
      // a failure here costs the wall its open web, so it gets the full
      // account rather than an adjective: what was tried, what the
      // container looked like, and chromium's own last words.
      console.error(
        [
          "",
          "============ the sandbox probe failed; external reading OFF ============",
          `failure:      ${probe.failure}`,
          `reason:       ${probe.reason}`,
          `environment:  ${JSON.stringify(probe.environment)}`,
          ...(probe.attempts ?? []).flatMap((attempt) => [
            `attempt "${attempt.label}" [${attempt.args.join(" ")}] -> ${attempt.ok ? "ok" : (attempt.failure ?? "failed")}`,
            ...(attempt.stderr ? [indent(attempt.stderr)] : []),
          ]),
          "agents keep browsing pages this service serves; no external page",
          "will render in an unsandboxed browser.",
          "=======================================================================",
          "",
        ].join("\n")
      );
    }
  }
  const preFlags = opts.flags ?? flagsFromEnv(env);
  const liveRuntime = wantLive
    ? new LiveRuntimePort({
        executablePath: env.CHROME_PATH,
        sandbox: sandboxStatus.ok,
        // the browsers launch on exactly the flags the probe proved, so
        // a passing probe is evidence about the identities that follow
        // rather than about a configuration nothing else uses
        ...(sandboxStatus.args ? { launchArgs: sandboxStatus.args } : {}),
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
  const boot: {
    phase: "starting" | "running" | "failed";
    error?: string;
    spawn_failures: Array<{ agent_id: string; reason: string }>;
  } = { phase: "starting", spawn_failures: [] };
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
      // an empty wall is never healthy: boot failures and a cast that
      // never came up both drive /health to 503 (see api.ts)
      ok: boot.phase === "running",
      boot: {
        phase: boot.phase,
        ...(boot.error ? { error: boot.error } : {}),
        ...(boot.spawn_failures.length > 0 ? { spawn_failures: boot.spawn_failures } : {}),
      },
      agents_live: showrunner.live.size,
      cast_size: cast.length,
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

  // restart continuity first, fresh spawns only for lives never lived.
  // every failure here is recorded and surfaced: the server is already
  // listening at this point, so an exception that merely rejected the
  // boot promise would leave a live service serving an empty wall behind
  // a green healthcheck. that happened in production; it cannot again.
  try {
    const { recovered, unspawned } = await showrunner.resume(cast);
    if (recovered.length > 0) log(`resumed: ${recovered.join(", ")}`);
    for (const member of cast) if (member.serial) showrunner.registerSerialMember(member);
    for (const member of unspawned) {
      // one browser that will not launch must not cost the whole cast
      try {
        if (member.serial) {
          const predecessorId = showrunner.lastSerialAgentId(member);
          await showrunner.spawn(member, {
            inherited_fragments: predecessorId ? showrunner.chooseInheritance(predecessorId) : [],
          });
        } else {
          await showrunner.spawn(member);
        }
      } catch (err) {
        const reason = firstLine(err);
        boot.spawn_failures.push({ agent_id: member.agent_id, reason });
        console.error(`boot: ${member.agent_id} failed to spawn: ${reason}`);
      }
    }
    boot.phase = "running";
  } catch (err) {
    boot.phase = "failed";
    boot.error = firstLine(err);
    console.error(`boot: resume failed: ${boot.error}`);
  }

  // a cast that produced no live identity is a failed boot even when
  // every individual error was caught and survived: whatever the reasons
  // were, there is no wall. one identity short of the cast is a live
  // wall, and stays "running" with the missing one named.
  if (boot.phase === "running" && cast.length > 0 && showrunner.live.size === 0) {
    boot.phase = "failed";
    boot.error = boot.spawn_failures[0]?.reason ?? "the cast produced no live identity";
  }

  if (boot.phase !== "running" || showrunner.live.size === 0) {
    console.error(
      [
        "",
        "==================== the wall came up empty ====================",
        `phase:        ${boot.phase}`,
        `agents live:  ${showrunner.live.size} of ${cast.length} in the cast`,
        boot.error ? `resume error: ${boot.error}` : "",
        ...boot.spawn_failures.map((f) => `spawn failed: ${f.agent_id}: ${f.reason}`),
        "/health now answers 503 so the platform restarts this instead of",
        "leaving a dead wall behind a green check.",
        "================================================================",
        "",
      ]
        .filter(Boolean)
        .join("\n")
    );
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

/** the first line of an error, which is the part worth logging */
/**
 * one operator-readable line out of an error of unknown shape. taking
 * literally the first line is not enough: a schema validation error
 * arrives pretty-printed as json, whose first line is "[", and a banner
 * that says `resume error: [` is the same silence this incident was
 * about. so collapse the whole message instead and keep the front of it.
 */
/** shift a captured block right so it reads as quoted, not as our own log */
function indent(block: string): string {
  return block
    .split("\n")
    .map((line) => `    | ${line}`)
    .join("\n");
}

function firstLine(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const collapsed = message.replace(/\s+/g, " ").trim();
  if (collapsed.length <= 200) return collapsed || "no message";
  return `${collapsed.slice(0, 200)}...`;
}

/**
 * open a store, or fail with a line an operator can act on. the volume
 * ownership case is called out by name because it is the one that
 * actually happens: a volume written by an earlier root boot, mounted
 * into a container that has since dropped privileges.
 */
function openStore<T>(
  label: string,
  dir: string,
  make: (dir: string) => T,
  root: string
): T {
  try {
    mkdirSync(dir, { recursive: true });
    // opening is not enough. a directory left root-owned by an earlier
    // boot is still mode 755, so mkdir sees it already there and sqlite
    // opens the file read-only without complaint; the failure surfaces
    // later as "attempt to write a readonly database" from inside the
    // heartbeat, long after boot, with no line saying why. prove the
    // volume is writable here, where the diagnosis still fits in one
    // banner.
    const probe = join(dir, ".write-probe");
    writeFileSync(probe, String(process.pid));
    unlinkSync(probe);
    return make(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const uid = typeof process.getuid === "function" ? process.getuid() : "?";
    const gid = typeof process.getgid === "function" ? process.getgid() : "?";
    let owner = "unknown";
    try {
      const st = statSync(root);
      owner = `uid ${st.uid}:gid ${st.gid}, mode ${(st.mode & 0o777).toString(8)}`;
    } catch {
      owner = "the state root does not exist or is not readable";
    }
    console.error(
      [
        "",
        "================ the wall cannot open its state ================",
        `store:        ${label}`,
        `path:         ${dir}`,
        `error:        ${code ?? ""} ${(err as Error).message}`,
        `running as:   uid ${uid}:gid ${gid}`,
        `state root:   ${root} (${owner})`,
        code === "EACCES" || code === "EPERM"
          ? "likely cause: the volume was written by an earlier boot running as root and this process has dropped privileges. the container entrypoint chowns the volume before dropping; if you are seeing this, the entrypoint did not run (check ENTRYPOINT) or it could not reach the volume."
          : code === "EROFS"
            ? "likely cause: the volume is mounted read-only. the wall's record is append-only and it cannot append here."
            : "likely cause: the volume is not mounted at this path.",
        "the wall refuses to start rather than serve an empty room.",
        "================================================================",
        "",
      ].join("\n")
    );
    throw err;
  }
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
