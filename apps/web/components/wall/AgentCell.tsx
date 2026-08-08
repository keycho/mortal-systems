"use client";

import { humanizeEvent, type WallEvent } from "@mortal/wall/browser";
import { countdownLabel, remainingSeconds, type AgentNowLive } from "../../lib/wall-client";

/**
 * one cell of the wall. everything screenshotable carries the name and the
 * countdown inside the cell chrome. until the capture pipeline lands
 * (build order step 5) the frame renders the agent's live state word and
 * says "events only", never a black cell and never a fake feed.
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
  const active = agent.state === "writing" || agent.state === "replying" || agent.state === "reading";
  return (
    <div
      className={`wall-cell${finalHour ? " final-hour" : ""}${dimmed ? " dimmed" : ""}`}
      onClick={onClick}
      data-agent={agent.agent_id}
    >
      <div className="wall-frame">
        <span className={`state-word${active ? " active" : ""}`}>
          {agent.state === "dead" ? "gone" : agent.state}
        </span>
        <span className="no-feed">events only</span>
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
