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
| 50d2547, f97e7ab | Ink-lettered and pictured schedules on text-starved sheets: 020_MO 0 → 27, 29_TX 0 → 2 (both re-keyed from render); OCR only for schedule-shaped grids; shipped MCP runtime no longer crashes on a picture |
| e789663 | VAV family reads FAN TERMINAL UNIT schedules and FTU marks with status letters (020_MO's 19 FTU) |

## Known limits (documented, not fixed)

- `sweep_schedule_row` on a tag ranked by claims (compound luminaire labels, air-device tables) tries every
  same-sheet occurrence as the anchor × 3 pads, with two region-restricted `matchSymbol` calls each. On
  baker-county-eoc R1 (23 luminaires on a 61k-segment lighting plan) that is 69 + 69 calls, 1-26 s each: one sweep
  takes 468 s and ~2 GB. Every other baker tag sweeps in under 25 s. Not changed: the ranking's last tie-break
  (more fingerprint segments) means no early exit preserves today's answers, and reworking the matcher is the parked
  symbol-finding work. The A/B's baker graph-eval OOM came from this sweep, not from the graph build (5.5 s spans +
  1.9 s graph); run alone it scores the same as base (cells 85.7%, rowsym 94.7%), peak 5.7 GB.

- 052_IL, 057_US: no equipment schedules in the set; empty takeoff is correct.

- Text-starved sheets cost graph time when they hold real tables: a cold build reads every schedule-shaped grid
  lettered in ink and every pasted picture on them (020_MO +401 s for its 17 schedules, 20_TX +177 s for an ink
  symbol legend, itd-d1-lab +60 s for a pasted load summary). Finished reads are cached per document. Timing method:
  compare cold against cold (`OPENTAKEOFF_PICTURE_CACHE=0` on base, or new code on new); the cache key includes the
  sidecar's source, so a base run at older code can hit reads cached long ago and look 10x faster.

- Hidden content under later opaque fills (013_MO): the CAD export stacks viewports and masks the earlier ones with
  white fills painted after them; every extractor reads the masked copies too. 013_MO's CONTROL VALVES row
  "CV-1 - CV-6" is lost to an interleaved hidden copy and its BOILERS grid (8 boilers) stops after the first row.
  Not clipping (pymupdf TEXT_CLIP and the clip paths keep them). Candidate rule on the sidecar: drop a word or rule
  covered by an opaque fill with a later paint order (pymupdf seqno). Census of text under later opaque fills over
  the keyed sets' files: 013_MO hides 31,802 characters (1,006 of 18,186 on one sheet); the next is 011_IL at 2,832
  (235 on every sheet, under its title block), then 26_CA at 2,114; 11 files hide more than 1,000. Not adopted:
  one set's schedules against a paint-order pass over every word and rule of every page; recorded as a ceiling.

- OCR on ink tags: 19_CA's E-6.2 MECHANICAL EQUIPMENT SCHEDULE (ink) reads CU-1/2, FC-1/2, EF-2, but its EF-1
  hexagon tag reads "F". Not pursued (OCR tuning).

- Pictured schedules on a sheet the router declines (15_IA's M2: a LAB AIR VALVE SCHEDULE of 6 valves and an
  AIRFLOW MEASURING STATION SCHEDULE of 2, pasted as transparent picture strips on a control diagram sheet). Three
  approaches measured 2026-10-02, none adopted:
  - Offer any non-plan sheet holding a picture of 1-50% of the sheet for its pictures alone (no grid read, no ODL
    fallback). 98 keyed sets hold such a picture; on 55 of them the pixel test (raster_regions, >= 62% paper and
    >= 3 full-width dark rows) accepts a picture on a sheet that names no schedule, and a sample of 29 accepted
    pictures held details, elevations, logos, Title 24 forms and panel schedules, not one HVAC schedule. Each costs
    an OCR read (3-110 s) for one set's 6 valves.
  - Composite a picture's soft mask before the pixel test (what the page renders): changes 26 pages over 116 sets.
    It rejects 5 junk pictures (058_CA's site photo on 3 sheets, a sprinkler plan's strips) but newly accepts about
    20 pasted drawings and details (07_MO's control diagrams on 8 sheets, 22_GA, 27_WA, 086_CA's load schedules:
    +139 s on 086_CA for no unit).
  - Count a rule once however thick (07_MO's control-diagram strips pass on one 3-pixel border): drops 130
    accepted regions, among them pictures on 29_TX's and 091_IL's MECHANICAL SCHEDULE sheets and 029_ME's ME601.
  The pixel test is the weak point; a stronger one needs column structure judged over a whole tiled picture.

- 086_CA's M0.1 EXISTING EQUIPMENT SCHEDULE is a scan (a transparent picture of the whole drawing area): rooftop
  units AC-1..8, exhaust fans EF-1..8, VVT boxes VT 3-0..4-3. The picture reader finds two of the three grids but
  loses the rooftop table's CODE column and the fan table's header, so no unit is counted (the takeoff reads 0 of
  28). Scanned-table reading quality; not pursued.

## Known failing tests (pre-existing, not from this goal's work)

- MCP `conformance.test.ts` "sheet graph (#87) … find_schedule": room 134's EAST finish no longer chains to its
  material-schedule definition (`SMOKEY MOUNTAIN AC-18` expected, undefined). Fails identically at the PR #108
  merge `4255465`, before any of this goal's commits.
- `corpusTakeoffWp1Acceptance` federal BAS (89 vs 26 expected) and 04_NV (19 vs 16): identical at 302cf34 and at
  `4255465`. 04_NV's three extra lines are LV-1/LV-2 (louvers) and WS-1 (water softener), read by family rules newer
  than the key; the key was not changed (rule: never edit a key to pass). 16_NV (62 vs 58) is fixed above.
- MCP `basServedEquipmentPlanPaint` (all 5 sets) fails its first assertion, the BAS point-row total against
  `bas_points.rows` in the cross-set compile keys (021_XX 109 vs 63, 015_VA 75 vs 39). Those keys were last written
  at 6fabaeb; the row count grew with the later point-list reading work (AS-132..135). Replaying the BAS compile
  on saved graphs gives the same totals at c637a3d (before the 2026-10-02 batch) and at c7e48ee (021_XX 109/109,
  015_VA 75/75), so the batch changed nothing here. The key needs re-counting from the drawings' point lists
  before this test means anything; not edited to pass. 015_VA was re-counted from its renders on 2026-10-03 (117
  points, which the takeoff now reads) and passes the row check, then fails the next: 2 of 35 served targets MATCH
  (floor 15), 25 AMBIGUOUS by the exact-tag rule below ("matching symbol geometry was not verified"), 8
  SCHEDULE_ONLY. The sweep is identical at e157911 (75 points; the same 35 targets and tallies). 021_XX was
  re-counted from its renders the same day (128 rows); the takeoff reads 127, the fume hood's VFD-1 dropped as a
  repeated row (see "A points list whose caption lost its spaces" below).
- MCP `valvePlanPaint.regression` (6 of 7 sets) fails its MATCH floor: every valve target sweeps to AMBIGUOUS,
  "Exact plan tag text was found, but matching symbol geometry was not verified" (062_ID 31 of 31, need >= 10
  MATCH). That verdict is `classifyBasServedSweepOutcome`'s rule from #94 (13dea24). 062_ID run alone fails
  identically at c637a3d and at HEAD, and the valve totals equal the keys at both (001_NC 163, 015_VA 36,
  062_ID 31, 021_XX 2, 096_IN 24). The file also never exits after its last test (an open handle), so a runner
  waits out its timeout.
- MCP `crossCorpusWorkflow` "WP1 keyed compile acceptance": federal-mech (BAS 89 vs 26) and 04_NV (19 vs 16) as
  above, plus 26_CA (HVAC 291 vs 10: its key is one of the stale partial keys below; 291 at c637a3d too) and 21_VA
  (102 vs 100: the documented RF1/RF2 residual from its technology sheet's AV list; c637a3d read 88). The structural
  sweep over every corpus PDF passes. 021_XX (re-keyed 2026-10-03) misses EXPANSION_TANK 0 of 4 and AIR_SEPARATOR 0
  of 2 (a general TANK SCHEDULE naming each row's kind in REMARKS) and BAS rows 127 of 128.
- MCP `reconcileWorkflow` "Vol2 lab mech 021: HVAC families honest SCHEDULE_ONLY": 11 AHU reconcile rows against
  6. An untitled duct pressure-class table on sheet 9 (rows "AHU-1,2, 4 ＆ 5", AHU-3, AHU-6 under NEGATIVE
  PRESSURES) is read as AHU rows; its full-width ＆ also hides AHU-5. The takeoff's AHU count (6, by mark) is
  unaffected. Identical at e157911 with the old key; the other families match the re-keyed counts (FCU 3, PUMP 18,
  FAN 19, BOILER 4, GRD 6, all SCHEDULE_ONLY).
- MCP `reconcileWorkflow` "Vol2 ITD D1 lab 062: plan-drawn HVAC families MATCH": FCU (DFC-1, F-1), LOUVER (L-1,
  L-2), LOUVERED_PENTHOUSE (PH-1) and GRD R-2 sweep to AMBIGUOUS under the same exact-tag rule, and GRD holds 11
  reconcile rows against the key's 7. Identical at 6a3e08a (graph rebuilt with that code) and at 45e69db.
- MCP `reconcileWorkflow` "Vol2 Salinity Lab 023: chiller plant honest SCHEDULE_ONLY" (CH-1 and CH-2 now MATCH;
  BT-1 AMBIGUOUS under the exact-tag rule) and "Vol2 unheated repair 008: UH + louver all MATCH" (L-1 AMBIGUOUS, same
  rule): identical at 6a3e08a and at 45e69db, graphs rebuilt with each.
- MCP `reconcileWorkflow` "SDSU EngSciences VAV reconcile ... (honest SO ceiling)": its negative control
  ECAV-NB-1 ("not plan text") sweeps to MATCH, at 6a3e08a (graph rebuilt with that code) as at HEAD; the other 14
  sampled tags MATCH as the test expects.

## Sweep re-run (OOM-lost sets)

8 of 29 re-swept clean on 2026-10-02 (038_NC, 073_MT, 029_ME, 077_MT, 096_IN 235 lines, 13_MI, 087_US,
016_NY 24 lines / 10 schedules): no product problems. 21 crashed again (Chrome OOM, see rules) and are still
unverified.

## Stale compile keys (found 2026-10-02)

35 `takeoffs/cross-set-compile/*.compile.json` keys say 0 items with notes like "no extractable HVAC tables": they
were written from pipeline output, not from the drawings, and only the WP1 acceptance list is scored, so nothing
fails on them. 095_UT's was hiding a real reading failure (fixed in 0881cd7, re-keyed from the render).

Node compile of every zero-key set at 2c1ba16 (one at a time): 16 now read units (039_TX 186 VAV, 036_LA 69,
07_MO 60, 082_OR 46, 091_IL 22, D_25_CO 19, 029_ME 9, 045_FL 9, 100_OH 7, 038_NC 6, 043_FL 4, 046_MI 4, 28_WA 4,
064_MT 2, 073_MT 2, 087_US 1), so those keys are stale.

Re-keyed from the renders 2026-10-02, those 16 and the three ink-only sets (each key's notes name its sheets and
marks; family names follow the takeoff's vocabulary, every judgment call disclosed in the notes). Key against what
the takeoff read at 2c1ba16:

| Set | Key | Read | Matched | Where the rest is |
|---|---|---|---|---|
| 039_TX | 186 | 186 | 186 | — (93 dual duct pairs, tagged C and H) |
| 07_MO | 112 | 60 | 60 | pictured titles OCR'd glued (CHILLERSCHEDULE, CONTROLVALVESCHEDULE), HEAT PUMP SPLIT SYSTEM (word order), tank/glycol/pot feeder/damper titles, a generic control valve schedule (35 valves, one a range CV-7 THRU 35), RTU-2 and FCU-1 in the AHU schedule |
| 036_LA | 86 | 69 | 68 | VRV (not VRF) titles: 15 indoor, 2 outdoor read as condensing units; COMPUTER ROOM AIR CONDITIONING |
| 082_OR | 55 | 46 | 46 | AIR DISTRIBUTION title (7 air devices, 2 louvers) |
| 038_NC | 51 | 6 | 4 | building prefix before letter-led marks (47-IDU-A301), IDU/ODU under MINI-SPLIT titles, DC CRAC title, IF fan; 2 pumps read that the key does not hold (to check) |
| 091_IL | 34 | 22 | 22 | pictured AHU (3) and RTU (1) tables not read; KITCHENEXHAUSTFANS glued; HYDRONIC COILS / ELECTRIC HEATING COIL titles |
| D_25_CO | 25 | 19 | 19 | RTU tags printed RTU over 1 (3); SPLIT SYSTEM INDOOR UNIT title (1); infrared tube heaters (2, no family) |
| 043_FL | 12 | 4 | 4 | page 20's five schedules are pictures on a sheet whose title is not in text (unrouted); the 4 pumps are read from E001 |
| 029_ME, 045_FL | 9, 9 | 9, 9 | 9, 9 | — |
| 100_OH, 28_WA, 046_MI | 7, 4, 4 | 7, 4, 4 | all | — |
| 087_US | 3 | 1 | 1 | PCH-1/2 chilled water pumps |
| 064_MT, 073_MT | 2, 2 | 2, 2 | all | — |
| 056_NY | 35 | 0 → 2 | 0 → 2 | ink-only SCHEDULES sheets: read since #276; VAV/LAB/GRD titles wait on #278 |
| 08_ME | 9 | 0 → 2 | 0 → 2 | ink-only M102 fan schedule read since #276; cove heaters, louvers, P103 not yet |
| 19_CA | 6 | 0 → 5 | (marks OCR'd with a space: cu 1, FC 1) | ink-only E-6.2 read since #276 |

651 keyed units; the takeoff read 447 of them (and 3 the keys do not hold). The vocabulary and picture gaps above are
task #278: each rule gets a census over every cached graph before it is adopted.

058_CA aborted (311 sheets, heap). Still 0, checked by
render: 052_IL, 057_US (no schedules), 084_SC (the chiller is on the plan and the specs only; no schedule). 29_TX
was a real miss: its M9.01 schedules are pictures on a sheet with no text layer; read since 50d2547 and re-keyed
(2 units). 020_MO was a real miss too (schedules lettered as outlines): read since 50d2547/e789663 and re-keyed
(27 units). 048_NY checked by render: honest zero (no schedule sheet in the set; its notes cite an equipment
schedule that is not in it). 19_CA: real content in ink on E-6.2 (see Known limits).

Rendered 2026-10-02, the rest. Honest zeros: 006 (M000 legends and notes), 010 (civil and controls details), 02_UT
(FAA tower; no mechanical schedule sheet), 054 (its FLASH TANK SCHEDULE sizes a tank by condensate pump capacity in
a typical detail; no tagged unit), 055 (EHRM telecom), 080
(ceiling details, telecom pathways), 20_TX (a DDC point schedule, an ink symbol legend). Real misses: 056_NY (two
SCHEDULES sheets lettered entirely in ink: air handling unit, humidifier, pump, air inlets/outlets, air flow
control valve and CAV/VAV schedules) and 08_ME (M102's fan, cove heater and louver schedules, in ink): neither page
has any text, so neither was ever a sheet (task #276). 086_CA (a scanned existing-equipment schedule) and 15_IA
(pictures on a control diagram sheet): see Known limits.

### Ink-only pages are sheets (task #276, 2026-10-02)

A page with no text layer was never a sheet (`buildSheetGraph` kept only pages with text): 96 such pages on 12 keyed
sets, among them 056_NY's two SCHEDULES sheets, 08_ME's M102 and 19_CA's E-6.2. Every page is now a sheet; an
ink-only page gets role `unknown` and reaches the table reader as a text-starved drawing. A sidecar glance through
MuPDF's path list (letters dropped) answers a word-less, picture-less page with no schedule-shaped ink grid without
pdfplumber's parse; verified on all 97 ink-only pages: 72 answered by the glance, 0 that the full read would read.
The verdict is cached with the picture cache. Grid snapping made linear-ish in the same pass (c637a3d,
byte-identical on 120 random pages, 13.9 s → 1.6 s).

Cold A/B over the 12 sets (HEAD vs HEAD+change, picture cache off): units 361 → 370 (056_NY H-1, P-1; 08_ME EF-2,
EF-I; 19_CA cu 1, cu 2, EF 2, FC 1, FC 2), build 1,387 s → 2,424 s. The added time is the picture reader on ink
grids, most of them tables no family claims (22_GA: door, finish and occupant load schedules, 45 → 382 s; 17_FL:
door and window schedules, 51 → 199 s). With the picture cache warm, 17_FL reopens in 49 s and 056_NY in 58 s.
056_NY's other three tables (air inlets/outlets 9, air flow control valves 11, CAV/VAV 10) wait on the vocabulary
batch (#278). Known cost: a set whose architectural sheets are lettered in ink pays the picture reader for their
tables on its first open; a title-band pre-read that skips non-mechanical tables is the open option.

21_VA re-keyed from the render (2026-10-02, task #246): the old key (VAV 32, PUMP 1) counted only the first of the
VAV TERMINAL BOX SCHEDULE's two blocks and was written from pipeline output. Key now 100 units: VAV 57 (VAV-1-xx 32 +
VAV-2-xx 25, all 57 MATCH plan tags), AHU 2, FCU 1 + CONDENSING_UNIT 3 (ACU-1/ACCU-3 split pair, ACCU-1/2), chillers
2, boilers 2, pumps 5, water heater 1, fans 10, unit heaters 3, CRAH 2 (COMPUTER ROOM UNIT SCHEDULE, not read) and
GRD 12 (AIR DISTRIBUTION DEVICE SCHEDULE marks, not read). reconcileWorkflow: 7/7 against the new key.

012_MO re-keyed (task #246): VFD 16 (the E-sheet VFD SCHEDULE's 13 pump drives + VFD-CT-1..3 "(EXIST.)"), + AIR_SEPARATOR 2,
EXPANSION_TANK 1. Fixed since (sweep tries the bare mark): a row mark printed with a trailing status ("VFD-CT-1 (EXIST.)") keeps it (it can
tell an existing unit from a new one of the same mark), so it does not match the plan's bare VFD-CT-1 and stays
schedule-only; the test now asserts 13 MATCH + 3 SCHEDULE_ONLY. Also seen while A/B-ing: 032_PA's SPLIT SYSTEM OUTDOOR
UNIT (CONDENSER) table reads untitled because its region swallows the indoor table's notes band above it.

Vocabulary batch (#278) landed 2026-10-02 after an offline A/B on saved graphs (`$P/ink/vocab_ab.mjs`): 21 graphs so
far, +145 units on 9 sets, 0 lost, family error vs keys 141 closer, 0 farther. Known keyed gaps it leaves: 038_NC
CONDENSING_UNIT 16/23 and FCU 12/20, 21_VA GRD 4/12 (transposed air device table), 082_OR GRD 9 vs 7 (two louvers read
as grilles), 091_IL coils 3/6. Remaining ~95 graphs (and 030_NY, 26_CA, 07_MO, killed for memory with two lanes) are
being saved as a regression check of the mark-prefix change, which touches every set.

## Active work / next queue

1. ~~Corpus A/B~~ done (above). baker-county-eoc re-run alone: same as base (see Known limits). 089_FL still to re-run.
2. ~~Browser proof of Review all + auto-opened plan~~ — 18/18 on itd-d1-lab (2026-10-02).
3. MCP `npm test` and `test:shared-path` (includes #246: reconcileWorkflow's stale expectations).
4. Re-sweep the 29 OOM-lost sets one at a time, machine otherwise idle.
5. Re-measure graph build in the app on 25_WA / klamath with the machine quiet (sweep's 454 s was contention).

### A points list that ticks each point's columns; 012_MO's BAS points re-keyed (2026-10-03)

012_MO's key said 0 BAS rows; the takeoff read 102, none typed. M701 (sheet 20) prints one DDC POINTS LIST SUMMARY -
CHILLED WATER SYSTEM: header groups (DDC HARD WIRED POINTS, INTEGRATION, GUI APPLICATION, ALARMING SCENARIOS, ALARM
PRIORITIES, SUPPLEMENTARY NOTES), a CONTROL POINTS row printing each column's label under its group (DIGITAL INPUTS
... ANALOG OUTPUTS; BINARY, ANALOG, MULTISTAGE VARIABLE, READ ONLY, RED / WRITE; TREND LOGGING ...; OUT OF RANGE ...
CRITICAL), then 101 numbered points ticking X in their columns. The label row was counted as a point, and nothing read
a tick as a type.

Rule (corpusTakeoff.mjs `basTickColumns` / `basTickEvidence`, in `compileBasTakeoff`): a column's label is its header
plus the label row's cell; the label row is the one of a list's first three that names two or more distinct I/O types
(a point names one), and it is skipped. A tick (X, check, filled dot) under a column whose label ends in a type
(DIGITAL / BINARY / DISCRETE / ANALOG INPUT(S) / OUTPUT(S)) types an untyped point, the label kept as its printed type
and the X cell as its cite; ticks under two types, or one that disagrees with the mark's type, are a conflict
(untyped). Hardwired only when the ticked type column's label says HARD WIRED, PHYSICAL or FIELD I/O; soft when the
point ticks a BINARY / ANALOG / MULTISTAGE / MULTI-STATE VARIABLE or VALUE column and no type; ticks under labels with
TREND or ALARM are its trend and alarm. A printed ALARM / TREND / WIRING cell still wins.

Census over 150 cached graphs: 012_MO's list is the only tick matrix, by full type words or by AI/AO/BI/BO/DI/DO
column labels (0), so no abbreviated-column rule was added. A/B: only 012_MO's 5 cached graphs change, 102 rows → 101
(AI 33, AO 21, BI 23, BO 14; alarm 65, trend 101, hardwired 91, soft 9).

012_MO re-keyed from the render, all 101 points checked by eye: DIGITAL INPUTS 23, DIGITAL OUTPUTS 14, ANALOG INPUTS
33, ANALOG OUTPUTS 21 (91, all under DDC HARD WIRED POINTS); 9 integration variables (points 3-5, 17-19, 31-33);
point 1 (CHILLED WATER SYSTEM ENABLE) ticks only GUI APPLICATION columns, so it is neither hardwired nor soft and has
no I/O type; every point ticks TREND LOGGING; 65 tick an ALARMING SCENARIOS or ALARM PRIORITIES column (19, 18, 15
and 13 in the render's four bands of rows).

### A points list whose caption lost its spaces; 021_XX re-keyed (2026-10-03)

021_XX's key (written from pipeline output) read 63 BAS rows; the takeoff read 109. The renders (M-803 to M-805)
print seven DDC CONTROLLER INPUT/OUTPUT SUMMARY lists, one device or chiller interface point a row, 128 rows: hot
water boiler 19, air cooled chiller 34 (23 tagged, 11 interface rows printing a description alone), VAV AHU 100%
outside air with fume hoods 32 (under a FUME HOOD label row), lab fume hood exhaust 5, general exhaust 5,
administration AHU-3 & 6 30, VAV with return air 3. Three readers fell short:

- The boiler list's caption has no space glyphs (DDCCONTROLLERINPUTOUTPUTSUMMARY), and the BAS title gate wanted
  spaces. Rule (corpusTakeoff.mjs `isBasPointsListTitle`): a caption with no space at all is read by its letters
  (POINTSLIST, DDCCONTROLLERINPUTOUTPUT, ...), as family titles already are; a spaced caption is read as printed.
  Census over 147 cached graphs (4,525 tables): this is the one table the compact form newly admits.
- FUME HOOD, printed alone in the TAG ID column, was counted as a point. Rule (`isBasSectionLabelRow`): one printed
  cell, under a TAG or MARK header (not DESCRIPTION), no digit, not SPARE or FUTURE, is a section label. Census
  over 518 cached points lists (11,227 rows): one such row; the 10 description-only rows are 021_XX's chiller
  interface points and stay.
- Not fixed: the fume hood's VFD-1 prints the same text as the air handler's VFD-1 (its circles differ only by
  position), and the ODL reader drops a row whose key and every cell repeat an emitted row (B-20, written for a
  phantom row a hairline splits off a real one). Census of that rule over 388 saved replies and 18,334 cached ODL
  tables: 313 rows dropped; 83 whose key cell spans down from the row above (B-20's shape), 230 owning their key
  cell, 85 of those more than three rows from the row they repeat (panel circuits, mullion and message schedules,
  transposed attribute rows like VOLTAGE/PHASE, this VFD-1). Keeping far, key-owning repeats is the likely refinement
  but touches those 85 rows across many tables; not done here.

The lists mark each point's I/O type, trending and alarms with drawn circles, filled for a physical point and open
for a logical one; the text layer carries none of them, so AI/AO/BI/BO, alarm and trend read 0 and are not keyed.

021_XX re-keyed from M-601: AIR_COOLED_CHILLER 4 (CH-1..CH-4, each on a chilled-water and an ice-making line; the
key's HEAT_RECOVERY_CHILLER 1 is not on the drawings), PUMP 18 (P-1A,B..P-6A,B two a row, CP-1..CP-6), and the TANK
SCHEDULE's EXPANSION_TANK 4 (T-1..T-4) and AIR_SEPARATOR 2 (AS-1, AS-2), each named in REMARKS. The takeoff reads none
of the 6 (no rule reads a general TANK SCHEDULE's kinds from REMARKS; one such table in the 147 cached graphs).
Other families as before (AHU 6, FCU 3, BOILER 4, FAN 19, UNIT_HEATER 2, PRV 2, GRD 6, DUCT_SILENCER 10); storage
and ice storage tanks (no family), lab air valves and VAV sizes (types) are not keyed. BAS: 109 → 127 rows of 128.

### Points lists printed in I/O sections; 015_VA's BAS points re-keyed (2026-10-03)

015_VA's key read 39 BAS points and the takeoff 75. AM703–AM706 print nine points lists (the condenser water
system's, in two columns, the fan coil, generator exhaust fan, exhaust fan, unit heater, medium-pressure air
compressor relief, domestic water meter, gatehouse and ductless split system), each in I/O sections under MARK |
DESCRIPTION | ALARM | TREND. Counted from the renders: 117 points (AI 31, AO 10, BI 43, BO 33), 38 alarmed and 83
trended (AM703 69, 16, 50; AM704 30, 13, 27; AM705 10, 5, 3; AM706 8, 4, 3). Two readers lost the sections below a
list's first:

- The table engine rules each section off as a face. Only a list's first face carries its title and header; the
  faces below were refused as untitled fragments or kept as tables headed by their first point (ANALOG OUTPUT [AO-1,
  BYPASS VALVE, NO, YES]). Some faces open with the section above's last point, repeated at the seam. Rule
  (vectorGridAdapter.ts, `isPointSectionFragment`): a face whose first row, or second after a repeated point, is an
  I/O heading across the columns, followed by a point mark, stacks onto the nearest list face above it (never one
  below, never another section's face); concatFragments drops the repeated row as before.
- ODL: the right-hand list on AM703 wins adoption with six headers (MARK, DESCRIPTION, ALARM, ALARM 2, TREND, COL6;
  values read right). Its BINARY INPUT row also owns the empty sixth column's cell (row span 42), so half its cells
  span and classifyBodyRow read it as a grouping tier, naming every column with it. Rule (sheetgraph.ts): a row whose
  one printed cell is an I/O section heading is a divider, not a header tier; stripBasPointSectionHeadingRows drops
  it. The heading pattern is now shared (BAS_POINT_SECTION_HEADING_RE, which also reads plurals and UNIVERSAL).

Measured: grid replay, 2,359 tables, none changed; per reply over 388 saved pages, only 015_VA p24–p27 change
(rows 12,087 → 12,109). Of 682 cached ODL reads (18,334 tables), rows whose one printed cell is an I/O heading occur
in 015_VA's and 001_NC's points lists only; both rebuilt at e157911 and with the change: 001_NC identical (91
tables, 396 units, 546 points), 015_VA 44 → 36 tables (14 section fragments → 6 whole lists), 96 units unchanged,
points 75 → 117, alarms 33 → 38, trends 52 → 83, every BAS field equal to the re-keyed counts. Tests:
vectorGridAdapter (section stacking, the seam row, the direction rule; each fails at base) and sheetgraph (the
divider on AM703's own cell layout, failing at base; any other merged row still groups). Not adopted: a junk-aware
tableCompleteness (headers named COL n or repeated not counted). It flipped 1 of 1,065 adoption decisions but
would score 233 of 1,019 vectorgrid winners lower (their spanning duplicates).

015_VA against its key now misses only GRD (9 of 10, below).

### Split systems by their ductless marks; 015_VA and 035_AR re-keyed; graph cache keyed by interpreter (2026-10-03)

015_VA's key ([MEAT], from pipeline output) read CONDENSING_UNIT 1 against the takeoff's 4. The renders (AM107,
AM601, AM602, AM603) schedule four mini-split systems, wall units DSS-1..DSS-4 each beside its outdoor unit CU-1..CU-4,
and the gatehouse's split system SS-1 with its condensing unit HP-1. A census of split-system schedules over the 50
saved graphs found the indoor halves unread wherever their marks or titles were new: DSS (015_VA), DSFC and DSCU
(035_AR), SPLIT SYSTEM AIR CONDITIONER (015_VA SS-1), HEAT PUMP SPLIT SYSTEM (07_MO F1, F2), and the bare caption
ELECTRIC UNIT HEATER (015_VA UH-1..4). Rules added for each; A/B over 50 graphs changes only those sets (015_VA FCU
4 → 9, UH 0 → 4; 035_AR FCU 0 → 3, CU 0 → 3; 07_MO FCU 0 → 2 of 3), the grid replay (48 sets, 1,061 tables) changes
015_VA and 07_MO alone, and 88 sets of snapshot tables change nothing. Re-keyed from the renders: 015_VA (FCU 9,
CONDENSING_UNIT 4 by their printed CU marks though each heats, UNIT_HEATER 4, GLYCOL_MAKEUP 1, GRD 10) and 035_AR
(CONDENSING_UNIT 3, FCU 3, LOUVER 3, FAN 1; PL101's lettered equipment list counted for its exhaust fan and wall
louver only, the water system's process equipment disclosed).

Residuals: 015_VA GRD 9 of 10 (the gatehouse's EG-1 is another grille than AM601's EG-1; the takeoff merges a mark
across tables). 030_NY's HEAT PUMP UNIT SCHEDULE pairs 016-AC-01-16-12 with 016-CU-01-16-12 under a split header, but
its title names HEAT_PUMP, so AS-144's header-shape path does not apply; its [MEAT] key (FCU 1 against 14 read)
needs a re-key first. 017_MD's INDOOR AIR CONDITIONING UNIT SCHEDULE lists ACU-A-1..6, built-up air handlers whose
fans and coils its key counts apart; not keyed as units. 07_MO's outdoor heat pumps print CUH (the hexagon lost its
1) and CUH 2. 035_AR's louvers read by type alone (LI, LE).

MCP reconcileWorkflow "Vol2 pier utility 015" fails at 6cc4aa6 (CONDENSING_UNIT 3 rows against the old key's 1;
dampers 19 of 21 MATCH, MD-6 and MD-11 AMBIGUOUS by the exact-tag verification rule) and after this change (FCU 9 of
9 MATCH; CONDENSING_UNIT 3 of 4 in the test environment). With the table engine's interpreter configured (as graph
builds run) the plan-drawn test passes, FCU 9 of 9 and CONDENSING_UNIT 4 of 4 MATCH; the damper test fails as at base.
The 3 comes from the environment, not the rules: the test
built its graph with no table-engine interpreter configured, so the system python3 (no pdfplumber) ran the engine,
every sheet fell back, and AM107's DUCTLESS SPLIT SYSTEM SCHEDULE lost its OUTDOOR UNIT MARK column. That graph was
cached under the same key a run with the interpreter would read: the graph cache now keys by the interpreter
(resolveVectorGridPython, shared with the client) and keeps no graph whose configured engine failed on a sheet for a
reason other than the page's geometry (test in sheetGraphCache.test.mjs; it fails on the old cache).

### Lettered expansion tanks, gas water heaters; 004_MO re-keyed (2026-10-03)

From the titled-row census above: 032_PA's EXPANSION TANK SCHEDULE keys its tanks NET A and NET B (TYPE (N)ET beside
EQUIPMENT NUMBER A, B; the key counts both). The takeoff now sets aside a glued new-status N before ET as it does
before AHU, FCU and the rest, and the tank rule reads one letter after a separator (ETC. and ETA still nothing).
004_MO's GAS WATER HEATER SCHEDULE GWH-1, GWH-2: GWH joins the water heater marks. 004_MO's [MEAT] key, written from
pipeline output, counted its plumbing sheet's softener and brine tank but none of the rest of P-601: re-keyed from
the render (PUMP 1 → 2 with SP-1 and HWRP-1; WATER_HEATER 2; MIXING_VALVE 1, TMV-1; EXPANSION_TANK 1, ET-1; GI-1, a
grease interceptor, has no family). 50 saved graphs, lib A/B: 032_PA ET 0 → 2, 004_MO WH 0 → 2, nothing else.

### A mark column under a group heading; 038_NC's condensate pumps (2026-10-03)

056_NY (render-keyed, 35 units) read 32 with the current sidecar (the saved graph predated the ink fixes). Its
untitled fan table prints MARK under a MARK INFORMATION band; the joined header "MARKINFORMATION MARK" matched no key
column, QTY keyed nothing, and the one-row table was refused. Now a table no pass keyed is keyed by the one column
whose header ends in a mark column's name (two such columns key nothing). Grid replay, 2,359 tables on 388 pages:
056_NY's fan table and 016_NY's window type table (W2..W4, no HVAC family) change, nothing else. 056_NY rebuilt
32 → 33 (FAN EF-2A). Residuals: AHU-PHARMACY-1 is printed wrapped in a narrow cell ("AHU-PHA" over "RMACY-1") and
its middle segment has 8 letters, past the 6 the tag shape allows; a census of every corpus text layer found no
equipment mark with a 7+ letter segment (only prose such as VENT-THROUGH-ROOF), and with the shape widened the
table is still refused (its one unit row is read into its four-tier header). Not taken. The HCD laminar flow
diffuser on MH6001 is not read either (GRD 9/10).

038_NC re-keyed from the render: sheet 54's electrical MECHANICAL EQUIPMENT SCHEDULE lists 47-CP-1 and 47-CP-2,
CONDENSATE PUMP (120 V, 1/30 HP), tagged on sheet 39 and found on no mechanical sheet. The key, written from
mechanical sheet 20, lacked them; PUMP 2 added (as 19_CA's key counts its electrical equipment schedule). The
takeoff read them before the change.

091_IL (render-keyed, 34 units) read 30: M4.01 prints ten pictured schedules whose tags are split into ABB. and
NO. columns ("AHU" | "3A-01"). Its RTU and AHU schedules were refused, each unit row read into the header: the units
take two lines (cooling and electric coils; a second compressor circuit), AS-146's two-line test wanted a mark in
the first cell, and the AHU's NONE merged across its return-fan columns read as a column grouping. Now, where the
header prints ABB. over NO., the pair is the row's mark (keyed AHU-3A-01), a line under it owning a quarter of the
columns or fewer is its second line, and a merged NONE / N/A / NOT USED / dash is a value, not a group (AS-146's
own test of a merged real value still holds). Grid replay: only 091_IL's eight split-tag tables change (a first
version without the header check joined a panel schedule's NOTES | # into EX-1, EX-3; reverted to the header
gate). 091_IL rebuilt: 30 → 34 = key (RTU-1, AHU-3A-01/3A-02/6B-01; RF-1B-1 now keyed whole; CC-1, CU-1... keyed
with their hyphen).

043_FL's pictured schedules now all build with the current sidecar, but the AHU's one row is ED-203 and the
humidifier's ED-203-HC (the unit named by its system, no family letters), and a family's title alone does not
make a row its unit. Census over 50 saved graphs of titled one-to-three-row tables whose marks the titled family
does not read: 20, mixed (units another family already counts, such as DOAS-1, HP-2, CRAH-T1A; junk rows "NO",
"NOTES"; possible key gaps, 004_MO's GWH-1/2 under GAS WATER HEATER and 032_PA's NET A/B under EXPANSION TANK).
No rule taken; 043_FL AHU 0/1 and HUMIDIFIER 0/1 stay.

036_LA CONDENSING_UNIT 33/34: its COMPUTER ROOM AIR CONDITIONING row pairs 07-EVAP-1 (INDOOR UNIT MARK NO.) with
07-COND-1 (OUTDOOR UNIT MARK NO.), the key's 34th condensing unit. Reading it takes three changes: the split-pair
header rule accepting a trailing NO. (only this table in the 50 saved graphs), a split reading under a title that
names another family (AS-144 keeps a titled table's own reading on purpose), and COND as a condenser's split mark.
One unit; not taken.

19_CA FAN 1/2: E-6.2's ink schedule prints its marks in hexagons; the outline eraser removes the slanted sides,
but a faint residue of the top edge touches "EF", and OCR reads EF-1's cell as "F" (a re-read of the cell alone
reads "F" and "1" too). Same class as 07_MO's hexagon marks; retuning the cleaning re-reads every pictured table
of the corpus. Not taken.

Scoreboard over the 50 saved graphs (current lib): key 2,171 units, 76 under, 692 over. Most "over" is the stale
partial keys listed above (26_CA 283, 096_IN 81, 05_MO 60, 028_TX 39, 014_MT 32, 030_NY 27, 019_FL 25, 016_NY 23);
several saved graphs predate later fixes (032_PA, 08_ME, 056_NY), so a fresh rebuild is the next measurement.

### Role-suffixed marks under a family title (2026-10-03)

043_FL FAN 0/2: ED-203-SF and ED-203-RF (the AHU's fans) under its FAN SCHEDULE; read now (titled only, the last
segment a family token). Census over 50 saved graphs: no other refused row of that shape. Not taken: 043_FL's
humidifier ED-203-HC (HC is no humidifier token) and its pictured AHU schedule (not read from its picture), and 07_MO's
hexagon marks (OCR "D" for D-1, "C L" for C-1, a "CH ILER" title), one set's OCR quirks.

### Double header rules, ink-lettered one-unit schedules, N/A rows (2026-10-03)

08_ME (render-keyed, 9 units) read 2: its ink-lettered M102 and P103 rule every schedule with a double rule under
the header, and the grid finder's title-band splitter cut each at the slot between the two rules (one full-width
face). Census of every title-band cut over the 388 replayed table-bearing pages: 157 cuts; a slot (under half a
row, empty, divided row below, same column edges) on 10 pages of 8 sets: 08_ME, 023_US, 02_UT (electrical panel
schedules), 062_ID (a gas chart's TOTAL row), 008_MO (overhead-door elevation grids), 016_NY, 21_VA (a grounding
schedule). On text pages another table source already read 023_US's three schedules whole, so units are unchanged
there (old vs new graphs rebuilt for 023_US, 02_UT, 062_ID, 08_ME, 21_VA). Ink-only pages (all 135 in the
corpus): the slot rule and the new 17-face floor for grids at least 300pt wide change only 08_ME's grids and admit
two non-HVAC tables (11_CA separation distances, 22_GA footings; no units). 023_US's now-whole pump schedule
exposed a blank row printing N/A, split into pumps N and A: rows whose mark says N/A or holds no letter or digit
are no unit (takeoff and reconcile). OCR read 08_ME's 1s as I (EF-I, CH-I, ET-I): picture-read marks only, the
census found no other picture table with such a mark. Cove heaters join UNIT_HEATER; plumbing specialties host ET
and MV marks (a catch-all reading was tried first and refused: it let 031_MO's architectural furnishings list count
RF-2, a refrigerator, as a fan). 08_ME 2 → 8 of 9. Residuals: its ELECTRIC WATER HEATER (WH-1) and HEAT TRACE
schedules on P103 come apart into column strips in the full read (the page's one table pen is its border weight)
though the glance sees them whole; reading wordless pages with the glance's own rules would touch every ink-lettered
set's picture reads, not taken. OCR read L-1 as "L 一" (a CJK stroke); the louver count is right. Web suite: 4,229
tests, 4,215 pass, 0 fail after the AS-153 picture-cache test counts picture reads only (it also counted the
glance verdict kept beside them since #276; the run that showed 0 failures before had no sidecar Python and skipped
it).

### Guard and residuals after the 2026-10-02 batch

Full web suite at 4f48e01 (+ docs): 4,197 tests, 4,184 pass, 0 fail (13
skipped/todo). MCP typecheck clean; T-HVAC-01 takeoff regression passes.
Render-keyed residuals, each judged not worth a rule yet: 043_FL PUMP 6/4 (OCR
lost a digit and a letter in the pump schedule, "CWP-& CWP-2" / "HVP-& HVP-2",
and the electrical MECHANICAL EQUIPMENT SCHEDULE lists "CWP 9-10", which
disagrees with the mechanical numbering); 082_OR's LV-1/LV-2 louvers (since fixed: louver host title + grille
yieldKeyRe, GRD 7 + LOUVER 2 = key); 038_NC 47-ODU-BC143C a heat pump by its heating column (census over 50 saved
graphs: outdoor rows printing a heating value are 015_VA's four mini-split heat
pumps, 038_NC's one, plus false friends, 016_NY's TOTAL HEAT REJECTION and
062_ID's gas-fired split; keys disagree on the family, so not adopted); 21_VA RF1/RF2
from a technology sheet's AV list (see the rejected gate above). Grid-replay
census found abbreviation legends ("PWM - PULSE WIDTH MODULATED", "FU - FUSED")
printed as small grids above the header of 031_MO's VFD and disconnect schedules
and 016_NY's equipment connection schedule, fused into column names; counts are
unaffected, attribute names are not. Stale partial keys (05_MO, 028_TX, 016_NY,
096_IN, 014_MT, 019_FL, 030_NY, 26_CA) over-read only from titled family
schedules (030_NY checked table by table), so they need re-keying before their
over-reads can be scored.

### Rejected: untitled tables gated by their share of HVAC marks (2026-10-02)

21_VA's FAN 12/10: RF1, RF2 come from an untitled audio-visual device list on a
technology sheet (#117: CA1, FB1, FP1, JB1 …). Gating an untitled table on the
share of its rows any HVAC family reads did not separate it (the families' mark
rules are broad: FP, T, S all read), and it dropped six 26_CA AHU rows
(AHU 50-2 … 58-2) unverified. Reverted. The discriminating signal is the
sheet's discipline (a T-sheet holds no HVAC schedule), a larger change kept
for later.

### 07_MO pictured schedules: tanks, glycol, pot feeder (2026-10-02)

+5 units (EXT-1, EXT-2, CBT-1, GF-1, CPF-1), all in its key; 015_VA +1 (GFS-1,
a titled GLYCOL FEED SYSTEM row its older partial key omits). 07_MO gaps left
(46 units): CONTROL VALVE SCHEDULE (35) since fixed — water read from SERVES
coil abbreviations, glued title and "THRU35" range accepted, CHW 3 + HHW 32 =
key; still open: DAMPER SCHEDULE (5 control dampers; OCR lost D-1's digit,
generic title qualified only by a CONTROL DAMPER column); "CH ILERSCHEDULE"
(OCR-garbled chiller title); HEAT PUMP SPLIT SYSTEM F-1/F-2 (indoor furnaces,
keyed FCU) with CUH-1/2 (keyed heat pumps, not in the extracted rows); AIR
HANDLER UNIT SCHEDULE's RTU-2 and FCU-1 (keyed AHU and FCU; the AHU mark rule
reads AHU/AC only).

### 032_PA's outdoor units: title beside notes, two-tier header (2026-10-02)

The SPLIT SYSTEM OUTDOOR UNIT (CONDENSER) SCHEDULE (38 units) never reached the
graph: title beside a NOTES column (too narrow for a title rule), notes fused
into every header, and the leaf header tier read as a unit "TYPE". Fixed in the
vector-grid adapter (widenLeadingProse: title row naming a SCHEDULE widened,
leading notes rows dropped) and the table builder (a row under a header label
that runs down, whose own labels each sit in one column, is the leaf tier;
titled tables only). Plus "SPLIT SYSTEM OUTDOOR UNIT" → CONDENSING_UNIT.

New instrument: grid replay (`opentakeoff/scripts/grid-replay/`). For every
table-bearing page of the 45 saved graphs (344 pages), vectorgrid replies were
saved once (`pages.mjs` lists pages, `replay.py` saves replies, ~1 s/page) and
both versions of vectorGridTableToScheduleTable are run over every table
(`ab.mts`), seconds per A/B instead of rebuilding graphs.
Final: 1,930 tables, 13 changed, none lost a unit: 032_PA read; titles found
(014_MT, 020_MO); header-label rows (MARK, SYMBOL) and one-row header-only
fragments no longer data; headers cleaned. Rejected on the way: (a) merging the
notes rows into one prose cell (fused them back into the headers); (b) ending
the header at the first row printing its own first cell (pulled 012_MO's panel
circuit 1 into a header, broke AS-146's grouped-tier tests); (c) the rule on
untitled grids (kept title blocks and revision blocks as tables). 032_PA graph
rebuilt with the final code: CONDENSING_UNIT 0 → 38 (= key); EXPANSION_TANK
0/2 remains (marks NET A/B, a status letter glued to the family letters).

### Transposed air devices named by letters (2026-10-02)

21_VA's GRD 4/12 was worse than a miss: the four "grilles" read were attribute
names (DEVICE, NECK, MODEL NUMBER, CONSTRUCTION) from the transposed AIR
DISTRIBUTION DEVICE SCHEDULE. transposedScheduleView now accepts letter-only
type marks under a first-column corner with worded rows. Offline A/B over 45
saved graphs: 1 set changed, +12 −4 units (the 4 phantoms), 21_VA GRD = key.

### OCR title abbreviations, rooftop PACKAGE unit (2026-10-02)

Offline A/B over 45 saved graphs: 2 sets changed, +8 −0 units, error vs keys
8 closer, 0 farther (091_IL FAN 4→6, DUCT_MOUNTED_COIL 3→6; D_25_CO RTU
0→3). Known remaining by-design misses on these sets: 043_FL's AHU ED-203 and
fans ED-203-SF/RF (marks named after the room, which a titled AHU/FAN table's
mark filter refuses on purpose); 091_IL's AHU and RTU pictures produce no
table. Ranking keys by error showed many older keys list only some families
(05_MO, 028_TX, 016_NY, 096_IN "[WEAK]"/partial). Over-reads there are real
schedules (05_MO's AIR HANDLING UNIT SCHEDULE has 4 units, the key lists 1), so
those sets need re-keying from renders before over-reads can be scored.

### Room-code unit marks after a numbered building (2026-10-02)

038_NC numbers 8 of its 20 mini-split pairs by the room each serves:
floor + wing + room (47-IDU-1A137, 47-ODU-2E202A). `markCoreForKeyRe`
stripped the building number but refused the remainder (IDU-1A137 is not a
SHORT_EQUIP_MARK_RE shape), so those rows reached no family. It now accepts
`FAMILY-<floor><wing><room>` after a numbered building only. Offline A/B over
all 45 saved graphs: 1 set changed, +16 −0 units, 038_NC FCU 12→20 (key 20),
CONDENSING_UNIT 16→24. Gap left: the key counts 47-ODU-BC143C as HEAT_PUMP
(the only outdoor row printing heating capacity, 40,000 Btu/h). The takeoff
has no per-row family split by a heating column, so it stays a
CONDENSING_UNIT (units total right, one in the wrong family).
