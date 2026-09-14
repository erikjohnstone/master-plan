# Corpus inventory (real, reconciled)

Corpus root: `/home/user/master-plan/opentakeoff-corpus`

## Totals

- **source_families**: 123
- **ok**: 123
- **errored**: 0
- **raw_dir_families**: 10
- **bulk_vol1_families**: 31
- **bulk_vol2_families**: 82
- **total_pages_all_families**: 5063
- **families_with_legend_text_in_sample**: 108
- **families_with_any_raster_page_in_sample**: 3
- **duplicate_content_hash_groups**: 5

## Expected vs. actual (goal doc reconciliation)

- **goal_doc_expected_HVAC_BAS_Benchmark_Collection**: NOT REACHABLE this session (see TASK_SPEC.md) -- 0 of the expected 47 symbol_sweep identities / 30 legend_learn documents / 14 symbol_grounding cases imported
- **goal_doc_expected_bulk_source_families**: 113
- **actual_bulk_source_families_recovered**: 113
- **recovery_method**: GitHub Releases 'corpus' + 'corpus_2' tags (owner-confirmed), not the gitignored-staging-script's Google Drive path (blocked by session egress policy)

## Duplicate content-hash groups (same PDF bytes under >1 family id)

- `b98b269834a4...`: raw:federal-attachment4-mechanical, bulk_vol2:019_FL_Eglin_AFB_Building_XX_Contract_Documents_01_04
- `9dafcead2eb5...`: raw:itd-d1-lab-mechanical, bulk_vol2:062_ID_ITD_District_1_Laboratory_Building_Mechanical
- `9b83f64b9ef9...`: raw:navfac-cherry-point-atc-mechanical, bulk_vol2:001_NC_FY20_P_228_ATC_Tower_and_Air_Operations
- `ffbae6e626ba...`: raw:tinker-afb-iwcs-controls, bulk_vol2:010_US_WWYK240146_Design_Implement_Monitoring_Control
- `149fd19cd845...`: raw:weld-county-mechanical-permit, bulk_vol1:D_25_CO_weld-mech-permit-set

## Per-family detail

| family_id | volume | pages | vector_ratio(sample) | any_raster | legend_pages(sample) | hvac_term_hits(sample) | rejoined | retired |
|---|---|---:|---:|---|---:|---:|---|---|
| bulk_vol1:01_NY_VA_Northport_Dialysis_100CD | bulk_vol1 | 162 | 1.00 | False | 4 | 24 | True | False |
| bulk_vol1:02_UT_FAA_Ogden_AirTrafficControlTower | bulk_vol1 | 116 | 1.00 | False | 6 | 4 | True | False |
| bulk_vol1:03_FL_HurlburtField_ChildDevCenter | bulk_vol1 | 110 | 1.00 | False | 0 | 38 | False | False |
| bulk_vol1:04_NV_VA_LasVegas_CentralUtilityPlant | bulk_vol1 | 76 | 1.00 | False | 2 | 68 | True | False |
| bulk_vol1:05_MO_VA_StLouis_AHU_VAV_Replacement | bulk_vol1 | 67 | 1.00 | False | 2 | 176 | True | False |
| bulk_vol1:06_MO_NatlGuard_JeffCity_CST_Addition | bulk_vol1 | 85 | 1.00 | False | 7 | 2 | True | False |
| bulk_vol1:07_MO_MSHP_TroopB_HVAC_Boilers_Controls | bulk_vol1 | 41 | 1.00 | False | 0 | 1 | True | False |
| bulk_vol1:08_ME_BGS_Augusta_EastCampus_Renovation | bulk_vol1 | 35 | 1.00 | False | 5 | 10 | False | False |
| bulk_vol1:09_ME_BGS_KennebecValleyCC_Renovation | bulk_vol1 | 9 | 1.00 | False | 4 | 4 | False | False |
| bulk_vol1:10_MO_Hawthorn_PsychHospital_HVAC | bulk_vol1 | 9 | 1.00 | False | 3 | 146 | False | False |
| bulk_vol1:11_CA_SDSU_EngSciences_Complex_100SD | bulk_vol1 | 157 | 1.00 | False | 3 | 60 | True | False |
| bulk_vol1:12_MT_MSU_ReidHall_Renovation | bulk_vol1 | 43 | 1.00 | False | 3 | 28 | False | False |
| bulk_vol1:13_MI_MSU_LifeSciences_LabRenovation | bulk_vol1 | 36 | 1.00 | False | 3 | 73 | False | False |
| bulk_vol1:14_OR_KlamathCC_LearningCtr_Mechanical | bulk_vol1 | 17 | 1.00 | False | 1 | 315 | False | False |
| bulk_vol1:15_IA_IowaState_Biorenewables_Lab | bulk_vol1 | 11 | 1.00 | False | 1 | 81 | False | False |
| bulk_vol1:16_NV_CarsonValleyMS_HVAC_Replacement | bulk_vol1 | 47 | 1.00 | False | 1 | 102 | False | False |
| bulk_vol1:17_FL_SuwanneeHS_Courtyard_100CD | bulk_vol1 | 31 | 1.00 | False | 2 | 144 | False | False |
| bulk_vol1:18_OR_BakerMS_HVAC_Electrical_FullSet | bulk_vol1 | 26 | 1.00 | False | 0 | 76 | False | False |
| bulk_vol1:19_CA_VistaUSD_DataCenter | bulk_vol1 | 24 | 1.00 | False | 1 | 6 | False | False |
| bulk_vol1:20_TX_JudsonISD_MEP_Upgrades_Pkg6 | bulk_vol1 | 13 | 1.00 | False | 3 | 40 | False | False |
| bulk_vol1:21_VA_OrangeCounty_PublicSafetyBldg | bulk_vol1 | 128 | 1.00 | True | 6 | 210 | True | False |
| bulk_vol1:22_GA_Valdosta_FireStation8_100CD | bulk_vol1 | 84 | 1.00 | False | 1 | 31 | True | False |
| bulk_vol1:23_GA_MaconBibb_RecreationCenter | bulk_vol1 | 44 | 1.00 | False | 4 | 70 | True | False |
| bulk_vol1:24_IA_JohnsonCounty_Courthouse | bulk_vol1 | 31 | 1.00 | False | 0 | 117 | False | False |
| bulk_vol1:25_WA_DouglasCounty_Courthouse_HVAC_DDC | bulk_vol1 | 23 | 1.00 | False | 3 | 84 | False | False |
| bulk_vol1:26_CA_TransbayTower_Mechanical_64Sheets | bulk_vol1 | 64 | 1.00 | False | 1 | 298 | True | False |
| bulk_vol1:27_WA_ColvilleTribes_Hatchery_Lab | bulk_vol1 | 38 | 1.00 | False | 1 | 65 | False | False |
| bulk_vol1:28_WA_KCHA_PublicHousing_HVAC | bulk_vol1 | 9 | 1.00 | False | 1 | 99 | True | False |
| bulk_vol1:29_TX_JPS_Hospital_CentralPlant_Chiller | bulk_vol1 | 13 | 1.00 | False | 1 | 266 | False | False |
| bulk_vol1:30_WA_SpokaneTransit_CoolingTower | bulk_vol1 | 14 | 1.00 | False | 1 | 286 | False | False |
| bulk_vol1:D_25_CO_weld-mech-permit-set | bulk_vol1 | 8 | 1.00 | False | 1 | 172 | False | False |
| bulk_vol2:001_NC_FY20_P_228_ATC_Tower_and_Air_Operations | bulk_vol2 | 75 | 1.00 | False | 12 | 755 | False | False |
| bulk_vol2:004_MO_T2504_03_Interior_and_Exterior_Renovation | bulk_vol2 | 51 | 1.00 | False | 4 | 83 | False | False |
| bulk_vol2:006_US_U2607_01_Interior_Renovations_C_Wing_Updates | bulk_vol2 | 37 | 1.00 | False | 6 | 19 | False | False |
| bulk_vol2:008_MO_T2331_01_Repair_to_Interior_Exterior_Unheated | bulk_vol2 | 32 | 1.00 | False | 1 | 3 | False | False |
| bulk_vol2:009_FL_USDA_APHIS_Plant_Inspection_Station_Building | bulk_vol2 | 31 | 1.00 | False | 7 | 178 | False | False |
| bulk_vol2:010_US_WWYK240146_Design_Implement_Monitoring_Control | bulk_vol2 | 31 | 1.00 | False | 7 | 36 | False | False |
| bulk_vol2:011_IL_VA_Hines_Finance_Center_Renovation | bulk_vol2 | 29 | 1.00 | False | 5 | 142 | False | False |
| bulk_vol2:012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | bulk_vol2 | 29 | 1.00 | False | 0 | 270 | True | False |
| bulk_vol2:013_MO_T2523_01_Replace_Boilers_Phase_2_Building_29 | bulk_vol2 | 28 | 1.00 | False | 1 | 154 | False | False |
| bulk_vol2:014_MT_USDA_Forest_Service_Missoula_Fire_Sciences | bulk_vol2 | 28 | 1.00 | False | 2 | 525 | False | False |
| bulk_vol2:015_VA_P_095_Replace_Submarine_Pier_3_Utility | bulk_vol2 | 27 | 1.00 | False | 8 | 213 | False | False |
| bulk_vol2:016_NY_Alter_Repair_Building_1624_Irish_Hill_Test | bulk_vol2 | 27 | 1.00 | False | 1 | 71 | False | False |
| bulk_vol2:017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | bulk_vol2 | 25 | 1.00 | False | 1 | 192 | False | False |
| bulk_vol2:018_GA_USDA_ARS_U_S_National_Poultry_Research_Center | bulk_vol2 | 25 | 1.00 | False | 4 | 58 | False | False |
| bulk_vol2:019_FL_Eglin_AFB_Building_XX_Contract_Documents_01_04 | bulk_vol2 | 24 | 1.00 | False | 2 | 585 | False | False |
| bulk_vol2:020_MO_R2415_01_HVAC_System_Upgrades_MSHP_Troop_C | bulk_vol2 | 22 | 1.00 | False | 2 | 13 | False | False |
| bulk_vol2:021_XX_Laboratory_building_mechanical_drawings_lab | bulk_vol2 | 19 | 1.00 | False | 1 | 207 | False | False |
| bulk_vol2:023_US_Chiller_Replacement_at_U_S_Salinity_Laboratory | bulk_vol2 | 17 | 1.00 | False | 2 | 104 | False | False |
| bulk_vol2:024_MO_E2508_01_Replace_Steam_Heating_Units_Missouri | bulk_vol2 | 15 | 1.00 | False | 3 | 104 | False | False |
| bulk_vol2:028_TX_Renovation_of_Building_615_Final_Design_Plans | bulk_vol2 | 9 | 1.00 | False | 0 | 418 | False | False |
| bulk_vol2:029_ME_BGS_Project_3548_MEANG_Building_493_Boiler | bulk_vol2 | 7 | 1.00 | False | 2 | 120 | False | False |
| bulk_vol2:030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | bulk_vol2 | 93 | 1.00 | False | 0 | 111 | True | False |
| bulk_vol2:031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for | bulk_vol2 | 90 | 1.00 | False | 2 | 72 | False | False |
| bulk_vol2:032_PA_Construct_EHRM_Infrastructure_Upgrades | bulk_vol2 | 85 | 1.00 | False | 1 | 169 | True | False |
| bulk_vol2:033_MN_VA_Project_656_18_301_Construct_Replace | bulk_vol2 | 80 | 1.00 | False | 1 | 55 | True | False |
| bulk_vol2:034_NC_VA_Project_637_22_700_EHRM_Infrastructure | bulk_vol2 | 70 | 1.00 | False | 9 | 6 | False | False |
| bulk_vol2:035_AR_564_19_101_Construct_New_Water_Storage | bulk_vol2 | 67 | 1.00 | False | 5 | 36 | True | False |
| bulk_vol2:036_LA_VA_Project_502_21_222_EHRM_Infrastructure | bulk_vol2 | 63 | 1.00 | False | 4 | 134 | False | False |
| bulk_vol2:037_AR_VA_Project_598_19_118_Replace_21_Air_Handling | bulk_vol2 | 60 | 1.00 | False | 6 | 302 | True | False |
| bulk_vol2:038_NC_VA_Project_637_22_700_EHRM_Infrastructure | bulk_vol2 | 54 | 1.00 | False | 5 | 53 | True | False |
| bulk_vol2:039_TX_VA_Project_580_22_201_Replace_and_Upgrade | bulk_vol2 | 48 | 1.00 | False | 2 | 115 | False | False |
| bulk_vol2:040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | bulk_vol2 | 48 | 1.00 | False | 0 | 147 | False | False |
| bulk_vol2:041_IL_VA_Project_537_17_115_Sterile_Processing | bulk_vol2 | 37 | 1.00 | False | 8 | 144 | False | False |
| bulk_vol2:042_VA_Renovate_VCS_Patriot_Cafe_VA_project_546_17 | bulk_vol2 | 34 | 1.00 | False | 3 | 146 | False | False |
| bulk_vol2:043_FL_VA_Project_673_21_151_Replace_Air_Handling | bulk_vol2 | 33 | 1.00 | False | 3 | 49 | True | False |
| bulk_vol2:044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers | bulk_vol2 | 31 | 1.00 | False | 1 | 288 | False | False |
| bulk_vol2:045_FL_VA_Project_516_21_107_EHRM_Infrastructure | bulk_vol2 | 31 | 1.00 | False | 0 | 55 | False | False |
| bulk_vol2:046_MI_Veterinary_Medical_Center_Replace_Elevators_3 | bulk_vol2 | 29 | 1.00 | False | 3 | 80 | False | False |
| bulk_vol2:047_NC_VA_Project_558_22_172_Replace_Chillers_in_AHU | bulk_vol2 | 28 | 1.00 | False | 2 | 205 | False | False |
| bulk_vol2:048_NY_VA_Project_528A8_17_805_Replace_Main_Boilers | bulk_vol2 | 28 | 1.00 | False | 1 | 91 | False | False |
| bulk_vol2:049_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | bulk_vol2 | 27 | 1.00 | False | 0 | 19 | False | False |
| bulk_vol2:050_IL_VA_Project_537_17_115_Sterile_Processing | bulk_vol2 | 25 | 1.00 | False | 8 | 195 | False | False |
| bulk_vol2:052_IL_VA_Project_537_17_115_Sterile_Processing | bulk_vol2 | 17 | 1.00 | False | 8 | 35 | False | False |
| bulk_vol2:053_VA_Renovate_Expand_Emergency_Room_System_VA | bulk_vol2 | 12 | 1.00 | False | 9 | 288 | False | False |
| bulk_vol2:054_NV_VA_Project_654_212_Design_Build_Central | bulk_vol2 | 12 | 1.00 | False | 3 | 249 | False | False |
| bulk_vol2:055_US_VA_Project_673_20_107_EHRM_Infrastructure | bulk_vol2 | 11 | 1.00 | False | 1 | 122 | False | False |
| bulk_vol2:056_NY_VA_Project_632_19_106_Renovate_Pharmacy_Spaces | bulk_vol2 | 6 | 1.00 | False | 1 | 42 | False | False |
| bulk_vol2:057_US_VA_Project_626_15_106_Upgrade_Energy | bulk_vol2 | 6 | 1.00 | False | 1 | 29 | False | False |
| bulk_vol2:058_CA_Lawrence_Berkeley_National_Laboratory_Building | bulk_vol2 | 311 | 1.00 | False | 1 | 3 | True | False |
| bulk_vol2:060_XX_ASC_Open_Mechanical_Competition_LAMBDA_Project | bulk_vol2 | 83 | 1.00 | False | 6 | 127 | False | False |
| bulk_vol2:061_IA_Ames_Laboratory_Harley_Wilhelm_Hall_Building | bulk_vol2 | 71 | 1.00 | False | 4 | 94 | False | False |
| bulk_vol2:062_ID_ITD_District_1_Laboratory_Building_Mechanical | bulk_vol2 | 29 | 1.00 | False | 1 | 423 | False | False |
| bulk_vol2:063_MT_Harrison_Hall_Extruder_Lab_132_Renovation | bulk_vol2 | 21 | 1.00 | False | 4 | 97 | False | False |
| bulk_vol2:064_MT_Leon_Johnson_Hall_Room_346_Renovation_Permit | bulk_vol2 | 20 | 1.00 | False | 3 | 21 | False | False |
| bulk_vol2:066_MT_Barnard_Hall_111_Lithography_Lab_Renovation | bulk_vol2 | 17 | 1.00 | False | 4 | 66 | False | False |
| bulk_vol2:067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | bulk_vol2 | 13 | 1.00 | False | 3 | 159 | False | False |
| bulk_vol2:068_US_Antelope_Valley_College_Applied_Arts_Math | bulk_vol2 | 11 | 1.00 | False | 4 | 124 | False | False |
| bulk_vol2:069_ID_ITD_District_2_Laboratory_Heating_Upgrades | bulk_vol2 | 9 | 1.00 | False | 3 | 261 | False | False |
| bulk_vol2:071_ME_BGS_Project_3809_Health_Science_Center | bulk_vol2 | 59 | 1.00 | False | 7 | 141 | False | False |
| bulk_vol2:072_CA_CA07_2627_West_Valley_College_Science_Math | bulk_vol2 | 38 | 1.00 | False | 4 | 84 | False | False |
| bulk_vol2:073_MT_Roberts_Hall_Renovation_Permit_Set_Classroom | bulk_vol2 | 37 | 1.00 | False | 2 | 105 | False | False |
| bulk_vol2:074_CA_West_Valley_College_STEM_Classroom_HVAC | bulk_vol2 | 35 | 1.00 | False | 5 | 132 | False | False |
| bulk_vol2:075_MT_Renne_Library_Innovation_Learning_Studio | bulk_vol2 | 31 | 1.00 | False | 3 | 22 | False | False |
| bulk_vol2:077_MT_Miller_Dining_Auxiliaries_Offices_HVAC | bulk_vol2 | 26 | 1.00 | False | 1 | 143 | False | False |
| bulk_vol2:078_US_CP25028_MSU_Union_Sparty_Store_Renovations | bulk_vol2 | 25 | 1.00 | False | 5 | 52 | False | False |
| bulk_vol2:080_CA_Contra_Costa_College_Science_Center_Conference | bulk_vol2 | 23 | 1.00 | False | 2 | 14 | False | False |
| bulk_vol2:082_OR_Klamath_Community_College_Career_Learning | bulk_vol2 | 19 | 1.00 | False | 1 | 294 | False | False |
| bulk_vol2:083_MA_Town_Offices_Facilities_HVAC_System_Upgrades | bulk_vol2 | 17 | 1.00 | False | 2 | 208 | False | False |
| bulk_vol2:084_SC_H59_N054_FW_Building_112_Chiller_Addition | bulk_vol2 | 13 | 1.00 | False | 2 | 193 | False | False |
| bulk_vol2:086_CA_Contra_Costa_College_Early_Learning_Center | bulk_vol2 | 8 | 1.00 | False | 1 | 65 | False | False |
| bulk_vol2:087_US_Contra_Costa_College_Chiller_Replacement | bulk_vol2 | 7 | 1.00 | False | 1 | 77 | False | False |
| bulk_vol2:088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX | bulk_vol2 | 260 | 1.00 | False | 1 | 15 | True | False |
| bulk_vol2:089_FL_Airport_Terminal_and_Hangar_Development | bulk_vol2 | 177 | 1.00 | False | 5 | 71 | True | False |
| bulk_vol2:091_IL_Guaranteed_Rate_Field_HVAC_AHU_Renovation | bulk_vol2 | 26 | 1.00 | False | 0 | 178 | False | False |
| bulk_vol2:092_IL_Guaranteed_Rate_Field_HVAC_AHU_Renovation | bulk_vol2 | 13 | 1.00 | False | 1 | 344 | False | False |
| bulk_vol2:093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | bulk_vol2 | 11 | 1.00 | False | 3 | 150 | True | False |
| bulk_vol2:094_FL_Orange_County_Regional_History_Center_HVAC | bulk_vol2 | 9 | 1.00 | False | 3 | 253 | False | False |
| bulk_vol2:095_UT_JVWTP_Washwater_Reclaim_Pump_Station_2_HVAC | bulk_vol2 | 8 | 1.00 | False | 3 | 61 | False | False |
| bulk_vol2:096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | bulk_vol2 | 36 | 1.00 | False | 0 | 681 | False | False |
| bulk_vol2:097_UT_JVWTP_Chemical_Buildings_HVAC_Upgrades_Project | bulk_vol2 | 25 | 1.00 | False | 2 | 71 | False | False |
| bulk_vol2:098_ID_ITD_D3_Bruneau_Maintenance_Shed_HVAC_Upgrade | bulk_vol2 | 20 | 1.00 | False | 2 | 94 | True | False |
| bulk_vol2:100_OH_Butler_Tech_RTU_Welding_Source_Capture | bulk_vol2 | 7 | 1.00 | False | 2 | 65 | False | False |
| raw:baker-county-eoc-bidset | raw | 65 | 1.00 | False | 3 | 27 | False | False |
| raw:bldg5406-hvac-demo-mechanical | raw | 22 | 1.00 | False | 1 | 232 | False | False |
| raw:federal-attachment4-mechanical | raw | 24 | 1.00 | False | 2 | 585 | False | False |
| raw:federal-mech-legend-raster | raw | 1 | 0.00 | True | 0 | 0 | False | False |
| raw:itd-d1-lab-mechanical | raw | 29 | 1.00 | False | 1 | 423 | False | False |
| raw:itd-d1-lab-raster | raw | 1 | 0.00 | True | 0 | 0 | False | False |
| raw:navfac-cherry-point-atc-mechanical | raw | 75 | 1.00 | False | 12 | 755 | False | False |
| raw:tarrant-county-mechanical | raw | 8 | 1.00 | False | 0 | 152 | False | False |
| raw:tinker-afb-iwcs-controls | raw | 31 | 1.00 | False | 7 | 36 | False | False |
| raw:weld-county-mechanical-permit | raw | 8 | 1.00 | False | 1 | 172 | False | True |

## Known processing exclusion

`bulk_vol2:036_LA_VA_Project_502_21_222_EHRM_Infrastructure` is excluded from
the review queue: `src/build_review_queue.py` hung (no progress for several
minutes, no crash, no MemoryError raised) on this specific family during
queue generation and was killed rather than left blocking the whole batch.
Not root-caused further this session (real time cost vs. one family out of
117 was not worth chasing). Documented here as an honest, disclosed gap, not
silently dropped. A future session should profile this specific PDF's
per-page `get_drawings()` cost in isolation before re-attempting it.
