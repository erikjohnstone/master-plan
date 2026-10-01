// AS-145: under a split or ductless system's title, the indoor air
// conditioning unit (ACU-*) is a fan coil and the outdoor HP-* a heat pump, as
// the outdoor CU-* there is a condensing unit; a VRF system's terminal units
// (VRFC-*) are its indoor units.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileHvacTakeoff } from "../src/lib/corpusTakeoff.mjs";

type Cells = Record<string, string>;
const table = (title: string | null, rows: Cells[], key?: (c: Cells) => string) => ({
  kind: "equipment", sheet: "m.pdf#8", title: title ? { text: title } : null, headers: Object.keys(rows[0]),
  rows: rows.map((cells) => ({
    key: key ? key(cells) : Object.values(cells)[0].replace(/[^A-Z0-9-]/gi, ""),
    cells: Object.fromEntries(Object.entries(cells).map(([h, t]) => [h, { text: t }])),
  })),
});
const tags = (graph: object, family: string) =>
  (((compileHvacTakeoff(null, graph) as any).categories?.[family]?.items ?? []) as Array<{ tag: string }>).map((i) => i.tag).sort();

test("AS-145: 098_ID's ductless split pairs read each fan coil and its outdoor heat pump", () => {
  const graph = { tables: [table("DUCTLESS SPLIT HIGH WALL COOLING & HEATING UNIT SCHEDULE", [
    { SYMBOL: "FC-1 , HP-1", "AREA SERVED": "OFFICE", "NOMINAL TONS": "0.5" },
    { SYMBOL: "FC-2 , HP-2", "AREA SERVED": "CONFERENCE ROOM", "NOMINAL TONS": "1.5" },
  ])] };
  assert.deepEqual(tags(graph, "FCU"), ["FC-1", "FC-2"]);
  assert.deepEqual(tags(graph, "HEAT_PUMP"), ["HP-1", "HP-2"]);
  assert.deepEqual(tags(graph, "CONDENSING_UNIT"), []);
});

test("AS-145: an air conditioning unit is a split system's indoor half; its condensing unit the outdoor", () => {
  const graph = { tables: [table("DUCTLESS SPLIT SYSTEM UNIT SCHEDULE", [
    { "DESIGNATION - INDOOR UNIT / OUTDOOR UNIT": "ACU-1 / ACCU-3", "SERVICE AREA": "VEHICLE BAY - B134" },
  ])] };
  assert.deepEqual(tags(graph, "FCU"), ["ACU-1"]);
  assert.deepEqual(tags(graph, "CONDENSING_UNIT"), ["ACCU-3"]);
  // Under a mini split or a ductless multi-split title too, each half by its
  // own family: the fan coil, the heat pump or condensing unit outdoors.
  const mini = { tables: [table("MINI-SPLIT SCHEDULE", [{ MARK: "FC-1 / HP-1", CFM: "300" }, { MARK: "FC-2 / CU-2", CFM: "300" }])] };
  assert.deepEqual(tags(mini, "FCU"), ["FC-1", "FC-2"]);
  assert.deepEqual(tags(mini, "HEAT_PUMP"), ["HP-1"]);
  assert.deepEqual(tags(mini, "CONDENSING_UNIT"), ["CU-2"]);
  const multi = { tables: [table("DUCTLESS MULTI-SPLIT SYSTEM SCHEDULE", [{ MARK: "FC-3 / CU-3", CFM: "300" }])] };
  assert.deepEqual(tags(multi, "FCU"), ["FC-3"]);
  assert.deepEqual(tags(multi, "CONDENSING_UNIT"), ["CU-3"]);
});

test("AS-145: no heat pump or air conditioning unit is read where no split title vouches for it", () => {
  // A fan coil schedule's HP-* is no heat pump of its title's (its own title
  // reads only its family's marks), and an ACU is a fan coil only under the
  // family's own title.
  const coil = { tables: [table("FAN COIL UNIT SCHEDULE", [{ MARK: "FCU-1", CFM: "400" }, { MARK: "HP-9", CFM: "300" }])] };
  assert.deepEqual(tags(coil, "HEAT_PUMP"), []);
  const general = { tables: [table("AIR HANDLING UNIT SCHEDULE", [{ MARK: "ACU-7", CFM: "4000" }])] };
  assert.deepEqual(tags(general, "FCU"), []);
  const untitled = { tables: [table(null, [{ MARK: "ACU-8", CFM: "400" }, { MARK: "HP-8", CFM: "300" }])] };
  assert.deepEqual(tags(untitled, "FCU"), []);
  assert.deepEqual(tags(untitled, "HEAT_PUMP"), ["HP-8"], "an untitled table's HP-* is read by the heat pump's own rule, as before");
  // A split system's heat pump reads only HP-* marks there: its CU-* stay
  // the condensing unit's.
  const cu = { tables: [table("SPLIT SYSTEM AIR CONDITIONING UNIT SCHEDULE", [{ SYMBOL: "F-1 , CU-1", TONS: "2" }])] };
  assert.deepEqual(tags(cu, "HEAT_PUMP"), []);
  assert.deepEqual(tags(cu, "CONDENSING_UNIT"), ["CU-1"]);
  // Nor its indoor air handler, a heat pump's mark under the family's own title.
  const ah = { tables: [table("SPLIT SYSTEM AIR CONDITIONING UNIT SCHEDULE", [{ SYMBOL: "AH-1 / HP-1", TONS: "3" }])] };
  assert.deepEqual(tags(ah, "HEAT_PUMP"), ["HP-1"]);
});

test("AS-145: 22_GA's VRF terminal devices are VRF indoor units", () => {
  const graph = { tables: [
    table("VARIABLE REFRIGERANT FLOW TERMINAL DEVICE SCHEDULE", [
      { MARK: "VRFC-1", TYPE: "CASSETTE", "FAN CFM": "600" },
      { MARK: "VRFC-2", TYPE: "CASSETTE", "FAN CFM": "600" },
    ]),
    table("VRF TERMINAL UNIT SCHEDULE", [{ MARK: "IU-3", TYPE: "DUCTED" }]),
  ] };
  assert.deepEqual(tags(graph, "VRF_INDOOR"), ["IU-3", "VRFC-1", "VRFC-2"]);
  // A VRF mark under no VRF title is no VRF unit.
  const other = { tables: [table("FAN SCHEDULE", [{ MARK: "VRFC-9", CFM: "100" }])] };
  assert.deepEqual(tags(other, "VRF_INDOOR"), []);
});
