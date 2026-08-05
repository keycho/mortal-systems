// browser-level isolation suite: two real chromium instances, one per
// identity, driven over their per-identity cdp endpoints. A and B never share
// anything; every guarantee is asserted in both directions where it applies.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MortalRuntime } from "@mortal/runtime";
import {
  COMPANION_WORKER_PATH,
  computeUnpackedExtensionId,
  pickCompanionExtensionId,
} from "@mortal/runtime";
import { startFixtureServer, type FixtureServer } from "../fixtures/login-server.js";
import {
  createIdentity,
  launchAndConnect,
  pollUntil,
  startInProcRuntime,
  tmpRoot,
  type IdentityBrowser,
} from "../helpers/world.js";

const T = 120_000;

let runtime: MortalRuntime;
let root: string;
let fixture: FixtureServer;
let A: IdentityBrowser;
let B: IdentityBrowser;

beforeAll(async () => {
  root = tmpRoot("mortal-iso-");
  fixture = await startFixtureServer();
  runtime = await startInProcRuntime(root);
  const idA = createIdentity(runtime, "iso-a", { color: "#F59E0B" });
  const idB = createIdentity(runtime, "iso-b", { color: "#C8FF4D" });
  A = await launchAndConnect(runtime, idA);
  B = await launchAndConnect(runtime, idB);
  await A.page.goto(fixture.origin);
  await B.page.goto(fixture.origin);
}, T);

afterAll(async () => {
  await A?.browser.close().catch(() => {});
  await B?.browser.close().catch(() => {});
  await runtime?.stop();
  await fixture?.close();
  if (root) fs.rmSync(root, { recursive: true, force: true });
}, T);

describe("browser state isolation", () => {
  it(
    "G1 cookies: set in A absent in B, both directions",
    async () => {
      await A.page.evaluate(() => (document.cookie = "g1=from-a; path=/"));
      await B.page.reload();
      expect(await B.page.evaluate(() => document.cookie)).not.toContain("g1=from-a");

      await B.page.evaluate(() => (document.cookie = "g1b=from-b; path=/"));
      await A.page.reload();
      const cookiesA = await A.page.evaluate(() => document.cookie);
      expect(cookiesA).toContain("g1=from-a");
      expect(cookiesA).not.toContain("g1b=from-b");
    },
    T
  );

  it(
    "G2 localStorage: written in A, absent in B",
    async () => {
      await A.page.evaluate(() => localStorage.setItem("g2", "secret-a"));
      expect(await A.page.evaluate(() => localStorage.getItem("g2"))).toBe("secret-a");
      expect(await B.page.evaluate(() => localStorage.getItem("g2"))).toBeNull();
    },
    T
  );

  it(
    "G3 indexeddb: created in A, absent in B",
    async () => {
      await A.page.evaluate(
        () =>
          new Promise<void>((resolve, reject) => {
            const open = indexedDB.open("g3-db", 1);
            open.onupgradeneeded = () => open.result.createObjectStore("evidence");
            open.onsuccess = () => {
              open.result.close();
              resolve();
            };
            open.onerror = () => reject(open.error);
          })
      );
      const inA = await A.page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
      const inB = await B.page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
      expect(inA).toContain("g3-db");
      expect(inB).not.toContain("g3-db");
    },
    T
  );

  it(
    "G4 service workers: registered in A, unregistered in B",
    async () => {
      await A.page.evaluate(async () => {
        await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
      });
      const inA = await A.page.evaluate(
        async () => (await navigator.serviceWorker.getRegistrations()).length
      );
      const inB = await B.page.evaluate(
        async () => (await navigator.serviceWorker.getRegistrations()).length
      );
      expect(inA).toBe(1);
      expect(inB).toBe(0);
    },
    T
  );

  it(
    "G5 http cache: A's second load is served from cache; B's load must hit the server",
    async () => {
      const key = `run-${Date.now()}`;
      const load = (page: IdentityBrowser["page"]) =>
        page.evaluate(
          (src) =>
            new Promise<void>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve();
              img.onerror = () => reject(new Error("img failed"));
              img.src = src;
            }),
          `${fixture.origin}/cached.png?k=${key}`
        );

      await load(A.page);
      expect(fixture.hits(key)).toBe(1);
      // a fresh page in A (new renderer, no memory cache) hits A's disk cache
      const pageA2 = await A.browser.contexts()[0]!.newPage();
      await pageA2.goto(fixture.origin);
      await load(pageA2 as IdentityBrowser["page"]);
      await pageA2.close();
      expect(fixture.hits(key), "cache works at all within A").toBe(1);
      // B has no access to A's cache: the server must see a second request
      await load(B.page);
      expect(fixture.hits(key), "no cross-identity cache hit").toBe(2);
    },
    T
  );

  it(
    "G6/G16 extension state: each browser loads exactly its own companion instance",
    async () => {
      const expected = (id: string) =>
        computeUnpackedExtensionId(fs.realpathSync(path.join(root, "companion-instances", id)));
      for (const [self, other] of [
        [A, B],
        [B, A],
      ] as const) {
        const cdp = runtime.launcher!.cdpEndpointFor(self.id)!;
        const listUrl = `http://${new URL(cdp.replace("ws://", "http://")).host}/json/list`;
        const picked = await pollUntil(
          async () => {
            const t = (await (await fetch(listUrl)).json()) as Array<{ type: string; url: string }>;
            return pickCompanionExtensionId(t, expected(self.id));
          },
          (v) => v !== null,
          60_000
        );
        expect(picked, "own companion present under the computed id").toBe(expected(self.id));
        // refetched after the pick, so late-spawning workers are represented
        const targets = (await (await fetch(listUrl)).json()) as Array<{ type: string; url: string }>;
        const extensionHosts = targets
          .filter((t) => t.url.startsWith("chrome-extension://"))
          .map((t) => new URL(t.url).host);
        expect(extensionHosts, "neighbor's companion absent").not.toContain(expected(other.id));
        // G16: the per-identity companion set is exactly {own}. chromium ships
        // version-dependent component extensions in every profile (hangouts;
        // a /background.js worker since 151) — browser baseline, identical
        // across identities, carrying no identity state. the isolation claim
        // is about the stamped companion set, identified by its distinctive
        // worker path.
        const companionHosts = targets
          .filter(
            (t) =>
              t.url.startsWith("chrome-extension://") &&
              new URL(t.url).pathname === COMPANION_WORKER_PATH
          )
          .map((t) => new URL(t.url).host);
        expect(companionHosts).toEqual([expected(self.id)]);
      }
    },
    T
  );

  it(
    "G7 sessions end to end: alice in A and bob in B persist independently across reloads",
    async () => {
      const login = (page: IdentityBrowser["page"], user: string, pass: string) =>
        page.evaluate(
          async ({ user, pass }) => {
            const res = await fetch("/login", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ user, pass }),
            });
            return res.status;
          },
          { user, pass }
        );
      const whoami = (page: IdentityBrowser["page"]) =>
        page.evaluate(async () => (await (await fetch("/me")).json()) as { user: string | null });

      expect(await login(A.page, "alice", "alicepw")).toBe(200);
      expect(await login(B.page, "bob", "bobpw")).toBe(200);
      await A.page.reload();
      await B.page.reload();
      expect((await whoami(A.page)).user).toBe("alice");
      expect((await whoami(B.page)).user).toBe("bob");
    },
    T
  );

  it(
    "G8 filesystem partition: A's download lands under A's downloads root; B's stays empty",
    async () => {
      const downloadsA = path.join(root, "files", A.id, "downloads");
      const downloadsB = path.join(root, "files", B.id, "downloads");
      // playwright's connectOverCDP installs a browser-wide download
      // interception (its own temp dir), which would mask the provisioned
      // directory this guarantee is about. reset to chrome's default
      // behavior — the path then comes only from the runtime-seeded prefs.
      const session = await A.browser.newBrowserCDPSession();
      await session.send("Browser.setDownloadBehavior", { behavior: "default" });
      // and trigger the download in a raw cdp tab with no playwright page attached
      const cdp = runtime.launcher!.cdpEndpointFor(A.id)!;
      const host = new URL(cdp.replace("ws://", "http://")).host;
      const opened = await fetch(
        `http://${host}/json/new?${encodeURIComponent(`${fixture.origin}/download.bin`)}`,
        { method: "PUT" }
      );
      expect(opened.ok).toBe(true);
      // the enforced claim is the PARTITION: bytes land under A's provisioned
      // downloads root and nowhere else. headless chromium may keep the
      // in-progress name (Unconfirmed *.crdownload) without finalizing the
      // rename; headed browsers finalize to evidence.bin. either name is the
      // download landing in A's partition.
      const landed = await pollUntil(
        () => (fs.existsSync(downloadsA) ? fs.readdirSync(downloadsA) : []),
        (files) => files.some((f) => f.includes("evidence") || f.endsWith(".crdownload")),
        20_000
      );
      expect(
        landed.some((f) => f.includes("evidence") || f.endsWith(".crdownload")),
        `saw: ${landed.join(",")}`
      ).toBe(true);
      const inB = fs.existsSync(downloadsB) ? fs.readdirSync(downloadsB) : [];
      expect(inB).toEqual([]);
    },
    T
  );

  it(
    "G18 (browser half): a website inside A cannot use even a valid token against the runtime",
    async () => {
      const token = runtime.companionTokenFor(A.id);
      const status = await A.page.evaluate(
        async ({ port, token }) => {
          try {
            const res = await fetch(`http://127.0.0.1:${port}/v1/self`, {
              headers: { authorization: `Bearer ${token}` },
            });
            return res.status;
          } catch {
            return -1; // network-layer block also acceptable
          }
        },
        { port: runtime.port, token }
      );
      // the page's origin is the fixture site, never the companion: refused
      expect([403, -1]).toContain(status);
    },
    T
  );
});

describe("history retention (G15)", () => {
  it(
    "retainHistory=false scrubs history artifacts after real browsing; true retains them",
    async () => {
      const noHist = createIdentity(runtime, "no-history", { retainHistory: false });
      const c = await launchAndConnect(runtime, noHist);
      await c.page.goto(fixture.origin);
      await c.page.goto(`${fixture.origin}/me`);
      await c.browser.close().catch(() => {});
      await runtime.suspend(noHist);
      expect(fs.existsSync(path.join(root, "profiles", noHist, "Default", "History"))).toBe(false);

      // contrast: A retains history; after suspend its History file survives
      await A.browser.close().catch(() => {});
      await runtime.suspend(A.id);
      expect(fs.existsSync(path.join(root, "profiles", A.id, "Default", "History"))).toBe(true);
      // relaunch A so later suites see a consistent world (not required, tidy)
      A = await launchAndConnect(runtime, A.id);
      await A.page.goto(fixture.origin);
    },
    T
  );
});
