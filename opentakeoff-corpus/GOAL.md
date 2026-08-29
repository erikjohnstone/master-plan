# OpenTakeoff HVAC/BAS Corpus — Goal, Method, and Current State

Last updated: 2026-08-29, ~11:52am, after a session interruption (system
restart at 3:30am; this Claude Code session resumed at 11:06am with the
background workers and eval processes it had running lost — their real
work already merged to git is intact and reflected below; anything still
in-flight at the moment of interruption is marked PENDING/UNVERIFIED, not
claimed as done).

## Current execution policy (supersedes older worker references below)

As explicitly directed on 2026-08-29, this goal is **coordinator-only**.
Do not dispatch worker agents or subagents. The coordinator implements,
tests, profiles, and verifies changes directly in this Cloud VM. Any worker
that was already running when this policy was recorded is not part of the
critical path, and its output must not be integrated. This policy supersedes
the historical coordinator/worker descriptions retained later in this file.

The user accepted the verified approximately 80-second forced-cold corpus
runtime on 2026-08-29; evaluator speed is no longer the priority. Proceed
directly to general multi-view deduplication and then the highest-impact
remaining deterministic accuracy gaps, driving every applicable metric toward
100%. Never trade accuracy or regression sensitivity for speed. Honest refusal
on raster or structurally unextractable inputs remains correct behavior rather
than a score to manipulate. OCR and vision remain out of scope.

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
ultimate goal is: **a deterministic, non-LLM pipeline that can answer real
HVAC/BAS (mechanical + building-automation-system) takeoff questions
against *any* real project's PDF drawing set** — "how many VAV boxes are
on this job," "what's the GPM on pump P-3," "is this control valve keyed
to a real device or is it a cross-reference row" — the same way a human
estimator would, by actually reading the schedules and tracing tags to
drawn symbols on the plan, not by guessing or hallucinating from a
language model. Nothing in this pipeline is an LLM call; every answer is
produced by real geometry, real text extraction, and real table structure
recognition, reproducible byte-for-byte on a re-run.

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
full-corpus gate**, run 2026-08-29 against commit `7678a53` in 55.4 seconds.

| Set | takeoff-eval | reference-eval | graph-eval (rowsym) | Status |
|---|---|---|---|---|
| **bessemer** | **100.0%** (10/10) | **100.0%** (12/12) | rowsym 100.0% | Expected-tag takeoff and reference closed. |
| **itd-d1-lab** | **100.0%** (116/116) | **100.0%** (34/34) | rowsym 100.0% | Closed. Tight cross-sheet registration removes plumbing plan/foundation redraws without collapsing distinct locations. |
| **federal-mech** | **100.0%** (102/102) | **100.0%** (31/31) | rowsym 100.0% | Every audited extracted equipment row is now keyed; zero false additions remain. |
| **navfac-cherry-point-atc** | **95.8%** (206/215) | **100.0%** (31/31) | rowsym 100.0% | Remaining gaps center on schedule-only equipment without plan evidence and a few air-device undercounts. |
| **baker-county-eoc** | **92.5%** (37/40) | **100.0%** (21/21) | rowsym 100.0% | Three vector-backed fixture/luminaire deltas remain. |
| **bldg5406-hvac-demo** | **91.3%** (21/23) | 0/0 vacuous | rowsym 88.2% | The full quarter-turned VAV schedule is queryable; the two remaining fan labels have neither a searchable family prefix nor suffix. |
| **itd-d1-lab-raster** | 0.0% (correct — see below) | 0/0 cells, vacuous | rowsym 0.0% (vacuous — all-refused key) | **This 0% is the CORRECT, expected answer, not a failure.** This set is a synthetically-rasterized (zero vector text) version of itd-d1-lab's own M1.0 sheet, built specifically to prove the pipeline *refuses cleanly* on a scanned page instead of crashing or inventing data. Confirmed: every real code path refuses honestly, no crashes. This is what "100%" looks like for a raster set under this project's own honesty rules — it will only ever change if OCR is added. |

**Current corpus aggregate:** takeoff 492/534 exact (92.1%), quantity delta
81; excluding the intentional raster refusal set, takeoff is 492/506 exact
(97.2%) with quantity delta 17. Reference is 129/129 exact (100%); graph is
91/91 cells exact and 98.6% row-symbol recall. Per-set closure remains the
goal (§1).

---

## 4. How this has actually been getting built (method, not just outcome)

- **Historical coordinator/worker model (retired).** Earlier work used one
  coordinating session plus background workers. That model is no longer
  authorized; the current coordinator-only policy at the top of this file
  controls all future work. The enduring engineering rule is: **never
  hardcode corpus specifics (a filename, a tag, a sheet number) into
  production code** (`mcp/src`, `web/src/lib`). Every fix has to be a
  general, real-world-shape-driven rule, because the actual goal (§1) is
  a pipeline that works on drawing sets it's never seen — a fix that only
  helps because it recognizes "navfac's own AHU-M1" by name would be
  actively counterproductive, even if it moved this session's own score.
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

## 8. Immediate next steps (as of this file's writing)

1. Start the next five-fix batch from the verified 92.1% takeoff (97.2%
   excluding the intentional raster refusal set), 100% reference, and 98.6%
   graph baseline.
2. Prioritize NAVFAC air-device/pump gaps, Baker's five remaining
   vector-backed deltas, and Building 5406's six graph row-symbol misses.
3. Continue directly in the coordinator VM. Do not dispatch workers or
   subagents.
