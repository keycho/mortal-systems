import type { ReactNode } from "react";

/**
 * the recurring section header: serif headline left, mono intro right,
 * aligned to their baselines on a two-column grid.
 */
export function SectionHead({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: ReactNode;
  intro: ReactNode;
}) {
  return (
    <div
      className="m-sec-head"
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "end" }}
    >
      <div>
        <div
          style={{
            font: "400 12px var(--font-mono)",
            letterSpacing: "0.18em",
            color: "rgba(25,23,19,.5)",
          }}
        >
          {eyebrow}
        </div>
        <h2
          style={{
            font: "400 42px/1.12 var(--font-display)",
            margin: "14px 0 0",
            letterSpacing: "-0.01em",
            fontWeight: 400,
          }}
        >
          {title}
        </h2>
      </div>
      <p
        style={{
          font: "400 13.5px/1.75 var(--font-mono)",
          color: "rgba(25,23,19,.6)",
          margin: 0,
        }}
      >
        {intro}
      </p>
    </div>
  );
}
