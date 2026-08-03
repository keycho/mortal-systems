import { apiFetch, loadConfig } from "../lib/config.js";
import { badgeText } from "../lib/badge.js";

/**
 * background worker: keeps the toolbar badge (identity color + remaining
 * lifetime) fresh and answers identity queries from the content script.
 * all requests carry the stamped per-identity bearer token.
 */

interface SelfSnapshot {
  name: string;
  color: string;
  state: string;
  remainingMs: number | null;
}

let cached: SelfSnapshot | null = null;

async function refresh(): Promise<void> {
  const config = await loadConfig();
  if (config === null) {
    // unstamped template: idle quietly
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  try {
    const res = await apiFetch(config, "/v1/self");
    if (!res.ok) throw new Error(`self returned ${res.status}`);
    const body = (await res.json()) as {
      summary: { name: string; color: string; state: string };
      remainingMs: number | null;
    };
    cached = {
      name: body.summary.name,
      color: body.summary.color,
      state: body.summary.state,
      remainingMs: body.remainingMs,
    };
    await chrome.action.setBadgeBackgroundColor({ color: body.summary.color });
    await chrome.action.setBadgeText({ text: badgeText(body.remainingMs) });
    await chrome.action.setTitle({
      title: `${body.summary.name} · mortal${body.remainingMs !== null ? ` · ${badgeText(body.remainingMs)} left` : ""}`,
    });
  } catch {
    // runtime restarting or port rotated; fall back to stamped identity colors
    cached = { name: config.name, color: config.color, state: "unknown", remainingMs: null };
    await chrome.action.setBadgeBackgroundColor({ color: config.color });
    await chrome.action.setBadgeText({ text: "?" });
  }
}

chrome.runtime.onInstalled.addListener(() => void refresh());
chrome.runtime.onStartup.addListener(() => void refresh());
void chrome.alarms.create("mortal-refresh", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "mortal-refresh") void refresh();
});

// the content script badge asks who we are; nothing from the page ever comes back
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if ((message as { type?: string }).type === "mortal.systemsentity") {
    if (cached !== null) {
      sendResponse(cached);
    } else {
      void loadConfig().then((config) => {
        sendResponse(
          config === null
            ? null
            : { name: config.name, color: config.color, state: "unknown", remainingMs: null }
        );
      });
      return true; // async response
    }
  }
  return undefined;
});

// open the side panel from the toolbar button. preferred: declare it as
// native browser behavior (setPanelBehavior), so the companion performs no
// scripted navigation at all — brave's shields/interstitial treats scripted
// chrome-extension:// page-style loads of sideloaded extensions with
// suspicion, and a declared panel never becomes a page load. fallback for
// engines without setPanelBehavior: a guarded explicit open. there is
// deliberately no tab fallback — the companion never opens a page, period.
if (chrome.sidePanel?.setPanelBehavior) {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
} else if (chrome.action?.onClicked) {
  chrome.action.onClicked.addListener((tab) => {
    if (tab.windowId !== undefined && chrome.sidePanel?.open) {
      void chrome.sidePanel.open({ windowId: tab.windowId });
    }
  });
}

void refresh();
