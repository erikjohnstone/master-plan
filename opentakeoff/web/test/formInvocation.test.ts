// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 Lane A — Form XObject
// INVOCATION identity, the missing piece slice 3 (Phase 2) named but did
// not build: formDepth alone cannot tell two SEPARATE invocations at the
// same nesting depth apart from each other. formInvocationId is a
// monotonically increasing id, unique per Do-invoked paintFormXObjectBegin
// call (0 = page level, never reused). formInvocations records each
// invocation's own id, page-space placement transform (so a downstream
// module can invert it to recover LOCAL coordinates for a content
// signature — the goal document's own explicit fallback when object
// identity itself is unavailable, confirmed unavailable in Phase 2 slice 3),
// and nesting depth.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";

const OPS = {
  save: 1, restore: 2, transform: 3, setLineWidth: 4,
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
  paintFormXObjectBegin: 33, paintFormXObjectEnd: 34,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];
const formBegin = (matrix: number[] = ID): Op => [OPS.paintFormXObjectBegin, [matrix, null]];
const formEnd = (): Op => [OPS.paintFormXObjectEnd, null];

test("form invocation: page-level ink reads invocation id 0", () => {
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0)]), ID, OPS);
  assert.equal(geo.subpaths![0].formInvocationId, 0);
});

test("form invocation: two SEPARATE invocations at the same depth get DIFFERENT ids — formDepth alone cannot tell them apart", () => {
  const geo = extractVectorGeometry(opList([
    formBegin(), line(0, 0, 10, 0), formEnd(),   // invocation A, depth 1
    formBegin(), line(0, 1, 10, 1), formEnd(),   // invocation B, also depth 1
  ]), ID, OPS);
  const [a, b] = geo.subpaths!;
  assert.equal(a.formDepth, 1);
  assert.equal(b.formDepth, 1);
  assert.notEqual(a.formInvocationId, b.formInvocationId, "same depth, but must be distinguishable invocations");
  assert.notEqual(a.formInvocationId, 0);
  assert.notEqual(b.formInvocationId, 0);
});

test("form invocation: ids are never reused, even for a nested invocation returning to a shallower one already seen", () => {
  const geo = extractVectorGeometry(opList([
    formBegin(),
    line(0, 0, 10, 0),      // invocation 1, depth 1
    formBegin(),
    line(0, 1, 10, 1),      // invocation 2, depth 2
    formEnd(),
    line(0, 2, 10, 2),      // BACK to invocation 1's own id, depth 1
    formEnd(),
  ]), ID, OPS);
  const [s0, s1, s2] = geo.subpaths!;
  assert.equal(s0.formInvocationId, s2.formInvocationId, "returning to the same invocation after a nested one restores its own id");
  assert.notEqual(s0.formInvocationId, s1.formInvocationId);
});

test("form invocation: each recorded invocation carries its own page-space placement transform and depth", () => {
  const placement = [2, 0, 0, 2, 100, 50]; // scale 2x, translate (100,50)
  const geo = extractVectorGeometry(opList([
    formBegin(placement),
    line(0, 0, 10, 0),
    formEnd(),
  ]), ID, OPS);
  assert.equal(geo.formInvocations!.length, 1);
  const inv = geo.formInvocations![0];
  assert.equal(inv.id, geo.subpaths![0].formInvocationId);
  assert.equal(inv.depth, 1);
  assert.deepEqual(inv.transform, placement, "identity CTM composed with the form's own placement matrix is just that matrix");
});

test("form invocation: an unbalanced End never underflows back to a negative/garbage id", () => {
  const geo = extractVectorGeometry(opList([
    formEnd(),              // stray End, no matching Begin
    line(0, 0, 10, 0),
  ]), ID, OPS);
  assert.equal(geo.subpaths![0].formInvocationId, 0);
});
