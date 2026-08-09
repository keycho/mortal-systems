// favicon from the repo's own mark: the heartbeat field (lib/contour.ts,
// seed 61.8) in its dark presentation, warm ground, cream traces graded
// by the envelope, the stray trace in oxide at its natural position.
// rendered per size with strokes thickened (and rows thinned) so the
// field survives a tab. run with: pnpm exec tsx scripts/make-favicon.mts
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { contourMark, MARK_FORM, MARK_SEED } from "../apps/web/lib/contour.js";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(join(repo, "apps/showrunner/package.json"))(
  "playwright-core"
);

/** chromium the way the test suites find it: CHROME_PATH, then the
 * playwright browsers dir; refuse loudly with neither */
function resolveChromium(): string {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root && existsSync(root)) {
    for (const entry of readdirSync(root)) {
      if (/^chromium-\d+$/.test(entry)) {
        const candidate = join(root, entry, "chrome-linux", "chrome");
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  throw new Error("no chromium: set CHROME_PATH or PLAYWRIGHT_BROWSERS_PATH");
}

const GROUND = "#1B1713";
const OXIDE = "#CF5A22";

function markSvg(size: number, sw: number, straySw: number, n: number): string {
  // one mark, tempI drawn in place, the field stretched to fill the
  // disc: the favicon is the mark's circular presentation. small
  // rasters draw fewer rows (the vacant form's move: the same beat,
  // quieter) so a tab shows lines, not mud.
  const form = { ...MARK_FORM, n, tempI: -1, y0: -60, h: 620 };
  const { layers } = contourMark(MARK_SEED, form);
  const strayRow = Math.round((40 / 54) * n);
  const rows = layers
    .map((layer, i) => {
      const t = (i + 1) / form.n;
      const env = Math.sin(Math.PI * Math.pow(t, 0.8));
      // the stray's own row keeps the oxide; everything else is cream
      // graded brighter toward the field's waist, like the source image
      const isStray = i === strayRow;
      const stroke = isStray ? OXIDE : `rgba(232, 205, 165, ${(0.45 + 0.5 * env).toFixed(2)})`;
      const width = isStray ? straySw : sw;
      return `<path d="${layer.d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  // a square window centred on the field (x 10..760, y 60..480 + spikes)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="25 -95 720 720">
<rect x="25" y="-95" width="720" height="720" fill="${GROUND}"/>
<clipPath id="disc"><circle cx="385" cy="250" r="330"/></clipPath>
<g clip-path="url(#disc)">${rows}</g></svg>`;
}

function icoFromPngs(pngs: Array<{ size: number; data: Buffer }>): Buffer {
  // png-embedded ico: 6-byte header, one 16-byte dirent per image, blobs
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const dirents: Buffer[] = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    dirents.push(entry);
  }
  return Buffer.concat([header, ...dirents, ...pngs.map((p) => p.data)]);
}

const browser = await chromium.launch({
  executablePath: resolveChromium(),
  args: ["--no-sandbox"],
});
const renders: Record<number, Buffer> = {};
// stroke widths tuned per raster so 54 rows stay legible: full detail
// large, a warm beating disc small, the oxide line surviving throughout
const PLAN: Array<{ size: number; sw: number; stray: number; n: number }> = [
  { size: 512, sw: 2.4, stray: 3.6, n: 54 },
  { size: 180, sw: 3.4, stray: 5.5, n: 54 },
  { size: 48, sw: 16, stray: 26, n: 22 },
  { size: 32, sw: 24, stray: 40, n: 18 },
  { size: 16, sw: 50, stray: 80, n: 9 },
];
for (const { size, sw, stray, n } of PLAN) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.goto(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markSvg(size, sw, stray, n))}`
  );
  renders[size] = (await page.screenshot({ type: "png" })) as Buffer;
  await page.close();
}
await browser.close();

const APP = join(repo, "apps/web/app");
writeFileSync(`${APP}/icon.png`, renders[512]!);
writeFileSync(`${APP}/apple-icon.png`, renders[180]!);
writeFileSync(
  `${APP}/favicon.ico`,
  icoFromPngs([
    { size: 48, data: renders[48]! },
    { size: 32, data: renders[32]! },
    { size: 16, data: renders[16]! },
  ])
);
console.log("wrote app/icon.png (512), app/apple-icon.png (180), app/favicon.ico (48+32+16)");
