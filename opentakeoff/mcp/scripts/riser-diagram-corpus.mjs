#!/usr/bin/env node
/** Exact real-PDF gate for authored multi-page riser evidence. */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openPdf, textSpans, OPS } from "../src/pdf.ts";
import { extractVectorGeometry } from "../../web/src/lib/oneclick.ts";
import { extractControlSchematics } from "../../web/src/lib/controlSchematic.ts";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = process.env.OPENTAKEOFF_CORPUS || resolve(here, "../../../opentakeoff-corpus");
const benchmark = process.env.OPENTAKEOFF_BENCHMARK;
const truthPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(corpus, "ground_truth/control_schematics/transbay-water-risers.m4.04-m4.06.json");
if (!existsSync(truthPath)) throw new Error(`Ground truth not found: ${truthPath}`);
if (!benchmark) throw new Error("Set OPENTAKEOFF_BENCHMARK to the HVAC BAS Benchmark Collection directory.");
const truth = JSON.parse(readFileSync(truthPath, "utf8"));
const pdfPath = resolve(benchmark, truth.source_pdf);
if (!existsSync(pdfPath)) throw new Error(`Source PDF not found: ${pdfPath}`);
const digest = await new Promise((resolveDigest, reject) => {
  const hash = createHash("sha256");
  const stream = createReadStream(pdfPath);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.on("error", reject);
  stream.on("end", () => resolveDigest(hash.digest("hex")));
});
if (digest !== truth.source_sha256) {
  throw new Error(`Source PDF sha256 mismatch: expected ${truth.source_sha256}, got ${digest}`);
}

const pageTruth = [...truth.pages, ...(truth.negative_pages || []).map((page) => ({ page, negative: true }))];
const doc = await openPdf(pdfPath);
const contexts = [];
try {
  for (const expected of pageTruth) {
    const page = await doc.page(expected.page);
    const spans = textSpans(page).map((span) => ({
      str: span.str,
      x: span.x0,
      y: span.y0,
      w: span.x1 - span.x0,
      h: span.y1 - span.y0,
      ...(span.rot ? { rot: span.rot } : {}),
    }));
    const geometry = extractVectorGeometry(await page.operatorList(), page.viewport.transform, OPS);
    contexts.push({
      key: `${truth.source_pdf.split("/").at(-1)}#${expected.page}`,
      sheet_number: expected.sheet_number || null,
      spans,
      segs: geometry.segs,
      width: page.viewport.width,
      height: page.viewport.height,
    });
    page.cleanup();
  }
} finally {
  await doc.destroy();
}

const result = extractControlSchematics(contexts);
const errors = [];
const pages = [];
const validBbox = (bbox) => Array.isArray(bbox) && bbox.length === 4
  && bbox.every(Number.isFinite) && bbox[2] >= bbox[0] && bbox[3] >= bbox[1];
const stable = (value) => JSON.stringify(value, Object.keys(value).sort());
const sorted = (rows) => [...rows].sort((a, b) => stable(a).localeCompare(stable(b)));

for (const expected of truth.pages) {
  const key = `${truth.source_pdf.split("/").at(-1)}#${expected.page}`;
  const actualRows = result.risers.filter((item) => item.sheet === key);
  if (actualRows.length !== 1) {
    errors.push(`page ${expected.page}: expected 1 riser diagram, got ${actualRows.length}`);
    continue;
  }
  const actual = actualRows[0];
  if (actual.title !== expected.title) errors.push(`page ${expected.page}: title expected ${JSON.stringify(expected.title)}, got ${JSON.stringify(actual.title)}`);
  if (actual.diagram_kind !== expected.diagram_kind) errors.push(`page ${expected.page}: kind expected ${expected.diagram_kind}, got ${actual.diagram_kind}`);
  if (actual.semantic_status !== expected.semantic_status) errors.push(`page ${expected.page}: semantic status expected ${expected.semantic_status}, got ${actual.semantic_status}`);
  if (actual.topology.status !== "computed") errors.push(`page ${expected.page}: vector topology was not computed (${actual.topology.status})`);
  if (!validBbox(actual.title_evidence?.bbox)) errors.push(`page ${expected.page}: missing valid title evidence bbox`);

  const actualDatums = actual.datums.map(({ label }) => label);
  if (JSON.stringify(actualDatums) !== JSON.stringify(expected.floor_datums)) {
    errors.push(`page ${expected.page}: floor datums differ; expected ${JSON.stringify(expected.floor_datums)}, got ${JSON.stringify(actualDatums)}`);
  }
  for (const datum of actual.datums) {
    if (!validBbox(datum.evidence?.bbox)) errors.push(`page ${expected.page}: floor ${datum.label} has invalid evidence bbox`);
    const aliases = datum.aliases.map(({ label }) => label).sort();
    const wanted = [...(expected.floor_aliases?.[datum.label] || [])].sort();
    if (JSON.stringify(aliases) !== JSON.stringify(wanted)) {
      errors.push(`page ${expected.page}: aliases for ${datum.label} expected ${JSON.stringify(wanted)}, got ${JSON.stringify(aliases)}`);
    }
  }

  const services = actual.service_groups.map(({ label, normalized_system, pressure_zone, service_pair }) => ({
    label, normalized_system, pressure_zone, service_pair,
  }));
  if (JSON.stringify(sorted(services)) !== JSON.stringify(sorted(expected.service_groups))) {
    errors.push(`page ${expected.page}: service groups differ; expected ${JSON.stringify(sorted(expected.service_groups))}, got ${JSON.stringify(sorted(services))}`);
  }
  for (const service of actual.service_groups) {
    if (!service.evidence.length || service.evidence.some(({ bbox }) => !validBbox(bbox))) {
      errors.push(`page ${expected.page}: service ${service.label} lacks valid per-instance evidence`);
    }
  }

  const continuations = actual.continuations.map(({ target_sheet, boundary }) => ({ target_sheet, boundary }));
  if (JSON.stringify(sorted(continuations)) !== JSON.stringify(sorted(expected.continuations))) {
    errors.push(`page ${expected.page}: continuations differ; expected ${JSON.stringify(sorted(expected.continuations))}, got ${JSON.stringify(sorted(continuations))}`);
  }
  if (actual.continuations.some(({ evidence }) => !validBbox(evidence?.bbox))) errors.push(`page ${expected.page}: continuation lacks valid evidence bbox`);
  if (!actual.trace_candidates.length) errors.push(`page ${expected.page}: expected unresolved vertical geometry candidates`);
  if (actual.trace_candidates.some(({ status }) => status !== "unresolved_vector_candidate")) {
    errors.push(`page ${expected.page}: a raw trace candidate was promoted without semantic binding`);
  }
  if (actual.review.unresolved_trace_candidates !== actual.trace_candidates.length) {
    errors.push(`page ${expected.page}: unresolved trace review count does not match candidates`);
  }
  pages.push({
    page: expected.page,
    sheet_number: expected.sheet_number,
    title: actual.title,
    floor_datums: actual.datums.length,
    service_groups: services,
    continuations,
    unresolved_trace_candidates: actual.trace_candidates.length,
    semantic_status: actual.semantic_status,
  });
}

for (const page of truth.negative_pages || []) {
  const key = `${truth.source_pdf.split("/").at(-1)}#${page}`;
  const count = result.risers.filter((item) => item.sheet === key).length;
  if (count) errors.push(`negative page ${page}: expected 0 riser diagrams, got ${count}`);
}

const continuationLinks = result.continuation_links.map((link) => ({
  from_sheet_number: link.from_sheet_number,
  to_sheet_number: link.to_sheet_number,
  status: link.status,
}));
if (JSON.stringify(sorted(continuationLinks)) !== JSON.stringify(sorted(truth.expected_continuation_links || []))) {
  errors.push(`continuation links differ; expected ${JSON.stringify(sorted(truth.expected_continuation_links || []))}, got ${JSON.stringify(sorted(continuationLinks))}`);
}
for (const link of result.continuation_links) {
  if (!validBbox(link.from_evidence?.bbox)) errors.push(`continuation link ${link.id}: invalid source evidence bbox`);
  if (link.status === "reciprocal" && !validBbox(link.to_evidence?.bbox)) errors.push(`continuation link ${link.id}: reciprocal link lacks target evidence bbox`);
}

console.log(JSON.stringify({
  schema: truth.schema,
  ok: errors.length === 0,
  source_pdf: truth.source_pdf,
  pages,
  negative_pages: truth.negative_pages || [],
  continuation_links: continuationLinks,
  errors,
}, null, 2));
if (errors.length) process.exitCode = 1;
