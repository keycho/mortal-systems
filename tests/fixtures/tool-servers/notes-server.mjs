#!/usr/bin/env node
/**
 * a real mcp server over stdio, used by the G20 tool-scoping suite.
 *
 * both of its tools genuinely work and have observable side effects on disk,
 * so a refusal in the suite is provably mortal's refusal and not a broken
 * fixture: the same call, made by an identity that IS scoped to it, changes
 * the file.
 *
 * NOTES_FILE selects the file it operates on.
 */
import fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const FILE = process.env.NOTES_FILE;
if (!FILE) throw new Error("NOTES_FILE is required");

const server = new McpServer({ name: "notes", version: "1.0.0" });

server.registerTool(
  "read_note",
  { description: "read the note", inputSchema: {} },
  async () => ({
    content: [{ type: "text", text: fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : "" }],
  })
);

server.registerTool(
  "write_note",
  { description: "overwrite the note", inputSchema: { text: z.string() } },
  async ({ text }) => {
    fs.writeFileSync(FILE, text);
    return { content: [{ type: "text", text: `wrote ${text.length} chars` }] };
  }
);

await server.connect(new StdioServerTransport());
