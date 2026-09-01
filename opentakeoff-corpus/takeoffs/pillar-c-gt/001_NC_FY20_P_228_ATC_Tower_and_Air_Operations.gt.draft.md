# NAVFAC 001 Pillar C probe — PARTIAL (not done)

## Printed BAS
- rows 122; AI/AO/BI/BO 43/15/49/15
- alarm 44 / trend 32
- lists: POINTS LIST DOAH-TI (34) served=['DOAH-T1']; POINTS LIST AHU-T1A/TIB (62) served=['AHU-T1B', 'AHU-T1A']; FCU WITH COOLING COILS DDC POINTS LIST (9) served=[]; FCU WITH HEATING AND COOLING COILS DDC POINTS LIST (11) served=[]; UNIT HEATER DDC POINTS LIST (6) served=[]

## SOO
**HONEST REFUSE** — No extractable SOO tables; narrative not a points source

## Labeled estimate (not printed truth)
- UH+CUH qty 11 × template 6 = **66** (gap +60)
- FCU: HONEST_REFUSE — cooling vs heat/cool split not in compile

## Valves (reconcile evaluationFast — measured, not key-locked yet)
- CHW: {"name": "CHW_CONTROL_VALVE", "rows": 64, "summary": {"total": 64, "match": 60, "schedule_only": 4, "plan_only": 0, "refused_no_scale": 0, "refused_no_text": 0, "ambiguous": 0}}
- HHW: {"name": "HHW_CONTROL_VALVE", "rows": 103, "summary": {"total": 103, "match": 98, "schedule_only": 5, "plan_only": 0, "refused_no_scale": 0, "refused_no_text": 0, "ambiguous": 0}}
- Note: HHW reconcile rows 103 vs compile key 99 — investigate before locking GT (do not weaken key)

## Plan paint
served_equipment MATCH: DOAH-T1, AHU-T1A, AHU-T1B

## Open before lock
- Pipeline GT test asserting this harness
- FCU coil-type split or permanent refuse documented in key
- Confirm DOAH units beyond T1 (inventory DOAH) vs single printed list
- Valve SCHEDULE_ONLY vs MATCH counts coordinator-verified on drawings

## Status
**NOT COMPLETE** — `gt_locked: false`. Pillar C set not done.
