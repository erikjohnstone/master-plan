# How the linear trace engine is tested (GATE 3)

`trace_run` (#linear-takeoff WP3) walks a sheet's own drawn duct/pipe linework from a seed point and reports the run's length, size, and confidence. `web/bench/linear.mts` (WP1.6) originally scored only the MANUAL-mode concerns — parity, totals, determinism — and said outright, in its own header, that it was "deliberately NOT the full run-recall/precision/Fréchet/vertex-F1 suite... that's WP3+'s trace-engine scoring, and has no meaning yet [for manual mode]." This note is that scoring, and what it currently finds — so the next checkpoint starts from the number, not from scratch, same discipline as `docs/MEP-CONNECTIVITY-EVAL.md`. Runs 1-2 below were measured with a since-retired standalone script (`mcp/scripts/linear-trace-eval.mjs`); Run 3 migrated that scoring into `bench/linear.mts` itself, per the goal document's own explicit architecture (see "The ruler," below) — the findings from Runs 1-2 remain true and are kept here as history, not superseded.

## The ruler

**`web/bench/linear.mts`** (`npm run bench:linear` from `web/`) is the plan's own explicitly-named home for this: "LINEAR BENCH... Pinned real goldens (`ground_truth/linear/*.json`, authored from renders) + synthetic truth-by-construction sheets... Reports... run recall / precision (discrete Frechet < 2 pt, length overlap >= 80%)..." — ONE bench, not a separate ad-hoc script, scored against BOTH corpora:

- the synthetic truth-by-construction corpus (`bench/linear/corpus/*.json` + `bench/linear/synthetic/*.pdf`, WP1.6's own generator) — reported, not gated (see Finding 5 on why);
- the real hand-traced goldens (`opentakeoff-corpus/ground_truth/linear/*.json`, WP1.7 + WP3.8's "ground truth v2") — gated, matching the plan's own "development tier" language.

| metric | question | where it lives |
|---|---|---|
| **run recall** | seeded from a point ON the golden run (not an endpoint), does `trace_run`'s own path match the golden's SHAPE over the golden's own span — discrete Fréchet < 2pt AND length overlap ≥ 80%, the plan's own literal criterion? | `score.ts`'s `scoreTraceRecall`/`scoreTraceShapeMatch` |
| **precision** | of the length actually WALKED, what fraction is real (length-weighted `min(golden,traced)/traced` across cases)? A trace that wanders onto unrelated linework or over-traces dilutes this. | `score.ts`'s `scoreTracePrecision` |
| **length error / over-trace** | `\|traced−golden\|/golden`; over-trace is the same delta counted only when traced > golden | `score.ts`'s `TraceRunRow` |
| **size accuracy** | the traced `size` at the seed vs. the golden's own `size_overrides` for the segment the seed sits on, length-weighted | `score.ts`'s `aggregateTrace` |
| **build / query ms** | wall-clock around the FIRST `trace_run` call per sheet (index build + first query) vs. every subsequent call (warm query only) | `bench/linear.mts`'s own `traceOneRun` |

Recall's Fréchet/overlap comparison **clips the traced polyline to the golden's own arc-length span first** (each golden endpoint projected onto the trace) — over-trace beyond that span is invisible to recall BY DESIGN, exactly so an otherwise-perfect shape match isn't penalized twice for the same failure over-trace already measures separately (mirrors `mep-trace-eval.mjs`'s own "reach accuracy, refusal correctness and false-confident rate scored apart from each other on purpose" doctrine).

```
cd opentakeoff/web && npm run bench:linear
```

## What this does NOT score, and why

- **Precision against an EXHAUSTIVE negative set.** `scoreTracePrecision` measures wasted walked length on the CASES THIS BENCH ALREADY RUNS (the crossing-run synthetic case is exactly this: does the walker wander onto the crossing line?) — it is not the same as a labeled `expect_status:refused` corpus the way `mep-trace-eval.mjs`'s `.mep.csv` key carries. No such refusal corpus exists yet for linear.
- **Held-out tier.** Every real golden checked in as of WP3.8 is `tier:"development"`. No held-out sheet exists yet, so "within 5 points of development" is not assessable.
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

Recall itself is now MORE HONESTLY measured (Fréchet/overlap instead of a loose "did it merely reach" check) — this is why `bessemer-p101-cw-main` now correctly reads as a recall MISS (Finding 4's own shape genuinely diverges from the golden's, not just runs long) while `itd-p5-hc3-branch` is confirmed a clean HIT. `TRACE_THRESHOLDS` in `bench/linear.mts` is set to today's own measured real-corpus floor (recall≥0.1, precision≥0.5) — ratcheted from measurement, not chosen for comfort, and NOT GATE 3's own targets (see that constant's own header).

## Honestly scoped as remaining

GATE 3 (`run recall ≥ 0.85`, `precision ≥ 0.95`, `length error ≤ 3%`, `over-trace ≤ 3%`, `size accuracy ≥ 0.90`, `click-to-proposal < 16ms`, `per-sheet build < 400ms at 100k segs`, held-out tier within 5 points, guard green) is NOT met as of this checkpoint, and is not close on recall. The path to it, in priority order: (1) author explicit refusal/negative goldens so precision has a labeled negative corpus, not just the incidental crossing-run case; (2) author a held-out tier; (3) give `synthesize.mts`'s own PDFs a real named OCG layer so layer classification bypasses wall-vouch entirely (Finding 5's own likely real fix — path-shape avoidance was tried and disproven, see that finding's own writeup), so the synthetic corpus can finally test what it was built to test; (4) a size-accuracy pass once enough runs reach cleanly to make the number meaningful (the one clean hit today, `itd-p5-hc3-branch`, still has Finding 3's own pipe-vs-round-duct ambiguity); (5) either extend the bench to simulate "continue past an ambiguous stop by choosing the golden's own next vertex as the candidate to follow" (a real, larger design task — turns single-call scoring into a guided multi-hop walk) or author NEW real goldens specifically chosen to be single-call-friendly (short, unbranched, real-dead-end-bounded) so recall/length-error have more than one clean, unconfounded data point. Finding 1 (wall-vouch) stays a documented, accepted limitation to route around, not a target.
