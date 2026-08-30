# T-BAS-01 — NAVFAC BAS / DDC points takeoff

Status: `LOCKED` (5/5)

## Set

`navfac-cherry-point-atc` — `raw/navfac-cherry-point-atc-mechanical.pdf` (75 sheets)

## Live prompt (frozen)

See `prompt.txt`.

## Scope

Five extractable POINTS/DDC lists — **122** rows (AI 43 / AO 15 / BI 49 / BO 15).
Title-only schematic lists disclosed non-extractable in `truth.json` exclusions.

## Validation

| Run | Cold | Gates 1–5 |
|---|---|---|
| 1 | yes | PASS |
| 2 | | PASS |
| 3 | | PASS |
| 4 | | PASS |
| 5 | yes | PASS + canonical export |

Canonical workbook: `export/` (list CSVs + `run-5.xlsx` + `takeoff.json`).
Interrogation: `interrogation/run-5.json`.
