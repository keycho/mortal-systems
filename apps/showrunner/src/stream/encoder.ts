import { spawn } from "node:child_process";
import type { Encoder, EncodeTarget, EncoderFactory } from "./types.js";

/**
 * jpeg frames in, transport out, via one ffmpeg child per agent. the same
 * encoder serves both providers: rtmp out for mux ingest, local hls
 * segmenting for the self-hosted exit. ffmpeg is a runtime dependency of
 * the deploy image (see the Dockerfile), never of tests.
 */

const FRAME_RATE = 6;

export function ffmpegArgs(target: EncodeTarget): string[] {
  const input = [
    "-f", "image2pipe",
    "-framerate", String(FRAME_RATE),
    "-i", "-",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-pix_fmt", "yuv420p",
    "-g", String(FRAME_RATE * 2),
  ];
  if (target.kind === "rtmp") {
    return [...input, "-f", "flv", target.url];
  }
  return [
    ...input,
    "-f", "hls",
    "-hls_time", "4",
    "-hls_list_size", "6",
    "-hls_flags", "delete_segments",
    `${target.dir}/index.m3u8`,
  ];
}

export const ffmpegEncoderFactory: EncoderFactory = (target) => {
  const child = spawn("ffmpeg", ["-loglevel", "error", ...ffmpegArgs(target)], {
    stdio: ["pipe", "ignore", "inherit"],
  });
  child.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") {
      console.error("ffmpeg binary not found: streaming needs ffmpeg installed (the deploy image ships it)");
    } else {
      console.error(`ffmpeg failed: ${err.message}`);
    }
  });
  const encoder: Encoder = {
    writeFrame(jpeg: Buffer): void {
      if (child.stdin.writable) child.stdin.write(jpeg);
    },
    async stop(): Promise<void> {
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
  return encoder;
};
