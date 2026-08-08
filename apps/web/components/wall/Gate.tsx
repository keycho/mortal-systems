"use client";

import { useMemo } from "react";
import { directorScore, humanizeEvent, spotlightAt } from "@mortal/wall/browser";
import { useWall } from "../../lib/wall-client";
import { AgentCell, VacantCell } from "./AgentCell";

/**
 * the gate (wall spec section 5): the first thing anyone sees. a full
 * bleed wall of cells, no nav, no feature copy. one monologue caption at
 * a time; the count line is live; everything else is chrome.
 */

const GRID_SLOTS = 6;

const COUNT_WORDS = [
  "no identities are",
  "one identity is",
  "two identities are",
  "three identities are",
  "four identities are",
  "five identities are",
  "six identities are",
];

export function Gate() {
  const { agents, alive, events, connected, now } = useWall();

  // cells arrive sorted by the director score so the mobile top-2 are the
  // director pick and the most eventful cell
  const sorted = useMemo(() => {
    const living = agents.filter((a) => a.state !== "unborn");
    return [...living].sort(
      (a, b) =>
        directorScore(b, events, new Date(now)) - directorScore(a, events, new Date(now))
    );
  }, [agents, events, now]);

  const spotlight = useMemo(() => spotlightAt(events, new Date(now)), [events, now]);
  // the global strip: the last 4 public events, newest first (the spec's
  // literal reading, restored per the DECISIONS.md flag; per-cell status
  // lines stay as they are)
  const strip = useMemo(() => {
    const names = new Map(agents.map((a) => [a.agent_id, a.name]));
    return [...events]
      .reverse()
      .slice(0, 4)
      .map((event) => ({
        id: event.id,
        kind: event.kind,
        line: humanizeEvent(event, names.get(event.agent_id)),
      }));
  }, [events, agents]);
  const vacants = Math.max(0, GRID_SLOTS - sorted.length);
  const countLine =
    alive <= 6 ? `${COUNT_WORDS[alive]} alive right now` : `${alive} identities are alive right now`;

  return (
    <main className="wall wall-gate">
      {!connected && agents.length === 0 ? (
        <div className="wall-offline">the wall is unreachable from here right now</div>
      ) : null}
      <div className="wall-grid">
        {sorted.map((agent) => (
          <AgentCell
            key={agent.agent_id}
            agent={agent}
            events={events}
            now={now}
            caption={spotlight?.agent_id === agent.agent_id ? spotlight.text : null}
            dimmed={Boolean(spotlight) && spotlight?.agent_id !== agent.agent_id}
          />
        ))}
        {Array.from({ length: vacants }, (_, i) => (
          <VacantCell key={`vacant-${i}`} />
        ))}
      </div>
      <div className="wall-strip">
        {strip.map((entry) => (
          <span key={entry.id} className={`entry ${entry.kind}`}>
            {entry.line}
          </span>
        ))}
      </div>
      <div className="wall-foot">
        <span className="wordmark">mortal systems</span>
        <span className="count">{countLine}</span>
        <a className="enter" href="/watch">
          enter ▸
        </a>
      </div>
    </main>
  );
}
