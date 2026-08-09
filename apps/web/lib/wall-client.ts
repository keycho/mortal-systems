"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentNow, WallEvent } from "@mortal/wall/browser";

/**
 * the wall pages' only data source: the showrunner's read-only public api.
 * sse is the live channel; /now is the periodic snapshot that also powers
 * countdowns (dies_at is authoritative, the client only ticks a clock).
 * when the api is unreachable the ui says so instead of pretending.
 */

/**
 * where the wall api lives. both references below are written out in
 * full on purpose: next replaces the literal text
 * `process.env.NEXT_PUBLIC_WALL_API_URL` at build time, so anything
 * clever -- destructuring, a lookup by name, reading it inside a helper
 * -- turns into a runtime read of an env object that does not exist in a
 * browser, and the fallback wins forever. it did: the deployed bundle
 * asked localhost for /now while the variable was set correctly.
 *
 * the localhost fallback is guarded by NODE_ENV so the string is not
 * even present in a production bundle. a production build that reaches
 * here without the variable has already failed in next.config.mjs; the
 * empty string is what a bundle would carry if that gate were ever
 * removed, and a relative request failing loudly beats a browser dialling
 * a port on the viewer's own machine.
 */
export const WALL_API =
  process.env.NODE_ENV === "development"
    ? (process.env.NEXT_PUBLIC_WALL_API_URL ?? "http://127.0.0.1:4925")
    : (process.env.NEXT_PUBLIC_WALL_API_URL ?? "");

/** hls playback urls arrive provider-generic; self-hosted ones are
 * service-relative and resolve against the wall api origin */
export function streamSrc(url: string): string {
  return url.startsWith("http") ? url : `${WALL_API}${url}`;
}

export interface WallSnapshot {
  agents: AgentNowLive[];
  alive: number;
  events: WallEvent[];
  connected: boolean;
  /** how live data is arriving right now; polling is the designed
   * degradation when the sse cap is reached */
  channel: "sse" | "poll";
  now: number;
  /** the plate-border figures, counted by the runtime from the same
   * stream everything else renders from; null until /now first answers */
  stats: WallStatsNow | null;
}

/** wall totals for the corner chips (the read model's WallStats minus
 * the per-agent map, which /now folds onto each agent instead) */
export interface WallStatsNow {
  destroyed: number;
  pages_read: number;
  thoughts: number;
}

export interface AgentNowLive extends AgentNow {
  depth?: number;
  depth_inputs?: Record<string, number>;
  /** generic hls playback url when a live camera exists for this agent */
  stream_url?: string | null;
  /** corner-chip figures for this agent, counted by the runtime */
  pages_read?: number;
  thoughts_today?: number;
  /** the declared life-work with record-true progress: what this life
   * is for, and where it stands against its clock */
  work?: { line: string; unit: string; done: number; target?: number };
  /** the identity introducing itself, first person; shown where a
   * viewer focuses its cell */
  self_description?: string;
}

/** the work as one line: "12 of 90 entries · day 41 of 90" (finite) or
 * "31 essays · day 41 of 270" (open-ended). day math from the same
 * spawned_at/dies_at the countdown runs on. */
export function workLabel(agent: AgentNowLive, now: number): string | null {
  const work = agent.work;
  if (!work) return null;
  const progress = `${work.done}${work.target !== undefined ? ` of ${work.target}` : ""} ${work.unit}`;
  if (!agent.spawned_at || !agent.dies_at) return progress;
  const dayOf = Math.max(1, Math.ceil((now - Date.parse(agent.spawned_at)) / 86_400_000));
  const days = Math.max(
    1,
    Math.round((Date.parse(agent.dies_at) - Date.parse(agent.spawned_at)) / 86_400_000)
  );
  // a six-hour life has no days to speak of; the countdown already
  // carries its clock
  if (days < 1 || Date.parse(agent.dies_at) - Date.parse(agent.spawned_at) < 86_400_000) {
    return progress;
  }
  return `${progress} · day ${Math.min(dayOf, days)} of ${days}`;
}

const EVENT_BUFFER = 400;
const NOW_POLL_MS = 15_000;
/** while a living cell has no stream yet, the snapshot polls fast: the
 * server withholds stream_url until a playlist actually exists, so
 * right after boot or an encoder restart the only thing between a ready
 * stream and a visible cell is this poll. fifteen seconds of not asking
 * was most of a cell's apparent startup time. */
const NOW_CATCHUP_MS = 2_000;
const EVENT_POLL_MS = 5_000;
const SSE_RETRY_MS = 60_000;

export function useWall(): WallSnapshot {
  const [agents, setAgents] = useState<AgentNowLive[]>([]);
  const [alive, setAlive] = useState(0);
  const [events, setEvents] = useState<WallEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [channel, setChannel] = useState<"sse" | "poll">("sse");
  const [now, setNow] = useState(() => Date.now());
  const [stats, setStats] = useState<WallStatsNow | null>(null);
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let source: EventSource | null = null;
    let eventPoll: ReturnType<typeof setInterval> | null = null;
    let sseRetry: ReturnType<typeof setTimeout> | null = null;
    let nowTimer: ReturnType<typeof setTimeout> | null = null;

    // the snapshot poll is a chain, not an interval, so its cadence can
    // follow the wall's state: fast while any living cell is waiting on
    // its stream url, relaxed once every cell that can stream does
    const scheduleNow = (current: AgentNowLive[]): void => {
      if (stopped) return;
      if (nowTimer) clearTimeout(nowTimer);
      const catchup = current.some(
        (a) => a.state !== "dead" && a.state !== "unborn" && !a.stream_url
      );
      nowTimer = setTimeout(() => void pullNow(), catchup ? NOW_CATCHUP_MS : NOW_POLL_MS);
    };

    const pullNow = async (): Promise<void> => {
      if (nowTimer) clearTimeout(nowTimer);
      try {
        const res = await fetch(`${WALL_API}/now`);
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as {
          agents: AgentNowLive[];
          alive: number;
          stats?: WallStatsNow;
        };
        if (stopped) return;
        setAgents(body.agents);
        setAlive(body.alive);
        setStats(body.stats ?? null);
        scheduleNow(body.agents);
      } catch {
        if (!stopped) {
          setConnected(false);
          scheduleNow([]);
        }
      }
    };

    const ingest = (event: WallEvent): void => {
      lastId.current = event.id;
      setEvents((prior) => [...prior.slice(-(EVENT_BUFFER - 1)), event]);
      // lifecycle events change the snapshot immediately
      if (event.kind === "spawn" || event.kind === "death" || event.kind === "ttl_extended") {
        void pullNow();
      }
    };

    const pullRecent = async (): Promise<void> => {
      try {
        const res = await fetch(
          `${WALL_API}/recent${lastId.current ? `?after=${lastId.current}` : ""}`
        );
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { events: WallEvent[] };
        if (stopped) return;
        setConnected(true);
        for (const event of body.events) ingest(event);
      } catch {
        if (!stopped) setConnected(false);
      }
    };

    // the sse cap turning us away (or any stream failure) degrades to
    // polling /recent; we quietly retry sse on a slow cadence so capacity
    // freeing up upgrades viewers again
    const startPolling = (): void => {
      if (stopped || eventPoll) return;
      setChannel("poll");
      void pullRecent();
      eventPoll = setInterval(() => void pullRecent(), EVENT_POLL_MS);
      if (!sseRetry) {
        sseRetry = setTimeout(() => {
          sseRetry = null;
          if (!stopped) startSse();
        }, SSE_RETRY_MS);
      }
    };

    const startSse = (): void => {
      if (stopped) return;
      source?.close();
      source = new EventSource(
        `${WALL_API}/events${lastId.current ? `?after=${lastId.current}` : ""}`
      );
      source.onopen = () => {
        if (stopped) return;
        setConnected(true);
        setChannel("sse");
        if (eventPoll) {
          clearInterval(eventPoll);
          eventPoll = null;
        }
      };
      source.onerror = () => {
        source?.close();
        source = null;
        if (!stopped) startPolling();
      };
      source.onmessage = (message) => {
        ingest(JSON.parse(message.data as string) as WallEvent);
      };
    };

    void pullNow();
    startSse();

    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      clearInterval(clock);
      if (nowTimer) clearTimeout(nowTimer);
      if (eventPoll) clearInterval(eventPoll);
      if (sseRetry) clearTimeout(sseRetry);
      source?.close();
    };
  }, []);

  return { agents, alive, events, connected, channel, now, stats };
}

/** the plate's clock chip: hh:mm:ss utc, ticking on the shared clock */
export function utcClock(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** chip figures group thousands ("34,118 pages read") */
export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** how long a death keeps its vacant frame on screen before the cell
 * leaves the grid: long enough that a viewer sees the ending, short
 * enough that the room never fills with empty plates. presentation
 * policy shared by the wall and the gate. */
export const RECENT_DEATH_MS = 10 * 60_000;

/** dead, and recently enough that the frame still hangs, vacant */
export function recentlyDead(agent: AgentNowLive, now: number): boolean {
  return (
    agent.state === "dead" &&
    Boolean(agent.death) &&
    now - Date.parse((agent.death as { ts: string }).ts) < RECENT_DEATH_MS
  );
}

/** live ttl derived from dies_at and the ticking clock */
export function remainingSeconds(agent: AgentNowLive, now: number): number | null {
  if (!agent.dies_at || agent.state === "dead") return null;
  return Math.max(0, Math.floor((Date.parse(agent.dies_at) - now) / 1000));
}

/** countdown chrome: humanized far out, a precise clock inside the hour */
export function countdownLabel(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds >= 3600) {
    const d = Math.floor(seconds / 86_400);
    const h = Math.floor((seconds % 86_400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return d > 0 ? `${d}d ${h}h` : `${h}h ${m.toString().padStart(2, "0")}m`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** the final hour reads hh:mm:ss and ticks every second (handoff §2) */
export function finalHourLabel(seconds: number | null): string {
  if (seconds === null) return "";
  const s = Math.max(0, seconds);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** "while you were away": cookie-gated, dismissible */
export function useRecap(): { text: string | null; dismiss: () => void } {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const match = /(?:^|; )wall_last_seen=([^;]+)/.exec(document.cookie);
    const lastSeen = match ? decodeURIComponent(match[1] as string) : null;
    const sixHours = 6 * 3600_000;
    if (lastSeen && Date.now() - Date.parse(lastSeen) > sixHours) {
      void fetch(`${WALL_API}/recap?since=${encodeURIComponent(lastSeen)}`)
        .then((res) => res.json())
        .then((body: { text: string }) => setText(body.text))
        .catch(() => setText(null));
    }
    document.cookie = `wall_last_seen=${encodeURIComponent(new Date().toISOString())}; path=/; max-age=${180 * 86_400}`;
  }, []);
  return useMemo(() => ({ text, dismiss: () => setText(null) }), [text]);
}
