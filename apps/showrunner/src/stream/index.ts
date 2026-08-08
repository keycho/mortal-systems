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
    this.running.set(agentId, { playbackUrl: channel.playback_url, encoder, source, pacer, profile });
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

  playbackUrl(agentId: string): string | null {
    return this.running.get(agentId)?.playbackUrl ?? null;
  }

  capturing(): { agent_id: string; profile: string } | null {
    const [entry] = this.running.entries();
    return entry ? { agent_id: entry[0], profile: entry[1].profile.name } : null;
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
