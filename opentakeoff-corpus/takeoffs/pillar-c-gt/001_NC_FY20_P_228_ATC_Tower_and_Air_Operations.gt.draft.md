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

## Still blocks lock (honest)

- FCU 42 × templates: **HONEST REFUSE** (no coil-type split)
- UH/CUH labeled estimate only: 11×6=66 (not merged into printed truth)
- SOO: **HONEST REFUSE**
- Printed BAS 122 is schedule-list floor — estimator-complete BAS (SOO/I/O/spare) open
- Pillar C requires every corpus BAS + valve set — one set cannot complete C

## Status
`gt_locked: false` · `pillar_c_complete: false`
