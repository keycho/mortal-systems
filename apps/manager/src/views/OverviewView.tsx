import type { ActivityEvent, IdentitySummary, RuntimeStatus } from "@mortal/schema";
import { formatRemaining } from "@mortal/schema";
import { ArrowRight, CircleAlert, Clock, Plus } from "lucide-react";
import { StatePill, formatBytes } from "../components/IdentityRow.js";
import { Button, RelativeTime } from "../components/ui.js";

export interface OverviewProps {
  identities: IdentitySummary[];
  status: RuntimeStatus | null;
  /** merged recent events across identities, newest first (real activity.read data) */
  recentEvents: Array<ActivityEvent & { identityName: string }>;
  onOpenIdentity: (id: string) => void;
  onNewIdentity: () => void;
  onGoBlueprints: () => void;
}

/** collapse destroy-step bursts in the merged feed into one line per identity run */
function groupFeed(
  events: Array<ActivityEvent & { identityName: string }>
): Array<{ key: string; label: string; identityName: string; createdAt: string; danger?: boolean }> {
  const out: Array<{ key: string; label: string; identityName: string; createdAt: string; danger?: boolean }> = [];
  const seenDestruction = new Set<string>();
  for (const e of events) {
    if (e.event === "destroy_step" || e.event === "destroy_started" || e.event === "destroyed") {
      if (seenDestruction.has(e.identityId)) continue;
      seenDestruction.add(e.identityId);
      const failed = e.event === "destroy_step" && e.detail?.ok === false;
      out.push({
        key: `destruction-${e.identityId}`,
        label: failed ? "destruction ran with failures" : "destruction completed",
        identityName: e.identityName,
        createdAt: e.createdAt,
        danger: failed,
      });
      continue;
    }
    out.push({
      key: `${e.identityId}-${e.id}`,
      label: String(e.event).replace(/_/g, " "),
      identityName: e.identityName,
      createdAt: e.createdAt,
      danger: e.event === "error",
    });
  }
  return out;
}

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
    <div className="rounded-2xl bg-surface px-7 py-6 flex items-center gap-6">
      <span aria-hidden className="w-3 h-3 rounded-full shrink-0" style={{ background: summary.color }} />
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <span className="text-[19px] font-medium truncate">{summary.name}</span>
          <StatePill state={summary.state} />
        </div>
        <span className="text-[13.5px] text-sec">
          browser running in an isolated profile
          {summary.blueprint !== null ? ` · from ${summary.blueprint.source}` : ""}
        </span>
      </div>
      {remaining !== null && (
        <div className="flex flex-col items-end shrink-0">
          <span className="font-mono tabular-nums text-[21px]">{remaining}</span>
          <span className="text-[12px] text-mute">until {summary.onExpiry}</span>
        </div>
      )}
      <Button variant="primary" className="shrink-0" onClick={() => onOpen(summary.id)}>
        open workspace
        <ArrowRight size={15} strokeWidth={1.75} aria-hidden />
      </Button>
    </div>
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
  const feed = groupFeed(recentEvents).slice(0, 7);
  const empty = identities.length === 0;

  return (
    <div className="flex-1 min-w-0 overflow-auto flex flex-col">
      <div className="max-w-4xl mx-auto w-full px-8 py-7 flex flex-col gap-7 flex-1">
        <div className="flex items-center gap-3">
          <h1 className="text-[25px] font-medium">dashboard</h1>
          <div className="ml-auto flex gap-2.5">
            <Button variant="primary" onClick={onNewIdentity}>
              <Plus size={15} strokeWidth={2} aria-hidden />
              new identity
            </Button>
            <Button variant="secondary" onClick={onGoBlueprints}>
              install a blueprint
            </Button>
          </div>
        </div>

        {empty ? (
          <div className="rounded-2xl bg-surface px-8 py-14 flex flex-col items-center gap-3 text-center">
            <span className="text-[17px] font-medium">no identities yet</span>
            <p className="text-[14px] text-sec max-w-md leading-relaxed">
              an identity is an isolated browser, memory, files and permissions with a finite
              lifecycle. create one from scratch or install a first-party blueprint.
            </p>
            <div className="flex gap-2.5 pt-2">
              <Button variant="primary" onClick={onNewIdentity}>
                <Plus size={15} strokeWidth={2} aria-hidden />
                new identity
              </Button>
              <Button variant="secondary" onClick={onGoBlueprints}>
                browse blueprints
              </Button>
            </div>
          </div>
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <h2 className="text-[16px] font-medium">running now</h2>
              {running.length === 0 ? (
                <p className="text-[13.5px] text-sec rounded-xl bg-surface px-5 py-4">
                  nothing is running. launch an identity to give it its own browser.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {running.map((summary) => (
                    <RunningCard key={summary.id} summary={summary} onOpen={onOpenIdentity} />
                  ))}
                </div>
              )}
            </section>

            {(failed.length > 0 || withDeadline.length > 0) && (
              <section className="flex flex-col gap-3">
                <h2 className="text-[16px] font-medium">needs attention</h2>
                <div className="flex flex-col gap-2">
                  {failed.slice(0, 3).map((e) => (
                    <div
                      key={`${e.identityId}-${e.id}`}
                      className="rounded-xl bg-surface px-5 py-3.5 flex items-center gap-3 text-[13.5px]"
                    >
                      <CircleAlert size={15} strokeWidth={1.75} aria-hidden style={{ color: "var(--app-danger)" }} />
                      <span className="text-danger">
                        {e.event === "error" ? "runtime error" : "destroy step failed"}
                      </span>
                      <span className="text-sec truncate">{e.identityName}</span>
                      <span className="ml-auto shrink-0">
                        <RelativeTime iso={e.createdAt} />
                      </span>
                    </div>
                  ))}
                  {withDeadline.slice(0, 3).map((summary) => (
                    <button
                      key={summary.id}
                      className="rounded-xl bg-surface px-5 py-3.5 flex items-center gap-3 text-[13.5px] text-left hover:bg-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      onClick={() => onOpenIdentity(summary.id)}
                    >
                      <Clock size={15} strokeWidth={1.75} aria-hidden style={{ color: "var(--app-warning)" }} />
                      <span className="truncate">{summary.name}</span>
                      <span className="text-sec">expires soon</span>
                      <span className="ml-auto font-mono tabular-nums text-[13px] shrink-0">
                        {formatRemaining(Date.parse(summary.expiresAt as string) - Date.now())}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="flex flex-col gap-3">
              <h2 className="text-[16px] font-medium">recent activity</h2>
              {feed.length === 0 ? (
                <p className="text-[13.5px] text-sec rounded-xl bg-surface px-5 py-4">no activity yet.</p>
              ) : (
                <div className="rounded-xl bg-surface px-2 py-1.5">
                  {feed.map((item) => (
                    <div key={item.key} className="px-3.5 py-2.5 flex items-baseline gap-3 text-[13.5px]">
                      <span className={item.danger ? "text-danger" : ""}>{item.label}</span>
                      <span className="text-sec truncate">{item.identityName}</span>
                      <span className="ml-auto shrink-0">
                        <RelativeTime iso={item.createdAt} />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* runtime health: compact footer status */}
        <div className="mt-auto pt-4 flex items-center gap-3 text-[12.5px] text-mute flex-wrap">
          <span
            aria-hidden
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: status !== null ? "var(--app-active)" : "var(--app-danger)" }}
          />
          {status !== null ? (
            <>
              <span>runtime healthy</span>
              <span className="font-mono">v{status.version}</span>
              <span className="font-mono">
                {status.defaultBrowser !== null
                  ? `${status.defaultBrowser.kind} ${status.defaultBrowser.version?.split(".")[0] ?? ""}`.trim()
                  : "no browser detected"}
              </span>
              <span className="font-mono">{formatBytes(storageTotal)} managed</span>
              <span className="font-mono">
                {live.length} identities · {identities.length - live.length} receipts
              </span>
            </>
          ) : (
            <span>runtime unreachable</span>
          )}
        </div>
      </div>
    </div>
  );
}
