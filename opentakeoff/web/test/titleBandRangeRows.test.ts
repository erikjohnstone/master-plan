/**
 * AS-142: a schedule title that rules cut into cells, and a row that its named
 * key column schedules as a range. The fixture is 26_CA M0.09's own vectorgrid
 * reply for its HOT WATER BOILER, PLATE AND FRAME HEAT EXCHANGER and FAN COIL
 * schedules (the fan coil cut to its first five units), with the page's text
 * runs over each table, as the pipeline hands them to the table builder.
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
const FIX: Fixture = JSON.parse(readFileSync(new URL("./fixtures/as142-26ca-m009.vectorgrid.json", import.meta.url), "utf8"));
const [BOILER, HEX, FAN_COIL] = FIX.tables;

function build(table: VectorGridTable, spans: GraphSpan[]) {
  let why = "";
  const built = vectorGridTableToScheduleTable(table, 9, {
    sheetKey: "26_CA_TransbayTower_Mechanical_64Sheets.pdf#9",
    pdfPath: "/nonexistent.pdf",
    spans,
    pageViewportTransform: [FIX.scale, 0, 0, -FIX.scale, 0, FIX.page.height * FIX.scale],
    width: FIX.page.width * FIX.scale,
    height: FIX.page.height * FIX.scale,
  }, FIX.scale, (r) => { why = r; });
  return { built, why };
}

const withCell = (t: VectorGridTable, row: number, col: number, patch: Partial<VectorGridTable["cells"][number]>): VectorGridTable => ({
  ...t,
  cells: t.cells.map((c) => (c.row === row && c.col === col ? { ...c, ...patch } : c)),
});

describe("AS-142: a title the rules cut is still one line of type", () => {
  it("reads the heat exchanger schedule, whose title one printed run carries across the cut", () => {
    const { built, why } = build(HEX.table, HEX.spans);
    assert.ok(built, `refused: ${why}`);
    assert.equal(built.title?.text, "PLATE AND FRAME HEAT EXCHANGER (FLUID TO FLUID) (SPECIFICATION SECTION 23 57 19)");
    assert.deepEqual(built.rows.map((r) => r.key), ["HEX-2-1", "HEX-2-2", "HEX-34-1", "HEX-34-2", "HEX-35-1", "HEX-35-2"]);
    assert.ok(built.headers.includes("PRIMARY SIDE FLOW (GPM)"));
    assert.ok(built.headers.includes("SECONDARY SIDE EWT (°F)"));
    assert.equal(built.rows[0].cells["LOCATION/ SERVICE"]?.text, "L2 / HEATING WATER");
  });

  it("does not read the band as a title without the drawing's runs, or with runs that stop at the cut", () => {
    const none = build(HEX.table, []);
    assert.equal(none.built, null);
    assert.match(none.why, /no header block above the data/);
    const cutCell = HEX.table.cells.find((c) => c.row === 0 && c.text === "PLATE");
    assert.ok(cutCell, "the fixture's title band has its PLATE cell");
    const cut = cutCell.bbox[2] * FIX.scale;
    const spans = HEX.spans.flatMap((s) => (s.str.startsWith("PLATE AND FRAME")
      ? [{ ...s, str: "PLATE", w: cut - 4 - s.x }, { ...s, str: s.str.slice(6), x: cut + 4, w: s.x + s.w - cut - 4 }]
      : [s]));
    const stopped = build(HEX.table, spans);
    assert.equal(stopped.built, null, "two runs that meet at the cut are two cells' text");
    // A cell that spans down is a header tier's label, not a line of a title.
    const tall = build(withCell(HEX.table, cutCell.row, cutCell.col, { rowSpan: 2 }), HEX.spans);
    assert.notEqual(tall.built?.title?.text, "PLATE AND FRAME HEAT EXCHANGER (FLUID TO FLUID) (SPECIFICATION SECTION 23 57 19)");
  });

  it("reads a lone title cell that spans all but two columns beside blank cells (fan coil)", () => {
    const { built, why } = build(FAN_COIL.table, FAN_COIL.spans);
    assert.ok(built, `refused: ${why}`);
    assert.equal(built.title?.text, "FAN COIL (SPECIFICATION SECTION 23 82 19)");
    assert.equal(built.headers[2], "CFM");
    assert.ok(built.headers.every((h) => !h.startsWith("FAN COIL")), "no column's name carries the title");
    assert.deepEqual(built.rows.map((r) => r.key).slice(0, 3), ["BCU-P3-1", "BCU-P2-1", "FCU-P2-2"]);
  });

  it("does not read a label over half the columns, beside blank cells, as the title", () => {
    const title = FAN_COIL.table.cells.find((c) => c.row === 0 && c.text.startsWith("FAN COIL"));
    assert.ok(title);
    const split = title.bbox[0] + (title.bbox[2] - title.bbox[0]) / 2;
    const half: VectorGridTable = {
      ...FAN_COIL.table,
      cells: [
        ...withCell(FAN_COIL.table, 0, title.col, { colSpan: 14, bbox: [title.bbox[0], title.bbox[1], split, title.bbox[3]] }).cells,
        { row: 0, col: title.col + 14, rowSpan: 1, colSpan: title.colSpan - 14, text: "", bbox: [split, title.bbox[1], title.bbox[2], title.bbox[3]] },
      ],
    };
    const { built } = build(half, FAN_COIL.spans.filter((s) => !s.str.startsWith("FAN COIL")));
    assert.notEqual(built?.title?.text, "FAN COIL (SPECIFICATION SECTION 23 82 19)");
  });
});

describe("AS-142: the title rules give an equipment schedule its title, and nothing else", () => {
  // 23_GA's sheet 8 prints a concrete specification note as an 8x2 grid; its
  // first row's two cells are one printed sentence the rules cut. Taken for a
  // title, the grid would be read as a reference table of concrete practices;
  // as no equipment schedule, it is read as before: refused, untitled.
  const NOTE: Fixture = JSON.parse(readFileSync(new URL("./fixtures/as142-23ga-p8.vectorgrid.json", import.meta.url), "utf8"));
  it("reads a cut band over a table that is no equipment schedule as before", () => {
    const [{ table, spans }] = NOTE.tables;
    let why = "";
    const built = vectorGridTableToScheduleTable(table, 8, {
      sheetKey: "23_GA_Valdosta_FireStation8_100CD.pdf#8",
      pdfPath: "/nonexistent.pdf",
      spans,
      pageViewportTransform: [NOTE.scale, 0, 0, -NOTE.scale, 0, NOTE.page.height * NOTE.scale],
      width: NOTE.page.width * NOTE.scale,
      height: NOTE.page.height * NOTE.scale,
    }, NOTE.scale, (r) => { why = r; });
    assert.equal(built, null, "no table of concrete practices");
    assert.match(why, /unknown kind and no title/);
  });
});

describe("AS-142: a row its named key column schedules by range is a row", () => {
  it("reads the one-row boiler schedule naming four boilers", () => {
    const { built, why } = build(BOILER.table, BOILER.spans);
    assert.ok(built, `refused: ${why}`);
    assert.equal(built.title?.text, "HOT WATER BOILER (SPECIFICATION SECTION 23 52 16)");
    assert.deepEqual(built.rows.map((r) => r.key), ["B-2-1 THRU 4"]);
    assert.equal(built.rows[0].cells["DESIGNATION"]?.text, "B-2-1 THRU 4");
    assert.equal(built.rows[0].cells["INPUT (MBH)"]?.text, "3000");
  });

  it("needs a tag before the range, and a key column its header names", () => {
    const keyCell = BOILER.table.cells.find((c) => c.text === "B-2-1 THRU 4");
    assert.ok(keyCell);
    // Each of these the strict rule refuses too (it keys "SEE NOTE 4" and
    // "THRU 4" as tags, so they are no test of this rule).
    for (const text of ["LEVEL 2 THRU 4", "SEE PLANS THRU 4", "B-2-1 THRU", "B-2-1 & SPARE"]) {
      const { built, why } = build(withCell(BOILER.table, keyCell.row, keyCell.col, { text }), BOILER.spans);
      assert.equal(built, null, `${text} is no row's units`);
      assert.match(why, /no keyed data rows/);
    }
    const head = BOILER.table.cells.find((c) => c.text === "DESIGNATION");
    assert.ok(head);
    const unnamed = build(withCell(BOILER.table, head.row, head.col, { text: "UNIT" }), BOILER.spans);
    assert.equal(unnamed.built, null, "a column no header names proves nothing by one row");
  });
});

describe("AS-142: the takeoff reads M0.09's boilers, heat exchangers and fan coils from these tables", () => {
  it("counts four boilers from one range row, six heat exchangers, and the fan coil schedule's blower coils", async () => {
    const { compileHvacTakeoff } = await import("../src/lib/corpusTakeoff.mjs");
    const tables = [BOILER, HEX, FAN_COIL].map((f) => build(f.table, f.spans).built);
    assert.ok(tables.every(Boolean));
    const categories = (compileHvacTakeoff(null, { tables }) as unknown as { categories: Record<string, { items: Array<{ tag: string; table_title: string }> }> }).categories;
    const tags = (family: string) => (categories[family]?.items ?? []).map((i) => i.tag).sort();
    assert.deepEqual(tags("BOILER"), ["B-2-1", "B-2-2", "B-2-3", "B-2-4"]);
    assert.deepEqual(tags("HEAT_EXCHANGER"), ["HEX-2-1", "HEX-2-2", "HEX-34-1", "HEX-34-2", "HEX-35-1", "HEX-35-2"]);
    assert.deepEqual(tags("FCU").slice(0, 3), ["BCU-P1-1", "BCU-P2-1", "BCU-P3-1"]);
    assert.equal(categories.BOILER.items[0].table_title, "HOT WATER BOILER (SPECIFICATION SECTION 23 52 16)");
  });

  it("keeps M0.11's water filtration unit now that its table is titled WATER FILTRATION UNIT", async () => {
    const { compileHvacTakeoff } = await import("../src/lib/corpusTakeoff.mjs");
    const table = (title: string | null) => ({ kind: "equipment", sheet: "m.pdf#11", title: title ? { text: title } : null,
      headers: ["DESIGNATION", "LOCATION / SERVICE", "GPM"],
      rows: [{ key: "WFU-62-1", cells: { DESIGNATION: { text: "WFU-62-1" }, "LOCATION / SERVICE": { text: "LEVEL 62 / CONDENSER WATER" }, GPM: { text: "300" } } }] });
    const wfu = (t: ReturnType<typeof table>) =>
      ((compileHvacTakeoff(null, { tables: [t] }) as unknown as { categories: Record<string, { items: Array<{ tag: string }> }> }).categories.WFU?.items ?? []).map((i) => i.tag);
    assert.deepEqual(wfu(table(null)), ["WFU-62-1"]);
    assert.deepEqual(wfu(table("WATER FILTRATION UNIT")), ["WFU-62-1"]);
    assert.deepEqual(wfu(table("WATER FILTER SCHEDULE")), ["WFU-62-1"]);
  });
});
