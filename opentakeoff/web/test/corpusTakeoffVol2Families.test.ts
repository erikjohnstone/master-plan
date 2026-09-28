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
