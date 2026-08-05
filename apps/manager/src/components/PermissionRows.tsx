import type { Enforcement, IdentityManifest } from "@mortal/schema";
import { ENFORCEMENT_TABLE } from "@mortal/schema";
import { EnforcementBadge } from "./EnforcementBadge.js";

const table = new Map(ENFORCEMENT_TABLE.map((r) => [r.field, r]));

/**
 * mortal's position on network routes, stated wherever the network guarantee
 * appears: we enforce routes, we do not sell egress.
 */
export const NETWORK_POSITION =
  "mortal enforces the route you attach; it does not provide routing. bring your own proxy.";

/** one policy: title, plain-language line, enforcement — technical depth behind the group's disclosure */
export function PermissionRow({
  field,
  title,
  plain,
  enforcement,
  extra,
  note,
}: {
  field: string;
  title: string;
  plain: string;
  enforcement: Enforcement;
  extra?: string;
  /** a neutral clarification — scope of the control, not a warning about it */
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5" data-testid={`perm-${field}`}>
      <div className="flex items-baseline gap-4">
        <span className="text-[15px] font-medium">{title}</span>
        <span className="ml-auto shrink-0">
          <EnforcementBadge enforcement={enforcement} />
        </span>
      </div>
      <p className="text-[14px] text-sec leading-relaxed max-w-xl">{plain}</p>
      {extra !== undefined && (
        <p className="text-[13px]" style={{ color: "var(--app-warning)" }}>
          {extra}
        </p>
      )}
      {note !== undefined && <p className="text-[13px] text-mute max-w-xl">{note}</p>}
    </div>
  );
}

function TechnicalGuarantees({ fields }: { fields: string[] }) {
  const rows = fields.map((f) => table.get(f)).filter((r) => r !== undefined);
  if (rows.length === 0) return null;
  return (
    <details>
      <summary className="cursor-pointer text-[13px] text-mute hover:text-sec select-none">
        technical guarantees
      </summary>
      <div className="flex flex-col gap-3 pt-3">
        {rows.map((row) => (
          <div key={row!.field} className="flex flex-col gap-0.5">
            <span className="text-[13.5px] text-sec">{row!.label}</span>
            <p className="text-[13px] text-mute leading-relaxed">{row!.description}</p>
            {row!.enforcement === "enforced" && row!.plannedTests.length > 0 && (
              <span className="font-mono text-[12px] text-mute">
                verified by {row!.plannedTests.join(" · ")}
              </span>
            )}
            {/* a ceiling that only applies to identities configured for it must
                say so here — this identity's own badge above is authoritative */}
            {row!.conditional !== undefined && (
              <span className="text-[12px] text-mute">conditional · {row!.conditional}</span>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

function Group({
  title,
  fields,
  children,
}: {
  title: string;
  fields: string[];
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-[16px] font-medium">{title}</h2>
      {children}
      <TechnicalGuarantees fields={fields} />
    </section>
  );
}

/** the manifest's policies in human-readable groups; values come from the real manifest */
export function PermissionRows({ manifest }: { manifest: IdentityManifest }) {
  return (
    <div className="flex flex-col gap-10 max-w-xl">
      <Group
        title="browser and local data"
        fields={["surfaces.browser.isolation", "permissions.filesystem", "permissions.memoryScope"]}
      >
        <PermissionRow
          field="surfaces.browser.isolation"
          title="browser isolation"
          plain="each identity uses its own separate browser profile. logins, cookies and history never cross identities."
          enforcement="enforced"
        />
        <PermissionRow
          field="permissions.filesystem"
          title="files"
          plain="downloads and files stay inside this identity's own managed partition, and destroy removes them."
          enforcement={manifest.permissions.filesystem.enforcement}
        />
        <PermissionRow
          field="permissions.memoryScope"
          title="memory"
          plain="notes and ai context belong to this identity only. the runtime refuses cross-identity access."
          enforcement={manifest.permissions.memoryScope.enforcement}
        />
      </Group>

      <Group title="connections" fields={["permissions.network", "permissions.wallet"]}>
        <PermissionRow
          field="permissions.network"
          title="network route"
          plain={
            manifest.permissions.network.value === "routed" &&
            manifest.permissions.network.route !== null
              ? `this identity's traffic is bound to its own route${
                  manifest.permissions.network.route.label !== null
                    ? ` (${manifest.permissions.network.route.label})`
                    : ""
                } — applied at launch and used for every request.`
              : "this identity currently shares your normal ip address and network path."
          }
          enforcement={manifest.permissions.network.enforcement}
          note={NETWORK_POSITION}
        />
        <PermissionRow
          field="permissions.wallet"
          title="wallet"
          plain={
            manifest.permissions.wallet.value === "none"
              ? "no wallet is declared for this identity."
              : "a wallet is declared for this identity."
          }
          enforcement={manifest.permissions.wallet.enforcement}
          extra={
            manifest.permissions.wallet.value !== "none"
              ? "a declaration, not a technical control"
              : undefined
          }
        />
      </Group>

      <Group title="privacy" fields={["privacy.retainHistory"]}>
        <PermissionRow
          field="privacy.retainHistory"
          title="browsing history"
          plain={
            manifest.privacy.retainHistory.value
              ? "browsing history is kept for the life of this identity, then removed with it."
              : "browsing-history artifacts are removed from the profile when the browser session ends."
          }
          enforcement={manifest.privacy.retainHistory.enforcement}
        />
      </Group>

      <Group title="future capabilities" fields={["permissions.email", "privacy.redaction"]}>
        <PermissionRow
          field="permissions.email"
          title="email aliasing"
          plain="not built yet. the field exists so blueprints can declare intent; it enforces nothing today."
          enforcement={manifest.permissions.email.enforcement}
        />
        <PermissionRow
          field="privacy.redaction"
          title="content redaction"
          plain="not built yet. the schema pins this off until it exists."
          enforcement={manifest.privacy.redaction.enforcement}
        />
      </Group>

      <p className="text-[13px] text-mute max-w-xl">
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
    <p className="text-sec text-[14.5px]" data-testid="tombstone">
      {TOMBSTONE_MESSAGE}
    </p>
  );
}
