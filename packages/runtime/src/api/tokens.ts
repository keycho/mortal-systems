import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Repo } from "../store/repo.js";

/**
 * per-identity companion tokens, derived rather than stored:
 *
 *   token = base64url(hmac-sha256(install_secret, identityId))
 *
 * the install secret lives in the settings table (generated once per runtime
 * install); the plaintext token exists only inside the stamped companion
 * instance config. verification is recomputation, so there is no token table
 * (the spec's migration 0001 has none) and no plaintext at rest in the db.
 * one identity, one instance, one token; a leaked token exposes only its own
 * identity's scope.
 */

const SECRET_KEY = "companion_token_secret";

export function getOrCreateTokenSecret(repo: Repo): string {
  const existing = repo.getSetting(SECRET_KEY);
  if (existing) return existing;
  const secret = randomBytes(32).toString("hex");
  repo.setSetting(SECRET_KEY, secret);
  return secret;
}

export function tokenForIdentity(secret: string, identityId: string): string {
  return createHmac("sha256", Buffer.from(secret, "hex"))
    .update(identityId, "utf8")
    .digest("base64url");
}

/**
 * resolve a presented token to its identity, or null. iterates identities
 * (constant-time compare per candidate); fine at poc scale and keeps the db
 * schema exactly as specified.
 */
export function findIdentityByToken(repo: Repo, secret: string, token: string): string | null {
  let presented: Buffer;
  try {
    presented = Buffer.from(token, "utf8");
  } catch {
    return null;
  }
  for (const row of repo.listIdentities()) {
    if (row.state === "destroyed") continue;
    const expected = Buffer.from(tokenForIdentity(secret, row.id), "utf8");
    if (expected.length === presented.length && timingSafeEqual(expected, presented)) {
      return row.id;
    }
  }
  return null;
}
