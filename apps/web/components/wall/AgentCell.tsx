"use client";

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
 * one frame on the wall (handoff §3, §4): the screen and the status bar,
 * nothing else. this is surface A, and the two-surface rule
 * (docs/surface-b-brief.md) is that no agent text is ever drawn on or
 * around the captured frame: reasoning belongs to surface B, the gate's
 * spotlight bar and the watch page's reasoning panel. everything
 * screenshotable carries the name and the countdown inside the frame
 * chrome.
 *
 * a frame shows live video when the api hands it an hls url; otherwise
 * the ActivityView is the text-fallback state, drawn from the same event
 * stream. the site draws only the status bar and the ttl: what is inside
 * a live frame is captured video, never chrome (§7).
 */
export function AgentCell({
  agent,
  events,
  now,
  signalLost,
  onClick,
}: {
  agent: AgentNowLive;
  events: WallEvent[];
  now: number;
  /** no stream and nothing arriving: the only dot on the wall */
  signalLost?: boolean;
  onClick?: () => void;
}) {
  const remaining = remainingSeconds(agent, now);
  const finalHour = remaining !== null && remaining < 3600 && agent.state !== "dead";
  const streaming = Boolean(agent.stream_url) && agent.state !== "dead";
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

  return (
    <div
      className={`wall-cell${finalHour ? " final-hour" : ""}`}
      data-agent={agent.agent_id}
      data-clickable={onClick ? "1" : undefined}
    >
      <div className="wall-frame" onClick={onClick}>
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
            {agent.state === "dead"
              ? "00:00:00"
              : finalHour
                ? finalHourLabel(remaining)
                : countdownLabel(remaining)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** an empty slot: the drifting form, no status bar, never a label (§4) */
export function VacantCell() {
  return (
    <div className="wall-cell vacant">
      <div className="wall-frame">
        <VacantForm />
      </div>
    </div>
  );
}
