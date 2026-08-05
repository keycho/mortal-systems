#!/usr/bin/env node
/**
 * mortal-mcp — the mortal mcp server over stdio.
 *
 * usage: mortal-mcp [--root <runtime root>]
 * discovery: --root / $MORTAL_ROOT / ~/.mortal (reads runtime.json +
 * admin.token written by the runtime at startup), or $MORTAL_PORT +
 * $MORTAL_ADMIN_TOKEN explicitly.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MortalClient } from "./client.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const root = rootIdx !== -1 ? args[rootIdx + 1] : undefined;

  let client: MortalClient;
  try {
    client = new MortalClient(root !== undefined ? { root } : {});
  } catch (e) {
    console.error(
      `mortal-mcp: could not discover the runtime (${e instanceof Error ? e.message : String(e)}).\n` +
        `start it first (pnpm dev:runtime, or mortal-runtime serve) or pass --root / MORTAL_PORT + MORTAL_ADMIN_TOKEN.`
    );
    process.exit(1);
  }

  const server = buildServer(client);
  await server.connect(new StdioServerTransport());
}

void main();
