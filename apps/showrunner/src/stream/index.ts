import { statSync } from "node:fs";
import { join } from "node:path";
import { ffmpegEncoderFactory } from "./encoder.js";
import {
  PROFILE_720,
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
export class StreamManager {
  private readonly provider: StreamProvider;
  private readonly encoderFactory: EncoderFactory;
  private readonly running = new Map<
    string,
    {
      playbackUrl: string;
      encoder: Encoder;
      source: FrameSource;
      pacer: ReturnType<typeof setInterval>;
      profile: StreamProfile;
      /** where segments should be landing, when the provider writes files */
      dir: string | null;
      startedAt: number;
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

  async startAgent(
    agentId: string,
    source: FrameSource,
    profile: StreamProfile = PROFILE_720
  ): Promise<string> {
    const existing = this.running.get(agentId);
    if (existing) return existing.playbackUrl;
    const channel = await this.provider.createChannel(agentId);
    const encoder = this.encoderFactory(channel.ingest, profile);
    encoder.onExit?.((reason) => {
      this.lastErrorValue = reason;
      void this.stopAgent(agentId).catch(() => undefined);
    });
    let latest: Buffer | null = null;
    await source.start((jpeg) => {
      latest = jpeg;
    });
    // screencast frames arrive only when the page changes; the pacer keeps
    // the transport honest at a constant fps by repeating the last truth
    const pacer = setInterval(() => {
      if (latest) encoder.writeFrame(latest);
    }, Math.round(1000 / profile.fps));
    pacer.unref();
    this.running.set(agentId, {
      playbackUrl: channel.playback_url,
      encoder,
      source,
      pacer,
      profile,
      dir: channel.ingest.kind === "hls_dir" ? channel.ingest.dir : null,
      startedAt: Date.now(),
    });
    return channel.playback_url;
  }

  async stopAgent(agentId: string): Promise<void> {
    const entry = this.running.get(agentId);
    if (!entry) return;
    this.running.delete(agentId);
    clearInterval(entry.pacer);
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
  health(graceSeconds = 12, staleSeconds = 30): {
    ok: boolean;
    capturing: string | null;
    profile: string | null;
    reason?: string;
    playlist_age_seconds?: number;
    frames?: number;
    last_stderr?: string;
  } {
    const [agentId, entry] = [...this.running.entries()][0] ?? [null, null];
    if (!agentId || !entry) {
      return {
        ok: false,
        capturing: null,
        profile: null,
        reason: this.lastErrorValue ?? "no capture running",
        ...(this.lastErrorValue ? {} : {}),
      };
    }
    const frames = (entry.source as { frameCount?: number }).frameCount;
    const base = {
      capturing: agentId,
      profile: entry.profile.name,
      ...(frames === undefined ? {} : { frames }),
      ...(entry.encoder.lastStderr?.() ? { last_stderr: entry.encoder.lastStderr() } : {}),
    };
    // an rtmp channel has no local evidence; the encoder being alive is
    // all this side of the wire can honestly claim
    if (entry.dir === null) return { ok: true, ...base };
    const age = this.playlistAge(entry.dir);
    const running = (Date.now() - entry.startedAt) / 1000;
    if (age === null) {
      const starting = running < graceSeconds;
      return {
        ok: false,
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
        ok: false,
        ...base,
        playlist_age_seconds: Math.round(age),
        reason: `the playlist has not advanced in ${Math.round(age)}s`,
      };
    }
    return { ok: true, ...base, playlist_age_seconds: Math.round(age) };
  }
}

export { CdpScreencast, PlaywrightScreencast } from "./capture.js";
export type { ScreencastablePage } from "./capture.js";
export { ffmpegArgs, ffmpegEncoderFactory, ffmpegEncoderFor } from "./encoder.js";
export { MuxProvider, SelfHostedHlsProvider, selectStreamProvider } from "./providers.js";
export { PROFILE_480, PROFILE_720, StreamNotImplementedError } from "./types.js";
export { StreamDirector } from "./director.js";
export type { StreamDirectorOptions } from "./director.js";
export type {
  EncodeTarget,
  Encoder,
  EncoderFactory,
  FrameSource,
  StreamChannel,
  StreamProfile,
  StreamProvider,
} from "./types.js";
