// Local run graph — Stage 3 of the trace engine (WP3.3,
// opentakeoff-corpus/goals/LINEAR_TAKEOFF.md, plan §6.3). Pure: no React,
// no DOM, no pdf.js. Answers ONE question at a time — "what does the node
// at this point look like" — for the walker (WP3.4) to consume one
// frontier at a time as it advances.
//
// Deliberately NOT `arrangement.ts`. That module builds the WHOLE sheet's
// planar subdivision up front (global weld → global split-at-every-
// crossing → half-edge faces) — exactly the "global noding" the goal doc
// rules out for this path ("NO global noding. NO JTS on this path"). A
// trace only ever needs to know what ONE node looks like, the instant the
// walk arrives there — welding here is LOCAL (only the candidates
// `index.ts`'s `endpointsNear`/`segmentsInBox` return near this one point)
// and LAZY (nothing is materialized until `frontier()` is actually
// called). `arrangement.ts`'s own `WELD_TOL` constant is reused as this
// module's tolerance FLOOR (both modules are welding real CAD corner
// float-drift, so there is no reason for the two floors to disagree); this
// module's own `weldTolerancePx` scales it up for finer sheets, which
// `arrangement.ts`'s single fixed constant never needed to do.
import { orient2d } from "robust-predicates";
import { WELD_TOL } from "../arrangement.ts";
import { endpointsNear, segmentsInBox, type SegmentIndex } from "./index.ts";

/** Plan §6.3's own weld tolerance, τ = max(0.75 px, 0.02 ft × ppf) —
 *  `arrangement.ts`'s WELD_TOL is the floor; `ppf` (px per foot, this
 *  codebase's own `ftPx`/`mppf`) scales it up on a fine-scale sheet, where
 *  0.75 raw px would under-weld a corner that's visually one point. */
export function weldTolerancePx(ppf: number): number {
  return Math.max(WELD_TOL, 0.02 * (ppf || 0));
}

export type NodeType = "end" | "collinear" | "elbow" | "tee" | "crossing" | "ambiguous";
export type AngleClass = "45" | "90" | "custom";

/** One welded-end candidate at a frontier node — plan §6.3's
 *  "continuation map," angle-sorted so "continue straightest" is a
 *  nearest-neighbor lookup in this array, not a re-scan. */
export interface Continuation {
  seg: number;
  end: 0 | 1;
  /** direction AWAY from the node, along this segment, degrees [0, 360). */
  angleDeg: number;
}

/** One segment passing through this node's interior without an endpoint
 *  here — plan §6.3's "crossing segments (interior intersections within
 *  τ)." `angleDeg` is one of its two directions; the other is
 *  `(angleDeg + 180) % 360` by construction (a straight segment has
 *  exactly one line through any interior point). */
export interface CrossingHit {
  seg: number;
  angleDeg: number;
}

export interface FrontierNode {
  x: number; y: number;
  type: NodeType;
  incident: Continuation[];
  crossing: CrossingHit[];
  /** present only when `type === "elbow"`. */
  elbow?: { turnDeg: number; angleClass: AngleClass };
  /** present only when `type === "tee"` — indices into `incident`. */
  tee?: { mainA: number; mainB: number; branch: number };
}

const COLLINEAR_TOL_DEG = 8;     // plan §6.3: "deviation < 8°" for a collinear join
const ELBOW_MIN_DEG = 30, ELBOW_MAX_DEG = 150;   // plan §6.3: elbow candidate band
const ANGLE_BIN_TOL_DEG = 6;     // plan §6.3: "binned to 45/90 with ±6° tolerance"

function angleOf(x1: number, y1: number, x2: number, y2: number): number {
  let a = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  if (a < 0) a += 360;
  return a;
}

/** Angular difference between two directions, folded to [0, 180] — the
 *  domain convention `linear/run.ts`'s own turn-angle already uses (0 =
 *  straight, 180 = a full reversal), reused here for the identical reason. */
function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** How far a pair of directions deviates from a perfectly straight
 *  pass-through (opposite, 180° apart): 0 = dead straight, 180 = the two
 *  directions coincide (a hairpin). */
function deviationFromStraight(a: number, b: number): number {
  return 180 - angleDiff(a, b);
}

function angleClassOf(turnDeg: number): AngleClass {
  if (Math.abs(turnDeg - 45) <= ANGLE_BIN_TOL_DEG) return "45";
  if (Math.abs(turnDeg - 90) <= ANGLE_BIN_TOL_DEG) return "90";
  return "custom";
}

/** Exact (robust-predicates) point-on-segment-interior test: does `(x,y)`
 *  sit within `tau` of segment `(x1,y1)-(x2,y2)`'s own interior span (not
 *  merely near the LINE it extends to, and not near either of its
 *  endpoints — an endpoint there is a welded incident, not a crossing)?
 *  `orient2d` gives the EXACT perpendicular side/distance sign — plain
 *  floating-point cross products (this codebase's own `segsIntersect` in
 *  geometry.js, for one) can flip sign from catastrophic cancellation
 *  exactly at the near-zero distances this test lives at, which is the
 *  goal doc's own stated reason to use it here specifically. */
function pointOnSegmentInterior(x: number, y: number, x1: number, y1: number, x2: number, y2: number, tau: number): { t: number; dist: number } | null {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  const t = ((x - x1) * dx + (y - y1) * dy) / (len * len);
  if (t <= tau / len || t >= 1 - tau / len) return null;   // too close to an actual endpoint — that's a weld, not a crossing
  // orient2d's magnitude is twice the signed triangle area (x1,y1)-(x2,y2)-(x,y);
  // dividing by the segment's own length recovers the exact perpendicular
  // distance with the same numerical robustness orient2d's sign carries.
  const dist = Math.abs(orient2d(x1, y1, x2, y2, x, y)) / len;
  if (dist > tau) return null;
  return { t, dist };
}

/** Plan §6.3's own frontier procedure: gather welded-end candidates
 *  (`endpointsNear`) and interior-crossing candidates (a nearby box query,
 *  filtered to segments the endpoint query didn't already claim, tested
 *  exactly via `pointOnSegmentInterior`), then classify. `filterFn` is the
 *  walker's own same-family-continuity gate (plan §6.4) — passed straight
 *  through to both underlying queries, never applied as a post-filter (a
 *  family-mismatched segment must not occupy one of a small result set's
 *  slots, same reasoning `index.ts`'s own `filterFn` already documents). */
export function frontier(index: SegmentIndex, x: number, y: number, ppf: number, filterFn?: (seg: number) => boolean): FrontierNode {
  const tau = weldTolerancePx(ppf);
  const welded = endpointsNear(index, x, y, tau, filterFn);
  const weldedSegs = new Set(welded.map((w) => w.seg));

  const incident: Continuation[] = welded.map(({ seg, end }) => {
    const otherEnd = end === 0 ? 1 : 0;
    const ox = index.segs[seg * 4 + otherEnd * 2], oy = index.segs[seg * 4 + otherEnd * 2 + 1];
    return { seg, end, angleDeg: angleOf(x, y, ox, oy) };
  }).sort((a, b) => a.angleDeg - b.angleDeg);

  const boxCandidates = segmentsInBox(index, x - tau, y - tau, x + tau, y + tau, filterFn)
    .filter((seg) => !weldedSegs.has(seg));
  const crossing: CrossingHit[] = [];
  for (const seg of boxCandidates) {
    const x1 = index.segs[seg * 4], y1 = index.segs[seg * 4 + 1], x2 = index.segs[seg * 4 + 2], y2 = index.segs[seg * 4 + 3];
    if (pointOnSegmentInterior(x, y, x1, y1, x2, y2, tau)) crossing.push({ seg, angleDeg: angleOf(x1, y1, x2, y2) });
  }

  const node: FrontierNode = { x, y, type: "ambiguous", incident, crossing };

  // plan §6.3's own decision tree, literally:
  if (crossing.length === 1 && incident.length === 2 && deviationFromStraight(incident[0].angleDeg, incident[1].angleDeg) < COLLINEAR_TOL_DEG) {
    node.type = "crossing";
  } else if (crossing.length === 0) {
    if (incident.length === 1) {
      node.type = "end";
    } else if (incident.length === 2) {
      const dev = deviationFromStraight(incident[0].angleDeg, incident[1].angleDeg);
      if (dev < COLLINEAR_TOL_DEG) node.type = "collinear";
      else if (dev >= ELBOW_MIN_DEG && dev <= ELBOW_MAX_DEG) { node.type = "elbow"; node.elbow = { turnDeg: dev, angleClass: angleClassOf(dev) }; }
    } else if (incident.length === 3) {
      // exactly one of the three pairs must be near-collinear (the
      // through-pair, the "main"); the remaining segment is the branch.
      const pairs: [number, number, number][] = [[0, 1, 2], [0, 2, 1], [1, 2, 0]];
      const throughPairs = pairs.filter(([a, b]) => deviationFromStraight(incident[a].angleDeg, incident[b].angleDeg) < COLLINEAR_TOL_DEG);
      if (throughPairs.length === 1) { node.type = "tee"; node.tee = { mainA: throughPairs[0][0], mainB: throughPairs[0][1], branch: throughPairs[0][2] }; }
    } else if (incident.length === 4) {
      // a pure 4-way endpoint junction (no segment merely PASSES through —
      // all four ends genuinely land here) still reads as a crossing when
      // it resolves into two disjoint collinear pairs, per plan §6.3.
      const usedIdx = new Set<number>();
      let pairCount = 0;
      for (let a = 0; a < 4 && pairCount < 2; a++) {
        if (usedIdx.has(a)) continue;
        for (let b = a + 1; b < 4; b++) {
          if (usedIdx.has(b)) continue;
          if (deviationFromStraight(incident[a].angleDeg, incident[b].angleDeg) < COLLINEAR_TOL_DEG) { usedIdx.add(a); usedIdx.add(b); pairCount++; break; }
        }
      }
      if (pairCount === 2) node.type = "crossing";
    }
  }

  return node;
}
