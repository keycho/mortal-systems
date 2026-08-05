import type { IdentitySummary, RpcContract, RpcMethod } from "@mortal/schema";
import type { RuntimeClient } from "../src/client.js";
import type { CommandContext } from "../src/context.js";
import { makeColors } from "../src/output.js";

export const NOW = new Date("2026-08-05T12:00:00.000Z");

export function makeSummary(over: Partial<IdentitySummary> = {}): IdentitySummary {
  return {
    id: "idn_test0000000000000000",
    name: "research",
    state: "ready",
    color: "#8A8F98",
    lifetime: "15m",
    expiresAt: "2026-08-05T12:15:00.000Z",
    onExpiry: "destroy",
    blueprint: null,
    lastLaunchedAt: null,
    storageBytes: 0,
    spaceNumber: 1,
    ...over,
  };
}

type Responder = {
  [M in RpcMethod]?: (params: RpcContract[M]["params"]) => RpcContract[M]["result"];
};

export interface FakeWorld {
  ctx: CommandContext;
  stdout: () => string;
  stderr: () => string;
  calls: Array<{ method: string; params: unknown }>;
}

export function fakeCtx(
  argv: string[],
  responders: Responder,
  over: Partial<CommandContext> = {}
): FakeWorld {
  let out = "";
  let err = "";
  const calls: Array<{ method: string; params: unknown }> = [];
  const client: RuntimeClient = {
    root: "/fake/root",
    baseUrl: "http://127.0.0.1:0",
    healthVersion: "0.1.0",
    rpc: async (method, params) => {
      calls.push({ method, params });
      const respond = responders[method];
      if (!respond) throw new Error(`fake client has no responder for ${method}`);
      return respond(params as never) as never;
    },
  };
  const ctx: CommandContext = {
    argv,
    out: (s) => {
      out += s;
    },
    err: (s) => {
      err += s;
    },
    colors: makeColors(false),
    env: {},
    connect: async () => client,
    stdinIsTTY: false,
    now: () => NOW,
    prompt: async () => "",
    ...over,
  };
  return { ctx, stdout: () => out, stderr: () => err, calls };
}
