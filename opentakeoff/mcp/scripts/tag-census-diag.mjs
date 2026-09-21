#!/usr/bin/env node
// WP0 baseline harness (plans/03-drawing-tag-recognition-audit.md §3.1).
//
// Loads a real Session, builds the production sheet graph, runs the
// production tag recogniser (labelTokens) over the production text spans
// for every sheet, and reports:
//   - sheet role counts
//   - schedule key counts by kind (valve_mark / unit_mark / equipment_row)
//   - label-token counts, ALL and OUTSIDE TABLE REGIONS, per sheet role
//   - the four-bucket coverage table (none/planOnly/otherOnly/both) per
//     schedule-key kind
//   - drawn-but-unscheduled keys
//   - sweep_schedule_row outcomes for a caller-supplied sample of tags
//
// Read-only measurement. No production code is touched by this script.
//
// Usage:
//   node --import tsx mcp/scripts/tag-census-diag.mjs <pdf-path> [tag1,tag2,...]
import { Session } from "../src/session.ts";
import { textSpans } from "../src/pdf.ts";
import { labelTokens, canonicalLabelFamily } from "../../web/src/lib/symbollabels.ts";
import { isEquipTag } from "../../web/src/lib/equiptags.ts";
import { markKey } from "../../web/src/lib/markid.ts";

const PDF = process.argv[2];
const SWEEP_SAMPLE = (process.argv[3] || "").split(",").map((s) => s.trim()).filter(Boolean);

if (!PDF) {
  console.error("usage: node --import tsx mcp/scripts/tag-census-diag.mjs <pdf-path> [tag1,tag2,...]");
  process.exit(2);
}

const t0 = Date.now();
const session = new Session();
await session.loadPlan(PDF);
console.log(`loaded in ${Date.now() - t0} ms`);
const graph = await session.graphForPipeline();
console.log(`graph in ${Date.now() - t0} ms; sheets=${graph.sheets.length} tables=${graph.tables.length}`);

// ---- sheet roles
const roleOf = new Map(graph.sheets.map((s) => [s.key, s.role]));
const roleCounts = {};
for (const s of graph.sheets) roleCounts[s.role] = (roleCounts[s.role] || 0) + 1;
console.log("\n== sheet roles ==", JSON.stringify(roleCounts));

// ---- schedule key kind classification (WP0 exact rule, §3.1):
//   valve_mark  : table has a header matching /^VALVE\s*MARK$/i, cell non-empty
//   unit_mark   : else, table has a header matching /^UNIT\s*MARK$/i, cell non-empty
//   equipment_row: else, table.kind === "equipment" rows, each "/"-split part of row.key
// A key must contain a letter and a digit after markKey. First kind seen wins.
const VALVE_MARK_RE = /^VALVE\s*MARK$/i;
const UNIT_MARK_RE = /^UNIT\s*MARK$/i;
const validKey = (k) => {
  const mk = markKey(k);
  return mk.length > 0 && /[A-Z]/.test(mk) && /\d/.test(mk);
};

const scheduleKeys = new Map(); // markKey -> { raw, kind, table, sheet, column }
const addKey = (raw, meta) => {
  if (!validKey(raw)) return;
  const k = markKey(raw);
  if (!scheduleKeys.has(k)) scheduleKeys.set(k, { raw: raw.trim().toUpperCase(), ...meta });
};

for (const tb of graph.tables) {
  const title = tb.title?.text || `(${tb.kind})`;
  for (const row of tb.rows || []) {
    const cells = row.cells || {};
    const vm = Object.entries(cells).find(([h]) => VALVE_MARK_RE.test(String(h || "").trim()));
    const um = Object.entries(cells).find(([h]) => UNIT_MARK_RE.test(String(h || "").trim()));
    if (vm && vm[1]?.text) {
      addKey(vm[1].text, { kind: "valve_mark", table: title, sheet: tb.sheet, column: vm[0] });
      continue;
    }
    if (um && um[1]?.text) {
      addKey(um[1].text, { kind: "unit_mark", table: title, sheet: tb.sheet, column: um[0] });
      continue;
    }
    if (tb.kind === "equipment" && row.key) {
      for (const part of String(row.key).split("/")) {
        addKey(part, { kind: "equipment_row", table: title, sheet: tb.sheet, column: "key" });
      }
    }
  }
}
const byKind = {};
for (const v of scheduleKeys.values()) byKind[v.kind] = (byKind[v.kind] || 0) + 1;
console.log("== schedule keys ==", JSON.stringify(byKind), "total", scheduleKeys.size);

// ---- table regions per sheet (for "outside table regions")
const tableRegions = new Map();
for (const tb of graph.tables) {
  const arr = tableRegions.get(tb.sheet) || [];
  arr.push(tb.region);
  tableRegions.set(tb.sheet, arr);
}
const inTable = (sheet, tk) => {
  const cx = (tk.x0 + tk.x1) / 2;
  const cy = (tk.y0 + tk.y1) / 2;
  return (tableRegions.get(sheet) || []).some((r) => cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3]);
};

// ---- census: labelTokens over every sheet's production spans
const sheets = session.sheetList();
const allTokensByRole = {}; // role -> count (ALL tokens, not just outside tables)
const outsideTokensByRole = {}; // role -> count (outside table regions only)
const occByKey = new Map(); // markKey -> [{sheet, role, inTable}]
const drawnKeys = new Map(); // markKey -> { text, n, sheets: Set }
let spanTotal = 0;
let labelTokenTotal = 0;

for (const sh of sheets) {
  if (!sh.spans) sh.spans = textSpans(sh.page);
  spanTotal += sh.spans.length;
  const role = roleOf.get(sh.key) || "unknown";
  const tokens = labelTokens(sh.spans);
  labelTokenTotal += tokens.length;
  allTokensByRole[role] = (allTokensByRole[role] || 0) + tokens.length;
  for (const tk of tokens) {
    const outside = !inTable(sh.key, tk);
    if (outside) outsideTokensByRole[role] = (outsideTokensByRole[role] || 0) + 1;
    if (!outside) continue; // buckets/drawn-keys are computed OUTSIDE table regions only
    const text = tk.str.trim().toUpperCase();
    const key = markKey(text);
    const equip = isEquipTag(text);
    if (scheduleKeys.has(key)) {
      const arr = occByKey.get(key) || [];
      arr.push({ sheet: sh.key, role });
      occByKey.set(key, arr);
    }
    if (equip) {
      const e = drawnKeys.get(key) || { text, n: 0, sheets: new Set() };
      e.n++;
      e.sheets.add(sh.key);
      drawnKeys.set(key, e);
    }
  }
}
console.log(`\n== census == spans=${spanTotal} label-tokens(all)=${labelTokenTotal} equip-shaped(outside tables)=${drawnKeys.size ? [...drawnKeys.values()].reduce((n, e) => n + e.n, 0) : 0} in ${Date.now() - t0} ms`);
console.log("label tokens, ALL, by sheet role:", JSON.stringify(allTokensByRole));
console.log("label tokens, OUTSIDE table regions, by sheet role:", JSON.stringify(outsideTokensByRole));

// ---- four-bucket coverage table, per schedule-key kind
const cov = {
  valve_mark: { none: 0, planOnly: 0, otherOnly: 0, both: 0 },
  unit_mark: { none: 0, planOnly: 0, otherOnly: 0, both: 0 },
  equipment_row: { none: 0, planOnly: 0, otherOnly: 0, both: 0 },
};
const examples = { valve_mark: [], unit_mark: [], equipment_row: [] };
for (const [k, meta] of scheduleKeys) {
  const occ = occByKey.get(k) || [];
  const plan = occ.filter((o) => o.role === "plan").length;
  const other = occ.length - plan;
  const bucket = !occ.length ? "none" : plan && other ? "both" : plan ? "planOnly" : "otherOnly";
  cov[meta.kind][bucket]++;
  if (examples[meta.kind].length < 6) examples[meta.kind].push(`${meta.raw}: plan=${plan} other=${other}`);
}
console.log("\n== schedule keys -> drawn text occurrences outside tables, per kind ==");
for (const [kind, c] of Object.entries(cov)) {
  console.log(`  ${kind.padEnd(14)} ${JSON.stringify(c)}   e.g. ${examples[kind].join(" | ")}`);
}

// ---- drawn equip-shaped keys with no schedule key at all
const unscheduled = [...drawnKeys.entries()].filter(([k]) => !scheduleKeys.has(k));
console.log(`\n== drawn equip-shaped keys: ${drawnKeys.size}; with a schedule key: ${drawnKeys.size - unscheduled.length}; WITHOUT any schedule key: ${unscheduled.length} ==`);
console.log("  sample unscheduled:", unscheduled.sort((a, b) => b[1].n - a[1].n).slice(0, 25).map(([, e]) => `${e.text}x${e.n}`).join(", "));

// ---- FCU-specific rollup (the plan's own worked example)
const fcuSchedKeys = [...scheduleKeys.entries()].filter(([, m]) => /^FCU/.test(m.raw));
const fcuDrawn = [...drawnKeys.entries()].filter(([, e]) => /^FCU/.test(e.text));
const fcuPlanOcc = (() => {
  let n = 0;
  for (const sh of sheets) {
    if (roleOf.get(sh.key) !== "plan") continue;
    for (const tk of labelTokens(sh.spans)) {
      if (inTable(sh.key, tk)) continue;
      if (/^FCU/.test(tk.str.trim().toUpperCase())) n++;
    }
  }
  return n;
})();
const fcuTotalOcc = fcuDrawn.reduce((n, [, e]) => n + e.n, 0);
console.log(`\n== FCU == schedule keys=${fcuSchedKeys.length} (unit_mark=${fcuSchedKeys.filter(([, m]) => m.kind === "unit_mark").length}, equipment_row=${fcuSchedKeys.filter(([, m]) => m.kind === "equipment_row").length}); distinct FCU tags drawn outside tables=${fcuDrawn.length}; total FCU tag occurrences=${fcuTotalOcc} (${fcuPlanOcc} on plan-role sheets)`);

// ---- sweep_schedule_row sample (same options reconcile_schedule_plan uses)
console.log("\n== sweep_schedule_row sample (evaluationFast + verifyTaggedGeometry) ==");
for (const tag of SWEEP_SAMPLE) {
  const s0 = Date.now();
  try {
    const r = await session.sweepScheduleRow(tag, { commit: false, evaluationFast: true, verifyTaggedGeometry: true });
    const textOnly = (r.sheets || []).reduce((n, s) => n + (s.text_only?.length || 0), 0);
    console.log(`  ${tag.padEnd(16)} found=${r.found} basis=${r.anchor?.grounding_basis} occurrences=${r.anchor?.occurrences} text_only=${textOnly} skipped=${(r.skipped || []).length} ${Date.now() - s0} ms`);
  } catch (e) {
    console.log(`  ${tag.padEnd(16)} REFUSED (${Date.now() - s0} ms): ${String(e.message || e).slice(0, 220)}`);
  }
}
console.log(`\ndone in ${Date.now() - t0} ms`);
process.exit(0);
