# How the linear trace engine is tested (GATE 3)

`trace_run` (#linear-takeoff WP3) walks a sheet's own drawn duct/pipe linework from a seed point and reports the run's length, size, and confidence. `web/bench/linear.mts` (WP1.6) already scores the MANUAL-mode-only concerns — parity, totals, determinism — and says outright, in its own header, that it is "deliberately NOT the full run-recall/precision/Fréchet/vertex-F1 suite... that's WP3+'s trace-engine scoring, and has no meaning yet [for manual mode]." This note is that scoring, and what it currently finds — so the next checkpoint starts from the number, not from scratch, same discipline as `docs/MEP-CONNECTIVITY-EVAL.md`.

## The ruler

`mcp/scripts/linear-trace-eval.mjs` scores `trace_run` against the real, hand-traced goldens in `opentakeoff-corpus/ground_truth/linear/*.json` (WP1.7 + WP3.8's "ground truth v2" pass):

| metric | question |
|---|---|
| **run recall** | seeded from a point ON the golden run (not an endpoint), does `trace_run` walk a real run at all, rather than refuse? |
| **length error** | `\|traced length_lf − golden total_lf\| / golden total_lf` |
| **over-trace** | the same delta, counted only when the trace ran LONGER than the golden — the walker continuing past where the human annotator stopped, a distinct failure mode from ordinary length noise |
| **size accuracy** | the traced `size` at the seed vs. the golden's own `size_overrides` for the segment the seed sits on, length-weighted by that run's own LF |
| **build / query ms** | wall-clock around the FIRST `trace_run` call per sheet (index build + first query) vs. every subsequent call on an already-indexed sheet (warm query only) |

```
node --import tsx scripts/linear-trace-eval.mjs [ground-truth-dir]
```

## What this does NOT score, and why

- **Precision / false-positive rate.** These goldens are curated positive examples — real runs a human traced — not an exhaustive labeling of every pixel on each sheet. A precision number computed against them would only measure recall a second time under a different name. A real precision figure needs explicit refusal/negative cases the way `mep-trace-eval.mjs`'s `.mep.csv` key carries `expect_status:refused` rows — none exist yet for linear.
- **Held-out tier.** Every golden checked in as of WP3.8 is `tier:"development"`. No held-out sheet exists yet, so "within 5 points of development" is not assessable.
- **Click-to-proposal < 16ms as a gate.** The script reports the warm-query ms it measures, but a few Node-process `trace_run` calls are not the browser worker's own steady-state timing claim — treat the number as a sanity check, not the gate's own evidence.

## Current state (2026-09-17, first run)

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

### Finding 2 — no same-family dash-gap continuation in `walk.ts` (1 of 7 misses)

`bessemer-p101-cw-main`'s golden seed lands exactly on a real, correctly-classified candidate segment (family 6, `pen-weight-prior` evidence) — the walker DOES find real linework here, unlike Finding 1. But this CW main is drawn as a dash-dot line: many short (3–26px) individual dash segments with small gaps between them, not one continuous stroke. `walkOneDirection` stopped `dead_end` after only 58.56px (three touching/near-touching dashes), because the next dash sits ~21px away — outside whatever collinear-continuation tolerance `walk.ts` currently applies. This is NOT the same mechanism as `mepconnectivity.ts`'s `bridgeDanglingGaps` (checked directly: that function requires a fitting/equipment symbol sitting IN the gap — "never bridged on proximity alone" — and would not fire here even if wired in, since a print-style dash gap has no fitting in it). Closing this gap needs a `walk.ts`-native change: same pen/dash/layer, collinear within angle tolerance, gap ≤ some multiple of the dash's own on/off period — not yet designed or built. Flagged here as the single highest-leverage next fix for `run recall`, since unlike Finding 1 it is NOT on the "never touch" list.

### Finding 3 — pipe vs. round-duct diameter ambiguity (surfaced, not a recall failure)

`itd-p5-hc3-branch` reached correctly (7.8% over-trace, a real geometric extension past the golden's original arbitrary sub-span — see that golden's own `review_basis` for the same-day fix) but read its own size as `round:1.25` (round duct, 1.25″ diameter) instead of the golden's `pipe:1.25` (1¼″ nominal pipe). Both notations share the same `⌀`/`ø` glyph; `sizes.ts`'s grammar does not disambiguate by sheet content (an all-piping hydronic sheet vs. an all-ductwork one). Not fixed here — a real, disclosed gap for size-accuracy work, not a `walk.ts` or wall-vouch issue.

## A ground-truth-authoring lesson this run also surfaced

`itd-p5-hc3-branch`'s FIRST version (same day, before this eval script ran against it) traced only a 2.2 LF sub-span of a longer real segment — chosen for label-verification convenience, not because it was a real drawn stop point. Running the eval against it produced a 257% "over-trace" that was really just a golden that stopped short of where the geometry itself stops (the walker correctly found the FULL 196.6px straight run plus its elbow, exactly matching independent `extractVectorGeometry` forensics done before this golden was re-traced). Fixed by re-tracing to the run's own real dead-end-to-elbow extent. Lesson for future goldens: a run's endpoints must be real geometric features (dead end, fitting, family change) the walker could plausibly also find — not an interior point picked for narrative or crop-framing reasons — or length-error/over-trace numbers measured against it are not meaningful.

## Honestly scoped as remaining

GATE 3 (`run recall ≥ 0.85`, `precision ≥ 0.95`, `length error ≤ 3%`, `over-trace ≤ 3%`, `size accuracy ≥ 0.90`, `click-to-proposal < 16ms`, `per-sheet build < 400ms at 100k segs`, held-out tier within 5 points, guard green) is NOT met as of this checkpoint, and is not close on recall specifically. The path to it, in priority order: (1) design and build `walk.ts`'s own dash-gap continuation (Finding 2) — the only one of the three findings actually open to a fix under this project's own constraints; (2) author explicit refusal/negative goldens so precision becomes measurable at all; (3) author a held-out tier; (4) a size-accuracy pass once enough runs reach to make the number meaningful (2 data points today is not that). Finding 1 (wall-vouch) stays a documented, accepted limitation to route around, not a target.
