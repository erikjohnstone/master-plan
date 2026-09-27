// AS-61 — scheduled rows the takeoff reads as no unit (src/lib/assemblies/leftOut.ts).
// Shapes from the corpus census: 05_MO's building-prefixed marks (1-VAV-1,
// 1-TU-28-1 beside ATU-6-1 in one schedule), 031_MO's W05-TU-01, 03_FL's
// "(E) ATU A" read from a MARK cell, 069_ID's AHU-1(E); and what must stay
// silent: 02_UT's abbreviations list titled AIR HANDLING UNIT, 040_IL's
// transposed schedule, 031_MO's size letters.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyAssemblies } from "../../src/lib/assemblies/apply.ts";
import { pricedFamilies, readsAsMark, rowsLeftOutPriced, scheduleRowsLeftOut } from "../../src/lib/assemblies/leftOut.ts";
import { sanitizeAssemblyDefinitions } from "../../src/lib/assemblies/schema.ts";
import { STARTER_DIR } from "../../scripts/assemblies-starter/build.mts";

const LIB = sanitizeAssemblyDefinitions([
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-typicals-v1.json"), "utf8")).assemblies,
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-hookups-v1.json"), "utf8")).assemblies,
]).assemblies;

/** A graph row at line `y`: its key in a MARK cell, and one more cell. */
const gRow = (key: string, y: number) => ({
  key, cells: { MARK: { text: key, bbox: [10, y, 60, y + 8] }, CFM: { text: "400", bbox: [70, y, 100, y + 8] } },
});
const table = (sheet: string, title: string, keys: readonly string[]) => ({
  sheet, title: { text: title }, headers: ["MARK", "CFM"], rows: keys.map((k, i) => gRow(k, 100 + 10 * i)),
});
/** A compiled row of `family` whose mark cell sits at line `y` of `sheet`. */
const item = (tag: string, sheet: string, y: number | null) => ({ tag, sheet_id: sheet, table_title: "", bbox_px: y === null ? null : [12, y + 1, 58, y + 7] });

test("a mark reads as one as printed, or after a building or area token; a word, a phrase or a lone letter does not", () => {
  for (const k of ["AHU-1", "1-VAV-1", "40-AHU-2", "W05-TU-01", "WC01A-TU-05", "B950-AHU-3001", "SS-1/SSCU-1", "40-HM-140-HM-2", "FC-A-13-1", "1-EF-36TEMPA", "PEF-1"]) {
    assert.equal(readsAsMark(k), true, k);
  }
  for (const k of ["FLASH", "DAIKIN", "A", "AP", "OUTSIDE AIR CFM - DESIGN", "VOLT- PHASE", "MODEL NUMBER", "12X8", "460/3", "", "HUM-A"]) {
    assert.equal(readsAsMark(k), false, k);
  }
});

test("a family schedule's rows no compiled row carries are named, with the rows that carry a mark (05_MO)", () => {
  const graph = { tables: [table("s.pdf#40", "SINGLE DUCT AIR TERMINAL UNIT SCHEDULE", ["ATU-6-1", "1-TU-28-1", "1-TU-28-2", "MODEL"])] };
  const compiled = { categories: { VAV: { items: [item("ATU-6-1", "s.pdf#40", 100)] } } };
  assert.deepEqual(scheduleRowsLeftOut(compiled, graph), [
    { sheet: "s.pdf#40", title: "SINGLE DUCT AIR TERMINAL UNIT SCHEDULE", families: ["VAV"], rows: 3, marks: ["1-TU-28-1", "1-TU-28-2"] },
  ]);
  // Every row a unit: nothing to name.
  const all = { categories: { VAV: { items: [item("ATU-6-1", "s.pdf#40", 100), item("1-TU-28-1", "s.pdf#40", 110), item("1-TU-28-2", "s.pdf#40", 120)] } } };
  assert.deepEqual(scheduleRowsLeftOut(all, graph), []);
});

test("a row is a unit's when a compiled row sits in it or carries its mark, however its key is spelled", () => {
  // 03_FL: the graph keys the row "EATUA", the compile reads "ATU A" off its
  // MARK cell: the compiled mark's box is in the row.
  const inRow = { tables: [table("f.pdf#64", "AIR TERMINAL UNIT SCHEDULE (AHU 2)", ["EATUA", "EATUB"])] };
  assert.deepEqual(scheduleRowsLeftOut({ categories: { VAV: { items: [item("ATU A", "f.pdf#64", 100), item("ATU B", "f.pdf#64", 110)] } } }, inRow), []);
  // A row the compile read by another cell than the graph's key (a MARK
  // column beside a type code): the compiled mark's place decides, whatever
  // the key reads.
  const byCell = { tables: [table("g.pdf#7", "AIR TERMINAL UNIT SCHEDULE", ["TU-7R"])] };
  assert.deepEqual(scheduleRowsLeftOut({ categories: { VAV: { items: [item("ATU-7", "g.pdf#7", 100)] } } }, byCell), []);
  assert.deepEqual(scheduleRowsLeftOut({ categories: { VAV: { items: [item("ATU-7", "g.pdf#7", 300)] } } }, byCell).map((e) => e.marks), [["TU-7R"]],
    "one sitting in another row is not this row's");
  // 069_ID: the row reads AHU-1E, the compile AHU-1(E); no box needed.
  const spelled = { tables: [table("i.pdf#5", "EXISTING AIR HANDLING UNIT SCHEDULE", ["AHU-1E"])] };
  assert.deepEqual(scheduleRowsLeftOut({ categories: { AHU: { items: [item("AHU-1(E)", "i.pdf#5", null)] } } }, spelled), []);
  // The same unit printed in a second schedule (an index): its mark is carried.
  const index = { tables: [table("n.pdf#19", "AIR HANDLING UNIT SYSTEM INDEX SCHEDULE", ["AHU-4", "DOAS-1"])] };
  const compiled = { categories: { AHU: { items: [item("AHU-4", "n.pdf#20", 300)] } } };
  assert.deepEqual(scheduleRowsLeftOut(compiled, index).map((e) => e.marks), [["DOAS-1"]]);
  // A compiled row on another sheet at the same place is not this row's.
  const elsewhere = { categories: { VAV: { items: [item("VAV-9", "other.pdf#40", 100)] } } };
  assert.deepEqual(scheduleRowsLeftOut(elsewhere, { tables: [table("s.pdf#40", "VARIABLE AIR VOLUME BOX SCHEDULE", ["1-VAV-1"])] }).map((e) => e.marks), [["1-VAV-1"]]);
});

test("no rows are named from what is not a family's schedule of units", () => {
  const compiled = { categories: {} };
  // 02_UT: an abbreviations list read under the title AIR HANDLING UNIT.
  assert.deepEqual(scheduleRowsLeftOut(compiled, { tables: [table("a.pdf#3", "AIR HANDLING UNIT", ["AP", "APD", "ARCH"])] }), []);
  // 040_IL: a transposed schedule, its attribute names read as row keys.
  assert.deepEqual(scheduleRowsLeftOut(compiled, { tables: [table("t.pdf#47", "AIR HANDLING UNIT SCHEDULE", ["OUTSIDE AIR CFM - DESIGN", "VOLT- PHASE", "MODEL NUMBER"])] }), []);
  // A title that names no family the takeoff reads (014_MT's coordination list).
  assert.deepEqual(scheduleRowsLeftOut(compiled, { tables: [table("c.pdf#5", "M.E.P. COORDINATION SCHEDULE", ["AHU-A1", "HWP-A1"])] }), []);
  // A points list, whatever family its title names.
  assert.deepEqual(scheduleRowsLeftOut(compiled, { tables: [table("p.pdf#50", "AIR HANDLING UNIT POINTS LIST", ["AI-1", "BO-2"])] }), []);
  // No title.
  assert.deepEqual(scheduleRowsLeftOut(compiled, { tables: [table("u.pdf#2", "", ["AHU-1"])] }), []);
});

test("a title names the families the compile reads it as, never one its exclusions rule out", () => {
  const left = scheduleRowsLeftOut({ categories: {} }, { tables: [table("f.pdf#9", "FAN COIL UNIT SCHEDULE", ["FC-A-2"])] });
  assert.equal(left.length, 1);
  assert.ok(left[0].families.includes("FCU"), "a fan coil schedule is FCU's");
  assert.ok(!left[0].families.includes("AHU") && !left[0].families.includes("FAN"), "and neither AHU's nor FAN's");
});

test("only the families the library prices are kept, and the apply path returns them (a family priced by none adds no record)", () => {
  const priced = pricedFamilies(LIB);
  assert.ok(priced.has("VAV") && priced.has("AHU") && priced.has("FAN"));
  assert.ok(!priced.has("ANY"), "a part for any family prices none");
  assert.ok(!priced.has("FILTER"));
  const left = [
    { sheet: "s.pdf#39", title: "AIR FILTER SCHEDULE", families: ["FILTER"], rows: 3, marks: ["1-PF-15"] },
    { sheet: "s.pdf#40", title: "DUAL DUCT AIR TERMINAL UNIT SCHEDULE", families: ["VAV"], rows: 2, marks: ["1-VAV-1", "1-VAV-2"] },
    { sheet: "s.pdf#12", title: "SPLIT SYSTEM HEAT PUMP SCHEDULE", families: ["FILTER", "HEAT_PUMP"], rows: 1, marks: ["SS-1"] },
  ];
  assert.deepEqual(rowsLeftOutPriced(left, priced), [left[1], { ...left[2], families: ["HEAT_PUMP"] }]);
  assert.deepEqual(rowsLeftOutPriced(undefined, priced), []);
  const applied = applyAssemblies({ project: { items: [], rows_left_out: left }, library: LIB, normalized: [] });
  assert.deepEqual(applied.rows_left_out, [left[1], { ...left[2], families: ["HEAT_PUMP"] }]);
  assert.deepEqual(applyAssemblies({ project: { items: [] }, library: LIB, normalized: [] }).rows_left_out, [], "none when the project has none");
});
