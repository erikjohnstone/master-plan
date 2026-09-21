// Segment spatial index — Stage 2 of the trace engine (WP3.2,
// opentakeoff-corpus/goals/LINEAR_TAKEOFF.md, plan §6.3/§6.11). Pure: no
// React, no DOM, no pdf.js. Indexes ONLY the candidate segments a
// `StrokeClasses` (strokes.ts, WP3.1) already picked out — a click, a
// walker frontier, or a double-line pair search never needs to consider
// excluded ink at all.
//
// Two purpose-built static spatial libraries, not a hand-rolled grid and
// not JTS (the goal doc is explicit: "NO global noding. NO JTS on this
// path" — jsts's own STRtree/KdTree ship as a transitive dependency
// already, but using them here would pull the noding-heavy path this
// module exists to avoid):
//   - `flatbush` (ISC licence) — a packed Hilbert R-tree over segment
//     bboxes. Replaces `geometry.js`'s `buildSegGrid` (a hand-rolled hash
//     grid that silently CAPS each cell at 64 segment indices — on dense
//     real linework that is a correctness bug, not just a speed one, since
//     a bucket that's full just drops candidates) and
//     `nearestIntersection`'s O(k²) pairwise scan.
//   - `kdbush` (ISC licence) — a static k-d tree over segment endpoints
//     (two points per candidate segment). Replaces `geometry.js`'s
//     `buildSnapGrid` (the 40-per-cell endpoint grid) for this path.
// Both store their index as a single transferable `ArrayBuffer` (`.data`),
// which is the whole reason this module exists rather than reusing the
// existing hash grids: `buildSegmentIndex` runs once per (sheet, scale) in
// `worker.ts` (this checkpoint's own sibling module), and the built index
// crosses to the main thread as a structured-clone-free transfer instead
// of a message-passing round trip per query — plan §6.10 budgets the
// click-to-walk step at "main thread (pure, synchronous), < 10 ms," which
// a worker-resident index answering by postMessage could not meet.
import Flatbush from "flatbush";
import KDBush from "kdbush";

/** One exact nearest-segment hit — plan §6.3's "box search... then
 *  `distToSeg`," extended with the projection point and parameter `t` the
 *  walker (WP3.4) needs to know WHERE on the segment the hit landed. */
export interface SegmentHit {
  seg: number;     // index into the ORIGINAL segs array (not a candidate-only index)
  t: number;       // 0..1 along the segment from (x1,y1) to (x2,y2)
  px: number; py: number;   // the projection point
  dist: number;    // true point-to-segment distance
}

/** A built spatial index over one sheet's candidate segments. Construct
 *  with `buildSegmentIndex`; never by hand. */
export interface SegmentIndex {
  segs: number[];
  meta: Uint8Array;
  family: Int16Array | null;
  numCandidates: number;
  /** flatbush item index -> index into `segs` (>> 2 units, i.e. the same
   *  segment-index convention every other classifier here uses). Needed
   *  because flatbush only ever knows about the candidates it was given,
   *  numbered 0..numCandidates-1 in add order, not the original sheet's
   *  full segment numbering. */
  candidateToSeg: Int32Array;
  segBush: Flatbush;
  /** kdbush endpoint id -> (seg, end): `id >> 1` is the candidateToSeg
   *  index, `id & 1` is 0 for the segment's first point, 1 for its second. */
  endBush: KDBush;
}

const MAX_NEIGHBOR_K = 512;   // widen-and-retry ceiling for nearestSegment — generous; a real click never approaches it

/** Plan §6.2/§6.3's own candidate convention: build over exactly the
 *  segments `StrokeClasses.candidate` marked 1, in their original index
 *  order (segIdx 0..n-1), skipping every excluded one. A segment with
 *  degenerate (zero-length) coordinates still indexes — flatbush/kdbush
 *  are agnostic to that; only `nearestSegment`'s own distance math cares,
 *  and a zero-length "segment" degenerates to a point-distance query,
 *  which is correct, not a special case. */
export function buildSegmentIndex(
  segs: number[], meta: Uint8Array, classes: { candidate: Uint8Array; family?: Int16Array | null },
): SegmentIndex {
  const n = segs.length >> 2;
  const candidateSegs: number[] = [];
  for (let i = 0; i < n; i++) if (classes.candidate[i]) candidateSegs.push(i);
  const numCandidates = candidateSegs.length;
  const candidateToSeg = Int32Array.from(candidateSegs);

  const segBush = new Flatbush(Math.max(1, numCandidates));
  const endBush = new KDBush(Math.max(1, numCandidates * 2));
  for (const segIdx of candidateSegs) {
    const x1 = segs[segIdx * 4], y1 = segs[segIdx * 4 + 1], x2 = segs[segIdx * 4 + 2], y2 = segs[segIdx * 4 + 3];
    segBush.add(Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2));
    endBush.add(x1, y1);
    endBush.add(x2, y2);
  }
  // Flatbush/KDBush both throw if finish() runs with an add() count that
  // doesn't match the constructor's declared size — the Math.max(1, …)
  // sizing above allocates room for exactly one harmless dummy entry each
  // on an all-excluded sheet (numCandidates*2 endpoint slots is also 0,
  // floored to the same 1).
  if (!numCandidates) { segBush.add(0, 0, 0, 0); endBush.add(0, 0); }
  segBush.finish();
  endBush.finish();

  return { segs, meta, family: classes.family ?? null, numCandidates, candidateToSeg, segBush, endBush };
}

function boxDistance(x: number, y: number, x1: number, y1: number, x2: number, y2: number): number {
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2), minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  const dx = Math.max(minX - x, 0, x - maxX);
  const dy = Math.max(minY - y, 0, y - maxY);
  return Math.hypot(dx, dy);
}

/** geometry.js's own `distToSeg` formula, extended to also return the
 *  clamped parameter `t` and the projection point — reimplemented rather
 *  than importing distToSeg-plus-a-second-pass, since the clamped `t` is
 *  computed once either way. Never diverges from distToSeg's own math:
 *  same clamp, same hypot. */
function projectToSeg(x: number, y: number, x1: number, y1: number, x2: number, y2: number): { t: number; px: number; py: number; dist: number } {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  let t = l2 ? ((x - x1) * dx + (y - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = x1 + t * dx, py = y1 + t * dy;
  return { t, px, py, dist: Math.hypot(x - px, y - py) };
}

/** Exact nearest candidate segment to (x, y) within `maxDist` — plan
 *  §6.3's "box search... then `distToSeg`," done as the survey's own
 *  incremental-neighbours technique: `flatbush.neighbors` returns
 *  candidates in BOX-distance order (a true lower bound on point-to-
 *  segment distance, since every segment lies inside its own bbox), so
 *  once a candidate's OWN box distance exceeds the best TRUE distance
 *  found so far, every later candidate (box distance only increases) is
 *  proven unable to beat it — no more neighbours need to be pulled. Starts
 *  at a small K and doubles on a caller-supplied `filterFn` rejecting
 *  everything pulled so far or the batch running out before proof, up to
 *  `MAX_NEIGHBOR_K`. `filterFn` (e.g. same-family-only for the walker's
 *  bridge/crossing queries) is applied INSIDE flatbush's own neighbor
 *  search via the candidate index, not as a post-filter — a rejected
 *  candidate never occupies a slot in a small K. */
export function nearestSegment(index: SegmentIndex, x: number, y: number, maxDist: number, filterFn?: (seg: number) => boolean): SegmentHit | null {
  if (!index.numCandidates) return null;
  const seen = new Uint8Array(index.numCandidates);
  let best: SegmentHit | null = null;
  let k = 8;
  while (true) {
    const capped = Math.min(k, index.numCandidates);
    const ids = index.segBush.neighbors(x, y, capped, maxDist, filterFn ? (fi) => filterFn(index.candidateToSeg[fi]) : undefined);
    let provedOptimal = false;
    for (const fi of ids) {
      if (seen[fi]) continue;
      seen[fi] = 1;
      const segIdx = index.candidateToSeg[fi];
      const x1 = index.segs[segIdx * 4], y1 = index.segs[segIdx * 4 + 1], x2 = index.segs[segIdx * 4 + 2], y2 = index.segs[segIdx * 4 + 3];
      const bd = boxDistance(x, y, x1, y1, x2, y2);
      if (best && bd > best.dist) { provedOptimal = true; break; }
      const proj = projectToSeg(x, y, x1, y1, x2, y2);
      if (!best || proj.dist < best.dist) best = { seg: segIdx, t: proj.t, px: proj.px, py: proj.py, dist: proj.dist };
    }
    if (provedOptimal || ids.length < capped || capped >= index.numCandidates || k >= MAX_NEIGHBOR_K) break;
    k *= 2;
  }
  return best && best.dist <= maxDist ? best : null;
}

/** All candidate segments whose bbox intersects the given box — plan
 *  §6.3's crossing-detection query ("interior intersections within τ") and
 *  WP4's double-line pair search (a segment's own bbox expanded by
 *  `w_max`). Returns ORIGINAL segment indices, not flatbush item ids. */
export function segmentsInBox(index: SegmentIndex, minX: number, minY: number, maxX: number, maxY: number, filterFn?: (seg: number) => boolean): number[] {
  if (!index.numCandidates) return [];
  const ids = index.segBush.search(minX, minY, maxX, maxY, filterFn ? (fi) => filterFn(index.candidateToSeg[fi]) : undefined);
  return ids.map((fi) => index.candidateToSeg[fi]);
}

/** All candidate segments with an endpoint within `r` of (x, y) — the
 *  probe's own `near(ex, ey)` frontier query (plan §6.3's endpoint
 *  welding), now exact instead of a 3×3 hash-cell scan. Returns
 *  `{seg, end}` pairs: `end` 0 = the segment's first point, 1 = its
 *  second — the walker needs to know WHICH end welded, not just that one did. */
export function endpointsNear(index: SegmentIndex, x: number, y: number, r: number, filterFn?: (seg: number) => boolean): { seg: number; end: 0 | 1 }[] {
  if (!index.numCandidates) return [];
  const ids = index.endBush.within(x, y, r);
  const out: { seg: number; end: 0 | 1 }[] = [];
  for (const id of ids) {
    const seg = index.candidateToSeg[id >> 1];
    if (filterFn && !filterFn(seg)) continue;
    out.push({ seg, end: (id & 1) as 0 | 1 });
  }
  return out;
}

/** The wire shape `serializeSegmentIndex`/`deserializeSegmentIndex` pass
 *  across a worker boundary — everything needed to rebuild a `SegmentIndex`
 *  EXCEPT `segs`/`meta`, which the main thread already has (it is what it
 *  sent the worker to build from) and `worker.ts` never echoes back. */
export interface SegmentIndexPayload {
  numCandidates: number;
  candidateToSeg: ArrayBuffer;   // Int32Array buffer
  segBushData: ArrayBuffer;
  endBushData: ArrayBuffer;
}

/** Serializes a built index into `worker.ts`'s own reason for existing: one
 *  transferable payload, structured-clone-free, plus the exact transfer
 *  list to hand `postMessage`'s second argument. */
export function serializeSegmentIndex(index: SegmentIndex): { payload: SegmentIndexPayload; transfer: ArrayBuffer[] } {
  const candidateToSeg = index.candidateToSeg.buffer as ArrayBuffer;
  const segBushData = index.segBush.data as ArrayBuffer;
  const endBushData = index.endBush.data as ArrayBuffer;
  return { payload: { numCandidates: index.numCandidates, candidateToSeg, segBushData, endBushData }, transfer: [candidateToSeg, segBushData, endBushData] };
}

/** Reconstructs a `SegmentIndex` from a `serializeSegmentIndex` payload — the
 *  main thread's half of the pair, given the SAME `segs`/`meta` (and,
 *  optionally, `family`) it already holds locally. `Flatbush.from`/
 *  `KDBush.from` read the transferred buffer directly; no re-indexing. */
export function deserializeSegmentIndex(segs: number[], meta: Uint8Array, family: Int16Array | null, payload: SegmentIndexPayload): SegmentIndex {
  return {
    segs, meta, family, numCandidates: payload.numCandidates,
    candidateToSeg: new Int32Array(payload.candidateToSeg),
    segBush: Flatbush.from(payload.segBushData),
    endBush: KDBush.from(payload.endBushData),
  };
}

/** Plan §6.11's own click hit-tolerance formula, image px: the larger of a
 *  constant SCREEN-px aim radius scaled by zoom (`11/zoom` — the exact
 *  literal `TakeoffCanvas.jsx`'s endpoint/segment/intersection snap all
 *  already share) and half the segment's own device stroke width plus a
 *  half-pixel floor (a hairline stroke, pen nibble 0, must still be
 *  clickable). `penWidthPx` is the device pen nibble (`meta[i] >> 4`),
 *  already baseline-frame px — the SAME frame `x`/`y` must be in before
 *  calling `nearestSegment`/`endpointsNear` (a hi-res panel click needs the
 *  `kF` conversion `TakeoffCanvas.jsx` already applies before this). */
export function hitTolerancePx(zoom: number, penWidthPx: number): number {
  const z = zoom > 0 ? zoom : 1;
  return Math.max(11 / z, penWidthPx / 2 + 0.5);
}
