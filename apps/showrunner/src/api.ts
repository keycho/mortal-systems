import { createServer, type Server, type ServerResponse } from "node:http";
import {
  agentNow,
  depthScore,
  recap,
  tickerLines,
  type RecapSummarizer,
  type WallStore,
} from "@mortal/wall";

/**
 * the public wall api the gate and watch page render from. read-only,
 * public events only: internal events never cross this boundary, and
 * there is no write route at all. sse keeps latency low without paying
 * for webrtc; everything else is a cacheable snapshot.
 *
 *   GET /now            agent_now snapshot (plus depth with its inputs)
 *   GET /wire           last 50 public events, humanized
 *   GET /events         sse: public events as they append
 *   GET /events?after=  backfill from a cursor, then live
 *   GET /recap?since=   "while you were away", llm optional
 *   GET /graveyard      every dead identity's card data
 */

export interface WallApiOptions {
  store: WallStore;
  names: () => Record<string, string>;
  /** real accumulated state per agent for the depth read model */
  depthInputs?: (agentId: string) =>
    | { cookie_count: number; account_count: number; memory_bytes: number; post_count: number }
    | null;
  summarizer?: RecapSummarizer;
  /** the origin allowed to read us from a browser; * by default, the api
   * is public and read-only */
  corsOrigin?: string;
}

export function createWallApi(opts: WallApiOptions): Server {
  const { store } = opts;
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://wall.local");
    res.setHeader("access-control-allow-origin", opts.corsOrigin ?? "*");
    if (req.method !== "GET") return sendJson(res, 405, { error: "read-only" });

    if (url.pathname === "/now") {
      const agents = agentNow(store.list({ publicOnly: true }), { names: opts.names() });
      const enriched = agents.map((agent) => {
        const inputs = opts.depthInputs?.(agent.agent_id) ?? null;
        return inputs ? { ...agent, depth: depthScore(inputs), depth_inputs: inputs } : agent;
      });
      return sendJson(res, 200, { agents: enriched, alive: enriched.filter((a) => a.state !== "dead" && a.state !== "unborn").length });
    }

    if (url.pathname === "/wire") {
      const events = store.list({ publicOnly: true, newestFirst: true, limit: 50 }).reverse();
      return sendJson(res, 200, { lines: tickerLines(events, { limit: 50, names: opts.names() }) });
    }

    if (url.pathname === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": opts.corsOrigin ?? "*",
      });
      const after = url.searchParams.get("after");
      for (const event of store.list({ publicOnly: true, ...(after ? { afterId: after } : { }) })) {
        res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
      }
      const unsubscribe = store.subscribe((event) => {
        if (event.visibility !== "public") return;
        res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
      });
      const keepalive = setInterval(() => res.write(": keepalive\n\n"), 25_000);
      keepalive.unref();
      req.on("close", () => {
        clearInterval(keepalive);
        unsubscribe();
      });
      return;
    }

    if (url.pathname === "/recap") {
      const since =
        url.searchParams.get("since") ?? new Date(Date.now() - 6 * 3600_000).toISOString();
      const events = store.list({ publicOnly: true, since });
      void recap(events, { names: opts.names(), summarizer: opts.summarizer }).then((text) =>
        sendJson(res, 200, { since, text })
      );
      return;
    }

    if (url.pathname === "/graveyard") {
      const agents = agentNow(store.list({ publicOnly: true }), { names: opts.names() });
      const dead = agents
        .filter((a) => a.state === "dead" && a.death)
        .map((a) => ({
          agent_id: a.agent_id,
          name: a.name,
          class: a.class,
          region: a.region,
          born: a.spawned_at,
          died: a.death?.ts,
          lived_seconds:
            a.spawned_at && a.death ? Math.floor((Date.parse(a.death.ts) - Date.parse(a.spawned_at)) / 1000) : null,
          cause: a.death?.cause,
          final_words: a.death?.final_words,
          receipt: a.death?.receipt,
        }));
      return sendJson(res, 200, { dead });
    }

    return sendJson(res, 404, { error: "not found" });
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
