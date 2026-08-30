# T-BAS-01 — NAVFAC BAS / DDC points takeoff

Status: `TRUTH BUILT`

## Set

`navfac-cherry-point-atc` — `raw/navfac-cherry-point-atc-mechanical.pdf` (75 sheets)

## Live prompt (frozen at validation start)

See `prompt.txt`.

## Scope (set-driven)

Five extractable POINTS/DDC lists on #64 / #65 / #67 — **122** rows
(AI 43 / AO 15 / BI 49 / BO 15). Title-only schematic lists that do not
extract as typed rows are disclosed as non-extractable in `truth.json`
exclusions — not invented.

## Harness

- `truth.json` — list totals + item-level cites, ≥25% MARK hand-count pass,
  Gate 4 page map (75/75; 72 empty for BAS lists)
- `ground_truth_completed_before_model_runs: true`

## Gates

N=5 × Gates 1–5 per `../GOAL.md`. Canonical export = Run 5 only.
