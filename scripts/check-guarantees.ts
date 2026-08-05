/**
 * ci gate: every schema field whose enforcement is "enforced" must map to at
 * least one test id in tests/guarantees.map.ts, and every advisory/roadmap
 * field must map to at least one badge-render test. an unmapped enforced
 * field fails the build — an untested "enforced" label is not allowed to
 * exist.
 *
 * run via: pnpm check:guarantees (tsx)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADVISORY_FIELDS,
  BRANDED_CHROME_COMPANION_CAVEAT,
  ENFORCED_FIELDS,
  ROADMAP_FIELDS,
} from "../packages/schema/src/enforcement.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const mapPath = path.resolve(here, "../tests/guarantees.map.ts");

if (!fs.existsSync(mapPath)) {
  console.error(
    "guarantees gate: FAIL\n" +
      "tests/guarantees.map.ts does not exist yet (day-6 scope of the poc build).\n" +
      `until it maps every enforced field to a passing test, the gate fails by design.\n` +
      `currently unmapped enforced fields (${ENFORCED_FIELDS.length}): ${ENFORCED_FIELDS.join(", ")}`
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const { GUARANTEES_MAP, BADGE_TESTS } = (await import(mapPath)) as {
    GUARANTEES_MAP: Record<string, string[]>;
    BADGE_TESTS: Record<string, string[]>;
  };

  let failed = false;

  for (const field of ENFORCED_FIELDS) {
    const tests = GUARANTEES_MAP[field];
    if (!tests || tests.length === 0) {
      console.error(`guarantees gate: enforced field "${field}" is not mapped to any test`);
      failed = true;
    }
  }

  for (const field of [...ADVISORY_FIELDS, ...ROADMAP_FIELDS]) {
    const tests = BADGE_TESTS[field];
    if (!tests || tests.length === 0) {
      console.error(
        `guarantees gate: ${field} has no badge-render test (labels must not silently drift)`
      );
      failed = true;
    }
  }

  for (const field of Object.keys(GUARANTEES_MAP)) {
    if (!ENFORCED_FIELDS.includes(field)) {
      console.error(`guarantees gate: "${field}" is mapped as enforced but the schema does not list it`);
      failed = true;
    }
  }

  // every mapped test id must actually appear in a test file — a map entry
  // pointing at a test that does not exist is a fake guarantee
  const testDirs = [
    path.resolve(here, "../tests"),
    path.resolve(here, "../packages/runtime/test"),
    path.resolve(here, "../packages/schema/test"),
    path.resolve(here, "../apps/manager/test"),
    path.resolve(here, "../apps/companion/test"),
  ];
  const corpus: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules") walk(full);
      else if (/\.(test\.tsx?|spec\.tsx?)$/.test(entry.name)) corpus.push(fs.readFileSync(full, "utf8"));
    }
  };
  for (const dir of testDirs) walk(dir);
  const haystack = corpus.join("\n");
  const allIds = new Set([...Object.values(GUARANTEES_MAP), ...Object.values(BADGE_TESTS)].flat());
  for (const id of allIds) {
    if (!haystack.includes(id)) {
      console.error(`guarantees gate: test id "${id}" is mapped but appears in no test file`);
      failed = true;
    }
  }

  // ---- wording sync: the branded-chrome companion claim (r3) ----
  // code surfaces render BRANDED_CHROME_COMPANION_CAVEAT directly; the docs
  // that repeat the claim must carry the canonical sentence verbatim
  // (whitespace-insensitive, so markdown wrapping is fine), and the old
  // hedged claim must not reappear in any live file. dated logs
  // (DECISIONS/PROGRESS/manual-checks) keep their history and are exempt.
  const normalize = (s: string) => s.replace(/\s+/g, " ");
  const repoRoot = path.resolve(here, "..");
  for (const rel of ["packages/cli/README.md", "docs/threat-model.md"]) {
    const content = fs.readFileSync(path.join(repoRoot, rel), "utf8");
    if (!normalize(content).includes(normalize(BRANDED_CHROME_COMPANION_CAVEAT))) {
      console.error(
        `guarantees gate: ${rel} does not carry the canonical branded-chrome caveat verbatim (BRANDED_CHROME_COMPANION_CAVEAT in @mortal/schema)`
      );
      failed = true;
    }
  }
  const bannedClaim = new RegExp(
    ["(may|can|might) ignore ", "`?--load-extension`?"].join("") + "|companion may not load"
  );
  const historyExempt = new Set([
    "docs/DECISIONS.md",
    "docs/PROGRESS.md",
    "docs/manual-checks.md",
    "scripts/check-guarantees.ts",
  ]);
  const liveExts = new Set([".ts", ".tsx", ".md", ".mjs", ".yml", ".yaml"]);
  const prune = new Set(["node_modules", "dist", ".git", ".turbo", ".next", "target", "test-results"]);
  const scan = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!prune.has(entry.name)) scan(full);
        continue;
      }
      if (!liveExts.has(path.extname(entry.name))) continue;
      const rel = path.relative(repoRoot, full);
      if (historyExempt.has(rel)) continue;
      if (bannedClaim.test(fs.readFileSync(full, "utf8"))) {
        console.error(
          `guarantees gate: ${rel} still hedges the branded-chrome claim ("may ignore --load-extension") — render BRANDED_CHROME_COMPANION_CAVEAT instead`
        );
        failed = true;
      }
    }
  };
  scan(repoRoot);

  if (failed) process.exit(1);
  console.log(
    `guarantees gate: OK — ${ENFORCED_FIELDS.length} enforced fields mapped, ` +
      `${ADVISORY_FIELDS.length + ROADMAP_FIELDS.length} advisory/roadmap fields badge-tested, ` +
      `branded-chrome claim synced from schema`
  );
}

void main();
