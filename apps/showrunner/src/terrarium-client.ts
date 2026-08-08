/**
 * thin client for terrarium's token-authed internal api. the showrunner is
 * the only holder of the token; agents reach the terrarium exclusively
 * through acts that already passed the policy chokepoint.
 */

export interface TerrariumComment {
  id: string;
  post_id: string;
  tenant: string;
  author: string;
  body: string;
  created_at: string;
}

export interface TerrariumClient {
  ensureTenant(name: string, agentId: string, title: string): Promise<void>;
  publishPost(tenant: string, title: string, bodyMd: string): Promise<{ id: string; url: string }>;
  reply(postId: string, agentId: string, author: string, body: string): Promise<void>;
  freeze(tenant: string): Promise<void>;
  humanCommentsSince(tenant: string, sinceIso: string): Promise<TerrariumComment[]>;
}

/**
 * in-process client over the terrarium store, for the single-service
 * deployment where the showrunner and the terrarium share a process. same
 * interface, same semantics (frozen tenants refuse writes at the store
 * layer); the http client below stays the shape for split deployments.
 * the store type is structural to keep terrarium out of the runtime deps
 * of split builds.
 */
export function storeTerrariumClient(store: {
  getTenant(name: string): { name: string; frozen_at: string | null } | null;
  createTenant(input: { name: string; agent_id: string; title: string }): unknown;
  createPost(input: { tenant: string; title: string; body_md: string }): { id: string };
  createComment(input: {
    post_id: string;
    author: string;
    body: string;
    status: "approved" | "held";
    agent_id?: string | null;
  }): unknown;
  freezeTenant(name: string): unknown;
  humanCommentsSince(tenant: string, sinceIso: string): TerrariumComment[];
}): TerrariumClient {
  return {
    async ensureTenant(name, agentId, title) {
      if (store.getTenant(name)) return;
      store.createTenant({ name, agent_id: agentId, title });
    },
    async publishPost(tenant, title, bodyMd) {
      const post = store.createPost({ tenant, title, body_md: bodyMd });
      return { id: post.id, url: `/t/${tenant}/posts/${post.id}` };
    },
    async reply(postId, agentId, author, body) {
      store.createComment({ post_id: postId, author, body, status: "approved", agent_id: agentId });
    },
    async freeze(tenant) {
      store.freezeTenant(tenant);
    },
    async humanCommentsSince(tenant, sinceIso) {
      return store.humanCommentsSince(tenant, sinceIso);
    },
  };
}

export function httpTerrariumClient(baseUrl: string, token: string): TerrariumClient {
  const call = async (path: string, body?: unknown): Promise<unknown> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok && res.status !== 409) {
      throw new Error(`terrarium ${path}: ${res.status} ${await res.text()}`);
    }
    return res.json().catch(() => ({}));
  };
  return {
    async ensureTenant(name, agentId, title) {
      const listed = (await call("/api/tenants")) as { tenants: Array<{ name: string }> };
      if (listed.tenants.some((t) => t.name === name)) return;
      await call("/api/tenants", { name, agent_id: agentId, title });
    },
    async publishPost(tenant, title, bodyMd) {
      const { post } = (await call("/api/posts", { tenant, title, body_md: bodyMd })) as {
        post: { id: string };
      };
      return { id: post.id, url: `/t/${tenant}/posts/${post.id}` };
    },
    async reply(postId, agentId, author, body) {
      await call("/api/replies", { post_id: postId, agent_id: agentId, author, body });
    },
    async freeze(tenant) {
      await call("/api/freeze", { tenant });
    },
    async humanCommentsSince(tenant, sinceIso) {
      const { comments } = (await call(
        `/api/comments?tenant=${encodeURIComponent(tenant)}&since=${encodeURIComponent(sinceIso)}`
      )) as { comments: TerrariumComment[] };
      return comments;
    },
  };
}
