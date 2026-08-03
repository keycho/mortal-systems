import { useMemo, useState } from "react";
import { formatRemaining, type IdentitySummary, type RuntimeStatus } from "@mortal/schema";
import {
  Activity,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  Plus,
  Search,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { STATE_LABEL } from "./IdentityRow.js";

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

/** partition, first match wins: active > persistent > ready > receipts */
function groupIdentities(identities: IdentitySummary[]): Group[] {
  const destroyed = identities.filter((i) => i.state === "destroyed");
  const live = identities.filter((i) => i.state !== "destroyed");
  const active = live.filter(
    (i) => i.state === "running" || i.state === "expiring" || i.state === "destroying"
  );
  const rest = live.filter((i) => !active.includes(i));
  const persistent = rest.filter((i) => i.expiresAt === null);
  const ready = rest.filter((i) => i.expiresAt !== null);
  return [
    { key: "active", title: "active", items: active },
    { key: "persistent", title: "persistent", items: persistent },
    { key: "ready", title: "ready", items: ready },
    { key: "receipts", title: "receipts", items: destroyed },
  ].filter((g) => g.items.length > 0);
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
      title={`${summary.name} · ${summary.id}`}
      className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
        selected ? "bg-surface-hover text-ink" : "hover:bg-surface text-ink"
      } ${destroyed ? "opacity-55" : ""}`}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(summary.id)}
    >
      <span className="flex flex-col min-w-0 flex-1">
        <span className="text-[14px] truncate leading-snug">{summary.name}</span>
        <span className="flex items-center gap-1.5 leading-snug text-[12.5px] text-mute">
          <span>{STATE_LABEL[summary.state]}</span>
          {summary.state === "running" && (
            <span aria-label="browser running">· browser</span>
          )}
          {remaining !== null && (
            <span data-testid="nav-countdown" className="ml-auto font-mono tabular-nums text-[12px]">
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
  const [collapsed, setCollapsed] = useState(false);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return identities;
    return identities.filter(
      (i) => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)
    );
  }, [identities, query]);
  const groups = useMemo(() => groupIdentities(filtered), [filtered]);

  const links: Array<{ view: View; label: string; icon: React.ReactNode }> = [
    { view: "overview", label: "home", icon: <LayoutDashboard size={16} strokeWidth={1.75} /> },
    { view: "blueprints", label: "blueprints", icon: <Package size={16} strokeWidth={1.75} /> },
    { view: "activity", label: "activity", icon: <Activity size={16} strokeWidth={1.75} /> },
    { view: "guarantees", label: "guarantees", icon: <ShieldCheck size={16} strokeWidth={1.75} /> },
    { view: "settings", label: "settings", icon: <Settings size={16} strokeWidth={1.75} /> },
  ];

  if (collapsed) {
    return (
      <nav aria-label="identities" className="w-14 shrink-0 bg-sidebar flex flex-col items-center py-4 gap-2">
        <button
          className="p-2 rounded-lg text-sec hover:text-ink hover:bg-surface outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          aria-label="expand sidebar"
          title="expand sidebar"
          onClick={() => setCollapsed(false)}
        >
          <PanelLeftOpen size={17} strokeWidth={1.75} />
        </button>
        <button
          className="p-2 rounded-lg text-sec hover:text-ink hover:bg-surface outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          aria-label="new identity"
          title="new identity"
          onClick={onNewIdentity}
        >
          <Plus size={17} strokeWidth={1.75} />
        </button>
        {links.map((l) => (
          <button
            key={l.view}
            className={`p-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
              view === l.view && selectedId === null
                ? "bg-surface-hover text-ink"
                : "text-sec hover:text-ink hover:bg-surface"
            }`}
            aria-label={l.label}
            title={l.label}
            onClick={() => onNavigate(l.view)}
          >
            {l.icon}
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="identities" className="w-[268px] shrink-0 bg-sidebar flex flex-col">
      <div className="px-4 pt-4 pb-3 flex items-center gap-2">
        <span className="text-[15px] font-medium tracking-wide">mortal</span>
        <span
          aria-hidden
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--app-brand)" }}
          title={status !== null ? `runtime ${status.version}` : "runtime unreachable"}
        />
        <button
          className="ml-auto p-1.5 rounded-lg text-mute hover:text-ink hover:bg-surface outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          aria-label="collapse sidebar"
          title="collapse sidebar"
          onClick={() => setCollapsed(true)}
        >
          <PanelLeftClose size={16} strokeWidth={1.75} />
        </button>
      </div>

      <div className="px-3 pb-3 flex flex-col gap-2">
        <button
          className="h-9 rounded-lg bg-surface border border-line text-[13.5px] text-ink flex items-center gap-2 px-3 hover:bg-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          onClick={onNewIdentity}
        >
          <Plus size={15} strokeWidth={2} />
          new identity
        </button>
        <div className="relative">
          <Search
            size={14}
            strokeWidth={1.75}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-mute pointer-events-none"
          />
          <input
            type="search"
            aria-label="search identities"
            placeholder="search"
            className="w-full h-9 bg-input rounded-lg pl-8.5 pr-3 text-[13.5px] placeholder:text-mute outline-none border border-transparent focus:border-line-strong focus-visible:ring-2 focus-visible:ring-white/25"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 pb-2 flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-0.5">
            <div className="px-3 pb-1 text-[12px] text-mute">{group.title}</div>
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
          <p className="px-3 text-[13px] text-mute">nothing matches "{query}".</p>
        )}
        {identities.length === 0 && (
          <p className="px-3 text-[13px] text-mute">no identities yet.</p>
        )}
      </div>

      <div className="px-3 py-2 flex flex-col gap-0.5 border-t border-line">
        {links.map((l) => (
          <button
            key={l.view}
            className={`w-full text-left px-3 py-2 rounded-lg text-[14px] flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
              view === l.view && selectedId === null
                ? "bg-surface-hover text-ink"
                : "text-sec hover:text-ink hover:bg-surface"
            }`}
            aria-current={view === l.view && selectedId === null ? "page" : undefined}
            onClick={() => onNavigate(l.view)}
          >
            {l.icon}
            {l.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
