// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 5 first slice — rigid
// symmetries as the first verifier (requirement 2), bounded affine
// refinement only when rigid evidence is insufficient (requirement 3),
// mutual/injective correspondence (requirement 5's own no-many-to-one
// guarantee).
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import {
  verifyIsolatedSupport,
  mutualNearestCorrespondences,
  primitiveMidpoints,
  RIGID_TRANSFORMS,
} from "../src/lib/rigidAffineVerify.ts";
import type { Point } from "../src/lib/rigidAffineVerify.ts";

const OPS = {
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
// a real 90-degree PDF CTM rotation: x'=-y, y'=x (same convention already
// established in candidateBodySignature.test.ts).
const ROT90 = [0, 1, -1, 0, 0, 0];
// a real non-rigid but bounded (1.2x) uniform-ish anisotropic stretch.
const STRETCH = [1.3, 0, 0, 0.85, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];

// an asymmetric "L-with-a-notch" glyph -- enough real structure that a
// wrong transform or a coincidental few-point match can't fake a pass.
// Kept as coordinate quads (not just pre-built Ops) so a translated copy
// can be derived by offsetting the real coordinates directly, rather than
// reaching back into an Op's own internal args shape.
const GLYPH_COORDS: Array<[number, number, number, number]> = [
  [0, 0, 40, 0], [40, 0, 40, 20], [40, 20, 25, 20], [25, 20, 25, 10], [25, 10, 0, 10], [0, 10, 0, 0],
];
const glyphOps = (coords: Array<[number, number, number, number]>): Op[] =>
  coords.map(([x1, y1, x2, y2]) => line(x1, y1, x2, y2));
const GLYPH: Op[] = glyphOps(GLYPH_COORDS);

function buildIdx(ops: Op[], transform: number[] = ID) {
  const geo = extractVectorGeometry(opList(ops), transform, OPS);
  return buildVectorSceneIndex(geo);
}

test("verifyIsolatedSupport: an EXACT copy of the reference (identity) verifies rigid with full inliers and near-zero residual", () => {
  // reference at one location, an untransformed copy translated elsewhere
  // in the SAME sheet -- two real, separate primitive sets in one idx.
  const referenceOps = GLYPH;
  const candidateOps = glyphOps(GLYPH_COORDS.map(([x1, y1, x2, y2]): [number, number, number, number] =>
    [x1 + 1000, y1 + 1000, x2 + 1000, y2 + 1000]));
  const idx = buildIdx([...referenceOps, ...candidateOps]);
  const referenceIds = [0, 1, 2, 3, 4, 5];
  const candidateIds = [6, 7, 8, 9, 10, 11];
  const result = verifyIsolatedSupport(idx, candidateIds, referenceIds);
  assert.equal(result.state, "verified_rigid");
  assert.equal(result.inlierCount, 6);
  assert.equal(result.comparedAgainst, 6);
  assert.ok(result.residual !== null && result.residual < 0.01, "an exact translated copy has near-zero residual");
});

test("verifyIsolatedSupport: a REAL 90-degree rotated copy verifies rigid, not merely affine", () => {
  // both halves would go through the SAME rotation transform if built via
  // one extractVectorGeometry call (it takes one transform for the whole
  // op list) -- so to get a genuinely rotated CANDIDATE relative to an
  // UNROTATED reference, build two separate idx calls and stitch their
  // geometry together instead.
  const mergedGeo = extractVectorGeometry(opList(GLYPH), ID, OPS);
  const rotatedGeo = extractVectorGeometry(opList(GLYPH), ROT90, OPS);
  // stitch the two VectorGeometry results' own segs together manually --
  // both came from independent extractVectorGeometry calls (each its own
  // transform), so building one combined idx needs concatenation, not a
  // second extraction pass.
  const combinedSegs = [...mergedGeo.segs, ...rotatedGeo.segs];
  const combinedMeta = new Uint8Array(mergedGeo.meta.length + rotatedGeo.meta.length);
  combinedMeta.set(mergedGeo.meta, 0);
  combinedMeta.set(rotatedGeo.meta, mergedGeo.meta.length);
  const combinedGeo = { ...mergedGeo, segs: combinedSegs, meta: combinedMeta };
  const idx2 = buildVectorSceneIndex(combinedGeo);
  const referenceIds = [0, 1, 2, 3, 4, 5];
  const candidateIds = [6, 7, 8, 9, 10, 11];
  const result = verifyIsolatedSupport(idx2, candidateIds, referenceIds);
  assert.equal(result.state, "verified_rigid", "a real 90-degree rotation is exactly one of the 8 fixed symmetries, not affine-only");
  assert.equal(result.inlierCount, 6);
});

test("verifyIsolatedSupport: an unrelated, structurally different shape does not verify at all", () => {
  const unrelated: Op[] = [line(0, 0, 5, 0), line(100, 100, 103, 108), line(200, 5, 202, 5)];
  const idx = buildIdx([...GLYPH, ...unrelated]);
  const result = verifyIsolatedSupport(idx, [6, 7, 8], [0, 1, 2, 3, 4, 5]);
  assert.equal(result.state, "insufficient_evidence");
});

test("verifyIsolatedSupport: a bounded non-rigid stretch verifies affine, not rigid", () => {
  const refGeo = extractVectorGeometry(opList(GLYPH), ID, OPS);
  const stretchedGeo = extractVectorGeometry(opList(GLYPH), STRETCH, OPS);
  const combinedMeta = new Uint8Array(refGeo.meta.length + stretchedGeo.meta.length);
  combinedMeta.set(refGeo.meta, 0);
  combinedMeta.set(stretchedGeo.meta, refGeo.meta.length);
  const combinedGeo = { ...refGeo, segs: [...refGeo.segs, ...stretchedGeo.segs], meta: combinedMeta };
  const idx = buildVectorSceneIndex(combinedGeo);
  const result = verifyIsolatedSupport(idx, [6, 7, 8, 9, 10, 11], [0, 1, 2, 3, 4, 5]);
  assert.equal(result.state, "verified_affine", "a real 1.3x/0.85x anisotropic stretch cannot be explained by any of the 8 rigid symmetries alone");
  assert.ok(result.residual !== null && result.residual < 1, "the fitted affine explains the stretch with a small residual");
});

test("verifyIsolatedSupport: empty candidate or reference primitive sets are honestly insufficient, never a crash or a false positive", () => {
  const idx = buildIdx(GLYPH);
  const r1 = verifyIsolatedSupport(idx, [], [0, 1, 2]);
  assert.equal(r1.state, "insufficient_evidence");
  const r2 = verifyIsolatedSupport(idx, [0, 1, 2], []);
  assert.equal(r2.state, "insufficient_evidence");
});

test("mutualNearestCorrespondences: a real many-to-one collapse is rejected -- two source points both nearest to the SAME target point produce at most one mutual pair, never two", () => {
  const as: Point[] = [[0, 0], [0.1, 0]]; // two source points very close together
  const bs: Point[] = [[5, 5]]; // one distant target point, nearest to BOTH
  const pairs = mutualNearestCorrespondences(as, bs);
  assert.ok(pairs.length <= 1, "the target's own single nearest source wins; the other source is left unmatched, never double-assigned");
});

test("mutualNearestCorrespondences: real reciprocal nearest neighbors are found in both directions", () => {
  const as: Point[] = [[0, 0], [10, 10]];
  const bs: Point[] = [[0.5, 0.5], [10.5, 10.5]];
  const pairs = mutualNearestCorrespondences(as, bs);
  assert.equal(pairs.length, 2);
  assert.ok(pairs.some((p) => p.aIndex === 0 && p.bIndex === 0));
  assert.ok(pairs.some((p) => p.aIndex === 1 && p.bIndex === 1));
});

test("RIGID_TRANSFORMS: all 8 matrices are real orthogonal (rotation or reflection) matrices, never a scale or shear", () => {
  for (const rt of RIGID_TRANSFORMS) {
    const [a, b, c, d] = rt.m;
    const det = a * d - b * c;
    assert.ok(Math.abs(Math.abs(det) - 1) < 1e-9, `${rt.label}: |det| must be 1 for a real rigid transform`);
    // columns are unit length and orthogonal -- mᵀm = I
    assert.ok(Math.abs(a * a + c * c - 1) < 1e-9, `${rt.label}: first column not unit length`);
    assert.ok(Math.abs(b * b + d * d - 1) < 1e-9, `${rt.label}: second column not unit length`);
    assert.ok(Math.abs(a * b + c * d) < 1e-9, `${rt.label}: columns not orthogonal`);
  }
  const labels = new Set(RIGID_TRANSFORMS.map((rt) => rt.label));
  assert.equal(labels.size, 8, "all 8 symmetries are distinct");
});

test("primitiveMidpoints: returns the real geometric midpoint of each primitive, in primitiveIds order", () => {
  const idx = buildIdx([line(0, 0, 10, 0), line(0, 0, 0, 20)]);
  const mids = primitiveMidpoints(idx, [0, 1]);
  assert.deepEqual(mids, [[5, 0], [0, 10]]);
});
