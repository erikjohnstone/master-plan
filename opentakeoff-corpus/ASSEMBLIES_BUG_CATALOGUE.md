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
No other result changed.

**Workaround that needs no signal (2026-09-24, the final guard):** run the
main suite as `node --import tsx --test --test-force-exit` with the same
files as `package.json`'s `test` script. The runner exits each worker once
its tests have ended, whatever handles remain. The table sidecar reads
`for line in sys.stdin`, so it exits on EOF when its parent's pipe closes.
The suite finished in 12 minutes, with the same 5 AS-1 failures and no
process left behind. A tiny reproduction checked both halves first: a test
that spawns an idle stdin-reading child exits 0 under the flag, and the child
exits on EOF. `--test-force-exit` is not allowed in NODE_OPTIONS, so it goes
on the command line. The owning loop's fix, `unref`, or tracking every
spawned sidecar in `vectorGridClient.ts`, is still the real one.

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

**Addendum 2026-09-26 — the fourth dev tier's documents (keyed from renders,
AS-17).** 26_CA (the Transbay Tower's mechanical set) prints its equipment in
row schedules no family claims. Sheet M0.09 MECHANICAL SCHEDULES (page 9)
prints CUSTOM FACTORY-BUILT TRI-PATH MULTI-ZONE AIR HANDLING UNITS (in two
parts), AIR HANDLING UNIT (COOLING) (AHU-2-1 to AHU-62-1), CHILLER (WCU-2-1 to
WCU-2-4), COOLING TOWER (CT-R-1 to CT-R-4), PUMPS (CHWP-2-1 THRU 3 to P-1-3),
HOT WATER BOILER (B-2-1 THRU 4), PLATE AND FRAME HEAT EXCHANGER (HEX-2-1 to
HEX-35-2) and FAN COIL (BCU-P3-1 to FCU-62-3); sheet M0.10 (page 10) prints
AIR CONDITIONING UNITS - AIR COOLED SYSTEMS (AC-P3-1 with ACCU-P3-1 and
others), the FAN POWERED TERMINAL UNIT SCHEDULE (FPB-3-11 on) and FANS. The
census claims none of them. Its 26_CA claims are two water riser diagrams
(as AHU, AS-9, and one expansion tank), page 10's EXPANSION TANK schedule and
page 11's SINGLE DUCT CAV EXHAUST TERMINAL, SOUND TRAP SCHEDULE and WATER
FILTRATION UNIT. The seed drew a riser diagram for the document's AHU stratum,
since no AHU schedule is claimed.

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

**Addendum 2026-09-26 — the second dev tier's claims (keyed from renders,
AS-17).** Three more claimed tables print no instance of their family, and
are keyed `rows: none`:
- 047_NC page 10 "-CONDENSING UNIT" (CONDENSING_UNIT, census 1 row) is the
  line "CU -CONDENSING UNIT" of M-001's HVAC ABBREVIATIONS legend.
- 047_NC page 27 "EQUIPMENT SCHEDULE" (HEAT_RECOVERY_CHILLER, census 2 rows)
  is E-601's list of electrical equipment connections. Its CH-1 and CH-2 are
  the air-cooled chillers M-801 schedules; the claim comes from the family's
  `^CH[\s-]` tag prefix.
- 21_VA page 117, untitled, claimed as FAN, is sheet TA001's AV DEVICE
  SCHEDULE (floor boxes FB1, FB2; flat panels FP1, FP2).

Two claims name the family by a broader word than the family's own:
- 088_AZ's WATER COOLED CENTRIFUGAL CHILLER SCHEDULE is drawn for
  AIR_COOLED_CHILLER. It is keyed as that family, with `condenser = water`
  from the title: the family stands for "chiller".
- 088_AZ's ELECTRIC DUCT HEATER SCHEDULE is drawn for UNIT_HEATER, whose
  spec takes ELECTRIC DUCT HEATER titles and EDH marks. A duct heater has no
  fan of its own.

One claim counts a transposed table's labels as rows: 21_VA page 51's AIR
COOLED CONDENSING UNIT SCHEDULE prints one value column ("ACCU-1 AND
ACCU-2") with the attributes as row labels. The census claims 9 rows, its
label rows; the compile's items are those labels ("OPERATING VOLTAGE", "MODEL
NUMBER"), so the key's ACCU-1 and ACCU-2 (6 printed values) have no item to
pair with.

**Addendum 2026-09-26 — held-out 2's claims (keyed from renders after the
freeze, 328e572).** Two of the thirteen tables the seed drew for held-out 2
print no instance of their family, each claimed under no title:
- 037_AR page 56 (PUMP, census 1 row) is AE105, an architectural pad plan.
  Its one one-row table is NEW CONSTRUCTION KEYED NOTES, key value P3 ("NEW
  HOUSEKEEPING PAD ..."); the page prints no pump. P3 reads as a pump mark.
- 042_VA page 24 (FAN, census 1 row) is 1-EP202-N, an electrical power plan.
  Its FOOD SERVICE EQUIPMENT SCHEDULE ends in three EXHAUST HOOD rows (H1-H3)
  that print nothing else; the page prints no fan.
Both are keyed "rows: none", as the protocol keys every such claim.

**Addendum 2026-09-26 — the fourth dev tier's claims (keyed from renders,
AS-17).** Three of dev 4's 34 drawn tables print no instance of their family,
each claimed under no title, and are keyed `rows: none`:
- 01_NY page 87 (HUMIDIFIER, census 1 row) is M601 MECHANICAL CONTROLS: the
  AHU-1 control diagram, its sequence, two point summaries, an AIR FLOW
  SCHEDULE and an INTERLOCK SCHEDULE whose row names humidifier H-1 among
  AHU-1's interlocked equipment. H-1's schedule is page 88's STEAM
  HUMIDIFIERS.
- 08_ME page 1 (PUMP, census 3 rows) is the cover sheet's DRAWING LIST
  (SHEET NUMBER / SHEET NAME / SCALE): its P 101, P 102 and P 103 rows are
  plumbing drawing numbers read as pump marks. The document schedules no
  pump; its pages 28-32 (P 101 to M 102) carry no text layer and were read by
  eye.
- 26_CA page 57 (AHU, census 11 rows; page 58, the diagram's continuation, 6
  more) is M4.05 MECHANICAL WATER RISER DIAGRAM: an air handler symbol per
  level (AHU 22-1 to 46-1 and 22-2 to 46-2) on the chilled- and hot-water
  risers. Its schedules are AS-8's unclaimed ones.

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

**Addendum 2026-09-26 — the second dev tier's documents (AS-17).** Each is
keyed as printed, or "?" where the row disagrees with itself.
- **044_NY:** ACCU-1's RATED COOLING CAPACITY (MBH) prints 12000 for a
  12,000 BTU/h unit (basis of design Hitachi DHP12CBS21S): the header's unit
  is off by 1,000. One printed row "FOP-1, 2" names two fuel oil pumps. The
  economizers' DESIGN WATER TEMPERATURES IN prints 210 while note 1 says
  "FEEDWATER INLET TEMPERATURE SHALL BE 228 °F".
- **088_AZ:** CH-2's refrigerant charge prints 331/311 where CH-1 prints
  331/331. CU-3 and CU-5 print one model (LSU180HSV4) at 18,200 and 22,000
  BTU/H.
- **14_OR:** every pump row cites note 2, which the table does not print. SP-2
  prints V/PH 115/5 (SP-1: 115/1); keyed phase 5 as printed, so no reader
  can match it. The snowmelt pumps print MOTOR CONTROL "ECM" and cite note 1
  ("INVERTER DUTY MOTOR AND INTEGRATED VFD"): the row disagrees with itself
  (vfd "?"). The chiller prints GLYCOL 30%; the pumps' general note B says
  the chilled water system is 40% propylene glycol.
- **16_NV:** marks print bare under a hexagon symbol that carries the prefix
  (F, CU, ERV, OAU, AC), so one bare mark (B1) names a furnace, a condensing
  unit, a coil and an outdoor air unit in four tables; the SERVICE text
  composes them ("F-B1 AND EC-B1"). Right per table, ambiguous across
  tables. The ERV's general note 1 says "ENTHALPY WHEEL TYPE" and its unit
  feature 4 "POLYMER MEMBRANE ENERGY RECOVERY CORE" (recovery_type "?"). A
  furnace SERVICE prints "CLASROOM 28".
- **21_VA:** VAV-1-27's air pressure drop prints 0.78 where its neighbors
  print 0.0xx.

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

## AS-15 — every corpus-eval scorer child spawns an orphan that re-scores its set, forever (FIXED 2026-09-26: the child exits after its write)

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

**Root cause, found 2026-09-24 (the graph's own record, `vector_pipeline` in
bldg5406's cached graph):**
- VectorGrid ran on the schedule sheet and found the ruled grids of the
  sideways schedules. It then declined them:
  - `#6: 11x10 at 434,22,498,513` (the air terminal boxes) and
    `#6: 11x7 at 358,125,398,424` with `#6: 2x6 at 358,22,398,56` (the fans),
    each with "no header block above the data";
  - page 18's pump schedule (`#18: 8x2 at 293,71,313,377`) with "unknown kind
    and no title".
- On a quarter-turned schedule the header block sits beside the data in page
  coordinates, not above it, so VectorGrid's upright-header check refuses a
  grid it has read.
- The graph then kept `sheetgraph.ts`'s `extractAllQuarterTurnedTables`
  reading instead. That path turns the vertical text spans and runs the
  text-anchor extractor on them, and it produced the merged, dropped and
  reordered columns above. Those tables carry `rotated_headers: true`.
- The fix belongs in VectorGrid's header detection (read a grid whose text
  runs vertically in the turned frame), which the table-engine loop owns.
- With these 80 values read, dev would reach at most 2,047 of 2,053 (99.7%),
  above GATE 2's 98%. Nothing else in dev is near the threshold.


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

**AS-15 addendum (2026-09-26 10:05): a baker chain is alive again, and it
costs other sets their snapshot.** A fall-through chain of baker-county-eoc
graph-eval runs from an earlier baker rerun is still going. Each link has
PPID 1 and runs `graph-eval.mjs … --single-json baker-county-eoc`. It
re-scores baker for about 29 minutes at up to 6 GB, then starts the next
link (09:29:36, 09:58:39). Stopping it by PID was refused in this session,
so it stands. It shares the container's memory cgroup with every eval.
During the unseen audit's replay, the cgroup OOM-killed two compile
children while a link held about 6 GB:
- 01_NY's, at 8.0 GB anon, 09:46;
- 058_CA's, at 7.2 GB, 09:57.

Their "no snapshot" (`reports/control-intent/06-unseen-audit.json`) is
therefore not shown to be a ceiling of their own. They are to be
re-snapshotted once no chain is alive.

**Fix (2026-09-26).** Two more scripts have the same `--single-json`
branch and fall through the same way: `reference-eval.mjs` and
`table-box-eval.mjs`. In all six, the child now awaits its write and then
exits, so the orchestrator code below never runs in a child:
`await new Promise((flushed) => process.stdout.write(json, flushed));
process.exit(0);`. That is the proposed fix above. The owning loops'
scoring is untouched; only how the child ends changes. The standing goal
("do whatever you need to do") lets this loop fix it now, since the chain
was costing its own runs their snapshots.

Checked with each fixed scorer's orchestrator on one dev set
(`source /root/.ot-env.sh`, one child). After every run, no `--single-json`
process for that set was alive. Each set's lines equal the baseline's
(`reports/assemblies/00-corpus-eval-baseline.txt`):
- takeoff + reference, bldg5406: its row and its 13-line mismatch block;
- sheet graph, bldg5406: its row;
- tag census, bldg5406: its 10-line block (exit 1 by design, below floor);
- table recall, 12_MT: its row and 2 EXTRA lines;
- reference alone, bldg5406: its row;
- table boxes, 12_MT (no baseline): exit 0.

The live baker chain turned over at 10:10:27. Its new link loaded the fixed
`graph-eval.mjs`, so it ends when that link does.

**With the chain gone (2026-09-26, 10:22 on).** The last link exited at 10:22:17 and started no successor.
- 01_NY now snapshots: 39 compile items in 682 s, the machine peaking at 12.8 GB. Its "no snapshot" had been
  the chain's 6 GB.
- 058_CA does not. At the eval environment's 8 GB V8 heap (`--max-old-space-size=8192`), it fails with
  "JavaScript heap out of memory" after about 210 s. Given a 12 GB heap, its compile child reached 13.4 GB and the
  memory cgroup killed it, with the machine at 14.5 GB. That is a ceiling of its own on this 16 GB container.

**A cost to know about.** The sheet-graph cache key covers `mcp/package.json` (it pins dependency versions). The
unseen audit's commit added two tests to its `test` list, and so every cached graph was rebuilt on the next
run, at about one to seven minutes a set. The rebuilt graphs are the same. 096_IN's snapshot from its rebuilt
graph (156 items, 21 tables, 24 packets) is byte-identical to its earlier one in items, tables, pages, points and
packets, although its table sidecar was killed for memory near the end of that build. The other 89 unseen
sets read the same units and packets as before the rebuild (06-unseen-audit.json, before and after).

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

**Addendum 2026-09-26 — the second tier is drawn (AS-2 is lifted).** The
bulk corpus is staged (121 sets).
- **Census:** `reports/assemblies/tier2/00-baseline.{json,md}` covers the 84
  sets that were unseen when it ran. It now reads the content-addressed
  sheet graph; re-run on the 23 committed sets it is identical to
  `00-baseline.json`.
- **Drafters:** `drafters.json` places every eligible document in one of 79
  groups, from its title block (CI-32 found four held-out drafters' documents
  that way).
- **Draw:** seed 20260926 (`assembliesSplit.mjs` `drawTier2`;
  `tier2/01-split.{json,md}`; the test "AS-17: the committed second tier is
  reproduced exactly by its seed from its census").
  - The population is 53 documents in 47 groups.
  - Held-out 2 is 5 documents in 5 groups, 13 tables, at most 83 keyed rows.
    It skipped 6 groups with a document examined before the draw
    (`tier2/examined.json`). 035_AR and 091_IL are withheld as held-out-2
    groupmates.
  - Dev 2 is 10 documents, 48 tables, at most 201 keyed rows.
- **The unseen audit** now excludes both tiers and their withheld
  groupmates. The replay withdrew 24 sets:
  - the 15 tier documents and the 2 withheld groupmates;
  - the 5 CI-32 found (015_VA, 021_XX, 023_US and 038_NC, plus 010_US as a
    copy);
  - 2 near copies of dev-2 documents that the hygiene scan now counts as dev
    (053_VA of 036_LA, 082_OR of 14_OR).

  66 sets and 181 applied decisions remain. All 181 were reproduced (0 new,
  0 gone), and all are right.
- **Keying protocol:** each dev-2 key is typed from renders at 3x, with a
  second read of every row at 4x, before the pipeline runs on any dev-2
  sheet. Held-out 2 is keyed from renders only after dev 2's normalizer work
  is frozen, and is scored as aggregates at gates.

**Addendum 2026-09-26 — the dev-2 keys, the first dev-2 measurement, and one
round of normalizer rules from it.**
- **Keys:** all ten dev-2 documents are keyed from renders before any
  pipeline output on them was read: 47 tables (48 draws), 189 instances,
  4,013 key lines, 1,451 printed values, 3 tables `rows: none` (AS-9's
  addendum). Commits 9175a44 (036_LA, 063_MT, 066_MT), e4c89ec (047_NC,
  03_FL), 636747f (044_NY), 6bd027c (088_AZ), aeccb9f (14_OR), 022e72f
  (16_NV) and 3281058 (21_VA). GATE 1 holds: 11 attributes gained their
  first key example (capacity_mbh, primary_conn_in, secondary_conn_in,
  steam_lb_hr, steam_psig, return_fan_hp, outdoor_air_pct, primary_ewt_f,
  primary_gpm, primary_lwt_f, recovery_type). The printed inconsistencies the
  keys met are in AS-11's addendum.
- **First measurement** (normalizer of 3281058): 937 of 1,451 printed values
  exact (64.6%), 14 wrong (1.0%), 500 missed, 16 invented; 167 of 189
  instances paired. The gap is the one this entry names: rules grown on 11
  documents meet ten new drafting firms.
- **One round of rules**, each from a dev-2 miss with a test on its shape
  (`web/test/assemblies/normalize.test.ts` and `scheduleNotes.test.ts`, the
  tests under "AS-17"): electrical tuples in any part order (V/HZ/PH, V/H/P,
  VOLTAGE-PHASE, "208V 3ph", unlabeled ELECTRICAL DATA sub-columns); US units
  in brackets kept, SI twins still dropped; one value per labeled part of a
  cell ("COOL MIN / HEATING"; a staged unit's full capacity); unitary COOL /
  HEAT MBH, TC / SC, IN / OUT; a fired heater's input; a fan coil's
  chilled-water coil capacity; KW/TON an efficiency; TONNAGE; the unit's
  own RPM over its motor's; each fan motor's HP over a TOTAL; NO. OF FAN(S);
  a package's TOTAL flow; GPH; a MAX and MIN flow pair is a range; a count
  under an airstream group is not the unit count; a coil's rows need its
  water; SERVICE is the duty and SERVING what is served (dev 1's keys type a
  SERVICE cell naming rooms as the service, dev 2's type a SERVING cell
  naming rooms or units as the area served; both hold); a family without a
  service attribute reads either as the area served unless it names a
  system; MOTOR CONTROL VFD / ECM; a mezzanine in the word printed; a heating
  block printed "-" or "N/A" throughout is no heat; a hot-water block printed
  EXISTING throughout is an existing hot-water coil; a heat pump schedule's
  indoor unit; SEER / EER is DX; dual fuel and the first fuel's rating; CFH
  and gas pressure name gas; a heat exchanger's HOT / COLD SIDE by duty; a
  flue gas economizer's water side and media; TRAP LBS/HR (never a trap's
  rated CAPACITY); a humidifier's KW; SUCT. / DISCH. SIZE; a ΔP whose Δ the
  text layer lost. Notes: BACnet's variant, a named interface, the system a
  controller interfaces with (never a component connected to the BAS);
  glycol by the sentence's system; 100% outside air; the energy recovery
  type; coil rows; interlocks; a control device without its purpose clause;
  a second notes list under the first; a label a little apart from its list;
  notes no row cites speak for every row; a cited note contradicting the
  row's own cell leaves the value unknown; a REMARKS cell that is the motor's
  starter. A drive schedule's VFD now cites the drive schedule's row, where
  it is printed.
- **Result** (`reports/assemblies/02-attr-eval-dev2.{json,md}`): 1,259 of
  1,451 exact (86.8%), 0 wrong, 0 invented. Of the 192 missed, 173 are the 20
  status-marked instances the frozen scorer cannot pair (AS-27; all 173
  exact when paired by their base tag), 6 are the transposed ACCU table
  (AS-9), and 13 need what no rule here reads: an economizer's connections
  in a note (4), a unit features list and a filter data note (4), a snow-melt
  exchanger's media (2), a SERVICE cell's trailing "OUTSIDE AIR" (2), and
  SP-2's printed phase 5 (1, AS-11).
- **Dev 1** (`02-attr-eval-dev.{json,md}`): 1,965 of 2,053 (95.7%), wrong 2,
  invented 0; outside bldg5406 (AS-16), 1,900 of 1,908. The only change is
  069_ID's HWP-1 and HWP-2 VFD: the value is printed in the drive schedule,
  so it now cites that row and scores out of key scope (the key's reading
  names the drive schedule's PURPOSE).
- **Checks:** the control-intent reading, binding and questions evals and the
  typical eval print the same dev output before and after (A/B against the
  commit before this round). On 65 unseen documents (the unseen audit's
  eligible sets that snapshot) the normalizer's output changed for 132 of 872
  compile items, each read and found right: a VAV reheat block's heating
  airflow (58), fan coil chilled-water capacities (24), electrical tuples
  (12), fan counts no longer read as unit counts (5), BACnet MS/TP (4), heat
  pump COOL / HEAT MBH, propane boilers, an exchanger's capacity, a chiller's
  design flow over its flow limits, a humidifier's element, an EER-rated
  RTU; 15 pump speeds keep their value under a new rule id. Across dev, dev 2
  and those sets, 60 of 1,705 rows gained notes (uncited table notes, second
  lists).
- **Next:** freeze, key held-out 2 from renders, and measure GATE 2 on
  held-out and held-out 2 (aggregates; held-out also without 024_MO,
  AS-26). AS-27's pairing question is the owner's.
- **Frozen** at 6e1a626 (2026-09-26 18:11 UTC), before any held-out-2 key
  was typed: `normalize.ts` sha256 6121595e9c10, `scheduleNotes.ts`
  3be7dbc17281, `attributes.ts` ca338fe73841, the scorer
  `assemblies-attr-eval.mjs` 4b6305384fde. GATE 2 on held-out and held-out 2
  is measured with exactly these files, and each report's sha256 fields must
  match them. If the owner accepts AS-27's pairing rule, its number is
  reported beside the frozen scorer's, never instead of it.
- **Held-out 2 keyed** from renders after the freeze (328e572): 11_CA (8
  tables, 64 instances, 326 printed values), 092_IL (2 tables, 8 instances,
  83), 045_FL (1 table, 9 instances, 63); 037_AR's and 042_VA's claims print
  no instance of their family (AS-9 addendum). The withheld documents are
  not keyed.
- **GATE 2, measured once at the freeze** (`reports/assemblies/02-attr-eval-
  heldout{,2}.{json,md}`, normalize.ts 6121595e9c10, attributes.ts
  ca338fe73841; aggregates only):
  - Held-out: 893 of 1,008 exact (88.6%; 85.8% at 3f836e9), wrong 0 (was
    4), invented 2 (unchanged). Without 024_MO (AS-26): 837 of 940 (89.0%),
    wrong 0, invented 2. **FAIL** (95% exact, 0 invented).
  - Held-out 2: 266 of 472 exact (56.4%), wrong 1 (0.2%), invented 2; 79 of
    81 key instances pair with a compile item. **FAIL.**
  - What the aggregates say, and all they are used for: the rules grown on
    dev and dev 2 carry to a first sheet of an unseen drafter at about half
    their dev rate, and when they do not know they mostly say nothing (1
    wrong, 2 invented in 472). The missed values concentrate in attributes
    the dev keys print rarely or not at all (a title's pipe count or reheat
    medium, a location's level, a SPACE SERVED or SERVICE place, values
    stated in table notes, a fan array's count and each fan's horsepower).
    Held-out 2's two unpaired instances are a key tag that prints its fans'
    letters ("EF-1 - A,B,C"), a pairing question like AS-27's; the scorer
    and the key stay as they are.
- **Next:** no rule is written from these numbers (a rule needs a dev miss
  with a test on its own shape). The next evidence is a third dev tier,
  drawn by seed from the drafters no tier holds yet, keyed from renders like
  dev 2; held-out and held-out 2 are measured again only at the next freeze.


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


## AS-24 — AS-19's ceiling holds for a schedule-only proposal and for I/O-count matching, not for reading the control drawings (OPEN — proposed goal CONTROL_INTENT)

**Found:** 2026-09-24, research for the owner's question on estimator questions
and AI reading (`plans/05-research/01-dev-miss-evidence.md`; scripts and the
per-row CSV in `plans/05-research/`).

**What:** AS-19 concluded that "drawing-decided options could reach at most 3
of the 244 dev rows", because only 3 schematics bind one unit and print its
I/O. That bound is right for an I/O-count match. It is not a bound on the
control drawings themselves. Classifying all 128 dev misses by the evidence
their keys name gives:
- 31 settled by a project fact: no BAS 20, DoD 4, existing policy 5, motor
  speed with no VFD scheduled 2;
- 71 settled by control evidence: sequence prose 15, control details and
  points schedules 41, absence on a bound detail 12, detail plus DoD 3;
- 11 settled by the schedule itself, normalizer gaps;
- 15 settled by floor-plan evidence per zone.

The 71 are reached by reading options from evidence bound through tag lists
and ranges ("AHU-4, AHU-5 & AHU-8"; "EF-1 THRU EF-3"), schedule
cross-references (040's CONTROL column "FAN-A" names detail
"…AHU INTERLOCK - FAN-A") and family-level typical details. No single-unit I/O
count is needed.

**Numbers:** the sheet graph binds 18 of the 71 to their governing schematic
today; 2 are printed but unbound; 18 match only a family word in a title; 33
have nothing, because the title forms, lists, ranges and cross-references
above are not recognized. Every one of the 71 is in a vector text layer.

**Status:** AS-19's statement "the control drawings cannot close it here"
should read "an I/O-count match on the control drawings cannot close it
here". The lever is a deterministic control-evidence map plus
closed-question reading with cross-checked evidence. That is proposed as
`goals/CONTROL_INTENT.md` and awaits the owner's decision. Nothing in this
goal's code changes. The 11 schedule-printed rows are this goal's normalizer
queue:
- 031's SPEED CONTROL column;
- 031's 'NOT USED' row;
- 031's fan rows whose SERVICE is another scheduled unit;
- itd-d1-lab's heater remark "NOT CONTROLLED BY DDC";
- 12_MT's schedule note 2 (modulating valve);
- bldg5406 AHU-1 (AS-16).

040 EF-1A also prints "BACKDRAFT DAMPER TYPE: MOTORIZED" on its own row.

## AS-25 — starter defaults the dev keys contradict, most with no source (OPEN — for the library review, INPUT 4)

**Found:** 2026-09-26. On held-out, the options no reader settles keep the library's default (GATE C: 41 options
"nothing read"), so a default the documents usually contradict costs wherever the drawings are not read. The dev
keys (11 documents) were compared with each starter default, instance by instance:

| typical | option | default | dev keys agree / disagree | documents that disagree | the default's source |
|---|---|---|---|---|---|
| fan-constant | motorized_damper | false | 1 / 14 | 040, bldg5406, federal-mech, itd-d1-lab | none |
| unit-heater | modulating_valve | false | 0 / 8 | 040, 12_MT | none |
| vav-reheat-hw | co2_sensor | false | 43 / 15 | federal-mech | zone devices, per zone |
| fan-variable | motorized_damper, pressure_control | false | 0 / 3 each | 040, itd-d1-lab | none |
| ahu-single-zone | duct_smoke_detectors, freezestat_to_bas, setpoint_adjust | true | 0 / 3 each | 094_FL | UFGS 23 09 93 |
| chiller | chw_isolation_valve | true | 0 / 2 | bldg5406, federal-mech | G36, UFGS 23 09 00 |

**Reading:** two defaults have neither a source nor the documents behind them:
- A constant-speed exhaust fan's motorized damper is keyed in 14 of 15 dev fans, in 4 of the 11 documents.
  ASHRAE 90.1 §6.4.3.4 (ventilation system controls) requires motorized shutoff dampers on outdoor-air intakes
  and exhausts, but allows gravity dampers in buildings under three stories, in the warmest climate zones (0 to
  3), and on small systems. A document's building decides it, so a default needs the project question, not a
  flip.
- A unit heater's modulating valve is keyed in all 8 dev unit heaters with a valve, in 2 documents.

The others rest on one document each, or on a cited standard that document departs from.

**Status:** not changed here. The starter library's content is the reviewers' (INPUT 4: a controls integrator and a
mechanical contractor), and a default changes every project's lines. Changing a default from dev evidence and then
reading the held-out result would tune on held-out. This entry is the evidence for that review: the table above,
reproducible from `keys/*.typicals.csv` and `web/src/lib/assemblies/starter/us-typicals-v1.json`.

---

## AS-26 — two held-out key rows were printed while looking up a transcription convention (PROCESS NOTE, disclosed)

**Found:** 2026-09-26, while starting the second tier's dev keys (AS-17). To see how an existing key types a
voltage/phase cell split into two attributes, a `grep` over `reports/assemblies/key-work/` picked the first file
matching "V/PH/HZ: volts part" and printed its grid. That file is `024_MO`'s transcription, a held-out document: two
rows of its RTU schedule key (RTU-1 and RTU-2, every typed cell) were printed. Nothing else of any held-out key was
read, and no code has changed since.

**Consequences:**
- The next held-out GATE 2 is reported twice: over all six held-out documents, and over the five without `024_MO`.
  The attribute rules grown from here on (AS-17) must each come from a dev or dev-2 miss with a test on its own shape;
  none may cite the format of those two rows.
- **Guard:** key-work lookups read dev transcriptions only (the dev sets of `01-split.json` and `tier2/01-split.json`);
  a search over the folder names its files explicitly, never `*.transcription.txt`.

---

## AS-27 — a status-marked key tag ("(E)ATU A") cannot be paired with the compile's unmarked item ("ATU A"): 20 dev-2 instances, 173 printed values (OPEN — a scorer question for the owner; the key and the scorer stay as frozen)

**Found:** 2026-09-26, the first dev-2 attribute eval (AS-17).

**Evidence:** the keys type the tag cell as printed (key-work/README.md). Three dev-2 documents print a status mark
with the mark: 03_FL's AIR TERMINAL UNIT SCHEDULE prints "(E)ATU A" through "(E)ATU H" and "(N)ATU I" through
"(N)ATU N"; 063_MT prints "(E) VAV-105", "(E) VAV-106" and "(E) EF- 4"; 088_AZ prints "(E) CH-3" and "(E) CT-1". The
sheet graph keeps the printed text (the row's MARK cell is "(E)ATU A"), and the compile's tag drops the mark ("ATU
A"), as the tag reconciliation does for plan marks. The scorer pairs a key instance with a compile item by tag, with
case, whitespace and dashes ignored (`assemblies-attr-eval.mjs` `canonTag`, `matchItem`); a status mark is none of
those, so the 20 instances pair with nothing and all 173 of their printed values score missed. Dev 1 has no such tag
("B-1(E)" in 069_ID keeps its mark in the compile too).

**Measured, as a diagnostic only** (`mcp/scripts/assemblies-status-mark-diagnostic.mjs --dev2`; it changes no
score): with the mark
removed from those key tags, where the base tag is unique in its table, all 20 instances pair, and 173 of their 173
printed values are exact (0 wrong). The official dev-2 number stays as scored.

**Why it is not changed here:** "never improve a score by changing a key or a scorer" (AGENTS.md, coordinator policy
7), and a key is never edited after the pipeline ran on its sheet (key-work/README.md). The values are right in the
product (ATU A carries them), so the gap is the instrument's, not the normalizer's; but both remedies are exactly the
kind of change that rule reserves for the owner.

**Proposed (for the owner's decision):** a third tag equivalence in `matchItem`, after exact and dashless: a key tag
with a printed status mark ("(E)", "(N)", "(R)", "(D)", "(X)", "(EX)", "(NEW)", "(EXIST)", "(EXISTING)") before or
after it pairs with the item of its base tag, only where no other key instance in the table shares that base tag
and exactly one item has it, reported as `how: "tag without its status mark"`. It would be applied to every side
alike, before held-out 2 is keyed, with the before and after numbers reported.

**Also:** the printed status is itself worth carrying. An existing unit is not bought new, and "(E)" / "(N)" is on
the page (the row's MARK cell). A normalizer attribute for it (existing or new) needs a key column first; recorded
here, not built.

---

## AS-28 — the unseen corpus's unread columns: printed attributes under headers the rules did not know (FIXED for the shapes below — this goal)

**Found:** 2026-09-26, after GATE 2 at the freeze (AS-17), by a census of the
columns the frozen normalizer leaves unread on the 65 unseen documents (the
unseen audit's eligible sets: no dev, held-out, held-out 2 or withheld
document, none by their drafters, no twin). Of 11,152 non-empty cells in
their compile items, 8,333 sit in columns no attribute is ever read from;
most name nothing the schema keeps (manufacturer, model, weights, sound,
air-side temperatures, electrical protection). In the keyed families, 1,553
column kinds are never read: 1,097 under headers the rules do not recognize,
456 recognized but deliberately not chosen (a sensible capacity, a motor's
RPM beside the fan's, a LOCATION naming no level).

**Why it matters:** held-out 2 (56.4%) says the rules carry to a new
drafter's sheets at about half their dev rate. No rule may come from
held-out numbers, and dev and dev 2 are already read; the unseen corpus is
where new drafters' spellings can be studied honestly.

**The evidence class (new):** a rule may come from an unseen document's
column when it has a unit test on that document's shape and every value it
adds on the unseen corpus is read against its printed cell. The list below
was taken whole from the census (the attribute-like headers, by how many
documents print them), not from memory: held-out 2 was keyed from renders by
the same author, so no rule here is for a shape only held-out 2 prints.

**Fixed (each with a test that fails on the frozen normalizer):**
- A water side's "PRESS. DROP" is its pressure drop (028_TX's fan coils and
  DOAS); an AIR SIDE's never.
- "PIPE DIA(METER)" is a connection size, as PIPE SIZE is (096_IN's VAV
  reheat coils, 016_NY's fin tube); a drain pipe is not.
- A bare "ELEC" column printing "208/3", and "VOLTS PHASE HERTZ" printing
  "460/3/60", are the power connection (071_ME's VAV boxes, 096_IN's
  chillers).
- "REHEAT HW / ELEC / STEAM / NONE" columns marked YES name the reheat
  (05_MO; the value was already read, now by its own column).
- "… SERVES" and "LOCATION / SPACES / UNIT / FAN COIL(S) SERVED" name the
  place or unit served (089_FL, 077_MT, 083_MA, 016_NY); "SERVED BY" does
  not.
- "SYSTEM SERVED" and "FAN SERVICE" are the unit's service (016_NY's pumps,
  096_IN's fans).
- "MOTOR VSC" and "VARIABLE SPEED" name the drive (096_IN, 014_MT).
- An evaporator's and a circulating fluid's ENTERING / LEAVING temperatures
  are its water's (012_MO's chillers, 096_IN's cooling coils); a condenser's
  and an air side's are not.
- A BACnet accessory marked YES is the BAS interface (096_IN's chillers).
- A capacity cell that prints its own "BTU" is BTU/H (011_IL's heat pumps).
- A DESIGN head outranks a MAX or SHUT OFF head, the curve's end (096_IN's
  pumps; the two printed apart had left the head unknown).
- A DIRECT DRIVE or BELT DRIVE column marked YES (or X) names the drive; NO
  names none (096_IN, 009_FL).
- A cell that points elsewhere ("SEE PLANS", "REFER TO PLANS", "TBD") is no
  area served: two such values read before (016_NY, 28_WA) are gone.

**Measured:**
- Unseen: 189 of 872 compile items change; every changed value was read
  against its printed cell: 58 VAV reheat connections, 25 areas served, 22
  voltages and phases, 16 drives, 15 heat pump capacities, 28 water pressure
  drops, 14 evaporator and coil water temperatures, 10 pump heads, 10 VFDs,
  5 services, 2 BAS interfaces, 1 fin tube connection; 12 reheats and 2 VFDs
  keep their value under their own column's rule; 2 pointers are removed.
  One area served is a make, as printed ("SWEGON" under FAN COIL(S) SERVED).
- Dev and dev 2: 0 of 833 compile items change; the attribute eval prints
  the frozen reports' lines (1,965 of 2,053; 1,259 of 1,451; 0 invented).
- The schema's `pipes` now cites the key that prints it (092_IL's TABLE
  TITLE): GATE 1's schema test checks that an attribute with no example is
  printed in no key, and held-out 2's keys print it.

**Next:** held-out and held-out 2 are measured again only at the next freeze,
after the third dev tier (AS-17).

## AS-29 — the third dev tier's misses: rules its drafters taught, and the ceilings they show (FIXED for the shapes below; OPEN for the ceilings — this goal)

**Found:** 2026-09-26, measuring the frozen normalizer cold on dev 3
(tier3/01-split.json, seed 20260927: 9 documents, 32 claimed tables, 165
instances, 1,377 printed values), keyed from renders before the pipeline ran
on any of its sheets. Cold (02-attr-eval-dev3-cold.md): 1,150 of 1,377 exact
(83.5%), 5 wrong (0.4%), 222 missed, 24 invented.

**Fixed (each from a dev-3 miss, with a unit test on its own shape):**

The notes reader (scheduleNotes.ts):
- A motor rated for a drive ("VFD RATED MOTOR", "VARIABLE FREQUENCY DRIVE
  RATED MOTOR", "INVERTER DUTY MOTOR") is built to run on one; alone it does
  not say a drive runs the unit (012_MO's pumps: 13 invented vfd gone).
  Beside a note calling the fan variable speed it does: 004_MO's notes 1 and 2
  are now read together, its value unchanged.
- EC motors or VFDs offered as alternatives ("PROVIDE FANS WITH EC MOTORS
  (MOTOR MOUNTED) OR VARIABLE FREQUENCY DRIVES") state neither; the row's own
  REMARKS ("… W/ VFD", "… W/ ECM") decides, and rules out the other (25_WA's
  relief fans: 2 wrong fixed).
- A central controller the units connect to ("PROVIDE AND CONNECT ALL INDOOR
  UNITS TO A CENTRAL AE - 200A CONTROLLER") is their interface, the model's
  hyphen closed (093_ME: 23 values).
- BACnet spelled BACKNET is BACnet (096_IN's AHU index, note 4).
- A note's N-SPEED motor or fan names its speeds ("PROVIDE 3-SPEED EC MOTOR",
  096_IN's fan coils); a speed controller and a compressor's are no count.
- A control list's last two items joined by AND keep only the control device
  ("INTEGRAL FAN SPEED CONTROLLER AND BIRD SCREEN", 008_MO: 1 wrong fixed); two
  devices stay joined ("TWO SPEED FAN AND WALL MOUNTED THERMOSTAT").
- An unlabeled numbered list at a table's left edge, inside its region or
  just past its last row, is the table's notes (096_IN prints "1. …", "2. …"
  with no NOTES label over its AHU index and fan coils). It is one column
  counting up from 1, and it ends at a gap wider than a wrapped line's, at a
  line that starts away from its edge or is set in cells (a table's title,
  header or row beside or below it), and at a number out of turn.
- A note's outdoor air share is never a mode's ("100% OUTDOOR AIR EMERGENCY
  EPIDEMIC MODE", which the unseen A/B found on 01_NY).

The columns (normalize.ts):
- A chiller's or tower's capacity printed with no unit is tons where the
  unit's own water flow and range carry that many: 012_MO's NET CAPACITY 300.0
  beside 598.5 GPM x 12 F / 24, its tower's NOMINAL CAPACITY 300 beside 900
  GPM x 10 F / 30 (nominal tons at 3 GPM a ton).
- A coil schedule's count of coils is the coils under the mark (017_MD's COIL
  DATA QUANTITY, 096_IN's # OF COILS); a coil's SERVICE naming only units is
  the unit it sits in, no area served (017_MD: 6 invented gone).
- A steam-to-steam or gas-fired humidifier's KW is its controls' (017_MD: 1
  invented gone); a MAXIMUM steam capacity ranks below the design one.
- CFM's letters set apart by the text layer ("HEATC FM") are one word (071_ME:
  20 VAV heating airflows).
- A MOTOR TYPE names an EC motor (or a PSC one, not EC); a controller printed
  with who furnishes it ("ECM - FAN MFR") is that controller (071_ME).
- A heat recovery section's SUMMER / WINTER PERFORMANCE airflows rank below
  the fans' own (083_MA's ERV).
- A zone unit's SPACE / ROOM NAME is the area it serves, below an AREA SERVED
  column (093_ME: 20 indoor units).
- An "OA %" column is the outdoor air's share (096_IN's AHU index).
- A DX HEAT RECOVERY COIL printed "-" is neither a DX cooling coil nor "no
  energy recovery" (096_IN: 2 invented gone).
- A PLATE (AND FRAME) or SHELL AND TUBE title names the exchanger; outside air
  against exhaust air, with no water or steam side, is air on both sides,
  which the medium list does not name: "other" (096_IN).
- A boiler's capacity naming neither end, beside its INPUT, is its output
  where it does not exceed the input (096_IN's misspelt "DESIGN CAPAPACITY").
- A fluid cell names its glycol share wherever it prints it ("WATER 30%PG").
- "(2) 1/4" under HP is two motors of 1/4 hp, and the attribute is each
  motor's (096_IN's fan coils; "(2)@1.5" as 071_ME prints it); a BRAKE HP
  ranks below the motor's rating (25_WA).
- An airflow printed under CAPACITY ("200 CFM @ 0.5" ESP") is the unit's
  (25_WA's ERV); an electric heater's TYPE names its medium and its WATTS its
  heat (25_WA's ceiling and duct heaters); a bare CONTROL column names the
  control ("DUCT SP"), except a cell citing notes (014_MT's "1, 2, 5, 6").
- A DX fan coil printing a heating capacity and no water, gas or electric
  heat heats as a heat pump (083_MA).

**Measured:**
- Dev 3: 1,269 of 1,377 exact (92.2%), 3 wrong (0.2%), 105 missed, 2
  invented (02-attr-eval-dev3.md).
- Dev and dev 2: the frozen reports' lines (1,965 of 2,053; 1,259 of 1,451;
  0 invented). 7 of their 833 compile items change their rule only: 004_MO's
  rooftop units read vfd yes across notes 1 and 2, no longer from note 2 alone.
- Unseen, outside dev 3 (56 documents): 17 changes, each read against its
  printed cell: 11 areas served from 028_TX's ROOM column, 2 exchanger types
  from 061_IA's SHELL AND TUBE title, 1 chilled-water cooling from 05_MO's coil
  mark beside a DX coil printed "-", 1 BACnet MS/TP interface from 01_NY's
  humidifier note 2 (its notes now read), and 2 of 014_MT's fan controls that
  drop an item that is not a control ("… & SIDEWALL GRILLE BY FAN
  MANUFACTURER", "… AND DRAIN PAN"). Two rules the A/B first showed wrong were
  corrected before this measure: 014_MT's CONTROL column cites notes, and
  01_NY's epidemic mode is no outdoor air share; the unlabeled list's bounds
  were tightened on 01_NY's page, where it had run into the next table.
- Dev 3's unkeyed tables and rows: 13 changes, read by hand (017_MD's cooling
  coils: 6 host units gone from area served, 6 coil counts; 096_IN's KEF-1
  control without "SAFETY CABLE").
- The control-intent unseen audit, re-run because the rows' notes feed the
  binder and the row reader (`control-intent-unseen-audit.mjs --report`, every
  set but 058_CA, whose compile this container cannot hold): 56 eligible sets
  (dev 3's nine documents and 09_ME, a near copy of a dev-3 document, are
  withdrawn from the record), 29 read, 93 applied, all 93 audited right, 0 new,
  0 gone; 178 recorded calls replay, none missing. The 148 rows' notes change
  no applied decision.
- Two key-free sweeps over every cached compile (86 documents: dev, dev 2,
  dev 3 and the unseen corpus; 1,705 rows, 7,695 values, 16,760 expanded
  lines). Invariants: no apply throws; every value is its family's attribute,
  finite, in its enum, and cites its own row's printed cell, except by design
  (a pump's VFD cites the drive schedule's row; a split V/PH/HZ header is
  cited as its joined cells); no line quantity is negative or non-finite.
  Physics: water-side capacity against 0.5 × gpm × ΔT, coil and chiller
  temperature direction, VAV minimum against maximum, phase and voltage,
  boiler output against input, tons against MBH. Every flag read by hand is
  faithful to its print: 028_TX's fan coils print "HP 8.0" beside "MCA 0.63",
  044_NY prints 12,000 under "(MBH)" for a single-phase condensing unit,
  14_OR's DOAS prints a 46 → 50.9 °F coil with 11 GPM for 83.2 MBH, small
  reheat coils print their minimum GPM. No rule guesses past a printed unit.

**The ceilings (OPEN; every remaining dev-3 miss is outside the normalizer):**
- 071_ME's PACKAGED ROOF TOP UNIT SCHEDULE is compiled transposed (its items
  are tagged "2.25", "COOLING COIL", …; RTU-G, RTU-1 (ALT#2) and RTU-2 have no
  compile item): 38 values. The compile's loop owns it; transposing in the
  normalizer would fork schedule truth.
- 017_MD's SUPPLY FAN SCHEDULE reaches the compile with garbled headers ("OF
  DESIGN") and each row's cells merged into one ("20 16.68 460 DIRECT II 1
  FAN"): 42 values; the graph's loop.
- 096_IN's UNIT HEATER SCHEDULE's electrical block reaches the compile as
  seven columns under one garbled header ("ELECTRICAL DATA FUSED/ FACTORY
  NON-FUSE EMER. DISCONNECT D POWER", then "… 2" to "… 7"): the HP, volts and
  phase of five heaters, 15 values. Reading them by value alone would break
  LAW L1.
- 083_MA's ERV-2 reaches the compile with its exhaust fan, electrical and
  recovery-type headers renamed ("EXHAUST FAN DATA TYPE 2", "HEAT PUMP DATA
  ELECTRICAL DATA FILTER 7"): 4 values.
- 096_IN's diffuser and grille rows EG2 and EG3 are compiled as FAN items:
  their 2 airflows count invented against the page's rows-none FAN claim. The
  family is the compile's.
- Two keying conventions disagree. 094_FL (tier 1) keys a chiller's scheduled
  "Capacity Tons" over its "Nominal Tons", and the normalizer ranks them so;
  the dev-3 keys of 096_IN (NOMINAL CAPACITY 85 and 140 over DESIGN COOLING
  CAPACITY 77 and 134: 2 wrong) and 093_ME (COOLING and HEATING CAPACITY over
  CORRECTED: 6 missed) took the nominal. The keys are frozen (keyed before the
  pipeline ran on their sheets); the normalizer keeps the tier-1 convention,
  and no rule chooses between a rated and a corrected MBH.
- 096_IN's key types note 4's "BACKNET" as printed; the normalizer reports
  the protocol as every other BACnet key does, "BACNET": 1 wrong.

**GATE 2 at the freeze after dev 3 (f904c57; aggregates only, nothing tuned
on them):** held-out 897 of 1,008 exact (89.0%, from 88.6% at the last
freeze), 0 wrong, 2 invented; held-out 2 302 of 472 exact (64.0%, from
56.4%), 1 wrong (0.2%), 2 invented. Both still fail on exact and invented.
The gain is AS-28's and AS-29's rules together: held-out 2 was last measured
before either, and neither was taken from its rows.

## AS-30 — the fourth dev tier's misses: rules its drafters taught, and the ceilings they show (FIXED for the shapes below; OPEN for the ceilings — this goal)

**Found:** 2026-09-26, measuring the frozen normalizer cold on dev 4
(tier4/01-split.json, seed 20260928: 10 documents, 34 drawn tables, 154
instances, 1,421 printed values), keyed from renders before the pipeline ran
on any of its sheets (71e0e5a). Cold (02-attr-eval-dev4-cold.md): 934 of
1,421 exact (65.7%), 13 wrong (0.9%), 474 missed, 3 invented; 128 of the 154
key instances have a compile item.

**Fixed (each from a dev-4 miss, with a unit test on its own shape):**

The notes reader (scheduleNotes.ts, and apply.ts, which now passes it the
sheet's other tables):
- A label that names its table and ends in a colon ("NOTES FOR AIR HANDLING
  UNIT:") is a notes label (01_NY: the AHU's 11 notes and the VAV's 2, none
  read before).
- The next table's notes beside these (its "NOTES FOR STEAM HUMIDIFIERS:",
  an AHU schedule's NOTES: to the right) end the block's width, never the
  notes, and are never read as their continuation: a second list continues
  the first only in the first label's column, naming no other table.
  federal-mech's chiller no longer takes the boiler's note 2; 009_FL's valve
  schedule reads its own note 2, no longer the AHU's notes 2 and 3.
- An accessories legend under the notes ("ACCESSORIES: 1) BACKDRAFT DAMPER
  2) THERMOSTAT …", the numbers the rows cite) ends them; one beside them
  ends the block's width. 089_FL's fans read note 1 alone (their control was
  2 wrong from the legend and the heaters' REMARKS); 077_MT's REMARKS: 1-4
  beside its ACCESSORIES: 1-6 are read, none before.
- The sheet's other tables (the sheet graph's regions) bound the block: one
  under the notes ends them, one beside them ends their width. 14_OR's
  chiller no longer runs into the boiler's title, header and notes 6-7, nor
  its DOAS note 5 into the chiller's header and row. A region that nests in
  or repeats the table's own (089_FL's fans and heaters, compiled merged) is
  no other table.
- A NOTES column header of a table under the notes (no colon, on a line of
  short header words that runs from the label's column) ends them, and its
  line is no note text: 14_OR's boiler note 7 and 05_MO's pumps and
  condensing units lose "MARK …".
- Formulaic notes: "4-PIPE CONFIGURATION." is the fan coils' piping (028_TX,
  one count only); "STANDBY PUMP" is the pump's role (033_MN; a spare to
  furnish is none) and "N+1 PUMPS." duty and standby (067_CA); an AHU
  humidifier the note provides or refers to (01_NY; never one it lacks, a
  future one, or provisions for one); "TWO SUPPLY FANS" (01_NY); "PROVIDE
  UNIT AT 460V/3PH." (01_NY: a sentence about the unit and no other device,
  one voltage and phase pair marked as power).

The columns (normalize.ts):
- CLNG and HTNG are COOLING and HEATING, TMBH a TOTAL MBH (089_FL's heat
  pumps; 017_MD's cooling coils, dev 3, unkeyed).
- A refrigerant's HOT GAS is no gas firing, and a hot gas reheat coil with a
  value is the unit's own DX circuit (22_GA's DOAS cools by DX; 089_FL's
  DOAS read "gas": 1 wrong fixed).
- A dedicated outdoor air unit's TOTAL OUTSIDE AIR, neither MIN nor MAX, is
  its supply airflow, never a minimum (089_FL: 1 invented gone).
- A heating capacity rated at 47 °F is a heat pump's; an electric coil named
  AUX, SUPPLEMENTAL, BACK-UP or EMERGENCY is not the unit's heat; "KW /
  STEPS" printing "13 / 1" is 13 kW (089_FL's DOAS).
- A VRF schedule's HEAT PUMP UNIT columns are the outdoor unit's, never its
  air handler's (089_FL's AC-1: 208 V, 1 phase; 2 wrong fixed).
- A steam preheat coil's STEAM LB/HR is steam heat (01_NY); a humidifier
  section's steam flow and pressure are the humidifier's, never the unit's
  (033_MN's AHU-6: 2 invented gone).
- A heating coil's flow and water pressure drop are a hot water coil block
  (028_TX's DOAS).
- "HP (BHP)" printing "5 (4.1)" is the 5 hp motor (01_NY); "2x2" is two 2 hp
  motors (22_GA); an AFTER FILTER is the final filter (01_NY's MERV-14).
- A firing range's MIN. end ranks below its MAX. (028_TX's boiler); an
  exchanger's DESIGN capacity over its MAX, and a DESIGN flow over a
  SELECTION or MAX one (067_CA).
- A GAS TYPE column naming a gas is a gas-fired heater (028_TX's unit
  heaters).
- A head printed in feet and psi ("(FT WG/PSI)" = "277/120") is the feet, the
  pair checked at 2.31 ft a psi (067_CA's pumps).
- HIGH and LOW TEMP (WATER) SIDE are an exchanger's hot and cold sides, and
  LOW there is no minimum; each side's FLUID names its medium ("CHW"; a
  process loop's "PCW" is one the list does not name); a plate count is a
  plate exchanger's, never a unit count (067_CA).
- A PHASE column printing a V/PH pair ("115/1": its header's VOLT/ lost) is
  the phase and, below a VOLTS column's, the voltage (089_FL's fans). A
  voltage range ("208-230V 1ph") is no one voltage, though its phase is one
  (028_TX's fan coils).
- A SPEED CONTROL's "3-STAGE" is the fan's speeds; a TWO-PIPE (or FOUR PIPE)
  title is the fan coils' piping, never a title of both kinds (030_NY).
- A table of outdoor units alone (no indoor half in its row, its columns or
  its title) prints the unit's own airflow (030_NY's CRAC condensing units).
- An EXHAUST terminal title is an exhaust terminal (26_CA: 7 wrong fixed); a
  TYPICAL FLOORS cell naming one level is the unit's floor, several are not
  one.
- An air-to-air exchanger's exhaust stream may print as EXHAUST ENTERING
  (030_NY's DOAS heat exchanger).

**Measured:**
- Dev 4: 1,020 of 1,421 exact (71.8%), 1 wrong (0.1%), 400 missed, 0
  invented (02-attr-eval-dev4.md).
- Dev, dev 2 and dev 3: the frozen reports' lines (1,965 of 2,053; 1,259 of
  1,451; 1,269 of 1,377).
- Outside dev 4, 12 values change over the 86 cached documents, each read
  against its print: 017_MD's six cooling coils' TOTAL COOLING CAPACITY
  (TMBH) (dev 3, unkeyed: 826 MBH beside 110 GPM over a 15 °F range) and
  05_MO's six COOLING ONLY TWO PIPE fan coils' piping (unseen).
- The notes reader changes 13 of the 397 cached tables, each read against
  the page: the ones above, and 014_MT's condensing units (unseen), whose
  rows print ADDITIONAL DETAILS "SEE BELOW" over four headed lists. The
  unlabeled list at the table's left edge is now its accessories list, which
  the block reads to its end; before, one pixel of height had put the
  controls list's first number first.
- The control-intent readings of the eleven dev documents, replayed from
  their recorded runs, are identical decision by decision; the unseen audit
  replays with 0 new and 0 gone (20 sets read, 68 applied), no recorded call
  missing.
- The key-free sweeps over the 86 cached documents: the same 12 flags as at
  dev 3 (each by design, AS-29); 85 more values; 23 fewer expanded lines, as
  028_TX's gas unit heaters and hot-water DOAS no longer carry both heat
  options.

**The ceilings (OPEN; every remaining dev-4 miss is outside the
normalizer):**
- 368 of the 400 missed values have no compile item: 028_TX's CHILLED WATER
  FAN COIL UNIT SCHEDULE compiles 11 of its 23 rows (the FCC rows, 204
  values), 030_NY's TWO-PIPE FAN COIL UNIT SCHEDULE 1 of 14 (156 values),
  089_FL's FAN SCHEDULE 2 of 3 fans (IF-1, 8 values). The rows are the
  compile's loop's.
- 089_FL's FAN SCHEDULE is compiled merged with the ELECTRIC UNIT HEATER
  SCHEDULE beside it (EF-1's CFM cell reads "/ 10"): 8 values.
- 033_MN AHU-6's fan, DX coil and electrical sub-headers reach the compile
  as "SUPPLY FAN NUMBER OF FANS 2" to "… 10": 9 values; reading them by
  value alone would break LAW L1.
- 030_NY's condensate pumps' OPERATING POINT @10' WC (GPM) reaches the
  compile as "WC (GPM)", the head it rates the flow at lost: 14 values.
- 01_NY prints AHU-1 twice, in epidemic mode (note 3) and normal mode (note
  4); the compile keeps the first row, the key the normal mode's minimum
  outdoor air: 1 wrong.

**GATE 2 at the freeze after dev 4 (1847736; aggregates only, nothing tuned
on them):** held-out 897 of 1,008 exact (89.0%, unchanged; the report
differs from the last freeze's only in its date and code hashes), 0 wrong,
2 invented; held-out 2 334 of 472 exact (70.8%, from 64.0%), 1 wrong
(0.2%), 2 invented. Both still fail on exact and invented. No rule was taken
from either's rows, and only these aggregates were read.

## AS-31 — the fifth dev tier's misses: rules its drafters taught, and the ceilings they show (FIXED for the shapes below; OPEN for the ceilings — this goal)

**Found:** 2026-09-27, measuring the frozen normalizer cold on dev 5
(tier5/01-split.json, seed 20260929: 11 documents, 38 drawn tables, 86
instances, 561 printed values), keyed from renders before the pipeline ran
on any of its sheets (b407614). Cold (02-attr-eval-dev5-cold.md): 412 of
561 exact (73.4%), 1 wrong (0.2%), 148 missed, 2 invented; 78 of the 86 key
instances have a compile item. Two drawn tables are not their stratum's
family, keyed "rows: none" and scored for inventions only: 016_NY's PP-4
panelboard (E-602, claimed as FCU) and 23_GA's architectural SPECIALTY
EQUIPMENT SCHEDULE (A1-2, claimed as ERV).

**Fixed (each from a dev-5 miss, with a unit test on its own shape):**

The notes reader (scheduleNotes.ts):
- An unlabeled list numbered "(1)", "(2)" is a list as "1." is, and a line
  above its note 1 (the table's last row, printed a line over the notes) is
  no part of it and no longer ends it (016_NY: the air handler's notes 1-3,
  the condensing unit's 1-4 and the fin tube's 1-2, none read before).
- Formulaic notes: a humidifier's dispersion tubes or manifold ("FACTORY
  PROVIDED HUMIDIFIER DISPERSION TUBES", 061_IA's AHU-A); a coil's entering
  water ("CAPACITY BASED ON 42 DEG. F. ENTERING WATER TEMPERATURE", 061_IA's
  fan coil): chilled at 60 °F or below, heating at 100 °F or above, one of
  each, read only where the row prints that coil's water.
- A note the row's REMARKS cite that provides the unit's starter and nothing
  else, a disconnect beside it or not ("PROVIDE WITH UNIT MOUNTED STARTER AND
  DISCONNECT."), starts the unit across the line, on no VFD (016_NY's
  AHU-1): the REMARKS-prose rule of 03_FL, for a note the row cites. A table
  note no row cites may be another motor's, and stays unread for it.

The columns (normalize.ts):
- LBS/H is LB/HR; a text layer's "PHAS E" is PHASE; a cell printing feet of
  water with H2O ("16.0 ftH2O") is one number in feet (06_MO's sink pump).
- A POWER CONNECTION's MCA, MOCP, FLA or volts is electrical, never a pipe
  (28_WA's heat pump: 1 invented gone); a QUANTITY under a section, blender,
  louver or damper counts that part, never the units (061_IA's AIR BLENDER
  SECTION: 1 invented gone).
- A louver's airflow (an air handler's ECONOMIZER, RELIEF or MINIMUM
  VENTILATION LOUVER) is the louver's rating, never the unit's supply,
  outdoor or return airflow (061_IA's AHU-A); an economizer louver, damper
  or airflow scheduled with a size is an airside economizer; a HEAT RECOVERY
  COIL (a coil loop's, never a refrigerant circuit's) is a runaround loop.
- OUTDOOR AIRFLOW is outdoor air for a unit with an outdoor air minimum; a
  HEATING TYPE (SOURCE, MEDIUM) column naming the heat ("NAT. GAS") is the
  unit's heat; a packaged rooftop unit printing a cooling capacity and no
  water at all cools by DX (06_MO's ACU-6).
- A cooling coil's water flow alone (COOLING COIL GPM) is a chilled-water
  coil's, never an evaporative cooler's (009_FL's AHUs).
- A kW or W capacity in a table of electric heaters (an electric heater's
  row, or a title naming electric heat: ELECTRIC DUCT HEATER, ELECTRIC
  RADIANT CEILING PANEL) is its electric heat (06_MO's EDH-1, 24_IA's
  ECP-1), as heat in watts is ("AUXILIARY HEAT (WATT)", 28_WA's heat pump).
- A terminal's DESCRIPTION naming its type; a single-duct terminal's size
  number ("04") is its nominal inlet diameter (never a fan-powered box's
  cabinet size); a table's one airflow column is the box's design maximum;
  "24" under a terminal's VOLTAGE is its controls' 24 V; its electric heat
  printed N/A, with no water or other heat printed, is no reheat (06_MO's
  nine VAV boxes).
- An ELECTRICAL (breaker) POLES count is the supply's phase, one or two
  poles single phase and three three-phase, below a PHASE column and never a
  motor's poles (06_MO's sink pump).
- A shell and tube exchanger whose one side's FLUID is STEAM: that side is
  its primary, the other its secondary; steam heating plain WATER that
  leaves warmer is heating hot water, never where the table names domestic
  water (061_IA's HX-A-1 and HX-A-2: 12 values).
- A motor type printed where its size goes ("PSC" under MOTOR (HP), 061_IA's
  fan coil) or with a speed word ("MODULATING ECM", 24_IA's fan coils) says
  whether it is an EC motor.
- A DISCONNECT (SWITCH, FUSE) column naming the drive ("VFD", "VFD 60A3P
  LOCAL …", "BREAKER IN VFD", "VFD WITH INTEGRAL DISCONNECT") is a VFD
  (061_IA's ten supply and return fans; 043_FL's pumps, whose rows reach
  the compile as HWP1-2 and CWP9-10).
- An INTERLOCK WITH column is how the unit is controlled ("INTERLOCK WITH
  MOTORIZED DAMPER", 28_WA's fans); WATER at a temperature ("WATER @ 120°F")
  is plain water (061_IA's pumps); a water's SUPPLY/RETURN in inches is its
  pipe size (24_IA's fan coils).
- An EC MOTOR box left blank in an ACCESSORIES group whose other boxes the
  row checks is no EC motor (009_FL's new fans; the existing fans, which
  check nothing, stay unknown). It is the one value read from a blank: the
  box is printed, every mark the row prints in the group is a check mark,
  and the value's printed text is empty by design.

**Measured:**
- Dev 5: 499 of 561 exact (88.9%), 1 wrong (0.2%), 61 missed, 0 invented,
  scored on the cached compile snapshots (the extraction is unchanged).
- Dev, dev 2, dev 3 and dev 4: unchanged, value for value.
- Outside dev 5, 12 values change over the 86 cached documents, each read
  against its print: 05_MO's twelve ATU-6 single-duct terminals (dev 2,
  unkeyed), whose SIZE prints 6" or 8", now their inlet sizes.
- The notes reader changes 3 of the 397 cached tables, each read against
  the page: 016_NY's three lists above.
- The control-intent readings of the dev documents replay identically,
  decision by decision; the unseen audit's replay is identical to the
  baseline's, line for line.
- The key-free sweeps over the 86 cached documents: the same 12 flags as at
  dev 4; 100 more values and 158 more expanded lines.

**The ceilings (OPEN; every remaining dev-5 miss is outside the
normalizer's rules):**
- 8 key instances have no compile item (40 values): 032_PA's pumps P-A and
  P-B reach the compile as "NP A" and "NP B"; 043_FL prints two pumps to a
  row as HWP1-2 and CWP9-10; 061_IA's EF-2 and EF-3 on E601's EQUIPMENT
  SCHEDULE are not compiled. The rows are the compile's loop's.
- 23_GA's fan coil schedule's headers reach the compile garbled ("OA
  MODEL", "OA SUPPLY", "AUX. HTG."): 7 values.
- 061_IA's air handler continues in a second table ("… (CONT.)") that the
  compile does not claim: its supply fan's HP and quantity and its final
  filter (3 missed), and 1 wrong, the return fan's 460 V read as the unit's
  where the continuation prints the supply fan's 480 V. (FIXED by AS-32.)
- 28_WA's STARTER BY E.C. checks are drawn marks the text layer does not
  carry: 3 values.
- Readings the row does not state: 06_MO's VRF ceiling cassettes cool by DX
  and heat as heat pumps by their basis of design (6 values); 097_UT's unit
  heaters' DUTY names the chemical room they serve (2 values).

**Process note (AS-26's kind, disclosed):** on 2026-09-26, while looking up
the schedule-parts transcription format, a grep over keys/*.csv and
key-work/*.transcription.txt printed four header lines of two held-out keys
(018_GA's and navfac's schedule-part render lines: titles, row counts and
crops; no attribute value). No rule uses them; the format was taken from
the eval script's own parser. Key-work lookups now name the dev files
explicitly.

## AS-32 — a schedule continued in a second table loses the unit's other columns (FIXED — this goal, the apply path)

**Found:** 2026-09-27, reading dev 5's misses (AS-31). 061_IA prints its air
handler's schedule in two tables on M601 (page 58): CUSTOM OUTDOOR AIR
HANDLING UNIT SCHEDULE, and below it CUSTOM AIR HANDLING UNIT SCHEDULE
(CONT.), which prints AHU-A's supply fans and final filter. The sheet graph
extracts both tables; the compile claims the first only, so the normalizer
never read the second: 3 missed values and 1 wrong (the return fan's 460 V
read as the unit's, where the continuation prints the supply fan's 480 V).
The key keys the continuation as the schedule's part 2 under its printed
title, which the scorer already scopes.

**Fixed (apply.ts, normalize.ts; extraction untouched):** a graph table
titled as a continuation ("… (CONT.)", "(CONTINUED)", "CONT'D", "-
CONTINUED") that the compile does not claim is kept when its title, less the
mark, shares its words with exactly one claimed table on the same sheet whose
rows hold every row it prints. The table context carries it, and the
normalizer reads the unit's one row there as its own columns, each value
cited to the continuation's title; a header the first table prints too stays
the first table's, and two lines for the unit, or none, add nothing. A
continuation is no "other table" for the first table's notes. Tests on both
halves (apply.test.ts, normalize.test.ts), with negative controls: a row the
claimed table lacks, a title sharing no words, another sheet.

**Measured:**
- Dev 5: 503 of 561 exact (89.7%), 0 wrong, 58 missed, 0 invented, on the
  cached snapshots (061_IA re-snapshotted through the new path: its items,
  pages, points lists and control packets are byte-identical, and one table
  is added) and in the official report at 8658a24 (02-attr-eval-dev5.md,
  every set compiled afresh).
- Of the 86 cached documents only 061_IA prints a continuation the rule
  keeps; 004_MO's KITCHEN HOOD SCHEDULE (CONT.) continues a table the compile
  does not claim, and is left out. The five changed values (AHU-A's volts 460
  → 480 and its phase's cite, six supply fans of 20 hp, a MERV 13 final
  filter) each match the print, and no row's notes change.
- Dev through dev 4 unchanged; control intent replays identically (its dev
  documents and the unseen audit); the key-free sweeps show the same 12
  flags and 3 more values.

**Addendum, an unseen census after AS-32 (AS-28's evidence class):** a
fresh census of the columns the normalizer leaves unread on the 31 eligible
unseen documents with a snapshot (the unseen audit's eligibility: 139 rows,
2,065 non-empty cells, 1,659 unread, nearly all manufacturers, models,
grilles, louvers and compressors, which the schema does not keep) found one
misread. A group named WATER FLOW DATA made its WPD (FT) column a second
water flow, so 077_MT's eight water-to-air heat pumps left their source
flow unknown. FLOW in a group's name is now no flow where the header names
a pressure drop, head, temperature or size of that water; the 8 source
flows each match the print, and no dev tier changes. The disagreeing
columns left on those documents are genuine: a heat pump's cooling and
heating modes enter at different temperatures, and a condensing unit's
compressor and condenser fan motors are two motors.

**GATE 2 at the freeze after dev 5 (8658a24; aggregates only, nothing tuned
on them):** held-out 897 of 1,008 exact (89.0%), 0 wrong, 2 invented;
held-out 2 334 of 472 exact (70.8%), 1 wrong (0.2%), 2 invented. Both are
exactly the dev-4 freeze's numbers, in every column the reports print; they
differ from its reports only in their date and code hash. Both still fail
on exact and invented. No rule was taken from either's rows, and only these
aggregates were read.

**Addendum, a metamorphic sweep after the freeze (robustness; no key read):**
every cached row (86 documents, 1,705 rows) normalized as printed, then
with its headers respelled in ways that change no word (lower case,
doubled spaces, a space around every slash, a slash closed up, a space just
inside parentheses) and its cells with thousands separators dropped; any
value that changed was a brittle rule. Two were: SERVICE under "SYSTEM AND
/ OR SERVICE" (031_MO, dev, prints it closed up: 19 fans' and pumps'
services lost when spaced), and AREA SERVED under "FAN COIL( S ) SERVED"
(083_MA, dev 3, a keyed table: 3 heat pumps; its commit, 75f2121, called
083_MA unseen, which it is not). The header's one spelling now closes the
space around a slash and just inside parentheses, and FAN COIL (S) SERVED
reads with a space before the plural too; the sweep now changes nothing
but one room list whose comma the cell variant itself removed (028_TX
"116,117"). A plural "(S)" is not folded into the word: 096_IN's AHU prints
FILTER(S) as a filter's tag (PF-4), not a MERV. No value on any cached
document changes (dev through dev 5, the unseen corpus); the invariant
sweep shows the same 12 flags; control intent replays identically. Test:
normalize.test.ts, "metamorphic sweep".

## AS-33 — 247 fans and pumps wait on a VFD answer: what the drawings print, and what they do not (FIXED for one shape; OPEN for the rest, with owners)

**Found:** 2026-09-27, by the application census over the 86 cached
documents (no key read): 1,963 controls applications, 700 resolved, 582
waiting, 675 for families with no controls typical. The largest wait is
attr.vfd (247 fans and pumps): the fan and pump typicals select on it alone
(fan-constant / fan-variable, pump-constant / pump-vfd). A census of every
waiting unit's own row, its cited notes, and every other table in the same
document's cached sheet graph that prints its tag
(scratch census3/vfd-evidence.mjs, vfd-notes.mjs) sorted them:

- **A control column that names the drive (fixed).** 096_IN's AHU SUPPLY FAN
  and AHU RETURN/EXHAUST FAN SCHEDULEs (dev 3, tables its key did not draw)
  print "VFD" under VARIABLE CONTROL TYPE on all 13 fans. The normalizer
  kept it as the fan's control text only; "VFD" there is a VFD whether or
  not the family keeps a control value, as a pump's SPEED CONTROL "VFD"
  already was (031_MO's key). Each of the 13 cells was read in the text
  layer at the header's x (page 19). Test: normalize.test.ts, "a control
  column that names the drive" (negative controls VARIABLE, CONSTANT, "VFD
  / ECM").
- **Not units (OPEN — owned by the compile; nothing changed here).** About
  80 of the 247 are compiled rows that are no unit: transposed schedules
  compiled one item per attribute row (071_ME's PACKAGED ROOF TOP UNIT
  SCHEDULE prints UNIT NO. | RTU-G | RTU-1 (ALT#2) | RTU-2 across and its
  attributes down: 42 items such as "2.25" and "COIL FACE VELOCITY FPM",
  and no rooftop unit; 21_VA's PUMP, FAN and AIR COOLED CONDENSING UNIT
  SCHEDULEs, whose units print as column heads "CHWP-1 AND CHWP-2" and
  "EF-2, EF-5, EF-7, EF-9"), and untitled tables that are not schedules
  (061_IA's structural SPECIAL INSPECTION notes SP1-SP5 as pumps and STEEL
  FRAMING NOTES SF1-SF10 as fans; 08_ME's sheet index P 101-P 103 as
  pumps; 19_CA's abbreviation legend SFD as a fan; 096_IN's grille sizes
  EG2, EG3 as fans). The assemblies view shows each as a unit waiting on
  answers no print gives, and a transposed schedule's real units get no
  assembly at all. Reading a transposed schedule, or refusing a notes
  table, is extraction's to decide (the shared compile), not the apply
  path's.
- **Printed, but not as a VFD yes or no (left unknown, on purpose).** A
  SPEED CONTROL of "VARIABLE" (044_NY's feedwater pumps, 031_MO's fans) may
  be a VFD or an EC motor; notes giving a fan a "SPEED CONTROLLER FOR AIR
  FLOW BALANCING" or "SOLID STATE SPEED CONTROL" (03_FL, 033_MN, 014_MT,
  bldg5406, 096_IN) describe a balancing controller, and the dev keys (03_FL,
  044_NY) key no vfd from either. An EC motor printed only in a note (004_MO
  EF-1) leaves vfd blank in its key too, and the library has no EC-motor
  fan typical, so reading "EC motor, so no VFD" would pick the constant
  fan's points for a fan that may take a speed signal: a question for the
  library review (INPUT 4), not a rule. 14_OR's circulators print MOTOR
  CONTROL "ECM" and cite a note "INTEGRATED VFD": a genuine conflict, left
  unknown (its key marks it "?").
- **In an electrical schedule (OPEN — proposed, not built).** Three real
  units have a decisive cell only in the electrical engineer's equipment
  schedule, which the compile does not claim: 033_MN AHU-6 (ELECTRICAL
  POWER MECHANICAL EQUIPMENT SCHEDULE, STARTER TYPE "VFD"), 014_MT SEF-A1
  (M.E.P. COORDINATION SCHEDULE, "VFD"; its other fans print "SC / MSS",
  which needs the sheet's legend) and 03_FL EF-1 (MECHANICAL EQUIPMENT
  ELECTRICAL SCHEDULE: "PROVIDE FVNR ENCLOSED MAGNETIC MOTOR STARTER").
  A reader for these (the unit's tag in an unclaimed electrical schedule,
  a starter or drive column, one row per tag) would decide 3 units here and
  score none (no key draws vfd from them); it is proposed for when the
  corpus shows more.
- The other ~130 print nothing about a drive anywhere in the graphed
  sheets: the estimator's answer, or the control drawings, decide them.

**Measured:** the 13 vfd values are the only change on any cached document
(dev through dev 5 and the unseen corpus, head vs working tree); no keyed
value moves; control intent replays identically; the invariant sweep's 12
flags are unchanged. The application census: 713 resolved (from 700), 569
waiting (from 582), attr.vfd 234 (from 247).

**Addendum, a model column mapper, tried and rejected (2026-09-27):** could a
model map the headers the rules do not know, so a new drafter's columns read
without a new rule? Tested on dev 5 as the normalizer stood before its rules
(b407614, the cold state): every header of each keyed table that read as no
quantity, with up to three of its cells and the family's vocabulary
(definitions, kinds, units), one request per table on the platform endpoint,
scored against the dev-5 keys' column maps (scratch colmap/exp1.mjs).
gpt-oss-120b mapped 4 columns right and mapped 18 the keys leave unmapped (15
of them "high" confidence): a coil's WATER EAT and ENTERING DB (air
temperatures) as water temperatures, FAN BHP and MOTOR BHP (brake
horsepower) as motor horsepower, a condensate drain as a pipe connection,
DESCRIPTION as a pump's service. qwen-3.8-27b mapped the same 4 right and 6
wrongly (4 "high"). Each wrong mapping would be an invented value; the
conventions the models miss are the ones the rules encode. Rejected; the
rules stay the way a new drafter's columns are read. Where the cold-state
losses are: of dev 5's 150, 40 are printed columns the rules did not know
(37 read since), 51 readings (39 read since) and 40 units the compile does
not make (none recoverable here); of dev 4's 474, 368 are units the compile
does not make (tag spellings the compile and the key read differently:
028_TX's FCC 1-1, 030_NY's 001-FCU-01-CG06A), which is extraction's.

**Addendum, what the control drawings print about a drive (2026-09-27; no
key read):** AS-33 left about 130 of these units to "the estimator's answer,
or the control drawings". The readers are never asked about a drive: they
answer a unit's role and its typical's options (CONTROL_INTENT decision C6),
not the vfd attribute its typical selects on. A census of the 234 units
waiting on attr.vfd across the 86 cached documents (scratch
census3/vfd-packets.mjs: each unit's bound control packets, and the lines
that print a drive term such as VFD, VARIABLE FREQUENCY DRIVE or SPEED
CONTROL, or a constant-speed or starter term) sorts them:
- **121 have no control packet bound at all.** Only the estimator can answer
  these.
- **6 have their own packet, by title, printing a drive.** itd-d1-lab AHU-1
  ("SUPPLY FAN(S) VFD FREQUENCY"), 009_FL AHU-1 ("AHU-1 CONTROLS": VFD) and
  EF-1 to EF-3 ("LAB EXHAUST FAN CONTROLS (EF-1, 2, & 3)": "THE VARIABLE
  FREQUENCY DRIVE (VFD) IN THE AUTO POSITION"), and 096_IN AHU-4 ("SUPPLY FAN
  SPEED CONTROL"). The two air handlers would still wait on terminals_served.
- **1 has its own packet printing a constant-speed term, and that reading is
  wrong.** 05_MO's AC-57 prints "EMERGENCY CONSTANT SPEED OPERATION … FANS
  SHALL THEN BE OPERATED AT A CONSTANT SPEED", an emergency mode of a VAV air
  handler, which has drives. A constant-speed phrase is no evidence of "no
  VFD".
- **32 are bound only to packets other units share that print a drive
  somewhere,** and never on a line or clause with the unit's tag. Only a
  reader of the drawing could say whose drive it is: 069_ID's vision runs
  cited "VFD SPEED" for a boiler pump that has none (CI-34).
- **74 are bound to packets that print nothing about a drive:** 14 are their
  own packets and 60 are shared.

A drive question for the readers would decide about 6 of the 234 on the
deterministic reader's evidence. Its "no" side has no safe phrase, and a
model's reading of a shared drawing is where CI-23 and CI-34's defenses
already reject evidence about other units. Not built. It is proposed for a
later batch, with the vision reader's proposed tiling of large drawings, which
would let a model read whose drive a shared drawing shows. The waiting units keep asking the estimator,
and the assemblies view shows each with what it waits on.

## AS-34 — the Takeoff panel on two more documents: packet ids kept the upload's hash name, and a model's copy of a glyph reached a cite (FIXED — this goal)

**Found:** 2026-09-27, running the UI proof (web/scripts/playwright-assemblies.mjs:
a real PDF through the dev server's /__ot/assemblies-project into Takeoff →
Assemblies, byte for byte against apply_assemblies over MCP) on two
documents it had not run on. 28_WA (dev 5; a heat pump schedule with QTY 43,
no control drawings) passed all 10 checks. 096_IN (dev 3; 24 control
packets) did not, for three reasons:

- **The proof's own recomputation left the readings out.** The panel
  applies the control drawings' readings the project carries
  (AssembliesPanel: project.control_readings); the proof's in-page
  applyAssemblies call predated control intent and passed none. Fixed in
  the script; it also saves the browser's records beside its lines, so a
  mismatch can be read.
- **Packet ids kept the upload's hash name (UI path).** The dev server
  spools an upload as <sha256>.pdf, and the browser puts the real name back
  (graphKeys.js) on every sheet key, but a control packet's id
  ("<sha>.pdf#36#p8", whose page marker is not the key's last part) was left:
  every reading's cite and the panel's "(control packet …)" label named a
  64-character hash beside a sheet named for the file. The boundary now
  remaps a packet id in a `packet` or `id` field when its sha is one the
  client uploaded; cell text is still never rewritten (tests in
  graphKeys.test.ts).
- **A model's copy of a glyph reached a cite (shared readers).** On one of
  two runs qwen-3.8-27b copied "BELOW 55° OAT" as "BELOW 55\u0000 OAT". The
  label still matches the print letter for letter, so it was verified, and
  its NUL characters were quoted into the cite (and so into the panel and
  the CSV set). A label carrying a control character now cites the printed
  text it was verified against; a clean label is cited as before, and no
  committed replay run holds such a label (readers.test.ts).

**Measured:** with the readings read by printed phrases on both surfaces
(OPENTAKEOFF_CONTROL_READINGS=deterministic), 096_IN passes all 10 checks:
243 records and 3,252 lines byte-identical to MCP, the CSV set and the
mechanical-scope set byte for byte, settings, keyboard, override, library,
themes at three widths, autosave and reload. Read by the models, the two
surfaces' records now carry no hash name, and every unit's decisions are the
same; 65 records differ only in which printed lines each of two live runs
quoted. That is two model runs, not two code paths: the dev server's CLI
keeps its runs per PDF set (~/.cache/opentakeoff-control-runs) and replays
them, while apply_assemblies keeps a Session's runs in memory, and a run's
hash covers the request, which names the file (a spooled hash name in the
browser's upload, the real name over MCP), so the two cannot replay each
other's runs today. OPEN (proposed): name-independent run hashes and one run
store per PDF set for both surfaces. The fan rule of AS-33 holds on the
product path: 096_IN's 13 AHU fans apply fan-variable over MCP and in the
panel.

**Process note (disclosed):** while checking whether any committed replay
run held a label with a NUL, one count ran over every control-intent runs
file, held-out ones included. It printed only the total (0); no run's
content was displayed. Later checks name dev and unseen files only.

**Addendum, a second metamorphic sweep (robustness; no key read):** the same
86 documents' 1,705 rows respelled the ways drafters actually vary a header,
a title or a cell without changing its meaning: HW / HOT WATER, CHW /
CHILLED WATER, TEMP. / TEMPERATURE, CAP. / CAPACITY, ENT. / ENTERING and
LVG. / LEAVING, a unit in parentheses, in square brackets or bare, °F / DEG F,
& / AND, HP / HORSEPOWER, VOLTS / VOLTAGE, a title with or without SCHEDULE,
208/3/60 / 208V/3PH/60HZ / 208-3-60, N/A / NA, - / --, 1/2 / 0.5 (scratch
census2/metamorphic2.mjs). 36 kinds of value changed. Each abbreviation below
is printed somewhere in the corpus with that one meaning (every CAP is a
capacity, "TANK CAP. (GAL)" and "KW CAP." included; every ENT, LVG and DEG F
is entering, leaving and Fahrenheit), so the header's one spelling now reads
CAP. as CAPACITY, ENT. and LVG. as ENTERING and LEAVING, DEG F (after a
digit too: "47DEG F") as F, HORSEPOWER as HP and BRAKE HORSEPOWER as BHP, and
a US unit in square brackets ("[IN]", "[BHP]", "[MBH]") as in parentheses.
Square brackets around an SI unit stay: they mark an SI twin ("[L/S]",
"[KW]", "[°C]") and SI_BRACKET reads the printed header. What the sweep had
found: VRF indoor units', heat pumps', chillers' and towers' capacities lost
under "CAP."; coils' and chillers' water temperatures lost under "ENT." /
"LVG." and "(DEG F)"; pipe sizes and a fan's horsepower lost, and a
furnace's two stages swapped, under "[IN]", "[BHP]" and "[MBH]"; and an
exclusion that went quiet: "TRAP CAP. LBS/HR" read as the exchanger's steam
flow, since the trap rule looked for CAPACITY. Left, as not what drafters
print: "&/OR" for "AND/OR", and units stripped of their parentheses ("SUPPLY/
RETURN IN"). On the documents as printed, 3 values change: 06_MO's (dev 5)
three DX fan coils read COOLING CAP. "11,400 Btu/h" as 11.4 MBH (22, 40), an
extension its key does not score ("COOLING CAP. => -"). Every tier scores
as before (dev 1965/2053, dev 2 1259/1451, dev 3 1269/1377, dev 4
1020/1421, dev 5 503/561); the invariant sweep, the first metamorphic sweep
and control intent's replays are unchanged. Test: normalize.test.ts,
"metamorphic sweep, round 2".

## AS-35 — a heat pump scheduled on one row with the unit it serves read that unit's fans, airflow and electric heat (FIXED — this goal)

**Found:** 2026-09-27, by a column census of documents no census had read
(scratch census3/fresh-columns.mjs: per table, each column's header and what
the normalizer reads from it). 18_OR (unseen; sheet M5.1) prints "AIR HANDLER
HEAT PUMP SCHEDULE (WITH ELECTRIC HEAT)" with one row per system ("AHU-1,
HP-1" … "AHU-3, HP-3"), its columns grouped AIR HANDLER INDOOR UNIT (filters,
DX cooling coil, heating coil, electric heat, supply fan, VFD) and HEAT PUMP
OUTDOOR UNIT (nominal tons, cooling and heating capacity, electrical), and
"ENERGY RECOVERY UNIT SCHEDULE (WITH HEAT PUMP)" with "ERU-1, HP-4" on one
row, the heat pump's capacities marked "(HEAT PUMP)". The compile makes two
units of each row (an AHU or ERV, and a HEAT_PUMP). The heat pump read as its
own: HP-1 … HP-3 the air handler's electric heat (100, 100, 90 kW), HP-3 the
air handler's supply airflow (10,000 CFM), HP-4 the ERU's supply fan (1.63
HP); its capacities and power were cited to the air handler's columns.

**Why:** the split-system rule knew a system's two halves by family alone:
fan coils, furnaces and VRF indoor units are indoor halves, condensing units
and VRF outdoor units outdoor ones. A heat pump is neither, since a packaged
heat pump owns its fan.

**Fix (shared path: normalize.ts, the one normalizer the panel and
apply_assemblies run):** a heat pump whose row names, beside it, a unit the
compile read as one that moves the air (AHU, DOAS, outdoor air unit, RTU,
ERV, FCU, furnace, VRF indoor unit) is that unit's outdoor half. Like a
condensing unit's, its columns are those that do not name the indoor unit;
and on a row scheduling both halves, the fans that move the space's air
(supply, return, relief, exhaust) and its electric heat are the indoor
unit's too. The row partner's family is the compile's, handed to the
normalizer with the row's table by withProject, which the apply and the
attribute eval both read rows through (it replaces the two copies of the
drive-schedule context they each built).

**Census (scratch census3/paired-rows.mjs, 98 documents: every dev tier, the
unseen snapshots and the sweep, without the held-out drafters' documents;
AS-39):** 10 rows make units of two families, 8 once 062_ID, a dev twin of
itd-d1-lab, is not counted again. 3 are a fan coil or furnace with its
condensing unit (the rule as it was), 3 an AHU with its heat pump and 1 an
ERU with its heat pump (18_OR), and 089_FL's HP-2 is compiled under two
families from one row with one tag, which is the compile's question, not this
rule's.

**Measured:** on every cached document, 5 values change, all in 18_OR, all
removals (the three electric heats, the 10,000 CFM, the 1.63 HP). The values
the heat pumps keep (cooling 343 / 343 / 274 MBH, heating 241 / 241 / 181 MBH,
460/3) now cite the HEAT PUMP OUTDOOR UNIT columns; HP-4 keeps 68.9 and 57.5
MBH from its "(HEAT PUMP)" columns and 460/3 from the row's one V/Ø. Read
against a render of M5.1: each removed value is printed under AIR HANDLER
INDOOR UNIT or the ERU's SUPPLY FAN, and each kept value in the heat pump's
own group. The air handlers and the ERU read exactly what they read before.
Every dev tier's line outcomes are identical (dev through dev 5). The heat
pump's NOMINAL TONS ("10 (X3)", three modules) stays unread, as before. Not
ruled, for want of a row that prints it: a heat pump beside a condensing unit
(the heat pump then the indoor half). Test: normalize.test.ts, "a heat pump on
one row with the unit it serves is its outdoor half", on 18_OR's cells, with
two negative controls (a packaged heat pump on its own row, a heat pump
beside another heat pump); disabling the rule fails it. The attribute eval's
context test (assembliesAttrEval.test.mjs) now pins the families beside the
headers and notes.

## AS-36 — the Takeoff panel on eight more documents: units that share a tag shared one accessible name (FIXED — this goal)

**Found:** 2026-09-27, running the UI proof (AS-34's: a real PDF through the
dev server into Takeoff → Assemblies, byte for byte against apply_assemblies
over MCP, control drawings read by printed phrases on both surfaces) on eight
documents it had not run on: 083_MA, 071_ME (dev 3), 03_FL, 21_VA, 16_NV
(dev 2), and 077_MT, 014_MT, 061_IA (unseen). Seven passed all 10 checks
on the first run. 16_NV stopped before the override check: it opened the
wrong unit's details. Its schedules print each mark bare under a symbol that
carries the prefix (AS-11: "B1" is a furnace, a condensing unit and an outdoor
air unit, right per table), and the panel named every one of their Details
buttons and detail regions "B1 controls details". A screen reader could not
tell the three apart, and neither could the proof.

**Fix (the panel only; accessible names are not the shared path):** a unit's
Details button and its detail region are named by tag, family and layer ("B1
FURNACE controls details"); the proof finds a unit the same way.

**Measured:** 16_NV passes all 10 checks, and 083_MA, re-run as a control,
passes as before. Across the eight documents, 347 units, 598 records and
7,438 lines match MCP byte for byte in the panel, along with the CSV set and
the mechanical-scope set, settings, keyboard, override, library, themes at
three widths, autosave and reload.

## AS-37 — a split system's outdoor heat pump took the heat-pump typical beside its indoor unit's (FIXED for two shapes — this goal; OPEN for the rest)

**Found:** 2026-09-27, following AS-35 to the typicals (scratch
census3/paired-apply.mjs, census3/hp-apply.mjs: every HEAT_PUMP unit, the
typical it gets, and what its table says of it). Every heat pump took
heat-pump@1, the zone heat pump typical: a field-installed unit controller, a
zone temperature sensor, a fan command and status, a compressor stage, a
heating mode, programming and verification labor. For a split system's
outdoor half that is a second controller, sensor and fan beside the indoor
unit's own typical. The dev typical keys read every split system's outdoor
unit the other way: "its BAS points are AC-1's" (bldg5406 ACCU-1), "its
compressor enable and status are F-1's points" (itd-d1-lab CU-1), a
"split-system heat pump outdoor unit for FCU-1" keyed with no typical
(baker-county-eoc CU-1, CU-2).

**Fix (shared path: normalize.ts and apply.ts, which the panel and
apply_assemblies both run):** the normalizer records which indoor units a heat
pump is the outdoor half of (NormalizedItem.split, with its basis), and the
apply path applies it as that system's outdoor unit: CONDENSING_UNIT,
derived from HEAT_PUMP (rule derive.family.split_outdoor, beside the existing
derive.family.gas_heat and derive.family.outdoor_air_*). v1 has no
CONDENSING_UNIT typical, so the record is no_assembly, "no typical for the
family" as the CSV defines it, and equipment.csv shows unit_family
CONDENSING_UNIT, schedule_family HEAT_PUMP and the derivation. A user's own
choice of typical still wins. Two shapes, each from its own evidence:

- **The row schedules the indoor unit beside it** ("AHU-1, HP-1", "ERU-1,
  HP-4"; 18_OR, unseen, AS-35): the row partner the compile read as a unit
  that moves the air.
- **A split system's table lists each half on a row of its own** (14_OR's
  SPLIT SYSTEM HEAT PUMPS, dev 2, whose key reads HP-01 and HP-02 as the
  outdoor units): the title names a split system, the heat pump's row prints
  no airflow ("CFM -"), and the indoor units' rows print theirs (FC-01 389).
  All three must hold.

**Measured:** across 98 cached documents (every dev tier, the unseen
snapshots and the sweep, without the held-out drafters' documents; AS-39),
12 of 3,163 records change, with the production
library (the typicals and the hook-ups), each the intended one: 14_OR's
HP-01 and HP-02 and 18_OR's HP-1 to HP-4 drop heat-pump@1 (11 lines each) and
hookup-heat-pump@1 (one note line each: its hose kit needs a source-water
flow, which an air-to-air unit does not have), 72 lines in all, and apply as
condensing units. (The commit that made the change counted the controls
layer only, "6 of 2,371 records"; the scratch A/B loaded only the typicals.
It now loads what mcp/src/assemblies.ts STARTER_FILES loads.) Every dev tier's line outcomes
are identical, except that 14_OR's two heat pumps give a different reason for
the airflow they leave unknown (still correctly unknown): "no printed column
answers it", as a condensing unit in a split table already does. The
invariant sweep is unchanged except its line total, which falls by exactly
those 22 lines of 14_OR. Tests: apply.test.ts, on 18_OR's and 14_OR's own
cells, with three negative controls (a packaged heat pump, a table that is
no split system's, a heat pump row that prints its own airflow); disabling
either shape fails its test. The UI proof passes all 10 checks on both
documents with the rule in place: 14_OR (96 records, 1,702 lines) and 18_OR
(35 records, 293 lines) byte-identical to apply_assemblies, the panel
showing each heat pump as "CONDENSING_UNIT (from HEAT_PUMP)" with its basis.

**Considered, not done:** a row that stacks its two tags with no separator
("AHU-1 HP-1" rather than "AHU-1, HP-1") would not pair, since the pairing
splits on "/", ",", "&" and "AND". No cell in the 98 cached documents prints
two kinds of tag with only whitespace between them (scratch
census3/ws-pairs.mjs), so the separators stay as they are.

**OPEN:**
- **Separately scheduled outdoor units the rule does not reach.** 09_ME's
  MULTI-SPLIT HEAT PUMP OUTDOOR UNIT schedule (SCU-1) beside its INDOOR UNIT
  schedule (SAC-1) and 25_WA's VRF OUTDOOR HEAT PUMP schedule (HP-30) beside
  its VRF INDOOR HEAT PUMP schedule still take heat-pump@1. (A third example
  first listed here came from a held-out drafter's document and is struck;
  AS-39.) Linking them to their indoor units needs a
  printed link (a SYSTEM or SERVED BY column, a title pair), and VRF indoor
  units compiled as HEAT_PUMP take a heat pump's compressor and heating mode
  that a VRF indoor unit does not have. Both are library-scope decisions
  with no key to measure them yet.
- **Library content (INPUT 4):** the indoor unit's typical is now the only
  place a split heat pump's points can be. Each system now counts one
  controller, zone sensor, fan command and set of labor where it counted two
  (11 lines less per outdoor heat pump), but its reversing valve is counted
  only where the indoor typical is ahu-constant-volume, the one typical with
  a heat pump's heating mode (hp-mode, when heating_type is heat_pump).
  ahu-single-zone (18_OR's AHU-1 … AHU-3, which read heating_type electric
  from their ELECTRIC HEAT column and wait on dx_stages), fcu (14_OR's FC-01
  and FC-02, heating_type heat_pump) and erv (ERU-1, whose heat pump is HP-4)
  have no heating-mode line, and erv no DX line. A heat pump heating mode on
  those typicals, and how a unit heated by a heat pump with electric
  supplemental heat reads its heating_type, are the owner's calls.

## AS-38 — an air handler's own fans, scheduled apart, each took a fan typical beside the air handler's (FIXED — this goal)

**Found:** 2026-09-27, by a census of units another unit's row names as its
component (scratch census3/components.mjs; 26 mentions on 98 cached
documents, first counted as 31 on 106 with the held-out drafters' documents,
AS-39). Most are no double count: coils and condensing units a parent row
names carry no typical, humidifiers with their own control panel are keyed
with their own typical (itd-d1-lab HUM-1, humidifier), and interlocks name
separate systems. One shape is: 096_IN (dev 3) schedules AHU-4's fan arrays
in an AHU SUPPLY FAN SCHEDULE and an AHU RETURN/EXHAUST FAN SCHEDULE, each
row's LOCATION the air handler it sits in (SF-4A "LOCATION: AHU-4"), and
AHU-4's own row names them ("SF-4A/B", "RF-4A/B"). SF-4A, SF-4B, RF-4A and
RF-4B each took fan-variable@1 (7 lines) beside AHU-4's own fan points. The
dev typical key reads such fans the other way: 031_MO's WHSE-SF1 and WHSE-RF1,
"supply fan array of WHSE-AHU-1 … its points are the air handler's, so no
separate fan typical".

**Why:** the row reader's component_of rule (control intent, R0) took a fan
as part of an air handler only when its SERVICE or SYSTEM cell names one;
the binder already read a LOCATION cell naming a scheduled unit as "puts it
in" that unit.

**Fix (shared path: rowReader.ts, which every surface applies through
applyAssemblies):** the rule also reads the fan's location column, with the
binder's own definition (LOCATION_HEADER, now exported from binding.ts): a
LOCATION, MOUNTED or INSTALLED cell that is exactly a scheduled air handler's
tag. The record is not_in_scope, "the fan is located in AHU-4: its points are
the air handler's", cited to the LOCATION cell, as the SERVICE form already
was. A user's own choice of typical still wins.

**Measured:** 4 of 3,163 records change across the 98 cached documents
(typicals and hook-ups; first counted on 106 with the held-out drafters'
documents, AS-39), each the intended one (28 lines fewer; a fan takes
no hook-up). 096_IN's SF-1A through SF-3 name DOAS-1 …
DOAS-3, which the set's compile does not schedule, so they keep their
typicals: they are the only place those units' fans are counted. The
control-intent replays of every dev set are unchanged. Test: rowReader.test.ts,
on 096_IN's cells, with four look-alikes that must not fire (a fan on the
roof, a location that only mentions the air handler, a location naming
equipment the set does not schedule, an exhaust fan interlocked with the air
handler); removing the location column from the rule fails it. One full web
check run alongside the scratch censuses failed a fourth test,
basSyncRestore's "adoption callback and atomic checkpoint settle before a
queued restore starts", which waits a bounded 1,000 event-loop turns for a
queued Web Lock. That test passes 5 of 5 on its own and in an uncontended
full run (3,822 of 3,838, the three AS-1 failures only). It exercises the BAS
sync store, which this change does not touch.

**Addendum, spellings (robustness; no key read):** a cell that drops a
tag's dash names the air handler too: 031_MO prints WHSE-SF1's location as
"WHSE-AHU1" for WHSE-AHU-1 (already taken through its SERVICE cell). The
looser spelling counts only when no other scheduled unit reads the same way
("AHU-1-1" and "AHU-11" both read "AHU11"), as the apply path reads a
printed points list's marks. The split-system rules are checked the same
way: a paired cell joined by "/", "&", "AND" or a bare comma, in either
order, and a split table titled SPLIT-SYSTEM, MINI-SPLIT or DUCTLESS SPLIT
whose heat pump row leaves its airflow "-", "--", "N/A" or blank, each read
as the printed spelling does (normalize.test.ts, apply.test.ts,
rowReader.test.ts). No record changes on the 98 cached documents, and
the control-intent dev replays are identical. The UI proof on 096_IN passes
all 10 checks with the fan rule: 243 records and 3,224 lines byte-identical
to apply_assemblies, 28 lines fewer than AS-34's run, the four fans' own.

## AS-39 — the censuses of AS-35 to AS-38 read the held-out drafters' documents (PROCESS NOTE; FIXED — this goal)

**Found:** 2026-09-27, while re-reading the corpus hygiene report before a
control-intent write-up. Corpus hygiene withholds seven documents because a
held-out firm drew them ("held-out drafter (never tuned on)" in
reports/control-intent/00-corpus-hygiene.md: 015_VA, 021_XX, 023_US, 034_NC,
038_NC, 075_MT and 27_WA; CI-16, CI-32). The dev tiers' snapshot cache does
not hold them, and neither does the unseen one, which is built from the
unseen audit's eligible sets. The scratch sweep cache, which snapshots every
corpus set, does. The censuses of AS-35 to AS-38 added that
cache to widen their reach, and their filter named the held-out sets,
held-out 2 and its withheld groupmates, but not these seven. (AS-35's
paired-row census named six of them, all but 075_MT.) 010_US, a copy of an
unseen set, was counted a second time.

**What was read:** every tool output of this goal, after each document was
withheld, that names one of them (a search of the session's transcript):
- The heat pump census (AS-37) printed one line each for 015_VA, 075_MT and
  27_WA: a heat pump's tag, its typical and its table's title. AS-37's open
  list named 015_VA's heat pump among the separately scheduled outdoor
  units. That example is struck.
- The component census (AS-38) printed five lines. Three were from 075_MT:
  two heat pumps and an energy recovery unit named by other rows. Two were
  from 27_WA: a condensing unit named by a fan coil's row.
- AS-35's column census ran on 075_MT with three other documents. Its lines
  for 075_MT went to a scratch file and were never displayed; only 18_OR's
  were read.
- Every other census and A/B printed only the records that changed, and none
  of those was in these documents. Their records were counted in the totals.

**What depends on them:** nothing. The rules, tests and cited evidence of
AS-35 to AS-38 come from 18_OR, 14_OR, 096_IN and 031_MO, with the dev keys
of bldg5406, itd-d1-lab, baker-county-eoc and 031_MO. AS-37's open item names
"a SYSTEM or SERVED BY column" as the kind of printed link a separately
scheduled outdoor unit would need. That item was committed (03:45) before the
component census displayed 075_MT's rows (03:48). A later rule for a unit
whose row names its outdoor heat pump needs its own example from a dev or
eligible unseen document. 075_MT's rows are not one, and no test may use
them.

**Recounted without them, and without 010_US's second count:** 98 documents
and 3,163 records (first counted as 106 and 3,489).
- AS-37: 12 records change, the same twelve (14_OR's HP-01 and HP-02, 18_OR's
  HP-1 to HP-4).
- AS-38: 4 records change, the same four (096_IN's SF-4A/B, RF-4A/B).
- The spellings addendum: no record changes (HEAD against AS-38).
- AS-38's component census: 26 mentions (first 31; the five above).
- AS-35's paired-row census: the same 10 rows on 98 documents (first 99).
  That is 8 distinct printed rows, since 062_ID, a dev twin of itd-d1-lab,
  repeats two of them.
- AS-37's whitespace census: no cell, as before.
AS-35 to AS-38 and the CHANGELOG now give these counts. The pushed commit
messages of AS-37 and AS-38 keep the first ones.

**Fix:** every scratch census's filter now names the held-out drafters'
documents and the copy, and the column census, which takes documents by
name, refuses them. The censuses of AS-28 to AS-34 and both metamorphic
sweeps read only the dev and unseen caches (86 documents), which do not hold
these documents, so their counts stand.

**Gates at the freeze after AS-35 to AS-38 and CI-34 (9a83964; aggregates
only, nothing tuned on them):**
- **GATE 2:** held-out 897 of 1,008 exact (89.0%), 0 wrong, 2 invented;
  held-out 2 334 of 472 exact (70.8%), 1 wrong (0.2%), 2 invented. These are
  the dev-5 freeze's numbers in every column. AS-35 to AS-38 move no
  held-out value.
- **GATE 5, the official configuration** (no project answers, no readings):
  21 of 91 exact (23.1%), as before. Two records that waited now select a
  typical, with options the keys read otherwise (unresolved 11 → 9, option
  wrong 58 → 60). Unresolved records waiting for a value the key says is
  printed went from 5 to 3. The report (05-typical-eval-heldout) is
  rewritten, and it now counts the misses by reason, as counts only: 83
  options with no readings to decide them, 9 records unresolved and 1 wrong
  typical.
- **GATE C, control intent's end to end** (the keys' project answers, the
  recorded readings replayed): 35 of 91 exact, up from 33 at CI-31. Which two
  instances moved is not read, since held-out gives aggregates only.
- Every gate still fails. No rule is written from these numbers.


## AS-40 — the Takeoff panel on thirteen more documents: a zone plan's cites kept the upload's hash name (FIXED — this goal)

**Found:** 2026-09-27, by the UI proof sweep (each document's PDF through
/__ot/assemblies-project into Takeoff → Assemblies, byte for byte against
apply_assemblies over MCP, deterministic readings) on thirteen documents it
had not run on. Ten pass all 10 checks: itd-d1-lab, 031_MO, 088_AZ, 028_TX,
044_NY, 012_MO, 05_MO, 06_MO, 089_FL and 009_FL. Three do not:
- **federal-mech (a bug):** 15 of its 214 records differ, the VAV boxes
  whose CO2 sensor the zone-plan reader decided
  (rp.co2_sensor.symbol_in_zone). In the browser their cites read "(control
  packet <sha>.pdf#2#zones)"; over MCP, "(control packet
  federal-attachment4-mechanical.pdf#2#zones)". Nothing else differs, in the
  records or the 3,274 lines.
- **01_NY (a ceiling of this container):** the browser builds the sheet
  graph of an upload itself, and 01_NY's 162 sheets were still "schedules
  indexing…" when the proof's 30-minute wait ended (MCP reads the cached
  graph in 60 s). Its compile needed 682 s and 12.8 GB in the eval harness
  too. Nothing here is the assemblies path's.
- **26_CA (the proof's own precondition):** the proof overrides an option of
  a unit with a typical, and 26_CA has none. Its 24 resolved records are
  hook-ups, which carry no options, its 17 air handlers wait on attr.vfd
  and attr.terminals_served, and its seven SINGLE DUCT CAV EXHAUST TERMINAL
  boxes have no typical in v1 (a library item for INPUT 4, disclosed as
  no_assembly). Every check before the override passed.

**Why:** AS-34 taught the browser's key remap (graphKeys.js) a control
packet's id, "<sha>.pdf#36#p8". A zone plan's readings cite its plan as
"<sheet>#zones" (controlIntent/record.ts), which that pattern did not
match, so the upload's hash name stayed. Only federal-mech and its near copy
019_FL carry a zone plan among the 98 cached documents.

**Fix (graphKeys.js, the browser's entry point; extraction and the readings
are unchanged):** the packet-id pattern also takes a zone plan's "#zones".
Test: graphKeys.test.ts, with two look-alikes ("#zonesX", a bare sheet key);
it fails without the fix. The proof now takes a document whose typicals carry
no options: it opens a unit with any typical, and overrides by choosing a
typical for a unit that waits.

**Measured:** rerun with the fix (round 6, the deterministic dev server),
each with the new group check (11 checks where a group exists):
- **federal-mech passes all 11 checks:** 214 records and 3,274 lines
  byte-identical to apply_assemblies, the zone plan's cites included; seven
  waiting pumps of one schedule resolved together with pump-constant.
- **26_CA passes all 11:** the override takes the fallback (AHU 24-2's
  controls take ahu-constant-volume with a reason), and ten waiting units
  resolve together. The run before had stopped at its library step, which
  found AS-41; with that fixed, the copy of hookup-air-handler is kept and
  its update offered.
- **071_ME passes all 11** (proven in AS-36, rerun here for its group):
  129 records and 2,407 lines. Its one group is 42 rows of the rooftop unit
  schedule the compile reads transposed (AS-33: "105.7", "24%", "CURB"
  are attribute rows, not units). The proof chose the first typical for
  them mechanically; an estimator takes them out in one step with Exclude
  all 42, which the proof now checks on the next group where a document has
  two.
Twelve of the thirteen documents pass every check; 01_NY remains the
container's ceiling above. federal-mech's group took 34 s from the click to
the overrides on screen, which is AS-42.

**Found on the way, in the group header (5d199ba):** a table that prints no
title (26_CA's air handlers, 061_IA's fans and pumps; groups on 4 of the 24
documents the sweep has run) made the header, its buttons' names and each override's
note read "units of  wait for". report.ts exceptionGroups now gives such a
group no title, the panel names it "an untitled schedule", and a group that
waits only for a choice between tied typicals says so. Test:
report.test.ts, an untitled table's rows (fails without the fix).

## AS-41 — a partner's copy of a hook-up that names another hook-up vanished when saved (FIXED — this goal)

**Found:** 2026-09-27, by the UI proof on 26_CA. Its only resolved records
are hook-ups, so the library step cloned hookup-air-handler, which live
validation called valid, and saved it. The store read it back as nothing, so
no update was offered.

**Why:** the browser store keeps the partner's own records, and the panel
joins them to the starter where it applies them (libraryEdit.ts
combinedLibrary), resolving every sub-assembly reference against both. The
store's own gate (library.ts, through schema.ts
sanitizeAssemblyDefinitions) also resolved references, but among the
partner's records alone. Six of the starter's 16 hook-ups name another
hook-up: the VAV, fan coil, air handler, unit heater, pump and heat
exchanger hook-ups name a coil, pump or terminal heater hook-up. A partner's
copy of any of them failed that check and was dropped without a word, when
saved from the editor, imported from a library CSV (whose receipt had
counted it added) or imported with a profile.

**Fix (schema.ts and library.ts, the shared library gate; the panel and MCP
both read it):** sanitizeAssemblyDefinitions takes `resolveRefs: false`, and
the store checks each record on its own. The whole library resolves the
references where it is known (combinedLibrary), and the Library view names a
record it refuses, with the reason, as it already did. The two other gates
keep resolving within what they hold. A project file's pins are complete,
since pinUsed pins every sub-assembly a used record names. Over MCP the file
is the library: its profile path read through the store's gate and compared
counts, so it would now have kept a dangling reference. It uses the load gate
that fails with each rejection's reason instead.

**Tests:** assemblyLibraryKind.test.ts: the store keeps the clone, the whole
library resolves it and offers hookup-air-handler 1 → 1.1, a reference
nothing holds is kept and then refused with its reason, and the plain gate
still refuses it. It fails without the fix. assembliesApply.test.mjs: a
profile holding a partner's VAV hook-up without the coil hook-up it names
fails with the gate's reason, and loads once it holds both. Through the
store's gate and the old count check, that profile loads with the dangling
reference.

## AS-42 — every change in the Takeoff panel froze the page for seconds: each apply re-ran the binder (FIXED — this goal)

**Found:** 2026-09-27, by the UI proof's group check on federal-mech. Choosing
one typical for seven waiting pumps took 34 s from the click to the overrides
on screen, and round 5's click gave up after 30 s. Nothing was wrong with the
records: the time went to recomputing.

**Why:** the panel applies the library again after every change (an
override, a setting, an answer), and then asks projectQuestions which
questions still change the project. That applies the library once per answer
choice, 12 times on federal-mech, synchronously. Each apply built the
control-evidence map, binding every control page to the units, and the
binder was 88% of an apply (1.6 of 1.7 s on federal-mech), though the map
depends on the project alone and is not read by the records or lines. So
each change cost about 20 s in Node (19.5 s of questions and 1.7 s of apply),
more in the browser, with the page frozen throughout.

**Fix (apply.ts and questions.ts, the shared path the panel and MCP both
run):** a project keeps what depends on it alone, in WeakMaps keyed by the
project object: its normalization (projectNormalization), its control map
per normalization, and the questions' text lines. A compiled project is not
changed after it is built, and these are only read. instancesOf copies what
it takes from the normalization, and nothing rewrites a cite in place. The
map stays at the same point in apply: computing it lazily would have bound
units whose attributes the readings had already filled in.
projectQuestions is now one generator of steps, one apply each. MCP runs it
straight through, and the panel runs it paced (projectQuestionsPaced): it
yields to the page after each apply, and a newer change stops a stale
count. The card keeps its questions, saying it is working, until the new
count is in.

**Measured:**
- **Byte for byte, on the 98 cached documents** (the dev tiers and the
  unseen corpus; no held-out or held-out drafter's document), six steps
  each:
  1. the printed-phrase readings (readControlIntent, whose first apply
     builds the map);
  2. apply;
  3. the questions;
  4. apply with an override pair (a waiting unit takes its first
     candidate, a resolved one is excluded) and the first question
     answered;
  5. the questions with them, through the panel's paced count;
  6. apply without them again.

  The code before the fix takes a freshly parsed project at every step;
  the fix takes one project object through all six, as the panel and MCP
  do. All 588 steps are identical. A planted bug, one control map shared
  by every project, is caught: federal-mech's readings and applies differ.
- **Time after a change** (Node, the same steps; before → after):

  | Step | Median | 90th percentile | Worst |
  |---|---|---|---|
  | Apply | 46 → 2 ms | 474 → 19 ms | 2,545 → 172 ms |
  | Questions | 516 → 18 ms | 5.3 → 0.21 s | 26.7 → 1.1 s |

  federal-mech's questions went from 26.7 to 1.0 s, 019_FL's from 20.7 to
  1.1 s, and 096_IN's from 15.7 to 1.1 s.
- **In the browser** (the UI proof, the deterministic dev server, round 7):
  - federal-mech's seven pumps took 1 s from the click to the overrides on
    screen, where round 6 took 34 s, and its single override took under
    1 s. It still passes all 11 checks, byte-identical to MCP.
  - 26_CA's group of ten, and "Exclude all" on its group of six, each took
    under 1 s (12 checks).
- **Tests:** readers.test.ts, two tests. The first keeps the map across
  changes, gives a fresh copy's records, keys a caller's own normalization
  apart, and never shares between projects. The second checks that the
  paced count equals projectQuestions, pauses before each apply, and stops
  when cancelled. Both fail without the fix.

## AS-43 — an override on one unit changed every unit of another family that shares its tag (FIXED — this goal)

**Found:** 2026-09-27, checking that the panel's "Exclude all" leaves other
units alone. Of the 98 cached documents, 4 have a tag that units of two
families share (27 tags):
- 16_NV's "B1" to "B5": a furnace, a condensing unit, an outdoor air unit
  and a rooftop unit each, as the compile reads its marks (AS-36).
- 047_NC's CH-1 and CH-2, each an air-cooled chiller and a heat recovery
  chiller.
- 089_FL's HP-2, a condensing unit and a heat pump.
- 21_VA's transposed rows ("MODEL NUMBER", "PHASE"), each a condensing unit
  and a pump (AS-33).

**Why:** expand.ts found a unit's override by its tag and layer alone. The
panel lists these units apart (AS-36 gave them distinct names), yet
excluding 16_NV's outdoor air unit B1 excluded its furnace and condensing
unit B1 as well. Choosing a typical for one would have given that typical
to the others in the same layer.

**Fix (select.ts, expand.ts, projectState.ts and MCP's apply_assemblies
schema, the shared path):**
- **Overrides:** an override may name its unit's family. A unit takes the
  override that names its family, else one that names none. An override
  made before this names none, so it covers every unit with the tag, as it
  did.
- **The project file:** its gate keeps the family. Its strict schema would
  have dropped such an override on reload.
- **MCP:** apply_assemblies' overrides take the family, documented.
- **The panel:** it names the family on every override it makes, for one
  unit or a group. An earlier override that names no family is replaced
  only where no other family shares the tag, and "Your overrides" says
  whose an override is where the tag is shared.

**Measured:** on the four documents, excluding one unit with its family
named excludes that unit's records only:
- 16_NV's outdoor air unit B1 alone, where before its furnace and
  condensing unit went too;
- 047_NC's CH-1 air-cooled chiller;
- 089_FL's HP-2 condensing unit;
- 21_VA's "MODEL NUMBER" condensing unit.

Without a family named, each excludes every unit with the tag, as before.
An override that names no family matches exactly as before by
construction: the first lookup cannot match it, and the second is the old
test. Tag and family name one unit: in none of the 98 documents do two
units of one family share a tag. In the browser (UI proof round 8),
"Exclude all" on 16_NV's four bid-alternate rooftop units (B2 to B5, 8
records) left the 10 records of the furnaces, condensing units and outdoor
air unit under those tags untouched.

**Tests:**
- engine.test.ts: a VAV box and a fan coil both tagged "B1". Each family's
  exclusion is its own, one naming none covers both, and a unit's own
  override wins over one naming none wherever it sits.
- projectState.test.ts: the family survives the project file.

Both fail without the fix.

## AS-44 — excluding a unit left in the estimate a layer it already had an override for (FIXED — this goal)

**Found:** 2026-09-27, reading the override lookup while fixing AS-43. A
unit took the first override in the list that fitted its tag and layer.
The panel adds a new override after the others, so a unit whose controls
layer already carried a choice (an option or a typical) kept that layer
when it was then excluded. The choice was found first, and the unit's
controls points and devices stayed in the estimate under "overridden". MCP
behaved the same for a call that passed both.

**Fix (expand.ts, the shared path):** of the overrides that fit a unit, one
naming its family comes before one naming none (AS-43). Of those, an
exclusion comes before a choice, wherever it sits in the list. Otherwise
the first still wins, as before. The earlier choice is kept: removing the
exclusion under "Your overrides" gives it back. An exclusion for one layer
covers that layer only, and one naming another family never covers the
unit. MCP's apply_assemblies describes the rule on `exclude`.

**Tests:** engine.test.ts. A choice then an exclusion, and an exclusion then
a choice, both exclude. The choice alone still applies, and neither another
layer's exclusion nor another family's excludes the unit. It fails without
the fix.

## AS-45 — an override that applied to nothing was kept without a word: the project's own rows, a typo, a unit no longer read (FIXED — this goal)

**Found:** 2026-09-27, following AS-43 and AS-44 through every place an
override is written. The panel lists the project's own records, such as
building meters and a plant's controls, as exceptions tagged "(project)",
with "Use chw-plant" and, under Details, option and Exclude buttons. The
engine chooses those records from the project settings
(selectProjectAssemblies) and never reads an override for them. So on
federal-mech, "Use chw-plant" asked for a reason, listed the override
under "Your overrides", and changed nothing: the row still waited for
var.plants. An override for a tag no unit has, such as a typo over MCP or a
unit a later read of the drawings no longer finds, was kept the same way.

**Fix (expand.ts, the shared path; MCP and the panel both report through
it):**
- **The shared check:** unmatchedOverrides names every override that no
  unit takes, with why. The reason is one of: a tag no unit has, a family
  or layer its units have not, a typical that layer does not offer, or the
  project's own records, which follow the project settings.
- **MCP:** apply_assemblies lists these under overrides_unmatched. The
  field is absent when every override applies.
- **The panel:** "Your overrides" marks each with "applies to nothing" and
  the reason. A project row's resolve button is "Project settings", which
  opens the project variables its waits are set with (chw_plants,
  hw_plants, closed_loops, buildings, gas_service, steam_service). Its
  Details shows no override buttons.
- **Unchanged:** the matching itself (overrideFits, AS-43 and AS-44) and
  every record and line.

**Tests:**
- engine.test.ts names each reason: a typo, another family, a missing
  layer, a typical not offered and the project's own records. Two overrides
  that fit are not named.
- assembliesApply.test.mjs sends apply_assemblies three unmatched overrides
  beside one that applies. Only the three are named, each with its reason,
  and a call whose overrides all apply carries no overrides_unmatched.

## AS-46 — 1,618 lines named "evidence" as their quantity's basis where a default of the starter library stood in (FIXED — this goal)

**Found:** 2026-09-27, by the library census below. A partner's copy of the
whole starter, applied to a cached document, must give the starter's records
and lines except for the version it names and its defaults being the
partner's. On federal-mech 146 lines differed in qty_source alone:
"partner_default" under the copy, "evidence" under the starter.

**Cause:** expand.ts named a known quantity's basis "partner_default" when a
partner default was read for its line (its condition, quantity or
parameters) and "evidence" otherwise, so a default of the starter library
read the same way came out as evidence. docs/ASSEMBLIES_CSV.md defines
evidence as a quantity that rests on the drawings and the project, and
equipment.csv already labels those options and variables "starter_default";
lines.csv's qty_basis alone hid them. Over the 98 cached documents, 1,618 of
31,769 lines (5.1%) did so. On federal-mech they are the 58 reheat VAV
boxes' wall-module zone sensors and setpoint-adjustment points, the fan
coils' likewise, the unit heaters' space sensors and heating valves, and an
air handler's minimum outdoor air damper, outdoor airflow station and
freezestat point, among others: each there because a default of its typical
says so, and each reported as though the drawings showed it.

**Fix (expand.ts, the shared path; lines.csv, the panel and MCP all read
it):** a known quantity's basis is "partner_default" when a partner default
is read for its line, else "starter_default" when a starter default is,
else "evidence". ExpandedLine.qty_source takes the new value, and
docs/ASSEMBLIES_CSV.md names it.

**Measured (A/B over the 98 cached documents, printed-phrase readings):**
- 1,618 lines change qty_source, every one "evidence" → "starter_default".
  Nothing else in any record or line changes.
- The project questions are the same on the 64 documents that show any:
  the same questions in the same order, with the same records counts and
  zero-effect lists. A question already counted the records whose option a
  default decided; its lines count now also counts their lines.

**Tests:** engine.test.ts: a quantity that reads a starter default is
"starter_default"; a partner default for the same variable stands in before
it ("partner_default"); a literal quantity and the estimator's own value are
"evidence". The test fails before the fix (the starter's line reads
"evidence").

**The censuses that found it** (scratch scripts; no key read, over the 98
cached documents):
- **Groups:** every waiting group of report.exceptions (45 on 98 documents)
  resolved as the panel does: "Use <typical> for all N" for each candidate,
  "Exclude all N", and both in either order. 324 actions, 0 failures: each
  changes exactly its group, an exclusion wins in either order, no
  override applies to nothing, and the overrides and the pins they lead to
  come back whole through the project file's gate (sanitizeAssembliesState)
  and apply the same. With the family left off the exclusions (the
  behaviour before AS-43), 16_NV fails 5 checks; with a field the gate does
  not know, the gate names it.
- **Exports:** every document under the six settings the panel offers (none;
  the starter's hook-up defaults; each of the four responsibility presets
  over them). 588 runs, 0 failures: the CSV set and each of the eight
  parties' scoped sets pass csvSetProblems, each scoped lines.csv holds
  exactly the lines inScope() gives that party, the PDF builds, and every
  known quantity is finite and not negative. A line corrupted to NaN is
  caught.
- **Library:** a partner's copy of every starter record, through
  libraryToCsv and importLibraryCsv, joins the starter with nothing rejected
  and applies as the starter does; each record copied alone does too; a
  pinned project keeps its pins when a newer copy arrives, is offered each
  as an update and takes each when adopted. On HEAD it fails on the qty_source
  above, and with the fix 0 failures on 98 documents. Gated alone, as the
  store did before AS-41, 6 of the 47 single copies are rejected (AS-41's
  six hook-ups).

## AS-47 — a typical the estimator chose left the exceptions while it still waited for a value (FIXED — this goal)

**Found:** 2026-09-27, by a census of the exceptions' waits over the 98
cached documents. After "Use <typical> for all N" (AS-40's group
resolution) and its candidates, the group census checked that no unit of
the group still waited in a group. It did not check whether the chosen
typical itself still waited. A typical's options read attributes too: for
an air handler, ahu-constant-volume reads attr.economizer, and
ahu-multizone-vav and ahu-single-zone read attr.cooling_type and
attr.dx_stages. selectAssembly marked every record whose typical the
estimator chose "overridden", whatever it still waited for. The report
lists only "unresolved" records as exceptions, so those records left the
list, and the panel's header counted them as decided.

**Measured (every waiting group of the 98 cached documents, each
candidate, deterministic readings):** 15 of the 93 group choices left 197
records overridden but still waiting, with 3,439 unresolved lines, on four
documents: 26_CA's air handlers (11 and 6), 071_ME's transposed rooftop-unit
rows (42), 16_NV's rooftop units (4 and 4) and 10_MO's air handlers (2),
waiting for attr.economizer or for attr.cooling_type and attr.dx_stages.
Before any choice, no overridden record waits. 26_CA's browser proof in
rounds 6 and 7 chose ahu-constant-volume for 10 of those air handlers and
passed: it checked only that the group's units left the exceptions.

**Fix (select.ts, the shared path):** a record's status is "unresolved"
while anything it reads is missing, whoever chose its typical; a record
the estimator chose is "overridden" once nothing is. selected_by stays
"user", and the record lists what it waits for. It stays among the
exceptions (with no candidates, so as a row of its own), and its Details
set the option it waits for, which the same override keeps.

**Measured after:** 0 of the 93 choices leave an overridden record waiting.
A seeded random walk of the panel's actions ("Use for all", option
decisions, "Exclude all", single options, removals and settings; 30 steps a
document, 2,940 in all) checks after every step that a record is
unresolved exactly when it waits, that the exceptions are exactly those
records, that no override applies to nothing, that the project file keeps
the state, and that the same state applies to the same bytes: 0 failures.
With this status rule reverted it fails 66 times on three documents.
With no override, nothing changes: over the 98 documents every record and
line is identical but for AS-46's qty_source, and the project questions are
the same. The evals apply no overrides, so no gate moves.

**Tests:** engine.test.ts: a typical chosen for a unit whose attributes it
cannot read is "unresolved" (selected_by "user", waiting for attr.cfm_max
and attr.hw_conn_in); with its option and variable given by the same
override it is "overridden"; a typical that reads nothing unknown is
"overridden" at once. The first fails before the fix. The group census now
checks each chosen record's status against what it waits for: 197
failures before the fix, 0 after. The UI proof counts the chosen units that still
wait among the exceptions after "Use … for all N".

## AS-48 — rows whose typical's same options waited had no group: each unit was answered alone (FIXED — this goal)

**Found:** 2026-09-27, with AS-47. The exceptions' group action (5d199ba)
grouped rows that wait for a typical, by their candidates. Rows whose
typical is chosen but whose options wait have no candidates, so each was
its own row: over the 98 cached documents, 59 fan coils in 16 documents
wait for attr.ecm, which decides fcu's variable_speed_fan, and after AS-47
a schedule's rows keep waiting under a typical the estimator chose for them
(26_CA's air handlers for the economizer ahu-constant-volume reads). Each
needed its own Details and reason.

**Fix (report.ts exceptionGroups, the shared path; the panel's group
header):** rows of one schedule, family and layer under the same typical,
with the same waits and the same options undecided, are one group too. The
group names its typical and those options; its header offers, for each
option, a yes and a no for all N. As for a typical, one reason is asked,
and each unit gets its own override: its earlier override's typical and
options kept, the option added (overrideMany now adds the new options, which
it dropped). Groups by candidates are unchanged.

**Measured (a census over the 98 cached documents):** 17 option groups
before any choice and 15 after a group's choice of typical; deciding each
option yes and no for all is 66 actions, 0 failures. Each unit takes the
value from "user", a unit that waited on nothing else leaves the
exceptions, nothing outside the group changes, every override matches a
unit, and the project file keeps the overrides. Deciding the option while
dropping the unit's earlier typical (a plausible slip in the group action)
fails 394 checks. The group census runs "Exclude all N" on the option
groups too: 62 groups, 341 actions, 0 failures; after "Use … for all N", no
unit still waits for a typical, and those whose chosen typical waits for an
option are in an option group.

**Tests:** report.test.ts: two fan coils whose rows print no motor type are
one group under fcu@1 deciding variable_speed_fan, and the one that prints
it is not in it; one answer for the group leaves no group; two air handlers
the estimator gave ahu-constant-volume are one group deciding economizer.
The UI proof decides the first option group on screen for all its units
(after its group Use, on 26_CA, the air handlers' economizer).

## AS-49 — what an override set that its unit's record never reads was dropped without a word: a typo, a typical without the option, a unit out of scope (FIXED — this goal)

**Found:** 2026-09-27, following AS-45 to the overrides that do fit a
unit. An override's options and variables are read only through the ids of
the unit's typical (select.ts optionsOf, variablesOf). Any other id was
dropped. On federal-mech, apply_assemblies with AHU-1 `options:
{ economiser: true, dedicated_min_oa: false }, variables: { no_such_var: 3 }`
applied dedicated_min_oa from the user, but not economiser (the typical,
ahu-multizone-vav@1, has no such option) or no_such_var. It also returned
no overrides_unmatched: the override fits AHU-1, so AS-45 does not apply.
The same silence met:
- an option the typical lost when the project adopted an updated version,
  or when a different typical was chosen for the unit;
- options set on a unit with no typical: one still waiting between
  typicals, one no typical applies to, one a project answer puts out of
  scope (PQ1 "no BAS scope"), and one whose chosen version the library
  does not have;
- an override that another for the same unit and layer decides entirely,
  such as a project file from before AS-43 that keeps a family-less
  override beside the unit's own.
"Your overrides" listed each of these as if applied.

**Fix (expand.ts, the shared path; MCP and the panel both report through
it):**
- **The shared check:** ignoredOverrideParts names, for each override that
  fits a unit, the options and variables no record it decides takes, with
  why. An id counts as taken where any record the override decides has it,
  so an override without a layer that applies to both the controls and
  hook-up layers names only the ids neither typical has. The reasons are:
  "<typical>@<version> has no option …, variable …", "no typical is chosen
  for <tag> (<layer>) yet", "<tag> (<layer>) is out of scope", "no typical
  applies to <tag> (<layer>)", "the library has no <typical>@<version>", or
  "another override for <tag> (<layer>) decides it" (then all of the
  override's ids are named).
- **Exclusions:** an override that an exclusion sets aside is not named;
  it applies again once the exclusion is removed (AS-44). An override that
  fits no unit stays unmatchedOverrides' (AS-45).
- **One rule for which override decides:** expandAll and the check now
  both use effectiveOverride, the rank AS-43 and AS-44 set (family first,
  then an exclusion before a choice).
- **MCP:** apply_assemblies lists these under overrides_ignored (tag,
  family, layer, options, variables, why). The field is absent when every
  part applies.
- **The panel:** "Your overrides" marks each with "not applied" and the
  reason, and shows an override's variables beside its options.
- **Unchanged:** every record and line, since the check only reads them.

**Measured (over the 98 cached documents):**
- **A/B of the engine before and after:** main and the fix apply 2,058
  seeded states (6,304 overrides in all: the panel's actions, typos,
  family-less copies and PQ1 answers) to byte-identical records and lines.
- **The panel's own actions alone** (the AS-47 random walk, 2,940 steps):
  no part is named. Groups, options on a unit's own typical, exclusions and
  removals only set ids the typical has.
- **A behavioural invariant with the MCP-like actions added** (typos,
  family-less copies, options on units that wait, PQ1): 2,940 steps, 0
  failures. At each step one id of one override is removed and the project
  reapplied. Of 1,690 ids sampled, the 901 named change nothing when
  removed, and the 789 not named each change something. All four common
  reasons occur: another override decides it, the typical has no such id,
  out of scope, and no typical yet.
- **Negative controls on 12 documents:** naming nothing fails 176 checks;
  naming every id fails 114.

**Tests:**
- engine.test.ts covers the fitting override, a typo in an option and a
  variable (the ids the typical has still come from the user), a typical
  chosen without the option, a unit that waits, one out of scope (and back
  in scope when the estimator chooses its typical), a version the library
  lacks, a family-less override the unit's own decides over, an exclusion
  that sets a choice aside, and an unmatched override.
- assembliesApply.test.mjs sends a typo'd option and variable beside
  ufc_minimum_points on AHU-1: only the two are named, with the typical in
  the reason. A call whose overrides all apply carries no
  overrides_ignored.
- The Assemblies UI proof writes one option the unit's typical has not
  into the saved override, reloads, and checks that "Your overrides" marks
  it "not applied: <typical>@<version> has no option …" while the rest of
  the override still applies.

## AS-50 — a setting no part of the library reads changed nothing without a word: a typo'd partner default, a switch or role the library lacks (FIXED — this goal)

**Found:** 2026-09-27, following AS-49 from overrides to settings. Every
setting is read by id:
- a project variable, by the typicals whose variables take it from the
  project (`from: "project.<id>"`);
- a partner default, by an option or variable of that id (keyed "<assembly
  id>.<id>" or "<id>"), and for an option only as true or false (select.ts
  skips any other value);
- a hook-up switch, by the lines that name it (`profile_switch`);
- a responsibility edit, by the lines of its role, and only for the
  matrix's six activities and eight parties.

Any other key was accepted and dropped, and neither apply_assemblies nor the
panel said so. On federal-mech, each of these left the records and lines
byte-identical: `variables: { chw_plantz: 1 }`, `partnerDefaults:
{ economiser: true }`, `partnerDefaults: { "ahu-multizone-vav.no_such": true }`,
`partnerDefaults: { dedicated_min_oa: "yes" }`, `profile: { strainerz: true }`
and `responsibility: { no_role: { furnish: "mechanical" } }`. An activity the
matrix does not know (`fitting`) was carried in the records and reached no
CSV file. A party it does not know (`kit_maker`) reached lines.csv as
written, where no export scope selects it. MCP accepts these keys as free
strings, and so does the project file, which can also keep settings made
with another library.

**Fix (expand.ts, the shared path; MCP and the panel both report through
it):**
- **The shared check:** unreadSettings names every key no part of the
  library reads, with why.
- **MCP:** apply_assemblies lists these under settings_unread, checked
  against the settings it applied (the hook-up defaults and preset
  included). The field is absent when every key is read.
- **The panel:** Project settings lists them at its top, checked against
  the project's own library (its pinned versions).
- **Unchanged:** no record or line, since the check only reads the library.

**Measured:**
- **The starter reads everything the panel offers:** its library reads
  every hook-up switch and variable the settings form offers (9 and 5) and
  every cell of the four responsibility presets.
- **A library without the hook-ups** reads none of the switches, and says
  so for each.
- **On federal-mech,** every key named above changes nothing when applied,
  and each is named with its reason.

**Tests:**
- engine.test.ts, with the fixture library: keys that are read (an
  option's and a variable's partner default, plain and under their
  typical, a switch a line names, a role's cells) are not named. Each kind
  of unread key is named with its reason, and together they leave the
  expansion byte-identical.
- presets.test.ts: the starter reads every switch, variable and preset cell,
  and a library without the hook-ups reads none of the switches.
- assembliesApply.test.mjs: a call with a typo'd partner default and switch
  names both and keeps the report's totals, and the call with the starter's
  hook-up defaults and the kit-maker preset carries no settings_unread.
- The Assemblies UI proof writes a hook-up switch no line names into the
  saved settings beside AS-49's option, reloads, and checks that Project
  settings lists it with its reason (09_ME, 11 checks; federal-mech, 13).

## AS-51 — a reply narrowed by family left units out without a word: a typo'd family, units that apply as another (FIXED — this goal)

**Found:** 2026-09-27, following AS-45, AS-49 and AS-50 to apply_assemblies'
own inputs. `families` narrows the reply to units by the family they apply
as, which the engine may derive. A family no unit applies as (an agent's
"AHUS" for "AHU") returned a report with no units and no word. Units
scheduled as one family that apply as another were left out of a reply
narrowed to their schedule's family, also without a word. Over the 98
cached documents, 12 units on 8 documents apply as another family than
their schedule's: 6 split heat pumps as condensing units (14_OR, 18_OR),
3 air handlers with 100% outdoor air as DOAS (009_FL, 01_NY, 094_FL), 2
gas-fired fan coils as furnaces (062_ID, itd-d1-lab) and a rooftop unit as
DOAS (004_MO). `families: ["AHU"]` on 009_FL left out AHU-2.

**Fix (report.ts, the shared path; MCP renders it):**
- **The shared check:** familiesLeftOut names each family the reply is
  narrowed to that leaves units out, with why: "no unit applies as AHUS
  (the families here: …)", or "1 unit scheduled as AHU applies as DOAS
  (AHU-2); name DOAS too to see it". A family asked for alongside the one
  its units apply as is not named.
- **MCP:** apply_assemblies returns these under families_left_out. The
  field is absent when every family asked for has its units, and the
  `families` description names it.
- **Unchanged:** the application, which is whole whatever the reply shows,
  and every record and line. The panel has no family narrowing.

**Tests:**
- report.test.ts: an air handler with 100% outdoor air applies as DOAS.
  Narrowing to AHU names it; narrowing to AHU and DOAS does not; a typo'd
  family is named with the families present; a family and the DOAS
  family asked for by their applied names are not named.
- assembliesApply.test.mjs: narrowing to AHU and "AHUS" names "AHUS" alone,
  with federal-mech's families. The call narrowed to AHU alone carries no
  families_left_out.

## AS-52 — a misread count made "ok" lines with negative or fractional quantities (FIXED — this goal)

**Found:** 2026-09-27, by a fuzz census of the starter library. Every
equipment typical and hook-up, for every family it serves, expanded 60
times over attributes drawn with edge values (0, fractions, negatives,
huge values) and random hook-up settings: 3,180 expansions. The engine
already made a line an error when its quantity was not a finite number. A
finite negative, or a fractional count, passed as `ok`: 40 kinds of line.
A cooling tower with `cells` -20 had -20 fan commands, fan statuses and
overflow drains. A terminal with `eh_stages` -20 had -20 heat stage points.
Half a cell gave half a fan start and half a fan command. A unit's printed
QTY (its multiplier), or a sub-assembly's count, carried the same way. The
starter's property test drew values from 0 to 10 and checked only that no
line errored.

**Fix (expand.ts, the shared path):**
- A line whose quantity, times its multiplier, is negative is an `error`,
  and so is a point or device count that is not a whole number: "qty -2 is
  negative", "qty 1.5 is not a whole count of points".
- The reason is in the line's `waits_for`, in the unit's details and in
  lines.csv.
- A line with a `round` rule may still compute a fraction, since export
  rounds it. Components and labor (a length, hours) may be fractional.
- No starter point or device line divides, rounds or uses a fraction.

**Measured:**
- **The fuzz census:** 0 `ok` lines with a bad quantity, against 40 kinds
  before. 187 lines are errors with these reasons: 85 negative, 76
  fractional point counts, 26 fractional device counts. No other error.
- **Real data:** over the 98 cached documents, with and without the
  starter's hook-up defaults (60,361 lines), no line has a negative or
  fractional point or device quantity, a negative multiplier, or an error.
- **A/B:** main and this change apply 2,058 seeded states (6,304
  overrides) to
  byte-identical records and lines.

**Tests:** engine.test.ts, with a tower typical per cell: 2 cells are
whole. 1.5 cells make the fan command an error, while a rounded device and
a length stand. -2 cells, or a -1 multiplier (a misread QTY), make every
line an error with its negative quantity. starter.test.ts's property test
drew counts in quarters (9.75 electric heat stages), which this now flags:
it draws a dimensionless number (cells, stages, rows, fans) whole, and
asserts that every known quantity over its 400-odd expansions is not
negative and every point or device count is whole.

**At the gate (addendum):** a quantity with nothing to read (no attribute,
variable or option) is known when the library loads, so the gate checks it
by the same rule. A line fixed at "2 - 3", or a device at "0.5" with no
`round` rule, is refused with its reason ("lines.a.qty: -1 is negative"),
as the library editor's live validation, the CSV import and a profile
import all run the gate. A rounding device and a fractional length pass.
The whole starter library passes. engine.test.ts's gate test covers these
four cases.

## AS-53 — a line that could not be counted was left out of every total without a word (FIXED — this goal)

**Found:** 2026-09-27, following AS-52 to where its error lines go. A line
whose quantity cannot stand has no quantity, so no total and no roll-up
counts it. Such a line is AS-52's negative quantity or fractional point
or device count, or an expression that fails. Nothing surfaced them:
- the panel's totals line counted ok, unresolved and replaced lines and
  left errors out;
- the report's exceptions list only records that wait, and a record with
  an error line need not wait (its typical is chosen);
- over MCP, `report.exceptions` said nothing of them.
An estimate could miss a cooling tower's fan commands, and only the
unit's own Details, or the PDF's total, showed why.

**Fix (report.ts, the shared path; the panel, the PDF and MCP render it):**
- **The report:** `line_errors` lists every line whose quantity cannot
  stand, beside the exceptions: its unit, family, layer, rule, kind, why
  and cites.
- **The panel:** "Lines that cannot be counted" lists them after the
  exceptions, each unit's tag opening its schedule row. The totals line
  counts them.
- **The PDF section** lists them after the exceptions.
- **MCP:** the report carries `line_errors` in every detail (an empty list
  when there are none), and its schema describes it.
- **Unchanged:** no record or line. No cached document has an error line
  (AS-52's census).

**Tests:**
- report.test.ts: a cooling tower whose cells were misread as -2 lists
  its lines, each "qty -2 is negative" with its cites, and they number
  exactly the report's error lines; one read right lists none.
- reportPdf.test.ts: the PDF draws the section for them, and none without
  them.
- panelSections.test.ts renders the panel's own sections: the lines
  listed with their unit, rule and why, nothing when there are none, and
  Project settings' unread-settings notice (AS-50).
- The Assemblies UI proof passes on 09_ME (11 checks) with the section in
  place.

## AS-54 — a schedule sheet whose tables are pictures left the assemblies empty without a word (FIXED — this goal)

**Found:** 2026-09-27, reading why round 11's UI proof ran eight documents
on their parity checks alone: their compiles read no unit. On 07_MO, 15_IA
and 029_ME the schedule sheets carry their tables as embedded pictures
(pasted images), and the text layer holds only the title block:
- 07_MO's M-601 (page 21) is a VAV box schedule of 29 units with hydronic
  reheat, an expansion tank schedule and an air device schedule (59% of
  the sheet is pictures). Pages 22, 23, 40 and 41 (M-602, M-603, E-601 and
  E-602) are 50-58% pictures too.
- 029_ME's ME601 (page 7) prints its boiler schedule (B-1, B-2) and pump
  schedule (six pumps) as pictures (17% of the sheet).
- 15_IA's E2 (page 11) is 59% pictures.

The sheet graph already said so (`sheet_graph`'s notes: "classified as a
schedule sheet but 0 tables extracted from it, and 59% of its own area is
embedded raster image content"). The assemblies never did: the panel and
`apply_assemblies` reported 0 units, a count that reads like a set with no
equipment. Reading the pictures is extraction's (no OCR fallback for
schedules, a known gap), and this branch leaves it alone.

**Fix (the shared path: the session builds the project both surfaces
read, and report.ts words it):**
- **Session.pictureScheduleSheets** (mcp/src/session.ts) is
  `rasterScheduleNotes`' first case as data: a schedule-role sheet that
  extracted no table while its embedded images pass the raster policy, with
  the share of the sheet they cover. `sheet_graph`'s own notes are
  unchanged.
- **The project** (`sessionAssembliesProject`, which the Takeoff panel
  reads through production-graph-cli) carries them as `unread_schedules`,
  each with its printed sheet number when the title block has one.
- **The report** (`assembliesReport`) carries `schedules_unread`: each sheet
  with why ("no table could be read from it: 59% of the sheet is pictures
  (pasted images or a scan), so any unit it schedules is missing from these
  assemblies"). The wording is conditional because a picture schedule sheet
  may hold room calculations or panel schedules rather than equipment. The
  field is absent when there is none, and nothing else in the report
  changes.
- **The panel** names them in red above its settings; **the PDF section**
  lists them after the totals; **MCP** returns them in `report` in every
  detail, and the output schema describes the field.
- **Unchanged:** no record or line. Nothing is read from the pictures.
- **Not yet named:** a sheet that reads some tables and carries others as
  pictures (the pipeline counts those only in a note).

**Measured:** of the 82 documents the UI proof rounds have read, 40 were
checked: 33 whose sheet graph was cached under the current code, and 7 more
a census rebuilt before it was stopped for time.
- 16 have a schedule sheet that read no table, 32 sheets in all. 13 of
  them, on 7 documents, are pictures and are named: 07_MO's M-601 to
  M-603, E-601 and E-602 (50-59%), 25_WA's E0.03 to E0.05 (19-59%), 15_IA's
  E2 (59%), 017_MD's page 14 (44%), 046_MI's E-8 (28%), 043_FL's page 33
  (20%) and 029_ME's ME601 (17%).
- The other 19 carry 0-3% pictures and are not named. Five checked by eye
  schedule no equipment: 053_VA's MH103 and 25_WA's ME4.05 are duct plans,
  030_NY's P-701 is a controls symbol legend, 019_FL's M8.5 an air
  handler's control diagram and points list, and 013_MO's E-300 electrical
  one-lines with conduit and feeder schedules. The sheet graph's schedule
  role alone would name noise, so only a sheet the raster policy calls
  pictures is named.
- Four named sheets were checked by eye, and each is pictures: 07_MO's
  M-601 (a VAV box schedule of 29 units), 029_ME's ME601 (its boilers and
  pumps), 017_MD's page 14 (six ventilation schedules pasted as
  spreadsheet screenshots) and 043_FL's page 33 (electrical panelboard
  schedules, not HVAC units). Eight named sheets are electrical by their
  numbers, and a picture sheet may schedule no equipment at all, so the
  notice says any unit a sheet schedules is missing, never that equipment
  is.
- 01_NY (162 sheets) ran out of memory rebuilding its graph, a known
  ceiling of this container.

**Tests:**
- assembliesApply.test.mjs, on test/fixtures/raster-schedule.pdf (a plan
  sheet and a schedule sheet whose table is a picture, 62.5% of the page):
  the report names page 2 only, with its share and why, and 0 units. The
  project the panel reads carries the same sheets, and the browser's report
  of that project names them alike. federal-mech (PARITY) names none.
- report.test.ts: the report carries each sheet with why, the label is the
  printed sheet number and the page, the field is absent with none, and
  nothing else changes. reportPdf.test.ts: the PDF lists them, and none
  without them. panelSections.test.ts: the panel's notice, one sheet and
  two, and nothing with none.
- Disabling the session's check fails the MCP test; disabling the report's
  field fails the report and PDF tests.
- The Assemblies UI proof passes on 07_MO (6 checks: its five sheets named
  on screen, the parity checks with apply_assemblies) and 017_MD (12
  checks, its one sheet named).

**Addendum, the share past the sheet (found by round 11's fourth batch):**
the UI proof named 082_OR's M002 and M003, two scanned schedule sheets, as
"101% of the sheet is pictures". Placed images are summed (oneclick.ts), so
a scan that overhangs its page, or overlaps another image, sums past the
sheet. `pictureScheduleSheets` now gives at most the whole sheet (1, "100%"),
as the output schema's "0 to 1" says. A test stretches the fixture's picture
past the page's edges (117% summed) and expects 1; without the clamp it
reads 1.17 and fails. `sheet_graph`'s own note is unchanged.

## AS-55 — the Takeoff panel could not give a unit another typical (FIXED — this goal)

**Found:** 2026-09-27, by a census of the units no typical takes (98 cached
documents, 2,037 controls records), then by asking whether an estimator can
give them one. The panel offered a typical only for a unit that waits: the
exceptions' "Use …" buttons. A unit's details held its options and "Exclude
unit…" alone. So, in the panel:
- a rule's pick could not be changed (a box the estimator knows is cooling
  only, read as hot-water reheat, kept vav-reheat-hw);
- `lab-airflow`, which the starter applies only by override (its selector is
  `false`; NOTICE.md: "It is applied only by override"), was reachable from
  no control;
- a unit whose family no typical lists could take none. The census's controls
  families of that kind, each corpus twin counted once: 74 control valve rows
  (053_VA's 38, 072_CA's 22, the ITD District 1 lab's 9, 013_MO's 3, 009_FL's
  2), 21 lab air valves (the ITD District 1 lab's GEV rows), 26 control
  dampers (096_IN's 24, 16_NV's 2) and 4 flow meters. 26_CA's seven
  constant-volume exhaust terminals are VAV units whose selectors are all
  false, so they took none either.

`apply_assemblies` could do all three: an override names a typical by id, and
the engine takes it whatever its family (select.ts) as long as its layer is
the record's (expand.ts `overrideFits`).

A partner library covers any of those families already: a probe gave each of
the 31 families a partner typical, through the library CSV round trip and the
combined gate, and every one of the 602 units took it (0 failures). The gap
was the panel's.

**Fix (the list is the shared path's; only the control is the panel's):**
- **`typicalChoices(family, library, layer)`** (web/src/lib/assemblies/select.ts):
  the newest equipment typicals of the layer that list the family, and the
  layer's others. `selectAssembly`'s candidates are now its first list, so
  what the rules choose among and what an estimator is offered are one list.
- **The panel** (UnitDetail): **Use another typical…**, beside Exclude unit…,
  on a unit's own row (never the project's, never an excluded one). It offers
  the other typicals of the unit's family, or, for a family no typical lists,
  the layer's others, each as `id@version: title`. Choosing one asks why and
  writes the override `apply_assemblies` takes. **…for all N like it** makes
  the same choice for every row like the unit, `unitsLike` (report.ts): the
  rows of its schedule (sheet and title) of its family and layer with its
  typical, or none, never an excluded row or the project's own. One reason,
  an override each, as the exceptions' groups ("Use … for all N", 5d199ba).
- **MCP:** an override's `assembly` already named any typical of the layer.
  **Addendum:** with `detail` `units` or `lines`, `apply_assemblies` now lists
  the choices as the panel offers them (`typical_choices`: `by_family`, each of
  the reply's families' own per layer, from `typicalChoices`, and `by_layer`,
  each layer's whole list), so an agent can offer the estimator the same
  choices; the README and AGENT_GUIDE say to name one only on the
  estimator's word. The PARITY test holds every family's list to
  `typicalChoices` on federal-mech (`lab-airflow@1` among the VAV typicals),
  and a summary reply carries none.
- **Unchanged:** no record or line without a choice. A typical whose lines
  read values the unit's row does not print leaves the unit among the
  exceptions, waiting for them (AS-47): a lab air valve given
  vav-reheat-hw waits for `attr.cfm_max` and `attr.hw_conn_in`.
- **Not done, for the library review (INPUT 4):** listing LAB_AIR_VALVE among
  `lab-airflow`'s families, so the lab valves are offered it first. The starter
  is frozen at v1 (starter.test.ts: "Changing one is a new library version,
  never an edit of v1"), and `lab-airflow`'s room-level lines (the room
  pressure sensor, the program) would count once per valve where a lab room
  has several; a partner review decides both. Control valves, dampers and flow
  meters have no starter typical: the hook-ups count a coil's valve
  (research 04), and the valve schedule rows feed the HIT workbook.

**Measured:**
- **A/B, the main tree's engine against this one** over the 98 cached
  documents: with no override, and with an override choosing each other
  typical offered for up to six units a document (3 each): 526 runs, 0
  differences. Every one of the 428 choices is taken (`selected_by: "user"`);
  43 of them wait for values the unit's row does not print. With the helper
  broken (dropping one of the family's typicals), all 973 runs differ.
- **UI proof:** on every document, parity-only ones included, the
  Assemblies proof now chooses another typical from a unit's details, then
  makes one choice for every row like a unit. Each record is the user's
  choice with its reason ("decided together" for the rows), and no override
  applies to nothing. 068_US passes 13 checks (P-1, a pump, takes pump-vfd),
  069_ID 14 (AHU-1(E) takes ahu-constant-volume and waits for the
  economizer, AS-47; the 4 pumps like BP-1 take pump-vfd together) and 053_VA
  7 (EG-A, a grille, takes another family's typical; the 4 grilles like RG-A
  together).
- **093_ME, found by round 11's fourth batch:** the proof failed there in
  itself. Its 20 VRF indoor and 3 VRF outdoor units resolve with typicals
  that carry no option, and only the project's own records wait, so the
  proof found no override to make. The typical choice is that override now
  (DWH-1, a water heater no typical lists), and 093_ME passes 12 checks.

**Tests:**
- engine.test.ts: a unit's choices are its family's (the rules' pick among
  them, a part never one, another layer's not this layer's, the newest
  version only); a family no typical lists has none of its own and the
  layer's others, and the rules pick none; the estimator's choice of one
  applies as theirs, with nothing unmatched or ignored; one whose lines read
  what the row does not print waits, naming it.
- panelSections.test.ts: the control offers the family's other typicals and
  not the one the unit has, another family's only when none of its own
  exists, nothing when there is nothing else to choose, and choosing writes
  `{ assembly: { id, version } }` with what was chosen for the reason prompt;
  the second list appears only with rows like the unit, and makes its choice
  for all of them.
- report.test.ts: `unitsLike` takes the schedule's rows of the unit's family
  and layer with its typical, or none, and never an excluded row, a row with
  another typical, another schedule, sheet, family or layer, or the
  project's own records.

## AS-56 — three censuses of what an estimate could get wrong without a word (MEASURED; NO DEFECT)

**Run:** 2026-09-27, over the 98 cached documents (held-out filtered), each
a read-only script with a negative control that fails.
- **Multipliers:** a unit whose row prints a quantity under one mark
  multiplies every line, so a misread one inflates the estimate silently.
  16 of 2,037 controls records carry one: 28_WA's VHP (43 heat pumps under
  one mark, its QUANTITY column), the ITD District 1 lab's LEF-1 and
  031_MO's WHSE-SF1 (2 fans under one mark, "BLOWER # OF FANS" and "FAN
  NUMBER OF FANS", as the dev key reads LEF-1), and 12 of 017_MD's duct
  coils (COIL DATA QUANTITY, no typical). Each is its print.
- **Units read twice:** a tag and family read from two rows would take its
  typical twice. None of the 2,037 units is.
- **The project questions' claims:** each question card says how many lines
  and records each answer changes. For every shown question and every
  answer on every document (285 answers; 64 documents show questions), the
  answer went through the journal as the panel records it (appendAnswer,
  replayAnswers, answerSettings), and a fresh apply was diffed against one
  without it: every count is the card's. The 793 answers of questions never
  shown change nothing. With PQ1's yes and no swapped in the journal path,
  all 128 PQ1 answers fail.
