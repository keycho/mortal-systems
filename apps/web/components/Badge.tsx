import type { CSSProperties, ReactNode } from "react";

/**
 * the enforcement badge system — one component everywhere (the page's
 * repeating signature element). a joined chip pair [test-id | label]: the
 * id segment is an outlined mono chip with no right border and left-only
 * radius; the label segment is solid for ENFORCED, outlined for ADVISORY,
 * with right-only radius. DECLARED is a standalone dotted chip (stated,
 * not a technical control). label text is never a hardcoded synonym for a
 * different enforcement level.
 */

type Tone = "enforced" | "advisory" | "declared";

const LABEL: Record<Tone, string> = {
  enforced: "ENFORCED",
  advisory: "ADVISORY",
  declared: "DECLARED",
};

/** size presets from the handoff: sm = captions/permission rows, md = grid cards */
const SIZE = {
  sm: { font: 8.5, pad: "2.5px 6px", padSolid: "2.5px 6px", radius: 3 },
  md: { font: 9.5, pad: "3.5px 8px", padSolid: "3.5px 9px", radius: 4 },
} as const;

export function EnforcementChip({
  tid,
  tone,
  dark = false,
  size = "sm",
  idHref,
  style,
}: {
  tid?: string | null;
  tone: Tone;
  dark?: boolean;
  size?: keyof typeof SIZE;
  /** when set, the test-id segment links there (the grid cards link to /guarantees) */
  idHref?: string;
  style?: CSSProperties;
}) {
  const s = SIZE[size];
  const idStyle: CSSProperties = {
    font: `500 ${s.font}px var(--font-mono)`,
    letterSpacing: "0.08em",
    border: dark ? "1px solid rgba(242,239,231,.35)" : "1px solid rgba(242,239,231,.3)",
    borderRight: "none",
    color: dark ? "rgba(242,239,231,.6)" : "rgba(242,239,231,.6)",
    padding: s.pad,
    borderRadius: `${s.radius}px 0 0 ${s.radius}px`,
  };
  const labelStyle: CSSProperties =
    tone === "enforced"
      ? {
          font: `500 ${s.font}px var(--font-mono)`,
          letterSpacing: "0.1em",
          background: dark ? "var(--bone)" : "var(--ink)",
          color: dark ? "var(--dark)" : "var(--ground)",
          border: dark ? "1px solid var(--bone)" : "1px solid var(--ink)",
          padding: s.padSolid,
          borderRadius: tid ? `0 ${s.radius}px ${s.radius}px 0` : s.radius,
        }
      : tone === "advisory"
        ? {
            font: `500 ${s.font}px var(--font-mono)`,
            letterSpacing: "0.1em",
            border: dark ? "1px solid rgba(242,239,231,.5)" : "1px solid rgba(242,239,231,.45)",
            color: dark ? "rgba(242,239,231,.75)" : "rgba(242,239,231,.7)",
            padding: s.pad,
            borderRadius: tid ? `0 ${s.radius}px ${s.radius}px 0` : s.radius,
          }
        : {
            font: `500 ${s.font}px var(--font-mono)`,
            letterSpacing: "0.1em",
            border: dark ? "1px dotted rgba(242,239,231,.55)" : "1px dotted rgba(242,239,231,.45)",
            color: dark ? "rgba(242,239,231,.7)" : "rgba(242,239,231,.65)",
            padding: s.pad,
            borderRadius: s.radius,
          };
  const showTid = Boolean(tid) && tone !== "declared";
  return (
    <span
      data-enforcement={tone}
      style={{ display: "inline-flex", whiteSpace: "nowrap", ...style }}
    >
      {showTid ? (
        idHref ? (
          <a href={idHref} style={idStyle}>
            {tid}
          </a>
        ) : (
          <span style={idStyle}>{tid}</span>
        )
      ) : null}
      <span style={showTid ? labelStyle : { ...labelStyle, borderRadius: SIZE[size].radius }}>
        {LABEL[tone]}
      </span>
    </span>
  );
}

/** single tags: COMING (dashed), ROADMAP (dashed), SIGNED · FIRST-PARTY
 * (solid), and the honesty-block legend chips. */
export function Tag({
  kind,
  dark = false,
  style,
  children,
}: {
  kind: "dashed" | "dotted" | "solid" | "outline";
  dark?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const base: CSSProperties = {
    font: "500 8.5px var(--font-mono)",
    letterSpacing: "0.1em",
    padding: "2px 7px",
    borderRadius: "var(--r-tag)",
    whiteSpace: "nowrap",
  };
  const kinds: Record<string, CSSProperties> = dark
    ? {
        dashed: { border: "1px dashed rgba(242,239,231,.5)", color: "rgba(242,239,231,.7)" },
        dotted: { border: "1px dotted rgba(242,239,231,.55)", color: "rgba(242,239,231,.7)" },
        solid: { background: "var(--bone)", color: "var(--dark)" },
        outline: { border: "1px solid rgba(242,239,231,.5)", color: "rgba(242,239,231,.8)" },
      }
    : {
        dashed: { border: "1px dashed rgba(242,239,231,.4)", color: "rgba(242,239,231,.55)" },
        dotted: { border: "1px dotted rgba(242,239,231,.45)", color: "rgba(242,239,231,.65)" },
        solid: { background: "var(--ink)", color: "var(--ground)" },
        outline: { border: "1px solid rgba(242,239,231,.45)", color: "rgba(242,239,231,.7)" },
      };
  return <span style={{ ...base, ...kinds[kind], ...style }}>{children}</span>;
}
