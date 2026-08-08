import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type StreamChannel, type StreamProvider } from "./types.js";

/**
 * the two providers. mux is validation-week only: it exists so the show
 * can go live without running video infrastructure, and everything
 * mux-specific stays inside MuxProvider. the exit is self-hosted
 * ffmpeg -> hls behind cloudflare, stubbed as a named provider so the
 * flag, the wiring and the tests are already in place when it lands.
 */

export interface MuxProviderOptions {
  tokenId: string;
  tokenSecret: string;
  /** injected in tests */
  fetch?: typeof globalThis.fetch;
}

export class MuxProvider implements StreamProvider {
  readonly name = "mux";
  private readonly opts: MuxProviderOptions;
  private readonly liveStreamIds = new Map<string, string>();

  constructor(opts: MuxProviderOptions) {
    this.opts = opts;
  }

  private get auth(): string {
    return `Basic ${Buffer.from(`${this.opts.tokenId}:${this.opts.tokenSecret}`).toString("base64")}`;
  }

  async createChannel(agentId: string): Promise<StreamChannel> {
    const doFetch = this.opts.fetch ?? globalThis.fetch;
    const res = await doFetch("https://api.mux.com/video/v1/live-streams", {
      method: "POST",
      headers: { authorization: this.auth, "content-type": "application/json" },
      body: JSON.stringify({
        playback_policy: ["public"],
        // slow tv: standard latency, ~30s target, no webrtc money spent
        latency_mode: "standard",
        passthrough: agentId,
      }),
    });
    if (!res.ok) throw new Error(`mux create live stream: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as {
      data: { id: string; stream_key: string; playback_ids: Array<{ id: string }> };
    };
    this.liveStreamIds.set(agentId, body.data.id);
    const playbackId = body.data.playback_ids[0]?.id;
    if (!playbackId) throw new Error("mux returned no playback id");
    return {
      agent_id: agentId,
      ingest: { kind: "rtmp", url: `rtmps://global-live.mux.com:443/app/${body.data.stream_key}` },
      // generic hls: nothing downstream knows this came from mux
      playback_url: `https://stream.mux.com/${playbackId}.m3u8`,
    };
  }

  async destroyChannel(agentId: string): Promise<void> {
    const id = this.liveStreamIds.get(agentId);
    if (!id) return;
    const doFetch = this.opts.fetch ?? globalThis.fetch;
    await doFetch(`https://api.mux.com/video/v1/live-streams/${id}`, {
      method: "DELETE",
      headers: { authorization: this.auth },
    });
    this.liveStreamIds.delete(agentId);
  }
}

/**
 * the self-hosted exit, now real: ffmpeg segments hls to disk under the
 * service's own state root and the service serves the files at
 * /hls/{agent}/index.m3u8 (a cdn in front absorbs viewers). channel
 * teardown deletes the segment dir: video is live-only, the archive that
 * outlives an identity is its writing, never its footage.
 */
export class SelfHostedHlsProvider implements StreamProvider {
  readonly name = "ffmpeg";
  private readonly rootDir: string;

  constructor(opts: { rootDir: string }) {
    this.rootDir = opts.rootDir;
  }

  async createChannel(agentId: string): Promise<StreamChannel> {
    const safe = agentId.replace(/[^a-zA-Z0-9_-]/g, "");
    const dir = join(this.rootDir, safe);
    mkdirSync(dir, { recursive: true });
    return {
      agent_id: agentId,
      ingest: { kind: "hls_dir", dir },
      playback_url: `/hls/${safe}/index.m3u8`,
    };
  }

  async destroyChannel(agentId: string): Promise<void> {
    const safe = agentId.replace(/[^a-zA-Z0-9_-]/g, "");
    rmSync(join(this.rootDir, safe), { recursive: true, force: true });
  }
}

export function selectStreamProvider(
  env: NodeJS.ProcessEnv,
  opts: { hlsRoot?: string } = {}
): StreamProvider | null {
  const wanted = (env.STREAM_PROVIDER ?? "none").toLowerCase();
  if (wanted === "none" || wanted === "") return null;
  if (wanted === "mux") {
    if (!env.MUX_TOKEN_ID || !env.MUX_TOKEN_SECRET) {
      throw new Error("STREAM_PROVIDER=mux needs MUX_TOKEN_ID and MUX_TOKEN_SECRET");
    }
    return new MuxProvider({ tokenId: env.MUX_TOKEN_ID, tokenSecret: env.MUX_TOKEN_SECRET });
  }
  if (wanted === "ffmpeg") {
    if (!opts.hlsRoot) throw new Error("STREAM_PROVIDER=ffmpeg needs an hls root directory");
    return new SelfHostedHlsProvider({ rootDir: opts.hlsRoot });
  }
  throw new Error(`unknown STREAM_PROVIDER "${wanted}" (mux | ffmpeg | none)`);
}
