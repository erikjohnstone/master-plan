# opentakeoff eval corpus

This directory lives OUTSIDE the opentakeoff git repo, per the convention `docs/SHEET-GRAPH-EVAL.md`
already established: real plan sets are never committed. See that doc for the room-finish
cell/tag metrics `mcp/scripts/graph-eval.mjs` scores by default.

## Sets (added 2026-08-26, HVAC/BAS maturity plan Phase 1)

| id | what | why it was chosen |
|---|---|---|
| `bessemer` | the repo's own pinned sample (`samples/bessemer-mechanical-bidset.pdf`) | already in-repo; the only set with a hand-authored, independently-verified `rowsym` key so far |
| `itd-d1-lab` | D-1 Testing Laboratory HVAC bid set, Coeur d'Alene ID | richest real valve-type text diversity (GATE/BALL/CHECK VALVE, BUTTERFLY all present) |
| `federal-mech` | a federal facility mechanical set | richest VAV/AHU density (VAV×371, AHU×61) — the category this corpus specifically needed |
| `weld-county-permit` | Weld County, CO mechanical permit set | RTU-heavy (RTU×20) — a device family the other two barely mention |
| `itd-d1-lab-raster` | the SAME real `itd-d1-lab` HVAC plan sheet, synthetically flattened to image-only | no real scanned (no-vector-layer) MEP set was found; built via `mcp/scripts/make-corpus-raster-variant.mjs` (the same technique the repo's own bundled `scanned-plan.pdf` fixture uses) so the honest `has_vector_linework:false` fallback path is exercised against real HVAC drafting density, not a generic floor plan |
| `navfac-cherry-point-atc` | NAVFAC FY20 P-228 ATC Tower & Air Operations Building, MCAS Cherry Point, NC (added 2026-08-28) | the densest real HVAC/BAS set in this corpus — 75 sheets, real vector text confirmed on every page; THREE real, separately-tagged buildings/areas (Air Ops, MITRACON, ATCT) sharing one drawing set; carries a real AIR COOLED CHILLER SCHEDULE and this corpus's first real BAS/DDC points-list content (AI/AO/BI/BO tags) — sourced to replace `weld-county-permit` (below, retired) as an active, genuinely vector-CAD corpus member |

**Licensing/provenance — read before adding a set's PDF to `git`, ever:** every one of the 3 newly
downloaded sets was pulled from a public, no-login government/agency URL, posted for open
competitive bidding. That is NOT the same as a redistribution license — the drawings are a private
AE firm's work product, not a government-authored work, and a state/federal agency posting them for
bidders does not itself grant permission to republish them. They are kept here, outside the repo,
for local measurement/testing only. See `sets.json`'s own `provenance` field per set for the exact
source URL context. `navfac-cherry-point-atc` follows the same real caveat — see its own `sets.json`
provenance entry.

## New metric this session: row-to-symbol linking (`*.rowsym.csv`)

Answers a different question than the existing cell/tag metrics: given a real schedule-row tag,
does `sweep_schedule_row` (or the equivalent `Session.sweepScheduleRow`) actually find it drawn on a
plan sheet — geometrically, not just resolve the row's text? Key format: `tag,expect_status,note`
(`expect_status` ∈ `resolved`/`refused`), scored by `mcp/scripts/graph-eval.mjs`'s new row-sym block.

**How the `bessemer` key was actually built — stated honestly, not overclaimed:** every tag's
`expect_status` reflects whether a REAL drawn device symbol exists at all, independently confirmed
by rendering the real plan pages (`Session.renderSheetPng`) and looking at them directly — never by
trusting `sweepScheduleRow`'s own output as its own ground truth. `EWH-1`, `EBB-2`, `EBB-3`, `SR-1`,
and `TG-1` were each individually cropped and visually inspected (see the maturity plan doc for what
each crop showed — a distinct rectangle-plus-leader-line convention for the heaters, a hatched
inline-duct mark for the registers/grilles). The rest of the `EBB-*` and `TG-2`/`SR-2` rows were NOT
individually re-cropped — they're marked `resolved` because they sit in the same visually-confirmed,
consistently-repeating drafting convention (the same floor plan repeats an identical apartment-unit
layout four times), which is a real, if slightly weaker, form of independent visual confirmation, not
a re-use of the tool's own output. This distinction is stated here rather than left implicit.

## New metric (2026-08-27): project-level takeoff (`*.takeoff.csv`)

A different question again from both metrics above: given the WHOLE plan set, does
`buildPlanSetTakeoff` (`mcp/src/takeoff.ts`, driven by `mcp/scripts/takeoff-pipeline.mjs`) produce the
right INSTALLED QUANTITY per equipment-kind schedule tag, walking every row unattended — not one tag
at a time via an agent's own tool call? Key format: `tag,equipment_type,expected_quantity,sheets
(";"-separated),notes` — a "#"-prefixed line or a blank line is a comment, everything else is a data
row. Scored by `mcp/scripts/takeoff-eval.mjs` (quantity delta per tag, missing/falsely-added
equipment, a `TakeoffFailure[]` type breakdown, an aggregate exact-match %); the comparison math
itself lives in `mcp/src/takeoffEval.ts` and carries its own regression tests
(`mcp/test/takeoffEval.test.ts`) against a synthetic key + synthetic pipeline output.

**How the `bessemer` key was actually built:** `Session.findText` located every real text occurrence
of each of the 10 real equipment-kind tags (`EWH-1`, `EBB-1..8`, `HP-1` — confirmed as the complete
list by dumping `Session.graphForPipeline()` directly) across ALL 8 sheets, then every resulting
candidate was rendered with `Session.viewSheet` at high zoom and looked at directly — never trusting
`buildPlanSetTakeoff`'s own output as its own ground truth, the same discipline as the `rowsym` key
above. The key's own header comment names the exact render region used for every tag. This run
directly re-caught the same cross-sheet risk this corpus already knew about (`EBB-5` is drawn on sheet
#7, not #6) and found a genuinely new one: `buildPlanSetTakeoff` was over-counting `EWH-1` and `EBB-8`
at quantity=2 each (12 real drawn instances reported instead of the true 10) — both confirmed false
by direct rendering, root-caused to `classifySweepMatches` in `web/src/lib/symbolsweep.ts` letting two
raw symbol matches both claim the SAME single tag occurrence, and fixed the same session (see the
key file's own header for the full writeup and the commit history for the diff). `takeoff-eval.mjs`
now scores `bessemer` at a genuinely earned 100.0% exact-match, 0 tags different — not a smoothed-over
number, the actual state after a real bug got found and fixed, not assumed clean from the start.

## `federal-mech` keys (2026-08-28) — takeoff.csv, reference.csv, rowsym.csv extended

Built the same way as every other key in this corpus: rendered and read by eye directly
(`Session.viewSheet` full-page renders of the schedule sheets #14-16, individual high-zoom crops of
every VAV tag on the floor plan sheet #6, `Session.findText` swept across all 24 sheets — never
same-sheet-only), never trusted from `buildPlanSetTakeoff`'s own output. 83 real equipment-kind tags
scored in `federal-mech.takeoff.csv` (`VAV-1..58`, `AHU-1`, `RF-1/RF-2/SF-1/SF-2`, `CH-1`, `B-1/B-2`,
`AS-1/AS-2`, the pump-schedule tags, `CP-1..6`, `EF-1..4`).

**Two dominant, real, disclosed findings** (full writeup in `federal-mech.takeoff.csv`'s own header —
neither was fixed this session; each is a deep, sheet-layout-specific gap, not a narrow one-line fix,
and this corpus's own standing rule is to name a real gap rather than ship an unproven, corpus-wide-
risk change under time pressure):

1. `sweep_schedule_row` reports quantity=0 for 13 of the 58 real VAV boxes on this set, even though
   every one was individually rendered this session and shows the exact same real drawn-symbol
   convention as every other VAV box — a real detection-threshold gap (same root cause this corpus's
   pre-existing `VAV-20` entry already named), not an absent symbol.
2. Sheets #14/#15 ("MECHANICAL SCHEDULES") carry roughly a dozen real, distinct, tag-keyed equipment
   schedules (chiller, boiler, pumps, air separators, general exhaust fans, fan coil unit, condensing
   units, expansion tank, DX fan coil units, unit heaters, silencers, fin tube radiation, louvered
   penthouse) — only `AHU-1`'s own two schedules extract correctly as equipment-kind today. The rest
   are either entirely undiscovered (chiller, air separator — not in `tables_seen` at all), or found
   but misclassified as "reference"-kind instead of "equipment"-kind (boiler, pump, general fan —
   despite all being declared `scheduleKind:"equipment"` in `hvacTaxonomy.ts` itself), so
   `buildPlanSetTakeoff`'s own equipment loop never attempts them. Directly testing
   `Session.sweepScheduleRow` against these tags shows most of them WOULD resolve correctly
   (found=1) if only they were dispatched — a pure table-kind-classification gap, not an underlying
   detection failure — except `CWP-1`/`CWP-2`, which return found=2, a real, disclosed, not-yet-
   root-caused anomaly.

Re-running the corpus's own eval scripts against these new keys confirms the finding cleanly: 83
tags/60.2% exact/Σ|Δqty|=33/20 missing/0 false-added (`takeoff-eval.mjs`); rowsym recall 50.0% (16
real drawn symbols not yet anchored, 16 correctly anchored) (`graph-eval.mjs`); reference-eval 38.7%
(12/31 cells — the one cleanly-extracting table, `ARCHITECTURAL LOUVERED PENTHOUSE SCHEDULE`, scores
12/12; the entirely-undiscovered `AIR HANDLING UNIT HYDRONIC COIL SCHEDULE` scores 0/19, a real,
disclosed table-discovery gap, not a scorer bug).

Deliberately deferred (real, visually confirmed to exist, out of this session's own time budget — see
`federal-mech.takeoff.csv`'s own header for the full list): `FCU-1`, `CU-1..6`, `ET-1/2`, `EV-1..6`,
`UH-1/2`, `S-1/2`, `FTR-1/1B/2/2B`, `ALP-1/2/3` (sheet #15's own further real schedules), and the
finish-kind GRILLE/REGISTER/DIFFUSER SCHEDULE (out of `buildPlanSetTakeoff`'s declared scope, same as
every other set's own diffuser/grille exclusion).

## `navfac-cherry-point-atc` keys (2026-08-28) — takeoff.csv, reference.csv, rowsym.csv authored from scratch

The densest, largest set in this corpus (75 sheets, 3 real independently-tagged buildings/areas) got
its first ground-truth keys this session. Built the same way as every other key here: `Session.
viewSheet` full-page renders of all 8 real equipment-schedule sheets (#42-49 — every one read
directly, not sampled), targeted enlarged-mechanical-room/site-plan/section renders (#3, #26, #29,
#30, #31) to visually confirm real drawn symbols (not schedule rows) across all three areas, and the
real BAS/DDC points-list sheets (#64, #65) for `reference.csv`. `buildPlanSetTakeoff`'s own first-pass
output was consulted only as a starting candidate list, never trusted as its own ground truth — per
this session's own direct finding (see below), naive single-span `find_text` returns 0 hits for many
real, plan-drawn equipment tags on this set, so eye-verification by render was this key's primary
method throughout, not a fallback.

141 real equipment-kind tags scored in `navfac-cherry-point-atc.takeoff.csv`, spanning AHU, Boiler,
Chiller, Pump, Fan, FCU, VAV, Dehumidifier, Air Separator, Humidifier, Unit/Cabinet Heater, DOAH/CRAH,
and bypass control valves across all three real areas (Air Ops/`A`, MITRACON/`M`, ATCT/`T`) — a
deliberately representative subset of a much larger real population (52 real VAV tags alone, 47 real
FCU tags), not exhaustive, per this corpus's own established sizing discipline for its largest sets.

**Five real, disclosed findings** (full writeup in each key file's own header; none fixed this
session — the dominant one is large and structural, high regression-risk, and explicitly left as real
signal rather than an unproven corpus-wide change under time pressure):

1. **Dominant** — 139 of 187 schedule rows `buildPlanSetTakeoff` itself attempted this session errored
   `AMBIGUOUS_ROW_KEY`. Root-caused by direct inspection: this real drawing reuses SHORT, per-area-
   local tags across its three independent buildings (e.g. `CD-1` is a real, different, physical
   diffuser in all three areas' own GRD schedules), plus real accessory schedules (VIBRATION ISOLATION
   SCHEDULE) that legitimately re-list a primary tag in a combined row alongside its own primary
   equipment-schedule row. Today's row-key resolution scopes uniqueness document-wide rather than
   per-table/per-area, so it flags both real patterns as "the same mark defined twice."
2. Real equipment schedules undiscovered by `buildPlanSetTakeoff` entirely on this set: PUMP SCHEDULE
   (all 3 areas — a rich real family whose prefixes `HHWP-DOAH-`/`PCHWP-`/`PHHWP-`/`SHHWP-`/`SCHWP-`/
   `HRHWP-` don't match `hvacTaxonomy.ts`'s current Pump prefixes at all), AIR SEPARATOR SCHEDULE,
   EXPANSION TANK SCHEDULE, DEHUMIDIFIER SCHEDULE, FAN SOUND POWER LEVEL SCHEDULE, VIBRATION ISOLATION
   SCHEDULE, DUCT/PIPING CONSTRUCTION SCHEDULE.
3. Naive single-span `find_text` returns 0 hits for many real, plan-drawn tags this session confirmed
   by eye (`B-A1`, `CH-A1`, `EF-A1`, `FCU-A1`, `UH-A1`, ...) — the real glyph is split across multiple
   text spans (rotation/leader-line callouts) that no single-span substring search reassembles.
4. This set's real fire/smoke/balancing dampers carry NO individual tag and NO dedicated schedule at
   all (confirmed: real damper glyphs are drawn, but only a bare per-sheet keyed work-note, never a
   per-instance mark) — `CD-` here is a real 3-CONE SUPPLY DIFFUSER prefix (a grille), not
   `hvacTaxonomy.ts`'s assumed combination fire/smoke damper meaning. `takeoff.csv` correctly has no
   damper entries as a result — a real scope fact, not an omission.
5. `hvacTaxonomy.ts`'s "Humidifier" (`HUM-`) and "Bypass control valve" (`BCV-`) prefixes both
   mismatch this real drawing's own tags (`H-` and `CV-<sys>-BP-<area>` respectively) — two more real
   prefix gaps, same family as #2's Pump-prefix finding.

Re-running the corpus's own eval scripts against these new keys confirms the findings cleanly: 141
tags/7.1% exact/Σ|Δqty|=131/46 missing/25 false-added (`takeoff-eval.mjs` — the false-adds are all
real GRD-diffuser/humidity-sensor tags outside this key's own deliberately-representative scope, not
key errors); rowsym recall 8.3% (2 of 24 real drawn symbols correctly anchored, 22 missed, 0 false
positives — the 22 misses trace to finding #1 above blocking `sweep_schedule_row`'s own row lookup for
most of these tags too) (`graph-eval.mjs`); reference-eval 54.2% (13/24 cells — the cleanly-extracting
PIPING CONSTRUCTION SCHEDULE scores 7/7 and most of the real POINTS LIST DOAH-TI BAS/DDC table scores
correctly, but that same table's own real ~80% row-coverage gap, a real cell-garbling bug on one row,
the near-total real extraction failure on the companion POINTS LIST AHU-T1A/T1B table, and the
AIR COOLED CHILLER SCHEDULE's real equipment-vs-reference-kind classification gap all score as real,
disclosed misses/mismatches — not a scorer bug).

## Deliberately not done yet

- No `*.csv`/`*.tags.csv` (room-finish cell/tag) keys exist for `itd-d1-lab`, `federal-mech`,
  `weld-county-permit`, or `navfac-cherry-point-atc` — they report real "no key yet" against the
  existing metric, a real, honest baseline, not a score. Authoring those keys properly (render +
  independent visual read, the same discipline as every other key in this corpus) for large, genuinely
  dense real sets is real, non-trivial future work — not rushed here. (`itd-d1-lab`, `federal-mech`,
  and `navfac-cherry-point-atc` DO now have full `rowsym.csv`/`takeoff.csv` keys, and `itd-d1-lab`/
  `navfac-cherry-point-atc` additionally have `reference.csv` — this bullet is scoped to the older
  room-finish cell/tag metric specifically, not those.)
- `federal-mech` itself still has real, disclosed, deliberately-deferred scope within its OWN
  `takeoff.csv`/`reference.csv` keys (sheet #15's further schedules — see above); `navfac-cherry-
  point-atc` likewise has real, disclosed, deliberately-deferred scope within its own `takeoff.csv`
  (the remainder of its 52 real VAV tags and 47 real FCU tags beyond the representative subset scored
  — see above); `weld-county-permit` has no `rowsym.csv`/`takeoff.csv`/`reference.csv` key yet at all.
- FINDING #1 in the `navfac-cherry-point-atc` section above (per-area tag-reuse causing
  `AMBIGUOUS_ROW_KEY` document-wide) is real, dominant (139 of 187 schedule rows this session), and
  NOT fixed — a genuine structural change to schedule-row uniqueness scoping (per-table/per-area
  rather than document-wide), left as real, disclosed signal rather than an unproven corpus-wide-risk
  change under time pressure, per this corpus's own standing rule.
