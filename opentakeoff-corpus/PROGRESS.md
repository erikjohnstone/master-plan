# Progress — current state

Rewritten 2026-10-02. The previous file (11,000 lines; baseline from 2026-08-29, last updated 2026-09-26, 156
commits behind) is kept verbatim in `PROGRESS-ARCHIVE-2026-09.md` for history. **Do not quote numbers from the
archive as current.** `STATE.md` (2026-09-13) is also stale; this file supersedes it.

## Measurement rules

- `source /root/.ot-env.sh` before any measurement. Without it the vectorgrid table extractor's Python is missing,
  the stage fails fast, and every table number is from a degraded engine (that happened to an A/B on 2026-10-02;
  it was discarded).
- A full corpus eval (`cd opentakeoff/mcp && npm run eval:corpus -- <corpus>`) reports takeoff, reference and
  graph metrics together; compare A/B on the same machine and environment, never against an old baseline.
- On this 16 GB container run the eval with `OPENTAKEOFF_EVAL_SERIAL=1`: the four scorers in parallel OOM-kill
  their own children (navfac read "ERROR: child process exited null" on 2026-10-02), which an A/B would misread as
  a code regression.
- One heavy job at a time on this container (eval, MCP test suite, browser sweep): any two together OOM-kill
  something, and a killed set or test reads as a failure. The 2026-10-02 sweep re-run lost 21 of 29 sets this way.
- Do not run browser sweeps beside a corpus eval on this 16 GB container: Chrome is OOM-killed (29 of 54 sweep
  sets were lost that way on 2026-10-01; those results were discarded, not counted).

## Verified baseline

A/B on 2026-10-02, same container and environment (ot-env, vectorgrid on, scorers run one after another, eval
concurrency 2): `9de1d7e` (new) against `302cf34` (base). Logs in the session scratchpad (`evalab3/`).

- **Takeoff + reference (`takeoff-eval --with-reference`):** identical on every keyed set. Exact-match rates:
  bessemer 70.0%, itd-d1-lab 78.4%, federal-mech 99.0%, navfac 95.4%, bldg5406 75.0%, baker-county-eoc 57.5%,
  itd-d1-lab-raster 100%. Most of the remaining deltas are untagged symbol counts on plans (baker R1/E1/S1...,
  bldg5406 CDB/RRA), which is the parked symbol-finding work; the estimator counts those with Count on plans.
- **Graph (`graph-eval`):** identical on every set that ran on both sides (rowsym 99.8%). Three sets have no
  comparison because a child process was OOM-killed: baker-county-eoc and 089_FL on new, 04_NV on base.
- **Table recall (`table-recall-eval`):** same 12 tables missed on both sides; new drops 3 junk tables base reported
  (12_MT#11 EDGE DETAIL, 031_MO#39 BOX HEADER ELEVATION / BORROW LITE SILL).
- **Tag recall (`tag-eval`):** not compared; it runs ~6 h per side on this container.
- Commits after `9de1d7e` (957a0bb reference-only titles, 0881cd7 one-unit captions) were measured by targeted
  censuses, not by this run.

## Current goal

Make the platform's current capabilities production-ready and keep improving them until the user says stop. Not
in scope: the export-to-estimating-software side; open-ended autonomous symbol finding (SYM-1..3 parked).

## What an estimator gets today (production path)

Upload → index → sheet graph (shared Session path, UI and MCP) → compile → Takeoff panel → Review → export.

- **Takeoff:** schedule rows read into lines with cites (schedule row, plan tag, symbol); reconcile against plan
  tags. Detail of the reader and reconcile rules: `TAKEOFF_BUG_CATALOGUE.md` (B-*, to 2026-09-19),
  `ASSEMBLIES_BUG_CATALOGUE.md` (AS-*), `CONTROL_INTENT_BUG_CATALOGUE.md` (CI-*).
- **Review (human in the loop):** per-schedule grid or **Review all**; confirm / flag / correct; **Check N tags**
  counts a tag-only line from its printed tags; **Count on plans** counts untagged units with the canvas Symbol or
  Count tool under a line-linked condition (live, follows its marks). Decisions bind to the evidence they were
  made on ("Changed since review"), persist with the project, survive import, and export as Estimator qty.
- **Units drawn on plans with no schedule row read** appear as review lines, counted only by the estimator.

## Landed in the production-platform goal (2026-10-01 →)

| Commit | What |
| --- | --- |
| e4bee84, 302cf34 | G5: air-terminal plans read as plans; Check N tags; GRD types no longer units (federal EA 128 → 105) |
| bb8a9b4 | Whole-flow sweep fixes (side-by-side split linework: 016_NY M-601 3 → 10 schedules; hash sheet names; import keeps reviews; hanger rows; plan-only units); Count on plans (G3) |
| e3479c8 | L3.5 topology opt-in: klamath graph 87 s → 36 s, graph otherwise identical |
| 32aab47 | Symbol-sweep panel fits the window (Commit was unreachable at 1440×900); G3 browser proof 14/14 |
| aed8849 | Review all; Count on plans opens the line's plan |
| b6d2590 | Import re-points plan counts with their conditions |
| 957a0bb | Reference-only / N.I.C. schedules read no units (16_NV 62 → 58 = key; WP1 test green) |
| 0881cd7 | One-unit schedule captioned as its unit (095_UT RTU AC-WW, 0 → 1; key re-keyed from render) |

## Known limits (documented, not fixed)

- 052_IL, 057_US: no equipment schedules in the set; empty takeoff is correct.

## Known failing tests (pre-existing, not from this goal's work)

- MCP `conformance.test.ts` "sheet graph (#87) … find_schedule": room 134's EAST finish no longer chains to its
  material-schedule definition (`SMOKEY MOUNTAIN AC-18` expected, undefined). Fails identically at the PR #108
  merge `4255465`, before any of this goal's commits.
- `corpusTakeoffWp1Acceptance` federal BAS (89 vs 26 expected) and 04_NV (19 vs 16): identical at 302cf34 and at
  `4255465`. 04_NV's three extra lines are LV-1/LV-2 (louvers) and WS-1 (water softener), read by family rules newer
  than the key; the key was not changed (rule: never edit a key to pass). 16_NV (62 vs 58) is fixed above.

## Sweep re-run (OOM-lost sets)

8 of 29 re-swept clean on 2026-10-02 (038_NC, 073_MT, 029_ME, 077_MT, 096_IN 235 lines, 13_MI, 087_US,
016_NY 24 lines / 10 schedules): no product problems. 21 crashed again (Chrome OOM, see rules) and are still
unverified.

## Stale compile keys (found 2026-10-02)

35 `takeoffs/cross-set-compile/*.compile.json` keys say 0 items with notes like "no extractable HVAC tables": they
were written from pipeline output, not from the drawings, and only the WP1 acceptance list is scored, so nothing
fails on them. 095_UT's was hiding a real reading failure (fixed in 0881cd7, re-keyed from the render). Of the
zero-key sets the browser sweep finished, the app reads units on 029_ME, 038_NC, 054_NV, 064_MT, 073_MT, 087_US,
08_ME and 100_OH; only 052_IL and 057_US read nothing, and both are correct. The rest were OOM-lost or never swept:
compile them in node (one at a time) and look at any that read 0.

## Active work / next queue

1. ~~Corpus A/B~~ done (above). Re-run graph-eval alone for baker-county-eoc and 089_FL (OOM-killed in the A/B); baker's
   graph build reached ~3.9 GB RSS, a risk in a browser tab.
2. ~~Browser proof of Review all + auto-opened plan~~ — 18/18 on itd-d1-lab (2026-10-02).
3. MCP `npm test` and `test:shared-path` (includes #246: reconcileWorkflow's stale expectations).
4. Re-sweep the 29 OOM-lost sets one at a time, machine otherwise idle.
5. Re-measure graph build in the app on 25_WA / klamath with the machine quiet (sweep's 454 s was contention).
