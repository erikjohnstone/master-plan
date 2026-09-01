/**
 * Sidecar adapter unit tests — sanity + span grounding (no Python required).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  sidecarPassesSanity,
  sidecarTableToScheduleTable,
  spanIdsForBbox,
} from "../src/lib/scheduleTableSidecarAdapter.ts";
import type { SidecarTable } from "../src/lib/tableSidecarClient.ts";

const SAMPLE: SidecarTable = {
  source: "vector-lines",
  score: 0.9,
  page: 1,
  rows: 3,
  cols: 4,
  bbox: [40, 90, 360, 200],
  cells: [
    { row: 0, col: 0, rowSpan: 1, colSpan: 1, text: "TAG", bbox: [40, 90, 90, 110], confidence: 0.9 },
    { row: 0, col: 1, rowSpan: 1, colSpan: 1, text: "GPM", bbox: [90, 90, 150, 110], confidence: 0.9 },
    { row: 0, col: 2, rowSpan: 1, colSpan: 1, text: "SIZE", bbox: [150, 90, 210, 110], confidence: 0.9 },
    { row: 0, col: 3, rowSpan: 1, colSpan: 1, text: "SERVED", bbox: [210, 90, 360, 110], confidence: 0.9 },
    { row: 1, col: 0, rowSpan: 1, colSpan: 1, text: "CV-1", bbox: [40, 120, 90, 140], confidence: 0.9 },
    { row: 1, col: 1, rowSpan: 1, colSpan: 1, text: "120", bbox: [90, 120, 150, 140], confidence: 0.9 },
    { row: 1, col: 2, rowSpan: 1, colSpan: 1, text: '2"', bbox: [150, 120, 210, 140], confidence: 0.9 },
    { row: 1, col: 3, rowSpan: 1, colSpan: 1, text: "AHU-1", bbox: [210, 120, 360, 140], confidence: 0.9 },
    { row: 2, col: 0, rowSpan: 1, colSpan: 1, text: "CV-2", bbox: [40, 150, 90, 170], confidence: 0.9 },
    { row: 2, col: 1, rowSpan: 1, colSpan: 1, text: "85", bbox: [90, 150, 150, 170], confidence: 0.9 },
    { row: 2, col: 2, rowSpan: 1, colSpan: 1, text: '1.5"', bbox: [150, 150, 210, 170], confidence: 0.9 },
    { row: 2, col: 3, rowSpan: 1, colSpan: 1, text: "AHU-2", bbox: [210, 150, 360, 170], confidence: 0.9 },
  ],
};

describe("scheduleTableSidecarAdapter", () => {
  it("passes sanity on a minimal valve grid", () => {
    assert.equal(sidecarPassesSanity(SAMPLE), true);
  });

  it("maps sidecar grid to ScheduleTable with span ids", () => {
    const spans = [
      { str: "CV-1", x: 45, y: 122, w: 20, h: 8 },
      { str: "120", x: 95, y: 122, w: 20, h: 8 },
    ];
    const built = sidecarTableToScheduleTable(SAMPLE, {
      pdfPath: "/tmp/x.pdf",
      sheetKey: "x.pdf",
      spans,
      pageViewportTransform: [1, 0, 0, 1, 0, 0],
    });
    assert.ok(built);
    assert.ok(built!.rows.length >= 1);
    const ids = spanIdsForBbox(spans, [40, 118, 120, 145]);
    assert.ok(ids.includes("span:0"));
  });
});
