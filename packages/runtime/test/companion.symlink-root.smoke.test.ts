// regression for the macos failure: test roots under /tmp resolve through a
// symlink (/tmp -> /private/tmp), and chromium canonicalizes the extension
// path before sha-256 hashing. this reproduces the shape on linux by handing
// the runtime a SYMLINKED root and asserting the computed id, the observed id
// (what chromium actually assigned), and the origin check all agree.
import "../src/launcher/register.js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { composeManifest, generateIdentityId } from "@liminal/schema";
import { LiminalRuntime } from "../src/runtime.js";
import { computeUnpackedExtensionId } from "../src/launcher/extension-id.js";

const LAUNCH_TIMEOUT = 90_000;
const BUNDLED_CHROMIUM = "/opt/pw-browsers/chromium";
const here = path.dirname(fileURLToPath(import.meta.url));
const companionDir = path.resolve(here, "../../../apps/companion");

let runtime: LiminalRuntime;
let realRoot: string;
let linkRoot: string;
const id = generateIdentityId();

async function observedExtensionIds(cdpEndpoint: string, timeoutMs: number): Promise<Set<string>> {
  const url = new URL(cdpEndpoint.replace("ws://", "http://"));
  const deadline = Date.now() + timeoutMs;
  let ids = new Set<string>();
  while (Date.now() < deadline) {
    const res = await fetch(`http://${url.host}/json/list`);
    const targets = (await res.json()) as Array<{ url: string }>;
    ids = new Set(
      targets.filter((t) => t.url.startsWith("chrome-extension://")).map((t) => new URL(t.url).host)
    );
    if (ids.size > 0) return ids;
    await new Promise((r) => setTimeout(r, 250));
  }
  return ids;
}

beforeAll(async () => {
  if (!process.env.LIMINAL_BROWSER_PATH && fs.existsSync(BUNDLED_CHROMIUM)) {
    process.env.LIMINAL_BROWSER_PATH = BUNDLED_CHROMIUM;
  }
  process.env.LIMINAL_HEADLESS = "1";
  if (!fs.existsSync(path.join(companionDir, "dist", "manifest.json"))) {
    execFileSync("node", ["build.mjs"], { cwd: companionDir, stdio: "inherit" });
  }

  const base = fs.mkdtempSync(path.join(os.tmpdir(), "liminal-symlink-"));
  realRoot = path.join(base, "real-root");
  linkRoot = path.join(base, "link-root");
  fs.mkdirSync(realRoot, { recursive: true });
  fs.symlinkSync(realRoot, linkRoot);

  // the runtime is handed the SYMLINKED path, as macos hands /tmp paths
  runtime = await LiminalRuntime.start({ root: linkRoot });
  runtime.identities.create({
    manifest: composeManifest({
      id,
      name: "symlinked",
      createdAt: new Date().toISOString(),
      color: "#4DA3FF",
      lifetime: "12h",
    }),
  });
}, LAUNCH_TIMEOUT);

afterAll(async () => {
  await runtime?.stop();
  if (realRoot) fs.rmSync(path.dirname(realRoot), { recursive: true, force: true });
}, LAUNCH_TIMEOUT);

describe("companion identity under a symlinked runtime root", () => {
  it(
    "canonicalizes the root at startup",
    () => {
      expect(runtime.root).toBe(fs.realpathSync(linkRoot));
      expect(runtime.root).not.toContain("link-root");
    },
    LAUNCH_TIMEOUT
  );

  it(
    "computed id, chromium-observed id, and pinned origin all agree",
    async () => {
      await runtime.launch(id);
      const cdp = runtime.launcher!.cdpEndpointFor(id)!;

      const computed = computeUnpackedExtensionId(
        fs.realpathSync(path.join(runtime.root, "companion-instances", id))
      );
      const observed = await observedExtensionIds(cdp, 20_000);
      expect([...observed], "chromium assigned exactly the computed id").toContain(computed);

      // the launcher's own observation is recorded and used by the origin check
      // (background task; give it a moment)
      let recorded: string | null = null;
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline && recorded === null) {
        recorded = runtime.launcher!.observedExtensionIdFor(id);
        if (recorded === null) await new Promise((r) => setTimeout(r, 250));
      }
      expect(recorded).toBe(computed);

      // end to end: the real assigned origin authenticates; a foreign one is refused
      const token = runtime.companionTokenFor(id);
      const genuine = await fetch(`http://127.0.0.1:${runtime.port}/v1/self`, {
        headers: { authorization: `Bearer ${token}`, origin: `chrome-extension://${[...observed][0]}` },
      });
      expect(genuine.status).toBe(200);
      const foreign = await fetch(`http://127.0.0.1:${runtime.port}/v1/self`, {
        headers: {
          authorization: `Bearer ${token}`,
          origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      });
      expect(foreign.status).toBe(403);
    },
    LAUNCH_TIMEOUT
  );
});
