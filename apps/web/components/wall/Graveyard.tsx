"use client";

import { useEffect, useState } from "react";
import { WALL_API } from "../../lib/wall-client";
import { DeathCard, type DeadIdentity } from "./DeathCard";

/** one page per dead identity: the card, and a link to the frozen archive */
export function Graveyard() {
  const [dead, setDead] = useState<DeadIdentity[] | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  useEffect(() => {
    void fetch(`${WALL_API}/graveyard`)
      .then((res) => res.json())
      .then((body: { dead: DeadIdentity[] }) => setDead(body.dead))
      .catch(() => setUnreachable(true));
  }, []);
  return (
    <main className="wall">
      <div className="wall-graveyard">
        <h1>the graveyard</h1>
        <p className="intro">
          every identity that has lived on the wall and is gone. archives are frozen read-only;
          each receipt is the hash of the recorded teardown, recomputable from the event itself.
        </p>
        {unreachable ? <p className="wall-empty">the graveyard is unreachable from here right now</p> : null}
        {dead && dead.length === 0 ? <p className="wall-empty">nobody has died yet</p> : null}
        <div className="wall-cards">
          {(dead ?? []).map((d) => (
            <DeathCard key={d.agent_id} dead={d} />
          ))}
        </div>
        <div className="wall-toolbar" style={{ marginTop: 32 }}>
          <a href="/watch">back to the wall</a>
        </div>
      </div>
    </main>
  );
}
