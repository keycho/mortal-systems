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
        {/* the hero: one frame, given the room a director's cut deserves */}
        <section className="wall-stage">
          {hero ? (
            <AgentCell
              agent={hero}
              events={events}
              now={now}
              caption={hero.last_monologue ?? null}
              captionGloss={hero.last_monologue_gloss ?? null}
              signalLost={!connected}
            />
          ) : (
            <div className="wall-frame wall-frame-empty">nobody is on camera yet</div>
          )}
        </section>

        <div className="wall-stagebar">
          <button className={showMachine ? "on" : ""} onClick={() => setShowMachine((v) => !v)}>
            show the machine
          </button>
          {pinnedId ? (
            <button onClick={() => setPinnedId(null)}>release pin</button>
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
                onClick={() => setPinnedId(agent.agent_id)}
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
