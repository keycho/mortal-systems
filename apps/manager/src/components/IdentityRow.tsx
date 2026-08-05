import type { IdentitySummary } from "@mortal/schema";

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

/** status colors are for status only (application design system) */
export const STATE_COLOR: Record<IdentitySummary["state"], string> = {
  created: "var(--text-muted)",
  provisioning: "var(--text-muted)",
  ready: "var(--text-secondary)",
  running: "var(--app-active)",
  suspended: "var(--text-muted)",
  expiring: "var(--app-warning)",
  destroying: "var(--app-danger)",
  destroyed: "var(--text-muted)",
  archived: "var(--text-muted)",
};

export function spaceLabel(n: number): string {
  return `space ${String(n).padStart(3, "0")}`;
}

export function StatePill({ state }: { state: IdentitySummary["state"] }) {
  const color = STATE_COLOR[state];
  return (
    <span
      className="text-[12.5px] px-2.5 py-0.5 rounded-full bg-elevated inline-flex items-center gap-1.5 shrink-0"
      data-testid="state-pill"
      data-state={state}
      style={{ color }}
    >
      <span
        aria-hidden
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: state === "destroyed" ? "var(--text-muted)" : color }}
      />
      {STATE_LABEL[state]}
    </span>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kb`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} mb`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} gb`;
}
