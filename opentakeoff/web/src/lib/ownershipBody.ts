// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 4 requirement 8: "Produce
// an owned body bbox/polygon from owned primitives. This is the blue
// physical-symbol evidence shown to users. Keep tag evidence separately
// orange." This slice computes a proposal's TRUE post-resolution bbox
// from exactly the primitives it actually ended up owning inside one
// ownership cluster — its own exclusive primitives (resolveExclusiveOwnership's
// own output) PLUS any contested primitive ownershipAssignment.ts's own
// resolveClusterOwnership assigned to it. This is NOT the same as the
// proposal's original pre-resolution FusedProposal bbox:
// candidateProposalFusion.ts's own bbox spans every primitive the
// proposal originally CLAIMED, contested or not, so a proposal that lost
// some contested primitives to a rival, or whose claim was left
// ambiguous, must not have that geometry inflating its own accepted body
// evidence — exactly the gate's own concern ("no accepted instance's
// body bbox may be an empty patch, pure tag region, or leader-only
// region").
//
// Deliberately scoped to CLUSTER proposals only, not every proposal in a
// document: an UNCONTESTED proposal (ownershipConflicts.ts's own
// `uncontested` list — the overwhelming majority on every real sheet
// checked so far) was never disputed, so its own original FusedProposal
// bbox is already correct as-is; recomputing it here would be free-
// standing duplicate work this slice does not do.
//
// Deliberately NOT attempted here (disclosed, real further work): a real
// POLYGON (concave hull / alpha-shape) — this slice produces only an
// axis-aligned bbox, checkable directly against the gate's own "empty
// patch" condition without needing a polygon; tag-vs-body separation
// ("keep tag evidence separately orange") — this module has no notion of
// "tag" at all, since tag/leader identification hasn't been built yet
// (Phase 6 territory, per the goal document's own joint tag/leader/
// legend/schedule/body assignment phase).
import type { AssignmentDecision } from "./ownershipAssignment.ts";

export interface OwnedBody {
  proposalId: number;
  /** exclusive + assigned-contested primitive ids this proposal actually
   *  ended up owning, sorted ascending. Never includes an ambiguous
   *  primitive — an unresolved dispute is not accepted evidence for
   *  EITHER side. */
  primitiveIds: number[];
  x0: number; y0: number; x1: number; y1: number;
  /** true iff primitiveIds is empty — the gate's own "no accepted
   *  instance's body bbox may be an empty patch" condition, reported
   *  explicitly so a caller can reject/flag it rather than mistake a
   *  degenerate [0,0,0,0] bbox for real geometry. When true, x0..y1 are
   *  all 0 and MUST NOT be treated as a real (zero-area-at-origin) body. */
  isEmpty: boolean;
}

/** Pure: builds one OwnedBody per proposal that owns at least one
 *  primitive across `exclusiveDecisions` and `contestedDecisions`
 *  (both from ownershipAssignment.ts, for the SAME cluster). A proposal
 *  present in the cluster that ends up owning nothing at all (every
 *  contested primitive it claimed went to a rival or stayed ambiguous,
 *  and it had no exclusive primitives) still gets an explicit
 *  `isEmpty: true` entry — silently omitting it would hide exactly the
 *  degenerate case the gate exists to catch. Never mutates any input. */
export function computeOwnedBodies(
  exclusiveDecisions: readonly AssignmentDecision[],
  contestedDecisions: readonly AssignmentDecision[],
  idx: { primitives: readonly { x0: number; y0: number; x1: number; y1: number }[] },
  /** every proposal id known to be in this cluster (ownershipConflicts.ts's
   *  own OwnershipCluster.proposalIds) — passed explicitly so a proposal
   *  that owns NOTHING still gets its own isEmpty:true entry, rather than
   *  silently disappearing because it has zero decisions to iterate over. */
  clusterProposalIds: readonly number[],
): OwnedBody[] {
  const owned = new Map<number, number[]>();
  for (const propId of clusterProposalIds) owned.set(propId, []);
  for (const d of [...exclusiveDecisions, ...contestedDecisions]) {
    if (d.proposalId === null) continue; // ambiguous — accepted evidence for no one
    let arr = owned.get(d.proposalId);
    if (!arr) { arr = []; owned.set(d.proposalId, arr); }
    arr.push(d.primitiveId);
  }

  const bodies: OwnedBody[] = [];
  for (const [proposalId, primitiveIdsUnsorted] of owned) {
    const primitiveIds = [...primitiveIdsUnsorted].sort((a, b) => a - b);
    if (primitiveIds.length === 0) {
      bodies.push({ proposalId, primitiveIds, x0: 0, y0: 0, x1: 0, y1: 0, isEmpty: true });
      continue;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const pid of primitiveIds) {
      const p = idx.primitives[pid];
      if (p.x0 < x0) x0 = p.x0;
      if (p.y0 < y0) y0 = p.y0;
      if (p.x1 > x1) x1 = p.x1;
      if (p.y1 > y1) y1 = p.y1;
    }
    bodies.push({ proposalId, primitiveIds, x0, y0, x1, y1, isEmpty: false });
  }
  bodies.sort((a, b) => a.proposalId - b.proposalId);
  return bodies;
}
