// the death-path smoke, prod-shaped: boots the SAME service composition
// railway runs (apps/showrunner/src/service.ts), spawns one throwaway ash
// with a short ttl, and verifies the whole ritual over the public http
// api only — expiry via the real tick, teardown receipt, graveyard entry
// (the death card's data), terrarium archive frozen read-only, and the
// receipt recomputable from the event itself.
//
//   node scripts/smoke-death.mjs                # ~10 minute ttl (pre-launch check)
//   node scripts/smoke-death.mjs --ttl 20       # quick local pass
//
// build first: pnpm turbo run build --filter=showrunner
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { bootWallService } = await import("../apps/showrunner/dist/service.js");
const { verifyReceipt } = await import("../packages/wall/dist/index.js");

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};
const ttl = argValue("ttl", 600);
const tickSeconds = Math.max(1, Math.min(5, Math.ceil(ttl / 20)));

const root = mkdtempSync(join(tmpdir(), "wall-smoke-"));
const smokeAsh = {
  agent_id: "ag_smoke_ash",
  name: "smoke-ash",
  class: "burner",
  region: null,
  locale: null,
  tz: null,
  ttl_seconds: ttl,
  serial: true,
  // "blog" in the role makes the scripted thinker publish on its first
  // beat, so the frozen-post refusal path gets exercised too
  role: "throwaway manifesto blog for the death-path smoke",
  runtime_feature: "clean teardown, verified end to end",
  wave: 1,
  tenant: "smoke-ash",
};

const fail = (message) => {
  console.error(`smoke-death: FAIL — ${message}`);
  process.exitCode = 1;
};
const ok = (message) => console.log(`smoke-death: ok — ${message}`);

const service = await bootWallService({
  root,
  port: 0,
  cast: [smokeAsh],
  tickSeconds,
  heartbeatSeconds: Math.max(5, Math.floor(ttl / 4)),
  env: { ...process.env, WALL_THINKER: "scripted", STREAM_PROVIDER: "none" },
  log: (line) => console.log(`smoke-death: ${line}`),
});
const base = `http://127.0.0.1:${service.port}`;

try {
  const spawnNow = await (await fetch(`${base}/now`)).json();
  if (spawnNow.alive !== 1) throw new Error(`expected 1 live agent, got ${spawnNow.alive}`);
  ok(`spawned ${spawnNow.agents[0].name} with ${ttl}s to live; waiting for the ttl to fire`);

  // let the ash live a little so the archive has content to freeze
  await service.showrunner.heartbeat("ag_smoke_ash_1").catch(() => undefined);

  const deadline = Date.now() + (ttl + tickSeconds * 4 + 30) * 1000;
  let dead = null;
  while (Date.now() < deadline) {
    const graveyard = await (await fetch(`${base}/graveyard`)).json();
    if (graveyard.dead.length > 0) {
      dead = graveyard.dead[0];
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(tickSeconds, 5) * 1000));
  }
  if (!dead) throw new Error("the ttl elapsed but no death reached the graveyard");

  // death card data: the fixed template's fields, all present
  if (dead.name !== "smoke-ash-1") fail(`death card name: ${dead.name}`);
  if (dead.cause !== "ttl") fail(`death card cause: ${dead.cause}`);
  if (typeof dead.lived_seconds !== "number" || dead.lived_seconds < ttl - tickSeconds * 2) {
    fail(`death card lived_seconds implausible: ${dead.lived_seconds}`);
  }
  if (typeof dead.final_words !== "string") fail("death card final_words missing");
  if (!/^[0-9a-f]{64}$/.test(dead.receipt ?? "")) fail(`death card receipt malformed: ${dead.receipt}`);
  ok(`death card: ${dead.name}, lived ${dead.lived_seconds}s, cause ${dead.cause}, receipt ${dead.receipt.slice(0, 8)}…`);

  // the receipt is recomputable from the event itself, and the runtime
  // teardown receipt rides in the payload
  const recent = await (await fetch(`${base}/recent`)).json();
  const death = recent.events.find((e) => e.kind === "death");
  if (!death) throw new Error("death event missing from the public stream");
  if (death.primitive !== "identity.destroy()") fail(`death primitive: ${death.primitive}`);
  if (!verifyReceipt(death)) fail("death event receipt does not verify");
  else ok("death event receipt recomputes and verifies");
  if (!/^[0-9a-f]{64}$/.test(death.payload.receipt ?? "")) fail("runtime teardown receipt missing from payload");
  else ok("runtime teardown receipt present in payload");

  // graveyard freeze: archive reads forever, every write refuses
  const archive = await fetch(`${base}/t/smoke-ash-1/`);
  if (archive.status !== 200) fail(`frozen archive not readable: ${archive.status}`);
  const archiveHtml = await archive.text();
  if (!archiveHtml.includes("frozen read-only")) fail("archive page does not state the freeze");
  else ok("terrarium archive frozen and readable");
  const posts = await (await fetch(`${base}/t/smoke-ash-1/`)).text();
  const postMatch = /\/posts\/(pst_[A-Za-z0-9]+)/.exec(posts);
  if (postMatch) {
    const comment = await fetch(`${base}/t/smoke-ash-1/posts/${postMatch[1]}/comments`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ author: "smoke", body: "anyone home" }).toString(),
    });
    if (comment.status !== 410) fail(`comment on frozen archive got ${comment.status}, wanted 410`);
    else ok("comments on the frozen archive refuse with 410");
  } else {
    ok("no posts published in this short life; freeze verified at tenant level");
  }

  if (process.exitCode !== 1) {
    console.log("smoke-death: PASS — the full ritual executed cleanly; safe to let the real ash live");
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  await service.stop();
  rmSync(root, { recursive: true, force: true });
}
