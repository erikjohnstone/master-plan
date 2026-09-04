# OpenTakeoff — where this actually stands

**One goal: an autonomous HVAC/BAS takeoff platform.** An estimator uploads a
real mechanical drawing set the system has never seen and gets a correct,
complete, cite-backed takeoff.

This file is the only document that describes current state. If anything in
`archive/` disagrees with this file, this file wins. Written 2026-09-04 from
direct measurement; every number here has a command that reproduces it.

---

## 1. What exists and works

A geometry-first vector extraction pipeline plus a takeoff compiler, reachable
through a web UI, an agent, and MCP tools.

Proof it works, from one real federal project (`001_NC_ATC_Tower`), compiled
by the production path: **333 equipment items across 22 populated categories**
with correct marks — `AHU-M1`/`AHU-T1A` kept distinct from `DOAH-M1` and from
six `CRAH-*` units; air-cooled chillers (`CH-A1`) separated from heat-recovery
chillers (`CH-MT1`); 28 FCUs; 25 VAVs; 18 pumps with discipline vocabulary
intact (`HRHWP`, `PCHWP`, `SCHWP`); **163 control valves named by served
equipment** (`CV-AHU-A1-CHW`), so the valve→equipment relationship survives.

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

**The archived `GOAL.md` claims 100%. That is not current and may never have
been.** It cites commit `2cd532b`, which does not exist in this repo's
history. The only Aug-29 eval artefact actually committed here reads **78.4%**.
94.8% was also the score at the commit *before* any 2026-09-04 work, so
nothing that day lowered it — it was simply never re-measured.

## 3. The other 83 documents

The corpus is **90 documents, 3,214 pages**. 7 have ground truth. On the other
83, takeoffs run and bugs can be detected by signature, but **correctness
cannot be proven** — nothing says what the right answer is. That gap, not the
engine, is what stands between this and "production".

## 4. What is broken

| id | bug | scale | where |
|---|---|---|---|
| **B-1** | Every takeoff quantity is hardcoded `1`; a printed QTY column is never read | 496 items on one document | `corpusTakeoff.mjs` 824, 2015, 2521 |
| **B-2** | `sequences` throws `Unknown takeoff kind` — one of three declared product pillars does not run | every document | `compileCorpusTakeoff` dispatch ~2551 |
| **B-3** | Row key falls back to a count column when a table has no MARK | 23 real silencers → **2** | `corpusTakeoff.mjs` |
| **B-4** | Prose fragments recorded as schedule titles | 3+ documents | title hunt |
| **B-6** | A page drawing the same schedule at two scales (0.83×) fuses into unreadable rows | 013_MO p23 | `clusterRows` |
| **B-7** | Sheet-margin grid labels (`A`–`F` at both page edges) qualify as header rows and stretch the column band page-wide | 034_NC p42; **near-universal drafting convention** | `isGenericHeaderRow` |
| **B-8** | Side-by-side tables with no empty gutter cannot be split | 046_MI p22 + 044_NY p24 (19 of 27 rows lost) | `columnBandCandidates` |

Full evidence, root causes and fix shapes: `TAKEOFF_BUG_CATALOGUE.md`.

**B-1 and B-2 are the ones that matter most.** They are why a takeoff reports
numbers an estimator cannot use, and both are contained in one file.

## 5. The architectural debt behind B-1

Three different definitions of "quantity" exist simultaneously:

- `mcp/src/takeoff.ts` — quantity = drawn instances counted on plan sheets
- `web/src/lib/corpusTakeoff.mjs` — one item per schedule row, `quantity: 1`
- a printed QTY column — read by neither

The UI agent calls the second and is told to copy its totals into the answer.
Until there is **one takeoff line carrying `scheduled_qty`, `installed_qty`
and a reconcile status**, the output is a row count wearing a takeoff's name.

## 6. What to do next, in order

1. **B-2** — wire `sequences`. Both ends already exist (`sequenceExtract.ts`
   extracts; line ~2669 renders its CSV); only the dispatch is missing.
2. **B-1 + B-3** — one quantity model: read the QTY column by header identity,
   choose the row identifier by cardinality rather than position, carry
   `installed_qty` from reconcile.
3. **B-7** — margin grid labels. Corpus-scale, and cheap to recognise.
4. **B-6, B-8** — scaled-duplicate detection; splitting gutterless side-by-side
   tables by internal column structure rather than by an empty corridor.
5. **Ground truth at scale** — recall-tier first (what tables are on each
   sheet, from renders), which is ~10× cheaper than cell-level and is the tier
   the current eval structurally cannot measure.
6. **Run the product end-to-end.** The UI agent has never executed a real
   takeoff; every prior run passed empty `kinds` and exercised only the graph.

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
   corpusTakeoff.mjs         the takeoff compiler — B-1/B-2/B-3 live here
opentakeoff/mcp/src/         Session, MCP tools, the scored takeoff pipeline
opentakeoff/mcp/scripts/     evals, census, sweeps
opentakeoff-corpus/
   raw/ (9)  bulk/ (81)      documents; bulk/ is gitignored, re-stageable via
                             scripts/stage-bulk-corpus.sh
   keys/ (28)                ground truth — READ ONLY
   TAKEOFF_BUG_CATALOGUE.md  every bug, evidence, root cause
   archive/                  superseded docs, kept for history only
```

## 9. Why `archive/` exists

Before this file there were 8,728 lines of documentation across eleven files,
including **two different `GOAL.md`s** and **three separate goal-loop
documents**, several marked "ACTIVE" or "AUTHORITATIVE" at once — and one of
them ran on a Pillar A–D framework that `GOAL.md` §8 had explicitly discarded
("Disregard pillars a through d, they are bullshit"). Contradictory status
markers in a repo are not history, they are a trap. The engineering record in
those files is real and worth keeping, so they were archived rather than
deleted, but none of them describes current state. This file does.
