/**
 * Shared schedule language scan — Pillar A–D gap detection.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  scanPillarGapLanguage,
  sheetHasPointsListTitleSpans,
  sheetHasScheduleCaption,
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

/**
 * THE GATE THAT LOSES SCHEDULES DRAWN ON PLAN SHEETS.
 *
 * `isScheduleTarget` refuses a sheet whose role is `plan`, so vectorgrid is
 * never offered it and the geometric extractor's narrower read is what reaches
 * the estimator. Measured on 13_MI_MSU_LifeSciences p10 (sheet A-003, "FIRST
 * FLOOR PLAN - AREA A"): the app showed EQUIPMENT SCHEDULE with 3 columns and
 * a box cut off at MODEL; vectorgrid run on that same page by hand returns 7
 * columns, 57 cells, 0 orphans.
 *
 * A keyword scan cannot be the gate on a plan sheet — equipment vocabulary is
 * everywhere on a floor plan, which is why the role check existed. A printed
 * standalone CAPTION can, and these cases are the boundary of it.
 */
describe("sheetHasScheduleCaption", () => {
  const span = (str: string) => ({ str, x: 100, y: 200, w: 8 * str.length, h: 12 });

  it("accepts a standalone upper-case caption on a plan sheet", () => {
    assert.equal(sheetHasScheduleCaption([span("FIRST FLOOR PLAN - AREA A"), span("EQUIPMENT SCHEDULE")]), true);
  });

  it("accepts the plural, and captions carrying punctuation draftsmen actually use", () => {
    assert.equal(sheetHasScheduleCaption([span("MECHANICAL SCHEDULES")]), true);
    assert.equal(sheetHasScheduleCaption([span("PANEL 'A' SCHEDULE")]), true);
    assert.equal(sheetHasScheduleCaption([span("ROOF TOP UNIT (RTU) SCHEDULE")]), true);
  });

  it("refuses a cross-reference note, which is what a plan sheet usually prints", () => {
    assert.equal(sheetHasScheduleCaption([span("SEE EQUIPMENT SCHEDULE")]), false);
    assert.equal(sheetHasScheduleCaption([span("REFER TO PANEL SCHEDULE")]), false);
  });

  it("refuses a bare word, lower case, and sentences that merely mention one", () => {
    assert.equal(sheetHasScheduleCaption([span("SCHEDULE")]), false);
    assert.equal(sheetHasScheduleCaption([span("Equipment Schedule")]), false);
    assert.equal(sheetHasScheduleCaption([span("EQUIPMENT SCHEDULE ON SHEET M-501")]), false);
  });

  it("refuses legends and indexes on purpose — a legend is not a takeoff table", () => {
    assert.equal(sheetHasScheduleCaption([span("MECHANICAL LEGEND"), span("DRAWING INDEX"), span("SHEET LIST")]), false);
  });

  it("refuses a plan sheet with no caption at all", () => {
    assert.equal(sheetHasScheduleCaption([span("FIRST FLOOR PLAN - AREA A"), span("CORRIDOR 101"), span("AHU-1")]), false);
  });
});
