// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 Lane A — first slice:
// grouping Form XObject invocations by a content signature computed from
// their own LOCAL (placement-inverted) geometry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { computeFormContentSignatures } from "../src/lib/candidateBodyLaneA.ts";

const OPS = {
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
  paintFormXObjectBegin: 33, paintFormXObjectEnd: 34,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];
const formBegin = (matrix: number[]): Op => [OPS.paintFormXObjectBegin, [matrix, null]];
const formEnd = (): Op => [OPS.paintFormXObjectEnd, null];

// One reusable "L" shape's own local content: a 40-unit leg and a 15-unit
// leg meeting at a corner, always drawn identically inside the form.
const L_LOCAL: Op[] = [line(0, 0, 40, 0), line(40, 0, 40, 15)];

function signaturesFor(ops: Op[]) {
  const geo = extractVectorGeometry(opList(ops), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  return computeFormContentSignatures(idx, geo.formInvocations ?? []);
}

test("Lane A: page-level ink (no Form XObject at all) produces no invocation signatures", () => {
  const r = signaturesFor([line(0, 0, 10, 0)]);
  assert.deepEqual(r.invocations, []);
  assert.deepEqual(r.repeatedGroups, []);
});

test("Lane A: two placements of the SAME reusable content at different positions AND rotations sign identically", () => {
  const r = signaturesFor([
    formBegin([1, 0, 0, 1, 100, 100]), ...L_LOCAL, formEnd(),   // translated only
    formBegin([0, 1, -1, 0, 500, 500]), ...L_LOCAL, formEnd(),  // rotated 90 + translated
  ]);
  assert.equal(r.invocations.length, 2);
  assert.ok(r.invocations.every((i) => i.signature));
  assert.equal(r.invocations[0].signature!.hash, r.invocations[1].signature!.hash);
  assert.equal(r.repeatedGroups.length, 1);
  assert.deepEqual(r.repeatedGroups[0].sort(), r.invocations.map((i) => i.invocationId).sort());
});

test("Lane A: two placements of a GENUINELY DIFFERENT shape sign differently", () => {
  const OTHER: Op[] = [line(0, 0, 10, 0), line(10, 0, 10, 10)]; // equal-leg corner, not the L's 40/15 asymmetry
  const r = signaturesFor([
    formBegin([1, 0, 0, 1, 0, 0]), ...L_LOCAL, formEnd(),
    formBegin([1, 0, 0, 1, 200, 0]), ...OTHER, formEnd(),
  ]);
  assert.notEqual(r.invocations[0].signature!.hash, r.invocations[1].signature!.hash);
  assert.deepEqual(r.repeatedGroups, [], "no repeated group when nothing actually repeats");
});

test("Lane A: an invocation with no vector content (image-only or empty form) reports a null signature, not a crash", () => {
  const r = signaturesFor([formBegin([1, 0, 0, 1, 0, 0]), formEnd(), line(0, 0, 10, 0)]);
  assert.equal(r.invocations.length, 1);
  assert.equal(r.invocations[0].signature, null);
  assert.deepEqual(r.invocations[0].primitiveIds, []);
});

test("Lane A: a nested invocation is signed independently of its parent", () => {
  const r = signaturesFor([
    formBegin([1, 0, 0, 1, 0, 0]),
    line(0, 0, 5, 0),
    formBegin([1, 0, 0, 1, 50, 50]),
    ...L_LOCAL,
    formEnd(),
    formEnd(),
  ]);
  assert.equal(r.invocations.length, 2);
  const outer = r.invocations.find((i) => i.depth === 1)!;
  const inner = r.invocations.find((i) => i.depth === 2)!;
  assert.ok(outer.signature && inner.signature);
  assert.notEqual(outer.signature!.hash, inner.signature!.hash);
});

test("Lane A: a primitive-count cap breach reports incomplete instead of a silent partial pass", () => {
  const geo = extractVectorGeometry(opList([formBegin([1, 0, 0, 1, 0, 0]), ...L_LOCAL, formEnd()]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const r = computeFormContentSignatures(idx, geo.formInvocations ?? [], { maxPrimitives: 1 });
  assert.equal(r.incomplete, true);
  assert.deepEqual(r.invocations, []);
  assert.match(r.incompleteReason!, /exceeds the 1-primitive Lane A cap/);
});
