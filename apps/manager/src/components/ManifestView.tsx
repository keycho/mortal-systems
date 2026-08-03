import { useState } from "react";
import type { IdentityManifest, IdentitySummary } from "@mortal/schema";
import { ENFORCEMENT_TABLE } from "@mortal/schema";
import { EnforcementBadge } from "./EnforcementBadge.js";
import { spaceLabel } from "./SpaceCard.js";

const descriptions = new Map(ENFORCEMENT_TABLE.map((r) => [r.field, r.description]));

function Row({
  field,
  value,
  enforcement,
  extra,
}: {
  field: string;
  value: string;
  enforcement: "enforced" | "advisory" | "roadmap";
  extra?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5" title={descriptions.get(field) ?? ""}>
      <div className="flex items-baseline gap-2" data-testid={`perm-${field}`}>
        <span className="text-mute">{field.replace(/^permissions\./, "").replace(/^privacy\./, "")}</span>
        <span className="ml-auto">{value}</span>
        <EnforcementBadge enforcement={enforcement} />
      </div>
      {extra !== undefined && <div className="text-[10px] text-mute">{extra}</div>}
    </div>
  );
}

export function ManifestView({
  summary,
  manifest,
}: {
  summary: IdentitySummary;
  manifest: IdentityManifest | null;
}) {
  const [showRaw, setShowRaw] = useState(false);

  if (manifest === null) {
    return (
      <div className="text-mute text-[11px]" data-testid="manifest-view">
        this identity is destroyed. only the tombstone and the activity log remain.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-[12px]" data-testid="manifest-view">
      <div className="flex items-baseline gap-3">
        <span className="text-mute text-[11px] tracking-widest uppercase">
          {spaceLabel(summary.spaceNumber)}
        </span>
        <span>{manifest.name}</span>
        <span className="ml-auto text-mute text-[11px]">schema {manifest.schemaVersion}</span>
      </div>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-[10px] tracking-widest uppercase text-mute">lifecycle</h3>
        <div className="flex gap-4 text-[11px]">
          <span>lifetime {manifest.lifecycle.lifetime}</span>
          <span>on expiry: {manifest.lifecycle.onExpiry}</span>
          {manifest.lifecycle.expiresAt !== null && (
            <span className="text-mute">expires {new Date(manifest.lifecycle.expiresAt).toLocaleString()}</span>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-[10px] tracking-widest uppercase text-mute">permissions</h3>
        <Row
          field="permissions.filesystem"
          value={manifest.permissions.filesystem.value}
          enforcement={manifest.permissions.filesystem.enforcement}
        />
        <Row
          field="permissions.memoryScope"
          value={manifest.permissions.memoryScope.value}
          enforcement={manifest.permissions.memoryScope.enforcement}
        />
        <Row
          field="permissions.wallet"
          value={manifest.permissions.wallet.value}
          enforcement={manifest.permissions.wallet.enforcement}
          extra={
            manifest.permissions.wallet.value !== "none"
              ? "a declaration, not a technical control"
              : undefined
          }
        />
        <Row
          field="permissions.email"
          value={manifest.permissions.email.value}
          enforcement={manifest.permissions.email.enforcement}
        />
        <Row
          field="permissions.network"
          value={manifest.permissions.network.value}
          enforcement={manifest.permissions.network.enforcement}
        />
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-[10px] tracking-widest uppercase text-mute">privacy</h3>
        <Row
          field="privacy.retainHistory"
          value={String(manifest.privacy.retainHistory.value)}
          enforcement={manifest.privacy.retainHistory.enforcement}
        />
        <Row
          field="privacy.redaction"
          value={String(manifest.privacy.redaction.value)}
          enforcement={manifest.privacy.redaction.enforcement}
        />
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-[10px] tracking-widest uppercase text-mute">ai</h3>
        <div className="text-[11px] text-mute whitespace-pre-wrap border border-line p-2">
          {manifest.ai.systemInstructions || "no system instructions."}
        </div>
        <div className="text-[10px] text-mute">
          provider {manifest.ai.provider} · history {manifest.ai.historyRetention}
        </div>
      </section>

      {manifest.blueprint.source !== null && (
        <section className="flex flex-col gap-1 text-[11px]">
          <h3 className="text-[10px] tracking-widest uppercase text-mute">blueprint</h3>
          <span>
            {manifest.blueprint.source} v{manifest.blueprint.version}
            {manifest.blueprint.signature === null && <span className="text-mute"> · unsigned</span>}
          </span>
        </section>
      )}

      <button
        className="border border-line px-3 py-1 text-[11px] self-start hover:bg-panel-2"
        onClick={() => setShowRaw((v) => !v)}
      >
        {showRaw ? "hide" : "show"} manifest json
      </button>
      {showRaw && (
        <pre className="text-[10px] text-mute border border-line p-2 overflow-auto max-h-64">
          {JSON.stringify(manifest, null, 2)}
        </pre>
      )}
    </div>
  );
}
