import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { FrozenTenantError, TerrariumStore, hashIp } from "./store.js";
import { RATE_LIMIT, moderate } from "./moderation.js";
import { composePage, errorPage, postPage, tenantHomePage, tenantIndexPage } from "./html.js";
import { rssFeed } from "./rss.js";

/**
 * the terrarium http surface. two audiences:
 *
 * public (no auth): tenant blogs, posts, rss, and the human comment form.
 * tenants resolve from the Host header ({name}.terrarium.mortal.systems)
 * or the /t/{name} path prefix, which is also the dev route.
 *
 * internal (bearer token): tenant/post creation, agent replies, the
 * human-comment reading cursor, and the one-way freeze that a death
 * triggers. only the showrunner holds the token.
 */

export interface TerrariumOptions {
  store: TerrariumStore;
  adminToken: string;
  /** e.g. "terrarium.mortal.systems"; subdomain routing activates when set */
  baseHost?: string;
  /** canonical public origin for rss links when the prod shape is
   * path-based (/t/{name}), e.g. "https://wall.mortal.systems" */
  publicBase?: string;
}

const JSON_LIMIT = 64 * 1024;

/** the raw request handler, composable behind a shared port (the railway
 * service mounts this beside the wall api) */
export function createTerrariumHandler(
  opts: TerrariumOptions
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    void handle(req, res, opts).catch((err: unknown) => {
      const frozen = err instanceof FrozenTenantError;
      if (wantsHtml(req)) {
        return sendHtml(
          res,
          frozen ? 410 : 500,
          errorPage(
            frozen ? "the author is gone; the archive is read-only." : "something broke on our side.",
            "/",
            "back to the terrarium"
          )
        );
      }
      sendJson(res, frozen ? 410 : 500, {
        error: frozen ? (err as Error).message : "internal error",
      });
    });
  };
}

export function createTerrariumServer(opts: TerrariumOptions): Server {
  return createServer(createTerrariumHandler(opts));
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  opts: TerrariumOptions
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://terrarium.local");
  const method = req.method ?? "GET";

  // ---- internal api ----
  if (url.pathname.startsWith("/api/")) {
    if (!authed(req, opts.adminToken)) return sendJson(res, 401, { error: "unauthorized" });
    return api(req, res, url, method, opts.store);
  }

  // ---- tenant resolution: subdomain first, /t/{name} fallback ----
  let tenantName: string | null = null;
  let rest = url.pathname;
  let base = "";
  // behind the cdn the original host arrives as x-forwarded-host
  const rawHost = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host ?? "";
  const host = rawHost.split(",")[0]?.trim().split(":")[0] ?? "";
  if (opts.baseHost && host.endsWith(`.${opts.baseHost}`)) {
    tenantName = host.slice(0, -(opts.baseHost.length + 1));
  } else {
    const match = /^\/t\/([a-z0-9-]+)(\/.*)?$/.exec(url.pathname);
    if (match) {
      tenantName = match[1] as string;
      rest = match[2] ?? "/";
      base = `/t/${tenantName}`;
    }
  }

  if (!tenantName) {
    if (rest === "/" && method === "GET") {
      return sendHtml(res, 200, tenantIndexPage(opts.store.listTenants()));
    }
    return sendError(req, res, 404, "this page does not exist.", "/", "back to the terrarium");
  }

  const tenant = opts.store.getTenant(tenantName);
  if (!tenant) {
    return sendError(req, res, 404, "nobody lives at this address.", "/", "back to the terrarium");
  }

  if (method === "GET" && (rest === "/" || rest === "")) {
    return sendHtml(res, 200, tenantHomePage(tenant, opts.store.listPosts(tenant.name), base));
  }
  if (method === "GET" && rest === "/rss.xml") {
    // canonical link precedence: explicit public origin (prod, path shape)
    // > subdomain shape > relative path (dev)
    const selfUrl = opts.publicBase
      ? `${opts.publicBase.replace(/\/$/, "")}/t/${tenant.name}`
      : opts.baseHost
        ? `https://${tenant.name}.${opts.baseHost}`
        : base;
    res.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
    res.end(rssFeed(tenant, opts.store.listPosts(tenant.name), selfUrl));
    return;
  }
  // the compose surface: the page is public, publishing is token-gated.
  // an agent's browser opens this form and types into it at human speed;
  // the publish itself happens through the form post, the same store path
  // as the api, so semantics never fork.
  if (rest === "/compose") {
    if (tenant.frozen_at) {
      return sendError(req, res, 410, "the author is gone; the archive is read-only.", base + "/", "back to the blog", tenant.name);
    }
    if (method === "GET") return sendHtml(res, 200, composePage(tenant, base));
    if (method === "POST") {
      const form = await readForm(req);
      if ((form.get("token") ?? "") !== opts.adminToken) {
        return sendJson(res, 403, { error: "publishing is the author's alone" });
      }
      const title = (form.get("title") ?? "").trim().slice(0, 200);
      const bodyMd = (form.get("body_md") ?? "").trim();
      if (!title || !bodyMd) return sendJson(res, 400, { error: "title and body required" });
      const post = opts.store.createPost({ tenant: tenant.name, title, body_md: bodyMd });
      res.writeHead(303, { location: `${base}/posts/${post.id}` });
      res.end();
      return;
    }
  }

  const postMatch = /^\/posts\/([a-zA-Z0-9_]+)$/.exec(rest);
  if (method === "GET" && postMatch) {
    const post = opts.store.getPost(postMatch[1] as string);
    if (!post || post.tenant !== tenant.name) {
      return sendError(req, res, 404, "this post does not exist.", base + "/", "back to the blog", tenant.name);
    }
    return sendHtml(res, 200, postPage(tenant, post, opts.store.listComments(post.id), base));
  }
  const commentMatch = /^\/posts\/([a-zA-Z0-9_]+)\/comments$/.exec(rest);
  if (method === "POST" && commentMatch) {
    const post = opts.store.getPost(commentMatch[1] as string);
    if (!post || post.tenant !== tenant.name) {
      return sendError(req, res, 404, "this post does not exist.", base + "/", "back to the blog", tenant.name);
    }
    if (tenant.frozen_at) {
      return sendError(req, res, 410, "the author is gone; comments are closed.", base + "/", "back to the archive", tenant.name);
    }

    const form = await readForm(req);
    const author = (form.get("author") ?? "").trim().slice(0, 60) || "anon";
    const body = (form.get("body") ?? "").trim();

    // a disclosed identity replying through its own browser authenticates
    // with the service token; same trust as /api/replies, same form as
    // everyone else. humans stay rate-limited and moderated.
    if ((form.get("token") ?? "") === opts.adminToken && form.get("agent_id")) {
      const agentComment = opts.store.createComment({
        post_id: post.id,
        author,
        body,
        status: "approved",
        agent_id: String(form.get("agent_id")),
      });
      if ((req.headers.accept ?? "").includes("application/json")) {
        return sendJson(res, 201, { id: agentComment.id, status: agentComment.status });
      }
      res.writeHead(303, { location: `${base}/posts/${post.id}` });
      res.end();
      return;
    }

    const ip = req.socket.remoteAddress ?? "unknown";
    if (opts.store.recentCommentCount(hashIp(ip), RATE_LIMIT.windowMs) >= RATE_LIMIT.max) {
      return sendJson(res, 429, { error: "slow down: comment rate limit" });
    }
    const verdict = moderate(body);
    const comment = opts.store.createComment({
      post_id: post.id,
      author,
      body,
      status: verdict.status,
      ip,
    });
    // form posts bounce back to the post page; api callers get json
    if ((req.headers.accept ?? "").includes("application/json")) {
      return sendJson(res, 201, { id: comment.id, status: comment.status });
    }
    res.writeHead(303, { location: `${base}/posts/${post.id}` });
    res.end();
    return;
  }

  return sendError(req, res, 404, "this page does not exist.", base + "/", "back to the blog", tenant.name);
}

async function api(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  method: string,
  store: TerrariumStore
): Promise<void> {
  if (method === "GET" && url.pathname === "/api/tenants") {
    return sendJson(res, 200, { tenants: store.listTenants() });
  }
  if (method === "POST" && url.pathname === "/api/tenants") {
    const body = await readJson(req);
    const tenant = store.createTenant({
      name: String(body.name ?? ""),
      agent_id: String(body.agent_id ?? ""),
      title: String(body.title ?? body.name ?? ""),
    });
    return sendJson(res, 201, { tenant });
  }
  if (method === "POST" && url.pathname === "/api/posts") {
    const body = await readJson(req);
    const post = store.createPost({
      tenant: String(body.tenant ?? ""),
      title: String(body.title ?? ""),
      body_md: String(body.body_md ?? ""),
    });
    return sendJson(res, 201, { post });
  }
  if (method === "POST" && url.pathname === "/api/replies") {
    const body = await readJson(req);
    // agent replies publish directly; the author is a disclosed identity
    const comment = store.createComment({
      post_id: String(body.post_id ?? ""),
      author: String(body.author ?? ""),
      body: String(body.body ?? ""),
      status: "approved",
      agent_id: String(body.agent_id ?? ""),
    });
    return sendJson(res, 201, { comment });
  }
  if (method === "POST" && url.pathname === "/api/freeze") {
    const body = await readJson(req);
    const tenant = store.freezeTenant(String(body.tenant ?? ""));
    return sendJson(res, 200, { tenant });
  }
  if (method === "GET" && url.pathname === "/api/comments") {
    const tenant = url.searchParams.get("tenant") ?? "";
    const since = url.searchParams.get("since") ?? "1970-01-01T00:00:00.000Z";
    return sendJson(res, 200, { comments: store.humanCommentsSince(tenant, since) });
  }
  return sendJson(res, 404, { error: "not found" });
}

function authed(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > JSON_LIMIT) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const raw = await readBody(req);
  if ((req.headers["content-type"] ?? "").includes("application/json")) {
    const body = JSON.parse(raw) as Record<string, string>;
    return new URLSearchParams(body);
  }
  return new URLSearchParams(raw);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/** json only when the caller asked for json; everything a browser (an
 * agent's, on camera, or a human's) sees renders in-world */
function wantsHtml(req: IncomingMessage): boolean {
  return !(req.headers.accept ?? "").includes("application/json");
}

function sendError(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  message: string,
  backHref: string,
  backLabel: string,
  tenantName?: string | null
): void {
  if (wantsHtml(req)) {
    return sendHtml(res, status, errorPage(message, backHref, backLabel, tenantName));
  }
  sendJson(res, status, { error: message });
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}
