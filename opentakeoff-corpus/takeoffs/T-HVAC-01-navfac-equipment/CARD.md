# T-HVAC-01 — NAVFAC full HVAC equipment takeoff

Status: `LOCKED` (5/5)

## Set

`navfac-cherry-point-atc` — `raw/navfac-cherry-point-atc-mechanical.pdf` (75 sheets)

## Live prompt (frozen)

See `prompt.txt`.

## Scope

22 scheduled HVAC equipment families — **396** unique tags. Exclusions in
`truth.json` (vibration isolation, fan sound, points/DDC, general notes).

## Validation

| Run | Cold | Gates 1–5 |
|---|---|---|
| 1 | yes | PASS |
| 2 | | PASS |
| 3 | | PASS |
| 4 | | PASS |
| 5 | yes | PASS + canonical export |

Canonical workbook: `export/` (category CSVs + `run-5.xlsx` + `takeoff.json`).
Interrogation: `interrogation/run-5.json`.
