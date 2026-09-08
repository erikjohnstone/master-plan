// Table-box scoring — pure (no DOM, no pdf.js), node-testable.
//
// WHY THIS EXISTS AT ALL, GIVEN boxscore.py REPORTS 137/137
//
// `opentakeoff/bakeoff/boxscore.py` scores the PYTHON table engine, in Python,
// against the hand-authored boxes in `opentakeoff-corpus/keys/*.tableboxes.csv`
// — and reports every one of them correct at Error-of-Boundary ≤ 4pt. But what
// the app actually paints is `ScheduleTable.region`, and by the time a region
// reaches a highlight it has been through `scheduleTableFromODL`,
// `adoptVectorGridTables`, `dedupCrossSourceTables`,
// `collapseEquivalentPrimaryTables` and `snapAllTableCellBboxes`. Nobody had
// ever scored THAT. The gap between the two numbers is the whole point of this
// module and of `mcp/scripts/table-box-eval.mjs`, which uses it.
//
// EoB — the worst of the four edge errors — rather than IoU alone, following
// TableSense (AAAI 2019) and `boxscore.py`'s own reasoning: IoU@0.5 passes a
// box that has clipped two rows off a twelve-row schedule, and a clipped
// schedule is a wrong quantity, not a slightly worse picture.
//
// `eob` and `iou` here are a deliberate PORT of `boxscore.py`'s own two
// functions, not a reimplementation of the idea. They are pinned to it by
// `test/fixtures/boxScoreParity.json`, generated from the Python functions
// themselves, so the two rulers cannot drift apart quietly. Spawning Python for
// eight arithmetic operations would also put the number out of reach of
// `npm test`, which is where a ruler wants to be.

/** [x0, top, x1, bot] — a half-open axis-aligned rectangle, y DOWN. Both the
 *  authored keys and `ScheduleTable.region` use this order. */
export type Box = [number, number, number, number];

/** CORRECT, in `boxscore.py`'s sense: every edge within this many POINTS of the
 *  edge a human measured. Not a tuning knob — it is the tolerance the ground
 *  truth was authored to. */
export const CORRECT_EOB_PT = 4.0;

const finite4 = (b: unknown): b is Box =>
  Array.isArray(b) && b.length === 4 && b.every((v) => typeof v === "number" && Number.isFinite(v));

/** Worst of the four edge errors. Same units as the inputs. */
export function eob(a: Box, b: Box): number {
  return Math.max(
    Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]),
    Math.abs(a[2] - b[2]), Math.abs(a[3] - b[3]),
  );
}

/** Rectangle IoU. Zero-area union yields 0, matching `boxscore.py` — two
 *  degenerate boxes are not "perfectly agreed", they are unmeasurable. */
export function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return ua > 0 ? inter / ua : 0;
}

export function boxArea(b: Box): number {
  return Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
}

/** The union rectangle of some boxes, skipping anything malformed rather than
 *  letting a NaN or a short array drag an edge to zero. */
export function boxUnion(boxes: readonly unknown[]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) {
    if (!finite4(b)) continue;
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]);
    x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

/** Project px → PDF points. `ScheduleTable.region` is points × RENDER_SCALE
 *  (see `src/lib/sheets.ts`); the authored keys are points. Callers pass the
 *  scale rather than importing it, because `sheets.ts` pulls in pdf.js and this
 *  module is deliberately dependency-free. */
export function pxToPt(b: Box, scale: number): Box {
  if (!(scale > 0)) throw new Error(`pxToPt: scale must be positive, got ${scale}`);
  return [b[0] / scale, b[1] / scale, b[2] / scale, b[3] / scale];
}

/** Optimal 1-to-1 assignment minimising total cost (Hungarian / Kuhn–Munkres,
 *  O(n²m) potentials form). Returns `assign[i] = j | -1`.
 *
 *  Greedy nearest-match — which is what "the closest proposal" reads as — makes
 *  the result depend on iteration order, so two emitted tables overlapping the
 *  same authored box can be scored differently depending on which the pipeline
 *  happened to emit first. On a ruler that is not acceptable. */
export function hungarian(cost: readonly (readonly number[])[]): number[] {
  const n = cost.length;
  const m = n ? cost[0].length : 0;
  if (!n || !m) return new Array(n).fill(-1);
  // The potentials form below requires rows ≤ cols; transpose and invert if not.
  if (n > m) {
    const t: number[][] = Array.from({ length: m }, (_, j) => Array.from({ length: n }, (_, i) => cost[i][j]));
    const back = hungarian(t);
    const out = new Array(n).fill(-1);
    back.forEach((i, j) => { if (i >= 0) out[i] = j; });
    return out;
  }
  const INF = Infinity;
  const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(INF);
    const used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const assign = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j] > 0) assign[p[j] - 1] = j - 1;
  return assign;
}

export interface BoxPair { a: number; b: number; iou: number; eob: number }

/** Best 1-to-1 pairing of two box lists by IoU, dropping pairs below `floor`.
 *  `floor` exists so that "the assignment had to put these two together because
 *  nothing else was left" does not read as a match. */
export function assignByIou(as: readonly Box[], bs: readonly Box[], floor = 0.3): BoxPair[] {
  if (!as.length || !bs.length) return [];
  const cost = as.map((a) => bs.map((b) => 1 - iou(a, b)));
  const assign = hungarian(cost);
  const out: BoxPair[] = [];
  assign.forEach((j, i) => {
    if (j < 0) return;
    const v = iou(as[i], bs[j]);
    if (v < floor) return;
    out.push({ a: i, b: j, iou: v, eob: eob(as[i], bs[j]) });
  });
  return out;
}
