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
import { MoreHorizontal } from "lucide-react";
import { ActivityLog, DestructionReportView } from "../components/ActivityLog.js";
import { STATE_LABEL } from "../components/IdentityRow.js";
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
/* quiet primitives: sections and definition rows, not card grids    */
/* ---------------------------------------------------------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[16px] font-medium">{title}</h2>
      {children}
    </section>
  );
}

function EnvRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline gap-6 text-[15px]">
      <span className="text-sec w-28 shrink-0">{label}</span>
      <span className="min-w-0">
        {value}
        {note !== undefined && <span className="text-mute"> · {note}</span>}
      </span>
    </div>
  );
}

function browserStatusLine(state: IdentitySummary["state"]): string {
  switch (state) {
    case "running":
      return "running";
    case "expiring":
      return "running · closing soon";
    case "suspended":
      return "closed · data kept";
    case "destroying":
      return "halting";
    case "destroyed":
      return "removed";
    default:
      return "not launched";
  }
}

function lifetimeLine(summary: IdentitySummary): string {
  if (summary.expiresAt === null) return "persistent";
  const remaining = formatRemaining(Date.parse(summary.expiresAt) - Date.now());
  return `${summary.onExpiry} in ${remaining}`;
}

/** what the manager can honestly say about data it cannot read */
function CannotRead({ what, deletedAt }: { what: string; deletedAt: string }) {
  return (
    <p className="text-[14px] text-sec leading-relaxed" data-testid="cannot-read">
      the manager does not read {what} — no rpc method exposes their contents. they belong to the
      identity and are served only to its own companion. on destroy they are removed at {deletedAt}{" "}
      of the destruction contract.
    </p>
  );
}

/* ---------------------------------------------------------------- */
/* the technical-details drawer                                      */
/* ---------------------------------------------------------------- */

export function TechnicalDetails({
  data,
  status,
}: {
  data: WorkspaceData;
  status: RuntimeStatus | null;
}) {
  const { summary, manifest } = data;
  const root = status?.root ?? null;
  const pid = data.events.find(
    (e) => e.event === "launched" && typeof e.detail?.pid === "number"
  )?.detail?.pid;
  return (
    <details className="rounded-2xl bg-surface" data-testid="technical-details">
      <summary className="cursor-pointer select-none px-5 py-3.5 text-[14px] text-sec hover:text-ink">
        technical details
      </summary>
      <div className="px-5 pb-5 flex flex-col gap-3 text-[13.5px]">
        <div className="flex items-baseline gap-6">
          <span className="text-sec w-28 shrink-0">identity id</span>
          <span className="font-mono text-[13px]">{summary.id}</span>
        </div>
        {typeof pid === "number" && (summary.state === "running" || summary.state === "expiring") && (
          <div className="flex items-baseline gap-6">
            <span className="text-sec w-28 shrink-0">browser pid</span>
            <span className="font-mono text-[13px]">{pid}</span>
          </div>
        )}
        {status?.defaultBrowser != null && (
          <div className="flex items-baseline gap-6">
            <span className="text-sec w-28 shrink-0">engine</span>
            <span className="font-mono text-[13px]">
              {status.defaultBrowser.kind} {status.defaultBrowser.version ?? ""}
            </span>
          </div>
        )}
        {root !== null && (
          <>
            <div className="flex items-baseline gap-6">
              <span className="text-sec w-28 shrink-0">profile</span>
              <PathValue path={`${root}/profiles/${summary.id}`} />
            </div>
            <div className="flex items-baseline gap-6">
              <span className="text-sec w-28 shrink-0">files</span>
              <PathValue path={`${root}/files/${summary.id}`} />
            </div>
            <div className="flex items-baseline gap-6">
              <span className="text-sec w-28 shrink-0">companion</span>
              <PathValue path={`${root}/companion-instances/${summary.id}`} />
            </div>
          </>
        )}
        {manifest !== null && (
          <details>
            <summary className="cursor-pointer text-[13px] text-mute hover:text-sec select-none">
              view manifest
            </summary>
            <pre className="font-mono text-[12px] text-sec rounded-xl bg-app p-4 mt-2 overflow-auto max-h-80">
              {JSON.stringify(manifest, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </details>
  );
}

/* ---------------------------------------------------------------- */
/* overview: one coherent workspace                                  */
/* ---------------------------------------------------------------- */

export function OverviewTab({
  data,
  status,
  purpose,
}: {
  data: WorkspaceData;
  status: RuntimeStatus | null;
  purpose: string | null;
}) {
  const { summary, manifest } = data;
  if (manifest === null) {
    return (
      <div className="flex flex-col gap-4">
        <Tombstone />
        <p className="text-[14px] text-sec">the receipt tab holds the full destruction report.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-9">
      {/* the header already carries a blueprint purpose; this section only
          speaks for hand-made identities so nothing is said twice */}
      {purpose === null && (
        <Section title="purpose">
          <p className="text-[15px] text-sec leading-relaxed max-w-xl">
            created by hand — its purpose lives with you, not the runtime.
          </p>
        </Section>
      )}

      <Section title="current environment">
        <div className="flex flex-col gap-2.5">
          <EnvRow
            label="browser"
            value={
              status?.defaultBrowser != null
                ? `${status.defaultBrowser.kind === "chromium" ? "chromium" : status.defaultBrowser.kind} · ${browserStatusLine(summary.state)}`
                : `none detected · ${browserStatusLine(summary.state)}`
            }
            note="a real process in an isolated profile, never a webview"
          />
          <EnvRow label="memory" value={manifest.permissions.memoryScope.value.replace(/-/g, " ")} note="the manager cannot read it" />
          <EnvRow label="files" value="managed locally" note="inside this identity's own partition" />
          <EnvRow label="lifetime" value={lifetimeLine(summary)} />
        </div>
      </Section>

      {data.events.length > 0 && (
        <Section title="recent activity">
          <div className="flex flex-col gap-2">
            {data.events.slice(0, 5).map((e) => (
              <div key={e.id} className="flex items-baseline gap-3 text-[14.5px]">
                <span>{String(e.event).replace(/_/g, " ")}</span>
                <span className="ml-auto shrink-0">
                  <RelativeTime iso={e.createdAt} />
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <TechnicalDetails data={data} status={status} />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* files + memory                                                    */
/* ---------------------------------------------------------------- */

export function FilesTab({ data, status }: { data: WorkspaceData; status: RuntimeStatus | null }) {
  const { manifest } = data;
  if (manifest === null) return <Tombstone />;
  return (
    <div className="flex flex-col gap-9">
      <Section title="managed files">
        <p className="text-[15px] text-sec leading-relaxed max-w-xl">
          downloads and files land inside this identity's own partition — enforced by the runtime —
          and destroy removes them (steps D3/D4). a per-file listing needs a runtime rpc method
          that is not exposed yet, so this screen shows the real boundary instead of a fabricated
          file tree.
        </p>
        <EnvRow label="on disk" value={`${data.summary.storageBytes} bytes`} />
      </Section>
      <CannotRead what="identity files" deletedAt="steps D3/D4" />
      <TechnicalDetails data={data} status={status} />
    </div>
  );
}

export function MemoryTab({ data, status }: { data: WorkspaceData; status: RuntimeStatus | null }) {
  const { manifest } = data;
  if (manifest === null) return <Tombstone />;
  return (
    <div className="flex flex-col gap-9">
      <Section title="memory">
        <p className="text-[15px] text-sec leading-relaxed max-w-xl">
          notes and ai context are scoped to this identity only — readable and writable solely with
          its own token. cross-identity access is refused by the runtime, not hidden by the ui.
        </p>
        <div className="flex flex-col gap-2.5">
          <EnvRow label="scope" value={manifest.permissions.memoryScope.value.replace(/-/g, " ")} />
          <EnvRow label="ai provider" value={manifest.ai.provider.replace(/-/g, " ")} />
          <EnvRow label="history" value={manifest.ai.historyRetention.replace(/-/g, " ")} />
        </div>
      </Section>
      {manifest.ai.systemInstructions && (
        <details className="rounded-2xl bg-surface">
          <summary className="cursor-pointer select-none px-5 py-3.5 text-[14px] text-sec hover:text-ink">
            ai instructions
          </summary>
          <p className="px-5 pb-5 text-[14px] text-sec whitespace-pre-wrap leading-relaxed">
            {manifest.ai.systemInstructions}
          </p>
        </details>
      )}
      <CannotRead what="notes or ai messages" deletedAt="step D5" />
      <TechnicalDetails data={data} status={status} />
    </div>
  );
}

export function PermissionsTab({ data }: { data: WorkspaceData }) {
  if (data.manifest === null) return <Tombstone />;
  return <PermissionRows manifest={data.manifest} />;
}

/* ---------------------------------------------------------------- */
/* lifecycle                                                         */
/* ---------------------------------------------------------------- */

function statePath(onExpiry: IdentitySummary["onExpiry"]): IdentitySummary["state"][] {
  const tail: IdentitySummary["state"][] =
    onExpiry === "archive" ? ["archived"] : onExpiry === "suspend" ? ["suspended"] : ["destroying", "destroyed"];
  return ["created", "ready", "running", "expiring", ...tail];
}

export function StateMachine({ summary }: { summary: IdentitySummary }) {
  const path = statePath(summary.onExpiry);
  const idx = path.indexOf(summary.state);
  return (
    <div className="flex items-center flex-wrap gap-y-2 text-[14px]">
      {path.map((state, i) => {
        const current = i === idx;
        const reached = idx >= 0 && i <= idx;
        return (
          <span key={state} className="flex items-center">
            <span
              className={current ? "px-3.5 py-1 rounded-full text-ink font-medium" : ""}
              style={
                current
                  ? { background: "rgba(201,100,66,0.18)", color: "var(--text-primary)" }
                  : { color: reached ? "var(--text-secondary)" : "var(--text-muted)" }
              }
              aria-current={current ? "step" : undefined}
            >
              {STATE_LABEL[state]}
            </span>
            {i < path.length - 1 && (
              <span aria-hidden className="mx-2 text-mute">
                →
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function LifecycleTab({
  data,
  status,
  onExpireNow,
}: {
  data: WorkspaceData;
  status: RuntimeStatus | null;
  onExpireNow?: (id: string) => void;
}) {
  const { summary, manifest } = data;
  const destroySteps = data.events.filter((e) => e.event === "destroy_step");
  if (manifest === null && destroySteps.length === 0) return <Tombstone />;
  const remaining =
    summary.expiresAt !== null && summary.state !== "destroyed"
      ? formatRemaining(Date.parse(summary.expiresAt) - Date.now())
      : null;
  return (
    <div className="flex flex-col gap-9">
      <Section title="lifecycle">
        <StateMachine summary={summary} />
      </Section>

      {manifest !== null && (
        <Section title="schedule">
          <div className="flex flex-col gap-2.5">
            <EnvRow label="lifetime" value={manifest.lifecycle.lifetime} />
            {remaining !== null && <EnvRow label="remaining" value={remaining} />}
            {summary.expiresAt !== null && (
              <EnvRow
                label="then"
                value={summary.onExpiry}
                note={`at ${new Date(summary.expiresAt).toLocaleTimeString()}`}
              />
            )}
            <EnvRow label="grace period" value="60 seconds" note="a running identity is warned in its companion before the browser is halted" />
          </div>
          {summary.expiresAt !== null && summary.state !== "destroying" && onExpireNow !== undefined && (
            <Button variant="secondary" size="sm" className="self-start mt-1" onClick={() => onExpireNow(summary.id)}>
              expire now
            </Button>
          )}
        </Section>
      )}

      {destroySteps.length > 0 && (
        <Section title="destruction">
          <p className="text-[14.5px] text-sec">
            {destroySteps.length} of 8 contract steps recorded — the receipt tab has the full report.
          </p>
        </Section>
      )}

      <details className="rounded-2xl bg-surface">
        <summary className="cursor-pointer select-none px-5 py-3.5 text-[14px] text-sec hover:text-ink">
          how expiry works
        </summary>
        <p className="px-5 pb-5 text-[14px] text-sec leading-relaxed max-w-xl">
          the runtime's scheduler checks deadlines continuously. when one passes, a running identity
          gets a 60 second grace notice in its companion, the browser is halted, and the scheduled
          action runs. an expiry missed while the runtime was stopped is honored at the next
          startup and recorded as expired_late in the activity log.
        </p>
      </details>
      <TechnicalDetails data={data} status={status} />
    </div>
  );
}

export function ReceiptTab({ data }: { data: WorkspaceData }) {
  const report = destructionReportFrom(data.events);
  if (report === null) {
    return (
      <p className="text-[14.5px] text-sec" data-testid="no-receipt">
        no receipt. this identity has not been destroyed.
      </p>
    );
  }
  return <DestructionReportView report={report} />;
}

/* ---------------------------------------------------------------- */
/* the workspace: one comfortable centered column                    */
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
  const { summary } = data;
  const remaining =
    summary.expiresAt !== null && !destroyed
      ? formatRemaining(Date.parse(summary.expiresAt) - Date.now())
      : null;
  const blueprint =
    summary.blueprint !== null
      ? (blueprints.find((b) => b.source === summary.blueprint?.source) ?? null)
      : null;

  return (
    <div className="flex-1 min-w-0 overflow-auto">
      <div className="max-w-[960px] mx-auto px-10 py-10 flex flex-col gap-7">
        {/* header */}
        <header className="flex flex-col gap-2.5">
          <div className="flex items-center gap-4">
            <h1 className="text-[25px] font-semibold leading-tight truncate tracking-[-0.01em]">{summary.name}</h1>
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
          {blueprint !== null && (
            <p className="text-[15px] text-sec leading-relaxed max-w-2xl">{blueprint.description}</p>
          )}
          <div className="flex items-center gap-2.5 text-[14px] text-sec flex-wrap">
            <span className="text-ink">{STATE_LABEL[summary.state]}</span>
            <span aria-hidden className="text-mute">·</span>
            <span>browser {browserStatusLine(summary.state)}</span>
            {remaining !== null && (
              <>
                <span aria-hidden className="text-mute">·</span>
                <span className="font-mono tabular-nums font-medium" style={{ color: "var(--app-brand)" }}>
                  {remaining} until {summary.onExpiry}
                </span>
              </>
            )}
            <span aria-hidden className="text-mute">·</span>
            <span className="font-mono text-[12.5px] text-mute" title={summary.id}>
              {shortId(summary.id)}
            </span>
          </div>
        </header>

        {/* quiet tabs */}
        <div role="tablist" aria-label="identity workspace" className="flex gap-1.5 flex-wrap -mx-1 border-b border-line pb-px">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`relative px-4 h-10 rounded-t-lg text-[14.5px] outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                tab === t
                  ? "text-ink font-medium"
                  : "text-sec hover:text-ink hover:bg-surface"
              }`}
              onClick={() => setTab(t)}
            >
              {t}
              {tab === t && (
                <span
                  aria-hidden
                  className="absolute left-3 right-3 -bottom-px h-[2px] rounded-full"
                  style={{ background: "var(--app-brand)" }}
                />
              )}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <OverviewTab data={data} status={status} purpose={blueprint?.description ?? null} />
        )}
        {tab === "activity" && <ActivityLog events={data.events} showReport={false} />}
        {tab === "files" && <FilesTab data={data} status={status} />}
        {tab === "memory" && <MemoryTab data={data} status={status} />}
        {tab === "permissions" && <PermissionsTab data={data} />}
        {tab === "lifecycle" && <LifecycleTab data={data} status={status} onExpireNow={onExpireNow} />}
        {tab === "receipt" && <ReceiptTab data={data} />}
      </div>

      {confirming && (
        <Modal title="destroy this identity?" onClose={() => setConfirming(false)}>
          <div className="flex flex-col gap-2">
            <p className="text-[15px] leading-relaxed">
              <span className="font-medium">{summary.name}</span> will be removed from this machine
              by the destruction contract:
            </p>
            <ul className="text-[14px] text-sec leading-relaxed list-none flex flex-col gap-1">
              <li>· browser profile and logins</li>
              <li>· managed files and downloads</li>
              <li>· notes and ai context</li>
            </ul>
            <p className="text-[13.5px] text-mute leading-relaxed pt-1">
              a receipt is kept. this cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" size="lg" onClick={() => setConfirming(false)}>
              cancel
            </Button>
            <Button
              variant="danger"
              size="lg"
              onClick={() => {
                setConfirming(false);
                onDestroy(summary.id);
              }}
            >
              destroy identity
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
