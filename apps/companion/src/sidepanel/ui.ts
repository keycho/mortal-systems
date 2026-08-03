/**
 * pure dom builders for the side panel. exported separately so the
 * enforcement-badge rendering (BADGE-1) is unit-testable without chrome.
 */

export type Enforcement = "enforced" | "advisory" | "roadmap";

export interface PermissionRow {
  field: string;
  value: string;
  enforcement: Enforcement;
  description: string;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: Array<HTMLElement | string> = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

/** solid = enforced, outlined = advisory, dashed = roadmap */
export function renderBadge(enforcement: Enforcement): HTMLElement {
  return el("span", {
    class: `badge badge-${enforcement}`,
    text: enforcement,
    "data-testid": "enforcement-badge",
    "data-enforcement": enforcement,
  });
}

export function fieldLabel(field: string): string {
  return field.replace(/^permissions\./, "").replace(/^privacy\./, "");
}

export function renderPermissionRow(row: PermissionRow): HTMLElement {
  const container = el(
    "div",
    {
      class: "perm-row",
      title: row.description,
      style: "display:flex; align-items:baseline; gap:8px; justify-content:space-between",
    },
    [
      el("span", { class: "mute", text: fieldLabel(row.field) }),
      el("span", { text: row.value, style: "margin-left:auto" }),
      renderBadge(row.enforcement),
    ]
  );
  // the honesty line the foundation demands for wallet declarations
  if (row.field === "permissions.wallet" && row.value !== "none") {
    return el("div", {}, [
      container,
      el("div", {
        class: "mute",
        style: "font-size:10px; padding-left:2px",
        text: "a declaration, not a technical control",
      }),
    ]);
  }
  return container;
}

export interface NoteWire {
  id: string;
  title: string | null;
  bodyMd: string | null;
  updatedAt: string;
}

export interface MessageWire {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export function renderMessage(message: MessageWire): HTMLElement {
  return el(
    "div",
    { style: "display:flex; flex-direction:column; gap:2px", "data-testid": "ai-message" },
    [
      el("span", { class: "mute", style: "font-size:10px", text: message.role }),
      el("span", { style: "white-space:pre-wrap", text: message.content }),
    ]
  );
}
