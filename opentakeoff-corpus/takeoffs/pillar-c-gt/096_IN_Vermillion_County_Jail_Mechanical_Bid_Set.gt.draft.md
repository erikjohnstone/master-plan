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

## Still blocks lock

- Most DDC lists lack `served_equipment` — cannot invent unit maps
- qty×points refuse for 78 inventory units
- SOO refuse
- Estimator-complete / corpus-deep C open

## Status
`gt_locked: false` · `pillar_c_complete: false`
