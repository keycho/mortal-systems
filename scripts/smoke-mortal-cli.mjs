// boots the BUILT mortal cli exactly as a user would — node dist/cli.js with
// MORTAL_ROOT pointing at a clean fixture runtime — and drives the full loop:
// status, create, launch (real browser), list, destroy, capabilities. asserts
// exit codes, the stable --json shapes, stdout/stderr separation, and the
// honesty invariants (enforcement labels, untrimmed destruction caveats).
// like scripts/smoke-cli.mjs, this catches broken dist output and module-graph
// breaks that vitest cannot see, because turbo rebuilds deps before tests.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeCli = path.join(repo, "packages/runtime/dist/cli.js");
const mortalCli = path.join(repo, "packages/cli/dist/cli.js");
const schemaDist = path.join(repo, "packages/schema/dist/index.js");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "mortal-smoke-mortal-cli-"));

const fail = (message) => {
  console.error(`mortal cli smoke: FAIL — ${message}`);
  process.exit(1);
};

for (const built of [runtimeCli, mortalCli, schemaDist]) {
  if (!fs.existsSync(built)) fail(`built artifact missing at ${built} (run turbo build first)`);
}
// the caveat list asserted below is the schema's own, not a copy
const { DESTRUCTION_CAVEATS, ENFORCED_FIELDS, ADVISORY_FIELDS, ROADMAP_FIELDS, RESERVED_METHODS } =
  await import(schemaDist);

const env = { ...process.env, MORTAL_ROOT: root, MORTAL_HEADLESS: "1" };
const bundledChromium = "/opt/pw-browsers/chromium";
if (!env.MORTAL_BROWSER_PATH && fs.existsSync(bundledChromium)) {
  env.MORTAL_BROWSER_PATH = bundledChromium;
}

// seeded so the blueprints leg gates real data, exactly as runtime smoke does
const runtime = spawn(process.execPath, [runtimeCli, "serve", "--root", root, "--seed-first-party"], {
  stdio: ["ignore", "ignore", "pipe"],
  env,
});
let runtimeStderr = "";
runtime.stderr.on("data", (chunk) => (runtimeStderr += chunk));
const runtimeExited = new Promise((resolve) => runtime.once("exit", (code) => resolve(code)));

const cleanup = () => {
  try {
    if (runtime.exitCode === null) runtime.kill("SIGKILL");
  } catch {}
  fs.rmSync(root, { recursive: true, force: true });
};

/** run the built mortal bin; stdin is a pipe, so it is never a tty */
const mortal = (args, { expect = 0, timeout = 210_000 } = {}) => {
  const res = spawnSync(process.execPath, [mortalCli, ...args], {
    env,
    encoding: "utf8",
    timeout,
  });
  if (res.error) fail(`mortal ${args.join(" ")} did not run: ${res.error.message}`);
  if (res.status !== expect) {
    fail(
      `mortal ${args.join(" ")} exited ${res.status}, expected ${expect}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`
    );
  }
  return res;
};

const json = (res, what) => {
  try {
    return JSON.parse(res.stdout);
  } catch {
    fail(`${what} stdout is not json:\n${res.stdout}`);
  }
};

try {
  // the runtime writes runtime.json + admin.token once it is actually serving
  const deadline = Date.now() + 30_000;
  while (!fs.existsSync(path.join(root, "runtime.json")) || !fs.existsSync(path.join(root, "admin.token"))) {
    if (runtime.exitCode !== null) {
      fail(`fixture runtime exited early (${runtime.exitCode}). stderr:\n${runtimeStderr}`);
    }
    if (Date.now() > deadline) fail(`runtime.json never appeared. stderr:\n${runtimeStderr}`);
    await new Promise((r) => setTimeout(r, 200));
  }

  // -- version + status ------------------------------------------------------
  if (mortal(["--version"]).stdout.trim().length === 0) fail("--version printed nothing");
  mortal(["status"]); // human table path, piped (no tty)
  const status = json(mortal(["status", "--json"]), "status --json");
  if (!status.version) fail("status --json carried no version");
  if (status.defaultBrowser === null) {
    fail(`no browser detected — the launch leg of this smoke needs chromium/chrome/brave or MORTAL_BROWSER_PATH`);
  }

  // -- blueprints ------------------------------------------------------------
  mortal(["blueprints"]); // human path
  const blueprints = json(mortal(["blueprints", "--json"]), "blueprints --json");
  if (blueprints.length !== 3) fail(`expected the 3 seeded first-party blueprints, got ${blueprints.length}`);
  for (const bp of blueprints) {
    if (!bp.id?.startsWith("bpt_")) fail(`blueprint with bad id: ${bp.id}`);
    if (bp.permissions?.wallet?.enforcement !== "advisory") fail(`${bp.name}: wallet must read advisory`);
    if (bp.permissions?.email?.enforcement !== "roadmap") fail(`${bp.name}: email must read roadmap`);
    if (bp.permissions?.filesystem?.enforcement !== "enforced") fail(`${bp.name}: filesystem must read enforced`);
    if (bp.privacy?.retainHistory?.enforcement !== "enforced") fail(`${bp.name}: retainHistory must read enforced`);
  }

  // -- create ----------------------------------------------------------------
  const created = json(mortal(["create", "research", "--lifetime", "15m", "--json"]), "create --json");
  const id = created.summary?.id;
  if (typeof id !== "string" || !id.startsWith("idn_")) fail(`create returned bad id: ${id}`);
  if (created.summary.lifetime !== "15m") fail(`create lifetime was ${created.summary.lifetime}`);
  if (created.manifest?.permissions?.wallet?.enforcement !== "advisory") {
    fail("create manifest lost the wallet advisory enforcement label");
  }
  // a second, persistent identity: proves destroy touches exactly one identity
  const kept = json(mortal(["create", "audit-notes", "--lifetime", "persistent", "--json"]), "create #2");
  const keptId = kept.summary?.id;

  // the --blueprint path, resolved by name like a user would type it
  const fromBp = json(
    mortal(["create", "contract-review", "--blueprint", "Client Operations", "--json"]),
    "create --blueprint"
  );
  if (!fromBp.summary?.blueprint?.source?.includes("first-party")) {
    fail(`create --blueprint did not record the blueprint ref: ${JSON.stringify(fromBp.summary?.blueprint)}`);
  }

  // invalid lifetime: usage error, exit 2, nothing on stdout
  const badLifetime = mortal(["create", "tmp", "--lifetime", "1h30m"], { expect: 2 });
  if (badLifetime.stdout.length !== 0) fail("usage errors must not write to stdout");
  if (!badLifetime.stderr.includes('expected "persistent" or <integer><s|m|h|d>')) {
    fail(`lifetime error did not carry the schema's grammar message:\n${badLifetime.stderr}`);
  }

  // -- launch (real browser) -------------------------------------------------
  const launched = json(mortal(["launch", "research", "--json"]), "launch --json");
  const launchKeys = JSON.stringify(Object.keys(launched));
  if (launchKeys !== JSON.stringify(["id", "name", "state", "pid", "cdpEndpoint", "expiresAt"])) {
    fail(`launch --json shape drifted: ${launchKeys}`);
  }
  if (launched.state !== "running") fail(`launch left state ${launched.state}`);
  if (!/^ws:\/\/127\.0\.0\.1:\d+\//.test(launched.cdpEndpoint ?? "")) {
    fail(`cdp endpoint is not a loopback websocket: ${launched.cdpEndpoint}`);
  }

  // -- list ------------------------------------------------------------------
  const listed = json(mortal(["list", "--json"]), "list --json");
  const row = listed.find((s) => s.id === id);
  if (!row || row.state !== "running") fail(`list did not show ${id} running`);
  mortal(["list"]); // human table path

  // -- show ------------------------------------------------------------------
  mortal(["show", "research"]); // human path
  const shown = json(mortal(["show", "research", "--json"]), "show --json");
  if (JSON.stringify(Object.keys(shown)) !== JSON.stringify(["summary", "manifest", "activity"])) {
    fail(`show --json shape drifted: ${JSON.stringify(Object.keys(shown))}`);
  }
  if (shown.summary?.id !== id) fail(`show resolved the wrong identity: ${shown.summary?.id}`);
  if (shown.manifest?.permissions?.memoryScope?.enforcement !== "enforced") {
    fail("show manifest lost the memoryScope enforced label");
  }
  if (!Array.isArray(shown.activity) || shown.activity.length === 0) fail("show carried no activity");

  // -- suspend / resume ------------------------------------------------------
  const suspended = json(mortal(["suspend", "research", "--json"]), "suspend --json");
  if (suspended.state !== "suspended") fail(`suspend left state ${suspended.state}`);
  if (!json(mortal(["list", "--state", "suspended", "--json"]), "list --state suspended").some((s) => s.id === id)) {
    fail("suspended identity missing from --state suspended");
  }
  const resumed = json(mortal(["resume", "research", "--json"]), "resume --json");
  if (JSON.stringify(Object.keys(resumed)) !== JSON.stringify(["id", "name", "state", "pid", "cdpEndpoint", "expiresAt"])) {
    fail(`resume --json shape drifted: ${JSON.stringify(Object.keys(resumed))}`);
  }
  if (resumed.state !== "running") fail(`resume left state ${resumed.state}`);
  if (!/^ws:\/\/127\.0\.0\.1:\d+\//.test(resumed.cdpEndpoint ?? "")) {
    fail(`resume returned a bad cdp endpoint: ${resumed.cdpEndpoint}`);
  }

  // -- destroy: gate first, then the receipt --------------------------------
  const refused = mortal(["destroy", "audit-notes"], { expect: 2 });
  if (refused.stdout.length !== 0) fail("destroy refusal must not write to stdout");
  if (!refused.stderr.includes("--yes")) fail("destroy refusal did not mention --yes");
  if (!json(mortal(["list", "--json"]), "list after refusal").some((s) => s.id === keptId)) {
    fail("refused destroy still removed the identity");
  }

  const report = json(mortal(["destroy", "research", "--yes", "--json"]), "destroy --json");
  if (report.identityId !== id) fail(`destroy report is for ${report.identityId}, expected ${id}`);
  const steps = report.steps.map((s) => s.step).join(",");
  if (steps !== "D0,D1,D2,D3,D4,D5,D6,D7") fail(`destroy steps were ${steps}`);
  if (!report.steps.every((s) => s.ok === true)) fail(`destroy had failing steps: ${JSON.stringify(report.steps)}`);
  if (JSON.stringify(report.caveats) !== JSON.stringify([...DESTRUCTION_CAVEATS])) {
    fail("destruction caveats were trimmed or reworded — they must match the schema verbatim");
  }

  const after = json(mortal(["list", "--json"]), "list after destroy");
  if (after.some((s) => s.id === id)) fail("destroyed identity still in the default list view");
  if (!after.some((s) => s.id === keptId)) fail("destroy touched the persistent identity");
  const tombstones = json(mortal(["list", "--state", "destroyed", "--json"]), "list --state destroyed");
  if (!tombstones.some((s) => s.id === id && s.state === "destroyed")) {
    fail("tombstone missing from --state destroyed");
  }
  // a destroyed identity shows only its tombstone: manifest gone, honestly null
  const tomb = json(mortal(["show", id, "--json"]), "show destroyed --json");
  if (tomb.manifest !== null) fail("destroyed identity still carried a manifest in show");

  // -- pipelines: closing the read end must not crash the cli ----------------
  const piped = spawnSync(
    "sh",
    ["-c", `${JSON.stringify(process.execPath)} ${JSON.stringify(mortalCli)} list | head -1`],
    { env, encoding: "utf8", timeout: 60_000 }
  );
  if (piped.status !== 0) fail(`mortal list | head -1 exited ${piped.status}`);
  if (piped.stderr.includes("EPIPE")) fail(`piping to head crashed with EPIPE:\n${piped.stderr}`);

  // -- capabilities: the honesty surface ------------------------------------
  // asserted against the schema's own derived lists, not a pinned snapshot:
  // capability drift from the schema fails; legitimate schema evolution
  // (e.g. an enforcement flip with its test) does not.
  const caps = json(mortal(["capabilities", "--json"]), "capabilities --json");
  const sameSet = (a, b) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...b].sort());
  if (!sameSet(caps.enforceable, ENFORCED_FIELDS)) {
    fail(`capabilities.enforceable drifted from the schema: ${JSON.stringify(caps.enforceable)}`);
  }
  if (!sameSet(caps.advisory, ADVISORY_FIELDS)) {
    fail(`capabilities.advisory drifted from the schema: ${JSON.stringify(caps.advisory)}`);
  }
  if (!sameSet(caps.roadmap, ROADMAP_FIELDS)) {
    fail(`capabilities.roadmap drifted from the schema: ${JSON.stringify(caps.roadmap)}`);
  }
  if (!sameSet(caps.reservedMethods, RESERVED_METHODS)) {
    fail(`capabilities.reservedMethods drifted from the schema: ${JSON.stringify(caps.reservedMethods)}`);
  }
  if (!caps.enforceable.includes("surfaces.browser.isolation")) {
    fail("browser isolation must always be enforceable — structural sanity");
  }

  // -- clean shutdown of the fixture ----------------------------------------
  runtime.kill("SIGTERM");
  const code = await Promise.race([runtimeExited, new Promise((r) => setTimeout(() => r("timeout"), 10_000))]);
  if (code !== 0) fail(`fixture runtime clean shutdown expected exit 0, got ${code}`);

  console.log(
    "mortal cli smoke: OK — booted dist/cli.js against a clean fixture runtime; every user-facing command gated: status, blueprints (enforcement honest), create (+grammar error, +--blueprint), launch (real browser, stable json shape), list, show (live + tombstone), suspend, resume, destroy (gate + full receipt, caveats verbatim), capabilities, piped output; clean shutdown"
  );
} finally {
  cleanup();
}
