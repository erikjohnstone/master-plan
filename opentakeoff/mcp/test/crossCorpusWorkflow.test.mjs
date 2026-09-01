/**
 * Cross-corpus HVAC/BAS workflow invariants — set-agnostic.
 * Counts differ per drawing; structure and intent routing must not.
 * WP1: keyed schedule-compile acceptance on ≥2 non-NAVFAC sets.
 * Uses the sheet-graph cache so multi-set coverage stays fast when warm.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { cachedSheetGraph } from "../scripts/sheetGraphCache.mjs";
import {
  classifyTakeoffIntent,
  corpusCompileKind,
  valveServiceFromGoal,
} from "../../web/src/lib/takeoffWorkflow.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const SAMPLES = resolve(HERE, "../../samples");
const CROSS = resolve(CORPUS, "takeoffs/cross-set-compile");

const SETS = [
  {
    id: "navfac-cherry-point-atc",
    pdf: resolve(CORPUS, "raw/navfac-cherry-point-atc-mechanical.pdf"),
  },
  {
    id: "federal-mech",
    pdf: resolve(CORPUS, "raw/federal-attachment4-mechanical.pdf"),
  },
  {
    id: "bldg5406-hvac-demo",
    pdf: resolve(CORPUS, "raw/bldg5406-hvac-demo-mechanical.pdf"),
  },
  {
    id: "itd-d1-lab",
    pdf: resolve(CORPUS, "raw/itd-d1-lab-mechanical.pdf"),
  },
  {
    id: "baker-county-eoc",
    pdf: resolve(CORPUS, "raw/baker-county-eoc-bidset.pdf"),
  },
  {
    id: "bessemer",
    pdf: resolve(SAMPLES, "bessemer-mechanical-bidset.pdf"),
  },
];

async function graphForPdf(pdfPath, setId) {
  return cachedSheetGraph(pdfPath, {
    identity: [setId, "cross-corpus"],
    compute: async () => {
      const session = new Session();
      await session.loadPlan(pdfPath);
      return session.graphForPipeline();
    },
  });
}

test("phrase-robust corpus intents stay set-agnostic (no drawing names)", () => {
  assert.equal(
    corpusCompileKind("Do a complete HVAC equipment quantity takeoff of this set"),
    "hvac_equipment",
  );
  assert.equal(
    corpusCompileKind("full HVAC equipment takeoff on these drawings"),
    "hvac_equipment",
  );
  assert.equal(
    corpusCompileKind("complete BAS points takeoff of this set"),
    "bas_points",
  );
  assert.equal(
    corpusCompileKind("Run a complete valve takeoff on this blueprint set"),
    "control_valves",
  );
  assert.equal(
    corpusCompileKind("complete control valve takeoff on this blueprint set"),
    "control_valves",
  );
  assert.equal(valveServiceFromGoal("chilled-water control valve takeoff"), "CHW");
  assert.equal(valveServiceFromGoal("hot water valve takeoff"), "HHW");
  assert.equal(
    classifyTakeoffIntent("How many FCUs across buildings on this set?"),
    "fcu_buildings",
  );
});

test("HVAC/BAS/valve compiles succeed structurally on every available corpus PDF", async () => {
  const available = SETS.filter((s) => existsSync(s.pdf));
  assert.ok(available.length >= 3, "need multiple corpus PDFs for cross-set coverage");

  for (const set of available) {
    const graph = await graphForPdf(set.pdf, set.id);
    assert.equal(graph.available, true, `${set.id} graph available`);
    assert.ok((graph.sheets || []).length >= 1, `${set.id} has sheets`);

    const session = null;
    for (const kind of ["hvac_equipment", "bas_points", "control_valves"]) {
      const result = compileCorpusTakeoff(session, graph, kind);
      assert.equal(result.kind, kind === "hvac_equipment" ? "hvac_equipment"
        : kind === "bas_points" ? "bas_points" : "control_valves", `${set.id} ${kind} kind`);
      assert.ok(result.totals && typeof result.totals === "object", `${set.id} ${kind} totals`);
      const n = result.totals.items ?? result.totals.rows ?? 0;
      assert.ok(Number.isFinite(n) && n >= 0, `${set.id} ${kind} non-negative total`);
      assert.ok(result.page_accounting?.sheet_count >= 1, `${set.id} ${kind} page accounting`);
      if (n === 0) {
        assert.ok(
          result.status || result.page_accounting,
          `${set.id} ${kind} empty compile must still disclose accounting`,
        );
      }
    }
  }
});

test("WP1 keyed compile acceptance on ≥2 non-NAVFAC sets", async () => {
  const keys = [
    "bldg5406-hvac-demo.compile.json",
    "federal-mech.compile.json",
    "itd-d1-lab.compile.json",
    // Bulk US vector set — same product compile path a user upload hits.
    "16_NV_CarsonValleyMS_HVAC_Replacement.compile.json",
    "04_NV_VA_LasVegas_CentralUtilityPlant.compile.json",
    "26_CA_TransbayTower_Mechanical_64Sheets.compile.json",
    "21_VA_OrangeCounty_PublicSafetyBldg.compile.json",
    "24_IA_JohnsonCounty_Courthouse.compile.json",
    "09_ME_BGS_KennebecValleyCC_Renovation.compile.json",
    "01_NY_VA_Northport_Dialysis_100CD.compile.json",
    "30_WA_SpokaneTransit_CoolingTower.compile.json",
    "23_GA_MaconBibb_RecreationCenter.compile.json",
    "10_MO_Hawthorn_PsychHospital_HVAC.compile.json",
    "17_FL_SuwanneeHS_Courtyard_100CD.compile.json",
    "05_MO_VA_StLouis_AHU_VAV_Replacement.compile.json",
    "22_GA_Valdosta_FireStation8_100CD.compile.json",
    "12_MT_MSU_ReidHall_Renovation.compile.json",
    "03_FL_HurlburtField_ChildDevCenter.compile.json",
    "27_WA_ColvilleTribes_Hatchery_Lab.compile.json",
    "18_OR_BakerMS_HVAC_Electrical_FullSet.compile.json",
    "14_OR_KlamathCC_LearningCtr_Mechanical.compile.json",
    "25_WA_DouglasCounty_Courthouse_HVAC_DDC.compile.json",
    "06_MO_NatlGuard_JeffCity_CST_Addition.compile.json",
    "11_CA_SDSU_EngSciences_Complex_100SD.compile.json",
    "13_MI_MSU_LifeSciences_LabRenovation.compile.json",
    // Honest ZERO bulk ceilings — lock no silent HVAC inflation.
    "02_UT_FAA_Ogden_AirTrafficControlTower.compile.json",
    "07_MO_MSHP_TroopB_HVAC_Boilers_Controls.compile.json",
    "08_ME_BGS_Augusta_EastCampus_Renovation.compile.json",
    "15_IA_IowaState_Biorenewables_Lab.compile.json",
    "19_CA_VistaUSD_DataCenter.compile.json",
    "20_TX_JudsonISD_MEP_Upgrades_Pkg6.compile.json",
    "28_WA_KCHA_PublicHousing_HVAC.compile.json",
    "29_TX_JPS_Hospital_CentralPlant_Chiller.compile.json",
    "D_25_CO_weld-mech-permit-set.compile.json",
    // Vol2 bulk intake (full-volume Pillar A) — MEAT / WEAK / honest ZERO.
    "017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling.compile.json",
    "014_MT_USDA_Forest_Service_Missoula_Fire_Sciences.compile.json",
    "021_XX_Laboratory_building_mechanical_drawings_lab.compile.json",
    "009_FL_USDA_APHIS_Plant_Inspection_Station_Building.compile.json",
    "023_US_Chiller_Replacement_at_U_S_Salinity_Laboratory.compile.json",
    "013_MO_T2523_01_Replace_Boilers_Phase_2_Building_29.compile.json",
    "020_MO_R2415_01_HVAC_System_Upgrades_MSHP_Troop_C.compile.json",
    "100_OH_Butler_Tech_RTU_Welding_Source_Capture.compile.json",
    "024_MO_E2508_01_Replace_Steam_Heating_Units_Missouri.compile.json",
    "004_MO_T2504_03_Interior_and_Exterior_Renovation.compile.json",
    "028_TX_Renovation_of_Building_615_Final_Design_Plans.compile.json",
    "001_NC_FY20_P_228_ATC_Tower_and_Air_Operations.compile.json",
    "015_VA_P_095_Replace_Submarine_Pier_3_Utility.compile.json",
    "019_FL_Eglin_AFB_Building_XX_Contract_Documents_01_04.compile.json",
    "008_MO_T2331_01_Repair_to_Interior_Exterior_Unheated.compile.json",
    "006_US_U2607_01_Interior_Renovations_C_Wing_Updates.compile.json",
    "010_US_WWYK240146_Design_Implement_Monitoring_Control.compile.json",
    "018_GA_USDA_ARS_U_S_National_Poultry_Research_Center.compile.json",
    "011_IL_VA_Hines_Finance_Center_Renovation.compile.json",
    "016_NY_Alter_Repair_Building_1624_Irish_Hill_Test.compile.json",
    "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for.compile.json",
    "047_NC_VA_Project_558_22_172_Replace_Chillers_in_AHU.compile.json",
    "044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers.compile.json",
    "040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile.compile.json",
    "041_IL_VA_Project_537_17_115_Sterile_Processing.compile.json",
    "042_VA_Renovate_VCS_Patriot_Cafe_VA_project_546_17.compile.json",
    "034_NC_VA_Project_637_22_700_EHRM_Infrastructure.compile.json",
    "029_ME_BGS_Project_3548_MEANG_Building_493_Boiler.compile.json",
    "036_LA_VA_Project_502_21_222_EHRM_Infrastructure.compile.json",
    "039_TX_VA_Project_580_22_201_Replace_and_Upgrade.compile.json",
    "045_FL_VA_Project_516_21_107_EHRM_Infrastructure.compile.json",
    "046_MI_Veterinary_Medical_Center_Replace_Elevators_3.compile.json",
    "053_VA_Renovate_Expand_Emergency_Room_System_VA.compile.json",
    "054_NV_VA_Project_654_212_Design_Build_Central.compile.json",
    "056_NY_VA_Project_632_19_106_Renovate_Pharmacy_Spaces.compile.json",
    "060_XX_ASC_Open_Mechanical_Competition_LAMBDA_Project.compile.json",
    "061_IA_Ames_Laboratory_Harley_Wilhelm_Hall_Building.compile.json",
    "062_ID_ITD_District_1_Laboratory_Building_Mechanical.compile.json",
    "063_MT_Harrison_Hall_Extruder_Lab_132_Renovation.compile.json",
    "067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid.compile.json",
    "068_US_Antelope_Valley_College_Applied_Arts_Math.compile.json",
    "071_ME_BGS_Project_3809_Health_Science_Center.compile.json",
    "072_CA_CA07_2627_West_Valley_College_Science_Math.compile.json",
    "074_CA_West_Valley_College_STEM_Classroom_HVAC.compile.json",
    "048_NY_VA_Project_528A8_17_805_Replace_Main_Boilers.compile.json",
    "049_IL_VA_Solicitation_36C77623B0051_Expand_Sterile.compile.json",
    "050_IL_VA_Project_537_17_115_Sterile_Processing.compile.json",
    "052_IL_VA_Project_537_17_115_Sterile_Processing.compile.json",
    "055_US_VA_Project_673_20_107_EHRM_Infrastructure.compile.json",
    "057_US_VA_Project_626_15_106_Upgrade_Energy.compile.json",
    "064_MT_Leon_Johnson_Hall_Room_346_Renovation_Permit.compile.json",
    "066_MT_Barnard_Hall_111_Lithography_Lab_Renovation.compile.json",
    "069_ID_ITD_District_2_Laboratory_Heating_Upgrades.compile.json",
    "073_MT_Roberts_Hall_Renovation_Permit_Set_Classroom.compile.json",
    "075_MT_Renne_Library_Innovation_Learning_Studio.compile.json",
    "077_MT_Miller_Dining_Auxiliaries_Offices_HVAC.compile.json",
    // Vol2 batch-6 — remaining single-file INDEX sets (MEAT/WEAK/honest ZERO).
    "078_US_CP25028_MSU_Union_Sparty_Store_Renovations.compile.json",
    "080_CA_Contra_Costa_College_Science_Center_Conference.compile.json",
    "082_OR_Klamath_Community_College_Career_Learning.compile.json",
    "083_MA_Town_Offices_Facilities_HVAC_System_Upgrades.compile.json",
    "084_SC_H59_N054_FW_Building_112_Chiller_Addition.compile.json",
    "086_CA_Contra_Costa_College_Early_Learning_Center.compile.json",
    "087_US_Contra_Costa_College_Chiller_Replacement.compile.json",
    "091_IL_Guaranteed_Rate_Field_HVAC_AHU_Renovation.compile.json",
    "092_IL_Guaranteed_Rate_Field_HVAC_AHU_Renovation.compile.json",
    "094_FL_Orange_County_Regional_History_Center_HVAC.compile.json",
    "095_UT_JVWTP_Washwater_Reclaim_Pump_Station_2_HVAC.compile.json",
    "096_IN_Vermillion_County_Jail_Mechanical_Bid_Set.compile.json",
    "097_UT_JVWTP_Chemical_Buildings_HVAC_Upgrades_Project.compile.json",
  ];
  let scored = 0;
  for (const file of keys) {
    const keyPath = resolve(CROSS, file);
    assert.ok(existsSync(keyPath), `missing acceptance key ${file}`);
    const key = JSON.parse(readFileSync(keyPath, "utf8"));
    const pdf = resolve(CORPUS, key.source_file);
    if (!existsSync(pdf)) {
      console.log(`skip ${key.set_id} — PDF not present at ${key.source_file}`);
      continue;
    }
    scored += 1;
    const graph = await graphForPdf(pdf, key.set_id);
    const hvac = compileCorpusTakeoff(null, graph, "hvac_equipment");
    const bas = compileCorpusTakeoff(null, graph, "bas_points");
    const valve = compileCorpusTakeoff(null, graph, "control_valves");

    assert.equal(hvac.totals.items, key.totals.items, `${key.set_id} HVAC total`);
    for (const [fam, n] of Object.entries(key.categories)) {
      assert.equal(
        hvac.categories?.[fam]?.count ?? 0,
        n,
        `${key.set_id} ${fam} count`,
      );
    }
    // Families not listed in the key must stay zero (no silent inflation).
    for (const [fam, cat] of Object.entries(hvac.categories || {})) {
      if (key.categories[fam] != null) continue;
      assert.equal(cat.count, 0, `${key.set_id} unexpected family ${fam}=${cat.count}`);
    }

    assert.equal(bas.totals.rows ?? bas.totals.items ?? 0, key.bas_points.rows,
      `${key.set_id} BAS empty/honest disclose`);
    assert.ok(bas.page_accounting?.sheet_count >= 1, `${key.set_id} BAS page accounting`);

    assert.equal(valve.totals.items, key.control_valves.items, `${key.set_id} valve total`);
    for (const [fam, n] of Object.entries(key.control_valves.categories || {})) {
      assert.equal(valve.categories?.[fam]?.count ?? 0, n, `${key.set_id} valve ${fam}`);
    }
  }
  assert.ok(scored >= 2, `need ≥2 non-NAVFAC keyed sets scored, got ${scored}`);
});
