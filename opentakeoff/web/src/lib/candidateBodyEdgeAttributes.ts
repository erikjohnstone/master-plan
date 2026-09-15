// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 Lane D — edge/relation
// attributes, the second half of Lane D's own attribute list ("touching,
// gap distance, crossing, T-junction, parallel, perpendicular, concentric,
// collinear, relative angle, relative length, and normalized
// displacement"). Built from what already exists rather than a fresh
// all-pairs scan: computeVectorSceneJunctions (slice 6, for touching/
// T-junction) and computeVectorScenePairRelations (slice 7, for parallel/
// perpendicular/collinear) already identify which primitive pairs matter,
// bounded by their own disclosed caps — this module restates THOSE pairs
// with the additional attributes Lane D's own list names, never a new
// combinatorial scan of its own.
//
// Covered this slice: touching, T-junction (junction kind when touching),
// parallel, perpendicular, collinear, relative angle (always computed,
// whether or not the pair is classified parallel/perpendicular), relative
// length, gap distance (nearest-endpoint distance when NOT touching), and
// normalized displacement (the vector between the two primitives'
// midpoints, divided by the sheet's own reference length so it reads the
// same across sheets exported at different scales — the same
// normalization candidateBodyLaneD.ts's own normalizedLength already
// uses).
//
// NOT covered (disclosed, real further work): "crossing" — true mid-
// segment intersection without a shared endpoint — is still the one
// unimplemented named §7 relation (see PROGRESS.md); "concentric" needs
// circle/arc detection, deferred since Phase 2 slice 1's own primType
// work (circle/ellipse approximation recovery was explicitly named and
// deferred there too). Both are omitted rather than approximated.
import type { VectorSceneIndex } from "./vectorSceneIndex.ts";
import type { Junction, PairRelationsResult } from "./vectorSceneRelations.ts";
import type { PrimitiveNodeAttributes } from "./candidateBodyLaneD.ts";

export interface EdgeAttributes {
  aId: number;
  bId: number;
  touching: boolean;
  /** the junction kind at the shared point, or null when not touching. */
  junctionKind: Junction["kind"] | null;
  parallel: boolean;
  perpendicular: boolean;
  collinear: boolean;
  /** acute angle between the two primitives' orientations, degrees [0,90],
   *  always computed regardless of the parallel/perpendicular booleans
   *  above (an oblique pair still has a real relative angle). */
  relativeAngleDeg: number;
  /** longer length / shorter length, >= 1. */
  relativeLength: number;
  /** null when touching (a shared point has no meaningful gap) — nearest-
   *  endpoint Euclidean distance between the two primitives otherwise. */
  gapDistance: number | null;
  /** (midpoint of b - midpoint of a) / the sheet's reference length
   *  (candidateBodyLaneD.ts's own normalization), as [dx, dy]. */
  normalizedDisplacement: [number, number];
}

function angleDiffMod180(a: number, b: number): number {
  const d = Math.abs(a - b) % 180;
  return d > 90 ? 180 - d : d;
}

function midpoint(idx: VectorSceneIndex, id: number): [number, number] {
  const p = idx.primitives[id];
  return [(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2];
}

function nearestEndpointDistance(idx: VectorSceneIndex, a: number, b: number): number {
  const pa = idx.primitives[a], pb = idx.primitives[b];
  const pts_a: [number, number][] = [[pa.x0, pa.y0], [pa.x1, pa.y1]];
  const pts_b: [number, number][] = [[pb.x0, pb.y0], [pb.x1, pb.y1]];
  let best = Infinity;
  for (const [ax, ay] of pts_a) {
    for (const [bx, by] of pts_b) {
      const d = Math.hypot(ax - bx, ay - by);
      if (d < best) best = d;
    }
  }
  return best;
}

/** Pure: restates the pairs computeVectorSceneJunctions and
 *  computeVectorScenePairRelations already identified as related, with
 *  Lane D's own edge-attribute list attached. Never scans a pair neither
 *  of those already flagged. `referenceLength` should be the same value
 *  `computePrimitiveGraphAttributes` returned for this sheet, so
 *  normalizedDisplacement and normalizedLength (candidateBodyLaneD.ts)
 *  agree on scale. */
export function computeEdgeAttributes(
  idx: VectorSceneIndex,
  junctions: readonly Junction[],
  pairRelations: PairRelationsResult,
  attributes: readonly PrimitiveNodeAttributes[],
  referenceLength: number,
): EdgeAttributes[] {
  const lengthById = new Map(attributes.map((a) => [a.primitiveId, a.length] as const));
  const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const edges = new Map<string, EdgeAttributes>();
  const refLen = referenceLength || 1;

  const buildBase = (aId: number, bId: number): EdgeAttributes => {
    const [ax, ay] = midpoint(idx, aId), [bx, by] = midpoint(idx, bId);
    const lenA = lengthById.get(aId) ?? 0, lenB = lengthById.get(bId) ?? 0;
    const oa = idx.primitives[aId], ob = idx.primitives[bId];
    const orientA = ((Math.atan2(oa.y1 - oa.y0, oa.x1 - oa.x0) * 180) / Math.PI % 180 + 180) % 180;
    const orientB = ((Math.atan2(ob.y1 - ob.y0, ob.x1 - ob.x0) * 180) / Math.PI % 180 + 180) % 180;
    return {
      aId, bId,
      touching: false, junctionKind: null,
      parallel: false, perpendicular: false, collinear: false,
      relativeAngleDeg: angleDiffMod180(orientA, orientB),
      relativeLength: lenA > 0 && lenB > 0 ? Math.max(lenA, lenB) / Math.min(lenA, lenB) : 1,
      gapDistance: nearestEndpointDistance(idx, aId, bId),
      normalizedDisplacement: [(bx - ax) / refLen, (by - ay) / refLen],
    };
  };

  for (const j of junctions) {
    for (let i = 0; i < j.members.length; i++) {
      for (let k = i + 1; k < j.members.length; k++) {
        const a = j.members[i].primitiveId, b = j.members[k].primitiveId;
        if (a === b) continue;
        const key = pairKey(a, b);
        const e = edges.get(key) ?? buildBase(Math.min(a, b), Math.max(a, b));
        e.touching = true;
        e.junctionKind = j.kind;
        e.gapDistance = null;
        edges.set(key, e);
      }
    }
  }
  for (const pr of pairRelations.parallelPairs) {
    const key = pairKey(pr.aId, pr.bId);
    const e = edges.get(key) ?? buildBase(pr.aId, pr.bId);
    e.parallel = true;
    edges.set(key, e);
  }
  for (const pr of pairRelations.perpendicularPairs) {
    const key = pairKey(pr.aId, pr.bId);
    const e = edges.get(key) ?? buildBase(pr.aId, pr.bId);
    e.perpendicular = true;
    edges.set(key, e);
  }
  for (const pr of pairRelations.collinearPairs) {
    const key = pairKey(pr.aId, pr.bId);
    const e = edges.get(key) ?? buildBase(pr.aId, pr.bId);
    e.collinear = true;
    edges.set(key, e);
  }

  return [...edges.values()];
}
