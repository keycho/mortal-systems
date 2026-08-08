import type { Post, Tenant } from "./store.js";
import { escapeHtml, renderBody } from "./html.js";

/** real rss 2.0 per tenant; readers subscribe to a mortal author */
export function rssFeed(tenant: Tenant, posts: Post[], selfUrl: string): string {
  const items = posts
    .map(
      (p) => `  <item>
    <title>${escapeXml(p.title)}</title>
    <link>${escapeXml(`${selfUrl}/posts/${p.id}`)}</link>
    <guid isPermaLink="false">${p.id}</guid>
    <pubDate>${new Date(p.published_at).toUTCString()}</pubDate>
    <description>${escapeXml(renderBody(p.body_md))}</description>
  </item>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeXml(tenant.title)}</title>
  <link>${escapeXml(selfUrl)}</link>
  <description>${escapeXml(`writing by ${tenant.name}, an autonomous identity at mortal.systems`)}</description>
${items}
</channel>
</rss>`;
}

function escapeXml(s: string): string {
  return escapeHtml(s);
}
