#!/usr/bin/env node
/** Exact real-PDF gate for authored BAS network-riser evidence. */
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
  : resolve(corpus, "ground_truth/control_schematics/lbnl-building-automation-network-riser.j601.json");
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
if (digest !== truth.source_sha256) throw new Error(`Source PDF sha256 mismatch: expected ${truth.source_sha256}, got ${digest}`);

const pages = [truth.page, ...(truth.negative_pages || [])];
const doc = await openPdf(pdfPath);
const contexts = [];
try {
  for (const pageNumber of pages) {
    const page = await doc.page(pageNumber);
    const spans = textSpans(page).map((span) => ({
      str: span.str, x: span.x0, y: span.y0, w: span.x1 - span.x0, h: span.y1 - span.y0,
      ...(span.rot ? { rot: span.rot } : {}),
    }));
    const geometry = extractVectorGeometry(await page.operatorList(), page.viewport.transform, OPS);
    contexts.push({
      key: `${truth.source_pdf.split("/").at(-1)}#${pageNumber}`,
      sheet_number: pageNumber === truth.page ? truth.sheet_number : null,
      spans, segs: geometry.segs, width: page.viewport.width, height: page.viewport.height,
    });
    page.cleanup();
  }
} finally {
  await doc.destroy();
}

const extracted = extractControlSchematics(contexts);
const errors = [];
const key = `${truth.source_pdf.split("/").at(-1)}#${truth.page}`;
const diagrams = extracted.risers.filter((item) => item.sheet === key);
const validBbox = (bbox) => Array.isArray(bbox) && bbox.length === 4
  && bbox.every(Number.isFinite) && bbox[2] >= bbox[0] && bbox[3] >= bbox[1];
const stableSort = (rows) => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
let summary = null;

if (diagrams.length !== 1) errors.push(`page ${truth.page}: expected 1 network riser, got ${diagrams.length}`);
else {
  const actual = diagrams[0];
  if (actual.title !== truth.title) errors.push(`page ${truth.page}: title expected ${JSON.stringify(truth.title)}, got ${JSON.stringify(actual.title)}`);
  if (actual.diagram_kind !== truth.diagram_kind) errors.push(`page ${truth.page}: kind expected ${truth.diagram_kind}, got ${actual.diagram_kind}`);
  if (actual.semantic_status !== truth.semantic_status) errors.push(`page ${truth.page}: semantic status expected ${truth.semantic_status}, got ${actual.semantic_status}`);
  if (actual.topology.status !== "computed") errors.push(`page ${truth.page}: vector topology was not computed (${actual.topology.status})`);
  if (!validBbox(actual.title_evidence?.bbox)) errors.push(`page ${truth.page}: title lacks a valid citation bbox`);
  if (actual.systems.length !== 1 || actual.systems[0].normalized_system !== truth.normalized_system) {
    errors.push(`page ${truth.page}: expected system ${truth.normalized_system}, got ${actual.systems.map(({ normalized_system }) => normalized_system).join(",")}`);
  }

  const datums = actual.datums.map(({ label }) => label);
  if (JSON.stringify(datums) !== JSON.stringify(truth.floor_datums)) {
    errors.push(`page ${truth.page}: floor datums expected ${JSON.stringify(truth.floor_datums)}, got ${JSON.stringify(datums)}`);
  }
  if (actual.datums.some(({ evidence }) => !validBbox(evidence?.bbox))) errors.push(`page ${truth.page}: one or more floor datums lack valid citation bboxes`);

  const transports = actual.network_transports.map(({ kind, name }) => ({ kind, name }));
  if (JSON.stringify(stableSort(transports)) !== JSON.stringify(stableSort(truth.required_transports))) {
    errors.push(`page ${truth.page}: transports expected ${JSON.stringify(stableSort(truth.required_transports))}, got ${JSON.stringify(stableSort(transports))}`);
  }
  for (const transport of actual.network_transports) {
    if (!transport.evidence.length || transport.evidence.some(({ bbox }) => !validBbox(bbox))) {
      errors.push(`page ${truth.page}: ${transport.name} lacks valid occurrence citations`);
    }
  }

  const tagMap = new Map(actual.diagram_tags.map((item) => [item.tag, item]));
  for (const tag of truth.required_tag_subset) {
    const group = tagMap.get(tag);
    if (!group) errors.push(`page ${truth.page}: missing independently reviewed tag ${tag}`);
    else if (!group.evidence.length || group.evidence.some(({ bbox }) => !validBbox(bbox))) errors.push(`page ${truth.page}: ${tag} lacks valid citations`);
  }
  const floorPlacementKeys = new Set(actual.floor_placements.map(({ subject, floor_label }) => `${subject}\u0000${floor_label}`));
  for (const placement of truth.required_floor_placements || []) {
    if (!floorPlacementKeys.has(`${placement.subject}\u0000${placement.floor_label}`)) {
      errors.push(`page ${truth.page}: missing reviewed floor placement ${placement.subject} on ${placement.floor_label}`);
    }
  }
  if (actual.floor_placements.some(({ subject_evidence, floor_evidence }) => !validBbox(subject_evidence?.bbox) || !validBbox(floor_evidence?.bbox))) {
    errors.push(`page ${truth.page}: one or more floor placements lack both subject and datum citations`);
  }

  const componentMap = new Map(actual.network_components.map((item) => [item.component_type, item]));
  for (const componentType of truth.required_network_components) {
    const component = componentMap.get(componentType);
    if (!component) errors.push(`page ${truth.page}: missing authored network component ${componentType}`);
    else if (!component.evidence.length || component.evidence.some(({ bbox }) => !validBbox(bbox))) errors.push(`page ${truth.page}: ${componentType} lacks valid citations`);
  }
  if (!actual.trace_candidates.length || actual.trace_candidates.some(({ status }) => status !== "unresolved_vector_candidate")) {
    errors.push(`page ${truth.page}: raw vertical geometry must remain unresolved candidates`);
  }
  if (actual.semantic_status === "verified_semantic_graph") errors.push(`page ${truth.page}: unverified line connectivity was promoted to a semantic graph`);

  summary = {
    page: truth.page,
    sheet_number: truth.sheet_number,
    title: actual.title,
    floor_datums: datums,
    transports,
    required_tags_found: truth.required_tag_subset.filter((tag) => tagMap.has(tag)),
    required_tag_floor_placements: actual.floor_placements
      .filter(({ subject_kind, subject }) => subject_kind === "diagram_tag" && truth.required_tag_subset.includes(subject))
      .map(({ subject, floor_label }) => ({ subject, floor_label })),
    network_components: actual.network_components.map(({ component_type, evidence }) => ({ component_type, cited_occurrences: evidence.length })),
    unresolved_trace_candidates: actual.trace_candidates.length,
    raw_crossings: actual.topology.crossings.length,
    semantic_status: actual.semantic_status,
  };
}

for (const page of truth.negative_pages || []) {
  const negativeKey = `${truth.source_pdf.split("/").at(-1)}#${page}`;
  const count = extracted.risers.filter((item) => item.sheet === negativeKey).length;
  if (count) errors.push(`negative page ${page}: expected 0 network risers, got ${count}`);
}

console.log(JSON.stringify({
  schema: truth.schema,
  ok: errors.length === 0,
  source_pdf: truth.source_pdf,
  summary,
  negative_pages: truth.negative_pages || [],
  errors,
}, null, 2));
if (errors.length) process.exitCode = 1;
