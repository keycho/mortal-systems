import type { CommandContext } from "../context.js";
import { elapsed, formatTable, toJson } from "../output.js";
import { parseCommandArgs } from "../usage.js";
import { cmdShow } from "./show.js";

export const STATUS_HELP = `usage: mortal status [<id|name>] [--json] [--root <dir>]

runtime health: version, detected browser, identities running. with an
identity id or name, that identity's detail instead (same as "mortal show").

  --json   emit the runtime's RuntimeStatus object
  --root   runtime root to look in (default ~/.mortal, or MORTAL_ROOT)
`;

export async function cmdStatus(ctx: CommandContext): Promise<number> {
  const { values, positionals } = parseCommandArgs(ctx.argv, {}, { max: 1, label: "<id|name>" });
  if (values.help) {
    ctx.out(STATUS_HELP);
    return 0;
  }
  if (positionals.length === 1) {
    return cmdShow(ctx);
  }

  const client = await ctx.connect({ root: values.root });
  const status = await client.rpc("runtime.status", {});

  if (values.json) {
    ctx.out(toJson(status));
    return 0;
  }

  const c = ctx.colors;
  const rows: string[][] = [
    ["root", status.root],
    ["api", `127.0.0.1:${status.port} · pid ${status.pid} · up ${elapsed(status.startedAt, ctx.now())}`],
  ];
  if (status.defaultBrowser) {
    const b = status.defaultBrowser;
    const more = status.browsers.length - 1;
    rows.push([
      "browser",
      `${b.version ?? `${b.kind} (version unknown)`} — ${b.path}${more > 0 ? c.dim(` (+${more} more detected)`) : ""}`,
    ]);
  } else {
    rows.push([
      "browser",
      c.red("none detected") +
        " — launch will fail. install chromium or brave (or google chrome), or set MORTAL_BROWSER_PATH.",
    ]);
  }
  rows.push([
    "identities",
    `${status.identitiesRunning} running`,
  ]);

  ctx.out(`${c.bold("mortal runtime")} v${status.version} — ${c.green("running")}\n`);
  for (const line of formatTable(rows.map(([k, v]) => [`  ${k ?? ""}`, v ?? ""]))) {
    ctx.out(`${line}\n`);
  }
  for (const warning of status.warnings) {
    ctx.out(`  ${c.yellow("warning")}  ${warning}\n`);
  }
  return 0;
}
