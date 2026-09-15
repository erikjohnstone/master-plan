// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 Lane E — first slice:
// a graph signature + reference primitive set per legend glyph, reusing
// legendlearn.ts's own LegendGlyph shape, the Phase 2 spatial index, and
// Phase 3 Lane D's own body-signature machinery.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { computeVectorSceneJunctions } from "../src/lib/vectorSceneRelations.ts";
import { computePrimitiveGraphAttributes } from "../src/lib/candidateBodyLaneD.ts";
import { buildSpatialIndex } from "../src/lib/vectorSceneSpatialIndex.ts";
import { buildLegendReferenceBank, type LegendGlyphLike } from "../src/lib/legendReferenceBank.ts";

const OPS = {
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];
const closedRect = (x: number, y: number, w: number, h: number): Op =>
  [OPS.constructPath, [[OPS.rectangle], [x, y, w, h]]];

function bankFor(ops: Op[], glyphs: LegendGlyphLike[]) {
  const geo = extractVectorGeometry(opList(ops), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const { attributes } = computePrimitiveGraphAttributes(idx, junctions);
  const spatialIndex = buildSpatialIndex(idx);
  return buildLegendReferenceBank(glyphs, idx, spatialIndex, attributes);
}

test("legend reference bank: a glyph whose rect covers a real closed figure gets its primitives and a real signature", () => {
  const glyph: LegendGlyphLike = {
    caption: "CD-1 CEILING DIFFUSER", caption_bbox: [[20, 0], [120, 10]],
    rect: [[-1, -1], [11, 11]], kind: "symbol", seedable: true,
  };
  const bank = bankFor([closedRect(0, 0, 10, 10)], [glyph]);
  assert.equal(bank.length, 1);
  assert.equal(bank[0].caption, "CD-1 CEILING DIFFUSER");
  assert.equal(bank[0].primitiveIds.length, 4, "all 4 rect edges resolved inside the glyph's own rect");
  assert.ok(bank[0].signature, "a real signature was computed");
  assert.equal(bank[0].signature!.memberCount, 4);
});

test("legend reference bank: a primitive only grazing the rect's edge (not contained) is excluded", () => {
  const glyph: LegendGlyphLike = {
    caption: "PARTIAL", caption_bbox: [[0, 0], [10, 5]],
    rect: [[0, 0], [5, 5]], kind: "symbol", seedable: true,
  };
  // a line from (0,0) to (20,0) is NOT contained in [0,0]-[5,5] — its own
  // bbox extends to x=20, well past the glyph's rect
  const bank = bankFor([line(0, 0, 20, 0)], [glyph]);
  assert.deepEqual(bank[0].primitiveIds, []);
  assert.equal(bank[0].signature, null, "no contained primitives means no signature, not a fabricated empty one");
});

test("legend reference bank: member_rects (a disconnected multi-part glyph) union together instead of using the outer rect alone", () => {
  const glyph: LegendGlyphLike = {
    caption: "SPLIT GLYPH", caption_bbox: [[0, 0], [10, 5]],
    rect: [[-1, -1], [121, 11]],
    member_rects: [[[-1, -1], [11, 11]], [[99, -1], [121, 11]]],
    kind: "symbol_group", seedable: false,
  };
  const bank = bankFor([closedRect(0, 0, 10, 10), closedRect(100, 0, 10, 10)], [glyph]);
  assert.equal(bank[0].primitiveIds.length, 8, "both member rects' own 4 edges each resolved");
  assert.equal(bank[0].seedable, false, "seedable passes through from the source glyph unchanged");
});

test("legend reference bank: preserves input order and one entry per glyph, even across multiple glyphs", () => {
  const g1: LegendGlyphLike = { caption: "A", caption_bbox: [[0, 0], [1, 1]], rect: [[-1, -1], [11, 11]], kind: "symbol", seedable: true };
  const g2: LegendGlyphLike = { caption: "B", caption_bbox: [[0, 0], [1, 1]], rect: [[99, -1], [111, 11]], kind: "symbol", seedable: true };
  const bank = bankFor([closedRect(0, 0, 10, 10), closedRect(100, 0, 10, 10)], [g1, g2]);
  assert.deepEqual(bank.map((e) => e.caption), ["A", "B"]);
  assert.equal(bank[0].primitiveIds.length, 4);
  assert.equal(bank[1].primitiveIds.length, 4);
});

test("legend reference bank: an empty glyph list produces an empty bank", () => {
  const bank = bankFor([closedRect(0, 0, 10, 10)], []);
  assert.deepEqual(bank, []);
});
