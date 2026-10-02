// AS-65 — transposed schedules: units across the columns, attributes down the
// rows (src/lib/corpusTakeoff.mjs scheduleTableView). Shapes from the corpus:
// 21_VA's DESIGNATION schedules (a fan column listing several marks, pumps
// joined by AND, an indoor/outdoor pair, a chiller's model run into its
// header, an air handler's sections drawn down merged cells), 071_ME's
// rooftop units (UNIT NO., sections on their first row, RTU-1 (ALT#2) beside
// RTU-G) and ductless split (a label printed twice), 040_IL's SYMBOL corner.
// And what stays as extracted: units by row, a panel schedule, a table whose
// later headers are no marks, a cross-reference of marks, a points list.
import test from "node:test";
import assert from "node:assert/strict";
import { compileBasTakeoff, compileHvacTakeoff, HVAC_FAMILY_SPECS, scheduleTableView } from "../src/lib/corpusTakeoff.mjs";
import { familyNeedleFromSpecs, reconcileScheduleFamilyFromGraph, scheduleMarksRead, scheduleRowsReadingMark, unscheduledTagsAndAliasCandidates } from "../src/lib/schedulePlanReconcile.mjs";
import { scheduleRowsLeftOut } from "../src/lib/assemblies/leftOut.ts";

type Cell = { text: string; bbox: number[] };
type Attr = { label: string; values: (string | null)[]; key?: string; section?: string; span?: number };
const H = 30;
const cell = (text: string, x0: number, y0: number, x1: number, y1: number): Cell => ({ text, bbox: [x0, y0, x1, y1] });

/** A transposed schedule as the sheet graph extracts one: a section column
 * (x 0-100) when `sectionHeader` is given, the label column (x 100-300), one
 * column per unit header from x 300, 100 wide, and one row per attribute at
 * line 100 + 30 i. A section sits on its first row, `span` rows tall; a
 * section equal to its row's label is one cell across both columns. The row
 * key is what the extractor keyed it by: the label, the section, or a value
 * (071_ME's "24%"). */
function transposed(sheet: string, title: string, sectionHeader: string | null, labelHeader: string, units: string[], attrs: Attr[]) {
  return {
    kind: "reference", sheet, title: { text: title },
    headers: [...(sectionHeader ? [sectionHeader] : []), labelHeader, ...units],
    rows: attrs.map((a, i) => {
      const y = 100 + H * i;
      const cells: Record<string, Cell> = {};
      const across = a.section === a.label;
      if (sectionHeader && a.section) cells[sectionHeader] = across ? cell(a.section, 0, y, 300, y + H) : cell(a.section, 0, y, 100, y + H * (a.span ?? 1));
      cells[labelHeader] = across ? cell(a.label, 0, y, 300, y + H) : cell(a.label, 100, y, 300, y + H);
      a.values.forEach((v, j) => { if (v) cells[units[j]] = cell(v, 300 + 100 * j, y, 400 + 100 * j, y + H); });
      return { key: a.key ?? a.section ?? a.label, cells };
    }),
  };
}

/** The same units printed one per row, as an ordinary schedule prints them. */
function byRow(sheet: string, title: string, units: Array<[mark: string, attrs: Record<string, string>]>) {
  const labels = [...new Set(units.flatMap(([, a]) => Object.keys(a)))];
  return {
    kind: "equipment", sheet, title: { text: title }, headers: ["MARK", ...labels],
    rows: units.map(([mark, a], i) => {
      const y = 100 + H * i;
      const cells: Record<string, Cell> = { MARK: cell(mark, 0, y, 100, y + H) };
      labels.forEach((l, j) => { if (a[l]) cells[l] = cell(a[l], 100 + 100 * j, y, 200 + 100 * j, y + H); });
      return { key: mark, cells };
    }),
  };
}

type Item = { tag: string; sheet_id: string; description: string | null; cells: Record<string, { text: string }>; bbox_px: number[] | null; row_bbox_px: number[] | null };
const compiled = (tables: object[]) => compileHvacTakeoff(null, { tables }).categories as Record<string, { items: Item[] }>;
const tagsOf = (cats: Record<string, { items: Item[] }>, family: string) => (cats[family]?.items ?? []).map((i) => i.tag);
/** An item as the estimate reads it: its mark, its description and its
 * attributes by label (the boxes differ with the layout). */
const reading = (i: Item) => ({ tag: i.tag, description: i.description, cells: Object.fromEntries(Object.entries(i.cells).map(([h, c]) => [h, c.text])) });

const fans = () => transposed("v.pdf#51", "FAN SCHEDULE", null, "DESIGNATION", ["EF-1", "EF-2, EF-5", "EF-3"], [
  { label: "AREA SERVED", values: ["TOILET EXHAUST", "SINGLE TOILET EXHAUST", "EVIDENCE STORAGE"] },
  { label: "MANUFACTURER", values: ["COOK", "COOK", "COOK"] },
  { label: "CAPACITY - CFM", values: ["650", "75", "630"] },
  { label: "MOTOR HORSEPOWER", values: ["1/4", "1/10", null] },
]);

const rtus = () => transposed("m.pdf#44", "PACKAGED ROOF TOP UNIT SCHEDULE", "GENERAL", "UNIT NO.", ["RTU-G", "RTU-1 (ALT#2)", "RTU-2"], [
  { label: "SERVICE", values: ["GROUND LEVEL", "FIRST FLOOR", "SECOND FLOOR"] },
  { label: "TYPE", values: ["PACKAGED UNIT HEAT PUMP", "PACKAGED UNIT HEAT PUMP", "PACKAGED UNIT HEAT PUMP"] },
  { label: "VOLTAGE", section: "ELECTRICAL", values: ["208/230-3-60", "208/230-3-60", "208/230-3-60"] },
  { label: "UNIT MCA / MFS", values: ["146.5 / 150", "211 / 225", "235.5 / 250"] },
  { label: "SUPPLY AIRFLOW, CFM", section: "SUPPLY FAN", values: ["4,235", "7,000", "9,400"] },
  { label: "% OA", key: "24%", values: ["24%", "25%", "22%"] },
  { label: "TYPE", values: ["ECM, DIRECT DRIVE", "ECM, DIRECT DRIVE", "ECM, DIRECT DRIVE"] },
  { label: "EXHAUST AIRFLOW, CFM", section: "EXHAUST FAN", values: ["4,235", "(2)@3000", "(2)@3000"] },
  { label: "VOLTAGE", values: ["208-1-60", "208-1-60", "208-1-60"] },
  { label: "FILTERS", section: "FILTERS", values: ["MERV8", "MERV8", "MERV13"] },
  { label: "WEIGHT", values: ["1,180", "2,834", "3,039"] },
]);

test("a transposed schedule is read one row per unit, each attribute named by its printed label (21_VA's FAN SCHEDULE)", () => {
  const t = fans();
  const v = scheduleTableView(t);
  assert.notEqual(v, t);
  assert.equal(scheduleTableView(t), v, "one view per table, for every reader");
  assert.deepEqual(v.rows.map((r: any) => r.key), ["EF-1", "EF-2", "EF-5", "EF-3"], "a column listing two units is both");
  assert.deepEqual(v.headers, ["MARK", "AREA SERVED", "MANUFACTURER", "CAPACITY - CFM", "MOTOR HORSEPOWER"]);
  assert.deepEqual(v.transposed, { label_header: "DESIGNATION", unit_headers: ["EF-1", "EF-2, EF-5", "EF-3"], sections: "none", unread_labels: [] });
  const [ef1, ef2, ef5, ef3] = v.rows;
  assert.deepEqual(ef1.cells.MARK, { text: "EF-1", bbox: [300, 100, 400, 220] }, "the unit's mark cites its column");
  assert.deepEqual(ef1.identity, ef1.cells.MARK);
  assert.equal(ef2.cells["CAPACITY - CFM"].text, "75");
  assert.deepEqual({ ...ef5.cells, MARK: null }, { ...ef2.cells, MARK: null }, "the units of one column share its values");
  assert.equal(ef3.cells["MOTOR HORSEPOWER"], undefined, "a blank value is no attribute");
  // 21_VA's EF-1: one of its cells extracted far right of its column.
  const off = fans();
  off.rows[3].cells["EF-1"].bbox = [900, 190, 1000, 220];
  const moved = scheduleTableView(off).rows[0];
  assert.deepEqual(moved.cells.MARK.bbox, [300, 100, 400, 190], "the column's box, not the stray cell's");
  assert.equal(moved.cells["MOTOR HORSEPOWER"].text, "1/4", "the cell is still the unit's");
  // The table as extracted is left as it was.
  assert.equal(t.rows[0].key, "AREA SERVED");
  assert.deepEqual(t.headers, ["DESIGNATION", "EF-1", "EF-2, EF-5", "EF-3"]);
});

test("the compile reads a transposed schedule as it reads the same units printed one per row, and no attribute as a unit", () => {
  const same = byRow("v.pdf#51", "FAN SCHEDULE", [
    ["EF-1", { "AREA SERVED": "TOILET EXHAUST", MANUFACTURER: "COOK", "CAPACITY - CFM": "650", "MOTOR HORSEPOWER": "1/4" }],
    ["EF-2", { "AREA SERVED": "SINGLE TOILET EXHAUST", MANUFACTURER: "COOK", "CAPACITY - CFM": "75", "MOTOR HORSEPOWER": "1/10" }],
    ["EF-5", { "AREA SERVED": "SINGLE TOILET EXHAUST", MANUFACTURER: "COOK", "CAPACITY - CFM": "75", "MOTOR HORSEPOWER": "1/10" }],
    ["EF-3", { "AREA SERVED": "EVIDENCE STORAGE", MANUFACTURER: "COOK", "CAPACITY - CFM": "630" }],
  ]);
  assert.equal(scheduleTableView(same), same, "units printed by row are read as extracted");
  const across = compiled([fans()]), down = compiled([same]);
  assert.deepEqual(across.FAN.items.map(reading), down.FAN.items.map(reading));
  const all = Object.values(across).flatMap((c) => c.items.map((i) => i.tag));
  assert.deepEqual(all.sort(), ["EF-1", "EF-2", "EF-3", "EF-5"], "AREA SERVED, MANUFACTURER and the rest are no units");
  const ef1 = across.FAN.items.find((i) => i.tag === "EF-1")!;
  assert.deepEqual(ef1.bbox_px, [300, 100, 400, 220]);
  assert.deepEqual(ef1.row_bbox_px, [300, 100, 400, 220], "a cite paints the unit's column");
});

test("sections printed on their first row name the attributes under them (071_ME's rooftop units)", () => {
  const v = scheduleTableView(rtus());
  assert.deepEqual(v.rows.map((r: any) => r.key), ["RTU-G", "RTU-1", "RTU-2"], "RTU-1 (ALT#2) is RTU-1; RTU-G is a unit beside them");
  assert.equal(v.transposed.sections, "first_row");
  assert.deepEqual(v.transposed.unread_labels, []);
  const rtu1 = Object.fromEntries(Object.entries(v.rows[1].cells).map(([h, c]: [string, any]) => [h, c.text]));
  assert.deepEqual(rtu1, {
    MARK: "RTU-1",
    SERVICE: "FIRST FLOOR",
    TYPE: "PACKAGED UNIT HEAT PUMP",
    "ELECTRICAL VOLTAGE": "208/230-3-60",
    "ELECTRICAL UNIT MCA / MFS": "211 / 225",
    "SUPPLY FAN SUPPLY AIRFLOW, CFM": "7,000",
    "SUPPLY FAN % OA": "25%",
    "SUPPLY FAN TYPE": "ECM, DIRECT DRIVE",
    "EXHAUST FAN EXHAUST AIRFLOW, CFM": "(2)@3000",
    "EXHAUST FAN VOLTAGE": "208-1-60",
    FILTERS: "MERV8",
    WEIGHT: "2,834",
  });
  const all = Object.values(compiled([rtus()])).flatMap((c) => c.items.map((i) => i.tag));
  assert.deepEqual(all.sort(), ["RTU-1", "RTU-2", "RTU-G"], "no rooftop unit named 24%, ELECTRICAL or SUPPLY FAN");
  // A section on its first row names that row, and the rows after it until
  // the next section or a label printed across the section column.
  assert.equal(v.headers.includes("EXHAUST FAN WEIGHT"), false);
});

test("a section drawn down a merged cell names no row, so only the rows whose label spans the section column are read (21_VA's air handlers)", () => {
  const t = transposed("v.pdf#50", "AIR HANDLING UNIT SCHEDULE", "DESIGNATION", "DESIGNATION 2", ["AHU-1", "AHU-2"], [
    { label: "AREA SERVED", section: "AREA SERVED", values: ['"A" AND "D"', '"B" AND "C"'] },
    { label: "MANUFACTURER", section: "MANUFACTURER", values: ["TRANE", "TRANE"] },
    { label: "TOTAL LOAD - MBH", values: ["583.6", "282.0"] },
    { label: "WATER FLOW - GPM", section: "COOLING COIL", span: 3, values: ["83.1", "40.2"] },
    { label: "FAN CAPACITY - CFM", values: ["14745", "7055"] },
    { label: "OPERATING WEIGHT - LBS", section: "OPERATING WEIGHT - LBS", values: ["5200", "3100"] },
  ]);
  const v = scheduleTableView(t);
  assert.deepEqual(v.rows.map((r: any) => r.key), ["AHU-1", "AHU-2"]);
  assert.equal(v.transposed.sections, "merged");
  assert.deepEqual(v.headers, ["MARK", "AREA SERVED", "MANUFACTURER", "OPERATING WEIGHT - LBS"]);
  assert.deepEqual(v.transposed.unread_labels, ["TOTAL LOAD - MBH", "WATER FLOW - GPM", "FAN CAPACITY - CFM"], "missed, and said so, rather than read under a guessed section");
  assert.deepEqual(tagsOf(compiled([t]), "AHU"), ["AHU-1", "AHU-2"]);
});

test("a column naming several units is each of them: a list, an AND pair, a range; an indoor/outdoor pair is read as a row printing it is", () => {
  const attrs = (n: number): Attr[] => [{ label: "MANUFACTURER", values: Array(n).fill("ACME") }, { label: "CAPACITY", values: Array(n).fill("10") }];
  const keys = (t: object) => scheduleTableView(t).rows.map((r: any) => r.key);
  const pumps = transposed("v.pdf#51", "PUMP SCHEDULE", null, "DESIGNATION", ["CHWP-1 AND CHWP-2", "HWP-1 & HWP-2"], attrs(2));
  const heaters = transposed("v.pdf#52", "UNIT HEATER SCHEDULE", null, "UNIT NO.", ["UH-1 THRU UH-3", "CUH-1"], attrs(2));
  const chillers = transposed("v.pdf#51", "AIR COOLED CHILLER SCHEDULE", null, "DESIGNATION", ["CH-1 AND CH-2 TRANE CGAM 40"], attrs(1));
  // The rows above the first attribute merged into the header, ratings and all.
  const rated = transposed("v.pdf#53", "UNIT HEATER SCHEDULE", null, "DESIGNATION AREA SERVED MANUFACTURER FAN DRIVE", ["UH-4 THRU UH-5 MECH RM TRANE S-72 1/20 115/1 DIRECT"], attrs(1));
  const split = transposed("v.pdf#51", "DUCTLESS SPLIT SYSTEM UNIT SCHEDULE", null, "DESIGNATION - INDOOR UNIT / OUTDOOR UNIT", ["ACU-1 / ACCU-3"], attrs(1));
  const ahu = transposed("i.pdf#47", "AIR HANDLING UNIT SCHEDULE", null, "SYMBOL", ["AHU-15"], attrs(1));
  assert.deepEqual(keys(pumps), ["CHWP-1", "CHWP-2", "HWP-1", "HWP-2"]);
  assert.deepEqual(keys(heaters), ["UH-1", "UH-2", "UH-3", "CUH-1"]);
  assert.deepEqual(keys(chillers), ["CH-1", "CH-2"], "the words after a mark are no unit");
  assert.deepEqual(keys(rated), ["UH-4", "UH-5"], "nor is a rating's slash a pair");
  assert.deepEqual(keys(split), ["ACU-1 / ACCU-3"]);
  assert.deepEqual(keys(ahu), ["AHU-15"]);
  const cats = compiled([pumps, heaters, chillers, ahu, rated]);
  assert.deepEqual(tagsOf(cats, "PUMP"), ["CHWP-1", "CHWP-2", "HWP-1", "HWP-2"]);
  assert.deepEqual(tagsOf(cats, "UNIT_HEATER").sort(), ["CUH-1", "UH-1", "UH-2", "UH-3", "UH-4", "UH-5"]);
  assert.deepEqual(tagsOf(cats, "AIR_COOLED_CHILLER"), ["CH-1", "CH-2"]);
  assert.deepEqual(tagsOf(cats, "AHU"), ["AHU-15"]);
  // The pair reads across as it reads down.
  const down = byRow("v.pdf#51", "DUCTLESS SPLIT SYSTEM UNIT SCHEDULE", [["ACU-1 / ACCU-3", { MANUFACTURER: "ACME", CAPACITY: "10" }]]);
  const across = compiled([split]), printed = compiled([down]);
  for (const family of Object.keys(HVAC_FAMILY_SPECS)) {
    assert.deepEqual((across[family]?.items ?? []).map(reading), (printed[family]?.items ?? []).map(reading), family);
  }
});

test("a label printed twice, or naming an identity, is read for no unit (071_ME's indoor and outdoor MCA)", () => {
  const t = transposed("m.pdf#44", "DUCTLESS SPLIT SCHEDULE", null, "UNIT", ["AC-1"], [
    { label: "SERVES", values: ["IT 125"] },
    { label: "INDOOR UNIT:", values: ["WALL MOUNT"] },
    { label: "MCA", values: ["1"] },
    { label: "OUTDOOR COND. UNIT:", values: ["CU-1"] },
    { label: "MCA", values: ["17"] },
    { label: "MOCP", values: ["26"] },
    { label: "MARK", values: ["AC-9"] },
    { label: "UNIT MARK", values: ["AC-9"] },
  ]);
  const v = scheduleTableView(t);
  assert.deepEqual(v.headers, ["MARK", "SERVES", "INDOOR UNIT:", "OUTDOOR COND. UNIT:", "MOCP"]);
  assert.deepEqual(v.transposed.unread_labels, ["MCA", "MARK", "UNIT MARK"]);
  const items = compiled([t]).FCU.items;
  assert.deepEqual(items.map((i) => i.tag), ["AC-1"], "the unit's own mark, never a row's");
  assert.equal(items[0].cells.MCA, undefined);
});

test("a heading printed across the unit columns ends the rows read, its section's end not drawn (040_IL's SUPPLY FAN); a blank attribute does not", () => {
  const t = transposed("i.pdf#47", "AIR HANDLING UNIT SCHEDULE", null, "SYMBOL", ["AHU-15"], [
    { label: "SERVICE", values: ["NEW SPS"] },
    { label: "HEAT RECOVERY", values: [null] },
    { label: "MANUFACTURER", values: ["VENTROL"] },
    { label: "SUPPLY FAN", values: [null] },
    { label: "CFM", values: ["26,000"] },
    { label: "TYPE", values: ["PLENUM"] },
    { label: "OUTSIDE AIR CFM - DESIGN", values: ["26,000"] },
  ]);
  t.rows[3].cells.SYMBOL.bbox = [100, 190, 400, 220];
  const v = scheduleTableView(t);
  assert.deepEqual(v.headers, ["MARK", "SERVICE", "HEAT RECOVERY", "MANUFACTURER"]);
  assert.deepEqual(v.transposed.unread_labels, ["SUPPLY FAN", "CFM", "TYPE", "OUTSIDE AIR CFM - DESIGN"]);
  assert.deepEqual(Object.keys(v.rows[0].cells), ["MARK", "SERVICE", "MANUFACTURER"], "the fan's TYPE is not the unit's");
});

test("what is not a transposed schedule of a family's units is read as extracted", () => {
  const attrs: Attr[] = [{ label: "SUPPLY FAN STATUS", values: ["BI", "BI"] }, { label: "DISCHARGE AIR TEMP", values: ["AI", "AI"] }];
  const same = [
    // Units by row under a DESIGNATION column.
    byRow("a.pdf#1", "FAN SCHEDULE", [["EF-1", { CFM: "650" }], ["EF-2", { CFM: "75" }]]),
    { kind: "equipment", sheet: "a.pdf#2", title: { text: "FAN SCHEDULE" }, headers: ["DESIGNATION", "CFM"], rows: [{ key: "EF-1", cells: { DESIGNATION: cell("EF-1", 0, 0, 1, 1), CFM: cell("650", 1, 0, 2, 1) } }] },
    // A title naming no family the takeoff reads.
    transposed("a.pdf#3", "LUMINAIRE SCHEDULE", null, "DESIGNATION", ["A-1", "A-2"], attrs),
    transposed("a.pdf#4", "PANEL: A2-SEC2 LOCATION: ELECTRICAL", null, "CKT NO.", ["CKT NO. 2", "CKT NO. 3"], attrs),
    // A later header that names no unit, and headers naming only lettered units.
    transposed("a.pdf#5", "AIR HANDLING UNIT SCHEDULE", null, "DESIGNATION", ["AHU-1", "REMARKS"], attrs),
    transposed("a.pdf#6", "PACKAGED ROOF TOP UNIT SCHEDULE", null, "UNIT", ["RTU-A", "RTU-B"], attrs),
    // A range read whole or not at all: too long, backwards, dashed, or
    // between two families' marks.
    transposed("a.pdf#11", "FAN SCHEDULE", null, "DESIGNATION", ["EF-1 THRU EF-300"], attrs),
    transposed("a.pdf#12", "UNIT HEATER SCHEDULE", null, "DESIGNATION", ["UH-3 THRU UH-1"], attrs),
    transposed("a.pdf#13", "FAN SCHEDULE", null, "DESIGNATION", ["EF-1 - EF-3"], attrs),
    transposed("a.pdf#14", "UNIT HEATER SCHEDULE", null, "DESIGNATION", ["UH-1 THRU CUH-3"], attrs),
    // A pair whose second half runs into words and ratings.
    transposed("a.pdf#10", "AIR HANDLING UNIT SCHEDULE", null, "DESIGNATION", ["AHU-1 / AHU-2 DAIKIN X/Y"], attrs),
    // Rows that are marks: a cross-reference, not attributes.
    transposed("a.pdf#7", "FAN SCHEDULE", null, "TAG", ["EF-1", "EF-2"], [{ label: "SF-1", values: ["X", ""] }, { label: "SF-2", values: ["", "X"] }, { label: "RF-1", values: ["X", "X"] }]),
    // A points list, however it is laid out.
    transposed("a.pdf#8", "AIR HANDLING UNIT POINTS LIST", null, "TAG", ["AHU-1", "AHU-2"], attrs),
    // No title.
    transposed("a.pdf#9", "", null, "DESIGNATION", ["EF-1", "EF-2"], attrs),
  ];
  for (const t of same) assert.equal(scheduleTableView(t), t, `${t.sheet} ${t.title.text}`);
  assert.equal(scheduleTableView(null), null);
});

test("the reconcile scaffold holds one row per unit the compile counts, the drawn marks of its units are scheduled, and the notice reads its units (AS-65)", () => {
  const pumps = transposed("v.pdf#51", "PUMP SCHEDULE", null, "DESIGNATION", ["CHWP-1 AND CHWP-2", "HWP-1"], [{ label: "PUMP LOCATION", values: ["MECH ROOM", "MECH ROOM"] }]);
  const graph = {
    tables: [fans(), rtus(), pumps],
    tags: ["EF-5", "RTU-1", "CHWP-2", "EF-99"].map((text) => ({
      sheet: "v.pdf#3", role: "plan", text, key: text.replace(/[^A-Z0-9]/g, ""), family: "X",
      bbox: [0, 0, 1, 1], rot: 0, source: "exact", multiplier: 1, in_table: null, sheet_callout: false,
    })),
  };
  const cats = compiled(graph.tables);
  for (const [family, want] of [["FAN", ["EF-1", "EF-2", "EF-5", "EF-3"]], ["RTU", ["RTU-G", "RTU-1", "RTU-2"]], ["PUMP", ["CHWP-1", "CHWP-2", "HWP-1"]]] as const) {
    const rows = reconcileScheduleFamilyFromGraph(graph, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family)!);
    assert.deepEqual(rows.map((r: any) => r.tag), want, family);
    assert.deepEqual(tagsOf(cats, family).sort(), [...want].sort(), `${family}: the compile counts the same units`);
  }
  const { unscheduled_tags } = unscheduledTagsAndAliasCandidates(graph);
  assert.deepEqual(unscheduled_tags.map((t: any) => t.text), ["EF-99"]);
  assert.deepEqual(scheduleRowsLeftOut({ categories: cats }, graph), [], "every unit is read and no attribute is a row");
  // Read by no family, the units are named, never the attribute names.
  assert.deepEqual(scheduleRowsLeftOut({ categories: {} }, { tables: [fans()] }), [
    { sheet: "v.pdf#51", title: "FAN SCHEDULE", families: ["FAN"], rows: 4, marks: ["EF-1", "EF-2", "EF-5", "EF-3"] },
  ]);
});

test("a points list's served unit printed only across a transposed schedule is found on it (the plan-paint hint)", () => {
  // ZQ-7 is no fan mark the takeoff reads, so the hint comes from the scan of
  // the schedules, which reads the transposed schedule's units as its rows.
  const graph = {
    sheets: [{ key: "v.pdf#51", number: 51 }, { key: "v.pdf#60", number: 60 }],
    tables: [
      transposed("v.pdf#51", "FAN SCHEDULE", null, "DESIGNATION", ["EF-1", "ZQ-7"], [{ label: "MANUFACTURER", values: ["COOK", "COOK"] }]),
      { sheet: "v.pdf#60", title: { text: "I/O LIST WHITE STURGEON PLC", bbox: [0, 20, 10, 30] }, rows: [{ key: "ZQ-7", cells: { COL1: { text: "ZQ-7" } } }] },
    ],
  };
  const target = compileBasTakeoff(null, graph).estimator_product.plan_paint.targets.find((t: any) => t.tag === "ZQ-7");
  assert.ok(target, "served_equipment ZQ-7 target emitted");
  assert.equal(target.prefer_schedule_title, "FAN SCHEDULE");
  assert.equal(target.prefer_schedule_sheet, "v.pdf#51");
});

test("a transposed schedule under a decorated or hyphenated title is read one unit a column, as under its title printed plain (21_VA's AIR HANDLING UNIT SCHEDULE; AS-83)", () => {
  const ahus = (title: string) => transposed("v.pdf#50", title, null, "DESIGNATION", ["AHU-1", "AHU-2"], [
    { label: "AREA SERVED", values: ["GYMNASIUM", "OFFICES"] },
    { label: "SUPPLY AIR CFM", values: ["8,000", "4,500"] },
    { label: "MANUFACTURER", values: ["TRANE", "TRANE"] },
  ]);
  const plain = compiled([ahus("AIR HANDLING UNIT SCHEDULE")]);
  assert.deepEqual(tagsOf(plain, "AHU"), ["AHU-1", "AHU-2"]);
  for (const title of ["AIR-HANDLING UNIT SCHEDULE", "(N) AIR HANDLING UNIT SCHEDULE - 2 OF 2", "MECHANICAL AIR HANDLING UNIT SCHEDULES (CONT.)"]) {
    const t = ahus(title);
    assert.notEqual(scheduleTableView(t), t, `${title}: read on its side`);
    const c = compiled([t]);
    assert.deepEqual(c.AHU.items.map(reading), plain.AHU.items.map(reading), title);
    assert.deepEqual(Object.values(c).flatMap((f) => f.items.map((i) => i.tag)).sort(), ["AHU-1", "AHU-2"], `${title}: no attribute is a unit`);
    const rows = reconcileScheduleFamilyFromGraph({ tables: [t] }, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "AHU")!) as Array<{ tag: string }>;
    assert.deepEqual(rows.map((r) => r.tag), ["AHU-1", "AHU-2"], `${title}: the reconcile's rows`);
    assert.deepEqual(scheduleRowsLeftOut({ categories: {} }, { tables: [t] })[0]?.marks, ["AHU-1", "AHU-2"], `${title}: the notice's rows`);
  }
  // A family whose title rule is the whole title (EXHAUST FANS) reads it
  // decorated too.
  const fansN = transposed("v.pdf#51", "(N) EXHAUST FANS", null, "DESIGNATION", ["EF-1", "EF-3"], [
    { label: "AREA SERVED", values: ["TOILET EXHAUST", "EVIDENCE STORAGE"] },
    { label: "CAPACITY - CFM", values: ["650", "630"] },
  ]);
  assert.deepEqual(tagsOf(compiled([fansN]), "FAN"), ["EF-1", "EF-3"]);
  // A points list stays as extracted however it is titled.
  const list = transposed("v.pdf#52", "(N) AIR HANDLING UNIT POINTS LIST", null, "DESIGNATION", ["AHU-1", "AHU-2"], [{ label: "SUPPLY FAN STATUS", values: ["DI", "DI"] }]);
  assert.equal(scheduleTableView(list), list);
});

test("the plan sweep finds a transposed schedule's unit on its view's row, one per unit, citing the unit's column (AS-89)", () => {
  // 21_VA's schedules: no extracted row is a unit (each is an attribute), so
  // no key or printed identity answers for EF-5; the view the reconcile reads
  // has its row.
  const graph = { tables: [fans()] };
  const view = scheduleTableView(graph.tables[0]);
  assert.ok(graph.tables[0].rows.every((row) => !/^EF/.test(row.key)));
  const hits = scheduleRowsReadingMark(graph, "EF-5");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].table, view);
  assert.equal(hits[0].row.key, "EF-5");
  assert.deepEqual(hits[0].families, ["FAN"]);
  // The unit's column (EF-2, EF-5 is printed at x 400-500), its attributes by label.
  assert.deepEqual([hits[0].row.cells.MARK.bbox[0], hits[0].row.cells.MARK.bbox[2]], [400, 500]);
  assert.equal(hits[0].row.cells["CAPACITY - CFM"].text, "75");
  assert.deepEqual(scheduleMarksRead(graph, view, ["FAN"]), ["EF-1", "EF-2", "EF-5", "EF-3"]);
  assert.deepEqual(scheduleRowsReadingMark(graph, "AREA SERVED"), [], "an attribute is no unit");
});

test("air devices named by their type's letters alone are read one per column under a corner and worded rows (21_VA's AIR DISTRIBUTION DEVICE SCHEDULE)", () => {
  const units = ["CD", "RGL", "RG, TG", "EG", "SR1", "LD-1"];
  const devices = transposed("m.pdf#51", "AIR DISTRIBUTION DEVICE SCHEDULE", null, "DESIGNATION", units, [
    { label: "DEVICE", values: ["CEILING DIFFUSER", "RETURN GRILLE", "RETURN GRILLE TRANSFER GRILLE", "EXHAUST GRILLE", "SUPPLY REGISTER", "SUPPLY LINEAR DIFFUSER"] },
    { label: "TYPE", values: ["LAY-IN", "GRID CORE", "GRID CORE", "GRID CORE", "DOUBLE DEFLECTION", "SLOT"] },
    { label: "NECK", values: ["ROUND", "SQUARE", "SQUARE", "SQUARE", "RECTANGULAR", "ROUND TO PLENUM"] },
    { label: "MANUFACTURER", values: ["ANEMOSTAT", "ANEMOSTAT", "ANEMOSTAT", "ANEMOSTAT", "ANEMOSTAT", "ANEMOSTAT"] },
    { label: "MODEL NUMBER", values: ["EPL-D", "GC5L", "GC5", "GC5", "S2HO", "SLAD-PS-75"] },
    { label: "CONSTRUCTION", values: ["STEEL", "ALUMINUM", "ALUMINUM", "ALUMINUM", "STEEL", "ALUMINUM"] },
  ]);
  assert.deepEqual(tagsOf(compiled([devices]), "GRD").sort(), ["CD", "EG", "LD-1", "RG", "RGL", "SR1", "TG"]);
  // No attribute is a unit.
  assert.ok(!tagsOf(compiled([devices]), "GRD").some((t) => /DEVICE|NECK|CONSTRUCTION|MODEL/.test(t)));
  // A schedule read the usual way, its rows by letters and its columns named
  // in letters, stays as extracted.
  const usual = { kind: "equipment", sheet: "m.pdf#52", title: { text: "AIR DISTRIBUTION DEVICE SCHEDULE" },
    headers: ["MARK", "TYPE", "CFM", "MFR", "LD-1"],
    rows: ["CD", "RG", "EG"].map((m, i) => ({ key: m, cells: { MARK: cell(m, 0, 100 + H * i, 100, 130 + H * i), TYPE: cell("LAY-IN", 100, 100 + H * i, 200, 130 + H * i) } })) };
  assert.equal(scheduleTableView(usual), usual);
});
