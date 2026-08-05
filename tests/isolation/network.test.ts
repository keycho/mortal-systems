// network-route enforcement suite (G19). proves the enforcement upgrade is
// real, not a label: a routed identity's traffic actually transits its route,
// and an identity with no route stays advisory. the badge may read "enforced"
// only when the control is real.
import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MortalRuntime } from "@mortal/runtime";
import {
  startRecordingProxy,
  startTargetSite,
  type RecordingProxy,
  type TargetSite,
} from "../fixtures/recording-proxy.js";
import {
  createIdentity,
  launchAndConnect,
  manifestOf,
  startInProcRuntime,
  tmpRoot,
  type IdentityBrowser,
} from "../helpers/world.js";

const T = 120_000;

let runtime: MortalRuntime;
let root: string;
let proxy: RecordingProxy;
let target: TargetSite | null;
const browsers: IdentityBrowser[] = [];

beforeAll(async () => {
  root = tmpRoot("mortal-net-");
  proxy = await startRecordingProxy();
  target = await startTargetSite();
  runtime = await startInProcRuntime(root);
}, T);

afterAll(async () => {
  for (const b of browsers) await b.browser.close().catch(() => {});
  await runtime?.stop();
  await proxy?.close();
  await target?.close();
  if (root) fs.rmSync(root, { recursive: true, force: true });
}, T);

describe("network route enforcement", () => {
  it(
    "G19 a routed identity's traffic transits its route; the manifest reads network: enforced",
    async () => {
      const id = createIdentity(runtime, "routed", {
        networkRoute: { proxy: proxy.url, label: "test-route" },
      });

      // the manifest earned "enforced" only because a route is attached
      const manifest = manifestOf(runtime, id);
      expect(manifest.permissions.network.value).toBe("routed");
      expect(manifest.permissions.network.enforcement).toBe("enforced");
      expect(manifest.permissions.network.route?.proxy).toBe(proxy.url);

      const b = await launchAndConnect(runtime, id);
      browsers.push(b);

      if (target === null) {
        // no routable interface in this environment: we still proved the
        // manifest earned enforcement and the proxy arg was applied, but we
        // cannot observe transit through a loopback-only stack. record and skip
        // the transit assertion rather than fake it.
        console.warn("G19: no non-loopback interface; transit assertion skipped");
        return;
      }

      const before = proxy.seen.length;
      const resp = await b.page.goto(target.url, { waitUntil: "load", timeout: 30_000 });
      expect(resp?.ok()).toBe(true);
      // the companion appends the identity name to the tab title, so match the
      // page's own title as a substring
      expect(await b.page.title()).toContain("routed target");

      // the proof: this identity's request for the target went THROUGH its route
      const transited = proxy.seen.slice(before);
      expect(transited.some((u) => u.startsWith(target!.url) || u.includes(target!.host))).toBe(true);
    },
    T
  );

  it(
    "G19 an identity with no route stays advisory and is bound to no proxy",
    async () => {
      const id = createIdentity(runtime, "routeless");
      const manifest = manifestOf(runtime, id);
      // the honest default: no route → the badge cannot read enforced
      expect(manifest.permissions.network.value).toBe("standard");
      expect(manifest.permissions.network.enforcement).toBe("advisory");
      expect(manifest.permissions.network.route).toBeNull();

      const b = await launchAndConnect(runtime, id);
      browsers.push(b);

      if (target === null) return;
      const before = proxy.seen.length;
      await b.page.goto(target.url, { waitUntil: "load", timeout: 30_000 });
      // a routeless identity never touches the route
      expect(proxy.seen.slice(before)).toHaveLength(0);
    },
    T
  );

  it(
    "G19 enforcement is real, not cosmetic: a routed identity with a dead proxy cannot reach the net, a routeless one can",
    async () => {
      // a proxy address with nothing listening — if the browser weren't truly
      // bound to it, it would fall back to a direct connection and succeed.
      const deadId = createIdentity(runtime, "routed-dead", {
        networkRoute: { proxy: "http://127.0.0.1:1", label: "dead" },
      });
      const dead = await launchAndConnect(runtime, deadId);
      browsers.push(dead);

      if (target === null) return;
      const failed = await dead.page
        .goto(target.url, { waitUntil: "load", timeout: 15_000 })
        .then(() => false)
        .catch(() => true);
      expect(failed).toBe(true); // bound to a dead route → no direct fallback

      // control: a routeless identity reaches the same target directly
      const openId = createIdentity(runtime, "routeless-open");
      const open = await launchAndConnect(runtime, openId);
      browsers.push(open);
      const resp = await open.page.goto(target.url, { waitUntil: "load", timeout: 30_000 });
      expect(resp?.ok()).toBe(true);
    },
    T
  );
});
