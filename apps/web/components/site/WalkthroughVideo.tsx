"use client";

import { useEffect, useRef, useState } from "react";

/**
 * a recorded walkthrough of the real app, shown where a still capture used
 * to be. it plays silently on a loop like a living screenshot, with no
 * frame or letterboxing: the recording keeps its own aspect ratio and fills
 * the column.
 *
 * it does not autoplay under prefers-reduced-motion (the same rule the
 * lifecycle ticker and the contour mark follow), and if a browser refuses
 * autoplay for its own reasons the controls appear instead of a dead frame.
 */
export function WalkthroughVideo({
  src,
  poster,
  label,
}: {
  src: string;
  poster: string;
  label: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (video === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setManual(true);
      return;
    }
    void video.play().catch(() => setManual(true));
  }, []);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      aria-label={label}
      muted
      loop
      playsInline
      preload="metadata"
      controls={manual}
      style={{ display: "block", width: "100%", height: "auto" }}
    />
  );
}
