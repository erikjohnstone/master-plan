# NAVFAC 001 Pillar C GT draft — UNLOCKED (not complete)

## Drawing-backed verify (2026-09-01) — still `gt_locked: false`

Source: demos/D10-bas-points-takeoff (PDF byte-identical to Vol2 001).

| Check | Result |
|---|---|
| D10 list/rollup totals | MATCH (122 · AI43 AO15 BI49 BO15 · alarm44 trend32) |
| Stratified POINTS sample | **25/25 PASS** (graph cell + `findText` mark + contiguous desc) |
| AI10 follow-up | MATCH (`AHU-T1A HW VALVE POSITION (FEEDBACK)` · alarm/trend No) |
| AHU-T1A/B named split | 24 / 24 / 14 MATCH |
| Missing unit POINTS lists | **6/6 HONEST REFUSE** (AHU-A1/A2/M1, DOAH-A1/A2/M1) |
| CV plan-text sample (12) | schedule±legend only · **0 plan hits** · SCHEDULE_ONLY ceiling OK |
| Served plan paint | DOAH-T1, AHU-T1A, AHU-T1B MATCH |
| Valve row counts | CHW 64 · HHW 99 |

Artifact: `/opt/cursor/artifacts/pillar-c-navfac-001-drawing-verify.json`

## Estimator product gap/SOO (2026-09-01) — still unlocked

| Check | Result |
|---|---|
| Printed BAS | 122 |
| Inventory units | 143 |
| Estimate_only pts | 965 (never merged into printed) |
| Gap count | 125 |
| Focus gap AHU-A/M + DOAH-A/M | **6/6 PASS** (on inventory, no POINTS title/served) |
| SOO | `absent_or_not_detected` match |

Artifact: `/opt/cursor/artifacts/pillar-c-001-estimator-gap-verify.json`

## Plan-paint census (2026-09-01) — still unlocked

| Check | Result |
|---|---|
| BAS served tags | 3 · **3 MATCH** / 0 ERROR |
| Valve reconcile | 163 items · **3 MATCH** / 160 SCHEDULE_ONLY |
| Status | `refuse_not_done` (CV plan paint mostly SO — honest) |

Artifacts: `pillar-c-001-bas-plan-paint-census.json` · `pillar-c-001-valve-plan-paint-census.json`

## Still blocks lock (Where we refuse — not done)

- FCU 42 × templates: **refuse_not_done** (no coil-type split)
- UH/CUH labeled estimate only: 11×6=66 (not merged into printed truth)
- SOO: **refuse_not_done**
- Printed BAS 122 is schedule-list floor — estimator-complete BAS (SOO/I/O/spare) open
- Pillar C requires every corpus BAS + valve set — one set cannot complete C

## Status
`gt_locked: false` · `pillar_c_complete: false` · `estimator_complete: false`
