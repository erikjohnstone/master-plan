# CHANGELOG — T-BAS-01

## 2026-08-30 — RESTORED LOCKED 122 (parity-preserving ODL)

**Cause:** `classifySheetRole` could label ATCT POINTS LIST sheets (e.g. mechanical `#64`)
as `legend` when note text hit `/LEGEND/` at the same confidence as weak `/SCHEDULE/`
hits. `enhanceTablesWithODL` only ran on `role === "schedule"`, so POINTS LIST /
DDC POINTS LIST tables were never recovered and `compile_corpus_takeoff` /
`bas_points` returned **0** lists.

**Rejected approach:** Prefer `\bPOINTS? LIST\b` / `\bDDC POINTS?\b` as `schedule`
at conf 0.86 in `web/src/lib/sheetgraph.ts`. That over-recovered Air Ops schematic
siblings and broke the locked **122**.

**Fix:** Keep role classification unchanged for those sheets. In
`mcp/src/session.ts` `enhanceTablesWithODL`, also ODL **legend/unknown** sheets
whose spans match locked titles only:
`^POINTS? LIST`, `^FCU WITH … DDC POINTS LIST$`, `^UNIT HEATER DDC POINTS LIST$`.

**Effect:** Restores **5 lists / 122** (AI 43 / AO 15 / BI 49 / BO 15). Status →
`LOCKED` again. Broader ATCT/Air Ops DDC lists stay out until a justified truth
refresh + N=5 restart.

---

## 2026-08-30 — REGRESSED (superseded)

Interim note while the broad role flip was under test — see RESTORED entry above.

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
