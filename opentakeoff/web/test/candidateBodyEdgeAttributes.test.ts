// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 Lane D — edge/relation
// attributes, restating the pairs junctions/pair-relations already found.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { computeVectorSceneJunctions, computeVectorScenePairRelations } from "../src/lib/vectorSceneRelations.ts";
import { computePrimitiveGraphAttributes } from "../src/lib/candidateBodyLaneD.ts";
import { computeEdgeAttributes } from "../src/lib/candidateBodyEdgeAttributes.ts";

const OPS = {
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];

function edgesFor(ops: Op[]) {
  const geo = extractVectorGeometry(opList(ops), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const pairRelations = computeVectorScenePairRelations(idx);
  const { attributes, referenceLength } = computePrimitiveGraphAttributes(idx, junctions);
  return computeEdgeAttributes(idx, junctions, pairRelations, attributes, referenceLength);
}

test("edge attributes: two segments meeting at a corner are touching, with the real junction kind, and no gap distance", () => {
  const edges = edgesFor([line(0, 0, 10, 0), line(10, 0, 10, 10)]);
  const e = edges.find((e) => e.aId === 0 && e.bId === 1);
  assert.ok(e);
  assert.equal(e!.touching, true);
  assert.equal(e!.junctionKind, "corner");
  assert.equal(e!.gapDistance, null);
  assert.equal(e!.relativeAngleDeg, 90);
});

test("edge attributes: two parallel, non-touching segments report parallel=true with a real gap distance", () => {
  const edges = edgesFor([line(0, 0, 10, 0), line(0, 5, 10, 5)]);
  const e = edges.find((e) => e.aId === 0 && e.bId === 1);
  assert.ok(e);
  assert.equal(e!.touching, false);
  assert.equal(e!.parallel, true);
  assert.equal(e!.gapDistance, 5);
  assert.equal(e!.relativeAngleDeg, 0);
});

test("edge attributes: collinear pairs are also reported as parallel (collinear implies parallel)", () => {
  const edges = edgesFor([line(0, 0, 10, 0), line(20, 0, 30, 0)]);
  const e = edges.find((e) => e.aId === 0 && e.bId === 1);
  assert.ok(e);
  assert.equal(e!.parallel, true);
  assert.equal(e!.collinear, true);
});

test("edge attributes: relative length is the longer-over-shorter ratio, order-independent", () => {
  const edges = edgesFor([line(0, 0, 10, 0), line(0, 5, 40, 5)]); // lengths 10 and 40, parallel
  const e = edges.find((e) => e.aId === 0 && e.bId === 1);
  assert.ok(e);
  assert.equal(e!.relativeLength, 4);
});

test("edge attributes: normalized displacement points from a's midpoint to b's, scaled by the reference length", () => {
  const edges = edgesFor([line(0, 0, 10, 0), line(0, 20, 10, 20)]); // both length 10, midpoints (5,0) and (5,20)
  const e = edges.find((e) => e.aId === 0 && e.bId === 1);
  assert.ok(e);
  // reference length = 10 (both segments the same length), displacement (0,20)/10 = (0,2)
  assert.deepEqual(e!.normalizedDisplacement, [0, 2]);
});

test("edge attributes: two unrelated, non-parallel, non-touching, oblique segments are never included at all", () => {
  const edges = edgesFor([line(0, 0, 10, 0), line(1000, 1000, 1010, 1013)]);
  assert.equal(edges.length, 0, "no junction and no pair-relation flagged them, so nothing was built for this pair");
});

test("edge attributes: an empty sheet produces no edges", () => {
  const edges = edgesFor([]);
  assert.deepEqual(edges, []);
});
