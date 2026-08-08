import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SANDBOX_CANDIDATES,
  classifySandboxFailure,
  orderCandidates,
  probeSandbox,
  type SandboxEnvironment,
} from "../src/index.js";

/**
 * the probe is the gate on tier-1: external pages never render in an
 * unsandboxed browser, so what this file guards is that the gate cannot
 * be widened by accident, and that when it closes it says enough for the
 * closing to be diagnosed from the log alone.
 */

const UNPRIVILEGED: SandboxEnvironment = {
  uid: 1000,
  shm_bytes: 64 * 1024 * 1024,
  memory_limit_bytes: 2 * 1024 * 1024 * 1024,
  memory_available_bytes: 1024 * 1024 * 1024,
  unprivileged_userns: "max_user_namespaces=15000",
  chrome_sandbox_helper: null,
  chromium_version: "Chromium 141.0.0 (fake)",
  missing_libraries: [],
};

describe("the probe never trades the sandbox for a pass", () => {
  // the whole tier-1 precondition rests on this: a ladder that is allowed
  // to reach for --no-sandbox would turn a failing probe into a passing
  // one and put external pages in an unsandboxed browser.
  it("offers no candidate that disables the sandbox", () => {
    for (const candidate of SANDBOX_CANDIDATES) {
      expect(candidate.args).not.toContain("--no-sandbox");
      expect(candidate.args).not.toContain("--disable-gpu-sandbox");
      expect(candidate.args.join(" ")).not.toMatch(/--no-sandbox/);
    }
  });

  // --disable-setuid-sandbox reads like a weakening and is the opposite:
  // it declines chromium's setuid helper so the kernel's namespace
  // sandbox is used instead. the distinction is worth pinning.
  it("keeps at least one rung that asks for the namespace sandbox by name", () => {
    expect(
      SANDBOX_CANDIDATES.some((c) => c.args.includes("--disable-setuid-sandbox"))
    ).toBe(true);
  });
});

describe("the ladder is ordered by what the container actually provides", () => {
  it("routes shared memory to /tmp when /dev/shm is the docker default", () => {
    const first = orderCandidates({ ...UNPRIVILEGED, shm_bytes: 64 * 1024 * 1024 })[0];
    expect(first?.args).toContain("--disable-dev-shm-usage");
  });

  it("uses /dev/shm when the platform gave a real one", () => {
    const first = orderCandidates({ ...UNPRIVILEGED, shm_bytes: 1024 * 1024 * 1024 })[0];
    expect(first?.args).not.toContain("--disable-dev-shm-usage");
  });

  it("keeps every candidate whichever way it orders them", () => {
    for (const shm of [null, 64 * 1024 * 1024, 2 * 1024 * 1024 * 1024]) {
      expect(orderCandidates({ ...UNPRIVILEGED, shm_bytes: shm })).toHaveLength(
        SANDBOX_CANDIDATES.length
      );
    }
  });
});

describe("the probe names which kind of failure it hit", () => {
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
    expect(classifySandboxFailure("Received signal 11 SEGV_MAPERR")).toBe("browser_crashed");
  });

  it("reads a missing binary as an image problem", () => {
    expect(classifySandboxFailure("Executable doesn't exist at /usr/bin/chromium")).toBe(
      "browser_missing"
    );
  });

  // chromium aborting over its own helper is not the kernel refusing
  // anything, and the two want opposite responses: one is fixed in the
  // image, the other cannot be fixed here at all.
  it("separates a broken setuid helper from a userns denial", () => {
    expect(
      classifySandboxFailure(
        "The SUID sandbox helper binary was found, but is not configured correctly. Rather than run without sandboxing I'm aborting now."
      )
    ).toBe("setuid_helper_broken");
  });

  it("prefers the denial when a denial also closed the target", () => {
    expect(
      classifySandboxFailure(
        "Target closed\nFailed to move to new namespace: errno = Operation not permitted"
      )
    ).toBe("userns_denied");
  });
});

describe("the probe walks the ladder and keeps what it saw", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "probe-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** a stand-in chromium that fails every rung with the given words */
  function fakeChromium(name: string, body: string): string {
    const path = join(dir, name);
    writeFileSync(
      path,
      `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "Chromium 0.0 (fake)"; exit 0; fi\n${body}\n`
    );
    chmodSync(path, 0o755);
    return path;
  }

  it("stops at a userns denial instead of trying flags that cannot help", async () => {
    const bin = fakeChromium(
      "userns",
      `echo "Failed to move to new namespace: errno = Operation not permitted" >&2\nexit 133`
    );
    const result = await probeSandbox(bin, { environment: UNPRIVILEGED, timeoutMs: 5000 });
    expect(result.ok).toBe(false);
    expect(result.failure).toBe("userns_denied");
    // the kernel's answer will not change with different flags, and a
    // boot should not spend four launches learning that
    expect(result.attempts).toHaveLength(1);
    expect(result.reason).toContain("Operation not permitted");
  });

  it("carries chromium's own stderr and the container facts into the reason", async () => {
    const bin = fakeChromium(
      "crash",
      `echo "[ERROR:shared_memory_posix.cc(85)] Creating shared memory failed: No space left on device" >&2\necho "Received signal 6" >&2\nexit 133`
    );
    const result = await probeSandbox(bin, { environment: UNPRIVILEGED, timeoutMs: 5000 });
    expect(result.ok).toBe(false);
    expect(result.failure).toBe("browser_crashed");
    // every rung was tried, and every rung kept what chromium printed:
    // this is the difference between a diagnosis and an adjective
    expect(result.attempts).toHaveLength(SANDBOX_CANDIDATES.length);
    for (const attempt of result.attempts ?? []) {
      expect(attempt.stderr).toContain("No space left on device");
    }
    expect(result.reason).toContain("/dev/shm 64mb");
    expect(result.environment?.chromium_version).toBe("Chromium 141.0.0 (fake)");
  });

  it("refuses under root without launching anything", async () => {
    const result = await probeSandbox("/nonexistent", {
      environment: { ...UNPRIVILEGED, uid: 0 },
      timeoutMs: 5000,
    });
    expect(result.ok).toBe(false);
    expect(result.failure).toBe("root");
    expect(result.attempts).toBeUndefined();
  });
});
