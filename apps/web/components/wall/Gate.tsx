"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { directorScore, humanizeEvent, spotlightAt, type PayloadFor } from "@mortal/wall/browser";
import { remainingSeconds, useWall } from "../../lib/wall-client";
import { Wordmark } from "../Wordmark";
import { AgentCell, VacantCell } from "./AgentCell";

/**
 * the gate (wall spec section 5, drawn to the "mortal gate" handoff): the
 * first thing anyone sees. framed screens with margin on a warm near-black
 * room, no nav, no feature copy. one monologue spotlight at a time for the
 * whole wall, a gate-level bar beneath the grid (surface B: agent text is
 * never drawn on a frame); the count line is live; everything else is
 * chrome. the frames themselves render the product site's light world,
 * and that contrast is the point.
 *
 * the grid sizes to the cast: exactly one cell per agent, columns capped
 * at three, so a three-agent wall is one full row instead of a row of
 * life over a row of vacant filler. the drifting vacant form appears
 * only when the room is empty.
 */

/** the empty room: one row of the drifting form, never a label */
const EMPTY_ROOM_SLOTS = 3;

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
  const router = useRouter();

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

  // a final hour holds the spotlight for the whole hour; otherwise it
  // rotates. either way exactly one caption renders across the wall.
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

  // the one voice on the wall right now: the held final-hour caption, or
  // the rotating spotlight when its speaker is on screen
  const speaker = finalHourAgent
    ? heldCaption
      ? finalHourAgent
      : null
    : (spotlight && sorted.find((a) => a.agent_id === spotlight.agent_id)) || null;
  const spokenText = finalHourAgent ? heldCaption : speaker ? spotlight?.text ?? null : null;
  const spokenGloss = speaker && spokenText ? (speaker.last_monologue_gloss ?? null) : null;

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

  const cols = Math.min(3, Math.max(1, sorted.length));
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
      <div className="wall-grid" data-cols={sorted.length === 0 ? EMPTY_ROOM_SLOTS : cols}>
        {sorted.map((agent) => (
          // a cell is a door: clicking it walks through to the watch
          // page with this identity pinned as the hero. the click
          // navigates the wall, never the page inside the frame.
          <AgentCell
            key={agent.agent_id}
            agent={agent}
            events={events}
            now={now}
            signalLost={signalLost}
            onClick={() => router.push(`/watch?agent=${encodeURIComponent(agent.agent_id)}`)}
            clickLabel={`watch ${agent.name} live`}
          />
        ))}
        {sorted.length === 0
          ? Array.from({ length: EMPTY_ROOM_SLOTS }, (_, i) => <VacantCell key={`vacant-${i}`} />)
          : null}
      </div>
      {/* surface B on the gate: the spotlight bar. the slot is always
          present at a fixed height, so a caption arriving or leaving
          never moves the wire or the foot */}
      <div className="wall-spotlight">
        <div className={`wall-spotline${spokenText ? "" : " out"}`}>
          {spokenText && speaker ? (
            <>
              <span className="who">{speaker.name}</span>
              <span className="line" lang={speaker.locale?.startsWith("ja") ? "ja" : undefined}>
                {spokenText}
              </span>
              {/* the japanese is the thing you see; this is for the viewer
                  who cannot read it, and it never replaces the line */}
              {spokenGloss ? <span className="gloss">{spokenGloss}</span> : null}
            </>
          ) : null}
        </div>
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
