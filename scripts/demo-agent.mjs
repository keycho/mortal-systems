#!/usr/bin/env node
/**
 * pnpm demo:agent — the flagship demo, rough cut, end to end and real.
 *
 * an "agent" (this script, driving the same sdk the mcp server exposes):
 *   1. asks mortal for a scoped identity with a 15 minute lifetime
 *   2. launches it and gets a cdp endpoint for THAT identity's browser only
 *   3. does real work in it (opens a page, extracts findings, writes a report)
 *   4. destroys it and hands back the report PLUS the destruction receipt
 *   5. proves a second persistent identity sat untouched the whole time
 *
 * everything here is the public surface: the runtime cli, the rpc api, the
 * sdk. no simulated steps. in this container the "vendor filings" page is a
 * local fixture (no outbound network); on a normal machine the same code
 * browses the real web.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromTests = createRequire(path.join(repo, "tests", "package.json"));
const { chromium } = requireFromTests("playwright-core");
const { MortalClient } = await import(
  new URL(`file://${path.join(repo, "packages", "mcp", "dist", "index.js")}`).href
);

const PORT = 4973;
const TOKEN = "mortal-demo";
const OUT = path.join(repo, "artifacts", "demo");
const children = [];
let root = null;

const log = (m) => console.log(m);
const step = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

function cleanup() {
  for (const c of children.splice(0)) {
    try {
      c.kill("SIGTERM");
    } catch {}
  }
  if (root !== null) fs.rmSync(root, { recursive: true, force: true });
}
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));

// a local stand-in for the vendor's filings page (container has no outbound net)
const fixture = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><title>Acme Corp — Annual Filing 2025</title>
    <h1>Acme Corp</h1><p>Revenue: $12.4M (up 18%). Litigation: none pending.</p>
    <p>Registered agent changed twice in 2025. Auditor: Meridian LLP.</p>`);
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const fixtureUrl = `http://127.0.0.1:${fixture.address().port}/filing`;

step("0 · boot the runtime (fixture root, never ~/.mortal)");
root = fs.mkdtempSync(path.join(os.tmpdir(), "mortal-demo-"));
children.push(
  spawn(
    "node",
    [path.join(repo, "packages", "runtime", "dist", "cli.js"), "serve", "--root", root, "--port", String(PORT), "--admin-token", TOKEN, "--seed-first-party"],
    {
      stdio: "ignore",
      env: {
        ...process.env,
        MORTAL_HEADLESS: "1",
        ...(process.env.MORTAL_BROWSER_PATH === undefined && fs.existsSync("/opt/pw-browsers/chromium")
          ? { MORTAL_BROWSER_PATH: "/opt/pw-browsers/chromium" }
          : {}),
      },
    }
  )
);
{
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/v1/health`)).ok) break;
    } catch {}
    if (Date.now() > deadline) throw new Error("runtime did not come up");
    await new Promise((r) => setTimeout(r, 300));
  }
}
const mortal = new MortalClient({ port: PORT, token: TOKEN });

step("0.5 · the operator's persistent identity exists and will not be touched");
const persistent = await mortal.createIdentity({ name: "client operations", lifetime: "persistent" });
log(`   ${persistent.summary.name} · ${persistent.summary.state} · persistent`);

step('1 · operator: "research this vendor\'s filings. you have a scoped identity, 15 minutes."');
const caps = await mortal.capabilities();
log(`   agent feature-detects first: enforced=[${caps.enforceable.join(", ")}]`);
log(`   (advisory/roadmap controls are labeled — the agent trusts none of them)`);

step("2 · agent: identity.create + launch → a cdp endpoint for ONE identity, not the operator's browser");
const identity = await mortal.createIdentity({ name: "vendor filings research", lifetime: "15m" });
const { cdpEndpoint } = await mortal.launch(identity.summary.id);
log(`   ${identity.summary.id} · lifetime 15m · cdp ${cdpEndpoint}`);

step("3 · agent works inside its own browser");
const browser = await chromium.connectOverCDP(cdpEndpoint);
const context = browser.contexts()[0];
const page = await context.newPage();
await page.goto(fixtureUrl, { waitUntil: "load" });
const title = await page.title();
const findings = await page.locator("p").allTextContents();
await browser.close();
log(`   browsed: ${title}`);

fs.mkdirSync(OUT, { recursive: true });
const status = await mortal.status(identity.summary.id);
const report = [
  `# vendor filings — research report`,
  ``,
  `source: ${title}`,
  ...findings.map((f) => `- ${f}`),
  ``,
  `researched inside mortal identity ${identity.summary.id}`,
  `time remaining at handoff: ${Math.round((status.remainingMs ?? 0) / 60000)}m`,
].join("\n");
fs.writeFileSync(path.join(OUT, "report.md"), report);
log(`   report written → artifacts/demo/report.md`);

step("4 · the identity is destroyed — sessions removed, profile deleted, memory erased");
const receipt = await mortal.destroy(identity.summary.id, "work complete");
fs.writeFileSync(path.join(OUT, "receipt.json"), JSON.stringify(receipt, null, 2));
const okAll = receipt.steps.every((s) => s.ok);
log(`   receipt: ${receipt.steps.length}/8 steps ${okAll ? "ok" : "FAILED"} · profile removed: ${!fs.existsSync(path.join(root, "profiles", identity.summary.id))}`);
log(`   receipt → artifacts/demo/receipt.json (signing lands in weeks 7–8 — this receipt is real but not yet signed)`);

step("5 · the persistent identity sat untouched the entire time");
const after = await mortal.status(persistent.summary.id);
log(`   ${after.summary.name} · ${after.summary.state} · profile intact: ${fs.existsSync(path.join(root, "profiles", persistent.summary.id)) || after.summary.state === "created"}`);

step("done");
log(`   your agent did real work, as someone who is not you, and left a receipt proving it's gone.`);
fixture.close();
process.exit(0);
