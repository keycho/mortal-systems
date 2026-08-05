import { DESTROY_STEP_LABELS, type DestructionReport, type IdentitySummary } from "@mortal/schema";
import type { CommandContext } from "../context.js";
import { SLOW_RPC_TIMEOUT_MS } from "../client.js";
import { formatTable, remainingCell, toJson, type Colors } from "../output.js";
import { resolveIdentity } from "../resolve.js";
import { parseCommandArgs, UsageError } from "../usage.js";

export const DESTROY_HELP = `usage: mortal destroy <id|name> [--yes] [--json] [--root <dir>]

run the deletion contract (D0-D7) on an identity and print the destruction
report: every step with its outcome, the row counts removed, and the caveats —
what destruction can never remove. asks for confirmation on a terminal;
scripts must pass --yes.

  --yes    skip the interactive confirmation
  --json   emit the runtime's DestructionReport
`;

/** the confirmation gate: only the exact name or the exact id confirms */
export function destructionConfirmed(input: string, identity: { id: string; name: string }): boolean {
  const typed = input.trim();
  return typed.length > 0 && (typed === identity.name || typed === identity.id);
}

export function confirmationPrompt(summary: IdentitySummary, remaining: string): string {
  return (
    `destroy "${summary.name}" (${summary.id}, ${summary.state}${
      remaining === "—" ? "" : `, ${remaining} remaining`
    })?\n\n` +
    `this permanently removes, for this identity only:\n` +
    `  - its browser profile (cookies, logins, history, extension state)\n` +
    `  - its files and downloads partition\n` +
    `  - its notes, bookmarks, and ai conversation history\n` +
    `  - its stamped companion instance\n` +
    `what websites already hold server-side is not removable; the full caveats print with the report.\n` +
    `only a tombstone (id, name, destruction time) remains.\n\n` +
    `type the identity's name (or id) to confirm, anything else to abort: `
  );
}

function renderReport(
  out: (s: string) => void,
  c: Colors,
  name: string,
  report: DestructionReport
): void {
  const failed = report.steps.find((s) => !s.ok);
  out(
    `${failed ? c.red("destruction incomplete") : "destroyed"} ${c.bold(name)}  ${c.dim(report.identityId)}${
      report.resumed ? " (resumed from journal)" : ""
    }\n`
  );
  const rows = report.steps.map((s) => [
    `  ${s.step}`,
    s.ok ? c.green("ok") : c.red("FAILED"),
    `${DESTROY_STEP_LABELS[s.step]}${s.detail !== undefined && s.detail !== "" ? ` — ${s.detail}` : ""}`,
  ]);
  for (const line of formatTable(rows)) out(`${line}\n`);
  const ms = Date.parse(report.completedAt) - Date.parse(report.startedAt);
  out(`completed in ${Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}s` : "?"}\n`);
  if (failed) {
    out(
      c.red(
        `stopped at ${failed.step}; the journal is retained and the runtime resumes this destruction on its next start.\n`
      )
    );
  }
  out(`\nwhat destruction does ${c.bold("not")} remove (true of every destruction):\n`);
  for (const caveat of report.caveats) out(`  - ${caveat}\n`);
}

export async function cmdDestroy(ctx: CommandContext): Promise<number> {
  const { values, positionals } = parseCommandArgs<{ yes: boolean }>(
    ctx.argv,
    { yes: { type: "boolean", default: false } },
    { min: 1, max: 1, label: "<id|name>" }
  );
  if (values.help) {
    ctx.out(DESTROY_HELP);
    return 0;
  }

  const client = await ctx.connect({ root: values.root });
  const summary = await resolveIdentity(client, positionals[0] as string);

  if (values.yes !== true) {
    if (!ctx.stdinIsTTY) {
      throw new UsageError(
        `stdin is not a terminal, so destroy cannot ask for confirmation — pass --yes to destroy "${summary.name}" (${summary.id})`
      );
    }
    const answer = await ctx.prompt(confirmationPrompt(summary, remainingCell(summary, ctx.now())));
    if (!destructionConfirmed(answer, summary)) {
      ctx.err(`aborted — nothing was destroyed.\n`);
      return 1;
    }
  }

  const report = await client.rpc(
    "identity.destroy",
    { id: summary.id, reason: "cli destroy" },
    { timeoutMs: SLOW_RPC_TIMEOUT_MS }
  );

  if (values.json) {
    ctx.out(toJson(report));
    return report.steps.every((s) => s.ok) ? 0 : 1;
  }

  renderReport(ctx.out, ctx.colors, summary.name, report);
  return report.steps.every((s) => s.ok) ? 0 : 1;
}
