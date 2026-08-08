"use client";

import { useMemo, useState } from "react";
import {
  AGENT_CLASS_DISPLAY,
  directorPick,
  humanizeEvent,
  shortReceipt,
  type WallEvent,
} from "@mortal/wall/browser";
import { useRecap, useWall } from "../../lib/wall-client";
import { AgentCell } from "./AgentCell";

/**
 * the watch page (wall spec section 6): director cam with the tested
 * auto-cut priority, manual pin by clicking a small cell, the amber
 * monologue bar, the wire, and the "show the machine" annotation overlay
 * that prints the runtime primitive and receipt behind each event.
 */

const WIRE_LINES = 20;

export function Watch() {
  const { agents, events, connected, now } = useWall();
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [showMachine, setShowMachine] = useState(false);
  const recap = useRecap();

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
        <section className="wall-hero">
          {hero ? (
            <>
              <AgentCell agent={hero} events={events} now={now} />
              <div className="wall-voicebar">{hero.last_monologue ?? ""}</div>
            </>
          ) : (
            <div className="wall-empty" style={{ padding: 40 }}>
              nobody is on camera yet
            </div>
          )}
          <div className="wall-toolbar">
            <button className={showMachine ? "on" : ""} onClick={() => setShowMachine((v) => !v)}>
              show the machine
            </button>
            {pinnedId ? (
              <button onClick={() => setPinnedId(null)}>release pin</button>
            ) : (
              <span>auto-cut</span>
            )}
            <span style={{ flex: 1 }} />
            {hero ? (
              <a className="wall-spawnlink" href={spawnHref}>
                spawn one like {hero.name} ▸
              </a>
            ) : null}
          </div>
        </section>
        <aside className="wall-side">
          <div className="wall-minigrid">
            {rest.map((agent) => (
              <AgentCell
                key={agent.agent_id}
                agent={agent}
                events={events}
                now={now}
                onClick={() => setPinnedId(agent.agent_id)}
              />
            ))}
          </div>
          <div className="wall-wire">
            {wire.map((event) => (
              <WireLine key={event.id} event={event} showMachine={showMachine} agents={living} />
            ))}
          </div>
          <div className="wall-toolbar">
            <a href="/graveyard">graveyard</a>
            <a href="/">the gate</a>
          </div>
        </aside>
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
