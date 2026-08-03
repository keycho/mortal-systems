// lifecycle suite G10-G14: the runtime runs as a REAL child process, so
// restarts, crashes mid-destroy, and downtime expiry are process-true.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DestructionReport, IdentitySummary } from "@mortal/schema";
import { composeManifest, generateIdentityId } from "@mortal/schema";
import {
  pollUntil,
  startRuntimeProcess,
  tmpRoot,
  type RuntimeProc,
} from "../helpers/world.js";

const T = 180_000;

const procs: RuntimeProc[] = [];
const roots: string[] = [];

async function world(env: Record<string, string> = {}): Promise<RuntimeProc> {
  const root = tmpRoot("mortal-lc-");
  roots.push(root);
  const proc = await startRuntimeProcess(root, env);
  procs.push(proc);
  return proc;
}

afterEach(async () => {
  for (const proc of procs.splice(0)) await proc.stop().catch(() => {});
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function newManifest(name: string, lifetime: string) {
  return composeManifest({
    id: generateIdentityId(),
    name,
    createdAt: new Date().toISOString(),
    lifetime,
    color: "#A78BFA",
  });
}

/** backdate an identity's deadline while the runtime is STOPPED */
function backdate(root: string, id: string, toIso: string): void {
  const db = new Database(path.join(root, "mortal.db"));
  db.prepare("UPDATE identities SET expires_at = ? WHERE id = ?").run(toIso, id);
  db.prepare("UPDATE lifecycle_jobs SET fire_at = ? WHERE identity_id = ?").run(toIso, id);
  db.close();
}

function assertDestroyedOnDisk(root: string, id: string): void {
  expect(fs.existsSync(path.join(root, "profiles", id))).toBe(false);
  expect(fs.existsSync(path.join(root, "files", id))).toBe(false);
  expect(fs.existsSync(path.join(root, "companion-instances", id))).toBe(false);
  const db = new Database(path.join(root, "mortal.db"), { readonly: true });
  const rows = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE identity_id = ?`).get(id) as { n: number }).n;
  expect(rows("notes")).toBe(0);
  expect(rows("bookmarks")).toBe(0);
  expect(rows("ai_messages")).toBe(0);
  const identity = db.prepare("SELECT state, manifest_json, destroyed_at FROM identities WHERE id = ?").get(id) as
    | { state: string; manifest_json: string; destroyed_at: string | null }
    | undefined;
  expect(identity?.state).toBe("destroyed");
  expect(identity?.destroyed_at).toBeTruthy();
  const tombstone = JSON.parse(identity!.manifest_json) as Record<string, unknown>;
  expect(Object.keys(tombstone).sort()).toEqual(["destroyedAt", "id", "name"]);
  const journal = db.prepare("SELECT COUNT(*) AS n FROM destroy_journal WHERE identity_id = ?").get(id) as { n: number };
  expect(journal.n).toBe(0);
  db.close();
}

describe("lifecycle over a real runtime process", () => {
  it(
    "G10: a 30s-lifetime identity auto-destroys within tolerance",
    async () => {
      const proc = await world();
      const summary = await proc.rpc<IdentitySummary>("identity.create", {
        manifest: newManifest("g10", "30s"),
      });
      const started = Date.now();
      const final = await pollUntil(
        () => proc.rpc<IdentitySummary[]>("identity.list", {}),
        (list) => list.find((s) => s.id === summary.id)?.state === "destroyed",
        60_000,
        500
      );
      const elapsed = (Date.now() - started) / 1000;
      expect(final.find((s) => s.id === summary.id)?.state).toBe("destroyed");
      // 30s lifetime + 0.5s tick + destroy work; anything past 55s is a miss
      expect(elapsed).toBeLessThan(55);
      const events = await proc.rpc<Array<{ event: string }>>("activity.read", {
        identityId: summary.id,
      });
      expect(events.map((e) => e.event)).toContain("expiring");
      expect(events.map((e) => e.event)).toContain("destroyed");
    },
    T
  );

  it(
    "G11: expiry during downtime is honored on restart and logged expired_late",
    async () => {
      const proc = await world();
      const summary = await proc.rpc<IdentitySummary>("identity.create", {
        manifest: newManifest("g11", "12h"),
      });
      await proc.stop();
      backdate(proc.root, summary.id, new Date(Date.now() - 60_000).toISOString());

      const revived = await startRuntimeProcess(proc.root);
      procs.push(revived);
      const list = await revived.rpc<IdentitySummary[]>("identity.list", {});
      expect(list.find((s) => s.id === summary.id)?.state).toBe("destroyed");
      const events = await revived.rpc<Array<{ event: string }>>("activity.read", {
        identityId: summary.id,
      });
      expect(events.map((e) => e.event)).toContain("expired_late");
      assertDestroyedOnDisk(proc.root, summary.id);
    },
    T
  );

  it(
    "G12 + G13: destruction is complete, and the neighbor keeps running untouched",
    async () => {
      const proc = await world();
      const a = await proc.rpc<IdentitySummary>("identity.create", { manifest: newManifest("g12-a", "12h") });
      const b = await proc.rpc<IdentitySummary>("identity.create", { manifest: newManifest("g13-b", "12h") });
      await proc.rpc("identity.launch", { id: a.id });
      const bLaunch = await proc.rpc<{ pid: number }>("identity.launch", { id: b.id });

      const report = await proc.rpc<DestructionReport>("identity.destroy", { id: a.id, reason: "g12" });
      expect(report.steps.every((s) => s.ok)).toBe(true);
      expect(report.caveats.length).toBeGreaterThanOrEqual(4);
      assertDestroyedOnDisk(proc.root, a.id);

      // non-contagion: B's process, dirs and rows are intact
      expect(() => process.kill(bLaunch.pid, 0)).not.toThrow();
      expect(fs.existsSync(path.join(proc.root, "profiles", b.id, "Default"))).toBe(true);
      const list = await proc.rpc<IdentitySummary[]>("identity.list", {});
      expect(list.find((s) => s.id === b.id)?.state).toBe("running");
      const status = await proc.rpc<{ identitiesRunning: number }>("runtime.status", {});
      expect(status.identitiesRunning).toBe(1);
    },
    T
  );

  it(
    "G14: runtime killed between D2 and D3 resumes from the journal and completes",
    async () => {
      const proc = await world({ MORTAL_CRASH_AFTER_STEP: "D2" });
      const a = await proc.rpc<IdentitySummary>("identity.create", { manifest: newManifest("g14", "12h") });
      await proc.rpc("identity.launch", { id: a.id });
      // the destroy call dies with the process: the crash fires right after
      // D2 is journaled — exactly between D2 and D3, per the spec
      await proc.rpc("identity.destroy", { id: a.id }).catch(() => {});
      const code = await Promise.race([proc.waitExit(), new Promise<null>((r) => setTimeout(() => r(null), 15_000))]);
      expect(code, "runtime crashed by the test hook").toBe(1);

      // journal shows the partial destruction; profile and files still on disk
      const db = new Database(path.join(proc.root, "mortal.db"), { readonly: true });
      const journal = db.prepare("SELECT steps_completed FROM destroy_journal WHERE identity_id = ?").get(a.id) as
        | { steps_completed: string }
        | undefined;
      db.close();
      expect(journal).toBeDefined();
      expect(JSON.parse(journal!.steps_completed)).toEqual(["D0", "D1", "D2"]);
      expect(fs.existsSync(path.join(proc.root, "profiles", a.id))).toBe(true);
      expect(fs.existsSync(path.join(proc.root, "files", a.id))).toBe(true);

      // restart without the crash hook: the journal resumes and G12 holds
      const revived = await startRuntimeProcess(proc.root);
      procs.push(revived);
      assertDestroyedOnDisk(proc.root, a.id);
      const events = await revived.rpc<Array<{ event: string; detail: Record<string, unknown> | null }>>(
        "activity.read",
        { identityId: a.id }
      );
      const destroyedEvent = events.find((e) => e.event === "destroyed");
      expect(destroyedEvent).toBeDefined();
      const report = destroyedEvent!.detail!.report as unknown as DestructionReport;
      expect(report.resumed).toBe(true);
    },
    T
  );
});
