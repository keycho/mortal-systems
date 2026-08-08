import type { CSSProperties } from "react";

/**
 * the wordmark: site mono with the partial-fill dash element between the
 * words (62% filled, always). one component, four calibrated sizes from
 * the handoff — nav, footer, and the small light/dark marks used inside
 * the manifesto's shareable compositions.
 */
const VARIANTS = {
  nav: {
    font: "500 15px var(--font-mono)",
    color: "var(--ink)",
    dash: { width: 28, height: 3, margin: "0 11px" },
    bar: "rgba(25,23,19,.22)",
    fill: "var(--ink)",
  },
  footer: {
    font: "500 13px var(--font-mono)",
    color: "rgba(25,23,19,.6)",
    dash: { width: 24, height: 2, margin: "0 10px" },
    bar: "rgba(25,23,19,.2)",
    fill: "rgba(25,23,19,.6)",
  },
  smallLight: {
    font: "500 12px var(--font-mono)",
    color: "rgba(25,23,19,.55)",
    dash: { width: 22, height: 2, margin: "0 9px" },
    bar: "rgba(25,23,19,.2)",
    fill: "rgba(25,23,19,.55)",
  },
  smallDark: {
    font: "500 12px var(--font-mono)",
    color: "rgba(242,239,231,.5)",
    dash: { width: 22, height: 2, margin: "0 9px" },
    bar: "rgba(242,239,231,.2)",
    fill: "rgba(242,239,231,.5)",
  },
  /** the wall's footer band: same treatment, the gate handoff's sizes */
  wall: {
    font: "500 13px var(--font-mono)",
    color: "#f2efe7",
    dash: { width: 24, height: 2.5, margin: "0 10px" },
    bar: "rgba(242,239,231,.25)",
    fill: "#f2efe7",
  },
} as const;

export function Wordmark({
  variant = "nav",
  style,
}: {
  variant?: keyof typeof VARIANTS;
  style?: CSSProperties;
}) {
  const v = VARIANTS[variant];
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        font: v.font,
        letterSpacing: "0.02em",
        color: v.color,
        ...style,
      }}
    >
      mortal
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: v.dash.width,
          height: v.dash.height,
          background: v.bar,
          margin: v.dash.margin,
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            width: "62%",
            background: v.fill,
          }}
        />
      </span>
      systems
    </span>
  );
}
