// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 Lane B — subpath/
// connected-component candidate-body proposal. First slice: union across
// low-degree junctions, split at t/x/multi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { computeVectorSceneJunctions } from "../src/lib/vectorSceneRelations.ts";
import { proposeCandidateBodiesLaneB } from "../src/lib/candidateBodyLaneB.ts";

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

function bodiesFor(ops: Op[]) {
  const geo = extractVectorGeometry(opList(ops), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  return proposeCandidateBodiesLaneB(idx, junctions).bodies;
}

test("Lane B: a single closed rectangle (a real closed figure) is one component", () => {
  const bodies = bodiesFor([closedRect(0, 0, 10, 10)]);
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].primitiveIds.length, 4, "all 4 rect edges belong to one subpath");
});

test("Lane B: two segments meeting end-to-end at a corner (degree 2) merge into one component", () => {
  const bodies = bodiesFor([line(0, 0, 10, 0), line(10, 0, 10, 10)]);
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].primitiveIds, [0, 1]);
});

test("Lane B: a T-junction (degree 3) SPLITS every member — this slice treats a junction as atomically continue-or-split, not per-pair", () => {
  // a straight run (0,0)->(20,0) through (10,0), plus a third segment
  // branching off (10,0) — the classic carrier-plus-inline-tee shape.
  // A finer-grained version might recognize the two collinear run
  // segments should still merge while only the branch splits off — this
  // slice does not (disclosed design limitation, see the module's own
  // header comment), so all three end up as separate singletons.
  const bodies = bodiesFor([line(0, 0, 10, 0), line(10, 0, 20, 0), line(10, 0, 10, 10)]);
  assert.equal(bodies.length, 3, "the T-junction splits ALL of its members, not just the branch");
  assert.ok(bodies.every((b) => b.primitiveIds.length === 1));
});

test("Lane B: an X-junction (degree 4) splits into four separate components", () => {
  const bodies = bodiesFor([
    line(0, 0, 10, 10), line(20, 0, 10, 10), line(10, 10, 0, 20), line(10, 10, 20, 20),
  ]);
  assert.equal(bodies.length, 4, "each arm of the crossing is its own component");
});

test("Lane B: two unrelated, non-touching figures never merge", () => {
  const bodies = bodiesFor([line(0, 0, 10, 0), line(1000, 1000, 1010, 1000)]);
  assert.equal(bodies.length, 2);
});

test("Lane B: bbox covers every member primitive", () => {
  const bodies = bodiesFor([line(0, 0, 10, 0), line(10, 0, 10, 10)]);
  assert.equal(bodies.length, 1);
  assert.deepEqual([bodies[0].x0, bodies[0].y0, bodies[0].x1, bodies[0].y1], [0, 0, 10, 10]);
});

test("Lane B: an empty sheet proposes nothing", () => {
  assert.deepEqual(bodiesFor([]), []);
});

test("Lane B: a primitive-count cap breach reports incomplete instead of a silent partial pass", () => {
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0), line(10, 0, 20, 0)]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const r = proposeCandidateBodiesLaneB(idx, junctions, { maxPrimitives: 1 });
  assert.equal(r.incomplete, true);
  assert.deepEqual(r.bodies, []);
  assert.match(r.incompleteReason!, /exceeds the 1-primitive Lane B cap/);
});
