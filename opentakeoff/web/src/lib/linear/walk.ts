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
import type { RunVertexKind } from "./types.ts";
import { frontier, type Continuation, type FrontierNode } from "./graph.ts";
import type { SegmentIndex } from "./index.ts";

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
  let length = segLength(index, seedSeg);
  let hops = 1;
  let curSeg = seedSeg;
  let [x, y] = startEnd;

  while (true) {
    if (hops >= maxHops || length >= maxLengthPx) return { points, length, vertices, stop: { reason: "cap", x, y }, hops };

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
      const reason: WalkStopReason = unfiltered.incident.length > 1
        ? "family_change"
        : isNearBounds(x, y, opts.pageBounds, sheetEdgeTolPx) ? "sheet_edge" : "dead_end";
      return { points, length, vertices, stop: { reason, x, y }, hops };
    }
    if (node.type === "ambiguous") {
      return { points, length, vertices, stop: { reason: "ambiguous", x, y, candidates: others }, hops };
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
        return { points, length, vertices, stop: { reason: "branch_joins_main", x, y }, hops };
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

    if (!next) return { points, length, vertices, stop: { reason: "dead_end", x, y }, hops };
    if (!sameFamilyContinuity(index, ctx.dash, ctx.layerOf, curSeg, next.seg)) {
      return { points, length, vertices, stop: { reason: "family_change", x, y }, hops };
    }

    curSeg = next.seg;
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
): { points: [number, number][]; length: number; vertices: WalkVertex[]; stops: { forward: WalkStop; backward: WalkStop }; hops: number } {
  const fwd = walkOneDirection(index, seedSeg, 1, ppf, ctx, opts);
  const back = walkOneDirection(index, seedSeg, 0, ppf, ctx, opts);
  const points = [...back.points.slice().reverse(), ...fwd.points.slice(2)];
  const vertices = [...back.vertices.slice().reverse(), ...fwd.vertices];
  return {
    points, vertices,
    length: fwd.length + back.length - segLength(index, seedSeg),
    stops: { forward: fwd.stop, backward: back.stop },
    hops: fwd.hops + back.hops,
  };
}
