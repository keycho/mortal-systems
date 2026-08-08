import type { RpcContract, RpcError, RpcMethod, RpcResponse } from "@mortal/schema";

/**
 * one typed client, two transports:
 * - inside tauri: the shell brokers calls to the runtime sidecar via the
 *   `runtime_call` command (loopback http under the hood, token never in js)
 * - browser dev mode: the vite proxy forwards /runtime to the local runtime;
 *   the dev token comes from VITE_MORTAL_TOKEN (default matches `pnpm dev`)
 */

export class RpcClientError extends Error {
  readonly code: RpcError["code"];
  readonly issues?: RpcError["issues"];
  constructor(err: RpcError) {
    super(err.message);
    this.name = "RpcClientError";
    this.code = err.code;
    this.issues = err.issues;
  }
}

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * true when this is the packaged desktop app (which ships and starts its own
 * runtime) rather than browser dev mode (where the runtime is a separate
 * `pnpm dev:runtime` process). the two have completely different failure
 * advice, so the ui must never guess.
 */
export const isPackagedApp = inTauri;

/** what the shell knows about the runtime process it spawned */
export interface RuntimeDiagnostics {
  mode: string;
  node: string | null;
  cli: string | null;
  log: string | null;
  spawnError: string | null;
  quarantineCleared: boolean;
  exited: string | null;
}

/** null in browser dev mode: there is no shell to ask */
export async function runtimeDiagnostics(): Promise<RuntimeDiagnostics | null> {
  if (!inTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return (await invoke("runtime_diagnostics")) as RuntimeDiagnostics;
}

/** restart the bundled runtime; null in browser dev mode */
export async function restartRuntime(): Promise<RuntimeDiagnostics | null> {
  if (!inTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return (await invoke("runtime_restart")) as RuntimeDiagnostics;
}

const DEV_TOKEN: string =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_MORTAL_TOKEN ??
  "mortal-dev";

export async function rpc<M extends RpcMethod>(
  method: M,
  params: RpcContract[M]["params"]
): Promise<RpcContract[M]["result"]> {
  if (inTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const body = (await invoke("runtime_call", { method, params })) as RpcResponse<
      RpcContract[M]["result"]
    >;
    if (!body.ok) throw new RpcClientError(body.error);
    return body.result;
  }

  const res = await fetch("/runtime/v1/rpc", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${DEV_TOKEN}`,
    },
    body: JSON.stringify({ method, params }),
  });
  const body = (await res.json()) as RpcResponse<RpcContract[M]["result"]>;
  if (!body.ok) throw new RpcClientError(body.error);
  return body.result;
}
