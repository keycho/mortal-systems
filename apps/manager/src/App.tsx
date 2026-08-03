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

type RecentEvent = ActivityEvent & { identityName: string };

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [identities, setIdentities] = useState<IdentitySummary[]>([]);
  const [blueprints, setBlueprints] = useState<BlueprintSummary[]>([]);
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkspaceData | null>(null);
  const [creating, setCreating] = useState(false);

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

      // merged recent feed for the dashboard: real activity.read data,
      // bounded to the 8 most recently touched identities
      const feedOf = list.slice(0, 8);
      const feeds = await Promise.all(
        feedOf.map(async (summary) => {
          const events = await rpc("activity.read", { identityId: summary.id, limit: 6 });
          return events.map((e) => ({ ...e, identityName: summary.name }));
        })
      );
      setRecentEvents(
        feeds
          .flat()
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .slice(0, 20)
      );
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
      setDetail({ summary: identity.summary, manifest: identity.manifest, events });
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

  function newIdentity() {
    setView("identities");
    setSelectedId(null);
    setCreating(true);
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
        identities={identities}
        onNewIdentity={newIdentity}
        onNavigate={(v) => {
          setView(v);
          setSelectedId(null);
          setCreating(false);
        }}
      />
      <main className="flex-1 overflow-auto px-8 py-7">
        {error !== null && (
          <div className="mb-5 border border-danger/40 bg-panel text-danger px-4 py-2.5 text-[12.5px]">
            {error}
          </div>
        )}

        {view === "overview" && (
          <OverviewView
            identities={identities}
            status={status}
            recentEvents={recentEvents}
            onOpenIdentity={openIdentity}
            onNewIdentity={newIdentity}
            onGoBlueprints={() => setView("blueprints")}
          />
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
              creating={creating}
              onCreatingChange={setCreating}
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
