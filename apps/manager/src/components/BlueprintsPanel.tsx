import { useEffect, useState } from "react";
import {
  urlContainsPunycode,
  type BlueprintManifest,
  type BlueprintSummary,
} from "@mortal/schema";
import { EnforcementBadge } from "./EnforcementBadge.js";

/**
 * install pipeline ui: list installed blueprints, preview with full render
 * (bookmarks, ai instructions, permissions with enforcement badges, lifetime,
 * publisher, unsigned badge, punycode warnings), explicit consent for
 * recommended extensions, explicit confirm. nothing installs or launches
 * without the confirm.
 */

export interface BlueprintsPanelProps {
  /** open this blueprint's preview immediately (home suggestions) */
  initialPreviewId?: string | null;
  blueprints: BlueprintSummary[];
  onLoadManifest: (id: string) => Promise<BlueprintManifest>;
  onCreate: (input: {
    blueprintId: string;
    lifetime?: string;
    consentedExtensionIds: string[];
  }) => Promise<void>;
}

export function BlueprintsPanel({ initialPreviewId = null, blueprints, onLoadManifest, onCreate }: BlueprintsPanelProps) {
  const [previewId, setPreviewId] = useState<string | null>(initialPreviewId);
  const [manifest, setManifest] = useState<BlueprintManifest | null>(null);
  const [lifetime, setLifetime] = useState("");
  const [consented, setConsented] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setManifest(null);
    setConsented(new Set());
    setLifetime("");
    if (previewId !== null) {
      void onLoadManifest(previewId).then(setManifest);
    }
  }, [previewId, onLoadManifest]);

  const summary = blueprints.find((b) => b.id === previewId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      {blueprints.length === 0 && (
        <span className="text-[13.5px] text-sec rounded-xl bg-surface px-5 py-4">
          none installed. start the runtime with --seed-first-party or install from json.
        </span>
      )}
      {blueprints.map((b) => (
        <div key={b.id} className="rounded-xl bg-surface px-5 py-4 flex items-center gap-3 text-[14px]">
          <span aria-hidden className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ background: b.theme }} />
          <span className="font-medium">{b.name}</span>
          <span className="text-mute text-[12px] font-mono">v{b.version}</span>
          {!b.signed && (
            <span data-testid="unsigned-badge" className="text-[11.5px] border border-dashed border-line-strong text-mute px-2 py-0.5 rounded-full">
              unsigned
            </span>
          )}
          <button
            className="ml-auto h-8 px-3 rounded-lg bg-elevated border border-line text-[12.5px] hover:bg-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            onClick={() => setPreviewId(b.id)}
          >
            preview + install
          </button>
        </div>
      ))}

      {summary !== null && manifest !== null && (
        <div data-testid="blueprint-preview" className="rounded-2xl bg-surface px-6 py-5 flex flex-col gap-4 text-[13px]">
          <div className="flex items-baseline gap-2">
            <span className="text-[16px] font-medium">{manifest.name}</span>
            <span className="text-mute">by {manifest.publisher.id ?? "unknown"}</span>
            <span className="text-mute">· {summary.reviewTier}</span>
            {!summary.signed && <span className="text-mute">· unsigned</span>}
          </div>
          <p className="text-sec leading-relaxed">{manifest.description}</p>

          <div className="flex gap-3 items-baseline">
            <span className="text-mute">lifetime</span>
            <span>{manifest.recommendedLifetime}</span>
            <input
              aria-label="lifetime override"
              className="h-8 w-24 bg-input rounded-lg px-2.5 font-mono text-[12.5px] outline-none border border-transparent focus:border-line-strong"
              placeholder="override"
              value={lifetime}
              onChange={(e) => setLifetime(e.target.value)}
            />
            {manifest.lifecycle?.onExpiry && <span className="text-mute">on expiry: {manifest.lifecycle.onExpiry}</span>}
          </div>

          {manifest.bookmarks && manifest.bookmarks.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-medium">bookmarks</span>
              {manifest.bookmarks.map((bm) => (
                <span key={bm.url} className="text-mute">
                  {bm.title} · {bm.url}
                  {urlContainsPunycode(bm.url) && (
                    <span data-testid="punycode-warning" style={{ color: "var(--app-warning)" }}>
                      {" "}
                      · punycode host, verify before trusting
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}

          {manifest.ai?.systemInstructions && (
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-medium">ai instructions</span>
              <span className="text-mute whitespace-pre-wrap">{manifest.ai.systemInstructions}</span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">permissions</span>
            {(
              [
                ["wallet", manifest.permissions?.wallet],
                ["network", manifest.permissions?.network],
                ["email", manifest.permissions?.email],
              ] as const
            ).map(
              ([label, permission]) =>
                permission && (
                  <div key={label} className="flex items-baseline gap-2">
                    <span className="text-mute">{label}</span>
                    <span className="ml-auto">{permission.value}</span>
                    <EnforcementBadge enforcement={permission.enforcement} />
                  </div>
                )
            )}
            {manifest.privacy?.retainHistory && (
              <div className="flex items-baseline gap-2">
                <span className="text-mute">retainHistory</span>
                <span className="ml-auto">{String(manifest.privacy.retainHistory.value)}</span>
                <EnforcementBadge enforcement="enforced" />
              </div>
            )}
            {manifest.permissions?.wallet && manifest.permissions.wallet.value !== "none" && (
              <span className="text-[12.5px]" style={{ color: "var(--app-warning)" }}>a declaration, not a technical control</span>
            )}
          </div>

          {manifest.recommendedExtensions && manifest.recommendedExtensions.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-medium">
                recommended extensions · installed by you, never automatically
              </span>
              {manifest.recommendedExtensions.map((ext) => (
                <label key={ext.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    data-testid={`consent-${ext.id}`}
                    checked={consented.has(ext.id)}
                    onChange={(e) => {
                      const next = new Set(consented);
                      if (e.target.checked) next.add(ext.id);
                      else next.delete(ext.id);
                      setConsented(next);
                    }}
                  />
                  <span>{ext.name}</span>
                  <span className="text-mute text-[11.5px] font-mono">{ext.id}</span>
                </label>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              className="h-9 px-4 rounded-lg bg-ink text-app font-medium text-[13.5px] hover:bg-white disabled:opacity-45 outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onCreate({
                  blueprintId: summary.id,
                  lifetime: lifetime.trim() || undefined,
                  consentedExtensionIds: [...consented],
                }).finally(() => {
                  setBusy(false);
                  setPreviewId(null);
                });
              }}
            >
              {busy ? "creating…" : "confirm: create this space"}
            </button>
            <button className="h-9 px-4 rounded-lg text-sec hover:text-ink hover:bg-surface-hover text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-white/40" onClick={() => setPreviewId(null)}>
              cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
