// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 Lane D — compact
// invariant body signatures, built on Lane B candidate bodies and Lane D
// node attributes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { computeVectorSceneJunctions } from "../src/lib/vectorSceneRelations.ts";
import { proposeCandidateBodiesLaneB } from "../src/lib/candidateBodyLaneB.ts";
import { computePrimitiveGraphAttributes } from "../src/lib/candidateBodyLaneD.ts";
import { computeBodySignatures } from "../src/lib/candidateBodySignature.ts";

const OPS = {
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
// 90 degree rotation: x' = -y, y' = x
const ROT90 = [0, 1, -1, 0, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];

// An "L" shape: a long leg and a shorter perpendicular leg meeting at a
// corner — asymmetric enough that rotation/order genuinely exercise the
// signature rather than trivially matching by coincidence.
const L_SHAPE: Op[] = [line(0, 0, 40, 0), line(40, 0, 40, 15)];

function signaturesFor(ops: Op[], transform: number[] = ID) {
  const geo = extractVectorGeometry(opList(ops), transform, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const bodies = proposeCandidateBodiesLaneB(idx, junctions).bodies;
  const attrs = computePrimitiveGraphAttributes(idx, junctions).attributes;
  return computeBodySignatures(bodies, attrs);
}

test("body signature: order-invariant — the same shape built with primitives listed in reverse order signs identically", () => {
  const sigsA = signaturesFor(L_SHAPE);
  const sigsB = signaturesFor([L_SHAPE[1], L_SHAPE[0]]);
  const hashesA = [...sigsA.values()].map((s) => s.hash).sort();
  const hashesB = [...sigsB.values()].map((s) => s.hash).sort();
  assert.deepEqual(hashesA, hashesB);
});

test("body signature: rotation-invariant — the same shape rotated 90 degrees signs identically", () => {
  const sigsA = signaturesFor(L_SHAPE, ID);
  const sigsB = signaturesFor(L_SHAPE, ROT90);
  const hashesA = [...sigsA.values()].map((s) => s.hash).sort();
  const hashesB = [...sigsB.values()].map((s) => s.hash).sort();
  assert.deepEqual(hashesA, hashesB);
});

test("body signature: a genuinely different shape signs differently", () => {
  const sigsA = signaturesFor(L_SHAPE);
  const other: Op[] = [line(0, 0, 10, 0), line(10, 0, 10, 10)]; // equal-leg corner, not the L's 40/15 asymmetry
  const sigsB = signaturesFor(other);
  const hashesA = [...sigsA.values()].map((s) => s.hash).sort();
  const hashesB = [...sigsB.values()].map((s) => s.hash).sort();
  assert.notDeepEqual(hashesA, hashesB);
});

test("body signature: a 2-member corner has no chirality to lose — mirroring signs identically, for real reasons, not by accident", () => {
  // Two lines meeting at a point carry no handedness on their own (an L and
  // its mirror image are both just "two lines at some relative angle" —
  // nothing in that description can tell them apart without a THIRD
  // reference point). angleDiffMod180 is an unsigned distance, so mirroring
  // a body this simple genuinely cannot change its signature — this is not
  // an oversight to fix, it is what "no chirality exists at this level of
  // representation yet" looks like. Whether a 3+-member body with genuine
  // spatial handedness (a Z vs. its mirror S) also survives is untested and
  // likely does NOT hold — a real, disclosed gap for a future slice.
  const MIRROR_X = [-1, 0, 0, 1, 0, 0];
  const sigsA = signaturesFor(L_SHAPE, ID);
  const sigsB = signaturesFor(L_SHAPE, MIRROR_X);
  const hashesA = [...sigsA.values()].map((s) => s.hash).sort();
  const hashesB = [...sigsB.values()].map((s) => s.hash).sort();
  assert.deepEqual(hashesA, hashesB);
});

test("body signature: entries are sorted (by the same multi-key order every time) and the dominant orientation is the longest member's own", () => {
  const sigs = signaturesFor(L_SHAPE);
  const sig = [...sigs.values()][0];
  assert.equal(sig.memberCount, 2);
  assert.equal(sig.dominantOrientationDeg, 0, "the 40px leg (horizontal) is longer than the 15px leg");
  // re-applying the exact same multi-key comparator must be a no-op —
  // that is what "already sorted" means for a multi-field key, not that
  // any single field in isolation happens to be ascending.
  const key = (e: (typeof sig.entries)[number]) =>
    [Number(e.type ?? -1), Number(e.curved), Number(e.closed), e.lengthBucket, e.angleBucket] as const;
  const resorted = [...sig.entries].sort((a, b) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  });
  assert.deepEqual(sig.entries, resorted);
});

test("body signature: an empty body list produces an empty map", () => {
  const sigs = computeBodySignatures([], []);
  assert.equal(sigs.size, 0);
});
