// emit each first-party blueprint as validated json into dist/blueprints/,
// for the manual install-from-file flow and external validators.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blueprintManifestSchema } from "@liminal/schema";
import { FIRST_PARTY_BLUEPRINTS } from "../dist/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "../dist/blueprints");
fs.mkdirSync(outDir, { recursive: true });

for (const blueprint of FIRST_PARTY_BLUEPRINTS) {
  const parsed = blueprintManifestSchema.parse(blueprint); // build fails on invalid content
  const slug = parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  fs.writeFileSync(path.join(outDir, `${slug}.json`), `${JSON.stringify(parsed, null, 2)}\n`);
}
console.log(`emitted ${FIRST_PARTY_BLUEPRINTS.length} blueprint json files to dist/blueprints/`);
