import { readFileSync } from "node:fs";
import { agentNow, directorScore, type WallEvent } from "@mortal/wall";
import { PlaywrightScreencast, type ScreencastablePage } from "./capture.js";
import {
  PROFILE_480,
  PROFILE_720,
  PROFILE_GRID,
  PROFILE_GRID_LOW,
  type EncodeInput,
  type FrameSource,
  type StreamProfile,
} from "./types.js";
import type { StreamManager } from "./index.js";

/**
 * the gallery, and the camera inside it.
 *
 * every living identity has its own channel, always on, because the wall
 * is a room of lives being lived and a cell that only sometimes has video
 * is a cell that mostly does not. the grid runs small and slow (360p at
 * 2-3fps, which is what a 416px cell can show anyway) and the director's
 * pick is upswitched to 720p6 for the hero, so the expensive picture
 * exists once and where it is being looked at.
 *
 * scarcity is spent in a fixed order, and the order is the editorial
 * decision: under memory pressure the grid loses frame rate, then the
 * grid goes dark to its poster with signal-lost, and only after that
 * does the hero drop quality. the last thing the wall gives up is the
 * one picture someone is actually watching.
 */

export interface StreamDirectorOptions {
  manager: StreamManager;
  /** recent public events; the same material the fold reads everywhere */
  events: () => WallEvent[];
  /** the live runtime's page accessor; null = that browser is gone */
  pageFor: (agentId: string) => ScreencastablePage | null;
  /** who is alive right now, from the runtime rather than the record */
  liveAgents?: () => string[];
  /** how this agent is drawn: an x11 window, or the page alone */
  encodeInputFor?: (agentId: string) => EncodeInput;
  /** rss ceiling in mb before the gallery starts giving things up */
  memoryLimitMb?: number;
  intervalMs?: number;
  /** how many encoders may start in one tick; the rest wait a tick */
  startsPerTick?: number;
  /** injected in tests */
  rssMb?: () => number;
  sourceFor?: (page: ScreencastablePage, profile: StreamProfile) => FrameSource;
}

/** states where something is visibly happening in the frame: a page
 * being scrolled, a draft being typed. these are what the wall is for. */
const DYNAMIC_STATES = new Set(["writing", "replying", "reading"]);

/** how long the camera will hold a motionless cell before going to find
 * something that is actually moving */
export const DWELL_MAX_MS = 20_000;

/** what the wall gives up, in the order it gives it up */
export type Pressure = "none" | "grid_slow" | "grid_dark" | "hero_low";

export class StreamDirector {
  private readonly opts: StreamDirectorOptions;
  private hero: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastCutReason = "boot";
  private heroSince = 0;
  private heroStateKey = "";
  private pressure: Pressure = "none";

  constructor(opts: StreamDirectorOptions) {
    this.opts = opts;
  }

  start(): void {
    const interval = this.opts.intervalMs ?? 10_000;
    this.timer = setInterval(() => void this.tick().catch(console.error), interval);
    this.timer.unref();
    void this.tick().catch(console.error);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.opts.manager.stopAll();
    this.hero = null;
  }

  /**
   * what the wall may say about its own cameras. the director's intent is
   * not evidence: it once reported "capturing ag_marlowe" for as long as
   * the process lived while the encoder had died and /hls answered "no
   * such stream". so ok, and every channel in it, come from the manager's
   * reading of the segments on disk.
   */
  status(): Record<string, unknown> {
    const health = this.opts.manager.health();
    const alive = this.roster(this.hero);
    // an identity that is alive with no channel is not visible in a list
    // of channels, and "every channel is fine" would be a true sentence
    // about a wall with a dark cell. name them.
    const awaiting = alive.filter((id) => !this.opts.manager.agents().includes(id));
    return {
      ...health,
      ...(awaiting.length > 0 ? { awaiting } : {}),
      live_agents: alive.length,
      channels_running: this.opts.manager.agents().length,
      hero: this.hero,
      pressure: this.pressure,
      // the numbers behind the ladder, so "pressure: none" can be checked
      // rather than believed
      memory: {
        rss_mb: Math.round(this.rssMb()),
        limit_mb: this.opts.memoryLimitMb ?? 1800,
        headroom_mb: Math.round((this.opts.memoryLimitMb ?? 1800) - this.rssMb()),
      },
      last_cut: this.lastCutReason,
      ...(this.opts.manager.lastError() ? { last_error: this.opts.manager.lastError() } : {}),
    };
  }

  /**
   * the pick: fold agent_now from events, score, take the hottest agent
   * that still has a living browser -- and refuse to sit on a still
   * picture.
   *
   * a fully rendered page nobody is scrolling is the least watchable
   * thing the wall can show, and the score alone will happily hold a cut
   * there forever if that agent happens to outrank everyone. so a hero
   * that has not changed state for DWELL_MAX_MS loses to anyone who is
   * actually reading or writing at that moment. the wall is not a
   * screenshot gallery; if something is moving, the camera goes there.
   */
  pick(now: Date = new Date()): string | null {
    const events = this.opts.events();
    const agents = agentNow(events);
    let best: { id: string; score: number } | null = null;
    let mover: { id: string; score: number } | null = null;
    for (const agent of agents) {
      if (!this.opts.pageFor(agent.agent_id)) continue;
      const score = directorScore(agent, events, now);
      if (score < 0) continue;
      if (!best || score > best.score) best = { id: agent.agent_id, score };
      if (DYNAMIC_STATES.has(agent.state) && (!mover || score > mover.score)) {
        mover = { id: agent.agent_id, score };
      }
    }
    if (!best) return null;

    // has the hero done anything since we cut to it?
    const heroAgent = agents.find((a) => a.agent_id === this.hero);
    const key = heroAgent ? `${heroAgent.state}:${heroAgent.last_event_id ?? ""}` : "";
    if (key !== this.heroStateKey) {
      this.heroStateKey = key;
      this.heroSince = now.getTime();
    }
    const stillFor = now.getTime() - this.heroSince;
    if (
      this.hero !== null &&
      mover !== null &&
      mover.id !== this.hero &&
      !DYNAMIC_STATES.has(heroAgent?.state ?? "") &&
      stillFor > DWELL_MAX_MS
    ) {
      return mover.id;
    }
    return best.id;
  }

  /**
   * what this wall is actually costing.
   *
   * node's own rss is the wrong number, and was badly wrong: with six
   * identities it read 147mb while the box was using 1.7gb, because
   * every browser, encoder and virtual screen is its own process.
   * measuring only ourselves meant the ladder could never trip before
   * the container hit its ceiling and the kernel began killing, which is
   * precisely the failure the ladder exists to get ahead of.
   *
   * the cgroup counts the whole tree and is what docker enforces its
   * limit against, so it is the honest answer to "how close are we".
   * node's rss stays as the fallback for a host that exposes neither.
   */
  private rssMb(): number {
    if (this.opts.rssMb) return this.opts.rssMb();
    const cgroup = readCgroupUsageBytes();
    if (cgroup !== null) return cgroup / 1_048_576;
    return process.memoryUsage().rss / 1_048_576;
  }

  /** the ladder, read from the headroom actually left */
  private readPressure(): Pressure {
    const rss = this.rssMb();
    const limit = this.opts.memoryLimitMb ?? 1800;
    if (rss <= limit) return "none";
    if (rss <= limit * 1.15) return "grid_slow";
    if (rss <= limit * 1.3) return "grid_dark";
    return "hero_low";
  }

  private gridProfile(): StreamProfile | null {
    switch (this.pressure) {
      case "none":
        return PROFILE_GRID;
      case "grid_slow":
        return PROFILE_GRID_LOW;
      default:
        // the grid goes to its poster: cells fall back to the activity
        // view and the signal-lost state, which is designed and honest
        return null;
    }
  }

  private heroProfile(): StreamProfile {
    return this.pressure === "hero_low" ? PROFILE_480 : PROFILE_720;
  }

  /** who should have a channel: the live roster if there is one, else
   * whoever the camera is pointed at */
  private roster(hero: string | null): string[] {
    const declared = this.opts.liveAgents?.();
    const ids = declared ?? (hero ? [hero] : []);
    return ids.filter((id) => this.opts.pageFor(id));
  }

  private sourceFor(page: ScreencastablePage, profile: StreamProfile): FrameSource {
    return this.opts.sourceFor?.(page, profile) ?? new PlaywrightScreencast(page, profile);
  }

  async tick(now: Date = new Date()): Promise<void> {
    const previousPressure = this.pressure;
    this.pressure = this.readPressure();
    if (previousPressure !== this.pressure) {
      console.warn(`stream director: pressure ${previousPressure} -> ${this.pressure}`);
    }

    const manager = this.opts.manager;
    const hero = this.pick(now);
    if (hero !== this.hero) this.hero = hero;
    // a director with no roster still has a camera: the hero alone is the
    // degenerate gallery, and it is what the single-camera wall was.
    const alive = this.roster(hero);
    this.lastCutReason = hero ? `cut to ${hero}` : "no capturable agent";

    // a channel whose agent is gone, or which died under us, is dropped
    // before anything else: holding it would report a camera on a life
    // that ended, and would keep the memory it needs from the living.
    for (const agentId of manager.agents()) {
      const health = manager.channelHealth(agentId);
      const stalled =
        health !== null && !health.ok && !(health.reason ?? "").includes("startup window");
      if (!alive.includes(agentId) || stalled) {
        await manager.stopAgent(agentId);
        if (stalled) {
          console.error(`stream director: ${agentId} channel dropped: ${health?.reason}`);
        }
      }
    }

    const gridProfile = this.gridProfile();
    let started = 0;
    const budget = this.opts.startsPerTick ?? 1;

    for (const agentId of alive) {
      const isHero = agentId === this.hero;
      const wanted = isHero ? this.heroProfile() : gridProfile;
      const current = manager.profileOf(agentId);

      if (wanted === null) {
        // pressure has taken the grid; the hero keeps its channel
        if (current && !isHero) await manager.stopAgent(agentId);
        continue;
      }
      if (current?.name === wanted.name) continue;

      const page = this.opts.pageFor(agentId);
      if (!page) continue;
      const input = this.opts.encodeInputFor?.(agentId) ?? { kind: "frames" as const };

      // a profile change on an agent that already has a channel is a
      // restart, and it is worth the blink; a brand new channel counts
      // against the stagger budget, because three ffmpegs and three
      // chromiums starting in the same second is how a container dies.
      if (current) {
        await manager
          .setProfile(agentId, this.sourceFor(page, wanted), wanted, input)
          .catch((err) => {
            console.error(`stream director: ${agentId} profile change failed: ${String(err)}`);
            return null;
          });
        continue;
      }
      if (started >= budget) continue;
      started += 1;
      try {
        await manager.startAgent(agentId, this.sourceFor(page, wanted), wanted, input);
      } catch (err) {
        this.lastCutReason = `capture failed for ${agentId}: ${String(err)}`;
        console.error(`stream director: ${this.lastCutReason}`);
      }
    }
  }
}

/** the whole container's memory, not just this process's slice of it */
function readCgroupUsageBytes(): number | null {
  for (const path of [
    "/sys/fs/cgroup/memory.current",
    "/sys/fs/cgroup/memory/memory.usage_in_bytes",
  ]) {
    try {
      const value = Number(readFileSync(path, "utf8").trim());
      if (Number.isFinite(value) && value > 0) return value;
    } catch {
      // not this layout; try the next, then fall back to our own rss
    }
  }
  return null;
}
