import { apiFetch, type StampedConfig } from "../lib/config.js";
import {
  el,
  renderBadge,
  renderMessage,
  renderPermissionRow,
  type MessageWire,
  type NoteWire,
  type PermissionRow,
} from "./ui.js";

/**
 * day-4 panels: notes, ai context + local chat log, permissions with
 * enforcement badges. everything speaks the identity-scoped /v1/self surface
 * with the stamped token; the ai provider key is pasted by the user, held in
 * runtime memory only, and used directly from this panel.
 */

const $ = (id: string): HTMLElement => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node;
};

export function mountPanels(config: StampedConfig): void {
  void mountNotes(config);
  void mountAi(config);
  void mountPermissions(config);
}

// ---- notes ----

async function mountNotes(config: StampedConfig): Promise<void> {
  const panel = $("panel-notes");
  panel.hidden = false;

  const list = el("div", { style: "display:flex; flex-direction:column; gap:4px" });
  const editor = el("div", { style: "display:flex; flex-direction:column; gap:6px" });
  editor.hidden = true;

  const titleInput = el("input", {
    placeholder: "title",
    style: "font:inherit; background:var(--panel-2); border:1px solid var(--line); color:inherit; padding:6px",
  });
  const bodyInput = el("textarea", {
    rows: "6",
    placeholder: "notes for this space…",
    style: "font:inherit; background:var(--panel-2); border:1px solid var(--line); color:inherit; padding:6px; resize:vertical",
  });
  const saveButton = el("button", { text: "save" });
  const deleteButton = el("button", { class: "danger-outline", text: "delete" });
  const closeButton = el("button", { text: "close" });
  const newButton = el("button", { text: "new note" });

  let openNote: NoteWire | null = null;

  const refresh = async () => {
    const res = await apiFetch(config, "/v1/self/notes");
    const notes = (await res.json()) as NoteWire[];
    list.replaceChildren(
      ...notes.map((note) =>
        el(
          "button",
          {
            style: "text-align:left; display:flex; justify-content:space-between; gap:8px",
            "data-note": note.id,
          },
          [
            el("span", { text: note.title ?? "untitled" }),
            el("span", { class: "mute", text: new Date(note.updatedAt).toLocaleTimeString() }),
          ]
        )
      )
    );
    for (const button of list.querySelectorAll("button")) {
      button.addEventListener("click", () => {
        const note = notes.find((n) => n.id === button.getAttribute("data-note"));
        if (note) {
          openNote = note;
          titleInput.value = note.title ?? "";
          bodyInput.value = note.bodyMd ?? "";
          editor.hidden = false;
        }
      });
    }
  };

  newButton.addEventListener("click", () => {
    void apiFetch(config, "/v1/self/notes", {
      method: "POST",
      body: JSON.stringify({ title: "untitled", bodyMd: "" }),
    }).then(async (res) => {
      openNote = (await res.json()) as NoteWire;
      titleInput.value = openNote.title ?? "";
      bodyInput.value = "";
      editor.hidden = false;
      await refresh();
    });
  });

  saveButton.addEventListener("click", () => {
    if (!openNote) return;
    void apiFetch(config, `/v1/self/notes/${openNote.id}`, {
      method: "PUT",
      body: JSON.stringify({ title: titleInput.value || null, bodyMd: bodyInput.value || null }),
    }).then(refresh);
  });

  deleteButton.addEventListener("click", () => {
    if (!openNote) return;
    void apiFetch(config, `/v1/self/notes/${openNote.id}`, { method: "DELETE" }).then(() => {
      openNote = null;
      editor.hidden = true;
      void refresh();
    });
  });

  closeButton.addEventListener("click", () => {
    editor.hidden = true;
    openNote = null;
  });

  editor.append(titleInput, bodyInput, el("div", { style: "display:flex; gap:6px" }, [saveButton, deleteButton, closeButton]));
  panel.append(el("h2", { text: "notes" }), newButton, list, editor);
  await refresh();
}

// ---- ai ----

async function mountAi(config: StampedConfig): Promise<void> {
  const panel = $("panel-ai");
  panel.hidden = false;

  const context = (await (await apiFetch(config, "/v1/self/ai/context")).json()) as {
    systemInstructions: string;
    provider: string;
  };

  const instructions = el("div", {
    class: "mute",
    style: "white-space:pre-wrap; font-size:11px; border:1px solid var(--line); padding:8px",
    text: context.systemInstructions || "no system instructions for this space.",
  });

  const messages = el("div", {
    style: "display:flex; flex-direction:column; gap:8px; max-height:220px; overflow:auto",
  });
  const refreshMessages = async () => {
    const rows = (await (await apiFetch(config, "/v1/self/ai/messages")).json()) as MessageWire[];
    messages.replaceChildren(...rows.map(renderMessage));
    messages.scrollTop = messages.scrollHeight;
  };

  const keyState = el("span", { class: "mute", style: "font-size:10px", text: "checking key…" });
  const keyInput = el("input", {
    type: "password",
    placeholder: "anthropic api key (held in runtime memory only)",
    style: "font:inherit; background:var(--panel-2); border:1px solid var(--line); color:inherit; padding:6px; flex:1",
  });
  const keyButton = el("button", { text: "hold key" });
  const refreshKeyState = async () => {
    const { key } = (await (await apiFetch(config, "/v1/self/ai/key")).json()) as { key: string | null };
    keyState.textContent = key
      ? "key held in runtime memory (dies with the runtime, never stored)"
      : "no key: messages are stored locally, no model is called";
  };
  keyButton.addEventListener("click", () => {
    void apiFetch(config, "/v1/self/ai/key", {
      method: "POST",
      body: JSON.stringify({ key: keyInput.value || null }),
    }).then(() => {
      keyInput.value = "";
      void refreshKeyState();
    });
  });

  const input = el("textarea", {
    rows: "2",
    placeholder: "ask inside this space…",
    style: "font:inherit; background:var(--panel-2); border:1px solid var(--line); color:inherit; padding:6px; resize:vertical; flex:1",
  });
  const sendButton = el("button", { text: "send" });

  sendButton.addEventListener("click", () => void send());
  input.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Enter" && !(event as KeyboardEvent).shiftKey) {
      event.preventDefault();
      void send();
    }
  });

  async function send(): Promise<void> {
    const content = input.value.trim();
    if (content.length === 0) return;
    input.value = "";
    await apiFetch(config, "/v1/self/ai/messages", {
      method: "POST",
      body: JSON.stringify({ role: "user", content }),
    });
    await refreshMessages();

    const { key } = (await (await apiFetch(config, "/v1/self/ai/key")).json()) as { key: string | null };
    if (!key) return;

    try {
      const history = (await (await apiFetch(config, "/v1/self/ai/messages")).json()) as MessageWire[];
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 1024,
          system: context.systemInstructions || undefined,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) throw new Error(`provider returned ${res.status}`);
      const body = (await res.json()) as { content: Array<{ type: string; text?: string }> };
      const text = body.content
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");
      if (text.length > 0) {
        await apiFetch(config, "/v1/self/ai/messages", {
          method: "POST",
          body: JSON.stringify({ role: "assistant", content: text }),
        });
      }
    } catch (err) {
      await apiFetch(config, "/v1/self/ai/messages", {
        method: "POST",
        body: JSON.stringify({
          role: "assistant",
          content: `provider call failed: ${err instanceof Error ? err.message : String(err)}. the conversation stays local to this space.`,
        }),
      });
    }
    await refreshMessages();
  }

  panel.append(
    el("h2", { text: "ai · scoped to this space" }),
    instructions,
    messages,
    el("div", { style: "display:flex; gap:6px" }, [input, sendButton]),
    el("div", { style: "display:flex; gap:6px; align-items:center" }, [keyInput, keyButton]),
    keyState
  );
  await refreshMessages();
  await refreshKeyState();
}

// ---- permissions ----

async function mountPermissions(config: StampedConfig): Promise<void> {
  const panel = $("panel-permissions");
  panel.hidden = false;
  const rows = (await (await apiFetch(config, "/v1/self/permissions")).json()) as PermissionRow[];
  panel.append(
    el("h2", { text: "permissions" }),
    el(
      "div",
      { style: "display:flex; flex-direction:column; gap:6px" },
      rows.map(renderPermissionRow)
    ),
    el("div", { style: "display:flex; gap:8px; align-items:center; padding-top:2px" }, [
      renderBadge("enforced"),
      el("span", { class: "mute", style: "font-size:10px", text: "tested control" }),
      renderBadge("advisory"),
      el("span", { class: "mute", style: "font-size:10px", text: "declaration" }),
      renderBadge("roadmap"),
      el("span", { class: "mute", style: "font-size:10px", text: "not built" }),
    ])
  );
}
