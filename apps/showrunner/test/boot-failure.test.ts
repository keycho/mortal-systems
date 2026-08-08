import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  StubRuntimePort,
  bootWallService,
  classifySandboxFailure,
  type CastMember,
  type SpawnResult,
  type SpawnSpec,
  type WallService,
} from "../src/index.js";

/**
 * regression cover for the production incident where the wall came up
 * with agents_live: 0 behind a green healthcheck. three separate things
 * had to be true for that to be possible, and each gets a test here:
 * the store opened without being writable, a failed resume left the
 * listening server up, and /health answered 200 anyway.
 */

const FLAGS = { platformAllowlist: ["terrarium"], sponsorEnabled: false };
const RUNNING_AS_ROOT = typeof process.getuid === "function" && process.getuid() === 0;

function member(agent_id: string, name: string): CastMember {
  return {
    agent_id,
    name,
    class: "persona",
    region: "nowhere",
    locale: "en-US",
    tz: null,
    ttl_seconds: 7 * 86_400,
    serial: false,
    role: "a test identity",
    runtime_feature: "none",
    wave: 1,
    tenant: null,
  };
}

const CAST = [member("ag_test", "test")];

describe("a wall that cannot keep its record refuses to start", () => {
  let root: string;
  let errors: string[];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wall-boot-"));
    errors = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    chmodSync(root, 0o755);
    rmSync(root, { recursive: true, force: true });
  });

  it("fails loudly, naming the path, when the state root cannot hold a directory", async () => {
    // a state root that is a regular file is the "volume is not mounted
    // where you think" case: mkdir cannot proceed at all
    const notADir = join(root, "occupied");
    writeFileSync(notADir, "");
    await expect(
      bootWallService({ root: notADir, port: 0, cast: CAST, flags: FLAGS })
    ).rejects.toThrow();
    const banner = errors.join("\n");
    expect(banner).toContain("the wall cannot open its state");
    expect(banner).toContain(notADir);
    expect(banner).toContain("refuses to start rather than serve an empty room");
  });

  // the incident's actual shape: the directory exists and is readable, so
  // mkdir is a no-op and sqlite opens happily; only the first write fails,
  // hours later, from inside the heartbeat. the boot-time write probe is
  // what turns that into a startup failure with a diagnosis.
  it.skipIf(RUNNING_AS_ROOT)(
    "refuses a state root it can read but not write",
    async () => {
      chmodSync(root, 0o555);
      await expect(
        bootWallService({ root, port: 0, cast: CAST, flags: FLAGS })
      ).rejects.toThrow();
      const banner = errors.join("\n");
      expect(banner).toContain("the wall cannot open its state");
      expect(banner).toContain("likely cause:");
    }
  );
});

describe("a wall that boots empty says so and fails its healthcheck", () => {
  let root: string;
  let service: WallService | null;
  let errors: string[];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wall-empty-"));
    service = null;
    errors = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.map(String).join(" "));
    });
  });

  afterEach(async () => {
    await service?.stop();
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  async function health(svc: WallService): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`http://127.0.0.1:${svc.port}/health`);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it("answers 503 with the reason when every spawn fails", async () => {
    class DeadRuntime extends StubRuntimePort {
      override async spawn(): Promise<SpawnResult> {
        throw new Error("no browser could be started");
      }
    }
    service = await bootWallService({
      root,
      port: 0,
      cast: CAST,
      flags: FLAGS,
      runtime: new DeadRuntime(),
    });
    const { status, body } = await health(service);
    // the platform must see a failure: a green check on an empty wall is
    // what let the incident sit unnoticed
    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect((body.boot as { phase: string }).phase).toBe("failed");
    expect(body.agents_live).toBe(0);
    expect(errors.join("\n")).toContain("the wall came up empty");
  });

  it("stays up and healthy when one identity of several fails to spawn", async () => {
    const cast = [member("ag_ok", "ok"), member("ag_bad", "bad")];
    class PickyRuntime extends StubRuntimePort {
      override async spawn(spec: SpawnSpec): Promise<SpawnResult> {
        if (spec.agent_id === "ag_bad") throw new Error("this one will not start");
        return super.spawn(spec);
      }
    }
    service = await bootWallService({
      root,
      port: 0,
      cast,
      flags: FLAGS,
      runtime: new PickyRuntime(),
    });
    const { status, body } = await health(service);
    // one identity short is a live wall, not a dead one; it stays up, and
    // the one that did not make it is named rather than silently absent
    expect(status).toBe(200);
    expect(body.agents_live).toBe(1);
    const boot = body.boot as { phase: string; spawn_failures?: Array<{ agent_id: string }> };
    expect(boot.phase).toBe("running");
    expect(boot.spawn_failures?.map((f) => f.agent_id)).toEqual(["ag_bad"]);
  });
});

describe("the sandbox probe names which kind of failure it hit", () => {
  it("reads a kernel userns refusal as a host policy denial", () => {
    expect(
      classifySandboxFailure(
        "Failed to move to new namespace: PID namespaces supported, Network namespace supported, but failed: errno = Operation not permitted"
      )
    ).toBe("userns_denied");
    expect(classifySandboxFailure("clone() returned -1, errno = 1")).toBe("userns_denied");
    expect(classifySandboxFailure("No usable sandbox! Update your kernel")).toBe("userns_denied");
  });

  it("reads a dead probe browser as a crash, not a denial", () => {
    expect(classifySandboxFailure("Target page, context or browser has been closed")).toBe(
      "browser_crashed"
    );
    expect(classifySandboxFailure("Browser closed unexpectedly")).toBe("browser_crashed");
  });

  it("reads a missing binary as an image problem", () => {
    expect(
      classifySandboxFailure("Executable doesn't exist at /usr/bin/chromium")
    ).toBe("browser_missing");
  });

  // the distinction has to survive the message that carries both, because
  // a userns denial usually kills the target too. naming the crash there
  // would send an operator to rebuild an image over a host policy.
  it("prefers the denial when a denial also closed the target", () => {
    expect(
      classifySandboxFailure(
        "Target closed\nFailed to move to new namespace: errno = Operation not permitted"
      )
    ).toBe("userns_denied");
  });

  it("admits when it does not recognize the failure", () => {
    expect(classifySandboxFailure("something nobody has seen before")).toBe("unknown");
  });
});
