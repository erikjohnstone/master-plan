# OpenTakeoff HVAC/BAS Corpus — Goal, Method, and Current State

Last updated: 2026-09-01 — Pillar C raised to **corpus-complete** depth:
every BAS set + every valve set must be coordinator-verified and
pipeline-corroborated (see `takeoffs/NEXT_GOAL_LOOP.md`). A+B §6 MET;
Vol2 full 82 INDEX still in scope. Older keyed-corpus history retained.

## Platform mandate (2026-09-02 expansion) — read first, every session

**Read `takeoffs/HVAC_BAS_DOMAIN_MAP.md` before any valve/damper/actuator
or BAS points/SOO extraction or ground-truth work.** It is the real,
web-researched-plus-corpus-verified map of every place this information
actually lives on real jobs — dedicated schedules, embedded-in-equipment-
schedule coil data, riser diagrams, control schematics, drawn symbols, and
what's structurally out of reach (architectural sheets for fire/smoke
damper counts, a separate specifications book) and must be disclosed as an
exclusion rather than silently absorbed into a plausible-looking zero.
"Look for a table titled valve schedule" or "look for a table titled
points list" is not a complete model of where this data lives — treating
it as complete is a production-readiness bug.

The end goal is **not** "100% on this corpus." It is a **general-purpose,
production-grade HVAC/BAS takeoff platform** — valve/damper/actuator
takeoffs, BAS points-list takeoffs, and sequence-of-operations takeoffs, all
fully grounded (cite-backed to sheet+bbox) — that works on **any real
mechanical blueprint set** that carries this information, reachable
end-to-end through the agent path (UI Agent panel and MCP), not just the
named sets in this corpus. The corpus (now 100+ real vector PDFs across
Vol1+Vol2) is the proving ground and the source of real ground truth to
build against — it is explicitly not the finish line. A fix that only works
because it recognizes a specific PDF, tag, or corpus id is a regression
against this goal even if it raises a score.

**Two standing working rules, non-negotiable, apply to every future session
on this effort:**

1. **Regex is never the classification engine — structure is.** Table
   detection, family classification, and row admission must be decided by
   geometry and structure first: table shape, header/column layout, mark
   pattern *by position/shape* (column-0 admits a family, not a string
   match against a name list), cross-source corroboration (schedule ↔ plan
   ↔ SOO), and OCR/VLM assist when vector structure genuinely can't decide.
   Regex may **confirm** a structural finding (a title phrase, a header
   token) but must never be the sole thing standing between "found" and
   "not found." A fix that only adds a regex pattern without first
   establishing structural detection is treating a symptom, not the
   disease — see `takeoffs/VECTOR_TAKEOFF_ENGINE_RESEARCH.md` §1 for why
   this specifically was the original mistake being corrected.
2. **Audit before you build.** Before implementing anything for an
   uncertain requirement, search the actual codebase exhaustively first —
   this platform is large and mature, and the capability being reached for
   may already exist, partially or fully, under a name you didn't expect
   (e.g. `sequenceExtract.ts` already does real SOO section extraction with
   evidence; `estimatorTakeoffDocument.mjs`, `reconcileWorkflow`,
   `hvacTaxonomy.ts`, `gridClassify.mjs`, `queryTable.mjs` already carry
   real structure). Never re-implement or fork something that already
   exists, even partially — extend it on the shared path instead. Grep
   broadly, read the module, run its existing tests, before writing new
   code that might duplicate it.
3. **A census pass over `graph.tables` is not ground truth.** Real ground
   truth means an agent actually rendered the page and looked at it —
   `session.renderSheetPng`, eyes on the image, checked against what the
   compiler claims. The automated census/prewarm scripts prove the pipeline
   ran without crashing and report what the table-classifier found; they do
   **not** prove the finding is correct. Do not conflate "N sets have a
   `pipeline_harness` block" with "N sets have verified ground truth" —
   say which one you mean, every time.
4. **Fixed symbol libraries do not generalize — the legend-read path is the
   real design, use it first.** `match_reference_symbol` matches against a
   small, hand-seeded library built from ONE project's own drafting
   convention (originally Eglin AFB) — real, measured evidence
   (2026-09-02, `itd-d1-lab-mechanical.pdf`) shows it returns **zero**
   matches on a different drafter's real, correctly-drawn control-valve
   glyph (a bowtie body + **rounded dome actuator cap**, vs. the library's
   **square** M-box) even though the set has real, schedule-verified valve
   content. A zero from `match_reference_symbol` is not evidence of
   absence — it is evidence that the library doesn't cover this sheet's own
   convention. The actual generalized answer already exists in the
   codebase: `find_legend_symbols` (`findLegendGlyphs` in `session.ts`)
   auto-detects this **sheet's own** glyph+caption pairs from its own
   legend, no fixed library, no per-firm hardcoding — read the set's own
   legend first, then sweep from what it actually draws. Treat the fixed
   library as a fallback/corroboration signal, not the primary path, until
   this is fixed platform-wide. Real, measured evidence 2026-09-02 on
   `013_MO_T2523_01`'s own controls legend: `find_legend_symbols` correctly
   captured 26 distinct, correctly-labeled valve/actuator glyphs off one
   real legend sheet (`CONTROL VALVE (TWO-WAY, MOTORIZED)`,
   `PRESSURE REDUCING VALVE`, etc.) — the mechanism is real and rich, not
   theoretical. **But a captured legend rect cannot be fed straight into
   `symbol_sweep`'s seed** — confirmed by real refusal on two different
   sets (`itd-d1-lab-mechanical.pdf`, `013_MO_T2523_01`): a legend is drawn
   at its own illustrative scale, essentially never has a stated scale of
   its own, and `set_scale {use_detected:true}` fails on it for exactly
   that reason. This is the tool correctly refusing to guess, not a bug —
   the real workflow is legend-as-visual-reference (read the caption, look
   at the shape) → marquee ONE real instance actually drawn to scale on a
   plan sheet → sweep from that seed. Finding that real on-plan pixel
   location for a small, densely-packed CAD symbol is itself a real,
   unsolved friction point for anything without either an interactive
   agent-UI click or sharper-than-tonight's visual tooling — named
   honestly as still open, not silently worked around.
   **Real, measured follow-up (2026-09-02): the exact-geometry engine
   itself is NOT the "misses wide-open unambiguous symbols" gap.** Built a
   real seedRect (coordinate math done by hand: view-render px → zoom
   0.302469 → native image px, `session.viewSheet` used to visually
   verify the crop at every step before trusting it, not eyeballed
   blind) around one real "EH-1" electric-heater hexagon on
   `itd-d1-lab-mechanical.pdf#3`, then ran a real `scope: "sheet"`
   `symbolSweep`. Result: 29 matches at score **1.0**, 1 withheld at
   0.763. Manually confirmed by coordinate cross-check that both other
   real EH instances on the sheet (EH-2, sitting immediately adjacent —
   exactly the "nothing to confuse it" case — and EH-3, elsewhere on the
   sheet) are IN that 1.0 list, not missed. Manually inspected the one
   withheld hit: it is a genuinely different device (an "SA-1"
   supply-air hexagon with an attached tag circle) that legitimately
   shares EH's hexagon outline — correctly held back at 0.763, not
   falsely counted, not silently dropped. Conclusion: for a real, clean,
   correctly-seeded case, `symbol_sweep`'s matcher works exactly as
   designed. The real, demonstrated gap is upstream of the matcher — the
   manual, error-prone, three-coordinate-space seeding workflow this test
   itself had to do by hand (view px → zoom → native image px) — not the
   matching math. This does not prove there is no algorithmic miss
   anywhere in the corpus (rotated/mirrored/noisy/cross-scale cases were
   not tested here) — say that limit out loud too. Full result saved:
   `symbolsweep-result.json` pattern reproducible via
   `session.sheet(name).widthPx/heightPx` + `session.viewSheet` to
   iteratively narrow a region before calling `session.symbolSweep`.
   **The workflow gap itself is now closed, generalized, not patched
   one-off (2026-09-02):** `symbol_sweep` (MCP tool, session.ts,
   agentTools.js/TakeoffCanvas.jsx UI-agent path) now accepts `seed_point`
   as an alternative to `seed_rect` — one point (image px / normalized
   0..1 in the UI layer), no marqueeing, no manual coordinate math. It
   resolves via a new `findGlyphNear` (`legendlearn.ts`), which reuses
   `find_legend_symbols`' own real-junction-aware, grid-line-stripping
   `clusterSegments` union-find — the SAME connected-component engine,
   generalized off legend captions entirely (this is the actual answer to
   "would a graph library like networkx help": the graph technique
   — connected components over a segment-adjacency graph — was already
   the right idea and was already hand-implemented in-repo; a Python
   graph library would be the wrong language for this Node/TS pipeline
   AND would still need the same CAD-domain tuning — grid-line stripping,
   glyph-shape filtering, spatial bucketing — that `clusterSegments`
   already has, so reuse-and-generalize beat adding a dependency).
   Refuses (never guesses) when no compact glyph-shaped cluster sits
   within snapping range of the point. Downstream sweep logic (scoring,
   rotation/mirror, withheld/rejected, labels, scale, commit) is
   completely untouched — only the seeding step changed. 20 real tests
   (16 legendlearn.test.ts incl. 4 new `findGlyphNear` cases mirroring the
   real adjacent-EH-1/EH-2 case exactly — score 1.0 on the real twin,
   duct-line correctly excluded, null on a genuine miss, snap-from-a-
   rough-click; 3 new tools.test.ts MCP-layer cases incl. `seed_point`
   producing the IDENTICAL real sweep result as the hand-marqueed
   `seed_rect` on the same fixture) — all passing, zero regressions on
   the 18 pre-existing symbol_sweep tests.
5. **Schedule data is not always where you'd expect it, and this varies by
   drafter.** Valve/coil/actuator data can be (a) one fused, deeply
   merged-header AHU/RTU schedule with everything in it (a disclosed,
   still-unparsed gap on the Eglin AFB set — see `hvacTaxonomy.ts`'s AHU
   note), (b) split across several cross-referenced tables (D-1 Lab: `HOT
   WATER REHEAT COIL SCHEDULE` and `CONTROL VALVE SCHEDULE` are two
   separate tables joined by a `HOT WATER COIL` column, confirmed by direct
   inspection 2026-09-02), or (c) never tabulated at all, only drawn as
   symbols. Before writing or trusting ground truth for a family
   (valve/damper/actuator/BAS), check the corpus directly for how *this*
   drafter actually laid it out — do not assume the D-1 Lab shape, the
   Eglin AFB shape, or any other single set's shape is universal. Web
   research on real HVAC/BAS documentation conventions (ASHRAE-adjacent
   guidance, real spec/schedule examples) is required before writing GT for
   a new family or drafting convention the corpus hasn't already proven —
   corpus evidence beats generic web results when they conflict, but skip
   neither.
6. **A giant set is not a broken set — never assume a heavy PDF is a bug
   without a real, isolated retry.** `01_NY_VA_Northport_Dialysis_100CD`
   (162 sheets, 6-part rejoined) repeatedly OOM-killed itself and neighbor
   processes when built concurrently with anything else heavy. Retested
   2026-09-02 in genuine isolation (nothing else running): succeeded
   cleanly in ~36 minutes (162 sheets, 12 tables). It was never broken —
   it's real scale that needs real, uncontested compute time. Under this
   sandbox's ~4-core/15GB ceiling, do not run more than ~2 heavy
   Node+JVM(+Python gmft sidecar) processes concurrently, and pull a set
   this large out to run alone (`kill -STOP`/`-CONT` other shards to pause
   without losing their progress, don't kill them) before concluding it's
   a distinct bug rather than scale.
7. **A valve/damper/actuator or BAS takeoff is never "search for a table
   with a matching title" — that model is explicitly banned, not a
   simplification to fall back on under time pressure.** Real HVAC/BAS
   information lives in at least 8 real, distinct places — see
   `takeoffs/HVAC_BAS_DOMAIN_MAP.md`, required reading, not optional
   background: dedicated tagged schedules, coil data embedded inside a
   broader equipment schedule with zero separate valve schedule anywhere
   in the set (real, confirmed: `001_NC_FY20_P_228_ATC_Tower_and_Air_
   Operations`), tables cross-referenced by a join column, riser diagrams,
   control schematics, drawn plan/detail symbols, the architectural
   fire-rated wall plan (fire/smoke damper counts are NOT authoritative
   from mechanical sheets alone), and a separate specifications book (CSI
   23 09 00 / 23 09 93 — points lists and Sequences of Operation are
   real, standardized spec sections, not just drawing content). A "0
   found" answer is only honest when every reachable source was checked
   AND every source the platform structurally cannot reach (no
   architectural sheets attached, no spec book attached) is disclosed as
   an explicit exclusion on the output — never silently absorbed into a
   plausible-looking zero. Regressing to "did we find a table titled
   valve/points schedule" is exactly the failure this rule exists to
   prevent, and doing it again under time or resource pressure is not an
   acceptable shortcut.
8. **Never sit idle waiting on a background rebuild, census, or scan —
   there is always real platform work to do in parallel, and doing it is
   mandatory, not optional.** A cold graph rebuild, a corpus scan, a
   render — none of these need the coordinator's attention while they
   run; they need a monitor and nothing else. Real work that needs zero
   warm cache and zero corpus access is always available: write/extend a
   detector against a synthetic fixture built from real header text
   already seen tonight (exactly how `extractEmbeddedCoils` and
   `scopeExclusionsForGraph` were built and test-verified 2026-09-02,
   entirely offline, then spot-checked against one real set once
   something was actually warm), wire an already-built compile function
   into the MCP tool / CLI / UI agent paths it's still missing from, add
   the exclusion-disclosure a real finding calls for, tighten a test,
   read and act on `HVAC_BAS_DOMAIN_MAP.md`'s still-open items. Reporting
   "still waiting on X" with no code shipped in the same stretch is a
   failure mode this rule exists to name and prevent, not a status
   update — if nothing shippable came out of a wait, that wait was
   wasted, and the fix is to start the next real piece of work the
   moment a background job is kicked off, not after it reports back.

9. **A row's own `row.key` is an upstream banded GUESS, not ground truth —
   verify it against the row's own cells before trusting it as a tag.**
   Real, found-live bug (2026-09-02): `021_XX_Laboratory_building`'s real
   `AIR TERMINAL UNIT SCHEDULE` (sheet #13) has a REMARKS column that wraps
   across multiple physical text lines and incidentally mentions a
   cross-referenced PUMP tag ("P-1A,B") that is NOT the row's own
   equipment — `sheetgraph.ts`'s row-key banding (`rowKeyOf`/
   `keyColumnBand`) picked that up as `row.key`, even though the row's own
   real identity ("VVR2 - 12") sat right there in its own MARK cell,
   unused. Worse, the SAME real wrapped-REMARKS shape merged two real
   rows' worth of numeric-column data into one `TableRow` object elsewhere
   in the same table (`GPM: "0.7 1.2"`, two real units concatenated,
   unattributable to either). `corpusTakeoff.mjs`'s `extractEmbeddedCoils`
   was hardened at the point this was found — prefer an explicit
   TAG/MARK/SYMBOL cell over `row.key` when the row has one, and reject a
   numeric cell carrying more than one number token as evidence of a
   merged row rather than reporting an unattributable value — both real,
   tested (`corpusTakeoffHeaderGeometry.test.ts`), shipped fixes. The
   deeper bug (the row-banding/segmentation logic in `sheetgraph.ts`
   itself) is NOT fixed — it's real, confirmed, and affects every
   consumer of a table shaped this way, not just this one detector;
   queued as a separate task (`task_10174a20`) rather than patched inline
   under time pressure, because `sheetgraph.ts` is a cache-invalidating
   L0-L4.5 file (any edit costs a full corpus rebuild, previously measured
   at ~9.5 hours) and the real fix needs to be scoped and tested broadly,
   not rushed. The generalizable lesson: `row.key` earns trust from being
   usually-derived-from-the-real-tag-column, not from any guarantee — the
   moment a row also carries its own explicit TAG/MARK/SYMBOL cell, that
   cell is more directly grounded and any extractor reading tags should
   prefer it.

## Current execution policy (supersedes older worker references below)

As explicitly directed on 2026-08-29 and reaffirmed 2026-09-02, this goal is
**coordinator-only — no subagents**. Do not dispatch worker agents, cloud
workers, or Cursor `Task` subagents (`explore`, `debug`, `computerUse`, etc.).
The coordinator implements, tests, profiles, and verifies changes directly in
this Cloud VM. Any worker that was already running when this policy was recorded
is not part of the critical path, and its output must not be integrated. This
policy supersedes the historical coordinator/worker descriptions retained later
in this file.

### Batch `out/*.takeoff.json` emit (116 compile keys) — prewarm-first

Bulk emit must **not** cold-build `graphForPipeline()` inline per set (that
path alone can stretch to many hours with restarts and no warm cache). Use this
order on the coordinator VM only:

1. **Prewarm** — four parallel shards, sidecar off:
   `OPENTAKEOFF_TABLE_SIDECAR=0 npm run prewarm:corpus:shard{0,1,2,3}` from
   `opentakeoff/` (cwd `mcp/` for `node --import tsx`). Finishes the
   content-addressed sheet-graph cache once per PDF.
2. **Emit** — four parallel shards, `--resume`, sidecar off:
   `npm run emit:corpus:shard{0,1,2,3}`. With warm cache this is seconds per
   set; writes `opentakeoff/out/<set_id>.takeoff.json`.
3. **Gap pass** — targeted compile-zero valve/BAS sets only:
   `npm run emit:gap` (`OPENTAKEOFF_TABLE_SIDECAR=1`, cache bust where needed
   for L2.5 pillar-gap recovery).

Do not interleave prewarm and emit on the same sets without `--resume`, and do
not restart workers mid-build (cache writes only after a full graph completes).
After all 116 files exist, run `npm run eval:corpus` for the scoreboard.

The user accepted the verified approximately 80-second forced-cold corpus
runtime on 2026-08-29; evaluator speed is no longer the priority. Proceed
directly to general multi-view deduplication and then the highest-impact
remaining deterministic accuracy gaps, driving every applicable metric toward
100%. Never trade accuracy or regression sensitivity for speed. Honest refusal on
structurally unextractable inputs remains correct behavior rather than a score
to manipulate. **OCR, raster vision, local VLM/AI, and learned symbol detection
are IN SCOPE** on the shared vector pipeline when they genuinely improve recall
or close gaps vector geometry alone cannot — always disclosed, always corroborated
against schedule/plan evidence when possible. Prefer vector text when present;
never hallucinate quantities without cites.

**Evaluation cadence:** do not run a corpus evaluation after every individual
fix. Work in batches of approximately five highest-impact, non-overlapping
accuracy fixes, using focused unit tests and typechecks while implementing,
then run one full corpus evaluation to measure the combined batch and detect
cross-set regressions. If a focused test exposes a defect before the batch is
complete, fix it immediately; the full scorer remains the batch-level gate.
After every evaluation—focused set or full corpus—report the measured result
to the user immediately. Full-corpus reports must always include all three
current metrics (takeoff, reference, and graph), never only the metric changed.

This file is the durable, single source of truth for "where are we and
why" on this effort — write here, not just in chat, so a fresh session
(or a fresh person) can pick this up without re-deriving it.

---

## 1. What the goal actually is (not just "100%")

**The corpus work is a proving ground, not the end product.** The real,
ultimate goal is: **a geometry-first vector takeoff pipeline that can answer real
HVAC/BAS (mechanical + building-automation-system) takeoff questions
against *any* real project's PDF drawing set** — "how many VAV boxes are
on this job," "what's the GPM on pump P-3," "is this control valve keyed
to a real device or is it a cross-reference row" — the same way a human
estimator would, by reading schedules and tracing tags to drawn symbols,
with **deterministic vector extraction as the core** and **OCR / raster /
local AI / VLM assist when that core alone cannot reach the answer.**
Every scored quantity must remain cite-backed and reproducible; assist layers
are disclosed in pipeline notes and corroborated against schedules/plans
whenever possible.

The **corpus** (`/Users/erikjohnstone/Desktop/MASTER PLAN/opentakeoff-corpus`,
outside git on purpose — see §5) is how we prove the pipeline actually
works, instead of just believing it does. It holds real, public HVAC/BAS
drawing sets (never Siemens-supplied, never fabricated) plus hand-verified
answer keys, and getting every set in it to 100% on all three scored
metrics is the concrete, falsifiable stand-in for "the pipeline is
actually good at this job," not a vanity number.

**"100% on the corpus" specifically means, per set, on all three metrics
in §2, simultaneously — a set that's 100% on takeoff but only 60% on
reference isn't done. It also requires the actual demo workflow to be
production-ready: an agent can ask for information from any extractable table
or request a trade/equipment takeoff (for example, "do a butterfly valve
takeoff") and receive deterministic quantities, locations, source cells, and
citations through the production API. A scorer that reaches 100% while an
unkeyed table or real workflow remains inaccessible is not complete. And even
100% on the corpus is a proxy, not the
actual finish line — the actual finish line is the pipeline holding up
against a *new* real set it's never seen, which is exactly why every fix
in this project is required to be general (see §4) rather than tuned to
whatever's currently in the corpus.

---

## 2. The three metrics, precisely

Every set is scored three separate, structurally different ways — kept
deliberately unblended (a set can be excellent on one and weak on another,
and hiding that behind one composite number would be exactly the kind of
self-flattering measurement this project explicitly refuses to do).

### 2.1 `takeoff-eval.mjs` — tag/quantity exact-match
For every real equipment tag a human-authored key says exists (e.g. "VAV-14,
expected quantity 1"), does the pipeline's own `buildPlanSetTakeoff` →
`sweep_schedule_row` chain find the *same* tag with the *same* quantity by
actually tracing it from its schedule row to its drawn symbol(s) on a plan
sheet? Scored as: exact matches / total tags, plus separately-tracked
Σ|Δqty| (how far off the misses are), MISSING (tag never even attempted —
its table was never found/classified), and FALSELY ADDED (pipeline invented
or double-counted a tag the key never mentions — always investigated as
either a real key gap or a real pipeline bug, never assumed).

### 2.2 `reference-eval.mjs` — structural reference-table cell exact-match
For a table that carries no per-instance drawn tag at all (a POINTS LIST,
a connection/calculation schedule, a BAS/DDC points table) — the
`kind: "reference"` path — does the pipeline capture every real
(row, column) cell correctly, verbatim? This is the metric that
specifically covers the **BAS half** of "HVAC/BAS": alarm/trend flags,
DDC point lists, sequences — content a pure equipment-tag takeoff would
never touch.

### 2.3 `graph-eval.mjs` — cell/tag recall + row-to-symbol (rowsym) recall
Two things bundled in one script: (a) room-finish cell/tag classification
recall (does a resolved room tag get the right floor/wall/ceiling finish
code, and is a real room correctly distinguished from a keynote/detail
bubble that only looks like one?), and (b) **rowsym recall** — given a
real schedule row, does `sweep_schedule_row` actually find that tag's
*own drawn symbol* on a plan sheet, geometrically, not just resolve the
row's text? rowsym is the metric that most directly tests "can this
system point at the real thing on the real drawing," which is the crux of
the whole deterministic (non-LLM) claim.

---

## 3. Current real state, per set, per metric

**The numbers below are the latest independently verified forced-cold
full-corpus gate**, run 2026-08-29 against commit `2cd532b` in 56.2 seconds.

| Set | takeoff-eval | reference-eval | graph-eval (rowsym) | Status |
|---|---|---|---|---|
| **bessemer** | **100.0%** (10/10) | **100.0%** (12/12) | rowsym 100.0% | Expected-tag takeoff and reference closed. |
| **itd-d1-lab** | **100.0%** (116/116) | **100.0%** (34/34) | rowsym 100.0% | Closed. Tight cross-sheet registration removes plumbing plan/foundation redraws without collapsing distinct locations. |
| **federal-mech** | **100.0%** (102/102) | **100.0%** (31/31) | rowsym 100.0% | Every audited extracted equipment row is now keyed; zero false additions remain. |
| **navfac-cherry-point-atc** | **100.0%** (217/217) | **100.0%** (31/31) | rowsym 100.0% | Every installed row is exact; schedule-only rows refuse rather than inventing locations. |
| **baker-county-eoc** | **100.0%** (40/40) | **100.0%** (21/21) | rowsym 100.0% | Closed. |
| **bldg5406-hvac-demo** | **100.0%** (28/28) | 0/0 vacuous | rowsym 100.0% | Every extractable row is exact; the two fully exploded fan tags are correctly refused. |
| **itd-d1-lab-raster** | **100.0%** (28/28 expected unavailable) | 0/0 cells, vacuous | rowsym vacuous | The zero-vector-text raster fixture is correctly unavailable without OCR; no value is invented. |

**Current corpus aggregate:** takeoff 541/541 outcomes exact (100.0%):
499/499 applicable installed rows exact, 14/14 honest refusals correct, and
28/28 intentionally raster-unavailable rows correctly absent. Quantity delta,
missing rows, and false additions are all zero. Reference is 129/129 exact
(100%); graph is 91/91 cells exact and 138/138 row-symbol outcomes (100%).
The goal in §1 is achieved for the current corpus.

---

## 4. How this has actually been getting built (method, not just outcome)

- **Historical coordinator/worker model (retired).** Earlier work used one
  coordinating session plus background workers. That model is no longer
  authorized; the current coordinator-only policy at the top of this file
  controls all future work. The enduring engineering rule is: **never
  hardcode corpus specifics (a filename, a tag, a sheet number) into
  production code** (`mcp/src`, `web/src/lib`, runners, verifiers, UI agent
  loop). Every fix has to be a general, real-world-shape-driven rule,
  because the actual goal (§1) is a pipeline that works on drawing sets
  it's never seen — a fix that only helps because it recognizes "navfac's
  own AHU-M1" by name would be actively counterproductive, even if it
  moved this session's own score. This applies equally to the production
  MCP/API path, stdio localhost path, and in-canvas Agent/UI path: same
  strict correctness bar, no answer-steering prompts, no demo-only
  special cases. User-facing workflows must be 100% correct for the same
  class of question on arbitrary blueprints uploaded to the platform as
  more sets are trained on; honest refusal when evidence is missing.
- **Independent re-verification, every single merge, no exceptions.**
  A worker's own claimed numbers are never taken on faith. Before merging:
  `tsc --noEmit` on both packages, the full test suite on both packages
  (`mcp/`: currently 242/242; `web/`: currently 1886/1886, 3 pre-existing
  skips), and the relevant eval script(s) re-run independently. **A fix
  that helps one set but regresses another does not count as done** —
  this was violated once tonight (see below) and the discipline caught it.
- **A real regression WAS shipped once tonight, caught, and fixed** — this
  is the single most important process story of the whole session, worth
  keeping in this file specifically so it's never repeated blind. A fix
  meant to help navfac's AHU-A1/AHU-A2 (commit `353a7fb`) subtly broke
  baker-county-eoc's RTU-1/EWH-1/CU-1/etc — not because anyone was careless,
  but because the fix was merged once under real system load pressure
  without the full corpus-wide check that same night's own standing rule
  requires. It was found by *insisting* on that full check anyway (baker-
  county-eoc dropped from 60.0% to 37.5%, an unmissable signal once
  actually measured), root-caused precisely (`isBareAnchorHeader` and
  `isQualifiedAnchorHeader` are NOT strict complements — a header can be
  neither, and the buggy code required bare-ness when it should have only
  excluded qualified-ness), and fixed with a one-line, precisely-reasoned
  change (commit `fb797e6`). The lesson kept as a standing rule since:
  **never skip the full corpus-wide check to save time under load
  pressure, ever, even once.**
- **A risky fix WAS built, found to regress something else, and correctly
  reverted rather than shipped** — twice tonight (commit `6eee55b`
  partially reverted in `d982172`; a separate pump/valve
  `fragmentedTagOcc` modification built, measured to regress itd-d1-lab
  98.3%→93.1%, and reverted before ever reaching main). Both are treated
  as *successes* of the process, not failures — an honest "found a real
  regression, didn't ship it" is explicitly a valued outcome here, not a
  wasted attempt.
- **Diagnostic tools used, real and specific:** direct PDF rendering to
  visually confirm a real tag/symbol exists before trusting any number;
  small throwaway Node scripts calling the pipeline's own `Session` class
  directly to get the *real* thrown error text (not just the takeoff-eval
  summary's classification of it); `git worktree` + real 3-way merges for
  before/after comparison (never `git stash` — a standing rule, because
  stash has bitten this kind of comparison work before); `repomix` to
  get a compressed structural view of the two largest files
  (`sheetgraph.ts`, `session.ts`, several thousand lines each) before a
  cold full read, purely as a token-cost measure.
- **Infrastructure investment, not just fixes:** a disk cache (`cacache`)
  for OpenDataLoader-PDF's own JSON output cut a repeat extraction from
  ~10s to ~15ms; a real multi-core parallel-eval fan-out (`p-limit`,
  spawning each set's own eval as a separate OS process) turned what used
  to be one long sequential eval into genuine concurrent wall-clock
  savings, deliberately tuned down from concurrency 3 to 2 after it was
  found to compound load spikes when multiple workers each ran their own
  eval fan-out simultaneously.

---

## 5. Where things live, and why

- **Repo** (real git history, real GitHub remote with unrelated ongoing
  work on it): `/Users/erikjohnstone/Desktop/MASTER PLAN/opentakeoff`
  — packages `mcp/` (the MCP server / CLI-facing pipeline) and `web/`
  (the browser canvas app + the shared `web/src/lib` extraction/matching
  logic both sides import from).
- **Corpus** (deliberately **NOT** a git repo, this file included):
  `/Users/erikjohnstone/Desktop/MASTER PLAN/opentakeoff-corpus`
  — `raw/` (the real source PDFs), `keys/` (hand-verified answer-key CSVs,
  one set of `{id}.takeoff.csv` / `.reference.csv` / `.csv`+`.tags.csv`
  (room-finish) / `.rowsym.csv` per set), `sets.json` (the corpus manifest
  with real provenance notes per set). Kept outside git specifically
  because most of these real drawing sets were downloaded from public
  bid-document hosts for local measurement, with redistribution rights
  not independently confirmed — this repo is never meant to republish them.
- A `retired/` entry in `sets.json` holds `weld-county-permit` — pulled
  from the active corpus because its real schedules turned out to be
  raster-embedded pictures, not vector text (confirmed via direct
  operator-list inspection, not assumed) — kept as the future seed of a
  separate OCR-specific corpus, not deleted.

---

## 6. What "independently verified" means, concretely

A number in §3 is only written down here after: (1) the exact eval script
was re-run by the coordinator itself (not just trusted from a worker's own
report) against the exact commit named, (2) both packages typechecked
clean, (3) both full test suites passed, and (4) for any change touching
shared extraction/matching code, the previously-passing baselines on
*every other* set were re-confirmed unmoved (see the regression story in
§4) — not just the set the fix targeted. "Real numbers only, never rounded
up, nothing is 'essentially closed'" has been an explicit, repeated
standing instruction all session — a set is at the exact percentage it's
at, stated plainly, or it isn't reported as a number at all.

---

## 7. Known, confirmed, genuine ceilings — not being chased further right now

Being honest about these here is itself part of the goal (§1) — a system
that silently claims 100% by ignoring what it can't do is worse than one
that discloses its real limits.

- **bldg5406-hvac-demo's EF-2 / EF-3.** Confirmed live via pdf.js
  operator-list + text-content inspection: these two tags are drawn entirely
  as raw vector-path letterforms ("explode text to polylines"). Neither the
  family prefix nor suffix is encoded as text anywhere in the PDF, so
  deterministic run stitching cannot recover them. VAV-6 was previously
  grouped into this ceiling, but its suffix remained searchable and is now
  safely recovered from a local quorum of eight complete sibling VAV tags.
  EF-2/EF-3 require OCR, vector glyph recognition, or a separate
  schedule/service-to-room association proof; none is silently guessed.
- **Resolved former ceilings.** Federal CH-1 now extracts after safe deep-
  header boundary recovery. Baker R1 resolves through compound-label
  ranking, and CD-1 resolves 21/21 through explicit `TYP N` multipliers.
  These are no longer ceilings and remain regression-protected.
- **itd-d1-lab-raster.** By design (see §3's own row) — this is the
  system's own honest raster-refusal path being exercised on purpose, not
  a gap to close. It only moves if OCR is added.

---

## 8. Completion state and next expansion

The **keyed corpus** goal is complete at 100% across takeoff outcomes,
reference cells, and graph row-symbol outcomes. That is a proving ground,
not the platform finish line — real shops upload unfamiliar blueprint sets
daily.

### Autonomous platform loop (2026-08-31+, runs until user halts)

**Foundation (non-negotiable):** **Trust and genuine agnostic blueprint
workflows are our main goal and our foundation.** Every answer must be
deterministic, cite-backed, and set-agnostic — the same shared Session+ODL
path for UI and MCP, honest refusal when evidence is missing, no
corpus-specific hardcodes, no answer-steering prompts, no inflated scores.
Portable schedule truth + accurate plan grounding + commercial-grade
deliverables on *any* real upload is the product bar; the corpus is how we
prove it.

**Authority:** `opentakeoff-corpus/takeoffs/NEXT_GOAL_LOOP.md` · **Coordinator-only**
(no cloud workers). **Shared path mandatory** — UI and MCP consume the same
Session + ODL pipeline.

**Four pillars (sequenced):**

| Pillar | Scope | Status |
|---|---|---|
| **A — Cross-set compile** | Set-agnostic HVAC/BAS/valve **schedule compile** across Vol1 (~31) + Vol2 (all 82 INDEX sets). Honest ZERO/WEAK when no extractable tables. | **Largely complete** — 82/82 Vol2 + Vol1 keyed; family/title/BAS depth continues on WEAK sets. |
| **B — Schedule↔plan reconcile** | Contractor-grade reconcile (`MATCH` / `SCHEDULE_ONLY` / `PLAN_ONLY` / honest refuse) with cites; `T-VALVE-01` N=5; inline motif; Session-unified plan tools + prewarm. | **In progress** — workflow shipped; deepening Vol2 MEAT rejoin locks. |
| **C — Valve + BAS workflow depth** | **Corpus-complete** estimator-deep takeoffs for **every** BAS-bearing set and **every** valve/damper/actuator-bearing set: equipment inventory → SOO/I/O model → typed points / contractor columns → plan paint. Each set must be **coordinator self-checked** against drawings **and** **pipeline-corroborated** (GT harness + locks). Not POINTS LIST scrape; not a sample of 3 demos. | **Active after A+B §6 MET** — plumbing only so far; see `NEXT_GOAL_LOOP.md` WP7–WP8 deep DoD. |
| **D — Plan grounding depth** | Go **deep on grounding**: symbol counts, mark sweeps, and “how many on plan” answers must be **highlighted and accurate** — every cited location visible, no legend-only overclaim, no silent misses. | **Queued after A+B bar met** — see `NEXT_GOAL_LOOP.md` WP9. |

**Objective (Pillars A+B, current):** Set-agnostic HVAC/BAS compile +
schedule↔plan reconcile across the **full** bulk US vector corpus — Vol1
(`opentakeoff-corpus/bulk/HVAC_BAS_Plan_Sets`, ~30 verified sets) **and**
Vol2 (`opentakeoff-corpus/bulk/HVAC_BAS_Plan_Sets_Vol2`, **all 82 INDEX sets**:
69 single-file PDFs plus multipart/split deliveries rejoined when needed).
Every Vol2 set is vector-dense with proven HVAC **and** BAS/controls content;
treat the entire volume as Pillar A stress, not a sample. Keep
`T-VALVE-01` N=5 lock; inline motif in `sweep_schedule_row`; Session-unified
plan tools + graph prewarm; all prior locks green.

**Bulk policy:** Batching is only an operational cadence for probe → key →
fix → negative-control. Scope is **not** “first 5–10 of Vol2.” Honest
ZERO/WEAK compile totals remain correct when a set has no extractable HVAC
schedule tables. Fixes stay set-agnostic on the shared path — never per-PDF
hardcodes or corpus-id special cases.

**Cadence:** Verified batches → update `PROGRESS.md` → `test:workflows` +
focused tests; full Vol1+Vol2 stress drives set-agnostic family/title/BAS
fixes. Pillars C and D start only when A+B success metrics in
`NEXT_GOAL_LOOP.md` §6 are independently verified.

Future corpus keys expand the proving ground without weakening the outcome
model. Every gate remains forced-cold with full metric reporting. Continue
in the coordinator VM; do not dispatch workers or subagents.
