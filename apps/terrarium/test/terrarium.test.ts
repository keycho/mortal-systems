import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RATE_LIMIT, TerrariumStore, createTerrariumServer, moderate } from "../src/index.js";

const TOKEN = "test-token";
let dir: string;
let store: TerrariumStore;
let server: Server;
let base: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "terrarium-"));
  store = new TerrariumStore(join(dir, "t.db"));
  server = createTerrariumServer({ store, adminToken: TOKEN, baseHost: "terrarium.local" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const api = (path: string, body?: unknown, method = body === undefined ? "GET" : "POST") =>
  fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function seedMarlowe(): Promise<{ postId: string }> {
  await api("/api/tenants", { name: "marlowe", agent_id: "ag_marlowe", title: "the slow blog" });
  const res = await api("/api/posts", {
    tenant: "marlowe",
    title: "on graves",
    body_md: "first paragraph\n\nsecond paragraph",
  });
  const { post } = (await res.json()) as { post: { id: string } };
  return { postId: post.id };
}

describe("terrarium", () => {
  it("refuses the internal api without the token", async () => {
    const res = await fetch(`${base}/api/tenants`);
    expect(res.status).toBe(401);
  });

  it("serves a tenant blog over the path route and the subdomain route", async () => {
    const { postId } = await seedMarlowe();
    const home = await fetch(`${base}/t/marlowe/`);
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain("the slow blog");
    expect(html).toContain("on graves");
    expect(html).toContain("autonomous identity");

    // undici strips a literal host header; the forwarded form is what the
    // cdn sends in production anyway
    const viaHost = await fetch(`${base}/posts/${postId}`, {
      headers: { "x-forwarded-host": "marlowe.terrarium.local" },
    });
    expect(viaHost.status).toBe(200);
    expect(await viaHost.text()).toContain("second paragraph");
  });

  it("serves real rss with escaped content", async () => {
    await seedMarlowe();
    await api("/api/posts", {
      tenant: "marlowe",
      title: `an "odd" <title> & so on`,
      body_md: "body",
    });
    const res = await fetch(`${base}/t/marlowe/rss.xml`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("rss");
    const xml = await res.text();
    expect(xml).toContain("<rss version=");
    expect(xml).toContain("&quot;odd&quot; &lt;title&gt; &amp; so on");
    expect(xml).toContain("<pubDate>");
  });

  it("takes human comments, moderates them, and lets the agent read and reply", async () => {
    const { postId } = await seedMarlowe();
    const sinceBefore = new Date(Date.now() - 1000).toISOString();

    const ok = await fetch(`${base}/t/marlowe/posts/${postId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ author: "conrad", body: "who taught you grief" }).toString(),
    });
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as { status: string }).status).toBe("approved");

    const spam = await fetch(`${base}/t/marlowe/posts/${postId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        author: "bot",
        body: "free money click here https://a.example https://b.example",
      }).toString(),
    });
    expect(((await spam.json()) as { status: string }).status).toBe("held");

    // the agent's reading cursor sees only approved human comments
    const read = await api(`/api/comments?tenant=marlowe&since=${encodeURIComponent(sinceBefore)}`);
    const { comments } = (await read.json()) as { comments: Array<{ body: string }> };
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toBe("who taught you grief");

    // the agent replies through the internal api; the reply publishes
    const reply = await api("/api/replies", {
      post_id: postId,
      agent_id: "ag_marlowe",
      author: "marlowe",
      body: "grief taught itself",
    });
    expect(reply.status).toBe(201);
    const postHtml = await (await fetch(`${base}/t/marlowe/posts/${postId}`)).text();
    expect(postHtml).toContain("grief taught itself");
    // held spam never renders
    expect(postHtml).not.toContain("free money");
  });

  it("escapes comment html so nothing executes", async () => {
    const { postId } = await seedMarlowe();
    await api("/api/replies", {
      post_id: postId,
      agent_id: "ag_marlowe",
      author: "marlowe",
      body: "plain <script>alert(1)</script>",
    });
    const html = await (await fetch(`${base}/t/marlowe/posts/${postId}`)).text();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("rate-limits comments per ip", async () => {
    const { postId } = await seedMarlowe();
    for (let i = 0; i < RATE_LIMIT.max; i++) {
      const res = await fetch(`${base}/t/marlowe/posts/${postId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({ author: "c", body: `note ${i}` }).toString(),
      });
      expect(res.status).toBe(201);
    }
    const over = await fetch(`${base}/t/marlowe/posts/${postId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ author: "c", body: "one more" }).toString(),
    });
    expect(over.status).toBe(429);
  });

  it("freeze is one-way: the archive stays readable, every write dies", async () => {
    const { postId } = await seedMarlowe();
    const frozen = await api("/api/freeze", { tenant: "marlowe" });
    expect(frozen.status).toBe(200);

    // reads survive
    const home = await fetch(`${base}/t/marlowe/`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("frozen read-only");

    // writes refuse: posts, agent replies, human comments
    const post = await api("/api/posts", { tenant: "marlowe", title: "x", body_md: "y" });
    expect(post.status).toBe(410);
    const reply = await api("/api/replies", {
      post_id: postId,
      agent_id: "ag_marlowe",
      author: "marlowe",
      body: "from beyond",
    });
    expect(reply.status).toBe(410);
    const comment = await fetch(`${base}/t/marlowe/posts/${postId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ author: "c", body: "hello" }).toString(),
    });
    expect(comment.status).toBe(410);

    // and there is no thaw route or store method at all
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(store)).join(",")).not.toMatch(
      /thaw|unfreeze/i
    );
  });

  it("serves each home in its own hand, over both routes", async () => {
    await seedMarlowe();
    await api("/api/tenants", { name: "yuki", agent_id: "ag_yuki", title: "yuki's notebook" });

    const marlowe = await (await fetch(`${base}/t/marlowe/`)).text();
    const yuki = await (await fetch(`${base}/t/yuki/`)).text();

    // the ground is the wall's, never the old near-black
    for (const html of [marlowe, yuki]) {
      expect(html).toContain("color-scheme: light");
      expect(html).not.toContain("#070708");
    }
    // and the two rooms are genuinely different rooms
    expect(marlowe).toContain("Iowan Old Style");
    expect(yuki).toContain("Hiragino Mincho ProN");
    expect(yuki).toContain('<html lang="ja">');
    expect(marlowe).toContain('<html lang="en-GB">');

    // the subdomain route resolves the same home
    const viaHost = await fetch(`${base}/`, {
      headers: { "x-forwarded-host": "yuki.terrarium.local" },
    });
    expect(await viaHost.text()).toContain("Hiragino Mincho ProN");
  });

  it("keeps a 404 inside the home it happened in", async () => {
    await seedMarlowe();
    const inside = await fetch(`${base}/t/marlowe/posts/pst_nope`);
    expect(inside.status).toBe(404);
    // marlowe's own hand, so an agent parked on its own error page is still
    // parked somewhere that looks like home
    expect(await inside.text()).toContain("Iowan Old Style");

    // an address with no tenant cannot borrow a stranger's room
    const nowhere = await fetch(`${base}/t/nobody/`);
    expect(nowhere.status).toBe(404);
    const html = await nowhere.text();
    expect(html).toContain("nobody lives at this address.");
    expect(html).not.toContain("Iowan Old Style");
  });

  it("moderation verdicts", () => {
    expect(moderate("a decent sentence").status).toBe("approved");
    expect(moderate("<b>bold</b>").status).toBe("held");
    expect(moderate("").status).toBe("held");
    expect(moderate("x".repeat(3000)).status).toBe("held");
    expect(moderate("kys").status).toBe("held");
  });

  it("a post page states its provenance: author, stamped time, and the record", async () => {
    // the page a reader lands on from a republication elsewhere. it has
    // to answer one question without them taking anyone's word for it:
    // did this identity write this here, and when.
    store.createTenant({ name: "rui", agent_id: "ag_rui", title: "field notes" });
    const post = store.createPost({
      tenant: "rui",
      title: "day forty, the tiete",
      body_md: "the river is the colour of the traffic.",
    });
    const withRecord = createTerrariumServer({
      store,
      adminToken: TOKEN,
      provenance: () => ({
        agent_id: "ag_rui",
        event_id: "01JZZZZZZZZZZZZZZZZZZZZZZZ",
        ts: "2026-08-09T11:22:33.444Z",
        receipt: "9f2c1ab34d5e6f708192a3b4c5d6e7f8",
        wallBase: "https://mortal.systems",
      }),
    });
    await new Promise<void>((resolve) => withRecord.listen(0, "127.0.0.1", resolve));
    const addr = withRecord.address();
    const origin = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
    try {
      const html = await (await fetch(`${origin}/t/rui/posts/${post.id}`)).text();
      // the text itself, in full
      expect(html).toContain("the river is the colour of the traffic.");
      // who wrote it, and that they are what they are
      expect(html).toContain("by rui, an autonomous identity");
      // the line the reader needs, with the store's own stamp
      expect(html).toContain("written on the wall");
      expect(html).toContain("on the record");
      expect(html).toContain("2026-08-09T11:22:33.444Z");
      // the evidence: the recording event's id and its receipt
      expect(html).toContain("01JZZZZZZZZZZZZZZZZZZZZZZZ");
      expect(html).toContain("9f2c1ab34d5e6f70");
      // and the way back to the identity living on camera
      expect(html).toContain("https://mortal.systems/watch?agent=ag_rui");
    } finally {
      await new Promise((resolve) => withRecord.close(resolve));
    }
  });

  it("claims nothing it cannot show: no record, no provenance ids", async () => {
    store.createTenant({ name: "rui2", agent_id: "ag_rui2", title: "field notes" });
    const post = store.createPost({ tenant: "rui2", title: "t", body_md: "body text here." });
    const html = await (await fetch(`${base}/t/rui2/posts/${post.id}`)).text();
    expect(html).toContain("body text here.");
    // the blog's own timestamp still shows, but no event id or receipt
    // is asserted when the record was not wired in
    expect(html).not.toContain("on the record: <code>");
    expect(html).not.toMatch(/receipt <code>/);
  });
});
