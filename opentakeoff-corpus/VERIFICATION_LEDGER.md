# Per-set verification ledger

Durable state for the real mandate (GOAL.md top / rule "THE REAL MANDATE"):
pick one real set at a time, build on demand, render real pages, verify
every real table cell-by-cell, root-cause and fix real bugs, test, commit
with real before/after evidence, move on. This file exists so a fresh loop
tick (or a fresh session) can see progress without re-deriving it from
GOAL.md prose. 116 real compile-key sets total (see
`takeoffs/cross-set-compile/*.compile.json`).

Status values: `pending` (not yet verified this effort), `verified-clean`
(cell-by-cell checked, no real bug found), `verified-fixed` (bug found and
fixed, see GOAL.md rule N), `verified-open` (real bug found, root-caused,
NOT yet fixed — see GOAL.md rule N for why), `not-a-bug` (investigated,
confirmed correct behavior on a real artifact).

| set_id | status | GOAL.md rule |
|---|---|---|
| 05_MO_VA_StLouis_AHU_VAV_Replacement | verified-fixed | 12 |
| 11_CA_SDSU_EngSciences_Complex_100SD | not-a-bug | 15 |
| 013_MO_T2523_01_Replace_Boilers_Phase_2_Building_29 | verified-open | 17 |
| 028_TX_Renovation_of_Building_615_Final_Design_Plans | verified-open | 18 |
| 01_NY_VA_Northport_Dialysis_100CD | verified-open | 14 |
| 001_NC_FY20_P_228_ATC_Tower_and_Air_Operations | verified-open | 19 |
| 004_MO_T2504_03_Interior_and_Exterior_Renovation | verified-open | 17, 20 |
| 006_US_U2607_01_Interior_Renovations_C_Wing_Updates | verified-open | 21 |
| 008_MO_T2331_01_Repair_to_Interior_Exterior_Unheated | verified-open | 22 |
| 009_FL_USDA_APHIS_Plant_Inspection_Station_Building | verified-open | 23 |
| 010_US_WWYK240146_Design_Implement_Monitoring_Control | verified-clean | — (0 real tables confirmed correct: sequence-of-operations narrative only, no real schedules anywhere in 31 pages) |
| 011_IL_VA_Hines_Finance_Center_Renovation | verified-open | 24 |
| 014_MT_USDA_Forest_Service_Missoula_Fire_Sciences | verified-open | 21 (2nd confirmation) |
| 015_VA_P_095_Replace_Submarine_Pier_3_Utility | verified-open | 25 (low severity — otherwise clean) |
| 016_NY_Alter_Repair_Building_1624_Irish_Hill_Test | verified-open | 26 (likely corpus-wide) |
| 017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | verified-fixed | 27 (both vector + ODL-path fixes shipped) |
| 018_GA_USDA_ARS_U_S_National_Poultry_Research_Center | verified-fixed | 27 (2nd real confirmation, ODL-path fix verified here) |

All other set_ids in `takeoffs/cross-set-compile/*.compile.json` are
`pending` — not yet individually cell-by-cell verified this effort. Update
this table as each one is picked up.
