## Active work

2026-09-17 linear takeoff: refusal (negative) corpus gains a genuine excluded-family case -- refusal correctness 4/4 -> 5/5 (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
Closed, in part, a gap the prior checkpoint's own priority list named as
missing: every case in `ground_truth/linear/refusals.json` so far was a
seed with NO ink of any kind (title block text, a room label, a scale
callout, blank margin) -- none tested a seed sitting ON real linework of
an EXCLUDED family (an annotation symbol, a dimension line, a
schedule-table gridline), a materially different refusal path through
`trace_run`'s own logic than "nothing here to click."

Two candidates pursued, one set aside for a concrete, disclosed reason
rather than silently dropped. First,
`weld-county-mechanical-permit.pdf#6`'s own DUCT SCHEDULE table: reading
the page's own operator list directly via `extractVectorGeometry` (not
guessing a seed from nearby text -- the same lesson this project's
earlier mistrace incidents already taught) found real, confirmed gridline
segments. But this sheet has no detected drawing scale, and
`bench/linear.mts`'s shared refusal loop unconditionally calls
`session.setScale(..., { use_detected: true })` for every case, which
THROWS on a scale-less sheet rather than producing a `refused` result --
adding this case as-is would break the shared loop, not exercise it. Not
worked around here: modifying shared refusal-loop code for one corpus
entry was judged the wrong trade.

Pivoted to `weld-county-mechanical-permit.pdf#7` (M1.0 -- already scaled,
already this project's development-tier sheet for four other goldens on
this PDF). The same direct-vector-extraction method found short diagonal
segments; three candidate seeds near them were tested against
`trace_run` and all three correctly refused. A marked render crop
confirmed what the strokes actually were before authoring, not after:
the circular outline of a circled keynote/reference balloon symbol (a
circled "2"), not hatching. Added as the corpus's 5th case.

Caught and fixed my own error before committing: the case's first note
text said "keynote-3 reference balloon (a circled '2' callout...)" -- an
internal contradiction (keynote-3 vs. a circled "2"). Corrected to
describe only what was independently confirmed (a real, drawn stroke of
an excluded family, present at this exact coordinate) without claiming an
uncross-checked specific keynote-number identification.

Refusal correctness: **4/4 -> 5/5**, `minRefusalRate = 1.0` gate still
holds. Dimension lines and schedule-table gridlines remain genuinely
open, for the same concrete reasons above -- no dimension-string text
exists on any of this project's own mechanical sheets (dimensions live on
the architectural set, not sampled here), and the one confirmed schedule
gridline sits on a scale-less sheet the shared refusal loop can't safely
exercise as-is. Real, disclosed follow-up work: either a scale-less-sheet-
safe path through that shared loop, or a different real sheet with both a
schedule table and a detected scale.

Measured: `npm run bench:linear` passes, refusal 5/5,
development/held-out/synthetic trace numbers unchanged (this pass touches
only the ground-truth fixture, no engine or scorer code); all 215
`benchScore.test.ts`/`test/linear/*.test.ts` tests pass; full filtered web
regression suite re-run to confirm no new failures beyond the established
baseline. `docs/LINEAR-TRACE-EVAL.md` gained a "Run 15" section and its
own priority list updated to reflect this partial closure.

2026-09-17 linear takeoff: bldg5406-hvac-demo-mechanical.pdf confirmed genuinely blocked, not just unattempted (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
Attempted the next declared held-out sheet, `bldg5406-hvac-demo-mechanical.pdf#2`.
A bare `session.traceRun()` call -- the same lightweight Session API path
every other held-out sheet this checkpoint used without incident -- did
NOT complete within 60 seconds on a single cold-index-build call, let
alone a seed sweep. This independently confirms, via a DIFFERENT code
path, an already-disclosed environment issue: this project's own history
already recorded `production-graph-cli.mjs --mode reconcile` hanging 25+
minutes against this exact PDF. Not a coincidence of one broken CLI
invocation -- something in this specific file's own vector data makes
`trace_run`'s own index build pathological, independent of which caller
drives it.

Not pushed further: no leftover process was left running (confirmed via
`pgrep` after each timed-out attempt), no escalating-timeout retry was
tried. `#14` on the same PDF was not attempted at all, for the same
reason. Both remain declared and frozen in `reports/LINEAR_HELDOUT.txt`
(updated with this finding), blocked pending a real, separate fix --
disclosed as blocked, not silently left as "not yet gotten to."
`docs/LINEAR-TRACE-EVAL.md` gained a "Run 14" section and its own priority
list corrected to say so.

No code changed this pass -- purely a diagnostic finding, so no test run
or regression suite needed beyond confirming `git status` clean of
anything but the doc/report updates.

2026-09-17 linear takeoff: fourth held-out golden -- a clean 4/4; a fifth sheet attempted and set aside (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
Authored the fourth entry off `reports/LINEAR_HELDOUT.txt`'s frozen list:
`baker-county-eoc-bidset.pdf#38` (M1.01), a 24x14 rectangular SA duct
trunk. Two sweep candidates rejected before authoring, each for a
concrete, confirmed reason: a 16.71 LF "both dead_end" candidate looked
ideal but a marked render crop showed one endpoint on a GRAY architectural
reference line running to a room-label leader, not real duct linework --
the same mistrace category caught once already this same day; a 3.44 LF
candidate with a real bound size turned out to be a small label-leader
tick mark, not an independent run. The chosen candidate held up: both
stops sit on genuine drawn CAD junctions (real tee/elbow points), the same
category as two already-confirmed clean hits, not Finding 4's own "human
judgment call on an otherwise-unbroken run" category. System code read
directly off a label at the junction (`trace_run`'s own automatic read
came back blank -- the label sits just outside its size-binding radius).

Held-out is now a genuine, clean **4/4** -- every held-out golden authored
so far, on four different real PDFs, has matched ground truth exactly on
length and shape.

Also attempted `navfac-cherry-point-atc-mechanical.pdf#18` (MP101, the
second coordinator pick) and set it aside, not authored -- recorded in
`reports/LINEAR_HELDOUT.txt`'s own history rather than silently dropped:
one seed ran away to 11,809 LF (a fully-looped hydronic distribution
network, not a fair single-call target); a second seed's own `dead_end`
calls looked premature against a real duct line that visibly continues
past both marked stops in a render crop. Two of the seven declared
held-out sheets remain, not yet attempted.

Measured: `npx tsc --noEmit` clean; `bench:linear` passes, held-out 4/4;
all 215 `benchScore.test.ts`/`test/linear/*.test.ts` tests pass unchanged;
full filtered web regression suite re-run to confirm no new failures
beyond the established baseline.

2026-09-17 linear takeoff: 05-double-line-duct now reaches -- mitered rails, plus a real geometric limit on recall (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
Implemented the fix the prior checkpoint scoped: `drawDoubleLine` rewritten
to draw each rail as a properly MITERED continuous polyline
(`offsetRailMitered` -- a real polygon-offset miter join at each interior
vertex) instead of independent per-segment offsets, closing every corner
gap regardless of turn direction. `synthesize.mts`'s own `CaseSpec` gained
an optional `seedPointFt(pts)` hook so a case can supply a real point on a
rail for `trace_run` to seed on, since the centerline itself (the golden's
own truth) has no ink; `bench/linear.mts` threads the resulting
`seed_point_ft` through the SAME `syntheticFtToPx` transform every other
point already uses, not a second hand-rolled conversion.

Result: the case now REACHES (both ends `dead_end`, no more refusal or
ambiguous stop) -- confirmed via direct point-dump, not assumed. But
length comes back real and short (43.59->37.59 LF, 13.8% error), and
recall still misses. Diagnosed rather than left as "still broken": this
is a genuine, previously-unrecognized geometric property this fix's own
investigation surfaced, not a bug. Offsetting a polyline at a 90 degree
corner and mitering it is NOT length-preserving the way offsetting a
single straight segment is -- the inside rail of a turn is shorter than
the centerline by the offset distance, the outside longer, real 90-degree
miter trig, and this path's own four turns happened to put the traced
rail on the inside at enough corners to come up systematically short (real
duct geometry -- an actual sheet-metal duct's own inner/outer edges DO
differ in length from centerline at a real elbow, which is exactly why a
takeoff professional's own LF convention is centerline in the first
place). A rail is also unavoidably offset ~1 ft from the centerline at
every point, comfortably beyond the recall scorer's own 0.5 ft overlap
tolerance -- so a rail-traced path likely CANNOT cleanly pass recall
against a centerline golden under the current scoring convention,
independent of any further seeding or mitering work. A real, disclosed
LIMIT of what this specific hard case can honestly measure, not a queued
bug. What DID land is real regardless: no more refusal, a genuinely
better generator (continuous gap-free rails are correct CAD-drafting
behavior on their own merits, useful for any future double-line case),
and a precisely understood failure mode instead of a mysterious one.

Measured: `npx tsc --noEmit` clean; `bench:linear` passes, synthetic
recall unchanged at 8/10 (this case still misses recall for the reason
above, not a regression); all 215 tests pass unchanged (no scoring-
function code touched, only the synthetic generator); full filtered web
regression suite re-run to confirm no new failures beyond baseline.

2026-09-17 linear takeoff: 08-label-leader fixed (synthetic recall 7/10 -> 8/10), 05-double-line-duct understood more precisely (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
Follow-up to the same day's OCG-layer fix. `08-label-leader`'s own newly-
exposed length mismatch (33.48->26.85 LF) root-caused: the leader line
takes off from the EXACT vertex the golden's own path turns a real 90°
corner at. First attempt -- leave the leader line untagged rather than
duct-classified -- did NOT work, and this was VERIFIED not assumed:
re-diagnosed after the "fix" showed the identical `ambiguous` stop,
unchanged. Root cause: `walk.ts`'s own `sameFamilyContinuity` only excludes
a candidate on a CONFIRMED layer mismatch (`lFrom >= 0 && lTo >= 0 && lFrom
!== lTo`) -- an UNTAGGED segment (`layerOf === -1`) reads as compatible BY
DEFAULT, not as a confirmed non-match, so the untagged leader still counted
as the same family as the duct it takes off from. Real fix: give the
leader its OWN distinct OCG ("M-ANNO") instead of no OCG at all --
`registerOcgLayer` extended to MERGE additional OCGs onto the same page
(a real `/OCProperties`/`/Resources/Properties` array append) rather than
assume one-OCG-per-page. Re-diagnosed after the real fix: the walk now
reaches the golden's full 4-point path, both ends `dead_end`, confirmed via
the same point-dump/re-trace method used throughout this project rather
than trusting the aggregate alone. Synthetic recall: 7/10 -> 8/10.

`05-double-line-duct` investigated further, NOT fixed -- and the docs'
own prior framing ("just pick a rail, the way weld-county-m1-0.json did")
is corrected to a more precise one: this case's own truth path has four
segments turning BOTH ways (a zigzag), and the generator's own
`drawDoubleLine` offsets each segment's two rails independently with no
mitering at corners -- so whichever rail is picked, some corners get a
real ink overlap and others a real ink gap, and which corners fall which
way flips with each turn's own direction. No single rail choice is
walkable end to end for this specific case. A real fix needs mitered/
continuous rail drawing in the generator or a per-segment seed/stitch
convention in the bench itself -- deferred, disclosed with the corrected
understanding rather than the easier-sounding original framing.

Measured: `npx tsc --noEmit` clean; `bench:linear` passes, synthetic
recall now 8/10; all 215 `benchScore.test.ts`/`test/linear/*.test.ts`
tests pass unchanged; full filtered web regression suite re-run to
confirm no new failures beyond the established baseline.

2026-09-17 linear takeoff: Finding 5's real fix landed -- a named OCG layer, synthetic recall 0/10 -> 7/10 (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
Finding 5's own corrected hypothesis (an earlier checkpoint) named the real
cause of the synthetic corpus's near-total refusal rate: these `pdf-lib`-
generated PDFs carried no Optional Content Groups at all, so
`mepLayerSignal` read "none" everywhere, and with zero surrounding
architectural context `wallnetwork.ts`'s wall-vouch fallback excluded
almost any long straight segment -- confounding most of what this corpus
was built to test. The likely real fix was named at the time but not
attempted ("pdf-lib's OCG support is low-level"). Attempted and landed
this pass.

`pdf-lib` has no built-in OCG helper. Built one from its own lower-level
primitives (`context.obj`/`.register`, `page.node.Resources()`,
`PDFOperator.of(BeginMarkedContentSequence, ...)`) -- prototyped standalone
FIRST against a throwaway test PDF before touching the real generator, and
caught a real bug in that prototype's own first attempt: `context.obj`
coerces a plain JS string to a PDFName, not the PDF STRING type an OCG's
`/Name` entry requires, so pdf.js silently reads back an EMPTY layer name
unless `PDFString.of(name)` is used explicitly. Confirmed the fix works
end to end on the same prototype (a tagged line reads
`stroke-family:layer-name`/`systems:["ductwork"]`; an untagged control line
reads the ordinary fallback) BEFORE spending it on `synthesize.mts`.

Wired into the real generator: each case's own system picks a layer name
carrying a token `mepsystems.ts` recognizes outright ("M-HVAC-DUCT" or
"M-PIPE-HYDRONIC"), wrapping that case's whole draw call in `BDC/EMC`.

Result: **synthetic recall 0/10 -> 7/10** in one change -- this corpus can
finally test what it was built to test. Two things this surfaced were
disclosed, not chased further this pass: `05-double-line-duct` still
refuses for a DIFFERENT, already-understood reason (the truth is authored
at the double-line symbol's own centerline, but the generator only draws
the two offset rails -- no ink sits where the seed lands, the same gap
`weld-county-m1-0.json`'s real golden already solved by picking a rail);
and `08-label-leader` shows a newly-exposed LF mismatch (33.48->26.85, not
yet root-caused, invisible before because the whole case used to just
refuse). `docs/LINEAR-TRACE-EVAL.md` gained a "Run 10" section; its
priority list marks Finding 5's own fix as done, not remaining, and adds
these two new, smaller, disclosed items in its place.

Measured: `npx tsc --noEmit` clean; `bench:linear` passes (synthetic still
reported-only, never gated, same established reason); development/held-out
tiers unchanged (this pass only touches the synthetic generator); all 215
`benchScore.test.ts`/`test/linear/*.test.ts` tests pass unchanged (no
scoring code touched); full filtered web regression suite re-run (3455
tests, exactly matching the prior checkpoint -- no test files changed this
pass) confirms no new failures.

2026-09-17 linear takeoff: size accuracy's own no-label vs wrong-label split (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
Closed a real gap against the plan's own explicit §2 metric spec: "size
accuracy (exact + length-weighted, no-label vs wrong-label separated)" --
`sizeAccuracyPct` alone only ever answered "did it match," collapsing a
WRONG guess (`trace_run` bound a real size, just not the golden's own
value -- confidently misleading) and NO guess (`trace_run` correctly
declined -- the UI's own honest "size unknown" state) into one "not a
match" bucket. Added `sizeWrongLabelPct`/`sizeNoLabelPct` to
`aggregateTrace` (`bench/score.ts`), both length-weighted over the same
population `sizeAccuracyPct` uses; the three sum to 1 whenever
`sizeAccuracyPct` is non-null. 6 new/extended tests in
`test/benchScore.test.ts`, including one built specifically to prove a
wrong-label case and a no-label case land in different buckets.

Running the split against the real corpus surfaced a real, worth-flagging
result, not just a metric upgrade for its own sake: development-tier's own
size misses are 100% wrong-label, 0% no-label -- every real case where the
traced size doesn't match the golden is a CONFIDENT wrong guess (Finding
3's round-vs-pipe grammar ambiguity, bessemer's own real over-trace into a
different actual pipe), never an honest "I don't know." The only clean
no-label result anywhere in the bench is the synthetic corpus's own
`10-arc-as-polyline` case. Disclosed as a small-sample (n=2 vs n=1)
observation worth re-checking as more real goldens exist, not chased
further on this one measurement -- `docs/LINEAR-TRACE-EVAL.md` gained a
"Run 9" section with the full writeup, and its own priority list marks this
pass as done.

Measured: `npx tsc --noEmit` clean; `bench:linear` passes (development
sizeAccuracyPct 0.455 / sizeWrongLabelPct 0.545 / sizeNoLabelPct 0; held-out
1.0/0/0; synthetic 0/0/1 -- the one no-label case, correctly isolated now);
all 215 `benchScore.test.ts`/`test/linear/*.test.ts` tests pass; full
filtered web regression suite re-run (3455 tests, +1 over the prior
checkpoint's 3454, matching the one net new test added here) confirms no
new failures (70 fail/13 cancelled/13 skipped, unchanged from baseline).

2026-09-17 linear takeoff: resolved bessemer-p101-cw-main's residual 3.17px — ordinary hand-tracing noise, not a defect (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
Closed the open question the discrete-Fréchet scorer fix left behind: after
`simplifyPolyline` corrected `bessemer-p101-cw-main`'s own frechetPx from
260.5px down to 3.17px, was that residual real or more of the same
vertex-density noise? Diagnosed directly rather than guessed: dumped the
golden's own simplified 2-point span alongside the traced polyline's own
clipped/simplified span for the exact same case. The LEFT endpoint (a real
geometric point — the 1¼" water-service riser drop) matches to full
floating-point precision, 0px apart. ALL of the 3.17px lives at the RIGHT
endpoint, and that endpoint is the SAME one this golden's own `review_basis`
already discloses as a human judgment call, not a hard geometric feature
(Finding 4 -- "the point the main turns 90° and drops into a riser," on a
much longer real trunk). A few-pixel mismatch landing exactly at a
self-disclosed soft stop, and nowhere else along the span, is the ordinary
noise level of hand-tracing near a judgment call. No code change; `docs/
LINEAR-TRACE-EVAL.md` gained a "Run 8" section closing the question, and
its own priority list dropped this item as resolved rather than remaining.

2026-09-17 linear takeoff: third held-out golden — a clean 3/3, plus a set-aside on excluded-family refusals (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
Authored the third entry off `reports/LINEAR_HELDOUT.txt`'s frozen list:
`navfac-cherry-point-atc-mechanical.pdf#6` (MH101), one of the two sheets
this checkpoint had already declared and frozen as its own structural,
zero-`trace_run`-foreknowledge picks back when the split was first written.
An 8x8 rectangular RA duct, 12.39 LF, from a real transition/flex-connector
fitting to a real elbow into a register riser, confirmed via a marked
render crop. This sheet's own duct callouts carry EXPLICIT SA/RA/EA tags,
so `trace_run` read `systems:['RA']` directly -- no annotator inference
needed, unlike the first two held-out goldens.

Held-out is now a genuine, clean **3/3**: recall 1.0, precision 1.0, 0%
length error, 100% size accuracy across every case authored so far. Still
short of the 7 the frozen list declares and still not hard-gated (n=3,
Run 4's own rationale), but a real, encouraging trend -- every held-out
sheet reached without Finding 1's wall-vouch excluding it outright has
matched ground truth exactly.

A parallel attempt this same pass to close a DIFFERENT disclosed gap --
`refusals.json`'s own missing "seed on real linework of an EXCLUDED
family" case (schedule gridlines, dimension lines, hatching) -- was tried
and set aside, not forced: no dimension-string text exists on any of the
project's own mechanical sheets (dimensions live on the architectural set,
which isn't part of this corpus), and a sweep for a real schedule-table
gridline seed on `weld-county-mechanical-permit.pdf#6`'s own DUCT SCHEDULE
never landed close enough to reach or refuse meaningfully within a
reasonable search budget. Disclosed in `docs/LINEAR-TRACE-EVAL.md`'s own
priority list as attempted, not completed, with a concrete next approach
(extract the table's own gridline coordinates directly from vector
geometry, don't sweep blindly) rather than silently dropped.

Measured: `npx tsc --noEmit` clean; `bench:linear` passes (held-out 3/3,
development-tier aggregates unchanged at 2/8 recall / 0.743 precision);
all 214 `benchScore.test.ts` + `test/linear/*.test.ts` tests pass (no
scoring-function changes this pass, only a new golden + doc updates).

2026-09-17 linear takeoff: the "genuine Fréchet miss" from the checkpoint below was a scorer bug, found and fixed same day (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
The checkpoint immediately below this one closed with "a genuine, honest miss...
the deviation is in trace_run's own walked SHAPE, not the ground truth" and
guessed the cause was double-line-duct edge-following near an elbow/damper.
That guess was written without checking the actual traced points first --
exactly the lapse this project has caught itself making before (Run 3's own
two coordinate bugs, Finding 5's disproven hypothesis) and had already
promised not to repeat. Caught immediately after, same session: dumping the
FULL-PRECISION `trace_run` points for `itd-d1-lab-mechanical.pdf#4` showed
every point sits at EXACTLY the same y -- a perfectly straight line, not a
zigzag. Reproducing `scoreTraceShapeMatch` directly against the exact golden/
traced points (both provably collinear) still returned `frechetPx: 9.2`,
proving the bug lives in the SCORER, not the engine.

Root cause: discrete Fréchet distance is a per-VERTEX metric, not a per-
CURVE one. It requires a monotone index-correspondence between two point
sequences; when the golden (2 vertices) is far sparser than the traced
polyline (5 vertices, genuinely on the same line but unevenly spaced from a
fitting symbol's own tiny kinks), the DP's own monotone-advance constraint
has to walk through every extra vertex on the denser side before advancing
the single step on the sparser one -- the worst intermediate gap along that
forced walk becomes the reported "distance," even though the underlying
GEOMETRIC line is identical. A well-known discrete-vs-continuous-Fréchet
pitfall, and one that would only get MORE common as this bench's own real
corpus grows (any hand-authored few-vertex golden vs. a `trace_run` polyline
that picks up extra near-collinear vertices along the same real line).

Fix: `score.ts` gained `simplifyPolyline` (iterative Douglas-Peucker, same
"no recursion" discipline as `discreteFrechet` itself), applied to both the
golden and the clipped/reversed traced polyline in `scoreTraceShapeMatch`
before the Fréchet call, at a fixed 0.5px tolerance -- well under the
recall gate's own 2px threshold, so a genuine elbow is never mistaken for
noise. 6 new tests in `test/benchScore.test.ts`, including one that proves
the fix does NOT mask a real mid-span detour (a genuine shape mismatch
still reads a large Fréchet distance after simplification).

Re-ran the full bench and diffed every row's own `frechetPx` before vs.
after (not just the aggregate -- the exact discipline this correction
itself is about). Held-out recall corrected from 0.5 to a genuine 1.0 (2/2)
-- both held-out goldens are now confirmed clean hits, better news than the
prior checkpoint reported. A bigger surprise turned up in the SAME diff:
`bessemer-p101-cw-main`'s (Finding 4's) own frechetPx dropped from 260.5px
to 3.17px -- meaning most of Finding 4's own "shape genuinely diverges"
framing was this same scorer artifact, not real geometric divergence, even
though the case's bottom-line conclusion (a recall miss, real over-trace
past the golden's own span) still holds at the corrected, much smaller
number. `docs/LINEAR-TRACE-EVAL.md` corrected in place (Run 3's own
paragraph annotated, not silently edited) plus a new "Run 6" section with
the full writeup; a new open question added to "honestly scoped as
remaining": is 3.17px's own residual mismatch real (a parallel similar-size
line the walk briefly diverges onto) or more of the same noise the fix
didn't fully absorb.

Measured: `npx tsc --noEmit` clean; all 61 `benchScore.test.ts` tests pass
(55 prior + 6 new); `bench:linear` passes with held-out now 2/2 and
development-tier AGGREGATES unchanged (2/8 recall, 0.743 precision -- no
case crossed a pass/fail threshold, only frechetPx numbers moved on cases
already correctly classified either way).

2026-09-17 linear takeoff: second held-out golden, a caught mistrace, and a genuine Fréchet-only miss (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
Authored the second entry off `reports/LINEAR_HELDOUT.txt`'s frozen list:
`itd-d1-lab-mechanical.pdf#4` (M1.1), an 8" round duct segment from a real
wall-penetration dead end to a real elbow/damper assembly. Same PDF as the
existing development-tier hydronic golden (`itd-d1-lab-m1-2.json`) but a
DIFFERENT page never traced during development, so this stays a genuine
held-out measurement.

A `trace_run` seed-grid-sweep's first promising hit (3.11 LF, BOTH stops
`dead_end` -- looked ideal) was caught and REJECTED before being trusted:
its own `confidence:0` / `stroke-family:unclassified` factors were a flag,
and a marked render crop confirmed the walk had actually followed a wall/
shaft outline into a text-leader stub, not real ductwork. Documented in the
golden's own `review_basis` as a caught mistrace, not silently discarded --
this project's own "verify visually before trusting" discipline (already
established by Run 3's two coordinate bugs and Finding 5's disproven
hypothesis) caught a THIRD real mistake before it shipped.

The second candidate (3.02 LF, round:8) held up: a marked crop confirms a
real double-line duct symbol, wall-penetration dead end on one side, real
elbow/damper on the other. First measurement: **LF 3.02→3.02 exact, size
OK -- but recall MISSES**. `results.json` shows why: `lenErrPct: 0` and
`lengthOverlapPct: 1` (both perfect) but `frechetPx: 9.2` against the
plan's own `<2pt` criterion -- the traced polyline covers the golden's
full span at the right total length, but isn't a clean straight line the
way the golden's own two-point run is; the double-line duct's own edge-
following near the elbow/damper transition introduces a small real zigzag.
The golden's own endpoints were independently re-verified correct (same
marked-crop method as every other golden) -- the deviation is in
`trace_run`'s own walked SHAPE, not the ground truth, so nothing was
touched to make this pass, per the held-out tier's own "never re-drawn to
improve a score" rule. Held-out recall is now 1/2 (0.5), not 2/2 -- a real,
disclosed finding, exactly what held-out measurement exists to surface: a
case that would read as a full pass under length-only scoring and only
fails under the plan's own stricter, literal Fréchet criterion.

Measured: `npx tsc --noEmit` clean; `bench:linear` reports the numbers
above and passes (held-out still reported-only, not gated, per the
existing n-too-small rationale -- now n=2, still not enough). No code
changed this pass, only ground truth + docs, so no new regression run was
needed beyond `bench:linear` itself and the pre-existing `benchScore.test.ts`
suite (unchanged, still 208/208 passing).

`docs/LINEAR-TRACE-EVAL.md` gained a "Run 5" section with the full writeup
above (the caught mistrace, the genuine Fréchet miss, and why the golden
wasn't touched), and its "honestly scoped as remaining" list updated: 5
held-out sheets remain (not 6), plus a new open question -- is Run 5's own
Fréchet miss worth a real walker fix, or a documented, accepted limitation
like Finding 1.

2026-09-17 linear takeoff: first held-out golden authored, frozen split declared, +1 development hit (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
Closed the next GATE 3 gap: no held-out sheet existed yet, so the plan's own
"held-out tier within 5 points of development" rule was unassessable. A
research pass (delegated, then independently re-verified end to end: sha256,
sheet metadata, size labels, a marked render crop, and a fresh `trace_run`
call all re-checked from scratch rather than trusted on the pass's word)
found a strong candidate on `weld-county-mechanical-permit.pdf#7` -- but
before authoring it, a re-read of the goal document's own explicit HELD-OUT
TIER section showed it pins that exact sheet ("weld-county p7") to the
DEVELOPMENT tier by name. Caught and fixed before commit, not after: retagged
`weld-county-m1-0.json` to `tier:"development"` (its content -- a 16" round
duct riser from a real reducer to a real tee, LF 21.82→21.82 exact, size OK
-- didn't need to change, just its label). This is the SECOND confirmed
development-tier recall hit (after `itd-p5-hc3-branch`), moving development
recall 1/7→2/8 (0.25) and precision 0.612→0.743.

Declared the plan's own actual held-out list before authoring anything
against it: `opentakeoff-corpus/reports/LINEAR_HELDOUT.txt`, modeled on
`keys/HELDOUT.txt`'s own "declared first, and frozen" discipline. Five of
the seven sheets are pinned verbatim by the plan; the two
`navfac-cherry-point-atc-mechanical.pdf` sheets were this checkpoint's own
one-time pick, made STRUCTURALLY (first sheet in each of the PDF's two real
plan series, by sheet number + "PLAN NORTH" text only) with zero `trace_run`
probing beforehand, so the pick itself carries no engine-behavior bias --
and explicitly excluding a sheet (`MP122`) already probed earlier in the
SAME candidate search, since probing before declaring would have quietly
reintroduced the bias the freeze file exists to prevent.

Authored the actual first held-out golden off that frozen list:
`federal-attachment4-mechanical.pdf#7` (M4.1), a 2½" HHWS pipe stub in a
mechanical room's enlarged piping plan, from a real tee off pump HWP-1's
discharge riser to a real junction with the vertical header bundle. Found
via a grid-sweep of `trace_run` seeds (the label's own text sat just off
the actual line), confirmed via a marked render crop. First held-out
measurement: **reached, LF 3.57→3.57 exact, recall 1.0, precision 1.0, size
accuracy 100%** -- a clean pass, though n=1 so not yet conclusive.

Wired both into `bench/linear.mts`: `RealGolden.tier` now splits real
goldens into `traceRows` (development, gated as before) vs a new
`heldOutTraceRows` (reported via a new `aggregateTrace` call and a
`results.json` `trace.heldOut` field, but NOT hard-gated on "within 5
points" yet -- disclosed explicitly in code comments and in the held-out
golden's own `scope` field: at n=1 this bench's binary per-case recall
criterion can only read 0% or 100%, so gating now would just gate on which
single case got authored, not on generalization). One real bug caught
along the way: the pre-existing real-goldens loop's own `readdirSync`
enumeration would have silently swept `refusals.json`-style additions in
were it not already excluded by name from the earlier refusal-corpus pass
-- confirmed still correctly excluded, no new instance of that bug.

Measured: `npx tsc --noEmit` clean; `bench:linear` reports the numbers
above and still passes (development thresholds ratcheted up in their own
comments to match the new 2/8 recall and 0.743 precision, not tightened as
hard gates yet); all 208 `benchScore.test.ts` + `test/linear/*.test.ts`
tests pass unchanged (no scoring-function behavior changed, only new golden
data and a tier split in the bench runner itself).

The other 6 declared held-out sheets remain frozen but unauthored --
disclosed as real follow-up, matching this corpus's own repeated
"a representative pass, not exhaustive" precedent. Enough held-out cases
for the "within 5 points" gate to mean something is the actual next bar,
not one clean hit.

2026-09-17 linear takeoff: refusal/negative corpus authored and wired into bench:linear (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
Closed a gap `docs/LINEAR-TRACE-EVAL.md` itself named as missing: `scoreTracePrecision`
only ever sees seeds ON a real golden run, so it can never catch a seed that should
refuse outright but instead confidently (wrongly) traces something. Authored
`opentakeoff-corpus/ground_truth/linear/refusals.json` — 4 cases across the same
three real PDFs the other linear goldens already use, each an UNAMBIGUOUSLY
non-linework seed (a title block, a room-label text run, a scale callout, blank
page margin) so there's no judgment call about whether a stroke "counts." Each
seed independently verified via direct `session.traceRun()` Node calls (confirmed
to actually throw) before being written into the corpus.

Added `RefusalRow` + `scoreRefusalCorrectness` to `bench/score.ts` and 3 new tests
to `test/benchScore.test.ts` (all-correct, one-miss-named, empty-input). Wired a
third scored pass into `bench/linear.mts`: loads the corpus, re-seeds each case
through `session.traceRun()`, reports per-case OK/WRONG, and gates at 100% in
`TRACE_THRESHOLDS.minRefusalRate` — unlike this file's other ratchet-point
thresholds (set to today's measured floor), this one IS the real target, since
every case is unambiguous by construction, not a hard one.

One real bug caught wiring it in, not assumed away: the existing real-goldens
loop enumerates every `*.json` in `ground_truth/linear/` and parses each as a
`RealGolden` — `refusals.json`'s different schema landed in the same directory
and was silently swept into that loop, producing `source_pdf: undefined` and a
hard crash. Fixed by excluding it by name in that loop's own filter.

Measured: `npx tsc --noEmit` clean; `bench:linear` reports `4/4 = 1.0` refusal
correctness (matches the 4 cases' own independent pre-verification, confirmed
via the actual bench run rather than assumed); all 55 `benchScore.test.ts` tests
pass. Full `web`/`mcp` regression suites re-run (excluding the known-hung
`compileProgressWalkthrough.test.ts`) to confirm no new failures beyond the
established, disclosed baselines.

`docs/LINEAR-TRACE-EVAL.md` gained a "Refusal correctness" section under Run 3,
a new row in "The ruler" table, and its "what this does not score" + "honestly
scoped as remaining" sections rewritten: item (1) (author refusal goldens) is
done; a NEW, narrower gap disclosed in its place — this corpus is seeds on pure
non-linework, not a seed on real linework of an EXCLUDED family (schedule
gridlines, dimension lines, hatching), which would test the "no stroke family"
refusal path specifically. That remains real, disclosed follow-up work.

2026-09-17 linear takeoff: Finding 5 hypothesis tested and disproven, reverted (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
Tried the fix the prior checkpoint's own Finding 5 named: `bench/linear/
synthesize.mts`'s random-walk generator often produces near-closed
rectangular loops (two roughly-parallel, span-overlapping legs on each
axis), so built `looksLikeWallOutline` + a retry-until-clear wrapper,
regenerated the whole 10-case synthetic corpus, and re-ran `bench:
linear`. Recall stayed exactly 0/10, and `02-pen-thick-solid`'s own new
(confirmed non-rectangular) path was EXCLUDED MORE aggressively than
before (5 of 5 segments wall-vouched vs. 4 of 5 previously) — direct
proof the shape hypothesis was wrong, not merely insufficient. Reverted
the generator change and the regenerated fixtures rather than leave
disproven complexity behind (`git checkout` back to last-committed
state, confirmed clean).

Real cause looks more fundamental: these synthetic PDFs carry no PDF
layers at all (pdf-lib draws plain content streams), so `mepLayerSignal`
reads `"none"` for every one of them, and with zero surrounding
architectural context (no walls, no rooms to contrast against),
`wallnetwork.ts`'s wall-vouch fallback appears to exclude essentially any
sufficiently long, straight, axis-aligned segment on such a bare sheet
regardless of overall path shape. The likely real fix is giving the
generator's own PDFs a real named OCG layer so layer classification
short-circuits wall-vouch entirely (the same way `ensureMepGraph`'s own
fallback only fires when the layer signal isn't strong) — not attempted
this checkpoint; `pdf-lib`'s OCG support is low-level, a real separate
task. `docs/LINEAR-TRACE-EVAL.md`'s own Finding 5 rewritten to record
what was tried, why it failed, and the corrected hypothesis, rather than
just updating the number and moving on.

Verified: `npx tsc --noEmit` clean; `git status` clean after revert (no
stray regenerated fixtures left committed or uncommitted); `bench:linear`
re-confirmed passing at its prior, unaffected state.

2026-09-17 linear takeoff: GATE 3 scoring migrated into bench/linear.mts (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
The prior checkpoint's `mcp/scripts/linear-trace-eval.mjs` (mirroring
`mep-trace-eval.mjs`'s own conventions) was a real, working scorer, but
re-reading the goal document's own §2 text closely showed it names an
explicit, different architecture: "LINEAR BENCH... Pinned real goldens
(ground_truth/linear/*.json) + synthetic truth-by-construction sheets...
run recall / precision (discrete Frechet < 2 pt, length overlap >= 80%)"
— ONE bench (`web/bench/linear.mts`, WP1.6's own file, explicitly meant
to grow every WP: "you build it in WP1, it grows every WP"), not a
separate ad-hoc script. This checkpoint does that migration.

Deleted `mcp/scripts/linear-trace-eval.mjs`. Extended `bench/score.ts`
with the plan's own literal method: `discreteFrechet` (iterative bottom-
up DP, not the textbook's recursive form, so a long over-traced polyline
can't stack-overflow it), `projectOntoPolyline`/`clipPolyline` (clips a
traced polyline to the golden's own arc-length span BEFORE Fréchet/
overlap ever compares them — over-trace beyond that span is invisible to
recall by design, so an already-separately-measured failure mode isn't
double-counted, mirroring mep-trace-eval.mjs's own reach/refusal/false-
confident split), `scoreTraceShapeMatch` (tries the traced polyline both
forwards and reversed — `trace_run`'s own walk direction relative to a
golden's is arbitrary, not a real mismatch), `scoreTraceRecall` (Fréchet
< 2pt AND overlap >= 80%, the plan's own literal criterion),
`scoreTracePrecision` (length-weighted correct/walked ratio — a trace
that wanders onto unrelated linework or over-traces dilutes it), and
`aggregateTrace`. 33 new tests in `test/benchScore.test.ts`. Wired into
`bench/linear.mts`: a new trace-scoring pass over BOTH the synthetic
corpus and the real ground truth, reported and (for the real corpus only
— see below) gated, alongside the pre-existing manual-mode parity/
totals/determinism scoring untouched.

Two real bugs caught before trusting the new scorer's first number, both
by direct inspection rather than assumption:
- **`upp` passed inverted** to `scoreTraceShapeMatch` at both call
  sites (`1/upp` instead of `upp`) — inflated a ~7ft run into "5264 feet"
  and zeroed out length-overlap (the tolerance became 1000x too small).
  Fixed by passing `session.sheet(sheetKey).upp` directly.
- **The synthetic corpus's own ft-to-pixel conversion was wrong** for
  absolute seeding (the pre-existing manual-mode loop never needed real
  absolute positions — `resolveRunSegments` only cares about relative
  distances — so this was invisible until a seed needed to land on real
  drawn ink). `bench/linear/synthesize.mts`'s own `toPdf` adds an 80pt
  margin and uses PDF's native bottom-up Y axis; the naive `x*ptPerFt`
  conversion had neither. Fixed with a `syntheticFtToPx` helper mirroring
  `toPdf` exactly (duplicated rather than imported — `synthesize.mts` has
  top-level side effects, importing it would regenerate fixtures on every
  bench run). Confirmed real via a before/after: case `10-arc-as-polyline`
  went from a nonsense seed to a real, in-bounds trace once fixed.

With seeding now genuinely correct, a NEW finding (documented as Finding
5 in docs/LINEAR-TRACE-EVAL.md): 9 of the synthetic corpus's own 10 cases
STILL refuse, and direct segment-index inspection shows why — their
randomly-generated paths (a seeded random walk in a bounded box, built
for WP1.6's manual-mode purposes before wall-vouching existed as a
concept in this engine) frequently form near-closed rectangular loops,
which `wallnetwork.ts`'s wall-vouching flags as wall-like. Same Finding 1
mechanism as the real corpus, different trigger (loop shape vs. run
length) — meaning most of the synthetic corpus's own intended test
dimensions (pen weight, label placement, crossings) are currently
confounded by Finding 1 rather than isolated. Not fixed here (fixing
`synthesize.mts`'s own generator to avoid near-closed loops is real,
scoped follow-up work); the synthetic corpus's own trace numbers are
reported but explicitly NOT gated, for exactly this reason.

Also: recall is now measured HONESTLY where it wasn't before — with real
Fréchet/overlap scoring, `bessemer-p101-cw-main` (Finding 4's branchy
trunk) now correctly reads as a recall MISS (its shape genuinely diverges
from the golden's within the golden's own span, not merely "ran long"),
while `itd-p5-hc3-branch` is a confirmed clean HIT. Real-corpus aggregate:
recall 1/7 (0.143), precision 0.612, size accuracy 0%, cold build 442ms.
`TRACE_THRESHOLDS` in `bench/linear.mts` is set to this exact measured
floor (recall>=0.1, precision>=0.5) — ratcheted from measurement per this
file's own "MEASURED, not chosen for comfort" rule, explicitly NOT GATE
3's own targets (recall>=0.85 etc., still far off and mostly blocked by
Finding 1's off-limits wall-vouch exclusion).

Deliberately NOT done, disclosed rather than silently deferred: fixing
`synthesize.mts`'s own path generator (Finding 5); authoring refusal/
negative goldens for a labeled precision corpus; authoring a held-out
tier; the arc-chord seeding issue `10-arc-as-polyline` surfaced (61%
length error on its one successful synthetic trace) — a real, separate
finding worth its own follow-up, not chased further in this checkpoint.

Verified: `npx tsc --noEmit` clean; `npm run bench:linear` passes with
the new thresholds; all 205 tests in `web/test/linear/*.test.ts` +
`test/benchScore.test.ts` pass; full `web`/`mcp` regression suites
checked against their own known pre-existing baselines (mcp's own 2
`test:bas` failures reproduce identically on a clean checkout, confirmed
directly this same session; web's `compileProgressWalkthrough.test.ts`
hangs reproducibly on an unrelated production-graph-cli subprocess in
this environment — excluded from the run, flagged as a real,
pre-existing environment issue worth its own report, not something this
checkpoint's own changes touch).

2026-09-17 linear takeoff: walk.ts dash-gap continuation (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
The GATE 3 eval's own Finding 2 (below) named this as the single highest-
leverage next fix for `run recall`, since — unlike the wall-vouch
exclusion — it isn't on the goal document's "never touch" list. Built and
scored the same day.

`walk.ts` gains `bridgeDashGap`: when a walk dead-ends with nothing else
welding there either, and the dead-ending segment is short (≤1 ft), it
searches for the nearest same-family segment endpoint within 0.5 ft whose
approach direction AND own onward direction both continue straight
through (±10°) and, if found, jumps the gap and keeps walking. New
`WalkResult.dashBridges` field, aggregated across both directions in
`walkBothDirections`; a new `bridged_dash_gap(N)` confidence factor in
`receipt.ts` (0.8, following the same min-over-named-factors doctrine
every other factor there already uses — not a compounding per-bridge
penalty). Also revises `receipt.ts`'s own header, which had said "bridged
gaps needs mepconnectivity.ts's own gap-bridging pass, which this walker
never calls" — checked that claim directly before building anything: that
function requires a fitting symbol sitting IN the gap and would not have
fired on a plain dash gap anyway, so wiring IT in was never actually the
fix. `bridgeDashGap` is a separate, walk.ts-native mechanism built for
this specific case.

**The trigger surprised the plan**: checked directly against the real
Bessemer P101 "CW" main (the case that motivated this) before assuming
the `dash` per-segment flag would be the right gate — it isn't. That
PDF's own CAD export flattened its dash-dot linetype into many separate
SOLID short strokes; every one of them reads `dash: 0`. Segment LENGTH,
not the `dash` flag, is what actually distinguishes a print-artifact
fragment from a real run in this corpus (the flag still ORs in as a
second, real-PDF-dash-array path — just not the one that fires on the
one real case in hand). 9 new tests (7 in `walk.test.ts`, 2 in
`receipt.test.ts`) cover both trigger paths plus every guard: gap too
wide, wrong family, off-axis, a real elbow correctly unaffected, and both
directions' bridge counts summing correctly.

**Re-ran `linear-trace-eval.mjs` against the real corpus and got a
genuine surprise, not a clean win**: `bessemer-p101-cw-main`'s own seed
now walks roughly 35 LF each way (was 1.63 LF total) before hitting a
real `ambiguous` stop, passing FIVE real `tee` branches the golden's own
18.96 LF extent never counted. This is the SAME lesson WP3.8's ITD golden
already taught this session, in a new shape: the golden's own stop point
("the main turns 90° and drops into a riser") is a real, meaningful human
judgment call, not a hard geometric feature the walker could rediscover
without choosing a branch at an `ambiguous` fork — plan §6.3's own
"offer the candidate fan" design intent, now visible for the first time
because the dash-gap fix let the walk get far enough to REACH a real
fork instead of dying on its own first print-artifact fragment. Documented
as Finding 4 in `docs/LINEAR-TRACE-EVAL.md`, with a matching note added to
the golden's own `review_basis` (its geometry/LF numbers are untouched —
they remain a real, correct hand-traced span, still valid for
`bench/linear.mts`'s manual-mode purposes; only the automated single-call
comparison against it is now understood to not be apples-to-apples).

Run recall itself did NOT move (still 2/7 — the wall-vouch exclusion,
Finding 1, accounts for the other 5 misses and is untouched by this fix).
GATE 3 is still not close. But `bessemer-p101-cw-main` went from "dies
immediately, so its real branching structure is invisible" to "reaches
its own real ambiguous forks" — a materially more capable, more honest
walker, even though this specific golden's own length-comparison number
got harder to read, not easier. Recorded as-is rather than picking an
easier-to-flatter golden to report instead.

Deliberately NOT done: extending the eval script to simulate "continue
past an ambiguous stop by following the golden's own next vertex" (a
real, larger design task that would make single-call scoring into a
guided multi-hop one); authoring new, deliberately unbranched/single-
call-friendly goldens so recall/length-error have more than one clean
data point (`itd-p5-hc3-branch` remains the only one without its own
disclosed caveat).

Verified: `npx tsc --noEmit` clean in `web/` and `mcp/`; all 153 tests in
`web/test/linear/*.test.ts` pass (144 pre-existing + 9 new); all 5 tests
in `mcp/test/traceRun.test.ts` pass unchanged, including its own exact
`confidence_factors` array assertion (confirms this fixture's own walk
never triggers a bridge, so nothing about its existing behavior moved);
`mcp/`'s main test suite (107 tests) passes at its own pre-existing
105/107 baseline (the 2 `test:bas` failures reproduce identically on a
clean stash of every file this checkpoint touched — confirmed directly,
not assumed, before writing this off as pre-existing).

2026-09-17 linear takeoff GATE 3 checkpoint, the missing scorer (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
WP3.1-3.8 built the trace engine and its ground truth; nothing had ever
actually SCORED `trace_run` against that ground truth. `web/bench/linear.mts`
(WP1.6) explicitly says in its own header it is "deliberately NOT the full
run-recall/precision/Fréchet/vertex-F1 suite... that's WP3+'s trace-engine
scoring" — this checkpoint builds that missing scorer and runs it for the
first time. New `mcp/scripts/linear-trace-eval.mjs` (mirrors
`mep-trace-eval.mjs`'s own conventions exactly: real corpus, real goldens,
"do not improve the scorer to make a run look better") + `docs/
LINEAR-TRACE-EVAL.md` (mirrors `docs/MEP-CONNECTIVITY-EVAL.md`'s format).
Scores five things against the four WP3.8 goldens: run recall, length
error, over-trace, size accuracy (length-weighted), and build/warm-query
ms — explicitly NOT precision (no refusal/negative goldens exist yet) or
held-out-tier delta (no held-out sheet exists yet), both named as open
gaps in the doc rather than assumed away.

First real run: **2/7 golden runs reach at all (28.6% recall)**, far under
GATE 3's ≥85% target. Every miss was root-caused by direct segment-index
inspection (`ensureLinearIndex`'s own `candidate`/`family` arrays), not
assumed — and every single one traces to a limitation this project had
ALREADY documented before this scorer existed, not a new bug:

- **Wall-vouch false-positive exclusion (5 of 7 misses)** — Bessemer
  M101's both supply trunks, P101's SAN riser, and federal M3.1's
  CHWS/CHWR risers all sit on segments `wallnetwork.ts`'s geometric
  wall-vouching excludes before stroke classification ever runs (every
  one is a 40-730px arrow-straight run, exactly the shape that heuristic
  false-positives on per WP3.4's own prior finding). `wallnetwork.ts`/
  `mepconnectivity.ts` internals are on the goal doc's own "never touch"
  list — this stays a documented, accepted limitation to route around
  (as WP3.7's live verification already did), not a target to fix.
- **No same-family dash-gap continuation in `walk.ts` (1 of 7)** —
  Bessemer P101's CW main golden seed lands on a real, correctly
  classified candidate segment (unlike the wall-vouch cases), but this
  CW main is drawn as many short dash-dot strokes; `walkOneDirection`
  dead-ends after 3 dashes (58.56px) because the next one sits ~21px
  away, past whatever collinear-continuation tolerance `walk.ts`
  currently applies. Checked directly and ruled out reusing
  `mepconnectivity.ts`'s own `bridgeDanglingGaps` for this: that function
  requires a fitting symbol sitting IN the gap ("never bridged on
  proximity alone") and would not fire on a plain print-style dash gap
  even if wired in. This is the one finding actually open to a fix (not
  on the never-touch list) and the single highest-leverage next step for
  recall — not designed or built in this checkpoint.
- **Pipe vs. round-duct ⌀ ambiguity (surfaced, not a recall failure)** —
  the one branch run that DID reach (ITD p5) read its own size as
  `round:1.25` instead of the golden's `pipe:1.25`; both share the same
  `ø` glyph and `sizes.ts`'s grammar doesn't disambiguate by sheet
  content yet. Disclosed, not patched quietly mid-eval.

Also caught and fixed a real ground-truth-authoring bug this same run
exposed: ITD p5's own golden originally traced only a 2.2 LF interior
sub-span of a longer real segment (chosen for label-crop convenience,
not because it was a real drawn stop point) — scoring `trace_run`'s
honest full walk of the same line against that arbitrary sub-span
produced a meaningless 257% "over-trace" reading. Re-traced live (same
Playwright/canvas methodology, cross-checked against independently
already-known `extractVectorGeometry` forensics from WP3.8's own
authoring pass) to the run's real dead-end-to-elbow extent; over-trace
dropped to a sane 7.8%, and the eval script's own build/warm-query
timing (306ms/397ms cold, per distinct sheet) is now a real, if small,
first measurement. `docs/LINEAR-TRACE-EVAL.md`'s own "lesson" section
writes this up as a standing rule for future linear goldens: endpoints
must be real geometric features the walker could plausibly also find,
not narrative/crop-framing choices, or over-trace numbers against them
mean nothing.

Deliberately NOT done, disclosed rather than silently deferred: fixing
either of the two open findings (dash-gap continuation is real, scoped,
substantial engine work — not something to rush under a "keep the eval
green" pressure this project's own doctrine explicitly rejects);
authoring refusal/negative goldens for precision; authoring a held-out
tier. GATE 3 itself is NOT met and not close on recall — this checkpoint
is the measurement, not the fix.

Verified: `npx tsc --noEmit` clean in both `mcp/` and `web/`; the eval
script's own output is the verification for itself (a scoring tool that
found real, previously-undiscovered-by-this-script findings on its
first real run is proof it isn't a tautology); `web`'s full regression
suite unaffected (no engine code changed, only the two ground-truth
JSON fixes and new scoring/doc files).

2026-09-17 linear takeoff WP3.8 checkpoint, ground truth v2 (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
"3.8 Ground truth v2: P101 (Bessemer), federal p6 (hydronic), ITD p5
(piping) hand-traced from renders BEFORE the engine runs on them" (goal
doc, verbatim). All three targets done; GATE 3 itself is not scored yet
(no scoring script exists against these goldens as of this checkpoint).

Same methodology as WP1.7's original P101/M101 goldens, extended with a
more rigorous identification step where the sheet itself was ambiguous:
load the real PDF into the running canvas app via a Playwright-driven
browser session, confirm the plan's own detected scale, zoom/pan to a
legible view, hand-trace with the Linear tool in MANUAL mode (never the
new Trace tool built in WP3.7 — tracing with the engine under test would
contaminate its own golden), commit, then read the exact committed
`verts_norm`/`computed` back out of the app's IndexedDB store directly
(the app exposes no shapes-export debug hook, so `indexedDB.open
("opentakeoff")` → `meta` store → `"annotations"` key → `.shapes` is the
only path to the exact numbers, not `window.__opentakeoff`).

- **ITD p5** (`ground_truth/linear/itd-d1-lab-m1-2.json`, new) — sheet
  M1.2 "HYDRONIC FLOOR PLAN". ONE representative run: a 2.2 LF 1¼\" branch
  stub tapping the building's HWS/HWR riser, feeding the isolation-valve/
  pump cluster ahead of coil HC-3/CV-3. Confirmed the size label's leader
  lands on the traced line to SUB-PIXEL precision by reading raw vector
  geometry directly (`extractVectorGeometry` via `oneclick.ts`, not just
  proximity) — the leader's own drawn stroke terminates at page-space
  y=1302.7, and the traced line sits at y=1302.7 too, zero error. That
  same forensic pass surfaced a real, honestly-disclosed limitation: this
  sheet draws its HWS and HWR risers as a SINGLE overlapping line with two
  stacked size labels rather than two visually separate lines, and the
  branch itself splits into two closely-spaced (~0.5 ft apart) parallel
  1¼\" lines. Which of the two the traced line is (supply or return)
  could not be confirmed from the drawn geometry alone without reading a
  connection schedule this plan sheet doesn't show, so the run's system
  is recorded as the generic fluid code "HHW" rather than guessing — the
  same withhold-over-guess doctrine `sizes.ts`/`receipt.ts` apply to the
  engine itself, applied here to the annotator's own hand.
- **Federal p6** (`ground_truth/linear/federal-m3-1.json`, new) — sheet
  M3.1 "GROUND FLOOR HVAC PIPING PLAN". TWO runs: the 4\" CHWS and 4\"
  CHWR risers feeding chiller CH-1, ~40 LF each, chosen specifically
  because — unlike ITD p5 — this sheet prints separate, unambiguous
  'CHWR'/'CHWS' callouts directly beside each line (distinct from the
  combined '4" CHWS/R PIPING DOWN...' arrow-leader note above them), so
  supply/return identity here is a confirmed fact, not a withheld guess.
  Each traced click was cross-checked live against the canvas app's own
  real-world coordinate readout (x=222'0" for CHWS, x≈221'0" for CHWR)
  before committing.
- **P101 v2** (`ground_truth/linear/bessemer-p101.json`, extended in
  place, not a new file) — added the exact run category the original
  WP1.7 golden's own scope text deferred: "every vertical UP/DN branch
  off the CW main itself -- left for a later, broader ground-truth pass."
  One new run, `bessemer-p101-san-riser`: the 3" SAN vertical stack
  (6.79 LF) between two fixture-connection clusters near FD-1/WB-1,
  identified by its own dedicated '3" SAN UP' leader (distinct from the
  '2" SAN UP'/'2" SAN DN' labels at each cluster, which describe the
  fittings, not the run between them). `totals_by_size_all_runs`/
  `total_lf_all_runs` recomputed; `scope`/`review_basis` text updated to
  describe both the original CW-main pass and this addition rather than
  silently growing stale.

Deliberately NOT done, and disclosed rather than silently skipped:
exhaustive ground truth for any of these three sheets (each golden
remains ONE OR TWO representative runs, matching the "representative,
not exhaustive" precedent WP1.7 itself set — GATE 3's recall/precision
targets need breadth eventually, but that is a distinct, much larger
follow-on effort, not something to fake by padding these goldens with
runs that weren't actually independently verified); scoring GATE 3's
numbers against these goldens (no scoring script exists yet); and P101's
own still-deferred SAN/V/HW runs beyond the one SAN riser added here.

Verified: all three JSON files parse and match the
`opentakeoff.linear_takeoff_ground_truth.v1` schema's existing shape
(spot-checked field-by-field against the pre-existing bessemer-m101.json/
bessemer-p101.json files, not just "looks like JSON"); every
`source_pdf_sha256`/render `hash` value is a real, freshly computed
sha256 of the actual file it names (`sha256sum` / `mcp/scripts/
graph-render.mjs --all`), not copied from a neighboring entry. The
web dev server used for tracing and every temporary Playwright script
(`_gt_*.mjs`) were stopped/deleted after this checkpoint — none of that
scaffolding is committed.

2026-09-17 linear takeoff WP3.7 checkpoint, canvas half (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
Trace mode in `TakeoffCanvas.jsx`: "hover highlight of the candidate run + chip
(size · system · LF · fittings ahead); click stages a dashed proposal; Q
accepts the read size; Accept pill inks; refusal drops to manual keeping the
seed" (goal doc, verbatim). Completes WP3.7 — the MCP half (classify_strokes/
trace_run) shipped in the prior checkpoint.

Researched the existing 14,000-line file's own conventions with an Explore
agent before writing anything: the tool-mode dispatch table, One-Click's own
hover→stage→accept precedent (`buildOneClickRegion`/`proposeRegion`), the
`netWorker`/`netCall` off-main-thread pattern, the keyboard-shortcut
registry, and the generic Accept-pill mechanism — so Trace mode reuses
these exactly rather than inventing a parallel UI pattern. Confirmed live
in a real browser (Playwright against the running dev server, real Bessemer
M101 sample data) rather than assumed from reading code alone.

**New "T" tool** (`web/src/brand/icons.jsx`'s own `trace` glyph — a dashed
run with a seed ring, distinct from `linear`'s solid line + filled vertex
dots; `web/src/lib/canvasConstants.js`'s `MEASURE_TOOLS`). Same pure engine
`mcp/src/session.ts`'s tools already wrap (strokes/index/graph/walk/sizes/
receipt) — "canvas and MCP cannot disagree."

- `ensureTraceIndex(tp)` — builds/caches `strokes.ts`'s `classifyStrokes` +
  `index.ts`'s `buildSegmentIndex` per (sheet, scale) in a NEW `traceWorker`
  (mirroring `netWorker`/`netCall` exactly — plan §6.10 groups this exact
  pairing off-main-thread), with the SAME "Reading this sheet's strokes… N
  s" ticking status message pattern One-Click's own net-engine build uses.
- `runTraceAt(tp, local, bundle)` — the shared trace-and-associate core
  (`buildOneClickRegion`'s own "one function, hover and click both call it"
  precedent): `nearestSegment` → `walkBothDirections` → `associateLabel`
  (every text span on the sheet, cheap for the ~99% that aren't sizes —
  `parseSize` refuses before any geometry work) with
  `leaderTerminalPointsForLabel` wired in → `resolveSizeConflicts` →
  `buildTraceReceipt`.
- `traceHoverAt`/`traceAt` — live preview (mousemove, unstaged, green
  dashed) and the staged click (blue dashed, Q-accepts) respectively; both
  render the goal doc's own chip format via `traceChipText`.
- `acceptTraceProposal` (Q key) — commits through the SAME `dispatchShape`
  gate every other tool uses, `origin.method:"traced"`, `reviewed:false`,
  the full `buildTraceReceipt` output riding under `origin.trace` — no new
  Accept-pill code needed AT ALL: `pendingCommitted`/`acceptPendingShapes`
  already pick up any `origin.reviewed === false` shape generically.
- A hard refusal (goal doc: "refusal drops to manual keeping the seed")
  calls `setTool("linear")` and seeds `poly` with the exact clicked point
  (never `clearPoly()`'d) — the estimator continues the SAME run by hand
  from the SAME point, one Linear-tool click away from finishing it.

One deliberate, documented simplification: the canvas has no per-sheet
cache of `dash`/`strokeRgb` yet (the existing `vectorSegsRef`/`segMetaRef`/
`segLumRef`/`subpathsRef` extraction call sites never read those two
fields out). Rather than touch those heavily-shared call sites for a
marginal family-grouping improvement, `ensureTraceIndex` passes them as
null — real corpus sheets separate duct/pipe pens cleanly by weight alone
(plan §3.1's own findings), so this rarely matters in practice.

**Live-verified end to end** (Playwright against the real dev server and
the real Bessemer M101 sample, not assumed from code review): armed the
tool (T), confirmed the status-bar hint text, hovered a real drawn duct
stub and saw the green dashed highlight + chip ("size withheld · 3.17 LF
· 1 fitting ahead"), clicked to stage the blue dashed proposal, pressed Q
and confirmed a real shape committed (condition total updated to 3.2 LF,
"1 shapes on sheet"), clicked the pre-existing generic Accept pill and
confirmed "pencil is now ink" — zero new code exercised there, exactly as
designed. Separately verified: Escape on a staged proposal discards it
(0 shapes after), and clicking the SAME sheet's own wall-vouch-excluded
Unit-103-trunk segment (the real, already-documented WP3.4 limitation —
confirmed BY THIS test to be the exact segment nearest that real duct
line) produces the exact plan §6.8 refusal text and drops cleanly into
the Linear tool with the seed point kept. Zero console errors/exceptions
across every scenario.

Verified: `npx tsc --noEmit` clean; `npx eslint` on the three touched
files: 0 errors (3 pre-existing, unrelated warnings, none near the new
code); web's full regression suite confirmed against the standing
70-fail/13-cancelled/13-skipped baseline (no new automated tests — this
is a React/DOM UI feature with no existing TakeoffCanvas.jsx unit-test
precedent; verification is the live-browser session above, per this
project's own convention for UI work).

2026-09-17 linear takeoff WP3.7 checkpoint, MCP half (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
`classify_strokes` + `trace_run`, the two new MCP tools plan §3.2's file
tree names for this checkpoint. The Canvas Trace mode UI (the other half
of WP3.7) is NOT built yet — a separate, React/DOM-heavy piece of work;
this checkpoint is MCP-only, and is the FIRST time any of WP3.1-3.6's
pure-lib modules (strokes/index/graph/walk/sizes/receipt) are wired into
a real, callable surface at all.

Researched the codebase's own exact conventions before writing anything
(an Explore agent traced `count_marks`'s find/commit branching,
`staging.ts`'s TOOL_STAGES partition requirement, `server.ts`'s
instructions-array convention, and the withheld[]/candidates[] row-shape
idiom used across `sweep_inline_motif`/`sweep_schedule_row`/
`trace_connectivity`) so the new tools land consistent with what's
already shipped rather than inventing a parallel shape.

`mcp/src/session.ts`:

- `ensureLinearIndex(s)` — builds and caches `strokes.ts`'s
  `classifyStrokes` + `index.ts`'s `buildSegmentIndex` once per sheet,
  mirroring `ensureMepGraph`'s own cache-by-identity pattern exactly
  (including its `undefined`/`null` convention). Reuses `rolesFor`'s own
  layer-role codes and `mepLayerSignal` — the SAME "which ink is real MEP
  linework" answer `trace_connectivity` already relies on, never a second
  heuristic for this path.
- `classifyStrokes(name)` (session method; the imported pure function is
  aliased `classifyStrokesPure` to avoid the name collision, matching the
  existing `traceMepConnectivity` alias precedent) — read-only inspection,
  the `classify_strokes` tool's own implementation.
- `traceRun(name, from, opts)` — the real integration point: seeds a walk
  via `nearestSegment`/`hitTolerancePx(1, 0)` (11px, the same zoom-1 aim
  radius the canvas's own click/endpoint/segment snap all share — the
  seed's own segment isn't known yet, so there's no per-segment pen width
  to widen it with), walks both directions (`walkBothDirections`),
  resolves EVERY text span on the sheet against the run via
  `associateLabel` (cheap for the ~99% that aren't sizes — `parseSize`
  refuses before any geometry work runs) with `leaderTerminalPointsForLabel`
  wired in for the leader-placement tier, resolves conflicts, and calls
  `buildTraceReceipt`. `commit: true` mints a shape through the SAME
  `this.commit`/`run`/`computed.run` construction `measureLine` already
  uses, stamped `origin.method: "traced"` with the full receipt under
  `origin.trace` instead of a manual polyline's `"manual"`.
- `ShapeOrigin` (session.ts's own closed provenance interface) gained
  `"traced"` in its `method` union and a `trace?: TraceReceipt` field —
  a real, necessary type extension caught by `tsc`, not a guess: the
  interface didn't have room for either before this checkpoint.

Two hard, pre-walk refusals (`REFUSAL_NO_LINEWORK`/
`REFUSAL_NO_STROKE_FAMILY`, receipt.ts's own WP3.6 constants, thrown as
`UserError`) — everything past that point, `ambiguous` included, is a
real disclosed result, never a refusal, per plan §6.3's own offer-don't-
block doctrine. `mcp/src/outputs.ts` (`classifyStrokesOutput`/
`traceRunOutput`), `mcp/src/tools.ts` (registrations, descriptions
matching `trace_connectivity`'s own density/style), `mcp/src/staging.ts`
(`classify_strokes` → setup, `trace_run` → measure — TOOL_STAGES is a
CI-enforced partition; skipping this fails the build), `mcp/server.ts`
(added `trace_run` to the "WITHHELD IS NOT A FAILURE" instructions line —
`classify_strokes` has no withheld concept, so it's correctly absent),
`mcp/README.md` (one `## Tools` row each), and root `README.md`/
`docs/USER_GUIDE.md`'s `<!--tool-count-->` markers (58→60, via
`npm run check:tool-count -- --write` — the repo's own enforced
consistency check, which failed before the fix and passes clean after).

**Two more real bugs, both caught wiring real text spans through
`sizes.ts`, committed separately before this checkpoint (see the prior
PROGRESS.md entry):** `labelHeightPx`'s fallback used the bbox's LONGER
dimension instead of the shorter one, and `buildTraceReceipt`'s
`labelText` callback was keyed by segment instead of by the binding
itself, unable to distinguish two conflicting labels on one segment.

**A third, found validating `trace_run` against real Bessemer M101 data,
not fixed (an inherited, already-accepted limitation, not a new one):**
the ground truth's own `unit103-supply-trunk` run
(`opentakeoff-corpus/ground_truth/linear/bessemer-m101.json`) hand-traces
a CENTERLINE of a double-line-drawn duct; its nearest real drawn edge is
EXACTLY the segment WP3.4's own checkpoint already found wall-vouch-
excluded. Confirmed by direct segment inspection against the real PDF,
not assumed — `mcp/test/traceRun.test.ts` uses a different, non-excluded
real pen-4 segment on the same sheet instead, and documents why in its
own header rather than silently swapping the seed with no explanation.

Tests: `mcp/test/traceRun.test.ts`, 5 new, all against the real MCP wire
(`InMemoryTransport`, `linearParity.test.ts`'s own established harness)
and the real `samples/bessemer-mechanical-bidset.pdf#6` — `classify_strokes`
finds the real pen-4 family; `trace_run` walks a real duct stub to a real
ambiguous junction with a fully-asserted factor list (not just
"non-empty" — the exact five factors, since this run is genuinely
reproducible from the real PDF); `commit: true` mints a real shape whose
`origin.trace` round-trips through `export_takeoff` intact; both hard
refusals fire with their exact named reasons.

Verified: `npx tsc --noEmit` clean on both `web` and `mcp`;
`mcp/test/traceRun.test.ts` 5/5; `mcp/test/staging.test.ts` +
`mcp/test/tools.test.ts` 108/108 (the CI-enforced TOOL_STAGES partition
test passes with both new tools correctly staged); `mcp/test/
linearParity.test.ts` 12/12 (no regression in the existing linear-takeoff
MCP tools sharing `session.ts`/`ShapeOrigin`); `npm run check:tool-count`
clean (0 stale markers, TOOL_NAMES.length = 60).

2026-09-17 linear takeoff WP3.5/WP3.6 follow-up — two real bugs caught while
designing the WP3.7 MCP wiring (`trace_run`), before any MCP code existed to
exercise them: reasoning through how `sizes.ts`'s `associateLabel` and
`receipt.ts`'s `buildTraceReceipt` would actually be called against real
`mcp/src/pdf.ts` `TextSpan`s surfaced both, the same "trace the real caller
through before believing the library is done" discipline WP3.1/WP3.4 both
used already.

1. `sizes.ts`'s `labelHeightPx` fallback (no `textHeightPx` supplied) used
   `Math.max(|y1-y0|, |x1-x0|)` — the LONGER of the bbox's two dimensions.
   For ordinary horizontal text (`TextSpan`'s own bbox: wide, short) that's
   the string's own character-count-driven WIDTH, not its lettering height,
   inflating `associationWindowPx` by however long the label's text happens
   to be. Fixed to `Math.max(Math.min(|y1-y0|, |x1-x0|), 1)` — the SHORTER
   dimension is font height regardless of rotation (unrotated: short in y;
   rotated 90/270: short in x), with no need to read `rot` at all. New test:
   `web/test/linear/sizes.test.ts`, a wide-and-short vs. narrow-and-tall
   fixture both correctly reading a height of 10, not 100.
2. `receipt.ts`'s `buildTraceReceipt` took `opts.labelText?: (seg: number) => {...}`
   — keyed by segment. But a `SizeConflict`'s whole POINT is two labels
   landing on the SAME segment; a seg-keyed lookup can only ever return one
   bbox, silently giving both withheld label rows in the receipt the same
   coordinates. Fixed by keying on the `BoundSize` binding itself
   (`labelText?: (b: BoundSize) => {...}`) — `buildTraceReceipt` already
   has the actual binding object at both call sites, so this costs nothing
   and correctly separates two conflicting labels' own real positions. New
   test: `web/test/linear/receipt.test.ts`, two same-segment conflicting
   bindings each resolving to their own distinct bbox.

Verified: `npx tsc --noEmit` clean on both `web` and `mcp`;
`web/test/linear/*.test.ts` 141/141 (139 prior + 2 new); web's full suite
confirmed against the standing 70-fail/13-cancelled/13-skipped baseline.

2026-09-17 linear takeoff WP3.6 checkpoint (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
`receipt.ts`, Stage 6: confidence, refusal, and the trace receipt (plan
§6.8). The first module in the WP3 arc to touch EVERY prior module's own
output at once (walk.ts's walked segments, strokes.ts's family grade,
sizes.ts's bindings/conflicts) — closing a gap WP3.5's own checkpoint
deliberately left open rather than guessed at.

`web/src/lib/linear/receipt.ts`:

- `buildTraceReceipt(index, seed, walk, family, boundSizes, conflicts, opts)`
  — builds the `origin` a committed trace stamps: `method:"traced"`,
  `reviewed:false`, `confidence`/`confidence_factors`, and the receipt
  itself under `trace` (`seed`, `segs`, `labels`, `drawn_width_px`,
  `stops`, `candidates`, `factors` — the exact field list the goal doc
  names). Matches the ALREADY-SHIPPED `origin` convention
  (`TakeoffCanvas.jsx`'s own `one_click_v1`/`net_v1` records: method,
  reviewed, confidence, confidence_factors) rather than inventing a
  parallel shape.
- Confidence is `Math.min(...)` over whichever of plan §6.8's seven named
  factors have a REAL numeric grade behind them this checkpoint can
  compute: stroke-family evidence grade (`StrokeFamily.confidence`),
  size-binding grade (`BoundSize.confidence`, when unconflicted),
  an `ambiguous_stop` penalty (0.5) when either walk direction stopped
  ambiguous, `layer-unclassified` (0.6, `mepconnectivity.ts`'s own
  `traceConnectivity` penalty value, reused verbatim — same underlying
  signal) when the family's own evidence isn't `layer-name`, and
  `scale_unconfirmed` (0.7) when the caller reports a guessed rather than
  detected px-per-foot. Two of the plan's seven — width cross-check
  (needs a double-line pair's own drawn spacing, WP4) and bridged gaps
  (needs `mepconnectivity.ts`'s own gap-bridging pass, which this walker
  never calls) — are NOT computed; left out of both `factors` and the
  confidence minimum, never assigned a guessed number. `size_missing`
  and `size_withheld` are similarly NAME-only: a run with no reachable
  label, or with a real label-vs-label conflict, is disclosed as such
  but never drags confidence down on its own — "withholding is an
  answer; a withheld size still measures LF" (plan §6.8, applied
  literally: LF depends on the walk, not the label).
- `REFUSAL_NO_LINEWORK`/`REFUSAL_NO_STROKE_FAMILY` — plan §6.8's own two
  pre-walk refusal texts, verbatim constants (this pure module doesn't
  own the click-hit-test or the empty-`StrokeClasses.families` check
  that would fire them — that's WP3.7's canvas glue — but the exact
  required wording lives here, the "confidence, refusal, receipts"
  stage, rather than being duplicated at each call site).
  `sizeWithheldRefusal(labelSize, drawnWidthIn)` — the plan's own
  template for the label-vs-drawn-width case (WP4 scope, not a real
  caller yet). `sizeConflictRefusal(conflict)` — the SAME "Size
  withheld... Pick one." framing, adapted for the label-vs-label
  conflict `resolveSizeConflicts` (WP3.5) can actually detect today.

**Closes WP3.5's own documented gap, not a new one:** that checkpoint's
header explained why "size carried along the run" couldn't be built yet
— it needed to know, per hop of a walked run, whether a branch/transition
sits at its far end, but `walk.ts`'s `WalkResult` had no hop-indexed
segment list at all, only a sparse `vertices[]` (elbow/tee/crossing hops
only). This checkpoint closes the PREREQUISITE half of that gap: `walk.ts`
now returns `segs: number[]` (one original segment index per hop, in
travel order, `walkBothDirections` combining both directions' own lists
without double-counting the shared seed segment) — a minimal, additive
change (13 assertion sites across 3 existing tests extended to check it;
no existing assertion touched a whole-`WalkResult` deep-equal, so nothing
broke) that the goal doc's own WP3.6 receipt-shape spec names `segs` as
requiring anyway. The FULL "carry along the run, stopping at a real
branch/transition" combinator is still not built — `vertices[]` remains
sparse, so mapping a vertex to the hop boundary it sits at is still
undesigned — but the receipt itself no longer needs it: `buildTraceReceipt`
already filters bound sizes/conflicts down to whichever land on `walk.segs`
using this new field directly.

Tests: `web/test/linear/receipt.test.ts`, 10 new, one isolated fixture per
named factor (clean walk / size_missing / size_withheld-on-this-run /
conflict-on-an-unwalked-segment-never-contaminates / ambiguous_stop /
layer-unclassified / scale_unconfirmed / drawn_width_px) plus both refusal
text checks. `web/test/linear/walk.test.ts` gained 3 new assertions (not
new tests) confirming `segs` on the straight-chain, tee, and
`walkBothDirections` fixtures already used there.

Verified: `npx tsc --noEmit` clean on both `web` and `mcp`;
`web/test/linear/receipt.test.ts` 10/10; `web/test/linear/*.test.ts`
139/139 (129 prior + 10 new); web's full suite (`test/*.test.ts
test/linear/*.test.ts` minus the known `compileProgressWalkthrough.test.ts`
flake) confirmed against the standing 70-fail/13-cancelled/13-skipped
baseline.

2026-09-17 linear takeoff WP3.5 checkpoint (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
`sizes.ts`, Stage 4's size grammar and label association (plan §6.6, App. A).
Two halves, both new: the Appendix A grammar itself, and the orientation/
placement scoring that decides which run segment a parsed label binds to.

`web/src/lib/linear/sizes.ts`:

- `normalizeLabelText`/`parseSize` — Appendix A's pre-normalisation
  (`× → x`, `Ø ⌀ %%c → ø`, `″ ” → "`, Unicode fractions → `N/D` text,
  uppercase) then three structural patterns (RECT/ROUND/PIPE, plus PIPE's
  own `DN\d{2,4}`/`NPS\d{2,4}`/`\d{2,4}mm` alternates) and an `ELEV`
  negative-grammar rejection (`BOD`/`AFF`/`MIN`/`MAX`/`O.C.`/`TYP`/
  dimension strings). One deliberate, documented extension beyond
  Appendix A's own literal regex text: plan §3.1 cites `14x3½` as a real
  label the grammar must parse, but RECT's own dimension groups have no
  fraction syntax at all — `resolveFractions` (a preprocessing pass, not a
  change to RECT/ROUND/PIPE's own patterns) resolves every embedded
  whole+fraction span to a decimal BEFORE the structural patterns run, so
  `14x3½` reaches RECT as `14x3.5`.
- `associateLabel(index, label, ppf, opts)` — plan §6.6's orientation
  (label `rot` parallel to the segment, ±10°) and placement (beside beats
  leader) scoring; confidence is `min(orientation, placement)` per the
  plan's own formula. "Inside" a double-line duct pair (the plan's
  strongest placement tier) and width agreement are NOT implemented —
  both need a paired-stroke centerline WP4's double-line duct pairing
  hasn't built yet; this file's header documents the gap rather than
  guessing at it.
- `resolveSizeConflicts(bindings)` — the other half of plan §6.6's
  "uniqueness": two labels landing on the same segment with different
  parsed sizes are withheld with both, not silently resolved to either.
- One real regex bug, caught by this file's own test suite rather than
  assumed correct from a clean `tsc`: `PIPE_RE`'s trailing system group was
  written as `` `(${SYS_ALT}(?:/[A-Z]{1,5})?)` `` — since `|` has the
  lowest precedence of any regex operator, the `(?:/[A-Z]{1,5})?` suffix
  bound only to `SYS_ALT`'s LAST alternative (`W`), not to the whole
  alternation, so a multi-service label with any other trailing system
  (`2" CWS/R`, `¾" HW/CW UP`) failed to parse at all. Fixed by wrapping
  the alternation in its own non-capturing group,
  `` `((?:${SYS_ALT})(?:/[A-Z]{1,5})?)` ``, before appending the suffix.
- The `DuctDirection`/`dirOf` gap identified while drafting this
  checkpoint's own tests (before any were run) — `UP/DN` was being
  collapsed into plain `"down"`, losing the fact a riser marker like
  `1½" V UP/DN` goes both ways — is fixed: `DuctDirection` gained `"both"`
  (matching `types.ts`'s own `vertex_overrides.dir?: "up"|"down"|"both"`
  vocabulary), and `dirOf` maps the literal `UP/DN` token to it,
  distinct from the generic `DN`/`DOWN` tokens which still read `"down"`.
- One real, undone gap, documented rather than guessed around: "size
  carried along the run until the next label / branch / transition
  vertex" (plan §6.6) needs to know, for each hop of a walked run, whether
  a branch/transition sits at its far end — but `walk.ts`'s own
  `WalkVertex[]` is sparse (only elbow/tee/crossing hops get an entry;
  collinear hops don't), so there is no hop-indexed shape to carry a size
  across yet. Building that mapping now would mean guessing a shape WP3.6
  (`receipt.ts`, which needs its own `segs`/`stops` receipt fields per the
  goal doc) might have to redesign anyway — deferred to that checkpoint,
  the same posture `walk.ts`'s own header takes with ITS two undone gaps.

Tests: `web/test/linear/sizes.test.ts`, 40 new. The grammar half covers
every real label string cited in plan §3.1's per-sheet table and prose
across all six named sets (Bessemer, ITD, Federal, Bldg 5406, Weld County,
Baker County — `12"x6"`, `14x3½`, `24X14 SA`, `8"Ø EA`, `1 1/4" HHWR`,
`2" CWS/R`, `1½" V UP/DN`, etc.) plus every cited negative example
(`48" MAX`, `80" MIN`, `12" ABOVE`, `#4@12" O.C.`, a dimension string, an
elevation-callout token) — the module's own stated acceptance criterion.
The association half covers the orientation gate (inclusive at exactly
±10°, rejects just past it), beside-vs-leader tie-breaking, the
association window formula, and both `resolveSizeConflicts` outcomes
(agreement resolves to the higher-confidence binding; disagreement
withholds with both, never picks one).

Verified: `npx tsc --noEmit` clean on both `web` and `mcp`;
`web/test/linear/sizes.test.ts` 40/40; `web/test/linear/*.test.ts` 129/129
(89 prior + 40 new); web's full suite (`test/*.test.ts
test/linear/*.test.ts` minus the known `compileProgressWalkthrough.test.ts`
flake) confirmed against the standing 70-fail/13-cancelled/13-skipped
baseline both before and after the `PIPE_RE` precedence fix.

2026-09-17 linear takeoff WP3.4 checkpoint (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
`walk.ts`, the bidirectional walker (plan §6.4) — Stage 3's final piece.
This is the FIRST module in the WP3 arc with a real end-to-end path
(strokes → index → graph → walk), so unlike WP3.2/WP3.3 (built and unit-
tested with no live caller to validate against) this checkpoint's own
verification chained all four modules together against real Bessemer and
ITD extraction, per WP3.1's own precedent. It surfaced one real,
already-known limitation and one deliberate, spec-correct behavior
difference from the throwaway probe — both investigated to a real cause,
not shrugged off as "close enough."

`web/src/lib/linear/walk.ts`:

- `walkOneDirection(index, seedSeg, atEnd, ppf, ctx, opts)` — plan §6.4's
  own pseudocode, literally: `frontier()` typed per node, `collinear`
  extends, `elbow` records a vertex and turns, `tee` extends onto the
  through-pair's OTHER member (or stops `branch_joins_main` if arrived via
  the branch — "the main is its own run"), `crossing` records a vertex and
  continues straight through (never onto the crossing segment), `ambiguous`
  stops and reports the candidate fan, hop/length caps stop with `cap`.
  Reuses WP1's own `RunVertexKind` for the three vertex kinds it can
  produce (`elbow`/`tee`/`crossing` — all three were ALREADY in that type
  before this file existed, evidence WP1's own design anticipated a real
  trace producing them) rather than inventing a parallel vocabulary.
- `walkBothDirections` — the estimator-facing entry point, combining both
  directions' `walkOneDirection` calls into one chain, the seed segment's
  own length counted once.
- Same-family continuity (plan §6.4: "pen ± 1 nibble, same dash code, same
  layer when layered") is a REAL gate on `frontier()` itself, not a
  post-hoc filter on the chosen continuation — this went through one real
  design correction mid-checkpoint (below).
- Two honest, undone gaps, both documented in the module's own header:
  `equipment`/`riser` stop-reason detection (needs a symbol-recognition
  signal at the dead-end point nothing yet exposes; every otherwise-
  unclassified `end` reports `dead_end`, the conservative default) and
  curved (`SEG_CURVE`) chain collapsing to one arc vertex with a fitted
  radius (a walk currently treats each curve chord as its own ordinary hop
  — real behavior, not a crash, but not the plan's own single-vertex
  collapse).

**A real design correction, caught by chaining all four modules against
real extraction, not assumed from the plan text alone:** the first version
ran `frontier()` UNFILTERED (plan §6.3's own node-typing text never
mentions family, so node typing being family-agnostic seemed textually
defensible), checking family continuity only on the chosen continuation.
Validated against Bessemer M101 p6's own `12"x6"` label — the exact case
the plan's own §3.1 table and the probe both cite (18.2 ft, 5 hops) — the
unfiltered version produced 1.0 ft over 2 hops, hitting `ambiguous`
almost immediately: a real sheet's candidate pool holds every trace-
eligible family at once, and near any real junction several of them
share a footprint, inflating degree past what the SAME duct run actually
presents. `trace-proto.mts`'s own pen-restricted candidate pool
(`if ((m>>4) !== PEN) continue`) exists for exactly this reason. Fixed by
filtering `frontier()` to the walk's own family as the PRIMARY query, with
one extra UNFILTERED `frontier()` call ONLY at a terminal `end` node (never
on every hop) to distinguish a real `dead_end` from a `family_change`
(curSeg's own end always "passes" a same-family-as-itself filter, so
without this second check a family mismatch would read as a plain dead
end, losing plan §6.4's own named distinction).

**After the fix, two further findings, both investigated to ground, not
merely observed:**

1. Bessemer's own confirmed-correct seed segment for `12"x6"` (the probe's
   segment #136, cross-referenced by exact coordinates to this codebase's
   own segment numbering) is EXCLUDED by `classifyStrokes` — traced to
   `networkWallSegs` (the wall-vouch fallback `strokes.ts` reuses verbatim
   from `ensureMepGraph`'s own mask, per WP3.1) false-positiving on this
   one long, dead-straight run. Quantified, not just spotted: 42 of
   Bessemer's 624 raw pen-4 segments (6.7%) are wall-vouch-excluded — a
   real, already-accepted characteristic (WP3.1's own checkpoint already
   recorded "582 members" surviving of 624 raw for this exact family; this
   checkpoint just identified WHICH check causes the gap and confirmed its
   scale isn't systemic). Not fixed here: `wallnetwork.ts` is shared,
   heavily relied-upon geometry no other WP in this arc touches, and the
   tradeoff (reusing `ensureMepGraph`'s exact, already-shipped mask rather
   than a second wall heuristic tuned only for this path) was the goal
   doc's own explicit instruction, not a choice made in this checkpoint.
2. Bypassing that exclusion to confirm the seed segment directly, the walk
   still stops `ambiguous` at a real degree-6 junction the same segment
   reaches shortly after (15.0 ft vs. the probe's 18.2 ft) — plan §6.3's
   own decision tree has no case for a degree-6 (or degree-5, or any
   degree beyond its four explicit patterns) junction other than the
   stated catch-all, "anything else → ambiguous." The probe's own
   `follow()` has no ambiguous stop at all — it always picks the
   least-angle-deviation candidate and continues, which is precisely the
   "guess with confidence" behavior plan §6.3's more careful decision tree
   exists to replace with principled refusal ("offer them as continuations
   in the UI"). Confirmed on ITD p3's `24"x16"` label too: a real degree-4
   junction with one collinear through-pair AND two additional NON-mutually-
   collinear branches (a real double-line-duct fitting, not a data error)
   — a shape the plan's own decision tree has no explicit case for either,
   correctly falling to the stated catch-all. Both real drawings are
   double-line duct, exactly the class of drawing plan-explicit WP4 exists
   to handle with pair-following; single-line walking refusing rather than
   guessing through a double-line junction is the intended, documented
   boundary of this work package, not a defect in it.

Tests: `web/test/linear/walk.test.ts`, 13 new — a straight collinear
chain, an isolated dead end, an elbow (vertex + turnDeg + angleClass), a
tee arrived via the through-pair (continues, records the branch) and via
the branch (`branch_joins_main`, no vertex), a crossing (continues
straight, ignores the crossing segment), a family change by pen (stops)
vs. within ±1 nibble (continues), a family change by dash code alone, a
sheet-edge end, a symmetric-Y ambiguous stop with its candidate fan, the
hop cap, and `walkBothDirections`' own combination arithmetic. One test
fixture bug caught and fixed during authoring (an `atEnd` parameter
mismatch that made a `branch_joins_main` fixture arrive via the wrong
end) — confirmed to be a test bug, not an implementation bug, by tracing
through `walkOneDirection`'s own documented `atEnd` convention by hand
before changing anything.

Verified: `npx tsc --noEmit` clean on both `web` and `mcp`;
`web/test/linear/*` 89/89 (13 new); real end-to-end validation against
Bessemer M101 p6 and ITD p3's own real extraction (not just synthetic
fixtures) — the first checkpoint in this arc able to do this, since this
is the first module with a real chain from stroke classification through
to a walked result; web's full suite (`test/*.test.ts test/linear/*.test.ts`
minus the known `compileProgressWalkthrough.test.ts` flake) confirmed
against the standing 70-fail baseline before this entry was committed.

2026-09-17 linear takeoff WP3.3 checkpoint (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
`graph.ts`, Stage 3 of the trace engine (plan §6.3). Still entirely
inert — nothing calls it yet (WP3.4's walker is the eventual consumer);
one new dependency, `robust-predicates` (Unlicense), documented in
`THIRD-PARTY-NOTICES.md`/`CHANGELOG.md`.

`web/src/lib/linear/graph.ts`:

- `weldTolerancePx(ppf)` — plan §6.3's own formula, `max(0.75px, 0.02 ×
  ppf)`, reusing `arrangement.ts`'s exported `WELD_TOL` (0.75) as the floor
  rather than re-declaring the same magic number a second place.
- `frontier(index, x, y, ppf, filterFn?)` — the goal doc's own procedure,
  implemented literally as a degree/deviation decision tree over
  `index.ts`'s (WP3.2) `endpointsNear`/`segmentsInBox` queries: gather
  welded-end candidates and interior-crossing candidates, then classify
  into `end`/`collinear`/`elbow`/`tee`/`crossing`/`ambiguous`. Two angle
  bands the plan's own text leaves unspecified (8°-30° and 150°-180°
  deviation) fall to `ambiguous`, the stated catch-all — not silently
  forced into whichever neighboring case seemed close.
- The one place `robust-predicates`'s `orient2d` is used: testing whether
  a point sits on a segment's interior at near-zero distance (the crossing
  test) — the exact case where a naive floating-point cross product (this
  codebase's own `segsIntersect` in `geometry.js`, for one) is known to
  flip sign from catastrophic cancellation. The coarser angle-band
  decisions (8°/30°/150° thresholds) use plain trigonometry — real drafted
  angles are never adversarially close to those boundaries the way a
  crossing test's near-zero distances routinely are.
- Deliberately NOT `arrangement.ts`: that module welds and splits the
  WHOLE sheet up front (global noding, explicitly ruled out for this
  path); `frontier()` welds only the candidates near ONE point, lazily,
  each time the walker asks — nothing is materialized until then.

Genuinely different verification posture from WP3.1/WP3.2: there is no
walker yet to validate the frontier API against end to end, and no
real-corpus check analogous to "does this correctly identify Bessemer's
duct pen" exists for node typing in isolation — the plan's own six-case
decision tree is precisely specified enough to test directly, and every
case (plus both unspecified-gap cases) has its own synthetic geometric
fixture built to land exactly there, but the API SHAPE (what `frontier()`
returns, how a filter composes) is a first design that WP3.4's actual
walker may still reveal needs adjusting — flagged here explicitly rather
than presented as settled.

Tests: `web/test/linear/graph.test.ts`, 12 new — all six node types, both
unspecified angle-band gaps, the pure 4-way endpoint crossing case versus
the 1-crossing-segment case (both resolve to "crossing" by different
paths through the decision tree), and `filterFn` changing a tee into a
plain collinear join by excluding its branch.

Verified: `npx tsc --noEmit` clean on both `web` and `mcp`;
`web/test/linear/*` 76/76 (12 new, all passing on the first run against
the synthetic fixtures — no fixture-vs-implementation mismatch this
checkpoint, unlike WP3.1's own pen-weight-prior iteration); web's full
suite, same command as every prior checkpoint (`test/*.test.ts
test/linear/*.test.ts` minus the known `compileProgressWalkthrough.test.ts`
flake) — 3346 attempted (12 new), 70 fail/13 cancelled/13 skipped, the
identical standing baseline.

2026-09-17 linear takeoff WP3.2 checkpoint (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
`index.ts` + `worker.ts`, Stage 2 of the trace engine (plan §6.3/§6.11).
Still entirely inert on every project — nothing calls either module yet
(WP3.3's graph.ts and WP3.4's walker are the eventual consumers); adds two
new runtime dependencies, `flatbush`/`kdbush` (both ISC), documented in
`THIRD-PARTY-NOTICES.md` and justified in `CHANGELOG.md` per this
project's own established dependency-documentation culture (naming why the
in-house hash grids and jsts's own STRtree were both rejected).

`web/src/lib/linear/index.ts`:

- `buildSegmentIndex` — a `Flatbush` R-tree over candidate segment bboxes
  and a `KDBush` k-d tree over candidate segment endpoints, built ONLY
  over the segments a `StrokeClasses.candidate` (strokes.ts, WP3.1) already
  picked out.
- `nearestSegment` — the "exact nearest-segment query with incremental
  neighbours" the goal doc names: `flatbush.neighbors()` returns candidates
  ordered by BOX distance (a true lower bound on point-to-segment distance,
  since every segment lies inside its own bbox), widening the query (8,
  16, 32, ...) until a candidate's own box distance exceeds the best TRUE
  distance found so far — proof no further candidate can win, not a
  fixed-K approximation. Returns the projection point and parameter `t`,
  not just a segment id, since the walker (WP3.4) needs to know WHERE on
  the segment a hit landed.
- `segmentsInBox` (crossing detection, WP4's double-line pair search) and
  `endpointsNear` (the probe's own frontier query, exact instead of a 3×3
  hash-cell scan) round out the query surface plan §6.3/§6.4/WP4's own
  survey doc actually demand — read off their real consumers, not guessed.
- `serializeSegmentIndex`/`deserializeSegmentIndex` — the transferable-
  `ArrayBuffer` pair that lets `worker.ts` build off the main thread while
  every actual query still runs synchronously ON the main thread (plan
  §6.10's own budget: "click → seed → walk: main thread, < 10 ms" — a
  worker that only answered queries by postMessage round trip could not
  meet that; only the BUILD needs to be off-thread).
- `hitTolerancePx(zoom, penWidthPx)` — plan §6.11's own formula,
  `max(11/zoom, penWidthPx/2 + 0.5)`, reusing the exact `11/zoom` literal
  `TakeoffCanvas.jsx`'s endpoint/segment/intersection snap already share
  (not re-derived) and the pen nibble (`meta[i] >> 4`, already baseline-
  frame device px) `strokes.ts` already reads the same way.

`web/src/lib/linear/worker.ts` — one message type (`build`), running
strokes.ts's `classifyStrokes` AND `buildSegmentIndex` together per plan
§6.10's own performance-budget row ("stroke classification + R-tree +
endpoint hash | worker, once per sheet"), replying with the serialized
index buffers plus the family classification (both `family` per segment
and the `families[]` evidence array) via a transfer list, never a
structured-clone copy. Same protocol shape as the existing
`netroom.worker.js` (module-scope `self.onmessage`, caller-injected `req`
echoed back for correlation, one try/catch, an error reply reusing the
request's own type) — deliberately not a new pattern. No test file, per
this codebase's own established precedent: none of the three existing
worker files (`netroom.worker.js`, `pdfTile.worker.ts`, `stt.worker.ts`)
have one either — a worker is a thin message-passing wrapper around
already-tested pure logic, not independently tested itself.

Deliberately NOT done this checkpoint: wiring either module into
`TakeoffCanvas.jsx`'s actual click path or a `netCacheRef`-style cache ref
— that integration (and the MCP-side `classify_strokes`/`trace_run` tools)
is WP3.6/WP3.7's own explicit scope, not WP3.2's. `worker.ts` has no
`new Worker(...)` call site yet and does not appear in a production build
(confirmed: `npm run build` output carries no `worker-*.js` chunk for it,
unlike the three real workers, which all do — it is genuinely unreachable
code today, not silently broken).

Verified: `npx tsc --noEmit` clean on both `web` and `mcp`; `web/test/linear/*`
64/64 (10 new in `index.test.ts`, including a deliberately-constructed
tie/false-lead case — 12 diagonal segments all sharing box-distance zero
to the query point, true distances strictly increasing — that a
naive "take the first K and stop" implementation would get wrong, proving
the incremental-widening logic is genuinely exact, not approximately
correct); web's full suite (`test/*.test.ts test/linear/*.test.ts` minus
the known `compileProgressWalkthrough.test.ts` flake) — 3334 attempted (10
new), 70 fail/13 cancelled/13 skipped, the identical standing baseline;
`npm run build` succeeds cleanly with the two new dependencies present
(pre-existing bas-related import-order warnings and chunk-size warnings
unrelated to this checkpoint).

2026-09-17 linear takeoff WP3.1 checkpoint (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
`strokes.ts`, Stage 1 of the trace engine (plan §6.2). Trace mode itself
stays entirely inert on every existing project: nothing calls this module
yet (WP3.2's index/WP3.3's graph/WP3.4's walker are the eventual
consumers), and the new `traceModeEnabled()` deployment flag in `prefs.js`
(default OFF, same convention as `cloudSyncEnabled`) gates whatever wires
in between here and GATE 4.

`web/src/lib/linear/strokes.ts`:

- `strokeExclusionMask` — plan §6.2 step 1's five checks. Two are reused,
  not reimplemented, per the goal doc's own instruction: layer-role
  annotation(3)/finish-pattern(2)/hidden(6) exclusion and the
  `networkWallSegs` wall-vouch-when-not-strong fallback are byte-for-byte
  `ensureMepGraph`'s own mask (`mcp/src/session.ts` — the goal doc's own
  `S:3440-3465` citation is stale; the real block is `:3649-3675`, verified
  by reading it directly). The other three (`SEG_CLIP`/`SEG_FILLONLY`,
  hatch rows via `classifyHatchSegs`, text-box frames via
  `classifyTagBoxSegs`) are new here — `ensureMepGraph` never excluded
  them. One deliberate, documented DIVERGENCE from `ensureMepGraph`'s own
  mask: LayerRole 5 (demolition) is NOT excluded — a trace engine that
  reports a run's own "new"/"existing"/"demo" status needs demolition ink
  to survive to family classification, not be blanked out first.
- `classifyStrokeFamilies` — histograms exclusion survivors by (pen
  nibble, dash, layer, lum, colour) per plan §6.2 step 2, then ranks
  evidence. Of the plan's four grades, (a) OCG-layer-name and (c)
  pen-weight-prior are implemented; (b) legend-swatch-match and (d)
  size-label-anchor are NOT — (b) needs `legendlearn.ts`'s swatch-geometry
  subsystem (a separate concern this module doesn't read), (d) needs
  WP3.5's `sizes.ts` (the Appendix A label grammar), which doesn't exist
  yet. Both are documented as real follow-up in the module's own header,
  not silently missing.
- `classifyStrokes` — the combined convenience wrapper, plan §6.2's own
  top-level `StrokeClasses` output.

Grade (c)'s pen-weight prior went through a real, corpus-caught iteration,
not a one-shot guess: WP3.1's own instruction to "test on Bessemer (pen 4),
ITD (pen 3), Weld (M-HVAC-DUCT)" was taken literally — real PDF extraction
against all three named sheets, not just synthetic fixtures. The first
version ("the family with the most long/axis-dominant LENGTH wins")
measurably picked the wrong pen: Bessemer's own modal pen (1, ~80% of the
sheet's segments — background/architectural ink) carries more raw
long-axis length than the real duct pen (4) simply by volume. Fixed by
excluding the sheet's own modal pen first (netroom.js's own "furniture
pen" insight, applied to a different ink class), flooring out true noise
(a stray few segments at a rare pen), then taking the heaviest pen weight
remaining. Re-validated against real extraction on all three sheets after
the fix: Bessemer M101 p6 → pen 4 (582 surviving members; corpus: 624 raw);
ITD p3 → pen 3 (14,270 members; corpus: ~14,467); Weld p7 → never reaches
grade (c) at all, resolving instead at grade (a) via its real M-HVAC-DUCT
layer (conf 0.9) — all three match the plan's own cited ground truth. The
module's own comment is explicit that this heuristic remains the weakest
of the four grades by design and can still fail on a sheet with two
comparably-weighted non-modal candidate pens and no layer signal at all —
not claimed to be solved, just measurably correct on the three named
cases.

Deliberately NOT done this checkpoint, and why: refactoring
`ensureMepGraph` (`mcp/src/session.ts`) and its `TakeoffCanvas.jsx`
duplicate to call `strokeExclusionMask`'s shared layer-role/wall-vouch
piece instead of their own inline copy — a real, valid de-duplication the
research for this checkpoint surfaced, but `mepconnectivity.ts` (which
`ensureMepGraph` feeds) is explicitly off-limits to CHANGE per the goal
doc's own "WHAT YOU NEVER TOUCH" list ("you CALL these; you do not change
them"), and touching `ensureMepGraph` itself would mean re-verifying an
already-shipped, corpus-tested MEP connectivity path for a benefit that's
about eliminating duplication, not adding capability. Documented as
follow-up in `strokes.ts`'s own header, not silently skipped.

Tests: `web/test/linear/strokes.test.ts`, 13 new — exclusion checks
against real fixtures (a verified-positive double-line wall-room fixture
for the wall-vouch gating test, confirmed against `networkWallSegs`
directly before use, not assumed), family grouping, grade (a)'s confidence
floor, grade (c)'s modal-exclusion/noise-floor/heaviest-remaining
algorithm (including that a short/diagonal family never wins however heavy
its pen), and an end-to-end Weld-shaped case (a real classified duct layer
surviving alongside excluded annotation ink).

Verified: `npx tsc --noEmit` clean on both `web` and `mcp` (strokes.ts has
no mcp-side caller yet, but mcp's own typecheck still walks every web/src
file it can reach); `web/test/linear/*` 54/54; `check:tool-count`
unaffected (no MCP tool touched — this checkpoint is `web/src/lib/linear`
+ its own test + `prefs.js` only, zero `mcp/` changes).

GATE 3 (recall/precision/length-error/size-accuracy/click-latency on a
held-out corpus tier) is far off — WP3.2 (spatial index), WP3.3 (endpoint-
welding graph), WP3.4 (the bidirectional walker) don't exist yet, and
GATE 3's own metrics can't be measured until a run can actually be walked
end to end. This checkpoint is WP3.1 alone.

2026-09-17 linear takeoff GATE 2 PASSED (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
all four conditions verified with concrete evidence, not asserted from the
"same shared function" architecture alone.

1. **"§8.4 golden reproduced byte-identically on canvas and MCP."**
   `web/test/linear/assembly.test.ts`'s own "plan §8.4 worked example, cell
   by cell" test already proved this against `resolveLinearAssembly` called
   directly (canvas side, WP2.2). That alone wasn't sufficient evidence for
   the MCP side — `resolve_linear_assembly` calling the identical imported
   function is a structural argument, not a demonstrated one. Closed the
   gap with a new `mcp/test/linearParity.test.ts` test that drives the
   EXACT SAME fixture (WORKED_EXAMPLE_RUN's 18.2 ft of 12x6 + 29 ft of
   16x8, one elbow vertex, `ductAssembly(false)`'s pinned-26-gauge inline
   assembly) through the REAL wire — `set_scale({upp: 0.1})` (0.1 ft/px
   makes 182px/290px exact whole-foot LF), `measure_line` with a
   `vertices` override forcing the mid-run "elbow" kind (the fixture's own
   collinear-segments-but-labeled-elbow design, ported verbatim), `edit_run`
   for the two segment sizes, then `resolve_linear_assembly` with an inline
   assembly matching `ductAssembly(false)` field-for-field. Asserts the
   exact same numbers assembly.test.ts's own golden pins: duct_lb 56.9/
   120.9, insulation_sf 80.1/159.5, elbow qty 1, transition qty 1 (formula
   matching `/4 x 4in/`), hanger 3/4, joint 14, labor_hr 4.09. Passed on
   the first run — genuine end-to-end confirmation, not a retrofit to make
   a wrong number pass.

2. **"Every table cell carries a grade and a source."** A GATE-2-anticipating
   generic walker test already existed in `web/test/linear/rates.test.ts`
   from WP2.1, but audited it and found it only covered 7 of the 10 rate
   tables — `ductLabor`, `pipeLabor`, and `basDefaults` (all three
   re-exported from `rates.ts`, all three carrying their own real per-cell
   `grade`/`source` structure) were never walked, so a future ungraded or
   unsourced cell in any of those three would have gone uncaught. Fixed by
   adding all three to `ALL_TABLES`.

3. **"A [M] cell cannot be marked C without a source URL in the same
   commit."** The same existing walker only checked that a graded cell's
   effective source was a non-trivial string (length ≥ 8) — a bare
   `"plans/03-research/..."` citation (legitimate for V/M) would have
   silently passed a "C" grade too, which is weaker than the gate's own
   literal wording. Strengthened the walker: a "C" grade now specifically
   requires its effective source to contain an `http(s)://` URL, checked
   independently of the general non-empty-source rule so V/M sources keep
   accepting a bare citation. Re-ran against the now-fully-covered table
   set: zero violations — every "C" cell across all 10 tables already
   carries a real URL; this closes the gap as an enforced, permanent test
   rather than a one-time manual audit that would silently rot.

4. **"Guard green."** mcp's full `test` script (37 files) — 432 cases
   (+1 for the new golden test), 11 fail, the identical 8 pre-existing
   failures (`sheet graph (#87)`, `WP1 keyed compile acceptance`, D04/D05/
   D09 production-engine cases, `safewrite.test.ts`'s "unreadable file",
   T-HVAC-01/T-VALVE-01) every checkpoint since WP2.5a has confirmed
   unrelated. `web`'s full suite and `bench`/`bench:linear` unaffected —
   this checkpoint touches only `mcp/test/linearParity.test.ts` and
   `web/test/linear/rates.test.ts`, zero `src/` files on either side.

No source changes this checkpoint — both fixes are test-coverage gaps in
existing verification tooling, closed before relying on that tooling to
certify the gate. `npx tsc --noEmit` clean on both sides;
`linearParity.test.ts` 12/12; `rates.test.ts` 11/11; `web/test/linear/*`
41/41.

2026-09-17 linear takeoff WP2.5b checkpoint (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
Report "Fittings & supports" tab; buy list rows from vertex/run bases. This
closes out WP2.5 (its other half, MCP `resolve_linear_assembly`, was
WP2.5a). GATE 2 itself is still unassessed — separate work, not implied by
either half landing.

`web/src/lib/totals.js` gains `fittingsAndSupportsRows(rows)` /
`fittingsAndSupportsSummary(rows)`: the subset of a condition's
already-resolved `materials` whose basis is `"vertex"`/`"run"` (WP2.3's
fitting-vertex/separate-run counts — elbow brackets, riser clamps, per-run
test kits), pulled out of the general materials list so a routed trade's
procurement list isn't lost among floor/linear/count-basis supplies (duct
board, VCT adhesive). Both read the SAME already-resolved rows
`conditionTotals` computed — no second pass over shapes, no
`resolveLinearAssembly` call, so this can never disagree with the Materials
tab/CSV section. `fittingsAndSupportsSummary` mirrors `materialsSummary`'s
own combine rule exactly (rounded per condition first, then summed), plus
an `hours` sum when any contributing row carries `hours_per_unit`.

Wired into both export surfaces that read `rows`, canvas and MCP alike:

- `web/src/lib/xlsx.js`: a new `Fittings & supports` tab, following the
  `Linear runs` tab's own established convention exactly — appended last,
  OMITTED entirely (not header-only) when no condition carries a vertex/
  run-basis material, so a pre-WP2.5 workbook's tab count is unchanged for
  every such project. Per-condition rows (Finish/Material/Qty/Unit/Basis/
  Note, gaining Hours columns only when any row carries `hours_per_unit`),
  then the combined buy list, same two-part shape as the Materials tab.
- `web/src/lib/totals.js`'s `reportJson` gains a `fittingsAndSupports`
  param, emitted as an additive-only, ALWAYS-emitted `fittings_and_supports`
  key (the `linear_runs`/`linear_settings` precedent — empty `[]` for every
  pre-WP2.5 project, so those exports round-trip byte-identically except
  this one key). Wired at both call sites that already call `linearRunRows`
  the same way: `ReportPanel.jsx`'s JSON export and `mcp/src/session.ts`'s
  `exportReport` — unlike `linear_settings` (real project-settings state
  MCP doesn't track), this is a pure derived view of `materials` MCP
  already fully knows, so no "always {} on this surface" caveat applies.
  `mcp/src/outputs.ts`'s report.v1 schema gains the matching
  `fittings_and_supports` array field.

A real pre-existing bug this checkpoint's own audit caught and fixed, not
new functionality: `totals.js`'s CSV export and `xlsx.js`'s workbook both
had their own `basisLabel` ternary (`"linear"→"LF"`, `"count"→"EA"`,
`"seam_lf"→"seam LF"`, else `"SF"`) — WP2.3 added the `"vertex"`/`"run"`
basis values themselves but never touched either `basisLabel`, so a
vertex- or run-basis material's Coverage column read a nonsensical
`"1 kit / 1 SF"` in both exports since WP2.3 shipped. Fixed by adding the
two missing cases to both. Safe under the goal doc's own "Frozen-13 CSV
untouched" rule: no basis value before WP2.3 could ever have hit the `else`
branch this way, so no existing golden's bytes move.

One version bump (0.9.79→0.9.80, all three surfaces) for this checkpoint's
`mcp/src/session.ts`/`outputs.ts` changes, plus a new CHANGELOG.md entry —
kept separate from WP2.5a's own entry rather than editing already-pushed
history.

No new MCP tool, so the AGENTS.md tool-count doc-sync checklist doesn't
apply here (`resolve_linear_assembly` already covered it in WP2.5a); this
is a schema/data addition to an existing tool's (`export_report`) output.

Tests: 5 new in `web/test/totals.test.ts` (`fittingsAndSupportsRows`
basis-filtering and hours passthrough, `fittingsAndSupportsSummary`
cross-condition combine, `reportJson`'s `fittings_and_supports`
verbatim/coercion, the CSV coverage-label fix) plus the `reportJson`
key-set-pinned assertion updated; 2 new in `web/test/xlsx.test.ts`
(no-tab-when-nothing-qualifies, and a full tab-contents assertion
including the combined-with-Hours section). No new mcp-side test for the
`fittings_and_supports` wire-through, matching `linear_runs`'s own
precedent: `session.ts`'s change is a one-line pass-through of an
already-tested pure function, not new logic to verify twice.

Verified: web and mcp `npx tsc --noEmit` clean (a JSDoc `@param` type on
`reportJson` needed the new field too, caught by mcp's own typecheck
importing the same function); `check:tool-count` unchanged (58, no tool
touched); `mcp npm run test:packaging` 4/4 + clean build; `node
scripts/smoke-dist.mjs` exit 0; `report-csv-golden.test.ts` (the frozen-13
golden) unchanged; `web`'s full suite (`test/*.test.ts test/linear/*.test.ts`
minus the known `compileProgressWalkthrough.test.ts` flake) — 3311
attempted (7 new), 70 fail/13 cancelled/13 skipped, the identical standing
baseline count and cluster; `mcp`'s full `test` script (the 37-file list)
— 431 cases, 11 fail, the exact same 8 pre-existing failures WP2.5a's own
baseline diff already confirmed unrelated (down from that checkpoint's 12
— the other 4 were the `tools.test.ts` `NO_COORDS` gap WP2.5a fixed).
`npm run bench` and `npm run bench:linear` both green, unchanged from
WP2.5a's own run.

2026-09-17 linear takeoff WP2.5a checkpoint (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
MCP `resolve_linear_assembly` (measure stage). WP2.5's other half — the
canvas "Fittings & supports" report tab / buy-list rows — is tracked
separately; this checkpoint is the MCP tool alone, a complete and
independently-tested unit.

`mcp/src/session.ts`'s `resolveLinearAssembly(shape_id, opts)` is a
read-only measure-stage method (no shape mutation, no undo step — like
`takeoff_summary`) that resolves ONE committed linear shape's own
`computed.run` through the SAME `resolveLinearAssembly` pure function
(`web/src/lib/linear/assembly.ts`, WP2.2) the canvas will call — imported
directly, not ported or reimplemented, so the two surfaces cannot drift on
arithmetic. Assembly lookup is real and permanently narrow: this server has
no reach into an estimator's own browser-profile assembly library
(`profile.js`'s IndexedDB-backed section — Node has no browser storage to
read), so it resolves against `SEED_ASSEMBLIES` (the shipped §5.5 defaults,
WP2.4's `assemblyLibrary.ts`) by `assembly_id`, the condition's own
`assembly_id` when the call omits one, or a new `DEFAULT_ASSEMBLY_ID_BY_FAMILY`
map keyed to the three families a seed actually ships a default for
(duct_rect/duct_round/pipe — oval/flex/conduit/cable/tubing have none yet
and refuse, asking for an explicit `assembly_id` or an inline assembly
instead); a genuinely custom assembly goes in INLINE via the `assembly`
parameter and reports back `assembly_id: "inline"`.

Registered in the `measure` tool stage (`staging.ts`), right after
`measure_line`. Threaded through the full AGENTS.md doc-sync checklist:
README.md/USER_GUIDE.md tool-count markers (57→58, auto via
`check-tool-count.mjs --write`) and Measure-group table rows; mcp/README.md
("57 tools"→"58 tools" + a new table row, manual); docs/MCP.md ("Fifty-seven
tools"→"Fifty-eight", a new bullet); docs/AGENT_GUIDE.md ("57 tool
schemas"→"58"); one consolidated CHANGELOG.md entry covering the whole
linear-takeoff MCP-surface arc since WP1.5 (no prior checkpoint this session
had added one — a real gap, closed here); version 0.9.78→0.9.79 on all
three required surfaces (mcp/package.json, mcp/server.json,
web/public/.well-known/mcp.json) so a future PR's `mcp-version-guard` CI job
doesn't fail on unbumped `mcp/` changes.

Two gaps this checkpoint's own verification pass caught and fixed, neither
in scope-creep territory — both are the harness catching its own tooling,
not new functionality:

- `mcp/test/linearParity.test.ts` (created WP1.5, carrying 5 tests, now 11
  with this checkpoint's 6 new `resolve_linear_assembly` cases) was NEVER
  wired into `mcp/package.json`'s `test` script — a silent gap since WP1.5
  that meant this whole file has never run in CI. Fixed by inserting it
  into the alphabetized file list (between `labels` and `overlap`).
- `mcp/test/tools.test.ts`'s own `NO_COORDS` exemption set (the established
  pattern for tools that don't take image-px coordinates, e.g. `edit_run`)
  didn't list `resolve_linear_assembly` yet, so the coordinate-contract
  assertion failed against its long description. Fixed by adding it with
  the same one-line justification style as its neighbors.

The 6 new `linearParity.test.ts` cases cover the MCP-side wiring surfaces
that could uniquely diverge from the canvas — not the shared function's own
arithmetic, which WP2.2's `assembly.test.ts` already proves against the
plan §8.4 golden cell-by-cell: default assembly resolution from a
condition's family, an explicit `assembly_id` override, an unknown
`assembly_id` refusing by naming the reachable built-in ids, an inline
assembly winning over `assembly_id` and reporting `assembly_id: "inline"`,
the condition's own `multiplier` applying to every returned line, the pipe
family resolving from NPS/material/service, and refusal on a non-linear
shape or a linear shape with no run block yet.

Verified: `npx tsc --noEmit` clean; `linearParity.test.ts` 11/11;
`tools.test.ts` 102/102 (after the `NO_COORDS` fix); `check:tool-count`
clean; `npm run test:packaging` 4/4 + a clean build; `node
scripts/smoke-dist.mjs` exit 0; `web`'s `npm run bench` and `npm run
bench:linear` both green (neither touched — WP2.5a's diff is `mcp/` +
root docs only, zero `web/src` files). Ran the FULL `mcp` `test` script
(the 37-file list, not just `linearParity.test.ts`) for the first time
this session as a genuine regression signal: 431 cases, 12 failures. One
(`tools/list: exactly TOOL_NAMES, each described with the coordinate
contract`) was the `NO_COORDS` gap above, fixed. The other 8 distinct
failures (`sheet graph (#87)`'s citation-chain assertion, `WP1 keyed
compile acceptance`, three demo-regression production-engine cases
(D04/D05/D09), `safewrite.test.ts`'s "an unreadable file fails CLOSED",
and the T-HVAC-01/T-VALVE-01 frozen-truth-quantity compilers) were
confirmed pre-existing and unrelated by `git stash`-ing this entire
checkpoint's diff and re-running those exact files against the prior
committed state: identical failures, identical messages, with the diff
entirely absent. Also ran `web`'s full suite (`test/*.test.ts
test/linear/*.test.ts` minus the known `compileProgressWalkthrough.test.ts`
flake) as an independent signal even though this diff touches no `web/src`
file: 3304 attempted, 70 fail, 13 cancelled, 13 skipped — the same standing
baseline count and cluster (`syncStore.test.ts`, `tableRecallGaps.test.ts`
among them) every prior checkpoint this session has confirmed unrelated.
mcp's own `.venv-bas` pytest-env failures (`basEngineeringContract`,
`basEngineeringOwnershipFamilies`) are separately pre-existing and out of
scope (bas_engine off-limits per D4) — confirmed unchanged, not re-run in
full here since `test:bas`'s own pretest gate already isolates them.

2026-09-17 linear takeoff WP2.4 checkpoint (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
assembly library + project settings persistence. Two new pure modules:

- `web/src/lib/linear/assemblyLibrary.ts`: `SEED_ASSEMBLIES` — three
  AssemblyRecord entries (types.ts, WP2.2) matching plan §5.5's own
  defaults verbatim: `asm-duct-rect-default`/`asm-duct-round-default`
  (per_ft `duct_lb` with NO fixed gauge — the default lets rates.ts's
  `ductGaugeFor` size-lookup apply per §5.5's "gauge =
  lookup(pressure_class, max(W,H))", deliberately NOT the fixed gauge
  WP2.2's own worked-example test pins for that one scenario;
  `insulation_sf` at 1.5"/1.10 lap; per_vertex elbow at 1.4 labor factor;
  `deduct_fittings: false`, D2's default) and `asm-pipe-default` (empty
  per_ft/per_vertex/per_run — assembly.ts's pipe resolvers don't read any
  assembly-level rule yet, so seeding ones nothing consumes would be
  misleading, not merely incomplete; documented in the file's own header
  and enforced by a test that fails if a future edit adds an unconsumed
  rule silently). `sanitizeAssemblyLibrary` mirrors
  `sanitizeMaterialLibrary`'s exact minimal contract (materials.js's own
  precedent): non-empty unique string id, first-wins on a duplicate,
  everything else defaulted defensively rather than thrown on.
- `web/src/lib/linear/settings.ts`: `LinearProjectSettings` +
  `sanitizeLinearSettings` — `adopted_pipe_hanger_code`, `climate_zone`,
  `pressure_class_by_system` (a system-tag → w.g. map), `stick_length_by_
  material`, `offset_allowance_pct`. `level_heights` is deliberately
  ABSENT — plan §7.4 says so itself ("already sheetLevels.js"): the
  project already persists per-sheet level assignment there, and
  duplicating it here would just be a second place it could drift from
  the real one. `pressure_class_by_system`/`stick_length_by_material` are
  persisted but NOT YET read by `resolveLinearAssembly` (which still takes
  a flat per-call value) — a caller resolving one condition looks up its
  own system/material key before calling in; that lookup wiring is
  WP2.5's job, documented in the module header rather than silently
  assumed done.

Wired additively into the existing persistence stack, mirroring each
layer's own established pattern exactly rather than inventing a new one:

- `store.js`: `loadAssemblyLibrary`/`saveAssemblyLibrary`, same
  browser-global meta-store pattern as materials/templates/stamps — but
  unlike materials/templates (which start empty; an estimator builds
  those), an ABSENT record auto-seeds `SEED_ASSEMBLIES` and persists it
  once, in the STORE METHOD ITSELF rather than a canvas-side effect
  (contrast the stamp library's own `useEffect` in TakeoffCanvas.jsx):
  nothing in the canvas calls `loadAssemblyLibrary` yet
  (`resolveLinearAssembly` has no UI consumer until WP2.5's report tab),
  so seeding at the store layer means any future caller — canvas, a
  script, an MCP tool — gets the defaults on first touch without each
  needing its own seeding logic.
- `profile.js`: `buildProfile`/`applyProfile`/`resetProfileDefaults` all
  gain the `assembly_library` section, `applyProfile`'s receipt gains an
  `assemblies` count. `resetProfileDefaults` re-seeds (the stamp-library
  precedent: assemblies ship with defaults, unlike templates/materials);
  `applyProfile` never re-seeds an incoming profile's empty/absent
  section (a REPLACE, not a merge — an old profile that deliberately
  emptied its library on another machine must not get defaults
  resurrected by importing it here).
- `TakeoffCanvas.jsx`: `linearSettings` state, hydrated from the payload's
  additive `linear_settings` key (else-clear on a snapshot load, the
  `sheet_levels` precedent exactly), read back into `buildPayload()`
  omit-when-empty, added to the autosave effect's dependency array.
  Persistence only — NO settings UI panel this commit. Flagged explicitly
  as a scoping choice, not an oversight: WP2.3's own queue text explicitly
  asked for a "TakeoffsPanel basis select"; WP2.4's does not ask for a
  settings UI, and building one now against a feature
  (`resolveLinearAssembly`) with no other UI surface yet would be
  premature wiring in a 10,000+-line component with no consumer to
  validate it against.
- `totals.js`: `reportJson` gains a `linearSettings` param and an
  always-emitted `linear_settings` block, appended last (the `linear_runs`
  precedent) — `{}` for every project that hasn't set one, so a
  pre-WP2.4 export round-trips byte-identically except this one key.
- MCP (`session.ts`/`outputs.ts`): `nativeExportPayload`/`exportReport`
  both emit `linear_settings: {}` — matching `sheet_levels`'s OWN existing
  "not tracked in Session state" status exactly (that field has been
  hardcoded empty on the MCP side since before this goal existed). This
  is a REAL, acknowledged gap, not silent: MCP does not read an imported
  project's `linear_settings` block into its own state yet, so a
  round-trip through `import_takeoff` → `export_takeoff`/`export_report`
  currently drops it, the identical class of limitation `sheet_levels`
  already carries. Closing it is follow-up work, not invented here.

Two exact-key-list tests broke and were fixed, precisely BECAUSE these
new keys are ALWAYS present (unlike most additive fields here, which
omit-when-empty): `mcp/test/session.test.ts`'s `exportPayload` envelope-
keys assertion (added `linear_settings`) and `web/test/totals.test.ts`'s
`reportJson` v1-key-set-pinned assertion (same). Both now also assert the
new key's value directly, not just its presence.

Tests: 7 new cases in `web/test/linear/assemblyLibrary.test.ts`
(non-array/malformed/duplicate handling, the `per_ft`/`per_vertex`/
`per_run` defaulting, `deduct_fittings`/`allowances` passthrough gating,
every SEED_ASSEMBLIES id unique and round-trips, and the "no fixed
gauge" invariant on both duct seeds); 6 in `web/test/linear/
settings.test.ts` (non-object input, full round-trip, each field's own
enum/numeric validation, an all-dropped map coming back absent rather
than `{}`); 2 new + 2 fixed in `web/test/totals.test.ts` (linear_settings
passthrough/coercion, the two key-set fixes above).

Verified: web and mcp typecheck/lint clean; `check-tool-count` clean (no
tool touched); full `mcp npm test` — 107/107 file-level, same 2 known
`.venv-bas` pytest-env failures; full `web npm test` minus the known
`compileProgressWalkthrough.test.ts` flake — 3304 attempted, 70 fail,
same pre-existing cluster (this run's `annotationGeneration.test.ts` and
`basSyncRestore.test.ts` subtests additionally surfaced as
`cancelledByParent` rather than plain assertion failures — same test
names, same already-known-flaky files, a different manifestation of the
identical pre-existing async-cleanup timing issue, not a new one — the
70-count itself, the signal this session has used throughout, held
exactly steady). `npm run bench` and `npm run bench:linear` both green,
both `results.json` byte-identical.

2026-09-17 linear takeoff WP2.3 checkpoint (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
materials rows gain "vertex"/"run" basis + hours_per_unit. Threaded
additively through every layer that already knew about materials basis
(the same list AGENTS.md's shared-path rule expects a routed-condition
feature to touch):

- `web/src/lib/totals.js` (`conditionTotals`, the shared resolver both the
  canvas and MCP's `takeoff_summary`/`export_report` read): accumulates
  `vertexCount` (every interior fitting vertex — `computed.run.vertices`
  — across a condition's routed shapes) and `runCount` (how many separate
  shapes carry a resolved `run` block at all), scaled by the condition's
  own `multiplier` exactly like `floor`/`wall`/`lf`/`ea`/`sizeLf` already
  are. The materials basisVal ternary gains `"vertex"` and `"run"`
  alongside the existing `"linear"`/`"count"`/`"seam_lf"`. Each resolved
  row gains `hours_per_unit`/`hours` (only when the row itself set one) —
  `hours = qty x hours_per_unit`, using the SAME already-rounded `qty`
  every other field on the row already reads, not a separate fractional
  path.
- `mcp/src/session.ts`: `MaterialRow.basis` gains the two values,
  `MaterialRow` gains `hours_per_unit?`; `editMaterials`'s `add` row
  construction passes it through.
- `mcp/src/tools.ts` / `mcp/src/outputs.ts`: `edit_materials`'s inputSchema
  (add-row basis enum + `hours_per_unit`, description text) and both
  `materialRow`/`reportMaterialLine` output schemas updated to match
  (`reportMaterialLine` already had `.passthrough()`; added explicitly
  anyway for the same "documented, not just tolerated" reason every other
  field there is spelled out).
- `web/src/pages/TakeoffCanvas.jsx`: `agentEditMaterials`'s minted-row
  construction and its `AGENT_MATERIAL_FIELDS` patch allowlist both gain
  `hours_per_unit`, mirroring session.ts's MCP path exactly (the
  "canvas and MCP cannot disagree" rule applies to the AGENT surface
  too, not just the human one).
- `web/src/lib/agentTools.js`: the `edit_materials` tool definition's
  JSON-schema description and properties gain the same two additions.
- `web/src/components/TakeoffsPanel.jsx`: both basis `<select>`s (the
  per-condition materials row and the library-template row) gain
  "fitting vertices" / "runs" options; both rows gain an hours/unit
  numeric input (`LibDraftInput` for the library row, matching its
  existing draft-commit-on-blur pattern; a plain controlled input for
  the condition row, matching its siblings) wired into the same
  override-diff (`ov`/`rv`) tracking every other field on the row uses.

Tests: 5 new cases in `web/test/totals.test.ts` (vertex-basis count,
run-basis count — deliberately using a mix of sized/unsized/plain-trace
shapes to prove it counts RUNS not LF or vertices, multiplier scaling
on both, hours_per_unit resolving through the rounded qty and staying
absent on a row that never set one); 1 new end-to-end MCP case in
`mcp/test/tools.test.ts` (add with the new basis + hours_per_unit,
patch to change hours_per_unit, confirming the field round-trips and a
row without one carries no such key at all).

Verified: web and mcp typecheck/lint clean; `mcp/scripts/check-tool-
count.mjs` clean (no new tool added — edit_materials' existing entry is
just extended, so this is a pure sanity check); full `mcp npm test` —
107/107 file-level (the 2 already-known `.venv-bas`-missing-`pytest`
failures unchanged); full `web npm test` minus the known
`compileProgressWalkthrough.test.ts` flake — 3290 tests, 70 fail, same
pre-existing cluster, same 83 subtest names as the WP2.2 checkpoint's
own baseline (verified by diffing the failing-test list, not just the
count). `npm run bench` and `npm run bench:linear` both green, both
`results.json` files byte-identical.

2026-09-17 linear takeoff WP2.2 checkpoint (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
resolveLinearAssembly, CORE scope. New `web/src/lib/linear/assembly.ts` +
three new shared types in `types.ts` (`LinearCondition`, `AssemblyRecord`,
`LineItem` — the last is the real, fully-typed output contract; the
input assembly's own `per_ft`/`per_vertex`/`per_run` rule arrays stay
loosely typed on purpose, since the assembly LIBRARY doesn't exist until
WP2.4 seeds one and locking a rule shape down before any second consumer
exists would just be guessing). Implements plan §8's fixed seven-step
pipeline order for duct (rect/round/oval) and pipe: §8.1 per-foot duct
weight + insulation SF + labor-from-weight, pipe LF + couplings +
insulation + per-LF labor; §8.2 per-vertex elbow (from a real `vertices[]`
entry) and size-change transition/reducer (see below) with the
`deduct_fittings` switch (off by default, D2); §8.3 per-run hangers
(duct: IMC 603.10 floor; pipe: MSS SP-58/IMC 305.4/IPC 308.5/UPC 313.3 by
adopted code, all via WP2.1's rates.ts). The condition's `multiplier`
applies to every live qty as the literal last step; waste/rounding
(steps 6-7) are deliberately not touched here at all — asserted directly
as a §8.5 invariant test (no line's formula string ever mentions waste/
purchase/carton/roll).

One real design decision, documented in assembly.ts's own header and
inline at the exact function it affects rather than only here:
`sizeChangeEvents()` derives a transition/reducer from comparing
CONSECUTIVE SEGMENT sizes, not from a `"size_change"` entry in
`vertices[]` — because WP1's actual vertex resolver (`run.ts`) never
emits that kind at all; it only emits `"elbow"` from a real geometric
turn or whatever an explicit `vertex_overrides` entry states (its own
header comment says so). Plan §7.1's illustrative jsonc shows a
`"size_change"` vertex nothing currently populates — a dead-straight run
with two differently-sized segments (exactly §8.4's own worked example)
has NOTHING at that boundary in `vertices[]` at all. Comparing segments
directly is the only signal that actually exists in WP1/WP2's shipped
data model for this, so that's what ships, with the gap between the
plan's illustrative model and WP1's real one written down rather than
quietly papered over.

Scope this commit does NOT cover, each because it needs a WP1 vertex/
param representation that does not exist yet (listed in assembly.ts's
own header so the gap travels with the code, not just this entry):
diffuser taps + flex runouts (§8.3 itself says "diffusers... or a user
count" — but `AuthoredRun.params` never gained a `diffuser_count` field
in WP1.1); automatic tee/riser/equipment resolution (WP1's geometry pass
only ever infers `"elbow"`; an explicit `vertex_override` supplying
`"tee"`/`"riser"`/`"equipment"` resolves correctly today, there is just
no automatic path to one without the trace engine, WP3+); sleeves/
firestop (needs `wall_crossings`, which `computeShapeMetrics` doesn't
populate for a linear run yet); tests/flush and the offset/undrawn-
fitting allowances (need condition-level flags — `test_per`, a
schematic-sheet marker — that don't exist yet either). A near-elbow
extra hanger (SMACNA practice, §8.3) and a per-piece fitting-weight
table (no such table exists in WP2.1's rates) are the other two
worked-example rows this leaves out.

Golden test: `web/test/linear/assembly.test.ts` reproduces plan §8.4's
worked example (Bessemer M101's traced 12x6→16x8 supply) cell by cell
for everything the CORE scope above can compute — duct weight 56.9 lb
(12x6, exact) and 120.9 lb (16x8; the plan's own hand-rounding gives
121.0 — a tenth of a pound from THEIR intermediate rounding, verified by
hand, not a formula disagreement), wrap SF 80.1 + 159.5 = 239.6 SF
(exact), elbow and transition counts (1 ea each, exact), hanger
sub-counts (3 and 4, exact — before the documented near-elbow bump),
base labor 4.09 hr (exact — before the documented fitting-weight
increment). Also covers: `deduct_fittings` on vs. off shifts weight off
the upstream segment without changing the transition's own disclosed
line; every §8.5 invariant this scope can exercise (no waste/rounding
inside the function, pure/deterministic across repeat calls, the
multiplier applied last to every line uniformly); a pipe-family case
exercising WP2.1's pipe rate tables end to end (LF, couplings,
insulation, per-LF labor fallback, MSS SP-58 hanger spacing by NPS and
material). 6 new tests, 28/28 across the whole `test/linear/` directory.

Verified: web typecheck/lint clean; full `npm test` minus the
already-known `compileProgressWalkthrough.test.ts` subprocess flake
(same exclusion as the WP2.1 checkpoint, same reason) — 3286 tests, 70
fail, same count and same pre-existing cluster as WP2.1's own baseline
moments earlier. `npm run bench` and `npm run bench:linear` both green,
both `results.json` files byte-identical.

Pending (tracked here, not silently dropped): the diffuser-tap/flex-
runout/near-elbow-hanger/fitting-weight-table gaps above are real WP2
follow-up work, not WP2.2's own remaining steps (2.3-2.5) — those are
materials-row basis extensions, the profile's assembly library, and the
report/MCP surface for resolve_linear_assembly, in that order per the
queue.

2026-09-17 linear takeoff WP2.1 checkpoint (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
graded rate tables. New `web/src/lib/linear/rates.ts` + nine
`web/src/lib/linear/tables/*.json` files (duct gauge, duct weight, duct
hanger spacing, pipe hanger spacing, duct insulation, pipe insulation,
pipe joint hours, duct labor, BAS defaults), every cell carrying
`{value, grade, source}` (or a table-level `table_grade`/`table_source`
default, overridden per-cell where the source table itself mixes grades
— e.g. the pipe-hanger and pipe-insulation tables' bold-confirmed cells).
Data lives in JSON (tsconfig.json gains `resolveJsonModule` — mcp's
tsconfig already had it), specifically so a future table correction is a
JSON diff, never mixed with lookup-logic changes in the same review.

LAW L10 / D6 (no licensed MCAA/Wendes/SMACNA table values ship) applied
throughout, and extended by this session's own judgment to MSS SP-58
(also a purchased ANSI standard, not named in L10's own sentence but
matching its doctrine exactly): the duct gauge table ships the research
doc's "widely used simplified spec schedule" (explicitly marked safe to
ship, never labeled "SMACNA"), not a reconstruction of SMACNA's own
pressure-class tables; duct hanger spacing ships the IMC 603.10 code
floor (10 ft, [C], the one legally-mandated ceiling) with an [M]
engine-authored hardware-by-size band that never widens spacing past
that floor; pipe hanger spacing ships MSS SP-58 as an [M]
order-of-magnitude reconstruction (a few independently-confirmable
cells graded [V]) alongside the genuinely public IPC 308.5/IMC 305.4/
UPC 313.3 code tables at [C]; pipe joint hours ship the research doc's
own pre-softened "order of magnitude, not licensed values" grid
verbatim, all [M], with the profile's CSV-import escape hatch (D6) noted
in the table's own JSON rather than built here (that's WP2.4). Duct
weight (galvanized sheet lb/ft² by gauge) and ASHRAE 90.1/IECC
insulation R-values/thicknesses ship at [C]/[V] — these are, respectively,
generic sheet-steel physics and code text incorporated by reference into
adopted building codes, not a trade association's own priced table.

Caught and fixed before committing: `ductWeightPerSf`'s odd-gauge
fallback initially sorted ascending and took the first row `<=` the
request, which for gauge numbering (inverted from thickness — a BIGGER
number is THINNER metal) silently picked the LIGHTEST stocked gauge
satisfying the inequality instead of the nearest-and-heaviest one;
caught by the test asserting gauge 19 resolves to 18 ga (not 20 ga),
fixed by sorting descending for this one lookup (documented inline why
it's the only table that needs the reversed direction).

Tests: `web/test/linear/rates.test.ts`, 11 cases — every public lookup's
boundary bands, round-up-to-next-stocked-size behavior, and null-for-
no-data-cell behavior, plus a generic GATE 2 invariant test that walks
every table this module loads and asserts every graded cell (including
`pipeInsulation.json`'s per-band `grade` arrays) uses a legal
grade letter and carries a real, non-empty source — so a future table
addition inherits the check for free instead of needing its own.

Verified: web typecheck clean; lint clean (0 errors, the same
pre-existing 3 warnings); full `npm test` minus the one already-known
`compileProgressWalkthrough.test.ts` subprocess flake (it hit its own
historically-documented multi-hour real-PDF-compile duration twice in a
row during this checkpoint's verification and was excluded from the
timed run rather than blocking on it) — 3280 tests attempted, 70 fail,
the SAME count and the SAME sync/cloud-storage/snapshot/BAS-restore
cluster as GATE 1's own baseline moments earlier, confirming this file
contributes zero of the 70 (consistent with WP1.6's note that it "didn't
hang this run and passed outright" when it does complete) and that
WP2.1 introduces no new failures. `npm run bench` and `npm run
bench:linear` both green, `bench/results.json` and
`bench/linear/results.json` byte-identical (nothing engine-facing
changed).

2026-09-17 linear takeoff GATE 1 (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) — PASSED.
Four conditions, checked independently:

(1) Trace time < 10 min: the WP1.7 checkpoint's own M101 trace (two supply
trunks, sizes set) ran to completion in a handful of tool calls, well
under the bound.

(2) Per-size LF reconciles to the hand takeoff within 1%: verified by
recomputing each traced segment's length from first principles —
Δverts_norm × page_width_pt (2592, confirmed via probe.mts for both
sheets) × (4/72 ft-per-pt, from the plan's own confirmed "1/4\" = 1'-0\""
scale) — independent of the app's own computed.run arithmetic. All five
segments across the three runs reproduce the app's own LF to the app's
own 2-decimal rounding (0 measurable error): M101 12x6 14.42, M101 16x8
(west) 17.27, M101 16x8 (east) 13.67, M101 10x6 15.12, P101 1.25" pipe
4.25, P101 1" pipe 14.71. Also cross-checked M101's 12x6 segment against
`plans/03-research/probes/trace-proto.mts`'s independent vector-chain
walk (the same probe SETUP's own baseline invocation cites): its walk
finds a 18.2 ft chain (x 1066→1718 at its internal 2×-scaled px) against
this session's western endpoint (x≈1078) and stops mid-run at x≈1718,
roughly 3.4 ft short of this golden's 12x6→16x8 transition vertex
(x≈1597) — NOT a discrepancy in the golden: trace-proto.mts is an early
WP3-prototype pair-walker that has no transition/reducer handling yet
(that's explicitly WP4.1's job, "transition (converging edges)") and
visibly loses the constant-pair-width assumption at this exact
12x6-to-16x8 size change, stopping early rather than mis-measuring. It
is not a valid ground-truth oracle for a size-changing run and was not
used as one; the first-principles scale arithmetic above is.

(3) `bench:linear` green: `npm run bench:linear` passes (parityFailures 0,
maxTotalsErrPct 0.00054%, maxDeterminismErrFt 0.01 ft, both under the
WP1.6 thresholds), `bench/linear/results.json` byte-identical (nothing
engine-side changed since WP1.6).

(4) Regression guard green: `web` — typecheck clean, lint clean (0
errors, pre-existing 3 warnings), `npm run build` clean; `npm test`
3272/3272 attempted, 70 fail — the same pre-existing sync/cloud-storage/
snapshot/BAS-restore cluster the WP1.4/WP1.5/WP1.6 checkpoints already
carry forward (same failure count, same theme; `npm run check`'s own
`&&` chain stops at this step before reaching the bas-* benches and
build, which is why typecheck/lint/build were run and confirmed
separately here rather than through the chained script). `mcp` —
105/107 pass; the 2 failures (`basEngineeringContract.test.ts`,
`basEngineeringOwnershipFamilies.test.ts`) are both the identical root
cause — `ModuleNotFoundError: No module named 'pytest'` from
`.venv-bas/bin/python`, which has pydantic (the bas_engine runtime
dependency `npm run dev` provisions) but not pytest (only needed by
these two dev cross-check tests, which shell out to run
`bas_engine/tests/test_engineering.py` via `pytest`/`runpy`) — a
pre-existing environment-provisioning gap in a component this goal
explicitly never touches (D4, bas_engine), unrelated to WP1.7's
JSON-only change (zero files under `opentakeoff/web/src` or
`opentakeoff/mcp/src` changed this checkpoint) and not attempted here.

GATE 1 is satisfied by the work already committed through WP1.7 —
nothing new to change or commit for the gate itself. Proceeding to WP2
(assemblies) per the queue.

2026-09-17 linear takeoff WP1.7 checkpoint (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
GROUND TRUTH v1. Two new goldens under `opentakeoff-corpus/ground_truth/linear/`
(`bessemer-m101.json`, `bessemer-p101.json`), hand-traced in the running
canvas's Linear tool (manual mode, not headless MCP calls) via a
Playwright-driven browser session against the rendered PDF, per the goal
document's GROUND-TRUTH AUTHORING RULE: traced from the render
(`mcp/scripts/graph-render.mjs --all`, whose output PNGs are sha256-hashed
and recorded in each golden's `render_hash` rather than committed —
regenerable, not a deliverable), scope decided and written into the JSON
before any engine ever runs on these sheets, annotator/date recorded, never
edited after the fact to match anything.

Before tracing either sheet, studied the whole-sheet render plus
`pdf.ts`'s `positionedText` text dump to find every size label and its
pixel position, so the run boundaries and per-segment sizes used for
tracing were established independently of the click coordinates — not
just eyeballed off a screenshot.

M101 (page 6, tier: development): both of the sheet's two supply-duct
trunks, one per first-floor heat-pump unit — Unit 103's (west, HP-1 to
Bedroom 1: 14.42 LF @ 12x6 + 17.27 LF @ 16x8 = 31.69 LF) and Unit 102's
(east, HP-1 to the Bedroom SR-1: 13.67 LF @ 16x8 + 15.12 LF @ 10x6 =
28.79 LF); combined 60.48 LF. Explicitly out of scope and recorded as
such in the golden: the round vertical branch/riser drops (6"ø/8"ø
stubs to SR-1/SR-2), the 4" EA exhaust riser, and the short Bedroom-2
14x3½ stub — none of those are the horizontal "supply mains" GATE 1
asks for.

P101 (page 3, tier: development): one representative domestic
cold-water (CW) distribution main — traced from its 1¼" origin at the
labeled water-service riser junction, through an explicit reduction to
1" nominal pipe size, to the corner where it drops into a branch riser
(4.25 LF @ 1.25" pipe + 14.71 LF @ 1" pipe = 18.96 LF). P101 is dense
domestic plumbing with no hydronic (HHWS/HHWR) piping anywhere on the
sheet; the parallel HW main and every SAN/V/branch run are explicitly
out of scope for this golden — WP1.7 asks for a representative run
here, not an exhaustive trace, and a broader pass is deferred to a
later ground-truth tier once WP3 has vertex/branch-level scoring to
justify the extra tracing effort.

Both goldens store the run in the same schema the app itself exports
(`opentakeoff.takeoff_canvas.v1`'s shape/`computed.run` shape, captured
via the canvas's own "Export takeoff…" after tracing) — `verts_norm`,
per-segment `lf`/`size`, `totals_by_size` — rather than a hand-typed
summary, so a future WP3+ bench can diff a traced run against these
verbatim. Nothing looked wrong during authoring (every traced segment's
size matched a label printed directly on the run before the click), so
no `LINEAR_BUG_CATALOGUE.md` entry — that file stays uncreated until an
actual STOP-worthy finding needs logging, per the authoring rule's own
"only if something looks wrong" condition.

No engine/source files touched in this step — ground-truth JSON only.
`node scripts/check-doc-links.mjs` clean; the WP1.6 checkpoint's own
regression numbers (web typecheck clean, 3265 tests/70 pre-existing
fails, bench/results.json and bench/linear/results.json unchanged) are
the still-current baseline since nothing in `web/src` or `mcp/src`
changed here.

2026-09-17 linear takeoff WP1.6 checkpoint (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
THE BENCH v1. New `web/bench/linear.mts` (npm run bench:linear) scores the
synthetic linear corpus on the three things that can actually regress in
MANUAL mode — parity (canvas == MCP), totals (computed LF against the
geometry's own analytic truth), and determinism (rotate90/translate/
reverse/scale2x) — deliberately NOT the full run-recall/precision/Fréchet/
vertex-F1 suite §2 of the goal document describes for the whole bench's
lifetime: that's WP3+'s trace-engine scoring, and has no meaning yet since
manual mode never "finds" a run — a person/agent supplies its points
outright, so there's nothing to score recall against. score.ts's own header
comment on the new functions says this explicitly, so nobody mistakes the
narrower v1 scope for an oversight later.

New pure functions in `web/bench/score.ts` (score.ts + linear.mts is the
goal document's own naming for this work item): `scoreLinearParity`
(structural equality between canvas's own resolveRunSegments call and
MCP's replied computed_run — ANY difference is a wiring bug, since both are
literally the one shared function, never a tolerance matter),
`scoreLinearTotals` (LF against analytic truth), `scoreLinearDeterminism`
(one transform probe), `aggregateLinear` (rollup). Tested in
test/benchScore.test.ts alongside the existing scorer tests, following the
one-file-per-pure-module convention already established there.

`web/bench/linear/synthesize.mts` (npm run bench:linear:synthesize, not
auto-run by the bench itself — like every other bench/corpus/*.json, the
corpus is a committed fixture, regenerated only when the case set changes)
generates ten synthetic duct/pipe-network PDFs with pdf-lib — real PDF
bytes, never hand-drawn — plus a truth JSON per case in the same
{pdf, page, scale, ptPerFt} shape bench/corpus/*.json already uses. Each
case's linework and its golden LF come from the SAME authored
feet-coordinates (corpus.ts's own truth-by-construction rule), drawn with a
seeded PRNG (mulberry32) so "random duct/pipe networks" stays reproducible.

The plan document's own "Appendix E" (cited as the source for the ten
hardest synthetic cases) is not checked into this repo and was not
available while writing this — noted here rather than silently guessed
past. The ten cases below are this session's own judgment call, built from
the goal document's own listed hard dimensions instead: pen weight
(thin/thick), dash pattern (dashed/dash-dot), double-line duct width
(offset parallel centerlines), label placement (inside/beside/leader),
a crossing (two runs through one bounding box, no shared vertex), and an
arc flattened to a polyline (a quarter-circle elbow approximated by 8
straight segments, matching the flattenCurve convention a curved Linear
trace already stores). Extend CASES in synthesize.mts as real hard cases
turn up — the file says so at its own header.

Caught and fixed before committing: the first draft's random walk could
wander into negative feet coordinates with no bound, drawing (part of) a
run off the page — visually confirmed by rendering a case to PNG via
pdfjs + @napi-rs/canvas (a throwaway check, not part of the deliverable)
and seeing most of the geometry simply absent. Fixed with a bounded walk
that reflects off a safe interior box instead of trusting the origin plus
a few random legs to stay on the page; re-rendered four cases (leader-line,
double-line, crossing, arc) to confirm every one now draws fully inside
the sheet.

THRESHOLDS (measured actual + margin, bench/run.mts's own rule, not chosen
for comfort): maxTotalsErrFt 0.03 — the real noise source is that
measure_line's length_lf and this bench's truth compute the same
real-number total via slightly different floating-point paths (Math.hypot
in px-space×upp vs directly in feet), which can disagree by a
rounding-boundary cent; measured max across regenerations of this ten-case
corpus was 0.02 ft, gated one more cent above that so a harmless
float-representation nudge at the boundary never trips it. maxDeterminismErrFt
0.03 — rotate90/translate/reverse are EXACT every time (a transformed
segment has the identical hypot length, so its rounded lf is identical
too; a nonzero reading from these three would mean a real bug, not noise);
only scale2x carries noise, since resolveRunSegments rounds EACH segment
to 2dp before totaling and rounding isn't linear — measured max 0.01–0.02
ft depending on which random corpus was live, gated with the same margin.
Verified the gate actually fails on a real breach (temporarily zeroed
maxTotalsErrFt, confirmed a real non-zero exit code, reverted).

CI: `.github/workflows/ci.yml`'s `web` job gained an `npm run bench:linear`
step plus a `git diff --exit-code -- bench/linear/results.json` gate,
modeled exactly on the existing #198 step for bench/results.json — an
engine change that moves a linear number now has to ship its own
results.json delta in the same PR. NOT wired into `npm run check` — the
goal document's own WP8.1 ("bench:linear joins npm run check") is where
that belongs, not WP1.6.

Verified: web typecheck clean; `npm run bench` (the existing flood-fill
bench) and `npm run bench:callouts`/`bench:batch` still run clean and
bench/results.json is byte-identical (confirming the score.ts additions
are purely additive); test/benchScore.test.ts green (30 tests, 8 new).
Noticed `bench/batch-results.json` drifts on every `npm run bench:batch`
run regardless of any change here — confirmed via git-stash comparison
against the untouched WP1.5 baseline (same drift with score.ts fully
reverted) — pre-existing non-determinism in that bench, unrelated,
uncommitted here. Full web suite run for a final regression signal before commit:
3265 tests, 70 fail — one fewer than the WP1.4/WP1.5 checkpoints' own
71-failure baseline, and the difference is exactly accounted for: the known
compileProgressWalkthrough CLI-subprocess flake (documented in both prior
checkpoints) didn't hang this run and passed outright, leaving the same
sync/cloud-storage/snapshot/BAS-restore cluster as the only failures, same
test names as before. Watched its real-PDF subprocess directly this time
(98%+ CPU, steady growth in both elapsed and CPU time) to confirm it was
genuinely computing rather than hung, instead of waiting blind. Nothing in
the failing set mentions linear/bench/score/parity/determinism/totals.

2026-09-17 linear takeoff WP1.5 checkpoint (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
MCP measure_line/edit_run. measure_line gains optional system/size/vertices:
require condition (they configure the committed shape's run block, refused
without one); when the resolved condition is routed (system or family set),
system/size seed from its own defaults exactly like TakeoffCanvas.jsx's
commitLinear — an explicit value here wins outright over the seed, never
merged with it (same "one wins" rule as measure_surface's height_ft).
vertices authors vertex_overrides (kind + optional dir) at explicit interior
indices — the first-ever writer of that field anywhere in the codebase (the
canvas's own vertex-glyph UI only ever reads it). The reply gains `run`
(the shape's authored block, when non-empty) and `computed_run` (the
resolved read, via the same resolveRunSegments call computeShapeMetrics
uses) — both fields, same names, on both measure_line's and the new
edit_run's replies, so a caller never sees `run` mean one thing on one tool
and something else on the other.

New `edit_run` verb (revise stage): patches an EXISTING linear shape's run
block after commit — the MCP equivalent of the canvas's right-click "Set
size..." segment menu, generalized to every AuthoredRun field. system/status
overwrite wholesale (null clears); segment_sizes/vertices patch BY INDEX (a
null size/kind clears just that one entry, mirroring TakeoffCanvas.jsx's
applySegmentSize exactly — every other index untouched, carried-forward
sizes recompute from whatever's left); params patches its three numeric
sub-fields the same way. Refuses a non-linear shape and a human-reviewed
shape (edit_shape's own doctrine, same wording). Reversible with undo_last
via the generic "edit" op (structuredClone(cur) before, restored verbatim —
no new undo case needed). Added to staging.ts's `revise` list; total tool
count 56 → 57.

Shape gained `run?: AuthoredRun` (session.ts) — previously only
`computed.run` existed there (WP1.4 didn't author one, only read an
imported project's). New shared zod schemas in web/src/lib/linear/types.ts
for MCP wire reuse: `runVertexKindSchema` (all 9 RunVertexKind values,
including "end" for output fidelity — input schemas exclude it via
`.exclude(["end"])` since an interior-vertex override can never be an
"end"), and `runSegmentSchema`/`runVertexSchema`/`computedRunSchema`
mirroring the ComputedRun/RunSegment/RunVertex TS interfaces one-for-one.

Tool-count sync (AGENTS.md's five places): check-tool-count.mjs --write
fixed its two tracked `<!--tool-count-->` markers (README.md,
docs/USER_GUIDE.md); README.md's own untracked "40 MCP tools" prose (stale
since #171-era, predating even WP1) converted to the same marker so it
can't rot silently again; mcp/README.md and docs/AGENT_GUIDE.md each had a
second untracked "55"/"Fifty-five" mention beside their tracked ones, fixed
by hand to 57. Added edit_run rows/mentions to mcp/README.md's tool table,
docs/MCP.md's Revise bullet, and docs/USER_GUIDE.md's Edit-and-audit group.
FEATURES.md's own long-stale "41 tools" line (pre-existing, outside
AGENTS.md's five places) is left untouched — flagged here, not fixed, to
stay in scope.

Found and worked around a real cross-package zod bug while wiring
size_overrides into the new authoredRunOutput schema: web/ and mcp/ each
install their OWN node_modules/zod (both resolve to 3.25.76, but
mcp/package.json still pins the older `^3.24.1` range, so npm's workspace
hoist never deduped them into one copy). z.record(keyType, valueType)'s
two-arg overload detection does an instanceof check on valueType; a schema
built by a DIFFERENT zod module instance (runSizeSchema, imported from
web/) fails that check silently, and zod falls back to treating the call as
single-arg z.record(valueType) — using the KEY schema (z.string()) as the
value type instead. Every real RunSize object then failed the reply's own
self-validation ("expected string, received object"). Isolated repro
confirmed z.union/z.array/.optional()/.exclude() all handle the same
cross-package schema fine — only z.record's overload detection is affected.
Fixed narrowly: `size_overrides: z.record(z.string(), z.unknown())` with a
comment explaining why and pointing at the real contract
(AuthoredRun.size_overrides in types.ts). NOT fixed at the root (aligning
mcp/package.json's zod range to web's and deduping) — that's a pre-existing
repo dependency-hygiene issue outside this task, flagged here as a
follow-up since the same failure would recur for any future
z.record(..., <cross-package schema>) composition.

mcp/test/linearParity.test.ts (new, 5 tests): TakeoffCanvas.jsx's
commitLinear/applySegmentSize can't be imported headlessly (React), so this
file reproduces their exact formulas inline (comments cite the source
lines) and drives measure_line/edit_run over a real client/server pair,
checking two things per case — the AUTHORED run block the tool wrote
matches what the canvas formula would produce for the same inputs, and
computed_run matches resolveRunSegments called directly on that same
run/points/scale. Covers: routed-condition seeding, an explicit value
winning outright over the seed, vertices authoring (asserts manual:true on
the resolved vertex), segment_sizes patch-by-index with carry-forward and
full-clear, and the refusal doctrine (non-linear shape, human-reviewed
shape — the latter via direct Session access, same idiom tools.test.ts
already uses since no MCP verb sets origin.reviewed itself).

Verification: mcp + web typecheck clean. staging.test.ts, tools.test.ts,
conformance.test.ts, linearParity.test.ts all green except conformance's
one already-documented pre-existing sheet_graph SMOKEY MOUNTAIN citation
failure. A full 85-file mcp suite run (~2h under heavy concurrent corpus
regression load) surfaced several more "not ok" lines beyond that one;
rather than assume, each distinct failure was chased down: T-HVAC-01,
T-VALVE-01, D04 (VAV scope-rollup), D09 (room HVAC coordination), and WP1
keyed compile acceptance (bldg5406/federal-mech/itd-d1-lab HVAC-total
mismatches) all reproduce byte-identically on the untouched WP1.4 baseline
via git-stash comparison — five independent confirmations, all in the same
frozen-truth/corpus-extraction drift category as the known SMOKEY MOUNTAIN
one, none touching anything WP1.5 changed. D05 and the federal-mech VAV
reconcile failure share the exact same error text/pattern as D09 and D04
respectively (same underlying cause, not independently re-verified).
vectorGridPackaging.test.mjs's packaging test fails because mcp/dist has
never been built in this container (`npm run build` was never run) — an
environment-state gap, not a code issue. safewrite.test.ts's "an unreadable
file fails CLOSED" test chmod 0o000's a file and expects a permission
refusal, which never happens running as root (root bypasses file-mode
checks) — also environmental, not code. One more failure
(rowsymBessemer.regression.test.mjs) was caused by killing that specific
subprocess myself after it hung for 1h49m with 20s of actual CPU time (the
same CPU-contention subprocess flake documented in the WP1.3/WP1.4
checkpoints, recurring under the full suite's resource pressure) — not a
regression. No failure in the full run touches any file this checkpoint
changed.

2026-09-17 linear takeoff WP1.4 checkpoint (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) —
additive outputs. conditionTotals gains a `sizes` field (one entry per
canonical RunSize key a condition's shapes carry, ×N and waste applied like
every other reported quantity, with a representative RunSize object per key
read off the first segment carrying it) — present only when at least one
shape has a sized `run` block, absent otherwise (verified: a plain trace
gains no new key at all). A new `linearRunRows(rows)` flattens that into
report rows; `reportJson` gains a `linear_runs` top-level block (mirrors
roll_goods' always-emitted, appended-last convention) wired into all three
export_report call sites (ReportPanel.jsx, mcp/session.ts's exportReport,
and TakeoffCanvas.jsx's agentExportReport — the last of these had never
wired roll_goods either, a separate pre-existing gap left alone, but
linear_runs is new code so it's wired correctly there too). mcp/outputs.ts's
exportReportOutput schema gained the matching `linear_runs` field, reusing
the already-shared runSizeSchema.

Moved `sizeLabel` out of canvasUtil.js into web/src/lib/linear/run.ts
alongside runSizeKey: canvasUtil.js pulls in React (PALETTE from
components/hatches.jsx) and three of WP1.4's consumers — xlsx.js,
markedset.js, dxf.ts — are all imported directly by mcp/src/session.ts or a
sibling (the shared-path doctrine), so a React import there would have
broken MCP's headless build. `isRoutedCond` stays in canvasUtil.js (only
ever used by TakeoffCanvas.jsx).

Per-size sub-rows now render under a routed condition's row in
TakeoffsPanel.jsx and as a new "Linear runs" section in ReportPanel.jsx
(gated on any project data at all — a pre-WP1.1 or non-routed project shows
neither); xlsx.js gains a sixth "Linear runs" tab, OMITTED entirely (not a
header-only sheet) when nothing is sized, so a pre-WP1.4 workbook's tab
count is unchanged. dxf.ts splits a linear shape's run into one LWPOLYLINE
per CONTIGUOUS same-size segment run, each on its own
OT-<TAG>-LINEAR-<SIZE> layer (colon-safe, uppercased); a run.segments length
mismatch against the shape's own edge count (stale data) falls back safely
to the single pre-WP1.4 entity rather than mis-slicing. markedset.js's chip
appends a uniform run's size ("SA-1 · 18.2 LF 12x6"); a mixed-size run
stays plain. revisions.js and snapshotDiff.js both gain a parallel
`sizeDeltas` field (added/removed/changed per size key) beside their
existing flat-field `deltas`, since conditionTotals' `sizes` is array-
shaped and can't join COND_FIELDS' single-number deltasOf.

Frozen-13 CSV untouched (report-csv-golden.test.ts unchanged, verified);
totals.test.ts's report.v1 top-level key-order assertion updated to append
linear_runs (the one test the plan item didn't name but needed touching,
same as roll_goods' own addition once did). 122 web tests + 122 mcp tests
green across every touched file (mcp's one failure is the same pre-existing
sheet_graph SMOKEY MOUNTAIN citation, unrelated, reconfirmed again here).

2026-09-16 linear takeoff WP0-WP1.3 checkpoint (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md):
WP0 hygiene — measureLine/measurePolygon/measureSurface/placeCount now stamp
origin.reviewed:false (B-L1; agent runs were landing as ink with no review
state); scaleWarningFor wired into measureLine/measureSurface (B-L2);
oneclick.ts's extractVectorGeometry additively captures per-segment setDash +
stroke RGB (B-L5); a load-time shape sanitizer heals measure_role/verts_norm/
computed on every hydrate path (B-L4); mepsystems.ts CONT/STAT tokens join
CONTROLS (real Weld p7 M-CONT-STAT layer); takeoffWorkflow.js re-routes LF/
duct-length/pipe-length goals to a new linear_run intent instead of
scale_refuse; README/FEATURES Curved-Line drift removed (USER_GUIDE never had
it, verified by grep before touching it).

WP1.1 manual sized runs — web/src/lib/linear/{types,run}.ts, imported
identically by shapeMetrics.js and by mcp/src/session.ts's Condition type
(the shared-path doctrine): resolveRunSegments derives per-segment LF/size and
per-vertex turn-angle/fitting-kind from an authored `run` block; a linear
shape with no `run` computes byte-identical to before. RunSize is a zod
schema (runSizeSchema) with the TS type as z.infer — one source of truth for
the MCP wire contract and the canvas type, mirroring the BAS contracts'
already-established define-once-in-web-lib pattern.

WP1.2 condition identity — family/system/size/assembly_id added to Condition
on both sides: canvasUtil.js's instantiateTemplate, plays.js's play
round-trip, mcp/session.ts's Condition + editCondition (+ edit_condition tool
schema, undo restore, export_takeoff round-trip). Purely additive — a
flooring/architectural condition never carries any of the four fields.

WP1.3 canvas Linear tool UI (TakeoffCanvas.jsx, one serialized pass, per the
goal's PARALLELISM rule): the 12' roll-width amber is suppressed for routed
conditions (isRoutedCond — plan §10.1: "does not apply to routed
conditions"); commitLinear seeds run.system/size_overrides[0] from a routed
condition's own defaults on every new trace; a new `run` shapeCommands.js
type (no provenance stamp, caller-supplied computed, same contract as
label/rollcut) backs a right-click "Set size..." popover on ANY linear
shape's segment (new SegmentSizeMenu.jsx component), independent of whether
the condition is routed. Vertex glyphs by kind render as a halo behind the
existing corner handle. Segment + intersection snap (buildSegGrid/
nearestPointOnSegments/nearestIntersection in geometry.js) sits beside the
existing endpoint snap, Linear-tool-only. Continue mode (default true,
matching the tool's actual pre-existing "stays armed after finishing" 
behavior byte-for-byte) can be turned off to leave the Linear tool after one
run; Escape also leaves once there is nothing left to cancel.

All of it verified live against the real Bessemer M101 sheet (dev server +
Playwright/Chromium, headless): a plain trace on the flooring condition CPT-1
measured 11.7 LF unchanged (regression); right-clicking a segment set 16x8,
the size carried forward to every later segment exactly per run.ts's rule,
and the MEASUREMENTS panel grew the matching per-segment sub-rows; a second,
cornered trace showed the elbow glyph rendering correctly once sized;
enabling Snap and hovering 11px off the M101 duct's real top edge snapped
exactly onto the segment, and hovering near the riser tee snapped exactly
onto the real intersection; turning Continue off and finishing a run
reverted the active tool to Select, matching the toggle's intent.

New/extended unit coverage, all green: geometry.test.ts (114, +14 for
buildSegGrid/nearestPointOnSegments/nearestIntersection/segIntersectionPoint),
shapeCommands.test.ts (35, +3 for the new `run` command type's round-trip),
measurementBreakdown.test.ts (+1 for per-segment rows), canvasUtil.test.ts
(+2 for isRoutedCond/sizeLabel). mcp side: conformance.test.ts gained the
family/system/size/assembly_id set/echo/undo/export-round-trip assertions
and two discriminated-union violation cases for edit_condition; its one
failure (sheet_graph SMOKEY MOUNTAIN citation) is pre-existing and unrelated,
confirmed via git stash before this checkpoint's own work began.

2026-09-13 installed-quantity reconciliation checkpoint: the shared
`sweepScheduleRow` / Agent reconciliation path no longer promotes bare exact
plan-tag text into installed quantity. It now retains text-only observations
separately, verifies surrounding vector geometry for production reconciliation,
and counts only geometry-grounded placements or explicit installation notes.
Mixed geometry/text evidence stays `AMBIGUOUS`; withheld candidates remain
review items. Focused typecheck and 113 reconciliation/sweep/Agent tests pass.

Real NAVFAC proof on the 75-page Cherry Point set: schedule mark
`CV-CHW-BP-A` resolves to the exact tag bbox on page 29 and a distinct vector
symbol at score 1.0 (`symbol_fingerprint`), installed quantity 1. After the
75-sheet / 91-table graph was cached, the complete CLI product replay took
**5.12 s**, with the actual tagged geometry match reporting **184.44 ms**.
The result is intentionally `tagged_only`: it proves this tag-to-symbol match
but does not claim a set-wide audit of untagged valve geometry. A separate
exhaustive one-row sweep remained at full CPU beyond ten post-index minutes and
was terminated; that path is not an acceptable interactive workflow. The fast
result therefore establishes the production architecture—local geometric
verification at every exact tag plus a separately bounded family-wide unlabeled
audit—without weakening any score, affine rule, bbox, or VectorGrid contract.
The Session disclosure was also corrected so sheets skipped for lacking the
exact tag are no longer falsely described as unscaled sheets that were swept.

2026-09-13 ITD D-1 generalization checkpoint: after the NAVFAC product-path
proof, the same literal Agent prompt **Run a BAS takeoff.** passed on an unrelated
29-sheet laboratory mechanical set in **15.682 s post-index** (**13.424 s
persisted**) under the 180 s ceiling. It returned 97 equipment records, 13 SOOs /
79 reader sections, one explicit SOO point candidate, 31 valves, 11 embedded-coil
gaps, 13 control schematics and 37 schedule/plan rows (36 match / one
schedule-only). No extractable point matrix exists in the source; the product
reports missing evidence rather than zero installed points. The `AC-1` match
opens distinct exact plan-page-25 and schedule-page-28 highlights. All 13
compiled sequences are now reader-accessible bodies with no heading-only item.

SHOULD THIS BE ON THE SHARED PATH? **Yes.** Wrapped SOO-title recovery,
bottom-caption source boundaries, font-run line assembly, terminal-word
continuations and hierarchical authored sections decide shared evidence truth
for browser and MCP. The fixes are in the shared narrative extractor; no
document name, sheet number or corpus identifier appears in production logic.
New human-reviewed truth
`ground_truth/sequences/itd-d1-lab-controls-m6.0.json` pins the exact source hash,
four M6.0 titles, required body phrases and adjacent-lane/legend negatives.
Sequence coverage is green at five documents, 18 positive pages, five negative
pages and 27 expected SOOs. All BAS drawing gates pass. Full web verification is
green at 3,144 tests / 3,131 passed / zero failures / 13 expected skips, typecheck, lint with
three existing warnings, every benchmark and production build.

Honest ceiling: ITD still reports 497 unresolved diagram crossings and 38
unmapped instrument labels; its diagram results are evidence inventories, not
principal-engineer semantic graphs. The takeoff stays human-review-required.
No VectorGrid/table/bbox/citation contract, symbol recognizer, pricing, costing
or labor logic changed. Continue broader real-set product-path validation and
deeper grounded diagram/SOO reconciliation; the separate symbol-recognition
work remains outside this coordinator's current phase.

The same product path also passes two more structurally different
sets. Tinker AFB (31 sheets) completes in **15.664 s post-index** with five
reader-accessible building SOOs / 65 sections and correctly refuses to fabricate
equipment or quantity from a controls-only source. Federal Attachment 4 (24
sheets) completes in a final **16.964 s post-index** replay with 128 equipment records, three
point matrices / 26 rows, 12 SOOs / 132 sections, 13 schematic inventories, one
riser/flow diagram, and 99 reconciliation rows (95 match / four schedule-only).
Its `AHU-1` plan and schedule actions open distinct exact highlights and a
simultaneous high-resolution evidence reader; all 12 SOOs
are body-detected and the dense 69-clause AHU reader excludes the adjacent LEED
sequence. Both runs have zero browser/console errors and preserve human review.
Receipts and screenshots are retained under
`opentakeoff/docs/bas-production/evidence/complete-bas-agent-{tinker,federal}-current/`.

Federal's human-reviewed schematic truth now covers all 13 authored diagrams on
M8.3, M8.4, M8.7 and M8.8. Shared drawing-row partitioning recovers previously
clipped `DPT`, `L-7` and `SW-1` evidence, and bounded system-family agreement
binds `BOILER SYSTEM - CONTROL DIAGRAM` to the exact `HEATING HOT WATER SYSTEM -
SEQUENCE OF OPERATION`. Competing heating-water sequences remain ambiguous and
an unrelated chilled-water sequence remains unbound in negative controls. The
real one-prompt Agent receipt enforces the same binding. This is still an
evidence inventory: 1,061 unresolved crossings, 16 unmapped instrument labels
and three unresolved sequence bindings remain visible for estimator review.

2026-09-13 complete-BAS Agent/control binding checkpoint: the unmocked browser
Agent completed the literal prompt **Run a BAS takeoff.** on the 75-sheet NAVFAC
Cherry Point source in **37.673 s post-index**. It retained separately labeled
equipment, point-list, SOO, valve/coil-gap, diagram and reconciliation records;
exact source navigation and exports pass; release remains human-review-required.
The invalid mixed `942 EA` display is removed. Proof and four screenshots are in
`opentakeoff/docs/bas-production/evidence/complete-bas-agent-navfac-final/`.

SHOULD THIS BE ON THE SHARED PATH? Shared diagram/SOO truth and the MCP result
contract are shared; UI labels remain surface-only. New reviewed truth
`ground_truth/control_schematics/navfac-control-sequence-bindings.json` pins the
source SHA, nine horizontal drawing-field schematic titles, seven exact sequence
bindings and two honest unbound cases. Rotated title-block copies, generic
schematics and adjacent project-word collisions are negative controls. Existing
ITD schematic, multi-document narrative, Transbay riser, Norfolk piping-state,
NAVFAC/LBNL network gates pass. The full cold shared NAVFAC graph retains nine
schematics, one network/riser-flow diagram and the expected seven bindings.

Honest ceiling: this is evidence inventory, not verified engineering topology.
NAVFAC retains 1,359 unresolved crossings, 59 unmapped instrument labels, two
unresolved sequence bindings and zero verified semantic graphs. MI731's unheaded
SOO remains undiscovered; MI732's sequence is outside the uploaded mechanical
source. Installed count remains dependent on grounded plan evidence and the
separate symbol-recognition work explicitly excluded from this coordinator's
current scope. No VectorGrid/table/bbox/citation, symbol, pricing, costing or
labor code changed.

Final gates: web full check passes; MCP passes 132 BAS + 33 revision + six issue
+ 17 scope/snapshot tests, typecheck and four packaging tests. Broad concurrent
MCP conformance/corpus run: 304 pass, 113 missing-fixture skips, one unrelated
60 s `detect_rooms assign mode` timeout under corpus CPU contention; the exact
case passed alone in 23.494 s. Active goal continues after this merge toward
generalized unheaded narrative discovery and deeper diagram evidence, without
entering the separate symbol recognizer.

2026-09-10 after local checkpoint **b188b6b7**: browser-only atomic snapshot
storage implemented and focused-tested; no extraction/VectorGrid/math change.
Sources, exact payload/record, metadata, seal and retry identity publish together,
with saved-generation/payload checks and project/disposal isolation. Shared
verification remains authority. **80485 exit 0**: 47 related tests; **93938 exit 0**:
14 storage tests. Full web **88334 exit 0**: 2,907 pass / 13 skips, all checks.
Native Chrome **14632 exit 0**: controlled save/page-reload/reopen/corruption test,
strict durability hint; not a real-PDF/public UI proof. Final **67324 exit 0**:
web/MCP-packaging/scope/Python gates pass. **57481 exit 0** after final source-size
guard: all 2,908 web tests pass / 13 skips, types/lint/build and native Chrome
save/reload/reopen/corruption proof. All handles terminal.
See `opentakeoff/docs/bas-production/SNAPSHOT_STORAGE_PROOF.md`. Combined snapshot
memory gate still fails. Continue actual UI approval/reopen and remaining original,
Agent/identity, corpus/holdout and final-symbol gates. No blocker or deployment.

2026-09-10 after **b6249700**: shared history validation reuses privately owned
equipment/assembly source context without skipping events or integrity checks.
Full historical-view parity **9227 exit 0**; eight new regression tests. Latest
combined snapshot probe **27046 exit 1**: 2.616 s prepare / 3.079 s reopen, all
31 actual-Python calculations and exact original preserved. Memory still fails:
648,708,096 bytes against the unchanged 512 MiB limit. Serializer prototype rejected;
no extraction/VectorGrid/symbol/bbox/math/canonical-schema change. Full web
**34523 exit 0**: 2,892 pass / 13 skips, types/lint/benchmarks/build. MCP **41130
exit 0**: all applicable BAS/revision/issue/scope/packaging/tool gates pass. Python
**66195 exit 0**: 453 pass, mypy 20 files. All handles terminal.
See `opentakeoff/docs/bas-production/REGISTER_VERIFICATION_PROOF.md`. Continue
atomic snapshot storage/public journey while retaining the memory gate, then
Agent/unique-point and all original/corpus/holdout/final-symbol acceptance. Goal
active, no external blocker or deployment; no new corpus score claimed.

2026-09-10 after **ac879e3e**: snapshot/archive core is in progress, not public
production approval. Shared creation/reopening requires exact original bytes,
actual Python replay and full readiness; v1 unapproved backups remain distinct.
No VectorGrid/extraction/symbol/bbox/Python arithmetic edits. **Web 57886 exit 0**:
2,884 pass / 13 existing skips, types/lint/bench/build. New source-backed snapshot
probe preserves the original and all 31 calculations but fails its separate
512 MiB incremental-RSS gate (latest 711,458,816 bytes); don't hide that behind
the existing green readiness benchmark. Full MCP **84419 exit 0**: types, 128 BAS +
33 revision + six issue + 17 scope/snapshot + four packaging + 122 tool/safe-write
tests, existing budgets and metadata pass. Python **59068 exit 0**: 453 pass /
zero skips; mypy 20 files. All test/probe handles terminal. Local checkpoint only,
not a completed snapshot feature; no push/merge/deploy. Full ledger:
`opentakeoff/docs/bas-production/SNAPSHOT_CORE_PROOF.md`. Next: reduce allocations,
atomic snapshot storage and public approval/reopen, Agent/point-identity and
remaining original/final-symbol gates. Goal active, no external blocker.

2026-09-10 after **6192c488**: internal shared scoped-readiness implementation
verified; no extraction/VectorGrid/symbol/bbox/Python math change. Shared scope
replay, explicit coverage/mapping, original-byte verification, actual Python
replay and dependency freshness remain independent gates. No approval is created.
**Web 95900 exit 0:** 2,872 pass / 13 existing skips, types/lint/bench/build; same
three warnings/four documented One-Click limitations. Readiness **3.858–4.063 s /
469,352,448-byte incremental RSS**, below predeclared 10 s/512 MiB. **MCP 6178
exit 0:** types, 128 BAS + 33 revision + six issue + 16 scope/readiness + four
packaging + 122 tool/staging/safe-write tests, benchmarks and 53-tool metadata.
**Python 91952 exit 0:** 453 pass / zero skips, 12.24 s; mypy 20 files. No live
test handle remains. Proof/failure ledger: `opentakeoff/docs/bas-production/READINESS_PROOF.md`.

This is not yet public approval/snapshot or a complete conversational BAS takeoff.
The browser Agent lacks the new workflow operations; assigned-point calculations
still always retain unresolved unique-identity/project-total flags. These gaps
are now explicit in the acceptance plan, not waived. Continue public readiness /
explicit approval / source-inclusive snapshot/reopen, supported identity and
Agent-driven draft integration, all remaining A–D and final corpus/holdout gates,
then appended researched symbol/installed-plan work. No new corpus/holdout score
or public-walkthrough claim; historical non-green baseline retained. Goal active,
no blocker; local commit only, no push/merge/deploy/publication.

2026-09-10 after **371ec826**: public Scope & coverage is implemented and verified
for a local feature-branch commit. Shared catalogs/mapping preparation and the
existing journal power UI/MCP; no extraction/VectorGrid/symbol/math change.
**Web 73663 exit 0:** 2,862 pass / 13 existing skips / zero failures, types/lint/
bench/build. **MCP 36909 exit 0:** types, 128 BAS + 33 revision + six issue + 11
scope + four packaging + 122 tool/staging/safe-write tests and benchmarks.
**Python 45740 exit 0:** 453 pass with packaging enabled; mypy 20 files.
Unpublished metadata **0.9.78 / 53 tools**; scope suite in normal BAS gate.

**Browser 43229 exit 0**, `scope-browser-7`: ordinary original upload/import,
populated scope/exclusion, whole-page and exact VFD source inspection, draft
return, keyboard save, mapped/conflicting span reviews, withdrawal/export/reload;
five events, zero browser errors, **0.944–4.262 s**. All 24 theme/viewport images
and two original-source views inspected. **Packaged MCP 6167 exit 0**, `scope-mcp-2`:
browser/shared original parity, actual public unrelated/related edits, proposal/
retry/stale rejection, complete export and new-process recovery; **1.734–2.227 s**.
Failure ledger and exact boundaries: `opentakeoff/docs/bas-production/SCOPE_COVERAGE_PUBLIC_PROOF.md`.
Nine claims/26 reference candidates are not automatic coverage accuracy. No new
corpus/holdout evaluation or full BAS-production claim; old baseline retained.
Readiness, selective approval, approved snapshots, remaining A–D and final
corpus/holdout gates precede the appended symbol/installed-plan phase. Goal active;
no blocker, push, merge, deployment or publication.

2026-09-10 checkpoint after **7751d132**: internal shared `bas_scope_10` journal
retains exact scope/coverage decisions and append-only withdrawal, with historical
replay, selective currentness and overlapping-conflict disclosure. Human review
cannot waive existing BAS findings. Previous persistence/editor paths retain the
additive data. No extraction, VectorGrid, symbol or Python production math change.
Public scope/coverage review and actual readiness/approval remain unfinished.

Final **web 4354 exit 0: 2,852 pass / 13 existing skips**, types/lint/bench/build;
same warning/known-fail controls. Final **MCP 12331 exit 0: types + 10 pass**, with
actual Python replay, unknown demand and failure preservation. Full-gate internal
operations **1.690–3.071 s / 96,059,392-byte incremental peak RSS** under 5 s/512 MiB.
Real-original backup **86100 exit 0** retains original 924,578-byte PDF and full
workflow/decision replay. Details, failed harness attempts and current limits:
`opentakeoff/docs/bas-production/SCOPE_COVERAGE_JOURNAL_PROOF.md`.

Next: populated public coverage/scope choices, UI/MCP integration, readiness,
selective approval and approved source-inclusive snapshot/export/reopen. Preserve
all remaining A–D and final corpus/holdout gates before the appended symbol phase.
User requires substantial automation with human exception review, not manual
reconstruction. Active, no blocker; no new corpus/holdout or public-walkthrough
claim; no push/merge/deploy/publication.

2026-09-10 checkpoint after **c1a7fcea**: added the internal shared deliverable
scope/exclusion compiler, preserving the original inventory, citations, saved
quantities, unknowns and stale dependencies. Explicit report exclusions cannot
remove required assignment members or connected engineering resources. Selective
content fingerprints respond to relevant changes, not unrelated register edits.
No extraction/VectorGrid/symbol/Python math change; no public scope/approval UI or
MCP feature is claimed. Coverage, issue/readiness, approval and durable release
remain unfinished main-goal work, not replaced by this internal foundation.

Final **web 5760 exit 0: 2,835 pass / 13 existing skips**, types/lint/bench/build;
same three warnings, four legacy One-Click known-fails and build notices. Final
**MCP 15294 exit 0: typecheck and 8 pass**, including actual Python shared-pool
addition, excluded failure retention, assigned-demand/empty-result boundaries
and existing production compile/restoration parity. Real-retained preview
**832.851–836.404 ms / 31,391,744-byte incremental peak RSS**, under predeclared
5 s/512 MiB limits. No new corpus/holdout or full Python-suite run; no new public
browser/packaged-MCP walkthrough. Details in
`opentakeoff/docs/bas-production/DELIVERABLE_SCOPE_PROOF.md`.

Next: actual saved scope/coverage decisions, shared readiness, public integration,
selective approvals and source-inclusive approved snapshot/export/reopen, then
remaining A–D acceptance/final corpus gates. The user's appended deep symbol /
installed-plan phase remains last. Active, no blocker, no push/merge/deployment.

2026-09-10 checkpoint after **c0a3ac8e**: completed exact SOO issue-to-clause,
region/comparison and page navigation, plus an internal bounded source-accounting
reader. This is surface-only selection over unchanged shared discovery/review;
no VectorGrid, symbol, Python math, source coordinates or MCP contract changes.
Historical targets do not select current namesakes; drafts and full exports stay
intact. Coverage/applicability decisions and approvals are **not** implemented by
the reader. Main five workflows still precede appended symbol research.

Final web **67500 exit 0: 2,825 pass / 13 existing skips**, types/lint/bench/build;
same three warnings, four disclosed legacy One-Click known-fails and build notices.
MCP **46682 exit 0: types + ten issue/transport/project-review tests**. Actual
browser **97898 exit 0:** real PDF/import, exact original M-512 source bbox,
keyboard/draft return, form-created comparison, 1,185 unassigned spans paged 50
at once, both themes/three sizes, complete export/reload; zero browser errors,
**1,022–1,047 ms** routes. Final screenshots inspected after rejecting an early
render-incomplete capture. Proof: `opentakeoff/docs/bas-production/ISSUE_ROUTE_PROOF.md`.
No new full corpus/Python/holdout result claimed for UI-only changes. Next:
coverage/applicability and exclusions, selective approvals and positive approved
snapshot/export/recovery, remaining A–D and final corpus/holdout gates, then the
researched symbol/installed-plan extension. Goal active; no blocker or completion
claim. No push/merge/deployment/publication.

2026-09-10 checkpoint after **f70eda16**: shared BAS issue decisions are exposed
in Review & changes and `bas_issue_review` (local 0.9.77, 52 tools). Guarded
observations/correction-start, exact historical replay, changed-input absence and
withdrawal preserve all original evidence/blockers. Actual real-PDF browser
correction/export/reload and packaged MCP source/replay/export/new-process recovery
pass. Browser **2.117–2.964 s**, MCP **1.032–1.381 s**; controlled scope edits, not
installed truth. Web **2,823 pass / 13 existing skips**, MCP **128 BAS + 33 revision
+ six issue + four packaging + 122 tool tests**, Python **453 with packaging
enabled**, mypy 20 files. Existing warnings/legacy known-fails stay disclosed.
Shared issue benchmark **0.884–1.159 s / 523,632,640-byte** incremental RSS passes
unchanged budgets. No VectorGrid/extraction/symbol/Python-math changes and no full
corpus or holdout run. Exact proof/failed-candidate record:
`opentakeoff/docs/bas-production/ISSUE_PUBLIC_PROOF.md`.

Original main goal remains active: remaining exact corrective routes, coverage/
applicability/exclusions, selective approvals and positive approved snapshots,
remaining A–D/final corpus gates. The deep symbol/installed-plan research remains
the final add-on, never a replacement. No push, merge, deploy or publication.

2026-09-10 checkpoint after **bb2df22c**: internal shared BAS issue decisions
(`bas_issues_9`) retain exact observations/corrections/withdrawals and replay old
findings after edits and canonical backups. No blocker dismissal or approval.
Old writers and JSON/IndexedDB/evidence ZIP preserve the journal. Common async
verification owns nested metadata; bounded prerequisite reuse retains all checks.
**Final 34704 exit 0:** web 2,821 pass / 13 existing skips; MCP 128 BAS + 33
revision + two issue + four packaging + 122 tool tests pass, 51 tools; Python
452 pass / one packaging skip, mypy 20 files and enabled packaging test pass.
Failed memory experiments are retained. Final repeats plus integrated gate:
0.838–1.124 s, peak incremental RSS 521,912,320 bytes within unchanged 512 MiB.
10,000-event lineage: 128.279 ms / 33,325,056 bytes. No full corpus/holdout run,
VectorGrid/symbol/math change, trained models or commercial scope.
Proof: `opentakeoff/docs/bas-production/ISSUE_DECISION_PROOF.md`.
Next: expose issue actions through existing UI/shared MCP, then approvals and
approved snapshots plus remaining BAS gates. Original five-workflow goal remains
first; appended symbol/installed-plan research remains last. No production-
complete claim or external push/merge/deploy/publish.

2026-09-10 checkpoint after **01094715**: fixed shared BAS finding identity across
canonical backup. The retained real source workflow had **236/456** occurrences
change solely with object-key order; failed-first regression now gives **0/456**.
Explicit header order and every original finding/value/bbox are retained,
narrative span order unchanged; projection rule `saved_bas_findings_2` is explicit.
**Web 2,806 pass / 13 existing skips; MCP 128 BAS + 33 revision + four packaging +
122 staging/safe-write/tool tests pass; Python 452 pass / one packaging skip,
mypy 20 files and enabled packaging test pass.** Existing warnings/legacy
benchmark failures remain disclosed. Real-PDF browser and normal canonical-backup
import/export both preserve all 456 findings, source links, state and originals;
zero browser errors, final first-open 4.241 s. Shared reads 3.059-3.336 s under
5 s / 512 MiB. Proof: `opentakeoff/docs/bas-production/FINDING_IDENTITY_PROOF.md`.
**Main goal active:** issue-decision journal/corrective routes, selective
approvals/approved snapshots and remaining A-D/corpus/holdout gates next.
Appended deep symbol/installed-plan phase remains last. No extraction, VectorGrid,
Python math, symbol, key/scorer, model, costing/labor or external changes;
no new full-corpus score or holdout inspection claimed.

2026-09-10 checkpoint after **b942b4f7**: public pinned BAS revision comparison
now runs through one Python-backed service from browser and existing MCP tool.
Actual browser source/import → comparison/pairing → save/reload/replay/export
passes, with bounded dense tables and retained original citations. Built MCP
restores all 31 saved calculations, exactly matches the 698-row browser report,
opens originals without activation, records/retries and recovers in a fresh process.
Fixed a reproduced backup-key-ordering report mismatch by canonical ordering of
exact evidence references (`bas_revision_inventory_2`); values, quantities and
bboxes unchanged. UI unresolved-filter regression also fixed without domain edits.
**Web 2,804 pass / 13 existing skips; MCP 127 BAS + 33 revision + four packaging +
122 tool/safe-write/staging pass; Python 452 pass / one packaging skip, mypy 20
files and enabled packaging test pass.** Existing warnings/failures remain disclosed.
Final browser compare/reopen 5.372–5.709 s, durable save 12.301 s under the unchanged
8/15-second gate; serial shared comparison/save/reopen 3.967–4.322 s under 6 s.
Proof: `opentakeoff/docs/bas-production/REVISION_PUBLIC_PROOF.md`.
Controlled reordered pages, not an issued addendum or installed-count proof.
**Main goal remains active:** issue decisions, selective approvals/snapshots and
A–D/final corpus/holdout gates next; appended symbol/installed-plan work last.
No full corpus rerun, holdout opening, extraction/symbol/VectorGrid/math algorithm,
key/scorer, model, costing/labor, push/merge/deploy or external changes.

2026-09-10 checkpoint after **b7563f9a**: internal shared comparison journal
(`bas_revision_8`) saves exact pinned source/decision/correspondence and report
identity; save/reopen rerun Python-backed comparison. Actual IDB/JSON retention,
all old write paths, exact retry, tamper/fork/ownership rejection and cancellation
are tested. **Web 2,800 pass / 13 existing skips; MCP 127 existing BAS + 26
comparison/journal + four packaging tests pass; Python 452 pass / one packaging
skip, mypy 20 files and separately enabled packaging test pass.** Final retained
prepare/save/reopen **4.062–4.170 s**, **245,071,872-byte incremental peak RSS**;
unchanged history/inventory/comparison gates pass. Same-basis retained evidence,
not real issued-addendum or public comparison proof. See
`opentakeoff/docs/bas-production/evidence/revision-journal-1/proof.json`.
No extraction/VectorGrid/symbol/math, keys/scorers, holdout or external changes.
Original goal remains active: next public revision UI/MCP, issue decisions,
selective approvals/snapshots and A–D final gates; appended researched symbol /
installed-plan work stays last. This internal checkpoint does not finish E.

2026-09-10 checkpoint after **34aeaffa**: internal shared BAS revision comparison
now retains explicit item correspondence, original/declared-field changes, source
and dependency boundaries, unknown quantities and compatible measure/membership
reviews. Python validates point cells, replays selected saved records and computes
exact comparable deltas. Reproduced/fixed unlike-variable subtraction, reused-UUID
membership changes and engineering ID-only false changes across 11 families.
**Web 2,793 pass / 13 existing skips**; Python **452 pass / one packaging skip**,
mypy **20 files**; MCP types, **127 prior BAS + 19 new comparison + four packaging
tests pass**, plus separately enabled Python packaging parity. Complete retained
comparison **4.217 / 4.171 / 4.149 s**, **172,523,520-byte incremental peak RSS**,
496 rows / 175 comparable values, under predeclared 6 s / 512 MiB. Existing gates
remain unchanged. Proof and limitations:
`opentakeoff/docs/bas-production/evidence/revision-comparison-1/proof.json`.
No extraction/VectorGrid/symbol/old-math/key/scorer, holdout, push/merge/deploy change.
No public comparison or full-corpus completion claim. Next correspondence journal
and UI/MCP integration, issue decisions, approvals/snapshots and A–D final gates;
then appended researched symbol/installed-plan phase. Original goal stays active.

2026-09-10 checkpoint after **c2685089**: shared pinned revision-side inventory
implemented and verified, without extraction/VectorGrid/symbol/math changes.
Old decisions keep their exact original sources when newer equipment/component
bindings change; quantities retain unknown/attribute/basis and Python-replay
distinctions. **Web 2,783 pass / 13 existing skips**; MCP types, **127 BAS + four
packaging tests pass**. Real retained Fort Sam/controlled-hardware inventory has
496 items, final **2.997 / 3.030 / 2.961 s**, **77,725,696-byte incremental peak
RSS**, under predeclared 5 s / 512 MiB. Existing history/journal gates pass.
Details: `opentakeoff/docs/bas-production/REVISION_IMPACT_CONTRACT.md` and progress.
Internal inventory is not complete comparison, approval, fresh source/Python
verification or installed truth. Next item correspondence, semantic/comparable
quantity impact, issue decisions, selective approvals/snapshots and A–D final
gates, then appended researched symbol/installed-plan phase. Goal active; no
new full corpus/holdout, public comparison walkthrough, key/scorer changes or
push/merge/deploy. Existing warnings/baseline failures remain disclosed.

2026-09-10 checkpoint after **79868930**: shared page correspondence now has the
public **Review & changes → Drawing changes** editor and history-only MCP
`bas_drawing_review`. Existing evidence/counts remain unchanged; recording is
page accounting, not approval or semantic/quantity impact. Browser real-original
plus controlled reordered-page walkthrough passes draft/source return, explicit
pairing, six layouts, durable save/reload/export. Packaged public MCP restores that
history, records duplicate delivery without increasing pages, views exact originals
and exports/restarts. Controlled revision/hardware inputs are disclosed.
Final web **2,771 pass / 13 existing skips**, MCP types, **126 BAS + 4 packaging +
107 staging/public-tool tests pass**. Existing history and journal performance
gates pass unchanged; browser save measured **8.423 / 8.446 s** (baseline, not a
speed claim). Initial test-fixture ordering and tool-description failures were
fixed without weakening tests. Details: `opentakeoff/docs/bas-production/PROGRESS.md`
and `DRAWING_CORRESPONDENCE_CONTRACT.md`. Semantic/quantity comparison, issue
decisions and approved snapshots remain next, then A–D corpus/holdout gates and
the appended researched symbol/installed-plan phase. Goal active; no extraction,
math, thresholds, keys/scorers, holdout access, full corpus run or push/merge/deploy.

2026-09-10 checkpoint after **63658a35**: shared drawing-correspondence foundation
implemented (`bas_review_7`). Explicit source sets and complete reciprocal page
accounting preserve old evidence; unresolved revisions publish no complete set.
Partial addenda do not silently delete pages; retained text equality is not an
ink/quantity claim. Existing edits and merges retain or reject conflicting journals.
**17 focused pass**; final web **2,771 pass / 13 existing skips**, typecheck/lint/
build and unchanged history gate pass. MCP types, **119 BAS + 4 packaging/proof**
tests pass. New predeclared 1,000-page/100-revision journal benchmark: **50.182 /
43.148 / 33.095 ms**, **149,536,768-byte incremental RSS**, under 2 s / 256 MiB.
Retained real-PDF history IDB/JSON round-trip is verified; controlled revision
cases are not real addenda or a public UI/MCP revision walkthrough. See
`opentakeoff/docs/bas-production/DRAWING_CORRESPONDENCE_CONTRACT.md`.
Next public editor/MCP delivery, semantic/quantity comparison, issue decisions,
selective approvals/snapshots, remaining A–D corpus/holdout gates, then final
researched symbol/installed-plan work. Goal active; no extraction/math/scorer/key
change, holdout access, full corpus run, push, merge or deployment.

2026-09-10 checkpoint after **4119b0db**: synced evidence ZIP restore now coordinates
with active sync operations and other same-scope browser tabs. Local adoption and
remote ancestry are atomic; pending restore generations survive offline/restart.
Existing shared history/import/replay rules are reused; no extraction change.
Final web **2,754 pass / 13 existing skips**, **94 focused pass**, MCP **119 BAS**
and **3 packaging** pass. History benchmark stays under unchanged 5 s budget.
Actual Fort Sam ZIP / Python 31-record replay / folder-composite OPFS / second-tab
wait-cancel-retry / source-reader / reload proof passes; eight screenshots inspected.
Local restore including replay/wait **24.682 s**, through annotation sync **27.076 s**.
No live cloud or real addendum claim. Private-context 551 MB capacity failed quota
(clean rollback; memory budget also exceeded); ordinary isolated profile passes
same bytes, **10.249 s / 1.106 s**, **2,109,784,064 bytes RSS < 2 GiB**, narrow margin.
Both outcomes and differing profile modes are disclosed in
`opentakeoff/docs/bas-production/SYNC_RESTORE_CONTRACT.md`.
Main goal remains active: journal recovery UX, drawing correspondence, scoped
approvals/snapshots, A–D corpus/holdout gates, then appended symbol/installed-plan
phase. No full corpus/holdout or standalone Python rerun, no new accuracy claim,
no VectorGrid/table/cite/bbox/math/key/cost/labor change, no push/merge/deploy.

2026-09-10 checkpoint after **7692b78b**: fixed a reproduced sync history loss
(three BAS captures became two under whole-object remote-wins). Shared retention
and lineage now govern known BAS histories in sync; incompatible branches stay
unmerged with a durable notice and exact remote recovery export when available.
Final web **2,742 pass / 13 skips**, **85 focused pass**, MCP **119 BAS + 4 packaging
pass**, types/build green. Unchanged five-second serial history benchmark:
**3.286 / 3.184 / 3.162 s**. Initial parallel timing failure is documented.
Real Fort Sam app + actual folder composite over origin-private files passes
controlled review conflict, recovery download, reload and retry; six final
screenshots inspected. No live cloud/OS-sync or real addendum claim. Details:
`../opentakeoff/docs/bas-production/SYNC_HISTORY_PROOF.md`.

Synced ZIP restore remains gated pending in-flight/cross-tab/write-bookkeeping
coordination. Provider revisions are read-then-write, not server CAS. Main A–E
goal, journal recovery, drawing correspondence, scoped approvals and remaining
corpus/untouched-holdout gates remain active; symbol/installed-plan extension
stays last. No new full-corpus score, extraction/math/scorer/model change,
holdout access, push, merge or deployment.

2026-09-10 checkpoint after **a23054ec**: public MCP source-inclusive restore now
uses the shared merge/replay contract and actual Python, retains all original
versions plus prior state, preserves browser-only payload fields and reopens exact
citations without activating historical PDFs. Built public real-PDF proof passes
empty and populated Sessions plus process restart/disk recovery; all **31 saved
calculations** replay. Final commit times 15.205 / 19.727 / 15.090 s. See
`../opentakeoff/docs/bas-production/RESTORE_MCP_PROOF.md` for full timings and limits.
Full web **2,731 pass / 13 existing skips**, MCP BAS **119 pass**, broader MCP
**51 pass** (overlapping), packaging **4 pass**, types/tool-count green.

Found and gated an accidental local-restore inheritance in folder/Microsoft 365
sync composites. Actual sync coordination remains next, followed by journal UX,
drawing correspondence, approvals and remaining A–D corpus/holdout acceptance.
Appended symbol/installed-plan phase stays last. This is verified delivery/recovery
progress, not a new full-corpus score or completion of the main goal. No extraction,
math, key, threshold, model change, holdout access, push, merge or deployment.

2026-09-10 checkpoint after **01e9b3a4**: actual browser-local source-inclusive
restore passes the real Fort Sam journey (31 saved calculations replayed by
Python, exact history/original reopened after reload) and the controlled 551.1 MB
storage gate. Shared merge/replay/source gates; atomic chunked originals, payload,
prior-state journal and save generation. No historical PDFs enter active counting.
Full web **2,730 pass / 13 existing skips**, no failures; 13 new restore tests.
Capacity **10.953 s**, sampled Chrome RSS **2,052,210,688 bytes** under unchanged
30 s / 2 GiB limits. See `../opentakeoff/docs/bas-production/RESTORE_BROWSER_PROOF.md`.
Main goal is not complete: public MCP/sync restore, journal recovery UX, drawing
correspondence, approvals and A–D corpus/holdout acceptance still precede the
appended symbol phase. No VectorGrid/math/key/threshold change or new corpus claim.

2026-09-10 checkpoint after **4b1c7595**: per-editor browser save fencing now
refuses obsolete generations and expected-state sync races without changing
extraction/math. DB v4 preserves old records and rejects v3 blind-writer builds.
Actual canvas two-tab test preserves/export-recovers unsaved work and allows
fresh saves after explicit reload; its replacement is a **controlled IDB
transaction, not implemented ZIP restoration**. **83 focused pass**; full web
**2,717 pass / 13 existing skips**, final types/lint/build pass; MCP **107 BAS +
4 packaging pass**, types pass. Zero page errors and unchanged complete Fort Sam
BAS history/source bytes. See
`../opentakeoff/docs/bas-production/ANNOTATION_GENERATION_PROOF.md`.
Main goal remains active: implement actual atomic source-inclusive restore and
sync coordination next, then revision/approval and remaining A–D acceptance;
appended symbol/installed-plan phase stays last. No new full-corpus or holdout
result, VectorGrid/key/threshold change, push, merge or deployment.

2026-09-10 checkpoint after **628f047c**: original-source reopening now uses one
shared ownership/hash/page/frame contract in the browser and packaged MCP. Old
citations can open retained bytes without adding historical PDFs to active
extraction. Existing live-sheet source navigation remains unchanged. Full web
**2,702 pass / 13 existing skips**, final **19 focused** source/storage tests;
BAS MCP **107 pass**, broader MCP **155 pass**, packaging **4 pass**; Python
**443 pass**, configured mypy **19 files**. Actual Fort Sam UI/built MCP compare
the same page-8 original source and reject a newer namesake/corrupt bytes with no
history or annotation changes. Prior live-citation UI regression also passes.
See `../opentakeoff/docs/bas-production/SOURCE_VIEW_PROOF.md` for exact evidence,
controlled-fixture disclosure and remaining limits. No VectorGrid/key/scorer/
symbol changes or new full-corpus/holdout gate. Main A–E remains first: atomic
restore/save fencing, revision review/approval, remaining corpus acceptance; the
appended symbol/installed-plan phase is still last. No push/merge/deploy.

2026-09-10 checkpoint after **f20c8e24**: full saved B/C/D calculation replay now
uses historical input reconstruction and unchanged Python calculators on the
shared UI/MCP path. Optional browser/MCP archive preflight returns exact workflow
and record receipts; re-signed wrong totals reject and no state is restored or
approved. Full web **2,697 pass / 13 existing skips**; BAS MCP **103 pass** plus
broader existing MCP **155 pass**, packaging **4 pass**; Python with package gate
**443 pass**, configured mypy **19 files**. Actual Fort Sam UI and built MCP both
replay all **3 assembly + 28 engineering** historical results, reject the same
valid-byte/wrong-math backup and preserve history. Six final UI screenshots and
the failure state inspected. See
`../opentakeoff/docs/bas-production/WORKFLOW_REPLAY_PROOF.md` for exact runs and
limits. No VectorGrid/algorithm/scorer/threshold changes or holdout access.
Main goal remains active: atomic restoration/autosave safety and original-version
citations, revision correspondence/journals, scoped approval/snapshots, then all
remaining corpus/holdout gates and appended symbol/installed-plan phase.
Historical scores and old-path failures below are not a new green corpus gate.
No push, merge or deployment.

2026-09-10 checkpoint after **81e55b2e**: source-inclusive unapproved evidence ZIP
backup now has one shared canonical/ownership/hash/container implementation,
actual browser download/verification and additive MCP export/read-only preflight.
Every historical original is required; cancellation, stale state, corrupt bytes
and output collisions cannot publish a successful backup or approve a takeoff.
Final full web **1355: 2,697 pass / 13 existing skips**, types/lint/bench/build
pass. Full BAS MCP **16081: 95 pass**, packaging **4 pass**, tool names 50/current.
Final real Fort Sam UI **22305 exit 0**, zero errors, exact history/original bytes,
cross-surface archive reading and controlled cancellation/concurrent-save checks;
six final screenshots inspected. Built MCP **45611** passes exact shared output
and source/history parity. Controlled 551.1 MB Node and browser transports pass
predeclared local resource budgets; not PDF interpretation/installed-count proof.
See `../opentakeoff/docs/bas-production/EVIDENCE_BUNDLE_PROOF.md`.
No VectorGrid/math/key changes or holdout content access. Main BAS goal remains
active: automatic bundle restore/source reopening, revision correspondence and
journal, scoped approvals/atomic snapshot seal, then remaining corpus/holdout
acceptance; only then appended symbol/installed-plan research. Historical corpus
metrics and 23 old-path errors below are not replaced by these transport gates.
No push, merge or deployment.

Latest backup gate: full BAS **72396 exit 0**, 95 pass/0 fail/skip, 12.264 s;
final built MCP **38156 exit 0**, exact source/history/ownership and preserved
state. Existing One-Click 16 cross probes/0 disagreements, pair-IoU floor .994
and mean .999; nine single-resolution cases not cross-checked. Not corpus scores.

2026-09-10 checkpoint after **3eddc21f**: explicit browser-local original PDF
retention/verification/download now uses shared ownership/digest validation and
project-scoped per-source transactions. Sources survive ordinary filename/revision
deletion; corrupt/foreign inputs, stale saves, quota failures and transaction aborts
cannot overwrite old evidence or approve a takeoff. Focused **40 pass**; first full
web **2,689 pass / 13 existing skips**, types/lint/bench/build pass; final layout
types/lint/build pass. Existing BAS MCP **93 pass**. Final Fort Sam UI **31204
exit 0**, **60.676 s**, **456 unchanged findings**, exact source recovery and
history/bbox/keyboard checks, zero page errors; six final source-view screenshots
inspected. No new public MCP retention verb or completed revision/snapshot seal.
Full details: `../opentakeoff/docs/bas-production/SOURCE_RETENTION_PROOF.md`.
No VectorGrid/extraction/math/key changes or holdout access. Historical **505/541
takeoff, 99/129 reference, 78/91 graph cells, 133/138 anchors** plus 23 old-path
ENOENTs remain, not a new full corpus run. Finish the main BAS workflows and
remaining corpus gates before the appended symbol/installed-plan phase.
No push, merge or deployment.

Final full web **67712 exit 0** repeats **2,689 pass / 13 existing skips**, no
failures, types/lint/benchmark/build pass. One-Click cross gate: 16 probes,
zero disagreements, pair-IoU floor 0.994 / mean 0.999; nine single-resolution
cases not cross-checked. This is not the complete schedule/quantity/graph corpus.

2026-09-10 newest main-goal checkpoint, after **0357cada**: shared read-only BAS
finding queue now connects internal Review & changes and opt-in public MCP.
Real Fort Sam browser **19202 exit 0**, 37.561 s, and packaged MCP **6687 exit 0**,
38.951 s, agree on all **456 findings** and preserve original sources, decisions,
source bboxes and every default compile field. Unknown codes/excluded failures
stay visible; actual-Python regression fixes duplicated source-wide coverage
after assigned-value calculation. Full BAS **93 pass**, full web **2,675 pass /
13 existing skips**, types/lint/bench/build and four package tests pass. First
queue open 4.740 s is not called production-fast. Full review decisions, source
retention, revisions, approvals and release remain; source/corpus/holdout gates
remain too. No new corpus score, holdout access, extraction/VectorGrid/math edit,
push/merge/deploy. Detailed proof and limitations:
`opentakeoff/docs/bas-production/PROJECT_REVIEW_PROOF.md`. Finish the original five
workflows before the appended symbol/installed-plan reconciliation phase.

2026-09-10 newest main-goal checkpoint, after **eb18c7ad**: all eleven engineering
families passed actual browser form verification on the original Fort Sam PDF
with explicitly controlled capabilities. **95611 exit 0**, 414.038 s, **451
field/list observations, 16 UI-recorded decisions**, exact JSON export/reload and
zero page errors. Power overload and duplicate serial address fail, correction
passes, and earlier failures remain; exact rule/normalized-value readback checked.
All 12 power/network theme/width screenshots inspected. Source/ownership/assembly
history remains unchanged. Full BAS MCP **14338 exit 0: 90 pass**, focused
**91780: 11 pass**, MCP types pass. Two failed test setups are retained: divergent
test history (correctly refused) and waiting for a gallery after canvas restoration;
only the harness changed. No production/extraction/math edit. The new workflow E
audit/contract specifies issue review, version correspondence, retained source
snapshots and selective invalidation; implementation remains ahead. No new corpus
metrics or holdout access, no push/merge/deploy. This is not automatic hardware
discovery or full-goal completion. Detailed evidence and next work are recorded
in `opentakeoff/docs/bas-production/PROGRESS.md`.

2026-09-10 main-goal checkpoint: saved engineering review XLSX is implemented on
one shared UI/MCP projection, with original inputs, all constraint/history data,
source locations and applicability findings. Not an approved deliverable or
installed/design proof. Full web **74622 exit 0**, **2,670 pass / 13 existing
skips**, types/lint/bench/build pass; full BAS MCP **13770 exit 0**, **90 pass**,
MCP types/build and unchanged 50-tool/version surfaces checked. Real development
PDF browser **27124 exit 0**, 27.207 s: actual replay cancellation, preserved
draft/history, exact workbook and rejection after newer ordinary import; no page
errors. Packaged public MCP **85326 exit 0**, 4.623 s: all 13 workbook parts equal
to browser, prior-file guard and legacy inline JSON unchanged. Missing packaged
ZIP dependency was reproduced then declared (existing web fflate 0.8.3); no
extraction or Python math edit. Independent readback checked all 382 cells/eight
sheets and visual previews. Failed-first runs are retained, not omitted.
The export contract is bounded-complete; engineering real-document coverage and
review/revision/approved-snapshot work remain. Detailed evidence is in
`opentakeoff/docs/bas-production/PROGRESS.md`. No new extraction corpus metrics:
505/541 takeoff, 99/129 reference, graph 78/91 cells / 133/138 anchors and 23
old-path ENOENTs remain the historical baseline. No push/merge/deploy. Finish all
five workflows before the appended symbol-reconciliation implementation phase.

2026-09-09 priority clarification: finish the five BAS workflows first. The
user-authorized symbol-deformation/installed-plan reconciliation research and
hardening is appended as a final phase in `opentakeoff/docs/BAS_PRODUCTION_GOAL.md`,
not a replacement. Initial source/code leads are retained in
`opentakeoff/docs/bas-production/SYMBOL_RECONCILIATION_RESEARCH.md`; no new symbol
code. Main-goal checkpoint **0f8fcd72** remains local. Browser race attempt 1
passed cancellation and exactly-once retry checks before setup timeout; attempt
2 is terminal with an import/persistence timeout. Neither run is a full pass.
Instrumentation-only reruns **94873 / 74627 exit 0**, 39.635 / 39.353 s, now
pass all four safety checks including late response across a newer import,
exact export/reload and zero browser errors. No deadlines or assertions changed;
earlier timeout causes remain unproven, not claimed repaired. Engineering
exports and review/revisions remain on the main critical path. Detailed current
evidence is in BAS production progress below.

2026-09-09 newest checkpoint supersedes live/pending statuses below: full web
**60382 exit 0**, **2,665 pass / 13 skips**, types/lint/bench/build pass; Python
**438 pass / mypy 18 files**; browser-4 passes both themes/three widths, exact
input provenance and source return, fresh import and controlled owner withdrawal.
The packaged MCP runtime resolved VectorGrid outside its package and silently
used fallback tables. User approved **packaging/loading only**. Existing Python
files are now copied byte-for-byte; shared runtime location and cache dependency
are corrected without algorithm/threshold/bbox/symbol/math edits. Public real-PDF
MCP **6174 exit 0**, 64.698 s: exact browser capture/history/outcomes, legacy
output, replay, retry and export/reimport pass. Standalone runtime/regression
gates pass: 6 standalone pages, **29 tables / 2,390 cells** exactly equal across
source/package and first/repeated requests; missing sources error, raster and
symbol-only controls add no vector tables. Four packaging tests, 30 existing
adapter/pipeline tests, two cache tests, packaged stdio smoke and final **87 BAS
MCP tests / types / 50-tool count** pass. Generated package bytecode was removed
by rebuilding only its output directory; originals are unchanged. One real
controlled engineering check is not full design verification.
Same legacy corpus **77284 terminal**, 5,460.9 s: takeoff **505/541** (installed
470/499), reference **99/129**, graph **78/91 cells / 133/138 anchors**, unchanged
baseline; 23 old-path ENOENTs still disclosed/unmodified. Full detail and limits:
`opentakeoff/docs/bas-production/PROGRESS.md`. Five-workflow goal remains active;
no push/merge/deploy. Earlier logs and failed-first evidence are retained.

2026-09-09 Engineering UI/public integration is in active verification, not
production completion. Shared review/inspect now reaches HTTP/CLI and public BAS
compile; selected-equipment forms retain source wording, unknowns, drafts and
history. **87 BAS MCP tests pass**, types/build/50-tool count and legacy stdio
pass. Actual Fort Sam UI direction/mode walkthrough passed twice (61.044 s and
255.840 s under concurrent checks), both themes and three widths. Controlled
counterpart inputs remain labeled; no installed or full 0–10 V range claim.
Full web has **2,662 pass / 13 existing skips**, bench/build pending on **80830**.
Python full run: 437 pass, one unchanged 10-second child timeout; exact focused
rerun passes in 0.82 s. Packaged real-PDF MCP attempt **12601** ended **137** in
initial compile; cause not established, no success claim. Detailed evidence,
remaining acceptance and next queue: `opentakeoff/docs/bas-production/PROGRESS.md`.
Same **77284** corpus run remains live beyond NAVFAC; graph **78/91 cells /
133/138 anchors**, takeoff/reference pending, 23 missing table paths unchanged.
No extraction/symbol/VectorGrid/Python arithmetic change; no push/merge/deploy.

2026-09-09 ownership/history continuation: shared engineering register,
append-only dependency-bound reviews and actual Python history replay are
implemented internally. **23** focused service/ownership tests cover all eleven
rule families and real browser-store round trips; two reproduced defects
(stale-assembly view and response/request binding) were corrected. Full Python
**438 pass / mypy 18 files** including package verification; full BAS MCP **84
pass**, types/build and packaged legacy smoke pass. Full web **56704 exit 0**:
**2,657 pass / 13 existing skips**, types/lint/bench/build pass (build 9.83 s). Exact logs,
boundaries and failed-first evidence: `opentakeoff/docs/bas-production/PROGRESS.md`.
No extraction/VectorGrid/graph/symbol changes or public engineering UI/MCP yet.
Same corpus **77284** and its NAVFAC child remain authoritatively live; graph
**78/91 cells / 133/138 anchors**, takeoff/reference pending, 23 missing table
paths not yet changed. Keep the full five-workflow goal active; no push/merge.

Latest 2026-09-09 continuation: **516476ea** commits the verified network
dependency. Shared engineering wire schemas and internal Node→Python transport
now have **61 passing BAS MCP tests**, types/build and packaged legacy smoke.
Full web **44122 exit 0**: **2,653 pass / 13 existing skips**, types/lint/bench/build
pass. No new Python change after **430 pass / mypy 17 files**. Original sources,
VectorGrid, graph and symbol algorithms remain untouched. Public engineering
review/persistence/UI/MCP integration is not complete.

Read-only metadata recovery located **23/23** missing manifest filenames uniquely
in the retained archive and verified each inventory SHA-256. Audit:
`opentakeoff/docs/bas-production/evidence/corpus-path-audit-before-repair.json`.
No input mappings, PDF bytes, keys or holdout interpretation changed. Same
**77284** remains live; repair isolated mappings only once terminal. Graph phase
**78/91 cells, 133/138 anchors**, 0 wrong/unexpected, remains at starting misses;
takeoff/reference finals pending. New unrelated transport imports were added
while it ran, so do not describe this as the final fixed-commit engineering gate.
Complete five-workflow scope and next ownership/history/UI queue are retained in
the BAS production progress record; no push/merge/deploy.

2026-09-09 network checkpoint supersedes the historical active entry below.
The previous research-status answer was **no progress**; this continuation
completed declared serial/IP constraints around unchanged Python solvers and
fixed three reproduced unknown/nonphysical-capacity cases. **65649 exit 0**:
**430 Python tests pass**, zero skips/failures, 36.33 s, including explicit
packaging verification. **40560 exit 0**: mypy 17 files; **35735 exit 0**:
44 existing BAS MCP tests pass. Failed wrong-directory/config invocations and
exact evidence are retained in the BAS production progress record. No extraction,
VectorGrid, graph, symbols or existing web/MCP source changes in this checkpoint.

Same **77284** job remains live with active NAVFAC takeoff child. Graph phase is
now finished: **78/91 cells**, 0 wrong; **133/138 anchors**, 0 unexpected, matching
the documented starting misses. Takeoff/reference final metrics remain pending.
Table recall remains Bessemer 6/11 plus 23 historical-path ENOENT failures; this
is not a complete corpus pass. No new source/holdout files or keys were altered.
Next: shared source ownership, typed engineering transport and durable decisions,
then UI/MCP journeys and all remaining five-workflow gates. No push/merge/deploy.

### Earlier engineering checkpoint

Engineering continuation: the preceding status answer was **no progress**;
this turn adds the shared Python declared-constraint dependency and bounded
process envelope. Exact units, signal/load/contact/pulse/power/mechanical checks,
cross-check endpoint/terminal ownership and expansion constraints are tested;
no new extraction, graph, symbol, browser or MCP source changes. Final Python
**62381 exit 0**, **307 pass / zero skips/failures (20.98 s)** including explicit
packaging verification; mypy **16 files**. Existing MCP BAS **44 pass**,
types/build and actual packaged legacy transport smoke pass. The full research,
retained failure logs, input/source limits and evidence are in
`opentakeoff/docs/bas-production/PROGRESS.md`.

**77284 remains live**, same job, not restarted. Completed table recall is
Bessemer **6/11**, five misses/three key-unlisted additions, six core sets without
keys, and **23 ENOENT historical Desktop PDF paths**. Takeoff/reference/graph
finals remain pending. Do not claim a full regression pass. Resolve isolated
input-location mappings by content identity only after the current run finishes;
do not edit source keys or mutate this run's manifest. Engineering network,
ownership/persistence/UI/MCP integration, the other workflow gates and untouched
holdout remain required. Nothing pushed, merged or deployed.

Local checkpoints: **5b4d82cf** (verified list rules/UI) and **8a214255**
(engineering acceptance/source key). Full existing scored corpus regression
**77284** is now running and was re-polled live, log
`opentakeoff/docs/bas-production/evidence/component-list-v2-corpus-regression-1.log`.
No `--report` or changes to source keys/scorers; concurrency 1 per evaluator.
Await takeoff+reference, graph and table-recall separately. This is not new
workflow holdout evaluation and no final results are claimed yet. Continue the
full engineering/persistence/UI and remaining five-workflow scope.

Latest continuation: **6a3d6c13** assembly work is committed locally. Pending
component-list v2 preserves v1 source fingerprints/history and adds four
literal source roles, not installed counts. Public original-PDF MCP **37515
exit 0** (63.664 s, peak RSS 1,149,255,680 bytes) preserves graph, legacy
compile/math and points exactly. Revised UI **93245 exit 0** (41.868 s) fixes
repeated-source list density: all four rows fit in 343 px at 1280/1440/1920,
both themes, keyboard/source return/reload/import/export pass. Prior complete
assembly journey **36291 exit 0** also passes (212.960 s). Python 174 pass/mypy
13; final MCP **79848 exit 0**, 44 BAS tests/types/build/tool count pass.
Full web **29362 exit 0**, 2653 pass/13 skips plus types/lint/bench/build
(build 14.17 s). Detailed BAS progress retains exact evidence and boundaries.
Engineering compatibility's full pre-implementation contract and independent
M-601 signal-note key are written; no compatibility implementation claimed yet.
All five workflows and full corpus/holdout gates remain required; no extraction,
original-corpus or holdout changes, no push/merge/deploy.

Latest verified assembly checkpoint supersedes the running/retry entries below:
actual browser **21023** and public MCP **93829** pass the original nine-page
source journey, including saved history, source navigation, responsibility
conflict/resolution, withdrawal/rebase and Python contributions (not installed
counts). Full web **16633 exit 0**, 2647 pass/13 skips, all phases; Python
172 pass/mypy 13 files; MCP 42 BAS tests/types/build pass. Dark shell text
contrast defect reproduced at 3.40048:1 and fixed surface-only: actual import
**66002 exit 0**, both themes/widths, minimum light 6.50894 / dark 7.70780,
source and calculation state exact. Final cosmetic full-web **1691 exit 0**:
2647 pass/13 skips, types/lint/bench/build pass. Full five-workflow goal
incomplete; no extraction or holdout changes.
See BAS progress for retained evidence and boundaries.

Superseding live-state update: baseline **78297 completed**, remaining four sets
match candidate metrics/discrepancies (356/375 exact; reference 62/62). Overall
core remains not green: takeoff 505/541, reference 99/129, graph cells 78/91 and
row-symbol 133/138. New BAS assembly MCP tests/types/build pass (42 BAS tests).
Full web has 2647 pass/13 skips with bench/build pending. Real assembly UI/MCP
attempts found a test's wrong unique-tag-occurrence assumption; original p9
source visually verified, diagnostics now select the keyed schedule occurrence
without changing extraction or keys. Retries running. No completion claim.

Latest BAS resumption: assignment workflow committed locally **31d4a793**.
Uncommitted assembly shared history/Python tests pass (14 new web, 53 new Python;
172 Python total, mypy 13 files; 14 assembly/assignment MCP tests). Full web 2644
pass/13 skips before newer UI/public integration. Public MCP types/build pass.
New editor lint found a JSX brace error; fixed, rerun required. Actual assembly
UI/public-tool proof remains outstanding. Baseline **78297** revalidated live,
Navfac PID 66378 consuming CPU; no restart or aggregate claim. Previous status
answer was no progress; implementation has resumed. Full five-workflow contract
unchanged. See BAS progress for exact evidence and current queue.

Current verified BAS checkpoint (supersedes historical status below): actual
assigned-observation browser **95677** and public MCP **27726** both passed on
the original 29-page source, including replay, source equality, retry,
export/import and withdrawal/history. MCP took 518,035 ms with explicit 4-GiB /
600-second diagnostic allowances; not default-resource proof. Full web **17541**
passes **2,630 tests / 13 existing skips**, types/lint/bench/build. Python 119 and
MCP 33 BAS tests remain green. Dark reader contrast was measured/fixed with
existing tokens and checked at two sizes/both themes without workflow changes.
Component source kernel committed locally **a0b58e8a** (seven focused tests);
assembly register is uncommitted intermediate work, not a completed workflow.
Baseline remaining-four-set comparison **78297** remains live. Full five-workflow
goal active; no extraction, holdout, costing, push, merge or deployment change.
See `../opentakeoff/docs/bas-production/PROGRESS.md` for exact evidence/limits.

Latest isolated BAS verification supersedes older live-status entries below:
MCP **33 BAS tests**, types/build/tool count pass; Python **119 tests**, mypy
**12 files** pass. Final response-acceptance guards preserve complete history.
Earlier full web check completed green; later guard-state check has **2 timing
failures / 2,621 pass / 13 skips** in unchanged hatch/grid tests. Both original
thresholds pass in isolation, but a clean full gate is still required.
New calculation MCP run is terminal (post-import 600-second compile timeout);
second browser run terminal (browser closed during indexing). Neither proves
the new calculation end-to-end. Actual browser retry **95677** is running;
starting four-set corpus comparison **78297**, PID 66280/Navfac 66378, remains
live. No restart on observation timeout. Shared component source kernel has
three passing tests and typecheck; not yet an integrated assembly workflow.
Original M-512/M-601 reviewed, holdout untouched. Full goal remains active.

Current isolated BAS increment is uncommitted: shared Python assigned listed
values preserve original observations/citations, exact applicability factors,
unknowns/attributes and immutable stale-aware history. Python **119 pass**, mypy
**12 files**; MCP BAS **32 pass** before the final Python validator fix; web
**2,623 pass / 13 skips**, bench pass, build pending. Real calculation browser
attempt **failed during 600-second indexing**, not a passed UI proof; actual MCP
`22070` remains live. Prior equipment-only proof is separately verified.

Legacy core `21748` is terminal: takeoff **505/541**, reference **99/129**, graph
cells **78/91** and symbols **133/138**; 53 key-flagged additions, 18 missing and
absolute quantity delta 74. Not green. Graph and three sets' failures reproduce
on starting revision `08dffc79`; remaining four-set baseline `78297` is live.
Older live-status entries below are historical. Full current evidence/handles:
`../opentakeoff/docs/bas-production/PROGRESS.md`. No extraction, key/scorer,
threshold, holdout, costing, push, merge or deployment change in this increment.

Verified isolated BAS equipment checkpoint: full web **2,623 pass / 13 existing
skips**, typecheck/lint/bench/build pass; actual Behavioral UI **14 named members,
5 original applicability references**, assignment/exceptions/source return,
reload/export/fresh import/withdrawal all pass. Public MCP also passes; original
graph/point/math exact. Explicit enlarged resource allowances and earlier
diagnostic failures are disclosed. Core takeoff/reference job remains live;
graph baseline misses unchanged. No all-five-workflow or production-complete
claim. See `../opentakeoff/docs/bas-production/PROGRESS.md` for evidence and next.

Equipment editor increment (isolated BAS branch, 2026-09-09): internal source and
register tables, selected-equipment templates, explicit scopes/members/exceptions,
shared validated preview/save, source-row reader and saved evidence references
are implemented. Full web check passes 2,621 tests/13 existing skips plus build.
Actual Behavioral UI and MCP walkthroughs are still live; earlier MCP default
heap and post-import 120-second failures remain documented, not green. No new
assignment demand arithmetic or installed corroboration yet. Full status and
live handles: `../opentakeoff/docs/bas-production/PROGRESS.md`. No extraction,
symbol threshold, costing, holdout, push or merge change.

### Deterministic BAS production workflows — isolated branch (2026-09-09)

Active goal and acceptance contract: `../opentakeoff/docs/BAS_PRODUCTION_GOAL.md`.
Current research, exact baselines, limitations and next steps:
`../opentakeoff/docs/bas-production/PROGRESS.md`.
Active increment: shared source-backed equipment candidates, scoped register and
durable per-unit/system-once assignments now reuse the existing SOO/point
comparison. No installed count or new demand math. Focused shared 45 pass;
MCP production 12 pass/typecheck, contract subset 132 pass; first full web 2620
pass/13 existing skips, build/bench/lint/types pass; final rerun live. Existing
real SOO browser workflow remains green with the new capture. Large Behavioral
MCP proof hit the known baseline default-heap limit; phase-logged 4-GiB retry
`89172` is live. Do not claim that walkthrough passed or default-memory safety.
Seven-set corpus `21748` remains live: graph 78 correct/13 missing cells,
133 expected symbol outcomes/5 missing. All graph misses reproduced on the
starting revision; takeoff/reference pending. Full details and process handles
are in the BAS progress record. Equipment UI/math, other workflows and full
corpus/holdout gates remain unfinished. No VectorGrid/production deployment.

Previous checkpoint:
Latest: retained SOO text and auditable association events now work through the
actual browser and MCP workflow, including source return, autosave/reload,
export/import, stale/invalid-request rejection and removal history. Repaired an
ordinary recompile reply that omitted retained review events; regression protected.
Full web 2,600 pass/13 skips, typecheck/lint/bench/build pass; MCP BAS 23 pass,
typecheck/build/tool count pass. New original-PDF source key separates system-wide
matrix membership (14 named members) from a two-chiller operating limit versus
three scheduled chillers. It is not installed-quantity proof or a completed
equipment interpreter. Full seven-set legacy corpus gate `21748` and MCP contract
subset `72013` are live; poll/revalidate rather than restart. See the detailed
BAS progress for evidence and exact limitations. All five workflows remain open.

Previous checkpoint: first shared SOO–point comparison kernel has six independently keyed
real monitoring requirements, five listed matches and one selected-matrix
omission. Printed DI preserved; no installed count inferred. Nine focused tests
plus real Session/replay/source-preservation pass. Production compile/UI/persisted
SOO integration remains next; this is not a delivered workflow. See linked BAS
progress for exact coverage/limits. Final web check 2,593 pass/13 existing skips;
typecheck/lint/bench/build pass. All verification jobs are terminal.

Previous checkpoint: source-bound captures now persist across browser/MCP save,
reload, export and reimport. Real browser: 12 matrices / 193 rows, fresh-context
import, both themes/three widths, source paint and controlled changed-byte refusal
pass. Real MCP compile/export/import parity passes. Full web 2,581 pass/13 skips
plus three diagnostic tests; MCP BAS 22 pass, typecheck/build pass. All jobs
terminal. No extraction change. Next: shared SOO–points–equipment reconciliation.
All five workflows remain incomplete; historical source bytes are not archived.

Previous checkpoint: shared source-bound point observations now cross the real
production CLI/MCP path. Fort Sam 12 matrices / 193 listed rows, six source-note
spans and 16 reviewed controller bindings; prior legacy/math fields unchanged.
Python 97 pass, MCP BAS/diagnostic 20 pass, full web 2,573 pass/13 existing skips
(typecheck/lint/bench/build pass); durable workflow/UI/export still incomplete.
Core candidate: takeoff 89.8%, references 37/67, graph 78 correct/13 missing,
66/66 symbols. Baseline reproduces the 13 Baker CEILING misses and all reported
takeoff/reference failures. Three-document graph A/B is complete: prior tables
12/12 Fort Sam, 9/9 Behavioral and 1/1 JVWTP preserved, only eight independently
keyed Fort Sam additions. All verification handles are terminal.
Use the linked latest checkpoint for current handles and performance limitations;
older live-status paragraphs below are historical, not a restart instruction.
Implementation is coordinator-only on `codex/bas-math-engine`, baseline `161583a4`.
The new goal excludes vision/model training, pricing/costing/labor and automatic
merges/deployments; those explicit limits supersede older scope notes below.
30 focus and 190 source PDF hashes verified; 24 development truth records
revalidated, six new-workflow holdouts reserved and unopened. Existing legacy
MCP failures are disclosed, not scored away. No claim of production completion.
First shared source adapter verified on 24 development PDFs / 1,253 pages /
563,248 text spans with exact original text/frame/hash parity. Full web check
passes (2,557 pass, 13 skips), focused BAS tests and MCP build/typecheck pass.
This proves source preservation, not improved takeoff or SOO completeness;
the detailed progress record distinguishes those scopes.
Shared narrative discovery now has nine source-region controls across two PDFs,
including embedded reset tables, plus exhaustive accounting/replay across all
24 development PDFs. Final web check: 2,567 pass / 13 existing skips. This is
not full SOO interpretation or a complete workflow. The missing 114 Fort Sam
listed point rows were traced to the shared page-role routing gate; permission
was requested before changing that gate. Detailed proof and pending work remain
in the BAS production progress record above.
User subsequently authorized the routing repair. Shared routing/reconciliation
now recovers all 12 Fort Sam BAS matrices / 193 printed rows / 1,603 keyed cells,
with the original 12 complete graph tables unchanged. No VectorGrid reader edit.
Nested HARDWARE/SOFTWARE header interpretation is now tested in the shared
Python consumer (73 tests pass; prior complete fixture outputs unchanged).
These are printed-source results, not installed quantities or complete workflows.
Focused graph gate: 78 correct / 0 wrong / 13 missing keyed cells, 66/66 expected
symbol anchors. Baker CEILING baseline reproduction and takeoff/reference are
still live; no non-regression claim yet. Behavioral A/B baseline hit the default
V8 heap limit; the failure is retained, not scored away. Current process handles,
runtime/RSS, exact comparisons and next steps are in the linked BAS progress.

### Vector takeoff engine research — commercial + OSS stack (2026-09-01 22:00 UTC)

**User directive:** Regex/title tuning is not the engine. Commercial products (Kamai,
Trimble MEP, iBeam) read **native PDF vector geometry** first; classification is downstream.

**Deliverable:** `takeoffs/VECTOR_TAKEOFF_ENGINE_RESEARCH.md` — authoritative stack doc:
- Commercial pipeline anatomy (L0–L5 layers)
- **v2 production stack** with 🌟 L1.5 (SAHI/OpenCV tiling), L3.5 (Shapely/NetworkX topology),
- **Vector stack wired (2026-09-01):** `vectorTakeoffPipeline.ts` orchestrates L0–L5
  on `Session.graphForPipeline`: L1.5 tiling, L2 geo+ODL+line-grid+stream fallbacks,
  L3.5 MEP topology, L4 dedup reconcile, **L4.5 OCR/VLM assist ON** (`rasterTableAssist.ts`,
  `Session.ocrScheduleRegion`). GOAL policy updated — OCR/AI in scope when beneficial.
  L5 header-geometry in `corpusTakeoff.mjs`. Next: corpus GT harness + compile census.
- Complete OSS stack by layer (ODL, pdfplumber, Camelot, gmft/TATR, MEPdetect, YOLOplan, …)
- OpenTakeoff gap map: **Layer 1/2 extraction** fails on ~24+46 of 70 compile-zero valve sets
- Recommended fix order on shared Session+ODL path (no regex-first, no ODL rewrite)

**Paused:** Implementation active — L5 header-geometry layer landing on shared path.

### L5 header-geometry classifier (2026-09-01 22:10 UTC)

**Shared-path Layer 5 (on recovered geometry, not regex-only):**
- `tableHeaderBlob` / `headerShapeMatches` / `isControlValveHeaderShape`
- Untitled valve grids: `blankKeyRe` + `blankHeaderRes` + `blankServiceHint` on
  CHW/HHW/ISO/MIXING/CONTROL_DAMPER families
- Untitled BAS grids: `isBasPointsListTable` + `inferBasListTitle` in `compileBasTakeoff`

**Verified:** `013_MO_T2523` real graph — **0 → 5** `CHW_CONTROL_VALVE` rows from blank-title
`TAG|MANUFACTURER|MODEL|SERVED|GPM|SIZE` grid (CV-* marks). T-VALVE-01 lock still green.
Tests: `corpusTakeoffHeaderGeometry.test.ts` **4/4**; `corpusTakeoffBas.test.ts` **19/19**.

**Next stack wiring:** L2 pdfplumber fallback adapter → ScheduleTable; ODL coverage on thin sets;
GT harness census re-run across 81 valve + 112 BAS sets.

### Pillar C valve audit — PDF text vs compile (2026-09-01 21:32 UTC)

**Prior “70 honest valve zeros” was wrong.** Fast PDF text scan of all **81/81**
valve-bearing sets (~2 min, pdfjs text layer — not full Session load):

| Metric | Count |
|---|---:|
| `control_valves` compile finds rows | **11** |
| Compile returns 0 | **70** |
| PDFs with **zero** valve/damper text | **0** |
| Compile-zero but PDF **has** valve/damper signal | **63** |
| PDF text hits **VALVE SCHEDULE / CHW\|HHW CONTROL VALVE** but compile 0 | **17** |
| Compile-zero with only generic plan legend terms (BV, SOV, …) | **7** |

**Conclusion:** compile-empty ≠ verified-empty. Most “zero” sets have valve
information in the PDF; the shared path is **not extracting** tabular valve
schedules on those sets yet (title/table matching + some multipart/rejoin gaps).
Do **not** treat compile-zero as Pillar C floor or GT lock.

- **Script:** `opentakeoff/mcp/scripts/pillarCValvePdfTextScan.mjs`
- **Artifact:** `/opt/cursor/artifacts/pillar-c-valve-pdf-text-scan-all.json`
- **Next (when resumed):** Layer 1/2 table extraction on the 63-gap sets — ODL coverage +
  pdfplumber/Camelot fallback adapters into `ScheduleTable`, then header/mark classification.
  See `takeoffs/VECTOR_TAKEOFF_ENGINE_RESEARCH.md`. **Not** regex-only `corpusTakeoff.mjs` tuning.

### Pillar C DEPTH phase started — full plan-paint sweeps (2026-09-01 21:00 UTC)

**Width closed → depth uses material map.** Full target sweeps (not 8-tag samples); GT drafts patched with `depth_plan_paint_full`; still **0 gt_locked**.

| Depth batch | Sets | Full-sweep highlights | Artifact |
|---|---|---|---|
| **Keyed BAS** | **5/5** | 001 **116/120** MATCH; 015 **22/29**; 021 **0/73** honest SO; 096 **59/75**; 027 **45/64** | `/opt/cursor/artifacts/pillar-c-depth-bas-keyed-plan-paint.json` |
| **Valve printed** | **11/11** | Pier **34/36** MATCH; Carson **2/2**; NAVFAC **2/80**; full targets not 12-tag sample | `/opt/cursor/artifacts/pillar-c-depth-valve-plan-paint.json` |
| **bas:0 inventory batch 1** | **20** | **18/20** with MATCH | `/opt/cursor/artifacts/pillar-c-depth-bas-inventory-batch1.json` |
| **bas:0 inventory batch 2** | **20** | **15/20** with MATCH | `/opt/cursor/artifacts/pillar-c-depth-bas-inventory-batch2.json` |
| **bas:0 inventory batch 3** | **18** | **9/18** with MATCH (Klamath honest SO, …) | `/opt/cursor/artifacts/pillar-c-depth-bas-inventory-batch3.json` |

- **bas:0 inventory depth total:** **58/58** scored inventory sets full-swept (batches 1–3).
- **Script:** `opentakeoff/mcp/scripts/pillarCDepthPlanPaint.mjs` — full sweep + GT draft patch on shared path.
- **Remaining depth:** 70 valve compile-empty floors, 49 bas compile-empty floors (compile-only — not “no valves on job”), gap/SOO/GT lock per set.
- **Still 0/112 BAS · 0/81 valve** at `estimator_complete` / `gt_locked`.

### Prior — WIDTH complete (2026-09-01 20:50 UTC)

**Order:** width = material (corpus truth map); depth = platform proof on that map. Width phase closed before any GT locks.

| Width track | Coverage | Artifact |
|---|---|---|
| **BAS `estimator_product` live census** | **112/112** | waves 1–7 incl. `/opt/cursor/artifacts/pillar-c-estimator-product-census-wave7.json` (6 keyed BAS + 089) |
| **BAS inventory plan-paint (bas:0)** | **107/107 touched** (59 scored 8-tag samples, 48 skipped honest zero/no targets) | `/opt/cursor/artifacts/pillar-c-plan-paint-census-inventory-wave7.json` (+ waves 1–6) |
| **BAS inventory drawing verify** | **112/112** floors | `bas_inventory_drawing_verified_ids` |
| **Valve product census** | **81/81** (11 printed schedule rows / **70 compile-empty** — no tabular valve schedule extracted; valves may still exist on plans/specs) | `/opt/cursor/artifacts/pillar-c-valve-product-census-all.json` |
| **Valve plan-paint width sample** | **11/11** printed sets (12-tag sample each; 6/11 with ≥1 MATCH) | `/opt/cursor/artifacts/pillar-c-valve-plan-paint-census-width.json` |

- **Wave 7 plan-paint (10 bas:0):** **9 scored / 8 with MATCH** — 1 skipped (`057` honest zero inventory). Notable: Las Vegas 7/8, SDSU 7/8, Ames 8/8, Orange County 8/8.
- **Wave 7 estimator_product (6 keyed BAS + 089):** all 6 emit inventory + printed BAS where keyed; **5/6 printed BAS**, **5/6 valve items**.
- **Script:** `opentakeoff/mcp/scripts/pillarCEstimatorProductCensus.mjs` — reusable width census on shared path.
- **Still 0/112 BAS · 0/81 valve** at `estimator_complete` / `gt_locked` — width ≠ depth; extreme depth phase is next.

### Prior — SOO/spare/proof column probe on shared path (2026-09-01 20:50 UTC)

- **Shared `probeBasProofSpareColumnHeaders()`:** scans BAS/I/O table headers for explicit PROOF/INTERLOCK/SPARE columns (CAPACITY-only false positives excluded); disclosed on `estimator_product.controls_column_probe` — never invents points.
- **Keyed batch (5 sets):** SOO present on **021** only (`present_not_row_extractable`); **0/5** with real PROOF/SPARE column headers on BAS tables (prior CAPACITY hits confirmed false-positive). Artifact: `/opt/cursor/artifacts/pillar-c-soo-spare-proof-keyed-batch.json`.
- **`corpusTakeoffBas` unit tests:** 15/15 green (+ probe regression).
- **Still 0/112 BAS · 0/81 valve** at `estimator_complete` / `gt_locked`.

### Prior — inventory waves 5–6 + valve honest ceilings (2026-09-01 20:45 UTC)

- **Census script fix:** explicit set IDs no longer wrongly filtered to `bas:0` only; skipped sets recorded with reason (`no_plan_paint_targets`, etc.).
- **Wave 5 (20 requested):** **3 scored / 3 with MATCH** — 17 skipped (honest zero HVAC inventory in compile). Artifact: `/opt/cursor/artifacts/pillar-c-plan-paint-census-inventory-wave5.json`.
- **Wave 6 (32 Vol2/EHRM):** **1 scored / 1 with MATCH** — 31 skipped (no inventory plan_paint targets). Artifact: `/opt/cursor/artifacts/pillar-c-plan-paint-census-inventory-wave6.json`.
- **Inventory census total:** **58 sets with scored samples** (waves 1–4: 54 + waves 5–6: 4 new unique with inventory).
- **Valve locks expanded:** 021 honest **0 MATCH / all SCHEDULE_ONLY**; 096 **≥10 MATCH** on 24 valve marks (`valvePlanPaint.regression.test.mjs` **7/7**).
- **Still 0/112 BAS · 0/81 valve** at `estimator_complete` / `gt_locked`.

### Prior — inventory wave 4 census (2026-09-01 20:35 UTC)

- **Inventory plan-paint wave 4 (18 bas:0 sets):** **9/18 with MATCH** on 8-tag samples. Artifact: `/opt/cursor/artifacts/pillar-c-plan-paint-census-inventory-wave4.json`. Running total **54 inventory sets** censused (waves 1–4).
- **Valve regression expanded:** Pier 015 + ITD 062 keyed floors locked (≥10 MATCH each on full target sweep).
- **Still 0/112 BAS · 0/81 valve** at `estimator_complete` / `gt_locked`.

### Prior — inventory wave 3 + valve plan-paint census locks (2026-09-01 20:25 UTC)

- **Inventory plan-paint wave 3 (15 bas:0 sets):** **12/15 with MATCH** on 8-tag samples. Artifact: `/opt/cursor/artifacts/pillar-c-plan-paint-census-inventory-wave3.json`. Running total **36 inventory sets** censused (waves 1–3).
- **Valve plan-paint sweep batch (11 keyed sets):** **6/11 with MATCH** on up-to-12-tag samples via `sweepBasServedMark` + schedule `table_title` prefer hints. Artifact: `/opt/cursor/artifacts/pillar-c-valve-plan-paint-census-sweep-batch.json`.
- **Regression locks:** `valvePlanPaint.regression.test.mjs` — Carson **2/2 MATCH**, SDSU **≥8 MATCH**, NAVFAC **≥1 MATCH** (3/3 green).
- **Still 0/112 BAS · 0/81 valve** at `estimator_complete` / `gt_locked`.

### Prior — plan_paint targets keep served marks + inventory wave 2 census (2026-09-01 20:15 UTC)

- **Shared path fix:** `buildBasEstimatorProduct.plan_paint.targets` dedupes by `source::tag::title` (inventory no longer blocks served_equipment rows) and **prioritizes all served_equipment targets** before inventory samples in the 120-cap.
- **Regression locks:** `basServedEquipmentPlanPaint.test.mjs` now sweeps full plan_paint target lists on keyed BAS sets — 001 **116/120 MATCH**, 015 **19/26**, 096 **59/75**, 027 **32/51 + 0 AMBIGUOUS**, 021 honest **0 MATCH / 29 SCHEDULE_ONLY** (5/5 green).
- **Inventory plan-paint wave 2 (12 bas:0 sets):** **9/12 with MATCH** on 8-tag samples (NIST 6/6, Hurlburt 8/8, Reid 8/8, …). Artifact: `/opt/cursor/artifacts/pillar-c-plan-paint-census-inventory-wave2.json`.
- **Still 0/112 BAS · 0/81 valve** at `estimator_complete` / `gt_locked`.

### Prior — graph preferTitle+sheet pairing clears Colville AMBIGUOUS (2026-09-01 19:00 UTC)

- **Root cause:** inventory `sheet_id` pointed at blank reference table (#13) while graph-resolved `prefer_schedule_title` was `EQUIPMENT SCHEDULE` on #37 — mismatched preferSheet+preferTitle kept 11 tags AMBIGUOUS.
- **Fix:** `planPaintPreferHint()` pairs graph-resolved title with owning sheet via `preferScheduleHintForEquipmentTag()`; never pairs graph title with wrong inventory sheet.
- **Keyed BAS served re-census:** Colville **32 MATCH / 19 SCHEDULE_ONLY / 0 AMBIGUOUS** (was 21/19/11). Floor totals unchanged: 001 116/120, 015 19/26, 021 0/73, 096 59/75. Artifact: `/opt/cursor/artifacts/pillar-c-bas-plan-paint-preferTitle-recensus.json`.
- **Platform tests:** web `npm test` **2098/2113 pass** (2 pre-existing unrelated fails: extractTable hyphen, mepconnectivity perf); targeted MCP regressions re-run this turn.
- **Still 0/112 BAS · 0/81 valve** at `estimator_complete` / `gt_locked`.

### Prior — served_equipment plan-paint + graph preferTitle fallback (2026-09-01 18:50 UTC)

- **Shared path:** `preferScheduleTitleForEquipmentTag()` scans graph tables when HVAC `table_title` is blank or a BAS I/O list title — resolves to owning equipment schedule (e.g. Colville HWP-1 → `EQUIPMENT SCHEDULE`, not `I/O LIST WHITE STURGEON PLC`). `buildBasEstimatorProduct.plan_paint.targets[]` now merges **inventory + unique served_equipment** marks with HVAC/graph preferTitle hints.
- **Keyed BAS served plan-paint re-census (5 sets, `sweepBasServedMark` + product `preferTitle`):**
  - 001 NAVFAC **116 MATCH / 4 SCHEDULE_ONLY** (120 served targets; was 3/3 sample).
  - 015 Pier **19 MATCH / 7 SCHEDULE_ONLY** (26 targets).
  - 021 Lab **0 MATCH / 73 SCHEDULE_ONLY** (73 targets — tags not drawable on plans; honest ceiling).
  - 027 Colville **21 MATCH / 19 SCHEDULE_ONLY / 11 AMBIGUOUS** (51 targets; was 17 MATCH / **25 ERROR** — preferTitle clears thrown errors; 11 AMBIGUOUS remain on duplicate keys in generic `EQUIPMENT SCHEDULE`).
  - 096 Vermillion **59 MATCH / 16 SCHEDULE_ONLY** (75 targets).
  - Artifact: `/opt/cursor/artifacts/pillar-c-bas-plan-paint-preferTitle-recensus.json`.
- Unit tests **13/13** `corpusTakeoffBas` (+ served_equipment preferTitle target test).
- **Still 0/112 BAS and 0/81 valve** at `estimator_complete` / `gt_locked`. Full served-target plan-paint ≠ Pillar C done.

### Prior — preferTitle inventory plan-paint expand + product hints (2026-09-01 18:40 UTC)

- **Inventory plan-paint census (9 bas:0 sets) with `sweepBasServedMark` + HVAC `table_title` as `preferTitle`:**
  - **8/9 with MATCH** (Orange County 8/8, Las Vegas 7/1, St Louis 7/1, Carson 8/8, Ames 8/8, Douglas 8/8, Hawthorn 5/5, SDSU 7/1).
  - Klamath 14 remains honest **0 MATCH / 8 SCHEDULE_ONLY** (tags not drawable — refuse, not invented).
  - Artifact: `/opt/cursor/artifacts/pillar-c-plan-paint-census-inventory-expand.json`.
- **Shared product path:** `buildBasEstimatorProduct.plan_paint.targets[]` now carries `prefer_schedule_title` / `prefer_schedule_sheet` from HVAC `table_title` / `sheet_id`; Agent Takeoff emits `plan_paint_prefer_schedule_title` rows so the agent can pass them into `sweep_schedule_row` (UI+MCP already forward `prefer_schedule_title` → Session `preferTitle`).
- **Valve parity:** `buildValveEstimatorProduct.plan_paint.targets[]` + Takeoff `plan_paint_prefer_schedule_title` rows for valve/damper MARKs (schedule `table_title` as prefer hint).
- **Keyed valve plan-paint census re-run (11 sets):** reconcile sweeps with `preferTitle` from scaffold — e.g. NAVFAC 001 **3 MATCH / 160 SCHEDULE_ONLY** on 163 CHW+HHV rows; Carson 16 **2/2 MATCH** on dampers; SDSU 11 **13 MATCH / 47 SCHEDULE_ONLY** on 60 fume-hood dampers. All still `refuse_not_done` / `gt_locked: false`. Artifact: `/opt/cursor/artifacts/pillar-c-plan-paint-census-keyed-floor.json`.
- **PROOF/SPARE column-header probe** on keyed BAS sets: no real PROOF/INTERLOCK/SPARE columns (CAPACITY false-positives only) — spare/proof gates stay `refuse_not_done`; free-text phrase hits remain disclose-only.
- Unit tests **53/53** (`schedulePlanReconcile` + `corpusTakeoffBas` + `agentTakeoff`).
- **Still 0/112 BAS and 0/81 valve** at `estimator_complete` / `gt_locked`. PreferTitle plan-paint ≠ Pillar C done.

### Prior — preferTitle inventory plan-paint (2026-09-01 18:24 UTC)

- **Shared helper `sweepBasServedMark`:** forwards `preferTitle` / `preferSheet` into `Session.sweepScheduleRow`, then `classifyBasServedSweepOutcome`. Cross-family building letters (Carson B1 on furnace + CU + OAU) resolve when the HVAC item already carries `table_title`.
- **Re-census:** Carson 16 → **8/8 MATCH** (was 6 AMBIGUOUS); Ames 061 → **8/8 MATCH** (was 1 MATCH / 7 AMBIGUOUS). Still `refuse_not_done` / `gt_locked: false`.
- Artifacts: `/opt/cursor/artifacts/pillar-c-plan-paint-preferTitle-recensus.json`.

## Verified baseline

Commit `b46c97f`, Node 24, full corpus run on 2026-08-29:

- Takeoff: 78.4% exact (404/515), total quantity delta 230, 40 missing,
  20 false-adds.
- Reference tables: Bessemer 12/12, ITD 34/34, Federal 27/31, NAVFAC
  25/31, Building 5406 0/0, Baker 16/21, ITD raster 0/0.
- Sheet graph: cells 91 right / 0 wrong / 0 missed; row-symbol recall 94.2%
  (131 found, 1 unexpected resolve, 8 missed).

Takeoff by set:

| Set | Exact | Quantity delta | Missing | False-add |
| --- | ---: | ---: | ---: | ---: |
| bessemer | 10/10 (100.0%) | 0 | 0 | 0 |
| itd-d1-lab | 114/116 (98.3%) | 3 | 0 | 0 |
| federal-mech | 77/83 (92.8%) | 6 | 1 | 18 |
| navfac-cherry-point-atc | 168/215 (78.1%) | 64 | 1 | 2 |
| bldg5406-hvac-demo | 10/23 (43.5%) | 13 | 10 | 0 |
| baker-county-eoc | 25/40 (62.5%) | 80 | 0 | 0 |
| itd-d1-lab-raster | 0/28 (0.0%) | 64 | 28 | 0 |

## Accepted changes

- Portable corpus PDF resolution for cloud, CI, and alternate checkout roots.
- Federal VAV key notes corrected after independently confirming all 58 VAV
  tags resolve in the current pipeline.
- Combined corpus evaluator reuses one takeoff pipeline pass for both takeoff
  and reference scoring. Full-corpus metrics were byte-for-byte unchanged;
  wall time fell from 3,875 seconds to 1,887 seconds (51.3% faster).
- Sparse tank schedules survive concatenated PDF-extractor titles and are
  promoted consistently on the ODL path. Building 5406 improved from 10/23
  (43.5%) to 11/23 (47.8%); missing tags fell from 10 to 9 and quantity delta
  from 13 to 12. Bessemer remained 100.0% and ITD remained 98.3%.
- Corpus-only schedule-row matching now generates and scores geometric
  candidates only inside the existing claim radius of that row's own drawn
  tag. Interactive/production sweeps retain their complete whole-sheet
  disclosure. The 116-tag ITD set fell from more than 134 seconds to 21.6
  seconds and produced byte-identical scored JSON.
- Complete per-set scorer results are content-addressed by engine/evaluator
  source, Node and dependency versions, PDFs, and authored keys. Takeoff and
  graph fan-outs run concurrently across the four-core coordinator. A verified
  unchanged full-corpus run now takes 3.68 seconds, down from 1,887 seconds;
  forced-cold recomputation takes 105.6 seconds. Current post-tank metrics
  remain 405/515 exact (78.6%), quantity delta 229, 39 missing, 20 false-adds;
  reference scores are unchanged and graph row-symbol recall remains 94.2%.
  `OPENTAKEOFF_EVAL_NO_CACHE=1` forces cold recomputation and
  `OPENTAKEOFF_EVAL_FULL_SWEEP=1` restores the complete production search for
  equivalence checks.
- First three-fix accuracy batch, independently verified forced-cold on
  2026-08-29 at commit `4f8a85c` (43.6 seconds):
  - Takeoff improved from the post-tank 405/515 (78.6%) to 420/515 (81.6%);
    quantity delta fell from 229 to 211 with missing/false-add counts unchanged
    at 39/20. Federal improved 77/83 → 82/83 and NAVFAC 168/215 → 178/215;
    ITD remained 114/116 and Bessemer remained 10/10.
  - Reference extraction improved from 114/129 to 116/129 exact. Federal's
    stranded `FT. H2O` header tier now promotes into the column name and both
    hydronic pressure-drop values score; all previously-exact cells remain
    exact.
  - Aligned same-sheet repeated views collapse only after four distinct
    schedule-tag landmark pairs establish registration. Repeated instances
    inside one view and fewer-than-four-pair controls remain untouched.
  - A separately corroborated inline hatch motif may supplement, never
    replace, whole-shape matches only for diffuser/grille/register schedules
    and only at still-unclaimed occurrences of that exact tag. The first
    corpus gate caught an over-broad version adding three ITD plumbing
    overcounts; schedule-family scoping removed all three before acceptance.
  - Graph metrics remain unchanged: 91/91 cells exact and 94.2% row-symbol
    recall. Web and MCP typechecks pass; MCP tests pass 246/246. The full web
    suite passes 1,897 functional tests plus its isolated dense-grid
    performance gate; the gate exceeded its wall-time threshold only when
    contending with the concurrently-run MCP suite, then passed alone in
    2.86 seconds.
- Second three-fix accuracy batch, independently verified forced-cold on
  2026-08-29 at commit `3164146` (46.5 seconds):
  - Takeoff improved again, 420/515 → 425/515 exact (81.6% → 82.5%);
    quantity delta fell 211 → 179 and missing tags fell 39 → 38.
  - Federal expected-tag accuracy reached 83/83 (100%): deep header-tier
    harvesting now advances the data boundary through every consumed tier,
    exposing the real one-row CHILLER SCHEDULE and resolving `CH-1`.
    The same extraction exposed one additional real scheduled/drawn `FCU-1`
    absent from the authored key, so false-add accounting is 19 pending key
    audit rather than silently suppressing a real row.
  - NAVFAC improved 178/215 → 181/215 exact (82.8% → 84.2%). Matched
    DUCT/PIPE enlarged-plan captions now define an off-center viewport split
    and corroborate weaker landmark alignment; `FCU-T15`, `B-T1`, and `DH-T1`
    each resolve from two redundant views to one.
  - Baker improved 25/40 → 26/40 exact and quantity delta fell 80 → 54.
    For a luminaire family dominated by 10+ single-span compound circuit
    labels, fingerprint candidates are ranked against those direct placement
    labels rather than unrelated bare text: `R1` now resolves 23/23.
    Variable-size air-device ranking also improves `CD-1` from 3 to 9, while
    its two `TYP N` multipliers remain unresolved (expected 21).
  - The first full gate of this batch exposed broad ranking regressions
    (`TD-1`, `TP-2`, `FS-1`, `HB-2`, `US-1`, and others). Two intermediate
    gates were rejected. The accepted implementation limits ranking to the
    structurally proven compound-label quorum and diffuser/grille/register
    families; the corrected gate restores ITD to 114/116 (98.3%) and
    Bessemer to 10/10.
  - The complete web suite then exposed three sparse-first-row regressions
    from the initial deep-tier boundary. The accepted boundary stops at the
    first leading digit-bearing equipment key; focused regressions pass,
    followed by the complete web suite (1,898 pass / 3 intentional skips),
    MCP suite (246/246), both typechecks, and the byte-identical corrected
    corpus result above.
  - Graph row-symbol recall improved 94.2% → 95.0% (Federal now 100%);
    reference metrics remain 116/129.
- First five-fix accuracy batch, independently verified forced-cold on
  2026-08-29 at commit `7977639` (53.5 seconds):
  - Takeoff improved 425/515 → 431/515 exact (82.5% → 83.7%); quantity
    delta fell 179 → 140. Baker improved 26/40 → 32/40 (65.0% → 80.0%).
  - Explicit adjacent `TYP N` multipliers now contribute their printed
    installed quantity. Baker `CD-1` resolves exactly 21.
  - A family-wide quorum of compound luminaire/circuit labels makes those
    labels direct instance evidence and excludes ambiguous bare short-code
    collisions outside that proven convention. `E2`, `R2`, `S1`, and `S3`
    now resolve exactly.
  - Reference improved 116/129 → 125/129 exact (89.9% → 96.9%). Literal
    inch marks survive CSV parsing, three stale NAVFAC point-list keys were
    corrected, and Baker control-station subrows now band correctly.
  - Graph remains 91/91 cells exact and 95.0% row-symbol recall.
- Second five-fix accuracy batch, independently verified forced-cold on
  2026-08-29 at commit `b1c1082` (45.9 seconds):
  - Takeoff improved 431/515 → 446/515 exact (83.7% → 86.6%); quantity
    delta fell 140 → 114. NAVFAC rose 181/215 → 194/215 (84.2% → 90.2%)
    and Baker rose 32/40 → 34/40 (80.0% → 85.0%).
  - Numeric AIA view registration (for example MH121/MP121), backed by
    coordinate proximity, collapses repeated discipline overlays.
  - Family-corroborated explicit air-device and luminaire labels recover
    variable-size devices and bare exit-sign labels without requiring one
    rigid perimeter fingerprint.
  - Exact two-run long-family tags such as `SCHWP` + `M1` now anchor. The
    first corpus gate exposed unsafe joins for short ITD tags; requiring a
    long family stem and alphanumeric unit suffix restored ITD to 98.3%.
  - Baker's transposed RTU-01 MCA key was corrected from MOCP `45 A` to
    printed MCA `33.0`; reference improved 125/129 → 126/129 (97.7%).
  - Graph remains 91/91 cells exact and row-symbol recall improves
    95.0% → 95.7%; NAVFAC reaches 100% row-symbol recall.
- Third five-fix accuracy batch, independently verified forced-cold on
  2026-08-29 at commit `a372424` (53.5 seconds):
  - Takeoff improved 446/515 → 456/515 exact (86.6% → 88.5%); excluding
    the intentional raster refusal set, the applicable result is 456/487
    (93.6%) with quantity delta 37.
  - Long-family stacked pump tags recover when PDF text extraction separates
    the alphanumeric suffix above or below its family stem.
  - Repeated appearances of individually numbered equipment marks across
    plans/details collapse to one scheduled unit. NAVFAC reaches 201/215.
  - The production query surface now exposes raw cells for every extracted
    table kind, not only tag-free reference tables. Reference reaches
    129/129 (100%) without a second PDF-processing pass.
  - Roof-drain labels on explicit roof plans count directly under a repeated
    family quorum; Baker `RD-1` reaches 4/4.
  - Tight cross-sheet registration overrides missing or incidental
    contradictory nearest-room text. ITD `US-2` and `WC-1` now close and the
    set reaches 116/116 (100%) while the distinct `SS-1` pair remains 2/2.
  - The first gate exposed an over-broad plumbing-label implementation that
    overcounted ITD. It was rejected, narrowed to roof drains, and the full
    gate was rerun before acceptance.
  - Reference is 100%; graph remains 91/91 cells exact and 95.7% row-symbol
    recall.
- Fourth five-fix accuracy batch, independently verified forced-cold on
  2026-08-29 at commit `48338a1` (55.3 seconds):
  - Takeoff improved 456/515 → 467/515 exact (88.5% → 90.7%); excluding
    the intentional raster refusal set, applicable takeoff improved
    93.6% → 95.9% and quantity delta fell 37 → 25.
  - Entire quarter-turned equipment tables now normalize into the ordinary
    multi-table extractor and map every cell citation back into source-sheet
    coordinates. Building 5406's nine-row AIR TERMINAL BOX SCHEDULE is now
    queryable and eight text-backed VAV takeoffs resolve.
  - MARK-keyed equipment headers, multipart numbered schedule sections, and
    concatenated extracted titles are handled without creating duplicate
    device definitions.
  - Exact plan labels can count individually numbered equipment when the
    surrounding symbol linework is not fingerprintable; repeatable type marks
    remain on their stricter family paths.
  - Cross-extractor table reads reconcile by exact sheet/title/key-set
    identity, keeping the more complete cells. Device-qualified identity
    columns such as VALVE MARK remain primary on valve schedules while UNIT
    MARK remains an accessory cross-reference.
  - Cross-sheet coordinate dedup now requires a second registered pair before
    overriding contradictory room reads, preventing coincidental alignment
    across different floors while retaining ITD's proven overlays.
  - Reference remains 129/129 (100%). Graph row-symbol recall improves
    95.7% → 97.8%; cells remain 91/91 exact.
  - Full regression suites pass: web 1,907/1,907 (3 intentional skips), MCP
    247/247, and both typechecks.
- Fifth five-fix accuracy/API batch, independently verified forced-cold on
  2026-08-29 at commit `a3f8c20` (55.6 seconds):
  - Takeoff improved 467/515 → 471/515 exact (90.7% → 91.5%); excluding
    the intentional raster refusal set, applicable takeoff improved
    95.9% → 96.7% and quantity delta fell 25 → 21.
  - The unattended project walker now follows the same uniquely-proven
    one-digit plan/schedule alias as the direct row sweep.
  - Multi-run tag recovery now supports quarter-turned chains while rejecting
    punctuation-only starts and preserving the horizontal negative controls.
  - A missing vector-outlined family prefix can recover from one bare suffix
    only when four distinct complete siblings establish the local convention,
    two sit near the suffix, and no second candidate competes. This closes
    Building 5406 VAV-6 without admitting ordinary plan numerals.
  - Production MCP now exposes `project_takeoff` for complete loaded-set
    takeoffs and `query_table` for arbitrary title/row/header queries. The
    latter returns the exact source sheet and bounding box for every cell.
  - Reference remains 129/129 (100%). Graph row-symbol recall improves
    97.8% → 98.6%; cells remain 91/91 exact.
  - Full regression suites pass: web 1,909/1,909 (3 intentional skips), MCP
    247/247, and both typechecks.
- Sixth accuracy/completeness batch, independently verified forced-cold on
  2026-08-29 at commit `7678a53` (55.4 seconds):
  - Takeoff now covers 534 keyed tags and scores 492/534 exact (92.1%);
    excluding the intentional raster refusal set, applicable takeoff is
    492/506 (97.2%) with quantity delta 17.
  - Federal's narrow 83-row key was audited against all positive project
    results and expanded with 19 independently scheduled and plan-located
    units (FCU, condensing units, DX fan coils, unit heaters, silencers, and
    fin-tube radiation). The expanded 102-row set remains 100% exact with
    zero false additions.
  - The taxonomy now names the observed CU-, EV-, CUH-, and FTR- equipment
    families instead of returning null classifications for real schedule
    rows.
  - Baker's HB-1 and E1 keys were corrected after full-sheet text/coordinate
    audits disproved two incomplete crop-based counts. Baker improves
    87.5% → 92.5%.
  - A broad plumbing-label supplementation attempt was rejected after the
    gate exposed ITD overcounts; it was fully reverted. The corrected gate
    restores ITD to 116/116.
  - Reference remains 129/129 (100%); graph remains 91/91 cells exact and
    98.6% row-symbol recall.
- Seventh five-fix accuracy batch, independently verified forced-cold on
  2026-08-29 at commit `362bc9c` (56.4 seconds):
  - Takeoff improves 492/534 → 495/534 exact (92.1% → 92.7%); excluding the
    intentional raster refusal set, applicable takeoff improves 97.2% →
    97.8% and quantity delta falls 17 → 14.
  - Exact roof-plan hose-bibb placements now share the existing conservative
    roof-drain path, gated on the graph-classified sheet title rather than
    incidental note text. Baker HB-2 closes while ITD controls stay exact.
  - A 0.90–0.92 air-device geometry match can commit only when the row's own
    exact tag sits beside it. Unlabeled variants remain withheld.
  - Unnamed one/two-digit tokens no longer count as room registration
    evidence across sheets. This prevents a detail numeral from collapsing
    two real `RG-12` placements.
  - Inline and whole-symbol candidates claiming the same exact tag bbox are
    reduced to one strongest claim. This closes the `RG-11` overcount.
  - NAVFAC improves 95.8% → 96.7%; Baker improves 92.5% → 95.0%.
  - The stale AC-1/ACCU-1 refusal expectation now records the production
    compound-key resolver; graph has zero unexpected resolutions.
  - Full regressions pass: web 1,910/1,910 (3 intentional skips), MCP
    247/247, and MCP typecheck.
- Eighth five-fix batch closed every remaining extractable quantity gap:
  - Parenthesized gang labels such as `(6) LD-1` are reconstructed as one
    placement mark; a four-hit air-device quorum safely skips unrelated
    content-stream distractors.
  - Explicit first/second-floor identities prevent same-coordinate devices
    on different levels from being collapsed as duplicate views.
  - NAVFAC's LD-1, LD-3, and TG-5 and Baker's final P1/V1 audit discrepancies
    are closed. A first gate exposed an ITD plumbing regression; scoping the
    quorum retry to air-device schedule titles restored ITD to 100%.
- Final outcome/production batch, independently verified forced-cold on
  2026-08-29 at commit `2cd532b` (56.2 seconds):
  - Takeoff is 541/541 outcomes exact (100%): 499/499 applicable installed
    rows, 14/14 expected honest refusals, and 28/28 intentional
    raster-unavailable rows.
  - Quantity delta, missing rows, and false additions are all zero.
  - Reference remains 129/129 exact (100%).
  - Graph is 91/91 cells and 138/138 expected row-symbol outcomes (100%).
  - Explicit prose placements (`CUH-T1 ON FLOOR 3; CUH-T2 ON FLOOR 5`) are
    returned with source coordinates; duplicate schedule-only notes do not
    multiply quantity.
  - Ambiguous duplicate keys are typed refusals, not generic errors.
  - Corpus keys now encode expected resolved/refused/unavailable outcomes,
    preventing a zero quantity from masquerading as a successful refusal.
  - `project_takeoff` and `query_table` were exercised through the production
    MCP registration on real sets; table answers include exact source bboxes
    and butterfly-valve takeoff refuses its unscaled legend honestly.
  - Final regressions pass: web 1,914/1,914 (3 intentional skips), MCP
    249/249, isolated dense-grid performance 3.09s, and both typechecks.

## Verified completion (keyed corpus)

The current **keyed corpus** goal is complete at 100% across takeoff outcomes,
reference cells, and graph row-symbol outcomes (commit `2cd532b`, 2026-08-29).

## Active overnight platform loop (2026-08-31+)

**Charter:** `opentakeoff-corpus/takeoffs/NEXT_GOAL_LOOP.md` · **CreateGoal**
set for autonomous iteration until the user stops the run.

**Bulk corpus in scope:** Vol1 (`bulk/HVAC_BAS_Plan_Sets`, ~30) **+ Vol2
entirety** (`bulk/HVAC_BAS_Plan_Sets_Vol2`, **all 82** INDEX sets — see
`GOAL.md` §8 and `takeoffs/VOL2_INTAKE.md`).

**Coordinator-only** — no cloud workers. Shared UI+MCP path for compile,
reconcile, and plan joins.

### Batch accepted this session (independently verified on branch)

- **WP2 CLOSED:** `T-VALVE-01` **LOCKED MCP 5/5 · UI 5/5** (Gates 1–5 live via
  `CEREBRAS_API_KEY`); SLATE + GOAL amended for third takeoff ID.
- **WP5 CLOSED:** Browser geometric fork removed; production HTTP for plan tools;
  UI graph prewarm (`schedules indexing…`) + `prewarmGraphSmoke.test.mjs`.
- **Bulk rescore (2026-08-31 tip `cdfded4`):** MEAT **20** · WEAK **2** · ZERO **9** (Douglas misc+VRF MEAT; SDSU 85; Kennebec+Suwannee honest WEAK).
- **Orange County cross-set key:** 32 VAV + **33** HVAC items (BP-1 only; fake HRC/UH dropped); reconcile scaffold test.
- **WP1 bulk keys:** Johnson (8), Kennebec (2), Northport (**16**), Spokane (5→**8**), Macon Bibb (5), Hawthorn (5), Suwannee (1), St Louis (30), Valdosta (16), Reid (12), Hurlburt (13), Colville (**50**), Baker MS (**21**), Klamath (**53**), Douglas (**18**), Jeff City CST (**32**), **SDSU EngSciences (208)**, **MSU Life Sciences (5)**, bldg5406 (**32**), Carson (**58**), federal-mech (**103**), **itd-d1-lab (93)** locked.
- **WP1.4 keyRe broaden:** BOILER1 marks, blank-title FCU/EV/EF/RF fan-coil rows — federal-mech later gains FIN_TUBE (100); two bulk WEAK→MEAT promotions.
- **WP1.4 CODE_RE + EQUIP.TAG + banding orphans:** `AHU-1A`-style digit+letter suffixes; `EQUIP. TAG` own-identity; seam-gap spans assigned to nearest band + thin identity-band absorb. Hawthorn **1→5**.
- **WP1.4 title hunt:** `\bSCHEDULE\b` (not SCHEDULED) — Northport AIR INLETS & OUTLETS recovers 12 GRD (**3→15**).
- **WP1.4 RADIANT_CEILING_PANEL:** ECP-* family — Johnson **7→8**.
- **WP1.4 St Louis / Valdosta families:** AHU `AC-*`; FCU `FCUC`; VAV `AIR TERMINAL UNIT`+`ATU-*`; GRD `AIR DEVICE`+`GRILLE SCHEDULE`.
- **WP1.4 FIN_TUBE_RADIATION:** FINNED PIPE / FIN TUBE titles (FT-/FTR-*) — Reid Hall **8→12**; federal-mech **96→100**.
- **WP1.4 (N)-prefix normalize:** strip `(N)/(E)` and glued `NACC`/`NATU` marks; CONDENSING `blankKeyRe` ACC/CU; Hurlburt **10→13**. NOTES: filter keeps Transbay at 10.
- **WP1.4 MAU / split-system FCU / BUFFER_TANK:** makeup-air titles; SPLIT-SYSTEM AC→FCU; BT-* buffer tanks — Baker later re-keyed honest; Colville later AS/ET keyRe; itd-d1-lab **35→44** (EH-1..9).
- **WP1.4 bare-TAG guard:** do not prefer grille type TAG over row.key (Colville FAN EF-* restored).
- **WP1.4 family keyRe tighten (shared path):** FCU `FC-##`; HEAT_PUMP HP/SCU/SAC + exclude ENERGY RECOVERY; HRC `CH-`/`HRC`; PUMP `HYDRONIC PUMPS` + exclude HEAT PUMP; UNIT_HEATER EH/UH + ELECTRIC HEATERS; AS `^AS` / ET `^ET|^XT` — Orange **43→33**, Baker **26→17**, Colville **27→23**, Klamath **35** new key.
- **WP1.4 VRF indoor + REF + EDH (shared path):** HEAT_PUMP `CC-*`/`AH-*` (not AHU); FAN `REF-*` relief; UNIT_HEATER `ELECTRIC DUCT HEATER`/`EDH-*` — Douglas **4→15** WEAK→MEAT; Jeff City CST **27** keyed.
- **WP1.4 PUMP VACUUM exclude:** drop `VACUUM PUMP SCHEDULE` from hydronic PUMP family — SDSU later **110** with LAB CAV.
- **WP1.4 LAB CAV → VAV:** `LAB CAV` / `CAV SCHEDULE` titles + existing `CAV-*` keyRe — SDSU later **117** with HX/coil/flash.
- **WP1.4 HEAT_EXCHANGER / DUCT_MOUNTED_COIL / FLASH_TANK:** shell-and-tube + water-to-water HX; duct-mounted CC/HC; FT-* flash tanks — SDSU **110→117**; Klamath **35→36**; Colville **23→27**.
- **WP1.4 WATER_TREATMENT:** RO/WT marks on water-treatment schedules — SDSU **117→118** (RO-1).
- **WP1.4 MISCELLANEOUS SCHEDULE gate:** keyRe-gated catch-all (compile + reconcile parity) — Douglas **15→18** (EH-20/30 + DOAS-30).
- **WP1.4 EQUIPMENT SCHEDULE catch-all + PUMP blankKeyRe (shared path):** bare `EQUIPMENT SCHEDULE` joins MISC catch-all; catch-all ORs `blankKeyRe|keyRe` (WSHP via HEAT_PUMP keyRe); PUMP `blankKeyRe` only (IWP/HWRP/HHWP) so titled pump schedules stay complete; `PUPSCHEDULE` OCR soft-match — Colville **27→42**; bldg5406 **24→27**; Las Vegas/federal PUMP keys unchanged. Verified: `test:workflows` **32/32**, unit title/reconcile **25/25**.
- **WP1.4 itd-d1-lab orphans (shared path):** `HOT WATER REHEAT COIL`→DUCT_MOUNTED_COIL; `HUM-*` humidifier; `MECHANICAL SPECIALTY EQUIPMENT` catch-all AS/ET; ductless split DFC/DCU→FCU (comma-split when keyRe filters; Baker ERV keeps row.key) — itd **44→58**.
- **WP1.4 LAB_AIR_VALVE + snorkel + DOAS SYSTEM + HYDRONIC ACCESSORIES (shared path):** pressure-independent SAV/GEV/SEV (HVAC only, not T-VALVE); SNORKEL HOOD→RANGE_HOOD; `DEDICATED OUTDOOR AIR SYSTEM`→DOAS; HYDRONIC ACCESSORIES catch-all AS/BT/ET — itd **58→84**; Klamath **36→45**.
- **WP1.4 gas-split indoor F-1:** FCU keyRe accepts `F-#` on split-system titles (not `CU-#`, preserves Colville/Carson) — itd **84→85**.
- **WP1.4 hydronic accessories families (shared path):** CHEMICAL_POT_FEEDER (PF), GLYCOL_MAKEUP (GMU), STRAINER (STR), BYPASS_CONTROL_VALVE (BCV), AIR_COMPRESSOR (titled only); AIR_SEPARATOR+HS; EXPANSION_TANK+DT; PUMP blankKeyRe+BS — itd **85→88**; Klamath **45→50**; Colville **42→47**.
- **WP1.4 FLOW_METER + CONTROL_DAMPER (shared path):** specialty `FM-*` catch-all (itd Onicon); titled `CONTROL DAMPER SCHEDULE` with OA/RA/EA/SA keyRe (Carson OA1/OA2; B1 building mark excluded) — itd **88→89**; Carson **56→58**. Negatives: Klamath 50, Colville 47, Baker 17, federal 100, SDSU 118, bldg5406 27.
- **WP1.4 LOUVER / LOUVERED_PENTHOUSE / FILTER + FIN_TUBE titledOnly (shared path):** wall louvers; PH/ALP penthouses; FILTER `FTR-*` on FILTER & STRAINER; `titledOnly` stops blank/catch-all FIN_TUBE stealing Colville filter/vibration FTR — itd **89→92**; Colville **47→50**; federal **100→103**. Reid FIN_TUBE 4 unchanged.
- **WP4 SDSU VAV sample MATCH lock:** CAV sample + floor ECAV (`N1/N2/S*`) MATCH under `evaluationFast`; basement ECAV NB/SB honest SCHEDULE_ONLY (full ECAV **16/25 MATCH**).
- **WP4 schedule-stem dup collapse:** same-sheet truncated title extracts (`…SCHEDULE` stem) no longer AMBIGUOUS — SDSU AHU **3/3 MATCH**; VAV sample MATCH locked (honest SCHEDULE_ONLY remainder).
- **WP4 Douglas DOAS:** misc-schedule **DOAS-30 MATCH** locked.
- **WP4 Jeff City CST:** VAV **9/9** + FCU **3/3 MATCH** (locked in `reconcileWorkflow.test.mjs`).
- **WP4 reconcile tag dedupe:** scaffold drops duplicate MARK extracts (Douglas HP-20 double table) — parity with compile `uniqueFamily`.
- **WP4 Orange County:** installed reconcile **32/32 VAV MATCH** + booster **BP-1 MATCH** (locked in `reconcileWorkflow.test.mjs`).
- **WP4 Hawthorn:** AHU **2/2** + CU **2/2** MATCH (digit+letter tags on plan).
- **WP4 St Louis:** VAV/ATU **12/12 MATCH** (AIR TERMINAL UNIT schedule ↔ plan).
- **WP4 Hurlburt:** AHU **2/2** + FAN **4/4 MATCH** (blank-title + (N)-normalized marks).
- **WP4 reconcile↔compile parity:** family-only `reconcileSchedulePlan` uses HVAC needles; scaffold accepts reference-kind GRILLE + `row.key` (Valdosta/St Louis GRD).
- **WP4 blank-title reconcile:** scaffold accepts blank-title+keyRe families (Macon Bibb FAN) — parity with compile `uniqueFamily`.
- **WP1.4 GRD plurals:** `GRILLES, REGISTERS, AND DIFFUSERS` title — Johnson County **4→7** MEAT.
- **WP1 Suwannee key:** honest WEAK RTU:1 locked.
- **WP3 CLOSED (except 3.3 TG bowtie follow-on):** Bessemer rowsym **100%** (15/15);
  `rowsymBessemer.regression.test.mjs`.
- **WP6:** `test:workflows` **33/33** after LOUVER/FILTER + points-takeoff hang fix (tip `df0add5`).
- **Agent hang fix (shared path):** generic “point list takeoff” → `corpus_bas` + `compile_corpus_takeoff kind=bas_points` (was deadlocking in `points_takeoff/spot_cites` while evidence gate demanded title-scan `POINTS LIST`). Defense: empty-title `points_takeoff` requires title_scans; evidence gate accepts bas compile.
- **Scale + legend honesty (shared path):** `sheet_graph` now exposes per-sheet `detected_scale` (NAVFAC: 23 numeric notes while cover says AS NOTED). Evidence gate rejects AS-NOTED-only refuse when tools already found numeric scales; rejects valve-symbol answers that overclaim plan highlights from legend-only / few paints. System prompt + symbol_sweep workflow: legend ≠ plan.
- **Force-read sheet index (agent surface):** `runAgentLoop` seeds a compact `sheet_graph` digest (roles, schedule titles/row counts, `detected_scale`) into the transcript before the first model turn — same pattern as the MCP demo runner. The model cannot skip calling the index; compaction keeps `detected_scale` (was previously stripped). Not a schedule-truth fork.
- **WP1.4 split outdoor CU/DCU (shared path):** `CONDENSING_UNIT.altTitleRe` + `altKeyRe` claims CU/DCU from SPLIT SYSTEM / DUCTLESS SPLIT SYMBOL columns without applying a CU filter to titled Carson B* CONDENSING UNIT schedules. DCU moved off FCU keyRe. itd-d1-lab **92→93** (CU-1 + DCU-1). Negatives: Carson 58/CU23, federal 103, Colville 50, Hurlburt 13, Hawthorn 5.
- **WP1.4 CEILING_FAN (shared path):** titled `CEILING FAN SCHEDULE` + `CF-*` (FAN already excludes ceiling fans). Jeff City CST **29→32**. Honest ZERO bulk sets re-probed (Augusta window-only; Iowa/Judson note spans; TroopB/KCHA/Vista/Ogden rejoined still 0 HVAC tables).
- **WP1.4 SDSU/bldg5406 orphan batch (shared path):** FAN `TEF`/`GX` + LABORATORY EXHAUST title; ELECTRIC HUMIDIFIER `EH-*` (titledOnly); FILTER `F-#` (titledOnly, no split-system steal); LOUER OCR → LOUVER; EPANSION/COMPRESSION OCR → EXPANSION_TANK. SDSU **118→123**; bldg5406 **27→30**; Valdosta **16→17**. Negatives: Colville 50, itd 93, Carson 58, federal 103. Rejected: softener `BT-*` (double-counts Colville BUFFER_TANK). Fume-hood ECV deferred.
- **WP1.4 Baker AHU + SDSU FUME_HOOD_DAMPER (shared path):** `AIR HANDLER HEAT PUMP` → AHU (comma-split with HEAT_PUMP HP-*); `normalizeEquipMark` strips SYMBOL CFM/size/room trailers (Baker GRD); titled `FUME HOOD … VAV … DAMPER` + `ECV-*` (titledOnly). Baker **17→20**; SDSU **123→181** (+58 ECV). Negatives: Colville 50, itd 93, Carson 58, Douglas 18, federal 103, Jeff City 32.
- **WP1.4 ECAV + VFD + split AC/ACCU (shared path):** VAV `ECAV-*` on LAB CAV; `VARIABLE_FREQUENCY_DRIVE` titled `VFD-*`; FCU `AC-*` + CONDENSING `ACCU` on SPLIT SYSTEM slash compounds. SDSU **181→206**; Spokane **5→8**; bldg5406 **30→32**. Negatives: Colville 50, itd 93, Carson 58, St Louis 30, federal 103, Baker 20.
- **query_table token-boundary soft match (shared path):** `HUMIDIFIER SCHEDULE` no longer matches `DEHUMIDIFIER SCHEDULE` (mid-token includes). ELECTRIC HUMIDIFIER / compact no-space titles still hit. CABINET UNIT HEATER no longer matches UNIT HEATER.
- **WP1.4 SPLIT SYSTEM HEAT PUMPS → FCU (shared path):** indoor `FC-*` on split heat-pump titles (Klamath FC-01/02 beside HP-*). Klamath **50→52**. Negatives: Colville 50, itd 93, Baker 20, Douglas 18, Carson 58.
- **WP4 SDSU ECAV reconcile sample:** plan-drawn floor ECAV (`N1/N2/S*`) MATCH locked with CAV sample; basement `ECAV-NB-1` swept negative → SCHEDULE_ONLY. Full ECAV census **16/25 MATCH · 9 SO** under `evaluationFast`.
- **WP1 honest ZERO bulk keys:** Ogden, TroopB, Augusta, Iowa State, Vista, Judson, KCHA, JPS, weld-mech — compile totals **0** locked (no silent HVAC inflation). Re-probed 2026-08-31.
- **WP4 Spokane VFD reconcile:** all 3 `VFD-*` SCHEDULE_ONLY under `evaluationFast` (honest — tags not plan text). SDSU CAV sample expanded (`S1-4/S1-7/S2-3/S3-3`).
- **equipment_schedule needles (shared path):** FUME HOOD VAV DAMPER / ECV, VFD, CEILING FAN title suggestions; AHU needle accepts `AIR HANDLER HEAT PUMP`.
- **WP4 reconcile comma-split parity (shared path):** `normalizeEquipMark` no longer strips `AHU-1, HP-1` before split; `rowIdentityTag` returns raw marks (normalize after split, same as compile). Baker HEAT_PUMP scaffold **2→5** (HP-1..3 restored). Baker GRD **4/4 MATCH** + outdoor HP-5/6 MATCH locked; Douglas VRF/HP sample MATCH locked.
- **WP4 same-sheet shadow-extract collapse (shared Session.sweepScheduleRow):** thinner same-sheet rows whose cell values are covered by a denser sibling are excluded (not AMBIGUOUS). Baker UNIT_HEATER EH-* and Klamath PUMP (untitled hydronic summary) no longer AMBIGUOUS. Cross-sheet / equal-richness twins still refuse.
- **WP1.4 FAN KEF blank-title (shared path):** `KEF-*` kitchen exhaust on blank-title summaries + `KITCHEN EXHAUST FAN SCHEDULE` title signal. Klamath **52→53** (FAN:1). Negatives: SDSU FAN 5, federal FAN 4, itd FAN 7, Baker FAN 2.
- **WP4 Baker EH MATCH + Klamath KEF SO:** after shadow collapse, Baker UNIT_HEATER **4/4 MATCH**; Klamath blank-title KEF-1 honest SCHEDULE_ONLY under `evaluationFast`.
- **WP4 glued compound rowKeyAnswersFor (shared path):** comma + glued `AHU-1HP-1` keys answer for each half (digit+letter suffixes like `AHU-1A` do not split). Baker AHU **3/3 MATCH** + indoor HP-1/2/3 MATCH (was false SCHEDULE_ONLY — sweep could not find the row).
- **WP1.4 ERV keyRe + ERV-paired HP (shared path):** `ERU-*/ERV-*` keyRe comma-splits SYMBOL; HEAT_PUMP no longer excludes ENERGY RECOVERY titles so outdoor HP-* halves join. Baker **20→21** (HP-4); ERU-1 + HP-4 **MATCH**. Negatives: Colville 50, itd 93, federal 103, Klamath 53.
- **WP1.4 VACUUM_PUMP (shared path):** titled `VACUUM PUMP SCHEDULE` + `V-*` (titledOnly; hydronic PUMP still excludes VACUUM). SDSU **206→207** (V-1). Negatives: Colville 50, itd 93, Carson 58, Baker 21, Klamath 53, federal 103.
- **WP1.4 BRINE_TANK (shared path):** titled softener/brine schedules + `BT-*` (titledOnly — Colville BUFFER_TANK BT-* unchanged). SDSU **207→208** (BT-1). Negatives: Colville 50 (BUFFER intact), itd 93, Carson 58, Baker 21.
- **WP4 SDSU vacuum/softener MATCH:** `V-1` + `WS-1` MATCH under `evaluationFast`; brine `BT-1` + flash `FT-1` honest SCHEDULE_ONLY.
- **WP4 prefer-schedule sweep (shared Session.sweepScheduleRow):** callers that already know the owning table (`preferSheet`/`preferTitle` from family reconcile scaffold + project-takeoff row walk) disambiguate shared building letters across distinct equipment schedules. Carson CONTROL_DAMPER/OAU/RTU/ERV/FURNACE/CONDENSING/RANGE_HOOD **all MATCH** under `evaluationFast` (was heavy AMBIGUOUS). Unscoped `sweep_schedule_row B1` still AMBIGUOUS (honest). Negatives: Baker EH, Klamath PUMP, SDSU vacuum/softener. `test:workflows` **41/41**.
- **WP4 titled-first family collect (shared compile+reconcile):** `uniqueFamily` + reconcile scaffold claim titled schedules before blank/catch-all so Colville ERV-1 cites `ENERGY RECOVERY VENTILATOR SCHEDULE` (not blank seismic summary). Sheet-only prefer also narrows to the unique non-blank title. Colville ERV **MATCH**. Compile totals held: Colville 50, Carson 58, itd 93, Baker 21, Klamath 53, federal 103.
- **WP1.4 ampersand equip marks (shared path):** `expandAmpersandEquipMarks` + prefer ampersand TAG over glued `row.key` — Northport `RF-1 & 2` → RF-1/RF-2 (FAN **1→2**, total **15→16**). Negatives: Colville 50, itd 93, Carson 58, Baker 21, federal 103.
- **WP4 Hurlburt ATU spaced marks (shared path):** `rowKeyAnswersFor` strips revision/`N` prefixes (`NATUK1`↔`ATU K1`); `sweepScheduleRow` prefers the plan-drawn spaced MARK form. Hurlburt VAV **ATU K1/K2 MATCH** (was SCHEDULE_ONLY). Negatives: Carson prefer-schedule, Colville ERV, Baker EH, SDSU vacuum. `test:workflows` **43/43**.
- **WP1.4 / BAS I/O LIST titles (shared path):** `isBasPointsListTitle` accepts POINTS LIST / DDC POINTS / I/O LIST / IO LIST; column-label TAG rows skipped; title-only schematics stay empty. Colville **bas_points 0→42** (I/O LIST WHITE STURGEON PLC). NAVFAC T-BAS-01 still **122** rows / 5 lists. Negatives: SDSU HVAC 208 / BAS 0.
- **WP4 SDSU FAN MATCH lock:** all 5 scheduled FAN tags MATCH under `evaluationFast` (EF-1-ABC, EF-2-ABCD, TEF-1, TEF-2, GX-1). Northport RF-* remain honest SCHEDULE_ONLY (no plan text). `test:workflows` **44/44**.
- **WP1.4 / BAS I/O LIST ANALOG/DIGITAL rollup (shared path):** device rows without AI## MARK prefixes accumulate ANALOG→AI and DIGITAL→BI point totals (direction not distinguished). Colville **AI 0→33 · BI 0→21** (rows stay 42). NAVFAC T-BAS-01 still **122** rows / AI43 AO15 BI49 BO15.
- **WP4 Northport FAN honest SO lock:** RF-1/RF-2 SCHEDULE_ONLY under `evaluationFast` (no drawable plan text) — ceiling documented beside SDSU FAN MATCH.
- **Vol2 batch-1 intake (shared path):** FAN keyRe `S-A-*`/`R-A-*`/`DSF`/`EG`/`SEF`; UNIT_HEATER `ECUH`/`HWUH` + duct-heater titles; DUCT_MOUNTED_COIL `HWC`; BAS `DDC CONTROLLER INPUT/OUTPUT` titles. NIST **13→19**; Missoula **12→30**; Lab BAS **0→63** rows / 3 lists; APHIS **10→15**. Keys: 5 MEAT + 1 WEAK + 2 ZERO under `cross-set-compile/`. Unit + Vol2 acceptance **8/8**.
- **Vol2 batch-2 intake (shared path):** RTU `PACKAGED EQUIPMENT SCHEDULE (RTU)` + `RTU-*` keyRe; UNIT_HEATER `GUH`/`NUH`; DOAS `DEDICATED OUTSIDE AIR SYSTEM`. Locked **12** more Vol2 keys (7 MEAT / 3 WEAK / 2 ZERO) including ATC tower **396** HVAC + **122** BAS. Vol2 keyed total **20**. Acceptance **12/12**. Suwannee RTU negative still **1**.
- **Vol2 batch-3 intake (shared path):** building-prefix `markCoreForKeyRe` (WHSE-ET-1→ET-1; reject catalog `TPLFY-EP15NEM4`); VRF_INDOOR/OUTDOOR; humidifier OCR/SH digit-gated; EXPANSION SYSTEM + zone-letter ET-A1; BUFFER GST-*. Locked **12** more Vol2 keys (5 MEAT / 2 WEAK / 5 ZERO) including warehouse **89** + chiller/VRF **15**. Vol2 keyed total **32**/82. Negatives: Orange `SHT. NO.`, Iowa `ETC.…`, Douglas model→EP pump, Missoula ET-A1 retained.
- **Vol2 batch-4 intake (shared path):** PUMP hydronic titles without SCHEDULE; AIR_SEPARATOR plural + `IAS-*`; titled HEAT_EXCHANGER keeps set-local marks; HHW/CHW start-anchored bare `VALVE SCHEDULE` + `V-HHW*`/`V-CHW*` (unanchored form regressed NAVFAC 396→233 by forcing altKeyRe on CONTROL VALVE titles). Locked **12** more Vol2 keys (7 MEAT / 3 WEAK / 2 ZERO) including VA ER **43** (38 HHW valves; GRD drops header `MIN.`) + ITD lab **93** (incl. 9 HHW reheat CVs). Vol2 keyed total **44**/82.
- **Schedule header junk gate (shared path):** reject `MODEL`/`TAG`/`MIN.`-class labels on titled schedules without keyRe (Colville HX was 6→4 false). Do **not** require digits on unfiltered titled marks — that dropped NAVFAC letter-suffix valves (`CV-CHW-BP-A`, 396→391 / 163→158).
- **Vol2 batch-5 intake (shared path):** `DUCT_MOUNTED_COIL` accepts `ELECTRIC DUCT COIL` + `DH-*`. Locked **12** more Vol2 keys (1 MEAT / 5 WEAK / 6 ZERO) including Miller dining **14** + Renne Library **11**. Vol2 keyed total **56**/82.
- **Warehouse HX recovery:** titled HEAT_EXCHANGER blankKeyRe path recovers WHSE-HX* — warehouse key **89→91**. HEAT_PUMP title still matches Baker-shaped `ENERGY RECOVERY … (WITH HEAT PUMP)` so outdoor HP-* halves compile; keyRe keeps ERU-* on ERV.
- **Vol2 batch-6 intake (shared path):** Locked remaining **13** single-file INDEX sets (2 MEAT / 4 WEAK / 7 ZERO) including Town Offices **12** + Vermillion Jail **131** HVAC / **231** BAS. Vol2 keyed total **69**/82 (all single-file INDEX sets keyed; **13** multipart rejoins remain).
- **044 HX recovery:** titled HEAT_EXCHANGER recovers FHX-* — main-boilers key **28→30**.
- **Vol2 batch-7 intake (shared path):** Ran `REJOIN_full_sets.sh` (qpdf); locked **13**/13 multipart rejoins (3 MEAT / 5 WEAK / 3 ZERO) including chiller upgrade **32**, NY EHRM **18**, Jonesboro VRF **24**; LBNL honest ZERO (311 sheets). Workflow `graphForKey` prefers `_rejoined/` then merges `source_parts_dir`. Vol2 keyed total **82**/82 (all 13 multipart rejoins keyed, incl. PHX **64** + FL airport **20**).
- **WP4 Vermillion County Jail VAV reconcile:** Vol2 **096** bulk **58/58 VAV MATCH** under `evaluationFast` (locked in `reconcileWorkflow.test.mjs`).
- **WP4 Vol2 MEAT rejoin reconcile locks (012 chiller ACC/PUMP/VFD, 089 FL airport DOAS/HP/PUMP/WH/FAN, 088 PHX plant+terminal families):** multipart-aware `loadKeySession` helper; locked in `reconcileWorkflow.test.mjs`. `test:workflows` **50/50** green (2026-09-01).
- **WP4 Vol2 MEAT reconcile sweep (unlocked leftovers):** APHIS **009** AHU/ACC/pump/fan MATCH (UH 4/5); NIST **017** fan+humidifier MATCH (duct coils SO); MO steam **024** RTU 4/4; Patriot Cafe **042** GRD 5/5; LAMBDA **060** duct coils MATCH · GRD 6/10; West Valley **072/074** FAN 10/11 + ERV; lab **021** + Bldg615 **028** honest plant SO. WEAK BAS drift audit: **0**. `test:workflows` **83/83** green (2026-09-01).
- **WP4 WEAK/MEAT reconcile deepen:** Renne **075** AHU/HP/ERV/coil MATCH (GRD SO); JVWTP **097** all MATCH; Bruneau **098** FCU/fan/UH MATCH; Harrison **063** GRD MATCH; Antelope **068** boiler MATCH; NY EHRM **030** pumps 14/15; Irish Hill **016** AHU MATCH. `test:workflows` **90/90** green (2026-09-01).
- **WP4 Vol1 plant + WEAK remainder:** Las Vegas CUP **04** CT MATCH · pumps 11/12; Colville **27** fans MATCH · pumps 13/14; unheated **008** UH+louver; NC EHRM **034** pumps; sterile **049** compressors; sterile **041** GRD; ITD D2 **069** honest plant SO. `test:workflows` **97/97** green (2026-09-01).
- **Pillar A deepen — dampers/valves + POINTS SCHEDULE (shared path):** `CONTROL_DAMPER` altTitleRe `MOTORIZED DAMPER SCHEDULE` + `MD-*`; `ISOLATION_VALVE` (bare `VALVE SCHEDULE` + `VLV-*`), `PRESSURE_REDUCING_VALVE` (`PRV-*`), `MIXING_VALVE` (`MX-*`/`MV-*`); `isBasPointsListTitle` accepts `POINTS SCHEDULE` (not SOO “point list table”). Key lifts: pier **015** 47→83 (+21 MD +15 VLV), sterile **040** 24→29 (+5 PRV), FL airport **089** 20→22 (+2 MX), lab **021** 64→66 (+2 PRV). Vermillion **096** BAS unchanged (231). Negatives: T-VALVE/BAS/HVAC-01 locked. Prep for Pillar C — not commercial valve/BAS workflows yet.
- **Pillar B locks on new damper/valve families:** pier **015** CONTROL_DAMPER 21/21 MATCH · ISOLATION_VALVE 13 MATCH / 2 SO; sterile **040** PRV honest SO; FL airport **089** MIXING_VALVE 1 MATCH / 1 SO; lab **021** PRV honest SO. Focused reconcile locks green. `test:workflows` **97/97** after 021 PRV key fix (2026-09-01). Full `reconcileWorkflow` **86/86** with new locks.
- **Pillar B WEAK leftover SO ceilings:** unlocked thin WEAK sets **066**/ **033**/ **067**/ **078**/ **013** locked as honest SCHEDULE_ONLY (HP/humidifier/GRD, AHU/pump, HX/GRD, FAN, VFD). No false MATCH inflation.
- **Pillar A/B — STEAM PRV compact titles (shared path):** `PRESSURE_REDUCING_VALVE` altTitleRe `STEAM PRV` / `PRV SCHEDULE` (excludes FLASH TANK). SDSU **11** 208→210 (+2 PRV-1A/1B); reconcile **2/2 MATCH**. Unit + T-VALVE/BAS/HVAC-01 green.
- **Pillar A/B — motorized *D dampers + plant isolation/PSV (shared path):** `CONTROL_DAMPER` altKeyRe `/^[A-Z]{1,3}D[\s\-]?\d/i` (JED/PED/MD on MOTORIZED DAMPER SCHEDULE; OA/RA stay primary-only); `ISOLATION_VALVE` keyRe adds `IV|ISO|GV|BV`; new `PRESSURE_SAFETY_VALVE` (`PSV-*`); `normalizeEquipMark` strips building-letter `"B GV-7"`; `BOILER` titleRe = `HOT WATER (CONDENSING) BOILER` | `BOILER SCHEDULE` (keeps Klamath/Antelope; excludes plant isolation boards). Key lifts: Vermillion **096** 131→155 (+24 CONTROL_DAMPER; reconcile 12 MATCH / 12 SO); main boilers **044** 30→41 (+8 ISOLATION honest SO, +4 PSV honest SO; BOILER 5→4 honest). Pier **015** unchanged. Unit + T-VALVE/BAS/HVAC-01 + focused reconcile green.

### Active goal (platform loop)

**Foundation:** Trust and genuine agnostic blueprint workflows are our main
goal and our foundation — shared Session+ODL path, set-agnostic, cite-honest,
UI+MCP parity, no corpus hardcodes.

| Pillar | Scope | Status |
|---|---|---|
| **A — Cross-set compile** | Vol1 + Vol2 (82/82 INDEX) schedule compile | **§6 MET** — 82/82 Vol2 + Vol1 keys; soft titles + sibling-exclusion; T-HVAC-01/T-BAS-01 green; honest WEAK/ZERO stable |
| **B — Reconcile** | Schedule↔plan with contractor columns+cites | **§6 MET** — on `main`; NAVFAC + Vol1/Vol2 bulk locks; Agent UI proof; WORKFLOWS **#51 ON_MAIN**; full `test:workflows` **104/104** |
| **C — Estimator takeoff + plan paint** | Corpus-deep points + valve/damper/actuator takeoffs; every BAS set + every valve set self-checked and pipeline-corroborated | **Not done** — WP7/WP8 printed-list plumbing only. **Stop condition:** every corpus BAS set and every corpus valve set has coordinator-verified truth + GT/pipeline corroboration. Today ~5 BAS keys / ~12 valve-family keys are the floor to deepen, then expand to all bearing sets. T-BAS-01 122 ≠ complete points takeoff. `test:workflows` **104/104** green post-WP8 (plumbing). |
| **D — Symbol-count grounding** | Symbol counts highlighted and accurate on plan | **Queued** — WP9 after C takeoff+paint bar |

Authority: `GOAL.md` · `takeoffs/NEXT_GOAL_LOOP.md`.

### §6 A+B gate evidence (2026-09-01 coordinator — **MET**)

1. Pillar A: Vol2 INDEX **82/82** compile keys + Vol1; `T-HVAC-01` / `T-BAS-01` LOCKED.
2. `T-VALVE-01` LOCKED MCP+UI 5/5.
3. WP3: Bessemer rowsym ≥90% (`rowsymBessemer.regression.test.mjs` pass).
4. Pillar B: reconcile locks include Las Vegas CUP **04**, Colville **27** pumps/fans, Vol2 WEAK leftovers honest SO, Klamath FC/HP/DOAS honest SO; Orange County / Vermillion Jail VAV MATCH; Playwright Agent UI proof.
5. §6 judgment leftovers focused **7/7** (Orange County 32/32 · Vermillion 58/58 · Klamath honest SO · WEAK SO · Las Vegas CUP 04 · Colville 27 · Colville ERV-1).
6. Shared-path: `planToolParity` + `prewarmGraphSmoke` pass.
7. WORKFLOWS **#51** → **ON_MAIN**; merge stack on `main`.
8. Non-NAVFAC complete/family compile + reconcile via bulk keys + UI path (no per-job title hardcodes).
9. Fast workflow locks **12/12**.
10. **Full `npm run test:workflows` green — 104 pass / 0 fail** (~36 min), including WP1 keyed Vol1+Vol2 compile. Log: `/opt/cursor/artifacts/workflows-full-suite.log`.

**Where we refuse (not done — never a success metric):** Klamath FC/HP/DOAS
SCHEDULE_ONLY under `evaluationFast`; WEAK/ZERO compile keys where no
extractable tables; WP3.3 TG bowtie follow-on. Refuse/stop = unfinished work.

### Pillar C depth mandate (2026-09-01 — user)

Pillar C is **corpus-complete or it is not done**. Coordinator must personally
verify the right answer on each BAS set and each valve set, then corroborate
via the shared-path pipeline / GT harness. Sample proofs and POINTS LIST
scrapes do not satisfy the mandate.

**Census (INDEX-derived, 2026-09-01):** Vol1+Vol2 = 112 sets. **BAS-bearing ≈112**
(Vol2 all carry BAS terms; 5 currently keyed with `bas_points.rows>0`).
**Valve/damper-bearing ≈81** (11 keyed with valve/damper family counts).
Estimator-complete + self-check + pipeline GT: **0 / 112 BAS**, **0 / 81 valve**.
Artifact: `/opt/cursor/artifacts/pillar-c-corpus-census.json` ·
`takeoffs/pillar-c-census.json`.

**NAVFAC 001 deep probe (PARTIAL, not done):** HVAC inventory + printed BAS 122;
`served_equipment` DOAH-T1/AHU-T1A/T1B plan paint MATCH; SOO **honest refuse**;
UH labeled estimate 11×6=66; FCU×qty **honest refuse**. Valve identity fix:
reconcile now prefers `VALVE MARK` over `UNIT MARK` — HHW/CHW row counts match
keys (64/64, 99/99); most valve marks honest **SCHEDULE_ONLY** (CV-* not plan
text). Shared-path unit test green. Draft GT still `gt_locked: false`.
**NAVFAC 001 deepening:** Coverage matrix — POINTS served only AHU-T1A/B + DOAH-T1; AHU-A/M and DOAH-A/M lack unit lists (honest gap). Plan-paint regression 3/3 PASS. Still unlocked.
**NAVFAC 001 drawing-backed verify (2026-09-01, still unlocked):** D10 fixture
(PDF byte-identical to Vol2 001) — D10 totals match; **25/25** stratified POINTS
cell sample corroborated via `findText` (contiguous desc); AI10 follow-up +
AHU-T1A/B 24/24/14 split match D10 truth; missing-unit POINTS refuse **6/6**
(AHU-A1/A2/M1, DOAH-A1/A2/M1 — no POINTS LIST title/phrase); CV sample **12/12**
schedule±legend only (legend ≠ plan paint; SCHEDULE_ONLY ceiling holds). Still
blocks lock: FCU×42 coil multiply refuse, SOO refuse, estimator-complete BAS
beyond printed 122, corpus-deep C. Artifacts:
`/opt/cursor/artifacts/pillar-c-navfac-001-drawing-verify.{json,md}` · draft
`takeoffs/pillar-c-gt/001_…gt.draft.json` `drawing_verify`.

**Pier 015 probe (PARTIAL, drawing-backed):** BAS 39=key; `served_equipment`
joins CCC/P/MPAC/HPAC/FC (no longer treats `AI-1` hyphen points as equipment).
Plan paint MATCH: CCC-1, CCC-2, P-1/2, FC-3; MPAC×4/HPAC×3 honest miss (no equipment
schedule rows). CONTROL_DAMPER 21=key; ISOLATION_VALVE 15=key. Drawing verify
2026-09-01: **25/25** POINTS cell sample; damper sample honest (MD-11 MATCH via
sweep on plan #6; exact findText schedule-only noted); iso sample **8/8** MATCH
with plan text; SOO refuse. Draft GT still `gt_locked: false`. Artifact:
`/opt/cursor/artifacts/pillar-c-pier-015-drawing-verify.json`.


**Vermillion 096 probe (PARTIAL, drawing-backed):** BAS 231=key across ~10 generic
"SCHEDULE OF DDC POINTS" lists; only **HRC-1** has served_equipment (plan paint
MATCH). Inventory without POINTS joins: **78** → qty×points HONEST_REFUSE.
CONTROL_DAMPER 24=key · drawing sample **10/10** honest. POINTS cell sample
**25/25 PASS**. SOO refuse. Draft GT still `gt_locked: false`. Artifact:
`/opt/cursor/artifacts/pillar-c-vermillion-096-drawing-verify.json`.

**Lab 021 drawing-backed (PARTIAL, unlocked):** BAS 63=key · POINTS sample **25/25**
from DDC I/O legend/summary (ignore narrative chiller "POINT LIST TABLE"). Served
tags lack equipment schedule rows (honest sweep ERROR). PRV×2 keyed. SOO open.

**Colville 027 drawing-backed (PARTIAL, unlocked):** BAS 42=key · I/O LIST WHITE
STURGEON PLC · sample **25/25** (BS-1PNL printed as "BS-1 PNL"). EP-4 paint MATCH;
most served tags no schedule rows. No valve families keyed. SOO open.

**Keyed BAS floor (5/5) drawing-sampled, 0 locked:** 001, 015, 021, 027, 096.
Estimator-complete + corpus-deep C still **0 / 112 BAS**, **0 / 81 valve**.




**Valve-keyed drawing floor (2026-09-01, all unlocked):** Completed drawing-backed
valve/damper samples on remaining keyed valve-only sets: **040** PRV 5/5 SO;
**044** ISO 8 + PSV 4 all SO; **053** HHW CV 38 (sample 8/8 SO); **062** / **itd-d1-lab**
HHW CV 9 MATCH + LAB_AIR 21 MATCH + BYPASS 1 MATCH; **089** MIX 2 (1 MATCH/1 SO);
**11** FUME_HOOD_DAMPER 58 (sample honest; 11 MATCH/47 SO) + PRV 2 MATCH; **16**
CONTROL_DAMPER 2/2 MATCH. Counts matched keys; samples honest vs reconcile. Still
`gt_locked: false` on every set. Artifacts: `/opt/cursor/artifacts/pillar-c-*-valve-drawing-verify.json`
+ `pillar-c-valve-keyed-batch-summary.json`.

**Keyed floor status:** 5/5 BAS + 8/8 valve-only drawing-sampled · **0 locked**.
Corpus-deep C still **0 / ~112 BAS**, **0 / ~81 valve** after key expansion.

**Refuse language (2026-09-01 — user clarification):** Tables labeled “honest
ceiling” / SCHEDULE_ONLY / SOO refuse are **unfinished work**, not locked truth.
Prefer **“Where we refuse (not done)”**. Printed POINTS/I/O rows alone never
mean Pillar C done. Shared-path `basEstimatorStatus` / `estimator_status` on
every BAS compile now emits `estimator_complete: false`, `gt_locked: false`,
and `refuse_not_done` gates (SOO points, spare I/O, proofs/interlocks beyond
printed, GT lock). Takeoff panel surfaces `BAS_ESTIMATOR` refuse rows so UI
cannot read a POINTS scrape as complete. Title near-miss scan: Northport bare
`INPUT/OUTPUT SUMMARY` correctly rejected (system matrix ≠ typed points).
**0 sets locked.**

**Estimator product path (2026-09-01 — shared UI+MCP, still not C done):**
`compileBasTakeoff` attaches `estimator_product`: HVAC point-bearing inventory +
SOO presence disclose + labeled `estimate_only` schedule qty×points/unit totals
(never merged into printed `totals.rows`) + inventory↔printed gap + ASHRAE G13
spare % policy note. `compileControlValveTakeoff` attaches parallel
`estimator_product` / `estimator_status` (contractor-column coverage, plan-paint
`refuse_not_done`, gt_lock). Takeoff emits `BAS_ESTIMATOR` and `VALVE_ESTIMATOR`
rows. Unit tests **37/37** green.

**Keyed BAS floor live product (2026-09-01, still 0 locked):**

| Set | Printed BAS | Inventory | Estimate_only pts | Gap | SOO | Valves | Valve column gaps |
|---|---:|---:|---:|---:|---|---:|---|
| 001 NAVFAC | 122 | 143 | 965 | 125 | absent/not detected | 163 | Actuator/Fail/Signal |
| 015 Pier | 39 | 17 | 71 | 14 | absent | 36 | Served/Size/GPM/Cv |
| 021 Lab | 63 | 44 | 279 | 44 | present_not_row_extractable | 2 | Size/Cv/Actuator/Fail |
| 027 Colville | 42 | 22 | 71 | 8 | absent | 0 | — |
| 096 Vermillion | 231 | 92 | 437 | 74 | absent | 24 | Served/Size/GPM/Cv |

All five: `estimator_complete: false`, `gt_locked: false`. Artifact:
`/opt/cursor/artifacts/pillar-c-keyed-bas-valve-estimator-floor.json`.

**Keyed BAS estimator gap/SOO drawing verify (2026-09-01, still 0 locked):**
Coordinator corroborated inventory↔printed gaps + SOO status on all 5 keyed BAS
sets. Method: tag on HVAC inventory, absent from POINTS list titles + printed
`served_equipment`, SOO status match. **Never locks GT.**

| Set | Gap verify | SOO | Artifact |
|---|---|---|---|
| 001 NAVFAC | **6/6** AHU-A/M + DOAH-A/M | absent match | `pillar-c-001-estimator-gap-verify` |
| 015 Pier | **14/14** all gap tags | absent match | `pillar-c-015-estimator-gap-verify` |
| 021 Lab | **44/44** all gap tags | present_not_row_extractable match | `pillar-c-021-estimator-gap-verify` |
| 027 Colville | **8/8** all gap tags | absent match | `pillar-c-027-estimator-gap-verify` |
| 096 Vermillion | **60/60** of 74 (product sample cap) | absent match | `pillar-c-096-estimator-gap-verify` |

Batch: `/opt/cursor/artifacts/pillar-c-estimator-gap-verify-keyed-floor.json`.
Draft GTs patched with `estimator_product` + `estimator_gap_drawing_verify`;
still `gt_locked: false` / `estimator_complete: false` on every set.

**Valve estimator contractor-column honesty (2026-09-01, still 0 locked):**
Recount of `normalizeControlValveCells` vs `estimator_product.contractor_column_coverage`
on **11** keyed valve sets — **all_honest: true** (missing lists match; 7/7 columns).
Examples: NAVFAC 001 missing only Actuator/Fail/Signal (Served/Size/GPM/Cv present);
053 Size present; dampers/iso often missing served+size+Cv. Still
`gt_locked: false`. Artifact:
`/opt/cursor/artifacts/pillar-c-valve-estimator-columns-batch.json`.
Corpus-deep C still **0 / ~112 BAS**, **0 / ~81 valve**.

**Expanded estimator_product census (2026-09-01, 15 bearing sets, still 0 locked):**
Live compile on controls/HVAC-named sets beyond the 5 keyed BAS floor — **0**
new printed BAS lists (title gate + empty tables honest). **11/15** still emit
inventory + labeled `estimate_only` + gap with `estimator_complete: false`
(e.g. SDSU 11: inv 128 / est 708 / gap 78; Klamath 14: inv 37 / est 307;
ITD 062: SOO `present_not_row_extractable`). Valve families continue to compile
where schedules exist. Artifact:
`/opt/cursor/artifacts/pillar-c-estimator-product-census-batch.json`.
**No new BAS keys** — do not invent POINTS from equipment schedules.

**bas:0 inventory drawing verify (2026-09-01, still 0 locked):** SDSU 11 inventory
sample **20/20** on drawing (printed BAS 0); Klamath 14 **15/15** on drawing
(printed BAS 0). Draft GT created/patched; `gt_locked: false`. Artifact:
`/opt/cursor/artifacts/pillar-c-inventory-drawing-verify-batch.json`.

**bas:0 inventory expanded (2026-09-01, 57 inventory + 7 zero floors = 64 floors, still 0 locked):**

| Set | Inv | Est pts | Sample on drawing | SOO |
|---|---:|---:|---|---|
| 11 SDSU | 128 | 708 | **20/20** | absent |
| 14 Klamath | 37 | 307 | **15/15** | absent |
| 062 ITD | 16 | 88 | **16/16** | present_not_row_extractable |
| 05 St Louis | 14 | 89 | **14/14** | absent |
| 04 Las Vegas CUP | 16 | 60 | **16/16** | absent |
| 044 Boilers | 22 | 90 | **13/15** (FOP-2/34 miss) | absent |
| 040 Sterile | 8 | 24 | **8/8** | absent |
| 25 Douglas | 3 | 27 | **3/3** | absent |
| 10 Hawthorn | 2 | 42 | **2/2** | absent |
| 017 NIST | 6 | 18 | **6/6** | absent |
| 16 Carson | 6 | 90 | **6/6** | absent |
| 01 Northport | 3 | 27 | **3/3** | absent |
| 03 Hurlburt | 11 | 73 | **11/11** | absent |
| 06 Jeff City CST | 14 | 87 | **14/14** | absent |
| 12 Reid Hall | 4 | 20 | **4/4** | absent |
| 17 Suwannee | 1 | 15 | **1/1** | absent |
| 18 Baker MS | 6 | 84 | **6/6** | absent |
| 21 Orange County | 33 | 163 | **15/15** | absent |
| 22 Valdosta FS8 | 5 | 33 | **5/5** | absent |
| 23 Macon Bibb | 4 | 17 | **4/4** | absent |
| 24 Johnson Co | 3 | 19 | **3/3** | absent |
| 26 Transbay | 7 | 35 | **7/7** | absent |
| 30 Spokane Transit | 5 | 24 | **4/5** (1 miss) | absent |
| 004 Interior Reno | 12 | 138 | **12/12** | absent |
| 009 APHIS | 9 | 63 | **9/9** | absent |
| 012 Chiller Behavioral | 16 | 57 | **15/15** | absent |
| 014 Missoula Fire | 14 | 90 | **14/14** | absent |
| 016 Irish Hill | 1 | 21 | **1/1** | absent |
| 018 Poultry | 1 | 3 | **1/1** | absent |
| 019 Eglin | 83 | 430 | **20/20** | absent |
| 023 Salinity | 2 | 6 | **2/2** | absent |
| 024 Steam Heat | 4 | 60 | **4/4** | absent |
| 028 Bldg 615 | 7 | 81 | **7/7** | absent |
| 030 EHRM NY | 15 | 50 | **15/15** | absent |
| 031 Warehouse MO | 12 | 54 | **12/12** | present_not_row_extractable |
| 032 EHRM PA | 1 | 3 | **1/1** | absent |
| 033 Construct MN | 3 | 27 | **3/3** | absent |
| 034 EHRM NC | 2 | 6 | **2/2** | absent |
| 037 AHU AR | 1 | 3 | **1/1** | absent |
| 041 Sterile IL | 3 | 19 | **3/3** | absent |
| 042 Patriot Cafe | 1 | 3 | **1/1** | absent |
| 047 Chillers NC | 3 | 9 | **3/3** | absent |
| 061 Ames Wilhelm | 23 | 92 | **20/20** | absent |
| 063 Harrison Extruder | 2 | 10 | **2/2** | absent |
| 067 SLAC PCW | 2 | 6 | **2/2** | absent |
| 068 Antelope Valley | 4 | 18 | **3/4** (1 miss) | absent |
| 069 ITD D2 Lab | 9 | 57 | **9/9** | absent |
| 071 Health Science ME | 21 | 103 | **20/20** | absent |
| 072 West Valley Sci | 11 | 33 | **11/11** | absent |
| 074 West Valley STEM | 11 | 33 | **11/11** | absent |
| 075 Renne Library | 2 | 42 | **2/2** | absent |
| 078 Sparty Store | 1 | 3 | **1/1** | absent |
| 083 Town Offices MA | 4 | 32 | **4/4** | absent |
| 088 Sky Harbor | 31 | 155 | **20/20** | absent |
| 094 Orange Hist | 6 | 111 | **6/6** | absent |
| 097 JVWTP Chem | 1 | 15 | **1/1** | absent |
| 098 Bruneau Shed | 5 | 25 | **5/5** | absent |

All printed BAS 0 · estimate_only never merged · **0 locked**. Same batch artifact.
Wave-2 product census (18 more bearing sets): **11/18** inventory-bearing, **0** new printed BAS lists.
Wave-3 product census (18 more): **11/18** inventory-bearing, **0** new printed BAS lists.
Wave-4 product census (20 more): **9/20** inventory-bearing, **0** new printed BAS lists;
031 Warehouse SOO `present_not_row_extractable` (same class as ITD 062).
Wave-5 product census (24 more): **11/24** inventory-bearing, **0** new printed BAS lists.
Wave-6 final remaining pool (11): **4** inventory (all green) + **7** honest zero-inventory floors;
**0** new printed BAS lists. Remaining-pool census complete for bearing names.
Artifacts: `/opt/cursor/artifacts/pillar-c-estimator-product-census-wave2.json`,
`/opt/cursor/artifacts/pillar-c-estimator-product-census-wave3.json`.

**Plan-paint census — keyed floor (2026-09-01, still 0 locked):**

BAS `served_equipment` sweep with product `preferTitle` (full tag census):

| Set | Targets | MATCH | SO | AMB | Status |
|---|---:|---:|---:|---:|---|
| 001 NAVFAC | 120 | **116** | 4 | 0 | partial (most units paint; 4 honest SO) |
| 015 Pier | 26 | **19** | 7 | 0 | partial (pumps/fans largely MATCH) |
| 021 Lab | 73 | 0 | **73** | 0 | honest SO ceiling (tags not on plans) |
| 027 Colville | 51 | **32** | 19 | **0** | partial (was 11 AMBIGUOUS — sheet pairing fix) |
| 096 Vermillion | 75 | **59** | 16 | 0 | partial (VAV/FCU/AHU largely MATCH) |

Artifact: `/opt/cursor/artifacts/pillar-c-bas-plan-paint-preferTitle-recensus.json`.

Valve reconcile rollup (MATCH / SCHEDULE_ONLY):

| Set | Items | MATCH | SO | Notes |
|---|---:|---:|---:|---|
| 001 NAVFAC | 163 | 3 | 160 | CV mostly schedule-only (honest) |
| 015 Pier | 36 | 34 | 2 | iso/damper largely plan-text |
| 062 ITD lab | 31 | **31** | 0 | full MATCH |
| 16 Carson | 2 | **2** | 0 | dampers MATCH |
| 053 ER | 38 | 0 | **38** | all SO (honest) |
| 11 SDSU | 60 | 13 | 47 | hood dampers mostly SO |

Artifact: `/opt/cursor/artifacts/pillar-c-plan-paint-census-keyed-floor.json`.
`estimator_product.plan_paint` stays **`refuse_not_done`** until corpus-complete.
Regression: `basServedEquipmentPlanPaint.test.mjs` **3/3** green.

**bas inventory floors — corpus-wide (2026-09-01, 112/112 floors checked, still 0 locked):**
Every BAS-bearing set now has either a drawing-backed inventory sample or an honest
zero-inventory floor from product census. Keyed printed-BAS sets also sampled
(001/015/027/096 **20/20**; 021 **18/20** honest misses; 089 airport **13/20**).
This is **not** Pillar C complete — SOO/I/O/spare/proofs + valve estimator + pipeline GT remain.

**Valve product census + PDF text audit (2026-09-01, 81/81, still 0 locked):**
Live `compileCorpusTakeoff(..., control_valves)` on every valve-bearing set.
**11/81** have printed valve/damper schedule rows — keyed family sets today.
**70/81** compile-empty. **PDF text scan** (`pillarCValvePdfTextScan.mjs`, ~2 min):
**0/81** PDFs valve/damper-text-free; **63/70** compile-zero PDFs still contain
valve/damper signals; **17/70** hit tabular schedule language compile still misses.
Compile-empty is an **extraction gap**, not verified-empty. Contractor-column
honesty verified on the 11 keyed. Do **not** invent valve keys from equipment
schedules. Artifacts: `/opt/cursor/artifacts/pillar-c-valve-pdf-text-scan-all.json`,
`/opt/cursor/artifacts/pillar-c-valve-product-census-all.json`.

**SOO deepen — present_not_row_extractable (2026-09-01, still 0 locked):**
Coordinator drawing/text probe on 021 Lab, 031 Warehouse, 062 ITD Lab.
- **062:** SOO title + live text `BOILER/VFD/AHU POINTS LIST` on sheets 18–19, but
  **0 geometric tables** on those sheets → cannot promote to printed BAS without
- OCR/raster/VLM assist is ON the shared pipeline when vector paths fail; honest
  `present_not_row_extractable` when all layers refuse.
- **021 / 031:** SOO present / phrase hits; still refuse SOO-derived points.
Artifacts: `/opt/cursor/artifacts/pillar-c-*-soo-probe.json`,
`pillar-c-062-points-list-near-miss.json`, `pillar-c-062-points-list-title-assoc.json`.

### Next queue (platform loop)

1. **Pillar C (corpus-deep):** inventory floors **112/112** + valve product census **81/81** (11 printed / 70 compile-empty) but **0** estimator-complete;
   deepen SOO/I/O/spare/proofs on keyed+SOO-present sets; expand valve contractor columns
   beyond 11 keyed; pipeline GT lock only when complete. Prior: 1. **Pillar C (corpus-deep):** Gap/SOO + valve columns + plan-paint census on keyed floor;
   BAS inventory floors **112/112** checked (drawing or honest zero) — **0 locked**. Next: extend inventory
   + plan-paint to more bearing sets; tabular SOO where vector allows; expand keys only
   when live compile finds real lists; lock only with self-check + pipeline GT on
   **every** BAS + valve set.
   Post-WP8 `test:workflows` **104/104** green (plumbing only — not C done).
2. **Pillar D:** WP9 symbol-count highlight-accuracy proofs (≥3 bulk).
3. WP3.3 TG bowtie dedicated detector (tracked follow-on).
4. Optional: BlueprintParser_OS as complementary LLM recall only — never qty/cite truth.

Cloud dispatch and all subagent dispatch remain prohibited (2026-09-02: user
directed coordinator-only — no `Task` / `computerUse` / cloud workers).

### Active: L0–L5 takeoff JSON batch emit (2026-09-02)

**Policy:** coordinator-only; prewarm-first (see `GOAL.md` § execution policy).

| Step | Command | Status |
| --- | --- | --- |
| 1 Prewarm ×4 | `prewarm:corpus:shard{0..3}` sidecar off | **in progress** |
| 2 Emit ×4 | `emit:corpus:shard{0..3}` `--resume` | pending warm cache |
| 3 Gap pass | `emit:gap` sidecar on | pending base 116 |
| 4 Scoreboard | `npm run eval:corpus` | pending 116/116 files |

Target: **116** `opentakeoff/out/<set_id>.takeoff.json` via shared
`Session.graphForPipeline` + `buildEstimatorTakeoffDocument`. MVP gates remain
honest (`corpus_pass_rate ≥ 0.95` not claimed until measured).

## Rejected or deferred approaches

- NAVFAC per-area row-key scoping: zero scored NAVFAC tags are currently
  blocked by `AMBIGUOUS_ROW_KEY`; the remaining ambiguous marks have no
  extracted area qualifier and resolving them would increase false-adds.
- Taxonomy-only score fix: equipment-table rows are already swept regardless
  of taxonomy classification. Prefix additions improve labels but do not close
  the measured score gap.
- OCR, raster vision, learned symbol detection, and local VLM are ON the shared
  vector pipeline when they genuinely improve recall — vector-first always.
# BAS snapshot UI wrap-up — 2026-09-10

User requested finish-current-work, merge to main after conflict/check verification,
and a detailed user-impact report to conserve usage. No new feature phase started.
The isolated BAS branch now has a public scoped snapshot reader/approval/import/
export journey; two actual-Python real-PDF browser proofs passed with controlled
review declarations. 26 focused client/storage tests pass. Full final web check
passes: 2,918 pass / 13 existing skips / zero failures, all configured benchmarks
and build. MCP/package/Python and remote merge checks remain.
Details: `opentakeoff/docs/bas-production/SNAPSHOT_UI_PROOF.md`. No new corpus score
or holdout claim. Full BAS goal remains incomplete; currentness/revocation, memory,
Agent orchestration, point identity and final symbol acceptance remain open.

## One-prompt Agent BAS hardening — 2026-09-12 active

Shared-path work on `codex/agent-bas-end-to-end`; no VectorGrid extraction,
row/column, citation, or bbox contract changed in this batch.

- Reproduced and fixed drawing-group reuse on the real 75-sheet NAVFAC set.
  `CD-1` is keyed by authored drawing group + schedule family + tag: AIR OPS
  **32 placements / 32 installed**, MTRACON **21 placements / 24 installed**
  (authored `(4)` multiplier), ATCT **1 / 1**. The unscoped reused `SG-1`
  negative refuses instead of being assigned to a building by guess. Additive
  GT: `ground_truth/air_devices/navfac-cherry-point-cd1-groups.json`; real-PDF
  gate passes.
- Full post-index `buildPlanSetTakeoff` on the seeded production graph improved
  **167,471 ms → 94,529 ms → 32,106 ms → 13,181 ms** as repeated table/plan
  work was removed without widening symbol thresholds. Current result:
  **426 attempted equipment rows, 259 resolved, 167 refused, 0 errored, 657
  grounded installed units**. Refusals are **165 SYMBOL_FALSE_NEGATIVE** (mostly
  valve schedule marks not individually labeled on plans) plus **2 authored-
  group association refusals**. They remain unknown/schedule-only, never zero.
- Corrected schedule-row identity on the shared path: VALVE MARK beats served
  UNIT MARK for control-valve families. A missing valve mark can no longer fall
  back to an AHU/FCU tag and count the served unit as the valve location.
- Corrected equipment/points domain separation. Six BAS points tables classified
  structurally as `equipment` had injected **152 AI/AO/BI/BO identifiers** into
  the installed-equipment walk. Current full walk has **0 point identifiers**;
  all tables remain available to the BAS compiler and exports.
- Visually reviewed the complete NAVFAC points inventory on rendered pages
  **52, 54, 56, 58, 60, 62, 64–71**. Shared compile now accepts singular
  `POINT LIST`, excludes four section-label rows per table, types wildcard marks
  (`BI#`, `BI##`, `BO#`) from the cited MARK cell, and merges same-page fragments
  under one title. Page 62 is one authored **102-row** list, not two product lists.
  Exact result: **21 lists / 546 rows / 210 AI / 66 AO / 189 BI / 81 BO**, all
  typed; the original independently authored **5-list / 122-row** truth remains
  unchanged as a locked subset. Additive full GT:
  `ground_truth/bas_points/navfac-cherry-point-full-points-inventory.json`.
  `test:bas-points-inventory` passes with exact per-list counts, valid MARK bboxes,
  vector-grounded cite samples, and CRAH negative control.
- Fixed HVAC contamination exposed by the old truth: `CRAH DDC POINTS LIST`
  was counted as **17 extra CRAH units**. A global BAS-table boundary restores
  the independently frozen HVAC result to **396 items / 6 CRAH**, while BAS keeps
  all 21 lists.
- Focused gates green: BAS/HVAC title and row semantics **54/54**, takeoff domain
  boundary/classifier tests **2/2**, grouped air-device real-PDF gate, expanded
  BAS-points real-PDF gate, web and MCP typechecks. Cold content-addressed
  T-BAS/T-HVAC regressions are still running after graph-source invalidation;
  do not report the batch final until their result lands.

Still not production-complete: broad valve plan grounding remains mostly
schedule-only; schematic/riser node-edge-direction/floor truth is not yet diverse
enough to claim arbitrary-diagram reliability; actual one-prompt Agent UI run,
screenshots, export/review journey, full corpus regressions, merge and push remain.

### Principal-engineer diagram frontier — 2026-09-12 active

The shared `controlSchematic.ts` path now separates raw-vector computation from
semantic understanding. `topology.status=computed` can no longer imply that a
mechanical/BAS diagram is understood. Every control schematic, flow/piping
diagram, mechanical riser, and BAS network riser carries an independent semantic
status plus deterministic principal-engineering blockers. The Agent receipt and
Takeoff evidence rows surface that status; raw crossings/traces never become
installed quantities. VectorGrid/table extraction and existing bbox contracts
remain untouched.

- **Transbay M4.04–M4.06 real-PDF gate:** exact 25/26/15 unique floor datums,
  11 authored CHW/HW/condenser-water service groups, all four cross-sheet
  continuation callouts, one adjacent negative, and 177 raw vertical candidates
  retained as unresolved (not counted risers).
- **Norfolk AM610/AM702 real-PDF gate:** exact 15 + 11 valve-tag identities,
  exact explicit text-backed NO/NC states, and all **9** independently reviewed
  normal-state contradictions emitted as `design_clarification_required` with
  tag and state citations. Normal state is never relabeled as fail/command state.
- **LBNL J601 real-PDF gate:** exact five authored floor datums; BACnet,
  BACnet/IP, BACnet MS/TP, CMnet, Modbus, UFT Network and Ethernet distinguished
  as protocol/named-network/physical-link evidence; nine required TCP/CM tags;
  22 cited ME Stack labels; reviewed roof-floor placements; two adjacent
  negatives. The 8 vertical candidates and 385 raw crossings remain unresolved.
- Added cited floor-band placement for diagram-tag and network-component
  occurrences. This is diagram location evidence only, never installed
  multiplicity or connectivity.
- Added conservative explicit-I/O binding: an instrument receives AI/AO/DI/DO
  only when an explicit printed I/O token, the instrument label, and collinear
  vector tether are all present. ITD M6.3 has seven visually reviewed bindings
  (PDT/TT/P to AI and CSR to DI) with three operand citations; unrelated nearby
  mnemonics remain untyped.
- Fixed a real SOO applicability defect found by the new gate. Similar diagrams
  on ITD M6.4/M6.5 formerly inherited multiple same-sheet SOOs from loose word
  overlap. Ranked exact-token matching now yields **9/9 exact one-to-one**
  schematic-to-SOO bindings, with explicit `bound/ambiguous/unbound` status.

Verified gates: shared diagram unit/Agent-summary/evidence tests **45/45**,
web typecheck, `test:bas-drawings`, `test:bas-risers`,
`test:bas-piping-states`, and `test:bas-network-riser`. Honest ceiling: these
are evidence inventories and bounded semantic relationships, not yet verified
complete equipment-port-device graphs. Full edge/branch/port semantics,
cross-sheet riser graph linkage, broader project diversity, Agent UI walkthrough,
full regressions, merge, and push remain.

## One-prompt Agent BAS integration closeout — 2026-09-13

**Shared-path decision:** schedule/table identity, BAS point-list cleanup,
schedule quantities, installed-plan quantities, reconciliation, citations, and
control-schematic inventory are shared takeoff truth. Their changes live in the
shared graph/reconciliation/session path consumed by both browser and MCP. UI
interaction remains surface-specific. This closeout does not introduce or tune
symbol-recognition thresholds; unfinished competing-sweep experiments were
removed so this branch retains the last verified symbol behavior while the
separate symbol workstream continues. VectorGrid row/column extraction and bbox
contracts remain unchanged.

- Recovered split/rotated schedule captions conservatively from geometric, ODL,
  and VectorGrid tables. Complete authored captions are never expanded into a
  neighboring schedule. On NAVFAC page 43 this preserves both the distinct
  `CABINET UNIT HEATER SCHEDULE` and `UNIT HEATER SCHEDULE`, restoring the
  previously frozen HVAC inventory to **396** without collapsing five UH rows.
- Removed only sparse BAS section headings (`ANALOG/BINARY/DIGITAL INPUT/OUTPUT`)
  from point-list rows while preserving real described points. NAVFAC D03 is
  exactly **62** authored point rows rather than 66; point evidence retains its
  source bbox/citation.
- Corrected schedule-versus-installed semantics for individually marked
  equipment, repeated air devices, authored quantity multipliers, and grouped
  tags. Unknown plan placement remains refused/schedule-only rather than being
  converted to zero or guessed.
- Corrected two source truths after rendered-PDF review: Federal D04 contains
  **58** VAV schedule rows (the apparent `SUITE 100` token is title-block text),
  and Baker's complete caption is `PACKAGED ROOFTOP AIR CONDITIONING UNIT
  SCHEDULE (GAS HEAT)`.
- Exposed `analyze_control_schematics` in the intentional Agent setup stage and
  retained cited schematic/riser evidence in the unified receipt. Added explicit
  VectorGrid shutdown hooks so full MCP/corpus suites terminate instead of
  appearing hung. Fixed the DXF export ownership stamp without changing export
  geometry.

### Real Agent UI product-path proof

The literal prompt **`Run a BAS takeoff.`** was sent through the browser Agent
UI with live Cerebras and no mocked tool responses or direct compiler shortcut:

| Plan set | Post-index wall time | Evidence-backed result |
| --- | ---: | --- |
| NAVFAC Cherry Point | 38.2 s | 396 HVAC items; 21 point lists / 546 rows; 8 SOOs; 163 valves; 293 reconciliation rows; 9 schematics / 1 riser; 3,381 cited rows |
| ITD laboratory | 62.6 s | 97 HVAC items; 13 SOOs; 31 valves; 37 reconciliation rows |
| Baker County EOC | 106.5 s | 11 HVAC items; 2 SOOs; reconciliation 10/10 |
| Federal attachment 4 | 108.1 s | 267 compiled rows; 3 point lists; 13 SOOs; 1 riser; 99 reconciliation rows |
| Tarrant negative control | 11.5 s | Truthful empty equipment result; 0 line items; 1 cited riser-evidence record |

All five runs completed below the three-minute post-index requirement. Artifacts
(screenshots, recording, receipt/CSV) are retained under
`/tmp/opentakeoff-complete-bas-agent-*` on the coordinator host.

### Final verification before integration

- Web: **3,085 pass / 0 fail / 13 intentional skips**; typecheck, lint
  (**0 errors; 3 pre-existing warnings**), and production build pass.
- MCP: BAS core **131/131**; revisions **33/33**; issues **6/6**; scope
  **17/17**; main suite **305 pass / 0 fail / 113 intentional skips**;
  packaging/proof **4/4**; typecheck passes. Cross-corpus structural compile
  completed in **280.7 s**.
- Shared focused symbol/sweep regression set: **217/217** passes with no new
  recognition algorithm in this branch.
- Python BAS suite: **502 pass / 1 skip**; mypy passes across 21 files.
- Real-PDF BAS drawing, riser, piping-state, network-riser, points-inventory,
  air-device-group, and product-path gates pass.

**Honest ceiling:** this proves a fast, cited, human-reviewable BAS takeoff path
on five diverse real product-path runs and guarded deterministic workflows. It
does not prove perfect recognition on arbitrary drawings, complete semantic
port/branch graphs for every schematic, or production-grade symbol recognition
in dense affine cases. Those outputs remain explicit refusals/review items; the
separate symbol workstream owns that remaining recognition frontier.

### Local-runtime and consolidated-workspace continuation — 2026-09-13

**Shared-path decision:** no extraction, matching, quantity, table, citation or
bbox rule changed in this continuation. The consolidated Takeoff label and local
launcher are browser/development presentation and runtime concerns, so they stay
surface-specific. VectorGrid and the separate symbol-recognition workstream are
untouched.

- A normal local Vite start could appear healthy while using system Python, then
  lose all five retained BAS workflows when the Agent crossed into `bas_engine`
  (Pydantic v1/v2 mismatch). `npm run dev` at the `opentakeoff` root now validates
  Python 3.11+, Pydantic v2 and the installed BAS package, provisions the ignored
  repo-local `.venv-bas` on first use, and launches Vite with the verified
  interpreter. The root launcher also preserves ordinary Vite flags. A real
  root-command launch on `127.0.0.1:5184` passed without a second terminal or a
  manually exported BAS-Python variable.
- The five compilers previously left Takeoff labeled as the final embedded-coil
  subcompile. The browser now applies presentation-only `complete_bas_takeoff`
  metadata after every canonical compile/reconcile/inspection result is retained.
  The workspace reads **BAS PROJECT TAKEOFF**, explains the consolidated evidence
  domains, and keeps its mandatory human-review gate. A regression assertion
  rejects both a missing consolidated heading and the stale
  `T-VALVE-EMBEDDED-01` heading.
- The exact Agent prompt **`Run a BAS takeoff.`** was replayed from a fresh browser
  against the canonical focus-corpus copy of the 29-sheet ITD District 1
  Laboratory PDF. Its SHA-256 equals the already reported raw ITD proof, so this
  is a launcher/UI regression replay, **not a sixth independent project**.
  Post-index wall time was **38.8 s** under the **180 s** SLA. Result: **97** cited
  takeoff lines, **13 SOOs / 53 sections**, **31 control-valve items**, **13 control
  schematics**, **74 explicit schematic point tokens**, and **37** reconcile rows
  (**36 MATCH / 1 SCHEDULE_ONLY**, **48** grounded instances). It truthfully
  reports **0** typed point lists and **0** risers for this source rather than
  fabricating either. The Takeoff reader exposed **321** row citations and **24**
  table citations; CSV export, five workflow inspections, and the human-review
  release state passed with no page or console errors.
- Verification after the continuation: web **3,085 pass / 0 fail / 13 intentional
  skips**, typecheck, production build, and lint (**0 errors; the same 3 pre-existing
  warnings**) pass. Live proof artifacts are at
  `/tmp/opentakeoff-complete-bas-agent-itd-d1-launcher/` on the coordinator host.

### Tinker controls-only SOO generalization — 2026-09-13

**Shared-path decision:** accepting a compact authored system tag after an SOO
caption and delimiting the source body from an adjacent upstream detail change
sequence truth, so both fixes live in the shared `sequenceNarrative.ts` path
consumed by browser and MCP. The consolidated evidence counts, honest empty
quantity state, direct sequence-reader navigation, and browser journey assertions
are presentation/test concerns and remain surface-specific. VectorGrid, schedule
row/column extraction, bbox semantics, and symbol recognition are unchanged.

- Added an independently human-reviewed 31-page controls project from the focus
  corpus: Tinker AFB IWCS monitoring/control drawings, SHA-256
  `ffbae6e626baa25c4c2a1ab033ab596e647a5d3903853ecc07b4f8db297f854a`.
  Versioned source: `raw/tinker-afb-iwcs-controls.pdf`; ground truth:
  `ground_truth/sequences/tinker-afb-iwcs.json`.
- Before the fix, the literal complete-Agent path found **0** sequences because
  the five captions end with compact authored tags (`IW-LS-3`, `IW-LS-10`,
  `IW-LS-2280`, `IW-LS-6N`, `IW-LS-6S`) without punctuation. The shared extractor
  now returns the exact **5/5** captions and **30** retained sections on Y-301,
  Y-302, Y-303, Y-304N, and Y-304S. Y-204 remains an exact zero negative control.
- A matching detail caption above an under-detail SOO now forms a conservative
  narrative boundary. Neighboring schematic labels such as `MS1 RUN AUTO SW`,
  `TO IWTP`, `STATION VAULT`, and `FLOW METER` are excluded while every required
  pump-control, sump-level, alarm, and horn-silence clause remains cited. A
  negative unit case still rejects instruction prose that merely says to verify
  a tagged sequence.
- A controls-only upload no longer looks like a broken takeoff. The consolidated
  header reports **5 sequences / 30 sections**, the Takeoff tab truthfully says
  no quantity-bearing schedule rows were found, and a direct **Review sequences**
  action opens the source-bound reader. Narrative sections are never converted
  into fake equipment rows or an invented quantity of one.
- The live, unmocked browser journey uploaded the real PDF and sent the literal
  prompt **`Run a BAS takeoff.`**. It completed in **16.8 s post-index** under the
  180 s SLA. The receipt contains all five compiler stages, reconciliation,
  five workflow inspections, mandatory human review, **5 SOOs / 30 sections**,
  and an honest zero for equipment, typed point-list, valve, schematic, riser,
  and reconcile quantities absent from this drawing set. The reader exposes
  all five sequence choices, six cited clause rows for the selected sequence,
  six source buttons, drawing navigation, and a 4.1 MB source-bound BAS
  evidence/history export. No page or console errors occurred. Artifacts:
  `/tmp/opentakeoff-complete-bas-agent-tinker-final-3/`.
- Real-PDF SOO corpus is now **4 documents / 12 positive pages / 5 negative
  pages / 18 expected sequences**, all exact. Existing control-schematic and
  control-network corpora also pass unchanged.
- Final gates: web **3,089 pass / 0 fail / 13 intentional skips**, every configured
  benchmark, typecheck, production build, and lint (**0 errors; same 3 warnings**);
  MCP BAS **131/131**, revisions **33/33**, issues **6/6**, scope **17/17**, main
  suite **305 pass / 0 fail / 113 intentional skips**, packaging/proof **4/4**,
  and typecheck. The MCP cross-corpus structural compile completed in **581.2 s**.

**Honest ceiling:** this closes the observed compact-tag/adjacent-detail SOO gap
and proves a useful controls-only product journey. It does not convert narrative
requirements into verified I/O types, establish equipment applicability without
an estimator link, infer installed quantities from SOO prose, or prove arbitrary
schematic/riser semantic graphs. Those remain explicit review blockers; the
separate symbol-recognition workstream remains outside this branch.

### Shared affine symbol arbitration checkpoint — 2026-09-13

The shared Session symbol path now retains the complete rigid baseline inside
the affine pass and arbitrates the fully labeled results by exact PDF tag bbox.
The current 47-case manifest has zero `affine:false` and zero `variant_guard`
exceptions; a fresh uninterrupted product-Session run passes **47/47** exact
counts and authored one-to-one localizations. Agent/MCP replies retain explicit
transform-competition and tag-corroboration accounting, and the browser
fallback preserves options through the production CLI into Session. No
VectorGrid, schedule/table, citation or bbox contract changed.

Current supporting gates: focused engine 201/201; MCP conformance 19/19, tools
101/101, bridge parity 3/3, packaging 4/4; full web 3,139 pass / 0 fail / 13
intentional skips; typechecks/build/diff/lint pass (lint has the same three
existing warnings). The fresh 47-case browser product-path gate is still in
progress, so the repository-wide BAS goal remains active.
