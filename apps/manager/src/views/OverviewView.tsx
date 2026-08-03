import type { IdentitySummary, RuntimeStatus } from "@mortal/schema";
import { IdentityRow } from "../components/IdentityRow.js";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line bg-panel p-4 flex flex-col gap-1">
      <span className="text-mute text-[11px]">{label}</span>
      <span className="font-mono text-[20px]">{value}</span>
    </div>
  );
}

/**
 * a real dashboard, minimal on purpose in stage 5: live counts from
 * identity.list and runtime.status only. the fuller overview (recent activity,
 * next expiries) is a later stage.
 */
export function OverviewView({
  identities,
  status,
  onOpenIdentity,
}: {
  identities: IdentitySummary[];
  status: RuntimeStatus | null;
  onOpenIdentity: (id: string) => void;
}) {
  const live = identities.filter((i) => i.state !== "destroyed");
  const running = identities.filter((i) => i.state === "running");
  const withDeadline = live
    .filter((i) => i.expiresAt !== null)
    .sort((a, b) => Date.parse(a.expiresAt as string) - Date.parse(b.expiresAt as string));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[16px]">overview</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="identities" value={String(live.length)} />
        <Stat label="running" value={String(running.length)} />
        <Stat label="with a deadline" value={String(withDeadline.length)} />
        <Stat
          label="browser"
          value={status?.defaultBrowser !== null && status !== undefined ? (status?.defaultBrowser?.kind ?? "—") : "—"}
        />
      </div>
      {withDeadline.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] tracking-widest uppercase text-mute">next to expire</h2>
          <div className="flex flex-col gap-2">
            {withDeadline.slice(0, 3).map((summary) => (
              <IdentityRow key={summary.id} summary={summary} onOpen={onOpenIdentity} />
            ))}
          </div>
        </section>
      )}
      {status !== null && status.warnings.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="text-[11px] tracking-widest uppercase text-mute">runtime warnings</h2>
          {status.warnings.map((w) => (
            <p key={w} className="text-[11px] text-warn">
              {w}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
