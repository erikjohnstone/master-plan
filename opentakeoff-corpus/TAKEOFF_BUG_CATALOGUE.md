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

### B-16 — two side-by-side numbered-notes lists fuse into one fabricated table, and the real ruled table beside them is missed entirely (CORRECTED 2026-09-14 — both halves closed, neither by a new fix)

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

**Not fixed at the time this entry was first written.** Not traced past
this point — the exact structural signal that would refuse "a repeating
LABEL + LONG PROSE SENTENCE pair is not a table row" without also
refusing genuine short-key/long-description schedule rows (which are
common and real, e.g. any REMARKS-heavy schedule) needs its own
measurement before a fix is written, per this file's own standing rule
against guessing at a fix under time pressure. Left named and disclosed
rather than half-fixed.

**Consequence for the Demo Corpus's own zero-error bar (at the time):**
this single document already failed BOTH halves of the bar before any
box/cell grading even starts — MISSED != 0 (the real 11-row table is
invisible) and a phantom table is counted as a win it is not.
`keys/DEMO_CORPUS.txt`'s own header already stated plainly that nothing
in that set had passed grading yet; this was the first concrete, measured
reason why, not a new admission.

**RE-VERIFIED LIVE 2026-09-14 — both halves closed, neither by a change
made this pass.** Re-ran `production-graph-cli.mjs --mode graph` against
this exact page (`qpdf`-sliced to page 4 alone,
`OPENTAKEOFF_GRAPH_TRACE=1`) as part of a fresh pass through this file's
own open items.

1. **The fabrication half is gone.** The pipeline now reports **zero**
   tables for this page — not the originally-described 1 fabricated
   `reference`-kind table (headers `["B.", "OPERATIONAL SEQUENCE:", "B.
   (2)", "OPERATIONAL SEQUENCE: (2)"]`). `vectorgrid`'s own trace shows
   both candidate regions it tried are correctly DECLINED ("unknown kind
   and no title"; "no keyed data rows (kind reference, key column col
   0)") rather than accepted. This was not a change made in this pass —
   no code was touched to produce it — so it is an unclaimed, verified
   side effect of unrelated fixes made earlier in this session (the same
   pattern already seen in B-30's own `isTitleBlockTable` guard and
   B-38's `unitLabelSubHeader` fix each incidentally closing an
   originally-cited symptom before their own targeted fix was written).
   Recorded here as confirmation, not claimed as new work.

2. **The real 11-row table's miss is not a new, fixable defect — it is
   the already-established, out-of-scope vector-outlined-glyph category**
   (`HELDOUT_GRADING.md`'s own confirmed documents: `056_NY`, `020_MO`,
   `086_CA`, `D_25_CO`; goal doc's own Scope rule: "vector-outlined-glyph
   content is correctly EXCLUDED, not a pipeline defect"). Direct,
   measured confirmation this pass: rendering the page (scale 1.5, full
   page, then a 6x crop of the table's own region) shows the real `AHU |
   NEW FAN INTERLOCKS` table exactly as this entry's own original
   description states — a ruled 2-column box, `AHU-1` through `AHU-10`
   plus `RTU-1` down the left column, `EF-04, EF-08` etc. down the right.
   But `textSpans()` run against this exact page (same tool used
   throughout this file to hand-verify every other document) finds
   **zero** occurrences of `AHU-1`, `AHU-10`, `RTU-1`, `EF-0`, or even the
   word `SCHEMATIC` anywhere on the page — despite `SCHEMATIC` printing
   legibly FOUR times in the render (the detail's own title plus each of
   the four `CONTROL SCHEMATIC` captions) and the table's own row labels
   being read off the render directly above. This is the identical
   signature already used to diagnose every other document in this
   category (`086_CA`'s own entry: "only 31 real text spans exist on the
   whole page, and every one is title-block boilerplate... literally NONE
   of the 3 tables' own titles, column headers, or 28 data rows...appear
   in the text layer at all") — the table's own cell content is drawn as
   vector-outlined glyph geometry, not real PDF text objects, so no
   text-based extractor (this one included) can recover it. A ruled-box
   detector could in principle still find the table's own drawn lines,
   but every cell would come back empty regardless — the miss is
   guaranteed by the missing text layer, not by a box-detection gap.

Both halves closed, correctly attributed: the fabrication half to an
already-shipped, unrelated fix; the miss half to an already-documented,
explicitly out-of-scope PDF-authoring limitation, not a new pipeline
defect. No code change accompanies this entry.

---

### B-17 — a real, correctly-extracted table loses its own title even though the title text sits at a normal, in-range gap (NOT FIXED corpus-wide — 1 of 9 documented instances closed as a verified side effect of B-42, 2 confirmed still open, root cause itself unaddressed)

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

**CONFIRMED RECURRING 2026-09-13 — three more instances, one document.**
`04_NV_VA_LasVegas_CentralUtilityPlant.pdf#32` ("MECHANICAL SCHEDULES AND
DETAILS") shows this exact signature three more times on one page: `SURGE
TANK SCHEDULE` (1 row, `T-1`), `STEAM RECOVERY HEAT EXCHANGER` (1 row,
`HE-1`), and `PUMP SCHEDULE` (4 rows, `CWP-1..5`/`CHP-1..5`/`BP-1`/
`IWP-1`) all surface as `title: null`, every cell content otherwise
correct. `PUMP SCHEDULE` additionally loses several of its own real
column headers to generic `COL1`/`COL10`/`COL11` placeholders despite
every cell value being right — a title-loss and a partial header-loss
happening together on the same table. The same page's `LOUVER SCHEDULE`
survives with its title intact but polluted (`"LOUVER SCHEDULE LV #"`).
Five real tables on one page, all with SOME title/header damage, zero
with none — this is not a rare edge case on this document.

**CONFIRMED RECURRING 2026-09-13 — a 6th document.**
`042_VA_Renovate_VCS_Patriot_Cafe_VA_project_546_17.pdf#9`'s `HVAC DESIGN
DATA` table (real rows: `OUTDOOR DESIGN CONDITIONS`, `KITCHEN (FOOD
PRODUCTION)`, `DINING AREA (CAFETERIA)`, `CORRIDORS`, `OFFICES`, `ALL
OTHER SPACES`) shows a double loss: the true title is gone (replaced by
an internal sub-header, `"INDOOR AREA TEMPERATURE/HUMIDITY SETPOINTS"`,
that is real text FROM the table but not its title), `KITCHEN (FOOD
PRODUCTION)`'s own values are glued into `headers` per this bug's usual
signature, and `OUTDOOR DESIGN CONDITIONS` is dropped from the output
entirely with no trace — only `DINING`, `CORRIDORS`, `OFFICES`, and `ALL
OTHER SPACES` survive as real rows, 4 of the real 6.

**CONFIRMED RECURRING 2026-09-13 — a 7th document, two more instances.**
`096_IN_Vermillion_County_Jail_Mechanical_Bid_Set.pdf` shows this exact
signature twice more, on two different sheets: `#20`'s `AIR COOLED
CHILLER SCHEDULE` (4 rows: `CH-1`, `CH-2`, `HRC-1`, `HRC-2`, all correct)
and `#22`'s `DIFFUSER / GRILLE SCHEDULE` (51 rows, all correct — the
densest table hit by this bug so far). Both real titles are confirmed
present as ordinary, legible vector text spans at the normal position
directly above their own table (`textSpans()`: `"AIR COOLED CHILLER
SCHEDULE"` at p20 y0=133.3, `"DIFFUSER / GRILLE SCHEDULE"` at p22
y0=155.7 — both at the same top-of-page title row as their sibling
tables' own titles), yet both surface as `title: ""` in the extractor's
own output while every other table on the same two sheets (6 more on
#20's sheet, including one — `SIDEWALL GRILLE SCHEDULE` — with a nearly
identical name pattern that titled correctly) keeps its title intact.
Row/cell content for both tables is otherwise fully correct (hand-
verified against the render). This closes out 001_NC and 096_IN as two
back-to-back documents in this pass where every table and every row is
content-correct and only the title-attachment layer fails — reinforcing
that this is a distinct, common failure mode from the missing/fabricated-
table bugs (B-16/B-19/B-25), not a rare one-off.

**CONFIRMED RECURRING 2026-09-13 — an 8th document, starting the HELDOUT
set's own missed-checking pass.**
`26_CA_TransbayTower_Mechanical_64Sheets.pdf#11`'s `WATER FILTRATION
UNIT` table (1 row: `WFU-62-1`, capacity/pump data all correct) surfaces
as `title: ""` despite its own real title sitting at an ordinary position
directly above the table. Same signature, same non-fix.

**ROOT CAUSE CONFIRMED 2026-09-13 (code-level, precise — not fixed, see
below for why).** Traced live on the original 063_MT#9 case via a
`qpdf`-sliced single page and temporary instrumentation (added,
exercised, then fully reverted — no debug code left in the tree) printed
at both `scheduleTableFromODL`'s own `refuse()`/successful-build return
points and `nearbyScheduleCaption`'s own candidate list. The real
mechanism is neither a dedup/completeness scoring bug nor a stray-
candidate-wins bug (both plausible guesses this pass initially chased
and disproved by direct measurement) — it's simpler and more specific:

**vectorgrid genuinely tries two different row-boundary hypotheses for
the SAME physical MEP COORDINATION SCHEDULE region**, confirmed via the
exact instrumented sequence: a first candidate (raw ODL bbox `[1109.4,
1007.28,2189.04,1094.88]`) is built with its title CORRECTLY recovered
in-grid (`"MEP COORDINATION SCHEDULE - EXTRUDER LAB"`, `nearbyScheduleCaption`
found nothing to improve, meaning `titleCell` already succeeded) — but
its own row-keying then fails and it is refused whole: `refuse("no keyed
data rows (kind equipment, key column \"MARK\")")`. `refuse()` returns
bare `null`; the correctly-recovered title is discarded with the rest of
the candidate, with nothing carried forward. A SECOND, separate candidate
(raw bbox `[1109.4,1066.08,2189.04,1158.48]`, shifted ~59pt down —
excluding the title row) is built for what is structurally the same
table; its own row-keying succeeds (`rows: 2`), but because its own
narrower region starts below the title row, both `titleCell` and
`nearbyScheduleCaption` find nothing, and it survives into the graph with
`title: null` — the table this bug's every measured instance actually
shows.

This is a THIRD confirmed instance of vectorgrid emitting more than one
candidate region for one real table (same general family as B-26's
disjoint block-split and B-38's overlapping-candidate duplicate) — but
narrower and more specific than either: here the two candidates are
close variations of the SAME row-boundary decision (does the title row
belong inside the table's own detected grid or not), not a header/data
block split or a bottom-edge ambiguity.

**Why this is disclosed without a fix.** Closing this properly needs new
plumbing, not a local change: `refuse()`'s only signal today is a reason
string via `opts.reject`, with no channel to carry a correctly-recovered
title (or its evidence bbox) out of a candidate that is about to be
discarded for an unrelated reason (bad row-keying). A real fix means (a)
widening the reject channel to optionally carry an orphaned title, (b)
collecting these per-sheet across `extractScheduleTablesFromVectorGrid`'s
own loop over `reply.tables` (six call sites in this codebase build a
`ScheduleTable` via this same function, so the plumbing has to stay
generic), and (c) a later pass that applies an orphaned title to a
title-less survivor only when their regions are close/overlapping enough
to be confident they name the same physical table — new cross-candidate
stitching logic with its own false-positive risk (wrongly attaching one
table's title to an unrelated neighbor) that needs real corpus
validation, not a guess under time pressure, per this file's own
standing rule.

**Two related, genuinely independent reconciliation gaps found and fixed
along the way (real improvements, verified NOT to close this specific
063_MT#9 case — see below).** While tracing the above, direct code
reading of `web/src/lib/tableExtractorReconcile.ts` turned up two
existing reconciliation functions with the identical missing-title-
carryover gap, for a case this specific bug doesn't hit (its own losing
candidate is refused before either function ever sees it) but that
could plausibly affect some other document in this 500+ corpus where two
genuinely competing FULL candidates (not one refused, one surviving)
reach these comparisons:

- `dedupCrossSourceTables` — drops the weaker of two overlapping PRIMARY
  tables (IoU >= 0.72) purely by a headers/cells/duplicate-key score with
  only a token `+5` title bonus, small enough that a handful of extra
  cells on the losing side always wins regardless. Fixed: when dropping
  a losing candidate, if it has a title and the winner doesn't, the title
  now carries over onto the winner before the drop.
- `adoptVectorGridTables` — when vectorgrid's own reading of a sheet
  displaces an existing (pre-vectorgrid) table by having more/equal
  headers and cells, the existing table's title was discarded outright
  with no carryover at all (not even a token bonus). Fixed identically:
  a displaced table's own title, if the winning vectorgrid table lacks
  one, now survives onto it.

Both fixes are metadata-only (never touch rows, cells, region, or the
completeness comparison itself; never overwrite a winner's own real
title) and are covered by 3 new unit tests in the new `test/
tableExtractorReconcile.test.ts` (the title-carryover case, a case
proving a winner's own title is never overwritten, and a case proving
tables that don't overlap enough are never merged). All 212 tests across
`sheetgraph.test.ts`/`vectorTakeoffPipeline.test.ts`/
`scheduleLanguageScan.test.ts`/`tableExtractorReconcile.test.ts`/
`schedulePlanReconcile.test.ts` pass. Confirmed live at the time that
neither change affects 063_MT#9 itself (re-ran before/after: `title:
null` unchanged) — these were real, tested, disclosed improvements to a
general risk the reconciliation layer had, not a claimed fix for this
specific bug.

**CLOSED for the original 063_MT#9 case (2026-09-13, later the same
day) — an unplanned, verified side effect of the B-42 fix, not a change
made for this bug.** B-42's fragment-merge rework of
`extractScheduleTablesFromVectorGrid` (`vectorGridAdapter.ts`) stacks a
structurally-refused fragment onto a geometrically-adjacent survivor —
built for 028_TX's 3-way split schedule, but its own eligibility rule
(`"no keyed data rows"` with `<= 3` rows, or `"no header block above the
data"`) and adjacency check (same column count, vertically within ~30pt
allowing overlap) generalize past that one document. 063_MT#9's own two
row-boundary candidates for `MEP COORDINATION SCHEDULE - EXTRUDER LAB`
are exactly that shape: the title-bearing candidate is refused with `"no
keyed data rows"` at 2 rows (clears the `<= 3` gate), and its bbox
overlaps the title-less survivor's own shifted region by the same kind
of margin 028_TX's own seam does — so B-42's merge logic picks it up and
reconstructs the same correct table this entry's own root-cause trace
predicted a real fix would need to build. **Verified with a controlled
before/after** (the pre-B-42 `vectorGridAdapter.ts`, checked out via
`git show` and swapped in temporarily, then restored byte-identical):
before, the sixth table on `063_MT#9` surfaces `title: null`, `rows: 2`;
after, `title: "MEP COORDINATION SCHEDULE - EXTRUDER LAB"`, the same 2
correct rows — this entry's own originally-measured case is now genuinely
fixed, not merely coincidentally similar.

**Checked whether the same side effect closes this bug's OTHER 8
documented instances — mostly no, one inconclusive.** Re-ran the
identical controlled before/after against every other instance's own
source page:
- `04_NV#32` and `096_IN#20`: both `SURGE TANK SCHEDULE`/`PUMP SCHEDULE`
  (04_NV) and `AIR COOLED CHILLER SCHEDULE` (096_IN) already carry their
  correct title in BOTH the pre- and post-B-42 single-page slice —
  identical before and after, so this check is **inconclusive** for
  these two: either the original defect required the full multi-page
  document's own context to reproduce (plausible; every other bug in
  this file measured on a single-page slice has reproduced cleanly, but
  title-attachment specifically may cross-reference sibling sheets) or
  it no longer reproduces for an unrelated reason. Neither confirmed
  fixed nor confirmed still-broken by this pass; re-check against the
  FULL document, not a slice, before crediting or discounting either.
  (04_NV's own third instance, `STEAM RECOVERY HEAT EXCHANGER`, does not
  appear in this page's own slice output at all, before or after —
  a separate, unexplained absence, not traced here.)
- `096_IN#22`'s `DIFFUSER / GRILLE SCHEDULE` (51 rows) and `26_CA#11`'s
  `WATER FILTRATION UNIT` (1 row): both **still `title: null`, byte-
  identical before and after** — genuinely unaffected. Consistent with
  the root-cause trace's own prediction: B-42's merge only fires when the
  refused candidate's own reason and row count clear its narrow
  eligibility gate, which is not guaranteed (and evidently does not hold)
  for every instance of this bug.
- `042_VA#9`'s `HVAC DESIGN DATA` table was not re-diff'd (its own
  failure shape — a WRONG title, not a null one, borrowed from an
  internal sub-header — falls outside what B-42's merge logic could
  plausibly touch, and the post-fix output already matches this entry's
  own original description exactly).

**Net effect:** this bug's own root cause (vectorgrid's two row-boundary
candidates, `refuse()` discarding a correctly-recovered title) is
UNCHANGED and still not directly fixed — the general orphaned-title
plumbing this entry's own "why disclosed without a fix" section describes
is still not built. What changed is that B-42's unrelated fragment-merge
logic happens to also clear this bug's own original measured case,
purely because both bugs are instances of the same deeper "vectorgrid
proposes more than one candidate region for one physical table" family.
At least 2 of this bug's 9 documented instances remain confirmed open
(`096_IN#22`, `26_CA#11`), 1 more's failure shape is unchanged
(`042_VA#9`), and 2 are inconclusive on a single-page slice
(`04_NV#32`, `096_IN#20`'s original finding) — **not closed corpus-wide**,
title still `NOT FIXED` as this entry's own header should keep saying
until the real plumbing is built.

---

### B-18 — the real header row is absorbed into the title string, and the first real data row is promoted to take its place, silently dropping the true last row (FIXED 2026-09-13)

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

**CONFIRMED RECURRING 2026-09-13 — a 5th document, combined with B-21's
own pattern on the same page.** `17_FL_SuwanneeHS_Courtyard_100CD.pdf#30`
carries three real "Branch Panel" schedules (`EMDP`, `HN7B`, `LN7C`).
`EMDP` (21 real circuit rows) surfaces with the same signature yet again
— `title: null` (reported as `UNTITLED` — the panel's own real name
`"Branch Panel: EMDP (EXISTING GE PANEL)"` is gone), and `headers` shows
the same header+first-row fusion (`"CIRCUIT DESCRIPTION 30 KVA XFMR"`,
`"TRIP 50 A"`, etc. — the real header text glued to circuit 3's own real
values). The other two panels on the identical page, `HN7B` (15 rows) and
`LN7C` (15 rows), are not fused into this one and not fabricated into
anything else findable — they are simply absent, the same disease as
B-21. This single page shows both bugs operating together: one table
survives corrupted (B-18's signature), two vanish outright (B-21's).

**CONFIRMED RECURRING 2026-09-13 — a more severe variant, same page as
the three-instance note above.** The SAME `04_NV_VA_LasVegas_
CentralUtilityPlant.pdf#32`'s `COOLING TOWER SCHEDULE` shows the worst
version of this disease measured yet: its real data row (`CT-1,2,3,4`,
`EVAPCO AT-114-1024`, `2,400 GPM`, …) is not merely mislabeled — it is
GONE. In its place, two fragments of the table's own multi-tier header
row (`"MANUFACTURER"`/`"MODEL NUMBER"`/`"FLOW"`/`"FANS"`/`"MAX"` spanning
two printed header lines) are each misread as a separate DATA row keyed
`"FLOW"` and `"MODEL NUMBER"`. Same family as B-18 (header/data boundary
confusion) but here the real content is lost outright rather than
demoted into headers — worth flagging as the more severe end of this
same failure spectrum, likely triggered by the two-line header this
table's real caption uses where the others on this page use one line.

**FIX (2026-09-13):** root-caused live via `OPENTAKEOFF_GRAPH_TRACE=1`
against a busted cache (`cachedSheetGraph` was silently serving a stale
result and swallowing every trace line until `~/.cache/opentakeoff-sheet-
graph` was cleared) — this is a `vectorgrid`/`celltext.py` geometry issue,
not a `sheetgraph.ts` title-detection issue as originally suspected. A
rendered crop of `08_ME#16` confirmed the real drawing: ONE outer ruled box
encloses the caption, the header labels, AND every data row, with internal
column dividers running only from the header row downward — no rule at all
separates "WINDOW SCHEDULE" from the header labels below it, only the
header/data boundary is drawn. `vectorgrid.py`'s face for that band is
therefore geometrically correct (there is genuinely no internal division to
find); `celltext.py`'s `cell_text()` then flattens that face's two real text
lines ("WINDOW SCHEDULE" at y~1101-1117, the real 8-column header labels at
y~1175-1199, a 58pt gap between them) into one string, exactly as it is
supposed to for a genuinely wrapped multi-line cell — the bug is that this
face was never one real cell to begin with.

Added `split_unruled_header_row()` in `bakeoff/celltext.py`, called from
`slot()` right after the existing `split_unruled_columns()` (same file,
same "the evidence for a missing rule is in the text, not the ruling, so
this lives here and not in vectorgrid" principle, same author) — the
orthogonal case: that function widens one cell into several sharing its
own column band; this one narrows a single TALL cell into a title piece
and a header piece. Three safety constraints mirror that function's own
three exactly, so this can only recover a real header, never invent one:
(1) only the table's own topmost row, and only when it is a single
undivided face; (2) that face's height must be a clear outlier against
the median of every OTHER row in the same table (>= 2.2x — a genuinely
tiny 2-row table with one short real header tier is never touched); (3)
the candidate header band's own words must land ONE PER COLUMN on the
x-boundaries every OTHER row already establishes, covering at least half
of them, with no edge cutting a word — `place_loose_text`'s own rule,
for the same reason.

**Verified**, both against the real PDFs via `sidecar/vectorgrid_rpc.py`'s
`extract_grid()` directly:
- `08_ME_BGS_Augusta_EastCampus_Renovation.pdf#16`'s WINDOW SCHEDULE: title
  correctly isolated ("WINDOW SCHEDULE"), the real 8-column header
  (KEY/TYPE/BRICKMOLD TYPE/DIVIDED LIGHT TYPE/OPNG WIDTH +/-/OPNG HEIGHT
  +/-/COUNT/NOTES) now lands as its own row split one-per-column, and all
  14 real data rows (A-N, previously A was consumed as the fake header)
  now appear correctly. Row O (previously entirely missing) now appears
  too, though fused with the page's footer notes block below the table —
  a real, different, secondary issue, not touched here, but strictly
  better than total absence.
- `28_WA_KCHA_PublicHousing_HVAC.pdf#2`'s AIR TERMINAL SCHEDULE: title
  correctly isolated, and all 3 real data rows (`SG`, `RG`, `WTG` —
  previously `SG` was consumed as the fake header) now appear correctly.
  The header text itself stays merged across both columns here (a
  conservative decline: the print doesn't leave a gap aligned with the
  column boundary), which is the safety design working as intended rather
  than forcing an uncertain split.

No regression: `cellscore.py` still 917/917 cells, 102/102 rows;
`boxscore.py` still 163/164 (the one open scorer artifact, unrelated —
see B-40); `boxfit.py --backend vectorgrid` still 219/222, 0
SPLIT/OVERRUN/SHORT/MERGED, identical before and after.

---

### B-19 — two real schedule tables vanish entirely from the same document while unrelated floor-plan callout text nearby gets fused into a fabricated one-row table (PARTIAL FIX 2026-09-14 — the page-23 real-table disappearance closes; the page-25 disappearance and the callout fabrication remain open)

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

**ROOT CAUSE OF THE PAGE-23 DISAPPEARANCE CONFIRMED 2026-09-13 (code-level,
precise — not fixed).** The `"7 A 6 604 8 EVS 5"` fabrication and the real
`PROJEJCT FINISH SCHEDULE`'s own disappearance are TWO SEPARATE, unrelated
findings on the same page, not one bug — traced live
(`OPENTAKEOFF_GRAPH_TRACE=1`, then `bakeoff/vectorgrid.py find_tables()` and
`vectorgrid_rpc.extract_grid()` called directly on the sliced page, then a
render crop at the exact traced coordinates):

- The real table (12 rows, room numbers `111`-`158`, matching this entry's
  own hand-count exactly) genuinely IS found by vectorgrid as one clean,
  correctly-shaped 15x10 face — but refused with `"no header block above
  the data"`, one of the trace's own 4 declined regions on this page.
  Dumping this exact candidate's own cells (`vectorgrid_rpc.extract_grid`)
  shows why: its own rows 0-1 are BLANK, and row 2 is already real data
  (`"111", "STORAGE", "EXIST QT", ...`) — the header row (`ROOM`/`FLOOR`/
  `WALL BASE`/`WALL MATL`/`WALL FINISH`/`CEILING MATL`/`CEILING FINISH`/
  `CEILING HEIGHT`/`NOTES`) is not inside this candidate's own detected
  face AT ALL. Confirmed by direct coordinate comparison: the header
  words sit at y≈1233-1248, while the candidate's own bbox starts at
  y=1262.46 — the header text sits entirely ABOVE (outside) the ruled data
  grid's own top edge, in blank, unruled space between it and the table's
  own caption further up the page. Confirmed this is a REAL header, not
  page furniture: every header word's own x-position lands squarely
  inside its corresponding data column's own x-boundary (`ROOM` at
  x0=828.8 inside data col1's `[754.75,921.38]`; `NOTES` at x0=1604 inside
  data col9's `[1497.49,1733.59]`; all 9 columns check out this cleanly),
  exactly the evidence `celltext.py`'s own `split_unruled_header_row`
  requires for the sibling shape it already fixes (B-18, same document,
  its own `WINDOW SCHEDULE`).

  **This is NOT the B-18 shape, despite being the same document and the
  same general family.** `split_unruled_header_row`'s own doc is explicit
  about its own scope: it recovers a header GLUED INTO the same single
  face as the table's own title (a combined title+header blob that needs
  splitting apart) — three safety constraints all keyed on that one
  topmost face existing and being an outlier in height. This table's own
  candidate has NO such face: its topmost rows are blank, and the header
  text was never captured as a face/cell by vectorgrid's own polygon
  arrangement at all (most plausibly because the header row itself has no
  rules of its own — typed directly above the ruled data grid with
  nothing enclosing it, a different real drafting convention than B-18's
  "one big box holds both" shape). A real fix needs a genuinely new
  capability neither `split_unruled_header_row` (splits an existing over-
  large face) nor B-42's fragment-merge (stacks two REFUSED/adjacent
  vectorgrid FACES together) can do: for a candidate refused this way
  whose own topmost row(s) are blank, search the page's own text spans in
  the gap ABOVE the candidate's own bbox for words that land one-per-
  column on the x-boundaries the ruled data body already establishes
  (exactly `split_unruled_header_row`'s own alignment test, applied to
  text with no face at all rather than a face that needs splitting), and
  synthesize a header row from them when enough columns clear the bar.
  Not designed or attempted here — a new function, not a tweak to an
  existing one, and (per this file's own standing rule) needs its own
  corpus-wide false-positive check before shipping, the same discipline
  B-27's own measured-and-rejected regex widening just demonstrated the
  value of.

  The `"7 A 6 604 8 EVS 5"` fabrication remains a SEPARATE, still-untraced
  finding — its own region ([1571.77,714.78]-[1755.96,892.41] raw pt) sits
  nowhere near the real finish schedule's own location
  ([699.75,1262.46]-[1733.59,1562.62]), confirming these are two
  independent defects on the same page, not one mechanism wearing two
  faces.

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

**FIX 2026-09-14 — the page-23 real-table disappearance, implemented per
this entry's own proposed design.** This entry's own root-cause trace
already named the exact missing capability: "for a candidate refused
this way whose own topmost row(s) are blank, search the page's own text
spans in the gap ABOVE the candidate's own bbox for words that land
one-per-column on the x-boundaries the ruled data body already
establishes... and synthesize a header row from them when enough columns
clear the bar." Re-verified live before implementing (`qpdf`-sliced page
23, `OPENTAKEOFF_GRAPH_TRACE=1`, then temporary row-by-row debug
instrumentation in `scheduleTableFromODL`, reverted before commit): the
refusal trace is precise but one detail differs from the original
description — rows 0-1 are not "no cells at all," they are real ODL
cells (one per column, matching this candidate's own `maxCovered`
calibration) whose text is genuinely blank, which the existing
"`!ownCells.size` → blank spacer row" check does not catch (it tests cell
COUNT, not cell TEXT) — so row 0 is read as the header CANDIDATE, fails
the vocabulary bar on its own empty text (`texts.length === 0`), and the
one-shot design locks and breaks with `headerEnd` never advanced past
`bodyStart`. The real column names sit ~15-61pt (measured) above the
ruled grid's own top edge, typed loose with no rules of their own —
structurally unreachable from inside the grid at all, exactly as this
entry's own trace concluded.

Implemented as a new `scheduleTableFromODL` rescue,
`synthesizeUnruledHeaderAbove`, that runs only when the function is about
to refuse with "no header block above the data." Mirrors
`sidecar/celltext.py`'s own `split_unruled_header_row` safety
constraints exactly (same family — a real header with no rules of its
own — applied here to a header with no face/cell of its own at all,
rather than one glued onto the title inside a single over-tall face): a
text span counts for a column only when it sits ENTIRELY inside that
column's own established x-range (derived from the table's own DATA
cells, which carry real bounding boxes even on a row whose text is
blank), never straddling a boundary — the same "no edge cutting a word"
rule that automatically excludes a real wide caption or title span from
ever counting toward any one column, with no special-case detection
needed for that shape — and at least half the columns must get a match.
A further, independent bar this celltext.py analog does not need (it
already trusts vectorgrid's own face split): the synthesized labels must
ALSO clear the exact same 0.4 header-vocabulary bar every other
candidate in this function is held to — column-aligned coincidence alone
is not enough when there is no in-grid tier left to corroborate it
structurally.

**A real regression was found and closed before shipping, not after.**
The first version of this rescue (gated only by the vocabulary bar and a
120pt search window) was checked against this session's own standing
regression set before commit, per this file's own standing rule — and
failed it: on `023_US_Chiller_Replacement_at_U_S_Salinity_Laboratory.pdf
#8`, it "recovered" a header for a TRUNCATED, blank-titled duplicate
candidate of the already-correct `AIR COOLED CHILLER SCHEDULE` (the same
vectorgrid overlapping-candidate ambiguity B-38's own entry documents) by
reaching UP into real header text that structurally belongs to a
DIFFERENT, taller, correct sibling candidate for the SAME physical
table — replacing that sibling's real 4-tier compound header
("EVAPORATOR LWT °F", "ELECTRICAL COMPRESSOR MOTOR # COMP", …) with this
truncated candidate's own single-tier leaf labels ("°F", "# COMP", …)
and creating a second, worse copy of a table that already worked. Traced
precisely (same debug-instrument-then-revert method): the false-positive
candidate has `bodyStart === 1` (a blank, structurally-title-shaped row 0
— exactly the shape this file's own B-38 fix already treats as
suspicious) while the real B-19 case has `bodyStart === 0` (no
title-shaped row-0 cell at all — genuinely nothing else this table's own
structure could be a fragment of). Measured GAP distance alone could not
reliably separate the two (61pt real vs. 79-114pt false-positive — too
close a margin to trust on unseen documents), so the fix instead gates
on this structural signal (`bodyStart === 0`), which cleanly separates
every case measured. Gated behind a new `unruledHeaderAbove?: boolean`
option (false/undefined preserves every existing caller exactly);
enabled ONLY at `vectorGridAdapter.ts`'s own call site, matching this
bug's own found scope (an ODL table sourced through vectorgrid).

**Verified live:** `08_ME_BGS_Augusta_EastCampus_Renovation.pdf#23` goes
from 1 table (the fabricated `"7 A 6 604 8 EVS 5"`, unchanged, see below)
to 2 — the real `PROJEJCT FINISH SCHEDULE` (the document's own real
drafting typo, "PROJEJCT," preserved verbatim) now extracts all 12 real
rows (`111`/`116`/`121`/`124`/`140`/`148`/`149`/`150`/`155`/`156`/`157`/
`158`), every cell value matching this entry's own original hand-count
exactly, correctly classified `room-finish`. Headers recover most but
not all of each real column name (`ROOM`/`FLOOR`/`BASE`/`WALL`/`WALL
2`/`CEILING`/`CEILING 2`/`CEILING 3`/`NOTES` against the true `ROOM`/
`FLOOR`/`WALL BASE`/`WALL MATL`/`WALL FINISH`/`CEILING MATL`/`CEILING
FINISH`/`CEILING HEIGHT`/`NOTES` — a second word of a few two-word
labels did not land inside its own column's strict x-range and was
dropped, and the file's own duplicate-header disambiguation then
numbered the resulting collisions) — a real, disclosed imperfection, not
a blocking one: every real row is now present, correctly keyed, with
correct cell values, which is the property this entry's own "consequence
for the zero-error bar" section named as completely absent before this
fix. Full regression: `tsc --noEmit` clean, 165/165 `sheetgraph.test.ts`
+ `vectorGridAdapter.test.ts` pass. Re-checked structurally (deep-equal
minus timing fields) against every document already verified for B-38's
own regression set (`21_VA...#50`, `#51`, `013_MO...#23`, `098_ID...#8`,
`023_US...#8`, `093_ME...`, `28_WA...`) after the `bodyStart === 0` guard
was added — zero content regression on all 7, including the specific
`023_US...#8` false positive found and fixed above.

**What remains open:** the page-23 `"7 A 6 604 8 EVS 5"` fabrication
(plan-callout text fused into a fake table) is untouched by this fix —
still reproduces exactly as originally described, a separate mechanism
from the real-table miss this fix closes. Page 25's `DOOR AND FRAME
SCHEDULE` disappearance is also untouched and still not traced (0 tables
reported for that page, unchanged). Neither was attempted this pass.

---

### B-20 — a real row is captured twice, byte-for-byte identical, inflating a table's own row count with a phantom duplicate (FIXED 2026-09-13)

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
other rows from the same table that were each captured exactly once.

**Consequence for the Demo Corpus's own zero-error bar:** a phantom row
that is not a fabrication of new content (unlike B-16/B-19) but an exact
duplicate of real content still fails an exact row-count match — this
table cannot pass cell-grading as extracted despite every cell value
being individually correct.

**FIX (2026-09-13):** root-caused live, traced across the Python/TS
boundary rather than guessed at. A real PDF drafting convention on this
row — a doubled-stroke header/data divider, two full-width ruled lines
2.46pt apart — creates a geometrically-real but textually-empty "sliver"
row that survives `vectorgrid.py`'s own `MIN_CELL_SIDE = 2.0pt` filter
(2.46 > 2.0) and is deliberately preserved by `vectorgrid_rpc.py`'s
policy that a genuinely empty drawn cell is still part of the grid.
Independently, a real internal hairline rule under only this row's
ELECTRICAL DATA sub-columns (VOLTS/PHASE/MCA/MOCP) — not spanning the
table's full width — splits those columns into two stacked sub-faces,
each carrying duplicate text. That split's new y-coordinate becomes a
spurious extra row-grid line via `vectorgrid_rpc.py`'s `_axis()`, so
`_span()` computes `rowSpan=2` for every OTHER column's cell in that row
(e.g. the TAG NO. cell, `"HP-1"`). ODL's own grid placement then places
that `rowSpan=2` cell into BOTH the real row and the phantom sliver row,
while the sub-divided columns independently duplicate their own value
across both faces — producing a second row whose every cell exactly
matches the row above it. This passes `buildRows`'s blank-spacer check
(not blank — several cells carry inherited/duplicated text) and its key
derivation (the inherited `"HP-1"` text resolves normally), and no
duplicate-key guard existed on the `printedKeys=false` path, so it was
pushed as a second, fully duplicate row.

The real fix belongs in `vectorgrid_rpc.py`'s own row-axis construction
(a candidate row-grid line should be trusted only when corroborated
across the table's full width, not just some columns) and is left there
for a follow-up — not attempted here under time pressure. Instead, added
a narrowly-scoped guard immediately before `buildRows`'s own
`rows.push(...)` in `web/src/lib/sheetgraph.ts`: a row whose key AND
every cell value exactly match an already-emitted row is refused as a
manufactured duplicate rather than a second real row — the same
principle the `printedKeys=true` path already applies for its own
duplicate-key case, safe here because two genuinely distinct rows never
coincidentally share both the same key and every cell value.

**Verified:** live re-run of `production-graph-cli.mjs --mode graph`
against the real `083_MA` PDF now reports exactly 3 rows for the COMMON
AREA - AIR COOLED HEAT PUMP SCHEDULE (`HP-1`, `HP-2`, `HP-3`), `HP-1`'s
own cell content fully intact and correct. No regression: `cellscore.py`
still reports 917/917 cells, 102/102 rows whole, identical to before the
change; `boxscore.py`'s pre-existing 27-box scale-mismatch (137/164) was
confirmed unrelated via `git stash` isolation — identical result with
and without this change.

---

### B-21 — an entire recurring table FORMAT (multi-panel electrical schedules) is invisible to extraction: at least 12 real tables across 2 sheets, 0 found (CORRECTED + FIXED 2026-09-13)

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

**CONFIRMED RECURRING 2026-09-13 — a 4th document, and the miss is wider
than "panel schedules" specifically.** `012_MO_M2430_01_Chiller_Upgrade_
Center_for_Behavioral.pdf#27` ("ELECTRICAL SCHEDULES", sheet E601) has
both `PANELBOARD SCHEDULE: P1E (EXISTING)` (15 real rows) and `PANELBOARD
SCHEDULE: HTP (EXISTING)` (9 real rows) missing entirely from the pipeline
output, same as B-21's original finding — but the SAME page also loses
`DISCONNECT SWITCH SCHEDULE` (6 real rows, a plain single-tier ruled
table, not a boxed multi-panel layout at all). So the failure is not
narrowly about the "THREE PHASE PANEL SCHEDULE" box shape specifically —
something about this general class of dense electrical-schedule sheet is
losing tables wholesale. (This document's own `VFD SCHEDULE` on the same
page shows a related but DIFFERENT failure — 6 real rows fused into one
with concatenated cell values — catalogued separately as B-22, since the
row-fusion signature there is distinct enough to trace independently.)

**CORRECTION (2026-09-13): the original 25_WA finding above was a
misdiagnosis — this bug's real, surviving instance is the 012_MO
document only.** Direct measurement: both `25_WA_DouglasCounty_
Courthouse_HVAC_DDC.pdf#8` and `#9`'s six panel-schedule regions are
each backed by a real, high-resolution embedded PyMuPDF image
(`page.get_images()`/`get_image_rects()`, ~5.6 px/pt each), and the
PDF's own text layer carries only 89 total words on EACH page, none
of them anywhere near those regions (`page.get_text('words')`,
checked both pages independently). `vectorgrid.py`'s own `find_tables()`
correctly finds all 12 regions and correctly marks every one
`raster=True, cells=[]` — its `_image_is_a_table()` pixel test doing
exactly its job. A rendered crop looks crisp and fully-ruled at normal
zoom only because the embedded image itself is high-DPI — visually
indistinguishable from real vector linework, which is exactly how this
was originally misjudged as "real, titled, fully ruled" tables without
checking the underlying PDF structure. Per the goal document's own
Scope rule ("Rasters and pasted images... detected and reported
EXCLUDED, never counted as misses"), this is correct, disclosed
behavior, not a bug — closing out the original 2-sheet, 12-table claim
this entry opened with.

**FIX (2026-09-13), for the one real surviving instance (012_MO, 4th
document above):** root-caused live via `classifySheetRole()` called
directly against the page's own real spans (`OPENTAKEOFF_GRAPH_TRACE=1`
against a busted cache — `cachedSheetGraph` was serving a stale result
and swallowing every trace line until `~/.cache/opentakeoff-sheet-graph`
was cleared, same gotcha as B-18's own trace). `012_MO...#27`'s own
sheet (E601) has 872 real text spans and **zero** vector-geometry
segments extracted — `session.ts` gates that extraction on
`classifySheetRole()` returning a role in
`{plan, schedule, demolition, unknown}`, and this sheet resolved to
role **"detail"** at 0.6 confidence (halved to 0.3 by dissent, but
never overturned), off one stray span: `"VARIES (SEE CODE SECTION)"`
— ordinary electrical-schedule vocabulary for a regulatory code
section, found inside a real panel-schedule column, not the sheet's
own title. It matched `sheetgraph.ts`'s own bare, unanchored
`SECTIONS?\b` half of the "detail" role signal (0.6) — HIGHER than
the sheet's own 5 real `"...SCHEDULE..."` spans, each of which
individually classifies role "schedule" at 0.5 in isolation. So
`segs` was never extracted, and `vectorgrid` never got a chance to
run on 5 real, fully-ruled vector tables sitting right there on this
sheet (confirmed via `vectorgrid.py`'s own `find_tables()` directly:
173/322/4/82/255 real geometric cells across those 5 regions).

Fixed with a narrow, additive negative lookbehind in `sheetgraph.ts`'s
`ROLE_SIGNALS`, excluding only `"CODE SECTION"` — matching that same
file's own existing `"ELEVATION NUMBER"` exclusion pattern two lines
above it. Verified: `"WALL SECTIONS"`, `"BUILDING SECTION A-A"`,
`"CROSS SECTION"`, `"DETAILS"`, `"MECHANICAL DETAILS"` all still
match correctly — this never loosens a real section/detail-sheet
title match anywhere else in the corpus, only excludes this one
measured phrase shape.

**Verified against the real PDF**, `production-graph-cli.mjs --mode
graph`: page 27 now surfaces 4 tables where it previously surfaced 0 —
`"DISCONNECT SWITCH SCHEDULE:"` (11 headers, 6 rows — matching the
real table exactly) and `"VFD SCHEDULE:"` (10 headers, 16 rows, every
cell byte-for-byte correct — see B-22's own updated entry) both now
correctly titled and complete. Two more tables (19 headers, 30 rows
and 24 rows respectively — the two PANELBOARD SCHEDULEs) also now
surface with real content, though still `title: null` — a separate,
already-catalogued title-attachment defect family (same class as
B-17), not touched here.

**No regression:** a full-corpus `table-box-eval.mjs` re-run (the
app's own emitted regions, not just the raw Python engine) shows an
identical 646/664 (97.3%) with the identical failure list before and
after this change — this fix's own document (012_MO) isn't in that
eval's currently-scoreable keyed set (a separate, pre-existing
`resolveSetFiles` lookup gap for several split/rejoined documents,
unrelated to this change), so its recovery was verified directly
against the real PDF above instead.

---

### B-22 — multiple real rows are fused into a single row, with each cell's text a space-joined concatenation of every fused row's own value (FIXED 2026-09-13)

**Where:** `012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral.pdf#27`,
"VFD SCHEDULE:" — found in the same pass as B-21's 4th-document
confirmation, same page, same document.

**Measured, hand-graded against the render first:** the real table has 16
rows (`VFD-CWP-1/2/3`, `VFD-PCHP-1/2/3`, `VFD-SCHP-1/2`, `VFD-PHWP-1/2/3`,
`VFD-SHWP-1/2`, `VFD-CT-1/2/3 (EXIST.)`), 10 real columns (`TAG NO,
MANUFACTURER, MODEL, SERVES, HP, VOLTS, PHASE, HZ, DRIVE ENCLOSURE,
NOTES`). `production-graph-cli.mjs`'s output for this table has only 4
columns (`TAG, MANUFACTURER, MODEL, NOTES` — `SERVES`, `HP`, `VOLTS`,
`PHASE`, `HZ`, `DRIVE ENCLOSURE` all gone) and exactly ONE row, keyed
`VFD-PHWP-3`, whose own `TAG` cell reads `"VFD-SCHP-2 VFD-PHWP-1 VFD-PHWP-
2 VFD-PHWP-3 VFD-SHWP-1 VFD-SHWP-2"` — SIX real tag values, space-joined
into one string — and whose `MANUFACTURER`/`MODEL`/`NOTES` cells are each
the same 6-way concatenation of that column's own real per-row values
(`"SCHNEIDER SCHNEIDER SCHNEIDER SCHNEIDER SCHNEIDER SCHNEIDER"`, `"SFD212
SFD212 SFD212 SFD212 SFD212 SFD212"`, `"1-5 1-5 1-5 1-5 1-5 1-5"`). The
other 10 real rows (`VFD-CWP-1/2/3`, `VFD-PCHP-1/2/3`, `VFD-SCHP-1`,
`VFD-CT-1/2/3`) are not present in any form — not fused, not fabricated,
simply gone.

**FIX (2026-09-13):** fixed as a direct side effect of B-21's own fix
below (same root cause: this sheet's role misclassified as "detail",
so vectorgrid never ran on it at all, and whatever the OLD garbled
single-row output came from was a different, downstream fallback path
that no longer runs once vectorgrid gets a real chance). Verified
against the real PDF: `production-graph-cli.mjs --mode graph` now
reports "VFD SCHEDULE:" with the real 10 columns (`TAG NO,
MANUFACTURER, MODEL, LOAD SERVES, LOAD HP, LOAD VOLTS, LOAD PHASE,
LOAD HZ, DRIVE ENCLOSURE, NOTES`) and 16 real rows, every cell
byte-for-byte correct against the real page — `VFD-CWP-1`: SCHNEIDER,
SFD212, CWP-1, 30, 480, 3, 60, NEMA 1, 1-5; `VFD-CWP-2`/`VFD-CWP-3`
identical shape with their own real values; no concatenation anywhere.
See B-21's own entry for the fix itself and its regression evidence.

**Relationship to already-catalogued bugs:** distinct from B-20 (one row
duplicated verbatim) and from B-18 (header/first-row collapse) — here SIX
different real rows' cell text is concatenated together into ONE row
object, with real column data lost outright (4 of 10 columns). Not traced
into the row-clustering or cell-joining code to find why these 6 rows'
y-bands merged into one cluster while the other 10 rows vanished
separately, per this file's standing rule against guessing at a fix under
time pressure.

**Consequence for the Demo Corpus's own zero-error bar:** MISSED != 0 (10
of 16 rows entirely absent) and the one surviving row is itself not a real
row — its every cell is corrupted concatenated text that matches no real
table cell. This table cannot pass either box- or cell-grading.

---

### B-23 — a dense schedule page extracts 14 of 14 simple tables perfectly, but every ROW-SPANNING/merged-cell or comparison-style table on the exact same page is entirely missing (CORRECTED 2026-09-13)

**Where:** `067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid.pdf#8`
("MECHANICAL SCHEDULES", sheet M7.0) — found during the same Demo Corpus
hand-verification pass, next document after 028_TX.

**Measured, hand-graded against the render first:** this single page
carries at least 18 real, titled, ruled tables. Fourteen of them —
`(N) PUMP SCHEDULE` (2 rows), `PRESSURE TESTING REQUIREMENTS` (4),
`PIPE INSTALLATION SCHEDULE` (6), `DUCT INSTALLATION SCHEDULE` (2),
`(N) HEAT EXCHANGER SCHEDULE` (1), `GRILLE SCHEDULE` (1), `REHEAT COIL
SCHEDULES (RELOCATED)` (1), `(N) VFD SCHEDULE` (2), `(N) COMPRESSED AIR
REGULATOR` (1), `AIR HANDLING UNIT SCHEDULE (EXISTING)` (1), `PCW AIR
SEPARATOR SCHEDULE` (1), `PCW POT FEEDER SCHEDULE` (1), `PCW EXPANSION
TANK SCHEDULE` (1), `PCW FILTER SCHEDULE` (1) — extract with EXACTLY
matching row counts, no exceptions. But four more real tables on the
SAME page, all sharing one structural feature the other 14 lack, are
completely absent from the output, not fabricated into anything else
findable:
- `HUTCH 1.3 PCW RISER UTILITY SCHEDULE` (28 real rows) — its own
  `SERIES`/`POC BRANCH`/`BRANCH SUM` columns use ROW-SPANNING MERGED
  CELLS (one `BRANCH SUM` value like `30.15` or `19.16` drawn once,
  visually spanning the ~9-11 rows of its own `LOOP 1`/`LOOP 2`/`LOOP 3`
  group).
- Three `NEH`/`FEE,EBD,UH`/`X-Ray Tunnel (XRT)` "PCW flow demand" tables
  (10, 4, and 1 real rows) — each a comparison-style table with paired
  `EXISTING`/`NEW` column groups and its own `Total` summary row, a
  different shape from the plain one-row-per-tag equipment schedules
  that extracted perfectly elsewhere on this page.

**Relationship to already-catalogued bugs:** distinct from B-21 (an
entire recurring table FORMAT invisible regardless of internal structure)
because here 14 tables on the identical page and sheet extract with zero
defects — this is not a page-level or sheet-level failure, it is
specific to tables using row-spanning merged cells or an EXISTING/NEW
comparison-column shape. Not traced into the row/column-clustering code
to confirm this hypothesis (merged cells specifically, as opposed to
some other property these 4 tables share) is the actual cause, per this
file's standing rule against guessing at a fix under time pressure.

**Consequence for the Demo Corpus's own zero-error bar:** MISSED != 0 —
43 real rows across 4 real tables entirely absent, on a page whose other
14 tables (37 rows) are graded perfectly. A per-page or per-document
"pass/fail" grade would badly overstate how well this specific shape of
table is handled.

**CORRECTION (2026-09-13): this is a misdiagnosis, the same shape as
B-21's own original 25_WA claim.** All 4 "missing" tables, including
the one this entry describes as having real row-spanning merged
`BRANCH SUM` cells, are genuine pasted raster images, not real vector
tables with an unusual structure vectorgrid failed to parse. Direct
measurement: the `HUTCH 1.3 PCW RISER UTILITY SCHEDULE` region and the
combined `NEH`/`FEE,EBD,UH`/`X-Ray Tunnel (XRT)` "PCW flow demand"
region each correspond EXACTLY to a real embedded PyMuPDF image
placement rect (`page.get_images()`/`get_image_rects()`), and the
page's own text layer carries 2293 total words, **zero** of them
anywhere near either region (`page.get_text('words')`, checked
directly). `vectorgrid.py`'s own `find_tables()` already correctly
finds and marks both `raster=True, cells=[]` — its pixel-based
`_image_is_a_table()` test doing exactly its job, same as B-21's
25_WA correction. A rendered crop looks crisp and fully-ruled at
normal zoom only because the pasted screenshot is itself high-DPI,
which is exactly how this was originally misjudged without checking
the underlying PDF structure. Per the goal document's own Scope rule,
this is correct, disclosed-eligible behavior, not a bug — closing out
this entry's own 4-table claim. See B-24's own entry below: the one
REAL gap this correction surfaced (the disclosure itself wasn't
reaching real output) is now fixed.

---

### B-24 — a raster table's own placement is not reported at all, not even as a disclosed exclusion (FIXED 2026-09-13)

**Where:** `067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid.pdf#8`,
"PCW RISER DIAGRAM SCHEDULE - HUTCH 1.3" — found running
`table-box-eval.mjs` against this document's own pre-existing
hand-authored `keys/067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid.
tableboxes.csv` (authored in an earlier, separate ground-truth effort,
not for this Demo Corpus pass), while checking real box-tier evidence
against the goal's own EoB≤4pt bar for this session's grading pass.

**Measured:** the authored ground truth records this table as a RASTER
(a 645×659 embedded image) whose truth box is the image's own placement
rectangle — the same convention used for `017_MD#14`'s raster table. All
14 of this document's other authored tables on the same page score
essentially perfect boxes (mean EoB 0.0pt) against `production-graph-
cli.mjs`'s output. This 15th one does not appear in that output AT ALL —
not as a found table, not as a disclosed-and-excluded raster, nothing.
`table-box-eval.mjs` reports it `MISSING`.

**Relationship to already-catalogued bugs and to the goal's own rule:**
distinct from every other entry above because this is not a vector-table
extraction failure — it's a gap in the goal's own explicit requirement
that "Rasters/pasted images on these documents are still correctly
EXCLUDED, not silently zeroed — that disclosure has to hold up live too"
(`goals/VECTORGRID_TABLE_BOXES.md`, "The Demo Corpus" section). Silently
returning nothing is indistinguishable, from the output alone, between
"correctly recognized as an out-of-scope raster" and "never looked at
this part of the page." Not traced into the raster-detection/disclosure
code to find which of those two it actually is, per this file's standing
rule against guessing at a fix under time pressure.

**Consequence for the Demo Corpus's own zero-error bar:** if this
represents an undisclosed miss rather than a correct-but-silent
exclusion, it is a second real defect on this page (alongside B-23's
merged-cell tables) that a per-table-found accounting would hide inside
an otherwise 14/14 clean result.

**FIX (2026-09-13):** root-caused to which of the two possibilities —
confirmed correct-but-silent exclusion, the same as B-21's/B-23's own
corrections above (this exact region, and 2 others on the same
document, are genuine pasted raster images: real embedded PyMuPDF
placement rects, 0 PDF text words anywhere near any of them out of
2293 total on the page). `vectorgrid.py`'s own `find_tables()` already
finds and correctly marks all of them `raster=True`; the gap was
purely downstream, in `runVectorTakeoffPipeline`'s own `report.notes`
array being write-only — every note pushed onto it (this raster
disclosure, and the pre-existing "L2 vectorgrid did not run" case)
only ever reached the `OPENTAKEOFF_GRAPH_TRACE` debug dump in
`session.ts`, never the real `graph.notes` an ordinary run — and the
live app — actually reads.

Fixed in two files: `vectorTakeoffPipeline.ts`'s
`runL2VectorGridForSheet` now pushes a per-sheet note whenever that
sheet's own raster count is nonzero; `session.ts`'s
`runVectorTakeoffStack` now copies `report.notes` into `graph.notes`
once, right after computing the report, before the
`OPENTAKEOFF_GRAPH_TRACE`-gated debug dump. Purely additive (never
removes or modifies a table), so this also naturally fixes the
disclosure gap for the pre-existing "L2 vectorgrid did not run" case
as a side effect of the same wiring fix.

**Verified** against the real PDF: `067_CA_SLAC_LCLS_II_HE_Process_
Cooling_Water_Skid.pdf#8` now emits `"2 raster table region(s) found
and correctly excluded (pasted image, no ruled vector content to
read) — not an extraction miss."` in the real `graph.notes` output,
and sheet `#10` emits the same for its own 1 raster region. 18/18
relevant unit tests pass (`test/vectorTakeoffPipeline.test.ts`,
including an existing test that already asserted a refused engine's
notes must reach `g.notes`). A full re-run of `012_MO_M2430_01` (a
large 29-sheet document, no raster regions of its own) shows an
identical 12 tables before and after this change, no crash.

---

### B-25 — a whole schedule sheet, correctly role-classified, yields ZERO tables: an entire transposed-format page (units as columns, not rows) is completely unreachable (CORRECTED 2026-09-13)

**Where:** `037_AR_VA_Project_598_19_118_Replace_21_Air_Handling.pdf#40`
("MECHANICAL SCHEDULES", sheet MJ110) — found during the same Demo Corpus
hand-verification pass, next document after 015_VA. This is the single
worst result measured in this entire pass, by a wide margin.

**Measured, hand-graded against the render first:** this page carries at
least 6 real table blocks — two `RETURN FANS` tables (12 and 7 real fan
units respectively, 19 total), `VARIABLE FREQUENCY DRIVES` (39 rows),
`AIR COOLED WATER CHILLERS` (1 row), `SINGLE DUCT SUPPLY AIR TERMINALS`
(6 rows), `AIR DEVICES` (2 rows) — roughly 67 real data rows in total.
Every one of these tables is drawn TRANSPOSED relative to every other
schedule measured in this pass: each column is one real equipment unit
(`RF-1`, `RF-1A`, `RF-1B`, …), and each row is a spec label (`AREA
SERVED`, `BASIS OF DESIGN`, `AIRFLOW (CFM)`, …) whose value is read
ACROSS the row, not down a column. `production-graph-cli.mjs`'s full
output for this entire 60-sheet document contains only 5 tables total,
NONE of them from page 40 — its own `schedules: []` sheet-graph entry is
empty. This is not a false-negative role classification: the sheet-graph
record for `#40` is correctly tagged `role: "schedule"` (confidence 0.5,
evidence `"MECHANICAL SCHEDULES"`) — the page is correctly recognized as
a schedule sheet, and the table-extraction step running on it still finds
nothing at all. The other 5 tables that DO exist in this document (pages
31, 54-57) are all small reference-kind fragments unrelated to this
page's own content — no fabrication, no partial credit, simply absent.

**Relationship to already-catalogued work:** task #64 ("Fix vectorgrid/
ODL over-merge that corrupted 25_WA's stacked schedules") was closed
under the description "was mis-diagnosed as 'transposed matrix'" —
meaning a PRIOR transposed-table complaint on a different document turned
out to have a different root cause. This document's own table shape is
genuinely, visibly transposed (spec labels down the left column, one real
equipment unit per column to the right), and gets a completely different,
much worse outcome (zero tables, not a corruption) than every row-per-
unit schedule measured elsewhere in this pass. Whether the table-region
detector's column/row clustering logic has any handling at all for this
orientation was not traced into the code, per this file's standing rule
against guessing at a fix under time pressure — but the sheer completeness
of the miss (not one of ~67 rows survives in any form) suggests the
detector may simply never consider this orientation as a candidate table
shape at all.

**Consequence for the Demo Corpus's own zero-error bar:** MISSED != 0 at
the most extreme end measured in this pass — an entire correctly-
identified schedule sheet's real content (67 rows across 6 tables) is
100% absent from the pipeline's output, with no partial recovery and no
disclosed reason. If transposed schedules are common elsewhere in the
corpus (return-fan and AHU schedules with many units are a routine HVAC
drafting convention), this could be a systemic recall gap much larger
than any single document.

**CORRECTION (2026-09-13): a third instance of the same misdiagnosis
as B-21's and B-23's own corrections above.** All 6 "transposed real
vector tables" this entry describes are genuine pasted raster images,
not real vector-drawn content vectorgrid failed to read because of its
transposed orientation. Direct measurement: every one of
`vectorgrid.py`'s own 6 candidate regions on page 40 exactly matches a
real embedded PyMuPDF image placement rect, and the whole page carries
only 253 PDF text words total — nowhere near enough for the ~67 real
table rows this entry describes, and consistent with a page that is
almost entirely pasted screenshots plus a title block. `vectorgrid.py`
already correctly marks all 6 `raster=True`; after B-24's own fix
(wiring the pipeline's raster-disclosure notes into the real
`graph.notes` output), a live re-run now emits `"037_AR...#40: 6
raster table region(s) found and correctly excluded... — not an
extraction miss"` — plus the same disclosure for two more pages (`#41`,
`#42`) that this entry never covered, each with their own 1 raster
region. The "transposed" shape claim may well be visually accurate (a
screenshot OF a transposed spreadsheet), but the underlying PDF
representation is 100% raster, so this was never a real vector-table
extraction failure. Per the goal document's own Scope rule, this is
correct, disclosed behavior — closing out this entry's own 67-row
claim, and its own "could be a systemic recall gap" concern above.

Whether transposed schedules exist elsewhere in the corpus as GENUINE
vector content vectorgrid still cannot read is a real, separate, and
still-open question this correction does not answer — it answers only
this specific document's own claim.

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

### B-26 — a real, wide, room-keyed table (not equipment-mark-keyed) is completely dropped, and a sibling table over-counts a title-block notes line as a data row (RE-VERIFIED 2026-09-14 — the real miss (VENTILATION INDEX) is FIXED, confirmed live; the phantom-row half is fixed on the ORIGINAL document only — 3 other recurring instances still overcount, unchanged)

**Where:** `01_NY_VA_Northport_Dialysis_100CD.pdf#88` (sheet M701, "MECHANICAL
SCHEDULES") — the sole dense mechanical-schedule sheet in this 162-sheet
document, found during the same Demo Corpus hand-verification pass as
B-16 through B-25, this document picked next in ascending census-count
order.

**Measured:** page 88 carries 11 real, titled, ruled tables, hand-
transcribed before viewing extractor output: AIR HANDLING UNIT (2 rows),
AIR INLETS & OUTLETS (11), PUMPS (1), STEAM HUMIDIFIERS (1), FANS (1),
SOUND ATTENUATORS (1), **VENTILATION INDEX (37 rows)**, SINGLE DUCT AIR
TERMINAL UNITS (25), EX FAN REBALANCE SCHEDULE (1), END-OF-MAIN STEAM
LINE DRIP TRAP (1), EQUIPMENT STEAM TRAP (1 row: `ST-1`). `production-
graph-cli.mjs --mode graph` finds only 10 of these — VENTILATION INDEX is
completely absent from the entire document's 53-table output, confirmed
by a title-string search across every sheet, not just misattached or
retitled elsewhere. The other 9 equipment tables all match exactly.

**Two distinct defects, same page:**
1. **VENTILATION INDEX MISSED entirely.** This table's structure is
   unlike every one of its 10 siblings on the same page: it is keyed by
   `ROOM NO.`/`ROOM NAME` (37 real rows, e.g. `A360F`/`STATION 1`,
   `A346`/`ADMIN HALLWAY`) rather than by an equipment `MARK` tag, and it
   is unusually wide — roughly 24 columns of OA/ACH ventilation-rate data
   (`OACH REQD`, `Total OACH`, `Total ACH`, `Design Heating/Cooling
   Temp`, etc.) versus the 8-16 columns typical of the equipment
   schedules on the same sheet that DID extract correctly. Not traced
   past this structural comparison — whether the miss is a width limit,
   a MARK-column requirement, or something else in the table-region
   detector was not read line-by-line, per this file's own standing rule
   against guessing at a fix under time pressure.
2. **EQUIPMENT STEAM TRAP over-counts by one row.** The extractor reports
   `rows: 2` for this table; direct `textSpans()` measurement of the
   table's own region confirms only ONE real data row (`ST-1`, `ROOF`,
   `AHU-1 PREHEAT COIL`, `838`, `1/4`, `FLOAT & THERMOSTATIC`, `1-1/2`,
   `1`) — the very next line below the table, `"NOTES FOR EQUIPMENT
   STEAM TRAP:"`, sits close beneath it and is the likely source of the
   phantom second row, though the exact mechanism was not traced.

**Relationship to already-catalogued bugs:** distinct from B-16/B-19/B-25
(other missing-table shapes — fabricated-from-prose, whole-table-
vanishes, transposed-layout) because the likely discriminator here is
column count/key-column shape rather than rotation or a caption
position; distinct from B-18/B-20 (row-fusion/duplication) because this
is a single extra row, not a fused or duplicated real one. New bug
number rather than an amendment to any of B-16 through B-25.

**Consequence for the Demo Corpus's own zero-error bar:** this document
fails MISSED=0 (one real 37-row table entirely absent) and also fails
exact-match cell-grading on a second, otherwise-correct table (a phantom
row). Both are real, concrete, measured reasons this document is not yet
clean — not a shrunk sample, the actual page.

**CONFIRMED RECURRING 2026-09-13 — the phantom-row half of this bug, a
2nd document.** `26_CA_TransbayTower_Mechanical_64Sheets.pdf#10`'s second
`FAN POWERED TERMINAL UNIT SCHEDULE (SECTION 23 36 00)` table reports
`rows: 19`; direct `textSpans()` measurement confirms only 17 real rows
(`FPB-61-101` through `-109`, `FPB-61-201` through `-208`). Two phantom
rows, same general family as the `EQUIPMENT STEAM TRAP` over-count above
(a real table over-counting by a small, fixed number rather than a whole
table going missing) — not traced to a specific adjacent text line this
time, so not asserted as the identical mechanism, just the same failure
shape.

**CONFIRMED RECURRING 2026-09-13 — a 3rd document, single-row
over-count.** `032_PA_Construct_EHRM_Infrastructure_Upgrades.pdf#2`'s
`SPLIT SYSTEM OUTDOOR UNIT (CONDENSER) SCHEDULE` reports `rows: 39`;
direct `textSpans()` measurement (counting real `ACCU` type-column
entries) confirms exactly 38 real rows. One phantom row, same family —
the sibling `SPLIT SYSTEM INDOOR UNIT (EVAPORATOR) SCHEDULE` on the same
sheet (38 real rows) matches exactly, so the over-count is specific to
this one table, not a page-wide off-by-one.

**CONFIRMED RECURRING 2026-09-13 — a 4th document, two-row
over-count.** `14_OR_KlamathCC_LearningCtr_Mechanical.pdf#3`'s
`VENTILATION REQUIREMENTS` table reports `rows: 40`; direct `textSpans()`
measurement confirms exactly 38 real rows (34 real room rows across 4
`DOAS-`-grouped zones, plus 4 zone-subtotal rows) — includes a genuine
duplicate room name, `CLASSROOM 135`, confirmed present twice at
different y-positions under two different zones, ruled out as the
source of the miscount. Found alongside B-31's own new row-truncation
and missing-table findings on the same document.

**PARTIAL FIX 2026-09-13 — root cause of the VENTILATION INDEX miss now
precisely traced (not fixed in code); the EQUIPMENT STEAM TRAP phantom
row confirmed already closed as a side effect of other work this
session.**

**Phantom-row half — closed, mechanism not separately isolated.**
Re-running `production-graph-cli.mjs --mode graph` against
`01_NY_VA_Northport_Dialysis_100CD.pdf` (`OPENTAKEOFF_GRAPH_TRACE=1`,
cache cleared first) now reports `rows: 1` for EQUIPMENT STEAM TRAP,
matching the real, hand-counted count exactly — the `"NOTES FOR
EQUIPMENT STEAM TRAP:"` line below the table is no longer being pulled
in as a phantom second row. This document was not touched directly by
any fix landed this session; the most likely explanation is a side
effect of B-18's `split_unruled_header_row()` change in `celltext.py`
(which changes how an oversized/adjacent text band gets attributed to a
table's own face set) or of B-40's `rulelinebox.py` coordinate-scale
fix altering which rows a ruled-line region considers "inside" its own
box. The causal mechanism was not isolated to a specific line of code —
this entry records the observed before/after (`rows: 2` → `rows: 1`),
not a traced fix, in keeping with this file's own standing rule against
asserting a mechanism that wasn't read line-by-line. The three other
recurring instances (`26_CA` p10, `032_PA` p2, `14_OR` p3) have **not**
been re-checked against current code as part of this pass — still open
to confirm whether they are also now closed as the same side effect.

**Real miss half — root cause precisely traced, fix deliberately not
attempted.** Using `vectorgrid.py`'s own `find_tables()` directly against
page 88 (bypassing the app's downstream pipeline) confirms the VENTILATION
INDEX table's geometry IS detected at the vector-grid layer: 13 real
(non-raster) candidate regions on the page, including one with 889 cells
matching the expected size of this table. The table never reaches the
app's own output because `vectorTakeoffPipeline.ts`'s reconciliation step
splits it into two separate geometric **blocks**, cut at a border-weight
rule between the header and the data:

- Upper block, `3x24` at `[149, 901, 2055, 1019]` (page points) — the
  "VENTILATION INDEX" title plus its multi-tier grouped header (`Total
  OACH` / `Total ACH` / `Design` groups, each with individual leaf
  headers). Declined with reason **"no keyed data rows (kind equipment,
  key column col 0)"** — this block has no data rows of its own to key
  against, since they live in the sibling block below.
- Lower block, `38x24` at `[149, 1019, 2055, 1834]` — the 37 real
  room-keyed data rows (`A360F`/`STATION 1`, `A360G`/`STATION 2`, ...,
  `A346`/`ADMIN HALLWAY`, plus one apparent subtotal/total row).
  Declined with reason **"unknown kind and no title"** — this block has
  the real data but no title or header of its own, because those live in
  the sibling block above, and the reconciler has no path to attribute a
  title/header from one block onto a different block.

Both decline reasons were recovered via a `qpdf --pages 85-92` slice of
the full 162-page document (the full-document trace's own
`declined_regions` array is capped at 64 entries and had silently
dropped this page's specific reasons in the whole-document run — a
known limitation of that debug field, not a document-specific issue).
The exact split point, `y=1019`, was independently confirmed by
rendering the page: it lands precisely on the ruled line directly below
the header row and above the first data row (`A360F`), visually matching
a border-weight rule the same as those documented elsewhere in this
codebase's own precedent for legitimate block cuts (e.g. "a second title
band is a second table"). Here, though, the cut is a false positive:
both blocks share the exact same column x-extent (`col0..col23` identical
on both sides), which every other real multi-block split precedent in
this codebase does NOT — a real second table has its own independent
column layout, while this is one table's header separated from its own
body by a rule weight that should not, in this case, cut a block.

**Why this was not fixed in code this pass.** Unlike B-18 (a single
oversized cell split entirely inside `celltext.py`, with no `vectorgrid.
py` face/block geometry touched), closing this gap requires changing
block/connected-component construction or a post-hoc block-merge step in
`vectorgrid.py`/`vectorTakeoffPipeline.ts` — reattaching an
adjacent header-only block to a title-less data-only block when their
column extents match. This codebase's own historical documentation (STATE.
md and this catalogue's own precedents) repeatedly flags block-merge
logic as a real source of regression when done without a narrow,
well-tested rule — "merge must leave a block tessellating," "one region
now has ONE owner." A safe version of this fix (merge two vertically
adjacent blocks only when their column edges match within tolerance AND
the upper block has no data rows of its own AND the lower block has no
title of its own) is a plausible next step, but was deliberately not
written and shipped under this pass's time pressure without a
corresponding regression test proving it doesn't fuse unrelated
sibling tables elsewhere in the corpus (a real risk: the 9 correctly-
extracted equipment schedules on this same page sit close enough
together that an overly broad merge rule could wrongly fuse two of
them). Left open as the precise, actionable next step for whoever picks
this up: the fix is now a bounded, well-specified block-merge rule, not
an open-ended "table detector doesn't see wide/room-keyed tables"
mystery.

**Verification of no regression from the phantom-row observation itself:**
this pass made no code change for B-26 — the `rows: 2` → `rows: 1`
change is a genuine measurement of already-shipped code (B-18/B-40),
not a new edit, so no separate regression run was needed for it.

**RE-VERIFIED 2026-09-14 — the real miss (VENTILATION INDEX) is FIXED,
confirmed live; no code change made this pass.** Re-ran
`production-graph-cli.mjs --mode graph` against a fresh `qpdf`-sliced
page 88, no code touched. The `VENTILATION INDEX` table now extracts
completely and correctly: `kind: equipment`, all 24 real headers
(`ROOM NO.`/`ROOM NAME`/`AREA SF`/`CEILING HEIGHT FT`/`Total OACH`- and
`Total ACH`- and `Design`-grouped columns, matching this entry's own
originally-cited column names exactly), and all 37 real rows
(`A360F`/`STATION 1` through `A340`), every cell value matching this
entry's own original hand-count. The upper (header-only) and lower
(data-only) blocks this entry's own root-cause trace found — same
column extent, split at `y=1019` — are now correctly recombined: this
document was NOT touched by any fix in this session, so the fix is an
unclaimed side effect of `vectorGridAdapter.ts`'s own SPLIT-FRAGMENT
RECOVERY mechanism (`isMergeEligibleFragment`/`isFragmentAdjacent`/
`stackFragments`, documented in that file's own header) — a mechanism
that structurally matches this entry's own proposed fix design almost
exactly (merge two vertically adjacent blocks with matching column
edges when the upper has no data rows of its own and the lower has no
header of its own), and evidently already covers this exact case: the
upper block's own refusal ("no keyed data rows", 3 rows) clears
`isMergeEligibleFragment`'s existing `rows <= 3` bar, and the lower
block (38 rows, "unknown kind and no title") only needs to be a valid
merge TARGET, not independently eligible itself — which the existing
code already allows. All 11 real tables on the page now match this
entry's own hand count exactly (`AIR HANDLING UNIT`:2, `AIR INLETS &
OUTLETS`:11, `PUMPS`:1, `STEAM HUMIDIFIERS`:1, `FANS`:1, `SOUND
ATTENUATORS`:1, `VENTILATION INDEX`:37, `SINGLE DUCT AIR TERMINAL
UNITS`:25, `EX FAN REBALANCE SCHEDULE`:1, `END-OF-MAIN STEAM LINE DRIP
TRAP`:1, `EQUIPMENT STEAM TRAP`:1). This document is now fully clean.

**CORRECTION — the phantom-row half is fixed on the ORIGINAL document
only; the 3 other recurring instances remain open, unchanged.** Re-ran
the same command against fresh `qpdf` slices of all 3 documents this
entry's own "CONFIRMED RECURRING" notes named as not yet re-checked:
`26_CA_TransbayTower_Mechanical_64Sheets.pdf#10`'s second `FAN POWERED
TERMINAL UNIT SCHEDULE (SECTION 23 36 00)` still reports `rows: 19`
against the true 17 (unchanged); `032_PA_Construct_EHRM_Infrastructure_
Upgrades.pdf#2`'s `SPLIT SYSTEM OUTDOOR UNIT (CONDENSER) SCHEDULE` still
reports `rows: 39` against the true 38 (unchanged); `14_OR_KlamathCC_
LearningCtr_Mechanical.pdf#3`'s `VENTILATION REQUIREMENTS` still reports
`rows: 40` against the true 38 (unchanged). Whatever closed the original
document's own `EQUIPMENT STEAM TRAP` overcount (this entry's own text
already declined to name a specific mechanism, guessing at B-18 or B-40
as a side effect) evidently does not generalize to these 3 — the
phantom-row family itself is NOT closed, only this one document's own
instance of it. Left open, exactly as this entry's own text already
said before this re-check: "not traced to a specific adjacent text line
this time, so not asserted as the identical mechanism, just the same
failure shape."

### B-27 — a real small table is completely dropped when a multi-line, non-tabular info block sits between its own title and its header row (ROOT CAUSE CONFIRMED 2026-09-13 — not fixed, corpus-wide gate; see B-37 for the same mechanism's sibling case)

**Where:** `100_OH_Butler_Tech_RTU_Welding_Source_Capture.pdf#7` (sheet
P1.0, "PLUMBING FLOOR PLAN") — found starting the HELDOUT set's own
missed-checking pass (`keys/HELDOUT_GRADING.md`), the same discipline as
the Demo Corpus pass. This is a small (7-page) document where the
pipeline's own live `--mode graph` output claims only 1 real table in
the whole document (`DIFFUSER, GRILLE, AND REGISTER SCHEDULE`, page 5,
correctly extracted with 4/4 rows on a `role: plan` sheet — proof that
schedules-on-plan-role-sheets, task #60's own fix, is genuinely still
working here); the pre-computed census (`VOLUME_FLOOR_CENSUS-2026-09-13.
json`) separately claimed 0 tables for this document, an even larger
undercount now superseded by this direct measurement.

**Measured:** page 7 carries a second real, titled, ruled table, `GAS
INPUT SCHEDULE FOR BUTLER TECH`, confirmed by render and by direct
`textSpans()` extraction: `EQUIPMENT`/`LOAD (CFH)` header at y=1057.4,
then 5 real equipment rows (`EXISTING LAB FURNACES`, `EXISTING WATER
HEATER`, `NEW RTU` ×3) plus a `BUILDING TOTAL` summary row — 6 rows
total. `production-graph-cli.mjs --mode graph` returns zero tables for
this sheet (`role: plan`, `tables: 0`), and a full-JSON string search
confirms `"GAS INPUT"` appears nowhere in the entire document's output —
not misattached to another sheet or renamed, simply absent.

**Structurally distinct from its own working sibling table** on page 5:
this table's real title (`"GAS INPUT SCHEDULE FOR BUTLER TECH"`, y=938.9)
is followed not directly by its header row but by FOUR lines of
non-tabular `LABEL: VALUE` metadata (`SERVICE ADDRESS:`, `TOTAL
EQUIVALENT LENGTH OF PIPE:`, `REQUIRED DELIVERY PRESSURE:`, `NUMBER OF
METERS:`/`GAS SERVICE LENGTH:`, y=968.9-1028.9) before the real
`EQUIPMENT`/`LOAD (CFH)` header at y=1057.4. This title→metadata-block→
header shape is the same general pattern already named in task #90
("header-JOIN loop no longer swallows pre-header spec-metadata rows into
column headers") and #86 ("scheduleKeywordRegion misses the real header
when a table's caption prints BELOW it, not above") — but #90's own fix
was for a FUSION failure (metadata swallowed into the header), and this
document's failure mode is total absence, not fusion. Whether this is a
gap #90's fix didn't cover, or a distinct failure in the same code path,
was not traced past this structural comparison, per this file's own
standing rule against guessing at a fix under time pressure.

**Consequence for the HELDOUT set's own zero-error bar:** this document
fails MISSED=0 — a real 6-row table on the only 7-page document graded
so far in this set is entirely invisible to the production pipeline,
despite its own immediate sibling table two pages earlier extracting
perfectly. A real, concrete, measured reason this document is not clean.

**ROOT CAUSE CONFIRMED 2026-09-13 (code-level, precise — not fixed, same
corpus-wide gate as B-37).** Traced live via a `qpdf`-sliced single page
+ `OPENTAKEOFF_GRAPH_TRACE=1`: the sheet's own role classifies `plan`
("PLUMBING FLOOR PLAN"), and `L1.8:vectorgrid` measured `0` ms in the
trace — confirming it never actually ran any per-sheet work, exactly the
same signature as B-37's own confirmed finding. This is `isScheduleTarget`
(`web/src/lib/vectorTakeoffPipeline.ts:177`) again, but the OTHER branch
of the same gate: `sheetHasScheduleCaption` (`web/src/lib/
scheduleLanguageScan.ts:130`) requires a caption whose OWN regex
(`SCHEDULE_CAPTION_RE`) ends in `SCHEDULES?`, optionally followed by a
short parenthetical — verified directly (`sheetHasScheduleCaption(["GAS
INPUT SCHEDULE FOR BUTLER TECH"])` returns `false` in isolation). This
table's own real caption has the word `SCHEDULE` in the MIDDLE, followed
by `"FOR BUTLER TECH"` — a real, common drafting convention (`"<X>
SCHEDULE FOR <owner/project>"`) the regex's own trailing-word anchor
(`SCHEDULES?$`) does not admit, so the entire sheet is skipped exactly as
B-27's own original "not traced" note suspected, now fully confirmed
rather than guessed.

**Why this is disclosed without a fix.** Unlike B-37 (no fix possible
without a broader policy change to which sheets get offered at all),
here a narrow regex widening is imaginable — allow a trailing `" FOR
<short suffix>"` clause the same way the regex already allows a trailing
parenthetical. But `SCHEDULE_CAPTION_RE` is the exact match test for
`sheetHasScheduleCaption`, itself the sole caption-based gate for EVERY
`plan`-role sheet in this 500+ document corpus (this file's own comment
on the function states its narrow-by-design history: "the sheet that
motivated this picked up one junk 1x3 region... so the gate stays as
narrow as the evidence allows"). A `" FOR ..."` suffix is a real risk
here specifically because `CAPTION_XREF_RE` only filters captions
STARTING with `SEE`/`REFER`/etc. — a real cross-reference sentence that
does NOT start with one of those words (a genuinely plausible drafting
phrase, e.g. `"SIZE PER SCHEDULE FOR EACH UNIT TYPE"`) could plausibly
clear every other structural bar (length, all-caps character class) and
false-positive the whole gate open on an unrelated plan sheet. Widening
a shared, corpus-wide admission gate on the strength of one document's
own caption wording, without a full corpus regression sweep measuring
the false-positive rate this exact function's own design history warns
about, is not attempted here under this session's own standing rule
against guessing at fixes under time pressure — recorded as a precise,
bounded next step (a narrower `" FOR "` suffix pattern, corpus-validated
for false positives) rather than an open-ended mystery.

**THE PROPOSED NEXT STEP TRIED, MEASURED, AND PROVEN UNSAFE (2026-09-13,
same day) — do not attempt this exact widening again.** Built the
candidate regex this entry's own next-step named — extending
`SCHEDULE_CAPTION_RE` (`scheduleLanguageScan.ts`) to also accept a
trailing `SCHEDULES? FOR <2-29 char short caps suffix, no punctuation>`
— and, rather than shipping it, ran the exact corpus regression sweep
this entry said was required BEFORE shipping. Scanned every real text
line containing the word `SCHEDULE` across `bulk/` (113 documents, via
PyMuPDF's own `get_text()`, fast and independent of pdf.js's own span
extraction) for the literal substring `SCHEDULES?\s+FOR\s+`: **318 real
lines matched.** Ran EVERY ONE through the exact same 3-stage gate
`sheetHasScheduleCaption` applies (length 8-78, `CAPTION_XREF_RE`
prefix-reject, then the candidate widened regex): **65 of 318 (≈20%)
would have false-positived the gate open** — real notes and callouts
like `"F. REFER TO DIFFUSER SCHEDULE FOR DUCT RUNOUT SIZE UNLESS..."`,
`"6. PANEL SCHEDULES FOR AFFECTED PANELS"`, `"EQUIPMENT SCHEDULES FOR
ADDITIONAL"` (a line-wrapped fragment of a longer cross-reference
sentence) — none a real table caption, every one a genuine numbered
note or mid-sentence continuation that happens not to start with a
`CAPTION_XREF_RE`-blocked word (numbered-bullet prefixes like `"F."`/
`"9."`/`"6."` are the dominant shape, exactly the gap this entry's own
risk paragraph named). **Only 1 of the 318 lines was the genuine article
this fix was meant to admit** — `100_OH_Butler_Tech_RTU_Welding_Source_
Capture.pdf`'s own `"GAS INPUT SCHEDULE FOR BUTLER TECH"`. A ~20%
false-positive rate for a 1-in-318 real recovery is not a defensible
trade on a shared, corpus-wide routing gate, so this widening is NOT
implemented. This closes off the exact next step this entry itself
proposed, with hard numbers rather than the risk staying a plausible-
sounding guess for a future session to re-discover the hard way (the
same lesson B-31's own tried-and-reverted fix taught: a next-step
recommendation is a hypothesis, not a proof, until it is actually
measured). A real fix for this specific shape would need a signal
`CAPTION_XREF_RE` does not have today — recognizing a LEADING numbered-
list marker (`"F. "`, `"9. "`, `"6. "`, digit/letter + period) as its own
xref-adjacent rejection, independent of which word follows it — not
designed or attempted here.

### B-28 — an entire dense schedule page (10 tables, 98 rows) is completely invisible despite dense, fully-reachable real text; a same-titled sibling table on another page is silently dropped by an apparent title-collision (PARTIALLY FIXED 2026-09-13 — the page #11 title-collision half closed; the page #9 total blackout remains open)

**Where:** `26_CA_TransbayTower_Mechanical_64Sheets.pdf` — a 64-sheet
tower mechanical set with 3 dense schedule pages (M0.09/#9, M0.10/#10,
M0.11/#11, all three literally titled "MECHANICAL SCHEDULES" per the
drawing title block). Found continuing the HELDOUT set's own missed-
checking pass, this document picked for its unusually large table
density relative to page count.

**Measured, page #9 (M0.09) — total blackout.** Hand-transcribed all 10
real, titled, ruled tables and their 98 total rows BEFORE viewing
extractor output, using direct `textSpans()` coordinate extraction for
every table (not eyeballing): `CUSTOM FACTORY-BUILT TRI-PATH MULTI-ZONE
AIR HANDLING UNITS` fan-data table (12 rows) and its own damper/filter-
data continuation table (12 rows, same 12 `AHU-` designations, no
repeated `DESIGNATION` header — confirmed via its own `TRANSFER` column
header instead), `CHILLER` (3), `HOT WATER BOILER` (1), `AIR HANDLING
UNIT (COOLING)` (8), `AIR INLETS AND OUTLETS` (20), `PLATE AND FRAME HEAT
EXCHANGER` (6), `FAN COIL` (22), `COOLING TOWER` (4), `PUMPS` (10) — 10
tables, 98 rows, all independently verified by exact-coordinate text-span
counts, not visual estimates. `production-graph-cli.mjs --mode graph`
returns **zero tables** for this entire page. This is not a reachability
problem: `textSpans()` finds **4,658 real text spans** on this one page
(more than either of its two sibling pages, #10's 4,175 and #11's
3,346 — both of which DID yield tables), ruling out the vector-outlined-
glyph category (`086_CA`, `056_NY`, `020_MO`) outright. The sheet's own
`role` is `detail`, not `schedule` — but #10 carries the exact same
`detail` misclassification and still extracts all 5 of its own real
tables correctly, so role misclassification alone does not explain a
100% failure specific to this one page. The actual reason inside
`sheetgraph.ts`'s table-region detector was not traced further, per this
file's own standing rule against guessing at a fix under time pressure.

**Measured, page #11 (M0.11) — a same-titled sibling table dropped.**
This page has a `RELIEF AND INTAKE HOOD` table TWICE — two genuinely
distinct physical tables (different `NOTES:` text: one references an
"INTEGRATED CONTROL DAMPER", the other a "BAROMETRIC DAMPER... STAIR
PRESSURIZATION MODE"), each with the identical 2 rows
(`RAH-64-1`/`RAH-64-2`) and identical title text — a real, if unusual,
drafting choice by the source document's own authors. The extractor's
own output carries only ONE `RELIEF AND INTAKE HOOD` entry (`rows: 2`) —
the second, distinct table is completely absent, consistent with a
title-string collision silently merging or overwriting one table with
the other rather than keeping both. `SINGLE DUCT CAV EXHAUST TERMINAL`
(7 rows), `DAMPERS` (106 rows — the single largest table hand-verified
in this whole session), `RADIANT FLOOR SCHEDULE` (3), and `SOUND TRAP
SCHEDULE` (3) all match exactly. `WATER FILTRATION UNIT` (1 row) is a
confirmed 8th instance of B-17's own title-loss signature (amended
there, not re-described here).

**Relationship to already-catalogued bugs:** the page #9 blackout is
distinct from every other missing-table bug in this file — it is not a
role-classification miss (B-9-style; ruled out by #10's own identical
mis-tag still working), not a vector-outlined-glyph case (ruled out by
span count), not a transposed-layout case (B-25; these are ordinary
row-per-unit equipment tables identical in shape to the ones that DID
extract on #10/#11), and affects 100% of a page's tables at once rather
than one specific table — the largest-blast-radius missing-table finding
in this entire session. The page #11 duplicate-title drop is a new
mechanism (title-string collision) distinct from B-17 (title lost
entirely, not a real title colliding with another real title).

**Consequence for the HELDOUT set's own zero-error bar:** this single
document fails MISSED=0 by 11 real tables (10 from the page #9 blackout,
1 from the page #11 title collision) and 100 real rows — the largest
single-document MISSED gap measured in this entire session, Demo Corpus
included.

**FIX 2026-09-13 — the page #11 title-collision half closed.** Direct
code reading of `collapseEquivalentPrimaryTables`
(`web/src/lib/tableExtractorReconcile.ts`) confirmed the exact
mechanism this entry's own "consistent with a title-string collision"
guess pointed at: its own dedup identity key is
`${sheet}\0${title}\0${sorted row keys}` — SHEET + TITLE + ROW KEYS
only, no region/position check at all. Both `RELIEF AND INTAKE HOOD`
tables share the identical title AND the identical row keys
(`RAH-64-1`/`RAH-64-2` in both), so they hash to the same identity and
the function's own dedup logic treated the second one as a weaker
reading of the first, discarding it outright — even though they sit at
completely different page positions (`y≈894–1182` vs `y≈2201–2488`) and
are genuinely different physical tables (confirmed by the render's own
different `NOTES:` text on each).

Fixed by requiring the two same-identity candidates' own regions to
overlap AT ALL (the weakest possible bar — not a ratio) before treating
them as the same table, matching the same "same physical table" evidence
`dedupCrossSourceTables` already requires elsewhere in this file via its
own IoU threshold. Two same-identity candidates seen more than once are
now checked against every prior candidate with that identity, not just
the most recently seen one (a 3rd table sharing the same title+keys
could otherwise mix a real duplicate pair with a genuinely distinct
one and miss the real duplicate).

**Verification:** 2 new unit tests in `test/tableExtractorReconcile.test.ts`
(non-overlapping same-title-and-keys tables both survive; overlapping
same-title-and-keys tables still correctly collapse to the more complete
reading). All 213+ tests across the 5 related suites pass. Live,
`qpdf`-sliced page 11 before/after: before, 6 tables with one `RELIEF
AND INTAKE HOOD`; after, 7 tables with both `RELIEF AND INTAKE HOOD`
entries present at their own distinct regions — every other table on
the page (titles, rows, kinds, regions) byte-identical, confirming the
fix recovers exactly and only the one real table this bug's own entry
measured as missing.

**Page #9's total blackout remains open, not investigated in this
pass** — a structurally distinct defect (10 tables, 100% of a page,
ruled out as role-misclassification and vector-outlined-glyph by this
entry's own original measurement) with its own, still-untraced cause.

### B-29 — two real, differently-structured tables are silently merged into one, and the merged result's title is fabricated from unrelated title-block text (CORRECTED 2026-09-13 — the original "merge" diagnosis was wrong; real mechanism is two unrelated defects that coincidentally matched in row count)

**Where:** `084_SC_H59_N054_FW_Building_112_Chiller_Addition.pdf#6`
(sheet MP001, "MECHANICAL PIPING SCHEDULES & NOTES") — found continuing
the HELDOUT set's own missed-checking pass, a small 13-page document
picked for its low census table count.

**Measured:** the sheet carries 2 real, titled, ruled tables with
completely different column schemas: `AIR COOLED CHILLER SCHEDULE` (1
row, `CH-1`) and `WATER CIRCULATING PUMP SCHEDULE` (2 rows, `CHWP-1`,
`CHWP-2`) — confirmed by render, 3 real rows total.
`production-graph-cli.mjs --mode graph` returns exactly ONE table for
this sheet: `title: "GREENVILLE -"`, `rows: 3`. The row count (3) is
precisely the SUM of the two real tables' own row counts (1+2), strongly
indicating the two distinct tables were merged into a single reported
entity. The fabricated title is neither real table's own title, nor
`null`, nor `""` (this file's usual B-17 signature) — it is a truncated
fragment of the sheet's own title-block text (`"GREENVILLE Technical
College"`, the project owner's name, printed in the drawing's title
block on the far right of the sheet, nowhere near either real table).

**Relationship to already-catalogued bugs:** distinct from B-17 (title
genuinely lost, `null`/`""`) because here a WRONG, fabricated title
appears instead of an empty one; distinct from B-18/B-20 (row-fusion/
duplication WITHIN one real table) because this merges TWO separate
real tables with different column schemas into one reported table, not
rows within a single table; distinct from B-28's page #9 (whole-page
blackout, zero tables) because here a table IS produced, just a wrong,
merged one. A new, previously unseen bug shape in this file.

**Consequence for the HELDOUT set's own zero-error bar:** this document
fails cell-grading twice over on one small sheet — a real table (`WATER
CIRCULATING PUMP SCHEDULE`) is invisible as its own entity, and the
survivor's title doesn't match either real table it's supposed to
represent.

**CORRECTION 2026-09-13 (code-level, precise — the original "merge"
theory was wrong).** Traced live via a `qpdf`-sliced single page +
`OPENTAKEOFF_GRAPH_TRACE=1`, dumping the surviving table's own headers/
rows/cells directly instead of trusting the row-count coincidence: the
survivor is `headers: ["DATE","MARK","DESCRIPTION"]` with rows keyed
`09/02/2020`/`10/02/2020`/`1/15/2021`, cells `MARK: "A"/"B"/"C"`,
`DESCRIPTION: "ISSUED FOR REVIEW"/"ISSUED FOR REVIEW"/"CONSTRUCTION"` —
this is the sheet's own REAL revisions log, a genuine 3-row table with
real revision history, not a merge of the two HVAC schedules at all.
`1 (chiller) + 2 (pump) = 3` was a coincidence of row count, not a
causal merge — this file's own standing rule against guessing at
mechanisms from a single measured number, not code, is exactly the
lesson this correction re-confirms.

The real picture is TWO unrelated, independently-confirmed defects on
this sheet:
1. **The two real HVAC schedules are never detected at all**, not
   merged. The trace's own `vectorgrid` summary reports `"tables":0"`
   for this entire page (0 successful vectorgrid tables) — the only
   candidate region vectorgrid's own engine found anywhere on the page
   is an unrelated `5x3` grid, declined `"unknown kind and no title"`.
   Vectorgrid's own detector simply never proposed a candidate region at
   either HVAC schedule's own location — a genuine geometric-detection
   gap in vectorgrid itself (both real tables are small, 1 and 2 rows),
   not a downstream reconciliation/merge decision, and not traced
   further into vectorgrid's own Python-side grid-finding logic under
   this pass's own standing rule.
2. **The real revisions log's own title is wrong** — `"GREENVILLE -"` (a
   truncated title-block project-name fragment) instead of its own real
   caption (presumably `"REVISIONS"` or similar, not confirmed by this
   pass). This is a genuine title-attachment defect, most likely a
   `nearbyScheduleCaption`-family misattachment (same general class as
   B-17/B-36), not independently re-traced to its own exact mechanism
   here.

Left open — this correction replaces the entry's own original,
plausible-but-wrong "two tables merged" diagnosis with the measured,
code-level truth, but does not fix either of the two real defects it
uncovered.

### B-30 — a code-compliance approval stamp's own disclaimer paragraph is fabricated into a phantom one-row table (PARTIALLY FIXED 2026-09-13 — 2 of 4 documented recurrences now closed, 2 remain open with corrected, deeper root causes)

**Where:** `098_ID_ITD_D3_Bruneau_Maintenance_Shed_HVAC_Upgrade.pdf#8`
(sheet M3.0, "HVAC SCHEDULES") — found continuing the HELDOUT set's own
missed-checking pass.

**Measured:** the sheet carries 4 real, titled, ruled tables, all hand-
confirmed and all extracted correctly by the production pipeline:
`VEHICLE EXHAUST GAS DETECTION SYSTEM SCHEDULE (SHOP)` (1 row),
`FAN SCHEDULE` (3), `DUCTLESS SPLIT HIGH WALL COOLING & HEATING UNIT
SCHEDULE` (2), `GAS-FIRED UNIT HEATER SCHEDULE` (4). But the pipeline
also reports a 5th, fabricated table: `title: "approved contingent on
the compliance"`, `rows: 1`, `kind: reference`. This title is a verbatim
fragment of a Division of Occupational & Professional Licenses (DOPL)
code-review approval stamp printed in the sheet's top-left corner —
"These plans are approved contingent on the compliance with the mark-ups
and notes applied. This approval shall not be construed to be an
approval of any violation..." — a pure disclaimer paragraph with no
columns, rows, or ruled structure whatsoever.

**Relationship to already-catalogued bugs:** distinct from B-16 (two
SIDE-BY-SIDE numbered-notes lists fusing into one fake table via a false
column correlation) because here a SINGLE disclaimer paragraph, with no
sibling list beside it, is misread as tabular on its own. Same general
family (prose text mistaken for a table) but a different triggering
shape — a new bug number rather than an amendment.

**Consequence for the HELDOUT set's own zero-error bar:** this document
fails MISSED=0's false-positive-free counterpart — a phantom table with
no real basis pollutes an otherwise perfectly-extracted sheet (4/4 real
tables correct).

**ROOT CAUSE CORRECTED 2026-09-14 — this is NOT a pure disclaimer
paragraph, and the mechanism is a vectorgrid engine bug, not a text-
classification one.** Traced live: called `bakeoff/vectorgrid.py`'s
`find_tables()` directly on this exact page and rendered the phantom's
own region (`(112.14, 109.56)`-`(303.46, 264.42)` raw pt) at 300dpi. The
render shows the DOPL stamp's teal disclaimer text is a semi-transparent
WATERMARK drawn on top of, not beside, the real `VEHICLE EXHAUST GAS
DETECTION SYSTEM SCHEDULE (SHOP)` table's own left two columns —
`SYMBOL` / `AREA SERVED` headers and a real `GD-1` / `STORAGE/REPAIR
BAYS` data row are genuinely ruled and genuinely there, directly
underneath the disclaimer text. `page.rects` confirms the stamp carries
its own real vector bounding rectangle — stroke color `(0, 0.251,
0.502)` (the same teal), right edge at `x=303.4558554399999` — landing,
to 5 decimal places, on the EXACT x where the phantom's own bbox ends
AND where the real schedule table's own next real column (`EXHAUST FAN
MODEL...`, extracted correctly as its own separate table starting at
that same x) begins. `find_tables()`'s border-weight wall test (`_border
_weight`/`bw`, the same mechanism the file's own comments describe
protecting "two schedules stacked on a shared rule" from merging) reads
this coincidental stamp-rectangle edge as a real internal table wall and
CUTS the real schedule table in half at that x — the left half (2 real
columns, `SYMBOL`/`AREA SERVED`) then also inherits the stamp's own
overlaid paragraph text as an unruled top cell, which `celltext.py`'s
`split_unruled_header_row`/`split_unruled_columns` chop into the 2
garbled "headers" this bug's title comes from.

So the true shape is: a real, single schedule table is split into TWO
separate "tables" by an unrelated stamp graphic's border coincidentally
aligning with one of its real internal column boundaries, and the
split-off left half is then mislabeled using the stamp's own overlaid
watermark text. This is a different, and harder, bug than "prose
mistaken for a table" — it is a face-adjacency/wall-detection false
positive caused by two independently-drawn real vector objects
(a review stamp, a schedule table) overlapping in the source PDF, which
`find_tables()` has no way to know are unrelated from geometry alone.
**Not fixed** — a general fix (distrust a wall whose weight comes from a
rect drawn in a color that never appears as this sheet's own table-rule
color, say) risks rejecting genuine color-coded table borders elsewhere
in the corpus and needs a corpus-wide before/after count, the same bar
B-27's rejected proposal was held to, before it can ship. Filed as the
real, corrected root cause replacing the original (wrong) "pure
disclaimer paragraph, no ruled structure" theory above, which the
render disproves outright — real ruled structure is there, just
partially borrowed by an overlapping stamp.

**CONFIRMED RECURRING 2026-09-13 — a 2nd document, twice on one
document.** `080_CA_Contra_Costa_College_Science_Center_Conference.pdf`
fabricates a `title: "AGENCY APPROVALS"`, `rows: 3` phantom table on BOTH
page #17 and page #21 — confirmed by render: this is the empty
signature/stamp title-block box labeled "AGENCY APPROVALS" printed in
the same corner of every sheet in this set, not a real ruled table
anywhere. Same general mechanism as the DOPL disclaimer-stamp case above
(title-block box content fabricated into a table), recurring on a
completely different source document and a different specific stamp box.

**CONFIRMED RECURRING 2026-09-13 — a 3rd document, twice on one
document.** `013_MO_T2523_01_Replace_Boilers_Phase_2_Building_29.pdf`
fabricates a `title: "SUSTAINMENT MAINTENANCE"` phantom table on BOTH
page #20 (`rows: 2`) and page #23 (`rows: 3`) — lifted from the title
block's own project-name text, "1107TH THEATER AVIATION SUSTAINMENT
MAINTENANCE GROUP", printed in the same corner of every sheet. Full
context and this document's several other, distinct findings (a
missing `BOILERS` table, a split-in-two real table, column-header-
sourced title fabrications) are in B-32 below.

**CONFIRMED RECURRING 2026-09-13 — a 4th document.**
`12_MT_MSU_ReidHall_Renovation.pdf#28`'s otherwise perfectly-extracted
5-table "MECHANICAL SCHEDULES" sheet (all 5 real tables — `SPLIT SYSTEM
HEAT PUMP SCHEDULE`, `DUAL DUCT VARIABLE AIR VOLUME UNIT SCHEDULE`,
`GRILLE - REGISTER - DIFFUSER SCHEDULE`, `FINNED PIPE RADIATION
SCHEDULE`, `CABINET UNIT HEATER SCHEDULE` — match exactly, 17/17 rows)
also carries a fabricated `title: "DRAWN BY: NT"`, `rows: 1` table,
lifted from the sheet's own title-block drafter-name field. Same
mechanism, yet another specific stamp/field source.

**FIX 2026-09-13 — this 4th documented instance (12_MT's `"DRAWN BY:
NT"`) closed.** Traced live via a `qpdf`-sliced single page +
`OPENTAKEOFF_GRAPH_TRACE=1`: this specific phantom table's own row/header
data (`headers: ["COL1","COL2","COL3"]`, one row `key: "REV"` with cell
text `"REV."`/`"DESCRIPTION"`/`"DATE"`) revealed it is the sheet's own
BLANK REVISIONS log box (a real ruled grid template — column headers
REV./DESCRIPTION/DATE — with no actual revisions filled in on this
sheet's first issue) read through `scheduleTableFromODL`, whose own
header row got misread as a single data row; a nearby title-block field
("DRAWN BY: NT") then got attached to it as a fabricated caption. This
file already had exactly the right guard for this shape —
`isTitleBlockTable`/`TITLE_BLOCK_ROW_LABELS` (this same file, `~line
3662`), refusing any candidate table whose EVERY row key is drawn from a
closed, real administrative vocabulary (`DRAWN BY`, `SHEET NO`, `REV
DATE`, ...) — but it was wired into ONLY the geometric extractor's own
`extractReferenceTableAt` path, never this ODL one, so the identical
title-block shape reached the graph unblocked whenever it happened to be
read through ODL instead.

Two small, narrow changes in `web/src/lib/sheetgraph.ts`: (1) added
`"REV"` to `TITLE_BLOCK_ROW_LABELS` (this table's own row key,
normalized from `"REV."`) — a closed, unambiguous administrative term no
real per-equipment/per-room schedule keys its rows on; (2) added one
`isTitleBlockTable(rows)` guard to `scheduleTableFromODL`, right after
its own "no keyed data rows" refusal, reusing the SAME existing function
rather than inventing a second vocabulary or heuristic.

**Verification:** all 148 `sheetgraph.test.ts` + 18
`vectorTakeoffPipeline.test.ts` + 22 `scheduleLanguageScan.test.ts` tests
pass unchanged. Live, on the real document: re-ran the pipeline against
a `qpdf`-sliced single page of `12_MT_MSU_ReidHall_Renovation.pdf#28`
before/after — the phantom `"DRAWN BY: NT"` table is gone, and all 5 real
tables on the page (`SPLIT SYSTEM HEAT PUMP SCHEDULE`, `DUAL DUCT
VARIABLE AIR VOLUME UNIT SCHEDULE`, `GRILLE - REGISTER - DIFFUSER
SCHEDULE`, `FINNED PIPE RADIATION SCHEDULE`, `CABINET UNIT HEATER
SCHEDULE`) keep their exact same row counts, titles, and kinds — the fix
touches only the one phantom table.

**Checked, not fixed (at the time), the other 3 documented instances:**
re-ran the live pipeline against the original DOPL disclaimer paragraph
(098_ID#8), the "AGENCY APPROVALS" signature box (080_CA#17/#21), and the
"SUSTAINMENT MAINTENANCE" project-name field (013_MO#20/#23) — all 3
fabricated tables were STILL present, unaffected by the 12_MT fix. None
of their own row keys happened to match "REV" or any other
`TITLE_BLOCK_ROW_LABELS` entry, and (unlike 12_MT) none of them appeared
to be a genuine ruled REV/DESCRIPTION/DATE-shaped grid at all.

**FIX 2026-09-13, same day, later pass — the "AGENCY APPROVALS" instance
(080_CA#17/#21) closed, and it WAS this exact vocabulary-gap shape after
all.** Traced live with a `qpdf`-sliced single page of each: this table
is not prose at all — it comes through the SAME geometric, anchor-based
`extractReferenceTableAt` path 12_MT's own fix already covers, and it IS
a genuine title-block reference table (`headers: ["ISSUED FOR","REV",
"DATE"]`, spanning the sheet's whole title-block column, `anchors` field
present) with 3 real title-block rows keyed `"ISSUED FOR BID"`,
`"SHEET TITLE"`, `"PROJECT NUMBER"`. Two of those three already matched
`TITLE_BLOCK_ROW_LABELS` (`SHEET TITLE`, `PROJECT NUMBER`); only
`"ISSUED FOR BID"` did not — the vocabulary already has bare `"ISSUED
FOR"`, but this project's own seal/signature block prints the fuller
phrase `"ISSUED FOR BID SEALS AND SIGNATURES"`, so `isTitleBlockTable`'s
own "every row must match" rule failed on that one row alone and let the
whole phantom through. **One line, one new literal vocabulary entry**
(`"ISSUED FOR BID"`, `web/src/lib/sheetgraph.ts`'s `TITLE_BLOCK_ROW_
LABELS`) — no new heuristic, no path wiring, reusing the exact mechanism
12_MT's own fix already proved. **Verified live:** the phantom is gone on
BOTH page #17 (0 tables left on that page — it was the only candidate)
and page #21 (the phantom gone, its 3 other real tables —
`TECHNOLOGY SYSTEMS PATHWAY SERVICES ROUGH-IN SCHEDULE`,
`TELECOMMUNICATIONS CABLING SCHEDULE`, `CABLE SERVICE TYPES AND
TERMINATIONS`, 1/1/9 rows — confirmed present and byte-identical before
and after via a stashed before/after diff). Full regression: all 189
`sheetgraph.test.ts` + `vectorTakeoffPipeline.test.ts` +
`scheduleLanguageScan.test.ts` tests pass, identical count before and
after (confirmed via the same stash-and-rerun check).

**Still open, and their own root causes now more precisely characterized
than "prose, not traced further":**
- **098_ID#8's DOPL disclaimer is NOT prose fabrication at all** — traced
  live (`vectorgrid_rpc.extract_grid` called directly, then a rendered
  crop of the exact region): it is a genuinely real, small, ruled 2-column
  reference table (`SYMBOL` / `AREA SERVED` headers, one real data row
  `GD-1` / `STORAGE/REPAIR BAYS`) that a separate DOPL code-review approval
  stamp graphic happens to overlap in the SAME page coordinates. The
  stamp's own disclaimer text and the table's own real header/data text
  get interleaved word-by-word into the same cells by whatever orders text
  spans within a cell's bounds (confirmed: the header row's own real
  `SYMBOL`/`AREA SERVED` text is present but jumbled mid-sentence inside
  the disclaimer's own prose — `"not be violation SYMBOL of, standards,"`).
  No existing vocabulary guard applies (the real headers are not
  administrative-vocabulary row keys, and refusing the title alone would
  still leave the header row corrupted); a real fix needs a way to tell
  two geometrically-overlapping, unrelated text layers apart (font, color,
  or z-order — none of which any code this file has read yet uses for this
  purpose) — a materially different, harder problem than title-block-field
  fabrication, not attempted here.
- **013_MO#20/#23's "SUSTAINMENT MAINTENANCE"** — re-checked live after the
  080_CA fix, confirmed still present and unaffected (correctly, since its
  source is the project title-block's own name field, not a row-keyed
  reference table this vocabulary mechanism reaches) — full context in
  B-32.

### B-31 — a real, correctly-titled table's row count is massively truncated (18 real rows reported as 2), and 4 more real tables vanish across the same document's 2 schedule pages (PARTIAL FIX 2026-09-14 — the transposed/group-divider truncation class closes; the 14_OR FAN COIL UNITS instance and a few unrelated 1-row gaps remain open)

**Where:** `14_OR_KlamathCC_LearningCtr_Mechanical.pdf`, both of its
schedule pages (M002/#2, M003/#3) — found continuing the HELDOUT set's
own missed-checking pass.

**Measured, page #2 (M002, mistagged `role: detail`).** Hand-confirmed 5
real tables: `FAN COIL UNITS` (18 rows, `FC-101` through `FC-210`,
confirmed exactly via `textSpans()`), `DEDICATED OUTDOOR AIR SYSTEM` (4
rows), `AIR COOLED CHILLER` (1 row), `HOT WATER CONDENSING BOILER` (2
rows), `EXHAUST FANS` (1 row) — 26 rows total. The extractor reports only
2 of these 5 tables: `HOT WATER CONDENSING BOILER` correct (2/2), but
`FAN COIL UNITS` reports `rows: 2` against 18 real rows — a **16-row
truncation on a table the extractor otherwise identifies and titles
correctly**, a new failure shape not seen elsewhere in this file (every
prior row-count bug in this catalogue either over-counts by 1-2 phantom
rows, B-26, or the whole table is present/absent — never a large
fraction of a correctly-titled table's own real rows silently dropped).
`DEDICATED OUTDOOR AIR SYSTEM`, `AIR COOLED CHILLER`, and `EXHAUST FANS`
are completely absent — 3 more real tables missing on the same page.

**Measured, page #3 (M003, correctly tagged `role: schedule`).** Hand-
confirmed 8 real tables (100 rows combined with page #2's real 26 —
126 across the document), using `textSpans()` coordinate counts for the
two dense tables: `HYDRONIC PUMPS` (8), `VENTILATION REQUIREMENTS` (38:
34 real room rows across 4 `DOAS-`-grouped zones plus 4 zone-subtotal
rows — genuinely includes `CLASSROOM 135` twice, confirmed as two
distinct real rows at different y-positions under different DOAS zones,
not a miscount), `SPLIT SYSTEM HEAT PUMPS` (4), `MAKE UP AIR UNITS` (1),
`HYDRONIC ACCESSORIES` (10), `AIR DISTRIBUTION` (9), `ELECTRIC HEATERS`
(3), `HEAT EXCHANGER` (1). The extractor finds 7 of these 8 — `AIR
DISTRIBUTION` (9 rows) is completely absent, confirmed via a full-JSON
title search, not misattached elsewhere. `VENTILATION REQUIREMENTS`
reports `rows: 40` against the true 38 — a 2-row phantom-overcount,
amended into B-26's own family below rather than re-described here. The
other 6 tables all match exactly.

**Relationship to already-catalogued bugs:** the `FAN COIL UNITS`
16-row truncation is a genuinely new bug shape — filed here rather than
folded into B-26 (which is exclusively small +1/+2 phantom-row
OVER-counts) because this is a large fraction of REAL rows silently
DROPPED from an otherwise correctly-identified table, the opposite
direction and a different likely mechanism (a row-extraction limit or
early-termination condition, not a stray adjacent line miscounted as
data). The `AIR DISTRIBUTION` and page #2's 3 missing tables are plain
missing-table cases, consistent with the general pattern already named
across B-16/B-19/B-25/B-28 but not attributed to any one of them without
further tracing.

`VENTILATION REQUIREMENTS`'s own 40-vs-38 phantom-row overcount is the
same small-overcount shape as B-26's other instances — amended there as
a 4th confirmed document rather than re-described here.

**Consequence for the HELDOUT set's own zero-error bar:** this document
fails MISSED=0 by 4 whole real tables (39 rows) plus a 16-row truncation
inside a 5th, correctly-titled table — the row-truncation shape is a new
and potentially serious failure mode worth prioritizing: it silently
under-reports a real table's own content without any signal (no missing
title, no absent table) that anything is wrong.

**CONFIRMED RECURRING 2026-09-13 — a 3rd document, and by far the most
severe instance of this truncation shape found yet, affecting nearly
every transposed table on one sheet.**
`21_VA_OrangeCounty_PublicSafetyBldg.pdf`, sheets M-601 (#50) and M-602
(#51) — found continuing the HELDOUT set's own missed-checking pass.

**M-601 (#50):** `AIR HANDLING UNIT SCHEDULE` (a transposed table, AHU-1/
AHU-2 as columns) hand-confirmed at **51 real rows** via `textSpans()`
(6 identification rows + 41 spec rows across COOLING COIL/SUPPLY FAN/
RETURN FAN/FILTER SECTION groups + 4 summary rows) — the extractor
reports `rows: 35`, a confirmed **16-row truncation** on a table it
otherwise titles correctly. The sheet's other table, `VAV TERMINAL BOX
SCHEDULE` (57 rows, one row per VAV unit), extracts exactly right,
confirmed via `textSpans()` designation-count.

**M-602 (#51), 10 transposed equipment-comparison tables, hand-confirmed
against the extractor's own reported counts (`textSpans()`-verified
where noted):** `AIR COOLED CHILLER SCHEDULE` **26 real → 11 reported
(-15, textSpans-verified)**; `UNIT HEATER SCHEDULE` **14 real → 4
reported (-10, textSpans-verified)**; `COMPUTER ROOM UNIT SCHEDULE` **24
real → 16 reported (-8, textSpans-verified)**; `BOILER SCHEDULE` 13 real
→ 11 reported (-2); `FAN SCHEDULE` **12 real → 11 reported (-1,
textSpans-verified)**; `AIR COOLED CONDENSING UNIT SCHEDULE` 10 real →
9 reported (-1); `DUCTLESS SPLIT SYSTEM UNIT SCHEDULE` 9 real → 8
reported (-1); `PUMP SCHEDULE` 16 real → 15 reported (-1); `AIR
DISTRIBUTION DEVICE SCHEDULE` 8 real → 7 reported (-1); `RELIEF /
EXHAUST HOOD SCHEDULE` 7 real → 6 reported (-1). **Every single one of
the 10 tables on this sheet under-counts — never over-counts, never
exact** — with the truncation magnitude tracking table density (the
3 densest tables lose 8-15 rows each; the 7 simpler ones each lose
exactly their own trailing `REMARKS` row).

**Relationship to already-catalogued bugs:** confirms this bug's own
"large fraction of a correctly-titled table's real rows silently
dropped" shape a 3rd time, and sharply narrows it: every affected table
across both confirmed documents (14_OR, this one) is **transposed-
format** (attributes as rows, equipment units as columns) — this bug's
original `FAN COIL UNITS` instance was a per-unit-row table, so the
shape isn't exclusively transposed, but this sheet's unanimous,
density-scaled under-count on 10/10 transposed tables is the first
evidence that transposed layout specifically, and independently of
absolute row count, correlates with SOME truncation (every table here
lost at least its `REMARKS` row, even the smallest ones) — with the
severity scaling with the number of attribute-rows once a table is
dense enough. Root-causing should check whether the transposed reader
path has an off-by-N or an early-termination condition keyed to
row-group count or table height, independent of this bug's original
per-unit-row `FAN COIL UNITS` case.

**Consequence for the HELDOUT set's own zero-error bar:** this is the
single worst MISSED-count failure found in the HELDOUT pass to date on
a per-sheet basis — 11 of 12 real tables across 2 sheets have a wrong
row count, totaling roughly 40 real rows silently dropped from an
otherwise well-titled, well-classified set of tables.

**ROOT-CAUSE TRACE (2026-09-13, code-level, no fix applied yet — see
below for why):** traced live against
`21_VA_OrangeCounty_PublicSafetyBldg.pdf#50`'s own `AIR HANDLING UNIT
SCHEDULE` via temporary instrumentation in
`web/src/lib/sheetgraph.ts`'s `scheduleTableFromODL` (added, exercised,
then fully reverted — no debug code left in the tree). Two independent
findings, confirmed by direct print of the real ODL grid this table
produces:

1. **The table's own header row carries a genuine duplicate column.**
   `headers` comes back as `["DESIGNATION", "DESIGNATION 2", "AHU-1",
   "AHU-2"]` — TWO columns both header-labeled "DESIGNATION" (the
   second is this file's own duplicate-header disambiguation suffix,
   confirmed at `sheetgraph.ts:10500-10505`, doing exactly what it's
   built to do: rename a repeat, not explain why the ODL grid handed it
   a repeat in the first place). `keyColIdx` (`sheetgraph.ts:10508`)
   matches the FIRST "DESIGNATION" it finds via `headers.findIndex`,
   landing on column 0 — but the real, single-column row-label text a
   person reads off the page (`TOTAL LOAD - MBH`, `SENSIBLE LOAD -
   MBH`, …) is a genuine two-column split artifact this table's own
   narrow rotated row-GROUP divider (`COOLING COIL`/`SUPPLY FAN`/
   `RETURN FAN`/`FILTER SECTION`, drawn in its own thin sub-column to
   the left of the attribute names) creates in ODL's own grid — column
   0 is real content on SOME rows (the identity block at top, the 4
   category dividers, the 3 summary rows at bottom — confirmed exactly
   15 non-blank cells via `textSpans()` x-band isolation) and blank
   on the ~36 rows in between, whose real attribute name in fact sits
   one column over. `rowKeyOf` under `kind==="finish"` (this table's
   kind, per the "reference" classification) requires a `CODE_RE`-
   shaped tag; measured directly, exactly 1 of those 15 real column-0
   values (`REMARKS:` → `REMARKS`, 7 letters, an accidental match —
   `CODE_RE`'s own `[A-Z]{1,4}[A-Z0-9]{0,4}` alternative has no hyphen
   requirement and happens to also accept any short, no-hyphen,
   ≤8-letter English word) clears it on the strict pass.
2. **But the strict pass recovers 24 rows, not 1** — confirmed by direct
   instrumentation (`rows.length(strict)=24` before any fallback runs)
   — meaning column 0 in the REAL ODL grid carries more, and different,
   text than the clean 15-value transcription above accounts for; this
   was not fully resolved before the debug instrumentation was reverted
   (see below). The subsequent `printedKeys=true` retry against the
   SAME strict column (the "table has already proven its own key
   column" rescue, `sheetgraph.ts:10946-10948`) brings the total to the
   observed 35 — meaning the eventual 16-row loss is real rows that
   never got a printed-key match under EITHER pass on column 0, most
   plausibly rows whose true identity sits in the "DESIGNATION 2"
   column this scan never tries. The final
   `if (!rows.length) { findEvidencedKeyColumn(); … }` rescue
   (`sheetgraph.ts:10952-10955`, which — checked directly against this
   table's real row-label text — would very likely pick the RIGHT
   column, since it requires ≥50% row coverage and column 0's real
   ~29% coverage should fail that bar in column 0's favor) never runs
   at all here, because `rows.length` is already nonzero (35) after the
   two column-0 passes, and that rescue is gated on `!rows.length`
   strictly.

**Why this is disclosed without a fix:** a real fix needs to reconcile
column 0's own actual (not assumed) content with the "DESIGNATION 2"
column's real content, decide which single column (or composed pair)
is this table's true row identity, and do so without breaking any of
the many other real, corpus-tuned uses of `rowKeyOf`/`keyColIdx`/
`findEvidencedKeyColumn` this same 11,000-line file already depends on
— each guarded by its own extensively-documented, corpus-measured
regression history (see this file's own header/row-key comments
throughout `sheetgraph.ts:3828-4007`, `10500-10956`). Given this
session's own standing rule against guessing at fixes under time
pressure, and the real risk of a narrow, insufficiently-verified change
silently regressing a different real table somewhere else in a 541+
document corpus, this trace is recorded here as the concrete starting
point for a future session with the budget to (a) dump the REAL column
0/1 content for this exact table cell-by-cell, (b) decide the right
column-selection rule, and (c) run it against the full corpus gate
before merging — not attempted here.

**TRIED AND REVERTED (2026-09-13, same day): the obvious "swap keyColIdx to
whichever duplicate-header sibling has more coverage" fix makes this exact
table dramatically WORSE, not better — a real, disclosed negative result
so a future session does not repeat it.** Implemented a narrow, targeted
override (only touches columns that already share one pre-disambiguation
header label, gated on the current pick covering under 50% of `dataRows`
and a sibling covering at least 50%) and traced it live against this exact
table: it correctly diagnoses the shape (`DESIGNATION` at 23.5% coverage,
`DESIGNATION 2` at 96%, `dataRows.length=51` — matching this entry's own
hand-count almost exactly) and correctly swaps `keyColIdx` from column 0 to
column 1. **But the swap collapses the table from 33-35 rows to 1.** Traced
why with the same live instrumentation: `DESIGNATION 2`'s real per-row text
(`"TOTAL LOAD - MBH"`, `"MOTOR HP"`, …) almost entirely fails `rowKeyOf`'s
strict `CODE_RE` gate (it is prose, not a catalog tag), so the strict pass
on the new column recovers ~1 row; the "TRY BOTH" rescue then calls
`findEvidencedKeyColumn()` as this entry's own earlier trace hoped it
would — and it returns **nothing**, disproving that hope: several attribute
names genuinely repeat verbatim across this table's own different
equipment groups (`MOTOR HP`, `RPM`, `BHP`, … appear under BOTH the SUPPLY
FAN and RETURN FAN sections), so column 1 fails the single-column
uniqueness test, and the composite-pair search also fails because column 0
(the only column that could disambiguate SUPPLY FAN from RETURN FAN) has
its own group-name text on the divider row alone, not carried down as a
rowspan across the attribute rows beneath it — so pairing column 0 with
column 1 does not make attribute rows distinct either. **Reverted in full**
(`git checkout -- web/src/lib/sheetgraph.ts`), confirmed byte-identical to
before, no debug instrumentation left in the tree.

**What this rules in for whoever fixes this next:** a correct fix cannot
be a column-selection heuristic alone. It needs the missing piece this
trace surfaces for the first time — propagating each group-divider row's
own label (`"SUPPLY FAN"`, `"RETURN FAN"`, …) down to every attribute row
beneath it until the next divider (the identical shape `buildRows`'s own
section-header skip, `sheetgraph.ts:10634-10658`, currently DROPS rather
than propagates), so the real per-row identity becomes the composite
`(nearest-divider-label, attribute-name)` pair — genuinely distinct even
when the attribute name alone repeats across groups. That is a change to
row-group handling, not key-column selection, and touches the same shared,
corpus-tuned function every other bug in this section warns about — still
correctly left to a future session with the budget for a full corpus
regression pass, now with the wrong approach ruled out in evidence rather
than by inference.

**FIX (2026-09-14) — exactly the "propagate the divider label" approach
above, done as a strictly ADDITIVE rescue, not a key-selection change.**
Traced live (temporary instrumentation, added then fully reverted) exactly
what this table's group dividers look like in the real ODL grid, and the
original theory above was subtly wrong about their SHAPE: "COOLING COIL"/
"SUPPLY FAN"/"RETURN FAN"/"FILTER SECTION" are NOT full-width spanning
rows (the shape `buildRows`' own existing spanning-row skip recognizes) —
each is a NARROW cell in the key column alone (`"column span": 1`) that is
TALL instead (`"row span"` 3-4), sitting beside real, distinct per-row
attribute text in the sibling column for every row it covers. A first
implementation using the (wrong) full-width-row shape detected zero
dividers and changed nothing; corrected to the real signal — **a row whose
own key-column cell spans more than one row is a group label for every row
underneath it, not that row's own identity** — and propagating it forward
past both the divider's own rowspan AND the plain rows after it (this
table prints "SUPPLY FAN" once across 4 grid rows, but the group's real
attributes continue for 6 more rows with a blank key-column cell before
"RETURN FAN" appears) is what makes `(group, attribute name)` composite
keys distinct even when the bare attribute name repeats verbatim across
groups (confirmed: "DRIVE TYPE", "(NO. OF MOTORS) @ HORSEPOWER", "VOLTAGE/
PHASE" all appear under both SUPPLY FAN and RETURN FAN).

Implementation, `web/src/lib/sheetgraph.ts`: (1) the header-dedup step
that already renames a repeated header ("DESIGNATION" → "DESIGNATION 2")
now also records which real columns shared a label, in a new
`headerSiblingGroups` map — read-only bookkeeping, no behavior change on
its own; (2) a new `groupLabelForRow` pass over the raw grid records, for
every data row, the nearest group-divider label above it (by the row-span
signal above), read-only and used only by the rescue below; (3) after
every existing key-selection pass has run (strict CODE_RE, the evidenced-
column "try both" pass, the same-column printed-key missing-row rescue),
a new final rescue: for any row STILL unemitted, if a group label is
active for it and the key column's own duplicate-header sibling column
(from step 1 — never an arbitrary other column) has real text there,
compose `${group} ${siblingText}` and admit it as a new row's key,
subject to the same no-duplicate-keys invariant every other rescue in
this function already enforces. A table with no group-divider rows, or
whose key column has no duplicate-header sibling, is completely
unaffected — this rescue can only ever ADD a row that was previously
being silently dropped; it never changes an already-emitted row's key.

**Verified live, not assumed:** `21_VA_OrangeCounty_PublicSafetyBldg.pdf#50`'s
`AIR HANDLING UNIT SCHEDULE` — a real 51-data-row table (confirmed via the
same instrumentation's own `dataRows` count) — goes from 33 rows (baseline,
this session's committed code before this fix) to **50 rows** after. The
one still-missing row (`"MINIMUM OUTDOOR AIR - CFM / DEMAND CONTROL
VENTILATION MINIMUM - CFM"`) is a pre-existing, unrelated gap — it carries
no group label at all (a genuine single-row identity value, column-span 2)
and was already missing before this fix; not touched by this change.
`21_VA_OrangeCounty_PublicSafetyBldg.pdf#51`'s `AIR COOLED CHILLER
SCHEDULE` (this document's other confirmed instance of this bug shape)
goes from 11 rows to **20 rows** (real count not independently re-hand-
verified this pass, but the fix's own mechanism is identical). Every
OTHER table on both sheets — including `VAV TERMINAL BOX SCHEDULE`
(unaffected at 32 rows both before and after, a number that does not match
this entry's own earlier "57 real rows, extracts exactly right" claim —
flagged here as a discrepancy to re-verify, not silently reconciled) and
the 9 other M-602 tables — is byte-for-byte unchanged.

**Regression, corpus-wide:** all 231 `sheetgraph.test.ts`/
`vectorTakeoffPipeline.test.ts`/`scheduleLanguageScan.test.ts`/
`tableExtractorReconcile.test.ts`/`schedulePlanReconcile.test.ts`/
`vectorGridAdapter.test.ts` tests pass, `tsc --noEmit` clean. Live-checked
against 3 more real documents this same session had no reason to expect
this rescue to touch — `093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_
Upgrades.pdf` (11 pages, 7 tables) and `28_WA_KCHA_PublicHousing_HVAC.pdf`
(9 pages, 4 tables) — full before/after JSON diff on every table's own
row keys: byte-for-byte identical (the only diff in either file was a
runtime-variance timing string, not table content).

**What remains open:** `14_OR_KlamathCC_LearningCtr_Mechanical.pdf`'s own
original `FAN COIL UNITS` instance (18 real rows reported as 2) is a
PER-UNIT-ROW table, not a transposed/group-divider one — a different
mechanism this fix does not touch, not re-investigated this pass. Any
other 1-row-under-real-count gaps on 21_VA's own M-602 sheet not
attributable to a group divider (most of its 10 tables lost exactly one
trailing `REMARKS` row each, per this entry's own original measurement)
remain open too — this fix only recovers rows whose true identity was
hidden behind a group-divider collision, not every kind of row loss named
in this entry.

**ROOT CAUSE OF THE `FAN COIL UNITS` INSTANCE NOW CONFIRMED 2026-09-14
(code-level, precise — not fixed, same corpus-wide gate as B-27/B-37).**
Traced live (`qpdf`-sliced page 2 alone, `OPENTAKEOFF_GRAPH_TRACE=1`):
the sheet's own trace shows `"L1.8:vectorgrid":0` ms — vectorgrid never
ran on this sheet at all, the identical signature already confirmed for
B-27 and B-37. The sheet's own role classifies `detail` at confidence
0.3 (a low-confidence guess, not `schedule`), and `isScheduleTarget`
(`vectorTakeoffPipeline.ts:177`) only offers a non-`schedule`-role sheet
to vectorgrid when its own printed caption clears `sheetHasScheduleCaption`
or `sheetHasPointsListCaption` — confirmed by direct `textSpans()`
measurement that this table's own real caption is the literal string
`"FAN COIL UNITS"`, with no occurrence of the word `SCHEDULE` (or a
points-list marker) anywhere near it on the page. Unlike B-27's own
gap (a caption that DOES contain `SCHEDULE`, just not as a trailing
word), no substring-based widening of `SCHEDULE_CAPTION_RE` could ever
admit this caption — it contains the word nowhere at all. With
vectorgrid never offered the sheet, the reported `rows: 2` comes from
an older, pre-vectorgrid extraction stage instead — the exact
degradation this codebase's own `isScheduleTarget` comment already
warns about by name (citing `13_MI#10`: "the geometric extractor's
older read — 3 of the table's 7 columns... while vectorgrid on that
same page returns all 7 columns").

**Proof the fix is real and available, not theoretical:** called
`bakeoff/vectorgrid.py`'s own `find_tables()` and `sidecar/
vectorgrid_rpc.py`'s own `extract_grid()` directly against this exact
page, bypassing `isScheduleTarget` entirely. Vectorgrid's own raw
geometry finds a 21x33 grid at this table's own region, and the
resulting cell text contains ALL 18 real equipment tags this entry's
own hand-count named (`FC-101` through `FC-109`, `FC-201` through
`FC-210` except `FC-205`, a genuine gap in the source document's own
equipment numbering, not a defect) — conclusive proof that vectorgrid
itself reads this table correctly and completely; the entire defect is
the routing gate that never lets it try.

**Why this is disclosed without a fix.** This is a 3rd confirmed
instance of the same `isScheduleTarget`/caption-gate family already
named in B-27 and B-37, and B-27's own pass already measured, with hard
numbers, exactly why widening this shared gate is dangerous without a
full corpus sweep (a candidate `SCHEDULE...FOR...` widening false-
positived 65 of 318 real corpus lines, ≈20%, for one genuine recovery).
This instance's own caption doesn't even contain "SCHEDULE," so the
needed fix is structurally different — likely either improving
`classifySheetRole`'s own confidence for this sheet shape, or a new,
non-caption-text structural signal (e.g., the sheet's own printed
column headers independently clearing `ALL_HEADER_WORDS_ARR`'s
vocabulary bar even with no "SCHEDULE" caption) — and neither was
designed or attempted here, per this session's own standing rule
against widening a shared, corpus-wide routing gate without the same
corpus-wide false-positive measurement B-27's own pass already proved
essential. Recorded as a precise, now fully-diagnosed next step, not an
open mystery: the exact gate, the exact reason this specific caption
shape defeats it, and direct proof vectorgrid's own extraction is
already correct and waiting to be reached.

### B-32 — BOILERS and PUMPS are both consumed by a vectorgrid face-weld (2 confirmed instances, one document), a real table splits into two duplicate-titled fragments, and column-header text is fabricated into table titles (NOT FIXED — found, traced, corrected, disclosed)

**Where:**
`013_MO_T2523_01_Replace_Boilers_Phase_2_Building_29.pdf`, both of its
schedule pages (M-320/#20, M-500/#23) — found continuing the HELDOUT
set's own missed-checking pass. Ironic given the project's own name: the
one table the pipeline most needs to get right here, `BOILERS`, is one
of the ones it drops.

**Measured, page #20 (M-320).** Hand-confirmed 3 real tables:
`CONTROL VALVES` (3 rows), `FLOW METER DEVICES` (3 rows), `TYPICAL
BOILER BACnet/MSTP SOFTWARE POINTS LIST` (25 rows, a BAS point-list
table). The extractor's own output: `CONTROL VALVES` matches (3/3);
`FLOW METER DEVICES` reports `rows: 4` against 3 real (a 1-row
overcount, same family as B-26); `TYPICAL BOILER BACnet/MSTP SOFTWARE
POINTS LIST` is **completely absent** — 25 real rows gone; and a
fabricated `"SUSTAINMENT MAINTENANCE"` table (`rows: 2`) appears,
lifted from the sheet's own title-block project-name text ("1107TH
THEATER AVIATION SUSTAINMENT MAINTENANCE GROUP") — the same title-block-
fabrication mechanism as B-29/B-30, a 3rd confirmed document (amended
into B-30 below rather than re-described here).

**Measured, page #23 (M-500).** Hand-confirmed 6 real tables:
`VARIABLE FREQUENCY DRIVE SCHEDULE` (1 row), `GAS CONNECTED LOAD TABLE`
(4 rows, including its own total row), `HYDRONIC SPECIALTIES SCHEDULE`
(a single-system attribute/value spec sheet, ~22 real attribute rows),
`HVAC PIPING MATERIAL SCHEDULE` (3 real data rows), `PUMPS` (1 row),
`BOILERS` (8 rows — the project's own namesake equipment). The
extractor's own output is badly garbled:
- `PUMPS` and `BOILERS` are **both completely absent** — the entire
  primary equipment schedule for a boiler-replacement project is
  invisible to the pipeline.
- `HVAC PIPING MATERIAL SCHEDULE` appears **twice**, `rows: 1` and
  `rows: 3` — the same real table (3 real data rows) split into two
  separate reported entries under the identical title, the OPPOSITE
  direction from B-28's title-collision (which merges two DIFFERENT
  real tables into one; this splits ONE real table into two).
- A fabricated `"CAPACITY (GAL)"` table (`rows: 9`) and a fabricated
  `"DIA. (in)"` table (`rows: 1`) both appear — neither is a real table
  title; both are column-header text lifted from deep inside the
  `HYDRONIC SPECIALTIES SCHEDULE`/`PUMPS` tables' own header rows
  (`"CAPACITY (GAL)"` is the `SHOT FEEDER` row group's own column
  header; `"DIA. (in)"` is the `PUMPS` table's `IMPLR DIA. (in)` column
  header) and fabricated into standalone table titles — a genuinely new
  title-fabrication SOURCE (an internal column header, not adjacent
  prose or a title-block stamp) distinct from B-16/B-29/B-30's own
  fabrication sources.
- A second `"SUSTAINMENT MAINTENANCE"` fabrication (`rows: 3`) appears,
  same mechanism as page #20's instance.
- `VARIABLE FREQUENCY DRIVE SCHEDULE` reports `rows: 3` against 1 real
  row, and `GAS CONNECTED LOAD TABLE` reports `rows: 5` against 4 real
  — both further phantom-row overcounts, B-26's own family.

**Relationship to already-catalogued bugs:** the `"SUSTAINMENT
MAINTENANCE"` fabrication is B-29/B-30's own title-block mechanism, a
3rd confirmed document (amended into B-30). The `HVAC PIPING MATERIAL
SCHEDULE` table-split is a new, previously unseen shape — not
B-28 (which merges two real tables), the reverse: one real table
reported as two. The `"CAPACITY (GAL)"`/`"DIA. (in)"` fabrications are
a new title-fabrication SOURCE (internal column-header text, not prose
or a stamp) — related in spirit to B-16/B-29/B-30 (something other than
a table's own real title becomes its reported title) but distinct
enough in mechanism to flag separately for whoever roots this out. The
complete disappearance of `PUMPS` and `BOILERS` — the project's own
central equipment — is the single most consequential missing-table
finding of this document, consistent with the general missing-table
pattern (B-16/B-19/B-25/B-28/B-31) but not attributed to one specific
mechanism without further tracing.

**Consequence for the HELDOUT set's own zero-error bar:** this document
fails MISSED=0 by 2 whole real tables (33 rows, including the project's
own namesake `BOILERS` equipment) plus a garbled, duplicated, and
partially-fabricated report on 4 more tables — the worst combination of
failure shapes measured on a single document this session.

**CORRECTED 2026-09-13, same day: the `"DIA. (in)"` phantom is not a bare
title-fabrication on an otherwise-uninvolved candidate — it IS the
missing `BOILERS` table itself, badly garbled, not a separate
mechanism.** Traced live (`OPENTAKEOFF_GRAPH_TRACE=1`, then a rendered
crop of the real page at the candidate's own region): the `"DIA. (in)"`
table's own `headers` are unmistakably `BOILERS`'s real columns (`MARK`,
`SERVICE`, `FUEL TYPE`, `FLOW (GPM)`, ..., `MANUFACTURER & MODEL`), and
the render confirms a genuine, cleanly-ruled 18+ column `BOILERS`
schedule sits at those exact coordinates with 8 real data rows — this
candidate's real region is correct, its column set is correct, but its
`rows` array holds exactly **one** garbage row, not 8: every cell's own
text is several real values concatenated together
(`"SERVICE"`: `"1000 *SEE SEQUENCE SHEET 1. VIBRATION SPRING ISOLATORS
MOUNTS 4. MOTORIZED GAS VALVE"`) rather than one real per-row value. The
render explains why: several of `BOILERS`'s own real cells carry a tiny
superscript footnote-reference digit inline with their value (`7-14"¹`,
`4"/4"²`, `10"³`, `20/3P⁵`), referencing a real, separate `ACCESSORIES:`
notes list of 5 numbered items printed directly below the table (no
visible gap/rule the reader's own block-boundary logic apparently
respects) — the SAME diseased shape B-16 names for two side-by-side
prose lists, here one prose list glued onto the BOTTOM of a real ruled
table instead of beside another list. The notes list's own numbered
items got absorbed as if they were additional table content, and
whatever collapsed the real 8 rows into 1 composite garbage row is not
yet isolated (plausibly the same block/row-boundary confusion, not a
separate defect) — not traced further under this pass. The `"CAPACITY
(GAL)"` phantom (from `HYDRONIC SPECIALTIES SCHEDULE`) was NOT re-checked
against its own render under this pass and may or may not share this
exact mechanism; do not assume it does without the same live check.

**Why this raises this bug's own priority, not just its precision:** a
project's own namesake equipment schedule is not merely ABSENT (a
recall gap) — it is present, correctly located, with the right columns,
and destroyed at the row level by an adjacent notes list the reader
never learned to stop at. The real fix likely lives in the same family
as B-16's own disclosed need (a structural discriminator for "a
repeating LABEL + LONG PROSE SENTENCE block is not more table rows",
whether beside or below a real table) — worth root-causing together
rather than as two separate efforts, given this session's own standing
rule against guessing at either without first measuring the shared
signal precisely. Not fixed; disclosed with a corrected, much more
specific mechanism than "column-header text fabricated into a title".

**UPDATE 2026-09-13, same day: the deeper reason `BOILERS` never reached
vectorgrid at all is now fixed — see B-43.** This page's own vectorgrid
run was silently disabled entirely (a CropBox/MediaBox page-box
mismatch, `vectorgrid.py` measuring the wrong box), forcing every table
on it through the strictly weaker geometric fallback this entry's own
garbled-row trace describes. With B-43's fix, `BOILERS`'s own row count
is now correct (8/8), and the `HVAC PIPING MATERIAL SCHEDULE` split
closes — but this document also carries a SEPARATE, independent,
not-yet-root-caused defect (genuine duplicate/double-struck text in its
own source, confirmed directly via PyMuPDF's raw word list) that still
corrupts `GAS CONNECTED LOAD TABLE` and `VARIABLE FREQUENCY DRIVE
SCHEDULE` even after B-43. `PUMPS`'s own complete absence, and the
title-fabrication/misclassification mechanisms this entry names, are
UNCHANGED — B-43 does not touch them. Full accounting in B-43; this
document is closer to correct but still not clean.

**ROOT CAUSE CORRECTED 2026-09-14 — the "duplicate/double-struck text"
theory above is wrong; re-measured live and it is a vectorgrid face-
weld, the same disease family as B-32's own `073_MT` sliver precedent,
just at a much smaller scale.** Re-checked the "genuine duplicate/
double-struck text" claim directly: a page-wide PyMuPDF near-duplicate-
word scan (same text, bbox within 2pt) finds exactly 2 pairs on this
whole page, neither anywhere near `GAS CONNECTED LOAD TABLE` — that
theory does not hold up.

What is actually happening, confirmed by calling `vectorgrid.py`'s
`find_tables()` directly and rendering both real tables' own regions:
`GAS CONNECTED LOAD TABLE` (a real, small, 2-column/4-row box,
`(159.6,435.5)-(581.7,633.4)` cropbox-relative pt) and `HYDRONIC
SPECIALTIES SCHEDULE` (a real, separate, ~30-row attribute/value box,
`(163.9,692.6)-(586.0,1203.6)`) sit only **59.2pt apart** — a real,
visible gap, but a short one. `find_tables()` reports these as ONE
362-cell table spanning both boxes end to end. This is exactly the
mechanism the file's own `073_MT` comment names ("the blank sheet
BETWEEN two stacked blocks... welds them exactly as a sliver does") —
but that guard (`MAX_CELL_HFRAC`) is sized for the LARGE gaps in that
precedent (270-341pt); a 59pt gap between two schedules stacked in the
same column is comfortably under it, so the connecting blank face
survives and the union-find adjacency step glues both real tables
together with no border-weight wall to stop it (there is no drawn rule
in the gap at all — nothing for the wall test to catch). Downstream,
whatever assembles this bloated candidate's headers concatenates text
across far more rows/columns than either real table has, producing the
`headers` array's own visibly cumulative, ever-growing garbage strings.
The `"COMBINATION IN EXISTING BUCKET WITH OVERLOADS HVAC HVAC PIPING
WITHIN PIPING MATERIAL MCC MATERIAL SCHEDULE SCHEDULE"` hybrid title
(mixing electrical/VFD text with `HVAC PIPING MATERIAL SCHEDULE`,
repeated twice) on this same page is consistent with the identical
mechanism applied to a different close-stacked pair, though not traced
to the same pt-level precision here.

**Not fixed.** A general fix (tightening `MAX_CELL_HFRAC` for a short
blank connecting face, or extending the existing `cols_of`/`_row_agree
ment` column-divergence test — already used to merge BACK over-eager
weight cuts — to also REFUSE a union across an unruled gap when the two
sides' own column sets diverge) touches every table in the corpus and
needs the same before/after corpus-wide validation B-27's rejected
threshold change was held to before it can ship; not attempted under
this pass's budget. Filed as the corrected, precisely-measured root
cause replacing the "duplicate/double-struck text" theory above, which
does not survive a direct re-check.

**A 2nd confirmed instance, same document, even tighter gap — `PUMPS`'s
own "genuine absence" is corrected too: it is not missing, it is
consumed by the identical face-weld, merged into `BOILERS`.** Traced
live the same way: rendered `PUMPS`'s own real region (a small, real,
ruled box — `MARK`/`LOCATION`/`SERVES`/`GPM`/`HEAD`/… headers, one real
`HHW CTP` data row, a `REMARKS:` list inside the same box) and measured
its own bottom rule against `BOILERS`'s own top rule via `page.lines`:
**≈20pt apart**, tighter than the `GAS CONNECTED LOAD TABLE`/`HYDRONIC
SPECIALTIES SCHEDULE` gap above. The extractor's own `"DIA. (in)"`
phantom (previously measured as BOILERS' own 8 real rows under one
badly garbled composite header, back when B-43's CropBox fix was first
verified) now has **79 columns** — a mix of `PUMPS`'s own real headers
(`GPM`, `HEAD`, `IMPLR`, `NPSHR`, `VOLT/PH/HZ`, `RPM`, `MANUFACTURER`,
`MODEL`) interleaved with `BOILERS`'s own (`BOILERS`, `EFF.`, `%`,
`COL1`…`COL78` fallback fill for the rest) — and its `rows` are pure
wreckage (`"PD"`, `"MARK"`×3, `"HHW"`×3, `"SEQUENCE"`). This is not a
second, independent bug: it is the SAME `find_tables()` union-find
weld this entry already root-caused, recurring a 2nd time within one
document at an even smaller gap — real, corpus-found evidence that this
disease is not a one-off, and any eventual general fix's corpus-wide
validation pass should specifically include this document as a
2-instance case, not just the 1-instance case above. `PUMPS`'s own
"genuinely missing" framing in this entry's original write-up is
retracted: it is present, correctly drawn, and destroyed the same way
`GAS CONNECTED LOAD TABLE` was — not a separate missing-table defect at
all. Not fixed, same reasoning as above.

**ATTEMPTED 2026-09-14 — investigated a narrow post-hoc "un-weld" fix
(split a welded candidate back into two at the blank connecting band,
mirroring `vectorGridAdapter.ts`'s own SPLIT-FRAGMENT RECOVERY in
reverse), specifically to avoid touching `find_tables()`'s own shared
union-find core. Not shipped — the real per-row cell data for BOTH
instances is meaningfully messier than this entry's own "two stacked
blocks welded at one blank band" model, and a safe, narrow split rule
cannot be written against it.**

Pulled the raw welded candidate's own per-row/per-column membership
directly via `vectorgrid_rpc.extract_grid()` for both instances (no
code changed, pure measurement):

- The `GAS CONNECTED LOAD TABLE`/`HYDRONIC SPECIALTIES SCHEDULE` weld
  (79 rows × 12 cols, 362 cells) does have a real blank band at rows
  13-14 separating the two source tables — but the `HYDRONIC` half
  ITSELF (rows 15-78) is not one clean column-consistent block on its
  own: its own row-by-row column membership ALTERNATES between two
  different column sets almost every row (`cols=[3,5,8]` then
  `cols=[1,3,5,8,11]` then back, repeating) — consistent with two
  further sub-schedules (e.g. separate systems/zones) themselves
  interleaved by the SAME column-clustering distortion, not a single
  clean second table. A split rule that only knows to cut at the one
  blank band would recover two pieces, neither of which is a clean,
  correctly-keyed table on its own.
- The `PUMPS`/`BOILERS` weld (10 rows × 79 cols, 290 cells) is worse:
  there is no clean two-block structure to find at all. Row-by-row
  column coverage swings wildly (`col_range 0-77`, then `4-77`, then a
  single stray column, then `0-78`...) — confirming this instance
  compounds the weld with the SEPARATE footnote/notes-list corruption
  this entry's own earlier trace already found for `BOILERS` alone, not
  a second clean instance of the simple weld shape.

**Why this stays disclosed, not fixed.** A safe post-hoc split needs the
welded candidate to actually decompose into two internally-consistent
pieces at the point of the cut; neither real instance does. Writing a
splitter that "works" against this specific tangled data without also
firing on a genuinely single, correctly-drawn multi-tier table elsewhere
in the corpus (the same false-positive risk this file's own B-27 pass
already measured for a different gate) is not something this session's
own discipline permits without the fix actually working cleanly on its
own two cited cases first — and it does not. The real fix most likely
needs to happen inside `find_tables()` itself (a genuinely different,
larger-scope column-clustering defect distinct from the weld this entry
already names), not as a downstream patch — consistent with, and now
more precisely measured than, this entry's own standing "touches every
table in the corpus, needs a full validation pass" caution.

### B-33 — a real table is reported twice under its own identical title, and an untitled phantom table appears alongside it (RE-VERIFIED 2026-09-14 — ALL THREE documented instances now fully closed, as a side effect of this session's own B-38/B-31 fixes)

**Where:**
`023_US_Chiller_Replacement_at_U_S_Salinity_Laboratory.pdf#8` (sheet
M002, "MECHANICAL SCHEDULES") — a small, otherwise clean 3-table sheet,
found continuing the HELDOUT set's own missed-checking pass.

**Measured:** the sheet carries exactly 3 real tables, all correctly
extracted: `AIR COOLED CHILLER SCHEDULE` (1 row), `BUFFER TANK SCHEDULE`
(1 row), `PUMP SCHEDULE` (1 row, `CHWP-1&2`). But the extractor's own
output lists **5** tables for this sheet: the 3 real ones, PLUS a
second `PUMP SCHEDULE` entry (also `rows: 1`, `kind: reference` instead
of `equipment`) that duplicates the real one under its own identical
title, and PLUS an untitled (`title: ""`) 4-row table with no visible
real counterpart anywhere on the rendered page — likely fabricated from
the sheet's own title-block sub-grid (`PROJ. MANAGER`/`DRAWN BY`/
`CHECKED BY`/`CONTRACT NO.` field-label rows, a 4-row grid in the same
corner of every sheet in this set).

**Relationship to already-catalogued bugs:** the duplicated `PUMP
SCHEDULE` is a new shape — not B-29 (which merges two DIFFERENT real
tables into one under a fabricated title) but the mirror case: ONE real
table reported TWICE under its OWN correct title, with a different
`kind` on the duplicate (`reference` vs the original's `equipment`),
inflating this sheet's real table count by one. The untitled 4-row
phantom is consistent with B-29/B-30's title-block-fabrication family in
spirit (spurious content sourced from the sheet's own furniture) but
with an empty rather than fabricated-string title, so filed alongside
rather than merged into either.

**Consequence for the HELDOUT set's own zero-error bar:** an otherwise
perfectly-extracted 3-table sheet fails the false-positive-free half of
the bar with 2 additional phantom entries — a real table double-counted
and an untitled fabrication, on a document whose actual HVAC content is
completely clean.

**CONFIRMED RECURRING 2026-09-13 — a 2nd document, exact duplicate this
time.** `071_ME_BGS_Project_3809_Health_Science_Center.pdf#44`'s
`DUCTLESS SPLIT SCHEDULE` (a real, transposed-format table — 1 real unit,
`AC-1`, as a column with its own attribute rows down the side) appears
TWICE in the extractor's own output, both times with the identical
title AND identical `rows: 21` AND identical `kind: reference` — an
exact duplicate this time, not a `kind`-mismatched one like the first
instance. The sheet's OTHER transposed-format table, `PACKAGED ROOF TOP
UNIT SCHEDULE` (3 real units as columns), extracts once with a
plausible attribute-row count (`rows: 46`) — real evidence that
transposed-format tables do NOT always zero-extract (contrast B-25's
own transposed-table finding), so this document's transposed layout is
not itself the trigger for either the duplication above or B-25's
blackout elsewhere.

**CONFIRMED RECURRING 2026-09-13 — a 3rd document, untitled-phantom half
only.** `21_VA_OrangeCounty_PublicSafetyBldg.pdf#50` (sheet M-601,
"SCHEDULES I") reports an untitled (`title: ""`) 2-row phantom table
alongside its 2 real tables (`AIR HANDLING UNIT SCHEDULE`, `VAV TERMINAL
BOX SCHEDULE`). Traced via `textSpans()` region dump to the sheet's own
title-block field grid in the bottom-right corner (`COMM NO:`, `DATE:`,
`DRAWN:`/`DESIGN:`, `CHECK:` label/value pairs) — the same "sheet's own
furniture fabricated into a phantom" mechanism this bug's original entry
describes, with an empty rather than fabricated title, matching this
document's own precedent exactly rather than 098_ID/080_CA/013_MO/12_MT's
fabricated-title variant (filed under B-30). No duplicated-table half
this time — both of this sheet's real tables appear exactly once each
(row-count correctness aside, see B-31's own amendment below for the
`AIR HANDLING UNIT SCHEDULE`'s separate row-truncation defect on this
same sheet).

**FIX 2026-09-13 — the original document's untitled-phantom half
closed.** Same `TITLE_BLOCK_ROW_LABELS`/`isTitleBlockRowLabel` mechanism
already extended for B-30's own 12_MT instance, generalized further:
this document's title-block fields print as ONE glued run per cell —
`"PROJ. MANAGER: Designer"`, `"DRAWN BY: Author"`, `"CHECKED BY:
Checker"`, `"CONTRACT NO.:"` — label, colon, and an unfilled placeholder
value (or nothing) all in a single string, with no separate label/value
cells to split. The existing trailing-colon-only strip never matched a
colon sitting mid-string, so none of these 4 rows cleared the
vocabulary check and the whole box surfaced as a fabricated 4-row
`title: null` table.

Extended `isTitleBlockRowLabel` (`web/src/lib/sheetgraph.ts`) with two
small, additive changes: (1) periods are now stripped before comparison
(abbreviation punctuation like `"PROJ."`/`"NO."` carrying no semantic
distinction for this vocabulary match), and (2) when the full
(period/colon-stripped) key doesn't match, a second check splits the key
on its FIRST colon and checks whether the LABEL half alone matches the
vocabulary — the value half (a real name, or nothing) is never
inspected, so this can never admit a genuine per-row identity that
happens to contain a colon (no real MARK/TAG/room-number key ever does).
Added `"PROJ MANAGER"`/`"PROJECT MANAGER"` to the vocabulary (a new,
unambiguous administrative label); `"DRAWN BY"`, `"CHECKED BY"`,
`"CONTRACT NO"` were already present and now match via the new prefix
check.

**Verification:** new unit test in `test/sheetgraph.test.ts`
reproducing this exact glued-key shape. All 213 tests across
`sheetgraph.test.ts`/`vectorTakeoffPipeline.test.ts`/
`scheduleLanguageScan.test.ts`/`tableExtractorReconcile.test.ts`/
`schedulePlanReconcile.test.ts` pass. Live, on the real document
(`qpdf`-sliced page 8): the fabricated 4-row table is gone; the 3 real
tables (`AIR COOLED CHILLER SCHEDULE`, `BUFFER TANK SCHEDULE`, `PUMP
SCHEDULE`) are unchanged. Re-checked B-30's own 12_MT fix and the other
3 open B-30 instances (098_ID, 080_CA, 013_MO) live post-change: 12_MT
still clean, the other 3 still unaffected (their own fabrications are
prose-only title-block text, not a ruled label:value grid, so this
vocabulary-based mechanism was never going to reach them).

**Checked, not fixed (at the time), this document's own duplicate-`PUMP
SCHEDULE` half** — this is the SAME underlying mechanism this pass
separately root-caused for B-38 (vectorgrid emitting two overlapping
candidate regions for one physical table, one of which misreads the
real data row as its own header) — re-confirmed live on this exact
document; not independently re-fixed here since B-38's own entry
already carries the full trace and the reasoning for why a fix needs
vectorgrid-side candidate deduplication, corpus-wide-blast-radius work
outside this pass's scope.

**Checked, not fixed (at the time), the 2 recurring instances.** 071_ME's
exact-duplicate `DUCTLESS SPLIT SCHEDULE` is the same B-38-family
mechanism as above, not independently re-traced. 21_VA#50's own untitled
phantom was re-dumped live post-fix: its row keys/cells are substantially
MORE garbled than 023_US's clean case — one cell's own text is a long
run of apparently unrelated numeric/equipment data concatenated with
title-block fragments (`"0.36 85.0 300 105 / 150 28.54 0.50 4.88 8
0.051 VCWF08 140 TRANE VAV-2-21 55.0 1 CHECK: SHEET TITLE"`), suggesting
a column-band/region mis-assignment bleeding real data from the sheet's
OTHER tables into this candidate, not a clean title-block-only capture
this vocabulary mechanism can safely refuse — left open for a future
pass with its own dedicated trace rather than guessed at here.

**RE-VERIFIED 2026-09-14 — ALL THREE instances now closed, confirmed
live, no new code this pass.** B-38's own two fixes shipped this session
(the unit-label leaf-tier recognition, then the title-corroboration-cell
text requirement) are exactly the "vectorgrid-side candidate
deduplication" this entry's own text said the duplicate-table half
needed — re-checked all 3 documents fresh (`qpdf`-sliced pages, current
code, no code touched for this re-check):

- `023_US_Chiller_Replacement_at_U_S_Salinity_Laboratory.pdf#8` (the
  original document): 3 tables total, exactly the 3 real ones
  (`AIR COOLED CHILLER SCHEDULE`, `BUFFER TANK SCHEDULE`, `PUMP
  SCHEDULE` now correctly keyed `CHWP1/CHWP2` with real cell data) — no
  duplicate `PUMP SCHEDULE`, no untitled phantom.
- `071_ME_BGS_Project_3809_Health_Science_Center.pdf#44`: `DUCTLESS
  SPLIT SCHEDULE` now appears exactly once (`rows: 20`) — the exact
  duplicate is gone. All 4 of the sheet's real tables present, none
  duplicated.
- `21_VA_OrangeCounty_PublicSafetyBldg.pdf#50`: exactly 2 tables, both
  real (`AIR HANDLING UNIT SCHEDULE` — now 50 rows, B-31's own group-
  divider fix's stated recovery — and `VAV TERMINAL BOX SCHEDULE`) — the
  untitled 2-row phantom (previously found "substantially more garbled"
  than the clean case) is gone too, evidently resolved by the same
  combination of this session's B-31/B-38 fixes rather than needing its
  own separate trace after all.

No document in this entry's own history still shows a duplicate or
untitled-phantom table. Closed.

### B-34 — control-diagram instrument-callout labels are clustered into fabricated phantom tables (PARTIAL FIX 2026-09-14: the 1-2 row instances close; 3+ row instances remain open by design)

**Where:** `21_VA_OrangeCounty_PublicSafetyBldg.pdf`, sheets M-701 (#52,
"CHILLED WATER SYSTEM CONTROLS") and M-703 (#54, "AIR HANDLING UNIT
CONTROLS") — found continuing the HELDOUT set's own missed-checking
pass. Both are pure P&ID-style control-diagram + prose-sequence-of-
operations sheets with zero real ruled schedule tables (hand-confirmed
by full-page render).

**Measured:** the extractor reports phantom tables on both: page #52,
an untitled (`title: ""`) 2-row table sourced from a cluster of
instrument-bubble callout labels near the chilled-water buffer tank
detail ("HIGH CAPACITY AUTO AIR VENT", "GLOBAL OUTSIDE AIR HUMIDITY",
"PUMP SPEED CONTROL", etc. — confirmed via `textSpans()` region dump,
no ruled grid present in the source at all). Page #54 reports TWO
phantoms: `"FURNISHED BY FIRE"` (3 rows) and `"RETURN AIR"` (9 rows),
both sourced from instrument-bubble callout labels near the top-right
of the AHU control diagram ("FURNISHED BY FIRE ALARM SYSTEM
MANUFACTURER (TYPICAL)", "RETURN AIR HUMIDITY", "RETURN AIR TEMP", and
similar sensor labels) — again zero ruled structure in the source. Both
sheets' own REAL tables (`OUTSIDE AIR RESET SCHEDULE`, 2 rows each, on
M-701 and the neighboring M-702/#53) extract correctly, confirmed by
hand-render.

**Relationship to already-catalogued bugs:** same broad "prose/label
text mistaken for a table" family as B-16/B-29/B-30/B-33, but a new
triggering shape: not a disclaimer stamp, not a title-block sub-grid,
not side-by-side numbered notes — here it's **instrument-bubble callout
labels scattered around a P&ID-style control diagram**, which apparently
cluster densely enough near certain diagram regions to be misread as a
tabular grid. Filed as a new number rather than merged into B-33
because the untitled-vs-titled split doesn't track cleanly (this bug
produces both an untitled AND two titled phantoms from the same
mechanism), and because the source content (diagram callouts, not
sheet furniture) is genuinely different from every prior instance.

**Consequence for the HELDOUT set's own zero-error bar:** 3 phantom
tables (14 phantom rows total) on 2 sheets that have zero real tables
between them — a false-positive-free failure on control-diagram sheets
specifically, a sheet type not previously implicated in this bug
family. Given this document's controls-diagram sheets span roughly
M-701 through M-707 (not fully surveyed), this may be a wider source of
phantom tables than the 2 instances confirmed here.

**FIX (2026-09-14) — the page #52 instance, and its whole 1-2-row
class:** live debug instrumentation (`OPENTAKEOFF_DEBUG_B34`-gated
`console.error` in `sheetgraph.ts`, added, run, and fully reverted —
same discipline as B-32/B-33's own trace probes) confirmed that
`singleRowSitsInDrawnGrid` — the existing ruled-box check that already
protects the ordinary (non-rotated) 1-row reference-table path — ALSO
correctly rejects the page #52 phantom the moment it is actually asked
to run on it: the callout cluster has no real horizontal/vertical ruling
above and below it, so the check returns `false` for it exactly as it
does for every other unruled phantom this catalogue documents. The only
reason it survived is that the check was gated to 1-row candidates only
(`banded.out.length < 2`); the page #52 phantom happens to band as a
2-row candidate, one row outside the gate. Widened the gate in
`sheetgraph.ts` from `banded.out.length < 2` to `banded.out.length < 3`
(the ordinary-table call site) so 2-row candidates get the same real
ruled-box scrutiny 1-row candidates already did. `singleRowSitsInDrawnGrid`
needed no logic change — its own top/bottom-rule and column-wall checks
already generalize to any row count; only the row-count GATE deciding
when to invoke it was too narrow. Verified this closes exactly the page
#52 phantom and does not touch page #54's two larger (3-row, 9-row)
phantoms, left open below.

**Real-world verification, not assumed:** the code's own comment on
this exact check names the bessemer-mechanical-bidset.pdf M601 sheet's
real 2-row `DUCTWORK INSULATION SCHEDULE` as the case this widening
risks breaking. Traced live against the real PDF: unaffected,
byte-identical before/after, because that real table sits inside a
complete drawn ruled box the synthetic phantom never had.

**A second, related bug this surfaced and also fixed:** the same gate
widening broke 4 of this repo's own pre-existing unit tests, all for
the same reason — `singleRowSitsInDrawnGrid` returns `false`
(unconditionally, not "assume ruled") when no `segs` are supplied, and
`extractAllQuarterTurnedTables()` (the rotated/quarter-turned table
path) was silently DROPPING `sheet.segs` entirely when building its
internal rotated `SheetSpans` — every rotated reference/finish table
candidate reached this check with `segs` always `undefined`, regardless
of the real sheet's own ruling. Before this widening that never
mattered (the gate excluded 2+-row candidates, and the rotated path's
2-row candidates were never checked at all), but it meant the rotated
path was flying blind on real ruling for years, relying entirely on the
permissive default of `hasNearbyRuledLine` (which treats "no segs" as
"assume ruled", the opposite default). Fixed by rotating `sheet.segs`
into the turned frame the exact same way spans themselves are rotated
(`(px,py) -> (py, pivot-px)`, the inverse of the same `restore()` this
function already uses to map results back) and passing it through.

**This fix is a second, independent, real win, not just a test
patch:** live-traced against `bldg5406-hvac-demo-mechanical.pdf` (the
corpus's own held-out doc for this quarter-turned path — see
PROGRESS.md's "Building 5406's nine-row AIR TERMINAL BOX SCHEDULE").
Before this fix: 26 rotated/quarter-turned "reference" tables. After:
14. The 12 removed are ALL prose fragments from a rotated sequence-of-
operations narrative sourced as phantom tables by the exact same
mechanism as B-16/B-29/B-30/B-33/B-34 — titles like `"SHOW ON"`,
`"AIR TEMPERATURE AND USE AS REQUIRED FOR SETPOINT"`, `"SETPOINT, THE
ZONE DAMPER SHALL MODULATE BETWEEN THE"`, `"OVERRIDE THE SCHEDULE AND
PLACE THE UNIT INTO AN OCCUPIED"`, `"MIXING VALVE"`, `"SITE FLOW
INDICATOR"` — none of them real tables. Every genuine rotated schedule
on that same document survives byte-identical: `AIR HANDLING UNIT
SCHEDULE` (1 row), `AIR TERMINAL BOX SCHEDULE` (9 rows, the named
regression precedent), `FAN SCHEDULE` (5 rows), `P SCHEDULE` (2 rows),
`AIR SEPARATOR SCHEDULE` (1 row), `GRILLE, REGISTER AND DIFFUSER
SCHEDULE` (7 rows) — all unchanged.

**Full regression:** `node --import tsx --test test/sheetgraph.test.ts
test/vectorTakeoffPipeline.test.ts test/scheduleLanguageScan.test.ts
test/tableExtractorReconcile.test.ts test/schedulePlanReconcile.test.ts
test/vectorGridAdapter.test.ts` — 231/231 pass (4 pre-existing fixtures
needed their deliberately-minimal ruling geometry filled out to a
complete ruled box now that the check they exercise runs on 2-row
candidates too; no test assertion was weakened to get there).

**What remains open:** page #54's own two larger phantoms
(`"FURNISHED BY FIRE"`, 3 rows; `"RETURN AIR"`, 9 rows) are deliberately
untouched — the gate stops at `< 3` on purpose, since a 3+-row phantom
built the same way as a 3+-row real repeated-tier schedule table is a
much harder discrimination the corpus has not yet supplied enough
counter-examples to make safely. Re-verified live on this same slice
(`21_VA_OrangeCounty_PublicSafetyBldg.pdf#54`): both phantoms still
present, unchanged, exactly as expected.

### B-35 — a firm's own logo tagline text is fabricated into a phantom table, repeated across 13 different sheets of one document (FIXED 2026-09-13)

**Where:** `089_FL_Airport_Terminal_and_Hangar_Development.pdf` — found
closing out the HELDOUT set's own missed-checking pass (the 32nd and
final document). Every sheet in this document carries an AVCON, Inc.
title-block logo with a vertically-set tagline, "TRANSFORMING TODAY'S
IDEAS INTO TOMORROW'S REALITY", printed in the right-margin sidebar.

**Measured:** a document-wide search of the extractor's own graph output
finds a `title: "TRANSFORMING TODAY'S IDEAS INTO TOMORROW'S REALITY"`,
`rows: 4`, `kind: reference` phantom table on **13 separate sheets**
(pages 3, 49, 63, 89, 92, 105, 114, 117, 125, 127, 136, 163, 172) — every
one of them identical in title and row count. Hand-rendered checks of
several of these pages (M-001/#127, M-601/#136) confirm zero ruled table
structure at that location — it is purely the rotated tagline text plus
the small-print copyright/confidentiality notice beneath the AVCON logo
box, present unchanged on every sheet of the set.

**Relationship to already-catalogued bugs:** same broad "sheet furniture
fabricated into a phantom table" family as B-29/B-30/B-33/B-34, but a new
and by far the most WIDESPREAD trigger yet found — not a title-block
field-grid, not a disclaimer stamp, not P&ID instrument callouts, but a
firm's own static logo/tagline block, repeated verbatim on every sheet of
a set drawn by that firm. Because the trigger is firm-specific boilerplate
rather than content that varies sheet-to-sheet, this is the first phantom-
table bug in this catalogue confirmed to recur predictably and
identically dozens of times within a single document, and plausibly
across every other AVCON-drawn document in the corpus (not checked here).

**Consequence for the HELDOUT set's own zero-error bar:** 13 phantom
tables (52 phantom rows) in ONE document — the single largest phantom-
table count found in the HELDOUT pass, on a document whose real HVAC
schedule content (see below) is otherwise almost entirely clean.

**FIX (2026-09-13):** root-caused live (via reverted debug
instrumentation and a rendered-page check, both confirming the source is
`scheduleTableFromODL`'s `kind === "unknown"` fallback in
`web/src/lib/sheetgraph.ts`, NOT the geometric "structural reference"
pass the bug's own shape first suggested — that pass already correctly
excludes rotated/quarter-turned text via `isVertical()`). The existing
guard for this exact bug family
(`R - headerEnd <= 2 && headers.every(h => /^COL\d+$/.test(h))`,
`sheetgraph.ts:10367-10369`, shipped for 067_CA_SLAC's own 8-sheet stamp-
box case) doesn't fire here because AVCON's sidebar also carries a real
ruled revision-history sub-grid, pushing its own row count past 2.
Widening that single shared threshold was rejected as the fix (every
other genuinely tiny real reference table in the corpus shares the same
guard, and it has no notion of "this repeats identically elsewhere").

Instead, added a new, purely additive post-processing pass in
`mcp/src/session.ts`'s `enhanceTablesWithODL()` (right after all of a
document's ODL tables are collected, before `collapseEquivalentPrimary
Tables`): drop any `"reference"`-kind table whose headers are still the
bare `COL1/COL2/…` fallback AND whose exact `(document, title, row
count)` signature recurs on 3 or more DIFFERENT sheets of the same
document — the shape both this bug and the SLAC precedent share, and one
no genuine per-sheet-varying schedule exhibits.

**Verified:** live re-run against the real document —
`089_FL_Airport_Terminal_and_Hangar_Development.pdf` drops from 72 to 59
schedule tables (exactly the 13 phantom rows removed, 0 remaining
`"TRANSFORMING…"` entries anywhere in the output), while every real
mechanical-equipment table on sheet M-601/#136 (`FAN SCHEDULE`,
`ELECTRIC UNIT HEATER SCHEDULE`, `LOUVER SCHEDULE`, etc. — see this
document's own HELDOUT_GRADING.md entry) extracts byte-identically
before and after. A 25-document corpus-regression-sweep.mjs before/after
diff (spanning both the Demo Corpus and HELDOUT sets) shows **zero**
table differences anywhere else in the sample — no other document's
table titles, kinds, or row counts changed.

### B-36 — a multi-level table's own internal column-group sub-header is picked as the table's title instead of the real title text above it (FIXED 2026-09-13)

**Where:** `089_FL_Airport_Terminal_and_Hangar_Development.pdf#136`
(sheet M-601, "MECHANICAL SCHEDULES") — found alongside B-35, closing
out the HELDOUT set.

**Measured:** the sheet's real `VRF SYSTEM SCHEDULE` (a 2-level-header
table: top-level groups `COOLING COIL SECTION`/`HEATING COIL SECTION`/
`HEAT PUMP UNIT` over individual spec columns, 12 real rows `AC-1`
through `AC-12`) extracts with the CORRECT row count (`rows: 12`,
`textSpans()`-confirmed) but the WRONG title: `"HEAT PUMP UNIT"` — one of
the table's own three column-group sub-headers, not the real title
(`VRF SYSTEM SCHEDULE`) printed in its own title bar directly above the
table.

**Relationship to already-catalogued bugs:** distinct from B-17 (title
dropped to `null` entirely) and B-18 (header absorbed INTO the title
string, promoting a data row) — here the title field is populated with
real text, correctly row-counted, but sourced from the WRONG place: an
internal column-group label rather than the table's own caption. A new
title-attachment failure shape, most likely triggered by this table's
unusually wide 2-level header (`HEAT PUMP UNIT` sits at the far right of
the header, the widest/most distant sub-header from the real title's
own position).

**Consequence for the HELDOUT set's own zero-error bar:** cell/row data
recovered correctly, but this table would file, search, or group under
the wrong name in any downstream product surface — a real, disclosed
data-integrity gap despite the row count itself being clean.

**ROOT-CAUSE TRACE (2026-09-13, code-level, no fix applied — see below
for why):** traced by direct code reading of
`web/src/lib/sheetgraph.ts`'s `scheduleTableFromODL` (title recovery,
`titleCell`/`titleText`, lines 9758-9839 and 10279-10312) and
`web/src/lib/scheduleLanguageScan.ts`'s `nearbyScheduleCaption` (lines
306-446), the function that later call site invokes. Two-stage failure:

1. **`titleCell` never captures `VRF SYSTEM SCHEDULE`.** The in-grid
   title check (`sheetgraph.ts:9758-9839`) only recognizes a title as
   ROW 0 of the ODL-detected ruled grid — either one cell spanning
   `>= C-1` columns, or several word-group cells covering more than half
   the columns with real gaps between them. On this sheet, `VRF SYSTEM
   SCHEDULE` is drawn as its OWN separate title bar sitting ABOVE the
   ruled grid (confirmed by the rendered page: the title bar is followed
   by 4 numbered general notes and an "AIR HANDLER" sub-label before the
   ruled column-header rows even begin) — the same "caption drawn
   OUTSIDE the ruled grid" shape this exact function's own comment block
   (lines 10283-10294) already names for 08_ME's `DRAWING LIST`, but that
   rescue (`nearbyDrawingIndexCaptionText`) is scoped narrowly to
   drawing-index vocabulary, not schedule captions, so it does not fire
   here. `titleText` reaches line 10305 still empty or reduced to a
   short/generic fragment.
2. **`nearbyScheduleCaption`'s own eligibility gate only protects an
   ALREADY-GOOD title.** Its filter (lines 397-402) rejects every
   candidate outright when `currentTitle` is already non-empty, non-
   generic, and not a short truncated `…SCHEDULE` fragment — exactly
   right when `titleCell` succeeded. But because stage 1 left
   `titleText` empty here, `currentCompact` is falsy and the gate never
   engages, so EVERY nearby schedule-shaped caption on the sheet becomes
   eligible. `HEAT PUMP UNIT` — one of the table's own column-group
   sub-headers — genuinely matches `EQUIPMENT_TABLE_CAPTION_RE` (line 81:
   requires an equipment-family keyword, `PUMP` here, immediately
   followed by `UNITS?`) and sits geometrically much closer to the
   table's own bounding box (it is literally one of the grid's own
   header cells) than `VRF SYSTEM SCHEDULE`'s title bar (separated from
   the grid by the general-notes block). The ranking sort (lines
   427-443) is proximity-first (`gap(a) - gap(b)`), so the close, wrong
   candidate wins over the correct but farther-away real title even
   though `VRF SYSTEM SCHEDULE` itself independently matches
   `SCHEDULE_CAPTION_RE` and is very likely also a candidate in the same
   pool.

**Why this is disclosed without a fix:** both functions are shared,
corpus-tuned, heavily-commented title-recovery infrastructure used by
every ODL-sourced table in the pipeline (`nearbyScheduleCaption`'s own
header names 08_ME/NAVFAC-M-602/044_NY as real regression precedents it
already guards against). A narrow fix needs to (a) teach stage 1 to
recognize a real title bar separated from the grid by intervening notes
text — not just an immediately-adjacent caption — without re-triggering
the "narrow band above/beside it" false-positive class `nearbyScheduleCaption`'s
own comments already document, or (b) bias stage 2's ranking against a
candidate that is itself one of the SAME table's own header/column-group
cells (a self-referential candidate a real external caption never is).
Either changes shared ranking/recognition logic with corpus-wide blast
radius; per this session's own standing rule against guessing at fixes
under time pressure, this trace is recorded as the starting point for a
future session with the budget to validate either change against the
full corpus regression sweep before shipping.

**FIX 2026-09-13 — option (b) implemented: a candidate cannot be an
external caption when it IS the grid.** `nearbyScheduleCaption`'s own
header comment states its premise plainly — a real caption "sits in a
narrow band above/beside" the table, never inside it. `HEAT PUMP UNIT`
is a cell of the grid itself, so its bbox lies (almost) entirely inside
`table.region` — meaning `dx = dy = 0` under the function's own gap
math, which made it look like a zero-distance, unbeatable candidate
under the proximity-first sort, always winning over a real title
separated from the grid by intervening notes text (a real, positive
gap). Added one containment check to the `eligible` filter in
`web/src/lib/scheduleLanguageScan.ts`: a candidate whose bbox overlaps
its own area with the table region by ≥95% on both axes (i.e., the
candidate is essentially swallowed by the grid, not merely touching its
edge) is excluded outright, before either the vertical or horizontal
gap/overlap checks run. The 95% bar (not exact full containment) is
deliberate — it lets an ordinary CAD-drafting/font-metric edge overlap
of a genuine just-above caption through untouched, and only excludes a
candidate that is essentially entirely inside the grid.

This does not touch title RECOGNITION vocabulary (`isScheduleCaptionText`,
`EQUIPMENT_TABLE_CAPTION_RE`, `SCHEDULE_CAPTION_RE` are all unchanged) or
the proximity-first ranking itself — only which candidates are even
allowed to enter that ranking. A genuine external caption, by
definition, is never mostly coincident with the table it names, so this
can only ever remove a self-referential candidate, never a real one.

**Verification:**
- New unit test in `test/scheduleLanguageScan.test.ts` reproduces this
  exact shape (a real title above a wide grid vs. a column-group
  sub-header fully inside it) and confirms the real title now wins.
- All 22 `scheduleLanguageScan` tests pass (21 pre-existing + 1 new).
- All 148 `sheetgraph.test.ts` tests pass — this filter is exercised by
  every ODL-sourced table's title recovery, and nothing else moved.
- All 18 `vectorTakeoffPipeline.test.ts` tests pass.
- **Live, on the real bug:** re-ran `production-graph-cli.mjs --mode
  graph` (fresh `OPENTAKEOFF_GRAPH_TRACE` cache) against a `qpdf`-sliced
  single-page extract of `089_FL_Airport_Terminal_and_Hangar_Development.
  pdf#136` (the full document is 177 pages; slicing avoids an
  unnecessarily long run for a single-page verification, same technique
  used for B-26's own decline-reason trace). Before the fix: title
  `"HEAT PUMP UNIT"`. After: title `"VRF SYSTEM SCHEDULE"`, `rows: 12`
  (matching the hand-confirmed count exactly, unchanged from before the
  fix — only the title string moved). Directly diffed both runs' full
  table lists (title/rows/kind for all 6 real tables on the page):
  byte-identical except for this one title string — confirms the fix is
  exactly and only the intended change, with zero effect on row counts,
  cell data, or any of the page's other 5 tables.

### B-37 — a small, non-`SCHEDULE`-titled ruled table on a mechanical details sheet is completely missed (NOT FIXED — found, traced, disclosed)

**Where:** `089_FL_Airport_Terminal_and_Hangar_Development.pdf#133`
(sheet M-502, "MECHANICAL DETAILS") — found alongside B-35/B-36.

**Measured:** the sheet's "LOUVER ANCHORING DETAIL" callout carries a
real, ruled, bordered spec table (`BUILDING CONSTRUCTION TYPE`, `BLDG
MATERIAL MINIMUM`, `ANCHOR THICKNESS MIN`, `ANCHOR TYPE`, `MAT'L`, `DIA`,
`HEIGHT MAX`, `SPACING MAX`, `EDGE MAX`, `EMBED MAX` columns, 1 data row:
`MASONRY`/`3 KSI`/.../`BUILDEX TAPCON`). A document-wide title search of
the extractor's own output (for `MASONRY`, `ANCHOR`, `BUILDEX`) confirms
this table is not extracted anywhere, under any title — a genuine, whole-
table miss, not a misattachment.

**Relationship to already-catalogued bugs:** distinct from B-19/B-24/
B-27/B-28's missing-table cases, which all involve tables clearly titled
`*SCHEDULE`; this table's own caption ("LOUVER ANCHORING DETAIL") doesn't
contain that word, and it sits embedded among unrelated detail drawings
on a details sheet rather than on a dedicated schedule sheet — plausibly
a caption-keyword-matching gap (the detector may key on `SCHEDULE` in the
caption text) rather than a structural-recognition failure, though not
traced further under this pass's own no-guessing-at-fixes rule.

**Consequence for the HELDOUT set's own zero-error bar:** one whole real
table (1 row) silently absent with no other signal that anything is
wrong — small in row count, but a clean MISS nonetheless.

**ROOT-CAUSE CONFIRMED 2026-09-13 (code-level, no fix applied — see
below for why).** This entry's own original "plausibly a caption-
keyword-matching gap" guess is CONFIRMED exactly, at a specific
function: `web/src/lib/vectorTakeoffPipeline.ts`'s `isScheduleTarget()`
(line 177). Traced live via a `qpdf`-sliced single page (page 133 alone)
run through `production-graph-cli.mjs --mode graph` with
`OPENTAKEOFF_GRAPH_TRACE=1` (cache cleared): the sheet's own role
classifies as `plan` (confirmed via the trace's own `topology
sheet=... role=plan` line), and `isScheduleTarget`'s gate for a
`role: plan` sheet requires ONE of: (a) `ctx.role === "schedule"` — no;
(b) `sheetHasScheduleCaption(ctx.spans)` — a printed caption containing
the word `SCHEDULE` anywhere on the sheet — no, this sheet's only real
table's own caption is `"LOUVER ANCHORING DETAIL"`; (c)
`sheetHasPointsListCaption` — no; (d) `role === "legend" || role ===
"unknown"` (this sheet is `plan`, so this branch and everything gated
behind it, including the broader `sheetHasScheduleLanguage` vocabulary
scan, never even runs). Every branch fails, `isScheduleTarget` returns
`false`, and the ENTIRE sheet — not just this one table — is skipped by
both vectorgrid (`L1.8:vectorgrid` stage measured `0` ms in the trace,
confirming it never actually ran any per-sheet work) and the geometric
extractor (gated the same way, `vectorTakeoffPipeline.ts:606`). The
sheet's own final result: `"0 schedule tables"`, an exact match to the
real, measured miss.

**Why this is disclosed without a fix:** `isScheduleTarget`'s own
comment names its exact purpose and history — it exists because "equipment
words are everywhere on a floor plan," and running vectorgrid
unconditionally on every `plan`/`unknown`-role sheet across a 500+
document corpus was previously measured to cost real performance and
introduce false-positive structure-hallucination risk (the comment's own
prior fixes, 13_MI#10 and 009_FL#30/task #60, were both scoped narrowly
to a printed `SCHEDULE` caption for exactly this reason). This table's
own real caption has no `SCHEDULE`-family word at all, and it sits on a
`MECHANICAL DETAILS` sheet — architecturally the exact shape (drawing
details mixed with dimension/callout lines that can look grid-like) this
gate was built to stay conservative about. Widening the gate to admit
`plan`-role sheets more broadly is corpus-wide-blast-radius policy
change, not a narrow fix, and needs a full corpus regression sweep (cost
AND false-positive rate, not just this one document's recall) before
shipping — not attempted here under this session's own standing rule
against guessing at fixes under time pressure. A safer, narrower
direction worth considering in a future session: a genuinely bordered/
ruled-grid structural signal (not a vocabulary/caption match) as an
ADDITIONAL, cheap pre-check specific to a `plan`-role sheet, so the gate
stays conservative about cost/false-positives while still admitting a
real ruled table with no `SCHEDULE` caption — not designed here, since it
touches the same shared gate every one of this corpus's several hundred
`plan`-role sheets passes through.

### B-38 — a two-row-header table's own unit-label sub-header row is read as the table's single data row, and the real data row underneath it vanishes (FIXED 2026-09-14 — both halves closed)

**Where:** `023_US_Chiller_Replacement_at_U_S_Salinity_Laboratory.pdf#8`
(sheet, "AIR COOLED CHILLER SCHEDULE" / "BUFFER TANK SCHEDULE" / "PUMP
SCHEDULE" — 3 of the page's 3 real equipment tables, found while
extending this session's box+cell-tier grading work to a HELDOUT
document).

**Measured:** all 3 tables on this page share a two-row header: a group
header (e.g. `CAPACITY`) over a unit-label sub-header (`TONS` / `[kW]`),
column-by-column, before the real data row. Rendering the page at
scale=3.0 and reading it directly confirms one genuine data row per table
(`AIR COOLED CHILLER SCHEDULE`: `CH-1&2` / `MECHANICA;L YARD` / `WHOLE
BUILDING` / `SCROLL` / `132` / ... / `CARRIER` / `30RC-1326S015-7-2`, 33
columns, several metric-unit columns intentionally solid-filled black on
the page itself — a real drafting convention for "N/A", not a rendering
artifact). The extractor's own `--mode graph` output reports exactly 1
row for each table, but that row's own cell values are `MARK`,
`LOCATION`, `TONS`, `[kW]`, `GPM`, `[L/s]`, ... — the unit-label
sub-header text itself, verbatim, under a row `key` of literally `MARK`.
The real data row (`CH-1&2`, `132`, `CARRIER`, ...) does not appear
anywhere in the extractor's output for any of the 3 tables — confirmed
absent via direct string search of the full JSON, not misattached
elsewhere. A 4th, duplicate `PUMP SCHEDULE` entry (kind `reference`, not
`equipment`) appears with bracket-fragment headers (`[ 33 ]`, `[ 1600 ]`,
`[ 160 ]`, `[ 15 ]`) and a `N/A`-heavy row — a second, differently-garbled
artifact of the same underlying confusion, not independently traced.

**Plausible root cause, not yet traced to a line:** `sheetgraph.ts`
already carries a "numeric-only sub-header discrimination gate" (search
`numeric-only sub-header` in that file) built for sub-header rows that
are ALL bare numbers (e.g. octave-band frequencies). This table's own
sub-header row is unit LABELS (`TONS`, `GPM`, `°F`, bracketed metric
units like `[kW]`) mixed with the occasional bare unit symbol — plausibly
outside that gate's own numeric-only test, so it slips through as if it
were an ordinary header/data boundary rather than being recognized as a
second header row to skip past. Not fixed under this pass's own
no-guessing-at-fixes rule — the gate's exact matching condition needs to
be read before touching it, not inferred from this symptom alone.

**Relationship to already-catalogued bugs:** distinct from every prior
row-count entry (B-20's duplicate rows, B-26's phantom-row overcounts,
B-31's truncation) — this is not a wrong row COUNT, it's the wrong row
CONTENT: 1 row is reported, but it is the wrong row (a header, not data),
and the real data is not merely truncated, it is entirely absent.

**Consequence for the corpus's own zero-error bar:** on a chiller-
replacement project, the AIR COOLED CHILLER SCHEDULE — the single most
central table on the document — reports a row that is pure header noise
while the real equipment record (capacity, electrical, manufacturer,
model) is completely unreachable by any downstream compile. Confirmed on
all 3 real tables on this one page; not yet checked against the rest of
the corpus for prevalence.

**ROOT-CAUSE TRACE CORRECTED 2026-09-13 (code-level, no fix applied — see
below for why).** This entry's own original "plausible root cause"
guess (the geometric extractor's `numeric-only sub-header
discrimination gate`) was checked directly against the code and is
WRONG — that gate lives in a different code path (the pure geometric
extractor's `harvestNumericSubHeaders`, built for bare-number octave-
band sub-headers) and is not reached by this table at all, which is
read through `scheduleTableFromODL`. Traced live instead by re-running
`production-graph-cli.mjs --mode graph` (`OPENTAKEOFF_GRAPH_TRACE=1`,
cache cleared, `qpdf`-sliced to page 8 alone) and reading its full JSON
output directly:

1. **`vectorgrid` emits TWO overlapping candidate regions for the same
   physical PUMP SCHEDULE table**, not one: `[346.32,1155.36,4393.2,
   1334.16]` (kind `equipment`) and `[346.32,1158.9,4393.2,1410.72]`
   (kind `reference`) — same table, same left/right/top edge, but two
   different bottom edges 76.56pt apart. The shorter one's bottom edge
   sits exactly at the boundary between the table's own 3-tier header
   block and its single real data row; the taller one's bottom edge
   sits below the data row. Both survive to the final graph output as
   separate table entries — vectorgrid's own row-grid line detection is
   genuinely ambiguous about which ruled line is this table's real
   bottom edge, and nothing downstream deduplicates or reconciles the
   two candidates into one correct table. This is the same general
   family as B-26's block-split (a real single table's own row/column
   grid gets cut at the wrong place), though the specific shape here is
   two OVERLAPPING duplicate candidates rather than B-26's two disjoint
   blocks.
2. **The shorter (header-only) candidate's own row classification then
   independently manufactures a phantom row.** `scheduleTableFromODL`'s
   `maxCovered` yardstick (the "how many columns does this table's own
   widest span-free row cover" calibration used to decide whether a
   later row is "full coverage" like a data row, or "partial" like a
   header tier) is computed ONLY from rows inside this candidate's own
   `[bodyStart, R)` range — and because this candidate's own range ends
   right at the header block's own bottom edge, the real data row is
   never in scope to calibrate against. The table's own leaf unit-label
   row (`TONS`/`[kW]`/`GPM`/`[L/s]`/`°F`/...) has no rowspan/colspan
   cells of its own, so it becomes `maxCovered`'s own yardstick by
   default, then trivially satisfies `fullCoverage` against a bar
   calibrated FROM itself, clears `!grouped`, and falls to the
   vocabulary tie-break — where physical units are not equipment-
   schedule vocabulary (`ALL_HEADER_WORDS_ARR` has `MARK`/`LOCATION`/
   `MANUFACTURER`/... but no `TONS`/`GPM`/`[kW]`), so it fails the 0.4
   hit-rate bar and becomes the table's own first (and only) "data"
   row — echoing its own leaf header text back as if it were data. This
   file's own comment on this exact mechanism (search `AHU-1's own real
   third header tier` in `sheetgraph.ts`) already names an equivalent
   failure shape on a different document (096_IN's AHU SUPPLY FAN
   SCHEDULE, `SINGLE POINT` spanning MCA/MOCP) — this is a second,
   independently-found instance of the same known, disclosed limitation.
3. **The taller (data-row-included) candidate then makes the mirror-
   image mistake.** Because its own range DOES include the real data
   row, and that row is the FIRST row after this candidate's own
   (differently-computed) header boundary, the row-classification loop
   treats the genuine data row (`CHWP1&2`/`MECHANICAL ROOM 126`/`530`/
   `100`/...) as if it were itself a header row (kind `reference`, not
   `equipment` — the ODL path's own no-vocabulary-hit fallback), and its
   real values become that table's `headers[]` array — a second garbled
   artifact of the exact same overlapping-candidate ambiguity, not
   independently traced further.

**Why this is disclosed without a fix:** the root defect (vectorgrid
emitting two ambiguous, overlapping row-grid boundary candidates for one
real table instead of resolving to a single correct one) is a
geometric/block-boundary decision, the same class of change as B-26's
block-merge gap — not a narrow, single-function fix, and this file's own
`maxCovered`/vocabulary-tie-break mechanism is already extensively
corpus-tuned with its own documented regression history (the 096_IN
precedent this same comment block already guards). A safe fix needs
either (a) vectorgrid-side deduplication/reconciliation of two heavily-
overlapping same-table candidates before they ever reach
`scheduleTableFromODL`, or (b) teaching `maxCovered`'s calibration to
recognize a units/label vocabulary (`TONS`, `GPM`, `[kW]`, bracketed
metric units, °F/°C, PSIG, etc.) as ALSO clearing the header tie-break,
not just the equipment-identity vocabulary it already checks — either
one is shared, corpus-wide-blast-radius logic, and per this session's
own standing rule against guessing at fixes under time pressure, this
corrected, now-precise trace (superseding the entry's own original,
wrong guess about which gate is responsible) is recorded as the
starting point for a future session with the budget to validate either
change against the full corpus regression sweep before shipping.

**FIX (2026-09-14) — option (b) above, implemented narrowly and opt-in
only; closes the phantom-row half of this bug.** Before implementing,
re-verified this entry's own root-cause trace against the live document
and found 2 of its 3 originally-cited tables (`AIR COOLED CHILLER
SCHEDULE`, `BUFFER TANK SCHEDULE`) already extract correctly on current
code — real keys (`CH-1&2`, `BT-1`), real values throughout, no
duplicate candidates — an unrelated earlier fix in this same file
already closed those two. Only `PUMP SCHEDULE` still shows the exact
originally-diagnosed shape (a duplicate "equipment"-kind candidate
whose own row 0 literally echoes its own header labels back as cell
values, keyed `MARK`).

Added a NEW, independent way for `scheduleTableFromODL`'s header/data
boundary to recognize a row as "still header": alongside the existing
`headerVocabHitRate` (a word-token substring match against the shared
equipment-identity vocabulary), a new `unitLabelHitRate` checks the
SAME 0.4 bar against a small, closed `UNIT_LABEL_WORDS` set (TONS, GPM,
[kW], FT, [kPa], °F, HP, PHASE, VOLT, MAX RPM, SPEED CONTROL, …) —
matched as a row's OWN CELL TEXT IN FULL (bracket/degree-stripped), not
a word-token substring. Deliberately NOT built as an `extraHeaderVocab`
widening (which IS a substring match): a real per-column DATA value can
legitimately carry a unit suffix in the same cell ("500 GPM"), so a
token-level "contains a unit word" test risks eating a real data row
the same way B-32/B-26's own false-positive lessons warn against — the
whole-cell-text requirement means only a genuinely bare unit label
("GPM" and nothing else) can ever match, which no real equipment
record's own value is. Gated behind a new `unitLabelSubHeader?: boolean`
option (false/undefined preserves every existing caller exactly);
enabled ONLY at `vectorGridAdapter.ts`'s own call site, matching this
bug's own found scope (a vectorgrid-sourced ODL table).

**Verified live:** `023_US_Chiller_Replacement_at_U_S_Salinity_
Laboratory.pdf#8` goes from 4 reported tables to 3 — the duplicate,
header-only `PUMP SCHEDULE` candidate (previously manufacturing a
phantom row keyed `MARK`) now correctly finds no data rows in its own
truncated range and refuses, exactly as intended; it no longer appears
in the graph at all. Full regression: 231/231 tests pass, `tsc` clean.
Re-checked byte-for-byte against every real document already verified
live this session (`21_VA...#50`, `#51`, `013_MO...#23`,
`098_ID...#8`, `093_ME...` (11pp), `28_WA...` (9pp)) — every one
identical, row keys and cell keys both, confirming the new closed
vocabulary's whole-cell-match requirement does not misfire on any real
data row already in this session's own corpus.

**What remained open after the first fix:** the SECOND candidate for the
same physical `PUMP SCHEDULE` (kind `reference`, the taller one whose
own range includes the real data row) was untouched — its own real data
(`CHWP1&2`/`MECHANICAL ROOM 126`/`530`/…) still landed in `headers[]`
instead of a row's cells, per this entry's own original point 3. The
underlying vectorgrid ambiguity (two overlapping row-grid candidates for
one physical table) also remains unaddressed at its own source; both
fixes below work entirely downstream of it, by making each candidate
independently resolve correctly rather than by deduplicating them
before they reach `scheduleTableFromODL`.

**FIX 2 (2026-09-14) — the real-data-row half, traced and closed.**
Instrumented `scheduleTableFromODL` with temporary row-by-row debug
output (title, `bodyStart`/`headerEnd`, each row's own cell texts and
spans — reverted before commit) and re-ran against this exact candidate.
Found: the candidate's own header/data boundary loop correctly classifies
row 1 (the real data row) as NOT still-header — `classifyBodyRow` returns
`fullCoverage=true, grouped=false` (all 23 cells are its own, none span),
and BOTH vocabulary tie-breaks correctly fail (`headerVocabHitRate`
0.043, `unitLabelHitRate` 0 — the row is genuine equipment data, not a
unit-label tier) — so the loop's own main pass correctly `break`s at row
1 without ever extending `headerEnd` past `bodyStart`.

The actual defect is downstream of that loop, in the separate "A TITLED
SCHEDULE WITH DATA UNDER IT HAS A HEADER ROW" rescue (added for an
earlier, unrelated fix — see that comment's own CONDENSING BOILER
SCHEDULE / PCW AIR SEPARATOR SCHEDULE cases): `if (headerEnd <=
bodyStart && titleCell && R - bodyStart >= 2) headerEnd = bodyStart + 1`.
This checks `titleCell` truthiness — a JS object reference proving only
that row 0 was structurally a lone cell spanning (almost) every column
(the earlier `wide.length === 1` test) — never whether that cell carries
actual printed text. This candidate's own row 0 IS such a structurally-
wide cell, but it is BLANK (`odlCellText(titleCell)` is `""`, confirmed
live via the same debug instrumentation) — vectorgrid's own duplicate/
overlapping-candidate row-grid detection (point 1 above) produced it as
an empty spacer, not a real caption. The rescue's own comment already
says its corroboration is "a printed title cell that spans the table";
the code checked existence, not printedness, so a blank structural cell
satisfied it exactly as a real title would, promoting the genuine data
row at `bodyStart+1` into the header block.

Fixed by requiring the title cell's own text to be non-empty:
`titleCell && odlCellText(titleCell).trim() && ...`. This is the
narrowest possible correction to the exact gap in the rescue's own
stated intent — every real, printed-title case the rescue was built for
is unaffected (both still pass `.trim()` truthy), and only a blank
structural cell now correctly fails to corroborate.

**Verified live:** `023_US_Chiller_Replacement_at_U_S_Salinity_
Laboratory.pdf#8`'s taller `PUMP SCHEDULE` candidate now reports
`headers: ['MARK', 'SERVED', 'TYPE', 'FLUID', 'GPM', 'HP', 'KW', 'PHASE',
'ELECTRICAL MOTOR VOLT', 'RPM', 'MANUFACTURER']` and one real data row
keyed `CHWP1/CHWP2` with its own real cells (`SERVED`: "USDA Salinity
Laboratory", `TYPE`: "END-SUCTION", …) — previously this same row's own
values were the table's `headers[]` and its only "row" was keyed `N/A`
(a leftover fragment of the blank continuation line beneath it). The
page still resolves to exactly 3 tables (unchanged from FIX 1's own
3-table result — this fix corrects a table's own internal header/data
split, not the count of tables). Full regression: `tsc --noEmit` clean,
149/149 `sheetgraph.test.ts` + 16/16 `vectorGridAdapter.test.ts` pass
(full `web/` suite: 3059/3155 pass, the 70 failures/13 cancelled
confirmed byte-identical present/absent this change — pre-existing
sync/IndexedDB/Drive infra flakiness, unrelated to this file). Re-checked
structurally (deep-equal, not just byte size) against every document
already verified for FIX 1 (`21_VA...#50`, `#51`, `013_MO...#23`,
`098_ID...#8`): every table's own title/headers/row-keys identical,
zero regression. The two full documents (`093_ME...`, `28_WA...`) show
only build-timing-noise differences (`stage_ms`, elapsed-time notes) —
zero content difference in tables, rows, or cells.

Both halves of this bug are now closed. The underlying vectorgrid
ambiguity (two overlapping row-grid candidates for one physical table,
point 1 above) is unchanged and could still, on some other document,
produce a shape neither fix anticipates — not corpus-wide validated
beyond the documents named above.

### B-39 — a real table below is completely missed, and the table above silently absorbs its whole region into its own box (found via the goal document's own required auto-accept audit) (NOT FIXED — found, traced, disclosed)

**Where:** `038_NC_VA_Project_637_22_700_EHRM_Infrastructure.pdf#52`, found
while running `opentakeoff-corpus/goals/VECTORGRID_TABLE_BOXES.md`'s own
Method §3 required audit: "audit a random sample of the auto-accepted
[boxes] ... publish the label error rate." A random, seeded (20260913)
20-item sample of this session's 873 `rulelinebox.py` auto-accepted boxes
was drawn and each genuinely re-graded by rendering the page and looking
at the box drawn around it (no auto-accept, no seeded search window in
the check itself) — the goal document's own definition of ground truth.

**Measured:** vectorgrid's own reported box for `"Branch Panel: (E)
4CL1-1"` is `[374.64, 222.72, 2102.64, 2609.04]`. Rendering the page and
cropping exactly to that box shows TWO complete, distinct branch panel
schedules stacked inside it: `Branch Panel: (E) 4CL1-1` (the real title,
ending around 21 circuit rows + totals + notes) and, immediately below
it with no visible gap in the box, a SECOND, fully independent table:
`Branch Panel: A401A` (`Location: TR (EXPANDED) A401`, `Supply From: (E)
4CL1-1` — confirmed at high zoom, not a misread of a similarly-named
`A501A` table that genuinely exists elsewhere on this same page at a
non-overlapping region `[374.64, 2660.16, 2102.64, 3743.04]`). A full
string search of the extractor's own output for this document confirms
`Branch Panel: A401A` does not appear ANYWHERE, under any title — a
genuine, whole-table MISS, not a misattachment.

**Why this passed auto-accept:** `rulelinebox.py`'s own independent
pixel measurement found a real, solidly-drawn ruled line almost exactly
at vectorgrid's own reported bottom edge (worst-edge agreement <0.1pt,
per this document's own `.tableboxes.csv` row) — because that line IS
real ink on the page: it is the real BOTTOM BORDER of the missed
`A401A` table, not a fabricated line. Two mechanically independent
extractors agreeing within 4pt here means exactly what the goal
document's own "Non-negotiable" section warns it can mean: "two tools
sharing a blind spot... agree confidently and both being wrong." Neither
extractor is wrong about where a ruled line sits; vectorgrid is wrong
about where ITS OWN table ends.

**Consequence for the goal document's own audit requirement:** 1 error
in a 20-item random sample = 5% disagreement rate, which is explicitly
NOT "indistinguishable from zero" per Method §3's own rule ("If the
audited disagreement rate is not indistinguishable from zero, auto-accept
is broken and gets turned off — not re-tuned, not shrunk quietly, off —
until the reason it's wrong is found"). The reason is now found and
disclosed here (a missed table's region silently absorbed into a
same-shaped neighboring table's own box, specifically in stacked
branch-panel-schedule layouts) — this is not grounds to declare the
other 872 auto-accepted boxes this session clean; it is grounds to treat
this session's own `.tableboxes.csv` rows as real, disclosed, but
UN-AUDITED-CLEAN evidence toward the corpus-wide/held-out gate (where
Method §3 permits exactly this), never as a substitute for genuine human
blind grading on the Demo Corpus (which already does not apply here
regardless, per that section's own explicit rule — see the correction in
`keys/DEMO_CORPUS_GRADING.md`).

**Relationship to already-catalogued bugs:** distinct from B-33's
same-title duplication and B-29/B-32's title-fabrication merges — here
the surviving table's OWN title is correct and its OWN real data is
correct; the defect is purely a box-extent error that happens to
coincide with total silence about the second table's existence, which is
what makes it invisible to every disclosure mechanism that isn't a
genuine human eyes-on-the-box check.

---

### B-40 — rulelinebox.py wrote every measured box in RENDER_SCALE=2 units instead of the raw PDF points keys/*.tableboxes.csv actually stores, corrupting 873 rows across 46 files by exactly 2x (FIXED 2026-09-13)

**Where:** `bakeoff/rulelinebox.py`'s own `--apply` output — every one of this
session's auto-accepted box-tier ground-truth rows, in every `.tableboxes.csv`
file it touched. Found while regression-checking B-20's fix against
`boxscore.py`, which reported 137/164 CORRECT with 27 failures each showing
an EXACT 2x coordinate relationship between the extractor's own box ("got")
and the recorded ground truth ("truth") — e.g. `019_FL...pdf#4`'s own "Room
Schedule" truth box, `(3933.0, 2864.12, 4490.38, 4045.38)`, exceeds that
page's own real dimensions (`3024 × 2160pt`) outright — a box that cannot
exist on the page it claims to describe.

**Root cause:** `production-graph-cli.mjs`'s own `graph.json` `region` field
(what `rulelinebox.py` reads via `--graph` and seeds its pixel search from)
is expressed in RENDER_SCALE=2 units, not raw PDF points. `rulelinebox.py`'s
`sf = args.scale / 2.0` correctly accounts for that when converting the
seed region into pixel coordinates for the high-scale render search (so the
*search* itself, and the printed `worst-edge agreement` values used for the
auto-accept threshold decision, were always correct — confirmed: those
values are computed as `(m - vg_x0) / 2`, which already cancels the
RENDER_SCALE=2 units and yields a genuine real-point difference). But the
final *measured box* returned from `measure_edges()`,
`m = [left / sf, top / sf, right / sf, bot / sf]`, only undid the
render-scale step — it never took the second `/2` needed to reach raw PDF
points, so it stayed in RENDER_SCALE=2 units (2x too large) all the way into
the CSV. Every hand-authored `.tableboxes.csv` entry in the corpus (the
original 137-table frozen set) stores raw PDF points directly — confirmed
by checking `014_MT#4` and `019_FL#15`'s own authored boxes against their
real page dimensions — so this was a genuine convention mismatch introduced
when `rulelinebox.py` was written this session, not a pre-existing issue.

**What this does NOT affect:** the auto-accept *decision* itself (the
`worst-edge agreement <= 4pt` threshold check) was always computed correctly,
since `agree` already cancelled the units bug — so every one of the 873 rows'
own claim to have been *validated* by two mechanically independent methods
agreeing within 4pt remains true. `RULELINEBOX_AUDIT.md`'s 19/20-correct
finding is also unaffected: that audit rendered pages at scale=2.0 and drew
the (buggy, 2x-inflated) stored numbers directly as pixel coordinates at that
same scale — the same units bug applied consistently on both the write side
and the audit's own visualization side, so the boxes it judged "tight and
correct" really were tight and correct; only the raw numbers stored in the
CSV, when read as PDF points by `boxscore.py`, were wrong.

**Consequence:** `boxscore.py` — the goal document's own named frozen gate —
regressed from its historical 137/137 to 137/164 once these 873 corrupted
rows entered the same corpus this session's own key-authoring grew. Any
downstream consumer reading `.tableboxes.csv` coordinates as raw PDF points
(which is the file's own documented schema) would have silently gotten boxes
2x too large for every `rulelinebox.py`-authored row.

**FIX (2026-09-13):** `rulelinebox.py`'s `measure_edges()` now divides by
`sf` **and then by 2.0** before returning `m`, landing in genuine raw PDF
points; the `agree` dict's own (already-correct) formula is preserved
unchanged, just re-derived from the corrected `m`. The `--apply` header
comment's "converted back to RENDER_SCALE=2 units" claim is corrected to
"converted to raw PDF points." All 873 already-written rows across 46
`.tableboxes.csv` files were corrected in place (each coordinate halved,
each row's own provenance string appended with a `[B-40 CORRECTED
2026-09-13...]` note disclosing the change) via a one-time script, not
silently rewritten.

**Verified:** `boxscore.py` after the correction: **163/164 CORRECT (99.4%),
mean IoU 0.9932** — up from 137/164 (83.5%). The single remaining failure
(`083_MA...#4`'s "ENERGY RECOVERY VENTILATOR SCHEDULE") is confirmed to be a
DIFFERENT, pre-existing, narrow scorer limitation, not a data bug: this page
genuinely carries two distinct real tables sharing the identical caption
(disclosed in this file's own `.tables.csv` key as "printed twice on this
sheet"), and `boxscore.py`'s `truth_for()` keys its truth dict purely by
title, so a second same-titled row silently overwrites the first — both
`.tableboxes.csv` rows for this title are independently correct
(worst-edge agreement 0.09pt each against vectorgrid's own two distinct
boxes), but only one survives the dict collapse to be scored, and by file
order it is compared against the wrong "got" candidate of the two. Left
open as a separate, narrow, disclosed scorer gap — not touched here given
how carefully-adjudicated `boxscore.py`'s own ruler already is (STATE.md:
"an argument I wrote and changed four times").

---

## B-41: cross-table cell/span misattribution inflates a table's own `region` far past its ruled box (092_IL, "CONDENSING UNIT SCHEDULE")

**Found 2026-09-13** during genuine `pixelruler.py` human-blind box-tier grading of
`092_IL_Guaranteed_Rate_Field_HVAC_AHU_Renovation.pdf` page 11 (Demo Corpus). Of this
page's 8 real HVAC schedule tables, 7 passed box-tier cleanly (worst edge 0.23–2.73pt,
all comfortably under the goal document's 4pt bar). The 8th, **"CONDENSING UNIT SCHEDULE
(CU)"**, failed badly.

**Evidence, measured blind, corner by corner:**
- Extractor's stored `region` (raw PDF points, `RENDER_SCALE=2` region-space):
  `[237.24, 2383.08, 3688.8, 3055.4]`.
- Top-left corner: `pixelruler.py` two-pass reading (coarse `--step 20 --zoom 1`, fine
  `--step 5-10 --zoom 4-6`) on a `render-page-hires.mjs --scale 3` render of page 11
  measured the real ruled corner at (357, 4882.5)px → converted (`pixel/3×2`) to
  (357.9, 3255.0) region-units — matches the stored `region`'s top-left within ~1pt.
  **The top-left corner is correct.**
- Bottom-right corner: the stored `region` claims (3688.8, 3055.4) → pixel (5533.2,
  4583.1) at scale 3. But no ruled line exists anywhere near that pixel position — the
  actual visible content there belongs to a completely different, adjacent table (the
  "DX COIL SCHEDULE"'s own SERVICE column, which prints "CU-1" as the name of the
  condensing unit that DX coil serves — confirmed by rendering the full row: `DC-1 |
  CU-1 | PATIO...`). The CONDENSING UNIT SCHEDULE's own real ruled table — visually
  confirmed by rendering its full 3-row grid (CU1/CU2/CU3, `SEE BELOW` NOTES column,
  ELECTRICAL DATA columns) — ends at pixel (4830, 4203) → region-units (3220, 2802).
- **Error: claimed region overshoots the real bottom-right corner by 468.8 region-units
  horizontally (234.4pt) and 253.4 region-units vertically (126.7pt)** — roughly 30x the
  4pt Demo Corpus tolerance on both axes.

**Root cause, mechanism-level confirmed:** the extracted table's row `CU1` carries a
`TAG` cell with bbox `[3644.8, 3036.6, 3688.8, 3055.4]` (text `"CU 1"`) — wildly
displaced from every other cell in that same row (all at
`y:[2617.44,2678.64]`, i.e. ~380 region-units higher up the page). This stray bbox's
own corner is an *exact* match for the table's corrupted `region.x1/y1`
(`3688.8, 3055.4`), and its coordinates land almost exactly on the DX COIL SCHEDULE
row's own "CU-1" SERVICE-column text identified above. This is a **cross-table span
misattribution**: a text span belonging to a neighboring table's cell was bound into
this table's own row grid as if it were a `TAG` cell, and whatever downstream logic
computes the table's overall bounding box does so via a simple min/max union over all
of its cells' bboxes (`_table_bbox()` in `sidecar/tables.py:169-181` is exactly this
pattern for the pdfplumber-sourced grid path — a plain `min(xs0), min(ys0), max(xs1),
max(ys1)` over every cell, with no per-cell distance-from-neighbors sanity check) — so
one bad cell silently drags the whole table's box far outside its own ruled lines.
**Not yet traced to the exact call that produced the misattributed cell itself**
(which extraction stage bound the DX COIL row's "CU-1" span into CONDENSING UNIT
SCHEDULE's own `CU1.TAG` slot is upstream of `_table_bbox` and wasn't isolated this
session) — disclosed as confirmed-at-the-mechanism-level, not fully pinpointed,
consistent with this catalogue's existing convention for findings of this shape
(e.g. B-27/B-37 cite an exact line; B-32/B-34 are mechanism-level only).

**Impact:** this is exactly the failure class the Demo Corpus's own no-auto-accept box
bar exists to catch — `rulelinebox.py`'s seeded-by-the-extractor's-own-region
methodology would never have found this, because it *starts* from the same corrupted
region to know where to scan and would have "confirmed" a box that isn't there.
Genuinely blind pixel measurement (read the full page first, independently decide
where the border is, only then check) is what caught it.

**Not fixed this session** — a general per-cell-outlier guard on `_table_bbox()` (e.g.
reject/flag a cell whose bbox center is implausibly far — several row-heights — from
its row's own other cells before it can inflate the union) is the right shape of fix,
but making that change safely needs the same corpus-wide regression sweep this
session's own standing rule requires before touching a shared, blast-radius-large
function, and the upstream span-misattribution call still needs isolating first so the
fix addresses the actual defect rather than only papering over its symptom.

---

## B-42: a schedule drawn as separate ruled fragments (caption+headers, then each floor section) never gets reassembled — real rows AND real headers both lost (028_TX, "NOISE CONTROL DUCT SILENCER SCHEDULE")

**Found 2026-09-13, CORRECTED same day after a deeper trace** — the first
write-up of this entry (below the line, kept for the record of how the
diagnosis moved) had a wrong unit conversion and stopped one layer too
shallow. The real mechanism is bigger and worse than first reported.

**The real page layout, confirmed by direct render at the correct pixel
scale (`raw_pt × 3`, not `raw_pt × 1.5` — see correction below):** vectorgrid's
own face-finder (`bakeoff/vectorgrid.py:find_tables`) sees this ONE physical
schedule as **three separate closed ruled faces**, not one: (1) the caption
"NOISE CONTROL DUCT SILENCER SCHEDULE" plus its 11 real column headers
(QTY./LOCATION & SERVES/DUCT WIDTH/.../NOTE), (2) the FIRST FLOOR
section — its own bold "FIRST FLOOR" divider label plus 14 real data
rows, (3) the SECOND FLOOR section — its own "SECOND FLOOR" divider plus 2
more real data rows. Confirmed directly with the bakeoff module's own
`find_tables()` called standalone: exactly 8 candidate bboxes on this page,
one of which (`(123.72,877.32)-(1566.24,1190.16)` raw pt) is the FIRST FLOOR
piece and another (`(123.72,1169.88)-(1566.24,1259.28)`) is SECOND FLOOR —
both real, both correctly found by the Python engine.

**What happens to each of the three fragments in the TS layer
(`scheduleTableFromODL`, `web/src/lib/sheetgraph.ts`):**
- Fragment 1 (caption+headers, 0 data rows of its own) is refused with
  `"no keyed data rows (kind equipment, key column col 0)"` — correctly,
  since it has zero data rows and nothing here is wrong with that refusal
  in isolation.
- Fragment 2 (FIRST FLOOR) IS accepted, titled `"FIRST FLOOR"` — but with
  a compounding defect nobody had reason to suspect from the outside: since
  its own leading row is the "FIRST FLOOR" divider label (spanning nearly
  every column) and it has no title/header rows of its own, the rescue at
  `sheetgraph.ts:10166` (`if (headerEnd <= bodyStart && titleCell && R -
  bodyStart >= 2) headerEnd = bodyStart + 1`) treats the divider as the
  table's `titleCell` and then promotes the table's own FIRST REAL DATA ROW
  ("2 | GROUP REHEARSAL 123 - SUPPLY/RETURN | 18 | 14 | 745 | ...") to serve
  as its column headers. Confirmed live (`OPENTAKEOFF_DEBUG_KEYCOL`
  instrumentation, removed after use): the accepted table's own `headers`
  array is literally `["2","GROUP REHEARSAL 123 - SUPPLY/RETURN","18",
  "14","745","426","0.16","36","21","PRICE/STC-55","1,2,3,4,5,6"]` — the
  real column names (QTY., LOCATION & SERVES, DUCT WIDTH (IN.), ...) never
  reach this table at all, because they live in Fragment 1, which was
  refused and discarded. This also explains the previously-unexplained
  13-vs-14-row discrepancy this ledger flagged but did not resolve: the
  real first data row is consumed as a fake header, so only 13 of FIRST
  FLOOR's 14 real rows ever reach `rows`.
- Fragment 3 (SECOND FLOOR) is refused with `"no header block above the
  data"` — its own only row is the "SECOND FLOOR" divider, so no header
  block can be found within the fragment alone, and (per that refusal's own
  code comment, `sheetgraph.ts:10161-10165`) it is deliberately NOT rescued
  because a title-less fragment must not risk reading a real data row as a
  header elsewhere in the corpus. It is dropped with nothing standing in
  for it — not merged, not re-attempted, gone.

  (**Correction to the first write-up:** that version converted this
  fragment's declined-region coordinates using the wrong scale factor
  [`×1.5`, treating them as `RENDER_SCALE=2` region-units] and rendered the
  wrong part of the page, concluding this declined region was an unrelated
  isometric duct-detail drawing. Re-rendering at the correct `×3` — these
  coordinates are raw PDF points from `vectorgrid_rpc.py`'s own documented
  space, and the render scale used throughout this session's grading was 3
  — shows unambiguously that this declined region *is* SECOND FLOOR: its
  divider label and both real data rows, `ROCK REHEARSAL 218` and
  `VEST 212`, are directly visible in it.)

**Net result:** the real 16-row, 11-column schedule survives as one 13-row
table with a title ("FIRST FLOOR") that is not its real caption and column
headers that are not real column names but literal data values from its own
first row — a table that reads exact-match on cell CONTENT in isolation
(this ledger's own 028_TX cell-tier pass never checked headers, only cell
values row-by-row) yet is structurally wrong in a way plain row/cell
counting does not surface.

**FIXED (2026-09-13, same session, after the revert below was superseded).**
The user explicitly rejected stopping at "disclosed but not fixed" for this
bug and asked for the real fix; the three-way cluster merge described as
the "well-scoped next step" below was implemented in full in
`web/src/lib/vectorGridAdapter.ts`'s `extractScheduleTablesFromVectorGrid`,
verified end-to-end against this exact document, and shipped.

**What shipped:** `extractScheduleTablesFromVectorGrid` now runs in two
phases. Phase 1 is unchanged — every raw vectorgrid piece is attempted
independently, `{raw, built, why}` kept for all of them regardless of
order. Phase 2 repeatedly (bounded to 6 rounds) finds an unbuilt fragment
whose own refusal reason is a narrow, structural shape — `"no header block
above the data"` unconditionally, or `"no keyed data rows"` only when the
fragment has `<= 3` rows of its own (`isMergeEligibleFragment`) — and
stacks it onto any geometrically-adjacent neighbour, built or not
(`isFragmentAdjacent`: same column count, outer x-extent within 3pt, and
vertically within 30pt allowing OVERLAP or gap in either direction — real,
measured: adjacent faces here overlap by ~20pt rather than touching
cleanly), then re-runs the unmodified `vectorGridTableToScheduleTable` on
the merged piece. A successful merge replaces the neighbour's attempt and
removes the consumed fragment, so the loop converges over multiple rounds
without needing the three fragments to be adjacent pairwise in one pass.

**The extra bug the three-way merge surfaced and that also needed fixing:**
a naive concatenation of FIRST FLOOR onto SECOND FLOOR double-counted one
row. Because adjacent vectorgrid faces overlap at the seam, SECOND FLOOR's
own face had redundantly, silently re-captured FIRST FLOOR's own LAST real
data row as its own "row 0" — concatenating both fragments verbatim would
have duplicated that row and, worse, broken `findEvidencedKeyColumn`'s own
uniqueness requirement on the merged table (two rows sharing an identical
composite key is exactly the shape it exists to refuse). Fixed with an
exact position+text row-signature comparison (`rowSignature`,
`concatFragments`): if the bottom fragment's own row 0 signature exactly
matches the top fragment's own last row, the bottom's row 0 is dropped
before the rest are offset — position AND content must match exactly, not
"close", so the generous adjacency-gap tolerance above can never silently
eat a real row on its own. A second helper, `stripInteriorDividerRows`,
drops any row other than row 0 that is a single cell spanning `>= cols-1`
columns (a mid-table divider like "SECOND FLOOR") from the FULLY merged
table — this has to run on the merged result, not per-fragment before
merging, because `findEvidencedKeyColumn` scans raw column text before
`buildRows`'s own per-row divider skip ever executes, and a divider row's
text left anywhere in the raw grid corrupts its column-uniqueness check.
Row 0 is deliberately exempt from this stripping: a genuine title band has
the identical one-cell-spans-everything shape and must survive.

**Verified live**, re-running `production-graph-cli.mjs` against this exact
page (`p1-slice.pdf`) after the fix: the schedule now extracts as ONE
16-row table titled `"NOISE CONTROL DUCT SILENCER SCHEDULE"` with its real
11 column headers (`QTY.`, `LOCATION & SERVES`, `DUCT WIDTH (IN.)`, `DUCT
HEIGHT (IN.)`, `AIR FLOW (CFM)`, `AIR VELOCITY (FPM)`, `PRESSURE DROP (IN.
WG.)`, `DYNAMIC INSERTION LOSS (DB) @ 125 HZ`, `GENERATED NOISE (DB) @ 125
HZ`, `MANUFACTURE /MODEL`, `NOTE`) and all 16 real keyed rows (14 FIRST
FLOOR + 2 SECOND FLOOR, `GROUP REHEARSAL 123...` through `VEST 212...`) —
matching this ledger's own earlier hand-transcription exactly, headers
included, where the un-fixed pipeline previously returned a 13-row table
falsely titled `"FIRST FLOOR"` with its own first data row misread as
column headers.

**Regression-checked, no changes needed elsewhere:** re-ran
`production-graph-cli.mjs` on the saved page slices for every other
document in this ledger with vectorgrid-sourced tables graded earlier this
session — `045_FL` (3 tables, 9/10/5 rows), `072_CA` (6 tables, 11/6/1/22/
1/11 rows), `019_FL` (8 real tables + 1 known pre-existing title-block
false positive, unaffected), `11_CA` (4 tables including the 41-row VAV
schedule) — every title and row count is byte-identical to the
previously-recorded values, confirming the new merge logic is a true
no-op for tables that are not split into fragments this way. Also added a
synthetic 3-fragment regression test (`web/test/vectorGridAdapter.test.ts`,
mirroring this exact document's own shape: a caption+header-only fragment,
a FIRST-FLOOR body, a SECOND-FLOOR body with the seam-duplicate row) that
exercises `isFragmentAdjacent`/`stackFragments` directly and asserts the
fully-merged table's title, headers, and row keys — independent of the
real PDF, to guard this fix against regression.

**Design note on scope, preserved from the original next-step plan:** only
clusters containing at least one originally-refused piece are ever
attempted (`isMergeEligibleFragment` is deliberately narrow — one exact
refusal string, and the other confined to `<= 3` rows), so two
independently-successful standalone tables are never merged by accident;
the regression check above is the live proof of that, not just a design
intent.

---

### Earlier attempt (2026-09-13, superseded by the fix above — kept for the record)

Before the fix above was completed, a first attempt at the same three-way
merge was built, then reverted rather than shipped partially, on the
reasoning that a two-body-only merge would still leave headers silently
wrong. That reasoning was correct as far as it went, but the FULL three-way
merge was in fact achievable in the same session and is what shipped above.
Kept here for the record of how the diagnosis moved. Live-tested against
this exact document through three iterations:
1. First attempt: geometric adjacency check required the fragments to
   touch or have a small gap; the real fragments actually OVERLAP by
   ~20pt in their measured bounds, so nothing matched. Fixed by making the
   tolerance symmetric (allow overlap or gap, both bounded).
2. Second attempt: geometry matched and the merge ran, but the WHOLE
   table then lost every row (`no keyed data rows`) — the divider row's
   own text ("SECOND FLOOR") was still present in the merged raw cells and
   confused the `findEvidencedKeyColumn` pass, which runs over raw
   column-0 text *before* `buildRows`' own divider-row skip ever executes.
   Fixed by stripping the divider row's own cells at merge time instead of
   relying on that later skip.
3. Third attempt (after the fix above): the merge of FIRST FLOOR +
   SECOND FLOOR alone still failed, and tracing why is what surfaced the
   FIRST FLOOR-side header-corruption defect described above — the real
   fix needs a THREE-way fragment merge (caption+headers fragment,
   prepended; FIRST FLOOR body; SECOND FLOOR body, appended), not a
   two-way one, and the caption+headers fragment is refused and discarded
   *before* FIRST FLOOR is even accepted in iteration order, so the
   adapter's simple forward-only loop cannot reach it without a real
   restructure (collect all fragments first, cluster geometrically
   adjacent same-column pieces regardless of build order, merge each
   cluster once).

Reverted rather than merged partially: shipping just the two-body merge
would still leave every affected table's headers wrong (silently — no
error, just wrong column names), which is not an improvement over today's
silent row loss, just a different silent defect. This codebase's own
standing convention is not to land a shared-code change until it is
verified correct, and a 3-way cluster merge needs real design + a corpus
regression pass before it is safe, not a quick patch under time pressure.

**The next-step plan this attempt handed off** (two phases, geometric
clustering, strip interior dividers, re-run the unmodified builder per
cluster) is exactly what was implemented and shipped in the fix above —
kept here unedited for the record rather than rewritten as if it had
predicted its own outcome.

**Superseded — see the "FIXED" section above for the shipped result.**

---

### Original write-up (2026-09-13, superseded above — kept for the record)

**Found 2026-09-13** while extending genuine `pixelruler.py` box-tier grading to
028_TX's 3 remaining tables (the ledger's earlier "5/8 box-graded" note). This
document's page-1 "NOISE CONTROL DUCT SILENCER SCHEDULE" is a single ruled table
with two internal bold section-divider rows, "FIRST FLOOR" and "SECOND FLOOR",
each followed by its own data rows (confirmed by direct render: FIRST FLOOR
carries 14 data rows, SECOND FLOOR 2 more — 16 real rows total under one real
caption, exactly matching this file's own earlier hand-count).

**What production actually returns for this page:** only 2 tables —
`EXTERNAL STATIC PRESSURE SCHEDULE` (17 rows, correct) and one titled
**`"FIRST FLOOR"`** (13 rows). The real caption above it, "NOISE CONTROL DUCT
SILENCER SCHEDULE", is nowhere in the output as a title. SECOND FLOOR's own
2 rows do not appear anywhere in the extracted graph at all.

**Root cause (WRONG, corrected above):** this entry originally concluded the
nearest declined region was an unrelated isometric duct-detail drawing, due
to a unit-conversion error (`×1.5` instead of `×3`), and left the real
mechanism untraced. See the corrected write-up above for what is actually
happening.

---

### B-43 — `vectorgrid.py` measures a page's own MediaBox instead of the box every renderer actually paints (its CropBox), silently disabling vectorgrid on any page where the two differ (FIXED 2026-09-13)

**Found while investigating B-32.** 013_MO_T2523_01_Replace_Boilers_Phase_2_
Building_29.pdf#23's trace (`OPENTAKEOFF_GRAPH_TRACE=1`) showed something
B-32's own entry did not yet explain: `L1.8:vectorgrid did not run` for
this sheet at all, with the exact reason `"vectorgrid measured
3024x2160pt (x2 = 6048x4320) but the viewport is
5033.6885999999995x3374.3552"`. Every table on this page was therefore
already coming from the strictly weaker geometric fallback before it ever
reached vectorgrid — the actual, deeper reason B-32's `BOILERS` schedule
was garbled, not a defect in vectorgrid's own reading of it.

**Root cause, confirmed exactly, not inferred.** This page's own MediaBox
is `[0,0,3024,2160]`, but its CropBox is `(252.9337,239.8604)-
(2769.778,1927.038)` — a real, deliberate CropBox smaller than the
MediaBox, the ordinary way a CAD/CAM exporter marks its own plotter
registration/bleed area as outside the sheet's own visible border.
`vectorgrid.py`'s `find_tables()` measured `page_w, page_h =
float(page.width), float(page.height)` — pdfplumber's own `Page.width`/
`.height`, which default to the MediaBox regardless of CropBox (confirmed
directly in pdfplumber's own source: `self.bbox = self.mediabox` at
construction, never updated except by an explicit `.crop()` call the
production pipeline never makes). But `pageBoxAgrees`
(`vectorGridAdapter.ts`) compares that measurement against the viewport
pdf.js's own `page.getViewport()` produces — and pdf.js sizes its
viewport from the page's CropBox (intersected with the MediaBox, per the
PDF spec), not the MediaBox alone. The exact arithmetic proves it, not
just the shape of the mismatch: CropBox width×height = 2516.844×1687.178pt;
× `RENDER_SCALE=2` = 5033.688×3374.356 — **the measured viewport, to 3
decimal places.** `vectorgrid_rpc.py`'s own module docstring already
promises "the same space a renderer uses" — that promise was already
false on any page shaped like this one, a real, previously-unnoticed gap
between the module's own stated contract and what it actually measured.

**A second, independent consequence of the same gap, confirmed live:**
`page_origin()` (this same file) returns the MediaBox's own corner for
`segments_from_page()`'s own coordinate normalization — but PyMuPDF
(`celltext.py`'s own text engine) already normalizes its OWN word
positions to the CropBox's corner (`page.rect` is `(0,0,cropbox_w,
cropbox_h)`, confirmed directly). On a page whose MediaBox happens to
start at `(0,0)` (this one does), that means segments/cells stayed in
raw, un-shifted MediaBox coordinates while PyMuPDF's own words were
ALREADY shifted to CropBox-relative coordinates — a silent, constant
misalignment between where `vectorgrid.py` thinks a cell's face is and
where `celltext.py` thinks a word is, on any such page where vectorgrid's
own `pageBoxAgrees` check happens not to trip (a rotation-only agreement,
or a mismatch small enough to sit inside its tolerance). Not measured
independently of the fix below, since the same root cause and the same
fix close both.

**Why `pageBoxAgrees` refusing was the right call, and not enough.**
Refusing rather than silently emitting boxes in the wrong space is
exactly this coordinate contract's own standing discipline (`vectorGrid
Adapter.ts`'s own header comment), and it worked as designed here — but
refusing disables vectorgrid for the WHOLE sheet, forcing every real
table on it onto a strictly weaker fallback path. The right fix is
measuring the correct box in the first place, not merely detecting the
disagreement after the fact.

**Fix**, `bakeoff/vectorgrid.py`: a new `_effective_box(page)` returns the
MediaBox intersected with the CropBox (defensive against a malformed
CropBox that PDF spec says should already sit inside the MediaBox, never
trusted blindly); `page_origin()` now returns this box's own corner
instead of the raw MediaBox's; `find_tables()`'s own `page_w`/`page_h`
now come from the same box's width/height instead of `page.width`/
`page.height`. `page.cropbox` already falls back to the MediaBox when a
page defines no explicit CropBox (confirmed in pdfplumber's own
construction), so this is a genuine no-op on every ordinary page and only
changes behavior on the shape this entry measures.

**Verified live.** Before the fix: `pageWidth`/`pageHeight` reported
`3024`/`2160`; `pageBoxAgrees` refused with `"size"`; 0 vectorgrid tables
on this sheet. After: `pageWidth`/`pageHeight` report `2516.8443`/
`1687.1776` — an exact match to the viewport, confirmed via the RPC
response directly, not just inferred from behavior — and vectorgrid runs,
returning 7 raw candidates instead of 0.

**Scope, measured, not guessed.** Scanned every PDF's own MediaBox/CropBox
in `bulk/` (113 documents, 4,799 pages) and `raw/` (10 documents): exactly
**1 document, 013_MO**, is affected — but severely, on **25 of its own 28
pages (89%)**, meaning this single document had vectorgrid unconditionally
disabled on nearly every sheet it has, regardless of that sheet's own
content quality, before this fix. Whether other corpus locations
(`takeoffs/`, documents outside these two directories) carry more
instances was not checked under this pass.

**Regression-checked clean.** Re-ran `production-graph-cli.mjs` against
every vectorgrid-sourced document already verified this session
(028_TX, 045_FL, 072_CA, 019_FL, 11_CA, 080_CA#17/#21, 063_MT#9) —
every title and row count byte-identical before and after, confirming
this fix is a true no-op for every page whose CropBox does not differ
from its MediaBox, which is every page in this list.

**Honest, NOT a claimed fix for B-32 itself.** Re-ran the full 28-page
013_MO document before/after: the sheet's own final table COUNT is
unchanged (12 both ways), but the CONTENT differs, and the result is
genuinely mixed, not a clean win — measured directly, not assumed:
- The `"DIA. (in)"` candidate (B-32's own misnamed `BOILERS` table) now
  reports **8 rows**, matching the real, hand-confirmed count exactly
  (previously 1 garbled composite row) — a real improvement in row
  count, though its title is still wrong and it is still classified
  `reference` rather than `equipment` — B-32's own title-fabrication and
  misclassification mechanisms are UNCHANGED, unrelated code paths this
  fix does not touch.
- `HVAC PIPING MATERIAL SCHEDULE`'s own duplicate-title split (previously
  two entries, `rows:1` and `rows:3`) is now one unified entry (`rows:4`)
  — B-32's own table-split defect closed for this specific instance.
- `GAS CONNECTED LOAD TABLE` went from `rows:5` (previously a 1-row
  overcount against 4 real) to `rows:43` — WORSE, a large new overcount.
  `VARIABLE FREQUENCY DRIVE SCHEDULE` split into two 1-row entries
  (previously one 3-row entry; the real count is 1 row per this document's
  own key). Traced to a SEPARATE, independent, not-yet-root-caused defect
  in this specific document: PyMuPDF's own raw word list shows the SAME
  title text (`"VARIABLE"`/`"FREQUENCY"`) drawn multiple times at several
  distinct, nearby-but-different coordinates — genuine duplicate/double-
  struck content in this document's own source, confirmed directly, not
  inferred — which vectorgrid's own face-finder has no reason to expect
  and no logic to consolidate. This is why 013_MO's own extraction remains
  imperfect even after this fix: it has TWO independent defects layered on
  the same pages, and this entry closes only the first.

**Net assessment:** ships as a genuine coordinate-contract correctness
fix, proven correct by exact arithmetic (not a heuristic), proven a
no-op everywhere it does not apply, and proven to unlock at least one
real, measurable improvement (BOILERS's own row count, the table-split
closure) on the one document it touches — without overclaiming that it
resolves B-32, whose own remaining defects (title fabrication,
misclassification, and this newly-found duplicate-content issue) are
distinct, unrelated code paths still open.

### B-44 — a real data row silently drops out of `sheetgraph.ts`'s own in-house table extractor whenever a far-right cell's ordinary font-height jitter outranks a much larger true left-right position gap in the row's own reading-order sort, undercounting D04's VAV schedule and (originally, wrongly, blamed on a different, non-running backend for D05/D09's rooftop unit schedule — see the correction below) (NOT FIXED — root cause now fully traced and confirmed by a working, corpus-tested fix; reverted because it exposes a separate, pre-existing table-candidate-arbitration bug elsewhere in the same file — see GOAL.md's own shared-path rule)

**Where:** `federal-attachment4-mechanical.pdf#16` (`VOLUME CONTROL BOX
SCHEDULE`, D04's own fixture) and `baker-county-eoc-bidset.pdf#41`
(`PACKAGED ROOFTOP AIR CONDITIONING UNIT SCHEDULE (GAS HEAT)`, D05's own
fixture — the identical PDF T-VALVE-01/T-HVAC-01 and the linear-takeoff
held-out tier already use elsewhere in this corpus). Found chasing
`npm test`'s own `demoD04`/`demoD05`/`demoD09` regression failures
during a GATE 3 guard-green pass.

**D04, measured exactly, not estimated.** `VOLUME CONTROL BOX SCHEDULE`
extracts 55 of 58 real rows; `VAV-16`, `VAV-17`, and `VAV-43` are the
three missing. Direct `textSpans()` extraction confirms all three are
ordinary, well-formed rows: same tag-column x-range (`x0=2371.7`), same
25.9pt row pitch, same 17-cell shape as their own immediate, correctly-
extracted neighbors (`VAV-15`/`VAV-18`, `VAV-42`/`VAV-44`) — nothing
about their own printed geometry is anomalous. `VAV-16` and `VAV-17`
happen to share byte-identical cell values (a real, ordinary coincidence
— two same-size boxes), which is the only structural thing that
distinguishes them from their neighbors.

**D05/D09, measured exactly.** The `PACKAGED ROOFTOP AIR CONDITIONING
UNIT SCHEDULE`'s own title text is a real, single, correctly-extracted
span (`findText` returns it once, cleanly) — the table simply never
becomes a `ScheduleTable` at all; `graph.tables` has zero entries with
any region overlapping its own real geometry. That geometry is real and
ruled: 201 vector segments confirmed spanning `x:[645,3662]`, with
horizontal rules at `y=423/631/678/725` running the table's own FULL
width (14 contiguous collinear segments each). But the header band
between `y=423` and `y=631` (208pt) is UNEVEN across columns: the
`SERVICE`/`MANUFACTURER`/`MODEL`/`NOMINAL`/`SUPPLY AIR` column group has
no internal divider (one tall header cell), while the
`COOLING`/`GAS HEATER`/`EXHAUST`/`SUPPLY AIR FAN` column group has two
further dividers at `y=470` and `y=517` (a genuine 3-tier sub-header) —
both real, both correct, on the SAME physical table.

**CORRECTION (2026-09-19), scope note:** the fix described below is
confirmed, by direct A/B measurement, to explain and repair ONLY the
D04 shape above (a real row's own key cell mis-selected out of a
correctly-banded set of tokens) — it does NOT touch whether a table is
found at ALL. WP1's own `federal-mech.compile.json` check, run both
before and after the fix, shows `BOILER`/`EXPANSION_TANK` (both a
whole-family, whole-table-vanish shape exactly like D05/D09's own
rooftop schedule here) sitting at 0 of 2 UNCHANGED by the fix — direct,
measured proof that D05/D09's own whole-table disappearance is a
SEPARATE mechanism from D04's row-drop, not the same bug's second face
the way the original (vectorgrid-attributed) write-up assumed. D05/D09
almost certainly belong with B-45's own whole-table-vanish shape below
instead — not re-confirmed against baker-county-eoc-bidset.pdf#41
directly this pass, so left catalogued here rather than reassigned on
an unconfirmed assumption, but a future pass should check that directly
before doing any further work under this entry's own name.

**CORRECTION (2026-09-19): the root cause below was wrong.** Everything
in the paragraph that follows — `vectorgrid_rpc.py`'s `extract_grid`,
`_axis`, `_span`, `SANITY_MIN_FILL` — describes a real mechanism in a
real file, but not the one that produced D04/D05/D09's own numbers in
THIS environment. Directly checked via `graph.notes` (the diagnostic
field naming which extraction layer ran per sheet): vectorgrid never
successfully runs here at all — every attempt on every sheet fails
identically with `ModuleNotFoundError: No module named 'pdfplumber'`
(`sidecar/vectorgrid_rpc.py` imports `bakeoff/celltext.py`, which
imports `pdfplumber` at module scope; that package is not installed in
this environment). The prior write-up reasoned convincingly from the
Python source's own docstrings and this file's own B-20 precedent
without first confirming that code path actually executes — a real
process failure this correction exists to name plainly, not just fix
quietly. The corpus has THREE independent table-extraction backends
with graceful fallback (Python vectorgrid → Java OpenDataLoader-PDF →
an in-house TypeScript text-span clustering pass in
`web/src/lib/sheetgraph.ts`); direct testing (feeding
`federal-attachment4-mechanical.pdf#16` to each backend independently)
confirms neither Python nor Java produces D04's own VAV table at all —
the THIRD backend, `sheetgraph.ts`'s own `bandDataRows`, is the one
actually running and actually producing the buggy output. The real
mechanism, traced to the exact line:

`bandDataRows` (`web/src/lib/sheetgraph.ts`, ~line 4880) clusters a
sheet's text spans into rows (`clusterRows`), then for each row bands
the tokens inside this table's own column range and reads `banded[0]` —
the array's first element — as the row's KEY cell (the tag `rowKeyOf`
checks). That array comes from `joinGraphSpans` (`equiptags.ts`), whose
own final step sorts EVERY row it is given by `(y0, x0)` — top edge
first, left edge second — a sort built for `joinGraphSpans`'s OTHER,
cross-row callers, and coincidentally also correct for a QUARTER-TURNED
schedule's own row (there, one physical row's cells share nearly the
same x and fan out across y, so y0 legitimately carries the reading
order). For an ORDINARY horizontal row it is wrong: two cells on the
same visual baseline routinely have slightly different top-edge y0 from
ordinary font/glyph-height variance — nothing anomalous, just different
type sizes in adjacent cells. Measured exactly on `VAV-16`'s own row
(`federal-attachment4-mechanical.pdf#16`): the row's real key cell,
`VAV-16` (`x=2371.7, y=691.7`), sits beside a far-right cell containing
generic template boilerplate text, `"BUILDING XX"` (`x=5503.7,
y=687.4`) — 3132px away in x, but only 4.3px "higher" in y0 (a taller
font, not a different line). `(y0, x0)` sorts the y0-smaller cell first
regardless of how far away it sits in x, so `banded[0]` became
`"BUILDING XX"`, `rowKeyOf` correctly refused to read it as a tag, and
the ENTIRE row — VAV-16's own real cell data included — silently folded
into the orphan pool instead of minting a row. `VAV-17`/`VAV-43` fail
the identical way on the same sheet; `CONDENSING_UNIT`'s own missing
rows on the same document reduce to the same mechanism.

**A fix was designed, implemented, and corpus-tested — then reverted.**
Re-sorting each row's own banded tokens by whichever axis they actually
spread across (x when a row's own x-spread exceeds its y-spread, y
otherwise — preserving the quarter-turned case exactly while fixing the
ordinary case) is a 15-line change confined to `bandDataRows`. Measured
directly against `federal-mech.compile.json` (WP1's own reviewed key):
before, 114 of 128 items, with `FCU` 6/7, `VAV` 55/58, `CONDENSING_UNIT`
2/6, `GRD` 21/23 all short; after, 124/128 — `FCU` 7/7, `VAV` 58/58,
`CONDENSING_UNIT` 6/6 (all four missing units recovered, not just the
two named above), `GRD` 23/23, all exactly matching truth. `BOILER` and
`EXPANSION_TANK` stayed at 0/2 before and after, unchanged by this fix —
real, direct confirmation that the whole-table-vanishing shape (B-45,
below) is a genuinely SEPARATE mechanism from this one, not the same bug
wearing two faces.

But the fix does not ship, because of what it unlocks elsewhere. Once a
row is no longer wrongly dropped, some OTHER table on a DIFFERENT sheet
whose own "weak" extraction under one vocabulary (`finish`/`equipment`)
used to fail with zero rows for the exact same reason now succeeds —
and this corpus's existing, deliberately-written cross-kind dedup logic
(`buildSheetGraph`'s own by-title collision pass, and
`extractReferenceTableAt`'s own "already claimed by a real pass" skip)
was tuned against a DIFFERENT known corpus case
(`itd-d1-lab-mechanical.pdf#12`'s own SNORKEL HOOD SCHEDULE) where a
structurally-driven `reference`-kind read is ALWAYS the worse one against
a real vocabulary hit. Patching the dedup pass to prefer whichever
candidate is genuinely richer (gated so the original SNORKEL HOOD
protection still holds) fixed the newly-exposed collision
(`bldg5406-hvac-demo-mechanical.pdf#6`'s own quarter-turned FAN
SCHEDULE, which the row-order fix legitimately unlocks a real, complete
`reference`-kind read of) — but then caused a DIFFERENT real regression
two levels away (`navfac-cherry-point-atc-mechanical.pdf#42`'s own
`BOILER SCHEDULE`, `B-A1`/`B-A2`, silently dropped from `graph.tables`
entirely via what is very likely the SAME "bogus reference-kind title"
failure mode this file's own `extractReferenceTableAt` comments already
describe for the SNORKEL HOOD case, now reachable from a second
direction). Two independent, careful patches to this arbitration layer
each fixed their own targeted case and broke a different one — real
evidence the shared-path table-candidate arbitration in `sheetgraph.ts`
is more tightly tuned to its existing corpus cases than a local patch
can safely extend, not that the row-order fix itself is unsound. Per
this file's own standing rule (revert, don't force, a change that
regresses the corpus), the full three-part patch (row-order fix +
dedup richness gate + claim-coverage threshold) was reverted in full;
`sheetgraph.ts` is back at its pre-session state. The row-order fix
alone (without the two arbitration patches) passes the full corpus
regression suite except this entry's own `D07` — meaning it is CLOSE to
shippable, but "guard-green minus one test" is still not guard-green,
and shipping the row-order fix without addressing what it unlocks would
just trade this entry's own bug for a documented one.

**Why this is disclosed without a fix.** The real work remaining is not
another local patch to `bandDataRows` — that function is now correctly
understood and its own fix is sound in isolation — but a genuine,
corpus-wide-tested pass through `sheetgraph.ts`'s own cross-kind
table-candidate arbitration (the by-title dedup in `buildSheetGraph`,
and `extractReferenceTableAt`'s own "already claimed" skip), verifying
EVERY existing corpus case that logic was tuned against (SNORKEL HOOD
named explicitly; there may be others un-named in comments) still
resolves correctly under a richness-aware rule, before the row-order fix
that exposes the need for that rule can safely ship alongside it. Not
attempted here under this session's own no-guessing-at-fixes-under-time-
pressure rule — two iterations already showed the failure mode is real
and not confined to one pairing.

**Consequence:** GATE 3's own `guard-green` criterion
(`opentakeoff-corpus/goals/LINEAR_TAKEOFF.md`) stays unmet on the mcp
side specifically because of `demoD04`/`demoD05`/`demoD09` (D04
undercounts `vav_count` by 3; D05/D09 both fail identically on
`"packaged rooftop schedule must remain extractable"`) — three separate-
looking `npm test` failures that are one root cause, not three.

### B-45 — a whole schedule table (`CHW CONTROL VALVE SCHEDULE`, Building M) vanishes from its own sheet while its immediate physical sibling (`HHW CONTROL VALVE SCHEDULE`, same building, same sheet) extracts correctly, undercounting T-HVAC-01/T-VALVE-01 by 19 of their own 21-item gap (NOT FIXED — found, traced, disclosed; also corrects this file's own stale "What is working" claim below)

**Where:** `navfac-cherry-point-atc-mechanical.pdf#47`. Found chasing
`npm test`'s own `takeoffHvac01`/`takeoffValve01` regression failures
during the same GATE 3 guard-green pass as B-44 — both tests assert
`CHW_CONTROL_VALVE.count === 64` / `HHW_CONTROL_VALVE.count === 99`
(`opentakeoff-corpus/takeoffs/T-VALVE-01-navfac-control-valves/truth.json`);
both currently read 45 and 97.

**Measured exactly, not estimated.** Truth's own 19 missing CHW tags
(`CV-AHU-M1-CHW`, `CV-CRAH-M1A/1B/2A/2B-CHW`, `CV-CH-C-MT1/MT2`,
`CV-CHW-BP-M`, `CV-DOAH-M1-CHW`, `CV-FCU-M1A/1B/2A/2B/3/4A/4B/5/6/7-CHW`
— 19 of 19) all carry `sheet_id: "...#47"`, `table_title: "CHW CONTROL
VALVE SCHEDULE"`, and an IDENTICAL `bbox_px` left edge (`x0=1709.52`) at
a perfectly regular 34.56pt row pitch — one coherent, physically real
sub-table. `graph.tables` has ZERO entries whose title matches `/CHW
CONTROL VALVE/i` anywhere near sheet `#47` (the two that DO exist,
`region`s `[3460…4442,485…1337]` and `[3639…4492,1424…2379]`, both carry
`{sheet}` on `#44` and `#49` respectively — different, unrelated
Building-A and Building-T instances of the same recurring caption).
Sheet `#47` itself is NOT a blackout page (B-28's own "whole page, zero
tables" shape ruled out directly): it yields 8 OTHER real tables,
including `HHW CONTROL VALVE SCHEDULE` (33 rows, Building M) — its own
immediate physical neighbor, almost certainly the side-by-side column
block sharing the same schedule region, extracted essentially correctly
(33 of 35 real HHW-M rows; `M112`/`M113` are the small residual 2-item
gap, and 31 of the 33 extracted rows carry a truncated tag lacking the
expected `CV-`/`-HHW` wrap — `CUH-M1` instead of `CV-CUH-M1-HHW` — a
separate, likely-simple tag-formatting defect in
`web/src/lib/corpusTakeoff.mjs`'s own valve-naming logic, not traced
further this pass since it does not move any of the two failing tests'
own asserted `.count` numbers).

**New evidence (2026-09-19), a real lead not previously checked.**
Read this page's own raw PDF text directly (`pdf.ts`'s own `textSpans`,
independent of any extraction pipeline) rather than only `graph.tables`'
own output. `CHW CONTROL VALVE SCHEDULE`'s own title span is real, single,
and well-formed (`x0=1723.9, y0=280.4, x1=2380.7`), and its own data rows
directly beneath it are ordinary, complete, and correctly tagged
(`CV-AHU-M1-CHW`, `CV-CRAH-M1A-CHW`, … starting at `y0=410.7`, same
25.9-34.5pt-scale row pitch as every other schedule on this document) —
nothing about the SOURCE PDF is malformed or unusual. But
`HHW CONTROL VALVE SCHEDULE`'s own title span sits on the EXACT SAME
line — `x0=600, y0=280.4, x1=1256.8` — CHW and HHW are printed as two
independent, physically SIDE-BY-SIDE schedules sharing one title row,
CHW to the right of HHW with roughly a 470pt gap between them. And
`graph.tables`' own surviving `HHW CONTROL VALVE SCHEDULE` entry has a
detected `region` of `[417.6, 280.4, 2418.6, 1647.6]` — its own
right edge (`x1=2418.6`) lands just 38pt past CHW's own title's right
edge (`x1=2380.7`), and its own `y0` (`280.4`) is CHW's title's `y0`
EXACTLY. That is far too precise a coincidence to be unrelated: HHW's
own detected table region, as extracted, already reaches out far enough
to physically cover essentially the whole of CHW's own column space,
title included — the same general SHAPE as B-44's own confirmed
mechanism (two spans on the exact same logical row/line getting
clustered or bounded together across a real but unrelated gap), here
manifesting as whole-column consumption rather than a single
mis-selected cell. Column-level confirmation: HHW's own extracted
`anchors` are `MARK(x=486.6)`, `FLOWRATE VALVE GPM(x=844.15)`,
`SIZE(x=967.7)`, `NOTES(x=1400.05)`, `GPM(x=1978.65)` — five columns,
all sitting comfortably to the LEFT of CHW's own title (`x0=1709.52` per
truth's own `bbox_px`, matching CHW's own raw `VALVE MARK` header token
at `x=1749.8` closely) — so HHW's own COLUMN detection did not
literally re-read CHW's own cells as extra HHW columns; the two tables'
own column grids stay genuinely distinct even though their outer
`region` boxes overlap. This narrows the mechanism specifically to
whatever computes/uses a table's own bounding `region` (title-hunt or
boundary detection) rather than the column/anchor or row-banding logic
`bandDataRows`/`columnStarts` already cover — a real, useful distinction
B-44's own investigation did not need to make, since that bug never
touched region computation at all.

**Not yet identified: the exact function that consumes CHW's own
title/header block once HHW's own region is computed to cover it** — the
`extractTableAt`/`findHeaderRow` chain (`sheetgraph.ts`) is the right
place to keep looking (same file, same general "title-hunt walks a row
and reads more of it than one table's own share" family as B-44's
`joinGraphSpans` mechanism), but this was not traced to a specific
line the way B-44 now is, and — given B-44's own precedent this same
session, where a clean local fix cascaded into a corpus-wide dedup
regression two levels away — should not be assumed shippable in
isolation even once found.

**Relationship to already-catalogued bugs.** Not B-28 (whose own fixed
mechanism — a same-SHEET, same-title, same-row-key collision in
`collapseEquivalentPrimaryTables`'s dedup identity — requires a same-
titled rival ON THE SAME SHEET; the CHW-M table's own siblings are on
different sheets entirely, `#44`/`#49`, and no second `CHW CONTROL
VALVE SCHEDULE` claims sheet `#47`). Not B-25 (transposed-layout) or a
page-role blackout (`#47` produces 8 real tables). Closest in shape to
B-16/B-32's own "two side-by-side blocks, one consumed by the other's
own face-weld" family, but not traced to the exact consuming mechanism
under this pass's own time budget.

**CORRECTION (2026-09-19):** the "vectorgrid's own `shapely
polygonize_full` face-finder" guess two paragraphs up, and the "start
from `#47`'s own raw vectorgrid RPC reply" suggestion just below, both
assumed vectorgrid is the code path actually producing this sheet's
extraction — confirmed FALSE this pass (see B-44's own correction):
vectorgrid never successfully runs in this environment at all
(`ModuleNotFoundError: No module named 'pdfplumber'` on every sheet,
every attempt). B-44's own root cause (a `bandDataRows`/`joinGraphSpans`
row-reading-order defect in `web/src/lib/sheetgraph.ts`) is CONFIRMED
NOT to explain this entry — the same session that traced it also showed
directly, by A/B measurement, that fixing it leaves a whole-table-vanish
case (WP1's own `BOILER`/`EXPANSION_TANK`, the same shape as this
entry's own CHW-M) completely unchanged. So this entry's own consuming
mechanism remains genuinely unidentified, on the in-house
`sheetgraph.ts` path rather than vectorgrid, likely somewhere in the
same family as B-44's shared extractor (`extractAllTables`/
`extractTableAt`/the reference-kind pass) rather than the Python
sidecar — but WHICH function, and why it drops a whole ruled, correctly-
titled table while its immediate physical sibling survives, was not
re-traced this pass.

**Why this is disclosed without a fix:** the exact consuming mechanism
(title-collision vs. region-containment vs. something else in
`sheetgraph.ts`'s own extraction/dedup path) was traced only to
"CHW-M's own real, ruled geometry produces no table object at all while
its physical neighbor does," not to a specific function and line the
way B-44 now is — shipping a guess at the boundary between two real,
adjacent tables risks exactly the kind of confidently-wrong table-region
change this file's own standing rule exists to prevent, on the same
shared, corpus-wide extraction engine B-44 traces (`sheetgraph.ts`, now
correctly named — not the Python sidecar). A future pass should start
from `#47`'s own raw `sheetgraph.ts` extraction trace for this one page
(`graph.notes`, and direct `extractAllTables`/`extractReferenceTableAt`
calls the way B-44's own investigation used), checked directly against
both the CHW-M and HHW-M regions' own token/row lists, before touching
any shared code.

**This corrects a stale claim in this file's own "What is working"
section below:** written 2026-09-13/14 against this exact document
(`64 CHW + 99 HHW control valves`), that claim does not currently hold —
whether it never held under `corpusTakeoff.mjs`'s own strict per-
category counting (a different, stricter measurement than whatever
produced the original claim) or genuinely regressed since, was not
determined this pass; either way, the honest current count is 45/97,
not 64/99, and the section below is corrected accordingly rather than
left to mislead a future reader.

### B-46 — the sixth, previously-unlooked-at `npm test` failure (WP1's own keyed-compile acceptance) is confirmed to be MORE instances of B-44 and B-45, not a new bug — one engineering investment, not six separate ones (CONFIRMED — same root causes as B-44/B-45, not independently investigated further)

**Where:** `federal-mech.compile.json` (`federal-attachment4-mechanical.pdf`, the same document D04's own `VAV-16`/`17`/`43` gap already names), one of three sets `crossCorpusWorkflow.test.mjs`'s own `"WP1 keyed compile acceptance on ≥2 non-NAVFAC sets"` currently fails on (the other two, `bldg5406-hvac-demo.compile.json` and `itd-d1-lab.compile.json`, were not individually re-checked this pass).

**Measured exactly.** The reviewed key (base `compile.json` plus
`cross-set-compile-reviewed-corrections.json`'s own overlay) expects
128 total HVAC items; the compiler currently returns 114, a 14-item gap
spread across SIX separate families, not one: `FCU` (6 vs 7), `VAV`
(55 vs 58 — the exact same 3-row gap D04's own entry already names),
`CONDENSING_UNIT` (2 vs 6 — a MAJORITY of the real units missing),
`BOILER` (0 vs 2 — the entire family, not a partial miss), `GRD`
(21 vs 23), and `EXPANSION_TANK` (0 vs 2 — again the entire family).
Direct inspection of `graph.tables` confirms the same two shapes
already catalogued, not a third: `"AIR-COOLED CONDENSING UNIT
SCHEDULE"` exists and extracts, but with only 2 of 6 real rows (`CU-4`,
`CU-6`) — B-44's own partial-row-axis-phantom-split shape; no table
titled `BOILER` or `EXPANSION` appears anywhere in `graph.tables` at
all — B-45's own whole-table-vanishes shape, on a THIRD real
document now (`baker-county-eoc-bidset.pdf#47` was B-45's own
original case), confirming that mechanism generalizes rather than
being specific to one sheet's own layout.

**Why this matters for prioritization, not just completeness.** Five
of the six `npm test` failures this session's own guard-green pass
found (`D04`, `D05`, `D09`, `T-HVAC-01`, `T-VALVE-01`) were already
traced to B-44 or B-45. This entry confirms the sixth (`WP1`) is
ALSO the same two root causes, on a different document, not a
distinct defect needing its own investigation — matching this file's
own opening rule ("Fix nothing listed here without reading 'How these
connect' first... fixing them individually would produce three patches
where one structural change belongs"). **Correction (2026-09-19):**
B-44's own fix does not live in `vectorgrid_rpc.py` — see its entry's
own correction — but the claim here still holds under the corrected
mechanism: a real fix to `sheetgraph.ts`'s own `bandDataRows` row-
reading-order (B-44, now built and corpus-tested, held back only by
what it exposes elsewhere) and whatever causes a real, ruled,
correctly-titled table to produce zero candidates alongside a correctly-
extracting sibling (B-45) would very likely close ALL SIX of this
session's own `npm test` failures at once, not six separate ones —
raising the value of that engineering investment considerably above
what either entry's own individual writeup implied on its own, though
still the same scope of work: careful, corpus-wide-tested changes to
the single shared face-extraction engine every ruled table in this
corpus depends on, not a quick patch.

**Not fixed, not further investigated this pass** — the other two WP1
sets (`bldg5406-hvac-demo`, `itd-d1-lab`) were not individually broken
down the way `federal-mech` was here; a future pass confirming they
ALSO reduce to B-44/B-45 (rather than assuming it) would complete this
entry's own claim with the same rigor.

---

## What is working

Worth recording alongside the failures, because the bug list alone reads worse than the
system is. `001_NC_FY20_P_228_ATC_Tower` — a real federal ATC tower project nobody tuned
against — compiled **333 items across 22 populated categories** with correct marks:

- `AHU-M1`/`AHU-T1A`/`AHU-T1B` kept distinct from `DOAH-M1`/`DOAH-T1` and from 6 `CRAH-*`
  computer-room units — three families a naive classifier smears together
- 28 FCUs, 25 VAVs, 4 boilers; air-cooled chillers (`CH-A1`) separated from heat-recovery
  chillers (`CH-MT1`)
- 18 pumps with discipline vocabulary intact: `HRHWP`, `PCHWP`, `SCHWP`, `PHHWP`, `SHHWP`
- control valves named by served equipment (`CV-AHU-A1-CHW`, `CV-FCU-A8-A-HHW`) — the
  valve-to-equipment relationship survives, which is the hard part. **Correction
  (2026-09-19, see B-45):** this line originally claimed 64 CHW + 99 HHW, matching
  this same document's own frozen truth; the current, honestly-measured count is 45
  CHW + 97 HHW — B-45's own whole-table CHW-M dropout accounts for 19 of the 21-item
  gap, with a further, separate small residual open on the HHW side.
- air separators (`AS-CHW-M1`) separated from expansion tanks (`ET-CHW-MT1`); humidifiers
  from dehumidifiers
- building segmentation (`-M-`/`-T-`/`-A-`) consistent across every family

The core engine — extraction, family classification, tag parsing, valve-to-equipment
cross-referencing — works on real documents. The bugs above are edges, not foundations.
