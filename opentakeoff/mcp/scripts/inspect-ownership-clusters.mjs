#!/usr/bin/env node
// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3/4 — a diagnostic tool
// running the FULL Lane A/B -> fusion -> ownership-cluster -> eligibility
// -> assignment -> owned-body chain against a real PDF page, end to end.
// No such script existed when this was written (checked mcp/scripts/ and
// web/bench/ first, per GOAL.md's own "audit before you build" rule) —
// every prior real-sheet check in this project ran pieces of this chain
// by hand in a throwaway scratch script. This is that throwaway script
// made permanent, because it already found a real bug the first time it
// ran (see PROGRESS.md: page-edge title-block/border furniture on Cherry
// Point Air Traffic Tower #11, fixed in candidateBodyLaneA.ts's own
// touchesPageEdge + candidateProposalFusion.ts's own exclusion of it).
//
// Reports, per page: primitive/body/proposal counts, cluster count,
// contested/exclusive primitive totals, assigned/ambiguous resolution
// counts, owned/empty body counts, and — the one check that matters
// most — a DIRECT verification of Phase 4's own gate ("no primitive can
// support two accepted physical instances") by checking for a primitive
// id claimed by two different accepted OwnedBody entries anywhere on the
// page, not just trusting the pipeline's own internal invariants.
//
// INCOMPLETE-STATE FIX (real, found running this very script against
// NIST Gaithersburg Building 101 #2): the first version of this script
// reported `gate_holds: true, resolved_fraction: 1` for that page
// without ever checking whether the analysis it ran that check against
// was actually complete. It was not — idx.primitives.length read back
// exactly 250000, VectorSceneIndex's own VECTOR_SCENE_INDEX_MAX_PRIMITIVES
// cap, meaning the real page's own segment count exceeded the cap and
// buildVectorSceneIndex silently (from this script's own prior
// perspective) truncated, with its own real `incomplete`/
// `incompleteReason` fields carrying the honest explanation this script
// simply never looked at. Reporting a clean gate result over data that
// was never fully indexed is exactly the "partial silent truth" the goal
// document's own Phase 2 requirement 6 explicitly forbids — now fixed by
// reading and surfacing every incomplete flag this chain's own modules
// already expose (VectorSceneIndex, Lane B, Lane A), so a truncated page
// is reported as `analysis_incomplete: true` with the real reason(s)
// rather than silently passing as if it were whole.
//
// ITERATIVE REPAIR MIGRATION (real, 2026-09-15): switched the per-cluster
// contested resolution from the static, one-round `resolveClusterOwnership`
// to `resolveClusterOwnershipIteratively` (ownershipAssignment.ts's own
// Phase 4 requirement 7 conflict-repair mechanism) once that mechanism was
// itself built, tested, and real-corpus-validated (see PROGRESS.md) to
// resolve strictly more contested primitives than the static rule on real
// documents, never fewer, with the same gate holding throughout. Two new
// per-page fields (`max_repair_rounds`, `clusters_hit_round_cap`) disclose
// how much repair actually ran, same "disclosed work, never silent"
// convention as `analysis_incomplete` above.
import { resolve } from "node:path";
import { openPdf, OPS } from "../src/pdf.ts";
import { extractVectorGeometry } from "../../web/src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../../web/src/lib/vectorSceneIndex.ts";
import { computeVectorSceneJunctions } from "../../web/src/lib/vectorSceneRelations.ts";
import { proposeCandidateBodiesLaneB } from "../../web/src/lib/candidateBodyLaneB.ts";
import { computeFormContentSignatures } from "../../web/src/lib/candidateBodyLaneA.ts";
import { fuseProposals } from "../../web/src/lib/candidateProposalFusion.ts";
import { detectOwnershipClusters } from "../../web/src/lib/ownershipConflicts.ts";
import { resolveClusterOwnershipIteratively, resolveExclusiveOwnership } from "../../web/src/lib/ownershipAssignment.ts";
import { computeOwnedBodies } from "../../web/src/lib/ownershipBody.ts";

const args = process.argv.slice(2);
const [pdfArg, ...pageArgs] = args;
if (!pdfArg || !pageArgs.length) {
  throw new Error("usage: inspect-ownership-clusters.mjs PDF PAGE [PAGE ...]");
}
const pdfPath = resolve(pdfArg);
const pages = pageArgs.map(Number);
if (pages.some((page) => !Number.isInteger(page) || page < 1)) {
  throw new Error("pages must be positive integers");
}

const now = () => performance.now();
const doc = await openPdf(pdfPath);
const results = [];
try {
  for (const pageNumber of pages) {
    const page = await doc.page(pageNumber);
    const t0 = now();
    const geo = extractVectorGeometry(await page.operatorList(), page.viewport.transform, OPS);
    const idx = buildVectorSceneIndex(geo);
    const { junctions } = computeVectorSceneJunctions(idx);
    const laneB = proposeCandidateBodiesLaneB(idx, junctions);
    const { bodies } = laneB;
    const pageBounds = { width: page.viewport.width, height: page.viewport.height };
    const laneA = computeFormContentSignatures(idx, geo.formInvocations ?? [], { pageBounds });
    const fused = fuseProposals(idx, bodies, laneA.invocations);
    const proposalsById = new Map(fused.map((p) => [p.id, p]));
    const { clusters, uncontested } = detectOwnershipClusters(fused);
    const t1 = now();

    // See the module header's own INCOMPLETE-STATE FIX note: every stage
    // that can silently truncate reports its own incomplete/reason pair
    // already — this just collects and surfaces them, rather than
    // trusting a clean-looking gate result over data that was never
    // fully indexed in the first place.
    const incompleteReasons = [idx.incompleteReason, laneB.incompleteReason, laneA.incompleteReason].filter(Boolean);

    const entry = {
      sheet: `${pdfPath.split("/").at(-1)}#${pageNumber}`,
      analysis_incomplete: idx.incomplete || laneB.incomplete || laneA.incomplete,
      incomplete_reasons: incompleteReasons,
      primitives: idx.primitives.length,
      laneB_bodies: bodies.length,
      laneA_invocations: laneA.invocations.length,
      laneA_touchingPageEdge: laneA.invocations.filter((i) => i.touchesPageEdge).length,
      fused_proposals: fused.length,
      uncontested_proposals: uncontested.length,
      ownership_clusters: clusters.length,
      pipeline_time_ms: Math.round(t1 - t0),
      contested_primitives: 0,
      exclusive_primitives: 0,
      assigned: 0,
      ambiguous: 0,
      owned_bodies: 0,
      empty_bodies: 0,
      max_repair_rounds: 0,
      clusters_hit_round_cap: 0,
      gate_double_claims: [], // real violations, if any -- an empty array here is the gate HOLDING
    };

    const ownerOfPrimitive = new Map();
    for (const cluster of clusters) {
      entry.contested_primitives += cluster.contestedPrimitiveIds.length;
      entry.exclusive_primitives += cluster.exclusivePrimitiveIds.length;
      const exclusiveDecisions = resolveExclusiveOwnership(cluster, proposalsById);
      const contestedResult = resolveClusterOwnershipIteratively(cluster, proposalsById, idx, junctions);
      entry.assigned += contestedResult.assignedCount;
      entry.ambiguous += contestedResult.ambiguousCount;
      entry.max_repair_rounds = Math.max(entry.max_repair_rounds, contestedResult.rounds);
      if (contestedResult.hitRoundCap) entry.clusters_hit_round_cap++;

      const ownedBodies = computeOwnedBodies(exclusiveDecisions, contestedResult.decisions, idx, cluster.proposalIds);
      for (const b of ownedBodies) {
        if (b.isEmpty) { entry.empty_bodies++; continue; }
        entry.owned_bodies++;
        for (const pid of b.primitiveIds) {
          if (ownerOfPrimitive.has(pid)) {
            entry.gate_double_claims.push({ primitiveId: pid, proposalA: ownerOfPrimitive.get(pid), proposalB: b.proposalId });
          } else {
            ownerOfPrimitive.set(pid, b.proposalId);
          }
        }
      }
    }
    entry.gate_holds = entry.gate_double_claims.length === 0;
    entry.resolved_fraction = entry.contested_primitives > 0 ? entry.assigned / entry.contested_primitives : 1;

    results.push(entry);
    page.cleanup();
  }
} finally {
  await doc.destroy();
}

console.log(JSON.stringify({ pdf: pdfPath, results }, null, 2));
