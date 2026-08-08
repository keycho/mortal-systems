"use client";

import { useEffect, useRef } from "react";

/**
 * a plain hls player: native where the browser speaks hls (safari), hls.js
 * elsewhere, loaded lazily so the bundle stays lean for the poster-only
 * wall. the src is a generic .m3u8 url; nothing here knows or cares which
 * provider produced it (mux this week, self-hosted ffmpeg later).
 */
export function HlsVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      void video.play().catch(() => undefined);
      return;
    }
    let destroyed = false;
    let instance: { destroy: () => void } | null = null;
    void import("hls.js").then(({ default: Hls }) => {
      if (destroyed || !Hls.isSupported()) return;
      const hls = new Hls({ lowLatencyMode: false });
      instance = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      void video.play().catch(() => undefined);
    });
    return () => {
      destroyed = true;
      instance?.destroy();
    };
  }, [src]);

  return <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
}
