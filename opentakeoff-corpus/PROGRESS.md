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
| 056_NY | 35 | 0 | 0 | ink-only SCHEDULES sheets (task #276) |
| 08_ME | 9 | 0 | 0 | ink-only M102 and P103 (task #276) |
| 19_CA | 6 | 0 | 0 | ink-only E-6.2 (task #276) |

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

## Active work / next queue

1. ~~Corpus A/B~~ done (above). baker-county-eoc re-run alone: same as base (see Known limits). 089_FL still to re-run.
2. ~~Browser proof of Review all + auto-opened plan~~ — 18/18 on itd-d1-lab (2026-10-02).
3. MCP `npm test` and `test:shared-path` (includes #246: reconcileWorkflow's stale expectations).
4. Re-sweep the 29 OOM-lost sets one at a time, machine otherwise idle.
5. Re-measure graph build in the app on 25_WA / klamath with the machine quiet (sweep's 454 s was contention).
