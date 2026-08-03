import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "../src/store/db.js";
import { migrate, MIGRATIONS } from "../src/store/migrations.js";
import { Repo } from "../src/store/repo.js";

const tmpDirs: string[] = [];

function tmpDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "liminal-store-"));
  tmpDirs.push(dir);
  return path.join(dir, "liminal.db");
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("migration chain", () => {
  it("brings a fresh db to the latest user_version with wal and foreign keys", () => {
    const db = openDb(tmpDb());
    expect(db.pragma("user_version", { simple: true })).toBe(1);
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
        name: string;
      }[]
    ).map((t) => t.name);
    for (const required of [
      "identities",
      "blueprints",
      "bookmarks",
      "notes",
      "ai_messages",
      "activity_log",
      "lifecycle_jobs",
      "destroy_journal",
      "settings",
    ]) {
      expect(tables).toContain(required);
    }
    db.close();
  });

  it("is idempotent across reopen", () => {
    const file = tmpDb();
    openDb(file).close();
    const db = openDb(file);
    expect(db.pragma("user_version", { simple: true })).toBe(1);
    db.close();
  });

  it("refuses a broken chain (version gap)", () => {
    const db = openDb(tmpDb());
    expect(() =>
      migrate(db, [...MIGRATIONS, { version: 3, name: "0003_gap", sql: "CREATE TABLE x (id TEXT);" }])
    ).toThrow(/migration chain broken/);
    db.close();
  });

  it("applies each migration transactionally: a failing migration leaves no partial state", () => {
    const db = openDb(tmpDb());
    expect(() =>
      migrate(db, [
        ...MIGRATIONS,
        {
          version: 2,
          name: "0002_bad",
          sql: "CREATE TABLE half_done (id TEXT); CREATE TABLE half_done (id TEXT);",
        },
      ])
    ).toThrow();
    expect(db.pragma("user_version", { simple: true })).toBe(1);
    const half = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='half_done'")
      .get();
    expect(half).toBeUndefined();
    db.close();
  });
});

describe("repo", () => {
  it("assigns stable, monotonic space numbers by creation order", () => {
    const repo = new Repo(openDb(tmpDb()));
    const now = new Date().toISOString();
    for (const id of ["idn_aaaaaaaaaaaaaaaaaaaaa", "idn_bbbbbbbbbbbbbbbbbbbbb", "idn_ccccccccccccccccccccc"]) {
      repo.insertIdentity({
        id,
        name: id.slice(4, 7),
        state: "created",
        manifestJson: "{}",
        blueprintId: null,
        createdAt: now,
        expiresAt: null,
      });
    }
    const rows = repo.listIdentities();
    expect(rows.map((r) => r.space_number)).toEqual([1, 2, 3]);
    // tombstoning keeps the row, so later numbers do not shift
    repo.tombstoneIdentity("idn_bbbbbbbbbbbbbbbbbbbbb", "{}", now);
    expect(repo.listIdentities().map((r) => r.space_number)).toEqual([1, 2, 3]);
    repo.db.close();
  });

  it("round-trips activity, jobs, journal, and settings", () => {
    const repo = new Repo(openDb(tmpDb()));
    const now = "2026-08-03T12:00:00.000Z";
    repo.appendActivity("idn_x", "created", { by: "test" }, now);
    repo.appendActivity("idn_x", "error", null, now);
    const events = repo.readActivity("idn_x");
    expect(events).toHaveLength(2);
    expect(events[1]?.event).toBe("created");
    expect(events[1]?.detail).toEqual({ by: "test" });
    expect(events[0]?.detail).toBeNull();

    repo.insertLifecycleJob("idn_x", "2026-08-03T12:05:00.000Z", "destroy");
    expect(repo.duePendingJobs("2026-08-03T12:04:00.000Z")).toHaveLength(0);
    expect(repo.duePendingJobs("2026-08-03T12:06:00.000Z")).toHaveLength(1);
    expect(repo.cancelLifecycleJobs("idn_x")).toBe(1);
    expect(repo.duePendingJobs("2026-08-03T12:06:00.000Z")).toHaveLength(0);

    repo.upsertDestroyJournal("idn_x", now, { profileDir: "/tmp/p" });
    repo.upsertDestroyJournal("idn_x", "later", { profileDir: "/tmp/ignored" });
    const journal = repo.getDestroyJournal("idn_x");
    expect(journal?.started_at).toBe(now);
    expect(journal?.paths_json).toEqual({ profileDir: "/tmp/p" });
    repo.appendDestroyJournalStep("idn_x", "D0");
    repo.appendDestroyJournalStep("idn_x", "D0");
    repo.appendDestroyJournalStep("idn_x", "D1");
    expect(repo.getDestroyJournal("idn_x")?.steps_completed).toEqual(["D0", "D1"]);
    repo.deleteDestroyJournal("idn_x");
    expect(repo.getDestroyJournal("idn_x")).toBeUndefined();

    repo.setSetting("k", "v1");
    repo.setSetting("k", "v2");
    expect(repo.getSetting("k")).toBe("v2");
    expect(repo.getSetting("missing")).toBeUndefined();
    repo.db.close();
  });

  it("deletes child rows idempotently (D5 semantics)", () => {
    const repo = new Repo(openDb(tmpDb()));
    const now = new Date().toISOString();
    repo.insertNote({ id: "n1", identityId: "idn_x", title: "t", bodyMd: "b", updatedAt: now });
    repo.insertBookmark({ id: "b1", identityId: "idn_x", title: "t", url: "https://x.io", folder: null, position: 0 });
    repo.insertAiMessage({ id: "m1", identityId: "idn_x", role: "user", content: "hi", createdAt: now });
    repo.insertNote({ id: "n2", identityId: "idn_other", title: "keep", bodyMd: "keep", updatedAt: now });

    const first = repo.deleteIdentityChildRows("idn_x");
    expect(first).toEqual({ notes: 1, aiMessages: 1, bookmarks: 1 });
    const second = repo.deleteIdentityChildRows("idn_x");
    expect(second).toEqual({ notes: 0, aiMessages: 0, bookmarks: 0 });
    expect(repo.listNotes("idn_other")).toHaveLength(1);
    repo.db.close();
  });
});
