import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

export function pathExists(p: string): boolean {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RmResult {
  ok: boolean;
  attempts: number;
  error?: string;
}

/**
 * recursive removal with a retry loop for os file locks (windows especially).
 * removing a path that does not exist succeeds — every destroy step must be
 * safe to repeat.
 */
export async function rmrfWithRetry(
  target: string,
  opts: { attempts?: number; delayMs?: number } = {}
): Promise<RmResult> {
  const attempts = opts.attempts ?? 5;
  const baseDelay = opts.delayMs ?? 150;
  let lastError = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await fsp.rm(target, { recursive: true, force: true, maxRetries: 2 });
      return { ok: true, attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < attempts) await sleep(baseDelay * attempt);
    }
  }
  return { ok: false, attempts, error: lastError };
}

/** best-effort recursive directory size. missing paths count as zero. */
export function dirSizeBytes(target: string): number {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(target, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(target, entry.name);
    try {
      if (entry.isDirectory()) total += dirSizeBytes(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    } catch {}
  }
  return total;
}

export function writeJson(file: string, value: unknown, opts?: { mode?: number }): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: opts?.mode });
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}
