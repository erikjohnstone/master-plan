// #260: the schedule list showed a title block's issue log titled with the
// discipline line above it ("ELECTRONIC SECURITY / TELECOMMUNICATIONS") and
// ruled plan linework titled by a detail callout ("341.1-2") or a duct size
// (38"x14"). Neither is a schedule; both are refused on the shared path.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRevisionLogTable, isUnnamedFragmentTable } from "../src/lib/sheetgraph.ts";
import { vectorGridTableToScheduleTable, type VectorGridContext } from "../src/lib/vectorGridAdapter.ts";
import type { VectorGridTable } from "../src/lib/vectorGridClient.ts";

describe("isRevisionLogTable", () => {
  it("reads an issue log by its column heads, whatever its title", () => {
    assert.equal(isRevisionLogTable("ELECTRONIC SECURITY / TELECOMMUNICATIONS", ["ISSUED FOR", "REV", "DATE"]), true);
    assert.equal(isRevisionLogTable("", ["REV", "DESCRIPTION", "DRN", "CHK", "APP", "DATE"]), true);
    assert.equal(isRevisionLogTable("VALDOSTA, GA", ["REV:", "DATE:", "REMARKS:"]), true);
    assert.equal(isRevisionLogTable("", ["REV. REV.", "DATE DATE", "DESCRIPTION DESCRIPTION"]), true);
  });
  it("a numbered log with no REV head needs its REVISIONS title", () => {
    assert.equal(isRevisionLogTable("Revisions", ["NO.", "DESCRIPTION", "DESCRIPTION 2", "DATE"]), true);
    assert.equal(isRevisionLogTable("ADDENDA", ["NO.", "DESCRIPTION", "DATE"]), false);
  });
  it("keeps a sheet index and any schedule with a head outside the log's words", () => {
    assert.equal(isRevisionLogTable("SHEET INDEX", ["SHEET NUMBER", "SHEET NAME", "SHEET ISSUE DATE"]), false);
    assert.equal(isRevisionLogTable("DRAWING LIST", ["SHEET NUMBER", "SHEET TITLE", "REVISION", "DATE", "DESCRIPTION"]), false);
    assert.equal(isRevisionLogTable("PUMP SCHEDULE", ["MARK", "GPM", "DATE"]), false);
    assert.equal(isRevisionLogTable("", ["REV", "DESCRIPTION"]), false, "no DATE head");
  });
});

describe("isUnnamedFragmentTable", () => {
  it("refuses a headless sliver titled by a callout, a size or a tag", () => {
    for (const t of ["341.1-2", '38"x14"', "EF-4", "DN", "CT-1 (E)", "3", ""]) {
      assert.equal(isUnnamedFragmentTable(t, ["COL1", "COL2", "COL3", "COL4"], 1), true, t);
    }
    assert.equal(isUnnamedFragmentTable('38"x14"', ["C306-3", "COL2", "COL3", "COL4"], 1), true);
  });
  it("keeps a sparse schedule that names itself, has heads, or has rows", () => {
    assert.equal(isUnnamedFragmentTable("LAG SCREW SCHEDULE", ["COL1", "COL2", "COL3"], 3), false);
    assert.equal(isUnnamedFragmentTable("EF-4", ["MARK", "CFM", "COL3"], 1), false);
    assert.equal(isUnnamedFragmentTable("3", ["COL1", "COL2"], 4), false);
  });
});

describe("the vectorgrid path refuses both (#260)", () => {
  const cell = (row: number, col: number, text: string, bbox: [number, number, number, number], rowSpan = 1, colSpan = 1) =>
    ({ row, col, rowSpan, colSpan, text, bbox });
  const ctx = (): VectorGridContext => ({ sheetKey: "doc.pdf#16", spans: [] } as unknown as VectorGridContext);
  const grid = (cells: ReturnType<typeof cell>[], rows: number, cols: number): VectorGridTable => ({
    bbox: [100, 200, 100 + 80 * cols, 200 + 20 * rows], rows, cols, raster: false,
    assigned: cells.length, orphan: 0, straddle: 0, cells,
  });

  it("an issue log under a discipline line", () => {
    const log = grid([
      cell(0, 0, "ELECTRONIC SECURITY / TELECOMMUNICATIONS", [100, 200, 340, 220], 1, 3),
      cell(1, 0, "ISSUED FOR", [100, 220, 180, 240]), cell(1, 1, "REV", [180, 220, 260, 240]), cell(1, 2, "DATE", [260, 220, 340, 240]),
      cell(2, 0, "CONTRACT DOCUMENTS", [100, 240, 180, 260]), cell(2, 1, "", [180, 240, 260, 260]), cell(2, 2, "01.04.2019", [260, 240, 340, 260]),
      cell(3, 0, "DESIGN DEVELOPMENT", [100, 260, 180, 280]), cell(3, 1, "", [180, 260, 260, 280]), cell(3, 2, "11.08.2018", [260, 260, 340, 280]),
    ], 4, 3);
    let why = "";
    assert.equal(vectorGridTableToScheduleTable(log, 16, ctx(), 1, (r) => { why = r; }), null);
    assert.match(why, /revision\/issue log/);
  });

  it("a real schedule beside it is still read", () => {
    const pumps = grid([
      cell(0, 0, "PUMP SCHEDULE", [100, 200, 340, 220], 1, 3),
      cell(1, 0, "MARK", [100, 220, 180, 240]), cell(1, 1, "GPM", [180, 220, 260, 240]), cell(1, 2, "HEAD (FT)", [260, 220, 340, 240]),
      cell(2, 0, "P-1", [100, 240, 180, 260]), cell(2, 1, "120", [180, 240, 260, 260]), cell(2, 2, "60", [260, 240, 340, 260]),
    ], 3, 3);
    const built = vectorGridTableToScheduleTable(pumps, 16, ctx(), 1);
    assert.ok(built);
    assert.deepEqual(built.rows.map((r) => r.key), ["P-1"]);
  });
});
