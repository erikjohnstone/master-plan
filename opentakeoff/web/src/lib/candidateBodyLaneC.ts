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
// SECOND SLICE: requirement 1, "generate local search regions from exact
// tag token boxes" — real further work motivated directly by this
// checkpoint's own Phase 4 gate-3 F1 finding (PROGRESS.md: Lane B's
// junction-based touching-only union-find fragments a real symbol drawn
// with non-touching strokes into many small disconnected bodies;
// corpus-wide microF1 0.204). A LOCAL, density-relative fix for that
// fragmentation was tried and rejected (PROGRESS.md, same date: 100%
// real-corpus leak rate, the classic density-clustering "chaining"
// failure — an unrelated bridge of nearby ink transitively unions two
// separate real instances). `proposeTagSearchRegionBody` below is a
// DIFFERENT, safer mechanism for the SAME underlying gap: a fixed-radius
// region anchored at ONE tag's own bbox is bounded by construction, not
// a transitive graph closure — it cannot chain arbitrarily far the way
// nearest-neighbor union-find provably did, because its own extent is
// capped at `pad` regardless of what ink lies just beyond that radius.
//
// CALIBRATED AGAINST REAL DATA before being trusted (same "measure
// before you build" discipline as the rejected fix): checked, for every
// real instance in cases.json that carries BOTH a tag_bbox and a
// body_bbox, whether a symmetric `pad`-px region around the tag_bbox (a)
// captures most of that instance's own real body_bbox-contained
// primitives, and (b) never overlaps a NEIGHBORING instance's own
// tag_bbox or body_bbox. Cherry Point's own 20-instance CD-1 family (the
// only real family in the 3-document calibration set with per-instance
// tags on every instance): pad=60 -> 66.9% recall, 0 unsafe overlaps;
// pad=80 -> 82.6% recall, 0 unsafe overlaps; pad=100 -> 85.6% recall but
// 3 REAL unsafe overlaps appear. DEFAULT_TAG_REGION_PAD_PX=80 below is
// chosen from this real measurement, at the edge of confirmed safety,
// not a guess.
//
// DISCLOSED LIMITATION, found by the SAME calibration check: this only
// helps families that actually carry a per-instance tag. Colville's own
// dense 24-tank array (this checkpoint's own hardest real dense-grid
// case) has ZERO instances with a per-instance tag_bbox at all — a
// genuinely tagless repeated raw-geometry grid, where this mechanism has
// nothing to anchor to and cannot help. That case remains Lane B/
// proximity territory, still unsolved (see PROGRESS.md's own rejected
// attempt), not silently claimed as fixed by this slice.
//
// Requirement 4's own discipline ("never report the tag bbox or an
// arbitrary leader endpoint as the physical symbol body") is upheld by
// construction: the proposal's own bbox is computed from the PRIMITIVES
// actually found inside the search region, never the region or the tag
// bbox itself — a real region with zero primitives inside it produces no
// proposal at all, not a degenerate one shaped like the tag or the
// search rectangle.
//
// Deliberately NOT attempted in this slice (disclosed, real further work):
// - Requirement 2: leader-line following (start near the tag, consistent
//   stroke style, bounded bends/gaps, terminate near a body, stop before a
//   long carrier) — real further work, a materially different algorithm
//   from simple bbox proximity.
// - An asymmetric or per-family-tuned search direction (e.g. biasing the
//   region toward "above the tag" for a family that always draws its
//   symbol there) — this slice's own region is symmetric padding in all
//   four directions, deliberately simple and general rather than tuned
//   to one family's own layout convention.
// - Wiring this proposal into candidateProposalFusion.ts / the ownership
//   pipeline, and re-measuring Phase 4 gate 3's own corpus-wide F1 to
//   prove a real improvement — this slice builds and calibrates the
//   mechanism itself, it does not yet change what the rest of the
//   pipeline sees.
// goal §4's own association_type vocabulary is not adjudicated here either
// (enclosed/adjacent/leader/inline/shared callout/schedule-only/
// unlabelled) — this slice answers "is there a body plausibly adjacent to
// this tag," not which of those seven categories applies.
import type { CandidateBody } from "./candidateBodyLaneB.ts";
import type { VectorSceneIndex } from "./vectorSceneIndex.ts";
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

/** Real, disclosed, calibrated default (see this module's own header for
 *  the exact real-corpus measurement this came from): symmetric padding,
 *  image px, around one tag's own bbox. */
export const DEFAULT_TAG_REGION_PAD_PX = 80;

export interface TagRegionProposal {
  tagBbox: TagBbox;
  /** the padded search rectangle actually queried -- reported for
   *  disclosure/debugging, never itself reported as the body (see this
   *  module's own header on requirement 4). */
  region: TagBbox;
  /** every primitive id found inside `region`, ascending -- always at
   *  least 1 (a region with none produces no proposal at all, see
   *  `proposeTagSearchRegionBody` below). */
  primitiveIds: number[];
  /** the TIGHT bbox of `primitiveIds` themselves, never `region` or
   *  `tagBbox` -- requirement 4's own discipline, upheld by construction
   *  here rather than merely stated. */
  x0: number; y0: number; x1: number; y1: number;
}

/** Pure: proposes ONE new candidate body from a single tag token's own
 *  padded search region — requirement 1, "generate local search regions
 *  from exact tag token boxes." Returns null when the region contains no
 *  primitives at all (a real, disclosed possibility — an isolated tag
 *  with no nearby ink, or a tag whose true symbol sits farther than
 *  `pad` — reported as "no proposal," never a degenerate one). Never
 *  mutates `idx` or `spatialIndex`. Bounded by construction: this
 *  region's own extent is capped at `pad` regardless of what real ink
 *  lies just beyond it, unlike a transitive (union-find-style) search —
 *  see this module's own header for why that distinction is load-
 *  bearing, not incidental, after a transitive local-density approach
 *  was tried and rejected for the same underlying problem. */
export function proposeTagSearchRegionBody(
  tagBbox: TagBbox,
  idx: VectorSceneIndex,
  spatialIndex: SpatialIndex,
  opts: { pad?: number } = {},
): TagRegionProposal | null {
  const pad = opts.pad ?? DEFAULT_TAG_REGION_PAD_PX;
  const [tx0, ty0, tx1, ty1] = tagBbox;
  const region: TagBbox = [tx0 - pad, ty0 - pad, tx1 + pad, ty1 + pad];
  const [rx0, ry0, rx1, ry1] = region;

  // querySpatialIndex is a broad phase (bbox overlap, its own doc says
  // so — same convention legendReferenceBank.ts's own header already
  // established) — a primitive that merely GRAZES the region's edge from
  // outside is not real ink INSIDE this tag's own search area, so keep
  // only primitives fully CONTAINED in `region`, the same exact test a
  // broad phase always needs a caller to supply, and the same one this
  // module's own header's real-corpus calibration numbers were measured
  // against — using the raw broad-phase result here instead would
  // silently make the real search radius larger than the calibrated
  // `pad`, invalidating those numbers.
  const primitiveIds: number[] = [];
  for (const pid of querySpatialIndex(spatialIndex, rx0, ry0, rx1, ry1)) {
    const p = idx.primitives[pid];
    const px0 = Math.min(p.x0, p.x1), px1 = Math.max(p.x0, p.x1);
    const py0 = Math.min(p.y0, p.y1), py1 = Math.max(p.y0, p.y1);
    if (px0 >= rx0 && px1 <= rx1 && py0 >= ry0 && py1 <= ry1) primitiveIds.push(pid);
  }
  if (primitiveIds.length === 0) return null;
  primitiveIds.sort((a, b) => a - b);

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pid of primitiveIds) {
    const p = idx.primitives[pid];
    const px0 = Math.min(p.x0, p.x1), px1 = Math.max(p.x0, p.x1);
    const py0 = Math.min(p.y0, p.y1), py1 = Math.max(p.y0, p.y1);
    if (px0 < x0) x0 = px0; if (px1 > x1) x1 = px1;
    if (py0 < y0) y0 = py0; if (py1 > y1) y1 = py1;
  }
  return { tagBbox, region, primitiveIds, x0, y0, x1, y1 };
}
