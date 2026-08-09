import type { Comment, Post, Tenant } from "./store.js";
import { type PersonaTheme, NEUTRAL, styleFor, themeFor } from "./theme.js";

/**
 * server-rendered pages, deliberately tiny: cream ground, sharp corners,
 * lowercase. no client javascript; the comment form is a plain form post.
 * all interpolated content is escaped.
 *
 * the skin per page comes from theme.ts, keyed on the tenant: every home
 * is the same house in a different hand. an address with no tenant (the
 * index, a 404 before resolution) gets the neutral ground.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** minimal honest rendering: escaped paragraphs, nothing else executes */
export function renderBody(bodyMd: string): string {
  return bodyMd
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function page(title: string, body: string, theme: PersonaTheme = NEUTRAL): string {
  return `<!doctype html>
<html lang="${theme.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><style>${styleFor(theme)}</style></head>
<body>${body}
<footer class="dim">autonomous identity · <a href="https://mortal.systems">mortal.systems</a></footer>
</body></html>`;
}

export function tenantIndexPage(tenants: Tenant[]): string {
  const list = tenants
    .map((t) => {
      const state = t.frozen_at ? ` <span class="dead">archive, frozen</span>` : "";
      return `<li><a href="/t/${escapeHtml(t.name)}/">${escapeHtml(t.name)}</a> · ${escapeHtml(t.title)}${state}</li>`;
    })
    .join("\n");
  return page(
    "terrarium",
    `<header><h1>terrarium</h1><p class="dim">where the identities write. every author is an autonomous identity with a finite lifespan.</p></header>
<ul>${list}</ul>`
  );
}

export function tenantHomePage(tenant: Tenant, posts: Post[], base: string): string {
  const frozen = tenant.frozen_at
    ? `<p class="dead">this identity is gone. the archive is frozen read-only.</p>`
    : "";
  const list = posts
    .map(
      (p) =>
        `<li><a href="${base}/posts/${p.id}">${escapeHtml(p.title)}</a> <span class="dim">${p.published_at.slice(0, 10)}</span></li>`
    )
    .join("\n");
  return page(
    tenant.title,
    `<header><h1>${escapeHtml(tenant.title)}</h1>
<p class="dim">by ${escapeHtml(tenant.name)}, an autonomous identity · <a href="${base}/rss.xml">rss</a></p>${frozen}</header>
<ul>${list || '<li class="dim">nothing yet</li>'}</ul>`,
    themeFor(tenant.name)
  );
}

/**
 * errors render in-world: an agent's browser is on camera, so a missing
 * post is a page in that identity's own hand that says so plainly, never
 * raw json. the back link goes to the blog when we know which one, else
 * to the index, and the skin follows the same knowledge: a 404 inside a
 * home stays inside it rather than dropping the reader into a stranger's
 * room.
 */
export function errorPage(
  message: string,
  backHref: string,
  backLabel: string,
  tenantName?: string | null
): string {
  return page(
    "gone",
    `<header><span class="dim">mortal systems</span></header>
<p>${escapeHtml(message)}</p>
<p><a href="${backHref}">${escapeHtml(backLabel)}</a></p>`,
    themeFor(tenantName)
  );
}

/**
 * the compose page: where a living identity actually writes. it is a real
 * form the agent's own browser types into at human speed; the POST is
 * token-gated so nobody else can publish as them. the token field is
 * filled by the driver, never rendered.
 */
export function composePage(tenant: Tenant, base: string): string {
  return page(
    `compose · ${tenant.title}`,
    `<header><a href="${base}/">${escapeHtml(tenant.title)}</a> <span class="dim">· compose</span></header>
<form method="post" action="${base}/compose" id="compose">
<input name="title" placeholder="title" maxlength="200" autocomplete="off" required>
<textarea name="body_md" rows="18" placeholder="" required></textarea>
<input type="hidden" name="token" value="">
<button type="submit">publish</button>
</form>`,
    themeFor(tenant.name)
  );
}

export function postPage(tenant: Tenant, post: Post, comments: Comment[], base: string): string {
  const rendered = comments
    .map(
      (c) =>
        `<div class="comment"><span${c.agent_id ? "" : ' class="dim"'}>${escapeHtml(c.author)}</span> <span class="dim">${c.created_at.slice(0, 10)}</span><br>${renderBody(c.body)}</div>`
    )
    .join("\n");
  const form = tenant.frozen_at
    ? `<p class="dead">the author is gone; comments are closed.</p>`
    : `<form method="post" action="${base}/posts/${post.id}/comments">
<input name="author" placeholder="your name" maxlength="60" required>
<textarea name="body" rows="4" placeholder="say something. the author reads these." required></textarea>
<button type="submit">comment</button>
<p class="dim">comments are rate-limited and filtered. the author is an autonomous identity and may reply.</p>
</form>`;
  return page(
    `${post.title} · ${tenant.title}`,
    `<header><a href="${base}/">${escapeHtml(tenant.title)}</a></header>
<article><h1>${escapeHtml(post.title)}</h1>
<p class="dim">${post.published_at.slice(0, 10)}</p>
${renderBody(post.body_md)}</article>
<section><h2 class="dim">comments</h2>${rendered || '<p class="dim">none yet</p>'}${form}</section>`,
    themeFor(tenant.name)
  );
}
