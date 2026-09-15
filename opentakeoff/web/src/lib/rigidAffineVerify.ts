// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 5 — "robust rigid/affine
// verification on isolated support." FIRST slice: requirements 1-3 only
// ("fit transformations using isolated candidate primitives," "keep
// current rigid symmetries as the first verifier," "run bounded affine
// refinement only when rigid evidence is insufficient"), verifying ONE
// candidate's own isolated support (a Phase 4 `OwnedBody`, or any real
// primitive-id set) against ONE reference shape's own primitive set.
//
// AUDITED BEFORE BUILDING (this checkpoint's own dedicated investigation,
// see PROGRESS.md): a large, mature, separately-goaled production system
// (symbolsweep.ts + symbolAffine.ts, docs/SYMBOL-SWEEP-AFFINE-GOAL.md,
// its own real "47-case default gate" this Phase's own gate explicitly
// says must not regress) ALREADY does rigid+affine symbol matching, but
// on a DIFFERENT data representation (`segs: number[]`, sheet-wide seed-
// vs-sheet placement search) and with production-specific behavior
// (`matchSymbol`'s own default is RIGID-ONLY; production's real affine-on
// behavior lives in `Session`'s own wrapper, not in `matchSymbol` itself —
// a real, previously-documented trap in this exact project, PROGRESS.md's
// own "Jonesboro Heat Pump Upgrades" entry, from calling it raw). Calling
// that system's own `fingerprintSymbol`/`matchSymbol` as a black box for
// Phase 5 would reproduce that exact trap and rely on code paths its own
// 47-case gate never exercises (verifying one already-isolated candidate
// against one reference, not a sheet-wide seed search).
//
// REUSED, safely (zero coupling, zero risk to the existing gate — pure,
// side-effect-free math with no dependency on segs/EndpointGrid/
// SweepOptions, confirmed by direct inspection): symbolAffine.ts's own
// `fitAffine`, `decomposeAffine`, `affineWithinBounds`,
// `AFFINE_MIN_SINGULAR`, `DEFAULT_AFFINE_BOUNDS`. Importing these changes
// nothing about symbolsweep.ts/symbolAffine.ts's own behavior for their
// existing callers.
//
// NOT reused (real, disclosed reasons, not merely "didn't get to it"):
// - `symbolsweep.ts`'s own 8-fixed-rigid-matrix table (`transformsFor`)
//   is module-private, not exported — `RIGID_TRANSFORMS` below is the
//   same well-known matrix group, reimplemented as new code (reusing the
//   IDEA, not the code, since importing it is not possible without
//   modifying that module).
// - `symbolAffine.ts`'s own `gatherCorrespondences` is coupled to
//   `symbolsweep.ts`'s own `EndpointGrid` and is ONE-DIRECTIONAL (seed to
//   sheet only) — Phase 5 requirement 5 explicitly asks for INJECTIVE/
//   MUTUAL-NEAREST correspondence (both directions must agree), which
//   this module builds fresh below (`mutualNearestCorrespondences`)
//   rather than adapting a one-directional gatherer built for a
//   different (rigid-guess-then-search-a-radius) use case.
//
// Deliberately NOT attempted in this first slice (disclosed, real
// further work — the rest of requirement 4's own list, and requirements
// 6-9):
// - Requirement 4's own FULL "reference-to-candidate + candidate-to-
//   reference coverage, distinctive primitive coverage, junction/cycle/
//   port consistency" — only a basic mutual-inlier-fraction coverage is
//   computed here, not the full richer signal set.
// - Requirement 6 (topology contradictions: missing cycle, wrong port
//   count, leader/carrier-attachment consistency) — needs Lane C leader-
//   following (still unbuilt) and a real notion of "port," neither
//   exists yet.
// - Requirement 7 (richer/poorer variant suppression via ownership) —
//   this module verifies ONE candidate against ONE reference; comparing
//   MULTIPLE candidate variants against each other is not attempted.
// - Requirement 8's FULL calibrated evidence-state enum (nine states:
//   exact_vector_identity, verified_rigid, verified_affine,
//   tag_corroborated_review, legend_corroborated_review, text_only,
//   ambiguous_variant, ownership_conflict, incomplete) — this slice
//   reports a real but much smaller subset (see `VerificationState`
//   below); the other six states need tag/legend/schedule infrastructure
//   from other phases/lanes this slice does not touch.
// - Requirement 9 (ablation logging per signal).
// - Running or verifying the EXISTING 47-case production gate itself —
//   out of scope for this slice (a live, separately-owned system); this
//   module never imports or calls symbolsweep.ts, so there is no code
//   path by which this work can regress it.
import type { VectorSceneIndex } from "./vectorSceneIndex.ts";
import { fitAffine, decomposeAffine, affineWithinBounds, DEFAULT_AFFINE_BOUNDS, type AffineBounds } from "./symbolAffine.ts";

export type Point = [number, number];
export type Mat2 = readonly [number, number, number, number];

/** The 8 fixed rigid symmetries (0/90/180/270° × horizontal mirror) —
 *  the same well-known discrete group symbolsweep.ts's own (private,
 *  unexported) `transformsFor` uses; reimplemented here as new code (see
 *  this module's own header for why it could not be imported). Row-major
 *  `[a,b,c,d]` meaning `[[a,b],[c,d]]`, applied as `x'=a*x+b*y,
 *  y'=c*x+d*y` — the same convention `symbolAffine.ts`'s own `AffineFit.m`
 *  already uses, so a rigid guess and a fitted affine share one shape. */
export interface RigidTransform { readonly m: Mat2; readonly label: string; }
export const RIGID_TRANSFORMS: readonly RigidTransform[] = [
  { m: [1, 0, 0, 1], label: "identity" },
  { m: [0, -1, 1, 0], label: "rot90" },
  { m: [-1, 0, 0, -1], label: "rot180" },
  { m: [0, 1, -1, 0], label: "rot270" },
  { m: [-1, 0, 0, 1], label: "mirror" },
  { m: [0, 1, 1, 0], label: "mirror_rot90" },
  { m: [1, 0, 0, -1], label: "mirror_rot180" },
  { m: [0, -1, -1, 0], label: "mirror_rot270" },
];

/** Disclosed default: how close (px, in the sheet's own image-px space)
 *  a transformed reference point and its mutually-nearest candidate
 *  point must land to count as a real inlier — not tuned against real
 *  corpus geometry yet, this slice's own scope is the mechanism. */
export const DEFAULT_INLIER_TOLERANCE_PX = 3;
/** Disclosed default: the minimum fraction of the SMALLER shape's own
 *  point count that must be real mutual inliers before a rigid transform
 *  is accepted outright (requirement 2's own "first verifier"). */
export const DEFAULT_RIGID_INLIER_FRACTION = 0.6;
/** Real-corpus finding, not a hypothetical: validating this module
 *  against the CURRENT pipeline's own predicted bodies for Cherry Point's
 *  CD-1 family (still badly fragmented by Phase 4's own open gate 3 — 3-5
 *  primitives against a real ~64-214-primitive symbol) surfaced a
 *  genuine degenerate case a fraction-only threshold cannot catch: 1-2
 *  points carry no real shape at all, so a 1-point candidate against a
 *  1-point reference trivially "verifies rigid" at inlierFraction 1.0 —
 *  every rigid transform maps a single point onto its own image with
 *  zero real geometric constraint. Below this absolute floor, the result
 *  is honestly `insufficient_evidence` regardless of the fraction. 3 is
 *  the minimum point count that constrains a 2D rigid transform beyond a
 *  translation (2 points still leave an unresolved mirror ambiguity). */
export const DEFAULT_MIN_ABSOLUTE_SUPPORT = 3;

export type VerificationState = "verified_rigid" | "verified_affine" | "insufficient_evidence";

export interface VerificationResult {
  state: VerificationState;
  /** present iff state is verified_rigid or verified_affine. */
  transform?: Mat2;
  transformLabel?: string;
  tx?: number;
  ty?: number;
  inlierCount: number;
  /** the smaller of the candidate's/reference's own point count — the
   *  denominator `inlierCount` is measured against. */
  comparedAgainst: number;
  /** RMS residual, px, over the inliers actually used for the reported
   *  transform — null when no transform was accepted at all. */
  residual: number | null;
}

function midpointOf(idx: VectorSceneIndex, primitiveId: number): Point {
  const p = idx.primitives[primitiveId];
  return [(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2];
}

/** Pure: every primitive in `primitiveIds`, represented by its own
 *  midpoint — one representative point per primitive, avoiding the
 *  endpoint-order ambiguity a mirrored transform would otherwise create
 *  (which of a primitive's own two endpoints is "first" is an
 *  extraction-order artifact, not real geometry). Never mutates `idx`. */
export function primitiveMidpoints(idx: VectorSceneIndex, primitiveIds: readonly number[]): Point[] {
  return primitiveIds.map((pid) => midpointOf(idx, pid));
}

function centroidOf(points: readonly Point[]): Point {
  let sx = 0, sy = 0;
  for (const [x, y] of points) { sx += x; sy += y; }
  return [sx / points.length, sy / points.length];
}

function applyMat2(m: Mat2, p: Point): Point {
  return [m[0] * p[0] + m[1] * p[1], m[2] * p[0] + m[3] * p[1]];
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Pure: for two point sets already in a COMMON frame (both centroid-
 *  relative, one optionally pre-transformed), finds MUTUAL nearest-
 *  neighbor pairs — requirement 5's own "injective/mutual-nearest
 *  correspondence checks," built fresh rather than adapted from
 *  symbolAffine.ts's own one-directional `gatherCorrespondences` (see
 *  this module's own header). A pair (i, j) survives only when j is i's
 *  own nearest point in `bs` AND i is j's own nearest point in `as` —
 *  real mutual agreement, not a one-sided nearest-neighbor guess that a
 *  many-to-one collapse (several `as` points all claiming the same `bs`
 *  point) could otherwise produce. */
export function mutualNearestCorrespondences(
  as: readonly Point[],
  bs: readonly Point[],
): Array<{ aIndex: number; bIndex: number; distance: number }> {
  if (as.length === 0 || bs.length === 0) return [];
  const nearestB = as.map((a) => {
    let best = 0, bestD = Infinity;
    for (let j = 0; j < bs.length; j++) { const d = dist(a, bs[j]); if (d < bestD) { bestD = d; best = j; } }
    return { j: best, d: bestD };
  });
  const nearestA = bs.map((b) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < as.length; i++) { const d = dist(as[i], b); if (d < bestD) { bestD = d; best = i; } }
    return { i: best, d: bestD };
  });
  const out: Array<{ aIndex: number; bIndex: number; distance: number }> = [];
  for (let i = 0; i < as.length; i++) {
    const { j, d } = nearestB[i];
    if (nearestA[j].i === i) out.push({ aIndex: i, bIndex: j, distance: d });
  }
  return out;
}

/** Pure: verifies `candidatePrimitiveIds` (Phase 4's own isolated
 *  support — an `OwnedBody`'s own `primitiveIds`, or any real primitive
 *  set) against `referencePrimitiveIds` (another instance's own owned
 *  body, or eventually a Lane E reference-bank entry's own primitive
 *  set). Never mutates `idx`. Requirement 2 first: tries each of the 8
 *  fixed rigid symmetries; requirement 3 only when none of them reaches
 *  `rigidInlierFraction`: attempts one bounded affine refinement via
 *  symbolAffine.ts's own already-tested fit/decompose/bounds-check,
 *  seeded from the BEST rigid guess's own mutual correspondences (even
 *  if below threshold, as long as `fitAffine`'s own minimum of 3
 *  survives). */
export function verifyIsolatedSupport(
  idx: VectorSceneIndex,
  candidatePrimitiveIds: readonly number[],
  referencePrimitiveIds: readonly number[],
  opts: { inlierTolerance?: number; rigidInlierFraction?: number; affineBounds?: AffineBounds; minAbsoluteSupport?: number } = {},
): VerificationResult {
  const tolerance = opts.inlierTolerance ?? DEFAULT_INLIER_TOLERANCE_PX;
  const rigidFraction = opts.rigidInlierFraction ?? DEFAULT_RIGID_INLIER_FRACTION;
  const bounds = opts.affineBounds ?? DEFAULT_AFFINE_BOUNDS;
  const minAbsoluteSupport = opts.minAbsoluteSupport ?? DEFAULT_MIN_ABSOLUTE_SUPPORT;
  const comparedAgainst = Math.min(candidatePrimitiveIds.length, referencePrimitiveIds.length);

  if (candidatePrimitiveIds.length === 0 || referencePrimitiveIds.length === 0) {
    return { state: "insufficient_evidence", inlierCount: 0, comparedAgainst, residual: null };
  }
  // real-corpus finding (see DEFAULT_MIN_ABSOLUTE_SUPPORT's own comment):
  // too few points to constrain a rigid/affine transform at all, however
  // well they happen to fit — never a false "verified" on a vacuous match.
  if (comparedAgainst < minAbsoluteSupport) {
    return { state: "insufficient_evidence", inlierCount: 0, comparedAgainst, residual: null };
  }

  const candPoints = primitiveMidpoints(idx, candidatePrimitiveIds);
  const refPoints = primitiveMidpoints(idx, referencePrimitiveIds);
  const candCentroid = centroidOf(candPoints);
  const refCentroid = centroidOf(refPoints);
  const candRel = candPoints.map((p): Point => [p[0] - candCentroid[0], p[1] - candCentroid[1]]);
  const refRel = refPoints.map((p): Point => [p[0] - refCentroid[0], p[1] - refCentroid[1]]);

  let best: { transform: RigidTransform; pairs: Array<{ aIndex: number; bIndex: number; distance: number }>; inliers: number; rms: number } | null = null;
  for (const rt of RIGID_TRANSFORMS) {
    const transformedRef = refRel.map((p) => applyMat2(rt.m, p));
    const pairs = mutualNearestCorrespondences(transformedRef, candRel);
    const inlierPairs = pairs.filter((pr) => pr.distance <= tolerance);
    const rms = inlierPairs.length ? Math.sqrt(inlierPairs.reduce((s, pr) => s + pr.distance * pr.distance, 0) / inlierPairs.length) : Infinity;
    if (!best || inlierPairs.length > best.inliers || (inlierPairs.length === best.inliers && rms < best.rms)) {
      best = { transform: rt, pairs, inliers: inlierPairs.length, rms };
    }
  }
  // best is never null here: RIGID_TRANSFORMS is a non-empty constant.

  if (best!.inliers / comparedAgainst >= rigidFraction) {
    return {
      state: "verified_rigid",
      transform: best!.transform.m, transformLabel: best!.transform.label,
      tx: candCentroid[0] - (best!.transform.m[0] * refCentroid[0] + best!.transform.m[1] * refCentroid[1]),
      ty: candCentroid[1] - (best!.transform.m[2] * refCentroid[0] + best!.transform.m[3] * refCentroid[1]),
      inlierCount: best!.inliers, comparedAgainst, residual: Number.isFinite(best!.rms) ? best!.rms : null,
    };
  }

  // requirement 3: bounded affine refinement, seeded from the best rigid
  // guess's own mutual correspondences (transformed-ref-relative,
  // cand-relative — both already centroid-relative, so fitAffine's own
  // fitted `tx,ty` here is measured in that SAME relative frame; a caller
  // wanting sheet-space `tx,ty` must add the two centroids back in,
  // exactly as the rigid branch above does for its own `tx,ty`).
  const seedPairs = best!.pairs.map((pr): [number, number, number, number] => {
    const rp = applyMat2(best!.transform.m, refRel[pr.aIndex]);
    return [rp[0], rp[1], candRel[pr.bIndex][0], candRel[pr.bIndex][1]];
  });
  const fit = fitAffine(seedPairs);
  if (fit) {
    const decomp = decomposeAffine(fit.m);
    if (affineWithinBounds(decomp, bounds, 1)) {
      // compose: candidate ≈ fit.m · (rigidGuess · refRel) + fit.tx,ty
      const composed: Mat2 = [
        fit.m[0] * best!.transform.m[0] + fit.m[1] * best!.transform.m[2],
        fit.m[0] * best!.transform.m[1] + fit.m[1] * best!.transform.m[3],
        fit.m[2] * best!.transform.m[0] + fit.m[3] * best!.transform.m[2],
        fit.m[2] * best!.transform.m[1] + fit.m[3] * best!.transform.m[3],
      ];
      return {
        state: "verified_affine",
        transform: composed, transformLabel: `affine(${best!.transform.label})`,
        tx: candCentroid[0] + fit.tx - (composed[0] * refCentroid[0] + composed[1] * refCentroid[1]),
        ty: candCentroid[1] + fit.ty - (composed[2] * refCentroid[0] + composed[3] * refCentroid[1]),
        inlierCount: fit.n, comparedAgainst, residual: fit.rms,
      };
    }
  }

  return { state: "insufficient_evidence", inlierCount: best!.inliers, comparedAgainst, residual: Number.isFinite(best!.rms) ? best!.rms : null };
}
