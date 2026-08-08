"use client";

import { humanizeEvent, type WallEvent } from "@mortal/wall/browser";
import {
  countdownLabel,
  remainingSeconds,
  streamSrc,
  type AgentNowLive,
} from "../../lib/wall-client";
import { ActivityView } from "./ActivityView";
import { HlsVideo } from "./HlsVideo";

/**
 * one cell of the wall. everything screenshotable carries the name and the
 * countdown inside the cell chrome. a cell shows live video only when the
 * api hands it a real hls url (any provider); the ActivityView is the
 * permanent renderer otherwise and the poster fallback layer once cameras
 * exist. never a black cell, never a fake feed.
 */
export function AgentCell({
  agent,
  events,
  now,
  caption,
  dimmed,
  onClick,
}: {
  agent: AgentNowLive;
  events: WallEvent[];
  now: number;
  caption?: string | null;
  dimmed?: boolean;
  onClick?: () => void;
}) {
  const remaining = remainingSeconds(agent, now);
  const finalHour = remaining !== null && remaining < 3600;
  const lastLine = [...events]
    .reverse()
    .find((e) => e.agent_id === agent.agent_id && e.kind !== "monologue");
  return (
    <div
      className={`wall-cell${finalHour ? " final-hour" : ""}${dimmed ? " dimmed" : ""}`}
      onClick={onClick}
      data-agent={agent.agent_id}
    >
      <div className="wall-frame">
        {agent.stream_url && agent.state !== "dead" ? (
          <HlsVideo src={streamSrc(agent.stream_url)} />
        ) : (
          <ActivityView agent={agent} events={events} />
        )}
      </div>
      {caption ? <div className="wall-caption">{caption}</div> : null}
      <div className="wall-status">
        <span>
          {agent.name} · {agent.region ?? "nowhere"} · {agent.state}
        </span>
        <span className="ttl">{agent.state === "dead" ? "00:00" : countdownLabel(remaining)}</span>
      </div>
      <div className="wall-cell-strip">
        {lastLine ? humanizeEvent(lastLine, agent.name) : " "}
      </div>
    </div>
  );
}

export function VacantCell() {
  return (
    <div className="wall-cell vacant">
      <div className="wall-frame" />
      <div className="wall-status">
        <span>vacant</span>
        <span className="ttl">--</span>
      </div>
      <div className="wall-cell-strip">{" "}</div>
    </div>
  );
}
