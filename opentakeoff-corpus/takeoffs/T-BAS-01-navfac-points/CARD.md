# T-BAS-01 — NAVFAC BAS / DDC points takeoff

Status: `LOCKED` (MCP 5/5 · UI 5/5) — ODL also runs on legend/unknown sheets that print locked POINTS/DDC list titles (NAVFAC #64); broad POINTS LIST→schedule role flip reverted (over-recovered Air Ops siblings).

## Set

`navfac-cherry-point-atc` — `raw/navfac-cherry-point-atc-mechanical.pdf` (75 sheets)

## Live prompt (frozen)

See `prompt.txt`.

## Scope

Five extractable POINTS/DDC lists — **122** rows (AI 43 / AO 15 / BI 49 / BO 15).
Title-only schematic lists disclosed non-extractable in `truth.json` exclusions.

## Validation — MCP

| Run | Cold | Gates 1–5 |
|---|---|---|
| 1 | yes | PASS |
| 2 | | PASS |
| 3 | | PASS |
| 4 | | PASS |
| 5 | yes | PASS + canonical export |

Canonical workbook: `export/` (list CSVs + `run-5.xlsx` + `takeoff.json`).
Interrogation: `interrogation/run-5.json`.

## Validation — Takeoff UI

Same frozen truth. Compile via shared Session+ODL (`/__ot/compile-corpus-takeoff`).

| Run | Cold | Gates 1–5 |
|---|---|---|
| 1 | yes | PASS |
| 2 | | PASS |
| 3 | | PASS |
| 4 | | PASS |
| 5 | yes | PASS |

Evidence: `ui-runs/` (run-1…run-5.json + CHANGELOG.md). Totals: **122** rows (AI 43 / AO 15 / BI 49 / BO 15) every run.
