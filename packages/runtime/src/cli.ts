#!/usr/bin/env node
// side-effect import: wires the chromium launcher into runtime startup
import "./launcher/register.js";
import { LiminalRuntime } from "./runtime.js";
import { log } from "./util/log.js";
import { RUNTIME_VERSION } from "./version.js";

function parseFlags(argv: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags.set(arg.slice(2), next);
          i++;
        } else {
          flags.set(arg.slice(2), "true");
        }
      }
    }
  }
  return flags;
}

async function serve(argv: string[]): Promise<void> {
  const flags = parseFlags(argv);
  const runtime = await LiminalRuntime.start({
    root: flags.get("root") ?? process.env.LIMINAL_ROOT,
    port: flags.has("port") ? Number(flags.get("port")) : 0,
    adminToken: flags.get("admin-token") ?? process.env.LIMINAL_ADMIN_TOKEN,
  });

  const shutdown = async (signal: string) => {
    log.info(`received ${signal}, shutting down`);
    try {
      await runtime.stop();
      process.exit(0);
    } catch (err) {
      log.error("shutdown failed", { message: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  log.info(`liminal runtime ${RUNTIME_VERSION} ready`, {
    root: runtime.root,
    port: runtime.port,
  });
}

const [, , command, ...rest] = process.argv;

switch (command) {
  case "serve":
    void serve(rest);
    break;
  case "version":
    process.stdout.write(`${RUNTIME_VERSION}\n`);
    break;
  default:
    process.stderr.write(
      `usage: liminal-runtime <command>\n\n` +
        `commands:\n` +
        `  serve   start the runtime service\n` +
        `          --root <dir>          runtime root (default ~/.liminal or $LIMINAL_ROOT)\n` +
        `          --port <n>            api port (default: random loopback port)\n` +
        `          --admin-token <t>     admin bearer token (default: generated, written to <root>/admin.token)\n` +
        `  version print the runtime version\n`
    );
    process.exit(command === undefined || command === "help" ? 0 : 1);
}
