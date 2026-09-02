/**
 * Emit out/<file>.takeoff.json on the shared Session + Pillar A/B/C/D stack.
 *
 *   node --import tsx scripts/emit-takeoff-json.mjs --pdf /abs/plan.pdf [--out dir]
 *     [--with-reconcile] [--with-legend] [--categories valve,actuator,damper]
 *
 * Uses graphForPipeline (L0-L5 vector stack) + compileCorpusTakeoff (Pillar A/C)
 * + buildEstimatorTakeoffDocument (P2 schema with pillars.* preserved).
 * Optional Pillar B reconcile and Pillar D legend sweeps attach when requested.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { Session } from "../src/session.ts";
import { buildLegendTakeoff, reconcileSchedulePlan } from "../src/takeoff.ts";
import { buildEstimatorTakeoffDocument } from "../../web/src/lib/estimatorTakeoffDocument.mjs";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
function flag(name) {
  return args.includes(name);
}

const pdf = arg("--pdf");
const outDir = resolve(arg("--out") || "out");
const categoriesRaw = arg("--categories");
const categories = categoriesRaw
  ? categoriesRaw.split(",").map((s) => s.trim()).filter(Boolean)
  : ["valve", "actuator", "damper"];

if (!pdf) {
  console.error(
    "usage: emit-takeoff-json.mjs --pdf /abs/plan.pdf [--out dir] [--with-reconcile] [--with-legend] [--categories valve,actuator,damper]",
  );
  process.exit(2);
}

const pdfPath = resolve(pdf);
const sha256 = createHash("sha256").update(readFileSync(pdfPath)).digest("hex");
const session = new Session();
await session.loadPlan(pdfPath);
const graph = await session.graphForPipeline();

let reconcileSummary = null;
if (flag("--with-reconcile")) {
  const reconcile = await reconcileSchedulePlan(session, {
    categories,
    evaluationFast: true,
  });
  reconcileSummary = {
    rows: reconcile.rows,
    summary: reconcile.summary,
    family_filter: reconcile.family_filter,
    takeoff_stats: reconcile.takeoff_stats,
  };
}

let legendSummary = null;
if (flag("--with-legend")) {
  const legend = await buildLegendTakeoff(session, { categories });
  legendSummary = {
    items: legend.items.length,
    legend_sheets_seen: legend.legend_sheets_seen,
    stats: legend.stats,
    failures: legend.failures.slice(0, 12),
  };
}

const doc = buildEstimatorTakeoffDocument(graph, {
  file: pdfPath,
  sha256,
  reconcileSummary,
  legendSummary,
});

mkdirSync(outDir, { recursive: true });
const base = basename(pdfPath).replace(/\.pdf$/i, "");
const outPath = resolve(outDir, `${base}.takeoff.json`);
writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  out: outPath,
  valves: doc.valves.length,
  dampers: doc.dampers.length,
  points: doc.points.length,
  grid_types: doc.grid_classifications?.length ?? 0,
  pillar_b_reconcile: reconcileSummary?.summary ?? null,
  pillar_d_legend: legendSummary?.stats ?? null,
  pillar_c_valve_gates: doc.pillars?.c_estimator?.valve?.gates?.length ?? 0,
}, null, 2));
