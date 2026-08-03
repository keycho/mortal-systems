import type Database from "better-sqlite3";
import type { ActivityEvent, ActivityEventType, DestroyStep, IdentityState } from "@mortal/schema";

export interface IdentityRow {
  id: string;
  name: string;
  state: IdentityState;
  manifest_json: string;
  blueprint_id: string | null;
  created_at: string;
  expires_at: string | null;
  last_launched_at: string | null;
  destroyed_at: string | null;
  storage_bytes: number;
  space_number: number;
}

export interface BlueprintRow {
  id: string;
  name: string;
  version: string;
  publisher: string | null;
  review_tier: string;
  manifest_json: string;
  signature: string | null;
  source: string;
  category: string | null;
  installed_at: string;
}

export interface NoteRow {
  id: string;
  identity_id: string;
  title: string | null;
  body_md: string | null;
  updated_at: string;
}

export interface BookmarkRow {
  id: string;
  identity_id: string;
  title: string;
  url: string;
  folder: string | null;
  position: number | null;
}

export interface AiMessageRow {
  id: string;
  identity_id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface LifecycleJobRow {
  id: number;
  identity_id: string;
  fire_at: string;
  action: string;
  status: string;
}

export interface DestroyJournalRow {
  identity_id: string;
  started_at: string;
  steps_completed: DestroyStep[];
  paths_json: Record<string, string>;
}

/**
 * space numbers: identities render as numbered spaces in the ui. rows are
 * never physically deleted (destruction tombstones them), so rowid order is a
 * stable creation ordinal.
 */
const SPACE_NUMBER_SELECT =
  "(SELECT COUNT(*) FROM identities i2 WHERE i2.rowid <= identities.rowid) AS space_number";

export class Repo {
  constructor(readonly db: Database.Database) {}

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // ---- identities ----

  insertIdentity(row: {
    id: string;
    name: string;
    state: IdentityState;
    manifestJson: string;
    blueprintId: string | null;
    createdAt: string;
    expiresAt: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO identities (id, name, state, manifest_json, blueprint_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(row.id, row.name, row.state, row.manifestJson, row.blueprintId, row.createdAt, row.expiresAt);
  }

  getIdentity(id: string): IdentityRow | undefined {
    return this.db
      .prepare(`SELECT identities.*, ${SPACE_NUMBER_SELECT} FROM identities WHERE id = ?`)
      .get(id) as IdentityRow | undefined;
  }

  listIdentities(states?: IdentityState[]): IdentityRow[] {
    if (states && states.length > 0) {
      const placeholders = states.map(() => "?").join(",");
      return this.db
        .prepare(
          `SELECT identities.*, ${SPACE_NUMBER_SELECT} FROM identities
           WHERE state IN (${placeholders}) ORDER BY rowid ASC`
        )
        .all(...states) as IdentityRow[];
    }
    return this.db
      .prepare(`SELECT identities.*, ${SPACE_NUMBER_SELECT} FROM identities ORDER BY rowid ASC`)
      .all() as IdentityRow[];
  }

  updateIdentityState(id: string, state: IdentityState): void {
    this.db.prepare("UPDATE identities SET state = ? WHERE id = ?").run(state, id);
  }

  setIdentityLaunched(id: string, at: string): void {
    this.db.prepare("UPDATE identities SET last_launched_at = ? WHERE id = ?").run(at, id);
  }

  setIdentityStorageBytes(id: string, bytes: number): void {
    this.db.prepare("UPDATE identities SET storage_bytes = ? WHERE id = ?").run(bytes, id);
  }

  tombstoneIdentity(id: string, tombstoneJson: string, destroyedAt: string): void {
    this.db
      .prepare(
        "UPDATE identities SET state = 'destroyed', destroyed_at = ?, manifest_json = ?, expires_at = NULL, storage_bytes = 0 WHERE id = ?"
      )
      .run(destroyedAt, tombstoneJson, id);
  }

  // ---- children ----

  insertBookmark(row: {
    id: string;
    identityId: string;
    title: string;
    url: string;
    folder: string | null;
    position: number | null;
  }): void {
    this.db
      .prepare(
        "INSERT INTO bookmarks (id, identity_id, title, url, folder, position) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(row.id, row.identityId, row.title, row.url, row.folder, row.position);
  }

  listBookmarks(identityId: string): BookmarkRow[] {
    return this.db
      .prepare("SELECT * FROM bookmarks WHERE identity_id = ? ORDER BY position ASC, rowid ASC")
      .all(identityId) as BookmarkRow[];
  }

  insertNote(row: {
    id: string;
    identityId: string;
    title: string | null;
    bodyMd: string | null;
    updatedAt: string;
  }): void {
    this.db
      .prepare("INSERT INTO notes (id, identity_id, title, body_md, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(row.id, row.identityId, row.title, row.bodyMd, row.updatedAt);
  }

  getNote(identityId: string, noteId: string): NoteRow | undefined {
    return this.db
      .prepare("SELECT * FROM notes WHERE identity_id = ? AND id = ?")
      .get(identityId, noteId) as NoteRow | undefined;
  }

  listNotes(identityId: string): NoteRow[] {
    return this.db
      .prepare("SELECT * FROM notes WHERE identity_id = ? ORDER BY updated_at DESC")
      .all(identityId) as NoteRow[];
  }

  updateNote(identityId: string, noteId: string, title: string | null, bodyMd: string | null, updatedAt: string): boolean {
    const res = this.db
      .prepare("UPDATE notes SET title = ?, body_md = ?, updated_at = ? WHERE identity_id = ? AND id = ?")
      .run(title, bodyMd, updatedAt, identityId, noteId);
    return res.changes > 0;
  }

  deleteNote(identityId: string, noteId: string): boolean {
    const res = this.db
      .prepare("DELETE FROM notes WHERE identity_id = ? AND id = ?")
      .run(identityId, noteId);
    return res.changes > 0;
  }

  insertAiMessage(row: {
    id: string;
    identityId: string;
    role: string;
    content: string;
    createdAt: string;
  }): void {
    this.db
      .prepare("INSERT INTO ai_messages (id, identity_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(row.id, row.identityId, row.role, row.content, row.createdAt);
  }

  listAiMessages(identityId: string): AiMessageRow[] {
    return this.db
      .prepare("SELECT * FROM ai_messages WHERE identity_id = ? ORDER BY rowid ASC")
      .all(identityId) as AiMessageRow[];
  }

  /** D5: remove the identity's memory rows. safe to repeat. */
  deleteIdentityChildRows(identityId: string): { notes: number; aiMessages: number; bookmarks: number } {
    const notes = this.db.prepare("DELETE FROM notes WHERE identity_id = ?").run(identityId).changes;
    const aiMessages = this.db
      .prepare("DELETE FROM ai_messages WHERE identity_id = ?")
      .run(identityId).changes;
    const bookmarks = this.db
      .prepare("DELETE FROM bookmarks WHERE identity_id = ?")
      .run(identityId).changes;
    return { notes, aiMessages, bookmarks };
  }

  // ---- blueprints ----

  insertBlueprint(row: {
    id: string;
    name: string;
    version: string;
    publisher: string | null;
    reviewTier: string;
    manifestJson: string;
    signature: string | null;
    source: string;
    category: string | null;
    installedAt: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO blueprints (id, name, version, publisher, review_tier, manifest_json, signature, source, category, installed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.id,
        row.name,
        row.version,
        row.publisher,
        row.reviewTier,
        row.manifestJson,
        row.signature,
        row.source,
        row.category,
        row.installedAt
      );
  }

  getBlueprint(id: string): BlueprintRow | undefined {
    return this.db.prepare("SELECT * FROM blueprints WHERE id = ?").get(id) as
      | BlueprintRow
      | undefined;
  }

  listBlueprints(): BlueprintRow[] {
    return this.db.prepare("SELECT * FROM blueprints ORDER BY installed_at ASC").all() as BlueprintRow[];
  }

  findBlueprintByNameVersion(name: string, version: string): BlueprintRow | undefined {
    return this.db
      .prepare("SELECT * FROM blueprints WHERE name = ? AND version = ?")
      .get(name, version) as BlueprintRow | undefined;
  }

  // ---- activity (append-only; survives identity deletion by design) ----

  appendActivity(identityId: string, event: ActivityEventType, detail: Record<string, unknown> | null, createdAt: string): void {
    this.db
      .prepare("INSERT INTO activity_log (identity_id, event, detail_json, created_at) VALUES (?, ?, ?, ?)")
      .run(identityId, event, detail === null ? null : JSON.stringify(detail), createdAt);
  }

  readActivity(identityId: string, limit = 100): ActivityEvent[] {
    const rows = this.db
      .prepare(
        "SELECT id, identity_id, event, detail_json, created_at FROM activity_log WHERE identity_id = ? ORDER BY id DESC LIMIT ?"
      )
      .all(identityId, limit) as Array<{
      id: number;
      identity_id: string;
      event: ActivityEventType;
      detail_json: string | null;
      created_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      identityId: r.identity_id,
      event: r.event,
      detail: r.detail_json ? (JSON.parse(r.detail_json) as Record<string, unknown>) : null,
      createdAt: r.created_at,
    }));
  }

  // ---- lifecycle jobs ----

  insertLifecycleJob(identityId: string, fireAt: string, action: string): void {
    this.db
      .prepare("INSERT INTO lifecycle_jobs (identity_id, fire_at, action) VALUES (?, ?, ?)")
      .run(identityId, fireAt, action);
  }

  cancelLifecycleJobs(identityId: string): number {
    return this.db
      .prepare("UPDATE lifecycle_jobs SET status = 'cancelled' WHERE identity_id = ? AND status = 'pending'")
      .run(identityId).changes;
  }

  duePendingJobs(nowIso: string): LifecycleJobRow[] {
    return this.db
      .prepare("SELECT * FROM lifecycle_jobs WHERE status = 'pending' AND fire_at <= ? ORDER BY fire_at ASC")
      .all(nowIso) as LifecycleJobRow[];
  }

  markJobFired(jobId: number): void {
    this.db.prepare("UPDATE lifecycle_jobs SET status = 'fired' WHERE id = ?").run(jobId);
  }

  // ---- destroy journal ----

  upsertDestroyJournal(identityId: string, startedAt: string, pathsJson: Record<string, string>): void {
    this.db
      .prepare(
        `INSERT INTO destroy_journal (identity_id, started_at, steps_completed, paths_json)
         VALUES (?, ?, '[]', ?)
         ON CONFLICT(identity_id) DO NOTHING`
      )
      .run(identityId, startedAt, JSON.stringify(pathsJson));
  }

  getDestroyJournal(identityId: string): DestroyJournalRow | undefined {
    const row = this.db.prepare("SELECT * FROM destroy_journal WHERE identity_id = ?").get(identityId) as
      | { identity_id: string; started_at: string; steps_completed: string; paths_json: string }
      | undefined;
    if (!row) return undefined;
    return {
      identity_id: row.identity_id,
      started_at: row.started_at,
      steps_completed: JSON.parse(row.steps_completed) as DestroyStep[],
      paths_json: JSON.parse(row.paths_json) as Record<string, string>,
    };
  }

  listDestroyJournals(): DestroyJournalRow[] {
    const rows = this.db.prepare("SELECT * FROM destroy_journal ORDER BY started_at ASC").all() as Array<{
      identity_id: string;
      started_at: string;
      steps_completed: string;
      paths_json: string;
    }>;
    return rows.map((row) => ({
      identity_id: row.identity_id,
      started_at: row.started_at,
      steps_completed: JSON.parse(row.steps_completed) as DestroyStep[],
      paths_json: JSON.parse(row.paths_json) as Record<string, string>,
    }));
  }

  appendDestroyJournalStep(identityId: string, step: DestroyStep): void {
    const row = this.getDestroyJournal(identityId);
    if (!row) throw new Error(`destroy journal missing for ${identityId}`);
    if (!row.steps_completed.includes(step)) {
      row.steps_completed.push(step);
      this.db
        .prepare("UPDATE destroy_journal SET steps_completed = ? WHERE identity_id = ?")
        .run(JSON.stringify(row.steps_completed), identityId);
    }
  }

  deleteDestroyJournal(identityId: string): void {
    this.db.prepare("DELETE FROM destroy_journal WHERE identity_id = ?").run(identityId);
  }

  // ---- settings ----

  getSetting(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string | null }
      | undefined;
    return row?.value ?? undefined;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      )
      .run(key, value);
  }
}
