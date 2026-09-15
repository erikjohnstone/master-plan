// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 2 §7 — the first concrete
// piece of "intersections, T-junctions, X-junctions, endpoints,
// collinearity, near-parallel and near-perpendicular relations": endpoint
// clustering and junction-degree classification. A pure, additive consumer
// of a built VectorSceneIndex — it never mutates the index and is NOT yet
// wired into `buildVectorSceneIndex`'s own `intersections` field (that
// field stays an empty stub — see vectorSceneIndex.ts's own
// `notYetImplemented` — until this contract has proven out on real sheets,
// per the same "prove the contract before wiring it in" discipline slice 5
// used for the cache). Collinearity/parallel/perpendicular PAIR relations
// (as opposed to endpoint junctions) are a separate further slice.
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
