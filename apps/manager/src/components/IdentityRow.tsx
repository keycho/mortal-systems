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
const STATE_COLOR: Record<IdentitySummary["state"], string> = {
  created: "var(--mute)",
  provisioning: "var(--mute)",
  ready: "var(--ink)",
  running: "var(--state-active)",
  suspended: "var(--mute)",
  expiring: "var(--state-expiring)",
  destroying: "var(--state-destroying)",
  destroyed: "var(--mute)",
  archived: "var(--state-archived)",
};

export function spaceLabel(n: number): string {
  return `space ${String(n).padStart(3, "0")}`;
}

export interface IdentityRowProps {
  summary: IdentitySummary;
  /** injectable clock for deterministic tests */
  now?: number;
  selected?: boolean;
  onOpen?: (id: string) => void;
  onLaunch?: (id: string) => void;
  onSuspend?: (id: string) => void;
  onDestroy?: (id: string) => void;
}

export function IdentityRow({
  summary,
  now,
  selected,
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
      className={`relative border border-line bg-panel flex items-center gap-4 px-4 py-3 ${
        selected ? "border-line-strong bg-panel-2" : ""
      }`}
      style={{ opacity: destroyed ? 0.55 : 1 }}
    >
      <div
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: summary.color }}
      />
      <span className="font-mono text-mute text-[11px] tracking-widest uppercase w-24 shrink-0">
        {spaceLabel(summary.spaceNumber)}
      </span>
      <button
        className="text-[14px] text-left hover:underline decoration-line underline-offset-4 truncate"
        onClick={() => onOpen?.(summary.id)}
        title="open identity workspace"
      >
        {summary.name}
      </button>
      <span
        className="font-mono text-[11px] px-2 py-0.5 border border-line shrink-0"
        data-testid="state-pill"
        style={{ color: destroyed ? "var(--mute)" : STATE_COLOR[summary.state] }}
      >
        {STATE_LABEL[summary.state]}
      </span>
      <span className="ml-auto font-mono text-[11px] text-mute shrink-0">
        {summary.lifetime === "persistent" ? "persistent" : summary.lifetime}
      </span>
      {remaining !== null && (
        <span data-testid="countdown" className="font-mono tabular-nums text-[11px] text-ink shrink-0">
          {remaining} remaining
        </span>
      )}
      {destroyed && (
        <span data-testid="countdown" className="font-mono text-[11px] text-mute shrink-0">
          closed
        </span>
      )}
      {!destroyed && (
        <span className="flex gap-2 shrink-0">
          {(summary.state === "created" ||
            summary.state === "ready" ||
            summary.state === "suspended") && (
            <button
              className="border border-line px-3 py-1 text-[11px] hover:bg-panel-2"
              onClick={() => onLaunch?.(summary.id)}
            >
              launch
            </button>
          )}
          {summary.state === "running" && (
            <button
              className="border border-line px-3 py-1 text-[11px] hover:bg-panel-2"
              onClick={() => onSuspend?.(summary.id)}
            >
              suspend
            </button>
          )}
          <button
            className="border border-line px-3 py-1 text-[11px] text-mute hover:text-ink hover:bg-panel-2"
            onClick={() => onDestroy?.(summary.id)}
          >
            destroy
          </button>
        </span>
      )}
    </div>
  );
}
