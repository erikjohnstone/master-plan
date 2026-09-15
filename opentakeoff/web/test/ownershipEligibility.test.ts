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

function laneAProposal(id: number, primitiveIds: number[], bbox: { x0: number; y0: number; x1: number; y1: number }): FusedProposal {
  return { id, primitiveIds, ...bbox, votingLanes: ["A"], evidence: {} };
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

test("ownership eligibility: a contested primitive that reads as a carrier outlier WITHIN one proposal's own body scores lower carrier agreement for that proposal specifically", () => {
  // proposal 0 claims two short siblings (subpaths ~10 units) PLUS the
  // contested long one (1000 units) — within proposal 0's own set, the
  // long one is a dramatic outlier (carrierClassification.ts's own
  // sibling-median check), so it should score carrierAgreement 0 for
  // proposal 0. Proposal 1 claims ONLY the contested primitive — a
  // single-subpath set has no sibling to judge by, so it's "not
  // evaluable" and scores the neutral-favorable carrierAgreement 1.
  const fns = [OPS.moveTo, OPS.lineTo, OPS.moveTo, OPS.lineTo, OPS.moveTo, OPS.lineTo];
  const args = [0, 0, 10, 0, 0, 2, 11, 2, 0, 4, 1000, 4];
  const geo = extractVectorGeometry(opList([[OPS.constructPath, [fns, args]]]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0, 1, 2]), proposal(1, [2])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  assert.deepEqual(clusters[0].contestedPrimitiveIds, [2]);
  const scores = scoreContestedPrimitives(clusters[0], proposalsById, idx, junctions);
  const forP0 = scores.find((s) => s.proposalId === 0)!;
  const forP1 = scores.find((s) => s.proposalId === 1)!;
  assert.equal(forP0.carrierAgreement, 0, "primitive 2 is a dramatic outlier among proposal 0's own short siblings");
  assert.equal(forP1.carrierAgreement, 1, "proposal 1 has no sibling subpath to judge by — not evaluable, scored neutral-favorable");
  assert.ok(forP1.score > forP0.score, "the carrier signal should make proposal 1 the better overall fit here");
});

test("ownership eligibility: a Lane A proposal that shatters into many Lane B rivals (real structural finding — see formPlausibility.ts) scores 0 form-plausibility agreement, letting a Lane B rival win the tie", () => {
  // real shape found on Cherry Point #12 and tinker-afb-iwcs-controls.pdf#13:
  // one Lane A "whole Form" proposal (compact bbox, so aspect ratio never
  // confounds this) whose own 6 primitives are EACH separately contested
  // by a different single-primitive Lane B proposal — a 6-way shatter,
  // above the default 5 threshold. Six identical-length segments avoid
  // triggering the carrier signal as a confound; no primitive shares a
  // junction with any other, so connectivity ties at 0 for everyone; no
  // proposal here has its OWN exclusive primitives, so style ties at the
  // neutral 0.5 for everyone too — isolating formPlausibilityAgreement as
  // the only signal that can differ.
  const segs: Op[] = [];
  for (let i = 0; i < 6; i++) segs.push(line(i * 100, 0, i * 100 + 10, 0));
  const geo = extractVectorGeometry(opList(segs), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);

  const laneA = laneAProposal(0, [0, 1, 2, 3, 4, 5], { x0: 0, y0: 0, x1: 10, y1: 10 });
  const laneBRivals = [1, 2, 3, 4, 5, 6].map((id) => proposal(id, [id - 1]));
  const proposals = [laneA, ...laneBRivals];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].exclusivePrimitiveIds.length, 0, "test premise: matches the real structural finding — nothing exclusive anywhere");

  const scores = scoreContestedPrimitives(clusters[0], proposalsById, idx, junctions);
  const forLaneA = scores.find((s) => s.primitiveId === 0 && s.proposalId === 0)!;
  const forLaneBRival = scores.find((s) => s.primitiveId === 0 && s.proposalId === 1)!;
  assert.equal(forLaneA.formPlausibilityAgreement, 0, "the 6-way-shattered Lane A proposal is flagged implausible");
  assert.equal(forLaneBRival.formPlausibilityAgreement, 1, "a pure Lane B proposal has no plausibility concern of this kind");
  assert.ok(forLaneBRival.score > forLaneA.score, "the Lane B rival should now win this tie on form plausibility alone");
});

test("ownership eligibility: a contested primitive whose own shape/length/angle already matches one proposal's own exclusive signature scores higher graph-signature agreement for that proposal", () => {
  // proposal 0's exclusive (id 0) and the contested primitive (id 1) are
  // BOTH 10-unit horizontal lines — same type/length/angle, so the
  // contested one's own signature entry (computed relative to proposal
  // 0's own dominant orientation, which IS id 0's own 0 degrees) exactly
  // matches id 0's own entry. Proposal 1's exclusive (id 2) is ALSO a
  // 10-unit line (same length, so carrier's own sibling-ratio check ties
  // at "not an outlier" for both proposals, not a confound) but at 45
  // degrees instead of 0 — a real angle mismatch, not a length one, so
  // the contested primitive's own angle relative to proposal 1's own
  // dominant (45 degrees) lands in a different angle bucket. All three
  // primitives are far apart (no shared junctions: connectivity ties at 0
  // for both) and default style (styleAgreement ties at 1 for both), and
  // both proposals are Lane B only (formPlausibilityAgreement ties at 1
  // for both) — isolating graphSignatureAgreement as the only signal that
  // can differ.
  const geo = extractVectorGeometry(opList([
    line(0, 0, 10, 0),                 // primitive 0 — proposal 0's exclusive, 10 units @ 0deg
    line(1000, 1000, 1010, 1000),      // primitive 1 — CONTESTED, 10 units @ 0deg
    line(2000, 2000, 2007.0711, 2007.0711), // primitive 2 — proposal 1's exclusive, 10 units @ 45deg
  ]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0, 1]), proposal(1, [2, 1])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  assert.equal(clusters.length, 1);
  const scores = scoreContestedPrimitives(clusters[0], proposalsById, idx, junctions);
  const forP0 = scores.find((s) => s.proposalId === 0)!;
  const forP1 = scores.find((s) => s.proposalId === 1)!;
  assert.equal(forP0.graphSignatureAgreement, 1, "the contested line's own shape/length/angle already matches proposal 0's own exclusive entry");
  assert.equal(forP1.graphSignatureAgreement, 0, "the SAME contested line, evaluated relative to proposal 1's own 45-degree dominant orientation, lands in a different angle bucket");
  assert.equal(forP0.styleAgreement, forP1.styleAgreement, "test premise: style ties");
  assert.equal(forP0.connectivity, forP1.connectivity, "test premise: connectivity ties (no shared junctions anywhere)");
  assert.equal(forP0.carrierAgreement, forP1.carrierAgreement, "test premise: carrier ties (equal-length siblings on both sides)");
  assert.ok(forP0.score > forP1.score, "graph-signature agreement alone should make proposal 0 the better overall fit here");
});

test("ownership eligibility: a proposal with zero exclusive primitives has no dominant orientation to define, so graph-signature agreement is the neutral-favorable 0.5, not 0", () => {
  const geo = extractVectorGeometry(opList([line(0, 0, 10, 0), line(10, 0, 20, 0)]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const proposals = [proposal(0, [0, 1]), proposal(1, [1])];
  const proposalsById = new Map(proposals.map((p) => [p.id, p]));
  const { clusters } = detectOwnershipClusters(proposals);
  const scores = scoreContestedPrimitives(clusters[0], proposalsById, idx, junctions);
  const forP1 = scores.find((s) => s.proposalId === 1)!;
  assert.equal(forP1.graphSignatureAgreement, 0.5, "proposal 1 owns nothing exclusively (its only primitive is the contested one itself) — no dominant orientation, not evaluable, neutral rather than penalized");
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
