import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";
// side-effect import wires the launcher for in-proc runtimes
import "@mortal/runtime";
import { MortalRuntime } from "@mortal/runtime";
import { composeManifest, generateIdentityId, type RpcResponse } from "@mortal/schema";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../..");
const BUNDLED_CHROMIUM = "/opt/pw-browsers/chromium";

export function prepareEnv(): void {
  if (!process.env.MORTAL_BROWSER_PATH && fs.existsSync(BUNDLED_CHROMIUM)) {
    process.env.MORTAL_BROWSER_PATH = BUNDLED_CHROMIUM;
  }
  process.env.MORTAL_HEADLESS = "1";
  const companion = path.join(REPO_ROOT, "apps/companion");
  if (!fs.existsSync(path.join(companion, "dist", "manifest.json"))) {
    execFileSync("node", ["build.mjs"], { cwd: companion, stdio: "inherit" });
  }
}

export function tmpRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ---- in-process runtime (isolation suite) ----

export async function startInProcRuntime(root: string): Promise<MortalRuntime> {
  prepareEnv();
  return MortalRuntime.start({ root, scheduler: { tickMs: 60_000 } });
}

export function createIdentity(
  runtime: MortalRuntime,
  name: string,
  opts: { lifetime?: string; retainHistory?: boolean; color?: string } = {}
): string {
  const id = generateIdentityId();
  runtime.identities.create({
    manifest: composeManifest({
      id,
      name,
      createdAt: new Date().toISOString(),
      lifetime: opts.lifetime ?? "12h",
      retainHistory: opts.retainHistory,
      color: opts.color ?? "#4DA3FF",
    }),
  });
  return id;
}

export interface IdentityBrowser {
  id: string;
  pid: number;
  browser: Browser;
  page: Page;
}

/** launch an identity and attach playwright over its per-identity cdp endpoint */
export async function launchAndConnect(runtime: MortalRuntime, id: string): Promise<IdentityBrowser> {
  const { pid, cdpEndpoint } = await runtime.launch(id);
  const httpEndpoint = `http://${new URL(cdpEndpoint!.replace("ws://", "http://")).host}`;
  const browser = await chromium.connectOverCDP(httpEndpoint);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();
  return { id, pid, browser, page };
}

// ---- child-process runtime (lifecycle suite: real process boundaries) ----

export interface RuntimeProc {
  child: ChildProcess;
  root: string;
  port: number;
  token: string;
  rpc: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  /** wait for the child process to exit on its own (crash tests) */
  waitExit: () => Promise<number | null>;
  stop: () => Promise<void>;
}

export async function startRuntimeProcess(
  root: string,
  env: Record<string, string> = {}
): Promise<RuntimeProc> {
  prepareEnv();
  const cli = path.join(REPO_ROOT, "packages/runtime/dist/cli.js");
  fs.rmSync(path.join(root, "runtime.json"), { force: true });
  const child = spawn(process.execPath, [cli, "serve", "--root", root], {
    env: {
      ...process.env,
      MORTAL_TICK_MS: "500",
      MORTAL_GRACE_SECONDS: "1",
      ...env,
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));

  const metaPath = path.join(root, "runtime.json");
  const tokenPath = path.join(root, "admin.token");
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (fs.existsSync(metaPath) && fs.existsSync(tokenPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as { port: number; pid: number };
        if (meta.pid === child.pid) break;
      } catch {}
    }
    if (child.exitCode !== null) throw new Error(`runtime child exited early (${child.exitCode})`);
    await new Promise((r) => setTimeout(r, 150));
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as { port: number };
  const token = (JSON.parse(fs.readFileSync(tokenPath, "utf8")) as { token: string }).token;

  const rpc = async <T,>(method: string, params?: unknown): Promise<T> => {
    const res = await fetch(`http://127.0.0.1:${meta.port}/v1/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ method, params }),
    });
    const body = (await res.json()) as RpcResponse<T>;
    if (!body.ok) throw new Error(`${body.error.code}: ${body.error.message}`);
    return body.result;
  };

  return {
    child,
    root,
    port: meta.port,
    token,
    rpc,
    waitExit: () => exited,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await Promise.race([exited, new Promise((r) => setTimeout(r, 8_000))]);
        if (child.exitCode === null) child.kill("SIGKILL");
      }
      await exited;
    },
  };
}

export async function pollUntil<T>(
  fn: () => Promise<T> | T,
  predicate: (v: T) => boolean,
  timeoutMs: number,
  intervalMs = 300
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last!: T;
  for (;;) {
    last = await fn();
    if (predicate(last)) return last;
    if (Date.now() > deadline) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
