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
const { DESTRUCTION_CAVEATS } = await import(schemaDist);

const env = { ...process.env, MORTAL_ROOT: root, MORTAL_HEADLESS: "1" };
const bundledChromium = "/opt/pw-browsers/chromium";
if (!env.MORTAL_BROWSER_PATH && fs.existsSync(bundledChromium)) {
  env.MORTAL_BROWSER_PATH = bundledChromium;
}

const runtime = spawn(process.execPath, [runtimeCli, "serve", "--root", root], {
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

  // -- capabilities: the honesty surface ------------------------------------
  const caps = json(mortal(["capabilities", "--json"]), "capabilities --json");
  for (const [group, field] of [
    ["enforceable", "surfaces.browser.isolation"],
    ["enforceable", "lifecycle.destruction"],
    ["advisory", "permissions.wallet"],
    ["advisory", "permissions.network"],
    ["roadmap", "permissions.email"],
  ]) {
    if (!caps[group]?.includes(field)) fail(`capabilities.${group} lost "${field}"`);
  }
  if (!caps.reservedMethods?.includes("identity.attachNetworkRoute")) {
    fail("capabilities lost the reserved-method list");
  }

  // -- clean shutdown of the fixture ----------------------------------------
  runtime.kill("SIGTERM");
  const code = await Promise.race([runtimeExited, new Promise((r) => setTimeout(() => r("timeout"), 10_000))]);
  if (code !== 0) fail(`fixture runtime clean shutdown expected exit 0, got ${code}`);

  console.log(
    "mortal cli smoke: OK — booted dist/cli.js against a clean fixture runtime; status, create (+grammar error), launch (real browser, stable json shape), list, destroy (gate + full receipt, caveats verbatim), capabilities; clean shutdown"
  );
} finally {
  cleanup();
}
