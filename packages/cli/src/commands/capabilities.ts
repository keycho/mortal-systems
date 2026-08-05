import { ENFORCEMENT_TABLE } from "@mortal/schema";
import type { CommandContext } from "../context.js";
import { enforcementBadge, formatTable, toJson } from "../output.js";
import { parseCommandArgs } from "../usage.js";

export const CAPABILITIES_HELP = `usage: mortal capabilities [--json] [--root <dir>]

what the connected runtime enforces vs merely declares, from its own
capability report. scripts should trust only the "enforced" list and treat
advisory/roadmap controls as declarations, not guarantees.

  --json   emit the runtime's RuntimeCapabilities object
           { enforceable, advisory, roadmap, reservedMethods }
`;

const GROUP_INTRO: Record<"enforced" | "advisory" | "roadmap", string> = {
  enforced: "backed by the runtime and a passing automated test gate",
  advisory: "recorded and shown, not technically enforced — do not rely on these",
  roadmap: "not built yet; these fields declare intent and enforce nothing today",
};

export async function cmdCapabilities(ctx: CommandContext): Promise<number> {
  const { values } = parseCommandArgs(ctx.argv, {}, { max: 0 });
  if (values.help) {
    ctx.out(CAPABILITIES_HELP);
    return 0;
  }

  const client = await ctx.connect({ root: values.root });
  const caps = await client.rpc("runtime.capabilities", {});

  if (values.json) {
    ctx.out(toJson(caps));
    return 0;
  }

  const c = ctx.colors;
  ctx.out(`${c.bold("mortal capabilities")} — as reported by the runtime at ${client.baseUrl}\n`);

  const groups: Array<["enforced" | "advisory" | "roadmap", string[]]> = [
    ["enforced", caps.enforceable],
    ["advisory", caps.advisory],
    ["roadmap", caps.roadmap],
  ];
  for (const [level, fields] of groups) {
    ctx.out(`\n${enforcementBadge(c, level)} — ${GROUP_INTRO[level]}\n`);
    const rows = fields.map((field) => {
      const row = ENFORCEMENT_TABLE.find((r) => r.field === field);
      return [`  ${field}`, row?.value ?? ""];
    });
    const lines = formatTable(rows);
    lines.forEach((line, i) => {
      ctx.out(`${line}\n`);
      const row = ENFORCEMENT_TABLE.find((r) => r.field === fields[i]);
      if (row) ctx.out(c.dim(`      ${row.description}\n`));
    });
  }

  ctx.out(
    `\nreserved api methods — return NOT_IMPLEMENTED (enforcement "roadmap"); feature-detect here before use:\n`
  );
  ctx.out(`  ${caps.reservedMethods.join(", ")}\n`);
  return 0;
}
