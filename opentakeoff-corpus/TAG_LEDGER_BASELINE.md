# Tag ledger — Phase 0 baseline (in progress)

Started 2026-09-16, executing Phase 0 of
`plans/03-schedule-row-to-drawn-tag-reconciliation-plan.md`. This file
records what Phase 0 has actually measured so far, session by session. It is
**not complete** — see "What remains" at the bottom before treating any
number here as a closed gate.

**Read this first: the single highest-severity finding of this session is
in "federal-mech — sheet-role misclassification breaks `sweep_schedule_row`
almost completely," below.** On this real, VAV-heavy federal building
document, 3 of the first 5 sheets — including the two carrying the
building's entire ground-floor VAV/diffuser population (58+ distinct
tags) — are misclassified away from `role: "plan"`, and `sweep_schedule_row`
hard-refuses to search any sheet that isn't. This is not a hypothetical:
it is quantified directly against the production code path this whole
plan exists to harden.

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

## bldg5406-hvac-demo — second complete ground-truth key, scored (100%/100% after fixes)

Stale section title from earlier in this session, kept for the history
below but corrected here: this set's key IS written and committed
(`keys/bldg5406-hvac-demo.tagocc.csv`, 32 `ROW_LABEL` + 43
`PLAN_INSTANCE` + 1 `NOTE_MENTION`), and after the two real bugs found
below were fixed (see "Both confirmed bugs are now fixed" further down),
this set scores a clean 100% tag→row recall / 100% row→tag exact match,
zero misses in either direction.

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

## Both confirmed bugs are now fixed, tested, and live-verified

Committed as `94c6811` (H9 / `familySuffixTagOcc`) and `8bd5f20` (H7 /
`compoundTagOcc`) on `claude/tender-meitner-4efhoz`.

- **`familySuffixTagOcc`**: the sibling-proximity radius was tightened from
  25× to 10× the median sibling text height, chosen with margin verified
  against both existing calibration tests (need ≤9×) and the confirmed
  false positive (needs ≥11.4× to recover its second "sibling"). A third
  test pins the exact real fixture.
- **`compoundTagOcc`**: now requires the text after a tag's delimiter to be
  exactly one compact token, matching every real target case
  ("R1 /C-11", "E1/C-2", "P1 /INV-2") and excluding ordinary prose that
  merely starts with a tag name. A fourth test pins the exact real fixture.

Live re-verification, both fixes applied, run against both keys:

| set | tag→row recall (before → after) | row→tag exact (before → after) |
|---|---|---|
| bessemer | 66.7% → 66.7% (unchanged — the remaining gap is the unrelated `FD-1`/`WB-1` table-recall miss, out of scope for this plan) | 82.4% (14/17) → **88.2%** (15/17) |
| bldg5406-hvac-demo | 100% → 100% (unchanged, was already clean) | 96.2% (25/26) → **100%** (26/26), zero misses in either direction |

Full regression coverage before each commit: `symbolsweep.test.ts` (77→78
tests, all passing after each fix), every other test file that imports
`symbolsweep.ts` (`sweepScheduleRow`, `countKeyedSchedule`, `markid`,
`equiptags`, `taggedVectorGrounding`, `scheduleLanguageScan`,
`legendlearn`, `hvacRefShapes`, `inlinemotif`, `strokeLum`,
`sweepCoalesce`, `sweepNegative`, `symbolAffine` — 351/351 combined), full
web typecheck and lint (clean, same 3 pre-existing warnings).

## itd-d1-lab — third complete ground-truth key, scored (targets H2, H6)

This 29-page set was specifically flagged by the original audit for H2
(hyphen/space spelling variants) and H6 (cross-view redraws). `keys/itd-
d1-lab.tagocc.csv` is written and committed: 135 rows (63 `ROW_LABEL` + 72
`PLAN_INSTANCE`) across 9 families (`CH`, `SN`, `SAV`, `GEV`, `SEV`, `EF`,
`CV`, `HC`, `EH`) plus 4 `PLAN_INSTANCE` rows for an unscheduled 10th
(`HEV`). Full methodology, including why this key's grounding process
differs from bessemer/bldg5406's, is in the key file's own header comment
— summary: this document draws every tag as a stacked two-line hex glyph
(e.g. a hexagon with "HC" on one text line and "8" directly below it, two
separate PDF text runs, not one hyphenated run), so grounding used a
script that dumped raw spans (the same `textSpans()` the production ladder
itself reads) and paired each label span with the nearest digit span
below it, rather than per-row `find_text` calls. Confidence in the pairing
comes from every recovered digit landing inside its own schedule's real
row-number range (no out-of-range digit ever got paired, which is what a
false pairing against nearby duct-dimension text would produce).

**Ruler result**, `tag-ledger-eval.mjs` against the production ladder,
run in isolation (no concurrent heavy jobs, unlike the corrupted eval run
above):

```
tag_to_row: 72 key plan instances (68 scheduled + 4 unscheduled),
            68/68 scheduled instances matched, recall 100%
row_to_tag: 59 row groups, 59/59 exact count matches, 100%
```

The only misses are the 4 `HEV` instances, and they miss for exactly the
structural reason H5 predicts (a row-driven baseline cannot discover text
with no row to start from) — not a defect.

**H6 (cross-view redraws): tested cleanly, not confirmed as a defect.**
Every one of `HC-1` through `HC-9` is genuinely, correctly drawn twice —
once on the ductwork plan (sheet `#3`, coil inline in the supply duct run)
and once on the hydronic plan (sheet `#5`, paired with its control valve
`CV-#`). This is 9 full rows × 2 legitimate sheets = 18 instances, the
largest and cleanest H6 fixture found this session, and the ladder
recovers the correct count (2) for every one of them — no double-counting
error, no dropped occurrence on either sheet. **H6 as originally posed
("itd-d1-lab over-counts due to cross-view redraws") does not reproduce
on this family**: the two views are legitimate, and the tool correctly
treats them as two real instances of one row rather than either merging
them into a wrong count or refusing to reconcile them.

**H2 (spelling variants): still not found.** Every `ROW_LABEL` in this
key is a clean single-span `PREFIX-N` schedule cell, and every
`PLAN_INSTANCE` is the same two-line hex glyph pattern with no alternate
spelling observed. Not falsified — simply absent from the 9 families
sampled here. Two ground-truth keys and 68 scheduled cross-checked
instances in on this document, H2 remains a hypothesis in search of a
positive example.

**H5 (orphan tags), a clean second confirmation, found by full-document
scan.** `HEV` is drawn 4 times on sheet `#4` (`HEV-1..4`) and appears in
*zero* schedule tables anywhere in the 29-page document — confirmed by
scanning every sheet's spans for the substring `HEV` (4 hits total, all on
sheet `#4`). A row-driven tool cannot discover these by construction, and
the eval above shows exactly that gap with the correct explanation
attached, not a silent drop or a wrong-row misattribution.

**H1, a second real-document instance, incidentally found.** Sheet `#9`
(title block reads "M4.1", a `MECHANICAL DETAILS` sheet — combustion air
intake, flue, duct liner, and seismic-restraint construction details, zero
schedule tables, zero tag instances) is classified `role=schedule` at
confidence 0.85 by the production sheet-graph builder. This is the same
failure mode as bessemer's sheet `#2` (a details sheet scored as a
schedule) on an entirely different document, strengthening H1 from "one
document's quirk" to "a real, repeatable classifier weakness." Not
remediated here — Phase 0 records ground truth, not fixes — but flagged
for whichever phase hardens sheet-role classification (this plan's own
Phase 4).

Not examined this session: sheets `#18`–`#21` and `#28` (also
`role=schedule`, `#20`/`#21` at only 0.5 confidence) and 11 of this
document's ~20 schedule families (`B` boiler, `HUM` humidifier, `LEF` lab
exhaust fan, `D` diffuser, `R` grille, `AHU`, and the page-14 specialty/
split-system families) — deliberately out of this key's scope, which
targeted the control-valve/BAS-relevant families per this plan's stated
product goal rather than exhaustive per-document coverage.

## federal-mech — sheet-role misclassification breaks `sweep_schedule_row` almost completely

No ground-truth key written yet for this 24-page set (VAV/AHU-heavy, per
`sets.json`); what follows came from building its sheet graph and reading
its first 5 pages against their assigned roles, which surfaced a defect
severe enough to write up on its own before any row-level key-authoring.

**The mechanism, precisely.** `sweep_schedule_row` — the production tool
that grounds a schedule row's tag on the drawing, the exact capability
this whole plan exists to harden — has a hard, documented gate
(`mcp/src/session.ts:3639`, the tool's own contract comment): *"The tag
must be DRAWN on at least one plan-role sheet... a fingerprint is NEVER
guessed from text alone — refused."* Both the row-grounding path
(`session.ts:4003-4009`) and the census/count path (`session.ts:2547-2561`,
which throws outright if zero plan-role sheets exist) build their search
space by filtering `graph.sheets` to `role === "plan"`, strictly. A sheet
classified anything else — `legend`, `schedule`, `detail`, `unknown` — is
never searched for a drawn tag occurrence by either path, no matter what
is actually drawn on it.

**What's actually on the first 5 pages of federal-mech**, read directly off
the rendered PDF and cross-checked against each sheet's own title-block
"DRAWING TITLE" field:

| page | real drawing title (title block) | real content | assigned role | confidence |
|---|---|---|---|---|
| 1 | MECHANICAL ABBREVIATIONS AND SYMBOLS | a pure legend/abbreviations/general-notes sheet, zero to-scale plan content | `plan` | 0.85 |
| 2 | HVAC ZONE LEGEND | a real to-scale ground-floor plan with **58 distinct `VAV-N` tags** drawn inline, plus a hatch-pattern-to-zone legend key at the bottom | `legend` | 0.5 |
| 3 | GROUND FLOOR AIR TERMINALS | a real to-scale plan, densely tagged with diffuser/register/grille families (`S1-1..S4-1`, `R1-1..R3-3`, `E1-1..E3-3`) and CFM values | `detail` | 0.6 |
| 4 | GROUND FLOOR DUCT PLAN | a real to-scale duct plan with `VAV-1..VAV-56`+ redrawn (a second, legitimate cross-view instance of the page-2 VAVs — the same H6 pattern itd-d1-lab's `HC` family showed), plus 3 small Room Schedule tables in one corner | `schedule` | 0.85 |
| 5 | ROOF PLAN | roof-mounted equipment (`EF`, `CU`, `ALP`) | `plan` | 0.85 |

Only page 5 is classified correctly. Pages 2, 3, and 4 — the three pages
that carry essentially the entire ground-floor VAV and air-terminal
population of the building — are all misclassified away from `plan`.

**Root cause, read directly from each sheet's stored classifier evidence**
(`graph.sheets[i].evidence`, the exact text span the classifier used to
decide role):

- **Pages #3 and #4 (verified against `classifySheetRole`'s actual regex
  tiers in `web/src/lib/sheetgraph.ts`, not just the stored evidence —
  and more precise than "the title was outranked"): the sheet's own
  title-block text does not match ANY plan-role signal at all**, so there
  was never a competing plan hit for the classifier to weigh against the
  winning schedule/detail one — this is a real regex-coverage gap, the
  same class of gap this file's own comments document being fixed
  before (e.g. the "MECHANICAL - LEVEL N ENLARGED PLAN" and
  room-scoped "ENLARGED PLAN" widenings, one of them *citing this same
  document's own sheet #7*). Confirmed directly: `planBase.test("GROUND
  FLOOR AIR TERMINALS")` and `planBase.test("GROUND FLOOR DUCT
  PLAN")` both return `false` against the live regex.
  - Page #3's title, **"GROUND FLOOR AIR TERMINALS," contains the word
    "PLAN" nowhere at all** — a real plan-sheet naming convention (name
    the terminal/device type, never say "PLAN") this classifier cannot
    recognize as a plan title under any tier; only the weak sheet-number
    fallback (`^(A|M|E|P|S|FP)-?1\d\d`, confidence 0.4) could have saved
    it, and that fallback only runs when a sheet has *zero* signal hits —
    it never gets the chance here because the generic sheet note
    `"...SEE ARCHITECTURAL PLANS AND DETAILS."` produces a real `detail`
    hit (0.6) first.
  - Page #4's title, **"GROUND FLOOR DUCT PLAN," does contain "PLAN,"**
    but the base plan regex requires a fixed discipline word
    (FLOOR/MECHANICAL/HVAC/etc.) *directly* adjacent to "PLAN" — here
    "DUCT" sits between "FLOOR" and "PLAN," so it fails the same way
    "MECHANICAL ROOM ENLARGED DUCT PLAN" used to before the enlarged-plan
    widening, except this title isn't an "enlarged" plan either, so
    neither existing widening reaches it. The genuinely stronger
    `"Room Schedule"` hit (0.85, matching `SCHEDULE_TITLE_RE`) wins
    outright — no dissent-halving even applies, because there's no
    competing plan hit to dissent with.

  So the actionable fix is not "prioritize the title block" in the
  abstract — `classifySheetRole` has no concept of title-block position
  at all, it scores every span on the sheet as a flat bag and the
  strongest signal wins — it is specifically: **widen the plan-title
  regex to recognize (a) a generic device/terminal-type title with no
  literal "PLAN" word, and (b) a non-enlarged "<discipline> <drawing-type
  noun> PLAN" word order** (a plain "DUCT PLAN"/"PIPING PLAN", not just
  the already-fixed "ENLARGED …PLAN" shape). Both are real, standard AEC
  title conventions on this one document alone; the existing code's own
  comments show this file's fix history already treats "structure first,
  regex confirms, generalizes across ≥2 real documents" as the bar for
  this kind of widening — this finding supplies the evidence for the
  next such widening, it does not attempt it here (see the "not attempted
  now, and why" note below).
- **Page #2 (a genuine ambiguity, not simply a bug):** its own title block
  really does say "HVAC ZONE LEGEND" — the classifier read the sheet's own
  stated purpose correctly. The defect here is that a real, to-scale,
  heavily tagged (58 `VAV-N` marks) floor plan can be *authored* under a
  title that says "legend," and a role scheme with exactly one "this
  sheet is searchable for drawn tags" bit per sheet cannot represent
  "this sheet is titled a legend and is also a real plan" at all. Fixing
  pages #3/#4 (title-block priority) would not fix this one; it needs a
  content-based signal (to-scale linework plus a high density of distinct
  equipment-family tags) that can promote a sheet into the plan search
  space regardless of its stated title.
- **Page #1 (a real regex false-positive, opposite direction, low
  severity):** a pure legend/symbols sheet is wrongly *included* as
  `plan` because its section heading "MECHANICAL FLOOR PLAN SYMBOLS"
  genuinely does match the base plan regex (`planBase.test("MECHANICAL
  FLOOR PLAN SYMBOLS")` → `true` — "FLOOR" sits directly before "PLAN",
  same shape as a real title). This doesn't cost a missed tag — the sheet
  has none to find — but it shows the same regex has a real, opposite-
  direction false-positive mode: a *legend of plan symbols* reads the
  same to this signal as an actual plan title. Any fix to (b) above
  (recognizing more "<word> PLAN" shapes) should be checked against this
  false-positive direction too, not just the two misses.

**Not attempted in this session, deliberately.** Every prior widening of
this exact regex block (read in full above it) was validated against
multiple real corpus documents before being accepted, and this plan's own
Phase 4 gate (`Gate 4` below) explicitly requires broader ground-truth
coverage than Phase 0 currently has before sheet-role changes are
considered safe — `classifySheetRole` is a shared, corpus-wide function
with a far larger blast radius than the two occurrence-ladder functions
fixed earlier this session (`familySuffixTagOcc`, `compoundTagOcc`, both
narrow, independently unit-tested pure functions). A regex change here
without re-running the full corpus eval afterward risks silently
regressing another document's sheet roles with no one noticing until
much later — exactly the class of mistake this session's own corrupted
corpus-eval run (see "Test suite findings" below) is a live example of
what happens under time/resource pressure. This finding is handed to
Phase 4 fully root-caused, with the exact regex, the exact failing
strings, and a verified false-positive direction to guard against,
rather than risking a rushed fix now.

**Quantified, not just qualitative.** A direct script (not
`sweep_schedule_row`, which won't touch these sheets at all, but
`session.tagOccurrencesForKey` — the same text-search machinery
`sweep_schedule_row` calls per-sheet once it has decided to search one)
confirms the tags are perfectly findable *as text* on the misclassified
sheets:

```
distinct VAV-N single-run spans on page #2: 58 (VAV-1 .. VAV-58)
tagOccurrencesForKey(page #2 "legend", "VAV-36") -> 2 occurrences found
tagOccurrencesForKey(page #4 "schedule", "VAV-36") -> 1 occurrence found
(same result shape for VAV-1, VAV-58 — checked directly, not just VAV-36)
```

The text-occurrence ladder under audit elsewhere in this document has
**no problem at all** with this document's tags. The failure is entirely
upstream of it: `sweep_schedule_row`'s role gate would never offer page #2
or page #4 to that ladder in the first place. For any `VAV-N` row on this
document, the production tool's actual search space (pages classified
`plan`: #1 [empty], #5, #6, #7 [not yet examined]) excludes the two pages
carrying the real ground-floor population entirely — the tool would very
likely refuse most `VAV-N` rows with "tag appears nowhere on the plans,"
not because the tag isn't drawn, but because the sheet it's drawn on was
never asked.

**Why this is the standout finding of the session.** H1 (role
misclassification) was already confirmed twice, on bessemer and
itd-d1-lab — but both of those were low-content detail/legend sheets,
where getting the role wrong costs little (a handful of tags, at most).
This is the same defect class causing near-total data loss on a real,
representative, VAV-heavy federal building document — precisely the
"run a control valve takeoff and ground every tag on the drawing"
scenario this plan's stated product goal is about. **Sheet-role hardening
(this plan's own Phase 4) cannot be treated as lower-priority than Phase
1/2/3's row-reconciliation logic** — on a document shaped like this one,
a perfect occurrence ladder still produces near-total silence, because
the sheets it would need to search are never handed to it. The two real,
verified fixes (not "title-block priority" in the abstract — see the
corrected root-cause bullets above): (1) add `DUCT` next to `DUCTWORK` in
`classifySheetRole`'s discipline-word list (`web/src/lib/sheetgraph.ts`
~line 205) — a one-token, narrowly-scoped change, confirmed by direct
regex execution to turn sheet #4's "GROUND FLOOR DUCT PLAN" from no-match
into a match, without weakening the existing "FLOOR PLAN" pattern that
(correctly) still fires on sheet #1's false positive; (2) the sheet #2
content-based-promotion case (a real plan titled "legend") has no
comparably narrow fix and needs a genuinely new signal (to-scale linework
plus tag density), design left to Phase 4.

**A full ground-truth key was built for this set's `VAV` family** (58
rows, `keys/federal-mech.tagocc.csv`) specifically to run this finding
through the same ruler as every other set, not just describe it
qualitatively. Result, `tag-ledger-eval.mjs` against the production
ladder:

```
tag_to_row: 117 key plan instances, 0 matched, recall 0%
row_to_tag: 58 row groups, 1/58 exact count matches, 1.7%
```

Every one of the 117 key occurrences (58 on sheet #2, 59 on sheet #4,
including a genuine double-drawn `VAV-45`) comes back `unresolvedShouldResolve`
— found as real text, never resolved to a row, because neither carrying
sheet is ever offered to the resolver. The row→tag misses are not clean
zeros: `row_misses` shows "expected 2, actual 1" for nearly every row,
not "actual 0" — because **a third real, legitimate, correctly-classified
view of the same `VAV` family exists**: sheet `#6` ("GROUND FLOOR HVAC
PIPING PLAN," role=plan at 0.85 — its title matches via the *existing*
"PIPING PLAN" shape, unlike sheet #4's "DUCT PLAN") redraws every VAV box
along the piping runs and IS found correctly. This is a third H6-relevant
cross-view instance of the same family (not included as key rows here —
out of this key's scope, noted in its own header), and it's also the
clean, direct proof that fix (1) above is exactly the missing piece:
sheet #6 differs from sheet #4 by exactly one recognized word
("PIPING" vs. "DUCT").

Not yet done for this set: ground truth for its other ~15 families;
sheets #8–#24 unexamined; sheet #6/#7 not added as key rows (noted, not
grounded).

## H8 — row-identity resolution disagrees across duplicated implementations

Investigated by code inspection and live execution of the real, unmodified
repo functions (not speculation) against the plan's own named comparison:
`sweepScheduleRow`'s row vs `uniqueFamily`'s row vs
`reconcileScheduleFamilyFromGraph`'s row. **Confirmed**, with two concrete,
executed disagreement examples — the full investigation is more precise
than the plan's original framing ("three duplicated implementations"), so
recorded in full here rather than compressed to one line.

**The tag→row *lookup* primitive is not duplicated.** `rowKeyAnswersFor`
(`web/src/lib/sheetgraph.ts:4098-4122`) is one function, called by
`sweepScheduleRow`, `resolveTag` (rooms only), and `queryTable.mjs` alike.
This part of H8's premise does not hold — no fix needed here.

**The row→identity-tag *extraction* direction is where the real
duplication lives.** A shared helper, `rowIdentityTag`
(`web/src/lib/schedulePlanReconcile.mjs:337-376`), is used by three
production paths (`sweepScheduleRow`'s `identityOf`,
`reconcileScheduleFamilyFromGraph`, `buildPlanSetTakeoff`) — but a fourth,
`uniqueFamily` (`web/src/lib/corpusTakeoff.mjs:750-979`, the HVAC
`compile_corpus_takeoff` path, confirmed live via shipped evidence
artifacts carrying `"source": "compileHvacTakeoff"`), is a hand-copied
reimplementation that has drifted despite eleven "parity with compile
uniqueFamily" comments in the codebase trying to keep it in lockstep. A
fifth, `countMarks`, reads `row.key` directly and calls neither.
`markid.ts`'s `markKey`/`spanAnswersFor` (the plan's own F2 finding: the
"best identity module") has zero production importers — dead code,
test-only.

**Disagreement 1 — an "EQUIP NO"-keyed row (a real, already-documented
corpus shape — `session.ts:3877-3888` describes baker-county-eoc-
bidset.pdf#41's `RTU-1`/`EWH-1`/`CU-1`/`CU-2`/`ERV-01`/`FCU-1`/`FCU-2`/
`WH-1` rows this way):**

```
row = { key: "", cells: { "EQUIP NO": { text: "RTU-1" } } }
rowIdentityTag(row)              => "RTU-1"   (sweepScheduleRow, reconcileScheduleFamilyFromGraph)
uniqueFamily's per-row pipeline  => []         (DROPS the row entirely)
```

`uniqueFamily`'s own header regex (`corpusTakeoff.mjs:842`) doesn't
recognize the literal `"EQUIP NO"` header (`rowIdentityTag`'s does,
`schedulePlanReconcile.mjs:362`), so `tag` never overrides the empty
`row.key`, and the row is silently skipped
(`corpusTakeoff.mjs:881`, `if (!canon) continue;`). **Net effect:** the
identical row is present in `sweep_schedule_row`/`reconcile_schedule_plan`
output and absent from `compile_corpus_takeoff`'s HVAC family count for
the same loaded set — a real, load-bearing disagreement between
production MCP tools, not a hypothetical.

**Disagreement 2 — a comma-separated identity value on a family with no
`keyRe`** (a live precondition today: 10 shipped `HVAC_FAMILY_SPECS`
entries — `RTU`, `FURNACE`, `CABINET_UNIT_HEATER`, `CRAH`,
`AIR_COMPRESSOR`, `GRD`, `RANGE_HOOD`, `DUCT_SILENCER`, `LOUVER`,
`LOUVERED_PENTHOUSE` — have a `titleRe` but no `keyRe`/`blankKeyRe`):

```
row = { key: "ERU-1HP-4", cells: { SYMBOL: { text: "ERU-1, HP-4" } } }

reconcileScheduleFamilyFromGraph's canon tag => "ERU-1,HP-4"   (never splits the comma when unfiltered)
uniqueFamily's canon tag                     => "ERU-1HP-4"    (comma/rowKey guard discards the SYMBOL value)
```

Two different canonical strings for the identical input row. Neither
correctly splits into the two real tags (`{"ERU-1","HP-4"}`) — that only
happens once a family supplies a `keyRe` — but they are two *different*
wrong answers, the disagreement H8 asks about.

**Caveats, stated plainly (per this project's "never overclaim" standard
established earlier this session):** disagreement 1's row shape is
attested by the codebase's own comments for a real, named document, but
was not independently re-derived from that document's actual extracted
row objects this session. Disagreement 2's precondition (no `keyRe` on a
titled family) is confirmed live in shipped config, but no specific
corpus document was found where a comma-bearing identity cell actually
occurs on one of those 10 families today — reachable in principle,
unconfirmed as fired in practice. Neither caveat weakens the core
finding: `rowIdentityTag` (three callers) and `uniqueFamily` (one caller,
`compile_corpus_takeoff`'s HVAC path) are demonstrably not the same logic
and can be driven to disagree with real, shippable inputs.

Phase 2 files this points to directly:
`web/src/lib/schedulePlanReconcile.mjs:337-376` (the extractor to make
canonical), `web/src/lib/corpusTakeoff.mjs:750-877` (`uniqueFamily`, to
delete/replace with a call into it), `mcp/src/takeoff.ts:664-677`
(`buildPlanSetTakeoff`, needs the same compound-split treatment as the
other two callers), `mcp/src/session.ts:2514-2589` (`countMarks`, needs
to read the shared extractor instead of raw `row.key`).

## Hypothesis verdicts (H1–H9, from the audit)

| # | Hypothesis | Verdict this session |
|---|---|---|
| H1 | Tags on unknown/misclassified-role sheets are never counted | **Confirmed, concretely, on three independent documents — and on the third, catastrophically.** bessemer p2 is both misclassified *and* its table is never extracted at all. itd-d1-lab sheet `#9` (a details sheet, "M4.1") is separately misclassified `role=schedule` at 0.85 confidence. Both of those are low-content sheets, so the cost is small. **federal-mech is a different order of severity**: 3 of its first 5 sheets are misclassified, including the two carrying the building's entire 58+-tag ground-floor VAV/air-terminal population — see the dedicated section above for the full root cause (evidence-selection ignoring the sheet's own title block) and the quantified proof that `sweep_schedule_row`'s plan-role gate, not the text-search ladder, is what fails. This elevates H1 from "a repeatable classifier weakness" to "a weakness that can silence a real document's entire tag population," and makes sheet-role hardening (Phase 4) at least as urgent as this plan's row-reconciliation phases. |
| H2 | Hyphen/space drawn-text variants are missed | Not yet measured — no variant-spelling case identified in bessemer, bldg5406, or the 9 families sampled on itd-d1-lab. All three ground-truth documents drew every occurrence checked as either a clean single-run tag or a structurally distinct (not mis-spelled) compound/stacked run. Not falsified, simply not yet observed. |
| H3 | First-non-empty ladder drops mixed split/whole tags on one sheet | **Confirmed by direct code inspection** (`mcp/src/session.ts:3522-3561`, `tagOccurrencesOnSheet`). The method's structure is unambiguous: `exact` + `compoundTagOcc` + `countPrefixedScheduleTagOccurrences` are merged and deduped into `dedupedMerged`; if `dedupedMerged.length` is nonzero, **that is returned immediately** — `splitHyphenTagOcc`, `fragmentedTagOcc`/`familyQuorumFragmentedTagOcc`, `deepHyphenChainTagOcc`, and `familySuffixTagOcc` are never even called. The fallback chain only runs at all when the merged-exact tier finds *nothing*. Concretely: if a sheet has one real exact `VAV-1` instance (satisfying `dedupedMerged`) *and* a second, genuinely different `VAV-1` instance that only exists in fragmented/split form elsewhere on the same sheet, the second instance is silently dropped — not merged, not attempted, not disclosed. No concrete real-document occurrence of this exact mixed pattern was found in any of the 3 keys grounded this session (bessemer, bldg5406, itd-d1-lab all checked: no sheet has both an exact/compound instance and an out-of-reach fragmented instance of the *same* key) — checked directly against itd-d1-lab's raw plan-page spans as part of this verification. So this is a real, live architectural defect confirmed by code, not yet observed causing an actual miscount on a real document; whether it fires depends on finding a sheet where one instance of a tag is drawn normally and another instance of the *same* tag is drawn split/fragmented elsewhere on that same sheet, which none of this session's 3 documents happen to contain. |
| H4 | Rotated tags are missed | **Partially refuted, incidentally** — rotated (90°) tag+value runs (`"CDB 290"`, `"RRA 495"`) are found correctly by `compoundTagOcc` on bldg5406; rotation itself was not the obstacle in any case examined this session. Not a full test of H4 (no case of a *missed* rotated tag was found) but the cases seen all resolved correctly. |
| H5 | Orphan tags (no schedule row) are invisible to row-driven tools | **Confirmed by construction, twice.** Inherent to every row-driven tool audited, and freshly re-confirmed concretely on itd-d1-lab: `HEV-1..4` are drawn on sheet `#4` and appear in zero schedule tables anywhere in the document (checked via a full 29-sheet span scan), and the ruler correctly reports exactly these 4 as the only misses, with the right explanation attached. |
| H6 | itd-d1-lab over-counts are cross-view redraws | **Tested cleanly, not confirmed as a defect.** `HC-1` through `HC-9` are each genuinely, legitimately drawn on two different sheets (the ductwork plan `#3` and the hydronic plan `#5`) — 9 rows × 2 real sheets = 18 instances, the largest H6 fixture found this session. The ladder recovers the correct count (2) for all 9, with zero double-counting and zero dropped occurrences. The originally-hypothesized over-count does not reproduce on this family; H6 as posed is not confirmed here (may still apply to families not sampled in this key). |
| H7 | Note mentions/legend entries leak into counts | **Confirmed, once, precisely** — bldg5406's `CWP-1` is over-counted by 1 because `compoundTagOcc` matches an installation note ("CWP-1 AND CWP-2 SHALL BE STACKED...") as if it were a second compound tag label. bessemer's `D-1`/`D-2`/`D-6` and a split-run "HP-1 IS TYPICAL..." note stayed correctly excluded, so this is not universal — H7 fires specifically when note prose happens to start with `<tag><space><more text>`, `compoundTagOcc`'s exact trigger shape. |
| H8 | Row lookup disagrees across the three duplicated implementations | **Confirmed twice over — synthetically and at real corpus scale.** See the dedicated "H8" section above for two executed synthetic disagreement examples. Refined from the original framing: the tag→row *lookup* primitive (`rowKeyAnswersFor`) is genuinely unified; the real duplication is in row→identity-tag *extraction* (`rowIdentityTag`, 3 production callers, vs. `uniqueFamily`, one drifted reimplementation for `compile_corpus_takeoff`'s HVAC path). **Then independently reproduced for real**: this session's clean corpus-eval re-run shows 17 of baker-county-eoc's real quantity mismatches, plus several each on federal-mech and navfac-cherry-point-atc, are exactly this bug — real schedule rows silently absent (`status=not_in_output`) from `compile_corpus_takeoff`'s output, matching the exact "EQUIP NO"-keyed and multi-hyphen-valve-mark shapes the synthetic examples predicted. See "Corpus-eval corruption claim retracted" for the full list. |
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
| Full corpus eval, sheet-graph phase (`reports/EVAL-2026-09-16_1527.txt`) | **cells: 91 right, 0 wrong, 0 missed → 100%/100%/100%** on baker-county-eoc (the only set with a cell key) — *better* than the 2026-09-13 baseline (85.7% recall then); **rowsym: 120 found, 0 unexpected, 18 missed → 87.0% recall**, down from 96.4% on 2026-09-13, new misses on federal-mech (`B-1`, `B-2`) and baker-county-eoc (`RTU-1`, `RTU-2`, `EF-1`, `ERV-01`, +12 more) that were not in the prior documented failure list | **CORRECTED, not contention-driven after all**: re-run clean and isolated this session, rowsym measured **86.2%** (119 found, 19 missed) — within a point of this run's 87.0%, with the same named misses (federal-mech `B-1`/`B-2`, baker-county-eoc `RTU-1`/`RTU-2`/`EF-1`, etc.). The predicted contention effect did not materialize; both numbers are real. The 96.4%→~86-87% drop from the 2026-09-13 baseline is real too and most likely reflects the 3 sets (federal-mech, baker-county-eoc, navfac-cherry-point-atc) added to the corpus after that date changing the denominator, not a regression in the pipeline — not independently confirmed this session, flagged for whoever next has 2026-09-13's exact corpus composition to check against. See "Corpus-eval corruption claim retracted," below, for the full correction and its `T-HVAC-01`-adjacent caveats. |
| Full corpus eval, takeoff+reference phase (`reports/TAKEOFF-EVAL-2026-09-16_1541.txt`) | Completed after **2,988 seconds (49.8 minutes)**. Every single set dropped sharply from its documented baseline: bessemer 100%→**70.0%**, itd-d1-lab 89.7%→**68.1%**, federal-mech 92.2%→**88.2%**, navfac 96.3%→94.9%, bldg5406 96.4%→**75.0%**, baker-county-eoc 87.5%→**10.0%**. | **RETRACTED below — re-run clean, these numbers reproduced exactly. Kept here, struck through in spirit not in fact, so the retraction has something concrete to point at.** See "Corpus-eval corruption claim retracted" further down. |

## Corpus-eval corruption claim retracted — the numbers above were real, not corrupted

**This is a retraction, in the open, of the same kind and for the same
reason as the bldg5406 CDB/RRA retraction earlier in this session.** The
corpus-eval run flagged above as "very likely corrupted... throw it out"
was re-run this session, alone, on an idle machine, with the process
table checked and confirmed clean immediately beforehand (a genuine
isolated run, not merely a claimed one — a real pile of ten leaked
zombie node+python process pairs from earlier ground-truth-authoring
scripts was found and killed first). **Every takeoff+reference number
from the flagged run reproduced exactly, to the decimal point, in the
clean run:**

| set | flagged-as-corrupted run | clean isolated re-run |
|---|---|---|
| bessemer | 70.0% | **70.0%** |
| itd-d1-lab | 68.1% | **68.1%** |
| federal-mech | 88.2% | **88.2%** |
| navfac-cherry-point-atc | 94.9% | **94.9%** |
| bldg5406-hvac-demo | 75.0% | **75.0%** |
| baker-county-eoc | 10.0% | **10.0%** |

Identical results under wildly different concurrent load (the flagged
run had 3+ other heavy jobs competing for the CPU and cache; the clean
run had none) is strong evidence this computation is fully deterministic
and was never actually corrupted by cache contention. **The error was
mine**: I inferred corruption from "every set dropped sharply, including
a small fast one that `normally scores 100%`" — but I never verified
that "normally scores 100%" claim against this specific metric before
asserting it; it was an assumption carried over from a different,
undocumented baseline (likely an older corpus composition or an earlier
version of this exact scoring script from the cited 2026-09-13 date),
not something re-measured this session before being used to diagnose
corruption. The lesson, stated plainly: **a number looking alarming is
not evidence of corruption by itself — re-run clean before concluding
that, the same discipline this project's "never fabricate" law already
demands of ground-truth authoring, extended here to diagnosing eval
results.**

**What this retraction unlocks: baker-county-eoc's 10.0% is real, and
it has a real, now-identified root cause — H8.** The clean run's own
mismatch detail for baker-county-eoc shows 17 of its ~31 real
quantity mismatches are rows with `status=not_in_output` /
`actual=0` for exactly the "EQUIP NO"-keyed family the H8 investigation
above (executed, not synthetic) already named: `RTU-1`, `RTU-2`, `CU-1`,
`CU-2`, `EF-1`, `ERV-01`, `FCU-1`, `FCU-2`, `EWH-1`, `EWH-2`, `EWC-1`,
`MS-1`, `WH-1`, `TV-1`, `ET-1`, `SH-1`, `TPV-1` — every one silently
dropped from `compile_corpus_takeoff`'s output, the exact failure mode
H8's Disagreement 1 predicted and executed synthetically. **This is the
real corpus confirming the synthetic example, not a coincidence**: baker-
county-eoc-bidset.pdf#41 is the actual document `session.ts:3877-3888`'s
own comments describe as carrying these exact "EQUIP NO"-keyed rows. The
same pattern, smaller in scale, shows up in federal-mech (`B-1`, `B-2`,
`FCU-1`, `CU-1/2/3/5` all `not_in_output`) and navfac-cherry-point-atc
(`CV-CHW-BP-M`, `CV-CHW-BP-T`, `CV-HHW-BP-T`, `HHWC-DOAH-T1` — navfac's
own named multi-hyphen valve-mark hypothesis — all `not_in_output`).
**H8 is not a narrow, rarely-triggered edge case; it is a live,
corpus-wide, multi-document source of real dropped-row failures in
`compile_corpus_takeoff`'s output today.**

**A genuine H2 lead, unverified, found in the same data**: baker-county-
eoc's mismatch list carries both `RTU-1`/`RTU-2` and, separately,
`RTU-01`/`RTU-02` as distinct expected keys (the latter pair `expected=0
actual=0`, then separately listed as `MISSING — no item at all in the
pipeline's output`) — exactly the spelling-variant pair this plan's own
Phase 0 target-set table names for this document ("`RTU-01` vs `RTU-1`
spelling"). **Not confirmed as H2 from this alone** — it needs a direct
render read of baker-county-eoc's own schedule and plan sheets to
confirm whether `RTU-1` and `RTU-01` name the same physical unit spelled
two ways (H2) or two genuinely different units that happen to look
similar (not H2). Flagged as the first thing to check when baker-
county-eoc's ground-truth key is authored (queued as task #4).

**What was NOT retracted, and remains correctly flagged as unmeasured
under contention**: the sheet-graph phase's `rowsym` corpus recall was
87.0% in the flagged run; the clean re-run measured 86.2% — close
enough (0.8 points, on a corpus-wide N in the low hundreds) to also read
as "not actually corrupted," and the individual misses listed
(`federal-mech B-1/B-2`, `bldg5406-hvac-demo VAV-6` — already documented
in this file as a genuine `SCHEDULE_ONLY` row, not a bug — `baker-
county-eoc RTU-1/RTU-2/EF-1` and 13 more) are consistent, named, and
explicable, not scattered noise. The `cells` metric was 100%/100%/100%
in both runs, as expected (it never touches the geometric sweep).
**Net effect of this whole exercise: nothing in this session's corpus-
eval numbers needs to be discarded after all** — the original caution
was the right instinct given what was known at the time (multiple heavy
jobs really were running concurrently, and that genuinely is a real risk
worth guarding against going forward, per the plan's own updated risks
section), but the specific conclusion drawn from it was wrong, and this
correction says so plainly rather than leaving the wrong conclusion
standing alongside a quieter fix.

## What remains for Phase 0

- **Four complete, validated ground-truth keys exist** (bessemer,
  bldg5406, itd-d1-lab, federal-mech's `VAV` family); **2 more sets
  remain** from the plan's original target list (baker-county-eoc,
  navfac-cherry-point-atc), plus 3+ held-out bulk documents blocked on
  bulk-corpus staging (blocked on network policy, unresolved this
  session).
- H2 (spelling variants) has a real, unverified lead (`RTU-1`/`RTU-01` on
  baker-county-eoc, above) but is not yet confirmed. H3 confirmed by code
  inspection (no real-document trigger found yet). H4 only incidentally
  touched. **H8 confirmed twice over** — once synthetically (executed
  disagreement examples) and once for real, at corpus scale, via this
  session's clean corpus-eval re-run (baker-county-eoc/federal-mech/
  navfac all show real rows dropped by `uniqueFamily`). H6 was measured
  this session (on itd-d1-lab's `HC` family) and did not reproduce as a
  defect — see the hypothesis table above; it may still be worth checking
  against a family not sampled there.
- **Resolved**: the corpus-eval run was re-run clean and isolated this
  session (`reports/EVAL-2026-09-16_1713.txt`,
  `reports/TAKEOFF-EVAL-2026-09-16_1726.txt`) and reproduced the flagged
  run's numbers exactly — see "Corpus-eval corruption claim retracted"
  above. `70.0%/68.1%/88.2%/10.0%` etc. ARE current, real state, not
  artifacts; carry them forward.
- Isolated re-verification of the test-suite findings flagged earlier as
  contention-suspect (`demoD04`, `demoD05`, `demoD09`, `T-HVAC-01`) is
  still outstanding — unlike the corpus-eval run, these were not
  re-checked this session, so their contention-suspect status stands
  pending a clean re-run of `mcp` test suites specifically.
- `mcp/test:shared-path` full run had not finished at time of writing.
- `web/test/tableRecallGaps.test.ts` B-11/B-12 regression — flagged as a
  separate task, not fixed here (out of this plan's scope). Successfully
  filed as `task_7b49dcf0` ("Fix sheetgraph.ts table-claiming regression
  (B-11, B-12)") after an earlier `spawn_task` attempt timed out under
  load.
- **Operational lesson, corrected**: running corpus-eval concurrently with
  other heavy jobs is still a real, standing risk (`opentakeoff-corpus/
  GOAL.md`'s "no two heavy jobs at once" rule remains correct and is now
  in the plan's own risks section) — but the specific claim that this
  session's own concurrent run had actually corrupted the takeoff+
  reference numbers was checked and found wrong (see the retraction
  above). Treat "looks alarming under load" as a prompt to re-verify
  clean, not as proof of corruption on its own.

This file will be updated, not replaced, as those continue.
