/**
 * the grain overlay: a pre-rasterized 240px svg noise tile repeated as a
 * background image (never a live full-page filter). 0.035 on light ground,
 * 0.045 (white noise) on dark bands.
 */
export function Grain({ dark = false }: { dark?: boolean }) {
  return (
    <div
      aria-hidden
      className={dark ? "grain-d" : "grain-l"}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity: dark ? 0.045 : 0.035,
      }}
    />
  );
}
