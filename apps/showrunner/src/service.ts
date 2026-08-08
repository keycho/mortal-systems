import { createServer, type Server } from "node:http";
import { mkdirSync } from "node:fs";
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
import { scriptedThinker } from "./think.js";
import { selectThinker, type SelectedThinker } from "./think-select.js";
import { storeTerrariumClient } from "./terrarium-client.js";
import { Showrunner } from "./showrunner.js";
import { createWallApiHandler } from "./api.js";
import { StreamManager, selectStreamProvider } from "./stream/index.js";

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
  const streamProvider = selectStreamProvider(env);
  const streams = streamProvider ? new StreamManager(streamProvider, env) : null;

  const showrunner = new Showrunner({
    store: wallStore,
    // the stub keeps honest books but launches no browsers; the real
    // RuntimePort replaces this when the launcher-side integration lands
    runtime: opts.runtime ?? new StubRuntimePort(),
    // in-process store client: same store the public routes serve, same
    // frozen-tenant refusals; the http client remains for split deployments
    terrarium: storeTerrariumClient(terrariumStore),
    think: thinker.think,
    flags: opts.flags ?? flagsFromEnv(env),
  });
  Object.assign(showrunner.names, castNames());

  const terrariumOpts: TerrariumOptions = {
    store: terrariumStore,
    adminToken: terrariumToken,
    baseHost: env.TERRARIUM_BASE_HOST,
    publicBase: env.TERRARIUM_PUBLIC_BASE,
  };
  const terrariumHandler = createTerrariumHandler(terrariumOpts);
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
      runtime_port: opts.runtime ? "custom" : "stub",
    }),
  });

  const server = createServer((req, res) => {
    if (wallHandler(req, res)) return;
    terrariumHandler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(opts.port, "0.0.0.0", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : opts.port;
  log(
    `wall service on :${port} (root ${opts.root}, thinker ${thinker.label}, stream ${streamProvider?.name ?? "none"}, runtime ${opts.runtime ? "custom" : "stub"})`
  );

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

  const tickSeconds = opts.tickSeconds ?? Number(env.TICK_SECONDS ?? 30);
  const heartbeatSeconds = opts.heartbeatSeconds ?? Number(env.HEARTBEAT_SECONDS ?? 60);
  const tick = setInterval(() => {
    void showrunner
      .tick()
      .then(() => showrunner.calendarTick())
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
      await new Promise((resolve) => server.close(resolve));
      wallStore.close();
      terrariumStore.close();
    },
  };
}
