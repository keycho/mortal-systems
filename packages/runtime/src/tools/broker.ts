import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { BrokeredTool, ToolCallResult, ToolServerSummary } from "@mortal/schema";
import { errors } from "../errors.js";
import { log } from "../util/log.js";
import { RUNTIME_VERSION } from "../version.js";
import { decideToolAccess, scopeAllowsServer } from "./scope.js";
import { readToolRegistry, type ToolServerConfig } from "./registry.js";
import type { MortalRuntime } from "../runtime.js";

/**
 * the mcp boundary.
 *
 * every brokered tool call an identity makes passes through callTool() below,
 * and callTool() consults that identity's own manifest before it touches an
 * upstream server. the check lives HERE, in the runtime, rather than in the
 * mcp package, because the runtime is the manifest authority: an agent that
 * skips @mortal/mcp and speaks the loopback rpc directly hits exactly the same
 * refusal.
 *
 * what this does not cover, and what mortal therefore does not claim: a
 * connection an agent opens for itself. mortal scopes the calls it brokers
 * (see NON_GUARANTEES).
 */

interface Connection {
  client: Client;
  error: string | null;
}

export class ToolBroker {
  private readonly runtime: MortalRuntime;
  private readonly servers: Map<string, ToolServerConfig>;
  private readonly connections = new Map<string, Promise<Connection>>();

  constructor(runtime: MortalRuntime) {
    this.runtime = runtime;
    this.servers = new Map(readToolRegistry(runtime.root).map((s) => [s.name, s]));
    if (this.servers.size > 0) {
      log.info(`tool broker: ${this.servers.size} registered server(s)`, {
        servers: [...this.servers.keys()],
      });
    }
  }

  /** the operator's registry, unfiltered. not an identity-facing view. */
  listServers(): ToolServerSummary[] {
    return [...this.servers.values()].map((s) => ({
      name: s.name,
      transport: "stdio" as const,
      command: s.command,
      connected: this.connections.has(s.name),
      error: null,
    }));
  }

  /** the tools this identity may reach — the registry filtered by its scope */
  async listTools(identityId: string): Promise<BrokeredTool[]> {
    const manifest = this.manifestFor(identityId);
    const out: BrokeredTool[] = [];
    for (const name of this.servers.keys()) {
      if (!scopeAllowsServer(manifest, name)) continue;
      let tools;
      try {
        const conn = await this.connect(name);
        ({ tools } = await conn.client.listTools());
      } catch (err) {
        log.warn(`tool broker: listing "${name}" failed: ${String(err)}`);
        continue;
      }
      for (const tool of tools) {
        // filter tool-by-tool too: a server in scope does not put every one of
        // its tools in scope
        if (!decideToolAccess(manifest, name, tool.name).allowed) continue;
        out.push({
          server: name,
          name: tool.name,
          description: tool.description ?? null,
          inputSchema: (tool.inputSchema as Record<string, unknown> | undefined) ?? null,
        });
      }
    }
    return out;
  }

  /**
   * broker one call. order matters and is the guarantee: identity is resolved,
   * its manifest decides, and only then does anything upstream happen.
   */
  async callTool(
    identityId: string,
    server: string,
    tool: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult> {
    const manifest = this.manifestFor(identityId);
    const decision = decideToolAccess(manifest, server, tool);
    if (!decision.allowed) {
      // journal the refusal before throwing: a refusal nobody can see is not
      // evidence of anything
      this.runtime.repo.appendActivity(
        identityId,
        "tool_refused",
        { server, tool, reason: decision.reason },
        new Date().toISOString()
      );
      throw errors.forbidden(`tool call refused: ${decision.reason}`);
    }
    if (!this.servers.has(server)) {
      throw errors.notFound("tool server", server);
    }

    const conn = await this.connect(server);
    const result = await conn.client.callTool({ name: tool, arguments: args });
    this.runtime.repo.appendActivity(
      identityId,
      "tool_called",
      { server, tool, scope: manifest.permissions.tools.value },
      new Date().toISOString()
    );
    return {
      server,
      tool,
      content: result.content ?? null,
      isError: result.isError === true,
    };
  }

  async stop(): Promise<void> {
    for (const [name, pending] of this.connections) {
      try {
        const conn = await pending;
        await conn.client.close();
      } catch (err) {
        log.warn(`tool broker: closing "${name}" failed: ${String(err)}`);
      }
    }
    this.connections.clear();
  }

  /**
   * the identity's manifest, or a refusal. a destroyed identity has no
   * manifest and therefore no scope — it brokers nothing.
   */
  private manifestFor(identityId: string) {
    const { summary, manifest } = this.runtime.identities.get(identityId);
    if (manifest === null) {
      throw errors.invalidState(
        `identity "${identityId}" is ${summary.state} — destroyed identities broker no tools`
      );
    }
    return manifest;
  }

  /** lazily spawn + handshake one upstream server; connections are shared */
  private connect(name: string): Promise<Connection> {
    const existing = this.connections.get(name);
    if (existing !== undefined) return existing;
    const config = this.servers.get(name);
    if (config === undefined) throw errors.notFound("tool server", name);

    const pending = (async (): Promise<Connection> => {
      const client = new Client({ name: "mortal-runtime", version: RUNTIME_VERSION });
      await client.connect(
        new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: { ...(process.env as Record<string, string>), ...config.env },
        })
      );
      return { client, error: null };
    })();
    // a failed handshake must not be cached as a live connection
    pending.catch(() => this.connections.delete(name));
    this.connections.set(name, pending);
    return pending;
  }
}
