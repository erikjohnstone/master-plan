# Assemblies bug catalogue

Append-only log for GOAL LOOP S (`goals/ASSEMBLIES.md`). Each entry records a
defect, blocker or open question found while working the queue, with its root
cause (or why it is not known yet), the evidence, the numbers, and what
happened next. Entries are never rewritten; a later finding is a new entry
that points back to the earlier one.

Numbering is `AS-<n>`. Status is one of **OPEN**, **BLOCKED (owner)**,
**FIXED (commit)** or **NOT A BUG**.

---

## AS-1 — the regression guard is red at HEAD before this goal touches anything (BLOCKED — owned by other loops)

**Found:** 2026-09-23, SETUP, on `claude/affectionate-darwin-316fwo` at
`71fb4b9` (= `origin/main` `5ab7ca8` plus the goal documents only; no code
change).

**What:** SETUP says "if either is red at HEAD, STOP and report." HEAD is red
in files this goal must never touch, so the goal's own BLOCKED rule applies
instead ("root cause in a file you don't own → catalogue with evidence → next
queue item. Never stall"). The guard for this goal is therefore **no new
failure relative to the list below**, and every run reports the full list.

**Evidence:** see the PROGRESS.md entry "Active work: assemblies" for the
exact failing test names, the commands and the log locations. The web
failures are:
- `test/sheetgraph.test.ts:947`: multi-building qualified ROW keys resolve
  (expected `resolved`, got `unresolved`);
- `test/tableRecallGaps.test.ts` B-11: DATA DEVICE SCHEDULE missing;
- `test/tableRecallGaps.test.ts` B-12: AIR COOLED CONDENSING UNIT SCHEDULE
  missing.

The mcp failures are listed in PROGRESS.md. `TAKEOFF_BUG_CATALOGUE.md` B-44,
B-45 and B-46 already trace most of the known mcp failures (D04, D05, D09,
T-HVAC-01, T-VALVE-01, WP1) to two table-extraction root causes in
`sheetgraph.ts`, which the tag/table loops own.

**Next:** none in this goal. They belong to the owning loops.

---

## AS-2 — only 23 of the 121 registered corpus sets are present in this environment (BLOCKED — environment)

**Found:** 2026-09-23, WP0.1.

**What:** the bulk corpus (`opentakeoff-corpus/bulk/`, ~98 sets) is staged by
`scripts/stage-bulk-corpus.sh` from two Google Drive zips (552 MB and 1.1 GB).
This environment's egress proxy blocks `drive.google.com` and
`drive.usercontent.google.com`. The Drive connector cannot carry them either:
it returns file content as base64 inside the conversation, which is not
workable at that size.

**Effect:** WP0.1 measures the 23 present sets (22 distinct documents: one is
a byte-identical duplicate, and one is a synthetic raster of another, which
is excluded from keys). WP0.2 draws dev and held-out from those. The census
reports every absent set by id, never guesses at one. The goal's "2026-09-23
snapshot" figures (74/116 projects) came from committed compile snapshots,
not a live run, and stay the only cross-corpus numbers until the bulk corpus
can be staged.

**Unblock:** the user adds those two hosts under the environment's network
access; then `./scripts/stage-bulk-corpus.sh` and re-run WP0.1. The WP0.2
split stays frozen (held-out must not change after normalizer code exists);
extra documents join as a second held-out tier.

---

## AS-3 — HIT column H (`CoilDP`) meaning is unconfirmed (BLOCKED — Siemens HIT owners, goal INPUT 2)

**Found:** 2026-09-23 (plan §5; re-verified in WP0.4 from the committed
workbook).

**Evidence:** `Valve_Size_Template_US_Global.xlsx` defines `CoilDP` =
`ValveTable!$H$4` (header "Consumer Δp", unit row `psi`) and `BranchDP` =
`ValveTable!$I$4`. The consumer is the coil; the export had been writing the
valve's own (GPM/Cv)², a different quantity.

**What happened:** WP0.4 leaves column H blank and reports the valve's own
Δp as "valve Δp (derived)" in the notes and on each row's `_derived`. WP7
fills H from coil WPD (ft × 0.433 → psi) once the HIT owners confirm what
CoilDP expects.

---

## AS-4 — HIT Tolerance list values are stored as text; the fill writes numbers (OPEN — question for the HIT owners)

**Found:** 2026-09-23, WP0.4.

**Evidence:** `ValveTable!J6:J1048576` is list-validated (an x14
`dataValidation`) against `Constants!$F$2:$F$6`. Those five cells are
shared-string TEXT (`t="s"`: "10", "20", "30", "40", "50"). The template
fill (`valveSizeTemplate.ts` `cellXml`) writes a numeric Tolerance as a
number cell (`<x:v>20</x:v>`).

**Effect today:** none. Tolerance is blank unless a caller passes
`toleranceOverridePct`, and no caller does. WP0.4 restricts any passed value
to {10, 20, 30, 40, 50}.

**Open question:** whether Excel's list validation and the HIT importer
accept a numeric 20 where the list holds the text "20". This needs a check
in Excel, or an answer from the HIT owners, before WP7 writes Tolerance at
all. Do not guess.

---

## AS-5 — Desigo Select has no documented import format (BLOCKED — Siemens Desigo Select owners, goal INPUT 3)

**Found:** 2026-09-23 (research 03 §3).

**What:** Desigo Select takes counts per building part and floor, I/O per
cabinet, and license points, but no public import format is documented.
WP7 therefore produces a hand-entry worksheet (`desigo_select_worksheet.csv`),
per D9. If the owners supply an import format, an adapter replaces the
worksheet.

---

## AS-6 — a test worker cannot exit when two VectorGrid sidecars outlive `shutdownVectorGrid()` (OPEN — owned by the table-engine loop; worked around per run)

**Found:** 2026-09-23, SETUP guard run (`mcp npm test`).

**What:** `conformance.test.ts` finished all 20 of its tests (results
printed, the last one "detect_rooms assign mode" at 75 s). Its worker
process (pid 7915) then stayed alive for over 10 minutes with its CPU time
frozen at 4:50, in `ep_poll`. It had two VectorGrid sidecar children
(`.venv-sidecar/bin/python sidecar/tables.py`, pids 8368/8369, both started
18:43:45), each idle in `unix_stream_data_wait` on stdin. The npm test run
could not finish until the worker exited.

**Root cause (partly confirmed):** `vectorGridClient.ts` tracks ONE
module-level `proc`, and the test's `after(shutdownVectorGrid)` shuts down
only that one. Two live sidecars with the same parent means a second
`proc` existed that no `after` hook reached: either a second module
instance, or a respawn while the first was still running. Neither child is
`unref`'d, so their stdio handles keep the worker's event loop alive. Not
confirmed which of the two it is. The fix belongs in `vectorGridClient.ts`
(which this goal must not touch), e.g. `unref` the child and its stdio, or
track every spawned child.

**Workaround used (changes no result):** once every test in the file had
reported, the two idle sidecars were sent SIGTERM; the worker then exited
and npm test completed. The evidence is saved as
`wedge-evidence-conformance.txt` beside the guard logs. The same watchdog
pattern wraps `export-valve-size-template.mjs` runs: the script writes
`report.json`, then its sidecars are stopped.

**Again at the GATE 5 guard (2026-09-24):** the same hang, with the worker
idle and two idle sidecars. This time the session's permission check refused
a signal to the two sidecar PIDs. The run ended when the guard's own
background task was stopped: the sidecars went with it, the worker's event
loop drained, and the runner printed its summary. It reported the file-level
"Promise resolution is still pending but the event loop has already
resolved" as cancelled, and the two known AS-1 failures among its 20 tests.
No other result changed. The per-run workaround now needs either that
permission or the owning loop's fix.

---

## AS-7 — GATE 0's dev size is out of reach in this environment (BLOCKED — AS-2; ceiling demonstrated)

**Found:** 2026-09-23, WP0.2 (`reports/assemblies/01-split.md`).

**Numbers:** 17 of the 22 distinct present documents carry at least one
compiled row in a keyed equipment family. Seed 20260923, committed before the
census finished, put the drafter groups in the order `imeg` (kept in dev for
HX) → `up-engineers-architects` → `usda-ars-southeast-area` →
`coffman-engineers` → `crockett-engineering` → `burns-mcdonnell` (2 documents).
Held-out reached 4 and then 6, so dev has **11** documents (target ≥ 12). Even
keying every claimed table in them, the compile claims **245** rows (target
≥ 300 instances).

**Not done:** redrawing, reordering, or splitting a drafter group to reach 12.
Each would pick the split by its outcome.

**Next:** keys are authored at the maximum this population allows (see
01-split.md, "Key-authoring scope"). With the bulk corpus staged (AS-2), the
extra documents extend dev and add a second held-out tier; the frozen held-out
documents never move to dev.

---

## AS-8 — the compile misses printed keyed-family schedules (OPEN — owned by the table/compile loops)

**Found:** 2026-09-23, WP0.3, while keying the dev documents from renders
(census `reports/assemblies/00-baseline.json`, commit 63ad081).

**What:** these printed schedules belong to a keyed family, but
`compile_corpus_takeoff` claims none of them in any keyed family. WP0.3 keys
every *claimed* table (01-split.md), so their rows are in no key and no census
count. An assembly built from the compile cannot count them, and a join that
needs them (an AHU's fans and coils) has nothing to join.

**Evidence** (printed titles and rows as read from renders; page = PDF page):

| Set | Page | Printed schedule | Rows | Would be |
|---|---|---|---|---|
| 040 | 47 (M600) | AIR HANDLING UNIT SCHEDULE (vertical, left column) | AHU-1B | AHU |
| 040 | 47 | SPLIT SYSTEM AIR CONDITIONING UNIT SCHEDULE | SS-1 / SSCU-1 | FCU + CONDENSING_UNIT |
| 040 | 47 | UNFIRED CLEAN STEAM GENERATOR SCHEDULE | HX-1 | the humidifiers' steam source |
| 040 | 47 | CONDENSATE PUMP TRAP PACKAGED SCHEDULE | PT-1 | PUMP |
| 12_MT | 28 (M0.1) | SPLIT SYSTEM HEAT PUMP SCHEDULE | HP-1, HP-2 and FC-1A to FC-4B | HEAT_PUMP + FCU |
| 031 | 72 (M-501) | SINGLE DUCT AIR TERMINAL UNIT SCHEDULE, with its AIR TERMINAL UNIT SIZING SCHEDULE | the terminal units the reheat coils RHC1-RHC13 sit in (1-1-TU01 to 2-1-TU13) | VAV (the set has no VAV claim at all) |
| 031 | 71 (M-500) | CLEAN STEAM GENERATOR SCHEDULE | 1 row: STEAM-STEAM, HUMIDIFICATION, 79.2 LBS/HR produced (the claimed humidifier WHSE-SH1's flow) | the humidifier's steam source |
| 094 | 8 | Disposable Cylinder Electric Humidifier Schedule | HF-4, HF-5, HF-6, HF-8 (50/50/33/50 lb/hr, 17/17/11.4/17 kW, 480/3) | HUMIDIFIER |
| baker | 41 (M6.01) | ELECTRIC UNIT HEATER SCHEDULE | EWH-1, EWH-2 (electric wall heaters, 1.5 kW) | UNIT_HEATER |
| federal-mech | 14 (M7.1) | AIR HANDLING UNIT FAN SCHEDULE | RF-1, RF-2, SF-1, SF-2 (AHU-1's fans) | FAN |
| federal-mech | 14 | AIR HANDLING UNIT HYDRONIC COIL SCHEDULE | CHWC, HWC (AHU-1's coils) | the AHU's coil data |

**Effect:** the census and the keys miss these units. 031 schedules its VAV
terminal units but carries no VAV instance. federal-mech's and 031's AHUs
lose the fan and coil data an assembly needs (AS-11 has the join problems).

**Next:** the table/compile loops own the fix; claims are theirs, and this
goal never touches extraction. When the claims change, the census re-runs
and dev keys are authored for the newly claimed tables. Held-out keys do not
change.

---

## AS-9 — claimed tables that print no instance of their claimed family (OPEN — owned by the table/compile loops)

**Found:** 2026-09-23, WP0.3.

**Evidence:**
- 060 page 52 (structural sheet S-513): the EQUIPMENT ANCHORAGE SCHEDULE is
  claimed as DUCT_MOUNTED_COIL (census: 3 rows, no title). Its 15 printed
  rows are tanks, pumps, a chiller, a DDC panel, AC units and condensing
  units. None is a duct-mounted coil.
- 031 page 33 (architectural sheet AE401): the EQUIPMENT SCHEDULE is claimed
  as FAN (census: 1 row). Its 12 rows are toilet accessories and appliances.
  RF-2 REFRIGERATOR / FREEZER is the likely trigger, since RF- is a
  return-fan prefix.

Both are keyed with `rows: none` (key-work/README.md). The key gets one
table-level line, so every value reported from these tables scores invented.

**Effect:** phantom instances are counted (a FAN, and duct coils).

**Next:** as AS-8. A family claim may need more than a tag prefix, for
example the sheet's discipline or a header check.

---

## AS-10 — a claimed table's printed title is not taken (OPEN — owned by the table/compile loops)

**Found:** 2026-09-23, WP0.3.

**Evidence:**
- bldg5406 page 18 (plumbing sheet P-601): the PUMP table prints "CIRCULATING
  PUMP SCHEDULE" inside its own frame, but is claimed under no title. The
  census title is empty, and the key uses `title: (untitled)`.
- 060 page 52: the anchorage table of AS-9 is also claimed under no title.
  There the title prints *below* the table (detail B1).

**Effect:** title lookups (`find_schedule`) and the UI show an untitled
table.

---

## AS-11 — drawing inconsistencies an assembly join must survive (OPEN — this goal, WP2 and later)

**Found:** 2026-09-23, WP0.3. These are facts of the documents, not pipeline
bugs; they are recorded because the join and normalizer work must handle
them.

- **031:** the AIR HANDLING UNIT SCHEDULE names its parts WHSE-SF-1,
  WHSE-RF-1, WHSE-SH-1 and WHSE-PC-1. Their own schedules print WHSE-SF1,
  WHSE-RF1 and WHSE-SH1 (hyphen only), and WHSE-PHC1, a different mark.
  WHSE-CC-1 matches. A join needs hyphen-insensitive tag matching, and still
  cannot pair PC-1 with PHC1 by tag alone.
- **federal-mech:** AHU-1 names its fans "SF-1,2" and "RF-1,2". A join must
  expand the range.
- **itd-d1-lab:** HOT WATER REHEAT COIL SCHEDULE rows HC-6 and HC-7 name their
  supply valves "SV-6" and "SV-7"; the valve schedule prints SAV-6 and SAV-7.
- **12_MT:** the CABINET UNIT HEATER SCHEDULE's temperature headers are
  swapped between AIR SIDE and LIQUID SIDE (the key's comment gives the
  evidence: 15.7 MBH at 1.5 GPM is a 21 °F water drop, matching 180 → 160).
  The key reads the water temperatures from the AIR SIDE cells as the
  author's reading, so a normalizer that trusts the header grouping gets them
  wrong.

---

## AS-12 — the frozen key vocabulary cannot hold some printed selectors (OPEN — this goal, WP1)

**Found:** 2026-09-23, WP0.3.

**What:** the key vocabulary (`assemblies-key-transcribe.mjs`
`KEY_ATTRIBUTES`) was frozen before the census ran, and a key is never
edited. So these printed values have no attribute, and are typed "-":
- **DX fan coil cooling capacity:** FCU has `chw_mbh` (a chilled-water
  coil's) but no `cooling_mbh`. Affected: bldg5406 split units (COOLING /
  MBH); federal-mech DX FAN COIL UNIT SCHEDULE (TOTAL CAPACITY 21200 BTU/HR
  on six rows); itd-d1-lab F-1 (the split system's cooling is keyed on its
  outdoor unit instead).
- **Gas furnace heating capacity in FCU:** itd-d1-lab F-1, INPUT 80 / OUTPUT
  78.0 MBH.
- **A water-source heat pump's source loop:** 018 prints FLUID WATER,
  EWT/LWT, 15 GPM and WPD. The loop GPM selects the hook-up (research 04 §5).
- **Condensing unit input kW:** federal-mech CU-1 to CU-6 print MAX KW AT
  DESIGN 1.7. Chillers have `kw_input`; GENERIC_HVAC does not.
- **Control or BAS for unit heaters and humidifiers:** itd-d1-lab ELECTRIC
  HEATER note 6, "UNIT TO BE STANDALONE AND NOT CONTROLLED BY DDC" (EH-7 to
  EH-9), and HUMIDIFIER note 3, "CONNECT UNIT TO DDC CONTROL SYSTEM". Both
  decide whether a unit carries points at all.
- **ECM in AIR_HANDLER:** itd-d1-lab AHU note 2, "PROVIDE FAN ASSEMBLY WITH
  ECM MOTORIZED IMPELLER FANS".

**Next:** WP1's canonical schema adds these attributes. GATE 1's check still
holds (every *keyed* attribute maps to exactly one canonical attribute). The
new attributes stay unscored against the current keys; a later key tier
(AS-2) can include them.

---

## AS-13 — what keying navfac and the WP1 unit review added to AS-11 and AS-12 (OPEN — this goal, WP1 and WP2)

**Found:** 2026-09-23, WP0.3, keying the held-out document navfac
(`key-work/navfac-cherry-point-atc.transcription.txt`), and WP1, reviewing
every key line's unit against the canonical schema. This entry extends AS-11
(drawing inconsistencies) and AS-12 (vocabulary gaps).

**Drawing inconsistencies (extends AS-11):**
- **AIR COOLED HEAT RECOVERY CHILLER SCHEDULE (M-611, page 45):** both rows
  print HEAT RECOVERY EWT 130 and LWT 110. That is the reverse of a condenser
  bundle, which heats water; the same sheet's boilers print ENT 110 / LVG
  130.
  - The key keeps the printed values. The cells are unambiguously the
    bundle's entering and leaving temperatures; only their order contradicts
    physics.
  - This differs from 12_MT (AS-11), where the header *groups* (air vs.
    water) were misassigned, so the key read those cells by their evident
    identity.
  - A normalizer's physics check should flag such a row, never silently swap
    it.
- **The same schedule's notes 6 and 8** name the chiller's pumps "PCWHPs",
  "HRHWPs" and "HRWPs"; the pump schedule prints PCHWP-MT1/2 and
  HRHWP-MT1/2.
- **DOAH-T1 (M-622, page 49)** prints VOLTS/PH/Hz "460/60/30" (the text layer
  agrees). No reading gives a phase, so the key has volts 460 and phase "?".
  The CRAH schedule on M-621 prints "460/60/3" under V/HZ/PH, which is the
  likely intent.
- **FAN (QTY) H.P. cells in two orders under the same header wording:**
  - M-601 prints "(2) @ 10.0" (the count in parentheses);
  - M-621 and M-622 print "1 (5.0)" and "1 (1.5)" (the HP in parentheses).

  A normalizer cannot take the parenthesized number as the count from the
  header alone; a decimal is never a count.
- **HUMIDIFIER SCHEDULE (M-602)** heads its capacity "LB/HR" over "(MBH)". The
  same engineer's M-621 schedule prints plain "LB/HR" for the same 1.9 kW
  units, so the key reads lb/hr.
- **DOAH-T1's row carries two units' data.** Its DUCT MOUNTED HEATING COIL
  block is a separately tagged coil: note 2 names it HHWC-DOAH-T1, and the HHW
  control valve schedule lists it under that mark at 1.2 GPM, this block's
  flow. DOAH-T1's own valve carries 2.6 GPM, the preheat coil's flow.
- **The two parts of the DEDICATED OUTDOOR AIR UNIT SCHEDULE** are titled
  "1 OF 1" and "2 OF 2".
- **bessemer's FAN SCHEDULE** heads EF-1's static pressure "EXT. SP. (FT)"
  and prints 0.25. That is 3 in. w.c., implausible for a bath exhaust fan, so
  the header likely means inches. The key keeps 0.25 ft as printed. The WP1
  schema converts feet of water to inches (×12) the same way for a key and a
  normalizer, and never guesses that a header's unit is wrong.

**Vocabulary gaps (extends AS-12):**
- **A fan-powered terminal's own fan airflow:** navfac's VAV FAN AIRFLOW
  (CFM), 27 rows. cfm_max and cfm_min are primary airflows.
- **A dehumidifier's moisture capacity:** navfac CAPACITY PINTS/HR, six rows.
- **Motor power printed in watts under an HP header.** The key holds
  motor_hp in W where every cell prints watts (navfac UH-M1, CUH-T1/T2, as
  in 12_MT and federal-mech). It holds "?" where one column mixes HP and W
  (navfac FCU-M3 "85 W", FCU-M5 "225 W"), because a key column carries one
  unit. WP1 should give motor power one canonical attribute with a unit, so
  both forms become scorable.
- **A CRAH's fan motor count** (GENERIC_HVAC has no fan count).
- **A heat recovery chiller's compressor kW.** Both compressor kW and unit
  power kW print; the key uses unit power as kw_input.

**For the attribute scorer (WP2):**
- A value a pipeline reports for a unit the key does not list, from inside
  a keyed table, must not score as invented when that unit is printed.
- Example: HHWC-DOAH-T1, decomposed from DOAH-T1's row, should be out of key
  scope, like a value cited from an unkeyed table.
- A unit that is not printed at all stays invented. The scorer needs a rule
  that tells the two apart (the row's cells, or the table's notes, name the
  unit), fixed before any normalizer output is scored.

---

## AS-14 — the frozen key vocabulary omits an air handler's return and exhaust airflow and its return-fan count (OPEN — scored only by a later key tier)

**Found:** 2026-09-23, WP1, reviewing the canonical schema against plan
§8.5 (THE LOOP step 7).

**What:** plan §8.5 gives an air handler's fans (supply, return, relief,
exhaust) each {cfm, hp, vfd}. The frozen key vocabulary
(`assemblies-key-transcribe.mjs` AIR_HANDLER) has supply airflow, supply,
return and exhaust fan HP, a supply-fan count and one unit-level VFD. It has
no return or exhaust airflow and no return/relief fan count.

**Evidence** (each printed column is typed "-" in its key):
- federal-mech AHU-1: "AIRFLOW / DESIGN RETURN AIRFLOW" 21000 and "RELIEF
  FAN / RF QTY" 2;
- 031 WHSE-AHU-1: "AIR FLOW / RETURN / CFM" 12450;
- navfac DOAH-A1 and DOAH-A2: "EXHAUST FAN / CFM" 1,280 and 1,380.

**What happened:** WP1 adds `return_cfm`, `return_fan_qty` and `exhaust_cfm`
as extensions for the six air-handler families. They are unscored today;
keys are never edited.

**Also recorded for GATE 1:** the schema check reads every key, dev and
held-out, for units and enums. The held-out keys drove exactly two schema
entries, both dimensionally exact conversions: W to kW (bessemer's heat pump
electric coil) and feet of water to in. w.c. (bessemer's fan static, AS-13).
No fitted value came from a held-out key.

---

## AS-15 — every corpus-eval scorer child spawns an orphan that re-scores its set, forever (OPEN — owned by the scorers' loops; worked around per run)

**Found:** 2026-09-23, recording the loop's corpus-eval baseline (task: measure 1).

**What:** the first cold `npm run eval:corpus` at `470d609` drove this
16 GB / 4-core container into a memory stall within 15 minutes:
`/proc/pressure/memory` full avg10 = 97%, MemAvailable 1.7 GB, load average
72, and a plain `ps` or `grep` took over two minutes. Seventeen of the
`--single-json` scorer processes had PPID 1 (no live parent). The run's
own `eval.err` showed sets starting 10 to 39 times each in 20 minutes
(itd-d1-lab 39, federal-mech 37, navfac 34); the most a set can start is
4, once per scorer. This is the "extra tag-eval.mjs --single-json processes
with ppid=1" PROGRESS.md records as an unexplained anomaly, and it fits the
23 oom-kills logged there.

**Root cause (confirmed by reading the code):** all four scorers that
`corpus-eval.mjs` runs (`takeoff-eval.mjs`, `graph-eval.mjs`,
`tag-eval.mjs`, `table-recall-eval.mjs`) end their `--single-json` branch
with `process.stdout.write(JSON.stringify(result), () => process.exit(0));`
and no `else`. The exit waits for a later tick, so the child falls through
into the orchestrator code below it. In the child, `only` is `[setId]` (the
set id is a positional argument), so the orchestrator spawns a grandchild
for the same set before the exit callback runs. The child then exits, and
the grandchild, orphaned, repeats the whole thing. Each set a scorer
finishes leaves a chain that re-scores it until killed; nothing reads the
chain's output (its stdout pipe has no reader). Introduced by `5ab7ca8`
(#107), which moved the exit into the write callback to avoid truncating
the result; before that, the synchronous `process.exit(0)` never reached the
orchestrator code.

**Why this goal does not fix it:** the scorers are other loops' instrument
(goals/ASSEMBLIES.md WHAT YOU OWN does not list them). Proposed fix, one
line per scorer: `await new Promise((r) => process.stdout.write(json, r));
process.exit(0);` (a top-level await, so nothing after it runs), or an
`else` around the orchestrator. `assemblies-baseline.mjs` and
`assemblies-attr-eval.mjs` (this goal's) are not affected: their single-set
branch cannot fall through.

**Workaround used (changes no score):** the baseline run (attempt 2) ran
with an orphan reaper on its own process group. The reaper stops a
process only when it is in that group, has PPID 1, and is a node process
with the exact argument `--single-json`, or that process's table
sidecar. An orphan's stdout has no reader, so no scorer ever sees its
result. The reaper was tested on synthetic orphans first: it stopped the
exact match and left a look-alike argument and a non-node process alone.
Attempt 2 also ran one child per scorer (`OPENTAKEOFF_EVAL_CONCURRENCY=1`,
4 heavy children on 4 cores) with a 40-minute per-set timeout.
The reaper stopped 494 orphans over the run: 487 node children (122 each
from takeoff-eval, graph-eval and tag-eval, 121 from table-recall-eval, one
per set scored) and 7 table sidecars. With it the run held; its low point
was 1.6 GB available at 23:43, and the container's memory cgroup OOM-killed
one 5.9 GB node process at 23:44 (not an orphan) while four scorers ran
heavy sets at once; the run's one child that ended without a result is
graph-eval's baker-county-eoc, taken to be that process. That set was rerun alone afterwards
(`reports/assemblies/00-corpus-eval-baseline.txt`).

**Two more things this run showed about the orchestrator (recorded, not
fixed; also the scorers' loops'):** tag-eval.mjs exits 1 by design when any
keyed set is below its floor, and corpus-eval.mjs awaits its scorers with
`Promise.all`, so a below-floor tag census ends corpus-eval with exit 1 while
graph-eval is still running (its report still arrives on the shared stderr).
And the sets whose PDFs are absent here fail fast with ENOENT on a path from
the corpus author's machine (AS-2), which every scorer prints per set.

**Evidence:** `reports/assemblies/00-corpus-eval-orphans.txt` (attempt 1:
the per-set start counts and the orphan process list; attempt 2: the reaper's
per-scorer counts).

---

## AS-16 — bldg5406's rotated schedules lose, merge and reorder their columns in the sheet graph; 80 dev values are out of the normalizer's reach (OPEN — owned by the graph's loop; a demonstrated ceiling for GATE 2)

**Found:** 2026-09-24, WP2, measuring the normalizer on the dev keys.

**What:** the dev attribute eval (`reports/assemblies/02-attr-eval-dev.md`)
misses 80 of bldg5406-hvac-demo's 145 printed values (44.8% exact). The
other ten dev documents miss 4 of 1,908: 12_MT's cabinet unit heaters, whose
drawing prints the coil's water under AIR SIDE and the air under LIQUID SIDE
(AS-11). All 80 sit in the five schedules bldg5406 draws at a quarter turn,
where the sheet graph:
- dropped columns (the terminal boxes' INLET DIA. and VOLTS / PH / HZ; the
  page-18 pump schedule's SERVING, head, HP and V/φ);
- merged neighbours into one cell (AHU-1's "5100 1290 BUILDING 5406" under
  CFM; the fans' "1/4 115 1 60" under ELECTRICAL; the pump's "4 40" under
  GPM);
- stripped the words that name a column's quantity (REGULATOR SET CFM became
  "CFM", MIN. CFM became "AIR TERMINAL BOX SCHEDULE CFM", the AHU's cooling
  coil lost its COOLING COIL group);
- reversed a header's word order ("(°F) LWT / EWT" over "56 / 44", which the
  physics check then refuses).

Per-table evidence, with the key's headers beside the graph's and a graph
row, is in `reports/assemblies/02-bldg5406-ceiling.md`.

**Why this goal does not fix it:** the sheet graph (sheetgraph.ts,
vectorGrid*) is outside WHAT YOU OWN, and the normalizer reads only the
graph's columns: that is the shared path's table truth, which the UI and the
MCP tools display. Splitting a merged cell by value shapes (115 is a
voltage, 60 a frequency) or taking a bare "CFM" as the box's maximum would
assign values the graph does not hold (LAW L4). Two readings would come
close: re-gridding the rotated table from the text spans inside the
normalizer, or pairing values by the order they print in. The first is a
second extractor off the shared path; the second guesses. The key is not
changed.

**The ceiling this puts on GATE 2 (dev):** leaving out these 80 and 12_MT's
4 (AS-11: the drawing's air and water groups are swapped, and the normalizer
refuses the contradiction rather than reinterpret the headers), exact can
reach at most 1,969 of 2,053 (95.9%), below GATE 2's 98%. The normalizer
measures 1,967 (95.8%), with 2 wrong and 0 invented. The 2 wrong are
itd-d1-lab's BP-1/BP-2 AREA SERVED: the graph joins the spans
"BOILER PUMP ( B-1" and ")" into "( B-1)", and the key reads "( B-1 )".
Without bldg5406, dev measures 1,902 of 1,908 exact (99.7%). The gate stays
failed as defined. The ceiling is recorded here and in PROGRESS; the gate is
not redefined.

**AS-15 addendum (2026-09-24 01:12): an orphan outlives the run.** The
baker-county-eoc graph rerun (`run-graph-baker.sh`, one set) exited 0 at
00:42:19 and stopped its reaper with it. Its child had already spawned the
fall-through successor, which re-scored baker (about 13 minutes, 5.7 GB),
then spawned the next. At 01:12 PID 17697 (PPID 1, the run's process group
26055, `graph-eval.mjs … --single-json baker-county-eoc`) held 5.7 GB. It
pushed the container to 1.3 GB available and a load average of 12 while
the guard's mcp tests ran. It was stopped by PID with its table sidecar;
nothing read its output. A run under the workaround must keep its reaper
alive until its process group is empty, not until the orchestrator exits.
The loop's run scripts do that from now on. (The first version of that
drain loop counted the script waiting on it, which sits in the same
group, and never exited after the held-out run; it now leaves its caller
out. No eval process was alive when it was stopped.)

---

## AS-17 — held-out GATE 2 fails: the normalizer's rules do not yet carry to drafting they were not grown on (OPEN — this goal; closing it needs dev documents the environment cannot stage, AS-2)

**Found:** 2026-09-24, GATE 2 (held-out), measured once with the normalizer
of 3f836e9 (`reports/assemblies/02-attr-eval-heldout.{json,md}`; the
report's normalize.ts sha256 bb3ffecf804c matches the commit).

**Numbers (aggregates only; `--heldout` prints no value):** 865 of 1,008
printed values exact (85.8%, need ≥ 95%); wrong 4 (0.4%, need ≤ 1%);
invented 2 (need 0). Grid slice 653/728 (89.7%), the author's structural
reading 163/216 (75.5%), table notes 49/64 (76.6%, holding all 4 wrong).
By set: navfac-cherry-point-atc 730/835 (the 2 invented), 024_MO 52/68
(the 4 wrong), 30_WA_SpokaneTransit 38/47, 060_XX_ASC 26/30, 018_GA_USDA
11/15, bessemer 8/13. Dev outside its ceiling (AS-16) is 1,902/1,908
(99.7%).

**Why:** the rules were grown on 11 dev documents, each from a measured dev
miss with a test on its shape. Held-out documents draw their schedules
differently, and the gap says the rules are still narrower than the
drafting population. That diagnosis rests on the gap alone: no held-out
value, render or graph was opened, and none will be to fix this.

**Why it is not fixed now:** the only honest way to close it is more dev
evidence, and the present population is exhausted. 17 of the 22 present
documents carry a keyed family, and all 17 are keyed, 11 dev and 6
held-out (AS-7). The bulk corpus (~98 sets) needs network access to
`drive.google.com` / `drive.usercontent.google.com` (AS-2, asked once in
WP0). Tuning on the held-out numbers would make them a second dev set and
leave the gate without a measure. The committed cross-set compile
snapshots (`takeoffs/cross-set-compile/`) hold totals only, with no
headers or cells to learn from.

**Unblock:** stage the bulk corpus. Then draw a second dev tier by a
written seed, key it from renders (TRUTH), fix what it shows on the shared
path, and score held-out again at the next gate. The 6 frozen held-out
documents never move to dev; the extra documents also give the second
held-out tier AS-2 describes.


---

## AS-18 — 61 of the 244 dev typicals truths depend on context no schedule row carries (OPEN — this goal, WP5; decides how close the auto-proposal can come to GATE 5)

**Found:** 2026-09-24, WP5.5, authoring `keys/*.typicals.csv` for the 11 dev
documents. Each unit was judged from its schedule row, its remarks and the
sequences and control schematics the sheets point to. Renders and raw PDF
text only; the pipeline was not consulted.

**Numbers:** 244 instances. 142 carry a v1 typical and 102 carry `none`.
- About 41 of the `none` rows are families v1 has no typical for
  (DUCT_MOUNTED_COIL, CONDENSING_UNIT, FIN_TUBE_RADIATION). The engine
  gives `no_assembly` for these from the family alone.
- The other 61 depend on context outside the row:

| Context | Rows | Where it is written |
|---|---|---|
| no BAS in the project | 22 | baker (sequence: programmable thermostats), 004 (general controls note 1: factory controls "WITHOUT THE USE OF A BUILDING AUTOMATION SYSTEM") |
| the unit has no BAS point (standalone) | 17 | itd EF-1..3, EH-7..9; federal UH, condensate pumps; 069 boiler pumps on a boiler interlock |
| the BAS only monitors the unit | 15 | federal EV-1..6 and itd DFC-1 (split systems with a monitoring sensor); itd EH-1..6 (thermostat control, status and temperature read); itd BP-1/2 (boiler interlock, status read) |
| existing unit, controls unchanged | 5 | 069 B-1(E), B-2(E), AHU-1(E); 031 WHSE-EUH-1/2 |
| component of another unit | 2 | 031 WHSE-SF1/RF1, the air handler's fans |

The v1 typicals are packages of new BAS work, so an estimator keys
`none` in all five cases. The auto-proposal selects on the unit's
attributes, so it cannot tell any of these cases apart from a BAS-controlled
unit.

- Two rows need a typical from another family: 094 AHU-07 and itd AHU-1
  are 100% outdoor-air units keyed `doas`, and itd F-1, a gas furnace
  claimed in a fan coil table, is keyed `split-dx-indoor`. The engine
  can only pick within the family, so these are misses today.
- Some units get a typical with no drawing sign of BAS control at all:
  031 WHSE-EF1/EF2 and WHSE-P4, and itd EF-4, all on BAS projects. That
  is flagged in each row's basis note.

**Why:** these are drawing facts (sequences, general notes, `EXISTING`
titles, `(E)` tags, a serving AHU named in the service column). The
attribute schema does not carry them, and LAW L1 forbids reading them by
regex.

**What it means for GATE 5:** dev exact ≥ 98% needs at most 4 misses out of
244. It cannot pass unless the shared apply path learns these contexts
from evidence. Candidate paths, each to be audited before building:
- (a) a project-level `bas_scope` variable, unset until the partner sets it
  (A3), with the eval run under the key's disclosed setting;
- (b) lifecycle evidence the pipeline already has, such as the `(E)` tag
  convention and existing/demolition phasing;
- (c) sequence reading through the disclosed VLM/AI path (AGENTS.md item 8);
- (d) served-equipment links, for the AHU component fans.
If none holds up, the remainder is a demonstrated ceiling. Keys are never
changed to fit.

**Key conventions (all 11 dev keys):**
- `none` = no v1 typical fits. A `?` option = the drawings do not decide
  it; it takes the library default, and an auto option that is not decided
  is written `opt=?`.
- An option that does not apply to the unit (a valve option on an electric
  heater) is marked `?`.
- DoD owners (Eglin AFB, Davis-Monthan AFB) set `ufc_minimum_points=true`
  on HVAC typicals. Plumbing pumps set it false, outside UFC 3-410-01's HVAC
  scope.

---

## AS-19 — the typicals auto-proposal reads schedules, while half the dev truths are decided on the control drawings: 116 of 244 exact (OPEN — this goal, WP5/WP6; the demonstrated ceiling of a schedule-only proposal)

**Found:** 2026-09-24, WP5.1, the first run of instrument 3
(`mcp/scripts/assemblies-typical-eval.mjs`; `reports/assemblies/05-typical-eval-dev.{json,md}`).
The proposal is the shared apply path: `web/src/lib/assemblies/apply.ts`
(normalize with the table context, derived family and `terminals_served`)
into `select.ts`. It runs with no project settings and no partner defaults.

**Numbers (dev, 244 keyed instances, all matched to a compile item):**
- 116 exact (47.5%, GATE 5 needs 98%): 73 of the 142 typical rows and 43 of
  the 102 `none` rows. The 43 are the families v1 has no typical for:
  DUCT_MOUNTED_COIL 24, CONDENSING_UNIT 11, FIN_TUBE_RADIATION 8.
- Disclosure: 73 of the exact rows reach a drawing-decided option through
  the library default. No decided record rests on a value the attribute key
  says is not printed.
- 62 of the 63 unresolved rows name only attributes the drawing leaves
  unprinted. One names a value the normalizer misses: bldg5406 AHU-1
  `cooling_type`, the rotated-schedule ceiling of AS-16.

The other 128 rows, by cause:

| Cause | Rows | Examples |
|---|---|---|
| The drawings decide an option away from the library default (control schematics, points lists, sequences) | 44 option_wrong | federal VAV CO2 sensors 15; unit and cabinet heater modulating valves 8; exhaust fan dampers and pressure control 7; DoD UFC minimum points 4 (plus federal AHU-1 and the chillers); 094 AHU-04/05/08 (no zone sensor, freezestat on the starter, no smoke detector); federal B-1/B-2 isolation valves; itd HUM-1 space humidity; itd F-1 fan status |
| Context outside the row (AS-18: no BAS, standalone, monitor-only, existing, component) | 21 wrong_typical + 38 unresolved | baker, 004 (no BAS); itd EH-1..9, federal UH, CP; 069 B-1(E)/B-2(E); 031 WHSE-SF1/RF1 |
| A fan or pump whose VFD the schedule does not print; the key decides it from the control points or a note | 18 unresolved | federal EF-1..4, bldg5406 EF-1..5 and CP-1, 069 CWP-1/2 ("NEW CONSTANT SPEED" in a note), itd EF-4..6, 031 WHSE-EF1/EF2 ("SPEED CONTROL: CONSTANT / VARIABLE") |
| An auto option with no printed attribute and no partner default | 4 unresolved | FCU `variable_speed_fan` (ecm): bldg5406 AC-1, federal FCU-1; 094 AHU-06 economizer; 094 AHU-07 exhaust fan (energy recovery) |
| Terminal counts the schedules do not give | 2 unresolved | 031 WHSE-AHU-1 (its terminals are reheat coils); itd AHU-1 (the M6.3 schematic makes it 100% OA, the schedule prints 3,950 of 13,000 cfm) |

Structural fixes in this commit, which change typicals but not the count:
- `terminals_served` is derived from the terminal rows that name the air
  handler, from the project's only AHU/RTU, or as 0 when the project
  schedules no terminal unit and no duct-mounted coil. 094 AHU-04/05/08
  (single-zone) and federal AHU-1 (multizone VAV) now get their key's
  typical.
- A 100% outdoor-air air handler takes the DOAS typical (094 AHU-07, whose
  printed OA equals its supply). A gas-fired fan coil takes the furnace
  typical (itd F-1).
Each of these rows still misses on an option that the control drawings
decide.

**Ceiling:** with every schedule attribute read perfectly, a schedule-only
proposal still misses every row whose truth is on the control drawings: 62
of the 142 typical rows need a non-default option (counted from the keys
against the library defaults), and the 59 context `none` rows need context.
Its ceiling is at most (142−62) + (102−59) = 123 of 244 (50.4%). It is lower
still, because a fan or pump whose schedule prints no VFD cannot be decided
from the schedule either. GATE 5 cannot pass on schedules.

**Path, in the order it will be tried:**
- D6 evidence (goal WP5.1/WP6): control schematics, printed points lists and
  sequences bound to a unit decide its options and whether it has BAS
  control. The sheet graph already carries L4.8 control schematics with
  bound equipment tags, instrument labels and explicit I/O tokens, plus
  sequence narratives. WP6's printed-list-to-unit mapping is the same map.
- Project settings the estimator states once and the record discloses: BAS
  scope (22 rows) and a DoD owner (UFC minimum points). The eval would report
  them apart from the auto-proposal.
- Partner defaults (INPUT 4) for options the drawings leave open.
Keys are never changed to fit.

**The D6 census (2026-09-24, `reports/assemblies/05b-schematic-census-dev.txt`):**
- The 11 dev documents carry 30 control schematics, and 15 print explicit I/O
  tokens. 36 scheduled units bind to one schedule row through a schematic,
  and 25 of them sit on a schematic with I/O tokens.
- Only **3 schematics bind a single unit and print I/O**: itd-d1-lab EF-5,
  LEF-1 and EH-5. All three are `evidence_inventory` status.
- The other schematics are of two kinds:
  - system diagrams (heating water, chilled water, a VAV air handler with its
    humidifier), whose I/O belongs to several units at once, bound and
    unbound;
  - typical diagrams bound to no unit. Federal-mech's CAV, VAV, FCU, unit
    heater and exhaust fan diagrams name no scheduled tag, and their title
    naming a family is a word, not a binding (L1). Federal-mech's 13 diagrams
    print I/O tokens on only one.
- No dev unit has a printed points list (AS-22).
- So drawing-decided options could reach at most 3 of the 244 dev rows
  (≤ 1.2 pp). Partial I/O labelling makes an I/O-count match on system
  diagrams unsafe: a wrong fit would decide options wrongly.
- `ioMatch.ts` (tested) therefore stays unwired, and its header says so.
- **Ceiling (demonstrated):** GATE 5 cannot pass on the documents this
  environment stages. The truths that decide it sit in context (AS-18) and in
  control drawings that do not bind I/O to one unit. What would move it:
  - project-level statements the estimator makes once (BAS scope, a DoD
    owner), reported apart from the auto-proposal;
  - partner defaults (INPUT 4);
  - dev documents whose control drawings bind one unit each (AS-2, INPUT 5).


**GATE 5, measured 2026-09-24 at 6bfa8be (`reports/assemblies/05-typical-eval-{dev,heldout}.{json,md}`):**
- Dev: 116 of 244 exact (47.5%; the gate needs 98%). 44 option_wrong, 21
  wrong_typical, 63 unresolved (one dishonest: bldg5406 AHU-1, AS-16), 0
  undisclosed, 0 unmatched. Every count is the same as before the printed
  points evidence (D6) went in, as expected: a printed list replaces a
  unit's point lines and decides no typical or option. Counting only the
  rows that reach every drawing-decided option without a library default,
  43 of 244 are right (17.6%).
- Held-out: 21 of 91 exact (23.1%; the gate needs 95%). 58 option_wrong, 1
  wrong_typical, 11 unresolved (5 name a value the attribute key says is
  printed: the normalizer's held-out misses, AS-17), 0 undisclosed.
  Aggregates only; held-out was not looked at row by row.
- No decided record rests on an unprinted value on either side. Parity is
  green (records, lines, report and the CSV set, on D04).
- The attribute eval at the same state is unchanged: dev 1,967 of 2,053
  printed values exact (95.8%), 2 wrong, 0 invented.

**What the next lever needs (LAW L1).** The misses are options the control
drawings decide. A schematic's instrument labels ("SD", "TT", "DPS") are
text, and turning them into a device role by pattern would be
classification by regex. There are two structural routes, where regex only
confirms:
- the drawing's own abbreviation or symbol legend, a table the graph reads,
  maps a label to a device;
- a schedule's control column ("CONTROL: FAN-A") names the detail that
  controls the unit, and the detail's printed I/O tokens and instruments
  belong to it.
The graph's L4.8 control schematics already bind equipment tags to schedule
rows and carry explicit I/O tokens (`controlSchematic.ts`, read-only here).

---

## AS-20 — a printed hardwired chiller interface counted as a network interface (FIXED — library v1 auto expressions)

**Found:** 2026-09-24, instrument 3 on dev: federal CH-1 (note 4, "PROVIDE
HARDWIRE INTERFACE BETWEEN CHILLER PANEL AND SITE DDC CONTROLS"). The
normalizer reads it as `bas_interface` HARDWIRE, and the chiller's
`network_interface` auto was `known(attr.bas_interface)`, so the record
claimed a BACnet interface. The boiler's option and the `rtu-networked`
selector had the same expression.

**Fix:** the three expressions now read `known(attr.bas_interface) and
attr.bas_interface != 'HARDWIRE'`, which matches the options' own
definitions ("on the network (a BACnet interface)"). A hardwired interface
is enable, status and alarm contacts: discrete points. The builder was
changed and the JSON rebuilt from it. Tests: apply.test.ts "a printed
hardwired interface is not a network interface (chiller, boiler, RTU)".
Dev: federal CH-1's `network_interface` now matches its key. The row still
misses on `chw_isolation_valve` and `ufc_minimum_points` (AS-19).

---

## AS-21 — a register's declared component cannot stand in for a typical's device line by role alone (OPEN — this goal, WP6 with the points compare)

**Found:** 2026-09-24, auditing D6's second evidence source for WP5.1: the
components the BAS workflow's reviewed assembly register binds to equipment
(`basAssemblyReview.ts` `basAssemblyView`; `basAssemblyRegister.ts`).

**What the register holds:** per component its kind, the equipment it binds,
its disposition and condition, and the declaration it rests on. Source
declarations name a VFD with its fan role (SUPPLY, RETURN, EXHAUST, RELIEF),
an onboard (factory BACnet) controller, a terminal equipment controller, a
dual-technology occupancy sensor, a downstream static pressure sensor, or a
primary supply-air damper. Explicit review decisions can name any of twelve
kinds (valve, damper actuator, relay, …) with no qualifier. The register is
incomplete by design (`discovery_complete: false`, `project_complete:
false`).

**Why a role match is wrong:** the starter's role ids are coarse. An AHU
typical has `sf-vfd`, `rf-vfd` and `relief-fan-vfd`, all role `vfd`. It has
`chw-valve`, `hw-valve` and `steam-valve`, all `control-valve`, and up to
five `damper-actuator` lines. `expand.ts` replaces every device line whose
role id is declared, so a declared supply-fan VFD would replace the return
and relief VFD lines as well. Because the register is incomplete, those
lines would be lost for no drawing reason. Replacing nothing leaves a
typical's line beside the drawing's declaration, and its responsibility
cells can contradict the declaration's (a factory-furnished VFD against a
controls-furnished line), which A2 forbids.

**A register kind names exactly one line only here:**
- a terminal equipment controller → `terminal-unit-controller`;
- a dual-technology occupancy sensor → `occupancy-sensor`.

Each typical that has these roles has one line of them. Every other kind
needs line identity: the fan a VFD drives, the service a valve controls, the
damper an actuator moves.

**Path:** give device and point lines a structured identity (for example the
fan, service or position a line serves, as a line parameter the library
already implies in its labels). Then match declarations to lines by role and
identity, and printed points-list rows to point lines by I/O type and
function. The printed points compare (WP6) needs the same identity. Until
then the register is not read by the apply path, and the goal's WP5.1 bullet
"drawing-declared components applied per D6" stays open. Printed points
lists are applied (a unit's list stands instead of all its typical's point
lines, because a printed list is the unit's whole list).

---

## AS-22 — a numbered points list's row number is read as the equipment its row serves (OPEN — owned by the BAS points compile's loop; guarded on the apply path)

**Found:** 2026-09-24, wiring D6 (printed points lists) into the apply path.
federal-mech (dev, fixture D04) prints four "HVAC CONTROLS - BMS POINT
FUNCTION SCHEDULE" lists (CHW system, HHW system, VAV boxes,
miscellaneous; sheets 19, 20, 23 and 24; 89 rows). Their rows are numbered
1, 2, 3 and so on. The BAS points compile's served-equipment logic
(`corpusTakeoff.mjs` `servedEquipmentFromBasRow`, read-only) falls back to
the row's key, so every row's `served_equipment` is its own number ("1" …
"32"). A project that also schedules units marked "1", "2" would have taken
those rows as the units' printed points.

**Guard (this goal, apply.ts `printedPointRows`):** a served-equipment mark
with no letter is a row number, not a unit, the same rule
`servingAirHandlers` uses for terminal rows. Tested in `apply.test.ts`, and
the parity test asserts that D04's lists map to no unit.

**What is lost:** these lists are real printed points for a system (the CHW
plant, the HHW plant) or for a family (every VAV box). Mapping a list to a
system or family from its title would be reading words; the owning loop
would need a structural binding (for example a title that names a
scheduled unit, or a list that sits inside a control detail bound to its
equipment). Until then, D6 does not apply to these units and WP6 has no dev
unit to compare.


## AS-23 — the Takeoff panel's starter library never loaded under the dev server (FIXED — this goal, WP5.4)

**Found:** 2026-09-24, the first UI-proof run (`web/scripts/playwright-assemblies.mjs`
on `raw/federal-attachment4-mechanical.pdf`, the Vite dev server).

**What:** Takeoff → Assemblies showed "0 assemblies (0 yours)" and "Failed to
fetch dynamically imported module:
…/src/lib/assemblies/starter/us-hookups-v1.json?import". The run's screenshot
and log are in the session scratchpad (`uiproof/ui-run1/`).

**Root cause (confirmed):** `starterLibrary.ts` (WP5.4) loaded the two starter
files with `import("…json", { with: { type: "json" } })`. The Vite dev server
rewrites the URL to `…json?import` and serves a JavaScript module
(`Content-Type: text/javascript`), but it keeps a dynamic import's options
object. The browser then asked for a JSON module, got JavaScript, and refused
it. A static import's attributes are stripped (`presets.ts` and
`linear/rates.ts` load fine), and `vite build` bundles the JSON, so the unit
tests, the build and CI all passed. Only a browser run against the dev server
could show it.

**Fix:** the two dynamic imports drop their attributes (Node with tsx and
the build read the JSON either way). `web/test/assemblies/starterLibrary.test.ts`
loads the starter through the gate (47 records) and fails on any dynamic
import in `web/src` that passes attributes. As a negative control, the
pre-fix file trips it.
