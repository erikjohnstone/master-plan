// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 4 requirement 2's own
// "carrier versus body classification" signal — compares each subpath's
// own diagonal against the MEDIAN diagonal of its SIBLING subpaths
// within the same proposal (see carrierClassification.ts's own header
// for why comparing against the proposal's own bbox instead was
// rejected by real-sheet validation as mathematically vacuous).
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { classifyCarrierPrimitives } from "../src/lib/carrierClassification.ts";

const OPS = {
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
// one moveTo+lineTo pair per subpath, all in ONE constructPath call so
// each pair becomes its own subpath (a fresh moveTo starts a new one).
const multiLineOp = (segments: [number, number, number, number][]): Op => {
  const fns: number[] = [];
  const args: number[] = [];
  for (const [x1, y1, x2, y2] of segments) {
    fns.push(OPS.moveTo, OPS.lineTo);
    args.push(x1, y1, x2, y2);
  }
  return [OPS.constructPath, [fns, args]];
};

test("carrier classification: a subpath dramatically longer than its sibling subpaths in the same proposal is flagged carrier-like", () => {
  // proposal = 3 short local body subpaths (~10 units each) glued to one
  // long 1000-unit run — the long one should stand out as an outlier
  // against its siblings' median (~10).
  const geo = extractVectorGeometry(opList([multiLineOp([
    [0, 0, 1000, 0],   // subpath 0 — long, carrier-like
    [2, 2, 10, 2],     // subpath 1 — short, body-like
    [2, 4, 11, 4],     // subpath 2 — short, body-like
    [2, 6, 9, 6],      // subpath 3 — short, body-like
  ])]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const results = classifyCarrierPrimitives([0, 1, 2, 3], idx);
  assert.equal(results.find((r) => r.primitiveId === 0)!.isCarrierLike, true);
  for (const pid of [1, 2, 3]) {
    assert.equal(results.find((r) => r.primitiveId === pid)!.isCarrierLike, false, `sibling ${pid} should not be flagged`);
  }
});

test("carrier classification: subpaths of comparable length in the same proposal are NOT flagged carrier-like against each other", () => {
  const geo = extractVectorGeometry(opList([multiLineOp([
    [0, 0, 10, 0],
    [0, 2, 11, 2],
    [0, 4, 9, 4],
  ])]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const results = classifyCarrierPrimitives([0, 1, 2], idx);
  for (const r of results) assert.equal(r.isCarrierLike, false, `all comparable-length siblings should be false, got ${JSON.stringify(r)}`);
});

test("carrier classification: a proposal made of only ONE distinct subpath has nothing to compare against — reported null, not defaulted false-by-assumption", () => {
  const geo = extractVectorGeometry(opList([multiLineOp([[0, 0, 1000, 0]])]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const results = classifyCarrierPrimitives([0], idx);
  assert.equal(results[0].extentRatio, null);
  assert.equal(results[0].isCarrierLike, false);
});

test("carrier classification: extentRatioThreshold is a real, tunable knob", () => {
  const geo = extractVectorGeometry(opList([multiLineOp([
    [0, 0, 100, 0],  // subpath 0
    [0, 2, 10, 2],   // subpath 1
  ])]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const lenient = classifyCarrierPrimitives([0, 1], idx, { extentRatioThreshold: 1000 });
  assert.equal(lenient.find((r) => r.primitiveId === 0)!.isCarrierLike, false, "an unreachable threshold never flags anything");
  const strict = classifyCarrierPrimitives([0, 1], idx, { extentRatioThreshold: 0.01 });
  assert.equal(strict.find((r) => r.primitiveId === 0)!.isCarrierLike, true, "a near-zero threshold flags everything with any positive ratio");
});

test("carrier classification: multiple primitives sharing the SAME subpath get the SAME classification, computed once per subpath not once per primitive", () => {
  // two lineTo segments within a single subpath (one moveTo, then two
  // lineTos) vs. one short sibling subpath.
  const fns = [OPS.moveTo, OPS.lineTo, OPS.lineTo, OPS.moveTo, OPS.lineTo];
  const args = [0, 0, 500, 0, 1000, 0, 2, 2, 10, 2];
  const geo = extractVectorGeometry(opList([[OPS.constructPath, [fns, args]]]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  // primitives 0,1 belong to the long subpath; primitive 2 to the short one.
  const results = classifyCarrierPrimitives([0, 1, 2], idx);
  assert.equal(results.find((r) => r.primitiveId === 0)!.isCarrierLike, true);
  assert.equal(results.find((r) => r.primitiveId === 1)!.isCarrierLike, true);
  assert.equal(results.find((r) => r.primitiveId === 2)!.isCarrierLike, false);
});
