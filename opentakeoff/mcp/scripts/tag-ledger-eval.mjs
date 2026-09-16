#!/usr/bin/env node
// Tag ledger ruler — scores the text-only occurrence baseline against a
// hand-authored occurrence key, in BOTH directions (tag -> row, row -> tag).
//
// plans/03-schedule-row-to-drawn-tag-reconciliation-plan.md Phase 0.3/0.4.
// Deliberately dumb and stable: no geometry, no fuzzy scoring beyond simple
// bbox proximity, never tuned to make a number look better. A key file's
// scope decides what counts; this script only compares.
//
// Key schema (keys/<set>.tagocc.csv):
//   sheet,page,text_as_drawn,x0,y0,x1,y1,rot,class,row_table,row_key,note
// class ∈ ROW_LABEL | PLAN_INSTANCE | NOTE_MENTION | LEGEND_ENTRY |
//         DETAIL_CALLOUT | TITLE_BLOCK | OTHER
// row_table/row_key are filled for ROW_LABEL and PLAN_INSTANCE rows;
// row_key is UNSCHEDULED for a PLAN_INSTANCE the schedule never lists.
//
// Usage:
//   node --import tsx scripts/tag-ledger-eval.mjs <corpus-dir> <setId> [--baseline path.json]
//
// Without --baseline, the baseline is computed live via
// tag-occurrence-baseline.mjs's buildTagOccurrenceBaseline (same corpus/set
// resolution). Pass --baseline to reuse an already-dumped JSON (faster
// iteration, and lets a --producer swap happen later without touching this
// script, per the Phase 0.3 plan text).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveSetFiles, validateSets } from "./corpusFiles.mjs";
import { buildTagOccurrenceBaseline } from "./tag-occurrence-baseline.mjs";

function splitCsv(line) {
  const cells = [];
  let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') { q = !q; continue; }
    if (ch === "," && !q) { cells.push(cur); cur = ""; continue; }
    cur += ch;
  }
  cells.push(cur);
  return cells;
}

function readTagOccKey(path) {
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim() && !/^\s*#/.test(l));
  if (lines.length < 2) return [];
  const head = splitCsv(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name) => head.indexOf(name);
  const need = ["sheet", "text_as_drawn", "x0", "y0", "x1", "y1", "class"];
  for (const n of need) {
    if (idx(n) < 0) throw new Error(`${path}: tag-occurrence key is missing required column "${n}" — got: ${head.join(", ")}`);
  }
  return lines.slice(1).map((l) => {
    const c = splitCsv(l);
    const g = (name) => (c[idx(name)] ?? "").trim();
    return {
      sheet: g("sheet"),
      page: g("page"),
      text_as_drawn: g("text_as_drawn"),
      bbox: [Number(g("x0")), Number(g("y0")), Number(g("x1")), Number(g("y1"))],
      rot: g("rot") ? Number(g("rot")) : 0,
      class: g("class"),
      row_table: g("row_table"),
      row_key: g("row_key"),
      note: g("note"),
    };
  });
}

const canon = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");

function bboxIoU(a, b) {
  const ix0 = Math.max(a[0], b[0]), iy0 = Math.max(a[1], b[1]);
  const ix1 = Math.min(a[2], b[2]), iy1 = Math.min(a[3], b[3]);
  const iw = Math.max(0, ix1 - ix0), ih = Math.max(0, iy1 - iy0);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * @param {ReturnType<typeof readTagOccKey>} key
 * @param {Awaited<ReturnType<typeof buildTagOccurrenceBaseline>>} baseline
 * @param {number} ioUThreshold
 */
export function scoreTagLedger(key, baseline, ioUThreshold = 0.3) {
  const planInstances = key.filter((k) => k.class === "PLAN_INSTANCE");
  const rowLabels = key.filter((k) => k.class === "ROW_LABEL");

  // Flatten baseline into (sheet, bbox, row_key, row_table) occurrence list.
  const baselineOcc = [];
  for (const row of baseline.rows || []) {
    for (const inst of row.instances) {
      baselineOcc.push({ sheet: inst.sheet, bbox: inst.bbox, row_key: row.row_key, row_table: row.row_table });
    }
  }
  const usedBaseline = new Set();

  // ---- tag -> row direction ----
  const misses = { missedOccurrence: [], wrongRow: [], unresolvedShouldResolve: [] };
  let tagMatched = 0;
  for (const k of planInstances) {
    const isUnscheduled = canon(k.row_key) === "UNSCHEDULED" || !k.row_key;
    let best = -1, bestIoU = 0;
    for (let i = 0; i < baselineOcc.length; i++) {
      if (usedBaseline.has(i)) continue;
      const o = baselineOcc[i];
      if (o.sheet !== k.sheet) continue;
      const iou = bboxIoU(o.bbox, k.bbox);
      if (iou > bestIoU) { bestIoU = iou; best = i; }
    }
    if (best >= 0 && bestIoU >= ioUThreshold) {
      usedBaseline.add(best);
      const o = baselineOcc[best];
      if (isUnscheduled) {
        // Baseline is row-driven and cannot produce an UNSCHEDULED result by
        // construction; a bbox match here only happens if some OTHER row's
        // sweep coincidentally landed on this text (a real wrong-row bug) —
        // report it as such rather than as a tag-match.
        misses.wrongRow.push({ text: k.text_as_drawn, sheet: k.sheet, expected: "UNSCHEDULED", got: o.row_key });
        continue;
      }
      if (canon(o.row_key) === canon(k.row_key)) {
        tagMatched++;
      } else {
        misses.wrongRow.push({ text: k.text_as_drawn, sheet: k.sheet, expected: k.row_key, got: o.row_key });
      }
    } else if (!isUnscheduled) {
      misses.unresolvedShouldResolve.push({ text: k.text_as_drawn, sheet: k.sheet, row_key: k.row_key });
    } else {
      // UNSCHEDULED key row with no baseline candidate at all — this is the
      // expected, structural outcome of a row-driven baseline (H5): it never
      // looks for text with no row, so it can never produce a hit here.
      misses.missedOccurrence.push({ text: k.text_as_drawn, sheet: k.sheet, reason: "UNSCHEDULED — row-driven baseline cannot discover this by construction (H5)" });
    }
  }
  const scheduledPlanInstances = planInstances.filter((k) => canon(k.row_key) !== "UNSCHEDULED" && k.row_key);
  const unscheduledPlanInstances = planInstances.filter((k) => canon(k.row_key) === "UNSCHEDULED" || !k.row_key);
  const tagToRow = {
    key_plan_instances: planInstances.length,
    key_scheduled_plan_instances: scheduledPlanInstances.length,
    key_unscheduled_plan_instances: unscheduledPlanInstances.length,
    matched: tagMatched,
    recall: scheduledPlanInstances.length ? tagMatched / scheduledPlanInstances.length : null,
    unscheduled_recall_note: "A row-driven baseline structurally cannot find UNSCHEDULED text (H5). This is always 0/N until Phase 3's ledger enumerates all sheet text independent of rows.",
  };

  // ---- row -> tag direction ----
  const keyGroups = new Map(); // `${row_table}\0${row_key}` -> count
  for (const k of planInstances) {
    if (canon(k.row_key) === "UNSCHEDULED" || !k.row_key) continue;
    const gk = `${canon(k.row_table)}\0${canon(k.row_key)}`;
    keyGroups.set(gk, (keyGroups.get(gk) || 0) + 1);
  }
  const rowMisses = { rowMissingInstances: [], rowExtraInstances: [] };
  let rowExact = 0;
  for (const [gk, expectedCount] of keyGroups) {
    const [table, rowKey] = gk.split("\0");
    const baselineRow = (baseline.rows || []).find((r) => canon(r.row_key) === rowKey);
    const actualCount = baselineRow ? baselineRow.drawn_count : 0;
    if (actualCount === expectedCount) rowExact++;
    else if (actualCount < expectedCount) rowMisses.rowMissingInstances.push({ table, row_key: rowKey, expected: expectedCount, actual: actualCount });
    else rowMisses.rowExtraInstances.push({ table, row_key: rowKey, expected: expectedCount, actual: actualCount });
  }
  const rowToTag = {
    key_row_groups: keyGroups.size,
    exact_count_match: rowExact,
    exact_rate: keyGroups.size ? rowExact / keyGroups.size : null,
  };

  return {
    set_available: baseline.available,
    plan_sheet_count: baseline.plan_sheet_count,
    key_row_label_count: rowLabels.length,
    tag_to_row: tagToRow,
    row_to_tag: rowToTag,
    misses,
    row_misses: rowMisses,
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) {
  const argv = process.argv.slice(2);
  const [corpusDir, setId] = argv.filter((a) => !a.startsWith("--"));
  const baselineIdx = argv.indexOf("--baseline");
  const baselinePath = baselineIdx >= 0 ? argv[baselineIdx + 1] : null;
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  if (!corpusDir || !setId) {
    console.error("usage: node --import tsx scripts/tag-ledger-eval.mjs <corpus-dir> <setId> [--baseline path.json] [--out path.json]");
    process.exit(2);
  }
  const corpus = resolve(corpusDir);
  const keyPath = join(corpus, "keys", `${setId}.tagocc.csv`);
  const key = readTagOccKey(keyPath);
  if (key === null) {
    console.error(`no key at ${keyPath}`);
    process.exit(1);
  }
  let baseline;
  if (baselinePath) {
    baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  } else {
    const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));
    validateSets(spec);
    const set = spec.sets.find((s) => s.id === setId);
    if (!set) { console.error(`no such set "${setId}"`); process.exit(2); }
    const files = resolveSetFiles(corpus, spec, set);
    const missing = files.filter((f) => !existsSync(f));
    if (missing.length) { console.error(`missing PDF(s): ${missing.join(", ")}`); process.exit(1); }
    baseline = await buildTagOccurrenceBaseline(files);
  }
  const score = scoreTagLedger(key, baseline);
  const payload = JSON.stringify({ set_id: setId, ...score }, null, 2);
  // Prefer a direct file write over stdout: this environment has shown
  // console.log output redirected via `>` land on the wrong stream or get
  // truncated under load (see tag-occurrence-baseline.mjs's own header
  // note and TAG_LEDGER_BASELINE.md) — writeFileSync sidesteps that
  // entirely, the same fix already applied there.
  if (outPath) {
    writeFileSync(outPath, payload);
    console.error(`[tag-ledger-eval] wrote ${outPath}`);
  } else {
    console.log(payload);
  }
}
