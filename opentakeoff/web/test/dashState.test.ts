// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 2 — dash-pattern graphics
// state, the second of the goal's named "graphics-state attributes
// available from pdf.js" (CTM, line width, stroke/fill, luminance, dash
// pattern, cap, join, clip state — line width/stroke/fill-luminance/clip
// state were already tracked; this is the next one). Recorded per SUBPATH
// (like fillLum already is), not per segment: dash state is graphics state
// exactly like stroke/fill colour — it cannot change mid-path — so one bit
// per figure is the right grain and costs nothing extra per segment.
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
const setDash = (arr: number[], phase = 0): Op => [OPS.setDash, [arr, phase]];

test("dash state: a path drawn before any setDash call reads solid — PDF's initial state, costs nothing on an undashed file", () => {
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0)]), ID, OPS);
  assert.equal(geo.subpaths!.length, 1);
  assert.equal(geo.subpaths![0].dashed, false);
});

test("dash state: setDash with a non-empty, non-zero array marks every subpath drawn after it as dashed", () => {
  const geo = extractVectorGeometry(opList([
    line(0, 0, 10, 0),          // solid
    setDash([4, 2]),
    line(0, 1, 10, 1),          // dashed
  ]), ID, OPS);
  assert.equal(geo.subpaths!.length, 2);
  assert.equal(geo.subpaths![0].dashed, false);
  assert.equal(geo.subpaths![1].dashed, true);
});

test("dash state: `[] 0 d` (the PDF spec's own explicit-solid form) reads exactly like never calling setDash, not as a distinct state", () => {
  const geo = extractVectorGeometry(opList([
    setDash([4, 2]),
    line(0, 0, 10, 0),          // dashed
    setDash([], 0),
    line(0, 1, 10, 1),          // explicitly reset to solid
  ]), ID, OPS);
  assert.equal(geo.subpaths![0].dashed, true);
  assert.equal(geo.subpaths![1].dashed, false);
});

test("dash state: an all-zero dash array is solid (a malformed-but-legal 'dash of zero length' reads as no dash, not a divide-by-zero on some downstream renderer's assumption)", () => {
  const geo = extractVectorGeometry(opList([
    setDash([0, 0]),
    line(0, 0, 10, 0),
  ]), ID, OPS);
  assert.equal(geo.subpaths![0].dashed, false);
});

test("dash state is graphics state: save/restore and Form XObject begin/end both restore it, same as line width/stroke/fill colour", () => {
  const geo = extractVectorGeometry(opList([
    setDash([4, 2]),
    [OPS.save, null],
    setDash([], 0),
    line(0, 0, 10, 0),          // solid, inside the save
    [OPS.restore, null],
    line(0, 1, 10, 1),          // restore brings dashed back
    [OPS.paintFormXObjectBegin, [ID, null]],
    setDash([], 0),
    line(0, 2, 10, 2),          // solid, inside the form
    [OPS.paintFormXObjectEnd, null],
    line(0, 3, 10, 3),          // the form's end restores dashed
  ]), ID, OPS);
  assert.deepEqual(geo.subpaths!.map((sp) => sp.dashed), [false, true, false, true]);
});
