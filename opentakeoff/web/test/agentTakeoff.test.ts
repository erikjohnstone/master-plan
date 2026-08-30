import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  buildTakeoffPdfBytes,
  compileAgentTakeoff,
  compiledTakeoffToCsv,
  dedupeTakeoffRows,
  groupTakeoffByFamily,
  makeTakeoffRow,
  mergeTakeoffRows,
  rowsFromAnswerMarkdown,
  rowsFromToolResult,
  splitConversationalAnswer,
  takeoffLeadColumns,
  takeoffSpecColumns,
  takeoffToCsv,
} from "../src/lib/agentTakeoff.js";
import { buildXlsx } from "../src/lib/xlsx.js";

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
