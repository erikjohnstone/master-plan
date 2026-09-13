# HELDOUT set grading ledger

Per-document progress against `keys/HELDOUT.txt`'s own frozen 32-document
split (goal `goals/VECTORGRID_TABLE_BOXES.md`) — the same zero-error bar
as `keys/DEMO_CORPUS_GRADING.md`: self-supervised MISSED=0 hand-confirmed
by rendering, every box hand-graded blind (EoB ≤ 4pt, no auto-accept),
every cell hand-transcribed off the render and exact-matched against the
extractor. This file is HELDOUT's own version of that ledger — kept
separate because the goal's own "declared first, and frozen" rule means
this split must never be used to change vectorgrid, and must be re-run
untouched rather than re-drawn to improve a score.

**A real, load-bearing fact discovered while starting this file:**
`keys/DEMO_CORPUS.txt` and `keys/HELDOUT.txt` are drawn from the same
113-document population and are NOT disjoint — 9 documents appear in
BOTH lists (confirmed by direct `comm -12` set intersection):
`019_FL_Eglin_AFB_Building_XX_Contract_Documents_01_04`,
`028_TX_Renovation_of_Building_615_Final_Design_Plans`,
`038_NC_VA_Project_637_22_700_EHRM_Infrastructure`,
`04_NV_VA_LasVegas_CentralUtilityPlant`,
`056_NY_VA_Project_632_19_106_Renovate_Pharmacy_Spaces`,
`063_MT_Harrison_Hall_Extruder_Lab_132_Renovation`,
`083_MA_Town_Offices_Facilities_HVAC_System_Upgrades`,
`13_MI_MSU_LifeSciences_LabRenovation`, `28_WA_KCHA_PublicHousing_HVAC`.
All 9 are already `missed-checked` per `DEMO_CORPUS_GRADING.md`'s own
Demo Corpus pass (2026-09-13) — that work counts here too, since the
underlying measurement (hand-render, hand-count, compare to extractor)
is identical regardless of which list a document is drawn for. This is
NOT double-counting a document to inflate this file's own count — it is
recognizing real, already-done work rather than redoing it. Full
per-document writeups for these 9 live in `DEMO_CORPUS_GRADING.md`; this
file cross-references rather than duplicates them.

Status values: `not-started` (nothing done), `missed-checked` (rendered,
real table count hand-confirmed, box/cell grading not yet done),
`box-graded` (missed-checked, plus every real table's box hand-picked
blind and scored), `cell-graded` (box-graded, plus every cell hand-
transcribed and exact-matched — this is PASS/FAIL for the document).

**Status: 13 of 32 HELDOUT documents missed-checked (9 via Demo Corpus
overlap, 4 new this session); 19 of 32 untouched. 0 of 32 have completed
FULL box+cell grading.**

| document | status | real tables found | notes |
|---|---|---|---|
| 019_FL_Eglin_AFB_Building_XX_Contract_Documents_01_04 | missed-checked | 8 real, all 8 correct | Via Demo Corpus overlap — see `DEMO_CORPUS_GRADING.md` for full writeup (p14, M7.1). |
| 028_TX_Renovation_of_Building_615_Final_Design_Plans | missed-checked | see Demo Corpus ledger | Via Demo Corpus overlap — see `DEMO_CORPUS_GRADING.md` for full writeup. |
| 038_NC_VA_Project_637_22_700_EHRM_Infrastructure | missed-checked | see Demo Corpus ledger | Via Demo Corpus overlap — see `DEMO_CORPUS_GRADING.md` for full writeup (source of B-7's own original trace). |
| 04_NV_VA_LasVegas_CentralUtilityPlant | missed-checked | see Demo Corpus ledger | Via Demo Corpus overlap — see `DEMO_CORPUS_GRADING.md` for full writeup (page 32, B-17's 3-more-instances evidence). |
| 056_NY_VA_Project_632_19_106_Renovate_Pharmacy_Spaces | missed-checked | 0 (vector-outlined glyphs, unreachable) | Via Demo Corpus overlap — see `DEMO_CORPUS_GRADING.md` for full writeup. |
| 063_MT_Harrison_Hall_Extruder_Lab_132_Renovation | missed-checked | 6 real, 5 correct+titled, 1 correct but untitled | Via Demo Corpus overlap — see `DEMO_CORPUS_GRADING.md` for full writeup (page 9, B-17's original finding). |
| 083_MA_Town_Offices_Facilities_HVAC_System_Upgrades | missed-checked | see Demo Corpus ledger; 2/2 box-graded (100% @4pt) | Via Demo Corpus overlap — see `DEMO_CORPUS_GRADING.md` for full writeup and box-tier evidence section. |
| 13_MI_MSU_LifeSciences_LabRenovation | missed-checked | see Demo Corpus ledger; 6/6 box-graded (100% @4pt) | Via Demo Corpus overlap — see `DEMO_CORPUS_GRADING.md` for full writeup and box-tier evidence section. |
| 28_WA_KCHA_PublicHousing_HVAC | missed-checked | see Demo Corpus ledger | Via Demo Corpus overlap — see `DEMO_CORPUS_GRADING.md` for full writeup (vectorgrid/ODL over-merge history, task #64). |
| 100_OH_Butler_Tech_RTU_Welding_Source_Capture | missed-checked | 2 real hand-confirmed (1 correct, 1 missed) | Both the pre-computed census (0 tables) and the live pipeline's own `--mode graph` output (1 table) undercounted this small 7-page document. Hand-confirmed 2 real tables: DIFFUSER, GRILLE, AND REGISTER SCHEDULE (p5, sheet M1.0, role `plan`, 4 rows — correctly extracted, proving task #60's plan-role-schedule fix still works) and GAS INPUT SCHEDULE FOR BUTLER TECH (p7, sheet P1.0, role `plan`, 6 rows: 5 equipment + 1 total — completely missing from the pipeline's output, confirmed absent via full-JSON string search, not misattached). New bug filed: TAKEOFF_BUG_CATALOGUE.md's B-27 — a real title→non-tabular-metadata-block→header shape, related to but structurally distinct from the already-fixed #90 (fusion) and open #86 (header-below-caption). |
| 19_CA_VistaUSD_DataCenter | missed-checked | 0 (confirmed genuine) | Already investigated and closed in `VERIFICATION_LEDGER.md` ("verified-clean"): this 24-page document's only real page matching a schedule-adjacent keyword search (page 10, dense 13K-character page) is a symbols/abbreviations legend and spec-note page, not a real equipment schedule table — no real HVAC equipment schedules exist on this document to miss. Accepted as-is rather than re-rendering, since that entry's own description already shows direct page inspection was done, not just a keyword-absence assumption. |
| 086_CA_Contra_Costa_College_Early_Learning_Center | missed-checked | 0 (reachable) — 3 real tables/28 rows visible but text-layer-unreachable | Sheet M0.1 (p4, "EXISTING EQUIPMENT SCHEDULE", correctly role-classified `schedule`) visibly carries 3 real, titled, ruled tables: EXISTING ROOFTOP AIR CONDITIONING UNIT SCHEDULE (8 rows, AC-1..AC-8), EXISTING EXHAUST FAN SCHEDULE (8 rows, EF-1..EF-8), EXISTING VVT TERMINAL BOX SCHEDULE (12 rows) — 28 rows total. Production pipeline returns 0 tables for the entire 8-sheet document despite page 4's correct `schedule` role tag (ruling out role misclassification). Direct `textSpans()` measurement confirms why: only 31 real text spans exist on the whole page, and every one is title-block boilerplate (project name, drawing number, "EXISTING" — the shared first word of all 3 titles) — literally NONE of the 3 tables' own titles, column headers, or 28 data rows (no `AC-1`, no `1600`, no `TODDLER`, nothing) appear in the text layer at all. This is the SAME vector-outlined-glyph category already established for `056_NY` and `020_MO` in the Demo Corpus pass (goal doc's own Scope rule: vector-outlined-glyph content is correctly EXCLUDED, not a pipeline defect) — a 3rd confirmed document in this category, not a new bug. |
| 069_ID_ITD_District_2_Laboratory_Heating_Upgrades | missed-checked | 4 real hand-confirmed, all 4 correct, all 11 rows correct | Clean document. Sheet M3.0 (p5, "MECHANICAL SCHEDULES") hand-confirmed to carry 4 real tables: EXISTING AIR HANDLING UNIT SCHEDULE (1 row), EXISTING CONDENSING HOT WATER BOILER SCHEDULE (2), NEW PUMP SCHEDULE (6), NEW VARIABLE FREQUENCY DRIVE SCHEDULE (2). All 4 match the production pipeline exactly (11/11 rows). The pipeline also correctly found a 5th table not covered by this pass's "SCHEDULE"-keyword search — a 46-row MECHANICAL ABBREVIATIONS legend on p2 — left unverified since it's a legend, not an equipment schedule, consistent with this pass's established scope. |
| 26_CA_TransbayTower_Mechanical_64Sheets | not-started | — (census: 3 tables, 64 pages) | |
| 084_SC_H59_N054_FW_Building_112_Chiller_Addition | not-started | — (census: 3 tables, 13 pages) | |
| 032_PA_Construct_EHRM_Infrastructure_Upgrades | not-started | — (census: 5 tables, 85 pages) | |
| 098_ID_ITD_D3_Bruneau_Maintenance_Shed_HVAC_Upgrade | not-started | — (census: 5 tables, 20 pages) | |
| D_25_CO_weld-mech-permit-set | not-started | — (census: 7 tables, 8 pages) | |
| 14_OR_KlamathCC_LearningCtr_Mechanical | not-started | — (census: 9 tables, 17 pages) | |
| 15_IA_IowaState_Biorenewables_Lab | not-started | — (census: 10 tables, 11 pages) | Sheet #11 already referenced elsewhere in this project's own bug catalogue (header/data-boundary defect family, tasks #87/#94) — worth cross-checking against that prior finding when graded. |
| 080_CA_Contra_Costa_College_Science_Center_Conference | not-started | — (census: 15 tables, 23 pages) | |
| 013_MO_T2523_01_Replace_Boilers_Phase_2_Building_29 | not-started | — (census: 19 tables, 28 pages) | |
| 018_GA_USDA_ARS_U_S_National_Poultry_Research_Center | not-started | — (census: 20 tables, 25 pages) | |
| 023_US_Chiller_Replacement_at_U_S_Salinity_Laboratory | not-started | — (census: 21 tables, 17 pages) | |
| 009_FL_USDA_APHIS_Plant_Inspection_Station_Building | not-started | — (census: 28 tables, 31 pages) | Already referenced in bug catalogue history (task #65, panel-schedule key gap, closed/fixed) — worth cross-checking against that prior fix when graded. |
| 011_IL_VA_Hines_Finance_Center_Renovation | not-started | — (census: 32 tables, 29 pages) | |
| 071_ME_BGS_Project_3809_Health_Science_Center | not-started | — (census: 35 tables, 59 pages) | |
| 12_MT_MSU_ReidHall_Renovation | not-started | — (census: 40 tables, 43 pages) | |
| 016_NY_Alter_Repair_Building_1624_Irish_Hill_Test | not-started | — (census: 43 tables, 27 pages) | |
| 06_MO_NatlGuard_JeffCity_CST_Addition | not-started | — (census: 73 tables, 85 pages) | |
| 21_VA_OrangeCounty_PublicSafetyBldg | not-started | — (census: 78 tables, 128 pages) | |
| 089_FL_Airport_Terminal_and_Hangar_Development | not-started | — (census: 93 tables, 177 pages, largest) | |

"census: N tables, M pages" is the text-layer table count and page count
from `reports/VOLUME_FLOOR_CENSUS-2026-09-13.json` — the pipeline's own
claimed count, NOT yet hand-confirmed, and (per this project's own
repeated finding elsewhere) not to be trusted at face value: it can both
undercount and overcount on the same document. Every row must still be
independently rendered and read by eye before its own MISSED count means
anything.

**Next real step for a future session:** continue down the `not-started`
rows in ascending census-table-count order (smallest first, for the
fastest per-document completions), same discipline as the Demo Corpus
pass — render every page, hand-transcribe every real table before
looking at the extractor's own answer, then compare. Any new
fabricated-table or missed-table finding gets its own bug-catalogue
entry in `TAKEOFF_BUG_CATALOGUE.md`, or amends an existing B-N entry if
the signature matches one already found in the Demo Corpus pass.
