import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { composeManifest, generateIdentityId, tombstoneSchema } from "@mortal/schema";
import { openDb } from "../src/store/db.js";
import { Repo } from "../src/store/repo.js";
import { IdentityService } from "../src/identity/service.js";
import { Destroyer } from "../src/destroy/destroy.js";
import { RuntimeError } from "../src/errors.js";

class CrashSimulated extends Error {
  constructor(step: string) {
    super(`simulated crash after ${step}`);
  }
}

interface World {
  root: string;
  repo: Repo;
  identities: IdentityService;
}

const worlds: World[] = [];

function makeWorld(): World {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mortal-destroy-"));
  const repo = new Repo(openDb(path.join(root, "mortal.db")));
  const world: World = { root, repo, identities: new IdentityService(repo) };
  worlds.push(world);
  return world;
}

afterEach(() => {
  for (const w of worlds.splice(0)) {
    try {
      w.repo.db.close();
    } catch {}
    fs.rmSync(w.root, { recursive: true, force: true });
  }
});

/** create an identity and simulate a provisioned partition with real junk files */
function seedIdentity(world: World): string {
  const id = generateIdentityId();
  world.identities.create({
    manifest: composeManifest({
      id,
      name: "doomed",
      createdAt: new Date().toISOString(),
      lifetime: "12h",
    }),
  });
  const profile = path.join(world.root, "profiles", id);
  const files = path.join(world.root, "files", id, "downloads");
  const companion = path.join(world.root, "companion-instances", id);
  for (const dir of [profile, files, companion]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(profile, "Cookies"), "not-real-cookies");
  fs.writeFileSync(path.join(files, "evidence.csv"), "a,b,c");
  fs.writeFileSync(path.join(companion, "mortal.identity.json"), "{}");
  const now = new Date().toISOString();
  world.repo.insertNote({ id: "n1", identityId: id, title: "t", bodyMd: "b", updatedAt: now });
  world.repo.insertBookmark({ id: "b1", identityId: id, title: "solscan", url: "https://solscan.io", folder: null, position: 0 });
  world.repo.insertAiMessage({ id: "m1", identityId: id, role: "user", content: "hi", createdAt: now });
  return id;
}

function assertFullyDestroyed(world: World, id: string) {
  expect(fs.existsSync(path.join(world.root, "profiles", id))).toBe(false);
  expect(fs.existsSync(path.join(world.root, "files", id))).toBe(false);
  expect(fs.existsSync(path.join(world.root, "companion-instances", id))).toBe(false);
  expect(world.repo.listNotes(id)).toHaveLength(0);
  expect(world.repo.listBookmarks(id)).toHaveLength(0);
  expect(world.repo.listAiMessages(id)).toHaveLength(0);

  const row = world.repo.getIdentity(id);
  expect(row?.state).toBe("destroyed");
  expect(row?.destroyed_at).toBeTruthy();
  const tomb = tombstoneSchema.parse(JSON.parse(row!.manifest_json));
  expect(tomb.id).toBe(id);

  const events = world.repo.readActivity(id, 100).map((e) => e.event);
  expect(events).toContain("destroy_started");
  expect(events).toContain("destroyed");
  expect(world.repo.getDestroyJournal(id)).toBeUndefined();
}

describe("deletion contract", () => {
  it("runs D0-D7, removes dirs and rows, tombstones, finalizes activity", async () => {
    const world = makeWorld();
    const id = seedIdentity(world);
    const destroyer = new Destroyer({
      repo: world.repo,
      root: world.root,
      halt: async () => ({ halted: false, detail: "no process" }),
    });

    const report = await destroyer.destroy(id, { reason: "test" });
    expect(report.resumed).toBe(false);
    expect(report.steps).toHaveLength(8);
    expect(report.steps.every((s) => s.ok)).toBe(true);
    expect(report.steps.map((s) => s.step)).toEqual(["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"]);
    expect(report.caveats.length).toBeGreaterThanOrEqual(4);
    assertFullyDestroyed(world, id);
  });

  it("refuses to destroy an already-destroyed identity", async () => {
    const world = makeWorld();
    const id = seedIdentity(world);
    const destroyer = new Destroyer({
      repo: world.repo,
      root: world.root,
      halt: async () => ({ halted: false, detail: "no process" }),
    });
    await destroyer.destroy(id);
    await expect(destroyer.destroy(id)).rejects.toThrowError(RuntimeError);
    await expect(destroyer.destroy(id)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("resumes from the journal after a crash between D2 and D3 (G14 shape)", async () => {
    const world = makeWorld();
    const id = seedIdentity(world);
    const crashing = new Destroyer({
      repo: world.repo,
      root: world.root,
      halt: async () => ({ halted: false, detail: "no process" }),
      crashAfterStep: (step) => {
        if (step === "D2") throw new CrashSimulated(step);
      },
    });

    await expect(crashing.destroy(id)).rejects.toThrow(CrashSimulated);

    // the crash left the journal with D0-D2 done and the dirs still on disk
    const journal = world.repo.getDestroyJournal(id);
    expect(journal?.steps_completed).toEqual(["D0", "D1", "D2"]);
    expect(fs.existsSync(path.join(world.root, "profiles", id))).toBe(true);
    expect(world.repo.getIdentity(id)?.state).toBe("destroying");

    // a fresh destroyer (as on runtime restart) resumes and completes
    const resuming = new Destroyer({
      repo: world.repo,
      root: world.root,
      halt: async () => ({ halted: false, detail: "no process" }),
    });
    const reports = await resuming.resumeAll();
    expect(reports).toHaveLength(1);
    const report = reports[0]!;
    expect(report.resumed).toBe(true);
    for (const step of ["D0", "D1", "D2"] as const) {
      expect(report.steps.find((s) => s.step === step)?.detail).toContain("before resume");
    }
    expect(report.steps.every((s) => s.ok)).toBe(true);
    assertFullyDestroyed(world, id);
  });

  it("keeps the journal when a step fails, and repeating steps is safe", async () => {
    const world = makeWorld();
    const id = seedIdentity(world);
    let failOnce = true;
    const destroyer = new Destroyer({
      repo: world.repo,
      root: world.root,
      halt: async () => {
        if (failOnce) {
          failOnce = false;
          throw new Error("browser refused to die");
        }
        return { halted: false, detail: "no process" };
      },
    });

    const first = await destroyer.destroy(id);
    expect(first.steps.find((s) => s.step === "D2")?.ok).toBe(false);
    expect(world.repo.getDestroyJournal(id)).toBeDefined();
    expect(world.repo.getIdentity(id)?.state).toBe("destroying");

    const second = await destroyer.resumeAll();
    expect(second[0]?.steps.every((s) => s.ok)).toBe(true);
    assertFullyDestroyed(world, id);
  });

  it("destroying an unprovisioned identity is a clean no-op on the filesystem steps", async () => {
    const world = makeWorld();
    const id = generateIdentityId();
    world.identities.create({
      manifest: composeManifest({ id, name: "ghost", createdAt: new Date().toISOString() }),
    });
    const destroyer = new Destroyer({
      repo: world.repo,
      root: world.root,
      halt: async () => ({ halted: false, detail: "no process" }),
    });
    const report = await destroyer.destroy(id);
    expect(report.steps.every((s) => s.ok)).toBe(true);
    assertFullyDestroyed(world, id);
  });
});
