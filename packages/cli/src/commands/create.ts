import {
  composeManifest,
  DurationError,
  generateIdentityId,
  parseLifetimeMs,
} from "@mortal/schema";
import type { CommandContext } from "../context.js";
import { formatTable, remainingCell, toJson } from "../output.js";
import { permissionRows } from "../permissions.js";
import { parseCommandArgs, UsageError } from "../usage.js";
import { RpcClientError, type RuntimeClient } from "../client.js";

export const CREATE_HELP = `usage: mortal create <name> [--blueprint <id|name>] [--lifetime <l>] [--json] [--root <dir>]

create an identity, from a blueprint or from a minimal manifest. prints the
identity id and its manifest with each permission's real enforcement level.

  --blueprint  a bpt_ id or exact blueprint name ("mortal blueprints" lists them);
               without it, a minimal manifest is composed
  --lifetime   "persistent" or <integer><s|m|h|d>, e.g. 15m, 12h, 7d
               (default: persistent, or the blueprint's recommended lifetime)
  --json       emit { summary, manifest } as stored by the runtime

examples:
  mortal create research --lifetime 15m
  mortal create contract-review --blueprint "Client Operations"
`;

/** validate --lifetime with the real schema grammar; its error text is the message */
export function validateLifetimeFlag(lifetime: string | undefined): void {
  if (lifetime === undefined) return;
  try {
    parseLifetimeMs(lifetime);
  } catch (err) {
    if (err instanceof DurationError) throw new UsageError(err.message);
    throw err;
  }
}

async function resolveBlueprintId(client: RuntimeClient, ref: string): Promise<string> {
  if (/^bpt_[A-Za-z0-9_-]{10,32}$/.test(ref)) return ref;
  const all = await client.rpc("blueprint.list", {});
  const named = all.filter((b) => b.name === ref);
  if (named.length === 1) return (named[0] as (typeof all)[number]).id;
  if (named.length === 0) {
    const available = all.map((b) => `"${b.name}"`).join(", ");
    throw new RpcClientError({
      code: "NOT_FOUND",
      message: `no blueprint named "${ref}"${all.length > 0 ? ` — installed: ${available}` : " — none are installed"}`,
    });
  }
  throw new RpcClientError({
    code: "CONFLICT",
    message: `blueprint name "${ref}" is ambiguous — use the id: ${named.map((b) => b.id).join(", ")}`,
  });
}

export async function cmdCreate(ctx: CommandContext): Promise<number> {
  const { values, positionals } = parseCommandArgs<{ blueprint: string; lifetime: string }>(
    ctx.argv,
    { blueprint: { type: "string" }, lifetime: { type: "string" } },
    { min: 1, max: 1, label: "<name>" }
  );
  if (values.help) {
    ctx.out(CREATE_HELP);
    return 0;
  }
  const name = positionals[0] as string;
  validateLifetimeFlag(values.lifetime);

  const client = await ctx.connect({ root: values.root });

  // names are not unique; warn (stderr) when this one is already taken so the
  // user knows name-addressing will turn ambiguous
  const existing = await client.rpc("identity.list", {});
  if (existing.some((s) => s.name === name && s.state !== "destroyed")) {
    ctx.err(`note: an identity named "${name}" already exists — address them by id from now on\n`);
  }

  let created;
  if (values.blueprint !== undefined) {
    const blueprintId = await resolveBlueprintId(client, values.blueprint);
    created = await client.rpc("identity.createFromBlueprint", {
      blueprintId,
      overrides: { name, ...(values.lifetime !== undefined ? { lifetime: values.lifetime } : {}) },
    });
  } else {
    const manifest = composeManifest({
      id: generateIdentityId(),
      name,
      createdAt: ctx.now().toISOString(),
      lifetime: values.lifetime,
    });
    created = await client.rpc("identity.create", { manifest });
  }

  // re-read so what we print is what the runtime stored, not what we sent
  const { summary, manifest } = await client.rpc("identity.get", { id: created.id });

  if (values.json) {
    ctx.out(toJson({ summary, manifest }));
    return 0;
  }

  const c = ctx.colors;
  ctx.out(`created ${c.bold(summary.name)}  ${summary.id}\n`);
  const lifetimeLine =
    summary.expiresAt === null
      ? `${summary.lifetime}`
      : `${summary.lifetime} · remaining ${remainingCell(summary, ctx.now())} · on expiry: ${summary.onExpiry}`;
  const head: string[][] = [
    ["  state", summary.state],
    ["  lifetime", lifetimeLine],
    ...(summary.blueprint ? [["  blueprint", `${summary.blueprint.source} v${summary.blueprint.version}`]] : []),
  ];
  for (const line of formatTable(head)) ctx.out(`${line}\n`);
  if (manifest !== null) {
    ctx.out(`\npermissions (value · enforcement):\n`);
    for (const line of formatTable(
      permissionRows(c, manifest.permissions, manifest.privacy).map((r) => [`  ${r[0]}`, r[1] ?? "", r[2] ?? ""])
    )) {
      ctx.out(`${line}\n`);
    }
  }
  ctx.out(`\nnext: mortal launch ${summary.name.includes(" ") ? summary.id : summary.name}\n`);
  return 0;
}
