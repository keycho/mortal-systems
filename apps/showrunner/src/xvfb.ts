import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * a virtual screen per identity, so the browser can be a browser.
 *
 * headless chromium has no window: cdp screencasts the page, and the page
 * has never included the tabs, the toolbar or the url bar around it. the
 * wall is a show about identities using the web, and a picture of the
 * document alone leaves out the part a viewer recognises. so each agent
 * gets its own X screen sized exactly to its capture frame, chromium
 * opens on it as a real window, and ffmpeg grabs the screen.
 *
 * one screen per agent rather than one shared: windows would otherwise
 * overlap and every cell would show whoever raised last. it also means a
 * screen that dies costs one identity its chrome, not the whole wall.
 */

export interface VirtualScreen {
  display: string;
  width: number;
  height: number;
  stop(): void;
}

const SOCKET_WAIT_MS = 8000;

export function xvfbAvailable(): boolean {
  // resolved by PATH lookup rather than a fixed path: distributions
  // disagree, and the deploy image is not the only place this runs
  return which("Xvfb") !== null;
}

export function which(binary: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    const path = `${dir}/${binary}`;
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * start one screen and wait for it to actually exist. the wait is the
 * point: chromium launched against a display whose socket has not
 * appeared yet fails with an error that reads like a chromium problem.
 */
export async function startVirtualScreen(opts: {
  displayNumber: number;
  width: number;
  height: number;
}): Promise<VirtualScreen> {
  const display = `:${opts.displayNumber}`;
  const child: ChildProcess = spawn(
    "Xvfb",
    [
      display,
      "-screen",
      "0",
      `${opts.width}x${opts.height}x24`,
      // no tcp listener: this screen is for one process on this host
      "-nolisten",
      "tcp",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-2000);
  });

  const socket = `/tmp/.X11-unix/X${opts.displayNumber}`;
  const deadline = Date.now() + SOCKET_WAIT_MS;
  for (;;) {
    if (existsSync(socket)) break;
    if (child.exitCode !== null || Date.now() > deadline) {
      child.kill("SIGKILL");
      throw new Error(
        `Xvfb ${display} never came up${stderr ? `: ${stderr.split("\n")[0]}` : ""}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    display,
    width: opts.width,
    height: opts.height,
    stop(): void {
      try {
        child.kill("SIGTERM");
      } catch {
        // already gone; the screen is no less stopped
      }
    },
  };
}
