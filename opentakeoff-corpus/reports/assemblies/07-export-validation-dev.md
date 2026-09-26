# Assemblies goal — instrument 5, export validation (dev)

Generated 2026-09-24T07:04:10.472Z. Documents: the frozen dev split (11). Reproduce: `cd opentakeoff/mcp && node --import tsx scripts/assemblies-export-validate.mjs ../../opentakeoff-corpus --report`.

Per document: the starter applied to the compile, the CSV set built and checked (`exportSet.ts` `csvSetProblems`); the HIT rows built (coil-derived ones included) and filled into the template, each workbook read back.

| Document | Units | Lines | CSV problems | lines.csv | points.csv | valves.csv | HIT scheduled | HIT coil-derived | WP0 coils without a valve | Workbooks | HIT problems |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `004_MO_T2504_03_Interior_and_Exterior_Renovation` | 26 | 624 | 0 | 624 | 244 | 12 | 1 | 0 | 0 | 1 | 0 |
| `031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for` | 94 | 189 | 0 | 189 | 37 | 3 | 0 | 30 | 30 | 1 | 0 |
| `040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile` | 29 | 165 | 0 | 165 | 54 | 6 | 0 | 32 | 32 | 1 | 0 |
| `069_ID_ITD_District_2_Laboratory_Heating_Upgrades` | 11 | 127 | 0 | 127 | 24 | 0 | 0 | 4 | 4 | 1 | 0 |
| `074_CA_West_Valley_College_STEM_Classroom_HVAC` | 24 | 34 | 0 | 34 | 18 | 1 | 22 | 0 | 0 | 1 | 0 |
| `094_FL_Orange_County_Regional_History_Center_HVAC` | 7 | 319 | 0 | 319 | 127 | 6 | 0 | 6 | 6 | 1 | 0 |
| `12_MT_MSU_ReidHall_Renovation` | 12 | 215 | 0 | 215 | 86 | 2 | 0 | 6 | 6 | 1 | 0 |
| `baker-county-eoc` | 13 | 184 | 0 | 184 | 70 | 3 | 0 | 0 | 0 | 1 | 0 |
| `bldg5406-hvac-demo` | 30 | 425 | 0 | 425 | 206 | 5 | 0 | 2 | 2 | 1 | 0 |
| `federal-mech` | 128 | 3220 | 0 | 3220 | 1379 | 71 | 0 | 70 | 70 | 1 | 0 |
| `itd-d1-lab` | 97 | 232 | 0 | 232 | 81 | 0 | 10 | 11 | 11 | 1 | 0 |

## Totals

- documents: 11
- errored: 0
- documents_with_problems: 0
- csv_problems: 0
- hit_problems: 0
- units: 471
- lines: 5734
- hit_scheduled_rows: 33
- coil_derived_rows: 161
- coil_derived_with_gpm: 161
- coil_derived_with_system: 60
- wp0_coils_without_valve: 161
- documents_whose_coil_rows_differ_from_wp0: 0
- workbooks: 11

GATE 7 (dev): export validation green; coil-derived rows 161 against 161 WP0 coils without a scheduled valve.
