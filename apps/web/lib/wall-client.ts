"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentNow, WallEvent } from "@mortal/wall/browser";

/**
 * the wall pages' only data source: the showrunner's read-only public api.
 * sse is the live channel; /now is the periodic snapshot that also powers
 * countdowns (dies_at is authoritative, the client only ticks a clock).
 * when the api is unreachable the ui says so instead of pretending.
 */

export const WALL_API =
  process.env.NEXT_PUBLIC_WALL_API_URL ?? "http://127.0.0.1:4925";

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
}

export interface AgentNowLive extends AgentNow {
  depth?: number;
  depth_inputs?: Record<string, number>;
  /** generic hls playback url when a live camera exists for this agent */
  stream_url?: string | null;
}

const EVENT_BUFFER = 400;
const NOW_POLL_MS = 15_000;
const EVENT_POLL_MS = 5_000;
const SSE_RETRY_MS = 60_000;

export function useWall(): WallSnapshot {
  const [agents, setAgents] = useState<AgentNowLive[]>([]);
  const [alive, setAlive] = useState(0);
  const [events, setEvents] = useState<WallEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [channel, setChannel] = useState<"sse" | "poll">("sse");
  const [now, setNow] = useState(() => Date.now());
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let source: EventSource | null = null;
    let eventPoll: ReturnType<typeof setInterval> | null = null;
    let sseRetry: ReturnType<typeof setTimeout> | null = null;

    const pullNow = async (): Promise<void> => {
      try {
        const res = await fetch(`${WALL_API}/now`);
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { agents: AgentNowLive[]; alive: number };
        if (stopped) return;
        setAgents(body.agents);
        setAlive(body.alive);
      } catch {
        if (!stopped) setConnected(false);
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
    const nowPoll = setInterval(() => void pullNow(), NOW_POLL_MS);
    startSse();

    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      clearInterval(nowPoll);
      clearInterval(clock);
      if (eventPoll) clearInterval(eventPoll);
      if (sseRetry) clearTimeout(sseRetry);
      source?.close();
    };
  }, []);

  return { agents, alive, events, connected, channel, now };
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
