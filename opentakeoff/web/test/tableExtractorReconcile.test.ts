/**
 * L4 cross-source dedup — tableExtractorReconcile.ts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dedupCrossSourceTables } from "../src/lib/tableExtractorReconcile.ts";
import type { ScheduleTable, SheetGraph } from "../src/lib/sheetgraph.ts";

function makeGraph(tables: ScheduleTable[]): SheetGraph {
  return { tables, sheets: [], rooms: [], unmatched_tags: [], callouts: [], buildings: [], revisions: [], sequence_narratives: [], notes: [], control_schematics: [] } as unknown as SheetGraph;
}

describe("dedupCrossSourceTables", () => {
  it("carries a losing candidate's own recovered title onto the surviving, more-complete candidate (B-17, 063_MT#9 MEP COORDINATION SCHEDULE)", () => {
    // Real, corpus-found shape: vectorgrid emits two overlapping candidates
    // for one physical table. The shorter one's own bounds start right at
    // the title row, so its title-recovery correctly finds the real title;
    // the taller one's bounds start lower (missing the title row) but reach
    // every real data row beneath it. Before this fix, the completeness
    // score picked the taller (title-less) candidate and the title was
    // gone -- never merged back in.
    const titled: ScheduleTable = {
      kind: "equipment",
      sheet: "s1",
      title: { sheet: "s1", text: "MEP COORDINATION SCHEDULE - EXTRUDER LAB", bbox: [2676, 2009, 3921, 2061] },
      headers: ["MARK", "DESCRIPTION"],
      rows: [{ key: "DU-1", sheet: "s1", cells: { MARK: { text: "DU-1", bbox: [0, 0, 1, 1] } } }],
      region: [2218, 2014, 4378, 2189],
    };
    const untitled: ScheduleTable = {
      kind: "equipment",
      sheet: "s1",
      title: null,
      headers: ["MARK", "DESCRIPTION", "LOAD", "VOLT-PHASE", "TYPE", "DIV", "NOTES"],
      rows: [
        { key: "DU-1", sheet: "s1", cells: { MARK: { text: "DU-1", bbox: [0, 0, 1, 1] }, DESCRIPTION: { text: "DEHUMIDIFICATION UNIT", bbox: [0, 0, 1, 1] } } },
        { key: "FU-1", sheet: "s1", cells: { MARK: { text: "FU-1", bbox: [0, 0, 1, 1] }, DESCRIPTION: { text: "FILTRATION UNIT", bbox: [0, 0, 1, 1] } } },
      ],
      // Same physical table's own region, differently bounded (both derived
      // from a real vectorgrid row-boundary ambiguity, per B-17's own trace)
      // -- overlapping heavily enough (IoU >= the default 0.72 bar) to be
      // treated as competing readings of ONE table, not two.
      region: [2218, 2050, 4378, 2189],
    };
    const g = makeGraph([titled, untitled]);
    const dropped = dedupCrossSourceTables(g);
    assert.equal(dropped, 1);
    assert.equal(g.tables.length, 1);
    // The more-complete candidate survives (its own real row/header data)...
    assert.equal(g.tables[0].rows.length, 2);
    assert.equal(g.tables[0].headers.length, 7);
    // ...but now carries the title the losing candidate had already
    // correctly recovered, instead of surfacing as title: null.
    assert.equal(g.tables[0].title?.text, "MEP COORDINATION SCHEDULE - EXTRUDER LAB");
  });

  it("never overwrites a winner's own real title with a loser's", () => {
    const a: ScheduleTable = {
      kind: "equipment",
      sheet: "s1",
      title: { sheet: "s1", text: "REAL TITLE A", bbox: [0, 0, 1, 1] },
      headers: ["MARK", "DESCRIPTION", "TYPE"],
      rows: [
        { key: "X-1", sheet: "s1", cells: { MARK: { text: "X-1", bbox: [0, 0, 1, 1] } } },
        { key: "X-2", sheet: "s1", cells: { MARK: { text: "X-2", bbox: [0, 0, 1, 1] } } },
      ],
      region: [0, 0, 100, 100],
    };
    const b: ScheduleTable = {
      kind: "equipment",
      sheet: "s1",
      title: { sheet: "s1", text: "WRONG COMPETING TITLE B", bbox: [0, 0, 1, 1] },
      headers: ["MARK"],
      rows: [{ key: "X-1", sheet: "s1", cells: { MARK: { text: "X-1", bbox: [0, 0, 1, 1] } } }],
      region: [0, 0, 90, 90],
    };
    const g = makeGraph([a, b]);
    dedupCrossSourceTables(g);
    assert.equal(g.tables.length, 1);
    assert.equal(g.tables[0].title?.text, "REAL TITLE A");
  });

  it("does not merge titles across candidates that don't overlap enough to be the same table", () => {
    const a: ScheduleTable = {
      kind: "equipment", sheet: "s1", title: { sheet: "s1", text: "TABLE A", bbox: [0, 0, 1, 1] },
      headers: ["MARK"], rows: [{ key: "A-1", sheet: "s1", cells: { MARK: { text: "A-1", bbox: [0, 0, 1, 1] } } }],
      region: [0, 0, 100, 100],
    };
    const b: ScheduleTable = {
      kind: "equipment", sheet: "s1", title: null,
      headers: ["MARK", "DESCRIPTION"], rows: [{ key: "B-1", sheet: "s1", cells: { MARK: { text: "B-1", bbox: [0, 0, 1, 1] } } }],
      region: [500, 500, 600, 600],
    };
    const g = makeGraph([a, b]);
    const dropped = dedupCrossSourceTables(g);
    assert.equal(dropped, 0);
    assert.equal(g.tables.length, 2);
    assert.equal(g.tables.find((t) => t.region[0] === 500)?.title, null);
  });
});
