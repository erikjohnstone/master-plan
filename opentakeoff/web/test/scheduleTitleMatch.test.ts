/**
 * Soft schedule-title matching — set-agnostic (no-space titles, sibling excludes).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  compactScheduleTitle,
  queryTitleMatchesNeedle,
  scheduleTitleMatches,
} from "../src/lib/scheduleTitleMatch.mjs";
import { HVAC_FAMILY_SPECS, normalizeEquipMark, compileHvacTakeoff } from "../src/lib/corpusTakeoff.mjs";

test("compact form strips spaces and punctuation", () => {
  assert.equal(compactScheduleTitle("AIR HANDLING UNIT SCHEDULE"), "AIRHANDLINGUNITSCHEDULE");
  assert.equal(
    compactScheduleTitle("GRILLE, REGISTER, AND DIFFUSER SCHEDULE"),
    "GRILLEREGISTERANDDIFFUSERSCHEDULE",
  );
});

test("soft title matches no-space drawing titles", () => {
  const { titleRe, exclude } = HVAC_FAMILY_SPECS.AHU;
  assert.equal(scheduleTitleMatches("AIRHANDLINGUNITSCHEDULE", titleRe, exclude), true);
  assert.equal(scheduleTitleMatches("AIR HANDLING UNIT SCHEDULE", titleRe, exclude), true);
  assert.equal(
    scheduleTitleMatches("DEDICATED OUTDOOR AIR UNIT SCHEDULE", titleRe, exclude),
    false,
  );
});

test("soft title keeps DOAH unit vs handling siblings apart", () => {
  assert.equal(
    scheduleTitleMatches(
      "DEDICATED OUTDOOR AIR UNIT SCHEDULE",
      HVAC_FAMILY_SPECS.DOAH_UNIT.titleRe,
      HVAC_FAMILY_SPECS.DOAH_UNIT.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "DEDICATED OUTDOOR AIR HANDLING UNIT SCHEDULE",
      HVAC_FAMILY_SPECS.DOAH_UNIT.titleRe,
      HVAC_FAMILY_SPECS.DOAH_UNIT.exclude,
    ),
    false,
  );
  assert.equal(
    scheduleTitleMatches(
      "DEDICATED OUTDOOR AIR HANDLING UNIT SCHEDULE",
      HVAC_FAMILY_SPECS.DOAH_HANDLING.titleRe,
      HVAC_FAMILY_SPECS.DOAH_HANDLING.exclude,
    ),
    true,
  );
});

test("soft title keeps air-cooled vs heat-recovery chillers apart", () => {
  assert.equal(
    scheduleTitleMatches(
      "AIR COOLED CHILLER SCHEDULE",
      HVAC_FAMILY_SPECS.AIR_COOLED_CHILLER.titleRe,
      HVAC_FAMILY_SPECS.AIR_COOLED_CHILLER.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "AIR COOLED HEAT RECOVERY CHILLER SCHEDULE",
      HVAC_FAMILY_SPECS.AIR_COOLED_CHILLER.titleRe,
      HVAC_FAMILY_SPECS.AIR_COOLED_CHILLER.exclude,
    ),
    false,
  );
  assert.equal(
    scheduleTitleMatches(
      "PACKAGEDAIRCOOLEDCHILLERSCHEDULE",
      HVAC_FAMILY_SPECS.AIR_COOLED_CHILLER.titleRe,
      HVAC_FAMILY_SPECS.AIR_COOLED_CHILLER.exclude,
    ),
    true,
  );
});

test("VAV family matches AIR TERMINAL BOX and VOLUME CONTROL BOX", () => {
  const { titleRe, exclude } = HVAC_FAMILY_SPECS.VAV;
  assert.equal(scheduleTitleMatches("AIR TERMINAL BOX SCHEDULE", titleRe, exclude), true);
  assert.equal(scheduleTitleMatches("VOLUME CONTROL BOX SCHEDULE", titleRe, exclude), true);
  assert.equal(scheduleTitleMatches("VAV TERMINAL BOX SCHEDULE", titleRe, exclude), true);
  assert.equal(scheduleTitleMatches("VARIABLE AIR VOLUME SCHEDULE", titleRe, exclude), true);
});

test("DOAS unit schedule matches DOAS family", () => {
  const { titleRe, exclude } = HVAC_FAMILY_SPECS.DOAS;
  assert.equal(scheduleTitleMatches("DOAS UNIT SCHEDULE", titleRe, exclude), true);
  assert.equal(scheduleTitleMatches("DEDICATED OUTDOOR AIR HANDLING UNIT SCHEDULE", titleRe, exclude), false);
});

test("HHW control valve matches spelled-out hot-water parenthetical titles", () => {
  const { titleRe, exclude } = HVAC_FAMILY_SPECS.HHW_CONTROL_VALVE;
  assert.equal(
    scheduleTitleMatches("CONTROL VALVE SCHEDULE (HOT WATER REHEAT COILS)", titleRe, exclude),
    true,
  );
  assert.equal(scheduleTitleMatches("HHW CONTROL VALVE SCHEDULE", titleRe, exclude), true);
  assert.equal(scheduleTitleMatches("BYPASS CONTROL VALVE SCHEDULE", titleRe, exclude), false);
  assert.equal(scheduleTitleMatches("CHW CONTROL VALVE SCHEDULE", titleRe, exclude), false);
});

test("FAN matches GENERAL/EXHAUST fan schedules but not fan-coil", () => {
  const { titleRe, exclude } = HVAC_FAMILY_SPECS.FAN;
  assert.equal(scheduleTitleMatches("FANSCHEDULE", titleRe, exclude), true);
  assert.equal(scheduleTitleMatches("GENERAL FAN SCHEDULE", titleRe, exclude), true);
  assert.equal(scheduleTitleMatches("EXHAUST FAN SCHEDULE", titleRe, exclude), true);
  assert.equal(scheduleTitleMatches("FAN COIL UNIT SCHEDULE", titleRe, exclude), false);
  assert.equal(scheduleTitleMatches("FAN SOUND POWER LEVEL SCHEDULE", titleRe, exclude), false);
});

test("WP1.4 family keyRe accepts BOILER1 and blank-title FCU/EF marks (set-agnostic)", () => {
  const { keyRe: boilerKey } = HVAC_FAMILY_SPECS.BOILER;
  const { keyRe: fcuKey } = HVAC_FAMILY_SPECS.FCU;
  const { keyRe: fanKey } = HVAC_FAMILY_SPECS.FAN;
  assert.ok(boilerKey!.test("BOILER1"));
  assert.ok(boilerKey!.test("B-1"));
  assert.ok(fcuKey!.test("FCU-1"));
  assert.ok(fcuKey!.test("EV-3"));
  assert.ok(fanKey!.test("EF-2"));
  assert.ok(fanKey!.test("SPF-T1"));
  assert.ok(!fanKey!.test("NOTES"));
});

test("normalizeEquipMark strips (N)/(E) drawing revision prefixes", () => {
  assert.equal(normalizeEquipMark("(N)ACC-2"), "ACC-2");
  assert.equal(normalizeEquipMark("(N)ATU K1"), "ATU K1");
  assert.equal(normalizeEquipMark("NACC-2"), "ACC-2");
  assert.equal(normalizeEquipMark("NATUK1"), "ATUK1");
  assert.equal(normalizeEquipMark("AHU-1"), "AHU-1");
  assert.ok(HVAC_FAMILY_SPECS.CONDENSING_UNIT.blankKeyRe!.test("ACC-2"));
  assert.ok(HVAC_FAMILY_SPECS.VAV.keyRe!.test("ATUK1"));
});

test("RTU / ERV / furnace / heat-pump titles match set-agnostic families", () => {
  assert.equal(
    scheduleTitleMatches("ROOF TOP UNIT SCHEDULE", HVAC_FAMILY_SPECS.RTU.titleRe, HVAC_FAMILY_SPECS.RTU.exclude),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "GAS-FIRED DX COOLING ROOF TOP UNIT SCHEDULE (BID ALTERNATE 1)",
      HVAC_FAMILY_SPECS.RTU.titleRe,
      HVAC_FAMILY_SPECS.RTU.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "ENERGY RECOVERY VENTILATOR SCHEDULE",
      HVAC_FAMILY_SPECS.ERV.titleRe,
      HVAC_FAMILY_SPECS.ERV.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "2-STAGE, GAS FIRED FURNACE SCHEDULE",
      HVAC_FAMILY_SPECS.FURNACE.titleRe,
      HVAC_FAMILY_SPECS.FURNACE.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "MULTI-SPLIT HEAT PUMP OUTDOOR UNIT PERFORMANCE SCHEDULE",
      HVAC_FAMILY_SPECS.HEAT_PUMP.titleRe,
      HVAC_FAMILY_SPECS.HEAT_PUMP.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "AIR-COOLED CONDENSING UNIT",
      HVAC_FAMILY_SPECS.CONDENSING_UNIT.titleRe,
      HVAC_FAMILY_SPECS.CONDENSING_UNIT.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "ELECTRIC HEATER SCHEDULE",
      HVAC_FAMILY_SPECS.UNIT_HEATER.titleRe,
      HVAC_FAMILY_SPECS.UNIT_HEATER.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "GAS FIRED MAKE-UP AIR UNIT SCHEDULE",
      HVAC_FAMILY_SPECS.OUTDOOR_AIR_UNIT.titleRe,
      HVAC_FAMILY_SPECS.OUTDOOR_AIR_UNIT.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "SPLIT-SYSTEM AIR CONDITIONING UNIT SCHEDULE",
      HVAC_FAMILY_SPECS.FCU.titleRe,
      HVAC_FAMILY_SPECS.FCU.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "BUFFER TANK SCHEDULE",
      HVAC_FAMILY_SPECS.BUFFER_TANK.titleRe,
      HVAC_FAMILY_SPECS.BUFFER_TANK.exclude,
    ),
    true,
  );
  assert.ok(HVAC_FAMILY_SPECS.BUFFER_TANK.keyRe!.test("BT-1"));
  assert.equal(
    scheduleTitleMatches(
      "GRILLES, REGISTERS, AND DIFFUSERS SCHEDULE - PROJECT 4",
      HVAC_FAMILY_SPECS.GRD.titleRe,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "GRILLE, REGISTER, AND DIFFUSER SCHEDULE",
      HVAC_FAMILY_SPECS.GRD.titleRe,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "AIR INLETS & OUTLETS",
      HVAC_FAMILY_SPECS.GRD.titleRe,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "GRILLE SCHEDULE",
      HVAC_FAMILY_SPECS.GRD.titleRe,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "AIR DEVICE SCHEDULE (SUPPLY)",
      HVAC_FAMILY_SPECS.GRD.titleRe,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "SINGLE DUCT AIR TERMINAL UNIT SCHEDULE",
      HVAC_FAMILY_SPECS.VAV.titleRe,
      HVAC_FAMILY_SPECS.VAV.exclude,
    ),
    true,
  );
  assert.ok(HVAC_FAMILY_SPECS.VAV.keyRe!.test("ATU-6-1"));
  assert.equal(
    scheduleTitleMatches(
      "LAB CAV SCHEDULE",
      HVAC_FAMILY_SPECS.VAV.titleRe,
      HVAC_FAMILY_SPECS.VAV.exclude,
    ),
    true,
  );
  assert.ok(HVAC_FAMILY_SPECS.VAV.keyRe!.test("CAV-NB-1"));
  assert.ok(HVAC_FAMILY_SPECS.FCU.keyRe!.test("FCUC"));
  assert.ok(HVAC_FAMILY_SPECS.AHU.keyRe!.test("AC-57"));
  assert.equal(
    scheduleTitleMatches(
      "ELECTRIC RADIANT CEILING PANEL SCHEDULE - PROJECT 4",
      HVAC_FAMILY_SPECS.RADIANT_CEILING_PANEL.titleRe,
      HVAC_FAMILY_SPECS.RADIANT_CEILING_PANEL.exclude,
    ),
    true,
  );
  assert.ok(HVAC_FAMILY_SPECS.RADIANT_CEILING_PANEL.keyRe!.test("ECP-1"));
  assert.ok(!HVAC_FAMILY_SPECS.RADIANT_CEILING_PANEL.keyRe!.test("WCFV-1"));
  assert.equal(
    scheduleTitleMatches(
      "FINNED PIPE RADIATION SCHEDULE",
      HVAC_FAMILY_SPECS.FIN_TUBE_RADIATION.titleRe,
      HVAC_FAMILY_SPECS.FIN_TUBE_RADIATION.exclude,
    ),
    true,
  );
  assert.ok(HVAC_FAMILY_SPECS.FIN_TUBE_RADIATION.keyRe!.test("FT-1"));
  assert.ok(HVAC_FAMILY_SPECS.FIN_TUBE_RADIATION.keyRe!.test("FTR-2"));
});

test("WP1.4 HEAT_PUMP / FCU / HRC / AS / ET keyRe tighteners (set-agnostic)", () => {
  const hp = HVAC_FAMILY_SPECS.HEAT_PUMP;
  assert.ok(hp.keyRe!.test("HP-5"));
  assert.ok(hp.keyRe!.test("AHU-1HP-1"));
  assert.ok(hp.keyRe!.test("SCU-1"));
  assert.ok(hp.keyRe!.test("SAC-1"));
  assert.ok(!hp.keyRe!.test("CHP-1"));
  assert.ok(!hp.keyRe!.test("EH-1"));
  assert.ok(hp.blankKeyRe!.test("HP-01"));
  assert.ok(!hp.blankKeyRe!.test("WSHP-1"));
  assert.equal(
    scheduleTitleMatches(
      "ENERGY RECOVERY UNIT SCHEDULE (WITH HEAT PUMP)",
      hp.titleRe,
      hp.exclude,
    ),
    false,
  );
  assert.equal(
    scheduleTitleMatches("HYDRONIC PUMPS", HVAC_FAMILY_SPECS.PUMP.titleRe, HVAC_FAMILY_SPECS.PUMP.exclude),
    true,
  );
  assert.equal(
    scheduleTitleMatches("HEAT PUMP SCHEDULE", HVAC_FAMILY_SPECS.PUMP.titleRe, HVAC_FAMILY_SPECS.PUMP.exclude),
    false,
  );
  assert.equal(
    scheduleTitleMatches("VACUUM PUMP SCHEDULE", HVAC_FAMILY_SPECS.PUMP.titleRe, HVAC_FAMILY_SPECS.PUMP.exclude),
    false,
  );
  assert.equal(
    scheduleTitleMatches("CONDENSATE PUMP SCHEDULE", HVAC_FAMILY_SPECS.PUMP.titleRe, HVAC_FAMILY_SPECS.PUMP.exclude),
    true,
  );
  assert.ok(HVAC_FAMILY_SPECS.FCU.keyRe!.test("FC-101"));
  assert.ok(HVAC_FAMILY_SPECS.FCU.keyRe!.test("FCU-1"));
  assert.ok(!HVAC_FAMILY_SPECS.HEAT_RECOVERY_CHILLER.keyRe!.test("CHECK:"));
  assert.ok(HVAC_FAMILY_SPECS.HEAT_RECOVERY_CHILLER.keyRe!.test("CH-1"));
  assert.ok(HVAC_FAMILY_SPECS.UNIT_HEATER.keyRe!.test("EH-1"));
  assert.ok(HVAC_FAMILY_SPECS.UNIT_HEATER.keyRe!.test("UH-01"));
  assert.ok(!HVAC_FAMILY_SPECS.UNIT_HEATER.keyRe!.test("MODEL"));
  assert.ok(HVAC_FAMILY_SPECS.AIR_SEPARATOR.keyRe!.test("AS-1"));
  assert.ok(!HVAC_FAMILY_SPECS.AIR_SEPARATOR.keyRe!.test("LCV-1"));
  assert.ok(HVAC_FAMILY_SPECS.EXPANSION_TANK.keyRe!.test("ET-1"));
  assert.ok(HVAC_FAMILY_SPECS.EXPANSION_TANK.keyRe!.test("XT-2"));
  assert.ok(!HVAC_FAMILY_SPECS.EXPANSION_TANK.keyRe!.test("DT-1"));
  assert.equal(
    scheduleTitleMatches(
      "ELECTRIC HEATERS",
      HVAC_FAMILY_SPECS.UNIT_HEATER.titleRe,
      HVAC_FAMILY_SPECS.UNIT_HEATER.exclude,
    ),
    true,
  );
  // VRF indoor cassette / air-handler terminals on HEAT PUMP schedules.
  assert.ok(HVAC_FAMILY_SPECS.HEAT_PUMP.keyRe!.test("CC-8-1"));
  assert.ok(HVAC_FAMILY_SPECS.HEAT_PUMP.keyRe!.test("AH-30-8"));
  assert.ok(!HVAC_FAMILY_SPECS.HEAT_PUMP.keyRe!.test("AHU-1"));
  // Relief fans (REF-*) — RF alone must not require a hyphen after REF's E.
  assert.ok(HVAC_FAMILY_SPECS.FAN.keyRe!.test("REF-1"));
  assert.ok(HVAC_FAMILY_SPECS.FAN.keyRe!.test("EF-1"));
  assert.equal(
    scheduleTitleMatches(
      "CEILING FAN SCHEDULE",
      HVAC_FAMILY_SPECS.FAN.titleRe,
      HVAC_FAMILY_SPECS.FAN.exclude,
    ),
    false,
  );
  assert.equal(
    scheduleTitleMatches(
      "ELECTRIC DUCT HEATER SCHEDULE",
      HVAC_FAMILY_SPECS.UNIT_HEATER.titleRe,
      HVAC_FAMILY_SPECS.UNIT_HEATER.exclude,
    ),
    true,
  );
  assert.ok(HVAC_FAMILY_SPECS.UNIT_HEATER.keyRe!.test("EDH-1"));
  assert.equal(
    scheduleTitleMatches(
      "WATER-TO-WATER HEAT EXCHANGER SCHEDULE",
      HVAC_FAMILY_SPECS.HEAT_EXCHANGER.titleRe,
      HVAC_FAMILY_SPECS.HEAT_EXCHANGER.exclude,
    ),
    true,
  );
  assert.ok(HVAC_FAMILY_SPECS.HEAT_EXCHANGER.keyRe!.test("PHX-1"));
  assert.ok(HVAC_FAMILY_SPECS.HEAT_EXCHANGER.keyRe!.test("HX-2"));
  assert.equal(
    scheduleTitleMatches(
      "DUCT MOUNTED COIL SCHEDULE",
      HVAC_FAMILY_SPECS.DUCT_MOUNTED_COIL.titleRe,
      HVAC_FAMILY_SPECS.DUCT_MOUNTED_COIL.exclude,
    ),
    true,
  );
  assert.ok(HVAC_FAMILY_SPECS.DUCT_MOUNTED_COIL.keyRe!.test("CC-1"));
  assert.ok(HVAC_FAMILY_SPECS.DUCT_MOUNTED_COIL.keyRe!.test("HC-1"));
  assert.equal(
    scheduleTitleMatches(
      "HOT WATER REHEAT COIL SCHEDULE",
      HVAC_FAMILY_SPECS.DUCT_MOUNTED_COIL.titleRe,
      HVAC_FAMILY_SPECS.DUCT_MOUNTED_COIL.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "CONTROL VALVE SCHEDULE (HOT WATER REHEAT COILS)",
      HVAC_FAMILY_SPECS.DUCT_MOUNTED_COIL.titleRe,
      HVAC_FAMILY_SPECS.DUCT_MOUNTED_COIL.exclude,
    ),
    false,
  );
  assert.ok(HVAC_FAMILY_SPECS.HUMIDIFIER.keyRe!.test("HUM-1"));
  assert.ok(!HVAC_FAMILY_SPECS.HUMIDIFIER.keyRe!.test("HC-1"));
  assert.equal(
    scheduleTitleMatches(
      "DUCTLESS SPLIT HIGH WALL COOLING UNIT SCHEDULE",
      HVAC_FAMILY_SPECS.FCU.titleRe,
      HVAC_FAMILY_SPECS.FCU.exclude,
    ),
    true,
  );
  assert.ok(HVAC_FAMILY_SPECS.FCU.keyRe!.test("DFC-1"));
  assert.ok(HVAC_FAMILY_SPECS.FCU.keyRe!.test("DCU-1"));
  assert.equal(
    scheduleTitleMatches(
      "FLASH TANK SCHEDULE",
      HVAC_FAMILY_SPECS.FLASH_TANK.titleRe,
      HVAC_FAMILY_SPECS.FLASH_TANK.exclude,
    ),
    true,
  );
  assert.ok(HVAC_FAMILY_SPECS.FLASH_TANK.keyRe!.test("FT-1"));
  assert.equal(
    scheduleTitleMatches(
      "WATER TREATMENT SCHEDULE",
      HVAC_FAMILY_SPECS.WATER_TREATMENT.titleRe,
      HVAC_FAMILY_SPECS.WATER_TREATMENT.exclude,
    ),
    true,
  );
  assert.ok(HVAC_FAMILY_SPECS.WATER_TREATMENT.keyRe!.test("RO-1"));
});

test("MISCELLANEOUS SCHEDULE yields only keyRe-gated family marks (set-agnostic)", () => {
  // Catch-all misc tables must not inflate untitled pump rows via keyRe —
  // PUMP uses blankKeyRe only so titled PUMP SCHEDULE stays unfiltered.
  assert.equal(HVAC_FAMILY_SPECS.PUMP.keyRe, undefined);
  assert.ok(HVAC_FAMILY_SPECS.PUMP.blankKeyRe!.test("HWP-1"));
  assert.ok(HVAC_FAMILY_SPECS.PUMP.blankKeyRe!.test("IWP-1"));
  assert.ok(HVAC_FAMILY_SPECS.PUMP.blankKeyRe!.test("HWRP-1"));
  assert.ok(HVAC_FAMILY_SPECS.UNIT_HEATER.keyRe!.test("EH-20"));
  assert.ok(HVAC_FAMILY_SPECS.DOAS.keyRe!.test("DOAS-30"));
  assert.equal(
    scheduleTitleMatches("PUPSCHEDULE", HVAC_FAMILY_SPECS.PUMP.titleRe, HVAC_FAMILY_SPECS.PUMP.exclude),
    true,
  );
});

test("EQUIPMENT SCHEDULE catch-all ORs blankKeyRe|keyRe (WSHP via HEAT_PUMP keyRe)", () => {
  const graph = {
    tables: [{
      kind: "equipment",
      sheet: "m.pdf#4",
      title: { text: "EQUIPMENT SCHEDULE" },
      rows: [
        { key: "WSHP-1", cells: { MARK: { text: "WSHP-1" } } },
        { key: "HWP-1", cells: { MARK: { text: "HWP-1" } } },
        { key: "CU-1", cells: { MARK: { text: "CU-1" } } },
        { key: "BS-1", cells: { MARK: { text: "BS-1" } } },
      ],
    }],
  };
  const hvac = compileHvacTakeoff(null, graph);
  assert.equal(hvac.categories.HEAT_PUMP.count, 1);
  assert.equal(hvac.categories.PUMP.count, 1);
  assert.equal(hvac.categories.CONDENSING_UNIT.count, 1);
  assert.equal(hvac.categories.HEAT_PUMP.items[0].tag, "WSHP-1");
  assert.equal(hvac.categories.PUMP.items[0].tag, "HWP-1");
  assert.equal(hvac.categories.CONDENSING_UNIT.items[0].tag, "CU-1");
  // BS-1 has no family keyRe — stay orphan (no silent inflation).
  for (const [fam, cat] of Object.entries(hvac.categories)) {
    if (["HEAT_PUMP", "PUMP", "CONDENSING_UNIT"].includes(fam)) continue;
    assert.equal(cat.count, 0, `unexpected ${fam}`);
  }
});

test("MECHANICAL SPECIALTY EQUIPMENT + ductless comma marks (itd shape)", () => {
  const graph = {
    tables: [
      {
        kind: "equipment",
        sheet: "m.pdf#14",
        title: { text: "MECHANICAL SPECIALTY EQUIPMENT SCHEDULE" },
        rows: [
          { key: "AS-1", cells: { MARK: { text: "AS-1" } } },
          { key: "ET-1", cells: { MARK: { text: "ET-1" } } },
          { key: "FM-1", cells: { MARK: { text: "FM-1" } } },
        ],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#14",
        title: { text: "DUCTLESS SPLIT HIGH WALL COOLING UNIT SCHEDULE" },
        rows: [
          { key: "DFC-1DCU-1", cells: { SYMBOL: { text: "DFC-1 , DCU-1" } } },
        ],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#13",
        title: { text: "HOT WATER REHEAT COIL SCHEDULE" },
        rows: [
          { key: "HC-1", cells: { MARK: { text: "HC-1" } } },
          { key: "HC-2", cells: { MARK: { text: "HC-2" } } },
        ],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#5",
        title: { text: "ENERGY RECOVERY UNIT SCHEDULE (WITH HEAT PUMP)" },
        rows: [
          { key: "ERU-1HP-4", cells: { SYMBOL: { text: '"ERU-1, HP-4"' } } },
        ],
      },
    ],
  };
  const hvac = compileHvacTakeoff(null, graph);
  assert.equal(hvac.categories.AIR_SEPARATOR.count, 1);
  assert.equal(hvac.categories.EXPANSION_TANK.count, 1);
  assert.equal(hvac.categories.FCU.count, 2);
  assert.deepEqual(hvac.categories.FCU.items.map((i) => i.tag).sort(), ["DCU-1", "DFC-1"]);
  assert.equal(hvac.categories.DUCT_MOUNTED_COIL.count, 2);
  // Untagged ERV: do not inflate from SYMBOL comma list — keep row.key.
  assert.equal(hvac.categories.ERV.count, 1);
  assert.equal(hvac.categories.ERV.items[0].tag, "ERU-1HP-4");
});

test("query_table soft needle hits no-space titles for long needles", () => {
  assert.equal(
    queryTitleMatchesNeedle("AIRHANDLINGUNITSCHEDULE", "AIR HANDLING UNIT SCHEDULE"),
    true,
  );
  assert.equal(
    queryTitleMatchesNeedle("FAN COIL UNIT SCHEDULE", "AIR HANDLING UNIT SCHEDULE"),
    false,
  );
  // Short needles (<12 spaced chars): exact/prefix only on spaced form.
  // "FAN SCHEDULE" is long enough to soft-match; bare "FAN" must not hit FAN COIL.
  assert.equal(queryTitleMatchesNeedle("FAN COIL UNIT SCHEDULE", "FAN SCHEDULE"), false);
  assert.equal(queryTitleMatchesNeedle("FAN SCHEDULE", "FAN SCHEDULE"), true);
});
