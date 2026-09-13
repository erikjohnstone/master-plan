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
