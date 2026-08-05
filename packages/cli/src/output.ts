import {
  formatRemaining,
  PERSISTENT,
  type Enforcement,
  type IdentityState,
  type IdentitySummary,
} from "@mortal/schema";

/**
 * terminal output helpers. color degrades cleanly: enabled only on a tty,
 * disabled by NO_COLOR or TERM=dumb, and json/piped output never carries
 * escape codes. width math strips ansi so tables stay aligned either way.
 */

const ESC = String.fromCharCode(27);
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*m`, "g");

export interface Colors {
  enabled: boolean;
  bold(s: string): string;
  dim(s: string): string;
  red(s: string): string;
  green(s: string): string;
  yellow(s: string): string;
  blue(s: string): string;
  magenta(s: string): string;
  cyan(s: string): string;
  gray(s: string): string;
}

function wrap(code: number, s: string): string {
  return `${ESC}[${code}m${s}${ESC}[0m`;
}

export function makeColors(enabled: boolean): Colors {
  const id = (s: string) => s;
  if (!enabled) {
    return {
      enabled,
      bold: id,
      dim: id,
      red: id,
      green: id,
      yellow: id,
      blue: id,
      magenta: id,
      cyan: id,
      gray: id,
    };
  }
  return {
    enabled,
    bold: (s) => wrap(1, s),
    dim: (s) => wrap(2, s),
    red: (s) => wrap(31, s),
    green: (s) => wrap(32, s),
    yellow: (s) => wrap(33, s),
    blue: (s) => wrap(34, s),
    magenta: (s) => wrap(35, s),
    cyan: (s) => wrap(36, s),
    gray: (s) => wrap(90, s),
  };
}

export function colorsEnabled(stream: { isTTY?: boolean }, env: NodeJS.ProcessEnv): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.TERM === "dumb") return false;
  return stream.isTTY === true;
}

export function visibleWidth(s: string): number {
  return s.replace(ANSI_RE, "").length;
}

/** align rows into columns; the last column is never padded */
export function formatTable(rows: readonly (readonly string[])[], gutter = "  "): string[] {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, visibleWidth(cell));
    });
  }
  return rows.map((row) =>
    row
      .map((cell, i) =>
        i === row.length - 1 ? cell : cell + " ".repeat((widths[i] ?? 0) - visibleWidth(cell))
      )
      .join(gutter)
      .trimEnd()
  );
}

/** stable, pretty json to stdout; the shapes are the typed rpc contract's */
export function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** one-line json error for stderr in --json mode */
export function toJsonErrorLine(error: {
  code: string;
  message: string;
  hint?: string;
  issues?: unknown;
  enforcement?: string;
}): string {
  return `${JSON.stringify({ error })}\n`;
}

/**
 * remaining-lifetime cell for an identity. fixed-width zero-padded countdowns
 * (schema's formatRemaining) so columns of them read like tabular numerals.
 */
export function remainingCell(summary: IdentitySummary, now: Date): string {
  if (summary.state === "destroyed") return "—";
  if (summary.lifetime === PERSISTENT) return "persistent";
  if (summary.expiresAt === null) return "—";
  return formatRemaining(Date.parse(summary.expiresAt) - now.getTime());
}

/** coarse elapsed-time display (runtime uptime); reuses the countdown format */
export function elapsed(fromIso: string, now: Date): string {
  return formatRemaining(Math.max(0, now.getTime() - Date.parse(fromIso)));
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = n;
  let unit = "B";
  for (const u of units) {
    if (value < 1024) break;
    value /= 1024;
    unit = u;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}

export function stateCell(c: Colors, state: IdentityState): string {
  switch (state) {
    case "running":
      return c.green(state);
    case "ready":
      return c.cyan(state);
    case "created":
    case "provisioning":
      return c.blue(state);
    case "suspended":
      return c.yellow(state);
    case "expiring":
      return c.magenta(state);
    case "destroying":
      return c.red(state);
    case "destroyed":
      return c.dim(state);
    case "archived":
      return c.gray(state);
  }
}

/**
 * enforcement labels, colored but never reworded: enforced is the only one
 * that may read as a guarantee; advisory and roadmap stay visually distinct
 * so an advisory control can never pass for an enforced one.
 */
export function enforcementBadge(c: Colors, e: Enforcement): string {
  switch (e) {
    case "enforced":
      return c.green(e);
    case "advisory":
      return c.yellow(e);
    case "roadmap":
      return c.gray(e);
  }
}
