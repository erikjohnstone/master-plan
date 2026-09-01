# Colville 027 Pillar C GT draft — UNLOCKED

## Drawing-backed verify — still `gt_locked: false`

| Check | Result |
|---|---|
| BAS rows vs key | 42 = 42 |
| POINTS sample | **25/25** (BS-1PNL = printed "BS-1 PNL") |
| Served paint | EP-4 MATCH; most others no schedule rows |
| Valves | none keyed |
| SOO | open / refuse |

Artifact: `/opt/cursor/artifacts/pillar-c-27-drawing-verify.json`

## Estimator product gap/SOO (2026-09-01) — still unlocked

| Check | Result |
|---|---|
| Printed BAS | 42 |
| Inventory units | 22 |
| Estimate_only pts | 71 (never merged) |
| Gap count | 8 |
| Gap verify (all) | **8/8 PASS** (FCU-1, BP-1, EF-1/2, HX-1A/1B/2A/2B) |
| SOO | `absent_or_not_detected` match |

Artifact: `/opt/cursor/artifacts/pillar-c-027-estimator-gap-verify.json`

## Still blocks lock (Where we refuse — not done)

- SOO refuse
- Inventory gap vs printed I/O LIST
- Estimator-complete + corpus-deep C remain

## Status
`gt_locked: false` · `pillar_c_complete: false` · `estimator_complete: false`
