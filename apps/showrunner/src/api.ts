import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  agentNow,
  depthScore,
  recap,
  tickerLines,
  wallStats,
  type RecapSummarizer,
  type WallStore,
} from "@mortal/wall";

/**
 * the public wall api the gate and watch page render from. read-only,
 * public events only: internal events never cross this boundary, and
 * there is no write route at all. sse keeps latency low without paying
 * for webrtc; everything else is a cacheable snapshot.
 *
 *   GET /health         liveness for the deploy platform's healthcheck
 *   GET /now            agent_now snapshot (plus depth with its inputs)
 *   GET /wire           last 50 public events, humanized
 *   GET /events         sse: public events as they append (capped)
 *   GET /events?after=  backfill from a cursor, then live
 *   GET /recent?after=  raw public events for polling clients
 *   GET /recap?since=   "while you were away", llm optional
 *   GET /graveyard      every dead identity's card data
 *
 * degradation is designed, not accidental: sse connections are capped
 * (WALL_SSE_MAX) and an at-capacity request gets a 503 telling the client
 * to poll /recent, so a traffic spike costs latency instead of the
 * showrunner. /recent is a cheap cursor read a cdn can absorb.
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
  /** extra live facts for /health (agents live, thinker, stream provider) */
  health?: () => Record<string, unknown>;
  /** streaming phase one: generic hls playback url per agent, provider
   * details never cross this boundary */
  streamUrl?: (agentId: string) => string | null;
  /** concurrent sse connections before new ones get 503 + poll advice;
   * default 200, env WALL_SSE_MAX in serve */
  maxSseConnections?: number;
}

/** the raw request handler, composable behind a shared port. returns true
 * when the request was one of ours, false to let the caller route on. */
export function createWallApiHandler(
  opts: WallApiOptions
): (req: IncomingMessage, res: ServerResponse) => boolean {
  const { store } = opts;
  const startedAt = Date.now();
  const maxSse = opts.maxSseConnections ?? 200;
  let sseOpen = 0;
  return (req, res) => {
    const url = new URL(req.url ?? "/", "http://wall.local");
    if (!WALL_ROUTES.has(url.pathname)) return false;
    res.setHeader("access-control-allow-origin", opts.corsOrigin ?? "*");
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "read-only" });
      return true;
    }

    if (url.pathname === "/health") {
      const last = store.list({ publicOnly: true, newestFirst: true, limit: 1 })[0];
      const extra = opts.health?.() ?? {};
      // a wall that failed to boot, or came up empty, is not healthy: it
      // answers 503 so the platform's healthcheck restarts it instead of
      // parking a silent empty wall behind a green check
      const ok = extra.ok !== false;
      sendJson(res, ok ? 200 : 503, {
        ok,
        uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
        last_public_event_ts: last?.ts ?? null,
        ...extra,
      });
      return true;
    }

    if (url.pathname === "/now") {
      const pub = store.list({ publicOnly: true });
      const agents = agentNow(pub, { names: opts.names() });
      // the plate-border figures, counted from the same list the snapshot
      // is folded from: the chips can never disagree with the cells
      const stats = wallStats(pub);
      const enriched = agents.map((agent) => {
        const inputs = opts.depthInputs?.(agent.agent_id) ?? null;
        const stream = opts.streamUrl?.(agent.agent_id) ?? null;
        const own = stats.by_agent[agent.agent_id];
        return {
          ...agent,
          ...(inputs ? { depth: depthScore(inputs), depth_inputs: inputs } : {}),
          stream_url: stream,
          pages_read: own?.pages_read ?? 0,
          thoughts_today: own?.thoughts_today ?? 0,
        };
      });
      sendJson(res, 200, {
        agents: enriched,
        alive: enriched.filter((a) => a.state !== "dead" && a.state !== "unborn").length,
        stats: {
          destroyed: stats.destroyed,
          pages_read: stats.pages_read,
          thoughts: stats.thoughts,
        },
      });
      return true;
    }

    if (url.pathname === "/wire") {
      const events = store.list({ publicOnly: true, newestFirst: true, limit: 50 }).reverse();
      sendJson(res, 200, { lines: tickerLines(events, { limit: 50, names: opts.names() }) });
      return true;
    }

    if (url.pathname === "/recent") {
      const after = url.searchParams.get("after");
      const events = store.list({
        publicOnly: true,
        ...(after ? { afterId: after } : {}),
        limit: 120,
      });
      const latest =
        events[events.length - 1]?.id ??
        after ??
        store.list({ publicOnly: true, newestFirst: true, limit: 1 })[0]?.id ??
        null;
      sendJson(res, 200, { events, latest_id: latest });
      return true;
    }

    if (url.pathname === "/events") {
      if (sseOpen >= maxSse) {
        res.writeHead(503, {
          "content-type": "application/json; charset=utf-8",
          "retry-after": "30",
          "access-control-allow-origin": opts.corsOrigin ?? "*",
        });
        res.end(JSON.stringify({ error: "sse at capacity; poll /recent" }));
        return true;
      }
      sseOpen += 1;
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": opts.corsOrigin ?? "*",
      });
      // flush headers immediately even with an empty backfill, so clients
      // (and proxies) see the stream open without waiting for an event
      res.write(": connected\n\n");
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
        sseOpen -= 1;
        clearInterval(keepalive);
        unsubscribe();
      });
      return true;
    }

    if (url.pathname === "/recap") {
      const since =
        url.searchParams.get("since") ?? new Date(Date.now() - 6 * 3600_000).toISOString();
      const events = store.list({ publicOnly: true, since });
      void recap(events, { names: opts.names(), summarizer: opts.summarizer }).then((text) =>
        sendJson(res, 200, { since, text })
      );
      return true;
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
      sendJson(res, 200, { dead });
      return true;
    }

    sendJson(res, 404, { error: "not found" });
    return true;
  };
}

const WALL_ROUTES = new Set([
  "/health",
  "/now",
  "/wire",
  "/events",
  "/recent",
  "/recap",
  "/graveyard",
]);

export function createWallApi(opts: WallApiOptions): Server {
  const handler = createWallApiHandler(opts);
  return createServer((req, res) => {
    if (!handler(req, res)) sendJson(res, 404, { error: "not found" });
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
