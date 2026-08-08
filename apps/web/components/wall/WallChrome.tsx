import { FIELD_VIEWBOX, GATE_FIELD, WALL_FIELD, type FieldPath } from "../../lib/bg-field";

/**
 * the room the frames hang in (light handoff 2a/2b): tv grain over the
 * cream ground, the oxide line-form as background art (top-right on the
 * wall, bottom-left on the gate), and the plate border, a 1px rule inset
 * 18px from the viewport edge with mono stat chips masking it at the
 * four corners. all of it is pointer-transparent and sits under the
 * frames; every figure printed on a chip comes from the runtime, never
 * from this component.
 */

export interface PlateChips {
  tl?: string | null;
  tr?: string | null;
  /** the gate's ttl chip: life orange normally, red inside the final hour */
  trTone?: "life" | "final";
  bl?: string | null;
  br?: string | null;
}

export function WallChrome({ field, chips }: { field: "wall" | "gate"; chips: PlateChips }) {
  const paths: FieldPath[] = field === "wall" ? WALL_FIELD : GATE_FIELD;
  return (
    <div className="wall-room" aria-hidden>
      <div className="wall-grain" />
      <svg
        className={`wall-field ${field}`}
        viewBox={FIELD_VIEWBOX}
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        {paths.map((p, i) => (
          <path key={i} d={p.d} stroke="var(--w-oxide)" strokeWidth={1} opacity={p.op} />
        ))}
      </svg>
      <div className="wall-plate" />
      {chips.tl ? <span className="wall-chip tl">{chips.tl}</span> : null}
      {chips.tr ? (
        <span className={`wall-chip tr${chips.trTone ? ` ${chips.trTone}` : ""}`}>{chips.tr}</span>
      ) : null}
      {chips.bl ? <span className="wall-chip bl">{chips.bl}</span> : null}
      {chips.br ? <span className="wall-chip br">{chips.br}</span> : null}
    </div>
  );
}
