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
  return (
    <div className="flex flex-col gap-0.5" title={descriptions.get(field) ?? ""}>
      <div className="flex items-baseline gap-2" data-testid={`perm-${field}`}>
        <span className="text-mute">
          {field.replace(/^permissions\./, "").replace(/^privacy\./, "")}
        </span>
        <span className="ml-auto font-mono">{value}</span>
        <EnforcementBadge enforcement={enforcement} />
      </div>
      {extra !== undefined && <div className="text-[10px] text-mute">{extra}</div>}
    </div>
  );
}

/** the manifest's permission + privacy sections, badges straight from manifest values */
export function PermissionRows({ manifest }: { manifest: IdentityManifest }) {
  return (
    <div className="flex flex-col gap-4 text-[12px]">
      <section className="flex flex-col gap-1.5">
        <h3 className="text-[10px] tracking-widest uppercase text-mute">permissions</h3>
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

      <section className="flex flex-col gap-1.5">
        <h3 className="text-[10px] tracking-widest uppercase text-mute">privacy</h3>
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
    </div>
  );
}

export const TOMBSTONE_MESSAGE =
  "this identity is destroyed. only the tombstone and the activity log remain.";

export function Tombstone() {
  return (
    <div className="text-mute text-[11px]" data-testid="tombstone">
      {TOMBSTONE_MESSAGE}
    </div>
  );
}
