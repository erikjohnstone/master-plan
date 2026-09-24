// ASSEMBLIES instrument 5 (scripts/assemblies-export-validate.mjs): what it checks on one
// document's snapshot. The CSV set passes csvSetProblems; the HIT rows, coil-derived ones
// included, fill workbooks whose rows read back one for one and stay in the dropdown range.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { starterLibrary, validateDocument, workbookDataRows } from "../scripts/assemblies-export-validate.mjs";
import { valveSizeTemplateFiles } from "../../web/src/lib/valveSizeTemplate.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = new Uint8Array(readFileSync(resolve(HERE, "../../web/public/templates/Valve_Size_Template_US_Global.xlsx")));
const LIB = starterLibrary();

const item = (family, tag, i, cells = {}) => ({
  family, tag, sheet_id: "m.pdf#3", table_title: `${family} SCHEDULE`,
  cells: { MARK: { text: tag, bbox: [i, 0, i + 1, 1] }, ...Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, { text: v, bbox: null }])) },
});
const valve = (tag, gpm) => ({ tag, sheet_id: "m.pdf#5", table_title: "CONTROL VALVE SCHEDULE", cells: { "Unit Mark": { text: "FCU-1" }, Service: { text: "HHW" }, GPM: { text: String(gpm) }, Size: { text: "3/4\"" } } });
const coil = (tag) => ({ tag, sheet_id: "m.pdf#4", table_title: "FAN COIL UNIT SCHEDULE", cells: { "COIL LABEL": { text: "HOT WATER COIL" }, GPM: { text: "2.5" } } });

test("one document: the CSV set is sound, the HIT rows (scheduled + coil-derived) read back, CoilDP blank", async () => {
  const snapshot = {
    items: [item("FCU", "FCU-1", 0), item("PUMP", "P-1", 1)], tables: [], pages: {}, printed_points: [],
    hit: { valves: { categories: { HHW_CONTROL_VALVE: { items: [valve("CV-1", 2)] } } }, coils: { categories: { embedded_coil_gaps: { items: [coil("FCU-2")] } } } },
  };
  const r = await validateDocument(snapshot, LIB, TEMPLATE);
  assert.deepEqual(r.csv_problems, []);
  assert.equal(r.units, 2);
  assert.deepEqual([r.hit.scheduled_rows, r.hit.coil_derived_rows, r.hit.coil_derived_with_gpm], [1, 1, 1]);
  assert.deepEqual(r.hit.workbooks.map((w) => [w.rows, w.read_back]), [[2, 2]]);
  assert.deepEqual(r.hit.problems, []);
});

test("past 195 valves: several workbooks, every row read back once, none past row 200", async () => {
  const many = Array.from({ length: 401 }, (_, i) => valve(`CV-${i + 1}`, 1 + (i % 7)));
  const snapshot = { items: [item("PUMP", "P-1", 0)], tables: [], pages: {}, printed_points: [], hit: { valves: { categories: { HHW_CONTROL_VALVE: { items: many } } }, coils: { categories: {} } } };
  const r = await validateDocument(snapshot, LIB, TEMPLATE);
  assert.deepEqual(r.hit.workbooks.map((w) => w.rows), [195, 195, 11]);
  assert.equal(r.hit.rows_read_back, 401);
  assert.ok(r.hit.workbooks.every((w) => w.last_row <= 200));
  assert.deepEqual(r.hit.problems, []);
  // The reader counts what the fill wrote.
  const [file] = await valveSizeTemplateFiles(TEMPLATE, []);
  assert.deepEqual(workbookDataRows(file.bytes), { rows: 0, last: null });
});
