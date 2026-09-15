// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 2 §7 — endpoint clustering
// and junction-degree classification, the first concrete piece of the
// "intersections, T-junctions, X-junctions, endpoints" requirement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { computeVectorSceneJunctions, computeVectorScenePairRelations } from "../src/lib/vectorSceneRelations.ts";

const OPS = {
  save: 1, restore: 2, transform: 3, setLineWidth: 4,
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
  endPath: 20, clip: 21, eoClip: 22, fill: 23, eoFill: 24, stroke: 25,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];
const clipRect = (x: number, y: number, w: number, h: number): Op[] => [
  [OPS.constructPath, [[OPS.rectangle], [x, y, w, h]]],
  [OPS.eoClip, null],
  [OPS.endPath, null],
];

function junctionsFor(ops: Op[]) {
  const geo = extractVectorGeometry(opList(ops), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  return computeVectorSceneJunctions(idx).junctions;
}

function pairRelationsFor(ops: Op[], opts?: Parameters<typeof computeVectorScenePairRelations>[1]) {
  const geo = extractVectorGeometry(opList(ops), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  return computeVectorScenePairRelations(idx, opts);
}

test("junctions: a lone segment's two ends are both dangling — nothing else touches them", () => {
  const js = junctionsFor([line(0, 0, 10, 0)]);
  assert.equal(js.length, 2);
  assert.ok(js.every((j) => j.kind === "dangling"));
});

test("junctions: two collinear segments meeting end-to-end are a pass-through, not a corner", () => {
  const js = junctionsFor([line(0, 0, 10, 0), line(10, 0, 20, 0)]);
  const shared = js.find((j) => j.members.length === 2);
  assert.ok(shared, "the shared endpoint at (10,0) clusters into one junction");
  assert.equal(shared!.kind, "pass-through");
});

test("junctions: two segments meeting at a right angle are a corner", () => {
  const js = junctionsFor([line(0, 0, 10, 0), line(10, 0, 10, 10)]);
  const shared = js.find((j) => j.members.length === 2);
  assert.ok(shared);
  assert.equal(shared!.kind, "corner");
});

test("junctions: three segments meeting at one point are a T-junction", () => {
  const js = junctionsFor([line(0, 0, 10, 0), line(10, 0, 20, 0), line(10, 0, 10, 10)]);
  const t = js.find((j) => j.members.length === 3);
  assert.ok(t, "all three ends at (10,0) cluster into one junction");
  assert.equal(t!.kind, "t");
});

test("junctions: four segments meeting at one point are an X-junction", () => {
  const js = junctionsFor([
    line(0, 0, 10, 10), line(20, 0, 10, 10), line(10, 10, 0, 20), line(10, 10, 20, 20),
  ]);
  const x = js.find((j) => j.members.length === 4);
  assert.ok(x);
  assert.equal(x!.kind, "x");
});

test("junctions: endpoints within JUNCTION_SNAP_TOL merge into one junction even when not pixel-exact", () => {
  const js = junctionsFor([line(0, 0, 10, 0), line(10.3, 0.2, 20, 0)]);
  const shared = js.find((j) => j.members.length === 2);
  assert.ok(shared, "a near-but-not-exact coincidence still clusters");
});

test("junctions: clip-only primitives never contribute endpoints — a clip rectangle's own corners are not drafted joints", () => {
  const js = junctionsFor([...clipRect(0, 0, 10, 10), line(0, 0, 5, 5)]);
  // only the one real stroked segment's two ends should appear — nothing
  // from the clip rectangle's four corners
  const totalMembers = js.reduce((s, j) => s + j.members.length, 0);
  assert.equal(totalMembers, 2);
});

test("junctions: a primitive-count cap breach reports incomplete instead of a silent partial pass", () => {
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0), line(10, 0, 20, 0)]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const result = computeVectorSceneJunctions(idx, { maxPrimitives: 1 });
  assert.equal(result.incomplete, true);
  assert.deepEqual(result.junctions, []);
  assert.match(result.incompleteReason!, /exceeds the 1-primitive relations cap/);
});

test("pair relations: two segments on the exact same infinite line are both parallel and collinear", () => {
  const r = pairRelationsFor([line(0, 0, 10, 0), line(20, 0, 30, 0)]);
  assert.equal(r.parallelPairs.length, 1);
  assert.deepEqual(r.parallelPairs[0], { aId: 0, bId: 1, angleDeg: 0 });
  assert.equal(r.collinearPairs.length, 1);
  assert.equal(r.collinearPairs[0].offset, 0);
});

test("pair relations: two parallel segments offset from each other are parallel but NOT collinear", () => {
  const r = pairRelationsFor([line(0, 0, 10, 0), line(0, 5, 10, 5)]);
  assert.equal(r.parallelPairs.length, 1);
  assert.equal(r.collinearPairs.length, 0, "5px apart on parallel lines is not the same line");
});

test("pair relations: a right-angle pair is perpendicular, not parallel", () => {
  const r = pairRelationsFor([line(0, 0, 10, 0), line(0, 0, 0, 10)]);
  assert.equal(r.parallelPairs.length, 0);
  assert.equal(r.perpendicularPairs.length, 1);
  assert.deepEqual(r.perpendicularPairs[0], { aId: 0, bId: 1, angleDeg: 90 });
});

test("pair relations: an oblique pair (neither near-0 nor near-90) is neither parallel nor perpendicular", () => {
  const r = pairRelationsFor([line(0, 0, 10, 0), line(0, 0, 10, 10)]);   // 45 degrees apart
  assert.equal(r.parallelPairs.length, 0);
  assert.equal(r.perpendicularPairs.length, 0);
});

test("pair relations: orientation wraps correctly across the 0/180 boundary", () => {
  // one segment at ~179.5 degrees, one at ~0.5 degrees — 1 degree apart in
  // WRAPPED orientation space (not the raw 179 degrees a naive diff would
  // compute), so both land in adjacent buckets either side of the wrap.
  const r = pairRelationsFor([line(10, 0, 0, 0.0873), line(0, 5, 10, 5.0873)]);
  assert.equal(r.parallelPairs.length, 1, "must not miss a near-parallel pair that straddles the wrap");
});

test("pair relations: clip-only primitives are excluded, same as junctions", () => {
  const r = pairRelationsFor([...clipRect(0, 0, 10, 10), line(0, 0, 10, 0), line(0, 5, 10, 5)]);
  // the clip rectangle has two horizontal edges of its own; if they leaked
  // in, more than one parallel pair would show up
  assert.equal(r.parallelPairs.length, 1);
});

test("pair relations: a primitive-count cap breach reports incomplete with no pairs computed", () => {
  const r = pairRelationsFor([line(0, 0, 10, 0), line(20, 0, 30, 0)], { maxPrimitives: 1 });
  assert.equal(r.incomplete, true);
  assert.deepEqual(r.parallelPairs, []);
  assert.deepEqual(r.collinearPairs, []);
  assert.match(r.incompleteReason!, /exceeds the 1-primitive pair-relations cap/);
});

test("pair relations: an oversized orientation bucket is skipped and disclosed, not exhaustively paired", () => {
  const ops: Op[] = [];
  for (let i = 0; i < 5; i++) ops.push(line(0, i * 2, 10, i * 2));   // 5 parallel horizontal strokes
  const r = pairRelationsFor(ops, { maxBucket: 3 });
  assert.equal(r.incomplete, true);
  assert.deepEqual(r.parallelPairs, [], "the oversized bucket was skipped, not partially paired");
  assert.match(r.incompleteReason!, /exceeded the 3-primitive pair cap/);
});
