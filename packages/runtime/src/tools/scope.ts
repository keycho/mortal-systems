import type { IdentityManifest, ToolScope } from "@mortal/schema";

/**
 * the tool-scope decision, as a pure function of the identity's own manifest.
 *
 * this is the whole of the control: the broker calls it BEFORE it touches an
 * upstream server, so a refusal never depends on the upstream being down,
 * missing, or slow. an out-of-scope call to a perfectly healthy tool is
 * refused exactly as hard as a call to one that does not exist.
 *
 * matching is exact and case-sensitive — the names the operator registered and
 * the names the manifest declares, with no normalization in between for a
 * caller to exploit.
 */

export type ScopeDecision =
  | { allowed: true; reason: "open" | "scoped" }
  | { allowed: false; reason: string };

export function decideToolAccess(
  manifest: IdentityManifest,
  server: string,
  tool: string
): ScopeDecision {
  const tools = manifest.permissions.tools;
  // no declared scope: mortal brokers whatever the operator registered, and
  // the manifest says so honestly (open / advisory). this is not a control.
  if (tools.value === "open" || tools.scope === null) {
    return { allowed: true, reason: "open" };
  }
  const entry = tools.scope.servers.find((s) => s.server === server);
  if (entry === undefined) {
    return {
      allowed: false,
      reason: `identity's tool scope does not include server "${server}"`,
    };
  }
  // tools: null means every tool this server exposes, now and later
  if (entry.tools === null) return { allowed: true, reason: "scoped" };
  if (!entry.tools.includes(tool)) {
    return {
      allowed: false,
      reason: `identity's tool scope for server "${server}" does not include tool "${tool}"`,
    };
  }
  return { allowed: true, reason: "scoped" };
}

/** does this identity's scope permit anything at all on `server`? */
export function scopeAllowsServer(manifest: IdentityManifest, server: string): boolean {
  const tools = manifest.permissions.tools;
  if (tools.value === "open" || tools.scope === null) return true;
  return tools.scope.servers.some((s) => s.server === server);
}

/** the scope as declared, or null for an open identity */
export function declaredScope(manifest: IdentityManifest): ToolScope | null {
  return manifest.permissions.tools.scope;
}
