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
import { IdentityRow, spaceLabel, STATE_LABEL } from "../components/IdentityRow.js";
import { PermissionRows, Tombstone } from "../components/PermissionRows.js";

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[10px] tracking-widest uppercase text-mute">{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 text-[12px]">
      <span className="text-mute w-32 shrink-0">{label}</span>
      <span className={mono ? "font-mono" : ""}>{value}</span>
    </div>
  );
}

/** what the manager can honestly say about data it cannot read */
function CannotRead({ what, deletedAt }: { what: string; deletedAt: string }) {
  return (
    <p className="text-[11px] text-mute border border-line p-3 leading-relaxed" data-testid="cannot-read">
      the manager does not read {what} — no rpc method exposes their contents. they belong to the
      identity and are served only to its own companion. on destroy they are removed at {deletedAt}{" "}
      of the destruction contract.
    </p>
  );
}

export function OverviewTab({ data }: { data: WorkspaceData }) {
  const { summary, manifest } = data;
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <Section title="identity">
        <Fact label="id" value={summary.id} />
        <Fact label="designation" value={spaceLabel(summary.spaceNumber)} />
        <Fact label="state" value={STATE_LABEL[summary.state]} />
        <Fact label="storage" value={`${summary.storageBytes} bytes on disk`} />
        {summary.lastLaunchedAt !== null && (
          <Fact label="last launched" value={new Date(summary.lastLaunchedAt).toLocaleString()} />
        )}
      </Section>
      {manifest === null ? (
        <Tombstone />
      ) : (
        <>
          <Section title="lifecycle">
            <Fact label="lifetime" value={manifest.lifecycle.lifetime} />
            <Fact label="on expiry" value={manifest.lifecycle.onExpiry} />
            {manifest.lifecycle.expiresAt !== null && (
              <Fact label="expires" value={new Date(manifest.lifecycle.expiresAt).toLocaleString()} />
            )}
          </Section>
          {manifest.blueprint.source !== null && (
            <Section title="blueprint">
              <Fact
                label="origin"
                value={`${manifest.blueprint.source} v${manifest.blueprint.version}${
                  manifest.blueprint.signature === null ? " · unsigned" : ""
                }`}
              />
            </Section>
          )}
          <button
            className="border border-line px-3 py-1 text-[11px] self-start hover:bg-panel-2"
            onClick={() => setShowRaw((v) => !v)}
          >
            {showRaw ? "hide" : "show"} manifest json
          </button>
          {showRaw && (
            <pre className="font-mono text-[10px] text-mute border border-line p-2 overflow-auto max-h-72">
              {JSON.stringify(manifest, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

export function FilesTab({ data, status }: { data: WorkspaceData; status: RuntimeStatus | null }) {
  const { summary, manifest } = data;
  if (manifest === null) return <Tombstone />;
  const root = status?.root ?? "<runtime root>";
  return (
    <div className="flex flex-col gap-5">
      <Section title="partition">
        <Fact label="browser profile" value={`${root}/profiles/${summary.id}`} />
        <Fact label="identity files" value={`${root}/files/${summary.id}`} />
        <Fact label="companion" value={`${root}/companion-instances/${summary.id}`} />
        <Fact label="storage" value={`${summary.storageBytes} bytes on disk`} />
      </Section>
      <Section title="what is enforced">
        <p className="text-[11px] text-mute leading-relaxed">
          filesystem access is <span className="text-ink">{manifest.permissions.filesystem.value}</span>{" "}
          ({manifest.permissions.filesystem.enforcement}): each identity gets its own on-disk
          partition, and destroy removes it (steps D3/D4).
        </p>
      </Section>
      <CannotRead what="identity files" deletedAt="steps D3/D4" />
    </div>
  );
}

export function MemoryTab({ data }: { data: WorkspaceData }) {
  const { manifest } = data;
  if (manifest === null) return <Tombstone />;
  return (
    <div className="flex flex-col gap-5">
      <Section title="scope">
        <p className="text-[11px] text-mute leading-relaxed">
          memory scope is <span className="text-ink">{manifest.permissions.memoryScope.value}</span>{" "}
          ({manifest.permissions.memoryScope.enforcement}): notes and ai context live inside this
          identity and are never shared across identities.
        </p>
      </Section>
      <Section title="ai configuration">
        <div className="text-[11px] text-mute whitespace-pre-wrap border border-line p-2 font-mono">
          {manifest.ai.systemInstructions || "no system instructions."}
        </div>
        <Fact label="provider" value={manifest.ai.provider} />
        <Fact label="history retention" value={manifest.ai.historyRetention} />
      </Section>
      <CannotRead what="notes or ai messages" deletedAt="step D5" />
    </div>
  );
}

export function PermissionsTab({ data }: { data: WorkspaceData }) {
  if (data.manifest === null) return <Tombstone />;
  return <PermissionRows manifest={data.manifest} />;
}

const LIFECYCLE_EVENTS = new Set([
  "created",
  "expiry_scheduled",
  "expiring",
  "expired_late",
  "suspended",
  "resumed",
  "archived",
  "destroy_started",
  "destroyed",
]);

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
  return (
    <div className="flex flex-col gap-5">
      {manifest === null ? (
        <Tombstone />
      ) : (
        <>
          <Section title="schedule">
            <Fact label="lifetime" value={manifest.lifecycle.lifetime} />
            <Fact label="on expiry" value={manifest.lifecycle.onExpiry} />
            {summary.expiresAt !== null && (
              <Fact label="expires" value={new Date(summary.expiresAt).toLocaleString()} />
            )}
            {remaining !== null && <Fact label="remaining" value={remaining} />}
          </Section>
          <p className="text-[11px] text-mute leading-relaxed">
            when the deadline passes, a running identity gets a 60 second grace notice in its
            companion, then the browser is halted and the expiry action runs. an expiry missed while
            the runtime was stopped is honored at next startup and logged as expired_late.
          </p>
          {summary.expiresAt !== null &&
            summary.state !== "destroying" &&
            onExpireNow !== undefined && (
              <button
                className="border border-line px-3 py-1 text-[11px] self-start hover:bg-panel-2"
                onClick={() => onExpireNow(summary.id)}
              >
                expire now
              </button>
            )}
        </>
      )}
      <Section title="lifecycle events">
        <ActivityLog events={lifecycleEvents} />
      </Section>
    </div>
  );
}

export function ReceiptTab({ data }: { data: WorkspaceData }) {
  const report = destructionReportFrom(data.events);
  if (report === null) {
    return (
      <p className="text-[11px] text-mute" data-testid="no-receipt">
        no receipt. this identity has not been destroyed.
      </p>
    );
  }
  return <DestructionReportView report={report} />;
}

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

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center gap-3">
        <button
          className="border border-line px-3 py-1 text-[11px] text-mute hover:text-ink hover:bg-panel-2"
          onClick={onBack}
        >
          ← identities
        </button>
      </div>

      <IdentityRow
        summary={summary}
        onLaunch={destroyed ? undefined : onLaunch}
        onSuspend={destroyed ? undefined : onSuspend}
        onDestroy={destroyed ? undefined : () => setConfirming(true)}
      />
      {!destroyed && summary.state === "suspended" && (
        <button
          className="border border-line px-3 py-1 text-[11px] self-start hover:bg-panel-2"
          onClick={() => onResume(summary.id)}
        >
          resume
        </button>
      )}
      {confirming && (
        <div className="border border-danger/40 bg-panel-2 p-3 text-[11px] flex items-center gap-3">
          <span className="text-mute">
            destroy this identity and its data on this machine? this cannot be undone.
          </span>
          <button
            className="border border-danger text-danger px-2 py-1"
            onClick={() => {
              setConfirming(false);
              onDestroy(summary.id);
            }}
          >
            destroy
          </button>
          <button className="border border-line px-2 py-1" onClick={() => setConfirming(false)}>
            keep
          </button>
        </div>
      )}

      <div role="tablist" aria-label="identity workspace" className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.tab}
            role="tab"
            aria-selected={tab === t.tab}
            className={`px-3 py-2 text-[12px] border-b-2 -mb-px ${
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

      <div className="flex-1 overflow-auto pr-1">
        {tab === "overview" && <OverviewTab data={data} />}
        {tab === "activity" && <ActivityLog events={data.events} />}
        {tab === "files" && <FilesTab data={data} status={status} />}
        {tab === "memory" && <MemoryTab data={data} />}
        {tab === "permissions" && <PermissionsTab data={data} />}
        {tab === "lifecycle" && <LifecycleTab data={data} onExpireNow={onExpireNow} />}
        {tab === "receipt" && <ReceiptTab data={data} />}
      </div>
    </div>
  );
}
