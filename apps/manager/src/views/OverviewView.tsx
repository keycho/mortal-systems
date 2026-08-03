import type { ActivityEvent, IdentitySummary, RuntimeStatus } from "@mortal/schema";
import { formatRemaining } from "@mortal/schema";
import { formatBytes, StatePill } from "../components/IdentityRow.js";
import { Button, shortId } from "../components/ui.js";

export interface OverviewProps {
  identities: IdentitySummary[];
  status: RuntimeStatus | null;
  /** merged recent events across identities, newest first (real activity.read data) */
  recentEvents: Array<ActivityEvent & { identityName: string }>;
  onOpenIdentity: (id: string) => void;
  onNewIdentity: () => void;
  onGoBlueprints: () => void;
}

function SectionTitle({ children, tone }: { children: React.ReactNode; tone?: "danger" }) {
  return (
    <h2
      className="text-[11px] tracking-[0.16em] uppercase"
      style={{ color: tone === "danger" ? "var(--danger)" : "var(--mute-app)" }}
    >
      {children}
    </h2>
  );
}

/** the main card: the identity that is running right now */
function RunningCard({
  summary,
  onOpen,
}: {
  summary: IdentitySummary;
  onOpen: (id: string) => void;
}) {
  const remaining =
    summary.expiresAt !== null ? formatRemaining(Date.parse(summary.expiresAt) - Date.now()) : null;
  return (
    <button
      className="relative border border-line bg-panel text-left px-6 py-5 flex items-center gap-6 w-full outline-none transition-colors hover:bg-panel-2 focus-visible:ring-2 focus-visible:ring-accent/60"
      onClick={() => onOpen(summary.id)}
    >
      <div aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: summary.color }} />
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center gap-3">
          <span className="text-[19px] font-medium truncate">{summary.name}</span>
          <StatePill state={summary.state} />
        </div>
        <span className="text-[13px] text-mute">
          own browser open ·{" "}
          {summary.blueprint !== null ? `from ${summary.blueprint.source}` : "created by hand"} ·{" "}
          <span className="font-mono text-[12px]">{shortId(summary.id)}</span>
        </span>
      </div>
      <div className="ml-auto flex items-center gap-6 shrink-0">
        {remaining !== null && (
          <div className="flex flex-col items-end">
            <span className="font-mono tabular-nums text-[20px]">{remaining}</span>
            <span className="text-[11.5px] text-faint">until {summary.onExpiry}</span>
          </div>
        )}
        <span className="text-[13px] text-accent">open workspace →</span>
      </div>
    </button>
  );
}

function CompactRow({
  summary,
  onOpen,
}: {
  summary: IdentitySummary;
  onOpen: (id: string) => void;
}) {
  const remaining =
    summary.expiresAt !== null && summary.state !== "destroyed"
      ? formatRemaining(Date.parse(summary.expiresAt) - Date.now())
      : null;
  return (
    <button
      className="relative border border-line bg-panel text-left px-4 py-3 flex items-center gap-3 w-full outline-none transition-colors hover:bg-panel-2 focus-visible:ring-2 focus-visible:ring-accent/60"
      onClick={() => onOpen(summary.id)}
    >
      <span aria-hidden className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: summary.color }} />
      <span className="text-[13.5px] font-medium truncate">{summary.name}</span>
      <StatePill state={summary.state} />
      {remaining !== null && (
        <span className="ml-auto font-mono tabular-nums text-[12.5px] text-ink shrink-0">{remaining}</span>
      )}
    </button>
  );
}

export function OverviewView({
  identities,
  status,
  recentEvents,
  onOpenIdentity,
  onNewIdentity,
  onGoBlueprints,
}: OverviewProps) {
  const live = identities.filter((i) => i.state !== "destroyed");
  const running = identities.filter((i) => i.state === "running" || i.state === "expiring");
  const withDeadline = live
    .filter((i) => i.expiresAt !== null && i.state !== "running" && i.state !== "expiring")
    .sort((a, b) => Date.parse(a.expiresAt as string) - Date.parse(b.expiresAt as string));
  const failed = recentEvents.filter(
    (e) => e.event === "error" || (e.event === "destroy_step" && e.detail?.ok === false)
  );
  const storageTotal = identities.reduce((sum, i) => sum + i.storageBytes, 0);
  const uptime =
    status !== null ? Math.max(0, Math.round((Date.now() - Date.parse(status.startedAt)) / 60000)) : null;

  return (
    <div className="flex-1 min-w-0 overflow-auto">
      <div className="flex flex-col gap-6 px-8 py-6 max-w-5xl">
        <div className="flex items-center gap-3">
          <h1 className="text-[20px] font-medium">dashboard</h1>
          <div className="ml-auto flex gap-2">
            <Button variant="primary" onClick={onNewIdentity}>
              + new identity
            </Button>
            <Button variant="secondary" onClick={onGoBlueprints}>
              install a blueprint
            </Button>
          </div>
        </div>

        {/* the operational centre: what is running right now */}
        <section className="flex flex-col gap-2.5">
          <SectionTitle>running now</SectionTitle>
          {running.length === 0 ? (
            <p className="text-[13.5px] text-mute border border-dashed border-line px-5 py-4">
              nothing is running. launch an identity to give it its own browser.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {running.map((summary) => (
                <RunningCard key={summary.id} summary={summary} onOpen={onOpenIdentity} />
              ))}
            </div>
          )}
        </section>

        {failed.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <SectionTitle tone="danger">needs attention</SectionTitle>
            <div className="border border-danger/40 bg-panel px-5 py-3.5 flex flex-col gap-2">
              {failed.slice(0, 5).map((e) => (
                <div key={`${e.identityId}-${e.id}`} className="flex items-baseline gap-3 text-[13px]">
                  <span className="text-danger">
                    {e.event === "error" ? "error" : "destroy step failed"}
                  </span>
                  <span className="text-mute">{e.identityName}</span>
                  <span className="ml-auto font-mono text-[11.5px] text-faint">
                    {new Date(e.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {status !== null && status.warnings.length > 0 && (
          <section className="border border-line bg-panel px-5 py-3.5 flex flex-col gap-1.5">
            {status.warnings.map((w) => (
              <p key={w} className="text-[13px]" style={{ color: "var(--warn)" }}>
                {w}
              </p>
            ))}
          </section>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <section className="flex flex-col gap-2.5">
            <SectionTitle>expiring soon</SectionTitle>
            {withDeadline.length === 0 ? (
              <p className="text-[13.5px] text-mute border border-dashed border-line px-4 py-3">
                no other identity has a deadline right now.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {withDeadline.slice(0, 4).map((summary) => (
                  <CompactRow key={summary.id} summary={summary} onOpen={onOpenIdentity} />
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2.5">
            <SectionTitle>recent activity</SectionTitle>
            {recentEvents.length === 0 ? (
              <p className="text-[13.5px] text-mute border border-dashed border-line px-4 py-3">
                no activity yet.
              </p>
            ) : (
              <div className="border border-line bg-panel divide-y divide-line">
                {recentEvents.slice(0, 8).map((e) => (
                  <div
                    key={`${e.identityId}-${e.id}`}
                    className="px-4 py-2.5 flex items-baseline gap-3 text-[13px]"
                  >
                    <span className="font-medium">{e.event.replace(/_/g, " ")}</span>
                    <span className="text-mute truncate">{e.identityName}</span>
                    <span className="ml-auto font-mono tabular-nums text-[11.5px] text-faint shrink-0">
                      {new Date(e.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* runtime health strip */}
        <section className="flex flex-col gap-2.5">
          <SectionTitle>runtime</SectionTitle>
          <div className="border border-line bg-panel px-5 py-4 flex flex-wrap items-baseline gap-x-8 gap-y-2 text-[13.5px]">
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="w-2 h-2 rounded-full"
                style={{ background: status !== null ? "var(--state-active)" : "var(--danger)" }}
              />
              {status !== null ? "healthy" : "unreachable"}
            </span>
            {status !== null && (
              <>
                <span className="font-mono text-[12.5px] text-mute">v{status.version}</span>
                <span className="font-mono text-[12.5px] text-mute">up {uptime}m</span>
                <span className="font-mono text-[12.5px] text-mute">
                  {status.defaultBrowser !== null
                    ? `${status.defaultBrowser.kind} ${status.defaultBrowser.version ?? ""}`.trim()
                    : "no browser detected"}
                </span>
                <span className="font-mono text-[12.5px] text-mute">
                  {formatBytes(storageTotal)} managed
                </span>
                <span className="font-mono text-[12.5px] text-mute">
                  {live.length} identities · {identities.length - live.length} receipts
                </span>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
