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

/**
 * where the encoder's pixels come from. "frames" is the headless path:
 * cdp hands us jpegs and we pipe them in. "x11" is the headful one: the
 * browser is a real window on its own virtual screen and ffmpeg grabs
 * that screen directly, which is the only way the tabs, the toolbar and
 * the url bar end up in the picture -- cdp screencasts the page, and the
 * page has never included the browser around it.
 */
export type EncodeInput =
  | { kind: "frames" }
  | { kind: "x11"; display: string; width: number; height: number };

export interface StreamProvider {
  readonly name: string;
  createChannel(agentId: string): Promise<StreamChannel>;
  destroyChannel(agentId: string): Promise<void>;
}

/** one running encoder per agent; implementations wrap ffmpeg */
export interface Encoder {
  writeFrame(jpeg: Buffer): void;
  stop(): Promise<void>;
  /** fires when the encoder dies outside of stop(); the manager drops the
   * channel so cells fall back to the activity view honestly */
  onExit?(cb: (reason: string) => void): void;
  /** the encoder's own last words, for /health to quote */
  lastStderr?(): string;
}

export type EncoderFactory = (
  target: EncodeTarget,
  profile?: StreamProfile,
  input?: EncodeInput
) => Encoder;

/** a source of jpeg frames; cdp screencast in production, fakes in tests */
export interface FrameSource {
  start(onFrame: (jpeg: Buffer) => void): Promise<void>;
  stop(): Promise<void>;
}

export class StreamNotImplementedError extends Error {}

/** capture quality; the director drops a level under memory pressure */
export interface StreamProfile {
  name: string;
  width: number;
  height: number;
  fps: number;
  jpegQuality: number;
}

export const PROFILE_720: StreamProfile = {
  name: "720p6",
  width: 1280,
  height: 720,
  fps: 6,
  jpegQuality: 60,
};

/** the grid cells: small and slow, because there are as many of them as
 * there are living agents and they are 416px wide on the wall */
export const PROFILE_GRID: StreamProfile = {
  name: "360p3",
  width: 640,
  height: 360,
  fps: 3,
  jpegQuality: 45,
};

/** the first thing memory pressure costs: the same picture, slower */
export const PROFILE_GRID_LOW: StreamProfile = {
  name: "360p2",
  width: 640,
  height: 360,
  fps: 2,
  jpegQuality: 40,
};

export const PROFILE_480: StreamProfile = {
  name: "480p4",
  width: 854,
  height: 480,
  fps: 4,
  jpegQuality: 50,
};
