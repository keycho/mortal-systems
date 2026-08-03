import type { BlueprintManifest, BlueprintSummary, RuntimeStatus } from "@mortal/schema";
import { BlueprintsPanel } from "../components/BlueprintsPanel.js";

/**
 * stage boundary: these views exist so the navigation is complete, and they
 * say so. no fake content — the fuller screens are later stages.
 */
function PlannedNote({ what }: { what: string }) {
  return (
    <p className="text-[13.5px] text-sec rounded-xl bg-surface px-5 py-4 max-w-xl leading-relaxed">
      {what} lands in a later stage of this redesign. nothing here is hidden — the data already
      exists in the runtime; this screen just has not been built yet.
    </p>
  );
}

export function BlueprintsView({
  blueprints,
  onLoadManifest,
  onCreate,
}: {
  blueprints: BlueprintSummary[];
  onLoadManifest: (id: string) => Promise<BlueprintManifest>;
  onCreate: (input: {
    blueprintId: string;
    lifetime?: string;
    consentedExtensionIds: string[];
  }) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex flex-col gap-1">
        <h1 className="text-[25px] font-medium">blueprints</h1>
        <p className="text-[14px] text-sec">
          reviewed starting points for common identities. nothing installs or launches without your
          explicit confirm.
        </p>
      </div>
      <BlueprintsPanel blueprints={blueprints} onLoadManifest={onLoadManifest} onCreate={onCreate} />
    </div>
  );
}

export function ActivityView() {
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-[25px] font-medium">activity</h1>
      <PlannedNote what="the cross-identity activity feed" />
      <p className="text-[13.5px] text-sec">
        per-identity activity is available now: open an identity and use its activity tab. the
        dashboard shows the most recent events across identities.
      </p>
    </div>
  );
}

export function GuaranteesView() {
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-[25px] font-medium">guarantees</h1>
      <PlannedNote what="the guarantees screen (the enforcement table with per-field test mapping)" />
      <p className="text-[13.5px] text-sec">
        until then: every permission in an identity's permissions tab carries its real enforcement
        tag and, for enforced controls, the automated test ids that back it.
      </p>
    </div>
  );
}

export function SettingsView({ status }: { status: RuntimeStatus | null }) {
  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <h1 className="text-[25px] font-medium">settings</h1>
      {status !== null ? (
        <div className="rounded-xl bg-surface px-5 py-4 flex flex-col gap-2.5 text-[13.5px]">
          <div className="flex gap-3">
            <span className="text-sec w-28 shrink-0">runtime</span>
            <span className="font-mono text-[13px]">
              v{status.version} · pid {status.pid} · port {status.port}
            </span>
          </div>
          <div className="flex gap-3">
            <span className="text-sec w-28 shrink-0">root</span>
            <span className="font-mono text-[13px] break-all">{status.root}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-sec w-28 shrink-0">started</span>
            <span className="font-mono text-[13px]">{new Date(status.startedAt).toLocaleString()}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-sec w-28 shrink-0">browsers</span>
            <span className="font-mono text-[13px]">
              {status.browsers.length > 0
                ? status.browsers.map((b) => `${b.kind} ${b.version ?? ""}`.trim()).join(", ")
                : "none detected"}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[13.5px] text-sec">runtime unreachable.</p>
      )}
      <PlannedNote what="editable settings (browser choice, default lifetimes)" />
    </div>
  );
}
