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

**A recall tier now exists alongside it** (`keys/<id>.tables.csv`,
`mcp/scripts/table-recall-eval.mjs`), because every key above is scoped to
tables the pipeline already found — none of them can catch a schedule table
sheetgraph.ts never sees at all. One authored key so far (`bessemer.tables.csv`,
sheets #2 and #8 only, rendered and read by eye): **9/11 tables found,
81.8% recall**, and the 2 real misses it caught are B-9 below.

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
| **B-3** | Row key falls back to a count column when a table has no MARK | 23 real silencers → **2** | `corpusTakeoff.mjs` |
| **B-4** | Prose fragments recorded as schedule titles | 3+ documents | title hunt |
| **B-6** | A page drawing the same schedule at two scales (0.83×) fuses into unreadable rows | 013_MO p23 | `clusterRows` |
| **B-7** | Sheet-margin grid labels (`A`–`F` at both page edges) qualify as header rows and stretch the column band page-wide | 034_NC p42; **near-universal drafting convention** | `isGenericHeaderRow` |
| **B-8** | Side-by-side tables with no empty gutter cannot be split | 046_MI p22 + 044_NY p24 (19 of 27 rows lost) | `columnBandCandidates` |
| **B-9** | Two consecutive rows bracketing an in-table category sub-header dropped | `demo/sample-finish-plan.pdf` MATERIAL SCHEDULE, 2 real rows missing | row-clustering, not yet root-caused |

Full evidence, root causes and fix shapes: `TAKEOFF_BUG_CATALOGUE.md`.

**Fixed this pass** (were B-1 and B-2 here before):
- **B-1** (a printed QTY column was never read) — fixed additively: see §4,
  `scheduled_qty` now reads it by header identity. The legacy `quantity`
  field stays hardcoded `1` on purpose, so no scored key row's score moves.
- **B-2** (`sequences` threw `Unknown takeoff kind`) — fixed: `compileTakeoff.mjs`
  routes it (and `embedded_coil_gaps`) from every caller. See §4.

## 6. What to do next, in order

1. **B-3** — one quantity model's other half: choose the row identifier by
   cardinality rather than position when no MARK/TAG column exists, so a
   count column never gets deduped as if it were the mark.
2. **B-7** — margin grid labels. Corpus-scale, and cheap to recognise.
3. **B-6, B-8, B-9** — scaled-duplicate detection; splitting gutterless
   side-by-side tables by internal column structure rather than an empty
   corridor; the category-sub-header row-drop (not yet root-caused).
4. **Ground truth at scale** — recall-tier keys for the other 111 bulk sets
   (the tier now exists, §2; one authored so far), which is ~10× cheaper than
   cell-level and the only tier that catches a whole-table miss.
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
