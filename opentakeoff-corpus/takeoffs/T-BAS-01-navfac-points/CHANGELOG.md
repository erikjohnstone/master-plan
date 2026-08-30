# CHANGELOG — T-BAS-01

## 2026-08-30 — REGRESSED (truth refresh required)

**Cause:** `classifySheetRole` could label ATCT POINTS LIST sheets (e.g. mechanical `#64`)
as `legend` when note text hit `/LEGEND/` at the same confidence as weak `/SCHEDULE/`
hits. `enhanceTablesWithODL` only runs on `role === "schedule"`, so POINTS LIST /
DDC POINTS LIST tables were never recovered and `compile_corpus_takeoff` /
`bas_points` returned **0** lists.

**Fix:** Prefer `POINTS? LIST` / `DDC POINTS?` as `schedule` at conf 0.86
in `web/src/lib/sheetgraph.ts`.

**Effect:** Locked **122** (5 lists) was the extractable set under incomplete ODL
coverage. With the role fix, Session+ODL recovers additional real typed DDC /
POINTS lists (Air Ops / ATCT siblings). Overall row totals rise above 122.
Per GOAL.md non-negotiable #2, truth is **not** silently edited to match — status
moves to `REGRESSED` until a justified truth refresh + N=5 restart.

---

# CHANGELOG — T-BAS-01 harness

## 2026-08-30 — TRUTH BUILT (pre-run)

- Full item-level `truth.json` for five extractable POINTS/DDC lists
  (#64/#65/#67): 122 rows / AI 43 / AO 15 / BI 49 / BO 15.
- ≥25% MARK sample independently re-looked-up — reconciliation **pass**.
- Gate 4 page map: 75/75 sheets accounted; 72 empty for BAS lists.
- Title-only schematic lists disclosed non-extractable in exclusions.
- Status → `TRUTH BUILT`. Eligible for VALIDATING (prompt frozen at run 1).

## 2026-08-30 — initial draft truth

- Ported category quantities from independently authored
  `demos/D10-bas-points-takeoff/truth.json` (hand-derived before D10 model runs).
- Expanded to full-takeoff harness in TRUTH BUILT entry above.
