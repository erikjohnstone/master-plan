#!/usr/bin/env node
// Text-only, geometry-free tag-occurrence baseline producer.
//
// plans/03-schedule-row-to-drawn-tag-reconciliation-plan.md, Phase 0.3: the
// ruler needs "pipeline occurrences" to compare against hand-authored keys,
// but this plan explicitly excludes symbolsweep.ts matching and
// taggedVectorGrounding.ts from the ledger's path. This script does not call
// either. It walks the sheet graph's own schedule rows and, for each row's
// identity mark, reads where that TEXT is drawn on every plan-role sheet via
// Session.tagOccurrencesForKey — a thin, additive, public wrapper (added
// alongside this script) around the SAME private ladder every geometric
// caller (sweepScheduleRow, countMarks) already uses to answer "where is
// this text drawn" (mcp/src/session.ts, tagOccurrencesOnSheet). No
// duplicated logic, no geometry: that method never reads vector segments.
//
// This is a BASELINE, not the Phase 1 shared occurrence finder — it mirrors
// the row lookup Session.sweepScheduleRow does only in its simplest form
// (split a row's identity mark on "/" and ",", canonicalize, dedupe by
// row+table scope). It intentionally does NOT replicate sweepScheduleRow's
// accessory-row narrowing, same-sheet shadow-extract collapse, or trailing-
// digit alias retry — those are row-LOOKUP refinements Phase 2 extracts and
// shares; this script's job is only to measure today's text-occurrence
// recall/precision against real ground truth, not to reproduce every row-
// resolution edge case.
//
// Usage:
//   node --import tsx scripts/tag-occurrence-baseline.mjs <corpus-dir> <setId> [--out path.json]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";
import { resolveSetFiles, validateSets } from "./corpusFiles.mjs";
import { rowIdentityTag } from "../../web/src/lib/schedulePlanReconcile.mjs";

const canon = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");

/**
 * @param {string[]} pdfPaths absolute paths, first is primary, rest merged
 * @returns {Promise<{available:boolean, rows:Array, skipped_sheets:Array, plan_sheet_count:number}>}
 */
export async function buildTagOccurrenceBaseline(pdfPaths) {
  const session = new Session();
  await session.loadPlan(pdfPaths[0]);
  for (let i = 1; i < pdfPaths.length; i++) {
    await session.loadPlan(pdfPaths[i], { merge: true });
  }
  const graph = await session.graphForPipeline();
  if (!graph.available) {
    return { available: false, rows: [], skipped_sheets: [], plan_sheet_count: 0 };
  }
  const planSheetKeys = graph.sheets.filter((s) => s.role === "plan").map((s) => s.key);
  const skippedSheets = graph.sheets
    .filter((s) => s.role !== "plan")
    .map((s) => ({ sheet: s.key, role: s.role, confidence: s.confidence ?? null }));

  const rowsOut = [];
  const seenScope = new Set();
  for (const table of graph.tables) {
    const tableTitle = table.title?.text || `${table.kind} schedule`;
    for (const row of table.rows) {
      const rawTag = rowIdentityTag(row) || row.key;
      if (!rawTag) continue;
      const parts = String(rawTag).split(/[/,]/).map((p) => p.trim()).filter(Boolean);
      const marks = [...new Set((parts.length ? parts : [rawTag]).map(canon).filter(Boolean))];
      for (const mark of marks) {
        const scopeKey = `${mark}\0${table.sheet}\0${tableTitle}`;
        if (seenScope.has(scopeKey)) continue;
        seenScope.add(scopeKey);
        const instances = [];
        for (const sheetKey of planSheetKeys) {
          let occ;
          try {
            occ = session.tagOccurrencesForKey(sheetKey, mark);
          } catch (e) {
            occ = [];
          }
          for (const o of occ) {
            instances.push({
              sheet: sheetKey,
              bbox: o.bbox.map((n) => Math.round(n * 10) / 10),
              h: Math.round(o.h * 10) / 10,
            });
          }
        }
        rowsOut.push({
          row_key: mark,
          row_table: tableTitle,
          row_sheet: table.sheet,
          drawn_count: instances.length,
          instances,
        });
      }
    }
  }
  return { available: true, rows: rowsOut, skipped_sheets: skippedSheets, plan_sheet_count: planSheetKeys.length };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const [corpusDir, setId] = argv.filter((a) => !a.startsWith("--"));
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  if (!corpusDir || !setId) {
    console.error("usage: node --import tsx scripts/tag-occurrence-baseline.mjs <corpus-dir> <setId> [--out path.json]");
    process.exit(2);
  }
  const corpus = resolve(corpusDir);
  const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));
  validateSets(spec);
  const set = spec.sets.find((s) => s.id === setId);
  if (!set) {
    console.error(`no such set "${setId}" in ${join(corpus, "sets.json")}`);
    process.exit(2);
  }
  const files = resolveSetFiles(corpus, spec, set);
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length) {
    console.error(`missing PDF(s) for "${setId}": ${missing.join(", ")}`);
    process.exit(1);
  }
  console.error(`[tag-occurrence-baseline] loading ${files.length} PDF(s) for "${setId}"…`);
  const started = performance.now();
  const result = await buildTagOccurrenceBaseline(files);
  const elapsed = Math.round(performance.now() - started);
  console.error(`[tag-occurrence-baseline] done in ${elapsed}ms — ${result.rows.length} row-scopes, ${result.rows.reduce((n, r) => n + r.drawn_count, 0)} occurrences, ${result.plan_sheet_count} plan sheets, ${result.skipped_sheets.length} skipped`);
  const payload = { set_id: setId, elapsed_ms: elapsed, ...result };
  if (outPath) {
    writeFileSync(outPath, JSON.stringify(payload, null, 2));
    console.error(`[tag-occurrence-baseline] wrote ${outPath}`);
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
  process.exit(0);
}
