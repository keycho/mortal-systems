import { spawn } from "node:child_process";
import type {
  Encoder,
  EncodeInput,
  EncodeTarget,
  EncoderFactory,
  StreamProfile,
} from "./types.js";
import { PROFILE_720 } from "./types.js";

/**
 * jpeg frames in, transport out, via one ffmpeg child per captured agent.
 * the same encoder serves both providers: rtmp out for mux ingest, local
 * hls segmenting for the self-hosted path. ffmpeg is a runtime dependency
 * of the deploy image, never of tests. an ffmpeg death is surfaced
 * through onExit so the manager can drop the channel honestly instead of
 * serving a stalled playlist.
 */

export function ffmpegArgs(
  target: EncodeTarget,
  fps: number = PROFILE_720.fps,
  source: EncodeInput = { kind: "frames" },
  out?: { width: number; height: number }
): string[] {
  // x11grab reads the agent's whole virtual screen, so the browser's own
  // chrome is in the picture; image2pipe reads the jpegs cdp gives us,
  // which are the page alone.
  const from =
    source.kind === "x11"
      ? [
          "-f", "x11grab",
          "-draw_mouse", "0",
          "-framerate", String(fps),
          "-video_size", `${source.width}x${source.height}`,
          "-i", source.display,
        ]
      : ["-f", "image2pipe", "-framerate", String(fps), "-i", "-"];
  // an x11 screen is captured at the size the browser window needs to be
  // readable, which is not the size a 416px grid cell needs to receive.
  // scaling here rather than shrinking the screen keeps the window
  // legible to the agent and the stream cheap for the wall.
  const scale =
    source.kind === "x11" && out && (out.width !== source.width || out.height !== source.height)
      ? ["-vf", `scale=${out.width}:${out.height}`]
      : [];
  const input = [
    ...from,
    ...scale,
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

export function ffmpegEncoderFor(
  target: EncodeTarget,
  profile: StreamProfile,
  source: EncodeInput = { kind: "frames" }
): Encoder {
  // stderr is piped, not inherited: an inherited stream lands in the
  // container log where nothing can quote it back, and "the capture died"
  // without ffmpeg's own words is the kind of report that costs an hour.
  const child = spawn(
    "ffmpeg",
    [
      "-loglevel",
      "error",
      ...ffmpegArgs(target, profile.fps, source, {
        width: profile.width,
        height: profile.height,
      }),
    ],
    { stdio: ["pipe", "ignore", "pipe"] }
  );
  let stopping = false;
  let onExit: ((reason: string) => void) | null = null;
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    // keep the tail: ffmpeg's fatal line is its last, and an unbounded
    // buffer on a long-running encoder is its own bug
    stderr = `${stderr}${text}`.slice(-4000);
    for (const line of text.split("\n")) {
      if (line.trim().length > 0) console.error(`ffmpeg: ${line.trim()}`);
    }
  });
  child.on("error", (err: NodeJS.ErrnoException) => {
    const reason =
      err.code === "ENOENT"
        ? "ffmpeg binary not found (the deploy image ships it)"
        : `ffmpeg failed: ${err.message}`;
    console.error(reason);
    onExit?.(reason);
  });
  child.on("close", (code) => {
    if (!stopping) {
      const last = lastStderr();
      onExit?.(`ffmpeg exited unexpectedly (code ${code})${last ? `: ${last}` : ""}`);
    }
  });
  const lastStderr = (): string =>
    stderr
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(-4)
      .join(" / ");
  return {
    writeFrame(jpeg: Buffer): void {
      // an x11 encoder feeds itself from the screen; a frame pushed at it
      // would corrupt the stream rather than add to it
      if (source.kind === "x11") return;
      if (child.stdin.writable) child.stdin.write(jpeg);
    },
    lastStderr,
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

export const ffmpegEncoderFactory: EncoderFactory = (
  target,
  profile = PROFILE_720,
  source = { kind: "frames" }
) => ffmpegEncoderFor(target, profile, source);
