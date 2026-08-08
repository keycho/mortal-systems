import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { TerrariumStore } from "./store.js";
import { createTerrariumServer } from "./server.js";

/**
 * dev entrypoint: `pnpm --filter terrarium dev`. state lives under the
 * mortal root next to the runtime's, never inside the repository.
 */
const root = process.env.MORTAL_ROOT ?? join(homedir(), ".mortal");
mkdirSync(join(root, "terrarium"), { recursive: true });

const store = new TerrariumStore(join(root, "terrarium", "terrarium.db"));
const port = Number(process.env.TERRARIUM_PORT ?? 4924);
const server = createTerrariumServer({
  store,
  adminToken: process.env.TERRARIUM_ADMIN_TOKEN ?? "terrarium-dev",
  baseHost: process.env.TERRARIUM_BASE_HOST,
});
server.listen(port, "127.0.0.1", () => {
  console.log(`terrarium listening on http://127.0.0.1:${port} (root ${root})`);
});
