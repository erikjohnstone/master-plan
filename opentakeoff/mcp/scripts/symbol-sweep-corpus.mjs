#!/usr/bin/env node
// Frozen, symbol-only corpus evaluation. Expected answers are authored in
// ground_truth/symbol_sweep/cases.json and are never inferred or rewritten.
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Session } from "../src/session.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const masterRoot = path.resolve(here, "../../..");
const corpusRoot = path.join(masterRoot, "HVAC BAS Benchmark Collection");
const manifestPath = path.join(corpusRoot, "ground_truth/symbol_sweep/cases.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.schema !== "opentakeoff.symbol_sweep_ground_truth.v1") {
  throw new Error(`Unsupported symbol ground-truth schema: ${manifest.schema}`);
}

const selected = new Set(process.argv.slice(2));
const cases = selected.size ? manifest.cases.filter((c) => selected.has(c.id)) : manifest.cases;
for (const id of selected) {
  if (!cases.some((c) => c.id === id)) throw new Error(`Unknown symbol-sweep case: ${id}`);
}

const sha256 = (file) => new Promise((resolve, reject) => {
  const hash = createHash("sha256");
  createReadStream(file).on("data", (chunk) => hash.update(chunk)).on("error", reject).on("end", () => resolve(hash.digest("hex")));
});
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const bboxNear = (a, b, tol = 0.15) => Array.isArray(a) && a.length === 4 && a.every((v, i) => Math.abs(v - b[i]) <= tol);

/** Exact bipartite feasibility: every expected instance must own one distinct
 * prediction inside its own reviewed physical-symbol radius. */
function assignInstances(expected, predicted) {
  const choices = expected.map((e) => predicted
    .map((p, i) => ({ i, d: dist(e.at, p.at) }))
    .filter((x) => x.d <= e.tolerance_px && (e.page === undefined || predicted[x.i].page === e.page))
    .sort((a, b) => a.d - b.d || a.i - b.i));
  const owner = new Array(predicted.length).fill(-1);
  const visit = (ei, seen) => {
    for (const { i } of choices[ei]) {
      if (seen.has(i)) continue;
      seen.add(i);
      if (owner[i] < 0 || visit(owner[i], seen)) { owner[i] = ei; return true; }
    }
    return false;
  };
  for (let ei = 0; ei < expected.length; ei++) {
    if (!visit(ei, new Set())) return { ok: false, owner, choices, missing: expected[ei] };
  }
  const expectedToPrediction = new Array(expected.length).fill(-1);
  owner.forEach((ei, pi) => { if (ei >= 0) expectedToPrediction[ei] = pi; });
  return { ok: expectedToPrediction.every((i) => i >= 0), owner, choices, expectedToPrediction };
}

const rows = [];
let failed = 0;
for (const c of cases) {
  const errors = [];
  const source = path.join(corpusRoot, c.source_pdf);
  const actualHash = await sha256(source);
  if (actualHash !== c.source_sha256) errors.push(`source SHA-256 ${actualHash} != frozen ${c.source_sha256}`);

  const session = new Session();
  const loaded = await session.loadPlan(source);
  const sheet = loaded.sheets[c.page - 1];
  if (!sheet) errors.push(`page ${c.page} is absent (PDF has ${loaded.sheets.length})`);
  const expectedEngineSheetNumber = Object.hasOwn(c, "engine_sheet_number") ? c.engine_sheet_number : c.sheet_number;
  if (sheet && (sheet.sheet_number ?? null) !== (expectedEngineSheetNumber ?? null)) errors.push(`sheet number ${sheet.sheet_number ?? "<none>"} != ${expectedEngineSheetNumber ?? "<none>"}`);
  if (sheet && (sheet.width_px !== c.page_size_px[0] || sheet.height_px !== c.page_size_px[1])) {
    errors.push(`page size ${sheet.width_px}x${sheet.height_px} != ${c.page_size_px.join("x")}`);
  }

  let result = null;
  let elapsedMs = 0;
  const scope = c.scope ?? "sheet";
  if (sheet) {
    const started = performance.now();
    result = await session.symbolSweep(sheet.sheet, {
      seedRect: c.seed_rect,
      scope,
      ...(c.options?.tolerance_px ? { tolerancePx: c.options.tolerance_px } : {}),
      ...(c.options?.variant_guard ? { variantGuard: true } : {}),
      ...(c.options?.rotations === false ? { rotations: false } : {}),
      ...(c.options?.mirror === false ? { mirror: false } : {}),
    });
    elapsedMs = Math.round(performance.now() - started);
  }
  if (result) {
    const dropped = scope === "set"
      ? result.sheets.reduce((n, row) => n + (row.candidates?.dropped ?? 0), 0)
      : (result.candidates?.dropped ?? 0);
    if (!result.complete || dropped) errors.push(`incomplete candidate search (${dropped} dropped)`);
    if (scope === "set") {
      const skippedPlans = result.skipped.filter((row) => row.role === "plan");
      if (skippedPlans.length) errors.push(`set coverage skipped plan sheet(s): ${skippedPlans.map((row) => row.sheet).join(", ")}`);
    }
    if (result.found !== c.instances.length) errors.push(`count ${result.found} != ${c.instances.length}`);
    if ((result.seed?.label ?? null) !== (c.seed.tag ?? null)) errors.push(`seed tag ${result.seed?.label ?? "<none>"} != ${c.seed.tag ?? "<none>"}`);
    if (dist(result.seed.center, c.seed.at) > c.seed.tolerance_px) {
      errors.push(`seed at ${result.seed.center.join(",")} misses frozen center ${c.seed.at.join(",")}`);
    }

    // Normalize sheet and set results into one page-qualified prediction list.
    // Set cases prove that the same seed is located correctly across pages;
    // a coordinate collision on another sheet is never allowed to satisfy an
    // expected instance.
    const predictions = [];
    const labels = [];
    const seedLabel = result.seed.label ? { label: result.seed.label, token_bbox: result.seed.label_bbox } : null;
    if (scope === "sheet") {
      result.matches.forEach((match) => {
        predictions.push({ ...match, page: c.page });
        labels.push(match.label ? { label: match.label, token_bbox: match.label_bbox } : null);
      });
    } else {
      for (const pageResult of result.sheets) {
        const pageIndex = loaded.sheets.findIndex((candidate) => candidate.sheet === pageResult.sheet);
        if (pageIndex < 0) {
          errors.push(`set result names unknown sheet ${pageResult.sheet}`);
          continue;
        }
        pageResult.matches.forEach((match) => {
          predictions.push({ ...match, page: pageIndex + 1 });
          labels.push(match.label ? { label: match.label, token_bbox: match.label_bbox } : null);
        });
      }
    }

    const assignment = assignInstances(c.instances, predictions);
    if (!assignment.ok) errors.push(`no one-to-one localization for ${assignment.missing?.id ?? "one or more instances"}`);
    // Re-resolve only the final physical placements to retain the exact token
    // boxes. This is the same shared pure label code used by MCP and canvas;
    // the frozen expected boxes prove that each repeated same-family tag is
    // attached to its own symbol rather than merely matching the family text.
    if (c.seed.tag_bbox && !bboxNear(seedLabel?.token_bbox, c.seed.tag_bbox)) errors.push("seed attached to the wrong text-run box");
    if (assignment.ok) {
      for (let ei = 0; ei < c.instances.length; ei++) {
        const pi = assignment.expectedToPrediction[ei];
        const label = labels[pi];
        const expected = c.instances[ei];
        if ((label?.label ?? null) !== (expected.tag ?? null)) errors.push(`${expected.id} label ${label?.label ?? "<none>"} != ${expected.tag ?? "<none>"}`);
        if (expected.tag_bbox && !bboxNear(label?.token_bbox, expected.tag_bbox)) errors.push(`${expected.id} attached to the wrong ${expected.tag} text-run box`);
      }
    }
  }

  const ok = errors.length === 0;
  if (!ok) failed++;
  rows.push({ id: c.id, ok, expected: c.instances.length, found: result?.found ?? 0, elapsed_ms: elapsedMs, errors });
  console.log(`${ok ? "PASS" : "FAIL"} ${c.id}: ${result?.found ?? 0}/${c.instances.length} in ${elapsedMs} ms`);
  for (const error of errors) console.log(`  - ${error}`);
}

console.log(JSON.stringify({ schema: manifest.schema, cases: rows.length, passed: rows.length - failed, failed, results: rows }, null, 2));
if (failed) process.exitCode = 1;
