#!/usr/bin/env node
/** Real-PDF gate for free-form SOO + explicit schematic point evidence. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openPdf, textSpans, OPS } from "../src/pdf.ts";
import { extractVectorGeometry } from "../../web/src/lib/oneclick.ts";
import { extractControlSchematics } from "../../web/src/lib/controlSchematic.ts";
import { extractSequenceNarratives } from "../../web/src/lib/sequenceNarrative.ts";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = process.env.OPENTAKEOFF_CORPUS || resolve(here, "../../../opentakeoff-corpus");
const truthPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(corpus, "ground_truth/control_schematics/itd-d1-lab-mechanical.m6.json");
if (!existsSync(truthPath)) throw new Error(`Ground truth not found: ${truthPath}`);
const truth = JSON.parse(readFileSync(truthPath, "utf8"));
const pdfPath = resolve(corpus, truth.source_pdf);
if (!existsSync(pdfPath)) throw new Error(`Source PDF not found: ${pdfPath}`);
if (truth.source_sha256) {
  const actualSha256 = createHash("sha256").update(readFileSync(pdfPath)).digest("hex");
  if (actualSha256 !== truth.source_sha256) {
    throw new Error(`Source SHA-256 mismatch: expected ${truth.source_sha256}, got ${actualSha256}`);
  }
}

const doc = await openPdf(pdfPath);
const sheetInputs = [];
const rawByPage = new Map();
try {
  for (const expected of truth.pages) {
    const page = await doc.page(expected.page);
    const raw = textSpans(page);
    const geometry = extractVectorGeometry(await page.operatorList(), page.viewport.transform, OPS);
    rawByPage.set(expected.page, raw);
    sheetInputs.push({
      key: `${truth.source_pdf.split("/").at(-1)}#${expected.page}`,
      sheet_number: expected.sheet_number,
      spans: raw.map((span) => ({
        str: span.str,
        x: span.x0,
        y: span.y0,
        w: span.x1 - span.x0,
        h: span.y1 - span.y0,
        ...(span.rot ? { rot: span.rot } : {}),
      })),
      segs: geometry.segs,
      width: page.viewport.width,
      height: page.viewport.height,
    });
    page.cleanup();
  }
} finally {
  await doc.destroy();
}

const extracted = extractSequenceNarratives(sheetInputs);
const controls = extractControlSchematics(sheetInputs, { tables: [], sequence_narratives: extracted });
const errors = [];
const pages = [];
const validBbox = (bbox) => Array.isArray(bbox) && bbox.length === 4
  && bbox.every(Number.isFinite) && bbox[2] >= bbox[0] && bbox[3] >= bbox[1];
for (const expected of truth.pages) {
  const key = `${truth.source_pdf.split("/").at(-1)}#${expected.page}`;
  const actual = extracted.filter((block) => block.sheet === key);
  const titles = actual.map((block) => block.title);
  for (const title of expected.sequence_titles) {
    if (!titles.includes(title)) errors.push(`page ${expected.page}: missing sequence title ${JSON.stringify(title)}`);
  }
  if (titles.length !== expected.sequence_titles.length) {
    errors.push(`page ${expected.page}: expected ${expected.sequence_titles.length} sequence(s), got ${titles.length}`);
  }
  const narrative = actual.flatMap((block) => block.sections.map((section) => section.body)).join(" ");
  for (const phrase of expected.required_narrative_phrases || []) {
    if (!narrative.includes(phrase)) errors.push(`page ${expected.page}: missing narrative phrase ${JSON.stringify(phrase)}`);
  }
  const raw = rawByPage.get(expected.page) || [];
  const rawTitles = raw.map((span) => String(span.str || "").replace(/\s+/g, " ").trim());
  for (const title of expected.control_diagram_titles || []) {
    if (!rawTitles.includes(title)) errors.push(`page ${expected.page}: missing control diagram title ${JSON.stringify(title)}`);
  }
  const io = Object.fromEntries(["AI", "AO", "DI", "DO"].map((token) => [
    token,
    rawTitles.filter((text) => text === token).length,
  ]));
  for (const [token, count] of Object.entries(expected.explicit_io_tokens || {})) {
    if (io[token] !== count) errors.push(`page ${expected.page}: ${token} expected ${count}, got ${io[token]}`);
  }
  const pageSchematics = controls.schematics.filter((schematic) => schematic.sheet === key);
  const schematicTitles = pageSchematics.map((schematic) => schematic.title);
  for (const title of expected.control_diagram_titles || []) {
    if (!schematicTitles.includes(title)) errors.push(`page ${expected.page}: extractor missing control diagram ${JSON.stringify(title)}`);
  }
  if (pageSchematics.length !== (expected.control_diagram_titles || []).length) {
    errors.push(`page ${expected.page}: expected ${(expected.control_diagram_titles || []).length} extracted schematic(s), got ${pageSchematics.length}`);
  }
  for (const title of expected.forbidden_control_diagram_titles || []) {
    if (schematicTitles.includes(title)) errors.push(`page ${expected.page}: forbidden title-block/false schematic extracted ${JSON.stringify(title)}`);
  }
  for (const schematic of pageSchematics) {
    if (schematic.semantic_status !== "evidence_inventory") errors.push(`page ${expected.page}: unverified schematic ${JSON.stringify(schematic.title)} promoted to ${schematic.semantic_status}`);
    if (schematic.topology.status !== "computed") errors.push(`page ${expected.page}: raw vector topology not computed for ${JSON.stringify(schematic.title)}`);
    if (!validBbox(schematic.title_evidence?.bbox) || schematic.title_evidence?.sheet !== key) {
      errors.push(`page ${expected.page}: ${JSON.stringify(schematic.title)} lacks a valid same-sheet title citation`);
    }
    if (expected.require_horizontal_title_evidence
      && schematic.title_evidence.bbox[2] - schematic.title_evidence.bbox[0]
        <= schematic.title_evidence.bbox[3] - schematic.title_evidence.bbox[1]) {
      errors.push(`page ${expected.page}: ${JSON.stringify(schematic.title)} is grounded to a rotated/title-block occurrence instead of the horizontal drawing-field caption`);
    }
    const expectedStatus = expected.expected_sequence_binding_status?.[schematic.title]
      || (expected.expected_sequence_bindings?.[schematic.title] || expected.expected_sequence_refs?.[schematic.title] ? "bound" : null);
    if (expectedStatus && schematic.sequence_binding_status !== expectedStatus) {
      errors.push(`page ${expected.page}: ${JSON.stringify(schematic.title)} sequence binding expected ${expectedStatus}, got ${schematic.sequence_binding_status}`);
    }
  }
  for (const [diagramTitle, expectedSequenceTitles] of Object.entries(expected.expected_sequence_bindings || {})) {
    const schematic = pageSchematics.find((candidate) => candidate.title === diagramTitle);
    if (!schematic) continue;
    const actualSequenceTitles = schematic.sequence_refs.map(({ title }) => title).sort();
    const wantedSequenceTitles = [...expectedSequenceTitles].sort();
    if (schematic.sequence_binding_status !== "bound") {
      errors.push(`page ${expected.page}: ${JSON.stringify(diagramTitle)} sequence binding is ${schematic.sequence_binding_status}`);
    }
    if (JSON.stringify(actualSequenceTitles) !== JSON.stringify(wantedSequenceTitles)) {
      errors.push(`page ${expected.page}: ${JSON.stringify(diagramTitle)} sequences expected ${JSON.stringify(wantedSequenceTitles)}, got ${JSON.stringify(actualSequenceTitles)}`);
    }
  }
  for (const [diagramTitle, expectedRefs] of Object.entries(expected.expected_sequence_refs || {})) {
    const schematic = pageSchematics.find((candidate) => candidate.title === diagramTitle);
    if (!schematic) continue;
    const actualRefs = schematic.sequence_refs.map(({ title, sheet, title_bbox }) => ({
      title, sheet, title_bbox,
    })).sort((a, b) => a.sheet.localeCompare(b.sheet) || a.title.localeCompare(b.title));
    const wantedRefs = expectedRefs.map(({ title, page }) => ({
      title,
      sheet: `${truth.source_pdf.split("/").at(-1)}#${page}`,
    })).sort((a, b) => a.sheet.localeCompare(b.sheet) || a.title.localeCompare(b.title));
    if (actualRefs.length !== wantedRefs.length) {
      errors.push(`page ${expected.page}: ${JSON.stringify(diagramTitle)} expected ${wantedRefs.length} sequence ref(s), got ${actualRefs.length}`);
    }
    for (let index = 0; index < Math.min(actualRefs.length, wantedRefs.length); index++) {
      if (actualRefs[index].title !== wantedRefs[index].title || actualRefs[index].sheet !== wantedRefs[index].sheet) {
        errors.push(`page ${expected.page}: ${JSON.stringify(diagramTitle)} sequence ref expected ${JSON.stringify(wantedRefs[index])}, got ${JSON.stringify({ title: actualRefs[index].title, sheet: actualRefs[index].sheet })}`);
      }
      if (!validBbox(actualRefs[index].title_bbox)) {
        errors.push(`page ${expected.page}: ${JSON.stringify(diagramTitle)} sequence ref ${JSON.stringify(actualRefs[index].title)} lacks a valid title bbox`);
      }
    }
  }
  const extractedIo = Object.fromEntries(["AI", "AO", "DI", "DO"].map((token) => [
    token,
    pageSchematics.reduce((sum, schematic) => sum + (schematic.point_totals[token] || 0), 0),
  ]));
  for (const [token, count] of Object.entries(expected.explicit_io_tokens || {})) {
    if (extractedIo[token] !== count) errors.push(`page ${expected.page}: extracted ${token} expected ${count}, got ${extractedIo[token]}`);
  }
  for (const expectedDiagram of expected.diagrams || []) {
    const schematic = pageSchematics.find((candidate) => candidate.title === expectedDiagram.title);
    if (!schematic) continue;
    for (const [token, count] of Object.entries(expectedDiagram.explicit_io_tokens || {})) {
      if (schematic.point_totals[token] !== count) {
        errors.push(`page ${expected.page} ${JSON.stringify(expectedDiagram.title)}: ${token} expected ${count}, got ${schematic.point_totals[token]}`);
      }
    }
    if (expectedDiagram.expected_io_bindings) {
      const actualCounts = new Map();
      for (const binding of schematic.io_bindings) {
        const key = `${binding.instrument_label}:${binding.point_type}`;
        actualCounts.set(key, (actualCounts.get(key) || 0) + 1);
        if (!validBbox(binding.point_evidence?.bbox) || !validBbox(binding.instrument_evidence?.bbox) || !validBbox(binding.tether_evidence?.bbox)) {
          errors.push(`page ${expected.page} ${JSON.stringify(schematic.title)}: ${key} lacks point, instrument, or tether citation`);
        }
      }
      const expectedCounts = new Map(expectedDiagram.expected_io_bindings.map(({ instrument_label, point_type, count }) => [
        `${instrument_label}:${point_type}`, count,
      ]));
      const allKeys = [...new Set([...actualCounts.keys(), ...expectedCounts.keys()])].sort();
      for (const key of allKeys) {
        if ((actualCounts.get(key) || 0) !== (expectedCounts.get(key) || 0)) {
          errors.push(`page ${expected.page} ${JSON.stringify(schematic.title)}: binding ${key} expected ${expectedCounts.get(key) || 0}, got ${actualCounts.get(key) || 0}`);
        }
      }
    }
  }
  const extractedLabels = new Set(pageSchematics.flatMap((schematic) => [
    ...schematic.instruments.map((item) => item.label),
    ...schematic.equipment.map((item) => item.tag),
    ...schematic.component_labels.map((item) => item.label),
    ...schematic.media_labels.map((item) => item.label),
  ]));
  for (const label of expected.required_diagram_labels || []) {
    if (!extractedLabels.has(label)) errors.push(`page ${expected.page}: missing classified diagram label ${JSON.stringify(label)}`);
  }
  pages.push({
    page: expected.page,
    sheet_number: expected.sheet_number,
    sequences: actual.length,
    sections: actual.reduce((sum, block) => sum + block.sections.length, 0),
    evidence_spans: actual.reduce((sum, block) => sum + block.sections.reduce((n, section) => n + section.evidence.length, 0), 0),
    explicit_io_tokens: io,
    extracted_schematics: pageSchematics.map((schematic) => ({
      title: schematic.title,
      explicit_io_tokens: schematic.point_totals,
      equipment: schematic.equipment.map((item) => item.tag),
      instruments: schematic.instruments.map((item) => item.label),
      components: schematic.component_labels.map((item) => item.label),
      media: schematic.media_labels.map((item) => item.label),
      io_bindings: schematic.io_bindings.map(({ instrument_label, point_type }) => ({ instrument_label, point_type })),
      sequence_refs: schematic.sequence_refs.map(({ title }) => title),
      sequence_binding_status: schematic.sequence_binding_status,
      semantic_status: schematic.semantic_status,
      topology_status: schematic.topology.status,
      unresolved_crossings: schematic.review.unresolved_crossings,
    })),
  });
}

if (truth.expected_total_schematics != null && controls.schematics.length !== truth.expected_total_schematics) {
  errors.push(`expected ${truth.expected_total_schematics} total schematic(s), got ${controls.schematics.length}`);
}

const result = {
  schema: truth.schema,
  ok: errors.length === 0,
  source_pdf: truth.source_pdf,
  sequence_count: extracted.length,
  schematic_count: controls.schematics.length,
  riser_count: controls.risers.length,
  pages,
  errors,
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
