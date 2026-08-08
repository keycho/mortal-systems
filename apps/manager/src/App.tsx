import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ActivityEvent,
  BlueprintSummary,
  IdentityManifest,
  IdentitySummary,
  RuntimeStatus,
} from "@mortal/schema";
import { rpc, RpcClientError } from "./lib/client.js";
import { IdentityNavigator, type View } from "./components/IdentityNavigator.js";
import { Button, Modal, Toasts, type ToastItem } from "./components/ui.js";
import { CreateIdentityForm } from "./components/CreateIdentityForm.js";
import { RuntimeUnreachable } from "./components/RuntimeUnreachable.js";
import { HomeView } from "./views/HomeView.js";
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
  const [prefillName, setPrefillName] = useState<string | null>(null);
  const [prefillLifetime, setPrefillLifetime] = useState<string | null>(null);
  const [preselectBlueprint, setPreselectBlueprint] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);

  const toast = useCallback((message: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

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
          .slice(0, 24)
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
    async (fn: () => Promise<unknown>, done?: string) => {
      try {
        await fn();
        await refresh();
        if (selectedId !== null) await refreshDetail(selectedId);
        if (done !== undefined) toast(done);
      } catch (err) {
        if (err instanceof RpcClientError) setError(`${err.code}: ${err.message}`);
        else setError(err instanceof Error ? err.message : String(err));
      }
    },
    [refresh, refreshDetail, selectedId, toast]
  );

  function openIdentity(id: string) {
    setView("identities");
    setCreating(false);
    setSelectedId(id);
  }

  const workspace = selectedId !== null && detail !== null ? detail : null;
  const unreachable = loaded && status === null;

  return (
    <div className="h-full flex bg-app">
      <IdentityNavigator
        identities={identities}
        status={status}
        view={view}
        selectedId={selectedId}
        onSelect={openIdentity}
        onNewIdentity={() => {
          setPrefillName(null);
          setPrefillLifetime(null);
          setCreating(true);
        }}
        onNavigate={(v) => {
          setView(v);
          setSelectedId(null);
        }}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {error !== null && !unreachable && (
          <div className="mx-8 mt-4 rounded-xl bg-surface border border-danger/40 text-danger px-4 py-2.5 text-[13px] flex items-center gap-4">
            <span className="truncate">{error}</span>
            <Button variant="secondary" size="sm" className="ml-auto shrink-0" onClick={() => void refresh()}>
              retry
            </Button>
          </div>
        )}

        {!loaded ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4" aria-busy="true">
            <div className="w-full max-w-md flex flex-col gap-3 px-8">
              <div className="h-7 w-40 rounded-lg bg-surface animate-pulse" />
              <div className="h-24 rounded-2xl bg-surface animate-pulse" />
              <div className="h-16 rounded-xl bg-surface animate-pulse" />
            </div>
          </div>
        ) : unreachable ? (
          <RuntimeUnreachable error={error} onRetry={() => void refresh()} />
        ) : workspace !== null ? (
          <IdentityWorkspace
            key={workspace.summary.id}
            data={workspace}
            status={status}
            blueprints={blueprints}
            onLaunch={(id) => void act(() => rpc("identity.launch", { id }), "browser launched")}
            onSuspend={(id) => void act(() => rpc("identity.suspend", { id }), "suspended — data kept")}
            onResume={(id) => void act(() => rpc("identity.resume", { id }), "resumed")}
            onExpireNow={(id) => void act(() => rpc("identity.expire", { id }), "expiry started")}
            onDestroy={(id) => void act(() => rpc("identity.destroy", { id }), "destroyed — receipt recorded")}
          />
        ) : view === "blueprints" ? (
          <div className="flex-1 overflow-auto">
            <div className="max-w-4xl mx-auto px-8 py-7">
              <BlueprintsView
                initialPreviewId={preselectBlueprint}
                blueprints={blueprints}
                onLoadManifest={async (id) => (await rpc("blueprint.get", { id })).manifest}
                onCreate={({ blueprintId, lifetime, consentedExtensionIds }) =>
                  act(
                    () =>
                      rpc("identity.createFromBlueprint", {
                        blueprintId,
                        overrides: {
                          ...(lifetime ? { lifetime } : {}),
                          ...(consentedExtensionIds.length > 0 ? { consentedExtensionIds } : {}),
                        },
                      }),
                    "identity created from blueprint"
                  )
                }
              />
            </div>
          </div>
        ) : view === "activity" ? (
          <div className="flex-1 overflow-auto">
            <div className="max-w-4xl mx-auto px-8 py-7">
              <ActivityView />
            </div>
          </div>
        ) : view === "guarantees" ? (
          <div className="flex-1 overflow-auto">
            <div className="max-w-4xl mx-auto px-8 py-7">
              <GuaranteesView />
            </div>
          </div>
        ) : view === "settings" ? (
          <div className="flex-1 overflow-auto">
            <div className="max-w-4xl mx-auto px-8 py-7">
              <SettingsView status={status} />
            </div>
          </div>
        ) : (
          <HomeView
            identities={identities}
            blueprints={blueprints}
            recentEvents={recentEvents}
            runtimeUp={status !== null}
            onOpenIdentity={openIdentity}
            onCreateWithName={(name) => {
              setPrefillName(name);
              setPrefillLifetime(null);
              setCreating(true);
            }}
            onPickBlueprint={(blueprintId) => {
              setPreselectBlueprint(blueprintId);
              setView("blueprints");
              setSelectedId(null);
            }}
            onTemporaryBrowsing={() => {
              setPrefillName("temporary browsing");
              setPrefillLifetime("1h");
              setCreating(true);
            }}
          />
        )}
      </div>

      {creating && (
        <Modal title="new identity" onClose={() => setCreating(false)}>
          <CreateIdentityForm
            initialName={prefillName ?? undefined}
            initialLifetime={prefillLifetime ?? undefined}
            onCreate={async (manifest: IdentityManifest) => {
              await act(() => rpc("identity.create", { manifest }), "identity created");
              setCreating(false);
            }}
          />
        </Modal>
      )}

      <Toasts items={toasts} />
    </div>
  );
}
