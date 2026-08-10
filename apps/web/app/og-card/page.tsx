import type { Metadata } from "next";
import { contourMark, MARK_FORM, MARK_SEED, MARK_VIEWBOX } from "../../lib/contour";
import { Wordmark } from "../../components/Wordmark";

export const metadata: Metadata = {
  title: "og card · mortal systems",
  robots: { index: false, follow: false },
};

/**
 * the 1200x675 share graphic, rendered as a page so the checked-in
 * /og.png can be captured from the real thing (scripts/generate-og.mjs
 * screenshots this route from the static export). the mark is the hero's,
 * static: no animation in a still image.
 */
const mark = contourMark(MARK_SEED, MARK_FORM);

export default function OgCard() {
  return (
    <div style={{ background: "#0b0906", minHeight: "100vh" }}>
      <div
        id="og-card"
        style={{
          width: 1200,
          height: 675,
          background: "var(--ground)",
          position: "relative",
          overflow: "hidden",
          color: "var(--ink)",
        }}
      >
        <div className="grain-l" style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.035 }} />
        <div style={{ position: "absolute", right: -150, top: "50%", transform: "translateY(-50%)" }}>
          <svg viewBox={MARK_VIEWBOX} style={{ width: 640, display: "block" }} fill="none" aria-hidden>
            {mark.layers.map((p, i) => (
              <path key={i} d={p.d} stroke="var(--accent)" strokeWidth={1.1} />
            ))}
            <g transform="translate(-104,-88)">
              <path d={mark.stray} stroke="var(--accent-flare)" strokeWidth={1.5} />
            </g>
          </svg>
        </div>
        <span
          style={{
            position: "absolute",
            left: 64,
            right: 64,
            bottom: 96,
            height: 1,
            background: "rgba(242,239,231,.16)",
          }}
        />
        <div style={{ position: "absolute", left: 64, top: 56 }}>
          <Wordmark variant="nav" />
        </div>
        <div style={{ position: "absolute", left: 64, top: 150, maxWidth: 660 }}>
          <div
            style={{ font: "400 11px var(--font-mono)", letterSpacing: "0.2em", color: "rgba(242,239,231,.52)" }}
          >
            PROGRAMMABLE IDENTITY RUNTIME
          </div>
          <div
            style={{
              font: "400 64px/1.07 var(--font-display)",
              marginTop: 20,
              letterSpacing: "-0.012em",
              color: "var(--ink-display)",
              textWrap: "pretty",
            }}
          >
            Your agents should never <em style={{ fontStyle: "italic" }}>inherit</em> your
            identity.
          </div>
          <div
            style={{
              font: "400 17px/1.55 var(--font-display)",
              fontStyle: "italic",
              color: "rgba(242,239,231,.64)",
              marginTop: 24,
            }}
          >
            a task should never inherit more of you than it needs.
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 64,
            bottom: 56,
            font: "400 12px var(--font-mono)",
            color: "rgba(242,239,231,.5)",
            letterSpacing: "0.05em",
          }}
        >
          local-first&nbsp;&nbsp;/&nbsp;&nbsp;no account&nbsp;&nbsp;/&nbsp;&nbsp;scoped
          context&nbsp;&nbsp;/&nbsp;&nbsp;enforced lifecycle
        </div>
        <div
          style={{
            position: "absolute",
            right: 64,
            bottom: 56,
            font: "400 12px var(--font-mono)",
            color: "rgba(242,239,231,.45)",
          }}
        >
          mortal.systems
        </div>
      </div>
    </div>
  );
}
