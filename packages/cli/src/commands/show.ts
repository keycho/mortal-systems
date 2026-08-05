import { DESTROYED_MEANS, type ActivityEvent } from "@mortal/schema";
import type { CommandContext } from "../context.js";
import { bytes, formatTable, remainingCell, stateCell, toJson } from "../output.js";
import { permissionRows } from "../permissions.js";
import { resolveIdentity } from "../resolve.js";
import { parseCommandArgs } from "../usage.js";

export const SHOW_HELP = `usage: mortal show <id|name> [--json] [--root <dir>]

one identity in detail: environment surfaces, permissions with their real
enforcement levels, remaining lifetime, and recent activity.

  --json   emit { summary, manifest, activity } (manifest is null once the
           identity is destroyed; only the tombstone remains)
`;

const ACTIVITY_LIMIT = 8;

const ON_EXPIRY_VERB: Record<"destroy" | "suspend" | "archive", string> = {
  destroy: "destroys",
  suspend: "suspends",
  archive: "archives",
};

function activityLines(events: ActivityEvent[]): string[][] {
  // runtime returns newest-first; render oldest-first so the tail reads downward
  return [...events].reverse().map((e) => {
    let detail = e.detail === null ? "" : JSON.stringify(e.detail);
    if (detail.length > 100) detail = `${detail.slice(0, 100)}…`;
    return [`  ${e.createdAt}`, e.event, detail];
  });
}

export async function cmdShow(ctx: CommandContext): Promise<number> {
  const { values, positionals } = parseCommandArgs(ctx.argv, {}, { min: 1, max: 1, label: "<id|name>" });
  if (values.help) {
    ctx.out(SHOW_HELP);
    return 0;
  }

  const client = await ctx.connect({ root: values.root });
  const resolved = await resolveIdentity(client, positionals[0] as string);
  const { summary, manifest } = await client.rpc("identity.get", { id: resolved.id });
  const activity = await client.rpc("activity.read", {
    identityId: resolved.id,
    limit: ACTIVITY_LIMIT,
  });

  if (values.json) {
    ctx.out(toJson({ summary, manifest, activity }));
    return 0;
  }

  const c = ctx.colors;
  const space = `space ${String(summary.spaceNumber).padStart(3, "0")}`;

  if (manifest === null) {
    ctx.out(`${c.bold(summary.name)}  ${c.dim(summary.id)} · ${space} · ${stateCell(c, summary.state)}\n\n`);
    ctx.out(`${DESTROYED_MEANS}\n\n`);
    ctx.out(`activity (last ${ACTIVITY_LIMIT}):\n`);
    for (const line of formatTable(activityLines(activity))) ctx.out(`${line}\n`);
    return 0;
  }

  const bp = summary.blueprint;
  ctx.out(
    `${c.bold(summary.name)}  ${c.dim(summary.id)} · ${space}${bp ? ` · from blueprint ${bp.source} v${bp.version}` : ""}\n`
  );

  const remaining = remainingCell(summary, ctx.now());
  const expiry =
    summary.expiresAt === null
      ? remaining
      : `${remaining} · ${ON_EXPIRY_VERB[summary.onExpiry]} at ${summary.expiresAt}`;
  const head: string[][] = [
    ["  state", stateCell(c, summary.state)],
    ["  remaining", expiry],
    ["  created", manifest.lifecycle.createdAt],
    ["  last launch", summary.lastLaunchedAt ?? "never"],
    ["  storage", bytes(summary.storageBytes)],
  ];
  for (const line of formatTable(head)) ctx.out(`${line}\n`);

  ctx.out(`\nenvironment:\n`);
  const b = manifest.surfaces.browser;
  const env: string[][] = [
    ["  browser", `${b.type} · ${b.profilePath} · extensions: ${b.extensions.join(", ")}`],
    ["  files", manifest.surfaces.files.root],
    [
      "  memory",
      `${manifest.surfaces.memory.type} · ${manifest.surfaces.memory.scope} · ${manifest.surfaces.memory.retention}`,
    ],
    [
      "  ai",
      `provider ${manifest.ai.provider} · instructions ${
        manifest.ai.systemInstructions.length === 0
          ? "(none)"
          : `(${manifest.ai.systemInstructions.length} chars)`
      }`,
    ],
  ];
  for (const line of formatTable(env)) ctx.out(`${line}\n`);

  ctx.out(`\npermissions (value · enforcement):\n`);
  for (const line of formatTable(
    permissionRows(c, manifest.permissions, manifest.privacy).map((r) => [`  ${r[0]}`, r[1] ?? "", r[2] ?? ""])
  )) {
    ctx.out(`${line}\n`);
  }

  ctx.out(`\nactivity (last ${ACTIVITY_LIMIT}):\n`);
  for (const line of formatTable(activityLines(activity))) ctx.out(`${line}\n`);
  return 0;
}
