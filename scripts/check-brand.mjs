// brand gate: the built site output must contain none of the banned
// vocabulary (DECISIONS brand rules) and no token/protocol-economy content.
// scans the rendered html of the static export; the honest non-anonymity
// statement is explicitly allowlisted before scanning, because "anonymous"
// is banned as a selling word, not as a disclaimer.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(repo, "apps/web/out");

if (!fs.existsSync(outDir)) {
  console.error(`brand gate: FAIL — ${outDir} missing (build apps/web first)`);
  process.exit(1);
}

const ALLOWLIST = [
  /does not make identities\s+anonymous/gi,
  /not\s+anonymous in version one/gi,
];

const BANNED = [
  /\banonymous\b/i,
  /\banonymity\b/i,
  /untraceable/i,
  /undetectable/i,
  /anti-?detect/i,
  /\bspoof/i,
  /\bevade\b/i,
  /synthetic identit/i,
  /buy identities/i,
  /\bstealth\b/i,
  /\bghost\b/i,
  /\bburner\b/i,
  /\$mortal\b/i,
  /tokenomics/i,
  /\bairdrop\b/i,
  /bonding curve/i,
  /\bticker\b/i,
];

const htmlFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".html")) htmlFiles.push(full);
  }
};
walk(outDir);

let failed = false;
for (const file of htmlFiles) {
  let content = fs.readFileSync(file, "utf8");
  for (const allowed of ALLOWLIST) content = content.replace(allowed, "");
  for (const banned of BANNED) {
    const match = content.match(banned);
    if (match) {
      console.error(`brand gate: "${match[0]}" found in ${path.relative(repo, file)}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log(`brand gate: OK — ${htmlFiles.length} pages clean of banned vocabulary and token content`);
