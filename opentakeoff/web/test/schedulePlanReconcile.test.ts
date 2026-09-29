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
  servedEquipmentTag,
  unscheduledTagsAndAliasCandidates,
} from "../src/lib/schedulePlanReconcile.mjs";
import {
  HVAC_FAMILY_SPECS, compileHvacTakeoff, valveRowService, rowIdentityText, familyReadsUnitMark, hasValveOrDamperMark,
  inferValveServiceFromTable, familyTableGate, scheduleTableView,
} from "../src/lib/corpusTakeoff.mjs";
import {
  classifyTakeoffIntent,
  advanceTakeoffWorkflow,
} from "../src/lib/takeoffWorkflow.js";
import { markKey } from "../src/lib/markid.ts";


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
