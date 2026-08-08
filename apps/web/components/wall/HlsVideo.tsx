"use client";

import { useEffect, useRef } from "react";

/**
 * a plain hls player: native where the browser speaks hls (safari), hls.js
 * elsewhere, loaded lazily so the bundle stays lean for the poster-only
 * wall. the src is a generic .m3u8 url; nothing here knows or cares which
 * provider produced it.
 *
 * two things tuned for a wall of live cells:
 * - joins sync two target-durations from the live edge (the default
 *   three sat viewers further behind live and one segment slower to
 *   first frame, for nothing a slow-tv wall needs).
 * - fatal errors heal instead of killing the cell. the playback url is
 *   stable per agent, so a fatal error with no recovery used to leave a
 *   black cell until a full page reload: a profile change restarts the
 *   encoder behind the SAME url, and the seconds where the playlist is
 *   mid-handoff must read as a blink, not a death. network errors retry
 *   the load; media errors try hls.js recovery, then a full re-init.
 */
export function HlsVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      void video.play().catch(() => undefined);
      return () => {
        video.removeAttribute("src");
      };
    }
    let destroyed = false;
    let instance: { destroy: () => void } | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    void import("hls.js").then(({ default: Hls }) => {
      if (destroyed || !Hls.isSupported()) return;

      const build = (): void => {
        if (destroyed) return;
        const hls = new Hls({
          lowLatencyMode: false,
          liveSyncDurationCount: 2,
          maxBufferLength: 12,
          backBufferLength: 30,
        });
        instance = hls;
        let mediaRecoveryTried = false;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (destroyed || !data.fatal) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecoveryTried) {
            mediaRecoveryTried = true;
            hls.recoverMediaError();
            return;
          }
          // network gap (an encoder restarting behind the url) or a
          // media error recovery could not absorb: rebuild the player
          // after a breath, forever; the server stops advertising the
          // url when there is truly nothing to play
          hls.destroy();
          if (instance === hls) instance = null;
          retry = setTimeout(build, 2000);
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        void video.play().catch(() => undefined);
      };

      build();
    });
    return () => {
      destroyed = true;
      if (retry) clearTimeout(retry);
      instance?.destroy();
    };
  }, [src]);

  return <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
}
