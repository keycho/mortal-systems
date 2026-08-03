import type { ActivityEvent, DestructionReport } from "@mortal/schema";

/* ------------------------------------------------------------------ */
/* event vocabulary: icon, title, short human explanation              */
/* ------------------------------------------------------------------ */

type EventKind =
  | "create"
  | "launch"
  | "pause"
  | "resume"
  | "blueprint"
  | "export"
  | "clock"
  | "grace"
  | "late"
  | "destroy"
  | "archive"
  | "error";

const EVENT_KIND: Record<string, EventKind> = {
  created: "create",
  provisioned: "create",
  launched: "launch",
  suspended: "pause",
  resumed: "resume",
  blueprint_installed: "blueprint",
  exported: "export",
  expiry_scheduled: "clock",
  expiring: "grace",
  expired_late: "late",
  destroy_started: "destroy",
  destroy_step: "destroy",
  destroyed: "destroy",
  archived: "archive",
  error: "error",
};

const KIND_COLOR: Record<EventKind, string> = {
  create: "var(--mute-app)",
  launch: "var(--state-active)",
  pause: "var(--mute-app)",
  resume: "var(--state-active)",
  blueprint: "var(--accent)",
  export: "var(--mute-app)",
  clock: "var(--accent)",
  grace: "var(--state-expiring)",
  late: "var(--state-expiring)",
  destroy: "var(--state-destroying)",
  archive: "var(--state-archived)",
  error: "var(--danger)",
};

function EventIcon({ kind }: { kind: EventKind }) {
  const color = KIND_COLOR[kind];
  const stroke = { stroke: color, strokeWidth: 1.6, fill: "none", strokeLinecap: "round" } as const;
  return (
    <span
      aria-hidden
      className="w-7 h-7 rounded-full border flex items-center justify-center shrink-0 bg-panel-2"
      style={{ borderColor: "var(--line-1)" }}
    >
      <svg width="13" height="13" viewBox="0 0 14 14">
        {kind === "create" && <path d="M7 3v8M3 7h8" {...stroke} />}
        {(kind === "launch" || kind === "resume") && <path d="M4.5 3l6 4-6 4z" fill={color} stroke="none" />}
        {kind === "pause" && <path d="M5 3.5v7M9 3.5v7" {...stroke} />}
        {kind === "blueprint" && <rect x="3" y="3" width="8" height="8" {...stroke} />}
        {kind === "export" && <path d="M7 11V3M3.5 6.5L7 3l3.5 3.5" {...stroke} />}
        {(kind === "clock" || kind === "grace" || kind === "late") && (
          <>
            <circle cx="7" cy="7" r="4.5" {...stroke} />
            <path d="M7 4.5V7l2 1.4" {...stroke} />
          </>
        )}
        {kind === "destroy" && <path d="M4 4l6 6M10 4l-6 6" {...stroke} />}
        {kind === "archive" && (
          <>
            <rect x="3" y="3" width="8" height="3" {...stroke} />
            <path d="M4 6v5h6V6M6 8.5h2" {...stroke} />
          </>
        )}
        {kind === "error" && <path d="M7 3.5v4.5M7 10.5v.01" {...stroke} />}
      </svg>
    </span>
  );
}

function eventTitle(event: ActivityEvent): string {
  switch (event.event) {
    case "created":
      return "identity created";
    case "provisioned":
      return "profile provisioned";
    case "launched":
      return "browser launched";
    case "suspended":
      return "suspended";
    case "resumed":
      return "resumed";
    case "blueprint_installed":
      return "blueprint installed";
    case "exported":
      return "exported as blueprint";
    case "expiry_scheduled":
      return `expiry scheduled → ${String(event.detail?.action ?? "")}`;
    case "expiring":
      return "grace period started";
    case "expired_late":
      return "expiry honored late";
    case "destroy_started":
      return "destruction started";
    case "destroy_step":
      return `destruction step ${String(event.detail?.step ?? "")}`;
    case "destroyed":
      return "destroyed";
    case "archived":
      return "archived";
    case "error":
      return "error";
    default:
      return String(event.event).replace(/_/g, " ");
  }
}

function eventBlurb(event: ActivityEvent): string | null {
  switch (event.event) {
    case "created":
      return "manifest validated and stored";
    case "provisioned":
      return "isolated browser profile and companion prepared";
    case "launched":
      return `own chromium instance, pid ${String(event.detail?.pid ?? "?")}`;
    case "suspended":
      return "browser closed, all data kept";
    case "resumed":
      return "browser reopened on the same profile";
    case "expiry_scheduled":
      return `fires ${
        typeof event.detail?.fireAt === "string"
          ? new Date(event.detail.fireAt).toLocaleString()
          : ""
      }`;
    case "expiring":
      return "60 second notice delivered to the companion";
    case "expired_late":
      return "the deadline passed while the runtime was stopped; honored at startup";
    case "destroy_step": {
      const ok = event.detail?.ok === true;
      return ok ? (typeof event.detail?.detail === "string" ? event.detail.detail : "completed") : "FAILED";
    }
    case "destroyed":
      return "destruction contract completed — receipt below";
    case "error":
      return typeof event.detail?.message === "string" ? event.detail.message : null;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* destruction receipt: a flagship surface, not a terminal log         */
/* ------------------------------------------------------------------ */

const DESTROY_STEP_META: Record<string, { name: string; means: string }> = {
  D0: { name: "inventory", means: "captured every path that must be removed" },
  D1: { name: "state", means: "marked destroying, cancelled pending lifecycle jobs" },
  D2: { name: "process", means: "browser process halted" },
  D3: { name: "browser profile", means: "profile partition removed from disk" },
  D4: { name: "files + companion", means: "identity files and companion instance removed" },
  D5: { name: "database", means: "notes, ai messages and bookmarks deleted" },
  D6: { name: "tombstone", means: "identity row reduced to a tombstone" },
  D7: { name: "finalize", means: "activity sealed, destruction journal cleared" },
};

export function DestructionReportView({ report }: { report: DestructionReport }) {
  const allOk = report.steps.every((s) => s.ok);
  const duration =
    report.completedAt !== null && report.startedAt !== null
      ? Math.max(0, Date.parse(report.completedAt) - Date.parse(report.startedAt))
      : null;

  return (
    <div
      className="border border-line bg-panel-2 flex flex-col"
      data-testid="destruction-report"
    >
      {/* final status header */}
      <div className="px-6 py-5 border-b border-line flex items-center gap-4">
        <span
          aria-hidden
          className="w-9 h-9 rounded-full border flex items-center justify-center shrink-0"
          style={{
            borderColor: allOk ? "var(--state-active)" : "var(--danger)",
            color: allOk ? "var(--state-active)" : "var(--danger)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            {allOk ? (
              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            ) : (
              <path d="M8 3.5V9M8 12v.01" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            )}
          </svg>
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-[16px] font-medium">
            {allOk ? "destruction complete" : "destruction incomplete"}
          </span>
          <span className="text-[12.5px] text-mute">
            all local data for this identity was removed by the destruction contract
            {report.resumed && (
              <span style={{ color: "var(--warn)" }}> · resumed after interruption</span>
            )}
          </span>
        </div>
        <div className="ml-auto flex flex-col items-end gap-0.5 text-[12px]">
          {report.completedAt !== null && (
            <span className="font-mono text-mute">
              {new Date(report.completedAt).toLocaleString()}
            </span>
          )}
          {duration !== null && (
            <span className="font-mono text-faint">{(duration / 1000).toFixed(1)}s total</span>
          )}
        </div>
      </div>

      {/* D0–D7 stepper */}
      <ol className="px-6 py-5 flex flex-col">
        {report.steps.map((step, i) => {
          const meta = DESTROY_STEP_META[step.step] ?? { name: step.step, means: "" };
          const last = i === report.steps.length - 1;
          return (
            <li key={step.step} className="flex gap-4" data-testid={`destroy-step-${step.step}`}>
              <div className="flex flex-col items-center">
                <span
                  aria-hidden
                  className="w-6 h-6 rounded-full border flex items-center justify-center shrink-0"
                  style={{
                    borderColor: step.ok ? "var(--state-active)" : "var(--danger)",
                    color: step.ok ? "var(--state-active)" : "var(--danger)",
                    background: "var(--surface-1)",
                  }}
                >
                  {step.ok ? (
                    <svg width="11" height="11" viewBox="0 0 12 12">
                      <path d="M2.5 6.5l2.5 2.5 4.5-5.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 12 12">
                      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  )}
                </span>
                {!last && <span aria-hidden className="w-px flex-1 min-h-3 bg-line" />}
              </div>
              <div className={`flex flex-col gap-0.5 pb-4 min-w-0 ${last ? "pb-0" : ""}`}>
                <div className="flex items-baseline gap-2.5">
                  <span className="font-mono text-[12px] text-faint w-6">{step.step}</span>
                  <span className="text-[13.5px] font-medium">{meta.name}</span>
                  {!step.ok && (
                    <span className="text-[12px]" style={{ color: "var(--danger)" }}>
                      failed
                    </span>
                  )}
                </div>
                <span className="text-[12.5px] text-mute pl-[34px]">{meta.means}</span>
                {step.detail !== undefined && step.detail !== null && (
                  <span className="font-mono text-[11.5px] text-faint pl-[34px] break-all">
                    {step.detail}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* caveats: what destroyed cannot remove */}
      <div className="px-6 py-5 border-t border-line flex flex-col gap-2.5 bg-panel">
        <span className="text-[11px] tracking-[0.18em] uppercase text-mute">
          what destroyed cannot remove
        </span>
        {report.caveats.map((caveat) => (
          <span key={caveat} className="text-[12.5px] text-mute flex gap-2.5" data-testid="caveat">
            <span aria-hidden className="text-faint shrink-0">·</span>
            {caveat}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* the timeline                                                        */
/* ------------------------------------------------------------------ */

export function ActivityLog({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return <div className="text-mute text-[13px]">no activity yet.</div>;
  }
  return (
    <ol className="flex flex-col" data-testid="activity-log">
      {events.map((event, i) => {
        const kind = EVENT_KIND[event.event] ?? "create";
        const blurb = eventBlurb(event);
        const report =
          event.event === "destroyed" && event.detail !== null && "report" in event.detail
            ? (event.detail.report as unknown as DestructionReport)
            : null;
        const last = i === events.length - 1;
        const showDetail =
          event.detail !== null && report === null && Object.keys(event.detail).length > 0;
        return (
          <li key={event.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <EventIcon kind={kind} />
              {!last && <span aria-hidden className="w-px flex-1 min-h-3 bg-line" />}
            </div>
            <div className={`flex flex-col gap-1 min-w-0 flex-1 ${last ? "" : "pb-5"}`}>
              <div className="flex items-baseline gap-3" data-testid={`event-${event.event}`}>
                <span className="text-[13.5px] font-medium">{eventTitle(event)}</span>
                <span className="font-mono tabular-nums text-[11.5px] text-faint ml-auto shrink-0">
                  {new Date(event.createdAt).toLocaleTimeString()}
                </span>
              </div>
              {blurb !== null && <span className="text-[12.5px] text-mute">{blurb}</span>}
              {showDetail && (
                <details className="text-[12px] text-mute">
                  <summary className="cursor-pointer text-faint hover:text-mute select-none">
                    technical detail
                  </summary>
                  <pre className="font-mono text-[11px] border border-line bg-panel-2 p-2.5 mt-1.5 overflow-auto max-h-48">
                    {JSON.stringify(event.detail, null, 2)}
                  </pre>
                </details>
              )}
              {report !== null && (
                <div className="mt-2">
                  <DestructionReportView report={report} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
