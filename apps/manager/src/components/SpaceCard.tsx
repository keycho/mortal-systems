import { formatRemaining, type IdentitySummary } from "@liminal/schema";

/** identity states rendered as quiet room-status language */
const STATE_LABEL: Record<IdentitySummary["state"], string> = {
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

export function spaceLabel(n: number): string {
  return `space ${String(n).padStart(3, "0")}`;
}

export interface SpaceCardProps {
  summary: IdentitySummary;
  /** injectable clock for deterministic tests */
  now?: number;
  onOpen?: (id: string) => void;
  onLaunch?: (id: string) => void;
  onSuspend?: (id: string) => void;
  onDestroy?: (id: string) => void;
}

export function SpaceCard({ summary, now, onOpen, onLaunch, onSuspend, onDestroy }: SpaceCardProps) {
  const t = now ?? Date.now();
  const destroyed = summary.state === "destroyed";
  const remaining =
    summary.expiresAt !== null && !destroyed
      ? formatRemaining(Date.parse(summary.expiresAt) - t)
      : null;

  return (
    <div
      data-testid={`space-card-${summary.id}`}
      className="relative border border-line bg-panel p-4 flex flex-col gap-3"
      style={{ opacity: destroyed ? 0.55 : 1 }}
    >
      <div
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: summary.color }}
      />
      <div className="flex items-baseline justify-between">
        <span className="text-mute text-[11px] tracking-widest uppercase">
          {spaceLabel(summary.spaceNumber)}
        </span>
        <span
          className="text-[11px] px-2 py-0.5 border border-line"
          data-testid="state-pill"
          style={{ color: destroyed ? "var(--color-mute)" : summary.color }}
        >
          {STATE_LABEL[summary.state]}
        </span>
      </div>

      <button
        className="text-[15px] leading-tight text-left hover:underline decoration-line underline-offset-4"
        onClick={() => onOpen?.(summary.id)}
        title="open manifest and activity"
      >
        {summary.name}
      </button>

      <div className="flex items-baseline justify-between text-[11px] text-mute">
        <span>{summary.lifetime === "persistent" ? "persistent" : summary.lifetime}</span>
        {remaining !== null && (
          <span data-testid="countdown" className="tabular-nums text-ink">
            {remaining} remaining
          </span>
        )}
        {destroyed && <span data-testid="countdown">closed</span>}
      </div>

      {!destroyed && (
        <div className="flex gap-2 pt-1">
          {(summary.state === "created" || summary.state === "ready" || summary.state === "suspended") && (
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
            className="border border-line px-3 py-1 text-[11px] text-mute hover:text-ink hover:bg-panel-2 ml-auto"
            onClick={() => onDestroy?.(summary.id)}
          >
            destroy
          </button>
        </div>
      )}
    </div>
  );
}
