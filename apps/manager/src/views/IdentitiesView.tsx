import { useState } from "react";
import type { IdentityManifest, IdentitySummary } from "@mortal/schema";
import { CreateIdentityForm } from "../components/CreateIdentityForm.js";
import { IdentityRow } from "../components/IdentityRow.js";

export function IdentitiesView({
  identities,
  creating,
  onCreatingChange,
  onOpen,
  onLaunch,
  onSuspend,
  onDestroy,
  onCreate,
}: {
  identities: IdentitySummary[];
  creating: boolean;
  onCreatingChange: (open: boolean) => void;
  onOpen: (id: string) => void;
  onLaunch: (id: string) => void;
  onSuspend: (id: string) => void;
  onDestroy: (id: string) => void;
  onCreate: (manifest: IdentityManifest) => Promise<void>;
}) {
  const [confirmDestroy, setConfirmDestroy] = useState<string | null>(null);
  const live = identities.filter((i) => i.state !== "destroyed");
  const closed = identities.filter((i) => i.state === "destroyed");

  return (
    <div className="flex flex-col gap-5 max-w-6xl">
      <div className="flex items-center gap-3">
        <h1 className="text-[19px] font-medium">identities</h1>
        <span className="font-mono text-[12px] text-faint">{live.length} live</span>
        <button
          className="ml-auto bg-accent/10 border border-accent/40 text-accent px-4 py-2 text-[13px] font-medium hover:bg-accent/15 transition-colors"
          onClick={() => onCreatingChange(!creating)}
        >
          {creating ? "close" : "+ new identity"}
        </button>
      </div>

      {creating && (
        <div className="max-w-md">
          <CreateIdentityForm
            onCreate={async (manifest) => {
              await onCreate(manifest);
              onCreatingChange(false);
            }}
          />
        </div>
      )}

      {identities.length === 0 && (
        <p className="text-[13px] text-mute border border-dashed border-line px-4 py-3 max-w-lg">
          no identities yet. create one, or install a blueprint from the blueprints view.
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {live.map((summary) => (
          <div key={summary.id}>
            <IdentityRow
              summary={summary}
              onOpen={onOpen}
              onLaunch={onLaunch}
              onSuspend={onSuspend}
              onDestroy={(id) => setConfirmDestroy(id)}
            />
            {confirmDestroy === summary.id && (
              <div className="border border-danger/40 border-t-0 bg-panel-2 px-5 py-3.5 text-[13px] flex items-center gap-4">
                <span className="text-mute">
                  destroy this identity and its data on this machine? this cannot be undone.
                </span>
                <button
                  className="border border-danger text-danger px-3 py-1.5 hover:bg-danger/10 transition-colors"
                  onClick={() => {
                    setConfirmDestroy(null);
                    onDestroy(summary.id);
                  }}
                >
                  destroy
                </button>
                <button
                  className="border border-line px-3 py-1.5 hover:bg-panel-3 transition-colors"
                  onClick={() => setConfirmDestroy(null)}
                >
                  keep
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {closed.length > 0 && (
        <section className="flex flex-col gap-2.5 pt-2">
          <h2 className="text-[11px] tracking-[0.18em] uppercase text-mute">
            destroyed · receipts kept
          </h2>
          <div className="flex flex-col gap-2.5">
            {closed.map((summary) => (
              <IdentityRow key={summary.id} summary={summary} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
