// Symbol Sweep — affine refinement (Phase 1 of docs/SYMBOL-SWEEP-AFFINE-GOAL.md).
// Pure, no PDF/DOM, node-testable — the same convention as symbolsweep.ts and
// legendlearn.ts. Closed-form least squares only: no numeric dependency.
//
// symbolsweep.ts's rigid search proposes a placement under one of 8 fixed
// 0/90/180/270°×mirror matrices. When a symbol is drawn rotated off-grid,
// stretched anisotropically, or sheared, the rigid matrix places some
// endpoints outside `tolPx` even though the CORRESPONDENCE (which sheet
// endpoint answers for which seed endpoint) is still recoverable near that
// rigid guess. This module takes those correspondences and fits the actual
// affine transform, so `scoreAt` (symbolsweep.ts's own scoring — it already
// accepts an arbitrary 2×2, see its header) can be re-run at the FITTED
// matrix instead of the nearest rigid one.
//
// Three pieces, used in order by matchSymbol's Phase 1 wiring:
//   1. gatherCorrespondences — near a rigid guess, pair up seed endpoints
//      with the sheet endpoints most likely to be the same physical corner.
//   2. fitAffine — closed-form least squares over those pairs, two-pass IRLS
//      to drop outlier correspondences (a missing/extra stroke, a nearby
//      unrelated line the search radius caught).
//   3. decomposeAffine / affineWithinBounds — turn the fitted 2×2 into
//      disclosable numbers (rotation/scale/shear/mirror) and check them
//      against a stated bound, so an out-of-bounds fit can be withheld with
//      a reason instead of silently committed. See docs/SYMBOL-SWEEP-AFFINE-
//      GOAL.md §2 for the exact math this implements and why.

import type { EndpointGrid } from "./symbolsweep.ts";

/** A fitted affine placement: `p' = m·p + [tx,ty]`, `m` a general 2×2
 * `[a,b,c,d]` meaning `[[a,b],[c,d]]` (same row-major convention as
 * symbolsweep.ts's `apply`/`Xform`, not necessarily orthogonal). */
export interface AffineFit {
  m: [number, number, number, number];
  tx: number;
  ty: number;
  /** RMS residual of the fit, px, over the surviving correspondences. */
  rms: number;
  /** Correspondence count the final fit was computed from (post-IRLS). */
  n: number;
}

/** The fitted matrix, decomposed into disclosable numbers (§2.2). */
export interface AffineDecomp {
  /** Degrees CW, image space (y down), normalised to [0, 360). */
  rotation_deg: number;
  /** Scale along the seed's own local x / y axes (§2.2's "simpler and
   * acceptable" column-norm definition) — 1.0 means "as drawn on the seed
   * sheet" BEFORE any stated uniform scale ratio is divided out. */
  scale_x: number;
  scale_y: number;
  /** Deviation from a right angle between the seed's transformed axes,
   * degrees. 0 for a pure rotation/scale. */
  shear_deg: number;
  mirrored: boolean;
}

export interface AffineBounds {
  /** Default 1.5 — each of scale_x, scale_y (after dividing out the stated
   * uniform scale) must fall in [1/maxStretch, maxStretch]. */
  maxStretch: number;
  /** Default 10 — |shear_deg| must not exceed this. */
  maxShearDeg: number;
}

export const DEFAULT_AFFINE_BOUNDS: AffineBounds = { maxStretch: 1.5, maxShearDeg: 10 };

/** The smallest singular value a fitted matrix may carry along ANY direction
 * before the fit itself is refused as numerically degenerate, rather than
 * merely disclosed as out-of-bounds. Well below `1/DEFAULT_AFFINE_BOUNDS
 * .maxStretch` (0.667): a real 1.5×–5× compression is still a legitimate,
 * DISCLOSED out-of-bounds fit (§4.2) — this only catches a fit that has
 * collapsed the symbol onto a point or a line, where the reported score
 * means nothing (see `fitAffine`'s own doc comment for the mechanism this
 * closes: docs/SYMBOL-SWEEP-AFFINE-GOAL.md's successor Findings,
 * 2026-09-11 — a `scale_x: 0, scale_y: 0, rms_px: 0` fit scored 1.0). */
export const AFFINE_MIN_SINGULAR = 0.2;

/** Singular values `[sMax, sMin]` of the 2×2 matrix `m = [a,b,c,d]`
 * (row-major, `[[a,b],[c,d]]`), closed form via the eigenvalues of the
 * symmetric `mᵀm`. Pure, never NaN for finite input — the two eigenvalues of
 * a symmetric PSD 2×2 are always real and non-negative (the `Math.max(0, …)`
 * guards are belt-and-braces against floating-point underflow, not a real
 * branch). Shared by `decomposeAffine` (its own `s1, s2`, the singular
 * values of `P` in the polar decomposition `m = R·P`, are exactly these) and
 * by `fitAffine`'s own degeneracy check — factored out so the two never
 * drift out of agreement. */
export function affineSingularValues(m: readonly [number, number, number, number]): [number, number] {
  const [a, b, c, d] = m;
  const p = a * a + c * c, q = a * b + c * d, r = b * b + d * d;
  const mid = (p + r) / 2, half = Math.sqrt(Math.max(0, ((p - r) / 2) ** 2 + q * q));
  return [Math.sqrt(Math.max(0, mid + half)), Math.sqrt(Math.max(0, mid - half))];
}

/** §2.1 — least-squares affine from correspondences, 2-pass IRLS.
 *
 * `pairs` are `[sx, sy, qx, qy]`: a seed point in centroid-relative
 * (canonical) coordinates paired with the sheet point it is hypothesised to
 * correspond to. `weights`, when given, carries an initial per-pair
 * confidence through BOTH passes (pass 2 multiplies it by the survive/drop
 * mask, never replaces it).
 *
 * Returns `null` when fewer than 3 correspondences are given, when the
 * scatter is degenerate (collinear points — `|det S| < 1e-6·trace(S)²`), or
 * when fewer than 3 correspondences survive the second pass. Never throws:
 * a caller on the hot matching path treats "can't fit" as "keep the rigid
 * result", not an error. */
export function fitAffine(
  pairs: ReadonlyArray<readonly [number, number, number, number]>,
  weights?: ReadonlyArray<number>,
): AffineFit | null {
  if (pairs.length < 3) return null;
  const w0 = weights ?? pairs.map(() => 1);
  if (w0.length !== pairs.length) throw new Error(`fitAffine: ${w0.length} weights for ${pairs.length} pairs`);

  const solve = (
    pts: ReadonlyArray<readonly [number, number, number, number]>,
    ws: ReadonlyArray<number>,
  ): AffineFit | null => {
    let sw = 0, sxs = 0, sys = 0, sxq = 0, syq = 0;
    for (let i = 0; i < pts.length; i++) {
      const w = ws[i];
      sw += w; sxs += w * pts[i][0]; sys += w * pts[i][1]; sxq += w * pts[i][2]; syq += w * pts[i][3];
    }
    if (sw <= 0) return null;
    const sBarX = sxs / sw, sBarY = sys / sw, qBarX = sxq / sw, qBarY = syq / sw;
    let Sxx = 0, Sxy = 0, Syy = 0; // scatter S, symmetric — Syx === Sxy
    let Cxx = 0, Cxy = 0, Cyx = 0, Cyy = 0; // cross-covariance C, not generally symmetric
    for (let i = 0; i < pts.length; i++) {
      const w = ws[i];
      const dsx = pts[i][0] - sBarX, dsy = pts[i][1] - sBarY;
      const dqx = pts[i][2] - qBarX, dqy = pts[i][3] - qBarY;
      Sxx += w * dsx * dsx; Sxy += w * dsx * dsy; Syy += w * dsy * dsy;
      Cxx += w * dqx * dsx; Cxy += w * dqx * dsy; Cyx += w * dqy * dsx; Cyy += w * dqy * dsy;
    }
    const trace = Sxx + Syy;
    const detS = Sxx * Syy - Sxy * Sxy;
    if (Math.abs(detS) < 1e-6 * trace * trace) return null; // collinear / degenerate — refuse per §2.1
    const iSxx = Syy / detS, iSxy = -Sxy / detS, iSyy = Sxx / detS; // S⁻¹, closed-form 2×2 inverse
    const a = Cxx * iSxx + Cxy * iSxy;
    const b = Cxx * iSxy + Cxy * iSyy;
    const c = Cyx * iSxx + Cyy * iSxy;
    const d = Cyx * iSxy + Cyy * iSyy;
    const tx = qBarX - (a * sBarX + b * sBarY);
    const ty = qBarY - (c * sBarX + d * sBarY);
    // Rank-deficient RESULT, refused exactly as a collinear SOURCE is refused
    // above (the `detS` check). When every seed endpoint's nearest sheet
    // endpoint within the search radius is the same vertex (or all lie on one
    // line), the source scatter is still full-rank (several DISTINCT seed
    // endpoints) but the least-squares solve collapses the fitted matrix
    // itself onto a point or a line: `m ≈ 0` (or rank 1), `rms ≈ 0`. A
    // caller's own `scoreAtTol`/`scoreAt` then treats the resulting
    // zero-length chord as trivially "covering" any nearby sheet segment,
    // producing a perfect score for a fit that explains nothing.
    if (affineSingularValues([a, b, c, d])[1] < AFFINE_MIN_SINGULAR) return null;
    let sumSq = 0;
    for (const p of pts) {
      const px = a * p[0] + b * p[1] + tx, py = c * p[0] + d * p[1] + ty;
      const ex = px - p[2], ey = py - p[3];
      sumSq += ex * ex + ey * ey;
    }
    const rms = Math.sqrt(sumSq / pts.length);
    return { m: [a, b, c, d], tx, ty, rms, n: pts.length };
  };

  const pass1 = solve(pairs, w0);
  if (!pass1) return null;

  // Pass 2: drop any correspondence whose pass-1 residual exceeds 3·rms —
  // a missing/extra stroke or an unrelated nearby line the search radius
  // caught, not the real corner. Refit on the survivors only, preserving
  // each survivor's ORIGINAL weight (never flattened to 1).
  const survivorPairs: Array<readonly [number, number, number, number]> = [];
  const survivorWeights: number[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    const px = pass1.m[0] * p[0] + pass1.m[1] * p[1] + pass1.tx;
    const py = pass1.m[2] * p[0] + pass1.m[3] * p[1] + pass1.ty;
    const resid = Math.hypot(px - p[2], py - p[3]);
    if (resid <= 3 * pass1.rms) { survivorPairs.push(p); survivorWeights.push(w0[i]); }
  }
  if (survivorPairs.length < 3) return null;
  return solve(survivorPairs, survivorWeights);
}

/** §2.2 — polar-style decomposition `m = R·P`, `R` a rotation (or
 * reflection folded out first) and `P` symmetric positive-definite, via the
 * closed-form eigendecomposition of the symmetric 2×2 `m'ᵀm'`. Never
 * throws: a degenerate (zero/near-singular) `m` reports `rotation_deg: 0`
 * rather than NaN — callers gate on `affineWithinBounds`, which such a
 * fit will fail anyway (a near-zero scale is never within `[1/maxStretch,
 * maxStretch]`). */
export function decomposeAffine(m: readonly [number, number, number, number]): AffineDecomp {
  const [ma, mb, mc, md] = m;
  const det = ma * md - mb * mc;
  const mirrored = det < 0;
  // Fold the mirror out first, matching transformsFor's own convention
  // (x → −x before rotation): m' = mirrored ? m·diag(−1,1) : m.
  const a = mirrored ? -ma : ma, b = mb, c = mirrored ? -mc : mc, d = md;

  // scale_x, scale_y, shear_deg: the doc's "simpler and acceptable"
  // definitions — the length of, and angle between, m'·[1,0] = (a,c) and
  // m'·[0,1] = (b,d), the seed's own transformed local axes.
  const scaleX = Math.hypot(a, c), scaleY = Math.hypot(b, d);
  let angleBetweenDeg = 90;
  if (scaleX > 1e-9 && scaleY > 1e-9) {
    const cosAngle = Math.max(-1, Math.min(1, (a * b + c * d) / (scaleX * scaleY)));
    angleBetweenDeg = Math.acos(cosAngle) * 180 / Math.PI;
  }
  const shearDeg = 90 - angleBetweenDeg;

  // rotation_deg: the true polar-decomposition R = m'·P⁻¹, via the
  // eigendecomposition of the symmetric P² = m'ᵀm' = [[a²+c², ab+cd],
  // [ab+cd, b²+d²]]. Standard closed-form symmetric-2×2 eigensolve: the
  // eigenvector angle is φ = ½·atan2(2q, p−r); the eigenvalues themselves
  // are `affineSingularValues`' own s1/s2 (P's eigenvalues ARE m's singular
  // values), shared rather than re-derived so the two never drift apart.
  const p = a * a + c * c, q = a * b + c * d, r = b * b + d * d;
  const phi = 0.5 * Math.atan2(2 * q, p - r);
  const [s1, s2] = affineSingularValues([a, b, c, d]);
  const cphi = Math.cos(phi), sphi = Math.sin(phi);
  // P = V·diag(s1,s2)·Vᵀ, V = [[cphi,-sphi],[sphi,cphi]] — expanded closed-form.
  const P11 = cphi * cphi * s1 + sphi * sphi * s2;
  const P12 = cphi * sphi * (s1 - s2);
  const P22 = sphi * sphi * s1 + cphi * cphi * s2;
  const detP = P11 * P22 - P12 * P12;
  let rotationDeg = 0;
  if (Math.abs(detP) > 1e-12) {
    const iP11 = P22 / detP, iP12 = -P12 / detP, iP22 = P11 / detP; // P⁻¹, symmetric
    const R00 = a * iP11 + b * iP12; // R = m'·P⁻¹
    const R10 = c * iP11 + d * iP12;
    rotationDeg = Math.atan2(R10, R00) * 180 / Math.PI;
  }
  rotationDeg = ((rotationDeg % 360) + 360) % 360;

  return {
    rotation_deg: Math.round(rotationDeg * 10) / 10,
    scale_x: Math.round(scaleX * 1000) / 1000,
    scale_y: Math.round(scaleY * 1000) / 1000,
    shear_deg: Math.round(shearDeg * 10) / 10,
    mirrored,
  };
}

/** §2.3 — bounds check. `statedScale` is the caller's existing `opts.scale`
 * uniform ratio (default 1): `decomp.scale_x`/`scale_y` are divided by it
 * before the stretch bound is applied, so a symbol correctly matched across
 * a stated 12× detail-to-plan ratio does not read as itself "stretched
 * 12×". `mirror` is not re-checked here — it follows `opts.mirror` exactly
 * as today, enforced upstream by which rigid transforms were ever tried. */
export function affineWithinBounds(decomp: AffineDecomp, bounds: AffineBounds, statedScale: number): boolean {
  const sx = decomp.scale_x / statedScale, sy = decomp.scale_y / statedScale;
  const lo = 1 / bounds.maxStretch, hi = bounds.maxStretch;
  if (sx < lo || sx > hi || sy < lo || sy > hi) return false;
  if (Math.abs(decomp.shear_deg) > bounds.maxShearDeg) return false;
  return true;
}

/** §3 Phase 1 step 1 — for each DISTINCT seed endpoint (in `rel`'s
 * centroid-relative coordinates), find the sheet endpoint most likely to be
 * its physical counterpart: transform the seed endpoint by the current best
 * RIGID guess `(m0, tx, ty)`, then take the nearest sheet endpoint within
 * `radius` (the caller passes `6·tol` per §3) using the sheet's own
 * `EndpointGrid`. Skips a seed endpoint entirely — no correspondence, not a
 * bad one — when the search is ambiguous: two DISTINCT sheet endpoints
 * within `radius` whose distances to the query are themselves within
 * `radius/6` (`tol`) of each other, i.e. genuinely too close to call.
 * Duplicate representations of the very same physical corner (several
 * segments sharing a vertex) are not "distinct" and never trigger this. */
export function gatherCorrespondences(
  rel: ReadonlyArray<ReadonlyArray<number>>,
  m0: readonly [number, number, number, number],
  tx: number,
  ty: number,
  segs: ReadonlyArray<number>,
  grid: EndpointGrid,
  radius: number,
): Array<[number, number, number, number]> {
  const tol = radius / 6;
  const seedPts: Array<[number, number]> = [];
  const seen = new Set<string>();
  for (const r of rel) {
    for (const p of [[r[0], r[1]], [r[2], r[3]]] as Array<[number, number]>) {
      const key = `${p[0].toFixed(2)}:${p[1].toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      seedPts.push(p);
    }
  }

  const out: Array<[number, number, number, number]> = [];
  const scratch: number[] = [];
  for (const [sx, sy] of seedPts) {
    const qx = m0[0] * sx + m0[1] * sy + tx;
    const qy = m0[2] * sx + m0[3] * sy + ty;
    const near = grid.near(qx, qy, scratch);
    const cands: Array<{ x: number; y: number; d: number }> = [];
    for (const j of near) {
      for (const [ex, ey] of [
        [segs[j * 4], segs[j * 4 + 1]],
        [segs[j * 4 + 2], segs[j * 4 + 3]],
      ] as Array<[number, number]>) {
        const d = Math.hypot(ex - qx, ey - qy);
        if (d <= radius) cands.push({ x: ex, y: ey, d });
      }
    }
    if (!cands.length) continue;
    cands.sort((p, q) => p.d - q.d);
    const distinct: typeof cands = [];
    for (const c of cands) {
      if (distinct.some((e) => Math.hypot(e.x - c.x, e.y - c.y) <= 1e-6)) continue;
      distinct.push(c);
      if (distinct.length >= 2) break;
    }
    if (distinct.length >= 2 && distinct[1].d - distinct[0].d <= tol) continue; // ambiguous — skip
    out.push([sx, sy, distinct[0].x, distinct[0].y]);
  }
  return out;
}
