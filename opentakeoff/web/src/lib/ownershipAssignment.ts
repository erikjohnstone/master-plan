// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 4 requirement 7: "For
// primitive ownership, use deterministic branch-and-bound, min-cost flow,
// or another exact/controlled method for small clusters. For large
// repeated grids, use a documented approximation followed by conflict
// repair; disclose incomplete results if work caps hit." Also wires up
// requirement 4's "explicit unowned/background state" (for the EXCLUSIVE
// half of a cluster, direct membership already settles ownership with no
// scoring needed) and requirement 5's "explicit unassigned candidate state
// so ambiguity can abstain" (for a CONTESTED primitive whose top two
// claimants are too close to call).
//
// This slice is deliberately NOT the full branch-and-bound/min-cost-flow
// joint solve requirement 7 asks for: it treats each contested primitive's
// decision as INDEPENDENT, using ownershipEligibility.ts's own static
// per-primitive scores (computed once, against each proposal's fixed
// exclusive-primitive baseline — not iteratively re-scored as other
// primitives in the same cluster get assigned). A true joint solve would
// let assigning one contested primitive change another's own connectivity
// evidence within the same cluster; that interaction is real further work,
// disclosed here rather than silently approximated as if it were the full
// algorithm. What this slice DOES give, honestly: a deterministic,
// re-runnable decision rule with an explicit margin-of-confidence
// threshold, and an explicit "ambiguous, abstain" state — never a silent,
// arbitrary tie-break — which is precisely what lets Phase 4's own gate
// ("no primitive can support two accepted physical instances") hold by
// construction: a decision names at most one proposalId, never two, and a
// low-margin case reports null (unassigned) rather than guessing.
//
// Requirement 6 (minimum-cost bipartite/rectangular assignment) is NOT
// this module — the goal document names that explicitly for "tag-to-body
// and schedule-to-body matching," a different, later (Phase 6) assignment
// problem, not primitive-to-instance ownership within one cluster.
import type { OwnershipCluster } from "./ownershipConflicts.ts";
import type { EligibilityScore } from "./ownershipEligibility.ts";

export interface AssignmentDecision {
  primitiveId: number;
  /** the proposal this primitive is assigned to, or null when unassigned
   *  (ambiguous — requirement 5's own explicit abstain state). */
  proposalId: number | null;
  state: "assigned" | "ambiguous";
  /** why: "exclusive" (direct membership, requirement 2's first signal,
   *  already conclusive — no scoring needed) or "scored" (won on
   *  eligibility score margin) or "ambiguous" (top two scores too close). */
  reason: "exclusive" | "scored" | "ambiguous";
  /** the winning score, or null for an "exclusive" decision (no score was
   *  computed — direct membership already settled it). */
  topScore: number | null;
  /** topScore minus the second-best score among this primitive's own
   *  claimants, or null when there's no second claimant to compare
   *  against (never true for a genuinely contested primitive, by
   *  ownershipConflicts.ts's own contested-means-2+-claimants contract;
   *  present for symmetry and defensive callers). */
  margin: number | null;
}

export interface AssignmentResult {
  decisions: AssignmentDecision[];
  assignedCount: number;
  ambiguousCount: number;
}

const DEFAULT_MIN_MARGIN = 0.05;

/** Pure: resolves ownership for every primitive (exclusive AND contested)
 *  in `cluster`, using `scores` (ownershipEligibility.ts's own output for
 *  this same cluster) to break contested ties. Never mutates any input.
 *  `opts.minMargin`: the minimum gap between the best and second-best
 *  score required to accept a contested primitive's top claimant, rather
 *  than reporting it ambiguous — a real, disclosed, tunable confidence
 *  threshold, not a hardcoded magic number a caller can't see or adjust. */
export function resolveClusterOwnership(
  cluster: OwnershipCluster,
  scores: readonly EligibilityScore[],
  opts: { minMargin?: number } = {},
): AssignmentResult {
  const minMargin = opts.minMargin ?? DEFAULT_MIN_MARGIN;
  const decisions: AssignmentDecision[] = [];

  // Only the CONTESTED half of the cluster is resolved here — an
  // exclusive primitive's claimant is already settled by direct
  // membership, with no score to weigh; see resolveExclusiveOwnership
  // below for that half, which a caller combines with this one for a
  // complete per-cluster picture.
  for (const pid of cluster.contestedPrimitiveIds) {
    const forPrimitive = scores.filter((s) => s.primitiveId === pid);
    if (forPrimitive.length === 0) {
      // Should never happen given ownershipEligibility.ts's own contract
      // (every contested primitive gets one score entry per claimant, and
      // a contested primitive always has 2+ claimants) — reported as
      // ambiguous rather than thrown, since a caller passing a partial or
      // stale `scores` array is a data-consistency bug this function
      // should surface as "cannot decide," not crash on.
      decisions.push({ primitiveId: pid, proposalId: null, state: "ambiguous", reason: "ambiguous", topScore: null, margin: null });
      continue;
    }
    const sorted = [...forPrimitive].sort((a, b) => b.score - a.score);
    const best = sorted[0];
    const secondScore = sorted.length > 1 ? sorted[1].score : null;
    const margin = secondScore === null ? null : best.score - secondScore;
    if (margin === null || margin >= minMargin) {
      decisions.push({ primitiveId: pid, proposalId: best.proposalId, state: "assigned", reason: "scored", topScore: best.score, margin });
    } else {
      decisions.push({ primitiveId: pid, proposalId: null, state: "ambiguous", reason: "ambiguous", topScore: best.score, margin });
    }
  }

  const assignedCount = decisions.filter((d) => d.state === "assigned").length;
  const ambiguousCount = decisions.filter((d) => d.state === "ambiguous").length;
  return { decisions, assignedCount, ambiguousCount };
}

/** Pure: resolves an exclusive primitive's sole claimant by direct
 *  membership — requirement 2's first listed signal ("direct Form/
 *  subpath membership"), already conclusive with no scoring needed.
 *  Takes the same `proposalsById` map ownershipEligibility.ts itself
 *  takes, so a caller building a COMPLETE per-cluster ownership picture
 *  (exclusive + contested together) never has to re-derive claimant
 *  lookup twice with two different data shapes. */
export function resolveExclusiveOwnership(
  cluster: OwnershipCluster,
  proposalsById: ReadonlyMap<number, { primitiveIds: readonly number[] }>,
): AssignmentDecision[] {
  const claimantOf = new Map<number, number>();
  for (const propId of cluster.proposalIds) {
    const prims = proposalsById.get(propId)?.primitiveIds ?? [];
    for (const pid of prims) if (!claimantOf.has(pid)) claimantOf.set(pid, propId);
    // (a primitive appearing in more than one proposal here would be
    // CONTESTED, not exclusive — cluster.exclusivePrimitiveIds already
    // guarantees exactly one claimant per id, so the first write above is
    // also the only real one; `!claimantOf.has` is defensive, not load-
    // bearing.)
  }
  return cluster.exclusivePrimitiveIds.map((pid) => ({
    primitiveId: pid,
    proposalId: claimantOf.get(pid) ?? null,
    state: "assigned" as const,
    reason: "exclusive" as const,
    topScore: null,
    margin: null,
  }));
}
