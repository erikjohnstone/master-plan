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
// - FORM PLAUSIBILITY AGREEMENT (added after formPlausibility.ts, and
//   the PROGRESS.md structural finding that motivated it: every real
//   ownership cluster found across 5 real documents is a Lane-A-Form-
//   vs-Lane-B-components dispute with ZERO exclusive primitives, so the
//   three signals above are structurally unable to discriminate it —
//   this is the form-LEVEL signal that can). For a proposal carrying
//   Lane A evidence (`votingLanes` includes `"A"`), `assessFormPlausibility`
//   is run once against that Form's own bbox and its own real "shatter
//   count" (how many OTHER proposals in this same cluster share a
//   primitive with it — almost always the Lane B components partitioning
//   it, per the structural finding). An implausible Form scores 0
//   agreement for every primitive it contests (real evidence its own
//   claim is the wrong one, not the Lane B side's); a plausible Form, or
//   any proposal with no Lane A evidence at all (this signal has nothing
//   to say about a pure Lane B proposal), scores 1, neutral-favorable.
//
// - GRAPH/PATH SIGNATURE AGREEMENT (added after candidateBodySignature.ts
//   shipped a per-BODY signature — this is the per-PRIMITIVE-against-a-
//   proposal computation that module's own header named as future work,
//   not a duplicate of it). Reuses candidateBodyLaneD.ts's own node
//   attributes and candidateBodySignature.ts's own bucketing constants and
//   angleDiffMod180 helper: for each claiming proposal, establishes a
//   dominant orientation from that proposal's own EXCLUSIVE members only
//   (same "trust only undisputed evidence" principle as style/carrier
//   above), then builds the SAME (type, curved, closed, lengthBucket,
//   angleBucket-relative-to-dominant) signature entry candidateBodySignature
//   uses per exclusive member. A contested primitive scores 1 for a
//   proposal when ITS OWN entry (computed relative to THAT proposal's own
//   dominant orientation) exactly matches one already present among that
//   proposal's own exclusive entries — real structural evidence this
//   primitive's own shape/length/angle is already "expected" by that
//   proposal's own undisputed body, not merely similar by raw style. A
//   proposal with no exclusive members (no dominant orientation to define
//   at all) cannot evaluate this signal and scores the same neutral-
//   favorable 0.5 convention as styleAgreement's own no-evidence case —
//   disclosed limitation, not a gap unique to this signal: PROGRESS.md's
//   own structural finding (every real cluster found so far is all-
//   contested, zero exclusive primitives anywhere) means this signal, like
//   style and connectivity before it, is neutral on exactly the real-corpus
//   shape that matters most; it has teeth only on a PARTIAL-overlap
//   cluster, which is real but not yet the common case measured.
//
// - PROPOSAL-COVERAGE AGREEMENT (added after wiring Lane C's own
//   tag-anchored proposals into candidateProposalFusion.ts, and the real
//   gap that wiring's own corpus measurement found — PROGRESS.md: a Lane
//   C proposal almost never has any EXCLUSIVE primitives of its own,
//   since it sweeps up already-fragmented rivals wholesale, so all five
//   signals above default to neutral for it and it rarely wins a real
//   contested primitive even when it is objectively the more complete
//   candidate). NOT the goal's own listed "mutual reference-to-candidate
//   and candidate-to-reference coverage" (that is Lane E's legend-
//   reference-bank-vs-plan-candidate question, still unattempted, Phase
//   5/6 territory) — this is a different, additional signal, in the same
//   spirit as formPlausibilityAgreement's own addition beyond the
//   literal seven-item list, built to close a real measured gap rather
//   than to check off a goal-document line item. For a contested
//   primitive's actual rival claimants (the OTHER proposals also
//   claiming it, not every proposal in the cluster), computes what
//   fraction of EACH rival's own FULL primitiveIds set this proposal's
//   own FULL set contains, averaged over those rivals — needs no
//   exclusive evidence at all, so it can discriminate exactly where the
//   five signals above structurally cannot. A proposal that fully
//   subsumes its rivals' own ink scores near 1; two proposals that
//   merely brush past each other at one shared primitive (real,
//   separate symbols, not a fragment-vs-whole relationship) score low on
//   BOTH sides, not a false win for whichever happens to be larger —
//   verified directly by this module's own tests, not merely assumed.
//
// Deliberately NOT attempted in this slice (disclosed, real further
// work — the rest of requirement 2's own list): transform-consistent
// residual (needs Phase 5's own rigid/affine verification, which has not
// been built); mutual reference-to-candidate/candidate-to-reference
// coverage (Phase 5/6 territory, Lane E's own legend-reference-bank
// question — not the same as this slice's own new proposal-coverage
// signal above). Requirements 3-8 (injective correspondence, explicit
// unowned/unassigned states, the actual assignment solver, an owned body
// bbox/polygon) are handled by sibling modules (ownershipAssignment.ts,
// ownershipBody.ts) or not yet attempted — this module SCORES, it does
// not decide an outcome.
import type { VectorSceneIndex } from "./vectorSceneIndex.ts";
import type { Junction } from "./vectorSceneRelations.ts";
import type { FusedProposal } from "./candidateProposalFusion.ts";
import type { OwnershipCluster } from "./ownershipConflicts.ts";
import { classifyCarrierPrimitives } from "./carrierClassification.ts";
import { assessFormPlausibility } from "./formPlausibility.ts";
import { computePrimitiveGraphAttributes, type PrimitiveNodeAttributes } from "./candidateBodyLaneD.ts";
import { ANGLE_BUCKET_DEG, LENGTH_BUCKET_STEP, angleDiffMod180 } from "./candidateBodySignature.ts";

export interface EligibilityScore {
  primitiveId: number;
  proposalId: number;
  styleAgreement: number;   // 0-1
  connectivity: number;     // 0-1
  carrierAgreement: number; // 0-1 — 0 iff flagged carrier-like within this proposal's own set
  formPlausibilityAgreement: number; // 0-1 — 0 iff this is an implausible-as-one-symbol Lane A proposal
  graphSignatureAgreement: number; // 0-1 — 1 iff this primitive's own shape/length/angle already matches one of this proposal's own exclusive members
  /** 0-1 — how much of EACH actual rival's own full claimed set (for
   *  this SAME contested primitive) this proposal's own full claimed set
   *  subsumes, averaged over those rivals. Unlike the five signals
   *  above, this one needs no exclusive evidence at all — it compares
   *  full primitiveIds sets directly, so a proposal that structurally
   *  never has exclusive members (Lane C's own tag-anchored regions,
   *  which by design sweep up already-fragmented rivals wholesale) can
   *  still win real contested primitives on real evidence instead of
   *  defaulting to every other signal's own neutral 0.5. See this
   *  module's own header for the real gap this was built to close and
   *  PROGRESS.md for the corpus measurement that found it. */
  coverageAgreement: number;
  /** simple, disclosed, unweighted average of the six signals above —
   *  not a calibrated model (goal's own longer requirement-2 list has
   *  two more signals this slice does not compute; a real combined
   *  score needs all of them, not just these six). */
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

/** The same (type, curved, closed, lengthBucket, angleBucket) tuple
 *  candidateBodySignature.ts's own SignatureEntry uses, computed for ONE
 *  primitive relative to a caller-supplied dominant orientation (a whole
 *  proposal's own exclusive members, here — not a whole body's own full
 *  member list, which is what that module computes it for). Stringified
 *  for Set membership; the exact tuple shape doesn't need to be public. */
function signatureEntryKey(attr: PrimitiveNodeAttributes, dominantOrientationDeg: number): string {
  const lengthBucket = Math.round(attr.normalizedLength / LENGTH_BUCKET_STEP);
  const angleBucket = Math.round(angleDiffMod180(attr.orientationDeg, dominantOrientationDeg) / ANGLE_BUCKET_DEG);
  return `${attr.type ?? -1}|${attr.curved ? 1 : 0}|${attr.closed ? 1 : 0}|${lengthBucket}|${angleBucket}`;
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

export interface ScoreContestedPrimitivesOptions {
  /** per-proposal EXTRA primitive ids to treat as if they were exclusive
   *  when computing that proposal's own style/connectivity/carrier/graph-
   *  signature evidence — the hook `resolveClusterOwnershipIteratively`
   *  (ownershipAssignment.ts) uses to feed an earlier round's own
   *  resolved contested primitives back in as real evidence for a later
   *  round, per this module's own header's disclosed "a true joint
   *  solve would let assigning one contested primitive change another's
   *  own connectivity evidence" gap. A caller-supplied id not actually
   *  present in that proposal's own `primitiveIds` is silently ignored
   *  (defensive; every real caller's own ids are already a subset by
   *  construction — see resolveClusterOwnershipIteratively's own
   *  header). Omitting this entirely reproduces the exact non-iterative
   *  behavior this module always had before iterative repair existed. */
  additionalExclusiveByProposal?: ReadonlyMap<number, ReadonlySet<number>>;
}

/** Pure: scores every contested primitive in `cluster` against every
 *  proposal in the cluster that claims it. Never mutates any input. */
export function scoreContestedPrimitives(
  cluster: OwnershipCluster,
  proposalsById: ReadonlyMap<number, FusedProposal>,
  idx: VectorSceneIndex,
  junctions: readonly Junction[],
  opts: ScoreContestedPrimitivesOptions = {},
): EligibilityScore[] {
  const { additionalExclusiveByProposal } = opts;
  // Lane D node attributes, computed once for the WHOLE sheet (Lane D's own
  // normalizedLength needs the sheet-wide reference length, not a
  // cluster-local one — same convention computePrimitiveGraphAttributes
  // already documents). A cap breach or empty index degrades to an empty
  // attribute list; graphSignatureAgreement then falls back to its own
  // neutral 0.5 for every primitive, the same as "no exclusive evidence."
  const { attributes: laneDAttributes } = computePrimitiveGraphAttributes(idx, junctions);
  const attrById = new Map(laneDAttributes.map((a) => [a.primitiveId, a] as const));

  const exclusiveSetByProposal = new Map<number, Set<number>>();
  const styleByProposal = new Map<number, DominantStyle>();
  const primitiveSetByProposal = new Map<number, Set<number>>();
  const carrierFlagByProposal = new Map<number, Map<number, boolean>>();
  const graphSigByProposal = new Map<number, { dominantOrientationDeg: number; entryKeys: Set<string> } | null>();
  const exclusiveIdSet = new Set(cluster.exclusivePrimitiveIds);
  const contestedIdSet = new Set(cluster.contestedPrimitiveIds);
  for (const propId of cluster.proposalIds) {
    const proposalPrims = proposalsById.get(propId)?.primitiveIds ?? [];
    primitiveSetByProposal.set(propId, new Set(proposalPrims));
    const additional = additionalExclusiveByProposal?.get(propId);
    const exclusive = proposalPrims.filter((pid) => exclusiveIdSet.has(pid) || (additional?.has(pid) ?? false));
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

    // graph/path signature agreement, computed once per proposal from its
    // own exclusive members only — see this module's own header above.
    const exclusiveAttrs = exclusive.map((pid) => attrById.get(pid)).filter((a): a is PrimitiveNodeAttributes => !!a);
    if (exclusiveAttrs.length === 0) {
      graphSigByProposal.set(propId, null); // no dominant orientation to define — signal not evaluable
    } else {
      let dominant = exclusiveAttrs[0];
      for (const a of exclusiveAttrs) if (a.length > dominant.length) dominant = a;
      const dominantOrientationDeg = dominant.orientationDeg;
      const entryKeys = new Set(exclusiveAttrs.map((a) => signatureEntryKey(a, dominantOrientationDeg)));
      graphSigByProposal.set(propId, { dominantOrientationDeg, entryKeys });
    }
  }

  // reverse index: a CONTESTED primitive id -> every proposal in this
  // cluster claiming it — built once, used below to compute each Lane A
  // proposal's own real "shatter count" (how many OTHER proposals it
  // actually shares a primitive with) without an O(proposals^2) scan.
  const claimantsOfContested = new Map<number, Set<number>>();
  for (const propId of cluster.proposalIds) {
    for (const pid of primitiveSetByProposal.get(propId) ?? []) {
      if (!contestedIdSet.has(pid)) continue;
      let claimants = claimantsOfContested.get(pid);
      if (!claimants) { claimants = new Set(); claimantsOfContested.set(pid, claimants); }
      claimants.add(propId);
    }
  }

  // form plausibility agreement, computed once per Lane A proposal — see
  // formPlausibility.ts's own header and this module's own header above
  // for why this signal exists at the FORM level, not the primitive
  // level. A pure Lane B proposal has no plausibility concern of this
  // kind, so it is simply absent from this map (treated as neutral-
  // favorable below, same convention as carrier's own "not evaluable").
  const formPlausibleByProposal = new Map<number, boolean>();
  for (const propId of cluster.proposalIds) {
    const proposal = proposalsById.get(propId);
    if (!proposal || !proposal.votingLanes.includes("A")) continue;
    const others = new Set<number>();
    for (const pid of primitiveSetByProposal.get(propId) ?? []) {
      for (const c of claimantsOfContested.get(pid) ?? []) if (c !== propId) others.add(c);
    }
    const result = assessFormPlausibility({ x0: proposal.x0, y0: proposal.y0, x1: proposal.x1, y1: proposal.y1, componentCount: others.size });
    formPlausibleByProposal.set(propId, result.plausibleAsSingleSymbol);
  }

  // pairwise proposal-coverage: containmentRatio.get(`${containerId}|${containedId}`)
  // = what fraction of containedId's own FULL primitiveIds set also
  // appears in containerId's own FULL set. Computed ONCE per ordered
  // pair of proposals in this cluster (a quantity independent of which
  // contested primitive is currently being scored), not once per
  // primitive — a cluster can have thousands of contested primitives but
  // typically far fewer distinct proposals, so this stays cheap.
  const containmentRatio = new Map<string, number>();
  for (const containerId of cluster.proposalIds) {
    const containerSet = primitiveSetByProposal.get(containerId) ?? new Set<number>();
    for (const containedId of cluster.proposalIds) {
      if (containerId === containedId) continue;
      const containedSet = primitiveSetByProposal.get(containedId) ?? new Set<number>();
      if (containedSet.size === 0) { containmentRatio.set(`${containerId}|${containedId}`, 0); continue; }
      let contained = 0;
      for (const cpid of containedSet) if (containerSet.has(cpid)) contained++;
      containmentRatio.set(`${containerId}|${containedId}`, contained / containedSet.size);
    }
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

      const formPlausible = formPlausibleByProposal.get(propId) ?? true; // no Lane A evidence: not this signal's concern
      const formPlausibilityAgreement = formPlausible ? 1 : 0;

      const graphSig = graphSigByProposal.get(propId) ?? null;
      const pAttr = attrById.get(pid);
      let graphSignatureAgreement = 0.5; // no exclusive evidence to compare against: neutral, not zero
      if (graphSig && pAttr) {
        const key = signatureEntryKey(pAttr, graphSig.dominantOrientationDeg);
        graphSignatureAgreement = graphSig.entryKeys.has(key) ? 1 : 0;
      }

      const rivals = [...(claimantsOfContested.get(pid) ?? [])].filter((r) => r !== propId);
      let coverageAgreement = 0.5; // a contested primitive always has 2+ claimants by definition, so this default is defensive, not load-bearing
      if (rivals.length > 0) {
        let sum = 0;
        for (const rivalId of rivals) sum += containmentRatio.get(`${propId}|${rivalId}`) ?? 0;
        coverageAgreement = sum / rivals.length;
      }

      results.push({
        primitiveId: pid, proposalId: propId, styleAgreement, connectivity, carrierAgreement, formPlausibilityAgreement, graphSignatureAgreement, coverageAgreement,
        score: (styleAgreement + connectivity + carrierAgreement + formPlausibilityAgreement + graphSignatureAgreement + coverageAgreement) / 6,
      });
    }
  }

  return results;
}
