import Database from "better-sqlite3";
import { migrate } from "./migrations.js";

/**
 * open (creating if needed) the runtime database: wal mode, foreign keys on,
 * single writer (the runtime process). migrations run at open time.
 */
export function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  migrate(db);
  return db;
}
