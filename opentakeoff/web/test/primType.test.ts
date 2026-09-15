// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 2 — primitive-type provenance.
// extractVectorGeometry already classifies each segment's PAINT facts (SEG_*
// bits in meta) but never recorded which CONTENT-STREAM OPERATOR drew it: a
// rectangle's four edges and a freeform lineTo both land in `segs` as four
// plain coordinates, indistinguishable once emitted. `primType` is that
// missing provenance — one byte per segment, in its own array (meta's two
// nibbles are already fully committed, so a new fact needs a new array, not
// a wider one, to stay additive for every existing consumer).
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry, PRIM_LINE, PRIM_RECT_EDGE, PRIM_BEZIER, SEG_CURVE } from "../src/lib/oneclick.ts";

const OPS = {
  save: 1, restore: 2, transform: 3, setLineWidth: 4,
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
  endPath: 20, clip: 21, eoClip: 22, fill: 23, eoFill: 24, stroke: 25,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });

test("primType: a freeform line reads PRIM_LINE", () => {
  const geo = extractVectorGeometry(opList([
    [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [0, 0, 10, 0]]],
  ]), ID, OPS);
  assert.ok(geo.primType, "extraction always emits the channel");
  assert.equal(geo.primType!.length, geo.meta.length, "one byte per segment, the same shape as meta");
  assert.deepEqual([...geo.primType!], [PRIM_LINE]);
});

test("primType: a closePath edge is PRIM_LINE too — geometrically it's the same straight chord a lineTo would draw, not a fifth category", () => {
  const geo = extractVectorGeometry(opList([
    // triangle: two explicit lineTos plus one implicit closing edge
    [OPS.constructPath, [[OPS.moveTo, OPS.lineTo, OPS.lineTo, OPS.closePath], [0, 0, 10, 0, 10, 10]]],
  ]), ID, OPS);
  assert.deepEqual([...geo.primType!], [PRIM_LINE, PRIM_LINE, PRIM_LINE]);
});

test("primType: OPS.rectangle's four edges all read PRIM_RECT_EDGE", () => {
  const geo = extractVectorGeometry(opList([
    [OPS.constructPath, [[OPS.rectangle], [0, 0, 10, 5]]],
  ]), ID, OPS);
  assert.equal(geo.segs.length / 4, 4, "a rectangle op emits its 4 edges");
  assert.deepEqual([...geo.primType!], [PRIM_RECT_EDGE, PRIM_RECT_EDGE, PRIM_RECT_EDGE, PRIM_RECT_EDGE]);
});

test("primType: a curveTo tessellation chord reads PRIM_BEZIER, and still carries meta's own SEG_CURVE bit — the two facts are independent, neither replaces the other", () => {
  const geo = extractVectorGeometry(opList([
    [OPS.constructPath, [[OPS.moveTo, OPS.curveTo], [0, 0, 2, 5, 5, 8, 10, 10]]],
  ]), ID, OPS);
  assert.ok(geo.primType!.length > 0);
  for (let i = 0; i < geo.primType!.length; i++) {
    assert.equal(geo.primType![i], PRIM_BEZIER);
    assert.ok((geo.meta[i] & SEG_CURVE) !== 0, "meta's own curve bit still fires independently of primType");
  }
});

test("primType: a mixed path (line, rect, curve) keeps every array the same length and order", () => {
  const geo = extractVectorGeometry(opList([
    [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [0, 0, 1, 0]]],
    [OPS.constructPath, [[OPS.rectangle], [5, 5, 2, 2]]],
    [OPS.constructPath, [[OPS.moveTo, OPS.curveTo], [0, 0, 1, 1, 2, 2, 3, 3]]],
  ]), ID, OPS);
  const n = geo.segs.length / 4;
  assert.equal(geo.primType!.length, n);
  assert.equal(geo.meta.length, n);
  assert.equal(geo.primType![0], PRIM_LINE);
  assert.deepEqual([...geo.primType!.slice(1, 5)], [PRIM_RECT_EDGE, PRIM_RECT_EDGE, PRIM_RECT_EDGE, PRIM_RECT_EDGE]);
  for (let i = 5; i < n; i++) assert.equal(geo.primType![i], PRIM_BEZIER);
});
