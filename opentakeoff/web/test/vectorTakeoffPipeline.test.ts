/**
 * Vector takeoff pipeline unit tests — L1.5 tiling + L2 stream/line hooks.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { slicePageTiles, clipSpansToTile } from "../src/lib/pageTileGrid.ts";
import { sheetHasScheduleKeywords, extractScheduleTablesFromLineGrid, MAX_LINE_GRID_SEGMENTS } from "../src/lib/scheduleGridFallback.ts";
import { extractScheduleTablesFromStreamGrid } from "../src/lib/scheduleStreamFallback.ts";
import type { GraphSpan } from "../src/lib/sheetgraph.ts";

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
