# Tag ledger — Phase 0 baseline (in progress)

Started 2026-09-16, executing Phase 0 of
`plans/03-schedule-row-to-drawn-tag-reconciliation-plan.md`. This file
records what Phase 0 has actually measured so far, session by session. It is
**not complete** — see "What remains" at the bottom before treating any
number here as a closed gate.

## Environment notes (affects every number below)

- Node pinned at `web/.nvmrc`/`mcp` = 24; this environment shipped Node 22, so
  Node 24.21.0 was installed via nvm for this session. `mcp/` had no
  `node_modules` at all (fresh checkout) and needed `npm install`. Both
  workspaces now typecheck and lint clean.
- `OPENTAKEOFF_BAS_PYTHON` requires `pydantic` and `pytest`, neither
  preinstalled; both were pip-installed this session. Unrelated to tag
  reconciliation, needed only to unblock the BAS pretest hook.
- **The 81-document bulk corpus cannot be staged in this environment.**
  `drive.google.com` returns a 403 from the network proxy (policy denial,
  confirmed via the proxy status endpoint, not a transient failure). Per
  `scripts/stage-bulk-corpus.sh`'s own documented contingency ("if it fails
  on egress: say so and continue"), Phase 0 in this session is scoped to the
  10 documents that exist in-repo (`opentakeoff-corpus/raw/` + the bessemer
  sample under `opentakeoff/samples/`). Roughly 90 tests in
  `mcp/test/reconcileWorkflow.test.mjs` skip for the same reason — this is
  expected and was true before this session too.
- **This session ran under severe, self-inflicted CPU contention**: four
  heavy jobs (full web test suite, two mcp test suites, full corpus eval)
  were launched concurrently with ground-truth authoring work. A schema
  round-trip test that normally completes in milliseconds
  (`detect_rooms assign mode`, in `test/conformance.test.ts`) took **99.8
  seconds** and still passed. A `planToolParity.test.mjs` test took **25
  minutes** and still passed. Several failures observed this session are
  very likely artifacts of that contention; each is marked below with a
  confidence assessment, not asserted as real.
- One real tooling bug found and fixed in this session's own scripts:
  `console.log(...)` immediately followed by process exit **silently
  truncates output to zero bytes** when stdout is a redirected pipe/file
  under load — Node does not guarantee the async write flushes before exit.
  Every ad hoc grounding script in this session now writes its result via
  `fs.writeFileSync` instead of `console.log`+exit. Worth remembering for any
  future CLI tooling in this codebase that pipes to a file.

## Tooling built and validated this session

- `Session.tagOccurrencesForKey` (`mcp/src/session.ts`) — a small, additive,
  public wrapper around the existing private `tagOccurrencesOnSheet` text
  ladder. No duplicated logic, no geometry.
- `mcp/scripts/tag-occurrence-baseline.mjs` — walks every schedule row's
  identity mark across every plan-role sheet and reports where that text is
  drawn (sheet, bbox, count), using only the wrapper above. Text-only per
  the plan's own rule.
- `mcp/scripts/tag-ledger-eval.mjs` — the ruler. Scores a
  `keys/<set>.tagocc.csv` occurrence key against the baseline above, in both
  directions (tag→row and row→tag), with binned misses. **Now run
  end-to-end against a real, hand-authored key (bessemer) and confirmed
  working** — see results below.

Committed as `fba82a9` on `claude/tender-meitner-4efhoz`, plus this file at
`ac30182`.

## bessemer — first complete ground-truth key, scored

`keys/bessemer.tagocc.csv` is **written and committed**: 20 `ROW_LABEL` rows
and 45 `PLAN_INSTANCE` rows, every one with a `find_text`-grounded exact
bbox (an independent code path from the occurrence ladder under test — plain
substring match on pdf.js text runs, no compound/fragment/hyphen-chain
recovery), not a hand-measured pixel guess. Authored by rendering all 8 real
pages of `opentakeoff/samples/bessemer-mechanical-bidset.pdf` and reading
each one directly.

**Ruler result** (`tag-ledger-eval.mjs` against `tag-occurrence-baseline.mjs`'s
live output):

```
tag_to_row: 45 key plan instances, 30 matched, recall 66.7%
row_to_tag: 17 row groups, 14 exact count matches, 82.4%
```

The 15-instance recall gap and the one wrong-count row are **not diffuse
noise — every one of them is one of two already-understood, named causes**:

1. **`FD-1` (13 instances) and `WB-1` (2 instances) are entirely invisible
   to the baseline** — all 15 of the 15 `unresolvedShouldResolve` misses.
   Root cause, checked directly: `graph.tables` has **zero entries** for
   sheet `#2` (`graph.tables.filter(t => t.sheet === '...#2')` → `[]`). The
   small "Plumbing Fixture Schedule" table that defines `FD-1`/`WB-1` is not
   extracted **at all**, independent of the sheet's role misclassification
   (see below) — a genuine table-recall miss, not a reconciliation-layer
   bug, and out of this plan's scope to fix (it's `sheetgraph.ts`
   extraction, the class of defect `TAKEOFF_BUG_CATALOGUE.md` already
   documents dozens of instances of, e.g. B-16/B-28). Because there is no
   row, there is no row-scope for the baseline's row-driven walk to search
   for, at all — this is **not** a text-occurrence-finding failure; the
   occurrence ladder was never even invoked for these tags.
2. **`EBB-1` shows `drawn_count: 2` in the row→tag miss list, expected 1 —
   a real, confirmed defect in the occurrence-recovery ladder itself.**
   `find_text("EBB-1")` on the same plan sheet (`#6`) returns exactly **one**
   exact hit; a full-page visual read agrees. `tagOccurrencesOnSheet`'s own
   recovery ladder reports two. This is a genuine duplicate-detection bug —
   two different recovery strategies (most likely `compoundTagOcc` and the
   exact-match pass, or two strategies both matching the same span) are
   producing overlapping, undeduplicated hits for this one drawn instance.
   **New hypothesis for Phase 1 (H9):** the occurrence ladder's own
   dedup-by-distance step does not cover every pair of recovery strategies —
   confirmed on a real document, not hypothetical.

Every other tag in the key (`SR-1` ×7, `SR-2` ×2, `TG-1` ×6, `TG-2` ×4,
`HP-1` ×1, `EF-1` ×1, `EWH-1` ×1, `EBB-2..8` ×1 each, `D-1`/`D-2`/`D-6` ×0)
**matched exactly** between the hand-authored key, `find_text`, and the
occurrence baseline — three-way agreement, high confidence.

**Compound finding on sheet `#2` (Underslab Plumbing Plan):** it is
misclassified by `classifySheetRole` as `schedule` (0.425 confidence)
*and* its own schedule table is never extracted into `graph.tables` at all.
These are two independent, compounding defects. Together they make this
sheet's entire real device population — 5 drawn `FD-1` instances plus the
`FD-1`/`WB-1` row definitions themselves — 100% invisible to every
row-driven tool audited (`sweepScheduleRow`, `countMarks`,
`buildPlanSetTakeoff`) today, for reasons that have nothing to do with tag
text recognition.

## bldg5406-hvac-demo — partial (not keyed yet, one major finding)

2 of 4 plan-role pages read (M-101 fully; M-501/M-502/M-503 detail sheets
skimmed — correctly excluded from occurrence search, though M-503 draws a
real chilled-water piping *schematic* naming genuine project equipment
(`CH-1`, `CWP-1`, `CWP-2`, `ET-1`, `AS-1`) — a real, valuable nuance for
Phase 3's classifier design: a schematic naming real equipment is neither a
generic `DETAIL_CALLOUT` (like the illustrative `AHU-1` nameplate mockup on
the same sheet) nor a to-scale `PLAN_INSTANCE`; it needs its own
treatment or an explicit "diagram reference" class, otherwise it risks being
either silently dropped or wrongly double-counted against the real plan
instance of the same equipment).

**Major finding: the occurrence ladder fabricates occurrences from unrelated
text for short, letter-only air-device family marks — not a ±1 duplicate,
an 800%+ over-count.** Grounding the full row vocabulary with `find_text`
(independent of the ladder) against `tagOccurrencesForKey`'s own raw output:

| tag | baseline `drawn_count` | `find_text` exact hits | verdict |
|---|---|---|---|
| `CDB` | 9 | **0** | **all 9 fabricated** |
| `RRA` | 5 | **1** | **4 of 5 fabricated** |
| `CDA` | 2 | 1 | 1 fabricated (same class as `EBB-1`) |
| `ERA` | 3 | 3 | ✅ matches — correct |
| `AHU-1` | 2 | 2, at two genuinely distinct positions | ✅ matches — correct, not a bug |
| `CWP-1` | 2 | **1** | 1 fabricated (same class as `EBB-1`) |
| `ET-1` | 2 | 2, on two different sheets (`#2`, `#14`) | ✅ matches — a real cross-sheet duplicate, correct |
| every `VAV-1..9`, `AC-1`, `ACCU-1`, `EF-1/4/5`, `CH-1`, `L-1/2`, `AS-1`, `CP-1` | 1 each | 1 each, matching bboxes | ✅ all correct |

Inspecting the raw ladder output (`tagOccurrencesForKey`, before `find_text`
narrows to exact matches) for `CDB` and `RRA` directly: the fabricated hits
share a distinctive shape the one real hit doesn't — **narrow (~6px wide),
tall (~25px) bounding boxes at suspiciously regular vertical spacing**
(`RRA`'s four false hits sit at y = 179, 298, 417, 536 — exactly 119px
apart), roughly **double the height of the confirmed real hit** (~12.5px).
This is not the shape of a 2–3 letter tag; it is the shape of a **rotated
duct-size label** (the render shows exactly this convention — vertical
"12x10", "16x8" callouts running alongside ductwork). The strong working
hypothesis: one of the ladder's fallback recovery strategies (most likely
`familySuffixTagOcc` or `fragmentedTagOcc`, both gated to trigger only after
a family-wide quorum/prefix match, per their own doc comments) is matching
fragments of rotated dimension text as if they were air-device family
letters, for exactly the short, digit-less, letter-only tag shape this
schedule family uses (`CDA`/`CDB`/`CDC`/`SRA`/`RRA`/`RRB`/`ERA`).

**This revises and generalizes H9** from "a ±1 duplicate-detection gap" to:
**the occurrence-recovery ladder can fabricate a large number of false
occurrences for an entire tag-shape class (short, letter-only, no digit),
not just double-count a real one.** This is the single highest-priority,
concretely-confirmed defect this session found for Phase 1 to fix — it
would make a naive drawn-count for `CDB` wrong by 900% if shipped as-is.
Not yet root-caused to the exact function/line (would need instrumenting
`tagOccurrencesOnSheet`'s branch selection per call, not done this session);
the shape evidence above is strong but circumstantial.

`keys/bldg5406-hvac-demo.tagocc.csv` is not yet written — the priority
became documenting this finding precisely over completing the file this
session; the grounded data above (in `/tmp/bldg5406-grounding.json` if the
scratch files survive, otherwise easily re-run) is what the key needs.

**Independent confirmation of the plan's central thesis, on a real,
previously-scored document.** The corpus's own committed evaluation
(`reports/EVAL-2026-09-13_0024.txt`) lists `EF-1`, `EF-4`, `EF-5`, `CH-1`,
`AS-1` as the 5 `rowsym-missed` tags for this set — "real drawn symbols NOT
anchored by `sweep_schedule_row`." This session's text-only baseline
(zero geometry) finds **all five as drawn exactly once each**; a direct
visual read of sheet M-101 confirms all five (plus `AC-1`/`ACCU-1`) are
genuinely drawn there. **Text-only tag discovery succeeds exactly where the
full geometric-fingerprint pipeline refuses** — because `sweepScheduleRow`'s
refusal is about failing to build/corroborate a *geometric* fingerprint,
which says nothing about whether the tag's *text* is findable and
resolvable to its row. A production ledger reporting "text found, row
resolved, geometry unverified" instead of a bare refusal recovers exactly
these 5 real installed items as disclosed evidence instead of silence.

## Hypothesis verdicts (H1–H9, from the audit)

| # | Hypothesis | Verdict this session |
|---|---|---|
| H1 | Tags on unknown/misclassified-role sheets are never counted | **Confirmed, concretely, and found to compound with a second defect** — bessemer p2 is both misclassified *and* its table is never extracted at all; its entire device population is invisible for two independent reasons |
| H2 | Hyphen/space drawn-text variants are missed | Not yet measured — no variant-spelling case identified in bessemer or bldg5406 yet; itd-d1-lab remains the flagged candidate |
| H3 | First-non-empty ladder drops mixed split/whole tags on one sheet | Not yet measured directly; superseded in priority by the *new*, confirmed H9 over-count finding on the same code path |
| H4 | Rotated tags are missed | Not yet measured |
| H5 | Orphan tags (no schedule row) are invisible to row-driven tools | **Confirmed by construction**, inherent to every row-driven tool audited |
| H6 | itd-d1-lab over-counts are cross-view redraws | Not yet measured — itd-d1-lab not examined this session |
| H7 | Note mentions/legend entries leak into counts | Small favorable sample only (bessemer's `D-1`/`D-2`/`D-6` correctly report 0; a split-run "HP-1 IS TYPICAL..." note correctly did not inflate `HP-1`'s plan-instance count) — not a real stress test yet |
| H8 | Row lookup disagrees across the three duplicated implementations | Not yet measured |
| **H9 (new)** | **The occurrence-recovery ladder fabricates occurrences, up to an entire class of tag shapes at once, not just ±1 duplicates** | **Confirmed on two real documents.** bessemer's `EBB-1`: ladder says 2, real is 1 (visual + `find_text` + ruler agree). bldg5406's `CDB`: ladder says **9**, `find_text` finds **0** — every single one fabricated. `RRA`: ladder says 5, real is 1. Shape evidence (narrow/tall boxes at regular spacing, ~2x a real hit's height) points at rotated duct-size labels being misread as short letter-only family marks (`CDA/CDB/CDC/SRA/RRA/RRB/ERA`-shaped). **Highest-priority Phase 1 finding this session produced.** |

## Test suite findings

Ran under the CPU contention described above; the web suite and one mcp
suite finished during this session, the other two mcp jobs are still
running at time of writing (see "What remains").

| Test | Result | Assessment |
|---|---|---|
| `web` full suite (`npm test` in `web/`) | **3,202 tests, 3,187 pass, 2 fail, 13 skip** — close to the documented 2026-09-13 baseline (3,144/3,131/0/13); the delta is explained by normal development between then and now, not by anything this session touched | mostly reliable; see the two real failures below |
| `web/test/tableRecallGaps.test.ts` B-11, B-12 | ✖✖, both in ~150ms — **pure, deterministic, fixture-based (no PDF/bulk-corpus/Java/Python dependency), so not a contention artifact.** A real candidate regression in `sheetgraph.ts`'s table-claiming logic, found incidentally, outside this plan's scope. | **Queued as a separate task** (`spawn_task` call to the session, which itself timed out under load — the task description is preserved below in case it needs re-filing) rather than fixed here |
| `mcp` typecheck (both workspaces) | ✅ clean | reliable |
| `mcp/test/conformance.test.ts` "sheet graph (#87)" | ✖ after 69.9s (normally sub-second) | very likely contention timeout |
| `mcp/test/conformance.test.ts` "detect_rooms assign mode" | ✔ after 99.8s (normally sub-second) | passed anyway — proves the scale of slowdown |
| `mcp/test/demoD04.regression.test.mjs` | ✖ in 128ms | fast failure, not contention-explicable — **still needs real investigation**, not done this session |
| `mcp/test/demoD05.regression.test.mjs` | ✖ in 15.5s | ambiguous — needs isolated re-run |
| `mcp/test/demoD09.regression.test.mjs` | ✖ in 890ms, "packaged rooftop schedule must remain extractable" — every earlier assertion in the same test passed | likely a shared on-disk fixture-graph-cache race with 3+ concurrent suites reading/writing the same cache; needs isolated re-run |
| `mcp/test/safewrite.test.ts` "an unreadable file fails CLOSED" | ✖ in 3.2ms | **root-caused, not a code bug**: `chmod 0o000` doesn't block root, and this container runs every process as root |
| `mcp/test/takeoffHvac01.regression.test.mjs` | ✖ after **19.4 minutes** — 375 vs the documented-passing 396 | almost certainly contention-degraded (a warm-cache compile of this same set is documented elsewhere in this repo at 5–38s; 19 minutes is 30–200× that, and the compiler's own `INCOMPLETE_PLAN_SEARCH` disclosure exists precisely for a sweep hitting a work/time cap under load) — **must be re-run in isolation before treating as real** |
| `mcp/test:shared-path` "WP1 keyed compile acceptance on ≥2 non-NAVFAC sets" | ✖ | **explained, not a regression** — needs ≥2 bulk-corpus non-NAVFAC sets, entirely absent here |
| `mcp/test:shared-path` "WP5 parity … D07 VAV tags" | ✔ after **25 minutes** | passed anyway — further confirms contention is inflating duration, not correctness, for tests without internal timeouts |
| `mcp` core suite (`conformance`, `takeoff*`, `session`, `view`, …) | completed: 228+ lines observed, real failures listed above | — |
| `mcp/test:shared-path` full run | still running at time of writing | — |
| Full corpus eval, sheet-graph phase (`reports/EVAL-2026-09-16_1527.txt`) | **cells: 91 right, 0 wrong, 0 missed → 100%/100%/100%** on baker-county-eoc (the only set with a cell key) — *better* than the 2026-09-13 baseline (85.7% recall then); **rowsym: 120 found, 0 unexpected, 18 missed → 87.0% recall**, down from 96.4% on 2026-09-13, new misses on federal-mech (`B-1`, `B-2`) and baker-county-eoc (`RTU-1`, `RTU-2`, `EF-1`, `ERV-01`, +12 more) that were not in the prior documented failure list | **cell scoring is a reliable, likely-real improvement** (it doesn't touch the expensive geometric sweep, so contention shouldn't move it). **rowsym's regression is very likely contention-driven**: the phase itself took **2,180.9 seconds (36.3 minutes)** to complete — the geometric sweep behind rowsym has an explicit work/time-cap disclosure path (`INCOMPLETE_PLAN_SEARCH`) built for exactly this kind of pressure, and a resource-starved sweep hitting that cap manifests as more refusals, i.e. more `rowsym-missed`. **Must be re-run in isolation before treating 87.0% as real** — same caveat as `T-HVAC-01`'s 375. |
| Full corpus eval, takeoff+reference phase | still running at time of writing (the sheet-graph phase alone took 36 minutes; this phase runs full compiles, not sweeps, so its own runtime is unknown) | too early to report — will update when it completes |

## What remains for Phase 0

- `keys/bldg5406-hvac-demo.tagocc.csv` — not started as a file; 2 of 4 plan
  sheets read, enough context gathered to finish it next.
- 7 more sets from the plan's target list (baker-county-eoc, navfac,
  federal-mech, itd-d1-lab, plus 3+ held-out bulk documents — the last group
  blocked on bulk-corpus staging, which is blocked on network policy).
- H2, H3, H4, H6, H8 not yet measured.
- Isolated re-verification of every test-suite finding flagged above as
  contention-suspect (`demoD04`, `demoD05`, `demoD09`, `T-HVAC-01`), on an
  otherwise idle machine.
- The full corpus-eval report (takeoff/reference/graph phases) and the
  `test:shared-path` full run had not finished at time of writing.
- `web/test/tableRecallGaps.test.ts` B-11/B-12 regression — flagged as a
  separate task, not fixed here (out of this plan's scope).

This file will be updated, not replaced, as those continue.
