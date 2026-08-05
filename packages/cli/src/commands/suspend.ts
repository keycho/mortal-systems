import type { CommandContext } from "../context.js";
import { SLOW_RPC_TIMEOUT_MS } from "../client.js";
import { toJson } from "../output.js";
import { resolveIdentity } from "../resolve.js";
import { parseCommandArgs } from "../usage.js";

export const SUSPEND_HELP = `usage: mortal suspend <id|name> [--json] [--root <dir>]

terminate the identity's browser process; every surface (profile, files,
notes, ai context) is kept. a finite lifetime keeps counting down while
suspended. relaunch with "mortal resume".

  --json   emit the identity's IdentitySummary after suspending
`;

export async function cmdSuspend(ctx: CommandContext): Promise<number> {
  const { values, positionals } = parseCommandArgs(ctx.argv, {}, { min: 1, max: 1, label: "<id|name>" });
  if (values.help) {
    ctx.out(SUSPEND_HELP);
    return 0;
  }

  const client = await ctx.connect({ root: values.root });
  const resolved = await resolveIdentity(client, positionals[0] as string);
  await client.rpc("identity.suspend", { id: resolved.id }, { timeoutMs: SLOW_RPC_TIMEOUT_MS });
  const { summary } = await client.rpc("identity.get", { id: resolved.id });

  if (values.json) {
    ctx.out(toJson(summary));
    return 0;
  }
  const c = ctx.colors;
  ctx.out(
    `suspended ${c.bold(summary.name)}  ${c.dim(summary.id)} — browser terminated, state kept.\n` +
      `resume with: mortal resume ${summary.name.includes(" ") ? summary.id : summary.name}\n`
  );
  return 0;
}
