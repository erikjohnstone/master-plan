#!/usr/bin/env node
// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 4's own explicit gate:
// "Ownership precision/recall/F1 is reported separately; auto-accepted
// instances require at least 0.95 primitive F1 against reviewed bodies,
// unless a Form/subpath identity provides exact ownership." This has not
// been measured anywhere in this project before now -- every prior
// diagnostic checked the "no primitive claims two instances" gate and the
// "no empty-patch body" gate, never primitive-level F1 against real
// reviewed ground truth. This script does that, corpus-wide, against
// cases.json's own real body_bbox entries (422 across 51 cases, seed +
// instances).
//
// GROUND TRUTH -> PRIMITIVE SET: cases.json stores body_bbox as a pixel
// rectangle, not a primitive id list (reference_primitive_ids/
// owned_primitive_ids are explicitly unset throughout -- deferred, per the
// review notes, until VectorSceneIndex existed; it now does, but nobody
// has gone back to populate them). This script infers the ground-truth
// primitive set the SAME way legendReferenceBank.ts already does for a
// legend glyph's own reference primitives: full bbox containment via the
// spatial index's broad-phase query, then an exact containment filter --
// never a second, different convention invented here. Coordinate
// compatibility confirmed directly: page.viewport.width/height equals
// each case's own page_size_px exactly (Cherry Point p12: 4896x3168 both
// ways), so body_bbox needs no scale conversion against idx.primitives.
//
// PREDICTED BODY -> best match: for each ground-truth instance, every
// final predicted body (an uncontested proposal as-is, or a resolved
// cluster's own OwnedBody via resolveClusterOwnershipIteratively) whose
// bbox overlaps body_bbox at all is scored by primitive-set F1 against
// the ground-truth set; the single best-F1 body is "the" prediction for
// that instance, exactly the real question the gate asks ("does the
// system's own accepted-instance concept correctly capture this real
// symbol's ink").
//
// DISCLOSED LIMITATION: this measures the CURRENT pipeline's own single-
// owned-body concept. It is not yet the full Phase 6/7 pipeline (tag
// association, schedule reconciliation) -- a fair, disclosed proxy for
// Phase 4's own primitive-ownership machinery specifically, not the final
// end-to-end system.
//
// FIRST REAL RUN (2026-09-15, full corpus, 422 ground-truth instances /
// 51 cases / 40 document-page groups): the gate does NOT hold yet.
// microF1 0.204, microPrecision 0.863, microRecall 0.116, and only
// 13/405 evaluable instances (3.2%) reach the required 0.95 F1 -- see
// PROGRESS.md for the full write-up and root-cause diagnosis (Lane B's
// junction-based touching-only union-find fragments a real symbol drawn
// with non-touching strokes into many small disconnected bodies that
// never get unified into one accepted instance; simple single-stroke
// schematic glyphs like relay coils and callout bubbles score near 1.0,
// while complex multi-stroke mechanical symbols like ceiling diffusers
// and controller modules score near 0). This is a MEASUREMENT and
// DIAGNOSIS, not a fix -- the fix (spatial-proximity clustering in Lane
// B, or a body-merging step) is real further work, not attempted here.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openPdf, OPS } from "../src/pdf.ts";
import { extractVectorGeometry } from "../../web/src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../../web/src/lib/vectorSceneIndex.ts";
import { buildSpatialIndex, querySpatialIndex } from "../../web/src/lib/vectorSceneSpatialIndex.ts";
import { computeVectorSceneJunctions } from "../../web/src/lib/vectorSceneRelations.ts";
import { proposeCandidateBodiesLaneB } from "../../web/src/lib/candidateBodyLaneB.ts";
import { computeFormContentSignatures } from "../../web/src/lib/candidateBodyLaneA.ts";
import { fuseProposals } from "../../web/src/lib/candidateProposalFusion.ts";
import { detectOwnershipClusters } from "../../web/src/lib/ownershipConflicts.ts";
import { resolveExclusiveOwnership, resolveClusterOwnershipIteratively } from "../../web/src/lib/ownershipAssignment.ts";
import { computeOwnedBodies } from "../../web/src/lib/ownershipBody.ts";

// this script lives at <repo>/opentakeoff/mcp/scripts/ -- three levels up
// is <repo>, where the ground-truth corpus and its PDFs both live,
// resolved from the script's own location rather than a hardcoded
// absolute path so it runs correctly from any checkout.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const PDF_ROOT = join(REPO_ROOT, "HVAC BAS Benchmark Collection");
const casesPath = join(REPO_ROOT, "HVAC BAS Benchmark Collection/ground_truth/symbol_sweep/cases.json");
const data = JSON.parse(readFileSync(casesPath, "utf8"));

// optional: --doc SUBSTRING restricts to cases whose own document_id/id
// contains SUBSTRING (debugging a single document fast); no args = the
// full real corpus.
const docFilter = process.argv[2] === "--doc" ? process.argv[3] : null;

const groundTruth = []; // { caseId, instId, sourcePdf, page, bodyBbox }
for (const c of data.cases) {
  if (docFilter && !c.document_id.includes(docFilter) && !c.id.includes(docFilter)) continue;
  const insts = [{ ...c.seed, id: c.seed?.id ? `${c.id}::${c.seed.id}` : `${c.id}::seed` }, ...(c.instances ?? []).map((i) => ({ ...i, id: `${c.id}::${i.id}` }))];
  for (const inst of insts) {
    if (!inst || !inst.body_bbox) continue;
    groundTruth.push({ caseId: c.id, instId: inst.id, sourcePdf: c.source_pdf, page: c.page, bodyBbox: inst.body_bbox });
  }
}
console.error(`ground truth instances: ${groundTruth.length}`);

const byPage = new Map();
for (const gt of groundTruth) {
  const key = `${gt.sourcePdf}#${gt.page}`;
  if (!byPage.has(key)) byPage.set(key, []);
  byPage.get(key).push(gt);
}
console.error(`distinct (pdf,page) groups: ${byPage.size}`);

function bboxOfPrimitive(p) {
  return [Math.min(p.x0, p.x1), Math.min(p.y0, p.y1), Math.max(p.x0, p.x1), Math.max(p.y0, p.y1)];
}
function containedIn(px0, py0, px1, py1, x0, y0, x1, y1) {
  return px0 >= x0 && px1 <= x1 && py0 >= y0 && py1 <= y1;
}

const results = [];
let groupIdx = 0;
for (const [key, gts] of byPage) {
  groupIdx++;
  const sourcePdf = gts[0].sourcePdf;
  const page = gts[0].page;
  const pdfPath = join(PDF_ROOT, sourcePdf);
  console.error(`[${groupIdx}/${byPage.size}] ${key} (${gts.length} instances)`);
  let doc;
  try {
    doc = await openPdf(pdfPath);
    const pg = await doc.page(page);
    const geo = extractVectorGeometry(await pg.operatorList(), pg.viewport.transform, OPS);
    const idx = buildVectorSceneIndex(geo);
    if (idx.incomplete) console.error(`  ANALYSIS INCOMPLETE: ${idx.incompleteReason}`);
    const spatialIndex = buildSpatialIndex(idx);
    const { junctions } = computeVectorSceneJunctions(idx);
    const laneB = proposeCandidateBodiesLaneB(idx, junctions);
    const pageBounds = { width: pg.viewport.width, height: pg.viewport.height };
    const laneA = computeFormContentSignatures(idx, geo.formInvocations ?? [], { pageBounds });
    const fused = fuseProposals(idx, laneB.bodies, laneA.invocations);
    const proposalsById = new Map(fused.map((p) => [p.id, p]));
    const { clusters, uncontested } = detectOwnershipClusters(fused);

    const predictedBodies = [];
    for (const propId of uncontested) {
      const p = proposalsById.get(propId);
      if (p) predictedBodies.push({ proposalId: propId, primitiveIds: p.primitiveIds, x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1 });
    }
    for (const cluster of clusters) {
      const exclusiveDecisions = resolveExclusiveOwnership(cluster, proposalsById);
      const iter = resolveClusterOwnershipIteratively(cluster, proposalsById, idx, junctions);
      const owned = computeOwnedBodies(exclusiveDecisions, iter.decisions, idx, cluster.proposalIds);
      for (const b of owned) if (!b.isEmpty) predictedBodies.push(b);
    }

    for (const gt of gts) {
      const [x0, y0, x1, y1] = gt.bodyBbox;
      const gtSet = new Set();
      for (const pid of querySpatialIndex(spatialIndex, x0, y0, x1, y1)) {
        const p = idx.primitives[pid];
        const [px0, py0, px1, py1] = bboxOfPrimitive(p);
        if (containedIn(px0, py0, px1, py1, x0, y0, x1, y1)) gtSet.add(pid);
      }

      if (gtSet.size === 0) {
        results.push({ caseId: gt.caseId, instId: gt.instId, evaluable: false, reason: "zero primitives contained in body_bbox" });
        continue;
      }

      let best = null, bestF1 = -1;
      for (const pb of predictedBodies) {
        if (pb.x1 < x0 || pb.x0 > x1 || pb.y1 < y0 || pb.y0 > y1) continue;
        const predSet = new Set(pb.primitiveIds);
        let tp = 0;
        for (const id of predSet) if (gtSet.has(id)) tp++;
        const fp = predSet.size - tp;
        const fn = gtSet.size - tp;
        const precision = predSet.size > 0 ? tp / (tp + fp) : 0;
        const recall = tp / (tp + fn);
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        if (f1 > bestF1) { bestF1 = f1; best = { proposalId: pb.proposalId, tp, fp, fn, precision, recall, f1 }; }
      }
      if (!best) {
        results.push({ caseId: gt.caseId, instId: gt.instId, evaluable: true, gtSize: gtSet.size, matched: false, tp: 0, fp: 0, fn: gtSet.size, precision: 0, recall: 0, f1: 0 });
      } else {
        results.push({ caseId: gt.caseId, instId: gt.instId, evaluable: true, gtSize: gtSet.size, matched: true, ...best });
      }
    }
    pg.cleanup();
  } catch (err) {
    console.error(`  ERROR on ${key}: ${err.message}`);
    results.push({ caseId: gts[0].caseId, instId: "(page-level error)", evaluable: false, reason: `pipeline error: ${err.message}` });
  } finally {
    if (doc) await doc.destroy();
  }
}

function summarize(rows) {
  const evaluable = rows.filter((r) => r.evaluable);
  const notEvaluable = rows.filter((r) => !r.evaluable);
  const macroF1 = evaluable.length ? evaluable.reduce((s, r) => s + r.f1, 0) / evaluable.length : null;
  let tpSum = 0, fpSum = 0, fnSum = 0;
  for (const r of evaluable) { tpSum += r.tp; fpSum += r.fp; fnSum += r.fn; }
  const microPrecision = tpSum + fpSum > 0 ? tpSum / (tpSum + fpSum) : null;
  const microRecall = tpSum + fnSum > 0 ? tpSum / (tpSum + fnSum) : null;
  const microF1 = microPrecision !== null && microRecall !== null && microPrecision + microRecall > 0 ? (2 * microPrecision * microRecall) / (microPrecision + microRecall) : null;
  const atOrAboveGate = evaluable.filter((r) => r.f1 >= 0.95).length;
  return { total: rows.length, evaluable: evaluable.length, notEvaluable: notEvaluable.length, macroF1, microPrecision, microRecall, microF1, atOrAboveGate95: atOrAboveGate, atOrAboveGate95Fraction: evaluable.length ? atOrAboveGate / evaluable.length : null };
}

const overall = summarize(results);
const byDoc = new Map();
for (const r of results) {
  const docKey = r.caseId;
  if (!byDoc.has(docKey)) byDoc.set(docKey, []);
  byDoc.get(docKey).push(r);
}
const perCase = [...byDoc.entries()].map(([caseId, rows]) => ({ caseId, ...summarize(rows) }));

console.log(JSON.stringify({ overall, perCase, details: results }, null, 2));
