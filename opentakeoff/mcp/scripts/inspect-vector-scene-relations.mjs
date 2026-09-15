#!/usr/bin/env node
// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 2 — a diagnostic tool for
// validating vectorSceneIndex.ts / vectorSceneRelations.ts /
// vectorSceneSpatialIndex.ts against REAL PDF pages rather than only the
// synthetic op-list fixtures their own unit tests build. Junction and pair-
// relation classification was designed against clean, hand-built geometry;
// this is how that design gets checked against real drafted noise (near-
// miss endpoints, dense hatch families, huge sheets) before any of it is
// wired into buildVectorSceneIndex's own stub fields — see PROGRESS.md.
// Also a first, informal pass at goal §7's own gate requirement to measure
// index build time on small/median/large real sheets (not the full formal
// benchmark that gate calls for, but real numbers on real files).
import { resolve } from "node:path";
import { openPdf, OPS } from "../src/pdf.ts";
import { extractVectorGeometry } from "../../web/src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../../web/src/lib/vectorSceneIndex.ts";
import { computeVectorSceneJunctions, computeVectorScenePairRelations } from "../../web/src/lib/vectorSceneRelations.ts";
import { buildSpatialIndex } from "../../web/src/lib/vectorSceneSpatialIndex.ts";

const args = process.argv.slice(2);
const [pdfArg, ...pageArgs] = args;
if (!pdfArg || !pageArgs.length) {
  throw new Error("usage: inspect-vector-scene-relations.mjs PDF PAGE [PAGE ...]");
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
    const geometry = extractVectorGeometry(await page.operatorList(), page.viewport.transform, OPS);
    const t1 = now();
    const idx = buildVectorSceneIndex(geometry);
    const t2 = now();
    const junctionsResult = computeVectorSceneJunctions(idx);
    const t3 = now();
    const pairResult = computeVectorScenePairRelations(idx);
    const t4 = now();
    const spatial = buildSpatialIndex(idx);
    const t5 = now();

    const kindCounts = {};
    for (const j of junctionsResult.junctions) kindCounts[j.kind] = (kindCounts[j.kind] ?? 0) + 1;

    results.push({
      sheet: `${pdfPath.split("/").at(-1)}#${pageNumber}`,
      primitives: idx.primitives.length,
      subpaths: idx.subpaths.length,
      timings_ms: {
        extract: Math.round(t1 - t0),
        buildIndex: Math.round(t2 - t1),
        junctions: Math.round(t3 - t2),
        pairRelations: Math.round(t4 - t3),
        spatialIndex: Math.round(t5 - t4),
      },
      junctions: {
        total: junctionsResult.junctions.length,
        by_kind: kindCounts,
        incomplete: junctionsResult.incomplete,
        incompleteReason: junctionsResult.incompleteReason,
      },
      pairRelations: {
        parallel: pairResult.parallelPairs.length,
        perpendicular: pairResult.perpendicularPairs.length,
        collinear: pairResult.collinearPairs.length,
        incomplete: pairResult.incomplete,
        incompleteReason: pairResult.incompleteReason,
      },
      spatialIndex: {
        cells: spatial.cells.size,
        bounds: spatial.bounds,
        incomplete: spatial.incomplete,
      },
    });
    page.cleanup();
  }
} finally {
  await doc.destroy();
}

console.log(JSON.stringify({ pdf: pdfPath, results }, null, 2));
