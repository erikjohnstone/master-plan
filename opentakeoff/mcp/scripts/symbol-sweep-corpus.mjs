#!/usr/bin/env node
// Frozen, symbol-only corpus evaluation. Expected answers are authored in
// ground_truth/symbol_sweep/cases.json and are never inferred or rewritten.
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Session } from "../src/session.ts";
import { affineOptionsFromWire, AFFINE_WIRE_DEFAULT } from "../../web/src/lib/symbolsweep.ts";

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

/** Phase 0 of docs/SYMBOL-SWEEP-AFFINE-GOAL.md: an "affine" campaign case's
 * `instances` are ONLY the specific real off-grid/stretched/variant
 * placements of an already-corroborated seed — never the sheet's whole
 * symbol population (baseline/extended cases already cover that). A strict
 * one-to-one bipartite match against EVERY prediction on the sheet is the
 * wrong tool here (most predictions are legitimate, unrelated rigid finds
 * this case was never meant to enumerate) — this instead asks, per expected
 * instance, "did anything land near it": a `matches` hit is full recall, a
 * `withheld` hit means the engine saw it but declined (today's honest
 * behaviour on a stretched/rotated symbol, per hasCorruptedHeaders-style
 * disclosure elsewhere in this codebase), and neither is the "silence" gap
 * the affine goal document exists to close. Never fails the run — recall
 * below 100% is the EXPECTED, correct measurement before the affine
 * matching in symbolsweep.ts exists; only identity errors (checked by the
 * caller before this runs) can fail an affine case. */
function affineRecall(expected, matches, withheld) {
  const near = (e, p) => dist(e.at, p.at) <= e.tolerance_px && (e.page === undefined || p.page === e.page);
  const rows = expected.map((e) => {
    const m = matches.find((p) => near(e, p));
    if (m) return { id: e.id, status: "matched", at: m.at, score: m.score, transform: e.transform, variant: e.variant };
    const w = withheld.find((p) => near(e, p));
    if (w) return { id: e.id, status: "withheld", at: w.at, score: w.score, reason: w.reason, transform: e.transform, variant: e.variant };
    return { id: e.id, status: "missing", transform: e.transform, variant: e.variant };
  });
  const matched = rows.filter((r) => r.status === "matched").length;
  const withheldN = rows.filter((r) => r.status === "withheld").length;
  const missing = rows.filter((r) => r.status === "missing").length;
  return { rows, matched, withheld: withheldN, missing, total: expected.length };
}

const rows = [];
const affineRows = [];
let failed = 0;
for (const c of cases) {
  const isAffine = c.campaign === "affine";
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
      // docs/SYMBOL-SWEEP-AFFINE-GOAL.md §3 Phase 5 step 6 — the wire-level
      // default flip was ATTEMPTED and REVERTED (see the goal doc's
      // Findings): the two-run gate that supposedly cleared it never
      // actually exercised this path, because this runner used to call
      // session.symbolSweep with no `affine` at all, silently re-testing
      // the unchanged rigid baseline every time. Fixing that (this change)
      // is what surfaced the real regression that got the flip reverted.
      // This now applies AFFINE_WIRE_DEFAULT unconditionally, independent
      // of whatever the wire-level default currently is, so the corpus
      // suite is a real, standing gate any FUTURE default-flip attempt must
      // clear — it will show red for as long as the underlying bugs
      // (dropGlyphClusters clipping real seed geometry; label-corroboration
      // promoting affine-widened low-quality fits) remain unfixed, which is
      // the correct, honest state for it to be in until they are. A case
      // can opt out with `options.affine: false` (mirrors rotations/mirror
      // above) if a future ground-truth case specifically needs the
      // rigid-only path.
      ...(c.options?.affine === false ? {} : { affine: affineOptionsFromWire(AFFINE_WIRE_DEFAULT) }),
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
    // The affine campaign's own instances are a NAMED SUBSET of a real
    // symbol population, not the whole count — see affineRecall's own doc
    // above for why an exact-count check is the wrong tool here.
    if (!isAffine && result.found !== c.instances.length) errors.push(`count ${result.found} != ${c.instances.length}`);
    if ((result.seed?.label ?? null) !== (c.seed.tag ?? null)) errors.push(`seed tag ${result.seed?.label ?? "<none>"} != ${c.seed.tag ?? "<none>"}`);
    if (dist(result.seed.center, c.seed.at) > c.seed.tolerance_px) {
      errors.push(`seed at ${result.seed.center.join(",")} misses frozen center ${c.seed.at.join(",")}`);
    }

    // Normalize sheet and set results into one page-qualified prediction list.
    // Set cases prove that the same seed is located correctly across pages;
    // a coordinate collision on another sheet is never allowed to satisfy an
    // expected instance.
    const predictions = [];
    const withheldPredictions = [];
    const labels = [];
    const seedLabel = result.seed.label ? { label: result.seed.label, token_bbox: result.seed.label_bbox } : null;
    if (scope === "sheet") {
      result.matches.forEach((match) => {
        predictions.push({ ...match, page: c.page });
        labels.push(match.label ? { label: match.label, token_bbox: match.label_bbox } : null);
      });
      (result.withheld ?? []).forEach((w) => withheldPredictions.push({ ...w, page: c.page }));
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
        (pageResult.withheld ?? []).forEach((w) => withheldPredictions.push({ ...w, page: pageIndex + 1 }));
      }
    }

    if (isAffine) {
      const recall = affineRecall(c.instances, predictions, withheldPredictions);
      affineRows.push({ id: c.id, document_id: c.document_id, ...recall });
    } else {
      const assignment = assignInstances(c.instances, predictions);
      if (!assignment.ok) errors.push(`no one-to-one localization for ${assignment.missing?.id ?? "one or more instances"}`);
      // Re-resolve only the final physical placements to retain the exact
      // token boxes. This is the same shared pure label code used by MCP and
      // canvas; the frozen expected boxes prove that each repeated
      // same-family tag is attached to its own symbol rather than merely
      // matching the family text.
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
    // Seed identity (which text-run the seed itself attaches to) is checked
    // for every case, affine included — it is about seed quality, not about
    // the affine recall gap this campaign measures.
    if (c.seed.tag_bbox && !bboxNear(seedLabel?.token_bbox, c.seed.tag_bbox)) errors.push("seed attached to the wrong text-run box");
  }

  const ok = errors.length === 0;
  if (!ok) failed++;
  rows.push({ id: c.id, ok, campaign: c.campaign ?? "baseline", expected: c.instances.length, found: result?.found ?? 0, elapsed_ms: elapsedMs, errors });
  if (isAffine) {
    const r = affineRows[affineRows.length - 1];
    console.log(`${ok ? "PASS" : "FAIL"} [affine] ${c.id}: ${r.matched} matched, ${r.withheld} withheld, ${r.missing} missing / ${r.total} in ${elapsedMs} ms`);
  } else {
    console.log(`${ok ? "PASS" : "FAIL"} ${c.id}: ${result?.found ?? 0}/${c.instances.length} in ${elapsedMs} ms`);
  }
  for (const error of errors) console.log(`  - ${error}`);
}

if (affineRows.length) {
  const totals = affineRows.reduce((t, r) => ({
    total: t.total + r.total, matched: t.matched + r.matched, withheld: t.withheld + r.withheld, missing: t.missing + r.missing,
  }), { total: 0, matched: 0, withheld: 0, missing: 0 });
  const pct = (n) => totals.total ? Math.round((n / totals.total) * 1000) / 10 : 0;
  console.log(`\n=== AFFINE CAMPAIGN (Phase 0 of docs/SYMBOL-SWEEP-AFFINE-GOAL.md, §9 numbers) ===`);
  console.log(`cases: ${affineRows.length}, documents: ${new Set(affineRows.map((r) => r.document_id)).size}, instances: ${totals.total}`);
  console.log(`matched (committed): ${totals.matched} (${pct(totals.matched)}%)`);
  console.log(`withheld (found, declined): ${totals.withheld} (${pct(totals.withheld)}%)`);
  console.log(`missing (silent — the gap this goal closes): ${totals.missing} (${pct(totals.missing)}%)`);
  for (const r of affineRows) {
    for (const row of r.rows) {
      if (row.status !== "missing") continue;
      const t = row.transform ? ` [${Object.entries(row.transform).filter(([k]) => k !== "note").map(([k, v]) => `${k}=${v}`).join(" ")}]` : "";
      console.log(`  MISSING ${r.id}/${row.id}${t}`);
    }
  }
}

console.log(JSON.stringify({ schema: manifest.schema, cases: rows.length, passed: rows.length - failed, failed, results: rows, ...(affineRows.length ? { affine: affineRows } : {}) }, null, 2));
if (failed) process.exitCode = 1;
