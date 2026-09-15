// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 4 requirement 8: owned
// body bbox from post-resolution owned primitives.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { computeVectorSceneJunctions } from "../src/lib/vectorSceneRelations.ts";
import type { FusedProposal } from "../src/lib/candidateProposalFusion.ts";
import { detectOwnershipClusters } from "../src/lib/ownershipConflicts.ts";
import { scoreContestedPrimitives } from "../src/lib/ownershipEligibility.ts";
import { resolveClusterOwnership, resolveExclusiveOwnership } from "../src/lib/ownershipAssignment.ts";
import { computeOwnedBodies } from "../src/lib/ownershipBody.ts";

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

test("ownership body: a proposal's owned bbox reflects only its exclusive + WON contested primitives, smaller than its original fused superset", () => {
  // proposal 0 originally claims [0, 1] (a 0..10 segment plus a 10..20
  // one it will WIN via style+connectivity); proposal 1 originally
  // claims [1, 2] (the same contested segment plus its own far-away
  // exclusive one at 1000,1000). Proposal 1's ORIGINAL fused bbox would
  // span all the way to (1010,1010) — but it should LOSE primitive 1, so
  // its OWNED bbox must be just its own exclusive primitive 2, not that
  // whole span.
  const geo = extractVectorGeometry(opList([
    line(0, 0, 10, 0),                          // primitive 0 — proposal 0's exclusive, touches primitive 1
    line(10, 0, 20, 0),                         // primitive 1 — CONTESTED, thin, touches primitive 0
    setWidth(15), line(1000, 1000, 1010, 1010), // primitive 2 — thick, proposal 1's exclusive
  ]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0, 1]), proposal(1, [1, 2])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  const cluster = clusters[0];
  const scores = scoreContestedPrimitives(cluster, proposalsById, idx, junctions);
  const { decisions: contested } = resolveClusterOwnership(cluster, scores);
  const exclusive = resolveExclusiveOwnership(cluster, proposalsById);
  const bodies = computeOwnedBodies(exclusive, contested, idx, cluster.proposalIds);

  const body0 = bodies.find((b) => b.proposalId === 0)!;
  const body1 = bodies.find((b) => b.proposalId === 1)!;
  assert.deepEqual(body0.primitiveIds, [0, 1], "proposal 0 keeps its exclusive primitive 0 AND wins contested primitive 1");
  assert.equal(body0.isEmpty, false);
  assert.equal(body0.x1, 20, "proposal 0's owned bbox extends to x=20 (both primitives it owns)");

  assert.deepEqual(body1.primitiveIds, [2], "proposal 1 LOSES contested primitive 1, keeps only its own exclusive primitive 2");
  assert.equal(body1.isEmpty, false);
  assert.equal(body1.x0, 1000, "proposal 1's owned bbox must NOT include the lost primitive 1's geometry (0..20) it originally claimed");
});

test("ownership body: a proposal that ends up owning nothing at all still gets an explicit isEmpty:true entry, not silent omission", () => {
  // Both proposals here share their ONLY primitive and neither has any
  // exclusive evidence anywhere in the cluster — a pure tie, so
  // resolveClusterOwnership reports it ambiguous, and NEITHER proposal
  // should end up owning anything.
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0)]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0]), proposal(1, [0])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  const cluster = clusters[0];
  const scores = scoreContestedPrimitives(cluster, proposalsById, idx, junctions);
  const { decisions: contested } = resolveClusterOwnership(cluster, scores);
  const exclusive = resolveExclusiveOwnership(cluster, proposalsById);
  const bodies = computeOwnedBodies(exclusive, contested, idx, cluster.proposalIds);

  assert.equal(bodies.length, 2, "both cluster proposals get an entry, even though both own nothing");
  for (const b of bodies) {
    assert.equal(b.isEmpty, true);
    assert.deepEqual(b.primitiveIds, []);
    assert.deepEqual([b.x0, b.y0, b.x1, b.y1], [0, 0, 0, 0]);
  }
});

test("ownership body: an ambiguous primitive is never included in ANY proposal's owned body", () => {
  const geo = extractVectorGeometry(opList([
    line(0, 0, 10, 0), line(10, 0, 20, 0),
  ]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0, 1]), proposal(1, [1])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  const cluster = clusters[0];
  assert.deepEqual(cluster.contestedPrimitiveIds, [1]);
  const scores = scoreContestedPrimitives(cluster, proposalsById, idx, junctions);
  const { decisions: contested } = resolveClusterOwnership(cluster, scores, { minMargin: 2 }); // force ambiguous
  assert.equal(contested[0].state, "ambiguous");
  const exclusive = resolveExclusiveOwnership(cluster, proposalsById);
  const bodies = computeOwnedBodies(exclusive, contested, idx, cluster.proposalIds);
  for (const b of bodies) assert.ok(!b.primitiveIds.includes(1), "primitive 1 was left ambiguous — no proposal may claim it as owned");
});
