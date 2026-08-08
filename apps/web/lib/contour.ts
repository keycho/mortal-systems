/**
 * the hero mark — generated geometry, not an asset.
 * ported verbatim from the design handoff's generator (`_stack` in the
 * site design file): a heartbeat field of 54 stacked ECG traces, each a
 * sum of gaussians (P bump, Q dip, R spike, S dip, T bump) around a
 * per-layer spike center that drifts across the stack, shaped by a
 * sine envelope with a 0.22 floor. the prng is deterministic
 * (fractional part of sin(seed) * 10000), so the same seed always
 * renders the same mark; the paths are computed at module scope and
 * shipped as static svg. layer 40 is lifted out as the stray.
 */

export interface HeartbeatForm {
  /** number of stacked traces (one of them becomes the stray) */
  n: number;
  x0: number;
  /** trace width */
  w: number;
  y0: number;
  /** stack height */
  h: number;
  /** spike amplitude before the envelope */
  amp: number;
  /** spike center as a fraction of the trace, 0..1 */
  cU: number;
  /** center drift applied across layers */
  drift: number;
  /** index of the layer lifted out as the stray line */
  tempI: number;
}

export interface ContourLayer {
  d: string;
  /** stagger-in animation delay, e.g. "0.09s" */
  dl: string;
}

export interface ContourMark {
  layers: ContourLayer[];
  /** the stray trace's path, rendered offset from the field */
  stray: string;
}

/** the shared ECG beat: P bump, Q dip, R spike, S dip, T bump */
const gauss = (u: number, c: number, w: number) => Math.exp(-((u - c) * (u - c)) / (w * w));
const beat = (u: number, c: number) =>
  0.1 * gauss(u, c - 0.14, 0.03) -
  0.16 * gauss(u, c - 0.035, 0.012) +
  gauss(u, c, 0.01) -
  0.26 * gauss(u, c + 0.035, 0.014) +
  0.2 * gauss(u, c + 0.13, 0.045);

export function contourMark(seed: number, form: HeartbeatForm): ContourMark {
  let n0 = seed;
  const rnd = () => {
    n0 = Math.sin(n0) * 10000;
    return n0 - Math.floor(n0);
  };
  const N = form.n;
  const pts = 220;
  const layers: ContourLayer[] = [];
  let stray = "";
  for (let i = 0; i < N; i++) {
    const t = (i + 1) / N;
    const y0 = form.y0 + form.h * (i / (N - 1));
    const env = Math.sin(Math.PI * Math.pow(t, 0.8));
    const amp = form.amp * (0.22 + 0.78 * env);
    const c = form.cU + form.drift * (1 - t) + (rnd() - 0.5) * 0.03;
    const ph = rnd() * 6.28;
    let d = "";
    for (let j = 0; j <= pts; j++) {
      const u = j / pts;
      const x = form.x0 + u * form.w;
      const y = y0 - amp * beat(u, c) + 2.5 * Math.sin(u * 9 + ph + t * 5);
      d += (j ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1) + " ";
    }
    if (i === form.tempI) stray = d;
    else layers.push({ d, dl: (i * 0.045).toFixed(2) + "s" });
  }
  return { layers, stray };
}

/** the one mark the site uses (hero + og card), locked by the handoff */
export const MARK_FORM: HeartbeatForm = {
  n: 54,
  x0: 10,
  w: 750,
  y0: 60,
  h: 420,
  amp: 165,
  cU: 0.56,
  drift: 0.09,
  tempI: 40,
};

export const MARK_SEED = 61.8;

export const MARK_VIEWBOX = "-90 -70 760 640";

/**
 * the wall's vacant form (`_vac` in the gate design file): nine quiet
 * traces of the same beat, sized to a frame. an empty plate on the wall
 * is the brand mark at rest. opacity is distributed on a sine across
 * the nine lines so the field reads as depth rather than a stack.
 */
export interface VacantLine {
  d: string;
  op: string;
}

export function vacantField(): VacantLine[] {
  let n0 = 44.7;
  const rnd = () => {
    n0 = Math.sin(n0) * 10000;
    return n0 - Math.floor(n0);
  };
  const out: VacantLine[] = [];
  for (let i = 0; i < 9; i++) {
    const t = (i + 1) / 9;
    const y0 = 70 + 130 * (i / 8);
    const amp = 46 * Math.sin(Math.PI * Math.pow(t, 0.8));
    const c = 0.45 + (rnd() - 0.5) * 0.06;
    const ph = rnd() * 6.28;
    let d = "";
    for (let j = 0; j <= 160; j++) {
      const u = j / 160;
      d += (j ? "L" : "M") + (-40 + u * 500).toFixed(1) + " " + (y0 - amp * beat(u, c) + 2 * Math.sin(u * 8 + ph)).toFixed(1) + " ";
    }
    out.push({ d, op: (0.06 + 0.12 * Math.sin(Math.PI * t)).toFixed(2) });
  }
  return out;
}
