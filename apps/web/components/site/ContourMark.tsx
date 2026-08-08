import { contourMark, MARK_FORM, MARK_SEED, MARK_VIEWBOX } from "../../lib/contour";

/**
 * the hero mark: a heartbeat field, 54 stacked ECG traces computed once
 * at module scope (the generator is deterministic) and shipped as static
 * svg. the field layers stagger in on load and breathe on a 16s cycle;
 * layer 40 is the stray, offset from the field, looping solid to flare
 * to dashed erosion and back (identity forming and dissolving). under
 * prefers-reduced-motion the css collapses every animation: static full
 * field, solid stray, no loop.
 */
const mark = contourMark(MARK_SEED, MARK_FORM);

export function ContourMark({ width = 680 }: { width?: number }) {
  return (
    <svg
      className="mk-anim"
      viewBox={MARK_VIEWBOX}
      style={{ width, maxWidth: "100%", display: "block" }}
      fill="none"
      aria-hidden
    >
      {mark.layers.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke="var(--accent)"
          strokeWidth={1.1}
          style={{ animation: "stkCycle 16s ease-in-out infinite", animationDelay: p.dl }}
        />
      ))}
      <g transform="translate(-104,-88)">
        <path
          d={mark.stray}
          stroke="var(--accent-flare)"
          strokeWidth={1.3}
          strokeDasharray="5 7"
          opacity={0}
          style={{ animation: "stkDash 16s linear infinite" }}
        />
        <path
          d={mark.stray}
          stroke="var(--accent)"
          strokeWidth={1.5}
          style={{ animation: "stkSolid 16s linear infinite" }}
        />
      </g>
    </svg>
  );
}
