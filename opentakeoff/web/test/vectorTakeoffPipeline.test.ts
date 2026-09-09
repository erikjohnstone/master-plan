/**
 * Vector takeoff pipeline unit tests — L1.5 tiling + L2 stream/line hooks.
 */
import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import { slicePageTiles, clipSpansToTile } from "../src/lib/pageTileGrid.ts";
import { sheetHasScheduleKeywords, extractScheduleTablesFromLineGrid, MAX_LINE_GRID_SEGMENTS } from "../src/lib/scheduleGridFallback.ts";
import { extractScheduleTablesFromStreamGrid } from "../src/lib/scheduleStreamFallback.ts";
import { runVectorTakeoffPipeline, scheduleKeywordRegion, type VectorPipelineHooks } from "../src/lib/vectorTakeoffPipeline.ts";
import { shutdownVectorGrid } from "../src/lib/vectorGridClient.ts";
import type { GraphSpan, SheetGraph } from "../src/lib/sheetgraph.ts";

describe("L1.5 pageTileGrid", () => {
  it("slices oversized pages into overlapping tiles", () => {
    const tiles = slicePageTiles(4000, 3000, { minPageDim: 2600, tileSize: 1024, overlapFrac: 0.25 });
    assert.ok(tiles.length >= 4);
    assert.ok(tiles.every((t) => t.transform.length === 6));
  });

  it("clips spans into tile-local coordinates", () => {
    const tile = slicePageTiles(4000, 3000)[0];
    const spans: GraphSpan[] = [
      { str: "TAG", x: tile.region[0] + 10, y: tile.region[1] + 10, w: 20, h: 8 },
      { str: "OUT", x: 9999, y: 9999, w: 10, h: 8 },
    ];
    const clipped = clipSpansToTile(spans, tile);
    assert.equal(clipped.length, 1);
    assert.ok(clipped[0].x < 100);
  });
});

describe("L2 stream fallback", () => {
  it("detects schedule keywords", () => {
    assert.equal(sheetHasScheduleKeywords([{ str: "CONTROL VALVE SCHEDULE", x: 0, y: 0, w: 100, h: 10 }]), true);
  });

  it("extracts borderless grid from aligned header + data rows", () => {
    const spans: GraphSpan[] = [];
    const headers = ["TAG", "GPM", "SIZE", "SERVED"];
    headers.forEach((h, i) => spans.push({ str: h, x: 40 + i * 80, y: 100, w: 30, h: 10 }));
    ["CV-1", "120", '2"', "BOILER-1"].forEach((t, i) => spans.push({ str: t, x: 40 + i * 80, y: 130, w: 30, h: 10 }));
    ["CV-2", "85", '1.5"', "BOILER-2"].forEach((t, i) => spans.push({ str: t, x: 40 + i * 80, y: 160, w: 30, h: 10 }));
    const tables = extractScheduleTablesFromStreamGrid(spans, "set.pdf#1", {
      pageViewportTransform: [2, 0, 0, 2, 0, 0],
      force: true,
    });
    assert.ok(tables.length >= 1, "stream grid should produce a table");
    assert.ok(tables[0].rows.length >= 1);
  });

  it("a second real schedule's own repeated header row never survives as a phantom data row (GOAL.md rule 21, fixed 2026-09-04)", () => {
    // Real bug, found doing genuinely verified per-set work:
    // 006_US_U2607_01_Interior_Renovations_C_Wing_Updates.pdf#17 draws TWO
    // genuinely separate real door schedules stacked on one sheet ("AREA
    // 1C16L DOOR SCHEDULE" then "AREA 1C16H DOOR SCHEDULE …", each its own
    // real MARK/WIDTH/HEIGHT/… header). This fallback's own row scan finds
    // ONE header row (the first to clear its own HEADER_WORDS bar) and then
    // treats EVERY row after it as data all the way to the end of the
    // sheet — no notion of a second table at all — so the second real
    // schedule's own repeated header row survives as an ordinary data row:
    // a literal `{"MARK":"MARK","WIDTH":"WIDTH",…}` row spliced mid-table.
    // Root-caused via a real live debug trace across THREE prior sessions'
    // worth of investigation inside sheetgraph.ts's own buildSheetGraph
    // (all of it a dead end — that function returns ZERO fragments for
    // this entire document) before this fallback, a wholly separate file,
    // was finally identified as the real source.
    //
    // Fixed narrowly: a candidate data row that ALSO clears the identical
    // header-word bar used to find the table's own first header row is
    // refused as data (skipped, not counted, scan continues) — a row
    // shaped like a header is never real data, whichever table it belongs
    // to. Mirrors the real page's own header vocabulary (MARK/TYPE, each
    // recognized by this fallback's own HEADER_WORDS list) repeated
    // verbatim between the two real schedules.
    const spans: GraphSpan[] = [];
    const headers = ["MARK", "TYPE", "MODEL", "SIZE"];
    const put = (vals: string[], y: number) => vals.forEach((v, i) => spans.push({ str: v, x: 40 + i * 80, y, w: 30, h: 10 }));
    put(headers, 100);
    put(["C101", "HM", "M1", "36"], 130);
    put(["C102", "HM", "M1", "36"], 160);
    put(headers, 190); // the second real schedule's own repeated header row
    put(["C201", "WD", "M2", "32"], 220);
    put(["C202", "WD", "M2", "32"], 250);
    const tables = extractScheduleTablesFromStreamGrid(spans, "doors.pdf#17", {
      pageViewportTransform: [2, 0, 0, 2, 0, 0],
      force: true,
    });
    assert.ok(tables.length >= 1, "stream grid should produce a table");
    const keys = tables[0].rows.map((r) => r.key);
    assert.ok(!keys.includes("MARK"), `a repeated header row must never survive as a phantom "MARK" data row: got ${JSON.stringify(keys)}`);
    assert.deepEqual(keys, ["C101", "C102", "C201", "C202"], `all 4 real doors must still be present, header row skipped cleanly: got ${JSON.stringify(keys)}`);
  });
});

describe("L4.5 scheduleKeywordRegion (task #84, real corpus root cause 2026-09-09)", () => {
  it("widens a narrow caption to a real-table-sized floor instead of just the caption's own width", () => {
    // Real shape (16_NV_CarsonValleyMS_HVAC_Replacement.pdf#31/#32): a
    // caption's own bbox is ~130-760pt wide against a ~6000pt sheet — the
    // old code returned exactly that narrow bbox, rapid_table read a
    // genuine but severely truncated single-column strip, and
    // scheduleTableFromODL correctly refused it as "grid too small".
    const width = 6048, height = 4320;
    const spans: GraphSpan[] = [{ str: "EXISTING PANEL SCHEDULE", x: 4401, y: 2302, w: 130, h: 18 }];
    const region = scheduleKeywordRegion(spans, width, height);
    assert.ok(region, "must return a region for a real keyword hit");
    const [x0, , x1] = region!;
    assert.ok(x1 - x0 >= width * 0.45 - 1, `region must be widened to the sheet-width floor, got width ${x1 - x0}`);
  });

  it("never widens past the sheet edges even when the caption sits near one", () => {
    const width = 1200, height = 900;
    const spans: GraphSpan[] = [{ str: "EQUIPMENT SCHEDULE", x: 1100, y: 100, w: 90, h: 14 }];
    const region = scheduleKeywordRegion(spans, width, height);
    assert.ok(region);
    const [x0, , x1] = region!;
    assert.ok(x0 >= 0 && x1 <= width, `region must stay inside the sheet: got [${x0}, ${x1}] on a ${width}-wide sheet`);
  });

  it("does not widen a caption whose own cluster already spans a real table's width", () => {
    // A caption/header row that's ALREADY wide (e.g. column headers printed
    // as one wide keyword-matching run) must not be shrunk or distorted by
    // the floor logic — the floor only ever WIDENS a too-narrow bbox.
    const width = 4000, height = 3000;
    const spans: GraphSpan[] = [{ str: "MECHANICAL EQUIPMENT SCHEDULE FOR THIS BUILDING", x: 200, y: 300, w: 2400, h: 16 }];
    const region = scheduleKeywordRegion(spans, width, height);
    assert.ok(region);
    const [x0, , x1] = region!;
    assert.ok(x1 - x0 >= 2400, `an already-wide cluster must not be narrowed: got width ${x1 - x0}`);
  });

  it("extends the vertical band upward instead of collapsing when the caption sits near the page's bottom edge", () => {
    // Real shape (25_WA_DouglasCounty_Courthouse_HVAC_DDC.pdf#8/#9/#10): the
    // caption sits ~187pt above the page's bottom margin, so the old
    // `bandH = min(1200, height - y0)` collapsed to ~187pt — far too short
    // to contain the real table, and every tiled band came back empty.
    const width = 4896, height = 3168;
    const spans: GraphSpan[] = [{ str: "REFRIGERANT PIPING SCHEDULE", x: 4145, y: 2980, w: 200, h: 16 }];
    const region = scheduleKeywordRegion(spans, width, height);
    assert.ok(region);
    const [, y0, , y1] = region!;
    assert.ok(y1 - y0 >= 500, `region must have a real minimum height, got ${y1 - y0}`);
    assert.ok(y0 < 2980, "must extend upward to make room, not just accept a truncated band below the caption");
  });

  it("clusters widely-separated keyword hits and keeps only the largest cluster, instead of unioning the whole sheet", () => {
    // Real shape (017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling.pdf#14):
    // scattered keyword hits across nearly the entire sheet unioned into a
    // near-whole-page region ([207, 108, 5908, 4320] on a 6048x4320 sheet),
    // which then had to be downscaled past legibility to fit the render
    // cap — table_structure found only 4-7 coarse cells, not a real grid.
    const width = 6048, height = 4320;
    const spans: GraphSpan[] = [
      // The real caption: two text runs of the same title, close together.
      { str: "EXISTING VENTILATION SCHEDULE", x: 300, y: 200, w: 240, h: 16 },
      { str: "VENTILATION FAN SCHEDULE CONTINUED", x: 320, y: 230, w: 260, h: 14 },
      // An unrelated, far-away stray match elsewhere on the same sheet.
      { str: "REFER TO DETAIL SCHEDULE ON SHEET M6.1", x: 5600, y: 4100, w: 300, h: 14 },
    ];
    const region = scheduleKeywordRegion(spans, width, height);
    assert.ok(region);
    const [x0, y0, x1, y1] = region!;
    assert.ok(x1 - x0 < width * 0.6, `must not union the far-away stray hit into a near-whole-page region: got width ${x1 - x0}`);
    assert.ok(y1 - y0 < height * 0.6, `must not union the far-away stray hit vertically either: got height ${y1 - y0}`);
    // The real caption's own location must still be inside the chosen region.
    assert.ok(x0 <= 300 && x1 >= 540, "the real caption's own cluster must anchor the region, not the stray hit");
  });

  it("returns null when the sheet carries no schedule-keyword text at all (unchanged fallback trigger)", () => {
    const spans: GraphSpan[] = [{ str: "GENERAL NOTES", x: 100, y: 100, w: 80, h: 14 }];
    assert.equal(scheduleKeywordRegion(spans, 2000, 1500), null);
  });
});

describe("L2 line grid fallback safety", () => {
  it("skips ruled-grid when segment budget exceeded", () => {
    const segs = new Array((MAX_LINE_GRID_SEGMENTS + 1) * 4).fill(0);
    const tables = extractScheduleTablesFromLineGrid(
      [{ str: "CONTROL VALVE SCHEDULE", x: 0, y: 0, w: 100, h: 10 }],
      segs,
      "set.pdf#1",
      { pageViewportTransform: [1, 0, 0, 1, 0, 0], force: true },
    );
    assert.equal(tables.length, 0);
  });

  it("caps dense axis lines without combinatorial blowup", () => {
    const segs: number[] = [];
    for (let y = 0; y < 120; y += 8) {
      segs.push(0, y, 2000, y);
    }
    for (let x = 0; x < 120; x += 8) {
      segs.push(x, 0, x, 2000);
    }
    const t0 = Date.now();
    const tables = extractScheduleTablesFromLineGrid(
      [{ str: "TAG", x: 10, y: 10, w: 20, h: 8 }, { str: "GPM", x: 90, y: 10, w: 20, h: 8 }],
      segs,
      "set.pdf#1",
      { pageViewportTransform: [1, 0, 0, 1, 0, 0], force: true },
    );
    assert.ok(Date.now() - t0 < 500, "grid search should stay bounded");
    assert.ok(Array.isArray(tables));
  });
});

describe("L2 vectorgrid: a refused engine must say so where a person will see it", () => {
  it("a real engine failure (bogus pdfPath, sidecar genuinely throws) surfaces in g.notes, not only the pipeline report", async () => {
    // Real, found live (2026-09-08): runL2VectorGridForSheet already caught
    // this correctly and pushed "L2 vectorgrid did not run — <error>" into
    // report.notes — but that array only ever reached g.vector_pipeline,
    // which nothing in the UI reads. A document where the engine failed on
    // EVERY sheet (a missing Python dependency, most commonly) produced
    // none of the OTHER notes below (all gated on genuine work happening)
    // and stayed completely silent while quietly reading every schedule
    // through the weaker geometric fallback — the exact wrong, narrower
    // boxes chased for hours as a caching bug on a machine that never
    // printed a single error anywhere a person would look.
    //
    // This drives the real failure path end to end, no mocks: a genuinely
    // nonexistent pdfPath, so the sidecar spawns for real (vectorGridAvailable()
    // only checks the SCRIPT exists) and extract_grid genuinely throws — the
    // same shape of failure a missing shapely/pymupdf import produces.
    const g: SheetGraph = {
      available: true, sheets: [], rooms: [], unmatched_tags: [], tables: [],
      callouts: [], buildings: [], revisions: [], notes: [],
    };
    const hooks: VectorPipelineHooks = {
      runODL: async () => {},
      getSheetContexts: () => [{
        key: "nonexistent-fixture.pdf#1",
        role: "schedule",
        spans: [],
        width: 1000,
        height: 1000,
        pageViewportTransform: [1, 0, 0, 1, 0, 0],
        pdfPath: "/tmp/this-file-does-not-exist-vectorTakeoffPipeline-test.pdf",
      }],
      sheetHasPointsListTitle: () => false,
    };
    const report = await runVectorTakeoffPipeline(g, hooks);
    assert.equal(report.vectorgrid?.refused, 1, "the bogus pdfPath must genuinely reach and fail the L2 engine");
    assert.ok(report.vectorgrid?.first_error, "the failure's own message must be kept");
    const surfaced = g.notes.find((n) => n.startsWith("Vector pipeline L2: vectorgrid"));
    assert.ok(surfaced, `g.notes must carry a user-facing warning; got: ${JSON.stringify(g.notes)}`);
    assert.match(surfaced!, /could not run on any sheet/);
  });

  // The RPC client keeps one persistent sidecar child process alive across
  // calls (a real perf choice — spawning Python per request would cost
  // seconds every time) and only tears it down on an explicit shutdown call.
  // `node --test` does not force-exit once its own test bodies finish; it
  // waits for the process to go idle, and a live child process with open
  // stdio pipes keeps the event loop alive indefinitely — measured live:
  // this exact test hung the whole file for 48 minutes at 0% CPU under
  // `node --test` while the identical scenario, run as a plain script that
  // calls `process.exit()` itself, resolved in 440ms. Not vectorgrid being
  // slow — the test runner waiting on a handle nothing ever closed.
  after(async () => { await shutdownVectorGrid(); });
});
