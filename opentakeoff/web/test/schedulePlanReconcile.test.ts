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
} from "../src/lib/schedulePlanReconcile.mjs";
import { HVAC_FAMILY_SPECS } from "../src/lib/corpusTakeoff.mjs";
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
