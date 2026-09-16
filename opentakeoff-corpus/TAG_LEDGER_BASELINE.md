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

- **Pages #3 and #4 (the clear bugs):** the classifier's evidence is not
  the sheet's own title block at all. Page #3's evidence is `"GRID. SEE
  ARCHITECTURAL PLANS AND DETAILS."` — a fragment of a generic sheet note
  ("AIR TERMINALS LOCATED IN AREAS WITH ACOUSTICAL CEILING TILES SHALL BE
  COORDINATED WITH THE CEILING GRID. SEE ARCHITECTURAL PLANS AND
  DETAILS.") that happens to contain the word "DETAILS," picked over the
  sheet's own prominent, unambiguous title-block text "GROUND FLOOR AIR
  TERMINALS." Page #4's evidence is literally `"Room Schedule"` — the
  heading of one of three small schedule tables tucked in a page corner,
  picked over the sheet's own title-block text "GROUND FLOOR DUCT PLAN."
  In both cases the correct signal is present, readable, and ignored; an
  incidental keyword match elsewhere on the page wins instead. This is a
  fixable classifier bug: the sheet's own title-block "DRAWING TITLE"
  field should be authoritative over any in-body note or embedded table
  text.
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
- **Page #1 (the same mechanism, opposite direction, low severity):** a
  pure legend/symbols sheet is wrongly *included* as `plan` because its
  evidence text, "MECHANICAL FLOOR PLAN SYMBOLS" (a section heading
  meaning "the legend of symbols used on floor plans"), contains the
  literal substring "FLOOR PLAN." This doesn't cause a missed tag — the
  sheet has none to find — but it's the same underlying weakness
  (keyword-in-evidence-text treated as equivalent to an authoritative
  title) misfiring in the safe direction instead of the costly one.

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
the sheets it would need to search are never handed to it. Concrete,
evidence-backed acceptance criteria for Phase 4, from this finding alone:
(1) a sheet's own title-block "DRAWING TITLE" field must be read and take
priority over any other in-page text when classifying role; (2) a sheet
whose title says "legend"/"schedule"/etc. but which contains substantial
to-scale linework and a high density of distinct equipment-family tags
must be detectable and included in the plan search space regardless of
its stated title — title-block priority alone (fix 1) does not resolve
this case.

Not yet done for this set: a full `.tagocc.csv` ground-truth key (this
finding was significant enough to write up and commit on its own first);
pages #6–#24 unexamined.

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

- **Three complete, validated ground-truth keys exist** (bessemer,
  bldg5406, itd-d1-lab); **3 more sets remain** from the plan's original
  target list (baker-county-eoc, navfac-cherry-point-atc, federal-mech),
  plus 3+ held-out bulk documents blocked on bulk-corpus staging (blocked on
  network policy, unresolved this session).
- H2, H3, H4 (only incidentally touched), H8 not yet measured. H6 was
  measured this session (on itd-d1-lab's `HC` family) and did not
  reproduce as a defect — see the hypothesis table above; it may still be
  worth checking against a family not sampled there.
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
  separate task, not fixed here (out of this plan's scope). Successfully
  filed as `task_7b49dcf0` ("Fix sheetgraph.ts table-claiming regression
  (B-11, B-12)") after an earlier `spawn_task` attempt timed out under
  load.
- **Operational lesson for future sessions on this repo**: do not run
  ground-truth authoring concurrently with corpus-eval or heavy test
  suites. `opentakeoff-corpus/GOAL.md` already says not to run two heavy
  jobs at once; this session violated that and the evidence above (a
  10-tag document scoring wrong, not just slow) is a concrete demonstration
  of why the rule exists.

This file will be updated, not replaced, as those continue.
