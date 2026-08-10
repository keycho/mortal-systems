"use client";

import { useEffect, useMemo, useState } from "react";
import { directorScore, humanizeEvent, spotlightAt, type PayloadFor } from "@mortal/wall/browser";
import { formatCount, recentlyDead, remainingSeconds, useWall, utcClock } from "../../lib/wall-client";
import { Wordmark } from "../Wordmark";
import { AgentCell, VacantCell, type CellCaption } from "./AgentCell";
import { WallChrome } from "./WallChrome";

/**
 * the wall (light handoff 2a): the first thing anyone sees. live frames
 * hung like plates on the cream ground, the oxide form and tv grain
 * behind them, the plate border with the runtime's own figures at the
 * corners, one typed-on monologue caption beneath its speaker's frame,
 * the wire, and the serif count line over the bordered enter.
 *
 * the grid sizes to the cast: exactly one cell per agent, columns capped
 * at three. a death keeps its frame for a short while, vacant (the
 * drifting form, never a label), then the cell leaves the wall. the
 * drifting vacant row appears only when the room is empty.
 */

/** the empty room: one row of the drifting form, never a label */
const EMPTY_ROOM_SLOTS = 3;

/** the caption types on at ~9 chars a second with a few characters of
 * head start, then holds (light handoff's own reveal) */
const TYPE_CPS = 9;
const TYPE_HEAD = 5;

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
  const { agents, alive, events, connected, now, stats } = useWall();
  const mounted = useMounted();

  // cells arrive sorted by the director score so the mobile hero is the
  // director pick, and a final hour outranks everything else. a recent
  // death stays on as a vacant frame; older dead leave the grid.
  const sorted = useMemo(() => {
    const living = agents.filter((a) => a.state !== "unborn" && a.state !== "dead");
    const rank = [...living].sort(
      (a, b) =>
        directorScore(b, events, new Date(now)) - directorScore(a, events, new Date(now))
    );
    const recentDead = agents.filter((a) => recentlyDead(a, now));
    return [...rank, ...recentDead];
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
  // the rotating spotlight when its speaker is on screen and alive
  const speaker = finalHourAgent
    ? heldCaption
      ? finalHourAgent
      : null
    : (spotlight &&
        sorted.find((a) => a.agent_id === spotlight.agent_id && a.state !== "dead")) ||
      null;
  const spokenText = finalHourAgent ? heldCaption : speaker ? spotlight?.text ?? null : null;
  const typed = useTypeOn(spokenText, speaker?.agent_id ?? null);
  const caption: CellCaption | null =
    speaker && typed
      ? {
          text: typed,
          gloss: speaker.last_monologue_gloss ?? null,
          lang: speaker.locale?.startsWith("ja") ? "ja" : undefined,
        }
      : null;

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
  // §6: the mobile hero is the spotlight's speaker, and a final hour wins
  const mobileHero = finalHourAgent ?? speaker ?? sorted[0] ?? null;

  return (
    <main className="wall wall-gate">
      <WallChrome
        field="wall"
        chips={{
          tl: "the wall · live",
          tr: stats ? `${alive} alive · ${formatCount(stats.destroyed)} destroyed to date` : null,
          bl: stats
            ? `${formatCount(stats.pages_read)} pages read · ${formatCount(stats.thoughts)} thoughts logged`
            : null,
          br: mounted ? `${utcClock(now)} utc · witness.run` : null,
        }}
      />
      {!connected && agents.length === 0 ? (
        <div className="wall-offline">the wall is unreachable from here right now</div>
      ) : null}
      <div className="wall-head">
        <Wordmark variant="wall" />
      </div>
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
            href={`/watch?agent=${encodeURIComponent(agent.agent_id)}`}
            clickLabel={`watch ${agent.name} live`}
            watchCue={`watch ${agent.name} ▸`}
            caption={speaker?.agent_id === agent.agent_id ? caption : null}
            mobileHero={mobileHero?.agent_id === agent.agent_id}
          />
        ))}
        {sorted.length === 0
          ? Array.from({ length: EMPTY_ROOM_SLOTS }, (_, i) => (
              <VacantCell key={`vacant-${i}`} withCaptionSlot />
            ))
          : null}
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
        <span className="count">{countLine}</span>
        {/* the wall is the front door now; this leaves it for the room
            behind: the product page */}
        <a className="enter" href="/about">
          about mortal ▸
        </a>
      </div>
    </main>
  );
}

/** true after hydration; gates the ticking clock chip so the prerendered
 * page never argues with the viewer's own clock */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/**
 * the caption reveal: ~9 chars a second from a short head start, then
 * hold. a new speaker or a new line restarts the reveal; reduced motion
 * swaps the whole caption without typing.
 */
function useTypeOn(text: string | null, speakerId: string | null): string | null {
  const [shown, setShown] = useState<string | null>(text);
  useEffect(() => {
    if (text === null) {
      setShown(null);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(text);
      return;
    }
    const started = Date.now();
    setShown(text.slice(0, TYPE_HEAD));
    const iv = setInterval(() => {
      const n = Math.floor(((Date.now() - started) / 1000) * TYPE_CPS) + TYPE_HEAD;
      if (n >= text.length) {
        setShown(text);
        clearInterval(iv);
      } else {
        setShown(text.slice(0, n));
      }
    }, 80);
    return () => clearInterval(iv);
  }, [text, speakerId]);
  return shown;
}
