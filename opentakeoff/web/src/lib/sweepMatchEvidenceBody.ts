// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 6/7 — the old-engine-to-
// evidence-graph adapter. See PROGRESS.md for the full reasoning: two
// separate real attempts at fixing the NEW bottom-up Lane A/B/C
// candidate-generation pipeline's fragmentation on complex multi-stroke
// symbols both failed real corpus measurement, while the OLD, currently-
// live `symbolsweep.ts` template-matching engine (`matchSymbol`, used by
// `Session.symbolSweep`/`sweepScheduleRow`) already gets 49/51 on the
// real corpus, INCLUDING those same complex symbols — a methodological
// difference (search-for-a-known-shape vs. segment-then-recognize), not
// a tunable gap. `evidenceGraph.ts`'s own `buildSheetEvidenceGraph`
// (Phase 6) takes a generic `EvidenceBodyLike` — this module is the
// smallest real step to feed it from the OLD engine's ALREADY-ACCURATE
// match results, instead of waiting on the new pipeline to become
// viable.
//
// `SweepMatch` (symbolsweep.ts) reports a centroid (`at`) and a score,
// never a primitive-id list — `scoreAt`/`scoreAtTol` compute one
// internally per seed segment but discard it every iteration (confirmed
// by direct audit of symbolsweep.ts:1932-1997, not assumed). This
// module reconstructs a real primitive-id list the SAME way three
// independent, already-shipped call sites already derive a bbox/id-set
// from a match, rather than inventing a fourth convention:
//   - the box-from-match math is `sweepThumb.js`'s own `matchBox` (used
//     today for real match-review thumbnails and canvas highlight
//     boxes) — reused directly, not reimplemented, so a future change to
//     that rotation-safe sizing logic is inherited automatically.
//   - the box-to-primitive-ids step uses EXACT containment (a primitive
//     fully inside the box), the same convention
//     `score-ownership-against-ground-truth.mjs` already uses to derive
//     a ground-truth instance's own primitive set from its body_bbox —
//     not the LOOSER bbox-overlap `segmentsInBox` uses for thumbnails,
//     where over-inclusion is the safe direction; here, over-inclusion
//     would corrupt this body's own identity with unrelated nearby ink.
import type { SweepMatch, SweepTransform } from "./symbolsweep.ts";
import type { VectorSceneIndex } from "./vectorSceneIndex.ts";
import { querySpatialIndex, type SpatialIndex } from "./vectorSceneSpatialIndex.ts";
import { matchBox } from "./sweepThumb.js";
import type { EvidenceBodyLike } from "./evidenceGraph.ts";

export interface SeedRect { x0: number; y0: number; x1: number; y1: number }

function containedIn(px0: number, py0: number, px1: number, py1: number, x0: number, y0: number, x1: number, y1: number): boolean {
  return px0 >= x0 && px1 <= x1 && py0 >= y0 && py1 <= y1;
}

/** Pure: converts one `SweepMatch` (from `matchSymbol`/`sweepScheduleRow`,
 *  either rigid or affine-refined) plus the ORIGINAL seed marquee rect
 *  into an `EvidenceBodyLike`, by querying the target sheet's own
 *  (already-cached, per `Session.vectorSceneIndexFor`) `VectorSceneIndex`
 *  and spatial index. Returns `null` when the derived box contains no
 *  primitive at all (never a body with zero ink) — an honest refusal,
 *  matching this module family's own convention, not a defaulted empty
 *  body. Never mutates any input. */
export function sweepMatchToEvidenceBody(
  id: number,
  match: Pick<SweepMatch, "at" | "rotation" | "transform">,
  seedRect: SeedRect,
  idx: VectorSceneIndex,
  spatialIndex: SpatialIndex,
): EvidenceBodyLike | null {
  const transform: SweepTransform | undefined = match.transform;
  const scaleX = transform?.scale_x ?? 1;
  const scaleY = transform?.scale_y ?? 1;
  const w = (seedRect.x1 - seedRect.x0) * scaleX;
  const h = (seedRect.y1 - seedRect.y0) * scaleY;
  if (!(w > 0) || !(h > 0)) return null;
  const rotationDeg = transform?.rotation_deg ?? match.rotation;

  const box = matchBox(match.at, { x0: 0, y0: 0, x1: w, y1: h }, 0.15, rotationDeg);
  if (!box) return null;

  const candidates = querySpatialIndex(spatialIndex, box.x0, box.y0, box.x1, box.y1);
  const primitiveIds: number[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pid of candidates) {
    const p = idx.primitives[pid];
    if (!p) continue;
    const px0 = Math.min(p.x0, p.x1), px1 = Math.max(p.x0, p.x1);
    const py0 = Math.min(p.y0, p.y1), py1 = Math.max(p.y0, p.y1);
    if (!containedIn(px0, py0, px1, py1, box.x0, box.y0, box.x1, box.y1)) continue;
    primitiveIds.push(pid);
    if (px0 < x0) x0 = px0; if (px1 > x1) x1 = px1;
    if (py0 < y0) y0 = py0; if (py1 > y1) y1 = py1;
  }
  if (primitiveIds.length === 0) return null;
  primitiveIds.sort((a, b) => a - b);
  return { id, primitiveIds, x0, y0, x1, y1 };
}
