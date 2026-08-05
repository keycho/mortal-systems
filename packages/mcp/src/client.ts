import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  composeManifest,
  ENFORCEMENT_TABLE,
  generateIdentityId,
  NON_GUARANTEES,
  type BlueprintSummary,
  type DestructionReport,
  type IdentityManifest,
  type IdentitySummary,
  type NetworkRoute,
  type RpcContract,
  type RpcMethod,
  type RpcResponse,
  type RuntimeCapabilities,
} from "@mortal/schema";

/**
 * the mortal agent sdk: a typed client over the runtime's loopback rpc.
 *
 * safety properties, by construction:
 * - every endpoint this client can return belongs to an identity the mortal
 *   runtime launched. there is no api here (or in the runtime) that
 *   enumerates or attaches to the operator's normal browser.
 * - lifetime is enforced by the runtime's scheduler, not by the agent; this
 *   client exposes no way to extend an identity's life.
 * - every permission carries its enforcement level so agent code can
 *   feature-detect and never trust an unenforced control.
 */

export interface MortalClientOptions {
  /** runtime root (default: $MORTAL_ROOT or ~/.mortal) — used for discovery */
  root?: string;
  /** explicit endpoint overrides discovery */
  port?: number;
  token?: string;
}

export interface CreateIdentityInput {
  /** create from an installed blueprint… */
  blueprintId?: string;
  /** …or by hand with a name */
  name?: string;
  /** duration grammar ("30m", "12h", "7d") or "persistent" */
  lifetime?: string;
  /**
   * bind this identity's browser to its own network route. when set, the
   * manifest's network permission becomes routed/enforced and the launcher
   * applies it — without it the identity shares the machine's path (advisory).
   */
  networkRoute?: NetworkRoute;
}

export interface IdentityStatus {
  summary: IdentitySummary;
  manifest: IdentityManifest | null;
  /** null when persistent or destroyed */
  remainingMs: number | null;
}

export interface Capabilities extends RuntimeCapabilities {
  /** the full honesty table: every control with its enforcement + tests */
  enforcementTable: Array<{
    field: string;
    label: string;
    value: string;
    enforcement: "enforced" | "advisory" | "roadmap";
    description: string;
    verifiedBy: string[];
    /** set when the ceiling applies only to identities configured for it */
    conditional?: string;
  }>;
  /** what mortal does NOT claim — agents must not assume these */
  nonGuarantees: string[];
}

export class MortalRpcError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "MortalRpcError";
  }
}

function discover(opts: MortalClientOptions): { port: number; token: string } {
  if (opts.port !== undefined && opts.token !== undefined) {
    return { port: opts.port, token: opts.token };
  }
  const envPort = process.env.MORTAL_PORT;
  const envToken = process.env.MORTAL_ADMIN_TOKEN;
  const root = opts.root ?? process.env.MORTAL_ROOT ?? path.join(os.homedir(), ".mortal");
  let port = opts.port ?? (envPort !== undefined ? Number(envPort) : undefined);
  let token = opts.token ?? envToken;
  if (port === undefined) {
    const info = JSON.parse(fs.readFileSync(path.join(root, "runtime.json"), "utf8")) as {
      port: number;
    };
    port = info.port;
  }
  if (token === undefined) {
    const t = JSON.parse(fs.readFileSync(path.join(root, "admin.token"), "utf8")) as {
      token: string;
    };
    token = t.token;
  }
  return { port, token };
}

export class MortalClient {
  private readonly port: number;
  private readonly token: string;

  constructor(opts: MortalClientOptions = {}) {
    const { port, token } = discover(opts);
    this.port = port;
    this.token = token;
  }

  async rpc<M extends RpcMethod>(
    method: M,
    params: RpcContract[M]["params"]
  ): Promise<RpcContract[M]["result"]> {
    const res = await fetch(`http://127.0.0.1:${this.port}/v1/rpc`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ method, params }),
    });
    const body = (await res.json()) as RpcResponse<RpcContract[M]["result"]>;
    if (!body.ok) throw new MortalRpcError(body.error.code, body.error.message);
    return body.result;
  }

  /** create an identity from a blueprint or by hand; returns the manifest with enforcement levels */
  async createIdentity(input: CreateIdentityInput): Promise<IdentityStatus> {
    let summary: IdentitySummary;
    if (input.blueprintId !== undefined) {
      summary = await this.rpc("identity.createFromBlueprint", {
        blueprintId: input.blueprintId,
        overrides: input.lifetime !== undefined ? { lifetime: input.lifetime } : {},
      });
    } else {
      if (input.name === undefined || input.name.trim() === "") {
        throw new MortalRpcError("VALIDATION_FAILED", "name is required without a blueprintId");
      }
      const manifest = composeManifest({
        id: generateIdentityId(),
        name: input.name.trim(),
        createdAt: new Date().toISOString(),
        lifetime: input.lifetime ?? "persistent",
        ...(input.networkRoute !== undefined ? { networkRoute: input.networkRoute } : {}),
      });
      summary = await this.rpc("identity.create", { manifest });
    }
    return this.status(summary.id);
  }

  /**
   * launch the identity's own browser; returns a cdp endpoint scoped to that
   * one identity — never the operator's browser.
   */
  async launch(id: string): Promise<{ pid: number; cdpEndpoint: string | null }> {
    return this.rpc("identity.launch", { id });
  }

  async status(id: string): Promise<IdentityStatus> {
    const { summary, manifest } = await this.rpc("identity.get", { id });
    const remainingMs =
      summary.expiresAt !== null && summary.state !== "destroyed"
        ? Math.max(0, Date.parse(summary.expiresAt) - Date.now())
        : null;
    return { summary, manifest, remainingMs };
  }

  /** run the journaled destruction contract; returns the receipt */
  async destroy(id: string, reason?: string): Promise<DestructionReport> {
    return this.rpc("identity.destroy", reason !== undefined ? { id, reason } : { id });
  }

  async listBlueprints(): Promise<BlueprintSummary[]> {
    return this.rpc("blueprint.list", {});
  }

  /**
   * what is enforceable vs advisory vs roadmap right now. agent code should
   * feature-detect against this and never trust an unenforced control.
   */
  async capabilities(): Promise<Capabilities> {
    const caps = await this.rpc("runtime.capabilities", {});
    return {
      ...caps,
      enforcementTable: ENFORCEMENT_TABLE.map((row) => ({
        field: row.field,
        label: row.label,
        value: row.value,
        enforcement: row.enforcement,
        description: row.description,
        verifiedBy: [...row.plannedTests],
        ...(row.conditional !== undefined ? { conditional: row.conditional } : {}),
      })),
      nonGuarantees: [...NON_GUARANTEES],
    };
  }
}
