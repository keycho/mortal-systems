import type Database from "better-sqlite3";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * forward-only numbered migrations, tracked via PRAGMA user_version, applied
 * in a transaction at runtime startup. migrations never rewrite manifest_json
 * contents; manifest versioning is handled by @mortal/schema upgraders at
 * read time.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "0001_baseline",
    sql: `
CREATE TABLE identities (id TEXT PRIMARY KEY, name TEXT NOT NULL, state TEXT NOT NULL,
  manifest_json TEXT NOT NULL, blueprint_id TEXT, created_at TEXT NOT NULL, expires_at TEXT,
  last_launched_at TEXT, destroyed_at TEXT, storage_bytes INTEGER DEFAULT 0);
CREATE INDEX idx_identities_expiry ON identities(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_identities_state ON identities(state);
CREATE TABLE blueprints (id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL,
  publisher TEXT, review_tier TEXT NOT NULL DEFAULT 'standard', manifest_json TEXT NOT NULL,
  signature TEXT, source TEXT NOT NULL, category TEXT, installed_at TEXT NOT NULL);
CREATE TABLE bookmarks (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, title TEXT NOT NULL,
  url TEXT NOT NULL, folder TEXT, position INTEGER);
CREATE INDEX idx_bookmarks_identity ON bookmarks(identity_id);
CREATE TABLE notes (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, title TEXT,
  body_md TEXT, updated_at TEXT NOT NULL);
CREATE INDEX idx_notes_identity ON notes(identity_id);
CREATE TABLE ai_messages (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, role TEXT NOT NULL,
  content TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX idx_ai_messages_identity ON ai_messages(identity_id);
CREATE TABLE activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, identity_id TEXT NOT NULL,
  event TEXT NOT NULL, detail_json TEXT, created_at TEXT NOT NULL);
CREATE INDEX idx_activity_identity ON activity_log(identity_id);
CREATE TABLE lifecycle_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, identity_id TEXT NOT NULL,
  fire_at TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending');
CREATE INDEX idx_jobs_fire ON lifecycle_jobs(status, fire_at);
CREATE TABLE destroy_journal (identity_id TEXT PRIMARY KEY, started_at TEXT NOT NULL,
  steps_completed TEXT NOT NULL DEFAULT '[]', paths_json TEXT NOT NULL);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
`,
  },
];

/** apply pending migrations. each migration runs inside a transaction. */
export function migrate(db: Database.Database, migrations: Migration[] = MIGRATIONS): void {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  for (const m of sorted) {
    const current = db.pragma("user_version", { simple: true }) as number;
    if (m.version <= current) continue;
    if (m.version !== current + 1) {
      throw new Error(
        `migration chain broken: at user_version ${current}, next migration is ${m.version} (${m.name})`
      );
    }
    const apply = db.transaction(() => {
      db.exec(m.sql);
      db.pragma(`user_version = ${m.version}`);
    });
    apply();
  }
}
