# Cross-set HVAC/BAS compile acceptance (WP1 / Pillar A)

Hand acceptance keys for **non-NAVFAC** US vector mechanical sets. These lock
schedule-compile family counts so demos cannot silently die on the next firm’s
title phrasing (`AIRHANDLINGUNITSCHEDULE`, `GENERAL FAN SCHEDULE`,
`CONTROL VALVE SCHEDULE (HOT WATER…)`, etc.).

## Sets

| Set ID | PDF | Covers |
|---|---|---|
| `bldg5406-hvac-demo` | `raw/bldg5406-hvac-demo-mechanical.pdf` | HVAC family compile (incl. no-space titles) |
| `federal-mech` | `raw/federal-attachment4-mechanical.pdf` | HVAC family compile (FCU/EV, pumps, fans, chiller) |
| `16_NV_CarsonValleyMS_HVAC_Replacement` | `bulk/HVAC_BAS_Plan_Sets/16_NV_CarsonValleyMS_HVAC_Replacement.pdf` | Bulk school HVAC (furnace/condensing unit/RTU/ERV) |
| `04_NV_VA_LasVegas_CentralUtilityPlant` | `bulk/HVAC_BAS_Plan_Sets/_rejoined/04_NV_VA_LasVegas_CentralUtilityPlant.pdf` | Bulk CUP pumps + cooling towers |
| `26_CA_TransbayTower_Mechanical_64Sheets` | `bulk/HVAC_BAS_Plan_Sets/_rejoined/26_CA_TransbayTower_Mechanical_64Sheets.pdf` | Bulk high-rise RAH/WFU/VAV blank-title tables |
| `21_VA_OrangeCounty_PublicSafetyBldg` | `bulk/HVAC_BAS_Plan_Sets/_rejoined/21_VA_OrangeCounty_PublicSafetyBldg.pdf` | Bulk VA VAV (DESIGNATION column, 32 tags) |
| `24_IA_JohnsonCounty_Courthouse` | `bulk/HVAC_BAS_Plan_Sets/24_IA_JohnsonCounty_Courthouse.pdf` | Bulk courthouse FCU/ERV/pump + GRILLES plurals + ECP radiant panel |
| `09_ME_BGS_KennebecValleyCC_Renovation` | `bulk/HVAC_BAS_Plan_Sets/09_ME_BGS_KennebecValleyCC_Renovation.pdf` | Bulk multi-split heat pump performance schedules |
| `01_NY_VA_Northport_Dialysis_100CD` | `bulk/HVAC_BAS_Plan_Sets/_rejoined/01_NY_VA_Northport_Dialysis_100CD.pdf` | Bulk VA AHU + RF-12 + H-3 + AIR INLETS & OUTLETS (12 GRD) |
| `30_WA_SpokaneTransit_CoolingTower` | `bulk/HVAC_BAS_Plan_Sets/30_WA_SpokaneTransit_CoolingTower.pdf` | Bulk CUP boiler (BOILER1 mark) + pumps + cooling tower |
| `23_GA_MaconBibb_RecreationCenter` | `bulk/HVAC_BAS_Plan_Sets/_rejoined/23_GA_MaconBibb_RecreationCenter.pdf` | Bulk blank-title FCU/EF tables + heat pump schedule |
| `10_MO_Hawthorn_PsychHospital_HVAC` | `bulk/HVAC_BAS_Plan_Sets/10_MO_Hawthorn_PsychHospital_HVAC.pdf` | Bulk AHU-1A/1B (digit+letter tags) + CU + water heater |
| `17_FL_SuwanneeHS_Courtyard_100CD` | `bulk/HVAC_BAS_Plan_Sets/17_FL_SuwanneeHS_Courtyard_100CD.pdf` | Bulk school RTU only (AHU legend is not a schedule) |
| `05_MO_VA_StLouis_AHU_VAV_Replacement` | `bulk/HVAC_BAS_Plan_Sets/_rejoined/05_MO_VA_StLouis_AHU_VAV_Replacement.pdf` | Bulk VA AC-57 AHU + FCUC + ATU terminals + AIR DEVICE GRD |
| `22_GA_Valdosta_FireStation8_100CD` | `bulk/HVAC_BAS_Plan_Sets/_rejoined/22_GA_Valdosta_FireStation8_100CD.pdf` | Bulk fire station DOAS/pump/fan + GRILLE SCHEDULE |
| `12_MT_MSU_ReidHall_Renovation` | `bulk/HVAC_BAS_Plan_Sets/12_MT_MSU_ReidHall_Renovation.pdf` | Bulk dual-duct VAV + CUH + FINNED PIPE RADIATION (FT-*) |
| `03_FL_HurlburtField_ChildDevCenter` | `bulk/HVAC_BAS_Plan_Sets/03_FL_HurlburtField_ChildDevCenter.pdf` | Bulk blank-title AHU/ATU/ACC with (N) revision prefixes |
| `27_WA_ColvilleTribes_Hatchery_Lab` | `bulk/HVAC_BAS_Plan_Sets/27_WA_ColvilleTribes_Hatchery_Lab.pdf` | Bulk split-system FCU + buffer tanks + fin-tube |
| `18_OR_BakerMS_HVAC_Electrical_FullSet` | `bulk/HVAC_BAS_Plan_Sets/18_OR_BakerMS_HVAC_Electrical_FullSet.pdf` | Bulk MAU makeup-air + heat pumps + GRD |
| `14_OR_KlamathCC_LearningCtr_Mechanical` | `bulk/HVAC_BAS_Plan_Sets/14_OR_KlamathCC_LearningCtr_Mechanical.pdf` | Bulk FC-### fan coils + HYDRONIC PUMPS + HP + EH |
| `25_WA_DouglasCounty_Courthouse_HVAC_DDC` | `bulk/HVAC_BAS_Plan_Sets/25_WA_DouglasCounty_Courthouse_HVAC_DDC.pdf` | Bulk VRF indoor CC-*/AH-* + REF relief fans |
| `06_MO_NatlGuard_JeffCity_CST_Addition` | `bulk/HVAC_BAS_Plan_Sets/_rejoined/06_MO_NatlGuard_JeffCity_CST_Addition.pdf` | Bulk FCU/VAV/RTU + ELECTRIC DUCT HEATER (EDH) |

## How counts were authored

For each keyed family, unique MARK / VALVE MARK tags were counted on the named
equipment schedule title(s) visible on the mechanical schedule sheets (Session
sheet-graph extract of those same titles). Counts are **schedule quantity**,
not installed plan instances. Product code must stay set-agnostic — these
numbers live only in keys/tests, never in `corpusTakeoff` / workflow product
paths.

## Honest empty / refuse

`itd-d1-lab` and `federal-mech` / `bldg5406` have **no extractable POINTS/DDC
lists** on the mechanical PDF used here. BAS compile must report `rows: 0`
with page accounting still present — never invent points.
