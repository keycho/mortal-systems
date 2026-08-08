import { spawn } from "node:child_process";
import type { Encoder, EncodeTarget, EncoderFactory, StreamProfile } from "./types.js";
import { PROFILE_720 } from "./types.js";

/**
 * jpeg frames in, transport out, via one ffmpeg child per captured agent.
 * the same encoder serves both providers: rtmp out for mux ingest, local
 * hls segmenting for the self-hosted path. ffmpeg is a runtime dependency
 * of the deploy image, never of tests. an ffmpeg death is surfaced
 * through onExit so the manager can drop the channel honestly instead of
 * serving a stalled playlist.
 */

export function ffmpegArgs(target: EncodeTarget, fps: number = PROFILE_720.fps): string[] {
  const input = [
    "-f", "image2pipe",
    "-framerate", String(fps),
    "-i", "-",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-pix_fmt", "yuv420p",
    "-g", String(fps * 2),
  ];
  if (target.kind === "rtmp") {
    return [...input, "-f", "flv", target.url];
  }
  return [
    ...input,
    "-f", "hls",
    "-hls_time", "4",
    "-hls_list_size", "6",
    "-hls_flags", "delete_segments+independent_segments",
    `${target.dir}/index.m3u8`,
  ];
}

export function ffmpegEncoderFor(target: EncodeTarget, profile: StreamProfile): Encoder {
  const child = spawn("ffmpeg", ["-loglevel", "error", ...ffmpegArgs(target, profile.fps)], {
    stdio: ["pipe", "ignore", "inherit"],
  });
  let stopping = false;
  let onExit: ((reason: string) => void) | null = null;
  child.on("error", (err: NodeJS.ErrnoException) => {
    const reason =
      err.code === "ENOENT"
        ? "ffmpeg binary not found (the deploy image ships it)"
        : `ffmpeg failed: ${err.message}`;
    console.error(reason);
    onExit?.(reason);
  });
  child.on("close", (code) => {
    if (!stopping) onExit?.(`ffmpeg exited unexpectedly (code ${code})`);
  });
  return {
    writeFrame(jpeg: Buffer): void {
      if (child.stdin.writable) child.stdin.write(jpeg);
    },
    onExit(cb: (reason: string) => void): void {
      onExit = cb;
    },
    async stop(): Promise<void> {
      stopping = true;
      child.stdin.end();
      await new Promise<void>((resolve) => {
        child.once("close", () => resolve());
        setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 3000).unref();
      });
    },
  };
}

export const ffmpegEncoderFactory: EncoderFactory = (target, profile = PROFILE_720) =>
  ffmpegEncoderFor(target, profile);
