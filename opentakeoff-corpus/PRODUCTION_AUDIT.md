# Production audit — how this becomes a takeoff tool people can actually use

**Written 2026-09-04 from direct measurement, not memory.** Every number below
has a source in this repo, in `/tmp/r29/` artifacts from this session, or in a
command that can be re-run. Where I could not measure, I say so.

Governing question: *what has to be true for an estimator to upload any real
HVAC/BAS drawing set — one this project has never seen — and get a correct,
complete, cite-backed takeoff across HVAC equipment, valves/dampers/actuators,
BAS points, and sequences of operation?*

---

## 0. The five findings that decide everything

1. **The product and the scoreboard disagree about what a quantity is.**
   The scored pipeline (`buildPlanSetTakeoff`, `mcp/src/takeoff.ts`) defines
   quantity as *drawn instances counted on plan sheets* ("a schedule lists TYPES,
   not installed quantity"). The product pipeline the UI agent actually calls
   (`compileCorpusTakeoff`, `web/src/lib/corpusTakeoff.mjs`) emits *one item per
   schedule row* with `quantity: 1` hardcoded at every emission site, and the
   agent's system prompt says to "copy its totals into the answer." A printed
   QTY column is read by neither. Three different quantity semantics; a user
   sees the weakest one. **Nothing else matters until there is one takeoff line
   that carries `scheduled_qty`, `installed_qty`, and a reconcile status.**

2. **Recall is unmeasured — and the first measurement of it indicted my own
   instrument, not the extractor.** 11 of 52 swept documents returned zero
   tables from their densest schedule pages, which I first reported as a 21%
   recall failure. Probing all 11 directly (text-only, per page) shows that
   number is **wrong and mostly my page-scorer's fault**: it ranks pages by
   counting the word SCHEDULE, so it selected an abbreviations legend
   ("SCHED  SCHEDULE" — 010_US p2), general-notes prose ("CONTRACTOR SHALL
   SCHEDULE AND EXECUTE" — 013_MO p5/18/19), pipe specification text
   ("SCHEDULE 40 STEEL" — 029_ME p6), and a drawing callout ("DOOR AS
   SCHEDULED, REFER TO DOOR SCHEDULE" — 034_NC p16/17/18). Zero tables on
   those pages is **correct behaviour**.

   Only **3 of the 11 are genuine misses**, and they are real: 013_MO p23
   (VARIABLE FREQUENCY DRIVE SCHEDULE, h=32 title with TAG/NAME/MANUFACTURER/
   VOLTAGE/PHASE/FUSE-CB/HP headers, plus HVAC PIPING MATERIAL SCHEDULE),
   034_NC p42 (DOOR SCHEDULE + ROOM FINISH SCHEDULE, both h=50 with full
   headers), and 046_MI p22 (LIGHTING FIXTURE SCHEDULE, h=38). Two of those
   three are architectural/electrical rather than HVAC — arguably out of a
   mechanical takeoff's scope, but they must be **disclosed** rather than
   silently dropped.

   The structural point survives intact and is untouched by the correction:
   the eval **cannot see recall at all**, because its keys are scoped to
   "every row `sheetGraph()` finds," so a table never found never enters a
   key. What changed is the size of the hole, not its existence — and the
   lesson is that a page-selection heuristic is itself an instrument that
   needs validating before its output is quoted as a defect rate (see G4).

3. **Ground truth covers 7 of 90 documents, and none of it covers valves,
   BAS points, or sequences.** The 28 key files score HVAC equipment tags,
   reference-table cells, and row→symbol resolution on the 7 `raw/` sets. There
   is no valve key, no points-list key, no SOO key anywhere. Two of the three
   declared product pillars have never been scored against anything.

4. **One of the three pillars does not run.** `sequences` throws
   `Unknown takeoff kind` on every document. `sequenceExtract.ts` does the
   extraction and line ~2669 of the compiler renders the CSV — the dispatch in
   between was never written.

5. **The documented 100% is not the current state.** Today's eval reads
   **94.8%** takeoff (14 missing, 29 falsely added, Σ|Δqty| 49) and
   `itd-d1-lab` reference cells at **41.2%** (was 100%). Section 2 has the
   pre-today vs post-today split.

Everything in this document is in service of turning those five into "done."

---

## 1. What "production" means — the acceptance criteria

This is the definition of done for the whole program. A phase is not complete
because code exists; it is complete when the corresponding line here is
measured true.

| # | Criterion | Measured by |
|---|---|---|
| P1 | **One takeoff line per scheduled unit** carrying tag, family, schedule attributes, `scheduled_qty` (printed QTY when present, else 1), `installed_qty` (plan symbol count), `status` (MATCH / SCHEDULE_ONLY / PLAN_ONLY / REFUSED_* / AMBIGUOUS), and a citation (sheet+bbox) for the schedule cell **and** each plan instance | takeoff-eval + a new reconcile-eval |
| P2 | **Every table on every schedule/controls page is found** or explicitly disclosed as unreadable | recall-tier ground truth (title list per sheet) across all 90 documents |
| P3 | **Every found table is structurally correct** — headers incl. multi-tier, identifier column, cells | cell-tier ground truth on a stratified sample |
| P4 | **Valves / dampers / actuators** from dedicated schedules, embedded coil data, risers, and control schematics, with explicit exclusion disclosure (no architectural sheets → fire/smoke damper undercount risk; no spec book) | valve keys on ≥10 documents |
| P5 | **BAS points** from typed points lists and schematic point↔device, hardwired/soft and alarm/trend when printed, schedule-derived estimates labelled and never merged | BAS keys on ≥10 documents |
| P6 | **Sequences of operation** extracted per system with evidence; no points invented from narrative | SOO keys on ≥10 documents |
| P7 | **Honest disclosure**: per-page accounting; raster pages refused not zeroed; ambiguous keys flagged | census detectors silent; page_accounting complete |
| P8 | **Reachable end-to-end** through the UI agent, MCP, and export — a "complete takeoff" request produces P1 for the whole set without hand-holding | Playwright runs on real documents with DOM + export assertions, diffed against CLI |
| P9 | **Generalizes**: every fix passes a held-out sweep of documents never used to find or tune it; no fix recognizes a filename, tag, sheet number, or corpus id | two-tier sweep gate on every change |
| P10 | **Operable**: bounded memory and time per document; deterministic; no orphaned processes; caches | run-time budget met on the 162-page largest set |

---

## 2. Measured state (2026-09-04)

### 2.1 Corpus
- **90 documents, 3,214 pages** (mean 36; largest 162 — `01_NY_VA_Northport_Dialysis`).
- `raw/` 9 documents in git; `bulk/` 81 documents, 2.6 GB, **exist only on this
  machine** (gitignored). This is a data-loss exposure independent of everything
  else here.
- Ground truth: 28 key files, all for the 7 `raw/` sets. `keys/` and `sets.json`
  are in git.

### 2.2 Scored sets (the only verifiable correctness signal)

Documented (2026-08-29, commit 2cd532b): 541/541 takeoff, 129/129 reference,
138/138 rowsym — 100% everywhere.

Today, at HEAD:

| set | tags | exact | Σ\|Δqty\| | missing | false-add |
|---|---|---|---|---|---|
| bessemer | 10 | 100.0% | 0 | 0 | 0 |
| itd-d1-lab | 116 | 91.4% | 30 | 2 | 6 |
| federal-mech | 102 | 92.2% | 8 | 8 | 2 |
| navfac-cherry-point-atc | 217 | 97.2% | 11 | 0 | 21 |
| bldg5406-hvac-demo | 28 | 100.0% | 0 | 0 | 0 |
| baker-county-eoc | 40 | 90.0% | 0 | 4 | 0 |
| itd-d1-lab-raster | 28 | 100.0% (vacuous — raster refusal) | 0 | 0 | 0 |
| **CORPUS** | **541** | **94.8%** | **49** | **14** | **29** |

Reference cells: bessemer 100%, **itd-d1-lab 41.2%** — the LAB VENTILATION
tables' `SUPPLY AIR VALVE` / `GENERAL EXHAUST VALVE` / … columns come back as
`AIR VALVE` / `EXHAUST VALVE`: the upper header tier (`SUPPLY` / `GENERAL` /
`SNORKEL` / `REHEAT` / `HEATING`, one physical row above) is not absorbed into
the header block, so every keyed cell under those columns reads as missing.

**Pre-today vs post-today:** see §2.6 (filled from the bisect run).

The named failures are exactly the classes the census found independently:
- federal-mech: `VAV-16/17/43`, `FCU-1`, `CU-1..CU-5` — **"the table was never
  seen"** (recall).
- navfac: 21 tags falsely added at qty 51/52 (`CD-*`, `RG-*`, `EG-*`) — mass
  over-count.
- baker-county: a "tag" that is a full spec sentence (`GCO JAY R. SMITH 4220
  SERIES, ROUND EXTRA HEAVY DUTY CAST IRON TOP…`) at qty 7 — prose keyed as a row.

### 2.3 Unscored corpus (52-document sweep, 4 densest schedule pages each)
- 338 tables extracted. 11 documents yield 0 tables; 1 has no schedule-word
  pages at all. All 11 are vector (400–1800 text items/page) — not raster.
  **CORRECTED after direct per-page probing (see §0.2): 8 of those 11 are
  page-selection artefacts, not extraction failures — the scorer picked
  abbreviations legends, general-notes prose, pipe specs and callouts that
  merely contain the word SCHEDULE. 3 are genuine misses (013_MO p23,
  034_NC p42, 046_MI p22).** The earlier "21% recall failure" figure was
  wrong; it measured my own page-scorer.
- 40 tables (12%) have no title; 15 have prose-looking titles.
- Row keys (2,158): **71.6% tag-shaped**, **8.0% bare numbers** (a count column
  used as the identity — the class that turned 23 silencers into 2), 1.4% prose
  (>40 chars), 18.9% names/phrases.
- Valve/damper schedules found in **7** documents; points lists in **3**; SOO
  tables in **0**. Caveat: page selection scores by the word SCHEDULE, which
  systematically under-samples controls sheets titled POINTS LIST / SEQUENCE OF
  OPERATION / I/O. The census page-scorer must use the full vocabulary before
  these numbers mean anything.

### 2.4 Takeoff census (real compiler, 4 documents before it was stopped)
- `001_NC_ATC_Tower`: 333 HVAC items across 22 populated categories with
  correct marks (AHU/DOAH/CRAH kept distinct, chillers split by type, 18 pumps
  with HRHWP/PCHWP/SCHWP vocabulary intact, 163 control valves named by served
  equipment). **The engine works on real federal documents.**
- Same document: every quantity 1; `bas_points` 0 items (suspicious for an ATC
  tower); `sequences` throws.

### 2.5 Verification infrastructure
- takeoff-eval / reference-eval / graph-eval: real, honest scorers on 7 sets.
  Their keys' *values* are independent (rendered and read by eye); their *scope*
  is not.
- Two-tier sweep gate (regression + held-out) and takeoff census: built this
  session, committed.
- **Unit-suite status at HEAD is unknown.** The web suite hit a 3600 s timeout
  under load; the mcp suite was killed. Must be re-established before anything
  ships.

### 2.6 Did today's commits regress the scored sets?
_(filled from the pre-today (08f8559) vs HEAD eval run — see below)_

---

## 3. The architecture as it actually is

`web/src/lib` is **52,117 lines**. The extraction spine `sheetgraph.ts` is
9,185 lines with **201 references to specific corpus documents** in its comments
and 25 named numeric thresholds. `session.ts` 6,332; `corpusTakeoff.mjs` 2,704;
`symbolsweep.ts` 2,510; `agentLoop.js` 2,718; `oneclick.ts` 3,805.

The production build is a layered stack (`vectorTakeoffPipeline.ts`):

```
L0 ingest → L1 spans+segments → L2 geometric (sheetgraph text-clustering, PRIMARY)
→ L2 ODL (OpenDataLoader-PDF, Java) → L1.5 tiling → L2 line-grid (ruled lines)
→ L2 stream-grid → L2 sidecar (Python: pdfplumber ×2, camelot ×2, gmft-TATR)
→ L2.5 pillar-gap recovery → L3 symbol sweep (at query time) → L3.5 topology
→ L4 cross-source dedup → L4.5 OCR (tesseract.js) / VLM (slot, no backend)
→ L5 classify (at compile)
```

Structural observations, not opinions:

- **Six table extractors feed one merge.** Text-clustering heuristics are
  primary; the ruled-line grid — the single most reliable structural signal a
  vector drawing offers — is a *fallback*. Until today the ruled-line gate was
  silently broken on every segment drawn right-to-left (half of them on the
  measured page), which means the fallback ordering was never really tested.
- **Two takeoff pipelines** with different quantity semantics (§0.1), bridged
  by `schedulePlanReconcile.mjs`, which the UI only runs family-scoped and the
  agent is never instructed to run for a "complete takeoff."
- **The 42-rule GOAL.md** (21 fixed, 8 open in their headers) is a log of
  document-by-document fixes to the heuristic spine. Each is real; together
  they are the reason the 201 corpus references exist. The mandate's own rule 1
  ("regex never classifies; structure does") is violated in production by at
  least B-3 and B-4 and by the outline-marker fix I shipped today.
- **Disclosure surface exists and is good**: `page_accounting` statuses,
  `exclusions`, `refuse_not_done`, failure taxonomy in `takeoff.ts`. This is the
  right foundation; it needs to be *complete* (every page, every table).
- **Backends available here**: Java (ODL), all six Python sidecar backends,
  tesseract.js, Cerebras API (now reachable). Production deployment must
  guarantee the same or degrade explicitly.

---

## 4. The gap, layer by layer

Each entry: evidence → root cause → exit criterion → owner.

### G1 · One quantity model (P1) — **highest leverage**
- Evidence: §0.1. `quantity: 1` at lines 824/2015/2521; `plan_paint` gate
  "still required"; agent prompt copies inventory totals; reconcile exists but
  is optional and family-scoped in the UI.
- Root cause: the product path was built as "schedule inventory + you may
  reconcile," not as a takeoff.
- Exit: `compileCorpusTakeoff` returns lines with `scheduled_qty`
  (QTY column by identity, default 1, refuse when unparseable),
  `installed_qty` (whole-set sweep, cached), `status`; the agent's "complete
  takeoff" is this by default; export carries all three; takeoff-eval scores
  `installed_qty` at ≥ baseline on every set; a new reconcile-eval scores the
  status column.
- Owner: **Codex** (compiler, agent prompt, export). Sweep cost/caching:
  **me** (session.ts).

### G2 · Table recall (P2) — **biggest measured hole**
- Evidence: 11/52 zero-table vector documents; federal-mech's 8 "never seen";
  rule 18's 16 silent rows; keys blind by construction.
- Root cause: unknown per document — must be root-caused one by one. Likely
  mix: header-vocabulary gates, banding, title hunt, ODL/sidecar not firing,
  page-role misclassification.
- Exit: recall-tier ground truth (every table title per schedule/controls
  sheet, from renders) for all 90 documents; extraction finds ≥99% with the
  remainder disclosed by name.
- Owner: **me** (bulk corpus lives here; extraction layer).

### G3 · Table structure (P3)
- Evidence: 8% count-as-key; itd header tier truncation (41.2%); untitled 12%;
  prose titles; navfac qty 51/52 over-counts.
- Root cause: position/shape trusted as identity (rule-1 violations).
- Exit: identifier column chosen by cardinality; header tiers absorbed by
  geometry; titles by band-fill; cell-tier ground truth on a stratified sample
  (≥30 tables, ≥20 documents) at 100%.
- Owner: **me**.

### G4 · Page triage and vocabulary (P2, P5, P6)
- Evidence: census/sweep page-scoring by "SCHEDULE" finds 3 points lists and 0
  SOO tables across 51 documents — almost certainly a sampling artefact.
- Exit: every page has a role (schedule / plan / controls / legend / notes /
  raster) with confidence; scoring vocabulary covers POINTS LIST, SEQUENCE OF
  OPERATION, I/O, DDC, VALVE, DAMPER, CONTROL DIAGRAM; a corpus-wide map of
  where valve/BAS/SOO content actually sits.
- Owner: **me**.

### G5 · Valves / dampers / actuators (P4)
- Evidence: domain map lists five locations; only dedicated schedules and
  embedded coils are implemented; riser mining and schematic extraction are
  "not yet built"; no ground truth.
- Exit: valve keys on ≥10 documents; riser and schematic sources implemented or
  explicitly disclosed per document; exclusion disclosure on every valve
  takeoff.
- Owner: extraction sources **me**; compiler/disclosure **Codex**.

### G6 · BAS points + sequences (P5, P6)
- Evidence: `sequences` throws; 0 points on an ATC tower; no keys.
- Exit: dispatch wired; schematic point↔device detector; BAS + SOO keys on ≥10
  documents each.
- Owner: dispatch + compiler **Codex**; schematic detector **me**.

### G7 · Agent / UI / MCP end-to-end (P8)
- Evidence: every UI run this session passed empty `kinds` — the product
  path has **never** been exercised with a real takeoff and a real LLM. The
  Cerebras key works as of today.
- Exit: ≥10 real documents driven through the actual UI agent
  ("do a complete HVAC takeoff", "…valve takeoff", "…points takeoff",
  "…sequences") with Playwright asserting the panel, the export, and equality
  with the CLI compile for the same document.
- Owner: **me** (has the documents and the box).

### G8 · Ground truth at scale (P2–P6)
- Evidence: 7/90; scope circular; nothing for valves/BAS/SOO.
- Exit: two tiers. **Recall tier** for all 90 (title list per sheet — ~10×
  cheaper than cells, and it is the tier the current eval cannot do).
  **Cell tier** on a stratified sample plus the 7. Keys authored from renders,
  scope written down independently of pipeline output, never edited to pass.
- Owner: **me** (rendering + reading is the work; needs vision).

### G9 · Generality (P9)
- Evidence: 201 corpus references; today's fixes each carry a measured margin
  but two carry tuned constants; the held-out sweep was built but has not yet
  been run once.
- Exit: every extraction change runs the two-tier gate; ruled-grid promoted to
  primary when rules exist (with the direction fix, it now actually works);
  a "new document" smoke test on a set added after the fix.
- Owner: **me**.

### G10 · Operability (P10)
- Evidence: cgroup OOM at ~2 GB anon-rss on two concurrent whole-document
  runs; 4 cores; ten orphaned sweeps pinned load at 34; a 90-minute run that
  would have written nothing on timeout (fixed).
- Exit: one-job scheduler; per-document memory/time budget; incremental
  outputs everywhere; the 162-page set completes within budget.
- Owner: **me**.

---

## 5. Sequence — what to do first and why

Ordered by production value per unit time, with the gate that ends each phase.

**Phase 0 — Re-establish truth (≤1 day).** Unit suites green at HEAD; bisect
result recorded (§2.6); fix any regression traced to today; `itd-d1-lab`
reference back to 100% (header tier absorption). *Gate: eval ≥ 94.8% on every
set, suites green, no unexplained diff.*

**Phase 1 — One quantity model (Codex) ∥ Recall (me).** Codex: G1 + B-2 +
B-1/B-3 on the compiler, reconcile-by-default, export. Me: root-cause the 11
zero-table documents; start recall-tier ground truth as I go. *Gate: takeoff-
eval ≥ baseline on all sets with `installed_qty`; the 11 documents produce
tables or a named disclosure; recall-tier keys for ≥30 documents.*

**Phase 2 — Page triage + where the BAS/valve content is (me).** Vocabulary
fix; corpus map. *Gate: every page has a role; census re-run finds the points
lists and SOO text that exist.*

**Phase 3 — Structure (me) ∥ Valve/BAS/SOO compilers (Codex).** Identifier-by-
cardinality, header tiers, titles; schematic point↔device detector. *Gate:
count-as-key 0%; cell-tier sample 100%; keys for valves/BAS/SOO on ≥10 docs.*

**Phase 4 — End-to-end through the product (me).** Real UI agent, real LLM,
≥10 documents, assertions. *Gate: UI == CLI on every one.*

**Phase 5 — Generality + operability.** Held-out gate on every change; ruled-
grid primary; budgets. *Gate: a document added after a fix passes without
touching code.*

**Phase 6 — Raster.** tesseract is weak on drawings; evaluate a vision model
for schedule regions. Always disclosed. Last, because it is a ceiling the
platform already refuses honestly rather than a silent error.

**Stopping condition for the program:** P1–P10 measured true, AND a verification
pass on a newly added document turns up nothing the existing fixes don't
already handle (redundancy — GOAL.md §8's own criterion).

---

## 6. Goal loops

### 6.1 Me (extraction, ground truth, verification, end-to-end)

```
OWN     sheetgraph.ts, session.ts, vectorTakeoffPipeline.ts and its L2 modules,
        symbolsweep.ts, census/sweep/diff harnesses, all keys/ authoring,
        Playwright end-to-end, GOAL.md / catalogue / this audit
NOT     corpusTakeoff.mjs, agentLoop.js, agentTools.js, export (Codex)
LOOP    measure (eval as regression guard + census at breadth + recall keys)
        → pick the highest-scale failure with a nameable root cause
        → fix structurally → two-tier sweep + eval + suites
        → record in catalogue → repeat
DONE    P2, P3, P7, P8, P9, P10 measured true; census silent across 90;
        held-out shows no LOST tables; recall keys for all 90
LAWS    structure classifies, regex confirms; no filename/tag/id special cases;
        audit before building; never invent; keys read-only except when
        authored from a render with scope written independently
NEVER   edit a key to pass; narrow scope; skip a test; run two heavy jobs;
        leave a process orphaned; report "detectors silent" as "verified"
```

### 6.2 Codex (compiler, agent contract, export)

```
OWN     web/src/lib/corpusTakeoff.mjs, agentLoop.js, agentTools.js,
        agentTakeoff.js, takeoffWorkflow.js, export (CSV/XLSX), takeoff
        unit tests + fixtures, mcp/src/tools.ts for takeoff/reconcile tools
NOT     sheetgraph.ts, session.ts, any L2 module, keys/, sets.json
HAS     raw/ 9 documents + 28 keys + sets.json + fixtures. NOT bulk/.
LOOP    reproduce baseline (§2.2) → pick one class → fix structurally
        → eval ≥ baseline on EVERY set, suites green → catalogue → repeat
QUEUE   1 B-2 wire sequences (audit sequenceExtract.ts first)
        2 G1 one quantity model: scheduled_qty by QTY column identity,
          installed_qty via whole-set reconcile, status; agent "complete
          takeoff" = this; export carries all three
        3 B-3 identifier column by cardinality (compiler side); no-identifier
          tables emit one line per row
        4 exclusion disclosure on every valve/BAS takeoff (no arch sheets,
          no spec book)
        5 whatever the eval mismatch lists point at that is compiler-side
DONE    P1, P4-compiler, P5-compiler, P6, P7-compiler measured true;
        eval 541/541 with installed_qty; reconcile-eval green
LAWS    same four
NEVER   edit keys/; narrow scope; skip a test; special-case a document;
        keep an unexplained score improvement; claim 100% you can't explain
```

---

## 7. Risks and what I do not know

- **Heuristic convergence.** The 9,185-line spine may not converge by adding
  rules. Mitigation is architectural: ruled-grid + ODL + sidecar as primary
  structural sources where rules exist, text-clustering as the unruled
  fallback, measured by the census. If the count of corpus-specific references
  keeps rising, that is the signal to refactor rather than patch.
- **Symbol-sweep cost at whole-set scale.** 333 tags on one document; sweep
  per tag is unmeasured. May need caching and budgets before reconcile-by-
  default is viable on large sets.
- **Ground-truth authoring is the bottleneck** and needs vision. I can render
  and read (did today); I do not know that Codex can.
- **Memory ceiling.** ~2 GB per process here; production needs either more
  memory or per-page streaming.
- **The bulk corpus is unbacked.** 81 documents, 2.6 GB, one ephemeral box.
- **Unit suites unknown at HEAD.**
- **Raster** remains a ceiling; tesseract is the wrong tool for drawings.
