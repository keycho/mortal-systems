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
  blueprints: BlueprintSummary[];
  onLoadManifest: (id: string) => Promise<BlueprintManifest>;
  onCreate: (input: {
    blueprintId: string;
    lifetime?: string;
    consentedExtensionIds: string[];
  }) => Promise<void>;
}

export function BlueprintsPanel({ blueprints, onLoadManifest, onCreate }: BlueprintsPanelProps) {
  const [previewId, setPreviewId] = useState<string | null>(null);
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
    <div className="border border-line bg-panel p-4 flex flex-col gap-3">
      <span className="text-mute text-[11px] tracking-widest uppercase">blueprints</span>
      {blueprints.length === 0 && (
        <span className="text-[11px] text-mute">
          none installed. start the runtime with --seed-first-party or install from json.
        </span>
      )}
      {blueprints.map((b) => (
        <div key={b.id} className="flex items-baseline gap-2 text-[12px]">
          <span aria-hidden className="w-2 h-2 inline-block" style={{ background: b.theme }} />
          <span>{b.name}</span>
          <span className="text-mute text-[10px]">v{b.version}</span>
          {!b.signed && (
            <span data-testid="unsigned-badge" className="text-[10px] border border-dashed border-mute text-mute px-1">
              unsigned
            </span>
          )}
          <button
            className="ml-auto border border-line px-2 py-0.5 text-[10px] hover:bg-panel-2"
            onClick={() => setPreviewId(b.id)}
          >
            preview + install
          </button>
        </div>
      ))}

      {summary !== null && manifest !== null && (
        <div data-testid="blueprint-preview" className="border border-line bg-panel-2 p-3 flex flex-col gap-3 text-[11px]">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px]">{manifest.name}</span>
            <span className="text-mute">by {manifest.publisher.id ?? "unknown"}</span>
            <span className="text-mute">· {summary.reviewTier}</span>
            {!summary.signed && <span className="text-mute">· unsigned</span>}
          </div>
          <p className="text-mute">{manifest.description}</p>

          <div className="flex gap-3 items-baseline">
            <span className="text-mute">lifetime</span>
            <span>{manifest.recommendedLifetime}</span>
            <input
              aria-label="lifetime override"
              className="bg-panel border border-line px-2 py-1 w-24"
              placeholder="override"
              value={lifetime}
              onChange={(e) => setLifetime(e.target.value)}
            />
            {manifest.lifecycle?.onExpiry && <span className="text-mute">on expiry: {manifest.lifecycle.onExpiry}</span>}
          </div>

          {manifest.bookmarks && manifest.bookmarks.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] tracking-widest uppercase text-mute">bookmarks</span>
              {manifest.bookmarks.map((bm) => (
                <span key={bm.url} className="text-mute">
                  {bm.title} · {bm.url}
                  {urlContainsPunycode(bm.url) && (
                    <span data-testid="punycode-warning" className="text-[#F59E0B]">
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
              <span className="text-[10px] tracking-widest uppercase text-mute">ai instructions</span>
              <span className="text-mute whitespace-pre-wrap">{manifest.ai.systemInstructions}</span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] tracking-widest uppercase text-mute">permissions</span>
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
              <span className="text-[10px] text-mute">a declaration, not a technical control</span>
            )}
          </div>

          {manifest.recommendedExtensions && manifest.recommendedExtensions.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] tracking-widest uppercase text-mute">
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
                  <span className="text-mute text-[10px]">{ext.id}</span>
                </label>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              className="border border-line px-3 py-1 hover:bg-panel"
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
            <button className="border border-line px-3 py-1 text-mute" onClick={() => setPreviewId(null)}>
              cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
