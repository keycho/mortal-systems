import { apiFetch, loadConfig, type StampedConfig } from "../lib/config.js";
import { streamSelfEvents } from "../lib/sse.js";
import { formatRemaining } from "../lib/format.js";

/**
 * side panel: identity header, live countdown (sse with local interpolation),
 * expiry warnings, and user-initiated early expiry with confirm.
 * notes / ai context / permissions panels are day-4 scope and mount from
 * ./panels.js when present.
 */

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

interface SelfSummary {
  name: string;
  state: string;
  color: string;
  lifetime: string;
  spaceNumber: number;
}

let remainingMs: number | null = null;
let lastTickAt = 0;

function renderState(state: string): void {
  $("state-pill").textContent = state;
}

function renderCountdown(): void {
  if (remainingMs === null) return;
  const drift = lastTickAt > 0 ? Date.now() - lastTickAt : 0;
  $("countdown-value").textContent = formatRemaining(Math.max(0, remainingMs - drift));
}

async function main(): Promise<void> {
  const config = await loadConfig();
  if (config === null) {
    $("idle").hidden = false;
    return;
  }

  const res = await apiFetch(config, "/v1/self");
  if (!res.ok) {
    $("idle").hidden = false;
    $("idle").textContent = `runtime unreachable (${res.status}). is mortal running?`;
    return;
  }
  const body = (await res.json()) as { summary: SelfSummary; remainingMs: number | null };
  const summary = body.summary;

  document.documentElement.style.setProperty("--accent", summary.color);
  $("header").hidden = false;
  $("footer").hidden = false;
  $("identity-name").textContent = summary.name;
  $("space-number").textContent = `space ${String(summary.spaceNumber).padStart(3, "0")}`;
  renderState(summary.state);

  if (body.remainingMs !== null) {
    remainingMs = body.remainingMs;
    lastTickAt = Date.now();
    $("countdown").hidden = false;
    renderCountdown();
    setInterval(renderCountdown, 1_000);
  } else {
    $("persistent-line").hidden = false;
  }

  // day-4 panels mount here when built
  void import("./panels.js")
    .then((m) => m.mountPanels(config))
    .catch(() => {});

  wireExpire(config);
  connectEvents(config);
}

function connectEvents(config: StampedConfig): void {
  void streamSelfEvents(config, {
    onEvent: (type, data) => {
      if (type === "tick" || type === "state") {
        const state = data.state as string | undefined;
        if (state) renderState(state);
        if (typeof data.remainingMs === "number") {
          remainingMs = data.remainingMs;
          lastTickAt = Date.now();
          renderCountdown();
        }
      }
      if (type === "warning" || type === "grace") {
        const warning = $("warning");
        warning.hidden = false;
        warning.textContent = (data.message as string | undefined) ?? "space closing soon";
      }
    },
    onDisconnect: () => {
      // reconnect with backoff; the runtime may be restarting
      setTimeout(() => connectEvents(config), 3_000);
    },
  });
}

function wireExpire(config: StampedConfig): void {
  const button = $("expire-button");
  const confirm = $("expire-confirm");
  button.addEventListener("click", () => {
    button.hidden = true;
    confirm.hidden = false;
  });
  $("expire-no").addEventListener("click", () => {
    confirm.hidden = true;
    button.hidden = false;
  });
  $("expire-yes").addEventListener("click", () => {
    void apiFetch(config, "/v1/self/expire", { method: "POST", body: "{}" }).then(() => {
      confirm.hidden = true;
      const warning = $("warning");
      warning.hidden = false;
      warning.textContent = "space closing. this window will terminate.";
    });
  });
}

void main();
