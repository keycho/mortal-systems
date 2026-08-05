import { useState } from "react";
import type { ActivityEvent, BlueprintSummary, IdentitySummary } from "@mortal/schema";
import { formatRemaining } from "@mortal/schema";
import { ArrowUp, CircleAlert } from "lucide-react";
import { STATE_LABEL } from "../components/IdentityRow.js";
import { RelativeTime } from "../components/ui.js";

export interface HomeProps {
  identities: IdentitySummary[];
  blueprints: BlueprintSummary[];
  recentEvents: Array<ActivityEvent & { identityName: string }>;
  runtimeUp: boolean;
  onOpenIdentity: (id: string) => void;
  /** the typed purpose becomes the prefilled name of a new identity */
  onCreateWithName: (name: string) => void;
  onPickBlueprint: (blueprintId: string) => void;
  onTemporaryBrowsing: () => void;
}

/** friendly labels for the first-party blueprints, matched by source */
const BLUEPRINT_LABEL: Record<string, string> = {
  "first-party:onchain-investigator": "onchain research",
  "first-party:client-operations": "client work",
  "first-party:crypto-operations": "crypto operations",
};

function IdentityLine({
  summary,
  onOpen,
}: {
  summary: IdentitySummary;
  onOpen: (id: string) => void;
}) {
  const destroyed = summary.state === "destroyed";
  const remaining =
    summary.expiresAt !== null && !destroyed
      ? formatRemaining(Date.parse(summary.expiresAt) - Date.now())
      : null;
  return (
    <button
      className="w-full text-left rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-surface outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
      onClick={() => onOpen(summary.id)}
    >
      <span className="text-[15px] truncate">{summary.name}</span>
      <span className="text-[13px] text-mute">{STATE_LABEL[summary.state]}</span>
      {summary.state === "running" && <span className="text-[13px] text-sec">· browser open</span>}
      {remaining !== null && (
        <span className="ml-auto font-mono tabular-nums text-[13px] text-sec shrink-0">
          {remaining}
        </span>
      )}
    </button>
  );
}

export function HomeView({
  identities,
  blueprints,
  recentEvents,
  runtimeUp,
  onOpenIdentity,
  onCreateWithName,
  onPickBlueprint,
  onTemporaryBrowsing,
}: HomeProps) {
  const [text, setText] = useState("");
  const active = identities.filter((i) => i.state === "running" || i.state === "expiring");
  const recent = identities
    .filter((i) => i.state !== "running" && i.state !== "expiring" && i.state !== "destroyed")
    .slice(0, 4);
  const attention = recentEvents
    .filter((e) => e.event === "error" || (e.event === "destroy_step" && e.detail?.ok === false))
    .slice(0, 3);

  const chips: Array<{ label: string; onPick: () => void }> = [
    ...blueprints
      .filter((b) => BLUEPRINT_LABEL[b.source] !== undefined)
      .map((b) => ({ label: BLUEPRINT_LABEL[b.source] as string, onPick: () => onPickBlueprint(b.id) })),
    { label: "temporary browsing", onPick: onTemporaryBrowsing },
  ];

  function submit() {
    const name = text.trim();
    if (name.length === 0) return;
    setText("");
    onCreateWithName(name);
  }

  return (
    <div className="flex-1 min-w-0 overflow-auto flex flex-col">
      <div className="w-full max-w-[720px] mx-auto px-8 flex flex-col flex-1">
        {/* centered prompt */}
        <div className={`flex flex-col items-center gap-7 ${active.length === 0 ? "pt-40" : "pt-24"} pb-10`}>
          <div className="flex items-baseline gap-2">
            <span className="text-[21px] font-medium tracking-wide">mortal</span>
            <span aria-hidden className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "var(--app-brand)" }} />
          </div>
          <h1 className="text-[27px] font-medium text-center leading-snug">
            what needs its own identity?
          </h1>
          <div className="w-full">
            <div className="flex items-center gap-2 rounded-2xl bg-surface px-5 py-2 shadow-lg shadow-black/10 focus-within:ring-2 focus-within:ring-brand/40">
              <input
                aria-label="what needs its own identity"
                className="flex-1 bg-transparent h-12 text-[15.5px] placeholder:text-mute outline-none"
                placeholder="a client, an investigation, a task…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
              />
              <button
                aria-label="create identity"
                disabled={text.trim().length === 0}
                className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-35 hover:brightness-110 active:brightness-95 outline-none focus-visible:ring-2 focus-visible:ring-brand/60 shrink-0"
                style={{ background: "var(--app-brand)", color: "#231512" }}
                onClick={submit}
              >
                <ArrowUp size={17} strokeWidth={2} />
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-4">
              {chips.map((chip) => (
                <button
                  key={chip.label}
                  className="h-9 px-4 rounded-full bg-transparent border border-line-strong text-[13.5px] text-sec hover:text-ink hover:bg-surface outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                  onClick={chip.onPick}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* needs attention, only when relevant */}
        {attention.length > 0 && (
          <section className="flex flex-col gap-2 pb-8">
            {attention.map((e) => (
              <div
                key={`${e.identityId}-${e.id}`}
                className="rounded-xl bg-surface px-4 py-3 flex items-center gap-3 text-[14px]"
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
          </section>
        )}

        {/* active + recent identities */}
        {active.length > 0 && (
          <section className="flex flex-col gap-1 pb-6">
            <h2 className="text-[13px] text-mute px-4 pb-1">active</h2>
            {active.map((summary) => (
              <IdentityLine key={summary.id} summary={summary} onOpen={onOpenIdentity} />
            ))}
          </section>
        )}
        {recent.length > 0 && (
          <section className="flex flex-col gap-1 pb-8">
            <h2 className="text-[13px] text-mute px-4 pb-1">recent</h2>
            {recent.map((summary) => (
              <IdentityLine key={summary.id} summary={summary} onOpen={onOpenIdentity} />
            ))}
          </section>
        )}

        {/* one subtle runtime indicator */}
        <div className="mt-auto pb-6 flex justify-center">
          <span className="flex items-center gap-2 text-[12.5px] text-mute">
            <span
              aria-hidden
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: runtimeUp ? "var(--app-active)" : "var(--app-danger)" }}
            />
            {runtimeUp ? "runtime connected" : "runtime unreachable"} · local-first · no account
          </span>
        </div>
      </div>
    </div>
  );
}
