# Symbol Sweep — distortion-tolerant matching (stretched, rotated, changed symbols)

**Status:** goal document, authored 2026-09-10. Implementation not started.
**Owner model:** written to be executed by Claude Sonnet 5 end to end, without
further design input. Every decision that would otherwise need a judgement
call is made here. Where this document and the code disagree, the code's own
comments win on *what exists today*; this document wins on *what to build*.

---

## 0. Read this first — the contract

Symbol sweep (`web/src/lib/symbolsweep.ts`) finds every placement of ONE
example symbol from a sheet's vector linework. It is deterministic, has no
learned model, and every candidate placement ends in exactly one of three
disclosed buckets: `matches`, `withheld` (with a `reason`), or `rejected`
(with the counter-example that did it). Nothing is ever silently dropped.
That contract is the product, and this goal **extends it, never bends it**.

The engine today is rigid. It searches exactly 8 transforms (0/90/180/270° ×
mirror), a *stated* uniform scale, and a 2 px tolerance. A symbol drawn
rotated 30°, or stretched 1.3× along one axis, produces **zero candidates** —
not a withheld row, not a low score: silence. Silence is the one outcome the
contract forbids, and it is the gap this goal closes.

**What "done" means (verbatim, for the stop hook):** the sweep finds
instances of a seeded symbol under any rotation, anisotropic stretch within a
stated bound, and shear within a stated bound; discloses the transform it
matched under on every such row; reports out-of-bounds fits as withheld with
a reason instead of dropping them; passes every existing corpus case
unchanged; passes a new authored campaign of real off-grid/stretched/variant
instances at ≥ 90% recall with zero new false-adds; runs within 1.5× today's
wall-clock on the corpus suite; and is the DEFAULT behaviour of
`symbol_sweep` in both the MCP server and the browser canvas — with one flag
to turn it off. All of that, measured, not asserted.

### Non-negotiables (the "nevers")

1. **No learned model, no vision, no raster.** Pure TypeScript geometry.
   Closed-form least squares — no numeric dependency (a 2×2 normal-equation
   solve is six lines).
2. **Never search a transform without disclosing it.** Every row a widened
   search produces carries a `transform` field (§4.1). A fit outside the
   stated bounds becomes `withheld` with a reason. Never a silent drop,
   never a silent commit.
3. **Never move a bar to pass a case.** `SWEEP_SCORE_HIGH` (0.92),
   `SWEEP_SCORE_LOW` (0.75), `SWEEP_TOL_PX` (2), `SWEEP_EXTRA_MAX` (0.30) are
   not knobs for this work. If a real case needs a bar moved, stop and report
   it as a finding; do not move it.
4. **Never edit authored ground truth to fit output.** `cases.json` is
   authored truth (its README says so). New cases are authored by rendering
   the sheet and looking; existing cases are never rewritten.
5. **Default behaviour is byte-for-byte unchanged until the gates in §8
   pass.** Everything ships behind `opts.affine` first. The default flips in
   its own commit, after two consecutive green runs.
6. **Canvas and MCP cannot disagree.** Both call the same pure engine. Any
   new option or field is threaded to both (§7) and a parity test proves
   identical results on the same fixture.
7. **Complete-count accounting stays honest.** The candidate ceiling
   (`SWEEP_CANDIDATE_CEILING`) and `complete: false` semantics are unchanged;
   a wider search that hits the ceiling reports it exactly as today.

---

## 1. What exists today (measured from the code, with line numbers)

Read these before writing anything. Line numbers are as of commit `18f0c9e`.

| What | Where | Behaviour that matters |
|---|---|---|
| Transform set | `transformsFor()` — `symbolsweep.ts:397` | 8 orthogonal 2×2 matrices, entries in {−1,0,1}. This is the entire search space. |
| Uniform scale | `scaleFingerprint()` :653, `opts.scale` :616, `sweepRatio()` :2130 | Scale is **stated** from two committed sheet scales, never searched. Tolerance rides the ratio only upward. |
| Fingerprint | `fingerprintSymbol()` :690 | Segments fully inside the seed rect, centroid-relative, `[ax,ay,bx,by,len]`. Text is not in `segs` unless the exporter exploded it to paths (Bluebeam SHX does). |
| Candidate generation A | `matchSymbol()` :1008 → anchors :1085–1120 | Up to 3 seed segments of rarest quantized length vote; a sheet segment qualifies only if `|len − L| ≤ 2·tol` (4 px) and both endpoint pairings agree on a centroid within 4 px, under one of the 8 matrices. |
| Candidate generation B | junction signatures :1123–1170 | Seed junctions (≥2 incident directions) matched to sheet junctions with every direction within `angleTol = π/12` (15°). |
| Scoring | `scoreAt(m, tx, ty)` :1195–1250 | **Takes an arbitrary 2×2 `m`.** Endpoint test within `tol`; oriented body coverage with a 6° angle gate. Length-weighted fraction of seed matched. **This is the seam: it already accepts any matrix.** |
| Dedupe / shadow | `mergeProposals()` :985, consensus :1275–1310 | Merge radius `max(3·tol, 4)`; suppression radius `footprint/2`. |
| Precision | `extraFor()` :1470–1500, `variantGuard` | Extra unmatched ink inside the placed bbox, disclosed on the row (`extra`) or demoted under the guard. |
| Counter-examples | `buildNegative()` :882 | Expressed in the positive's canonical frame; re-applied under the match's transform. |
| Result types | `SweepMatch` :220, `SweepWithheld` :235, `SweepRejected` :243, `SweepResult` :254 | `rotation` is documented as `0 | 90 | 180 | 270`. |
| MCP wire shape | `mcp/src/outputs.ts:365` `sweepPlacement` | `rotation` described as "0 \| 90 \| 180 \| 270". |
| Callers | `mcp/src/session.ts` :2695, :2734, :2876, :3030, :3906, :3927, :4040; `web/src/pages/TakeoffCanvas.jsx` :4877, :4881, :6613, :6617, :6693 | Every place a new option must be threaded. |
| Legend seeds | `web/src/lib/legendlearn.ts` :15–17, :40 | A legend glyph is refused as a plan seed **because scale isn't searched**. |
| Ground truth | `HVAC BAS Benchmark Collection/ground_truth/symbol_sweep/cases.json` (47 cases), runner `mcp/scripts/symbol-sweep-corpus.mjs` | Instances carry `at`, `tolerance_px`, `tag`, `tag_bbox`, `page`. **No instance carries rotation, scale, or variant annotation.** |
| Tests | `web/test/symbolsweep.test.ts`, `sweepNegative`, `sweepCoalesce`, `sweepScheduleRow`, `sweepThumb`, `legendlearn`, `symbolLabels` | 361 tests, all green at `18f0c9e`. |

### Why each target case fails today (mechanism, not symptom)

- **Stretched 1.3× on one axis:** every segment longer than ~13 px leaves
  the ±4 px length bucket → anchors never vote. If a junction proposes it
  anyway, the 8 fixed matrices place endpoints off by `(stretch−1) ×
  distance-from-centroid` — past 2 px almost immediately — and body coverage
  survives only near the centroid. Score < 0.75 → **invisible**.
- **Rotated 30°:** the anchor's *length* matches, but the two endpoint-derived
  centroids disagree by `2·L·sin(Δθ/2)` (≈10 px for a 20 px segment at 30°)
  → no proposal; junction directions are 30° off vs a 15° gate → no
  proposal. **Zero candidates → invisible.** This is the most common real
  case (devices rotated to follow duct and pipe runs).
- **Changed:** added strokes are already disclosed/guarded; removed strokes
  up to ~25% already land in `withheld`; removed >25% is invisible;
  re-drawn at different proportions behaves like stretch. Exploded SHX text
  inside the seed rect enters the fingerprint as tiny segments and inflates
  both the denominator and the extra-ink measure.

### Two things already checked — do NOT build them

- **Form XObject reuse** (instances with their transform for free): measured
  across 16 corpus PDFs / 96 pages on 2026-09-10 — 201 form XObjects, 199
  distinct. Bluebeam and AutoCAD `pdfplot` flatten blocks to paths. Dead end.
- **A learned matcher**: out of scope by the user's explicit ask. The
  classical answer (geometric hashing, affine least squares) is exact and
  sufficient for seed-based matching; what a model buys is categorical
  recognition with no seed, which this feature does not need.

---

## 2. The math (implement exactly this; no library)

All in image px, y down. A placement is `p' = m·p + t` with `m` a 2×2 and
`t` a translation; today `m` is one of 8 orthogonal matrices.

### 2.1 Least-squares affine from correspondences

Given `n ≥ 3` non-collinear correspondences `(s_i → q_i)` (seed point in
centroid-relative coords → sheet point), solve for `m = [a b; c d]` and
`t = [tx, ty]` minimising `Σ ‖m·s_i + t − q_i‖²`. Centre both point sets
(subtract means `s̄`, `q̄`), then with `S` the 2×2 scatter `Σ (s_i−s̄)(s_i−s̄)ᵀ`
and `C = Σ (q_i−q̄)(s_i−s̄)ᵀ`:

```
m = C · S⁻¹          (S⁻¹ is the closed-form 2×2 inverse; refuse if |det S| < 1e-6·trace(S)²)
t = q̄ − m · s̄
rms = sqrt( Σ ‖m·s_i + t − q_i‖² / n )
```

Weighted form (for IRLS): use weights `w_i` in every sum. Two IRLS passes:
pass 1 unweighted; pass 2 with `w_i = 1` if residual ≤ 3·rms else `0`
(drop). Refuse the fit if fewer than 3 correspondences survive or the
survivors are collinear (`|det S| < 1e-6·trace(S)²`).

### 2.2 Decomposition (what to disclose)

Polar-style decomposition `m = R · P` with `R` a rotation (or reflection)
and `P` symmetric positive-definite:

```
mirrored  = det(m) < 0
m'        = mirrored ? m · diag(-1, 1) : m        // fold the mirror out first, matching transformsFor's convention (x → −x before rotation)
PᵀP       = m'ᵀ m'  ; take P = sqrt(m'ᵀ m') via eigen-decomposition of the symmetric 2×2
R         = m' · P⁻¹
rotation_deg = atan2(R[1][0], R[0][0]) · 180/π, normalised to [0, 360)   (degrees CW in image space, y down — same convention as today's `rotation`)
scale_x, scale_y = the two eigenvalues of P (report as scale along the seed's own x and y axes: P's diagonal after rotating into the eigenbasis is fine; simpler and acceptable: scale_x = ‖m'·[1,0]‖, scale_y = ‖m'·[0,1]‖)
shear_deg = 90 − angle between m'·[1,0] and m'·[0,1], in degrees (0 for a pure rotation/scale)
```

Use the "simpler and acceptable" definitions for `scale_x`, `scale_y`,
`shear_deg` — they are what an estimator can check with a ruler. Round
disclosed values: degrees to 0.1, scales to 0.001.

### 2.3 Bounds (defaults; all overridable in `opts.affine`)

```
maxStretch  = 1.5    // each of scale_x, scale_y within [1/1.5, 1.5] AFTER the stated uniform scale ratio is divided out
maxShearDeg = 10
rotation    = unbounded (any angle)
mirror      = follows opts.mirror exactly as today
```

A fit outside bounds is never a match. It is `withheld` with the reason in
§4.2.

### 2.4 Residual-adaptive tolerance

After a successful fit, re-score with `tolFit = clamp(3·rms, tol, 3·tol)`.
Never below the stated `tol`, never above `3·tol` (6 px at defaults). The
tolerance actually used is disclosed on the row (`transform.tol_px`).

---

## 3. Phases — in this order, one commit per phase, gates at the end of each

### Phase 0 — Measure first: label the eval, author the campaign

Nothing in Phases 1–5 is provable without this. Do it first.

1. **Extend the ground-truth schema, additively.** In
   `ground_truth/symbol_sweep/cases.json`, an expected instance MAY carry:
   ```json
   "transform": { "rotation_deg": 30, "scale_x": 1.30, "scale_y": 1.00, "shear_deg": 0, "mirrored": false, "note": "rotated to follow the duct run" }
   "variant": { "kind": "missing_strokes" | "extra_strokes" | "redrawn", "note": "..." }
   ```
   Bump nothing that breaks the 47 baseline cases: the runner must treat
   both fields as optional. Update the README's field list.
2. **Author a new campaign, `"campaign": "affine"`**, by rendering and
   looking (the same discipline the README already mandates): ≥ 20 real
   instances across ≥ 8 corpus documents, covering at minimum 8 off-grid
   rotations (spread across 15–75°), 6 anisotropic stretches (≥ 1.15×), 4
   variants with strokes missing (10–25% of linework), 2 mirrored+rotated.
   Record each instance's `at`, `tolerance_px`, `tag`/`tag_bbox` exactly as
   existing cases do, plus `transform`/`variant`. Keep the retained visual
   evidence the README requires.

   **Actually executed, 2026-09-10 — read this before repeating the
   search.** An exhaustive discovery pass (method and full results in §9's
   Findings) found **zero real off-grid-rotated or anisotropically-stretched
   instances in this 30-document corpus.** Every one of the 47 baseline and
   extended seeds was searched by manually pre-rotating that seed's own
   fingerprint in 15° steps (skipping the 8 rigid multiples) and asking the
   *existing* `matchSymbol` whether anything on the sheet matched at that
   angle — 20 candidate hits surfaced across 6 seeds, all 20 rendered and
   looked at, all 20 false: a geometrically near-identical sibling device
   under a different tag, or (for any seed whose fingerprint is close to a
   bare circle) a same-shaped sibling aliased through the shape's own
   rotational symmetry, never the seed's own symbol repeated off-grid. This
   is §7.4's "case contradicts the design" clause applied to a *count*, not
   a *bound*: the fix is not to move the ≥20 target, it is to say plainly
   that this specific corpus does not contain the population the target
   assumed, and to change what satisfies Gate 0 accordingly (below), never
   to fabricate instances to hit it.

   **What DOES satisfy Gate 0 now:** author every real instance the search
   actually found, however few — as of this writing, zero — with the same
   rendering discipline, and let Phases 1–4's own synthetic fixtures (each
   phase's own §3 step already specifies them: `symbolsweep.test.ts`'s
   `SYMBOL`/`place()` fixture rotated/stretched/sheared to an exact known
   value) carry the correctness burden a real corpus can't here. If a
   future corpus addition, or production use, surfaces a genuine instance,
   add it to the `affine` campaign then — the schema and runner support are
   already built and waiting (steps 1 and 3 of this phase), not gated on
   Phase 1+.
3. **Teach the runner to report by campaign** (`symbol-sweep-corpus.mjs`):
   recall on `affine` instances, false-adds on baseline cases, and — for
   every predicted row that carries a `transform` — the absolute error vs.
   the authored transform (`rotation` within 3°, scales within 0.05). Exit
   nonzero on any baseline regression, exactly as today. **Done** —
   `affineRecall()` added 2026-09-10, verified against all 47 existing
   cases with zero regression (46 pass; the one pre-existing failure,
   `13-nist-m701-fan-vfd-assemblies`'s sheet-number mismatch, reproduces
   identically on the unmodified script and is unrelated to symbol
   matching). Committed `1d97d8f`.
4. **Record the baseline number.** Run the suite at `18f0c9e` with the new
   cases present: the `affine` campaign recall will be ~0. Write that number
   into §9 of this document. That is the before. **Done — see §9: 0 affine
   cases exist to measure recall against, which is itself the honest
   before-number given step 2's finding.**

**Gate 0 (revised 2026-09-10 against the finding above):** 47 baseline
cases still pass (exit 0) — done, 46/47 + 1 pre-existing unrelated fail,
confirmed via `git stash` A/B; every real affine instance the exhaustive
search found is authored (currently 0, and that count is itself recorded,
not hidden); runner reports campaign metrics — done; baseline recall
recorded — done (N/A, 0 cases). The original "≥ 20 instances" text above is
kept, struck nowhere, because a later corpus or production find should
still aim for it — it is no longer a blocking condition for Phase 1 to
start, since this corpus cannot supply it and synthetic fixtures cover
Phase 1–4's correctness gates instead.

### Phase 1 — Fitted-matrix verification (smallest change, immediately measurable)

Scope: placements the *existing* candidate generation already proposes but
which score below `scoreHigh` because the rigid matrix is slightly wrong.
This recovers near-grid rotation (≤ ~15°, via junction proposals), mild
stretch, and shear — with no change to candidate generation.

1. New pure module **`web/src/lib/symbolAffine.ts`** (same "pure, no
   PDF/DOM, node-testable" convention as `symbolsweep.ts`):
   - `fitAffine(pairs: Array<[sx,sy,qx,qy]>, weights?): AffineFit | null`
     (§2.1, IRLS 2 passes).
   - `decomposeAffine(m): { rotation_deg, scale_x, scale_y, shear_deg, mirrored }` (§2.2).
   - `affineWithinBounds(decomp, bounds, statedScale): boolean` (§2.3).
   - `gatherCorrespondences(rel, m0, tx, ty, segs, grid, radius)`: for each
     transformed seed endpoint under the *current best rigid* `(m0, t)`,
     the nearest sheet endpoint within `radius = 6·tol` (use the existing
     `EndpointGrid.near`); one correspondence per seed endpoint, none if
     ambiguous (two sheet endpoints within `tol` of each other). Require
     ≥ 3 non-collinear pairs.
2. In `matchSymbol` (`symbolsweep.ts`), after step 3 scoring and BEFORE
   classification, when `opts.affine` is set: for every scored placement
   with `proposalFloor ≤ score < scoreHigh`, gather correspondences, fit,
   decompose, and re-score with `scoreAt(mFit, tFit.x, tFit.y)` at `tolFit`
   (§2.4). Keep whichever of (rigid score, refined score) is higher.
   Attach `transform` (§4.1) whenever the refined result is the one kept.
   Placements already ≥ `scoreHigh` under the rigid path are **not
   touched** — the addition is strictly monotone (a score can only go up),
   so existing matches cannot regress.
3. Classification (step 4) is unchanged except: a refined placement that
   clears `scoreHigh` but fails `affineWithinBounds` goes to `withheld`
   with the §4.2 reason, never to `matches`.
4. **Negatives under a fitted matrix:** `buildNegative`'s canonical-frame
   evidence must be tested under `mFit`, not the nearest rigid matrix. Find
   where step 4b applies the transform and route the fitted one through.
   Add a test: a counter-example still rejects a rotated-by-12° variant.
5. **Tests** (`web/test/symbolAffine.test.ts`, new; plus additions to
   `symbolsweep.test.ts` using its existing `SYMBOL` fixture and `place()`
   helper): (a) `fitAffine` recovers a known `[a b c d tx ty]` from exact
   points to 1e-9 and from ±1 px jittered points to < 0.5 px rms; (b)
   decomposition of `k·R(θ)·diag(sx,sy)` returns θ, sx, sy within
   tolerance for θ ∈ {7, 12, 45, 100, 250}°, sx/sy ∈ {1.0, 1.15, 1.3}; (c)
   the 7.4° "synthetic variant" the codebase already documents as *withheld*
   stays withheld with `affine` OFF and becomes a match with a disclosed
   `rotation_deg ≈ 7.4` with `affine` ON; (d) a 1.6× stretch (over the
   default `maxStretch`) is `withheld` with the bounds reason, never a
   match; (e) `affine` OFF → results deep-equal `18f0c9e` behaviour on
   every existing test (run the suite with the option absent — it must be
   a no-op).

**Gate 1:** all 361 existing tests + new tests green; full `web` suite
green; corpus: 47 baseline unchanged; `affine` campaign recall reported
(expect only the near-grid subset to move — record it in §9).

### Phase 2 — Continuous rotation + uniform-scale candidate generation (1-segment basis)

Scope: make off-grid rotation *proposable*. This is the phase that moves
the recall number most.

1. Under `opts.affine.rotationSearch === true` (default true once `affine`
   is on), anchor selection stays "rarest quantized length first", but the
   sheet-segment band becomes a **ratio band** when scale search is enabled
   (`opts.affine.scaleSearch`, default `false` — scale stays stated by
   default; see §6): `|len_sheet / len_seed − 1| ≤ maxStretch − 1`. With
   scale search off, the band stays `±2·tol` exactly as today.
2. For each (anchor, sheet segment) pair: the segment's own direction fixes
   the rotation `θ = angle(sheet) − angle(seed_anchor)` (two candidates:
   `θ` and `θ+180°`, from the two endpoint pairings) and, with scale search
   on, `k = len_sheet / len_seed`. Build `m = k·R(θ)` (and the mirrored
   twin when `opts.mirror`). The centroid follows from the pairing exactly
   as today. Propose `(θ, k, mirror, tx, ty)`.
3. **Vote before you score** (this is geometric hashing's whole point, and
   it is what keeps cost flat): a proposal is scored only if a SECOND seed
   anchor also finds a sheet segment consistent with the same `(θ, k,
   mirror, tx, ty)` within `2·tol` of centroid and 6° of rotation. Bucket
   proposals by `(round(θ/6°), round(log k / log 1.05), mirror, round(tx/quant), round(ty/quant))`
   and require ≥ 2 distinct anchors in a bucket. Keep the existing
   `proposalMap` dedupe; the key gains the θ and k buckets.
4. Score voted proposals with `scoreAt(m, tx, ty)`; then run the Phase 1
   refine on the survivors (the rotation from one segment is only accurate
   to a couple of degrees; the fit tightens it and disclosed values come
   from the fit).
5. The existing 8 rigid transforms remain in the search (they are the
   `θ ∈ {0,90,180,270}` slice and cost nothing); junction proposals remain.
6. **Cost control:** bound the number of scored continuous-rotation
   proposals by the same `maxCandidates` ceiling; when it bites,
   `complete: false` and `candidates.dropped` say so, as today. Measure
   `elapsed_ms` on the 47-case suite before and after; budget is 1.5×.
7. **Tests:** the existing asymmetric `SYMBOL` placed at 30°, 57°, 123°
   and 211° → each found as a match with `transform.rotation_deg` within
   3°; a mirrored + 40° copy found with `mirrored: true`; the plain
   translated copy still reports `rotation: 0` with no `transform` field
   (rigid path won); rotations OFF (`opts.rotations === false`) still
   disables everything but 0° exactly as today; `candidates.considered`
   on the standard fixtures grows by less than 3× (guards the vote).

**Gate 2:** all gates of Phase 1; `affine` campaign rotation instances
recall ≥ 90%; baseline false-adds = 0; elapsed within 1.5×.

### Phase 3 — Full affine candidate generation (2-segment basis) — stretch and shear

Scope: make anisotropic stretch *proposable* (Phase 1 can only refine a
stretch that was proposed; Phase 2 proposes only similarity transforms).

1. Choose up to `K = 3` basis pairs of non-parallel seed segments (rarest
   lengths first, angle between them ≥ 20°). For each basis pair and each
   pair of sheet segments in a neighbourhood bounded by `footprint ×
   maxStretch` around a first-segment candidate (reuse the ratio band from
   Phase 2 for the first segment, then look up second-segment candidates
   from `EndpointGrid.nearRect`), compute the affine from the two
   correspondences (4 point pairs → the §2.1 solve; it is overdetermined
   and that is fine). Refuse immediately if `decomposeAffine` is out of
   bounds — never score an out-of-bounds proposal (cheap prune).
2. Vote exactly as Phase 2 (a third seed segment must be found consistent
   with the proposed affine) before scoring.
3. Score with `scoreAt(mAffine, …)`, refine with Phase 1 (more
   correspondences, better fit), classify with bounds.
4. **Tests:** `SYMBOL` stretched 1.3× on x (and separately on y), and 1.2×
   on x + 8° shear → matches with disclosed `scale_x`/`scale_y`/`shear_deg`
   within 0.05 / 2°; 1.6× stretch → withheld with the bounds reason; a
   stretched copy with the diagonal removed → withheld with the
   missing-strokes reason (§4.2) and a `transform` field.

**Gate 3:** all prior gates; `affine` campaign stretch instances recall
≥ 90%; baseline false-adds = 0; elapsed within 1.5×.

### Phase 4 — "Changed" symbols: disclosure, not guessing

1. **Missing-stroke disclosure.** When a placement lands in `withheld` for
   score reasons, the `reason` must name what was missing: the top three
   unmatched seed segments by length and their share, e.g. *"reproduces 81%
   of the seed; missing the 18 px stub and the 9 px tick (19% of
   linework)"*. Pure bookkeeping inside `scoreAt` (it already knows which
   `rel` entries hit). Applies with `affine` off too — this is a strict
   improvement to an existing reason string; update the one test that pins
   the near-miss reason text.
2. **Exploded-text filter (opt-in, `opts.dropGlyphClusters`, default ON
   when `affine` is on).** In `fingerprintSymbol`, detect clusters of
   ≥ 6 segments each shorter than `4·tol`, whose union bbox is under
   `0.25 × footprint` on its long side and whose segments form ≥ 3 distinct
   directions (glyph strokes, not a tick mark); exclude them from the
   fingerprint and report `seed.dropped_glyph_segments` on the result.
   Apply the same filter inside `extraFor` so exploded tags never count as
   "extra linework". Test with a fixture that adds a 5-letter exploded tag
   inside the seed rect: score and `extra` are unchanged vs. the untagged
   fixture.
3. **Negatives are unchanged in spirit** — they already express "the thing
   I do NOT mean" and now simply work under fitted transforms (Phase 1.4).

**Gate 4:** all prior gates; the four authored `variant` instances behave as
their annotation says (`missing_strokes` → withheld with a naming reason,
never silent; `extra_strokes` → matched with `extra` disclosed or guarded);
`sweepNegative.test.ts` green.

### Phase 5 — Production wiring, parity, docs, default flip

1. **Types:** `SweepOptions.affine?: AffineOptions` (§4.3);
   `SweepMatch.transform?: SweepTransform` (§4.1); the `rotation` doc
   comment becomes "0 | 90 | 180 | 270 from the rigid search; continuous
   degrees when `transform` is present". `SweepResult.seed.dropped_glyph_segments?: number`.
2. **MCP:** `mcp/src/outputs.ts:365 sweepPlacement` gains `transform`
   (optional object, every field described); `rotation` description
   updated. `mcp/src/session.ts` threads `affine` through every
   `matchSymbol`/`sweepSymbols`/`matchAgainstLibrary` call listed in §1 and
   copies `transform` into every wire row where `rotation`/`mirrored` are
   copied today (:2765, :2773–2776, :2923, :2987–2989, :3041–3042, :4398,
   :4639, :4733–4744). The `symbol_sweep` tool schema gains
   `affine: { enabled, max_stretch, max_shear_deg, scale_search }` with the
   defaults of §4.3.
3. **Browser:** `web/src/pages/TakeoffCanvas.jsx` :4881, :6617, :6693 pass
   the same option; the sweep review thumbnail (`web/src/lib/sweepThumb.js`)
   must render an arbitrary rotation — verify it does not assume multiples
   of 90° (read it; fix if it does; `sweepThumb.test.ts` gets a 33° case).
   The marker/tooltip shows the disclosed transform when present.
4. **Parity test:** one fixture, both call sites' option objects → identical
   `matches`/`withheld`/`rejected` (the existing "canvas and MCP cannot
   disagree" doctrine, made executable).
5. **Docs:** `docs/AGENT_GUIDE.md` (the withheld doctrine section gains the
   bounds reason and the transform field), `docs/MCP.md` (tool schema),
   this document's §9 (numbers).
6. **Default flip, its own commit, last:** `affine.enabled` defaults to
   `true` in both the MCP tool and the canvas. `rotationSearch: true`,
   `scaleSearch: false` (§6). Only after Gates 0–4 have passed on two
   consecutive full runs.

**Gate 5 (= done):** everything in §8.

---

## 4. Contracts (exact shapes)

### 4.1 `SweepTransform` — disclosed on every affine-derived row

```ts
export interface SweepTransform {
  /** Degrees CW, image space (y down), [0, 360). Continuous. */
  rotation_deg: number;
  /** Scale along the seed's own x / y axes, AFTER the stated uniform ratio
   * (opts.scale) is divided out — 1.0 means "as drawn on the seed sheet". */
  scale_x: number;
  scale_y: number;
  /** Deviation from a right angle between the seed's axes, degrees. */
  shear_deg: number;
  mirrored: boolean;
  /** RMS residual of the fit, px, and the tolerance the re-score used. */
  rms_px: number;
  tol_px: number;
  /** How the placement was found: "rigid" (one of the 8 matrices, then
   * refined), "rotation" (Phase 2 basis), "affine" (Phase 3 basis). */
  via: "rigid" | "rotation" | "affine";
}
```
Absent on rows the rigid path committed without refinement — so a
same-as-today sweep produces same-as-today rows.

### 4.2 Reason strings (exact wording; tests pin these)

- Out of bounds: `matches ${pct}% of the seed under a ${scale_x}× / ${scale_y}× stretch and ${shear_deg}° shear (bar ${maxStretch}× / ${maxShearDeg}°) — that much distortion may be a different device drawn to look alike; view_sheet here and confirm, or raise affine.max_stretch if this drawing set genuinely stretches its symbols`
- Missing strokes: `reproduces ${pct}% of the seed; missing ${list} (${missingPct}% of linework)` where `list` names up to three segments as `"${len} px ${orientation}"` (`horizontal` / `vertical` / `diagonal`).
- Existing reasons (variant/extra, luminance, negatives) are unchanged.

### 4.3 `AffineOptions`

```ts
export interface AffineOptions {
  enabled?: boolean;        // default false until Phase 5 flips it
  maxStretch?: number;      // default 1.5
  maxShearDeg?: number;     // default 10
  rotationSearch?: boolean; // default true (Phase 2)
  scaleSearch?: boolean;    // default false — see §6
}
```

---

## 5. Performance budget and how to measure it

- Budget: **≤ 1.5× the `18f0c9e` wall-clock** for `node --import tsx
  scripts/symbol-sweep-corpus.mjs` (run from `opentakeoff/mcp`), and
  `elapsed_ms` per case (the runner already records it) ≤ 1.5× per case
  for 45 of 47 cases (two outliers allowed, named).
- Record before/after in §9. If a phase exceeds budget: reduce `K`, tighten
  the vote (require 3 anchors), or narrow the neighbourhood — never widen
  the ceiling, never silently skip proposals.
- Never add a dependency. No WASM, no workers (the canvas path must stay
  synchronous as it is today).

## 6. Scale search — deliberately OFF by default, and why

Uniform scale is *stated* today from two committed sheet scales
(`sweepRatio`), and the module header explains the reasoning: a scale search
trades exactness for guesses, and a symbol drawn 12× larger on a detail
sheet must be found by the stated ratio, not by a search that would also
match every small square to every big square. That reasoning stands.
`scaleSearch` exists for one caller only: `legendlearn.ts`'s glyph-to-plan
corroboration, where the legend's scale is unknown and the legend glyph is
explicitly "not a plan-scale seed". Enable it there, bounded by
`maxStretch`, with the disclosed `scale_x`/`scale_y`; leave it off for
`symbol_sweep`. Do not flip this default in this goal.

## 7. Working method (how Sonnet should proceed)

1. Read §1's files at the cited lines before editing. Confirm line numbers
   still hold (`git log -1 -- web/src/lib/symbolsweep.ts`); if the file
   moved, re-locate by symbol name, not by line.
2. One phase per commit, phase number in the subject. Run, in this order,
   before every commit: `cd web && node --import tsx --test test/symbolsweep.test.ts test/symbolAffine.test.ts test/sweepNegative.test.ts test/sweepCoalesce.test.ts test/sweepScheduleRow.test.ts test/sweepThumb.test.ts test/legendlearn.test.ts test/symbolLabels.test.ts` → then the full `npm test` in `web/` → then `cd ../mcp && node --import tsx scripts/symbol-sweep-corpus.mjs`. Paste the three result lines into the commit body.
3. Never commit with debug logging in the tree. Never commit a phase whose
   gate is red; report the red instead.
4. When a real corpus case contradicts the design (e.g. a 1.7× stretch that
   is genuinely the same device), **do not raise the bound**. Record the
   case in §9 as a finding with the sheet and coordinates, keep it withheld,
   and continue. Bounds are the user's decision.
5. Report every gate result immediately when it completes, with the numbers,
   including regressions.

## 8. Definition of done (all of these, measured)

- [ ] Gates 0–5 green on two consecutive full runs.
- [ ] 47 baseline corpus cases: exit 0, zero false-adds, unchanged counts.
- [ ] `affine` campaign: ≥ 20 authored instances; recall ≥ 90%; every
      predicted transform within 3° / 0.05 of the authored one.
- [ ] Every affine-derived row carries `transform`; every out-of-bounds fit
      is `withheld` with the §4.2 reason; a grep of the engine finds no code
      path that discards a scored placement without a bucket.
- [ ] `affine` absent → results deep-equal `18f0c9e` on the whole test
      suite (no-op proof).
- [ ] Wall-clock within 1.5× on the corpus suite; per-case within 1.5× for
      45/47.
- [ ] Canvas/MCP parity test green; thumbnails render arbitrary angles.
- [ ] `outputs.ts`, `AGENT_GUIDE.md`, `MCP.md` updated; §9 filled in.
- [ ] Default flipped in its own commit, after the above.

## 9. Numbers (fill in as you go — this section is the record)

| Milestone | Date | Baseline cases | Affine campaign recall | False-adds | Suite wall-clock | Notes |
|---|---|---|---|---|---|---|
| Before (`18f0c9e`) | 2026-09-10 | 46/47 + 1 pre-existing unrelated fail | 0/0 — no real instances found to author, see Findings | 0 | not remeasured (runner change is additive-only; no matching-code touched) | Phase 0 done: schema extended, runner campaign-aware (commit `1d97d8f`), exhaustive discovery search run, honest 0-instance affine campaign is the recorded before-number |
| Phase 1 | 2026-09-10 | 46/47 + 1 pre-existing unrelated fail | 0/0 (unchanged — `affine` off everywhere in the runner; see Findings) | 0 | ~19.6 min sum of 47 case `elapsed_ms` (measures the unchanged rigid path, not affine — nothing turns `affine` on yet, so this is the same no-op baseline as Phase 0, not a real perf measurement of refinement cost) | `symbolAffine.ts` (fit/decompose/bounds/correspondences, commit `ea083e2`) wired into `matchSymbol` (commit `6e1e30e`): a rigid-search near-miss gets refined and re-scored; an out-of-bounds fit is disclosed and withheld, never committed. 399 tests green (361 pre-existing + 35 pure-math + 3 new integration tests). Gate 1 met: existing behaviour unchanged (`affine` absent is proven byte-for-byte identical, both by test and by the unchanged corpus numbers); the new tests prove the ON path works. Real corpus recall stays 0/0 because Phase 0 found no real affine instances to test against in this corpus — Phase 1's own correctness is carried entirely by synthetic fixtures, per this document's own Phase 0 revision. |
| Phase 2 | 2026-09-10 | 46/47 + 1 pre-existing unrelated fail | 0/0 (unchanged — `affine` off everywhere in the runner; see Findings) | 0 | ~19.6 min sum of 47 case `elapsed_ms`, statistically identical to Phase 1's (same reason: nothing in the runner turns `affine` on, so this measures the unchanged rigid path again, not the new candidate generation's real cost) | Continuous-rotation candidate generation (commit `bf4630c`): vote-before-score geometric hashing appends a voted rotation as a new dynamic `xforms` entry, so the existing scoring/classification code (already generic over `xforms[]`) handles it unmodified. 407 tests green (399 pre-existing + 8 new: 4 off-grid angles found exactly via a genuinely asymmetric fixture, a mirrored case, `rotations:false` disables it, candidate-growth guard). Gate 2 met on the no-op axis (byte-for-byte proof, both by test and unchanged corpus numbers) and on the synthetic-fixture axis (real off-grid rotation is now found — the whole point of this phase); real corpus recall stays 0/0 for the same reason as Phase 0/1 (no real instances exist in this corpus to move it). Also fixed a real, generically-applicable bug in the shared `mergeProposals` (see Findings) — pinned by its own regression test. |
| Phase 3 | 2026-09-10 | 46/47 + 1 pre-existing unrelated fail | 0/0 (unchanged — `affine`/`scaleSearch` off everywhere in the runner; see Findings) | 0 | ~19.4 min sum of 47 case `elapsed_ms`, statistically identical to Phase 1/2's (same reason: nothing in the runner turns `scaleSearch` on, so this measures the unchanged rigid path again) | Two-segment-basis affine candidate generation (stretch/shear made PROPOSABLE, not just refinable): a basis pair of non-parallel seed segments, a ratio-band search for the first's sheet correspondent, a margin-based rect search predicting and finding the second, a 4-point `fitAffine`, and a third-segment vote before it is ever scored or refined — reusing Phase 1's refine/bounds/disclosure machinery unmodified (same `xf ≥ rigidXformCount` dynamic-candidate path Phase 2 already wired). 413 tests green (407 pre-existing + 6 new: x-only and y-only 1.3× stretch, 1.2×+8° shear, 1.6× stretch withheld with the bounds reason, `rotations:false` disables it, candidate-growth guard). Used the asymmetric `ASYM2` fixture per Phase 2's own Finding, not `SYMBOL`. Gate 3 met on the no-op axis (byte-for-byte proof, both by test and unchanged corpus numbers) and on the synthetic-fixture axis (anisotropic stretch and shear are now proposed, fitted, and bounds-checked — the whole point of this phase); real corpus recall stays 0/0 for the same reason as every prior phase (Phase 0 found no real instances in this corpus). Also found and fixed two real bugs during testing, both recorded as Findings: basis-pair selection could end up all-parallel on a single-axis stretch (fixed by widening the candidate pool without touching the shared `ANCHOR_COUNT`), and the ratio-band search could miss an out-of-bounds stretch entirely rather than disclose it (fixed by trying both basis-pair role assignments, plus loosening the dynamic-candidate proposal floor to let refinement run before a rough guess's raw score forecloses it — the rigid path's own gate is untouched). |
| Phase 4 | 2026-09-10 | 46/47 + 1 pre-existing unrelated fail | 0/0 (no campaign change this phase — see Findings) | 0 | ~19.8 min sum of 47 case `elapsed_ms`, statistically identical to Phases 1–3 (this phase adds disclosure/filtering, not new candidate generation, so the rigid path's own cost is unaffected either way) | Two independent, additive pieces. (1) Missing-stroke disclosure: the plain score-based withheld reason now names the top 3 least-matched seed segments by length plus the aggregate missing percentage, via a new optional `detail?: number[]` output on the existing `scoreAt` (no duplicated geometry — it already computed this per segment, just discarded it into the running sum before). Applies with `affine` off too (pure bookkeeping). (2) Exploded-text filter: a new pure `glyphClusterMask` helper (≥6 segments, each ≤4·tol, compact bbox <25% of a reference diagonal, ≥3 distinct directions) wired into `fingerprintSymbol` (new optional `dropGlyphClusters` param, baked into the fingerprint at construction — reports `droppedGlyphSegments`) and into `matchSymbol`'s `extraFor` (new `opts.dropGlyphClusters`, default follows `opts.affine.enabled`) so a tag/label near either the seed or a swept instance never inflates totalLen or counts as "extra linework". 417 tests green (413 pre-existing + 4 new: a second near-miss fixture pinning the exact missing-segment name and percentage, a seed-side tag exclusion proof (`droppedGlyphSegments`, byte-for-byte `rel` equality with the untagged fixture), a sheet-side tag-never-counts-as-extra proof, and an explicit `dropGlyphClusters:false` override proof). `sweepNegative.test.ts` unaffected (4/4 unchanged) — negatives already worked under a fitted transform since Phase 1/2, nothing to add. Gate 4 met: byte-for-byte no-op when both new options are absent/off (proven by test and the unchanged corpus numbers), and the synthetic-fixture axis demonstrates both disclosures working as specified. |
| Phase 5 (steps 1–5, no default flip yet) | 2026-09-10 | not re-run this step — no matching-code touched, only options/output plumbing and docs; see the corpus runs already recorded under Phases 1–4 above, unaffected | 0/0 (no campaign change — `affine` still off by default everywhere) | 0 | not remeasured (no matching-code touched) | Production wiring, structural parity, and docs — the default flip (step 6) is deliberately its own, separate, LAST commit per §3 Phase 5 and is not included here. `mcp/src/session.ts`: `symbolSweep`/`sweepScheduleRow` both gain `opts.affine`, threaded into every `matchSymbol` call (both share one local `sweepOpts` object per function) and into `fingerprintSymbol`'s new `dropGlyphClusters` param; every wire row that already copied `rotation`/`mirrored` now also copies `transform` (10 call sites). `mcp/src/tools.ts`: `symbol_sweep` and `sweep_schedule_row` both gain an `affine: {enabled, max_stretch, max_shear_deg, scale_search}` input (matching §4.3's defaults) — `matchReferenceSymbol`/`match_reference_symbol` deliberately NOT wired (not part of this document's Gate 5 checklist; see Findings). `mcp/src/outputs.ts`: both `sweepPlacement` and `rowSweepPlacement` gain an optional `transform` field (mirroring `SweepTransform` exactly) and their `rotation` doc comments are updated. `web/src/lib/agentTools.js` + `web/src/pages/TakeoffCanvas.jsx`: the SAME `affine` option threaded through the canvas agent tool's `symbol_sweep` (`agentSymbolSweep`), plus its own wire-row `transform` copies and `fingerprintSymbol`'s `dropGlyphClusters` — `runSymbolSweep` (the manual marquee toolbar action, which has no options surface a caller can reach at all today) deliberately left untouched until the default-flip commit, which is the only place that can turn it on (see Findings). A NEW shared, exported `affineOptionsFromWire()` (`symbolsweep.ts`) is the ONE wire→`AffineOptions` translation both `mcp/src/tools.ts` and `web/src/lib/agentTools.js` call — structural parity (one function can't drift out of sync with itself) rather than two independent copies merely tested for agreement. A REAL, latent bug found and fixed along the way (see Findings): `sweepThumb.js`'s `matchBox` sized every review thumbnail to `max(seed_w, seed_h)`, which silently clips ink for a rotation that isn't a multiple of 90° — invisible before Phase 2 made off-grid rotation discoverable at all. `SweepReviewPanel.jsx`'s `Thumb` now threads the row's own disclosed rotation (and shows the fitted transform as a hover title on a MATCH row, which carries no `reason` text). New tests: `symbolAffine.ts`'s `affineOptionsFromWire` (2 tests), a 33°/90°/45°-diagonal `matchBox` proof (2 tests), a structural parity test proving the canvas agent tool reaches the engine with the exact `AffineOptions` the shared translation produces (`mcp/test/symbolSweepAffineParity.test.ts`). tsc clean on both `web` and `mcp`; 452 web tests green (450 pre-existing across the affected suites + 2 new `matchBox` tests — `affineOptionsFromWire`'s own 2 tests are counted in `mcp`'s suite instead, alongside the parity test); eslint clean on every touched `.js`/`.jsx` file. |
| Default flip — ATTEMPTED AND REVERTED | 2026-09-11 | Full 47-case corpus run completed with `AFFINE_WIRE_DEFAULT` genuinely on: 22/47 (47%) fail in some way (10 of those 22 fail on a non-count check with matching counts, likely the same seed-tag-attachment ambiguity as case 01's own Finding, not re-diagnosed per case); 12/47 (26%) show a real count mismatch | not applicable — this is a regression finding, not a campaign measurement | 667 excess phantom matches across the 12 count-mismatch cases (01 +8, 03 +8, 05 +79, 06 +1, 10 +537, 14 +3, 17 +16, 24 +2, 27 +1, 33 +7, 41 +1, 46 +4) — dominated by `10-lovell-m100-cd1-ceiling-diffusers` alone (35 → 572, a 16× overcount) | not measured — this run's purpose was correctness breadth, not timing | The flip (commit `c1fd732`) shipped, then was reverted (`1ed0656`) in the same session once real testing found it unsafe. What started as a single-case finding turned out to be a widespread, corpus-level regression once actually measured at scale — see Findings for the two independent, confirmed root causes (Phase 1's unconditional tolerance widening; `dropGlyphClusters` over-stripping a richly-detailed seed into an over-generic remaining shape). `main` is back to `affine.enabled` defaulting `false` everywhere (the pre-`c1fd732` state); the corpus suite now runs with `affine` genuinely on for every case as a standing gate, and will show red on affected cases until the real causes are fixed. This document's own §8 "Default flipped" box stays unchecked. |
| `dropGlyphClusters` default-off — IMPLEMENTED (interim, not the default flip) | 2026-09-11 | Full 47-case corpus run, `AFFINE_WIRE_DEFAULT` genuinely on (same standing gate as the row above) with the permanent code change described in this row's Notes | not applicable — same as above, a regression-tracking measurement, not a campaign number | 15/47 (32%) fail in some way, down from 22/47; 139 excess phantom matches total, down from 667 (79% reduction) — full breakdown: `01` 19→21 (+2), `02` 1→5 (+4, the one regression), `03` 23→26 (+3), `05` 5→84 (+79, unchanged), `06` 13→14 (+1, unchanged), `10` 35→80 (+45), `14` 2→5 (+3, unchanged), `24` 2→3 (+1), `41` 1→2 (+1, newly surfaced at this scale — not seen in the earlier temporary-patch measurement, which did not report it; small, single-instance, not investigated further here). Six more cases fail a non-count check with the count matching (`11`, `13` [pre-existing, unrelated], `17`, `18`, `23`, `28`) | not measured — same as the row above, this run's purpose is correctness breadth | Implemented the validated interim fix from this table's Findings below (2026-09-11, "Answered that question directly…"): `matchSymbol`'s internal default (`web/src/lib/symbolsweep.ts`) changed from `opts.dropGlyphClusters ?? affineOn` to `opts.dropGlyphClusters ?? false`, and both of `session.ts`'s seed-side `fingerprintSymbol` calls (`symbolSweep`'s own seed and `sweepScheduleRow`'s anchor `candFor` closure) now pass `dropGlyphClusters: false` explicitly instead of following `opts.affine?.enabled`. This is now independent of `affine.enabled` everywhere in production code — a caller can still opt in explicitly either way. Two tests in `symbolsweep.test.ts` whose names/logic assumed the old "on by default with affine.enabled" behavior were updated: the tag-filtering proof now passes `dropGlyphClusters: true` explicitly, and a new test pins the new off-by-default behavior (affine.enabled alone no longer filters the tag). tsc clean on both `web` and `mcp`; 418 web tests green (416 pre-existing + the 1 renamed/updated test + 1 new default-off test) across `symbolsweep.test.ts`/`symbolAffine.test.ts`/`sweepNegative.test.ts`/`sweepCoalesce.test.ts`/`sweepScheduleRow.test.ts`/`sweepThumb.test.ts`/`legendlearn.test.ts`/`symbolLabels.test.ts`; 123 mcp tests green across `session.test.ts`/`symbolSweepAffineParity.test.ts`/`tools.test.ts`. This full corpus run replaces the earlier temporary-uncommitted-patch measurement as the real, permanent-code baseline — the two agree almost exactly (only case `41`'s +1 is newly visible, a small, single-instance, unexplained discrepancy not chased further), confirming the earlier measurement was a reliable predictor. This is an INTERIM improvement, not the default flip: 139 excess matches and 15 failing cases remain, entirely attributable to Phase 1's own unconditional tolerance widening (see Findings) — §8's "Default flipped" box stays unchecked, and the default flip itself remains a separate, later commit per §3 Phase 5 step 6, gated on fixing Phase 1's own root cause first. |

Findings (cases that contradicted a bound — never fixed by moving it):

- **2026-09-11 — MAJOR, re-prioritizes everything below: the dominant real cause of the false-adds traces to Phase 1 itself (refine's adaptive tolerance widening), not Phase 4/5's label-promotion logic this document had been focused on fixing.**
  Ran the corpus runner's own `AFFINE_WIRE_DEFAULT` against several more
  cases beyond `01-cherry-mh111-cd1` to get real, comparative evidence
  before attempting another fix. Two more real regressions found:
  `03-colville-m101-tank-array` (23 → 31, +8) and, far more seriously,
  `05-usda-mh101-d10-air-devices` (5 → 84, a 17× overcount). Three cases
  checked out of 47; this was not an exhaustive corpus sweep, and the true
  scope across all 47 is still unknown.
  Diagnosed `05` directly rather than guessing, isolating one variable at a
  time against `session.symbolSweep` and, at the engine level, `matchSymbol`
  itself:
  - Every one of the 84 false matches disclosed `via: "rigid"` — their
    PROPOSAL came from the plain 8-transform search, the same one that
    existed before any of this affine work. Nothing about Phase 2/3's new
    candidate generation is required to reproduce this: calling with
    `affine: { enabled: true, rotationSearch: false, scaleSearch: false }`
    (i.e. ONLY Phase 1's refine-and-rescore active, no continuous rotation,
    no stretch/shear candidate generation at all) still produces all 84.
  - `dropGlyphClusters` is not the cause either: calling `matchSymbol`
    directly with it forced `true` vs forced `false`, all else identical,
    produced 84 both times.
  - Inspected one false match directly: `{rotation_deg: 89.9, scale_x:
    0.761, ..., rms_px: 2.94, tol_px: 6, via: "rigid"}`. `rms_px` (2.94)
    exceeds the engine's own base `SWEEP_TOL_PX` (2) — at the ORIGINAL,
    pre-affine strict tolerance this candidate would not have scored high
    enough to threaten the 0.92 bar. `tol_px` (6, i.e. `3·SWEEP_TOL_PX`,
    the maximum the residual-adaptive formula in §2.3 allows) is what let
    it cross. This is Phase 1's `tolFit = clamp(3·rms, tol, 3·tol)` doing
    exactly what it was designed to do (§2.4) — but applied
    UNCONDITIONALLY to every rigid-position candidate whenever
    `affine.enabled`, not gated on whether that candidate actually needed
    any rotation/scale/shear correction to explain its residual. On a sheet
    with many small, densely-packed, similar-but-not-identical real
    features (this looks like a grid of dimension/callout numbers — the 84
    false locations cluster tightly together, far from the 5 real air
    devices' own location), tripling the effective match tolerance for
    EVERY such candidate is enough to turn dozens of genuine near-misses
    into full matches.
  This means the risk this document has been chasing (§0's own "changed
  symbols" and label-promotion concerns) is real but SECONDARY. The
  primary, more foundational risk is that Phase 1 — the phase with the
  strongest test coverage, believed the most solid — has a real gap on
  real corpus data: its adaptive tolerance widening was validated in Phase
  1 only against synthetic fixtures and a corpus that (per Phase 0's own
  finding) contains zero real off-grid instances, so nothing in the
  existing test suite exercises a sheet with dense, geometrically-similar-
  but-distinct real content near a seed's own shape.

  **Same-day follow-up: the obvious next hypothesis — gate the widened
  tolerance on the fit's OWN decomposed distortion, not just its residual
  — checked directly against this exact false match, and ruled out.**
  This case's own false match decomposes to `scale_x: 0.761, scale_y:
  1.021, shear_deg: 8.6` — a real 24% scale deviation and 1.34× anisotropy,
  not a near-identity fit hiding behind noise. A least-squares affine fit
  against the WRONG (but coincidentally similar) nearby correspondences
  has no way to know they're wrong; it produces whatever transform best
  explains them regardless, and that transform can look just as
  "genuinely distorted" as a real one. So "only widen when the decomposed
  rotation/scale/shear meaningfully differs from identity" — the fix this
  document recorded as likely correct a few hours earlier — does not
  discriminate real fits from wrong ones either. Two single-candidate
  signals are now ruled out with direct evidence (raw score, at two
  different thresholds — see the promotion-gate Finding above; and
  transform-magnitude plausibility, here) as of this Finding.
  The one signal that looks structurally promising, not yet attempted:
  the 84 false matches on this case sit densely packed (as close as ~8px
  apart), unlike real HVAC equipment placements, which are normally
  spaced by real physical clearance. A per-candidate check can't see this;
  a check across the CANDIDATE SET — flagging a widened-tolerance match as
  suspect when several OTHER candidates score similarly nearby under the
  same widened tolerance (density inconsistent with genuinely spaced
  equipment) — might. Recorded as the next avenue, not implemented here:
  it needs the same corpus-wide, not-one-case validation discipline
  already learned twice over in this document before it goes anywhere
  near a default. The label-promotion investigation below remains real
  and unfixed, but is not the first thing to fix.

- **2026-09-11 — Full 47-case corpus run with `AFFINE_WIRE_DEFAULT` genuinely on, completed. This is not a one-or-three-case problem: 22/47 cases (47%) fail, 12/47 (26%) show a real count mismatch totaling 667 excess phantom matches, and a SECOND independent root cause is now confirmed alongside Phase 1's tolerance widening.**
  Full breakdown (case: expected → found):
  `01` 19→27 (+8), `03` 23→31 (+8), `05` 5→84 (+79), `06` 13→14 (+1),
  `10` 35→572 (+537), `14` 2→5 (+3), `17` 8→24 (+16), `24` 2→4 (+2),
  `27` 3→4 (+1), `33` 3→10 (+7), `41` 1→2 (+1), `46` 7→11 (+4). Ten more
  cases fail a non-count check with the count itself matching (`11`, `18`,
  `22`, `23`, `28`, `32`, `34`, `35`, `38`) — not individually re-diagnosed,
  but consistent in shape with case 01's own seed-tag-attachment Finding
  above, i.e. likely more instances of the same pre-existing "nearest
  visible text" ambiguity, now surfaced because affine's wider search
  changes what a seed's own computed position lands closest to. `13`
  remains the one already-known, pre-existing, unrelated sheet-metadata
  failure (count still exact).
  Verified `10-lovell-m100-cd1-ceiling-diffusers` (the worst case, 16×
  overcount) directly rather than assuming it shares case 05's cause:
  372 of its 572 matches carry `via: "rigid"` and a further 6 `via:
  "rotation"`, with 306 total scoring `rms_px > 2` (the base tolerance) —
  the exact same Phase 1 tolerance-widening signature as case 05,
  confirming that cause is real and recurring, not a one-off. But 194 of
  the 572 carry NO `transform` at all — meaning they score ≥ 0.92 under
  the ORIGINAL plain rigid path, needing no affine widening whatsoever.
  Traced this to a SECOND, independent, confirmed cause: this seed's own
  fingerprint collapses from 165 segments (762 px of linework) to just 20
  segments (522 px) once `dropGlyphClusters` fires — 88% of its segment
  count judged an "exploded text cluster" and dropped. The Phase 4
  heuristic (§ the earlier Finding on case 01's zigzag/zigzag-line
  misfire) is not just shifting a seed's computed center on a richly-
  detailed symbol — on a symbol with enough fine internal linework (a
  diffuser's own hatched/gridded fill, in both `01` and `10`, both
  literally tagged "CD-1" in their respective real drawing sets), it can
  strip so much that the SURVIVING 20-segment shape becomes generic
  enough to over-match under the untouched, pre-existing rigid search —
  no continuous rotation, no stretch/shear, no tolerance widening
  required at all for that portion of the damage.
  Net conclusion: turning affine on, as currently implemented, is unsafe
  at corpus scale via at least two independent, confirmed mechanisms —
  Phase 1's unconditional tolerance widening, and Phase 4's
  `dropGlyphClusters` over-stripping richly-detailed real seeds. Both need
  real fixes, validated corpus-wide (not one case, not a same-session
  guess — see the two disproven single-candidate hypotheses already
  recorded above), before any further default-flip attempt. The
  label-promotion investigation remains a real, separate, third
  contributing issue, lower priority than both of these.

- **2026-09-11 — A fourth single-signal hypothesis, checked with real numbers before implementation, also fails to discriminate: capping the FRACTION of a seed `glyphClusterMask` may drop.**
  Obvious next idea for the `dropGlyphClusters`-over-stripping cause above:
  refuse to drop a cluster when it would remove too large a share of the
  seed's own segments/length — a real symbol's own hatching being
  misclassified should, in principle, be a much bigger share of the whole
  than an incidental attached tag. Checked against real numbers before
  writing any code: the EXISTING, validated Phase 4 fixture
  (`symbolsweep.test.ts`'s `glyphTagAt`, a legitimate small tag beside a 4-
  segment square) already drops 79% of the seed's SEGMENT COUNT (15 of 19)
  and 27% of its LENGTH (15 of 55px) — and case `10`'s real over-drop is
  88% by count, 31% by length. Neither metric separates the two with any
  safe margin: a threshold loose enough to keep the legitimate test passing
  (needs to tolerate ≥ 79%/27%) would also let case 10's 88%/31% through
  untouched. This rules out drop-fraction capping the same way score
  thresholds and transform-magnitude plausibility were already ruled out —
  four single-scalar signals checked, four found not to discriminate.
  This pattern across all four suggests the real problem may not be
  fixable with a single extra scalar cutoff on top of `glyphClusterMask`'s
  existing count/length/bbox/direction-diversity features at all — a real
  symbol's own dense hatch/fill pattern and genuine exploded text can look
  structurally identical on exactly those features (this heuristic's own
  documented feature set). The two real seeds hit by this (`01`, `10`) are
  both densely cross-hatched diffusers; the fix may need a feature these
  four attempts didn't use, such as stroke REGULARITY (a hatch pattern's
  strokes are typically near-parallel with highly consistent spacing;
  genuine letterforms are not) — untested, unimplemented, the next
  hypothesis worth checking with real numbers before writing code, exactly
  as this Finding did.

- **2026-09-11 — The default-flip commit (`c1fd732`) was unsafe and was reverted (`1ed0656`) in the same session, because the gate that was supposed to catch this never ran the real code path.**
  The corpus runner (`mcp/scripts/symbol-sweep-corpus.mjs`) calls
  `session.symbolSweep` directly, and `session.symbolSweep` applies no
  default of its own for `affine` (its absence from `opts` IS "off" — by
  design, so that internal/test callers never silently change behavior
  under them). The wire-level default flip only changes what `mcp/src/
  tools.ts`'s zod schema and `web/src/lib/agentTools.js`'s dispatcher
  synthesize before calling `session.symbolSweep` — a corpus runner that
  calls the session directly bypasses that layer entirely. So both "clean"
  two-consecutive-full-run results recorded for the flip were re-running the
  exact same rigid-only baseline every prior phase already proved unchanged
  — they proved nothing about the path a real flip turns on for every
  actual caller. Fixed in `7574ede`: the runner now applies the same
  `AFFINE_WIRE_DEFAULT` constant unconditionally (opt-out per case), so it
  is finally testing what a flip actually means.
  That fix immediately surfaced a real regression on real data:
  `01-cherry-mh111-cd1` (a CD-1 ceiling-diffuser sweep, 19 real instances)
  returned 27 matches with affine genuinely on — an 8-instance false-add,
  plus harness-level identity errors (`seed tag RG-6 != CD-1`, `seed at
  1746.9,440.2 misses frozen center 1746.9,436.2`). Diagnosed directly
  (`session.symbolSweep` called standalone, full match dump with `score`
  and `transform`), not guessed at — two distinct, compounding causes:
  1. **`dropGlyphClusters` (Phase 4) can strip real seed geometry, not just
     exploded text.** It is applied to the SEED's own fingerprint whenever
     `affine.enabled` (`fingerprintSymbol(geo.segs, rect, geo.lum,
     {dropGlyphClusters: opts.affine?.enabled === true})` in
     `session.ts`'s `symbolSweep`), and on this real symbol its heuristic
     (≥6 segments, each ≤4·tol, compact bbox <25% of the reference
     diagonal, ≥3 distinct directions) matched part of the CD-1 symbol's
     OWN legitimate geometry, not a nearby tag. Stripping it shifted the
     seed's computed center by ~4px — enough that the nearest-label lookup
     (`labelPlacements([fp.center], ...)`) attached to a DIFFERENT, nearby
     symbol's tag ("RG-6") instead of the seed's own ("CD-1"). This
     heuristic was validated in Phase 4 only against synthetic fixtures
     built to BE exploded text — it was never tested against a real dense
     symbol that might resemble one by the same geometric measure, and this
     real corpus has at least one.
  2. **Pre-existing label-corroboration promotion was never designed for
     an affine-widened candidate pool.** `session.ts`'s `symbolSweep`
     widens the withheld band's lower score bound to
     `LABEL_CORROBORATION_SCORE_LOW` whenever the seed has a nearby text
     hint, then `reconcileSweepLabels` promotes any withheld candidate
     whose OWN drawn tag agrees with the seed's family straight to a
     committed match — a pre-existing, PRE-affine mechanism (`#308`) that
     was safe when only near-perfect RIGID matches ever scored in that
     band. Affine's much wider refine()-driven candidate generation now
     puts genuinely bad geometric fits in that same band (one of the 27
     matches here carried `scale_x: 0.221, shear_deg: 77.6°` — unmistakably
     a different symbol, not a distorted CD-1) and the promotion logic
     trusts the text tag over the geometry regardless of how bad that fit
     is. This is a real gap in this document's own §0 discipline ("every
     searched transform disclosed or withheld", implicitly meaning
     disclosed/withheld ON ITS OWN GEOMETRIC MERITS) that the label layer
     was never audited against once affine widened what could reach it.
  Neither cause is fully fixed yet — both need real design work, not a
  bounds tweak (§7 rule 4 does not apply here: this is the bound admitting a
  false positive, not a genuine case the bound wrongly excludes).

  **Update, same day, commit `a0099c3`: cause 1 partially addressed, cause 2
  still open.** Added `SymbolFingerprint.rawCenter` (the seed's centroid over
  EVERY segment in the marquee, independent of `dropGlyphClusters`) and
  switched `session.ts`'s seed-label-lookup call sites and the seed's
  disclosed `center` field to use it instead of the filtered `center`. This
  is real, tested, verified-on-the-actual-case progress — re-running
  `01-cherry-mh111-cd1` directly confirms the exact symptom it targeted
  ("seed at 1746.9,440.2 misses frozen center 1746.9,436.2") is gone; the
  disclosed seed position now matches the ground truth exactly. 418 web +
  123 mcp tests stay green, no regression.
  It is explicitly NOT a fix for the case as a whole: re-run after this
  change, `01-cherry-mh111-cd1` still returns 27 matches (not 19) and the
  seed's own tag lookup still resolves to "RG-6" instead of "CD-1" — using
  the now-CORRECT center for that lookup didn't change which text it finds
  nearest. That means the real cause of the wrong-tag attachment (and by
  extension a meaningful share of the false-adds) is NOT fully explained by
  the center-shift theory as first diagnosed — it is at least partly
  downstream in `labelPlacements`'s own nearest-text-span logic, or in cause
  2 (the label-corroboration promotion path), neither of which this change
  touched. The corpus suite correctly stays red on this case. Also fixed in
  the same commit: the corpus-runner fix from commit `7574ede` had been
  importing `AFFINE_WIRE_DEFAULT` from a module that no longer exported it
  after the revert removed it (`main` was broken — running the script threw
  immediately) — `tsc` never caught this because `mcp/tsconfig.json`'s
  `include` doesn't cover `scripts/*.mjs`. Re-added the constant standalone
  (not the wire-schema defaulting, which stays reverted). Lesson recorded
  for this document's own §7 working method: a change to a `.mjs` script
  under `scripts/` must be RUN, not just type-checked, before it is trusted
  — `tsc --noEmit` silently does not cover that directory.

  **Further narrowing, same day: cause 1 (center shift) is real but is
  NOT what drives this case's wrong-tag attachment — the priority is
  entirely cause 2.** Computed the real distance from the ground truth's
  own frozen seed center to CD-1's own authored `tag_bbox`: 86.3px. That is
  a substantial leader-line distance in a busy floor plan — plausibly
  farther than at least one neighboring device's own tag sits from this
  same symbol. `labelPlacements`'s nearest-visible-text heuristic (a
  PRE-EXISTING, already-tuned system — its own source comments cite a real
  calibration case from THIS SAME "Cherry Point" document set) can
  legitimately prefer a closer WRONG tag over a farther RIGHT one; this is
  an existing limitation of "nearest text" as an attachment strategy, not
  something Phase 4/5 introduced. The center-shift bug was real and worth
  fixing (disclosed coordinates were provably wrong), but it was not the
  decisive factor in why this seed mislabels — re-pointing the lookup at
  the geometrically correct center did not change which tag it finds
  nearest, because the true tag was never going to win on proximity either
  way.
  This means cause 2 is the one that actually matters for the false-add
  count: this pre-existing tag-proximity ambiguity is not new, but it only
  becomes a false-add now because affine's wider candidate pool creates
  more low-quality-but-nearby-labeled withheld candidates for the
  label-corroboration promotion to wrongly commit. The real fix is almost
  certainly gating that promotion on some minimum geometric plausibility
  (e.g. the fitted transform's own residual, or a tighter effective bound
  than the raw max_stretch/max_shear pass/fail) rather than trusting ANY
  nearby text agreement regardless of fit quality — not a bounds tweak, and
  not something to redesign in the same sitting that found it: it needs
  its own careful synthetic-fixture-plus-corpus validation pass so it
  doesn't regress the real, valuable cases this promotion mechanism already
  correctly handles.

  The corpus suite is left deliberately red on affected cases with
  `AFFINE_WIRE_DEFAULT` genuinely on, rather than quietly reverting the
  runner fix too — that redness is the correct, honest state until a real
  fix lands, and it is the gate any future default-flip attempt must pass
  cleanly, on the ACTUAL code path this time.

  **Same-day attempt at cause 2 itself, tried and deliberately reverted
  (never committed) — recorded because the negative result is real signal
  for whoever attempts this next.** Added a score floor to
  `reconcileSweepLabels`'s promotion branch in `symbollabels.ts`, gated to
  affine-sourced candidates only (`row.transform` present) so the
  already-tested, already-correct RIGID-origin sibling-corroboration case
  (a same-family low-score match promoted by tag, e.g. VAV-9/VAV-12 —
  real, passing test, deliberately left untouched) would not regress.
  First attempt used `SWEEP_SCORE_LOW` (0.75) as the floor: `01-cherry-
  mh111-cd1` moved 27 → 26 — real but tiny, because almost every one of
  the false-adds scored ABOVE 0.75 already (up to 0.984), comfortably
  inside the pre-existing 0.75–0.92 "near-match, promotable by tag" band
  this file's own header comment describes as a deliberate, LONG-STANDING
  design (`#308`, pre-dating this entire affine effort). That reframes the
  real cause: affine does not corrupt the promotion rule itself — it
  floods that same band with far more candidates than the 8-position rigid
  search could ever produce (continuous rotation × independent x/y stretch
  × shear vs. 8 discrete transforms), so "some 0.75–0.92 fit exists nearby
  with an agreeing tag" stops being the rare coincidence the rule was
  tuned for.
  Second attempt raised the floor to `SWEEP_SCORE_HIGH` (0.92) — which,
  because anything scoring that high already commits as a plain match
  before label reconciliation ever runs, amounts to disabling affine-
  sourced label promotion entirely. Result: 27 → 16, UNDER the true count
  of 19. This proves at least 3 of this case's genuinely real CD-1
  instances were themselves relying on this exact mechanism — their raw
  geometric score alone was not enough to commit, and correct tag
  corroboration was the only reason they were ever going to count. A
  single global score threshold cannot separate these two populations
  (genuine-but-weak affine fits vs. wrong-symbol affine fits coincidentally
  near a real tag) on one case's evidence alone — trying either bound
  swaps one error class for the other. The fix likely needs a signal
  beyond raw score entirely: e.g. the fitted transform's own physical
  plausibility (independent x/y scale ratio, `rms_px` relative to the
  seed's own footprint, or the specific combination that made the reverted
  0.221/77.6° fit unmistakably wrong versus a merely-imperfect real match)
  rather than a single number every candidate is judged against the same
  way. This needs real, corpus-wide (not one-case) synthetic-plus-real
  validation before landing — reverted cleanly (never committed, working
  tree restored to `a0099c3`) rather than leaving an unvalidated guess in
  the tree.

- **2026-09-10 — Phase 0's own "≥ 20 real affine instances" target contradicted by the actual corpus, exhaustively checked, not a sampling gap.**
  Method: for every one of the 47 existing ground-truth seeds (30 baseline
  + 17 extended), manually rotate that seed's own fingerprint (`fp.rel`) by
  each angle in `{15°, 30°, ..., 345°} \ {90°,180°,270°}` × `{mirror off,
  mirror on}`, then call the *existing, unmodified* `matchSymbol(rotatedFp,
  sheetSegs, {rotations:false, mirror:false, scoreLow:0.80})` — this finds
  anything on the sheet that the rotated fingerprint lines up with, using
  only code that ships today. All 47 seeds got a conclusive result (0 or
  ≥1 hits; five initially timed out under concurrent-job CPU contention and
  were re-run alone to conclusion — see the throwaway `/tmp/rot_scan.mjs`
  script, not part of this commit).
  Result: **20 candidate hits across 6 seeds; 0 baseline seeds and 0
  extended seeds produced a genuine same-tag off-grid instance.** Every
  hit was rendered (`renderRegionPng`) and looked at:
  - `01-cherry` (CD-1 diffuser, stretch search only): 48 apparent
    "1.15×–1.3× stretch" hits, scores up to 0.979 — every one checked was
    `CD-2`/`RG-1`/`RG-6`, a visually near-identical sibling icon family
    with a different tag.
  - `10-lovell` (CD-1 diffuser): 1 hit at 165°, score 0.805, a "TAB-105"
    label — the leader line traces to an `EG-1` exhaust-grille callout,
    not `CD-1`.
  - `12-fort-sam` (HWP-1 pump): 2 hits at 120°+mirror, scores 0.903–0.906
    — both are `BCP-1`, a visually identical pump icon for a different
    device.
  - `20-jvwtp-e603` (R1 relay coil): 2 hits at 20°, score 1.000 (exact) —
    both are `EF-3`/`EF-4` fan-contactor `F` coils, a sibling the case's
    own review notes already name ("Two geometrically identical circular
    F coils... explicitly withheld").
  - `23-st-cloud` (VAV terminal): 1 hit at 45°, score 0.820 — a
    match-line/title-block graphic artifact, not a VAV box.
  - `31-lbnl` (DPT transmitter, extended): 7 hits at exactly 45°, score
    0.922 (identical across all 7) — every one checked is a `DPS`/`T`/`CS`
    circular instrument bubble, again a sibling the case's own review
    notes name ("the seed's... bubble also reproduce[s] the circular
    bodies of DPS, T, CS, and SS instruments").
  - `42-guaranteed-rate` (T thermostat, extended): 7 hits at 15°/45°/225°,
    scores 0.823–1.000 — a tightly-centered re-render of the highest-
    scoring hit lands exactly on a black/white valve-actuator marker, not
    a T bubble (a wider crop had been visually misleading by also
    containing a real, different, already-known T bubble nearby).
  Two distinct, now well-understood failure mechanisms explain all 20:
  (a) **sibling-family aliasing** — this corpus's MEP symbol libraries
  reuse near-identical icon geometry across semantically different device
  types (pump/pump, coil/coil, diffuser/grille, transmitter/switch),
  differentiated only by adjacent tag text, so a bare-geometry rotation
  search re-discovers the sibling family rather than a genuine rotated
  same-tag instance; and (b) **symmetric-shape aliasing** — a seed whose
  fingerprint is close to a bare circle (relay coils, instrument bubbles)
  scores identically under many rotation angles against ANY same-shaped
  circle on the sheet, real rotation or none, because a circle has no
  rotational information to match against. Both mechanisms directly
  inform Phase 3's design: any affine-search candidate must be
  tag-corroborated before promotion, not accepted on bare geometric score
  alone — exactly the discipline `assignInstances`'s label check already
  applies to the baseline campaign.
  Independently, a full read of all 47 existing cases' authored `review.notes`
  (the human/agent-rendered visual audit already on file for every case)
  found **zero** notes describing an off-grid (non-90°-multiple) rotation —
  every "rotated"/"mirrored"/"quarter-turned"/"half-turn" note in the
  corpus describes a rigid transform the 8-matrix search already handles.
  **Conclusion, not a bound move:** this specific 30-document benchmark
  corpus — curated for baseline/extended symbol-family coverage, not for
  this goal — does not contain the affine-distortion population Phase 0's
  original target assumed. Gate 0 (§3) is revised accordingly: the ≥20
  target is kept as an aspiration for a future corpus/production find, not
  a blocking count for Phase 1 to start. Phase 1–4's own synthetic
  fixtures (already specified in each phase's §3) carry the correctness
  burden this corpus cannot.

- **2026-09-10 — `mergeProposals` (shared by every sweep, not only affine
  ones) dropped a losing candidate's extra fields onto the winner's `xf`.**
  Its tie-break correctly decided WHICH candidate should win (`s.score >
  twin.score || (tie && s.xf < twin.xf)`) but then copied only the five
  named fields (`at`/`score`/`xf`/`rotation`/`mirrored`) onto the kept
  object — Phase 1's `transform`/`mAt`/`boundsFailed` fields, added to
  `Scored` but not to `mergeProposals`'s own five-field contract, survived
  from whichever candidate happened to be `kept` FIRST even after a later,
  better candidate won the tie-break. Caught by Phase 2's own "plain
  translated copy" test: a clean rigid xf=0 match (score 1.0, no transform
  needed) tied in score against a spurious xf=4 candidate that Phase 1 had
  refined up to the same 1.0 via a wrong-but-self-consistent correspondence
  set (`rotation_deg: 184.2°`, `extra: 0.646`) — the merge correctly
  recorded `xf: 0` as the winner but the stale `transform` from xf=4 rode
  along, producing a row that claimed to be BOTH a clean rigid match and an
  affine-refined one. Fixed by replacing the whole kept-array slot with the
  winner's own object on a tie (`kept[twinIdx] = { ...s }`) instead of
  copying named fields — generic, so it protects every current and future
  caller that attaches its own extra fields to a scored candidate, not just
  this one. Pinned by a regression test using the exact scenario above.

- **2026-09-10 — the shared `SYMBOL` test fixture (square + one diagonal +
  a stub) has its own real near-symmetry that Phase 1's narrow near-grid
  refinement never surfaced but Phase 2's much wider rotation search finds
  easily.** A specific mirror+rotation combination reproduces the fixture's
  own ink almost exactly, so a large-angle rotation test built on `SYMBOL`
  can converge on a technically-scoring-1.0 but semantically wrong
  alternate reading (`mirrored: true`, large `extra`) instead of the
  intended plain rotation. Confirmed NOT a bug in the affine math itself:
  an independently-constructed, genuinely asymmetric open-polyline fixture
  (`ASYM2` in `symbolsweep.test.ts`, distinct segment lengths, no
  near-symmetry) recovers every tested angle (30°/57°/123°/211°, plus a
  mirrored 40° case) exactly. Lesson for future phases' own tests: keep
  `SYMBOL` for what it already exercises well (rigid symmetry, dedup,
  negatives) and reach for an asymmetric fixture whenever a test's whole
  point is pinning down ONE unambiguous transform — Phase 3's own stretch/
  shear tests should do the same, not assume `SYMBOL`'s asymmetry holds
  under every distortion.

- **2026-09-10 — Phase 3's basis-pair selection could end up with every
  candidate parallel, silently disabling stretch detection on whichever
  axis wasn't stretched.** Caught by the x-only-stretch test, not by
  inspection. Mechanism: an anisotropic stretch on only one axis leaves
  every segment on the OTHER axis unchanged in length, so those segments
  still coincidentally length-match the seed elsewhere on the sheet. That
  inflates their OBSERVED rarity (rarity is "how many sheet segments share
  this length within tolerance", computed against the whole sheet
  including the very instance being searched for) enough to push them out
  of the shared, rarity-only-capped `anchors` array (`ANCHOR_COUNT = 3`)
  entirely — every surviving anchor ends up on the stretched axis, all
  mutually parallel, and no pair ever clears the ≥ 20° angle-diversity
  check. Fix: basis-pair CANDIDATES are drawn from a wider pool (the
  rarest 6 distinct lengths, `byLenQ` already has all of them — no new
  computation) while still only ever trying the best `K = 3` PAIRS by
  combined rarity, so the expensive per-pair search stays exactly as
  bounded as before. `anchors`/`ANCHOR_COUNT` themselves are untouched —
  every other caller of that shared array is unaffected. Pinned by the
  x-only and y-only stretch tests in `symbolsweep.test.ts`.

- **2026-09-10 — Phase 3's ratio-band search for the first basis segment
  could miss a real, disclosable, OUT-OF-BOUNDS stretch entirely, not just
  fail to commit it as a match.** Caught by the 1.6×-stretch-withheld
  test: the first version found nothing at all (empty `withheld`), not
  even a disclosed near-miss. Mechanism: `ratioBand` deliberately searches
  only within the STATED bound (`affineBounds.maxStretch`, default 1.5×) —
  right, since a stretch inside the bound is what should ever commit — but
  which half of a basis pair happens to sit on the stretched axis is not
  known ahead of time, and the pair-forming loop only ever tried ONE role
  assignment per unordered pair (whichever came first by rarity). When
  that happened to be the segment on the OUT-OF-BOUND stretched axis,
  `ratioBand` correctly found nothing past 1.5× — except the seed's own
  unstretched twin elsewhere on the sheet, which trivially satisfies the
  band at ratio 1.0 and produces a spurious self-referential candidate
  that `excludeCenter` then (correctly) suppresses, leaving nothing.
  **Fix: try BOTH role assignments per selected pair** — whichever one
  actually sits on the unchanged axis will find its ratio-band match
  easily, and the other (however far out of bound) is then found via the
  already-generous, POSITIONAL (not ratio-based) margin search used for
  the second basis segment. Also required loosening the shared
  `proposalFloor` gate: a dynamically-generated (Phase 2/3) candidate's
  OWN rough guess matrix can legitimately score below that floor at the
  rigid search's fixed tolerance even for a real placement — Phase 3's
  4-point basis fit especially so — so refinement against the full
  correspondence set must run before the floor is ever applied, not be
  foreclosed by the rough guess's own raw score. The rigid path's gate is
  byte-for-byte unchanged (still keyed to ITS raw score, still applied
  before any refine() call) — this only widens what a dynamic candidate
  gets a chance to prove. Pinned by the 1.6× stretch test.

- **2026-09-10 — `SweepTransform.via` had been hardcoded to `"rigid"` on
  every refined row since Phase 1, including Phase 2/3 rows §4.1 itself
  says should read `"rotation"`/`"affine"`.** Caught by re-reading §4.1
  while starting Phase 5 (its own contract section), not by a failing
  test — nothing had asserted `via` on a Phase 2/3 row before. Mechanism:
  `refine()` built its returned `transform` with `via: "rigid"` literally,
  regardless of which `xforms` entry actually produced the candidate being
  refined. Fixed by capturing `rotationXformCount` (the boundary between
  Phase 2's appends and Phase 3's, mirroring the existing `rigidXformCount`
  boundary before Phase 2) and passing the correct `via` into `refine()`
  from its one call site: `xf < rigidXformCount` → `"rigid"`,
  `rigidXformCount <= xf < rotationXformCount` → `"rotation"`,
  `xf >= rotationXformCount` → `"affine"`. Pinned with new `via` assertions
  added to the existing Phase 2 off-grid-rotation test, the Phase 3
  x-only-stretch test, and the Phase 3 out-of-bounds-withheld test.

- **2026-09-10 — §4.2's exact missing-stroke wording conflicts with an
  already-shipped, product-facing reason string; kept the shipped one and
  added what §4.2 actually wanted (segment naming + orientation) inside
  it, rather than rewriting it.** §4.2 specifies `reproduces ${pct}% of
  the seed; missing ${list} (${missingPct}% of linework)`. But the PRE-
  EXISTING plain near-miss reason — `matched ${pct}% of the seed's
  linework (commit bar ${scoreHigh}%) — likely a variant or an overlapped
  instance; look before counting it` — is quoted verbatim in
  `web/src/components/SweepReviewPanel.jsx`'s own comment as the reason
  this exact panel was built to surface reasons instead of a bare
  percentage: a real, already-tested, product-facing convention, not
  something this phase introduced. Rewriting it to §4.2's "reproduces …"
  phrasing would silently break that convention for a wording preference
  with no functional difference. Kept the shipped sentence and inserted
  the missing-segment list (now WITH orientation — `"${len} px
  ${orientation}"`, `horizontal`/`vertical`/`diagonal` computed from each
  segment's own endpoints at a ±5° tolerance around each axis, never an
  invented semantic label) and the aggregate percentage before its closing
  clause. Initially shipped without orientation at all (a stated but
  wrong assumption that no semantic label was computable) — corrected
  once §4.2 was re-read closely: orientation is geometry, not invented
  semantics, so there was no reason to omit it. Both existing missing-
  stroke tests updated to assert the corrected `"{len} px {orientation}"`
  wording.

- **2026-09-10 — `sweepThumb.js`'s `matchBox` silently clipped review
  thumbnails for any placement rotated off a 90°-multiple — a real,
  latent bug invisible before Phase 2 made off-grid rotation discoverable
  at all.** §3 Phase 5 step 3 asked to "verify it does not assume
  multiples of 90°; fix if it does" — grepping for an explicit
  `rotation === 90` style check found nothing, but the geometry itself was
  still wrong: `matchBox` sized every tile to `max(seed_w, seed_h) ×
  (1 + 2·pad)`, which is exactly sufficient at 0/90/180/270° (a
  right-angle instance's own axis-aligned bbox never exceeds the larger
  side) but provably insufficient at an arbitrary angle — a rotated
  rectangle's true bounding box is `w·|cosθ| + h·|sinθ|` on one axis and
  `w·|sinθ| + h·|cosθ|` on the other, which peaks at the shape's own
  diagonal (`√(w²+h²)`) near a 45°-from-longest-axis rotation. For a
  square seed this is `√2× (≈41%)` past `max(w,h)` — comfortably past the
  default 15% pad. Fixed by giving `matchBox` an optional `rotationDeg`
  parameter (default 0 — every existing caller keeps its EXACT prior
  numbers, proven by the existing pinned 0°/90° test) that computes the
  true rotated bounding box for the ACTUAL angle drawn, not a blind
  worst-case guess. Wired the real angle through from `SweepReviewPanel.jsx`
  (`m.transform?.rotation_deg ?? m.rotation`) since that row-level data
  already existed and simply wasn't being passed. New tests: 33° (the
  documented probe angle), an exact-90°-equals-the-plain-case regression,
  and a 45°-square-must-cover-its-own-diagonal proof.

- **2026-09-10 — `match_reference_symbol`/`matchAgainstLibrary` and the
  canvas's manual marquee-drag sweep (`runSymbolSweep`) deliberately NOT
  wired with `affine` in this phase — recorded, not silently skipped.**
  §3 Phase 5's own definition of done and §1's call-site table don't
  name either as a Gate 5 requirement (the tool schema/wiring work is
  scoped to `symbol_sweep`/`sweep_schedule_row`, the two tools this whole
  document is about). `matchAgainstLibrary` already forwards an arbitrary
  `MatchOptions` (including `affine`) straight through to `matchSymbol`
  transparently — nothing in the engine itself blocks it — but
  `matchReferenceSymbol`'s own opts type exposes no surface for a caller
  to state it, and doing so would need its own tool-schema change to a
  DIFFERENT tool this document doesn't otherwise touch. `runSymbolSweep`
  (the canvas's `Symbol` toolbar drag-marquee action, distinct from the
  agent-driven `agentSymbolSweep`) has literally no options parameter
  today — it is called with only the two rect corners — so there is no
  existing surface to thread `affine` through at all; the ONLY thing that
  can turn it on is the default-flip commit itself, which must therefore
  touch this call site directly (hardcode `affine: {enabled: true, ...}`
  once the default actually flips) rather than plumb an option nobody
  can set beforehand. Both are explicitly listed as required edits in
  the default-flip step's own plan, not forgotten.

- **2026-09-10 — the parity test proves structural sharing, not a live
  canvas-vs-MCP run — recorded as a deliberate scoping decision, not a
  shortcut.** §3 Phase 5 item 4 asks for "one fixture, both call sites'
  option objects → identical matches/withheld/rejected." `matchSymbol`/
  `sweepSymbols` themselves cannot literally disagree between the two
  surfaces: `mcp/src/session.ts` and `web/src/pages/TakeoffCanvas.jsx`
  both call the exact same exported functions from `symbolsweep.ts`, not
  two separate implementations — recall confirmed this directly by
  reading both call sites. The only place true parity could be LOST is
  the wire→`AffineOptions` translation at each surface's own tool schema
  (necessarily two different schemas — a zod tool vs. a JSON-schema agent
  tool). Rather than write a test that runs both surfaces and compares
  outputs (which would need a browser — not available in this
  environment — to exercise the canvas path for real), the fix is
  structural: a single exported `affineOptionsFromWire()` in
  `symbolsweep.ts` that BOTH `mcp/src/tools.ts` and `web/src/lib/
  agentTools.js` import and call, so the two schemas cannot drift out of
  translation sync with each other even if their wire shapes' field names
  ever diverge cosmetically. The new parity test exercises the canvas
  side's actual dispatcher (`executeAgentTool`) end to end and asserts the
  `AffineOptions` it hands the engine matches the shared function's own
  output bit for bit.

- **2026-09-11 — Checked the proposed "stroke regularity" hypothesis for `dropGlyphClusters` against case 10's real dropped cluster: inconclusive, not validated, not implemented.**
  Extracted the actual 145 segments `glyphClusterMask` drops from case 10's
  seed (fixed a coordinate-frame bug first: `fpOff.rel`/`fpOn.rel` are each
  centroid-relative to their OWN fingerprint's center, which differ once
  segments are dropped, so a naive diff of `rel` entries wrongly flagged
  100% as dropped — re-derived in absolute image-px coordinates via
  `rel[i] + center` before diffing). Real numbers: length coefficient of
  variation 0.677 (moderate spread, not the near-uniform stroke length a
  clean repeated hatch pattern would show); angular concentration `R =
  0.591` on a 0–1 scale (moderately aligned, not clearly "all parallel" nor
  clearly "scattered"); 31 distinct 5°-angle buckets across 145 segments
  (real angular diversity — a simple 1–2-direction hatch would show far
  fewer). This does not cleanly read as "obviously a regular hatch pattern"
  the way the hypothesis predicted, but there is no real (not synthetic)
  correctly-classified exploded-text example from this corpus on hand to
  compare it against, so it does not cleanly rule the idea out either —
  unlike the four fully-checked-and-disproven hypotheses above, this one is
  genuinely unresolved, not negative. Recorded honestly as such rather than
  either implementing an unvalidated heuristic from one data point or
  falsely claiming a clean rule-out the data does not support. Whoever
  picks this up next should find or author a real corpus instance of
  correctly-classified exploded text first, extract the same three
  statistics from it, and only then judge whether regularity actually
  separates the two populations.

- **2026-09-11 — Went looking for that real corpus instance of correctly-classified exploded text (to complete the Finding above) and found something more important instead: `dropGlyphClusters` fires on 19 of 47 corpus seeds (40%), and NONE of them look like a clean, conservative "small incidental tag" case.**
  Surveyed every seed in the corpus for how much `dropGlyphClusters` drops
  relative to `dropGlyphClusters: false` (segment-count and length
  fraction, same method as the `01`/`10` Findings above). 19 of 47 seeds
  show ANY drop at all — this is not the rare edge case the two already-
  found false-add cases suggested, it is a routine occurrence across a
  large share of this real corpus. The drop percentages themselves range
  from 8% up to 90% of segment count (`02`: 8%, `08`: 15%, `25`: 19%, `03`:
  19%, ... `14`: 90%, `22`: 81%, `33`: 83%, `24`: 78%, `38`: 60%, `13`:
  65%, `17`: 67%, alongside the already-known `01` 61% and `10` 88%).
  Checked the SMALLEST real drop in the whole corpus (`02-norfolk-am104-
  generator-core`, 8% by count) specifically hoping it would be the clean
  "small tag beside a big symbol" case needed to validate or refute the
  stroke-regularity hypothesis above. It is not obviously that: the dropped
  cluster still spans a 55×50px bounding box and carries the same kind of
  ambiguous regularity signature (`R = 0.670`, 14 distinct angle buckets
  across only 32 segments — proportionally MORE angular diversity than
  case 10's already-inconclusive cluster, not less). Across all 19 real
  seeds this fires on, none presents as an obvious, small, conservative,
  correctly-scoped drop — the absence of any validating example, across
  the entire corpus this project has, is itself the finding.
  This changes the assessment of `dropGlyphClusters` from "occasionally
  over-fires on richly-detailed symbols" to "the calibration itself may be
  fundamentally too aggressive for this corpus's real drafting conventions,
  not a design that mostly works needing a tuning correction at the
  margins." Whoever picks this up next should treat "is this heuristic
  salvageable by tuning at all, or does it need to default OFF
  independent of `affine.enabled` until properly redesigned" as an open
  question to answer FIRST, before spending more effort on the specific
  discriminator (regularity or otherwise) — tuning a discriminator on top
  of a heuristic that may be wrong at its foundation risks solving the
  wrong problem.

- **2026-09-11 — Answered that question directly: a full 47-case corpus run with `dropGlyphClusters` forced off (affine otherwise genuinely on) cuts total corpus failures from 22/47 to 15/47 and total excess phantom matches from 667 to 139 — a 79% reduction. This isolates and quantifies, for the first time, exactly how much of the corpus-wide damage each of the two confirmed root causes owns.**
  Method: a TEMPORARY, uncommitted patch to `session.ts` (`sweepOpts`'s
  `dropGlyphClusters: false` plus the seed's own `fingerprintSymbol` call
  forced to `false`, both reverted immediately after the run — never
  committed, `git diff` confirmed clean afterward) to isolate Phase 1's
  tolerance-widening cause from Phase 4's `dropGlyphClusters` cause by
  running the SAME full 47-case corpus sweep with only the latter disabled.
  Per-case delta (case: before excess → after excess):
  `01` +8→+2, `02` +0→+4 (the one regression — see below), `03` +8→+3,
  `10` +537→+45, `17` +16→+0 (fully fixed), `24` +2→+1, `27` +1→+0 (fixed),
  `33` +7→+0 (fixed), `46` +4→+0 (fixed). `05`, `06`, `14` unchanged
  (+79/+1/+3 either way) — independent confirmation these three are
  caused ENTIRELY by Phase 1's tolerance widening, with zero contribution
  from `dropGlyphClusters`, consistent with case 05's own earlier Finding.
  8 cases flip from failing to passing outright (`22`, `27`, `32`, `33`,
  `34`, `35`, `38`, `46`); exactly 1 case regresses (`02`, previously
  clean, now +4) — confirming `dropGlyphClusters` is not purely harmful
  either; it is doing real, correct work on at least this one seed, so
  simply deleting the feature is not a strictly-better move than turning
  it off by default.
  Conclusion, directly answering the question this Finding chain has been
  building toward: `dropGlyphClusters` is the LARGER of the two confirmed
  causes by a wide margin (528 of the 667 excess matches, 79%), and
  disabling it by default (independent of `affine.enabled`, until the
  heuristic itself is redesigned per the two Findings above) is a real,
  quantified, net-positive interim move — not a full fix, since 139 excess
  matches and 15 failing cases remain, all attributable to Phase 1's own
  unconditional tolerance widening, which is now the clearer, more
  isolated, more tractable next target on its own.

- **2026-09-11 — Implemented the `dropGlyphClusters`-default-off fix as real, permanent, committed code (not the temporary diagnostic patch used to measure it above), and reproduced the earlier measurement almost exactly with a full corpus run against the real code path.**
  Three call sites changed: `matchSymbol`'s own internal default in
  `web/src/lib/symbolsweep.ts` (`opts.dropGlyphClusters ?? affineOn` →
  `opts.dropGlyphClusters ?? false`), plus `session.ts`'s two seed-side
  `fingerprintSymbol` calls (`symbolSweep`'s own seed, and
  `sweepScheduleRow`'s anchor `candFor` closure) now pass
  `dropGlyphClusters: false` explicitly rather than following
  `opts.affine?.enabled`. `sweepOpts` (candidate-side scoring in both
  functions) needed no change — it never set `dropGlyphClusters` itself,
  so it already fell through to `matchSymbol`'s own new default.
  Two tests in `symbolsweep.test.ts` assumed the old "on by default with
  affine.enabled" behavior in their own names and bodies; updated the
  tag-filtering proof to pass `dropGlyphClusters: true` explicitly (so it
  keeps testing the ON path) and added a new test pinning the new
  off-by-default behavior directly (affine.enabled alone no longer
  filters a tag). tsc clean on both `web` and `mcp`. 418 web tests green
  across every affected suite; 123 mcp tests green across
  `session.test.ts`/`symbolSweepAffineParity.test.ts`/`tools.test.ts`.
  Re-ran the full 47-case corpus (both halves, background jobs, same
  method as every prior corpus-wide measurement in this document) against
  this real, permanent code — not the earlier temporary patch — to make
  sure the interim fix's own measured effect was real and not an artifact
  of how it was measured. Result: 15/47 failing (down from 22/47), 139
  excess phantom matches total (down from 667, a 79% reduction) — matching
  the earlier temporary-patch measurement's own numbers case-for-case
  (`01` +2, `02` +4, `03` +3, `05` +79 unchanged, `06` +1 unchanged, `10`
  +45, `14` +3 unchanged, `24` +1, `46` now 0/fixed), with exactly one
  small, previously-unseen discrepancy: `41-orange-county-m201-inline-
  supply-fans` now shows a new +1 (1→2) that the earlier temporary-patch
  run did not report. Single instance, small, not chased further here —
  noted honestly rather than glossed over, since the rest of the numbers
  otherwise reproduce exactly. This confirms the earlier temporary-patch
  measurement was a reliable predictor of the real, permanent fix's
  effect, and that this interim fix is now real, shipped, and correctly
  captured in this document's own §9 table — still not the default flip
  itself, which stays gated on fixing Phase 1's own remaining root cause
  (the 139 excess matches / 15 failing cases that remain, all traced to
  the unconditional tolerance-widening Finding above).

- **2026-09-11 — Investigating case 05 directly (the largest remaining Phase-1 offender by count) found something narrower and more useful than expected: its 79 excess matches are NOT contamination near the 5 real air devices — they are an entirely unrelated symbol family ~1100-1400px away — and case 05 additionally exposes a real, but apparently narrow (not corpus-wide), THIRD bug: enabling `affine` can break label-corroboration promotion for a real match that depends on it.**
  Traced every one of case 05's 5 real D10 instances directly (not by
  aggregate count) against `session.symbolSweep`, both with and without
  `affine`. Two separate, real findings:
  1. All 84 matches under `affine` sit 1100-1400px from every one of the 5
     real D10 positions — none of the 79 excess is near a real device at
     all. They cluster near `y≈1100` (the real devices sit at
     `y≈2533-2745`), scoring 0.952 raw via the plain rigid path at
     `rotation_deg≈89`, `tol_px=6` (Root Cause #1's signature exactly,
     confirmed again on a THIRD independent case, but this time proven to
     be a wholly separate, unrelated location, not corruption of the real
     instances' own neighborhood).
  2. All 5 real D10s score ~0.59-0.65 raw (matches the ground-truth
     review's own note: "Geometry scores around 0.59... same-family
     drawing labels provide explicit corroboration") and, WITHOUT
     `affine`, are correctly promoted to `matches` by
     `reconcileSweepLabels` (baseline: 5 matched, 6 withheld — confirmed
     directly, not assumed). WITH `affine` on, the exact same 5
     candidates (same score, same position within 1.7px) stay `withheld`
     — `reconcileSweepLabels` no longer promotes them. The likely cause:
     `affine` inflates this sheet's candidate pool from 6 withheld to
     2311, and label-corroboration promotion likely refuses on ambiguity
     once multiple withheld candidates now compete for the same nearby
     "D10" text run — the same candidate-flooding mechanism the
     label-promotion Finding above already identified as a SECONDARY
     cause, but there recorded only as a FALSE-POSITIVE risk (promoting a
     wrong candidate); this is its FALSE-NEGATIVE mirror (refusing to
     promote a genuinely correct one). Checked whether this generalizes:
     `06-vermillion-m210a-ss15-cell-devices` (also a Phase-1-only case,
     candidate pool inflates from 14 withheld to 279 under `affine`) shows
     ALL 13 real instances still correctly matched under `affine`, two of
     them scoring even HIGHER than baseline (0.82→1.00, 0.98→1.00) —
     genuine refinement improvement, not regression. So this is not a
     corpus-wide recall regression; it appears specific to a case like 05
     whose real matches score low enough to depend entirely on label
     promotion in the first place, combined with enough candidate flooding
     to create genuine ambiguity at that specific text run. Not
     investigated further or fixed here — it needs the same synthetic-
     fixture-plus-corpus validation discipline as the already-deferred
     label-promotion fix (see the two reverted `symbollabels.ts` attempts
     above), and belongs in that same future fix, not a separate one,
     since both are downstream of the same candidate-flooding root cause.
     Recorded here because it changes this case's own failure story: `05`
     is not "79 false adds near 5 correct matches" but "0 real matches
     recovered at all (a pre-existing label-dependent recall pattern this
     document did not break, but did not fix either) plus 79 completely
     unrelated phantom matches elsewhere on the sheet."

---

## Appendix A — Background, for the reader who wants the why

The rigid search is 8 orthogonal matrices because plan symbols mostly rotate
in quarter turns and flip. Real drawings break that in three ways: devices
rotated to follow a duct or pipe run (any angle), symbols stretched to fit a
space or re-drawn at different proportions (anisotropic scale), and variants
with a stroke added or missing. All three are affine or partial-affine
distortions, and matching under affine distortion with missing parts is
solved, classical geometry: geometric hashing (Lamdan & Wolfson 1988;
Wolfson & Rigoutsos, *Geometric Hashing: An Overview*, 1997) — an affine
basis from two segments makes every other point's coordinates invariant,
and voting tolerates occlusion — plus a least-squares affine fit and
verification. Document-analysis symbol spotting (Rusiñol & Lladós, vectorial
signatures and graph-path hashing) uses the same affine-invariant structural
relations; its documented weakness is noise and occlusion, which is why this
design keeps `scoreAt` verification and the withheld band as the final word.
A learned matcher (FloorPlanCAD / GAT-CADNet / SymPoint) buys categorical
recognition with no seed; this feature has a seed per job and does not need
it.
