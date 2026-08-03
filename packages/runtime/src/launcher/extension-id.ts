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

export interface ObservedTarget {
  type: string;
  url: string;
}

/**
 * pick the companion's extension id out of a browser target list, or null if
 * no target looks like the companion.
 *
 * branded chrome ships built-in component extensions (e.g. google hangouts,
 * nkeimhogjdpnpccoofpliimaahmaaome) whose ids are key-derived and identical
 * for everyone — a target list must therefore never be treated as "the one
 * extension we loaded". the companion is identified by its background
 * service-worker url, which is exactly chrome-extension://<id>/background.js
 * in our template; component extensions expose different resource paths.
 *
 * selection: the computed path-derived id wins when present; otherwise a
 * single companion-shaped candidate is accepted (covers platforms where
 * chromium's path canonicalization diverges from ours); ambiguity or absence
 * returns null — never guess.
 */
export function pickCompanionExtensionId(
  targets: ObservedTarget[],
  computedId: string
): string | null {
  const candidateIds = new Set<string>();
  for (const target of targets) {
    if (!target.url.startsWith("chrome-extension://")) continue;
    let url: URL;
    try {
      url = new URL(target.url);
    } catch {
      continue;
    }
    if (url.pathname !== "/background.js") continue;
    candidateIds.add(url.host);
  }
  if (candidateIds.has(computedId)) return computedId;
  if (candidateIds.size === 1) return [...candidateIds][0]!;
  return null;
}
