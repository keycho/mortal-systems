import { vacantField } from "../../lib/contour";

/**
 * the vacant frame (handoff §4): nine quiet traces of the site's own
 * heartbeat mark drifting, never the word "vacant". the geometry is the
 * gate design file's `_vac` generator, ported into lib/contour beside
 * the hero mark it echoes: an empty plate on the wall is the brand mark
 * at rest, one stroke weight, opacity distributed across the nine lines
 * on a sine so the field reads as depth rather than a stack.
 */
const form = vacantField();

export function VacantForm() {
  return (
    <div className="wall-vacant-form" aria-hidden>
      <svg viewBox="0 0 416 250" fill="none" preserveAspectRatio="xMidYMid slice">
        {form.map((line, i) => (
          <path key={i} d={line.d} stroke="var(--w-oxide)" strokeWidth={1} opacity={line.op} />
        ))}
      </svg>
    </div>
  );
}
