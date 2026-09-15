// Geometric dashed-line detection (PLAN_CONNECTIVITY_SERVES.md Phase 1) —
// this corpus's own real CAD exports never emit PDF's setDash operator
// (measured 2026-09-15: zero hits across ~97,000 stroke operations sampled
// on three real sheets — Bessemer p6, ITD p4, NAVFAC MH101 — including
// across Bessemer's own visibly dashed thermostat-to-baseboard-heater
// control lines). These exporters draw a dash pattern as many short,
// gap-separated, COLLINEAR stroked segments instead — the same shape
// oneclick.ts's own markPolylineArcs already special-cases as "dash-gapped
// chords" for the arc-detection problem (see its own header comment). This
// module is the sibling for the STRAIGHT case: no turning, just rhythm.
//
// A NEW, purely additive parallel output — never packed into oneclick.ts's
// own `meta` byte. That byte has no free bit: the low nibble is entirely
// SEG_CURVE|SEG_CLIP|SEG_FILLONLY|SEG_POLYARC (1|2|4|8, every low-nibble
// value already spoken for) and the high nibble is the device pen width,
// ceil'd and capped at 15 (`meta[i] >> 4`, `devW << 4` at construction —
// oneclick.ts:527). Squeezing a new bit in anywhere would silently steal
// range from the pen-width nibble or collide with an existing SEG_* flag;
// a separate array costs one more Uint8Array per sheet and touches nothing
// that already exists. Every existing consumer of segs/meta is provably
// unaffected by this module's mere existence — it is never imported by
// oneclick.ts, wallnetwork.ts, netroom.js or symbolsweep.ts today.
//
// Pure, no DOM — same contract as oneclick.ts.

export interface DashDetectOpts {
  /** Real feet per graph-space unit, when the sheet's own scale is known —
   *  makes the dash-length ceiling feet-true instead of the scale-free
   *  span-fraction fallback. Omit when scale is unknown (same discipline
   *  mepconnectivity.ts's own DEFAULT_SNAP_FT/PX_PER_FT_GUESS fallback
   *  uses — a disclosed approximation, not silently assumed exact). */
  mppf?: number;
  /** Minimum consecutive same-run pieces before a chain counts as a dash
   *  pattern, never a stray 2-3-piece split from an incidental T-junction
   *  or a duplicated-stroke CAD export artifact. Default 4. */
  minCount?: number;
}

const DEFAULT_MIN_COUNT = 4;
// A genuine CAD dash cadence is short relative to its own run's total
// end-to-end span — this is the scale-free fallback when mppf is unknown:
// no single piece in a run may exceed this fraction of the whole chain's
// span. Holds for any real plotted dash cadence (ordinarily many dashes
// per drawn inch of run) while still rejecting a line merely broken into
// 2-3 long pieces by an incidental crossing or duplicate-stroke artifact.
const MAX_DASH_FRAC_OF_SPAN = 0.15;
// Feet-true dash-length ceiling when scale is known. Provisional — no real
// MEP corpus has tuned this yet, same honesty as this project's other
// unmeasured scale constants (mepconnectivity.ts's DEFAULT_SNAP_FT,
// DEFAULT_BRIDGE_FT): ~3 inches is generously above ordinary plotted CAD
// dash conventions (typically 0.125"-0.5").
const MAX_DASH_FT = 0.25;
// gap:dash ratio ceiling between consecutive pieces of the same run — real
// dash cadences run roughly gap ≈ 0.5x-3x the dash length; a wider gap is
// two genuinely separate pieces of linework, not one continued dash run.
const MAX_GAP_TO_DASH_RATIO = 4;
// Collinearity tolerance (radians) — dash pieces of one straight run may
// be emitted by the exporter walking the path in either parametric
// direction, so both the forward and 180°-flipped angle difference are
// tested (see `collinear` below); this tolerance is the slack on each.
const ANGLE_TOL = (3 * Math.PI) / 180;
// The exact low-nibble mask oneclick.ts's own SEG_CURVE|SEG_CLIP|
// SEG_FILLONLY|SEG_POLYARC occupies (1|2|4|8) — mirrored as a literal
// rather than imported, same discipline wallnetwork.ts already carries for
// its own mirrored SEG_CLIP bit (that module's own header comment: "this
// module consumes oneclick.ts, so importing back would make the cycle
// real"). A segment carrying any of these is never dash-pattern ink: a
// curve chord, invisible clip-only geometry, or a filled outline never
// participates in a straight dashed control line.
const SEG_NONDASH_MASK = 0b1111;

/** One byte per segment (same shape/order as `segs`): 1 when that segment
 *  is part of a detected straight dashed run, 0 otherwise. Pure — never
 *  mutates `segs` or `meta`. Relies on the SAME array-order-is-path-order
 *  assumption oneclick.ts's own markPolylineArcs already depends on for
 *  gap-joining dash-gapped arc chords (a PDF content stream strokes a
 *  path's pieces, dashed or not, in drawing order — consecutive segs
 *  entries are consecutive pieces of the same stroked path). */
export function detectDashedSegs(segs: number[], meta?: Uint8Array, opts: DashDetectOpts = {}): Uint8Array {
  const n = segs.length >> 2;
  const out = new Uint8Array(n);
  const minCount = opts.minCount ?? DEFAULT_MIN_COUNT;
  if (n < minCount) return out;
  const feetTrueCeiling = opts.mppf && opts.mppf > 0 ? MAX_DASH_FT * opts.mppf : undefined;

  const len = (i: number) => Math.hypot(segs[i * 4 + 2] - segs[i * 4], segs[i * 4 + 3] - segs[i * 4 + 1]);
  const angle = (i: number) => Math.atan2(segs[i * 4 + 3] - segs[i * 4 + 1], segs[i * 4 + 2] - segs[i * 4]);

  const classify = (idxs: number[]) => {
    if (idxs.length < minCount) return;
    const first = idxs[0], last = idxs[idxs.length - 1];
    const span = Math.hypot(
      segs[last * 4 + 2] - segs[first * 4], segs[last * 4 + 3] - segs[first * 4 + 1],
    );
    if (span <= 0) return;
    const ceiling = feetTrueCeiling ?? span * MAX_DASH_FRAC_OF_SPAN;
    for (const i of idxs) if (len(i) > ceiling) return; // any one long piece disqualifies the whole run
    for (let k = 1; k < idxs.length; k++) {
      const a = idxs[k - 1], b = idxs[k];
      const gap = Math.hypot(segs[b * 4] - segs[a * 4 + 2], segs[b * 4 + 1] - segs[a * 4 + 3]);
      const dashLen = Math.max(len(a), len(b), 1e-6);
      if (gap > dashLen * MAX_GAP_TO_DASH_RATIO) return;
    }
    for (const i of idxs) out[i] = 1;
  };

  let chain: number[] = [];
  const flush = () => { classify(chain); chain = []; };
  for (let i = 0; i < n; i++) {
    if (meta && (meta[i] & SEG_NONDASH_MASK)) { flush(); continue; }
    const li = len(i);
    if (li < 1e-6) continue; // degenerate — neither joins nor breaks a chain
    if (chain.length) {
      const p = chain[chain.length - 1];
      const sameMeta = !meta || meta[i] === meta[p];
      const gap = Math.hypot(segs[i * 4] - segs[p * 4 + 2], segs[i * 4 + 1] - segs[p * 4 + 3]);
      let da = angle(i) - angle(p);
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const collinear = Math.abs(da) <= ANGLE_TOL || Math.abs(Math.abs(da) - Math.PI) <= ANGLE_TOL;
      if (!sameMeta || !collinear || gap > Math.max(li, len(p)) * MAX_GAP_TO_DASH_RATIO) flush();
    }
    chain.push(i);
  }
  flush();
  return out;
}
