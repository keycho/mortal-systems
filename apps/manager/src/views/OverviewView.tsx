import type { ActivityEvent, IdentitySummary, RuntimeStatus } from "@mortal/schema";
import { IdentityRow } from "../components/IdentityRow.js";

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-line bg-panel px-5 py-4 flex flex-col gap-1.5">
      <span className="text-mute text-[12px]">{label}</span>
      <span className="font-mono text-[28px] leading-none">{value}</span>
      {sub !== undefined && <span className="text-[12px] text-faint">{sub}</span>}
    </div>
  );
}

export interface OverviewProps {
  identities: IdentitySummary[];
  status: RuntimeStatus | null;
  /** merged recent events across identities, newest first (real activity.read data) */
  recentEvents: Array<ActivityEvent & { identityName: string }>;
  onOpenIdentity: (id: string) => void;
  onNewIdentity: () => void;
  onGoBlueprints: () => void;
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
  const running = identities.filter((i) => i.state === "running");
  const withDeadline = live
    .filter((i) => i.expiresAt !== null)
    .sort((a, b) => Date.parse(a.expiresAt as string) - Date.parse(b.expiresAt as string));
  const failed = recentEvents.filter(
    (e) => e.event === "error" || (e.event === "destroy_step" && e.detail?.ok === false)
  );
  const uptime =
    status !== null
      ? Math.max(0, Math.round((Date.now() - Date.parse(status.startedAt)) / 60000))
      : null;

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <h1 className="text-[19px] font-medium">overview</h1>
        <div className="ml-auto flex gap-2">
          <button
            className="bg-accent/10 border border-accent/40 text-accent px-4 py-2 text-[13px] font-medium hover:bg-accent/15 transition-colors"
            onClick={onNewIdentity}
          >
            + new identity
          </button>
          <button
            className="border border-line px-4 py-2 text-[13px] hover:bg-panel-3 transition-colors"
            onClick={onGoBlueprints}
          >
            install a blueprint
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric
          label="identities"
          value={String(live.length)}
          sub={`${identities.length - live.length} destroyed`}
        />
        <Metric label="running now" value={String(running.length)} sub="own browser instances" />
        <Metric
          label="with a deadline"
          value={String(withDeadline.length)}
          sub={
            withDeadline.length > 0
              ? `next: ${new Date(withDeadline[0]!.expiresAt as string).toLocaleTimeString()}`
              : "nothing scheduled"
          }
        />
        <Metric
          label="runtime"
          value={status !== null ? "up" : "down"}
          sub={
            status !== null
              ? `v${status.version} · ${uptime}m · ${status.defaultBrowser?.kind ?? "no browser"}`
              : "unreachable"
          }
        />
      </div>

      {status !== null && status.warnings.length > 0 && (
        <div className="border border-line bg-panel px-5 py-3.5 flex flex-col gap-1.5">
          {status.warnings.map((w) => (
            <p key={w} className="text-[12.5px]" style={{ color: "var(--warn)" }}>
              {w}
            </p>
          ))}
        </div>
      )}

      {failed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] tracking-[0.18em] uppercase" style={{ color: "var(--danger)" }}>
            needs attention
          </h2>
          <div className="border border-danger/40 bg-panel px-5 py-3.5 flex flex-col gap-2">
            {failed.slice(0, 5).map((e) => (
              <div key={`${e.identityId}-${e.id}`} className="flex items-baseline gap-3 text-[12.5px]">
                <span className="text-danger">{e.event === "error" ? "error" : "destroy step failed"}</span>
                <span className="text-mute">{e.identityName}</span>
                <span className="ml-auto font-mono text-[11.5px] text-faint">
                  {new Date(e.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[11px] tracking-[0.18em] uppercase text-mute">expiring soon</h2>
          {withDeadline.length === 0 ? (
            <p className="text-[13px] text-mute border border-dashed border-line px-4 py-3">
              no identity has a deadline right now.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {withDeadline.slice(0, 4).map((summary) => (
                <IdentityRow key={summary.id} summary={summary} compact onOpen={onOpenIdentity} />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2.5">
          <h2 className="text-[11px] tracking-[0.18em] uppercase text-mute">recent events</h2>
          {recentEvents.length === 0 ? (
            <p className="text-[13px] text-mute border border-dashed border-line px-4 py-3">
              no activity yet.
            </p>
          ) : (
            <div className="border border-line bg-panel divide-y divide-line">
              {recentEvents.slice(0, 8).map((e) => (
                <div
                  key={`${e.identityId}-${e.id}`}
                  className="px-5 py-2.5 flex items-baseline gap-3 text-[12.5px]"
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
    </div>
  );
}
