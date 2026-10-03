// AS-144: a split system's schedule whose title names no family (26_CA's AIR
// CONDITIONING UNITS - AIR COOLED SYSTEMS) is read by its header shape: each
// indoor unit's mark under its half's heading (EVAPORATOR DESIGNATION) and its
// outdoor unit's beside it (CONDENSER DESIGNATION), as a split system title
// would have them read; a title that names any family keeps its own reading.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileHvacTakeoff, familyTableGate, HVAC_FAMILY_SPECS, isSplitPairHeaderShape } from "../src/lib/corpusTakeoff.mjs";
import { familyNeedleFromSpecs, reconcileScheduleFamilyFromGraph } from "../src/lib/schedulePlanReconcile.mjs";

type Cells = Record<string, string>;
const row = (cells: Cells) => ({
  key: Object.values(cells)[0].replace(/[^A-Z0-9-]/gi, ""),
  cells: Object.fromEntries(Object.entries(cells).map(([h, t]) => [h, { text: t }])),
});
const table = (title: string | null, rows: Cells[], sheet = "m.pdf#10") => ({
  kind: "equipment", sheet, title: title ? { text: title } : null, headers: Object.keys(rows[0]), rows: rows.map(row),
});
const tags = (graph: object, family: string) =>
  (((compileHvacTakeoff(null, graph) as any).categories?.[family]?.items ?? []) as Array<{ tag: string }>).map((i) => i.tag).sort();

// 26_CA's M0.10, three of its seven rows: AC-64-1's condenser is integrated (N/A).
const M010 = [
  { "EVAPORATOR DESIGNATION": "AC-P3-1", "EVAPORATOR LOCATION / SERVICE": "LEVEL P3 / FIRE PUMP ROOM", "CONDENSER DESIGNATION": "ACCU-P3-1", "CONDENSER LOCATION": "LEVEL P3" },
  { "EVAPORATOR DESIGNATION": "AC-1-1", "EVAPORATOR LOCATION / SERVICE": "LEVEL 1 / FCC", "CONDENSER DESIGNATION": "ACCU-P2-1", "CONDENSER LOCATION": "LEVEL P2" },
  { "EVAPORATOR DESIGNATION": "AC-64-1", "EVAPORATOR LOCATION / SERVICE": "LEVEL 64", "CONDENSER DESIGNATION": "N/A", "CONDENSER LOCATION": "INTEGRATED" },
];
const M010_TITLE = "AIR CONDITIONING UNITS - AIR COOLED SYSTEMS (SPECIFICATION SECTION 23 05 30)";

test("AS-144: a split system's header shape is its two halves' mark columns", () => {
  const shape = (headers: string[]) => isSplitPairHeaderShape({ headers });
  assert.equal(shape(["EVAPORATOR DESIGNATION", "EVAPORATOR CFM", "CONDENSER DESIGNATION"]), true);
  assert.equal(shape(["INDOOR UNIT MARK", "OUTDOOR UNIT MARK"]), true);
  assert.equal(shape(["INDOOR UNIT (WALL MOUNTED) EQUIPMENT TAG", "OUTDOOR UNIT EQUIPMENT TAG"]), true);
  assert.equal(shape(["OUTDOOR UNIT DATA PLAN CODE", "INDOOR UNIT DATA PLAN CODE"]), true);
  assert.equal(shape(["HEAT PUMP SYMBOL", "FAN COIL SYMBOL"]), true);
  // A chiller's evaporator and condenser are no units' marks; one half alone is no pair.
  assert.equal(shape(["DESIGNATION", "EVAPORATOR EWT (ºF)", "CONDENSER EWT (ºF)", "CONDENSER GPM"]), false);
  assert.equal(shape(["EVAPORATOR DESIGNATION", "EVAPORATOR LOCATION"]), false);
  assert.equal(shape(["CONDENSER DESIGNATION", "CONDENSER LOCATION"]), false);
  // Outdoor air is no outdoor unit; an evaporative cooler is no evaporator.
  assert.equal(shape(["OUTDOOR AIR TAG", "INDOOR UNIT MARK"]), false);
  assert.equal(shape(["EVAPORATIVE COOLER TAG", "CONDENSER DESIGNATION"]), false);
});

test("AS-144: 26_CA's air conditioning units read their evaporators as fan coils and their condensers as condensing units", () => {
  const graph = { tables: [table(M010_TITLE, M010)] };
  assert.deepEqual(tags(graph, "FCU"), ["AC-1-1", "AC-64-1", "AC-P3-1"]);
  assert.deepEqual(tags(graph, "CONDENSING_UNIT"), ["ACCU-P2-1", "ACCU-P3-1"]);
  assert.deepEqual(tags(graph, "HEAT_PUMP"), []);
  const cu = (compileHvacTakeoff(null, graph) as any).categories.CONDENSING_UNIT.items.find((i: { tag: string }) => i.tag === "ACCU-P2-1");
  assert.equal(cu.table_title, M010_TITLE, "the unit cites its own schedule");
  // The reconcile holds a row for each unit the takeoff counts, by the same gate.
  const rows = (family: string) => reconcileScheduleFamilyFromGraph(graph, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family))
    .map((r: { tag: string }) => r.tag).sort();
  assert.deepEqual(rows("FCU"), ["AC-1-1", "AC-64-1", "AC-P3-1"]);
  assert.deepEqual(rows("CONDENSING_UNIT"), ["ACCU-P2-1", "ACCU-P3-1"]);
});

test("AS-144: an outdoor heat pump beside its indoor fan coil", () => {
  const graph = { tables: [table("AIR CONDITIONING UNITS", [
    { "FAN COIL SYMBOL": "FC-1", "FAN COIL CFM": "400", "HEAT PUMP SYMBOL": "HP-1", "HEAT PUMP MCA": "15" },
    { "FAN COIL SYMBOL": "FC-2", "FAN COIL CFM": "300", "HEAT PUMP SYMBOL": "HP-2", "HEAT PUMP MCA": "12" },
  ])] };
  assert.deepEqual(tags(graph, "FCU"), ["FC-1", "FC-2"]);
  assert.deepEqual(tags(graph, "HEAT_PUMP"), ["HP-1", "HP-2"]);
  assert.deepEqual(tags(graph, "CONDENSING_UNIT"), []);
});

test("AS-144: the shape vouches where no title names a family or none it names reads the table, never for a general schedule, an untitled table or half a pair", () => {
  const pair = [{ "INDOOR UNIT MARK": "AC-1", "OUTDOOR UNIT MARK": "CU-1" }];
  const heatPumpPair = [{ "INDOOR UNIT MARK": "AC-1", "OUTDOOR UNIT MARK": "HP-1" }];
  const splitOk = (title: string | null, family: string, rows = pair) =>
    familyTableGate(table(title, rows), (HVAC_FAMILY_SPECS as any)[family], family)?.splitOk ?? false;
  for (const family of ["FCU", "CONDENSING_UNIT", "HEAT_PUMP"]) {
    assert.equal(splitOk("AIR CONDITIONING UNITS", family), true, family);
    // A title naming a family (its own title, another's, or a host's) keeps
    // the reading it gives where that family reads a row (the heat pump's
    // HP-1, a VRF system's indoor AC-1); so does a host title, which reads
    // its family's half by its own rule; so do a general schedule and an
    // untitled table.
    assert.equal(splitOk("HEAT PUMP SCHEDULE", family, heatPumpPair), false, family);
    assert.equal(splitOk("SPLIT SYSTEM AIR HANDLER SCHEDULE", family), false, family);
    assert.equal(splitOk("VRF SYSTEM SCHEDULE", family), false, family);
    assert.equal(splitOk("MECHANICAL EQUIPMENT SCHEDULE", family), false, family);
    assert.equal(splitOk(null, family), false, family);
  }
  // 030_NY's HEAT PUMP UNIT SCHEDULE: the heat pump family its title names
  // reads neither half (AC-1 indoors, CU-1 outdoors), so the shape reads each
  // half by its own family, as under a title that names none. The title's own
  // family is never read by the shape.
  assert.deepEqual(["FCU", "CONDENSING_UNIT", "HEAT_PUMP"].map((family) => splitOk("HEAT PUMP SCHEDULE", family)), [true, true, false]);
  const named = { tables: [table("HEAT PUMP SCHEDULE", pair)] };
  assert.deepEqual(tags(named, "FCU"), ["AC-1"]);
  assert.deepEqual(tags(named, "CONDENSING_UNIT"), ["CU-1"]);
  assert.deepEqual(tags(named, "HEAT_PUMP"), []);
  const read = { tables: [table("HEAT PUMP SCHEDULE", heatPumpPair)] };
  assert.deepEqual(tags(read, "HEAT_PUMP"), ["HP-1"]);
  assert.deepEqual(tags(read, "FCU"), []);
  // A split host title names the families it lists (its indoor FCU-*, its
  // outdoor HP-*); a condensing unit there is not read by the shape.
  const hosted = { tables: [table("SPLIT SYSTEM AIR HANDLER SCHEDULE", [{ "INDOOR UNIT MARK": "FCU-1", "OUTDOOR UNIT MARK": "CU-1" }])] };
  assert.deepEqual(tags(hosted, "FCU"), ["FCU-1"]);
  assert.deepEqual(tags(hosted, "CONDENSING_UNIT"), []);
  // A VRF system's indoor AC-* are VRF indoor units (its other title), never
  // fan coils too.
  const vrf = { tables: [table("VRF SYSTEM SCHEDULE", [{ "INDOOR UNIT MARK": "AC-1", "OUTDOOR UNIT MARK": "HP-1" }])] };
  assert.deepEqual(tags(vrf, "VRF_INDOOR"), ["AC-1"]);
  assert.deepEqual(tags(vrf, "FCU"), []);
  // Half a pair is no split system: an air conditioning unit with no outdoor
  // unit's column reads nothing by its shape.
  const half = { tables: [table("AIR CONDITIONING UNITS", [{ "EVAPORATOR DESIGNATION": "AC-1", "EVAPORATOR LOCATION": "ROOF" }])] };
  assert.deepEqual(tags(half, "FCU"), []);
});

test("AS-144: a unit its own family's schedule defines cites that schedule", () => {
  // The split table comes first; FCU-1's fan coil schedule is still its cite.
  const graph = { tables: [
    table("AIR CONDITIONING UNITS", [{ "INDOOR UNIT MARK": "FCU-1", "OUTDOOR UNIT MARK": "CU-1" }], "m.pdf#3"),
    table("FAN COIL UNIT SCHEDULE", [{ MARK: "FCU-1", CFM: "400" }], "m.pdf#4"),
  ] };
  const fcu = (compileHvacTakeoff(null, graph) as any).categories.FCU.items as Array<{ tag: string; sheet_id: string; table_title: string }>;
  assert.equal(fcu.length, 1);
  assert.equal(fcu[0].table_title, "FAN COIL UNIT SCHEDULE");
  assert.deepEqual(tags(graph, "CONDENSING_UNIT"), ["CU-1"]);
  // As a host title's, the shape's reading is a widened one: an untitled
  // table that prints the unit's mark by the family's own rule is its cite.
  const untitled = { tables: [
    table("AIR CONDITIONING UNITS", [{ "INDOOR UNIT MARK": "FCU-2", "OUTDOOR UNIT MARK": "CU-2" }], "m.pdf#3"),
    table(null, [{ MARK: "FCU-2", CFM: "300" }], "m.pdf#5"),
  ] };
  const fcu2 = (compileHvacTakeoff(null, untitled) as any).categories.FCU.items as Array<{ tag: string; sheet_id: string }>;
  assert.deepEqual(fcu2.map((i) => [i.tag, i.sheet_id]), [["FCU-2", "m.pdf#5"]]);
});
