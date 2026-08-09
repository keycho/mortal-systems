"use client";

import { useRef } from "react";
import { humanizeEvent, type WallEvent } from "@mortal/wall/browser";
import {
  countdownLabel,
  finalHourLabel,
  remainingSeconds,
  streamSrc,
  type AgentNowLive,
} from "../../lib/wall-client";
import { ActivityView } from "./ActivityView";
import { HlsVideo } from "./HlsVideo";
import { VacantForm } from "./VacantForm";

/**
 * one frame on the wall (handoff §3, §4; light skin 2a): the screen and
 * the status bar, plus, on the wall only, the 38px monologue-caption slot
 * beneath the frame. the caption is the one piece of agent text allowed
 * near a frame, and it sits under the plate, never on the captured
 * screen: what is inside a live frame is video, never chrome (§7).
 *
 * death is drawn, not narrated: at ttl zero the feed ends and the frame
 * goes vacant, the drifting oxide form with no status bar and never a
 * label. the cell leaves the wall a beat later, when the snapshot stops
 * carrying its recent death.
 */

export interface CellCaption {
  text: string;
  gloss?: string | null;
  lang?: string;
}

export function AgentCell({
  agent,
  events,
  now,
  signalLost,
  onClick,
  clickLabel,
  href,
  caption,
  mobileHero,
  watchCue,
}: {
  agent: AgentNowLive;
  events: WallEvent[];
  now: number;
  /** no stream and nothing arriving: the only dot on the wall */
  signalLost?: boolean;
  onClick?: () => void;
  /** what the click does, for assistive tech ("watch yuki live") */
  clickLabel?: string;
  /** where the frame leads; a frame you can click is a frame you can watch */
  href?: string;
  /** the wall's caption slot: pass null to reserve the slot, undefined
   * for pages that draw agent text elsewhere (the gate's panel) */
  caption?: CellCaption | null;
  /** §6: the one frame the mobile wall keeps (spotlight speaker, final
   * hour first); the rest are named, not drawn */
  mobileHero?: boolean;
  /** the visible cue under the frame ("watch yuki ▸"): the whole cell
   * already navigates, this makes it discoverable. a span, never a
   * nested anchor: the cell itself is the link. */
  watchCue?: string;
}) {
  const remaining = remainingSeconds(agent, now);
  const finalHour = remaining !== null && remaining < 3600 && agent.state !== "dead";
  const dead = agent.state === "dead";
  const streaming = Boolean(agent.stream_url) && !dead;
  const lastLine = [...events]
    .reverse()
    .find(
      (e) =>
        e.agent_id === agent.agent_id && e.kind !== "monologue" && e.kind !== "narration"
    );
  // the at-line: the page they have open, else what they last did
  const atLine = agent.current_url_title
    ? `${agent.state === "reading" ? "on: " : "at: "}${agent.current_url_title}`
    : lastLine
      ? humanizeEvent(lastLine, agent.name)
      : null;

  // ttl zero: the feed ends and the frame goes vacant (never the word)
  const frame = dead ? (
    <div className="wall-frame">
      <VacantForm />
    </div>
  ) : (
    <div
      className="wall-frame"
      onClick={href ? undefined : onClick}
      // a clickable frame is a control: reachable by keyboard, named
      // for what it does. the video inside stays pixels either way.
      role={onClick && !href ? "button" : undefined}
      tabIndex={onClick && !href ? 0 : undefined}
      aria-label={onClick && !href ? (clickLabel ?? `watch ${agent.name}`) : undefined}
      onKeyDown={
        onClick && !href
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="wall-screen">
        {streaming ? (
          <HlsVideo src={streamSrc(agent.stream_url as string)} />
        ) : (
          <ActivityView agent={agent} atLine={atLine} />
        )}
        {signalLost && !streaming ? (
          <div className="wall-lost">
            <span className="dot" aria-hidden />
            <span className="label">signal lost</span>
          </div>
        ) : null}
      </div>
      <div className="wall-status">
        <span className="who">
          {agent.name} · {agent.region ?? "nowhere"} · {agent.state}
        </span>
        <span className="ttl">
          {finalHour ? finalHourLabel(remaining) : countdownLabel(remaining)}
        </span>
      </div>
    </div>
  );

  const body = (
    <>
      {frame}
      {watchCue && !dead ? <span className="wall-watchcue">{watchCue}</span> : null}
      {caption !== undefined ? <CaptionSlot caption={dead ? null : caption} /> : null}
    </>
  );

  const className = `wall-cell${finalHour ? " final-hour" : ""}${dead ? " vacant" : ""}`;
  const hero = mobileHero ? "1" : undefined;
  if (href && !dead) {
    return (
      <a
        className={className}
        data-agent={agent.agent_id}
        data-clickable="1"
        data-mobile-hero={hero}
        href={href}
        aria-label={clickLabel ?? `watch ${agent.name} live`}
      >
        {body}
      </a>
    );
  }
  return (
    <div
      className={className}
      data-agent={agent.agent_id}
      data-clickable={onClick && !dead ? "1" : undefined}
      data-mobile-hero={hero}
    >
      {body}
    </div>
  );
}

/**
 * the caption slot (handoff §3): 38px reserved under every wall frame so
 * a caption arriving or leaving never moves the grid. the slot keeps the
 * last caption while fading out, which is what makes the 0.8s fade a
 * fade instead of a cut.
 */
function CaptionSlot({ caption }: { caption: CellCaption | null }) {
  const last = useRef<CellCaption | null>(null);
  if (caption) last.current = caption;
  const shown = caption ?? last.current;
  return (
    <div className={`wall-cap${caption ? "" : " out"}`}>
      {shown ? (
        <>
          <span lang={shown.lang}>{shown.text}</span>
          {shown.gloss ? <span className="gloss">{shown.gloss}</span> : null}
        </>
      ) : null}
    </div>
  );
}

/** an empty slot: the drifting form, no status bar, never a label (§4) */
export function VacantCell({ withCaptionSlot = false }: { withCaptionSlot?: boolean }) {
  return (
    <div className="wall-cell vacant">
      <div className="wall-frame">
        <VacantForm />
      </div>
      {withCaptionSlot ? <div className="wall-cap out" /> : null}
    </div>
  );
}
