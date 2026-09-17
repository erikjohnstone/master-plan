# How the linear trace engine is tested (GATE 3)

`trace_run` (#linear-takeoff WP3) walks a sheet's own drawn duct/pipe linework from a seed point and reports the run's length, size, and confidence. `web/bench/linear.mts` (WP1.6) originally scored only the MANUAL-mode concerns — parity, totals, determinism — and said outright, in its own header, that it was "deliberately NOT the full run-recall/precision/Fréchet/vertex-F1 suite... that's WP3+'s trace-engine scoring, and has no meaning yet [for manual mode]." This note is that scoring, and what it currently finds — so the next checkpoint starts from the number, not from scratch, same discipline as `docs/MEP-CONNECTIVITY-EVAL.md`. Runs 1-2 below were measured with a since-retired standalone script (`mcp/scripts/linear-trace-eval.mjs`); Run 3 migrated that scoring into `bench/linear.mts` itself, per the goal document's own explicit architecture (see "The ruler," below) — the findings from Runs 1-2 remain true and are kept here as history, not superseded.

## The ruler

**`web/bench/linear.mts`** (`npm run bench:linear` from `web/`) is the plan's own explicitly-named home for this: "LINEAR BENCH... Pinned real goldens (`ground_truth/linear/*.json`, authored from renders) + synthetic truth-by-construction sheets... Reports... run recall / precision (discrete Frechet < 2 pt, length overlap >= 80%)..." — ONE bench, not a separate ad-hoc script, scored against BOTH corpora:

- the synthetic truth-by-construction corpus (`bench/linear/corpus/*.json` + `bench/linear/synthetic/*.pdf`, WP1.6's own generator) — reported, not gated (see Finding 5 on why);
- the real hand-traced goldens, split by each file's own `tier` field (`opentakeoff-corpus/ground_truth/linear/*.json`, WP1.7 + WP3.8's "ground truth v2"; the split itself is frozen in `opentakeoff-corpus/reports/LINEAR_HELDOUT.txt`, per the plan's own explicit HELD-OUT TIER sheet list): `tier:"development"` — gated; `tier:"held_out"` — reported only (see Run 4 on why not gated yet).

| metric | question | where it lives |
|---|---|---|
| **run recall** | seeded from a point ON the golden run (not an endpoint), does `trace_run`'s own path match the golden's SHAPE over the golden's own span — discrete Fréchet < 2pt AND length overlap ≥ 80%, the plan's own literal criterion? | `score.ts`'s `scoreTraceRecall`/`scoreTraceShapeMatch` |
| **precision** | of the length actually WALKED, what fraction is real (length-weighted `min(golden,traced)/traced` across cases)? A trace that wanders onto unrelated linework or over-traces dilutes this. | `score.ts`'s `scoreTracePrecision` |
| **length error / over-trace** | `\|traced−golden\|/golden`; over-trace is the same delta counted only when traced > golden | `score.ts`'s `TraceRunRow` |
| **size accuracy** | the traced `size` at the seed vs. the golden's own `size_overrides` for the segment the seed sits on, length-weighted — split into a MATCH, a WRONG label (traced something, just not the golden's value — the worse failure) and NO label (`trace_run` correctly declined to guess), per the plan's own explicit spec ("no-label vs wrong-label separated") | `score.ts`'s `aggregateTrace` (`sizeAccuracyPct`/`sizeWrongLabelPct`/`sizeNoLabelPct`) |
| **build / query ms** | wall-clock around the FIRST `trace_run` call per sheet (index build + first query) vs. every subsequent call (warm query only) | `bench/linear.mts`'s own `traceOneRun` |
| **refusal correctness** | seeded from a point KNOWN (independently of `trace_run`) to sit on non-linework (title block text, a room label, blank margin) — does `trace_run` correctly refuse rather than confidently walk something? `opentakeoff-corpus/ground_truth/linear/refusals.json`, a labeled NEGATIVE corpus, gated at 100% (see Run 3) | `score.ts`'s `scoreRefusalCorrectness` |

Recall's Fréchet/overlap comparison **clips the traced polyline to the golden's own arc-length span first** (each golden endpoint projected onto the trace) — over-trace beyond that span is invisible to recall BY DESIGN, exactly so an otherwise-perfect shape match isn't penalized twice for the same failure over-trace already measures separately (mirrors `mep-trace-eval.mjs`'s own "reach accuracy, refusal correctness and false-confident rate scored apart from each other on purpose" doctrine).

```
cd opentakeoff/web && npm run bench:linear
```

## What this does NOT score, and why

- **Precision against an EXHAUSTIVE negative set.** `scoreTracePrecision` measures wasted walked length on the CASES THIS BENCH ALREADY RUNS (the crossing-run synthetic case is exactly this: does the walker wander onto the crossing line?) — it is not the same as a labeled `expect_status:refused` corpus the way `mep-trace-eval.mjs`'s `.mep.csv` key carries. `refusals.json` (Run 3) closes the first slice of this gap (4 unambiguous non-linework seeds); it does NOT cover a seed ON real linework of an EXCLUDED family (schedule gridlines, dimension lines, hatching) — that "no stroke family" refusal path specifically is still untested, see that corpus's own `scope` field.
- **Held-out tier at scale.** Run 4 authored the FIRST held-out golden (n=1) — enough to report a held-out number, not yet enough for "within 5 points of development" to mean anything (see that run's own writeup on why it isn't gated).
- **Click-to-proposal < 16ms as a gate.** `buildMs`/`queryMs` report Node-process `trace_run` timing, not the browser worker's own steady-state claim — treat the number as a sanity check, not the gate's own evidence.

## Run 1 (2026-09-17, first run)

**2/7 golden runs reach at all (28.6% recall)** — well under GATE 3's ≥85% target. Every miss traces to one of TWO limitations this project already knew about and disclosed before this eval script existed; this run found zero NEW failure modes.

```
run                                    status     LF gold→traced   len err   size
──────────────────────────────────────────────────────────────────────────────────
bessemer-m101-unit103-supply-trunk     refused    No routed linework under the cursor
bessemer-m101-unit102-supply-trunk     refused    No routed linework under the cursor
bessemer-p101-cw-main                  reached    18.96→1.63        91.4%   pipe:1 != null
bessemer-p101-san-riser                refused    No routed linework under the cursor
federal-m3.1-chws-riser                refused    No routed linework under the cursor
federal-m3.1-chwr-riser                refused    No routed linework under the cursor
itd-p5-hc3-branch                      reached    7.22→7.78          7.8%   pipe:1.25 != round:1.25
──────────────────────────────────────────────────────────────────────────────────
run recall        2/7 reached (28.6%)
length error      max 91.4%, mean 49.6%
over-trace        1 case over golden length, worst 7.8%
size accuracy     0.0% length-weighted (2 runs with a golden size)
build+first-query 306ms, 397ms (per distinct sheet, cold)
```

### Finding 1 — wall-vouch false-positive exclusion (5 of 7 misses)

Confirmed by direct segment-index inspection, not assumed: `bessemer-m101`'s both supply trunks, `bessemer-p101`'s SAN riser, and `federal-m3.1`'s CHWS/CHWR risers all sit on segments with `candidate:0, family:-1` in `ensureLinearIndex`'s own output — excluded before stroke classification ever runs. This is the SAME limitation WP3.4 already documented: `wallnetwork.ts`'s geometric wall-vouching false-positives on long, dead-straight duct/pipe runs when a sheet's own layer signal isn't strong (every one of these five is a 40–730px arrow-straight run). Per the goal document's own "what you never touch" list, `wallnetwork.ts`/`mepconnectivity.ts` internals are off-limits — this is an inherited, accepted limitation to work around when tracing (as WP3.7's own live-verification already did, deliberately clicking a DIFFERENT real segment), not something this checkpoint attempted to fix.

### Finding 2 — no same-family dash-gap continuation in `walk.ts` (1 of 7 misses) — FIXED, see Run 2

`bessemer-p101-cw-main`'s golden seed lands exactly on a real, correctly-classified candidate segment (family 6, `pen-weight-prior` evidence) — the walker DOES find real linework here, unlike Finding 1. But this CW main is drawn as a dash-dot line: many short (3–26px) individual dash segments with small gaps between them, not one continuous stroke. `walkOneDirection` stopped `dead_end` after only 58.56px (three touching/near-touching dashes), because the next dash sits ~21px away — outside whatever collinear-continuation tolerance `walk.ts` currently applies. This is NOT the same mechanism as `mepconnectivity.ts`'s `bridgeDanglingGaps` (checked directly: that function requires a fitting/equipment symbol sitting IN the gap — "never bridged on proximity alone" — and would not fire here even if wired in, since a print-style dash gap has no fitting in it). Flagged as the single highest-leverage next fix, since unlike Finding 1 it is NOT on the "never touch" list. Fixed the same day — see Run 2 below.

### Finding 3 — pipe vs. round-duct diameter ambiguity (surfaced, not a recall failure)

`itd-p5-hc3-branch` reached correctly (7.8% over-trace, a real geometric extension past the golden's original arbitrary sub-span — see that golden's own `review_basis` for the same-day fix) but read its own size as `round:1.25` (round duct, 1.25″ diameter) instead of the golden's `pipe:1.25` (1¼″ nominal pipe). Both notations share the same `⌀`/`ø` glyph; `sizes.ts`'s grammar does not disambiguate by sheet content (an all-piping hydronic sheet vs. an all-ductwork one). Not fixed here — a real, disclosed gap for size-accuracy work, not a `walk.ts` or wall-vouch issue.

### A ground-truth-authoring lesson Run 1 also surfaced

`itd-p5-hc3-branch`'s FIRST version (same day, before this eval script ran against it) traced only a 2.2 LF sub-span of a longer real segment — chosen for label-verification convenience, not because it was a real drawn stop point. Running the eval against it produced a 257% "over-trace" that was really just a golden that stopped short of where the geometry itself stops (the walker correctly found the FULL 196.6px straight run plus its elbow, exactly matching independent `extractVectorGeometry` forensics done before this golden was re-traced). Fixed by re-tracing to the run's own real dead-end-to-elbow extent. Lesson for future goldens: a run's endpoints must be real geometric features (dead end, fitting, family change) the walker could plausibly also find — not an interior point picked for narrative or crop-framing reasons — or length-error/over-trace numbers measured against it are not meaningful.

## The fix: `walk.ts`'s own dash-gap continuation (`bridgeDashGap`)

Built the same day as Run 1, in `web/src/lib/linear/walk.ts` (see that file's own header for the full design). Summary: when a walk dead-ends with nothing else welding at that point either, and the dead-ending segment is short (≤1 ft — real drawn duct/pipe RUNS between meaningful features essentially never are, so an isolated short stroke there is almost always a print-artifact fragment, not a real run), it searches for the nearest same-family segment endpoint within 0.5 ft whose approach direction AND own onward direction both continue straight through (±10°), and if found, jumps the gap and continues the walk. New `WalkResult.dashBridges` field; a new `bridged_dash_gap(N)` confidence factor in `receipt.ts` (confidence 0.8, following the same "minimum over named factors" doctrine every other factor here uses — not a per-bridge compounding penalty).

**Checked directly against the real P101 case before assuming the trigger should be the `dash` flag**: it isn't. `ensureGeometry`'s own `dash` array reads `0` on every one of the CW main's individual dash marks — this PDF's CAD export flattened the dash-dot linetype into many separate SOLID short strokes rather than using a native PDF dash-array stroke. Segment LENGTH, not the `dash` flag, is what actually distinguishes a dash-mark fragment from a real run in this corpus (the flag is OR'd in as a second, real-PDF-dash-array path, but length is what fires on the one real case that motivated this).

7 new tests in `test/linear/walk.test.ts` (bridged/not-bridged/too-wide/off-axis/wrong-family/real-elbow-unaffected/both-directions-summed, plus the exact `dash:0`-but-short shape that matches the real P101 case) and 2 in `test/linear/receipt.test.ts` (factor + confidence, and "no bridge means no factor at all").

## Run 2 (2026-09-17, same day, after the dash-gap fix)

```
run                                    status     LF gold→traced   len err   size
──────────────────────────────────────────────────────────────────────────────────
bessemer-m101-unit103-supply-trunk     refused    No routed linework under the cursor      (Finding 1, unchanged)
bessemer-m101-unit102-supply-trunk     refused    No routed linework under the cursor      (Finding 1, unchanged)
bessemer-p101-cw-main                  reached    18.96→35.02       84.7%   pipe:1 != pipe:0.75   (Finding 4, new)
bessemer-p101-san-riser                refused    No routed linework under the cursor      (Finding 1, unchanged)
federal-m3.1-chws-riser                refused    No routed linework under the cursor      (Finding 1, unchanged)
federal-m3.1-chwr-riser                refused    No routed linework under the cursor      (Finding 1, unchanged)
itd-p5-hc3-branch                      reached    7.22→7.78          7.8%   pipe:1.25 != round:1.25   (Finding 3, unchanged)
──────────────────────────────────────────────────────────────────────────────────
run recall        2/7 reached (28.6%) — unchanged: the dash-gap fix does not touch Finding 1's wall-vouch exclusion at all
```

Recall is unchanged (Finding 1's five wall-vouch exclusions are a completely separate mechanism the dash-gap fix was never going to touch), but `bessemer-p101-cw-main`'s own reading changed completely — worse-looking on paper (84.7% vs 91.4% is actually a smaller raw error, but the SIGN flipped from under-trace to over-trace, and the size mismatch is now against a DIFFERENT real label). This is Finding 4, and it's a real discovery, not a regression in the fix.

### Finding 4 — the CW main golden is a representative SPAN of a much longer, heavily-branched trunk, not an isolated run

Before the dash-gap fix, `bessemer-p101-cw-main`'s own seed died on its first dash fragment (58.56px), which accidentally hid this. With bridging working, the SAME seed now walks the real trunk in both directions — roughly 35 LF each way — passing FIVE real `tee` branch points before finally stopping `ambiguous` at both ends (not `dead_end`, not a size-change point). The golden's own 18.96 LF, 2-segment extent (chosen by the original WP1.7 pass because it's where "the main turns 90° and drops into a vertical branch riser") is a real, correctly hand-traced, meaningful SPAN — genuinely useful for `bench/linear.mts`'s own manual-mode parity/totals purposes, and for a human tracing this exact region — but it is NOT a fair single-`trace_run`-call comparison target: the human's stop point is a judgment call about which branch matters, not a hard geometric feature the walker could independently rediscover without a human/agent choosing a specific candidate at an `ambiguous` fork, exactly the plan's own §6.3 "offer the candidate fan, not block on it" design intent. The golden's own `review_basis` now documents this finding directly. Unlike Findings 1–3, this isn't a gap in the ENGINE at all — it's a gap in what "seed a golden's own centerline and compare total length" can honestly measure once a trunk is this densely branched.

## Run 3 (2026-09-17, same day) — migrated into `bench/linear.mts`, real Fréchet/overlap scoring

Migrating the ad-hoc script's logic into `bench/linear.mts` (per "The ruler," above) surfaced two more real, previously-undiscovered issues before it ever produced a trustworthy number — caught by direct inspection, not assumed:

### A coordinate bug in the SCORER itself, not the engine

The first `scoreTraceShapeMatch` call (on `itd-p5-hc3-branch`, a case Run 2 already knew reaches cleanly) reported `lengthOverlapPct: 0` and a `clippedLenFt`/`goldenLenFt` of **5264 feet** for a ~7ft run. Root cause: `upp` (feet-per-pixel) was passed to `scoreTraceShapeMatch` INVERTED (`1/upp`, i.e. pixels-per-foot) at both call sites. Fixed by passing `session.sheet(sheetKey).upp` directly. Caught before trusting a single aggregate number from the new scorer — the same discipline this whole file's own history depends on.

### Finding 5 — the synthetic corpus's own coordinate convention needed a real conversion, and its random paths confound wall-vouch

Seeding the SYNTHETIC corpus needs REAL absolute pixel positions (unlike the pre-existing manual-mode loop, which only ever compares relative distances and never needed to know where the drawn ink actually sits). The naive `x_ft * ptPerFt` conversion the manual-mode loop uses is NOT the real pixel position: `bench/linear/synthesize.mts`'s own `toPdf` adds an 80pt drawing margin AND places content in PDF's native bottom-up Y axis, which pdf.js's viewport then flips on render. Fixed with a `syntheticFtToPx` helper mirroring `toPdf` exactly (margin duplicated rather than imported — `synthesize.mts` has top-level side effects, so importing it would regenerate fixtures on every bench run). Confirmed the fix is real, not another guess: case `10-arc-as-polyline` went from a wildly wrong seed to a real, in-bounds trace once corrected.

With seeding now genuinely correct, 9 of the synthetic corpus's own 10 cases STILL refuse, and direct segment-index inspection confirms the SAME Finding 1 mechanism (`candidate:0, family:-1`) — this IS wall-vouch, on synthetic data, not a new engine bug. First hypothesis, TESTED AND DISPROVEN rather than left as a guess: that the random walk's own paths frequently trace near-closed rectangular loops (two roughly-parallel, span-overlapping legs on each axis), the same shape wall-vouching exists to catch on real sheets. Built `looksLikeWallOutline` + a retry-until-clear wrapper in `synthesize.mts`, regenerated the whole corpus, re-ran the bench — recall stayed 0/10, and `02-pen-thick-solid`'s new (confirmed non-rectangular) path was excluded MORE aggressively than before (all 5 segments vs. 4 of 5). Reverted the change rather than leave disproven complexity in the generator.

The real cause looks more fundamental: these synthetic PDFs carry NO PDF layers at all (pdf-lib draws plain content streams, no OCGs), so `mepLayerSignal` reads as `"none"` for every one of them, and — with no surrounding architectural context at all (no walls, no rooms, nothing to contrast against) — `wallnetwork.ts`'s wall-vouch fallback appears to exclude essentially ANY sufficiently long, straight, axis-aligned segment on such a bare sheet, independent of the overall path's shape. A real fix likely needs the generator to emit an actual named OCG layer (e.g. something `classifyLayerName` would read as duct/pipe-like) so layer classification short-circuits wall-vouch entirely, the same way `ensureMepGraph`'s own fallback only fires "whenever the result isn't strong." That's real, separately-scoped work (pdf-lib's OCG support is low-level, not a one-line change) — not attempted here. Meanwhile, most of the synthetic corpus's own intended test dimensions (pen weight, label placement, crossings) stay confounded by Finding 1 rather than isolated; its trace numbers are reported for visibility but NOT gated, for exactly this reason.

```
run                                    status     LF gold→traced   len err   size
────────────────────────────── real ground truth (gated) ──────────────────────────
bessemer-m101-unit103-supply-trunk     refused    (Finding 1)
bessemer-m101-unit102-supply-trunk     refused    (Finding 1)
bessemer-p101-cw-main                  reached    18.96→35.02  84.7%  pipe:1!=pipe:0.75   (Finding 4 — fails recall's Fréchet/overlap too, correctly)
bessemer-p101-san-riser                refused    (Finding 1)
federal-m3.1-chws-riser                refused    (Finding 1)
federal-m3.1-chwr-riser                refused    (Finding 1)
itd-p5-hc3-branch                      reached    7.22→7.78     7.8%  pipe:1.25!=round:1.25   (Finding 3 — now a CONFIRMED recall hit)
────────────────────────────────────────────────────────────────────────────────────
recall 1/7 (0.143)   precision 0.612   maxLenErr 84.7%   sizeAccuracy 0%   coldBuild 442ms

────────────────────────────── synthetic corpus (reported only) ───────────────────
9/10 refused — Finding 5 (wall-vouch, likely no-layer-signal + no context, not path shape)
10-arc-as-polyline reached, but 61% length error — a real, separate finding
   about arc-chord seeding worth its own follow-up, not chased further here
recall 0/10 (confounded — see Finding 5)   precision 1.0   coldBuild ≤4ms
```

Recall itself is now MORE HONESTLY measured (Fréchet/overlap instead of a loose "did it merely reach" check) — this is why `bessemer-p101-cw-main` now correctly reads as a recall MISS (Finding 4's own shape genuinely diverges from the golden's, not just runs long) while `itd-p5-hc3-branch` is confirmed a clean HIT. **CORRECTED by Run 6, same day**: `bessemer-p101-cw-main`'s own `frechetPx` at the time this paragraph was written was inflated by the SAME vertex-density scorer bug Run 6 found and fixed — the corrected value is 3.17px, not the much larger number this measurement originally carried. "Genuinely diverges" overstated it: the within-span shape match is actually quite close (barely over the 2px gate), and the real, still-true part of Finding 4 is narrower than first framed — see Run 6's own closing paragraph for the corrected picture. `TRACE_THRESHOLDS` in `bench/linear.mts` is set to today's own measured real-corpus floor (recall≥0.1, precision≥0.5) — ratcheted from measurement, not chosen for comfort, and NOT GATE 3's own targets (see that constant's own header).

### Refusal correctness — closing the labeled-negative-corpus gap this file's own "what this does not score" section named

`scoreTracePrecision` only ever sees seeds ON a real golden run — it can never catch a seed that should refuse outright but instead confidently (wrongly) traces something. `opentakeoff-corpus/ground_truth/linear/refusals.json` is a small, hand-curated negative corpus (4 cases across the same three real PDFs the other goldens use) chosen to be UNAMBIGUOUSLY non-linework — title block text, a room-label text run, a scale callout, and blank page margin — so there is no judgment call about whether a stroke "counts," only whether `trace_run` correctly refuses. Each seed was independently verified (direct `session.traceRun()` calls, before being written into the corpus) to actually throw. Wired into `bench/linear.mts` as a third scored pass (`scoreRefusalCorrectness`), reported and gated at 100% — unlike `TRACE_THRESHOLDS`'s other ratchet-point values, this one IS the real target, not a measured floor, since every case is unambiguous by construction.

```
── refusal correctness (negative corpus) ──
bessemer-mechanical-bidset.pdf#3 — title block text            OK
itd-d1-lab-mechanical.pdf#5 — room-label text run               OK
federal-attachment4-mechanical.pdf#6 — scale callout text       OK
bessemer-mechanical-bidset.pdf#3 — blank page margin            OK
aggregate (refusal): { correct: 4, total: 4, rate: 1, misses: [] }
```

One real bug caught wiring this in: the existing real-goldens loop enumerates every `*.json` file in `ground_truth/linear/` and parses each as a `RealGolden` — `refusals.json` (a different schema) landed in that same directory and was silently picked up, producing `source_pdf: undefined` and a hard crash rather than a skip. Fixed by excluding it by name in that loop's own filter, not by relying on shape-sniffing.

Not covered by this corpus: a seed ON real linework of an EXCLUDED family (schedule table gridlines, dimension lines, hatching), which would test the "no stroke family" refusal path specifically rather than "no linework at all" — disclosed in the corpus's own `scope` field as real follow-up work, not attempted here.

## Run 4 (2026-09-17, same day) — the first held-out golden, plus a second development-tier hit

Two goldens added this pass, on two DIFFERENT real PDFs never used to author any prior `ground_truth/linear/*.json` or tune the engine:

**A correction caught before it shipped.** A candidate search picked `weld-county-mechanical-permit.pdf#7` as a held-out candidate — genuinely unused before this pass, but the goal document's own explicit HELD-OUT TIER section pins that exact sheet ("weld-county p7") to the DEVELOPMENT tier by name. The plan's own pre-declared list is authoritative over a search that didn't know to check it first; retagged `development` before commit (see `weld-county-m1-0.json`'s own `review_basis` for the full correction). Its content stood regardless of tier: a 16" round supply-air duct riser, from a real reducer (14"→16") to a real tee into an 18" main, both ends independently confirmed via a marked render crop. Reached cleanly: **LF 21.82→21.82 exact, size OK** — the SECOND confirmed development-tier recall hit (after `itd-p5-hc3-branch`), moving development recall from 1/7 (0.143) to **2/8 (0.25)** and precision from 0.612 to **0.743**. Notably this sheet carries real named PDF OCG layers (`M-HVAC-DUCT` etc.) — `stroke-family:layer-name`, not a wall-vouch fallback — a different, cleaner code path than most of the existing development goldens.

**The actual first held-out golden**, chosen correctly this time: `opentakeoff-corpus/reports/LINEAR_HELDOUT.txt` freezes the plan's own 7-sheet held-out list (5 pinned by the plan verbatim; the 2 `navfac-cherry-point-atc-mechanical.pdf` sheets are this checkpoint's own one-time pick, made STRUCTURALLY — first sheet in each of the PDF's two real plan series — with zero `trace_run` probing beforehand, so the pick itself carries no engine-behavior bias). Authored one golden off that list: `federal-attachment4-mechanical.pdf#7` (M4.1, a mechanical-room enlarged piping/duct plan), a 2½" HHWS pipe stub from a real tee off pump HWP-1's discharge riser to a real junction with the vertical header bundle feeding the boilers/chiller. Found via a grid-sweep of `trace_run` seeds (the label's own text position sat just off the actual drawn line), confirmed via a marked render crop showing both ends on genuine CAD geometry, and — unlike weld-county — with NO named OCG layer on this sheet at all (`stroke-family:pen-weight-prior`, `layer-unclassified`): a real Finding-1-adjacent code path, not the cleaner layer-name one.

```
── trace engine (real ground truth, held-out tier) ──
federal-attachment4-mechanical.pdf#7   reached LF 3.57→3.57 size OK
aggregate (held-out trace): recall 1.0   precision 1.0   maxLenErr 0%   sizeAccuracy 100%
```

A clean first result — but n=1, and this bench's own per-case recall criterion is binary (Fréchet<2pt AND overlap≥80%, pass or fail per case), so a one-case tier can only ever read 0% or 100%. `bench/linear.mts` reports this tier fully but does NOT hard-gate CI on the plan's own "within 5 points of development" rule yet — at this sample size that gate would just be gating on which single case got authored, not on whether the engine generalizes (see the code's own comment above `heldOutTraceAgg`). The other 6 declared-but-unauthored held-out sheets (`itd-d1-lab-mechanical.pdf#4`, `baker-county-eoc-bidset.pdf#38`, `bldg5406-hvac-demo-mechanical.pdf#2`/`#14`, `navfac-cherry-point-atc-mechanical.pdf#6`/`#18`) remain real, disclosed follow-up work — enough cases for the "within 5 points" gate to mean something is the actual bar, not one clean hit.

## Run 5 (2026-09-17, same day) — a second held-out golden, and an initially-misdiagnosed shape "miss"

Second entry off `reports/LINEAR_HELDOUT.txt`: `itd-d1-lab-mechanical.pdf#4` (M1.1), an 8" round duct segment from a real wall-penetration dead end to a real elbow/damper assembly. Found the same way as Run 4's held-out golden (a `trace_run` seed grid-sweep), but this pass caught something the sweep's first hit would have missed if trusted blindly: a 3.11 LF candidate with BOTH stops reading `dead_end` looked ideal on paper, but its own `confidence:0` / `stroke-family:unclassified` factors were a flag, and a marked render crop confirmed it — the walk had followed a wall/shaft outline into a text-leader stub, not real ductwork at all. Rejected before authoring, not after; documented in the golden's own `review_basis` as a caught mistrace rather than silently discarded. The SECOND candidate (3.02 LF, round:8) held up under the same visual check: a real double-line duct symbol, dead-ending at a wall penetration on one side and meeting a real elbow/damper on the other.

This run initially scored a recall MISS: `lenErrPct: 0` (LF matched exactly, 3.02→3.02) and `lengthOverlapPct: 1` (100%) but `shape.frechetPx: 9.2` against the plan's own `<2pt` criterion. First write-up of this checkpoint guessed the cause was "real shape noise from the double-line duct's own edge-following near the elbow/damper transition" — that guess was WRONG, and Run 6 (immediately below) found and fixed the actual cause the same day, before this note was ever left standing as the final word. See Run 6 for what was actually going on and the real, corrected held-out numbers.

## Run 6 (2026-09-17, same day) — the sub-2pt "miss" was a scorer bug, not engine noise

Run 5's own guess ("double-line duct edge-following") was never verified against the actual traced points before being written down — a lapse against this project's own repeatedly-stated discipline (verify before trusting, the same rule that caught Run 3's two coordinate bugs and disproved Finding 5's first hypothesis). Caught immediately after, this same checkpoint: dumping the FULL-PRECISION `trace_run` points for `itd-d1-lab-mechanical.pdf#4` showed every single point sits at EXACTLY `y=860.4` — a perfectly straight line, not a zigzag at all. Reproducing `scoreTraceShapeMatch` directly against `golden=[[1554.2,860.4],[1635.8,860.4]]` and `traced=[[1554.2,860.4],[1563.4,860.4],[1626.7,860.4],[1631.3,860.4],[1635.8,860.4]]` (both exactly collinear) still returned `frechetPx: 9.2` — proving the bug lives in the SCORER, not the engine.

Root cause: **discrete Fréchet distance is a per-VERTEX metric, not a per-CURVE one.** It requires a monotone index-correspondence between the two point sequences; when one curve (the golden, 2 vertices) is far sparser than the other (the traced polyline, 5 vertices, all genuinely on the same line but at uneven spacing from a fitting symbol's own tiny kinks), the DP's own monotone-advance constraint has to walk through every extra vertex on the denser side before it can advance the single step on the sparser one — and the worst intermediate gap along that forced walk becomes the reported "distance," even though the underlying GEOMETRIC line is identical. This is a well-known pitfall of the discrete (as opposed to continuous) Fréchet formulation, and it means ANY golden authored with few vertices, compared against a `trace_run` polyline that happens to pick up extra near-collinear vertices along the same real line (a fitting symbol, a snapped-grid rounding step), can read a large fake "shape mismatch" — a scoring artifact that would only get MORE common as the bench grows, not less.

Fix: `score.ts` gained `simplifyPolyline` (iterative Douglas-Peucker, same "no recursion" discipline as `discreteFrechet` itself), applied to BOTH the golden and the clipped/reversed traced polyline in `scoreTraceShapeMatch` before the Fréchet call, at a fixed `0.5px` tolerance — well under the recall gate's own 2px threshold, so a genuine elbow (a real perpendicular deviation an engineer would call a corner) is never mistaken for noise and simplified away. 6 new tests in `test/benchScore.test.ts`: collinear points drop, a real corner survives, sub-tolerance jitter drops, `<3`-point input is a no-op, the EXACT `itd-p4-ea-duct-stub` reproduction now scores `<2px`, and — the test that actually matters here — a genuine mid-span detour (an out-and-back real shape mismatch) still reads a large Fréchet distance after simplification, proving the fix doesn't just loosen the gate to hide real misses.

```
── trace engine (real ground truth, held-out tier) ──
federal-attachment4-mechanical.pdf#7   reached LF 3.57→3.57 size OK
itd-d1-lab-mechanical.pdf#4            reached LF 3.02→3.02 size OK
aggregate (held-out trace): recall 1.0   precision 1.0   maxLenErr 0%   sizeAccuracy 100%
```

Held-out is now a genuine, correct 2/2. Development-tier's own AGGREGATE recall/precision are unchanged (still 2/8 and 0.743 — this artifact only ever moves a MISS's frechetPx number, and every development case that was already a miss is still a miss, already a hit is still a hit), but diffing every row's own `frechetPx` before vs. after (not just trusting the aggregate, the same lapse Run 5 already made once this same day) turned up a real surprise: `bessemer-p101-cw-main`'s own `frechetPx` dropped from **260.5px to 3.17px** — meaning MOST of Finding 4's own originally-reported "shape genuinely diverges" number was this exact same scorer artifact, not real geometric divergence, even though that case's own conclusion (a recall miss, real over-trace past the golden's own span) happens to still hold at the corrected, much smaller 3.17px. Corrected in "Run 3"'s own writeup above rather than left standing. `itd-d1-lab-mechanical.pdf#5`'s frechetPx moved by floating-point noise only (0.6270→0.6266, both already well under the 2px gate). `itd-d1-lab-m1-1-heldout.json`'s own `review_basis` was left as originally written (it correctly describes the golden's OWN authoring and verification, which was never wrong) — the correction lives here and in `PROGRESS.md`, where the wrong guesses were actually made.

## Run 7 (2026-09-17, same day) — a third held-out golden, a clean 3/3

Third entry off `reports/LINEAR_HELDOUT.txt`: `navfac-cherry-point-atc-mechanical.pdf#6` (MH101) — the sheet was already declared and frozen as one of this checkpoint's own two coordinator picks (chosen structurally, before any `trace_run` probing, back in Run 4), so authoring a golden against it now carries no new selection bias. An 8x8 rectangular return-air duct, 12.39 LF, from a real transition/flex-connector fitting to a real elbow into a register riser — both ends confirmed via a marked render crop. Unlike the other two held-out sheets, this one carries EXPLICIT SA/RA/EA tags on every duct callout, so `trace_run` reads `systems:['RA']` directly rather than needing the annotator's own circumstantial inference weld-county and itd-p4 both required.

```
── trace engine (real ground truth, held-out tier) ──
federal-attachment4-mechanical.pdf#7      reached LF 3.57→3.57 size OK
itd-d1-lab-mechanical.pdf#4               reached LF 3.02→3.02 size OK
navfac-cherry-point-atc-mechanical.pdf#6  reached LF 12.39→12.39 size OK
aggregate (held-out trace): recall 1.0   precision 1.0   maxLenErr 0%   sizeAccuracy 100%
```

Held-out is now a genuine 3/3 — every held-out golden authored so far is a clean hit on length, shape, and size. n=3 is still short of the 7 the frozen list declares, and still not gated per Run 4's own rationale, but the trend so far is a real, encouraging signal: on sheets picked without any `trace_run` foreknowledge, the engine's own single-call reach has matched ground truth every time it wasn't excluded by Finding 1's wall-vouch mechanism outright.

## Run 8 (2026-09-17, same day) — resolving `bessemer-p101-cw-main`'s residual 3.17px

Run 6 left an open question: is the corrected 3.17px frechetPx genuine or one more instance of vertex-density noise `simplifyPolyline`'s own tolerance didn't fully absorb? Diagnosed directly: dumped the golden's own 3-vertex span (simplifies to 2, since all 3 are collinear) alongside the clipped/simplified traced polyline for the exact same case. The golden's LEFT endpoint (`x=2659.854623014566`, a real geometric point — the 1¼" water-service riser drop) matches the traced clip's own left endpoint to full floating-point precision, `0px` apart. All of the 3.17px lives at the RIGHT endpoint: golden `x=3342.47, y=1385.59` vs. the traced clip's own `x=3339.4, y=1384.8` — about 3px apart, decomposing to `frechetPx` almost exactly (`√(3.07² + 0.79²) ≈ 3.17`).

This golden's own `review_basis` already documents that its right endpoint is NOT a hard geometric feature — it's "the point the main turns 90° and drops into a riser," the human annotator's own judgment call on a much longer real trunk (Finding 4). A few-pixel discrepancy landing exactly at a self-disclosed soft stop, and nowhere else along the span, is the ordinary noise level of hand-tracing near a judgment call, not a shape defect or a remaining scorer artifact — `simplifyPolyline`'s fix is doing its job correctly here; there's nothing further to chase. No code change; this closes the open question Run 6 left rather than finding a new bug.

## Run 9 (2026-09-17, same day) — size accuracy's own "no-label vs wrong-label" split

The plan's own §2 metric spec asks for size accuracy "exact + length-weighted, no-label vs wrong-label separated" — `sizeAccuracyPct` alone only ever answered "did it match," collapsing a WRONG guess (`trace_run` bound a real size, just not the golden's own value) and NO guess (`trace_run` correctly declined — the UI's own honest "size unknown, verify manually" state) into the same "not a match" bucket. These are very different failures: a wrong guess is silently misleading; no guess is the tool being honest about its own limits. `aggregateTrace` gained `sizeWrongLabelPct` and `sizeNoLabelPct` (both length-weighted over the same `sized` population `sizeAccuracyPct` uses; the three sum to 1 whenever `sizeAccuracyPct` is non-null). 6 new/extended tests in `test/benchScore.test.ts`, including one built specifically to prove a wrong-label case and a no-label case land in different buckets rather than both being lumped together.

Running the split against the real corpus surfaced something worth flagging, not just a metric upgrade for its own sake: **development-tier's own size misses are 100% wrong-label, 0% no-label** (`sizeWrongLabelPct: 0.545`, `sizeNoLabelPct: 0`) — every real case where `trace_run`'s traced size doesn't match the golden is a CONFIDENT wrong guess (Finding 3's `round:1.25`-vs-`pipe:1.25` grammar ambiguity, and `bessemer-p101-cw-main`'s real over-trace into a different actual pipe size), never an honest "I don't know." The ONE case in the whole bench that DOES show a clean no-label result is the synthetic corpus's own `10-arc-as-polyline` (`sizeNoLabelPct: 1` there). This is a small sample (n=2 wrong, n=1 no-label) — not enough to claim `trace_run`'s "decline to guess" path is broken or rare, only that it's under-exercised by the real corpus so far. Worth watching as more real goldens get authored, not something to chase further on this one measurement alone.

## Honestly scoped as remaining

GATE 3 (`run recall ≥ 0.85`, `precision ≥ 0.95`, `length error ≤ 3%`, `over-trace ≤ 3%`, `size accuracy ≥ 0.90`, `click-to-proposal < 16ms`, `per-sheet build < 400ms at 100k segs`, held-out tier within 5 points, guard green) is NOT met as of this checkpoint, and is not close on recall. The path to it, in priority order: (1) author the other 4 declared held-out sheets (`reports/LINEAR_HELDOUT.txt`) so "within 5 points" becomes a real, statistically meaningful gate instead of a 3-case reading, now that all three existing held-out cases are genuine clean hits; (2) an excluded-family refusal case attempted and set aside this checkpoint, disclosed rather than silently dropped: a search for a real dimension-line or schedule-table-gridline seed on the existing corpus PDFs found no dimension strings on any of these mechanical sheets (dimensions live on the architectural set, not sampled here) and a schedule-gridline sweep on `weld-county-mechanical-permit.pdf#6`'s own DUCT SCHEDULE table found no seed close enough to a real gridline stroke to reach in a reasonable search budget — worth a more targeted vector-geometry approach (extracting the table's own gridline coordinates directly, not sweeping blindly) rather than repeating the same search; (3) give `synthesize.mts`'s own PDFs a real named OCG layer so layer classification bypasses wall-vouch entirely (Finding 5's own likely real fix — path-shape avoidance was tried and disproven, see that finding's own writeup), so the synthetic corpus can finally test what it was built to test; (4) either extend the bench to simulate "continue past an ambiguous stop by choosing the golden's own next vertex as the candidate to follow" (a real, larger design task — turns single-call scoring into a guided multi-hop walk) or author more real goldens specifically chosen to be single-call-friendly (short, unbranched, real-dead-end-bounded) so recall/length-error keep gaining clean, unconfounded data points; (5) Run 9's own small-sample finding (development-tier's size misses are 100% wrong-label, 0% no-label) is worth re-checking once more real goldens exist, not chased further on n=2 alone. Finding 1 (wall-vouch) stays a documented, accepted limitation to route around, not a target. `bessemer-p101-cw-main`'s own residual 3.17px frechetPx (Run 6's open question) is RESOLVED, not remaining — see Run 8: it's ordinary hand-tracing noise at a self-disclosed soft stop point, not a defect. The size-accuracy pass ITSELF (Run 9) is done, not remaining.
