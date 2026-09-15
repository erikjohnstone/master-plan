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
import { resolveClusterOwnership, resolveExclusiveOwnership, resolveClusterOwnershipIteratively } from "../src/lib/ownershipAssignment.ts";

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

test("ownership assignment (iterative): a primitive touching only a CONTESTED neighbor (not yet anyone's confirmed evidence) stays ambiguous in the static one-shot decision rule, but resolves once its neighbor is confirmed in an earlier round", () => {
  // Chain: 0 (proposal 0's exclusive) -- 1 (contested, touches 0 only) --
  // 2 (contested, touches 1 only). Primitive 3 (proposal 1's exclusive) is
  // styled/oriented identically to 0/1/2 but far away and touches nothing,
  // so style/carrier/form/graph-signature are exactly TIED for primitive 2
  // in round 0 -- only connectivity can ever break the tie, and primitive
  // 2's only neighbor (1) isn't anyone's confirmed evidence yet in round 0.
  const geo = extractVectorGeometry(opList([
    line(0, 0, 10, 0),      // primitive 0 -- proposal 0's exclusive
    line(10, 0, 20, 0),     // primitive 1 -- contested, touches primitive 0
    line(20, 0, 30, 0),     // primitive 2 -- contested, touches primitive 1 ONLY
    line(1000, 0, 1010, 0), // primitive 3 -- proposal 1's exclusive, same style/orientation, no junction to anything
  ]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0, 1, 2]), proposal(1, [1, 2, 3])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  assert.deepEqual(clusters[0].exclusivePrimitiveIds, [0, 3]);
  assert.deepEqual(clusters[0].contestedPrimitiveIds, [1, 2]);

  // The static, non-iterative rule (today's resolveClusterOwnership, fed
  // round-0 scores) genuinely cannot break primitive 2's tie -- this is
  // the real gap the iterative version exists to close, not a strawman.
  const round0Scores = scoreContestedPrimitives(clusters[0], proposalsById, idx, junctions);
  const oneShot = resolveClusterOwnership(clusters[0], round0Scores);
  const oneShotByPid = new Map(oneShot.decisions.map((d) => [d.primitiveId, d]));
  assert.equal(oneShotByPid.get(1)?.state, "assigned", "primitive 1 has direct connectivity to proposal 0's own exclusive ink even in round 0");
  assert.equal(oneShotByPid.get(2)?.state, "ambiguous", "primitive 2's only neighbor (1) is still contested in round 0 -- a real, un-fudged tie");
  assert.equal(oneShotByPid.get(2)?.margin, 0);

  const iterative = resolveClusterOwnershipIteratively(clusters[0], proposalsById, idx, junctions);
  assert.equal(iterative.rounds, 2, "primitive 2 genuinely needed a second round -- this is real iteration, not a single pass-through");
  assert.equal(iterative.hitRoundCap, false);
  assert.equal(iterative.assignedCount, 2);
  assert.equal(iterative.ambiguousCount, 0);
  const iterByPid = new Map(iterative.decisions.map((d) => [d.primitiveId, d]));
  assert.equal(iterByPid.get(1)?.proposalId, 0);
  assert.equal(iterByPid.get(2)?.proposalId, 0, "round 1 confirming primitive 1 as proposal 0's evidence lets round 2 correctly resolve primitive 2 too");
  // 5 of 6 signals are now a perfect 1 for proposal 0 (connectivity is
  // 1/1 -- its only neighbor is now confirmed evidence); coverageAgreement
  // stays the same real 2/3 it was in round 0 (proposal 0's own full set
  // {0,1,2} and proposal 1's own full set {1,2,3} mutually contain 2 of
  // each other's 3 members, unaffected by round 1's own confirmation),
  // giving (1+1+1+1+1+2/3)/6 = 17/18, not a clean 1 -- this signal is
  // real, not a rounding artifact of the other five.
  assert.ok(Math.abs((iterByPid.get(2)?.topScore ?? 0) - 17 / 18) < 1e-9, "5 of 6 signals are perfect; coverageAgreement's own real 2/3 keeps the average just under 1");
});

test("ownership assignment (iterative): a disclosed maxRounds cap stops further repair honestly -- the cut-off primitive is reported ambiguous, never silently dropped or guessed", () => {
  const geo = extractVectorGeometry(opList([
    line(0, 0, 10, 0), line(10, 0, 20, 0), line(20, 0, 30, 0), line(1000, 0, 1010, 0),
  ]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0, 1, 2]), proposal(1, [1, 2, 3])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  const capped = resolveClusterOwnershipIteratively(clusters[0], proposalsById, idx, junctions, { maxRounds: 1 });
  assert.equal(capped.rounds, 1);
  assert.equal(capped.hitRoundCap, true);
  assert.equal(capped.assignedCount, 1);
  assert.equal(capped.ambiguousCount, 1);
  const byPid = new Map(capped.decisions.map((d) => [d.primitiveId, d]));
  assert.equal(byPid.get(1)?.state, "assigned", "the primitive round 1 already resolves is unaffected by the cap");
  assert.equal(byPid.get(2)?.state, "ambiguous", "cut off by the cap -- a real disclosed limit, still an honest decision entry, not an omission");
  assert.equal(byPid.get(2)?.proposalId, null);
});

test("ownership assignment (iterative): a real stable tie (no exclusive evidence anywhere, same as the non-iterative degenerate case) converges in exactly one round -- no infinite loop chasing a tie that will never break", () => {
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0)]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0]), proposal(1, [0])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  const result = resolveClusterOwnershipIteratively(clusters[0], proposalsById, idx, junctions);
  assert.equal(result.rounds, 1, "no progress on round 1 means stop immediately -- real stable ambiguity, not forced convergence");
  assert.equal(result.hitRoundCap, false, "it stopped because nothing changed, not because it hit the round cap");
  assert.equal(result.assignedCount, 0);
  assert.equal(result.ambiguousCount, 1);
  assert.equal(result.decisions[0].proposalId, null);
});
