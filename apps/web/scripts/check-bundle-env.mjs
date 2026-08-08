import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * the proof, taken from the artifact rather than from the config that
 * was supposed to produce it. next.config asserts the variable exists;
 * this reads the javascript that will actually be served and answers two
 * questions no amount of configuration can answer for it: does the
 * bundle still dial a loopback address, and did the url we set actually
 * get inlined?
 *
 * this exists because the failure it catches was invisible from every
 * other angle. the variable was set in vercel, the source read it
 * correctly, and three builds still shipped http://127.0.0.1:4925,
 * because the value never reached next and next quietly compiled the
 * reference into a runtime lookup on an env object browsers do not have.
 * only the bundle knew.
 */

const OUT = new URL("../out", import.meta.url).pathname;
const LOOPBACK = /https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]):\d+/g;

function jsFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...jsFiles(path));
    else if (entry.endsWith(".js")) found.push(path);
  }
  return found;
}

const files = jsFiles(OUT);
if (files.length === 0) {
  console.error(`bundle env gate: no javascript under ${OUT}; was the site built?`);
  process.exit(1);
}

const offenders = [];
for (const file of files) {
  const matches = readFileSync(file, "utf8").match(LOOPBACK);
  if (matches) offenders.push({ file: file.slice(OUT.length + 1), urls: [...new Set(matches)] });
}

if (offenders.length > 0) {
  console.error("");
  console.error("======== the built site dials a loopback address ========");
  for (const { file, urls } of offenders) console.error(`  ${file}: ${urls.join(", ")}`);
  console.error("");
  console.error("a viewer's browser would ask their own machine for the wall's");
  console.error("data. the usual cause is NEXT_PUBLIC_WALL_API_URL not reaching");
  console.error("next at build time, leaving a development fallback compiled in.");
  console.error("=========================================================");
  console.error("");
  process.exit(1);
}

// the positive half: when a url was supplied, prove it survived into the
// bundle. a passing negative check means little if nothing was inlined.
const wanted = process.env.NEXT_PUBLIC_WALL_API_URL;
if (wanted) {
  const origin = new URL(wanted).origin;
  const present = files.some((file) => readFileSync(file, "utf8").includes(origin));
  if (!present) {
    console.error("");
    console.error(`======== ${origin} never reached the bundle ========`);
    console.error("the variable was set for this build but does not appear in any");
    console.error("emitted javascript, so next did not inline it. check that the");
    console.error("reference in lib/wall-client.ts is still the literal expression");
    console.error("process.env.NEXT_PUBLIC_WALL_API_URL, and that turbo.json's build");
    console.error("task still declares NEXT_PUBLIC_* in its env list.");
    console.error("=====================================================");
    console.error("");
    process.exit(1);
  }
  console.log(`bundle env gate: OK — ${files.length} files, ${origin} inlined, no loopback urls`);
} else {
  console.log(`bundle env gate: OK — ${files.length} files, no loopback urls (no api url set for this build)`);
}
