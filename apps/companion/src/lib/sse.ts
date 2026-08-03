import { apiBase, type StampedConfig } from "./config.js";

/**
 * sse over fetch: EventSource cannot send an Authorization header, so the
 * side panel streams /v1/self/events with a bearer token via fetch and
 * parses the event stream manually. the token never appears in a url.
 */
export interface SseHandlers {
  onEvent: (type: string, data: Record<string, unknown>) => void;
  onDisconnect?: () => void;
}

export async function streamSelfEvents(
  config: StampedConfig,
  handlers: SseHandlers,
  signal?: AbortSignal
): Promise<void> {
  try {
    const res = await fetch(`${apiBase(config)}/v1/self/events`, {
      headers: { authorization: `Bearer ${config.token}` },
      signal: signal ?? null,
    });
    if (!res.ok || res.body === null) {
      handlers.onDisconnect?.();
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let type = "message";
        let data = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event: ")) type = line.slice(7).trim();
          else if (line.startsWith("data: ")) data += line.slice(6);
        }
        if (data.length > 0) {
          try {
            handlers.onEvent(type, JSON.parse(data) as Record<string, unknown>);
          } catch {}
        }
      }
    }
  } catch {}
  handlers.onDisconnect?.();
}
