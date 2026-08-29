# OpenTakeoff HVAC/BAS Corpus — Goal, Method, and Current State

Last updated: 2026-08-29, ~11:52am, after a session interruption (system
restart at 3:30am; this Claude Code session resumed at 11:06am with the
background workers and eval processes it had running lost — their real
work already merged to git is intact and reflected below; anything still
in-flight at the moment of interruption is marked PENDING/UNVERIFIED, not
claimed as done).

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
reference isn't done.** And even 100% on the corpus is a proxy, not the
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

**Takeoff-eval numbers below are the last independently-verified full-corpus
run this session** (mcp/scripts/takeoff-eval.mjs, run against commit
`56d79bf` — see §6 for exactly how "independently verified" is defined).
Reference-eval and graph-eval numbers are per-set, from whenever they were
last actually run this session (noted). Anything not re-verified since a
later merge is flagged.

| Set | takeoff-eval | reference-eval | graph-eval (rowsym) | Status |
|---|---|---|---|---|
| **bessemer** | **100.0%** (10/10 tags) | 100.0% | recall 86.7% (13/15) | **Closed** — the original pinned demo set, first to reach 100% on takeoff. SR-1/TG-1 remain a disclosed, unchased inline-motif miss on rowsym specifically. |
| **itd-d1-lab** | **98.3%** (114/116) | 100.0% | not recently re-run | 2 disclosed exact deltas: US-2 (expected 3, actual 5), WC-1 (expected 2, actual 3) — real, small overcounts, not chased further. ET-1 correctly refuses (genuine ambiguity — two real, separate devices legitimately share a bare mark; this must NEVER resolve). |
| **federal-mech** | **92.1%** (93/101 exact) | 87.1% (27/31 cells) | not recently re-run | CH-1 is a **confirmed genuine dead end** (see §7) — precisely root-caused, deliberately not fixed. The 18 "falsely added" tags (CU-1..6/EV-1..6/UH-1/2/S-1/2/FTR-1/2) were a **key gap**, not a lookup-table leak: they come from real sheet-#15 catalog schedules (AIR-COOLED CONDENSING UNIT / DX FAN COIL / UNIT HEATER / SILENCER / FIN TUBE RADIATION) with MODEL/MANUFACTURER. `cdcc462` refuse already equivalent. Key extended (FINDING #3); false-add count is now **0**. UH-1/2 join CWP-1/2 as disclosed multi-view +1 overcounts. |
| **navfac-cherry-point-atc** | **79.9%** (159/199 exact by last full run) | 80.6% (25/31 cells) | not recently re-run | The single biggest real-progress story tonight: started at 46.1% baseline, climbed via multiple real root-cause fixes (see §6). Real remaining gaps: a residual pump/valve family (PCHWP-MT1, SCHWP-M1, SHHWP-M1/M2, HRHWP-MT1, CUH-T1/T2, CV-CHW-BP-T, CV-HHW-BP-A) still refused/missing — a worker was re-diagnosing these when interrupted, **PENDING**. |
| **baker-county-eoc** | **62.5%** (25/40 exact) | 76.2% (16/21 cells) | room-finish cell/tag: pinned 100%/100%/100%, must never regress | R1/CD-1 undercount **precisely diagnosed as two real, structural, hard limitations** (not bugs to patch) — see §7. EAC-1/EAC-2/EF-1 fixed earlier tonight. |
| **bldg5406-hvac-demo** | **43.5%** (10/23 exact) | not recently re-run | not recently re-run | AC-1/ACCU-1 fixed tonight. VAV-1..9/ET-1/EF-2/EF-3 (10 of the 13 remaining misses) are a **confirmed genuine dead end** (see §7) — this set's ceiling is well below 100% until/unless OCR is added, which is explicitly out of scope right now. A worker was auditing its reference-eval/graph-eval numbers when interrupted, **PENDING**. |
| **itd-d1-lab-raster** | 0.0% (correct — see below) | 0/0 cells, vacuous | rowsym 0.0% (vacuous — all-refused key) | **This 0% is the CORRECT, expected answer, not a failure.** This set is a synthetically-rasterized (zero vector text) version of itd-d1-lab's own M1.0 sheet, built specifically to prove the pipeline *refuses cleanly* on a scanned page instead of crashing or inventing data. Confirmed: every real code path refuses honestly, no crashes. This is what "100%" looks like for a raster set under this project's own honesty rules — it will only ever change if OCR is added. |

**Corpus-wide aggregate (takeoff-eval only, last full run):** 355/471 tags
exact ≈ 75% blended, but this single number is explicitly not the goal —
per-set numbers above are (§1).

---

## 4. How this has actually been getting built (method, not just outcome)

- **Coordinator/worker model.** One coordinating session (this one) plus
  up to 3 concurrent background workers (`Agent` tool, `isolation: "worktree"`,
  each in its own git worktree/branch), always targeting real, disclosed
  gaps — never busywork. A hard, explicit standing rule tonight: **never
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

- **bldg5406-hvac-demo's VAV-1..9 / ET-1 / EF-2 / EF-3.** Confirmed live,
  directly, via pdf.js operator-list + text-content inspection: these
  specific tags are drawn as raw vector path geometry (stroke/fill ops
  tracing the letterforms directly — "explode text to polylines," a real
  CAD-authoring convention some firms use for a handful of tags) —
  the string is not encoded as text *anywhere* in the PDF. No amount of
  run-stitching, rotation-awareness, or codepoint-decoding can recover
  it; only OCR against the rendered raster, or vector glyph-shape
  recognition, could — and this project has explicitly decided **no
  further investment in OCR/vision right now** (a prior planning phase
  already scoped `classify_symbol`, vision-assisted matching, as a
  deliberately narrow, already-measured, mediocre fallback — not the
  mechanism this project leans on). This caps bldg5406 well under 100%
  until/unless that decision changes.
- **federal-mech's CH-1.** A `dataFrom` header-boundary miscomputation in
  `skipSubHeaderContinuation` (`web/src/lib/sheetgraph.ts`), on a real
  9-line-deep header — precisely root-caused, with an exact fix
  identified. Deliberately NOT shipped: an analogous fix was already
  tried once, and a full corpus sweep caught it silently dropping 21 real
  tags on a *different* table elsewhere in the corpus. This is disclosed,
  in-code, as a named future task, not something being worked around.
- **baker-county-eoc's R1/CD-1 undercount.** Two separate, precisely
  diagnosed structural limits, not a bug: (a) R1's whole-shape
  corroboration pads outward from the tag *text's* own bounding box, not
  the device symbol's real, offset drawn location (a real leader-label
  drafting convention no fixed pad multiple cleanly reaches — confirmed
  by rendering the exact padded capture region and seeing it truncate the
  real symbol); (b) CD-1's real drawn-instance ceiling is 9, not the
  key's literal 21, because 2 of 9 real callouts carry an explicit
  "TYP N" multiplier this pipeline has no text-parsing logic for at all —
  and even against that lower ceiling, whole-shape matching plateaus at
  an already-documented ~76-82% register/diffuser hatch-fill scoring
  ceiling (real-world size variance), with the pipeline's own
  purpose-built inline-motif fallback never reached because whole-shape
  happens to succeed first, by chance, on 2 of 9 real siblings. A
  narrowly-scoped idea (supplement, never replace, whole-shape misses
  with an inline-motif pass) was identified as promising but explicitly
  NOT attempted without being able to fully verify it's safe first.
- **itd-d1-lab-raster.** By design (see §3's own row) — this is the
  system's own honest raster-refusal path being exercised on purpose, not
  a gap to close. It only moves if OCR is added.

---

## 8. Immediate next steps (as of this file's writing)

1. **Resolve the interrupted-session state honestly** before trusting any
   further number: the last full corpus takeoff-eval run that completed
   was against commit `56d79bf`; the 3 workers dispatched right after it
   (federal-mech's falsely-added bank, bldg5406's reference/graph audit,
   navfac's remaining pump refusals) and a follow-up full-corpus eval were
   all in flight when the session was interrupted, with **no completion
   record** — their real work may still exist in their own worktrees
   (`.claude/worktrees/agent-{aaa168d...,a36eeff...,aa72f41d...}`) and
   should be checked directly (`git status --short` / `git diff --stat`
   in each) before assuming anything landed or was lost.
2. Re-run a full, fresh corpus-wide eval (all 3 scripts) once system load
   has genuinely settled (it was severely elevated — 16-22 — from a
   post-reboot Spotlight re-index at the moment this file was written,
   unrelated to this project's own processes) to get a clean, current
   baseline before dispatching new work.
3. Resume the standing "always 3 concurrent workers, always the biggest
   real remaining gap first" model from there, per §4's own discipline.
