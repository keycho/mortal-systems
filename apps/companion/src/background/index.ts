import { apiFetch, loadConfig, type StampedConfig } from "../lib/config.js";
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
      title: `${body.summary.name} · liminal${body.remainingMs !== null ? ` · ${badgeText(body.remainingMs)} left` : ""}`,
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
void chrome.alarms.create("liminal-refresh", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "liminal-refresh") void refresh();
});

// the content script badge asks who we are; nothing from the page ever comes back
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if ((message as { type?: string }).type === "liminal.identity") {
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

// open the side panel from the toolbar button
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) {
    void chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

void refresh();
