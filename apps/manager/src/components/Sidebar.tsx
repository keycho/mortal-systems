import type { IdentitySummary, RuntimeStatus } from "@mortal/schema";

export type View =
  | "overview"
  | "identities"
  | "blueprints"
  | "activity"
  | "guarantees"
  | "settings";

const GROUPS: Array<{ title: string; items: Array<{ view: View; label: string }> }> = [
  {
    title: "operate",
    items: [
      { view: "overview", label: "overview" },
      { view: "identities", label: "identities" },
      { view: "blueprints", label: "blueprints" },
    ],
  },
  {
    title: "system",
    items: [
      { view: "activity", label: "activity" },
      { view: "guarantees", label: "guarantees" },
      { view: "settings", label: "settings" },
    ],
  },
];

export function Sidebar({
  view,
  onNavigate,
  status,
  identities = [],
  onNewIdentity,
}: {
  view: View;
  onNavigate: (view: View) => void;
  status: RuntimeStatus | null;
  identities?: IdentitySummary[];
  onNewIdentity?: () => void;
}) {
  const running = identities.filter((i) => i.state === "running").length;
  const expiring = identities.filter(
    (i) => i.state === "expiring" || i.state === "destroying"
  ).length;
  const live = identities.filter((i) => i.state !== "destroyed").length;

  return (
    <nav
      aria-label="primary"
      className="w-60 shrink-0 border-r border-line flex flex-col bg-panel"
    >
      <div className="px-5 pt-5 pb-4">
        <div className="text-[16px] font-medium tracking-wide">mortal systems</div>
        <div className="text-mute text-[12px]">manager</div>
      </div>

      {onNewIdentity !== undefined && (
        <div className="px-4 pb-4">
          <button
            className="w-full bg-accent/10 border border-accent/40 text-accent px-3 py-2 text-[13px] font-medium hover:bg-accent/15 transition-colors"
            onClick={onNewIdentity}
          >
            + new identity
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {GROUPS.map((group) => (
          <div key={group.title} className="pb-3">
            <div className="px-5 pb-1 text-[10px] tracking-[0.18em] uppercase text-faint">
              {group.title}
            </div>
            <ul>
              {group.items.map((item) => {
                const active = view === item.view;
                return (
                  <li key={item.view}>
                    <button
                      className={`w-full text-left pl-5 pr-4 py-2 text-[13.5px] flex items-center gap-2 border-l-2 transition-colors ${
                        active
                          ? "border-accent text-ink bg-panel-3"
                          : "border-transparent text-mute hover:text-ink hover:bg-panel-2"
                      }`}
                      aria-current={active ? "page" : undefined}
                      onClick={() => onNavigate(item.view)}
                    >
                      <span>{item.label}</span>
                      {item.view === "identities" && live > 0 && (
                        <span
                          aria-hidden
                          className="ml-auto font-mono text-[11px] text-mute bg-panel-2 border border-line px-1.5 rounded-sm"
                        >
                          {live}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* live identity status strip */}
      <div className="px-5 py-3 border-t border-line flex flex-col gap-2 text-[12px]">
        <div className="flex items-center gap-2">
          <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: "var(--state-active)" }} />
          <span className="text-mute">running</span>
          <span className="ml-auto font-mono text-ink">{running}</span>
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: "var(--state-expiring)" }} />
          <span className="text-mute">expiring / closing</span>
          <span className="ml-auto font-mono text-ink">{expiring}</span>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-line flex items-center gap-2 text-[12px]">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: status !== null ? "var(--state-active)" : "var(--danger)" }}
          aria-label={status !== null ? "runtime connected" : "runtime unreachable"}
        />
        {status !== null ? (
          <span className="font-mono text-mute truncate">runtime {status.version}</span>
        ) : (
          <span className="text-mute">runtime unreachable</span>
        )}
      </div>
    </nav>
  );
}
