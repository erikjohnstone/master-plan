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
| B-3 | Row key falls back to a count column when a table has no MARK | 23 real silencers reported as 2 | false structural inference |
| B-4 | Prose fragments recorded as schedule titles | 3+ documents | false structural inference |
| B-5 | A new header-token rejection killed a whole real table | −12 real cells on federal-mech | self-inflicted; whole-row guard |
| B-6 | A page drawing the same table twice at TWO SCALES (~0.83x) | 013_MO p23, 2 tables lost | fused scaled duplicate |
| B-7 | Sheet-margin GRID REFERENCE labels (A-F at both page edges) qualify as header rows and stretch the x-band page-wide | 034_NC p42, 2 tables lost; **corpus-scale hazard** | strongly supported, trace pending |
| B-8 | Side-by-side tables with NO empty gutter — seam-based banding cannot split them | 046_MI p22 + 044_NY p24 (rule 35a): 1 table lost, 19 of 27 rows lost | **same bug as GOAL.md rule 35(a)** |

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

**Fix shape (not applied):** choose the identifier column **structurally** — an identifier
is high-cardinality and tag-shaped; a count column is low-cardinality small integers. When a
table has no identifier column at all, do not dedupe by tag: emit one line per physical row
and carry its quantity. The silencer case then yields 16 lines totalling 23 units.

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

**Fix shape (not applied):** the measured discriminator from the rule-18 work generalizes —
a prose line FILLS its column band (89%-113% measured) while a real title does not (29%
measured). A sentence-terminating period is a second, independent signal.

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
