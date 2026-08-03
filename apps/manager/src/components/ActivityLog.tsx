import type { ActivityEvent, DestructionReport } from "@liminal/schema";

function DestructionReportView({ report }: { report: DestructionReport }) {
  return (
    <div className="border border-line bg-panel-2 p-3 flex flex-col gap-2" data-testid="destruction-report">
      <div className="text-[11px]">
        destruction report{report.resumed && <span className="text-[#F59E0B]"> · resumed after interruption</span>}
      </div>
      <table className="text-[10px] w-full">
        <tbody>
          {report.steps.map((step) => (
            <tr key={step.step} data-testid={`destroy-step-${step.step}`}>
              <td className="pr-2 text-mute align-top w-8">{step.step}</td>
              <td className="pr-2 align-top w-4">{step.ok ? "ok" : "FAILED"}</td>
              <td className="text-mute">{step.detail ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] tracking-widest uppercase text-mute">what destroyed cannot remove</span>
        {report.caveats.map((caveat) => (
          <span key={caveat} className="text-[10px] text-mute" data-testid="caveat">
            · {caveat}
          </span>
        ))}
      </div>
    </div>
  );
}

function eventLine(event: ActivityEvent): string {
  switch (event.event) {
    case "expiry_scheduled":
      return `expiry scheduled: ${String(event.detail?.action ?? "")} at ${String(event.detail?.fireAt ?? "")}`;
    case "destroy_step": {
      const step = String(event.detail?.step ?? "");
      const ok = event.detail?.ok === true ? "ok" : "failed";
      return `destroy step ${step} ${ok}`;
    }
    case "launched":
      return `launched (pid ${String(event.detail?.pid ?? "?")})`;
    case "expired_late":
      return "expiry honored late after downtime";
    default:
      return event.event.replace(/_/g, " ");
  }
}

export function ActivityLog({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return <div className="text-mute text-[11px]">no activity yet.</div>;
  }
  return (
    <div className="flex flex-col gap-2" data-testid="activity-log">
      {events.map((event) => {
        const report =
          event.event === "destroyed" && event.detail !== null && "report" in event.detail
            ? (event.detail.report as unknown as DestructionReport)
            : null;
        return (
          <div key={event.id} className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2 text-[11px]">
              <span className="text-mute tabular-nums text-[10px]">
                {new Date(event.createdAt).toLocaleTimeString()}
              </span>
              <span data-testid={`event-${event.event}`}>{eventLine(event)}</span>
            </div>
            {report !== null && <DestructionReportView report={report} />}
          </div>
        );
      })}
    </div>
  );
}
