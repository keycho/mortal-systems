"use client";

import { useEffect, useRef, useState } from "react";
import { humanizeEvent, type PayloadFor, type WallEvent } from "@mortal/wall/browser";
import type { AgentNowLive } from "../../lib/wall-client";

/**
 * the permanent grid-cell renderer: a live activity view drawn purely
 * from the event stream. this is what a cell IS without video, and the
 * poster fallback layer once cameras exist. everything shown is a real
 * event doing its job: the state word, the page the agent has open, the
 * last discrete act, a monologue flashing as it is thought, and a
 * cursor only while the runtime reports state=writing.
 */

const MONOLOGUE_FLASH_MS = 8_000;

export function ActivityView({
  agent,
  events,
  muteFlash = false,
}: {
  agent: AgentNowLive;
  events: WallEvent[];
  /** true when the cell already carries a caption (the gate spotlight);
   * one monologue per cell, never two layers of amber */
  muteFlash?: boolean;
}) {
  const [flash, setFlash] = useState<{ id: string; text: string } | null>(null);
  const seenRef = useRef<string | null>(null);

  // latest events for this agent, newest last
  const own = events.filter((e) => e.agent_id === agent.agent_id);
  const lastAction = [...own]
    .reverse()
    .find((e) => e.kind === "action" || e.kind === "human_contact" || e.kind === "enforcement");
  const lastMonologue = [...own].reverse().find((e) => e.kind === "monologue");

  useEffect(() => {
    if (!lastMonologue || lastMonologue.id === seenRef.current) return;
    const first = seenRef.current === null;
    seenRef.current = lastMonologue.id;
    // the very first render is history, not a fresh thought; only flash
    // monologues that arrive while watching
    if (first) return;
    setFlash({
      id: lastMonologue.id,
      text: (lastMonologue.payload as PayloadFor<"monologue">).text,
    });
    const timer = setTimeout(() => setFlash(null), MONOLOGUE_FLASH_MS);
    return () => clearTimeout(timer);
  }, [lastMonologue]);

  const dead = agent.state === "dead";
  const writing = agent.state === "writing" || agent.state === "replying";
  const active = writing || agent.state === "reading";

  return (
    <div className="wall-activity">
      <div className={`state-line${active ? " active" : ""}`}>
        <span className="state-word">{dead ? "gone" : agent.state}</span>
        {writing ? <span className="cursor" aria-hidden="true" /> : null}
      </div>
      {!dead && agent.current_url_title ? (
        <div className="page-line" title={agent.current_url_title}>
          {agent.state === "reading" ? "on: " : "at: "}
          {agent.current_url_title}
        </div>
      ) : null}
      {!dead && lastAction ? (
        <div className="action-line">{humanizeEvent(lastAction, agent.name)}</div>
      ) : null}
      {flash && !muteFlash ? (
        <div key={flash.id} className="monologue-flash">
          {flash.text}
        </div>
      ) : null}
    </div>
  );
}
