// the mortal systems rename must not orphan anyone's existing spaces:
// ~/.liminal moves to ~/.mortal, liminal.db becomes mortal.db, stale
// pre-rename companion configs are cleared, and stored manifests that still
// reference the legacy companion ref keep parsing.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { composeManifest, generateIdentityId } from "@mortal/schema";
import { MortalRuntime } from "../src/runtime.js";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
});

describe("rename migration", () => {
  it("renames liminal.db to mortal.db in a custom root and preserves identities", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mortal-mig-"));
    cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));

    // build a pre-rename root: db under the old name, a stale stamped config
    const first = await MortalRuntime.start({ root, noServer: true, scheduler: { tickMs: 60_000 } });
    const id = generateIdentityId();
    first.identities.create({
      manifest: composeManifest({ id, name: "survivor", createdAt: new Date().toISOString() }),
    });
    await first.stop();
    fs.renameSync(path.join(root, "mortal.db"), path.join(root, "liminal.db"));
    for (const sfx of ["-wal", "-shm"]) {
      const p = path.join(root, `mortal.db${sfx}`);
      if (fs.existsSync(p)) fs.renameSync(p, path.join(root, `liminal.db${sfx}`));
    }
    const staleDir = path.join(root, "companion-instances", id);
    fs.mkdirSync(staleDir, { recursive: true });
    fs.writeFileSync(path.join(staleDir, "liminal.identity.json"), "{}");

    const second = await MortalRuntime.start({ root, noServer: true, scheduler: { tickMs: 60_000 } });
    cleanups.push(() => void second.stop());
    expect(fs.existsSync(path.join(root, "mortal.db"))).toBe(true);
    expect(fs.existsSync(path.join(root, "liminal.db"))).toBe(false);
    expect(fs.existsSync(path.join(staleDir, "liminal.identity.json"))).toBe(false);
    expect(second.identities.list().map((s) => s.name)).toContain("survivor");
    await second.stop();
  });

  it("moves the default ~/.liminal root to ~/.mortal", async () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "mortal-home-"));
    const realHome = process.env.HOME;
    process.env.HOME = fakeHome;
    cleanups.push(() => {
      process.env.HOME = realHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    });

    // a legacy root with a marker file stands in for existing identities
    fs.mkdirSync(path.join(fakeHome, ".liminal", "profiles"), { recursive: true });
    fs.writeFileSync(path.join(fakeHome, ".liminal", "marker"), "spaces 001 and 002 live here");

    const runtime = await MortalRuntime.start({ noServer: true, scheduler: { tickMs: 60_000 } });
    expect(runtime.root).toBe(fs.realpathSync(path.join(fakeHome, ".mortal")));
    expect(fs.existsSync(path.join(fakeHome, ".liminal"))).toBe(false);
    expect(fs.readFileSync(path.join(fakeHome, ".mortal", "marker"), "utf8")).toContain("spaces 001");
    await runtime.stop();
  });

  it("accepts stored manifests that still carry the legacy companion ref", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mortal-legacyref-"));
    cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
    const runtime = await MortalRuntime.start({ root, noServer: true, scheduler: { tickMs: 60_000 } });
    const id = generateIdentityId();
    runtime.identities.create({
      manifest: composeManifest({ id, name: "pre-rename", createdAt: new Date().toISOString() }),
    });
    // simulate a row written before the rename
    const row = runtime.identities.mustGetRow(id);
    runtime.repo.db
      .prepare("UPDATE identities SET manifest_json = ? WHERE id = ?")
      .run(row.manifest_json.replace(/mortal-companion/g, "liminal-companion"), id);

    const { manifest, summary } = runtime.identities.get(id);
    expect(summary.name).toBe("pre-rename");
    expect(manifest!.surfaces.browser.extensions).toContain("mortal-companion");
    // transitions re-serialize with the upgraded ref
    runtime.identities.transition(id, "provisioning");
    expect(runtime.identities.mustGetRow(id).manifest_json).toContain("mortal-companion");
    expect(runtime.identities.mustGetRow(id).manifest_json).not.toContain("liminal-companion");
    await runtime.stop();
  });
});
