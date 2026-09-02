/**
 * Shared schedule language scan — Pillar A–D gap detection.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  scanPillarGapLanguage,
  sheetHasPointsListTitleSpans,
  sheetHasScheduleLanguage,
} from "../src/lib/scheduleLanguageScan.ts";

describe("scheduleLanguageScan", () => {
  it("detects embedded AHU POINTS LIST titles (not line-anchored only)", () => {
    const spans = [{ str: "AHU-1 BOILER POINTS LIST", x: 100, y: 200, w: 180, h: 12 }];
    assert.equal(sheetHasPointsListTitleSpans(spans), true);
    assert.equal(sheetHasScheduleLanguage(spans), true);
  });

  it("detects valve schedule language for the 70 compile-zero recovery path", () => {
    const spans = [{ str: "CHW CONTROL VALVE SCHEDULE", x: 50, y: 80, w: 200, h: 14 }];
    const hits = scanPillarGapLanguage(spans);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].kind, "valve");
  });

  it("detects BAS I/O list language", () => {
    const spans = [{ str: "DDC I/O LIST — PANEL P-1", x: 10, y: 10, w: 160, h: 12 }];
    const hits = scanPillarGapLanguage(spans);
    assert.ok(hits.some((h) => h.kind === "bas" || h.kind === "both"));
  });
});
