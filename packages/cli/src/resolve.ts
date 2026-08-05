import type { IdentitySummary } from "@mortal/schema";
import { RpcClientError, type RuntimeClient } from "./client.js";

/**
 * commands accept an identity id or a name. ids are authoritative; names are
 * a convenience resolved client-side (the rpc surface only takes idn_ ids).
 * names are not unique, so ambiguity is an error that lists the candidates
 * rather than a silent pick.
 */

const IDENTITY_ID_RE = /^idn_[A-Za-z0-9_-]{10,32}$/;

export function looksLikeIdentityId(ref: string): boolean {
  return IDENTITY_ID_RE.test(ref);
}

export async function resolveIdentity(
  client: RuntimeClient,
  ref: string
): Promise<IdentitySummary> {
  const all = await client.rpc("identity.list", {});
  if (looksLikeIdentityId(ref)) {
    const byId = all.find((s) => s.id === ref);
    if (byId) return byId;
    throw new RpcClientError({ code: "NOT_FOUND", message: `identity "${ref}" not found` });
  }
  const named = all.filter((s) => s.name === ref && s.state !== "destroyed");
  if (named.length === 1) return named[0] as IdentitySummary;
  if (named.length === 0) {
    throw new RpcClientError({
      code: "NOT_FOUND",
      message: `no identity named "${ref}" — see "mortal list" (names only match identities that are not destroyed; pass the idn_ id to address a destroyed one)`,
    });
  }
  const lines = named.map((s) => `  ${s.id}  ${s.state}  lifetime ${s.lifetime}`).join("\n");
  throw new RpcClientError({
    code: "CONFLICT",
    message: `the name "${ref}" is ambiguous — ${named.length} identities carry it:\n${lines}\nuse the id instead`,
  });
}
