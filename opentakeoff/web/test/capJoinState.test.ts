// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 2 — line cap and line join,
// the last two of the goal's own named "graphics-state attributes available
// from pdf.js" list (CTM, line width, stroke/fill, luminance, dash pattern,
// cap, join, clip state — everything but cap/join was already tracked).
// Recorded per SUBPATH, exactly like dashed/fillLum: neither can change
// mid-path, so one value per figure is the right grain. PDF's initial state
// is butt cap (0) and miter join (0), so both default to 0 on an unstyled
// file at zero extra cost.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";

const OPS = {
  save: 1, restore: 2, transform: 3, setLineWidth: 4, setLineCap: 5, setLineJoin: 6, setDash: 7,
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
  endPath: 20, clip: 21, eoClip: 22, fill: 23, eoFill: 24, stroke: 25,
  paintFormXObjectBegin: 33, paintFormXObjectEnd: 34,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];
const setCap = (v: number): Op => [OPS.setLineCap, [v]];
const setJoin = (v: number): Op => [OPS.setLineJoin, [v]];

test("cap/join: a path drawn before any setLineCap/setLineJoin call reads butt (0) / miter (0) — PDF's initial state", () => {
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0)]), ID, OPS);
  assert.equal(geo.subpaths!.length, 1);
  assert.equal(geo.subpaths![0].lineCap, 0);
  assert.equal(geo.subpaths![0].lineJoin, 0);
});

test("cap/join: setLineCap/setLineJoin mark every subpath drawn after them, independently of each other", () => {
  const geo = extractVectorGeometry(opList([
    line(0, 0, 10, 0),      // butt/miter
    setCap(1),              // round cap
    line(0, 1, 10, 1),      // round cap, still miter join
    setJoin(2),             // bevel join
    line(0, 2, 10, 2),      // round cap, bevel join
  ]), ID, OPS);
  assert.deepEqual(geo.subpaths!.map((sp) => [sp.lineCap, sp.lineJoin]), [[0, 0], [1, 0], [1, 2]]);
});

test("cap/join is graphics state: save/restore and Form XObject begin/end both restore it, same as dash/line width/colour", () => {
  const geo = extractVectorGeometry(opList([
    setCap(1), setJoin(2),
    [OPS.save, null],
    setCap(0), setJoin(0),
    line(0, 0, 10, 0),      // reset inside the save
    [OPS.restore, null],
    line(0, 1, 10, 1),      // restore brings round/bevel back
    [OPS.paintFormXObjectBegin, [ID, null]],
    setCap(2),              // square cap, inside the form
    line(0, 2, 10, 2),
    [OPS.paintFormXObjectEnd, null],
    line(0, 3, 10, 3),      // the form's end restores round/bevel
  ]), ID, OPS);
  assert.deepEqual(geo.subpaths!.map((sp) => [sp.lineCap, sp.lineJoin]), [[0, 0], [1, 2], [2, 2], [1, 2]]);
});
