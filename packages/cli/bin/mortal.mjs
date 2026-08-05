#!/usr/bin/env node
// committed entry shim: exists at install time so pnpm links the `mortal`
// bin on a clean clone, before dist/ is built. per the workspace-build rule
// it never assumes dist exists — a missing build gets an honest message,
// not ERR_MODULE_NOT_FOUND.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/cli.js");
if (!fs.existsSync(cli)) {
  process.stderr.write(
    "mortal: not built yet — run `pnpm build` from the repo root (turbo builds @mortal/schema first), then retry.\n"
  );
  process.exit(1);
}
await import(cli);
