// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 2 — Form XObject nesting depth,
// tracked as a plain counter rather than object identity (pdf.js's own
// paintFormXObjectBegin exposes only [matrix, bbox|null] — no id/name — so
// per-invocation identity is deliberately deferred to a content-signature-hash
// slice; depth alone already separates page-level ink from ink drawn inside a
// reusable Form XObject block, which is what this slice is for). Recorded per
// SUBPATH, like fillLum/dashed: it cannot change mid-path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";

const OPS = {
  save: 1, restore: 2, transform: 3, setLineWidth: 4, setDash: 6,
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
  endPath: 20, clip: 21, eoClip: 22, fill: 23, eoFill: 24, stroke: 25,
  paintFormXObjectBegin: 33, paintFormXObjectEnd: 34,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];
const formBegin = (): Op => [OPS.paintFormXObjectBegin, [ID, null]];
const formEnd = (): Op => [OPS.paintFormXObjectEnd, null];

test("form depth: ink drawn at page level, before any form, reads 0", () => {
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0)]), ID, OPS);
  assert.equal(geo.subpaths!.length, 1);
  assert.equal(geo.subpaths![0].formDepth, 0);
});

test("form depth: ink drawn inside one Form XObject reads 1, and page-level ink after End reads 0 again", () => {
  const geo = extractVectorGeometry(opList([
    line(0, 0, 10, 0),      // depth 0, before the form
    formBegin(),
    line(0, 1, 10, 1),      // depth 1, inside the form
    formEnd(),
    line(0, 2, 10, 2),      // depth 0, after the form ends
  ]), ID, OPS);
  assert.deepEqual(geo.subpaths!.map((sp) => sp.formDepth), [0, 1, 0]);
});

test("form depth: a form invoked from within another form nests to 2, and unwinds one level at a time", () => {
  const geo = extractVectorGeometry(opList([
    formBegin(),
    line(0, 0, 10, 0),      // depth 1
    formBegin(),
    line(0, 1, 10, 1),      // depth 2
    formEnd(),
    line(0, 2, 10, 2),      // back to depth 1
    formEnd(),
    line(0, 3, 10, 3),      // back to depth 0
  ]), ID, OPS);
  assert.deepEqual(geo.subpaths!.map((sp) => sp.formDepth), [1, 2, 1, 0]);
});

test("form depth: an unbalanced End (more Ends than Begins) never goes negative", () => {
  const geo = extractVectorGeometry(opList([
    formEnd(),              // stray End, no matching Begin — must not underflow
    line(0, 0, 10, 0),
  ]), ID, OPS);
  assert.equal(geo.subpaths![0].formDepth, 0);
});

test("form depth is independent of the dash/save-restore graphics state it sits alongside", () => {
  const geo = extractVectorGeometry(opList([
    [OPS.setDash, [[4, 2], 0]],
    formBegin(),
    [OPS.save, null],
    line(0, 0, 10, 0),      // depth 1, dashed, inside a save
    [OPS.restore, null],
    formEnd(),
    line(0, 1, 10, 1),      // depth 0, still dashed (save/restore never touched it)
  ]), ID, OPS);
  assert.deepEqual(geo.subpaths!.map((sp) => sp.formDepth), [1, 0]);
  assert.deepEqual(geo.subpaths!.map((sp) => sp.dashed), [true, true]);
});
