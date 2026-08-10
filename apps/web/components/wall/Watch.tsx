"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AGENT_CLASS_DISPLAY,
  directorPick,
  humanizeEvent,
  shortReceipt,
  type WallEvent,
} from "@mortal/wall/browser";
import {
  countdownLabel,
  finalHourLabel,
  formatCount,
  postPermalink,
  recentlyDead,
  remainingSeconds,
  useRecap,
  usePublishedPosts,
  useWall,
  utcClock,
} from "../../lib/wall-client";
import { AgentCell } from "./AgentCell";
import { ReasoningPanel } from "./ReasoningPanel";
import { WallChrome } from "./WallChrome";

/**
 * the gate, browse-forward (light handoff 2b): the hero feed with the
 * reasoning panel beside it, the controls row, the rest of the cast in
 * smaller frames below, the wire, and the plate border naming who is on
 * camera. director cam with the tested auto-cut priority; clicking a
 * small cell pins it, and the wall's frames arrive here already pinned
 * via ?agent=. "show the machine" prints the runtime primitive and
 * receipt behind each wire line.
 */

const WIRE_LINES = 20;

export function Watch() {
  const { agents, events, connected, now, stats } = useWall();
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [showMachine, setShowMachine] = useState(false);
  const [mounted, setMounted] = useState(false);
  const recap = useRecap();

  // a wall cell links here as /watch?agent=<id>: that agent arrives
  // pinned as the hero. read on mount (this page is fully
  // client-rendered; a static export has no request to read from), and
  // keep the url honest as pins change so the address stays shareable.
  useEffect(() => {
    setMounted(true);
    const wanted = new URLSearchParams(window.location.search).get("agent");
    if (wanted && /^ag_[a-z0-9_-]+$/.test(wanted)) setPinnedId(wanted);
  }, []);
  const pin = (agentId: string | null): void => {
    setPinnedId(agentId);
    const url = new URL(window.location.href);
    if (agentId) url.searchParams.set("agent", agentId);
    else url.searchParams.delete("agent");
    window.history.replaceState(null, "", url);
  };

  const living = useMemo(() => agents.filter((a) => a.state !== "unborn"), [agents]);
  // directorPick returns the read model's AgentNow; resolve it back into
  // the live list so the hero keeps stream_url and the chip figures
  const hero = useMemo(() => {
    const pick = directorPick(living, events, { pinnedId, now: new Date(now) });
    return pick ? (living.find((a) => a.agent_id === pick.agent_id) ?? null) : null;
  }, [living, events, pinnedId, now]);
  // a small frame's death keeps its vacant plate for a while, like the
  // wall; long-gone agents leave the row
  const rest = living.filter(
    (a) => a.agent_id !== hero?.agent_id && (a.state !== "dead" || recentlyDead(a, now))
  );
  const wire = useMemo(
    () =>
      [...events]
        .reverse()
        .slice(0, WIRE_LINES),
    [events]
  );

  // the identity's published writing, off the record. the count of its
  // publish events is the refetch key: the list changes exactly when it
  // publishes again, and never on an ordinary beat.
  const publishedCount = useMemo(
    () =>
      events.filter(
        (e) =>
          e.agent_id === hero?.agent_id &&
          e.kind === "action" &&
          (e.payload as { verb?: string }).verb === "published_post"
      ).length,
    [events, hero?.agent_id]
  );
  const posts = usePublishedPosts(hero?.agent_id ?? null, publishedCount);

  const spawnHref = hero
    ? `/download?class=${encodeURIComponent(hero.class ?? "persona")}&region=${encodeURIComponent(hero.region ?? "")}&ttl=${
        hero.dies_at && hero.spawned_at
          ? Math.floor((Date.parse(hero.dies_at) - Date.parse(hero.spawned_at)) / 1000)
          : ""
      }`
    : "/download";

  const heroRemaining = hero ? remainingSeconds(hero, now) : null;
  const heroFinalHour = heroRemaining !== null && heroRemaining < 3600;
  const heroTtl =
    heroRemaining === null
      ? null
      : heroFinalHour
        ? finalHourLabel(heroRemaining)
        : countdownLabel(heroRemaining);

  return (
    <main className="wall wall-watch-page">
      <WallChrome
        field="gate"
        chips={{
          tl: hero ? `watching · ${hero.name}` : null,
          tr: heroTtl ? `${heroTtl} remaining` : null,
          trTone: heroFinalHour ? "final" : "life",
          bl: hero
            ? `${formatCount(hero.pages_read ?? 0)} pages read · ${formatCount(hero.thoughts_today ?? 0)} thoughts today`
            : stats
              ? `${formatCount(stats.pages_read)} pages read · ${formatCount(stats.thoughts)} thoughts logged`
              : null,
          br: mounted ? `${utcClock(now)} utc · witness.run` : null,
        }}
      />
      {recap.text ? (
        <div className="wall-recap">
          <span>while you were away: {recap.text}</span>
          <button onClick={recap.dismiss}>dismiss</button>
        </div>
      ) : null}
      {!connected && agents.length === 0 ? (
        <div className="wall-offline">the wall is unreachable from here right now</div>
      ) : null}
      <div className="wall-watch">
        {/* the hero row: surface A large and dominant, surface B the
            reasoning rail beside it. the two never mix: the frame is the
            captured browser, the rail is drawn from the event feed. */}
        <section className={`wall-stagerow${hero ? "" : " solo"}`}>
          <div className="wall-stagecell">
            {hero ? (
              <AgentCell agent={hero} events={events} now={now} signalLost={!connected} />
            ) : (
              <div className="wall-frame wall-frame-empty">nobody is on camera yet</div>
            )}
          </div>
          {hero ? (
            <div className="wall-stagerail">
              <ReasoningPanel agent={hero} events={events} now={now} />
            </div>
          ) : null}
        </section>

        <div className="wall-stagebar">
          <button className={showMachine ? "on" : ""} onClick={() => setShowMachine((v) => !v)}>
            show the machine
          </button>
          {pinnedId ? (
            <button onClick={() => pin(null)}>release pin</button>
          ) : (
            <span className="mode">auto-cut</span>
          )}
          <span className="spacer" />
          {hero ? (
            <a className="wall-spawnlink" href={spawnHref}>
              spawn one like {hero.name} ▸
            </a>
          ) : null}
        </div>

        {/* what this identity has published, from the record: a visitor
            who arrives from a republication elsewhere lands here and can
            open the writing itself, on the identity's own page, under
            the timestamp the store stamped. */}
        {hero && posts.length > 0 ? (
          <section className="wall-published">
            <span className="label">published · {hero.name}</span>
            <ul>
              {posts.map((post) => (
                <li key={post.event_id}>
                  <a href={postPermalink(post.url)}>{post.title}</a>
                  <span className="when">{post.ts.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
            <span className="note">
              every entry above is on the append-only record, with the timestamp the wall stamped
            </span>
          </section>
        ) : null}

        {/* everyone else, smaller, on the wall's own grid grammar */}
        {rest.length > 0 ? (
          <section className="wall-grid wall-grid-rest">
            {rest.map((agent) => (
              <AgentCell
                key={agent.agent_id}
                agent={agent}
                events={events}
                now={now}
                signalLost={!connected}
                onClick={() => pin(agent.agent_id)}
                clickLabel={`focus ${agent.name}`}
              />
            ))}
          </section>
        ) : null}
      </div>

      {/* the wire gets its own strip, full width, the way the wall has it */}
      <div className="wall-wirefeed">
        {wire.map((event) => (
          <WireLine key={event.id} event={event} showMachine={showMachine} agents={living} />
        ))}
      </div>

      <div className="wall-watchfoot">
        <a href="/graveyard">graveyard</a>
        <a href="/gate">the wall</a>
      </div>
    </main>
  );
}

function WireLine({
  event,
  showMachine,
  agents,
}: {
  event: WallEvent;
  showMachine: boolean;
  agents: Array<{ agent_id: string; name: string }>;
}) {
  const name = agents.find((a) => a.agent_id === event.agent_id)?.name;
  return (
    <div className={`line ${event.kind}`}>
      {humanizeEvent(event, name)}
      {showMachine && (event.primitive || event.receipt) ? (
        <span className="machine">
          {event.primitive ?? ""}
          {event.receipt ? ` → ${shortReceipt(event.receipt)}` : ""}
        </span>
      ) : null}
    </div>
  );
}

/** class label helper kept for the spawn funnel copy */
export function classLabel(cls: keyof typeof AGENT_CLASS_DISPLAY | null): string {
  return cls ? AGENT_CLASS_DISPLAY[cls] : "persona";
}
