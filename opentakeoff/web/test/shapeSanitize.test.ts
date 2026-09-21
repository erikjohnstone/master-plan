// Load-time shape sanitizer (#linear-takeoff B-L4) — see shapeSanitize.ts's
// own header for why this exists: sanitizeShapeLabelsOnShapes is identity-
// preserving and only ever touches .label; nothing validated the fields
// every downstream reader (totals.js's role switch, shapeMetrics.js's
// pricer, the renderer, every export) assumes are already sound. Invariants
// under test: a well-formed shape survives untouched; a shape with an
// unknown role, a non-array verts_norm, too few points for its role, or any
// non-finite/malformed vertex is DROPPED rather than repaired into a guess;
// a tiny float overshoot past [0,1] is clamped, not dropped; `computed` is
// healed to `{}` when missing/malformed so nothing reads off `undefined`
// before shapeMetrics.js's own healing pass runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeShape, sanitizeShapesOnLoad, VALID_MEASURE_ROLES } from "../src/lib/shapeSanitize.ts";

const goodArea = {
  id: "shp-1", sheet_id: "A-101.pdf#1", condition_id: "cond-1", measure_role: "floor_area",
  verts_norm: [[0.1, 0.1], [0.4, 0.1], [0.4, 0.4]],
  computed: { area_sf: 100, perimeter_lf: 40 },
  origin: { method: "manual" },
};

test("sanitizeShape: a well-formed shape survives with the same values", () => {
  const s = sanitizeShape(goodArea);
  assert.ok(s);
  assert.equal(s!.id, "shp-1");
  assert.equal(s!.measure_role, "floor_area");
  assert.deepEqual(s!.verts_norm, [[0.1, 0.1], [0.4, 0.1], [0.4, 0.4]]);
  assert.deepEqual(s!.computed, { area_sf: 100, perimeter_lf: 40 });
  assert.deepEqual(s!.origin, { method: "manual" }, "origin is never reinterpreted here");
});

test("sanitizeShape: rejects non-objects, arrays, and missing/wrong-typed id/sheet_id/condition_id", () => {
  assert.equal(sanitizeShape(null), null);
  assert.equal(sanitizeShape(undefined), null);
  assert.equal(sanitizeShape("not a shape"), null);
  assert.equal(sanitizeShape([1, 2, 3]), null);
  assert.equal(sanitizeShape({ ...goodArea, id: 5 }), null);
  assert.equal(sanitizeShape({ ...goodArea, id: "" }), null);
  assert.equal(sanitizeShape({ ...goodArea, sheet_id: undefined }), null);
  assert.equal(sanitizeShape({ ...goodArea, condition_id: null }), null);
});

test("sanitizeShape: measure_role must be one of the real five — never guessed, never widened", () => {
  assert.deepEqual(VALID_MEASURE_ROLES, ["floor_area", "deduct", "linear", "surface_area", "count"]);
  assert.equal(sanitizeShape({ ...goodArea, measure_role: "not_a_role" }), null);
  assert.equal(sanitizeShape({ ...goodArea, measure_role: undefined }), null);
  for (const role of VALID_MEASURE_ROLES) {
    const verts = role === "count" ? [[0.5, 0.5]] : goodArea.verts_norm;
    assert.ok(sanitizeShape({ ...goodArea, measure_role: role, verts_norm: verts }), `${role} is a real role`);
  }
});

test("sanitizeShape: verts_norm must be a real array of finite [x,y] pairs", () => {
  assert.equal(sanitizeShape({ ...goodArea, verts_norm: "not an array" }), null);
  assert.equal(sanitizeShape({ ...goodArea, verts_norm: undefined }), null);
  assert.equal(sanitizeShape({ ...goodArea, verts_norm: [[0.1, 0.1], "bad", [0.4, 0.4]] }), null, "one malformed vertex drops the whole shape");
  assert.equal(sanitizeShape({ ...goodArea, verts_norm: [[0.1, 0.1], [NaN, 0.2]] }), null, "NaN is unrecoverable");
  assert.equal(sanitizeShape({ ...goodArea, verts_norm: [[0.1, 0.1], [Infinity, 0.2]] }), null, "Infinity is unrecoverable");
  assert.equal(sanitizeShape({ ...goodArea, verts_norm: [[0.1, 0.1, 0.1], [0.2, 0.2]] }), null, "a 3-tuple is not an [x,y] pair");
});

test("sanitizeShape: a tiny float overshoot past [0,1] is CLAMPED, not dropped", () => {
  const s = sanitizeShape({ ...goodArea, verts_norm: [[-0.0001, 0.1], [1.0002, 0.4], [0.4, 0.4]] });
  assert.ok(s, "an otherwise-good shape with float-noise coordinates is healed, not discarded");
  assert.deepEqual(s!.verts_norm, [[0, 0.1], [1, 0.4], [0.4, 0.4]]);
});

test("sanitizeShape: minimum vertex count is role-aware — count needs 1, everything else needs 2", () => {
  assert.ok(sanitizeShape({ ...goodArea, measure_role: "count", verts_norm: [[0.5, 0.5]] }), "one point is a real count marker");
  assert.equal(sanitizeShape({ ...goodArea, measure_role: "count", verts_norm: [] }), null);
  assert.ok(sanitizeShape({ ...goodArea, measure_role: "linear", verts_norm: [[0.1, 0.1], [0.5, 0.5]] }), "two points is a real open run");
  assert.equal(sanitizeShape({ ...goodArea, measure_role: "linear", verts_norm: [[0.1, 0.1]] }), null, "one point is not a run");
  assert.equal(sanitizeShape({ ...goodArea, measure_role: "floor_area", verts_norm: [] }), null);
});

test("sanitizeShape: a missing or malformed `computed` heals to {} rather than reaching downstream as undefined", () => {
  assert.deepEqual(sanitizeShape({ ...goodArea, computed: undefined })!.computed, {});
  assert.deepEqual(sanitizeShape({ ...goodArea, computed: null })!.computed, {});
  assert.deepEqual(sanitizeShape({ ...goodArea, computed: "not an object" })!.computed, {});
  assert.deepEqual(sanitizeShape({ ...goodArea, computed: [1, 2] })!.computed, {}, "an array is not a computed object");
});

test("sanitizeShapesOnLoad: filters a whole array, dropping only what cannot be recovered, order-preserving", () => {
  const bad1 = { ...goodArea, id: "shp-bad-role", measure_role: "nope" };
  const good2 = { ...goodArea, id: "shp-2" };
  const bad3 = { ...goodArea, id: "shp-bad-verts", verts_norm: null };
  const out = sanitizeShapesOnLoad([goodArea, bad1, good2, bad3]);
  assert.deepEqual(out.map((s) => s.id), ["shp-1", "shp-2"]);
});

test("sanitizeShapesOnLoad: non-array input is the empty array, never a throw", () => {
  assert.deepEqual(sanitizeShapesOnLoad(null), []);
  assert.deepEqual(sanitizeShapesOnLoad(undefined), []);
  assert.deepEqual(sanitizeShapesOnLoad("garbage"), []);
  assert.deepEqual(sanitizeShapesOnLoad({}), []);
});
