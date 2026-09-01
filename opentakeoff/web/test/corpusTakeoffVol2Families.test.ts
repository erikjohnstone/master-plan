/**
 * Vol2 set-agnostic family keyRe / title gates (shared UI+MCP path).
 * Marks drawn from NIST / Missoula / APHIS-style schedules — no set IDs in product code.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HVAC_FAMILY_SPECS,
  markCoreForKeyRe,
} from "../src/lib/corpusTakeoff.mjs";

describe("Vol2 RTU packaged title", () => {
  it("matches PACKAGED EQUIPMENT SCHEDULE (RTU)", () => {
    const { titleRe } = HVAC_FAMILY_SPECS.RTU;
    assert.equal(titleRe.test("PACKAGED EQUIPMENT SCHEDULE (RTU)"), true);
    assert.equal(titleRe.test("ROOFTOP UNIT SCHEDULE"), true);
  });
});

describe("Vol2 building-prefix mark core", () => {
  it("strips WHSE-/AREA- style prefixes before keyRe", () => {
    assert.equal(markCoreForKeyRe("WHSE-ET-1"), "ET-1");
    assert.equal(markCoreForKeyRe("WHSE-EUH-1"), "EUH-1");
    assert.equal(markCoreForKeyRe("WHSE-SH1"), "SH1");
    assert.equal(markCoreForKeyRe("WHSE-CC-1"), "CC-1");
    assert.equal(markCoreForKeyRe("WHSE-CC-15-6"), "CC-15-6");
    assert.equal(markCoreForKeyRe("AHU-1"), "AHU-1");
    // Do not treat equipment-family ST- as a building prefix (ST-H-3 ≠ H-3).
    assert.equal(markCoreForKeyRe("ST-H-3"), "ST-H-3");
    // Catalog / model strings must not strip to a fake EP-* pump mark.
    assert.equal(markCoreForKeyRe("TPLFY-EP15NEM4"), "TPLFY-EP15NEM4");
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
    for (const m of ["ECUH-B1", "HWUH-A1", "EDH-1", "UH-1", "CUH-1", "GUH-1", "EUH-1"]) {
      assert.equal(keyRe.test(m), true, m);
    }
    assert.equal(titleRe.test("ELECTRIC UNIT HEATER SCHEDULE"), true);
    assert.equal(titleRe.test("HOT WATER UNIT HEATER SCHEDULE"), true);
    assert.equal(titleRe.test("EQUIPMENT CONNECTION SCHEDULE - DUCT HEATERS"), true);
    assert.equal(keyRe.test("EF-1"), false);
  });

  it("DUCT_MOUNTED_COIL accepts HWC/PHC/RHC coil marks", () => {
    const { keyRe, titleRe } = HVAC_FAMILY_SPECS.DUCT_MOUNTED_COIL;
    assert.equal(keyRe.test("HWC-A2"), true);
    assert.equal(keyRe.test("HC-1"), true);
    assert.equal(keyRe.test("PHC-1"), true);
    assert.equal(keyRe.test("RHC-2"), true);
    assert.equal(titleRe.test("BASE BID: MULTI-ZONE AHU HOT WATER HEATING COIL SCHEDULE"), true);
    assert.equal(keyRe.test("AHU-A1"), false);
  });
});

describe("Vol2 humidifier / expansion / buffer / VRF gates", () => {
  it("HUMIDIFIER accepts OCR HUMIDIFER and SH-* steam marks", () => {
    const { titleRe, keyRe } = HVAC_FAMILY_SPECS.HUMIDIFIER;
    assert.equal(titleRe.test("STEAM HUMIDIFER SCHEDULE"), true);
    assert.equal(titleRe.test("HUMIDIFIER SCHEDULE"), true);
    assert.equal(keyRe.test("SH-1"), true);
    assert.equal(keyRe.test("SH1"), true);
    assert.equal(keyRe.test("HUM-1"), true);
    assert.equal(keyRe.test("H-A-3"), true);
    // Bare H requires hyphen — do not steal HC-/HP-/HWC-* coils.
    assert.equal(keyRe.test("HC-A1"), false);
    assert.equal(keyRe.test("HP-1"), false);
    assert.equal(keyRe.test("HWC-1"), false);
    // Steam traps ST-H-* and sheet headers SHT. NO. are not humidifiers.
    assert.equal(keyRe.test("ST-H-3"), false);
    assert.equal(keyRe.test("SHT. NO."), false);
    assert.equal(keyRe.test("SHT.NO."), false);
  });

  it("EXPANSION_TANK accepts EXPANSION SYSTEM titles and ET-*", () => {
    const { titleRe, keyRe } = HVAC_FAMILY_SPECS.EXPANSION_TANK;
    assert.equal(titleRe.test("EXPANSION SYSTEM SCHEDULE"), true);
    assert.equal(keyRe.test("ET-1"), true);
    assert.equal(keyRe.test("ET-A1"), true);
    assert.equal(keyRe.test("ETC. NOT SHOWN ON DRAWINGS"), false);
  });

  it("BUFFER_TANK accepts GST-* glycol/storage marks", () => {
    const { keyRe } = HVAC_FAMILY_SPECS.BUFFER_TANK;
    assert.equal(keyRe.test("BT-1"), true);
    assert.equal(keyRe.test("GST-1"), true);
  });

  it("VRF_INDOOR / VRF_OUTDOOR match titled schedules and IDU/ODU marks", () => {
    assert.equal(HVAC_FAMILY_SPECS.VRF_INDOOR.titleRe.test("VRF INDOOR UNIT SCHEDULE"), true);
    assert.equal(HVAC_FAMILY_SPECS.VRF_OUTDOOR.titleRe.test("VRF OUTDOOR UNIT SCHEDULE"), true);
    assert.equal(HVAC_FAMILY_SPECS.VRF_INDOOR.keyRe.test("IDU-1"), true);
    assert.equal(HVAC_FAMILY_SPECS.VRF_OUTDOOR.keyRe.test("ODU-1"), true);
  });

  it("PUMP / AIR_SEPARATOR / HEAT_EXCHANGER accept Vol2 title forms", () => {
    assert.equal(HVAC_FAMILY_SPECS.PUMP.titleRe.test("HEATING HOT WATER PUMP"), true);
    assert.equal(HVAC_FAMILY_SPECS.PUMP.titleRe.test("HEAT PUMP"), false);
    assert.equal(HVAC_FAMILY_SPECS.AIR_SEPARATOR.titleRe.test("AIR SEPARATORS"), true);
    assert.equal(HVAC_FAMILY_SPECS.AIR_SEPARATOR.keyRe.test("IAS-2-1"), true);
    assert.equal(HVAC_FAMILY_SPECS.HEAT_EXCHANGER.titleRe.test("(N) HEAT EXCHANGER SCHEDULE"), true);
  });

  it("HHW_CONTROL_VALVE altTitle claims bare VALVE SCHEDULE + V-HHW marks", () => {
    const { altTitleRe, altKeyRe } = HVAC_FAMILY_SPECS.HHW_CONTROL_VALVE;
    assert.equal(altTitleRe.test("VALVE SCHEDULE"), true);
    assert.equal(altTitleRe.test("(N) VALVE SCHEDULE"), true);
    // Must not steal primary CHW/HHW CONTROL VALVE SCHEDULE matching.
    assert.equal(altTitleRe.test("CHW CONTROL VALVE SCHEDULE"), false);
    assert.equal(altTitleRe.test("HHW CONTROL VALVE SCHEDULE"), false);
    assert.equal(altKeyRe.test("V-HHWR-11"), true);
    assert.equal(altKeyRe.test("V-CHW-1"), false);
  });
});
