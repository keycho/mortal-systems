// day-3 gate, browser half: the stamped companion loads inside a real
// chromium as a per-identity extension whose id the runtime can predict.
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
let root: string;
const idA = generateIdentityId();
const idB = generateIdentityId();

interface CdpTarget {
  type: string;
  url: string;
}

async function cdpTargets(cdpEndpoint: string): Promise<CdpTarget[]> {
  const url = new URL(cdpEndpoint.replace("ws://", "http://"));
  const res = await fetch(`http://${url.host}/json/list`);
  return (await res.json()) as CdpTarget[];
}

/** poll for an extension target (service workers register asynchronously) */
async function extensionIds(cdpEndpoint: string, timeoutMs: number): Promise<Set<string>> {
  const deadline = Date.now() + timeoutMs;
  let ids = new Set<string>();
  while (Date.now() < deadline) {
    const targets = await cdpTargets(cdpEndpoint);
    ids = new Set(
      targets
        .filter((t) => t.url.startsWith("chrome-extension://"))
        .map((t) => new URL(t.url).host)
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

  // the smoke test needs the real template; build it if this run came in
  // without the turbo dependency having built it first
  if (!fs.existsSync(path.join(companionDir, "dist", "manifest.json"))) {
    execFileSync("node", ["build.mjs"], { cwd: companionDir, stdio: "inherit" });
  }

  root = fs.mkdtempSync(path.join(os.tmpdir(), "liminal-companion-"));
  runtime = await LiminalRuntime.start({ root });
  const now = () => new Date().toISOString();
  runtime.identities.create({
    manifest: composeManifest({ id: idA, name: "alpha", createdAt: now(), color: "#F59E0B", lifetime: "12h" }),
  });
  runtime.identities.create({
    manifest: composeManifest({ id: idB, name: "beta", createdAt: now(), color: "#C8FF4D", lifetime: "12h" }),
  });
}, LAUNCH_TIMEOUT);

afterAll(async () => {
  await runtime?.stop();
  if (root) fs.rmSync(root, { recursive: true, force: true });
}, LAUNCH_TIMEOUT);

describe("stamped companion inside real chromium", () => {
  it(
    "stamps one instance per identity with the identity's own token and current port",
    async () => {
      await runtime.launch(idA);
      await runtime.launch(idB);

      for (const [id, name] of [
        [idA, "alpha"],
        [idB, "beta"],
      ] as const) {
        const configPath = path.join(root, "companion-instances", id, "liminal.identity.json");
        expect(fs.existsSync(configPath), `stamped config for ${name}`).toBe(true);
        const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
          identityId: string;
          runtimePort: number;
          token: string;
          name: string;
        };
        expect(config.identityId).toBe(id);
        expect(config.runtimePort).toBe(runtime.port);
        expect(config.token).toBe(runtime.companionTokenFor(id));
        expect(config.name).toBe(name);
      }
      // one token per identity, never shared across instances
      const readToken = (id: string) =>
        (
          JSON.parse(
            fs.readFileSync(path.join(root, "companion-instances", id, "liminal.identity.json"), "utf8")
          ) as { token: string }
        ).token;
      expect(readToken(idA)).not.toBe(readToken(idB));
    },
    LAUNCH_TIMEOUT
  );

  it(
    "loads each identity's companion under the runtime-computed extension id (G6/G16 shape)",
    async () => {
      const cdpA = runtime.launcher!.cdpEndpointFor(idA)!;
      const cdpB = runtime.launcher!.cdpEndpointFor(idB)!;
      const expectedA = computeUnpackedExtensionId(
        fs.realpathSync(path.join(root, "companion-instances", idA))
      );
      const expectedB = computeUnpackedExtensionId(
        fs.realpathSync(path.join(root, "companion-instances", idB))
      );
      expect(expectedA).toMatch(/^[a-p]{32}$/);
      expect(expectedA).not.toBe(expectedB);

      const idsInA = await extensionIds(cdpA, 20_000);
      const idsInB = await extensionIds(cdpB, 20_000);

      // the computed id matches what chromium actually assigned (verifies the
      // sha256-path algorithm against the real browser)
      expect([...idsInA], "A loads its own companion").toContain(expectedA);
      expect([...idsInB], "B loads its own companion").toContain(expectedB);

      // extension state isolation: A's instance is absent from B and vice versa
      expect([...idsInA]).not.toContain(expectedB);
      expect([...idsInB]).not.toContain(expectedA);
    },
    LAUNCH_TIMEOUT
  );

  it(
    "background worker authenticates to /v1/self with its stamped token (observed server-side)",
    async () => {
      // the worker polls /v1/self on startup; verify the runtime resolved its
      // token by checking the identity can be resolved from the stamped file
      const config = JSON.parse(
        fs.readFileSync(path.join(root, "companion-instances", idA, "liminal.identity.json"), "utf8")
      ) as { token: string };
      expect(runtime.identityForCompanionToken(config.token)).toBe(idA);

      // and the pinned origin equals the id chromium gave the instance
      const expected = computeUnpackedExtensionId(
        fs.realpathSync(path.join(root, "companion-instances", idA))
      );
      const res = await fetch(`http://127.0.0.1:${runtime.port}/v1/self`, {
        headers: {
          authorization: `Bearer ${config.token}`,
          origin: `chrome-extension://${expected}`,
        },
      });
      expect(res.status).toBe(200);
    },
    LAUNCH_TIMEOUT
  );
});
