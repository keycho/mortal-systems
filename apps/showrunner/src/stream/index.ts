import { CdpScreencast } from "./capture.js";
import { ffmpegEncoderFactory } from "./encoder.js";
import type {
  Encoder,
  EncoderFactory,
  FrameSource,
  StreamProvider,
} from "./types.js";

/**
 * per-agent stream lifecycle: channel from the provider, frames from the
 * capture source, encoder in between. startAgent is called by whatever
 * owns real browsers (the launcher-side RuntimePort integration hands the
 * cdp url over); until then the manager simply has no channels and
 * playbackUrl answers null, which the cells render honestly as
 * events-only. no camera is ever faked.
 */
export class StreamManager {
  private readonly provider: StreamProvider;
  private readonly encoderFactory: EncoderFactory;
  private readonly sourceFactory: (cdpWsUrl: string) => FrameSource;
  private readonly running = new Map<
    string,
    { playbackUrl: string; encoder: Encoder; source: FrameSource }
  >();

  constructor(
    provider: StreamProvider,
    _env: NodeJS.ProcessEnv = process.env,
    hooks: {
      encoderFactory?: EncoderFactory;
      sourceFactory?: (cdpWsUrl: string) => FrameSource;
    } = {}
  ) {
    this.provider = provider;
    this.encoderFactory = hooks.encoderFactory ?? ffmpegEncoderFactory;
    this.sourceFactory =
      hooks.sourceFactory ?? ((cdpWsUrl) => new CdpScreencast({ cdpWsUrl }));
  }

  get providerName(): string {
    return this.provider.name;
  }

  async startAgent(agentId: string, cdpWsUrl: string): Promise<string> {
    if (this.running.has(agentId)) return (this.running.get(agentId) as { playbackUrl: string }).playbackUrl;
    const channel = await this.provider.createChannel(agentId);
    const encoder = this.encoderFactory(channel.ingest);
    const source = this.sourceFactory(cdpWsUrl);
    await source.start((jpeg) => encoder.writeFrame(jpeg));
    this.running.set(agentId, { playbackUrl: channel.playback_url, encoder, source });
    return channel.playback_url;
  }

  async stopAgent(agentId: string): Promise<void> {
    const entry = this.running.get(agentId);
    if (!entry) return;
    this.running.delete(agentId);
    await entry.source.stop();
    await entry.encoder.stop();
    await this.provider.destroyChannel(agentId);
  }

  playbackUrl(agentId: string): string | null {
    return this.running.get(agentId)?.playbackUrl ?? null;
  }
}

export { CdpScreencast } from "./capture.js";
export { ffmpegArgs, ffmpegEncoderFactory } from "./encoder.js";
export { MuxProvider, SelfHostedHlsProvider, selectStreamProvider } from "./providers.js";
export { StreamNotImplementedError } from "./types.js";
export type {
  EncodeTarget,
  Encoder,
  EncoderFactory,
  FrameSource,
  StreamChannel,
  StreamProvider,
} from "./types.js";
