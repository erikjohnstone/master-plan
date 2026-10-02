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

**Pending.** A full corpus eval at HEAD with the production environment, scorers run one after another, is
running (`scratchpad/evalab3/new.log`), followed by the same run at `302cf34` for A/B. This section is filled from that
run, not from the archive.

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

## Known limits (documented, not fixed)

- 095_UT: the RTU schedule shares a legend sheet beside a symbol legend; the takeoff reads nothing there. The
  empty state points the estimator to Count.
- 052_IL, 057_US: no equipment schedules in the set; empty takeoff is correct.

## Known failing tests (pre-existing, not from this goal's work)

- MCP `conformance.test.ts` "sheet graph (#87) … find_schedule": room 134's EAST finish no longer chains to its
  material-schedule definition (`SMOKEY MOUNTAIN AC-18` expected, undefined). Fails identically at the PR #108
  merge `4255465`, before any of this goal's commits.

## Sweep re-run (OOM-lost sets)

8 of 29 re-swept clean on 2026-10-02 (038_NC, 073_MT, 029_ME, 077_MT, 096_IN 235 lines, 13_MI, 087_US,
016_NY 24 lines / 10 schedules): no product problems. 21 crashed again (Chrome OOM, see rules) and are still
unverified.

## Active work / next queue

1. Corpus A/B (HEAD vs 302cf34, production env) → fill **Verified baseline**; investigate any regression.
2. ~~Browser proof of Review all + auto-opened plan~~ — 18/18 on itd-d1-lab (2026-10-02).
3. MCP `npm test` and `test:shared-path` (includes #246: reconcileWorkflow's stale expectations).
4. Re-sweep the 29 OOM-lost sets one at a time, machine otherwise idle.
5. Re-measure graph build in the app on 25_WA / klamath with the machine quiet (sweep's 454 s was contention).
