// Schedule ↔ plan reconcile table — shared path unit tests (set-agnostic).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyReconcileStatus,
  classifyBasServedSweepOutcome,
  sweepBasServedMark,
  familyNeedleFromSpecs,
  scheduledQtyStatusFromRow,
  reconcileRowsFromTakeoffItems,
  summarizeReconcile,
  reconcileScheduleFamilyFromGraph,
  reconcileScheduleFamilyWithSweeps,
  reconcileRowsToCsv,
  attachDiagramCorroboration,
  rowIdentityTag,
  scheduleMarksRead,
  scheduleMarkVocabulary,
  scheduleRowsReadingMark,
  servedEquipmentTag,
  unscheduledTagsAndAliasCandidates,
  unscheduledUnitCandidates,
  planOtherCites,
  isUnitFamilyTable,
  markWithoutTrailingStatus,
  markZeroRespellings,
  rowNamesEachUnitOnce,
  rowNamesOneUnitOnce,
  rowUnitMarks,
  rowReconcileUnits,
  reconcileUnitKey,
} from "../src/lib/schedulePlanReconcile.mjs";
import {
  HVAC_FAMILY_SPECS, compileHvacTakeoff, valveRowService, rowIdentityText, familyReadsUnitMark, hasValveOrDamperMark,
  inferValveServiceFromTable, familyTableGate, scheduleTableView, splitRowMarks, markSpellings, unitMarkKey, familyMarkRead,
  isControlValveHeaderShape, expandMarkList, expandEquipMarks, rowMarkText, normalizeEquipMark, plainMark, isGroupedMarkHeader,
  takeoffUnitsByRow,
} from "../src/lib/corpusTakeoff.mjs";
import { rowKeyAnswersFor, rowKeyOf } from "../src/lib/sheetgraph.ts";
import { classifyGrid } from "../src/lib/gridClassify.mjs";
import {
  classifyTakeoffIntent,
  advanceTakeoffWorkflow,
} from "../src/lib/takeoffWorkflow.js";
import { markKey, spanAnswersFor } from "../src/lib/markid.ts";


test("row identity prefers VALVE MARK over UNIT MARK (Pillar C valve join)", () => {
  const valveRow = {
    key: "CUH-A1",
    identity: { header: "UNIT MARK", text: "CUH-A1" },
    cells: {
      "UNIT MARK": { text: "CUH-A1" },
      "VALVE MARK": { text: "CV-CUH-A1-HHW" },
    },
  };
  assert.equal(rowIdentityTag(valveRow, /^VALVE\s*MARK$/i), "CV-CUH-A1-HHW");
  assert.equal(rowIdentityTag(valveRow), "CV-CUH-A1-HHW");
  const graph = {
    tables: [
      {
        sheet: "set.pdf#10",
        title: { text: "HHW CONTROL VALVE SCHEDULE" },
        kind: "equipment",
        rows: [
          {
            key: "CUH-A1",
            cells: {
              "UNIT MARK": { text: "CUH-A1" },
              "VALVE MARK": { text: "CV-CUH-A1-HHW" },
            },
          },
          {
            key: "FCU-A1",
            cells: {
              "UNIT MARK": { text: "FCU-A1" },
              "VALVE MARK": { text: "CV-FCU-A1-HHW" },
            },
          },
        ],
      },
    ],
  };
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "HHW_CONTROL_VALVE");
  assert.ok(needle?.identityHeaderRe);
  const rows = reconcileScheduleFamilyFromGraph(graph, needle);
  assert.deepEqual(
    rows.map((r) => r.tag).sort(),
    ["CV-CUH-A1-HHW", "CV-FCU-A1-HHW"].sort(),
  );
});

// WP3 seam: session.ts's tagOccurrencesOnSheet and countMarks now both
// filter spans with markid.ts's spanAnswersFor, and this module's row_id/
// scopeIdentity now canonicalize with markid.ts's markKey — one identity
// rule shared by all three production callers, in place of three
// independent ad hoc canon functions that could (and did) disagree. This
// exercises the real production row builder, not the shared primitive in
// isolation: a hyphen/space twin of the SAME device (a duplicate/
// continuation extract, the Douglas HP-20 shape this dedup exists for)
// must collapse to one row; a genuinely different device (a different
// digit) must not.
test("WP3 seam: reconcile row_id/scopeIdentity use markKey — hyphen/space twins collapse, digit differences stay distinct", () => {
  const graph = {
    tables: [
      {
        sheet: "set.pdf#10",
        title: { text: "HHW CONTROL VALVE SCHEDULE" },
        kind: "equipment",
        rows: [
          {
            key: "CUH-A1",
            cells: {
              "UNIT MARK": { text: "CUH-A1" },
              "VALVE MARK": { text: "CV-CUH-A1-HHW" },
            },
          },
          {
            // Twin spelling of the row above (space instead of hyphen) — under
            // the old whitespace-only canon this stayed a DIFFERENT row_id
            // ("CV-CUH-A1-HHW" keeps its hyphens, "CVCUHA1HHW" does not);
            // markKey strips both, so this is the identity fix under test.
            key: "CUH-A1",
            cells: {
              "UNIT MARK": { text: "CUH-A1" },
              "VALVE MARK": { text: "CV CUH A1 HHW" },
            },
          },
          {
            // A genuinely different device (digit differs) must never merge.
            key: "CUH-A10",
            cells: {
              "UNIT MARK": { text: "CUH-A10" },
              "VALVE MARK": { text: "CV-CUH-A10-HHW" },
            },
          },
        ],
      },
    ],
  };
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "HHW_CONTROL_VALVE");
  const rows = reconcileScheduleFamilyFromGraph(graph, needle);
  assert.equal(rows.length, 2, `twin spellings of one device must collapse to one row, got tags: ${JSON.stringify(rows.map((r) => r.tag))}`);
  const keys = rows.map((r) => markKey(r.tag)).sort();
  assert.deepEqual(keys, [markKey("CV-CUH-A1-HHW"), markKey("CV-CUH-A10-HHW")].sort());
  assert.equal(new Set(rows.map((r) => r.row_id)).size, 2);
});

test("servedEquipmentTag: reads UNIT MARK/SERVES/SERVED EQUIPMENT/EQUIPMENT SERVED, never the row's own VALVE MARK header", () => {
  assert.equal(servedEquipmentTag({ cells: { "UNIT MARK": { text: "CUH-A1" } } }), "CUH-A1");
  assert.equal(servedEquipmentTag({ cells: { SERVES: { text: "AHU-A1" } } }), "AHU-A1");
  assert.equal(servedEquipmentTag({ cells: { "SERVED EQUIPMENT": { text: "FCU-A2" } } }), "FCU-A2");
  assert.equal(servedEquipmentTag({ cells: { "EQUIPMENT SERVED": { text: "DOAH-A1" } } }), "DOAH-A1");
  assert.equal(servedEquipmentTag({ cells: { "VALVE MARK": { text: "CV-CUH-A1-HHW" } } }), null);
  assert.equal(servedEquipmentTag({ cells: {} }), null);
});

// WP5 seam: a row's own identity (a VALVE MARK) with zero drawn occurrences
// anywhere still gets located via the UNIT MARK it serves, using the real
// production row builder against a synthetic graph.tags census (WP2's own
// DrawnTag shape) — not just the servedEquipmentTag helper in isolation.
test("WP5 seam: served-equipment location grade — a row with no drawn VALVE MARK is located via its drawn UNIT MARK", () => {
  const graph = {
    tables: [
      {
        sheet: "set.pdf#10",
        title: { text: "HHW CONTROL VALVE SCHEDULE" },
        kind: "equipment",
        rows: [
          {
            key: "CUH-A1",
            cells: {
              "UNIT MARK": { text: "CUH-A1" },
              "VALVE MARK": { text: "CV-CUH-A1-HHW" },
            },
          },
        ],
      },
    ],
    // CV-CUH-A1-HHW (the row's own identity) is never drawn; CUH-A1 (the
    // served unit named in UNIT MARK) is drawn once on a plan sheet.
    tags: [
      {
        sheet: "set.pdf#12", role: "plan", text: "CUH-A1", key: "CUHA1", family: "CUH-A",
        bbox: [10, 20, 60, 40], rot: 0, source: "exact", multiplier: 1,
        in_table: null, sheet_callout: false,
      },
    ],
  };
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "HHW_CONTROL_VALVE");
  const rows = reconcileScheduleFamilyFromGraph(graph, needle);
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(row.tag, "CV-CUH-A1-HHW");
  assert.equal(row.installed_qty, null, "served-equipment location is never installed quantity");
  assert.equal(row.status, "SCHEDULE_ONLY");
  assert.equal(row.installed_evidence_grade, "located_via_served_equipment");
  assert.equal(row.served_equipment_cites?.length, 1);
  assert.equal(row.served_equipment_cites[0].tag, "CUH-A1");
  assert.equal(row.served_equipment_cites[0].sheet, "set.pdf#12");
  assert.equal(row.served_equipment_cites[0].role, "plan");
  assert.deepEqual(row.served_equipment_cites[0].bbox, { x0: 10, y0: 20, x1: 60, y1: 40 });
});

test("WP5 seam: a row whose own VALVE MARK IS drawn never gets a served-equipment cite", () => {
  const graph = {
    tables: [
      {
        sheet: "set.pdf#10",
        title: { text: "HHW CONTROL VALVE SCHEDULE" },
        kind: "equipment",
        rows: [
          {
            key: "CUH-A1",
            cells: {
              "UNIT MARK": { text: "CUH-A1" },
              "VALVE MARK": { text: "CV-CUH-A1-HHW" },
            },
          },
        ],
      },
    ],
    tags: [
      {
        sheet: "set.pdf#12", role: "plan", text: "CV-CUH-A1-HHW", key: "CVCUHA1HHW", family: "CV-CUH-HHW",
        bbox: [1, 2, 3, 4], rot: 0, source: "exact", multiplier: 1,
        in_table: null, sheet_callout: false,
      },
      {
        sheet: "set.pdf#12", role: "plan", text: "CUH-A1", key: "CUHA1", family: "CUH-A",
        bbox: [10, 20, 60, 40], rot: 0, source: "exact", multiplier: 1,
        in_table: null, sheet_callout: false,
      },
    ],
  };
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "HHW_CONTROL_VALVE");
  const rows = reconcileScheduleFamilyFromGraph(graph, needle);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].served_equipment_cites, undefined, "the row's own mark IS drawn — never fall back to the served unit");
  assert.notEqual(rows[0].installed_evidence_grade, "located_via_served_equipment");
});

const tagFixture = (over: Record<string, unknown>) => ({
  sheet: "set.pdf#1", role: "plan", text: "X", key: "X", family: "X",
  bbox: [0, 0, 1, 1], rot: 0, source: "exact", multiplier: 1,
  in_table: null, sheet_callout: false, ...over,
});

test("unscheduledTagsAndAliasCandidates: sheet callouts never count as unscheduled tags or alias candidates", () => {
  const graph = {
    tables: [{ rows: [{ key: "FCU-1", cells: { MARK: { text: "FCU-1" } } }] }],
    tags: [
      tagFixture({ text: "FCU-1", key: "FCU1" }),
      tagFixture({ text: "CSF-CHW-M1", key: "CSFCHWM1" }),
      tagFixture({ text: "M-501", key: "M501", sheet_callout: true }),
    ],
  };
  const { unscheduled_tags, alias_candidates } = unscheduledTagsAndAliasCandidates(graph);
  assert.deepEqual(unscheduled_tags.map((t: any) => t.text), ["CSF-CHW-M1"], "FCU-1 has a schedule row; the sheet callout is excluded outright");
  assert.ok(!alias_candidates.some((c) => c.drawn === "M501" || c.nearest_row_key === "M501"));
});

test("unscheduledTagsAndAliasCandidates: worked examples — one-letter substitution qualifies, a digit insert never does", () => {
  const graph = {
    tables: [
      { rows: [{ key: "CV-CH-C-MT1", cells: { "VALVE MARK": { text: "CV-CH-C-MT1" } } }] },
      { rows: [{ key: "FCU-1", cells: { MARK: { text: "FCU-1" } } }] },
    ],
    tags: [
      tagFixture({ text: "CV-CH-C-MT1", key: "CVCHCMT1" }),
      tagFixture({ text: "CV-CH-H-MT-1", key: "CVCHHMT1" }),
      tagFixture({ text: "FCU-1", key: "FCU1" }),
      tagFixture({ text: "FCU-10", key: "FCU10" }),
    ],
  };
  const { alias_candidates } = unscheduledTagsAndAliasCandidates(graph);
  const byDrawn = Object.fromEntries(alias_candidates.map((c) => [c.drawn, c]));
  assert.equal(byDrawn.CVCHHMT1?.nearest_row_key, "CVCHCMT1", "one letter substitution (C vs H) is a candidate");
  assert.equal(byDrawn.FCU10, undefined, "FCU-1 vs FCU-10 inserts a digit — never a candidate");
  for (const c of alias_candidates) assert.equal(c.distance, 1);
});

test("familyNeedleFromSpecs: CONTROL_DAMPER / MOTORIZED DAMPER aliases (WP7.2)", () => {
  for (const fam of ["CONTROL_DAMPER", "MOTORIZED DAMPER", "control damper", "motorized_damper"]) {
    const n = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, fam);
    assert.ok(n, fam);
    assert.match(n.label, /CONTROL DAMPER/i);
  }
  const hood = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "ECV");
  assert.ok(hood);
  assert.match(hood.label, /FUME HOOD DAMPER/i);
});

test("classifyReconcileStatus: MATCH, SCHEDULE_ONLY, REFUSED, AMBIGUOUS", () => {
  assert.equal(
    classifyReconcileStatus({ scheduledQty: 1, installedQty: 1, itemStatus: "resolved" }),
    "MATCH",
  );
  assert.equal(
    classifyReconcileStatus({
      scheduledQty: 1,
      installedQty: 0,
      itemStatus: "refused",
      reason: "tag is not drawn on any plan sheet",
    }),
    "SCHEDULE_ONLY",
  );
  assert.equal(
    classifyReconcileStatus({
      scheduledQty: 1,
      installedQty: 0,
      failureType: "REFUSED_NO_SCALE",
      reason: "Set the scale first",
    }),
    "REFUSED_NO_SCALE",
  );
  assert.equal(
    classifyReconcileStatus({
      scheduledQty: 1,
      installedQty: 0,
      failureType: "AMBIGUOUS_ROW_KEY",
      reason: "Ambiguous: 2 schedule rows carry the key",
    }),
    "AMBIGUOUS",
  );
  assert.equal(
    classifyReconcileStatus({
      scheduledQty: 0,
      installedQty: 2,
      itemStatus: "resolved",
    }),
    "PLAN_ONLY",
  );
});

test("scheduled quantity distinguishes printed, row-cardinality, and unparseable evidence", () => {
  assert.deepEqual(scheduledQtyStatusFromRow({ cells: { "QTY.": { text: "12" } } }), {
    qty: 12,
    refused: false,
    reason: null,
    basis: "printed_schedule_quantity",
    source_header: "QTY.",
    source_text: "12",
  });
  assert.equal(
    scheduledQtyStatusFromRow({ cells: { MARK: { text: "VAV-1" } } }).basis,
    "one_per_unique_schedule_row",
  );
  for (const text of ["", "1 B", "2 units", "0"]) {
    const result = scheduledQtyStatusFromRow({ cells: { QTY: { text } } });
    assert.equal(result.refused, true, JSON.stringify(text));
    assert.equal(result.basis, "unparseable_printed_quantity");
  }
});

test("repeatable air-device type rows never invent a scheduled quantity of one", () => {
  assert.deepEqual(
    scheduledQtyStatusFromRow(
      { cells: { MARK: { text: "CD-1" }, TYPE: { text: "3-CONE SUPPLY" } } },
      { typeDefinition: true },
    ),
    {
      qty: null,
      refused: false,
      reason: null,
      basis: "type_definition_not_quantity",
      source_header: null,
      source_text: null,
    },
  );
  const [row] = reconcileRowsFromTakeoffItems([{
    tag: "CD-1",
    status: "resolved",
    quantity: 24,
    quantity_basis: "symbol_fingerprint",
    search_scope: "exhaustive",
    unlabeled_audit_complete: true,
    plan_search_complete: true,
    placement_count: 21,
    schedule_row: { MARK: "CD-1", TYPE: "3-CONE SUPPLY" },
    schedule: { sheet: "set.pdf#47", kind: "equipment", title: "GRILLE, REGISTER, AND DIFFUSER SCHEDULE", drawing_group: "MTRACON" },
    drawing_locations: [{ sheet: "set.pdf#12", at: [100, 200] }],
  }]);
  assert.equal(row.scheduled_qty, null);
  assert.equal(row.scheduled_qty_basis, "type_definition_not_quantity");
  assert.equal(row.installed_qty, 24);
  assert.equal(row.placement_count, 21);
  assert.equal(row.status, "MATCH", "the schedule definition is grounded to plan count; no fake 1-vs-24 comparison");
  assert.equal(row.quantity_comparison, "type_definition_vs_plan_count");
  assert.equal(row.schedule_cite.drawing_group, "MTRACON");
});

test("reconcile refuses a polluted printed QTY instead of reporting fallback one", () => {
  const [row] = reconcileRowsFromTakeoffItems([{
    tag: "VAV-1",
    status: "resolved",
    quantity: 1,
    schedule_row: { QTY: "1 B" },
    drawing_locations: [{ sheet: "m.pdf#2", at: [1, 2] }],
  }]);
  assert.equal(row.scheduled_qty, null);
  assert.equal(row.scheduled_qty_basis, "unparseable_printed_quantity");
  assert.equal(row.status, "AMBIGUOUS");
  assert.match(row.reason, /unparseable/i);
});

test("classifyBasServedSweepOutcome: unanchored I/O tags → SCHEDULE_ONLY (not ERROR)", () => {
  const so = classifyBasServedSweepOutcome({
    error: new Error('Schedule row "AFMS-1" (DDC CONTROLLER INPUT/OUTPUT SUMMARY) cannot be geometrically anchored — its tag is not drawn on any plan sheet'),
  });
  assert.equal(so.status, "SCHEDULE_ONLY");
  assert.equal(so.found, 0);

  const match = classifyBasServedSweepOutcome({
    result: { found: 1, sheets: [{ matches: [{ sheet: "m#2" }] }] },
  });
  assert.equal(match.status, "MATCH");
  assert.equal(match.cites, 1);

  const miss = classifyBasServedSweepOutcome({ result: { found: 0, sheets: [] } });
  assert.equal(miss.status, "SCHEDULE_ONLY");
  const amb = classifyBasServedSweepOutcome({
    error: new Error('Ambiguous: 2 schedule rows carry the key "AHU-A" — the same mark defined twice cannot seed one sweep.'),
  });
  assert.equal(amb.status, "AMBIGUOUS");

});

test("reconcileRowsFromTakeoffItems never promotes an exact plan tag into a verified installed symbol", () => {
  const rows = reconcileRowsFromTakeoffItems([
    {
      tag: "VAV-1",
      equipment_type: "VAV box",
      category: "terminal",
      status: "resolved",
      quantity: 1,
      quantity_basis: "exact_plan_tag",
      search_scope: "tagged_only",
      unlabeled_audit_complete: false,
      plan_search_complete: true,
      schedule: { sheet: "M-601.pdf#2", kind: "equipment", title: "VOLUME CONTROL BOX SCHEDULE" },
      drawing_locations: [{
        sheet: "M-601.pdf#5",
        at: [100, 200],
        bbox: { x0: 90, y0: 190, x1: 110, y1: 210 },
        score: 1,
      }],
    },
    {
      tag: "EF-2",
      equipment_type: "Exhaust fan",
      status: "refused",
      quantity: 0,
      reason: "tag is not drawn on any plan sheet",
      schedule: { sheet: "M-601.pdf#2", kind: "equipment", title: "FAN SCHEDULE" },
      drawing_locations: [],
    },
  ], [
    { type: "SYMBOL_FALSE_NEGATIVE", tag: "EF-2", detail: "not drawn on any plan sheet" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, "AMBIGUOUS");
  assert.equal(rows[0].scheduled_qty, 1);
  assert.equal(rows[0].installed_qty, null);
  assert.equal(rows[0].tagged_plan_qty, 1);
  assert.equal(rows[0].installed_evidence_grade, "tag_text_only");
  assert.equal(rows[0].geometry_verified, false);
  assert.equal(rows[0].installed_qty_basis, "exact_plan_tag");
  assert.equal(rows[0].search_scope, "tagged_only");
  assert.equal(rows[0].unlabeled_audit_complete, false);
  assert.equal(rows[0].plan_search_complete, true);
  assert.deepEqual(rows[0].plan_cites, []);
  assert.deepEqual(rows[0].plan_tag_cites[0].bbox, { x0: 90, y0: 190, x1: 110, y1: 210 });
  assert.match(rows[0].reason, /tag text.*symbol geometry/i);
  assert.equal(rows[1].status, "SCHEDULE_ONLY");
  assert.equal(rows[1].installed_qty, null, "an unverified plan quantity must not be fabricated as zero");
  const summary = summarizeReconcile(rows);
  assert.equal(summary.match, 0);
  assert.equal(summary.ambiguous, 1);
  assert.equal(summary.schedule_only, 1);
});

test("geometry-grounded placements remain releasable installed quantity", () => {
  const [row] = reconcileRowsFromTakeoffItems([{
    tag: "VAV-1",
    equipment_type: "VAV box",
    category: "terminal",
    status: "resolved",
    quantity: 1,
    quantity_basis: "symbol_fingerprint",
    search_scope: "exhaustive",
    unlabeled_audit_complete: true,
    plan_search_complete: true,
    schedule: { sheet: "M-601.pdf#2", kind: "equipment", title: "VOLUME CONTROL BOX SCHEDULE" },
    drawing_locations: [{
      sheet: "M-601.pdf#5",
      at: [100, 200],
      bbox: { x0: 90, y0: 190, x1: 110, y1: 210 },
      score: 0.97,
    }],
  }]);
  assert.equal(row.status, "MATCH");
  assert.equal(row.installed_qty, 1);
  assert.equal(row.tagged_plan_qty, null);
  assert.equal(row.installed_evidence_grade, "symbol_geometry");
  assert.equal(row.geometry_verified, true);
  assert.equal(row.plan_cites.length, 1);
  assert.deepEqual(row.plan_tag_cites, []);
});

test("tag-attached vector grounding is installed evidence and keeps symbol and tag boxes separate", () => {
  const [row] = reconcileRowsFromTakeoffItems([{
    tag: "CV-1",
    equipment_type: "Control valve",
    category: "valve",
    status: "resolved",
    quantity: 1,
    quantity_basis: "tag_attached_vector",
    search_scope: "tagged_only",
    unlabeled_audit_complete: false,
    plan_search_complete: true,
    schedule: { sheet: "M-601.pdf#2", kind: "equipment", title: "CONTROL VALVE SCHEDULE" },
    drawing_locations: [{
      sheet: "M-601.pdf#5",
      at: [140, 200],
      bbox: { x0: 130, y0: 190, x1: 150, y1: 210 },
      tag_bbox: { x0: 90, y0: 190, x1: 115, y1: 207 },
      score: 1,
      attachment_via: "leader",
      attachment_distance_px: 2,
    }],
  }]);
  assert.equal(row.status, "MATCH");
  assert.equal(row.installed_qty, 1);
  assert.equal(row.installed_qty_basis, "tag_attached_vector");
  assert.equal(row.geometry_verified, true);
  assert.deepEqual(row.plan_cites[0].bbox, { x0: 130, y0: 190, x1: 150, y1: 210 });
  assert.deepEqual(row.plan_cites[0].tag_bbox, { x0: 90, y0: 190, x1: 115, y1: 207 });
  assert.equal(row.plan_cites[0].attachment_via, "leader");
});

test("an incomplete plan sweep exposes only an observed floor and reconciles AMBIGUOUS", () => {
  const [row] = reconcileRowsFromTakeoffItems([{
    tag: "VAV-9",
    equipment_type: "VAV box",
    status: "refused",
    quantity: 3,
    quantity_basis: "symbol_fingerprint",
    search_scope: "exhaustive",
    unlabeled_audit_complete: true,
    plan_search_complete: false,
    reason: "Plan search incomplete: 3 grounded placements observed; count is a floor.",
    schedule: { sheet: "M-601.pdf#2", kind: "equipment", title: "VAV SCHEDULE" },
    drawing_locations: [{ sheet: "M-601.pdf#5", at: [100, 200] }],
  }], [{
    type: "INCOMPLETE_PLAN_SEARCH",
    tag: "VAV-9",
    detail: "candidate work cap",
  }]);
  assert.equal(row.installed_qty, null);
  assert.equal(row.observed_plan_qty, 3);
  assert.equal(row.plan_search_complete, false);
  assert.equal(row.status, "AMBIGUOUS");
});

test("diagram corroboration stays separate from installed quantity and preserves repeated authored evidence", () => {
  const rows = attachDiagramCorroboration([{
    tag: "CV-CH-A1",
    status: "SCHEDULE_ONLY",
    scheduled_qty: 1,
    installed_qty: null,
    placement_count: 0,
    plan_cites: [],
    schedule_cite: { sheet: "set.pdf#44", title: "CHW CONTROL VALVE SCHEDULE" },
  }], {
    schematics: [{
      sheet: "set.pdf#56",
      title: "CHILLER CONTROL SCHEMATIC",
      equipment: [{
        tag: "CV-CH-A1",
        evidence: { sheet: "set.pdf#56", text: "CV-CH-A1", bbox: [10, 20, 30, 40] },
        schedule_refs: [{ sheet: "set.pdf#44", title: "CHW CONTROL VALVE SCHEDULE" }],
      }],
    }],
    risers: [{
      sheet: "set.pdf#72",
      title: "AIR OPS - CHILLED WATER PIPING SCHEMATIC",
      diagram_kind: "piping",
      diagram_tags: [{
        tag: "CV-CH-A1",
        schedule_refs: [{ sheet: "set.pdf#44", title: "CHW CONTROL VALVE SCHEDULE" }],
        evidence: [{ sheet: "set.pdf#72", text: "CV-CH-A1", bbox: [50, 60, 70, 80] }],
      }],
    }],
  }) as Array<any>;

  assert.equal(rows[0].status, "SCHEDULE_ONLY");
  assert.equal(rows[0].installed_qty, null, "two diagram appearances are not two installed devices");
  assert.equal(rows[0].placement_count, 0);
  assert.equal(rows[0].diagram_corroborated, true);
  assert.deepEqual(rows[0].diagram_cites.map((cite: any) => [cite.sheet, cite.diagram_kind]), [
    ["set.pdf#56", "control_schematic"],
    ["set.pdf#72", "piping"],
  ]);
  assert.ok(rows[0].diagram_cites.every((cite: any) => cite.schedule_binding_status === "bound"));
});

test("diagram corroboration refuses an unscoped reused tag and CSV discloses bound evidence", () => {
  const duplicateRows: Array<any> = [{
    tag: "CV-1", status: "SCHEDULE_ONLY", installed_qty: null,
    schedule_cite: { sheet: "a.pdf#10", title: "CHW CONTROL VALVE SCHEDULE" },
  }, {
    tag: "CV-1", status: "SCHEDULE_ONLY", installed_qty: null,
    schedule_cite: { sheet: "a.pdf#20", title: "HHW CONTROL VALVE SCHEDULE" },
  }];
  const controls = {
    schematics: [{
      sheet: "a.pdf#30", title: "CONTROL SCHEMATIC",
      equipment: [{ tag: "CV-1", evidence: { sheet: "a.pdf#30", text: "CV-1", bbox: [1, 2, 3, 4] }, schedule_refs: [] }],
    }],
    risers: [],
  };
  const unresolved = attachDiagramCorroboration(duplicateRows, controls) as Array<any>;
  assert.ok(unresolved.every((row) => row.diagram_corroborated === false));
  assert.ok(unresolved.every((row) => row.diagram_cites.length === 0));

  const [bound] = attachDiagramCorroboration([duplicateRows[0]], controls) as Array<any>;
  assert.equal(bound.diagram_corroborated, false, "a unique but unreferenced tag remains visible as unbound evidence");
  assert.equal(bound.diagram_cites[0].schedule_binding_status, "unbound");
  const csv = reconcileRowsToCsv([bound]);
  assert.match(csv, /Diagram corroborated,Diagram sheet\(s\),Diagram kind\(s\)/);
  assert.match(csv, /a\.pdf#30/);
  assert.match(csv, /control_schematic/);
});

test("reconcileScheduleFamilyFromGraph with sweep map", () => {
  const graph = {
    tables: [{
      kind: "equipment",
      sheet: "plan.pdf#1",
      title: { text: "VOLUME CONTROL BOX SCHEDULE" },
      rows: [
        {
          key: "VAV-1",
          identity: { text: "VAV-1" },
          cells: { MARK: { text: "VAV-1" } },
        },
      ],
    }],
  };
  const sweepByTag = new Map([
    ["VAV-1", {
      installedQty: 1,
      installedQtyBasis: "symbol_fingerprint",
      installedEvidenceGrade: "symbol_geometry",
      geometryVerified: true,
      itemStatus: "resolved",
      planCites: [{ sheet: "plan.pdf#3" }],
    }],
  ]);
  const rows = reconcileScheduleFamilyFromGraph(
    graph,
    { label: "VAV", titleRe: /VOLUME CONTROL BOX/i },
    sweepByTag,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "MATCH");
});

test("shared reconcile splits geometry matches, text fallbacks, and withheld candidates", async () => {
  const graph = { tables: [{
    kind: "equipment",
    sheet: "set.pdf#2",
    title: { text: "VAV SCHEDULE" },
    rows: [{ key: "VAV-1", cells: { MARK: { text: "VAV-1" }, QTY: { text: "2" } } }],
  }] };
  let receivedSweepOptions: any = null;
  const session = { sweepScheduleRow: async (_tag: string, options: any) => {
    receivedSweepOptions = options;
    return ({
    found: 2,
    complete: true,
    search_scope: "exhaustive",
    unlabeled_audit_complete: true,
    anchor: { grounding_basis: "symbol_fingerprint" },
    sheets: [{
      sheet: "set.pdf#5",
      matches: [
        { at: [10, 20], score: 0.98, tag_at: { x0: 1, y0: 2, x1: 3, y1: 4 } },
        { at: [30, 40], score: 1, tag_at: { x0: 5, y0: 6, x1: 7, y1: 8 }, counted_from: "explicit_label" },
      ],
      withheld: [{ at: [50, 60], score: 0.89, reason: "unlabeled geometry", hold: { kind: "unlabeled" } }],
    }],
    });
  } };
  const result = await reconcileScheduleFamilyWithSweeps(
    session,
    graph,
    { label: "VAV", titleRe: /VAV SCHEDULE/i },
    { sweepAll: true },
  );
  const [row] = result.rows;
  assert.equal(receivedSweepOptions.verifyTaggedGeometry, true);
  assert.equal(row.status, "AMBIGUOUS");
  assert.equal(row.installed_qty, null, "a mixed row has no releasable installed total");
  assert.equal(row.observed_plan_qty, 1, "verified geometry remains visible as an observation");
  assert.equal(row.tagged_plan_qty, 1);
  assert.equal(row.installed_evidence_grade, "mixed_geometry_and_tag_text");
  assert.equal(row.geometry_verified, false);
  assert.equal(row.plan_cites.length, 1);
  assert.equal(row.plan_tag_cites.length, 1);
  assert.equal(row.plan_candidate_cites.length, 1);
});

// AS-136: a row no sweep searched (outside the call's tags, or every row when
// the caller opts out of sweeping the family) read SCHEDULE_ONLY, "scheduled,
// not drawn", and the summary counted it as a finding.
test("AS-136: a family reconcile's row no sweep searched reads not searched, never SCHEDULE_ONLY", async () => {
  const graph = { tables: [{
    kind: "equipment", sheet: "set.pdf#2", title: { text: "VAV SCHEDULE" },
    rows: ["VAV-1", "VAV-2", "VAV-3"].map((m) => ({ key: m, cells: { MARK: { text: m }, QTY: { text: "1" } } })),
  }] };
  const swept: string[] = [];
  const session = { sweepScheduleRow: async (tag: string) => {
    swept.push(tag);
    if (tag === "VAV-2") throw new Error('Tag "VAV-2" is not drawn on any plan sheet.');
    return { found: 1, complete: true, search_scope: "exhaustive", unlabeled_audit_complete: true,
      anchor: { grounding_basis: "symbol_fingerprint" },
      sheets: [{ sheet: "set.pdf#5", matches: [{ at: [10, 20], score: 0.98, tag_at: { x0: 1, y0: 2, x1: 3, y1: 4 } }] }] };
  } };
  const needle = { label: "VAV", titleRe: /VAV SCHEDULE/i };
  const scoped = await reconcileScheduleFamilyWithSweeps(session, graph, needle, { tags: ["VAV-1", "VAV-2"] });
  assert.deepEqual(swept, ["VAV-1", "VAV-2"]);
  assert.deepEqual(scoped.rows.map((r: any) => [r.tag, r.status]), [["VAV-1", "MATCH"], ["VAV-2", "SCHEDULE_ONLY"], ["VAV-3", "AMBIGUOUS"]]);
  const vav3 = scoped.rows[2];
  assert.equal(vav3.installed_qty, null);
  assert.equal(vav3.plan_search_complete, null, "no search ran: not an unfinished one");
  assert.equal(vav3.scheduled_qty, 1, "the schedule side is read as before");
  assert.equal(vav3.reason, "Not searched: this reconcile did not search the plans for VAV-3, so whether it is drawn is unknown.");
  assert.deepEqual([scoped.summary.match, scoped.summary.schedule_only, scoped.summary.ambiguous], [1, 1, 1]);
  // A caller who opts out of sweeping the family: no row searched, none a finding.
  swept.length = 0;
  const optOut = await reconcileScheduleFamilyWithSweeps(session, graph, needle, { sweepAll: false });
  assert.deepEqual(swept, []);
  assert.deepEqual(optOut.rows.map((r: any) => r.status), ["AMBIGUOUS", "AMBIGUOUS", "AMBIGUOUS"]);
  assert.ok(optOut.rows.every((r: any) => r.reason.startsWith(`Not searched: this reconcile did not search the plans for ${r.tag},`)));
  assert.equal(optOut.summary.schedule_only, 0);
  // The schedule side's own reason follows.
  const unread = { tables: [{ ...graph.tables[0], rows: [{ key: "VAV-4", cells: { MARK: { text: "VAV-4" }, QTY: { text: "SEE NOTE" } } }] }] };
  const [vav4] = (await reconcileScheduleFamilyWithSweeps(session, unread, needle, { sweepAll: false })).rows;
  assert.equal(vav4.reason, 'Not searched: this reconcile did not search the plans for VAV-4, so whether it is drawn is unknown. QTY column present but unparseable ("SEE NOTE")');
  // Every row swept: as before.
  const all = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {});
  assert.deepEqual(all.rows.map((r: any) => r.status), ["MATCH", "SCHEDULE_ONLY", "MATCH"]);
  assert.ok(all.rows.every((r: any) => !/^Not searched/.test(r.reason ?? "")));
});

test("family reconciliation preserves independently reused marks by authored drawing group", () => {
  const row = () => ({
    key: "CD-1",
    cells: { MARK: { text: "CD-1" }, TYPE: { text: "3-CONE SUPPLY" } },
  });
  const graph = { tables: [
    { kind: "equipment", sheet: "set.pdf#44", drawing_group: "AIR OPS", title: { text: "GRILLE, REGISTER, AND DIFFUSER SCHEDULE" }, rows: [row()] },
    { kind: "equipment", sheet: "set.pdf#47", drawing_group: "MTRACON", title: { text: "GRILLE, REGISTER, AND DIFFUSER SCHEDULE" }, rows: [row()] },
  ] };
  const needle = { label: "GRD", titleRe: /GRILLE.*REGISTER.*DIFFUSER/i };
  // row_id is `${sheet}::${markKey(tag)}` (WP3: one identity rule) — built
  // from markKey, not a hyphen-preserving literal, so this stays correct
  // however markKey's own canonical spelling evolves.
  const sweeps = new Map([
    [`set.pdf#44::${markKey("CD-1")}`, { installedQty: 32, placementCount: 32, installedQtyBasis: "symbol_fingerprint", installedEvidenceGrade: "symbol_geometry", geometryVerified: true, itemStatus: "resolved" }],
    [`set.pdf#47::${markKey("CD-1")}`, { installedQty: 24, placementCount: 21, installedQtyBasis: "symbol_fingerprint", installedEvidenceGrade: "symbol_geometry", geometryVerified: true, itemStatus: "resolved" }],
  ]);
  const rows = reconcileScheduleFamilyFromGraph(graph, needle, sweeps);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((entry) => [entry.schedule_cite.drawing_group, entry.installed_qty]), [
    ["AIR OPS", 32], ["MTRACON", 24],
  ]);
  assert.ok(rows.every((entry) => entry.status === "MATCH"));
});

test("reconcile scaffold accepts reference-kind GRILLE SCHEDULE via row.key (compile parity)", () => {
  const graph = {
    tables: [{
      kind: "reference",
      sheet: "m.pdf#4",
      title: { text: "GRILLE SCHEDULE" },
      rows: [
        { key: "A", cells: { TYPE: { text: "SUPPLY" } } },
        { key: "B", cells: { TYPE: { text: "RETURN" } } },
      ],
    }],
  };
  const rows = reconcileScheduleFamilyFromGraph(
    graph,
    { label: "GRD", titleRe: /GRILLE\s+SCHEDULE|AIR\s+DEVICE\s+SCHEDULE/i },
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.tag).sort(), ["A", "B"]);
  assert.ok(rows.every((r) => r.status === "SCHEDULE_ONLY"));
});

test("reconcile scaffold dedupes duplicate MARK extracts (compile parity)", () => {
  const graph = {
    tables: [
      {
        kind: "equipment",
        sheet: "m.pdf#4",
        title: { text: "HEAT PUMP SCHEDULE - SPLIT SYSTEM TYPE" },
        rows: [
          { key: "HP-10", cells: { SYMBOL: { text: "HP-10" } } },
          { key: "HP-20", cells: { SYMBOL: { text: "HP-20" } } },
        ],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#4",
        title: { text: "HEAT PUMP SCHEDULE - SPLIT SYSTEM TYPE" },
        rows: [
          { key: "HP-20", cells: { SYMBOL: { text: "HP-20" } } },
        ],
      },
    ],
  };
  const rows = reconcileScheduleFamilyFromGraph(
    graph,
    { label: "HEAT_PUMP", titleRe: /HEAT\s+PUMP/i, keyRe: /(?<![C])HP/i },
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.tag).sort(), ["HP-10", "HP-20"]);
});

test("reconcile scaffold reads marks under a building token or letter, one row per unit (AS-62)", () => {
  // The compile's mark rule (markMatchesKeyRe): 1-AC-15, 40-AHU-2, 1-CP-2 and
  // HWP-A-2 are read in one of their forms, so each unit the takeoff counts
  // has its row. Such a mark adds no second row for a unit already held (the
  // untitled copy of 1-CP-1 and 1-EF-36, HWP-A-1 in a general EQUIPMENT
  // SCHEDULE); a mark read as printed keeps its row per table as before (P-1,
  // EF-2), which is the scaffold's own identity rule and not this one's.
  const table = (sheet: string, title: string, keys: string[]) => ({
    kind: "equipment", sheet, title: { text: title },
    rows: keys.map((key) => ({ key, cells: { MARK: { text: key } } })),
  });
  const graph = { tables: [
    table("m.pdf#3", "AIR HANDLING UNIT SCHEDULE", ["1-AC-15", "40-AHU-2", "AHU-3"]),
    table("m.pdf#4", "STEAM CONDENSATE PUMP SCHEDULE", ["1-CP-1"]),
    table("m.pdf#4", "HYDRONIC PUMP SCHEDULE", ["HWP-A-1", "P-1"]),
    table("m.pdf#4", "FAN SCHEDULE", ["EF-2", "1-EF-36"]),
    table("e.pdf#9", "", ["1-CP-1", "1-CP-2", "1-EF-36"]),
    table("e.pdf#10", "EQUIPMENT SCHEDULE", ["HWP-A-1", "HWP-A-2", "P-1", "EF-2"]),
  ] };
  const rowsOf = (family: string) => reconcileScheduleFamilyFromGraph(graph, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family)!)
    .map((r: any) => `${r.tag}@${r.row_id.split("::")[0]}`);
  assert.deepEqual(rowsOf("AHU"), ["1-AC-15@m.pdf#3", "40-AHU-2@m.pdf#3", "AHU-3@m.pdf#3"]);
  assert.deepEqual(rowsOf("PUMP"), [
    "1-CP-1@m.pdf#4", "HWP-A-1@m.pdf#4", "P-1@m.pdf#4",
    "1-CP-2@e.pdf#9", "HWP-A-2@e.pdf#10", "P-1@e.pdf#10",
  ]);
  assert.deepEqual(rowsOf("FAN"), ["EF-2@m.pdf#4", "1-EF-36@m.pdf#4", "EF-2@e.pdf#10"]);
});

test("reconcile scaffold reads what the compile reads under a title and in a host schedule (AS-63)", () => {
  // A CONTROL DAMPER SCHEDULE's OA-1, a FAN SCHEDULE's E-A-1 (a mark its
  // title vouches for) and 096_IN-style DOAS-1 in an air handler index (a host
  // schedule) each get their row, as the compile counts them. Read so, a mark
  // adds no row for a unit a printed listing holds: CD-1 is printed in the
  // untitled damper table, so its titled copy adds nothing and its row stays
  // there.
  const table = (sheet: string, title: string, keys: string[], extra: Record<string, string> = {}) => ({
    kind: "equipment", sheet, title: { text: title },
    rows: keys.map((key) => ({
      key, cells: { MARK: { text: key }, ...Object.fromEntries(Object.entries(extra).map(([h, text]) => [h, { text }])) },
    })),
  });
  const graph = { tables: [
    table("m.pdf#5", "CONTROL DAMPER SCHEDULE", ["CD-1", "OA-1"]),
    table("m.pdf#6", "", ["CD-1", "CD-2"], { "DAMPER SIZE": "12x12" }),
    table("m.pdf#1", "RETURN FAN SCHEDULE", ["E-A-1", "EF-1"]),
    table("m.pdf#19", "AIR HANDLING UNIT SYSTEM INDEX SCHEDULE", ["DOAS-1", "AHU-4"]),
    table("m.pdf#21", "DOAS UNIT SCHEDULE", ["DOAS-2"]),
  ] };
  const rowsOf = (family: string, g: object = graph) => reconcileScheduleFamilyFromGraph(g, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family)!)
    .map((r: any) => `${r.tag}@${r.row_id.split("::")[0]}`);
  assert.deepEqual(rowsOf("CONTROL_DAMPER"), ["OA-1@m.pdf#5", "CD-1@m.pdf#6", "CD-2@m.pdf#6"]);
  // An untitled table that prints no damper column is no damper schedule, to
  // the compile and the reconcile alike (AS-77): CD-1 is its titled listing's,
  // and CD-2 no unit.
  const marksOnly = { tables: [table("m.pdf#5", "CONTROL DAMPER SCHEDULE", ["CD-1", "OA-1"]), table("m.pdf#6", "", ["CD-1", "CD-2"])] };
  assert.deepEqual(rowsOf("CONTROL_DAMPER", marksOnly), ["CD-1@m.pdf#5", "OA-1@m.pdf#5"]);
  const compiled = compileHvacTakeoff(null, marksOnly).categories as Record<string, { items: Array<{ tag: string; sheet_id: string }> }>;
  assert.deepEqual(compiled.CONTROL_DAMPER.items.map((i) => `${i.tag}@${i.sheet_id}`), ["CD-1@m.pdf#5", "OA-1@m.pdf#5"]);
  assert.deepEqual(rowsOf("FAN"), ["E-A-1@m.pdf#1", "EF-1@m.pdf#1"]);
  assert.deepEqual(rowsOf("DOAS"), ["DOAS-2@m.pdf#21", "DOAS-1@m.pdf#19"]);
  assert.deepEqual(rowsOf("AHU"), ["AHU-4@m.pdf#19"]);
  // The host listing comes first in the same pass: the unit's row is still
  // its printed listing's, and there is one.
  const hostFirst = { tables: [
    table("m.pdf#19", "AIR HANDLING UNIT SYSTEM INDEX SCHEDULE", ["DOAS-1"]),
    table("m.pdf#22", "", ["DOAS-1"]),
  ] };
  assert.deepEqual(
    reconcileScheduleFamilyFromGraph(hostFirst, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "DOAS")!)
      .map((r: any) => `${r.tag}@${r.row_id.split("::")[0]}`),
    ["DOAS-1@m.pdf#22"],
  );
});

test("reconcile scaffold reads a building and its floor or wing before the mark, and ACCH, FCC and HUM-A under their titles, one row per unit (AS-64)", () => {
  // 036_LA's ductless split units (01-1-DAC-1, 05-B-DAC-1), 087_US's ACCH-1,
  // 028_TX's FCC1-1 and 061_IA's HUM-A get their rows, as the compile counts
  // them; an untitled copy of 01-1-DAC-1, ACCH-2 or HUM-B adds none, and a
  // temporary unit reads as no unit.
  const table = (sheet: string, title: string, keys: string[]) => ({
    kind: "equipment", sheet, title: { text: title },
    rows: keys.map((key) => ({ key, cells: { MARK: { text: key } } })),
  });
  const graph = { tables: [
    table("m.pdf#63", "DUCTLESS SPLIT SYSTEM SCHEDULE", ["01-1-DAC-1", "05-B-DAC-1", "01-1-DAC-36TEMP"]),
    table("m.pdf#2", "AIR-COOLED CHILLER SCHEDULE", ["ACCH-1"]),
    table("m.pdf#3", "CHILLED WATER FAN COIL UNIT SCHEDULE", ["FCC1-1", "FCU1-3"]),
    table("m.pdf#4", "HUMIDIFIER SCHEDULE", ["HUM-A"]),
    table("m.pdf#9", "", ["01-1-DAC-1", "ACCH-2", "HUM-B"]),
  ] };
  const rowsOf = (family: string) => reconcileScheduleFamilyFromGraph(graph, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family)!)
    .map((r: any) => `${r.tag}@${r.row_id.split("::")[0]}`);
  assert.deepEqual(rowsOf("FCU"), ["01-1-DAC-1@m.pdf#63", "05-B-DAC-1@m.pdf#63", "FCC1-1@m.pdf#3", "FCU1-3@m.pdf#3"]);
  assert.deepEqual(rowsOf("AIR_COOLED_CHILLER"), ["ACCH-1@m.pdf#2"]);
  assert.deepEqual(rowsOf("HUMIDIFIER"), ["HUM-A@m.pdf#4"]);
});

test("reconcile scaffold holds no row where the compile reads no unit: notes, lists, words and marks only a title vouches for (AS-66)", () => {
  // 061_IA's notes (SF1, SP1) and 23_GA's specialty list (T1) are reference
  // tables; 02_UT's SPF is a word; 096_IN's EG2 a grille; 016_NY's F-1 a fan
  // in a panel schedule; 047_NC's CH-1 an air-cooled chiller in an electrical
  // list; "PIPING LEGEND" a legend's heading. Each family's rows are the
  // compile's units.
  const table = (sheet: string, title: string, keys: string[], kind = "equipment") => ({
    kind, sheet, title: { text: title },
    rows: keys.map((key) => ({ key, cells: { MARK: { text: key } } })),
  });
  const graph = { tables: [
    table("s.pdf#6", "", ["SF1", "SP1"], "reference"),
    table("a.pdf#15", "SPECIALTY EQUIPMENT SCHEDULE", ["T1"], "reference"),
    table("m.pdf#3", "", ["SPF", "EG2", "F-1", "CH-1", "EF-3"]),
    table("m.pdf#10", "-CONDENSING UNIT", ["PIPING LEGEND", "CU-1"]),
    table("m.pdf#18", "", ["CP-1"]),
    // An untitled grid of valve marks keeps the word of its header shape.
    { kind: "reference", sheet: "m.pdf#9", title: { text: "" }, headers: ["TAG", "GPM", "SERVED"],
      rows: [{ key: "CV-1", cells: { TAG: { text: "CV-1" }, GPM: { text: "12" }, SERVED: { text: "AHU-1" } } }] },
  ] };
  const rowsOf = (family: string) => reconcileScheduleFamilyFromGraph(graph, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family)!)
    .map((r: any) => r.tag).sort();
  assert.deepEqual(rowsOf("FAN"), ["EF-3"]);
  assert.deepEqual(rowsOf("CHW_CONTROL_VALVE"), ["CV-1"]);
  assert.deepEqual(rowsOf("PUMP"), ["CP-1"]);
  assert.deepEqual(rowsOf("ERV"), []);
  assert.deepEqual(rowsOf("FCU"), []);
  assert.deepEqual(rowsOf("HEAT_RECOVERY_CHILLER"), []);
  assert.deepEqual(rowsOf("AIR_COOLED_CHILLER"), ["CH-1"]);
  assert.deepEqual(rowsOf("CONDENSING_UNIT"), ["CU-1"]);
  const cats = compileHvacTakeoff(null, graph).categories as Record<string, { items: Array<{ tag: string }> }>;
  for (const f of ["FAN", "PUMP", "ERV", "FCU", "HEAT_RECOVERY_CHILLER", "AIR_COOLED_CHILLER", "CONDENSING_UNIT", "CHW_CONTROL_VALVE"]) {
    assert.deepEqual(cats[f].items.map((i) => i.tag).sort(), rowsOf(f), f);
  }
});

test("reconcile scaffold reads a table titled with the family's name in words, as the compile does (AS-68)", () => {
  // 23_GA's EXHAUST FANS, 097_UT's EXF-1 under VENTILATION FANS, 009_FL's VAV
  // TERMINAL SCHEDULE, 044_NY's CONDENSATE PUMP, 061_IA's lettered AIR/DIRT
  // SEPARATOR marks; an electrical list only ending in EXHAUST FANS is none.
  const table = (sheet: string, title: string, keys: string[]) => ({
    kind: "equipment", sheet, title: { text: title },
    rows: keys.map((key) => ({ key, cells: { MARK: { text: key } } })),
  });
  const graph = { tables: [
    table("m.pdf#35", "EXHAUST FANS", ["EF-1", "EF-2"]),
    table("m.pdf#2", "VENTILATION FANS", ["EXF-1"]),
    table("m.pdf#18", "VAV TERMINAL SCHEDULE", ["VAV-1-1"]),
    table("m.pdf#24", "CONDENSATE PUMP", ["CP-1"]),
    table("m.pdf#58", "AIR/DIRT SEPARATOR SCHEDULE", ["AS-B"]),
    table("e.pdf#31", "EQUIPMENT CONNECTION SCHEDULE - EXHAUST FANS", ["EF-9"]),
  ] };
  const rowsOf = (family: string) => reconcileScheduleFamilyFromGraph(graph, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family)!)
    .map((r: any) => r.tag).sort();
  assert.deepEqual(rowsOf("FAN"), ["EF-1", "EF-2", "EXF-1"]);
  assert.deepEqual(rowsOf("VAV"), ["VAV-1-1"]);
  assert.deepEqual(rowsOf("PUMP"), ["CP-1"]);
  assert.deepEqual(rowsOf("AIR_SEPARATOR"), ["AS-B"]);
  const cats = compileHvacTakeoff(null, graph).categories as Record<string, { items: Array<{ tag: string }> }>;
  for (const f of ["FAN", "VAV", "PUMP", "AIR_SEPARATOR"]) {
    assert.deepEqual(cats[f].items.map((i) => i.tag).sort(), rowsOf(f), f);
  }
});

test("reconcile scaffold reads a fan-powered terminal unit schedule's FPB rows as VAV, as the compile does (AS-69)", () => {
  // 26_CA's FAN POWERED TERMINAL UNIT SCHEDULE (SECTION 23 36 00); an FPB row
  // in an untitled table, or in an electrical list only ending in the boxes'
  // name, is none.
  const table = (sheet: string, title: string, keys: string[]) => ({
    kind: "equipment", sheet, title: { text: title },
    rows: keys.map((key) => ({ key, cells: { DESIGNATION: { text: key } } })),
  });
  const graph = { tables: [
    table("m.pdf#10", "FAN POWERED TERMINAL UNIT SCHEDULE (SECTION 23 36 00)", ["FPB-3-11", "FPB-61-101"]),
    table("m.pdf#12", "", ["FPB-4-11"]),
    table("e.pdf#31", "EQUIPMENT CONNECTION SCHEDULE - FAN POWERED BOXES", ["FPB-5-11"]),
  ] };
  const rows = reconcileScheduleFamilyFromGraph(graph, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "VAV")!).map((r: any) => r.tag).sort();
  assert.deepEqual(rows, ["FPB-3-11", "FPB-61-101"]);
  const cats = compileHvacTakeoff(null, graph).categories as Record<string, { items: Array<{ tag: string }> }>;
  assert.deepEqual(cats.VAV.items.map((i) => i.tag).sort(), rows);
});

test("reconcile scaffold accepts MISCELLANEOUS SCHEDULE via keyRe (compile parity)", () => {
  const graph = {
    tables: [{
      kind: "equipment",
      sheet: "m.pdf#4",
      title: { text: "MISCELLANEOUS SCHEDULE" },
      rows: [
        { key: "EH-20", cells: { SYMBOL: { text: "EH-20" } } },
        { key: "DOAS-30", cells: { SYMBOL: { text: "DOAS-30" } } },
        { key: "HWP-1", cells: { SYMBOL: { text: "HWP-1" } } },
        { key: "JUNK-1", cells: { SYMBOL: { text: "JUNK-1" } } },
      ],
    }],
  };
  const uh = reconcileScheduleFamilyFromGraph(
    graph,
    { label: "UNIT_HEATER", titleRe: /UNIT HEATER SCHEDULE/i, keyRe: /^(?:UH|CUH|EH|EDH)[\s\-]?/i },
  );
  assert.deepEqual(uh.map((r) => r.tag), ["EH-20"]);
  const doas = reconcileScheduleFamilyFromGraph(
    graph,
    { label: "DOAS", titleRe: /DOAS\s+UNIT/i, keyRe: /^DOAS/i },
  );
  assert.deepEqual(doas.map((r) => r.tag), ["DOAS-30"]);
  // PUMP blankKeyRe claims hydronic marks on catch-all; junk stays out.
  const pump = reconcileScheduleFamilyFromGraph(
    graph,
    {
      label: "PUMP",
      titleRe: /PUMP SCHEDULE/i,
      blankKeyRe: /^(?:P|CP|CWP|HWP|HHWP|CHWP|CHP|HWRP|IWP|BP|SP|SCHWP|RP|PP|EP)[\s\-]?\d/i,
    },
  );
  assert.deepEqual(pump.map((r) => r.tag), ["HWP-1"]);
});

test("reconcile EQUIPMENT SCHEDULE catch-all ORs blankKeyRe|keyRe", () => {
  const graph = {
    tables: [{
      kind: "equipment",
      sheet: "m.pdf#4",
      title: { text: "EQUIPMENT SCHEDULE" },
      rows: [
        { key: "WSHP-1", cells: { MARK: { text: "WSHP-1" } } },
        { key: "HP-10", cells: { MARK: { text: "HP-10" } } },
      ],
    }],
  };
  const rows = reconcileScheduleFamilyFromGraph(
    graph,
    {
      label: "HEAT_PUMP",
      titleRe: /HEAT\s+PUMP/i,
      keyRe: /(?<![C])HP|^(?:SCU|SAC|CC|AH)[\s\-]/i,
      blankKeyRe: /^HP[\s\-]/i,
    },
  );
  assert.deepEqual(rows.map((r) => r.tag).sort(), ["HP-10", "WSHP-1"]);
});

test("reconcile HYDRONIC ACCESSORIES catch-all claims AS via keyRe", () => {
  const graph = {
    tables: [{
      kind: "equipment",
      sheet: "m.pdf#5",
      title: { text: "HYDRONIC ACCESSORIES" },
      rows: [
        { key: "AS-1", cells: { MARK: { text: "AS-1" } } },
        { key: "GMU-1", cells: { MARK: { text: "GMU-1" } } },
      ],
    }],
  };
  const rows = reconcileScheduleFamilyFromGraph(
    graph,
    { label: "AIR_SEPARATOR", titleRe: /AIR SEPARATOR SCHEDULE/i, keyRe: /^AS[\s\-]/i },
  );
  assert.deepEqual(rows.map((r) => r.tag), ["AS-1"]);
});

test("reconcileRowsToCsv emits contractor header row", () => {
  const csv = reconcileRowsToCsv([
    {
      tag: "VAV-1",
      family: "VAV",
      scheduled_qty: 1,
      installed_qty: 1,
      observed_plan_qty: 1,
      installed_qty_basis: "exact_plan_tag",
      search_scope: "tagged_only",
      unlabeled_audit_complete: false,
      plan_search_complete: true,
      status: "MATCH",
      schedule_cite: { sheet: "s.pdf#1", title: "VAV SCHEDULE" },
      plan_cites: [{ sheet: "s.pdf#2" }],
      reason: null,
    },
  ]);
  assert.match(csv, /^Tag,/);
  assert.match(csv, /VAV-1/);
  assert.match(csv, /MATCH/);
  assert.match(csv, /Installed qty basis/);
  assert.match(csv, /exact_plan_tag/);
  assert.match(csv, /tagged_only/);
  const [header, data] = csv.trim().split("\n");
  assert.equal(header.split(",").length, data.split(",").length,
    "every exported data field must align with exactly one header");
});

test("schedule_plan_reconcile intent is phrase-robust (≥5 phrasings)", () => {
  const phrases = [
    "Reconcile the VAV schedule to the plan on this blueprint set",
    "Scheduled vs installed for fan-coil units — which tags match?",
    "Which equipment is on the schedule but not drawn on these drawings?",
    "Reconcile VAVs to plan and show schedule-only mismatches",
    "Give me a scheduled vs installed reconcile table for the air terminal box schedule",
    "Show schedule-only and plan-only rows for this set's HVAC equipment",
  ];
  for (const p of phrases) {
    assert.equal(classifyTakeoffIntent(p), "schedule_plan_reconcile", p);
  }
});


test("sweepBasServedMark forwards preferTitle and classifies MATCH", async () => {
  const calls: Array<{ tag: string; opts: { preferTitle?: string } }> = [];
  const session = {
    async sweepScheduleRow(tag: string, opts: { preferTitle?: string }) {
      calls.push({ tag, opts });
      return { found: 2, sheets: [{ matches: [{}, {}] }] };
    },
  };
  const out = await sweepBasServedMark(session, "B1", {
    preferTitle: "2-STAGE, GAS FIRED FURNACE SCHEDULE",
    evaluationFast: true,
  });
  assert.equal(out.status, "MATCH");
  assert.equal(out.found, 2);
  assert.equal(calls[0].tag, "B1");
  assert.equal(calls[0].opts.preferTitle, "2-STAGE, GAS FIRED FURNACE SCHEDULE");
});

test("sweepBasServedMark maps ambiguous throw to AMBIGUOUS", async () => {
  const session = {
    async sweepScheduleRow() {
      throw new Error('Ambiguous: 3 schedule rows carry the key "B1" — the same mark defined twice cannot seed one sweep.');
    },
  };
  const out = await sweepBasServedMark(session, "B1");
  assert.equal(out.status, "AMBIGUOUS");
});

test("schedule_plan_reconcile workflow advances survey → reconcile → paint", () => {
  const goal = "Reconcile the VAV schedule to the plans on this blueprint set";
  assert.equal(classifyTakeoffIntent(goal), "schedule_plan_reconcile");
  const survey = advanceTakeoffWorkflow("schedule_plan_reconcile", [], goal);
  assert.equal(survey.phase, "survey");
  const afterGraph = advanceTakeoffWorkflow("schedule_plan_reconcile", [{
    name: "sheet_graph",
    out: { sheets: [{ key: "M-601.pdf#1", role: "plan" }] },
  }], goal);
  assert.equal(afterGraph.phase, "title_scans");
  assert.ok(afterGraph.allowedTools?.includes("reconcile_schedule_plan"));
  const afterReconcile = advanceTakeoffWorkflow("schedule_plan_reconcile", [
    { name: "sheet_graph", out: { sheets: [] } },
    {
      name: "reconcile_schedule_plan",
      out: {
        rows: [{ tag: "VAV-1", status: "MATCH", scheduled_qty: 1, installed_qty: 1 }],
        summary: { total: 1, match: 1 },
      },
    },
  ], goal);
  assert.equal(afterReconcile.phase, "paint");
});

test("reconcile scaffold holds a row for each unit of a range or pair, its QTY one each where it counts them (AS-75)", () => {
  // 26_CA's "SF-P1-4 THRU 11" and "SF-P2-1 & 2", as the compile reads them.
  const row = (key: string, qty?: string) => ({ key, cells: { MARK: { text: key }, ...(qty ? { QTY: { text: qty } } : {}) } });
  const graph = { tables: [{ kind: "equipment", sheet: "m.pdf#10", title: { text: "FAN SCHEDULE" }, headers: ["MARK", "QTY"],
    rows: [row("SF-P1-4 THRU 6"), row("SF-P2-1 & 2"), row("EF-1 THRU EF-3", "3"), row("EF-5/EF-6", "3"), row("EF-7", "2")] }] };
  const rows = reconcileScheduleFamilyFromGraph(graph, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "FAN")!) as any[];
  assert.deepEqual(rows.map((r) => r.tag).sort(), ["EF-1", "EF-2", "EF-3", "EF-5", "EF-6", "EF-7", "SF-P1-4", "SF-P1-5", "SF-P1-6", "SF-P2-1", "SF-P2-2"]);
  const by = (t: string) => rows.find((r) => r.tag === t);
  assert.equal(by("EF-3").scheduled_qty, 1);
  assert.equal(by("EF-3").scheduled_qty_basis, "printed_schedule_quantity_per_mark");
  assert.equal(by("EF-6").scheduled_qty, null);
  assert.equal(by("EF-6").scheduled_qty_basis, "printed_quantity_for_several_marks");
  assert.equal(by("EF-7").scheduled_qty, 2);
  const cats = compileHvacTakeoff(null, graph).categories as Record<string, { items: Array<{ tag: string; scheduled_qty: number | null }> }>;
  assert.deepEqual(cats.FAN.items.map((i) => `${i.tag}:${i.scheduled_qty}`).sort(), rows.map((r) => `${r.tag}:${r.scheduled_qty}`).sort());
});

// AS-77: the reconcile scaffold reads each table by the takeoff's own gate
// (familyTableGate) and marks (familyMarkRead, rowMarkText), so it holds a row
// for every unit the takeoff counts and for none it does not.
const as77Table = (sheet: string, title: string, headers: string[], rows: Array<Record<string, string>>) => ({
  kind: "equipment", sheet, title: { text: title }, headers,
  rows: rows.map((cells) => ({
    key: cells.__key ?? cells[headers[0]],
    cells: Object.fromEntries(Object.entries(cells).filter(([h]) => h !== "__key").map(([h, text]) => [h, { text }])),
  })),
});
/** Each family's marks, as the takeoff counts them and as the reconcile holds rows for them. */
const as77Marks = (graph: object) => {
  const cats = compileHvacTakeoff(null, graph).categories as Record<string, { items: Array<{ tag: string }> }>;
  const out: Record<string, { compile: string[]; reconcile: string[] }> = {};
  for (const fam of Object.keys(HVAC_FAMILY_SPECS)) {
    const compile = (cats[fam]?.items ?? []).map((i) => markKey(i.tag)).sort();
    const reconcile = (reconcileScheduleFamilyFromGraph(graph, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, fam)!) as Array<{ tag: string }>)
      .map((r) => markKey(r.tag)).sort();
    if (compile.length || reconcile.length) out[fam] = { compile, reconcile };
  }
  return out;
};
const as77Parity = (marks: ReturnType<typeof as77Marks>, what: string) => {
  for (const [fam, m] of Object.entries(marks)) assert.deepEqual(m.reconcile, m.compile, `${what}: ${fam}`);
};

test("reconcile scaffold holds each valve of a CONTROL VALVES table that names no water, under the service its table says, as the takeoff counts it (AS-77)", () => {
  // 013_MO's CONTROL VALVES prints TAG, MANUFACTURER, MODEL, SERVED, GPM and
  // SIZE and names no water: the takeoff reads its valves as chilled water's.
  const plain = { tables: [as77Table("m.pdf#20", "CONTROL VALVES", ["TAG", "MANUFACTURER", "MODEL", "SERVED", "GPM", "SIZE"], [
    { TAG: "CV-7", MANUFACTURER: "BELIMO", MODEL: "B2", SERVED: "B-1", GPM: "12", SIZE: "2\"" },
    { TAG: "CV-8", MANUFACTURER: "BELIMO", MODEL: "B2", SERVED: "B-2", GPM: "12", SIZE: "2\"" },
  ])] };
  assert.deepEqual(as77Marks(plain), { CHW_CONTROL_VALVE: { compile: ["CV7", "CV8"], reconcile: ["CV7", "CV8"] } });
  const [row] = reconcileScheduleFamilyFromGraph(plain, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "CHW_CONTROL_VALVE")!) as any[];
  assert.equal(row.schedule_cite.title, "CONTROL VALVES");
  // A header naming heating water makes it hot water's, in both.
  const hot = { tables: [as77Table("m.pdf#25", "EQUIPMENT CONTROL VALVES", ["MARK", "SERVED", "HEATING WATER GPM", "SIZE"], [
    { MARK: "CV-7", SERVED: "B-1", "HEATING WATER GPM": "12", SIZE: "2\"" },
  ])] };
  assert.deepEqual(as77Marks(hot), { HHW_CONTROL_VALVE: { compile: ["CV7"], reconcile: ["CV7"] } });
  // A table no valve mark or valve header vouches for is no valve schedule.
  const other = { tables: [as77Table("m.pdf#25", "CONTROL VALVES", ["TAG", "NOTES"], [{ TAG: "CV-7", NOTES: "SEE SPEC" }])] };
  assert.deepEqual(as77Marks(other), {});
});

test("reconcile scaffold reads a general schedule by a family's own mark rules only, as the takeoff does: 25_WA's electric heaters are no humidifiers (AS-77)", () => {
  const general = { tables: [as77Table("m.pdf#4", "MISCELLANEOUS SCHEDULE", ["SYMBOL", "TYPE", "AREA / UNIT SERVED", "ELECTRICAL WATTS"], [
    { SYMBOL: "EH-20", TYPE: "CEILING ELECTRIC HEATER", "AREA / UNIT SERVED": "MAINT OFFICE", "ELECTRICAL WATTS": "2250" },
    { SYMBOL: "EH-30", TYPE: "DUCT ELECTRIC HEATER", "AREA / UNIT SERVED": "DOAS-3", "ELECTRICAL WATTS": "2500" },
    { SYMBOL: "HUM-1", TYPE: "STEAM HUMIDIFIER", "AREA / UNIT SERVED": "AHU-1", "ELECTRICAL WATTS": "500" },
  ])] };
  const marks = as77Marks(general);
  assert.deepEqual(marks.HUMIDIFIER, { compile: ["HUM1"], reconcile: ["HUM1"] });
  as77Parity(marks, "MISCELLANEOUS SCHEDULE");
  // 043_FL's air handler "ED 203" in its MECHANICAL EQUIPMENT SCHEDULE is no damper.
  const equipment = { tables: [as77Table("m.pdf#23", "MECHANICAL EQUIPMENT SCHEDULE", ["EQUIP ID", "DESCRIPTION", "VOLTS"], [
    { "EQUIP ID": "ED 203", __key: "ED203", DESCRIPTION: "AIR HANDLING UNIT", VOLTS: "480" },
  ])] };
  assert.equal(as77Marks(equipment).CONTROL_DAMPER, undefined);
  // Under the family's alternate title the same marks are its own.
  const titled = { tables: [as77Table("m.pdf#4", "ELECTRIC HUMIDIFIER SCHEDULE", ["SYMBOL", "TYPE"], [{ SYMBOL: "EH-20", TYPE: "ELECTRIC HUMIDIFIER" }])] };
  assert.deepEqual(as77Marks(titled).HUMIDIFIER, { compile: ["EH20"], reconcile: ["EH20"] });
});

test("reconcile scaffold holds no row from a points list, which the takeoff never reads as a schedule: 017_MD's H-A-3 cites its HUMIDIFIER SCHEDULE alone (AS-77)", () => {
  const graph = { tables: [
    as77Table("m.pdf#13", "HUMIDIFIER SCHEDULE", ["TAG", "LOCATION", "TYPE"], [{ TAG: "H-A-3", LOCATION: "ACU-A-3", TYPE: "STEAM-TO-STEAM" }]),
    as77Table("m.pdf#17", "", ["DESCRIPTION", "INPUT TO DDC ANALOG TEMPERATURE", "INPUT TO DDC BINARY STATUS", "TAG"], [
      { __key: "H-A-3", DESCRIPTION: "HUMIDIFIER ENABLE", "INPUT TO DDC BINARY STATUS": "X", TAG: "H-A-3" },
    ]),
  ] };
  const rows = reconcileScheduleFamilyFromGraph(graph, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "HUMIDIFIER")!) as any[];
  assert.deepEqual(rows.map((r) => r.row_id), ["m.pdf#13::HA3"]);
  as77Parity(as77Marks(graph), "points list");
});

test("reconcile scaffold reads a row's marks from its key where its mark cell prints a comma list the key does not, as the takeoff does: 044_NY's FOP-1, 2 (AS-77)", () => {
  const graph = { tables: [as77Table("m.pdf#21", "GENERATOR FUEL OIL PUMP SCHEDULE", ["MARK", "LOCATION", "GPH"], [
    { __key: "FOP-1/FOP-2", MARK: "FOP-1, 2", LOCATION: "TANK VAULT", GPH: "757" },
  ])] };
  assert.deepEqual(as77Marks(graph).PUMP, { compile: ["FOP1", "FOP2"], reconcile: ["FOP1", "FOP2"] });
  // A key that prints the comma list too keeps the cell's text, as before.
  const both = { tables: [as77Table("m.pdf#21", "PUMP SCHEDULE", ["MARK", "GPM"], [{ __key: "P-1, 2", MARK: "P-1, 2", GPM: "40" }])] };
  as77Parity(as77Marks(both), "comma key");
});

test("reconcile scaffold reads an untitled table as a family's only where its headers fit the family, as the takeoff does (AS-77)", () => {
  // No damper, actuator, size or airflow column: OA-1 and OA-2 are outdoor
  // air units here, not dampers.
  const graph = { tables: [as77Table("m.pdf#5", "", ["MARK", "DESCRIPTION", "MANUFACTURER", "ELECTRICAL"], [
    { MARK: "OA-1", DESCRIPTION: "OUTDOOR AIR UNIT", MANUFACTURER: "ACME", ELECTRICAL: "460/3" },
    { MARK: "OA-2", DESCRIPTION: "OUTDOOR AIR UNIT", MANUFACTURER: "ACME", ELECTRICAL: "460/3" },
  ])] };
  const marks = as77Marks(graph);
  assert.equal(marks.CONTROL_DAMPER, undefined);
  assert.deepEqual(marks.OUTDOOR_AIR_UNIT, { compile: ["OA1", "OA2"], reconcile: ["OA1", "OA2"] });
  as77Parity(marks, "untitled");
});

test("reconcile scaffold and takeoff read the same marks of every family, over titles, headers and marks drafters print (AS-77)", () => {
  const titles = ["", "MISCELLANEOUS SCHEDULE", "EQUIPMENT SCHEDULE", "HYDRONIC ACCESSORIES", "CONTROL VALVES",
    "CONTROL VALVE SCHEDULE", "CHW CONTROL VALVE SCHEDULE", "HHW CONTROL VALVE SCHEDULE", "VALVE SCHEDULE",
    "FAN SCHEDULE", "PUMP SCHEDULE", "AIR HANDLING UNIT SCHEDULE", "AIR HANDLING UNIT SYSTEM INDEX", "HUMIDIFIER SCHEDULE",
    "ELECTRIC HUMIDIFIER SCHEDULE", "CONTROL DAMPER SCHEDULE", "MOTORIZED DAMPER SCHEDULE", "SPLIT SYSTEM SCHEDULE",
    "AHU-1 POINTS LIST", "VAV BOX SCHEDULE", "FAN COIL UNIT SCHEDULE", "UNIT HEATER SCHEDULE"];
  const headerSets = [["MARK", "GPM", "SIZE", "SERVED"], ["TAG", "HEATING WATER GPM", "SIZE"], ["MARK", "DESCRIPTION", "MANUFACTURER"],
    ["SYMBOL", "CFM", "DAMPER SIZE"], ["DESCRIPTION", "INPUT TO DDC ANALOG", "TAG"]];
  const markSets = [["CV-1", "CV-2"], ["EH-20", "HUM-1"], ["OA-1", "MD-1"], ["FOP-1, 2"], ["AHU-1", "DOAS-1"], ["EF-1 THRU EF-3"],
    ["V-CHW-1", "V-HHW-1"], ["P-1/P-2"], ["1-VAV-1", "FC-A-2"], ["CU-1", "HP-1"]];
  let read = 0;
  for (const title of titles) for (const headers of headerSets) for (const marks of markSets) {
    const graph = { tables: [as77Table("m.pdf#9", title, headers, marks.map((m) => ({ [headers[0]]: m, [headers[1]]: "1" })))] };
    const byFamily = as77Marks(graph);
    as77Parity(byFamily, `${title || "(untitled)"} / ${headers.join(",")} / ${marks.join(",")}`);
    read += Object.values(byFamily).reduce((n, m) => n + m.compile.length, 0);
  }
  assert.ok(read > 500, `the battery reads units (${read})`);
});

test("a valve row names its water in its own service cell; a unit's mark names none (AS-78)", () => {
  const row = (cells: Record<string, string>) => ({ cells: Object.fromEntries(Object.entries(cells).map(([h, text]) => [h, { text }])) });
  assert.equal(valveRowService(row({ SERVICE: "CHW, FC-A-2" })), "CHW");
  assert.equal(valveRowService(row({ SERVICE: "HHW, FC-A-2" })), "HHW");
  assert.equal(valveRowService(row({ "EQUIPMENT SERVED": "CROSS-TIE HHWS/R" })), "HHW");
  assert.equal(valveRowService(row({ SERVICE: "HHW/BOILER" })), "HHW");
  assert.equal(valveRowService(row({ SYSTEM: "HEATING HOT WATER" })), "HHW");
  assert.equal(valveRowService(row({ FLUID: "STEAM" })), "HHW");
  assert.equal(valveRowService(row({ SERVICE: "CHILLED WATER" })), "CHW");
  assert.equal(valveRowService(row({ SERVICE: "CHWR" })), "CHW");
  // A pump's or a unit's mark, both waters, a cell no service column holds,
  // or a fluid that names neither: no water.
  assert.equal(valveRowService(row({ SERVED: "CHWP-1" })), null);
  assert.equal(valveRowService(row({ SERVED: "HWP-2" })), null);
  assert.equal(valveRowService(row({ SERVICE: "CHW/HHW CHANGEOVER" })), null);
  assert.equal(valveRowService(row({ REMARKS: "SEE CHW RISER" })), null);
  assert.equal(valveRowService(row({ FLUID: "WATER" })), null);
});

test("a valve table whose title names no water is read by the water its rows print, row by row where they print both, in the takeoff and the reconcile alike (AS-78)", () => {
  // 072_CA's and 074_CA's EQUIPMENT CONTROL VALVES print SERVICE "CHW, FC-A-2"
  // and "HHW, FC-A-2" row by row; CV-HC-FC-A-8's prints CHW, and is read as
  // printed. A row that prints no water is the table's, by its marks.
  const mixed = { tables: [as77Table("m.pdf#26", "EQUIPMENT CONTROL VALVES", ["MARK", "MANUFACTURER & MODEL", "SERVICE", "FLOW RATE [GPM]", "VALVE CV"], [
    { MARK: "CV-CC-FC-A-2", "MANUFACTURER & MODEL": "BELIMO B209", SERVICE: "CHW, FC-A-2", "FLOW RATE [GPM]": "1.3", "VALVE CV": "0.8" },
    { MARK: "CV-HC-FC-A-2", "MANUFACTURER & MODEL": "BELIMO B208", SERVICE: "HHW, FC-A-2", "FLOW RATE [GPM]": "0.6", "VALVE CV": "0.46" },
    { MARK: "CV-HC-FC-A-8", "MANUFACTURER & MODEL": "BELIMO B209", SERVICE: "CHW, EV-A-8", "FLOW RATE [GPM]": "1.2", "VALVE CV": "0.8" },
    { MARK: "CV-9", "MANUFACTURER & MODEL": "BELIMO B209", SERVICE: "-", "FLOW RATE [GPM]": "1.0", "VALVE CV": "0.8" },
  ])] };
  assert.deepEqual(as77Marks(mixed), {
    CHW_CONTROL_VALVE: { compile: ["CV9", "CVCCFCA2", "CVHCFCA8"], reconcile: ["CV9", "CVCCFCA2", "CVHCFCA8"] },
    HHW_CONTROL_VALVE: { compile: ["CVHCFCA2"], reconcile: ["CVHCFCA2"] },
  });
  // 013_MO's CONTROL VALVES: the one row that names a water ("CROSS-TIE
  // HHWS/R") names the table's, as its SERVICE column, lost to the
  // extraction, prints HHW/BOILER on every row.
  const one = { tables: [as77Table("m.pdf#20", "CONTROL VALVES", ["TAG", "MANUFACTURER", "MODEL", "SERVED", "GPM", "SIZE"], [
    { TAG: "CV-7", MANUFACTURER: "CSC", MODEL: "NIBCO/BELIMO", SERVED: "B-001 THRU 006", GPM: "-", SIZE: "4\"" },
    { TAG: "CV-11", MANUFACTURER: "CSC", MODEL: "NIBCO/BELIMO", SERVED: "CROSS-TIE HHWS/R", GPM: "-", SIZE: "8\"" },
  ])] };
  assert.deepEqual(as77Marks(one), { HHW_CONTROL_VALVE: { compile: ["CV11", "CV7"], reconcile: ["CV11", "CV7"] } });
  // A header that names the water still decides the whole table.
  const header = { tables: [as77Table("m.pdf#20", "CONTROL VALVES", ["TAG", "HHW GPM", "SERVICE"], [
    { TAG: "CV-1", "HHW GPM": "4", SERVICE: "CHW" }, { TAG: "CV-2", "HHW GPM": "4", SERVICE: "HHW" },
  ])] };
  assert.deepEqual(as77Marks(header), { HHW_CONTROL_VALVE: { compile: ["CV1", "CV2"], reconcile: ["CV1", "CV2"] } });
  // Rows that serve pumps name no water: the table's marks decide, chilled.
  const pumps = { tables: [as77Table("m.pdf#20", "CONTROL VALVES", ["TAG", "SERVED", "GPM"], [
    { TAG: "CV-1", SERVED: "CHWP-1", GPM: "40" }, { TAG: "CV-2", SERVED: "HWP-2", GPM: "30" },
  ])] };
  assert.deepEqual(as77Marks(pumps), { CHW_CONTROL_VALVE: { compile: ["CV1", "CV2"], reconcile: ["CV1", "CV2"] } });
  // A title that names the water is the family's own, whatever a row prints.
  const titled = { tables: [as77Table("m.pdf#20", "CHW CONTROL VALVE SCHEDULE", ["VALVE MARK", "SERVICE", "GPM"], [
    { "VALVE MARK": "CV-1", SERVICE: "HHW", GPM: "4" },
  ])] };
  assert.deepEqual(as77Marks(titled).CHW_CONTROL_VALVE, { compile: ["CV1"], reconcile: ["CV1"] });
  assert.equal(as77Marks(titled).HHW_CONTROL_VALVE, undefined);
});

// AS-79: the takeoff and the reconcile name a row's unit by one rule
// (rowIdentityText). A row printing both a UNIT MARK and a VALVE MARK is its
// UNIT MARK's unit in a table titled as a family of units (or another
// family's schedule that lists them), and a valve anywhere else and to a
// valve's family, whichever column the drafter put first.
const as79Rows = [
  { unit: "FCU-A2", valve: "CV-FCU-A2-HHW", gpm: "3" },
  { unit: "UH-B1", valve: "CV-UH-B1-HHW", gpm: "2" },
  { unit: "CUH-A1", valve: "CV-CUH-A1-HHW", gpm: "2" },
];
const as79Graph = (title: string, valveFirst: boolean, rows = as79Rows) => {
  const headers = valveFirst ? ["VALVE MARK", "UNIT MARK", "GPM"] : ["UNIT MARK", "VALVE MARK", "GPM"];
  return { tables: [as77Table("m.pdf#12", title, headers, rows.map((r) => (valveFirst
    ? { "VALVE MARK": r.valve, "UNIT MARK": r.unit, GPM: r.gpm }
    : { "UNIT MARK": r.unit, "VALVE MARK": r.valve, GPM: r.gpm })))] };
};

test("a row printing both a UNIT MARK and a VALVE MARK names its unit by the family reading it, never by their column order (AS-79)", () => {
  // A family of units reads the UNIT MARK under its own title, or another
  // family's schedule that lists its units; a valve's, a damper's or an air
  // valve's family never does; nor does any family where no title vouches.
  const gate = (g: Record<string, boolean>) => ({ titleOk: false, altOk: false, hostOk: false, ...g });
  assert.equal(familyReadsUnitMark(gate({ titleOk: true }), "FCU"), true);
  assert.equal(familyReadsUnitMark(gate({ altOk: true }), "CONDENSING_UNIT"), true);
  assert.equal(familyReadsUnitMark(gate({ hostOk: true }), "FCU"), true);
  assert.equal(familyReadsUnitMark(gate({}), "FCU"), false);
  for (const valves of ["ISOLATION_VALVE", "CHW_CONTROL_VALVE", "MIXING_VALVE", "CONTROL_DAMPER", "LAB_AIR_VALVE"]) {
    assert.equal(familyReadsUnitMark(gate({ titleOk: true, altOk: true }), valves), false, valves);
  }
  const row = (cells: Record<string, string>, key?: string) => ({
    key: key ?? Object.values(cells)[0],
    cells: Object.fromEntries(Object.entries(cells).map(([h, text]) => [h, { text }])),
  });
  const unitFirst = row({ "UNIT MARK": "FCU-A2", "VALVE MARK": "CV-FCU-A2-HHW", GPM: "3" });
  const valveFirst = row({ "VALVE MARK": "CV-FCU-A2-HHW", "UNIT MARK": "FCU-A2", GPM: "3" });
  for (const r of [unitFirst, valveFirst]) {
    assert.equal(rowIdentityText(r, { unitMark: true }), "FCU-A2");
    assert.equal(rowIdentityText(r, { unitMark: false }), "CV-FCU-A2-HHW");
    assert.equal(rowIdentityText(r), "CV-FCU-A2-HHW");
    // A control valve family's own identity column wins wherever it reads the row.
    assert.equal(rowIdentityText(r, { unitMark: true, identityHeaderRe: /VALVE\s*MARK/i }), "CV-FCU-A2-HHW");
  }
  // Negative controls: a row printing one of them, or a MARK before them,
  // reads as it always has, whichever the family.
  for (const unitMark of [true, false]) {
    assert.equal(rowIdentityText(row({ "UNIT MARK": "FCU-A2", GPM: "3" }), { unitMark }), "FCU-A2");
    assert.equal(rowIdentityText(row({ "VALVE MARK": "CV-1", GPM: "3" }), { unitMark }), "CV-1");
    assert.equal(rowIdentityText(row({ MARK: "FCU-3", "UNIT MARK": "FCU-A2", "VALVE MARK": "CV-1" }), { unitMark }), "FCU-3");
    assert.equal(rowIdentityText(row({ "EQUIP. TAG": "\"EF-1\"", CFM: "500" }), { unitMark }), "EF-1");
    assert.equal(rowIdentityText(row({ TAG: "RF-1 & 2", CFM: "900" }, "RF-12"), { unitMark }), "RF-1 & 2");
    assert.equal(rowIdentityText(row({ TAG: "1S", CFM: "200" }, "EF-3"), { unitMark }), "EF-3");
  }
  // The row's own mark column, empty, leaves its key, in either order.
  assert.equal(rowIdentityText(row({ "UNIT MARK": "", "VALVE MARK": "CV-9" }, "K-1"), { unitMark: true }), "K-1");
  assert.equal(rowIdentityText(row({ "VALVE MARK": "", "UNIT MARK": "FCU-9" }, "K-2"), { unitMark: false }), "K-2");
  // The extraction's identity is not a second rule: the row reads by its key
  // and mark columns, in the reconcile as in the takeoff.
  const withIdentity = { key: "EF-6", identity: { text: "EF-7" }, cells: { CFM: { text: "300" } } };
  assert.equal(rowIdentityText(withIdentity), "EF-6");
  const fans = { tables: [{ kind: "equipment", sheet: "m.pdf#3", title: { text: "FAN SCHEDULE" }, headers: ["CFM"], rows: [withIdentity] }] };
  assert.deepEqual(as77Marks(fans).FAN, { compile: ["EF6"], reconcile: ["EF6"] });
});

test("a valve's own mark is its VALVE MARK where a UNIT MARK leads the row: its table holds valves, of the water the mark names (AS-79)", () => {
  for (const valveFirst of [false, true]) {
    const table = as79Graph("", valveFirst).tables[0];
    assert.equal(hasValveOrDamperMark(table), true, `valve first ${valveFirst}`);
    assert.equal(inferValveServiceFromTable(table), "HHW", `valve first ${valveFirst}`);
  }
  // Negative controls: a unit schedule holds no valve; a table printing no
  // VALVE MARK reads its key as before.
  const units = as77Table("m.pdf#12", "", ["UNIT MARK", "GPM"], [{ "UNIT MARK": "FCU-A2", GPM: "3" }]);
  assert.equal(hasValveOrDamperMark(units), false);
  const keyed = as77Table("m.pdf#12", "", ["TAG", "GPM"], [{ TAG: "CV-CHW-1", GPM: "3" }]);
  assert.equal(hasValveOrDamperMark(keyed), true);
  assert.equal(inferValveServiceFromTable(keyed), "CHW");
});

test("the takeoff and the reconcile read the same units from a table printing UNIT MARK and VALVE MARK, in either column order: no fan coil or unit heater from a valve grid, no valve counted twice (AS-79)", () => {
  const hhw = { compile: ["CVCUHA1HHW", "CVFCUA2HHW", "CVUHB1HHW"], reconcile: ["CVCUHA1HHW", "CVFCUA2HHW", "CVUHB1HHW"] };
  const expected: Record<string, ReturnType<typeof as77Marks>> = {
    "FAN COIL UNIT SCHEDULE": { FCU: { compile: ["FCUA2"], reconcile: ["FCUA2"] } },
    "UNIT HEATER SCHEDULE": { UNIT_HEATER: { compile: ["CUHA1", "UHB1"], reconcile: ["CUHA1", "UHB1"] } },
    "HHW CONTROL VALVE SCHEDULE": { HHW_CONTROL_VALVE: hhw },
    "CONTROL VALVE SCHEDULE": { HHW_CONTROL_VALVE: hhw },
    "": { HHW_CONTROL_VALVE: hhw },
  };
  for (const [title, marks] of Object.entries(expected)) {
    for (const valveFirst of [false, true]) {
      assert.deepEqual(as77Marks(as79Graph(title, valveFirst)), marks, `${title || "(untitled)"}, valve first ${valveFirst}`);
    }
  }
  // Another family's schedule that lists the family's units (a split system
  // air handler's FCU-1), and a title the family reads by its other name (a
  // split system's CU-1), are the unit's own too; a valve family's own
  // schedule is the valve's, the chiller it isolates its UNIT MARK.
  for (const valveFirst of [false, true]) {
    assert.deepEqual(as77Marks(as79Graph("ISOLATION VALVE SCHEDULE", valveFirst, [{ unit: "CH-1", valve: "IV-1", gpm: "400" }])),
      { ISOLATION_VALVE: { compile: ["IV1"], reconcile: ["IV1"] } }, `valve family, valve first ${valveFirst}`);
    assert.deepEqual(as77Marks(as79Graph("SPLIT SYSTEM AIR HANDLER SCHEDULE", valveFirst, [{ unit: "FCU-1", valve: "CV-FCU-1-HHW", gpm: "2" }])),
      { FCU: { compile: ["FCU1"], reconcile: ["FCU1"] } }, `host, valve first ${valveFirst}`);
    assert.deepEqual(as77Marks(as79Graph("SPLIT SYSTEM AIR CONDITIONING SCHEDULE", valveFirst, [{ unit: "CU-1", valve: "CV-CU-1", gpm: "2" }])),
      { CONDENSING_UNIT: { compile: ["CU1"], reconcile: ["CU1"] } }, `other title, valve first ${valveFirst}`);
  }
  // Over every title the AS-77 battery prints, both orders read alike, and
  // the reconcile holds a row for each unit the takeoff counts.
  const titles = ["", "MISCELLANEOUS SCHEDULE", "EQUIPMENT SCHEDULE", "HYDRONIC ACCESSORIES", "CONTROL VALVES",
    "CONTROL VALVE SCHEDULE", "CHW CONTROL VALVE SCHEDULE", "HHW CONTROL VALVE SCHEDULE", "VALVE SCHEDULE",
    "FAN SCHEDULE", "PUMP SCHEDULE", "AIR HANDLING UNIT SCHEDULE", "VAV BOX SCHEDULE", "FAN COIL UNIT SCHEDULE",
    "UNIT HEATER SCHEDULE", "CABINET UNIT HEATER SCHEDULE", "ISOLATION VALVE SCHEDULE", "MIXING VALVE SCHEDULE",
    "PRESSURE REDUCING VALVE SCHEDULE", "BYPASS CONTROL VALVE SCHEDULE", "CONTROL DAMPER SCHEDULE"];
  for (const title of titles) {
    const unitFirst = as77Marks(as79Graph(title, false));
    as77Parity(unitFirst, `${title || "(untitled)"}, unit first`);
    assert.deepEqual(as77Marks(as79Graph(title, true)), unitFirst, `${title || "(untitled)"}: column order`);
  }
});

// AS-80: a table whose title names two families gives a row to the family
// whose own mark rule reads it, not also to the one whose title alone vouches.
const as80Headers = ["PLAN MARK", "MODEL NUMBER", "CLNG CAP. MBH", "HTNG CAP. MBH", "HTNG COP"];
const as80Row = (mark: string) => ({ "PLAN MARK": mark, "MODEL NUMBER": "TWA09043D", "CLNG CAP. MBH": "90", "HTNG CAP. MBH": "78.6", "HTNG COP": "3.3" });

test("a row of a table titled for two families is the unit of the family whose own mark rule reads it, not the other's by the title alone: 089_FL's HP-2 is a heat pump (AS-80)", () => {
  // 089_FL's OUTDOOR AIR-COOLED HEAT PUMP OR CONDENSING UNIT SCHEDULE prints
  // one row, HP-2, with a heating capacity and COP: a heat pump, as its key
  // reads it. CONDENSING_UNIT reads its primary title's rows by the title
  // alone, and counted HP-2 a second time.
  const combined = { tables: [as77Table("m.pdf#136", "OUTDOOR AIR-COOLED HEAT PUMP OR CONDENSING UNIT SCHEDULE", as80Headers, [as80Row("HP-2")])] };
  assert.deepEqual(as77Marks(combined), { HEAT_PUMP: { compile: ["HP2"], reconcile: ["HP2"] } });
  // A condensing unit's own mark stays its, a mark neither family's rule
  // reads stays the title's, and a mark both families' own rules read is
  // both families' (as before).
  const rows = { tables: [as77Table("m.pdf#136", "OUTDOOR AIR-COOLED HEAT PUMP OR CONDENSING UNIT SCHEDULE", as80Headers,
    ["HP-2", "CU-1", "AC-1", "CU-HP1"].map(as80Row))] };
  assert.deepEqual(as77Marks(rows), {
    CONDENSING_UNIT: { compile: ["AC1", "CU1", "CUHP1"], reconcile: ["AC1", "CU1", "CUHP1"] },
    HEAT_PUMP: { compile: ["CUHP1", "HP2"], reconcile: ["CUHP1", "HP2"] },
  });
  // A mark the other family reads only under its own title is no claim: FCU
  // reads F-1 only under its titles, so a furnace schedule's F-1 stays the
  // furnace's where a ductless split system shares the title, and the split
  // system's DCU-1 is the condensing unit's alone.
  const furnace = as77Marks({ tables: [as77Table("m.pdf#7", "GAS-FIRED FURNACE AND DUCTLESS SPLIT SCHEDULE", ["MARK", "MBH", "CFM"], [
    { MARK: "F-1", MBH: "60", CFM: "1200" }, { MARK: "DCU-1", MBH: "24", CFM: "800" },
  ])] });
  as77Parity(furnace, "furnace and ductless split");
  assert.deepEqual(furnace.FURNACE, { compile: ["F1"], reconcile: ["F1"] });
  assert.deepEqual(furnace.CONDENSING_UNIT, { compile: ["DCU1"], reconcile: ["DCU1"] });
  // The other family's rule claims a mark in its forms too (a building's
  // 1-FCU-1 is FCU-1), never one it reads only under its own title (F-2).
  const fanCoils = as77Marks({ tables: [as77Table("m.pdf#8", "GAS-FIRED FURNACE AND FAN COIL UNIT SCHEDULE", ["MARK", "MBH", "CFM"], [
    { MARK: "1-F-1", MBH: "60", CFM: "1200" }, { MARK: "1-FCU-1", MBH: "12", CFM: "400" }, { MARK: "F-2", MBH: "60", CFM: "1200" },
  ])] });
  as77Parity(fanCoils, "furnace and fan coil");
  assert.deepEqual(fanCoils.FURNACE, { compile: ["1F1", "F2"], reconcile: ["1F1", "F2"] });
  assert.ok(fanCoils.FCU.compile.includes("1FCU1"));
  // The gate names the other families' rules only where the family reads its
  // rows by the title alone, and only for a family the specs name.
  const view = scheduleTableView(combined.tables[0]);
  assert.equal(familyTableGate(view, HVAC_FAMILY_SPECS.CONDENSING_UNIT, "CONDENSING_UNIT")!.coTitled.length, 1);
  assert.deepEqual(familyTableGate(view, HVAC_FAMILY_SPECS.CONDENSING_UNIT)!.coTitled, []);
  assert.deepEqual(familyTableGate(view, HVAC_FAMILY_SPECS.HEAT_PUMP, "HEAT_PUMP")!.coTitled, []);
  const twoRules = scheduleTableView(as77Table("m.pdf#9", "FAN COIL AND HEAT PUMP SCHEDULE", ["MARK", "MBH"], [{ MARK: "FCU-1", MBH: "12" }]));
  assert.deepEqual(familyTableGate(twoRules, HVAC_FAMILY_SPECS.HEAT_PUMP, "HEAT_PUMP")!.coTitled, []);
});

test("a title that names one family keeps every row it vouches for, and a reconcile needle the specs do not name reads as before (AS-80)", () => {
  const single = { tables: [as77Table("m.pdf#5", "CONDENSING UNIT SCHEDULE", as80Headers, [as80Row("HP-2")])] };
  assert.deepEqual(as77Marks(single), { CONDENSING_UNIT: { compile: ["HP2"], reconcile: ["HP2"] } });
  const split = { tables: [as77Table("m.pdf#14", "SPLIT SYSTEM AIR CONDITIONING UNIT SCHEDULE", ["MARK", "CFM", "MBH"], [
    { MARK: "FC-1, CU-1", CFM: "800", MBH: "24" },
  ])] };
  const splitMarks = as77Marks(split);
  as77Parity(splitMarks, "split system");
  assert.deepEqual(splitMarks.CONDENSING_UNIT?.compile, ["CU1"]);
  const combined = { tables: [as77Table("m.pdf#136", "OUTDOOR AIR-COOLED HEAT PUMP OR CONDENSING UNIT SCHEDULE", as80Headers, [as80Row("HP-2")])] };
  const custom = reconcileScheduleFamilyFromGraph(combined, { label: "Outdoor units", titleRe: /CONDENSING\s+UNIT/i }) as Array<{ tag: string }>;
  assert.deepEqual(custom.map((r) => r.tag), ["HP-2"]);
});

// AS-81: a row a title alone vouches for, named by words (the room and the
// air it serves), is one line: its slash lists no marks.
const as81Headers = ["QTY.", "LOCATION & SERVES", "AIR FLOW (CFM)"];
// 028_TX's NOISE CONTROL DUCT SILENCER SCHEDULE, as the sheet graph keys its
// rows (the location, and the airflow where two rows share one).
const as81Rows = [
  ["2", "GROUP REHEARSAL 123 - SUPPLY/RETURN", "745"], ["1", "GROUP REHEARSAL 123 - RETURN", "160"],
  ["2", "GROUP REHEARSAL 112/111 - SUPPLY/RETURN", "535"], ["1", "GROUP REHEARSAL 112/113 - RETURN", "385"],
  ["1", "GROUP REHEARSAL 114/113 - SUPPLY", "245"], ["2", "ROCK REHEARSAL 218 - SUPPLY/RETURN", "540"],
  ["2", "VEST 212 - SUPPLY/RETURN", "330"],
].map(([qty, where, cfm]) => ({ __key: `${where} ${cfm}`, "QTY.": qty, "LOCATION & SERVES": where, "AIR FLOW (CFM)": cfm }));
const as81Graph = (rows = as81Rows) => ({ tables: [as77Table("m.pdf#41", "NOISE CONTROL DUCT SILENCER SCHEDULE", as81Headers, rows)] });
const as81Silencers = (graph: object) => {
  const items = (compileHvacTakeoff(null, graph).categories as Record<string, { items: Array<{ tag: string; scheduled_qty: number | null }> }>).DUCT_SILENCER.items;
  const rows = reconcileScheduleFamilyFromGraph(graph, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "DUCT_SILENCER")!) as Array<{ tag: string; scheduled_qty: number | null }>;
  const view = (xs: Array<{ tag: string; scheduled_qty: number | null }>) => xs.map((x) => `${x.tag}=${x.scheduled_qty}`).sort();
  return { compile: view(items), reconcile: view(rows) };
};

test("a silencer schedule whose rows are named by the room and air they serve reads each row as one line, its QTY its silencers: 028_TX (AS-81)", () => {
  const read = as81Silencers(as81Graph());
  assert.deepEqual(read.compile, [
    "GROUP REHEARSAL 112/111 - SUPPLY/RETURN 535=2", "GROUP REHEARSAL 112/113 - RETURN 385=1",
    "GROUP REHEARSAL 114/113 - SUPPLY 245=1", "GROUP REHEARSAL 123 - RETURN 160=1",
    "GROUP REHEARSAL 123 - SUPPLY/RETURN 745=2", "ROCK REHEARSAL 218 - SUPPLY/RETURN 540=2", "VEST 212=2",
  ]);
  assert.deepEqual(read.reconcile, read.compile);
  // Every row order reads alike, in the takeoff and the reconcile.
  for (const order of [[6, 5, 4, 3, 2, 1, 0], [2, 0, 6, 1, 5, 3, 4]]) {
    assert.deepEqual(as81Silencers(as81Graph(order.map((i) => as81Rows[i]))), read);
  }
  const gate = familyTableGate(scheduleTableView(as81Graph().tables[0]), HVAC_FAMILY_SPECS.DUCT_SILENCER, "DUCT_SILENCER")!;
  assert.equal(gate.wordsNamed, true);
});

test("a row's slash lists marks unless the row is named by words, where a title alone vouches for it (AS-81)", () => {
  // Named by words: one line, in a reading no mark rule filters.
  assert.deepEqual(splitRowMarks("GROUP REHEARSAL 112/111 - SUPPLY/RETURN 535", false), ["GROUP REHEARSAL 112/111 - SUPPLY/RETURN 535"]);
  assert.deepEqual(splitRowMarks("VEST 212 - SUPPLY/RETURN 330", false, true), ["VEST 212 - SUPPLY/RETURN 330"]);
  // Marks, and a mark with words after it, a building's or a coded one: split as before.
  assert.deepEqual(splitRowMarks("EF-1/EF-2", false), ["EF-1", "EF-2"]);
  assert.deepEqual(splitRowMarks("AHU-1/HP-1", false), ["AHU-1", "HP-1"]);
  assert.deepEqual(splitRowMarks("RTU-1 (ALT#2)/RTU-2", false), ["RTU-1 (ALT#2)", "RTU-2"]);
  assert.deepEqual(splitRowMarks("1-VAV-1/1-VAV-2", false), ["1-VAV-1", "1-VAV-2"]);
  assert.deepEqual(splitRowMarks("CV-CHW-BP-A/CV-CHW-BP-B", false), ["CV-CHW-BP-A", "CV-CHW-BP-B"]);
  assert.deepEqual(splitRowMarks("HHW-PUMP-1/HHW-PUMP-2", false), ["HHW-PUMP-1", "HHW-PUMP-2"]);
  assert.deepEqual(splitRowMarks("VEST 212 - SUPPLY/RETURN 330", false), ["VEST 212 - SUPPLY", "RETURN 330"]);
  // Where a mark rule filters the rows, it reads each piece, as before.
  assert.deepEqual(splitRowMarks("GROUP REHEARSAL 112/111 - SUPPLY", true), ["GROUP REHEARSAL 112", "111 - SUPPLY"]);
  assert.deepEqual(splitRowMarks("GROUP REHEARSAL 112/111 - SUPPLY", true, true), ["GROUP REHEARSAL 112", "111 - SUPPLY"]);
  // A table of marks is no table named by words; a mark rule's reading never is.
  const fans = scheduleTableView(as77Table("m.pdf#3", "FAN SCHEDULE", ["MARK", "CFM"], [
    { MARK: "EF-1/EF-2", CFM: "400" }, { MARK: "EF-3", CFM: "300" }, { MARK: "GENERAL EXHAUST/RELIEF", CFM: "900" },
  ]));
  assert.equal(familyTableGate(fans, HVAC_FAMILY_SPECS.FAN, "FAN")!.wordsNamed, false);
  assert.deepEqual(as77Marks({ tables: [fans] }).FAN, { compile: ["EF1", "EF2", "EF3"], reconcile: ["EF1", "EF2", "EF3"] });
  const exhausts = scheduleTableView(as77Table("m.pdf#3", "FAN SCHEDULE", ["MARK", "CFM"], [
    { MARK: "GENERAL EXHAUST/EF-1", CFM: "400" }, { MARK: "TOILET EXHAUST/EF-2", CFM: "300" },
  ]));
  assert.equal(familyTableGate(exhausts, HVAC_FAMILY_SPECS.FAN, "FAN")!.wordsNamed, false);
  assert.deepEqual(as77Marks({ tables: [exhausts] }).FAN, { compile: ["EF1", "EF2"], reconcile: ["EF1", "EF2"] });
  const general = scheduleTableView(as77Table("m.pdf#3", "EQUIPMENT SCHEDULE", ["MARK", "CFM"], [
    { MARK: "BOILER ROOM EXHAUST/EF-9", CFM: "400" }, { MARK: "TOILET ROOM EXHAUST/EF-8", CFM: "300" },
  ]));
  assert.equal(familyTableGate(general, HVAC_FAMILY_SPECS.FAN, "FAN")!.wordsNamed, false);
  assert.deepEqual(as77Marks({ tables: [general] }).FAN, { compile: ["EF8", "EF9"], reconcile: ["EF8", "EF9"] });
});

test("a table is named by words where most rows' names, read as the family reads them, are words; a slash between bare marks always lists marks (AS-81)", () => {
  const silencers = (headers: string[], rows: Array<Record<string, string>>) =>
    ({ tables: [as77Table("m.pdf#41", "NOISE CONTROL DUCT SILENCER SCHEDULE", headers, rows)] });
  const gateOf = (graph: { tables: Array<Parameters<typeof scheduleTableView>[0]> }) =>
    familyTableGate(scheduleTableView(graph.tables[0]), HVAC_FAMILY_SPECS.DUCT_SILENCER, "DUCT_SILENCER")!;
  // Keyed by its rooms, its MARK column listing marks: the marks name the
  // rows, so it is no table named by words and SL-1 (ALT)/SL-2 is two.
  const marked = silencers(["LOCATION", "MARK", "QTY."], [
    { LOCATION: "GROUP REHEARSAL 123", MARK: "SL-1 (ALT)/SL-2", "QTY.": "2" },
    { LOCATION: "ROCK REHEARSAL 218", MARK: "SL-3", "QTY.": "1" },
    { LOCATION: "BAND ROOM 101", MARK: "SL-4", "QTY.": "1" },
  ]);
  assert.equal(gateOf(marked).wordsNamed, false);
  assert.deepEqual(as77Marks(marked).DUCT_SILENCER, { compile: ["SL1", "SL2", "SL3", "SL4"], reconcile: ["SL1", "SL2", "SL3", "SL4"] });
  // One row named by words beside one of marks is no majority.
  const tie = silencers(["LOCATION & SERVES", "QTY."], [
    { "LOCATION & SERVES": "GROUP REHEARSAL 123 - SUPPLY/RETURN", "QTY.": "2" },
    { "LOCATION & SERVES": "SL-5 (ALT)/SL-6", "QTY.": "2" },
  ]);
  assert.equal(gateOf(tie).wordsNamed, false);
  assert.deepEqual(as81Silencers(tie), {
    compile: ["GROUP REHEARSAL 123 - SUPPLY/RETURN=2", "SL-5=1", "SL-6=1"],
    reconcile: ["GROUP REHEARSAL 123 - SUPPLY/RETURN=2", "SL-5=1", "SL-6=1"],
  });
  // Among 028_TX's rows, a row of bare marks lists them, and a row of words
  // alone (SUPPLY/RETURN) is one line.
  const mixed = as81Graph([
    ...as81Rows,
    { __key: "SL-7/SL-8", "QTY.": "2", "LOCATION & SERVES": "SL-7/SL-8", "AIR FLOW (CFM)": "300" },
    { __key: "SUPPLY/RETURN", "QTY.": "2", "LOCATION & SERVES": "SUPPLY/RETURN", "AIR FLOW (CFM)": "300" },
  ]);
  assert.equal(gateOf(mixed).wordsNamed, true);
  const read = as81Silencers(mixed);
  assert.deepEqual(read.compile.filter((t) => /^S[LU]/.test(t)), ["SL-7=1", "SL-8=1", "SUPPLY/RETURN=2"]);
  assert.ok(read.compile.includes("VEST 212=2"));
  assert.deepEqual(read.reconcile, read.compile);
  for (const [text, pieces] of [
    ["SL-7/SL-8", ["SL-7", "SL-8"]], ["AHU 1/AHU 2", ["AHU 1", "AHU 2"]], ["1-VAV-1/1-VAV-2", ["1-VAV-1", "1-VAV-2"]],
    ["RTU-G/RTU-H", ["RTU-G", "RTU-H"]], ["CV-CHW-BP-A/CV-CHW-BP-B", ["CV-CHW-BP-A", "CV-CHW-BP-B"]], ["B1/B2", ["B1", "B2"]],
    ["SUPPLY/RETURN", ["SUPPLY/RETURN"]], ["VEST 212 - SUPPLY/RETURN 330", ["VEST 212 - SUPPLY/RETURN 330"]],
    ["SL-9 (ALT)/SL-10", ["SL-9 (ALT)", "SL-10"]], ["(N)SL-1/(N)SL-2", ["(N)SL-1", "(N)SL-2"]],
    ["GENERAL EXHAUST/EF-1", ["GENERAL EXHAUST", "EF-1"]], ["GENERAL EXHAUST/(N)EF-1", ["GENERAL EXHAUST", "(N)EF-1"]],
    ["OFFICE WING 101/101A - SUPPLY", ["OFFICE WING 101/101A - SUPPLY"]], ["OFFICE WING 101/101A", ["OFFICE WING 101/101A"]],
    ["GROUP REHEARSAL 112/111", ["GROUP REHEARSAL 112/111"]],
  ] as Array<[string, string[]]>) {
    assert.deepEqual(splitRowMarks(text, false, true), pieces, text);
  }
  // A row led by a coded mark is no row named by words, whatever follows it,
  // and a row named by words that prints a mark lists it, as before.
  assert.deepEqual(splitRowMarks("HHW-PUMP-1/STANDBY PUMP", false), ["HHW-PUMP-1", "STANDBY PUMP"]);
  assert.deepEqual(splitRowMarks("GENERAL EXHAUST/EF-1", false), ["GENERAL EXHAUST", "EF-1"]);
  const outdoor = { tables: [as77Table("m.pdf#40", "CONDENSING UNIT SCHEDULE", ["LOCATION", "QTY."], [
    { LOCATION: "ELECTRICAL ROOM 101/CU-5", "QTY.": "1" }, { LOCATION: "ROOF NORTH SIDE/ROOF SOUTH SIDE", "QTY.": "2" },
  ])] };
  const cu = as77Marks(outdoor).CONDENSING_UNIT;
  assert.ok(cu.compile.includes("CU5") && cu.compile.includes("ROOFNORTHSIDE/ROOFSOUTHSIDE"), cu.compile.join(" "));
  assert.deepEqual(cu.reconcile, cu.compile);
  // Names spelled with dashes and no space are no words: a table of them is
  // no table named by words.
  const dashed = scheduleTableView(as77Table("m.pdf#41", "NOISE CONTROL DUCT SILENCER SCHEDULE", ["LOCATION & SERVES", "QTY."], [
    { "LOCATION & SERVES": "SUPPLY-SILENCER-EAST", "QTY.": "1" }, { "LOCATION & SERVES": "RETURN-SILENCER-EAST", "QTY.": "1" },
  ]));
  assert.equal(familyTableGate(dashed, HVAC_FAMILY_SPECS.DUCT_SILENCER, "DUCT_SILENCER")!.wordsNamed, false);
  // A title naming a general schedule too reads rows by their marks, never
  // as a table named by words.
  const general = scheduleTableView(as77Table("m.pdf#41", "CONDENSING UNIT MISCELLANEOUS SCHEDULE", ["LOCATION & SERVES", "QTY."], [
    { "LOCATION & SERVES": "GROUP REHEARSAL 123 - SUPPLY/RETURN", "QTY.": "2" },
    { "LOCATION & SERVES": "ROCK REHEARSAL 218 - SUPPLY/RETURN", "QTY.": "2" },
  ]));
  const generalGate = familyTableGate(general, HVAC_FAMILY_SPECS.CONDENSING_UNIT, "CONDENSING_UNIT")!;
  assert.ok(generalGate.titleOk && generalGate.catchAll);
  assert.equal(generalGate.wordsNamed, false);
});

test("a family's own identity column names a row before a MARK the row prints first, in the takeoff and the reconcile alike (AS-79, AS-81)", () => {
  // The gate's reading of a row's name is the one both sides use.
  const chw = { tables: [as77Table("m.pdf#30", "CHILLED WATER CONTROL VALVE SCHEDULE", ["MARK", "VALVE MARK", "GPM"], [
    { MARK: "1", "VALVE MARK": "CV-1", GPM: "12" }, { MARK: "2", "VALVE MARK": "CV-2", GPM: "8" },
  ])] };
  assert.deepEqual(as77Marks(chw).CHW_CONTROL_VALVE, { compile: ["CV1", "CV2"], reconcile: ["CV1", "CV2"] });
  const bypass = { tables: [as77Table("m.pdf#30", "BYPASS CONTROL VALVE SCHEDULE", ["MARK", "SYMBOL", "GPM"], [
    { MARK: "1", SYMBOL: "BCV-1", GPM: "40" },
  ])] };
  assert.deepEqual(as77Marks(bypass).BYPASS_CONTROL_VALVE, { compile: ["BCV1"], reconcile: ["BCV1"] });
  const gate = familyTableGate(scheduleTableView(chw.tables[0]), HVAC_FAMILY_SPECS.CHW_CONTROL_VALVE, "CHW_CONTROL_VALVE")!;
  const { marksRead, ...options } = gate.identity;
  assert.deepEqual(options, { identityHeaderRe: HVAC_FAMILY_SPECS.CHW_CONTROL_VALVE.identityHeaderRe, unitMark: false });
  assert.deepEqual(marksRead?.("CV-CHW-1"), ["CVCHW1"]);
  assert.equal(gate.wordsNamed, false);
});

// AS-82: one mark however the separator between its letters and its number
// is printed (AHU-1, AHU 1, AHU1).
type Spell = (letters: string, n: string) => string;
const as82Forms: Record<string, Spell> = {
  hyphen: (l, n) => `${l}-${n}`, space: (l, n) => `${l} ${n}`, glued: (l, n) => `${l}${n}`,
};

test("a family reads its marks under its own title in any spelling of the separator after their letters, in the takeoff and the reconcile alike (AS-82)", () => {
  const graph = (s: Spell) => ({ tables: [
    as77Table("m.pdf#1", "AIR HANDLING UNIT SCHEDULE", ["MARK", "CFM"], [{ MARK: s("AHU", "1"), CFM: "4000" }, { MARK: s("AHU", "2"), CFM: "3000" }]),
    as77Table("m.pdf#2", "BOILER SCHEDULE", ["MARK", "MBH"], [{ MARK: s("B", "1"), MBH: "1000" }, { MARK: s("B", "2"), MBH: "1000" }]),
    as77Table("m.pdf#3", "HUMIDIFIER SCHEDULE", ["PLAN CODE", "LBS/HR"], [{ "PLAN CODE": s("H", "1"), "LBS/HR": "40" }]),
    as77Table("m.pdf#4", "ENERGY RECOVERY VENTILATOR SCHEDULE", ["MARK", "CFM"], [{ MARK: s("C", "1"), CFM: "900" }]),
    as77Table("m.pdf#5", "AIR COOLED CHILLER SCHEDULE", ["MARK", "TONS"], [{ MARK: s("CH", "1"), TONS: "120" }]),
    as77Table("m.pdf#6", "PRESSURE REDUCING VALVE SCHEDULE", ["MARK", "SIZE"], [{ MARK: s("PRV", "1A"), SIZE: "2\"" }]),
    // The family's other title reads by its other rule (DCU-n), likewise.
    as77Table("m.pdf#7", "DUCTLESS SPLIT SYSTEM SCHEDULE", ["MARK", "MBH"], [{ MARK: s("DCU", "1"), MBH: "24" }]),
  ] });
  const read = Object.fromEntries(Object.entries(as82Forms).map(([name, s]) => [name, as77Marks(graph(s))]));
  assert.deepEqual(read.space, read.hyphen);
  assert.deepEqual(read.glued, read.hyphen);
  const one = (k: string) => ({ compile: [k], reconcile: [k] });
  assert.deepEqual(read.hyphen.AHU, { compile: ["AHU1", "AHU2"], reconcile: ["AHU1", "AHU2"] });
  assert.deepEqual(read.hyphen.BOILER, { compile: ["B1", "B2"], reconcile: ["B1", "B2"] });
  assert.deepEqual(read.hyphen.HUMIDIFIER, one("H1"));
  assert.deepEqual(read.hyphen.ERV, one("C1"));
  assert.deepEqual(read.hyphen.AIR_COOLED_CHILLER, one("CH1"));
  assert.deepEqual(read.hyphen.PRESSURE_REDUCING_VALVE, one("PRV1A"));
  assert.deepEqual(read.hyphen.CONDENSING_UNIT, one("DCU1"));
  for (const name of Object.keys(read)) as77Parity(read[name], name);
  // Read as printed but for the separator ranks as printed; read only in one
  // of the mark's forms (a building's 1-AHU1), as a widened reading (AS-62).
  const ahu = HVAC_FAMILY_SPECS.AHU;
  const ahuGate = familyTableGate(scheduleTableView(graph(as82Forms.glued).tables[0]), ahu, "AHU")!;
  for (const [one, rank] of [["AHU-1", 2], ["AHU 1", 2], ["AHU1", 2], ["1-AHU1", 1], ["1-AHU-1", 1], ["ACCU1", 0]] as Array<[string, number]>) {
    assert.equal(familyMarkRead(ahuGate, ahu, one, one.toUpperCase().replace(/\s+/g, "")), rank, one);
  }
  assert.deepEqual(markSpellings("AHU 1"), ["AHU-1", "AHU 1", "AHU1"]);
  assert.deepEqual(markSpellings("1-VAV-1"), []);
  assert.deepEqual(markSpellings("CV-CHW-BP-A"), []);
});

test("a general schedule and a control valve schedule read a mark in any spelling of its separator, each valve once under its table's water; an untitled table reads marks as printed (AS-82)", () => {
  const graph = (s: Spell) => ({ tables: [
    as77Table("m.pdf#14", "MECHANICAL SPECIALTY EQUIPMENT SCHEDULE", ["MARK", "DESCRIPTION"], [
      { MARK: s("PF", "1"), DESCRIPTION: "CHEMICAL POT FEEDER" }, { MARK: s("FM", "1"), DESCRIPTION: "FLOW METER" },
    ]),
    // 009_FL's HYDRONIC CONTROL VALVE SCHEDULE, which names no water.
    as77Table("m.pdf#20", "HYDRONIC CONTROL VALVE SCHEDULE", ["MARK", "GPM", "MAX PRESSURE DROP (FT)", "MIN CV", "TYPE"], [
      { MARK: s("CV", "1"), GPM: "12", "MAX PRESSURE DROP (FT)": "5", "MIN CV": "4", TYPE: "2-WAY" },
      { MARK: s("CV", "2"), GPM: "8", "MAX PRESSURE DROP (FT)": "5", "MIN CV": "3", TYPE: "2-WAY" },
    ]),
  ] });
  const read = Object.fromEntries(Object.entries(as82Forms).map(([name, s]) => [name, as77Marks(graph(s))]));
  assert.deepEqual(read.space, read.hyphen);
  assert.deepEqual(read.glued, read.hyphen);
  assert.deepEqual(read.hyphen.CHEMICAL_POT_FEEDER, { compile: ["PF1"], reconcile: ["PF1"] });
  assert.deepEqual(read.hyphen.FLOW_METER, { compile: ["FM1"], reconcile: ["FM1"] });
  assert.deepEqual(read.hyphen.CHW_CONTROL_VALVE, { compile: ["CV1", "CV2"], reconcile: ["CV1", "CV2"] });
  assert.equal(read.hyphen.HHW_CONTROL_VALVE, undefined);
  // The water is the table's for each valve whatever the shape of its mark;
  // the shape itself is read as printed, so 089_FL's concrete beam CB1 is no
  // circuit setter (CB-) and 017_MD's DDC matrix's V1 is no valve.
  for (const key of ["CV-1", "V-1", "CB-1"]) assert.equal(hasValveOrDamperMark({ rows: [{ key }] }), true, key);
  for (const key of ["CB1", "V1", "VAV1", "AHU-1"]) assert.equal(hasValveOrDamperMark({ rows: [{ key }] }), false, key);
  // An untitled valve grid whose marks print a space is split by water too.
  const grid = (mark: string) => ({ tables: [as77Table("m.pdf#21", "", ["MARK", "GPM", "SERVED"], [{ MARK: mark, GPM: "12", SERVED: "AHU-1" }])] });
  for (const mark of ["CV-1", "CV 1"]) {
    const marks = as77Marks(grid(mark));
    assert.deepEqual(marks.CHW_CONTROL_VALVE, { compile: ["CV1"], reconcile: ["CV1"] }, mark);
    assert.equal(marks.HHW_CONTROL_VALVE, undefined, mark);
  }
  // An untitled table's marks are read as printed: B-1 is a boiler there, as
  // before, a glued B1 (a level, a grid line) is not.
  const untitled = (mark: string) => ({ tables: [as77Table("m.pdf#27", "", ["MARK", "MBH", "MANUFACTURER"], [{ MARK: mark, MBH: "1000", MANUFACTURER: "X" }])] });
  assert.deepEqual(as77Marks(untitled("B-1")).BOILER, { compile: ["B1"], reconcile: ["B1"] });
  assert.equal(as77Marks(untitled("B1")).BOILER, undefined);
  // A mark only a title of the family vouches for is no unit in a general
  // schedule, in any spelling: C1 and C-1 are no ERVs there.
  for (const mark of ["C1", "C-1", "C 1"]) {
    const general = { tables: [as77Table("m.pdf#9", "EQUIPMENT SCHEDULE", ["MARK", "DESCRIPTION"], [{ MARK: mark, DESCRIPTION: "UNIT" }])] };
    assert.equal(as77Marks(general).ERV, undefined, mark);
  }
});

test("one unit however each table that lists it spells the separator after its letters, citing its own schedule (AS-82)", () => {
  // 26_CA: ET-35-1 in its EXPANSION TANK schedule, ET 35-1 on a riser diagram
  // the extraction reads as an untitled table.
  const tanks = { tables: [
    as77Table("m.pdf#10", "EXPANSION TANK (SPECIFICATION SECTION 23 41 00)", ["DESIGNATION", "TANK VOLUME (GALLONS)"], [{ DESIGNATION: "ET-35-1", "TANK VOLUME (GALLONS)": "211" }]),
    as77Table("m.pdf#57", "", ["COL1", "COL2"], [{ __key: "ET 35-1", COL1: "ET 35-1", COL2: "10\" CHWS/R" }]),
  ] };
  const items = (compileHvacTakeoff(null, tanks).categories as Record<string, { items: Array<{ tag: string; sheet_id: string }> }>).EXPANSION_TANK.items;
  assert.deepEqual(items.map((i) => `${i.tag}@${i.sheet_id}`), ["ET-35-1@m.pdf#10"]);
  assert.equal(unitMarkKey("ET35-1"), unitMarkKey("ET-35-1"));
  assert.equal(unitMarkKey("AHU 1"), "AHU-1");
  assert.notEqual(unitMarkKey("AHU-11"), unitMarkKey("AHU1-1"));
  assert.notEqual(unitMarkKey("1-VAV-1"), unitMarkKey("1-VAV1"));
  // A glued mark under its own title keeps its schedule's cite where a general
  // schedule lists it with a hyphen.
  const ahu = { tables: [
    as77Table("m.pdf#5", "AIR HANDLING UNIT SCHEDULE", ["MARK", "CFM"], [{ MARK: "AHU1", CFM: "4000" }]),
    as77Table("m.pdf#9", "EQUIPMENT SCHEDULE", ["MARK", "DESCRIPTION"], [{ MARK: "AHU-1", DESCRIPTION: "AIR HANDLER" }]),
  ] };
  const units = (compileHvacTakeoff(null, ahu).categories as Record<string, { items: Array<{ tag: string; sheet_id: string }> }>).AHU.items;
  assert.deepEqual(units.map((i) => `${i.tag}@${i.sheet_id}`), ["AHU1@m.pdf#5"]);
  const [row] = reconcileScheduleFamilyFromGraph(ahu, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "AHU")!) as Array<{ tag: string; schedule_cite: { sheet: string } }>;
  assert.equal(row.schedule_cite.sheet, "m.pdf#5");
  // A title naming two families: the one whose rule reads the mark in another
  // spelling holds it, as it holds the hyphenated mark (AS-80).
  const split = (mark: string) => ({ tables: [as77Table("m.pdf#8", "OUTDOOR AIR-COOLED HEAT PUMP OR CONDENSING UNIT SCHEDULE", ["MARK", "MBH"], [{ MARK: mark, MBH: "36" }])] });
  for (const mark of ["SCU-1", "SCU1"]) {
    const marks = as77Marks(split(mark));
    assert.deepEqual(marks.HEAT_PUMP, { compile: ["SCU1"], reconcile: ["SCU1"] }, mark);
    assert.equal(marks.CONDENSING_UNIT, undefined, mark);
  }
  // A mark the other family reads under its own title only (ERV's C1) makes
  // no family yield, in any spelling (AS-80).
  const both = (mark: string) => as77Marks({ tables: [as77Table("m.pdf#8", "GAS-FIRED FURNACE AND ENERGY RECOVERY VENTILATOR SCHEDULE", ["MARK", "CFM"], [{ MARK: mark, CFM: "900" }])] });
  for (const mark of ["C1", "C-1", "C 1"]) {
    assert.deepEqual(both(mark), { FURNACE: { compile: ["C1"], reconcile: ["C1"] }, ERV: { compile: ["C1"], reconcile: ["C1"] } }, mark);
  }
});

// AS-83: a schedule's title read without what a drafter adds to any title: a
// status, a discipline, a continuation, a sheet count, SCHEDULES for SCHEDULE,
// a hyphen joining two words.
const as83Decorations: Record<string, (t: string) => string> = {
  plain: (t) => t,
  status: (t) => `(N) ${t}`,
  existing: (t) => `EXISTING ${t}`,
  discipline: (t) => `MECHANICAL ${t}`,
  continued: (t) => `${t} (CONT.)`,
  continuedWord: (t) => `${t} CONTINUED`,
  sheet: (t) => `${t} - 2 OF 3`,
  plural: (t) => t.replace(/\bSCHEDULE\b/, "SCHEDULES"),
  hyphenated: (t) => t.replace(/^([A-Z]{2,}) (?=[A-Z]{2,})/, "$1-"),
  all: (t) => `(E) HVAC ${t.replace(/\bSCHEDULE\b/, "SCHEDULES")} (CONTINUED) - SHEET 2 OF 2`,
};

test("a family reads its schedule under a decorated title as under the title printed plain, in the takeoff and the reconcile alike, citing the title as printed (AS-83)", () => {
  // Titles from the corpus: 23_GA's EXHAUST FANS, 26_CA's FANS (SPECIFICATION
  // SECTION 23 34 00) and FAN POWERED TERMINAL UNIT SCHEDULE, 044_NY's
  // CONDENSATE PUMP, 053_VA's VALVE SCHEDULE, bldg5406's LOU ER SCHEDULE (its
  // V lost in the extraction), 013_MO's CONTROL VALVES, which names no water,
  // a general EQUIPMENT SCHEDULE.
  const graph = (d: (t: string) => string) => ({ tables: [
    as77Table("m.pdf#1", d("EXHAUST FANS"), ["MARK", "CFM"], [{ MARK: "EF-1", CFM: "650" }, { MARK: "EF-2", CFM: "75" }]),
    as77Table("m.pdf#2", d("FANS (SPECIFICATION SECTION 23 34 00)"), ["DESIGNATION", "CFM"], [{ DESIGNATION: "SF-3", CFM: "9000" }]),
    as77Table("m.pdf#3", d("CONDENSATE PUMP"), ["MARK", "GPM"], [{ MARK: "CP-1", GPM: "5" }]),
    as77Table("m.pdf#4", d("LOU ER SCHEDULE"), ["MARK", "SIZE"], [{ MARK: "L-1", SIZE: "48X36" }]),
    as77Table("m.pdf#5", d("VALVE SCHEDULE"), ["VALVE MARK", "GPM"], [{ "VALVE MARK": "V-HHW-R-11", GPM: "2" }]),
    as77Table("m.pdf#6", d("FAN POWERED TERMINAL UNIT SCHEDULE"), ["MARK", "CFM"], [{ MARK: "FPB-1", CFM: "800" }]),
    as77Table("m.pdf#7", d("EQUIPMENT SCHEDULE"), ["MARK", "DESCRIPTION"], [{ MARK: "AHU-1", DESCRIPTION: "AIR HANDLER" }]),
    as77Table("m.pdf#8", d("CONTROL VALVES"), ["TAG", "MANUFACTURER", "SERVED", "GPM"], [{ TAG: "CV-7", MANUFACTURER: "BELIMO", SERVED: "B-1", GPM: "12" }]),
  ] });
  const read = Object.fromEntries(Object.entries(as83Decorations).map(([name, d]) => [name, as77Marks(graph(d))]));
  const both = (...marks: string[]) => ({ compile: marks, reconcile: marks });
  assert.deepEqual(read.plain, {
    AHU: both("AHU1"), VAV: both("FPB1"), PUMP: both("CP1"), FAN: both("EF1", "EF2", "SF3"),
    HHW_CONTROL_VALVE: both("VHHWR11"), CHW_CONTROL_VALVE: both("CV7"), LOUVER: both("L1"),
  });
  for (const name of Object.keys(as83Decorations)) {
    assert.deepEqual(read[name], read.plain, name);
    as77Parity(read[name], name);
  }
  // Each unit cites its table's title as printed.
  const status = graph(as83Decorations.status);
  const pump = (compileHvacTakeoff(null, status).categories as Record<string, { items: Array<{ tag: string; table_title: string }> }>).PUMP.items;
  assert.deepEqual(pump.map((i) => [i.tag, i.table_title]), [["CP-1", "(N) CONDENSATE PUMP"]]);
  const [row] = reconcileScheduleFamilyFromGraph(status, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "PUMP")!) as Array<{ tag: string; schedule_cite: { title: string } }>;
  assert.equal(row.schedule_cite.title, "(N) CONDENSATE PUMP");
  const gate = familyTableGate(scheduleTableView(graph(as83Decorations.all).tables[0]), HVAC_FAMILY_SPECS.FAN, "FAN")!;
  assert.equal(gate.titleOk, true);
  // A hyphen reads as the space a title's exclusions are written with: an
  // air handling unit schedule hosts DOAS-1 (AS-63) and a dedicated outdoor
  // air one does not, however the words are joined.
  const hosted = (title: string) => as77Marks({ tables: [as77Table("m.pdf#3", title, ["MARK", "CFM"], [{ MARK: "DOAS-1", CFM: "3000" }, { MARK: "AHU-4", CFM: "5000" }])] });
  assert.deepEqual(hosted("AIR HANDLING UNIT SYSTEM INDEX SCHEDULE"), { AHU: both("AHU4"), DOAS: both("DOAS1") });
  assert.deepEqual(hosted("AIR-HANDLING UNIT SYSTEM INDEX SCHEDULE"), hosted("AIR HANDLING UNIT SYSTEM INDEX SCHEDULE"));
  for (const title of ["DEDICATED OUTDOOR-AIR HANDLING UNIT SCHEDULE", "DEDICATED-OUTDOOR-AIR HANDLING UNIT SCHEDULE"]) {
    assert.deepEqual(hosted(title), hosted("DEDICATED OUTDOOR AIR HANDLING UNIT SCHEDULE"), title);
  }
  // A decoration makes no title a family's that is none as printed: a points
  // list, a wiring diagram, a status no drafter agrees on ((R): removed or
  // relocated).
  const none = { tables: [
    as77Table("m.pdf#8", "(N) EXHAUST FAN POINTS LIST", ["MARK", "POINT"], [{ MARK: "EF-1", POINT: "START/STOP" }]),
    as77Table("m.pdf#9", "EXISTING VAV BOX WIRING DIAGRAM - 2 OF 3", ["MARK", "CFM"], [{ MARK: "VAV-1", CFM: "400" }]),
    as77Table("m.pdf#10", "(R) EXHAUST FANS", ["MARK", "CFM"], [{ MARK: "EF-9", CFM: "400" }]),
  ] };
  assert.deepEqual(as77Marks(none), {});
});

// AS-84: a row's mark column printed under another name.
test("a mark column printed under another name names a row whose key the family reads no mark in; a key it reads stays (AS-84)", () => {
  const row = (cells: Record<string, string>, key: string) => ({ key, cells: Object.fromEntries(Object.entries(cells).map(([h, text]) => [h, { text }])) });
  // The family's reading, as the gate gives it: here, a mark of letters and a
  // number or letter after a hyphen or space, in its letters and digits.
  const marksRead = (text: string) => (/^(?:ATU|CV|EF|FCUC|VAV|B)[\s-]?[A-Z0-9]/.test(text) ? [text.toUpperCase().replace(/[^A-Z0-9]/g, "")] : []);
  // 03_FL keys a terminal unit EATUA, the status run into its mark; its column
  // prints ATU A. Under each name drafters give that column, as under MARK.
  for (const header of ["MARK", "TAG", "TAG NO.", "EQUIPMENT TAG", "EQUIP NO", "UNIT NO.", "PLAN MARK", "PLAN CODE", "ID", "ITEM NO.", "MARK NUMBER"]) {
    assert.equal(rowIdentityText(row({ [header]: "ATU A", CFM: "400" }, "EATUA"), { marksRead }), "ATU A", header);
  }
  // Without the family's reading, only a column named as a mark column names a row.
  assert.equal(rowIdentityText(row({ TAG: "ATU A", CFM: "400" }, "EATUA")), "EATUA");
  // A key the family reads stays: a TAG column of grille type codes beside
  // the fan's mark, 013_MO's TAG cell running two rows' ranges together, a
  // mark printed in two columns (05_MO's MARK ID FCUC and MARK # A).
  assert.equal(rowIdentityText(row({ TAG: "1S", CFM: "200" }, "EF-3"), { marksRead }), "EF-3");
  assert.equal(rowIdentityText(row({ TAG: "CV-7 - CV-10 CV-1 - CV-6", GPM: "12" }, "CV-7-CV-10"), { marksRead }), "CV-7-CV-10");
  assert.equal(rowIdentityText(row({ "MARK ID": "FCUC", "MARK #": "A", CFM: "215" }, "FCUC A"), { marksRead }), "FCUC A");
  // A cell that prints no mark, or none the family reads, names no row: a
  // type code, a lone letter, words, another family's mark.
  for (const text of ["1S", "A", "HORIZONTAL CEILING", "AHU-1"]) assert.equal(rowIdentityText(row({ TAG: text, CFM: "200" }, "EATUA"), { marksRead }), "EATUA", text);
  // UNIT NO. is UNIT NO, whose cell names its row.
  assert.equal(rowIdentityText(row({ "UNIT NO.": "B-1 & 2", MBH: "1000" }, "B-1/B-2")), "B-1 & 2");
  // In the takeoff and the reconcile alike: 03_FL's terminal units under each
  // name of the column read as under MARK.
  const atus = (header: string) => ({ tables: [as77Table("f.pdf#64", "AIR TERMINAL UNIT SCHEDULE (AHU 2)", [header, "CFM"], [
    { __key: "EATUA", [header]: "ATU A", CFM: "400" }, { __key: "EATUB", [header]: "ATU B", CFM: "300" },
  ])] });
  const byMark = as77Marks(atus("MARK"));
  assert.deepEqual(byMark, { VAV: { compile: ["ATUA", "ATUB"], reconcile: ["ATUA", "ATUB"] } });
  for (const header of ["TAG", "EQUIPMENT TAG", "TAG NO.", "UNIT NO.", "ID"]) assert.deepEqual(as77Marks(atus(header)), byMark, header);
  // 22_GA's DUCTLESS SPLIT SYSTEM SCHEDULE keys each row by its indoor unit
  // and prints its outdoor unit beside it: the fan coil is DAC-1, the
  // condensing unit the OUTDOOR UNIT MARK's DCU-1, which no family read.
  const split = { tables: [as77Table("g.pdf#64", "DUCTLESS SPLIT SYSTEM SCHEDULE", ["INDOOR UNIT MARK", "OUTDOOR UNIT MARK", "MIN. COOLING MBH"], [
    { "INDOOR UNIT MARK": "DAC-1", "OUTDOOR UNIT MARK": "DCU-1", "MIN. COOLING MBH": "24" },
  ])] };
  assert.deepEqual(as77Marks(split), { FCU: { compile: ["DAC1"], reconcile: ["DAC1"] }, CONDENSING_UNIT: { compile: ["DCU1"], reconcile: ["DCU1"] } });
  // 03_FL's DX COOLING ONLY DUCTLESS SPLIT UNIT SCHEDULE names the indoor unit
  // under MARK: the condensing unit is its OUTDOOR UNIT MARK's still.
  const marked = { tables: [as77Table("f.pdf#65", "DX COOLING ONLY DUCTLESS SPLIT UNIT SCHEDULE", ["MARK", "INDOOR UNIT AIRFLOW (CFM)", "OUTDOOR UNIT MARK"], [
    { MARK: "DAC-1", "INDOOR UNIT AIRFLOW (CFM)": "330", "OUTDOOR UNIT MARK": "DCU-1" },
  ])] };
  assert.deepEqual(as77Marks(marked), { FCU: { compile: ["DAC1"], reconcile: ["DAC1"] }, CONDENSING_UNIT: { compile: ["DCU1"], reconcile: ["DCU1"] } });
  // A row listing two indoor units and their two outdoor units: the cell is
  // read as the takeoff splits a row's name, one unit a mark.
  for (const [indoor, outdoor] of [["DAC-1 & 2", "DCU-1 & 2"], ["DAC-1, DAC-2", "DCU-1, DCU-2"], ["DAC-1 THRU 2", "DCU-1 THRU 2"]]) {
    const pair = { tables: [as77Table("g.pdf#64", "DUCTLESS SPLIT SYSTEM SCHEDULE", ["INDOOR UNIT MARK", "OUTDOOR UNIT MARK", "MIN. COOLING MBH"], [
      { "INDOOR UNIT MARK": indoor, "OUTDOOR UNIT MARK": outdoor, "MIN. COOLING MBH": "24" },
    ])] };
    assert.deepEqual(as77Marks(pair), {
      FCU: { compile: ["DAC1", "DAC2"], reconcile: ["DAC1", "DAC2"] },
      CONDENSING_UNIT: { compile: ["DCU1", "DCU2"], reconcile: ["DCU1", "DCU2"] },
    }, outdoor);
  }
  // A name the family reads stays: a fan schedule's MARK beside a TAG of
  // grille type codes.
  const fans = { tables: [as77Table("m.pdf#3", "FAN SCHEDULE", ["MARK", "TAG", "CFM"], [{ MARK: "EF-1", TAG: "1S", CFM: "500" }])] };
  assert.deepEqual(as77Marks(fans), { FAN: { compile: ["EF1"], reconcile: ["EF1"] } });
});

test("a key the extraction ran together is read as its mark column prints it, under any name of the column (AS-84)", () => {
  // The extraction keys a row by its mark cell's letters and digits, running
  // in a status printed before the mark or the ampersand between two:
  // 063_MT's (E) EF- 4 is keyed EEF-4, 067_CA's (N) B950A-AS-1001
  // NB950A-AS-1001, 088_AZ's (E) CT-1 ECT-1, 028_TX's UH-1 & UH-2 UH-1UH-2.
  // Under MARK the cell names the row; under the column's other names too.
  const keyed = (title: string, header: string, key: string, mark: string) => ({ tables: [as77Table("k.pdf#9", title, [header, "REMARKS"], [
    { __key: key, [header]: mark, REMARKS: "" },
  ])] });
  const cases: Array<[string, string, string, Record<string, string[]>]> = [
    ["EXHAUST FAN SCHEDULE", "EEF-4", "(E) EF- 4", { FAN: ["EF4"] }],
    ["PCW AIR SEPARATOR SCHEDULE", "NB950A-AS-1001", "(N) B950A-AS-1001", { AIR_SEPARATOR: ["B950AAS1001"] }],
    ["COOLING TOWER SCHEDULE", "ECT-1", "(E) CT-1", { COOLING_TOWER: ["CT1"] }],
    ["UNIT HEATER SCHEDULE", "UH-1UH-2", "UH-1 & UH-2", { UNIT_HEATER: ["UH1", "UH2"] }],
  ];
  for (const [title, key, mark, want] of cases) {
    const byMark = as77Marks(keyed(title, "MARK", key, mark));
    assert.deepEqual(byMark, Object.fromEntries(Object.entries(want).map(([f, m]) => [f, { compile: m, reconcile: m }])), `${title} MARK`);
    for (const header of ["TAG", "EQUIPMENT TAG", "TAG NO.", "UNIT NO.", "EQUIP. NO.", "ID", "PLAN MARK"]) {
      assert.deepEqual(as77Marks(keyed(title, header, key, mark)), byMark, `${title} ${header}`);
    }
  }
  // Where the cell only spaces the key's marks otherwise, the key names the
  // row as before: 09_ME's SAC - 1 is keyed SAC-1, 043_FL's HWP 1-2 HWP1-2.
  const tags = (graph: object, family: string) => ({
    compile: (compileHvacTakeoff(null, graph).categories as Record<string, { items: Array<{ tag: string }> }>)[family]?.items.map((i) => i.tag),
    reconcile: (reconcileScheduleFamilyFromGraph(graph, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family)!) as Array<{ tag: string }>).map((r) => r.tag),
  });
  const spaced = { tables: [as77Table("m.pdf#7", "MULTI-SPLIT HEAT PUMP INDOOR UNIT PERFORMANCE SCHEDULE", ["TAG", "CORRESPONDING OUTDOOR UNIT", "NOMINAL COOLING (MBH)"], [
    { __key: "SAC-1", TAG: "SAC - 1", "CORRESPONDING OUTDOOR UNIT": "SCU - 1", "NOMINAL COOLING (MBH)": "12.2" },
  ])] };
  assert.deepEqual(tags(spaced, "HEAT_PUMP"), { compile: ["SAC-1"], reconcile: ["SAC-1"] });
  // So does a key the family reads beside a cell of its letters and digits
  // that the family reads no mark in.
  assert.deepEqual(as77Marks(keyed("EXHAUST FAN SCHEDULE", "TAG", "EF-4", "E.F.4")), { FAN: { compile: ["EF4"], reconcile: ["EF4"] } });
  // A key the family reads beside a column of other letters stays (the
  // grille type code, 013_MO's merged ranges). And only the extraction's key
  // is read as printed: a MARK cell is the drafter's own print, and a column
  // under another name never replaces it, even one printing its letters and
  // digits with a status.
  const typeCode = { tables: [as77Table("m.pdf#3", "EXHAUST FAN SCHEDULE", ["TAG", "CFM"], [{ __key: "EF-3", TAG: "1S", CFM: "200" }])] };
  assert.deepEqual(as77Marks(typeCode), { FAN: { compile: ["EF3"], reconcile: ["EF3"] } });
  const marked = { tables: [as77Table("m.pdf#3", "EXHAUST FAN SCHEDULE", ["MARK", "EQUIPMENT TAG", "CFM"], [{ __key: "EEF-4", MARK: "EEF-4", "EQUIPMENT TAG": "(E) EF-4", CFM: "200" }])] };
  assert.deepEqual(tags(marked, "FAN"), { compile: ["EEF-4"], reconcile: ["EEF-4"] });
});

test("a control valve or damper table reads its units whatever its identity column is called: SYMBOL, DESIGNATION, UNIT NO., ID (AS-84)", () => {
  // 009_FL's HYDRONIC CONTROL VALVE SCHEDULE names no water.
  const valves = (header: string) => ({ tables: [as77Table("m.pdf#20", "HYDRONIC CONTROL VALVE SCHEDULE", [header, "GPM", "MAX PRESSURE DROP (FT)", "MIN CV", "TYPE"], [
    { [header]: "CV-1", GPM: "12", "MAX PRESSURE DROP (FT)": "5", "MIN CV": "4", TYPE: "2-WAY" },
    { [header]: "CV-2", GPM: "8", "MAX PRESSURE DROP (FT)": "5", "MIN CV": "3", TYPE: "2-WAY" },
  ])] });
  const byMark = as77Marks(valves("MARK"));
  assert.deepEqual(byMark, { CHW_CONTROL_VALVE: { compile: ["CV1", "CV2"], reconcile: ["CV1", "CV2"] } });
  // An untitled valve grid, likewise.
  const grid = (header: string) => ({ tables: [as77Table("m.pdf#21", "", [header, "GPM", "SERVED"], [{ [header]: "CV-1", GPM: "12", SERVED: "AHU-1" }])] });
  assert.deepEqual(as77Marks(grid("TAG")), { CHW_CONTROL_VALVE: { compile: ["CV1"], reconcile: ["CV1"] } });
  for (const header of ["SYMBOL", "DESIGNATION", "UNIT NO.", "ID", "EQUIPMENT TAG", "EQUIP. NO."]) {
    assert.deepEqual(as77Marks(valves(header)), byMark, header);
    assert.deepEqual(as77Marks(grid(header)), as77Marks(grid("TAG")), `untitled ${header}`);
  }
  // Negative control: a table naming no identity column is no valve table.
  assert.deepEqual(as77Marks(valves("DESCRIPTION")), {});
  assert.deepEqual(as77Marks(grid("DESCRIPTION")), {});
  // Untitled grids of each family whose identity column tells its table
  // (blankHeaderRes): a damper's, an isolation valve's, a mixing valve's, a
  // hot water valve's, under each name as under TAG.
  const grids: Record<string, (header: string) => object> = {
    CONTROL_DAMPER: (h) => ({ tables: [as77Table("m.pdf#30", "", [h, "DAMPER TYPE", "CFM"], [{ [h]: "MD-1", "DAMPER TYPE": "OPPOSED BLADE", CFM: "400" }])] }),
    ISOLATION_VALVE: (h) => ({ tables: [as77Table("m.pdf#31", "", [h, "SERVICE", "CONNECTION"], [{ [h]: "IV-1", SERVICE: "CHW", CONNECTION: "FLANGED" }])] }),
    MIXING_VALVE: (h) => ({ tables: [as77Table("m.pdf#32", "", [h, "MIXING TEMP", "INLET"], [{ [h]: "TMV-1", "MIXING TEMP": "110", INLET: "3/4" }])] }),
    HHW_CONTROL_VALVE: (h) => ({ tables: [as77Table("m.pdf#33", "", [h, "HOT WATER", "REHEAT COIL"], [{ [h]: "CV-1", "HOT WATER": "HHW", "REHEAT COIL": "RH-1" }])] }),
  };
  for (const [family, of] of Object.entries(grids)) {
    const byTag = as77Marks(of("TAG"));
    assert.deepEqual(Object.keys(byTag), [family], family);
    for (const header of ["SYMBOL", "DESIGNATION", "UNIT NO.", "ID", "EQUIP. NO."]) assert.deepEqual(as77Marks(of(header)), byTag, `${family} ${header}`);
    assert.deepEqual(as77Marks(of("DESCRIPTION")), {}, `${family} DESCRIPTION`);
  }
  // The extraction's own label is unchanged: the valve header shape
  // classifyGrid labels a table by, which the sheet graph's gap recovery
  // reads, still asks for TAG, MARK or VALVE MARK.
  const labelled = (header: string) => as77Table("m.pdf#21", "", [header, "GPM", "SERVED"], [{ [header]: "CV-1", GPM: "12", SERVED: "AHU-1" }]);
  assert.equal(isControlValveHeaderShape(labelled("TAG")), true);
  assert.equal(classifyGrid(labelled("TAG") as unknown as Parameters<typeof classifyGrid>[0]).type, "VALVE_SCHEDULE");
  for (const header of ["SYMBOL", "DESIGNATION", "UNIT NO.", "ID"]) assert.equal(isControlValveHeaderShape(labelled(header)), false, header);
});

// AS-86: a row that lists one family's units.
test("a list of one family's marks names each unit, however it is spelled (AS-86)", () => {
  for (const list of ["EF-1, 2", "EF-1,2", "EF-1, EF-2", "EF-1,EF-2", "EF-1 & 2", "EF-1 & EF-2", "EF-1 AND 2", "EF-1 and EF-2"]) {
    assert.deepEqual(expandMarkList(list), ["EF-1", "EF-2"], list);
  }
  assert.deepEqual(expandMarkList("EF-1, 2, 3"), ["EF-1", "EF-2", "EF-3"]);
  assert.deepEqual(expandMarkList("SF-P2-1, 2"), ["SF-P2-1", "SF-P2-2"]);
  // A letter after the number continues as a letter (044_NY's duplex fuel oil
  // pumps, FOP-8A & B), or with its number (AHU-1A, 1B).
  assert.deepEqual(expandMarkList("FOP-8A & B"), ["FOP-8A", "FOP-8B"]);
  assert.deepEqual(expandMarkList("AHU-1A, 1B"), ["AHU-1A", "AHU-1B"]);
  // Not a list of one family's units: two families' marks (a row naming its
  // air handler and heat pump), one mark, words, a note.
  for (const text of ["AHU-1, HP-1", "ERU-1, HP-4", "DFC-1 , DCU-1", "EF-1", "GENERAL EXHAUST, EF-1", "EF-1, NOTE 2", "EF-1 & HP-2", "AHU, AHU-2"]) {
    assert.equal(expandMarkList(text), null, text);
  }
  // A bare number or letter after a "/" continues the mark before it, as
  // after a comma a key filter splits on; after words or a lone mark with no
  // letter it names nothing new.
  assert.deepEqual(splitRowMarks("EF-1/2", false), ["EF-1", "EF-2"]);
  assert.deepEqual(splitRowMarks("FOP-8A/B", false), ["FOP-8A", "FOP-8B"]);
  assert.deepEqual(splitRowMarks("EF-1, 2", true), ["EF-1", "EF-2"]);
  assert.deepEqual(splitRowMarks("EF-1, 2, 3", true), ["EF-1", "EF-2", "EF-3"]);
  assert.deepEqual(splitRowMarks("EF-1/A", false), ["EF-1", "A"]);
  assert.deepEqual(splitRowMarks("GENERAL EXHAUST 1, 2", true), ["GENERAL EXHAUST 1", "2"]);
  assert.deepEqual(splitRowMarks("GROUP REHEARSAL 112/111 - SUPPLY", true), ["GROUP REHEARSAL 112", "111 - SUPPLY"]);
  // Two marks of one family the extraction's key ran together are two; a mark
  // printing its letters once is one, however it ends.
  assert.deepEqual(expandEquipMarks("CH-1CH-2"), ["CH-1", "CH-2"]);
  assert.deepEqual(expandEquipMarks("B1B2"), ["B1", "B2"]);
  assert.deepEqual(expandEquipMarks("UH-1UH-2"), ["UH-1", "UH-2"]);
  for (const one of ["B12", "EF-12", "AHU-1A", "FOP-8AB", "CV-CHW-BP-A", "SF-P1-12"]) assert.deepEqual(expandEquipMarks(one), [one], one);
  // A printed list of one family's marks is read as printed, not as the key
  // the extraction ran together; two families' still give way to the key.
  assert.equal(rowMarkText("EF-1, EF-2", "EF-1EF-2", false), "EF-1, EF-2");
  assert.equal(rowMarkText("FOP-1, 2", "FOP-1/FOP-2", false), "FOP-1, 2");
  assert.equal(rowMarkText("ERU-1, HP-4", "ERU-1", false), "ERU-1");
});

test("a row listing two units reads both in the takeoff and the reconcile, keyed as the extraction keys it (AS-86)", () => {
  // Each spelling in the mark cell, the row keyed as the extraction keys that
  // spelling (rowKeyOf: EF-1/EF-2, EF-1EF-2, EF-12...), QTY 2.
  const spellings = ["EF-1 & 2", "EF-1, 2", "EF-1,2", "EF-1 & EF-2", "EF-1, EF-2", "EF-1/EF-2", "EF-1/2"];
  const listed = (title: string, header: string, text: string) => ({ tables: [as77Table("m.pdf#5", title, [header, "CFM", "QTY"], [
    { __key: rowKeyOf(text, "equipment")!.key, [header]: text, CFM: "400", QTY: "2" },
  ])] });
  const qty = (graph: object, family: string) => (compileHvacTakeoff(null, graph).categories as Record<string, { items: Array<{ tag: string; scheduled_qty?: number }> }>)[family]?.items
    .map((i) => `${markKey(i.tag)}=${i.scheduled_qty}`).sort();
  for (const text of spellings) {
    // A fan schedule, read through the fan's key filter, and a pump schedule,
    // read by its title alone; under MARK and under a header the extraction
    // merged with its group's (16_NV's GENERAL UNIT DATA F ~).
    for (const header of ["MARK", "GENERAL UNIT DATA F ~"]) {
      const fans = listed("EXHAUST FAN SCHEDULE", header, text);
      assert.deepEqual(as77Marks(fans), { FAN: { compile: ["EF1", "EF2"], reconcile: ["EF1", "EF2"] } }, `${text} ${header}`);
      assert.deepEqual(qty(fans, "FAN"), ["EF1=1", "EF2=1"], `${text} ${header} QTY`);
      const pumps = listed("PUMP SCHEDULE", header, text.replace(/EF/g, "P"));
      assert.deepEqual(as77Marks(pumps), { PUMP: { compile: ["P1", "P2"], reconcile: ["P1", "P2"] } }, `${text} ${header} pumps`);
    }
  }
  // Where the key is all the row prints (itd-d1-lab's canopy hoods), a key
  // the extraction ran together from two marks is read as the two.
  const keyOnly = (key: string) => ({ tables: [as77Table("m.pdf#12", "CANOPY HOOD SCHEDULE", ["CFM", "REMARKS"], [{ __key: key, CFM: "1800", REMARKS: "1 , 2" }])] });
  assert.deepEqual(as77Marks(keyOnly(rowKeyOf("CH-1 & CH-2", "equipment")!.key)), { RANGE_HOOD: { compile: ["CH1", "CH2"], reconcile: ["CH1", "CH2"] } });
  // 044_NY's duplex fuel oil pumps, under a header the extraction merged with
  // the schedule's title, keyed FOP-8AB.
  const duplex = { tables: [as77Table("n.pdf#21", "BOILER FUEL OIL PUMP SCHEDULE", ["SUMMER BOILER FUEL OIL PUMP SCHEDULE MARK", "SUMMER BOILER FUEL OIL PUMP SCHEDULE GPH"], [
    { __key: rowKeyOf("FOP-8A & B", "equipment")!.key, "SUMMER BOILER FUEL OIL PUMP SCHEDULE MARK": "FOP-8A & B", "SUMMER BOILER FUEL OIL PUMP SCHEDULE GPH": "220" },
  ])] };
  assert.equal(duplex.tables[0].rows[0].key, "FOP-8AB");
  assert.deepEqual(as77Marks(duplex), { PUMP: { compile: ["FOP8A", "FOP8B"], reconcile: ["FOP8A", "FOP8B"] } });
  // Negative controls. A key printing one mark's letters once stays one unit,
  // with no cell to read it from (CH-1/2 keyed CH-12 names CH-12). A row
  // naming two families' units under one family's title reads that family's
  // (Baker's ERU-1, HP-4, keyed ERU-1).
  assert.deepEqual(as77Marks(keyOnly(rowKeyOf("CH-1/2", "equipment")!.key)), { RANGE_HOOD: { compile: ["CH12"], reconcile: ["CH12"] } });
  const baker = { tables: [as77Table("o.pdf#8", "ENERGY RECOVERY UNIT SCHEDULE (WITH HEAT PUMP)", ["SYMBOL", "CFM"], [{ __key: "ERU-1", SYMBOL: "ERU-1, HP-4", CFM: "2000" }])] };
  assert.deepEqual(as77Marks(baker).ERV, { compile: ["ERU1"], reconcile: ["ERU1"] });
});

// AS-85: a footnote mark printed with a unit's mark.
test("a footnote mark printed with a unit's mark is no part of its name; a status or number in parentheses is (AS-85)", () => {
  // A star, dagger or superscript number before or after the mark, or a
  // period after its number, refers to a note.
  for (const [printed, mark] of [
    ["AHU-1*", "AHU-1"], ["AHU-1**", "AHU-1"], ["*AHU-1", "AHU-1"], ["** AHU-1", "AHU-1"], ["EF-2†", "EF-2"], ["EF-2‡", "EF-2"],
    ["P-1¹", "P-1"], ["P-1²³", "P-1"], ["AHU-1.", "AHU-1"], ["AHU-1A.", "AHU-1A"], ["RTU-G†", "RTU-G"], ["CV-CHW-BP-A*", "CV-CHW-BP-A"],
  ]) {
    assert.equal(plainMark(printed), mark, printed);
    assert.equal(normalizeEquipMark(printed), mark, printed);
  }
  // Read before the status a mark prints ahead of it.
  assert.equal(normalizeEquipMark("(N)AHU-1*"), "AHU-1");
  assert.equal(normalizeEquipMark("*(E)AHU-1"), "AHU-1");
  // A status or a number in parentheses can tell two units of one mark apart
  // (069_ID's AHU-1(E); P-1(1) beside P-1(2)), and a word's period is its own.
  for (const text of ["AHU-1(E)", "P-1(1)", "NO.", "AHU-1", "B1", "*"]) assert.equal(plainMark(text), text, text);
  // A list of one family's marks reads through a footnote mark on any of them.
  assert.deepEqual(expandMarkList("EF-1*, 2"), ["EF-1*", "EF-2"]);
  assert.deepEqual(expandMarkList("EF-1 & 2*"), ["EF-1", "EF-2"]);
  assert.deepEqual(expandMarkList("FOP-8A* & B"), ["FOP-8A*", "FOP-8B"]);
  assert.deepEqual(splitRowMarks("EF-1*/2", false).map((one) => normalizeEquipMark(one)), ["EF-1", "EF-2"]);
  assert.deepEqual(splitRowMarks("EF-1*, 2", true).map((one) => normalizeEquipMark(one)), ["EF-1", "EF-2"]);
});

test("a unit whose mark cell prints a footnote mark is read by its mark in the takeoff and the reconcile, keyed as the extraction keys it (AS-85)", () => {
  // The extraction keys a row by its name's letters and digits: EF-1* is
  // keyed EF-1, and the mark cell still prints EF-1*.
  const notes: Array<[string, (mark: string) => string]> = [
    ["star", (m) => `${m}*`], ["stars", (m) => `${m}**`], ["lead", (m) => `*${m}`], ["dagger", (m) => `${m}†`],
    ["double dagger", (m) => `${m}‡`], ["superscript", (m) => `${m}¹`], ["period", (m) => `${m}.`],
  ];
  const tags = (graph: object, family: string) => ((compileHvacTakeoff(null, graph).categories as Record<string, { items: Array<{ tag: string }> }>)[family]?.items ?? []).map((i) => i.tag);
  const rcTags = (graph: object, family: string) => (reconcileScheduleFamilyFromGraph(graph, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family)!) as Array<{ tag: string }>).map((r) => r.tag);
  for (const [what, note] of notes) {
    assert.equal(rowKeyOf(note("EF-1"), "equipment")?.key, "EF-1", what);
    // Under a fan schedule's key filter, a pump schedule's title, and a mark
    // column under another name.
    for (const header of ["MARK", "TAG"]) {
      const fans = { tables: [as77Table("m.pdf#5", "EXHAUST FAN SCHEDULE", [header, "CFM"], [
        { __key: "EF-1", [header]: note("EF-1"), CFM: "400" }, { __key: "EF-2", [header]: "EF-2", CFM: "300" },
      ])] };
      assert.deepEqual(as77Marks(fans), { FAN: { compile: ["EF1", "EF2"], reconcile: ["EF1", "EF2"] } }, `${what} ${header}`);
      assert.deepEqual(tags(fans, "FAN"), ["EF-1", "EF-2"], `${what} ${header}`);
      assert.deepEqual(rcTags(fans, "FAN").sort(), ["EF-1", "EF-2"], `${what} ${header}`);
      const pumps = { tables: [as77Table("m.pdf#6", "PUMP SCHEDULE", [header, "GPM"], [{ __key: "P-1", [header]: note("P-1"), GPM: "40" }])] };
      assert.deepEqual(as77Marks(pumps), { PUMP: { compile: ["P1"], reconcile: ["P1"] } }, `${what} ${header} pumps`);
    }
    // A row listing two units with a footnote mark on the list.
    const listed = { tables: [as77Table("m.pdf#5", "EXHAUST FAN SCHEDULE", ["MARK", "CFM"], [
      { __key: rowKeyOf(`EF-1 & ${note("2")}`, "equipment")!.key, MARK: `EF-1 & ${note("2")}`, CFM: "400" },
    ])] };
    if (what !== "lead") assert.deepEqual(as77Marks(listed), { FAN: { compile: ["EF1", "EF2"], reconcile: ["EF1", "EF2"] } }, `${what} list`);
  }
  // Negative controls: 069_ID's existing air handler and boilers, keyed
  // AHU-1E, B-1E and B-2E, keep the status their SYMBOL prints; P-1(1) and
  // P-1(2) are two pumps.
  const existing = { tables: [
    as77Table("i.pdf#5", "EXISTING AIR HANDLING UNIT SCHEDULE", ["SYMBOL", "TYPE"], [{ __key: "AHU-1E", SYMBOL: "AHU-1(E)", TYPE: "SEMI-CUSTOM" }]),
    as77Table("i.pdf#5", "EXISTING CONDENSING HOT WATER BOILER SCHEDULE", ["SYMBOL", "FUEL"], [
      { __key: "B-1E", SYMBOL: "B-1(E)", FUEL: "NATURAL GAS" }, { __key: "B-2E", SYMBOL: "B-2(E)", FUEL: "NATURAL GAS" },
    ]),
  ] };
  assert.deepEqual(tags(existing, "AHU"), ["AHU-1(E)"]);
  assert.deepEqual(tags(existing, "BOILER"), ["B-1(E)", "B-2(E)"]);
  assert.deepEqual(rcTags(existing, "BOILER").sort(), ["B-1(E)", "B-2(E)"]);
  const numbered = { tables: [as77Table("m.pdf#6", "PUMP SCHEDULE", ["MARK", "GPM"], [
    { __key: rowKeyOf("P-1(1)", "equipment")!.key, MARK: "P-1(1)", GPM: "40" }, { __key: rowKeyOf("P-1(2)", "equipment")!.key, MARK: "P-1(2)", GPM: "40" },
  ])] };
  assert.deepEqual(tags(numbered, "PUMP"), ["P-1(1)", "P-1(2)"]);
});

test("a mark printed with another dash glyph, a no-break space or a zero-width character reads as printed with a hyphen or a space (AS-85)", () => {
  // A word processor or PDF writer prints a mark's hyphen as another glyph.
  const glyphs = ["‐", "‑", "‒", "–", "—", "―", "−", "﹘", "﹣", "－"];
  for (const glyph of glyphs) {
    assert.equal(plainMark(`AHU${glyph}1`), "AHU-1", glyph);
    assert.equal(normalizeEquipMark(`SF${glyph}P1${glyph}4`), "SF-P1-4", glyph);
  }
  assert.equal(plainMark("AHU 1"), "AHU 1");
  assert.equal(plainMark("AHU​-1­"), "AHU-1");
  assert.equal(plainMark("AHU‐" + "1†"), "AHU-1");
  // A range, a list or a pair printed with another dash reads as one printed with a hyphen.
  assert.deepEqual(splitRowMarks("EF–1 – EF–4", false).map((one) => normalizeEquipMark(one)), ["EF-1", "EF-2", "EF-3", "EF-4"]);
  assert.deepEqual(splitRowMarks("EF‐1 THRU EF‐4", false).map((one) => normalizeEquipMark(one)), ["EF-1", "EF-2", "EF-3", "EF-4"]);
  assert.deepEqual(splitRowMarks("EF–1, 2", true).map((one) => normalizeEquipMark(one)), ["EF-1", "EF-2"]);
  assert.deepEqual(splitRowMarks("SF‑P2‑1 & 2", false).map((one) => normalizeEquipMark(one)), ["SF-P2-1", "SF-P2-2"]);
  assert.deepEqual(expandMarkList("EF–1, 2"), ["EF–1", "EF-2"]);
  // In the takeoff and the reconcile alike: an air handler, two boilers and a
  // fan printed with each glyph, the row keyed as the extraction keys it
  // (AHU‐1 is keyed AHU1), read and named as printed with a hyphen.
  const printed = (dash: string) => ({ tables: [
    as77Table("m.pdf#4", "AIR HANDLING UNIT SCHEDULE", ["MARK", "CFM"], [{ __key: rowKeyOf(`AHU${dash}1`, "equipment")!.key, MARK: `AHU${dash}1`, CFM: "4000" }]),
    as77Table("m.pdf#4", "BOILER SCHEDULE", ["MARK", "MBH"], [
      { __key: rowKeyOf(`B${dash}1`, "equipment")!.key, MARK: `B${dash}1`, MBH: "1000" }, { __key: rowKeyOf(`B${dash}2`, "equipment")!.key, MARK: `B${dash}2`, MBH: "1000" },
    ]),
    as77Table("m.pdf#5", "EXHAUST FAN SCHEDULE", ["MARK", "CFM"], [
      { __key: rowKeyOf(`EF${dash}1`, "equipment")!.key, MARK: `EF${dash}1`, CFM: "400" }, { __key: "EF-2", MARK: "EF-2", CFM: "300" },
    ]),
  ] });
  const tags = (graph: object) => Object.fromEntries(Object.entries(compileHvacTakeoff(null, graph).categories as Record<string, { items: Array<{ tag: string }> }>)
    .filter(([, c]) => c.items?.length).map(([family, c]) => [family, c.items.map((i) => i.tag).sort()]));
  const hyphen = printed("-");
  assert.deepEqual(tags(hyphen), { AHU: ["AHU-1"], BOILER: ["B-1", "B-2"], FAN: ["EF-1", "EF-2"] });
  for (const glyph of glyphs) {
    assert.equal(rowKeyOf(`AHU${glyph}1`, "equipment")?.key, "AHU1", glyph);
    assert.deepEqual(as77Marks(printed(glyph)), as77Marks(hyphen), glyph);
    assert.deepEqual(tags(printed(glyph)), tags(hyphen), glyph);
  }
});

test("a row's identity for the sweep and project_takeoff reads a mark in plain type; a list, a status and a note's number stay as printed (AS-85)", () => {
  const row = (key: string, cells: Record<string, string>) => ({ key, cells: Object.fromEntries(Object.entries(cells).map(([h, text]) => [h, { text }])) });
  // The extraction keys AHU‐1 as AHU1, which answers for no plan's AHU-1: the
  // row's printed identity, in plain type, does.
  assert.equal(rowIdentityTag(row("AHU1", { MARK: "AHU‐1", CFM: "4000" })), "AHU-1");
  assert.equal(rowIdentityTag(row("B1", { SYMBOL: "B−1" })), "B-1");
  assert.equal(rowIdentityTag(row("AHU2", { MARK: "AHU–2*" })), "AHU-2");
  assert.equal(rowIdentityTag(row("EF-1", { MARK: "EF-1*" })), "EF-1");
  assert.equal(rowIdentityTag(row("EF-3", { MARK: "EF-3¹" })), "EF-3");
  assert.equal(rowIdentityTag(row("P-2", { MARK: "P-2." })), "P-2");
  assert.equal(rowIdentityTag(row("AHU1", { MARK: "AHU 1" })), "AHU 1");
  // A list keeps its every mark for the split after it, in plain type; words
  // keep what they print.
  assert.equal(rowIdentityTag(row("AHU-1", { MARK: "AHU\u20101, HP\u20101" })), "AHU-1, HP-1");
  assert.equal(rowIdentityTag(row("EF-1/EF-2", { MARK: "EF-1* & 2" })), "EF-1* & 2");
  assert.equal(rowIdentityTag(row("DUCT SMOKE DETECTOR", { SYMBOL: "DUCT SMOKE DETECTOR*" })), "DUCT SMOKE DETECTOR*");
  assert.equal(rowIdentityTag(row("T.0", { MARK: "T.0." })), "T.0.");
  // A status or number in parentheses, a note's number and a key alone stay.
  assert.equal(rowIdentityTag(row("AHU-1E", { SYMBOL: "AHU-1(E)" })), "AHU-1(E)");
  assert.equal(rowIdentityTag(row("P-11", { MARK: "P-1(1)" })), "P-1(1)");
  assert.equal(rowIdentityTag(row("1", { MARK: "1." })), "1.");
  assert.equal(rowIdentityTag(row("EF-4", { CFM: "400" })), "EF-4");
  assert.equal(rowIdentityTag({ key: "", cells: {} }), null);
});

// AS-89: the plan sweep (session.ts sweepScheduleRow) finds a unit's row by
// the extraction's key or the row's printed identity; a unit the reconcile
// holds from a row answering by neither is found by the reconcile's own
// reading. Shapes from the dev corpus: 26_CA's range and a pair keyed run
// together, 22_GA's outdoor unit printed beside its indoor unit's mark,
// itd-d1-lab's grille symbol with its size run in, 044_NY's FOP-8A & B.
const as89Graph = () => ({ tables: [
  as77Table("m.pdf#10", "FAN SCHEDULE", ["MARK", "CFM"], [
    { MARK: "SF-P1-4 THRU 6", CFM: "9000" }, { MARK: "SF-P3-1 & 2", __key: "SF-P3-12", CFM: "10000" }, { MARK: "EF-7", CFM: "200" },
  ]),
  as77Table("m.pdf#11", "DUCTLESS SPLIT SYSTEM SCHEDULE", ["INDOOR UNIT MARK", "OUTDOOR UNIT MARK", "MIN. SEER"], [
    { "INDOOR UNIT MARK": "DAC-1", "OUTDOOR UNIT MARK": "DCU-1", "MIN. SEER": "13" },
    { "INDOOR UNIT MARK": "DAC-2", "OUTDOOR UNIT MARK": "DCU-2", "MIN. SEER": "13" },
  ]),
  as77Table("m.pdf#12", "RETURN & EXHAUST GRILLE SCHEDULE", ["SYMBOL", "NOMINAL SIZE"], [
    { SYMBOL: 'R-1 8"Ø', "NOMINAL SIZE": "10X10" }, { SYMBOL: "R-2 30x6", __key: "R-2 30X6", "NOMINAL SIZE": "30X6" },
  ]),
  as77Table("m.pdf#13", "BOILER FUEL OIL PUMP SCHEDULE", ["MARK", "GPH"], [{ MARK: "FOP-8A & B", __key: "FOP-8AB", GPH: "220" }]),
] });
/** Whether a row answers for the mark as the sweep's own lookup reads it. */
const as89Answers = (graph: { tables: Array<{ rows: any[] }> }, mark: string) =>
  graph.tables.some((tb) => tb.rows.some((r) => rowKeyAnswersFor(r.key || "", mark) || rowKeyAnswersFor(String(rowIdentityTag(r) || r.key || ""), mark)));

test("the sweep's row for a unit whose row answers by neither key nor identity is the row the reconcile reads it from: a range, a pair, an outdoor unit's column, a grille's symbol (AS-89)", () => {
  const graph = as89Graph();
  const found = (mark: string) => scheduleRowsReadingMark(graph, mark).map((h: any) => `${h.table.title.text} | ${h.row.key} | ${h.tag} | ${h.families.join(",")}`);
  const cases: Array<[string, string]> = [
    ["SF-P1-5", "FAN SCHEDULE | SF-P1-4 THRU 6 | SF-P1-5 | FAN"],
    ["SF-P3-2", "FAN SCHEDULE | SF-P3-12 | SF-P3-2 | FAN"],
    ["DCU-2", "DUCTLESS SPLIT SYSTEM SCHEDULE | DAC-2 | DCU-2 | CONDENSING_UNIT"],
    ["R-1", 'RETURN & EXHAUST GRILLE SCHEDULE | R-1 8"Ø | R-1 | GRD'],
    ["FOP-8B", "BOILER FUEL OIL PUMP SCHEDULE | FOP-8AB | FOP-8B | PUMP"],
  ];
  for (const [mark, want] of cases) {
    assert.equal(as89Answers(graph, mark), false, `${mark}: no key or identity answers for it`);
    assert.deepEqual(found(mark), [want], mark);
  }
  // A mark in any spelling the reading keys alike.
  assert.deepEqual(found("DCU 2"), found("DCU-2"));
  // Every unit the reconcile holds is found on the table its row cites.
  for (const family of Object.keys(HVAC_FAMILY_SPECS)) {
    for (const row of reconcileScheduleFamilyFromGraph(graph, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family)!) as any[]) {
      assert.deepEqual(scheduleRowsReadingMark(graph, row.tag).map((h: any) => h.table.title.text), [row.schedule_cite.title], `${family} ${row.tag}`);
    }
  }
  // Nothing for a mark no family reads, the indoor unit's letters alone, or a
  // unit beside the range.
  for (const mark of ["ZZ-9", "DCU", "SF-P1-7", "SF-P1-3", "R-3", "FOP-8C", "EF-8"]) assert.deepEqual(found(mark), [], mark);
  // The units the families reading a unit read in its table are its siblings;
  // the indoor unit its row also names is another family's.
  const split = scheduleTableView(graph.tables[1]);
  assert.deepEqual(scheduleMarksRead(graph, split).sort(), ["DAC-1", "DAC-2", "DCU-1", "DCU-2"]);
  assert.deepEqual(scheduleRowsReadingMark(graph, "DAC-1").map((h: any) => h.families), [["FCU"]]);
  assert.deepEqual(scheduleMarksRead(graph, split, ["CONDENSING_UNIT"]), ["DCU-1", "DCU-2"]);
  assert.deepEqual(scheduleMarksRead(graph, scheduleTableView(graph.tables[0]), ["FAN"]), ["SF-P1-4", "SF-P1-5", "SF-P1-6", "SF-P3-1", "SF-P3-2", "EF-7"]);
  assert.deepEqual(scheduleMarksRead(graph).sort(), ["DAC-1", "DAC-2", "DCU-1", "DCU-2", "EF-7", "FOP-8A", "FOP-8B", "R-1", "R-2", "SF-P1-4", "SF-P1-5", "SF-P1-6", "SF-P3-1", "SF-P3-2"]);
  // A mark two families read from one row (AS-80's CU-HP1) is both's, and
  // each family's units in the table are its siblings.
  const both = { tables: [as77Table("m.pdf#136", "OUTDOOR AIR-COOLED HEAT PUMP OR CONDENSING UNIT SCHEDULE", as80Headers,
    ["HP-2", "CU-1", "AC-1", "CU-HP1"].map(as80Row))] };
  assert.deepEqual(scheduleRowsReadingMark(both, "CU-HP1").map((h: any) => h.families), [["CONDENSING_UNIT", "HEAT_PUMP"]]);
  const combined = scheduleTableView(both.tables[0]);
  assert.deepEqual(scheduleMarksRead(both, combined, ["HEAT_PUMP"]).sort(), ["CU-HP1", "HP-2"]);
  assert.deepEqual(scheduleMarksRead(both, combined, ["CONDENSING_UNIT"]).sort(), ["AC-1", "CU-1", "CU-HP1"]);
});

test("reading a graph's rows for the sweep leaves the reconcile as it was, and reads again once the graph gains a table (AS-89)", () => {
  const graph = as89Graph();
  for (const family of Object.keys(HVAC_FAMILY_SPECS)) {
    const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family)!;
    assert.deepEqual(reconcileScheduleFamilyFromGraph(graph, needle, new Map(), { sources: new Map() }), reconcileScheduleFamilyFromGraph(graph, needle), family);
  }
  assert.deepEqual(scheduleRowsReadingMark(graph, "EF-9"), []);
  graph.tables.push(as77Table("m.pdf#14", "FAN SCHEDULE", ["MARK", "CFM"], [{ MARK: "EF-9 & 10", __key: "EF-910", CFM: "300" }]));
  assert.deepEqual(scheduleRowsReadingMark(graph, "EF-9").map((h: any) => h.row.key), ["EF-910"]);
  assert.deepEqual(scheduleRowsReadingMark(graph, "DCU-1").map((h: any) => h.row.key), ["DAC-1"]);
  // What it returns is a copy: editing it edits no later reading.
  scheduleRowsReadingMark(graph, "DCU-1")[0].families.push("FAN");
  assert.deepEqual(scheduleRowsReadingMark(graph, "DCU-1")[0].families, ["CONDENSING_UNIT"]);
  assert.deepEqual(scheduleRowsReadingMark(null, "DCU-1"), []);
  assert.deepEqual(scheduleMarksRead({}), []);
});

test("a unit the reading finds is told apart from every mark the set's schedules name: a bare D or DCU is no DCU-1 where DAC-1 or DCU-2 is scheduled (AS-89)", () => {
  const graph = as89Graph();
  const vocabulary = scheduleMarkVocabulary(graph);
  // Rows' identities as the sweep reads them (the printed pair, not the key
  // run together), and every unit read.
  for (const mark of ["DAC-1", "DAC-2", "SF-P3-1&2", "FOP-8A&B", "DCU-1", "DCU-2", "SF-P1-5", "SF-P3-2", "R-1", "FOP-8B"]) {
    assert.ok(vocabulary.includes(mark), mark);
  }
  assert.ok(!vocabulary.includes("SF-P3-12"), "a key run together names no unit");
  assert.equal(spanAnswersFor("D", "DCU-1", vocabulary), false);
  assert.equal(spanAnswersFor("DCU", "DCU-1", vocabulary), false);
  assert.equal(spanAnswersFor("DCU-1", "DCU-1", vocabulary), true);
  // 03_FL's plans print a bare "D" 37 times beside its one DCU-1: with the
  // unit's own family's marks alone (DCU-1), each would answer for it.
  assert.equal(spanAnswersFor("D", "DCU-1", ["DCU-1"]), true);
  // Its own copy.
  vocabulary.push("ZZ-1");
  assert.ok(!scheduleMarkVocabulary(graph).includes("ZZ-1"));
  assert.deepEqual(scheduleMarkVocabulary(null), []);
});

test("unscheduledUnitCandidates: the likely units are a takeoff family's own mark form on a plan, never grid, detail, zone, circuit, room, damper or air-device marks (AS-93)", () => {
  const fans = { kind: "equipment", title: { text: "FAN SCHEDULE" }, rows: ["EF-1", "EF-2", "EF-12"].map((k) => ({ key: k, cells: { MARK: { text: k } } })) };
  const pumps = { kind: "equipment", title: { text: "PUMP SCHEDULE" }, rows: [{ key: "P-1", cells: { MARK: { text: "P-1" } } }] };
  const dampers = { kind: "equipment", title: { text: "DAMPER SCHEDULE" }, rows: [{ key: "D-1", cells: { MARK: { text: "D-1" } } }] };
  const grilles = { kind: "equipment", title: { text: "DIFFUSER, REGISTER AND GRILLE SCHEDULE" }, rows: [{ key: "S1", cells: { MARK: { text: "S1" } } }] };
  const ahus = { kind: "equipment", title: { text: "AIR HANDLING UNIT SCHEDULE" }, rows: [{ key: "AHU-1", cells: { MARK: { text: "AHU-1" } } }] };
  const graph = {
    tables: [fans, pumps, dampers, grilles, ahus],
    tags: [
      tagFixture({ text: "EF-25", key: "EF25" }), // a fan no schedule lists: listed
      tagFixture({ text: "EF 30", key: "EF30", sheet: "set.pdf#2", role: "demolition" }), // existing, on a demolition plan: listed
      tagFixture({ text: "EF-26", key: "EF26", role: "detail" }), // in a detail: not a plan
      tagFixture({ text: "EF-27", key: "EF27", in_table: { sheet: "set.pdf#1", title: null } }), // table text
      tagFixture({ text: "P9", key: "P9" }), // a one-letter mark without the pumps' hyphen: a callout
      tagFixture({ text: "P-9", key: "P9" }), // a pump form: listed
      tagFixture({ text: "D57", key: "D57" }), // a detail callout
      tagFixture({ text: "D-9", key: "D9" }), // a damper: no takeoff family reads the damper schedule
      tagFixture({ text: "S7", key: "S7" }), // a grille type mark, not a unit
      tagFixture({ text: "AHU-1-Z-2", key: "AHU1Z2" }), // a zone label: another form
      tagFixture({ text: "T.1", key: "T1" }), // a grid bubble: no scheduled family
      tagFixture({ text: "PP-1-24", key: "PP124" }), // a circuit: no scheduled family
      tagFixture({ text: "EF-1", key: "EF1" }), // scheduled: never in either list
    ],
  };
  const { unscheduled_tags } = unscheduledTagsAndAliasCandidates(graph);
  assert.ok(unscheduled_tags.some((t: any) => t.text === "D57"), "the full review list keeps every unscheduled mark");
  assert.ok(unscheduled_tags.some((t: any) => t.text === "D-9"), "and every unscheduled damper mark");
  assert.deepEqual(unscheduledUnitCandidates(graph).map((t: any) => t.text), ["EF-25", "EF 30", "P-9"]);
});

test("unscheduledTagsAndAliasCandidates: a unit a row lists, or its mark with its zero dropped or added, is scheduled (AS-111)", () => {
  const row = (mark: string) => ({ key: mark, cells: { MARK: { text: mark } } });
  const table = (title: string, marks: string[]) => ({ kind: "equipment", title: { text: title }, rows: marks.map(row) });
  const graph = {
    tables: [
      table("SPLIT SYSTEM AIR CONDITIONING UNIT SCHEDULE", ["F-1 , CU-1"]),
      table("FAN COIL UNIT SCHEDULE", ["FCU-17-1&2", "FCU-20-1 THRU 3"]),
      table("FAN SCHEDULE", ["EF-1", "EF-2", "EF-12"]),
      table("HEAT PUMP SCHEDULE", ["HP-02"]),
      table("AIR HANDLING UNIT SCHEDULE", ["AHU 50-2"]),
      table("DOOR SCHEDULE", ["D03"]),
    ],
    tags: [
      tagFixture({ text: "F-1", key: "F1" }), // the furnace of "F-1 , CU-1"
      tagFixture({ text: "CU-1", key: "CU1" }), // and its condensing unit
      tagFixture({ text: "FCU-17-2", key: "FCU172" }), // the second of "FCU-17-1&2"
      tagFixture({ text: "FCU-20-2", key: "FCU202" }), // within a range
      tagFixture({ text: "EF-01", key: "EF01", role: "demolition" }), // EF-1 with its zero added
      tagFixture({ text: "HP-2", key: "HP2" }), // HP-02 with its zero dropped
      tagFixture({ text: "EF-25", key: "EF25" }), // a fan no row lists
      tagFixture({ text: "AHU-5-2", key: "AHU52" }), // not AHU 50-2: its number groups differ
      tagFixture({ text: "D3", key: "D3" }), // a diffuser type, not the door D03: no separator to read a padded number by
    ],
  };
  const { unscheduled_tags, alias_candidates } = unscheduledTagsAndAliasCandidates(graph);
  assert.deepEqual(unscheduled_tags.map((t: any) => t.text), ["EF-25", "AHU-5-2", "D3"]);
  assert.deepEqual(unscheduledUnitCandidates(graph).map((t: any) => t.text), ["EF-25", "AHU-5-2"]);
  assert.ok(!alias_candidates.some((c: any) => c.drawn === "CU1"), "a unit a row lists is no spelling drift of another row's mark (DCU-1-like neighbours stay as before)");
});

test("planOtherCites: a row's mark on a repeat view, as unattached text, and on a demolition plan links to it, never counts (AS-92)", () => {
  const sweep = {
    sheets: [
      { sheet: "set.pdf#4", matches: [{ at: [10, 10] }], redundant_view: [], text_only: [{ at: [50, 50] }] },
      { sheet: "set.pdf#6", matches: [], redundant_view: [{ at: [20, 20], tag_at: { x0: 18, y0: 18, x1: 24, y1: 22 }, kept_sheet: "set.pdf#4" }], text_only: [] },
    ],
  };
  const graph = { tags: [
    tagFixture({ text: "AHU-1", key: "AHU1", sheet: "set.pdf#2", role: "demolition", bbox: [100, 100, 110, 104] }),
    tagFixture({ text: "AHU-1", key: "AHU1", sheet: "set.pdf#9", role: "schedule", in_table: { sheet: "set.pdf#9", title: "AIR HANDLING UNIT SCHEDULE" } }),
    tagFixture({ text: "AHU-1", key: "AHU1", sheet: "set.pdf#8", role: "detail" }),
  ] };
  assert.deepEqual(planOtherCites(sweep, graph, "AHU-1"), [
    { sheet: "set.pdf#4", at: [50, 50], reason: "unattached_tag" },
    { sheet: "set.pdf#6", at: [20, 20], bbox: { x0: 18, y0: 18, x1: 24, y1: 22 }, reason: "repeat_view", counted_on: "set.pdf#4" },
    { sheet: "set.pdf#2", at: [105, 102], bbox: { x0: 100, y0: 100, x1: 110, y1: 104 }, reason: "demolition_view" },
  ]);
  // a sweep that threw still links the demolition plan
  assert.deepEqual(planOtherCites(null, graph, "AHU-1").map((c) => c.reason), ["demolition_view"]);
  // the reconcile row carries them, and its counted cites and status are untouched
  const [row] = reconcileRowsFromTakeoffItems([{
    tag: "AHU-1", equipment_type: "AHU", category: "equipment", schedule: { sheet: "set.pdf#9", kind: "equipment", title: "AIR HANDLING UNIT SCHEDULE" },
    schedule_row: { MARK: "AHU-1" }, quantity: 1, drawing_locations: [{ sheet: "set.pdf#4", at: [10, 10] }], siblings_excluded: [],
    corroborated: false, status: "resolved", source: "schedule_row", quantity_basis: "tag_attached_vector",
    plan_other_locations: planOtherCites(sweep, graph, "AHU-1"),
  }] as any);
  assert.equal(row.status, "MATCH");
  assert.equal(row.installed_qty, 1);
  assert.deepEqual(row.plan_cites.map((c: any) => c.sheet), ["set.pdf#4"]);
  assert.deepEqual(row.plan_other_cites.map((c: any) => c.reason), ["unattached_tag", "repeat_view", "demolition_view"]);
});

test("planOtherCites: a row's mark on a zone plan titled by its legend, a detail or a diagram links to it as a reference view, never counts (AS-109)", () => {
  // federal-mech's ground floor HVAC zone plan, titled HVAC ZONE LEGEND, labels
  // each zone with the unit serving it; the box itself is counted on the duct plan
  const sweep = { sheets: [{ sheet: "set.pdf#4", matches: [{ at: [10, 10] }], redundant_view: [], text_only: [] }] };
  const reference = [{ sheet: "set.pdf#2", at: [300, 200] as [number, number], bbox: { x0: 290, y0: 196, x1: 310, y1: 204 } }];
  assert.deepEqual(planOtherCites(sweep, { tags: [] }, "VAV-1", [], reference), [
    { sheet: "set.pdf#2", at: [300, 200], bbox: { x0: 290, y0: 196, x1: 310, y1: 204 }, reason: "reference_view" },
  ]);
  // a sweep that threw still links it; with none read, nothing is added
  assert.deepEqual(planOtherCites(null, { tags: [] }, "VAV-1", [], reference).map((c) => c.reason), ["reference_view"]);
  assert.deepEqual(planOtherCites(sweep, { tags: [] }, "VAV-1"), []);
  const [row] = reconcileRowsFromTakeoffItems([{
    tag: "VAV-1", equipment_type: "VAV", category: "equipment", schedule: { sheet: "set.pdf#16", kind: "equipment", title: "VOLUME CONTROL BOX SCHEDULE" },
    schedule_row: { MARK: "VAV-1" }, quantity: 1, drawing_locations: [{ sheet: "set.pdf#4", at: [10, 10] }], siblings_excluded: [],
    corroborated: false, status: "resolved", source: "schedule_row", quantity_basis: "tag_attached_vector",
    plan_other_locations: planOtherCites(sweep, { tags: [] }, "VAV-1", [], reference),
  }] as any);
  assert.equal(row.status, "MATCH");
  assert.equal(row.installed_qty, 1);
  assert.deepEqual(row.plan_cites.map((c: any) => c.sheet), ["set.pdf#4"]);
  assert.deepEqual(row.plan_other_cites.map((c: any) => [c.sheet, c.reason]), [["set.pdf#2", "reference_view"]]);
});

// AS-101: a mark on a demolition plan read as the sweep reads it (011_IL's
// "HP 12-1", which the graph's tag index does not read) links to its row,
// once however many readings find it.
test("planOtherCites: a demolition plan's tag the sweep reads links to its row, once (AS-101)", () => {
  const graph = { tags: [tagFixture({ text: "AHU-1", key: "AHU1", sheet: "set.pdf#2", role: "demolition", bbox: [100, 100, 110, 104] })] };
  const read = [
    { sheet: "set.pdf#2", at: [105, 102] as [number, number], bbox: { x0: 100, y0: 100, x1: 110, y1: 104 } },
    { sheet: "set.pdf#3", at: [40, 40] as [number, number], bbox: { x0: 35, y0: 38, x1: 45, y1: 42 } },
  ];
  assert.deepEqual(planOtherCites(null, graph, "AHU-1", read), [
    { sheet: "set.pdf#2", at: [105, 102], bbox: { x0: 100, y0: 100, x1: 110, y1: 104 }, reason: "demolition_view" },
    { sheet: "set.pdf#3", at: [40, 40], bbox: { x0: 35, y0: 38, x1: 45, y1: 42 }, reason: "demolition_view" },
  ]);
  // with no session reading, the tag index's alone, as before
  assert.deepEqual(planOtherCites(null, graph, "AHU-1").map((c) => c.sheet), ["set.pdf#2"]);
});

// AS-95: a mark column under a group heading. 12_MT's SPLIT SYSTEM HEAT PUMP
// SCHEDULE joins a two-row header, so its outdoor and indoor units' marks
// print under OUTDOOR UNIT DATA PLAN CODE and INDOOR UNIT DATA PLAN CODE, and
// the extraction keys every row by its MANUF. cell, DAIKIN.
test("a mark column under a group heading names the units a row's key names none of (AS-95)", () => {
  for (const h of ["OUTDOOR UNIT DATA PLAN CODE", "INDOOR UNIT DATA PLAN CODE", "FAN COIL SYMBOL", "HEAT PUMP SYMBOL", "AIR HANDLER PLAN MARK", "EXHAUST FAN MARK", "SUPPLY UNIT TAG"]) {
    assert.equal(isGroupedMarkHeader(h), true, h);
  }
  // a mark column's own names and synonyms are read as they always were; a
  // word that only ends in the letters is none
  for (const h of ["MARK", "PLAN CODE", "UNIT MARK", "EQUIPMENT TAG", "SYMBOL", "REMARKS", "TRADEMARK", "NOTES", "OUTDOOR UNIT DATA MODEL NUMBER"]) {
    assert.equal(isGroupedMarkHeader(h), false, h);
  }
  const headers = ["MANUF.", "OUTDOOR UNIT DATA PLAN CODE", "OUTDOOR UNIT DATA MODEL NUMBER", "INDOOR UNIT DATA PLAN CODE", "INDOOR UNIT DATA TYPE"];
  const rows = [["HP-1", "FC-1A"], ["HP-1", "FC-1B"], ["HP-2", "FC-4A"]].map(([hp, fc]) => ({
    __key: "DAIKIN", "MANUF.": "DAIKIN", "OUTDOOR UNIT DATA PLAN CODE": hp, "OUTDOOR UNIT DATA MODEL NUMBER": "RXTQ36TBVJU",
    "INDOOR UNIT DATA PLAN CODE": fc, "INDOOR UNIT DATA TYPE": "CEILING CASSETTE",
  }));
  const graph = { tables: [as77Table("m.pdf#28", "SPLIT SYSTEM HEAT PUMP SCHEDULE", headers, rows)] };
  // each family reads its own units, in the takeoff and the reconcile alike:
  // HP-1, the outdoor unit of two rows, once
  assert.deepEqual(as77Marks(graph), {
    FCU: { compile: ["FC1A", "FC1B", "FC4A"], reconcile: ["FC1A", "FC1B", "FC4A"] },
    HEAT_PUMP: { compile: ["HP1", "HP2"], reconcile: ["HP1", "HP2"] },
  });
  // the whole-set reconcile names each row by the first such column that prints a mark
  assert.deepEqual(graph.tables[0].rows.map((row) => rowIdentityTag(row)), ["HP-1", "HP-1", "HP-2"]);
  // a key that prints a mark keeps naming its row
  const keyed = as77Table("m.pdf#29", "FAN SCHEDULE", ["MARK", "SERVED UNIT TAG"], [{ MARK: "EF-1", "SERVED UNIT TAG": "AHU-1" }]);
  assert.equal(rowIdentityTag(keyed.rows[0]), "EF-1");
  // a key with no mark and no such column stays the key
  const plain = as77Table("m.pdf#30", "FAN SCHEDULE", ["MANUFACTURER", "CFM"], [{ MANUFACTURER: "GREENHECK", CFM: "400" }]);
  assert.equal(rowIdentityTag(plain.rows[0]), "GREENHECK");
});

// AS-96: a unit family's own schedule names one unit a mark, as an
// individually marked schedule's title says; never a type-mark family's.
test("a unit family's own schedule is individually marked; grilles, louvers, fin tube, doors and air devices are not (AS-96)", () => {
  const t = (title: string, key: string) => as77Table("m.pdf#1", title, ["MARK", "CFM"], [{ MARK: key, CFM: "100" }]);
  for (const [title, key] of [["TERMINAL AIR BOX SCHEDULE - SINGLE DUCT - PHASE 2", "TAB-101"], ["FANS (SPECIFICATION SECTION 23 34 00)", "SF-P1-1"],
    ["VOLUME CONTROL BOX SCHEDULE", "VAV-1"], ["FAN POWERED TERMINAL UNIT SCHEDULE (SECTION 23 36 00)", "FPB-3-11"], ["EXHAUST FANS", "KEF-1"]]) {
    assert.equal(isUnitFamilyTable(t(title, key)), true, title);
  }
  for (const [title, key] of [["GRILLE, REGISTER, AND DIFFUSER SCHEDULE", "S1-1"], ["LOUVER SCHEDULE", "L-1"], ["FIN TUBE RADIATION SCHEDULE", "FTR-1"],
    ["DOOR SCHEDULE", "101"], ["AIR DEVICE SCHEDULE", "S-1"], ["", "EF-1"]]) {
    assert.equal(isUnitFamilyTable(t(title, key)), false, title || "(untitled)");
  }
});

// AS-97: a plan may drop or add the zero a schedule pads a mark's number with.
test("a mark's zero respellings: its numbers unpadded, its last number padded, a lone zero kept (AS-97)", () => {
  assert.deepEqual(markZeroRespellings("HP-02"), ["HP-2"]);
  assert.deepEqual(markZeroRespellings("HP-2"), ["HP-02"]);
  assert.deepEqual(markZeroRespellings("AHU-010"), ["AHU-10"]);
  assert.deepEqual(markZeroRespellings("VAV-1-01"), ["VAV-1-1"]);
  assert.deepEqual(markZeroRespellings("VAV-1-1"), ["VAV-1-01"]);
  assert.deepEqual(markZeroRespellings("EF-12"), []);
  assert.deepEqual(markZeroRespellings("FCU-00"), []);
  assert.deepEqual(markZeroRespellings("RTU-A"), []);
});

// A plan tags an existing unit bare where its schedule prints the status
// after the mark (012_MO's "VFD-CT-1 (EXIST.)", tagged VFD-CT-1).
test("a mark without the status its schedule prints after it", () => {
  assert.equal(markWithoutTrailingStatus("VFD-CT-1 (EXIST.)"), "VFD-CT-1");
  assert.equal(markWithoutTrailingStatus("AHU-1(E)"), "AHU-1");
  assert.equal(markWithoutTrailingStatus("EF-2 (EXISTING)"), "EF-2");
  assert.equal(markWithoutTrailingStatus("CU-3 (N)"), "CU-3");
  assert.equal(markWithoutTrailingStatus("P-1 (RELOCATED)"), "P-1");
  // no status: a number, a quantity or a note in parentheses is not one
  assert.equal(markWithoutTrailingStatus("VFD-CT-1"), null);
  assert.equal(markWithoutTrailingStatus("P-1(1)"), null);
  assert.equal(markWithoutTrailingStatus("EF-1 (2 REQ'D)"), null);
  assert.equal(markWithoutTrailingStatus("(E) FC-1"), null);
  assert.equal(markWithoutTrailingStatus("(EXIST.)"), null);
});

test("a unit family's row names one unit once: never a typical row, a placeholder mark or a pair (AS-96)", () => {
  const row = (cells: Record<string, string>) => ({ cells: Object.fromEntries(Object.entries(cells).map(([h, text]) => [h, { text }])) });
  assert.equal(rowNamesOneUnitOnce(row({ MARK: "TAB-101", CFM: "400" }), "TAB-101"), true);
  // 26_CA's CAV-X-2, a toilet exhaust box on each of its TYPICAL FLOORS
  assert.equal(rowNamesOneUnitOnce(row({ DESIGNATION: "CAV-X-2", "TYPICAL FLOORS": "3-4, 6-34" }), "CAV-X-2"), false);
  assert.equal(rowNamesOneUnitOnce(row({ DESIGNATION: "CAV-2-1", "TYPICAL FLOORS": "2" }), "CAV-2-1"), false);
  assert.equal(rowNamesOneUnitOnce(row({ MARK: "VAV-X-1", CFM: "450" }), "VAV-X-1"), false);
  assert.equal(rowNamesOneUnitOnce(row({ MARK: "FCU-1", REMARKS: "TYP. OF 4" }), "FCU-1"), false);
  // 040_IL's split system: its indoor and outdoor units
  assert.equal(rowNamesOneUnitOnce(row({ SYMBOL: "SS-1/SSCU-1" }), "SS-1/SSCU-1"), false);
  assert.equal(rowNamesOneUnitOnce(row({ MARK: "EF-1 & 2" }), "EF-1 & 2"), false);
  // an X that is the mark's letters, not a placeholder
  assert.equal(rowNamesOneUnitOnce(row({ MARK: "HX-1" }), "HX-1"), true);
});

test("a unit family's row naming a range or list of one family's marks names each unit once (AS-106)", () => {
  const row = (cells: Record<string, string>) => ({ cells: Object.fromEntries(Object.entries(cells).map(([h, text]) => [h, { text }])) });
  // 26_CA's fans: a range with its QTY printed for the marks together, a pair
  assert.equal(rowNamesEachUnitOnce(row({ MARK: "SF-P1-4 THRU 11", QTY: "8" }), "SF-P1-4 THRU 11", "SF-P1-4"), true);
  assert.equal(rowNamesEachUnitOnce(row({ MARK: "SF-P1-4 THRU 11", QTY: "8" }), "SF-P1-4 THRU 11", "SFP1-11"), true);
  assert.equal(rowNamesEachUnitOnce(row({ MARK: "EF-P1-1 & 2" }), "EF-P1-1 & 2", "EF-P1-2"), true);
  assert.equal(rowNamesEachUnitOnce(row({ MARK: "EF-1, 2, 3" }), "EF-1, 2, 3", "EF-3"), true);
  // a mark the row does not name, a quantity other than one per mark, typical units
  assert.equal(rowNamesEachUnitOnce(row({ MARK: "SF-P1-4 THRU 11" }), "SF-P1-4 THRU 11", "SF-P1-12"), false);
  assert.equal(rowNamesEachUnitOnce(row({ MARK: "EF-1 THRU 4", QTY: "8" }), "EF-1 THRU 4", "EF-2"), false);
  assert.equal(rowNamesEachUnitOnce(row({ MARK: "EF-1 THRU 4", REMARKS: "TYPICAL" }), "EF-1 THRU 4", "EF-2"), false);
  assert.equal(rowNamesEachUnitOnce(row({ MARK: "CAV-X-1 THRU 3" }), "CAV-X-1 THRU 3", "CAV-X-2"), false);
  // one mark (AS-96's rule), two families' marks: 040_IL's split system stands for two systems
  assert.equal(rowNamesEachUnitOnce(row({ MARK: "EF-1" }), "EF-1", "EF-1"), false);
  assert.equal(rowNamesEachUnitOnce(row({ SYMBOL: "SS-1/SSCU-1" }), "SS-1/SSCU-1", "SS-1"), false);
  assert.equal(rowNamesEachUnitOnce(row({ MARK: "AHU-1, HP-1" }), "AHU-1, HP-1", "AHU-1"), false);
});

// AS-98: a whole-set reconcile row naming several units reconciles each.
test("a row naming a range or a list of one family's units names each, with its share of the row (AS-98)", () => {
  assert.deepEqual(rowUnitMarks("SF-P1-4 THRU 7"), ["SF-P1-4", "SF-P1-5", "SF-P1-6", "SF-P1-7"].map((tag) => ({ tag, marks: 4 })));
  assert.deepEqual(rowUnitMarks("EF-P1-1 & 2"), [{ tag: "EF-P1-1", marks: 2 }, { tag: "EF-P1-2", marks: 2 }]);
  assert.deepEqual(rowUnitMarks("WCU-2-1 ,2"), [{ tag: "WCU-2-1", marks: 2 }, { tag: "WCU-2-2", marks: 2 }]);
  // one mark, two families' marks, words: one unit, as printed
  assert.deepEqual(rowUnitMarks("AHU-1"), [{ tag: "AHU-1", marks: 1 }]);
  assert.deepEqual(rowUnitMarks("AHU-1, HP-1"), [{ tag: "AHU-1, HP-1", marks: 1 }]);
  assert.deepEqual(rowUnitMarks("SS-1/SSCU-1"), [{ tag: "SS-1/SSCU-1", marks: 1 }]);
  assert.deepEqual(rowUnitMarks(""), []);
  // the row's printed QTY counts them all, never each
  const [one] = reconcileRowsFromTakeoffItems([{
    tag: "EF-P1-1", equipment_type: "Fan", category: "equipment", schedule: { sheet: "s.pdf#10", kind: "equipment", title: "FANS" },
    schedule_row: { MARK: "EF-P1-1 & 2", QTY: "2" }, row_marks: 2, quantity: 1, drawing_locations: [{ sheet: "s.pdf#39", at: [1, 1] }],
    siblings_excluded: [], corroborated: false, status: "resolved", source: "schedule_row", quantity_basis: "tag_attached_vector",
  }] as any);
  assert.equal(one.scheduled_qty, 1);
  assert.equal(one.scheduled_qty_basis, "printed_schedule_quantity_per_mark");
});

// AS-99: a whole-set reconcile row stands for every unit the takeoff counts
// from it, as the takeoff reads the row (takeoffUnitsByRow).
test("a whole-set row stands for each unit the takeoff counts from it: a split system's pair, a pair of one family's units, an indoor unit beside its outdoor unit (AS-99)", () => {
  const u = (tag: string, marks = 1) => ({ tag, marks });
  // a name the takeoff reads as several units: those units, never one unit drawn nowhere
  assert.deepEqual(rowReconcileUnits("F-1 , CU-1", [u("F-1"), u("CU-1")]), [u("F-1"), u("CU-1")]);
  assert.deepEqual(rowReconcileUnits("B-1/B-2", [u("B-1", 2), u("B-2", 2)]), [u("B-1", 2), u("B-2", 2)]);
  assert.deepEqual(rowReconcileUnits("FOP-8AB", [u("FOP-8A", 2), u("FOP-8B", 2)]), [u("FOP-8A", 2), u("FOP-8B", 2)]);
  // an outdoor unit's row counts its indoor units too; its name stays
  assert.deepEqual(rowReconcileUnits("HP-5", [u("FC-1"), u("FC-2")]), [u("HP-5"), u("FC-1"), u("FC-2")]);
  // a unit another row of the set names keeps that row
  assert.deepEqual(rowReconcileUnits("HP-5", [u("FC-1"), u("FC-2")], new Set([reconcileUnitKey("FC 1")])), [u("HP-5"), u("FC-2")]);
  // a name that prints the unit counted from it in another spelling stands as it is
  assert.deepEqual(rowReconcileUnits("(E) CT-1", [u("CT-1")]), [u("(E) CT-1")]);
  assert.deepEqual(rowReconcileUnits("CV-FCU-1-HHW", [u("FCU-1"), u("CV-FCU-1-HHW")]), [u("CV-FCU-1-HHW")]);
  assert.deepEqual(rowReconcileUnits("FC-1 , HP-1", [u("FC-1")]), [u("FC-1 , HP-1")]);
  // a name no unit is counted from, and a list the name schedules itself
  assert.deepEqual(rowReconcileUnits("AHU-1", []), [u("AHU-1")]);
  assert.deepEqual(rowReconcileUnits("EF-1 & 2", [u("EF-1", 2), u("EF-2", 2)]), [u("EF-1", 2), u("EF-2", 2)]);
  // a mark run on into a longer number is not the name's
  assert.deepEqual(rowReconcileUnits("FC-10", [u("FC-1")]), [u("FC-10"), u("FC-1")]);

  // 12_MT's split system heat pumps: the takeoff counts each indoor unit and
  // the outdoor unit of two rows once, from its first row
  const headers = ["MANUF.", "OUTDOOR UNIT DATA PLAN CODE", "OUTDOOR UNIT DATA MODEL NUMBER", "INDOOR UNIT DATA PLAN CODE", "INDOOR UNIT DATA TYPE"];
  const rows = [["HP-1", "FC-1A"], ["HP-1", "FC-1B"], ["HP-2", "FC-4A"]].map(([hp, fc]) => ({
    __key: "DAIKIN", "MANUF.": "DAIKIN", "OUTDOOR UNIT DATA PLAN CODE": hp, "OUTDOOR UNIT DATA MODEL NUMBER": "RXTQ36TBVJU",
    "INDOOR UNIT DATA PLAN CODE": fc, "INDOOR UNIT DATA TYPE": "CEILING CASSETTE",
  }));
  const graph = { tables: [as77Table("m.pdf#28", "SPLIT SYSTEM HEAT PUMP SCHEDULE", headers, rows)] };
  const byRow = takeoffUnitsByRow(graph);
  const table = graph.tables[0];
  assert.deepEqual(table.rows.map((row) => (byRow.get(row) ?? []).map((c) => `${c.family}:${c.tag}`).sort()),
    [["FCU:FC-1A", "HEAT_PUMP:HP-1"], ["FCU:FC-1B"], ["FCU:FC-4A", "HEAT_PUMP:HP-2"]]);
  // the whole-set reconcile's rows: HP-1 once (the loop's scope dedupe), each indoor unit
  const seen = new Set<string>();
  const units = table.rows.flatMap((row) => rowReconcileUnits(rowIdentityTag(row) ?? "", byRow.get(row) ?? []))
    .filter(({ tag }) => !seen.has(tag) && !!seen.add(tag)).map(({ tag }) => tag);
  assert.deepEqual(units, ["HP-1", "FC-1A", "FC-1B", "HP-2", "FC-4A"]);
  // the takeoff counts exactly these, and no other
  assert.deepEqual(as77Marks(graph), {
    FCU: { compile: ["FC1A", "FC1B", "FC4A"], reconcile: ["FC1A", "FC1B", "FC4A"] },
    HEAT_PUMP: { compile: ["HP1", "HP2"], reconcile: ["HP1", "HP2"] },
  });
});

test("a valve row names its water by the coil it serves, abbreviated as drafters print it (07_MO's CONTROL VALVE SCHEDULE)", () => {
  const row = (cells: Record<string, string>) => ({ cells: Object.fromEntries(Object.entries(cells).map(([h, text]) => [h, { text }])) });
  assert.equal(valveRowService(row({ SERVES: "AHU-1 c c" })), "CHW");
  assert.equal(valveRowService(row({ SERVES: "RTU-2 c/c" })), "CHW");
  assert.equal(valveRowService(row({ SERVES: "AHU-1 H/C" })), "HHW");
  assert.equal(valveRowService(row({ SERVES: "FCU-1 HC" })), "HHW");
  assert.equal(valveRowService(row({ SERVES: "VAV BOX REHEAT COILS" })), "HHW");
  assert.equal(valveRowService(row({ SERVES: "AHU-2 COOLING COIL" })), "CHW");
  // A unit's mark that only holds the letters names none.
  assert.equal(valveRowService(row({ SERVES: "HC-1" })), null);
  assert.equal(valveRowService(row({ SERVES: "CCU-1" })), null);
  const valves = { sheet: "m.pdf#3", kind: "equipment", title: { text: "CONTROLVALVESCHEDULE *" }, headers: ["TAG", "SERVES", "VALVE TYPE", "FLOW (GPM)", "CV"],
    rows: [["CV1", "AHU-1 c c"], ["CV2", "AHU-1 H/C"], ["CV-7 THRU35", "VAVBOX REHEAT COILS"]].map(([t, s]) => ({ key: t,
      cells: { TAG: { text: t }, SERVES: { text: s }, "VALVE TYPE": { text: "GLOBE 2WAY" }, "FLOW (GPM)": { text: "12" }, CV: { text: "7.8" } } })) };
  const cats = compileHvacTakeoff(null, { tables: [valves] }).categories as Record<string, { items: Array<{ tag: string }> }>;
  assert.deepEqual(cats.CHW_CONTROL_VALVE.items.map((i) => i.tag), ["CV1"]);
  assert.equal(cats.HHW_CONTROL_VALVE.items.length, 1 + 29);
});
