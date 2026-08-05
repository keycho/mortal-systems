import http from "node:http";
import { AddressInfo } from "node:net";
import os from "node:os";

/**
 * a minimal recording forward proxy for the network-route guarantee (G19).
 * chromium launched with --proxy-server=http://127.0.0.1:<port> sends every
 * non-loopback request here as an absolute-form GET; we record the target url
 * and forward it. the recorded log is the proof that a routed identity's
 * traffic actually transited its route.
 */
export interface RecordingProxy {
  /** e.g. "http://127.0.0.1:54321" — feed to a network route's proxy field */
  url: string;
  /** every absolute url this proxy was asked to fetch, in order */
  seen: string[];
  close(): Promise<void>;
}

export async function startRecordingProxy(): Promise<RecordingProxy> {
  const seen: string[] = [];
  const server = http.createServer((req, res) => {
    const target = req.url ?? "";
    // absolute-form request-target is how a forward proxy receives http gets
    if (!/^https?:\/\//.test(target)) {
      res.writeHead(400).end("proxy expects absolute-form targets");
      return;
    }
    seen.push(target);
    const upstream = http.request(target, { method: req.method, headers: req.headers }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end("proxy upstream error");
    });
    req.pipe(upstream);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/**
 * a plain http origin the routed browser fetches THROUGH the proxy. it binds to
 * a non-loopback interface so chromium does not bypass the proxy for it
 * (chromium routes loopback direct by default — which is exactly why the
 * companion ↔ runtime channel is never proxied).
 */
export interface TargetSite {
  /** e.g. "http://192.0.2.2:12345/filing" */
  url: string;
  host: string;
  close(): Promise<void>;
}

function nonLoopbackHost(): string | null {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return null;
}

export async function startTargetSite(): Promise<TargetSite | null> {
  const host = nonLoopbackHost();
  if (host === null) return null; // no routable interface — caller skips the positive-transit assertion
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>routed target</title><h1>reached via route</h1>");
  });
  await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://${host}:${port}/filing`,
    host,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
