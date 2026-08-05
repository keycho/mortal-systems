import type { CommandContext } from "../context.js";
import { formatTable, toJson } from "../output.js";
import { effectivePermissions, effectivePrivacy, permissionRows } from "../permissions.js";
import { parseCommandArgs } from "../usage.js";

export const BLUEPRINTS_HELP = `usage: mortal blueprints [--json] [--root <dir>]

installed blueprints with the permissions an identity created from each one
gets, each carrying its real enforcement level (enforced / advisory / roadmap).

  --json   emit [{ ...BlueprintSummary, permissions, privacy }] where
           permissions/privacy are the effective { value, enforcement } maps
`;

export async function cmdBlueprints(ctx: CommandContext): Promise<number> {
  const { values } = parseCommandArgs(ctx.argv, {}, { max: 0 });
  if (values.help) {
    ctx.out(BLUEPRINTS_HELP);
    return 0;
  }

  const client = await ctx.connect({ root: values.root });
  const summaries = await client.rpc("blueprint.list", {});
  const detailed = [];
  for (const summary of summaries) {
    const { manifest } = await client.rpc("blueprint.get", { id: summary.id });
    detailed.push({
      summary,
      permissions: effectivePermissions(manifest),
      privacy: effectivePrivacy(manifest),
    });
  }

  if (values.json) {
    ctx.out(toJson(detailed.map((d) => ({ ...d.summary, permissions: d.permissions, privacy: d.privacy }))));
    return 0;
  }

  const c = ctx.colors;
  if (detailed.length === 0) {
    ctx.out(
      "no blueprints installed. the runtime seeds its first-party set when started with --seed-first-party;\n" +
        'identities can also be created without one: mortal create research --lifetime 15m\n'
    );
    return 0;
  }

  for (const { summary, permissions, privacy } of detailed) {
    const tier = summary.reviewTier === "standard" ? "" : ` (${summary.reviewTier})`;
    ctx.out(
      `\n${c.bold(summary.name)}  ${c.dim(summary.id)} · v${summary.version} · ${summary.category} · recommended lifetime ${summary.recommendedLifetime}\n`
    );
    ctx.out(`  ${summary.description}\n`);
    if (summary.publisher !== null) ctx.out(`  publisher: ${summary.publisher}${tier}\n`);
    for (const line of formatTable(permissionRows(c, permissions, privacy).map((r) => [`  ${r[0]}`, r[1] ?? "", r[2] ?? ""]))) {
      ctx.out(`${line}\n`);
    }
  }
  ctx.out(`\ncreate from one: mortal create <name> --blueprint <bpt_id> [--lifetime 15m]\n`);
  return 0;
}
