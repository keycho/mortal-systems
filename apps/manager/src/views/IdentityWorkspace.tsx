import { useState } from "react";
import type {
  ActivityEvent,
  DestructionReport,
  IdentityManifest,
  IdentitySummary,
  RuntimeStatus,
} from "@mortal/schema";
import { formatRemaining } from "@mortal/schema";
import { ActivityLog, DestructionReportView } from "../components/ActivityLog.js";
import { formatBytes, spaceLabel, StatePill } from "../components/IdentityRow.js";
import { PermissionRows, Tombstone } from "../components/PermissionRows.js";
import { EnforcementBadge } from "../components/EnforcementBadge.js";

export type WorkspaceTab =
  | "overview"
  | "activity"
  | "files"
  | "memory"
  | "permissions"
  | "lifecycle"
  | "receipt";

const TABS: Array<{ tab: WorkspaceTab; label: string }> = [
  { tab: "overview", label: "overview" },
  { tab: "activity", label: "activity" },
  { tab: "files", label: "files" },
  { tab: "memory", label: "memory" },
  { tab: "permissions", label: "permissions" },
  { tab: "lifecycle", label: "lifecycle" },
  { tab: "receipt", label: "destruction receipt" },
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

/* ---------------------------------------------------------------- */
/* shared card primitives                                            */
/* ---------------------------------------------------------------- */

function Card({
  title,
  children,
  span2 = false,
}: {
  title: string;
  children: React.ReactNode;
  span2?: boolean;
}) {
  return (
    <section
      className={`border border-line bg-panel px-5 py-4 flex flex-col gap-3 ${
        span2 ? "xl:col-span-2" : ""
      }`}
    >
      <h3 className="text-[11px] tracking-[0.18em] uppercase text-mute">{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 text-[13px]">
      <span className="text-mute w-36 shrink-0">{label}</span>
      <span className={`${mono ? "font-mono text-[12.5px]" : ""} break-all`}>{value}</span>
    </div>
  );
}

/** what the manager can honestly say about data it cannot read */
function CannotRead({ what, deletedAt }: { what: string; deletedAt: string }) {
  return (
    <p
      className="text-[12.5px] text-mute border border-dashed border-line px-4 py-3 leading-relaxed max-w-2xl"
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
/* overview tab: structured cards                                    */
/* ---------------------------------------------------------------- */

export function OverviewTab({
  data,
  status,
}: {
  data: WorkspaceData;
  status: RuntimeStatus | null;
}) {
  const { summary, manifest } = data;
  const [showRaw, setShowRaw] = useState(false);
  const root = status?.root ?? "<runtime root>";

  if (manifest === null) {
    return (
      <div className="flex flex-col gap-4">
        <Tombstone />
        <p className="text-[12.5px] text-mute">
          the destruction receipt tab holds the full report of what was removed.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="browser">
          <Fact label="status" value={browserStatusLine(summary.state)} mono={false} />
          <Fact
            label="engine"
            value={
              status?.defaultBrowser !== null && status !== undefined
                ? `${status?.defaultBrowser?.kind ?? "—"} ${status?.defaultBrowser?.version ?? ""}`.trim()
                : "none detected"
            }
          />
          <Fact label="profile" value={`${root}/profiles/${summary.id}`} />
          <p className="text-[12px] text-faint">
            a real chromium instance on its own profile — never a webview inside the manager.
          </p>
        </Card>

        <Card title="lifecycle">
          <Fact label="lifetime" value={manifest.lifecycle.lifetime} />
          <Fact label="on expiry" value={manifest.lifecycle.onExpiry} />
          {manifest.lifecycle.expiresAt !== null && (
            <Fact label="expires" value={new Date(manifest.lifecycle.expiresAt).toLocaleString()} />
          )}
          {summary.lastLaunchedAt !== null && (
            <Fact label="last launched" value={new Date(summary.lastLaunchedAt).toLocaleString()} />
          )}
        </Card>

        <Card title="memory">
          <Fact label="scope" value={manifest.permissions.memoryScope.value} />
          <Fact label="ai provider" value={manifest.ai.provider} />
          <Fact label="history" value={manifest.ai.historyRetention} />
          <p className="text-[12px] text-faint">
            notes and ai context stay inside this identity; the manager cannot read them.
          </p>
        </Card>

        <Card title="files">
          <Fact label="storage" value={formatBytes(summary.storageBytes)} />
          <Fact label="partition" value={`${root}/files/${summary.id}`} />
          <p className="text-[12px] text-faint">
            removed at steps D3/D4 of the destruction contract.
          </p>
        </Card>

        <Card title="guarantees" span2>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {(
              [
                ["filesystem", manifest.permissions.filesystem],
                ["memory", manifest.permissions.memoryScope],
                ["wallet", manifest.permissions.wallet],
                ["email", manifest.permissions.email],
                ["network", manifest.permissions.network],
                ["history", manifest.privacy.retainHistory],
              ] as const
            ).map(([label, perm]) => (
              <span key={label} className="flex items-center gap-2 text-[12.5px]">
                <span className="text-mute">{label}</span>
                <EnforcementBadge enforcement={perm.enforcement} />
              </span>
            ))}
          </div>
          <p className="text-[12px] text-faint">
            full values and what each level means: the permissions tab.
          </p>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <span className="font-mono text-[11.5px] text-faint">{summary.id}</span>
        {manifest.blueprint.source !== null && (
          <span className="text-[12px] text-mute">
            from {manifest.blueprint.source} v{manifest.blueprint.version}
            {manifest.blueprint.signature === null ? " · unsigned" : ""}
          </span>
        )}
        <button
          className="ml-auto border border-line px-3.5 py-1.5 text-[12px] hover:bg-panel-3 transition-colors"
          onClick={() => setShowRaw((v) => !v)}
        >
          {showRaw ? "hide" : "show"} manifest json
        </button>
      </div>
      {showRaw && (
        <pre className="font-mono text-[11px] text-mute border border-line bg-panel p-3 overflow-auto max-h-80">
          {JSON.stringify(manifest, null, 2)}
        </pre>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* files / memory / permissions tabs                                 */
/* ---------------------------------------------------------------- */

export function FilesTab({ data, status }: { data: WorkspaceData; status: RuntimeStatus | null }) {
  const { summary, manifest } = data;
  if (manifest === null) return <Tombstone />;
  const root = status?.root ?? "<runtime root>";
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <Card title="partition">
        <Fact label="browser profile" value={`${root}/profiles/${summary.id}`} />
        <Fact label="identity files" value={`${root}/files/${summary.id}`} />
        <Fact label="companion" value={`${root}/companion-instances/${summary.id}`} />
        <Fact label="storage" value={`${summary.storageBytes} bytes on disk`} />
      </Card>
      <Card title="what is enforced">
        <p className="text-[13px] text-mute leading-relaxed">
          filesystem access is{" "}
          <span className="text-ink font-mono text-[12.5px]">
            {manifest.permissions.filesystem.value}
          </span>{" "}
          ({manifest.permissions.filesystem.enforcement}): each identity gets its own on-disk
          partition, and destroy removes it (steps D3/D4).
        </p>
      </Card>
      <CannotRead what="identity files" deletedAt="steps D3/D4" />
    </div>
  );
}

export function MemoryTab({ data }: { data: WorkspaceData }) {
  const { manifest } = data;
  if (manifest === null) return <Tombstone />;
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
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
        <div className="text-[12.5px] text-mute whitespace-pre-wrap border border-line bg-panel-2 p-3 font-mono leading-relaxed">
          {manifest.ai.systemInstructions || "no system instructions."}
        </div>
        <Fact label="provider" value={manifest.ai.provider} />
        <Fact label="history retention" value={manifest.ai.historyRetention} />
      </Card>
      <CannotRead what="notes or ai messages" deletedAt="step D5" />
    </div>
  );
}

export function PermissionsTab({ data }: { data: WorkspaceData }) {
  if (data.manifest === null) return <Tombstone />;
  return <PermissionRows manifest={data.manifest} />;
}

/* ---------------------------------------------------------------- */
/* lifecycle tab: state machine + destruction progress               */
/* ---------------------------------------------------------------- */

const LIFECYCLE_EVENTS = new Set([
  "created",
  "expiry_scheduled",
  "expiring",
  "expired_late",
  "suspended",
  "resumed",
  "archived",
  "destroy_started",
  "destroy_step",
  "destroyed",
]);

/** the happy path through the machine, adjusted for the identity's expiry action */
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
                className={`font-mono text-[12px] px-3 py-1.5 border rounded-sm ${
                  current ? "font-medium" : ""
                }`}
                style={{
                  color: current
                    ? "var(--ink-app)"
                    : reached
                      ? "var(--mute-app)"
                      : "var(--faint-app)",
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
        <p className="text-[12.5px] text-mute">
          currently <span className="font-mono">{MACHINE_LABEL[summary.state] ?? summary.state}</span> — a
          branch off the scheduled path (suspend and resume are always available before expiry).
        </p>
      )}
    </div>
  );
}

export function LifecycleTab({
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
  const lifecycleEvents = data.events.filter((e) => LIFECYCLE_EVENTS.has(e.event));
  const destroySteps = data.events
    .filter((e) => e.event === "destroy_step")
    .map((e) => ({
      step: String(e.detail?.step ?? ""),
      ok: e.detail?.ok === true,
    }));

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <Card title="state machine">
        <StateMachine summary={summary} />
      </Card>

      {manifest !== null && (
        <Card title="schedule">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            <Fact label="lifetime" value={manifest.lifecycle.lifetime} />
            <Fact label="on expiry" value={manifest.lifecycle.onExpiry} />
            {summary.expiresAt !== null && (
              <Fact label="expires" value={new Date(summary.expiresAt).toLocaleString()} />
            )}
            {remaining !== null && <Fact label="remaining" value={remaining} />}
          </div>
          <p className="text-[12.5px] text-mute leading-relaxed">
            when the deadline passes, a running identity gets a 60 second grace notice in its
            companion, then the browser is halted and the expiry action runs. an expiry missed
            while the runtime was stopped is honored at next startup and logged as expired_late.
          </p>
          {summary.expiresAt !== null &&
            summary.state !== "destroying" &&
            onExpireNow !== undefined && (
              <button
                className="border border-line px-3.5 py-1.5 text-[12.5px] self-start hover:bg-panel-3 transition-colors"
                onClick={() => onExpireNow(summary.id)}
              >
                expire now
              </button>
            )}
        </Card>
      )}

      {destroySteps.length > 0 && (
        <Card title="destruction progress">
          <div className="flex items-center flex-wrap gap-2">
            {(["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"] as const).map((step) => {
              const done = destroySteps.find((s) => s.step === step);
              return (
                <span
                  key={step}
                  className="font-mono text-[12px] px-2.5 py-1 border rounded-sm"
                  style={{
                    color:
                      done === undefined
                        ? "var(--faint-app)"
                        : done.ok
                          ? "var(--state-active)"
                          : "var(--danger)",
                    borderColor: done === undefined ? "var(--line-1)" : "var(--line-2)",
                    background: done === undefined ? "transparent" : "var(--surface-2)",
                  }}
                >
                  {step} {done === undefined ? "" : done.ok ? "✓" : "✗"}
                </span>
              );
            })}
          </div>
          <p className="text-[12px] text-faint">
            the full report with what each step removed: the destruction receipt tab.
          </p>
        </Card>
      )}

      {manifest === null && destroySteps.length === 0 && <Tombstone />}

      <Card title="lifecycle events">
        <ActivityLog events={lifecycleEvents} />
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* receipt tab                                                       */
/* ---------------------------------------------------------------- */

export function ReceiptTab({ data }: { data: WorkspaceData }) {
  const report = destructionReportFrom(data.events);
  if (report === null) {
    return (
      <div
        className="border border-dashed border-line px-5 py-4 max-w-lg text-[13px] text-mute"
        data-testid="no-receipt"
      >
        no receipt. this identity has not been destroyed.
      </div>
    );
  }
  return (
    <div className="max-w-4xl">
      <DestructionReportView report={report} />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* the workspace shell: strong header + tabs                         */
/* ---------------------------------------------------------------- */

export function IdentityWorkspace({
  data,
  status,
  onBack,
  onLaunch,
  onSuspend,
  onResume,
  onExpireNow,
  onDestroy,
}: {
  data: WorkspaceData;
  status: RuntimeStatus | null;
  onBack: () => void;
  onLaunch: (id: string) => void;
  onSuspend: (id: string) => void;
  onResume: (id: string) => void;
  onExpireNow: (id: string) => void;
  onDestroy: (id: string) => void;
}) {
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [confirming, setConfirming] = useState(false);
  const { summary } = data;
  const destroyed = summary.state === "destroyed";
  const remaining =
    summary.expiresAt !== null && !destroyed
      ? formatRemaining(Date.parse(summary.expiresAt) - Date.now())
      : null;

  return (
    <div className="flex flex-col h-full">
      <button
        className="self-start text-[12.5px] text-mute hover:text-ink transition-colors mb-4"
        onClick={onBack}
      >
        ← identities
      </button>

      {/* selected-identity header */}
      <header className="border border-line bg-panel relative pl-6 pr-5 py-5 flex items-center gap-6">
        <div
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ background: summary.color }}
        />
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-medium leading-tight truncate">{summary.name}</h1>
            <StatePill state={summary.state} />
          </div>
          <div className="flex items-center gap-3 text-[12px] text-mute">
            <span className="font-mono uppercase tracking-wider text-faint">
              {spaceLabel(summary.spaceNumber)}
            </span>
            <span>{browserStatusLine(summary.state)}</span>
            {summary.blueprint !== null && (
              <span className="hidden lg:inline">
                from {summary.blueprint.source} v{summary.blueprint.version}
              </span>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-5 shrink-0">
          {remaining !== null && (
            <div className="flex flex-col items-end">
              <span className="font-mono tabular-nums text-[17px]">{remaining}</span>
              <span className="text-[11px] text-faint">until {summary.onExpiry}</span>
            </div>
          )}
          {!destroyed && (
            <div className="flex gap-2">
              {(summary.state === "created" ||
                summary.state === "ready") && (
                <button
                  className="bg-accent/10 border border-accent/40 text-accent px-4 py-2 text-[13px] font-medium hover:bg-accent/15 transition-colors"
                  onClick={() => onLaunch(summary.id)}
                >
                  launch
                </button>
              )}
              {summary.state === "suspended" && (
                <button
                  className="bg-accent/10 border border-accent/40 text-accent px-4 py-2 text-[13px] font-medium hover:bg-accent/15 transition-colors"
                  onClick={() => onResume(summary.id)}
                >
                  resume
                </button>
              )}
              {summary.state === "running" && (
                <button
                  className="border border-line px-4 py-2 text-[13px] hover:bg-panel-3 transition-colors"
                  onClick={() => onSuspend(summary.id)}
                >
                  suspend
                </button>
              )}
              <button
                className="border border-line px-4 py-2 text-[13px] text-mute hover:text-danger hover:border-danger/40 transition-colors"
                onClick={() => setConfirming(true)}
              >
                destroy
              </button>
            </div>
          )}
        </div>
      </header>

      {confirming && (
        <div className="border border-danger/40 border-t-0 bg-panel-2 px-5 py-3.5 text-[13px] flex items-center gap-4">
          <span className="text-mute">
            destroy this identity and its data on this machine? this cannot be undone.
          </span>
          <button
            className="border border-danger text-danger px-3 py-1.5 hover:bg-danger/10 transition-colors"
            onClick={() => {
              setConfirming(false);
              onDestroy(summary.id);
            }}
          >
            destroy
          </button>
          <button
            className="border border-line px-3 py-1.5 hover:bg-panel-3 transition-colors"
            onClick={() => setConfirming(false)}
          >
            keep
          </button>
        </div>
      )}

      <div role="tablist" aria-label="identity workspace" className="flex gap-1 border-b border-line mt-5">
        {TABS.map((t) => (
          <button
            key={t.tab}
            role="tab"
            aria-selected={tab === t.tab}
            className={`px-3.5 py-2.5 text-[13px] border-b-2 -mb-px transition-colors ${
              tab === t.tab
                ? "border-accent text-ink"
                : "border-transparent text-mute hover:text-ink"
            }`}
            onClick={() => setTab(t.tab)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto pt-5 pr-1">
        {tab === "overview" && <OverviewTab data={data} status={status} />}
        {tab === "activity" && (
          <div className="max-w-3xl">
            <ActivityLog events={data.events} />
          </div>
        )}
        {tab === "files" && <FilesTab data={data} status={status} />}
        {tab === "memory" && <MemoryTab data={data} />}
        {tab === "permissions" && <PermissionsTab data={data} />}
        {tab === "lifecycle" && <LifecycleTab data={data} onExpireNow={onExpireNow} />}
        {tab === "receipt" && <ReceiptTab data={data} />}
      </div>
    </div>
  );
}
