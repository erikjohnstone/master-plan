# Takeoff bug catalogue

Bugs found by **compiling real takeoffs at scale** (`mcp/scripts/takeoff-census.mjs`),
not by reading code and not by opening one document at a time. Collected under a
standing instruction to run a large number of takeoffs, write down every bug and how
they connect, and fix nothing until the picture is complete.

**Fix nothing listed here without reading "How these connect" first.** Several entries
share one root cause; fixing them individually would produce three patches where one
structural change belongs.

## Why this file exists (and why the eval did not catch any of it)

`corpus-eval` scores 7 sets at 541/541 takeoff, 129/129 reference, 138/138 rowsym. Those
numbers are real, and the ground-truth *values* behind them are genuinely independent —
`bessemer.takeoff.csv`'s own header records every tag being rendered at 3.6x-12.9x zoom
and read by eye, explicitly "never trusted from the pipeline's own extraction."

But the *scope* of that key is not independent:

> `Scope: every "equipment"-kind schedule row sheetGraph() finds in
> bessemer-mechanical-bidset.pdf (confirmed by dumping Session.graphForPipeline()…)`

A table the pipeline never finds cannot enter the key. So the eval measures **precision
on tables we found** and is structurally blind to **recall of tables we did not** — which
is exactly GOAL.md rule 18, where 16 real rows were dropped with zero disclosure while
every eval read 100%. Every bug below was invisible to that gate.

## Status

| id | bug | scale observed | class |
|----|-----|----------------|-------|
| B-1 | Printed QTY column never read; every quantity hardcoded `1` | 496 items on one document; every kind, every document | absence |
| B-2 | `sequences` takeoff has no compiler entry — throws | every document | absence |
| B-3 | ~~Row key falls back to a count column when a table has no MARK~~ **FIXED 2026-09-05** | 23 real silencers reported as 2 -> 16 lines, 22 read + 1 disclosed refusal | false structural inference |
| B-4 | ~~Prose fragments recorded as schedule titles~~ **FIXED 2026-09-05** | 3+ documents | false structural inference |
| B-5 | A new header-token rejection killed a whole real table | −12 real cells on federal-mech | self-inflicted; whole-row guard |
| B-6 | A page drawing the same table twice at TWO SCALES (~0.83x) | 013_MO p23, 2 tables lost | fused scaled duplicate |
| B-7 | ~~Sheet-margin GRID REFERENCE labels...~~ **FIXED 2026-09-05 — and the recorded hypothesis was only HALF of it** | 034_NC p42: 0 tables -> 3 (DOOR SCHEDULE 16 rows, ROOM FINISH SCHEDULE 17 rows) | TWO stacked causes; see below |
| B-8 | Side-by-side tables with NO empty gutter — seam-based banding cannot split them | 046_MI p22 + 044_NY p24 (rule 35a): 1 table lost, 19 of 27 rows lost | **same bug as GOAL.md rule 35(a)** |
| B-9 | Two consecutive rows bracketing a category sub-header (a bare-single-character CODE row, then the row right after the header) silently dropped from an otherwise-fine multi-section table | `demo/sample-finish-plan.pdf` MATERIAL SCHEDULE: "C / CONCRETE SEALER" and "RB-1 / RESILIENT BASE" both missing; every OTHER section's own first row (CPT-1, P-1, PLAM-1, ACT-1, PR-1) extracts fine | row-clustering gap around an in-table category divider |
| B-10 | A full-width section BANNER inside a table bands into a data column, polluting that row's cell | 028_TX p1 silencer schedule: one QTY cell reads "SECOND FLOOR 2", so its printed count refuses (22 read of a printed 23) | banner row not excluded from data banding |
| B-11 | The generic reader stands down for another kind's pass on VOCABULARY ALONE — and that pass then extracts nothing | 13_MI p28: 5 of 6 real tables reach the graph through no path at all | false structural inference (untested claim) |
| B-12 | A schedule with exactly ONE data row is refused, because "a real table repeats" | ordinary, not exceptional: 7 of 11 tables on 016_NY p18, 9 of 15 on 067_CA p8, 5 of 13 on 061_IA p58, both on 09_ME p7 | proxy used in place of the property |
| B-13 | Data rows whose cells WRAP to several printed lines are never banded into rows | 13_MI p28 FIRE ALARM DEVICES SCHEDULE: header accepted, `banded=0` | open — not yet fixed |

**These three came out of the recall tier, which is the only tier that can
see them.** Every other key in this corpus is scoped to tables the pipeline
already found, so a table it never constructs cannot appear in any of them —
B-11/B-12/B-13 were invisible to a 94.8%-exact scoreboard. See
`keys/*.tables.csv` (23 documents, 122 ground-truth tables, authored by
rendering sheets and reading them by eye).

---

### B-1 — a printed QTY column is never read

**Where:** `opentakeoff/web/src/lib/corpusTakeoff.mjs`, lines 824, 2015, 2521 — every
item-emission site hardcodes `quantity: 1, unit: "EA"`.

**Evidence:** `001_NC_FY20_P_228_ATC_Tower` emits 333 `hvac_equipment` items and 163
`control_valves` items; every single one carries quantity 1. Detector `P1_ALL_QTY_1`
fires on every document processed so far.

**Confirmed by grep:** `QTY`/`QUANTITY` appears in the compiler *only* inside a
header-label regex (~line 1905) used to skip column-label rows. No code path anywhere
consumes the value.

**Consequence:** any schedule carrying a real QTY column undercounts by Σ(qty−1). On the
one measured case (a duct silencer schedule with QTY values
`[2,1,1,1,1,1,2,1,1,1,1,2,2,2,2,2]`) the true count is 23 and a perfect dedup would still
report 16. This is an estimator-dollar error on exactly the high-count commodity items —
silencers, grilles, registers, diffusers, louvers, dampers — where QTY-first schedules are
the drafting norm.

**Fix shape (not applied):** resolve the quantity from the row's own QTY/QUANTITY/NO./COUNT
column **by column identity, not position**; default to 1 only when that column is absent;
refuse and disclose rather than guess when the column exists but the cell will not parse.
Never invent a number.

---

### B-2 — sequence-of-operations takeoff has no compiler entry

**Where:** `opentakeoff/web/src/lib/corpusTakeoff.mjs`, `compileCorpusTakeoff` dispatch
(~line 2551).

```js
if (kind === "hvac_equipment" || kind === "T-HVAC-01") return compileHvacTakeoff(...)
if (kind === "bas_points"     || kind === "T-BAS-01")  return compileBasTakeoff(...)
if (kind === "control_valves" || kind === "T-VALVE-01") return compileControlValveTakeoff(...)
throw new Error(`Unknown takeoff kind: ${kind}`);
```

**Evidence:** detector `COMPILE_THREW` fires on every document with
`Unknown takeoff kind: sequences`.

**Why it matters:** GOAL.md line 70 names the product as "valve/damper/actuator takeoffs,
BAS points-list takeoffs, and **sequence-of-operations takeoffs**." One of the three
declared pillars throws on invocation. Worse, line 2669 of the same file has a **live
downstream branch** — `takeoff.kind === "sequences"` — that builds CSV/XLSX rows for a
takeoff nothing can produce, and `mcp/src/sequenceExtract.ts` already does real SOO section
extraction with evidence. The capability exists at both ends and is unwired in the middle.

**Fix shape (not applied):** wire `sequences`/`T-SOO-01` to a compiler over
`sequenceExtract.ts`'s output. Audit first — per GOAL.md standing rule 2, the capability
being reached for may already exist further along than expected.

---

### B-3 — row key falls back to a count column when a table has no MARK

**Where:** `opentakeoff/web/src/lib/corpusTakeoff.mjs`. The compiler's own stated
provenance is *"Unique MARK/VALVE MARK rows on the named equipment schedule family;
continuation pages deduped by tag."*

**Evidence:** `028_TX_Renovation_of_Building_615#1`'s NOISE CONTROL DUCT SILENCER SCHEDULE
has **no MARK column** — column 0 is literally `QTY.`. Its 16 real rows deduped to **2**
items keyed `"1"` and `"2"` (the quantity values themselves). Compounded with B-1: 23 real
silencers reported as 2.

**Scope sharpener:** `001_NC`'s silencer schedule reports proper tags
(`DS-AHU-T1-RA`, `DS-AHU-T1-SA`) because that table *has* a MARK column. B-3 is specific to
tables with no identifier column — not universal.

**Fix shape:** choose the identifier column **structurally** — an identifier
is high-cardinality and tag-shaped; a count column is low-cardinality small integers. When a
table has no identifier column at all, do not dedupe by tag: emit one line per physical row
and carry its quantity. The silencer case then yields 16 lines totalling 23 units.

**FIXED 2026-09-05** (`corpusTakeoff.mjs identifierColumnByCardinality`,
`schedulePlanReconcile.mjs` QTY header). Measured on the real page, and both
halves of the fix-shape were needed — plus a third the shape did not name:

- **Cardinality alone picks the wrong column.** The first attempt took the
  highest-cardinality column and keyed a silencer `"60"`: AIR FLOW (CFM) is
  16-of-16 distinct and outscores the real identifier. The "AND TAG-SHAPED"
  half is load-bearing — requiring the column's values to carry LETTERS, and
  walking the table's own header order (an identifier leads by convention),
  selects LOCATION & SERVES.
- **Near-uniqueness is too strict.** LOCATION & SERVES is 12 distinct of 16
  (0.75) because a location legitimately repeats when two silencers serve one
  room. Measured separation: count column 0.19, real identifier 0.75, an
  ordinary MARK column 1.0 — threshold set at 0.6.
- **The printed count still would not parse.** `scheduledQtyStatusFromRow`
  matched `QTY` but not `QTY.`; the pattern already admitted `NO.`, so the
  trailing period was simply missing. Without this the 16 lines each read 1.

**Result: 16 lines (was 2). 22 units read + 1 disclosed refusal.** The 23rd
unit is NOT reachable here and is not papered over: that row's QTY cell reads
`"SECOND FLOOR 2"` because a section banner bands into the column (now
catalogued as B-10), so the parse refuses with
`REFUSED_UNPARSEABLE_QTY` rather than regex-scraping a trailing digit.
Regression: `web/test/countKeyedSchedule.test.ts` (real captured spans).

---

### B-4 — prose fragments recorded as schedule titles

**Where:** the title hunt feeding `page_accounting`.

**Evidence:** `page_accounting` recorded `"CONSTRUCTION DOCUMENTS AND THE SITE CONDITIONS."`
and `"AND A …"` as schedule titles on real documents (detector `PROSE_AS_TITLE`).

**Related, already fixed upstream:** GOAL.md rule 18's own title hunt reached past a real
body-sized title to grab an unrelated detail-drawing caption; and reading column bands mined
a fake 13-row "table" out of two side-by-side SEQUENCE OF OPERATION prose columns, whose
"headers" were `"WORKSTATION."` and `"SHALL SEQUENCE THE FOLLOWING:"`. Same disease, three
appearances.

**Fix shape:** the measured discriminator from the rule-18 work generalizes —
a prose line FILLS its column band (89%-113% measured) while a real title does not (29%
measured). A sentence-terminating period is a second, independent signal.

**FIXED 2026-09-05** (`sheetgraph.ts isTitleShaped`). That shape test admits
`.` in its own character class, so a SENTENCE passed it as readily as a
caption. Two independent structural signals now refuse one, neither of them
domain vocabulary:

- A real caption never OPENS with a conjunction or article — that is exactly
  what `"AND A …"` is, the middle of a wrapped sentence.
- Band-fill AND a sentence-terminating period, required TOGETHER. Band-fill
  alone would reject real titles: a genuine big-font caption legitimately runs
  WIDER than the table it captions (measured on itd-d1-lab's lab-ventilation
  caption, x 578-2154 against a ~360-1160 column band), and a short caption
  that merely ends in a period is not prose.

---

---

### B-5 — a new header-token rejection killed a whole real table (SELF-INFLICTED, found by Loop B0)

**Severity: this one was mine, shipped, and my own gate would have caught it.**

**What happened.** Rule 18 (commit `e256975`) added
`if (/:$/.test(s)) return false;` to `isGenericHeaderToken`, to kill a fake
13-row table mined from two side-by-side SEQUENCE OF OPERATION prose columns
on itd-d1-lab#20 (its "header" labels were `"WORKSTATION."` and
`"SHALL SEQUENCE THE FOLLOWING:"`).

**Measured cost.** Reference-cell scores, pre-today (`08f8559`) vs HEAD:

| set | cells | before | after |
|---|---|---|---|
| itd-d1-lab | 34 | 11.8% | **41.2%** (+10 cells) |
| federal-mech | 31 | 100.0% | **61.3%** (−12 cells) |

federal-attachment4-mechanical.pdf#15's `ARCHITECTURAL LOUVERED PENTHOUSE
SCHEDULE` (ALP-1/ALP-2/ALP-3) disappeared **entirely**, and two fabricated
title-block tables took its place: `"IMEG Corporation"` (the engineering
firm's name) with row keys `MINIMUM / LOCATION / BLADDER / BLADDER`, and
`"ELECTRONIC SECURITY / TELECOMMUNICATIONS"` keyed
`CONTRACT DOCUMENTS / DESIGN DEVELOPMENT / DRAWING TITLE / SCALE`.

**Root cause — and it is a trap this codebase already documented.** There is
**no colon-terminated token anywhere in the ALP header band** (measured
directly: the two header tiers are `ROOF OPENING / PENTHOUSE THROAT SIZE /
DESIGN AIR FLOW / MAXIMUM AIR PD` over `CFM / I.W.G / TAG / SYSTEM / LOCATION
/ LENGTH / WIDTH / LENGTH / WIDTH / HEIGHT / MANUFACTURER / MODEL / REMARKS`).
The rule breaks the table **indirectly**: `isGenericHeaderRow` requires EVERY
token in a row to qualify, so one new rejection anywhere on the sheet
disqualifies a whole candidate header row, which shifts where
`extractAllReferenceTables` advances `fromIdx`, and a junk title-block region
then swallows the ALP band (note `LOCATION` — a real ALP header — appearing as
a row key of the `"IMEG Corporation"` table).

This is the **identical failure mode** rule 18's own history records for the
bare `"&"` connector: one token failing `isGenericHeaderToken` silently killed
an entire real table. Any new rejection in that function is a whole-table risk.

**Fix.** Require ≥3 words AND a trailing colon:
`if (/:$/.test(s) && norm(s).split(/\s+/).filter(Boolean).length >= 3) return false;`
`"SHALL SEQUENCE THE FOLLOWING:"` is a prose clause (4 words); a real column
label is not. Verified on both documents: federal recovers ALP-1/2/3, itd's
fabricated prose table stays dead.

**The process failure, recorded because it matters more than the bug.** The
two-tier sweep gate (regression + held-out) exists in this repo specifically to
catch a locally-correct fix breaking a different real table elsewhere. It was
built earlier the same session — and rule 18 was committed **without running
it**, pushed at a stop-hook prompt while the sweeps were still in flight. The
gate would have shown federal's ALP as a `LOST` table before the commit landed.
No extraction change ships again without the gate completing first.


---

## B1 recall findings — the three genuine zero-table misses

Found by probing all 11 zero-table documents page by page (text-only). Eight
were my own page-scorer's fault (see the audit's §0.2 correction). These three
are real, and each has a **different** structural cause — worth stating,
because "the extractor missed a table" is not one bug.

### B-6 — a page that draws the same table TWICE, offset

**Where:** `013_MO_T2523_01_Replace_Boilers_Phase_2_Building_29` p23.
Real tables present: `VARIABLE FREQUENCY DRIVE SCHEDULE` (title h=32.1) and
`HVAC PIPING MATERIAL SCHEDULE` (h=35.6). Extraction returns **zero tables**.

**Measured cause.** The page renders the whole schedule twice, offset by
roughly **+500 in x and +12..30 in y** — a shadow/bold draw or a stacked
overlay. Both copies are live text spans:

```
y=184  [1417]"TAG"   [3265]"FEEDER"        y=215  [1928]"TAG"   [3432]"FEEDER"
y=193  [1662]"NAME"  [1914]"MANUFACTURER"  y=225  [2127]"NAME"  [2333]"MANUFACTURER"
y=291  [1428]"VFD-1" [1545]"CROSS TIE HHW CTP" [2287]"480" [2699]"3" [2813]"25"
y=305  [1937]"VFD-1" [2033]"CROSS TIE HHW CTP" [2636]"480" [2972]"3" [3064]"25"
```

`clusterRows` groups by Y alone, so the two copies fuse into incoherent rows
and no coherent header block ever forms.

**CORRECTED — the duplicate is SCALED, not translated.** The first reading
("constant +500x/+20y offset") was wrong, and testing it before building
caught that: across all 227 strings appearing exactly twice on the page, the
single most common rounded (dx, dy) accounts for just **7 of them (3%)** —
and those seven are the architect's title-block text, not the schedule.

The offsets shrink as x grows (TAG +511, NAME +465, MANUFACTURER +419), which
is a scale relationship, not a translation. A least-squares fit over the 33
duplicate pairs inside the schedule's own y-band:

```
x' = 0.8298 * x + 720.8
text-height ratio (copy/original), median: 0.815
every pair: h 28.1 -> 22.9
```

The x-scale and the independently-measured text-height ratio agree to within
2%. So the page draws the same VFD schedule **twice at two different scales**
— full size and ~82% — a plot-scale / detail-view artefact. `clusterRows`
interleaves the two copies' rows by Y and no coherent header block forms.

**Shape of the fix.** Detect a SCALED duplicate span set: strings that appear
twice whose x-positions fit an affine `x' = a*x + b` AND whose text-height
ratio independently equals `a`. Keep the larger copy. The height-ratio
corroboration is what makes it safe — it distinguishes a re-drawn copy from a
genuinely repeated header tier on a continuation page, where the type size is
identical (ratio 1.0). Purely structural, no vocabulary, no document
recognition.

**Method note worth keeping.** The first hypothesis was plausible, came from
real coordinates, and was still wrong. It survived one reading of the data and
died on the second. The rule that caught it: state the hypothesis as a
measurable claim ("the offset is constant") and measure it before writing any
code against it.

### B-7 — a deep multi-tier header with repeating sub-labels

**Where:** `034_NC_VA_Project_637_22_700_EHRM_Infrastructure` p42.
Real: `DOOR SCHEDULE` (h=50.4) and `ROOM FINISH SCHEDULE` (h=50.5). Zero tables.

**Measured cause.** ROOM FINISH SCHEDULE carries a **four-tier** header whose
leaf labels repeat under every parent:

```
y=2249  BASE            WALLS                    CEILING          (tier 1, spanning)
y=2283  LEVEL RM NO AREA RM NAME FLR  NORTH EAST SOUTH WEST  COMMENTS
y=2301  MATL HT                                   MATL FIN HT
y=2318  MATL FIN  MATL FIN  MATL FIN  MATL FIN
```

`MATL` appears at six distinct x positions, `FIN` at five. The header-block
expander treats a many-token cluster as "not a wrapped label" and rejects it,
so the block never qualifies. This is the architectural room-finish shape the
finish-kind vocabulary exists for, yet nothing extracts it.

**STATUS: NOT ROOT-CAUSED. The first hypothesis was tested and does not
hold.** I claimed the header-block expander rejects this because a many-token
cluster reads as "not a wrapped label". Measuring the actual header band
(28 spans above the title at y=2184):

```
MATL   x6   at x = 3902, 5218, 4127, 4408, 4705, 4990
FIN    x5   at x = 5327, 4279, 4564, 4872, 5134
distinct x-anchors (20px buckets): 28
header tiers (10px buckets):        5      (MAX_GENERIC_HEADER_LINES is 6)
```

Those repeats are **six separate single-token clusters at six different x
positions**, not one cluster holding six tokens — so the over-full-cluster
rejection cannot be what fires. And 5 tiers is inside the 6-tier cap, so tier
depth is not it either. The hypothesis is disconfirmed.

**Open alternative, not yet confirmed.** Two outlier spans sit far outside the
table's own column range (x 3100..5640): `"D"` at **x=180** and `"D"` at
**x=5968** — almost certainly drawing-grid labels at the sheet margins. If
they fall inside the header band, `bandLimits` stretches the x-band across the
whole page and the table's real column structure is swamped. Confirming this
needs the extractor traced on the real page, which is a heavy job; it is
queued behind B0.

**The alternative is now STRONGLY SUPPORTED by measurement** (though still not
confirmed by tracing the extractor itself, which is a heavy job). The page
carries **six** sheet-margin grid-reference rows, and every one of them
satisfies `isGenericHeaderRow`:

```
y~444   "A"@188  "A"@5968        y~2268  "D"@188  "D"@5968   <- inside the
y~1044  "B"@188  "B"@5968        y~2868  "E"@188  "E"@5968      ROOM FINISH
y~1656  "C"@188  "C"@5968        y~3480  "F"@188  "F"@5968      header band
```

Each row is 2 tokens (clearing the 2-cell floor), each token is a single
uppercase letter (clearing `isGenericHeaderToken`: has A-Z, no lowercase, no
digit, under the length cap, not a reference lead-in, no colon, no
"SCHEDULE"). The `D` row at y~2268 falls squarely inside the ROOM FINISH
SCHEDULE's own header band (2184..2334). Absorbed into the header block, its
tokens become anchors at x=188 and x=5968, so `bandLimits` reports
**x 188..5986 — the full page width** — instead of the table's real
x 3100..5640, and the table's actual column structure is swamped.

**Why this matters far beyond one document.** A-F (or 1-8) grid references
running down both margins are a near-universal large-format drafting
convention. Any sheet using them presents a header-shaped 2-token row at
regular vertical intervals, page-wide. This is a corpus-scale hazard, not a
034_NC quirk.

**Shape of the fix.** Recognise sheet-margin grid references structurally and
exclude them from header candidacy: 1-2 character tokens, sitting in the
outer few percent of the page width, appearing as a REGULAR VERTICAL SEQUENCE
(here six rows at ~600px pitch, letters advancing A->F) mirrored on both
margins. The regular sequence plus the mirrored x-positions is what makes it
safe — a real 2-column table header is neither periodic down the page nor
pinned to both sheet edges.

**Still to confirm:** that this is what actually rejects the table, by tracing
`expandGenericHeaderBlock` on the real page. Queued behind B0. Two other
hypotheses in this catalogue (B-6's "constant offset", B-8's "rule 18 already
covers it") were equally plausible, equally grounded in real coordinates, and
equally wrong — so this stays a hypothesis until the trace agrees.

---

**TRACED AND RESOLVED 2026-09-05 — the trace did NOT agree, and this entry is
the third hypothesis in this file to die that way.** The extractor was run on
the real page with its own (temporarily exported) functions over the real
spans, exactly as this section demanded.

**What the hypothesis got right.** The margin locators are real and they ARE
absorbed. "A".."F" sit at x=188 and x=5968 (page x-extent 188..5986) at
y = 440, 1048, 1656, 2265, 2873, 3481 — a pitch of 608/608/609/608/608. Every
one clears `isGenericHeaderToken`; the pairs at y=440 and y=2265 clear
`isGenericHeaderRow`; and the y=2265 pair falls inside the ROOM FINISH
SCHEDULE's own header band and IS pulled into the header block (measured:
`MARGIN TOKENS ABSORBED: 2 — "D"@188 "D"@5968`).

**What it got wrong — and this is the whole point.** Absorption is not what
dropped the table. Removing the margin tokens entirely changes nothing:

```
WITH margin tokens    -> clusterGenericColumnsOnce = null (REFUSED)
WITHOUT margin tokens -> clusterGenericColumnsOnce = null (REFUSED)
```

The block dies at the column-clustering depth cap and never reaches
`bandLimits` at all, so the predicted page-wide band could not have been the
cause of a page that produced ZERO tables.

**The actual primary cause.** `clusterGenericColumnsOnce` clusters column
anchors by single-linkage x-proximity with `tol = max(60, medH * 5)` = 128px
here. This header's leaf labels repeat under every parent (MATL at six
distinct x, FIN at five) and their real column gutters — measured minimum
**47px = 1.84 x h** — sit UNDER that tolerance, so single-linkage chained
them transitively into one "column":

```
[MATL@4408/y2318, EAST@4457/y2283, FIN@4564/y2318, WALLS@4593/y2249,
 MATL@4705/y2318, SOUTH@4746/y2283, FIN@4872/y2318]     <- 7 tokens, 4 on ONE tier
```

7 > `MAX_GENERIC_COLUMN_DEPTH` (4), so the function returned null and the
whole page refused. **A column is a VERTICAL STACK: two tokens sharing a
physical tier are two columns, whatever their x-gap.** The one real exception
is a multi-word label on one tier ("LOCATION & SERVES", whose "&" draws as its
own span) — separable by gap size, measured: word gap **0.26 x h**, minimum
real gutter **1.84 x h**, threshold set at 1.0 x h.

**Both causes are real; the recorded one was simply second in line**, masked
behind the refusal. With the tier guard alone the page yields 2 tables but the
ROOM FINISH SCHEDULE comes back with `D` / `D (2)` among its headers, region
x 188..5986 (the full page width, exactly as predicted), and 15 real rows
collapsed into 3 that swept in the sheet's own title block. Both fixes
together: **0 tables -> 3** (DOOR SCHEDULE 16 rows, ROOM FINISH SCHEDULE 17
rows, regions x 3051..5765 and x 3051..5824).

Fixes: `sheetgraph.ts clusterGenericColumnsOnce` (tier guard + word-gap
exception) and `sheetgraph.ts sheetMarginGridTokens` (mirrored + periodic +
short-token locators dropped before any row is clustered). Regressions:
two tests in `web/test/sheetgraph.test.ts` over real captured spans
(`test/fixtures/b7-034nc-p42.spans.json`), both verified to fail on the
pre-fix tree.

**Method note worth keeping, again.** Three hypotheses in this file have now
been plausible, grounded in real measured coordinates, and wrong. The rule
that caught all three: state the hypothesis as a claim that can be falsified
by measurement, then measure it — here, "remove the thing you blame and see
whether the symptom goes away" took one trace run and overturned a conclusion
that had already been written down as "strongly supported".

### B-8 UPDATE — measured: rule 18's bands fix does NOT reach it, and this is rule 35(a)

Audited before building, per standing rule 3. An x-density probe of
046_MI p22 (596 spans, page width ~5039, 50px buckets):

```
corridors >= 100px wide and fully empty:  0..150   4050..4450   4600..4700
```

The legend block ends around x=1200 and the LIGHTING FIXTURE SCHEDULE's own
header row starts at x=1916 — but **there is no empty corridor between
them**, because the occupancy-sensor list (OS3/OS4/OS5 with their
descriptions) occupies x=1125..1400+ and fills the gap. `columnBandCandidates`
requires a >=100px-wide, ~90%-empty corridor across the sheet's content rows;
it finds none here, returns a single band, and rule 18's bands-union read
therefore has no split to use. **B-8 needs different work.**

**And it is not a new bug.** GOAL.md rule 35(a) records the identical
mechanism on 044_NY page 24: *"a live debug probe confirms it returns exactly
1 band (no seam) for this real page."* There the cost is the 27-row BOILER
PLANT ISOLATION VALVE SCHEDULE returning 8 rows with cross-column
contamination; here it is a whole LIGHTING FIXTURE SCHEDULE returning
nothing. Same root cause, two documents, two different visible symptoms —
which is why rule 35 lists "recalibrating columnBandCandidates' own geometric
thresholds" as NOT STARTED and explicitly warns the thresholds are
corpus-wide-tuned with a history of false positives.

**So the real fix is not a threshold nudge.** A seam is the wrong primitive
when tables are packed with no gutter. What separates these tables is that
each has its own INTERNAL column grid — consistent x-anchors repeating down
its own rows — while the space between two tables has no such alignment.
Grouping header tokens by shared column structure, rather than carving the
page at an empty corridor, decides it without needing a gutter to exist. That
also subsumes rule 18's 028_TX case (which happened to have a gutter) rather
than competing with it.

### B-8 — three-plus side-by-side tables fused by Y-clustering

**Where:** `046_MI_Veterinary_Medical_Center_Replace_Elevators_3` p22.
Real: `LIGHTING FIXTURE SCHEDULE` (h=37.7, x 2577..3143), headers
`TYPE / MANUFACTURER / CATALOG NO. / DESCRIPTION AND … / DIMMING INFO /
DRIVER / MOUNTING / FIXTURE HEIGHT` at y=1251. Zero tables.

**Measured cause.** Unrelated tables occupy the SAME y-band at lower x — a
symbols legend (`ELECTRIC UNIT HEATER`, `NURSE CALL`, `WALL MOUNTED SPEAKER`,
`ULTRASONIC SENSOR` at x 151..1200) and an occupancy-sensor list. Row
clustering fuses all of them into one row set.

This is the SAME class as GOAL.md rule 18's 028_TX two-up sheet, but with
three-plus tables rather than two. Rule 18's fix (read the whole sheet AND its
column bands, whole sheet winning on overlap) may already reach this — it must
be re-measured on this page before anything new is built, per standing rule 3
(audit before you build).

**Also worth recording:** two of the three genuine misses (DOOR SCHEDULE,
ROOM FINISH SCHEDULE, LIGHTING FIXTURE SCHEDULE) are architectural/electrical
rather than mechanical. An HVAC/BAS takeoff arguably should not COUNT them —
but silently not extracting them is different from disclosing them, and the
domain map is explicit that a set without architectural sheets carries a
fire/smoke damper undercount risk. Recall and scope are separate questions.

### B-9 — two rows bracketing an in-table category sub-header dropped

**Where:** `demo/sample-finish-plan.pdf#2`, the "MATERIAL SCHEDULE" table
(headers `CODE / MATERIAL / MANUFACTURER / STYLE / COLOR / SIZE / REMARKS`,
extracted `kind: "finish"`). Found live, not from the corpus: this is the
repo's own bundled demo fixture, hit by `mcp/test/conformance.test.ts`'s
"sheet graph (#87)" test asserting `resolve_tag("134")`'s BASE surface
(code `RB-1`) chains to a material-schedule definition.

**Confirmed by render** (`page.renderPng`, read by eye): the real page draws
the table as six shaded category sub-headers — FLOORING, BASE, WALLS,
MILLWORK, CEILINGS, MISC. FINISHES — each followed by its own rows, all in
ONE continuous table (not six separate tables). Under "BASE" the real rows
are `RB-1 | RESILIENT BASE | VPI FLOORING | RUBBER WALL BASE | 97 FAWN | 4"`
then `CBT-1 | CARPET WALL BASE | ...`. Immediately above, under "FLOORING",
the real last row is `C | CONCRETE SEALER | SHERWIN WILLIAMS | H&C
DECORATIVE CONCRETE CONCRETE SEALER | CLEAR`.

**Measured:** `graphForPipeline().tables` for this sheet returns the
"MATERIAL SCHEDULE" table with 25 rows total, but neither the `C` row nor
the `RB-1` row is among them — both vanish, while `CBT-1` (the row right
after `RB-1`) extracts fine, and every OTHER category's own first row
(`CPT-1` under FLOORING, `P-1` under WALLS, `PLAM-1` under MILLWORK, `ACT-1`
under CEILINGS, `PR-1` under MISC. FINISHES) extracts fine too. So this is
not "a category's first row is unreliable" — it is specifically the pair of
rows immediately bracketing the "BASE" sub-header (one before it, one after
it) in this one table.

**Not yet root-caused.** Candidate: the `C` row's own CODE cell is a bare
single character (every other row's CODE is letters-dash-digit, e.g.
`CPT-1`) — narrower than this table's normal code-column band — which may
throw off the row-clustering pass in a way that also swallows the header's
next data row. Not confirmed; needs the same trace discipline as B-6/B-7/B-8
before a fix is built (audit before you build, per standing rule 3).

**Impact:** `resolve_tag`'s definition-chaining mechanism itself is sound —
proven on the SAME call for NORTH/EAST/WEST/CEILING, which all chain to
real material-schedule rows. This is a narrow, real row-extraction miss, not
a mechanism failure — but the fixture-authored keys/tests should not assert
around it silently; `conformance.test.ts` names this bug explicitly at the
one assertion it affects rather than weakening the check.


### B-10 — a full-width section BANNER bands into a data column (CLOSED — already fixed before this entry was last read, re-verified 2026-09-13)

**Where:** `028_TX_Renovation_of_Building_615` p1, NOISE CONTROL DUCT SILENCER
SCHEDULE. Found while closing B-3, not by the census.

**Originally measured:** the table's QTY. cells read
`["2","1","1","1","1","1","2","1","1","1","1","2","2","2","SECOND FLOOR 2","2"]`.
The 15th was polluted: the sheet prints a full-width section banner
("SECOND FLOOR") between two groups of rows, and that banner's text banded
into the narrow QTY column of the row beneath it rather than being
recognised as a divider spanning the whole table. Task #77 named the same
general shape on a different document — `042_VA…#9`'s HVAC DESIGN DATA
table, where a spanning "INDOOR AREA TEMPERATURE/HUMIDITY SETPOINTS" group
header was misread — with a slightly different symptom (smeared into every
column, not banded into a neighbor's narrow one); this file's own goal
doc flagged them as "very likely the same failure mode, not yet confirmed".

**Re-traced live under goal `VECTORGRID_TABLE_BOXES.md`, 2026-09-13: both
are already fixed, and both share the exact root cause this entry's own
"fix shape" already named.** Commit `1ffa5e9b` (2026-09-08, five days
BEFORE this open-item was next reviewed — not a fix made under this goal)
added exactly the guard this entry called for: `buildRows`'s own row loop
in `scheduleTableFromODL` now excludes a row whose one owned cell spans
nearly the whole table width, motivated by (and its own commit message
cites) the 042_VA example directly. Excluding that row at the very top of
the loop — before any text-banding logic ever runs on it — kills BOTH
symptoms through one mechanism: 042_VA's banner can no longer smear into
every column because it's never treated as a data row at all, and (the
same reasoning, confirmed by re-running 028_TX today) 028_TX's own
"SECOND FLOOR" banner can no longer bleed into the neighboring row's QTY
cell for the identical reason.

**Verified live, 2026-09-13, current `main`:**
- `028_TX_Renovation_of_Building_615_Final_Design_Plans.pdf`'s NOISE
  CONTROL DUCT SILENCER SCHEDULE: all 16 real rows present, QTY for
  `ROCK REHEARSAL 218 - SUPPLY/RETURN` (the row immediately after the
  "SECOND FLOOR" banner) reads clean `"2"`, not the polluted
  `"SECOND FLOOR 2"`.
- `042_VA_Renovate_VCS_Patriot_Cafe_VA_project_546_17.pdf#9`'s INDOOR AREA
  TEMPERATURE/HUMIDITY SETPOINTS table: exactly 4 real rows (DINING AREA
  (CAFETERIA) / CORRIDORS / OFFICES / ALL OTHER SPACES), no phantom
  second table, no smeared columns.

Task #77 ("mid-table section-divider row misread as a second bogus table")
is the same stale tracking gap this file's own B-14/task #74 entry already
found once this session — a real fix landed under a different name and the
open-item list was never updated to reflect it.

---

### B-11 — standing down for a pass that never comes

**Measured 2026-09-05 on `13_MI_MSU_LifeSciences_LabRenovation.pdf#28`
(E-002 SCHEDULES).** The sheet draws six schedule tables. The pipeline
extracted one.

Five of them — FIRE ALARM DEVICES, DATA DEVICE, and three WIRING DEVICES
schedules — print the same header:
`SYMBOL | DESCRIPTION | MANUFACTURER | CATALOG NO. | REMARKS`.

`extractReferenceTableAt`'s `alreadyVocab` guard reads `SYMBOL` + enough
supporting hits, concludes the finish-kind pass owns this table, and skips it.
Traced live, the finish pass's own answer on that sheet is:

```
room-finish: 0
finish:      0
equipment:   1   ("LUMINAIRE SCHEDULE")
reference:   0
```

The finish pass extracts **nothing** — its hunt wants finish/material rows
and these carry catalog rows — and where it does build such a table it drops
it again by title as a non-finish schedule. So five real, cleanly ruled
tables reached the graph through no path at all, with no note, no refusal,
no disclosure. The guard was not wrong to exist (its own comment records the
real bessemer collision it prevents); it was wrong to treat a **claim about
what another pass would do** as evidence that it did it.

**Fix (2026-09-05):** stand down only where one of those passes ACTUALLY
produces a table whose region covers this header block
(`blockIsClaimedByAKindPass`, memoised per sheet). Where a pass really does
own the table the guard behaves exactly as before; where nothing owns it,
there is nothing to defer to. Same move as B-3/B-4/B-7 and as the earlier
`blockHasCatalogAnchor` fix on the equipment side of this very guard: test
the claim instead of inferring it.

---

### B-12 — a one-row schedule is a schedule

`if (banded.out.length < 2) return { table: null, … }` refused every
single-data-row candidate, on the reasoning that "a real table's own grid
REPEATS." That guard was added against a real failure — a control
schematic's scattered callouts coincidentally aligning for exactly one line
— but repetition is a **proxy** for the grid, not the grid, and the corpus
says the proxy is wrong far more often than it is right. One-row schedules
are ordinary drafting: one piece of equipment, one row.

Counted on the sheets read for the recall keys: 7 of 11 tables on
016_NY p18, 9 of 15 on 067_CA p8, 5 of 13 on 061_IA p58, and both tables on
09_ME p7 carry exactly one data row. On 09_ME p7 the pipeline finds ZERO
tables on a page whose text layer is clean and complete — adding one
synthetic duplicate data row makes a table appear immediately.

**Fix (2026-09-05):** test the grid itself. `singleRowSitsInDrawnGrid` asks
for the cell walls a drafted table has and a coincidental alignment does not
— a rule separating the row from its header, a rule closing it below, and at
least two verticals cutting it at the header's own column anchors. It is
deliberately stricter than `hasNearbyRuledLine`, which fails OPEN when a
sheet supplies no linework: with no segs the question cannot be answered, and
the old refusal is the safe answer.

---

### B-13 — a row whose identity column is a pure drawn glyph gets dropped whole (FIXED 2026-09-13)

**Originally recorded** (this same corpus, earlier session) as "wrapped
multi-line cells are never banded" via `bandGenericDataRows` returning 0
rows. **Re-traced live under goal `VECTORGRID_TABLE_BOXES.md` and found to
be stale on the mechanism, though the symptom (real rows silently vanishing
on this exact table) was real** — this document's schedule now reaches the
graph through vectorgrid, not the ODL/text-banding path `bandGenericDataRows`
serves, so that function was never actually in the code path for this table.
Measured directly:

- `vectorgrid.py`'s own geometric row/column detection is 100% correct —
  dumping its raw cell grid for this exact region shows **7 real row-bands**
  (header + all 6 real data rows) with the right heights, matching the
  rendered page one-for-one. The geometry is not the bug.
- The loss is in `scheduleTableFromODL`'s own `buildRows` (`web/src/lib/
  sheetgraph.ts`): `const rawKey = texts[keyCol]` reads the row's own SYMBOL
  cell, and `rowKeyOf(rawKey, ...)` on an empty string returns null — `if
  (!keyRes) continue` then discards the ENTIRE row, including its already
  correctly-extracted DESCRIPTION/MANUFACTURER/CATALOG NO./REMARKS text, not
  merely its own blank key cell.
- Confirmed directly off the page's own text spans: MANUAL PULL STATION /
  CEILING MOUNTED PHOTOELECTRIC SMOKE DETECTOR / FIRE ALARM INTERLOCK draw
  their SYMBOL cell as a pure vector glyph (a boxed "F", a circled "S", a
  filled dot) with zero text anywhere in it. The other 3 rows
  (COMBINATION AUDIO SPEAKER ×3) carry a real drawn numeral ("15"/"30"/"60")
  and always worked.

**Fix:** when `rowKeyOf` fails on a blank identity cell (never when
`printedKeys` mode applies, and never on a genuinely blank spacer row —
`texts.every(s => !s.trim())` already excludes that earlier), fall back to
the LEFTMOST other column with real text, validated through the same
vocabulary-free `genericRowKeyOf` the "reference" kind already trusts.
Leftmost, not longest: an earlier version of this fix picked the row's own
longest cell, which is routinely REMARKS — either well past
`genericRowKeyOf`'s 100-char cap ("MOUNT AT 46-INCHES TO CENTER OF BOX,
UNO. PROVIDE BACKBOX AS RECOMMENDED BY FIRE ALARM SYSTEM MANUFACTURER.",
107 chars) or a bare cross-reference its own `REFERENCE_RE` guard correctly
rejects ("REFER TO LIGHTING CONTROL DIAGRAM ON SHEET E-010."), and once it
slipped through the length check it was still the WRONG identity — a shared
boilerplate instruction, not the row's own name. The leftmost non-key
column (DESCRIPTION, immediately beside SYMBOL) is the row's own real
identity on every real schedule's own drafting convention, and recovers all
3 missing rows with their own correct names as keys.

**Result, measured live, before/after on the same document:** the FIRE ALARM
DEVICES SCHEDULE goes from 3 rows to all 6 real rows — `MANUAL PULL
STATION`, `CEILING MOUNTED PHOTOELECTRIC SMOKE DETECTOR`, `FIRE ALARM
INTERLOCK / CONTROL CONNECTION`, `15`, `30`, `60` — each fully populated
(DESCRIPTION/MANUFACTURER/CATALOG NO./REMARKS all correct). A second,
unrelated table elsewhere on the same document (sheet #25, previously
undiscovered) was also recovered as a side effect of the same fix.

**Verified:** new regression suite in `web/test/sheetgraph.test.ts`
("a row whose own identity column is a pure drawn glyph still keeps its
data") — recovers all 4 rows of a synthetic fixture mirroring this exact
shape with correct keys, confirms the REMARKS-shaped cross-reference and
the >100-char cell are never used as the fallback key, confirms the
already-working real-tag path (SYMBOL="15") is untouched, and confirms a
row where every column is genuinely unkeyable still refuses rather than
manufacturing a phantom row. Full `sheetgraph.test.ts` (140/140) and
`scheduleLanguageScan.test.ts` (10/10) green; `tsc --noEmit` clean in both
`mcp` and `web`.

---

### B-14 — a caption drawn OUTSIDE the ruled grid is invisible to title search (FIXED 2026-09-12)

**Where:** `08_ME_BGS_Augusta_EastCampus_Renovation.pdf`'s own cover sheet
(page 1) — a real DRAWING LIST (SHEET NUMBER / SHEET NAME / SCALE / FOR
CONSTRUCTION checkbox column, 49 real listed sheets). First recorded as
task #74 ("invisible to every extraction path"); traced fully under goal
`opentakeoff-corpus/goals/VECTORGRID_TABLE_BOXES.md`'s own charter.

**Measured, live, with the pipeline's own decline reasons** (a new opt-in
`OPENTAKEOFF_GRAPH_TRACE` line in `mcp/src/session.ts`'s
`runVectorTakeoffStack`, previously discarded entirely): vectorgrid finds
this table's geometry EXACTLY — `52x8 at 1664,404,2448,1606` — and refuses it
with reason `"unknown kind and no title"`. Confirmed by render
(`render-page-crop.mjs`, read by eye): "DRAWING LIST" is printed as its own
free-floating, underlined text run ABOVE the ruled grid, never a cell of it.

**Root cause:** `scheduleTableFromODL`'s title search (`web/src/lib/
sheetgraph.ts`) only ever looks INSIDE the grid's own row 0 for a title —
either one cell spanning nearly the full width, or several word-group cells
covering less than the full column count. Both shapes assume the table's
name is drawn as part of the ruled grid itself. A caption printed outside
and above the grid — the ordinary convention for a cover-sheet index — was
structurally invisible to either check, so `titleCell` stayed null, kind
classification found no equipment/room/finish vocabulary in SHEET NUMBER/
SHEET NAME/SCALE, and the table was refused despite being found correctly.

Note this is a DIFFERENT bug from the one `sheetHasDrawingIndexTitleSpans`
(added earlier, same corpus document, see its own doc comment) already
fixed: that hook closed the ROUTING half — getting the sheet OFFERED to
vectorgrid at all, via `isScheduleTarget`'s `role === "unknown"` fallback.
This is the TITLE-ATTACHMENT half, checked once a candidate table already
exists — a completely separate code path that nobody had wired the same
caption vocabulary into.

**Fix:** `nearbyDrawingIndexCaptionText` (`web/src/lib/
scheduleLanguageScan.ts`) — reuses the exact same proven
`SHEET INDEX|DRAWING INDEX|INDEX OF DRAWINGS|DRAWING LIST` vocabulary
`sheetHasDrawingIndexTitleSpans` already uses for routing, but scoped
spatially: given the table's own bounding box (converted to project space
via the existing `odlBboxToProjectSpace`, the same transform title-cell
bboxes already go through), search only spans in the band directly above it
and roughly over its own horizontal extent. Wired as a fallback in
`scheduleTableFromODL`, firing ONLY when the in-grid search found nothing —
an in-grid title still always wins (regression-tested). Scoped to this one
narrow, already-proven vocabulary rather than the broader
`sheetHasScheduleCaption` (which returns a false positive on this exact page
from an unrelated span elsewhere on the sheet, measured directly) so a busy
cover sheet's incidental caption elsewhere can never be borrowed by a table
it doesn't name.

**Result, measured before/after, same command, cold cache:** table count on
this document goes from 2 to 3; the new table lands correctly kinded
`reference`, key column populated (`G000`, `H200`, `D101`, ...), 34 real
rows. `table.title` itself still reports `null` (the classification uses the
found caption text internally; no synthetic title-cell object is
constructed, matching this same file's own existing accepted precedent —
see the STEAM UNIT HEATER SCHEDULE case a few paragraphs above, "the table
reached the graph correctly keyed and celled... but with `title: null`") —
a smaller, separate, disclosed gap, not a blocker: the table's data is now
real and complete, only its own display name in the Schedules panel is not
yet populated by this fallback.

**Verified:** new regression suite in `web/test/sheetgraph.test.ts`
("a caption drawn OUTSIDE the ruled grid still names the table") — refuses
with no spans (proves the fix is additive, not a relaxed default), refuses
when a caption exists far from this table (never borrows an unrelated
caption), recovers all 6 rows of a synthetic fixture once the real caption
shape is nearby, and confirms an in-grid title always wins when both exist.
Full `web/test/sheetgraph.test.ts` (136/136) and
`web/test/scheduleLanguageScan.test.ts` (10/10) green; `tsc --noEmit` clean
in both `mcp` and `web`; full corpus regression gate run cold-cache before
commit (see the commit that lands this entry for the exact before/after
numbers on the frozen 541-tag scored corpus).

---

### B-15 / task #82 — a BAS/BMS control-points matrix compiles as physical equipment (FIXED 2026-09-13)

**Where:** `federal-attachment4-mechanical.pdf#20/#23/#24` — three real
"HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE" tables (HHW SYSTEM, VAV
BOXES, MISCELLANEOUS). First tracked as task #82 ("HVAC equipment compile
totals reported wrong on 6+ corpus sets, not yet root-caused"), on the
`VECTORGRID_TABLE_BOXES.md` goal's own open-items list — traced to a
specific sheet before any fix was written, per that goal's own stated
discipline.

**Measured, live** (`OPENTAKEOFF_EVAL_NO_CACHE=1 takeoff-eval.mjs
federal-mech --with-reference`, cold cache): federal-mech's own frozen
scored set reported 16 false-added tags, including 9 nonsensical bare-digit
tags ("1" through "9", qty 2-4 each) alongside ET-1/ET-2/FTR-1B/FTR-2B/
ALP-1/ALP-2/ALP-3. A `git worktree` diff against the commit immediately
before this session's own B-13/B-14 fixes showed the identical 16 false-adds
byte-for-byte — confirmed pre-existing, not a regression from this session's
earlier work.

**Root cause, confirmed by dumping the real sheet graph** (`production-
graph-cli.mjs --mode graph`) and rendering the source page: the three real
"HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE" tables are control-points
matrices — POINT NAME / HARDWARE TAG / HARDWARE POINT TYPE, a bank of 2-4
FAIL MODE columns, a much larger bank (up to 19) of SOFTWARE-prefixed
columns, ALARM LIMITS — not physical-equipment schedules. "HARDWARE TAG"
carries the bare word TAG and "HARDWARE POINT TYPE" carries TYPE, and a
trailing NOTES column is present too — enough to clear `EQUIPMENT_HEADERS`'
own generic `eqHits>=3` bar in `scheduleTableFromODL`
(`web/src/lib/sheetgraph.ts`) the same way a real per-item catalog schedule
does. Their own leftmost column is an unlabeled running row-index (1, 2,
3…), not a real device tag — the real per-point identity lives one column
over, under the real TAG column. Classified equipment-kind, that bare
row-index became each row's own "equipment tag", reached
`buildPlanSetTakeoff`'s equipment sweep, and — because the same small
integers are ALSO drawn as cross-reference callout bubbles on the same
sheet's own control diagram (confirmed by direct render of sheet #20's
BOILER SYSTEM - CONTROL DIAGRAM) — really did find spurious matches.

**Fix shape:** same discriminator family as this file's own B-3 ("choose
the identifier column structurally, not by title vocabulary alone") and the
same title-family-plus-structural-confirmation pattern `sheetgraph.ts`'s
own `isReferenceCrossTable` already establishes for a different "qualifies
equipment-kind on generic vocabulary alone but isn't" shape (CONNECTION/
CALCULATION/ISOLATION tables demoted without a MODEL/MANUFACTURER column of
their own).

**FIXED 2026-09-13** (`web/src/lib/sheetgraph.ts`, `isBasPointFunctionSchedule`).
A new structural check — title names "POINT FUNCTION/LIST SCHEDULE" AND a
real FAIL MODE bank (≥2) AND a real SOFTWARE-prefixed bank (≥4); title alone
is deliberately never enough, mirroring `isReferenceCrossTable`'s own
"never on vocabulary alone" discipline — wired into BOTH the geometric
extractor's own equipment-kind reclassification pass AND the ODL/vectorgrid
`scheduleTableFromODL` path. Both call sites were needed: federal-mech's
own three tables are read through vectorgrid, not the geometric reader, so
fixing only one path would have half-closed the bug. Demotes to
reference-kind, matching `isReferenceCrossTable`'s own precedent — reference
kind is never swept for installed quantities at all (`buildPlanSetTakeoff`'s
equipment loop only ever iterates equipment-kind tables), so the demotion
fully and permanently removes these tables from compile-totals risk, not
just from this one document's own current symptom.

**Result, measured before/after, same command, cold cache:** federal-mech's
false-adds drop from 16 to 7 — every bare-digit phantom tag is gone. The
remaining 7 (ET-1/2, FTR-1B/2B, ALP-1/2/3) are a SEPARATE, already-disclosed
key-file scope gap (see `federal-mech.takeoff.csv`'s own FINDING #2): real,
correctly-extracted equipment tags the key deliberately excludes from
scoring pending independent plan-quantity verification, not a code defect —
out of this entry's own scope. Reference-table extraction stays 31/31 exact
(`scoreReference` only ever iterates the key's own rows, so a newly-
reclassified table adds zero scoring risk there).

**Regression-checked against all 7 frozen scored sets.** federal-mech
directly, via the full eval above. For the other 6 (bessemer, itd-d1-lab,
navfac-cherry-point-atc, bldg5406-hvac-demo, baker-county-eoc,
itd-d1-lab-raster): rather than trust the eval harness's own known
per-document flakiness (`navfac-cherry-point-atc`'s single-document eval
hung 40+ minutes both before AND after this fix, on an unrelated,
pre-existing issue matching this file's own task #68/#70 precedent — killed,
not chased, since it reproduces identically on unmodified code), each PDF's
raw text was scanned directly for every phrase `isBasPointFunctionSchedule`
keys on ("POINT FUNCTION SCHEDULE", "POINT LIST SCHEDULE", "HARDWARE TAG",
"HARDWARE POINT TYPE", "FAIL MODE", "BMS POINT") — zero occurrences in all
6 documents, so the new check cannot structurally fire on any of them; the
fix is a byte-for-byte no-op there, not merely an unlikely one.

**Verified:** `web/test/sheetgraph.test.ts` — a module-level
`isBasPointFunctionSchedule` unit test (the real federal-mech header shape
demotes; a genuine equipment schedule that merely says "POINT" in its title,
or carries the title family with none of the real column shape, does not)
plus a `scheduleTableFromODL` integration test built on federal-mech's real
column shape, confirming the full table never lands equipment-kind. Full
suite: 142/142 passing.

---

### B-16 — two side-by-side numbered-notes lists fuse into one fabricated table, and the real ruled table beside them is missed entirely (NOT FIXED — found, traced, disclosed)

**Where:** `20_TX_JudsonISD_MEP_Upgrades_Pkg6.pdf#4` — found during this
goal's own Demo Corpus hand-verification (`keys/DEMO_CORPUS.txt`), the
smallest one-table document in the draw, picked first specifically because
a small document is fast to grade completely.

**Measured, hand-graded against the render, extractor's answer not in
view first:** the real page carries a small, genuinely ruled 2-column table
— "AHU / NEW FAN INTERLOCKS" (11 real data rows: AHU-1 through AHU-10 plus
RTU-1, values like "EF-04, EF-08", one wrapped 2-line cell on AHU-9) — sunk
inside a "SCHEMATIC — NEW FAN SOFTWARE INTERLOCKED WITH AHU/RTU (SPRING
MEADOWS)" detail block. The production pipeline (`production-graph-cli.mjs
--mode graph`, same command every other entry in this file is measured
with) finds **zero** tables matching this real one. It DOES report exactly
one table — reference-kind, headers `["B.", "OPERATIONAL SEQUENCE:", "B.
(2)", "OPERATIONAL SEQUENCE: (2)"]`, 2 data rows keyed `B.1`/`B.2` — and
this table is **entirely fabricated**: the page's own real content at those
coordinates is two side-by-side "OPERATIONAL SEQUENCE:" numbered-notes
lists (ordinary running prose under labels `B.1`/`B.2`/`B.3`, one list per
control-schematic panel, TYPE 1 and TYPE 2, printed one above the other in
the source) — not a table, not two tables, and definitely not one table
with duplicated header pairs. The `(2)`-suffixed headers are this file's
own existing duplicate-header disambiguation (see the "A ROW'S CELLS ARE
KEYED BY HEADER STRING" comment in `sheetgraph.ts`) silently doing its job
on a table that should never have been built at all.

**Relationship to already-catalogued bugs, and why this is a new entry, not
a duplicate:** the shape is the same DISEASE as B-4's own "reading column
bands mined a fake 13-row table out of two side-by-side SEQUENCE OF
OPERATION prose columns, whose headers were 'WORKSTATION.' and 'SHALL
SEQUENCE THE FOLLOWING:'" and B-8's "three-plus side-by-side tables fused
by Y-clustering" — but neither fix reaches this case. B-4's fix
(`isTitleShaped`) rejects prose from becoming a table's TITLE; it says
nothing about a numbered-list LABEL COLUMN ("B.1", "B.2" — short, real-
code-shaped tokens, not sentences) being accepted as a real header/key
column. B-8's fix targets an empty-corridor gutter between two real ruled
tables; here there is no second real table at all, only two prose blocks
that happen to sit in a shape (short label + long text, repeated down the
page) generic-table detection reads as rows.

**Not fixed.** Not traced past this point — the exact structural signal
that would refuse "a repeating LABEL + LONG PROSE SENTENCE pair is not a
table row" without also refusing genuine short-key/long-description
schedule rows (which are common and real, e.g. any REMARKS-heavy schedule)
needs its own measurement before a fix is written, per this file's own
standing rule against guessing at a fix under time pressure. Left named
and disclosed rather than half-fixed.

**Consequence for the Demo Corpus's own zero-error bar:** this single
document already fails BOTH halves of the bar before any box/cell grading
even starts — MISSED != 0 (the real 11-row table is invisible) and a
phantom table is counted as a win it is not. `keys/DEMO_CORPUS.txt`'s own
header already states plainly that nothing in that set has passed grading
yet; this is the first concrete, measured reason why, not a new admission.

---

### B-17 — a real, correctly-extracted table loses its own title even though the title text sits at a normal, in-range gap (NOT FIXED — found, traced, disclosed)

**Where:** `063_MT_Harrison_Hall_Extruder_Lab_132_Renovation.pdf#9` — found
during the same Demo Corpus hand-verification pass as B-16, this document
picked next in ascending census-count order.

**Measured:** page 9 carries six real, titled, ruled schedule tables
stacked vertically (EXISTING VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE,
EXHAUST FAN SCHEDULE, DEHUMIDIFICATION UNIT SCHEDULE, FILTRATION UNIT
SCHEDULE, GRILLE/REGISTER/DIFFUSER SCHEDULE, and MEP COORDINATION SCHEDULE
— all "- EXTRUDER LAB" suffixed), confirmed by eye on a full-page render
before looking at the extractor's own output. `production-graph-cli.mjs
--mode graph` correctly extracts all six as real `equipment`-kind tables
with correct headers and rows (`EVAV-105`/`EVAV-106`, `EEF-4`, `DU-1`,
`FU-1`, `S-3`/`R-3`, `DU-1`/`FU-1` respectively) — the MEP COORDINATION
table's own 15-column header row and its two `DU-1`/`FU-1` rows all match
the render exactly. But that sixth table's `title` field is `null`, and a
document-wide search confirms the title is not misattached to any other
table either — it is simply dropped.

This is not a missing- or unreadable-title case: `textSpans()` on page 9
finds `"MEP COORDINATION SCHEDULE - EXTRUDER LAB"` as a real span
(`x0:2676.2, y0:2009.6, x1:3921.8, y1:2061.8`), horizontally centered on
the table's own column range to within a few points (span center x≈3299,
table region center x≈3298), and at a title-bottom-to-first-row-top gap of
171pt — squarely inside the 76-182pt range measured for the five sibling
tables on the same page that DID get titled correctly (`182, 132, 130,
133, 76` pt respectively, same page, same document, same title-to-table
visual pattern). Geometrically this title looks exactly like its five
working siblings; something else about this specific header/title pair
(a 15-column header — the widest of the six — with an empty `NOTES`
column present in the header but blank in both data rows, is the only
structural difference noticed so far) causes the title-attachment step to
drop it instead.

**Relationship to already-catalogued bugs:** distinct from B-16 (which
fabricates a phantom table from prose) and from B-4/B-8 (title-shape and
gutter-merge bugs on OTHER real tables) — this is a real table, correctly
read cell-for-cell, that simply surfaces with no title at all despite a
geometrically ordinary title sitting right above it. Not traced past the
geometric comparison above; the actual attachment-selection logic in
`sheetgraph.ts` was not read line-by-line to find why this one pairing is
rejected, per this file's own standing rule against guessing at a fix
under time pressure.

**Consequence for the Demo Corpus's own zero-error bar:** a real table
extracted with fully correct cells still fails a `title`-inclusive exact
match, so this document cannot pass cell-grading as-is even though its
row/cell content is right — a different failure shape than B-16's
MISSED/fabricated pair, but still a concrete, measured reason this
document is not yet clean.

---

### B-18 — the real header row is absorbed into the title string, and the first real data row is promoted to take its place, silently dropping the true last row (NOT FIXED — found, traced, disclosed)

**Where:** `08_ME_BGS_Augusta_EastCampus_Renovation.pdf#16`, "WINDOW
SCHEDULE" — found during the same Demo Corpus hand-verification pass,
next document after 063_MT (census claimed 5 tables for the whole
document; this document turned out to need the FULL pipeline compared
against the render, not just the census tool, to see the real damage —
see B-19 below for why).

**Measured, hand-graded against the render first:** the real table has 14
rows (key column: `A, B, C, D, E, F, G, H, J, K, L, M, N, O` — the
architectural convention of skipping `I`), headers `KEY, TYPE, BRICKMOLD
TYPE, DIVIDED LIGHT TYPE, OPNG WIDTH +/-, OPNG HEIGHT +/-, COUNT, NOTES`,
under a plain one-line caption `WINDOW SCHEDULE`. `production-graph-cli.mjs
--mode graph`'s actual output for this table:
- `title.text`: `"WINDOW SCHEDULE BRICKMOLD DIVIDED LIGHT KEY TYPE TYPE
  TYPE OPNG WIDTH +/- OPNG HEIGHT +/- COUNT NOTES"` — the entire real
  header row's text has been concatenated onto the real one-line caption,
  becoming the reported title.
- `headers`: `["A", "CLAD WOOD DOUBLE HUNG", "A 2", "A 3", "3'-7\"",
  "5'-6\"", "9", "COL8"]` — these are not headers at all; they are the
  real DATA from row `A` (`KEY=A, TYPE=CLAD WOOD DOUBLE HUNG,
  BRICKMOLD=A, DIVIDED LIGHT=A, WIDTH=3'-7", HEIGHT=5'-6", COUNT=9`),
  reported as the column headers.
- `rows`: keyed `B` through `N` — 12 rows. Row `A` is gone (consumed as
  the fake header above) and row `O` (the real last row) is gone too, with
  no trace of it anywhere in the table object.

So one real header-absorption event costs this table its whole header AND
one full data row (`O`), while a coincidentally table-shaped data row
(`A`) is misread as the header the whole table is keyed against — net 12
of 14 real rows surfaced, the true header lost, and the title polluted
with the header text it swallowed.

**Relationship to already-catalogued bugs:** distinct from #90's fix
(header-JOIN loop no longer swallows a pre-header spec-metadata row INTO
the header) — this is the same family of confusion (header/title/data
boundary) but in the opposite direction: here the real header is swallowed
INTO the title, and a real DATA row is promoted to serve as the header,
rather than a metadata row being swallowed into the header. Not traced
into `sheetgraph.ts`'s header-detection code past this measurement, per
this file's standing rule against guessing at a fix under time pressure.

**CONFIRMED RECURRING 2026-09-13 — second real instance, different
document.** `28_WA_KCHA_PublicHousing_HVAC.pdf#2`'s `AIR TERMINAL
SCHEDULE` shows the identical signature: the real header (`SYMBOL, AIR
TERMINAL - SIZES AS NOTED ON PLANS`) is gone, the first real data row
(`SG`, with its full multi-sentence description — `"SUPPLY GRILLE: TITUS
MODEL 300FS FOR INSTALLATION..."`) is promoted to serve as the reported
`headers`, and the table surfaces with only 2 of its 3 real rows (`RG`,
`WTG` — `SG` consumed). A likely knock-on effect measured here for the
first time: this table's `kind` also flips from `equipment` to
`reference`, plausibly because the header-detection code that decides
table kind sees long descriptive prose (the misplaced `SG` row) where it
expects short column labels. This is not a one-document quirk; it is a
repeatable failure mode.

**CONFIRMED RECURRING 2026-09-13 — third real instance, third document, a
new variant of the same signature.** `25_WA_DouglasCounty_Courthouse_HVAC_
DDC.pdf#4`'s `HEAT PUMP SCHEDULE - SPLIT SYSTEM TYPE` (real rows: `HP-10`,
`HP-20`) shows a slightly different flavor of the identical disease: every
one of the ~34 real column headers gets the first real data row's own
value APPENDED to it (`"SYMBOL HP-10"`, `"COOLING CAP. * TOTAL MBH 30"`,
`"A - INDOOR UNIT *** FAN CFM 730"`, …, one fused `header+HP-10-value`
string per column), and `HP-10` never appears as its own row at all — only
`HP-20` survives as a normal row. Same root failure (the real header and
the first real data row collapse into one another) but manifesting as a
per-column fusion rather than a whole-row promotion — worth recording as
a distinct sub-shape of the same bug, not a new bug number.

**Consequence for the Demo Corpus's own zero-error bar:** MISSED != 0 (row
`O`, and the true header row, are both gone) and the reported cells for
row `A` do not exist in `rows` at all — they were reassigned to `headers`
instead. This table cannot pass either box- or cell-grading as extracted.

---

### B-19 — two real schedule tables vanish entirely from the same document while unrelated floor-plan callout text nearby gets fused into a fabricated one-row table (NOT FIXED — found, traced, disclosed)

**Where:** `08_ME_BGS_Augusta_EastCampus_Renovation.pdf` — same document
as B-18, found in the same pass. This is why the Volume-floor census
tool's own claim for this document (5 titled tables, 49 rows — cited in
`keys/DEMO_CORPUS_GRADING.md`) could not be trusted at face value: the
census tool runs `buildSheetGraph` directly with no vectorgrid/ODL layer,
while `production-graph-cli.mjs --mode graph` (the actual deployed
pipeline, and the tool every other entry in this file is measured with)
reports a completely different, much worse shape for the same document.

**Measured, hand-graded against the render first:** four real schedule
tables exist in this document — `WINDOW SCHEDULE` (p16, 14 rows, see
B-18), `DOOR AND FRAME SCHEDULE` (p25, 14 rows: `101.1, 105.1, 121.1,
124.1, 146.1, 148.1, 149.1, 150.1, 155.1, 155.2, 158.1, 159.1, 201.1,
301.1`), `PROJECT FINISH SCHEDULE` (p23, 12 rows: rooms `111, 116, 121,
124, 140, 148, 149, 150, 155, 156, 157, 158`), and `LIGHTING FIXTURE
SCHEDULE` (p35, 4 rows: `A, B, EX, EL`). The full production pipeline's
own table list for this document contains exactly 4 tables total — one is
the correctly-out-of-scope cover-sheet `DRAWING LIST` (34 sheets, `reference`
kind, matches the existing `Revisions`-table precedent for legitimate
non-schedule reference tables), one is `WINDOW SCHEDULE` (corrupted, see
B-18), one is `LIGHTING FIXTURE SCHEDULE` (rows and headers all correct,
but `title: null` — the same defect class as B-17, a 5th and 6th instance
of that pattern across this pass), and the fourth is on page `#23` with
`title.text: "7 A 6 604 8 EVS 5"`, `headers: ["COL1", "W1 149", "COL3"]`,
and exactly one row (`key: "C1"`, cells `{"W1 149": "W1 149", "COL3":
"C1"}`). That fourth table is not the real `PROJECT FINISH SCHEDULE` at
all — its region and every cell trace to wall-type and room-number
callout tags (`W1`, `C1`, `149`) scattered around the "ENLARGED PLAN" /
"TOILET ROOM" floor-plan drawing on the SAME page, well away from the real
schedule sitting at the bottom of that sheet. `DOOR AND FRAME SCHEDULE`
(p25) has no corresponding table anywhere in the output at all — not
garbled, not misattached, simply absent.

**Relationship to already-catalogued bugs:** the page-23 fabrication is
the same DISEASE as B-16 (unrelated page content fused into a fake table
that a reviewer could mistake for a real schedule) but a different domain
— plan callouts, not prose notes — so a fix for one is not guaranteed to
reach the other. The page-25 disappearance is not yet traced to any known
cause; it was not fabricated into anything else findable in this output,
it is simply not there.

**Consequence for the Demo Corpus's own zero-error bar:** of this
document's 4 real schedule tables, 0 pass extraction cleanly — 2 are
completely missing, 1 is corrupted (B-18), and 1 is correct but untitled
(same class as B-17) — while a genuinely fabricated table is reported as
if it were real. This is the worst-scoring document graded so far in this
pass.

**CONFIRMED RECURRING 2026-09-13 — third real instance, third document,
same pass.** `28_WA_KCHA_PublicHousing_HVAC.pdf#2` fabricates not one but
THREE separate fake `reference`-kind tables from unrelated page content,
none of them a real schedule:
- `"SPRING VIBRATION ISOLATOR"` (2 rows) and `"REQUIRED, SEE"` (2 rows) —
  both trace to the annotation callout labels of the `IN-LINE FAN
  INSTALLATION DETAIL` isometric drawing on the same sheet (e.g. cells
  `"CONNECT"`/`"CONNECTION"`, `"MOUNT SPEED CONTROLLER ON..."`/`"IN-LINE
  FAN INSTALLATION DETAIL"` — detail-callout text, not tabular data).
- `"UNTITLED"` (2 rows) is the strangest instance yet: its region
  (`[4796, 278.8, 5101.5, 2396]` — ~305pt wide, ~2100pt tall) is the
  sheet's own narrow vertical TITLE-BLOCK SIDEBAR, and its fabricated
  headers are the letter-spaced firm name (`"T R E S W E S T"`, `"E N G I
  N E E R S,"`, `"I N C."`) with cells built from the project-title box
  (`"PROJECT TITLE BRITTANY PARK KING COUNTY"`, `"HVAC UPGRADES"`,
  `"4-30-2026"`). This is the same disease reading a different part of
  the page furniture than either the p23-callout case above or the
  prose-note case in B-16 — three distinct source materials (prose,
  plan callouts, title-block sidebar text), one shared failure: unrelated
  page text gets clustered into a table shape and reported as if it were
  a real schedule. Not a document-specific quirk.

---

### B-20 — a real row is captured twice, byte-for-byte identical, inflating a table's own row count with a phantom duplicate (NOT FIXED — found, traced, disclosed)

**Where:** `083_MA_Town_Offices_Facilities_HVAC_System_Upgrades.pdf#4`,
"COMMON AREA - AIR COOLED HEAT PUMP SCHEDULE" — found during the same
Demo Corpus hand-verification pass, next document after 28_WA.

**Measured, hand-graded against the render first:** the real table has 3
rows (`HP-1` LIBRARY, `HP-2` NURSE, `HP-3` SWEGON — a dense 9-table
schedule page, H0.2, otherwise extracted essentially perfectly:
`COMMON AREA DX FAN COIL UNIT SCHEDULE` 4/4, `HVAC POWER EQUIPMENT
SCHEDULE` 5/5, `REGISTER, GRILLE & DIFFUSER SCHEDULE` 4/4, both
`ENERGY RECOVERY VENTILATOR SCHEDULE` instances 1/1 each despite sharing
one exact title string, `PIPE MATERIAL TABLE` 2/2, `INSULATION TYPE
SCHEDULE` 4/4, `ELECTRIC HEATING COIL SCHEDULE` 1/1 — this is otherwise
one of the cleanest dense pages graded in this pass). `production-graph-
cli.mjs`'s own output for the heat pump schedule reports 4 rows: `HP-1`
appears TWICE, with every cell byte-for-byte identical both times
(`MODEL NO.: RXLQ144TATJU`, `MBH COOL: 144`, `OPERATING WEIGHT: 1446
LBS`, `REMARKS: SEE NOTES` — nothing differs between the two copies), then
`HP-2` and `HP-3` follow once each, correctly.

**Relationship to already-catalogued bugs:** distinct from B-6 (a whole
table redrawn twice at two DIFFERENT scales elsewhere on a sheet, read as
two colliding tables) — this is one real row, inside one real table,
captured twice with no variation at all, immediately adjacent to two
other rows from the same table that were each captured exactly once. Not
traced into the row-clustering code to find why this one row's y-band
produced two identical clusters instead of one, per this file's standing
rule against guessing at a fix under time pressure.

**Consequence for the Demo Corpus's own zero-error bar:** a phantom row
that is not a fabrication of new content (unlike B-16/B-19) but an exact
duplicate of real content still fails an exact row-count match — this
table cannot pass cell-grading as extracted despite every cell value
being individually correct.

---

### B-21 — an entire recurring table FORMAT (multi-panel electrical schedules) is invisible to extraction: at least 12 real tables across 2 sheets, 0 found (NOT FIXED — found, traced, disclosed)

**Where:** `25_WA_DouglasCounty_Courthouse_HVAC_DDC.pdf#8` and `#9`
(sheets `E0.03` and `E0.04`, "ELECTRICAL PANEL SCHEDULES") — found while
grading this document's HVAC schedules (page 4-5, otherwise a clean
6-of-7-tables-correct result once B-18's known signature on the `HEAT
PUMP SCHEDULE` is set aside — see that entry's newest instance).

**Measured:** each of these two sheets lays out SIX real, titled, fully
ruled "THREE PHASE PANEL SCHEDULE" tables side by side — an EXISTING
version and a REVISED version of each of 3 panels (`M`/`M(R)`,
`MSB1`/`MSB1(R)`, `BH1`/`BH1(R)` on p8; `BP3`/`BP3(R)`, `BP2`/`BP2(R)`,
`BP1`/`BP1(R)` on p9), each with ~15-17 real circuit-description rows
per panel. `production-graph-cli.mjs --mode graph`'s full output for this
22-sheet document contains exactly 12 tables total, and NONE of them are
these panel schedules — not fabricated into something else findable, not
partially captured, simply absent. At least 12 real ruled tables (and
likely more once sheet `E0.05`, not yet checked, is counted) are entirely
unreachable through this pipeline.

**Relationship to already-catalogued work:** task #64 ("Fix vectorgrid/ODL
over-merge that corrupted 25_WA's stacked schedules") and task #88 ("16_NV
#32 and all 3 of 25_WA's sheets never reach structure recognition at all
under current code") are both closed as completed against this exact
document. Whether this is a regression of that fix, a different sheet
than the "3 sheets" #88 already covered, or a genuinely new failure mode
specific to the "THREE PHASE PANEL SCHEDULE" boxed multi-panel layout was
not determined here — flagged for a follow-up session to reconcile against
those closed tasks' own original evidence before attempting a fix.

**Consequence for the Demo Corpus's own zero-error bar:** this is the
largest single MISSED count measured in this pass so far by table count —
at least 12 real tables with real circuit-level electrical data,
completely absent from a document whose HVAC-specific schedules otherwise
extract almost perfectly.

---

## How these connect

Two distinct classes, and the split matters for how they get fixed.

**Absence — a field never read, a path never wired (B-1, B-2).** Nothing is misjudged;
something simply was never built. Bounded, mechanical, testable on unit fixtures without the
bulk corpus. Low regression risk. These are the cheap wins.

**False structural inference — position or shape trusted without checking identity
(B-3, B-4).** This is the same disease as GOAL.md rule 18, whose four root causes were: a
path segment assumed to run left-to-right (half of them do not), a bare `"2"` assumed to be
an outline marker (it was a quantity), column 0 assumed to be an identifier, and a lone
all-caps span assumed to be a title. B-3 and B-4 are two more instances of exactly that
pattern.

**CONFIRMED 2026-09-05, and it reaches further than the two entries this
paragraph originally named.** B-7 turned out to be a fourth instance once
traced: `clusterGenericColumnsOnce` infers "these tokens are one column" from
x-proximity alone, without testing the property that actually distinguishes a
column — that it is a VERTICAL STACK rather than a horizontal run. B-10 is a
fifth: a section banner is treated as a data row because of where it sits.
Every fix applied this pass is the same move — name the distinguishing
property and measure it: cardinality-plus-letters for an identifier column
(B-3), band-fill-plus-terminal-period for a title (B-4), same-tier separation
for a column (B-7), mirrored-and-periodic for page furniture (B-7).

The through-line: **the pipeline infers what something IS from where it SITS or what it
LOOKS like, without testing the claim.** GOAL.md's standing rule 1 already names this —
"regex is never the classification engine, structure is; regex may confirm a structural
finding but must never be the sole thing between found and not found." Every entry in this
second class is a violation of that rule that shipped.

Fixing them one at a time produces three narrow patches. The structural fix is a shared
discriminator: *before treating a column as an identifier, a span as a title, or a token as a
marker, test the property that actually distinguishes it* — cardinality for an identifier,
band-fill ratio for a title, column population for a data row.

## What is working

Worth recording alongside the failures, because the bug list alone reads worse than the
system is. `001_NC_FY20_P_228_ATC_Tower` — a real federal ATC tower project nobody tuned
against — compiled **333 items across 22 populated categories** with correct marks:

- `AHU-M1`/`AHU-T1A`/`AHU-T1B` kept distinct from `DOAH-M1`/`DOAH-T1` and from 6 `CRAH-*`
  computer-room units — three families a naive classifier smears together
- 28 FCUs, 25 VAVs, 4 boilers; air-cooled chillers (`CH-A1`) separated from heat-recovery
  chillers (`CH-MT1`)
- 18 pumps with discipline vocabulary intact: `HRHWP`, `PCHWP`, `SCHWP`, `PHHWP`, `SHHWP`
- 64 CHW + 99 HHW control valves named by served equipment (`CV-AHU-A1-CHW`,
  `CV-FCU-A8-A-HHW`) — the valve-to-equipment relationship survives, which is the hard part
- air separators (`AS-CHW-M1`) separated from expansion tanks (`ET-CHW-MT1`); humidifiers
  from dehumidifiers
- building segmentation (`-M-`/`-T-`/`-A-`) consistent across every family

The core engine — extraction, family classification, tag parsing, valve-to-equipment
cross-referencing — works on real documents. The bugs above are edges, not foundations.
