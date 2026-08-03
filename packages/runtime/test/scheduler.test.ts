// day-5 gate, scheduler half: runtime-level G10/G11 shapes plus the grace
// path with a real browser. the browser-level variants belong to day 6.
import "../src/launcher/register.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { composeManifest, generateIdentityId, type SelfEvent } from "@mortal/schema";
import { MortalRuntime } from "../src/runtime.js";

const BUNDLED_CHROMIUM = "/opt/pw-browsers/chromium";
const TEST_TIMEOUT = 90_000;

const runtimes: MortalRuntime[] = [];
const roots: string[] = [];

function tmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mortal-sched-"));
  roots.push(root);
  return root;
}

async function startRuntime(root: string, tickMs = 200): Promise<MortalRuntime> {
  const runtime = await MortalRuntime.start({
    root,
    noServer: true,
    scheduler: { tickMs, graceSeconds: 1 },
  });
  runtimes.push(runtime);
  return runtime;
}

/** create a long-lived identity, then force its deadline into the near past/future */
function createDue(runtime: MortalRuntime, opts: { onExpiry: "destroy" | "suspend" | "archive"; inMs: number }): string {
  const id = generateIdentityId();
  runtime.identities.create({
    manifest: composeManifest({
      id,
      name: `due-${opts.onExpiry}`,
      createdAt: new Date().toISOString(),
      lifetime: "12h",
      onExpiry: opts.onExpiry,
    }),
  });
  const fireAt = new Date(Date.now() + opts.inMs).toISOString();
  runtime.repo.db.prepare("UPDATE identities SET expires_at = ? WHERE id = ?").run(fireAt, id);
  runtime.repo.db
    .prepare("UPDATE lifecycle_jobs SET fire_at = ? WHERE identity_id = ?")
    .run(fireAt, id);
  return id;
}

async function waitForState(
  runtime: MortalRuntime,
  id: string,
  state: string,
  timeoutMs: number
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let current = "";
  while (Date.now() < deadline) {
    current = runtime.identities.mustGetRow(id).state;
    if (current === state) return current;
    await new Promise((r) => setTimeout(r, 150));
  }
  return current;
}

beforeAll(() => {
  if (!process.env.MORTAL_BROWSER_PATH && fs.existsSync(BUNDLED_CHROMIUM)) {
    process.env.MORTAL_BROWSER_PATH = BUNDLED_CHROMIUM;
  }
  process.env.MORTAL_HEADLESS = "1";
});

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) {
    try {
      await runtime.stop();
    } catch {}
  }
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("lifecycle scheduler", () => {
  it(
    "fires a due job and auto-destroys within tolerance (G10 shape)",
    async () => {
      const runtime = await startRuntime(tmpRoot());
      const id = createDue(runtime, { onExpiry: "destroy", inMs: 700 });

      expect(await waitForState(runtime, id, "destroyed", 10_000)).toBe("destroyed");

      const events = runtime.readActivity(id).map((e) => e.event);
      expect(events).toContain("expiring");
      expect(events).toContain("destroyed");
      expect(events).not.toContain("expired_late");
      const jobs = runtime.repo.db
        .prepare("SELECT status FROM lifecycle_jobs WHERE identity_id = ?")
        .all(id) as Array<{ status: string }>;
      expect(jobs.every((j) => j.status !== "pending")).toBe(true);
      // destruction is the full contract, not a shortcut
      expect(fs.existsSync(path.join(runtime.root, "profiles", id))).toBe(false);
    },
    TEST_TIMEOUT
  );

  it(
    "runs suspend/archive actions once and never refires them",
    async () => {
      const runtime = await startRuntime(tmpRoot());
      const idSuspend = createDue(runtime, { onExpiry: "suspend", inMs: 600 });
      const idArchive = createDue(runtime, { onExpiry: "archive", inMs: 600 });

      expect(await waitForState(runtime, idSuspend, "suspended", 10_000)).toBe("suspended");
      expect(await waitForState(runtime, idArchive, "archived", 10_000)).toBe("archived");

      // a second catch-up pass finds nothing left to do
      const before = runtime.readActivity(idSuspend).length;
      await runtime.scheduler!.catchUp();
      expect(runtime.identities.mustGetRow(idSuspend).state).toBe("suspended");
      expect(runtime.readActivity(idSuspend).length).toBe(before);
      expect(runtime.readActivity(idSuspend).map((e) => e.event)).not.toContain("expired_late");
    },
    TEST_TIMEOUT
  );

  it(
    "startup catch-up honors an expiry missed while the runtime was stopped, logging expired_late (G11 shape)",
    async () => {
      const root = tmpRoot();
      const first = await startRuntime(root, 60_000); // slow tick: nothing fires live
      const id = createDue(first, { onExpiry: "destroy", inMs: -5_000 - 60_000 });
      // simulate "expired while stopped": stop before the (already-past) job can fire
      await first.stop();
      runtimes.splice(runtimes.indexOf(first), 1);

      const second = await startRuntime(root, 60_000);
      // catch-up runs during start(), before anything else
      expect(second.identities.mustGetRow(id).state).toBe("destroyed");
      const events = second.readActivity(id).map((e) => e.event);
      expect(events).toContain("expired_late");
      expect(events).toContain("destroyed");
      expect(fs.existsSync(path.join(root, "profiles", id))).toBe(false);
    },
    TEST_TIMEOUT
  );

  it(
    "gives a running identity a grace notice over the event bus, then halts and destroys",
    async () => {
      const runtime = await startRuntime(tmpRoot());
      const id = createDue(runtime, { onExpiry: "destroy", inMs: 1_200 });

      const { pid } = await runtime.launch(id);
      expect(pid).toBeGreaterThan(0);

      const graceReceived = new Promise<SelfEvent>((resolve) => {
        runtime.events.subscribe(id, (event) => {
          if (event.type === "grace") resolve(event);
        });
      });

      const grace = await Promise.race([
        graceReceived,
        new Promise<null>((r) => setTimeout(() => r(null), 15_000)),
      ]);
      expect(grace, "grace notice arrived before termination").not.toBeNull();
      expect(grace!.message).toContain("space closing");

      expect(await waitForState(runtime, id, "destroyed", 15_000)).toBe("destroyed");
      expect(() => process.kill(pid, 0)).toThrow();
      expect(fs.existsSync(path.join(runtime.root, "profiles", id))).toBe(false);
    },
    TEST_TIMEOUT
  );
});
