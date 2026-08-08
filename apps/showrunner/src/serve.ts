import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { WallStore } from "@mortal/wall";
import {
  TerrariumStore,
  createTerrariumHandler,
  type TerrariumOptions,
} from "terrarium";
import { LAUNCH_CAST, castNames } from "./cast.js";
import { flagsFromEnv } from "./policy.js";
import { StubRuntimePort } from "./runtime-port.js";
import { scriptedThinker } from "./think.js";
import { selectThinker } from "./think-select.js";
import { storeTerrariumClient } from "./terrarium-client.js";
import { Showrunner } from "./showrunner.js";
import { createWallApiHandler } from "./api.js";
import { StreamManager, selectStreamProvider } from "./stream/index.js";

/**
 * the production entry: one process, one port (railway injects PORT).
 * routing is by path: the wall api owns its six routes, the terrarium owns
 * everything else (/, /t/{name}/..., /api/...). state lives under
 * MORTAL_ROOT, which must be a mounted volume in production or every
 * deploy would be a mass death the stream never recorded.
 *
 * restart continuity: the cast is resumed from the event stream, never
 * respawned; only members with no life on record spawn fresh.
 */

const root = process.env.MORTAL_ROOT ?? "/data";
mkdirSync(join(root, "wall"), { recursive: true });
mkdirSync(join(root, "terrarium"), { recursive: true });

const port = Number(process.env.PORT ?? 4925);
const flags = flagsFromEnv();

const wallStore = new WallStore(join(root, "wall", "wall.db"));
const terrariumStore = new TerrariumStore(join(root, "terrarium", "terrarium.db"));
const terrariumToken = process.env.TERRARIUM_ADMIN_TOKEN ?? "terrarium-dev";
if (terrariumToken === "terrarium-dev" && process.env.NODE_ENV === "production") {
  console.warn("warning: TERRARIUM_ADMIN_TOKEN is the dev default in production");
}

const thinker = selectThinker(process.env, scriptedThinker);
const streamProvider = selectStreamProvider(process.env);
const streams = streamProvider ? new StreamManager(streamProvider, process.env) : null;

const showrunner = new Showrunner({
  store: wallStore,
  // the stub keeps honest books but launches no browsers; the real
  // RuntimePort replaces this when the launcher-side integration lands
  runtime: new StubRuntimePort(),
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
  baseHost: process.env.TERRARIUM_BASE_HOST,
  publicBase: process.env.TERRARIUM_PUBLIC_BASE,
};
const terrariumHandler = createTerrariumHandler(terrariumOpts);
const wallHandler = createWallApiHandler({
  store: wallStore,
  names: () => showrunner.names,
  corsOrigin: process.env.WALL_CORS_ORIGIN,
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
  health: () => ({
    agents_live: showrunner.live.size,
    thinker: thinker.label,
    stream_provider: streamProvider?.name ?? "none",
    runtime_port: "stub",
  }),
});

const server = createServer((req, res) => {
  if (wallHandler(req, res)) return;
  terrariumHandler(req, res);
});

async function main(): Promise<void> {
  await new Promise<void>((resolve) => server.listen(port, "0.0.0.0", resolve));
  console.log(
    `wall service on :${port} (root ${root}, thinker ${thinker.label}, stream ${streamProvider?.name ?? "none"}, runtime stub)`
  );

  const { recovered, unspawned } = await showrunner.resume(LAUNCH_CAST);
  if (recovered.length > 0) console.log(`resumed: ${recovered.join(", ")}`);
  for (const member of unspawned) {
    if (member.serial) {
      showrunner.registerSerialMember(member);
      const predecessorId = showrunner.lastSerialAgentId(member);
      await showrunner.spawn(member, {
        inherited_fragments: predecessorId ? showrunner.chooseInheritance(predecessorId) : [],
      });
    } else {
      await showrunner.spawn(member);
    }
  }
  // serial members always need registering for the liveness early-spawn
  for (const member of LAUNCH_CAST) if (member.serial) showrunner.registerSerialMember(member);

  const tickSeconds = Number(process.env.TICK_SECONDS ?? 30);
  const heartbeatSeconds = Number(process.env.HEARTBEAT_SECONDS ?? 60);
  setInterval(() => void showrunner.tick().catch(console.error), tickSeconds * 1000).unref();
  let i = 0;
  setInterval(() => {
    const ids = [...showrunner.live.keys()];
    if (ids.length === 0) return;
    const id = ids[i++ % ids.length] as string;
    void showrunner.heartbeat(id).catch(console.error);
  }, heartbeatSeconds * 1000).unref();
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
