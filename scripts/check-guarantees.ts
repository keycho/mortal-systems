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
import { ADVISORY_FIELDS, ENFORCED_FIELDS, ROADMAP_FIELDS } from "../packages/schema/src/enforcement.js";

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

  if (failed) process.exit(1);
  console.log(
    `guarantees gate: OK — ${ENFORCED_FIELDS.length} enforced fields mapped, ` +
      `${ADVISORY_FIELDS.length + ROADMAP_FIELDS.length} advisory/roadmap fields badge-tested`
  );
}

void main();
