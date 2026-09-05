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
