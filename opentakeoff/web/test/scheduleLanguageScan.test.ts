/**
 * Shared schedule language scan — Pillar A–D gap detection.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  scanPillarGapLanguage,
  nearbyScheduleCaption,
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

  it("a POINTS LIST title split across two pdf.js spans is still recognized (GOAL.md rule, fixed 2026-09-08)", () => {
    // Real, corpus-found (v3 full-corpus audit, 056_NY_VA_Project_632_19_106
    // Renovate_Pharmacy_Spaces.pdf#5, "AUTOMATIC TEMPERATURE CONTROL
    // DIAGRAM"): a real, ruled "POINTS LIST" table for VAV AIR HANDLER AHU-1
    // — title, "SYSTEM:" subheader, ~20 real point rows — on a sheet whose
    // role is `unknown` (no ROLE_SIGNALS entry matches a CONTROL DIAGRAM
    // title). The sheet's own drafting split "POINTS" and "LIST" across two
    // separate spans, same CAD-export fragmentation `sheetHasScheduleCaption`
    // was already fixed for (009_FL#30's "EXISTING PANEL"/"ELP"/"SCHEDULE").
    // Every regex in sheetHasPointsListTitleSpans only ever saw ONE span at a
    // time, so isScheduleTarget's role==="unknown" fallback never fired and
    // the sheet was never offered to the table extractor — a real, ruled
    // table read as zero tables.
    const split = [
      { str: "POINTS", x: 100, y: 200, w: 60, h: 12 },
      { str: "LIST", x: 168, y: 200, w: 36, h: 12 },
    ];
    assert.equal(sheetHasPointsListTitleSpans(split), true);
    assert.equal(sheetHasScheduleLanguage(split), true);
    // two unrelated words on the same line, far apart, must NOT merge into a
    // false "POINTS LIST" — the join step has the same gap discipline
    // joinCaptionLines already enforces for schedule captions.
    const unrelated = [
      { str: "POINTS", x: 100, y: 200, w: 60, h: 12 },
      { str: "SOMETHING ELSE ENTIRELY OVER HERE", x: 900, y: 200, w: 260, h: 12 },
    ];
    assert.equal(sheetHasPointsListTitleSpans(unrelated), false);
  });
});

describe("nearbyScheduleCaption", () => {
  const region: [number, number, number, number] = [600, 40, 760, 700];

  it("joins a split vertical equipment caption beside its table", () => {
    const spans = [
      { str: "PU", x: 780, y: 422, w: 12, h: 13, rot: 90 },
      { str: "P SCHEDULE", x: 780, y: 442, w: 12, h: 55, rot: 90 },
    ];
    assert.deepEqual(nearbyScheduleCaption(spans, region, "P SCHEDULE"), {
      text: "PU P SCHEDULE",
      bbox: [780, 422, 792, 497],
    });
    assert.deepEqual(nearbyScheduleCaption(spans, region, ""), {
      text: "PU P SCHEDULE",
      bbox: [780, 422, 792, 497],
    }, "a titleless grid must reconstruct the same split caption instead of keeping only P SCHEDULE");
  });

  it("replaces a generic in-grid MARK title with its exact nearby caption evidence", () => {
    const spans = [{ str: "PACKAGED AIR COOLED CHILLER SCHEDULE", x: 770, y: 260, w: 12, h: 210, rot: 90 }];
    assert.deepEqual(nearbyScheduleCaption(spans, region, "MARK"), {
      text: "PACKAGED AIR COOLED CHILLER SCHEDULE",
      bbox: [770, 260, 782, 470],
    });
  });

  it("never replaces a complete existing schedule title", () => {
    const spans = [{ str: "SUPPLY FAN SCHEDULE", x: 770, y: 260, w: 12, h: 120, rot: 90 }];
    assert.equal(nearbyScheduleCaption(spans, region, "AIR HANDLING UNIT SCHEDULE"), null);
  });

  it("does not expand a short complete title into a neighboring schedule family", () => {
    const spans = [{ str: "CABINET UNIT HEATER SCHEDULE", x: 620, y: 10, w: 220, h: 24 }];
    assert.equal(
      nearbyScheduleCaption(spans, [600, 120, 900, 360], "UNIT HEATER SCHEDULE"),
      null,
      "UNIT HEATER is a complete authored title, not a truncated suffix of CABINET UNIT HEATER",
    );
  });

  it("does not borrow a schedule caption that is spatially unrelated to the table", () => {
    const spans = [{ str: "SUPPLY FAN SCHEDULE", x: 1800, y: 1800, w: 12, h: 120, rot: 90 }];
    assert.equal(nearbyScheduleCaption(spans, region, ""), null);
  });

  it("accepts an attached horizontal caption above a deep remarks tier", () => {
    const tallSchedule: [number, number, number, number] = [645, 423, 4673, 845];
    const spans = [{
      str: "PACKAGED ROOFTOP AIR CONDITIONING UNIT SCHEDULE (GAS HEAT)",
      x: 2030, y: 127, w: 1259, h: 46,
    }];
    assert.deepEqual(nearbyScheduleCaption(spans, tallSchedule, ""), {
      text: "PACKAGED ROOFTOP AIR CONDITIONING UNIT SCHEDULE (GAS HEAT)",
      bbox: [2030, 127, 3289, 173],
    });
  });

  it("does not steal a lower schedule's caption from deep inside this table region", () => {
    const tallSchedule: [number, number, number, number] = [645, 423, 4673, 845];
    const spans = [{ str: "DIFFUSER-GRILLE SCHEDULE", x: 1336, y: 799, w: 530, h: 46 }];
    assert.equal(nearbyScheduleCaption(spans, tallSchedule, ""), null);
  });

  it("prefers the attached HVAC UNITS table title over an adjacent longer schedule caption", () => {
    const narrowRegion: [number, number, number, number] = [495, 45, 532, 620];
    const spans = [
      { str: "SPLIT SYSTEM AIR CONDITIONING UNITS", x: 539, y: 350, w: 9, h: 179, rot: 90 },
      { str: "PACKAGED AIR COOLED CHILLER SCHEDULE", x: 649, y: 273, w: 9, h: 191, rot: 90 },
    ];
    assert.deepEqual(nearbyScheduleCaption(spans, narrowRegion, ""), {
      text: "SPLIT SYSTEM AIR CONDITIONING UNITS",
      bbox: [539, 350, 548, 529],
    });
  });

  it("does not promote arbitrary prose ending in UNITS", () => {
    const spans = [{ str: "PROVIDE TWO SPARE UNITS", x: 770, y: 260, w: 12, h: 120, rot: 90 }];
    assert.equal(nearbyScheduleCaption(spans, region, ""), null);
  });

  it("does not prepend an aligned attribute header to an already-complete caption", () => {
    const spans = [
      { str: "NOMINAL OPERATING", x: 754, y: 215, w: 12, h: 35, rot: 90 },
      { str: "PACKAGED AIR COOLED CHILLER SCHEDULE", x: 770, y: 260, w: 12, h: 210, rot: 90 },
    ];
    assert.deepEqual(nearbyScheduleCaption(spans, region, ""), {
      text: "PACKAGED AIR COOLED CHILLER SCHEDULE",
      bbox: [770, 260, 782, 470],
    });
  });

  it("reconstructs real truncated vertical title suffixes rather than keeping only their last run", () => {
    const spans = [
      { str: "GRILLE, REGIST", x: 770, y: 267, w: 9, h: 67, rot: 90 },
      { str: "ER AND DIFFUSER SCHEDULE", x: 770, y: 334, w: 9, h: 129, rot: 90 },
    ];
    assert.deepEqual(nearbyScheduleCaption(spans, region, ""), {
      text: "GRILLE, REGIST ER AND DIFFUSER SCHEDULE",
      bbox: [770, 267, 779, 463],
    });
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
