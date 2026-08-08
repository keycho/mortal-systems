"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AGENT_CLASS_DISPLAY,
  directorPick,
  humanizeEvent,
  shortReceipt,
  type WallEvent,
} from "@mortal/wall/browser";
import { useRecap, useWall } from "../../lib/wall-client";
import { AgentCell } from "./AgentCell";
import { ReasoningPanel } from "./ReasoningPanel";

/**
 * the watch page (wall spec section 6): director cam with the tested
 * auto-cut priority, manual pin by clicking a small cell, the reasoning
 * panel (surface B) under the hero's frame, the wire, and the "show the
 * machine" annotation overlay that prints the runtime primitive and
 * receipt behind each event.
 */

const WIRE_LINES = 20;

export function Watch() {
  const { agents, events, connected, now } = useWall();
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [showMachine, setShowMachine] = useState(false);
  const recap = useRecap();

  // a gate cell links here as /watch?agent=<id>: that agent arrives
  // pinned as the hero. read on mount (this page is fully
  // client-rendered; a static export has no request to read from), and
  // keep the url honest as pins change so the address stays shareable.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("agent");
    if (wanted && /^ag_[a-z0-9_-]+$/.test(wanted)) setPinnedId(wanted);
  }, []);
  const pin = (agentId: string | null): void => {
    setPinnedId(agentId);
    const url = new URL(window.location.href);
    if (agentId) url.searchParams.set("agent", agentId);
    else url.searchParams.delete("agent");
    window.history.replaceState(null, "", url);
  };

  const living = useMemo(() => agents.filter((a) => a.state !== "unborn"), [agents]);
  const hero = useMemo(
    () => directorPick(living, events, { pinnedId, now: new Date(now) }),
    [living, events, pinnedId, now]
  );
  const rest = living.filter((a) => a.agent_id !== hero?.agent_id);
  const wire = useMemo(
    () =>
      [...events]
        .reverse()
        .slice(0, WIRE_LINES),
    [events]
  );

  const spawnHref = hero
    ? `/download?class=${encodeURIComponent(hero.class ?? "persona")}&region=${encodeURIComponent(hero.region ?? "")}&ttl=${
        hero.dies_at && hero.spawned_at
          ? Math.floor((Date.parse(hero.dies_at) - Date.parse(hero.spawned_at)) / 1000)
          : ""
      }`
    : "/download";

  return (
    <main className="wall">
      {recap.text ? (
        <div className="wall-recap">
          <span>while you were away: {recap.text}</span>
          <button onClick={recap.dismiss}>dismiss</button>
        </div>
      ) : null}
      {!connected && agents.length === 0 ? (
        <div className="wall-offline">the wall is unreachable from here right now</div>
      ) : null}
      <div className="wall-watch">
        {/* the hero row: surface A large and dominant, surface B the
            reasoning rail beside it. the two never mix: the frame is the
            captured browser, the rail is drawn from the event feed. */}
        <section className={`wall-stagerow${hero ? "" : " solo"}`}>
          <div className="wall-stagecell">
            {hero ? (
              <AgentCell agent={hero} events={events} now={now} signalLost={!connected} />
            ) : (
              <div className="wall-frame wall-frame-empty">nobody is on camera yet</div>
            )}
          </div>
          {hero ? (
            <div className="wall-stagerail">
              <ReasoningPanel agent={hero} events={events} />
            </div>
          ) : null}
        </section>

        <div className="wall-stagebar">
          <button className={showMachine ? "on" : ""} onClick={() => setShowMachine((v) => !v)}>
            show the machine
          </button>
          {pinnedId ? (
            <button onClick={() => pin(null)}>release pin</button>
          ) : (
            <span className="mode">auto-cut</span>
          )}
          <span className="spacer" />
          {hero ? (
            <a className="wall-spawnlink" href={spawnHref}>
              spawn one like {hero.name} ▸
            </a>
          ) : null}
        </div>

        {/* everyone else, on the gate's own grid: even cells, even gaps */}
        {rest.length > 0 ? (
          <section className="wall-grid wall-grid-rest">
            {rest.map((agent) => (
              <AgentCell
                key={agent.agent_id}
                agent={agent}
                events={events}
                now={now}
                signalLost={!connected}
                onClick={() => pin(agent.agent_id)}
                clickLabel={`focus ${agent.name}`}
              />
            ))}
          </section>
        ) : null}
      </div>

      {/* the wire gets its own strip, full width, the way the gate has it */}
      <div className="wall-wirefeed">
        {wire.map((event) => (
          <WireLine key={event.id} event={event} showMachine={showMachine} agents={living} />
        ))}
      </div>

      <div className="wall-watchfoot">
        <a href="/graveyard">graveyard</a>
        <a href="/">the gate</a>
      </div>
    </main>
  );
}

function WireLine({
  event,
  showMachine,
  agents,
}: {
  event: WallEvent;
  showMachine: boolean;
  agents: Array<{ agent_id: string; name: string }>;
}) {
  const name = agents.find((a) => a.agent_id === event.agent_id)?.name;
  return (
    <div className={`line ${event.kind}`}>
      {humanizeEvent(event, name)}
      {showMachine && (event.primitive || event.receipt) ? (
        <span className="machine">
          {event.primitive ?? ""}
          {event.receipt ? ` → ${shortReceipt(event.receipt)}` : ""}
        </span>
      ) : null}
    </div>
  );
}

/** class label helper kept for the spawn funnel copy */
export function classLabel(cls: keyof typeof AGENT_CLASS_DISPLAY | null): string {
  return cls ? AGENT_CLASS_DISPLAY[cls] : "persona";
}
