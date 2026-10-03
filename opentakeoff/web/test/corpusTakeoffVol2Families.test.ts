/**
 * Vol2 set-agnostic family keyRe / title gates (shared UI+MCP path).
 * Marks drawn from NIST / Missoula / APHIS-style schedules — no set IDs in product code.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HVAC_FAMILY_SPECS,
  markCoreForKeyRe,
  markFormsForKeyRe,
  isScheduleHeaderJunkMark,
  compileHvacTakeoff,
  expandEquipMarkRange,
  expandEquipMarks,
  markLetters,
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

  // GOAL.md rule 39: 089_FL_Airport_Terminal_and_Hangar_Development's real
  // "VRF SYSTEM SCHEDULE" lists 12 real indoor air handlers (AC-1..AC-12)
  // in one combined table, not the split VRF INDOOR/OUTDOOR titled shape
  // above — titleRe alone can't reach it, so it needs the same
  // altTitleRe/altKeyRe split-title mechanism already proven for
  // CONDENSING_UNIT's CU/DCU marks.
  it("VRF_INDOOR altTitleRe/altKeyRe reach AC-* rows on a combined VRF SYSTEM SCHEDULE", () => {
    const { altTitleRe, altKeyRe, titleRe } = HVAC_FAMILY_SPECS.VRF_INDOOR;
    assert.ok(altTitleRe, "VRF_INDOOR must declare altTitleRe");
    assert.ok(altKeyRe, "VRF_INDOOR must declare altKeyRe");
    assert.equal(altTitleRe!.test("VRF SYSTEM SCHEDULE"), true);
    // The combined title must NOT also satisfy the split-schedule primary
    // titleRe — these are two different real table shapes.
    assert.equal(titleRe.test("VRF SYSTEM SCHEDULE"), false);
    assert.equal(altKeyRe!.test("AC-1"), true);
    assert.equal(altKeyRe!.test("AC-12"), true);
    // Do not let the alt path steal unrelated AC-prefixed marks from a
    // different real family sharing the same page (e.g. AHU's own AC-*
    // convention on a genuinely different titled table) — altKeyRe only
    // ever applies when altTitleRe itself matched this exact table's title.
    assert.equal(altKeyRe!.test("ACCU-1"), false);
  });

  it("DUCT_MOUNTED_COIL accepts ELECTRIC DUCT COIL + DH-* marks", () => {
    assert.equal(HVAC_FAMILY_SPECS.DUCT_MOUNTED_COIL.titleRe.test("ELECTRIC DUCT COIL SCHEDULE"), true);
    assert.equal(HVAC_FAMILY_SPECS.DUCT_MOUNTED_COIL.keyRe.test("DH-1"), true);
    assert.equal(HVAC_FAMILY_SPECS.DUCT_MOUNTED_COIL.exclude.test("ELECTRIC DUCT HEATER"), true);
  });

  it("PUMP / AIR_SEPARATOR / HEAT_EXCHANGER accept Vol2 title forms", () => {
    assert.equal(HVAC_FAMILY_SPECS.PUMP.titleRe.test("HEATING HOT WATER PUMP"), true);
    assert.equal(HVAC_FAMILY_SPECS.PUMP.titleRe.test("HEAT PUMP"), false);
    assert.equal(HVAC_FAMILY_SPECS.AIR_SEPARATOR.titleRe.test("AIR SEPARATORS"), true);
    assert.equal(HVAC_FAMILY_SPECS.AIR_SEPARATOR.keyRe.test("IAS-2-1"), true);
    assert.equal(HVAC_FAMILY_SPECS.HEAT_EXCHANGER.titleRe.test("(N) HEAT EXCHANGER SCHEDULE"), true);
  });

  it("schedule header junk marks (MODEL/TAG) are rejected; set-local HX marks kept", () => {
    assert.equal(isScheduleHeaderJunkMark("MODEL"), true);
    assert.equal(isScheduleHeaderJunkMark("TAG"), true);
    assert.equal(isScheduleHeaderJunkMark("MIN."), true);
    assert.equal(isScheduleHeaderJunkMark("HX-1A"), false);
    assert.equal(isScheduleHeaderJunkMark("B950A"), false);
    // Letter-suffixed building tags (no digits) must not be treated as junk.
    assert.equal(isScheduleHeaderJunkMark("CV-CHW-BP-A"), false);
    // A size with its metric equivalent is a hanger/duct table's row (054_NV), never a unit.
    for (const size of ["1-2[25-50]", "2-1/2-5[65-125]", "10X20[250X500]", "6 - 8 [150 - 200]"]) assert.equal(isScheduleHeaderJunkMark(size), true, size);
    for (const mark of ["1", "12", "EF-1", "AHU-1[E]", "CU-1"]) assert.equal(isScheduleHeaderJunkMark(mark), false, mark);
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

// AS-62: marks the family rules read as no unit (named by AS-61) — a numbered
// or coded building token (05_MO's 1-VAV-1, 041_IL's 40-AHU-2, 031_MO's
// W05-TU-01, 067_CA's B950-AHU-3001), a building letter between the family
// token and the number (074_CA's FC-A-2), exhaust fans named by a qualifier
// before EF (096_IN's PEF-1, JEF-1) and TU terminal units.
describe("AS-62 building tokens, building letters, qualified exhaust fans, TU terminals", () => {
  it("strips a numbered or coded building token, as it strips WHSE-", () => {
    for (const [mark, core] of [["1-VAV-1", "VAV-1"], ["40-AHU-2", "AHU-2"], ["W05-TU-01", "TU-01"], ["WC01A-TU-05", "TU-05"], ["B950-AHU-3001", "AHU-3001"], ["1-TU-28-1", "TU-28-1"], ["1-CU-28", "CU-28"],
      // A temporary unit: TEMP, perhaps a letter, after the number (AS-157).
      ["1-AC-36TEMP", "AC-36TEMP"], ["1-EF-36TEMPA", "EF-36TEMPA"]]) {
      assert.equal(markCoreForKeyRe(mark), core, mark);
    }
    // Not a building token, or not a short equipment mark after it.
    for (const mark of ["1-1/2", "2-WAY", "460-3-60", "10-HP", "1234-AHU-1", "ST-H-3", "TPLFY-EP15NEM4", "1-AC-36TEMPORARY", "1-AC-36TEMPAB"]) {
      assert.equal(markCoreForKeyRe(mark), mark, mark);
    }
  });

  it("reads a building letter between the family token and the number", () => {
    assert.deepEqual(markFormsForKeyRe("FC-A-2"), ["FC-A-2", "FC-2"]);
    assert.deepEqual(markFormsForKeyRe("FC-A-13-1"), ["FC-A-13-1", "FC-13-1"]);
    // A building token and a building letter together are left alone: no
    // document prints one, and the rule reads one convention at a time.
    assert.deepEqual(markFormsForKeyRe("1-FC-B-4"), ["1-FC-B-4"]);
    // A one-letter family token keeps its letter (E-A-1 is no EF), and a
    // steam trap's building letter reads as no humidifier.
    assert.deepEqual(markFormsForKeyRe("E-A-1"), ["E-A-1"]);
    assert.equal(markFormsForKeyRe("ST-H-3").some((f) => HVAC_FAMILY_SPECS.HUMIDIFIER.keyRe.test(f)), false);
    // Without its letter the rest must still be a short equipment mark: a
    // five-digit number is a model or a part, and reads as no pump.
    assert.deepEqual(markFormsForKeyRe("HWP-A-12345"), ["HWP-A-12345"]);
    assert.deepEqual(markFormsForKeyRe("HWP-A-1"), ["HWP-A-1", "HWP-1"]);
  });

  it("FAN reads an exhaust fan named by a one- or two-letter qualifier before EF", () => {
    const { keyRe } = HVAC_FAMILY_SPECS.FAN;
    for (const m of ["PEF-1", "JEF-6", "BEF-2", "CEF1", "KEF-1", "GEF-2"]) assert.equal(keyRe.test(m), true, m);
    for (const m of ["BF-1", "HEF", "DEF", "PEFX-1", "AHU-1", "HC-A-1"]) assert.equal(keyRe.test(m), false, m);
  });

  it("VAV reads TU-n terminal units, never a TU word", () => {
    const { keyRe } = HVAC_FAMILY_SPECS.VAV;
    for (const m of ["TU-01", "TU-28-1", "TU1"]) assert.equal(keyRe.test(m), true, m);
    for (const m of ["TU", "TUB-1", "TURN", "A"]) assert.equal(keyRe.test(m), false, m);
  });

  it("compiles those rows as units under their schedule's family, each mark as printed", () => {
    const row = (key: string) => ({ key, cells: { MARK: { text: key } } });
    const graph = {
      tables: [
        { kind: "equipment", sheet: "m.pdf#40", title: { text: "SINGLE DUCT AIR TERMINAL UNIT SCHEDULE" }, rows: ["ATU-6-1", "1-TU-28-1", "W05-TU-01", "A"].map(row) },
        { kind: "equipment", sheet: "m.pdf#39", title: { text: "AIR HANDLING UNIT SCHEDULE" }, rows: ["AC-57", "1-AC-15", "40-AHU-2", "1-AC-36TEMP"].map(row) },
        { kind: "equipment", sheet: "m.pdf#21", title: { text: "EXHAUST FAN SCHEDULE" }, rows: ["KEF-1", "PEF-1", "JEF-1", "BF-1"].map(row) },
        { kind: "equipment", sheet: "m.pdf#25", title: { text: "DUCTED FAN COIL UNITS" }, rows: ["FC-A-2", "FC-A-13-1"].map(row) },
        { kind: "equipment", sheet: "m.pdf#2", title: { text: "" }, rows: ["1-1/2", "2-WAY", "460-3-60"].map(row) },
      ],
    };
    const cats = compileHvacTakeoff(null, graph).categories as Record<string, { items: Array<{ tag: string }> }>;
    const tags = (f: string) => cats[f].items.map((i) => i.tag).sort();
    assert.deepEqual(tags("VAV"), ["1-TU-28-1", "ATU-6-1", "W05-TU-01"]);
    assert.deepEqual(tags("AHU"), ["1-AC-15", "1-AC-36TEMP", "40-AHU-2", "AC-57"]);
    // BF-1 is no fan mark by FAN's rule, but a FAN SCHEDULE title vouches for it (AS-63).
    assert.deepEqual(tags("FAN"), ["BF-1", "JEF-1", "KEF-1", "PEF-1"]);
    assert.deepEqual(tags("FCU"), ["FC-A-13-1", "FC-A-2"]);
    const all = Object.values(cats).flatMap((c) => c.items.map((i) => i.tag));
    for (const t of ["A", "1-1/2", "2-WAY", "460-3-60"]) assert.equal(all.includes(t), false, t);
  });
});

// AS-64: a numbered or coded building followed by its floor or wing before
// the family's mark (036_LA's DUCTLESS SPLIT SYSTEM SCHEDULE prints all 34 of
// its units so: 01-1-DAC-1, 05-B-DAC-1, 136-1-DAC-1), and marks a family's
// own title vouches for: an air-cooled chiller's ACCH-1 (087_US), fan coils
// FCC1-1 beside FCU1-3 (028_TX) and a humidifier HUM-A (061_IA).
describe("AS-64 a building and its floor or wing before the mark; ACCH, FCC and HUM-A under their titles", () => {
  it("strips a building and its floor or wing when the rest is a short equipment mark", () => {
    for (const [mark, core] of [["01-1-DAC-1", "DAC-1"], ["05-B-DAC-1", "DAC-1"], ["136-1-DAC-1", "DAC-1"], ["07-A-CU-1", "CU-1"], ["A1-2-AHU-1", "AHU-1"], ["2-12-VAV-3", "VAV-3"], ["01-1-AC-36TEMP", "AC-36TEMP"]]) {
      assert.equal(markCoreForKeyRe(mark), core, mark);
    }
    // A unit's own mark before another's is no building (AHU-1-SF-1,
    // CH-1-CHWP-1); three location tokens, a floor of three digits, a wing of
    // two letters and numbers are left alone, as is AS-62's
    // building token beside a building letter. One prefix is read at a time:
    // an area token, then a building and floor, is left alone.
    for (const mark of ["AHU-1-SF-1", "CH-1-CHWP-1", "12-3-4-AHU-1", "1-100-AHU-1", "1-AB-AHU-1", "460-3-60", "1-2-3", "1-FC-B-4", "WHSE-AB1-2-AHU-1"]) {
      assert.equal(markCoreForKeyRe(mark), mark, mark);
    }
  });

  it("compiles those rows under their schedule's family, each mark as printed, and ACCH, FCC and HUM-A only under their titles", () => {
    const row = (key: string) => ({ key, cells: { MARK: { text: key } } });
    const table = (sheet: string, title: string, keys: string[]) => ({ kind: "equipment", sheet, title: { text: title }, rows: keys.map(row) });
    const cats = compileHvacTakeoff(null, { tables: [
      table("m.pdf#63", "DUCTLESS SPLIT SYSTEM SCHEDULE", ["01-1-DAC-1", "05-B-DAC-1", "136-1-DAC-1", "01-1-DAC-36TEMP"]),
      table("m.pdf#2", "AIR-COOLED CHILLER SCHEDULE", ["ACCH-1"]),
      table("m.pdf#3", "CHILLED WATER FAN COIL UNIT SCHEDULE", ["FCC1-1", "FCU1-3", "FCC2-10"]),
      table("m.pdf#4", "HUMIDIFIER SCHEDULE", ["HUM-A"]),
      table("m.pdf#9", "", ["ACCH-2", "02-1-DAC-1", "03-1-CU-1", "FCC1-5", "HUM-B"]),
      table("m.pdf#11", "EQUIPMENT SCHEDULE", ["ACCH-4", "04-1-DAC-1", "FCC1-6", "HUM-C"]),
      table("m.pdf#12", "EXHAUST FAN SCHEDULE", ["FCC1-7", "HUM-D"]),
    ] }).categories as Record<string, { items: Array<{ tag: string }> }>;
    const tags = (f: string) => (cats[f]?.items || []).map((i) => i.tag).sort();
    assert.deepEqual(tags("FCU"), ["01-1-DAC-1", "01-1-DAC-36TEMP", "05-B-DAC-1", "136-1-DAC-1", "FCC1-1", "FCC2-10", "FCU1-3"]);
    assert.deepEqual(tags("AIR_COOLED_CHILLER"), ["ACCH-1"]);
    assert.deepEqual(tags("HUMIDIFIER"), ["HUM-A"]);
    // An untitled table reads a building and floor before the family's own
    // untitled rule, as it reads AS-62's building token (1-CU-28).
    assert.deepEqual(tags("CONDENSING_UNIT"), ["03-1-CU-1"]);
    // Nowhere else: DAC-*, ACCH-*, FCC-* and HUM with a letter are read only
    // under their own titles.
    const all = Object.values(cats).flatMap((c) => c.items.map((i) => i.tag));
    for (const t of ["ACCH-2", "ACCH-4", "02-1-DAC-1", "04-1-DAC-1", "FCC1-5", "FCC1-6", "FCC1-7", "HUM-B", "HUM-C", "HUM-D"]) assert.equal(all.includes(t), false, t);
  });
});

// 041_IL's STEAM HUMIDIFER SCHEDULE stacks its two humidifiers in one MARK
// cell, "40-HM-1" over "40-HM-2", which the extraction keys 40-HM-140-HM-2.
describe("a humidifier's HM-n, a hot water heater's HWH-n, an energy recovery coil's ERC-n under their titles; two stacked after a building's number", () => {
  it("reads both humidifiers, and HM-n under no other title", () => {
    const table = (sheet: string, title: string, rows: Array<[string, string]>) => ({
      kind: "equipment", sheet, title: { text: title }, rows: rows.map(([key, mark]) => ({ key, cells: { MARK: { text: mark } } })),
    });
    const cats = compileHvacTakeoff(null, { tables: [
      table("m.pdf#26", "STEAM HUMIDIFER SCHEDULE", [["40-HM-140-HM-2", "40-HM-1 40-HM-2"]]),
      table("m.pdf#27", "EQUIPMENT SCHEDULE", [["HM-3", "HM-3"]]),
      table("m.pdf#28", "EXHAUST FAN SCHEDULE", [["HM-4", "HM-4"]]),
    ] }).categories as Record<string, { items: Array<{ tag: string }> }>;
    assert.deepEqual((cats.HUMIDIFIER?.items || []).map((i) => i.tag).sort(), ["40-HM-1", "40-HM-2"]);
    const all = Object.values(cats).flatMap((c) => c.items.map((i) => i.tag));
    for (const t of ["HM-3", "HM-4"]) assert.equal(all.includes(t), false, t);
  });

  // 041_IL's ELECTRIC DOMESTIC WATER HEATER SCHEDULE (40-HWH-02) and GLYCOL
  // WATER ENERGY RECOVERY COIL SCHEDULE (40-ERC-1).
  it("reads a hot water heater HWH-n and an energy recovery coil ERC-n under their titles alone", () => {
    const table = (sheet: string, title: string, keys: string[]) => ({
      kind: "equipment", sheet, title: { text: title }, rows: keys.map((key) => ({ key, cells: { MARK: { text: key } } })),
    });
    const cats = compileHvacTakeoff(null, { tables: [
      table("m.pdf#17", "ELECTRIC DOMESTIC WATER HEATER SCHEDULE", ["40-HWH-02"]),
      table("m.pdf#26", "GLYCOL WATER ENERGY RECOVERY COIL SCHEDULE", ["40-ERC-1"]),
      table("m.pdf#27", "EQUIPMENT SCHEDULE", ["HWH-3", "ERC-3"]),
      table("m.pdf#28", "EXHAUST FAN SCHEDULE", ["HWH-4", "ERC-4"]),
    ] }).categories as Record<string, { items: Array<{ tag: string }> }>;
    assert.deepEqual((cats.WATER_HEATER?.items || []).map((i) => i.tag), ["40-HWH-02"]);
    assert.deepEqual((cats.DUCT_MOUNTED_COIL?.items || []).map((i) => i.tag), ["40-ERC-1"]);
    assert.deepEqual(cats.ERV?.items || [], []);
    const all = Object.values(cats).flatMap((c) => c.items.map((i) => i.tag));
    for (const t of ["HWH-3", "ERC-3", "HWH-4", "ERC-4"]) assert.equal(all.includes(t), false, t);
  });
});

describe("AS-63 marks a schedule's title vouches for, and units listed in another family's schedule", () => {
  const row = (key: string) => ({ key, cells: { MARK: { text: key } } });
  const table = (sheet: string, title: string, keys: string[]) => ({ kind: "equipment", sheet, title: { text: title }, rows: keys.map(row) });
  const compile = (tables: unknown[]) => {
    const cats = compileHvacTakeoff(null, { tables }).categories as Record<string, { items: Array<{ tag: string }> }>;
    return (f: string) => (cats[f]?.items || []).map((i) => i.tag).sort();
  };

  it("reads under the family's own title what its untitled rule reads (CD-1 in a CONTROL DAMPER SCHEDULE)", () => {
    const tags = compile([table("m.pdf#5", "CONTROL DAMPER SCHEDULE", ["CD-1", "MD-2", "OA-1", "SPARE"])]);
    assert.deepEqual(tags("CONTROL_DAMPER"), ["CD-1", "MD-2", "OA-1"]);
  });

  it("reads the marks a family's title vouches for, and only under that title", () => {
    const tags = compile([
      table("m.pdf#1", "RETURN FAN SCHEDULE", ["E-A-1", "F-2", "BF-3"]),
      table("m.pdf#2", "DISPOSABLE CYLINDER ELECTRIC HUMIDIFIER SCHEDULE", ["HF-4"]),
      table("m.pdf#3", "ELECTRIC UNIT HEATER SCHEDULE", ["EWH-1", "SUH-2"]),
      table("m.pdf#4", "DUCTLESS SPLIT SYSTEM SCHEDULE", ["DAC-1"]),
      table("m.pdf#5", "SPLIT SYSTEM AIR CONDITIONING UNIT SCHEDULE", ["SS-1/SSCU-1"]),
      table("m.pdf#6", "AIR COOLED CHILLER SCHEDULE", ["CH-1", "ACC-2"]),
      table("m.pdf#7", "STEAM HEATING COIL SCHEDULE", ["1-RH-1", "1-SHC-28", "1-SHC-36TEMP"]),
      table("m.pdf#8", "DIRECT EXPANSION COOLING COIL SCHEDULE", ["1-DXC-28"]),
    ]);
    assert.deepEqual(tags("FAN"), ["BF-3", "E-A-1", "F-2"]);
    assert.deepEqual(tags("HUMIDIFIER"), ["HF-4"]);
    assert.deepEqual(tags("UNIT_HEATER"), ["EWH-1", "SUH-2"]);
    assert.deepEqual(tags("FCU"), ["DAC-1", "SS-1"]);
    assert.deepEqual(tags("CONDENSING_UNIT"), ["SSCU-1"]);
    assert.deepEqual(tags("AIR_COOLED_CHILLER"), ["ACC-2", "CH-1"]);
    assert.deepEqual(tags("DUCT_MOUNTED_COIL"), ["1-DXC-28", "1-RH-1", "1-SHC-28", "1-SHC-36TEMP"]);
    // Nowhere else: an untitled or general table reads none of them as these
    // families' (ACC-* there is an air-cooled condenser; EWH-* a water heater).
    const loose = compile([
      table("m.pdf#9", "", ["E-A-1", "BF-3", "HF-4", "SUH-2", "DAC-1", "RH-1", "SHC-28", "ACC-2"]),
      table("m.pdf#10", "EQUIPMENT SCHEDULE", ["E-A-5", "HF-5", "DAC-2", "RH-2"]),
      table("m.pdf#11", "GAS WATER HEATER SCHEDULE", ["EWH-3"]),
    ]);
    for (const f of ["FAN", "HUMIDIFIER", "UNIT_HEATER", "FCU", "DUCT_MOUNTED_COIL", "AIR_COOLED_CHILLER"]) assert.deepEqual(loose(f), [], f);
    assert.deepEqual(loose("CONDENSING_UNIT"), ["ACC-2"]);
    assert.deepEqual(loose("WATER_HEATER"), ["EWH-3"]);
  });

  it("reads a family's own units in another family's schedule, and no other row there", () => {
    const tags = compile([
      table("m.pdf#19", "AIR HANDLING UNIT SYSTEM INDEX SCHEDULE", ["DOAS-1", "DOAS-2", "AHU-4"]),
      table("m.pdf#20", "AIR COOLED CHILLER SCHEDULE", ["CH-1", "CH-2", "HRC-1"]),
      table("m.pdf#64", "SPLIT SYSTEM AIR HANDLER UNIT SCHEDULE", ["FCU-1/HP-1", "FCU-2/HP-2"]),
    ]);
    assert.deepEqual(tags("DOAS"), ["DOAS-1", "DOAS-2"]);
    assert.deepEqual(tags("AHU"), ["AHU-4"]);
    assert.deepEqual(tags("HEAT_RECOVERY_CHILLER"), ["HRC-1"]);
    assert.deepEqual(tags("AIR_COOLED_CHILLER"), ["CH-1", "CH-2"]);
    assert.deepEqual(tags("FCU"), ["FCU-1", "FCU-2"]);
    assert.deepEqual(tags("HEAT_PUMP"), ["HP-1", "HP-2"]);
    // A unit its own schedule defines is read once, citing that schedule.
    const both = compileHvacTakeoff(null, { tables: [
      table("m.pdf#19", "AIR HANDLING UNIT SCHEDULE", ["DOAS-1"]),
      table("m.pdf#21", "DOAS UNIT SCHEDULE", ["DOAS-1"]),
    ] }).categories as Record<string, { items: Array<{ tag: string; sheet_id: string }> }>;
    assert.deepEqual(both.DOAS.items.map((i) => `${i.tag}@${i.sheet_id}`), ["DOAS-1@m.pdf#21"]);
  });

  it("adds only units no printed listing holds, and leaves each unit where its printed listing puts it", () => {
    // CD-1 is printed-read in the untitled damper table (the family's untitled
    // rule) and only vouched for under the CONTROL DAMPER title, read first;
    // DOAS-1 is listed in the air handler index (a host) before an untitled
    // table prints it. Each unit stays with its printed listing, counted once.
    const damperTable = { kind: "equipment", sheet: "m.pdf#6", title: { text: "" },
      rows: [{ key: "CD-1", cells: { MARK: { text: "CD-1" }, SIZE: { text: "12x12" } } }] };
    const cats = compileHvacTakeoff(null, { tables: [
      table("m.pdf#5", "CONTROL DAMPER SCHEDULE", ["CD-1", "MD-2"]),
      table("m.pdf#19", "AIR HANDLING UNIT SYSTEM INDEX SCHEDULE", ["DOAS-1", "DOAS-2"]),
      damperTable,
      table("m.pdf#22", "", ["DOAS-1"]),
    ] }).categories as Record<string, { count: number; items: Array<{ tag: string; sheet_id: string }> }>;
    const cites = (f: string) => cats[f].items.map((i) => `${i.tag}@${i.sheet_id}`);
    assert.deepEqual(cites("CONTROL_DAMPER"), ["CD-1@m.pdf#6", "MD-2@m.pdf#5"]);
    assert.equal(cats.CONTROL_DAMPER.count, 2);
    assert.deepEqual(cites("DOAS"), ["DOAS-1@m.pdf#22", "DOAS-2@m.pdf#19"]);
    assert.equal(cats.DOAS.count, 2);
  });

  it("reads a room code of up to six letters and digits after the number, and a temporary unit's TEMP", () => {
    // The six-letter limit guards the building token's strip: a longer tail
    // behind a building number leaves the mark as printed, read by no rule.
    const tags = compile([table("m.pdf#30", "TWO-PIPE FAN COIL UNIT SCHEDULE", ["001-FCU-01-CG06A", "001-FCU-02-C106A", "001-FCU-03-ROOM101X"])]);
    assert.deepEqual(tags("FCU"), ["001-FCU-01-CG06A", "001-FCU-02-C106A"]);
    assert.equal(markCoreForKeyRe("1-AC-36TEMP"), "AC-36TEMP");
    assert.equal(markCoreForKeyRe("001-FCU-01-CG06A"), "FCU-01-CG06A");
  });
});

// AS-66: a table no title vouches for (untitled, or a general EQUIPMENT,
// SPECIALTY EQUIPMENT or MISCELLANEOUS schedule) holds a family's units only
// by the marks its rows print, so it must be an equipment table, and a mark
// read there must be one.
describe("AS-66 a table no title vouches for: notes, indexes and lists hold no unit, and some marks are another thing's", () => {
  const row = (key: string) => ({ key, cells: { MARK: { text: key } } });
  const table = (sheet: string, title: string, keys: string[], kind = "equipment") => ({ kind, sheet, title: { text: title }, rows: keys.map(row) });
  const compile = (tables: unknown[]) => {
    const cats = compileHvacTakeoff(null, { tables }).categories as Record<string, { items: Array<{ tag: string }> }>;
    return (f: string) => (cats[f]?.items || []).map((i) => i.tag).sort();
  };

  it("reads no unit in an untitled or general table the sheet graph classes as reference or room/finish", () => {
    // 061_IA's steel framing notes (SF1) and special inspection notes (SP1),
    // 08_ME's drawing index (P101), 23_GA's architectural specialty list (T1,
    // a grab bar), 031_MO's JSN list (RF-2, a refrigerator) and occupant
    // loads (WH 1ST FLR).
    const tags = compile([
      table("s.pdf#6", "", ["SF1", "SF2"], "reference"),
      table("s.pdf#6", "", ["SP1", "SP2"], "reference"),
      table("g.pdf#1", "", ["P101", "P102"], "reference"),
      table("a.pdf#15", "SPECIALTY EQUIPMENT SCHEDULE", ["T1", "ERV-9"], "reference"),
      table("a.pdf#33", "EQUIPMENT SCHEDULE", ["RF-2", "EF-9"], "reference"),
      table("a.pdf#7", "", ["WH 1ST FLR", "WH-2"], "room-finish"),
    ]);
    for (const f of ["FAN", "PUMP", "ERV", "WATER_HEATER"]) assert.deepEqual(tags(f), [], f);
    // An equipment table is read by its marks, and a titled table whatever
    // its kind (22_GA's GRILLE SCHEDULE is a reference table).
    const kept = compile([
      table("m.pdf#18", "", ["CP-1", "SF-1"]),
      table("m.pdf#71", "EQUIPMENT SCHEDULE", ["RF-1", "ERV-2"]),
      table("m.pdf#64", "GRILLE SCHEDULE", ["A", "B"], "reference"),
      table("m.pdf#2", "EXHAUST FAN SCHEDULE", ["EF-1"], "reference"),
    ]);
    assert.deepEqual(kept("PUMP"), ["CP-1"]);
    assert.deepEqual(kept("FAN"), ["EF-1", "RF-1", "SF-1"]);
    assert.deepEqual(kept("ERV"), ["ERV-2"]);
    assert.deepEqual(kept("GRD"), ["A", "B"]);
    // An untitled grid of valve marks keeps the word of its header shape.
    const valves = compileHvacTakeoff(null, { tables: [{
      kind: "reference", sheet: "m.pdf#9", title: { text: "" }, headers: ["TAG", "GPM", "SERVED"],
      rows: [{ key: "CV-1", cells: { TAG: { text: "CV-1" }, GPM: { text: "12" }, SERVED: { text: "AHU-1" } } }],
    }] }).categories as Record<string, { items: Array<{ tag: string }> }>;
    assert.deepEqual(valves.CHW_CONTROL_VALVE.items.map((i) => i.tag), ["CV-1"]);
  });

  it("reads no unit in an untitled lighting fixture schedule", () => {
    // 11_CA's untitled LUMINAIRE AND FIXTURE SCHEDULE: its EP1 and EP2
    // pendants were pumps, RF1 and SF1 fans.
    const headed = (sheet: string, headers: string[], keys: string[]) => ({
      kind: "equipment", sheet, title: { text: "" }, headers,
      rows: keys.map((key) => ({ key, cells: { [headers[0]]: { text: key } } })),
    });
    const lights = compile([
      headed("e.pdf#140", ["TYPE", "DESCRIPTION", "MANUFACTURER & CATALOG #", "LAMP QTY. &TYPE", "TOTAL WATTS", "POWER CONTROL", "REMARKS"], ["EP1", "EP2", "RF1", "SF1"]),
      headed("e.pdf#27", ["TYPE", "MOUNTING", "DELIVERED LUMENS", "DRIVER", "VOLTAGE"], ["EF-1", "P-1"]),
    ]);
    for (const f of ["FAN", "PUMP"]) assert.deepEqual(lights(f), [], f);
    // A unit's schedule naming a lamp (an air handler's UV lamps) prints its
    // airflow beside it, and an untitled table naming no lamp keeps its units.
    const units = compile([
      headed("m.pdf#5", ["MARK", "SUPPLY CFM", "UV LAMPS", "FILTER"], ["AHU-1"]),
      headed("m.pdf#6", ["TAG", "SERVICE", "GPM", "HEAD"], ["CP-1"]),
    ]);
    assert.deepEqual(units("AHU"), ["AHU-1"]);
    assert.deepEqual(units("PUMP"), ["CP-1"]);
  });

  it("reads a mark of letters alone as a word where no title vouches for the family", () => {
    // 02_UT's and 19_CA's abbreviation lists print SPF and SFD.
    const tags = compile([table("m.pdf#3", "", ["SPF", "SFD", "EF-3"]), table("m.pdf#4", "MISCELLANEOUS SCHEDULE", ["SPF", "WWHP-A"])]);
    assert.deepEqual(tags("FAN"), ["EF-3"]);
    assert.deepEqual(tags("HEAT_PUMP"), ["WWHP-A"]);
    // Under a fan title, the word is read as printed.
    assert.deepEqual(compile([table("m.pdf#5", "FAN SCHEDULE", ["SPF"])])("FAN"), ["SPF"]);
  });

  it("reads the marks only a title vouches for under that title alone", () => {
    // 096_IN's exhaust grilles EG2 and EG3, 016_NY's fans F-1 and F-2 in a
    // panel schedule, 041_IL's F0535 (a utility cart), 047_NC's air-cooled
    // chillers CH-1 and CH-2 in an electrical equipment list, 23_GA's T1.
    const loose = compile([
      table("m.pdf#22", "", ["EG2", "EG3", "F-1", "CH-1"]),
      table("m.pdf#27", "EQUIPMENT SCHEDULE", ["F0535", "CH-2", "T1", "ERV-1"]),
    ]);
    assert.deepEqual(loose("FAN"), []);
    assert.deepEqual(loose("FCU"), []);
    assert.deepEqual(loose("HEAT_RECOVERY_CHILLER"), []);
    assert.deepEqual(loose("AIR_COOLED_CHILLER"), ["CH-1", "CH-2"]);
    assert.deepEqual(loose("ERV"), ["ERV-1"]);
    // Under the family's own title each is its unit.
    const titled = compile([
      table("m.pdf#1", "EXHAUST FAN SCHEDULE", ["EG-1", "F-2"]),
      table("m.pdf#2", "FAN COIL UNIT SCHEDULE", ["F-3"]),
      table("m.pdf#3", "HEAT RECOVERY CHILLER SCHEDULE", ["CH-4"]),
      table("m.pdf#4", "ENERGY RECOVERY VENTILATOR SCHEDULE", ["C1"]),
    ]);
    assert.deepEqual(titled("FAN"), ["EG-1", "F-2"]);
    assert.deepEqual(titled("FCU"), ["F-3"]);
    assert.deepEqual(titled("HEAT_RECOVERY_CHILLER"), ["CH-4"]);
    assert.deepEqual(titled("ERV"), ["C1"]);
  });

  it("reads no unit in a specialty equipment schedule that does not say mechanical", () => {
    // 041_IL's Specialty Equipment Schedule prints its eyewash station P2000
    // (no pump) beside utility carts and scope cabinets, as 23_GA's prints its
    // extinguishers and grab bars: the building's specialties.
    const specialties = compile([table("a.pdf#8", "Specialty Equipment Schedule", ["P2000", "F0535", "AHU-9"])]);
    for (const f of ["PUMP", "FCU", "AHU"]) assert.deepEqual(specialties(f), [], f);
    // A mechanical specialty schedule and a general equipment schedule are
    // still read by the families' marks.
    const general = compile([
      table("m.pdf#14", "MECHANICAL SPECIALTY EQUIPMENT SCHEDULE", ["ET-1", "AS-1"]),
      table("m.pdf#15", "EQUIPMENT SCHEDULE", ["P-1"]),
      table("m.pdf#16", "MECHANICAL EQUIPMENT SCHEDULE", ["CWP-9"]),
    ]);
    assert.deepEqual(general("EXPANSION_TANK"), ["ET-1"]);
    assert.deepEqual(general("AIR_SEPARATOR"), ["AS-1"]);
    assert.deepEqual(general("PUMP"), ["CWP-9", "P-1"]);
  });

  it("reads no legend heading as a unit", () => {
    // 047_NC's legend sheet: "-CONDENSING UNIT" read as a title over "PIPING LEGEND".
    assert.equal(isScheduleHeaderJunkMark("PIPINGLEGEND"), true);
    assert.equal(isScheduleHeaderJunkMark("LEGEND"), true);
    assert.equal(isScheduleHeaderJunkMark("CU-1"), false);
    assert.deepEqual(compile([table("m.pdf#10", "-CONDENSING UNIT", ["PIPING LEGEND", "CU-1"])])("CONDENSING_UNIT"), ["CU-1"]);
  });
});

// AS-68: a table titled with the family's own name in words, no SCHEDULE
// printed, is the family's schedule. The title names the family from its
// first word to its last, so a list only ending in the family's name, or a
// box's connections, is not.
describe("AS-68 a table titled with the family's name in words is the family's schedule", () => {
  const row = (key: string) => ({ key, cells: { MARK: { text: key } } });
  const table = (sheet: string, title: string, keys: string[], kind = "equipment") => ({ kind, sheet, title: { text: title }, rows: keys.map(row) });
  const compile = (tables: unknown[]) => {
    const cats = compileHvacTakeoff(null, { tables }).categories as Record<string, { items: Array<{ tag: string }> }>;
    return (f: string) => (cats[f]?.items || []).map((i) => i.tag).sort();
  };

  it("reads EXHAUST FANS, SUPPLY FANS, VENTILATION FANS and FANS (SPECIFICATION …) as fan schedules", () => {
    // 23_GA's EXHAUST FANS, 072_CA's SUPPLY FANS, 097_UT's VENTILATION FANS
    // (EF-4 and EXF-1), 26_CA's FANS (SPECIFICATION SECTION 23 34 00) with its
    // transfer fan TF-P2-1, and a title of one fan (14_OR's KEF-1).
    const tags = compile([
      table("m.pdf#35", "EXHAUST FANS", ["EF-1", "EF-2"]),
      table("m.pdf#26", "SUPPLY FANS", ["SF-A-1"]),
      table("m.pdf#2", "VENTILATION FANS", ["EF-4", "EXF-1"]),
      table("m.pdf#10", "FANS (SPECIFICATION SECTION 23 34 00)", ["SF-P3-12", "TF-P2-1"]),
      table("m.pdf#3", "Exhaust Fan", ["KEF-1"]),
    ]);
    assert.deepEqual(tags("FAN"), ["EF-1", "EF-2", "EF-4", "EXF-1", "KEF-1", "SF-A-1", "SF-P3-12", "TF-P2-1"]);
  });

  it("reads no fan schedule in a title that only ends in the fans' name, nor an air handler's fans, fan coils, ceiling fans or points", () => {
    // 009_FL's electrical EQUIPMENT CONNECTION SCHEDULE - EXHAUST FANS, also
    // printed without spaces; an air handler's own fans (AS-38).
    const tags = compile([
      table("e.pdf#31", "EQUIPMENT CONNECTION SCHEDULE - EXHAUST FANS", ["EF-1", "EXF-2", "TF-3"]),
      table("e.pdf#32", "EQUIPMENTCONNECTIONSCHEDULE-EXHAUSTFANS", ["EF-7"]),
      table("m.pdf#14", "AIR HANDLING UNIT FANS", ["SF-1"]),
      table("m.pdf#15", "FAN COIL UNITS", ["FC-1"]),
      table("m.pdf#16", "CEILING FANS", ["CF-1"]),
      table("m.pdf#17", "EXHAUST FAN POINTS", ["EF-9"]),
    ]);
    assert.deepEqual(tags("FAN"), []);
    // EXF-* and TF-* are fans under a fan title only.
    assert.deepEqual(compile([table("m.pdf#4", "", ["EXF-3", "TF-4", "EF-5"])])("FAN"), ["EF-5"]);
  });

  it("reads no unit from a totals row, even one OCR ran together with its unit (AS-156)", () => {
    // 082_OR's pictured ventilation table: "DOAS-1 TOTAL:" … and "DOAS-3TOTAL:".
    const tags = compile([table("m.pdf#2", "DEDICATED OUTDOOR AIR SYSTEM", ["DOAS-1", "DOAS-2", "DOAS-3TOTAL:", "DOAS-2 TOTAL:", "TOTALS"])]);
    assert.deepEqual(tags("DOAS"), ["DOAS-1", "DOAS-2"]);
  });

  it("reads a row mark X N-M as X-N to X-M only when the set draws them so, and never X-N-M (AS-116)", () => {
    // 043_FL's MECHANICAL EQUIPMENT SCHEDULE: "HWP 1-2" and "CWP 9-10", one
    // row each; its plans and electrical sheets draw HWP-1, HWP-2, CWP-9 and
    // CWP-10, and no sheet prints HWP-1-2.
    const drawn = (texts: string[], inTable = false) => texts.map((text) => ({
      text, sheet: "m.pdf#12", role: "plan", in_table: inTable ? { sheet: "m.pdf#23", title: "PUMP SCHEDULE" } : null, sheet_callout: false,
    }));
    const pumps = [table("m.pdf#23", "PUMP SCHEDULE", ["HWP 1-2", "CWP 9-10"])];
    const read = (tags: unknown[]) => {
      const cats = compileHvacTakeoff(null, { tables: pumps, tags }).categories as Record<string, { items: Array<{ tag: string }> }>;
      return (cats.PUMP?.items || []).map((i) => i.tag).sort();
    };
    assert.deepEqual(read(drawn(["HWP-1", "HWP-2", "CWP-9", "CWP-10"])), ["CWP-10", "CWP-9", "HWP-1", "HWP-2"]);
    // No census (a table read alone), or one that draws only some of them, or
    // the mark itself (26_CA's AHU 2-1 is level 2's unit 1): one mark each.
    assert.deepEqual(read([]), ["CWP 9-10", "HWP 1-2"]);
    assert.deepEqual(read(drawn(["HWP-1", "CWP-9", "CWP-10"])), ["CWP-9", "CWP-10", "HWP 1-2"].sort());
    assert.deepEqual(read(drawn(["HWP-1", "HWP-2", "HWP-1-2", "CWP 9-10", "CWP-9", "CWP-10"])), ["CWP 9-10", "HWP 1-2"]);
    // The schedule's own text is no drawing of the units.
    assert.deepEqual(read(drawn(["HWP-1", "HWP-2", "CWP-9", "CWP-10"], true)), ["CWP 9-10", "HWP 1-2"]);
    // Ranges that would name a unit twice are type codes: 019_FL's diffusers
    // S1-2, S1-3, S1-4 and S2-4 are four types, though its plans draw S1 to S4.
    const grilles = [table("m.pdf#15", "GRILLE, REGISTER, AND DIFFUSER SCHEDULE", ["S1-2", "S1-3", "S1-4", "S2-4"])];
    const cats = compileHvacTakeoff(null, { tables: grilles, tags: drawn(["S1", "S2", "S3", "S4"]) }).categories as Record<string, { items: Array<{ tag: string }> }>;
    assert.deepEqual((cats.GRD?.items || []).map((i) => i.tag).sort(), ["S1-2", "S1-3", "S1-4", "S2-4"]);
  });

  it("reads a relief fan RLF under a fan title only (AS-155)", () => {
    // 07_MO's pictured FAN SCHEDULE: RLF 1 beside EXF 1 to EXF 3.
    assert.deepEqual(compile([table("m.pdf#23", "FAN SCHEDULE", ["RLF 1", "EXF 1"])])("FAN"), ["EXF 1", "RLF 1"]);
    assert.deepEqual(compile([table("m.pdf#5", "", ["RLF-2"])])("FAN"), []);
  });

  it("reads VAV box and terminal schedules and variable volume terminals, never a box's connections or controls", () => {
    // 009_FL's VAV TERMINAL SCHEDULE, 033_MN's VAV BOX WITH HOT WATER REHEAT
    // SCHEDULE, 061_IA's VARIABLE VOLUME SUPPLY TERMINAL UNIT SCHEDULE.
    const tags = compile([
      table("m.pdf#18", "VAV TERMINAL SCHEDULE", ["VAV-1-1"]),
      table("m.pdf#68", "VAV BOX WITH HOT WATER REHEAT SCHEDULE", ["VAV-C2"]),
      table("m.pdf#58", "VARIABLE VOLUME SUPPLY TERMINAL UNIT SCHEDULE", ["VAV-A"]),
      table("e.pdf#47", "VAV BOX CONNECTION SCHEDULE", ["VAV-9"]),
      table("m.pdf#23", "VAV BOX CONTROL DIAGRAM", ["VAV-8"]),
    ]);
    assert.deepEqual(tags("VAV"), ["VAV-1-1", "VAV-A", "VAV-C2"]);
  });

  it("reads a condensate pump's own title and an air/dirt separator's, its lettered marks under that title only", () => {
    // 044_NY's CONDENSATE PUMP; 014_MT's and 061_IA's AIR/DIRT SEPARATOR
    // SCHEDULE (AS-A1; AS-A to AS-C); 040_IL's pump trap package is no pump
    // schedule.
    const tags = compile([
      table("m.pdf#24", "CONDENSATE PUMP", ["CP-1"]),
      table("m.pdf#47", "CONDENSATE PUMP TRAP PACKAGED SCHEDULE", ["PT-1"]),
      table("m.pdf#4", "AIR/DIRT SEPARATOR SCHEDULE", ["AS-A1", "AS-B"]),
      table("m.pdf#5", "", ["AS-C"]),
    ]);
    assert.deepEqual(tags("PUMP"), ["CP-1"]);
    assert.deepEqual(tags("AIR_SEPARATOR"), ["AS-A1", "AS-B"]);
  });
});

// AS-69: a fan-powered terminal's schedule is a VAV schedule, and under the
// family's own title a fan-powered box's mark (FPB-n) is a VAV unit.
describe("AS-69 a fan-powered terminal unit schedule is a VAV schedule", () => {
  const row = (key: string) => ({ key, cells: { MARK: { text: key } } });
  const table = (sheet: string, title: string, keys: string[], kind = "equipment") => ({ kind, sheet, title: { text: title }, rows: keys.map(row) });
  const compile = (tables: unknown[]) => {
    const cats = compileHvacTakeoff(null, { tables }).categories as Record<string, { items: Array<{ tag: string }> }>;
    return (f: string) => (cats[f]?.items || []).map((i) => i.tag).sort();
  };

  it("reads a fan-powered terminal or box title, and its FPB, FPTU and FP marks", () => {
    // 26_CA's FAN POWERED TERMINAL UNIT SCHEDULE (SECTION 23 36 00), levels 3 and 61.
    const tags = compile([
      table("m.pdf#10", "FAN POWERED TERMINAL UNIT SCHEDULE (SECTION 23 36 00)", ["FPB-3-11", "FPB-61-101"]),
      table("m.pdf#11", "SERIES FAN-POWERED BOX SCHEDULE", ["FPTU-1"]),
      table("m.pdf#12", "PARALLEL FAN POWERED VAV BOX SCHEDULE", ["FP-2"]),
      table("m.pdf#13", "Fan Powered Terminal Units", ["SFP-4"]),
    ]);
    assert.deepEqual(tags("VAV"), ["FP-2", "FPB-3-11", "FPB-61-101", "FPTU-1", "SFP-4"]);
  });

  it("reads no fan-powered box schedule in a box's controls, wiring, points or sequence, nor in a list that only ends in their name", () => {
    const tags = compile([
      table("m.pdf#20", "FAN POWERED BOX CONTROL DIAGRAM", ["FPB-1"]),
      table("m.pdf#21", "FAN POWERED TERMINAL UNIT WIRING DETAIL", ["FPB-2"]),
      table("m.pdf#22", "FAN POWERED BOX POINTS LIST", ["FPB-3"]),
      table("e.pdf#30", "EQUIPMENT CONNECTION SCHEDULE - FAN POWERED BOXES", ["FPB-4"]),
      table("m.pdf#23", "SEQUENCE OF OPERATION - FAN POWERED TERMINAL UNITS", ["FPB-5"]),
    ]);
    assert.deepEqual(tags("VAV"), []);
    // FPB-* is a VAV unit under the family's own title only: never in an
    // untitled table, and never a sheet index's fire protection sheet (FP101).
    assert.deepEqual(compile([table("m.pdf#4", "", ["FPB-3-11", "VAV-1"])])("VAV"), ["VAV-1"]);
    assert.deepEqual(compile([table("m.pdf#2", "SHEET INDEX", ["FP101", "M101"], "reference")])("VAV"), []);
  });

  it("reads a fan terminal unit schedule and its FTU marks, status letters included (020_MO, read from ink)", () => {
    // 020_MO M-601 letters its schedules in ink; OCR splits a word of the title.
    const tags = compile([
      table("m.pdf#12", "FTU FAN TERMIN AL UNIT- ELECTRIC HEATING SCHEDULE", ["FTU-r102", "FTU-x104", "FTU-n110", "FTU-1201"]),
      table("m.pdf#13", "SERIES FAN TERMINAL UNIT SCHEDULE", ["FTU-3"]),
    ]);
    assert.deepEqual(tags("VAV"), ["FTU-1201", "FTU-3", "FTU-n110", "FTU-r102", "FTU-x104"]);
    // Not its controls, wiring or a detail callout, and not FTU marks untitled.
    assert.deepEqual(compile([
      table("m.pdf#20", "FAN TERMINAL UNIT CONTROL DIAGRAM", ["FTU-1"]),
      table("m.pdf#21", "FAN TERMINAL UNIT WIRING DETAIL", ["FTU-2"]),
      table("m.pdf#22", "UNDERFLOOR FAN TERMINAL UNIT WITH/WITHOUT HEATING COIL", ["FTU-4"]),
      table("m.pdf#4", "", ["FTU-5"]),
    ])("VAV"), []);
  });
});

// AS-96: a terminal air box schedule is a VAV schedule (040_IL's TERMINAL AIR
// BOX SCHEDULE - SINGLE DUCT - PHASE 2, AIR TERMINAL BOX in the other order),
// and under the family's own title a terminal air box's mark (TAB-n) is a VAV unit.
describe("AS-96 a terminal air box schedule is a VAV schedule", () => {
  const row = (key: string) => ({ key, cells: { MARK: { text: key } } });
  const table = (sheet: string, title: string, keys: string[], kind = "equipment") => ({ kind, sheet, title: { text: title }, rows: keys.map(row) });
  const compile = (tables: unknown[]) => {
    const cats = compileHvacTakeoff(null, { tables }).categories as Record<string, { items: Array<{ tag: string }> }>;
    return (f: string) => (cats[f]?.items || []).map((i) => i.tag).sort();
  };

  it("reads a terminal air box title, and its TAB marks", () => {
    const tags = compile([
      table("m.pdf#48", "TERMINAL AIR BOX SCHEDULE - SINGLE DUCT - PHASE 2", ["TAB-101", "TAB-102"]),
      table("m.pdf#48", "TERMINAL AIR BOX SCHEDULE - EXHAUST - PHASE 2", ["TAB-101E"]),
      table("m.pdf#48", "TERMINAL AIR BOX SCHEDULE - SINGLE DUCT REHEAT - BID ALTERNATE 3", ["TAB-116"]),
    ]);
    assert.deepEqual(tags("VAV"), ["TAB-101", "TAB-101E", "TAB-102", "TAB-116"]);
  });

  it("reads no terminal air box schedule in a box's controls, wiring, points or details, and no TAB mark outside the family's own title", () => {
    const tags = compile([
      table("m.pdf#20", "TERMINAL AIR BOX CONTROL DIAGRAM", ["TAB-1"]),
      table("m.pdf#21", "TERMINAL AIR BOX WIRING DETAIL", ["TAB-2"]),
      table("m.pdf#22", "TERMINAL AIR BOX POINTS LIST", ["TAB-3"]),
      table("m.pdf#23", "", ["TAB-4", "VAV-1"]),
    ]);
    assert.deepEqual(tags("VAV"), ["VAV-1"]);
  });
});

// AS-75: one row scheduling several units of one kind alike prints their
// marks as a range or a pair ("EF-1 THRU EF-4", 26_CA's "SF-P1-4 THRU 11" and
// "SF-P2-1 & 2", 013_MO's "CV-7-CV-10"): each is a unit, and the row's QTY
// counts them all, never each.
describe("AS-75 a row naming a range or pair of marks schedules each of them", () => {
  it("expands a range whose right end is the left mark with a higher number", () => {
    assert.deepEqual(expandEquipMarkRange("EF-1 THRU EF-4"), ["EF-1", "EF-2", "EF-3", "EF-4"]);
    assert.deepEqual(expandEquipMarkRange("EF-1 THRU 4"), ["EF-1", "EF-2", "EF-3", "EF-4"]);
    assert.deepEqual(expandEquipMarkRange("fcu-1 to fcu-3"), ["FCU-1", "FCU-2", "FCU-3"]);
    assert.deepEqual(expandEquipMarkRange("EF-1 THROUGH EF-3"), ["EF-1", "EF-2", "EF-3"]);
    assert.deepEqual(expandEquipMarkRange("EF-1 ~ 3"), ["EF-1", "EF-2", "EF-3"]);
    assert.deepEqual(expandEquipMarkRange("SF-P1-4 THRU 11"), ["SF-P1-4", "SF-P1-5", "SF-P1-6", "SF-P1-7", "SF-P1-8", "SF-P1-9", "SF-P1-10", "SF-P1-11"]);
    assert.deepEqual(expandEquipMarkRange("ST-3-1A THRU 3A"), ["ST-3-1A", "ST-3-2A", "ST-3-3A"]);
    assert.deepEqual(expandEquipMarkRange("VAV-1-1 THRU 1-3"), ["VAV-1-1", "VAV-1-2", "VAV-1-3"]);
    assert.deepEqual(expandEquipMarkRange("1-VAV-1 THRU 1-VAV-2"), ["1-VAV-1", "1-VAV-2"]);
    assert.deepEqual(expandEquipMarkRange("VAV-08 THRU VAV-11"), ["VAV-08", "VAV-09", "VAV-10", "VAV-11"]);
    // A dash between two marks, the prefix printed again, glued or spaced.
    assert.deepEqual(expandEquipMarkRange("CV-7-CV-10"), ["CV-7", "CV-8", "CV-9", "CV-10"]);
    assert.deepEqual(expandEquipMarkRange("CV-7 \u2013 CV-9"), ["CV-7", "CV-8", "CV-9"]);
  });

  it("reads no range in one qualified mark, two kinds of mark, a backwards or overlong range, or words after it", () => {
    for (const s of ["AHU-1-2", "HP-1-2", "EF-1 - SUPPLY", "RTU-1 (ALT#2)", "460-3-60", "1-AC-36TEMP", "FCU-01-CG06A", "B950-AHU-3001",
      "01-1-DAC-1", "05-B-DAC-1", "CV-CHW-BP-A", "EF-1 THRU SF-4", "SF-P1-4 THRU P2-11", "EF-1A THRU EF-4B", "EF-4 THRU EF-1", "EF-1 TO 1",
      "VAV-1 THRU VAV-500", "(N) EF-1 THRU EF-4", "EF-1 THRU EF-4 (TYP)", "1 TO 4", "EF-1"]) {
      assert.equal(expandEquipMarkRange(s), null, s);
    }
  });

  it("expands a qualified mark's pair, and keeps the pairs and words it read before", () => {
    assert.deepEqual(expandEquipMarks("SF-P2-1 & 2"), ["SF-P2-1", "SF-P2-2"]);
    assert.deepEqual(expandEquipMarks("EF-P1-1 & EF-P1-2"), ["EF-P1-1", "EF-P1-2"]);
    assert.deepEqual(expandEquipMarks("RF-1 & 2"), ["RF-1", "RF-2"]);
    assert.deepEqual(expandEquipMarks("EF-2 & SF-1"), ["EF-2", "SF-1"]);
    assert.deepEqual(expandEquipMarks("B & G MODEL SRS-3F"), ["B & G MODEL SRS-3F"]);
    // A qualified mark's prefix carries a dash; words before a pair of numbers are no mark.
    assert.deepEqual(expandEquipMarks("ROOM A 101 & 102"), ["ROOM A 101 & 102"]);
    assert.deepEqual(expandEquipMarks("EF-P1-1 & SF-P1-2"), ["EF-P1-1 & SF-P1-2"]);
    assert.equal(markLetters("SF-P1-4"), "SF");
    assert.equal(markLetters("B950-AHU-3001"), "AHU");
    assert.equal(markLetters("B-1"), "B");
  });

  const row = (key: string, qty?: string) => ({ key, cells: { MARK: { text: key }, ...(qty ? { QTY: { text: qty } } : {}) } });
  type Item = { tag: string; scheduled_qty: number | null; scheduled_qty_basis: string; status: string | null };
  const fans = (rows: unknown[]) => (compileHvacTakeoff(null, { tables: [{ kind: "equipment", sheet: "m.pdf#10", title: { text: "FAN SCHEDULE" }, headers: ["MARK", "QTY"], rows }] })
    .categories as Record<string, { items: Item[] }>).FAN.items;

  it("compiles each unit of a range or pair, a QTY equal to their number being one each", () => {
    const items = fans([row("SF-P1-4 THRU 6"), row("SF-P2-1 & 2"), row("EF-1 THRU EF-3", "3"), row("EF-8")]);
    assert.deepEqual(items.map((i) => i.tag).sort(), ["EF-1", "EF-2", "EF-3", "EF-8", "SF-P1-4", "SF-P1-5", "SF-P1-6", "SF-P2-1", "SF-P2-2"]);
    const ef2 = items.find((i) => i.tag === "EF-2")!;
    assert.equal(ef2.scheduled_qty, 1);
    assert.equal(ef2.scheduled_qty_basis, "printed_schedule_quantity_per_mark");
    assert.equal(items.find((i) => i.tag === "SF-P1-5")!.scheduled_qty_basis, "one_per_unique_schedule_row");
  });

  it("refuses a QTY printed for several marks that is not their number, and keeps a lone mark's QTY", () => {
    const items = fans([row("EF-5/EF-6", "3"), row("EF-7", "2"), row("FC-1 , HP-1", "1")]);
    const ef5 = items.find((i) => i.tag === "EF-5")!;
    assert.equal(ef5.scheduled_qty, null);
    assert.equal(ef5.scheduled_qty_basis, "printed_quantity_for_several_marks");
    assert.equal(ef5.status, "REFUSED_UNPARSEABLE_QTY");
    const ef7 = items.find((i) => i.tag === "EF-7")!;
    assert.equal(ef7.scheduled_qty, 2);
    assert.equal(ef7.scheduled_qty_basis, "printed_schedule_quantity");
  });

  it("reads a split system's QTY as each half's: one unit of each kind", () => {
    // itd-d1-lab's "F-1 , CU-1": a fan coil and its condensing unit, QTY 1.
    const cats = compileHvacTakeoff(null, { tables: [{ kind: "equipment", sheet: "m.pdf#12", title: { text: "FAN COIL UNIT SCHEDULE" }, headers: ["MARK", "QTY"], rows: [row("FC-1 , CU-1", "1")] }] }).categories as Record<string, { items: Array<{ tag: string; scheduled_qty: number | null; scheduled_qty_basis: string }> }>;
    const fc1 = cats.FCU.items.find((i) => i.tag === "FC-1")!;
    assert.deepEqual([fc1.scheduled_qty, fc1.scheduled_qty_basis], [1, "printed_schedule_quantity"]);
  });

  it("keeps one qualified mark one unit", () => {
    const cats = compileHvacTakeoff(null, { tables: [{ kind: "equipment", sheet: "m.pdf#11", title: { text: "AIR HANDLING UNIT SCHEDULE" }, rows: [row("AHU-1-2"), row("AHU-3")] }] }).categories as Record<string, { items: Array<{ tag: string }> }>;
    assert.deepEqual(cats.AHU.items.map((i) => i.tag).sort(), ["AHU-1-2", "AHU-3"]);
  });
});

it("a schedule printed for reference only, or not in contract, is not takeoff work; an existing one still is", async () => {
  const { familyTableGate, HVAC_FAMILY_SPECS, isReferenceOnlyScheduleTitle } = await import("../src/lib/corpusTakeoff.mjs");
  const table = (text: string) => ({ sheet: "x.pdf#4", title: { text }, headers: ["UNIT", "MANUFACTURER"], rows: [{ UNIT: "RTU-2", MANUFACTURER: "CARRIER" }] });
  const rtu = (HVAC_FAMILY_SPECS as any).RTU;
  // 16_NV prints the units it replaces beside the new ones.
  assert.equal(familyTableGate(table("EXISTING GAS-FIRED DX COOLING ROOF TOP UNIT SCHEDULE (FOR REFERENCE ONLY)"), rtu, "RTU"), null);
  assert.notEqual(familyTableGate(table("GAS-FIRED DX COOLING ROOF TOP UNIT SCHEDULE (BID ALTERNATE 1)"), rtu, "RTU"), null);
  assert.notEqual(familyTableGate(table("EXISTING ROOF TOP UNIT SCHEDULE"), rtu, "RTU"), null, "existing units can still carry work");
  assert.equal(isReferenceOnlyScheduleTitle("PUMP SCHEDULE (N.I.C.)"), true);
  assert.equal(isReferenceOnlyScheduleTitle("FAN SCHEDULE - NOT IN CONTRACT"), true);
  assert.equal(isReferenceOnlyScheduleTitle("FAN COIL UNIT SCHEDULE (EXISTING TO BE REUSED)"), false);
  assert.equal(isReferenceOnlyScheduleTitle("REFERENCE SCHEDULE"), false);
  // 29_TX: a new chiller the owner bought and the contractor installs.
  assert.equal(isReferenceOnlyScheduleTitle("WATER COOLED CHILLER SCHEDULE (FOR REFERENCE ONLY)"), false);
});

it("a rooftop unit titled by what it packages is a rooftop unit (095_UT's ROOFTOP PACKAGED AIR CONDITIONING UNIT)", async () => {
  const { familyTableGate, HVAC_FAMILY_SPECS } = await import("../src/lib/corpusTakeoff.mjs");
  const table = (text: string) => ({ sheet: "x.pdf#2", title: { text }, headers: ["SYMBOL", "ACFM"], rows: [{ SYMBOL: "AC-WW", ACFM: "2,000" }] });
  const rtu = (HVAC_FAMILY_SPECS as any).RTU;
  assert.notEqual(familyTableGate(table("ROOFTOP PACKAGED AIR CONDITIONING UNIT"), rtu, "RTU"), null);
  assert.notEqual(familyTableGate(table("ROOFTOP AIR CONDITIONING UNIT SCHEDULE"), rtu, "RTU"), null);
  assert.equal(familyTableGate(table("ROOFTOP EXHAUST FAN SCHEDULE"), rtu, "RTU"), null);
  assert.equal(familyTableGate(table("ROOFTOP CURB SCHEDULE"), rtu, "RTU"), null);
});

// A schedule titled by its unit's plain name. 056_NY's SCHEDULES sheets,
// lettered in ink, print "CAV/VAV Schedule Basis of Design: Titus or
// Approved Equal" (VAV-1..10), an AIR FLOW CONTROL VALVE SCHEDULE (the
// pharmacy's eleven exhaust valves, tagged VAV-02R..VAV-01R3; AFCV in the VA
// abbreviations) and an AIR INLETS/ OUTLETS SCHEDULE: each names its family.
describe("a VAV, air flow control valve or air inlet/outlet schedule by its plain name", () => {
  const row = (key: string) => ({ key, cells: { TAG: { text: key } } });
  const table = (sheet: string, title: string, keys: string[]) => ({ kind: "equipment", sheet, title: { text: title }, rows: keys.map(row) });
  const compile = (tables: unknown[]) => {
    const cats = compileHvacTakeoff(null, { tables }).categories as Record<string, { items: Array<{ tag: string }> }>;
    return (f: string) => (cats[f]?.items || []).map((i) => i.tag).sort();
  };

  it("reads VAV SCHEDULE and CAV/VAV SCHEDULE as VAV schedules, never a VAV points list", () => {
    const tags = compile([
      table("m.pdf#4", "CAV/VAV Schedule Basis fo Design: Titus or Approved Equal", ["VAV-1", "VAV-2"]),
      table("m.pdf#5", "VAV SCHEDULE", ["VAV-3"]),
    ]);
    assert.deepEqual(tags("VAV"), ["VAV-1", "VAV-2", "VAV-3"]);
    assert.deepEqual(compile([table("m.pdf#20", "VAV SCHEDULE - DDC POINTS LIST", ["VAV-4"])])("VAV"), []);
  });

  it("reads an air flow control valve schedule's valves as air valves, whatever their letters", () => {
    const tags = compile([table("m.pdf#4", "AIR FLOW CONTROL VALVE SCHEDULE", ["VAV-02R", "VAV-01R1"])]);
    assert.deepEqual(tags("LAB_AIR_VALVE"), ["VAV-01R1", "VAV-02R"]);
    assert.deepEqual(tags("VAV"), [], "an air valve tagged VAV- is still the valve schedule's");
    assert.deepEqual(tags("CHW_CONTROL_VALVE"), []);
    assert.deepEqual(compile([table("m.pdf#5", "HOT WATER CONTROL VALVE SCHEDULE", ["CV-1"])])("LAB_AIR_VALVE"), []);
    // A pressure independent hydronic valve's CV-1 stays out: only the air flow
    // control valve title reads any mark.
    assert.deepEqual(compile([table("m.pdf#5", "PRESSURE INDEPENDENT CONTROL VALVE SCHEDULE", ["CV-1"])])("LAB_AIR_VALVE"), []);
  });

  it("reads air inlets and outlets printed with a slash as air devices", () => {
    const tags = compile([table("m.pdf#3", "AIR INLETS/ OUTLETS SCHEDULE BASIS OF DESIGN: \"TITUS\" OR APPROVED EQUAL", ["CD1", "CD2"])]);
    assert.deepEqual(tags("GRD"), ["CD1", "CD2"]);
  });
});

// Schedules the takeoff read none of (re-keyed from the renders, 2026-10-02):
// 038_NC's building 47 prints MINI-SPLIT INDOOR and OUTDOOR UNIT schedules
// (47-IDU-A301, 47-ODU-BC101), a DC CRAC UNIT SCHEDULE (47-CRAC-1A), a FAN
// SCHEDULE (47-IF-1) and a DIFFUSERS, REGISTERS, & GRILLES SCHEDULE; 036_LA a
// "VRV- INDOOR UNIT SCHEDULE" (07-1-EU-1) and a COMPUTER ROOM AIR
// CONDITIONING table (07-EVAP-1); D_25_CO a SPLIT SYSTEM INDOOR UNIT
// SCHEDULE (AC-1).
describe("split, VRV, CRAC, inline fan and grille schedules by the names they print", () => {
  const row = (key: string) => ({ key, cells: { TAG: { text: key } } });
  const table = (sheet: string, title: string, keys: string[]) => ({ kind: "equipment", sheet, title: { text: title }, rows: keys.map(row) });
  const compile = (tables: unknown[]) => {
    const cats = compileHvacTakeoff(null, { tables }).categories as Record<string, { items: Array<{ tag: string }> }>;
    return (f: string) => (cats[f]?.items || []).map((i) => i.tag).sort();
  };

  it("strips a building number before a family token whose number leads with letters", () => {
    assert.equal(markCoreForKeyRe("47-IDU-A301"), "IDU-A301");
    assert.equal(markCoreForKeyRe("47-ODU-BC143C"), "ODU-BC143C");
    assert.equal(markCoreForKeyRe("47-CU-1A"), "CU-1A");
    assert.equal(markCoreForKeyRe("07-1-EU-1"), "EU-1");
    // A catalog model is still no mark (TPLFY-EP15NEM4), nor a unit's own
    // part (AHU-1-SF-1).
    assert.equal(markCoreForKeyRe("TPLFY-EP15NEM4"), "TPLFY-EP15NEM4");
    assert.equal(markCoreForKeyRe("AHU-1-SF-1"), "AHU-1-SF-1");
    // After a lettered token the number may not lead with letters: an
    // untitled valve grid's CV-FCU-A2-HHW is a valve (AS-79).
    assert.equal(markCoreForKeyRe("CV-FCU-A2-HHW"), "CV-FCU-A2-HHW");
  });

  it("strips a building number before a unit numbered by the room it serves", () => {
    // floor + wing + room: 038_NC's 47-IDU-1A137, 47-ODU-2E202A.
    assert.equal(markCoreForKeyRe("47-IDU-1A137"), "IDU-1A137");
    assert.equal(markCoreForKeyRe("47-ODU-2E202A"), "ODU-2E202A");
    // Or by a room numbered in two parts: 030_NY's 016-AC-01-16-12, unit
    // AC-01 in room 16-12, and its outdoor unit 016-CU-01-16-12.
    assert.equal(markCoreForKeyRe("016-AC-01-16-12"), "AC-01-16-12");
    assert.equal(markCoreForKeyRe("016-CU-01-16-12"), "CU-01-16-12");
    // Only after a numbered building: a lettered or coded token keeps its mark,
    // and so does a run of three more numbers (a model or a date, not a room).
    assert.equal(markCoreForKeyRe("CV-FCU-1A137"), "CV-FCU-1A137");
    assert.equal(markCoreForKeyRe("B950-FCU-1A137"), "B950-FCU-1A137");
    assert.equal(markCoreForKeyRe("AHU-AC-01-16-12"), "AHU-AC-01-16-12");
    assert.equal(markCoreForKeyRe("016-AC-01-16-12-3"), "016-AC-01-16-12-3");
    const tags = compile([table("m.pdf#20", "MINI-SPLIT INDOOR UNIT SCHEDULE", ["47-IDU-A301", "47-IDU-1A137"])]);
    assert.deepEqual(tags("FCU"), ["47-IDU-1A137", "47-IDU-A301"]);
  });

  it("reads a mini-split's indoor and outdoor units in their own families", () => {
    const tags = compile([
      table("m.pdf#20", "MINI-SPLIT INDOOR UNIT SCHEDULE", ["47-IDU-A301", "47-IDU-BF107"]),
      table("m.pdf#20", "MINI-SPLIT OUTDOOR UNIT SCHEDULE", ["47-ODU-BC101", "47-ODU-BC143C"]),
    ]);
    assert.deepEqual(tags("FCU"), ["47-IDU-A301", "47-IDU-BF107"]);
    assert.deepEqual(tags("CONDENSING_UNIT"), ["47-ODU-BC101", "47-ODU-BC143C"]);
    assert.deepEqual(tags("VRF_INDOOR"), []);
    // An IDU-* names an indoor unit under a split title only.
    assert.deepEqual(compile([table("m.pdf#21", "PUMP SCHEDULE", ["IDU-1"])])("FCU"), []);
  });

  it("reads a VRV indoor unit schedule as VRF indoor units, an EU-* only under its title", () => {
    const tags = compile([table("m.pdf#62", "VRV- INDOOR UNIT SCHEDULE", ["07-1-EU-1", "07-B-EU-1", "09-3-EU-1"])]);
    assert.deepEqual(tags("VRF_INDOOR"), ["07-1-EU-1", "07-B-EU-1", "09-3-EU-1"]);
    assert.deepEqual(tags("FCU"), []);
    assert.deepEqual(compile([table("m.pdf#63", "EQUIPMENT SCHEDULE", ["EU-1"])])("VRF_INDOOR"), []);
  });

  it("reads a computer room air conditioner as one, never its condenser", () => {
    assert.deepEqual(compile([table("m.pdf#20", "DC CRAC UNIT SCHEDULE", ["47-CRAC-1A", "47-CRAC-1B"])])("CRAH"), ["47-CRAC-1A", "47-CRAC-1B"]);
    assert.deepEqual(compile([table("m.pdf#62", "COMPUTER ROOM AIR CONDITIONING", ["07-EVAP-1"])])("CRAH"), ["07-EVAP-1"]);
    assert.deepEqual(compile([table("m.pdf#51", "COMPUTER ROOM UNIT SCHEDULE", ["CRAC-1", "CRAC-2"])])("CRAH"), ["CRAC-1", "CRAC-2"]);
    assert.deepEqual(compile([table("m.pdf#62", "CRAC CONDENSER SCHEDULE", ["CDU-1"])])("CRAH"), []);
    assert.deepEqual(compile([table("m.pdf#62", "CRAC DDC POINTS LIST", ["CRAC-1"])])("CRAH"), []);
  });

  it("reads an inline fan under a fan schedule title, and a split system's indoor unit schedule by name", () => {
    assert.deepEqual(compile([table("m.pdf#20", "FAN SCHEDULE", ["47-IF-1"])])("FAN"), ["47-IF-1"]);
    assert.deepEqual(compile([table("m.pdf#20", "PUMP SCHEDULE", ["IF-1"])])("FAN"), []);
    assert.deepEqual(compile([table("m.pdf#2", "SPLIT SYSTEM INDOOR UNIT SCHEDULE", ["AC-1"])])("FCU"), ["AC-1"]);
  });

  it("reads an infrared heater schedule's heaters as unit heaters, and coils titled by their kind", () => {
    assert.deepEqual(compile([table("m.pdf#2", "INFRA-RED TUBE HEATER SCHEDULE", ["IRH-1", "IRH-2"])])("UNIT_HEATER"), ["IRH-1", "IRH-2"]);
    // An abbreviation list's "INFRARED HEATER" is no schedule.
    assert.deepEqual(compile([table("m.pdf#1", "INFRARED HEATER", ["IRH-1"])])("UNIT_HEATER"), []);
    const coils = compile([
      table("m.pdf#11", "HYDRONIC COILS (HC)", ["CC-1", "CC-2"]),
      table("m.pdf#11", "ELECTRIC HEATING COIL (EHC)", ["EHC-1"]),
    ]);
    assert.deepEqual(coils("DUCT_MOUNTED_COIL"), ["CC-1", "CC-2", "EHC-1"]);
    assert.deepEqual(compile([table("m.pdf#11", "AIR HANDLING UNIT HYDRONIC COIL SCHEDULE", ["CHWC"])])("DUCT_MOUNTED_COIL"), []);
    assert.deepEqual(compile([table("m.pdf#20", "CRAC UNIT CONTROL DIAGRAM (CRAC 01 & 02)", ["CRAC-01"])])("CRAH"), []);
  });

  it("reads diffusers, registers and grilles in that order as air devices", () => {
    assert.deepEqual(compile([table("m.pdf#20", "DIFFUSERS, REGISTERS, & GRILLES SCHEDULE", ["H14x14", "H18x12"])])("GRD"), ["H14x14", "H18x12"]);
    assert.deepEqual(compile([table("m.pdf#3", "AIR DISTRIBUTION", ["LS-1", "SD-1"])])("GRD"), ["LS-1", "SD-1"]);
    // A sheet or system heading that only begins with it is no schedule.
    assert.deepEqual(compile([table("m.pdf#3", "AIR DISTRIBUTION SYSTEM NOTES", ["1"])])("GRD"), []);
  });

  it("reads an air terminal schedule that names no unit or box by its grilles' marks only (014_MT's EG-1, EG-2, RG-1)", () => {
    const terminals = compile([table("m.pdf#3", "AIR TERMINAL SCHEDULE", ["EG-1", "EG-2", "RG-1", "SD-4", "VAV-1", "TU-2", "CAV-3"])]);
    assert.deepEqual(terminals("GRD"), ["EG-1", "EG-2", "RG-1", "SD-4"]);
    // An air terminal unit's schedule lists boxes, never grilles.
    assert.deepEqual(compile([table("m.pdf#3", "AIR TERMINAL UNIT SCHEDULE", ["VAV-1", "RG-1"])])("GRD"), []);
    assert.deepEqual(compile([table("m.pdf#3", "AIR TERMINAL BOX SCHEDULE", ["SD-1"])])("GRD"), []);
  });
});

describe("a VRF system's outdoor units titled as condensing units", () => {
  const table = (sheet: string, title: string, keys: string[]) => ({
    sheet, title: { text: title }, headers: ["MARK"], kind: "equipment",
    rows: keys.map((k) => ({ key: k, cells: { MARK: { text: k } } })),
  });
  const compile = (tables: unknown[]) => {
    const cats = compileHvacTakeoff(null, { tables }).categories as Record<string, { items: Array<{ tag: string }> }>;
    return (f: string) => (cats[f]?.items || []).map((i) => i.tag).sort();
  };
  it("reads 036_LA's VRV- AIR-COOLED CONDENSING UNIT SCHEDULE as VRF outdoor units, not condensing units", () => {
    const tags = compile([
      table("m.pdf#1", "VRV- AIR-COOLED CONDENSING UNIT SCHEDULE", ["07-A-CU-1", "09-A-CU-1"]),
      table("m.pdf#1", "DUCTLESS SPLIT SYSTEM SCHEDULE", ["01-1-CU-1"]),
    ]);
    assert.deepEqual(tags("VRF_OUTDOOR"), ["07-A-CU-1", "09-A-CU-1"]);
    assert.deepEqual(tags("CONDENSING_UNIT"), ["01-1-CU-1"]);
    // 032_PA: a split system's outdoor units, beside its indoor units' schedule.
    const split = compile([
      table("m.pdf#2", "SPLIT SYSTEM INDOOR UNIT (EVAPORATOR) SCHEDULE", ["AC 1-A001D"]),
      table("m.pdf#2", "SPLIT SYSTEM OUTDOOR UNIT (CONDENSER) SCHEDULE", ["ACCU 1-A001D", "ACCU 3-121"]),
    ]);
    assert.deepEqual(split("CONDENSING_UNIT"), ["ACCU 1-A001D", "ACCU 3-121"]);
    assert.deepEqual(split("FCU"), ["AC 1-A001D"]);
    // A plain condensing unit schedule stays the condensing units'.
    assert.deepEqual(compile([table("m.pdf#2", "AIR COOLED CONDENSING UNIT SCHEDULE", ["CU-1"])])("CONDENSING_UNIT"), ["CU-1"]);
  });
});

describe("a row heading a section of a schedule's units", () => {
  it("is no unit (011_IL's RETURN and SUPPLY over its grilles); a unit printed alone is", () => {
    const row = (cells: Record<string, string>) => ({ key: Object.values(cells)[0], cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, { text: v }])) });
    const grilles = { sheet: "m.pdf#16", kind: "equipment", title: { text: "DIFFUSER, REGISTER, AND GRILLE SCHEDULE" },
      headers: ["MARK", "MOUNTING", "TYPE", "NECK SIZE"],
      rows: [row({ MARK: "RETURN" }), row({ MARK: "RG-1", MOUNTING: "CEILING", TYPE: "RETURN GRILLE", "NECK SIZE": "22x22" }),
        row({ MARK: "SUPPLY" }), row({ MARK: "SD-1", MOUNTING: "CEILING", TYPE: "DIFFUSER", "NECK SIZE": "6" }),
        row({ MARK: "SD-2", MOUNTING: "CEILING", TYPE: "DIFFUSER", "NECK SIZE": "8" }), row({ MARK: "SD-3" })] };
    const cats = compileHvacTakeoff(null, { tables: [grilles] }).categories as Record<string, { items: Array<{ tag: string }> }>;
    assert.deepEqual(cats.GRD.items.map((i) => i.tag).sort(), ["RG-1", "SD-1", "SD-2", "SD-3"]);
  });
});

describe("tanks, glycol and pot feeders under their own titles (07_MO's pictured schedules)", () => {
  const table = (title: string, keys: string[]) => ({
    sheet: "m.pdf#1", title: { text: title }, headers: ["MARK"], kind: "equipment",
    rows: keys.map((k) => ({ key: k, cells: { MARK: { text: k } } })),
  });
  const compile = (tables: unknown[]) => {
    const cats = compileHvacTakeoff(null, { tables }).categories as Record<string, { items: Array<{ tag: string }> }>;
    return (f: string) => (cats[f]?.items || []).map((i) => i.tag).sort();
  };
  it("reads an EXPANSION & BUFFER TANK SCHEDULE by each kind's marks", () => {
    const tags = compile([table("EXPANSION & BUFFER TANK SCHEDULE", ["EXT-1", "EXT-2", "CBT-1"])]);
    assert.deepEqual(tags("EXPANSION_TANK"), ["EXT-1", "EXT-2"]);
    assert.deepEqual(tags("BUFFER_TANK"), ["CBT-1"]);
    // Each kind's own schedule still refuses the other's title.
    assert.deepEqual(compile([table("BUFFER TANK SCHEDULE", ["BT-1"])])("EXPANSION_TANK"), []);
    assert.deepEqual(compile([table("EXPANSION TANK SCHEDULE", ["ET-1"])])("BUFFER_TANK"), []);
  });
  it("reads a GLYCOL FEED SYSTEM and a CHEMICAL POT FEEDER SCHEDULE by their marks, under their titles only", () => {
    assert.deepEqual(compile([table("GLYCOL FEED SYSTEM", ["GF-1"])])("GLYCOL_MAKEUP"), ["GF-1"]);
    // A feeder lettered for its wing (014_MT's AUTOMATIC GLYCOL FEEDER GLF-A1).
    assert.deepEqual(compile([table("AUTOMATIC GLYCOL FEEDER SCHEDULE", ["GLF-A1"])])("GLYCOL_MAKEUP"), ["GLF-A1"]);
    assert.deepEqual(compile([table("", ["GLF-A1"])])("GLYCOL_MAKEUP"), []);
    assert.deepEqual(compile([table("CHEMICAL POT FEEDER SCHEDULE", ["CPF-1"])])("CHEMICAL_POT_FEEDER"), ["CPF-1"]);
    assert.deepEqual(compile([table("", ["EXT-1", "CPF-1", "GF-1"])])("EXPANSION_TANK"), []);
  });
});

describe("louvers listed in an air device schedule", () => {
  it("are the louver family's, not grilles (082_OR's AIR DISTRIBUTION LV-1, LV-2)", () => {
    const rows = ["SD-1", "RG-1", "EG-1", "LV-1", "LV-2"];
    const table = { sheet: "m.pdf#1", kind: "equipment", title: { text: "AIR DISTRIBUTION" }, headers: ["MARK"],
      rows: rows.map((k) => ({ key: k, cells: { MARK: { text: k } } })) };
    const cats = compileHvacTakeoff(null, { tables: [table] }).categories as Record<string, { items: Array<{ tag: string }> }>;
    assert.deepEqual(cats.GRD.items.map((i) => i.tag).sort(), ["EG-1", "RG-1", "SD-1"]);
    assert.deepEqual(cats.LOUVER.items.map((i) => i.tag).sort(), ["LV-1", "LV-2"]);
  });
});

describe("a schedule row whose mark reads N/A", () => {
  it("names no unit, nor does one with no letter or digit (023_US's PUMP SCHEDULE closes with a blank row printing N/A)", () => {
    const rows = [{ key: "CHWP1/CHWP2", cells: { MARK: { text: "CHWP1&2" }, TYPE: { text: "END-SUCTION" }, GPM: { text: "530" } } },
      { key: "N/A", cells: { "FLOW [L/S]": { text: "[ ]" }, "NPSH [KPA]": { text: "N/A" } } },
      { key: "-", cells: { MARK: { text: "-" } } },
      { key: "[ ]", cells: { MARK: { text: "[ ]" }, GPM: { text: "[ ]" } } }];
    const table = { sheet: "m.pdf#8", kind: "equipment", title: { text: "PUMP SCHEDULE" }, headers: ["MARK", "TYPE", "GPM"], rows };
    const cats = compileHvacTakeoff(null, { tables: [table] }).categories as Record<string, { items: Array<{ tag: string }> }>;
    assert.deepEqual(cats.PUMP.items.map((i) => i.tag).sort(), ["CHWP1", "CHWP2"]);
  });
});

describe("cove heaters and plumbing specialties (08_ME's ink-lettered M102 and P103)", () => {
  const table = (title: string, keys: string[]) => ({
    sheet: "m.pdf#1", title: { text: title }, headers: ["TAG"], kind: "reference",
    rows: keys.map((k) => ({ key: k, cells: { TAG: { text: k } } })),
  });
  const compile = (tables: unknown[]) => {
    const cats = compileHvacTakeoff(null, { tables }).categories as Record<string, { items: Array<{ tag: string }> }>;
    return (f: string) => (cats[f]?.items || []).map((i) => i.tag).sort();
  };
  it("reads an ELECTRIC COVE HEATER SCHEDULE's CH marks as unit heaters, under that title only", () => {
    const heaters = { ...table("ELECTRIC COVE HEATER SCHEDULE", ["CH-1", "CH-2"]), kind: "equipment" };
    assert.deepEqual(compile([heaters])("UNIT_HEATER"), ["CH-1", "CH-2"]);
    assert.deepEqual(compile([heaters])("AIR_COOLED_CHILLER"), []);
    assert.deepEqual(compile([{ ...table("EQUIPMENT SCHEDULE", ["CH-1"]), kind: "equipment" }])("UNIT_HEATER"), []);
  });
  it("reads a WATER SPECIALTIES SCHEDULE's expansion tank and mixing valve by their marks, and nothing else", () => {
    const tags = compile([table("WATER SPECIALTIES SCHEDULE", ["ET-1", "MV-1", "WH-1", "HB-1"])]);
    assert.deepEqual(tags("EXPANSION_TANK"), ["ET-1"]);
    assert.deepEqual(tags("MIXING_VALVE"), ["MV-1"]);
    assert.deepEqual(tags("WATER_HEATER"), []);
  });
});

describe("a unit named by the unit it serves and its role there", () => {
  const table = (title: string, keys: string[]) => ({
    sheet: "m.pdf#20", title: { text: title }, headers: ["MARK"], kind: "equipment",
    rows: keys.map((k) => ({ key: k, cells: { MARK: { text: k } } })),
  });
  const fans = (tables: unknown[]) => ((compileHvacTakeoff(null, { tables }).categories as Record<string, { items: Array<{ tag: string }> }>)
    .FAN?.items || []).map((i) => i.tag).sort();
  it("is the family's under its own title (043_FL's FAN SCHEDULE ED-203-SF, ED-203-RF)", () => {
    assert.deepEqual(fans([table("FAN SCHEDULE", ["ED-203-SF", "ED-203-RF"])]), ["ED-203-RF", "ED-203-SF"]);
  });
  it("is not read where no title vouches for the family, nor with a role that is no family token", () => {
    assert.deepEqual(fans([table("", ["ED-203-SF"])]), []);
    assert.deepEqual(fans([table("FAN SCHEDULE", ["ED-203-XQ"])]), []);
  });
});

describe("expansion tanks of a lettered pair, marked new", () => {
  // 032_PA's EXPANSION TANK SCHEDULE prints TYPE (N)ET beside EQUIPMENT NUMBER
  // A and B; the extraction keys its rows NET A and NET B.
  const tanks = (keys: string[], title = "MECHANICAL - EXPANSION TANK SCHEDULE") => {
    const table = {
      sheet: "m.pdf#3", title: { text: title }, headers: ["TYPE", "EQUIPMENT NUMBER", "MANUFACTURER"], kind: "equipment",
      rows: keys.map((k) => ({ key: k, cells: { TYPE: { text: "(N)ET" }, "EQUIPMENT NUMBER": { text: k.slice(-1) }, MANUFACTURER: { text: "WESSELS" } } })),
    };
    return ((compileHvacTakeoff(null, { tables: [table] }).categories as Record<string, { items: Array<{ tag: string }> }>)
      .EXPANSION_TANK?.items || []).map((i) => i.tag).sort();
  };
  it("reads each tank by its letter, the new mark's N set aside", () => {
    assert.deepEqual(tanks(["NET A", "NET B"]), ["ET A", "ET B"]);
  });
  it("still reads no word that only begins with ET", () => {
    assert.deepEqual(tanks(["ETC."]), []);
    assert.deepEqual(tanks(["ETA"]), []);
  });
});

describe("gas water heaters by their GWH marks", () => {
  // 004_MO's plumbing sheet: GAS WATER HEATER SCHEDULE GWH-1, GWH-2.
  const heaters = (title: string, keys: string[]) => ((compileHvacTakeoff(null, { tables: [{
    sheet: "p.pdf#31", title: { text: title }, headers: ["MARK", "MANUFACTURER"], kind: "equipment",
    rows: keys.map((k) => ({ key: k, cells: { MARK: { text: k }, MANUFACTURER: { text: "LOCHINVAR" } } })),
  }] }).categories as Record<string, { items: Array<{ tag: string }> }>).WATER_HEATER?.items || []).map((i) => i.tag).sort();
  it("reads them under a water heater schedule's title", () => {
    assert.deepEqual(heaters("GAS WATER HEATER SCHEDULE", ["GWH-1", "GWH-2"]), ["GWH-1", "GWH-2"]);
  });
  it("reads no other GW mark there", () => {
    assert.deepEqual(heaters("GAS WATER HEATER SCHEDULE", ["GW-1"]), []);
  });
});

describe("ductless and mini-split systems by their DSS, DSFC and DSCU marks", () => {
  // 015_VA's MINI-SPLIT-SYSTEM HEAT PUMPS SCHEDULE keys each wall unit DSS-n
  // beside its outdoor unit's OUTDOOR UNIT MARK CU-n; 035_AR's DUCTLESS SPLIT
  // FAN COIL and CONDENSER schedules key DSFC n and DSCU n.
  const read = (title: string, rows: Array<Record<string, string>>, family: string) => {
    const headers = Object.keys(rows[0]);
    const table = {
      sheet: "m.pdf#18", title: { text: title }, headers, kind: "equipment",
      rows: rows.map((r) => ({ key: r[headers[0]], cells: Object.fromEntries(headers.map((h) => [h, { text: r[h] }])) })),
    };
    return ((compileHvacTakeoff(null, { tables: [table] }).categories as Record<string, { items: Array<{ tag: string }> }>)[family]
      ?.items || []).map((i) => i.tag).sort();
  };
  const pairs = [
    { MARK: "DSS-1", TYPE: "WALL-MOUNTED", "OUTDOOR UNIT MARK": "CU-1" },
    { MARK: "DSS-2", TYPE: "WALL-MOUNTED", "OUTDOOR UNIT MARK": "CU-2" },
  ];
  it("reads a mini-split's wall units as fan coils and its outdoor units as condensing units", () => {
    assert.deepEqual(read("MINI-SPLIT-SYSTEM HEAT PUMPS SCHEDULE", pairs, "FCU"), ["DSS-1", "DSS-2"]);
    assert.deepEqual(read("MINI-SPLIT-SYSTEM HEAT PUMPS SCHEDULE", pairs, "CONDENSING_UNIT"), ["CU-1", "CU-2"]);
  });
  it("reads the two halves from their own schedules", () => {
    const coils = [{ "DESIGNATION MARK": "DSFC 1", DESCRIPTION: "2.5 TON WALL COIL UNIT" }];
    const condensers = [{ "DESIGNATION MARK": "DSCU 1", DESCRIPTION: "SPLIT SYSTEM CONDENSING UNIT" }];
    assert.deepEqual(read("HVAC -- DUCTLESS SPLIT FAN COIL SCHEDULE", coils, "FCU"), ["DSFC 1"]);
    assert.deepEqual(read("HVAC -- DUCTLESS SPLIT CONDENSER SCHEDULE", condensers, "CONDENSING_UNIT"), ["DSCU 1"]);
    assert.deepEqual(read("HVAC -- DUCTLESS SPLIT CONDENSER SCHEDULE", condensers, "FCU"), []);
  });
  it("reads no DSS mark under a title that names no split system", () => {
    assert.deepEqual(read("FAN SCHEDULE", [{ MARK: "DSS-1", TYPE: "INLINE" }], "FCU"), []);
  });
});

describe("split system titles in other words", () => {
  const indoor = (title: string, keys: string[]) => ((compileHvacTakeoff(null, { tables: [{
    sheet: "m.pdf#20", title: { text: title }, headers: ["MARK", "TYPE"], kind: "equipment",
    rows: keys.map((k) => ({ key: k, cells: { MARK: { text: k }, TYPE: { text: "HORIZONTAL" } } })),
  }] }).categories as Record<string, { items: Array<{ tag: string }> }>).FCU?.items || []).map((i) => i.tag).sort();
  it("reads a split system air conditioner's indoor unit (015_VA's SS-1)", () => {
    assert.deepEqual(indoor("GATEHOUSE SPLIT SYSTEM AIR CONDITIONER HEAT PUMP SCHEDULE", ["SS-1"]), ["SS-1"]);
  });
  it("reads a heat pump split system's furnaces, the title's words in that order (07_MO's F1, F2)", () => {
    assert.deepEqual(indoor("HEAT PUMP SPLIT SYSTEM", ["F1", "F2"]), ["F1", "F2"]);
  });
  it("still reads no bare F mark under a heat pump schedule", () => {
    assert.deepEqual(indoor("HEAT PUMP SCHEDULE", ["F1"]), []);
  });
});

describe("a unit heater schedule captioned by the family's name alone", () => {
  // 015_VA's AM601 captions its schedule ELECTRIC UNIT HEATER (UH-1 to UH-4).
  const heaters = (title: string) => ((compileHvacTakeoff(null, { tables: [{
    sheet: "m.pdf#18", title: { text: title }, headers: ["MARK", "LOCATION"], kind: "equipment",
    rows: ["UH-1", "UH-2"].map((k) => ({ key: k, cells: { MARK: { text: k }, LOCATION: { text: "GENERATOR ROOM" } } })),
  }] }).categories as Record<string, { items: Array<{ tag: string }> }>).UNIT_HEATER?.items || []).map((i) => i.tag).sort();
  it("reads its units", () => {
    assert.deepEqual(heaters("ELECTRIC UNIT HEATER"), ["UH-1", "UH-2"]);
    assert.deepEqual(heaters("UNIT HEATERS"), ["UH-1", "UH-2"]);
    assert.equal(HVAC_FAMILY_SPECS.UNIT_HEATER.titleRe.test("UNIT HEATER CONNECTION DETAIL"), false);
  });
  it("leaves a cabinet unit heater caption to its own family", () => {
    assert.deepEqual(heaters("CABINET UNIT HEATER"), []);
  });
});

describe("a convector schedule (033_MN's CONVECTOR SCHEDULE, 016_NY's C-1)", () => {
  const read = (title: string, marks: string[], header = "EQUIPMENT TAG") => {
    const categories = compileHvacTakeoff(null, { tables: [{
      sheet: "m.pdf#69", title: { text: title }, headers: [header, "LOCATION", "TYPE"], kind: "equipment",
      rows: marks.map((k) => ({ key: k, cells: { [header]: { text: k }, LOCATION: { text: "2 FEMALE LOCKER" }, TYPE: { text: "WALL-MOUNTED" } } })),
    }] }).categories as Record<string, { items: Array<{ tag: string }> }>;
    const tags = (family: string) => (categories[family]?.items || []).map((i) => i.tag).sort();
    return { convectors: tags("CONVECTOR"), valves: [...tags("CHW_CONTROL_VALVE"), ...tags("HHW_CONTROL_VALVE")] };
  };
  it("reads each convector under the family's title, by its room-numbered or plain mark", () => {
    assert.deepEqual(read("CONVECTOR SCHEDULE", ["CV-2.1", "CV-2A", "CV-4C.1"]).convectors, ["CV-2.1", "CV-2A", "CV-4C.1"]);
    assert.deepEqual(read("CONVECTOR SCHEDULE", ["C-1"], "UNIT NO.").convectors, ["C-1"]);
  });
  it("reads no CV mark as a convector anywhere else: a control valve's, or an untitled table's", () => {
    assert.deepEqual(read("CONTROL VALVE SCHEDULE", ["CV-1", "CV-2"]).convectors, []);
    assert.deepEqual(read("", ["CV-1", "CV-2"]).convectors, []);
    assert.deepEqual(read("CONVECTOR VALVE SCHEDULE", ["CV-1"]).convectors, []);
    assert.deepEqual(read("CONVECTOR SCHEDULE", ["CV-2.1"]).valves, []);
  });
});

// A chilled water pump lettered pump-first (087_US's PCH-1 and PCH-2) on a
// schedule whose title is drawn, not printed: the sheet graph gives the table
// no title, so only PUMP's untitled rule can read its marks.
describe("pump marks lettered pump-first on a table with no title", () => {
  it("reads PCH-n as a pump where no title vouches for it, and no PCH word", () => {
    const { blankKeyRe } = HVAC_FAMILY_SPECS.PUMP;
    for (const m of ["PCH-1", "PCH-12", "PCH 2"]) assert.equal(blankKeyRe.test(m), true, m);
    for (const m of ["PCH", "PCHX-1", "PCHW", "PCH-A"]) assert.equal(blankKeyRe.test(m), false, m);
    const row = (key: string) => ({ key, cells: { TAG: { text: key }, GPM: { text: "245" }, "FT. HD": { text: "60" } } });
    const graph = {
      tables: [
        { kind: "equipment", sheet: "m.pdf", title: null, headers: ["TAG", "MANUFACTURER & MODEL #", "SERVICE", "GPM", "FT. HD"], rows: ["PCH-1", "PCH-2"].map(row) },
      ],
    };
    const cats = compileHvacTakeoff(null, graph).categories as Record<string, { items: Array<{ tag: string }> }>;
    assert.deepEqual(cats.PUMP.items.map((i) => i.tag).sort(), ["PCH-1", "PCH-2"]);
  });
});

// A silencer schedule titled by its word alone, as the sheet titles its others
// (01_NY's SOUND ATTENUATORS beside PUMPS and FANS; AS-141's bare titles).
describe("a silencer schedule titled by its word alone", () => {
  it("reads SOUND ATTENUATORS, SILENCERS and SOUND TRAPS as whole titles, never inside a sentence", () => {
    const { titleRe } = HVAC_FAMILY_SPECS.DUCT_SILENCER;
    for (const t of ["SOUND ATTENUATORS", "SOUND ATTENUATOR", "SILENCERS", "DUCT SILENCERS", "SOUND TRAPS", "SOUND ATTENUATOR SCHEDULE"]) assert.equal(titleRe.test(t), true, t);
    for (const t of ["PROVIDE SOUND ATTENUATORS AT EACH FAN", "SOUND ATTENUATOR NOTES", "SILENCER DETAIL"]) assert.equal(titleRe.test(t), false, t);
    const row = (key: string) => ({ key, cells: { "UNIT NO": { text: key }, CFM: { text: "4210" } } });
    const graph = { tables: [{ kind: "equipment", sheet: "m.pdf#88", title: { text: "SOUND ATTENUATORS" }, rows: ["SA-1"].map(row) }] };
    const cats = compileHvacTakeoff(null, graph).categories as Record<string, { items: Array<{ tag: string }> }>;
    assert.deepEqual(cats.DUCT_SILENCER.items.map((i) => i.tag), ["SA-1"]);
  });
});
