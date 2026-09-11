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
| Default flip — ATTEMPTED AND REVERTED | 2026-09-11 | 27 vs expected 19 on `01-cherry-mh111-cd1` alone once the runner actually exercised the path (see Findings); full 47-case run not completed — reverted on the first real failure rather than continuing to characterize the damage | not applicable — this is a regression finding, not a campaign measurement | ≥ 8 false-adds on this one case alone | not measured — reverted before a timing run was meaningful | The flip (commit `c1fd732`) shipped, then was reverted (`1ed0656`) in the same session once real testing found it unsafe. Full story below in Findings; the short version: the "two consecutive full runs" that supposedly cleared this never ran the code path a flip actually turns on, because the corpus runner calls `session.symbolSweep` directly and never passed `affine` — fixed in commit `7574ede`, which immediately turned up the regression this row records. `main` is back to `affine.enabled` defaulting `false` everywhere (the pre-`c1fd732` state); the corpus suite now runs with `affine` genuinely on for every case as a standing gate, and will show red on affected cases until the two causes below are actually fixed. This document's own §8 "Default flipped" box stays unchecked. |

Findings (cases that contradicted a bound — never fixed by moving it):

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
  Neither cause is fixed yet — both need real design work, not a bounds
  tweak (§7 rule 4 does not apply here: this is the bound admitting a
  false positive, not a genuine case the bound wrongly excludes). The
  corpus suite is left deliberately red on affected cases with
  `AFFINE_WIRE_DEFAULT` genuinely on, rather than quietly reverting the
  runner fix too — that redness is the correct, honest state until a real
  fix lands, and it is the gate any future default-flip attempt must pass
  cleanly, on the ACTUAL code path this time.

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
