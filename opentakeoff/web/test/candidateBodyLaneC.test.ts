// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 Lane C — first slice:
// no-leader tag/body adjacency, via the spatial index.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { computeVectorSceneJunctions } from "../src/lib/vectorSceneRelations.ts";
import { proposeCandidateBodiesLaneB } from "../src/lib/candidateBodyLaneB.ts";
import { buildSpatialIndex } from "../src/lib/vectorSceneSpatialIndex.ts";
import { bboxGapDistance, buildPrimitiveToBodyMap, findAdjacentBody, proposeTagSearchRegionBody } from "../src/lib/candidateBodyLaneC.ts";

const OPS = {
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const closedRect = (x: number, y: number, w: number, h: number): Op =>
  [OPS.constructPath, [[OPS.rectangle], [x, y, w, h]]];

function setupFor(ops: Op[]) {
  const geo = extractVectorGeometry(opList(ops), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const { bodies } = proposeCandidateBodiesLaneB(idx, junctions);
  const spatialIndex = buildSpatialIndex(idx);
  const primitiveToBodyId = buildPrimitiveToBodyMap(bodies);
  return { idx, bodies, spatialIndex, primitiveToBodyId };
}

test("bboxGapDistance: overlapping or touching boxes are 0 apart", () => {
  assert.equal(bboxGapDistance([0, 0, 10, 10], [5, 5, 15, 15]), 0);
  assert.equal(bboxGapDistance([0, 0, 10, 10], [10, 0, 20, 10]), 0);
});

test("bboxGapDistance: separated boxes report the real gap, diagonal included", () => {
  assert.equal(bboxGapDistance([0, 0, 10, 10], [20, 0, 30, 10]), 10, "horizontal gap");
  assert.equal(bboxGapDistance([0, 0, 10, 10], [13, 14, 20, 20]), 5, "3-4-5 diagonal gap");
});

test("Lane C: a tag sitting right next to one body finds it, within the default threshold", () => {
  const { bodies, spatialIndex, primitiveToBodyId } = setupFor([closedRect(0, 0, 10, 10)]);
  const result = findAdjacentBody([15, 2, 25, 8], bodies, primitiveToBodyId, spatialIndex);
  assert.equal(result.nearestBodyId, bodies[0].id);
  assert.equal(result.distance, 5);
});

test("Lane C: a tag finds the NEARER of two bodies, not just the first found", () => {
  const { bodies, spatialIndex, primitiveToBodyId } = setupFor([
    closedRect(0, 0, 10, 10),
    closedRect(200, 0, 10, 10),
  ]);
  // tag sits just past the far body's own left edge, at x=195 — closer to
  // body 2 (200..210) than body 1 (0..10)
  const result = findAdjacentBody([185, 2, 195, 8], bodies, primitiveToBodyId, spatialIndex);
  const farBody = bodies.find((b) => b.x0 === 200)!;
  assert.equal(result.nearestBodyId, farBody.id);
  assert.equal(result.distance, 5);
});

test("Lane C: nothing within the search radius returns null, not a distant false match", () => {
  const { bodies, spatialIndex, primitiveToBodyId } = setupFor([closedRect(0, 0, 10, 10)]);
  const result = findAdjacentBody([10000, 10000, 10010, 10010], bodies, primitiveToBodyId, spatialIndex);
  assert.equal(result.nearestBodyId, null);
  assert.equal(result.distance, null);
});

test("Lane C: a caller-supplied maxDistance is honored (a body just past it is excluded)", () => {
  const { bodies, spatialIndex, primitiveToBodyId } = setupFor([closedRect(0, 0, 10, 10)]);
  const result = findAdjacentBody([16, 2, 26, 8], bodies, primitiveToBodyId, spatialIndex, { maxDistance: 5, searchPad: 20 });
  assert.equal(result.nearestBodyId, null, "the real gap here is 6px, just over the 5px cap");
});

test("Lane C: buildPrimitiveToBodyMap covers every primitive in every body exactly once", () => {
  const { bodies, primitiveToBodyId } = setupFor([closedRect(0, 0, 10, 10), closedRect(100, 0, 10, 10)]);
  for (const body of bodies) for (const pid of body.primitiveIds) assert.equal(primitiveToBodyId.get(pid), body.id);
});

test("proposeTagSearchRegionBody: a real symbol drawn near the tag (outside the tag's own bbox) is captured, with the body's own bbox never equal to the tag or region", () => {
  const { idx, spatialIndex } = setupFor([closedRect(20, 30, 10, 10)]); // the "symbol," 20..30 x, 30..40 y
  const tagBbox: [number, number, number, number] = [0, 0, 10, 10]; // the tag sits well away from the symbol
  const result = proposeTagSearchRegionBody(tagBbox, idx, spatialIndex, { pad: 30 });
  assert.ok(result, "the symbol lies within the padded region");
  assert.deepEqual([result!.x0, result!.y0, result!.x1, result!.y1], [20, 30, 30, 40], "the proposal's own bbox is the real symbol's own extent");
  assert.notDeepEqual([result!.x0, result!.y0, result!.x1, result!.y1], tagBbox, "never the tag's own bbox (requirement 4)");
  assert.equal(result!.primitiveIds.length, 4, "all 4 rect edges");
});

test("proposeTagSearchRegionBody: nothing within the padded region returns null, never a degenerate proposal shaped like the tag or the search rectangle", () => {
  const { idx, spatialIndex } = setupFor([closedRect(10000, 10000, 10, 10)]);
  const result = proposeTagSearchRegionBody([0, 0, 10, 10], idx, spatialIndex, { pad: 30 });
  assert.equal(result, null);
});

test("proposeTagSearchRegionBody: a primitive that only PARTIALLY overlaps the padded region (grazes its edge from outside) is excluded -- full containment only, the same broad-phase-then-filter convention legendReferenceBank.ts already uses", () => {
  const { idx, spatialIndex } = setupFor([
    closedRect(20, 30, 10, 10), // fully inside a pad=30 region around [0,0,10,10] -- region is [-30,-30,40,40]
    [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [35, 0, 60, 0]]], // a line starting just inside the region's right edge (x=35) and extending well past it (x=60) -- only PARTIALLY inside
  ]);
  const result = proposeTagSearchRegionBody([0, 0, 10, 10], idx, spatialIndex, { pad: 30 });
  assert.ok(result);
  assert.equal(result!.primitiveIds.length, 4, "only the fully-contained rect's 4 edges -- the partially-overlapping line is excluded");
  assert.equal(result!.x1, 30, "the proposal's own bbox does not extend to the excluded line's own x1=60");
});

test("proposeTagSearchRegionBody: `pad` is a real, tunable knob -- a larger pad reaches a symbol a smaller one misses", () => {
  const { idx, spatialIndex } = setupFor([closedRect(50, 0, 10, 10)]);
  const tagBbox: [number, number, number, number] = [0, 0, 10, 10];
  const near = proposeTagSearchRegionBody(tagBbox, idx, spatialIndex, { pad: 20 });
  const far = proposeTagSearchRegionBody(tagBbox, idx, spatialIndex, { pad: 60 });
  assert.equal(near, null, "the symbol at x=50..60 lies outside a pad=20 region (reaches only to x=30)");
  assert.ok(far, "the same symbol lies inside a pad=60 region");
});

test("proposeTagSearchRegionBody: the disclosed default pad (80px, calibrated against real Cherry Point CD-1 data) is used when no pad is supplied", () => {
  const { idx, spatialIndex } = setupFor([closedRect(50, 0, 10, 10)]);
  const result = proposeTagSearchRegionBody([0, 0, 10, 10], idx, spatialIndex);
  assert.ok(result, "x=50..60 lies within the default 80px pad (region reaches to x=90)");
});
