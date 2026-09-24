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
