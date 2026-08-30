# T-HVAC-01 — NAVFAC full HVAC equipment takeoff

Status: `TRUTH BUILT`

## Set

`navfac-cherry-point-atc` — `raw/navfac-cherry-point-atc-mechanical.pdf` (75 sheets)

## Live prompt (frozen at validation start)

See `prompt.txt`.

## Scope (set-driven)

22 scheduled HVAC equipment families present and countable on this set
(Air Ops / MITRACON / ATCT): AHU, DOAH unit, DOAH handling, FCU, VAV,
air-cooled chiller, heat-recovery chiller, boiler, pump, fan, cabinet unit
heater, unit heater, CRAH, dehumidifier, humidifier, air separator,
expansion tank, CHW control valve, HHW control valve, GRD, range hood,
duct silencer — **396** unique scheduled tags. Exclusions (vibration
isolation, fan sound, points/DDC lists, general notes / piping construction)
are named in `truth.json` and must be defended in Gate 5 negative-space.

## Harness

- `truth.json` — item-level cites, ≥25% independent hand-count pass, Gate 4
  page map (75/75; 67 empty for HVAC schedules)
- `ground_truth_completed_before_model_runs: true`

## Gates

N=5 × Gates 1–5 per `../GOAL.md`. Canonical export = Run 5 only.
