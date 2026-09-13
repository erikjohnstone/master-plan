#!/usr/bin/env node
/** Real-PDF gate for the complete hand-reviewed NAVFAC points-list inventory. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileBasTakeoff, compileHvacTakeoff } from "../../web/src/lib/corpusTakeoff.mjs";
import { shutdownVectorGrid } from "../../web/src/lib/vectorGridClient.ts";
import { cachedSheetGraph } from "./sheetGraphCache.mjs";
import { Session } from "../src/session.ts";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = process.env.OPENTAKEOFF_CORPUS || resolve(here, "../../../opentakeoff-corpus");
const truthPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(corpus, "ground_truth/bas_points/navfac-cherry-point-full-points-inventory.json");
if (!existsSync(truthPath)) throw new Error(`Ground truth not found: ${truthPath}`);
const truth = JSON.parse(readFileSync(truthPath, "utf8"));
if (truth.schema !== "opentakeoff.bas_points_inventory_ground_truth.v2") {
  throw new Error(`Unsupported ground-truth schema: ${truth.schema}`);
}
const pdfPath = resolve(corpus, truth.source_pdf);
if (!existsSync(pdfPath)) throw new Error(`Source PDF not found: ${pdfPath}`);

const session = new Session();
try {
await session.loadPlan(pdfPath);
const fixturePath = process.env.OPENTAKEOFF_GRAPH_FIXTURE;
const graph = fixturePath
  ? JSON.parse(readFileSync(resolve(fixturePath), "utf8"))
  : await cachedSheetGraph(pdfPath, {
    expectedSha256: createHash("sha256").update(readFileSync(pdfPath)).digest("hex"),
    identity: [truth.set_id, "bas-points-inventory-v2"],
    compute: () => session.graphForPipeline(),
  });

const bas = compileBasTakeoff(graph.sheets, graph);
const hvac = compileHvacTakeoff(graph.sheets, graph);
const errors = [];
const pageOf = (sheet) => Number(String(sheet || "").match(/#(\d+)$/)?.[1]);
const validBbox = (bbox) => Array.isArray(bbox)
  && bbox.length === 4
  && bbox.every(Number.isFinite)
  && bbox[2] >= bbox[0]
  && bbox[3] >= bbox[1];
const overlaps = (a, b) => Math.min(a[2], b[2]) > Math.max(a[0], b[0])
  && Math.min(a[3], b[3]) > Math.max(a[1], b[1]);
const identity = (entry) => `${entry.page}\0${entry.title}`;
const actualByIdentity = new Map();
for (const list of bas.categories.points_lists.lists) {
  const key = identity({ page: pageOf(list.sheet_id), title: list.title });
  if (actualByIdentity.has(key)) errors.push(`duplicate compiled list identity: ${key}`);
  actualByIdentity.set(key, list);
}

for (const expected of truth.lists) {
  const key = identity(expected);
  const actual = actualByIdentity.get(key);
  if (!actual) {
    errors.push(`missing list: page ${expected.page} ${expected.title}`);
    continue;
  }
  for (const field of ["rows", "AI", "AO", "BI", "BO"]) {
    if (actual[field] !== expected[field]) {
      errors.push(`${expected.title}: ${field} expected ${expected[field]}, got ${actual[field]}`);
    }
  }
  const sectionLabels = new Set(truth.negative_controls.excluded_section_labels);
  for (const item of actual.items) {
    if (sectionLabels.has(item.tag)) errors.push(`${expected.title}: section label emitted as point ${item.tag}`);
    if (!/^(?:AI|AO|BI|BO)(?:[\s-]?(?:\d|#+))/i.test(item.tag)) {
      errors.push(`${expected.title}: untyped point mark ${item.tag}`);
    }
    if (!validBbox(item.bbox_px)) errors.push(`${expected.title}: invalid MARK bbox for ${item.tag}`);
  }
  for (const wildcard of expected.wildcard_marks || []) {
    if (!actual.items.some((item) => item.tag === wildcard)) {
      errors.push(`${expected.title}: missing reviewed wildcard mark ${wildcard}`);
    }
  }
  const citeSamples = [actual.items[0], actual.items.at(-1),
    ...(expected.wildcard_marks || []).map((mark) => actual.items.find((item) => item.tag === mark))]
    .filter(Boolean);
  for (const item of citeSamples) {
    const hits = session.findText(item.sheet_id, item.tag, { limit: 500 }).hits || [];
    if (!hits.some((hit) => validBbox(hit.bbox) && overlaps(hit.bbox, item.bbox_px))) {
      errors.push(`${expected.title}: ${item.tag} is not vector-grounded under its MARK bbox`);
    }
  }
}

for (const key of actualByIdentity.keys()) {
  if (!truth.lists.some((expected) => identity(expected) === key)) errors.push(`unexpected compiled list: ${key}`);
}
for (const field of ["lists", "rows", "AI", "AO", "BI", "BO"]) {
  if (bas.totals[field] !== truth.totals[field]) {
    errors.push(`total ${field} expected ${truth.totals[field]}, got ${bas.totals[field]}`);
  }
}
if (hvac.categories.CRAH.count !== truth.negative_controls.expected_hvac_crah_items) {
  errors.push(`HVAC CRAH expected ${truth.negative_controls.expected_hvac_crah_items}, got ${hvac.categories.CRAH.count}`);
}
if (hvac.categories.CRAH.items.some((item) => /^(?:AI|AO|BI|BO)/i.test(item.tag))) {
  errors.push("HVAC CRAH inventory contains BAS point marks");
}

const report = {
  schema: "opentakeoff.bas_points_inventory_corpus_result.v2",
  ok: errors.length === 0,
  source_pdf: truth.source_pdf,
  graph_source: fixturePath ? "explicit_fixture" : "content_addressed_production_graph",
  totals: bas.totals,
  hvac_crah_items: hvac.categories.CRAH.count,
  errors,
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
} finally {
  await shutdownVectorGrid();
}
