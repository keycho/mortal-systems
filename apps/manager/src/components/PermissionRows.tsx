import type { IdentityManifest } from "@mortal/schema";
import { ENFORCEMENT_TABLE } from "@mortal/schema";
import { EnforcementBadge } from "./EnforcementBadge.js";

const rows = new Map(ENFORCEMENT_TABLE.map((r) => [r.field, r]));

export function PermissionRow({
  field,
  title,
  value,
  enforcement,
  extra,
}: {
  field: string;
  title: string;
  value: string;
  enforcement: "enforced" | "advisory" | "roadmap";
  extra?: string;
}) {
  const row = rows.get(field);
  return (
    <div className="rounded-xl bg-surface px-5 py-4 flex flex-col gap-1.5">
      <div className="flex items-center gap-3" data-testid={`perm-${field}`}>
        <span className="text-[14.5px] font-medium">{title}</span>
        <span className="ml-auto font-mono text-[13px] text-sec">{value}</span>
        <EnforcementBadge enforcement={enforcement} />
      </div>
      {row !== undefined && (
        <p className="text-[13px] text-sec leading-relaxed">{row.description}</p>
      )}
      {enforcement === "enforced" && row !== undefined && row.plannedTests.length > 0 && (
        <p className="font-mono text-[11.5px] text-mute">
          verified by {row.plannedTests.join(" · ")}
        </p>
      )}
      {extra !== undefined && (
        <p className="text-[12.5px]" style={{ color: "var(--app-warning)" }}>
          {extra}
        </p>
      )}
    </div>
  );
}

/** grouped policy cards, values and badges straight from the manifest */
export function PermissionRows({ manifest }: { manifest: IdentityManifest }) {
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <section className="flex flex-col gap-2.5">
        <h3 className="text-[16px] font-medium">permissions</h3>
        <PermissionRow
          field="permissions.filesystem"
          title="filesystem"
          value={manifest.permissions.filesystem.value}
          enforcement={manifest.permissions.filesystem.enforcement}
        />
        <PermissionRow
          field="permissions.memoryScope"
          title="memory scope"
          value={manifest.permissions.memoryScope.value}
          enforcement={manifest.permissions.memoryScope.enforcement}
        />
        <PermissionRow
          field="permissions.wallet"
          title="wallet"
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
          title="email"
          value={manifest.permissions.email.value}
          enforcement={manifest.permissions.email.enforcement}
        />
        <PermissionRow
          field="permissions.network"
          title="network"
          value={manifest.permissions.network.value}
          enforcement={manifest.permissions.network.enforcement}
        />
      </section>

      <section className="flex flex-col gap-2.5">
        <h3 className="text-[16px] font-medium">privacy</h3>
        <PermissionRow
          field="privacy.retainHistory"
          title="retain history"
          value={String(manifest.privacy.retainHistory.value)}
          enforcement={manifest.privacy.retainHistory.enforcement}
        />
        <PermissionRow
          field="privacy.redaction"
          title="redaction"
          value={String(manifest.privacy.redaction.value)}
          enforcement={manifest.privacy.redaction.enforcement}
        />
      </section>

      <p className="text-[12.5px] text-mute">
        enforced means a passing automated test backs the control. advisory and roadmap are labeled
        honestly — we do not sell controls that do not exist.
      </p>
    </div>
  );
}

export const TOMBSTONE_MESSAGE =
  "this identity is destroyed. only the tombstone and the activity log remain.";

export function Tombstone() {
  return (
    <div
      className="text-sec text-[13.5px] rounded-xl bg-surface px-5 py-4 max-w-lg"
      data-testid="tombstone"
    >
      {TOMBSTONE_MESSAGE}
    </div>
  );
}
