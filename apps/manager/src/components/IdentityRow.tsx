import { formatRemaining, type IdentitySummary } from "@mortal/schema";

/** identity states rendered as quiet room-status language */
export const STATE_LABEL: Record<IdentitySummary["state"], string> = {
  created: "prepared",
  provisioning: "provisioning",
  ready: "ready",
  running: "active",
  suspended: "suspended",
  expiring: "expiring",
  destroying: "destroying",
  destroyed: "destroyed",
  archived: "archived",
};

/** semantic state colors from the shared tokens; the identity color is the rail only */
export const STATE_COLOR: Record<IdentitySummary["state"], string> = {
  created: "var(--mute-app)",
  provisioning: "var(--mute-app)",
  ready: "var(--ink-app)",
  running: "var(--state-active)",
  suspended: "var(--mute-app)",
  expiring: "var(--state-expiring)",
  destroying: "var(--state-destroying)",
  destroyed: "var(--mute-app)",
  archived: "var(--state-archived)",
};

export function spaceLabel(n: number): string {
  return `space ${String(n).padStart(3, "0")}`;
}

export function StatePill({ state }: { state: IdentitySummary["state"] }) {
  const color = STATE_COLOR[state];
  return (
    <span
      className="font-mono text-[11.5px] px-2 py-0.5 border rounded-sm inline-flex items-center gap-1.5 shrink-0"
      data-testid="state-pill"
      style={{ color, borderColor: "var(--line-1)" }}
    >
      <span
        aria-hidden
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: state === "destroyed" ? "var(--faint-app)" : color }}
      />
      {STATE_LABEL[state]}
    </span>
  );
}

function browserStatus(state: IdentitySummary["state"]): string {
  switch (state) {
    case "running":
      return "browser open";
    case "expiring":
      return "browser open · closing soon";
    case "suspended":
      return "browser closed · data kept";
    case "destroying":
      return "halting browser";
    case "destroyed":
      return "no browser";
    default:
      return "browser not launched";
  }
}

export interface IdentityRowProps {
  summary: IdentitySummary;
  /** injectable clock for deterministic tests */
  now?: number;
  selected?: boolean;
  /** narrow contexts (dashboard columns): name, state, countdown only */
  compact?: boolean;
  onOpen?: (id: string) => void;
  onLaunch?: (id: string) => void;
  onSuspend?: (id: string) => void;
  onDestroy?: (id: string) => void;
}

/**
 * an identity as an operational object: rail, designation, name + blueprint
 * origin, state, browser status, lifetime + countdown, storage, last activity,
 * and the actions valid in the current state.
 */
export function IdentityRow({
  summary,
  now,
  selected,
  compact = false,
  onOpen,
  onLaunch,
  onSuspend,
  onDestroy,
}: IdentityRowProps) {
  const t = now ?? Date.now();
  const destroyed = summary.state === "destroyed";
  const remaining =
    summary.expiresAt !== null && !destroyed
      ? formatRemaining(Date.parse(summary.expiresAt) - t)
      : null;

  return (
    <div
      data-testid={`identity-row-${summary.id}`}
      className={`relative border bg-panel flex items-center gap-5 pl-5 pr-4 py-3.5 transition-colors ${
        selected ? "border-line-strong bg-panel-2" : "border-line hover:bg-panel-2"
      }`}
      style={{ opacity: destroyed ? 0.6 : 1 }}
    >
      <div
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: summary.color }}
      />

      {/* name + origin */}
      <div className={`flex flex-col gap-0.5 min-w-0 ${compact ? "flex-1" : "w-[300px]"}`}>
        <div className="flex items-baseline gap-2.5 min-w-0">
          <button
            className="text-[15px] font-medium text-left hover:underline decoration-line-strong underline-offset-4 truncate"
            onClick={() => onOpen?.(summary.id)}
            title="open identity workspace"
          >
            {summary.name}
          </button>
          <span className="font-mono text-faint text-[11px] tracking-wider uppercase shrink-0">
            {spaceLabel(summary.spaceNumber)}
          </span>
        </div>
        <span className="text-[12px] text-mute truncate">
          {summary.blueprint !== null
            ? `from ${summary.blueprint.source} v${summary.blueprint.version}`
            : "created by hand"}
        </span>
      </div>

      <StatePill state={summary.state} />

      {!compact && (
        <span className="text-[12px] text-mute w-44 shrink-0 hidden xl:inline">
          {browserStatus(summary.state)}
        </span>
      )}

      {/* lifetime + countdown */}
      <div className={`flex flex-col gap-0.5 shrink-0 ${compact ? "items-end" : "w-40"}`}>
        <span className="font-mono text-[12px] text-mute">
          {summary.lifetime === "persistent" ? "persistent" : `lifetime ${summary.lifetime}`}
        </span>
        {remaining !== null && (
          <span data-testid="countdown" className="font-mono tabular-nums text-[12.5px] text-ink">
            {remaining} remaining
          </span>
        )}
        {destroyed && (
          <span data-testid="countdown" className="font-mono text-[12px] text-mute">
            closed
          </span>
        )}
      </div>

      {/* storage + last activity */}
      <div className={`flex-col gap-0.5 w-40 shrink-0 ${compact ? "hidden" : "hidden lg:flex"}`}>
        <span className="font-mono text-[12px] text-mute">
          {formatBytes(summary.storageBytes)} on disk
        </span>
        <span className="text-[12px] text-faint">
          {summary.lastLaunchedAt !== null
            ? `last active ${new Date(summary.lastLaunchedAt).toLocaleString()}`
            : "never launched"}
        </span>
      </div>

      {!destroyed && !compact && (
        <span className="flex gap-2 shrink-0 ml-auto">
          {(summary.state === "created" ||
            summary.state === "ready" ||
            summary.state === "suspended") && (
            <button
              className="border border-line px-3.5 py-1.5 text-[12.5px] hover:bg-panel-3 hover:border-line-strong transition-colors"
              onClick={() => onLaunch?.(summary.id)}
            >
              launch
            </button>
          )}
          {summary.state === "running" && (
            <button
              className="border border-line px-3.5 py-1.5 text-[12.5px] hover:bg-panel-3 hover:border-line-strong transition-colors"
              onClick={() => onSuspend?.(summary.id)}
            >
              suspend
            </button>
          )}
          <button
            className="border border-line px-3.5 py-1.5 text-[12.5px] text-mute hover:text-danger hover:border-danger/40 transition-colors"
            onClick={() => onDestroy?.(summary.id)}
          >
            destroy
          </button>
        </span>
      )}
    </div>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kb`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} mb`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} gb`;
}
