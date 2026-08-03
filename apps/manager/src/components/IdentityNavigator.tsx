import { useMemo, useState } from "react";
import { formatRemaining, type IdentitySummary, type RuntimeStatus } from "@mortal/schema";
import { STATE_COLOR, STATE_LABEL } from "./IdentityRow.js";
import { Button, shortId } from "./ui.js";

export type View =
  | "overview"
  | "identities"
  | "blueprints"
  | "activity"
  | "guarantees"
  | "settings";

interface Group {
  key: string;
  title: string;
  items: IdentitySummary[];
}

/** partition, first match wins: running > suspended > expiring > persistent */
function groupIdentities(identities: IdentitySummary[]): { groups: Group[]; destroyed: IdentitySummary[] } {
  const destroyed = identities.filter((i) => i.state === "destroyed");
  const live = identities.filter((i) => i.state !== "destroyed");
  const running = live.filter((i) => i.state === "running");
  const suspended = live.filter((i) => i.state === "suspended");
  const expiring = live.filter(
    (i) => i.state !== "running" && i.state !== "suspended" && i.expiresAt !== null
  );
  const persistent = live.filter(
    (i) => i.state !== "running" && i.state !== "suspended" && i.expiresAt === null
  );
  return {
    groups: [
      { key: "running", title: "running", items: running },
      { key: "expiring", title: "expiring", items: expiring },
      { key: "suspended", title: "suspended", items: suspended },
      { key: "persistent", title: "persistent", items: persistent },
    ].filter((g) => g.items.length > 0),
    destroyed,
  };
}

function NavIdentity({
  summary,
  selected,
  now,
  onSelect,
}: {
  summary: IdentitySummary;
  selected: boolean;
  now?: number;
  onSelect: (id: string) => void;
}) {
  const t = now ?? Date.now();
  const destroyed = summary.state === "destroyed";
  const remaining =
    summary.expiresAt !== null && !destroyed
      ? formatRemaining(Date.parse(summary.expiresAt) - t)
      : null;
  return (
    <button
      data-testid={`nav-identity-${summary.id}`}
      className={`w-full text-left px-3 py-2 flex items-center gap-2.5 border-l-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 ${
        selected
          ? "border-accent bg-panel-3 text-ink"
          : "border-transparent hover:bg-panel-2 text-ink"
      } ${destroyed ? "opacity-60" : ""}`}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(summary.id)}
    >
      <span
        aria-hidden
        className="w-2.5 h-2.5 rounded-[3px] shrink-0"
        style={{ background: summary.color }}
      />
      <span className="flex flex-col min-w-0 flex-1 gap-0.5">
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="text-[13.5px] font-medium truncate">{summary.name}</span>
          <span className="font-mono text-[10.5px] text-faint shrink-0">{shortId(summary.id)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className="text-[11.5px]"
            style={{ color: destroyed ? "var(--faint-app)" : STATE_COLOR[summary.state] }}
          >
            {STATE_LABEL[summary.state]}
          </span>
          {summary.state === "running" && (
            <span aria-label="browser running" className="flex items-center gap-1 text-[11px] text-mute">
              <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--state-active)" }} />
              browser
            </span>
          )}
          {remaining !== null && (
            <span data-testid="nav-countdown" className="ml-auto font-mono tabular-nums text-[11px] text-mute">
              {remaining}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export function IdentityNavigator({
  identities,
  status,
  view,
  selectedId,
  onSelect,
  onNavigate,
  onNewIdentity,
}: {
  identities: IdentitySummary[];
  status: RuntimeStatus | null;
  view: View;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNavigate: (view: View) => void;
  onNewIdentity: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return identities;
    return identities.filter(
      (i) => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)
    );
  }, [identities, query]);
  const { groups, destroyed } = useMemo(() => groupIdentities(filtered), [filtered]);

  const topLink = (v: View, label: string) => (
    <button
      className={`w-full text-left px-3 py-1.5 text-[13px] border-l-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 ${
        view === v && selectedId === null
          ? "border-accent bg-panel-3 text-ink"
          : "border-transparent text-mute hover:text-ink hover:bg-panel-2"
      }`}
      aria-current={view === v && selectedId === null ? "page" : undefined}
      onClick={() => onNavigate(v)}
    >
      {label}
    </button>
  );

  return (
    <nav aria-label="identities" className="w-[270px] shrink-0 border-r border-line flex flex-col bg-panel">
      <div className="px-4 pt-4 pb-3 flex items-center gap-2">
        <div className="flex flex-col">
          <span className="text-[15px] font-medium tracking-wide leading-tight">mortal</span>
          <span className="text-faint text-[11px] leading-tight">manager</span>
        </div>
        <span
          className="ml-auto w-2 h-2 rounded-full"
          style={{ background: status !== null ? "var(--state-active)" : "var(--danger)" }}
          aria-label={status !== null ? "runtime connected" : "runtime unreachable"}
          title={status !== null ? `runtime ${status.version}` : "runtime unreachable"}
        />
      </div>

      <div className="px-3 pb-2 flex flex-col gap-2">
        <Button variant="primary" className="w-full" onClick={onNewIdentity}>
          + new identity
        </Button>
        <input
          type="search"
          aria-label="search identities"
          placeholder="search identities"
          className="bg-panel-2 border border-line px-3 py-1.5 text-[13px] outline-none focus:border-line-strong focus-visible:ring-2 focus-visible:ring-accent/60 rounded-[2px]"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="px-1 pb-1">{topLink("overview", "dashboard")}</div>

      <div className="flex-1 overflow-auto px-1 py-1 flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="px-3 pb-1 text-[10.5px] tracking-[0.16em] uppercase text-faint flex items-baseline gap-2">
              {group.title}
              <span className="font-mono">{group.items.length}</span>
            </div>
            {group.items.map((summary) => (
              <NavIdentity
                key={summary.id}
                summary={summary}
                selected={selectedId === summary.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
        {filtered.length === 0 && identities.length > 0 && (
          <p className="px-3 text-[12.5px] text-mute">nothing matches "{query}".</p>
        )}
        {identities.length === 0 && (
          <p className="px-3 text-[12.5px] text-mute">
            no identities yet. create one or install a blueprint.
          </p>
        )}
        {destroyed.length > 0 && (
          <div>
            <div className="px-3 pb-1 text-[10.5px] tracking-[0.16em] uppercase text-faint flex items-baseline gap-2">
              destroyed · receipts
              <span className="font-mono">{destroyed.length}</span>
            </div>
            {destroyed.map((summary) => (
              <NavIdentity
                key={summary.id}
                summary={summary}
                selected={selectedId === summary.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-line px-1 py-1.5">
        {topLink("blueprints", "blueprints")}
        {topLink("settings", "settings")}
      </div>
    </nav>
  );
}
