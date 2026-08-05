#!/usr/bin/env node
/**
 * pnpm screenshots — the showcase capture pipeline.
 *
 * boots the real runtime + manager dev stack against a dedicated throwaway
 * fixture root (never ~/.mortal), provisions the showcase state through the
 * public rpc surface, and captures real app renders with playwright at
 * 1600x1000. these images are what the marketing site embeds — regenerate
 * whenever the manager ui changes.
 *
 * showcase state (neutral by design — mortal is a general identity runtime,
 * not crypto tooling; these are the marketing images):
 *   - client operations        persistent, prepared (first-party blueprint)
 *   - vendor audit             running, ~18m remaining of a 45m lifetime
 *   - vendor audit             destroyed, complete destruction receipt
 *
 * the ~18m remaining is staged by moving the real expires_at/fire_at rows the
 * same way the scheduler tests do — the runtime then honors that deadline for
 * real. everything else is ordinary rpc calls.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(repo, "artifacts", "screenshots");
const RUNTIME_PORT = 4941;
const VITE_PORT = 5199;
const TOKEN = "mortal-screenshots";
const VIEWPORT = { width: 1600, height: 1000 };

const requireFromTests = createRequire(path.join(repo, "tests", "package.json"));
const requireFromRuntime = createRequire(path.join(repo, "packages", "runtime", "package.json"));
const { chromium } = requireFromTests("playwright-core");

const children = [];
let fixtureRoot = null;

function log(msg) {
  console.log(`[screenshots] ${msg}`);
}

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: "inherit", cwd: repo, ...opts });
  return new Promise((resolve, reject) => {
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))
    );
  });
}

function spawnBackground(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: "ignore", cwd: repo, detached: false, ...opts });
  children.push(child);
  return child;
}

async function waitFor(fn, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function rpc(method, params) {
  const res = await fetch(`http://127.0.0.1:${RUNTIME_PORT}/v1/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ method, params }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`${method}: ${body.error.code} ${body.error.message}`);
  return body.result;
}

function cleanup() {
  for (const child of children.splice(0)) {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
  if (fixtureRoot !== null) {
    try {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
      log(`fixture root removed (${fixtureRoot})`);
    } catch {}
    fixtureRoot = null;
  }
}
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

async function main() {
  // 0. fresh builds for everything the stack resolves
  log("building runtime + deps via turbo");
  await run("pnpm", ["turbo", "run", "build", "--filter=@mortal/runtime", "--filter=@mortal/blueprints"]);

  // 1. dedicated fixture root — created here, destroyed on exit, never ~/.mortal
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mortal-screenshots-"));
  log(`fixture root ${fixtureRoot}`);

  const env = {
    ...process.env,
    MORTAL_HEADLESS: "1",
    ...(process.env.MORTAL_BROWSER_PATH === undefined && fs.existsSync("/opt/pw-browsers/chromium")
      ? { MORTAL_BROWSER_PATH: "/opt/pw-browsers/chromium" }
      : {}),
  };

  // 2. runtime against the fixture root
  log("starting runtime");
  spawnBackground(
    "node",
    [
      path.join(repo, "packages", "runtime", "dist", "cli.js"),
      "serve",
      "--root",
      fixtureRoot,
      "--port",
      String(RUNTIME_PORT),
      "--admin-token",
      TOKEN,
      "--seed-first-party",
    ],
    { env }
  );
  await waitFor(async () => (await rpc("runtime.status", {})) !== null, "runtime");

  // 3. manager dev server, proxying to the fixture runtime
  log("starting manager dev server");
  spawnBackground("npx", ["vite", "--port", String(VITE_PORT), "--strictPort"], {
    cwd: path.join(repo, "apps", "manager"),
    env: { ...env, MORTAL_PORT: String(RUNTIME_PORT), VITE_MORTAL_TOKEN: TOKEN },
  });
  await waitFor(
    async () => (await fetch(`http://127.0.0.1:${VITE_PORT}/`)).ok,
    "manager dev server"
  );

  // 4. showcase state through the public rpc surface
  log("provisioning showcase state");
  const blueprints = await rpc("blueprint.list", {});
  const bySource = (src) => {
    const found = blueprints.find((b) => b.source === src);
    if (found === undefined) throw new Error(`blueprint ${src} not seeded`);
    return found;
  };
  const clientOps = bySource("first-party:client-operations");

  // the neutral showcase blueprint, installed through the real validation
  // pipeline — a general research/audit identity, deliberately not crypto
  const vendorAudit = {
    schemaVersion: "2.0",
    blueprintVersion: "1.0.0",
    name: "Vendor Audit",
    description:
      "an isolated, time-limited environment for auditing a vendor or counterparty. expires and destroys itself when the audit is done; browsing history is not retained (enforced).",
    category: "research",
    recommendedLifetime: "12h",
    theme: "#4DA3FF",
    lifecycle: { onExpiry: "destroy" },
    bookmarks: [
      { title: "OpenCorporates", url: "https://opencorporates.com" },
      { title: "SEC EDGAR", url: "https://www.sec.gov/edgar/search/" },
      { title: "Trustpilot", url: "https://www.trustpilot.com" },
      { title: "Wayback Machine", url: "https://web.archive.org" },
    ],
    ai: {
      systemInstructions:
        "act as a careful vendor auditor. separate documented facts from inference, cite the source page for every claim, and flag anything you could not verify.",
    },
    permissions: {
      wallet: { value: "none", enforcement: "advisory" },
      network: { value: "standard", enforcement: "advisory" },
      email: { value: "none", enforcement: "roadmap" },
    },
    privacy: { retainHistory: { value: false, enforcement: "enforced" } },
    publisher: { id: "mortal.first-party", reviewTier: "standard" },
  };
  const { blueprintId: vendorAuditId } = await rpc("blueprint.install", {
    manifestJson: JSON.stringify(vendorAudit),
    source: "showcase:vendor-audit",
  });

  await rpc("identity.createFromBlueprint", { blueprintId: clientOps.id, overrides: {} });

  const running = await rpc("identity.createFromBlueprint", {
    blueprintId: vendorAuditId,
    overrides: { lifetime: "45m" },
  });
  // stage ~18m remaining on the 45m lifetime: move the real deadline rows the
  // same way the scheduler tests do; the runtime honors the new deadline.
  {
    const Database = requireFromRuntime("better-sqlite3");
    const db = new Database(path.join(fixtureRoot, "mortal.db"));
    const fireAt = new Date(Date.now() + 18 * 60_000).toISOString();
    db.prepare("UPDATE identities SET expires_at = ? WHERE id = ?").run(fireAt, running.id);
    db.prepare("UPDATE lifecycle_jobs SET fire_at = ? WHERE identity_id = ?").run(fireAt, running.id);
    db.close();
  }
  await rpc("identity.launch", { id: running.id });

  const doomed = await rpc("identity.createFromBlueprint", {
    blueprintId: vendorAuditId,
    overrides: { lifetime: "2h" },
  });
  await rpc("identity.launch", { id: doomed.id });
  await new Promise((r) => setTimeout(r, 1500));
  await rpc("identity.destroy", { id: doomed.id });
  log(`running=${running.id} destroyed=${doomed.id}`);

  // 5. capture
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: env.MORTAL_BROWSER_PATH,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: VIEWPORT, reducedMotion: "reduce" });
  // consistent renders: no text caret, no selection tint, animations off
  // (runs in the page, where document exists)
  await page.addInitScript(`
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "*{caret-color:transparent !important} *::selection{background:transparent}";
      document.head.append(style);
    });
  `);
  await page.goto(`http://127.0.0.1:${VITE_PORT}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const shot = async (name) => {
    await page.mouse.move(0, 0);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    log(`captured ${name}.png`);
  };

  // home
  await shot("home");

  // running identity workspace
  await page
    .locator('[data-testid^="nav-identity-"]')
    .filter({ hasText: "active" })
    .first()
    .click();
  await page.waitForTimeout(1500);
  await shot("identity-overview");

  await page.getByRole("tab", { name: "permissions" }).click();
  await page.waitForTimeout(500);
  await shot("permissions");

  await page.getByRole("tab", { name: "lifecycle" }).click();
  await page.waitForTimeout(500);
  await shot("lifecycle");

  // destroyed identity opens straight onto its receipt
  await page
    .locator('[data-testid^="nav-identity-"]')
    .filter({ hasText: "destroyed" })
    .first()
    .click();
  await page.waitForTimeout(1500);
  await shot("receipt");

  await browser.close();
  log(`done — 5 captures in ${path.relative(repo, OUT)}/`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
