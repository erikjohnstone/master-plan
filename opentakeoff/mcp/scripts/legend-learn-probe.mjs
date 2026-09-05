#!/usr/bin/env node
// Read-only Legend Learn diagnostic for real-PDF corpus review.
// Usage:
//   node --import tsx scripts/legend-learn-probe.mjs PDF 1,4,7-9
//   node --import tsx scripts/legend-learn-probe.mjs PDF all --summary
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { Session } from "../src/session.ts";
import { findLegendGlyphs as detectLegendGlyphs, legendLearnStatus } from "../../web/src/lib/legendlearn.ts";

const [pdfArg, pageSpec, ...flags] = process.argv.slice(2);
const summary = flags.includes("--summary");
const captionsOnly = flags.includes("--captions");
const brief = flags.includes("--brief");
const spansFlag = flags.find((flag) => flag.startsWith("--spans="));
const numericFlag = (name) => {
  const value = flags.find((flag) => flag.startsWith(`--${name}=`));
  return value ? Number(value.slice(name.length + 3)) : undefined;
};
const detectorOptions = {
  maxGlyphDimPx: numericFlag("max-glyph"),
  maxCaptionGapPx: numericFlag("max-gap"),
  minAlignedRows: numericFlag("min-aligned"),
  minUnheadedRows: numericFlag("min-unheaded"),
};
for (const [key, value] of Object.entries(detectorOptions)) if (value === undefined) delete detectorOptions[key];
const knownNumeric = ["--max-glyph=", "--max-gap=", "--min-aligned=", "--min-unheaded="];
const unknownFlags = flags.filter((flag) => flag !== "--summary" && flag !== "--captions" && flag !== "--brief" && !flag.startsWith("--spans=") && !knownNumeric.some((prefix) => flag.startsWith(prefix)));
if (!pdfArg || !pageSpec || unknownFlags.length) {
  console.error("usage: legend-learn-probe.mjs PDF PAGE[,PAGE|RANGE...]|all [--summary] [--captions] [--brief] [--spans=x0,y0,x1,y1] [--max-glyph=N] [--max-gap=N] [--min-aligned=N] [--min-unheaded=N]");
  process.exit(2);
}
const spanRegion = spansFlag?.slice("--spans=".length).split(",").map(Number);
if (spanRegion && (spanRegion.length !== 4 || spanRegion.some((value) => !Number.isFinite(value)))) {
  console.error("--spans needs four finite image-px values: x0,y0,x1,y1");
  process.exit(2);
}

const source = path.resolve(pdfArg);
const bytes = fs.readFileSync(source);
const sourceSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
const session = new Session();
const loaded = await session.loadPlan(source);

function selectedPages(spec, count) {
  if (spec.toLowerCase() === "all") return Array.from({ length: count }, (_, i) => i + 1);
  const out = new Set();
  for (const part of spec.split(",")) {
    const range = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!range) throw new Error(`invalid page selector: ${part}`);
    const first = Number(range[1]);
    const last = Number(range[2] ?? range[1]);
    if (first < 1 || last < first || last > count) throw new Error(`page selector outside 1-${count}: ${part}`);
    for (let page = first; page <= last; page++) out.add(page);
  }
  return [...out].sort((a, b) => a - b);
}

const pages = selectedPages(pageSpec, loaded.sheets.length);
const results = [];
for (const page of pages) {
  const sheet = loaded.sheets[page - 1];
  const started = Date.now();
  try {
    let result = await session.findLegendGlyphs(sheet.sheet);
    const state = session.sheet(sheet.sheet);
    const geometry = await session.ensureGeometry(state);
    if (Object.keys(detectorOptions).length) {
      const geo = await session.ensureGeometry(state);
      const glyphs = detectLegendGlyphs(
        geo.segs,
        (state.spans || []).map((span) => ({ text: span.str, x0: span.x0, y0: span.y0, x1: span.x1, y1: span.y1 })),
        detectorOptions,
      );
      const support = legendLearnStatus(geo.segs, (state.spans || []).map((span) => ({ text: span.str, x0: span.x0, y0: span.y0, x1: span.x1, y1: span.y1 })), glyphs);
      result = { sheet: state.key, status: support.status, ...(support.note ? { note: support.note } : {}), glyphs: glyphs.map((glyph) => ({
        caption: glyph.caption,
        caption_bbox: [...glyph.caption_bbox[0], ...glyph.caption_bbox[1]],
        rect: [...glyph.rect[0], ...glyph.rect[1]],
        segments: glyph.segments,
        aligned_rows: glyph.aligned_rows,
        heading: glyph.heading,
        kind: glyph.kind,
        seedable: glyph.seedable,
        ...(glyph.seed_warning ? { seed_warning: glyph.seed_warning } : {}),
        ...(glyph.member_rects ? { member_rects: glyph.member_rects.map((rect) => [...rect[0], ...rect[1]]) } : {}),
      })) };
    }
    const diagnosticSpans = spanRegion ? (state.spans || [])
      .filter((span) => span.x1 >= spanRegion[0] && span.x0 <= spanRegion[2] && span.y1 >= spanRegion[1] && span.y0 <= spanRegion[3])
      .map((span) => ({ text: span.str, rect: [span.x0, span.y0, span.x1, span.y1] })) : undefined;
    results.push({
      page,
      sheet: sheet.sheet,
      sheet_number: sheet.sheet_number ?? null,
      page_size_px: [sheet.width_px, sheet.height_px],
      vector_segments: geometry.segs.length / 4,
      text_spans: state.spans?.length ?? 0,
      text_chars: (state.spans || []).reduce((sum, span) => sum + span.str.length, 0),
      glyphs: result.glyphs,
      status: result.status ?? null,
      note: result.note ?? null,
      ...(diagnosticSpans ? { diagnostic_spans: diagnosticSpans } : {}),
      elapsed_ms: Date.now() - started,
    });
  } catch (error) {
    results.push({
      page,
      sheet: sheet.sheet,
      sheet_number: sheet.sheet_number ?? null,
      page_size_px: [sheet.width_px, sheet.height_px],
      glyphs: [],
      error: error instanceof Error ? error.message : String(error),
      elapsed_ms: Date.now() - started,
    });
  }
}

const reportedResults = summary || brief ? results.map((result) => ({
  page: result.page,
  sheet: result.sheet,
  sheet_number: result.sheet_number,
  page_size_px: result.page_size_px,
  vector_segments: result.vector_segments,
  text_spans: result.text_spans,
  text_chars: result.text_chars,
  glyph_count: result.glyphs.length,
  status: result.status,
  ...(captionsOnly ? { captions: result.glyphs.map((glyph) => glyph.caption) } : {}),
  sample_glyphs: result.glyphs.slice(0, 20).map((glyph) => ({
    caption: glyph.caption,
    rect: glyph.rect,
    caption_bbox: glyph.caption_bbox,
    segments: glyph.segments,
    aligned_rows: glyph.aligned_rows,
    heading: glyph.heading,
    kind: glyph.kind,
    seedable: glyph.seedable,
    ...(glyph.member_rects ? { member_rects: glyph.member_rects } : {}),
  })),
  note: result.note ?? null,
  error: result.error ?? null,
  ...(result.diagnostic_spans ? { diagnostic_spans: result.diagnostic_spans } : {}),
  elapsed_ms: result.elapsed_ms,
})) : results;

if (brief) {
  const lines = [];
  for (const result of reportedResults) {
    const samples = result.sample_glyphs.slice(0, 3).map((glyph) => glyph.caption).join(" | ");
    lines.push([path.basename(source), result.page, result.sheet_number ?? "", result.status ?? "error", result.glyph_count, result.elapsed_ms, samples].join("\t"));
  }
  process.stdout.write(`${lines.join("\n")}\n`);
  process.exit(0);
}

process.stdout.write(`${JSON.stringify({
  schema: "opentakeoff.legend_learn_probe.v1",
  source,
  source_sha256: sourceSha256,
  page_count: loaded.sheets.length,
  selected_pages: pages,
  results: reportedResults,
}, null, 2)}\n`);
