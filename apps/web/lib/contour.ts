/**
 * the hero contour mark — generated geometry, not an asset.
 * ported verbatim from the design handoff's generator: nested closed
 * contours whose radius is modulated by four seeded sine harmonics, with a
 * center drift across layers. the prng is deterministic (fractional part of
 * sin(seed) * 10000), so the same seed always renders the same mark; the
 * paths are computed at module scope and shipped as static svg.
 */

export interface ContourForm {
  /** number of nested contours (one of them becomes the stray) */
  n: number;
  rMax: number;
  cx: number;
  cy: number;
  sx: number;
  sy: number;
  /** center drift applied across layers */
  dx: number;
  dy: number;
  sw: number;
  swA: number;
  sw2: number;
  swA2: number;
  /** index of the layer lifted out as the stray line */
  tempI: number;
  rMin?: number;
  pw?: number;
  /** harmonic strength */
  hs?: number;
}

export interface ContourLayer {
  d: string;
  /** stagger-in animation delay, e.g. "0.09s" */
  dl: string;
}

export interface ContourMark {
  layers: ContourLayer[];
  /** the stray contour's path, rendered offset from the field */
  stray: string;
}

export function contourMark(seed: number, form: ContourForm): ContourMark {
  let n0 = seed;
  const rnd = () => {
    n0 = Math.sin(n0) * 10000;
    return n0 - Math.floor(n0);
  };
  const N = form.n;
  const pts = 56;
  const TAU = Math.PI * 2;
  const h: Array<{ k: number; a: number; p: number; d: number }> = [];
  for (let k = 0; k < 4; k++) {
    h.push({
      k: 2 + k + Math.floor(rnd() * 2),
      a: (0.06 + rnd() * 0.1) / (k * 0.8 + 1),
      p: rnd() * TAU,
      d: (rnd() - 0.5) * 2.2,
    });
  }
  const layers: ContourLayer[] = [];
  let stray = "";
  for (let i = 0; i < N; i++) {
    const t = (i + 1) / N;
    const rm = form.rMin ?? 0.12;
    const R = form.rMax * (rm + (1 - rm) * Math.pow(t, form.pw ?? 1));
    const cx = form.cx + form.dx * (1 - t) + Math.sin(t * form.sw) * form.swA;
    const cy = form.cy + form.dy * (1 - t) + Math.cos(t * form.sw2) * form.swA2;
    let d = "";
    for (let j = 0; j <= pts; j++) {
      const th = ((j % pts) / pts) * TAU;
      let r = 1;
      const hs = form.hs ?? 1;
      for (const q of h) r += hs * q.a * Math.sin(th * q.k + q.p + t * q.d * 6);
      const x = cx + Math.cos(th) * R * r * form.sx;
      const y = cy + Math.sin(th) * R * r * form.sy;
      d += (j ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1) + " ";
    }
    d += "Z";
    if (i === form.tempI) stray = d;
    else layers.push({ d, dl: (i * 0.045).toFixed(2) + "s" });
  }
  return { layers, stray };
}

/** the one mark the site uses (hero + og card), locked by the handoff */
export const MARK_FORM: ContourForm = {
  n: 54,
  rMax: 205,
  cx: 300,
  cy: 268,
  sx: 1.0,
  sy: 0.94,
  dx: 34,
  dy: 22,
  sw: 6,
  swA: 14,
  sw2: 8,
  swA2: 12,
  tempI: 52,
  rMin: 0.34,
  hs: 0.85,
};

export const MARK_SEED = 66.6;

export const MARK_VIEWBOX = "-90 -70 760 640";
