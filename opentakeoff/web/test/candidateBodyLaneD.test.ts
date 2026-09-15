// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 Lane D — per-primitive
// node attributes, the first building block of the attributed graph.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry, PRIM_LINE, PRIM_BEZIER } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { computeVectorSceneJunctions } from "../src/lib/vectorSceneRelations.ts";
import { computePrimitiveGraphAttributes } from "../src/lib/candidateBodyLaneD.ts";

const OPS = {
  save: 1, restore: 2, transform: 3, setLineWidth: 4, setLineCap: 5, setLineJoin: 6, setDash: 7,
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];
const closedRect = (x: number, y: number, w: number, h: number): Op =>
  [OPS.constructPath, [[OPS.rectangle], [x, y, w, h]]];
const curve = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.curveTo], [x0, y0, x1, y1, x2, y2, x3, y3]]];

function attributesFor(ops: Op[]) {
  const geo = extractVectorGeometry(opList(ops), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  return computePrimitiveGraphAttributes(idx, junctions);
}

test("Lane D: type, length, and curvature read straight from the primitive", () => {
  const r = attributesFor([line(0, 0, 10, 0), curve(0, 5, 3, 8, 7, 8, 10, 5)]);
  assert.equal(r.attributes[0].type, PRIM_LINE);
  assert.equal(r.attributes[0].length, 10);
  assert.equal(r.attributes[0].curved, false);
  // the curve is tessellated into several chords, all PRIM_BEZIER/curved
  const curveAttrs = r.attributes.slice(1);
  assert.ok(curveAttrs.every((a) => a.type === PRIM_BEZIER && a.curved === true));
});

test("Lane D: orientation is mod 180 — a segment and its reverse read identically", () => {
  const r = attributesFor([line(0, 0, 10, 0), line(10, 0, 0, 0)]);
  assert.equal(r.attributes[0].orientationDeg, r.attributes[1].orientationDeg);
});

test("Lane D: normalized length is 1 for a primitive at the sheet's own median length", () => {
  const r = attributesFor([line(0, 0, 10, 0), line(0, 5, 10, 5), line(0, 10, 10, 10)]);
  assert.ok(r.attributes.every((a) => Math.abs(a.normalizedLength - 1) < 1e-9));
  assert.equal(r.referenceLength, 10);
});

test("Lane D: normalized length scales relative to a mixed-length sheet's median", () => {
  const r = attributesFor([line(0, 0, 5, 0), line(0, 5, 10, 5), line(0, 10, 20, 10)]);
  // lengths 5, 10, 20 -> median 10
  assert.equal(r.referenceLength, 10);
  assert.equal(r.attributes[0].normalizedLength, 0.5);
  assert.equal(r.attributes[1].normalizedLength, 1);
  assert.equal(r.attributes[2].normalizedLength, 2);
});

test("Lane D: width/style/closed passthrough from the owning subpath", () => {
  const r = attributesFor([
    [OPS.setDash, [[4, 2], 0]],
    [OPS.setLineCap, [1]],
    [OPS.setLineJoin, [2]],
    closedRect(0, 0, 10, 10),
  ]);
  assert.ok(r.attributes.every((a) => a.dashed === true && a.lineCap === 1 && a.lineJoin === 2 && a.closed === true));
});

test("Lane D: local degree at each endpoint matches the real junction size there", () => {
  // a T-junction at (10,0): three primitives meet there
  const r = attributesFor([line(0, 0, 10, 0), line(10, 0, 20, 0), line(10, 0, 10, 10)]);
  assert.equal(r.attributes[0].degreeB, 3, "line0's end B is the T-junction");
  assert.equal(r.attributes[0].degreeA, 1, "line0's end A is dangling");
  assert.equal(r.attributes[1].degreeA, 3, "line1's end A is the same T-junction");
});

test("Lane D: an empty sheet computes nothing, reference length defaults to 1", () => {
  const r = attributesFor([]);
  assert.deepEqual(r.attributes, []);
  assert.equal(r.referenceLength, 1);
});

test("Lane D: a primitive-count cap breach reports incomplete instead of a silent partial pass", () => {
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0), line(10, 0, 20, 0)]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const r = computePrimitiveGraphAttributes(idx, junctions, { maxPrimitives: 1 });
  assert.equal(r.incomplete, true);
  assert.deepEqual(r.attributes, []);
  assert.match(r.incompleteReason!, /exceeds the 1-primitive Lane D cap/);
});
