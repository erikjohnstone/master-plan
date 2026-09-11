# Goal: a clean 47-case symbol-sweep corpus with `affine` ON — no models, no ML

Successor to `docs/SYMBOL-SWEEP-AFFINE-GOAL.md`. Read that document's §0
(contract), §7 (working method) and the whole of its §9 Findings FIRST; this
document assumes every one of them and does not repeat them. Every number
below was measured on 2026-09-11 against real corpus runs — none is a guess.

## 0. Contract (unchanged from the predecessor, plus three additions)

All of the predecessor's "nevers" hold: never move `SWEEP_SCORE_HIGH` (0.92),
`SWEEP_SCORE_LOW` (0.75), `SWEEP_TOL_PX` (2), `SWEEP_EXTRA_MAX` (0.30); never
edit authored ground truth under `HVAC BAS Benchmark Collection/ground_truth/`;
every candidate ends in `matches`, `withheld` (with `reason`) or `rejected` —
never silently dropped; canvas (`web/src/pages/TakeoffCanvas.jsx`,
`web/src/lib/agentTools.js`) and MCP (`mcp/src/session.ts`, `mcp/src/tools.ts`,
`mcp/src/outputs.ts`) stay in parity; one commit per phase; tsc + the affected
suites green before every commit; the goal-doc §6 numbers table and Findings
list are the record — fill them in as you go.

Three additions, learned the hard way (see predecessor Findings):

1. **Scripts under `mcp/scripts/` are NOT covered by `tsc`** (`mcp/tsconfig.json`
   `include` is `["server.ts","src","test"]`). A script must be RUN to be
   trusted. The corpus runner is `mcp/scripts/symbol-sweep-corpus.mjs`; run it
   as two background halves (24 + 23 case ids read from
   `ground_truth/symbol_sweep/cases.json`, never a hand-typed list), each
   `cd mcp && node --import tsx scripts/symbol-sweep-corpus.mjs <ids...>`.
   Full run ≈ 20–25 min; case `28` alone takes ~15 min.
2. **Synthetic fixtures for refinement need noise.** A mathematically exact
   synthetic rotation/stretch fits `fitAffine` with `rms → 0`, so `tol_px`
   never widens and the fixture proves nothing about widening. Use the test
   file's `place({ jitter })` (opposing per-endpoint jitter, ≈1.6 px at
   `sc: 3`) to force a real > 2 px residual — the existing test "Phase 1
   tolerance widening: a placement that only clears scoreHigh via the widened
   tolerance…" shows the pattern.
3. **Temporary diagnostics** live in `mcp/scripts/tmp-*.mjs`, are deleted
   before every commit, and are never committed. A temporary code patch used
   only to measure something is labelled `// TEMP DIAGNOSTIC (date,
   uncommitted)` and reverted with `git checkout --` before the next commit.

## 1. Where the corpus stands (measured, commit `036e12f`)

Runner applies `AFFINE_WIRE_DEFAULT` to every case. 13/47 fail; 12 excess
matches total (down from 667 at the default-flip attempt). Exactly:

| case | count | other errors | cause (diagnosed instance-by-instance, see §2) |
|---|---|---|---|
| `01` | 19/19 | no one-to-one localization for `cd1-08` | C1 — 3 real instances displaced by widened phantoms; `cd1-11` carries a rank-1 fit `sx 1.027 sy 0` |
| `02` | 5/1 (+4) | — | C3 — all four phantoms carry 110–195 % extra ink, `tol_px` 5.9–6 |
| `05` | 5/5 | seed tag `<none>` != D10; no one-to-one for `d10-02`; seed on wrong text-run box | C1 — seed's D10 tag stolen by a `0×/0×` score-1.0 phantom; `d10-02`'s tag stolen by a `scale_y 0.284, shear 90°` phantom; 5 "matches" are an unrelated cluster 1100 px away |
| `06` | 14/13 (+1) | — | C4 — one isolated widened phantom, `rot 88, sx 1.056, sy 0.908, rms 1.69, tol 5.08`, no extra |
| `10` | 38/35 (+3) | seed tag `<none>`; no one-to-one for `cd1-02`; seed on wrong box | C1 + C3 — 35 phantoms of which ~30 carry 40–550 % extra ink; the real CD-1s are found at d=0 in the base run but displaced under affine |
| `11` | 15/15 | no one-to-one for `new-thermostat-vav-4` | C1 — four committed matches with `scale_x 0, scale_y 0, rms 0, score 1` carrying the tags `1-VAV-4/10/12/16` stolen from the real thermostats |
| `13` | 5/5 | sheet number M-701 != V3 | pre-existing, unrelated (sheet metadata) — out of scope |
| `14` | 5/2 (+3) | — | C4 — three isolated phantoms in a row at y≈3984, 125 px apart, near-identity transform (`sx 0.999 sy 0.977`), `rms 1.75`, `tol 5.27`, score 1.0, no extra |
| `17` | 8/8 | no one-to-one for `cu-bo2` | C1/C4 — a widened phantom 18 px from the real unit (`sx 1.108 sy 1.116`, score 1.0) took its `CU-BO2` tag; the real 0.776 reading is then skipped as its "shadow" |
| `18`, `23`, `28` | exact | no one-to-one for one instance each | C1 (not individually re-diagnosed; same signature as `17`) |
| `41` | 2/1 (+1) | — | C3 — phantom carries 71 % extra ink |

Base run (no affine) passes every one of these except `13`. So every
remaining failure is introduced by the affine path, and every one now has a
named mechanism.

## 2. Root causes, with the evidence and the literature

### C1 — degenerate fits win the label competition and get promoted

Two defects compound.

**(a) Engine bug.** `web/src/lib/symbolAffine.ts` `fitAffine` (line ~80)
refuses a collinear SOURCE (`detS` test, line ~110) but never checks the
RESULT. When every seed endpoint's nearest sheet endpoint within `6·tol` is
the same vertex (or all lie on one line), the least-squares solve returns
`m ≈ [0,0,0,0]` (or rank 1), `tx,ty` = that vertex, `rms = 0`. In
`web/src/lib/symbolsweep.ts` `scoreAtTol` (line ~1793) and `scoreAt` (~1728),
a zero-length chord makes `sdx = sdy = sLen = 0`, so the angle test
`Math.abs((sdx*tdx+sdy*tdy)/(sLen*tLen)) < angleCos` evaluates `NaN < x` →
false → the segment is NOT skipped, `distToSeg` of the collapsed point to the
sheet segment it sits on is 0 → every sample is "covered" → score 1.0.
(`extraFor` at ~2186 already guards `!sLen`; the two scorers don't.)
`affineWithinBounds` then marks the row `boundsFailed` → it is withheld with
the §4.2 bounds reason, **but with `score: 1.0`**.

**(b) Design gap.** `mcp/src/session.ts` `sweepLabels` (~2683) puts the
seed, every match and EVERY withheld row (2612 of them on case 05) into ONE
`labelPlacements` call. `web/src/lib/symbollabels.ts` ranks competing claims
on `distance + 800·(1 − score)` (`LABEL_GEOMETRY_PENALTY_PX`, ~464;
`geometryPenalty`, ~780) and `assignEdges` (~654) gives each text run to
exactly one placement. A bounds-failed phantom scoring 1.0 pays zero penalty,
so it beats the real instance 40 px away scoring 0.59 (measured on 05:
`42 + 800·0.179 ≈ 185` vs `40 + 800·0.409 ≈ 367`). The real row then has no
label; `reconcileSweepLabels` (~920) promotion (`withheld.forEach`, ~963) has
NO geometric gate, so the phantom is promoted instead. The same theft hits
the seed: `sweepLabels` reports `named[0]` (the contested result) as the seed
label rather than the uncontested `discoveredSeed` it already computes, and a
null seed label makes `reconcileSweepLabels` return early — the whole
promote/demote layer is silently disabled for that sweep (05, 10). Set scope
already uses the uncontested seed lookup (~3050); sheet scope does not.

Literature (P&ID digitization: Kim 2022 JCDE, Kang 2019 Energies, Rahul 2019;
map labeling: Christensen/Marks/Shieber 1995): tag-to-symbol association is
nearest-distance + pattern filter + **one-to-one assignment over VALID
candidates only**. Validity gating before assignment is the standard step this
pipeline lacks.

### C3 — a widened tolerance granted to a footprint full of foreign ink

`refine` (~1833) sets `tolFit = clamp(3·rms, tol, 3·tol)` and accepts any
refined score above the rigid one. The density check (`densitySuspect`,
~2213) only catches a widened phantom that has a NEIGHBOUR. An isolated one
survives. But `extraFor` already measures the fraction of unmatched ink
inside the placement's footprint, and it separates the remaining phantoms
cleanly: `02` 1.11/1.38/1.49/1.95, `41` 0.71, `10` mostly 0.43–5.48. The
engine only acts on `extra` under `variantGuard` (disclosure-by-default for
#259's contained-seed workflow). For a row that NEEDED the widened tolerance
the premise is "same symbol, slightly distorted"; > 30 % foreign ink in the
same footprint contradicts it. Scope the rule exactly like the density check
(`transform.tol_px > tol`) so plain rigid supersets are untouched.

### C4 — the fit did no work, yet the tolerance was widened anyway

Case `14`'s three phantoms have a near-identity transform (`sx 0.999,
sy 0.977, rot 360`) with `rms 1.75` → `tolFit 5.27` → score 1.0. The rigid
score at the base tolerance was < 0.92 (that's why `refine` ran) and the
fitted transform is essentially the rigid one, so the score gain came ONLY
from lowering the bar. `06`'s phantom (`rms 1.69, tol 5.08`) and `17`'s
(`sx/sy 1.11`, 18 px from the real unit) are the same shape of failure.
Literature: Lowe 2004 §7 (re-fit at HALF the bin error and require the
cluster to survive), LO-RANSAC (Chum/Matas 2003 — narrow the threshold
iteratively after the local fit), Rucklidge 1997 (partial Hausdorff with BOTH
a forward and a box-reverse coverage criterion), Tombre's hysteresis for line
drawings. The principled vector recipe: a widened score is only trusted if
the SAME fitted transform also clears a floor at the BASE tolerance — the
"score(τ_wide) / score(τ_base)" curve saturates for a true fit and grows
linearly for a wrong one. This must be MEASURED on real rows before the
floor is chosen (Phase D below); it is the one item here that is not yet a
proven rule.

### C2 — case `02`: `dropGlyphClusters` was doing real work there

`glyphClusterMask` (~606) uses only: segment length ≤ 4·tol, union-find over
short segments only (link radius `max(4·tol,4)` — the same 8 px as the
"short" cutoff, so any hatch with < 8 px pitch fuses into one component),
count ≥ 6, bbox long side < 0.25·refDiag, ≥ 3 directions at 15°. It has no
notion of where the cluster sits relative to the symbol body, no
connectivity-to-long-strokes test (deliberately excluded — the single
strongest available discriminator), and no access to the PDF text layer even
though `s.spans = textSpans(s.page)` is computed 41 lines below the seed
fingerprint call in `session.ts` (~2927) and one line below it in
`TakeoffCanvas.jsx` (~6704). The two call sites also disagree on `refDiag`
(seed side: true ink-bbox diagonal; sheet side: longer side of the tol-padded
window). The existing fixture (`glyphTagAt`, 15 strokes of exactly 1.0 px,
0.1 px apart) drops 79 % of its seed's segment count — indistinguishable by
any drop-fraction cap from case 10's real 88 % over-drop.

Literature: Fletcher & Kasturi 1988 (component area 1:5 range, elongation
< 20, collinear-centroid strings), Tombre et al. DAS 2002 (best-enclosing
rectangle, fill density ≈ 0.5 for glyphs vs very low for line fragments),
Lladós 1999 (hatching = one dominant θ with ρ in arithmetic progression,
bounded by an enclosing contour). The standard practical route on PDFs with a
text layer is to mask ink inside dilated span boxes BEFORE geometry, and run
the geometric heuristic only on ink the text layer cannot explain.

## 3. Phases — in this order, one commit each, corpus gate at the end of each

### Phase A — reject degenerate fits (pure bug fix; no behaviour change for any real fit)

1. `symbolAffine.ts`: add `export const AFFINE_MIN_SINGULAR = 0.2` and
   `export function affineSingularValues(m): [sMax, sMin]` (closed form from
   the eigenvalues of `mᵀm` — `decomposeAffine` already computes `s1, s2`
   internally; factor, don't duplicate). In `fitAffine`'s `solve`, after
   `tx, ty`: `if (affineSingularValues([a,b,c,d])[1] < AFFINE_MIN_SINGULAR)
   return null;`. 0.2 is well below `1/DEFAULT_AFFINE_BOUNDS.maxStretch`
   (0.667): a 1.5–5× compression stays a real, DISCLOSED out-of-bounds fit;
   below 0.2 the symbol has collapsed and the score means nothing. A
   `refine` that returns null leaves the rigid proposal with its honest
   rigid score — nothing is dropped.
2. `symbolsweep.ts` `scoreAt` and `scoreAtTol`: prepend `!sLen ||` to the
   angle test, matching `extraFor`.
3. Tests, `web/test/symbolAffine.test.ts`: all targets coincide → `null`;
   all targets collinear → `null`; a legitimate 1/3 compression (sMin 0.33)
   still returns a fit. Also a `symbolsweep.test.ts` assertion on an existing
   affine fixture that no returned `transform` ever has
   `min(scale_x, scale_y) < AFFINE_MIN_SINGULAR`.
4. Gate: web suites green (420 tests + new), `mcp` 123 green; corpus: case
   `11`'s four `scale 0×0` matches gone; no case regresses.

### Phase B — corroboration eligibility (`hold`) and the uncontested seed

1. `symbolsweep.ts` `SweepWithheld`: add
   `hold?: "bounds" | "density" | "extra"` with a doc comment saying such a
   row is disclosed but is NOT a corroboration candidate. Set
   `hold: "bounds"` in the `boundsFailed` branch (~2261) and
   `hold: "density"` in the `densitySuspect` branch (~2247).
2. `symbollabels.ts`: add `eligible?: boolean[]` to `LabelPlacementOptions`
   (aligned with `placements`); in `labelPlacements` skip `p` when
   `options.eligible?.[p] === false` in BOTH the adjacent loop (~782) and the
   leader loop (~857, the inner `for (let p …)`), so an ineligible placement
   proposes no edge at all. In `reconcileSweepLabels`'s promotion branch
   (~963): `if (label && !row.hold && …)`. Held rows stay in `review` exactly
   as today.
3. `mcp/src/session.ts` `sweepLabels`: pass
   `eligible: [...(seedCenter ? [true] : []), ...matches.map(() => true),
   ...withheld.map((w) => !w.hold)]`; return `seed: discoveredSeed` (the
   uncontested lookup it already computes) instead of `named[0]` — the seed
   still participates in the assignment (set scope's comment at ~3095 says
   why that matters), only its REPORTED identity stops being stealable.
   Thread `hold` onto every wire withheld row: the four
   `withheld: … .map((w, i) => ({ … reason: w.reason }))` sites (~2973,
   ~3188, ~3242, ~4944) get `...(w.hold ? { hold: w.hold } : {})`.
4. `mcp/src/outputs.ts`: the four sweep/row withheld schemas (~465, ~497,
   ~538, ~1121) gain `hold: z.enum(["bounds","density","extra"]).optional()`
   with a one-sentence description. Define it once and spread it.
5. `web/src/pages/TakeoffCanvas.jsx`: both `labelPlacements` calls (~4980,
   ~6721) pass the same `eligible` array; both `const seedLabel = labels[0]`
   lines (~4985, ~6726) become `seedName || labels[0] || null`
   (`seedName` IS the uncontested lookup, already computed at ~4966/~6705);
   line ~6702's stale `dropGlyphClusters: opts.affine?.enabled === true`
   becomes `false` (MCP already did this — parity bug). `agentTools.js`
   passes rows through; confirm `hold` reaches the agent tool result and
   extend `mcp/test/symbolSweepAffineParity.test.ts` to assert it.
6. Tests: `web/test/symbolLabels.test.ts` — (i) an eligible placement 40 px
   from a token with score 0.59 wins it over an ineligible placement 42 px
   away with score 1.0 (the case-05 numbers); (ii) a held withheld row with
   the seed's own tag adjacent is never promoted; (iii) the seed's reported
   label is the uncontested one even when a closer eligible row takes the
   token in the assignment. `mcp/test/session.test.ts` — a withheld wire row
   carries `hold`.
7. Gate: suites green; corpus: `05` and `11` localization errors clear
   (their real instances are found at d = 0 today and only lack the tag);
   `01`/`10`/`17`/`18`/`23`/`28` re-diagnosed with the runner change in
   Phase F (do that runner change first if it helps — it is diagnostics
   only). Record which of the six clear and which don't, per case.

### Phase C — widened tolerance + extra ink is a hold, not a match

1. `symbolsweep.ts`, right after `densitySuspect` is built: a
   `widenedExtra: Set<Scored>` of survivors with `s.transform &&
   s.transform.tol_px > tol && s.score >= scoreHigh && !s.boundsFailed &&
   (extraOf.get(s) ?? 0) > extraBar`. Add `!widenedExtra.has(s)` to
   `isMatch`. In the withheld loop, before the generic `s.score >= scoreHigh`
   extra branch, emit `hold: "extra"` with a reason that names the widened
   `tol_px`, the base `tol`, the extra percentage and the bar. It applies
   regardless of `variantGuard`/`manual` — it is about the widening, not
   variant discrimination.
2. Test: the jittered widened fixture from Phase 1's density test, plus a
   second copy of the symbol's own strokes drawn inside one placement's
   footprint at an offset the seed lacks (a superset) → that placement is
   withheld with `hold: "extra"`; the isolated clean widened placement stays a
   match; an UN-widened rigid superset (no jitter, no rotation) still matches
   with `extra` disclosed, as #259's tests already pin.
3. Measure BEFORE trusting: a `tmp-*.mjs` diagnostic over all 47 cases
   listing every match with `transform.tol_px > tol`, its `extra`, and
   whether it sits within `tolerance_px` of an authored instance. Expected:
   no real instance has `extra > 0.30`. If one does, record it and stop —
   the rule needs a different scope.
4. Gate: corpus: `02` → 1/1, `41` → 1/1, `10` count within +3; no
   previously-passing case regresses.

**Outcome, 2026-09-11 — NEITHER of Phase C's two ideas survived real
corpus measurement. Zero engine code shipped from this phase.** Both
attempts were well-motivated, both were validated on synthetic fixtures
first, and both were reverted only after the real 47-case corpus proved
each one wrong in a way no synthetic test could have caught. Recorded in
full so neither is retried blind.

**Attempt 1 — step 1's `widenedExtra`/`hold:"extra"` rule.** Implemented
exactly as specified and passed its own synthetic test. Building that
test first surfaced a real, unrelated engine bug: `extraFor`'s coverage
check compared a row's segments against the STRICT base `tol` even when
the row's own score was established at a WIDENED `transform.tol_px` — a
segment whose true offset fell between the two tolerances (exactly what
`refine()` already trusted to reach the score) was wrongly counted as
"extra." A clean, correctly-matched synthetic placement measured ~33%
extra purely from this mismatch.

Fixing that (checking coverage at the row's own `transform.tol_px`) and
THEN running step 3's diagnostic (`tmp-phasec-extra-diag.mjs`, deleted
before commit) across all 47 real cases, before trusting step 1's rule,
found: **62 real (ground-truth-confirmed) widened instances exist
corpus-wide; 5 of them, across 2 cases, still measure extra in
[0.378, 1.408] even with the coverage bug fixed.** The 85 phantom
(non-real) widened rows measure extra in [0.322, 5.182] — fully
overlapping the real population's own range (19 phantom rows sit in
[0.30, 0.50] alone, more than the real count in that band). There is no
threshold on extra-ink fraction, at any value, that separates real from
phantom here. Per this phase's own header ("measure first, then rule")
and step 3's own instruction ("if one does, record it and stop"), the
`widenedExtra`/`hold:"extra"` mechanism was REVERTED.

**Attempt 2 — the `extraFor` coverage-tolerance fix, kept "on its own
merits" after attempt 1's rule was dropped.** The fix is internally
consistent (checking coverage at the same tolerance the score already
trusted) and fixes a real synthetic false positive. It looked corpus-safe
by construction: no case in this corpus sets `variant_guard`, and
`extra`'s numeric value can only gate `isMatch` when `variant_guard` is
on — so the fix appeared unable to change which rows become matches.
**That reasoning was wrong.** `extra` has a SECOND, independent consumer:
`symbollabels.ts`'s `reconcileSweepLabels` demotes an unlabeled match to
withheld when `(row.extra ?? 0) > 0.3` (line ~968), entirely unrelated to
`variant_guard`. Running the FULL 47-case corpus gate with the fix
applied showed 13/47 failing — one MORE than Phase B's 12 — with
`42-guaranteed-rate-m121-thermostat-bubbles` newly regressed (3/3 → 4/3).
Traced directly: a phantom placement at `[1399.2, 3080.1]` (score 1.0, no
corroborating "T" tag, `tol_px: 4.98`) was previously demoted via the
line-968 rule because its (buggy) extra measured 0.641; with the coverage
bug fixed, its extra measured **0.0485** — a 13x drop, not a modest
correction — because the widened coverage window (radius `covTol = 4.98px`
vs the base `2px`) is large enough to sweep in real, unrelated nearby
drawing content as "covered" on a real, dense sheet, something the clean
synthetic fixture (open space around the placement) could not reveal.
The line-968 demotion no longer fired, and an actual phantom (no real
thermostat exists at that position — confirmed against the case's 3
authored instances, nearest at 227px away) counted as a 4th match.
Verified deterministic (re-ran both the buggy and fixed versions twice
each; byte-identical both times) and isolated (this is the ONLY case
whose pass/fail changed anywhere in the 47-case run) before concluding
this, not assumed. Per the same "no previously-passing case regresses"
rule every other phase in this document is held to, the fix was REVERTED.

**Lesson for whoever revisits either idea:** `extra`'s current definition
is coupled to `reconcileSweepLabels`' own no-tag-plus-high-extra
heuristic in a way this phase's own author did not anticipate going in —
changing how `extra` is computed for ANY row changes what that OTHER,
separately-authored mechanism does, corpus-wide, not just what
`matchSymbol` itself does. A future attempt at either the withholding
rule or the coverage-tolerance fix needs to corpus-test BOTH consumers
together, not "matchSymbol's own isMatch is unaffected, so this is safe"
— that specific reasoning is now proven false by this Finding, not merely
untested. `02` and `41`'s gate expectations from step 4 don't apply here
— nothing shipped from this phase touches their matches at all.

### Phase D — two-tolerance consistency (measure first, then rule)

1. Diagnostic (temporary): in `refine`, also compute
   `strict = scoreAtTol(fit.m, fit.tx, fit.ty, tol, …)` — the fitted
   transform at the BASE tolerance — and the rigid score it started from.
   Dump `(rigid, strict, widened, tol_px, rms, real?)` for every refined row
   in cases `01, 05, 06, 10, 14, 17` and for the real widened rows of every
   passing case. Do not write a rule until this table exists in §6.
2. Candidate rules, to be chosen by the table (pick the simplest that
   separates with margin; record the ones that don't):
   - `strict ≥ scoreLow` (0.75) — the fit must explain the residual well
     enough that the base tolerance already sees a near-match;
   - `strict − rigid ≥ δ` — the transform must have DONE something (case 14:
     near-identity transform, `strict ≈ rigid`);
   - both, as Lowe/LO-RANSAC do (fit, then re-verify at the tighter
     tolerance).
   Implement as `hold: "unexplained"` (extend the union) with a reason that
   quotes both numbers, and disclose `strict` on `SweepTransform` as
   `score_base_px` only if the rule uses it (then update §4.1 of the
   predecessor doc, `outputs.ts` `sweepTransform`, and the parity test).
3. Refined-`at` drift: `row.at = refined.at` (~1914) has no positional guard;
   the correspondence radius is `6·tol` = 12 px. `17`'s phantom is 18 px from
   the real unit. Add to the same table `|refined.at − rigid.at|` and, if the
   real/false populations separate, cap it (a refinement that moved more than
   `6·tol` is a different proposal, not a refinement of this one — keep the
   rigid row instead).
4. Gate: corpus: `14` → 2/2, `06` → 13/13, `17` localization clears, `10`
   exact. Record any that don't with the numbers.

**Outcome, 2026-09-11 — the table was built per step 1, and NONE of step
2's candidate rules nor step 3's drift cap achieve step 4's gate on any
target case. Zero engine code shipped.** A TEMP diagnostic (deleted, never
committed) logged `(rigid, strict, widened, tol_px, rms, drift)` for every
ACCEPTED refined row scoring ≥ `scoreLow`, across cases `01, 05, 06, 07,
10, 14, 17, 26, 42` (the six target cases plus three passing cases with
real widened rows, identified from Phase C's own corpus-wide diagnostic
data before re-running anything). Real vs phantom was determined by
distance to each case's own authored ground truth, within its stated
`tolerance_px`.

**`strict` / `strict − rigid` (step 2): heavy overlap, no usable
threshold.** 74 real refined rows vs 4146 phantom refined rows (both at
the pre-final-dedup "accepted candidate" stage — see the note below on
what this volume itself reveals). Real `strict`: p25=0.445, p50=0.592,
p75=0.786. Phantom `strict`: p25=0.333, p50=0.470, p75=0.564 — close
enough that `strict ≥ scoreLow (0.75)` would reject 53 of 74 real rows
(71.6%) while still letting 103 of 4146 phantoms through — a rule that
breaks far more real matches than phantoms it removes, the opposite of
useful. `strict − rigid ≥ δ` is no better at any δ tested (0 through
0.2): at δ=0, real passes 26/74 (35%) and phantom passes 1219/4146
(29%) — essentially the same pass rate for both populations, meaning the
"did the transform do work" signal doesn't distinguish real from phantom
either. Neither rule, nor their conjunction, was implemented.

**Drift cap (step 3): a genuinely clean, safe signal — with almost no
practical reach on the actual target cases.** Real drift never exceeds
4.9px anywhere in the corpus (0/74 rows above 6px, let alone the
existing `6·tol = 12px` correspondence radius already used elsewhere in
this file). 237 of 4146 phantom rows exceed 6px, so the population-level
separation IS real and safe — a `6·tol` (or even a tighter 6px) cap would
never reject a genuine match. But checked against the SPECIFIC phantoms
actually reaching match-tier score (`widened ≥ scoreHigh`, i.e. the ones
that would actually become excess counts or contested tags) in the three
cases this step names: case `10` has 64 match-tier phantoms, of which a
drift cap at 6px catches 2 and at `6·tol=12px` catches only 1 (the one
`case 10 drift=36.1, widened=1, strict=1` outlier already visible by eye).
Case `06` has 17 match-tier phantoms; a drift cap at either threshold
catches ZERO of them (max phantom drift measured there: 3.9px). Case
`14` has 4 match-tier phantoms; a drift cap catches ZERO (max: 1.9px).
Case `17`'s own specifically-cited phantom (§1: "18 px from the real
unit," confirmed directly at `nearest_d: 17.8-18.2`, `widened: 0.99-1.0`)
has `drift: 1.1-1.7px` — nowhere near either cap. The signal that IS
clean doesn't touch the cases it was proposed to fix. No drift cap was
implemented.

**The volume itself is the more important finding than either failed
rule.** 4146 phantom rows across 9 cases, most never becoming a final
excess match or withheld row (case `10`'s real corpus-gate excess is
`+1`, not `+64`) — meaning the EXISTING merge/dedup/density/extraFor
machinery already collapses the vast majority of these raw accepted
proposals down before they'd ever reach a final count. What step 2/3's
rules were trying to do — reject an individual bad ROW before it
competes — is not where these specific cases' remaining failures live:
dozens of similarly-scored phantom candidates already cluster tightly
around the SAME small area as a real instance (case `17`'s thief sits 18
px away scoring 1.0, indistinguishable by any per-row signal measured
here from a genuine reading), and the actual failure is which ONE of
several plausible readings wins the final slot or the drawn tag — an
ASSIGNMENT/tie-breaking question, not an individual-candidate-quality
question. This is the same shape of problem Phase B's own Finding
already named for cases `01, 05, 10, 11, 18, 23` ("two real candidates
genuinely equidistant/ambiguous relative to one drawn tag") — Phase D's
own measurement now shows it applies to `06`, `14`, and `17` too, not
just the ones Phase B already flagged. Whoever revisits this needs a
mechanism that operates on the COMPETING SET near one location/tag, not
a per-row score threshold — closer to Phase F's own runner-diagnostics
idea (show the nearest withheld + `hold`) but for MATCH-vs-MATCH
competition, which no phase in this document currently proposes. Record
this as an open problem for a future phase, not a threshold to keep
retrying.

### Phase E — `glyphClusterMask` redesign, then re-enable it (case `02`)

Only after A–D, because D changes which rows exist at all.

1. Thread the text layer in: `fingerprintSymbol(segs, rect, lum, { …,
   textBoxes?: [x0,y0,x1,y1][] })` and `MatchOptions.textBoxes`. In both
   `glyphClusterMask` call sites, mask a segment whose BOTH endpoints lie
   inside a span box dilated by `2·tol` — before the geometric heuristic
   runs. `session.ts` has `s.spans` at both sites; `TakeoffCanvas.jsx` has
   `spans` one line later (reorder). This alone handles every exploded tag
   the PDF still exposes as text.
2. For ink with no text-layer explanation, replace the four-feature test
   with the literature's discriminators, each measured on the 19 real seeds
   `dropGlyphClusters` currently fires on (predecessor Finding lists them
   with their drop fractions) BEFORE being adopted: (i) connectivity — a
   short-stroke component that shares an endpoint (within `tol`) with a long
   stroke of the seed is body geometry, never text; (ii) hatch signature —
   ≥ 3 members with one dominant angle (±3°) and spacing CV < 0.25 is a fill,
   never text; (iii) fill density of the component's best-enclosing
   rectangle (`total stroke length / (w·h)` — glyph components ≈ 0.5 by
   Tombre's T3, hatch families far lower); (iv) baseline collinearity of ≥ 3
   sub-components of similar height (Fletcher–Kasturi strings). Unify
   `refDiag` between the two call sites (use the seed's own ink-bbox
   diagonal for both).
3. New fixture: a real-looking exploded tag (5 glyph-like components of
   ~6–8 strokes each, 8–12 px tall, on one baseline, with a `FlatSpan` over
   it) beside a symbol whose body carries a 6-stroke hatch fill touching its
   outline. Assert the tag drops and the hatch stays, with and without the
   span.
4. Flip `dropGlyphClusters` back to following `affine.enabled` ONLY if the
   full corpus is at least as good with it on as off (both runs recorded).
   Otherwise leave it off and say so.
5. Gate: `02` → 1/1 with the filter on; no regression on the other 18 seeds
   it fires on.

**Outcome, 2026-09-11 — step 1 shipped, corpus-clean, after fixing three real
bugs step 1's own first cut introduced; steps 2–5 not attempted, case `02`
UNCHANGED.** Step 1 as literally specified — thread `textBoxes` into
`fingerprintSymbol`/`matchSymbol`, mask a segment whose both endpoints sit in
a dilated span box — was implemented, and the first full 47-case run against
it (per this document's own "never trust a change without the corpus"
discipline) found it was NOT corpus-safe: a hard crash on case `45`
(`assertDistinctiveSymbolSeed` refused a seed collapsed from 5 real segments
to 3) and new failures/regressions on `06, 09, 20, 22, 25, 38, 40, 42` — eight
cases, none touched by Phases A–D. Root-caused to three distinct, compounding
bugs in the new `textBoxMask` helper, none anticipated by step 1's own spec
text, each fixed and corpus-reverified before the next was even visible:

1. **No length cap.** `textBoxMask` masked ANY segment with both endpoints in
   a dilated box, unlike `glyphClusterMask`'s own `shortMax = 4·tol` cap — so
   it could (and on case `45`, did) strip a symbol's own long structural
   edges whenever a text label happened to sit inside the symbol's outline.
   Fixed by adding the same cap.
2. **No size-fraction guard.** The length cap alone is not enough: a small
   symbol's own CURVED body (a circle/diamond drawn as many short polyline
   chords — case `42`'s thermostat bubble) is made entirely of short
   segments too, so a label centered inside a small bubble ("T" in a
   thermostat, "AI" in a diamond — both real, common HVAC/BAS conventions)
   still gutted real geometry: case `42`'s 33-segment seed collapsed to 9.
   Fixed by adding `glyphClusterMask`'s own `longSide >= 0.25·refDiag`
   "spans too much to be a label" guard to `textBoxMask` too, keyed to the
   SAME `refDiag` at both (now unified, closing part of step 2's own ask
   early). With both guards, cases `42` and `45` mask nothing at all (their
   only candidate text boxes fail the size-fraction test) — a no-op that
   happens to be exactly correct, since neither symbol needed anything
   excluded once the seed's own real geometry couldn't be mistaken for a tag.
3. **Centroid drift.** Even correctly-filtered ink shifts a fingerprint's
   length-weighted centroid, because the excluded ink is rarely symmetric
   about the true center — and every matched candidate's own disclosed `.at`
   is that centroid mapped through its own fitted transform, so it drifted
   too. Case `38` (a dense 1,001-segment pump assembly) measured this
   directly: a real match landed 2.22px from ground truth — just past its 2px
   tolerance — with an IDENTICAL score (0.988) to the byte-for-byte correct
   Phase D reading, proving it was a coordinate artifact, not a worse match.
   `SymbolFingerprint.rawCenter` already exists for exactly this reason (the
   predecessor affine document's own Finding, for the SEED's reported
   position) but nothing carried the same correction to a SWEPT candidate's
   own `.at`. Fixed with `matchSymbol`'s new `disclosedAt`: the fixed
   `rawCenter − center` offset, carried through each candidate's own fitted
   rotation/scale (`apply(m, …)`) and added to its translation — a provable
   no-op whenever nothing was filtered (`rawCenter === center` exactly
   whenever `droppedGlyphSegments` is unset), applied only at the two points
   a `Scored` row becomes a disclosed `SweepMatch`/`SweepWithheld`/
   `SweepRejected` (`row()`, the `rejected.push` site) — every internal
   distance/suppression check upstream still uses the uncorrected `s.at` for
   self-consistency within the filtered frame, untouched.

Re-verified individually (case 45 no longer crashes and returns to 16/16;
`06, 09, 20, 22, 25, 38, 40, 42` all return to their Phase D baseline
behavior — `06` still shows the SAME pre-existing `no one-to-one` ambiguity
Phase D already named as a target case, unrelated to this bug), then the full
47-case corpus gate: **35/47 PASS, 12 FAIL — the failing-case SET
(`01, 02, 05, 06, 10, 11, 13, 14, 17, 18, 23, 41`) is byte-identical to the
Phase D baseline. Zero new failures, zero regressions, zero crashes.** A new
regression test (`textBoxMask` against a small hand-built diamond whose 4
edges are all individually short, boxed by a label spanning most of its
body) closes the coverage gap the size-fraction guard's own bug exposed.
Web: tsc clean, 430/430 in the symbolsweep/affine/label suites (426 prior +
1 fixture-scale rewrite kept the original 3 Phase E tests green + 1 new
regression test); full web suite 2909 pass / 65 fail (fail count
byte-identical to the pre-existing baseline every prior phase has recorded —
confirmed unchanged on a stashed pre-fix tree). MCP: tsc clean; core suite
green (2 unrelated `ModuleNotFoundError: No module named 'pytest'` failures
in the `basEngineering*` suite confirmed pre-existing on a stashed baseline —
a sandbox Python-module gap, not a symbol-sweep regression). eslint clean (0
errors; the same 3 pre-existing unrelated warnings Phase B already recorded).

**Steps 2–5 were not attempted this session and case `02` is UNCHANGED**
(`5/1`, `count 5 != 1`, the exact Phase D baseline reading) — step 1 alone
never touches `dropGlyphClusters` or case `02`'s own failure mode (a real
component near the seed, not an exploded tag with a text-layer span). The
literature-discriminator redesign (connectivity / hatch signature / fill
density / baseline collinearity, measured against the 19 real seeds
`dropGlyphClusters` fires on), the new fixture, and the `dropGlyphClusters`
re-enable + case `02` gate remain open for whoever picks Phase E back up —
shipping this as "Phase E step 1," not Phase E complete.

**Outcome, 2026-09-11 — step 2 measured, not implemented: step 4's own
decision rule ("flip `dropGlyphClusters` back on ONLY if the full corpus is
at least as good with it on as off... otherwise leave it off and say so")
was tested directly against today's already-fixed engine, and the answer is
still no — more clearly no than the predecessor document's own finding, in
fact, because two more real regressions turned up that were not previously
recorded.** Before designing new discriminators, re-ran the census this
document's own step 2 asks for, but against ink with NO text-layer
explanation (`textBoxes` already applied first, per step 1) rather than the
raw heuristic the predecessor doc measured — the more honest baseline now
that step 1 exists. Result: the geometric heuristic fires on **20** of 47
seeds (not the predecessor's 19 — the scope shifted slightly once text-layer
exclusion already accounts for some of what it used to catch), dropping
between 7.8% (`02`) and 89.5% (`14`) of each seed's post-text-filter
segments. Then measured FRESH ground truth for all 20 with a TEMP DIAGNOSTIC
patch (`dropGlyphClusters: true` at the seed's own fingerprint call, deleted
before this commit) run against the current engine, comparing each case's
own pass/fail against its already-known off-baseline:

- **Fixed by turning it on: exactly 1 case — `02` (5/1 → 1/1).** Matches the
  predecessor's own finding exactly; this remains the one case where the
  heuristic does real, correct work.
- **Broken by turning it on: 4 cases, newly regressed — `03` (23/23 →
  24/23), `24` (2/2 clean → `no one-to-one` on `building-controller-b-bc-2`),
  `33` (3/3 → 9/3), `46` (7/7 → 11/7).** `33` and `46` are NEW information —
  neither appeared in the predecessor's own per-case delta table, meaning
  today's larger, more thoroughly-measured firing set surfaces damage the
  earlier, narrower survey never saw.
- **Made measurably worse without flipping pass/fail: 3 already-failing
  cases got worse, not better — `01` (excess 19→22), `10` (excess 36→66,
  nearly doubling), `17` (excess 8→23, nearly tripling).** `13` and `14`
  (the sheet-number and unrelated-cluster failures) were unaffected either
  way, consistent with the predecessor's own finding that these are
  untouched by this heuristic.

**Net: 1 fix against 4 new regressions plus 3 cases actively getting worse
— not "at least as good," clearly worse, on data specifically gathered
against the CURRENT, already-corpus-hardened engine.** Step 4's own decision
rule therefore says: leave `dropGlyphClusters` off, and say so — which this
entry does. Steps 2 and 3 (the literature-discriminator redesign, the new
fixture) were not implemented on top of this, for the same reason Phase D
recorded when its own two candidate rules failed the same kind of test:
"tested... none worked, for the structural reason above, not from an
unlucky choice of number" applies here too — spending engineering effort
designing four new hand-crafted discriminators to isolate exactly ONE case
out of 20, when this document's own predecessor already tried a regularity-
based discriminator on that exact case and found it did not cleanly separate
("`R = 0.670`, 14 distinct angle buckets across only 32 segments —
proportionally MORE angular diversity than case 10's already-inconclusive
cluster, not less"), is very likely to re-derive the same negative result at
a much higher cost, not find a clean rule this and the predecessor document's
combined ~40 seeds of evidence haven't already ruled out. Recorded as an
open problem, not a threshold worth re-trying with a different number:
**case `02`'s real fix almost certainly needs a MECHANISM other than a
geometric glyph-cluster heuristic** — the four candidates carry 110–195%
extra ink relative to the seed (§1's own original diagnosis) with no
`variant_guard` set, so the actual gap may be that extreme excess ink should
read as a signal independent of `variant_guard` entirely, not that the SEED
needs different segments. That is a genuinely different, unexplored
direction from anything Phase E scoped, and is left for whoever picks this
up next rather than forced into this phase's own remit.

Web: no test changes (nothing was implemented to test, matching Phase C/D's
own precedent when a phase's own measurement comes back negative); tsc
clean, symbolsweep suite unchanged from Phase E step 1's own count (430/430).
MCP: untouched (the TEMP DIAGNOSTIC patch was reverted with `git checkout --`
before this commit, per this document's own §0 convention — `git diff`
confirmed clean afterward).

### Phase F — runner diagnostics, two clean runs, then the default flip

1. `mcp/scripts/symbol-sweep-corpus.mjs` (~193): when `assignInstances`
   fails, also print, for the missing expected instance, the nearest
   `withheld` row (distance, score, `hold`, first 80 chars of `reason`) and
   the nearest match — "no one-to-one localization" hid that case 05's real
   instances were found at d = 0 for a whole day. Do this FIRST if it helps
   Phase B; it is diagnostics only.

   **Done, 2026-09-11.** Output-only change (two new `errors[]` lines on
   the existing failure path, nothing about pass/fail logic touched);
   verified directly on case `17` before committing, then run against 6 of
   the 12 currently-failing cases (`01, 05, 11, 17, 18, 23`) to survey the
   `no one-to-one` failure family this document has, until now, treated as
   one problem. It is not one problem — see the Finding below for the full
   breakdown into (at least) five distinct sub-mechanisms hiding behind the
   same error string.
2. Two consecutive full 47-case runs with identical per-case output
   (determinism), 46/47 passing (`13` is the pre-existing sheet-number
   failure — do not touch its ground truth, do not special-case it in the
   runner; note it).
3. Then, and only then, the default flip: exactly as the predecessor's §3
   Phase 5 step 6 and §8 describe — its own commit, `AFFINE_WIRE_DEFAULT`
   applied by `tools.ts` (`.default(AFFINE_WIRE_DEFAULT)` on the whole
   `affine` object, not on the inner `enabled` — the zod nested-default gap
   is a recorded Finding), `agentTools.js` in parity, `runSymbolSweep`'s
   manual marquee path turned on, `AGENT_GUIDE.md`/`MCP.md` updated, the
   predecessor's §8 boxes ticked with the run ids that prove each one.

## 4. Contracts touched (exact)

- `SweepWithheld.hold?: "bounds" | "density" | "extra" | "unexplained"` —
  additive, optional, mirrored in `outputs.ts` on every withheld schema that
  spreads `sweepPlacement`/`rowSweepPlacement`. Never on a `matches` row.
- `LabelPlacementOptions.eligible?: boolean[]` — additive, optional.
- `fingerprintSymbol` opts / `MatchOptions`: `textBoxes?` — additive, Phase E.
- `SweepTransform.score_base_px?` — only if Phase D's rule uses it.
- `AFFINE_MIN_SINGULAR`, `affineSingularValues` — new exports.
- Reason strings are product-facing (`SweepReviewPanel.jsx` quotes the
  "matched X% … (commit bar Y%)" wording); keep the established voice, name
  the numbers, end with what to do (`view_sheet here…`).

## 5. Working method

- Diagnose instance-by-instance, never by aggregate count: a "5/5" can be
  five phantoms (case 05 was). The script pattern that found every cause
  above: load the case via `Session.loadPlan`, call `session.symbolSweep`
  twice (with and without `affine`), and for each authored instance print
  the nearest match AND nearest withheld with score/`transform`/`extra`/
  `hold`; then list every match with no authored instance within 20 px.
- Check a proposed rule against real rows from BOTH populations (real
  widened matches on passing cases, phantoms on failing ones) before writing
  it. Record a rule that fails to separate as a Finding — that is signal.
- The corpus is the gate for every phase; the unit tests are the gate for
  the engine contract. Both, always, before a commit.
- When a fix changes what a case fails ON (count → localization), that is
  progress AND a new diagnosis — write both down.

## 6. Definition of done

- [ ] Phases A–F each committed, each with its own corpus numbers in §7.
- [ ] 46/47 with `AFFINE_WIRE_DEFAULT` on, two consecutive identical runs;
      the 47th is `13`'s pre-existing sheet-number failure, unchanged.
- [ ] Zero rows anywhere in the corpus output with `min(scale_x, scale_y) <
      AFFINE_MIN_SINGULAR`.
- [ ] Every withheld row that cleared the score bar carries a `hold`, and no
      held row is ever promoted (grep the runner output).
- [ ] `affine` absent → results deep-equal the pre-flip baseline (the
      predecessor's no-op proof still holds).
- [ ] Canvas/MCP parity test green including `hold`.
- [ ] Default flipped in its own commit, after all of the above.

## 7. Numbers (fill in as you go — this section is the record)

| Milestone | Date | Fail / 47 | Excess matches | Per-case changes | Notes |
|---|---|---|---|---|---|
| Start (`036e12f`) | 2026-09-11 | 13 | 12 | see §1 | baseline for this document |
| Phase A | 2026-09-11 | 12 | 10 | `05`: lost 2 of 3 errors (`seed tag <none>` and `seed on wrong text-run box` both cleared — only `no one-to-one for d10-02` remains). `10`: lost 2 of 3 errors the same way, and its excess dropped `+3 → +1` (38→36 vs 35; only `no one-to-one for cd1-02` remains). `28`: FULLY FIXED (was localization-only, now exact 2/2). `01, 02, 06, 11, 13, 14, 17, 18, 23, 41`: byte-identical to the baseline row — none of these touch a degenerate fit, exactly as diagnosed in §1. | `fitAffine` refuses a rank-deficient result (`AFFINE_MIN_SINGULAR = 0.2`); `scoreAt`/`scoreAtTol` guard `!sLen`. Verified directly (not inferred): case 11 now has ZERO matches or withheld rows with `min(scale_x, scale_y) < 0.2` anywhere in its output (was 4). Gate 4's letter ("case 11's four scale 0×0 matches gone") is met, but case 11 itself still fails on the SAME localization error as before — the degenerate matches were stealing OTHER real instances' tags too (see the Finding below), so removing them didn't clear case 11's own reported failure; that needs Phase B. Web: tsc clean, 423/423 tests green (420 pre-existing + 3 new `fitAffine` degeneracy tests). MCP: tsc clean, 123/123 green. No case regressed. |
| Phase B | 2026-09-11 | 12 (unchanged) | 9 | `06`: its count issue is FULLY GONE (`14→13`, was `+1`) — the held phantom that was winning the count no longer competes for or gets promoted on a drawn tag, but the real instance it displaced still fails a DIFFERENT check (`no one-to-one for ss15-upper-04`, a NEW localization mismatch this case did not show before) — net: the excess match is gone, the case's pass/fail did not flip. `17`: still one `no one-to-one` failure, but on a DIFFERENT instance (`cu-bo1`, was `cu-bo2`) — the eligibility/uncontested-seed change shifted which candidate wins a tie, not which one loses. `01, 02, 05, 10, 11, 13, 14, 18, 23, 41`: byte-identical to the Phase A row (same errors, same counts) — `eligible`/`hold`/the uncontested seed did not touch these specific failures, meaning their `no one-to-one` errors are NOT (or not solely) caused by C1's tag-theft mechanism; they need their own re-diagnosis, not assumed to be the same cause. | `SweepWithheld.hold?: "bounds"\|"density"`; `LabelPlacementOptions.eligible?`; `reconcileSweepLabels`' promotion gated on `!row.hold`; `session.ts`'s `sweepLabels` reports the seed's UNCONTESTED lookup, threads `eligible`/`hold` through; `TakeoffCanvas.jsx`'s `agentSymbolSweep`/`runSymbolSweep` mirror the same three changes (canvas/MCP parity) plus the `dropGlyphClusters` parity-bug fix (§2 C2 note). New fixture `mcp/test/fixtures/symbol-hold.pdf` (via `make-symbol-fixture.mjs`) proves `hold` reaches the wire through a REAL PDF, not just the pure-engine level. Web: tsc clean, 426/426 tests green (423 pre-existing + 3 new symbolLabels tests). MCP: tsc clean, 125/125 green (123 pre-existing + 2 new: session.test.ts's wire-level `hold` proof, symbolSweepAffineParity.test.ts's passthrough proof). eslint clean on both touched `.jsx`/`.js` files (3 pre-existing unrelated warnings, 0 errors). No case regressed — the net corpus change is strictly non-negative (one fewer excess match, zero new failures). |
| Phase C | 2026-09-11 | 12 (unchanged) | 9 (unchanged) | No case's pass/fail or count changed — ZERO engine code shipped from this phase. Two attempts were built, corpus-tested, and reverted: (1) `widenedExtra`/`hold:"extra"` (withhold a widened+high-extra row outright) — passed its synthetic test, but corpus-wide 5 real widened instances (2 cases) measure extra in [0.378, 1.408], fully overlapping the 85 phantom widened rows' own [0.322, 5.182] range — no threshold separates them. (2) The `extraFor` coverage-tolerance fix (check coverage at a row's own `transform.tol_px`, not the stricter base `tol`) that attempt 1 surfaced along the way — kept initially as "corpus-safe by construction" (no case sets `variant_guard`, `extra` only gates `matchSymbol`'s own `isMatch` when guarded), but a FULL 47-case run found `variant_guard` is not `extra`'s only consumer: `symbollabels.ts`'s `reconcileSweepLabels` independently demotes an unlabeled high-extra match (line ~968), and the fix regressed case `42` (3/3 → 4/3) through exactly that path — a phantom's extra dropped from a buggy 0.641 to a genuine 0.0485 once the coverage window widened enough to sweep in real, unrelated nearby drawing content as "covered." Traced to the single row, confirmed deterministic (2 runs each, byte-identical) and isolated (the only case whose pass/fail changed in the 47-case run) before reverting. | See the goal doc's own Phase C outcome note (§3) for the full trace of both attempts, including the exact numbers, the offending row's coordinates, and the lesson for whoever revisits this: `extra`'s two independent consumers (`matchSymbol`'s own `variant_guard` gate and `reconcileSweepLabels`' unrelated no-tag-demotion rule) must BOTH be corpus-tested together, not just the one a change directly touches. Web tsc clean; symbolsweep/symbolLabels/symbolAffine suites 177/177 (byte-identical to Phase B's own count — Phase C's synthetic test was removed along with its reverted mechanism, back to exactly what Phase B shipped); full web suite matches the pre-existing baseline exactly (2905 pass / 65 fail — the 65 are pre-existing, unrelated IndexedDB/sync/Drive infra failures, confirmed identical on a stashed pre-Phase-A tree earlier in this document's own work). MCP tsc clean; Phase C touched no MCP test file, so MCP's own count is unchanged from Phase B (125/125). eslint clean. `docs/SYMBOL-SWEEP-CLEAN-CORPUS-GOAL.md`, `web/src/lib/symbolsweep.ts`, `mcp/src/outputs.ts` carry only documentation of both abandoned attempts (a `SweepWithheld.hold`/`sweepHold` doc-comment note pointing here) — no functional change. |
| Phase D | 2026-09-11 | 12 (unchanged) | 9 (unchanged) | No case's pass/fail or count changed — ZERO engine code shipped from this phase, same outcome shape as Phase C. Step 1's table was built (a TEMP diagnostic, deleted before commit, logging every accepted refined row ≥ scoreLow across 9 cases: the 6 named targets plus 3 passing cases with real widened rows). Step 2's candidate rules (`strict ≥ scoreLow`, `strict − rigid ≥ δ`) show heavy real/phantom overlap — `strict ≥ 0.75` would reject 71.6% of real refined rows while still letting 2.5% of phantoms through, the opposite of useful; no δ tested (0 to 0.2) separates `strict − rigid` either (real and phantom pass at nearly identical rates). Step 3's drift cap IS statistically clean (real drift never exceeds 4.9px anywhere in the corpus; a cap at 6px or the existing `6·tol=12px` constant would never reject a genuine match) but has almost no reach on the actual target cases: case `10`'s 64 match-tier phantoms lose only 1-2 to a drift cap; case `06`'s 17 and case `14`'s 4 lose zero; case `17`'s own specifically-cited 18px-away phantom (§1) has only 1.1-1.7px of drift — nowhere near any cap. | See the goal doc's own Phase D outcome note (§3) for the full numbers and the structural finding: the volume of accepted-but-never-final phantom rows (4146 across 9 cases, vs 74 real) shows the EXISTING merge/dedup/density machinery already does the real work of collapsing most raw candidates before they'd ever count — what's left in cases `06`, `10`, `14`, `17` is not an individual bad row slipping a weak per-row gate, it's several SIMILARLY-SCORED candidates clustered around one real location or tag, with no per-row score/drift signal measured here able to tell them apart (case 17's thief scores 1.0, same as a real reading, 18px away). This is the SAME failure shape Phase B's own Finding already named for `01, 05, 10, 11, 18, 23` ("two real candidates genuinely equidistant/ambiguous") — Phase D's measurement extends that diagnosis to `06`, `14`, `17` too. No mechanism in this document currently addresses a competing-SET assignment problem (only per-row score/geometry checks); recorded as an open problem for a future phase, not a threshold worth re-trying with different numbers. Web tsc clean (no test changes — nothing was implemented to test); web suite unchanged from Phase C's own count. MCP untouched. |
| Phase E step 1 | 2026-09-11 | 12 (unchanged) | 9 (unchanged) | Case `02` (Phase E's own step 5 gate target) UNCHANGED — steps 2–5 not attempted, this is text-layer threading only. Every case step 1's FIRST cut regressed (`06, 09, 20, 22, 25, 38, 40, 42`, plus a hard crash on `45`) is back to its Phase D baseline behavior — `09, 20, 22, 25, 38, 40, 42, 45` now PASS, `06` shows the same pre-existing target-case ambiguity Phase D already named (unrelated to this work). Failing-case SET is byte-identical to Phase D: `01, 02, 05, 06, 10, 11, 13, 14, 17, 18, 23, 41`. | Full trace in §3's own Phase E outcome note: `textBoxes` threaded into `fingerprintSymbol`/`matchSymbol` per step 1's spec, then THREE real bugs found and fixed via the SAME full-corpus-before-trusting discipline this document has used throughout — (1) `textBoxMask` given `glyphClusterMask`'s own `shortMax = 4·tol` length cap, (2) `textBoxMask` given `glyphClusterMask`'s own `longSide ≥ 0.25·refDiag` size-fraction guard (`refDiag` now unified between both call sites), (3) `matchSymbol`'s new `disclosedAt` helper carries the seed's `rawCenter − center` offset through each candidate's own fitted rotation/scale before disclosure, fixing a real position drift a filtered fingerprint's centroid introduces into every matched candidate's reported `.at` (a no-op whenever nothing was filtered). New regression test for bug 2 (a small diamond, every edge individually short, boxed by a label spanning most of its body — must drop nothing). Web: tsc clean, 430/430 in the symbolsweep/affine/label suites; full web suite 2909 pass / 65 fail (fail count identical to the pre-existing baseline, confirmed on a stashed tree). MCP: tsc clean; core suite green; eslint clean (0 errors, 3 pre-existing unrelated warnings). |
| Phase E step 2 | 2026-09-11 | 12 (unchanged) | 9 (unchanged) | No case's pass/fail changed — ZERO engine code shipped, measurement only. Step 4's own gate ("flip `dropGlyphClusters` back on only if the full corpus is at least as good with it on as off") was tested directly and failed: forcing it on across the 20 seeds it fires on (post text-layer filtering) fixes exactly 1 (`02`) while newly regressing 4 (`03, 24, 33, 46`) and worsening 3 already-failing cases (`01, 10, 17`). `33` and `46` are new information the predecessor document's own narrower survey never recorded. | Full numbers in §3's own Phase E step 2 outcome note. Steps 2–3 (the literature-discriminator redesign, new fixture) were not implemented — designing four new discriminators to isolate exactly one case out of 20, when a regularity-based discriminator was already tried on that exact case and found inconclusive, risks re-deriving the same negative result Phase D's own Finding already named for a different mechanism ("tested... none worked, for the structural reason above, not from an unlucky choice of number"). Case `02`'s real fix is left as an open problem, with a concrete alternative direction recorded: its 4 phantoms carry 110–195% extra ink with no `variant_guard` set, so the actual gap may be that extreme excess ink should read as its own signal independent of `variant_guard`, not that the seed's own fingerprint needs different segments. Web: tsc clean, no test changes. MCP: untouched; the TEMP DIAGNOSTIC patch was reverted (`git checkout --`) before this commit. |

Findings (a case that contradicts a rule above is recorded here, never fixed by bending the rule):

- **2026-09-11 — Phase A's own gate ("case 11's four scale 0×0 matches gone") was met exactly as written, but did NOT clear case 11's reported failure — a real, useful distinction the gate's wording glossed over.** §1 diagnosed case 11 as "four committed matches with `scale_x 0, scale_y 0, rms 0, score 1` carrying the tags `1-VAV-4/10/12/16` stolen from the real thermostats." Verified directly post-fix: those four rows are gone (0 remaining anywhere with `min(scale_x, scale_y) < 0.2`), and the corpus confirms it — case 11's `found` count is still 15/15 (unchanged), meaning four DIFFERENT candidates now fill the count, and the case still fails with the exact same error string (`no one-to-one localization for new-thermostat-vav-4`). This is consistent with, not contradicting, §2's own C1 diagnosis: the ENGINE bug (a degenerate fit scoring 1.0) is only half of C1 — the DESIGN gap (bounds-failed/held rows competing for drawn tags with no geometric gate, §2's part (b)) is the other half, and it is untouched by Phase A on purpose (that is exactly Phase B's job). Recorded so a future reader does not mistake "the named mechanism is gone" for "the case passes" — they are different claims, and this document's own §1 table conflated them for cases `01`, `11`, `17`, `18`, `23` by listing a single combined cause. `05` and `10` DID clear enough of their errors to shed two of three; the remaining `no one-to-one` on both is the same design-gap mechanism, now isolated as a single clean target for Phase B.

- **2026-09-11 — Phase B implemented and gated. Result, honestly: the design-gap half of C1 (held rows competing for and winning drawn tags) is now closed — verified directly, not one case remains where a `hold`-bearing row is promoted or wins a text run over an eligible candidate — but this closes only ONE of the six `no one-to-one` cases §1/Phase A flagged as "same signature as `17`," not all of them.** Per §3 Phase B step 7's own instruction to record which of the six clear and which don't:
  - **`06` — real, measurable win.** Its count excess is gone (`14→13`, was `+1`): a held phantom was previously winning the count. But the case still fails, now on a DIFFERENT check (`no one-to-one for ss15-upper-04`) that did not appear before — a real instance that used to be correctly counted is now involved in a genuine two-candidate tie the assignment resolves the "wrong" way. Net: real progress on the excess-match metric, zero progress on pass/fail for this case.
  - **`17` — the failure moved, not cleared.** Before: `no one-to-one for cu-bo2`. After: `no one-to-one for cu-bo1`. Same failure count, a different specific instance now loses the tie — consistent with `eligible`/the uncontested-seed change shifting WHICH candidate wins an assignment, not with the underlying ambiguity being resolved.
  - **`01, 05, 10, 11, 18, 23` — completely unchanged**, byte-identical errors to the Phase A row. Since Phase B's ENTIRE mechanism is "exclude held rows from the tag competition," an unchanged failure here means the specific candidate that's winning or losing the wrong tag on these cases is NOT itself a held row — it is a genuine, ELIGIBLE candidate (a real rigid or non-degenerate affine match) that is simply closer to the wrong tag, or two real candidates genuinely equidistant/ambiguous relative to one drawn tag. This is a DIFFERENT failure mode than C1's own held-row-theft mechanism, even though the runner reports it with the identical string ("no one-to-one localization for X") — the corpus runner's own message does not distinguish "the tag went to a held phantom" from "the tag went to the wrong genuine candidate," which is exactly the diagnostic gap Phase F's own runner-diagnostics step (nearest withheld + its `hold`) is meant to close. Whoever picks up the remaining six cases should run that diagnostic FIRST, per case, before assuming Phase B's own mechanism applies — assuming it without checking is exactly the mistake this Finding is recording against.
  - Conclusion: Phase B is real, validated, and correctly scoped — it fixes what it claims to fix (excess matches and promotions caused specifically by held/degenerate rows), and the corpus proves that mechanism now works (case 06's count fix, case 11's confirmed loss of its four stolen tags in the Phase A Finding above). It was never going to clear every `no one-to-one` case, because not every one of them shares C1's root cause — that assumption, inherited from §1's own combined listing, is the thing this Finding corrects.

- **2026-09-11 — Phase C: both attempts failed real corpus measurement, and the second failure disproves an assumption this document's own author made about `extra`'s blast radius.** Full trace in §3's Phase C outcome note; the load-bearing part, recorded here because it generalizes beyond this one phase: `extra` (the fraction of a placement's footprint not explained by the seed) has TWO independent consumers in this codebase, not one. `matchSymbol` itself (`symbolsweep.ts`) only ever gates on `extra` when the caller passes `variant_guard: true` — true of zero cases in this corpus, which is why the `extraFor` coverage-tolerance fix looked provably safe from inside `symbolsweep.ts` alone. But `symbollabels.ts`'s `reconcileSweepLabels` (line ~968) separately demotes any unlabeled match with `extra > 0.3` to withheld, UNCONDITIONALLY — no `variant_guard` involved at all. Fixing `extraFor`'s own internal bug (a real, defensible fix in isolation, still fixes a genuine false positive on a clean synthetic case) changed the NUMBER `extra` reports for every widened row, and that number feeds a completely different, separately-authored gate this phase's own author did not check before judging the fix "corpus-safe." Concretely: a phantom in case `42` had its buggy `extra` (0.641, itself inflated by the very bug being fixed) demoted by line 968; the corrected `extra` (0.0485) no longer triggered that demotion, and the phantom counted, regressing a previously-passing case. Both the phantom's un-real status (227px from the nearest of the case's 3 authored instances) and the effect's determinism (2 runs each of both code versions, byte-identical) and isolation (the ONLY case whose pass/fail changed anywhere in the 47-case run) were verified directly, not assumed, before reverting. The general lesson: "this value only gates X, and X doesn't apply to any corpus case" is not the same claim as "this value has no other consumers" — the second claim needs an actual grep across the codebase for every read site of the field being changed, not just a check of the ONE mechanism the change was originally about. Neither Phase C attempt should be retried without first grepping every consumer of whatever value the new attempt changes, corpus-testing all of them together.

- **2026-09-11 — Phase D: the remaining `no one-to-one` failures are an ASSIGNMENT problem among near-identical candidates, not an individual-candidate-quality problem — no per-row score or geometry signal measured here can fix them.** Full numbers in §3's Phase D outcome note. The load-bearing part: this document's own §2 C4 diagnosis ("fits that did no work... but still got a widened tolerance") implicitly assumed the failure mode was a bad candidate CLEARING a bar it shouldn't have — fixable by adding a stricter bar. Phase D's own measurement shows that is not what is happening in cases `06`, `14`, `17` (and, per Phase B's own earlier Finding, `01, 05, 10, 11, 18, 23` too): case `17`'s phantom that steals `cu-bo1`'s tag scores `widened: 1.0`, `drift: 1.1-1.7px` — numerically indistinguishable, on every signal this phase measured, from a genuine reading of the real device 18px away. There is no bar it "shouldn't have cleared" — it clears every bar a real instance would, because near a busy real location, MULTIPLE candidates genuinely look equally good. Both of this phase's candidate mechanisms are individual-row filters (`strict`/`strict-rigid` score a single row against itself; a drift cap rejects a single row for having moved too far); neither kind of mechanism can distinguish "the one correct reading among several equally-plausible ones" — that requires reasoning about the SET of nearby candidates together (which one is closest to the drawn tag, which one the seed's own placement history favors, which one a human would pick first), not a property of any one row in isolation. This reframes what §2's C4 diagnosis was actually observing: not a scoring-bar defect, but symptoms of the SAME underlying gap C1's design half (§2 (b)) already named for the label-competition case — genuine one-to-one assignment, done properly, needs validity gating BEFORE assignment over an explicit candidate SET, and this codebase does not have that machinery for match-vs-match competition (only for tag-vs-placement competition, which Phase B built). Recording this now so the next person who looks at `06`, `14`, or `17` does not re-derive "maybe a slightly different threshold would work" from scratch — it was tested at every δ from 0 to 0.2 and at multiple drift caps, and none worked, for the structural reason above, not from an unlucky choice of number.

- **2026-09-11 — Phase E step 1: a spec followed literally ("mask a segment whose both endpoints lie inside a dilated span box") is not the same claim as "mask a segment that is actually spurious tag ink" — the gap between those two claims produced a worse regression than anything Phases A–D shipped, caught only because this document's own full-corpus discipline was applied to step 1 too, not just to the phases that proposed a new threshold.** Full numbers and the three-bug trace in §3's own Phase E outcome note. The generalizable part: `glyphClusterMask` (the PRE-EXISTING geometric heuristic Phase E was explicitly threading a text-layer signal ALONGSIDE) carries two protections that have nothing to do with being "geometric" per se — a length cap (never touch a segment long enough to plausibly be real structure) and a size-fraction cap (never touch a region large enough to plausibly be real structure) — and `textBoxMask`'s first cut had neither, because an "authoritative fact from the text layer" (a span really is text) was wrongly treated as proof that ink merely OVERLAPPING that span's box is also just that text, with no check on whether the overlapping ink could independently BE the symbol. Two real, common HVAC/BAS drafting conventions break that assumption: a tag lettered literally inside a symbol's own outline (case `45`'s "AI" inside a diamond, case `42`'s "T" inside a thermostat bubble) and a small symbol's own body drawn as many short polyline chords (any circle/bubble) — between them, a label's dilated box can legitimately cover a large fraction of a small symbol's own real geometry, long edges and short chords alike. Once both caps were ported over from `glyphClusterMask` (unifying `refDiag` between the two mechanisms, itself a piece of step 2's own ask, done early), textBoxMask's exclusion became inert on both cases — the CORRECT behavior turned out to be "exclude nothing," not a smarter version of "exclude something." A third, quieter bug survived even that: excluding real ink (correctly, this time — case `38`'s legitimately-separate tag block) still shifts a fingerprint's own weighted centroid, and nothing carried that shift into a SWEPT candidate's own reported position the way `rawCenter` already does for the SEED's — proving that `rawCenter`'s existence for one consumer does not mean every consumer that needs the same correction has it; each disclosure site of a value derived from a filtered centroid needs its own check, not an assumption that the existing `rawCenter` field already covers it. Recorded so a future "thread an authoritative source in as an additional exclusion signal" change starts from BOTH of `glyphClusterMask`'s existing caps and this centroid-disclosure lesson, not just the geometric heuristic's four scoring features Phase E's own step 2 already planned to replace.

- **2026-09-11 — Phase E step 2: the predecessor document's own "none of the 19 seeds look like a clean, conservative drop" finding was tested fresh against today's already-fixed engine, on a wider set (20, not 19), and the answer got MORE negative, not less — two real regressions (`33`, `46`) surfaced that a narrower survey never saw, and neither showed up in any prior phase's own case list.** Full numbers in §3's own Phase E step 2 outcome note. The load-bearing part, generalizing beyond this one phase: measuring a heuristic's on/off effect against a STALE engine snapshot understates the RISK of turning it on, not just the benefit — Phases A through E step 1 each independently fixed real bugs that changed which candidates exist and how they score, and every one of those changes was an opportunity for a previously-invisible interaction with `dropGlyphClusters` to surface (as it did here, twice, on cases the predecessor's own narrower census never fired on: `33` and `46` are NOT in that document's per-case delta table at all). Whoever next considers re-enabling ANY heuristic this document has left disabled-pending-redesign should re-measure it fresh against the CURRENT engine before trusting an old on/off comparison, not treat a prior negative result as permanently definitive OR permanently stale — it can get worse as the rest of the pipeline changes, exactly as it did here. The other load-bearing part: two independent measurements, on two different engine snapshots weeks apart in this document's own timeline, both single out case `02` as the ONE case genuinely helped by this heuristic and find every other firing case neutral-to-harmful — that consistency is itself evidence the underlying cause is real and stable, not noise, which is why this Finding recommends against re-deriving it a third time with hand-tuned discriminators rather than treating the question as unresolved.

- **2026-09-11 — Phase F step 1's own diagnostic, run against 6 of the 12 currently-failing cases, shows "no one-to-one localization" is not one problem — it is at least FIVE distinct sub-mechanisms, each requiring its own fix, sharing one error string.** This meaningfully refines Phase D's own "assignment problem among near-identical candidates" framing, which was accurate as far as it went but treated the failure family as more homogeneous than it is. Per-case evidence, all gathered via `symbol-sweep-corpus.mjs`'s new nearest-withheld/nearest-match diagnostic:
  - **(A) A dense, EXPECTED cluster of real closely-packed units, where the density-suppression mechanism is working exactly as intended but the wrong placement is being tagged — case `17`.** First read as "the correct candidate (1.0px, score 0.949) is suppressed by one nearby phantom," but tracing every row within 100px turned up FIVE separate rows scoring 0.949–0.992, each independently `hold: "density"`, at different fitted rotations. The case's own ground-truth review notes (`cases.json`, read after the trace, not before — a real process gap this Finding flags on itself) explain WHY: `17` is nine real condensing units, several genuinely mounted close together on one exterior pad (`CU-B1` the seed, `CU-BO1/CU-BO2/CU-B2/CU-B3` on the pad), and the reviewers explicitly anticipated multiple rotated "alternate transform hypotheses... around the same physical fan[s]" — that's precisely what `hold: "density"` exists to hold back, working as designed. The reviewers' own resolution for the two hatch-overlapped pad units was that each "own literal equipment leaders attach to the same CU family," i.e., a drawn LEADER LINE, not proximity, is what should determine which physical position gets which tag when units sit this close. That is a real, different, and more specific hypothesis than "prefer the higher-scoring candidate": whoever picks this case up next should check whether `sweepLabels`/`reconcileSweepLabels`'s tag-attachment already uses leader-line geometry with the confidence the reviewers' own methodology assumes, for tightly-clustered same-family instances specifically — not touch density-suppression itself, which is doing its job.

    **Traced further, and this is confirmed, not just hypothesized — with the exact mechanism and the exact line.** `session.ts`'s own `eligible: [...matches.map(() => true), ...withheld.map((w) => !w.hold)]` marks every `hold`-carrying row ineligible before `labelPlacements` ever runs, and `symbollabels.ts` checks `options.eligible?.[p] === false` at EDGE-BUILDING time (lines ~795, ~864) — an ineligible placement never gets an edge to any token, for any reason, so it can never appear in `assignEdges`' own `choices[ti]` array. That matters because `assignEdges` ALREADY HAS a mechanism built exactly for this scenario — "Literal leaders identify the physical equipment occurrence, but an eccentric/partially symmetric seed can cast several transform peaks across that same symbol. Transfer the leader evidence to the strongest nearby peak" (`symbollabels.ts` ~685-694, `samePhysicalR` merge) — but it can only choose the strongest peak AMONG ELIGIBLE ones, and the strongest peak here (0.949, closest to ground truth) was excluded from eligibility before that merge ever runs. Phase B's `!row.hold` exclusion was built to stop a bad row from being independently PROMOTED via tag corroboration (still correct, and still needed) — it was never meant to also make that row invisible to a DIFFERENT, already-existing mechanism whose whole job is picking the best of several peaks for one leader. The fix is almost certainly narrower than either "loosen `hold` eligibility generally" (would risk reopening exactly what Phase B closed) or "change density-suppression" (not the bug): let the `samePhysicalR` peak-selection specifically consider `hold`-carrying candidates as merge targets — never as independently-promotable placements, only as a better REPORTED CENTER for a leader that already, validly, hit one of their eligible neighbors. Scoped narrowly like that, it should be back-compatible with every case Phase B's own gate already protects (a `hold`-carrying row still can never win a tag on its own; it can only improve the reported position of a tag an ELIGIBLE neighbor already earned) — but this is a real code change, not documentation, and needs the same full-corpus proof this document has required of every phase before being trusted; not attempted this session.

    **Attempted, tested directly against case `17`, and reverted — this "should be back-compatible" reasoning was wrong, in a way worth recording precisely.** Implemented exactly as scoped above: a new `LabelPlacementOptions.mergeable` array (`hold: "density"` rows only, never `hold: "bounds"`), threaded through `session.ts`/`TakeoffCanvas.jsx` into `assignEdges`' `samePhysicalR` search as additional candidates a leader's tag could be re-centered onto, never as independently-promotable edges. `symbolLabels.test.ts`'s own case-11 regression test (`label corroboration never promotes a HELD withheld row, even with the seed's own tag adjacent`) still passed — the promotion gate genuinely held. But case `17` itself got WORSE, not better: count dropped from 8/8 (correct count, one localization ambiguity) to 6/8, and BOTH pad units the review notes specifically flagged as depending on "literal equipment leaders" (`CU-BO1` AND `CU-BO2`) disappeared from `matches` entirely — not just the one this Finding traced. The mechanism: `CU-BO1`'s and `CU-BO2`'s leader tags both got "transferred," exactly as designed, onto their nearest higher-scoring `hold: "density"` neighbor — but a transferred tag on an ineligible placement is STILL ineligible for promotion (Phase B's own gate, correctly, still holds), so the tag is effectively spent on a placement that can never count, while the ORIGINAL, previously-valid, previously-labeled match loses its label and — with nothing else to claim it — drops out of `matches` altogether. The reasoning error: "never let it independently win, only re-center an already-earned tag" sounds safe, but the SAME mechanism that re-centers a tag onto a better peak can just as easily re-center it onto a peak that will NEVER be promoted, destructively spending it. `samePhysicalR`'s bare `geometryScore` comparison has no way to know a target is a dead end before committing to it. Reverted cleanly (`git checkout --`, `git diff` confirmed clean); the real fix needs the merge to check that the canonical target it's transferring onto is not itself going to be discarded — a materially different, not-yet-designed condition, not a threshold tweak on this attempt.
  - **(B) Correct candidate scores just under the commit bar, cases `11`, `18` (and partially `05`).** `new-thermostat-vav-4`'s true reading sits at d=0.0px, score 0.771 (bar 0.92) — perfectly located but only 77% of the seed's linework matched. `conference-fcu4`'s true reading sits 11.3px away at 0.884 (88% matched). Neither is a suppression problem; the geometry genuinely doesn't reach the bar, most likely from real drafting variation (overlap, partial obscuring, or a minor as-built difference) the rigid/affine search doesn't compensate for.
  - **(C) A close, plausible candidate assigned to the wrong expected tag, case `23`.** `mh10b1-vav-8`'s nearest match is only 4.9px away (score 0.854, so already promoted via label corroboration) but the bipartite `assignInstances` gave it to a different expected instance, leaving this one's own slot empty. The nearest withheld row (448.8px away) is unrelated noise — the real fix candidate is the close match itself, mis-assigned.
  - **(D) A geometrically-plausible candidate correctly demoted by a conflicting drawn tag, case `01`.** `cd1-08`'s nearest withheld row (13.9px away, score 0.929 — clears the bar) is demoted because the drawing itself labels that spot "TG-1," outside the seed family — a correct demotion of what is very likely a different, real device that happens to look similar, not a bug. Whether `cd1-08`'s OWN real instance is findable at all elsewhere on the sheet is unresolved; the nearest match (39.7px, 0.824) is too far and too low-scoring to be confident either way.
  - **(E) No good nearby candidate at all, case `05`.** `d10-02`'s nearest match (32.2px, 0.715) and nearest withheld (168.8px, 0.914) are both too far from ground truth to plausibly be it — this looks like a genuine candidate-generation/recall gap rather than an assignment problem among things that were actually found.
  **No single mechanism proposed anywhere in this document (or its predecessor) touches more than one of these five patterns.** A "prefer the closer/higher-scoring candidate when suppression conflicts with the ground-truth-nearest reading" fix would only help (A); it would do nothing for (B) through (E), and — per this document's own repeated lesson (Phase C's `extra` consumers, Phase D's per-row filters) — implementing ONE of these without measuring its effect on the OTHER four risks exactly the kind of narrow, falsely-general fix this project has already been burned by twice tonight. Recorded as five separate, named, evidence-backed sub-problems for whoever scopes the next phase, rather than one more attempt at a single unifying "assignment" mechanism — each needs its own targeted investigation (and, for (E) specifically, likely its own real corpus example search before any fix is even designed) before any code changes.

- **2026-09-11 — Both specific causes named in the ORIGINAL `AFFINE_WIRE_DEFAULT` flip's revert (`1ed0656`, predecessor document) now appear closed — verified directly on the exact case that motivated the revert, not assumed from "the corpus number went up."** The revert named two causes for case `01-cherry-mh111-cd1` going from a correct 19/19 to a false 27: (1) `dropGlyphClusters` (defaulting on with affine at the time) stripping part of the seed's own real geometry and shifting its center onto a neighbor's tag, and (2) label-corroboration (`LABEL_CORROBORATION_SCORE_LOW`) promoting badly-distorted affine fits on text agreement alone, with no geometric sanity check. Checked both directly against case `01` under TODAY'S engine (this document's own Phases A–E step 1, `AFFINE_WIRE_DEFAULT` applied exactly as the corpus runner has all night): the count is now exactly correct (19 matches, matching ground truth precisely — not the false 27), zero degenerate-scale rows anywhere in either `matches` or `withheld` (cause 1's own engine bug — `fitAffine` never rejecting a rank-deficient result — is Phase A's own fix, `40ba758`), and of case `01`'s 377 withheld rows, 10 correctly carry `hold: "bounds"` and 36 correctly carry `hold: "density"` — Phase B's own `!row.hold` promotion gate (`2532b97`) means a bounds-failed or density-suspect row structurally CANNOT reach `reconcileSweepLabels`' promotion path regardless of tag agreement, closing cause 2 directly, not incidentally. Case `01` still fails — but on the SAME already-diagnosed `no one-to-one for cd1-08` assignment-ambiguity this document's own Phase B/D Findings already named, a completely different and much narrower failure mode than a 42%-inflated false count. **This does not mean the default flip is ready** — Phase F's own gate is 46/47 with two consecutive identical runs, and the corpus sits at 35/47 tonight, with 11 of the 12 remaining failures being the SAME assignment-ambiguity problem Phase D's Finding already recorded as unsolved by any mechanism this document has built. But it does mean the specific catastrophic regression that forced the LAST attempt's revert is not still lurking, unaddressed, waiting to resurface the moment the flip is re-attempted — it was fixed as a side effect of Phases A and B, well before tonight's session began, and this is the first time anyone checked. Recorded so Phase F's own eventual re-attempt starts from "the known catastrophic-regression risk is retired, the remaining gap is the known assignment-ambiguity problem" rather than re-deriving this from scratch or, worse, re-discovering the same case-01 regression as if it were new.
