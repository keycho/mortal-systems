import { useState } from "react";
import type { IdentityManifest, IdentitySummary } from "@mortal/schema";
import { CreateIdentityForm } from "../components/CreateIdentityForm.js";
import { IdentityRow } from "../components/IdentityRow.js";

export function IdentitiesView({
  identities,
  onOpen,
  onLaunch,
  onSuspend,
  onDestroy,
  onCreate,
}: {
  identities: IdentitySummary[];
  onOpen: (id: string) => void;
  onLaunch: (id: string) => void;
  onSuspend: (id: string) => void;
  onDestroy: (id: string) => void;
  onCreate: (manifest: IdentityManifest) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [confirmDestroy, setConfirmDestroy] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-[16px]">identities</h1>
        <button
          className="ml-auto border border-line px-3 py-1.5 text-[12px] hover:bg-panel-2"
          onClick={() => setCreating((v) => !v)}
        >
          {creating ? "close" : "new identity"}
        </button>
      </div>

      {creating && (
        <div className="max-w-md">
          <CreateIdentityForm
            onCreate={async (manifest) => {
              await onCreate(manifest);
              setCreating(false);
            }}
          />
        </div>
      )}

      {identities.length === 0 && (
        <p className="text-[12px] text-mute">
          no identities yet. create one, or install a blueprint from the blueprints view.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {identities.map((summary) => (
          <div key={summary.id}>
            <IdentityRow
              summary={summary}
              onOpen={onOpen}
              onLaunch={onLaunch}
              onSuspend={onSuspend}
              onDestroy={(id) => setConfirmDestroy(id)}
            />
            {confirmDestroy === summary.id && (
              <div className="border border-line border-t-0 bg-panel-2 p-3 text-[11px] flex items-center gap-3">
                <span className="text-mute">
                  destroy this identity and its data on this machine? this cannot be undone.
                </span>
                <button
                  className="border border-danger text-danger px-2 py-1"
                  onClick={() => {
                    setConfirmDestroy(null);
                    onDestroy(summary.id);
                  }}
                >
                  destroy
                </button>
                <button
                  className="border border-line px-2 py-1"
                  onClick={() => setConfirmDestroy(null)}
                >
                  keep
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
