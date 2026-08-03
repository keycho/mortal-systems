import { log } from "./log.js";

/**
 * environment variables under the mortal systems brand. MORTAL_* is
 * canonical; the pre-rename LIMINAL_* names are accepted for one release
 * with a deprecation warning, then removed.
 */

const warned = new Set<string>();

export function readEnv(name: `MORTAL_${string}`): string | undefined {
  const value = process.env[name];
  if (value !== undefined) return value;
  const legacy = name.replace(/^MORTAL_/, "LIMINAL_");
  const legacyValue = process.env[legacy];
  if (legacyValue !== undefined) {
    if (!warned.has(legacy)) {
      warned.add(legacy);
      log.warn(`${legacy} is deprecated after the mortal systems rename; use ${name} (accepted for one release)`);
    }
    return legacyValue;
  }
  return undefined;
}
