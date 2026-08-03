import { createHash } from "node:crypto";

/**
 * chromium derives an unpacked extension's id from the sha256 of its absolute
 * path: first 16 hash bytes, hex, with 0-9a-f transposed into a-p
 * (components/crx_file/id_util.cc, GenerateIdForPath). computing it lets the
 * runtime pin each companion instance's expected chrome-extension:// origin
 * per identity. the day-3 smoke test verifies this against a real chromium.
 *
 * note: chromium resolves the --load-extension path with realpath first, so
 * callers must hash the same realpath they pass on the command line.
 */
export function computeUnpackedExtensionId(absoluteRealPath: string): string {
  const hex = createHash("sha256").update(absoluteRealPath, "utf8").digest("hex").slice(0, 32);
  return hex.replace(/[0-9a-f]/g, (c) => "abcdefghijklmnop"[parseInt(c, 16)] as string);
}
