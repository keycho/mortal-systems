import { chromium } from "playwright-core";

/**
 * the boot-time sandbox probe. tier-1 open-web browsing has one hard
 * precondition: external pages never render in an unsandboxed browser.
 * whether chromium's sandbox can actually start here depends on the
 * host — it needs either the setuid helper or unprivileged user
 * namespaces, and it refuses outright under root. so the answer is not
 * a config value, it is a measurement: launch one sandboxed chromium,
 * and if that fails, external navigation stays off for the whole boot
 * (the terrarium, our own output, remains browsable) and /health names
 * the reason. CHROME_SANDBOX=1 asks; this probe decides.
 */

export interface SandboxProbeResult {
  ok: boolean;
  reason?: string;
}

export async function probeSandbox(executablePath?: string): Promise<SandboxProbeResult> {
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    return {
      ok: false,
      reason:
        "running as root: chromium refuses to sandbox under uid 0 (the deploy image drops to a non-root user; see the entrypoint)",
    };
  }
  try {
    const browser = await chromium.launch({
      headless: true,
      chromiumSandbox: true,
      ...(executablePath ? { executablePath } : {}),
      args: ["--disable-dev-shm-usage", "--disable-gpu"],
      timeout: 20_000,
    });
    await browser.close();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return {
      ok: false,
      reason: `sandboxed launch failed (likely no user namespaces on this host): ${message}`,
    };
  }
}
