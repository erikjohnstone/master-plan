// The bidirectional walker — Stage 3's final piece (WP3.4,
// opentakeoff-corpus/goals/LINEAR_TAKEOFF.md, plan §6.4). Pure: no React,
// no DOM, no pdf.js. Consumes `graph.ts`'s `frontier()` (WP3.3) one
// frontier at a time, exactly the way the throwaway probe
// (plans/03-research/probes/trace-proto.mts) walked a chain, hardened per
// the plan's own pseudocode: same-family continuity, named stop reasons,
// hop/length caps.
//
// This module reuses WP1's own `RunVertexKind` (`types.ts`) rather than
// inventing a parallel vertex-kind vocabulary — `elbow`/`tee`/`crossing`/
// `size_change`/`riser`/`equipment`/`symbol_gap` were ALL already present
// in that type before this file existed (WP1 never produces them itself —
// only an explicit `vertex_overrides` entry could — but the type clearly
// anticipated a real trace producing them). `WalkStopReason` is its own
// type: five of its eight reasons (`dead_end`, `sheet_edge`,
// `branch_joins_main`, `ambiguous`, `family_change`, `cap`) describe why
// the WALK stopped, not what a vertex IS, and have no `RunVertexKind`
// analog at all.
//
// Two real, honest gaps this checkpoint does NOT close, both documented
// rather than faked:
//   - `equipment`/`riser` stop-reason detection needs a symbol/equipment
//     recognition signal at the dead-end point (an equipment tag, an
//     up/down riser glyph) that no existing module surfaces in a directly
//     queryable form yet. Every "end" this walker reaches that isn't
//     within `sheetEdgeTolPx` of the page bounds reports `dead_end` — the
//     honest, conservative default plan §6.2's own refusal doctrine calls
//     for, not a guessed equipment/riser label.
//   - Curved (`SEG_CURVE`) segment chains are NOT collapsed to one arc
//     vertex with a fitted radius yet (plan §6.4's own "reuse
//     markPolylineArcs' circle fit"). A walk that reaches a curve chord
//     currently treats it like any other candidate segment (each chord
//     its own hop, no `angleDeg`-based node typing since a curve chord's
//     own two directions rarely land in a clean elbow/collinear band) —
//     real behavior, not a crash, but not the single fitted-radius vertex
//     the plan calls for. Flagged as follow-up, not silently skipped.
//
// Dash-gap continuation (added post-WP3.8, GATE 3 eval finding #2,
// docs/LINEAR-TRACE-EVAL.md): a dash-dot line is drawn as many short,
// individually-disconnected strokes — real corpus measurement (Bessemer
// P101's own "CW" main) found ~9-26px dashes with ~9px gaps between them,
// at a scale where 1 ft = 36px. Ungapped, `dead_end` fires after the
// first dash every time, which is why this was GATE 3's single biggest
// recall miss. This is NOT the same mechanism as `mepconnectivity.ts`'s
// own `bridgeDanglingGaps` — checked directly before building this: that
// function requires a fitting/equipment symbol sitting IN the gap ("never
// bridged on proximity alone") and would not fire on a plain dash gap
// with no symbol in it even if wired in.
//
// The trigger is segment LENGTH, not the per-segment `dash` flag —
// checked directly against the real P101 case before assuming otherwise:
// its "CW" main's own dash marks each read `dash: 0`. The PDF does not
// use a native dash-array stroke at all; a CAD export flattened the
// dash-dot linetype into many separate SOLID short strokes, which is
// indistinguishable from a real dash pattern by the `dash` flag alone.
// `bridgeDashGap` below is walk.ts-native and narrow on purpose: it only
// triggers when the dead-ending segment is itself short (real drawn
// duct/pipe RUNS between meaningful features are rarely sub-foot; an
// isolated short stroke that dead-ends is either a print-artifact
// fragment or genuinely nothing to bridge to), when NOTHING else (any
// family) welds at the dead end either (so a real fitting/junction there
// still reports its own honest reason first), only bridges to a segment
// sharing the exact `sameFamilyContinuity` this walker already requires
// for every other hop, and only within `DASH_BRIDGE_FT` — small enough
// that a genuine physical break (a valve gap, a stub that really does
// dead-end) stays a `dead_end`, not silently swallowed.
import type { RunVertexKind } from "./types.ts";
import { frontier, type Continuation, type FrontierNode } from "./graph.ts";
import { endpointsNear, type SegmentIndex } from "./index.ts";

/** Same formula as graph.ts's own private helper — folded angular
 *  difference [0,180], reused here to find which incident continues
 *  straight through a crossing. Duplicated rather than imported: both are
 *  tiny, stable, and this codebase's own convention for small geometric
 *  primitives (`index.ts`'s `projectToSeg` mirrors `geometry.js`'s
 *  `distToSeg` the same way) is to copy them, not thread a shared export
 *  through modules that otherwise have no reason to depend on each other's
 *  internals. */
function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
function deviationFromStraight(a: number, b: number): number {
  return 180 - angleDiff(a, b);
}

export type WalkStopReason = "dead_end" | "equipment" | "sheet_edge" | "riser" | "branch_joins_main" | "ambiguous" | "family_change" | "cap";

export interface WalkVertex {
  kind: Extract<RunVertexKind, "elbow" | "tee" | "crossing">;
  x: number; y: number;
  turnDeg?: number;              // elbow only
  angleClass?: "45" | "90" | "custom";   // elbow only
  branchSeg?: number;            // tee only — the segment index NOT taken
}

export interface WalkStop {
  reason: WalkStopReason;
  x: number; y: number;
  /** present only for `ambiguous` — the fan of candidates a UI would offer
   *  as continuations, per plan §6.3's own "offer them as continuations." */
  candidates?: Continuation[];
}

export interface WalkResult {
  /** the walked polyline, in travel order, including both segment ends. */
  points: [number, number][];
  /** total walked length in the caller's own coordinate units (chord
   *  length only — see this file's header on curve chains). */
  length: number;
  vertices: WalkVertex[];
  stop: WalkStop;
  hops: number;
  /** original segment indices, one per hop, in travel order — `segs[0]` is
   *  always the seed. WP3.6's own trace receipt (plan §6.8: "the segment
   *  indices walked") needs this; nothing in WP3.4 itself consumed it, so
   *  it did not exist until that checkpoint needed it. */
  segs: number[];
  /** count of print-style dash gaps this walk jumped (see this file's
   *  header) — 0 for a solid line, or any walk that never needed one. */
  dashBridges: number;
}

export interface WalkOptions {
  maxHops?: number;
  maxLengthPx?: number;
  /** image px — an "end" within this distance of `pageBounds` reports
   *  `sheet_edge` instead of `dead_end`. */
  sheetEdgeTolPx?: number;
  pageBounds?: { minX: number; minY: number; maxX: number; maxY: number };
}

const DEFAULT_MAX_HOPS = 2000;         // trace-proto.mts's own loop ceiling
const DEFAULT_MAX_LENGTH_PX = 1e7;     // effectively unbounded unless the caller states a real sheet-scaled cap
const DEFAULT_SHEET_EDGE_TOL_PX = 3;

function segLength(index: SegmentIndex, seg: number): number {
  const dx = index.segs[seg * 4 + 2] - index.segs[seg * 4], dy = index.segs[seg * 4 + 3] - index.segs[seg * 4 + 1];
  return Math.hypot(dx, dy);
}

function pointOf(index: SegmentIndex, seg: number, end: 0 | 1): [number, number] {
  return [index.segs[seg * 4 + end * 2], index.segs[seg * 4 + end * 2 + 1]];
}

/** plan §6.4's own family-continuity rule: "pen ± 1 nibble, same dash
 *  code, same layer when layered." Reads pen/dash straight off `meta`/
 *  `dash` (the same per-segment arrays `strokes.ts` already reads them
 *  from) rather than needing the caller to resolve a `StrokeFamily`
 *  record for every hop — a family object only tells you the CURRENT
 *  segment's own group, not a neighbor's, until it's looked up too. */
function sameFamilyContinuity(index: SegmentIndex, dash: Uint8Array | null | undefined, layerOf: Int32Array | null | undefined, fromSeg: number, toSeg: number): boolean {
  const penFrom = index.meta[fromSeg] >> 4, penTo = index.meta[toSeg] >> 4;
  if (Math.abs(penFrom - penTo) > 1) return false;
  const dashFrom = dash?.[fromSeg] ?? 0, dashTo = dash?.[toSeg] ?? 0;
  if (dashFrom !== dashTo) return false;
  if (layerOf && layerOf.length) {
    const lFrom = layerOf[fromSeg] ?? -1, lTo = layerOf[toSeg] ?? -1;
    if (lFrom >= 0 && lTo >= 0 && lFrom !== lTo) return false;
  }
  return true;
}

function isNearBounds(x: number, y: number, bounds: WalkOptions["pageBounds"], tol: number): boolean {
  if (!bounds) return false;
  return x <= bounds.minX + tol || x >= bounds.maxX - tol || y <= bounds.minY + tol || y >= bounds.maxY - tol;
}

/** Widest gap (feet) a dash-gap bridge may jump — see this file's header.
 *  0.5 ft comfortably clears the one real measured case (~0.24 ft) with
 *  headroom for a coarser dash pattern elsewhere, while staying far below
 *  `mepconnectivity.ts`'s own 2 ft fitting-verified bridge (a deliberately
 *  smaller number: nothing here confirms a symbol sits in the gap, only
 *  that it's small enough to be print artifact rather than a real break). */
const DASH_BRIDGE_FT = 0.5;
const DASH_BRIDGE_ANGLE_TOL_DEG = 10;   // a shade looser than the 8° collinear-join band (real dash drift, not a junction)
// Widest a dead-ending segment may be and still be treated as a candidate
// dash mark rather than a real run — see this file's header on why LENGTH,
// not the `dash` flag, is the trigger. 1 ft comfortably clears the longest
// real dash measured (~26px = 0.72ft at the P101 scale) with headroom,
// while a real supply/return trunk segment between two labeled features
// is essentially never this short.
const DASH_LIKE_MAX_FT = 1;

function angleOf(x1: number, y1: number, x2: number, y2: number): number {
  let a = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  if (a < 0) a += 360;
  return a;
}

/** Attempt to jump a print-style dash gap at a dead end: find the nearest
 *  same-family segment with an endpoint within `DASH_BRIDGE_FT` of (x, y)
 *  whose approach direction AND own onward direction both continue
 *  roughly straight through — not just "something family-matched is
 *  nearby," which would just as happily bridge a parallel run a dash
 *  pitch away. `travelDeg` is the direction the walk is heading (away
 *  from the point it just arrived from, i.e. the opposite of a
 *  `Continuation.angleDeg`, which points back the way we came). Returns
 *  null on no qualifying candidate (the normal case for a solid line, or
 *  a real dead end past the last dash). */
function bridgeDashGap(
  index: SegmentIndex, dash: Uint8Array | null | undefined, layerOf: Int32Array | null | undefined,
  curSeg: number, x: number, y: number, travelDeg: number, ppf: number,
): { seg: number; end: 0 | 1; gapDist: number } | null {
  const r = DASH_BRIDGE_FT * (ppf || 0);
  if (!(r > 0)) return null;
  const candidates = endpointsNear(index, x, y, r, (seg) => seg !== curSeg && sameFamilyContinuity(index, dash, layerOf, curSeg, seg));
  let best: { seg: number; end: 0 | 1; gapDist: number } | null = null;
  for (const { seg, end } of candidates) {
    const [nx, ny] = pointOf(index, seg, end);
    const gapDist = Math.hypot(nx - x, ny - y);
    if (gapDist < 1e-9) continue;   // touching, not a gap — frontier() would already have welded this
    const jumpDeg = angleOf(x, y, nx, ny);
    if (angleDiff(travelDeg, jumpDeg) > DASH_BRIDGE_ANGLE_TOL_DEG) continue;
    const [fx, fy] = pointOf(index, seg, end === 0 ? 1 : 0);
    const ownDeg = angleOf(nx, ny, fx, fy);
    if (angleDiff(travelDeg, ownDeg) > DASH_BRIDGE_ANGLE_TOL_DEG) continue;
    if (!best || gapDist < best.gapDist) best = { seg, end, gapDist };
  }
  return best;
}

/** Walk from `seedSeg`, starting at whichever of its own two ends is
 *  `atEnd`, heading away from the segment (i.e., the chain begins with
 *  `seedSeg`'s OTHER end, then `seedSeg`'s `atEnd` point, then continues
 *  outward) — the probe's own `follow(k0, fromEnd)` convention exactly.
 *  ONE direction only; `walkBothDirections` below is the estimator-facing
 *  entry point that combines both. */
export function walkOneDirection(
  index: SegmentIndex, seedSeg: number, atEnd: 0 | 1, ppf: number,
  ctx: { dash?: Uint8Array | null; layerOf?: Int32Array | null },
  opts: WalkOptions = {},
): WalkResult {
  const maxHops = opts.maxHops ?? DEFAULT_MAX_HOPS;
  const maxLengthPx = opts.maxLengthPx ?? DEFAULT_MAX_LENGTH_PX;
  const sheetEdgeTolPx = opts.sheetEdgeTolPx ?? DEFAULT_SHEET_EDGE_TOL_PX;

  const otherEnd = pointOf(index, seedSeg, atEnd === 0 ? 1 : 0);
  const startEnd = pointOf(index, seedSeg, atEnd);
  const points: [number, number][] = [otherEnd, startEnd];
  const vertices: WalkVertex[] = [];
  const segs: number[] = [seedSeg];
  let length = segLength(index, seedSeg);
  let hops = 1;
  let curSeg = seedSeg;
  let [x, y] = startEnd;
  let dashBridges = 0;

  while (true) {
    if (hops >= maxHops || length >= maxLengthPx) return { points, length, vertices, segs, dashBridges, stop: { reason: "cap", x, y }, hops };

    // Node typing is restricted to curSeg's own family — validated against
    // real extraction (Bessemer M101 p6), NOT assumed from the plan text
    // alone: an earlier version ran `frontier()` unfiltered (plan §6.3's
    // own decision tree never mentions family, so that reading seemed
    // textually defensible), and it was measurably wrong. A real sheet's
    // candidate segments include every trace-eligible family at once —
    // duct at one pen, piping or a second duct system at another, whatever
    // else `strokes.ts` didn't exclude — and near any real junction,
    // several of them share a footprint. Unfiltered, degree balloons past
    // what the SAME duct run actually presents, and short real walks
    // (Bessemer's own 12"x6" label, plan's own cited ground truth: 18.2 ft
    // over 5 hops) hit a spurious "ambiguous" after 1-2 hops instead — the
    // exact failure mode `trace-proto.mts`'s own pen-restricted candidate
    // pool (`if ((m>>4) !== PEN) continue`) was built to avoid. Filtering
    // HERE, not just on the chosen continuation, is what actually
    // reproduces the probe's own validated hop counts.
    const familyFilter = (candidate: number) => sameFamilyContinuity(index, ctx.dash, ctx.layerOf, curSeg, candidate);
    const node: FrontierNode = frontier(index, x, y, ppf, familyFilter);
    const mine = node.incident.find((c) => c.seg === curSeg);
    const others = node.incident.filter((c) => c.seg !== curSeg);

    if (node.type === "end") {
      // Filtered to degree 1 — but is that because nothing else is here at
      // all, or because something IS here and it just isn't our family?
      // One extra, UNFILTERED frontier() call at the terminal step only
      // (never on every hop) answers that distinction plan §6.4's own
      // family_change reason exists to preserve.
      const unfiltered = frontier(index, x, y, ppf);
      // Nothing welds here at all (not even a different family) and the
      // segment we're dead-ending from is short (dash-mark-sized, real
      // `dash` flag or not — see this file's header) — a print-style dash
      // gap is a real candidate BEFORE settling for dead_end. A
      // family_change point (something else genuinely touches here) is
      // never overridden by a bridge attempt: that reason is itself real,
      // useful signal.
      const dashLike = !!ctx.dash?.[curSeg] || segLength(index, curSeg) <= DASH_LIKE_MAX_FT * (ppf || 0);
      if (unfiltered.incident.length <= 1 && dashLike) {
        const travelDeg = ((mine?.angleDeg ?? 0) + 180) % 360;
        const bridge = bridgeDashGap(index, ctx.dash, ctx.layerOf, curSeg, x, y, travelDeg, ppf);
        if (bridge) {
          const [nx, ny] = pointOf(index, bridge.seg, bridge.end);
          const [fx, fy] = pointOf(index, bridge.seg, bridge.end === 0 ? 1 : 0);
          points.push([nx, ny], [fx, fy]);
          length += bridge.gapDist + segLength(index, bridge.seg);
          segs.push(bridge.seg);
          dashBridges++;
          hops++;
          curSeg = bridge.seg;
          x = fx; y = fy;
          continue;
        }
      }
      const reason: WalkStopReason = unfiltered.incident.length > 1
        ? "family_change"
        : isNearBounds(x, y, opts.pageBounds, sheetEdgeTolPx) ? "sheet_edge" : "dead_end";
      return { points, length, vertices, segs, dashBridges, stop: { reason, x, y }, hops };
    }
    if (node.type === "ambiguous") {
      return { points, length, vertices, segs, dashBridges, stop: { reason: "ambiguous", x, y, candidates: others }, hops };
    }

    let next: Continuation | undefined;
    if (node.type === "collinear") {
      next = others[0];
    } else if (node.type === "elbow") {
      next = others[0];
      vertices.push({ kind: "elbow", x, y, turnDeg: node.elbow!.turnDeg, angleClass: node.elbow!.angleClass });
    } else if (node.type === "tee") {
      const { mainA, mainB, branch } = node.tee!;
      const mainAIdx = node.incident[mainA], mainBIdx = node.incident[mainB], branchIdx = node.incident[branch];
      if (mine && branchIdx.seg === mine.seg) {
        // arrived via the branch — the main run is its own trace; stop here.
        return { points, length, vertices, segs, dashBridges, stop: { reason: "branch_joins_main", x, y }, hops };
      }
      next = mine && mainAIdx.seg === mine.seg ? mainBIdx : mainAIdx;
      vertices.push({ kind: "tee", x, y, branchSeg: branchIdx.seg });
    } else if (node.type === "crossing") {
      // continue on whichever incident is collinear with the segment we
      // arrived on (our own straight-through pair) — the crossing segment
      // itself (in `node.crossing`, or the other collinear pair among 4
      // incidents) is never a continuation candidate.
      next = others.find((c) => deviationFromStraight(mine?.angleDeg ?? 0, c.angleDeg) < 8) ?? others[0];
      vertices.push({ kind: "crossing", x, y });
    }

    if (!next) return { points, length, vertices, segs, dashBridges, stop: { reason: "dead_end", x, y }, hops };
    if (!sameFamilyContinuity(index, ctx.dash, ctx.layerOf, curSeg, next.seg)) {
      return { points, length, vertices, segs, dashBridges, stop: { reason: "family_change", x, y }, hops };
    }

    curSeg = next.seg;
    segs.push(next.seg);
    const [nx, ny] = pointOf(index, next.seg, next.end === 0 ? 1 : 0);
    points.push([nx, ny]);
    length += segLength(index, next.seg);
    hops++;
    x = nx; y = ny;
  }
}

/** The estimator-facing entry point (plan §6.4: "Walk from the seed in
 *  both directions"): combines `walkOneDirection` run from each of the
 *  seed segment's two ends into one continuous chain, the seed segment's
 *  own length counted exactly once. */
export function walkBothDirections(
  index: SegmentIndex, seedSeg: number, ppf: number,
  ctx: { dash?: Uint8Array | null; layerOf?: Int32Array | null },
  opts: WalkOptions = {},
): { points: [number, number][]; length: number; vertices: WalkVertex[]; segs: number[]; stops: { forward: WalkStop; backward: WalkStop }; hops: number; dashBridges: number } {
  const fwd = walkOneDirection(index, seedSeg, 1, ppf, ctx, opts);
  const back = walkOneDirection(index, seedSeg, 0, ppf, ctx, opts);
  const points = [...back.points.slice().reverse(), ...fwd.points.slice(2)];
  const vertices = [...back.vertices.slice().reverse(), ...fwd.vertices];
  // back.segs and fwd.segs both start with the SAME seedSeg (each direction
  // walks outward from it) — reverse back's own list (which puts seedSeg
  // last), drop that trailing duplicate, then append fwd's own list (which
  // still starts with it) so the seed appears exactly once, in its correct
  // middle position.
  const segs = [...back.segs.slice().reverse().slice(0, -1), ...fwd.segs];
  return {
    points, vertices, segs,
    length: fwd.length + back.length - segLength(index, seedSeg),
    stops: { forward: fwd.stop, backward: back.stop },
    hops: fwd.hops + back.hops,
    dashBridges: fwd.dashBridges + back.dashBridges,
  };
}
