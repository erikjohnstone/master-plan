/**
 * L5 header-geometry classification (shared UI+MCP path) — untitled valve/BAS grids.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compileBasTakeoff,
  compileControlValveTakeoff,
  headerShapeMatches,
  isBasPointsListTable,
  isControlValveHeaderShape,
  tableHeaderBlob,
} from "../src/lib/corpusTakeoff.mjs";

const UNTITLED_VALVE_TABLE = {
  sheet: "set.pdf#5",
  kind: "equipment",
  title: { text: "" },
  headers: ["TAG", "MANUFACTURER", "MODEL", "SERVED", "GPM", "SIZE"],
  rows: [
    {
      key: "CV-7",
      cells: {
        TAG: { text: "CV-7" },
        SERVED: { text: "BOILER-1" },
        GPM: { text: "120" },
        SIZE: { text: '2"' },
      },
    },
    {
      key: "CV-11/CV-12",
      cells: {
        TAG: { text: "CV-11/CV-12" },
        SERVED: { text: "BOILER-2" },
        GPM: { text: "85" },
      },
    },
  ],
};

const UNTITLED_BAS_TABLE = {
  sheet: "set.pdf#8",
  kind: "equipment",
  title: { text: "" },
  headers: ["TAG", "DESCRIPTION", "AI", "AO", "BI", "BO"],
  rows: [
    { key: "AI-1", cells: { TAG: { text: "AI-1" }, DESCRIPTION: { text: "SUPPLY TEMP" } } },
    { key: "BO-3", cells: { TAG: { text: "BO-3" }, DESCRIPTION: { text: "START" } } },
  ],
};

describe("tableHeaderBlob + headerShapeMatches", () => {
  it("concatenates table.headers for geometry inference", () => {
    const blob = tableHeaderBlob(UNTITLED_VALVE_TABLE);
    assert.match(blob, /TAG/);
    assert.match(blob, /GPM/);
    assert.match(blob, /SERVED/);
  });

  it("detects valve vs BAS header shapes", () => {
    assert.equal(isControlValveHeaderShape(UNTITLED_VALVE_TABLE), true);
    assert.equal(isBasPointsListTable(UNTITLED_VALVE_TABLE), false);
    assert.equal(isBasPointsListTable(UNTITLED_BAS_TABLE), true);
    assert.equal(isControlValveHeaderShape(UNTITLED_BAS_TABLE), false);
  });
});

describe("untitled valve grid compile (013-shaped)", () => {
  it("extracts CV-* control valves from blank-title header-inferred grid", () => {
    const graph = { sheets: [{ key: "set.pdf#5" }], tables: [UNTITLED_VALVE_TABLE] };
    const valve = compileControlValveTakeoff(null, graph);
    assert.ok(valve.totals.items >= 2, "CV-7 and CV-11/CV-12 split");
    assert.ok(valve.categories.CHW_CONTROL_VALVE?.count >= 2);
    const tags = (valve.categories.CHW_CONTROL_VALVE?.items || []).map((i) => i.tag);
    assert.ok(tags.some((t) => /^CV-7$/i.test(t)));
    assert.ok(tags.some((t) => /^CV-11$/i.test(t)));
    assert.ok(tags.some((t) => /^CV-12$/i.test(t)));
  });
});

describe("untitled BAS grid compile", () => {
  it("accepts header-inferred POINTS/I/O grids without a title caption", () => {
    const graph = { sheets: [{ key: "set.pdf#8" }], tables: [UNTITLED_BAS_TABLE] };
    const bas = compileBasTakeoff(null, graph);
    assert.equal(bas.totals.rows, 2);
    const lists = bas.categories.points_lists.lists;
    assert.equal(lists.length, 1);
    assert.match(lists[0].title, /header-inferred/i);
  });
});
