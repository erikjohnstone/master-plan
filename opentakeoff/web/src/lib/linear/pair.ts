// Double-line duct pairing (#linear-takeoff WP4.1) — MINIMAL slice only.
// Full WP4 (lock-step following of both edges, fitting geometry from pair
// shapes, centreline emission, drawn_width_px per segment) is NOT built
// here — that is a real, separate, larger undertaking. This file exists for
// one narrow reason: WP3's own single-line walker needs a safe way to tell
// "a real branch" apart from "the SAME double-line duct's own other rail,
// met again after wrapping around an end cap or elbow fillet" (docs/
// LINEAR-TRACE-EVAL.md Runs 105-106: a real held-out case's own duplicate-
// segment dedup fix, once applied, correctly turns a false-"ambiguous" node
// into a real tee, but the walker's existing, already-correct "auto-
// continue through a tee" rule then follows the "branch" arm straight into
// the SAME duct's own return rail, reading it as an unrelated continuation
// for 79 segments and 74 feet on a real, unrelated corpus case).
//
// `findParallelPartner` answers one question: "does this segment have a
// nearby twin running alongside it?" — the plan's own WP4.1 pair-search
// geometry (parallel <= 2 deg, offset in [2px, 96in * ppf], overlap >= 60%
// of the shorter segment), reused here as a walk-time safety CHECK rather
// than a full pair-follower. It is deliberately conservative: false
// negatives (missing a real twin) just mean the existing single-line walk
// behavior is unchanged; false positives (calling two unrelated, coincidentally
// parallel-and-close segments "twins") would wrongly refuse a real
// continuation, so the geometry thresholds are the plan's own named ones,
// not loosened for convenience.
import type { SegmentIndex } from "./index.ts";
import { segmentsInBox } from "./index.ts";

const PARALLEL_TOL_DEG = 2;
const MIN_OFFSET_PX = 2;
const MAX_OFFSET_IN = 96;
const MIN_OVERLAP_FRAC = 0.6;

function angleOfSeg(index: SegmentIndex, seg: number): number {
  const x1 = index.segs[seg * 4], y1 = index.segs[seg * 4 + 1], x2 = index.segs[seg * 4 + 2], y2 = index.segs[seg * 4 + 3];
  return (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
}

/** Undirected line-vs-line angle difference, folded to [0, 90] — a segment
 *  and its own exact reverse (180 deg apart) read as perfectly parallel,
 *  matching graph.ts's identical `lineAngleDiffDeg` convention. */
function lineAngleDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 180;
  return d > 90 ? 180 - d : d;
}

/** Given segment `seg`, search nearby geometry for a PARALLEL PARTNER —
 *  another segment running alongside it at a roughly constant perpendicular
 *  offset, with substantial overlap along the shared running direction.
 *  Returns the partner's segment id, or `null` when none qualifies.
 *  `filterFn`, when given, is applied the same way index.ts's own callers
 *  apply one (e.g. walk.ts's same-family-continuity gate) — a candidate
 *  failing it is never considered, regardless of its own geometry. */
export function findParallelPartner(
  index: SegmentIndex, seg: number, ppf: number, filterFn?: (candidate: number) => boolean,
): number | null {
  const x1 = index.segs[seg * 4], y1 = index.segs[seg * 4 + 1], x2 = index.segs[seg * 4 + 2], y2 = index.segs[seg * 4 + 3];
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  const ux = dx / len, uy = dy / len;
  const segAngle = angleOfSeg(index, seg);
  const maxOffsetPx = Math.max(MIN_OFFSET_PX, MAX_OFFSET_IN * (ppf || 0));

  // Pad the search box by the max offset in every direction — a parallel
  // partner up to maxOffsetPx away can have its own bbox extend that far
  // beyond `seg`'s own bbox even with full overlap.
  const minX = Math.min(x1, x2) - maxOffsetPx, maxX = Math.max(x1, x2) + maxOffsetPx;
  const minY = Math.min(y1, y2) - maxOffsetPx, maxY = Math.max(y1, y2) + maxOffsetPx;

  for (const cand of segmentsInBox(index, minX, minY, maxX, maxY, filterFn)) {
    if (cand === seg) continue;
    const cx1 = index.segs[cand * 4], cy1 = index.segs[cand * 4 + 1], cx2 = index.segs[cand * 4 + 2], cy2 = index.segs[cand * 4 + 3];
    if (lineAngleDiffDeg(segAngle, angleOfSeg(index, cand)) > PARALLEL_TOL_DEG) continue;

    // Perpendicular offset at each of the candidate's own endpoints, via the
    // 2D cross product against seg's own unit direction — both ends must
    // land on the SAME side at a CONSISTENT distance (running alongside),
    // not merely cross seg's line once (a real crossing duct, not a twin).
    const offset1 = (cx1 - x1) * uy - (cy1 - y1) * ux;
    const offset2 = (cx2 - x1) * uy - (cy2 - y1) * ux;
    if (Math.sign(offset1) !== Math.sign(offset2) && offset1 !== 0 && offset2 !== 0) continue;
    const avgOffset = (Math.abs(offset1) + Math.abs(offset2)) / 2;
    const offsetSpread = Math.abs(Math.abs(offset1) - Math.abs(offset2));
    if (avgOffset < MIN_OFFSET_PX || avgOffset > maxOffsetPx) continue;
    if (offsetSpread > avgOffset * 0.5 + MIN_OFFSET_PX) continue; // not a constant-offset run

    // Overlap along seg's own running axis, as a fraction of the SHORTER of
    // the two segments — a short cross-brace touching seg's own side band
    // must not count as a full-length twin rail.
    const t1 = (cx1 - x1) * ux + (cy1 - y1) * uy;
    const t2 = (cx2 - x1) * ux + (cy2 - y1) * uy;
    const candLen = Math.hypot(cx2 - cx1, cy2 - cy1);
    const overlapStart = Math.max(0, Math.min(t1, t2)), overlapEnd = Math.min(len, Math.max(t1, t2));
    const overlapLen = Math.max(0, overlapEnd - overlapStart);
    const shorterLen = Math.min(len, candLen);
    if (shorterLen < 1e-9 || overlapLen / shorterLen < MIN_OVERLAP_FRAC) continue;

    return cand;
  }
  return null;
}
