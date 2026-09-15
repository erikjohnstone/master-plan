// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 2 §7 — "spatial index
// entries", a uniform grid broad-phase over VectorSceneIndex primitives.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { buildSpatialIndex, querySpatialIndex } from "../src/lib/vectorSceneSpatialIndex.ts";

const OPS = {
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];

function indexFor(ops: Op[]) {
  const geo = extractVectorGeometry(opList(ops), ID, OPS);
  return buildVectorSceneIndex(geo);
}

test("spatial index: a query rectangle finds a primitive whose bbox it overlaps, and misses one far away", () => {
  const idx = indexFor([line(0, 0, 10, 0), line(1000, 1000, 1010, 1000)]);
  const sp = buildSpatialIndex(idx, { cellSize: 32 });
  const hits = querySpatialIndex(sp, -5, -5, 15, 5);
  assert.deepEqual(hits, [0]);
});

test("spatial index: a primitive spanning several cells is found from a query touching any one of them", () => {
  const idx = indexFor([line(0, 0, 100, 0)]);   // spans cells 0..3 at cellSize 32
  const sp = buildSpatialIndex(idx, { cellSize: 32 });
  assert.deepEqual(querySpatialIndex(sp, 0, -1, 5, 1), [0], "found from the first cell");
  assert.deepEqual(querySpatialIndex(sp, 95, -1, 100, 1), [0], "found from the last cell");
});

test("spatial index: results are deduplicated and sorted, even when a query spans many overlapping cells", () => {
  const idx = indexFor([line(0, 0, 200, 0)]);
  const sp = buildSpatialIndex(idx, { cellSize: 16 });
  const hits = querySpatialIndex(sp, -10, -10, 210, 10);
  assert.deepEqual(hits, [0]);
});

test("spatial index: bounds cover every primitive's bbox", () => {
  const idx = indexFor([line(0, 0, 10, 0), line(-5, 20, 5, 25)]);
  const sp = buildSpatialIndex(idx);
  assert.deepEqual(sp.bounds, { x0: -5, y0: 0, x1: 10, y1: 25 });
});

test("spatial index: an empty index has null bounds and every query returns nothing", () => {
  const idx = indexFor([]);
  const sp = buildSpatialIndex(idx);
  assert.equal(sp.bounds, null);
  assert.deepEqual(querySpatialIndex(sp, 0, 0, 100, 100), []);
});

test("spatial index: a primitive-count cap breach reports incomplete, and every query on it returns nothing rather than a silent partial result", () => {
  const idx = indexFor([line(0, 0, 10, 0), line(20, 0, 30, 0)]);
  const sp = buildSpatialIndex(idx, { maxPrimitives: 1 });
  assert.equal(sp.incomplete, true);
  assert.match(sp.incompleteReason!, /exceeds the 1-primitive spatial-index cap/);
  assert.deepEqual(querySpatialIndex(sp, -100, -100, 100, 100), []);
});
