import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  buildTakeoffPdfBytes,
  compileAgentTakeoff,
  compiledTakeoffToCsv,
  dedupeTakeoffRows,
  groupTakeoffByFamily,
  lineLeadCite,
  makeTakeoffRow,
  mergeTakeoffRows,
  cleanTakeoffTag,
  rowsFromAnswerMarkdown,
  rowsFromCompiledTakeoff,
  rowsFromToolResult,
  splitConversationalAnswer,
  takeoffLeadColumns,
  takeoffSpecColumns,
  takeoffToCsv,
} from "../src/lib/agentTakeoff.js";
import { buildXlsx } from "../src/lib/xlsx.js";
import {
  compileControlValveTakeoff,
  normalizeControlValveCells,
} from "../src/lib/corpusTakeoff.mjs";

test("rowsFromToolResult: query_table scoped column + count", () => {
  const rows = rowsFromToolResult("query_table", { title: "FAN SCHEDULE", column: "CFM", row_key: "EF-1" }, {
    count: 1,
    matches: [{
      sheet: "mech.pdf#6",
      title: "FAN SCHEDULE",
      row: {
        key: "EF-1",
        all_cells: { CFM: { text: "165", bbox: [1, 2, 3, 4] } },
      },
    }],
  }, { workflow: "fan takeoff", runId: "r1" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tag, "EF-1");
  assert.equal(rows[0].field, "CFM");
  assert.equal(rows[0].value, "165");
  assert.equal(rows[0].sheet_id, "mech.pdf#6");
  assert.deepEqual(rows[0].bbox_px, [1, 2, 3, 4]);
  assert.equal(rows[0].workflow, "fan takeoff");
});

test("rowsFromToolResult: query_table expands full row cells for modular columns", () => {
  const rows = rowsFromToolResult("query_table", { title: "CONTROL VALVE SCHEDULE", row_key: "CV-1" }, {
    count: 1,
    matches: [{
      sheet: "mech.pdf#8",
      title: "CONTROL VALVE SCHEDULE",
      row: {
        key: "CV-1",
        all_cells: {
          MARK: { text: "CV-1" },
          GPM: { text: "12" },
          Cv: { text: "4.7" },
          "PIPE SIZE": { text: "1\"" },
        },
      },
    }],
  }, { workflow: "valves" });
  assert.ok(rows.some((r) => r.field === "GPM" && r.value === "12"));
  assert.ok(rows.some((r) => r.field === "Cv" && r.value === "4.7"));
  assert.ok(rows.some((r) => r.field === "PIPE SIZE"));
});

test("rowsFromToolResult: sweep_schedule_row installed qty + attributes", () => {
  const rows = rowsFromToolResult("sweep_schedule_row", { tag: "VAV-1" }, {
    tag: "VAV-1",
    found: 3,
    tag_citations: [{ sheet: "mech.pdf#2", bbox: [10, 20, 30, 40] }],
    row: {
      sheet: "mech.pdf#6",
      table: "AIR TERMINAL BOX SCHEDULE",
      cells: { CFM: "2170", MBH: "41.0", MARK: "VAV-1" },
      cell_citations: { CFM: { bbox: [5, 6, 7, 8] } },
    },
  }, { workflow: "vav join" });
  assert.ok(rows.some((r) => r.field === "installed_quantity" && r.value === 3 && r.unit === "EA"));
  assert.ok(rows.some((r) => r.field === "CFM" && r.value === "2170"));
  assert.ok(!rows.some((r) => r.field === "MARK"));
});

test("compileAgentTakeoff: query_table / answer scrap alone → no Takeoff lines", () => {
  const scrap = [
    ...rowsFromToolResult("query_table", { title: "FAN COIL UNIT SCHEDULE" }, {
      count: 42,
      matches: [
        {
          sheet: "m#3", title: "FAN COIL UNIT SCHEDULE",
          row: { key: "FCU-A1", all_cells: { TYPE: { text: "VERTICAL CABINET" }, CFM: { text: "150" } } },
        },
      ],
    }, { workflow: "fcu" }),
    makeTakeoffRow({
      tag: "FCU-T1", field: "CFM", value: "230", source_tool: "answer_table",
      table_title: "FAN COIL UNIT SCHEDULE",
    }),
  ];
  assert.equal(compileAgentTakeoff(scrap).length, 0);
});

test("compileAgentTakeoff collapses sweep EAV into installed line items", () => {
  const rows = [
    ...rowsFromToolResult("sweep_schedule_row", { tag: "VAV-1" }, {
      tag: "VAV-1",
      found: 1,
      tag_citations: [{ sheet: "mech.pdf#2", bbox: [1, 2, 3, 4] }],
      row: {
        sheet: "mech.pdf#6",
        table: "AIR TERMINAL BOX SCHEDULE",
        cells: { CFM: "2170", MANUFACTURER: "TRANE / VCEF", MARK: "VAV-1" },
      },
    }, { workflow: "vav" }),
    // Scrap for a different tag must not mint a Takeoff line.
    makeTakeoffRow({
      tag: "EF-2", field: "plan_status", value: "refused",
      sheet_id: "mech.pdf#6", table_title: "FAN SCHEDULE", workflow: "fans",
      source_tool: "query_table",
    }),
    makeTakeoffRow({
      tag: "EF-2", field: "CFM", value: 400, unit: "CFM",
      sheet_id: "mech.pdf#6", table_title: "FAN SCHEDULE", workflow: "fans",
      source_tool: "query_table",
    }),
  ];
  const lines = compileAgentTakeoff(rows);
  assert.equal(lines.length, 1);
  const vav = lines.find((l) => l.tag === "VAV-1");
  assert.ok(vav);
  assert.equal(vav.qty, 1);
  assert.equal(vav.unit, "EA");
  assert.equal(vav.qty_kind, "installed");
  assert.match(vav.description, /TRANE/);
  assert.match(vav.attrs_text, /CFM 2170/);
  assert.equal(vav.sheet_id, "mech.pdf#2");
  assert.ok(!lines.some((l) => l.tag === "EF-2"), "query_table scrap must not become Takeoff");
  const csv = compiledTakeoffToCsv(lines);
  assert.match(csv, /^Tag,/);
  assert.match(csv, /VAV-1/);
  assert.match(csv, /CFM/);
});

test("columns adapt per family: valves vs VAV vs points", () => {
  const rows = [
    makeTakeoffRow({
      tag: "VAV-1", field: "quantity", value: 1, unit: "EA",
      table_title: "AIR TERMINAL BOX SCHEDULE", sheet_id: "m#6",
      source_tool: "compile_corpus_takeoff",
    }),
    makeTakeoffRow({
      tag: "VAV-1", field: "CFM", value: "2170",
      table_title: "AIR TERMINAL BOX SCHEDULE", sheet_id: "m#6",
      source_tool: "compile_corpus_takeoff",
    }),
    makeTakeoffRow({
      tag: "VAV-1", field: "MBH", value: "41",
      table_title: "AIR TERMINAL BOX SCHEDULE", sheet_id: "m#6",
      source_tool: "compile_corpus_takeoff",
    }),
    makeTakeoffRow({
      tag: "CV-3", field: "quantity", value: 1, unit: "EA",
      table_title: "CONTROL VALVE SCHEDULE", sheet_id: "m#8",
      source_tool: "compile_corpus_takeoff",
    }),
    makeTakeoffRow({
      tag: "CV-3", field: "GPM", value: "18",
      table_title: "CONTROL VALVE SCHEDULE", sheet_id: "m#8",
      source_tool: "compile_corpus_takeoff",
    }),
    makeTakeoffRow({
      tag: "CV-3", field: "Cv", value: "5.2",
      table_title: "CONTROL VALVE SCHEDULE", sheet_id: "m#8",
      source_tool: "compile_corpus_takeoff",
    }),
    makeTakeoffRow({
      tag: "CV-3", field: "PIPE SIZE", value: "1-1/2\"",
      table_title: "CONTROL VALVE SCHEDULE", sheet_id: "m#8",
      source_tool: "compile_corpus_takeoff",
    }),
    makeTakeoffRow({
      tag: "AHU-1 SA TEMP", field: "quantity", value: 1, unit: "EA",
      table_title: "AHU-1 POINTS LIST", sheet_id: "c#2",
      source_tool: "compile_corpus_takeoff",
    }),
    makeTakeoffRow({
      tag: "AHU-1 SA TEMP", field: "POINT TYPE", value: "AI",
      table_title: "AHU-1 POINTS LIST", sheet_id: "c#2",
      source_tool: "compile_corpus_takeoff",
    }),
    makeTakeoffRow({
      tag: "AHU-1 SA TEMP", field: "SIGNAL", value: "4-20mA",
      table_title: "AHU-1 POINTS LIST", sheet_id: "c#2",
      source_tool: "compile_corpus_takeoff",
    }),
    makeTakeoffRow({
      tag: "AHU-1 SA TEMP", field: "CONTROLLER", value: "UC600-1",
      table_title: "AHU-1 POINTS LIST", sheet_id: "c#2",
      source_tool: "compile_corpus_takeoff",
    }),
  ];
  const lines = compileAgentTakeoff(rows);
  const groups = groupTakeoffByFamily(lines);
  assert.equal(groups.length, 3);

  const vav = groups.find((g) => /AIR TERMINAL/i.test(g.family));
  const valve = groups.find((g) => /VALVE/i.test(g.family));
  const points = groups.find((g) => /POINTS/i.test(g.family));
  assert.ok(vav && valve && points);

  assert.deepEqual(vav.specColumns.map((c) => c.toUpperCase()).sort(), ["CFM", "MBH"]);
  assert.ok(valve.specColumns.some((c) => /GPM/i.test(c)));
  assert.ok(valve.specColumns.some((c) => /CV/i.test(c)));
  assert.ok(valve.specColumns.some((c) => /PIPE/i.test(c)));
  assert.ok(!valve.specColumns.some((c) => /CFM/i.test(c)), "valve table must not pad CFM");

  assert.ok(points.specColumns.some((c) => /SIGNAL/i.test(c)));
  assert.ok(points.specColumns.some((c) => /CONTROLLER/i.test(c)));
  assert.ok(!points.specColumns.some((c) => /GPM|CFM/i.test(c)));
  // Points Type lead from POINT TYPE; no manufacturer columns.
  const pointLead = takeoffLeadColumns(points.lines);
  assert.ok(pointLead.some((c) => c.key === "type"));
  assert.ok(!pointLead.some((c) => c.key === "manufacturer"));
  assert.equal(pointLead.find((c) => c.key === "tag")?.label, "Point");
});

test("rowsFromAnswerMarkdown + splitConversationalAnswer strip tables from chat", () => {
  const md = [
    "Found the fan schedule.",
    "",
    "| Tag | CFM |",
    "| --- | --- |",
    "| EF-1 | 165 |",
    "",
    "Ready for a follow-up.",
  ].join("\n");
  const rows = rowsFromAnswerMarkdown(md, { workflow: "fans" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tag, "EF-1");
  assert.equal(rows[0].field, "CFM");
  assert.equal(rows[0].value, "165");
  const { chat, hadTables } = splitConversationalAnswer(md, { rowCount: rows.length, finishedLineCount: 0 });
  assert.equal(hadTables, true);
  assert.match(chat, /Found the fan schedule/);
  // Pipe tables flatten to plain lines so answering values stay visible.
  assert.match(chat, /EF-1/);
  assert.match(chat, /165/);
  assert.doesNotMatch(chat, /\| Tag \|/);
  const withFinished = splitConversationalAnswer(md, { rowCount: rows.length, finishedLineCount: 2 });
  assert.match(withFinished.chat, /2 lines.*Takeoff panel/i);
});

test("rowsFromCompiledTakeoff: HVAC categories → EAV rows for Takeoff panel", () => {
  const rows = rowsFromCompiledTakeoff({
    takeoff_id: "T-HVAC-01",
    kind: "hvac_equipment",
    categories: {
      "AIR HANDLING UNITS": {
        count: 2,
        items: [
          { tag: "AHU-1", quantity: 1, unit: "EA", sheet_id: "m#3", table_title: "AIR HANDLING UNIT SCHEDULE", bbox_px: [1, 2, 3, 4] },
          { tag: "AHU-2", quantity: 1, unit: "EA", sheet_id: "m#3", table_title: "AIR HANDLING UNIT SCHEDULE" },
        ],
      },
    },
    totals: { items: 2 },
  }, { workflow: "HVAC takeoff", runId: "r9" });
  assert.ok(rows.length >= 4);
  assert.ok(rows.some((r) => r.tag === "AHU-1" && r.field === "quantity" && r.value === 1));
  assert.ok(rows.some((r) => r.tag === "AHU-1" && r.field === "equipment_type" && r.value === "AIR HANDLING UNITS"));
  assert.deepEqual(rows.find((r) => r.tag === "AHU-1" && r.field === "quantity").bbox_px, [1, 2, 3, 4]);
  const viaTool = rowsFromToolResult("compile_corpus_takeoff", { kind: "hvac_equipment" }, {
    takeoff_id: "T-HVAC-01",
    kind: "hvac_equipment",
    categories: {
      FANS: { count: 1, items: [{ tag: "EF-1", quantity: 1, sheet_id: "m#6", table_title: "FAN SCHEDULE" }] },
    },
  }, { workflow: "HVAC" });
  assert.ok(viaTool.some((r) => r.tag === "EF-1" && r.source_tool === "compile_corpus_takeoff"));
});

test("compileAgentTakeoff: corpus compile locks line count — scrap cannot inflate", () => {
  const compiled = rowsFromCompiledTakeoff({
    takeoff_id: "T-HVAC-01",
    kind: "hvac_equipment",
    categories: {
      AHU: {
        count: 2,
        items: [
          {
            tag: "AHU-1", quantity: 1, unit: "EA", sheet_id: "m#1",
            table_title: "AIR HANDLING UNIT SCHEDULE",
            bbox_px: [10, 20, 30, 40],
            table_bbox_px: [1, 2, 500, 600],
            cells: { CFM: { text: "2000", bbox: [11, 21, 31, 41] } },
          },
          {
            tag: "AHU-2", quantity: 1, unit: "EA", sheet_id: "m#1",
            table_title: "AIR HANDLING UNIT SCHEDULE",
            bbox_px: [10, 50, 30, 70],
            table_bbox_px: [1, 2, 500, 600],
            cells: { CFM: { text: "1800", bbox: [11, 51, 31, 71] } },
          },
        ],
      },
    },
    totals: { items: 2 },
  });
  const scrap = [
    ...compiled,
    { id: "x1", tag: "JUNK-9", field: "CFM", value: "99", table_title: "SOME OTHER TABLE", source_tool: "query_table" },
    { id: "x2", tag: "AHU-1", field: "VOLTAGE", value: "460", table_title: "AIR HANDLING UNIT SCHEDULE", source_tool: "query_table" },
  ];
  const lines = compileAgentTakeoff(scrap);
  assert.equal(lines.length, 2);
  assert.equal(lines.reduce((n, l) => n + (l.qty || 0), 0), 2);
  assert.ok(lines.every((l) => l.tag === "AHU-1" || l.tag === "AHU-2"));
  const ahu1 = lines.find((l) => l.tag === "AHU-1");
  assert.deepEqual(ahu1.bbox_px, [10, 20, 30, 40]);
  assert.deepEqual(ahu1.table_bbox_px, [1, 2, 500, 600]);
  const groups = groupTakeoffByFamily(lines);
  assert.ok(groups[0].tableCite?.bbox_px);
  assert.equal(groups[0].tableCite.kind, "table");
  const rowCite = lineLeadCite(ahu1, "tag");
  assert.equal(rowCite.kind, "row");
  assert.deepEqual(rowCite.bbox_px, [10, 20, 30, 40]);
  assert.equal(String(ahu1.specs.CFM || ""), "2000");
  assert.ok(Object.values(ahu1.specs).some((v) => String(v) === "460"));
});

test("rowsFromCompiledTakeoff: BAS points lists → POINT TYPE rows", () => {
  const rows = rowsFromCompiledTakeoff({
    takeoff_id: "T-BAS-01",
    kind: "bas_points",
    categories: {
      points_lists: {
        lists: [{
          title: "AHU-1 POINTS LIST",
          sheet_id: "c#2",
          rows: 2,
          items: [
            {
              tag: "AI1", quantity: 1, sheet_id: "c#2", table_title: "AHU-1 POINTS LIST",
              description: "SA TEMP", served_equipment: "AHU-1", alarm: "Yes", trend: "15 MIN",
              wiring: "hardwired",
            },
            { tag: "BO2", quantity: 1, sheet_id: "c#2", table_title: "AHU-1 POINTS LIST" },
          ],
        }],
        totals: { rows: 2, AI: 1, AO: 0, BI: 0, BO: 1 },
      },
    },
  });
  assert.ok(rows.some((r) => r.tag === "AI1" && r.field === "POINT TYPE" && r.value === "AI"));
  assert.ok(rows.some((r) => r.tag === "BO2" && r.field === "POINT TYPE" && r.value === "BO"));
  assert.ok(rows.some((r) => r.tag === "AI1" && r.field === "DESCRIPTION" && /SA TEMP/.test(String(r.value))));
  assert.ok(rows.some((r) => r.tag === "AI1" && r.field === "SERVED EQUIPMENT" && r.value === "AHU-1"));
  assert.ok(rows.some((r) => r.tag === "AI1" && r.field === "ALARM" && r.value === "Yes"));
  assert.ok(rows.some((r) => r.tag === "AI1" && r.field === "TREND" && /15 MIN/.test(String(r.value))));
  assert.ok(rows.some((r) => r.tag === "AI1" && r.field === "WIRING" && r.value === "hardwired"));
});

test("rowsFromCompiledTakeoff: BAS estimator_status refuse_not_done is not 'done'", () => {
  const rows = rowsFromCompiledTakeoff({
    takeoff_id: "T-BAS-01",
    kind: "bas_points",
    estimator_status: {
      estimator_complete: false,
      gt_locked: false,
      meaning: "refuse_not_done = unfinished Pillar C work, not a locked success/ceiling",
      gates: [
        { gate: "printed_points_lists", status: "open", note: "plumbing only" },
        { gate: "soo_derived_points", status: "refuse_not_done", note: "SOO refuse — not complete" },
        { gate: "gt_lock", status: "refuse_not_done", note: "GT not locked" },
      ],
    },
    categories: {
      points_lists: {
        lists: [{
          title: "POINTS LIST AHU-1",
          sheet_id: "c#1",
          rows: 1,
          items: [{ tag: "AI1", quantity: 1, sheet_id: "c#1", table_title: "POINTS LIST AHU-1" }],
        }],
        totals: { rows: 1, AI: 1, AO: 0, BI: 0, BO: 0 },
      },
    },
  });
  assert.ok(rows.some((r) => r.tag === "BAS_ESTIMATOR" && r.field === "estimator_complete" && /NO/.test(String(r.value))));
  assert.ok(rows.some((r) => r.tag === "BAS_ESTIMATOR" && r.field === "refuse:soo_derived_points" && r.value === "refuse_not_done"));
  assert.ok(rows.some((r) => r.tag === "BAS_ESTIMATOR" && r.field === "refuse:gt_lock"));
  assert.ok(!rows.some((r) => r.tag === "BAS_ESTIMATOR" && /printed_points_lists/.test(String(r.field))));
});

test("rowsFromCompiledTakeoff: BAS estimator_product estimate/gap/SOO rows are disclosed", () => {
  const rows = rowsFromCompiledTakeoff({
    takeoff_id: "T-BAS-01",
    kind: "bas_points",
    estimator_status: {
      estimator_complete: false,
      gt_locked: false,
      meaning: "refuse_not_done = unfinished",
      gates: [{ gate: "soo_derived_points", status: "refuse_not_done", note: "SOO refuse" }],
    },
    estimator_product: {
      equipment_inventory: { unit_count: 5 },
      soo: { status: "present_not_row_extractable", note: "SOO present, not typed" },
      schedule_derived_estimate: {
        label: "estimate_only",
        totals: { points: 57 },
      },
      gap_vs_printed: { inventory_without_printed_points_count: 4 },
      spare_io_policy: {
        typical_pct_per_point_type: { common: 15 },
        note: "policy disclose only",
      },
      plan_paint: {
        status: "refuse_not_done",
        note: "paint required",
        targets: [
          {
            tag: "B1",
            prefer_schedule_title: "2-STAGE, GAS FIRED FURNACE SCHEDULE",
            prefer_schedule_sheet: "M-601",
          },
        ],
      },
    },
    categories: {
      points_lists: {
        lists: [{
          title: "POINTS LIST AHU-1",
          sheet_id: "c#1",
          rows: 1,
          items: [{ tag: "AI1", quantity: 1, sheet_id: "c#1", table_title: "POINTS LIST AHU-1" }],
        }],
        totals: { rows: 1, AI: 1, AO: 0, BI: 0, BO: 0 },
      },
    },
  });
  assert.ok(rows.some((r) => r.tag === "BAS_ESTIMATOR" && r.field === "equipment_inventory_units" && r.value === 5));
  assert.ok(rows.some((r) => r.tag === "BAS_ESTIMATOR" && r.field === "soo_status" && /present_not_row_extractable/.test(String(r.value))));
  assert.ok(rows.some((r) => r.tag === "BAS_ESTIMATOR" && r.field === "schedule_estimate_points" && r.value === 57));
  assert.ok(rows.some((r) => r.tag === "BAS_ESTIMATOR" && r.field === "inventory_points_gap" && r.value === 4));
  assert.ok(rows.some((r) => r.tag === "BAS_ESTIMATOR" && r.field === "spare_io_policy" && /15%/.test(String(r.value))));
  // Printed point row still present — estimate did not replace it.
  assert.ok(rows.some((r) => r.tag === "AI1" && r.field === "quantity"));
  assert.ok(rows.some((r) => r.tag === "BAS_ESTIMATOR" && r.field === "plan_paint" && r.value === "refuse_not_done"));
  assert.ok(rows.some((r) => r.tag === "B1" && r.field === "plan_paint_prefer_schedule_title"
    && /FURNACE SCHEDULE/i.test(String(r.value))));
});

test("compileAgentTakeoff: repeating BAS marks across lists stay separate lines", () => {
  // Same AI1 on two points lists must not collapse — MCP compile totals 122,
  // Takeoff UI must show 122 lines (shared corpusTakeoff identity).
  const rows = rowsFromCompiledTakeoff({
    takeoff_id: "T-BAS-01",
    kind: "bas_points",
    categories: {
      points_lists: {
        lists: [
          {
            title: "POINTS LIST DOAH-TI",
            sheet_id: "c#1",
            rows: 2,
            items: [
              { tag: "AI1", quantity: 1, sheet_id: "c#1", table_title: "POINTS LIST DOAH-TI", description: "OA TEMP" },
              { tag: "BO1", quantity: 1, sheet_id: "c#1", table_title: "POINTS LIST DOAH-TI" },
            ],
          },
          {
            title: "POINTS LIST AHU-T1A/TIB",
            sheet_id: "c#2",
            rows: 2,
            items: [
              { tag: "AI1", quantity: 1, sheet_id: "c#2", table_title: "POINTS LIST AHU-T1A/TIB", description: "SA TEMP" },
              { tag: "BO1", quantity: 1, sheet_id: "c#2", table_title: "POINTS LIST AHU-T1A/TIB" },
            ],
          },
        ],
        totals: { rows: 4, AI: 2, AO: 0, BI: 0, BO: 2 },
      },
    },
  });
  const lines = compileAgentTakeoff(rows);
  assert.equal(lines.length, 4);
  assert.equal(lines.reduce((n, l) => n + (l.qty || 0), 0), 4);
  const ai1 = lines.filter((l) => l.tag === "AI1");
  assert.equal(ai1.length, 2);
  assert.ok(ai1.some((l) => /DOAH/i.test(l.table_title || "")));
  assert.ok(ai1.some((l) => /AHU/i.test(l.table_title || "")));
});

test("rowsFromToolResult: query_table title {text,bbox} becomes plain string", () => {
  const rows = rowsFromToolResult("query_table", { title: "FAN SCHEDULE", row_key: "EF-1" }, {
    count: 1,
    matches: [{
      sheet: "mech.pdf#6",
      title: { text: "FAN SCHEDULE", bbox: [1, 2, 3, 4] },
      row: {
        key: "EF-1",
        all_cells: { CFM: { text: "165", bbox: [1, 2, 3, 4] }, MARK: { text: "EF-1" } },
      },
    }],
  }, { workflow: "fans" });
  assert.ok(rows.every((r) => typeof r.table_title === "string"));
  assert.equal(rows[0].table_title, "FAN SCHEDULE");
  // query_table scrap alone is Workflow data — not a finished Takeoff.
  assert.equal(compileAgentTakeoff(rows).length, 0);
  const seeded = [
    makeTakeoffRow({
      tag: "EF-1", field: "quantity", value: 1, unit: "EA",
      table_title: "FAN SCHEDULE", sheet_id: "mech.pdf#6",
      source_tool: "compile_corpus_takeoff",
    }),
    ...rows,
  ];
  const lines = compileAgentTakeoff(seeded);
  const groups = groupTakeoffByFamily(lines);
  assert.equal(groups[0].family, "FAN SCHEDULE");
  assert.equal(typeof groups[0].family, "string");
});

test("dedupe / merge keep first occurrence", () => {
  const a = makeTakeoffRow({ tag: "EF-1", field: "CFM", value: "165", sheet_id: "s" });
  const b = makeTakeoffRow({ tag: "EF-1", field: "CFM", value: "165", sheet_id: "s" });
  const c = makeTakeoffRow({ tag: "EF-2", field: "CFM", value: "400", sheet_id: "s" });
  assert.equal(dedupeTakeoffRows([a, b, c]).length, 2);
  assert.equal(mergeTakeoffRows([a], [b, c]).length, 2);
});

test("takeoffToCsv emits workflow EAV header + escaped rows", () => {
  const rows = [makeTakeoffRow({ tag: 'EF,"1"', field: "CFM", value: 165, unit: "CFM", sheet_id: "s#6" })];
  const csv = takeoffToCsv(rows);
  assert.match(csv, /^Tag,Field,Value,/);
  assert.match(csv, /"EF,""1"""/);
  assert.match(csv, /,165,/);
});

test("xlsx + pdf export builders produce non-empty artifacts", async () => {
  const rows = [
    makeTakeoffRow({
      tag: "VAV-1", field: "installed_quantity", value: 1, unit: "EA",
      sheet_id: "mech.pdf#2", table_title: "AIR TERMINAL",
      source_tool: "sweep_schedule_row",
    }),
    makeTakeoffRow({
      tag: "VAV-1", field: "CFM", value: 2170, sheet_id: "mech.pdf#6", table_title: "AIR TERMINAL",
      source_tool: "sweep_schedule_row",
    }),
    makeTakeoffRow({
      tag: "EF-2", field: "plan_status", value: "refused",
      sheet_id: "mech.pdf#6", table_title: "FAN SCHEDULE",
      source_tool: "query_table",
    }),
  ];
  const lines = compileAgentTakeoff(rows);
  assert.equal(lines.length, 1);
  assert.ok(takeoffSpecColumns(lines).includes("CFM") || takeoffSpecColumns(lines).some((c) => /CFM/i.test(c)));
  const sheetRows = [
    ["Tag", "Type", "Qty"],
    ...lines.map((r) => [r.tag || "", r.type, r.qty]),
  ];
  const xlsx = await buildXlsx([{ name: "Takeoff", rows: sheetRows }]);
  assert.ok(xlsx.byteLength > 500);

  const pdfBytes = await buildTakeoffPdfBytes(lines, { projectName: "Demo", mode: "compiled" });
  assert.ok(pdfBytes.byteLength > 400);
  const doc = await PDFDocument.load(pdfBytes);
  assert.ok(doc.getPageCount() >= 1);
});

test("cleanTakeoffTag strips markdown bold wrappers", () => {
  assert.equal(cleanTakeoffTag("**CV-AHU-A1-HHW**"), "CV-AHU-A1-HHW");
  assert.equal(cleanTakeoffTag("`CV-1`"), "CV-1");
  assert.equal(makeTakeoffRow({ tag: "**CV-2**", field: "quantity", value: 1 }).tag, "CV-2");
});

test("normalizeControlValveCells: one Cv + served equipment, never dual CHW/HHW Cv", () => {
  const cells = normalizeControlValveCells({
    cells: {
      "UNIT MARK": { text: "AHU-A1", bbox: [1, 2, 3, 4] },
      "VALVE SIZE (IN)": { text: "1", bbox: null },
      "FLOWRATE (GPM)": { text: "2.0", bbox: null },
      CV: { text: "0.5", bbox: [5, 6, 7, 8] },
      CONFIGURATION: { text: "2-WAY", bbox: null },
      NOTES: { text: "1", bbox: null },
      "CHW CV": { text: "20.3", bbox: null },
      "HHW CV": { text: "0.5", bbox: null },
    },
    table_bbox_px: [10, 20, 30, 40],
  }, "HHW");
  assert.equal(cells["Served equipment"]?.text, "AHU-A1");
  assert.equal(cells["Unit Mark"]?.text, "AHU-A1");
  assert.equal(cells.Service?.text, "HHW");
  assert.equal(cells.Cv?.text, "0.5");
  assert.equal(cells.GPM?.text, "2.0");
  assert.equal(cells.Size?.text, "1");
  assert.equal(cells["CHW CV"], undefined);
  assert.equal(cells["HHW CV"], undefined);
});

test("normalizeControlValveCells: promote printed actuator / fail / signal (WP7)", () => {
  const cells = normalizeControlValveCells({
    cells: {
      "UNIT MARK": { text: "VAV-1", bbox: null },
      "VALVE SIZE": { text: "1/2", bbox: null },
      ACTUATOR: { text: "24V ELECTRIC", bbox: [1, 2, 3, 4] },
      "FAIL POSITION": { text: "NO", bbox: null },
      "CONTROL SIGNAL": { text: "0-10V", bbox: null },
      CV: { text: "1.2", bbox: null },
    },
  }, null);
  assert.equal(cells.Actuator?.text, "24V ELECTRIC");
  assert.equal(cells["Fail position"]?.text, "NO");
  assert.equal(cells["Control signal"]?.text, "0-10V");
  assert.equal(cells.Cv?.text, "1.2");
  assert.equal(cells.Service, undefined);
});

test("control_valves compile includes isolation/damper families; CHW filter stays hydronic", () => {
  const graph = {
    tables: [
      {
        sheet: "m.pdf#1",
        title: { text: "CHW CONTROL VALVE SCHEDULE", bbox: [0, 0, 10, 10] },
        rows: [{
          key: "CV-1",
          cells: {
            "VALVE MARK": { text: "CV-1", bbox: [1, 1, 2, 2] },
            "UNIT MARK": { text: "AHU-1", bbox: null },
            CV: { text: "4", bbox: null },
          },
          identity: { bbox: [1, 1, 2, 2] },
        }],
      },
      {
        sheet: "m.pdf#2",
        title: { text: "ISOLATION VALVE SCHEDULE", bbox: [0, 0, 10, 10] },
        rows: [{
          key: "IV-1",
          cells: {
            "VALVE MARK": { text: "IV-1", bbox: [3, 3, 4, 4] },
            "UNIT MARK": { text: "CH-1", bbox: null },
          },
          identity: { bbox: [3, 3, 4, 4] },
        }],
      },
      {
        sheet: "m.pdf#3",
        title: { text: "CONTROL DAMPER SCHEDULE", bbox: [0, 0, 10, 10] },
        rows: [{
          key: "OA-1",
          cells: {
            "DAMPER MARK": { text: "OA-1", bbox: [5, 5, 6, 6] },
            ACTUATOR: { text: "ELECTRIC", bbox: null },
          },
          identity: { bbox: [5, 5, 6, 6] },
        }],
      },
    ],
  };
  const all = compileControlValveTakeoff([], graph);
  assert.ok((all.categories.CHW_CONTROL_VALVE?.count || 0) >= 1);
  assert.ok((all.categories.ISOLATION_VALVE?.count || 0) >= 1);
  assert.ok((all.categories.CONTROL_DAMPER?.count || 0) >= 1);
  assert.ok(all.totals.items >= 3);
  assert.equal(all.estimator_status.estimator_complete, false);
  assert.equal(all.estimator_status.gt_locked, false);
  assert.ok(all.estimator_product);
  assert.equal(all.estimator_product.estimator_complete, false);
  assert.ok(all.estimator_product.printed_items >= 3);
  assert.equal(all.estimator_product.plan_paint.status, "refuse_not_done");
  assert.ok(all.estimator_status.gates.some((g) => g.gate === "plan_paint" && g.status === "refuse_not_done"));
  assert.ok(all.estimator_status.gates.some((g) => g.gate === "gt_lock" && g.status === "refuse_not_done"));
  const chwOnly = compileControlValveTakeoff([], graph, { service: "CHW" });
  assert.equal(chwOnly.categories.ISOLATION_VALVE, undefined);
  assert.equal(chwOnly.categories.CONTROL_DAMPER, undefined);
  assert.ok((chwOnly.categories.CHW_CONTROL_VALVE?.count || 0) >= 1);
  assert.equal(chwOnly.estimator_status.estimator_complete, false);
});

test("rowsFromCompiledTakeoff: VALVE_ESTIMATOR refuse_not_done + product disclosed", () => {
  const rows = rowsFromCompiledTakeoff({
    takeoff_id: "T-VALVE-01",
    kind: "control_valves",
    estimator_status: {
      estimator_complete: false,
      gt_locked: false,
      meaning: "refuse_not_done = unfinished valve work",
      gates: [
        { gate: "printed_valve_schedules", status: "open", note: "plumbing" },
        { gate: "plan_paint", status: "refuse_not_done", note: "paint required" },
        { gate: "gt_lock", status: "refuse_not_done", note: "not locked" },
      ],
    },
    estimator_product: {
      printed_items: 3,
      contractor_column_coverage: {
        missing_on_some_rows: ["Actuator", "Fail position"],
        note: "printed only",
      },
      plan_paint: { status: "refuse_not_done", note: "paint required" },
    },
    categories: {
      CHW_CONTROL_VALVE: {
        count: 1,
        items: [{
          tag: "CV-1", quantity: 1, sheet_id: "m#1", table_title: "CHW CONTROL VALVE SCHEDULE",
          cells: { Cv: { text: "4" }, "Served equipment": { text: "AHU-1" } },
        }],
      },
    },
  });
  assert.ok(rows.some((r) => r.tag === "VALVE_ESTIMATOR" && r.field === "estimator_complete" && /NO/.test(String(r.value))));
  assert.ok(rows.some((r) => r.tag === "VALVE_ESTIMATOR" && r.field === "refuse:plan_paint" && r.value === "refuse_not_done"));
  assert.ok(rows.some((r) => r.tag === "VALVE_ESTIMATOR" && r.field === "refuse:gt_lock"));
  assert.ok(rows.some((r) => r.tag === "VALVE_ESTIMATOR" && r.field === "printed_valve_items" && r.value === 3));
  assert.ok(rows.some((r) => r.tag === "VALVE_ESTIMATOR" && r.field === "contractor_column_gaps" && /Actuator/.test(String(r.value))));
  assert.ok(rows.some((r) => r.tag === "VALVE_ESTIMATOR" && r.field === "plan_paint" && r.value === "refuse_not_done"));
  assert.ok(rows.some((r) => r.tag === "CV-1" && r.field === "quantity"));
  assert.ok(!rows.some((r) => r.tag === "VALVE_ESTIMATOR" && /printed_valve_schedules/.test(String(r.field))));
});

test("control_valves compile → panel lines with cites; dual-Cv scrap dropped", () => {
  const compiled = compileControlValveTakeoff([], {
    tables: [
      {
        sheet: "mech.pdf#44",
        title: { text: "HHW CONTROL VALVE SCHEDULE", bbox: [0, 0, 100, 10] },
        rows: [
          {
            key: "CV-AHU-A1-HHW",
            cells: {
              "VALVE MARK": { text: "CV-AHU-A1-HHW", bbox: [1, 2, 3, 4] },
              "UNIT MARK": { text: "AHU-A1", bbox: [5, 6, 7, 8] },
              "FLOWRATE (GPM)": { text: "2.0", bbox: null },
              "VALVE SIZE (IN)": { text: "1", bbox: null },
              CV: { text: "0.5", bbox: null },
              CONFIGURATION: { text: "2-WAY", bbox: null },
            },
            identity: { bbox: [1, 2, 3, 4] },
          },
        ],
      },
      {
        sheet: "mech.pdf#44",
        title: { text: "CHW CONTROL VALVE SCHEDULE", bbox: [0, 50, 100, 60] },
        rows: [
          {
            key: "CV-AHU-A1-CHW",
            cells: {
              "VALVE MARK": { text: "CV-AHU-A1-CHW", bbox: [11, 12, 13, 14] },
              "UNIT MARK": { text: "AHU-A1", bbox: null },
              "FLOWRATE (GPM)": { text: "61.5", bbox: null },
              "VALVE SIZE (IN)": { text: "2", bbox: null },
              CV: { text: "27.5", bbox: null },
            },
            identity: { bbox: [11, 12, 13, 14] },
          },
        ],
      },
    ],
  });
  assert.equal(compiled.kind, "control_valves");
  assert.equal(compiled.takeoff_id, "T-VALVE-01");
  assert.equal(compiled.totals.items, 2);
  assert.equal(compiled.service_filter, null);
  assert.equal(compiled.categories.HHW_CONTROL_VALVE.count, 1);
  assert.equal(compiled.categories.CHW_CONTROL_VALVE.count, 1);
  assert.equal(compiled.categories.HHW_CONTROL_VALVE.items[0].cells.Cv.text, "0.5");
  assert.equal(compiled.categories.HHW_CONTROL_VALVE.items[0].cells["Served equipment"].text, "AHU-A1");

  const chwOnly = compileControlValveTakeoff([], {
    tables: [
      {
        sheet: "mech.pdf#44",
        title: { text: "HHW CONTROL VALVE SCHEDULE", bbox: [0, 0, 100, 10] },
        rows: [{
          key: "CV-AHU-A1-HHW",
          cells: {
            "VALVE MARK": { text: "CV-AHU-A1-HHW", bbox: [1, 2, 3, 4] },
            "UNIT MARK": { text: "AHU-A1", bbox: null },
            CV: { text: "0.5", bbox: null },
          },
          identity: { bbox: [1, 2, 3, 4] },
        }],
      },
      {
        sheet: "mech.pdf#44",
        title: { text: "CHW CONTROL VALVE SCHEDULE", bbox: [0, 50, 100, 60] },
        rows: [{
          key: "CV-AHU-A1-CHW",
          cells: {
            "VALVE MARK": { text: "CV-AHU-A1-CHW", bbox: [11, 12, 13, 14] },
            "UNIT MARK": { text: "AHU-A1", bbox: null },
            CV: { text: "27.5", bbox: null },
          },
          identity: { bbox: [11, 12, 13, 14] },
        }],
      },
    ],
  }, { service: "CHW" });
  assert.equal(chwOnly.service_filter, "CHW");
  assert.equal(chwOnly.totals.items, 1);
  assert.equal(chwOnly.categories.CHW_CONTROL_VALVE?.count, 1);
  assert.equal(chwOnly.categories.HHW_CONTROL_VALVE, undefined);
  assert.ok(chwOnly.exclusions.some((e) => /HHW/i.test(e) && /filtered/i.test(e)));

  const hhwOnly = compileControlValveTakeoff([], {
    tables: [
      {
        sheet: "mech.pdf#44",
        title: { text: "HHW CONTROL VALVE SCHEDULE", bbox: [0, 0, 100, 10] },
        rows: [{
          key: "CV-AHU-A1-HHW",
          cells: {
            "VALVE MARK": { text: "CV-AHU-A1-HHW", bbox: [1, 2, 3, 4] },
            "UNIT MARK": { text: "AHU-A1", bbox: null },
            CV: { text: "0.5", bbox: null },
          },
          identity: { bbox: [1, 2, 3, 4] },
        }],
      },
      {
        sheet: "mech.pdf#44",
        title: { text: "CHW CONTROL VALVE SCHEDULE", bbox: [0, 50, 100, 60] },
        rows: [{
          key: "CV-AHU-A1-CHW",
          cells: {
            "VALVE MARK": { text: "CV-AHU-A1-CHW", bbox: [11, 12, 13, 14] },
            "UNIT MARK": { text: "AHU-A1", bbox: null },
            CV: { text: "27.5", bbox: null },
          },
          identity: { bbox: [11, 12, 13, 14] },
        }],
      },
    ],
  }, { service: "HHW" });
  assert.equal(hhwOnly.service_filter, "HHW");
  assert.equal(hhwOnly.totals.items, 1);
  assert.equal(hhwOnly.categories.HHW_CONTROL_VALVE?.count, 1);
  assert.equal(hhwOnly.categories.CHW_CONTROL_VALVE, undefined);

  const rows = rowsFromCompiledTakeoff(compiled, { workflow: "valve takeoff" });
  // Inject dual-Cv scrap that must not appear on the compiled valve line.
  rows.push(makeTakeoffRow({
    tag: "CV-AHU-A1-HHW", field: "CHW CV", value: "20.3",
    sheet_id: "mech.pdf#44", table_title: "HHW CONTROL VALVE SCHEDULE",
    source_tool: "answer_table",
  }));
  rows.push(makeTakeoffRow({
    tag: "CV-AHU-A1-HHW", field: "HHW CV", value: "0.5",
    sheet_id: "mech.pdf#44", table_title: "HHW CONTROL VALVE SCHEDULE",
    source_tool: "answer_table",
  }));
  const lines = compileAgentTakeoff(rows);
  assert.equal(lines.length, 2);
  const hhw = lines.find((l) => l.tag === "CV-AHU-A1-HHW");
  assert.ok(hhw);
  assert.ok(lineLeadCite(hhw, "tag")?.bbox_px);
  assert.equal(hhw.sheet_id, "mech.pdf#44");
  assert.equal(hhw.specs["CHW CV"], undefined);
  assert.equal(hhw.specs["HHW CV"], undefined);
  assert.ok(hhw.specs.Cv === "0.5" || hhw.specs.CV === "0.5" || Object.values(hhw.specs).includes("0.5"));
  assert.equal(hhw.unit_mark, "AHU-A1");
  assert.match(hhw.family, /Building A · .*HHW CONTROL VALVE/i);
  const cite = lineLeadCite(hhw, "tag");
  assert.ok(cite?.bbox_px);
  // Prefer whole-row bbox when present (union of cells).
  if (hhw.row_bbox_px) {
    assert.deepEqual(cite.bbox_px, hhw.row_bbox_px);
  }
  const groups = groupTakeoffByFamily(lines);
  assert.ok(groups.some((g) => /Building A · .*CONTROL VALVE/i.test(String(g.family))));
  const lead = takeoffLeadColumns(lines.filter((l) => /VALVE/i.test(l.table_title || "")));
  assert.ok(lead.some((c) => c.key === "unit_mark" && /Unit Mark/i.test(c.label)));
  assert.ok(lead.some((c) => c.key === "tag" && /Valve Mark/i.test(c.label)));
});

test("valve takeoff sections Building · CHW before Building · HHW; row cite uses union bbox", () => {
  const compiled = compileControlValveTakeoff([], {
    tables: [
      {
        sheet: "mech.pdf#49",
        title: { text: "CHW CONTROL VALVE SCHEDULE", bbox: [0, 0, 50, 10] },
        rows: [{
          key: "AHU-T1A-CHW",
          cells: {
            "UNIT MARK": { text: "AHU-T1A", bbox: [10, 20, 30, 40] },
            "VALVE MARK": { text: "AHU-T1A-CHW", bbox: [30, 20, 60, 40] },
            "FLOWRATE (GPM)": { text: "32.0", bbox: [60, 20, 90, 40] },
            CV: { text: "14.3", bbox: [90, 20, 120, 40] },
          },
        }],
      },
      {
        sheet: "mech.pdf#44",
        title: { text: "HHW CONTROL VALVE SCHEDULE", bbox: [0, 0, 50, 10] },
        rows: [{
          key: "CV-AHU-A1-HHW",
          cells: {
            "UNIT MARK": { text: "AHU-A1", bbox: [1, 2, 3, 4] },
            "VALVE MARK": { text: "CV-AHU-A1-HHW", bbox: [3, 2, 5, 4] },
            CV: { text: "0.5", bbox: [5, 2, 7, 4] },
          },
        }],
      },
      {
        sheet: "mech.pdf#44",
        title: { text: "CHW CONTROL VALVE SCHEDULE", bbox: [0, 50, 50, 60] },
        rows: [{
          key: "CV-AHU-A1-CHW",
          cells: {
            "UNIT MARK": { text: "AHU-A1", bbox: [10, 50, 20, 60] },
            "VALVE MARK": { text: "CV-AHU-A1-CHW", bbox: [20, 50, 40, 60] },
            CV: { text: "27.5", bbox: [40, 50, 55, 60] },
          },
        }],
      },
    ],
  });
  const item = compiled.categories.CHW_CONTROL_VALVE.items.find((i) => /T1A/i.test(i.tag));
  assert.ok(item?.row_bbox_px);
  assert.deepEqual(item.row_bbox_px, [10, 20, 120, 40]);
  assert.equal(item.building, "T");
  // No project-name hardcodes in BUILDING field.
  const rows = rowsFromCompiledTakeoff(compiled);
  const bldgRows = rows.filter((r) => r.field === "BUILDING");
  assert.ok(bldgRows.every((r) => /^Building [A-Z0-9]+$/i.test(String(r.value))));
  assert.equal(bldgRows.some((r) => /Air Ops|MITRACON|ATCT/i.test(String(r.value))), false);

  const lines = compileAgentTakeoff(rows);
  const groups = groupTakeoffByFamily(lines);
  const names = groups.map((g) => String(g.family));
  // Building A sections before Building T; within a building CHW before HHW.
  const idxAChw = names.findIndex((n) => /Building A · .*CHW/i.test(n));
  const idxAHhw = names.findIndex((n) => /Building A · .*HHW/i.test(n));
  const idxTChw = names.findIndex((n) => /Building T · .*CHW/i.test(n));
  assert.ok(idxAChw >= 0 && idxAHhw >= 0 && idxTChw >= 0);
  assert.ok(idxAChw < idxAHhw, `CHW before HHW within building: ${names.join(" | ")}`);
  assert.ok(idxAChw < idxTChw, `Building A before Building T: ${names.join(" | ")}`);
});

test("query_table CONTROL VALVE title-scan expands beyond 24 matches", () => {
  const matches = Array.from({ length: 30 }, (_, i) => ({
    sheet: "mech.pdf#44",
    title: { text: "CHW CONTROL VALVE SCHEDULE" },
    row: {
      key: `CV-${i}`,
      all_cells: {
        "VALVE MARK": { text: `CV-${i}`, bbox: [i, 1, i + 1, 2] },
        CV: { text: "1.0", bbox: null },
      },
    },
  }));
  const rows = rowsFromToolResult("query_table", { title: "CHW CONTROL VALVE SCHEDULE" }, {
    count: 30,
    matches,
  });
  assert.ok(rows.some((r) => r.tag === "CV-0"));
  assert.ok(rows.filter((r) => r.field === "quantity" || r.tag).length >= 30);
  assert.equal(rows.filter((r) => r.field === "schedule_count").length, 0);
});
