import { statSync } from "node:fs";
import { join } from "node:path";
import { ffmpegEncoderFactory } from "./encoder.js";
import {
  PROFILE_720,
  type EncodeInput,
  type Encoder,
  type EncoderFactory,
  type FrameSource,
  type StreamProfile,
  type StreamProvider,
} from "./types.js";

/**
 * per-agent stream lifecycle: channel from the provider, frames from the
 * capture source, encoder in between, and a frame pacer that re-feeds
 * the last frame at the profile's fps so a static page (an agent reading,
 * thinking) still produces a continuous stream instead of a stalled
 * playlist. an encoder death drops the channel and records why:
 * playbackUrl answers null, cells fall back to the activity view, and
 * /health carries the reason. never a black cell, never a fake frame.
 */
export interface ChannelHealth {
  agent_id: string;
  ok: boolean;
  profile: string;
  /** whether this cell shows the browser window or only the page */
  source: "x11_window" | "cdp_frames";
  reason?: string;
  playlist_age_seconds?: number;
  frames?: number;
  last_stderr?: string;
}

export class StreamManager {
  private readonly provider: StreamProvider;
  private readonly encoderFactory: EncoderFactory;
  private readonly running = new Map<
    string,
    {
      playbackUrl: string;
      encoder: Encoder;
      source: FrameSource;
      pacer: ReturnType<typeof setInterval> | null;
      profile: StreamProfile;
      /** where segments should be landing, when the provider writes files */
      dir: string | null;
      startedAt: number;
      input: EncodeInput;
    }
  >();
  private lastErrorValue: string | null = null;

  constructor(
    provider: StreamProvider,
    _env: NodeJS.ProcessEnv = process.env,
    hooks: { encoderFactory?: EncoderFactory } = {}
  ) {
    this.provider = provider;
    this.encoderFactory = hooks.encoderFactory ?? ffmpegEncoderFactory;
  }

  get providerName(): string {
    return this.provider.name;
  }

  lastError(): string | null {
    return this.lastErrorValue;
  }

  /** every agent with a channel right now */
  agents(): string[] {
    return [...this.running.keys()];
  }

  profileOf(agentId: string): StreamProfile | null {
    return this.running.get(agentId)?.profile ?? null;
  }

  /**
   * change an agent's quality without losing its cell for longer than a
   * segment: hls players recover from a restarted playlist, and the wall
   * would rather blink than lie about what it is showing.
   */
  async setProfile(
    agentId: string,
    source: FrameSource,
    profile: StreamProfile,
    input: EncodeInput = { kind: "frames" }
  ): Promise<string | null> {
    const existing = this.running.get(agentId);
    if (existing && existing.profile.name === profile.name) return existing.playbackUrl;
    if (existing) await this.stopAgent(agentId);
    return this.startAgent(agentId, source, profile, input);
  }

  async startAgent(
    agentId: string,
    source: FrameSource,
    profile: StreamProfile = PROFILE_720,
    input: EncodeInput = { kind: "frames" }
  ): Promise<string> {
    const existing = this.running.get(agentId);
    if (existing) return existing.playbackUrl;
    const channel = await this.provider.createChannel(agentId);
    const encoder = this.encoderFactory(channel.ingest, profile, input);
    encoder.onExit?.((reason) => {
      this.lastErrorValue = reason;
      void this.stopAgent(agentId).catch(() => undefined);
    });
    // an x11 channel needs neither: ffmpeg reads the agent's screen at a
    // fixed rate, so there is nothing to pipe and nothing to pace.
    let pacer: ReturnType<typeof setInterval> | null = null;
    if (input.kind === "frames") {
      let latest: Buffer | null = null;
      await source.start((jpeg) => {
        latest = jpeg;
      });
      // screencast frames arrive only when the page changes; the pacer keeps
      // the transport honest at a constant fps by repeating the last truth
      pacer = setInterval(() => {
        if (latest) encoder.writeFrame(latest);
      }, Math.round(1000 / profile.fps));
      pacer.unref();
    }
    this.running.set(agentId, {
      playbackUrl: channel.playback_url,
      encoder,
      source,
      pacer,
      profile,
      dir: channel.ingest.kind === "hls_dir" ? channel.ingest.dir : null,
      startedAt: Date.now(),
      input,
    });
    return channel.playback_url;
  }

  async stopAgent(agentId: string): Promise<void> {
    const entry = this.running.get(agentId);
    if (!entry) return;
    this.running.delete(agentId);
    if (entry.pacer) clearInterval(entry.pacer);
    await entry.source.stop().catch(() => undefined);
    await entry.encoder.stop().catch(() => undefined);
    await this.provider.destroyChannel(agentId).catch(() => undefined);
  }

  async stopAll(): Promise<void> {
    for (const agentId of [...this.running.keys()]) await this.stopAgent(agentId);
  }

  /**
   * the url only exists once there is something to play. an encoder that
   * is running but has never produced a playlist is not a stream, and
   * handing its url to a cell buys a spinner where the activity view
   * would have told the truth.
   */
  playbackUrl(agentId: string): string | null {
    const entry = this.running.get(agentId);
    if (!entry) return null;
    if (entry.dir === null) return entry.playbackUrl;
    return this.playlistAge(entry.dir) === null ? null : entry.playbackUrl;
  }

  capturing(): { agent_id: string; profile: string } | null {
    const [entry] = this.running.entries();
    return entry ? { agent_id: entry[0], profile: entry[1].profile.name } : null;
  }

  /** seconds since the playlist was last written, or null if there is none */
  private playlistAge(dir: string): number | null {
    try {
      return (Date.now() - statSync(join(dir, "index.m3u8")).mtimeMs) / 1000;
    } catch {
      return null;
    }
  }

  /**
   * whether the wall may honestly say it is streaming this agent. the
   * question is answered from the segments on disk, not from the fact
   * that a child process was spawned: a running encoder with no playlist
   * is exactly the shape of the incident this method exists to prevent.
   * the grace window covers the first segment, which cannot exist until
   * hls_time seconds of frames have been written.
   */
  /** one channel's honest state, read from the segments it has written */
  channelHealth(agentId: string, graceSeconds = 12, staleSeconds = 30): ChannelHealth | null {
    const entry = this.running.get(agentId);
    if (!entry) return null;
    const frames = (entry.source as { frameCount?: number }).frameCount;
    const base: ChannelHealth = {
      agent_id: agentId,
      ok: false,
      profile: entry.profile.name,
      source: entry.input.kind === "x11" ? "x11_window" : "cdp_frames",
      ...(frames === undefined ? {} : { frames }),
      ...(entry.encoder.lastStderr?.() ? { last_stderr: entry.encoder.lastStderr() } : {}),
    };
    // an rtmp channel has no local evidence; the encoder being alive is
    // all this side of the wire can honestly claim
    if (entry.dir === null) return { ...base, ok: true };
    const age = this.playlistAge(entry.dir);
    const running = (Date.now() - entry.startedAt) / 1000;
    if (age === null) {
      const starting = running < graceSeconds;
      return {
        ...base,
        reason: starting
          ? `no playlist yet, ${Math.round(running)}s into a ${graceSeconds}s startup window`
          : `the encoder has run ${Math.round(running)}s and written no playlist${
              frames === 0 ? "; no frames have arrived from the browser" : ""
            }`,
      };
    }
    if (age > staleSeconds) {
      return {
        ...base,
        playlist_age_seconds: Math.round(age),
        reason: `the playlist has not advanced in ${Math.round(age)}s`,
      };
    }
    return { ...base, ok: true, playlist_age_seconds: Math.round(age) };
  }

  /**
   * whether the wall may honestly say it is streaming. every channel is
   * answered from the segments on disk, not from the fact that a child
   * process was spawned: a running encoder with no playlist is exactly
   * the shape of the incident these checks exist to prevent. the grace
   * window covers the first segment, which cannot exist until hls_time
   * seconds of frames have been written.
   */
  health(graceSeconds = 12, staleSeconds = 30): {
    ok: boolean;
    capturing: string | null;
    profile: string | null;
    channels: ChannelHealth[];
    reason?: string;
    playlist_age_seconds?: number;
    frames?: number;
    last_stderr?: string;
  } {
    const channels = this.agents()
      .map((id) => this.channelHealth(id, graceSeconds, staleSeconds))
      .filter((c): c is ChannelHealth => c !== null);
    const first = channels[0];
    if (!first) {
      return {
        ok: false,
        capturing: null,
        profile: null,
        channels: [],
        reason: this.lastErrorValue ?? "no capture running",
      };
    }
    // the wall is well when every channel it claims is actually serving;
    // one dead cell is not a healthy gallery
    const ok = channels.every((c) => c.ok);
    return {
      ok,
      capturing: first.agent_id,
      profile: first.profile,
      channels,
      ...(ok ? {} : { reason: channels.find((c) => !c.ok)?.reason ?? "a channel is not serving" }),
      ...(first.playlist_age_seconds === undefined
        ? {}
        : { playlist_age_seconds: first.playlist_age_seconds }),
      ...(first.frames === undefined ? {} : { frames: first.frames }),
      ...(first.last_stderr ? { last_stderr: first.last_stderr } : {}),
    };
  }
}

export { CdpScreencast, PlaywrightScreencast } from "./capture.js";
export type { ScreencastablePage } from "./capture.js";
export { ffmpegArgs, ffmpegEncoderFactory, ffmpegEncoderFor } from "./encoder.js";
export { MuxProvider, SelfHostedHlsProvider, selectStreamProvider } from "./providers.js";
export {
  PROFILE_480,
  PROFILE_720,
  PROFILE_GRID,
  PROFILE_GRID_LOW,
  StreamNotImplementedError,
} from "./types.js";
export { StreamDirector } from "./director.js";
export type { StreamDirectorOptions } from "./director.js";
export type { Pressure } from "./director.js";
export type {
  EncodeInput,
  EncodeTarget,
  Encoder,
  EncoderFactory,
  FrameSource,
  StreamChannel,
  StreamProfile,
  StreamProvider,
} from "./types.js";
