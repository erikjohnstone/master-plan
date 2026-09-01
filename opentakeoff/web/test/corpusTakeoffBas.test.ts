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

  it("promotes printed ALARM / TREND / hardwired-vs-soft columns (WP8); never invents them", () => {
    const graph = {
      sheets: [{ key: "set.pdf#8", number: 8 }],
      tables: [
        {
          sheet: "set.pdf#8",
          title: { text: "POINTS LIST AHU-2", bbox: [0, 0, 10, 10] },
          rows: [
            {
              key: "AI10",
              cells: {
                DESCRIPTION: { text: "SA TEMP ALARM SENSOR" },
                ALARM: { text: "HI/LO" },
                TREND: { text: "15 MIN" },
                WIRING: { text: "HARDWIRED" },
              },
            },
            {
              key: "AO01",
              cells: {
                DESCRIPTION: { text: "CHW VALVE" },
                "SIGNAL TYPE": { text: "BACnet" },
                ALARM: { text: "No" },
                TREND: { text: "-" },
              },
            },
            {
              key: "BI03",
              cells: { DESCRIPTION: { text: "SF STATUS" } },
            },
          ],
        },
      ],
    };
    const bas = compileBasTakeoff(null, graph);
    assert.equal(bas.totals.rows, 3);
    assert.equal(bas.totals.alarm, 1);
    assert.equal(bas.totals.trend, 1);
    assert.equal(bas.totals.hardwired, 1);
    assert.equal(bas.totals.soft, 1);
    const ai10 = bas.categories.points_lists.lists[0].items.find((i) => i.tag === "AI10");
    assert.equal(ai10.alarm, "HI/LO");
    assert.equal(ai10.trend, "15 MIN");
    assert.equal(ai10.wiring, "hardwired");
    assert.equal(ai10.served_equipment, "AHU-2");
    const ao01 = bas.categories.points_lists.lists[0].items.find((i) => i.tag === "AO01");
    assert.equal(ao01.wiring, "soft");
    assert.equal(ao01.alarm, null);
    assert.equal(ao01.trend, null);
    assert.equal(ao01.served_equipment, "AHU-2");
    const bi03 = bas.categories.points_lists.lists[0].items.find((i) => i.tag === "BI03");
    assert.equal(bi03.wiring, null);
    assert.ok(bas.exclusions.some((e) => /sequence-of-operations/i.test(e)));
  });

  it("joins served_equipment from UNIT column, I/O device keys, and list title (Pillar C)", () => {
    const graph = {
      sheets: [{ key: "set.pdf#9", number: 9 }],
      tables: [
        {
          sheet: "set.pdf#9",
          title: { text: "POINTS LIST DOAH-TI", bbox: [0, 0, 10, 10] },
          rows: [
            {
              key: "AI01",
              cells: {
                DESCRIPTION: { text: "OA TEMP" },
                UNIT: { text: "DOAH-TI" },
              },
            },
            {
              key: "AI02",
              cells: { DESCRIPTION: { text: "SA TEMP" } },
            },
          ],
        },
        {
          sheet: "set.pdf#9",
          title: { text: "I/O LIST WHITE STURGEON PLC", bbox: [0, 0, 10, 10] },
          rows: [
            { key: "TAG", cells: {} },
            { key: "HWP-1", cells: { ANALOG: { text: "2" }, DIGITAL: { text: "1" } } },
          ],
        },
      ],
    };
    const bas = compileBasTakeoff(null, graph);
    const doah = bas.categories.points_lists.lists.find((l) => /DOAH/i.test(l.title));
    assert.equal(doah.items.find((i) => i.tag === "AI01").served_equipment, "DOAH-TI");
    assert.equal(doah.items.find((i) => i.tag === "AI02").served_equipment, "DOAH-TI");
    const io = bas.categories.points_lists.lists.find((l) => /I\/O LIST/i.test(l.title));
    assert.equal(io.items.find((i) => i.tag === "HWP-1").served_equipment, "HWP-1");
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
