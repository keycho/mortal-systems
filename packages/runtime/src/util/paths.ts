import os from "node:os";
import path from "node:path";
import { errors } from "../errors.js";

/** default runtime root. all identity state lives here, never inside the repo. */
export function defaultRoot(): string {
  return path.join(os.homedir(), ".mortal");
}

/** resolve a user-supplied root to an absolute path, expanding a leading ~ */
export function resolveRoot(input?: string): string {
  if (!input || input.length === 0) return defaultRoot();
  let p = input;
  if (p === "~") p = os.homedir();
  else if (p.startsWith("~/")) p = path.join(os.homedir(), p.slice(2));
  return path.resolve(p);
}

/**
 * resolve a manifest-relative path under the runtime root. defense in depth on
 * top of the schema's relative-path validation: the resolved path must remain
 * inside the root.
 */
export function insideRoot(root: string, rel: string): string {
  const resolved = path.resolve(root, rel);
  const normalizedRoot = path.resolve(root);
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
    throw errors.validation(`path "${rel}" escapes the runtime root`);
  }
  return resolved;
}
