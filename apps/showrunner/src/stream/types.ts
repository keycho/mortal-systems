/**
 * streaming phase one (wall spec section 4). the shape is deliberately
 * provider-generic: capture produces jpeg frames, an encoder turns frames
 * into a transport, and a StreamProvider owns channel lifecycle and hands
 * back a plain hls playback url. cells and the wall api consume that url
 * and nothing else, so swapping mux for self-hosted ffmpeg+cloudflare is
 * a provider change, never a player or schema change.
 */

export interface StreamChannel {
  agent_id: string;
  /** where the encoder pushes (rtmp for mux; a local dir for self-hosted hls) */
  ingest: EncodeTarget;
  /** generic hls playback url; the only thing the ui ever sees */
  playback_url: string;
}

export type EncodeTarget =
  | { kind: "rtmp"; url: string }
  | { kind: "hls_dir"; dir: string };

export interface StreamProvider {
  readonly name: string;
  createChannel(agentId: string): Promise<StreamChannel>;
  destroyChannel(agentId: string): Promise<void>;
}

/** one running encoder per agent; implementations wrap ffmpeg */
export interface Encoder {
  writeFrame(jpeg: Buffer): void;
  stop(): Promise<void>;
}

export type EncoderFactory = (target: EncodeTarget) => Encoder;

/** a source of jpeg frames; cdp screencast in production, fakes in tests */
export interface FrameSource {
  start(onFrame: (jpeg: Buffer) => void): Promise<void>;
  stop(): Promise<void>;
}

export class StreamNotImplementedError extends Error {}
