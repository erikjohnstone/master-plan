// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 2 — vectorSceneIndex.ts, the
// phase's own literal named deliverable ("build one shared VectorSceneIndex").
// This slice: stable primitive/subpath IDs, graphics-state passthrough,
// layer resolution, the document-hash+page+version cache, and the
// disclosed memory cap. Not covered here (and not yet implemented — see
// `notYetImplemented`): text spans, Form XObject identity, junction
// relations, a real spatial index.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import {
  buildVectorSceneIndex, getOrBuildVectorSceneIndex, clearVectorSceneIndexCache,
  vectorSceneIndexCacheKey, VECTOR_SCENE_INDEX_VERSION,
} from "../src/lib/vectorSceneIndex.ts";

const OPS = {
  save: 1, restore: 2, transform: 3, setLineWidth: 4, setLineCap: 5, setLineJoin: 6, setDash: 7,
  setStrokeRGBColor: 8, setFillRGBColor: 9,
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
  endPath: 20, clip: 21, eoClip: 22, fill: 23, eoFill: 24, stroke: 25,
  beginMarkedContent: 30, beginMarkedContentProps: 31, endMarkedContent: 32,
  paintFormXObjectBegin: 33, paintFormXObjectEnd: 34,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];
const closedLine = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo, OPS.closePath], [x1, y1, x2, y2]]];

test("vectorSceneIndex: stable per-primitive ids, endpoints, and paint-flag decode straight from meta", () => {
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0), line(0, 5, 10, 5)]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  assert.equal(idx.primitives.length, 2);
  assert.deepEqual(idx.primitives.map((p) => p.id), [0, 1]);
  assert.deepEqual([idx.primitives[0].x0, idx.primitives[0].y0, idx.primitives[0].x1, idx.primitives[0].y1], [0, 0, 10, 0]);
  assert.equal(idx.primitives[0].clip, false);
  assert.equal(idx.primitives[0].fillOnly, false);
  assert.equal(idx.primitives[0].curved, false);
});

test("vectorSceneIndex: every primitive knows which subpath it belongs to, and each subpath restates its own primitive ids", () => {
  const geo = extractVectorGeometry(opList([
    line(0, 0, 10, 0),         // subpath 0
    line(0, 5, 10, 5),         // subpath 1 (a fresh moveTo opens a new one)
  ]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  assert.equal(idx.subpaths.length, 2);
  assert.equal(idx.primitives[0].subpathId, 0);
  assert.equal(idx.primitives[1].subpathId, 1);
  assert.deepEqual(idx.subpaths[0].primitiveIds, [0]);
  assert.deepEqual(idx.subpaths[1].primitiveIds, [1]);
});

test("vectorSceneIndex: subpath-level graphics state (dash/cap/join/formDepth/fillLum/closed) passes through unchanged", () => {
  const geo = extractVectorGeometry(opList([
    [OPS.setDash, [[4, 2], 0]],
    [OPS.setLineCap, [1]],
    [OPS.setLineJoin, [2]],
    [OPS.setFillRGBColor, [[0, 0, 0]]],
    [OPS.paintFormXObjectBegin, [ID, null]],
    closedLine(0, 0, 10, 0),
    [OPS.paintFormXObjectEnd, null],
  ]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  assert.equal(idx.subpaths.length, 1);
  const sp = idx.subpaths[0];
  assert.equal(sp.dashed, true);
  assert.equal(sp.lineCap, 1);
  assert.equal(sp.lineJoin, 2);
  assert.equal(sp.formDepth, 1);
  assert.equal(sp.closed, true);
});

test("vectorSceneIndex: layers resolve to real OCG ids, and unlayered ink resolves to null", () => {
  const geo = extractVectorGeometry(opList([
    [OPS.beginMarkedContentProps, ["OC", { type: "OCG", id: "ocg1" }]],
    line(0, 0, 10, 0),
    [OPS.endMarkedContent, null],
    line(0, 5, 10, 5),          // outside any OCG
  ]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  assert.equal(idx.primitives[0].layerId, "ocg1");
  assert.equal(idx.primitives[1].layerId, null);
  assert.deepEqual(idx.layerIds, ["ocg1"]);
});

test("vectorSceneIndex: declares exactly what it does not yet implement, rather than a silently-empty field", () => {
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0)]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  assert.deepEqual([...idx.notYetImplemented].sort(), ["formIdentity", "intersections", "spatialIndex", "textSpans"]);
  assert.deepEqual(idx.textSpans, []);
  assert.deepEqual(idx.intersections, []);
  assert.equal(idx.spatialIndex, null);
  assert.equal(idx.incomplete, false);
  assert.equal(idx.incompleteReason, null);
});

test("vectorSceneIndex: a primitive-count cap breach marks the index incomplete instead of silently truncating", () => {
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0), line(0, 5, 10, 5), line(0, 10, 10, 10)]), ID, OPS);
  const idx = buildVectorSceneIndex(geo, { maxPrimitives: 2 });
  assert.equal(idx.incomplete, true);
  assert.match(idx.incompleteReason!, /exceeds the 2-primitive safety cap/);
  assert.equal(idx.primitives.length, 2, "indexed only up to the cap, never partial-silent over it");
  // the subpath whose range crossed the cap reports only the ids actually indexed
  assert.ok(idx.subpaths.every((sp) => sp.primitiveIds.every((id) => id < 2)));
});

test("cache: same (docHash, page) returns the identical object; a different key builds fresh", () => {
  clearVectorSceneIndexCache();
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0)]), ID, OPS);
  const a = getOrBuildVectorSceneIndex("hash-1", 1, geo);
  const b = getOrBuildVectorSceneIndex("hash-1", 1, geo);
  assert.equal(a, b, "a cache hit returns the SAME object, not a rebuilt equal one");
  const c = getOrBuildVectorSceneIndex("hash-1", 2, geo);
  assert.notEqual(a, c, "a different page is a different cache entry");
  const d = getOrBuildVectorSceneIndex("hash-2", 1, geo);
  assert.notEqual(a, d, "a different document hash is a different cache entry");
});

test("cache: the key bakes in the module version, so a version bump invalidates deterministically without any explicit sweep", () => {
  const key = vectorSceneIndexCacheKey("hash-1", 1);
  assert.match(key, new RegExp(`v${VECTOR_SCENE_INDEX_VERSION}$`));
});

test("cache: clearVectorSceneIndexCache forces the next call to rebuild", () => {
  clearVectorSceneIndexCache();
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0)]), ID, OPS);
  const a = getOrBuildVectorSceneIndex("hash-3", 1, geo);
  clearVectorSceneIndexCache();
  const b = getOrBuildVectorSceneIndex("hash-3", 1, geo);
  assert.notEqual(a, b);
});
