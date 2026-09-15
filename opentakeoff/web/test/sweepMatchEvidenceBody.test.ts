// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 6/7 — old-engine-to-
// evidence-graph adapter. See sweepMatchEvidenceBody.ts's own header for
// why this exists: feed evidenceGraph.ts from the OLD engine's already-
// accurate matches rather than the NEW candidate pipeline's currently-
// broken Lane B fragmentation.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { VectorSceneIndex, IndexedPrimitive } from "../src/lib/vectorSceneIndex.ts";
import { buildSpatialIndex } from "../src/lib/vectorSceneSpatialIndex.ts";
import { sweepMatchToEvidenceBody } from "../src/lib/sweepMatchEvidenceBody.ts";

function fakeIndex(rects: [number, number, number, number][]): VectorSceneIndex {
  const primitives: IndexedPrimitive[] = rects.map(([x0, y0, x1, y1], id) => ({
    id, x0, y0, x1, y1, primType: null, curved: false, clip: false, fillOnly: false,
    polyArc: false, deviceLineWidth: 0, lum: null, layerId: null, subpathId: -1,
  }));
  return {
    version: 1, primitives, subpaths: [], layerIds: [], imageArea: 0, maxImageArea: 0,
    incomplete: false, incompleteReason: null, notYetImplemented: [], textSpans: [],
    formIdentity: [], intersections: [], spatialIndex: null,
  };
}

test("sweepMatchToEvidenceBody: rigid match (rotation 0) collects exactly the primitives inside its box", () => {
  // seed footprint 20x20; a match centered at (100,100) should produce a
  // box roughly 20x20 (plus 15% pad) around that point.
  const idx = fakeIndex([
    [95, 95, 105, 105],   // inside the match's own footprint -- must be included
    [200, 200, 210, 210], // far away, unrelated -- must be excluded
  ]);
  const spatialIndex = buildSpatialIndex(idx);
  const body = sweepMatchToEvidenceBody(
    0, { at: [100, 100], rotation: 0, transform: undefined },
    { x0: 0, y0: 0, x1: 20, y1: 20 }, idx, spatialIndex,
  );
  assert.ok(body, "a body was produced");
  assert.deepEqual(body!.primitiveIds, [0]);
  assert.equal(body!.id, 0);
});

test("sweepMatchToEvidenceBody: a primitive only PARTIALLY overlapping the box is excluded (exact containment, not bbox-overlap)", () => {
  // seed footprint 10x10 around (100,100) -> box roughly x[94.25,105.75]
  // (10*1.3=13 side, half=6.5). A primitive straddling the box edge
  // (partially inside, partially outside) must NOT count -- unlike
  // sweepThumb.js's own segmentsInBox (overlap, safe for a UI thumbnail),
  // this module needs the body's OWN ink only.
  const idx = fakeIndex([[103, 100, 120, 100]]); // starts inside, ends well outside
  const spatialIndex = buildSpatialIndex(idx);
  const body = sweepMatchToEvidenceBody(
    0, { at: [100, 100], rotation: 0, transform: undefined },
    { x0: 0, y0: 0, x1: 10, y1: 10 }, idx, spatialIndex,
  );
  assert.equal(body, null, "no primitive is FULLY contained, so no body -- an honest refusal, not a partial claim");
});

test("sweepMatchToEvidenceBody: a rotated match (90deg) still captures the same real ink -- reuses matchBox's own rotation-safe sizing", () => {
  const idx = fakeIndex([[95, 95, 105, 105]]);
  const spatialIndex = buildSpatialIndex(idx);
  const body = sweepMatchToEvidenceBody(
    0, { at: [100, 100], rotation: 90, transform: undefined },
    { x0: 0, y0: 0, x1: 20, y1: 20 }, idx, spatialIndex,
  );
  assert.ok(body, "a 90deg rotation of a square-ish footprint still captures the same nearby ink");
  assert.deepEqual(body!.primitiveIds, [0]);
});

test("sweepMatchToEvidenceBody: an affine match with scale_x/scale_y > 1 produces a bigger box than an unscaled match", () => {
  const idx = fakeIndex([
    [95, 95, 105, 105],  // within an unscaled 20x20 footprint
    [70, 70, 80, 80],    // only within a 2x-scaled footprint
  ]);
  const spatialIndex = buildSpatialIndex(idx);
  const unscaled = sweepMatchToEvidenceBody(
    0, { at: [100, 100], rotation: 0, transform: undefined },
    { x0: 0, y0: 0, x1: 20, y1: 20 }, idx, spatialIndex,
  );
  const scaled = sweepMatchToEvidenceBody(
    0,
    { at: [100, 100], rotation: 0, transform: { rotation_deg: 0, scale_x: 3, scale_y: 3, shear_deg: 0, mirrored: false, rms_px: 0, tol_px: 1, via: "affine" } },
    { x0: 0, y0: 0, x1: 20, y1: 20 }, idx, spatialIndex,
  );
  assert.deepEqual(unscaled!.primitiveIds, [0], "unscaled box only reaches the near primitive");
  assert.deepEqual(scaled!.primitiveIds.slice().sort((a, b) => a - b), [0, 1], "scaled-up box also reaches the farther primitive");
});

test("sweepMatchToEvidenceBody: a match over empty space returns null, not an empty-but-truthy body", () => {
  const idx = fakeIndex([[500, 500, 510, 510]]);
  const spatialIndex = buildSpatialIndex(idx);
  const body = sweepMatchToEvidenceBody(
    0, { at: [100, 100], rotation: 0, transform: undefined },
    { x0: 0, y0: 0, x1: 20, y1: 20 }, idx, spatialIndex,
  );
  assert.equal(body, null);
});

test("sweepMatchToEvidenceBody: a degenerate zero-size seed rect refuses cleanly", () => {
  const idx = fakeIndex([[95, 95, 105, 105]]);
  const spatialIndex = buildSpatialIndex(idx);
  const body = sweepMatchToEvidenceBody(
    0, { at: [100, 100], rotation: 0, transform: undefined },
    { x0: 0, y0: 0, x1: 0, y1: 0 }, idx, spatialIndex,
  );
  assert.equal(body, null);
});

test("sweepMatchToEvidenceBody: the returned bbox is the TIGHT bbox of the contained primitives, not the loose query box", () => {
  const idx = fakeIndex([[98, 98, 102, 102]]); // small ink well inside a big loose query box
  const spatialIndex = buildSpatialIndex(idx);
  const body = sweepMatchToEvidenceBody(
    0, { at: [100, 100], rotation: 0, transform: undefined },
    { x0: 0, y0: 0, x1: 40, y1: 40 }, idx, spatialIndex,
  );
  assert.ok(body);
  assert.deepEqual([body!.x0, body!.y0, body!.x1, body!.y1], [98, 98, 102, 102], "bbox is tight to the real ink, not the padded search box");
});
