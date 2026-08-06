// regenerates public/og.png from the built /og-card route (the x share
// graphic). run manually after a visual change, then rebuild so the
// export picks the file up:
//   pnpm --filter web build && node apps/web/scripts/generate-og.mjs && pnpm --filter web build
// requires the repo's playwright chromium (PLAYWRIGHT_BROWSERS_PATH or
// MORTAL_BROWSER_PATH); the capture is 1200x675 at 2x for crisp text.
import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(webRoot, "out");

const TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let file = path.join(outDir, decodeURIComponent(url.pathname));
    const s = await stat(file).catch(() => null);
    if (s?.isDirectory()) file = path.join(file, "index.html");
    else if (!s && !path.extname(file)) file = `${file}.html`;
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

const executablePath = process.env.MORTAL_BROWSER_PATH || undefined;
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1240, height: 720 }, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:${port}/og-card`, { waitUntil: "networkidle" });
// string form: the expression runs in the page, so eslint's node globals don't apply
await page.evaluate("document.fonts.ready");
const shot = await page.locator("#og-card").screenshot({ type: "png" });
await browser.close();
server.close();

const target = path.join(webRoot, "public", "og.png");
await writeFile(target, shot);
console.log(`og card captured: ${target} (${shot.length} bytes, 2400x1350 for 1200x675)`);
