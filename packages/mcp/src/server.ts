import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MCP_TRUST_BOUNDARY, MortalClient, MortalRpcError } from "./client.js";

/**
 * the mortal mcp server: identity primitives for any mcp agent.
 *
 * v1 tool surface — exactly these eight, deliberately:
 *   identity_create · identity_launch · identity_status · identity_destroy ·
 *   identity_tools · identity_call_tool · blueprint_list · capabilities
 *
 * hard safety properties (the product, not the packaging):
 * - an agent can only attach to identities mortal launched. no tool
 *   enumerates or reaches the operator's normal browser — such an api does
 *   not exist anywhere in the runtime.
 * - no tool extends an identity's lifetime. expiry is the runtime
 *   scheduler's job; changing it requires the human manager.
 * - every permission in every result carries its enforcement level
 *   (enforced / advisory / roadmap) so agent code can feature-detect and
 *   never trust an unenforced control.
 * - destruction is scoped and journaled: destroying one identity provably
 *   never touches another (guarantees G12/G13 in the isolation suite).
 * - a tool call goes through the runtime, which checks the identity's own
 *   declared scope before touching any upstream server (G20). nothing here
 *   registers a server: an agent that could add one could name it into its
 *   own scope.
 */

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/**
 * refusals are typed, not prose: a runtime error keeps its code (NOT_FOUND,
 * INVALID_STATE, FORBIDDEN, ...) so agent code can branch on the refusal
 * instead of parsing a message. anything else is UNEXPECTED.
 */
function err(e: unknown) {
  const code = e instanceof MortalRpcError ? e.code : "UNEXPECTED";
  const message = e instanceof Error ? e.message : String(e);
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: { code, message } }) }],
  };
}

export function buildServer(client: MortalClient): McpServer {
  const server = new McpServer({ name: "mortal", version: "0.1.0" });

  server.registerTool(
    "identity_create",
    {
      description:
        "create a scoped, disposable identity — its own browser profile, files, memory and permissions with a finite lifetime. pass blueprintId (see blueprint_list) or a name for a hand-made identity. lifetime is '30m' / '12h' / '7d' style or 'persistent'. pass networkRoute to bind this identity's browser to its own route (proxy like http://host:port or socks5://host:port): with a route the identity's network permission is enforced — every non-local request goes through it with no direct fallback; without one it shares the machine's ip and path (advisory). mortal enforces the route you attach; it does not provide routing — bring your own proxy. pass toolScope to declare which brokered mcp servers/tools this identity may reach ({servers:[{server,tools}]}; tools null means every tool that server exposes): with a scope the runtime refuses every call outside it, without one the identity may reach whatever the operator registered (advisory). returns the identity with every permission's enforcement level; never trust a control that is not 'enforced'.",
      inputSchema: {
        blueprintId: z.string().optional(),
        name: z.string().optional(),
        lifetime: z.string().optional(),
        networkRoute: z
          .object({ proxy: z.string(), label: z.string().nullable().optional() })
          .optional(),
        toolScope: z
          .object({
            servers: z.array(
              z.object({ server: z.string(), tools: z.array(z.string()).nullable() })
            ),
          })
          .optional(),
      },
    },
    async ({ blueprintId, name, lifetime, networkRoute, toolScope }) => {
      try {
        return json(
          await client.createIdentity({
            blueprintId,
            name,
            lifetime,
            ...(networkRoute !== undefined
              ? { networkRoute: { proxy: networkRoute.proxy, label: networkRoute.label ?? null } }
              : {}),
            ...(toolScope !== undefined ? { toolScope } : {}),
          })
        );
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "identity_launch",
    {
      description:
        "launch the identity's own chromium and return a cdp endpoint scoped to that one identity's browser — never the operator's. only identities mortal created can be launched; there is no way to attach to anything else.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      try {
        return json(await client.launch(id));
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "identity_status",
    {
      description:
        "state, remaining lifetime (ms), and the full manifest with enforcement levels for one identity.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      try {
        return json(await client.status(id));
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "identity_destroy",
    {
      description:
        "run the journaled destruction contract on this identity (browser halted, profile and files removed, local memory erased, tombstone kept) and return the receipt. scoped: destroying one identity never touches another.",
      inputSchema: { id: z.string(), reason: z.string().optional() },
    },
    async ({ id, reason }) => {
      try {
        return json(await client.destroy(id, reason));
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "identity_tools",
    {
      description:
        "list the brokered tools this identity may reach — already filtered by its declared scope. an identity with a scope sees only what it is allowed to call; an identity with no scope sees everything the operator registered, and its manifest says 'open / advisory' so you know that is not a control.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      try {
        return json(await client.listTools(id));
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "identity_call_tool",
    {
      description:
        "call a brokered tool as this identity. the runtime checks the identity's manifest scope before touching the upstream server, so a call outside the scope is refused (FORBIDDEN) and journaled on the identity — the tool being live and reachable makes no difference. mortal scopes the calls it brokers; a connection you opened yourself is outside that boundary.",
      inputSchema: {
        id: z.string(),
        server: z.string(),
        tool: z.string(),
        arguments: z.record(z.unknown()).optional(),
      },
    },
    async ({ id, server: upstream, tool, arguments: args }) => {
      try {
        return json(await client.callTool(id, upstream, tool, args ?? {}));
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "blueprint_list",
    {
      description: "list the installed blueprints — reviewed starting points for scoped identities.",
      inputSchema: {},
    },
    async () => {
      try {
        return json(await client.listBlueprints());
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "capabilities",
    {
      description:
        "what is enforceable vs advisory vs roadmap right now, the full enforcement table with the tests behind each enforced control, mortal's explicit non-guarantees, and `conditional`: fields that are enforced only for identities configured for them (today permissions.network, enforced only with an attached route, and permissions.tools, enforced only with a declared scope). feature-detect against this, then read the identity's own manifest.permissions.<field>.enforcement — the identity is always authoritative. " +
        `trust boundary: ${MCP_TRUST_BOUNDARY}`,
      inputSchema: {},
    },
    async () => {
      try {
        return json(await client.capabilities());
      } catch (e) {
        return err(e);
      }
    }
  );

  return server;
}
