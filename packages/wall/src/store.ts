import Database from "better-sqlite3";
import {
  RECEIPT_KINDS,
  WallEventSchema,
  type WallEvent,
  type WallEventInput,
  type WallEventKind,
} from "./schema.js";
import { receiptHash } from "./receipt.js";
import { ulid } from "./ulid.js";

/**
 * the append-only event store. death is real at the storage layer too:
 * sqlite triggers raise on any UPDATE or DELETE against wall_events, so the
 * stream cannot be rewritten even by code holding the database handle. the
 * store assigns id (ulid, sorts in append order), ts, and the receipt hash
 * for spawn/death/enforcement; producers cannot forge any of them.
 */

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS wall_events (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public','internal')),
  primitive TEXT,
  receipt TEXT
);
CREATE INDEX IF NOT EXISTS idx_wall_events_agent ON wall_events(agent_id, id);
CREATE INDEX IF NOT EXISTS idx_wall_events_kind ON wall_events(kind, id);
CREATE TRIGGER IF NOT EXISTS wall_events_no_update
  BEFORE UPDATE ON wall_events
  BEGIN SELECT RAISE(ABORT, 'wall_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS wall_events_no_delete
  BEFORE DELETE ON wall_events
  BEGIN SELECT RAISE(ABORT, 'wall_events is append-only'); END;
`;

export interface ListOptions {
  /** return events with id strictly greater than this cursor */
  afterId?: string;
  agentId?: string;
  kinds?: WallEventKind[];
  /** iso timestamp lower bound (inclusive) */
  since?: string;
  publicOnly?: boolean;
  /** newest first when true; default oldest first (append order) */
  newestFirst?: boolean;
  limit?: number;
}

type Row = {
  id: string;
  ts: string;
  agent_id: string;
  kind: string;
  payload_json: string;
  visibility: string;
  primitive: string | null;
  receipt: string | null;
};

function rowToEvent(row: Row): WallEvent {
  return {
    id: row.id,
    ts: row.ts,
    agent_id: row.agent_id,
    kind: row.kind as WallEventKind,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    visibility: row.visibility as "public" | "internal",
    primitive: row.primitive ?? undefined,
    receipt: row.receipt ?? undefined,
  };
}

export class WallStore {
  readonly db: Database.Database;
  private readonly subscribers = new Set<(event: WallEvent) => void>();

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("synchronous = NORMAL");
    this.db.exec(SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
    this.subscribers.clear();
  }

  /** validate, stamp, persist, fan out. returns the stored event. */
  append<K extends WallEventKind>(input: WallEventInput<K>): WallEvent {
    const id = ulid();
    const ts = input.ts ?? new Date().toISOString();
    const base = {
      id,
      ts,
      agent_id: input.agent_id,
      kind: input.kind,
      payload: input.payload as Record<string, unknown>,
      visibility: input.visibility,
      primitive: input.primitive,
    };
    const receipt = RECEIPT_KINDS.includes(input.kind) ? receiptHash(base) : undefined;
    const event = WallEventSchema.parse({ ...base, receipt }) as WallEvent;
    this.db
      .prepare(
        `INSERT INTO wall_events (id, ts, agent_id, kind, payload_json, visibility, primitive, receipt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.id,
        event.ts,
        event.agent_id,
        event.kind,
        JSON.stringify(event.payload),
        event.visibility,
        event.primitive ?? null,
        event.receipt ?? null
      );
    for (const push of this.subscribers) push(event);
    return event;
  }

  list(opts: ListOptions = {}): WallEvent[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.afterId) {
      where.push("id > ?");
      params.push(opts.afterId);
    }
    if (opts.agentId) {
      where.push("agent_id = ?");
      params.push(opts.agentId);
    }
    if (opts.kinds && opts.kinds.length > 0) {
      where.push(`kind IN (${opts.kinds.map(() => "?").join(",")})`);
      params.push(...opts.kinds);
    }
    if (opts.since) {
      where.push("ts >= ?");
      params.push(opts.since);
    }
    if (opts.publicOnly) {
      where.push("visibility = 'public'");
    }
    const sql = `SELECT * FROM wall_events${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
      ORDER BY id ${opts.newestFirst ? "DESC" : "ASC"}${opts.limit ? ` LIMIT ${Math.floor(opts.limit)}` : ""}`;
    return (this.db.prepare(sql).all(...params) as Row[]).map(rowToEvent);
  }

  get(id: string): WallEvent | null {
    const row = this.db.prepare("SELECT * FROM wall_events WHERE id = ?").get(id) as
      | Row
      | undefined;
    return row ? rowToEvent(row) : null;
  }

  /** live fan-out for sse; delivery is in-process and best effort, the
   * table is the durable record */
  subscribe(push: (event: WallEvent) => void): () => void {
    this.subscribers.add(push);
    return () => this.subscribers.delete(push);
  }
}
