"use client";

import { useMemo } from "react";
import { directorScore, humanizeEvent, spotlightAt, type PayloadFor } from "@mortal/wall/browser";
import { remainingSeconds, useWall } from "../../lib/wall-client";
import { Wordmark } from "../Wordmark";
import { AgentCell, VacantCell } from "./AgentCell";

/**
 * the gate (wall spec section 5, drawn to the "mortal gate" handoff): the
 * first thing anyone sees. framed screens with margin on a warm near-black
 * room, no nav, no feature copy. one monologue caption at a time in the
 * slot beneath its speaker; the count line is live; everything else is
 * chrome. the frames themselves render the product site's light world,
 * and that contrast is the point.
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

const MORE_WORDS = ["no", "one", "two", "three", "four", "five", "six"];

export function Gate() {
  const { agents, alive, events, connected, now } = useWall();

  // cells arrive sorted by the director score so the mobile hero is the
  // director pick, and a final hour outranks everything else
  const sorted = useMemo(() => {
    const living = agents.filter((a) => a.state !== "unborn");
    return [...living].sort(
      (a, b) =>
        directorScore(b, events, new Date(now)) - directorScore(a, events, new Date(now))
    );
  }, [agents, events, now]);

  const spotlight = useMemo(() => spotlightAt(events, new Date(now)), [events, now]);

  // a final hour holds its caption for the whole hour; otherwise the
  // spotlight rotates. either way exactly one caption renders at a time.
  const finalHourAgent = useMemo(
    () => sorted.find((a) => {
      const remaining = remainingSeconds(a, now);
      return remaining !== null && remaining < 3600 && a.state !== "dead";
    }),
    [sorted, now]
  );
  const heldCaption = useMemo(() => {
    if (!finalHourAgent) return null;
    const own = [...events]
      .reverse()
      .find((e) => e.agent_id === finalHourAgent.agent_id && e.kind === "monologue");
    return own ? (own.payload as PayloadFor<"monologue">).text : null;
  }, [finalHourAgent, events]);

  const captionFor = (agentId: string): string | null => {
    if (finalHourAgent) {
      return agentId === finalHourAgent.agent_id ? heldCaption : null;
    }
    return spotlight?.agent_id === agentId ? spotlight.text : null;
  };

  // the wire: the last 4 public events, newest first
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
  const hidden = Math.max(0, sorted.length - 1);
  const moreLine =
    hidden > 0
      ? `${MORE_WORDS[hidden] ?? hidden} more ${hidden === 1 ? "screen" : "screens"} inside`
      : null;
  // no stream and nothing arriving: the signal-lost dot, on those cells only
  const signalLost = !connected && agents.length > 0;

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
            caption={captionFor(agent.agent_id)}
            captionGloss={
              captionFor(agent.agent_id) ? (agent.last_monologue_gloss ?? null) : null
            }
            signalLost={signalLost}
          />
        ))}
        {Array.from({ length: vacants }, (_, i) => (
          <VacantCell key={`vacant-${i}`} />
        ))}
      </div>
      {moreLine ? (
        <div className="wall-more">
          {moreLine}
          <br />
          <a href="/watch">swipe ▸</a>
        </div>
      ) : null}
      <div className="wall-wirestrip">
        <div className="track">
          {[0, 1].map((run) => (
            <div className="run" key={run} aria-hidden={run === 1}>
              {strip.map((entry) => (
                <span key={`${run}-${entry.id}`} className={`entry ${entry.kind}`}>
                  {entry.line}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="wall-foot">
        <Wordmark variant="wall" />
        <span className="count">{countLine}</span>
        <a className="enter" href="/watch">
          enter ▸
        </a>
      </div>
    </main>
  );
}
