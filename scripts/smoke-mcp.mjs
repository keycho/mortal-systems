// boots the BUILT mcp server exactly as an agent host would — node dist/cli.js
// on stdio against a real runtime child process — and exercises the mcp
// handshake, tools/list, capabilities, and a typed refusal. this is the same
// discipline as smoke-mortal-cli.mjs: it catches broken dist output and
// module-graph breaks that vitest cannot see, and it proves the honesty
// surface through the real protocol without needing a browser. capability
// assertions compare against the schema's own derived lists, never a pinned
// snapshot: drift still fails; a legitimate enforcement flip with its test
// does not.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeCli = path.join(repo, "packages/runtime/dist/cli.js");
const mcpCli = path.join(repo, "packages/mcp/dist/cli.js");
const schemaDist = path.join(repo, "packages/schema/dist/index.js");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "mortal-smoke-mcp-"));

const fail = (message) => {
  console.error(`mcp smoke: FAIL — ${message}`);
  process.exit(1);
};

if (!fs.existsSync(runtimeCli)) fail(`built runtime cli missing at ${runtimeCli}`);
if (!fs.existsSync(mcpCli)) fail(`built mcp cli missing at ${mcpCli}`);
if (!fs.existsSync(schemaDist)) fail(`built schema missing at ${schemaDist}`);

const { ENFORCED_FIELDS, ADVISORY_FIELDS, ROADMAP_FIELDS } = await import(schemaDist);
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const runtimeChild = spawn(
  process.execPath,
  [runtimeCli, "serve", "--root", root, "--seed-first-party"],
  { stdio: ["ignore", "ignore", "pipe"] }
);
let runtimeStderr = "";
runtimeChild.stderr.on("data", (chunk) => (runtimeStderr += chunk));

let mcpChild = null;
const cleanup = () => {
  try {
    if (mcpChild && mcpChild.exitCode === null) mcpChild.kill("SIGKILL");
  } catch {}
  try {
    if (runtimeChild.exitCode === null) runtimeChild.kill("SIGKILL");
  } catch {}
  fs.rmSync(root, { recursive: true, force: true });
};

try {
  // wait for the runtime to be serving (it writes runtime.json + admin.token)
  const deadline = Date.now() + 30_000;
  while (
    !fs.existsSync(path.join(root, "runtime.json")) ||
    !fs.existsSync(path.join(root, "admin.token"))
  ) {
    if (runtimeChild.exitCode !== null) {
      fail(`runtime exited early (${runtimeChild.exitCode}). stderr:\n${runtimeStderr}`);
    }
    if (Date.now() > deadline) fail(`runtime.json never appeared. stderr:\n${runtimeStderr}`);
    await new Promise((r) => setTimeout(r, 200));
  }

  // boot the mcp server on stdio, as an agent host would
  mcpChild = spawn(process.execPath, [mcpCli, "--root", root], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let mcpStderr = "";
  mcpChild.stderr.on("data", (chunk) => (mcpStderr += chunk));
  const mcpExited = new Promise((resolve) => mcpChild.once("exit", (code) => resolve(code)));

  const pending = new Map();
  const rl = readline.createInterface({ input: mcpChild.stdout });
  rl.on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  let nextId = 1;
  const request = (method, params) =>
    Promise.race([
      new Promise((resolve) => {
        const id = nextId++;
        pending.set(id, resolve);
        mcpChild.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      }),
      mcpExited.then((code) => fail(`mcp server exited (${code}) mid-request. stderr:\n${mcpStderr}`)),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${method} timed out`)), 20_000)),
    ]);
  const notify = (method, params) =>
    mcpChild.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  const toolResult = (res) => {
    const text = res.result?.content?.[0]?.text;
    if (text === undefined) fail(`tool call returned ${JSON.stringify(res)}`);
    return { isError: res.result.isError === true, payload: JSON.parse(text) };
  };

  // mcp handshake
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mortal-smoke", version: "0.0.0" },
  });
  if (!init.result?.serverInfo?.name || init.result.serverInfo.name !== "mortal") {
    fail(`initialize returned ${JSON.stringify(init)}`);
  }
  notify("notifications/initialized", {});

  // the eight v1 tools are present — exactly these, nothing broader
  const toolsRes = await request("tools/list", {});
  const names = (toolsRes.result?.tools ?? []).map((t) => t.name).sort();
  const expected = [
    "blueprint_list",
    "capabilities",
    "identity_call_tool",
    "identity_create",
    "identity_destroy",
    "identity_launch",
    "identity_status",
    "identity_tools",
  ];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    fail(`tools/list returned [${names.join(", ")}]`);
  }

  // capabilities answers with the schema's own derived lists over a real runtime
  const capsRes = await request("tools/call", { name: "capabilities", arguments: {} });
  const { isError: capsErr, payload: caps } = toolResult(capsRes);
  if (capsErr) fail(`capabilities errored: ${JSON.stringify(caps)}`);
  if (!sameSet(caps.enforceable ?? [], ENFORCED_FIELDS)) {
    fail(`capabilities.enforceable !== schema ENFORCED_FIELDS: ${JSON.stringify(caps.enforceable)}`);
  }
  if (!sameSet(caps.advisory ?? [], ADVISORY_FIELDS)) {
    fail(`capabilities.advisory !== schema ADVISORY_FIELDS: ${JSON.stringify(caps.advisory)}`);
  }
  if (!sameSet(caps.roadmap ?? [], ROADMAP_FIELDS)) {
    fail(`capabilities.roadmap !== schema ROADMAP_FIELDS: ${JSON.stringify(caps.roadmap)}`);
  }
  if (typeof caps.conditional?.["permissions.network"] !== "string") {
    fail(`conditional enforcement for network is missing: ${JSON.stringify(caps.conditional)}`);
  }
  if (typeof caps.conditional?.["permissions.tools"] !== "string") {
    fail(`conditional enforcement for tools is missing: ${JSON.stringify(caps.conditional)}`);
  }
  if (!Array.isArray(caps.nonGuarantees) || caps.nonGuarantees.length === 0) {
    fail("capabilities ships no non-guarantees");
  }

  // a fabricated id refuses with a typed NOT_FOUND through the built server
  const ghostRes = await request("tools/call", {
    name: "identity_status",
    arguments: { id: "idn_smokedoesnotexist00" },
  });
  const ghost = toolResult(ghostRes);
  if (!ghost.isError) fail(`ghost identity_status did not error: ${JSON.stringify(ghost.payload)}`);
  if (ghost.payload.error?.code !== "NOT_FOUND") {
    fail(`ghost refusal is not typed NOT_FOUND: ${JSON.stringify(ghost.payload)}`);
  }

  console.log(
    "mcp smoke: OK — built cli boots on stdio, handshake + tools/list answer over a real runtime, " +
      "capabilities === schema-derived lists (conditional enforcement stated), unknown ids refuse with typed NOT_FOUND"
  );
} catch (err) {
  fail(err instanceof Error ? err.stack ?? err.message : String(err));
} finally {
  cleanup();
}
process.exit(0);
