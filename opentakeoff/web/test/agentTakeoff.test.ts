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

test("compileAgentTakeoff collapses EAV rows into line items", () => {
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
    makeTakeoffRow({
      tag: "EF-2", field: "plan_status", value: "refused",
      sheet_id: "mech.pdf#6", table_title: "FAN SCHEDULE", workflow: "fans",
    }),
    makeTakeoffRow({
      tag: "EF-2", field: "CFM", value: 400, unit: "CFM",
      sheet_id: "mech.pdf#6", table_title: "FAN SCHEDULE", workflow: "fans",
    }),
  ];
  const lines = compileAgentTakeoff(rows);
  assert.equal(lines.length, 2);
  const vav = lines.find((l) => l.tag === "VAV-1");
  assert.ok(vav);
  assert.equal(vav.qty, 1);
  assert.equal(vav.unit, "EA");
  assert.equal(vav.qty_kind, "installed");
  assert.match(vav.description, /TRANE/);
  assert.match(vav.attrs_text, /CFM 2170/);
  assert.equal(vav.sheet_id, "mech.pdf#2");
  const ef = lines.find((l) => l.tag === "EF-2");
  assert.ok(ef);
  assert.equal(ef.qty, 1);
  assert.equal(ef.qty_kind, "scheduled");
  assert.match(ef.notes, /refused/i);
  const csv = compiledTakeoffToCsv(lines);
  assert.match(csv, /^Tag,/);
  assert.match(csv, /VAV-1/);
  assert.match(csv, /CFM/);
});

test("columns adapt per family: valves vs VAV vs points", () => {
  const rows = [
    makeTakeoffRow({
      tag: "VAV-1", field: "CFM", value: "2170",
      table_title: "AIR TERMINAL BOX SCHEDULE", sheet_id: "m#6",
    }),
    makeTakeoffRow({
      tag: "VAV-1", field: "MBH", value: "41",
      table_title: "AIR TERMINAL BOX SCHEDULE", sheet_id: "m#6",
    }),
    makeTakeoffRow({
      tag: "CV-3", field: "GPM", value: "18",
      table_title: "CONTROL VALVE SCHEDULE", sheet_id: "m#8",
    }),
    makeTakeoffRow({
      tag: "CV-3", field: "Cv", value: "5.2",
      table_title: "CONTROL VALVE SCHEDULE", sheet_id: "m#8",
    }),
    makeTakeoffRow({
      tag: "CV-3", field: "PIPE SIZE", value: "1-1/2\"",
      table_title: "CONTROL VALVE SCHEDULE", sheet_id: "m#8",
    }),
    makeTakeoffRow({
      tag: "AHU-1 SA TEMP", field: "POINT TYPE", value: "AI",
      table_title: "AHU-1 POINTS LIST", sheet_id: "c#2",
    }),
    makeTakeoffRow({
      tag: "AHU-1 SA TEMP", field: "SIGNAL", value: "4-20mA",
      table_title: "AHU-1 POINTS LIST", sheet_id: "c#2",
    }),
    makeTakeoffRow({
      tag: "AHU-1 SA TEMP", field: "CONTROLLER", value: "UC600-1",
      table_title: "AHU-1 POINTS LIST", sheet_id: "c#2",
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
  const { chat, hadTables } = splitConversationalAnswer(md, { rowCount: rows.length });
  assert.equal(hadTables, true);
  assert.match(chat, /Found the fan schedule/);
  assert.match(chat, /Takeoff panel/);
  assert.doesNotMatch(chat, /\| Tag \|/);
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
            { tag: "AI1", quantity: 1, sheet_id: "c#2", table_title: "AHU-1 POINTS LIST", description: "SA TEMP" },
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
  const lines = compileAgentTakeoff(rows);
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
    makeTakeoffRow({ tag: "VAV-1", field: "CFM", value: 2170, sheet_id: "mech.pdf#6", table_title: "AIR TERMINAL" }),
    makeTakeoffRow({ tag: "VAV-1", field: "installed_quantity", value: 1, unit: "EA", sheet_id: "mech.pdf#2", table_title: "AIR TERMINAL" }),
    makeTakeoffRow({ tag: "EF-2", field: "plan_status", value: "refused", sheet_id: "mech.pdf#6", table_title: "FAN SCHEDULE" }),
  ];
  const lines = compileAgentTakeoff(rows);
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
  assert.equal(cells.Service?.text, "HHW");
  assert.equal(cells.Cv?.text, "0.5");
  assert.equal(cells.GPM?.text, "2.0");
  assert.equal(cells.Size?.text, "1");
  assert.equal(cells["CHW CV"], undefined);
  assert.equal(cells["HHW CV"], undefined);
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
  assert.ok(
    hhw.specs["Served equipment"] === "AHU-A1"
    || hhw.specs["UNIT MARK"] === "AHU-A1"
    || Object.values(hhw.specs).includes("AHU-A1"),
  );
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
