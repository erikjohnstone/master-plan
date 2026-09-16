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
   root-caused precisely, not just observed.** The real `EBB-1` lives on
   sheet `#6` (1 exact hit, confirmed by `find_text` and by eye). The
   *second* "instance" the baseline reports sits on a **different sheet**,
   `#7` (Second Floor Mechanical Plan) — which draws no diffuser/register
   work at all (ductwork for the 2nd floor is routed in the attic, per that
   sheet's own note), only `EBB-5..8`. Calling every ladder strategy
   directly against sheet `#7`'s spans in isolation: `familySuffixTagOcc`
   alone returns exactly this hit, at exactly this bbox. It fires because
   sheet `#7` legitimately draws 4 complete `EBB-*` siblings (`EBB-5..8`,
   satisfying that function's own ≥4-sibling quorum requirement) *and*
   carries a lone, same-text-height bare digit **"1"** nearby — which is
   not a missing-prefix tag suffix at all, but a **keynote callout
   reference number** (a numbered circle referencing the sheet's own
   general note, the same convention visible near the laundry room on this
   exact sheet). `familySuffixTagOcc`'s own doc comment claims "a page's
   ordinary detail/dimension numeral cannot satisfy that shape by itself" —
   a keynote-circle digit evidently can, since it shares the same bare,
   same-height, near-siblings shape the function is designed to accept.
   **Confirmed root cause, not a hypothesis**: `familySuffixTagOcc` cannot
   currently distinguish a real orphaned tag suffix from an unrelated
   keynote/callout digit that happens to sit near enough to a real family's
   siblings.

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

**Retraction, found and corrected within this same session.** An earlier
version of this section claimed `CDB` (baseline: 9) and `RRA` (baseline: 5)
were almost entirely fabricated, based on a `find_text` grounding pass that
found 0 and 1 *exact* hits respectively. **That claim was wrong, and the
error was in this session's own verification script, not the pipeline.**
The exact-match filter used to grid `find_text`'s results discarded
legitimate hits where the real drawn text is the tag **and its CFM value
in one combined, rotated PDF text run** — e.g. the real drawn label reads
`"CDB 290"` (rot 90°), not bare `"CDB"`. Dumping the *raw*, unfiltered spans
starting with each tag's canonical prefix confirms all 9 `CDB` hits and 4
of `RRA`'s 5 hits are exactly this real, legitimate pattern (`"CDB 290"`,
`"CDB 265"`, `"CDB 230"`, `"RRA 495"` ×4 — each a distinct drawn diffuser
with its own airflow reading). **The baseline's counts for `CDB` (9), `RRA`
(5), and `CDA` (2) are correct.** `compoundTagOcc` (the function matching
these) is working as designed — it exists precisely to recognize a tag
glued to trailing content in one PDF run, and this air-device convention
is exactly its target case, not a bug. Lesson for the eventual Phase 3
key-authoring process: **a grounding script must never filter to an exact
canonical match** when checking a ladder built to recognize compound runs;
it must dump raw spans and read them, the way this correction did.

**What *is* a real, confirmed bug in this set: `CWP-1` is over-counted by
one, and the cause is genuinely a false positive, of the H7 kind
(note/prose text miscounted as a plan instance).** The real spans starting
with `"CWP-1"` are: one bare `"CWP-1"` tag (the real drawn instance), and
one general installation note reading `"CWP-1 AND CWP-2 SHALL BE STACKED
AND MOUNTED TO..."`. `compoundTagOcc`'s own guard (key, then a token
boundary, then `/` or whitespace, then more alphanumeric text in the same
run) does not distinguish "a real compound identity label" from "an
ordinary sentence that happens to start with a tag name" — the note text
satisfies the same shape a real `"R1 /C-11"`-style compound label would.
**This is a genuine, confirmed instance of H7**, the first this session
found rather than merely failed to rule out.

Net, corrected picture for bldg5406: of the full row vocabulary grounded
(`AHU-1`, `VAV-1..9`, `AC-1`, `ACCU-1`, `EF-1/2/3/4/5`, `CH-1`, `CWP-1/2`,
`L-1/2`, `AS-1`, `ET-1`, `CDA/CDB/CDC`, `SRA`, `RRA/RRB`, `ERA`, `CP-1` — 31
row keys), only **`CWP-1` is a real, confirmed miscount** (over by 1, via
the H7 note-text mechanism above). Every other count is correct, including
the three (`CDB`, `RRA`, `CDA`) this session first, wrongly, flagged as
fabricated.

`keys/bldg5406-hvac-demo.tagocc.csv` is **written and committed**: 32
`ROW_LABEL` rows (including a compound `AC-1 / ACCU-1` schedule row split
correctly into its two real plan tags) and 43 `PLAN_INSTANCE` rows, plus one
`NOTE_MENTION` row documenting the confirmed `CWP-1` false positive in
place. `VAV-6` has a real row label and zero plan instances anywhere —
recorded as an intentional absence (`SCHEDULE_ONLY`), not a gap.

**Ruler result**, run end-to-end against the corrected key:

```
tag_to_row: 43 key plan instances, 43 matched, recall 100%
row_to_tag: 26 row groups, 25 exact count matches, 96.2%
```

The single row→tag miss is exactly the one confirmed, root-caused bug
above (`CWP-1`, expected 1, actual 2) — nothing else. Two ground-truth keys
in, the ruler is producing clean, fully explained results with no
unaccounted-for discrepancy.

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
| H3 | First-non-empty ladder drops mixed split/whole tags on one sheet | Not yet measured directly |
| H4 | Rotated tags are missed | **Partially refuted, incidentally** — rotated (90°) tag+value runs (`"CDB 290"`, `"RRA 495"`) are found correctly by `compoundTagOcc` on bldg5406; rotation itself was not the obstacle in any case examined this session. Not a full test of H4 (no case of a *missed* rotated tag was found) but the cases seen all resolved correctly. |
| H5 | Orphan tags (no schedule row) are invisible to row-driven tools | **Confirmed by construction**, inherent to every row-driven tool audited |
| H6 | itd-d1-lab over-counts are cross-view redraws | Not yet measured — itd-d1-lab not examined this session |
| H7 | Note mentions/legend entries leak into counts | **Confirmed, once, precisely** — bldg5406's `CWP-1` is over-counted by 1 because `compoundTagOcc` matches an installation note ("CWP-1 AND CWP-2 SHALL BE STACKED...") as if it were a second compound tag label. bessemer's `D-1`/`D-2`/`D-6` and a split-run "HP-1 IS TYPICAL..." note stayed correctly excluded, so this is not universal — H7 fires specifically when note prose happens to start with `<tag><space><more text>`, `compoundTagOcc`'s exact trigger shape. |
| H8 | Row lookup disagrees across the three duplicated implementations | Not yet measured |
| **H9 (new, corrected)** | **The occurrence ladder's `familySuffixTagOcc` fallback can recover an unrelated digit (a keynote/callout reference number) as a tag's missing suffix, when that digit happens to sit near enough to ≥4 real family siblings** | **Confirmed and precisely root-caused on one real document.** bessemer's `EBB-1` on sheet `#7`: the real `EBB-5..8` siblings are genuinely drawn there, satisfying `familySuffixTagOcc`'s own quorum gate, and a bare "1" — actually a keynote circle's reference number, not a tag fragment — gets recovered as a phantom second `EBB-1`. **Narrower and more precisely diagnosed than the first version of this finding claimed** — see the retraction in the bldg5406 section: the originally-reported `CDB`/`RRA` "fabrication" (a much larger, class-wide claim) was traced to a bug in this session's own verification script, not the pipeline, and has been withdrawn. |

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
| Full corpus eval, takeoff+reference phase (`reports/TAKEOFF-EVAL-2026-09-16_1541.txt`) | Completed after **2,988 seconds (49.8 minutes)**. Every single set dropped sharply from its documented baseline: bessemer 100%→**70.0%**, itd-d1-lab 89.7%→**68.1%**, federal-mech 92.2%→**88.2%**, navfac 96.3%→94.9%, bldg5406 96.4%→**75.0%**, baker-county-eoc 87.5%→**10.0%**. | **Do not trust these numbers — this run is very likely corrupted, not just slow, and is flagged here as a warning rather than reported as current state.** The key tell: `bessemer` is a 10-tag, 8-page document that normally scores 100% and completes in seconds; contention-driven slowness alone should not make a small, fast job *wrong*, only slow. Every set degrading at once — including the smallest, fastest one — points at something more specific than generic CPU starvation: `test:shared-path` was running **concurrently**, hitting the **same shared, content-addressed on-disk sheet-graph cache** (`cachedSheetGraph`) for overlapping documents (bldg5406 is used by both). A read racing a concurrent write to that cache can hand back a partial or inconsistent cached graph. This is exactly the scenario `opentakeoff-corpus/GOAL.md`'s own standing rule exists to prevent ("do not run two heavy jobs" — a rule this session violated by launching corpus-eval, two mcp test suites, and the web suite concurrently with ground-truth authoring). **This entire eval run needs to be thrown out and re-run alone, on an idle cache, before any of its numbers are treated as real** — including baker-county-eoc's 10.0%, which is the single most alarming number in this whole session and almost certainly an artifact, not a 90-percentage-point regression that happened to occur during this exact session with no code change to explain it. |

## What remains for Phase 0

- **Two complete, validated ground-truth keys exist** (bessemer, bldg5406);
  **5 more sets remain** from the plan's original target list
  (baker-county-eoc, navfac-cherry-point-atc, federal-mech, itd-d1-lab),
  plus 3+ held-out bulk documents blocked on bulk-corpus staging (blocked on
  network policy, unresolved this session).
- H2, H3, H4 (only incidentally touched), H6, H8 not yet measured.
- **The full corpus-eval run from this session must be discarded and
  re-run alone**, once the machine is idle — see the takeoff+reference
  finding above. Do not carry today's 70.0%/68.1%/88.2%/10.0%-style numbers
  into any other document as current state.
- Isolated re-verification of every test-suite finding flagged above as
  contention-suspect (`demoD04`, `demoD05`, `demoD09`, `T-HVAC-01`, and now
  the whole corpus-eval run), on an otherwise idle machine, before any of
  them are reported as real.
- `mcp/test:shared-path` full run had not finished at time of writing.
- `web/test/tableRecallGaps.test.ts` B-11/B-12 regression — flagged as a
  separate task, not fixed here (out of this plan's scope); the
  `spawn_task` call itself timed out under load and should be retried.
- **Operational lesson for future sessions on this repo**: do not run
  ground-truth authoring concurrently with corpus-eval or heavy test
  suites. `opentakeoff-corpus/GOAL.md` already says not to run two heavy
  jobs at once; this session violated that and the evidence above (a
  10-tag document scoring wrong, not just slow) is a concrete demonstration
  of why the rule exists.

This file will be updated, not replaced, as those continue.
