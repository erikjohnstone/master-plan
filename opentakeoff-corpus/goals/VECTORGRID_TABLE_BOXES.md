# Goal: vectorgrid finds every table on every vector sheet, with the right box

Opened 2026-09-07. Not complete.

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

### And the existing gates stay unmoved

`boxscore.py` 137/137 and mean IoU 0.9993, `cellscore.py` 917/917 cells and
102/102 rows, `boxscore.py --census` firing count, `boxfit.py` 0
SPLIT/OVERRUN/SHORT/MERGED on the keyed set, and the app's own regions via
`mcp/scripts/table-box-eval.mjs` per producing stage with a cause on every
miss. A held-out score is not licence to regress the measured one.

## Open at the time of writing

- The unseen MEP set that showed the merges is not in the corpus and has not
  been run. It is worth more than a hundred corpus pages and should be added.
- Schedules on sheets the role classifier calls `plan` are never offered to
  the engine at all (`isScheduleTarget`) — five real panel schedules on
  `009_FL#30`. That is recall lost before geometry is reached.
- `vectorgrid` declines a large share of what it finds: 53 declined against 90
  kept on `001_NC`, 22 against 28 on `016_NY`. Some of that is correct. How
  much is unknown.
