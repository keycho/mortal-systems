import { useState } from "react";
import type { ActivityEvent, DestructionReport } from "@mortal/schema";
import {
  Archive,
  Box,
  CircleAlert,
  CircleCheck,
  Clock,
  Flame,
  Pause,
  Play,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { Button, RelativeTime } from "./ui.js";

/* ------------------------------------------------------------------ */
/* event vocabulary: icon, title, short human explanation              */
/* ------------------------------------------------------------------ */

function iconFor(event: string): React.ReactNode {
  const p = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const;
  switch (event) {
    case "created":
    case "provisioned":
      return <Plus {...p} style={{ color: "var(--text-secondary)" }} />;
    case "launched":
    case "resumed":
      return <Play {...p} style={{ color: "var(--app-active)" }} />;
    case "suspended":
      return <Pause {...p} style={{ color: "var(--text-secondary)" }} />;
    case "blueprint_installed":
      return <Box {...p} style={{ color: "var(--app-info)" }} />;
    case "exported":
      return <Upload {...p} style={{ color: "var(--text-secondary)" }} />;
    case "expiry_scheduled":
    case "expiring":
    case "expired_late":
      return <Clock {...p} style={{ color: "var(--app-warning)" }} />;
    case "destruction":
    case "destroy_started":
    case "destroy_step":
    case "destroyed":
      return <Flame {...p} style={{ color: "var(--app-danger)" }} />;
    case "archived":
      return <Archive {...p} style={{ color: "var(--text-muted)" }} />;
    case "error":
      return <CircleAlert {...p} style={{ color: "var(--app-danger)" }} />;
    default:
      return <Plus {...p} style={{ color: "var(--text-muted)" }} />;
  }
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
      return "own chromium instance started";
    case "suspended":
      return "browser closed, all data kept";
    case "resumed":
      return "browser reopened on the same profile";
    case "expiry_scheduled":
      return typeof event.detail?.fireAt === "string"
        ? `fires ${new Date(event.detail.fireAt).toLocaleString()}`
        : null;
    case "expiring":
      return "60 second notice delivered to the companion";
    case "expired_late":
      return "the deadline passed while the runtime was stopped; honored at startup";
    case "destroyed":
      return "destruction contract completed";
    case "error":
      return typeof event.detail?.message === "string" ? event.detail.message : null;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* grouping: one destruction run renders as one activity item          */
/* ------------------------------------------------------------------ */

type TimelineItem =
  | { kind: "single"; event: ActivityEvent }
  | { kind: "destruction"; events: ActivityEvent[]; report: DestructionReport | null };

const DESTROY_RUN = new Set(["destroy_started", "destroy_step", "destroyed"]);

export function groupEvents(events: ActivityEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let run: ActivityEvent[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const destroyedEvent = run.find((e) => e.event === "destroyed");
    const report =
      destroyedEvent !== undefined &&
      destroyedEvent.detail !== null &&
      "report" in destroyedEvent.detail
        ? (destroyedEvent.detail.report as unknown as DestructionReport)
        : null;
    items.push({ kind: "destruction", events: run, report });
    run = [];
  };
  for (const event of events) {
    if (DESTROY_RUN.has(event.event)) run.push(event);
    else {
      flush();
      items.push({ kind: "single", event });
    }
  }
  flush();
  return items;
}

/* ------------------------------------------------------------------ */
/* destruction receipt                                                 */
/* ------------------------------------------------------------------ */

const DESTROY_STEP_META: Record<string, { name: string; means: string }> = {
  D0: { name: "inventory", means: "captured every path that must be removed" },
  D1: { name: "state", means: "marked destroying, cancelled pending lifecycle jobs" },
  D2: { name: "process", means: "browser process halted" },
  D3: { name: "browser profile", means: "profile partition removed from disk" },
  D4: { name: "files + companion", means: "identity files and companion instance removed" },
  D5: { name: "local memory", means: "notes, ai messages and bookmarks deleted" },
  D6: { name: "tombstone", means: "identity row reduced to a tombstone" },
  D7: { name: "journal", means: "activity sealed, destruction journal finalized" },
};

export function DestructionReportView({ report }: { report: DestructionReport }) {
  const allOk = report.steps.every((s) => s.ok);
  const duration =
    report.completedAt !== null && report.startedAt !== null
      ? Math.max(0, Date.parse(report.completedAt) - Date.parse(report.startedAt))
      : null;
  const receiptId = `rcpt_${report.identityId.replace(/^idn_/, "").slice(0, 8)}${
    report.completedAt !== null ? `-${Math.floor(Date.parse(report.completedAt) / 1000)}` : ""
  }`;
  const okStep = (step: string) => report.steps.find((s) => s.step === step)?.ok === true;
  const summary: Array<[string, boolean]> = [
    ["browser process stopped", okStep("D2")],
    ["profile removed", okStep("D3")],
    ["managed files removed", okStep("D4")],
    ["local memory removed", okStep("D5")],
    ["tombstone retained", okStep("D6")],
    ["journal finalized", okStep("D7")],
  ];
  const json = JSON.stringify(report, null, 2);
  // resource counts from the real step evidence (regex over recorded detail; omitted when absent)
  const d5 = report.steps.find((st) => st.step === "D5")?.detail ?? "";
  const rows = /([0-9]+) notes, ([0-9]+) ai messages, ([0-9]+) bookmarks/.exec(d5);
  const d0 = report.steps.find((st) => st.step === "D0")?.detail ?? "";
  const paths = /captured ([0-9]+) paths/.exec(d0);
  const failedSteps = report.steps.filter((st) => !st.ok);

  return (
    <div
      className="relative rounded-2xl bg-surface flex flex-col overflow-hidden max-w-[860px] border border-line-strong shadow-lg shadow-black/30"
      style={{ boxShadow: "inset 0 2px 0 0 var(--app-brand)" }}
      data-testid="destruction-report"
    >
      {/* subtle mortal seal */}
      <svg
        aria-hidden
        className="absolute top-6 right-6 pointer-events-none"
        width="76"
        height="76"
        viewBox="0 0 76 76"
        style={{ opacity: 0.55 }}
      >
        <circle cx="38" cy="38" r="35" fill="none" stroke="var(--app-brand)" strokeWidth="1" />
        <circle cx="38" cy="38" r="28" fill="none" stroke="var(--app-brand)" strokeWidth="0.6" strokeDasharray="2 3" />
        <text
          x="38"
          y="42"
          textAnchor="middle"
          fill="var(--app-brand)"
          style={{ font: "500 13px var(--type-sans)", letterSpacing: "0.08em" }}
        >
          mortal
        </text>
        <text
          x="38"
          y="54"
          textAnchor="middle"
          fill="var(--app-brand)"
          style={{ font: "400 6.5px var(--type-mono)", letterSpacing: "0.18em" }}
        >
          DESTROYED
        </text>
      </svg>
      {/* final status header */}
      <div className="px-6 pt-6 pb-5 flex items-start gap-5">
        <span
          aria-hidden
          className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: allOk ? "rgba(168,220,102,0.14)" : "rgba(216,106,93,0.14)",
            color: allOk ? "var(--app-active)" : "var(--app-danger)",
          }}
        >
          {allOk ? (
            <CircleCheck size={24} strokeWidth={1.75} />
          ) : (
            <CircleAlert size={24} strokeWidth={1.75} />
          )}
        </span>
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <span
            className="text-[12.5px] font-medium tracking-[0.14em] uppercase"
            style={{ color: "var(--app-brand)" }}
          >
            destruction receipt
          </span>
          <span className="text-[21px] font-semibold leading-tight">
            {allOk ? "destruction complete" : "destruction incomplete"}
          </span>
          <span className="text-[15px] leading-relaxed">
            all managed local data for this identity was removed by the destruction contract
            {report.resumed && (
              <span style={{ color: "var(--app-warning)" }}> · resumed after interruption</span>
            )}
          </span>
          <span className="pt-0.5 flex items-baseline gap-3 flex-wrap">
            <span className="font-mono text-[13px] font-medium" style={{ color: "var(--app-brand)" }}>
              {receiptId}
            </span>
            {report.completedAt !== null && (
              <span className="font-mono text-[12.5px] text-sec">
                completed {new Date(report.completedAt).toLocaleString()}
                {duration !== null ? ` · ${(duration / 1000).toFixed(1)}s total` : ""}
              </span>
            )}
          </span>
          <span className="text-[14px] text-ink/90 pt-1 leading-relaxed max-w-xl">
            the browser was closed, the profile and managed files were deleted, and local memory
            was erased. what remains is this receipt and a tombstone entry.
          </span>
        </div>
      </div>

      {/* verified outcomes: elevated inset surface */}
      <div className="mx-6 mb-4 rounded-xl bg-elevated border border-line-strong px-6 py-4 flex flex-col gap-3 shadow-sm shadow-black/20">
        <span className="text-[17px] font-semibold">verified outcomes</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2.5">
          {summary.map(([label, ok]) => (
            <span key={label} className="grid grid-cols-[22px_1fr] items-center gap-1 text-[15px]">
              {ok ? (
                <CircleCheck size={17} strokeWidth={1.9} aria-hidden style={{ color: "var(--app-active)" }} />
              ) : (
                <X size={17} strokeWidth={1.9} aria-hidden style={{ color: "var(--app-danger)" }} />
              )}
              <span className={ok ? "text-ink font-medium" : "text-danger font-medium"}>{label}</span>
            </span>
          ))}
        </div>
      </div>

      {(rows !== null || paths !== null || failedSteps.length > 0) && (
        <div className="px-6 pb-5 flex flex-wrap gap-2.5">
          {(
            [
              ...(paths !== null ? [[paths[1], "paths removed"]] : []),
              ...(rows !== null
                ? [
                    [rows[1], "notes deleted"],
                    [rows[2], "ai messages deleted"],
                    [rows[3], "bookmarks deleted"],
                  ]
                : []),
            ] as Array<[string, string]>
          ).map(([n, label]) => (
            <div key={label} className="rounded-lg bg-elevated px-4 py-2.5 flex flex-col min-w-[7.5rem]">
              <span className="text-[18px] font-semibold leading-tight tabular-nums">{n}</span>
              <span className="text-[12.5px] text-sec">{label}</span>
            </div>
          ))}
          {failedSteps.length > 0 && (
            <div className="rounded-lg bg-elevated px-4 py-2.5 flex flex-col min-w-[7.5rem]">
              <span className="text-[18px] font-semibold leading-tight text-danger tabular-nums">{failedSteps.length}</span>
              <span className="text-[12.5px] text-danger">steps failed</span>
            </div>
          )}
        </div>
      )}

      {/* D0–D7 lives behind the technical timeline; the first view stays plain-language */}
      <details className="px-6 pb-5" data-testid="technical-timeline">
        <summary className="cursor-pointer select-none text-[14px] text-sec hover:text-ink pb-2">
          technical timeline · D0–D7
        </summary>
      <ol className="flex flex-col pt-3">
        {report.steps.map((step, i) => {
          const meta = DESTROY_STEP_META[step.step] ?? { name: step.step, means: "" };
          const last = i === report.steps.length - 1;
          return (
            <li key={step.step} className="flex gap-4" data-testid={`destroy-step-${step.step}`}>
              <div className="flex flex-col items-center">
                <span
                  aria-hidden
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-elevated"
                  style={{ color: step.ok ? "var(--app-active)" : "var(--app-danger)" }}
                >
                  {step.ok ? (
                    <CircleCheck size={15} strokeWidth={1.75} />
                  ) : (
                    <X size={15} strokeWidth={1.75} />
                  )}
                </span>
                {!last && <span aria-hidden className="w-px flex-1 min-h-4 bg-line-strong" />}
              </div>
              <div className={`flex flex-col gap-0.5 min-w-0 ${last ? "pb-0" : "pb-5"}`}>
                <div className="flex items-baseline gap-2.5">
                  <span className="font-mono text-[12px] text-mute w-6">{step.step}</span>
                  <span className="text-[14.5px] font-medium">{meta.name}</span>
                  {!step.ok && <span className="text-[12.5px] text-danger">failed</span>}
                </div>
                <span className="text-[14px] text-sec pl-[34px] leading-relaxed">{meta.means}</span>
                {step.detail !== undefined && step.detail !== null && (
                  <details className="pl-[34px]">
                    <summary className="cursor-pointer text-[12px] text-mute hover:text-sec select-none">
                      technical evidence
                    </summary>
                    <span className="font-mono text-[12px] text-sec break-all block pt-1 leading-relaxed">
                      {step.detail}
                    </span>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      </details>

      {/* one honest caveat stays visible; the full list lives in the disclosure */}
      <div className="px-6 py-4 bg-elevated/50 flex flex-col gap-2 border-t border-line">
        <span className="text-[14px] text-sec leading-relaxed">
          destroyed means removed from this machine — not from servers this identity was logged
          into.
        </span>
        <details>
          <summary className="cursor-pointer select-none text-[14px] font-medium hover:text-ink text-sec">
            limits of this receipt
          </summary>
          <div className="flex flex-col gap-2 pt-2.5">
            {report.caveats.map((caveat) => (
              <span key={caveat} className="text-[14px] text-sec flex gap-2.5 leading-relaxed" data-testid="caveat">
                <span aria-hidden className="text-mute shrink-0">·</span>
                {caveat}
              </span>
            ))}
          </div>
        </details>
      </div>

      {/* receipt actions */}
      <div className="px-6 py-4 flex gap-2.5">
        <CopyReceiptButton json={json} />
        <ExportReceiptButton json={json} receiptId={receiptId} />
      </div>
    </div>
  );
}

function CopyReceiptButton({ json }: { json: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      onClick={() => {
        void navigator.clipboard?.writeText(json).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "copied" : "copy receipt"}
    </Button>
  );
}

function ExportReceiptButton({ json, receiptId }: { json: string; receiptId: string }) {
  return (
    <Button
      variant="secondary"
      onClick={() => {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${receiptId}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      export json
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* the timeline                                                        */
/* ------------------------------------------------------------------ */

function IconDot({ event }: { event: string }) {
  return (
    <span
      aria-hidden
      className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center shrink-0"
    >
      {iconFor(event)}
    </span>
  );
}

function DestructionItem({
  item,
  last,
  showReport,
}: {
  item: Extract<TimelineItem, { kind: "destruction" }>;
  last: boolean;
  showReport: boolean;
}) {
  const [open, setOpen] = useState(false);
  const steps = item.events.filter((e) => e.event === "destroy_step");
  const failed = steps.some((e) => e.detail?.ok === false);
  const when = item.events[item.events.length - 1]?.createdAt;
  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <IconDot event="destruction" />
        {!last && <span aria-hidden className="w-px flex-1 min-h-4 bg-line-strong" />}
      </div>
      <div className={`flex flex-col gap-1 min-w-0 flex-1 ${last ? "" : "pb-6"}`}>
        <div className="flex items-baseline gap-3" data-testid="event-destruction">
          <span className="text-[14px] font-medium">
            {failed ? "destruction ran with failures" : "destruction completed"}
          </span>
          <span className="ml-auto shrink-0">{when !== undefined && <RelativeTime iso={when} />}</span>
        </div>
        <span className="text-[13px] text-sec">
          {steps.length} steps of the destruction contract
          {item.report !== null ? " · receipt recorded" : ""}
        </span>
        <button
          className="self-start text-[12.5px] text-mute hover:text-sec outline-none rounded focus-visible:ring-2 focus-visible:ring-brand/60"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "hide steps" : "show steps"}
        </button>
        {open && (
          <div className="rounded-xl bg-surface px-4 py-3 flex flex-col gap-1.5">
            {item.events.map((e) => (
              <div key={e.id} className="flex items-baseline gap-3 text-[13px]" data-testid={`event-${e.event}`}>
                <span>{eventTitle(e)}</span>
                {e.event === "destroy_step" && e.detail?.ok === false && (
                  <span className="text-danger text-[12px]">failed</span>
                )}
                <span className="ml-auto shrink-0">
                  <RelativeTime iso={e.createdAt} />
                </span>
              </div>
            ))}
          </div>
        )}
        {showReport && item.report !== null && (
          <div className="mt-2">
            <DestructionReportView report={item.report} />
          </div>
        )}
      </div>
    </li>
  );
}

export function ActivityLog({
  events,
  showReport = true,
}: {
  events: ActivityEvent[];
  showReport?: boolean;
}) {
  if (events.length === 0) {
    return <div className="text-sec text-[13.5px]">no activity yet.</div>;
  }
  const items = groupEvents(events);
  return (
    <ol className="flex flex-col" data-testid="activity-log">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        if (item.kind === "destruction") {
          return (
            <DestructionItem
              key={`destruction-${item.events[0]?.id ?? i}`}
              item={item}
              last={last}
              showReport={showReport}
            />
          );
        }
        const event = item.event;
        const blurb = eventBlurb(event);
        const showDetail = event.detail !== null && Object.keys(event.detail).length > 0;
        return (
          <li key={event.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <IconDot event={event.event} />
              {!last && <span aria-hidden className="w-px flex-1 min-h-4 bg-line-strong" />}
            </div>
            <div className={`flex flex-col gap-1 min-w-0 flex-1 ${last ? "" : "pb-6"}`}>
              <div className="flex items-baseline gap-3" data-testid={`event-${event.event}`}>
                <span className="text-[14px] font-medium">{eventTitle(event)}</span>
                <span className="ml-auto shrink-0">
                  <RelativeTime iso={event.createdAt} />
                </span>
              </div>
              {blurb !== null && <span className="text-[13px] text-sec">{blurb}</span>}
              {showDetail && (
                <details className="text-[12.5px] text-sec">
                  <summary className="cursor-pointer text-mute hover:text-sec select-none">
                    technical detail
                  </summary>
                  <pre className="font-mono text-[11.5px] rounded-lg bg-surface p-3 mt-1.5 overflow-auto max-h-48">
                    {JSON.stringify(event.detail, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
