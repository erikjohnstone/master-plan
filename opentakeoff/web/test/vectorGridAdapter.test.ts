/**
 * Vectorgrid adapter — the coordinate contract, pinned.
 *
 * The sidecar adapter's own test passes an IDENTITY transform, under which
 * inverting the viewport and then mapping forward through it is also the
 * identity — so its 2× coordinate bug is invisible to it. Every geometry
 * assertion here therefore uses a ROTATED, NON-IDENTITY transform at a scale
 * that is NOT the project's RENDER_SCALE, so neither "forgot to scale" nor
 * "hardcoded 2.0" can pass.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VectorGridSpaceError,
  vectorGridTableToOdl,
  vectorGridTableToScheduleTable,
  pageBoxAgrees,
  viewportScale,
  isFragmentAdjacent,
  stackFragments,
  dropNumberedNotes,
  widenLeadingProse,
  pictureMarkDigits,
  type VectorGridContext,
} from "../src/lib/vectorGridAdapter.ts";
import type { VectorGridTable } from "../src/lib/vectorGridClient.ts";
import type { GraphSpan } from "../src/lib/sheetgraph.ts";

// A /Rotate 90 viewport at scale 3 — the real shape pdf.js emits for a
// rotated page (009_FL#7 is [0,2,2,0,0,0]), with a scale nothing in the
// codebase uses as a constant.
const ROT90_SCALE3 = [0, 3, 3, 0, 0, 0];

const cell = (row: number, col: number, text: string,
              bbox: [number, number, number, number],
              rowSpan = 1, colSpan = 1) => ({ row, col, rowSpan, colSpan, text, bbox });

/** A titled pump schedule: row 0 is the title band spanning all 4 columns,
 * row 1 the header row, rows 2-3 data. Points, top-left origin. */
const PUMPS: VectorGridTable = {
  bbox: [100, 200, 340, 280],
  rows: 4,
  cols: 4,
  raster: false,
  assigned: 16, orphan: 0, straddle: 0,
  cells: [
    cell(0, 0, "PUMP SCHEDULE", [100, 200, 340, 220], 1, 4),
    cell(1, 0, "MARK", [100, 220, 160, 240]),
    cell(1, 1, "GPM", [160, 220, 220, 240]),
    cell(1, 2, "HEAD (FT)", [220, 220, 280, 240]),
    cell(1, 3, "HP", [280, 220, 340, 240]),
    cell(2, 0, "P-1", [100, 240, 160, 260]),
    cell(2, 1, "120", [160, 240, 220, 260]),
    cell(2, 2, "60", [220, 240, 280, 260]),
    cell(2, 3, "5", [280, 240, 340, 260]),
    cell(3, 0, "P-2", [100, 260, 160, 280]),
    cell(3, 1, "85", [160, 260, 220, 280]),
    cell(3, 2, "45", [220, 260, 280, 280]),
    cell(3, 3, "3", [280, 260, 340, 280]),
  ],
};

const ctx = (): VectorGridContext => ({
  sheetKey: "plan.pdf#3",
  pdfPath: "/nonexistent.pdf",
  spans: [] as GraphSpan[],
  pageViewportTransform: ROT90_SCALE3,
  width: 1800,   // 600pt x 3
  height: 2400,  // 800pt x 3
});

describe("vectorGridAdapter — coordinate contract", () => {
  it("reads the scale off the transform, both rotations", () => {
    assert.equal(viewportScale([2, 0, 0, -2, 3024, 2160]), 2);  // 009_FL#30, measured
    assert.equal(viewportScale([0, 2, 2, 0, 0, 0]), 2);         // 009_FL#7, measured
    assert.equal(viewportScale(ROT90_SCALE3), 3);
  });

  it("refuses a transform that is not a uniform scale+rotation", () => {
    // Anisotropic: no single scalar describes it, so guessing one would put
    // every box in the wrong place along one axis only — the hardest kind to
    // notice.
    assert.throws(() => viewportScale([2, 0, 0, 5, 0, 0]), VectorGridSpaceError);
  });

  it("puts every bbox in project px at the transform's own scale", () => {
    const built = vectorGridTableToScheduleTable(PUMPS, 3, ctx(), 3);
    assert.ok(built, "a 4x4 titled schedule must build");
    // The region is the measured vectorgrid box, scaled — not the raw points.
    assert.deepEqual(built.region, [300, 600, 1020, 840]);
    const p1 = built.rows.find((r) => r.key === "P-1");
    assert.ok(p1, "P-1 must be a row");
    assert.deepEqual(p1.cells["MARK"].bbox, [300, 720, 480, 780]);
    assert.deepEqual(p1.cells["GPM"].bbox, [480, 720, 660, 780]);
  });

  it("would fail if the points were passed through unscaled", () => {
    // The precise shape of the sidecar bug: region assigned in points.
    const built = vectorGridTableToScheduleTable(PUMPS, 3, ctx(), 3);
    assert.ok(built);
    assert.notDeepEqual(built.region, PUMPS.bbox);
    assert.ok(built.region[2] > PUMPS.bbox[2], "region must be scaled up, not raw points");
  });

  it("keeps every box inside the rendered page", () => {
    const c = ctx();
    const built = vectorGridTableToScheduleTable(PUMPS, 3, c, 3);
    assert.ok(built);
    const boxes = [built.region, ...built.rows.flatMap((r) => Object.values(r.cells).map((x) => x.bbox))];
    for (const b of boxes) {
      assert.ok(b[2] > b[0] && b[3] > b[1], `degenerate box ${b.join(",")}`);
      assert.ok(b[0] >= 0 && b[1] >= 0 && b[2] <= c.width && b[3] <= c.height,
        `box ${b.join(",")} outside the ${c.width}x${c.height} page`);
    }
  });
});

describe("vectorGridAdapter — structure", () => {
  it("reads the full-width first row as the table's own title", () => {
    const built = vectorGridTableToScheduleTable(PUMPS, 3, ctx(), 3);
    assert.ok(built);
    assert.equal(built.title?.text, "PUMP SCHEDULE");
    assert.deepEqual(built.headers, ["MARK", "GPM", "HEAD (FT)", "HP"]);
    assert.equal(built.rows.length, 2);
  });

  it("carries spans through to ODL so the title band keeps its colspan", () => {
    const odl = vectorGridTableToOdl(PUMPS, 3);
    assert.equal(odl["number of columns"], 4);
    assert.equal(odl.rows[0].cells.length, 1);
    assert.equal(odl.rows[0].cells[0]["column span"], 4);
  });

  it("refuses a raster region rather than presenting it as an empty grid", () => {
    const raster: VectorGridTable = {
      bbox: [10, 10, 200, 100], rows: 0, cols: 0, raster: true,
      cells: [], assigned: 0, orphan: 0, straddle: 0,
    };
    assert.equal(vectorGridTableToScheduleTable(raster, 3, ctx(), 3), null);
  });
});

describe("vectorGridAdapter — split-fragment recovery (B-42, 028_TX page 1)", () => {
  // Mirrors the real shape: a "NOISE CONTROL DUCT SILENCER SCHEDULE" split into
  // a FIRST FLOOR section (own divider + data) directly above a SECOND FLOOR
  // section (own divider + data), where vectorgrid's adjacent faces overlap
  // by a few points at the seam and both capture the boundary row whole.
  const FIRST_FLOOR: VectorGridTable = {
    bbox: [100, 300, 400, 380], rows: 3, cols: 3, raster: false,
    assigned: 9, orphan: 0, straddle: 0,
    cells: [
      cell(0, 0, "FIRST FLOOR", [100, 300, 400, 320], 1, 3),
      cell(1, 0, "A-1", [100, 320, 200, 340]),
      cell(1, 1, "2", [200, 320, 300, 340]),
      cell(1, 2, "10", [300, 320, 400, 340]),
      cell(2, 0, "A-2", [100, 340, 200, 360]),
      cell(2, 1, "3", [200, 340, 300, 360]),
      cell(2, 2, "12", [300, 340, 400, 360]),
    ],
  };
  // SECOND_FLOOR's own face redundantly re-captured FIRST_FLOOR's own last
  // row (A-2/3/12) whole, before its own divider and real data.
  const SECOND_FLOOR: VectorGridTable = {
    bbox: [100, 355, 400, 420], rows: 3, cols: 3, raster: false,
    assigned: 9, orphan: 0, straddle: 0,
    cells: [
      cell(0, 0, "A-2", [100, 355, 200, 375]),
      cell(0, 1, "3", [200, 355, 300, 375]),
      cell(0, 2, "12", [300, 355, 400, 375]),
      cell(1, 0, "SECOND FLOOR", [100, 375, 400, 395], 1, 3),
      cell(2, 0, "B-1", [100, 395, 200, 415]),
      cell(2, 1, "4", [200, 395, 300, 415]),
      cell(2, 2, "8", [300, 395, 400, 415]),
    ],
  };

  it("treats overlapping same-column-grid fragments as adjacent", () => {
    assert.ok(isFragmentAdjacent(FIRST_FLOOR, SECOND_FLOOR));
  });

  it("refuses fragments on a different column grid or too far apart", () => {
    const wideCols = { ...SECOND_FLOOR, cols: 4 };
    assert.ok(!isFragmentAdjacent(FIRST_FLOOR, wideCols));
    const farAway = { ...SECOND_FLOOR, bbox: [100, 1000, 400, 1065] as const };
    assert.ok(!isFragmentAdjacent(FIRST_FLOOR, farAway as VectorGridTable));
  });

  it("drops the duplicated seam row and the interior divider, keeps row 0's own title shape", () => {
    const merged = stackFragments(FIRST_FLOOR, SECOND_FLOOR);
    // FIRST_FLOOR's title(divider), 2 real data rows, SECOND_FLOOR's own real
    // data row — its own divider is interior and stripped, and the
    // redundantly-recaptured A-2/3/12 row is not doubled.
    assert.equal(merged.rows, 4);
    const texts = (r: number) => merged.cells
      .filter((c) => c.row === r)
      .sort((a, b) => a.col - b.col)
      .map((c) => c.text);
    assert.deepEqual(texts(0), ["FIRST FLOOR"]);
    assert.deepEqual(texts(1), ["A-1", "2", "10"]);
    assert.deepEqual(texts(2), ["A-2", "3", "12"]);
    assert.deepEqual(texts(3), ["B-1", "4", "8"]);
    assert.ok(!merged.cells.some((c) => c.text === "SECOND FLOOR"),
      "the interior divider row must not survive into the merged table");
    assert.equal(merged.cells.filter((c) => c.text === "A-2").length, 1,
      "the seam row must not be counted twice");
  });

  it("builds a correct, real schedule table from the 3-fragment merge", () => {
    const CAPTION: VectorGridTable = {
      bbox: [100, 200, 400, 300], rows: 2, cols: 3, raster: false,
      assigned: 4, orphan: 0, straddle: 0,
      cells: [
        cell(0, 0, "NOISE CONTROL DUCT SILENCER SCHEDULE", [100, 200, 400, 250], 1, 3),
        cell(1, 0, "TAG", [100, 250, 200, 300]),
        cell(1, 1, "QTY", [200, 250, 300, 300]),
        cell(1, 2, "SIZE", [300, 250, 400, 300]),
      ],
    };
    const round1 = stackFragments(CAPTION, FIRST_FLOOR);
    const final = stackFragments(round1, SECOND_FLOOR);
    const built = vectorGridTableToScheduleTable(final, 3, ctx(), 3);
    assert.ok(built, "the fully merged 3-fragment table must build");
    assert.equal(built.title?.text, "NOISE CONTROL DUCT SILENCER SCHEDULE");
    assert.deepEqual(built.headers, ["TAG", "QTY", "SIZE"]);
    assert.equal(built.rows.length, 3);
    assert.deepEqual(built.rows.map((r) => r.key), ["A-1", "A-2", "B-1"]);
  });
});

describe("vectorGridAdapter — space disagreement is refused, not absorbed", () => {
  // Pure check, no engine: the whole point is that a page-box disagreement is
  // caught BEFORE any coordinate is emitted.
  it("accepts a page box that matches the viewport", () => {
    assert.equal(pageBoxAgrees({ pageWidth: 600, pageHeight: 800 }, 3, 1800, 2400), "ok");
  });

  it("names a CropBox-style size disagreement", () => {
    assert.equal(pageBoxAgrees({ pageWidth: 600, pageHeight: 800 }, 3, 1800, 1200), "size");
  });

  it("names a rotation disagreement rather than calling it a size one", () => {
    // The two processes agree on the page but not on which way up it is.
    assert.equal(pageBoxAgrees({ pageWidth: 600, pageHeight: 800 }, 3, 2400, 1800), "rotation");
  });

  it("tolerates a pixel of rounding, not more", () => {
    assert.equal(pageBoxAgrees({ pageWidth: 600, pageHeight: 800 }, 3, 1801, 2400), "ok");
    assert.equal(pageBoxAgrees({ pageWidth: 600, pageHeight: 800 }, 3, 1805, 2400), "size");
  });
});

// AS-155: 07_MO's pictured PUMP SCHEDULE prints its notes inside its own grid
// — a NOTE row, then "1 BOLTED FLANGE" … "6 ECM MOTOR", each a number and one
// line of text — and every note read as a pump keyed "1" to "6".
describe("vectorGridAdapter — numbered notes inside the grid (AS-155)", () => {
  const withNotes = (band: ReturnType<typeof cell>[], rows: number): VectorGridTable => ({
    ...PUMPS,
    bbox: [100, 200, 340, 200 + 20 * rows],
    rows,
    cells: [...PUMPS.cells, ...band],
  });
  const NOTES_BAND = [
    cell(4, 0, "NOTE", [100, 280, 160, 300]),
    cell(4, 1, "* SEE EQUIPMENT DATA SCHEDULE ON ELECTRICAL DRAWINGS.", [160, 280, 340, 300], 1, 3),
    cell(5, 0, "1", [100, 300, 160, 320]),
    cell(5, 1, "BOLTED FLANGE", [160, 300, 340, 320], 1, 3),
    cell(6, 0, "2", [100, 320, 160, 340]),
    cell(6, 1, "ECM MOTOR", [160, 320, 220, 340]),
    cell(6, 2, "", [220, 320, 280, 340]),
    cell(6, 3, "", [280, 320, 340, 340]),
    cell(7, 0, "", [100, 340, 160, 360]),
    cell(7, 1, "", [160, 340, 340, 360], 1, 3),
  ];

  it("reads no unit from a note, and keeps the pumps and the region", () => {
    const built = vectorGridTableToScheduleTable(withNotes(NOTES_BAND, 8), 3, ctx(), 3);
    assert.ok(built);
    const keys = built.rows.map((r) => r.key);
    assert.ok(keys.includes("P-1") && keys.includes("P-2"), keys.join(","));
    assert.ok(!keys.includes("1") && !keys.includes("2"), `a note read as a row: ${keys.join(",")}`);
    assert.equal(built.region[3], (200 + 20 * 8) * 3, "the notes stay inside the table's region");
  });

  it("drops only the band below the label; the label row stays", () => {
    const t = dropNumberedNotes(withNotes(NOTES_BAND, 8));
    assert.equal(t.rows, 5);
    assert.deepEqual([...new Set(t.cells.map((c) => c.row))].sort(), [0, 1, 2, 3, 4]);
  });

  it("keeps the band when a row in it holds more than one line of text", () => {
    const band = [...NOTES_BAND.slice(0, 4),
      cell(6, 0, "3", [100, 320, 160, 340]),
      cell(6, 1, "140", [160, 320, 220, 340]),
      cell(6, 2, "70", [220, 320, 280, 340]),
      cell(6, 3, "7.5", [280, 320, 340, 340])];
    const t = withNotes(band, 7);
    assert.equal(dropNumberedNotes(t), t);
  });

  it("keeps a table whose rows are numbered but print no NOTES label", () => {
    const t: VectorGridTable = { ...PUMPS, cells: PUMPS.cells.map((c) =>
      c.row >= 2 && c.col === 0 ? { ...c, text: String(c.row - 1) } : c) };
    assert.equal(dropNumberedNotes(t), t);
  });

  it("keeps a label with only blank rows under it, and a table that starts with the label", () => {
    const blank = withNotes([...NOTES_BAND.slice(0, 2), ...NOTES_BAND.slice(8)], 8);
    assert.equal(dropNumberedNotes(blank), blank);
    // A table that is all notes (07_MO M-601's VAV notes panel): its label is
    // its first row, not a band under any unit's row.
    const panel: VectorGridTable = { ...PUMPS, rows: 3, cols: 2, cells: [
      cell(0, 0, "NOTES:", [100, 200, 340, 220], 1, 2),
      cell(1, 0, "1", [100, 220, 160, 240]), cell(1, 1, "ALL BOXES ARE SINGLE DUCT", [160, 220, 340, 240]),
      cell(2, 0, "2", [100, 240, 160, 260]), cell(2, 1, "SEE CONTROLS DWGS", [160, 240, 340, 260])] };
    assert.equal(dropNumberedNotes(panel), panel);
  });

  it("keeps a band whose first cell is not a note number", () => {
    const band = [...NOTES_BAND.slice(0, 2),
      cell(5, 0, "P-3", [100, 300, 160, 320]),
      cell(5, 1, "SPARE", [160, 300, 340, 320], 1, 3)];
    const t = withNotes(band, 6);
    assert.equal(dropNumberedNotes(t), t);
  });
});

// 032_PA's SPLIT SYSTEM OUTDOOR UNIT (CONDENSER) SCHEDULE, in small: the title
// printed beside a NOTES column, the label and a note in the two rows under
// it, then a two-tier header whose first labels run down both tiers.
const CONDENSERS: VectorGridTable = {
  bbox: [100, 200, 400, 340], rows: 7, cols: 6, raster: false,
  assigned: 30, orphan: 0, straddle: 0,
  cells: [
    cell(0, 2, "SPLIT SYSTEM OUTDOOR UNIT (CONDENSER) SCHEDULE", [200, 200, 400, 220], 1, 4),
    cell(1, 0, "NOTES:", [100, 220, 200, 240], 1, 2),
    cell(2, 0, "(1) PROVIDE 18\" STAND BOLTED TO ROOF.", [100, 240, 200, 260], 1, 2),
    cell(3, 0, "TYPE", [100, 260, 150, 300], 2, 1),
    cell(3, 1, "EQUIP. NO.", [150, 260, 200, 300], 2, 1),
    cell(3, 2, "REFRIGERANT", [200, 260, 300, 280], 1, 2),
    cell(3, 4, "ELECTRICAL", [300, 260, 400, 280], 1, 2),
    cell(4, 2, "TYPE", [200, 280, 250, 300]), cell(4, 3, "QTY. (oz)", [250, 280, 300, 300]),
    cell(4, 4, "VOLT", [300, 280, 350, 300]), cell(4, 5, "PH", [350, 280, 400, 300]),
    ...[5, 6].flatMap((r) => [
      cell(r, 0, "ACCU", [100, 300 + (r - 5) * 20, 150, 320 + (r - 5) * 20]),
      cell(r, 1, `1-A10${r}`, [150, 300 + (r - 5) * 20, 200, 320 + (r - 5) * 20]),
      cell(r, 2, "407C", [200, 300 + (r - 5) * 20, 250, 320 + (r - 5) * 20]),
      cell(r, 3, "134", [250, 300 + (r - 5) * 20, 300, 320 + (r - 5) * 20]),
      cell(r, 4, "208", [300, 300 + (r - 5) * 20, 350, 320 + (r - 5) * 20]),
      cell(r, 5, "1", [350, 300 + (r - 5) * 20, 400, 320 + (r - 5) * 20])]),
  ],
};

describe("vectorGridAdapter — a title and notes beside a notes column", () => {
  it("reads the title across the table and drops the notes rows above the header", () => {
    const t = widenLeadingProse(CONDENSERS);
    assert.equal(t.rows, 5);
    const title = t.cells.filter((c) => c.row === 0);
    assert.deepEqual(title.map((c) => [c.col, c.colSpan]), [[0, 6]]);
    assert.ok(!t.cells.some((c) => /NOTES|PROVIDE/.test(c.text)));
    assert.deepEqual(t.cells.filter((c) => c.row === 1).map((c) => c.text), ["TYPE", "EQUIP. NO.", "REFRIGERANT", "ELECTRICAL"]);
  });

  it("reads the units with both header tiers in their columns' names", () => {
    const table = vectorGridTableToScheduleTable(CONDENSERS, 1, ctx(), 3);
    assert.ok(table);
    assert.equal(table.title?.text, "SPLIT SYSTEM OUTDOOR UNIT (CONDENSER) SCHEDULE");
    assert.deepEqual(table.rows.map((r) => r.cells["EQUIP. NO."]?.text), ["1-A105", "1-A106"]);
    assert.ok(table.headers.includes("REFRIGERANT QTY. (OZ)") || table.headers.includes("REFRIGERANT QTY. (oz)"), JSON.stringify(table.headers));
    assert.ok(table.headers.includes("ELECTRICAL VOLT"), JSON.stringify(table.headers));
    assert.ok(!table.headers.some((h) => /NOTES/.test(h)), JSON.stringify(table.headers));
  });

  it("reads a title the rules cut into pieces as one, and REMARKS with notes numbered 1. as notes (096_IN's DIFFUSER / GRILLE SCHEDULE)", () => {
    const cut: VectorGridTable = { ...CONDENSERS, cells: [
      cell(0, 0, "DIFFUSER / GRILLE", [100, 200, 300, 220], 1, 4),
      cell(0, 4, "SCHEDULE", [300, 200, 400, 220], 1, 2),
      cell(1, 0, "REMARKS:", [100, 220, 300, 240], 1, 4),
      cell(2, 0, "1. BRANCH DUCTWORK TO THE DIFFUSER SHALL BE THE SAME SIZE AS THE NECK.", [100, 240, 300, 260], 1, 4),
      ...CONDENSERS.cells.filter((c) => c.row >= 3)] };
    const t = widenLeadingProse(cut);
    assert.deepEqual(t.cells.filter((c) => c.row === 0).map((c) => [c.text, c.col, c.colSpan]), [["DIFFUSER / GRILLE SCHEDULE", 0, 6]]);
    assert.ok(!t.cells.some((c) => /REMARKS|BRANCH/.test(c.text)));
    assert.equal(t.rows, 5);
  });

  it("leaves a lone group label, a title that names no schedule, and a ruled title alone", () => {
    const group: VectorGridTable = { ...CONDENSERS, cells: CONDENSERS.cells.map((c) =>
      c.row === 0 ? { ...c, text: "ELECTRICAL" } : c) };
    assert.equal(widenLeadingProse(group), group);
    assert.equal(widenLeadingProse(PUMPS), PUMPS);
    // A header row of group labels, each across columns, names no schedule.
    const groups: VectorGridTable = { ...CONDENSERS, cells: [
      cell(0, 0, "COOLING", [100, 200, 250, 220], 1, 3), cell(0, 3, "HEATING", [250, 200, 400, 220], 1, 3),
      ...CONDENSERS.cells.filter((c) => c.row >= 3)] };
    assert.equal(widenLeadingProse(groups), groups);
  });
});

describe("a mark read from a picture with its 1 as the letter I", () => {
  it("reads its number's I, l and O as the digits a single-stroke font drew (08_ME's EF-I, CH-I, ET-I)", () => {
    assert.equal(pictureMarkDigits("EF-I"), "EF-1");
    assert.equal(pictureMarkDigits("CH-I"), "CH-1");
    assert.equal(pictureMarkDigits("ET-I"), "ET-1");
    assert.equal(pictureMarkDigits("AHU-IO"), "AHU-10");
    assert.equal(pictureMarkDigits("EF l"), "EF 1");
  });
  it("leaves a mark that reads as a number, a word or no mark alone", () => {
    for (const keep of ["EF-2", "CH-12", "SS-1", "MOTOR", "LIGHTING", "AHU-A", "N/A", ""]) assert.equal(pictureMarkDigits(keep), keep);
  });
});

describe("a mark column under a group heading keys a table no other column keys", () => {
  // 056_NY's untitled fan table, lettered in ink and read from its picture:
  // QTY and MARK under MARK INFORMATION, the fan's and the motor's data under
  // their own bands, one unit. The joined header names the mark column
  // "MARKINFORMATION MARK", and its first column (QTY) holds "1".
  const x = [1577, 1615, 1792, 2026, 2079, 2210, 2255, 2332, 2390];
  const span = (c0: number, c1: number, y0: number, y1: number): [number, number, number, number] => [x[c0], y0, x[c1], y1];
  const fans = (bands: [string, string, string], marks: [string, string]): VectorGridTable => ({
    bbox: [1577, 673, 2390, 746], rows: 3, cols: 8, raster: false, assigned: 19, orphan: 0, straddle: 0, ocr: true,
    cells: [
      cell(0, 0, bands[0], span(0, 2, 673, 689), 1, 2),
      cell(0, 2, bands[1], span(2, 5, 673, 689), 1, 3),
      cell(0, 5, bands[2], span(5, 8, 673, 689), 1, 3),
      ...["QTY", marks[0], "MODEL", "VOLUME (CFM)", "FAN RPM", "SIZE (HP)", "V/C/P", marks[1]]
        .map((text, c) => cell(1, c, text, span(c, c + 1, 689, 729))),
      ...["1", "EF-2A", "VEKTOR-H-18", "2,810", "1,966", "5", "460/60/3", ""]
        .map((text, c) => cell(2, c, text, span(c, c + 1, 729, 746))),
    ],
  } as VectorGridTable);

  it("keys the fan's row by its MARK under MARK INFORMATION", () => {
    const built = vectorGridTableToScheduleTable(fans(["MARKINFORMATION", "FANINFORMATION", "MOTORINFORMATION"], ["MARK", "ENCLOSURE"]), 3, ctx(), 3);
    assert.ok(built, "the table must build");
    assert.deepEqual(built.rows.map((r) => r.key), ["EF-2A"]);
  });

  it("does not choose between two such columns", () => {
    // Two mark columns under their own headings are a split system's halves,
    // which the takeoff reads apart (AS-144); the rescue keys neither.
    const reasons: string[] = [];
    const built = vectorGridTableToScheduleTable(
      fans(["INDOOR UNIT", "FANINFORMATION", "OUTDOOR UNIT"], ["MARK", "MARK"]), 3, ctx(), 3, (r) => reasons.push(r));
    assert.ok(!built?.rows.some((r) => r.key === "EF-2A"), JSON.stringify(built?.rows.map((r) => r.key)));
  });
});

describe("a mark printed in two columns, its letters under ABB. and its number under NO.", () => {
  // 091_IL's pictured AIR HANDLING UNITS: each unit takes two lines (its
  // cooling and electric coils), its mark is "AHU" | "3A-01", and a unit with
  // no return fan prints NONE merged across that section's columns.
  const x = [100, 130, 170, 260, 320, 380, 410, 440, 500, 540];
  const y = [100, 120, 135, 150, 165, 180, 195, 210, 225];
  const box = (c0: number, c1: number, r0: number, r1: number): [number, number, number, number] => [x[c0], y[r0], x[c1], y[r1]];
  const units = (tagHeads: [string, string], marks: [string, string][]): VectorGridTable => {
    const cells = [
      cell(0, 0, "AIR HANDLING UNITS (AHU)", box(0, 9, 0, 1), 1, 9),
      cell(1, 0, "EQUIP. TAG", box(0, 2, 1, 2), 1, 2),
      cell(1, 2, "GENERAL", box(2, 4, 1, 2), 1, 2),
      cell(1, 4, "SUPPLY FAN", box(4, 7, 1, 2), 1, 3),
      cell(1, 7, "RETURN/EXHAUST FAN", box(7, 9, 1, 2), 1, 2),
      cell(2, 0, tagHeads[0], box(0, 1, 2, 4), 2, 1),
      cell(2, 1, tagHeads[1], box(1, 2, 2, 4), 2, 1),
      cell(2, 2, "SERVICE", box(2, 3, 2, 4), 2, 1),
      cell(2, 3, "HYDRONIC COILS", box(3, 4, 2, 4), 2, 1),
      cell(2, 4, "TOTAL AIRFLOW (CFM)", box(4, 5, 2, 4), 2, 1),
      cell(2, 5, "MOTOR", box(5, 7, 2, 3), 1, 2),
      cell(3, 5, "HP", box(5, 6, 3, 4)),
      cell(3, 6, "BHP", box(6, 7, 3, 4)),
      cell(2, 7, "AIRFLOW (CFM)", box(7, 8, 2, 4), 2, 1),
      cell(2, 8, "HP", box(8, 9, 2, 4), 2, 1),
    ];
    marks.forEach(([abb, no], i) => {
      const r = 4 + 2 * i;
      cells.push(
        cell(r, 0, abb, box(0, 1, r, r + 2), 2, 1),
        cell(r, 1, no, box(1, 2, r, r + 2), 2, 1),
        cell(r, 2, "STADIUM CLUB", box(2, 3, r, r + 2), 2, 1),
        cell(r, 3, `CC-${i + 1}`, box(3, 4, r, r + 1)),
        cell(r + 1, 3, `EHC-${i + 1}`, box(3, 4, r + 1, r + 2)),
        cell(r, 4, "14300", box(4, 5, r, r + 2), 2, 1),
        cell(r, 5, "20", box(5, 6, r, r + 2), 2, 1),
        cell(r, 6, "15.1", box(6, 7, r, r + 2), 2, 1),
        cell(r, 7, "NONE", box(7, 9, r, r + 2), 2, 2),
      );
    });
    return { bbox: [100, 100, 540, 165 + 30 * marks.length], rows: 4 + 2 * marks.length, cols: 9, raster: false,
      assigned: cells.length, orphan: 0, straddle: 0, ocr: true, cells } as VectorGridTable;
  };

  it("keys each unit by its joined mark, once, its second line folded into it", () => {
    const built = vectorGridTableToScheduleTable(units(["ABB.", "NO."], [["AHU", "3A-01"], ["AHU", "3A-02"]]), 11, ctx(), 3);
    assert.ok(built, "the table must build");
    assert.deepEqual(built.rows.map((r) => r.key), ["AHU-3A-01", "AHU-3A-02"]);
  });

  it("keys a schedule of one unit by its joined mark too", () => {
    const built = vectorGridTableToScheduleTable(units(["ABB.", "NO."], [["RTU", "1"]]), 11, ctx(), 3);
    assert.deepEqual(built?.rows.map((r) => r.key), ["RTU-1"]);
  });

  it("joins no mark where the header prints no ABB. and NO. (a panel's NOTES and # columns)", () => {
    const built = vectorGridTableToScheduleTable(units(["NOTES", "#"], [["EX", "1"], ["EX", "3"]]), 11, ctx(), 3);
    assert.ok(!built?.rows.some((r) => /^EX-\d/.test(r.key)), JSON.stringify(built?.rows.map((r) => r.key)));
  });
});
