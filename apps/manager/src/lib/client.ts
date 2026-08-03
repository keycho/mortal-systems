import type { RpcContract, RpcError, RpcMethod, RpcResponse } from "@liminal/schema";

/**
 * one typed client, two transports:
 * - inside tauri: the shell brokers calls to the runtime sidecar via the
 *   `runtime_call` command (loopback http under the hood, token never in js)
 * - browser dev mode: the vite proxy forwards /runtime to the local runtime;
 *   the dev token comes from VITE_LIMINAL_TOKEN (default matches `pnpm dev`)
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

const DEV_TOKEN: string =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_LIMINAL_TOKEN ??
  "liminal-dev";

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
