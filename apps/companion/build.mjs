import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * builds the companion template into dist/. the runtime stamps per-identity
 * copies of dist/ into <root>/companion-instances/<id>/ and adds
 * mortal.identity.json (which is intentionally NOT part of the template).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

await build({
  entryPoints: {
    background: path.join(here, "src/background/index.ts"),
    sidepanel: path.join(here, "src/sidepanel/index.ts"),
    content: path.join(here, "src/content/badge.ts"),
  },
  outdir: dist,
  bundle: true,
  format: "esm",
  target: "chrome120",
  legalComments: "none",
  logLevel: "warning",
});

for (const file of ["sidepanel.html", "sidepanel.css"]) {
  fs.copyFileSync(path.join(here, file), path.join(dist, file));
}
fs.copyFileSync(path.join(here, "manifest.template.json"), path.join(dist, "manifest.json"));

console.log("companion template built into dist/");
