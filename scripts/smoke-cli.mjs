// boots the BUILT cli exactly as a user would — node dist/cli.js against a
// clean root — and exercises health, admin rpc, and the first-party seed.
// this catches broken dist output and module-graph breaks that vitest cannot
// see (turbo rebuilds workspace deps before every test run, so tests never
// meet a stale artifact; the post-rename ERR_MODULE_NOT_FOUND did exactly
// that in dev on macos).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repo, "packages/runtime/dist/cli.js");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "mortal-smoke-cli-"));

const fail = (message) => {
  console.error(`cli smoke: FAIL — ${message}`);
  process.exit(1);
};

if (!fs.existsSync(cli)) fail(`built cli missing at ${cli} (run turbo build first)`);

const child = spawn(process.execPath, [cli, "serve", "--root", root, "--seed-first-party"], {
  stdio: ["ignore", "ignore", "pipe"],
});
let stderr = "";
child.stderr.on("data", (chunk) => (stderr += chunk));
const exited = new Promise((resolve) => child.once("exit", (code) => resolve(code)));

const cleanup = () => {
  try {
    if (child.exitCode === null) child.kill("SIGKILL");
  } catch {}
  fs.rmSync(root, { recursive: true, force: true });
};

try {
  // the runtime writes runtime.json + admin.token once it is actually serving
  const metaPath = path.join(root, "runtime.json");
  const deadline = Date.now() + 30_000;
  while (!fs.existsSync(metaPath) || !fs.existsSync(path.join(root, "admin.token"))) {
    if (child.exitCode !== null) {
      fail(`cli exited early (${child.exitCode}). stderr:\n${stderr}`);
    }
    if (Date.now() > deadline) fail(`runtime.json never appeared. stderr:\n${stderr}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  const { port } = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const { token } = JSON.parse(fs.readFileSync(path.join(root, "admin.token"), "utf8"));

  const health = await (await fetch(`http://127.0.0.1:${port}/v1/health`)).json();
  if (health.ok !== true || health.service !== "mortal-runtime") {
    fail(`health said ${JSON.stringify(health)}`);
  }

  const rpc = async (method, params = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ method, params }),
    });
    const body = await res.json();
    if (!body.ok) fail(`${method} -> ${body.error.code}: ${body.error.message}`);
    return body.result;
  };

  const status = await rpc("runtime.status");
  if (!status.version) fail("runtime.status carried no version");
  const blueprints = await rpc("blueprint.list");
  if (blueprints.length !== 3) {
    fail(`--seed-first-party installed ${blueprints.length} blueprints, expected 3`);
  }

  child.kill("SIGTERM");
  const code = await Promise.race([exited, new Promise((r) => setTimeout(() => r("timeout"), 10_000))]);
  if (code !== 0) fail(`clean shutdown expected exit 0, got ${code}`);

  console.log(
    `cli smoke: OK — booted dist/cli.js, health + status + seeded ${blueprints.length} blueprints, clean shutdown`
  );
} finally {
  cleanup();
}
