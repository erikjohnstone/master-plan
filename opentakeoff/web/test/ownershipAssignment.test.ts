// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 4 requirement 7 (partial,
// per-primitive independent decision rule) + requirements 4/5's explicit
// unowned/exclusive and unassigned/ambiguous states.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { computeVectorSceneJunctions } from "../src/lib/vectorSceneRelations.ts";
import type { FusedProposal } from "../src/lib/candidateProposalFusion.ts";
import { detectOwnershipClusters } from "../src/lib/ownershipConflicts.ts";
import { scoreContestedPrimitives } from "../src/lib/ownershipEligibility.ts";
import { resolveClusterOwnership, resolveExclusiveOwnership } from "../src/lib/ownershipAssignment.ts";

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

test("ownership assignment: a contested primitive with a clear style+connectivity winner is ASSIGNED to it, not left ambiguous", () => {
  // primitive 1 is thin AND touches proposal 0's own exclusive ink at
  // (10,0) — proposal 0 wins on both signals, a decisive margin.
  const geo = extractVectorGeometry(opList([
    line(0, 0, 10, 0),                          // primitive 0 — thin, proposal 0's exclusive, touches primitive 1
    line(10, 0, 20, 0),                         // primitive 1 — CONTESTED, thin, touches primitive 0
    setWidth(15), line(1000, 1000, 1010, 1010), // primitive 2 — thick, far away, proposal 1's exclusive
  ]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0, 1]), proposal(1, [1, 2])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  const scores = scoreContestedPrimitives(clusters[0], proposalsById, idx, junctions);
  const { decisions, assignedCount, ambiguousCount } = resolveClusterOwnership(clusters[0], scores);
  assert.equal(assignedCount, 1);
  assert.equal(ambiguousCount, 0);
  assert.equal(decisions[0].proposalId, 0, "proposal 0 wins on both style and connectivity");
  assert.equal(decisions[0].state, "assigned");
  assert.equal(decisions[0].reason, "scored");
});

test("ownership assignment: a contested primitive with tied scores (no exclusive evidence anywhere) is reported AMBIGUOUS, never guessed", () => {
  // Neither proposal has ANY exclusive primitive here (every primitive
  // in this cluster is shared), so styleAgreement is neutral (0.5) and
  // connectivity is 0 for both claimants — an exact tie, the real
  // degenerate pattern found on a real corpus sheet during this slice's
  // own validation.
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0)]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0]), proposal(1, [0])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  assert.equal(clusters[0].exclusivePrimitiveIds.length, 0, "test premise: no exclusive evidence anywhere in this cluster");
  const scores = scoreContestedPrimitives(clusters[0], proposalsById, idx, junctions);
  const { decisions, assignedCount, ambiguousCount } = resolveClusterOwnership(clusters[0], scores);
  assert.equal(assignedCount, 0);
  assert.equal(ambiguousCount, 1);
  assert.equal(decisions[0].proposalId, null);
  assert.equal(decisions[0].state, "ambiguous");
  assert.equal(decisions[0].margin, 0);
});

test("ownership assignment: minMargin is a real, tunable threshold — a small non-zero margin below it is still ambiguous, and lowering the threshold flips it to assigned", () => {
  const geo = extractVectorGeometry(opList([
    line(0, 0, 10, 0),   // primitive 0 — proposal 0's exclusive
    line(10, 0, 20, 0),  // primitive 1 — CONTESTED, touches primitive 0
    line(10, 5, 20, 5),  // primitive 2 — proposal 1's exclusive, does NOT touch primitive 1 (parallel, offset)
  ]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0, 1]), proposal(1, [1, 2])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  const scores = scoreContestedPrimitives(clusters[0], proposalsById, idx, junctions);
  const strict = resolveClusterOwnership(clusters[0], scores, { minMargin: 0.99 });
  assert.equal(strict.decisions[0].state, "ambiguous", "an unreachable 0.99 margin makes even a real winner ambiguous");
  const lenient = resolveClusterOwnership(clusters[0], scores, { minMargin: 0 });
  assert.equal(lenient.decisions[0].state, "assigned", "a 0 margin accepts any non-negative lead");
  assert.equal(lenient.decisions[0].proposalId, 0);
});

test("ownership assignment: no primitive is EVER assigned to two proposals — every decision names at most one proposalId", () => {
  const geo = extractVectorGeometry(opList([
    line(0, 0, 10, 0), line(10, 0, 20, 0), line(20, 0, 30, 0),
    setWidth(15), line(1000, 1000, 1010, 1010),
  ]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0, 1]), proposal(1, [1, 2, 3])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  const scores = scoreContestedPrimitives(clusters[0], proposalsById, idx, junctions);
  const { decisions } = resolveClusterOwnership(clusters[0], scores);
  for (const d of decisions) {
    assert.ok(d.proposalId === null || typeof d.proposalId === "number", "exactly one proposalId or null, never a list/set of proposals");
  }
});

test("ownership assignment: exclusive primitives resolve to their sole claimant by direct membership, with reason 'exclusive' and no score", () => {
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0), line(20, 0, 30, 0), line(40, 0, 50, 0)]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const proposals = [proposal(0, [0, 1]), proposal(1, [1, 2])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  assert.deepEqual(clusters[0].exclusivePrimitiveIds, [0, 2]);
  const decisions = resolveExclusiveOwnership(clusters[0], proposalsById);
  const byId = new Map(decisions.map((d) => [d.primitiveId, d]));
  assert.equal(byId.get(0)?.proposalId, 0);
  assert.equal(byId.get(2)?.proposalId, 1);
  for (const d of decisions) {
    assert.equal(d.state, "assigned");
    assert.equal(d.reason, "exclusive");
    assert.equal(d.topScore, null);
  }
});
