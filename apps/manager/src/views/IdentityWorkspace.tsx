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
import {
  Brain,
  Clock,
  Globe,
  HardDrive,
  MoreHorizontal,
  ShieldCheck,
} from "lucide-react";
import { ActivityLog, DestructionReportView, groupEvents } from "../components/ActivityLog.js";
import { formatBytes, spaceLabel, StatePill, STATE_COLOR } from "../components/IdentityRow.js";
import { EnforcementBadge } from "../components/EnforcementBadge.js";
import { PermissionRows, Tombstone } from "../components/PermissionRows.js";
import { Button, Menu, Modal, PathValue, RelativeTime, shortId } from "../components/ui.js";

export type WorkspaceTab =
  | "overview"
  | "activity"
  | "files"
  | "memory"
  | "permissions"
  | "lifecycle"
  | "receipt";

const TABS: WorkspaceTab[] = [
  "overview",
  "activity",
  "files",
  "memory",
  "permissions",
  "lifecycle",
  "receipt",
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
/* module card: icon, title, one prominent value, explanation        */
/* ---------------------------------------------------------------- */

function Module({
  icon,
  title,
  value,
  explanation,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  explanation: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-surface px-5 py-4 flex flex-col gap-2">
      <div className="flex items-center gap-2.5 text-sec">
        {icon}
        <h3 className="text-[13.5px]">{title}</h3>
      </div>
      <span className="text-[17px] font-medium leading-snug">{value}</span>
      <p className="text-[13px] text-sec leading-relaxed">{explanation}</p>
      {children}
    </section>
  );
}

function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details>
      <summary className="cursor-pointer text-[12.5px] text-mute hover:text-sec select-none">
        {label}
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}

function browserStatusLine(state: IdentitySummary["state"]): string {
  switch (state) {
    case "running":
      return "running in an isolated profile";
    case "expiring":
      return "running · closing soon";
    case "suspended":
      return "closed · data kept";
    case "destroying":
      return "halting";
    case "destroyed":
      return "no browser";
    default:
      return "not launched";
  }
}

/** what the manager can honestly say about data it cannot read */
function CannotRead({ what, deletedAt }: { what: string; deletedAt: string }) {
  return (
    <p className="text-[13px] text-sec rounded-xl bg-surface px-5 py-4 leading-relaxed" data-testid="cannot-read">
      the manager does not read {what} — no rpc method exposes their contents. they belong to the
      identity and are served only to its own companion. on destroy they are removed at {deletedAt}{" "}
      of the destruction contract.
    </p>
  );
}

/* ---------------------------------------------------------------- */
/* tabs                                                              */
/* ---------------------------------------------------------------- */

export function OverviewTab({
  data,
  status,
  recentEvents,
}: {
  data: WorkspaceData;
  status: RuntimeStatus | null;
  recentEvents: ActivityEvent[];
}) {
  const { summary, manifest } = data;
  const root = status?.root ?? null;
  if (manifest === null) {
    return (
      <div className="flex flex-col gap-4">
        <Tombstone />
        <p className="text-[13px] text-sec">the receipt tab holds the full destruction report.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Module
          icon={<Globe size={15} strokeWidth={1.75} aria-hidden />}
          title="browser"
          value={
            status?.defaultBrowser != null
              ? `${status.defaultBrowser.kind} ${status.defaultBrowser.version?.split(".")[0] ?? ""}`.trim()
              : "no browser detected"
          }
          explanation={`${browserStatusLine(summary.state)} — a real chromium process, never a webview inside the manager.`}
        >
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              disabled
              title="needs a runtime rpc method that is not exposed yet — the manager will not pretend"
            >
              focus browser
            </Button>
            {root !== null && (
              <Disclosure label="profile path">
                <PathValue path={`${root}/profiles/${summary.id}`} />
              </Disclosure>
            )}
          </div>
        </Module>

        <Module
          icon={<Clock size={15} strokeWidth={1.75} aria-hidden />}
          title="lifecycle"
          value={
            summary.expiresAt !== null
              ? `${formatRemaining(Date.parse(summary.expiresAt) - Date.now())} remaining`
              : "persistent"
          }
          explanation={
            summary.expiresAt !== null
              ? `expires ${new Date(summary.expiresAt).toLocaleString()} · then ${summary.onExpiry}`
              : "no deadline. this identity lives until you end it."
          }
        />

        <Module
          icon={<Brain size={15} strokeWidth={1.75} aria-hidden />}
          title="memory"
          value={manifest.permissions.memoryScope.value}
          explanation="notes and ai context stay inside this identity; the manager cannot read them."
        />

        <Module
          icon={<HardDrive size={15} strokeWidth={1.75} aria-hidden />}
          title="managed storage"
          value={formatBytes(summary.storageBytes)}
          explanation="everything this identity has written inside its own partition. removed on destroy."
        />
      </div>

      <section className="rounded-xl bg-surface px-5 py-4 flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5 text-sec">
          <ShieldCheck size={15} strokeWidth={1.75} aria-hidden />
          <h3 className="text-[13.5px]">guarantees</h3>
        </div>
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
            <span key={label} className="flex items-center gap-2 text-[13px] text-sec">
              {label}
              <EnforcementBadge enforcement={perm.enforcement} />
            </span>
          ))}
        </div>
        <p className="text-[12.5px] text-mute">full values and test ids: the permissions tab.</p>
      </section>

      {recentEvents.length > 0 && (
        <section className="rounded-xl bg-surface px-5 py-4 flex flex-col gap-3">
          <h3 className="text-[13.5px] text-sec">recent activity</h3>
          <div className="flex flex-col gap-2">
            {groupEvents(recentEvents.slice(0, 6)).map((item, i) =>
              item.kind === "destruction" ? (
                <div key={`d-${i}`} className="flex items-baseline gap-3 text-[13.5px]">
                  <span>destruction completed</span>
                  <span className="ml-auto">
                    {item.events.length > 0 && (
                      <RelativeTime iso={item.events[item.events.length - 1]!.createdAt} />
                    )}
                  </span>
                </div>
              ) : (
                <div key={item.event.id} className="flex items-baseline gap-3 text-[13.5px]">
                  <span>{String(item.event.event).replace(/_/g, " ")}</span>
                  <span className="ml-auto">
                    <RelativeTime iso={item.event.createdAt} />
                  </span>
                </div>
              )
            )}
          </div>
        </section>
      )}

      <Disclosure label="view manifest json">
        <pre className="font-mono text-[12px] text-sec rounded-xl bg-surface p-4 overflow-auto max-h-80">
          {JSON.stringify(manifest, null, 2)}
        </pre>
      </Disclosure>
    </div>
  );
}

export function FilesTab({ data, status }: { data: WorkspaceData; status: RuntimeStatus | null }) {
  const { summary, manifest } = data;
  if (manifest === null) return <Tombstone />;
  const root = status?.root ?? null;
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <Module
        icon={<HardDrive size={15} strokeWidth={1.75} aria-hidden />}
        title="managed storage"
        value={`${summary.storageBytes} bytes on disk`}
        explanation="downloads and files land inside this identity's own partition, enforced by the runtime, and destroy removes it (steps D3/D4)."
      >
        {root !== null && (
          <Disclosure label="show partition paths">
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline gap-3 text-[13px]">
                <span className="text-sec w-24 shrink-0">profile</span>
                <PathValue path={`${root}/profiles/${summary.id}`} />
              </div>
              <div className="flex items-baseline gap-3 text-[13px]">
                <span className="text-sec w-24 shrink-0">files</span>
                <PathValue path={`${root}/files/${summary.id}`} />
              </div>
              <div className="flex items-baseline gap-3 text-[13px]">
                <span className="text-sec w-24 shrink-0">companion</span>
                <PathValue path={`${root}/companion-instances/${summary.id}`} />
              </div>
            </div>
          </Disclosure>
        )}
      </Module>
      <p className="text-[13px] text-sec rounded-xl bg-surface px-5 py-4 leading-relaxed">
        a per-file listing (type, size, modified) needs a runtime rpc method that is not exposed
        yet — this screen shows the real boundary and totals instead of a fabricated file tree.
      </p>
      <CannotRead what="identity files" deletedAt="steps D3/D4" />
    </div>
  );
}

export function MemoryTab({ data }: { data: WorkspaceData }) {
  const { manifest } = data;
  if (manifest === null) return <Tombstone />;
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <Module
        icon={<Brain size={15} strokeWidth={1.75} aria-hidden />}
        title="memory scope"
        value={manifest.permissions.memoryScope.value}
        explanation="notes and ai context are readable and writable only with this identity's own token. cross-identity access is refused by the runtime."
      >
        <Disclosure label="ai configuration">
          <div className="flex flex-col gap-2">
            <div className="text-[12.5px] text-sec whitespace-pre-wrap rounded-lg bg-elevated p-3 font-mono leading-relaxed max-h-48 overflow-auto">
              {manifest.ai.systemInstructions || "no system instructions."}
            </div>
            <span className="text-[13px] text-sec">
              provider <span className="font-mono text-[12.5px]">{manifest.ai.provider}</span> ·
              history <span className="font-mono text-[12.5px]">{manifest.ai.historyRetention}</span>
            </span>
          </div>
        </Disclosure>
      </Module>
      <CannotRead what="notes or ai messages" deletedAt="step D5" />
    </div>
  );
}

export function PermissionsTab({ data }: { data: WorkspaceData }) {
  if (data.manifest === null) return <Tombstone />;
  return <PermissionRows manifest={data.manifest} />;
}

/* lifecycle: state machine + schedule + destruction progress */

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
                className={`text-[13px] px-3.5 py-1.5 rounded-full ${current ? "font-medium" : ""}`}
                style={{
                  color: current
                    ? "var(--text-primary)"
                    : reached
                      ? "var(--text-secondary)"
                      : "var(--text-muted)",
                  background: current
                    ? "var(--bg-elevated)"
                    : reached
                      ? "var(--bg-surface-hover)"
                      : "transparent",
                }}
                aria-current={current ? "step" : undefined}
              >
                {MACHINE_LABEL[state]}
              </span>
              {i < path.length - 1 && (
                <span aria-hidden className="w-4 h-px mx-0.5" style={{ background: "var(--border-strong)" }} />
              )}
            </span>
          );
        })}
      </div>
      {offPath && (
        <p className="text-[13px] text-sec">
          currently {MACHINE_LABEL[summary.state] ?? summary.state} — a branch off the scheduled
          path (suspend and resume are always available before expiry).
        </p>
      )}
    </div>
  );
}

export function DestructionProgress({ events }: { events: ActivityEvent[] }) {
  const steps = events
    .filter((e) => e.event === "destroy_step")
    .map((e) => ({ step: String(e.detail?.step ?? ""), ok: e.detail?.ok === true }));
  if (steps.length === 0) return null;
  return (
    <section className="rounded-xl bg-surface px-5 py-4 flex flex-col gap-3">
      <h3 className="text-[13.5px] text-sec">destruction progress</h3>
      <div className="flex items-center flex-wrap gap-2">
        {(["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"] as const).map((step) => {
          const done = steps.find((s) => s.step === step);
          return (
            <span
              key={step}
              className="font-mono text-[12.5px] px-3 py-1 rounded-full"
              style={{
                color:
                  done === undefined ? "var(--text-muted)" : done.ok ? "var(--app-active)" : "var(--app-danger)",
                background: done === undefined ? "transparent" : "var(--bg-elevated)",
              }}
            >
              {step} {done === undefined ? "" : done.ok ? "✓" : "✗"}
            </span>
          );
        })}
      </div>
      <p className="text-[12.5px] text-mute">full report: the receipt tab.</p>
    </section>
  );
}

export function LifecycleTab({
  data,
  onExpireNow,
}: {
  data: WorkspaceData;
  onExpireNow?: (id: string) => void;
}) {
  const { summary, manifest } = data;
  if (manifest === null && destructionReportFrom(data.events) === null) return <Tombstone />;
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <section className="rounded-xl bg-surface px-5 py-4 flex flex-col gap-3">
        <h3 className="text-[13.5px] text-sec">state machine</h3>
        <StateMachine summary={summary} />
      </section>
      {manifest !== null && (
        <Module
          icon={<Clock size={15} strokeWidth={1.75} aria-hidden />}
          title="schedule"
          value={
            summary.expiresAt !== null
              ? `${formatRemaining(Date.parse(summary.expiresAt) - Date.now())} remaining`
              : "persistent"
          }
          explanation={
            summary.expiresAt !== null
              ? `lifetime ${manifest.lifecycle.lifetime} · expires ${new Date(summary.expiresAt).toLocaleString()} · then ${manifest.lifecycle.onExpiry}. a running identity gets a 60 second grace notice first; an expiry missed while the runtime was stopped is honored at next startup.`
              : "no deadline. suspend, expire or destroy are always available."
          }
        >
          {summary.expiresAt !== null && summary.state !== "destroying" && onExpireNow !== undefined && (
            <Button variant="secondary" size="sm" className="self-start" onClick={() => onExpireNow(summary.id)}>
              expire now
            </Button>
          )}
        </Module>
      )}
      <DestructionProgress events={data.events} />
    </div>
  );
}

export function ReceiptTab({ data }: { data: WorkspaceData }) {
  const report = destructionReportFrom(data.events);
  if (report === null) {
    return (
      <div className="rounded-xl bg-surface px-5 py-4 text-[13.5px] text-sec max-w-lg" data-testid="no-receipt">
        no receipt. this identity has not been destroyed.
      </div>
    );
  }
  return (
    <div className="max-w-3xl">
      <DestructionReportView report={report} />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* the workspace                                                     */
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
  onLaunch: (id: string) => void;
  onSuspend: (id: string) => void;
  onResume: (id: string) => void;
  onExpireNow: (id: string) => void;
  onDestroy: (id: string) => void;
}) {
  const destroyed = data.summary.state === "destroyed";
  const [tab, setTab] = useState<WorkspaceTab>(destroyed ? "receipt" : "overview");
  const [confirming, setConfirming] = useState(false);
  const { summary, manifest } = data;
  const remaining =
    summary.expiresAt !== null && !destroyed
      ? formatRemaining(Date.parse(summary.expiresAt) - Date.now())
      : null;
  const blueprint =
    summary.blueprint !== null
      ? (blueprints.find((b) => b.source === summary.blueprint?.source) ?? null)
      : null;
  const purpose =
    blueprint?.description ??
    (manifest !== null && manifest.ai.systemInstructions ? null : "created by hand");

  return (
    <div className="flex-1 min-w-0 overflow-auto">
      <div className="max-w-4xl mx-auto px-8 py-7 flex flex-col gap-6">
        {/* header */}
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-4">
            <span
              aria-hidden
              className="w-3.5 h-3.5 rounded-full shrink-0"
              style={{ background: summary.color }}
            />
            <h1 className="text-[23px] font-medium leading-tight truncate">{summary.name}</h1>
            <StatePill state={summary.state} />
            <div className="ml-auto flex items-center gap-2.5 shrink-0">
              {!destroyed && (
                <>
                  <Button
                    variant="secondary"
                    disabled
                    title="needs a runtime rpc method that is not exposed yet — the manager will not pretend"
                  >
                    focus browser
                  </Button>
                  {(summary.state === "created" || summary.state === "ready") && (
                    <Button variant="primary" onClick={() => onLaunch(summary.id)}>
                      launch
                    </Button>
                  )}
                  {summary.state === "suspended" && (
                    <Button variant="primary" onClick={() => onResume(summary.id)}>
                      resume
                    </Button>
                  )}
                  {summary.state === "running" && (
                    <Button variant="secondary" onClick={() => onSuspend(summary.id)}>
                      suspend
                    </Button>
                  )}
                  <Menu
                    label={<MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />}
                    items={[
                      ...(summary.expiresAt !== null && summary.state !== "destroying"
                        ? [{ label: "expire now", onSelect: () => onExpireNow(summary.id) }]
                        : []),
                      { label: "destroy identity…", danger: true, onSelect: () => setConfirming(true) },
                    ]}
                  />
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 text-[13px] text-sec flex-wrap pl-7">
            <span className="font-mono text-[12px] text-mute" title={summary.id}>
              {shortId(summary.id)}
            </span>
            <span className="text-mute" title={spaceLabel(summary.spaceNumber)}>
              {spaceLabel(summary.spaceNumber)}
            </span>
            <span style={{ color: STATE_COLOR[summary.state] }}>{browserStatusLine(summary.state)}</span>
            {remaining !== null && (
              <span className="font-mono tabular-nums text-ink">
                {remaining} · then {summary.onExpiry}
              </span>
            )}
          </div>
          {purpose !== null && purpose !== "created by hand" && (
            <p className="text-[14px] text-sec leading-relaxed pl-7 max-w-2xl">{purpose}</p>
          )}
        </header>

        {/* tabs */}
        <div role="tablist" aria-label="identity workspace" className="flex gap-1 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`px-3.5 h-9 rounded-lg text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                tab === t ? "bg-elevated text-ink" : "text-sec hover:text-ink hover:bg-surface"
              }`}
              onClick={() => setTab(t)}
            >
              {t === "receipt" ? "receipt" : t}
            </button>
          ))}
        </div>

        {/* content */}
        {tab === "overview" && (
          <OverviewTab data={data} status={status} recentEvents={data.events.slice(0, 10)} />
        )}
        {tab === "activity" && (
          <div className="max-w-3xl">
            <ActivityLog events={data.events} showReport={false} />
          </div>
        )}
        {tab === "files" && <FilesTab data={data} status={status} />}
        {tab === "memory" && <MemoryTab data={data} />}
        {tab === "permissions" && <PermissionsTab data={data} />}
        {tab === "lifecycle" && <LifecycleTab data={data} onExpireNow={onExpireNow} />}
        {tab === "receipt" && <ReceiptTab data={data} />}
      </div>

      {confirming && (
        <Modal title="destroy this identity?" onClose={() => setConfirming(false)}>
          <p className="text-[13.5px] text-sec leading-relaxed">
            {summary.name} and all of its managed data on this machine — browser profile, files,
            notes and ai context — will be removed by the destruction contract. a receipt is kept.
            this cannot be undone.
          </p>
          <div className="flex justify-end gap-2.5 pt-1">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              keep
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirming(false);
                onDestroy(summary.id);
              }}
            >
              destroy
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
