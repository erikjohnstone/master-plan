/**
 * Vector takeoff pipeline unit tests — L1.5 tiling + L2 stream/line hooks.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { slicePageTiles, clipSpansToTile } from "../src/lib/pageTileGrid.ts";
import { sheetHasScheduleKeywords } from "../src/lib/scheduleGridFallback.ts";
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
});
