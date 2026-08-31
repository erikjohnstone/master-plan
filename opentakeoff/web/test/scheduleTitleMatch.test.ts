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
import { HVAC_FAMILY_SPECS, normalizeEquipMark, expandAmpersandEquipMarks, compileHvacTakeoff } from "../src/lib/corpusTakeoff.mjs";

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

test("normalizeEquipMark strips SYMBOL CFM/size/room trailers (Baker GRD)", () => {
  assert.equal(normalizeEquipMark("G-2 CFM"), "G-2");
  assert.equal(normalizeEquipMark("R-1 30x6"), "R-1");
  assert.equal(normalizeEquipMark("EH-1 TOILET 135"), "EH-1");
  assert.equal(normalizeEquipMark("AHU-1"), "AHU-1");
  // Comma compounds must survive for later family split (Baker AHU-1, HP-1).
  assert.equal(normalizeEquipMark("AHU-1, HP-1"), "AHU-1, HP-1");
  assert.equal(normalizeEquipMark("AHU-1 , HP-1"), "AHU-1 , HP-1");
  assert.equal(normalizeEquipMark("ERU-1, HP-4"), "ERU-1, HP-4");
});

test("expandAmpersandEquipMarks splits paired schedule tags (Northport RF-1 & 2)", () => {
  assert.deepEqual(expandAmpersandEquipMarks("RF-1 & 2"), ["RF-1", "RF-2"]);
  assert.deepEqual(expandAmpersandEquipMarks("RF-1 & RF-2"), ["RF-1", "RF-2"]);
  assert.deepEqual(expandAmpersandEquipMarks("RF-1&2"), ["RF-1", "RF-2"]);
  assert.deepEqual(expandAmpersandEquipMarks("AHU-1 & AHU-2"), ["AHU-1", "AHU-2"]);
  // Prose / non-identity must stay whole.
  assert.deepEqual(expandAmpersandEquipMarks("B & G MODEL SRS-3F"), ["B & G MODEL SRS-3F"]);
  assert.deepEqual(expandAmpersandEquipMarks("RF-12"), ["RF-12"]);
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
  assert.ok(HVAC_FAMILY_SPECS.AIR_SEPARATOR.keyRe!.test("HS-1"));
  assert.ok(!HVAC_FAMILY_SPECS.AIR_SEPARATOR.keyRe!.test("LCV-1"));
  assert.ok(HVAC_FAMILY_SPECS.EXPANSION_TANK.keyRe!.test("ET-1"));
  assert.ok(HVAC_FAMILY_SPECS.EXPANSION_TANK.keyRe!.test("XT-2"));
  assert.ok(HVAC_FAMILY_SPECS.EXPANSION_TANK.keyRe!.test("DT-1"));
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
  assert.ok(!HVAC_FAMILY_SPECS.FCU.keyRe!.test("DCU-1"));
  assert.ok(HVAC_FAMILY_SPECS.FCU.keyRe!.test("F-1"));
  assert.ok(!HVAC_FAMILY_SPECS.FCU.keyRe!.test("CU-1"));
  assert.equal(
    scheduleTitleMatches(
      "SPLIT SYSTEM AIR CONDITIONING UNIT SCHEDULE (96%+ GAS)",
      HVAC_FAMILY_SPECS.CONDENSING_UNIT.altTitleRe!,
      HVAC_FAMILY_SPECS.CONDENSING_UNIT.exclude,
    ),
    true,
  );
  assert.ok(HVAC_FAMILY_SPECS.CONDENSING_UNIT.altKeyRe!.test("CU-1"));
  assert.ok(HVAC_FAMILY_SPECS.CONDENSING_UNIT.altKeyRe!.test("DCU-1"));
  assert.ok(!HVAC_FAMILY_SPECS.CONDENSING_UNIT.altKeyRe!.test("F-1"));
  assert.ok(!HVAC_FAMILY_SPECS.CONDENSING_UNIT.altKeyRe!.test("B1"));
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
  assert.equal(
    scheduleTitleMatches(
      "DEDICATED OUTDOOR AIR SYSTEM",
      HVAC_FAMILY_SPECS.DOAS.titleRe,
      HVAC_FAMILY_SPECS.DOAS.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "DEDICATED OUTDOOR AIR UNIT SCHEDULE",
      HVAC_FAMILY_SPECS.DOAS.titleRe,
      HVAC_FAMILY_SPECS.DOAS.exclude,
    ),
    false,
  );
  assert.equal(
    scheduleTitleMatches(
      "SNORKEL HOOD SCHEDULE",
      HVAC_FAMILY_SPECS.RANGE_HOOD.titleRe,
      HVAC_FAMILY_SPECS.RANGE_HOOD.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "PRESSURE INDEPENDENT ROOM SUPPLY VALVE SCHEDULE",
      HVAC_FAMILY_SPECS.LAB_AIR_VALVE.titleRe,
      HVAC_FAMILY_SPECS.LAB_AIR_VALVE.exclude,
    ),
    true,
  );
  assert.ok(HVAC_FAMILY_SPECS.LAB_AIR_VALVE.keyRe!.test("SAV-1"));
  assert.ok(HVAC_FAMILY_SPECS.LAB_AIR_VALVE.keyRe!.test("GEV-3"));
  assert.ok(HVAC_FAMILY_SPECS.LAB_AIR_VALVE.keyRe!.test("SEV-2"));
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
        { key: "LV-1", cells: { MARK: { text: "LV-1" } } },
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
  // Louvers stay orphan (no family).
  for (const [fam, cat] of Object.entries(hvac.categories)) {
    if (["HEAT_PUMP", "PUMP", "CONDENSING_UNIT"].includes(fam)) continue;
    assert.equal(cat.count, 0, `unexpected ${fam}`);
  }
});

test("accessory families: pot feeder, GMU, strainer, bypass, BS booster, HS, DT", () => {
  assert.equal(
    scheduleTitleMatches(
      "CHEMICAL POT FEEDER SCHEDULE",
      HVAC_FAMILY_SPECS.CHEMICAL_POT_FEEDER.titleRe,
      HVAC_FAMILY_SPECS.CHEMICAL_POT_FEEDER.exclude,
    ),
    true,
  );
  assert.ok(HVAC_FAMILY_SPECS.CHEMICAL_POT_FEEDER.keyRe!.test("PF-1"));
  assert.ok(HVAC_FAMILY_SPECS.GLYCOL_MAKEUP.keyRe!.test("GMU-2"));
  assert.ok(HVAC_FAMILY_SPECS.STRAINER.keyRe!.test("STR-1"));
  assert.ok(!HVAC_FAMILY_SPECS.STRAINER.keyRe!.test("FTR-1"));
  assert.ok(HVAC_FAMILY_SPECS.BYPASS_CONTROL_VALVE.keyRe!.test("BCV-1"));
  assert.ok(HVAC_FAMILY_SPECS.PUMP.blankKeyRe!.test("BS-1"));
  assert.ok(HVAC_FAMILY_SPECS.AIR_SEPARATOR.keyRe!.test("HS-1"));
  assert.ok(HVAC_FAMILY_SPECS.EXPANSION_TANK.keyRe!.test("DT-1"));
  assert.equal(
    scheduleTitleMatches(
      "AIR COMPRESSOR SCHEDULE",
      HVAC_FAMILY_SPECS.AIR_COMPRESSOR.titleRe,
      HVAC_FAMILY_SPECS.AIR_COMPRESSOR.exclude,
    ),
    true,
  );
  assert.equal(HVAC_FAMILY_SPECS.AIR_COMPRESSOR.keyRe, undefined);
  assert.equal(
    scheduleTitleMatches(
      "HYDRONIC FLOW METER SCHEDULE",
      HVAC_FAMILY_SPECS.FLOW_METER.titleRe,
      HVAC_FAMILY_SPECS.FLOW_METER.exclude,
    ),
    true,
  );
  assert.ok(HVAC_FAMILY_SPECS.FLOW_METER.keyRe!.test("FM-1"));
  assert.equal(
    scheduleTitleMatches(
      "CONTROL DAMPER SCHEDULE",
      HVAC_FAMILY_SPECS.CONTROL_DAMPER.titleRe,
      HVAC_FAMILY_SPECS.CONTROL_DAMPER.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "FIRE DAMPER SCHEDULE",
      HVAC_FAMILY_SPECS.CONTROL_DAMPER.titleRe,
      HVAC_FAMILY_SPECS.CONTROL_DAMPER.exclude,
    ),
    false,
  );
  assert.ok(HVAC_FAMILY_SPECS.CONTROL_DAMPER.keyRe!.test("OA1"));
  assert.ok(HVAC_FAMILY_SPECS.CONTROL_DAMPER.keyRe!.test("OA-2"));
  assert.ok(!HVAC_FAMILY_SPECS.CONTROL_DAMPER.keyRe!.test("B1"));
});

test("FLOW_METER catch-all + CONTROL_DAMPER titled compile", () => {
  const graph = {
    tables: [
      {
        kind: "equipment",
        sheet: "m.pdf#1",
        title: { text: "MECHANICAL SPECIALTY EQUIPMENT SCHEDULE" },
        rows: [
          { key: "AS-1", cells: { MARK: { text: "AS-1" } } },
          { key: "FM-1", cells: { MARK: { text: "FM-1" } } },
          { key: "ET-1", cells: { MARK: { text: "ET-1" } } },
        ],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#2",
        title: { text: "CONTROL DAMPER SCHEDULE" },
        rows: [
          { key: "B1", cells: { MARK: { text: "B1" } } },
          { key: "OA1", cells: { MARK: { text: "OA1" } } },
          { key: "OA2", cells: { MARK: { text: "OA2" } } },
        ],
      },
    ],
  };
  const hvac = compileHvacTakeoff(null, graph);
  assert.equal(hvac.categories.FLOW_METER.count, 1);
  assert.equal(hvac.categories.FLOW_METER.items[0].tag, "FM-1");
  assert.equal(hvac.categories.AIR_SEPARATOR.count, 1);
  assert.equal(hvac.categories.EXPANSION_TANK.count, 1);
  assert.equal(hvac.categories.CONTROL_DAMPER.count, 2);
  assert.deepEqual(
    hvac.categories.CONTROL_DAMPER.items.map((i) => i.tag).sort(),
    ["OA1", "OA2"],
  );
  assert.equal(hvac.totals.items, 5);
});

test("LOUVER + LOUVERED_PENTHOUSE titled compile; FIN_TUBE titledOnly skips filter FTR", () => {
  assert.equal(
    scheduleTitleMatches(
      "LOUVER SCHEDULE",
      HVAC_FAMILY_SPECS.LOUVER.titleRe,
      HVAC_FAMILY_SPECS.LOUVER.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "ARCHITECTURAL LOUVERED PENTHOUSE SCHEDULE",
      HVAC_FAMILY_SPECS.LOUVERED_PENTHOUSE.titleRe,
      HVAC_FAMILY_SPECS.LOUVERED_PENTHOUSE.exclude,
    ),
    true,
  );
  assert.equal(HVAC_FAMILY_SPECS.FIN_TUBE_RADIATION.titledOnly, true);
  assert.equal(HVAC_FAMILY_SPECS.FILTER.titledOnly, true);
  const graph = {
    tables: [
      {
        kind: "equipment",
        sheet: "m.pdf#1",
        title: { text: "LOUVER SCHEDULE" },
        rows: [
          { key: "LV-1", cells: { MARK: { text: "LV-1" } } },
          { key: "L-2", cells: { MARK: { text: "L-2" } } },
        ],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#2",
        title: { text: "PENTHOUSE SCHEDULE" },
        rows: [{ key: "PH-1", cells: { MARK: { text: "PH-1" } } }],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#3",
        title: { text: "FIN TUBE RADIATION SCHEDULE" },
        rows: [{ key: "FTR-1", cells: { MARK: { text: "FTR-1" } } }],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#4",
        title: { text: "FILTER & STRAINER SCHEDULE" },
        rows: [
          { key: "FTR-2", cells: { MARK: { text: "FTR-2" } } },
          { key: "STR-1", cells: { MARK: { text: "STR-1" } } },
        ],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#5",
        title: { text: "" },
        rows: [{ key: "FTR-9", cells: { MARK: { text: "FTR-9" } } }],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#6",
        title: { text: "EQUIPMENT SCHEDULE" },
        rows: [{ key: "FTR-8", cells: { MARK: { text: "FTR-8" } } }],
      },
    ],
  };
  const hvac = compileHvacTakeoff(null, graph);
  assert.equal(hvac.categories.LOUVER.count, 2);
  assert.equal(hvac.categories.LOUVERED_PENTHOUSE.count, 1);
  assert.equal(hvac.categories.FIN_TUBE_RADIATION.count, 1);
  assert.equal(hvac.categories.FIN_TUBE_RADIATION.items[0].tag, "FTR-1");
  assert.equal(hvac.categories.FILTER.count, 1);
  assert.equal(hvac.categories.FILTER.items[0].tag, "FTR-2");
  assert.equal(hvac.categories.STRAINER.count, 1);
  // Blank + catch-all FTR must not inflate FIN_TUBE or FILTER.
  assert.ok(!hvac.categories.FIN_TUBE_RADIATION.items.some((i) => /FTR-9|FTR-8/i.test(i.tag)));
  assert.ok(!hvac.categories.FILTER.items.some((i) => /FTR-9|FTR-8/i.test(i.tag)));
});

test("HYDRONIC ACCESSORIES claims PF/GMU/HS (Klamath shape)", () => {
  const graph = {
    tables: [{
      kind: "equipment",
      sheet: "m.pdf#5",
      title: { text: "HYDRONIC ACCESSORIES" },
      rows: [
        { key: "AS-1", cells: { MARK: { text: "AS-1" } } },
        { key: "HS-1", cells: { MARK: { text: "HS-1" } } },
        { key: "GMU-1", cells: { MARK: { text: "GMU-1" } } },
        { key: "PF-1", cells: { MARK: { text: "PF-1" } } },
      ],
    }],
  };
  const hvac = compileHvacTakeoff(null, graph);
  assert.equal(hvac.categories.AIR_SEPARATOR.count, 2);
  assert.equal(hvac.categories.GLYCOL_MAKEUP.count, 1);
  assert.equal(hvac.categories.CHEMICAL_POT_FEEDER.count, 1);
  assert.equal(hvac.totals.items, 4);
});

test("HYDRONIC ACCESSORIES catch-all claims AS/BT/ET (Klamath shape)", () => {
  const graph = {
    tables: [{
      kind: "equipment",
      sheet: "m.pdf#5",
      title: { text: "HYDRONIC ACCESSORIES" },
      rows: [
        { key: "AS-1", cells: { MARK: { text: "AS-1" } } },
        { key: "BT-1", cells: { MARK: { text: "BT-1" } } },
        { key: "ET-1", cells: { MARK: { text: "ET-1" } } },
        { key: "JUNK-1", cells: { MARK: { text: "JUNK-1" } } },
      ],
    }],
  };
  const hvac = compileHvacTakeoff(null, graph);
  assert.equal(hvac.categories.AIR_SEPARATOR.count, 1);
  assert.equal(hvac.categories.BUFFER_TANK.count, 1);
  assert.equal(hvac.categories.EXPANSION_TANK.count, 1);
  assert.equal(hvac.categories.AIR_SEPARATOR.items[0].tag, "AS-1");
  assert.equal(hvac.totals.items, 3);
});

test("LAB_AIR_VALVE + snorkel hood compile (itd shape)", () => {
  const graph = {
    tables: [
      {
        kind: "equipment",
        sheet: "m.pdf#12",
        title: { text: "PRESSURE INDEPENDENT ROOM SUPPLY VALVE SCHEDULE" },
        rows: [
          { key: "SAV-1", cells: { MARK: { text: "SAV-1" } } },
          { key: "SAV-2", cells: { MARK: { text: "SAV-2" } } },
        ],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#12",
        title: { text: "SNORKEL HOOD SCHEDULE" },
        rows: [{ key: "SN-1", cells: { MARK: { text: "SN-1" } } }],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#5",
        title: { text: "DEDICATED OUTDOOR AIR SYSTEM" },
        rows: [
          { key: "DOAS-1", cells: { MARK: { text: "DOAS-1" } } },
          { key: "DOAS-2", cells: { MARK: { text: "DOAS-2" } } },
        ],
      },
    ],
  };
  const hvac = compileHvacTakeoff(null, graph);
  assert.equal(hvac.categories.LAB_AIR_VALVE.count, 2);
  assert.equal(hvac.categories.RANGE_HOOD.count, 1);
  assert.equal(hvac.categories.DOAS.count, 2);
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
  assert.equal(hvac.categories.FCU.count, 1);
  assert.deepEqual(hvac.categories.FCU.items.map((i) => i.tag), ["DFC-1"]);
  assert.equal(hvac.categories.CONDENSING_UNIT.count, 1);
  assert.deepEqual(hvac.categories.CONDENSING_UNIT.items.map((i) => i.tag), ["DCU-1"]);
  assert.equal(hvac.categories.DUCT_MOUNTED_COIL.count, 2);
  // ERV keyRe claims ERU-*; HP half from SYMBOL comma list joins HEAT_PUMP.
  assert.equal(hvac.categories.ERV.count, 1);
  assert.equal(hvac.categories.ERV.items[0].tag, "ERU-1");
  assert.ok(hvac.categories.HEAT_PUMP.items.some((i) => i.tag === "HP-4"));
});

test("WP1.4 split-system outdoor CU joins CONDENSING_UNIT without Carson B* filter", () => {
  const graph = {
    sheets: [],
    tables: [
      {
        kind: "equipment",
        sheet: "m.pdf#1",
        title: { text: "CONDENSING UNIT SCHEDULE" },
        rows: [
          { key: "B1", cells: { MARK: { text: "B1" } } },
          { key: "B2", cells: { MARK: { text: "B2" } } },
        ],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#2",
        title: { text: "SPLIT SYSTEM AIR CONDITIONING UNIT SCHEDULE (96%+ GAS)" },
        rows: [
          { key: "F-1CU-1", cells: { SYMBOL: { text: "F-1 , CU-1" } } },
        ],
      },
    ],
  };
  const hvac = compileHvacTakeoff(null, graph);
  assert.equal(hvac.categories.CONDENSING_UNIT.count, 3);
  assert.deepEqual(
    hvac.categories.CONDENSING_UNIT.items.map((i) => i.tag).sort(),
    ["B1", "B2", "CU-1"],
  );
  assert.equal(hvac.categories.FCU.count, 1);
  assert.equal(hvac.categories.FCU.items[0].tag, "F-1");
});

test("WP1.4 CEILING_FAN titled schedule (Jeff City shape); FAN excludes ceiling fans", () => {
  assert.equal(
    scheduleTitleMatches(
      "CEILING FAN SCHEDULE",
      HVAC_FAMILY_SPECS.CEILING_FAN.titleRe,
      HVAC_FAMILY_SPECS.CEILING_FAN.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "CEILING FAN SCHEDULE",
      HVAC_FAMILY_SPECS.FAN.titleRe,
      HVAC_FAMILY_SPECS.FAN.exclude,
    ),
    false,
  );
  assert.ok(HVAC_FAMILY_SPECS.CEILING_FAN.keyRe!.test("CF-1"));
  assert.ok(!HVAC_FAMILY_SPECS.CEILING_FAN.keyRe!.test("EF-1"));
  const graph = {
    sheets: [],
    tables: [
      {
        kind: "equipment",
        sheet: "m.pdf#1",
        title: { text: "CEILING FAN SCHEDULE" },
        rows: [
          { key: "CF-1", cells: { MARK: { text: "CF-1" } } },
          { key: "CF-2", cells: { MARK: { text: "CF-2" } } },
          { key: "CF-3", cells: { MARK: { text: "CF-3" } } },
        ],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#2",
        title: { text: "EXHAUST FAN SCHEDULE" },
        rows: [{ key: "EF-1", cells: { MARK: { text: "EF-1" } } }],
      },
    ],
  };
  const hvac = compileHvacTakeoff(null, graph);
  assert.equal(hvac.categories.CEILING_FAN.count, 3);
  assert.deepEqual(hvac.categories.CEILING_FAN.items.map((i) => i.tag).sort(), ["CF-1", "CF-2", "CF-3"]);
  assert.equal(hvac.categories.FAN.count, 1);
  assert.equal(hvac.categories.FAN.items[0].tag, "EF-1");
});

test("WP1.4 FAN blank-title KEF kitchen exhaust (Klamath)", () => {
  assert.ok(HVAC_FAMILY_SPECS.FAN.keyRe!.test("KEF-1"));
  assert.ok(HVAC_FAMILY_SPECS.FAN.titleRe.test("KITCHEN EXHAUST FAN SCHEDULE"));
  const graph = {
    sheets: [],
    tables: [
      {
        kind: "equipment",
        sheet: "k.pdf#2",
        title: { text: "" },
        rows: [{ key: "KEF-1", cells: { MARK: { text: "KEF-1" }, CFM: { text: "2150" } } }],
      },
    ],
  };
  const hvac = compileHvacTakeoff(null, graph);
  assert.equal(hvac.categories.FAN.count, 1);
  assert.equal(hvac.categories.FAN.items[0].tag, "KEF-1");
});

test("WP1.4 VACUUM_PUMP titled V-* (SDSU shape); hydronic PUMP excludes vacuum", () => {
  assert.ok(HVAC_FAMILY_SPECS.VACUUM_PUMP.keyRe!.test("V-1"));
  assert.ok(!HVAC_FAMILY_SPECS.VACUUM_PUMP.keyRe!.test("VAV-1"));
  assert.equal(
    scheduleTitleMatches(
      "VACUUM PUMP SCHEDULE",
      HVAC_FAMILY_SPECS.VACUUM_PUMP.titleRe,
      HVAC_FAMILY_SPECS.VACUUM_PUMP.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "VACUUM PUMP SCHEDULE",
      HVAC_FAMILY_SPECS.PUMP.titleRe,
      HVAC_FAMILY_SPECS.PUMP.exclude,
    ),
    false,
  );
  const graph = {
    sheets: [],
    tables: [
      {
        kind: "equipment",
        sheet: "m.pdf#1",
        title: { text: "VACUUM PUMP SCHEDULE" },
        rows: [{ key: "V-1", cells: { ITEM: { text: "V-1" }, SERVICE: { text: "VACUUM" } } }],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#2",
        title: { text: "PUMP SCHEDULE" },
        rows: [{ key: "CHP-1", cells: { MARK: { text: "CHP-1" } } }],
      },
    ],
  };
  const hvac = compileHvacTakeoff(null, graph);
  assert.equal(hvac.categories.VACUUM_PUMP.count, 1);
  assert.equal(hvac.categories.VACUUM_PUMP.items[0].tag, "V-1");
  assert.equal(hvac.categories.PUMP.count, 1);
  assert.equal(hvac.categories.PUMP.items[0].tag, "CHP-1");
});

test("WP1.4 BRINE_TANK on softener schedule (SDSU BT-1); Colville BUFFER BT untouched", () => {
  assert.ok(HVAC_FAMILY_SPECS.BRINE_TANK.keyRe!.test("BT-1"));
  assert.ok(HVAC_FAMILY_SPECS.BUFFER_TANK.keyRe!.test("BT-1"));
  assert.equal(
    scheduleTitleMatches(
      "WATER SOFTENER SCHEDULE",
      HVAC_FAMILY_SPECS.BRINE_TANK.titleRe,
      HVAC_FAMILY_SPECS.BRINE_TANK.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "BUFFER TANK SCHEDULE",
      HVAC_FAMILY_SPECS.BRINE_TANK.titleRe,
      HVAC_FAMILY_SPECS.BRINE_TANK.exclude,
    ),
    false,
  );
  const graph = {
    sheets: [],
    tables: [
      {
        kind: "equipment",
        sheet: "m.pdf#1",
        title: { text: "WATER SOFTENER SCHEDULE" },
        rows: [
          { key: "WS-1", cells: { ITEM: { text: "WS-1" } } },
          { key: "BT-1", cells: { ITEM: { text: "BT-1" } } },
        ],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#2",
        title: { text: "BUFFER TANK SCHEDULE" },
        rows: [{ key: "BT-2", cells: { MARK: { text: "BT-2" } } }],
      },
    ],
  };
  const hvac = compileHvacTakeoff(null, graph);
  assert.equal(hvac.categories.WATER_SOFTENER.count, 1);
  assert.equal(hvac.categories.WATER_SOFTENER.items[0].tag, "WS-1");
  assert.equal(hvac.categories.BRINE_TANK.count, 1);
  assert.equal(hvac.categories.BRINE_TANK.items[0].tag, "BT-1");
  assert.equal(hvac.categories.BUFFER_TANK.count, 1);
  assert.equal(hvac.categories.BUFFER_TANK.items[0].tag, "BT-2");
});

test("WP1.4 TEF/GX fans, ELECTRIC HUMIDIFIER EH, FILTER F-#, LOUER OCR, EPANSION OCR", () => {
  assert.ok(HVAC_FAMILY_SPECS.FAN.keyRe!.test("TEF-1"));
  assert.ok(HVAC_FAMILY_SPECS.FAN.keyRe!.test("GX-1"));
  assert.ok(HVAC_FAMILY_SPECS.HUMIDIFIER.altKeyRe!.test("EH-1"));
  assert.ok(!HVAC_FAMILY_SPECS.HUMIDIFIER.keyRe!.test("EH-1"));
  assert.ok(HVAC_FAMILY_SPECS.FILTER.keyRe!.test("F-1"));
  assert.ok(HVAC_FAMILY_SPECS.FILTER.keyRe!.test("FTR-1"));
  assert.equal(
    scheduleTitleMatches("LOUERSCHEDULE", HVAC_FAMILY_SPECS.LOUVER.titleRe, HVAC_FAMILY_SPECS.LOUVER.exclude),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "EPANSIONANDCOPRESSIONTANKSCHEDULE",
      HVAC_FAMILY_SPECS.EXPANSION_TANK.titleRe,
      HVAC_FAMILY_SPECS.EXPANSION_TANK.exclude,
    ),
    true,
  );
  const graph = {
    sheets: [],
    tables: [
      {
        kind: "equipment",
        sheet: "m.pdf#1",
        title: { text: "EXHAUST FAN SCHEDULE" },
        rows: [
          { key: "TEF-1", cells: { MARK: { text: "TEF-1" } } },
          { key: "GX-1", cells: { MARK: { text: "GX-1" } } },
        ],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#2",
        title: { text: "ELECTRIC HUMIDIFIER SCHEDULE" },
        rows: [{ key: "EH-1", cells: { MARK: { text: "EH-1" } } }],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#3",
        title: { text: "FILTER SCHEDULE" },
        rows: [{ key: "F-1", cells: { MARK: { text: "F-1" } } }],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#4",
        title: { text: "LOUERSCHEDULE" },
        rows: [
          { key: "L-1", cells: { MARK: { text: "L-1" } } },
          { key: "L-2", cells: { MARK: { text: "L-2" } } },
        ],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#5",
        title: { text: "EPANSIONANDCOPRESSIONTANKSCHEDULE" },
        rows: [{ key: "ET-1", cells: { MARK: { text: "ET-1" } } }],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#6",
        title: { text: "SPLIT SYSTEM AIR CONDITIONING UNIT SCHEDULE" },
        rows: [{ key: "F-1CU-1", cells: { SYMBOL: { text: "F-1 , CU-1" } } }],
      },
    ],
  };
  const hvac = compileHvacTakeoff(null, graph);
  assert.deepEqual(hvac.categories.FAN.items.map((i) => i.tag).sort(), ["GX-1", "TEF-1"]);
  assert.equal(hvac.categories.HUMIDIFIER.count, 1);
  assert.equal(hvac.categories.HUMIDIFIER.items[0].tag, "EH-1");
  assert.equal(hvac.categories.FILTER.count, 1);
  assert.equal(hvac.categories.FILTER.items[0].tag, "F-1");
  assert.equal(hvac.categories.LOUVER.count, 2);
  assert.equal(hvac.categories.EXPANSION_TANK.count, 1);
  assert.equal(hvac.categories.EXPANSION_TANK.items[0].tag, "ET-1");
  // FILTER titledOnly must not steal split-system indoor F-1.
  assert.equal(hvac.categories.FCU.items.some((i) => i.tag === "F-1"), true);
});

test("WP1.4 AIR HANDLER HEAT PUMP → AHU+HP comma-split; FUME_HOOD_DAMPER ECV", () => {
  assert.equal(
    scheduleTitleMatches(
      "AIR HANDLER HEAT PUMP SCHEDULE (WITH ELECTRIC HEAT)",
      HVAC_FAMILY_SPECS.AHU.titleRe,
      HVAC_FAMILY_SPECS.AHU.exclude,
    ),
    true,
  );
  assert.equal(
    scheduleTitleMatches(
      "FAN COIL UNIT SCHEDULE",
      HVAC_FAMILY_SPECS.AHU.titleRe,
      HVAC_FAMILY_SPECS.AHU.exclude,
    ),
    false,
  );
  assert.equal(
    scheduleTitleMatches(
      "FUME HOOD VARIABLE AIR VOLUME DAMPER SCHEDULE",
      HVAC_FAMILY_SPECS.FUME_HOOD_DAMPER.titleRe,
      HVAC_FAMILY_SPECS.FUME_HOOD_DAMPER.exclude,
    ),
    true,
  );
  assert.ok(HVAC_FAMILY_SPECS.FUME_HOOD_DAMPER.keyRe!.test("ECV-NB-1"));
  assert.ok(!HVAC_FAMILY_SPECS.VAV.keyRe!.test("ECV-NB-1"));
  const graph = {
    sheets: [],
    tables: [
      {
        kind: "equipment",
        sheet: "m.pdf#1",
        title: { text: "AIR HANDLER HEAT PUMP SCHEDULE (WITH ELECTRIC HEAT)" },
        rows: [
          { key: "AHU-1HP-1", cells: { SYMBOL: { text: "AHU-1, HP-1" } } },
          { key: "AHU-2HP-2", cells: { SYMBOL: { text: "AHU-2, HP-2" } } },
        ],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#2",
        title: { text: "SUPPLY GRILLE SCHEDULE" },
        rows: [
          { key: "G-1", cells: { SYMBOL: { text: "G-1" } } },
          { key: "G-2", cells: { SYMBOL: { text: "G-2 CFM" } } },
        ],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#3",
        title: { text: "FUME HOOD VARIABLE AIR VOLUME DAMPER SCHEDULE" },
        rows: [
          { key: "ECV-NB-1", cells: { TAG: { text: "ECV-NB-1" } } },
          { key: "ECV-NB-2", cells: { TAG: { text: "ECV-NB-2" } } },
          { key: "NOTES", cells: { TAG: { text: "NOTES" } } },
        ],
      },
    ],
  };
  const hvac = compileHvacTakeoff(null, graph);
  assert.equal(hvac.categories.AHU.count, 2);
  assert.deepEqual(hvac.categories.AHU.items.map((i) => i.tag).sort(), ["AHU-1", "AHU-2"]);
  assert.equal(hvac.categories.HEAT_PUMP.count, 2);
  assert.deepEqual(hvac.categories.HEAT_PUMP.items.map((i) => i.tag).sort(), ["HP-1", "HP-2"]);
  assert.equal(hvac.categories.GRD.count, 2);
  assert.deepEqual(hvac.categories.GRD.items.map((i) => i.tag).sort(), ["G-1", "G-2"]);
  assert.equal(hvac.categories.FUME_HOOD_DAMPER.count, 2);
  assert.deepEqual(
    hvac.categories.FUME_HOOD_DAMPER.items.map((i) => i.tag).sort(),
    ["ECV-NB-1", "ECV-NB-2"],
  );
  assert.equal(hvac.categories.VAV.count, 0);
});

test("WP1.4 ECAV→VAV, VFD family, split AC/ACCU (bldg5406 shape)", () => {
  assert.ok(HVAC_FAMILY_SPECS.VAV.keyRe!.test("ECAV-NB-1"));
  assert.ok(HVAC_FAMILY_SPECS.FCU.keyRe!.test("AC-1"));
  assert.ok(!HVAC_FAMILY_SPECS.FCU.keyRe!.test("ACCU-1"));
  assert.ok(HVAC_FAMILY_SPECS.CONDENSING_UNIT.altKeyRe!.test("ACCU-1"));
  assert.ok(HVAC_FAMILY_SPECS.VARIABLE_FREQUENCY_DRIVE.keyRe!.test("VFD-1"));
  assert.equal(
    scheduleTitleMatches(
      "VARIABLE FREQUENCY DRIVE SCHEDULE",
      HVAC_FAMILY_SPECS.VARIABLE_FREQUENCY_DRIVE.titleRe,
      HVAC_FAMILY_SPECS.VARIABLE_FREQUENCY_DRIVE.exclude,
    ),
    true,
  );
  const graph = {
    sheets: [],
    tables: [
      {
        kind: "equipment",
        sheet: "m.pdf#1",
        title: { text: "LAB CAV SCHEDULE" },
        rows: [
          { key: "CAV-NB-1", cells: { MARK: { text: "CAV-NB-1" } } },
          { key: "ECAV-NB-1", cells: { MARK: { text: "ECAV-NB-1" } } },
          { key: "ECAV-NB-2", cells: { MARK: { text: "ECAV-NB-2" } } },
        ],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#2",
        title: { text: "SPLIT SYSTEM AIR CONDITIONING UNITS" },
        rows: [{ key: "AC-1/ACCU-1", cells: { MARK: { text: "AC-1/ACCU-1" } } }],
      },
      {
        kind: "equipment",
        sheet: "m.pdf#3",
        title: { text: "VARIABLE FREQUENCY DRIVE SCHEDULE" },
        rows: [
          { key: "VFD-1", cells: { MARK: { text: "VFD-1" } } },
          { key: "VFD-2", cells: { MARK: { text: "VFD-2" } } },
          { key: "NOTES", cells: { MARK: { text: "NOTES" } } },
        ],
      },
    ],
  };
  const hvac = compileHvacTakeoff(null, graph);
  assert.equal(hvac.categories.VAV.count, 3);
  assert.deepEqual(
    hvac.categories.VAV.items.map((i) => i.tag).sort(),
    ["CAV-NB-1", "ECAV-NB-1", "ECAV-NB-2"],
  );
  assert.equal(hvac.categories.FCU.count, 1);
  assert.equal(hvac.categories.FCU.items[0].tag, "AC-1");
  assert.equal(hvac.categories.CONDENSING_UNIT.count, 1);
  assert.equal(hvac.categories.CONDENSING_UNIT.items[0].tag, "ACCU-1");
  assert.equal(hvac.categories.VARIABLE_FREQUENCY_DRIVE.count, 2);
  assert.deepEqual(
    hvac.categories.VARIABLE_FREQUENCY_DRIVE.items.map((i) => i.tag).sort(),
    ["VFD-1", "VFD-2"],
  );
});

test("WP1.4 SPLIT SYSTEM HEAT PUMPS indoor FC joins FCU (Klamath shape)", () => {
  assert.equal(
    scheduleTitleMatches(
      "SPLIT SYSTEM HEAT PUMPS",
      HVAC_FAMILY_SPECS.FCU.titleRe,
      HVAC_FAMILY_SPECS.FCU.exclude,
    ),
    true,
  );
  const graph = {
    sheets: [],
    tables: [
      {
        kind: "equipment",
        sheet: "m.pdf#1",
        title: { text: "SPLIT SYSTEM HEAT PUMPS" },
        rows: [
          { key: "HP-01", cells: { MARK: { text: "HP-01" } } },
          { key: "FC-01", cells: { MARK: { text: "FC-01" } } },
          { key: "HP-02", cells: { MARK: { text: "HP-02" } } },
          { key: "FC-02", cells: { MARK: { text: "FC-02" } } },
        ],
      },
    ],
  };
  const hvac = compileHvacTakeoff(null, graph);
  assert.equal(hvac.categories.HEAT_PUMP.count, 2);
  assert.deepEqual(hvac.categories.HEAT_PUMP.items.map((i) => i.tag).sort(), ["HP-01", "HP-02"]);
  assert.equal(hvac.categories.FCU.count, 2);
  assert.deepEqual(hvac.categories.FCU.items.map((i) => i.tag).sort(), ["FC-01", "FC-02"]);
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

test("query_table HUMIDIFIER needle does not soft-match DEHUMIDIFIER", () => {
  assert.equal(queryTitleMatchesNeedle("HUMIDIFIER SCHEDULE", "HUMIDIFIER SCHEDULE"), true);
  assert.equal(queryTitleMatchesNeedle("ELECTRIC HUMIDIFIER SCHEDULE", "HUMIDIFIER SCHEDULE"), true);
  assert.equal(queryTitleMatchesNeedle("DEHUMIDIFIER SCHEDULE", "HUMIDIFIER SCHEDULE"), false);
  assert.equal(queryTitleMatchesNeedle("DEHUMIDIFIERSCHEDULE", "HUMIDIFIER SCHEDULE"), false);
  assert.equal(queryTitleMatchesNeedle("HUMIDIFIERSCHEDULE", "HUMIDIFIER SCHEDULE"), true);
});

test("query_table UNIT HEATER needle does not soft-match CABINET UNIT HEATER", () => {
  assert.equal(queryTitleMatchesNeedle("UNIT HEATER SCHEDULE", "UNIT HEATER SCHEDULE"), true);
  assert.equal(queryTitleMatchesNeedle("CABINET UNIT HEATER SCHEDULE", "UNIT HEATER SCHEDULE"), false);
  assert.equal(queryTitleMatchesNeedle("ELECTRIC UNIT HEATER SCHEDULE", "UNIT HEATER SCHEDULE"), true);
});
