# D10 — Full BAS points takeoff

Status: `IN PROGRESS — ground truth authored; N=5 not started`

## Live question

> Do a full BAS points takeoff across the extracted points-list and DDC
> points-list families. For POINTS LIST DOAH-TI, POINTS LIST AHU-T1A/TIB,
> FCU WITH COOLING COILS DDC POINTS LIST, FCU WITH HEATING AND COOLING
> COILS DDC POINTS LIST, and UNIT HEATER DDC POINTS LIST, give each
> list's row count and AI/AO/BI/BO breakdown, then the overall
> AI/AO/BI/BO totals and row total across those five lists. Cite each
> list title and the MARK cells for DOAH AI07, AHU AI10, FCU-cooling
> AO01, and unit-heater BI02 so I can spot-check.

## Follow-up (required for lock)

> On POINTS LIST AHU-T1A/TIB, how many point descriptions name AHU-T1A
> vs AHU-T1B, and how many are shared? Confirm AI10's description and
> alarm/trend.

## Why this is hard

`navfac-cherry-point-atc` (75 sheets) has many points-list / DDC titles
across Air Ops, MITRACON, and ATCT; only five families extract as typed
`query_table` rows today. A correct takeoff must roll up those five by
AI/AO/BI/BO without inventing counts from title-only schematic sheets.

## Proven answer (ground truth — before model runs)

| List | Rows | AI | AO | BI | BO |
|---|---:|---:|---:|---:|---:|
| DOAH-TI (#64) | 34 | 13 | 4 | 13 | 4 |
| AHU-T1A/TIB (#65) | 62 | 21 | 7 | 26 | 8 |
| FCU cooling (#67) | 9 | 3 | 1 | 4 | 1 |
| FCU H+C (#67) | 11 | 4 | 2 | 4 | 1 |
| Unit heater (#67) | 6 | 2 | 1 | 2 | 1 |
| **Overall** | **122** | **43** | **15** | **49** | **15** |

Spot-check: DOAH AI07 = TOA HUMIDITY; AHU AI10 = AHU-T1A HW VALVE POSITION (FEEDBACK); FCU-cool AO01 = CHW VALVE CONTROL; UH BI02 = CUH/UH DDC RESET.

Follow-up: T1A **24** / T1B **24** / shared **14**; AI10 alarm/trend **No**/**No**.

20% hand-count: 25/25 stratified MARK samples reconciled via `query_table` row_key.

## N=5 gate

Not started.

## Production UI proof

Not started.
