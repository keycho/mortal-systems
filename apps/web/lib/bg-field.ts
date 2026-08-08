/**
 * the wall's background art: a nested-loop oxide line-form, generated
 * geometry like the landing page's contour mark, never an exported
 * bitmap. ported verbatim from the "mortal gate" light handoff's
 * `_bgField` generator (same deterministic prng as lib/contour.ts:
 * fractional part of sin(seed) * 10000), so the same seed always draws
 * the same form. paths are computed once at module scope.
 */

export interface FieldPath {
  d: string;
  /** per-loop stroke opacity, 0.05 to 0.14 on a sine across the field */
  op: string;
}

export function bgField(seed: number, n: number, cx: number, cy: number, rMax: number): FieldPath[] {
  let n0 = seed;
  const rnd = () => {
    n0 = Math.sin(n0) * 10000;
    return n0 - Math.floor(n0);
  };
  const TAU = Math.PI * 2;
  const harm: Array<{ k: number; a: number; p: number }> = [];
  for (let k = 0; k < 4; k++) {
    harm.push({ k: 2 + k, a: (0.05 + rnd() * 0.09) / (k * 0.8 + 1), p: rnd() * TAU });
  }
  const out: FieldPath[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / n;
    const R = rMax * (0.42 + 0.58 * t);
    const ox = cx + 26 * (1 - t);
    const oy = cy + 18 * (1 - t);
    let d = "";
    for (let j = 0; j <= 90; j++) {
      const th = ((j % 90) / 90) * TAU;
      let r = 1;
      for (const q of harm) r += q.a * Math.sin(th * q.k + q.p + t * 4);
      d += (j ? "L" : "M") + (ox + Math.cos(th) * R * r).toFixed(1) + " " + (oy + Math.sin(th) * R * r * 0.94).toFixed(1) + " ";
    }
    out.push({ d: d + "Z", op: (0.05 + 0.09 * Math.sin(Math.PI * t)).toFixed(2) });
  }
  return out;
}

/** the two forms the handoff locks: top-right on the wall, bottom-left
 * on the gate. seeds and geometry are the handoff's own numbers. */
export const WALL_FIELD = bgField(66.6, 40, 1120, 300, 420);
export const GATE_FIELD = bgField(51.2, 34, 260, 620, 380);

export const FIELD_VIEWBOX = "0 0 1440 900";
