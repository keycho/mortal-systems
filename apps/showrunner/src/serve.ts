import { bootWallService } from "./service.js";

/**
 * the production entry: one process, one port (railway injects PORT).
 * routing is by path: the wall api owns its routes, the terrarium owns
 * everything else (/, /t/{name}/..., /api/...). state lives under
 * MORTAL_ROOT, which must be a mounted volume in production or every
 * deploy would be a mass death the stream never recorded.
 *
 * restart continuity: the cast is resumed from the event stream, never
 * respawned; only members with no life on record spawn fresh — which is
 * why the first boot of a fresh volume spawns ash-1 immediately,
 * off-calendar, and the mon+thu calendar governs successors after that.
 * the composition itself lives in service.ts, shared verbatim with the
 * death-path smoke.
 */

void bootWallService({
  root: process.env.MORTAL_ROOT ?? "/data",
  port: Number(process.env.PORT ?? 4925),
}).catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
