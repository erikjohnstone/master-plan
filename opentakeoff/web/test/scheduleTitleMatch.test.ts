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
import { HVAC_FAMILY_SPECS, normalizeEquipMark } from "../src/lib/corpusTakeoff.mjs";

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
      "OUTDOOR AIR UNIT SCHEDULE",
      HVAC_FAMILY_SPECS.OUTDOOR_AIR_UNIT.titleRe,
      HVAC_FAMILY_SPECS.OUTDOOR_AIR_UNIT.exclude,
    ),
    true,
  );
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
