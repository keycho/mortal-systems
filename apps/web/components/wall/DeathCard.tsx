"use client";

import { humanizeSeconds, shortReceipt } from "@mortal/wall/browser";
import { Wordmark } from "../Wordmark";

export interface DeadIdentity {
  agent_id: string;
  name: string;
  class: string | null;
  region: string | null;
  born: string | null;
  died: string | null;
  lived_seconds: number | null;
  cause: string | null;
  final_words: string | null;
  receipt: string | null;
}

/**
 * the death card: one fixed template, the same layout every time.
 * name, lifespan, cause, final words, receipt, wordmark. it is a meme
 * format; nothing about it varies per death.
 */
export function DeathCard({ dead }: { dead: DeadIdentity }) {
  return (
    <div className="death-card">
      <div className="name">{dead.name}</div>
      <div className="span">
        lived {dead.lived_seconds !== null ? humanizeSeconds(dead.lived_seconds) : "an unknown span"}
        {dead.died ? ` · died ${dead.died.slice(0, 10)}` : ""}
      </div>
      <div className="cause">cause: {dead.cause ?? "unknown"}</div>
      <div className="words">{dead.final_words || "no final words"}</div>
      <div className="receipt" title={dead.receipt ?? undefined}>
        teardown receipt {dead.receipt ? shortReceipt(dead.receipt) : "missing"}
      </div>
      <div className="mark">
        <Wordmark variant="wall" />
      </div>
    </div>
  );
}
