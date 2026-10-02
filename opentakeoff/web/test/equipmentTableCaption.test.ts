/**
 * AS-149: a drawing sheet that prints an equipment table's caption without
 * the word SCHEDULE. 23_GA's M601 prints HEAT PUMP UNITS over a ruled table
 * whose first column head is TAG, 370pt left of the centred caption; a detail
 * label on the same sheet makes it an `elevation`, and its heat pump was
 * never offered to vectorgrid. The spans below sit where M601 prints them.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sheetHasEquipmentTableCaption } from "../src/lib/scheduleLanguageScan.ts";

const span = (str: string, x: number, y: number, h = 12) => ({ str, x, y, w: 0.6 * h * str.length, h });
const caption = (text: string) => span(text, 3135, 2142, 36);
const tag = span("TAG", 2737, 2235);

describe("AS-149: an equipment table captioned as the units it lists", () => {
  it("reads 23_GA's HEAT PUMP UNITS over its TAG column", () => {
    assert.equal(sheetHasEquipmentTableCaption([caption("HEAT PUMP UNITS"), tag, span("CAPACITY", 2900, 2235)]), true);
  });

  it("reads a caption drafted in two runs, and EQUIPMENT for UNITS", () => {
    assert.equal(sheetHasEquipmentTableCaption([span("FAN COIL", 3135, 2142, 36), span("UNITS", 3330, 2142, 36), tag]), true);
    assert.equal(sheetHasEquipmentTableCaption([caption("ROOFTOP EQUIPMENT"), span("MARK", 2737, 2235)]), true);
  });

  it("refuses a detail's own label: one unit, no column under it", () => {
    assert.equal(sheetHasEquipmentTableCaption([caption("AIR HANDLING UNIT"), tag]), false);
    assert.equal(sheetHasEquipmentTableCaption([caption("CONNECT CONDENSING UNIT"), tag]), false);
  });

  it("reads a one-unit schedule captioned as its unit over a row of column heads (095_UT H-001)", () => {
    const heads = ["COOLING", "ACFM", "ESP", "HEATING", "ELECTRICAL", "MCA", "MOCP"].map((h, i) => span(h, 2860 + 120 * i, 2232));
    assert.equal(sheetHasEquipmentTableCaption([caption("ROOFTOP PACKAGED AIR CONDITIONING UNIT"), span("SYMBOL", 2737, 2235), ...heads]), true);
  });

  it("refuses a one-unit label whose mark sits among words that name no quantity", () => {
    const callouts = ["SUPPLY", "RETURN", "CURB", "FLASHING", "DUCT"].map((h, i) => span(h, 2860 + 120 * i, 2232));
    assert.equal(sheetHasEquipmentTableCaption([caption("ROOFTOP PACKAGED AIR CONDITIONING UNIT"), span("TAG", 2737, 2235), ...callouts]), false,
      "a detail's callouts beside its TAG");
    // 001_NC's abbreviations list: "CRAH  COMPUTER ROOM AIR HANDLING UNIT" over a MARK symbol in the legend.
    const legend = ["DDC", "DIRECT DIGITAL CONTROL", "H", "O", "T", "9."].map((h, i) => span(h, 2860 + 120 * i, 2232));
    assert.equal(sheetHasEquipmentTableCaption([caption("CRAH COMPUTER ROOM AIR HANDLING UNIT"), span("MARK", 2737, 2235), ...legend]), false);
  });

  it("refuses a note's line and a cross-reference", () => {
    assert.equal(sheetHasEquipmentTableCaption([caption("PROVIDE NEW ROOFTOP UNITS"), tag]), false);
    assert.equal(sheetHasEquipmentTableCaption([caption("SEE FAN COIL UNITS"), tag]), false);
  });

  it("refuses a caption no mark column sits under", () => {
    assert.equal(sheetHasEquipmentTableCaption([caption("HEAT PUMP UNITS")]), false);
    assert.equal(sheetHasEquipmentTableCaption([caption("HEAT PUMP UNITS"), span("TAG", 2737, 2900)]), false, "a TAG far below is another table's");
    assert.equal(sheetHasEquipmentTableCaption([caption("HEAT PUMP UNITS"), span("TAG", 2737, 2000)]), false, "a TAG above is not under it");
  });

  it("refuses words that are no HVAC system's", () => {
    assert.equal(sheetHasEquipmentTableCaption([caption("STORAGE UNITS"), tag]), false);
  });
});
