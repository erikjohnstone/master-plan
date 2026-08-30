# D02 — AHU BAS point to location

Status: `LOCKED — API 5/5; localhost stdio + production UI proof validated`

## Live question

> Trace AHU-T1A's heating-water valve feedback point from the BAS points list
> back to the air handler. Give me the point mark, alarm and trend requirements,
> the unit's physical location and maximum supply airflow, what the unit serves,
> and cite the physical drawing section where the equipment is shown.

## Why this is hard

The real NAVFAC Cherry Point set has 75 sheets and three building namespaces.
MI731's `POINTS LIST AHU-T1A/TIB` interleaves AHU-T1A and AHU-T1B under reused
AI/AO/BI/BO marks. The answer must select AI10 (`AHU-T1A HW VALVE POSITION
(FEEDBACK)`), join AHU-T1A on the separate M-621 air-handler schedule, then
cite the M-002 ATCT cab narrative and the physical `AHU-T1A / AHU-T1B SECTION`
without substituting schedule LOCATION text for drawing narrative.

## Proven answer

| Field | Value | Source |
|---|---|---|
| Point mark | AI10 | MI731 points list |
| Alarm / trend | No / No | MI731 points list |
| Point description | AHU-T1A HW VALVE POSITION (FEEDBACK) | MI731 points list |
| Equipment tag | AHU-T1A | M-621 AHU schedule |
| Location | 11TH FLOOR MECHANICAL | M-621 AHU schedule |
| Max supply CFM | 3850 | M-621 AHU schedule |
| Serves | Verbatim M-002 ATCT cab narrative text run | M-002 |
| Physical section | AHU-T1A / AHU-T1B SECTION | sheet #28 |

`truth.json` records the independently authored typed values, exact source
regions, and tolerances. `fixture.json` pins the external source PDF by SHA-256.

## N=5 gate

| Run | Source index | Values | Resolvable | OCR grounded | Live latency |
|---:|---|---:|---:|---:|---:|
| 1 | forced cold | 9/9 | 9/9 | 9/9 | 7.263 s |
| 2 | fresh session | 9/9 | 9/9 | 9/9 | 6.299 s |
| 3 | fresh session | 9/9 | 9/9 | 9/9 | 6.665 s |
| 4 | fresh session | 9/9 | 9/9 | 9/9 | 7.060 s |
| 5 | forced cold | 9/9 | 9/9 | 9/9 | 6.244 s |

Nearest-rank p95: **7.263 seconds**. Gate: **5/5 clean** via `verify:demo`.

Every run records the raw model responses, request IDs, model/version,
complete production tool payloads, citations, source-index setup latency, and
live prompt latency under `runs/`.

## Local-host proof

The production bundle was exercised as a separate local stdio MCP process.
`local-host-run.json` records `transport: "stdio_local_process"`, harness True
under `verify:demo`, and live latency of about 5.2 seconds after index.

## Production UI proof

The validated production-UI proof is saved as
`/opt/cursor/artifacts/d02_ui_prompt_tools_answer_highlights_2026-08-30T04-16-33-201Z.webm`.
Its ~38.6-second walkthrough visibly shows the frozen prompt, live set-wide
tool calls (including omit-sheet `find_text`), the complete answer matching
truth (AI10, alarm/trend, description, location, 3850 CFM, control-cab
narrative, AHU-T1A/AHU-T1B SECTION), and navigation to M-621 / MI731 / M-002.
The proof harness rejects iteration caps, placeholders, schedule-LOCATION
serves laundering, missing sheet ids, missing BAS mark/description fields,
and normalized citation coordinates before retaining the uniquely named video.

UI path fixes that cleared this gate are generalized production behavior
(optional set-wide `find_text`, drawing-text vs LOCATION evidence gates, BAS
point-mark/description methodology) — not demo-PDF special cases.

## Failure behavior

Classified misses before fixes: invented title filters / iteration budget
(`RETRIEVAL`), `sheet` vs `sheet_id` (`CITE_FORM`), Unicode hyphen drift
(`VALUE`), schedule LOCATION laundered as drawing text (`VALUE`/`RETRIEVAL`),
find_text query-string echoes (`VALUE`), and UI `find_text` requiring sheet
so set-wide search could not run. Production runner/UI tooling now rejects
those shapes without answer-steering prompts. Missing evidence still returns
an explicit refusal rather than a fabricated value.

## Regression

From `opentakeoff/mcp`:

```bash
node --import tsx --test test/demoD02.regression.test.mjs
npm run verify:demo -- ../../opentakeoff-corpus/demos/D02-ahu-bas-point-to-location/truth.json ../../opentakeoff-corpus/demos/D02-ahu-bas-point-to-location/runs/run-1.json
```

The first command validates the real pinned PDF through the production engine.
The second rechecks an accepted model run through the reusable OCR verifier.
