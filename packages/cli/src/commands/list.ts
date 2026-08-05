import { identityStateSchema, PERSISTENT, type IdentityState } from "@mortal/schema";
import type { CommandContext } from "../context.js";
import { formatTable, remainingCell, stateCell, toJson } from "../output.js";
import { parseCommandArgs, UsageError } from "../usage.js";

const STATES: readonly string[] = identityStateSchema.options;

export const LIST_HELP = `usage: mortal list [--state <state>[,<state>...]] [--json] [--root <dir>]

identities with id, name, state, and remaining lifetime. destroyed identities
(tombstones) are hidden by default; ask for them with --state destroyed.

  --state  filter: ${STATES.join(" ")}
           or the pseudo-state "persistent" (identities with no expiry)
  --json   emit the runtime's IdentitySummary[] for the same selection
`;

interface Selection {
  filter?: { state?: IdentityState[] };
  persistentOnly: boolean;
  /** default view (no --state): destroyed rows are dropped after fetch */
  hideDestroyed: boolean;
}

/** exported for tests: --state grammar -> list selection */
export function parseStateSelection(raw: string | undefined): Selection {
  if (raw === undefined) return { persistentOnly: false, hideDestroyed: true };
  const parts = raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length === 0) throw new UsageError(`--state needs a value: ${STATES.join(" ")} or persistent`);
  const bad = parts.find((p) => p !== PERSISTENT && !STATES.includes(p));
  if (bad !== undefined) {
    throw new UsageError(`unknown state "${bad}" — valid: ${STATES.join(" ")} or persistent`);
  }
  const wantsPersistent = parts.includes(PERSISTENT);
  const real = parts.filter((p) => p !== PERSISTENT) as IdentityState[];
  if (wantsPersistent && real.length > 0) {
    throw new UsageError(
      `--state persistent selects by lifetime and cannot be mixed with lifecycle states (got "${raw}")`
    );
  }
  if (wantsPersistent) return { persistentOnly: true, hideDestroyed: true };
  return { filter: { state: real }, persistentOnly: false, hideDestroyed: false };
}

export async function cmdList(ctx: CommandContext): Promise<number> {
  const { values } = parseCommandArgs<{ state: string }>(
    ctx.argv,
    { state: { type: "string" } },
    { max: 0 }
  );
  if (values.help) {
    ctx.out(LIST_HELP);
    return 0;
  }
  const selection = parseStateSelection(values.state);

  const client = await ctx.connect({ root: values.root });
  const fetched = await client.rpc("identity.list", selection.filter ? { filter: selection.filter } : {});

  let rows = fetched;
  let hiddenDestroyed = 0;
  if (selection.persistentOnly) {
    rows = rows.filter((s) => s.lifetime === PERSISTENT && s.state !== "destroyed");
  } else if (selection.hideDestroyed) {
    hiddenDestroyed = rows.filter((s) => s.state === "destroyed").length;
    rows = rows.filter((s) => s.state !== "destroyed");
  }

  if (values.json) {
    ctx.out(toJson(rows));
    return 0;
  }

  const c = ctx.colors;
  if (rows.length === 0) {
    ctx.out(
      values.state === undefined
        ? `no identities. create one: mortal create research --lifetime 15m\n`
        : `no identities match --state ${values.state}\n`
    );
  } else {
    const table = [
      [c.dim("NAME"), c.dim("STATE"), c.dim("REMAINING"), c.dim("ID")],
      ...rows.map((s) => [s.name, stateCell(c, s.state), remainingCell(s, ctx.now()), c.dim(s.id)]),
    ];
    for (const line of formatTable(table)) ctx.out(`${line}\n`);
  }
  if (hiddenDestroyed > 0) {
    ctx.out(c.dim(`(${hiddenDestroyed} destroyed hidden — mortal list --state destroyed)\n`));
  }
  return 0;
}
