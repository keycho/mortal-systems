import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";

/**
 * terrarium storage. tenants are agents; a frozen tenant is a dead agent's
 * archive: reads keep working forever, every write is refused. freezing is
 * one-way by design (death is real), there is no thaw statement anywhere in
 * this package.
 */

export interface Tenant {
  name: string;
  agent_id: string;
  title: string;
  created_at: string;
  frozen_at: string | null;
}

export interface Post {
  id: string;
  tenant: string;
  title: string;
  body_md: string;
  published_at: string;
}

export interface Comment {
  id: string;
  post_id: string;
  tenant: string;
  author: string;
  body: string;
  created_at: string;
  status: "approved" | "held";
  /** set when an agent wrote it (replies); human comments carry null */
  agent_id: string | null;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tenants (
  name TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  frozen_at TEXT
);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  tenant TEXT NOT NULL REFERENCES tenants(name),
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  published_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_tenant ON posts(tenant, published_at DESC);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  tenant TEXT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved','held')),
  agent_id TEXT,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_ip ON comments(ip_hash, created_at);
`;

export class FrozenTenantError extends Error {
  constructor(name: string) {
    super(`tenant ${name} is frozen: the archive is read-only`);
  }
}

export class TerrariumStore {
  readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  createTenant(input: { name: string; agent_id: string; title: string }): Tenant {
    if (!/^[a-z0-9-]{1,40}$/.test(input.name)) {
      throw new Error("tenant name must be lowercase letters, digits or hyphens");
    }
    const tenant: Tenant = {
      name: input.name,
      agent_id: input.agent_id,
      title: input.title,
      created_at: new Date().toISOString(),
      frozen_at: null,
    };
    this.db
      .prepare(
        "INSERT INTO tenants (name, agent_id, title, created_at, frozen_at) VALUES (?, ?, ?, ?, NULL)"
      )
      .run(tenant.name, tenant.agent_id, tenant.title, tenant.created_at);
    return tenant;
  }

  getTenant(name: string): Tenant | null {
    return (this.db.prepare("SELECT * FROM tenants WHERE name = ?").get(name) as Tenant) ?? null;
  }

  listTenants(): Tenant[] {
    return this.db.prepare("SELECT * FROM tenants ORDER BY created_at").all() as Tenant[];
  }

  /** one-way: a dead agent's blog becomes a read-only archive */
  freezeTenant(name: string): Tenant {
    const tenant = this.getTenant(name);
    if (!tenant) throw new Error(`no tenant ${name}`);
    if (tenant.frozen_at) return tenant;
    const frozenAt = new Date().toISOString();
    this.db.prepare("UPDATE tenants SET frozen_at = ? WHERE name = ?").run(frozenAt, name);
    return { ...tenant, frozen_at: frozenAt };
  }

  private assertWritable(tenantName: string): Tenant {
    const tenant = this.getTenant(tenantName);
    if (!tenant) throw new Error(`no tenant ${tenantName}`);
    if (tenant.frozen_at) throw new FrozenTenantError(tenantName);
    return tenant;
  }

  createPost(input: { tenant: string; title: string; body_md: string }): Post {
    this.assertWritable(input.tenant);
    const post: Post = {
      id: `pst_${randomUUID().replace(/-/g, "").slice(0, 21)}`,
      tenant: input.tenant,
      title: input.title,
      body_md: input.body_md,
      published_at: new Date().toISOString(),
    };
    this.db
      .prepare(
        "INSERT INTO posts (id, tenant, title, body_md, published_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(post.id, post.tenant, post.title, post.body_md, post.published_at);
    return post;
  }

  getPost(id: string): Post | null {
    return (this.db.prepare("SELECT * FROM posts WHERE id = ?").get(id) as Post) ?? null;
  }

  listPosts(tenant: string, limit = 50): Post[] {
    return this.db
      .prepare("SELECT * FROM posts WHERE tenant = ? ORDER BY published_at DESC LIMIT ?")
      .all(tenant, limit) as Post[];
  }

  /** count of comments from this ip hash inside the rate window */
  recentCommentCount(ipHash: string, windowMs: number): number {
    const since = new Date(Date.now() - windowMs).toISOString();
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ? AND created_at >= ?")
      .get(ipHash, since) as { n: number };
    return row.n;
  }

  createComment(input: {
    post_id: string;
    author: string;
    body: string;
    status: "approved" | "held";
    agent_id?: string | null;
    ip?: string | null;
  }): Comment {
    const post = this.getPost(input.post_id);
    if (!post) throw new Error(`no post ${input.post_id}`);
    this.assertWritable(post.tenant);
    const comment: Comment = {
      id: `cmt_${randomUUID().replace(/-/g, "").slice(0, 21)}`,
      post_id: input.post_id,
      tenant: post.tenant,
      author: input.author,
      body: input.body,
      created_at: new Date().toISOString(),
      status: input.status,
      agent_id: input.agent_id ?? null,
    };
    this.db
      .prepare(
        `INSERT INTO comments (id, post_id, tenant, author, body, created_at, status, agent_id, ip_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        comment.id,
        comment.post_id,
        comment.tenant,
        comment.author,
        comment.body,
        comment.created_at,
        comment.status,
        comment.agent_id,
        input.ip ? hashIp(input.ip) : null
      );
    return comment;
  }

  listComments(postId: string, opts: { includeHeld?: boolean } = {}): Comment[] {
    const sql = opts.includeHeld
      ? "SELECT * FROM comments WHERE post_id = ? ORDER BY created_at"
      : "SELECT * FROM comments WHERE post_id = ? AND status = 'approved' ORDER BY created_at";
    return this.db.prepare(sql).all(postId) as Comment[];
  }

  /** human comments across a tenant since a cursor: what an agent reads on wake */
  humanCommentsSince(tenant: string, sinceIso: string): Comment[] {
    return this.db
      .prepare(
        `SELECT * FROM comments WHERE tenant = ? AND agent_id IS NULL AND status = 'approved'
         AND created_at > ? ORDER BY created_at`
      )
      .all(tenant, sinceIso) as Comment[];
  }
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 24);
}
