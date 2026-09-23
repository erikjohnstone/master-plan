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
