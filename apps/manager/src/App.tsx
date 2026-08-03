import { useCallback, useEffect, useState } from "react";
import type { IdentitySummary, RuntimeStatus } from "@liminal/schema";
import { rpc, RpcClientError } from "./lib/client.js";
import { SpaceCard } from "./components/SpaceCard.js";
import { CreateIdentityForm } from "./components/CreateIdentityForm.js";
import { StatusBar } from "./components/StatusBar.js";

export default function App() {
  const [identities, setIdentities] = useState<IdentitySummary[]>([]);
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDestroy, setConfirmDestroy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, st] = await Promise.all([rpc("identity.list", {}), rpc("runtime.status", {})]);
      setIdentities(list);
      setStatus(st);
      setError(null);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [refresh]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await refresh();
    } catch (err) {
      if (err instanceof RpcClientError) setError(`${err.code}: ${err.message}`);
      else setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-4 py-3 border-b border-line flex items-baseline gap-3">
        <span className="text-[15px] tracking-widest">liminal</span>
        <span className="text-mute text-[11px]">manager</span>
        <span className="text-mute text-[11px] ml-auto">
          identities that disappear when their work is done
        </span>
      </header>

      <main className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {identities.map((summary) => (
            <div key={summary.id}>
              <SpaceCard
                summary={summary}
                onLaunch={(id) => void act(() => rpc("identity.launch", { id }))}
                onSuspend={(id) => void act(() => rpc("identity.suspend", { id }))}
                onDestroy={(id) => setConfirmDestroy(id)}
              />
              {confirmDestroy === summary.id && (
                <div className="border border-line border-t-0 bg-panel-2 p-3 text-[11px] flex items-center gap-3">
                  <span className="text-mute">destroy this identity and its data on this machine?</span>
                  <button
                    className="border border-[#FF6B6B] text-[#FF6B6B] px-2 py-1"
                    onClick={() => {
                      setConfirmDestroy(null);
                      void act(() => rpc("identity.destroy", { id: summary.id }));
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
          <CreateIdentityForm onCreate={(manifest) => act(() => rpc("identity.create", { manifest }))} />
        </div>
        {error !== null && (
          <div className="mt-4 border border-[#3a2326] bg-[#1a1214] text-[#FF9B9B] px-3 py-2 text-[11px]">
            {error}
          </div>
        )}
      </main>

      <StatusBar status={status} error={error} />
    </div>
  );
}
