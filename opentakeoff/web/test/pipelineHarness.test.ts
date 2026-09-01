/**
 * Pipeline GT harness unit tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  graphBasTableStats,
  graphValveTableStats,
  pipelineHarnessSnapshot,
} from "../src/lib/pipelineHarness.mjs";

const VALVE_TABLE = {
  sheet: "set.pdf#5",
  kind: "equipment",
  title: { text: "" },
  headers: ["TAG", "GPM", "SIZE", "SERVED"],
  rows: [
    { key: "CV-7", cells: { TAG: { text: "CV-7" } } },
    { key: "CV-11", cells: { TAG: { text: "CV-11" } } },
  ],
};

const BAS_TABLE = {
  sheet: "set.pdf#8",
  kind: "equipment",
  title: { text: "" },
  headers: ["TAG", "AI", "AO", "DESCRIPTION"],
  rows: [{ key: "AI-1", cells: { TAG: { text: "AI-1" } } }],
};

describe("pipelineHarness graph stats", () => {
  it("counts valve-shaped tables and marks", () => {
    const g = { tables: [VALVE_TABLE] };
    const stats = graphValveTableStats(g);
    assert.equal(stats.tables, 1);
    assert.equal(stats.valve_marks, 2);
  });

  it("counts BAS I/O grids", () => {
    const g = { tables: [BAS_TABLE] };
    const stats = graphBasTableStats(g);
    assert.equal(stats.tables, 1);
    assert.equal(stats.rows, 1);
  });

  it("flags graph-without-compile gaps", () => {
    const snap = pipelineHarnessSnapshot(
      { tables: [VALVE_TABLE], notes: [] },
      { totals: { items: 0 }, categories: {} },
      { totals: { rows: 0 } },
    );
    assert.equal(snap.valve_graph_without_compile, true);
    assert.equal(snap.graph_valve.rows, 2);
  });
});
