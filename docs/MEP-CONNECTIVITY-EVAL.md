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

**One real, verified case, on `bessemer`** — 100% reach accuracy (1/1), refusal correctness and false-confident rate both "no cases yet" (not zero — there are none of that kind in the key yet, an honest `—`, never a fabricated 0.0%). This is a first real measurement, not a general accuracy claim — see "Honestly scoped as remaining" below.

```
set                        cases   reach R   refusal R   false-confident
──────────────────────────────────────────────────────────────────────────
bessemer                      1   100.0%         —          0
itd-d1-lab                 (no key yet)
federal-mech                (no key yet)
weld-county-permit          (no key yet)
itd-d1-lab-raster           (no key yet)
```

The one case: seeding on Bessemer page 6's own drawn duct network (image px `[2100, 1015.7]`, a point on the duct's own stroke a short, visually-confirmed distance from the HP-1 heat pump's drawn unit footprint) reaches `HP-1` — a real, to-scale **double-line** duct (parallel walls, not a schematic centerline), confirmed by rendering `view_sheet` region `[2000,850]-[2700,1300]` and looking at the horizontal duct run into HP-1's own box directly.

## What real corpus testing broke that the synthetic fixture never would

Every fixture case in `test/fixtures/mep-plan.pdf` was authored with its seed sitting exactly on a segment's own endpoint (that is how a hand-built PDF fixture gets written) — the real corpus surfaced two things a fixture like that structurally cannot:

- **Seed/equipment resolution matched only existing graph nodes, never a point mid-edge.** A seed clicked partway along a real duct run — the ordinary, realistic gesture (`one_click`'s own "click inside a room" doctrine, not "click exactly on a drawn vertex") — refused with "isn't on any traced linework" even while sitting squarely on real, drawn duct ink. **Fixed**: `resolveOnGraph` now also finds the nearest point strictly inside an edge and splices a real node there when within `seed_tol_ft`.
- **On an unlayered sheet (`layer_signal: "none"`), the graph cannot separate wall/architectural ink from real MEP linework at all.** No PDF layers exist to exclude by (the whole point of the `"none"` case), and `wallnetwork.ts`'s own geometric (layer-independent) wall detection was never wired into `excludeSegs` on either the MCP or browser side. Measured live: seeding on a real bathroom exhaust fan's own duct riser, with HP-1/EWH-1/EBB-1 as candidate equipment, returned `status: "reached"`, `HP-1`, confidence 0.765, over a 52-hop path — a residential exhaust fan connecting to a heat pump's own duct network 52 hops away is not a plausible real connection; the far more likely explanation is the trace walking through wall linework this sheet's own lack of layers gives it no way to exclude. **Not yet fixed** — the `layer-unclassified` confidence multiplier was steepened (0.85 → 0.6) and both tool descriptions now warn explicitly that a long `reached` result under `layer_signal: "none"` deserves real skepticism, but the real fix (wiring `wallnetwork.ts`'s own wall-vouching into `excludeSegs`) is scoped as future work, not attempted under this session's time budget. See the known-gaps ledger, item 24.
- **A real, to-scale double-line duct is NOT automatically a lost cause** — worth stating since the plan doc's own named risk (§6 risk #1) reads as an open question. On this one real case, JTS's noding handled the parallel duct walls well enough for a clean, correct trace. This is one data point, not a general claim that double-line duct sheets always resolve cleanly (a sheet without end-cap strokes joining the parallel walls could easily leave them as permanently separate components) — but it is real, measured evidence the risk is not automatically fatal.

## Honestly scoped as remaining, not silently dropped

- **Only ONE real, scored case exists.** The other 4 corpus sets (`itd-d1-lab`, `federal-mech`, `weld-county-permit`, `itd-d1-lab-raster`) have no `.mep.csv` key yet — each needs the same render-and-look-at-it discipline this one Bessemer case got, which is real, non-trivial, per-case work (finding a genuinely traceable, visually-confirmable duct/pipe run on each set) better paced across future sessions than rushed here.
- **No refusal-type case is scored yet** — a real seed-off-linework or no-vector-linework refusal against real corpus data (as opposed to the synthetic fixture's own refusal tests) would round out the refusal-correctness metric with something other than a bare "—".
- **No false-confident case is scored yet** — finding a real instance where the trace confidently reaches the wrong equipment (as opposed to the disclosed-but-not-yet-scored 52-hop wall-conflation case above) needs a real key row asserting the CORRECT answer independently, which needs more visual tracing work than this session's budget allowed.
- **`wallnetwork.ts`'s own wall-vouching is not wired into `excludeSegs`** — see above; this is likely the single highest-value fix for real corpus accuracy on unlayered sheets, which per Phase 4's own design (`mepsystems.ts`'s `mepLayerSignal`) is expected to be common, not rare.
