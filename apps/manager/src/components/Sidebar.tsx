import type { RuntimeStatus } from "@mortal/schema";

export type View =
  | "overview"
  | "identities"
  | "blueprints"
  | "activity"
  | "guarantees"
  | "settings";

const NAV: Array<{ view: View; label: string }> = [
  { view: "overview", label: "overview" },
  { view: "identities", label: "identities" },
  { view: "blueprints", label: "blueprints" },
  { view: "activity", label: "activity" },
  { view: "guarantees", label: "guarantees" },
  { view: "settings", label: "settings" },
];

export function Sidebar({
  view,
  onNavigate,
  status,
}: {
  view: View;
  onNavigate: (view: View) => void;
  status: RuntimeStatus | null;
}) {
  return (
    <nav
      aria-label="primary"
      className="w-48 shrink-0 border-r border-line flex flex-col bg-panel"
    >
      <div className="px-4 py-4 border-b border-line">
        <div className="text-[14px] tracking-wide">mortal systems</div>
        <div className="text-mute text-[11px]">manager</div>
      </div>
      <ul className="flex-1 py-2">
        {NAV.map((item) => (
          <li key={item.view}>
            <button
              className={`w-full text-left px-4 py-2 text-[13px] border-l-2 ${
                view === item.view
                  ? "border-accent text-ink bg-panel-2"
                  : "border-transparent text-mute hover:text-ink hover:bg-panel-2"
              }`}
              aria-current={view === item.view ? "page" : undefined}
              onClick={() => onNavigate(item.view)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="px-4 py-3 border-t border-line flex items-center gap-2 text-[11px] text-mute">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: status !== null ? "var(--state-active)" : "var(--danger)" }}
          aria-label={status !== null ? "runtime connected" : "runtime unreachable"}
        />
        {status !== null ? (
          <span className="font-mono truncate">runtime {status.version}</span>
        ) : (
          <span>runtime unreachable</span>
        )}
      </div>
    </nav>
  );
}
