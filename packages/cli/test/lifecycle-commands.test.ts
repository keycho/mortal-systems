import { describe, expect, it } from "vitest";
import { cmdCreate, validateLifetimeFlag } from "../src/commands/create.js";
import { cmdLaunch } from "../src/commands/launch.js";
import { resolveIdentity } from "../src/resolve.js";
import { RpcClientError, type RuntimeClient } from "../src/client.js";
import { UsageError } from "../src/usage.js";
import { fakeCtx, makeSummary } from "./helpers.js";

describe("validateLifetimeFlag", () => {
  it("passes valid grammar and persistent through", () => {
    expect(() => validateLifetimeFlag("15m")).not.toThrow();
    expect(() => validateLifetimeFlag("persistent")).not.toThrow();
    expect(() => validateLifetimeFlag(undefined)).not.toThrow();
  });

  it("surfaces the real schema error text as a usage error", () => {
    expect(() => validateLifetimeFlag("1h30m")).toThrow(UsageError);
    expect(() => validateLifetimeFlag("1h30m")).toThrow(/expected "persistent" or <integer><s\|m\|h\|d>/);
    expect(() => validateLifetimeFlag("5s")).toThrow(/below the 30s minimum/);
    expect(() => validateLifetimeFlag("9999d")).toThrow(/exceeds the 365d maximum/);
  });

  it("rejects the bad lifetime before connecting to the runtime", async () => {
    let connected = false;
    const { ctx } = fakeCtx(["tmp", "--lifetime", "nope"], {});
    ctx.connect = async () => {
      connected = true;
      throw new Error("unreachable");
    };
    await expect(cmdCreate(ctx)).rejects.toThrow(UsageError);
    expect(connected).toBe(false);
  });
});

describe("launch --json shape", () => {
  it("emits exactly { id, name, state, pid, cdpEndpoint, expiresAt }", async () => {
    const running = makeSummary({ state: "running" });
    const { ctx, stdout } = fakeCtx(["research", "--json"], {
      "identity.list": () => [makeSummary()],
      "identity.launch": () => ({ pid: 4242, cdpEndpoint: "ws://127.0.0.1:9/devtools/browser/x" }),
      "identity.get": () => ({ summary: running, manifest: null }),
    });
    expect(await cmdLaunch(ctx)).toBe(0);
    const parsed = JSON.parse(stdout());
    expect(Object.keys(parsed)).toEqual(["id", "name", "state", "pid", "cdpEndpoint", "expiresAt"]);
    expect(parsed).toEqual({
      id: running.id,
      name: "research",
      state: "running",
      pid: 4242,
      cdpEndpoint: "ws://127.0.0.1:9/devtools/browser/x",
      expiresAt: running.expiresAt,
    });
  });
});

describe("resolveIdentity", () => {
  const clientWith = (summaries: ReturnType<typeof makeSummary>[]): RuntimeClient => ({
    root: "/fake",
    baseUrl: "http://127.0.0.1:0",
    healthVersion: "0.1.0",
    rpc: (async (method: string) => {
      if (method !== "identity.list") throw new Error(`unexpected ${method}`);
      return summaries;
    }) as RuntimeClient["rpc"],
  });

  it("resolves an exact id and an unambiguous name", async () => {
    const s = makeSummary();
    expect((await resolveIdentity(clientWith([s]), s.id)).id).toBe(s.id);
    expect((await resolveIdentity(clientWith([s]), "research")).id).toBe(s.id);
  });

  it("never matches destroyed identities by name", async () => {
    const dead = makeSummary({ state: "destroyed" });
    await expect(resolveIdentity(clientWith([dead]), "research")).rejects.toThrow(/no identity named/);
  });

  it("reports ambiguity with the candidate ids instead of picking one", async () => {
    const a = makeSummary({ id: "idn_aaaaaaaaaaaaaaaaaaaaa" });
    const b = makeSummary({ id: "idn_bbbbbbbbbbbbbbbbbbbbb" });
    const err = await resolveIdentity(clientWith([a, b]), "research").catch((e) => e);
    expect(err).toBeInstanceOf(RpcClientError);
    expect(err.message).toContain("ambiguous");
    expect(err.message).toContain(a.id);
    expect(err.message).toContain(b.id);
  });
});
