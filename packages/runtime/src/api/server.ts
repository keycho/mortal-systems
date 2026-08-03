import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import type { ErrorCode, RpcResponse } from "@mortal/schema";
import { errors, RuntimeError } from "../errors.js";
import { log } from "../util/log.js";
import { RUNTIME_VERSION } from "../version.js";
import { dispatchRpc } from "./rpc.js";
import { handleSelfRequest } from "./self.js";
import type { MortalRuntime } from "../runtime.js";

/** admin rpc bodies may carry a 256kb blueprint plus envelope */
const MAX_BODY_BYTES = 600 * 1024;

const CODE_STATUS: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  VALIDATION_FAILED: 400,
  NOT_IMPLEMENTED: 501,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  BROWSER_NOT_FOUND: 424,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  INTERNAL: 500,
};

function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function readBody(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let overLimit = false;
    // over the rpc limit we stop buffering but keep draining so the client
    // receives a clean 413 instead of a connection reset. an absolute cap
    // still guards against unbounded streams.
    const hardCap = 8 * 1024 * 1024;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > hardCap) {
        reject(errors.payloadTooLarge(maxBytes));
        req.destroy();
        return;
      }
      if (overLimit) return;
      if (total > maxBytes) {
        overLimit = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (overLimit) reject(errors.payloadTooLarge(maxBytes));
      else resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

function sendError(res: http.ServerResponse, err: unknown): void {
  if (err instanceof RuntimeError) {
    const body: RpcResponse = {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.enforcement ? { enforcement: err.enforcement } : {}),
        ...(err.issues ? { issues: err.issues } : {}),
      },
    };
    sendJson(res, CODE_STATUS[err.code], body);
    return;
  }
  log.error("unhandled api error", {
    message: err instanceof Error ? err.message : String(err),
  });
  const body: RpcResponse = {
    ok: false,
    error: { code: "INTERNAL", message: "internal runtime error" },
  };
  sendJson(res, 500, body);
}

export interface ApiServer {
  server: http.Server;
  /** bind 127.0.0.1 only. port 0 selects a random port; the bound port is returned. */
  listen(port: number): Promise<number>;
  close(): Promise<void>;
}

export function createApiServer(runtime: MortalRuntime, adminToken: string): ApiServer {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");

      if (req.method === "GET" && url.pathname === "/v1/health") {
        sendJson(res, 200, { ok: true, service: "mortal-runtime", version: RUNTIME_VERSION });
        return;
      }

      const auth0 = req.headers.authorization ?? "";
      const bearer = auth0.startsWith("Bearer ") ? auth0.slice("Bearer ".length) : "";

      // identity-scoped companion surface (per-identity tokens, never admin)
      if (await handleSelfRequest(runtime, req, res, url, bearer)) {
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/rpc") {
        const auth = req.headers.authorization ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
        if (token.length === 0 || !constantTimeEquals(token, adminToken)) {
          throw errors.unauthorized();
        }
        const raw = await readBody(req, MAX_BODY_BYTES);
        let parsed: { method?: unknown; params?: unknown };
        try {
          parsed = JSON.parse(raw.toString("utf8")) as { method?: unknown; params?: unknown };
        } catch {
          throw errors.validation("request body is not valid json");
        }
        if (typeof parsed.method !== "string" || parsed.method.length === 0) {
          throw errors.validation('request body must be {"method": string, "params"?: object}');
        }
        const result = await dispatchRpc(runtime, parsed.method, parsed.params);
        const body: RpcResponse = { ok: true, result };
        sendJson(res, 200, body);
        return;
      }

      throw new RuntimeError("NOT_FOUND", `no route for ${req.method} ${url.pathname}`);
    } catch (err) {
      sendError(res, err);
    }
  });

  // loopback service: modest concurrency, no keep-alive hoarding
  server.keepAliveTimeout = 1000;

  return {
    server,
    listen(port: number): Promise<number> {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          const addr = server.address();
          if (addr === null || typeof addr === "string") {
            reject(new Error("failed to determine bound port"));
            return;
          }
          resolve(addr.port);
        });
      });
    },
    close(): Promise<void> {
      return new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}
