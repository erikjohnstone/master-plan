// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 4 requirement 2's own
// "carrier versus body classification" signal. A CARRIER is the
// underlying utility run a symbol sits on or near — a duct, pipe, wire,
// or wall segment — as distinct from the symbol's own BODY ink; a
// proposal that happens to claim a stub of a carrier passing near or
// through it should not have that stub treated as intrinsic body
// evidence (it would corrupt a body signature or bbox with geometry that
// belongs to a much larger, unrelated real-world run).
//
// FIRST DESIGN REJECTED BY REAL-SHEET VALIDATION, disclosed rather than
// silently discarded: comparing a primitive's own subpath bbox against
// its CONTAINING PROPOSAL's own bbox is mathematically vacuous. Both
// Lane A (candidateBodyLaneA.ts) and Lane B (candidateBodyLaneB.ts)
// build a proposal's primitiveIds from WHOLE subpaths, never a partial
// one — so a member subpath's own bbox is always a subset of (or equal
// to) its containing proposal's bbox, by construction, in every case.
// Running the first version against Cherry Point #12 (73,259 real
// proposals, 104,030 primitive classifications) produced `maxRatio: 1`
// and zero carrier flags — not "this real sheet has no carriers," but
// "this signal cannot fire against this pipeline's own proposals, ever."
//
// CORRECTED DESIGN: compare each subpath's own diagonal against the
// MEDIAN diagonal of its SIBLING subpaths within the same proposal (a
// proposal spanning several distinct subpaths glued together at
// junctions — real for Lane B bodies that cross a pass-through/corner
// junction between subpaths). One subpath dramatically longer than its
// siblings inside the same candidate body is real, actionable
// structural evidence it's a carrier passing through rather than
// intrinsic symbol ink — a within-body outlier check, not a proposal-
// bbox-vs-member-bbox comparison that could never be true by
// construction. A proposal made of only ONE subpath has no sibling to
// compare against at all, and is honestly reported as such (`null`),
// not silently classified as "not a carrier" by default.
import type { VectorSceneIndex } from "./vectorSceneIndex.ts";

export interface CarrierClassification {
  primitiveId: number;
  isCarrierLike: boolean;
  /** this primitive's own subpath diagonal ÷ the MEDIAN diagonal of the
   *  OTHER subpaths in the same proposal. null when the proposal has
   *  only one distinct subpath (nothing to compare against) or when the
   *  primitive has no resolvable subpath. */
  extentRatio: number | null;
}

const DEFAULT_EXTENT_RATIO_THRESHOLD = 3;

function diagonal(x0: number, y0: number, x1: number, y1: number): number {
  return Math.hypot(x1 - x0, y1 - y0);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Pure: classifies every primitive in `proposalPrimitiveIds` as carrier-
 *  like or not, relative to the OTHER subpaths making up the same
 *  proposal (not the proposal's own bbox — see header for why that
 *  comparison is vacuous by construction). Never mutates any input. */
export function classifyCarrierPrimitives(
  proposalPrimitiveIds: readonly number[],
  idx: VectorSceneIndex,
  opts: { extentRatioThreshold?: number } = {},
): CarrierClassification[] {
  const threshold = opts.extentRatioThreshold ?? DEFAULT_EXTENT_RATIO_THRESHOLD;

  // group this proposal's own primitives by subpathId, one diagonal per
  // distinct subpath actually present in this proposal.
  const subpathIdsByPrimitive = new Map<number, number>();
  const diagonalBySubpath = new Map<number, number>();
  for (const pid of proposalPrimitiveIds) {
    const p = idx.primitives[pid];
    if (!p || p.subpathId < 0) continue;
    subpathIdsByPrimitive.set(pid, p.subpathId);
    if (!diagonalBySubpath.has(p.subpathId)) {
      const sp = idx.subpaths[p.subpathId];
      diagonalBySubpath.set(p.subpathId, diagonal(sp.x0, sp.y0, sp.x1, sp.y1));
    }
  }

  const results: CarrierClassification[] = [];
  for (const pid of proposalPrimitiveIds) {
    const subpathId = subpathIdsByPrimitive.get(pid);
    if (subpathId === undefined) {
      results.push({ primitiveId: pid, isCarrierLike: false, extentRatio: null });
      continue;
    }
    const siblingDiagonals = [...diagonalBySubpath.entries()]
      .filter(([sid]) => sid !== subpathId)
      .map(([, d]) => d);
    if (siblingDiagonals.length === 0) {
      // only one distinct subpath in this whole proposal — nothing to
      // compare against, honestly reported as "not evaluable," not
      // defaulted to "not a carrier."
      results.push({ primitiveId: pid, isCarrierLike: false, extentRatio: null });
      continue;
    }
    const ownDiagonal = diagonalBySubpath.get(subpathId)!;
    const siblingMedian = median(siblingDiagonals);
    const extentRatio = siblingMedian > 0 ? ownDiagonal / siblingMedian : (ownDiagonal > 0 ? Infinity : 0);
    results.push({ primitiveId: pid, isCarrierLike: extentRatio >= threshold, extentRatio });
  }
  return results;
}
