import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { connectRuntime, ConnectError, resolveRoot } from "../src/client.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "mortal-cli-test-"));

describe("resolveRoot", () => {
  it("prefers the flag, then MORTAL_ROOT, then ~/.mortal", () => {
    expect(resolveRoot("/a", { MORTAL_ROOT: "/b" })).toBe("/a");
    expect(resolveRoot(undefined, { MORTAL_ROOT: "/b" })).toBe("/b");
    expect(resolveRoot(undefined, {})).toBe(path.join(os.homedir(), ".mortal"));
  });

  it("expands a leading tilde", () => {
    expect(resolveRoot("~/x", {})).toBe(path.join(os.homedir(), "x"));
    expect(resolveRoot("~", {})).toBe(os.homedir());
  });
});

describe("connectRuntime discovery failures", () => {
  it("missing runtime.json says how to start the runtime", async () => {
    const root = tmp();
    const err = await connectRuntime({ root, env: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ConnectError);
    expect(err.message).toContain("runtime.json missing");
    expect(err.hint).toContain("pnpm dev:runtime");
    expect(err.hint).toContain(`--root ${root}`);
  });

  it("stale runtime.json (dead port) reports not responding, not a crash", async () => {
    const root = tmp();
    fs.writeFileSync(
      path.join(root, "runtime.json"),
      JSON.stringify({ port: 1, pid: 1, version: "0.0.0", root, startedAt: "x" })
    );
    fs.writeFileSync(path.join(root, "admin.token"), JSON.stringify({ token: "t" }));
    const err = await connectRuntime({ root, env: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ConnectError);
    expect(err.message).toContain("not responding");
    expect(err.message).toContain("possibly stale");
  });

  it("missing admin.token is its own clear error", async () => {
    const root = tmp();
    fs.writeFileSync(
      path.join(root, "runtime.json"),
      JSON.stringify({ port: 1, pid: 1, version: "0.0.0", root, startedAt: "x" })
    );
    const err = await connectRuntime({ root, env: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ConnectError);
    expect(err.message).toContain("admin.token missing");
  });

  it("env overrides for port and token are honored", async () => {
    const root = tmp();
    const err = await connectRuntime({
      root,
      env: { MORTAL_RUNTIME_PORT: "1", MORTAL_ADMIN_TOKEN: "t" },
    }).catch((e) => e);
    // discovery files are not needed with both overrides; failure is reachability
    expect(err).toBeInstanceOf(ConnectError);
    expect(err.message).toContain("not responding");
  });
});
