// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 4 requirement 2 (partial):
// style/layer agreement + connectivity scoring for contested primitives.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { computeVectorSceneJunctions } from "../src/lib/vectorSceneRelations.ts";
import type { FusedProposal } from "../src/lib/candidateProposalFusion.ts";
import { detectOwnershipClusters } from "../src/lib/ownershipConflicts.ts";
import { scoreContestedPrimitives } from "../src/lib/ownershipEligibility.ts";

const OPS = {
  save: 1, restore: 2, setLineWidth: 4,
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];
const setWidth = (w: number): Op => [OPS.setLineWidth, [w]];

function proposal(id: number, primitiveIds: number[]): FusedProposal {
  return { id, primitiveIds, x0: 0, y0: 0, x1: 1, y1: 1, votingLanes: ["B"], evidence: {} };
}

test("ownership eligibility: a contested primitive matching one proposal's own dominant line width scores higher style agreement for that proposal", () => {
  // proposal 0's exclusive primitive (id 0) is thin (width default 1);
  // proposal 1's exclusive primitive (id 2) is thick (setLineWidth 15,
  // heavily scaled). The contested primitive (id 1) is thin, like
  // proposal 0's own style.
  const geo = extractVectorGeometry(opList([
    line(0, 0, 10, 0),                          // primitive 0 — thin, proposal 0's exclusive
    line(20, 0, 30, 0),                         // primitive 1 — thin, CONTESTED
    setWidth(15), line(1000, 1000, 1010, 1010), // primitive 2 — thick, proposal 1's exclusive
  ]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0, 1]), proposal(1, [1, 2])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  assert.equal(clusters.length, 1);
  const scores = scoreContestedPrimitives(clusters[0], proposalsById, idx, junctions);
  const forP0 = scores.find((s) => s.proposalId === 0)!;
  const forP1 = scores.find((s) => s.proposalId === 1)!;
  assert.ok(forP0.styleAgreement > forP1.styleAgreement, "the thin contested primitive agrees with proposal 0's own thin style, not proposal 1's thick one");
});

test("ownership eligibility: a contested primitive junction-connected to one proposal's exclusive ink scores higher connectivity for that proposal", () => {
  const geo = extractVectorGeometry(opList([
    line(0, 0, 10, 0),      // primitive 0 — proposal 0's exclusive
    line(10, 0, 20, 0),     // primitive 1 — CONTESTED, touches primitive 0 at (10,0)
    line(1000, 1000, 1010, 1000), // primitive 2 — proposal 1's exclusive, far away, no junction with primitive 1
  ]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0, 1]), proposal(1, [1, 2])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  const scores = scoreContestedPrimitives(clusters[0], proposalsById, idx, junctions);
  const forP0 = scores.find((s) => s.proposalId === 0)!;
  const forP1 = scores.find((s) => s.proposalId === 1)!;
  assert.ok(forP0.connectivity > forP1.connectivity, "primitive 1 physically touches proposal 0's own exclusive ink, not proposal 1's");
});

test("ownership eligibility: every contested primitive gets a score entry for EVERY proposal that actually claims it, and none for proposals that don't", () => {
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0), line(10, 0, 20, 0), line(20, 0, 30, 0)]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0, 1]), proposal(1, [1, 2])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  const scores = scoreContestedPrimitives(clusters[0], proposalsById, idx, junctions);
  assert.equal(scores.length, 2, "one contested primitive (id 1) x two claiming proposals");
  assert.deepEqual(scores.map((s) => s.proposalId).sort(), [0, 1]);
});

test("ownership eligibility: two proposals sharing zero primitives are both uncontested (detectOwnershipClusters itself, not scoreContestedPrimitives)", () => {
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0), line(100, 0, 110, 0)]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0]), proposal(1, [1])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { uncontested } = detectOwnershipClusters(proposals);
  assert.deepEqual(uncontested.sort(), [0, 1]);
});

test("ownership eligibility: a cluster with an empty contestedPrimitiveIds array produces no scores at all, from scoreContestedPrimitives itself", () => {
  // Constructed directly (not via detectOwnershipClusters, which never emits
  // a cluster with zero contested primitives) so this test genuinely
  // exercises scoreContestedPrimitives's own empty-input behavior, rather
  // than only re-asserting detectOwnershipClusters's own separate contract.
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0), line(20, 0, 30, 0)]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0]), proposal(1, [1])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const emptyCluster = { id: 0, proposalIds: [0, 1], contestedPrimitiveIds: [], exclusivePrimitiveIds: [0, 1] };
  const scores = scoreContestedPrimitives(emptyCluster, proposalsById, idx, junctions);
  assert.deepEqual(scores, []);
});
