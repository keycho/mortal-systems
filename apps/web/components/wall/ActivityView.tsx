"use client";

import type { AgentNowLive } from "../../lib/wall-client";

/**
 * the text-fallback state (handoff §4): what a frame is when no stream is
 * available. the state word and one at-line, drawn from the same event
 * stream the rest of the wall reads, inset 18/16. the cursor appears only
 * while the runtime reports the agent writing, which is the one piece of
 * motion a still frame earns.
 *
 * the monologue is not drawn here: it belongs to the caption slot beneath
 * the frame, one at a time across the whole wall.
 */
export function ActivityView({
  agent,
  atLine,
}: {
  agent: AgentNowLive;
  atLine?: string | null;
}) {
  const dead = agent.state === "dead";
  const writing = agent.state === "writing" || agent.state === "replying";
  const active = writing || agent.state === "reading";

  return (
    <div className="wall-activity">
      <div className={`state-line${active ? " active" : ""}`}>
        <span className="state-word">{dead ? "gone" : agent.state}</span>
        {writing ? <span className="cursor" aria-hidden="true" /> : null}
      </div>
      {!dead && atLine ? <div className="at-line">{atLine}</div> : null}
    </div>
  );
}
