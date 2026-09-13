# Demo Corpus grading ledger

Per-document progress against `keys/DEMO_CORPUS.txt`'s own zero-error bar
(goal `goals/VECTORGRID_TABLE_BOXES.md`, "The Demo Corpus — the walk-out
proof"): self-supervised MISSED=0 hand-confirmed by rendering, every box
hand-graded blind (EoB ≤ 4pt, no auto-accept), every cell hand-transcribed
off the render and exact-matched against the extractor (no cellocr.py
shortcut). This file exists so a fresh session can see exactly how far
grading has gotten without re-deriving it — the same reason
`VERIFICATION_LEDGER.md` exists for the older "real mandate" effort.

**Status, honestly: grading has JUST STARTED.** 3 of 32 documents have
been hand-rendered and checked for real table count this session
(2026-09-13); 0 of 32 have completed box+cell grading. The remaining ~29
documents (~800 of the set's own 821 real tables) are untouched. This is
not a shrunk bar — it is the real number reached, stated plainly, per this
goal's own non-negotiable rule against quietly reporting a smaller sample
as if it were the whole thing.

Status values: `not-started` (nothing done), `missed-checked` (rendered,
real table count hand-confirmed, box/cell grading not yet done),
`box-graded` (missed-checked, plus every real table's box hand-picked
blind and scored), `cell-graded` (box-graded, plus every cell hand-
transcribed and exact-matched — this is PASS/FAIL for the document).

| document | status | real tables found | notes |
|---|---|---|---|
| 052_IL_VA_Project_537_17_115_Sterile_Processing | missed-checked | 0 | Confirmed clean by fresh render (p2 spot-checked) and full-document text-layer scan for every "SCHEDULE" mention — all 3 hits are incidental cross-references ("UL schedule firestop", "SEE THE TRANSFORMER SCHEDULE", "SEE APPROPRIATE SCHEDULE"), none a real table caption. Matches `VERIFICATION_LEDGER.md`'s own prior entry — that one was right for the right reason. |
| 056_NY_VA_Project_632_19_106_Renovate_Pharmacy_Spaces | missed-checked | 0 (reachable) | `VERIFICATION_LEDGER.md`'s prior entry was WRONG about why (claimed "zero mentions of SCHEDULE"; the document's own page 3 visibly carries 4 real schedule tables). Corrected 2026-09-13: pages 1-4 and 6 of this 6-page PDF return ZERO text spans each (`textSpans()`, direct measurement) — every real schedule is drawn in vector-outlined glyphs, unreachable by any text-layer method. The 0-reachable-table conclusion holds, now for the right, written-down reason (goal doc's own Scope rule, vector-outlined-glyph exclusion). See TAKEOFF_BUG_CATALOGUE.md's updated 056_NY note and this goal's own Scope rule section. |
| 20_TX_JudsonISD_MEP_Upgrades_Pkg6 | missed-checked | 1 real (0 correctly found) | Real table found and fully hand-transcribed (AHU / NEW FAN INTERLOCKS, 11 rows, p4): `AHU-1:—, AHU-2:EF-04,EF-08, AHU-3:EF-05,EF-09, AHU-4:EF-06, AHU-5:EF-07, AHU-6:EF-13, AHU-7:EF-14, AHU-8:—, AHU-9:EF-01,EF-02,EF-03 / EF-5(ADMIN), AHU-10:EF-15(BLDG E), RTU-1:F-3A,F-3A(GYM)`. Production pipeline finds ZERO tables matching this real one, and instead fabricates one phantom table from two side-by-side numbered-notes prose lists (see TAKEOFF_BUG_CATALOGUE.md's new B-16). This document currently FAILS the Demo Corpus bar on both MISSED and false-positive grounds — not yet re-checked after any fix, because B-16 is disclosed, not fixed. |
| 020_MO_R2415_01_HVAC_System_Upgrades_MSHP_Troop_C | not-started | — (census: 2) | |
| 063_MT_Harrison_Hall_Extruder_Lab_132_Renovation | not-started | — (census: 5) | |
| 08_ME_BGS_Augusta_EastCampus_Renovation | not-started | — (census: 5) | |
| 045_FL_VA_Project_516_21_107_EHRM_Infrastructure | not-started | — (census: 6) | |
| 092_IL_Guaranteed_Rate_Field_HVAC_AHU_Renovation | not-started | — (census: 6) | |
| 28_WA_KCHA_PublicHousing_HVAC | not-started | — (census: 6) | |
| 083_MA_Town_Offices_Facilities_HVAC_System_Upgrades | not-started | — (census: 8) | |
| 25_WA_DouglasCounty_Courthouse_HVAC_DDC | not-started | — (census: 8) | |
| 012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | not-started | — (census: 9) | |
| 028_TX_Renovation_of_Building_615_Final_Design_Plans | not-started | — (census: 9) | |
| 067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | not-started | — (census: 11) | |
| 008_MO_T2331_01_Repair_to_Interior_Exterior_Unheated | not-started | — (census: 13) | |
| 075_MT_Renne_Library_Innovation_Learning_Studio | not-started | — (census: 16) | |
| 17_FL_SuwanneeHS_Courtyard_100CD | not-started | — (census: 16) | |
| 13_MI_MSU_LifeSciences_LabRenovation | not-started | — (census: 17) | |
| 04_NV_VA_LasVegas_CentralUtilityPlant | not-started | — (census: 24) | |
| 038_NC_VA_Project_637_22_700_EHRM_Infrastructure | not-started | — (census: 25) | |
| 072_CA_CA07_2627_West_Valley_College_Science_Math | not-started | — (census: 26) | |
| 015_VA_P_095_Replace_Submarine_Pier_3_Utility | not-started | — (census: 28) | |
| 037_AR_VA_Project_598_19_118_Replace_21_Air_Handling | not-started | — (census: 29) | |
| 042_VA_Renovate_VCS_Patriot_Cafe_VA_project_546_17 | not-started | — (census: 40) | |
| 088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX | not-started | — (census: 41) | |
| 11_CA_SDSU_EngSciences_Complex_100SD | not-started | — (census: 46) | |
| 060_XX_ASC_Open_Mechanical_Competition_LAMBDA_Project | not-started | — (census: 50) | |
| 019_FL_Eglin_AFB_Building_XX_Contract_Documents_01_04 | not-started | — (census: 52) | |
| 001_NC_FY20_P_228_ATC_Tower_and_Air_Operations | not-started | — (census: 53) | |
| 096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | not-started | — (census: 67) | |
| 01_NY_VA_Northport_Dialysis_100CD | not-started | — (census: 83) | |
| 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for | not-started | — (census: 119) | |

"census: N" is the text-layer table count from
`reports/VOLUME_FLOOR_CENSUS-2026-09-13.json` — the pipeline's own claimed
count, NOT yet hand-confirmed, and (per 20_TX's own measured result above)
not to be trusted at face value: it can both undercount (a real ruled
table missed) and overcount (a fabricated phantom table) on the exact same
document. Every row must still be independently rendered and read by eye
before its own MISSED count means anything.

**Next real step for a future session:** continue down this list in
census-count order (smallest first, for the fastest per-document
completions), same discipline as 20_TX — render every page, hand-
transcribe every real table before looking at the extractor's own answer,
then compare. Any new fabricated-table or missed-table finding gets its
own bug-catalogue entry, same as B-16.
