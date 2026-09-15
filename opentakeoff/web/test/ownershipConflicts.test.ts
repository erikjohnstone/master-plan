// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 4 — first slice: detecting
// which fused proposals conflict (share a primitive) and which specific
// primitives are contested, before any resolution is attempted.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { FusedProposal } from "../src/lib/candidateProposalFusion.ts";
import { detectOwnershipClusters } from "../src/lib/ownershipConflicts.ts";

function proposal(id: number, primitiveIds: number[]): FusedProposal {
  return { id, primitiveIds, x0: 0, y0: 0, x1: 1, y1: 1, votingLanes: ["B"], evidence: {} };
}

test("ownership conflicts: two proposals sharing zero primitives are both uncontested", () => {
  const r = detectOwnershipClusters([proposal(0, [1, 2]), proposal(1, [3, 4])]);
  assert.deepEqual(r.clusters, []);
  assert.deepEqual(r.uncontested.sort(), [0, 1]);
});

test("ownership conflicts: two proposals sharing exactly one primitive form one cluster with that primitive contested", () => {
  const r = detectOwnershipClusters([proposal(0, [1, 2, 3]), proposal(1, [3, 4, 5])]);
  assert.equal(r.clusters.length, 1);
  assert.deepEqual(r.clusters[0].proposalIds, [0, 1]);
  assert.deepEqual(r.clusters[0].contestedPrimitiveIds, [3]);
  assert.deepEqual(r.clusters[0].exclusivePrimitiveIds, [1, 2, 4, 5]);
  assert.deepEqual(r.uncontested, []);
});

test("ownership conflicts: three proposals in a chain (A-B share one, B-C share another) form ONE transitive cluster, not two", () => {
  const r = detectOwnershipClusters([proposal(0, [1, 2]), proposal(1, [2, 3]), proposal(2, [3, 4])]);
  assert.equal(r.clusters.length, 1, "A and C are only connected THROUGH B — union-find must catch the transitive link");
  assert.deepEqual(r.clusters[0].proposalIds, [0, 1, 2]);
  assert.deepEqual(r.clusters[0].contestedPrimitiveIds, [2, 3]);
});

test("ownership conflicts: a primitive claimed by three proposals at once is still just one contested id, not three", () => {
  const r = detectOwnershipClusters([proposal(0, [9]), proposal(1, [9]), proposal(2, [9])]);
  assert.equal(r.clusters.length, 1);
  assert.deepEqual(r.clusters[0].contestedPrimitiveIds, [9]);
  assert.deepEqual(r.clusters[0].proposalIds, [0, 1, 2]);
});

test("ownership conflicts: an isolated group and a conflicting pair are reported independently in one call", () => {
  const r = detectOwnershipClusters([
    proposal(0, [1, 2]),           // uncontested
    proposal(1, [10, 11]), proposal(2, [11, 12]),  // one cluster
  ]);
  assert.deepEqual(r.uncontested, [0]);
  assert.equal(r.clusters.length, 1);
  assert.deepEqual(r.clusters[0].proposalIds, [1, 2]);
});

test("ownership conflicts: an empty proposal list produces no clusters and no uncontested entries", () => {
  const r = detectOwnershipClusters([]);
  assert.deepEqual(r.clusters, []);
  assert.deepEqual(r.uncontested, []);
});
