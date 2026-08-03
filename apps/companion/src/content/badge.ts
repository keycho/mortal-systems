/**
 * corner badge: identity name + color in the page corner so every window is
 * unmistakably attributable to its space. renders in a closed shadow root,
 * ignores pointer events, and collects nothing from the page.
 */

interface IdentityInfo {
  name: string;
  color: string;
  state: string;
  remainingMs: number | null;
}

function mountBadge(info: IdentityInfo): void {
  const host = document.createElement("div");
  host.setAttribute("data-liminal-badge", "");
  const shadow = host.attachShadow({ mode: "closed" });

  const badge = document.createElement("div");
  badge.setAttribute(
    "style",
    [
      "position: fixed",
      "right: 12px",
      "bottom: 12px",
      "z-index: 2147483647",
      "display: flex",
      "align-items: center",
      "gap: 7px",
      "padding: 5px 10px",
      "background: rgba(11, 12, 14, 0.92)",
      "border: 1px solid rgba(255,255,255,0.12)",
      "border-radius: 3px",
      "font: 11px/1.4 ui-monospace, Menlo, monospace",
      "color: #e6e7e9",
      "pointer-events: none",
      "user-select: none",
    ].join("; ")
  );

  const dot = document.createElement("span");
  dot.setAttribute(
    "style",
    `width: 8px; height: 8px; border-radius: 2px; background: ${info.color}; display: inline-block`
  );
  const label = document.createElement("span");
  label.textContent = info.name;

  badge.append(dot, label);
  shadow.append(badge);
  document.documentElement.append(host);

  // window-title suffix so the os window list is attributable too
  const suffix = ` · ${info.name} · liminal`;
  if (!document.title.endsWith(suffix)) {
    document.title = `${document.title}${suffix}`;
  }
}

chrome.runtime.sendMessage({ type: "liminal.identity" }, (info: IdentityInfo | null) => {
  if (chrome.runtime.lastError || info === null || !info.name) return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mountBadge(info), { once: true });
  } else {
    mountBadge(info);
  }
});
