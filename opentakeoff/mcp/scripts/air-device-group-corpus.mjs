#!/usr/bin/env node
/** Real-PDF gate for reused air-device marks, drawing-group identity, and quantities. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cachedSheetGraph } from "./sheetGraphCache.mjs";
import { Session } from "../src/session.ts";
import { reconcileSchedulePlan } from "../src/takeoff.ts";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = process.env.OPENTAKEOFF_CORPUS || resolve(here, "../../../opentakeoff-corpus");
const truthPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(corpus, "ground_truth/air_devices/navfac-cherry-point-cd1-groups.json");
if (!existsSync(truthPath)) throw new Error(`Ground truth not found: ${truthPath}`);
const truth = JSON.parse(readFileSync(truthPath, "utf8"));
if (truth.schema !== "opentakeoff.air_device_group_quantity_ground_truth.v1") {
  throw new Error(`Unsupported ground-truth schema: ${truth.schema}`);
}
const pdfPath = resolve(corpus, truth.source_pdf);
if (!existsSync(pdfPath)) throw new Error(`Source PDF not found: ${pdfPath}`);

const session = new Session();
await session.loadPlan(pdfPath);
const fixturePath = process.env.OPENTAKEOFF_GRAPH_FIXTURE;
const graph = fixturePath
  ? JSON.parse(readFileSync(resolve(fixturePath), "utf8"))
  : await cachedSheetGraph(pdfPath, {
    expectedSha256: createHash("sha256").update(readFileSync(pdfPath)).digest("hex"),
    compute: () => session.graphForPipeline(),
  });
session.seedPipelineGraph(graph);

const started = performance.now();
const result = await reconcileSchedulePlan(session, {
  family: "GRD",
  evaluationFast: true,
  familySweepAll: true,
});
const reconcileMs = Math.round(performance.now() - started);
const errors = [];
const validBbox = (bbox) => bbox
  && [bbox.x0, bbox.y0, bbox.x1, bbox.y1].every(Number.isFinite)
  && bbox.x1 >= bbox.x0
  && bbox.y1 >= bbox.y0;
const pageOf = (sheet) => Number(String(sheet || "").match(/#(\d+)$/)?.[1]);

for (const expected of truth.cases) {
  const matches = result.rows.filter((row) => row.tag === truth.tag
    && row.schedule_cite?.drawing_group === expected.drawing_group);
  if (matches.length !== 1) {
    errors.push(`${expected.drawing_group}: expected one ${truth.tag} row, got ${matches.length}`);
    continue;
  }
  const actual = matches[0];
  const checks = [
    ["status", actual.status, expected.expected_status],
    ["scheduled_qty", actual.scheduled_qty, truth.quantity_semantics.scheduled_qty],
    ["scheduled_qty_basis", actual.scheduled_qty_basis, truth.quantity_semantics.scheduled_qty_basis],
    ["quantity_comparison", actual.quantity_comparison, truth.quantity_semantics.quantity_comparison],
    ["placement_count", actual.placement_count, expected.expected_placement_count],
    ["installed_qty", actual.installed_qty, expected.expected_installed_quantity],
    ["schedule_page", pageOf(actual.schedule_cite?.sheet), expected.schedule_page],
  ];
  for (const [field, got, want] of checks) {
    if (got !== want) errors.push(`${expected.drawing_group}: ${field} expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
  const allowedPages = new Set(expected.plan_pages);
  for (const cite of actual.plan_cites || []) {
    const page = pageOf(cite.sheet);
    if (!allowedPages.has(page)) errors.push(`${expected.drawing_group}: plan cite escaped reviewed pages onto ${cite.sheet}`);
    if (!validBbox(cite.bbox)) errors.push(`${expected.drawing_group}: invalid plan cite bbox on ${cite.sheet}`);
  }
  if ((actual.plan_cites || []).length !== expected.expected_installed_quantity) {
    errors.push(`${expected.drawing_group}: expected one plan citation per installed unit (${expected.expected_installed_quantity}), got ${(actual.plan_cites || []).length}`);
  }
}

const negativeRows = result.rows.filter((row) => row.tag === truth.negative_control.tag
  && truth.negative_control.reused_by_groups.includes(row.schedule_cite?.drawing_group));
if (negativeRows.length !== truth.negative_control.reused_by_groups.length) {
  errors.push(`negative control: expected ${truth.negative_control.reused_by_groups.length} grouped rows, got ${negativeRows.length}`);
}
for (const row of negativeRows) {
  if (row.status !== truth.negative_control.expected_status) {
    errors.push(`negative control ${row.schedule_cite?.drawing_group}: expected ${truth.negative_control.expected_status}, got ${row.status}`);
  }
  if (!/no authored drawing-group title/i.test(String(row.reason || ""))) {
    errors.push(`negative control ${row.schedule_cite?.drawing_group}: refusal does not name missing authored drawing-group evidence`);
  }
}

const report = {
  schema: "opentakeoff.air_device_group_quantity_corpus_result.v1",
  ok: errors.length === 0,
  source_pdf: truth.source_pdf,
  graph_source: fixturePath ? "explicit_fixture" : "content_addressed_production_graph",
  reconcile_ms: reconcileMs,
  rows: truth.cases.map((expected) => {
    const actual = result.rows.find((row) => row.tag === truth.tag
      && row.schedule_cite?.drawing_group === expected.drawing_group);
    return {
      drawing_group: expected.drawing_group,
      tag: truth.tag,
      status: actual?.status || null,
      scheduled_qty: actual?.scheduled_qty ?? null,
      placement_count: actual?.placement_count ?? null,
      installed_qty: actual?.installed_qty ?? null,
      plan_citations: actual?.plan_cites?.length || 0,
    };
  }),
  negative_control: negativeRows.map((row) => ({
    drawing_group: row.schedule_cite?.drawing_group || null,
    tag: row.tag,
    status: row.status,
  })),
  errors,
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
