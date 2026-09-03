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
| 019_FL_Eglin_AFB_Building_XX_Contract_Documents_01_04 | verified-open | 26 (3rd confirmation + worse real-data-contamination variant) |
| 020_MO_R2415_01_HVAC_System_Upgrades_MSHP_Troop_C | not-a-bug | — (M-601/M-602 HVAC SCHEDULES sheets are genuinely raster/scanned — 3568 embedded images, 68 real text chars on page 12; confirmed unreadable via both vector and OCR-sidecar paths in this environment; honest 2-table output is correct, not a code gap; pre-existing pillar-c-gt draft already flagged this unresolved) |
| 021_XX_Laboratory_building_mechanical_drawings_lab | verified-open | 28 (new architectural finding: I/O matrix marks are vector shapes, not text) + rules 24/26-class false positives (PLAIN OUTLET / W/WIND SCREEN, non-tabular piping-diagram content misread as tables) |
| 023_US_Chiller_Replacement_at_U_S_Salinity_Laboratory | verified-fixed | new: "&"-joined twin-unit marks (CH-1&2, CHWP1&2) now split into answerable compound keys |
| 024_MO_E2508_01_Replace_Steam_Heating_Units_Missouri | verified-clean | — (only 1 real table exists: the project replaces old steam units WITH new RTUs, so PACKAGED EQUIPMENT SCHEDULE (RTU) is the complete real scope, not a gap; confirmed via whole-document scan, all 4 rows/31 columns clean) |
| 029_ME_BGS_Project_3548_MEANG_Building_493_Boiler | not-a-bug | — (real sheet ME601 "MECHANICAL & ELECTRICAL SCHEDULES" exists but its real content is essentially unreadable: only 460 real text chars — all title-block — on the whole page, but 14007 real vector curves and dense clusters of tiny line segments in the schedule's own body area; this looks like text rendered as vector GLYPH OUTLINES rather than real text characters, a 3rd distinct unreadability mechanism this session (raster images on set 020, meaningful vector shapes on set 021, now outlined-text vectors here) — a genuine capability gap, honest 0-table output is correct) |
| 012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | verified-open | 29 (3rd/4th real confirmation of rule 23's cross-table-bleed root cause — VFD Schedule absorbs fabricated values from an unrelated Panelboard Schedule on the same page; Cooling Tower Schedule loses ~all real per-row data to the same mechanism; Chiller Schedule loses ~half its real columns, compounded by unusual letter-spaced header text) |
| 02_UT_FAA_Ogden_AirTrafficControlTower | verified-clean | — (confirms pre-existing "honest zero" draft: 116-page FAA ATCT set has zero real HVAC/BAS equipment schedules, only architectural floor-elevation/mullion/column schedules; "F" missing from "FIRE SPRINKLERS"/"ROOF DRAINS" traces to a real font-encoding gap in the source PDF itself (`(cid:41)` has no ToUnicode mapping, confirmed via pdfplumber's own raw output) — not a pipeline bug; CAB COLUMN OPENING SCHEDULE tagged `[equipment]` kind is architectural not HVAC, low-severity classification quirk, doesn't affect any real tracked HVAC category count) |
| 030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | verified-open | 30 (new, formalizes an already-disclosed code-comment limitation: deep 5-6-tier real headers break header/key detection — FCU Schedule loses 13 of 14 real units (93%), Chilled Beam Schedule collapses 5 real distinct units to 2 unique row keys via wrong key-column pick; CRAC/Heat Trace/Roof Drain/Grille on the same doc all verified clean) |
| 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for | verified-clean | — (spot-checked AHU, Fan, Heat Exchanger, Chilled/Hot Water Coil schedules cell-by-cell against real page 71/72: all correct, including the real dual-row "SELECTION CRITERIA"/"OPERATING CONDITION" convention per unit — e.g. Fan Schedule's 6 rows are genuinely 4 unique real fans, 2 with dual rows, matching the real PDF exactly; GRD 27+32=59 matches compile count exactly) |
| 032_PA_Construct_EHRM_Infrastructure_Upgrades | verified-open | 31 (new, high severity: row-key column picker unconditionally trusts the leftmost real column — every equipment table in this document splits its tag into a TYPE prefix + separate EQUIPMENT NUMBER suffix column, so every row collapses onto the same shared key despite fully correct cell data; confirmed on 6 different real tables, 76+ real units affected across the two largest alone; compile.json's stale `[WEAK]` "1 pump" note is superseded — current build finds 9 real tables with correct row COUNTS and cell VALUES throughout) |
| 033_MN_VA_Project_656_18_301_Construct_Replace | verified-open | 30 (4th confirmation: the single real AHU-6 schedule, an extremely wide 50+-value row, is totally absent from graph.tables — matches federal-mech CH-1's "fully dropped" symptom exactly); also low/moderate: real WALL LOUVER SCHEDULE (5/5 real units, correct keys) gets a wrong generic title ("SIZE (IN.)") and some jumbled TYPE/CFM cell values from 3-way real page interleaving — VAV BOX WITH HOT WATER REHEAT SCHEDULE (18/18 real rows) and CONVECTOR SCHEDULE verified correct despite the same dense interleaving; compile.json's stale `[WEAK]` "AHU+pumps, 3 items" note is superseded — current build finds 8 real tables, most correct |
| 034_NC_VA_Project_637_22_700_EHRM_Infrastructure | verified-clean | — (confirms compile.json's own "honest WEAK — pumps only" note: this 70-page excerpt is sheet 353 of a 559-sheet full project, genuinely scoped to plumbing/demolition/fire-alarm plans plus one real PUMP SCHEDULE (CP-1, CP-2, correct cell-by-cell); every BOILER/CRAC hit elsewhere in the document is a floor-plan room label, a sheet note referencing "mechanical drawings" outside this excerpt, or a demolition-plan equipment tag — not a missed real schedule table) |
| 035_AR_564_19_101_Construct_New_Water_Storage | verified-open | 32 (new, high severity: page 46's 3 real HVAC schedules — DUCTLESS SPLIT CONDENSER (3 units), DUCTLESS SPLIT FAN COIL (3 units), LOUVER (2 units, compile.json itself undercounted this as 1) — are ALL missing from graph.tables; the one "LOUVER SCHEDULE" table that does appear is 100% fabricated from the same page's own title-block/firm-address stamp text, combining rule 26's title-block-misread pattern with rule 30's total-drop pattern) |
| 036_LA_VA_Project_502_21_222_EHRM_Infrastructure | verified-open | 33 (new, high severity: compile.json's own "[ZERO]" label is wrong — real page 63 has 4 real HVAC schedules; VRV Air-Cooled Condensing Unit + Ductless Split System schedules entirely missing from graph.tables; VRV Indoor Unit Schedule's real 15 rows collapse to 1 row that MERGES the first two real rows' cell data together, a new symptom distinct from rules 29/30/32; Computer Room AC keeps the right row count but scrambles indoor/outdoor column groups together in one cell) |

All other set_ids in `takeoffs/cross-set-compile/*.compile.json` are
`pending` — not yet individually cell-by-cell verified this effort. Update
this table as each one is picked up.
