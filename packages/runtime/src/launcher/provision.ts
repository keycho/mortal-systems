import fs from "node:fs";
import path from "node:path";
import type { IdentityManifest } from "@liminal/schema";
import type { Repo } from "../store/repo.js";
import { ensureDir } from "../util/fsx.js";
import { insideRoot } from "../util/paths.js";

/**
 * first-launch provisioning: create the identity's partition directories and
 * seed chrome preferences (downloads directory, profile name, bookmark bar)
 * and bookmarks. the companion instance is stamped separately (day 3).
 *
 * preference seeding is written before chrome ever opens the profile; chrome
 * merges and rewrites these files afterwards. the theme color seed is
 * cosmetic best-effort — chrome versions differ in honoring it, and nothing
 * enforcement-related depends on it.
 */

export interface ProvisionedPaths {
  profileDir: string;
  filesDir: string;
  downloadsDir: string;
}

/** chrome stores theme user_color as a signed 32-bit ARGB int */
export function hexToSkColor(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const argb = (0xff << 24) | (r << 16) | (g << 8) | b;
  return argb | 0;
}

export function provisionIdentity(
  root: string,
  repo: Repo,
  manifest: IdentityManifest
): ProvisionedPaths {
  const profileDir = insideRoot(root, manifest.surfaces.browser.profilePath);
  const filesDir = insideRoot(root, manifest.surfaces.files.root);
  const downloadsDir = path.join(filesDir, "downloads");
  const defaultDir = path.join(profileDir, "Default");

  ensureDir(profileDir);
  ensureDir(defaultDir);
  ensureDir(filesDir);
  ensureDir(downloadsDir);

  const preferencesPath = path.join(defaultDir, "Preferences");
  if (!fs.existsSync(preferencesPath)) {
    const preferences = {
      profile: {
        name: `${manifest.name} · liminal`,
        exit_type: "Normal",
      },
      download: {
        default_directory: downloadsDir,
        prompt_for_download: false,
        directory_upgrade: true,
      },
      savefile: { default_directory: downloadsDir },
      bookmark_bar: { show_on_all_tabs: true },
      credentials_enable_service: false,
      browser: { theme: { user_color: hexToSkColor(manifest.surfaces.browser.theme) } },
    };
    fs.writeFileSync(preferencesPath, JSON.stringify(preferences));
  }

  const bookmarks = repo.listBookmarks(manifest.id);
  const bookmarksPath = path.join(defaultDir, "Bookmarks");
  if (bookmarks.length > 0 && !fs.existsSync(bookmarksPath)) {
    let nextId = 1;
    const nid = () => String(++nextId);
    type ChromeNode = {
      id: string;
      name: string;
      type: "url" | "folder";
      url?: string;
      date_added?: string;
      children?: ChromeNode[];
    };
    const topLevel: ChromeNode[] = [];
    const folders = new Map<string, ChromeNode>();
    for (const bm of bookmarks) {
      const node: ChromeNode = {
        id: nid(),
        name: bm.title,
        type: "url",
        url: bm.url,
        date_added: "0",
      };
      if (bm.folder !== null && bm.folder.length > 0) {
        let folder = folders.get(bm.folder);
        if (!folder) {
          folder = { id: nid(), name: bm.folder, type: "folder", date_added: "0", children: [] };
          folders.set(bm.folder, folder);
          topLevel.push(folder);
        }
        folder.children!.push(node);
      } else {
        topLevel.push(node);
      }
    }
    const bookmarksFile = {
      version: 1,
      roots: {
        bookmark_bar: {
          id: "1",
          name: "Bookmarks bar",
          type: "folder",
          date_added: "0",
          children: topLevel,
        },
        other: { id: nid(), name: "Other bookmarks", type: "folder", date_added: "0", children: [] },
        synced: { id: nid(), name: "Mobile bookmarks", type: "folder", date_added: "0", children: [] },
      },
    };
    fs.writeFileSync(bookmarksPath, JSON.stringify(bookmarksFile));
  }

  return { profileDir, filesDir, downloadsDir };
}

/** history artifacts removed when privacy.retainHistory is false (enforced, G15) */
const HISTORY_ARTIFACTS = [
  "History",
  "History-journal",
  "History Provider Cache",
  "Archived History",
  "Visited Links",
  "Top Sites",
  "Top Sites-journal",
  "Shortcuts",
  "Shortcuts-journal",
];

export function scrubHistory(profileDir: string): string[] {
  const removed: string[] = [];
  const defaultDir = path.join(profileDir, "Default");
  for (const name of HISTORY_ARTIFACTS) {
    const target = path.join(defaultDir, name);
    try {
      if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
        removed.push(name);
      }
    } catch {}
  }
  const sessions = path.join(defaultDir, "Sessions");
  try {
    if (fs.existsSync(sessions)) {
      fs.rmSync(sessions, { recursive: true, force: true });
      removed.push("Sessions");
    }
  } catch {}
  return removed;
}
