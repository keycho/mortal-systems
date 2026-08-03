"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FIRST_PARTY_BLUEPRINTS } from "@mortal/blueprints";
import { formatRemaining, type BlueprintManifest } from "@mortal/schema";
import { Badge } from "../Badge";
import {
  appendEvent,
  buildDestructionReport,
  createFromBlueprint,
  createSimIdentity,
  LAUNCH_SEQUENCE,
  remainingMs,
  withState,
  type SimIdentity,
} from "./machine";

/**
 * the in-browser manager replica. one full lifecycle, real logic, browser
 * memory only. the labeling contract: the frame label below is persistent
 * and caption-sized or larger; the mock window carries its own inline label;
 * the mock page area is always explanatory text, never a fake website.
 */

const SWATCHES = ["#C8FF4D", "#F59E0B", "#4DA3FF", "#A78BFA", "#FFB000"];
const pad = (n: number) => String(n).padStart(3, "0");

type Mode = "idle" | "configured" | "launching" | "running" | "grace" | "destroying" | "destroyed";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const onChange = () => setReduced(q.matches);
    q.addEventListener("change", onChange);
    return () => q.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function Simulator() {
  const [mode, setMode] = useState<Mode>("idle");
  const [sim, setSim] = useState<SimIdentity | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [hasDestroyedOnce, setHasDestroyedOnce] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const reducedMotion = useReducedMotion();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  // 1s clock while an identity exists
  useEffect(() => {
    if (sim === null) return;
    const t = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [sim === null]);

  const destroy = useCallback(
    (subject: SimIdentity, reason: string) => {
      setMode("destroying");
      setAnnouncement(`space ${pad(subject.spaceNumber)} destroying`);
      const startedMs = Date.now();
      let current = withState(
        appendEvent(subject, "expiring", Date.now(), reason),
        "destroying",
        Date.now()
      );
      setSim(current);
      const settle = reducedMotion ? 200 : 1_400;
      timers.current.push(
        setTimeout(() => {
          const completedMs = Date.now();
          const report = buildDestructionReport(current, startedMs, completedMs);
          current = {
            ...withState(current, "destroyed", completedMs, "deletion contract complete"),
            report,
          };
          setSim(current);
          setMode("destroyed");
          setHasDestroyedOnce(true);
          setAnnouncement(`space ${pad(subject.spaceNumber)} destroyed; destruction report available`);
        }, settle)
      );
    },
    [reducedMotion]
  );

  // expiry watcher: warn at t-10s, grace at zero, then destroy
  useEffect(() => {
    if (sim === null || mode !== "running") return;
    const left = remainingMs(sim, nowMs);
    if (left === null) return;
    if (left <= 10_000 && left > 0 && !sim.events.some((e) => e.event === "warning")) {
      setSim(appendEvent(sim, "warning", nowMs, "space closing in 10 seconds"));
      setAnnouncement("warning: space closing in 10 seconds");
    }
    if (left === 0) {
      setMode("grace");
      setSim(appendEvent(sim, "grace", nowMs, "grace notice: closing the window"));
      setAnnouncement("grace notice: the simulated window is closing");
      timers.current.push(
        setTimeout(() => destroy(sim, "lifetime reached zero"), reducedMotion ? 300 : 1_800)
      );
    }
  }, [sim, nowMs, mode, destroy, reducedMotion]);

  const configure = (result: SimIdentity) => {
    setSim(result);
    setMode("configured");
    setAnnouncement(`space ${pad(result.spaceNumber)} created`);
  };

  const launch = () => {
    if (sim === null) return;
    setMode("launching");
    let acc = 0;
    let current = sim;
    for (const step of LAUNCH_SEQUENCE) {
      acc += reducedMotion ? 80 : step.ms;
      timers.current.push(
        setTimeout(() => {
          current = withState(current, step.state, Date.now());
          setSim(current);
          if (step.state === "running") {
            setMode("running");
            setAnnouncement(`space ${pad(current.spaceNumber)} running`);
          }
        }, acc)
      );
    }
  };

  const reset = () => {
    clearTimers();
    setSim(null);
    setMode("idle");
  };

  return (
    <div className="border border-line-strong flex flex-col">
      {/* the persistent frame label — never hidden, never hover-gated */}
      <div className="border-b border-line-strong bg-panel px-4 py-2 text-[11px] text-mute flex flex-wrap gap-x-2">
        <span className="text-ink">simulation</span>
        <span>· runs in your browser</span>
        <span>· the desktop app launches real isolated chromium instances</span>
      </div>

      <div className="p-4 sm:p-6 bg-void flex flex-col gap-6">
        {mode === "idle" && <SetupPanel onReady={configure} firstRun={!hasDestroyedOnce} />}

        {sim !== null && mode !== "idle" && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4">
            <SimCard
              sim={sim}
              mode={mode}
              nowMs={nowMs}
              onLaunch={launch}
              onExpireEarly={() => sim !== null && destroy(sim, "expired early by you")}
              onReset={reset}
              reducedMotion={reducedMotion}
            />
            <div className="flex flex-col gap-4 min-w-0">
              {(mode === "running" || mode === "grace") && (
                <MockBrowser sim={sim} nowMs={nowMs} closing={mode === "grace"} />
              )}
              {mode === "destroyed" && sim.report !== null && <ReportView sim={sim} />}
              {(mode === "running" || mode === "grace" || mode === "destroyed") && (
                <Inspector sim={sim} onNotes={(notes) => setSim({ ...sim, notes })} readOnly={mode === "destroyed"} />
              )}
            </div>
          </div>
        )}

        {mode === "destroyed" && (
          <div className="border border-line bg-panel p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-[13px]">
              that was the simulation. the real one does this to actual browser sessions.
            </span>
            <div className="flex gap-2 sm:ml-auto">
              <Link href="/download" className="border border-ink px-3 py-1.5 text-[12px] hover:bg-panel-2">
                download the manager
              </Link>
              <Link href="/guarantees" className="border border-line px-3 py-1.5 text-[12px] text-mute hover:text-ink">
                the guarantees
              </Link>
              <button onClick={reset} className="border border-line px-3 py-1.5 text-[12px] text-mute hover:text-ink">
                launch another
              </button>
            </div>
          </div>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

// ---- setup: create from scratch or install a blueprint ----

function SetupPanel({ onReady, firstRun }: { onReady: (sim: SimIdentity) => void; firstRun: boolean }) {
  const [tab, setTab] = useState<"create" | "blueprint">("create");
  return (
    <div className="flex flex-col gap-4">
      {!firstRun && (
        <p className="text-[11px] text-mute">
          simulated identities do not survive a refresh. real ones survive everything except their
          own lifetime.
        </p>
      )}
      <div className="flex gap-2" role="tablist" aria-label="create an identity">
        <button
          role="tab"
          aria-selected={tab === "create"}
          className={`border px-3 py-1.5 text-[12px] ${tab === "create" ? "border-ink" : "border-line text-mute"}`}
          onClick={() => setTab("create")}
        >
          create an identity
        </button>
        <button
          role="tab"
          aria-selected={tab === "blueprint"}
          className={`border px-3 py-1.5 text-[12px] ${tab === "blueprint" ? "border-ink" : "border-line text-mute"}`}
          onClick={() => setTab("blueprint")}
        >
          install a blueprint
        </button>
      </div>
      {tab === "create" ? <CreateForm onReady={onReady} /> : <BlueprintPicker onReady={onReady} />}
    </div>
  );
}

function CreateForm({ onReady }: { onReady: (sim: SimIdentity) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0]!);
  const [lifetime, setLifetime] = useState("60s");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (name.trim().length === 0) {
      setError("name is required");
      return;
    }
    const result = createSimIdentity({ name, color, lifetime }, Date.now());
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onReady(result.identity);
  };

  return (
    <div className="flex flex-col gap-3 max-w-md">
      <label className="flex flex-col gap-1 text-[11px] text-mute">
        name
        <input
          className="bg-panel border border-line px-3 py-2 text-[13px] text-ink"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. incident review"
        />
      </label>
      <div className="flex items-center gap-2">
        {SWATCHES.map((c) => (
          <button
            key={c}
            aria-label={`color ${c}`}
            className="w-5 h-5 border"
            style={{ background: c, borderColor: c === color ? "var(--ink)" : "var(--line)" }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      <label className="flex flex-col gap-1 text-[11px] text-mute">
        lifetime · persistent or 30s / 5m / 12h / 7d — 60s fits one visit
        <input
          className="bg-panel border border-line px-3 py-2 text-[13px] text-ink w-32"
          value={lifetime}
          onChange={(e) => setLifetime(e.target.value)}
        />
      </label>
      {error !== null && (
        <p className="text-[11px]" style={{ color: "var(--state-destroying)" }} role="alert">
          {error}
        </p>
      )}
      <button onClick={submit} className="border border-ink px-4 py-2 text-[12px] self-start hover:bg-panel">
        create
      </button>
    </div>
  );
}

function BlueprintPicker({ onReady }: { onReady: (sim: SimIdentity) => void }) {
  const [selected, setSelected] = useState<BlueprintManifest | null>(null);
  const [consented, setConsented] = useState<Set<string>>(new Set());
  const [lifetime, setLifetime] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (selected === null) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {FIRST_PARTY_BLUEPRINTS.map((bp) => (
          <button
            key={bp.name}
            className="relative border border-line bg-panel p-4 text-left flex flex-col gap-2 hover:border-line-strong"
            onClick={() => {
              setSelected(bp);
              setLifetime(bp.recommendedLifetime === "persistent" ? "" : "60s");
            }}
          >
            <div aria-hidden className="absolute left-0 top-0 bottom-0" style={{ width: "var(--rail)", background: bp.theme }} />
            <span className="text-[13px]">{bp.name.toLowerCase()}</span>
            <span className="text-[11px] text-mute">{bp.category} · {bp.recommendedLifetime}</span>
            <span className="text-[10px] border border-dashed border-mute text-mute px-1 self-start">unsigned</span>
          </button>
        ))}
      </div>
    );
  }

  const install = () => {
    setError(null);
    const result = createFromBlueprint(
      selected,
      {
        lifetime: lifetime.trim() || undefined,
        consentedExtensionIds: [...consented],
      },
      Date.now()
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onReady(result.identity);
  };

  return (
    <div className="border border-line bg-panel p-4 flex flex-col gap-3 text-[12px] max-w-2xl">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px]">{selected.name.toLowerCase()}</span>
        <span className="text-mute text-[11px]">by {selected.publisher.id ?? "unknown"} · unsigned</span>
      </div>
      <p className="text-mute text-[11px]">{selected.description}</p>
      {selected.bookmarks && selected.bookmarks.length > 0 && (
        <div className="text-[11px] text-mute">
          bookmarks: {selected.bookmarks.map((b) => b.title).join(" · ")}
        </div>
      )}
      {selected.ai?.systemInstructions && (
        <div className="text-[11px] text-mute border border-line p-2 whitespace-pre-wrap">
          {selected.ai.systemInstructions}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {(
          [
            ["wallet", selected.permissions?.wallet],
            ["network", selected.permissions?.network],
            ["email", selected.permissions?.email],
          ] as const
        ).map(
          ([label, p]) =>
            p && (
              <div key={label} className="flex items-baseline gap-2">
                <span className="text-mute">{label}</span>
                <span className="ml-auto">{p.value}</span>
                <Badge enforcement={p.enforcement} />
              </div>
            )
        )}
        {selected.privacy?.retainHistory && (
          <div className="flex items-baseline gap-2">
            <span className="text-mute">retainHistory</span>
            <span className="ml-auto">{String(selected.privacy.retainHistory.value)}</span>
            <Badge enforcement={selected.privacy.retainHistory.enforcement} />
          </div>
        )}
      </div>
      {selected.recommendedExtensions && selected.recommendedExtensions.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] tracking-widest uppercase text-mute">
            recommended extensions · installed by you, never automatically
          </span>
          {selected.recommendedExtensions.map((ext) => (
            <label key={ext.id} className="flex items-center gap-2 text-[11px]">
              <input
                type="checkbox"
                checked={consented.has(ext.id)}
                onChange={(e) => {
                  const next = new Set(consented);
                  if (e.target.checked) next.add(ext.id);
                  else next.delete(ext.id);
                  setConsented(next);
                }}
              />
              {ext.name} <span className="text-mute">{ext.id}</span>
            </label>
          ))}
        </div>
      )}
      <label className="flex flex-col gap-1 text-[11px] text-mute max-w-[200px]">
        lifetime override (blank keeps {selected.recommendedLifetime})
        <input
          className="bg-void border border-line px-2 py-1.5 text-ink"
          value={lifetime}
          onChange={(e) => setLifetime(e.target.value)}
        />
      </label>
      {error !== null && (
        <p className="text-[11px]" style={{ color: "var(--state-destroying)" }} role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button onClick={install} className="border border-ink px-3 py-1.5 hover:bg-panel-2">
          confirm: create this space
        </button>
        <button onClick={() => setSelected(null)} className="border border-line px-3 py-1.5 text-mute">
          back
        </button>
      </div>
    </div>
  );
}

// ---- the card, the mock window, the inspector, the report ----

function stateColor(sim: SimIdentity, mode: Mode): string {
  if (mode === "destroying" || mode === "destroyed") return "var(--state-destroying)";
  if (mode === "grace") return "var(--state-expiring)";
  if (sim.manifest.lifecycle.lifetime === "persistent") return "var(--state-persistent)";
  return sim.manifest.color;
}

function SimCard({
  sim,
  mode,
  nowMs,
  onLaunch,
  onExpireEarly,
  onReset,
  reducedMotion,
}: {
  sim: SimIdentity;
  mode: Mode;
  nowMs: number;
  onLaunch: () => void;
  onExpireEarly: () => void;
  onReset: () => void;
  reducedMotion: boolean;
}) {
  const left = remainingMs(sim, nowMs);
  const expiringSoon = mode === "running" && left !== null && left <= 10_000;
  return (
    <div
      className={[
        "relative border border-line bg-panel p-4 flex flex-col gap-3 self-start w-full",
        expiringSoon && !reducedMotion ? "anim-decay" : "",
      ].join(" ")}
    >
      <div aria-hidden className="absolute left-0 top-0 bottom-0" style={{ width: "var(--rail)", background: stateColor(sim, mode) }} />
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] tracking-widest uppercase text-mute">
          space {pad(sim.spaceNumber)} · simulated
        </span>
        <span className="text-[10px] border border-line px-2 py-0.5" style={{ color: stateColor(sim, mode) }}>
          {sim.state}
        </span>
      </div>
      <span className="text-[14px]">{sim.manifest.name}</span>
      <div className="text-[11px] text-mute tabular-nums">
        {left === null ? (
          "no expiry scheduled"
        ) : mode === "destroyed" ? (
          "closed"
        ) : (
          <span className={expiringSoon ? "text-ink" : ""} suppressHydrationWarning>
            {formatRemaining(left)} remaining
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {mode === "configured" && (
          <button onClick={onLaunch} className="border border-ink px-3 py-1.5 text-[12px] hover:bg-panel-2">
            launch
          </button>
        )}
        {mode === "running" && (
          <button onClick={onExpireEarly} className="border border-line px-3 py-1.5 text-[12px] text-mute hover:text-ink">
            expire early
          </button>
        )}
        {mode !== "destroyed" && (
          <button onClick={onReset} className="border border-line px-3 py-1.5 text-[12px] text-mute hover:text-ink ml-auto">
            discard
          </button>
        )}
      </div>
    </div>
  );
}

function MockBrowser({ sim, nowMs, closing }: { sim: SimIdentity; nowMs: number; closing: boolean }) {
  const left = remainingMs(sim, nowMs);
  return (
    <div className={`border border-line-strong ${closing ? "anim-collapse" : ""}`}>
      <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <span aria-hidden className="flex gap-1.5">
          <i className="w-2.5 h-2.5 rounded-full bg-line-strong inline-block" />
          <i className="w-2.5 h-2.5 rounded-full bg-line-strong inline-block" />
          <i className="w-2.5 h-2.5 rounded-full bg-line-strong inline-block" />
        </span>
        <span className="text-[11px] truncate">{sim.manifest.name} · mortal</span>
        <span
          className="ml-auto text-[10px] px-2 py-0.5 tabular-nums border border-line flex items-center gap-1.5"
          title="companion badge"
        >
          <i aria-hidden className="w-2 h-2 inline-block" style={{ background: sim.manifest.color }} />
          {left === null ? "persistent" : formatRemaining(left)}
        </span>
      </div>
      <div className="bg-void p-6 min-h-[140px] flex flex-col gap-2">
        <span className="text-[10px] tracking-widest uppercase text-mute">simulated window</span>
        <p className="text-[12px] text-mute max-w-md">
          {closing
            ? "grace notice received. this window is closing; the deletion contract runs next."
            : "in the desktop app this is a real chromium window with its own cookies, storage, extensions, and files."}
        </p>
      </div>
    </div>
  );
}

function Inspector({
  sim,
  onNotes,
  readOnly,
}: {
  sim: SimIdentity;
  onNotes: (notes: string) => void;
  readOnly: boolean;
}) {
  const [tab, setTab] = useState<"activity" | "manifest" | "notes">("activity");
  const permissionRows = [
    ["filesystem", sim.manifest.permissions.filesystem] as const,
    ["memoryScope", sim.manifest.permissions.memoryScope] as const,
    ["wallet", sim.manifest.permissions.wallet] as const,
    ["email", sim.manifest.permissions.email] as const,
    ["network", sim.manifest.permissions.network] as const,
  ];
  return (
    <div className="border border-line">
      <div className="flex border-b border-line text-[11px]" role="tablist" aria-label="inspect the identity">
        {(["activity", "manifest", "notes"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`px-3 py-2 ${tab === t ? "text-ink border-b border-ink -mb-px" : "text-mute"}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="p-3 max-h-64 overflow-auto text-[11px]">
        {tab === "activity" && (
          <ol className="flex flex-col gap-1">
            {[...sim.events].reverse().map((event, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-mute tabular-nums shrink-0">
                  {event.at.slice(11, 19)}
                </span>
                <span>
                  {event.event.replace(/_/g, " ")}
                  {event.detail ? <span className="text-mute"> · {event.detail}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        )}
        {tab === "manifest" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              {permissionRows.map(([label, p]) => (
                <div key={label} className="flex items-baseline gap-2">
                  <span className="text-mute">{label}</span>
                  <span className="ml-auto">{p.value}</span>
                  <Badge enforcement={p.enforcement} />
                </div>
              ))}
              <div className="flex items-baseline gap-2">
                <span className="text-mute">retainHistory</span>
                <span className="ml-auto">{String(sim.manifest.privacy.retainHistory.value)}</span>
                <Badge enforcement={sim.manifest.privacy.retainHistory.enforcement} />
              </div>
            </div>
            <pre className="text-[10px] text-mute overflow-auto border border-line p-2">
              {JSON.stringify(sim.manifest, null, 2)}
            </pre>
          </div>
        )}
        {tab === "notes" && (
          <textarea
            aria-label="identity notes"
            className="w-full bg-void border border-line p-2 text-ink min-h-[100px] text-[12px]"
            placeholder="notes live inside the identity and die with it."
            value={sim.notes}
            readOnly={readOnly}
            onChange={(e) => onNotes(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}

function ReportView({ sim }: { sim: SimIdentity }) {
  const report = sim.report!;
  return (
    <div className="border border-line bg-panel p-4 flex flex-col gap-2 text-[11px]">
      <span className="text-[10px] tracking-widest uppercase text-mute">
        destruction report · simulated
      </span>
      <table className="w-full">
        <tbody>
          {report.steps.map((step) => (
            <tr key={step.step}>
              <td className="pr-2 text-mute align-top w-8">{step.step}</td>
              <td className="pr-2 align-top w-6">ok</td>
              <td className="text-mute">{step.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-col gap-1 pt-1">
        <span className="text-[10px] tracking-widest uppercase text-mute">
          what destroyed cannot remove
        </span>
        {report.caveats.map((caveat) => (
          <span key={caveat} className="text-mute">· {caveat}</span>
        ))}
      </div>
    </div>
  );
}
