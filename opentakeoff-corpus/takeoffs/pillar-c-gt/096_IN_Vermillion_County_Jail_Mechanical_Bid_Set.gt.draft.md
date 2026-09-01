# Vermillion 096 Pillar C GT draft — UNLOCKED (not complete)

## Drawing-backed verify (2026-09-01) — still `gt_locked: false`

| Check | Result |
|---|---|
| BAS rows vs key | 231 = 231 MATCH |
| Stratified POINTS sample | **25/25 PASS** (10 generic SCHEDULE OF DDC POINTS lists) |
| Served plan paint | **HRC-1 MATCH** only |
| Inventory without POINTS joins | **78** units (AHU/FCU/VAV/FAN…) → qty×points **HONEST_REFUSE** |
| CONTROL_DAMPER | 24 = key · sample **10/10** honest |
| SOO | HONEST_REFUSE |

Artifact: `/opt/cursor/artifacts/pillar-c-vermillion-096-drawing-verify.json`

## Estimator product gap/SOO (2026-09-01) — still unlocked

| Check | Result |
|---|---|
| Printed BAS | 231 |
| Inventory units | 92 |
| Estimate_only pts | 437 (never merged) |
| Gap count | 74 |
| Gap sample verify | **60/60 PASS** (product returns first 60 of 74 tags) |
| SOO | `absent_or_not_detected` match |

Artifact: `/opt/cursor/artifacts/pillar-c-096-estimator-gap-verify.json`

## Plan-paint census (2026-09-01) — still unlocked

| Check | Result |
|---|---|
| BAS served | 1 tag · **1 MATCH** (HRC-1 only) |
| Valve reconcile | 24 · **12 MATCH** / 12 SO |

Artifacts: `pillar-c-096-bas-plan-paint-census.json` · `pillar-c-096-valve-plan-paint-census.json`

## Still blocks lock (Where we refuse — not done)

- Most DDC lists lack `served_equipment` — cannot invent unit maps
- qty×points / inventory gap refuse for remaining units
- SOO refuse
- Estimator-complete / corpus-deep C open

## Status
`gt_locked: false` · `pillar_c_complete: false` · `estimator_complete: false`
