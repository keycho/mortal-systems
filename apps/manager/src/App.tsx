import { useCallback, useEffect, useState } from "react";
import type {
  ActivityEvent,
  BlueprintSummary,
  IdentityManifest,
  IdentitySummary,
  RuntimeStatus,
} from "@mortal/schema";
import { rpc, RpcClientError } from "./lib/client.js";
import { IdentityNavigator, type View } from "./components/IdentityNavigator.js";
import { Button } from "./components/ui.js";
import { CreateIdentityForm } from "./components/CreateIdentityForm.js";
import { OverviewView } from "./views/OverviewView.js";
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
  const [loaded, setLoaded] = useState(false);
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
      const feeds = await Promise.all(
        list.slice(0, 8).map(async (summary) => {
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
    } finally {
      setLoaded(true);
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
    setCreating(false);
    setSelectedId(id);
  }

  function newIdentity() {
    setView("identities");
    setSelectedId(null);
    setCreating(true);
  }

  const workspace = selectedId !== null && detail !== null ? detail : null;

  return (
    <div className="h-full flex">
      <IdentityNavigator
        identities={identities}
        status={status}
        view={view}
        selectedId={selectedId}
        onSelect={openIdentity}
        onNewIdentity={newIdentity}
        onNavigate={(v) => {
          setView(v);
          setSelectedId(null);
          setCreating(false);
        }}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {error !== null && (
          <div className="border-b border-danger/40 bg-panel text-danger px-6 py-2.5 text-[13px] flex items-center gap-4 shrink-0">
            <span className="truncate">{error}</span>
            <Button variant="secondary" size="sm" className="ml-auto shrink-0" onClick={() => void refresh()}>
              retry
            </Button>
          </div>
        )}

        {!loaded ? (
          <div className="flex-1 flex items-center justify-center text-[14px] text-mute">
            connecting to the runtime…
          </div>
        ) : creating ? (
          <div className="flex-1 overflow-auto px-8 py-6">
            <div className="max-w-md flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <h1 className="text-[20px] font-medium">new identity</h1>
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setCreating(false)}>
                  cancel
                </Button>
              </div>
              <CreateIdentityForm
                onCreate={async (manifest: IdentityManifest) => {
                  await act(() => rpc("identity.create", { manifest }));
                  setCreating(false);
                }}
              />
            </div>
          </div>
        ) : workspace !== null ? (
          <IdentityWorkspace
            key={workspace.summary.id}
            data={workspace}
            status={status}
            blueprints={blueprints}
            onLaunch={(id) => void act(() => rpc("identity.launch", { id }))}
            onSuspend={(id) => void act(() => rpc("identity.suspend", { id }))}
            onResume={(id) => void act(() => rpc("identity.resume", { id }))}
            onExpireNow={(id) => void act(() => rpc("identity.expire", { id }))}
            onDestroy={(id) => void act(() => rpc("identity.destroy", { id }))}
          />
        ) : view === "blueprints" ? (
          <div className="flex-1 overflow-auto px-8 py-6">
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
          </div>
        ) : view === "activity" ? (
          <div className="flex-1 overflow-auto px-8 py-6">
            <ActivityView />
          </div>
        ) : view === "guarantees" ? (
          <div className="flex-1 overflow-auto px-8 py-6">
            <GuaranteesView />
          </div>
        ) : view === "settings" ? (
          <div className="flex-1 overflow-auto px-8 py-6">
            <SettingsView status={status} />
          </div>
        ) : (
          <OverviewView
            identities={identities}
            status={status}
            recentEvents={recentEvents}
            onOpenIdentity={openIdentity}
            onNewIdentity={newIdentity}
            onGoBlueprints={() => setView("blueprints")}
          />
        )}
      </div>
    </div>
  );
}
