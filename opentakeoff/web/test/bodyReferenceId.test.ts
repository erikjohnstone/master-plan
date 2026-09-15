// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 7 requirement 8 — stable
// vector-body crop reference IDs for a future DINOv2 metric verifier.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeVectorBodyCrop } from "../src/lib/bodyReferenceId.ts";

const bbox = { x0: 10, y0: 20, x1: 30, y1: 40 };

test("computeVectorBodyCrop: the SAME sheet + SAME primitive set always produces the SAME referenceId -- stable across independent calls, never derived from array position", async () => {
  const a = await computeVectorBodyCrop("sheet-1", [5, 2, 9], bbox);
  const b = await computeVectorBodyCrop("sheet-1", [5, 2, 9], bbox);
  assert.equal(a.referenceId, b.referenceId);
});

test("computeVectorBodyCrop: the SAME underlying set in a DIFFERENT collection order still produces the SAME referenceId -- upstream ordering never matters", async () => {
  const a = await computeVectorBodyCrop("sheet-1", [5, 2, 9], bbox);
  const b = await computeVectorBodyCrop("sheet-1", [9, 5, 2], bbox);
  assert.equal(a.referenceId, b.referenceId);
  assert.deepEqual(a.primitiveIds, [2, 5, 9], "primitiveIds are reported sorted, regardless of input order");
});

test("computeVectorBodyCrop: a DIFFERENT sheet with the identical primitive set produces a DIFFERENT referenceId -- sheet identity is part of the stable key, never collapsed away", async () => {
  const a = await computeVectorBodyCrop("sheet-1", [5, 2, 9], bbox);
  const b = await computeVectorBodyCrop("sheet-2", [5, 2, 9], bbox);
  assert.notEqual(a.referenceId, b.referenceId);
});

test("computeVectorBodyCrop: a DIFFERENT primitive set on the SAME sheet produces a DIFFERENT referenceId", async () => {
  const a = await computeVectorBodyCrop("sheet-1", [5, 2, 9], bbox);
  const b = await computeVectorBodyCrop("sheet-1", [5, 2, 9, 11], bbox);
  assert.notEqual(a.referenceId, b.referenceId);
});

test("computeVectorBodyCrop: the bbox is carried through unchanged, and the id is a real lowercase-hex SHA-256 (64 chars) -- the same shared digest convention basSequenceReconciliation.ts already uses", async () => {
  const crop = await computeVectorBodyCrop("sheet-1", [1, 2, 3], bbox);
  assert.deepEqual({ x0: crop.x0, y0: crop.y0, x1: crop.x1, y1: crop.y1 }, bbox);
  assert.match(crop.referenceId, /^[0-9a-f]{64}$/);
  assert.equal(crop.sheetKey, "sheet-1");
});

test("computeVectorBodyCrop: an empty primitive set is handled safely, never a crash -- still produces a real, stable, deterministic id", async () => {
  const a = await computeVectorBodyCrop("sheet-1", [], bbox);
  const b = await computeVectorBodyCrop("sheet-1", [], bbox);
  assert.equal(a.referenceId, b.referenceId);
  assert.deepEqual(a.primitiveIds, []);
});
