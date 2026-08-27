# How MEP connectivity tracing is tested

`trace_connectivity` (maturity plan Phase 4) walks a sheet's own noded vector linework from a seed point to answer *which equipment does this valve/duct/pipe actually connect to, and how do you know*. This note records how that claim is measured, what it currently scores, and what it still cannot do — so the next person to improve it starts from the number rather than from scratch, same discipline as `docs/SHEET-GRAPH-EVAL.md`.

## The ruler

`mcp/scripts/mep-trace-eval.mjs` scores `buildMepGraph`/`traceConnectivity` against a corpus of **real plan sets**, on three metrics kept structurally separate (mirrors `web/bench/score.ts`'s own `CONF_GATE_EXEMPT` precedent — a passing-for-the-wrong-reason gate is itself a finding, not something to blend into one flattering number):

| metric | question | why it exists |
|---|---|---|
| **reach accuracy** | of the cases the key says should reach a specific equipment id, how many actually did? | the trace goes where the drawing says it should |
| **refusal correctness** | of the cases the key says should refuse / dead-end / come back ambiguous, how many actually did, rather than confidently guessing? | a tool that never refuses is a tool that will eventually guess wrong with full confidence |
| **false-confident rate** | of the cases that reached SOME equipment, how many reached the WRONG one? | this is scored apart from reach accuracy on purpose — a confidently wrong answer is a materially worse failure than an honest `dead_end`, and blending the two into one number would hide exactly the failure mode this module's refusal doctrine exists to surface |

## What makes the score mean anything

**The answer key is authored by rendering the real sheet (`view_sheet`/`renderSheetPng`) and looking at it directly** — never by trusting `trace_connectivity`'s own output as its own ground truth. Every key row below states, in its own `note` column, exactly how it was verified (which region was rendered, what was seen).

Key format — `keys/<id>.mep.csv`: `sheet, seed_x, seed_y, equipment, fittings, expect_status, expect_reached_id, note` (image px at RENDER_SCALE 2.0; `equipment`/`fittings` are pipe-separated `id@x@y` / `x@y` placements).

## Current state

**Two real, verified cases, on `bessemer`** — 100% reach accuracy (1/1), 100% refusal correctness (1/1, added by the accuracy-hardening plan's Phase 2 fix below), 0 false-confident. This is still a first real measurement, not a general accuracy claim — see "Honestly scoped as remaining" below.

```
set                        cases   reach R   refusal R   false-confident
──────────────────────────────────────────────────────────────────────────
bessemer                      2   100.0%     100.0%          0
itd-d1-lab                 (no key yet)
federal-mech                (no key yet)
weld-county-permit          (no key yet)
itd-d1-lab-raster           (no key yet)
```

Case 1 (reach): seeding on Bessemer page 6's own drawn duct network (image px `[2100, 1015.7]`, a point on the duct's own stroke a short, visually-confirmed distance from the HP-1 heat pump's drawn unit footprint) reaches `HP-1` — a real, to-scale **double-line** duct (parallel walls, not a schematic centerline), confirmed by rendering `view_sheet` region `[2000,850]-[2700,1300]` and looking at the horizontal duct run into HP-1's own box directly.

Case 2 (refusal): the real EF-1 wall-conflation case (see "Phase 2 fix" below) — seeding on the exhaust fan's own duct riser (image px `[1729, 1621]`), with HP-1/EWH-1/EBB-1 as candidate equipment, now correctly `dead_end`s instead of falsely reaching HP-1.

## What real corpus testing broke that the synthetic fixture never would

Every fixture case in `test/fixtures/mep-plan.pdf` was authored with its seed sitting exactly on a segment's own endpoint (that is how a hand-built PDF fixture gets written) — the real corpus surfaced two things a fixture like that structurally cannot:

- **Seed/equipment resolution matched only existing graph nodes, never a point mid-edge.** A seed clicked partway along a real duct run — the ordinary, realistic gesture (`one_click`'s own "click inside a room" doctrine, not "click exactly on a drawn vertex") — refused with "isn't on any traced linework" even while sitting squarely on real, drawn duct ink. **Fixed**: `resolveOnGraph` now also finds the nearest point strictly inside an edge and splices a real node there when within `seed_tol_ft`.
- **On an unlayered sheet (`layer_signal: "none"`), the graph could not separate wall/architectural ink from real MEP linework at all — FIXED (accuracy-hardening plan Phase 2).** No PDF layers exist to exclude by (the whole point of the `"none"` case), and `wallnetwork.ts`'s own geometric (layer-independent) wall detection was never wired into `excludeSegs` on either the MCP or browser side. Measured live: seeding on a real bathroom exhaust fan's own duct riser, with HP-1/EWH-1/EBB-1 as candidate equipment, returned `status: "reached"`, `HP-1`, confidence 0.765, over a 52-hop path — a residential exhaust fan connecting to a heat pump's own duct network 52 hops away is not a plausible real connection; the far more likely explanation is the trace walking through wall linework this sheet's own lack of layers gives it no way to exclude. See "Phase 2 fix" below for the real before/after measurement.
- **A real, to-scale double-line duct is NOT automatically a lost cause** — worth stating since the plan doc's own named risk (§6 risk #1) reads as an open question. On this one real case, JTS's noding handled the parallel duct walls well enough for a clean, correct trace. This is one data point, not a general claim that double-line duct sheets always resolve cleanly (a sheet without end-cap strokes joining the parallel walls could easily leave them as permanently separate components) — but it is real, measured evidence the risk is not automatically fatal.

## Phase 2 fix: wall/MEP-ink conflation (ledger item 24, accuracy-hardening plan)

**The fix**: `mcp/src/session.ts`'s `ensureMepGraph` and `web/src/pages/TakeoffCanvas.jsx`'s `agentTraceConnectivity` both now call `mepLayerSignal` first; whenever the result isn't `"strong"`, `wallnetwork.ts`'s own geometric (layer-independent) wall-vouching (`networkWallSegs`) runs over the sheet's own segments and anything it vouches for as wall is folded into the same `excludeSegs` mask that already excludes annotation/finish-pattern-layer ink — the identical fallback discipline `netroom.js`'s room detector already uses for the same function. A strong layer signal is never overridden; the fallback only fires when layer roles alone can't do the job.

**Real, measured before/after — the exact real EF-1 case, reproduced and re-measured directly** (not assumed): stashing this session's own fix and re-running the real seed (`[1729, 1621]`, on EF-1's own drawn duct riser, visually confirmed by rendering page 6 region `[1450,1550]-[1950,1950]`) against HP-1/EWH-1/EBB-1 as candidates reproduces the false positive — `status: "reached"`, `HP-1`, confidence 0.54, over a 40-hop path (a different hop count than the original live 52-hop report, same real seed-sensitivity, same real conflation). Restoring the fix turns every one of those 3 seeds into `status: "dead_end"`, confidence 0. The one pre-existing real positive case (Bessemer's own genuine double-line duct into HP-1) is unaffected — confirmed unchanged at confidence 0.54, `reached: HP-1`, 47 hops, both before and after.

`mcp/scripts/mep-trace-eval.mjs` against the real corpus, before vs. after (the EF-1 case added as a new `dead_end`-expecting row in `keys/bessemer.mep.csv`):

```
before:  bessemer   1 case    reach 100.0%   refusal  —       false-confident 0
after:   bessemer   2 cases   reach 100.0%   refusal 100.0%   false-confident 0
```

**A committed, synthetic regression lock, not just the external corpus key**: `mcp/scripts/make-mep-fixture.mjs`'s `mep-plan.pdf` gained a sixth scenario, WALL CONFLATION — a real, closed wall rectangle at the sheet's own heaviest pen with two ordinary-weight duct stubs each touching it at a real mid-edge T-junction, built to reproduce the identical shape of the real EF-1 case deterministically. 3 new tests in `mcp/test/tools.test.ts` pin: (1) seeding on one stub with only the OTHER stub's equipment supplied correctly `dead_end`s (the false-reach case, confirmed via the same stash-and-rerun method to have "reached" pre-fix, 6 hops), (2) the same stub still correctly reaches its OWN equipment — proving the exclusion doesn't overreach into real connections, (3) the mirror-image seed (bottom stub, top equipment) is equally excluded. mcp 203/203, web 1783/1786 (pre-existing skips only), both packages typecheck clean, lint clean.

## Honestly scoped as remaining, not silently dropped

- **Still only 2 real, scored cases exist**, both on `bessemer`. The other 4 corpus sets (`itd-d1-lab`, `federal-mech`, `weld-county-permit`, `itd-d1-lab-raster`) have no `.mep.csv` key yet — each needs the same render-and-look-at-it discipline these two Bessemer cases got, which is real, non-trivial, per-case work (finding a genuinely traceable, visually-confirmable duct/pipe run on each set) better paced across future sessions than rushed here. This is Phase 6 of the accuracy-hardening plan.
- **No false-confident case is scored yet** — finding a real instance where the trace confidently reaches the wrong equipment needs a real key row asserting the CORRECT answer independently, which needs more visual tracing work than this session's budget allowed.
- **`wallnetwork.ts`'s own wall-vouching is a real-but-imperfect heuristic, not a solved problem** — not every wall face carries the junction evidence it needs to be vouched (a wall drawn as a single stroke with no perpendicular partition meeting it, for instance), so a "none"/"weak" layer signal still means a measurably less certain trace than a "strong" one; the `layer-unclassified` confidence factor stays applied regardless of whether wall-exclusion actually ran.
