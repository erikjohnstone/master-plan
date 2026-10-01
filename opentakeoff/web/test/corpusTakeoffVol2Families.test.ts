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
    for (const [mark, core] of [["1-VAV-1", "VAV-1"], ["40-AHU-2", "AHU-2"], ["W05-TU-01", "TU-01"], ["WC01A-TU-05", "TU-05"], ["B950-AHU-3001", "AHU-3001"], ["1-TU-28-1", "TU-28-1"], ["1-CU-28", "CU-28"]]) {
      assert.equal(markCoreForKeyRe(mark), core, mark);
    }
    // Not a building token, or not a short equipment mark after it.
    for (const mark of ["1-AC-36TEMP", "1-EF-36TEMPA", "1-1/2", "2-WAY", "460-3-60", "10-HP", "1234-AHU-1", "ST-H-3", "TPLFY-EP15NEM4"]) {
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
    assert.deepEqual(tags("AHU"), ["1-AC-15", "40-AHU-2", "AC-57"]);
    // BF-1 is no fan mark by FAN's rule, but a FAN SCHEDULE title vouches for it (AS-63).
    assert.deepEqual(tags("FAN"), ["BF-1", "JEF-1", "KEF-1", "PEF-1"]);
    assert.deepEqual(tags("FCU"), ["FC-A-13-1", "FC-A-2"]);
    const all = Object.values(cats).flatMap((c) => c.items.map((i) => i.tag));
    for (const t of ["A", "1-AC-36TEMP", "1-1/2", "2-WAY", "460-3-60"]) assert.equal(all.includes(t), false, t);
  });
});

// AS-64: a numbered or coded building followed by its floor or wing before
// the family's mark (036_LA's DUCTLESS SPLIT SYSTEM SCHEDULE prints all 34 of
// its units so: 01-1-DAC-1, 05-B-DAC-1, 136-1-DAC-1), and marks a family's
// own title vouches for: an air-cooled chiller's ACCH-1 (087_US), fan coils
// FCC1-1 beside FCU1-3 (028_TX) and a humidifier HUM-A (061_IA).
describe("AS-64 a building and its floor or wing before the mark; ACCH, FCC and HUM-A under their titles", () => {
  it("strips a building and its floor or wing when the rest is a short equipment mark", () => {
    for (const [mark, core] of [["01-1-DAC-1", "DAC-1"], ["05-B-DAC-1", "DAC-1"], ["136-1-DAC-1", "DAC-1"], ["07-A-CU-1", "CU-1"], ["A1-2-AHU-1", "AHU-1"], ["2-12-VAV-3", "VAV-3"]]) {
      assert.equal(markCoreForKeyRe(mark), core, mark);
    }
    // A unit's own mark before another's is no building (AHU-1-SF-1,
    // CH-1-CHWP-1); three location tokens, a floor of three digits, a wing of
    // two letters, a temporary unit and numbers are left alone, as is AS-62's
    // building token beside a building letter. One prefix is read at a time:
    // an area token, then a building and floor, is left alone.
    for (const mark of ["AHU-1-SF-1", "CH-1-CHWP-1", "12-3-4-AHU-1", "1-100-AHU-1", "1-AB-AHU-1", "01-1-AC-36TEMP", "460-3-60", "1-2-3", "1-FC-B-4", "WHSE-AB1-2-AHU-1"]) {
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
    assert.deepEqual(tags("FCU"), ["01-1-DAC-1", "05-B-DAC-1", "136-1-DAC-1", "FCC1-1", "FCC2-10", "FCU1-3"]);
    assert.deepEqual(tags("AIR_COOLED_CHILLER"), ["ACCH-1"]);
    assert.deepEqual(tags("HUMIDIFIER"), ["HUM-A"]);
    // An untitled table reads a building and floor before the family's own
    // untitled rule, as it reads AS-62's building token (1-CU-28).
    assert.deepEqual(tags("CONDENSING_UNIT"), ["03-1-CU-1"]);
    // Nowhere else: DAC-*, ACCH-*, FCC-* and HUM with a letter are read only
    // under their own titles, and a temporary unit stays no unit.
    const all = Object.values(cats).flatMap((c) => c.items.map((i) => i.tag));
    for (const t of ["ACCH-2", "ACCH-4", "02-1-DAC-1", "04-1-DAC-1", "01-1-DAC-36TEMP", "FCC1-5", "FCC1-6", "FCC1-7", "HUM-B", "HUM-C", "HUM-D"]) assert.equal(all.includes(t), false, t);
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
    assert.deepEqual(tags("DUCT_MOUNTED_COIL"), ["1-DXC-28", "1-RH-1", "1-SHC-28"]);
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

  it("reads a room code of up to six letters and digits after the number, never a temporary unit", () => {
    // The six-letter limit guards the building token's strip: a longer tail
    // behind a building number leaves the mark as printed, read by no rule.
    const tags = compile([table("m.pdf#30", "TWO-PIPE FAN COIL UNIT SCHEDULE", ["001-FCU-01-CG06A", "001-FCU-02-C106A", "001-FCU-03-ROOM101X"])]);
    assert.deepEqual(tags("FCU"), ["001-FCU-01-CG06A", "001-FCU-02-C106A"]);
    assert.equal(markCoreForKeyRe("1-AC-36TEMP"), "1-AC-36TEMP");
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
