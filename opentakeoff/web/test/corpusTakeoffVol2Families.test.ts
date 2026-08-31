/**
 * Vol2 set-agnostic family keyRe / title gates (shared UI+MCP path).
 * Marks drawn from NIST / Missoula / APHIS-style schedules — no set IDs in product code.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HVAC_FAMILY_SPECS } from "../src/lib/corpusTakeoff.mjs";

describe("Vol2 RTU packaged title", () => {
  it("matches PACKAGED EQUIPMENT SCHEDULE (RTU)", () => {
    const { titleRe, keyRe } = HVAC_FAMILY_SPECS.RTU;
    assert.equal(titleRe.test("PACKAGED EQUIPMENT SCHEDULE (RTU)"), true);
    assert.equal(keyRe.test("RTU-101"), true);
  });
});

describe("Vol2 FAN / UNIT_HEATER / DUCT_MOUNTED_COIL keyRe", () => {
  it("FAN accepts zone-lettered S-/R- marks, DSF, and EG", () => {
    const { keyRe } = HVAC_FAMILY_SPECS.FAN;
    for (const m of ["S-A-1", "S-A-6", "R-A-1", "DSF-A1", "EG-2", "SEF-A1", "EF-A1", "KEF-1"]) {
      assert.equal(keyRe.test(m), true, m);
    }
    assert.equal(keyRe.test("AHU-1"), false);
    assert.equal(keyRe.test("HC-A-1"), false);
  });

  it("UNIT_HEATER accepts ECUH / HWUH / EDH and duct-heater titles", () => {
    const { keyRe, titleRe } = HVAC_FAMILY_SPECS.UNIT_HEATER;
    for (const m of ["ECUH-B1", "HWUH-A1", "EDH-1", "UH-1", "CUH-1", "GUH-1"]) {
      assert.equal(keyRe.test(m), true, m);
    }
    assert.equal(titleRe.test("ELECTRIC UNIT HEATER SCHEDULE"), true);
    assert.equal(titleRe.test("HOT WATER UNIT HEATER SCHEDULE"), true);
    assert.equal(titleRe.test("EQUIPMENT CONNECTION SCHEDULE - DUCT HEATERS"), true);
    assert.equal(keyRe.test("EF-1"), false);
  });

  it("DUCT_MOUNTED_COIL accepts HWC-* hot-water coil marks", () => {
    const { keyRe, titleRe } = HVAC_FAMILY_SPECS.DUCT_MOUNTED_COIL;
    assert.equal(keyRe.test("HWC-A2"), true);
    assert.equal(keyRe.test("HC-1"), true);
    assert.equal(titleRe.test("BASE BID: MULTI-ZONE AHU HOT WATER HEATING COIL SCHEDULE"), true);
    assert.equal(keyRe.test("AHU-A1"), false);
  });
});
