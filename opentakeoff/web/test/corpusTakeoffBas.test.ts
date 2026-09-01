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
  isSooNarrativeTitle,
  ocrFixEquipMark,
  equipMarkFromBasDescription,
  servedEquipmentFromBasRow,
  probeBasProofSpareColumnHeaders,
} from "../src/lib/corpusTakeoff.mjs";

describe("isBasPointsListTitle", () => {
  it("accepts POINTS / DDC / I/O list titles and rejects equipment schedules", () => {
    assert.equal(isBasPointsListTitle("POINTS LIST DOAH-TI"), true);
    assert.equal(isBasPointsListTitle("FCU WITH COOLING COILS DDC POINTS LIST"), true);
    assert.equal(isBasPointsListTitle("I/O LIST WHITE STURGEON PLC"), true);
    assert.equal(isBasPointsListTitle("IO LIST PANEL A"), true);
    assert.equal(isBasPointsListTitle("DDC CONTROLLER INPUT/OUTPUT SUMMARY"), true);
    assert.equal(isBasPointsListTitle("DDC CONTROLLER INPUT/OUTPUT LEGEND"), true);
    assert.equal(isBasPointsListTitle("CONTROLLER I/O SUMMARY"), true);
    assert.equal(isBasPointsListTitle("MISCELLANEOUS POINTS SCHEDULE"), true);
    assert.equal(isBasPointsListTitle("POINTS SCHEDULE"), true);
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
    assert.equal(ai10.alarm, "HI/LO");
    assert.equal(ai10.trend, "15 MIN");
    assert.equal(ai10.wiring, "hardwired");
    assert.equal(ai10.served_equipment, "AHU-2");
    const ao01 = bas.categories.points_lists.lists[0].items.find((i) => i.tag === "AO01");
    assert.equal(ao01.wiring, "soft");
    assert.equal(ao01.alarm, null);
    assert.equal(ao01.trend, null);
    assert.equal(ao01.served_equipment, "AHU-2");
    const bi03 = bas.categories.points_lists.lists[0].items.find((i) => i.tag === "BI03");
    assert.equal(bi03.wiring, null);
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
    assert.equal(doah.items.find((i) => i.tag === "AI01").served_equipment, "DOAH-T1");
    assert.equal(doah.items.find((i) => i.tag === "AI02").served_equipment, "DOAH-T1");
    const io = bas.categories.points_lists.lists.find((l) => /I\/O LIST/i.test(l.title));
    assert.equal(io.items.find((i) => i.tag === "HWP-1").served_equipment, "HWP-1");
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
});
