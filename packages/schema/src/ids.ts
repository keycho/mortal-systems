/**
 * id and token generation. pure, dependency-free, usable in node and browsers
 * (relies only on the standard `crypto.getRandomValues`).
 */

const URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

export function randomId(size = 21): string {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < size; i++) {
    out += URL_ALPHABET[(bytes[i] as number) & 63];
  }
  return out;
}

/** identity ids: idn_<21 url-safe chars> */
export function generateIdentityId(): string {
  return `idn_${randomId(21)}`;
}

/** bearer tokens: 43 url-safe chars (~258 bits) */
export function generateToken(): string {
  return randomId(43);
}

/** blueprint ids: bpt_<21 url-safe chars> */
export function generateBlueprintId(): string {
  return `bpt_${randomId(21)}`;
}
