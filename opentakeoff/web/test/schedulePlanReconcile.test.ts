// Schedule ↔ plan reconcile table — shared path unit tests (set-agnostic).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyReconcileStatus,
  classifyBasServedSweepOutcome,
  familyNeedleFromSpecs,
  reconcileRowsFromTakeoffItems,
  summarizeReconcile,
  reconcileScheduleFamilyFromGraph,
  reconcileRowsToCsv,
} from "../src/lib/schedulePlanReconcile.mjs";
import { HVAC_FAMILY_SPECS } from "../src/lib/corpusTakeoff.mjs";
import {
  classifyTakeoffIntent,
  advanceTakeoffWorkflow,
} from "../src/lib/takeoffWorkflow.js";


test("row identity prefers VALVE MARK over UNIT MARK (Pillar C valve join)", () => {
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

test("reconcileRowsFromTakeoffItems maps takeoff items to contractor columns", () => {
  const rows = reconcileRowsFromTakeoffItems([
    {
      tag: "VAV-1",
      equipment_type: "VAV box",
      category: "terminal",
      status: "resolved",
      quantity: 1,
      schedule: { sheet: "M-601.pdf#2", kind: "equipment", title: "VOLUME CONTROL BOX SCHEDULE" },
      drawing_locations: [{ sheet: "M-601.pdf#5", at: [100, 200] }],
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
  assert.equal(rows[0].status, "MATCH");
  assert.equal(rows[0].scheduled_qty, 1);
  assert.equal(rows[0].installed_qty, 1);
  assert.equal(rows[1].status, "SCHEDULE_ONLY");
  const summary = summarizeReconcile(rows);
  assert.equal(summary.match, 1);
  assert.equal(summary.schedule_only, 1);
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
    ["VAV-1", { installedQty: 1, itemStatus: "resolved", planCites: [{ sheet: "plan.pdf#3" }] }],
  ]);
  const rows = reconcileScheduleFamilyFromGraph(
    graph,
    { label: "VAV", titleRe: /VOLUME CONTROL BOX/i },
    sweepByTag,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "MATCH");
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
      status: "MATCH",
      schedule_cite: { sheet: "s.pdf#1", title: "VAV SCHEDULE" },
      plan_cites: [{ sheet: "s.pdf#2" }],
      reason: null,
    },
  ]);
  assert.match(csv, /^Tag,/);
  assert.match(csv, /VAV-1/);
  assert.match(csv, /MATCH/);
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
