/**
 * T-BAS-01 title gate + I/O LIST row compile (shared UI+MCP path).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compileBasTakeoff,
  isBasPointsListTitle,
} from "../src/lib/corpusTakeoff.mjs";

describe("isBasPointsListTitle", () => {
  it("accepts POINTS / DDC / I/O list titles and rejects equipment schedules", () => {
    assert.equal(isBasPointsListTitle("POINTS LIST DOAH-TI"), true);
    assert.equal(isBasPointsListTitle("FCU WITH COOLING COILS DDC POINTS LIST"), true);
    assert.equal(isBasPointsListTitle("I/O LIST WHITE STURGEON PLC"), true);
    assert.equal(isBasPointsListTitle("IO LIST PANEL A"), true);
    assert.equal(isBasPointsListTitle("DDC CONTROLLER INPUT/OUTPUT SUMMARY"), true);
    assert.equal(isBasPointsListTitle("DDC CONTROLLER INPUT/OUTPUT LEGEND"), true);
    assert.equal(isBasPointsListTitle("CONTROLLER I/O SUMMARY"), true);
    assert.equal(isBasPointsListTitle("MISCELLANEOUS POINTS SCHEDULE"), true);
    assert.equal(isBasPointsListTitle("POINTS SCHEDULE"), true);
    // SOO narrative captions — not extractable typed points rows.
    assert.equal(isBasPointsListTitle("AHU-1 POINT LIST TABLE"), false);
    assert.equal(isBasPointsListTitle("FAN SCHEDULE"), false);
    assert.equal(isBasPointsListTitle("RADIO LIST"), false);
    assert.equal(isBasPointsListTitle(""), false);
  });
});

describe("compileBasTakeoff I/O LIST", () => {
  it("counts device I/O rows and skips the TAG header", () => {
    const graph = {
      sheets: [{ key: "set.pdf#1", number: 1 }],
      tables: [
        {
          sheet: "set.pdf#1",
          title: { text: "I/O LIST WHITE STURGEON PLC", bbox: [0, 0, 10, 10] },
          rows: [
            { key: "TAG", cells: { COL1: { text: "TAG" } } },
            { key: "HWP-1", cells: { ANALOG: { text: "1" }, DIGITAL: { text: "1" } } },
            { key: "HWP-2", cells: { ANALOG: { text: "1" }, DIGITAL: { text: "1" } } },
            { key: "TE-300", cells: { ANALOG: { text: "1" } } },
          ],
        },
      ],
    };
    const bas = compileBasTakeoff(null, graph);
    assert.equal(bas.totals.lists, 1);
    assert.equal(bas.totals.rows, 3);
    // ANALOG/DIGITAL quantity cells roll into AI/BI (no AI## MARK prefixes).
    assert.equal(bas.totals.AI, 3); // 1+1+1
    assert.equal(bas.totals.BI, 2); // 1+1
    assert.equal(bas.totals.AO, 0);
    assert.equal(bas.totals.BO, 0);
    assert.equal(bas.categories.points_lists.lists[0].title, "I/O LIST WHITE STURGEON PLC");
    assert.deepEqual(
      bas.categories.points_lists.lists[0].items.map((i: { tag: string }) => i.tag),
      ["HWP-1", "HWP-2", "TE-300"],
    );
  });

  it("does not double-count ANALOG cells on AI## MARK rows", () => {
    const graph = {
      sheets: [{ key: "set.pdf#4", number: 4 }],
      tables: [
        {
          sheet: "set.pdf#4",
          title: { text: "POINTS LIST AHU-1", bbox: [0, 0, 10, 10] },
          rows: [
            { key: "AI01", cells: { ANALOG: { text: "9" }, DESCRIPTION: { text: "SA TEMP" } } },
            { key: "BO02", cells: { DIGITAL: { text: "9" }, DESCRIPTION: { text: "SF START" } } },
          ],
        },
      ],
    };
    const bas = compileBasTakeoff(null, graph);
    assert.equal(bas.totals.rows, 2);
    assert.equal(bas.totals.AI, 1);
    assert.equal(bas.totals.BO, 1);
    assert.equal(bas.totals.BI, 0);
  });

  it("still counts AI## MARK prefixes on POINTS LIST titles", () => {
    const graph = {
      sheets: [{ key: "set.pdf#2", number: 2 }],
      tables: [
        {
          sheet: "set.pdf#2",
          title: { text: "POINTS LIST AHU-1", bbox: [0, 0, 10, 10] },
          rows: [
            { key: "AI01", cells: { DESCRIPTION: { text: "SA TEMP" } } },
            { key: "BO02", cells: { DESCRIPTION: { text: "SF START" } } },
          ],
        },
      ],
    };
    const bas = compileBasTakeoff(null, graph);
    assert.equal(bas.totals.rows, 2);
    assert.equal(bas.totals.AI, 1);
    assert.equal(bas.totals.BO, 1);
  });

  it("does not invent a list from a title-only schematic with no data rows", () => {
    const graph = {
      sheets: [{ key: "set.pdf#3", number: 3 }],
      tables: [
        {
          sheet: "set.pdf#3",
          title: { text: "POINTS LIST SCHEMATIC ONLY", bbox: [0, 0, 10, 10] },
          rows: [{ key: "TAG", cells: {} }],
        },
      ],
    };
    const bas = compileBasTakeoff(null, graph);
    assert.equal(bas.totals.lists, 0);
    assert.equal(bas.totals.rows, 0);
  });
});
