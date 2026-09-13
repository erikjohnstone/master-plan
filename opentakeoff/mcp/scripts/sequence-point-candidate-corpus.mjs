#!/usr/bin/env node
/** Human-authored real-PDF gate for conservative SOO point candidates. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openPdf, textSpans } from "../src/pdf.ts";
import { buildBasSourceContext } from "../../web/src/lib/basSources.ts";
import { BAS_SEQUENCE_RULE, interpretBasSequences } from "../../web/src/lib/basSequenceReconciliation.ts";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = process.env.OPENTAKEOFF_CORPUS || resolve(here, "../../../opentakeoff-corpus");
const truthDir = resolve(corpus, "ground_truth/sequence_points");
const truthPaths = process.argv.length > 2
  ? process.argv.slice(2).map((path) => resolve(path))
  : readdirSync(truthDir).filter((name) => name.endsWith(".json")).sort().map((name) => resolve(truthDir, name));
const errors = [];
const documents = [];
const key = (candidate) => `${candidate.variable}\u0000${candidate.source_tag}`;

for (const truthPath of truthPaths) {
  if (!existsSync(truthPath)) {
    errors.push(`ground truth not found: ${truthPath}`);
    continue;
  }
  const truth = JSON.parse(readFileSync(truthPath, "utf8"));
  if (truth.schema !== "opentakeoff.sequence_point_candidate_ground_truth.v1") {
    errors.push(`${basename(truthPath)}: unsupported schema ${JSON.stringify(truth.schema)}`);
    continue;
  }
  const pdfPath = resolve(corpus, truth.source_pdf);
  if (!existsSync(pdfPath)) {
    errors.push(`${basename(truthPath)}: source PDF not found: ${pdfPath}`);
    continue;
  }
  const bytes = readFileSync(pdfPath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== truth.source_sha256) {
    errors.push(`${basename(truthPath)}: source digest changed; review the PDF and ground truth again`);
    continue;
  }
  const doc = await openPdf(pdfPath);
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.page(pageNumber);
      pages.push({ page_number: pageNumber, sheet_key: `${basename(truth.source_pdf)}#${pageNumber}`,
        width_px: page.viewport.width, height_px: page.viewport.height, rotation: 0,
        spans: textSpans(page).map((span) => ({ str: span.str, x0: span.x0, y0: span.y0,
          x1: span.x1, y1: span.y1, ...(span.rot ? { rot: span.rot } : {}) })) });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  const source = buildBasSourceContext([{ name: basename(truth.source_pdf), sha256: digest,
    byte_length: statSync(pdfPath).size, page_count: pages.length, pages }]);
  const interpretation = interpretBasSequences(source, BAS_SEQUENCE_RULE);
  if (interpretation.schema_version !== "bas_sequence_requirements_v2" || interpretation.rule_version !== BAS_SEQUENCE_RULE) {
    errors.push(`${basename(truthPath)}: current SOO candidate rule did not execute`);
  }
  const pageResults = [];
  for (const expected of truth.pages || []) {
    const actual = interpretation.regions.filter((region) => region.page_id.endsWith(`:p${expected.page}`))
      .flatMap((region) => region.clauses.flatMap((clause) => clause.requirements
        .filter((requirement) => requirement.kind === "labeled_point_candidate")
        .map((requirement) => ({ requirement, clause }))));
    const expectedKeys = expected.expected_candidates.map(key).sort();
    const actualKeys = actual.map(({ requirement }) => key(requirement)).sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      errors.push(`${basename(truthPath)} page ${expected.page}: expected ${JSON.stringify(expectedKeys)}, got ${JSON.stringify(actualKeys)}`);
    }
    for (const { requirement, clause } of actual) {
      const evidence = new Map(clause.source_spans.map((span) => [span.span_id, span]));
      if (!requirement.source_span_ids.length || requirement.source_span_ids.some((id) => !evidence.has(id))) {
        errors.push(`${basename(truthPath)} page ${expected.page} ${key(requirement)}: candidate evidence is not owned by its source clause`);
      }
      if (requirement.signal_type !== null || requirement.installed_quantity !== null
          || requirement.scope_status !== "requires_region_review") {
        errors.push(`${basename(truthPath)} page ${expected.page} ${key(requirement)}: candidate overstates engineering certainty`);
      }
    }
    pageResults.push({ page: expected.page, sheet_number: expected.sheet_number,
      expected: expectedKeys.length, extracted: actualKeys.length,
      candidates: actual.map(({ requirement }) => ({ variable: requirement.variable,
        source_tag: requirement.source_tag, evidence_spans: requirement.source_span_ids.length })) });
  }
  for (const expected of truth.negative_pages || []) {
    const actual = interpretation.regions.filter((region) => region.page_id.endsWith(`:p${expected.page}`))
      .flatMap((region) => region.clauses.flatMap((clause) => clause.requirements
        .filter((requirement) => requirement.kind === "labeled_point_candidate")));
    if (actual.length !== expected.expected_candidates) {
      errors.push(`${basename(truthPath)} negative page ${expected.page}: expected ${expected.expected_candidates}, got ${actual.length}`);
    }
    pageResults.push({ page: expected.page, sheet_number: expected.sheet_number,
      negative_control: true, expected: expected.expected_candidates, extracted: actual.length });
  }
  documents.push({ ground_truth: basename(truthPath), source_pdf: truth.source_pdf, pages: pageResults });
}

const result = { schema: "opentakeoff.sequence_point_candidate_corpus_result.v1",
  ok: errors.length === 0, ground_truth_documents: truthPaths.length,
  expected_candidates: documents.flatMap((document) => document.pages)
    .filter((page) => !page.negative_control).reduce((sum, page) => sum + page.expected, 0),
  negative_pages: documents.flatMap((document) => document.pages).filter((page) => page.negative_control).length,
  documents, errors };
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
