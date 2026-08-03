// day-2 gate: real chromium, real profiles, real cdp endpoints.
// launches actual browser processes (headless in ci containers).
import "../src/launcher/register.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { composeManifest, generateIdentityId } from "@mortal/schema";
import { MortalRuntime } from "../src/runtime.js";

const LAUNCH_TIMEOUT = 90_000;
const BUNDLED_CHROMIUM = "/opt/pw-browsers/chromium";

let runtime: MortalRuntime;
let root: string;
const idA = generateIdentityId();
const idB = generateIdentityId();
const idC = generateIdentityId();
let pidA = 0;
let pidB = 0;
let cdpA = "";
let cdpB = "";

function cdpHttp(cdpEndpoint: string): string {
  const url = new URL(cdpEndpoint.replace("ws://", "http://"));
  return `http://${url.host}`;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  if (!process.env.MORTAL_BROWSER_PATH && fs.existsSync(BUNDLED_CHROMIUM)) {
    process.env.MORTAL_BROWSER_PATH = BUNDLED_CHROMIUM;
  }
  process.env.MORTAL_HEADLESS = "1";
  root = fs.mkdtempSync(path.join(os.tmpdir(), "mortal-smoke-"));
  runtime = await MortalRuntime.start({ root, noServer: true });

  const now = () => new Date().toISOString();
  runtime.identities.create({
    manifest: composeManifest({ id: idA, name: "client acme", createdAt: now(), color: "#F59E0B" }),
  });
  runtime.identities.create({
    manifest: composeManifest({
      id: idB,
      name: "onchain investigator",
      createdAt: now(),
      color: "#C8FF4D",
      lifetime: "12h",
    }),
  });
  runtime.identities.create({
    manifest: composeManifest({
      id: idC,
      name: "no-history",
      createdAt: now(),
      color: "#4DA3FF",
      lifetime: "12h",
      retainHistory: false,
    }),
  });
}, LAUNCH_TIMEOUT);

afterAll(async () => {
  await runtime?.stop();
  if (root) fs.rmSync(root, { recursive: true, force: true });
}, LAUNCH_TIMEOUT);

describe("day-2 launcher against real chromium", () => {
  it(
    "discovers a launchable browser and reports it in status",
    () => {
      const status = runtime.status();
      expect(status.browsers.length).toBeGreaterThanOrEqual(1);
      expect(status.defaultBrowser).not.toBeNull();
      expect(status.defaultBrowser?.version).toBeTruthy();
    },
    LAUNCH_TIMEOUT
  );

  it(
    "launches two identities simultaneously with separate user-data dirs and live cdp endpoints",
    async () => {
      const a = await runtime.launch(idA);
      const b = await runtime.launch(idB);
      pidA = a.pid;
      pidB = b.pid;
      cdpA = a.cdpEndpoint ?? "";
      cdpB = b.cdpEndpoint ?? "";

      expect(pidA).toBeGreaterThan(0);
      expect(pidB).toBeGreaterThan(0);
      expect(pidA).not.toBe(pidB);
      expect(cdpA).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\//);
      expect(cdpB).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\//);
      expect(new URL(cdpHttp(cdpA)).port).not.toBe(new URL(cdpHttp(cdpB)).port);

      // separate real profile directories, both alive
      expect(fs.existsSync(path.join(root, "profiles", idA, "DevToolsActivePort"))).toBe(true);
      expect(fs.existsSync(path.join(root, "profiles", idB, "DevToolsActivePort"))).toBe(true);
      expect(pidAlive(pidA)).toBe(true);
      expect(pidAlive(pidB)).toBe(true);

      // cdp answers on both endpoints with distinct browser instances
      const infoA = (await (await fetch(`${cdpHttp(cdpA)}/json/version`)).json()) as {
        webSocketDebuggerUrl: string;
        Browser: string;
      };
      const infoB = (await (await fetch(`${cdpHttp(cdpB)}/json/version`)).json()) as {
        webSocketDebuggerUrl: string;
        Browser: string;
      };
      expect(infoA.Browser).toContain("Chrome");
      expect(infoB.Browser).toContain("Chrome");
      expect(infoA.webSocketDebuggerUrl).not.toBe(infoB.webSocketDebuggerUrl);

      const status = runtime.status();
      expect(status.identitiesRunning).toBe(2);
      expect(runtime.identities.get(idA).summary.state).toBe("running");
      expect(runtime.identities.get(idB).summary.state).toBe("running");

      // launch is idempotent while running
      const again = await runtime.launch(idA);
      expect(again.pid).toBe(pidA);
    },
    LAUNCH_TIMEOUT
  );

  it(
    "suspend terminates the process tree, preserves the profile; resume relaunches",
    async () => {
      await runtime.suspend(idA);
      expect(pidAlive(pidA)).toBe(false);
      expect(runtime.identities.get(idA).summary.state).toBe("suspended");
      expect(fs.existsSync(path.join(root, "profiles", idA, "Default"))).toBe(true);

      const resumed = await runtime.resume(idA);
      expect(resumed.pid).toBeGreaterThan(0);
      expect(resumed.pid).not.toBe(pidA);
      expect(resumed.cdpEndpoint).toMatch(/^ws:\/\//);
      const info = await (await fetch(`${cdpHttp(resumed.cdpEndpoint ?? "")}/json/version`)).json();
      expect((info as { Browser: string }).Browser).toContain("Chrome");
      expect(runtime.identities.get(idA).summary.state).toBe("running");
      pidA = resumed.pid;

      const events = runtime.readActivity(idA).map((e) => e.event);
      expect(events).toContain("provisioned");
      expect(events).toContain("launched");
      expect(events).toContain("suspended");
      expect(events).toContain("resumed");
    },
    LAUNCH_TIMEOUT
  );

  it(
    "scrubs history artifacts on session end iff retainHistory is false",
    async () => {
      // retainHistory=false identity: plant a history artifact, then suspend
      await runtime.launch(idC);
      const historyC = path.join(root, "profiles", idC, "Default", "History");
      fs.mkdirSync(path.dirname(historyC), { recursive: true });
      fs.writeFileSync(historyC, "browsing-history-bytes");
      await runtime.suspend(idC);
      expect(fs.existsSync(historyC)).toBe(false);

      // retainHistory=true identity (A, still running): same plant, must survive
      const historyA = path.join(root, "profiles", idA, "Default", "History");
      fs.mkdirSync(path.dirname(historyA), { recursive: true });
      fs.writeFileSync(historyA, "browsing-history-bytes");
      await runtime.suspend(idA);
      expect(fs.existsSync(historyA)).toBe(true);
    },
    LAUNCH_TIMEOUT
  );

  it(
    "destroys a running identity (real D2 halt) without touching its neighbor",
    async () => {
      expect(pidAlive(pidB)).toBe(true);
      const report = await runtime.destroyIdentity(idB, { reason: "smoke" });
      expect(report.steps.every((s) => s.ok)).toBe(true);
      const d2 = report.steps.find((s) => s.step === "D2");
      expect(d2?.detail).toContain("terminated pid");
      expect(pidAlive(pidB)).toBe(false);
      expect(fs.existsSync(path.join(root, "profiles", idB))).toBe(false);
      expect(fs.existsSync(path.join(root, "files", idB))).toBe(false);
      expect(runtime.identities.get(idB).summary.state).toBe("destroyed");

      // non-contagion: A's partition and row are intact
      expect(fs.existsSync(path.join(root, "profiles", idA, "Default"))).toBe(true);
      expect(runtime.identities.get(idA).summary.state).toBe("suspended");
    },
    LAUNCH_TIMEOUT
  );
});
