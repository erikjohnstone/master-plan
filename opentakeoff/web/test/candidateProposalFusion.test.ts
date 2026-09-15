// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 — proposal fusion:
// dedup by primitive overlap and body identity, never center distance
// alone; preserve which lanes voted; deterministic top-K ordering.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { computeVectorSceneJunctions } from "../src/lib/vectorSceneRelations.ts";
import { proposeCandidateBodiesLaneB } from "../src/lib/candidateBodyLaneB.ts";
import { computeFormContentSignatures } from "../src/lib/candidateBodyLaneA.ts";
import { fuseProposals } from "../src/lib/candidateProposalFusion.ts";

const OPS = {
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
  paintFormXObjectBegin: 33, paintFormXObjectEnd: 34,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];
const closedRect = (x: number, y: number, w: number, h: number): Op =>
  [OPS.constructPath, [[OPS.rectangle], [x, y, w, h]]];
const formBegin = (matrix: number[]): Op => [OPS.paintFormXObjectBegin, [matrix, null]];
const formEnd = (): Op => [OPS.paintFormXObjectEnd, null];

function fuseFor(ops: Op[]) {
  const geo = extractVectorGeometry(opList(ops), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const { bodies } = proposeCandidateBodiesLaneB(idx, junctions);
  const laneA = computeFormContentSignatures(idx, geo.formInvocations ?? []);
  return { idx, bodies, laneA, fused: fuseProposals(idx, bodies, laneA.invocations) };
}

test("proposal fusion: a body seen ONLY by Lane B (no Form XObject at all) is a single-lane proposal", () => {
  const { fused } = fuseFor([closedRect(0, 0, 10, 10)]);
  assert.equal(fused.length, 1);
  assert.deepEqual(fused[0].votingLanes, ["B"]);
  assert.ok(fused[0].evidence.laneB && !fused[0].evidence.laneA);
});

test("proposal fusion: the SAME ink discovered by both Lane B (connectivity) and Lane A (it sits inside a Form XObject) fuses into ONE proposal voted by both", () => {
  const { fused } = fuseFor([formBegin(ID), closedRect(0, 0, 10, 10), formEnd()]);
  assert.equal(fused.length, 1, "one physical body, not two separate proposals for the same ink");
  assert.deepEqual(fused[0].votingLanes.slice().sort(), ["A", "B"]);
  assert.ok(fused[0].evidence.laneA && fused[0].evidence.laneB);
  assert.equal(fused[0].primitiveIds.length, 4, "the union is still just the rectangle's own 4 edges — nothing was double-counted");
});

test("proposal fusion: two SEPARATE, non-overlapping bodies never merge just because they are both real", () => {
  const { fused } = fuseFor([closedRect(0, 0, 10, 10), closedRect(1000, 1000, 10, 10)]);
  assert.equal(fused.length, 2);
  assert.ok(fused.every((f) => f.votingLanes.length === 1));
});

test("proposal fusion: an invocation whose own primitives are only a SMALL PART of a much larger Lane B body stays a separate A-only proposal — low overlap is not fused just because the sets intersect", () => {
  // the form's own one primitive is real, but the SAME primitive also
  // belongs (via shared endpoints) to a much bigger 5-primitive Lane B
  // body — Jaccard(1-of-5, 1-of-1) = 1/5 = 0.2, well under the default
  // 0.5 threshold, so this correctly does NOT collapse into one fusion.
  const { fused } = fuseFor([
    formBegin(ID), line(0, 0, 10, 0), formEnd(),
    // an open zigzag chain (no revisited point, so no accidental
    // degree-3 T-junction splitting it) — five segments, one Lane B
    // component, corner-to-corner.
    line(10, 0, 20, 0), line(20, 0, 20, 10), line(20, 10, 10, 10), line(10, 10, 0, 10),
  ]);
  const aOnly = fused.find((f) => f.votingLanes.length === 1 && f.evidence.laneA);
  const bOnly = fused.find((f) => f.votingLanes.length === 1 && f.evidence.laneB);
  assert.ok(aOnly, "the low-overlap Lane A invocation surfaces on its own, not silently absorbed or dropped");
  assert.ok(bOnly, "and the bigger Lane B body it was too small a fraction of also surfaces on its own");
  assert.equal(aOnly!.primitiveIds.length, 1);
  assert.equal(bOnly!.primitiveIds.length, 5);
});

test("proposal fusion: ordering ranks more-voted proposals first, ties broken by primitive count", () => {
  const { fused } = fuseFor([
    formBegin(ID), closedRect(0, 0, 10, 10), formEnd(),  // A+B, 4 primitives
    closedRect(1000, 0, 30, 30),                          // B only, 4 primitives
  ]);
  assert.equal(fused[0].votingLanes.length, 2, "the two-lane proposal ranks first");
  assert.equal(fused[1].votingLanes.length, 1);
  // ids are reassigned densely after sorting
  assert.deepEqual(fused.map((f) => f.id), [0, 1]);
});

test("proposal fusion: an empty sheet fuses to nothing", () => {
  const { fused } = fuseFor([]);
  assert.deepEqual(fused, []);
});
