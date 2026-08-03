import { readEnv } from "../util/env.js";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { DetectedBrowser } from "@mortal/schema";
import { errors } from "../errors.js";

const execFileP = promisify(execFile);

interface Candidate {
  kind: DetectedBrowser["kind"];
  paths: string[];
  names: string[];
}

/** standard install locations per os, chrome stable first, then chromium, then brave */
function candidates(): Candidate[] {
  const platform = os.platform();
  if (platform === "darwin") {
    return [
      {
        kind: "chrome",
        paths: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
        names: [],
      },
      {
        kind: "chromium",
        paths: ["/Applications/Chromium.app/Contents/MacOS/Chromium"],
        names: [],
      },
      {
        kind: "brave",
        paths: ["/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"],
        names: [],
      },
    ];
  }
  if (platform === "win32") {
    // written per spec but untested in this build environment (flagged in docs)
    const programFiles = process.env["PROGRAMFILES"] ?? "C:\\Program Files";
    const programFilesX86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
    const localAppData = process.env["LOCALAPPDATA"] ?? "";
    return [
      {
        kind: "chrome",
        paths: [
          path.join(programFiles, "Google/Chrome/Application/chrome.exe"),
          path.join(programFilesX86, "Google/Chrome/Application/chrome.exe"),
          localAppData ? path.join(localAppData, "Google/Chrome/Application/chrome.exe") : "",
        ].filter(Boolean),
        names: [],
      },
      {
        kind: "chromium",
        paths: [localAppData ? path.join(localAppData, "Chromium/Application/chrome.exe") : ""].filter(
          Boolean
        ),
        names: [],
      },
      {
        kind: "brave",
        paths: [
          path.join(programFiles, "BraveSoftware/Brave-Browser/Application/brave.exe"),
        ],
        names: [],
      },
    ];
  }
  // linux
  return [
    {
      kind: "chrome",
      paths: ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/opt/google/chrome/chrome"],
      names: ["google-chrome-stable", "google-chrome"],
    },
    {
      kind: "chromium",
      paths: ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"],
      names: ["chromium", "chromium-browser"],
    },
    {
      kind: "brave",
      paths: ["/usr/bin/brave-browser", "/opt/brave.com/brave/brave-browser"],
      names: ["brave-browser"],
    },
  ];
}

function firstExisting(paths: string[]): string | null {
  for (const p of paths) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {}
  }
  return null;
}

async function lookupOnPath(names: string[]): Promise<string | null> {
  for (const name of names) {
    try {
      const { stdout } = await execFileP(os.platform() === "win32" ? "where" : "which", [name]);
      const found = stdout.split("\n")[0]?.trim();
      if (found) return found;
    } catch {}
  }
  return null;
}

async function browserVersion(executable: string): Promise<string | null> {
  try {
    const { stdout } = await execFileP(executable, ["--version"], { timeout: 10_000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export function majorVersion(version: string | null): number | null {
  const m = version?.match(/(\d+)\.\d+/);
  return m ? Number(m[1]) : null;
}

/**
 * discover launchable browsers. order: MORTAL_BROWSER_PATH override, then
 * chrome stable, chromium, brave from standard locations. hard error with
 * instructions when nothing is found.
 */
export async function discoverBrowsers(): Promise<DetectedBrowser[]> {
  const found: DetectedBrowser[] = [];

  const override = readEnv("MORTAL_BROWSER_PATH");
  if (override && override.length > 0) {
    try {
      fs.accessSync(override, fs.constants.X_OK);
      const version = await browserVersion(override);
      const lower = `${override} ${version ?? ""}`.toLowerCase();
      const kind: DetectedBrowser["kind"] = lower.includes("brave")
        ? "brave"
        : lower.includes("chromium")
          ? "chromium"
          : "chrome";
      found.push({ kind, path: override, version, source: "env-override" });
    } catch {
      throw errors.browserNotFound(
        `MORTAL_BROWSER_PATH is set to "${override}" but it is not an executable file`
      );
    }
  }

  for (const candidate of candidates()) {
    let executable = firstExisting(candidate.paths);
    let source: DetectedBrowser["source"] = "standard-path";
    if (!executable && candidate.names.length > 0) {
      executable = await lookupOnPath(candidate.names);
      source = "path-lookup";
    }
    if (executable && !found.some((b) => b.path === executable)) {
      found.push({
        kind: candidate.kind,
        path: executable,
        version: await browserVersion(executable),
        source,
      });
    }
  }

  if (found.length === 0) {
    throw errors.browserNotFound(
      "no chromium-based browser found. install google chrome (https://google.com/chrome), " +
        "or chromium/brave, or point MORTAL_BROWSER_PATH at a chromium executable."
    );
  }
  return found;
}

/** honest operational warnings derived from the detected browser set */
export function discoveryWarnings(browsers: DetectedBrowser[]): string[] {
  const warnings: string[] = [];
  const def = browsers[0];
  if (def && def.kind === "chrome") {
    const major = majorVersion(def.version);
    if (major !== null && major >= 137) {
      warnings.push(
        `chrome ${major} may ignore --load-extension in branded builds; the companion may not load. ` +
          "fallback: install chromium or brave (risk r3, see docs)."
      );
    }
  }
  return warnings;
}
