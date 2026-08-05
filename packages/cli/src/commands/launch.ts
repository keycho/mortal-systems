import { BRANDED_CHROME_COMPANION_CAVEAT } from "@mortal/schema";
import type { CommandContext } from "../context.js";
import { SLOW_RPC_TIMEOUT_MS } from "../client.js";
import { formatTable, remainingCell, stateCell, toJson } from "../output.js";
import { resolveIdentity } from "../resolve.js";
import { parseCommandArgs } from "../usage.js";

export const LAUNCH_HELP = `usage: mortal launch <id|name> [--json] [--root <dir>]

launch the identity's isolated browser. prints the state, remaining lifetime,
and the scoped cdp endpoint — the endpoint controls only this identity's
browser, nothing else. launching an already-running identity just re-prints
its endpoint.

  --json   emit { id, name, state, pid, cdpEndpoint, expiresAt }

if the browser does not start, "mortal status" shows what was detected and
any warnings. note: ${BRANDED_CHROME_COMPANION_CAVEAT}
`;

export const RESUME_HELP = `usage: mortal resume <id|name> [--json] [--root <dir>]

relaunch a suspended identity's browser with all its state intact. same output
as "mortal launch" (resume is launch for a suspended identity).

  --json   emit { id, name, state, pid, cdpEndpoint, expiresAt }
`;

export function launchJsonShape(input: {
  id: string;
  name: string;
  state: string;
  pid: number;
  cdpEndpoint: string | null;
  expiresAt: string | null;
}): Record<string, unknown> {
  // the documented stable shape, key order included
  return {
    id: input.id,
    name: input.name,
    state: input.state,
    pid: input.pid,
    cdpEndpoint: input.cdpEndpoint,
    expiresAt: input.expiresAt,
  };
}

export function makeLaunchLike(verb: "launch" | "resume", help: string) {
  return async function cmdLaunchLike(ctx: CommandContext): Promise<number> {
    const { values, positionals } = parseCommandArgs(ctx.argv, {}, { min: 1, max: 1, label: "<id|name>" });
    if (values.help) {
      ctx.out(help);
      return 0;
    }

    const client = await ctx.connect({ root: values.root });
    const resolved = await resolveIdentity(client, positionals[0] as string);
    const method = verb === "resume" ? "identity.resume" : "identity.launch";
    const { pid, cdpEndpoint } = await client.rpc(
      method,
      { id: resolved.id },
      { timeoutMs: SLOW_RPC_TIMEOUT_MS }
    );
    const { summary } = await client.rpc("identity.get", { id: resolved.id });

    if (values.json) {
      ctx.out(
        toJson(
          launchJsonShape({
            id: summary.id,
            name: summary.name,
            state: summary.state,
            pid,
            cdpEndpoint,
            expiresAt: summary.expiresAt,
          })
        )
      );
      return 0;
    }

    const c = ctx.colors;
    ctx.out(`${verb === "resume" ? "resumed" : "launched"} ${c.bold(summary.name)}  ${c.dim(summary.id)}\n`);
    const rows: string[][] = [
      ["  state", stateCell(c, summary.state)],
      [
        "  remaining",
        summary.expiresAt === null
          ? remainingCell(summary, ctx.now())
          : `${remainingCell(summary, ctx.now())} · ${summary.onExpiry} at ${summary.expiresAt}`,
      ],
      ["  pid", String(pid)],
      ["  cdp", cdpEndpoint ?? "(no endpoint reported)"],
    ];
    for (const line of formatTable(rows)) ctx.out(`${line}\n`);
    ctx.out(c.dim(`the cdp endpoint controls only this identity's browser.\n`));
    return 0;
  };
}

export const cmdLaunch = makeLaunchLike("launch", LAUNCH_HELP);
export const cmdResume = makeLaunchLike("resume", RESUME_HELP);
