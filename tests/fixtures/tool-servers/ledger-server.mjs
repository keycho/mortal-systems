#!/usr/bin/env node
/**
 * the second real mcp server in the G20 suite: registered with the runtime,
 * live, and genuinely useful — and NOT in the scoped identity's scope.
 *
 * the point of standing this up for real is that the suite can prove the
 * refusal is a refusal: the very same append_entry call, made by an identity
 * whose scope permits it, appends to the file on disk.
 *
 * LEDGER_FILE selects the file it appends to.
 */
import fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const FILE = process.env.LEDGER_FILE;
if (!FILE) throw new Error("LEDGER_FILE is required");

const server = new McpServer({ name: "ledger", version: "1.0.0" });

server.registerTool(
  "append_entry",
  { description: "append one line to the ledger", inputSchema: { entry: z.string() } },
  async ({ entry }) => {
    fs.appendFileSync(FILE, `${entry}\n`);
    return { content: [{ type: "text", text: `appended: ${entry}` }] };
  }
);

await server.connect(new StdioServerTransport());
