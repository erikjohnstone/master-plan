/**
 * T-BAS-01 title gate + I/O LIST row compile (shared UI+MCP path).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  basEstimatorStatus,
  compileBasTakeoff,
  detectSooPresence,
  isBasPointsListTitle,
  isBasPointTypeTable,
  isSooNarrativeTitle,
  ocrFixEquipMark,
  equipMarkFromBasDescription,
  servedEquipmentFromBasRow,
  probeBasProofSpareColumnHeaders,
} from "../src/lib/corpusTakeoff.mjs";

describe("isBasPointsListTitle", () => {
  it("accepts POINTS / DDC / I/O list titles and rejects equipment schedules", () => {
    assert.equal(isBasPointsListTitle("POINTS LIST DOAH-TI"), true);
    assert.equal(isBasPointsListTitle("AIR OPS HHW SYSTEM POINT LIST"), true);
    assert.equal(isBasPointsListTitle("FCU WITH COOLING COILS DDC POINTS LIST"), true);
    assert.equal(isBasPointsListTitle("I/O LIST WHITE STURGEON PLC"), true);
    assert.equal(isBasPointsListTitle("IO LIST PANEL A"), true);
    assert.equal(isBasPointsListTitle("DDC CONTROLLER INPUT/OUTPUT SUMMARY"), true);
    // A caption whose POINT LIST lost its space in the text layer (028_TX); a
    // narrative POINT LIST TABLE stays out however it is spaced.
    assert.equal(isBasPointsListTitle("BAS INPUT/OUTPUT POINTLIST"), true);
    assert.equal(isBasPointsListTitle("AHU-1 POINTLIST TABLE"), false);
    assert.equal(isBasPointsListTitle("PUMP CONTROL POINTS"), true);
    assert.equal(isBasPointsListTitle("DDC CONTROLLER INPUT/OUTPUT LEGEND"), true);
    assert.equal(isBasPointsListTitle("CONTROLLER I/O SUMMARY"), true);
    assert.equal(isBasPointsListTitle("MISCELLANEOUS POINTS SCHEDULE"), true);
    assert.equal(isBasPointsListTitle("POINTS SCHEDULE"), true);
    assert.equal(isBasPointsListTitle("HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - AHU-1"), true);
    assert.equal(isBasPointsListTitle("VARIABLE FREQUENCY DRIVE BACNET INTERFACE SCHEDULE"), true);
    // SOO narrative captions — not extractable typed points rows.
    assert.equal(isBasPointsListTitle("AHU-1 POINT LIST TABLE"), false);
    assert.equal(isBasPointsListTitle("FAN SCHEDULE"), false);
    assert.equal(isBasPointsListTitle("RADIO LIST"), false);
    // Northport-shaped system I/O matrix (SYSTEM/INDICATION/ALARM/CONTROL) —
    // not a typed POINTS/DDC list; accepting it would invent fake BAS rows.
    assert.equal(isBasPointsListTitle("INPUT/OUTPUT SUMMARY"), false);
    assert.equal(isBasPointsListTitle("INPUT OUTPUT SUMMARY"), false);
    assert.equal(isBasPointsListTitle(""), false);
  });

  it("reads a caption the text layer printed with no spaces (021_XX's M-803)", () => {
    assert.equal(isBasPointsListTitle("DDCCONTROLLERINPUTOUTPUTSUMMARY"), true);
    assert.equal(isBasPointsListTitle("CRAHDDCPOINTSLIST"), true);
    assert.equal(isBasPointsListTitle("AHU-1POINTLISTTABLE"), false);
    assert.equal(isBasPointsListTitle("AIRHANDLINGUNITSCHEDULE"), false);
    assert.equal(isBasPointsListTitle("INPUTOUTPUTSUMMARY"), false);
    // A caption printed with its spaces is read as printed, never compacted.
    assert.equal(isBasPointsListTitle("RADIO LIST"), false);
  });
});

describe("compileBasTakeoff row semantics", () => {
  it("does not count printed I/O section labels as points", () => {
    const bas = compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#1", number: 1 }],
      tables: [{
        kind: "equipment",
        sheet: "set.pdf#1",
        title: { text: "CRAH DDC POINTS LIST", bbox: [0, 0, 10, 10] },
        rows: [
          { key: "ANALOG INPUT", cells: { DESCRIPTION: { text: "ANALOG INPUT" } } },
          { key: "AI01", cells: { DESCRIPTION: { text: "SPACE TEMPERATURE" } } },
          { key: "ANALOG OUTPUT", cells: { DESCRIPTION: { text: "ANALOG OUTPUT" } } },
          { key: "AO01", cells: { DESCRIPTION: { text: "CHW VALVE CONTROL" } } },
          { key: "BINARY INPUT", cells: { DESCRIPTION: { text: "BINARY INPUT" } } },
          { key: "BI01", cells: { DESCRIPTION: { text: "DIRTY FILTER SWITCH" } } },
          { key: "BINARY OUTPUT", cells: { DESCRIPTION: { text: "BINARY OUTPUT" } } },
          { key: "BO01", cells: { DESCRIPTION: { text: "FAN START/STOP" } } },
        ],
      }],
    });

    assert.equal(bas.totals.rows, 4);
    assert.deepEqual(
      { AI: bas.totals.AI, AO: bas.totals.AO, BI: bas.totals.BI, BO: bas.totals.BO },
      { AI: 1, AO: 1, BI: 1, BO: 1 },
    );
    assert.deepEqual(
      bas.categories.points_lists.lists[0].items.map((item) => item.tag),
      ["AI01", "AO01", "BI01", "BO01"],
    );
  });

  it("types wildcard marks and merges same-page fragments of one titled list", () => {
    const bas = compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#2", number: 2 }],
      tables: [
        {
          kind: "reference",
          sheet: "set.pdf#2",
          title: { text: "PLANT HHW SYSTEM POINT LIST", bbox: [0, 0, 10, 10] },
          rows: [
            { key: "AI01", cells: { DESCRIPTION: { text: "SUPPLY TEMPERATURE" } } },
            {
              key: "BI BI##",
              cells: {
                MARK: { text: "BI##" },
                DESCRIPTION: { text: "ISOLATION DAMPER CLOSED" },
              },
            },
          ],
        },
        {
          kind: "reference",
          sheet: "set.pdf#2",
          title: { text: "PLANT HHW SYSTEM POINT LIST", bbox: [20, 0, 30, 10] },
          rows: [
            { key: "AO01", cells: { DESCRIPTION: { text: "BYPASS VALVE CONTROL" } } },
            { key: "BO", cells: { MARK: { text: "BO#" }, DESCRIPTION: { text: "DAMPER CONTROL" } } },
          ],
        },
      ],
    });

    assert.equal(bas.totals.lists, 1);
    assert.deepEqual(
      { rows: bas.totals.rows, AI: bas.totals.AI, AO: bas.totals.AO, BI: bas.totals.BI, BO: bas.totals.BO },
      { rows: 4, AI: 1, AO: 1, BI: 1, BO: 1 },
    );
    assert.deepEqual(bas.page_accounting.pages[0].titles, ["PLANT HHW SYSTEM POINT LIST"]);
    assert.deepEqual(
      bas.categories.points_lists.lists[0].items.map((item) => item.tag),
      ["AI01", "BI##", "AO01", "BO#"],
    );
  });
});

describe("basEstimatorStatus", () => {
  it("always marks estimator incomplete; refuse_not_done means unfinished work", () => {
    const status = basEstimatorStatus({
      lists: [{
        items: [
          { tag: "AI01", served_equipment: "AHU-1" },
          { tag: "AO01" },
        ],
      }],
      totals: { rows: 2 },
      sheets: [{ key: "s#1" }],
    });
    assert.equal(status.estimator_complete, false);
    assert.equal(status.gt_locked, false);
    assert.match(status.meaning, /refuse_not_done/);
    assert.equal(status.printed_lists, "partial_printed_only");
    assert.equal(status.served_equipment.with_join, 1);
    assert.equal(status.served_equipment.without_join, 1);
    const byGate = Object.fromEntries(status.gates.map((g) => [g.gate, g.status]));
    assert.equal(byGate.printed_points_lists, "open");
    assert.equal(byGate.plan_paint, "refuse_not_done");
    assert.equal(byGate.soo_derived_points, "refuse_not_done");
    assert.equal(byGate.spare_io_capacity, "refuse_not_done");
    assert.equal(byGate.gt_lock, "refuse_not_done");
  });

  it("compileBasTakeoff attaches estimator_status (printed lists ≠ Pillar C done)", () => {
    const bas = compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#1", number: 1 }],
      tables: [{
        sheet: "set.pdf#1",
        title: { text: "POINTS LIST AHU-1", bbox: [0, 0, 10, 10] },
        rows: [
          { key: "AI01", cells: { DESCRIPTION: { text: "SA TEMP" }, UNIT: { text: "AHU-1" } } },
        ],
      }],
    });
    assert.equal(bas.estimator_status.estimator_complete, false);
    assert.equal(bas.estimator_status.gt_locked, false);
    assert.ok(bas.estimator_status.gates.some((g) => g.status === "refuse_not_done"));
  });

  it("builds labeled schedule estimate + SOO/gap without merging into printed totals", () => {
    const bas = compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#1", number: 1 }],
      tables: [
        {
          sheet: "set.pdf#1",
          title: { text: "SEQUENCE OF OPERATIONS AHU" },
          rows: [{ key: "NOTE", cells: {} }],
        },
        {
          sheet: "set.pdf#1",
          title: { text: "AIR HANDLING UNIT SCHEDULE" },
          rows: [
            { key: "AHU-1", cells: { MARK: { text: "AHU-1" } } },
            { key: "AHU-2", cells: { MARK: { text: "AHU-2" } } },
          ],
        },
        {
          sheet: "set.pdf#1",
          title: { text: "POINTS LIST AHU-1" },
          rows: [
            { key: "AI01", cells: { DESCRIPTION: { text: "SA TEMP" }, UNIT: { text: "AHU-1" } } },
          ],
        },
      ],
    });
    assert.equal(bas.totals.rows, 1, "printed totals stay list-only");
    assert.ok(bas.estimator_product);
    assert.equal(bas.estimator_product.schedule_derived_estimate.label, "estimate_only");
    assert.equal(bas.estimator_product.schedule_derived_estimate.never_merge_into_printed_truth, true);
    assert.ok(bas.estimator_product.schedule_derived_estimate.totals.points > bas.totals.rows);
    assert.equal(bas.estimator_product.soo.present, true);
    assert.match(bas.estimator_product.soo.status, /not_row_extractable|present/);
    assert.ok(bas.estimator_product.gap_vs_printed.inventory_without_printed_points_count >= 1);
    assert.equal(bas.estimator_status.estimator_complete, false);
    assert.ok(bas.estimator_status.gates.some((g) => g.gate === "soo_derived_points" && g.status === "refuse_not_done"));
    assert.ok(bas.estimator_status.gates.some((g) => g.gate === "schedule_derived_estimate_not_merged"));
    // Plan-paint targets carry HVAC table_title as prefer_schedule_title (never invented).
    assert.equal(bas.estimator_product.plan_paint.status, "refuse_not_done");
    assert.ok(Array.isArray(bas.estimator_product.plan_paint.targets));
    assert.ok(bas.estimator_product.plan_paint.targets.some(
      (t) => t.tag === "AHU-1" && /AIR HANDLING UNIT SCHEDULE/i.test(String(t.prefer_schedule_title || "")),
    ));
  });

  it("plan_paint targets include unique served_equipment with HVAC preferTitle", () => {
    const bas = compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#1", number: 1 }],
      tables: [
        {
          sheet: "set.pdf#1",
          title: { text: "DOMESTIC HOT WATER PUMP SCHEDULE", bbox: [0, 0, 10, 10] },
          rows: [{ key: "HWP-1", cells: { MARK: { text: "HWP-1" } } }],
        },
        {
          sheet: "set.pdf#1",
          title: { text: "I/O LIST WHITE STURGEON PLC", bbox: [0, 20, 10, 30] },
          rows: [{ key: "HWP-1", cells: { TAG: { text: "HWP-1" }, DESCRIPTION: { text: "PUMP RUN" } } }],
        },
      ],
    });
    assert.ok(bas.estimator_product.plan_paint.targets.some(
      (t) => t.tag === "HWP-1" && /PUMP SCHEDULE/i.test(String(t.prefer_schedule_title || "")),
    ));
  });

  it("plan_paint pairs graph-resolved title with owning sheet (not wrong inventory sheet)", () => {
    const graph = {
      sheets: [{ key: "set.pdf#13", number: 13 }, { key: "set.pdf#37", number: 37 }],
      tables: [
        {
          sheet: "set.pdf#13",
          title: { text: "", bbox: [0, 0, 10, 10] },
          rows: [{ key: "HWP-1", cells: { TAG: { text: "HWP-1" }, EQUIPMENT: { text: "PUMP" } } }],
        },
        {
          sheet: "set.pdf#37",
          title: { text: "EQUIPMENT SCHEDULE", bbox: [0, 0, 10, 10] },
          rows: [{ key: "HWP-1", cells: { ID: { text: "HWP-1" }, DESCRIPTION: { text: "HOT WATER PUMP" } } }],
        },
        {
          sheet: "set.pdf#37",
          title: { text: "I/O LIST WHITE STURGEON PLC", bbox: [0, 20, 10, 30] },
          rows: [{ key: "HWP-1", cells: { COL1: { text: "HWP-1" } } }],
        },
      ],
    };
    const bas = compileBasTakeoff(null, graph);
    const target = bas.estimator_product.plan_paint.targets.find((t) => t.tag === "HWP-1");
    assert.ok(target, "served_equipment HWP-1 target emitted");
    assert.match(String(target.prefer_schedule_title || ""), /EQUIPMENT SCHEDULE/i);
    assert.equal(target.prefer_schedule_sheet, "set.pdf#37");
  });
});

describe("isSooNarrativeTitle + detectSooPresence", () => {
  it("detects SOO titles and never treats them as POINTS lists", () => {
    assert.equal(isSooNarrativeTitle("SEQUENCE OF OPERATIONS"), true);
    assert.equal(isSooNarrativeTitle("CONTROL SEQUENCE AHU-1"), true);
    assert.equal(isBasPointsListTitle("SEQUENCE OF OPERATIONS"), false);
    assert.equal(isBasPointsListTitle("AHU-1 POINT LIST TABLE"), false);
    const soo = detectSooPresence({
      tables: [{ title: { text: "SEQUENCE OF OPERATIONS — CHILLERS" }, sheet: "m#9" }],
    });
    assert.equal(soo.present, true);
    assert.equal(soo.tabular_extractable, false);
  });
});

describe("probeBasProofSpareColumnHeaders", () => {
  it("detects explicit PROOF/SPARE columns on BAS tables; ignores CAPACITY-only equipment headers", () => {
    const probe = probeBasProofSpareColumnHeaders({
      tables: [
        {
          sheet: "set.pdf#1",
          title: { text: "AHU-1 POINTS LIST" },
          headers: ["MARK", "PROOF", "SPARE I/O", "ALARM"],
        },
        {
          sheet: "set.pdf#2",
          title: { text: "AIR HANDLING UNIT SCHEDULE" },
          headers: ["MARK", "CAPACITY (TONS)"],
        },
      ],
    });
    assert.equal(probe.status, "printed_columns_present");
    assert.deepEqual(probe.proof_interlock_column_headers, ["PROOF"]);
    assert.deepEqual(probe.spare_io_column_headers, ["SPARE I/O"]);
    assert.equal(probe.hits.length, 1);
  });
});

describe("compileBasTakeoff I/O LIST", () => {
  it("counts exact printed HARDWARE POINT TYPE cells and normalizes DI/DO to BI/BO", () => {
    const graph = {
      sheets: [{ key: "set.pdf#1", number: 1 }],
      tables: [
        {
          sheet: "set.pdf#1",
          title: { text: "BMS POINT FUNCTION SCHEDULE", bbox: [0, 0, 10, 10] },
          rows: [
            { key: "1", cells: { "HARDWARE POINT TYPE": { text: "AI", bbox: [10, 10, 20, 20] } } },
            { key: "2", cells: { "HARDWARE POINT TYPE": { text: "AO", bbox: [10, 20, 20, 30] } } },
            { key: "3", cells: { "HARDWARE POINT TYPE": { text: "DI", bbox: [10, 30, 20, 40] } } },
            { key: "4", cells: { "HARDWARE POINT TYPE": { text: "DO", bbox: [10, 40, 20, 50] } } },
          ],
        },
      ],
    };
    const bas = compileBasTakeoff(null, graph);
    assert.deepEqual(
      { AI: bas.totals.AI, AO: bas.totals.AO, BI: bas.totals.BI, BO: bas.totals.BO },
      { AI: 1, AO: 1, BI: 1, BO: 1 },
    );
    assert.deepEqual(
      bas.categories.points_lists.lists[0].items.map((item) => [item.point_type, item.point_type_raw]),
      [["AI", "AI"], ["AO", "AO"], ["BI", "DI"], ["BO", "DO"]],
    );
  });

  // 27_WA's I/O LIST counts 49 of its 52 devices' I/O; BS-1 PNL and WSHP-1
  // on BACnet and the hatchery's panel on Modbus count none.
  it("does not count an I/O list's device row that counts no I/O where its other rows do", () => {
    const device = (key: string, cells: Record<string, string>) => ({
      key, cells: Object.fromEntries(Object.entries({ COL1: key, ...cells }).map(([h, text]) => [h, { text }])),
    });
    const headers = ["COL1", "ANALOG", "ANALOG 2", "DIGITAL", "DIGITAL 2", "COMMUNICATION PROTOCOL"];
    const list = (rows: ReturnType<typeof device>[]) => compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#38", number: 38 }],
      tables: [{ kind: "equipment", sheet: "set.pdf#38", title: { text: "I/O LIST WHITE STURGEON PLC" }, headers, rows }],
    }).categories.points_lists.lists[0];
    const counted = list([
      device("HWP-1", { "ANALOG 2": "1", DIGITAL: "1", "DIGITAL 2": "1", "COMMUNICATION PROTOCOL": "ETHERNET/IP" }),
      device("PIT-116", { ANALOG: "1", "COMMUNICATION PROTOCOL": "NONE" }),
      device("LIFT STATION", { DIGITAL: "4", "DIGITAL 2": "1", "COMMUNICATION PROTOCOL": "NONE" }),
      device("BS-1 PNL", { "COMMUNICATION PROTOCOL": "BACNET /IP" }),
      device("WSHP-1", { "COMMUNICATION PROTOCOL": "BACNET /IP" }),
    ]);
    assert.equal(counted.rows, 3);
    assert.deepEqual(counted.items.map((i: { tag: string }) => i.tag), ["HWP-1", "PIT-116", "LIFT STATION"]);
    assert.deepEqual(counted.not_points.map((n: { tag: string }) => n.tag), ["BS-1 PNL", "WSHP-1"]);
    // Where most rows count none, the list is read as before: every row.
    const few = list([
      device("HWP-1", { ANALOG: "1" }),
      device("BS-1 PNL", { "COMMUNICATION PROTOCOL": "BACNET /IP" }),
      device("WSHP-1", { "COMMUNICATION PROTOCOL": "BACNET /IP" }),
    ]);
    assert.equal(few.rows, 3);
    assert.deepEqual(few.not_points, []);
  });

  // 041_IL's VAV TERMINAL POINTS LIST closes with its totals line, "TOTAL
  // HARDWARE (6)" under its hardware columns and "TOTAL SOFTWARE (18)" under
  // its software ones.
  it("does not count a points list's totals line as a point", () => {
    const point = (key: string, cells: Record<string, string> = {}) => ({
      key, cells: Object.fromEntries(Object.entries({ COL1: key, ...cells }).map(([h, text]) => [h, { text }])),
    });
    const list = compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#24", number: 24 }],
      tables: [{
        kind: "reference", sheet: "set.pdf#24", title: { text: "VAV TERMINAL POINTS LIST" },
        headers: ["COL1", "HARDWARE POINTS", "SOFTWARE POINTS"],
        rows: [
          point("ZONE TEMPERATURE", { "HARDWARE POINTS": "X" }),
          point("TOTAL AIRFLOW", { "SOFTWARE POINTS": "X" }),
          point("TOTAL HARDWARE (6)", { "HARDWARE POINTS": "4" }),
          point("TOTAL SOFTWARE (18)"),
          point("TOTAL POINTS BY TYPE:", { "HARDWARE POINTS": "6" }),
          point("TOTALS:"),
        ],
      }],
    }).categories.points_lists.lists[0];
    // A point named for the total it measures is a point.
    assert.deepEqual(list.items.map((i: { tag: string }) => i.tag), ["ZONE TEMPERATURE", "TOTAL AIRFLOW"]);
    assert.equal(list.rows, 2);
  });

  // 061_IA's M-502 stacks its HEATING HOT WATER PLANT POINTS LIST under its
  // VAV zone list on the same columns; read as one table, the lower list's
  // header ("POINT DESCRIPTION | UNIT | TYPE") sits between the two lists'
  // points (#316).
  it("does not count a row that prints its own columns' labels as a point", () => {
    const headers = ["POINT DESCRIPTION", "UNIT", "TYPE DI", "TYPE AI", "TYPE DO", "TYPE AO", "ALARMS"];
    const row = (cells: string[]) => ({
      key: cells[0], cells: Object.fromEntries(headers.map((h, i) => [h, { text: cells[i] ?? "" }]).filter(([, c]) => (c as { text: string }).text)),
    });
    const list = compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#57", number: 57 }],
      tables: [{
        kind: "equipment", sheet: "set.pdf#57", title: { text: "TYPICAL VARIABLE AIR VOLUME ZONE POINTS LIST" }, headers,
        rows: [
          row(["HEATING PLANT REQUESTS", "-", "X"]),
          row(["POINT DESCRIPTION", "UNIT", "TYPE", "TYPE", "TYPE", "TYPE", "ALARMS"]),
          row(["NUMBER OF HEATING REQUESTS", "-", "X"]),
          row(["STEAM PRESSURE", "PSIG", "", "X", "", "", "IF GREATER THAN 20 PSIG (adj.)"]),
          // A point whose only echo is its own description is still a point.
          row(["UNIT", "-", "", "", "X"]),
        ],
      }],
    }).categories.points_lists.lists[0];
    assert.deepEqual(list.items.map((i: { tag: string }) => i.tag), ["HEATING PLANT REQUESTS", "NUMBER OF HEATING REQUESTS", "STEAM PRESSURE", "UNIT"]);
    assert.equal(list.rows, 4);
  });

  // 041_IL's 40-AHU-2 POINTS LIST: SUPPLY AIR TEMPERATURE | AI-1 | SA-T, its
  // type columns ticked with drawn dots no text reads.
  it("types a point named in words by its list's point-ID column", () => {
    const point = (key: string, cells: Record<string, string>) => ({
      key, cells: Object.fromEntries(Object.entries({ COL1: key, ...cells }).map(([h, text]) => [h, { text, bbox: [0, 0, 1, 1] }])),
    });
    const list = (rows: ReturnType<typeof point>[]) => compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#24", number: 24 }],
      tables: [{ kind: "reference", sheet: "set.pdf#24", title: { text: "40-AHU-2 POINTS LIST" }, headers: ["COL1", "COL2", "COL3", "POINT TYPE"], rows }],
    }).categories.points_lists.lists[0];
    const typed = list([
      point("SUPPLY AIR TEMPERATURE", { COL2: "AI-1", COL3: "SA-T" }),
      point("SUPPLY FAN START/STOP", { COL2: "BO-1", COL3: "SF-SS" }),
      point("SUPPLY FAN STATUS", { COL2: "DI 3", COL3: "SF-S" }),
      point("HEATING VALVE", { COL2: "AO-2", COL3: "HV", "POINT TYPE": "AI" }),
      point("SPARE INPUT", { COL3: "SP" }),
    ]);
    assert.deepEqual(
      typed.items.map((i: { point_type: string | null; point_type_raw: string | null; point_type_basis: string | null }) => [i.point_type, i.point_type_raw, i.point_type_basis]),
      [
        ["AI", "AI-1", "point_id_column"],
        ["BO", "BO-1", "point_id_column"],
        ["BI", "DI 3", "point_id_column"],
        // The ID and the type cell disagree: no type.
        [null, "AI", "conflicting_mark_and_point_type_cell"],
        // A row with no ID is untyped.
        [null, null, null],
      ],
    );
    assert.deepEqual([typed.AI, typed.AO, typed.BI, typed.BO], [1, 0, 1, 1]);
    // An ID on two rows proves no column.
    const few = list([
      point("SUPPLY AIR TEMPERATURE", { COL2: "AI-1" }),
      point("SUPPLY FAN STATUS", { COL2: "BI-1" }),
      point("ZONE TEMPERATURE", { COL2: "ZN-T" }),
      point("MIXED AIR TEMPERATURE", { COL2: "MA-T" }),
    ]);
    assert.deepEqual(few.items.map((i: { point_type: string | null }) => i.point_type), [null, null, null, null]);
  });

  it("refuses conflicting MARK and explicit point-type evidence", () => {
    const graph = {
      sheets: [{ key: "set.pdf#1", number: 1 }],
      tables: [{
        sheet: "set.pdf#1",
        title: { text: "AHU-1 POINTS LIST", bbox: [0, 0, 10, 10] },
        rows: [{ key: "AI01", cells: { "HARDWARE POINT TYPE": { text: "DO", bbox: [10, 10, 20, 20] } } }],
      }],
    };
    const bas = compileBasTakeoff(null, graph);
    assert.equal(bas.totals.AI, 0);
    assert.equal(bas.totals.BO, 0);
    assert.equal(bas.categories.points_lists.lists[0].items[0].point_type, null);
    assert.equal(bas.categories.points_lists.lists[0].items[0].point_type_status, "REFUSED_POINT_TYPE_CONFLICT");
  });

  it("does not count a section label printed alone in the tag column (021_XX's FUME HOOD)", () => {
    const TAG = "DDC CONTROLLER INPUT/OUTPUT LEGEND CONTROL DEVICE TAG ID";
    const DESC = "DDC CONTROLLER INPUT/OUTPUT LEGEND CONTROL DEVICE DESCRIPTION";
    const bas = compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#18", number: 18 }],
      tables: [{
        kind: "equipment",
        sheet: "set.pdf#18",
        title: { text: "DDC CONTROLLER INPUT/OUTPUT SUMMARY", bbox: [0, 0, 10, 10] },
        rows: [
          { key: "V-2", cells: { [TAG]: { text: "V-2" }, [DESC]: { text: "VALVE MODULATION 2" } } },
          { key: "FUMEHOOD", cells: { [TAG]: { text: "FUME HOOD" }, [DESC]: { text: "" } } },
          { key: "PT-1", cells: { [TAG]: { text: "PT-1" }, [DESC]: { text: "SUPPLY AIR DUCT STATIC PRESSURE" } } },
          { key: "SPARE", cells: { [TAG]: { text: "SPARE" } } },
          { key: "OIL PRESSURE", cells: { [DESC]: { text: "OIL PRESSURE" } } },
        ],
      }],
    });
    assert.deepEqual(
      bas.categories.points_lists.lists[0].items.map((item: { tag: string }) => item.tag),
      ["V-2", "PT-1", "SPARE", "OIL PRESSURE"],
    );
    assert.equal(bas.totals.rows, 4);
  });

  it("reads a points matrix that ticks each point's type, software, trend and alarm columns (012_MO's M701)", () => {
    const HW = "DDC HARD WIRED POINTS";
    const point = (n: string, name: string, ticks: Record<string, { text: string; bbox?: number[] }>) => ({
      key: name,
      cells: { COL1: { text: n }, COL2: { text: name }, ...ticks },
    });
    const X = { text: "X" };
    const bas = compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#20", number: 20 }],
      tables: [{
        sheet: "set.pdf#20",
        title: { text: "DDC POINTS LIST SUMMARY - CHILLED WATER SYSTEM", bbox: [0, 0, 10, 10] },
        headers: ["COL1", "COL2", HW, `${HW} 2`, `${HW} 3`, `${HW} 4`, "INTEGRATION", "INTEGRATION 2", "INTEGRATION 3",
          "GUI APPLICATION", "ALARMING SCENARIOS", "ALARM PRIORITIES"],
        rows: [
          {
            key: "CONTROL POINTS",
            cells: {
              COL1: { text: "#" }, COL2: { text: "CONTROL POINTS" },
              [HW]: { text: "DIGITAL INPUTS" }, [`${HW} 2`]: { text: "DIGITAL OUTPUTS" },
              [`${HW} 3`]: { text: "ANALOG INPUTS" }, [`${HW} 4`]: { text: "ANALOG OUTPUTS" },
              INTEGRATION: { text: "BINARY VARIABLE" }, "INTEGRATION 2": { text: "ANALOG VARIABLE" },
              "INTEGRATION 3": { text: "MULTISTAGE VARIABLE" }, "GUI APPLICATION": { text: "TREND LOGGING" },
              "ALARMING SCENARIOS": { text: "POINT STATUS" }, "ALARM PRIORITIES": { text: "MAJOR" },
            },
          },
          point("1", "CHILLED WATER SYSTEM ENABLE", { "GUI APPLICATION": X }),
          point("2", "CHILLER 1 - REMOTE ENABLE", { [`${HW} 2`]: { text: "X", bbox: [40, 20, 44, 24] }, "GUI APPLICATION": X, "ALARM PRIORITIES": X }),
          point("3", "CHILLER 1 - STATUS", { "INTEGRATION 3": X, "GUI APPLICATION": X, "ALARMING SCENARIOS": X }),
          point("4", "CHILLED WATER SUPPLY TEMPERATURE", { [`${HW} 3`]: X, "GUI APPLICATION": X }),
          point("5", "CHILLED WATER BYPASS VALVE", { [`${HW} 4`]: X }),
          point("6", "CHILLER 1 - FLOW SWITCH", { [HW]: X }),
          point("7", "PUMP 1 - SPEED", { [`${HW} 3`]: X, [`${HW} 4`]: X }),
        ],
      }],
    });
    const { rows, AI, AO, BI, BO, alarm, trend, hardwired, soft } = bas.totals;
    // The label row is no point; PUMP 1 - SPEED ticks two types and stays untyped.
    assert.deepEqual({ rows, AI, AO, BI, BO, alarm, trend, hardwired, soft },
      { rows: 7, AI: 1, AO: 1, BI: 1, BO: 1, alarm: 2, trend: 4, hardwired: 4, soft: 1 });
    const items = bas.categories.points_lists.lists[0].items;
    const enable = items.find((item: { tag: string }) => item.tag === "CHILLER 1 - REMOTE ENABLE")!;
    assert.deepEqual(
      [enable.point_type, enable.point_type_raw, enable.point_type_basis, enable.wiring, enable.alarm, enable.trend, enable.point_type_bbox_px],
      ["BO", "DIGITAL OUTPUTS", "ticked_point_type_column", "hardwired", "X", "X", [40, 20, 44, 24]],
    );
    const status = items.find((item: { tag: string }) => item.tag === "CHILLER 1 - STATUS")!;
    assert.deepEqual([status.point_type, status.wiring], [null, "soft"]);
    const gui = items.find((item: { tag: string }) => item.tag === "CHILLED WATER SYSTEM ENABLE")!;
    assert.deepEqual([gui.point_type, gui.wiring, gui.trend, gui.alarm], [null, null, "X", null]);
    const speed = items.find((item: { tag: string }) => item.tag === "PUMP 1 - SPEED")!;
    assert.deepEqual([speed.point_type, speed.point_type_status, speed.wiring], [null, "REFUSED_POINT_TYPE_CONFLICT", null]);
  });

  it("reads a filled square as a tick under a point function schedule's alarm and TREND columns, its types from POINT TYPE (019_FL's M8.3)", () => {
    const TICK = { text: "■" };
    const point = (n: string, name: string, tag: string, type: string, ticks: Record<string, { text: string }>) => ({
      key: n,
      cells: { COL1: { text: n }, "POINT NAME": { text: name }, "HARDWARE TAG": { text: tag }, "HARDWARE POINT TYPE": { text: type }, ...ticks },
    });
    const bas = compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#19", number: 19 }],
      tables: [{
        sheet: "set.pdf#19",
        title: { text: "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - CHW SYSTEM", bbox: [0, 0, 10, 10] },
        headers: ["COL1", "POINT NAME", "HARDWARE TAG", "HARDWARE POINT TYPE", "SOFTWARE MAINTENANCE ALARM",
          "SOFTWARE ALARM INSTRUCTIONS", "SOFTWARE MAINTENANCE WORK ORDER", "SOFTWARE ALARM LIMITS", "SOFTWARE TREND",
          "ALARM LIMITS LOW LIMIT"],
        rows: [
          point("1", "CHWR TEMPERATURE", "T-1", "AI", { "SOFTWARE ALARM INSTRUCTIONS": TICK, "SOFTWARE ALARM LIMITS": TICK, "SOFTWARE TREND": TICK }),
          point("3", "CHILLER ALARM STATUS", "AX-1", "DI", { "SOFTWARE MAINTENANCE ALARM": TICK, "SOFTWARE MAINTENANCE WORK ORDER": TICK }),
          point("5", "CHILLER POWER CONSUMPTION", "CI-1", "AO", {}),
          point("12", "DIFFERENTIAL PRESSURE", "DP-1", "AI", { "SOFTWARE ALARM INSTRUCTIONS": TICK, "SOFTWARE TREND": TICK,
            "ALARM LIMITS LOW LIMIT": { text: "5 PSI" } }),
          point("15", "PUMP STATUS", "CSR-1", "DI", { "SOFTWARE TREND": TICK }),
          // An empty box is a box left unticked.
          point("16", "PUMP START/STOP", "SS-1", "DO", { "SOFTWARE TREND": { text: "□" } }),
        ],
      }],
    });
    const { rows, AI, AO, BI, BO, alarm, trend } = bas.totals;
    assert.deepEqual({ rows, AI, AO, BI, BO, alarm, trend }, { rows: 6, AI: 2, AO: 1, BI: 2, BO: 1, alarm: 3, trend: 3 });
    const items = bas.categories.points_lists.lists[0].items;
    assert.deepEqual(items.map((item: { alarm: string | null; trend: string | null }) => [item.alarm, item.trend]),
      [["■", "■"], ["■", null], [null, null], ["■", "■"], [null, "■"], [null, null]]);
  });

  it("reads ticks under abbreviated type columns, a HARDWARE / SOFTWARE POINTS label row, and no blank numbered line (028_TX's BAS INPUT/OUTPUT POINT LISTs)", () => {
    const X = { text: "X" };
    const bas = compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#2", number: 2 }],
      tables: [
        {
          sheet: "set.pdf#2",
          title: { text: "BAS INPUT/OUTPUT POINT LIST", bbox: [0, 0, 10, 10] },
          headers: ["TAG", "POINT NAME", "AI", "AO", "DI", "DO", "ALARM"],
          rows: [
            { key: "1", cells: { TAG: { text: "1" }, "POINT NAME": { text: "FAN ON/OFF" }, DO: X } },
            { key: "2", cells: { TAG: { text: "2" }, "POINT NAME": { text: "FAN STATUS" }, DI: X } },
            { key: "3", cells: { TAG: { text: "3" }, "POINT NAME": { text: "FAN FAILURE" }, ALARM: X } },
            { key: "4", cells: { TAG: { text: "4" }, "POINT NAME": { text: "SUPPLY AIR TEMPERATURE" }, AI: X } },
            { key: "5", cells: { TAG: { text: "5" }, "POINT NAME": { text: "OUTSIDE AIR DAMPER" }, AO: X } },
          ],
        },
        {
          sheet: "set.pdf#2",
          // The text layer dropped the caption's space (POINTLIST).
          title: { text: "BAS INPUT/OUTPUT POINTLIST", bbox: [0, 20, 10, 30] },
          headers: ["COL1", "COL2", "HARDWARE POINTS", "HARDWARE POINTS 2", "HARDWARE POINTS 3", "HARDWARE POINTS 4",
            "SOFTWARE POINTS", "SOFTWARE POINTS 2", "SOFTWARE POINTS 3", "SOFTWARE POINTS 4"],
          rows: [
            {
              key: "TAG",
              cells: {
                COL1: { text: "TAG" }, COL2: { text: "POINT NAME" }, "HARDWARE POINTS": { text: "AI" }, "HARDWARE POINTS 2": { text: "AO" },
                "HARDWARE POINTS 3": { text: "DI" }, "HARDWARE POINTS 4": { text: "DO" }, "SOFTWARE POINTS": { text: "AV" },
                "SOFTWARE POINTS 2": { text: "BV" }, "SOFTWARE POINTS 3": { text: "TREND" }, "SOFTWARE POINTS 4": { text: "ALARM" },
              },
            },
            { key: "1", cells: { COL1: { text: "1" }, COL2: { text: "WATER FLOW RATE" }, "HARDWARE POINTS": X, "SOFTWARE POINTS 3": X } },
            { key: "2", cells: { COL1: { text: "2" }, COL2: { text: "DEMAND" }, "SOFTWARE POINTS": X, "SOFTWARE POINTS 3": X } },
            { key: "3", cells: { COL1: { text: "3" }, COL2: { text: "METER FAILURE" }, "SOFTWARE POINTS 4": X } },
            // Numbered lines left blank are no points.
            { key: "4", cells: { COL1: { text: "4" } } },
            { key: "5", cells: { COL1: { text: "5" }, COL2: { text: "" } } },
          ],
        },
      ],
    });
    assert.equal(bas.categories.points_lists.lists.length, 2);
    const { rows, AI, AO, BI, BO, alarm, trend, hardwired, soft } = bas.totals;
    // DI and DO read as BI and BO; AV is a software value; only the column
    // under HARDWARE POINTS says its point is wired.
    assert.deepEqual({ rows, AI, AO, BI, BO, alarm, trend, hardwired, soft },
      { rows: 8, AI: 2, AO: 1, BI: 1, BO: 1, alarm: 2, trend: 2, hardwired: 1, soft: 1 });
    const [plain, grouped] = bas.categories.points_lists.lists;
    assert.deepEqual(plain.items.map((item: { point_type: string | null; point_type_raw: string | null; wiring: string | null }) =>
      [item.point_type, item.point_type_raw, item.wiring]),
    [["BO", "DO", null], ["BI", "DI", null], [null, null, null], ["AI", "AI", null], ["AO", "AO", null]]);
    assert.deepEqual(grouped.items.map((item: { tag: string; point_type: string | null; wiring: string | null }) =>
      [item.tag, item.point_type, item.wiring]),
    [["1", "AI", "hardwired"], ["2", null, "soft"], ["3", null, null]]);
  });

  it("types a point by a bare TYPE column where it prints an I/O type, and leaves a TYPE that names what a point senses alone (045_FL's CONTROL POINTS SCHEDULE, 096_IN's MISCELLANEOUS POINTS SCHEDULE)", () => {
    const row = (mark: string, type: string, description = "") => ({
      key: mark,
      cells: { MARK: { text: mark }, TYPE: { text: type, bbox: [10, Number(mark) * 5, 14, Number(mark) * 5 + 4] }, ...(description ? { DESCRIPTION: { text: description } } : {}) },
    });
    const bas = compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#21", number: 21 }],
      tables: [
        {
          sheet: "set.pdf#21",
          title: { text: "CONTROL POINTS SCHEDULE (THIS SHEET ONLY)", bbox: [0, 0, 10, 10] },
          headers: ["MARK", "TYPE", "DESCRIPTION", "NOTES"],
          rows: [
            row("1", "AO", "FAN COIL UNITS CHILLED WATER COIL VALVE MODULATION"),
            row("2", "AI", "FAN COIL UNITS FAN MOTOR CURRENT"),
            row("3", "DO", "FAN COIL UNITS ON/OFF"),
            row("4", "SPARE"),
          ],
        },
        {
          sheet: "set.pdf#21",
          title: { text: "MISCELLANEOUS POINTS SCHEDULE", bbox: [0, 20, 10, 30] },
          headers: ["MARK", "TYPE", "DESCRIPTION"],
          rows: [row("1", "FLOW", "DOMESTIC WATER FLOW"), row("2", "GENERAL ALARM", "GENERATOR")],
        },
      ],
    });
    const [control, misc] = bas.categories.points_lists.lists;
    assert.deepEqual(control.items.map((item: { point_type: string | null; point_type_raw: string | null; point_type_status: string }) =>
      [item.point_type, item.point_type_raw, item.point_type_status]),
    [["AO", "AO", "typed"], ["AI", "AI", "typed"], ["BO", "DO", "typed"], [null, null, "untyped"]]);
    assert.deepEqual(control.items[0].point_type_bbox_px, [10, 5, 14, 9]);
    // A TYPE naming what a point senses or reports is no refused point type.
    assert.deepEqual(misc.items.map((item: { point_type: string | null; point_type_status: string }) => [item.point_type, item.point_type_status]),
      [[null, "untyped"], [null, "untyped"]]);
    const { rows, AI, AO, BI, BO } = bas.totals;
    assert.deepEqual({ rows, AI, AO, BI, BO }, { rows: 6, AI: 1, AO: 1, BI: 0, BO: 1 });
  });

  it("reads types labelled direction first, and a type's alarm column as the alarm of a point typed beside it (05_MO's AHU POINTS LISTs, 017_MD's DDC INPUT/OUTPUT POINT SCHEDULEs)", () => {
    const dot = { text: "●" };
    const X = { text: "X" };
    const SO = "SYSTEM OUTPUTS", SI = "SYSTEM INPUTS";
    const TREND = "SYSTEM SOFTWARE / CONTROL APPLICATION / FUNCTION TRENDING";
    const HIGH = "SYSTEM SOFTWARE / CONTROL ALARM PROCESSING HIGH LIMIT";
    const vaPoint = (name: string, tag: string, ticks: string[]) => ({
      key: name,
      cells: { "EQUIPMENT DESCRIPTION": { text: name }, "CONTROL POINT TAG": { text: tag }, ...Object.fromEntries(ticks.map((h) => [h, dot])) },
    });
    const IN = "INPUT TO DDC", OUT = "OUTPUT FROM DDC";
    const ddcPoint = (name: string, tag: string, ticks: string[]) => ({
      key: tag,
      cells: { COL1: { text: name }, TAG: { text: tag }, ...Object.fromEntries(ticks.map((h) => [h, X])) },
    });
    const bas = compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#50", number: 50 }, { key: "set.pdf#17", number: 17 }],
      tables: [
        {
          sheet: "set.pdf#50",
          title: { text: "AHU POINTS LIST (APPLIES TO AC-15)", bbox: [0, 0, 10, 10] },
          headers: ["EQUIPMENT DESCRIPTION", "CONTROL POINT TAG", `${SO} BINARY START / STOP`, `${SO} ANALOG VALVE POSITION`,
            `${SI} BINARY STATUS`, `${SI} BINARY ALARM`, `${SI} ANALOG TEMPERATURE (TI)`, `${SI} ANALOG FLOW`, HIGH, TREND],
          rows: [
            vaPoint("COOLING VALVE V-1", "CLG-V1", [`${SO} ANALOG VALVE POSITION`, TREND]),
            // A temperature sensor that alarms: one analog input.
            vaPoint("LEAVING COIL TEMPERATURE", "T-6", [`${SI} BINARY ALARM`, `${SI} ANALOG TEMPERATURE (TI)`, TREND]),
            vaPoint("OUTSIDE AIR FLOW", "OAF-1", [`${SI} BINARY ALARM`, `${SI} ANALOG FLOW`, HIGH, TREND]),
            vaPoint("SUPPLY FAN START/STOP", "SF-SST", [`${SO} BINARY START / STOP`, TREND]),
            vaPoint("SUPPLY FAN STATUS", "SF-STS", [`${SI} BINARY STATUS`, TREND]),
            // Ticked alone, the alarm column is a binary alarm input.
            vaPoint("SMOKE DETECTOR", "SD-1", [`${SI} BINARY ALARM`]),
          ],
        },
        {
          sheet: "set.pdf#17",
          title: { text: "DDC INPUT/OUTPUT POINTS LIST", bbox: [0, 20, 10, 30] },
          headers: ["COL1", `${IN} ANALOG TEMPERATURE`, `${IN} ANALOG PRESSURE`, `${IN} BINARY STATUS`, `${IN} BINARY ALARM`,
            `${OUT} ANALOG SPEED`, `${OUT} BINARY / OFF ON`, "DDC FEATURES FAILURE HIGH ANALOG", "DDC FEATURES FAILURE FAULT", "TAG"],
          rows: [
            ddcPoint("MIXED AIR TEMP SENSOR", "T2", [`${IN} ANALOG TEMPERATURE`]),
            ddcPoint("FILTER PRESSURE SENSOR", "DPS", [`${IN} ANALOG PRESSURE`, `${IN} BINARY ALARM`]),
            ddcPoint("EXHAUST FAN", "EF", [`${OUT} BINARY / OFF ON`]),
            // A drive's status, speed and fault on one row: several points, no
            // one type. A failure feature's ANALOG names no input or output.
            ddcPoint("SUPPLY FAN STATUS SENSOR", "VFD", [`${IN} BINARY STATUS`, `${OUT} ANALOG SPEED`, "DDC FEATURES FAILURE FAULT"]),
            ddcPoint("HIGH LIMIT SENSOR", "HL", ["DDC FEATURES FAILURE HIGH ANALOG"]),
          ],
        },
      ],
    });
    const [va, ddc] = bas.categories.points_lists.lists;
    const typed = (list: { items: Array<{ point_type: string | null; point_type_raw: string | null; alarm: string | null }> }) =>
      list.items.map((item) => [item.point_type, item.point_type_raw, item.alarm]);
    assert.deepEqual(typed(va), [
      ["AO", "SYSTEM OUTPUTS ANALOG VALVE POSITION", null],
      ["AI", "SYSTEM INPUTS ANALOG TEMPERATURE (TI)", "●"],
      ["AI", "SYSTEM INPUTS ANALOG FLOW", "●"],
      ["BO", "SYSTEM OUTPUTS BINARY START / STOP", null],
      ["BI", "SYSTEM INPUTS BINARY STATUS", null],
      ["BI", "SYSTEM INPUTS BINARY ALARM", "●"],
    ]);
    assert.deepEqual(typed(ddc), [
      ["AI", "INPUT TO DDC ANALOG TEMPERATURE", null],
      ["AI", "INPUT TO DDC ANALOG PRESSURE", "X"],
      ["BO", "OUTPUT FROM DDC BINARY / OFF ON", null],
      [null, null, null],
      [null, null, null],
    ]);
    assert.equal(ddc.items[3].point_type_status, "REFUSED_POINT_TYPE_CONFLICT");
    const { rows, AI, AO, BI, BO, alarm } = bas.totals;
    assert.deepEqual({ rows, AI, AO, BI, BO, alarm }, { rows: 11, AI: 4, AO: 1, BI: 2, BO: 2, alarm: 4 });
  });

  it("names a point by its lead cell where a name printed twice keyed its rows with a tick (033_MN's PUMP CONTROL POINTS)", () => {
    // PUMP-12 VFD FAULT is a status point and, under the list's ALARM label,
    // an alarm: no one column tells the rows apart, so the table builder
    // keyed each from the name and the BI column's tick.
    const X = { text: "X" };
    const bas = compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#71", number: 71 }],
      tables: [{
        sheet: "set.pdf#71",
        title: { text: "PUMP CONTROL POINTS", bbox: [0, 0, 10, 10] },
        headers: ["COL1", "HARDWARE POINTS", "HARDWARE POINTS 2", "HARDWARE POINTS 3", "SOFTWARE POINTS", "SOFTWARE POINTS 2"],
        rows: [
          {
            key: "POINT NAME BI",
            cells: {
              COL1: { text: "POINT NAME" }, "HARDWARE POINTS": { text: "AI" }, "HARDWARE POINTS 2": { text: "AO" },
              "HARDWARE POINTS 3": { text: "BI" }, "SOFTWARE POINTS": { text: "TREND" }, "SOFTWARE POINTS 2": { text: "ALARM" },
            },
          },
          { key: "PUMP-12 STATUS X", cells: { COL1: { text: "PUMP-12 STATUS" }, "HARDWARE POINTS 3": X, "SOFTWARE POINTS": X } },
          { key: "PUMP-12 VFD FAULT X", cells: { COL1: { text: "PUMP-12 VFD FAULT" }, "HARDWARE POINTS 3": X } },
          { key: "PUMP-12 VFD SPEED", cells: { COL1: { text: "PUMP-12 VFD SPEED" }, "HARDWARE POINTS 2": X } },
          { key: "PUMP-12 VFD FAULT", cells: { COL1: { text: "PUMP-12 VFD FAULT" }, "SOFTWARE POINTS 2": X } },
          // A key that is more than its lead cell and a tick stays the key.
          { key: "PUMP-13 STATUS LEAD", cells: { COL1: { text: "PUMP-13 STATUS" }, "HARDWARE POINTS 2": { text: "LEAD" } } },
        ],
      }],
    });
    const items = bas.categories.points_lists.lists[0].items;
    assert.deepEqual(items.map((item: { tag: string; point_type: string | null; alarm: unknown }) => [item.tag, item.point_type, Boolean(item.alarm)]), [
      ["PUMP-12 STATUS", "BI", false],
      ["PUMP-12 VFD FAULT", "BI", false],
      ["PUMP-12 VFD SPEED", "AO", false],
      ["PUMP-12 VFD FAULT", null, true],
      ["PUMP-13 STATUS LEAD", null, false],
    ]);
  });

  it("types a ticked point without inventing its wiring; a row naming one type twice is a point, not the labels", () => {
    const bas = compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#9", number: 9 }],
      tables: [{
        sheet: "set.pdf#9",
        title: { text: "AHU-1 POINTS LIST", bbox: [0, 0, 10, 10] },
        headers: ["MARK", "DESCRIPTION", "POINT TYPE", "ANALOG INPUT", "BINARY OUTPUT"],
        rows: [
          {
            key: "AI-1",
            cells: {
              MARK: { text: "AI-1" }, DESCRIPTION: { text: "SPARE ANALOG INPUT" },
              "POINT TYPE": { text: "ANALOG INPUT" }, "ANALOG INPUT": { text: "X" },
            },
          },
          { key: "SF-S", cells: { MARK: { text: "SF-S" }, DESCRIPTION: { text: "SUPPLY FAN START/STOP" }, "BINARY OUTPUT": { text: "X" } } },
          // The mark says AI; the tick says BO.
          { key: "AI-2", cells: { MARK: { text: "AI-2" }, DESCRIPTION: { text: "MIXED AIR TEMPERATURE" }, "BINARY OUTPUT": { text: "X" } } },
        ],
      }],
    });
    const items = bas.categories.points_lists.lists[0].items;
    assert.deepEqual(
      items.map((item: { tag: string; point_type: string | null; point_type_status: string; wiring: string | null }) =>
        [item.tag, item.point_type, item.point_type_status, item.wiring]),
      [["AI-1", "AI", "typed", null], ["SF-S", "BO", "typed", null], ["AI-2", null, "REFUSED_POINT_TYPE_CONFLICT", null]],
    );
    assert.deepEqual([bas.totals.rows, bas.totals.hardwired, bas.totals.soft], [3, 0, 0]);
  });

  it("counts device I/O rows and skips the TAG header", () => {
    const graph = {
      sheets: [{ key: "set.pdf#1", number: 1 }],
      tables: [
        {
          sheet: "set.pdf#1",
          title: { text: "I/O LIST WHITE STURGEON PLC", bbox: [0, 0, 10, 10] },
          rows: [
            { key: "TAG", cells: { COL1: { text: "TAG" } } },
            { key: "HWP-1", cells: { ANALOG: { text: "1" }, DIGITAL: { text: "1" } } },
            { key: "HWP-2", cells: { ANALOG: { text: "1" }, DIGITAL: { text: "1" } } },
            { key: "TE-300", cells: { ANALOG: { text: "1" } } },
          ],
        },
      ],
    };
    const bas = compileBasTakeoff(null, graph);
    assert.equal(bas.totals.lists, 1);
    assert.equal(bas.totals.rows, 3);
    // ANALOG/DIGITAL quantity cells roll into AI/BI (no AI## MARK prefixes).
    assert.equal(bas.totals.AI, 3); // 1+1+1
    assert.equal(bas.totals.BI, 2); // 1+1
    assert.equal(bas.totals.AO, 0);
    assert.equal(bas.totals.BO, 0);
    assert.equal(bas.categories.points_lists.lists[0].title, "I/O LIST WHITE STURGEON PLC");
    assert.deepEqual(
      bas.categories.points_lists.lists[0].items.map((i: { tag: string }) => i.tag),
      ["HWP-1", "HWP-2", "TE-300"],
    );
  });

  it("does not double-count ANALOG cells on AI## MARK rows", () => {
    const graph = {
      sheets: [{ key: "set.pdf#4", number: 4 }],
      tables: [
        {
          sheet: "set.pdf#4",
          title: { text: "POINTS LIST AHU-1", bbox: [0, 0, 10, 10] },
          rows: [
            { key: "AI01", cells: { ANALOG: { text: "9" }, DESCRIPTION: { text: "SA TEMP" } } },
            { key: "BO02", cells: { DIGITAL: { text: "9" }, DESCRIPTION: { text: "SF START" } } },
          ],
        },
      ],
    };
    const bas = compileBasTakeoff(null, graph);
    assert.equal(bas.totals.rows, 2);
    assert.equal(bas.totals.AI, 1);
    assert.equal(bas.totals.BO, 1);
    assert.equal(bas.totals.BI, 0);
  });

  it("still counts AI## MARK prefixes on POINTS LIST titles", () => {
    const graph = {
      sheets: [{ key: "set.pdf#2", number: 2 }],
      tables: [
        {
          sheet: "set.pdf#2",
          title: { text: "POINTS LIST AHU-1", bbox: [0, 0, 10, 10] },
          rows: [
            { key: "AI01", cells: { DESCRIPTION: { text: "SA TEMP" } } },
            { key: "BO02", cells: { DESCRIPTION: { text: "SF START" } } },
          ],
        },
      ],
    };
    const bas = compileBasTakeoff(null, graph);
    assert.equal(bas.totals.rows, 2);
    assert.equal(bas.totals.AI, 1);
    assert.equal(bas.totals.BO, 1);
  });

  it("promotes printed ALARM / TREND / hardwired-vs-soft columns (WP8); never invents them", () => {
    const graph = {
      sheets: [{ key: "set.pdf#8", number: 8 }],
      tables: [
        {
          sheet: "set.pdf#8",
          title: { text: "POINTS LIST AHU-2", bbox: [0, 0, 10, 10] },
          rows: [
            {
              key: "AI10",
              cells: {
                DESCRIPTION: { text: "SA TEMP ALARM SENSOR" },
                ALARM: { text: "HI/LO" },
                TREND: { text: "15 MIN" },
                WIRING: { text: "HARDWIRED" },
              },
            },
            {
              key: "AO01",
              cells: {
                DESCRIPTION: { text: "CHW VALVE" },
                "SIGNAL TYPE": { text: "BACnet" },
                ALARM: { text: "No" },
                TREND: { text: "-" },
              },
            },
            {
              key: "BI03",
              cells: { DESCRIPTION: { text: "SF STATUS" } },
            },
          ],
        },
      ],
    };
    const bas = compileBasTakeoff(null, graph);
    assert.equal(bas.totals.rows, 3);
    assert.equal(bas.totals.alarm, 1);
    assert.equal(bas.totals.trend, 1);
    assert.equal(bas.totals.hardwired, 1);
    assert.equal(bas.totals.soft, 1);
    const ai10 = bas.categories.points_lists.lists[0].items.find((i) => i.tag === "AI10");
    assert.equal(ai10!.alarm, "HI/LO");
    assert.equal(ai10!.trend, "15 MIN");
    assert.equal(ai10!.wiring, "hardwired");
    assert.equal(ai10!.served_equipment, "AHU-2");
    const ao01 = bas.categories.points_lists.lists[0].items.find((i) => i.tag === "AO01");
    assert.equal(ao01!.wiring, "soft");
    assert.equal(ao01!.alarm, null);
    assert.equal(ao01!.trend, null);
    assert.equal(ao01!.served_equipment, "AHU-2");
    const bi03 = bas.categories.points_lists.lists[0].items.find((i) => i.tag === "BI03");
    assert.equal(bi03!.wiring, null);
    assert.ok(bas.exclusions.some((e) => /sequence-of-operations/i.test(e)));
  });

  it("joins served_equipment from UNIT column, I/O device keys, and list title (Pillar C)", () => {
    const graph = {
      sheets: [{ key: "set.pdf#9", number: 9 }],
      tables: [
        {
          sheet: "set.pdf#9",
          title: { text: "POINTS LIST DOAH-TI", bbox: [0, 0, 10, 10] },
          rows: [
            {
              key: "AI01",
              cells: {
                DESCRIPTION: { text: "OA TEMP" },
                UNIT: { text: "DOAH-TI" },
              },
            },
            {
              key: "AI02",
              cells: { DESCRIPTION: { text: "SA TEMP" } },
            },
          ],
        },
        {
          sheet: "set.pdf#9",
          title: { text: "I/O LIST WHITE STURGEON PLC", bbox: [0, 0, 10, 10] },
          rows: [
            { key: "TAG", cells: {} },
            { key: "HWP-1", cells: { ANALOG: { text: "2" }, DIGITAL: { text: "1" } } },
          ],
        },
      ],
    };
    const bas = compileBasTakeoff(null, graph);
    const doah = bas.categories.points_lists.lists.find((l) => /DOAH/i.test(l.title));
    // OCR I→1 repair so plan paint joins DOAH-T1 on schedule.
    assert.equal(doah!.items.find((i) => i.tag === "AI01")!.served_equipment, "DOAH-T1");
    assert.equal(doah!.items.find((i) => i.tag === "AI02")!.served_equipment, "DOAH-T1");
    const io = bas.categories.points_lists.lists.find((l) => /I\/O LIST/i.test(l.title));
    assert.equal(io!.items.find((i) => i.tag === "HWP-1")!.served_equipment, "HWP-1");
  });

  it("ocrFixEquipMark repairs I→1 and slash family inheritance (Pillar C join)", () => {
    assert.equal(ocrFixEquipMark("DOAH-TI"), "DOAH-T1");
    assert.equal(ocrFixEquipMark("AHU-T1A/TIB"), "AHU-T1A/AHU-T1B");
    assert.equal(equipMarkFromBasDescription("AHU-T1B SA TEMPERATURE"), "AHU-T1B");
    const row = {
      key: "AI01",
      cells: { DESCRIPTION: { text: "AHU-T1B HW VALVE POSITION (FEEDBACK)" } },
    };
    assert.equal(
      servedEquipmentFromBasRow(row, "POINTS LIST AHU-T1A/TIB"),
      "AHU-T1B",
    );
    assert.equal(
      servedEquipmentFromBasRow(
        { key: "AI01", cells: { DESCRIPTION: { text: "OA TEMP" } } },
        "POINTS LIST DOAH-TI",
      ),
      "DOAH-T1",
    );
    // Hyphenated AI-1 / BI-1 are point tags, not served equipment (pier shape).
    assert.equal(
      servedEquipmentFromBasRow(
        { key: "AI-1", cells: { DESCRIPTION: { text: "SPACE TEMP" } } },
        "UNIT HEATER POINTS LIST",
      ),
      null,
    );
    assert.equal(
      servedEquipmentFromBasRow(
        { key: "CCC-1", cells: { DESCRIPTION: { text: "CONDENSER" } } },
        "CONDENSER WATER SYSTEM POINTS LIST",
      ),
      "CCC-1",
    );
  });

  it("does not invent a list from a title-only schematic with no data rows", () => {
    const graph = {
      sheets: [{ key: "set.pdf#3", number: 3 }],
      tables: [
        {
          sheet: "set.pdf#3",
          title: { text: "POINTS LIST SCHEMATIC ONLY", bbox: [0, 0, 10, 10] },
          rows: [{ key: "TAG", cells: {} }],
        },
      ],
    };
    const bas = compileBasTakeoff(null, graph);
    assert.equal(bas.totals.lists, 0);
    assert.equal(bas.totals.rows, 0);
  });

  it("lists no point from a points list caption over a table of point types (011_IL's STANDARD TRENDING INTERVALS)", () => {
    const row = (name: string, interval: string, duration: string) => ({
      key: name,
      cells: {
        "POINT NAME": { text: name },
        "TREND INTERVAL": { text: interval },
        "OPERATIONAL TREND DURATION": { text: duration },
      },
    });
    const policy = {
      kind: "reference",
      sheet: "set.pdf#19",
      title: { text: "POINTS LIST - STANDARD TRENDING INTERVALS", bbox: [0, 0, 10, 10] },
      headers: ["POINT NAME", "TREND INTERVAL", "OPERATIONAL TREND DURATION"],
      rows: [
        row("AI", "15 MIN.", "24 HOURS"),
        row("BI", "CHANGE OF VALUE", "24 HOURS"),
        row("AO", "15 MIN.", "24 HOURS"),
        row("BO", "CHANGE OF VALUE", "24 HOURS"),
        row("CALC", "1 HOUR", "30 DAYS"),
      ],
    };
    assert.equal(isBasPointTypeTable(policy), true);
    const bas = compileBasTakeoff(null, { sheets: [{ key: "set.pdf#19", number: 19 }], tables: [policy] });
    assert.equal(bas.totals.lists, 0);
    assert.equal(bas.totals.rows, 0);
    assert.equal(bas.page_accounting.pages[0].status, "empty_for_bas_points_lists");
    assert.ok(bas.exclusions.some((note: string) => /point-type policy tables/i.test(note)));

    // A list keyed by its TYPE column names its points in another column.
    const typed = {
      sheet: "set.pdf#20",
      title: { text: "AHU-1 POINTS LIST", bbox: [0, 0, 10, 10] },
      headers: ["POINT TYPE", "DESCRIPTION"],
      rows: [
        { key: "AI", cells: { "POINT TYPE": { text: "AI" }, DESCRIPTION: { text: "SUPPLY AIR TEMPERATURE" } } },
        { key: "BO", cells: { "POINT TYPE": { text: "BO" }, DESCRIPTION: { text: "SUPPLY FAN START/STOP" } } },
      ],
    };
    assert.equal(isBasPointTypeTable(typed), false);
    // One point among the type names makes the table a list of points.
    const mixed = { ...policy, rows: [...policy.rows, row("SAT-1", "15 MIN.", "24 HOURS")] };
    assert.equal(isBasPointTypeTable(mixed), false);
    const both = compileBasTakeoff(null, {
      sheets: [{ key: "set.pdf#19", number: 19 }, { key: "set.pdf#20", number: 20 }],
      tables: [typed, mixed],
    });
    assert.equal(both.totals.lists, 2);
    assert.equal(both.totals.rows, 8);
    assert.equal(both.totals.AI, 1);
    assert.equal(both.totals.BO, 1);
  });
});
