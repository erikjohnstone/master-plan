#!/usr/bin/env node
// Read-only Legend Learn corpus evaluator. Ground truth is independently
// reviewed data; this script never creates, updates, or blesses it.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { Session } from "../src/session.ts";

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const corpusRoot = path.resolve(argValue("corpus", "../../HVAC BAS Benchmark Collection"));
const truthPath = path.resolve(argValue("truth", path.join(corpusRoot, "ground_truth/legend_learn/manifest.json")));
const repeatRuns = Math.max(1, Number(argValue("repeat", "2")) || 2);
const onlyCase = argValue("case", "");
const manifest = JSON.parse(fs.readFileSync(truthPath, "utf8"));
const documents = new Map(manifest.documents.map((document) => [document.id, document]));

const normalize = (text) => String(text ?? "").trim().replace(/\s+/g, " ");
const keyOf = (row) => `${normalize(row.caption)}\u0000${row.kind}`;
const bboxDistance = (expected, actual) => expected.reduce((sum, value, index) => sum + Math.abs(value - actual[index]), 0);
const bboxWithin = (expected, actual, tolerance) => expected.every((value, index) => Math.abs(value - actual[index]) <= tolerance);

function compareRows(expectedRows, actualRows, tolerance) {
  const remaining = actualRows.map((row, index) => ({ row, index }));
  const matched = [];
  const missing = [];
  const geometryMismatches = [];
  for (const expected of expectedRows) {
    const candidates = remaining.filter(({ row }) => keyOf(row) === keyOf(expected));
    if (!candidates.length) {
      missing.push(expected);
      continue;
    }
    candidates.sort((a, b) => {
      if (!expected.rect || !a.row.rect) return a.index - b.index;
      return bboxDistance(expected.rect, a.row.rect) - bboxDistance(expected.rect, b.row.rect) || a.index - b.index;
    });
    const winner = candidates[0];
    remaining.splice(remaining.findIndex((entry) => entry.index === winner.index), 1);
    matched.push({ expected, actual: winner.row });
    for (const field of ["rect", "caption_bbox"]) {
      if (expected[field] && !bboxWithin(expected[field], winner.row[field], tolerance)) {
        geometryMismatches.push({ caption: expected.caption, kind: expected.kind, field, expected: expected[field], actual: winner.row[field] });
      }
    }
    if (typeof expected.seedable === "boolean" && expected.seedable !== winner.row.seedable) {
      geometryMismatches.push({ caption: expected.caption, kind: expected.kind, field: "seedable", expected: expected.seedable, actual: winner.row.seedable });
    }
    if (Object.hasOwn(expected, "heading") && expected.heading !== winner.row.heading) {
      geometryMismatches.push({ caption: expected.caption, kind: expected.kind, field: "heading", expected: expected.heading, actual: winner.row.heading });
    }
    if (expected.member_rects) {
      const actualMembers = winner.row.member_rects ?? [];
      if (expected.member_rects.length !== actualMembers.length) {
        geometryMismatches.push({ caption: expected.caption, kind: expected.kind, field: "member_rects.length", expected: expected.member_rects.length, actual: actualMembers.length });
      } else {
        // Members are a geometric set, not an ordered semantic tuple. JTS
        // component enumeration may traverse the same disconnected strokes
        // from either side while the glyph union and every member box remain
        // identical. Match each expected box to one unused actual box so the
        // gate remains exact without treating array permutation as geometry
        // corruption.
        const remainingMembers = actualMembers.map((rect, index) => ({ rect, index }));
        for (let member = 0; member < expected.member_rects.length; member++) {
          const expectedMember = expected.member_rects[member];
          const exact = remainingMembers.find((entry) => bboxWithin(expectedMember, entry.rect, tolerance));
          if (exact) {
            remainingMembers.splice(remainingMembers.indexOf(exact), 1);
            continue;
          }
          remainingMembers.sort((a, b) => bboxDistance(expectedMember, a.rect) - bboxDistance(expectedMember, b.rect) || a.index - b.index);
          const closest = remainingMembers.shift();
          geometryMismatches.push({ caption: expected.caption, kind: expected.kind, field: `member_rects[${member}]`, expected: expectedMember, actual: closest?.rect ?? null });
        }
      }
    }
  }
  return { matched, missing, unexpected: remaining.map(({ row }) => row), geometryMismatches };
}

const selectedCases = manifest.cases.filter((entry) => (!onlyCase || entry.id === onlyCase));
if (onlyCase && !selectedCases.length) throw new Error(`Unknown case: ${onlyCase}`);

const documentCache = new Map();
const results = [];
let tp = 0, fp = 0, fn = 0, scoredCases = 0, geometryRows = 0;
let completedPositiveCases = 0, completedEmptyCases = 0, completedUnsupportedCases = 0;
for (const truth of selectedCases) {
  if (truth.review_status !== "complete") {
    results.push({ id: truth.id, review_status: truth.review_status, scored: false });
    continue;
  }
  const document = documents.get(truth.document_id);
  if (!document) throw new Error(`Case ${truth.id} refers to unknown document ${truth.document_id}`);
  const source = path.resolve(corpusRoot, document.source_pdf);
  const sourceBytes = fs.readFileSync(source);
  const sourceSha256 = crypto.createHash("sha256").update(sourceBytes).digest("hex");
  if (sourceSha256 !== document.source_sha256) {
    results.push({ id: truth.id, scored: true, pass: false, error: "source_sha256_mismatch", expected: document.source_sha256, actual: sourceSha256 });
    continue;
  }

  let cached = documentCache.get(document.id);
  if (!cached) {
    const session = new Session();
    const loaded = await session.loadPlan(source);
    cached = { session, loaded };
    documentCache.set(document.id, cached);
  }
  const sheet = cached.loaded.sheets[truth.page - 1];
  if (!sheet) throw new Error(`Case ${truth.id} page ${truth.page} is outside the loaded document`);
  const runs = [];
  for (let run = 0; run < repeatRuns; run++) runs.push(await cached.session.findLegendGlyphs(sheet.sheet));
  const stable = runs.slice(1).every((run) => JSON.stringify(run) === JSON.stringify(runs[0]));
  const actual = runs[0];
  const expectedRows = truth.expected_rows ?? [];
  if (expectedRows.length) completedPositiveCases++;
  else if (String(truth.expected_status).startsWith("unsupported_")) completedUnsupportedCases++;
  else completedEmptyCases++;
  const comparison = compareRows(expectedRows, actual.glyphs, truth.bbox_tolerance_px ?? manifest.bbox_tolerance_px ?? 1);
  tp += comparison.matched.length;
  fp += comparison.unexpected.length;
  fn += comparison.missing.length;
  scoredCases++;
  geometryRows += expectedRows.filter((row) => row.rect && row.caption_bbox).length;
  const statusMatch = actual.status === truth.expected_status;
  const sheetNumberMatch = !truth.sheet_number || sheet.sheet_number === truth.sheet_number;
  const pass = statusMatch && sheetNumberMatch && stable
    && comparison.missing.length === 0 && comparison.unexpected.length === 0
    && comparison.geometryMismatches.length === 0;
  results.push({
    id: truth.id,
    review_status: truth.review_status,
    scored: true,
    pass,
    page: truth.page,
    sheet_number: sheet.sheet_number ?? null,
    status: { expected: truth.expected_status, actual: actual.status, match: statusMatch },
    stable,
    expected_rows: expectedRows.length,
    actual_rows: actual.glyphs.length,
    matched_rows: comparison.matched.length,
    missing: comparison.missing.map((row) => ({ caption: row.caption, kind: row.kind })),
    unexpected: comparison.unexpected.map((row) => ({ caption: row.caption, kind: row.kind, rect: row.rect })),
    geometry_mismatches: comparison.geometryMismatches,
    sheet_number_match: sheetNumberMatch,
  });
}

// An empty-only reviewed slice can prove false-positive rejection, status
// semantics, and determinism, but it cannot honestly claim positive-row
// precision or recall. Keep those metrics null until at least one predicted
// or expected positive row exists.
const precision = tp + fp ? tp / (tp + fp) : null;
const recall = tp + fn ? tp / (tp + fn) : null;
const failed = results.filter((result) => result.scored && !result.pass);
const report = {
  schema: "opentakeoff.legend_learn_corpus_eval.v1",
  truth: truthPath,
  corpus: corpusRoot,
  repeat_runs: repeatRuns,
  documents_declared: manifest.documents.length,
  cases_declared: manifest.cases.length,
  cases_scored: scoredCases,
  cases_pending: results.filter((result) => !result.scored).length,
  reviewed_case_mix: {
    positive: completedPositiveCases,
    empty: completedEmptyCases,
    unsupported: completedUnsupportedCases,
  },
  rows: { true_positive: tp, false_positive: fp, false_negative: fn, geometry_reviewed: geometryRows },
  precision,
  recall,
  passed: failed.length === 0,
  results,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failed.length) process.exitCode = 1;
