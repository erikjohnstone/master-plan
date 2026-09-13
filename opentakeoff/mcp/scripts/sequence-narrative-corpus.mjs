#!/usr/bin/env node
/** Human-authored real-PDF gate for free-form Sequence of Operations evidence. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openPdf, textSpans } from "../src/pdf.ts";
import { extractSequenceNarratives } from "../../web/src/lib/sequenceNarrative.ts";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = process.env.OPENTAKEOFF_CORPUS || resolve(here, "../../../opentakeoff-corpus");
const truthDir = resolve(corpus, "ground_truth/sequences");
const truthPaths = process.argv.length > 2
  ? process.argv.slice(2).map((path) => resolve(path))
  : readdirSync(truthDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => resolve(truthDir, name));

const canonical = (value) => String(value || "")
  .toUpperCase()
  .replace(/[º°]/g, "")
  .normalize("NFKD")
  .replace(/[^\p{L}\p{N}%@]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

const validBbox = (bbox) => Array.isArray(bbox)
  && bbox.length === 4
  && bbox.every(Number.isFinite)
  && bbox[2] >= bbox[0]
  && bbox[3] >= bbox[1];

const errors = [];
const documents = [];

for (const truthPath of truthPaths) {
  if (!existsSync(truthPath)) {
    errors.push(`ground truth not found: ${truthPath}`);
    continue;
  }
  const truth = JSON.parse(readFileSync(truthPath, "utf8"));
  if (truth.schema !== "opentakeoff.sequence_narrative_ground_truth.v1") {
    errors.push(`${basename(truthPath)}: unsupported schema ${JSON.stringify(truth.schema)}`);
    continue;
  }
  const pdfPath = resolve(corpus, truth.source_pdf);
  if (!existsSync(pdfPath)) {
    errors.push(`${basename(truthPath)}: source PDF not found: ${pdfPath}`);
    continue;
  }
  if (truth.source_sha256) {
    const actualSha256 = createHash("sha256").update(readFileSync(pdfPath)).digest("hex");
    if (actualSha256 !== truth.source_sha256) {
      errors.push(`${basename(truthPath)}: source SHA-256 expected ${truth.source_sha256}, got ${actualSha256}`);
      continue;
    }
  }
  const requestedPages = [...new Set([
    ...(truth.pages || []).map((row) => row.page),
    ...(truth.negative_pages || []).map((row) => row.page),
  ])].sort((a, b) => a - b);
  const expectedByPage = new Map([
    ...(truth.pages || []).map((row) => [row.page, row]),
    ...(truth.negative_pages || []).map((row) => [row.page, row]),
  ]);
  const doc = await openPdf(pdfPath);
  const sheets = [];
  try {
    for (const pageNumber of requestedPages) {
      const page = await doc.page(pageNumber);
      const expected = expectedByPage.get(pageNumber);
      sheets.push({
        key: `${basename(truth.source_pdf)}#${pageNumber}`,
        sheet_number: expected?.sheet_number || `page-${pageNumber}`,
        spans: textSpans(page).map((span) => ({
          str: span.str,
          x: span.x0,
          y: span.y0,
          w: span.x1 - span.x0,
          h: span.y1 - span.y0,
          ...(span.rot ? { rot: span.rot } : {}),
        })),
        width: page.viewport.width,
        height: page.viewport.height,
      });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  const extracted = extractSequenceNarratives(sheets);
  const pageResults = [];
  for (const expectedPage of truth.pages || []) {
    const key = `${basename(truth.source_pdf)}#${expectedPage.page}`;
    const actual = extracted.filter((block) => block.sheet === key);
    if (actual.length !== expectedPage.expected_sequences.length) {
      errors.push(`${basename(truthPath)} page ${expectedPage.page}: expected ${expectedPage.expected_sequences.length} sequence(s), got ${actual.length}`);
    }
    for (const expected of expectedPage.expected_sequences) {
      const block = actual.find((candidate) => candidate.title === expected.title);
      if (!block) {
        errors.push(`${basename(truthPath)} page ${expectedPage.page}: missing title ${JSON.stringify(expected.title)}`);
        continue;
      }
      if (block.direction !== expected.direction) {
        errors.push(`${basename(truthPath)} page ${expectedPage.page} ${JSON.stringify(expected.title)}: direction expected ${expected.direction}, got ${block.direction}`);
      }
      if (block.status !== expected.status) {
        errors.push(`${basename(truthPath)} page ${expectedPage.page} ${JSON.stringify(expected.title)}: status expected ${expected.status}, got ${block.status}`);
      }
      if (block.sections.length < expected.minimum_sections) {
        errors.push(`${basename(truthPath)} page ${expectedPage.page} ${JSON.stringify(expected.title)}: expected at least ${expected.minimum_sections} sections, got ${block.sections.length}`);
      }
      const evidence = block.sections.flatMap((section) => section.evidence);
      if (evidence.length < expected.minimum_evidence_spans) {
        errors.push(`${basename(truthPath)} page ${expectedPage.page} ${JSON.stringify(expected.title)}: expected at least ${expected.minimum_evidence_spans} evidence spans, got ${evidence.length}`);
      }
      if (!validBbox(block.title_evidence?.bbox)) {
        errors.push(`${basename(truthPath)} page ${expectedPage.page} ${JSON.stringify(expected.title)}: invalid title evidence bbox`);
      }
      evidence.forEach((cite, index) => {
        if (cite.sheet !== key || !validBbox(cite.bbox) || !String(cite.text || "").trim()) {
          errors.push(`${basename(truthPath)} page ${expectedPage.page} ${JSON.stringify(expected.title)}: invalid evidence span ${index}`);
        }
      });
      const narrative = canonical(block.sections.map((section) => section.body).join(" "));
      for (const phrase of expected.required_phrases || []) {
        if (!narrative.includes(canonical(phrase))) {
          errors.push(`${basename(truthPath)} page ${expectedPage.page} ${JSON.stringify(expected.title)}: missing required phrase ${JSON.stringify(phrase)}`);
        }
      }
      for (const phrase of expected.forbidden_phrases || []) {
        if (narrative.includes(canonical(phrase))) {
          errors.push(`${basename(truthPath)} page ${expectedPage.page} ${JSON.stringify(expected.title)}: contains forbidden phrase ${JSON.stringify(phrase)}`);
        }
      }
    }
    pageResults.push({
      page: expectedPage.page,
      sheet_number: expectedPage.sheet_number,
      expected: expectedPage.expected_sequences.length,
      extracted: actual.length,
      titles: actual.map((block) => block.title),
      sections: actual.reduce((sum, block) => sum + block.sections.length, 0),
      evidence_spans: actual.reduce((sum, block) => sum + block.sections.reduce((n, section) => n + section.evidence.length, 0), 0),
    });
  }
  for (const negative of truth.negative_pages || []) {
    const key = `${basename(truth.source_pdf)}#${negative.page}`;
    const actual = extracted.filter((block) => block.sheet === key);
    if (actual.length !== negative.expected_sequences) {
      errors.push(`${basename(truthPath)} negative page ${negative.page}: expected ${negative.expected_sequences} sequence(s), got ${actual.length} (${actual.map((block) => block.title).join(" | ")})`);
    }
    pageResults.push({
      page: negative.page,
      sheet_number: negative.sheet_number,
      negative_control: true,
      expected: negative.expected_sequences,
      extracted: actual.length,
      titles: actual.map((block) => block.title),
    });
  }
  documents.push({
    ground_truth: basename(truthPath),
    source_pdf: truth.source_pdf,
    pages: pageResults,
  });
}

const result = {
  schema: "opentakeoff.sequence_narrative_corpus_result.v1",
  ok: errors.length === 0,
  ground_truth_documents: truthPaths.length,
  positive_pages: documents.flatMap((document) => document.pages).filter((page) => !page.negative_control).length,
  negative_pages: documents.flatMap((document) => document.pages).filter((page) => page.negative_control).length,
  expected_sequences: documents.flatMap((document) => document.pages).reduce((sum, page) => sum + page.expected, 0),
  documents,
  errors,
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
