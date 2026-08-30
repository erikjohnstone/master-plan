# D10 — Full BAS points takeoff

Status: `LOCKED — API 5/5 + stdio + UI proof (expandable cards + verified follow-up)`

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

> On POINTS LIST AHU-T1A/TIB, how many point descriptions name only
> AHU-T1A, how many name only AHU-T1B, and how many name neither
> (shared/common points)? Confirm AI10's description and alarm/trend.

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

`fixture.json` pins the external source PDF by SHA-256.

## N=5 gate

| Run | Cold | Latency |
|---:|---|---:|
| 1 | forced cold | 5.122 s |
| 2 | fresh session | 4.887 s |
| 3 | fresh session | 4.544 s |
| 4 | fresh session | 6.296 s |
| 5 | forced cold | 5.936 s |

Nearest-rank p95: **6.296 seconds**. Gate: **5/5 clean** via `verify:demo`.

Raw responses, request IDs, model/version, tool payloads, and citations are
under `runs/`.

## Local-host proof

Production MCP was exercised as a separate local stdio process
(`transport: "stdio_local_process"`) after rebuilding `dist/`. See
`local-host-run.json` (verify clean). The Vite UI path was proved separately
with the frozen prompt + follow-up.

## Production UI proof

Validated recording:
`/opt/cursor/artifacts/d10_ui_prompt_answer_cards_followup_2026-08-30T17-02-51-387Z.webm`.

Walkthrough shows the frozen prompt, live tools, answer-first five-list
takeoff (122 / AI 43 / AO 15 / BI 49 / BO 15), expandable source cards, and
a correct in-thread follow-up (T1A 24 / T1B 24 / neither 14 + AI10 HW valve
feedback No/No). Harness: `opentakeoff/web/scripts/demo-ui-proof-d10.mjs`.

Production notes: title-scan `point_type_counts` copy for AI/AO/BI/BO; shared
/neither = total − onlyA − onlyB (not intersection); durable
`takeoffWorkflow` phases ban illegal type-filter `cell_contains` during
title-scans.
