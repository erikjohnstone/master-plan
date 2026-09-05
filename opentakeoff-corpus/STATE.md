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
