// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 — "multi-lane candidate-
// body proposal," Lane C: tag/leader-led regions. FIRST slice: requirement
// 3 only — "Support no-leader adjacency as a separate evidence type" — the
// simplest of Lane C's four requirements and the one with no dependency on
// leader-line tracing.
//
// Given one tag token's own bbox (in the same image-px space
// VectorSceneIndex primitives live in — pdf.ts's own textSpans already
// produce this), finds the nearest Lane B candidate body within a
// disclosed proximity threshold, using the Phase 2 spatial index
// (vectorSceneSpatialIndex.ts) to stay near-linear rather than testing
// every body against every tag.
//
// Deliberately NOT attempted in this slice (disclosed, real further work):
// - Requirement 1: exact tag token boxes as SEARCH REGIONS feeding a
//   broader candidate search — this slice only scores adjacency to bodies
//   Lane B already proposed, it does not itself generate new regions.
// - Requirement 2: leader-line following (start near the tag, consistent
//   stroke style, bounded bends/gaps, terminate near a body, stop before a
//   long carrier) — real further work, a materially different algorithm
//   from simple bbox proximity.
// - Requirement 4: "Never report the tag bbox or arbitrary leader endpoint
//   as the physical symbol body" is upheld by construction here (this
//   module returns a BODY id and its own bbox, never the tag's), but the
//   fuller discipline that requirement implies once leader-following
//   exists is not yet exercised.
// goal §4's own association_type vocabulary is not adjudicated here either
// (enclosed/adjacent/leader/inline/shared callout/schedule-only/
// unlabelled) — this slice answers "is there a body plausibly adjacent to
// this tag," not which of those seven categories applies.
import type { CandidateBody } from "./candidateBodyLaneB.ts";
import type { SpatialIndex } from "./vectorSceneSpatialIndex.ts";
import { querySpatialIndex } from "./vectorSceneSpatialIndex.ts";

export type TagBbox = readonly [number, number, number, number];

export interface TagAdjacencyResult {
  tagBbox: TagBbox;
  nearestBodyId: number | null;
  /** bbox-to-bbox gap distance, image px — 0 when the tag and body boxes
   *  overlap or touch, null when no body was found within the search
   *  radius at all. */
  distance: number | null;
}

/** Disclosed default: how far past a tag's own bbox to search, and the
 *  hard cutoff beyond which a body is not "adjacent" at all — not tuned
 *  against real corpus geometry yet (this slice's own scope is the
 *  mechanism, not the calibrated threshold). */
export const DEFAULT_SEARCH_PAD_PX = 60;
export const DEFAULT_MAX_ADJACENT_DISTANCE_PX = 60;

/** Minimum gap between two axis-aligned bboxes — 0 when they overlap or
 *  touch. Exported since a caller scoring several tags against the same
 *  body set will want the identical metric this module uses internally. */
export function bboxGapDistance(a: TagBbox, b: TagBbox): number {
  const dx = Math.max(a[0] - b[2], b[0] - a[2], 0);
  const dy = Math.max(a[1] - b[3], b[1] - a[3], 0);
  return Math.hypot(dx, dy);
}

/** Pure: finds the nearest Lane B candidate body to one tag token's bbox,
 *  within `maxDistance`. Never mutates `bodies` or `spatialIndex`. */
export function findAdjacentBody(
  tagBbox: TagBbox,
  bodies: readonly CandidateBody[],
  primitiveToBodyId: ReadonlyMap<number, number>,
  spatialIndex: SpatialIndex,
  opts: { searchPad?: number; maxDistance?: number } = {},
): TagAdjacencyResult {
  const pad = opts.searchPad ?? DEFAULT_SEARCH_PAD_PX;
  const maxDistance = opts.maxDistance ?? DEFAULT_MAX_ADJACENT_DISTANCE_PX;
  const [tx0, ty0, tx1, ty1] = tagBbox;

  const candidatePrimIds = querySpatialIndex(spatialIndex, tx0 - pad, ty0 - pad, tx1 + pad, ty1 + pad);
  const candidateBodyIds = new Set<number>();
  for (const pid of candidatePrimIds) {
    const bid = primitiveToBodyId.get(pid);
    if (bid !== undefined) candidateBodyIds.add(bid);
  }

  let best: { id: number; distance: number } | null = null;
  const byId = new Map(bodies.map((b) => [b.id, b] as const));
  for (const bid of candidateBodyIds) {
    const body = byId.get(bid);
    if (!body) continue;
    const d = bboxGapDistance(tagBbox, [body.x0, body.y0, body.x1, body.y1]);
    if (d > maxDistance) continue;
    if (!best || d < best.distance) best = { id: bid, distance: d };
  }

  return { tagBbox, nearestBodyId: best?.id ?? null, distance: best?.distance ?? null };
}

/** Convenience: builds the primitiveId -> bodyId reverse map
 *  `findAdjacentBody` needs, from Lane B's own candidate bodies. Exported
 *  so a caller scoring many tags against the same body set builds this
 *  once, not once per tag. */
export function buildPrimitiveToBodyMap(bodies: readonly CandidateBody[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const body of bodies) for (const pid of body.primitiveIds) map.set(pid, body.id);
  return map;
}
