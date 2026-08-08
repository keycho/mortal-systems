import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { WallStore } from "@mortal/wall";
import { LAUNCH_CAST, castNames } from "./cast.js";
import { flagsFromEnv } from "./policy.js";
import { StubRuntimePort } from "./runtime-port.js";
import { httpTerrariumClient } from "./terrarium-client.js";
import { scriptedThinker } from "./think.js";
import { Showrunner } from "./showrunner.js";
import { createWallApi } from "./api.js";

/**
 * dev entrypoint: a whole wall on one machine. boots the event store, wires
 * the terrarium (expects `pnpm --filter terrarium dev` on 4924), spawns the
 * launch cast against the STUB runtime port, and serves the public wall api
 * on 4925. the stub launches no browsers; the real RuntimePort lands with
 * the launcher-side integration and this file is where it plugs in.
 */

const root = process.env.MORTAL_ROOT ?? join(homedir(), ".mortal");
mkdirSync(join(root, "wall"), { recursive: true });

const store = new WallStore(join(root, "wall", "wall.db"));
const flags = flagsFromEnv();
const showrunner = new Showrunner({
  store,
  runtime: new StubRuntimePort(),
  terrarium: httpTerrariumClient(
    process.env.TERRARIUM_URL ?? "http://127.0.0.1:4924",
    process.env.TERRARIUM_ADMIN_TOKEN ?? "terrarium-dev"
  ),
  think: scriptedThinker,
  flags,
});
Object.assign(showrunner.names, castNames());

const api = createWallApi({
  store,
  names: () => showrunner.names,
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
});
const port = Number(process.env.WALL_API_PORT ?? 4925);
api.listen(port, "127.0.0.1", () => {
  console.log(`wall api on http://127.0.0.1:${port} (stub runtime, no browsers; store ${root}/wall)`);
});

async function main(): Promise<void> {
  for (const member of LAUNCH_CAST) {
    if (member.serial) {
      showrunner.registerSerialMember(member);
      await showrunner.spawn(member, { inherited_fragments: [] });
    } else {
      await showrunner.spawn(member);
    }
  }
  // ambient cadence: one heartbeat somewhere each minute, tick each 30s
  setInterval(() => void showrunner.tick().catch(console.error), 30_000).unref();
  let i = 0;
  setInterval(() => {
    const ids = [...showrunner.live.keys()];
    if (ids.length === 0) return;
    const id = ids[i++ % ids.length] as string;
    void showrunner.heartbeat(id).catch(console.error);
  }, 60_000).unref();
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
