/**
 * AS-146: a schedule row printed taller than one line of the grid. A unit's
 * mark cell spans the sub-rows its coils or sound bands print on (014_MT
 * M0.2's AHU-A1: two lines, 48,400 and 75,000 CFM; 017_MD's ACU-A-1: casing,
 * discharge and inlet sound power). The fixtures are those sheets' own
 * vectorgrid replies with the page's text runs over each table.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { vectorGridTableToScheduleTable } from "../src/lib/vectorGridAdapter.ts";
import type { VectorGridTable } from "../src/lib/vectorGridClient.ts";
import type { GraphSpan } from "../src/lib/sheetgraph.ts";

interface Fixture {
  scale: number;
  page: { width: number; height: number };
  tables: { table: VectorGridTable; spans: GraphSpan[] }[];
}
const load = (name: string): Fixture => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const MT = load("as146-014mt-m02.vectorgrid.json");
const MD = load("as146-017md-m12.vectorgrid.json");
const [CUSTOM, COMFORT] = MT.tables;
const [ACU] = MD.tables;

function build(fix: Fixture, page: number, sheetKey: string, table: VectorGridTable, spans: GraphSpan[]) {
  let why = "";
  const built = vectorGridTableToScheduleTable(table, page, {
    sheetKey,
    pdfPath: "/nonexistent.pdf",
    spans,
    pageViewportTransform: [fix.scale, 0, 0, -fix.scale, 0, fix.page.height * fix.scale],
    width: fix.page.width * fix.scale,
    height: fix.page.height * fix.scale,
  }, fix.scale, (r) => { why = r; });
  return { built, why };
}
const mt = (t: { table: VectorGridTable; spans: GraphSpan[] }) =>
  build(MT, 2, "014_MT_USDA_Forest_Service_Missoula_Fire_Sciences.pdf#2", t.table, t.spans);
const md = (t: { table: VectorGridTable; spans: GraphSpan[] }) =>
  build(MD, 12, "017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling.pdf#12", t.table, t.spans);

const withCell = (t: VectorGridTable, text: string, patch: Partial<VectorGridTable["cells"][number]>): VectorGridTable => ({
  ...t,
  cells: t.cells.map((c) => (c.text === text ? { ...c, ...patch } : c)),
});

describe("AS-146: a unit's row printed on two lines is its row, not a header tier", () => {
  it("reads the custom air handler as one unit under clean column names", () => {
    const { built, why } = mt(CUSTOM);
    assert.ok(built, `refused: ${why}`);
    assert.equal(built.title?.text, "CUSTOM AIR HANDLING UNIT SCHEDULE");
    assert.deepEqual(built.rows.map((r) => r.key), ["AHU-A1"]);
    assert.ok(built.headers.includes("MARK"));
    assert.ok(built.headers.includes("MANUFACTURER"));
    assert.ok(!built.headers.some((h) => /AHU-A1|TEMTROL|23,931/.test(h)), `a value in a column name: ${built.headers.join(" | ")}`);
    assert.equal(built.rows[0].cells["MANUFACTURER"]?.text, "TEMTROL");
  });

  it("reads the comfort air handler, one grid row tall, as before", () => {
    const { built, why } = mt(COMFORT);
    assert.ok(built, `refused: ${why}`);
    assert.deepEqual(built.rows.map((r) => r.key), ["AHU-A2"]);
    assert.equal(built.rows[0].cells["MANUFACTURER"]?.text, "DAIKIN");
  });

  it("keeps a tier that groups columns a header tier, even under a mark", () => {
    // AHU-A1's row with two of its cells merged across columns: a row that
    // groups columns is a tier, whatever its first cell prints.
    const merged: VectorGridTable = {
      ...CUSTOM.table,
      cells: CUSTOM.table.cells
        .filter((c) => !(c.row === 4 && c.col === 2))
        .map((c) => (c.row === 4 && c.col === 1 ? { ...c, colSpan: 2 } : c)),
    };
    const { built } = mt({ table: merged, spans: CUSTOM.spans });
    assert.ok(!built?.rows.some((r) => r.cells["MANUFACTURER"]?.text === "TEMTROL"), "a column-grouping row read as the unit's");
  });

  it("keeps a header tier a header when its first cell is a label, not a mark", () => {
    const { built } = mt({ table: withCell(CUSTOM.table, "AHU-A1", { text: "UNIT" }), spans: CUSTOM.spans });
    assert.ok(!built?.rows.some((r) => r.key === "AHU-A1"), "a row read from a label tier");
    assert.ok(!built?.headers.includes("MANUFACTURER") || !built.rows.some((r) => r.cells["MANUFACTURER"]?.text === "TEMTROL"));
  });
});

describe("AS-146: the sub-rows under a unit's mark are that unit's, not more units", () => {
  it("reads each indoor air conditioning unit once, keyed by its mark", () => {
    const { built, why } = md(ACU);
    assert.ok(built, `refused: ${why}`);
    const units = built.rows.map((r) => r.key).filter((k) => /^ACU-/.test(k));
    assert.deepEqual(units, ["ACU-A-1", "ACU-A-2", "ACU-A-3", "ACU-A-4", "ACU-A-5", "ACU-A-6"]);
    assert.ok(!built.rows.some((r) => /^\d+(\s+\d+)*$/.test(r.key)), "a sound power reading read as a row's key");
    assert.equal(built.rows.find((r) => r.key === "ACU-A-1")?.cells["SUPPLY FAN"]?.text, "S-A-1");
  });

  it("keeps the rows under a tall label that is no unit's mark (21_VA's unit heater, printed on its side)", () => {
    const VA = load("as146-21va-m51.vectorgrid.json");
    const [UH] = VA.tables;
    const { built, why } = build(VA, 51, "21_VA_OrangeCounty_PublicSafetyBldg.pdf#51", UH.table, UH.spans);
    assert.ok(built, `refused: ${why}`);
    const water = built.rows.map((r) => r.key).filter((k) => /^HOT\s*WATER/.test(k));
    assert.deepEqual(water, [
      "HOTWATER FLOW - GPM", "HOTWATER WATER TEMPERATURE IN - DEG F",
      "HOTWATER WATER TEMPERATURE OUT - DEG F", "HOTWATER MAXIMUM PRESSURE DROP - FT H2O",
    ]);
  });

  it("keeps a line under a tall mark that prints a unit of its own (18_OR: one heat pump, two fan coils)", () => {
    const OR = load("as146-18or-m18.vectorgrid.json");
    const [FC] = OR.tables;
    const { built, why } = build(OR, 18, "18_OR_BakerMS_HVAC_Electrical_FullSet.pdf#18", FC.table, FC.spans);
    assert.ok(built, `refused: ${why}`);
    assert.deepEqual(built.rows.map((r) => r.cells["FAN COIL SYMBOL"]?.text), ["FC-1", "FC-2", "FC-3", "FC-4"]);
  });

  it("still keys the table by a column whose cells are no unit's mark when the marks are one line tall", () => {
    const flat = { ...ACU.table, cells: ACU.table.cells.map((c) => (c.rowSpan > 1 && /^ACU-/.test(c.text) ? { ...c, text: "UNIT" } : c)) };
    const { built } = md({ table: flat, spans: ACU.spans });
    assert.ok(!built?.rows.some((r) => /^ACU-/.test(r.key)));
  });
});
