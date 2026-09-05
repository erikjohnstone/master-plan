# OpenTakeoff — where this actually stands

**One goal: an autonomous HVAC/BAS takeoff platform.** An estimator uploads a
real mechanical drawing set the system has never seen and gets a correct,
complete, cite-backed takeoff.

This file is the only document that describes current state — every other
`GOAL.md`/goal-loop document in this repo carries a superseded banner
pointing here. Rewritten 2026-09-05 from direct measurement, as part of a
foundation-cohesion pass (audit → one takeoff-line contract → seam-pinning
tests → eval/cache hygiene → docs); every number here has a command that
reproduces it. There is no `archive/` directory in this repo — the
foundation-cohesion audit found the earlier version of this file claiming
one and corrected it; the superseded docs it describes stay in place, each
carrying its own banner, rather than being physically archived.

---

## 1. What exists and works

A geometry-first vector extraction pipeline plus a takeoff compiler, reachable
through a web UI, an agent, and MCP tools — the same engine behind both front
doors (`mcp/src/session.ts` imports 28 modules from `web/src/lib`; there is no
duplicated schedule/table/quantity logic between them).

Proof it works, from one real federal project (`001_NC_ATC_Tower` /
`navfac-cherry-point-atc`), compiled by the production path and locked as
frozen, hand-verified truth (`opentakeoff-corpus/takeoffs/T-HVAC-01-navfac-equipment/truth.json`,
≥25% stratified hand-count reconciliation pass): **396 equipment items across
22 populated categories** with correct marks — `AHU-M1`/`AHU-T1A` kept distinct
from `DOAH-M1` and from six `CRAH-*` units; air-cooled chillers (`CH-A1`)
separated from heat-recovery chillers (`CH-MT1`); 28 FCUs; 25 VAVs; 18 pumps
with discipline vocabulary intact (`HRHWP`, `PCHWP`, `SCHWP`); **163 control
valves named by served equipment** (`CV-AHU-A1-CHW`), so the valve→equipment
relationship survives. (An earlier version of this file said 333 here — that
was a stale census artefact, not a regression; the regression gate
(`test/takeoffHvac01.regression.test.mjs`) asserts 396 and passes at HEAD.)

The engine is not the problem.

## 2. The scored corpus — real numbers

7 documents have hand-verified ground-truth keys. They are the only place
correctness can be proven.

| set | tags | exact | Σ\|Δqty\| | missing | false-add |
|---|---|---|---|---|---|
| bessemer | 10 | 100.0% | 0 | 0 | 0 |
| itd-d1-lab | 116 | 91.4% | 30 | 2 | 6 |
| federal-mech | 102 | 92.2% | 8 | 8 | 2 |
| navfac-cherry-point-atc | 217 | 97.2% | 11 | 0 | 21 |
| bldg5406-hvac-demo | 28 | 100.0% | 0 | 0 | 0 |
| baker-county-eoc | 40 | 90.0% | 0 | 4 | 0 |
| itd-d1-lab-raster | 28 | 100.0% (vacuous — correct raster refusal) | 0 | 0 | 0 |
| **CORPUS** | **541** | **94.8%** | **49** | **14** | **29** |

```
cd opentakeoff/mcp && node --import tsx scripts/corpus-eval.mjs ../../opentakeoff-corpus --report
```

This number is unchanged by the entire foundation-cohesion pass (Sept 2026):
the one-takeoff-line contract, the eval/cache fixes, and every test added
were verified additive-by-construction against this exact scored corpus.

**Re-verified 2026-09-05 after B-11 and B-12** (cold cache, both sheetgraph
changes in the tree): every set matches the table above exactly, and the
corpus totals — 541 tags, 94.8% exact, Σ|Δqty| 49, 14 missing, 29 false-add —
are identical. Recall went up and nothing precision-side moved.

One process note worth keeping, because it nearly produced a false alarm: the
first run of this gate printed **513 tags / 94.5%** and looked like a
regression. It was not. `bldg5406-hvac-demo` had been left off the command
line (a mistyped set id), and 513 + its 28 = 541; the 0.3% was just the mean
with a 100% set removed. Read the PER-SET rows before believing a corpus
delta — the total moves for boring reasons.

**A recall tier now exists alongside it** (`keys/<id>.tables.csv`,
`mcp/scripts/table-recall-eval.mjs`), because every key above is scoped to
tables the pipeline already found — none of them can catch a schedule table
sheetgraph.ts never sees at all.

As of 2026-09-05 it covers **24 documents: 133 ground-truth tables** —
`bessemer.tables.csv` (sheets #2 and #8, 11 tables, **9/11 = 81.8%** through
the full Session) plus **23 bulk documents spanning both volumes** (9 from
Vol1, 14 from Vol2, 122 tables on 24 sheets). Every row was authored the way
this tier requires and no other way: render the sheet full page
(`mcp/scripts/render-page-crop.mjs`) and list what a human sees, with the
pipeline's own output never consulted. Each key's header records what was
deliberately not counted (legends, ruled notes blocks, indented spec prose,
untitled tables — this tier matches on title) so the number means one thing.

What it found immediately, and what nothing else could have found:

- **B-11** — the generic reader stands down for another kind's pass on
  vocabulary alone, and that pass then extracts nothing. `13_MI…#28` draws six
  schedule tables and yielded one.
- **B-12** — a schedule with exactly one data row was refused, because "a real
  table repeats". One row is ordinary drafting: 7 of 11 tables on `016_NY#18`,
  9 of 15 on `067_CA#8`, 5 of 13 on `061_IA#58`.
- **B-13** (open) — data rows whose cells wrap over several printed lines
  never band into rows.

B-11 and B-12 are fixed; measured over all 122 keyed tables on the text-layer
extractor, **28 → 39 found (23.0% → 32.0%)**. Read that figure for exactly
what it is: the text-layer path ALONE, with no sidecar/ODL/OCR layer. bessemer
scores 81.8% through the full Session, so those layers carry most of today's
recall — **32% is not the pipeline's recall number** and must not be quoted as
one. The full-Session recall figure across all 24 keyed documents is the next
measurement to run.

### 2a. The table bake-off — 122/122 boxes, 100% on held-out sheets, cells judged by three rulers

`opentakeoff/bakeoff/` scores any table extractor against those same 122 keyed
tables. Two rulers: `bakeoff.py` asks whether a region landed under a keyed
caption (recall); `boxfit.py` asks whether the BOX WAS RIGHT, which recall
cannot see — a box clipped to two rows of a twelve-row schedule and a box that
swallows the schedule below it both score a hit.

`vectorgrid.py` is the answer that came out of the five research sweeps:
segments straight from the content stream (pdfplumber), noded into a planar
graph (shapely), faces taken as cells (`polygonize_full`), blocks as connected
components cut at border-weight strokes. Nothing is rasterised, so stroke
width survives to be used as signal — which no published method can do.

THE RULER IS NOW A MEASURED BOX, NOT AN INFERENCE. `boxfit.py`'s verdicts were
an argument I wrote and changed four times with the score rising each time. All
122 boxes are now hand-authored off renders in `keys/<id>.tableboxes.csv`, and
`boxscore.py` asks the only question that cannot be argued with: how far is
each emitted edge from the edge a human measured. CORRECT means Error-of-
Boundary — the WORST of the four edges — within 4pt, after TableSense
(AAAI 2019), because IoU@0.5 passes a box that has clipped two rows off a
twelve-row schedule.

| against 122 hand-authored boxes | CORRECT (EoB ≤ 4pt) | mean IoU |
|---|---|---|
| **vectorgrid** | **122/122  100%** | **0.9992** |
| pdfplumber-lines_strict | 76/122  62.3% | — |

```
cd opentakeoff/bakeoff && python3 boxscore.py            # the 122 authored boxes
cd opentakeoff/bakeoff && python3 cellscore.py           # hand-transcribed cells
cd opentakeoff/bakeoff && python3 cellocr.py --all       # every cell vs pixel OCR
```

The whole gap is in the two columns a recall count cannot see. pdfplumber
finds 114 of 122 tables — close — and hands back 10 boxes containing two
schedules each and 10 tables torn across regions. An extractor trusting those
interleaves two schedules or loses half of one, silently.

What made the difference, in the order it was found and each measured on the
sheet named:

1. **Curve decomposition.** pdfminer types a path as `LTLine` only for two
   points and `LTRect` only for a closed axis-aligned four; every other
   polyline collapses to one `LTCurve`. 4145 of `27_WA#15`'s 7235 curves are
   thin filled slivers used as cell walls. 43.4% → 51.6% clean.
2. **A sliver face and a tall blank face are WELDS.** A border drawn 0.5pt
   inside the sheet margin leaves a 0.5 × 30 face that unions a schedule to
   the drawing frame; the blank sheet between two blocks does the same at
   270 × 341. `073_MT#21`'s three margin schedules were perfectly drawn and
   scored 0/3. 53.3% → 63.1%.
3. **Six of the 122 tables are PICTURES.** All six `017_MD#14` VENTILATION
   SCHEDULEs are Excel screenshots — the render still shows their "Add Rows"
   buttons. pdfplumber sees 15 segments inside an 873 × 570 table box and
   PyMuPDF agrees. Their image placement rectangles are emitted instead
   (`raster_regions()`), which is where a downstream OCR call belongs. The
   ruling graph alone tops out at 116/122. 77.9% → 89.3%.
4. **The dangles `polygonize` discards are the table's extent.** A row rule
   spans its table and a column wall spans its table, so a block widens to the
   span of the rules its cells sit on — majority vote, no chaining, and the
   vertical widening stops at any block-spanning rule so stacked schedules
   sharing a column wall cannot fuse. `08_ME#1`'s DRAWING LIST closes faces
   only in its checkbox strip, 340pt right of its caption and 212pt below it.
   89.3% → 91.0%.
5. **A merge must leave a block tessellating.** The column-divergence
   merge-back fused `001_NC#49`'s OUTDOOR AIR SCHEDULE (fill 0.278) with the
   block below and dropped it to 0.186, under the regularity gate — the step
   meant to repair splits threw away the sheet's one clean recovery.
6. **A second title band is a second table.** A schedule opens with an
   undivided full-width row and then divides into columns, so an undivided
   full-width row part-way down a block is a second table's title.
   `073_MT#21` draws HELICAL PIER over FOOTING on the same 0.48 pen, where no
   weight threshold can ever part them. MERGED 2 → 0. 95.9% → 97.5%.

**Four of the fixes were to the RULER, not the extractor**, and each one had
been counting correct boxes as wrong:

- SHORT was inferred from caption spacing. On `061_IA#58` it called 7 of 13
  regions truncated; rendering the crops showed all 13 exact — HUMIDIFIER
  SCHEDULE is a caption, two header rows and one data row, then a REMARKS note
  and 73pt of blank sheet. That ruler rewards swallowing whitespace. Replaced
  with a content test (a ruled row still standing below the box), with a
  truncation sweep as its control: silent at the true bottom, firing 1pt below.
- A region that ENDS above a caption was still claiming it. All four remaining
  SPLITs were this.
- One region now has ONE owner, the nearest caption above it.
- Both flat tolerances are now proportional — the caption gap to type size,
  "interior wall" to region width.

Each ruler fix moved the pdfplumber baseline too (45.9% → 73.0% over the
sequence), which is how they were checked for being fair rather than
self-serving.

**One table is unfixable without breaking the ruler.** `067_CA#8` prints
PCW RISER DIAGRAM SCHEDULE - HUTCH 1.3 BELOW its table, as detail 2. Allowing
captions below would hand every backend false matches corpus-wide to buy one
table. Recorded in the key, counted as a miss.

**HELD OUT: 97/97.** 100% on the sheets it was tuned against measures fit as
much as skill, so 15 unkeyed sheets were chosen by a text-layer scan and then
READ — every table counted off a full-sheet render, every title taken from the
page's own text layer. 100 tables, 39 documents keyed in total, 222 tables.

| 15 sheets never used for tuning | ruled tables found |
|---|---|
| **vectorgrid** | **97/97  100%** |
| pdfplumber-lines_strict | 87/97  89.7% |

Reading them is what made the number mean anything. The scan proposed 117
"tables"; 22 are not tables — MECHANICAL SCHEDULES on three of those sheets is
the Drawing Title field of the sheet's own title block, and every
SCHEDULE-shaped string on `013_MO#1` is a ROW of a cover-sheet drawing index.
Against that denominator both engines scored 42/76, a dead heat that was an
artefact of counting phantoms. The keys also record what a vector method
structurally cannot reach: `074_CA#24`, `072_CA#25` and `013_MO#1` draw their
legends and sheet indexes with NO ruling at all, and both engines correctly
emit nothing there.

**CELLS, by three rulers.** Region proposal is a third of the problem; a table
found and misread is worthless.

| ruler | coverage | result |
|---|---|---|
| hand-transcribed truth (`cellscore.py`) | 390 cells, 7 tables | **390/390 cells, 38/38 rows** |
| second text engine (`cellaudit.py`, pdfminer) | 9,602 cells | 97.96% agree |
| **pixel OCR** (`cellocr.py`, RapidOCR) | **18,189 cells, 369 tables** | **88.33% confirmed** |

The third ruler exists because the first two share a blind spot: pdfminer and
MuPDF both parse the same content stream, so a fault in the stream itself — a
bad ToUnicode map, a symbol font — is invisible to both and they agree,
confidently, and are both wrong. RapidOCR reads the rendered ink and shares
nothing downstream of the PDF.

All 2,122 disagreements were classified and the class that could indict us was
read in full. "OCR saw more than we did" is the signature of dropped table
data: 64 of 18,189, every one OCR's — it drags a neighbour's text across a
wall, doubles itself, reads the two arcs of a hand-drawn CALLOUT BUBBLE as
parentheses (`078_US#23`, nine times), and reads a logo's stars as text. The
other classes are the same story: 863 cells where OCR read nothing hold a dash;
the commonest same-length substitutions are `-`→`二` (a CJK glyph), `Ø`→`0`,
`”`→`"` and `6`→`9`, that last checked against the pixels at 9x on `001_NC#49`
where the drawing plainly says 6. **Zero confirmed cases of this extractor
dropping or misreading a cell.** 88.33% is a floor on us, not a ceiling: it is
how much a second modality could confirm.

Twice the HAND TRUTH was the thing that was wrong, both the same trap — a
two-line heading read as a cell spanning both header rows when the ruling says
otherwise (`DIRECT DRIVE (YES/NO)` on `096_IN#19`, `COMPRESSORS` on
`016_NY#18`). Both corrections are written into the keys with the reason.

**The cell ruler was wrong before the extractor was.** It compared a row's
cells BY POSITION among the non-empty ones, which is fine until a header spans:
on `096_IN#19` a PERFECTLY extracted 22-column schedule scored 125/175, because
position 4 means TSP in one row and 5.55 in another. Comparison is now on the
table's own column grid, and `cellscore.py --selftest` fails if a span or a
one-column slide is scored wrong.

**KNOWN LIMITS, with prevalence measured rather than guessed.**

- `040_IL#47` AIR HANDLING UNIT SCHEDULE. The mid rule is absent at each band
  header, so the tall label strip and the band row form one L-shaped face and
  every label in the band lands in one cell while the values sit in their own —
  `26,000` with no way to know it is CFM. The same table also emits as 6
  regions. Cells spanning 3+ row lines while holding 3+ text lines, corpus
  wide: **3 of 18,189**, and two of those are legitimate 3-line headers.
- Form blocks. `060_XX#75`'s panelboard header is `PANEL ___590A11A-63A___
  BLDG. ___432___ VOLTS ___480___` on fill-in underlines with no verticals, so
  it is one 300-character cell. Cells with 3+ interior fill-in underlines:
  **15 of 18,189**, of which ~4 are genuine form blocks.
- Text that overflows its own cell. `031_MO#39` prints `1'-4 1/8"` with the
  cell wall falling between `1` and `/8`, so the fraction is placed in the
  neighbouring cell by its centre. Words sticking out of the cell they were
  placed in: **67 of 34,129 (0.20%)**, nearly all on `24_IA#15`, whose columns
  are 2-3pt wide.
- `067_CA#8` prints its caption BELOW the table, as detail 2. Allowing captions
  below would hand every backend false matches corpus-wide to buy one table.
  Recorded in the key, counted as a miss.

**And what none of this measures: production.** `vectorgrid.py` lives in
`opentakeoff/bakeoff/`. The production path is `sheetgraph.ts` →
`vectorTakeoffPipeline.ts`, and vectorgrid is NOT wired into it. Nothing an
estimator runs today touches this code.

## 3. The other 112 documents

The corpus is **7 scored sets, 112 bulk sets (215 files, 30 in
`bulk/HVAC_BAS_Plan_Sets` + 82 in `bulk/HVAC_BAS_Plan_Sets_Vol2`), 9 raw
files** — `opentakeoff-corpus/sets.json` is the one live registry; a bulk
document registers by a `sets.json` entry alone, no copying into `raw/`
required (`resolveSetFiles` in `mcp/scripts/corpusFiles.mjs` searches both
`bulk/*` trees directly). Only 7 have ground truth. On the other 112,
takeoffs run and bugs can be detected by signature, but **correctness cannot
be proven** — nothing says what the right answer is. That gap, not the
engine, is what stands between this and "production".

## 4. The one takeoff-line contract

As of this pass, every takeoff item carries the same fields regardless of
which of the 5 compile kinds produced it, additive to the legacy `quantity`
field every scored key still keys against:

- `quantity` — unchanged (one item per schedule row); kept so all 541 scored
  key rows keep scoring exactly as before.
- `scheduled_qty` — the printed QTY column, read by header identity, when one
  exists (`scheduledQtyStatusFromRow`, `schedulePlanReconcile.mjs`).
- `installed_qty`, `status` — populated by `reconcile_schedule_plan`, which
  cross-references the compiled schedule against what `symbol_sweep` actually
  finds drawn on the plan sheets: matched / schedule-only / plan-only / a
  disclosed refusal, each citing both the schedule row and the plan ink.
- `qty_kind` — the discriminator (`scheduled` \| `installed` \| `mark_count`),
  now a lead column on every export (CSV/XLSX/PDF) and in the panel.

One dispatcher (`web/src/lib/compileTakeoff.mjs`) routes all 5 compile kinds
for every caller (MCP tool, CLI, census script) — this is what fixed B-2
below. `reconcile_schedule_plan {family}` always returns `takeoff_stats`
(zeros on the family-scoped path) so the MCP output schema and the TS return
type agree. `mcp/test/conformance.test.ts` exercises `compile_corpus_takeoff`
/ `reconcile_schedule_plan` / `count_marks` / `query_table` /
`project_takeoff` end-to-end (19/19 tests pass at HEAD) — these five tools
had zero coverage before this pass.

## 5. What is broken

| id | bug | scale | where |
|---|---|---|---|
| **B-6** | A page drawing the same schedule at two scales (0.83×) fuses into unreadable rows | 013_MO p23 | `clusterRows` |
| **B-8** | Side-by-side tables with no empty gutter cannot be split | 046_MI p22 + 044_NY p24 (19 of 27 rows lost) | `columnBandCandidates` |
| **B-9** | Two consecutive rows bracketing an in-table category sub-header dropped | `demo/sample-finish-plan.pdf` MATERIAL SCHEDULE, 2 real rows missing | row-clustering, not yet root-caused |
| **B-10** | A full-width section banner bands into a data column, polluting that row's cell | 028_TX p1: one QTY cell reads `"SECOND FLOOR 2"` (22 read of a printed 23, refused and disclosed) | data banding |
| **B-13** | Data rows whose cells wrap over several printed lines never band into rows | `13_MI#28` FIRE ALARM DEVICES SCHEDULE: header accepted, `banded=0` | `bandGenericDataRows` |

Full evidence, root causes and fix shapes: `TAKEOFF_BUG_CATALOGUE.md`.

**Fixed 2026-09-05 — the same discriminator, now on whole-table recall.**
B-11 and B-12 (§2) are the identical defect one level up: the pipeline decided
what a block WAS — "another pass owns this", "this is not a table because it
does not repeat" — without testing either claim. B-11 now stands down only
where a kind pass actually produced a covering table; B-12 tests the drawn
cell walls (a rule above the row, a rule below it, verticals at the header's
own column anchors) instead of counting rows, and refuses when a sheet
supplies no linework to judge, because an unanswerable question is not a yes.
Both carry regression tests over real captured spans and linework, verified to
fail on the pre-fix tree.

**Fixed 2026-09-05 — the shared structural discriminator.** The bug
catalogue's own "How these connect" synthesis named one defect behind several
entries: *the pipeline infers what something IS from where it SITS or what it
LOOKS like, without testing the claim.* Three entries were closed by naming
the distinguishing property and measuring it, rather than by three separate
patches:

- **B-3** — an identifier column is high-cardinality **and lettered**; a count
  column is low-cardinality small integers (measured on the cited page: count
  column 0.19, real identifier 0.75, an ordinary MARK column 1.0). A table
  with no identifier emits one line per physical row instead of deduping.
  `028_TX` silencer schedule: **2 items → 16 lines**, 22 units read + 1
  disclosed refusal (the 23rd is B-10, refused rather than guessed).
- **B-4** — a real caption never opens with a conjunction/article, and prose
  both fills its band *and* ends in a period (a wide big-font caption does
  only the first; a short title ending in a period does only the second).
- **B-7** — **the catalogue's recorded hypothesis was disconfirmed by the
  trace it asked for.** Margin grid locators are absorbed, but removing them
  changes nothing: the page died earlier, at the column-clustering depth cap,
  because single-linkage x-proximity chained same-tier tokens into one
  "column". A column is a vertical stack. Both causes were real and stacked;
  `034_NC` p42: **0 tables → 3** (DOOR SCHEDULE 16 rows, ROOM FINISH SCHEDULE
  17 rows, bands no longer page-wide).

Each carries a regression test over real captured spans, verified to fail on
the pre-fix tree.

**Fixed earlier this pass** (were B-1 and B-2 here before):
- **B-1** (a printed QTY column was never read) — fixed additively: see §4,
  `scheduled_qty` now reads it by header identity. The legacy `quantity`
  field stays hardcoded `1` on purpose, so no scored key row's score moves.
- **B-2** (`sequences` threw `Unknown takeoff kind`) — fixed: `compileTakeoff.mjs`
  routes it (and `embedded_coil_gaps`) from every caller. See §4.

## 6. What to do next, in order

1. **Measure full-Session recall across all 24 keyed documents.** The 32%
   figure in §2 is the text-layer extractor alone; the number that describes
   the product is `table-recall-eval.mjs` over the whole set, and it does not
   exist yet. Run it on the pre-B-11/B-12 tree and again after, and do not
   edit `sheetgraph.ts` while it runs — the scorer spawns a child process per
   set, so a mid-run edit silently mixes two code versions into one number.
   Nothing below is correctly ranked until this exists.
2. **B-13** — wrapped multi-line cells never band into rows. Found on the same
   sheet as B-11 and blocking four more real tables there; it is the next
   whole-table miss with a named cause.
3. **B-6, B-8** — scaled-duplicate detection; splitting gutterless
   side-by-side tables by internal column structure rather than an empty
   corridor.
4. **B-9, B-10** — the category-sub-header row-drop (not yet root-caused) and
   the section banner that bands into a data column. Both are the same
   "test the property, don't trust the position" shape as the entries closed
   on 2026-09-05.
5. **Ground truth at scale** — recall-tier keys for the remaining ~89 bulk
   sets (24 documents keyed so far, §2), which is ~10× cheaper than
   cell-level and the only tier that catches a whole-table miss.
   `mcp/scripts/recall-gap-scan.mjs` ranks where to look: over 88 documents /
   2,486 pages it found 949 extracted titles against 616 title-shaped
   candidates the pipeline never built, in 74 of them. Read that as a floor on
   real misses, never a total — its own header lists what it cannot see.
5. **Run the product end-to-end, as a gate.** `web/scripts/playwright-takeoff-ui-demo.mjs`
   drives the real Cerebras-backed agent through compile → reconcile → panel
   → CSV export and cross-checks the UI's own compile against
   `production-graph-cli.mjs`'s; wired into `test:workflows` behind a
   live-key guard (`mcp/scripts/runWorkflowTests.mjs`).

## 7. Rules that govern any change

From the platform mandate, and each one has been paid for:

- **Structure classifies, regex only confirms.** Regex must never be the sole
  thing between "found" and "not found".
- **No fix may recognise a filename, tag, sheet number or corpus id.** The
  corpus is the proving ground, not the finish line.
- **Audit before building.** Three root-cause hypotheses were tested in one
  session; two were wrong despite being drawn from real coordinates.
- **Never invent a quantity, tag or location.** Refuse and disclose.
- **`keys/` are read-only.** A key that looks wrong gets written up, never
  edited — editing it manufactures permanent false confidence.
- **Run the regression gate before committing an extraction change.** Skipping
  it once cost 12 real cells on a document that had been at 100%.

## 8. Where things live

```
opentakeoff/web/src/lib/     extraction + compiler (52k lines)
   sheetgraph.ts             table extraction spine (9.2k lines)
   corpusTakeoff.mjs         the 3 native compile kinds — B-3 lives here
   compileTakeoff.mjs        the ONE dispatcher — every caller routes through it
opentakeoff/mcp/src/         Session, MCP tools, the scored takeoff pipeline
opentakeoff/mcp/scripts/     evals, census, sweeps
opentakeoff-corpus/
   sets.json                 the one live registry — 7 scored + bulk documents
   raw/ (9), bulk/ (112 sets / 215 files) — PDF bytes gitignored, registered in place
   keys/ (29)                ground truth — READ ONLY (tracked, not gitignored)
   TAKEOFF_BUG_CATALOGUE.md  every bug, evidence, root cause
   GOAL.md                   the current mandate — every other GOAL.md defers to it
```

## 9. Superseded documents

Before this file there were 8,728 lines of documentation across eleven files,
including **two different `GOAL.md`s** and **three separate goal-loop
documents**, several marked "ACTIVE" or "AUTHORITATIVE" at once — and one of
them ran on a Pillar A–D framework that `GOAL.md` §8 had explicitly discarded
("Disregard pillars a through d, they are bullshit"). Contradictory status
markers in a repo are not history, they are a trap. Each superseded document
now carries a one-line banner at its top pointing here and at
`opentakeoff-corpus/GOAL.md` (the current mandate) instead of being moved or
deleted — the engineering record in those files is real and worth keeping,
and a banner makes that explicit without breaking the 41+ citations that
depend on their current paths.
