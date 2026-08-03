import http from "node:http";

/**
 * self-hosted login/cache/download fixture so the isolation suite never
 * depends on a third-party site. accounts: alice/alicepw, bob/bobpw.
 */

const ACCOUNTS: Record<string, string> = { alice: "alicepw", bob: "bobpw" };

/** 1x1 transparent png */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

export interface FixtureServer {
  origin: string;
  hits: (key: string) => number;
  close: () => Promise<void>;
}

export function startFixtureServer(): Promise<FixtureServer> {
  const cacheHits = new Map<string, number>();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (status: number, body: string | Buffer, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-length": Buffer.byteLength(body), ...headers });
      res.end(body);
    };

    if (url.pathname === "/") {
      send(
        200,
        `<!doctype html><title>fixture</title><h1>fixture</h1><a id="dl" href="/download.bin" download="evidence.bin">download</a>`,
        { "content-type": "text/html" }
      );
      return;
    }
    if (url.pathname === "/login" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          const { user, pass } = JSON.parse(raw) as { user: string; pass: string };
          if (ACCOUNTS[user] === pass) {
            send(200, JSON.stringify({ ok: true }), {
              "content-type": "application/json",
              "set-cookie": `session=${user}; Path=/; HttpOnly`,
            });
            return;
          }
        } catch {}
        send(401, JSON.stringify({ ok: false }), { "content-type": "application/json" });
      });
      return;
    }
    if (url.pathname === "/me") {
      const cookie = req.headers.cookie ?? "";
      const match = cookie.match(/session=([a-z]+)/);
      send(200, JSON.stringify({ user: match ? match[1] : null }), {
        "content-type": "application/json",
      });
      return;
    }
    if (url.pathname === "/cached.png") {
      const key = url.searchParams.get("k") ?? "default";
      cacheHits.set(key, (cacheHits.get(key) ?? 0) + 1);
      send(200, PNG, {
        "content-type": "image/png",
        "cache-control": "public, max-age=3600, immutable",
      });
      return;
    }
    if (url.pathname === "/sw.js") {
      send(200, `self.addEventListener("install", () => self.skipWaiting());`, {
        "content-type": "application/javascript",
        "cache-control": "no-cache",
      });
      return;
    }
    if (url.pathname === "/download.bin") {
      send(200, Buffer.from("mortal-fixture-download-bytes"), {
        "content-type": "application/octet-stream",
        "content-disposition": 'attachment; filename="evidence.bin"',
      });
      return;
    }
    send(404, "not found");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") return reject(new Error("no port"));
      resolve({
        origin: `http://127.0.0.1:${addr.port}`,
        hits: (key) => cacheHits.get(key) ?? 0,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
            server.closeAllConnections();
          }),
      });
    });
  });
}
