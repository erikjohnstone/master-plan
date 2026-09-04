# Goal loops — final, pasteable

Two agents, two loops, no shared files. Both use the 7-set eval as a regression
guard; neither may touch the answer keys. The program ends when both DONE
blocks are measured true and a document added after the last fix passes
without a code change.

Ground truth about the scoreboard, so neither loop chases a ghost: the only
Aug-29 eval artefact in this repo reads **78.4%**; today's committed result is
**94.8%** takeoff. GOAL.md §3's "100%" cites a commit not in this history.
Baselines below are the measured ones.

---

## LOOP A — Codex: compiler, agent contract, export

```
GOAL LOOP A — make "complete takeoff" mean a takeoff

REPO      erikjohnstone/master-plan
BRANCH    branch FROM add-gmft-fallback-c. Own branch. No PR unless asked.
          Small commits, one bug class each.

════ SETUP (first 10 minutes) ══════════════════════════════════════════
  ./scripts/stage-bulk-corpus.sh
     → downloads the 81-document bulk corpus (public Google Drive, ~1.7GB)
       into opentakeoff-corpus/bulk/. Needs egress to drive.google.com.
       If it fails on egress: SAY SO and continue — the graph fixtures
       below still give you corpus-wide coverage.
  cd opentakeoff/mcp && npm install && cd ../web && npm install
  java -version   (ODL needs it; tell the user if absent)

════ WHAT YOU OWN ══════════════════════════════════════════════════════
  opentakeoff/web/src/lib/corpusTakeoff.mjs            the compiler
  opentakeoff/web/src/lib/agentLoop.js                 the agent's takeoff contract
  opentakeoff/web/src/lib/agentTools.js, agentTakeoff.js, takeoffWorkflow.js
  opentakeoff/web/src/lib/schedulePlanReconcile.mjs
  export (CSV/XLSX), takeoff unit tests + fixtures
  opentakeoff/mcp/src/tools.ts — ONLY compile_corpus_takeoff and
                                 reconcile_schedule_plan tool definitions
  opentakeoff-corpus/TAKEOFF_BUG_CATALOGUE.md — append only

════ WHAT YOU NEVER TOUCH ══════════════════════════════════════════════
  web/src/lib/sheetgraph.ts, mcp/src/session.ts, vectorTakeoffPipeline.ts,
  scheduleGridFallback.ts, pillarGapRecovery.ts, scheduleTableSidecarAdapter.ts,
  symbolsweep.ts — the extraction layer, owned by the other loop
  opentakeoff-corpus/keys/**        ← answer keys. READ-ONLY. ALWAYS.
  opentakeoff-corpus/sets.json
  opentakeoff-corpus/graphs/**      ← pipeline output, never "corrected"
  A root cause in any of those → catalogue it with evidence and STOP on it.

════ THE PROBLEM ═══════════════════════════════════════════════════════
  Three different ideas of "quantity"; the user gets the weakest:
   - mcp/src/takeoff.ts (the scored pipeline): quantity = drawn instances
     counted on plan sheets ("a schedule lists TYPES, not installed qty")
   - corpusTakeoff.mjs (what the UI agent calls): one item per schedule row,
     quantity: 1 HARDCODED at lines 824, 2015, 2521
   - a printed QTY column: read by nothing (QTY/QUANTITY occurs only in a
     header-label regex ~line 1905 that SKIPS rows)
  agentLoop.js ~line 1952 tells the agent: call compile_corpus_takeoff and
  "copy its totals into the answer." So "do a complete HVAC takeoff" returns
  a count of distinct schedule rows labelled as a takeoff.
  Measured: 23 real duct silencers (QTY column [2,1,1,1,1,1,2,1,1,1,1,2,2,2,2,2])
  reported as 2, and the two "items" were keyed "1" and "2" — the quantity
  values — because the table has no MARK column and the compiler keys on
  column 0. Also: kind "sequences" throws on every document.

════ MEASURE ═══════════════════════════════════════════════════════════
  A. CORRECTNESS — 7 sets with hand-verified ground truth (541 tags):
       cd opentakeoff/mcp
       node --import tsx scripts/corpus-eval.mjs ../../opentakeoff-corpus --report
     Reproduce this before changing anything (HEAD, 2026-09-04):
       set                       tags  exact   Σ|Δqty| missing false-add
       bessemer                    10  100.0%     0       0       0
       itd-d1-lab                 116   91.4%    30       2       6
       federal-mech               102   92.2%     8       8       2
       navfac-cherry-point-atc    217   97.2%    11       0      21
       bldg5406-hvac-demo          28  100.0%     0       0       0
       baker-county-eoc            40   90.0%     0       4       0
       itd-d1-lab-raster           28  100.0%     0       0       0  (vacuous)
       CORPUS                     541   94.8%    49      14      29
     Reference cells are the extraction loop's problem; note them, don't chase.
     If YOUR numbers differ from this table, say so and stop.
  B. BREADTH — all 90 documents, bug signatures, NO ground truth:
       node --import tsx scripts/takeoff-census.mjs \
          ../../opentakeoff-corpus/graphs /tmp/census --from-graphs
     (or, if bulk/ staged:  scripts/takeoff-census.mjs <list.txt> /tmp/census --pages 8)
     Read /tmp/census/findings.json. Compiler-side signatures you own:
       P1_ALL_QTY_1  · COMPILE_THREW(sequences) · P2_NUMERIC_TAG · JUNK_TAG
       PROSE_AS_TAG  · UNGROUNDED_ITEM · SCHEDULES_BUT_NO_ITEMS
       DUP_TAG_ACROSS_CATEGORIES · DUP_TAG_WITHIN_CATEGORY · COUNT_ITEMS_MISMATCH
     Extraction-side (PROSE_AS_TITLE, NO_TABLES_AT_ALL, DOCUMENT_FAILED):
     catalogue for the other loop, do not silence.
     A detector going quiet means the SIGNATURE is gone, not that the takeoff
     is correct. Only A proves correct. Always report A and B separately.
  C. npm test && npm run test:takeoffs

════ THE LOOP ══════════════════════════════════════════════════════════
  measure A+B+C → pick ONE queue item → write the failing unit test against a
  fixture FIRST (mcp/scripts/make-*-fixture.mjs) → fix structurally → re-run
  A+B+C: every set ≥ baseline, zero new missing, zero new false-adds, target
  signature gone across all 90 → append catalogue entry (root cause, evidence,
  what every number did) → commit → repeat

════ THE QUEUE ═════════════════════════════════════════════════════════
  Q1  WIRE "sequences". compileCorpusTakeoff (~2551) dispatches
      hvac_equipment / bas_points / control_valves and throws on the rest.
      ~2669 already renders takeoff.kind === "sequences" to CSV;
      web/src/lib/sequenceExtract.ts already extracts. AUDIT FIRST — the
      compiler may already exist under another name. Dispatch "sequences" and
      "T-SOO-01". SOO-implied points stay refuse_not_done; never invent.
  Q2  ONE QUANTITY MODEL. Every emitted line carries:
        scheduled_qty  from the row's QTY/QUANTITY/NO./COUNT column resolved
                       BY HEADER IDENTITY, never position; default 1 only
                       when no such column exists; column present but cell
                       unparseable → refuse the line and disclose
        installed_qty  from whole-set reconcile (schedulePlanReconcile +
                       sweep_schedule_row); null when unswept; never inferred
        status         MATCH / SCHEDULE_ONLY / PLAN_ONLY / REFUSED_* / AMBIGUOUS
        citations      schedule-cell bbox AND every plan-instance bbox
      agentLoop.js "complete takeoff" contract becomes compile → whole-set
      reconcile → report all three. Delete "copy its totals into the answer."
      Export carries all three columns.
  Q3  IDENTIFIER, NOT COLUMN 0. Row identity = the high-cardinality,
      tag-shaped column; a low-cardinality small-integer column is a count.
      No identifier column at all (the silencer case) → no dedupe by tag:
      one line per physical row carrying its quantity. 16 rows → 16 lines
      totalling 23, not 2.
  Q4  EXCLUSION DISCLOSURE on every valve/damper/actuator and BAS output:
      (a) no architectural sheets in the set → fire/smoke damper count at
      risk; (b) drawings-only, no specifications book → valve type,
      commissioning, points-in-spec at risk. Silence is a false "complete."
      (opentakeoff-corpus/takeoffs/HVAC_BAS_DOMAIN_MAP.md, "Architectural
      implications")
  Q5  Compiler-side items from the eval's own mismatch lists, starting with
      navfac's 21 false-adds at qty 51/52 (CD-*, RG-*, EG-*).
  Q6  Whatever B surfaces next, compiler-side, largest document count first.

════ DONE ══════════════════════════════════════════════════════════════
  A: CORPUS 541/541 · Σ|Δqty| 0 · missing 0 · false-add 0, with installed_qty
     coming from reconcile on every set, not from a row count
  B: every compiler-side detector silent across all 90 documents
  C: green
  AND sequences compiles on every document that carries SOO text
  AND every catalogue entry has a structural root cause written down
  NOT done at "the number went up."

════ LAWS (GOAL.md "Platform mandate") ═════════════════════════════════
  L1  Regex never classifies — structure does. Regex may CONFIRM.
  L2  The corpus is the proving ground, not the finish line. A fix that only
      works because it recognizes a PDF, tag, sheet number or corpus id is a
      REGRESSION even if the score rises.
  L3  Audit before you build. Large, mature codebase — search first.
  L4  Never invent a quantity, tag or location. Refuse and disclose.

════ ANTI-GAMING — the keys are editable text files. Read twice. ═══════
  NEVER edit, extend, narrow or "correct" anything under keys/ or graphs/.
    A key that looks wrong → STOP, write it up, do not touch it.
  NEVER move a failure out of scope so it falls off the report.
  NEVER skip, disable, xfail or delete a test.
  NEVER special-case a document, tag or sheet.
  An improvement you cannot explain structurally is a bug you haven't found.
    Revert it.
  A true 96% you can explain beats a claimed 100% you can't.

════ BLOCKED ═══════════════════════════════════════════════════════════
  Root cause in a file you don't own · a key that looks wrong · a failure you
  can't reproduce → catalogue with evidence → next queue item. Never stall.
  Never reach across the boundary to unblock yourself.
```

---

## LOOP B — Claude: extraction, recall, ground truth, end-to-end

```
GOAL LOOP B — find every table, prove it, make the product run it

WHERE     the cloud box that holds opentakeoff-corpus/bulk/ (re-stageable
          from public Drive via scripts/stage-bulk-corpus.sh). 4 cores,
          ~2GB per-process memory ceiling — the cgroup OOM-kills above it.

════ WHAT I OWN ════════════════════════════════════════════════════════
  web/src/lib/sheetgraph.ts, mcp/src/session.ts, vectorTakeoffPipeline.ts
  and every L2 module, symbolsweep.ts, mcp/scripts/takeoff-census.mjs,
  corpus-regression-sweep.mjs, corpus-sweep-diff.mjs, corpus-eval scripts,
  ALL keys/ authoring, opentakeoff-corpus/graphs/ (regenerated, committed),
  Playwright end-to-end, GOAL.md, PRODUCTION_AUDIT.md, TAKEOFF_BUG_CATALOGUE.md
════ WHAT I NEVER TOUCH ════════════════════════════════════════════════
  corpusTakeoff.mjs, agentLoop.js, agentTools.js, agentTakeoff.js,
  takeoffWorkflow.js, schedulePlanReconcile.mjs, export — Loop A's.
  A compiler change extraction needs → catalogue it for Loop A.

════ MEASURE — three instruments, none substitutes for another ═════════
  1  corpus-eval on the 7 sets → REGRESSION GUARD (it cannot see recall,
     QTY, or sequences; it is not the goal)
  2  takeoff census over all 90 → bug SIGNATURES at breadth (proves nothing
     correct; finds what ground truth would have)
  3  recall-tier keys (title list per sheet, authored from RENDERS) → the
     only instrument that measures "did we find every table"

════ THE LOOP ══════════════════════════════════════════════════════════
  measure 1+2+3 → pick the failure affecting the MOST documents whose root
  cause I can state in one sentence → fix structurally (cardinality for an
  identifier, band-fill for a title, column population for a data row, ruled
  geometry for a grid; regex confirms only) → verify ALL of:
    corpus-eval ≥ baseline on EVERY set (takeoff AND reference)
    52-document regression sweep (documents I've iterated against)
    50-document held-out sweep (never used to find/tune the fix — a LOST
      table here means the fix failed the mandate)
    web + mcp unit suites green
    ONE heavy job at a time, never two
  → regenerate graphs/ if extraction output changed → catalogue → commit
  → repeat

════ THE QUEUE ═════════════════════════════════════════════════════════
  B0  RE-ESTABLISH TRUTH.
      - unit suites green at HEAD (currently UNKNOWN: web timed out under
        load, mcp was killed)
      - itd-d1-lab reference cells: 41.2% pre-today → 11.8% at HEAD. Only
        extraction commit between: rule 18 (e256975). Root-cause; if mine,
        fix or revert before anything else.
      - bisect running: root commit checked first; the "100%" has no
        committed artefact (Aug-29 report reads 78.4%), so the target is
        "best measured," not a ghost
  B1  THE 11 ZERO-TABLE DOCUMENTS (21% of 52 swept): vector pages with
      SCHEDULE printed 1-9 times returning nothing. Root-cause each against
      the render. Biggest recall lever. Author its recall key as I go.
      (010_US, 013_MO, 029_ME, 034_NC, 046_MI, 048_NY, 052_IL, 054_NV,
       056_NY, 08_ME, 19_CA)
  B2  PAGE TRIAGE. Every page gets a role (schedule / plan / controls /
      legend / notes / raster). Page-scoring vocabulary: SCHEDULE, POINTS
      LIST, SEQUENCE OF OPERATION, I/O, DDC, VALVE, DAMPER, CONTROL DIAGRAM
      — the current SCHEDULE-only scorer found 3 points lists and 0 SOO
      tables in 51 documents. Re-census. Map where BAS/valve content lives.
  B3  RECALL-TIER GROUND TRUTH for all 90: what tables are on each sheet,
      from the render, scope written BEFORE running the pipeline on that
      sheet. Never edited to pass.
  B4  STRUCTURE. Identifier by cardinality (8.0% of 2,158 row keys are a
      count column); header tiers by geometry (the itd SUPPLY/GENERAL/
      SNORKEL tier); titles by band-fill (29% real vs 89-113% prose,
      measured); outline markers by column population, replacing the regex
      I shipped. Cell-tier keys on ≥30 tables across ≥20 documents.
  B5  RULED-GRID PRIMARY where rules exist (its gate was silently off for
      every right-to-left segment until today). Measure with the census.
  B6  VALVE / BAS / SOO extraction sources the domain map marks "not yet
      built": riser valve instances, control-schematic point↔device,
      embedded coil corroboration. Keys on ≥10 documents each.
  B7  END-TO-END THROUGH THE PRODUCT. The UI agent has never run a real
      takeoff (every run passed empty kinds). Cerebras key works. ≥10 real
      documents through the actual agent + actual LLM: complete HVAC / valve
      / points / sequences. Playwright asserts panel, export, and UI == CLI.
  B8  WHOLE-SET SWEEP COST. sweep_schedule_row × 300+ tags per document is
      unmeasured; Loop A's Q2 depends on it. Budget, cache, or stream it so
      the 162-page set completes.
  B9  OPERABILITY. One-job scheduler; per-document memory/time budgets;
      incremental writes everywhere; zero orphaned processes.

════ DONE ══════════════════════════════════════════════════════════════
  recall keys for all 90 · ≥99% of keyed tables found, the rest disclosed by
  name · cell-tier sample 100% · count-as-key 0% · census silent across 90 ·
  held-out sweep shows no LOST table · ≥10 documents pass UI == CLI ·
  corpus-eval 541/541 as guard, reference cells 100% on every keyed set ·
  suites green · a document added AFTER the last fix turns up nothing the
  fixes don't already handle

════ LAWS  ═════════════════════════════════════════════════════════════
  the same four. Keys are read-only except when AUTHORED from a render with
  scope written down before the pipeline runs on that sheet.

════ NEVER ═════════════════════════════════════════════════════════════
  edit a key to pass · narrow scope · skip a test · run two heavy jobs ·
  leave a process orphaned · ship a tuned constant without its measured
  margin · report "detectors silent" as "verified" · spend a day on
  infrastructure while zero takeoffs ran · claim a number the run hasn't
  finished producing

════ BLOCKED ═══════════════════════════════════════════════════════════
  catalogue with evidence → next queue item → never stall
```
