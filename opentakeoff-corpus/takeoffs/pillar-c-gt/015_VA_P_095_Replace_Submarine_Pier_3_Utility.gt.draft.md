# Pier 015 Pillar C GT draft — UNLOCKED (not complete)

## Drawing-backed verify (2026-09-01) — still `gt_locked: false`

| Check | Result |
|---|---|
| BAS rows vs key | 39 = 39 MATCH |
| Stratified POINTS sample | **25/25 PASS** |
| Served plan paint MATCH | CCC-1, CCC-2, P-1, P-2, FC-3 |
| Served honest miss | MPAC-1..4, HPAC-1..3 (no equipment schedule rows) |
| CONTROL_DAMPER | 21 = key · sample honest (MD-11 MATCH via sweep on plan #6) |
| ISOLATION_VALVE | 15 = key · sample **8/8** MATCH with plan text |
| SOO | HONEST_REFUSE |

Artifact: `/opt/cursor/artifacts/pillar-c-pier-015-drawing-verify.json`

## Estimator product gap/SOO (2026-09-01) — still unlocked

| Check | Result |
|---|---|
| Printed BAS | 39 |
| Inventory units | 17 |
| Estimate_only pts | 71 (never merged) |
| Gap count | 14 |
| Gap verify (all) | **14/14 PASS** (FC-1/2/4, P-3..6, EF-1..7) |
| SOO | `absent_or_not_detected` match |

Artifact: `/opt/cursor/artifacts/pillar-c-015-estimator-gap-verify.json`

## Plan-paint census (2026-09-01) — still unlocked

| Check | Result |
|---|---|
| BAS served | 12 tags · **5 MATCH** / 7 ERROR (MPAC/HPAC miss) |
| Valve reconcile | 36 · **34 MATCH** / 2 SO |

Artifacts: `pillar-c-015-bas-plan-paint-census.json` · `pillar-c-015-valve-plan-paint-census.json`

## Still blocks lock (Where we refuse — not done)

- SOO refuse
- MPAC/HPAC no schedule rows — cannot invent joins
- Estimator-complete / full hand-count open
- Pillar C corpus-deep — one set cannot complete C

## Status
`gt_locked: false` · `pillar_c_complete: false` · `estimator_complete: false`
