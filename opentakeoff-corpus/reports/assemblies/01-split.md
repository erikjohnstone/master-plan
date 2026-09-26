# Assemblies goal — WP0.2 frozen dev / held-out split

Seed **20260923**, drawn 2026-09-23T19:47:34.049Z from the census of 2026-09-23T19:47:16.244Z.
Reproduce: `cd opentakeoff/mcp && node --import tsx scripts/assemblies-baseline.mjs ../../opentakeoff-corpus --split 20260923`.

Rules (TRUTH, goals/ASSEMBLIES.md): documents are grouped by drafter (`drafters.json`, with the text evidence per firm) so no drafter sits on both sides; the seed shuffles the groups; groups go to held-out in that order until it holds ≥ 5 documents, skipping a group whose removal would leave a required family uncovered in dev; then one claimed table is drawn per document × family stratum, and every printed row of it (up to 30, in printed order) is keyed from the render. Held-out documents are never used for tuning and are scored only at gates.

Population: 17 documents with ≥ 1 compiled row in a keyed equipment family (duplicates and derived renditions excluded: 062_ID_ITD_District_1_Laboratory_Building_Mechanical, itd-d1-lab-raster).
Seeded group order: `imeg` → `up-engineers-architects` → `usda-ars-southeast-area` → `coffman-engineers` → `crockett-engineering` → `burns-mcdonnell` → `atkins` → `davis-monthan-afb-ce` → `smithgroup` → `sazan-engineers` → `unidentified:074_CA_West_Valley_College_STEM_Classroom_HVAC` → `musgrove-engineering` → `ace-inc` → `casco-diversified`.
Kept in dev to preserve coverage: `imeg` (HX).

## Dev — 11 documents, 56 tables, ≤ 189 keyed rows (upper bound from the compile's claimed rows)

Drafter groups: `ace-inc`, `atkins`, `casco-diversified`, `davis-monthan-afb-ce`, `imeg`, `musgrove-engineering`, `sazan-engineers`, `smithgroup`, `unidentified:074_CA_West_Valley_College_STEM_Classroom_HVAC`. Covers: VAV, AHU/DOAS/RTU, FCU, pump, fan, UH/CUH, boiler, chiller, cooling tower, HX, ERV, humidifier.

| Set | Family | Table drawn (sheet :: title) | Claimed rows | Keyed rows ≤ | Tables in stratum |
|---|---|---|---|---|---|
| `004_MO_T2504_03_Interior_and_Exterior_Renovation` | DOAS | 004_MO_T2504_03_Interior_and_Exterior_Renovation.pdf#39 :: DOAS SCHEDULE | 1 | 1 | 1 |
| `004_MO_T2504_03_Interior_and_Exterior_Renovation` | RTU | 004_MO_T2504_03_Interior_and_Exterior_Renovation.pdf#39 :: ROOFTOP UNIT SCHEDULE | 7 | 7 | 1 |
| `004_MO_T2504_03_Interior_and_Exterior_Renovation` | PUMP | 004_MO_T2504_03_Interior_and_Exterior_Renovation.pdf#31 :: SUMP PUMP SCHEDULE | 1 | 1 | 2 |
| `004_MO_T2504_03_Interior_and_Exterior_Renovation` | FAN | 004_MO_T2504_03_Interior_and_Exterior_Renovation.pdf#39 :: EXHAUST FAN SCHEDULE | 3 | 3 | 1 |
| `004_MO_T2504_03_Interior_and_Exterior_Renovation` | UNIT_HEATER | 004_MO_T2504_03_Interior_and_Exterior_Renovation.pdf#39 :: NATURAL GAS UNIT HEATER SCHEDULE | 1 | 1 | 1 |
| `031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for` | AHU | 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for.pdf#72 :: AIR HANDLING UNIT SCHEDULE | 1 | 1 | 1 |
| `031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for` | PUMP | 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for.pdf#71 :: PUMP SCHEDULE | 4 | 4 | 1 |
| `031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for` | FAN | 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for.pdf#33 :: EQUIPMENT SCHEDULE | 1 | 1 | 2 |
| `031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for` | UNIT_HEATER | 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for.pdf#72 :: ELECTRIC UNIT HEATER SCHEDULE | 2 | 2 | 1 |
| `031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for` | HUMIDIFIER | 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for.pdf#71 :: STEAM HUMIDIFER SCHEDULE | 1 | 1 | 1 |
| `031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for` | HEAT_EXCHANGER | 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for.pdf#71 :: STEAM TO WATER HEAT EXCHANGER SCHEDULE | 2 | 2 | 1 |
| `031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for` | DUCT_MOUNTED_COIL | 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for.pdf#72 :: CHILLED WATER COOLING COIL SCHEDULE | 1 | 1 | 2 |
| `040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile` | PUMP | 040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile.pdf#47 :: PUMP SCHEDULE | 2 | 2 | 1 |
| `040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile` | FAN | 040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile.pdf#47 :: FAN SCHEDULE | 6 | 6 | 1 |
| `040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile` | UNIT_HEATER | 040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile.pdf#47 :: UNIT HEATER SCHEDULE - HOT WATER | 6 | 6 | 1 |
| `069_ID_ITD_District_2_Laboratory_Heating_Upgrades` | AHU | 069_ID_ITD_District_2_Laboratory_Heating_Upgrades.pdf#5 :: EXISTING AIR HANDLING UNIT SCHEDULE | 1 | 1 | 1 |
| `069_ID_ITD_District_2_Laboratory_Heating_Upgrades` | BOILER | 069_ID_ITD_District_2_Laboratory_Heating_Upgrades.pdf#5 :: EXISTING CONDENSING HOT WATER BOILER SCHEDULE | 2 | 2 | 1 |
| `069_ID_ITD_District_2_Laboratory_Heating_Upgrades` | PUMP | 069_ID_ITD_District_2_Laboratory_Heating_Upgrades.pdf#5 :: NEW PUMP SCHEDULE | 6 | 6 | 1 |
| `074_CA_West_Valley_College_STEM_Classroom_HVAC` | ERV | 074_CA_West_Valley_College_STEM_Classroom_HVAC.pdf#25 :: ENERGY RECOVERY VENTILATOR | 1 | 1 | 1 |
| `094_FL_Orange_County_Regional_History_Center_HVAC` | AHU | 094_FL_Orange_County_Regional_History_Center_HVAC.pdf#8 :: Air Handling Unit Schedule CHW | 5 | 5 | 1 |
| `094_FL_Orange_County_Regional_History_Center_HVAC` | AIR_COOLED_CHILLER | 094_FL_Orange_County_Regional_History_Center_HVAC.pdf#8 :: Packaged Air Cooled Water Chiller Schedule | 1 | 1 | 1 |
| `094_FL_Orange_County_Regional_History_Center_HVAC` | COOLING_TOWER | 094_FL_Orange_County_Regional_History_Center_HVAC.pdf#8 :: Cooling Tower Schedule | 1 | 1 | 1 |
| `12_MT_MSU_ReidHall_Renovation` | VAV | 12_MT_MSU_ReidHall_Renovation.pdf#28 :: DUAL DUCT VARIABLE AIR VOLUME UNIT SCHEDULE | 4 | 4 | 1 |
| `12_MT_MSU_ReidHall_Renovation` | CABINET_UNIT_HEATER | 12_MT_MSU_ReidHall_Renovation.pdf#28 :: CABINET UNIT HEATER SCHEDULE | 2 | 2 | 1 |
| `12_MT_MSU_ReidHall_Renovation` | FIN_TUBE_RADIATION | 12_MT_MSU_ReidHall_Renovation.pdf#28 :: FINNED PIPE RADIATION SCHEDULE | 4 | 4 | 1 |
| `baker-county-eoc` | FCU | baker-county-eoc-bidset.pdf#41 :: SPLIT SYSTEM FAN COIL UNIT SCHEDULE | 2 | 2 | 1 |
| `baker-county-eoc` | RTU | baker-county-eoc-bidset.pdf#41 :: PACKAGED ROOFTOP AIR CONDITIONING UNIT SCHEDULE (GAS HEAT) | 2 | 2 | 1 |
| `baker-county-eoc` | ERV | baker-county-eoc-bidset.pdf#41 :: ENERGY RECOVERY VENTILATOR SCHEDULE | 1 | 1 | 1 |
| `baker-county-eoc` | CONDENSING_UNIT | baker-county-eoc-bidset.pdf#41 :: SPLIT SYSTEM CONDENSING UNIT SCHEDULE | 2 | 2 | 1 |
| `baker-county-eoc` | FAN | baker-county-eoc-bidset.pdf#41 :: FAN SCHEDULE | 1 | 1 | 1 |
| `bldg5406-hvac-demo` | AHU | bldg5406-hvac-demo-mechanical.pdf#6 :: AIR HANDLING UNIT SCHEDULE | 1 | 1 | 1 |
| `bldg5406-hvac-demo` | FCU | bldg5406-hvac-demo-mechanical.pdf#6 :: SPLIT SYSTEM AIR CONDITIONING UNITS | 1 | 1 | 1 |
| `bldg5406-hvac-demo` | VAV | bldg5406-hvac-demo-mechanical.pdf#6 :: AIR TERMINAL BOX SCHEDULE | 9 | 9 | 1 |
| `bldg5406-hvac-demo` | CONDENSING_UNIT | bldg5406-hvac-demo-mechanical.pdf#6 :: SPLIT SYSTEM AIR CONDITIONING UNITS | 1 | 1 | 1 |
| `bldg5406-hvac-demo` | AIR_COOLED_CHILLER | bldg5406-hvac-demo-mechanical.pdf#6 :: PACKAGED AIR COOLED CHILLER SCHEDULE | 1 | 1 | 1 |
| `bldg5406-hvac-demo` | PUMP | bldg5406-hvac-demo-mechanical.pdf#18 ::  | 1 | 1 | 1 |
| `bldg5406-hvac-demo` | FAN | bldg5406-hvac-demo-mechanical.pdf#6 :: FAN SCHEDULE | 5 | 5 | 1 |
| `federal-mech` | AHU | federal-attachment4-mechanical.pdf#14 :: AIR HANDLING UNIT SCHEDULE | 1 | 1 | 1 |
| `federal-mech` | FCU | federal-attachment4-mechanical.pdf#15 :: DX FAN COIL UNIT SCHEDULE | 6 | 6 | 2 |
| `federal-mech` | VAV | federal-attachment4-mechanical.pdf#16 :: VOLUME CONTROL BOX SCHEDULE | 58 | 30 | 1 |
| `federal-mech` | CONDENSING_UNIT | federal-attachment4-mechanical.pdf#15 :: AIR-COOLED CONDENSING UNIT SCHEDULE | 6 | 6 | 1 |
| `federal-mech` | AIR_COOLED_CHILLER | federal-attachment4-mechanical.pdf#14 :: CHILLER SCHEDULE (ELECTRIC AIR-COOLED) | 1 | 1 | 1 |
| `federal-mech` | BOILER | federal-attachment4-mechanical.pdf#14 :: HOT WATER CONDENSING BOILER SCHEDULE | 2 | 2 | 1 |
| `federal-mech` | PUMP | federal-attachment4-mechanical.pdf#14 :: PUMP SCHEDULE | 11 | 11 | 1 |
| `federal-mech` | FAN | federal-attachment4-mechanical.pdf#14 :: GENERAL FAN SCHEDULE | 4 | 4 | 1 |
| `federal-mech` | UNIT_HEATER | federal-attachment4-mechanical.pdf#15 :: UNIT HEATER SCHEDULE (HOT WATER) | 2 | 2 | 1 |
| `federal-mech` | FIN_TUBE_RADIATION | federal-attachment4-mechanical.pdf#15 :: FIN TUBE RADIATION SCHEDULE | 4 | 4 | 1 |
| `itd-d1-lab` | AHU | itd-d1-lab-mechanical.pdf#15 :: AIR HANDLING UNIT SCHEDULE | 1 | 1 | 1 |
| `itd-d1-lab` | FCU | itd-d1-lab-mechanical.pdf#14 :: SPLIT SYSTEM AIR CONDITIONING UNIT SCHEDULE (96%+ GAS) | 1 | 1 | 2 |
| `itd-d1-lab` | CONDENSING_UNIT | itd-d1-lab-mechanical.pdf#14 :: SPLIT SYSTEM AIR CONDITIONING UNIT SCHEDULE (96%+ GAS) | 1 | 1 | 2 |
| `itd-d1-lab` | BOILER | itd-d1-lab-mechanical.pdf#13 :: CONDENSING HOT WATER BOILER SCHEDULE | 2 | 2 | 1 |
| `itd-d1-lab` | PUMP | itd-d1-lab-mechanical.pdf#12 :: PUMP SCHEDULE | 4 | 4 | 1 |
| `itd-d1-lab` | FAN | itd-d1-lab-mechanical.pdf#13 :: LAB EXHAUST FAN SCHEDULE | 1 | 1 | 2 |
| `itd-d1-lab` | UNIT_HEATER | itd-d1-lab-mechanical.pdf#14 :: ELECTRIC HEATER SCHEDULE | 9 | 9 | 1 |
| `itd-d1-lab` | HUMIDIFIER | itd-d1-lab-mechanical.pdf#13 :: HUMIDIFIER SCHEDULE | 1 | 1 | 1 |
| `itd-d1-lab` | DUCT_MOUNTED_COIL | itd-d1-lab-mechanical.pdf#13 :: HOT WATER REHEAT COIL SCHEDULE | 9 | 9 | 1 |

## HELD-OUT — 6 documents, 26 tables, ≤ 94 keyed rows (upper bound from the compile's claimed rows)

Drafter groups: `up-engineers-architects`, `usda-ars-southeast-area`, `coffman-engineers`, `crockett-engineering`, `burns-mcdonnell`. Covers: VAV, AHU/DOAS/RTU, FCU, pump, fan, UH/CUH, boiler, chiller, cooling tower, humidifier.

| Set | Family | Table drawn (sheet :: title) | Claimed rows | Keyed rows ≤ | Tables in stratum |
|---|---|---|---|---|---|
| `018_GA_USDA_ARS_U_S_National_Poultry_Research_Center` | HEAT_PUMP | 018_GA_USDA_ARS_U_S_National_Poultry_Research_Center.pdf#13 :: WATER SOURCE HEAT PUMP (PART 1 OF 2) | 1 | 1 | 1 |
| `018_GA_USDA_ARS_U_S_National_Poultry_Research_Center` | FAN | 018_GA_USDA_ARS_U_S_National_Poultry_Research_Center.pdf#13 :: EXHAUST FAN SCHEDULE | 1 | 1 | 1 |
| `024_MO_E2508_01_Replace_Steam_Heating_Units_Missouri` | RTU | 024_MO_E2508_01_Replace_Steam_Heating_Units_Missouri.pdf#11 :: PACKAGED EQUIPMENT SCHEDULE (RTU) | 4 | 4 | 1 |
| `060_XX_ASC_Open_Mechanical_Competition_LAMBDA_Project` | CONDENSING_UNIT | 060_XX_ASC_Open_Mechanical_Competition_LAMBDA_Project.pdf#24 :: CONDENSING UNIT SCHEDULE (RCUA) | 2 | 2 | 1 |
| `060_XX_ASC_Open_Mechanical_Competition_LAMBDA_Project` | PUMP | 060_XX_ASC_Open_Mechanical_Competition_LAMBDA_Project.pdf#23 :: VERTICAL SPLIT-CASE HVAC PUMP SCHEDULE | 2 | 2 | 1 |
| `060_XX_ASC_Open_Mechanical_Competition_LAMBDA_Project` | DUCT_MOUNTED_COIL | 060_XX_ASC_Open_Mechanical_Competition_LAMBDA_Project.pdf#52 ::  | 3 | 3 | 1 |
| `30_WA_SpokaneTransit_CoolingTower` | BOILER | 30_WA_SpokaneTransit_CoolingTower.pdf#2 :: GAS-FIRED HYDRONIC BOILER SCHEDULE | 1 | 1 | 1 |
| `30_WA_SpokaneTransit_CoolingTower` | PUMP | 30_WA_SpokaneTransit_CoolingTower.pdf#2 :: HVAC PUMP SCHEDULE | 3 | 3 | 1 |
| `30_WA_SpokaneTransit_CoolingTower` | COOLING_TOWER | 30_WA_SpokaneTransit_CoolingTower.pdf#2 :: CLOSED COOLING TOWER SCHEDULE | 1 | 1 | 1 |
| `bessemer` | HEAT_PUMP | bessemer-mechanical-bidset.pdf#8 :: VARIABLE REFRIGERANT PACKAGED HEAT PUMP | 1 | 1 | 1 |
| `bessemer` | FAN | bessemer-mechanical-bidset.pdf#8 :: FAN SCHEDULE | 1 | 1 | 1 |
| `navfac-cherry-point-atc` | AHU | navfac-cherry-point-atc-mechanical.pdf#42 :: AIR HANDLING UNIT SCHEDULE | 2 | 2 | 3 |
| `navfac-cherry-point-atc` | DOAH_UNIT | navfac-cherry-point-atc-mechanical.pdf#42 :: DEDICATED OUTDOOR AIR UNIT SCHEDULE | 2 | 2 | 2 |
| `navfac-cherry-point-atc` | DOAH_HANDLING | navfac-cherry-point-atc-mechanical.pdf#49 :: DEDICATED OUTDOOR AIR HANDLING UNIT SCHEDULE | 1 | 1 | 1 |
| `navfac-cherry-point-atc` | FCU | navfac-cherry-point-atc-mechanical.pdf#45 :: FAN COIL UNIT SCHEDULE | 10 | 10 | 3 |
| `navfac-cherry-point-atc` | VAV | navfac-cherry-point-atc-mechanical.pdf#43 :: VARIABLE AIR VOLUME TERMINAL BOX | 27 | 27 | 2 |
| `navfac-cherry-point-atc` | AIR_COOLED_CHILLER | navfac-cherry-point-atc-mechanical.pdf#44 :: AIR COOLED CHILLER SCHEDULE | 2 | 2 | 1 |
| `navfac-cherry-point-atc` | HEAT_RECOVERY_CHILLER | navfac-cherry-point-atc-mechanical.pdf#45 :: AIR COOLED HEAT RECOVERY CHILLER SCHEDULE | 2 | 2 | 1 |
| `navfac-cherry-point-atc` | BOILER | navfac-cherry-point-atc-mechanical.pdf#45 :: BOILER SCHEDULE | 2 | 2 | 3 |
| `navfac-cherry-point-atc` | PUMP | navfac-cherry-point-atc-mechanical.pdf#45 :: PUMP SCHEDULE | 11 | 11 | 3 |
| `navfac-cherry-point-atc` | FAN | navfac-cherry-point-atc-mechanical.pdf#44 :: FAN SCHEDULE | 3 | 3 | 3 |
| `navfac-cherry-point-atc` | CABINET_UNIT_HEATER | navfac-cherry-point-atc-mechanical.pdf#48 :: CABINET UNIT HEATER SCHEDULE | 2 | 2 | 3 |
| `navfac-cherry-point-atc` | UNIT_HEATER | navfac-cherry-point-atc-mechanical.pdf#45 :: UNIT HEATER SCHEDULE | 1 | 1 | 2 |
| `navfac-cherry-point-atc` | CRAH | navfac-cherry-point-atc-mechanical.pdf#48 :: COMPUTER ROOM AIR HANDLER TYPE SCHEDULE | 2 | 2 | 2 |
| `navfac-cherry-point-atc` | DEHUMIDIFIER | navfac-cherry-point-atc-mechanical.pdf#44 :: DEHUMIDIFIER SCHEDULE | 6 | 6 | 3 |
| `navfac-cherry-point-atc` | HUMIDIFIER | navfac-cherry-point-atc-mechanical.pdf#43 :: HUMIDIFIER SCHEDULE | 1 | 1 | 3 |


## Key-authoring scope (decided after the draw, before any key is committed)

The seeded draw above froze **which documents are held-out**. The size it gives
is below GATE 0's dev target in this environment: 17 documents are in the local
population (AS-2), the seed's group order put a two-document group fifth into
held-out (6 documents), so dev has 11 documents, and one table per stratum caps
dev at ≤ 189 instances (target ≥ 12 documents and ≥ 300 instances). The draw is
not redone to reach the target (ASSEMBLIES_BUG_CATALOGUE AS-7). Instead:

- **Dev keys cover every claimed keyed-family table in the 11 dev documents, all
  printed rows** (63 tables, 245 rows by the compile's claim), not the one-table
  sample. That is strictly more truth, and it does not touch the held-out side.
- **Held-out keys cover the drawn tables** listed above (26 tables, ≤ 94 rows),
  authored before any normalizer code exists.
- A claimed table that is not what its family says is still keyed as printed,
  and the mismatch goes to the catalogue. A printed schedule the compile does
  not claim is outside the population (e.g. 094's humidifier schedule), and
  the miss goes to the catalogue, not into a key.
