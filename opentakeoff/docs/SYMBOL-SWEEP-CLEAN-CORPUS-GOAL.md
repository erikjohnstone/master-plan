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

### Phase F — runner diagnostics, two clean runs, then the default flip

1. `mcp/scripts/symbol-sweep-corpus.mjs` (~193): when `assignInstances`
   fails, also print, for the missing expected instance, the nearest
   `withheld` row (distance, score, `hold`, first 80 chars of `reason`) and
   the nearest match — "no one-to-one localization" hid that case 05's real
   instances were found at d = 0 for a whole day. Do this FIRST if it helps
   Phase B; it is diagnostics only.
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

Findings (a case that contradicts a rule above is recorded here, never fixed by bending the rule):

- **2026-09-11 — Phase A's own gate ("case 11's four scale 0×0 matches gone") was met exactly as written, but did NOT clear case 11's reported failure — a real, useful distinction the gate's wording glossed over.** §1 diagnosed case 11 as "four committed matches with `scale_x 0, scale_y 0, rms 0, score 1` carrying the tags `1-VAV-4/10/12/16` stolen from the real thermostats." Verified directly post-fix: those four rows are gone (0 remaining anywhere with `min(scale_x, scale_y) < 0.2`), and the corpus confirms it — case 11's `found` count is still 15/15 (unchanged), meaning four DIFFERENT candidates now fill the count, and the case still fails with the exact same error string (`no one-to-one localization for new-thermostat-vav-4`). This is consistent with, not contradicting, §2's own C1 diagnosis: the ENGINE bug (a degenerate fit scoring 1.0) is only half of C1 — the DESIGN gap (bounds-failed/held rows competing for drawn tags with no geometric gate, §2's part (b)) is the other half, and it is untouched by Phase A on purpose (that is exactly Phase B's job). Recorded so a future reader does not mistake "the named mechanism is gone" for "the case passes" — they are different claims, and this document's own §1 table conflated them for cases `01`, `11`, `17`, `18`, `23` by listing a single combined cause. `05` and `10` DID clear enough of their errors to shed two of three; the remaining `no one-to-one` on both is the same design-gap mechanism, now isolated as a single clean target for Phase B.
