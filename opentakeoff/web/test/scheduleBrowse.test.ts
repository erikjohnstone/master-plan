// The arithmetic behind the Schedules panel. Every case here is a shape the
// real sheet graph actually produces — an empty-text title cell, a row whose
// ink sits on a continuation sheet, a table with no region.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tableTitleText, rowBbox, rowSheet, splitSheetKey,
  summarize, filterTables, tableId, readingOrder, groupBySheet, previewColumns,
} from "../src/lib/scheduleBrowse.js";

const cell = (text: string, bbox: number[]) => ({ text, bbox });

test("tableTitleText: a title cell with EMPTY text is a string, never the evidence object", () => {
  assert.equal(tableTitleText({ title: "VAV SCHEDULE" }), "VAV SCHEDULE");
  assert.equal(tableTitleText({ title: { sheet: "a.pdf#1", text: "FAN SCHEDULE", bbox: [0, 0, 1, 1] } }), "FAN SCHEDULE");
  // the live 03__vol1__27 case: the cell exists, its text is "". `t.title?.text
  // || t.title` returns the OBJECT here, and every caller does .toUpperCase().
  const empty = { title: { sheet: "a.pdf#16", text: "", bbox: [0, 0, 1, 1] } };
  assert.equal(tableTitleText(empty), "");
  assert.equal(typeof tableTitleText(empty), "string");
  assert.equal(tableTitleText({ title: null }), "");
  assert.equal(tableTitleText({}), "");
  assert.equal(tableTitleText(undefined), "");
});

test("rowBbox: a row is exactly the extent of its cells", () => {
  const row = { key: "VAV-1", sheet: "a.pdf#3", cells: { TAG: cell("VAV-1", [10, 20, 60, 34]), CFM: cell("350", [60, 20, 110, 34]) } };
  assert.deepEqual(rowBbox(row), [10, 20, 110, 34]);
});

test("rowBbox: cells with no or malformed bbox are skipped, not counted as zero", () => {
  const row = {
    key: "AHU-1", sheet: "a.pdf#3",
    cells: {
      TAG: cell("AHU-1", [10, 20, 60, 34]),
      NOTE: { text: "see 3/M501" } as any,                 // no bbox at all
      BAD: cell("x", [0, 0, Number.NaN] as any),           // wrong length
    },
  };
  // a naive min/max would drag x0 to 0 via the malformed rows
  assert.deepEqual(rowBbox(row), [10, 20, 60, 34]);
});

test("rowBbox: no usable cell, or a degenerate box, yields null rather than a bad citation", () => {
  assert.equal(rowBbox({ key: "x", sheet: "a", cells: {} }), null);
  assert.equal(rowBbox({ key: "x", sheet: "a", cells: { A: cell("v", [5, 5, 5, 5]) } }), null);
  assert.equal(rowBbox(undefined as any), null);
});

test("rowSheet: a continued row cites the sheet its ink is on, not the table's base", () => {
  const table = { sheet: "a.pdf#3" };
  assert.equal(rowSheet(table, { key: "V-9", sheet: "a.pdf#4", cells: {} }), "a.pdf#4");
  assert.equal(rowSheet(table, { key: "V-1", cells: {} } as any), "a.pdf#3");
});

test("splitSheetKey handles a page, no page, and a filename containing #", () => {
  assert.deepEqual(splitSheetKey("plans.pdf#12"), { file: "plans.pdf", page: 12 });
  assert.deepEqual(splitSheetKey("plans.pdf"), { file: "plans.pdf", page: 1 });
  assert.deepEqual(splitSheetKey("set #2.pdf#7"), { file: "set #2.pdf", page: 7 });
  assert.deepEqual(splitSheetKey(""), { file: "", page: 1 });
});

test("summarize counts a continued table ONCE but every sheet its parts touch", () => {
  const tables = [
    { sheet: "a.pdf#3", rows: [{}, {}], parts: [{ sheet: "a.pdf#3" }, { sheet: "a.pdf#4" }] },
    { sheet: "a.pdf#3", rows: [{}] },
    { sheet: "a.pdf#9", rows: [] },
  ] as any;
  assert.deepEqual(summarize(tables), { tables: 3, sheets: 3, rows: 3 });
  assert.deepEqual(summarize([]), { tables: 0, sheets: 0, rows: 0 });
  assert.deepEqual(summarize(undefined as any), { tables: 0, sheets: 0, rows: 0 });
});

test("filterTables searches title, headers, row keys and sheet — and ignores case and spacing", () => {
  const tables = [
    { sheet: "a.pdf#3", title: "VAV  TERMINAL SCHEDULE", headers: ["TAG", "CFM"], rows: [{ key: "VAV-1" }] },
    { sheet: "b.pdf#8", title: { text: "FAN SCHEDULE" }, headers: ["TAG", "SONES"], rows: [{ key: "EF-2" }] },
  ] as any;
  assert.equal(filterTables(tables, "vav terminal").length, 1);
  assert.equal(filterTables(tables, "sones").length, 1);
  assert.equal(filterTables(tables, "EF-2").length, 1);
  assert.equal(filterTables(tables, "b.pdf").length, 1);
  assert.equal(filterTables(tables, "  ").length, 2, "an empty query matches everything");
  assert.equal(filterTables(tables, "nope").length, 0);
});

test("tableId is stable and distinguishes two tables on one sheet", () => {
  const a = { sheet: "a.pdf#3", region: [10.4, 20.6, 100, 200] } as any;
  const b = { sheet: "a.pdf#3", region: [300, 20, 400, 200] } as any;
  assert.equal(tableId(a), tableId({ ...a }));
  assert.notEqual(tableId(a), tableId(b));
  assert.equal(tableId({} as any), "?@?");
});

test("readingOrder walks the set front to back, then down each sheet", () => {
  const tables = [
    { sheet: "a.pdf#12", region: [0, 500, 1, 1] },
    { sheet: "a.pdf#3", region: [0, 900, 1, 1] },
    { sheet: "a.pdf#3", region: [0, 100, 1, 1] },
  ] as any;
  assert.deepEqual(readingOrder(tables).map((t: any) => `${t.sheet}@${t.region[1]}`),
    ["a.pdf#3@100", "a.pdf#3@900", "a.pdf#12@500"]);
});

test("filterTables matches the KIND the panel prints as a chip", () => {
  const tables = [
    { sheet: "a.pdf#3", title: "VAV TERMINAL SCHEDULE", kind: "equipment", headers: ["TAG"], rows: [] },
    { sheet: "a.pdf#4", title: "ROOM FINISH SCHEDULE", kind: "room-finish", headers: ["ROOM"], rows: [] },
  ] as any;
  // the chip says "equipment"; typing it has to select those tables
  assert.equal(filterTables(tables, "equipment").length, 1);
  assert.equal(filterTables(tables, "room-finish").length, 1);
});

test("groupBySheet: sheets in reading order, tables in reading order inside them", () => {
  const tables = [
    { sheet: "a.pdf#12", region: [0, 500, 1, 1], title: "C" },
    { sheet: "a.pdf#3", region: [0, 900, 1, 1], title: "B" },
    { sheet: "a.pdf#3", region: [0, 100, 1, 1], title: "A" },
    { sheet: "b.pdf#1", region: [0, 10, 1, 1], title: "D" },
  ] as any;
  const g = groupBySheet(tables);
  assert.deepEqual(g.map((x: any) => x.sheet), ["a.pdf#3", "a.pdf#12", "b.pdf#1"]);
  assert.deepEqual(g[0].tables.map((t: any) => t.title), ["A", "B"]);
  assert.deepEqual(g.map((x: any) => x.page), [3, 12, 1]);
  assert.deepEqual(groupBySheet([]), []);
  assert.deepEqual(groupBySheet(undefined as any), []);
});

test("previewColumns picks what identifies the equipment, not the first three columns", () => {
  // the real 'AIR-COOLED CONDENSING UNIT' shape: the tag is the row key, and
  // MANUFACTURER/MODEL/NOM. TONS are what an estimator scans for
  const eq = ["EQUIP. TAG", "MANUFACTURER", "MODEL", "NOM. TONS", "# OF COMP.", "NOTES"];
  assert.deepEqual(previewColumns(eq), ["MANUFACTURER", "MODEL", "NOM. TONS"]);
  // a schedule that leads with location must not bury the model behind it
  const led = ["LOCATION", "SERVICE", "QTY", "MANUFACTURER", "MODEL"];
  assert.deepEqual(previewColumns(led), ["SERVICE", "MANUFACTURER", "MODEL"]);
  // printed in the SCHEDULE'S own column order, never in rank order
  const shuffled = ["CFM", "MANUFACTURER"];
  assert.deepEqual(previewColumns(shuffled, 2), ["CFM", "MANUFACTURER"]);
});

test("previewColumns degrades to header order when it recognises nothing", () => {
  assert.deepEqual(previewColumns(["ALPHA", "BETA", "GAMMA", "DELTA"]), ["ALPHA", "BETA", "GAMMA"]);
  assert.deepEqual(previewColumns([]), []);
  assert.deepEqual(previewColumns(undefined as any), []);
  assert.deepEqual(previewColumns(["A", "", null, "B"] as any, 3), ["A", "B"]);
  assert.equal(previewColumns(["MODEL", "CFM", "SIZE", "TYPE"], 2).length, 2);
});
