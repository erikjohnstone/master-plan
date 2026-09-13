# Goal: vectorgrid finds every table on every vector sheet, with the right box

Opened 2026-09-07. Not complete. Tightened 2026-09-12 — see "Non-negotiable:
what 'ground truth' means here" and "The Demo Corpus" below. This goal is not
closed by a statistical extrapolation, an unaudited heuristic, or a
cherry-picked good day. It closes when a stranger can watch it live on a
document it has never seen and not find the seam.

## Why

Table extraction is the core function of the platform — it is what makes a
blueprint queryable. The current claim for it is **137 hand-authored boxes on
32 pages**, out of a corpus of **224 PDFs**. That is enough to find bugs and
nowhere near enough to claim a rate, and it has already been shown to hide
one: the row-rule widening fired 31 times over those 32 pages and 30 of the
firings were on blocks no authored box looks at, so a schedule box that ate
the block beside it scored 100%.

Uploading one unseen MEP set immediately produced **multiple boxes crossing
white space into neighbouring tables** — on ordinary ruled schedules. The
keyed corpus reports MERGED = 0. The measurement and the product disagree,
which means the measurement is too small.

## Objective

vectorgrid is ludicrously good at finding tables and boxing them on any
vector sheet — HVAC, BAS, electrical, plumbing, structural, architectural —
and the score that says so covers enough of the corpus to be believed.

## Scope rule: grade only what is reachable

Rasters and pasted images (Excel screenshots and the like) are **detected and
reported EXCLUDED**, never counted as misses and never counted as wins. We do
not control how a consultant pastes a table into a sheet, and a metric that
punishes or flatters us for it measures the wrong thing. Everything with real
drawn linework is in scope, and nothing else is.

## Non-negotiable: what "ground truth" means here

This section governs how every word in Method and the Completion Gate is
read. It exists because "ground truth" is the one term in this file that is
easy to quietly water down under volume pressure, and doing that is exactly
the failure this goal was opened to end.

**Ground truth means a human looked at the rendered page — extractor's
answer NOT in view — and wrote down the true box and the true cell content.**
Nothing else earns that name in this file, ever, regardless of how it is
reported.

Two mechanisms in Method produce numbers at volume without a human
touching every one of them. Both are real and both stay in this file, but
neither is ground truth and neither may be quoted as if it were:

- **The self-supervised MERGED/MISSED/SPLIT/ESCAPED sweep (Method §2) is a
  triage instrument.** It tells you where to point a human next, for free,
  across all 224 PDFs. It is never cited as evidence that a table is
  correctly found — only that it's worth someone's eyes.
- **Auto-accepted boxes (Method §3) are a volume accelerant, not a truth
  source.** Two independent extractors agreeing within 4pt means they
  didn't disagree — not that either is right. Two tools sharing a blind
  spot (a picture-frame border both treat as the table's actual edge, say)
  agree confidently and both being wrong. Auto-accept earns trust only in
  proportion to the size and randomness of the audit sample checking it —
  report the auto-accept rate, the audit sample size, and the audit
  disagreement rate, every time, together. If the audited disagreement rate
  is not indistinguishable from zero, auto-accept is broken and gets turned
  off — not re-tuned, not shrunk quietly, off — until the reason it's wrong
  is found.

**This goal is never declared complete by quoting the self-supervised
signal, by an auto-accept rate with no audit behind it, or by a demo set
chosen after the fact because it happened to score well.** If a future
session is tempted to write "vectorgrid is done, see the 97% self-supervised
recall number" — that is not this goal being met. That is this goal being
half-assed with better vocabulary. The only numbers that close this file are
named explicitly in the Completion Gate and the Demo Corpus sections below,
and every one of them is either a human eyes-on-the-page count or a
mechanically independent cross-check reported next to its own measured
agreement rate — never presented as if it were the hand-graded number.

## Method

**1. Discover, from the text layer only.** `bakeoff/findsheets.py` already
ranks every page of every bulk document by schedule-shaped captions, reading
the text layer and never the extractor's output — a selection made from what
the extractor found would silently exclude every table it cannot see.

**2. Self-supervised precision and recall, corpus-wide, with zero authoring.**
A schedule's caption is in the text layer (222 of 222 on the keyed pages).
That alone decides four verdicts on any page, with no ground-truth box:

| verdict | test |
|---|---|
| MERGED | one region contains two different schedule captions |
| MISSED | a caption no region covers |
| SPLIT | two regions over one caption |
| ESCAPED | a region whose own caption falls outside it |

MERGED is the defect the unseen set showed. This scales to all 224 PDFs
immediately and is what turns 32 graded pages into thousands.

**3. Edge-accurate truth, scaled.** EoB ≤ 4pt still needs authored boxes, and
those scale differently: a schedule's edges are always **rules the page
already carries**, so authoring is picking four candidates from a short list,
not drawing freehand. Auto-accept a box where two mechanically independent
extractors agree within 4pt on all four edges; queue only disagreements for a
human; audit a random sample of auto-accepted labels and publish the label
error rate alongside the score. A ground truth with an unmeasured error rate
is not ground truth.

## Completion gate

**vectorgrid nails a large volume of tables it has never seen — the box AND
the values, cell by cell, row by row, column by column — and it is hand-graded
against the actual tables.** Not the 137. Not the pages it was tuned on.

This gate is met only by the numbers named below, each reported the way its
own row says. It is explicitly NOT met by: the self-supervised sweep alone,
an auto-accept rate without its audit, a sample chosen because it already
looked good, or "the corpus-wide number is high enough that a few misses
don't matter." One un-disclosed wrong cell in a table someone actually
relies on is the whole failure mode this platform exists to refuse.

### The held-out split is declared first, and frozen

A named list of documents is written to `keys/HELDOUT.txt` **before any
further tuning**, and never used to change vectorgrid — not a threshold, not a
guard, not a regex. If a held-out failure is worth fixing, the fix is made
against the tuning half and the held-out set is re-run untouched. Otherwise
every failure quietly becomes training data and the score decays back into the
137/137 this goal exists to replace.

### Grading is blind to the extractor

Post-hoc grading is the only way to reach volume, and it is also how this
project got burned once: `boxfit.py`'s verdicts were "an argument I wrote and
changed four times with the score rising each time" (STATE.md §2a). The fix
then was authoring with the extractor's answer NOT IN VIEW, and on the
held-out set two of fifteen first-pass human picks were wrong and the
extractor was right both times.

So: every hand grade is made against **the rendered page**, never against an
overlay of what vectorgrid produced. Boxes are picked from the candidate rules
the page itself carries. Cells are read off the render.

### What must be reported, together

| | |
|---|---|
| **held-out tables graded** | the volume number — "a shitload" made specific, and it is the headline |
| **BOX correct** | EoB ≤ 4pt against a hand-picked box, held-out |
| **CELL correct** | right text in the right (row, column), held-out — `cellscore.py`'s existing rule, at volume |
| **ROW correct** | every cell of the row right — a row is what a takeoff line is built from |
| **COLUMN correct** | the header the column was read under is the header printed over it |
| **EXCLUDED** | rasters and pasted images, detected and set aside — never a miss, never a win |
| **grader error rate** | a random sample of grades re-authored blind by a second pass, and the disagreement rate published beside the score |

The last row is not optional. A ground truth with an unmeasured error rate is
not ground truth, and this file will not report a score without one.

### Volume, honestly

Hand-transcription is expensive: today's cell truth is **21 tables, 917
cells**. Two things scale it without lying:

- `cellocr.py` already checks every cell against an independent pixel-OCR read
  of the same page — a mechanically independent signal, available at volume.
  Report it, and let the hand-graded sample measure ITS error rate rather than
  the other way round.
- Boxes: auto-accept where two mechanically independent extractors agree
  within 4pt on all four edges; hand-grade only disagreements; audit a random
  sample of the auto-accepted.

Neither replaces the held-out hand-graded number. They surround it.

### Volume floor — a real denominator, not a vibe

Step 1 of Method (the text-layer discovery pass) will produce a real count:
the total number of schedule-shaped captions across all 224 PDFs. The moment
that number exists, it gets written into this file — call it **N**. Until N
is measured and printed here, "volume" has not been answered, regardless of
how many tables have been hand-graded so far.

Once N is known:

- The held-out hand-graded sample (boxes AND cells, full discipline above)
  must cover **at least 25% of N**, not a fixed small number that looked
  impressive when the corpus was smaller.
- That sample is drawn by a documented random process — never hand-picked,
  never "the sheets that were already easy to read" — and stratified across
  every discipline this claims to cover (HVAC, BAS, electrical, plumbing,
  structural, architectural) and across both Vol1 and Vol2, in roughly the
  proportion each actually appears in the corpus.
- If 25% of N is judged genuinely infeasible to hand-grade in reasonable
  time, the fallback is not a smaller sample chosen quietly — it is stating
  the real number reached, the real percentage of N it represents, and why,
  in this file, next to the score. A shrunk bar that isn't written down is
  the exact "half-assed with better vocabulary" failure this file forbids.

### And the existing gates stay unmoved

`boxscore.py` 137/137 and mean IoU 0.9993, `cellscore.py` 917/917 cells and
102/102 rows, `boxscore.py --census` firing count, `boxfit.py` 0
SPLIT/OVERRUN/SHORT/MERGED on the keyed set, and the app's own regions via
`mcp/scripts/table-box-eval.mjs` per producing stage with a cause on every
miss. A held-out score is not licence to regress the measured one.

## The Demo Corpus — the walk-out proof

The corpus-wide statistical gate above proves the platform is sound
everywhere. It is not, by itself, the thing you hand someone a laptop and
walk through live — a 96% corpus-wide number means there's a real document
in the pile that's wrong, and nobody can promise it isn't the one an
audience member happens to click on. This section is the second, stricter
thing that sits on top of it, built specifically to be shown to a room of
people with zero hedging.

**The set.** At least 30 real documents, named up front in
`keys/DEMO_CORPUS.txt` and frozen before grading starts — the same
no-swapping-a-document-out-because-it-embarrassed-the-score discipline as
`keys/HELDOUT.txt`. Chosen to span every discipline this claims to cover
(HVAC, BAS, electrical, plumbing, structural, architectural) and both Vol1
and Vol2 — not 30 easy HVAC sheets. It may overlap the held-out split; it may
not be hand-picked for how well vectorgrid already does on it, and the
selection process (e.g. "every Nth document from a sorted manifest,
stratified by discipline") gets written down here so nobody can wonder later
whether it was cherry-picked.

**The bar, per document, per table:**

- Every non-rasterized table on it is found — self-supervised MISSED = 0 on
  every one of these documents, hand-confirmed by rendering the sheet, not
  assumed from the sweep.
- Every box is hand-graded, blind (extractor's answer not in view, boxes
  picked from the page's own candidate rules) — EoB ≤ 4pt. **Auto-accept
  does not apply here.** The whole demo corpus is graded the expensive way,
  because this is the set someone will watch live.
- Every cell of every table is hand-transcribed off the render and compared
  exact-match against what vectorgrid produced. No cellocr.py cross-check
  standing in for the transcription here — this is the one place in this
  file where the mechanically-independent shortcuts from "Volume, honestly"
  are not allowed to substitute.
- Rasters/pasted images on these documents are still correctly EXCLUDED, not
  silently zeroed — that disclosure has to hold up live too.

**The pass condition is zero, not a percentage.** Not "99% accurate on the
demo corpus" — zero known box errors and zero known cell errors across all
30+ documents. If hand-grading finds one real error anywhere in this set,
this goal is not complete, no matter what the corpus-wide statistical
numbers say, and the fix + regression test happen before the demo corpus is
re-claimed clean. One wrong number in front of a room ends the meeting and
the credibility along with it — that is the entire reason this section
exists and it is graded to that standard, not a lesser one.

**What "walking it out" looks like when this is done:** open any document
from `keys/DEMO_CORPUS.txt` that hasn't been shown before, in the real app,
live — every schedule highlighted correctly, every cell value matching the
page, nothing rasterized silently dropped. That moment is the actual
deliverable this whole file exists to produce.

## Open at the time of writing

- The unseen MEP set that showed the merges is not in the corpus and has not
  been run. It is worth more than a hundred corpus pages and should be added.
- Schedules on sheets the role classifier calls `plan` are never offered to
  the engine at all (`isScheduleTarget`) — five real panel schedules on
  `009_FL#30`. That is recall lost before geometry is reached.
- `vectorgrid` declines a large share of what it finds: 53 declined against 90
  kept on `001_NC`, 22 against 28 on `016_NY`. Some of that is correct. How
  much is unknown.

**Added 2026-09-12, from the running bug catalogue — confirmed real, in
scope (all vector-native, no raster/OCR path involved), not yet closed:**

- ~~**B-13 — wrapped multi-line cells never band into rows at all.**~~ —
  **FIXED 2026-09-13, on a different mechanism than originally recorded.**
  `13_MI…#28`'s FIRE ALARM DEVICES SCHEDULE reaches the graph through
  vectorgrid now, not the ODL/text-banding path the original entry named —
  `bandGenericDataRows` was never actually in this table's code path.
  Traced live: vectorgrid's own geometry is 100% correct (7 real row-bands,
  matching the page exactly); the loss was in `scheduleTableFromODL`'s own
  `buildRows` — a row whose SYMBOL cell is a pure drawn glyph (zero text)
  failed `rowKeyOf("")` and the whole row, DESCRIPTION/MANUFACTURER/
  CATALOG NO./REMARKS included, was discarded over one blank cell. Fixed by
  falling back to the row's own leftmost other column (never the longest —
  that's routinely REMARKS boilerplate) through the same vocabulary-free
  `genericRowKeyOf` the reference kind already trusts. See
  `TAKEOFF_BUG_CATALOGUE.md`'s own updated B-13 entry for the full trace,
  the two wrong turns before the right fix, and the regression suite. Table
  recovers all 6 real rows (was 3); a second, unrelated table elsewhere on
  the same document was also recovered as a side effect.
- **B-10 / task #77 — a full-width section-divider row between two groups of
  data rows bands into the narrow column beneath it** (`028_TX#p1` NOISE
  CONTROL DUCT SILENCER SCHEDULE; `042_VA` "INDOOR AREA TEMPERATURE/HUMIDITY
  SETPOINTS" is very likely the same failure mode on a different sheet, not
  yet confirmed as such). Corrupts one row's quantity cell and produces a
  correctly-disclosed but real one-unit undercount. Fix shape is named in
  B-10 (test row population + x-band span, not position) but not applied.
- ~~**Task #74 vs. `STATE.md` §2a item 4**~~ — **RESOLVED 2026-09-12, not stale
  on either side.** Both records were true at once, describing two DIFFERENT
  bugs on the same table: `STATE.md`'s dangle-discard fix genuinely fixed
  vectorgrid's own BOX EXTENT (confirmed live — vectorgrid finds this exact
  table's geometry, `52x8`, matching its box score); task #74's "invisible to
  every extraction path" was a SEPARATE, still-open title-attachment bug —
  `scheduleTableFromODL` only ever searches for a title INSIDE the ruled
  grid's own row 0, and this table's real caption ("DRAWING LIST") is printed
  OUTSIDE and above the grid, its own free-floating underlined text run. Live
  decline reason, captured via a new opt-in `OPENTAKEOFF_GRAPH_TRACE` line in
  `runVectorTakeoffStack` (previously the pipeline's own declined_regions/
  declined_reasons were discarded entirely): `"unknown kind and no title"` —
  found correctly, refused for an unrelated reason. **Fixed**: see
  `TAKEOFF_BUG_CATALOGUE.md`'s new B-14 for the full trace, the fix
  (`nearbyDrawingIndexCaptionText` in `scheduleLanguageScan.ts`, reusing the
  same proven drawing-index vocabulary `sheetHasDrawingIndexTitleSpans`
  already uses for routing, scoped spatially to the table's own bbox), and
  the regression suite. Table count on this document: 2 → 3, the recovered
  table correctly kinded `reference` with all 34 real rows.
- **Task #82 — HVAC equipment compile totals reported wrong on 6+ corpus
  sets, not yet root-caused with this file's own render-and-read discipline.**
  Unlike the others above, this has not been traced to a specific sheet or
  mechanism yet — do that first, the same way B-3/B-4/B-7/B-11/B-12 were each
  traced against one real cited page before any fix was written.
