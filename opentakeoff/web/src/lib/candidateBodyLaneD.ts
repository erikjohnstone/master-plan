// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 — "attributed graph/path
// hashing," Lane D. FIRST slice: per-primitive NODE ATTRIBUTES only — the
// foundation goal §8 Lane D's own list requires before any compact
// signature/hashing or spatial voting can be built on top. A building
// block, not the full lane.
//
// Lane D's own node-attribute list: "type, normalized length, orientation
// modulo symmetry, width/style, closed-cycle membership, local degree,
// curvature." Every one is already computable from what Phase 2 built:
// - type: primType (line/rect-edge/bezier), null when the source
//   VectorGeometry predates that field (same honesty convention
//   IndexedPrimitive.primType already uses).
// - normalized length: raw length divided by a per-sheet reference length
//   (the MEDIAN non-degenerate primitive length on the sheet, robust to a
//   few outliers) — so the same physical proportions read the same whether
//   a seed and target sheet were exported at different scales, without
//   needing an absolute ft/px calibration this module has no access to.
// - orientation modulo symmetry: reuses vectorSceneRelations.ts's own
//   orientationDeg convention (mod 180 — an undirected line and its
//   reverse are the same orientation). "Modulo symmetry" here means that
//   coarse mod-180 grain, not a finer per-family symmetry group (a square
//   symbol's own 4-fold symmetry, say) — that refinement is further work,
//   disclosed, not attempted.
// - width/style: deviceLineWidth plus dashed/lineCap/lineJoin, read from
//   the owning subpath (graphics state cannot change mid-path, so this is
//   the right grain, same reasoning oneclick.ts's own SubPath fields use).
// - closed-cycle membership: the owning subpath's own `closed` flag.
// - local degree: the junction size at each of the primitive's own two
//   endpoints (computeVectorSceneJunctions) — reported as a pair, not
//   collapsed to one number, since which end is which is real information
//   a signature built on top of this would want to keep.
// - curvature: primType === PRIM_BEZIER.
//
// NOT done in this slice (disclosed, real further work): edge/relation
// attributes (Lane D's OTHER half — touching/gap/crossing/parallel/
// perpendicular/concentric/collinear/relative angle/length/displacement;
// vectorSceneRelations.ts's pair relations already compute several of
// these independently and could feed a future edge-attribute pass);
// compact invariant path/subgraph signature construction; rare/distinctive
// signature retrieval; spatial voting. This module is the node-attribute
// table those need, not the lane itself.
import type { VectorSceneIndex } from "./vectorSceneIndex.ts";
import type { Junction } from "./vectorSceneRelations.ts";

export const LANE_D_MAX_PRIMITIVES = 250_000;

export interface PrimitiveNodeAttributes {
  primitiveId: number;
  type: number | null;
  length: number;
  /** length / the sheet's own median non-degenerate primitive length; 1 if
   *  no reference length could be computed (an empty or all-degenerate
   *  sheet). */
  normalizedLength: number;
  /** mod 180 — see the module header's "modulo symmetry" note. */
  orientationDeg: number;
  deviceLineWidth: number;
  dashed: boolean;
  lineCap: number;
  lineJoin: number;
  /** the owning subpath's own closed flag; false when the primitive has no
   *  resolved subpath (subpathId === -1, a hand-built/partial fixture). */
  closed: boolean;
  /** junction size (member count) at each endpoint — NOT "other primitives
   *  touching" (subtract 1 for that); 1 means a dangling end. */
  degreeA: number;
  degreeB: number;
  curved: boolean;
}

export interface LaneDResult {
  attributes: PrimitiveNodeAttributes[];
  /** the reference length normalizedLength divides by. */
  referenceLength: number;
  incomplete: boolean;
  incompleteReason: string | null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Pure: computes per-primitive node attributes for a built VectorSceneIndex
 *  and its own computeVectorSceneJunctions result. Never mutates either. */
export function computePrimitiveGraphAttributes(
  idx: VectorSceneIndex,
  junctions: Junction[],
  opts: { maxPrimitives?: number } = {},
): LaneDResult {
  const cap = opts.maxPrimitives ?? LANE_D_MAX_PRIMITIVES;
  const n = idx.primitives.length;
  if (n > cap) {
    return {
      attributes: [], referenceLength: 0, incomplete: true,
      incompleteReason: `primitive count ${n} exceeds the ${cap}-primitive Lane D cap; no attributes were computed`,
    };
  }

  // junction size at each primitive endpoint: a primitive can appear as
  // "a" in one junction and "b" in another (or the same one, for a closed
  // one-primitive loop) — index by (primitiveId, end) pair.
  const degreeOf = new Map<string, number>();
  for (const j of junctions) {
    for (const m of j.members) degreeOf.set(`${m.primitiveId}:${m.end}`, j.members.length);
  }

  const lengths: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = idx.primitives[i];
    lengths[i] = Math.hypot(p.x1 - p.x0, p.y1 - p.y0);
  }
  const referenceLength = median(lengths.filter((l) => l > 1e-9)) || 1;

  const attributes: PrimitiveNodeAttributes[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = idx.primitives[i];
    const dx = p.x1 - p.x0, dy = p.y1 - p.y0;
    const orientationDeg = ((Math.atan2(dy, dx) * 180) / Math.PI % 180 + 180) % 180;
    const sp = p.subpathId >= 0 ? idx.subpaths[p.subpathId] : null;
    attributes[i] = {
      primitiveId: p.id,
      type: p.primType,
      length: lengths[i],
      normalizedLength: lengths[i] / referenceLength,
      orientationDeg,
      deviceLineWidth: p.deviceLineWidth,
      dashed: sp?.dashed ?? false,
      lineCap: sp?.lineCap ?? 0,
      lineJoin: sp?.lineJoin ?? 0,
      closed: sp?.closed ?? false,
      degreeA: degreeOf.get(`${p.id}:a`) ?? 1,
      degreeB: degreeOf.get(`${p.id}:b`) ?? 1,
      curved: p.curved,
    };
  }

  return { attributes, referenceLength, incomplete: false, incompleteReason: null };
}
