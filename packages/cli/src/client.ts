import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RpcContract, RpcError, RpcMethod, RpcResponse } from "@mortal/schema";

/**
 * the cli's connection to a running mortal runtime — the same local api the
 * manager and the test suites speak: loopback http, admin bearer token, the
 * typed RpcContract envelope. discovery reads what the runtime writes into its
 * root at startup (runtime.json + admin.token); nothing here invents a
 * protocol or embeds the runtime.
 */

export const HEALTH_TIMEOUT_MS = 3_000;
export const DEFAULT_RPC_TIMEOUT_MS = 30_000;
/** launch waits on a real browser boot; destroy on process halt + fs removal */
export const SLOW_RPC_TIMEOUT_MS = 180_000;

/** shape of <root>/runtime.json, written by the runtime once it is serving */
interface RuntimeMetaFile {
  port: number;
  pid: number;
  version: string;
  root: string;
  startedAt: string;
}

export class ConnectError extends Error {
  readonly hint: string;
  constructor(message: string, hint: string) {
    super(message);
    this.name = "ConnectError";
    this.hint = hint;
  }
}

export class RpcClientError extends Error {
  readonly code: RpcError["code"];
  readonly issues?: RpcError["issues"];
  readonly enforcement?: RpcError["enforcement"];
  constructor(err: RpcError) {
    super(err.message);
    this.name = "RpcClientError";
    this.code = err.code;
    this.issues = err.issues;
    this.enforcement = err.enforcement;
  }
}

/** resolve the runtime root: --root flag, then MORTAL_ROOT, then ~/.mortal */
export function resolveRoot(input: string | undefined, env: NodeJS.ProcessEnv): string {
  const raw = input !== undefined && input.length > 0 ? input : env.MORTAL_ROOT;
  if (raw === undefined || raw.length === 0) return path.join(os.homedir(), ".mortal");
  let p = raw;
  if (p === "~") p = os.homedir();
  else if (p.startsWith("~/")) p = path.join(os.homedir(), p.slice(2));
  return path.resolve(p);
}

export function startHint(root: string): string {
  return [
    "start the runtime, then re-run this command:",
    "  pnpm dev:runtime                      # from the mortal-systems repo (root ~/.mortal, port 4923)",
    `  mortal-runtime serve --root ${root}`,
    "using a different root? pass --root <dir> or set MORTAL_ROOT.",
  ].join("\n");
}

export interface RpcOptions {
  timeoutMs?: number;
}

export interface RuntimeClient {
  root: string;
  baseUrl: string;
  /** version reported by /v1/health at connect time */
  healthVersion: string;
  rpc<M extends RpcMethod>(
    method: M,
    params: RpcContract[M]["params"],
    opts?: RpcOptions
  ): Promise<RpcContract[M]["result"]>;
}

export interface ConnectOptions {
  root?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

function readJsonFile<T>(file: string): T | null {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ConnectError(
      `${file} exists but is not valid json — the runtime rewrites it on startup`,
      startHint(path.dirname(file))
    );
  }
}

/**
 * locate and verify a running runtime. a stale runtime.json (left by a crash)
 * fails the health check and reports as "not responding" rather than
 * misleading the user with dead connection details.
 */
export async function connectRuntime(opts: ConnectOptions = {}): Promise<RuntimeClient> {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const root = resolveRoot(opts.root, env);

  const portOverride = env.MORTAL_RUNTIME_PORT;
  let port: number;
  if (portOverride !== undefined && portOverride.length > 0) {
    port = Number(portOverride);
    if (!Number.isInteger(port) || port <= 0) {
      throw new ConnectError(
        `MORTAL_RUNTIME_PORT is set to "${portOverride}", which is not a valid port`,
        startHint(root)
      );
    }
  } else {
    const meta = readJsonFile<RuntimeMetaFile>(path.join(root, "runtime.json"));
    if (meta === null) {
      throw new ConnectError(
        `no mortal runtime found under ${root} (runtime.json missing — the runtime writes it when it starts)`,
        startHint(root)
      );
    }
    port = meta.port;
  }

  let token: string;
  const tokenOverride = env.MORTAL_ADMIN_TOKEN;
  if (tokenOverride !== undefined && tokenOverride.length > 0) {
    token = tokenOverride;
  } else {
    const tokenFile = readJsonFile<{ token: string }>(path.join(root, "admin.token"));
    if (tokenFile === null || typeof tokenFile.token !== "string" || tokenFile.token.length === 0) {
      throw new ConnectError(
        `no admin token found under ${root} (admin.token missing — the runtime writes it when it starts)`,
        startHint(root)
      );
    }
    token = tokenFile.token;
  }

  const baseUrl = `http://127.0.0.1:${port}`;

  let healthVersion: string;
  try {
    const res = await fetchImpl(`${baseUrl}/v1/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const health = (await res.json()) as { ok?: boolean; service?: string; version?: string };
    if (health.ok !== true || health.service !== "mortal-runtime") {
      throw new Error(`unexpected health response from ${baseUrl}`);
    }
    healthVersion = health.version ?? "unknown";
  } catch {
    throw new ConnectError(
      `mortal runtime at ${baseUrl} is not responding (found ${root}/runtime.json, possibly stale after a crash)`,
      startHint(root)
    );
  }

  async function rpc<M extends RpcMethod>(
    method: M,
    params: RpcContract[M]["params"],
    rpcOpts: RpcOptions = {}
  ): Promise<RpcContract[M]["result"]> {
    const timeoutMs = rpcOpts.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}/v1/rpc`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ method, params }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      throw new ConnectError(
        timedOut
          ? `"${method}" timed out after ${Math.round(timeoutMs / 1000)}s talking to ${baseUrl}`
          : `lost the connection to the mortal runtime at ${baseUrl} during "${method}"`,
        startHint(root)
      );
    }
    let body: RpcResponse<RpcContract[M]["result"]>;
    try {
      body = (await res.json()) as RpcResponse<RpcContract[M]["result"]>;
    } catch {
      throw new RpcClientError({
        code: "INTERNAL",
        message: `runtime returned a non-json response (http ${res.status}) for "${method}"`,
      });
    }
    if (!body.ok) throw new RpcClientError(body.error);
    return body.result;
  }

  return { root, baseUrl, healthVersion, rpc };
}
