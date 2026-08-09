"use client";

import { useMemo } from "react";
import { panelEntries, type PanelEntry, type WallEvent } from "@mortal/wall/browser";
import { workLabel, type AgentNowLive } from "../../lib/wall-client";

/**
 * surface B: the reasoning panel (docs/surface-b-brief.md). drawn by the
 * frontend from the public event feed, under or beside a cell and never
 * inside the captured frame: the NOW intent line, then a dense
 * timestamped stream of READ / WENT / THOUGHT / WROTE lines. the tags
 * are a projection of existing event kinds, computed in the read model.
 * spend and every other operating figure stay in /health, off this
 * surface.
 */

const PANEL_LINES = 60;

export function ReasoningPanel({
  agent,
  events,
  now,
}: {
  agent: AgentNowLive;
  events: WallEvent[];
  now: number;
}) {
  const entries = useMemo(
    () => panelEntries(events, agent.agent_id, { limit: PANEL_LINES }),
    [events, agent.agent_id]
  );
  const ja = agent.locale?.startsWith("ja") ?? false;
  const work = workLabel(agent, now);
  return (
    <aside className="wall-panel" data-agent={agent.agent_id}>
      <div className="wall-now">
        <span className="label">now</span>
        <div className="intent-block">
          {agent.now_line ? (
            <div className="intent" lang={ja ? "ja" : undefined}>
              {agent.now_line}
            </div>
          ) : (
            <div className="intent quiet">{agent.state === "dead" ? "gone" : "waking up"}</div>
          )}
          {agent.now_line && agent.now_gloss ? (
            <div className="gloss">{agent.now_gloss}</div>
          ) : null}
        </div>
      </div>
      {/* the work: what this life is for, with the record's own count
          against its clock. stakes are what make a countdown watchable. */}
      {agent.work ? (
        <div className="wall-workline">
          <span className="label">the work</span>
          <div className="work-block">
            <div className="work-line">{agent.work.line}</div>
            {work ? <div className="work-count">{work}</div> : null}
          </div>
        </div>
      ) : null}
      <div className="wall-record">
        {entries.map((entry) => (
          <RecordLine key={entry.id} entry={entry} ja={ja} />
        ))}
        {entries.length === 0 ? (
          <div className="wall-record-empty">nothing on the record yet</div>
        ) : null}
      </div>
    </aside>
  );
}

function RecordLine({ entry, ja }: { entry: PanelEntry; ja: boolean }) {
  return (
    <div className={`entry ${entry.tag}`}>
      <span className="t">{clock(entry.ts)}</span>
      <span className="tag">{entry.tag}</span>
      <span className="text">
        <span lang={ja && entry.tag === "THOUGHT" ? "ja" : undefined}>{entry.text}</span>
        {entry.about_url && domainOf(entry.about_url) ? (
          <span className="about"> · {domainOf(entry.about_url)}</span>
        ) : null}
        {entry.gloss ? <span className="gloss">{entry.gloss}</span> : null}
      </span>
    </div>
  );
}

/** hh:mm:ss in the viewer's own clock; the iso ts stays in the data */
function clock(ts: string): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
