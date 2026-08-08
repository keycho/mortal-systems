import { contourMark, type ContourForm } from "../../lib/contour";

/**
 * the vacant frame (handoff §4): nine contour lines drifting, never the
 * word "vacant". the geometry is the site's own generator, so an empty
 * slot on the wall is the same form as the mark on the landing page,
 * quieter: one stroke weight, opacity distributed across the nine lines
 * on a sine so the field reads as depth rather than a stack.
 */
const VACANT_FORM: ContourForm = {
  n: 9,
  rMax: 150,
  cx: 208,
  cy: 125,
  sx: 1.0,
  sy: 0.78,
  dx: 22,
  dy: 12,
  sw: 6,
  swA: 12,
  sw2: 8,
  swA2: 9,
  tempI: -1, // no stray: the vacant field is all nine lines
  rMin: 0.36,
  hs: 0.8,
};

const form = contourMark(21.4, VACANT_FORM);

/** 6% to 18% across the nine lines, sine-distributed */
function lineOpacity(index: number, total: number): number {
  const t = total > 1 ? index / (total - 1) : 0;
  return 0.06 + 0.12 * Math.sin(Math.PI * t);
}

export function VacantForm() {
  return (
    <div className="wall-vacant-form" aria-hidden>
      <svg viewBox="0 0 416 250" fill="none" preserveAspectRatio="xMidYMid slice">
        {form.layers.map((layer, i) => (
          <path
            key={i}
            d={layer.d}
            stroke="var(--w-oxide)"
            strokeWidth={1}
            opacity={lineOpacity(i, form.layers.length)}
          />
        ))}
      </svg>
    </div>
  );
}
