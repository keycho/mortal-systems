import { agentNow, directorScore, type WallEvent } from "@mortal/wall";
import { PlaywrightScreencast, type ScreencastablePage } from "./capture.js";
import { PROFILE_480, PROFILE_720, type FrameSource, type StreamProfile } from "./types.js";
import type { StreamManager } from "./index.js";

/**
 * the director cam, server-side: one camera, pointed at the hot agent by
 * the same auto-cut priority the watch page uses (death imminent >
 * human contact > enforcement > published > writing > reading > idle).
 * on a cut the old capture stops and the new one starts; the gap is
 * covered by the activity-view poster, which is the designed fallback,
 * not an accident. under memory pressure the profile drops from 720p6 to
 * 480p4 and the drop is reported, never hidden.
 */

export interface StreamDirectorOptions {
  manager: StreamManager;
  /** recent public events; the same material the fold reads everywhere */
  events: () => WallEvent[];
  /** the live runtime's page accessor; null = that browser is gone */
  pageFor: (agentId: string) => ScreencastablePage | null;
  /** rss ceiling in mb before the profile drops a level */
  memoryLimitMb?: number;
  intervalMs?: number;
  /** injected in tests */
  rssMb?: () => number;
  sourceFor?: (page: ScreencastablePage, profile: StreamProfile) => FrameSource;
}

export class StreamDirector {
  private readonly opts: StreamDirectorOptions;
  private target: string | null = null;
  private profile: StreamProfile = PROFILE_720;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastCutReason = "boot";

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
    if (this.target) await this.opts.manager.stopAgent(this.target);
    this.target = null;
  }

  /**
   * what the wall may say about its own camera. the director's intent is
   * not evidence: it once reported "capturing ag_marlowe" for as long as
   * the process lived while the encoder had died and /hls answered "no
   * such stream". so ok, and the name of the agent being captured, come
   * from the manager's reading of the segments on disk; the director
   * contributes only why it last cut.
   */
  status(): Record<string, unknown> {
    const health = this.opts.manager.health();
    return {
      ...health,
      intended: this.target,
      profile: health.profile ?? this.profile.name,
      last_cut: this.lastCutReason,
      ...(this.opts.manager.lastError() ? { last_error: this.opts.manager.lastError() } : {}),
    };
  }

  /** the pick: fold agent_now from events, score, take the hottest agent
   * that still has a living browser */
  pick(now: Date = new Date()): string | null {
    const events = this.opts.events();
    const agents = agentNow(events);
    let best: { id: string; score: number } | null = null;
    for (const agent of agents) {
      if (!this.opts.pageFor(agent.agent_id)) continue;
      const score = directorScore(agent, events, now);
      if (score < 0) continue;
      if (!best || score > best.score) best = { id: agent.agent_id, score };
    }
    return best?.id ?? null;
  }

  async tick(now: Date = new Date()): Promise<void> {
    // memory pressure: drop to 480p4 and stay there; a restart restores
    const rss = this.opts.rssMb?.() ?? process.memoryUsage().rss / 1_048_576;
    const limit = this.opts.memoryLimitMb ?? 1800;
    const wantedProfile = rss > limit ? PROFILE_480 : this.profile;
    const profileChanged = wantedProfile.name !== this.profile.name;
    if (profileChanged) {
      console.warn(
        `stream director: rss ${Math.round(rss)}mb over ${limit}mb, dropping to ${wantedProfile.name}`
      );
    }

    // a capture can end without the director asking: an encoder death
    // drops the channel from under it. holding the old target would make
    // the next tick a no-op ("already on him") and strand the wall
    // without a camera for the rest of the boot.
    if (this.target) {
      const health = this.opts.manager.health();
      // "lost" is the manager no longer running it at all (an encoder
      // death dropped the channel); "stalled" is an encoder that is alive
      // and producing nothing. a capture inside its startup window is
      // neither -- the first segment cannot exist before hls_time seconds
      // of frames, and cutting there would restart forever.
      const lost = health.capturing !== this.target;
      const stalled =
        !lost && !health.ok && !(health.reason ?? "").includes("startup window");
      if (lost || stalled) {
        const dropped = this.target;
        await this.opts.manager.stopAgent(dropped);
        this.target = null;
        this.lastCutReason = `capture on ${dropped} ended: ${
          health.reason ?? this.opts.manager.lastError() ?? "no playlist"
        }`;
        console.error(`stream director: ${this.lastCutReason}`);
      }
    }

    const next = this.pick(now);
    if (next === null && this.target === null) {
      this.lastCutReason = "no capturable agent";
      return;
    }
    if (next === this.target && !profileChanged) return;

    if (this.target) {
      await this.opts.manager.stopAgent(this.target);
      this.target = null;
    }
    this.profile = wantedProfile;
    if (!next) {
      this.lastCutReason = "no capturable agent";
      return;
    }
    const page = this.opts.pageFor(next);
    if (!page) return;
    const source =
      this.opts.sourceFor?.(page, this.profile) ?? new PlaywrightScreencast(page, this.profile);
    try {
      await this.opts.manager.startAgent(next, source, this.profile);
      this.target = next;
      this.lastCutReason = profileChanged ? `profile drop to ${this.profile.name}` : `cut to ${next}`;
    } catch (err) {
      this.lastCutReason = `capture failed: ${String(err)}`;
      console.error(`stream director: ${this.lastCutReason}`);
    }
  }
}
