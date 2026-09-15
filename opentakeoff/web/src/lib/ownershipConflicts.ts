// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 4 — "explicit body
// isolation and exclusive primitive ownership," named as "the load-
// bearing fix for dense repeated arrays." FIRST slice: requirement 1,
// "for every local cluster of overlapping proposals, construct a
// primitive-to-instance ownership problem" — the DETECTION half. Finding
// which proposals conflict (share a primitive) and which specific
// primitives are contested is the necessary first step before any of
// requirements 2-8 (eligibility scoring, injective correspondence,
// assignment solving, an owned body bbox/polygon) can run; this module
// is that detection step, not the resolution.
//
// Built on candidateProposalFusion.ts's own FusedProposal (Phase 3's
// closing subsection) — this module never re-derives primitive ids or
// re-scans geometry, it only asks "which of these already-fused
// proposals disagree about who owns what."
//
// Deliberately NOT attempted in this slice (disclosed, real further
// work — requirements 2 through 8):
// - Eligibility scoring (Form/subpath membership, connectivity, graph/
//   path signature agreement, transform-consistent residual, style/layer
//   agreement, carrier-vs-body classification, mutual coverage).
// - Injective/mutual correspondence requirements for distinctive
//   reference primitives.
// - The explicit unowned/background and unassigned/ambiguous STATES a
//   real resolution needs (goal's own requirements 4 and 5) — this
//   slice only reports "contested," it does not decide an outcome.
// - The actual assignment solver (minimum-cost bipartite/rectangular
//   assignment for small clusters; a documented approximation + conflict
//   repair for large repeated grids) — requirement 6/7's own real
//   algorithmic work.
// - Producing an owned body bbox/polygon from OWNED (post-resolution)
//   primitives — requirement 8; this slice's own bboxes are still the
//   pre-resolution fused proposal bboxes.
import type { FusedProposal } from "./candidateProposalFusion.ts";

export interface OwnershipCluster {
  id: number;
  /** every FusedProposal id whose primitives overlap, directly or
   *  transitively, with another proposal in this cluster. */
  proposalIds: number[];
  /** a primitive claimed by 2 or more proposals in this cluster — exactly
   *  what requirement 1's own "ownership problem" is about. */
  contestedPrimitiveIds: number[];
  /** a primitive claimed by exactly one proposal in this cluster —
   *  informational: even inside a contested cluster, most primitives
   *  are usually NOT actually disputed. */
  exclusivePrimitiveIds: number[];
}

export interface OwnershipConflictResult {
  /** clusters of size >= 2 proposals — a real ownership problem exists. */
  clusters: OwnershipCluster[];
  /** proposal ids that shared no primitive with any other proposal —
   *  nothing to resolve, reported so a caller can tell "no conflict"
   *  apart from "not yet checked." */
  uncontested: number[];
}

/** Pure: detects which FusedProposals conflict (share at least one
 *  primitive) via union-find over proposals, then reports each cluster's
 *  contested vs. exclusive primitives. Never mutates `proposals`. */
export function detectOwnershipClusters(proposals: readonly FusedProposal[]): OwnershipConflictResult {
  const n = proposals.length;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  const claimants = new Map<number, number[]>(); // primitiveId -> proposal INDICES claiming it
  for (let i = 0; i < n; i++) {
    for (const pid of proposals[i].primitiveIds) {
      let arr = claimants.get(pid);
      if (!arr) { arr = []; claimants.set(pid, arr); }
      arr.push(i);
    }
  }
  for (const owners of claimants.values()) {
    for (let k = 1; k < owners.length; k++) union(owners[0], owners[k]);
  }

  const groups = new Map<number, number[]>(); // root index -> member proposal indices
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let arr = groups.get(r);
    if (!arr) { arr = []; groups.set(r, arr); }
    arr.push(i);
  }

  const clusters: OwnershipCluster[] = [];
  const uncontested: number[] = [];
  let clusterId = 0;
  for (const members of groups.values()) {
    if (members.length < 2) { uncontested.push(proposals[members[0]].id); continue; }
    const primitiveOwnerCount = new Map<number, number>();
    for (const idx of members) for (const pid of proposals[idx].primitiveIds) primitiveOwnerCount.set(pid, (primitiveOwnerCount.get(pid) ?? 0) + 1);
    const contestedPrimitiveIds: number[] = [];
    const exclusivePrimitiveIds: number[] = [];
    for (const [pid, count] of primitiveOwnerCount) (count > 1 ? contestedPrimitiveIds : exclusivePrimitiveIds).push(pid);
    contestedPrimitiveIds.sort((a, b) => a - b);
    exclusivePrimitiveIds.sort((a, b) => a - b);
    clusters.push({
      id: clusterId++,
      proposalIds: members.map((idx) => proposals[idx].id).sort((a, b) => a - b),
      contestedPrimitiveIds,
      exclusivePrimitiveIds,
    });
  }

  return { clusters, uncontested };
}
