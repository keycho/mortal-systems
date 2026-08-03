import { useCallback, useEffect, useState } from "react";
import type {
  ActivityEvent,
  BlueprintSummary,
  IdentityManifest,
  IdentitySummary,
  RuntimeStatus,
} from "@mortal/schema";
import { rpc, RpcClientError } from "./lib/client.js";
import { Sidebar, type View } from "./components/Sidebar.js";
import { OverviewView } from "./views/OverviewView.js";
import { IdentitiesView } from "./views/IdentitiesView.js";
import { IdentityWorkspace, type WorkspaceData } from "./views/IdentityWorkspace.js";
import {
  ActivityView,
  BlueprintsView,
  GuaranteesView,
  SettingsView,
} from "./views/PlaceholderViews.js";

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [identities, setIdentities] = useState<IdentitySummary[]>([]);
  const [blueprints, setBlueprints] = useState<BlueprintSummary[]>([]);
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkspaceData | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, st, bps] = await Promise.all([
        rpc("identity.list", {}),
        rpc("runtime.status", {}),
        rpc("blueprint.list", {}),
      ]);
      setIdentities(list);
      setStatus(st);
      setBlueprints(bps);
      setError(null);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const refreshDetail = useCallback(async (id: string) => {
    try {
      const [identity, events] = await Promise.all([
        rpc("identity.get", { id }),
        rpc("activity.read", { identityId: id, limit: 200 }),
      ]);
      setDetail({
        summary: identity.summary,
        manifest: identity.manifest,
        events: events as ActivityEvent[],
      });
    } catch {
      setDetail(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      void refresh();
      if (selectedId !== null) void refreshDetail(selectedId);
    }, 2000);
    return () => clearInterval(t);
  }, [refresh, refreshDetail, selectedId]);

  useEffect(() => {
    if (selectedId !== null) void refreshDetail(selectedId);
    else setDetail(null);
  }, [selectedId, refreshDetail]);

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        await refresh();
        if (selectedId !== null) await refreshDetail(selectedId);
      } catch (err) {
        if (err instanceof RpcClientError) setError(`${err.code}: ${err.message}`);
        else setError(err instanceof Error ? err.message : String(err));
      }
    },
    [refresh, refreshDetail, selectedId]
  );

  function openIdentity(id: string) {
    setView("identities");
    setSelectedId(id);
  }

  const identityHandlers = {
    onLaunch: (id: string) => void act(() => rpc("identity.launch", { id })),
    onSuspend: (id: string) => void act(() => rpc("identity.suspend", { id })),
    onDestroy: (id: string) => void act(() => rpc("identity.destroy", { id })),
  };

  return (
    <div className="h-full flex">
      <Sidebar
        view={view}
        status={status}
        onNavigate={(v) => {
          setView(v);
          setSelectedId(null);
        }}
      />
      <main className="flex-1 overflow-auto p-6">
        {error !== null && (
          <div className="mb-4 border border-danger/40 bg-panel-2 text-danger px-3 py-2 text-[11px]">
            {error}
          </div>
        )}

        {view === "overview" && (
          <OverviewView identities={identities} status={status} onOpenIdentity={openIdentity} />
        )}

        {view === "identities" &&
          (selectedId !== null && detail !== null ? (
            <IdentityWorkspace
              data={detail}
              status={status}
              onBack={() => setSelectedId(null)}
              onLaunch={identityHandlers.onLaunch}
              onSuspend={identityHandlers.onSuspend}
              onResume={(id) => void act(() => rpc("identity.resume", { id }))}
              onExpireNow={(id) => void act(() => rpc("identity.expire", { id }))}
              onDestroy={identityHandlers.onDestroy}
            />
          ) : (
            <IdentitiesView
              identities={identities}
              onOpen={(id) => setSelectedId(id)}
              onCreate={(manifest: IdentityManifest) =>
                act(() => rpc("identity.create", { manifest }))
              }
              {...identityHandlers}
            />
          ))}

        {view === "blueprints" && (
          <BlueprintsView
            blueprints={blueprints}
            onLoadManifest={async (id) => (await rpc("blueprint.get", { id })).manifest}
            onCreate={({ blueprintId, lifetime, consentedExtensionIds }) =>
              act(() =>
                rpc("identity.createFromBlueprint", {
                  blueprintId,
                  overrides: {
                    ...(lifetime ? { lifetime } : {}),
                    ...(consentedExtensionIds.length > 0 ? { consentedExtensionIds } : {}),
                  },
                })
              )
            }
          />
        )}

        {view === "activity" && <ActivityView />}
        {view === "guarantees" && <GuaranteesView />}
        {view === "settings" && <SettingsView status={status} />}
      </main>
    </div>
  );
}
