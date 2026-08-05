import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { toolNameSchema } from "@mortal/schema";
import { log } from "../util/log.js";

/**
 * the operator's registry of upstream mcp servers, read from
 * <root>/tool-servers.json at startup.
 *
 * deliberately NOT an api: there is no rpc method, and no agent-facing tool,
 * that registers a server. an agent able to add a server could name it into
 * its own scope and broker anything — so registration lives with the operator,
 * on disk, outside every agent surface.
 */

export const TOOL_REGISTRY_FILE = "tool-servers.json";

export const toolServerConfigSchema = z
  .object({
    name: toolNameSchema,
    /** stdio only in v1 — one process the runtime spawns and speaks mcp to */
    command: z.string().min(1),
    args: z.array(z.string()).max(64).default([]),
    env: z.record(z.string()).default({}),
  })
  .strict();

export const toolRegistrySchema = z
  .object({ servers: z.array(toolServerConfigSchema).max(64).default([]) })
  .strict();

export type ToolServerConfig = z.infer<typeof toolServerConfigSchema>;

/**
 * read and validate the registry. a malformed file is a loud no-op: the
 * runtime starts with no brokered servers rather than with a half-parsed
 * allowlist that nobody can reason about.
 */
export function readToolRegistry(root: string): ToolServerConfig[] {
  const file = path.join(root, TOOL_REGISTRY_FILE);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = toolRegistrySchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
    const seen = new Set<string>();
    for (const server of parsed.servers) {
      if (seen.has(server.name)) {
        log.warn(`${TOOL_REGISTRY_FILE}: duplicate server "${server.name}" — brokering none`);
        return [];
      }
      seen.add(server.name);
    }
    return parsed.servers;
  } catch (err) {
    log.warn(
      `${TOOL_REGISTRY_FILE} is invalid — no tool servers registered: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return [];
  }
}
