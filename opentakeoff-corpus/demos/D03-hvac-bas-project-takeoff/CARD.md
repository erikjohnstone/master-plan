# D03 — HVAC/BAS project takeoff

Status: `LOCKED — API 5/5 + stdio + UI proof (primary totals + HANDLING follow-up)`

## Live question

> Do a full HVAC equipment and BAS controls takeoff across Air Ops, MITRACON,
> and the ATCT. Give me the scheduled unit counts for AHUs, dedicated
> outdoor-air units on the DOAH unit schedules, fan coils, VAV boxes,
> air-cooled chillers, heat-recovery chillers, and boilers (set totals), the
> Air Ops and ATCT fan-coil splits, the Air Ops and MITRACON VAV splits, and
> how many rows are on the AHU-T1A/TIB BAS points list. Cite the schedule MARK
> cells for AHU-A1, DOAH-A1, FCU-A1, VAV-A101, CH-A1, CH-MT1, and B-A1, plus
> the points-list title, so I can spot-check.

## Follow-up (required for lock)

> Is DOAH-T1 on a dedicated outdoor-air schedule? Which title, and how many
> ATCT fan coils are scheduled including FCU-T11?

## Why this is hard

The real NAVFAC Cherry Point set has 75 sheets and three building namespaces.
Unique MARK rollups must separate sibling schedule titles (DOAH UNIT vs
HANDLING; air-cooled vs heat-recovery chillers), ignore vibration-isolation
compound keys, and join a named BAS points list (`AHU-T1A/TIB` = 62) without
accepting a bare `POINTS LIST` sibling rollup. Short title needles like `AIR`
must not blend unrelated `AIR*` schedules into a fake AHU total.

## Proven answer

| Field | Value | Source |
|---|---|---|
| AHU | 5 | AIR HANDLING UNIT SCHEDULE (A/M/T) |
| DOAH unit | 3 | DEDICATED OUTDOOR AIR UNIT SCHEDULE (A1/A2/M1) |
| FCU | 42 (A=14, T=18) | FAN COIL UNIT SCHEDULE |
| VAV | 52 (A=27, M=25) | VARIABLE AIR VOLUME TERMINAL BOX |
| Air-cooled chillers | 2 | AIR COOLED CHILLER SCHEDULE |
| Heat-recovery chillers | 2 | AIR COOLED HEAT RECOVERY CHILLER SCHEDULE |
| Boilers | 6 | BOILER SCHEDULE |
| AHU-T1A/TIB points rows | 62 | POINTS LIST AHU-T1A/TIB (MI731) |

Follow-up: DOAH-T1 is on **DEDICATED OUTDOOR AIR HANDLING UNIT SCHEDULE**;
ATCT fan coils = **18** including **FCU-T11**.

`truth.json` records typed values, citations, 20% hand-count reconciliation,
and the follow-up expectations. `fixture.json` pins the external source PDF
by SHA-256.

## N=5 gate

| Run | Cold | Latency |
|---:|---|---:|
| 1 | forced cold | 9.524 s |
| 2 | fresh session | 9.076 s |
| 3 | fresh session | 11.860 s |
| 4 | fresh session | 12.156 s |
| 5 | forced cold | 9.827 s |

Nearest-rank p95: **12.156 seconds**. Gate: **5/5 clean** via `verify:demo`.

Raw responses, request IDs, model/version, tool payloads, and citations are
under `runs/`.

## Local-host proof

Production MCP was exercised as a separate local stdio process
(`transport: "stdio_local_process"`). See `local-host-run.json`. The Vite UI
path was proved separately with the frozen prompt + follow-up.

## Production UI proof

Validated recording:
`/opt/cursor/artifacts/d03_ui_prompt_answer_cards_followup_2026-08-30T10-38-25-850Z.webm`.

Walkthrough shows the frozen prompt, live tools, answer-first family totals
matching truth (including chillers 2+2 and points 62), source cards, on-sheet
MARK paints, and a correct in-thread follow-up (HANDLING title + ATCT 18 +
FCU-T11). Harness rejects empty answers, wrong family totals, dual
contradictory totals tables, and missing follow-up evidence.

UI/API path fixes that cleared this gate are generalized production behavior
(title-scan counts; short-needle rejection; chiller non-blend; DOAH UNIT vs
HANDLING; named points-list; follow-up gate scoping; string-arg coercion;
primary schedule-title ranking for MARK lookups; compact find_schedule miss
errors) — not demo-PDF special cases.

## Failure behavior

Classified misses before lock: short `AIR` title needle blending ~77 schedules
(`VALUE`/`RETRIEVAL`), DOAH UNIT+HANDLING page sums, bare POINTS LIST rollup
122, generic CHILLER blending air-cooled+heat-recovery, follow-up re-imposing
full takeoff gates, and oversized find_schedule miss dumps blowing context.
Production tooling now rejects those shapes. Missing evidence still returns an
explicit refusal rather than a fabricated value.

## Regression

From `opentakeoff/mcp`:

```bash
node --import tsx --test test/demoD03.regression.test.mjs
npm run verify:demo -- ../../opentakeoff-corpus/demos/D03-hvac-bas-project-takeoff/truth.json ../../opentakeoff-corpus/demos/D03-hvac-bas-project-takeoff/runs/run-1.json
```

The first command validates the real pinned PDF through the production engine.
The second rechecks an accepted model run through the reusable OCR verifier.
