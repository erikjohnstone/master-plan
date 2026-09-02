/**
 * P2 grid classification — builds on L5 header-geometry + BAS detectors.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyGrid, classifyAllGrids } from "../src/lib/gridClassify.mjs";
import { isControlValveHeaderShape } from "../src/lib/corpusTakeoff.mjs";

const UNTITLED_VALVE = {
  sheet: "set.pdf#5",
  kind: "equipment",
  title: { text: "" },
  headers: ["TAG", "MANUFACTURER", "MODEL", "SERVED", "GPM", "SIZE"],
  rows: [{ key: "CV-7", cells: { TAG: { text: "CV-7" }, GPM: { text: "120" } } }],
};

// Real shape found in this project's own live corpus run (024_MO_E2508_01,
// "PACKAGED EQUIPMENT SCHEDULE (RTU)"): shares the exact same generic
// TAG/MANUFACTURER/MODEL/SERVED/GPM/SIZE header shape as a real valve
// schedule, but its rows are RTU marks, not valve/damper marks.
const UNTITLED_RTU = {
  sheet: "set.pdf#6",
  kind: "equipment",
  title: { text: "" },
  headers: ["TAG", "MANUFACTURER", "MODEL", "SERVED", "GPM", "SIZE"],
  rows: [{ key: "RTU-1", cells: { TAG: { text: "RTU-1" }, GPM: { text: "0" } } }],
};

const BAS_GRID = {
  sheet: "set.pdf#8",
  kind: "equipment",
  title: { text: "AHU-1 POINTS LIST" },
  headers: ["TAG", "AI", "AO", "BI", "BO"],
  rows: [{ key: "SA-T", cells: { TAG: { text: "SA-T" }, AI: { text: "X" } } }],
};

describe("gridClassify", () => {
  it("delegates to isControlValveHeaderShape for untitled valve grids", () => {
    assert.equal(isControlValveHeaderShape(UNTITLED_VALVE), true);
    const g = classifyGrid(UNTITLED_VALVE);
    assert.equal(g.type, "VALVE_SCHEDULE");
    assert.ok(g.score >= 0.9);
  });

  it("does NOT classify a generic untitled equipment grid (RTU) as a valve schedule just because it shares TAG/MODEL/SIZE columns", () => {
    assert.equal(isControlValveHeaderShape(UNTITLED_RTU), false);
    const g = classifyGrid(UNTITLED_RTU);
    assert.notEqual(g.type, "VALVE_SCHEDULE");
  });

  it("classifies BAS points lists via existing isBasPointsListTitle", () => {
    const g = classifyGrid(BAS_GRID);
    assert.equal(g.type, "POINTS_LIST");
  });

  it("classifyAllGrids returns stable table indices", () => {
    const graph = { tables: [BAS_GRID, UNTITLED_VALVE] };
    const all = classifyAllGrids(graph);
    assert.equal(all.length, 2);
    assert.ok(all.some((x) => x.type === "VALVE_SCHEDULE"));
    assert.ok(all.some((x) => x.type === "POINTS_LIST"));
  });
});
