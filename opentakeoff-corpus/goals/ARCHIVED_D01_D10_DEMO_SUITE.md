# Archived goal — D01–D10 HVAC/BAS demo suite

**Status:** COMPLETE (archived 2026-08-30)  
**Superseded by:** `/takeoff` full-corpus N=5 HVAC + BAS takeoff goal  
**Branch / PR at lock:** `cursor/d10-bas-points-takeoff-512f` (PR #33 lineage)

## Original objective (verbatim summary)

Ship and lock all 10 HVAC/BAS demos (D01–D10) under `opentakeoff-corpus/demos/GOAL.md`.
Coordinator-only; generalized production fixes only (no corpus hardcoding).
Per-demo advance required frozen prompt, N=5 API, stdio, UI proof with verified
in-thread follow-up, expandable source cards, and answer-first chat.

Final suite gate was amended (user direction) from live 50 API + 30 UI to a
durable regression suite:

1. Engine regressions D01–D10 (`demoDNN.regression.test.mjs`)
2. Frozen `golden/answer.json` verify (`npm run test:demos`, `--fast` default)
3. Optional UI smoke when UI wiring changes

## Completion evidence

- All ten demo CARDs `LOCKED`
- `npm run test:demos` green: engines 10/10 + goldens 10/10 (fast)
- Durable modules retained for later use: `takeoffWorkflow.js`, Zod
  `demoAnswerSchema` / `structuredRepair`, `verify-demo-suite.mjs`
- D10 UI video:
  `/opt/cursor/artifacts/d10_ui_prompt_answer_cards_followup_2026-08-30T17-02-51-387Z.webm`

## Why archived

The demo slate proved per-question agent usefulness. The next mission is a
**full quantity takeoff** (one HVAC + one BAS), N=5 gated including live
interrogation, with Run-5 CSV/Excel as the canonical deliverable in the
Takeoff UI — see `opentakeoff-corpus/takeoffs/GOAL.md`.
