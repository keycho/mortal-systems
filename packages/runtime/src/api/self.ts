import fs from "node:fs";
import path from "node:path";
import type http from "node:http";
import { z, ZodError } from "zod";
import {
  ENFORCEMENT_TABLE,
  randomId,
  toValidationIssues,
  type Enforcement,
} from "@liminal/schema";
import { errors, RuntimeError } from "../errors.js";
import { computeUnpackedExtensionId } from "../launcher/extension-id.js";
import type { LiminalRuntime } from "../runtime.js";

/**
 * the companion's identity-scoped surface. every route derives the identity
 * from the bearer token; there is no route that can name another identity,
 * and note/message ids are always scoped by identity in the query. the
 * runtime treats every request as untrusted input: validated bodies, size
 * caps, rate limits, and a chrome-extension origin pin per identity.
 */

const MAX_SELF_BODY = 64 * 1024;

const noteBody = z
  .object({ title: z.string().max(200).nullable().optional(), bodyMd: z.string().max(50_000).nullable().optional() })
  .strict();
const aiMessageBody = z
  .object({ role: z.enum(["user", "assistant"]).optional(), content: z.string().min(1).max(50_000) })
  .strict();
const aiKeyBody = z.object({ key: z.string().min(8).max(500).nullable() }).strict();

// ---- per-token rate limiting (sse exempt) ----

interface Bucket {
  count: number;
  resetAt: number;
}
const RATE_LIMIT = 120; // requests per minute per token
const buckets = new Map<string, Bucket>();

function checkRate(token: string): void {
  const now = Date.now();
  const bucket = buckets.get(token);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(token, { count: 1, resetAt: now + 60_000 });
    return;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT) {
    throw new RuntimeError("RATE_LIMITED", "too many requests");
  }
}

/** in-memory only, per spec: ai keys are never persisted anywhere */
const aiKeys = new Map<string, string>();

function readBody(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(errors.payloadTooLarge(maxBytes));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseJson<T>(raw: Buffer, schema: z.ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = raw.length === 0 ? {} : JSON.parse(raw.toString("utf8"));
  } catch {
    throw errors.validation("request body is not valid json");
  }
  try {
    return schema.parse(parsed);
  } catch (err) {
    if (err instanceof ZodError) throw errors.validation("invalid request body", toValidationIssues(err));
    throw err;
  }
}

/**
 * origin pinning: requests carrying an Origin header must present exactly the
 * chrome-extension origin of this identity's stamped companion instance.
 * (browser pages always send an Origin on cross-origin fetches, so a
 * malicious website probing 127.0.0.1 is refused here even if it somehow held
 * a token. token-only local processes without an Origin are inside the local
 * trust boundary by definition.)
 */
function checkOrigin(runtime: LiminalRuntime, identityId: string, req: http.IncomingMessage): void {
  const origin = req.headers.origin;
  if (origin === undefined || origin === "" || origin === "null") return;
  const accepted = new Set<string>();
  // preferred: the id chromium actually assigned, observed by the launcher.
  // prediction can diverge from chromium's path canonicalization on some
  // platforms (macos firmlinks/symlinked tmp), so observation wins.
  const observed = runtime.launcher?.observedExtensionIdFor(identityId) ?? null;
  if (observed !== null) accepted.add(`chrome-extension://${observed}`);
  // fallback: the computed id from the canonical instance path (covers the
  // window before the first observation lands)
  const instanceDir = path.join(runtime.root, "companion-instances", identityId);
  try {
    if (fs.existsSync(path.join(instanceDir, "manifest.json"))) {
      accepted.add(`chrome-extension://${computeUnpackedExtensionId(fs.realpathSync(instanceDir))}`);
    }
  } catch {}
  if (accepted.size === 0) {
    // no stamped instance yet: any browser-originated request is refused
    throw errors.forbidden("no companion instance is provisioned for this identity");
  }
  if (!accepted.has(origin)) {
    throw errors.forbidden("origin is not this identity's companion instance");
  }
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

function remainingMs(expiresAt: string | null): number | null {
  if (expiresAt === null) return null;
  return Math.max(0, Date.parse(expiresAt) - Date.now());
}

const enforcementDescriptions = new Map(ENFORCEMENT_TABLE.map((r) => [r.field, r.description]));

export interface PermissionRow {
  field: string;
  value: string;
  enforcement: Enforcement;
  description: string;
}

/**
 * handle a /v1/self request. returns true when the request was handled.
 * throws RuntimeError for auth/validation failures (mapped by the caller).
 */
export async function handleSelfRequest(
  runtime: LiminalRuntime,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  bearer: string
): Promise<boolean> {
  if (!url.pathname.startsWith("/v1/self")) return false;

  if (bearer.length === 0) throw errors.unauthorized();
  const identityId = runtime.identityForCompanionToken(bearer);
  if (identityId === null) throw errors.unauthorized("token does not map to a live identity");
  checkOrigin(runtime, identityId, req);

  const method = req.method ?? "GET";
  const subpath = url.pathname.slice("/v1/self".length) || "/";

  // sse stream (rate-limit exempt)
  if (method === "GET" && subpath === "/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    res.write(": connected\n\n");
    const unsubscribe = runtime.events.subscribe(identityId, (event) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    req.on("close", unsubscribe);
    return true;
  }

  checkRate(bearer);

  if (method === "GET" && subpath === "/") {
    const { summary, manifest } = runtime.identities.get(identityId);
    send(res, 200, { summary, manifest, remainingMs: remainingMs(summary.expiresAt) });
    return true;
  }

  if (subpath === "/notes" || subpath.startsWith("/notes/")) {
    const noteId = subpath.startsWith("/notes/") ? subpath.slice("/notes/".length) : null;
    if (method === "GET" && noteId === null) {
      send(
        res,
        200,
        runtime.repo.listNotes(identityId).map((n) => ({
          id: n.id,
          title: n.title,
          bodyMd: n.body_md,
          updatedAt: n.updated_at,
        }))
      );
      return true;
    }
    if (method === "POST" && noteId === null) {
      const body = parseJson(await readBody(req, MAX_SELF_BODY), noteBody);
      const note = {
        id: `not_${randomId(21)}`,
        identityId,
        title: body.title ?? null,
        bodyMd: body.bodyMd ?? null,
        updatedAt: new Date().toISOString(),
      };
      runtime.repo.insertNote(note);
      send(res, 201, { id: note.id, title: note.title, bodyMd: note.bodyMd, updatedAt: note.updatedAt });
      return true;
    }
    if (noteId !== null && method === "GET") {
      const row = runtime.repo.getNote(identityId, noteId);
      if (!row) throw errors.notFound("note", noteId);
      send(res, 200, { id: row.id, title: row.title, bodyMd: row.body_md, updatedAt: row.updated_at });
      return true;
    }
    if (noteId !== null && method === "PUT") {
      const body = parseJson(await readBody(req, MAX_SELF_BODY), noteBody);
      const existing = runtime.repo.getNote(identityId, noteId);
      if (!existing) throw errors.notFound("note", noteId);
      const updatedAt = new Date().toISOString();
      runtime.repo.updateNote(
        identityId,
        noteId,
        body.title !== undefined ? body.title : existing.title,
        body.bodyMd !== undefined ? body.bodyMd : existing.body_md,
        updatedAt
      );
      const row = runtime.repo.getNote(identityId, noteId)!;
      send(res, 200, { id: row.id, title: row.title, bodyMd: row.body_md, updatedAt: row.updated_at });
      return true;
    }
    if (noteId !== null && method === "DELETE") {
      if (!runtime.repo.deleteNote(identityId, noteId)) throw errors.notFound("note", noteId);
      send(res, 200, { ok: true });
      return true;
    }
  }

  if (method === "GET" && subpath === "/ai/context") {
    const { manifest } = runtime.identities.get(identityId);
    send(res, 200, {
      systemInstructions: manifest?.ai.systemInstructions ?? "",
      provider: manifest?.ai.provider ?? "none",
      historyRetention: manifest?.ai.historyRetention ?? "until-destroy",
    });
    return true;
  }

  if (subpath === "/ai/messages") {
    if (method === "GET") {
      send(
        res,
        200,
        runtime.repo.listAiMessages(identityId).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.created_at,
        }))
      );
      return true;
    }
    if (method === "POST") {
      const body = parseJson(await readBody(req, MAX_SELF_BODY), aiMessageBody);
      const message = {
        id: `msg_${randomId(21)}`,
        identityId,
        role: body.role ?? "user",
        content: body.content,
        createdAt: new Date().toISOString(),
      };
      runtime.repo.insertAiMessage(message);
      send(res, 201, { id: message.id, role: message.role, content: message.content, createdAt: message.createdAt });
      return true;
    }
  }

  if (subpath === "/ai/key") {
    // the user's provider key is held in runtime memory only, never persisted,
    // never written into extension storage. it dies with the runtime process.
    if (method === "GET") {
      send(res, 200, { key: aiKeys.get(identityId) ?? null });
      return true;
    }
    if (method === "POST") {
      const body = parseJson(await readBody(req, MAX_SELF_BODY), aiKeyBody);
      if (body.key === null) aiKeys.delete(identityId);
      else aiKeys.set(identityId, body.key);
      send(res, 200, { ok: true, stored: body.key !== null });
      return true;
    }
  }

  if (method === "GET" && subpath === "/permissions") {
    const { manifest } = runtime.identities.get(identityId);
    if (!manifest) throw errors.invalidState("identity has no manifest");
    const rows: PermissionRow[] = [
      { field: "permissions.filesystem", ...manifest.permissions.filesystem },
      { field: "permissions.memoryScope", ...manifest.permissions.memoryScope },
      { field: "permissions.wallet", ...manifest.permissions.wallet },
      { field: "permissions.email", ...manifest.permissions.email },
      { field: "permissions.network", ...manifest.permissions.network },
      {
        field: "privacy.retainHistory",
        value: String(manifest.privacy.retainHistory.value),
        enforcement: manifest.privacy.retainHistory.enforcement,
      },
      {
        field: "privacy.redaction",
        value: String(manifest.privacy.redaction.value),
        enforcement: manifest.privacy.redaction.enforcement,
      },
    ].map((r) => ({ ...r, description: enforcementDescriptions.get(r.field) ?? "" }));
    send(res, 200, rows);
    return true;
  }

  if (method === "POST" && subpath === "/expire") {
    // the side panel confirms before calling; the runtime just executes
    await runtime.expire(identityId);
    send(res, 200, { ok: true });
    return true;
  }

  throw new RuntimeError("NOT_FOUND", `no self route for ${method} ${subpath}`);
}
