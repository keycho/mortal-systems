import { useState } from "react";
import type {
  ActivityEvent,
  BlueprintSummary,
  DestructionReport,
  IdentityManifest,
  IdentitySummary,
  RuntimeStatus,
} from "@mortal/schema";
import { formatRemaining } from "@mortal/schema";
import { ActivityLog, DestructionReportView } from "../components/ActivityLog.js";
import { formatBytes, spaceLabel, StatePill } from "../components/IdentityRow.js";
import { PermissionRows, Tombstone } from "../components/PermissionRows.js";
import { Button, PathValue, shortId } from "../components/ui.js";

export type InspectorTab = "browser" | "files" | "memory" | "permissions" | "lifecycle" | "receipt";

const INSPECTOR_TABS: Array<{ tab: InspectorTab; label: string }> = [
  { tab: "browser", label: "browser" },
  { tab: "files", label: "files" },
  { tab: "memory", label: "memory" },
  { tab: "permissions", label: "permissions" },
  { tab: "lifecycle", label: "lifecycle" },
  { tab: "receipt", label: "receipt" },
];

export interface WorkspaceData {
  summary: IdentitySummary;
  manifest: IdentityManifest | null;
  events: ActivityEvent[];
}

export function destructionReportFrom(events: ActivityEvent[]): DestructionReport | null {
  for (const event of events) {
    if (event.event === "destroyed" && event.detail !== null && "report" in event.detail) {
      return event.detail.report as unknown as DestructionReport;
    }
  }
  return null;
}

export function lastLaunchPid(events: ActivityEvent[]): number | null {
  for (const event of events) {
    if (event.event === "launched" && typeof event.detail?.pid === "number") {
      return event.detail.pid;
    }
  }
  return null;
}

/* ---------------------------------------------------------------- */
/* shared primitives                                                 */
/* ---------------------------------------------------------------- */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-line bg-panel px-5 py-4 flex flex-col gap-3 rounded-[2px]">
      <h3 className="text-[11px] tracking-[0.16em] uppercase text-mute">{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 text-[13.5px]">
      <span className="text-mute w-32 shrink-0">{label}</span>
      <span className={`${mono ? "font-mono text-[13px]" : ""} break-words min-w-0`}>{value}</span>
    </div>
  );
}

/** what the manager can honestly say about data it cannot read */
function CannotRead({ what, deletedAt }: { what: string; deletedAt: string }) {
  return (
    <p
      className="text-[13px] text-mute border border-dashed border-line px-4 py-3 leading-relaxed"
      data-testid="cannot-read"
    >
      the manager does not read {what} — no rpc method exposes their contents. they belong to the
      identity and are served only to its own companion. on destroy they are removed at {deletedAt}{" "}
      of the destruction contract.
    </p>
  );
}

function browserStatusLine(state: IdentitySummary["state"]): string {
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
      return "not launched";
  }
}

/* ---------------------------------------------------------------- */
/* inspector tabs                                                    */
/* ---------------------------------------------------------------- */

export function BrowserInspector({
  data,
  status,
}: {
  data: WorkspaceData;
  status: RuntimeStatus | null;
}) {
  const { summary, manifest } = data;
  if (manifest === null) return <Tombstone />;
  const root = status?.root ?? null;
  const pid = lastLaunchPid(data.events);
  const open = summary.state === "running" || summary.state === "expiring";
  return (
    <div className="flex flex-col gap-4">
      <Card title="process">
        <Fact label="status" value={browserStatusLine(summary.state)} mono={false} />
        {open && pid !== null && <Fact label="pid" value={String(pid)} />}
        <Fact
          label="engine"
          value={
            status?.defaultBrowser != null
              ? `${status.defaultBrowser.kind} ${status.defaultBrowser.version ?? ""}`.trim()
              : "none detected"
          }
        />
        <Fact label="cdp" value={open ? "endpoint held by the runtime" : "—"} mono={false} />
        <Button
          variant="secondary"
          size="sm"
          disabled
          title="needs a runtime rpc method that is not exposed yet — the manager will not pretend"
          className="self-start"
        >
          focus browser window
        </Button>
      </Card>
      <Card title="profile">
        {root !== null ? (
          <PathValue path={`${root}/profiles/${summary.id}`} label="profile path" />
        ) : (
          <span className="text-[12.5px] text-mute">runtime unreachable</span>
        )}
        <Fact label="storage" value={formatBytes(summary.storageBytes)} />
        {summary.lastLaunchedAt !== null && (
          <Fact label="last launched" value={new Date(summary.lastLaunchedAt).toLocaleString()} />
        )}
      </Card>
      <p className="text-[12.5px] text-mute leading-relaxed border border-dashed border-line px-4 py-3">
        the browser is a real chromium process on its own profile — never a webview inside the
        manager. active url, page title and screenshots are not exposed over the runtime's rpc yet,
        so this panel does not show them.
      </p>
    </div>
  );
}

export function FilesInspector({
  data,
  status,
}: {
  data: WorkspaceData;
  status: RuntimeStatus | null;
}) {
  const { summary, manifest } = data;
  if (manifest === null) return <Tombstone />;
  const root = status?.root ?? null;
  return (
    <div className="flex flex-col gap-4">
      <Card title="managed partition">
        {root !== null ? (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline gap-3 text-[13.5px]">
                <span className="text-mute w-24 shrink-0">profile</span>
                <PathValue path={`${root}/profiles/${summary.id}`} />
              </div>
              <div className="flex items-baseline gap-3 text-[13.5px]">
                <span className="text-mute w-24 shrink-0">files</span>
                <PathValue path={`${root}/files/${summary.id}`} />
              </div>
              <div className="flex items-baseline gap-3 text-[13.5px]">
                <span className="text-mute w-24 shrink-0">companion</span>
                <PathValue path={`${root}/companion-instances/${summary.id}`} />
              </div>
            </div>
            <Fact label="storage" value={`${summary.storageBytes} bytes on disk`} />
          </>
        ) : (
          <span className="text-[12.5px] text-mute">runtime unreachable</span>
        )}
      </Card>
      <Card title="boundary">
        <p className="text-[13px] text-mute leading-relaxed">
          filesystem access is{" "}
          <span className="text-ink font-mono text-[12.5px]">
            {manifest.permissions.filesystem.value}
          </span>{" "}
          ({manifest.permissions.filesystem.enforcement}): downloads and files land inside this
          identity's partition, and destroy removes it (steps D3/D4).
        </p>
      </Card>
      <p className="text-[12.5px] text-mute leading-relaxed border border-dashed border-line px-4 py-3">
        a per-file listing (type, size, modified) needs a runtime rpc method that is not exposed
        yet — this panel shows the real boundary and totals instead of a fabricated file tree.
      </p>
      <CannotRead what="identity files" deletedAt="steps D3/D4" />
    </div>
  );
}

export function MemoryInspector({ data }: { data: WorkspaceData }) {
  const { manifest } = data;
  if (manifest === null) return <Tombstone />;
  return (
    <div className="flex flex-col gap-4">
      <Card title="scope">
        <p className="text-[13px] text-mute leading-relaxed">
          memory scope is{" "}
          <span className="text-ink font-mono text-[12.5px]">
            {manifest.permissions.memoryScope.value}
          </span>{" "}
          ({manifest.permissions.memoryScope.enforcement}): notes and ai context live inside this
          identity and are never shared across identities.
        </p>
      </Card>
      <Card title="ai configuration">
        <div className="text-[12.5px] text-mute whitespace-pre-wrap border border-line bg-panel-2 p-3 font-mono leading-relaxed max-h-48 overflow-auto">
          {manifest.ai.systemInstructions || "no system instructions."}
        </div>
        <Fact label="provider" value={manifest.ai.provider} />
        <Fact label="history" value={manifest.ai.historyRetention} />
      </Card>
      <CannotRead what="notes or ai messages" deletedAt="step D5" />
    </div>
  );
}

export function PermissionsInspector({ data }: { data: WorkspaceData }) {
  if (data.manifest === null) return <Tombstone />;
  return <PermissionRows manifest={data.manifest} />;
}

export function LifecycleInspector({
  data,
  now,
  onExpireNow,
}: {
  data: WorkspaceData;
  now?: number;
  onExpireNow?: (id: string) => void;
}) {
  const { summary, manifest } = data;
  const t = now ?? Date.now();
  const remaining =
    summary.expiresAt !== null && summary.state !== "destroyed"
      ? formatRemaining(Date.parse(summary.expiresAt) - t)
      : null;
  if (manifest === null) return <Tombstone />;
  return (
    <div className="flex flex-col gap-4">
      <Card title="schedule">
        <Fact label="lifetime" value={manifest.lifecycle.lifetime} />
        <Fact label="on expiry" value={manifest.lifecycle.onExpiry} />
        {summary.expiresAt !== null && (
          <Fact label="expires" value={new Date(summary.expiresAt).toLocaleString()} />
        )}
        {remaining !== null && <Fact label="remaining" value={remaining} />}
        {summary.expiresAt !== null && summary.state !== "destroying" && onExpireNow !== undefined && (
          <Button variant="secondary" size="sm" className="self-start" onClick={() => onExpireNow(summary.id)}>
            expire now
          </Button>
        )}
      </Card>
      <p className="text-[13px] text-mute leading-relaxed">
        when the deadline passes, a running identity gets a 60 second grace notice in its companion,
        then the browser is halted and the expiry action runs. an expiry missed while the runtime
        was stopped is honored at next startup and logged as expired_late.
      </p>
    </div>
  );
}

export function ReceiptInspector({ data }: { data: WorkspaceData }) {
  const report = destructionReportFrom(data.events);
  if (report === null) {
    return (
      <div
        className="border border-dashed border-line px-5 py-4 text-[13px] text-mute"
        data-testid="no-receipt"
      >
        no receipt. this identity has not been destroyed.
      </div>
    );
  }
  return <DestructionReportView report={report} />;
}

/* ---------------------------------------------------------------- */
/* lifecycle state machine (centre pane)                             */
/* ---------------------------------------------------------------- */

function statePath(onExpiry: IdentitySummary["onExpiry"]): IdentitySummary["state"][] {
  const tail: IdentitySummary["state"][] =
    onExpiry === "archive" ? ["archived"] : onExpiry === "suspend" ? ["suspended"] : ["destroying", "destroyed"];
  return ["created", "ready", "running", "expiring", ...tail];
}

const MACHINE_LABEL: Record<string, string> = {
  created: "prepared",
  ready: "ready",
  running: "active",
  expiring: "expiring",
  destroying: "destroying",
  destroyed: "destroyed",
  archived: "archived",
  suspended: "suspended",
};

export function StateMachine({ summary }: { summary: IdentitySummary }) {
  const path = statePath(summary.onExpiry);
  const idx = path.indexOf(summary.state);
  const offPath = idx === -1;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center flex-wrap gap-y-3">
        {path.map((state, i) => {
          const reached = idx >= 0 && i <= idx;
          const current = i === idx;
          return (
            <span key={state} className="flex items-center">
              <span
                className={`font-mono text-[12.5px] px-3 py-1.5 border rounded-sm ${current ? "font-medium" : ""}`}
                style={{
                  color: current ? "var(--ink-app)" : reached ? "var(--mute-app)" : "var(--faint-app)",
                  borderColor: current ? "var(--accent)" : "var(--line-1)",
                  background: current ? "var(--surface-3)" : reached ? "var(--surface-2)" : "transparent",
                }}
                aria-current={current ? "step" : undefined}
              >
                {MACHINE_LABEL[state]}
              </span>
              {i < path.length - 1 && (
                <svg aria-hidden width="22" height="10" viewBox="0 0 22 10" className="shrink-0">
                  <path
                    d="M2 5h16m-4-3.5L18 5l-4 3.5"
                    stroke={idx > i ? "var(--mute-app)" : "var(--line-2)"}
                    strokeWidth="1.3"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </span>
          );
        })}
      </div>
      {offPath && (
        <p className="text-[13px] text-mute">
          currently <span className="font-mono">{MACHINE_LABEL[summary.state] ?? summary.state}</span> — a
          branch off the scheduled path (suspend and resume are always available before expiry).
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* centre pane: identity operations                                  */
/* ---------------------------------------------------------------- */

function DestructionProgress({ events }: { events: ActivityEvent[] }) {
  const steps = events
    .filter((e) => e.event === "destroy_step")
    .map((e) => ({ step: String(e.detail?.step ?? ""), ok: e.detail?.ok === true }));
  if (steps.length === 0) return null;
  return (
    <Card title="destruction progress">
      <div className="flex items-center flex-wrap gap-2">
        {(["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"] as const).map((step) => {
          const done = steps.find((s) => s.step === step);
          return (
            <span
              key={step}
              className="font-mono text-[12.5px] px-2.5 py-1 border rounded-sm"
              style={{
                color:
                  done === undefined ? "var(--faint-app)" : done.ok ? "var(--state-active)" : "var(--danger)",
                borderColor: done === undefined ? "var(--line-1)" : "var(--line-2)",
                background: done === undefined ? "transparent" : "var(--surface-2)",
              }}
            >
              {step} {done === undefined ? "" : done.ok ? "✓" : "✗"}
            </span>
          );
        })}
      </div>
      <p className="text-[12.5px] text-faint">full report: the receipt tab in the inspector.</p>
    </Card>
  );
}

function OperationsPane({
  data,
  blueprints,
  onLaunch,
  onSuspend,
  onResume,
  onDestroy,
}: {
  data: WorkspaceData;
  blueprints: BlueprintSummary[];
  onLaunch: (id: string) => void;
  onSuspend: (id: string) => void;
  onResume: (id: string) => void;
  onDestroy: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const { summary, manifest } = data;
  const destroyed = summary.state === "destroyed";
  const remaining =
    summary.expiresAt !== null && !destroyed
      ? formatRemaining(Date.parse(summary.expiresAt) - Date.now())
      : null;
  const blueprint =
    summary.blueprint !== null
      ? (blueprints.find((b) => b.source === summary.blueprint?.source) ?? null)
      : null;
  const report = destructionReportFrom(data.events);
  const failures = data.events.filter(
    (e) => e.event === "error" || (e.event === "destroy_step" && e.detail?.ok === false)
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-auto">
      {/* header */}
      <header className="relative border-b border-line bg-panel pl-7 pr-6 py-5 flex items-center gap-6 shrink-0">
        <div
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ background: summary.color }}
        />
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-medium leading-tight truncate">{summary.name}</h1>
            <StatePill state={summary.state} />
          </div>
          <div className="flex items-center gap-3 text-[12.5px] text-mute flex-wrap">
            <span className="font-mono text-[11px] uppercase tracking-wider text-faint">
              {spaceLabel(summary.spaceNumber)}
            </span>
            <span className="font-mono text-[11px] text-faint">{shortId(summary.id)}</span>
            <span>{browserStatusLine(summary.state)}</span>
            {summary.blueprint !== null && (
              <span>
                from {summary.blueprint.source} v{summary.blueprint.version}
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-5 shrink-0">
          {remaining !== null && (
            <div className="flex flex-col items-end">
              <span className="font-mono tabular-nums text-[18px]">{remaining}</span>
              <span className="text-[11.5px] text-faint">until {summary.onExpiry}</span>
            </div>
          )}
          {!destroyed && (
            <div className="flex gap-2">
              {(summary.state === "created" || summary.state === "ready") && (
                <Button variant="primary" size="lg" onClick={() => onLaunch(summary.id)}>
                  launch
                </Button>
              )}
              {summary.state === "suspended" && (
                <Button variant="primary" size="lg" onClick={() => onResume(summary.id)}>
                  resume
                </Button>
              )}
              {summary.state === "running" && (
                <Button variant="secondary" size="lg" onClick={() => onSuspend(summary.id)}>
                  suspend
                </Button>
              )}
              <Button variant="danger" size="lg" onClick={() => setConfirming(true)}>
                destroy
              </Button>
            </div>
          )}
        </div>
      </header>

      {confirming && (
        <div className="border-b border-danger/40 bg-panel-2 px-7 py-3.5 text-[13.5px] flex items-center gap-4 shrink-0">
          <span className="text-mute">
            destroy this identity and its data on this machine? this cannot be undone.
          </span>
          <Button
            variant="danger"
            onClick={() => {
              setConfirming(false);
              onDestroy(summary.id);
            }}
          >
            destroy
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            keep
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-4 px-7 py-5">
        {/* destroyed: the receipt IS the narrative */}
        {destroyed && report !== null ? (
          <>
            <DestructionProgress events={data.events} />
            <DestructionReportView report={report} />
          </>
        ) : (
          <>
            {/* purpose */}
            <Card title="purpose">
              {blueprint !== null ? (
                <p className="text-[14px] leading-relaxed">{blueprint.description}</p>
              ) : manifest !== null && manifest.ai.systemInstructions ? (
                <p className="text-[13.5px] text-mute leading-relaxed line-clamp-3">
                  {manifest.ai.systemInstructions}
                </p>
              ) : (
                <p className="text-[13.5px] text-mute">
                  created by hand — no blueprint. its purpose lives with you, not the runtime.
                </p>
              )}
            </Card>

            {/* lifecycle progress */}
            <Card title="lifecycle">
              <StateMachine summary={summary} />
            </Card>

            <DestructionProgress events={data.events} />

            {failures.length > 0 && (
              <section className="border border-danger/40 bg-panel px-5 py-4 flex flex-col gap-2 rounded-[2px]">
                <h3 className="text-[11px] tracking-[0.16em] uppercase" style={{ color: "var(--danger)" }}>
                  needs attention
                </h3>
                {failures.slice(0, 4).map((e) => (
                  <span key={e.id} className="text-[13px] text-danger">
                    {e.event === "error"
                      ? String(e.detail?.message ?? "error")
                      : `destroy step ${String(e.detail?.step ?? "")} failed`}
                  </span>
                ))}
              </section>
            )}

            {/* notes / identity context: honest */}
            {manifest !== null && (
              <Card title="notes & context">
                <p className="text-[13px] text-mute leading-relaxed">
                  notes, ai conversations and downloads live inside this identity and are served
                  only to its own companion — the manager does not read them. what the runtime
                  enforces about them is in the memory and files inspectors.
                </p>
              </Card>
            )}

            {/* activity timeline */}
            <Card title="activity">
              <ActivityLog events={data.events} />
            </Card>

            {manifest !== null && (
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => setShowRaw((v) => !v)}>
                  {showRaw ? "hide" : "show"} manifest json
                </Button>
              </div>
            )}
            {showRaw && manifest !== null && (
              <pre className="font-mono text-[11.5px] text-mute border border-line bg-panel p-3 overflow-auto max-h-80">
                {JSON.stringify(manifest, null, 2)}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* the three-pane workspace: centre operations + right inspector     */
/* ---------------------------------------------------------------- */

export function IdentityWorkspace({
  data,
  status,
  blueprints = [],
  onLaunch,
  onSuspend,
  onResume,
  onExpireNow,
  onDestroy,
}: {
  data: WorkspaceData;
  status: RuntimeStatus | null;
  blueprints?: BlueprintSummary[];
  onBack?: () => void;
  onLaunch: (id: string) => void;
  onSuspend: (id: string) => void;
  onResume: (id: string) => void;
  onExpireNow: (id: string) => void;
  onDestroy: (id: string) => void;
}) {
  const destroyed = data.summary.state === "destroyed";
  const [tab, setTab] = useState<InspectorTab>(destroyed ? "receipt" : "browser");

  return (
    <div className="flex-1 min-w-0 flex">
      <OperationsPane
        data={data}
        blueprints={blueprints}
        onLaunch={onLaunch}
        onSuspend={onSuspend}
        onResume={onResume}
        onDestroy={onDestroy}
      />

      {/* contextual inspector */}
      <aside className="w-[400px] shrink-0 border-l border-line bg-panel-2 flex flex-col">
        <div role="tablist" aria-label="inspector" className="flex flex-wrap border-b border-line px-2 pt-1 shrink-0">
          {INSPECTOR_TABS.map((t) => (
            <button
              key={t.tab}
              role="tab"
              aria-selected={tab === t.tab}
              className={`px-3 py-2 text-[12.5px] border-b-2 -mb-px outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 ${
                tab === t.tab ? "border-accent text-ink" : "border-transparent text-mute hover:text-ink"
              }`}
              onClick={() => setTab(t.tab)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-auto px-4 py-4">
          {tab === "browser" && <BrowserInspector data={data} status={status} />}
          {tab === "files" && <FilesInspector data={data} status={status} />}
          {tab === "memory" && <MemoryInspector data={data} />}
          {tab === "permissions" && <PermissionsInspector data={data} />}
          {tab === "lifecycle" && <LifecycleInspector data={data} onExpireNow={onExpireNow} />}
          {tab === "receipt" && <ReceiptInspector data={data} />}
        </div>
      </aside>
    </div>
  );
}
