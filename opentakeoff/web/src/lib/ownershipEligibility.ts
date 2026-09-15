// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 4 requirement 2 (partial):
// "Score primitive eligibility using: direct Form/subpath membership,
// connectivity inside the proposed body, graph/path signature agreement,
// transform-consistent residual, style/layer agreement, carrier versus
// body classification, mutual reference-to-candidate and candidate-to-
// reference coverage." This slice scores a CONTESTED primitive
// (ownershipConflicts.ts's own output) against each proposal claiming it,
// using three of the seven listed signals, each fully buildable from
// this session's own infrastructure without further phases:
//
// - STYLE/LAYER AGREEMENT: compares a contested primitive's own
//   deviceLineWidth/dashed/layerId against each claiming proposal's own
//   DOMINANT style, computed from that proposal's EXCLUSIVE (uncontested)
//   primitives — the part of the proposal nobody disputes is the most
//   honest evidence of what that proposal's own real style actually is.
// - CONNECTIVITY: what fraction of the OTHER primitives sharing a
//   junction with this one belong to the proposal's own exclusive set —
//   a contested primitive physically touching a proposal's own
//   undisputed ink is real structural evidence for that proposal.
// - CARRIER/BODY AGREEMENT (added after carrierClassification.ts):
//   carrierClassification.ts's own within-proposal sibling-outlier check,
//   run against EACH claiming proposal's own full primitiveIds — a
//   contested primitive that reads as a carrier OUTLIER inside proposal
//   X's own candidate set (dramatically longer than X's other subpaths)
//   is real evidence it does NOT belong with X's other members, so it
//   scores 0 agreement for X; not flagged (including "not evaluable" —
//   a single-subpath proposal has no sibling to judge by) scores 1,
//   neutral-favorable rather than penalized for missing evidence.
//
// Deliberately NOT attempted in this slice (disclosed, real further
// work — the rest of requirement 2's own list): graph/path signature
// agreement (candidateBodySignature.ts's own signatures are per-BODY, not
// per-primitive-against-a-body — comparing a single contested primitive's
// own local role against a signature is a different computation, not yet
// built); transform-consistent residual (needs Phase 5's own rigid/affine
// verification, which has not been built); mutual reference-to-candidate/
// candidate-to-reference coverage (Phase 5/6 territory). Requirements 3-8
// (injective correspondence, explicit unowned/unassigned states, the
// actual assignment solver, an owned body bbox/polygon) are handled by
// sibling modules (ownershipAssignment.ts, ownershipBody.ts) or not yet
// attempted — this module SCORES, it does not decide an outcome.
import type { VectorSceneIndex } from "./vectorSceneIndex.ts";
import type { Junction } from "./vectorSceneRelations.ts";
import type { FusedProposal } from "./candidateProposalFusion.ts";
import type { OwnershipCluster } from "./ownershipConflicts.ts";
import { classifyCarrierPrimitives } from "./carrierClassification.ts";

export interface EligibilityScore {
  primitiveId: number;
  proposalId: number;
  styleAgreement: number;   // 0-1
  connectivity: number;     // 0-1
  carrierAgreement: number; // 0-1 — 0 iff flagged carrier-like within this proposal's own set
  /** simple, disclosed, unweighted average of the three signals above —
   *  not a calibrated model (goal's own longer requirement-2 list has
   *  four more signals this slice does not compute; a real combined
   *  score needs all of them, not just these three). */
  score: number;
}

interface DominantStyle { deviceLineWidth: number | null; dashed: boolean | null; layerId: string | null | undefined; }

function mode<T>(values: T[]): T | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T = values[0], bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) { bestCount = c; best = v; }
  return best;
}

function dominantStyleOf(idx: VectorSceneIndex, primitiveIds: readonly number[]): DominantStyle {
  const widths: number[] = [], dashes: boolean[] = [], layers: (string | null)[] = [];
  for (const pid of primitiveIds) {
    const p = idx.primitives[pid];
    widths.push(p.deviceLineWidth);
    layers.push(p.layerId);
    if (p.subpathId >= 0) dashes.push(idx.subpaths[p.subpathId].dashed);
  }
  return { deviceLineWidth: mode(widths), dashed: dashes.length ? mode(dashes) : null, layerId: layers.length ? mode(layers) : undefined };
}

/** Pure: scores every contested primitive in `cluster` against every
 *  proposal in the cluster that claims it. Never mutates any input. */
export function scoreContestedPrimitives(
  cluster: OwnershipCluster,
  proposalsById: ReadonlyMap<number, FusedProposal>,
  idx: VectorSceneIndex,
  junctions: readonly Junction[],
): EligibilityScore[] {
  const exclusiveSetByProposal = new Map<number, Set<number>>();
  const styleByProposal = new Map<number, DominantStyle>();
  const primitiveSetByProposal = new Map<number, Set<number>>();
  const carrierFlagByProposal = new Map<number, Map<number, boolean>>();
  const exclusiveIdSet = new Set(cluster.exclusivePrimitiveIds);
  for (const propId of cluster.proposalIds) {
    const proposalPrims = proposalsById.get(propId)?.primitiveIds ?? [];
    primitiveSetByProposal.set(propId, new Set(proposalPrims));
    const exclusive = proposalPrims.filter((pid) => exclusiveIdSet.has(pid));
    exclusiveSetByProposal.set(propId, new Set(exclusive));
    styleByProposal.set(propId, dominantStyleOf(idx, exclusive));

    // carrier/body agreement, computed once per proposal (not once per
    // contested primitive) — see carrierClassification.ts's own header
    // for why this is a within-proposal sibling comparison, run here
    // against EACH claiming proposal's own full primitiveIds.
    const carrierResults = classifyCarrierPrimitives(proposalPrims, idx);
    const flagByPrimitive = new Map<number, boolean>();
    for (const r of carrierResults) flagByPrimitive.set(r.primitiveId, r.isCarrierLike);
    carrierFlagByProposal.set(propId, flagByPrimitive);
  }

  // primitiveId -> ids of OTHER primitives sharing a junction with it
  const neighborsOf = new Map<number, Set<number>>();
  for (const j of junctions) {
    for (const a of j.members) {
      let set = neighborsOf.get(a.primitiveId);
      if (!set) { set = new Set(); neighborsOf.set(a.primitiveId, set); }
      for (const b of j.members) if (b.primitiveId !== a.primitiveId) set.add(b.primitiveId);
    }
  }

  const results: EligibilityScore[] = [];
  for (const pid of cluster.contestedPrimitiveIds) {
    const p = idx.primitives[pid];
    const pDashed = p.subpathId >= 0 ? idx.subpaths[p.subpathId].dashed : null;
    const neighbors = neighborsOf.get(pid) ?? new Set<number>();

    for (const propId of cluster.proposalIds) {
      if (!primitiveSetByProposal.get(propId)?.has(pid)) continue;

      const style = styleByProposal.get(propId)!;
      let matches = 0, checks = 0;
      if (style.deviceLineWidth !== null) { checks++; if (style.deviceLineWidth === p.deviceLineWidth) matches++; }
      if (style.dashed !== null) { checks++; if (style.dashed === pDashed) matches++; }
      if (style.layerId !== undefined) { checks++; if (style.layerId === p.layerId) matches++; }
      const styleAgreement = checks > 0 ? matches / checks : 0.5; // no exclusive evidence at all: neutral, not zero

      const exclusive = exclusiveSetByProposal.get(propId)!;
      let touching = 0;
      for (const n of neighbors) if (exclusive.has(n)) touching++;
      const connectivity = neighbors.size > 0 ? touching / neighbors.size : 0;

      const isCarrierLike = carrierFlagByProposal.get(propId)?.get(pid) ?? false;
      const carrierAgreement = isCarrierLike ? 0 : 1;

      results.push({
        primitiveId: pid, proposalId: propId, styleAgreement, connectivity, carrierAgreement,
        score: (styleAgreement + connectivity + carrierAgreement) / 3,
      });
    }
  }

  return results;
}
