# Assemblies goal — the second tier: dev 2 and held-out 2 (AS-2, AS-17)

Seed **20260926**, drawn 2026-09-26T14:54:59.328Z from the census of 2026-09-26T14:54:23.159Z (`tier2/00-baseline.{json,md}`: the corpus sets unseen when it ran).
Reproduce: `cd opentakeoff/mcp && node --import tsx scripts/assemblies-baseline.mjs ../../opentakeoff-corpus --tier2 20260926`.

Rules (`scripts/assembliesSplit.mjs` drawTier2): the population is the census's documents with ≥ 1 compiled row in a keyed family, less every document whose drafter group (`drafters.json`) holds a WP0.2 document. The seed shuffles the drafter groups, and each group draws one document. Held-out 2 takes groups in that order until it holds 5 documents, skipping a group any of whose documents was examined before the draw (`tier2/examined.json`) or whose document alone covers a required family; a held-out-2 group's other documents are withheld from every tier and from the unseen audit. Dev 2 takes the remaining groups in order until it holds 8 documents, then only groups that add a required family it lacks. Each document keys one claimed table per keyed family, drawn by the seed, every printed row up to 30. WP0.2's split never moves. Held-out 2 is keyed from renders only after dev 2's normalizer work is frozen, and is scored at gates only, aggregates only.

Population: 53 documents in 47 drafter groups. Left out as a WP0.2 drafter's: none. No census: none.
Seeded group order (group: its documents, the one drawn): `pivot-colebreit` 1→`14_OR` · `glumac` 1→`11_CA` · `toland-mizell-molnar` 1→`045_FL` · `alares` 1→`044_NY` · `schmidt-consulting-group` 1→`03_FL` · `mes-group` 1→`042_VA` · `elara-engineering` 1→`092_IL` · `cr-engineering` 1→`16_NV` · `morrison-maierle` 3→`063_MT` · `wiley-wilson` 1→`21_VA` · `johnsondanforth` 1→`037_AR` · `above-group` 1→`047_NC` · `apogee-consulting` 2→`036_LA` · `nbp-engineers` 1→`22_GA` · `tlc-engineering` 2→`17_FL` · `haley-ward` 1→`093_ME` · `kendall-fmi` 1→`028_TX` · `cushing-terrell` 1→`066_MT` · `ahp-engineers` 1→`23_GA` · `mechanical-systems-engineers` 1→`08_ME` · `dec-engineers` 1→`19_CA` · `faa-atct-standard` 1→`02_UT` · `g-and-w-engineering` 1→`008_MO` · `bancroft` 1→`033_MN` · `gannett-fleming` 1→`088_AZ` · `hultz-bhu` 1→`25_WA` · `spur-design` 1→`011_IL` · `klingner` 1→`06_MO` · `wsp` 1→`26_CA` · `heath-engineering` 1→`097_UT` · `insite-group` 1→`012_MO` · `bbs-architects-engineers` 1→`061_IA` · `avcon` 1→`089_FL` · `modus-engineering` 1→`24_IA` · `aesus` 1→`043_FL` · `nk-bhandari` 1→`016_NY` · `spees-design-build` 1→`030_NY` · `cfr-engineering` 1→`017_MD` · `gordon-prill` 1→`067_CA` · `rqaw` 1→`096_IN` · `blw-engineers` 1→`083_MA` · `clark-nexsen` 1→`009_FL` · `lavallee-brensinger` 2→`09_ME` · `solutions-aec` 1→`10_MO` · `tres-west` 1→`28_WA` · `fourfront-design` 1→`04_NV` · `introba` 2→`032_PA`.
Not held out: `pivot-colebreit` (examined: 14_OR_KlamathCC_LearningCtr_Mechanical); `alares` (examined: 044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers); `schmidt-consulting-group` (examined: 03_FL_HurlburtField_ChildDevCenter); `cr-engineering` (examined: 16_NV_CarsonValleyMS_HVAC_Replacement); `morrison-maierle` (examined: 014_MT_USDA_Forest_Service_Missoula_Fire_Sciences, 077_MT_Miller_Dining_Auxiliaries_Offices_HVAC); `wiley-wilson` (examined: 21_VA_OrangeCounty_PublicSafetyBldg).

## Dev 2 — 10 documents, 48 tables, ≤ 201 keyed rows (upper bound from the compile's claimed rows)

Drafter groups: `pivot-colebreit`, `alares`, `schmidt-consulting-group`, `cr-engineering`, `morrison-maierle`, `wiley-wilson`, `above-group`, `apogee-consulting`, `cushing-terrell`, `gannett-fleming`. Covers: VAV, AHU/DOAS/RTU, FCU, pump, fan, UH/CUH, boiler, chiller, cooling tower, HX, ERV, humidifier.
Added for coverage: `cushing-terrell` (humidifier); `gannett-fleming` (cooling tower).

| Set | Family | Table drawn (sheet :: title) | Claimed rows | Keyed rows ≤ | Tables in stratum |
|---|---|---|---|---|---|
| `036_LA_VA_Project_502_21_222_EHRM_Infrastructure` | CONDENSING_UNIT | 036_LA_VA_Project_502_21_222_EHRM_Infrastructure.pdf#63 :: VRV- AIR-COOLED CONDENSING UNIT SCHEDULE | 2 | 2 | 1 |
| `03_FL_HurlburtField_ChildDevCenter` | AHU | 03_FL_HurlburtField_ChildDevCenter.pdf#64 :: VARIABLE VOLUME AIR HANDLING UNIT SCHEDULE | 2 | 2 | 1 |
| `03_FL_HurlburtField_ChildDevCenter` | VAV | 03_FL_HurlburtField_ChildDevCenter.pdf#64 :: AIR TERMINAL UNIT SCHEDULE (AHU 2) | 15 | 15 | 1 |
| `03_FL_HurlburtField_ChildDevCenter` | BOILER | 03_FL_HurlburtField_ChildDevCenter.pdf#64 :: CONDENSING BOILER SCHEDULE | 1 | 1 | 1 |
| `03_FL_HurlburtField_ChildDevCenter` | PUMP | 03_FL_HurlburtField_ChildDevCenter.pdf#64 :: PUMP SCHEDULE | 3 | 3 | 1 |
| `03_FL_HurlburtField_ChildDevCenter` | FAN | 03_FL_HurlburtField_ChildDevCenter.pdf#65 :: FAN SCHEDULE | 4 | 4 | 1 |
| `044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers` | CONDENSING_UNIT | 044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers.pdf#22 :: AIR-COOLED CONDENSING UNIT SCHEDULES (ACCU) | 1 | 1 | 1 |
| `044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers` | BOILER | 044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers.pdf#21 :: BOILER PLANT · FIRE TUBE STEAM BOILER SCHEDULE, PACKAGED TYPE | 4 | 4 | 1 |
| `044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers` | PUMP | 044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers.pdf#21 :: GENERATOR FUEL OIL PUMP SCHEDULE | 2 | 2 | 3 |
| `044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers` | FAN | 044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers.pdf#21 :: FAN SCHEDULE | 7 | 7 | 1 |
| `044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers` | UNIT_HEATER | 044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers.pdf#21 :: STEAM UNIT HEATER SCHEDULE | 3 | 3 | 1 |
| `044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers` | HEAT_EXCHANGER | 044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers.pdf#22 :: BOILER PLANT · ECONOMIZER SCHEDULE, FLUE GAS/FEEDWATER HEAT EXCHANGERS | 2 | 2 | 1 |
| `047_NC_VA_Project_558_22_172_Replace_Chillers_in_AHU` | CONDENSING_UNIT | 047_NC_VA_Project_558_22_172_Replace_Chillers_in_AHU.pdf#10 :: -CONDENSING UNIT | 1 | 1 | 1 |
| `047_NC_VA_Project_558_22_172_Replace_Chillers_in_AHU` | VRF_INDOOR | 047_NC_VA_Project_558_22_172_Replace_Chillers_in_AHU.pdf#21 :: VRF INDOOR UNIT SCHEDULE | 2 | 2 | 1 |
| `047_NC_VA_Project_558_22_172_Replace_Chillers_in_AHU` | VRF_OUTDOOR | 047_NC_VA_Project_558_22_172_Replace_Chillers_in_AHU.pdf#21 :: VRF OUTDOOR UNIT SCHEDULE | 1 | 1 | 1 |
| `047_NC_VA_Project_558_22_172_Replace_Chillers_in_AHU` | AIR_COOLED_CHILLER | 047_NC_VA_Project_558_22_172_Replace_Chillers_in_AHU.pdf#21 :: AIR COOLED WATER CHILLER SCHEDULE | 2 | 2 | 1 |
| `047_NC_VA_Project_558_22_172_Replace_Chillers_in_AHU` | HEAT_RECOVERY_CHILLER | 047_NC_VA_Project_558_22_172_Replace_Chillers_in_AHU.pdf#27 :: EQUIPMENT SCHEDULE | 2 | 2 | 1 |
| `047_NC_VA_Project_558_22_172_Replace_Chillers_in_AHU` | PUMP | 047_NC_VA_Project_558_22_172_Replace_Chillers_in_AHU.pdf#21 :: PUMP SCHEDULE | 3 | 3 | 1 |
| `063_MT_Harrison_Hall_Extruder_Lab_132_Renovation` | VAV | 063_MT_Harrison_Hall_Extruder_Lab_132_Renovation.pdf#9 :: EXISTING VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE - EXTRUDER LAB | 2 | 2 | 1 |
| `063_MT_Harrison_Hall_Extruder_Lab_132_Renovation` | FAN | 063_MT_Harrison_Hall_Extruder_Lab_132_Renovation.pdf#9 :: EXHAUST FAN SCHEDULE - EXTRUDER LAB | 1 | 1 | 1 |
| `066_MT_Barnard_Hall_111_Lithography_Lab_Renovation` | HEAT_PUMP | 066_MT_Barnard_Hall_111_Lithography_Lab_Renovation.pdf#8 :: WATER SOURCE HEAT PUMP SCHEDULE | 1 | 1 | 1 |
| `066_MT_Barnard_Hall_111_Lithography_Lab_Renovation` | HUMIDIFIER | 066_MT_Barnard_Hall_111_Lithography_Lab_Renovation.pdf#8 :: HUMIDIFIER SCHEDULE | 1 | 1 | 1 |
| `088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX` | AHU | 088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX.pdf#30 :: AIR HANDLING UNIT SCHEDULE | 1 | 1 | 1 |
| `088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX` | FCU | 088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX.pdf#30 :: CHILLED WATER FAN COIL UNIT SCHEDULE | 2 | 2 | 2 |
| `088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX` | CONDENSING_UNIT | 088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX.pdf#31 :: AIR COOLED CONDENSING UNIT SCHEDULE | 5 | 5 | 1 |
| `088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX` | AIR_COOLED_CHILLER | 088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX.pdf#246 :: WATER COOLED CENTRIFUGAL CHILLER SCHEDULE | 3 | 3 | 1 |
| `088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX` | PUMP | 088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX.pdf#31 :: PUMP SCHEDULE | 2 | 2 | 2 |
| `088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX` | COOLING_TOWER | 088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX.pdf#246 :: COOLING TOWER SCHEDULE | 3 | 3 | 1 |
| `088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX` | FAN | 088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX.pdf#30 :: SMOKE EXHAUST FAN SCHEDULE | 4 | 4 | 2 |
| `088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX` | UNIT_HEATER | 088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX.pdf#30 :: ELECTRIC DUCT HEATER SCHEDULE | 1 | 1 | 1 |
| `14_OR_KlamathCC_LearningCtr_Mechanical` | DOAS | 14_OR_KlamathCC_LearningCtr_Mechanical.pdf#2 :: DEDICATED OUTDOOR AIR SYSTEM | 4 | 4 | 1 |
| `14_OR_KlamathCC_LearningCtr_Mechanical` | OUTDOOR_AIR_UNIT | 14_OR_KlamathCC_LearningCtr_Mechanical.pdf#3 :: MAKE UP AIR UNITS | 1 | 1 | 1 |
| `14_OR_KlamathCC_LearningCtr_Mechanical` | FCU | 14_OR_KlamathCC_LearningCtr_Mechanical.pdf#3 :: SPLIT SYSTEM HEAT PUMPS | 2 | 2 | 2 |
| `14_OR_KlamathCC_LearningCtr_Mechanical` | HEAT_PUMP | 14_OR_KlamathCC_LearningCtr_Mechanical.pdf#3 :: SPLIT SYSTEM HEAT PUMPS | 2 | 2 | 1 |
| `14_OR_KlamathCC_LearningCtr_Mechanical` | AIR_COOLED_CHILLER | 14_OR_KlamathCC_LearningCtr_Mechanical.pdf#2 :: AIR COOLED CHILLER | 1 | 1 | 1 |
| `14_OR_KlamathCC_LearningCtr_Mechanical` | BOILER | 14_OR_KlamathCC_LearningCtr_Mechanical.pdf#2 :: HOT WATER CONDENSING BOILER | 2 | 2 | 1 |
| `14_OR_KlamathCC_LearningCtr_Mechanical` | PUMP | 14_OR_KlamathCC_LearningCtr_Mechanical.pdf#3 :: HYDRONIC PUMPS | 8 | 8 | 1 |
| `14_OR_KlamathCC_LearningCtr_Mechanical` | UNIT_HEATER | 14_OR_KlamathCC_LearningCtr_Mechanical.pdf#3 :: ELECTRIC HEATERS | 3 | 3 | 1 |
| `14_OR_KlamathCC_LearningCtr_Mechanical` | HEAT_EXCHANGER | 14_OR_KlamathCC_LearningCtr_Mechanical.pdf#3 :: HEAT EXCHANGER | 1 | 1 | 1 |
| `16_NV_CarsonValleyMS_HVAC_Replacement` | OUTDOOR_AIR_UNIT | 16_NV_CarsonValleyMS_HVAC_Replacement.pdf#3 :: OUTDOOR AIR UNIT SCHEDULE | 2 | 2 | 1 |
| `16_NV_CarsonValleyMS_HVAC_Replacement` | RTU | 16_NV_CarsonValleyMS_HVAC_Replacement.pdf#4 :: EXISTING GAS-FIRED DX COOLING ROOF TOP UNIT SCHEDULE (FOR REFERENCE ONLY) | 4 | 4 | 2 |
| `16_NV_CarsonValleyMS_HVAC_Replacement` | ERV | 16_NV_CarsonValleyMS_HVAC_Replacement.pdf#3 :: ENERGY RECOVERY VENTILATOR SCHEDULE | 2 | 2 | 1 |
| `16_NV_CarsonValleyMS_HVAC_Replacement` | FURNACE | 16_NV_CarsonValleyMS_HVAC_Replacement.pdf#3 :: 2-STAGE, GAS FIRED FURNACE SCHEDULE | 21 | 21 | 1 |
| `16_NV_CarsonValleyMS_HVAC_Replacement` | CONDENSING_UNIT | 16_NV_CarsonValleyMS_HVAC_Replacement.pdf#3 :: CONDENSING UNIT SCHEDULE | 23 | 23 | 1 |
| `21_VA_OrangeCounty_PublicSafetyBldg` | VAV | 21_VA_OrangeCounty_PublicSafetyBldg.pdf#50 :: VAV TERMINAL BOX SCHEDULE | 57 | 30 | 1 |
| `21_VA_OrangeCounty_PublicSafetyBldg` | CONDENSING_UNIT | 21_VA_OrangeCounty_PublicSafetyBldg.pdf#51 :: AIR COOLED CONDENSING UNIT SCHEDULE | 9 | 9 | 1 |
| `21_VA_OrangeCounty_PublicSafetyBldg` | PUMP | 21_VA_OrangeCounty_PublicSafetyBldg.pdf#30 :: DOMESTIC WATER BOOSTER PUMP SCHEDULE | 1 | 1 | 2 |
| `21_VA_OrangeCounty_PublicSafetyBldg` | FAN | 21_VA_OrangeCounty_PublicSafetyBldg.pdf#117 ::  | 2 | 2 | 2 |

## HELD-OUT 2 — 5 documents, 13 tables, ≤ 83 keyed rows (upper bound from the compile's claimed rows)

Drafter groups: `glumac`, `toland-mizell-molnar`, `mes-group`, `elara-engineering`, `johnsondanforth`. Covers: VAV, AHU/DOAS/RTU, FCU, pump, fan, HX, humidifier.
Withheld (a held-out-2 drafter's other documents): `035_AR_564_19_101_Construct_New_Water_Storage`, `091_IL_Guaranteed_Rate_Field_HVAC_AHU_Renovation`.

| Set | Family | Table drawn (sheet :: title) | Claimed rows | Keyed rows ≤ | Tables in stratum |
|---|---|---|---|---|---|
| `037_AR_VA_Project_598_19_118_Replace_21_Air_Handling` | PUMP | 037_AR_VA_Project_598_19_118_Replace_21_Air_Handling.pdf#56 ::  | 1 | 1 | 1 |
| `042_VA_Renovate_VCS_Patriot_Cafe_VA_project_546_17` | FAN | 042_VA_Renovate_VCS_Patriot_Cafe_VA_project_546_17.pdf#24 ::  | 1 | 1 | 1 |
| `045_FL_VA_Project_516_21_107_EHRM_Infrastructure` | FCU | 045_FL_VA_Project_516_21_107_EHRM_Infrastructure.pdf#21 :: CHILLED WATER FAN COIL UNIT SCHEDULE | 9 | 9 | 1 |
| `092_IL_Guaranteed_Rate_Field_HVAC_AHU_Renovation` | FCU | 092_IL_Guaranteed_Rate_Field_HVAC_AHU_Renovation.pdf#11 :: FAN COIL SCHEDULE - (2-PIPE CHILLED WATER) (FCU) | 5 | 5 | 1 |
| `092_IL_Guaranteed_Rate_Field_HVAC_AHU_Renovation` | CONDENSING_UNIT | 092_IL_Guaranteed_Rate_Field_HVAC_AHU_Renovation.pdf#11 :: C O N D E N S I N G U N I T S C H E D U L E ( C U ) | 3 | 3 | 1 |
| `11_CA_SDSU_EngSciences_Complex_100SD` | AHU | 11_CA_SDSU_EngSciences_Complex_100SD.pdf#81 :: AIR HANDLING UNIT SCHEDULE | 3 | 3 | 1 |
| `11_CA_SDSU_EngSciences_Complex_100SD` | FCU | 11_CA_SDSU_EngSciences_Complex_100SD.pdf#83 :: TWO PIPE COOLING FAN COIL UNIT SCHEDULE | 18 | 18 | 1 |
| `11_CA_SDSU_EngSciences_Complex_100SD` | VAV | 11_CA_SDSU_EngSciences_Complex_100SD.pdf#81 :: VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE-HOT WATER REHEAT | 40 | 30 | 2 |
| `11_CA_SDSU_EngSciences_Complex_100SD` | PUMP | 11_CA_SDSU_EngSciences_Complex_100SD.pdf#84 :: PUMP SCHEDULE | 6 | 6 | 4 |
| `11_CA_SDSU_EngSciences_Complex_100SD` | FAN | 11_CA_SDSU_EngSciences_Complex_100SD.pdf#81 :: LABORATORY EXHAUST FAN SCHEDULE | 2 | 2 | 2 |
| `11_CA_SDSU_EngSciences_Complex_100SD` | HUMIDIFIER | 11_CA_SDSU_EngSciences_Complex_100SD.pdf#84 :: ELECTRIC HUMIDIFIER SCHEDULE | 1 | 1 | 1 |
| `11_CA_SDSU_EngSciences_Complex_100SD` | HEAT_EXCHANGER | 11_CA_SDSU_EngSciences_Complex_100SD.pdf#84 :: WATER-TO-WATER HEAT EXCHANGER SCHEDULE | 2 | 2 | 2 |
| `11_CA_SDSU_EngSciences_Complex_100SD` | DUCT_MOUNTED_COIL | 11_CA_SDSU_EngSciences_Complex_100SD.pdf#84 :: DUCT MOUNTED COIL SCHEDULE | 2 | 2 | 1 |

