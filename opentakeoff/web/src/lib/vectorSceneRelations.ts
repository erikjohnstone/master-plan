// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 2 §7 — concrete pieces of
// "intersections, T-junctions, X-junctions, endpoints, collinearity,
// near-parallel and near-perpendicular relations": endpoint clustering and
// junction-degree classification (computeVectorSceneJunctions), plus
// pairwise collinearity/near-parallel/near-perpendicular relations
// (computeVectorScenePairRelations). Both are pure, additive consumers of
// a built VectorSceneIndex — neither mutates the index, and NEITHER is yet
// wired into `buildVectorSceneIndex`'s own `intersections` field (that
// field stays an empty stub — see vectorSceneIndex.ts's own
// `notYetImplemented` — until this contract has proven out on real sheets,
// per the same "prove the contract before wiring it in" discipline slice 5
// used for the cache). True mid-segment intersection (two segments
// crossing without sharing an endpoint) remains open for a further slice.
import type { VectorSceneIndex } from "./vectorSceneIndex.ts";

/** Coordinate tolerance (image px) for "the same point" — two endpoints
 *  within this distance of each other are one junction, not two. Matches
 *  the grain other snap tolerances in this codebase use for drafted ink
 *  (geometry.js's own ANGLE_TOL-adjacent conventions), not a hard PDF-
 *  spec-derived number: drafted linework never lands pixel-exact, so a
 *  useful tolerance has to be a little looser than "identical". */
export const JUNCTION_SNAP_TOL = 0.75;

/** Two segments meeting end-to-end whose directions (each pointing AWAY
 *  from the shared point) differ from a straight 180° by less than this
 *  many degrees are a "pass-through" — one straight run that happened to
 *  be split into two primitives (a dashed line, a chain of lineTo calls) —
 *  not a real topological corner. */
export const PASS_THROUGH_ANGLE_TOL_DEG = 15;

/** Disclosed safety cap (same ethos as VECTOR_SCENE_INDEX_MAX_PRIMITIVES):
 *  clustering is near-linear (grid-bucketed, not all-pairs) but still
 *  real work per primitive, and a cap breach must produce an incomplete
 *  state rather than a silent partial pass over an oversized sheet. */
export const RELATIONS_MAX_PRIMITIVES = 50_000;

export interface JunctionMember {
  primitiveId: number;
  end: "a" | "b";
  /** direction of this segment, in degrees [0, 360), pointing AWAY from
   *  the junction along the segment — e.g. two collinear segments meeting
   *  end-to-end point in near-opposite directions from their shared point. */
  angleDeg: number;
}

export type JunctionKind =
  | "dangling"       // one segment ends here and nothing else touches it
  | "pass-through"   // two segments, near-180° apart: one straight run, split
  | "corner"         // two segments meeting at a real angle
  | "t"              // three segments meeting
  | "x"              // four segments meeting
  | "multi";         // more than four

export interface Junction {
  id: number;
  x: number; y: number;
  members: JunctionMember[];
  kind: JunctionKind;
}

export interface RelationsResult {
  junctions: Junction[];
  incomplete: boolean;
  incompleteReason: string | null;
}

function dirAngleDeg(dx: number, dy: number): number {
  // A zero-length segment (x0===x1 && y0===y1) has no real direction;
  // atan2(0,0) is 0 by convention in JS, which this accepts rather than
  // special-casing — a degenerate segment is not expected from real
  // extraction (every emitted segment came from an actual line draw) and
  // its contribution to a junction's kind is a documented edge case, not
  // a crash.
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function classify(members: JunctionMember[]): JunctionKind {
  if (members.length <= 1) return "dangling";
  if (members.length === 2) {
    const diff = angleDiffDeg(members[0].angleDeg, members[1].angleDeg);
    return Math.abs(diff - 180) <= PASS_THROUGH_ANGLE_TOL_DEG ? "pass-through" : "corner";
  }
  if (members.length === 3) return "t";
  if (members.length === 4) return "x";
  return "multi";
}

/** Groups primitive endpoints into junctions (within JUNCTION_SNAP_TOL of
 *  each other) and classifies each by degree/angle. Grid-bucketed (the same
 *  cell-hash idea geometry.js's buildSnapGrid/nearestSnap already use in
 *  this codebase), so cost is near-linear in primitive count rather than
 *  the O(n²) an all-pairs comparison would cost. Clip-only primitives
 *  (SEG_CLIP — invisible ink, never a wall) never contribute endpoints:
 *  a clip path's corners are not drafted joints. */
export function computeVectorSceneJunctions(
  idx: VectorSceneIndex,
  opts: { maxPrimitives?: number; tol?: number } = {},
): RelationsResult {
  const cap = opts.maxPrimitives ?? RELATIONS_MAX_PRIMITIVES;
  const tol = opts.tol ?? JUNCTION_SNAP_TOL;
  const n = idx.primitives.length;
  if (n > cap) {
    return {
      junctions: [],
      incomplete: true,
      incompleteReason: `primitive count ${n} exceeds the ${cap}-primitive relations cap; no junctions were computed`,
    };
  }

  const cell = Math.max(tol, 1e-6);
  const cellKey = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  const grid = new Map<string, number[]>();   // cell key -> cluster indices whose center falls in it
  const clusters: { x: number; y: number; members: JunctionMember[] }[] = [];

  const findOrCreateCluster = (x: number, y: number): number => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const arr = grid.get(`${gx},${gy}`);
        if (!arr) continue;
        for (const ci of arr) {
          const c = clusters[ci];
          const dx = c.x - x, dy = c.y - y;
          if (dx * dx + dy * dy <= tol * tol) return ci;
        }
      }
    }
    // the cluster's reported (x, y) is the FIRST endpoint that created it,
    // not a running centroid — within one JUNCTION_SNAP_TOL cell that is
    // never more than `tol` away from any member's true position, which is
    // the same order of imprecision the tolerance itself already accepts.
    const ci = clusters.length;
    clusters.push({ x, y, members: [] });
    const k = cellKey(x, y);
    let arr = grid.get(k);
    if (!arr) { arr = []; grid.set(k, arr); }
    arr.push(ci);
    return ci;
  };

  for (const p of idx.primitives) {
    if (p.clip) continue;
    const ends: Array<["a" | "b", number, number, number, number]> = [
      ["a", p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0],
      ["b", p.x1, p.y1, p.x0 - p.x1, p.y0 - p.y1],
    ];
    for (const [end, x, y, dx, dy] of ends) {
      const ci = findOrCreateCluster(x, y);
      clusters[ci].members.push({ primitiveId: p.id, end, angleDeg: dirAngleDeg(dx, dy) });
    }
  }

  const junctions: Junction[] = clusters.map((c, id) => ({
    id, x: c.x, y: c.y, members: c.members, kind: classify(c.members),
  }));
  return { junctions, incomplete: false, incompleteReason: null };
}

// ── collinearity / near-parallel / near-perpendicular pair relations ──────
// The second piece of goal §7's relations line. Orientation is direction
// MOD 180° (an undirected line and its reverse are the same orientation),
// bucketed into 2°-wide bins so comparisons stay near-linear in the common
// case: a real sheet has thousands of segments but only a handful of
// dominant orientations, so only same-/near-orientation (parallel) or
// ~90°-offset (perpendicular) buckets are ever compared against each
// other — never a full O(n²) sweep. The one case that still degenerates
// (a single hatch/fill family piling hundreds of parallel strokes into one
// bucket) is capped per-bucket (PAIR_RELATIONS_MAX_BUCKET) rather than
// exhaustively paired — that many "X is parallel to Y" facts among one
// hatch's own strokes is noise this codebase's existing hatch classifier
// (classifyHatchSegs, oneclick.ts's own header comment) already owns, not
// a fact a symbol-grounding consumer needs restated per-pair.

/** "Near-parallel": two segments whose orientations differ by at most this
 *  many degrees. Also the bucket width, so a bucket's own tolerance and its
 *  neighbor-search radius always agree. */
export const PARALLEL_ANGLE_TOL_DEG = 2;
/** "Near-perpendicular": two segments whose orientations differ from a
 *  clean 90° by at most this many degrees. */
export const PERPENDICULAR_ANGLE_TOL_DEG = 2;
/** Collinear = parallel AND on the same infinite line: the perpendicular
 *  distance from one segment's own start point to the other's line, in
 *  image px, within this tolerance. Same grain as JUNCTION_SNAP_TOL — a
 *  real "continues the same wall" case never lands sub-pixel-exact. */
export const COLLINEAR_OFFSET_TOL = 0.75;
/** Same disclosed-cap ethos as RELATIONS_MAX_PRIMITIVES: overall input
 *  size bound for this pass. */
export const PAIR_RELATIONS_MAX_PRIMITIVES = 20_000;
/** Per-orientation-bucket cap. A bucket beyond this size is almost always
 *  one hatch/fill family's own many parallel strokes, not a set of facts
 *  worth reporting pairwise — see the module-level comment above. */
export const PAIR_RELATIONS_MAX_BUCKET = 250;

const ANGLE_BUCKET_DEG = PARALLEL_ANGLE_TOL_DEG;
const NUM_BUCKETS = Math.round(180 / ANGLE_BUCKET_DEG);
const PERP_BUCKET_SPAN = Math.round(90 / ANGLE_BUCKET_DEG);

export interface PairRelation { aId: number; bId: number; angleDeg: number; }
export interface CollinearPair extends PairRelation { offset: number; }

export interface PairRelationsResult {
  parallelPairs: PairRelation[];
  perpendicularPairs: PairRelation[];
  collinearPairs: CollinearPair[];
  incomplete: boolean;
  incompleteReason: string | null;
}

function orientationDeg(dx: number, dy: number): number {
  // mod 180, not 360: an undirected line and its reverse direction are the
  // same orientation. A zero-length segment has none — callers skip it
  // before this is reached.
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return ((deg % 180) + 180) % 180;
}

function orientationDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 180;
  return d > 90 ? 180 - d : d;
}

function bucketOf(orientation: number): number {
  return Math.floor(orientation / ANGLE_BUCKET_DEG) % NUM_BUCKETS;
}

interface OrientedEntry { id: number; x0: number; y0: number; ux: number; uy: number; orientation: number; }

/** Pairwise collinearity/near-parallel/near-perpendicular relations among
 *  a built VectorSceneIndex's own primitives. Like
 *  computeVectorSceneJunctions, this is a standalone pure function, NOT
 *  wired into buildVectorSceneIndex's own `intersections` stub yet — see
 *  PROGRESS.md for the same "prove the contract before wiring it in"
 *  reasoning. Clip-only primitives (invisible ink) are excluded, matching
 *  computeVectorSceneJunctions. */
export function computeVectorScenePairRelations(
  idx: VectorSceneIndex,
  opts: {
    maxPrimitives?: number; maxBucket?: number;
    parallelTolDeg?: number; perpendicularTolDeg?: number; collinearOffsetTol?: number;
  } = {},
): PairRelationsResult {
  const capN = opts.maxPrimitives ?? PAIR_RELATIONS_MAX_PRIMITIVES;
  const capBucket = opts.maxBucket ?? PAIR_RELATIONS_MAX_BUCKET;
  const parallelTol = opts.parallelTolDeg ?? PARALLEL_ANGLE_TOL_DEG;
  const perpTol = opts.perpendicularTolDeg ?? PERPENDICULAR_ANGLE_TOL_DEG;
  const collinearTol = opts.collinearOffsetTol ?? COLLINEAR_OFFSET_TOL;

  const n = idx.primitives.length;
  if (n > capN) {
    return {
      parallelPairs: [], perpendicularPairs: [], collinearPairs: [],
      incomplete: true,
      incompleteReason: `primitive count ${n} exceeds the ${capN}-primitive pair-relations cap; no pairs were computed`,
    };
  }

  const buckets: OrientedEntry[][] = Array.from({ length: NUM_BUCKETS }, () => []);
  for (const p of idx.primitives) {
    if (p.clip) continue;
    const dx = p.x1 - p.x0, dy = p.y1 - p.y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;   // degenerate segment, no orientation to compare
    const orientation = orientationDeg(dx, dy);
    buckets[bucketOf(orientation)].push({ id: p.id, x0: p.x0, y0: p.y0, ux: dx / len, uy: dy / len, orientation });
  }

  const skippedBuckets = new Set<number>();
  const parallelPairs: PairRelation[] = [];
  const collinearPairs: CollinearPair[] = [];
  const seenParallel = new Set<string>();
  const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

  for (let bi = 0; bi < NUM_BUCKETS; bi++) {
    const own = buckets[bi];
    if (own.length === 0) continue;
    const group: OrientedEntry[] = [];
    for (let d = -1; d <= 1; d++) group.push(...buckets[(bi + d + NUM_BUCKETS) % NUM_BUCKETS]);
    if (group.length > capBucket) { skippedBuckets.add(bi); continue; }
    for (const a of own) {
      for (const b of group) {
        if (a.id === b.id) continue;
        const key = pairKey(a.id, b.id);
        if (seenParallel.has(key)) continue;
        const diff = orientationDiffDeg(a.orientation, b.orientation);
        if (diff > parallelTol) continue;
        seenParallel.add(key);
        const lo = Math.min(a.id, b.id), hi = Math.max(a.id, b.id);
        parallelPairs.push({ aId: lo, bId: hi, angleDeg: diff });
        const nx = -a.uy, ny = a.ux;   // A's own normal
        const offset = (b.x0 - a.x0) * nx + (b.y0 - a.y0) * ny;
        if (Math.abs(offset) <= collinearTol) collinearPairs.push({ aId: lo, bId: hi, angleDeg: diff, offset });
      }
    }
  }

  const perpendicularPairs: PairRelation[] = [];
  const seenPerp = new Set<string>();
  for (let bi = 0; bi < NUM_BUCKETS; bi++) {
    const own = buckets[bi];
    if (own.length === 0) continue;
    const group: OrientedEntry[] = [];
    for (let d = -1; d <= 1; d++) group.push(...buckets[(bi + PERP_BUCKET_SPAN + d + NUM_BUCKETS) % NUM_BUCKETS]);
    if (own.length > capBucket || group.length > capBucket) { skippedBuckets.add(bi); continue; }
    for (const a of own) {
      for (const b of group) {
        const key = pairKey(a.id, b.id);
        if (seenPerp.has(key)) continue;
        const diff = orientationDiffDeg(a.orientation, b.orientation);
        if (Math.abs(diff - 90) > perpTol) continue;
        seenPerp.add(key);
        perpendicularPairs.push({ aId: Math.min(a.id, b.id), bId: Math.max(a.id, b.id), angleDeg: diff });
      }
    }
  }

  return {
    parallelPairs, perpendicularPairs, collinearPairs,
    incomplete: skippedBuckets.size > 0,
    incompleteReason: skippedBuckets.size > 0
      ? `${skippedBuckets.size} orientation bucket(s) exceeded the ${capBucket}-primitive pair cap (likely a dense hatch/fill family) and were skipped, not exhaustively paired`
      : null,
  };
}
