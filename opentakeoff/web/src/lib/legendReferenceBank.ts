// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 — "multi-lane candidate-
// body proposal," Lane E: legend-reference retrieval. FIRST slice: a
// per-glyph graph signature and reference primitive set, item 3 of Lane
// E's own four-item list ("Carry legend source bbox, caption, family
// candidates, graph signature, content signature, and reference
// primitive set").
//
// Audited before building (GOAL.md's own standing rule 2 — never
// reimplement what already exists): `web/src/lib/legendlearn.ts`'s
// `findLegendGlyphs` already extracts real legend rows with caption,
// caption_bbox, rect, seedable, kind, aligned_rows, member_rects — mature,
// existing capability, not duplicated here. The goal document's OWN
// diagnosis names exactly what is missing on top of that: "there is no
// unified project-local reference bank carrying a legend glyph's vector
// graph ... into the shared matcher." This module is that missing piece,
// reusing Phase 2's spatial index (to find which real primitives live
// inside a glyph's own rect) and Phase 3 Lane D's own body-signature
// machinery (candidateBodySignature.ts) — never a second implementation
// of either.
//
// Deliberately NOT attempted in this slice (disclosed, real further
// work):
// - Item 2, "store multiple legitimate variants per family instead of
//   collapsing them to one canonical shape": this slice produces one
//   reference entry per legend ROW, exactly as `findLegendGlyphs` found
//   it — it does not yet cluster near-duplicate or variant rows into one
//   family with several stored shapes.
// - Item 4, "use caption/tag/schedule schema to narrow eligible families":
//   no schedule/tag cross-reference is attempted here.
// - "Content signature" (item 3's other half, alongside "graph
//   signature") — Lane A's own Form-XObject content-signature work
//   (Phase 2's own deferred item) is the natural source for this and is
//   not built yet.
// - Actually wiring this bank into `symbol_sweep`'s own matcher (Phase 7's
//   own integration item) — this slice builds the bank, it does not
//   consume it anywhere yet.
import type { VectorSceneIndex } from "./vectorSceneIndex.ts";
import type { SpatialIndex } from "./vectorSceneSpatialIndex.ts";
import { querySpatialIndex } from "./vectorSceneSpatialIndex.ts";
import type { PrimitiveNodeAttributes } from "./candidateBodyLaneD.ts";
import type { BodySignature } from "./candidateBodySignature.ts";
import { computeBodySignature } from "./candidateBodySignature.ts";

export type Point = [number, number];

/** The minimal shape this module needs from legendlearn.ts's own
 *  LegendGlyph — declared locally rather than imported so this module
 *  never depends on legendlearn.ts's full surface (a caller passes its
 *  real LegendGlyph[] straight through; structural typing accepts it). */
export interface LegendGlyphLike {
  caption: string;
  caption_bbox: [Point, Point];
  rect: [Point, Point];
  kind: string;
  seedable: boolean;
  /** present on a disconnected multi-part glyph; when absent, `rect`
   *  alone is the glyph's own region. */
  member_rects?: [Point, Point][];
}

export interface LegendReferenceEntry {
  caption: string;
  captionBbox: [Point, Point];
  rect: [Point, Point];
  kind: string;
  seedable: boolean;
  /** every primitive id resolved to lie inside the glyph's own rect(s) —
   *  the "reference primitive set" Lane E's own list names. */
  primitiveIds: number[];
  /** null when no primitive resolved inside the glyph's own rect(s) at
   *  all (a line-style/annotation row can legitimately have none in the
   *  vector sense this bank indexes). */
  signature: BodySignature | null;
}

/** Pure: resolves the real primitives inside one glyph's own rect(s) via
 *  the spatial index, then reuses candidateBodySignature.ts's own
 *  computeBodySignature — never a second signature algorithm. Never
 *  mutates `idx`, `spatialIndex`, or `attributes`. */
export function buildLegendReferenceBank(
  glyphs: readonly LegendGlyphLike[],
  idx: VectorSceneIndex,
  spatialIndex: SpatialIndex,
  attributes: readonly PrimitiveNodeAttributes[],
): LegendReferenceEntry[] {
  const attrById = new Map(attributes.map((a) => [a.primitiveId, a] as const));
  const entries: LegendReferenceEntry[] = [];

  for (const g of glyphs) {
    const rects = g.member_rects && g.member_rects.length ? g.member_rects : [g.rect];
    const primitiveIds = new Set<number>();
    for (const [[x0, y0], [x1, y1]] of rects) {
      // querySpatialIndex is a broad phase (bbox overlap, its own doc says
      // so) — a primitive whose box merely GRAZES the query rect is not
      // necessarily the glyph's own ink (a neighboring caption's
      // underline, an adjacent row's edge). Keep only primitives fully
      // CONTAINED in the rect — the exact test a broad phase always
      // needs a caller to supply.
      for (const pid of querySpatialIndex(spatialIndex, x0, y0, x1, y1)) {
        const p = idx.primitives[pid];
        const px0 = Math.min(p.x0, p.x1), px1 = Math.max(p.x0, p.x1);
        const py0 = Math.min(p.y0, p.y1), py1 = Math.max(p.y0, p.y1);
        if (px0 >= x0 && px1 <= x1 && py0 >= y0 && py1 <= y1) primitiveIds.add(pid);
      }
    }
    const ids = [...primitiveIds].sort((a, b) => a - b);
    const [rx0, ry0] = g.rect[0], [rx1, ry1] = g.rect[1];
    const body = { id: entries.length, primitiveIds: ids, x0: rx0, y0: ry0, x1: rx1, y1: ry1 };
    const signature = ids.length ? computeBodySignature(body, attrById) : null;

    entries.push({
      caption: g.caption,
      captionBbox: g.caption_bbox,
      rect: g.rect,
      kind: g.kind,
      seedable: g.seedable,
      primitiveIds: ids,
      signature,
    });
  }

  return entries;
}
