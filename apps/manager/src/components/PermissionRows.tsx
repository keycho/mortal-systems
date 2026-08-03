import type { IdentityManifest } from "@mortal/schema";
import { ENFORCEMENT_TABLE } from "@mortal/schema";
import { EnforcementBadge } from "./EnforcementBadge.js";

const descriptions = new Map(ENFORCEMENT_TABLE.map((r) => [r.field, r.description]));

export function PermissionRow({
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
  const description = descriptions.get(field);
  return (
    <div className="flex flex-col gap-1 border border-line bg-panel px-4 py-3">
      <div className="flex items-baseline gap-3" data-testid={`perm-${field}`}>
        <span className="text-[13.5px] font-medium">
          {field.replace(/^permissions\./, "").replace(/^privacy\./, "")}
        </span>
        <span className="ml-auto font-mono text-[13px]">{value}</span>
        <EnforcementBadge enforcement={enforcement} />
      </div>
      {description !== undefined && (
        <span className="text-[12.5px] text-mute leading-relaxed">{description}</span>
      )}
      {extra !== undefined && (
        <span className="text-[12px]" style={{ color: "var(--warn)" }}>
          {extra}
        </span>
      )}
    </div>
  );
}

/** the manifest's permission + privacy sections, badges straight from manifest values */
export function PermissionRows({ manifest }: { manifest: IdentityManifest }) {
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <section className="flex flex-col gap-2.5">
        <h3 className="text-[11px] tracking-[0.18em] uppercase text-mute">permissions</h3>
        <PermissionRow
          field="permissions.filesystem"
          value={manifest.permissions.filesystem.value}
          enforcement={manifest.permissions.filesystem.enforcement}
        />
        <PermissionRow
          field="permissions.memoryScope"
          value={manifest.permissions.memoryScope.value}
          enforcement={manifest.permissions.memoryScope.enforcement}
        />
        <PermissionRow
          field="permissions.wallet"
          value={manifest.permissions.wallet.value}
          enforcement={manifest.permissions.wallet.enforcement}
          extra={
            manifest.permissions.wallet.value !== "none"
              ? "a declaration, not a technical control"
              : undefined
          }
        />
        <PermissionRow
          field="permissions.email"
          value={manifest.permissions.email.value}
          enforcement={manifest.permissions.email.enforcement}
        />
        <PermissionRow
          field="permissions.network"
          value={manifest.permissions.network.value}
          enforcement={manifest.permissions.network.enforcement}
        />
      </section>

      <section className="flex flex-col gap-2.5">
        <h3 className="text-[11px] tracking-[0.18em] uppercase text-mute">privacy</h3>
        <PermissionRow
          field="privacy.retainHistory"
          value={String(manifest.privacy.retainHistory.value)}
          enforcement={manifest.privacy.retainHistory.enforcement}
        />
        <PermissionRow
          field="privacy.redaction"
          value={String(manifest.privacy.redaction.value)}
          enforcement={manifest.privacy.redaction.enforcement}
        />
      </section>

      <p className="text-[12px] text-faint">
        solid badge = enforced by a passing test · outlined = advisory · dashed = roadmap. we do
        not sell controls that do not exist.
      </p>
    </div>
  );
}

export const TOMBSTONE_MESSAGE =
  "this identity is destroyed. only the tombstone and the activity log remain.";

export function Tombstone() {
  return (
    <div className="text-mute text-[13px] border border-dashed border-line px-4 py-3 max-w-lg" data-testid="tombstone">
      {TOMBSTONE_MESSAGE}
    </div>
  );
}
