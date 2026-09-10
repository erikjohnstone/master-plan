// Phase 1 of docs/SYMBOL-SWEEP-AFFINE-GOAL.md — pure math, no sheet geometry
// needed for most of these; gatherCorrespondences alone touches the sheet
// via symbolsweep.ts's EndpointGrid.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fitAffine, decomposeAffine, affineWithinBounds, gatherCorrespondences, DEFAULT_AFFINE_BOUNDS,
} from "../src/lib/symbolAffine.ts";
import { EndpointGrid } from "../src/lib/symbolsweep.ts";

// §2.1 — least-squares affine from correspondences

test("fitAffine recovers an exact known [a b c d tx ty] to 1e-9", () => {
  const m: [number, number, number, number] = [1.2, -0.3, 0.25, 0.95];
  const tx = 17.4, ty = -8.1;
  const seedPts: Array<[number, number]> = [[0, 0], [10, 0], [0, 10], [10, 10], [-6, 4], [3, -9]];
  const pairs = seedPts.map(([sx, sy]) => {
    const qx = m[0] * sx + m[1] * sy + tx, qy = m[2] * sx + m[3] * sy + ty;
    return [sx, sy, qx, qy] as [number, number, number, number];
  });
  const fit = fitAffine(pairs);
  assert.ok(fit, "fit should succeed on 6 exact, non-collinear correspondences");
  assert.ok(Math.abs(fit!.m[0] - m[0]) < 1e-9);
  assert.ok(Math.abs(fit!.m[1] - m[1]) < 1e-9);
  assert.ok(Math.abs(fit!.m[2] - m[2]) < 1e-9);
  assert.ok(Math.abs(fit!.m[3] - m[3]) < 1e-9);
  assert.ok(Math.abs(fit!.tx - tx) < 1e-9);
  assert.ok(Math.abs(fit!.ty - ty) < 1e-9);
  assert.ok(fit!.rms < 1e-9, `exact points should fit with ~zero residual, got ${fit!.rms}`);
});

test("fitAffine recovers a known transform from sub-pixel jittered points with rms < 0.5px", () => {
  const m: [number, number, number, number] = [0.98, 0.15, -0.12, 1.05];
  const tx = -4.2, ty = 22.6;
  const seedPts: Array<[number, number]> = [
    [0, 0], [20, 0], [0, 20], [20, 20], [10, 10], [-8, 6], [14, -5], [-3, -12], [8, 18], [-15, -3], [22, 4], [-6, 15],
  ];
  // deterministic, bounded jitter (not RNG-backed) so the test is
  // reproducible — a fixed pattern touching both signs on both axes across
  // enough correspondences that the least-squares fit averages the noise
  // down, the way a real symbol's 10+ endpoints would.
  const jitter: Array<[number, number]> = [
    [0.4, -0.3], [-0.5, 0.2], [0.15, 0.6], [-0.3, -0.4], [0.6, 0.1], [-0.2, 0.5],
    [0.3, -0.6], [-0.5, 0.15], [0.25, -0.35], [-0.6, 0.3], [0.35, -0.15], [-0.25, 0.45],
  ];
  const pairs = seedPts.map(([sx, sy], i) => {
    const qx = m[0] * sx + m[1] * sy + tx + jitter[i][0];
    const qy = m[2] * sx + m[3] * sy + ty + jitter[i][1];
    return [sx, sy, qx, qy] as [number, number, number, number];
  });
  const fit = fitAffine(pairs);
  assert.ok(fit);
  assert.ok(fit!.rms < 0.5, `rms should stay under 0.5px with enough jittered correspondences, got ${fit!.rms}`);
  // still recognisably the same transform, not a wild overfit
  assert.ok(Math.abs(fit!.m[0] - m[0]) < 0.1);
  assert.ok(Math.abs(fit!.tx - tx) < 1);
});

test("fitAffine refuses fewer than 3 correspondences", () => {
  assert.equal(fitAffine([[0, 0, 0, 0], [1, 0, 1, 0]]), null);
});

test("fitAffine refuses collinear correspondences", () => {
  const pairs: Array<[number, number, number, number]> = [[0, 0, 0, 0], [1, 0, 2, 0], [2, 0, 4, 0], [3, 0, 6, 0]];
  assert.equal(fitAffine(pairs), null, "all seed points on one line — no unique affine solution");
});

test("fitAffine's IRLS pass drops a genuine outlier correspondence", () => {
  // 20 correspondences (a realistic count for a real symbol's endpoints,
  // per §3 Phase 1's own note that a real seed has ~10-40 segments) with
  // ONE wildly wrong pairing. A tiny handful of points can't isolate a
  // single extreme outlier (an unconstrained 6-DOF affine partially
  // absorbs it instead) — real redundancy is what the two-pass drop
  // actually buys.
  const tx = 5, ty = 5;
  const seedPts: Array<[number, number]> = [];
  for (let i = 0; i < 20; i++) seedPts.push([(i % 5) * 10 - 20, Math.floor(i / 5) * 10 - 15]);
  const pairs = seedPts.map(([sx, sy]) => [sx, sy, sx + tx, sy + ty] as [number, number, number, number]);
  pairs[10] = [seedPts[10][0], seedPts[10][1], seedPts[10][0] + tx + 20, seedPts[10][1] + ty + 20]; // one wrong correspondence
  const fit = fitAffine(pairs);
  assert.ok(fit);
  assert.equal(fit!.n, 19, "the outlier should be dropped, 19 of 20 survive");
  assert.ok(Math.abs(fit!.tx - tx) < 1e-6, "the fit should recover the true translation, not be dragged by the outlier");
  assert.ok(Math.abs(fit!.ty - ty) < 1e-6);
});

// §2.2 — decomposition

const deg2rad = (deg: number): number => (deg * Math.PI) / 180;
/** m = R(θ)·diag(sx,sy) in this codebase's [a,b,c,d] row-major, y-down,
 * CW-degrees convention (matches transformsFor's own rigid matrices). */
const rotScale = (deg: number, sx: number, sy: number, mirror = false): [number, number, number, number] => {
  const th = deg2rad(deg), c = Math.cos(th), s = Math.sin(th);
  const msx = mirror ? -sx : sx;
  return [c * msx, -s * sy, s * msx, c * sy];
};

for (const deg of [7, 12, 45, 100, 250]) {
  for (const [sx, sy] of [[1, 1], [1.15, 1], [1, 1.3], [1.15, 1.3]] as Array<[number, number]>) {
    test(`decomposeAffine recovers rotation=${deg}° scale=(${sx},${sy})`, () => {
      const m = rotScale(deg, sx, sy);
      const d = decomposeAffine(m);
      assert.ok(Math.abs(d.rotation_deg - deg) < 0.5, `rotation ${d.rotation_deg} vs ${deg}`);
      assert.ok(Math.abs(d.scale_x - sx) < 0.01, `scale_x ${d.scale_x} vs ${sx}`);
      assert.ok(Math.abs(d.scale_y - sy) < 0.01, `scale_y ${d.scale_y} vs ${sy}`);
      assert.ok(Math.abs(d.shear_deg) < 0.5, `pure rotation+scale should report ~0 shear, got ${d.shear_deg}`);
      assert.equal(d.mirrored, false);
    });
  }
}

test("decomposeAffine reports mirrored:true and folds the mirror out before reading rotation", () => {
  const m = rotScale(40, 1.1, 1, true);
  const d = decomposeAffine(m);
  assert.equal(d.mirrored, true);
  assert.ok(Math.abs(d.rotation_deg - 40) < 0.5, `rotation ${d.rotation_deg} vs 40`);
  assert.ok(Math.abs(d.scale_x - 1.1) < 0.01);
});

test("decomposeAffine reports nonzero shear for a genuinely sheared matrix", () => {
  // shear the local y-axis by 8° before rotating — a pure shear, no rotation.
  const shearDeg = 8;
  const m: [number, number, number, number] = [1, Math.tan(deg2rad(shearDeg)), 0, 1];
  const d = decomposeAffine(m);
  assert.ok(Math.abs(d.shear_deg - shearDeg) < 1, `shear_deg ${d.shear_deg} vs ${shearDeg}`);
});

test("decomposeAffine of the identity is rotation 0, scale 1, shear 0, not mirrored", () => {
  const d = decomposeAffine([1, 0, 0, 1]);
  assert.equal(d.rotation_deg, 0);
  assert.equal(d.scale_x, 1);
  assert.equal(d.scale_y, 1);
  assert.equal(d.shear_deg, 0);
  assert.equal(d.mirrored, false);
});

// §2.3 — bounds

test("affineWithinBounds: within default bounds passes", () => {
  const d = decomposeAffine(rotScale(30, 1.3, 1.2));
  assert.equal(affineWithinBounds(d, DEFAULT_AFFINE_BOUNDS, 1), true);
});

test("affineWithinBounds: a 1.6× stretch fails the default 1.5× bound", () => {
  const d = decomposeAffine(rotScale(0, 1.6, 1));
  assert.equal(affineWithinBounds(d, DEFAULT_AFFINE_BOUNDS, 1), false);
});

test("affineWithinBounds: shear past the default 10° bound fails", () => {
  const d = decomposeAffine([1, Math.tan(deg2rad(15)), 0, 1]);
  assert.equal(affineWithinBounds(d, DEFAULT_AFFINE_BOUNDS, 1), false);
});

test("affineWithinBounds divides out a stated uniform scale before checking stretch", () => {
  // drawn at 2× the seed's scale, but uniformly — not a stretch once the
  // stated ratio is divided out.
  const d = decomposeAffine(rotScale(0, 2, 2));
  assert.equal(affineWithinBounds(d, DEFAULT_AFFINE_BOUNDS, 1), false, "2× uniform IS out of bounds without dividing out a stated ratio");
  assert.equal(affineWithinBounds(d, DEFAULT_AFFINE_BOUNDS, 2), true, "but passes once the stated 2× ratio is divided out");
});

// §3 Phase 1 step 1 — correspondence gathering

test("gatherCorrespondences pairs seed endpoints with the nearest sheet endpoint near a rigid guess", () => {
  // A small triangle seed, rotated 10° off the rigid 0° guess on the sheet.
  const rel = [[0, 0, 20, 0, 20], [20, 0, 10, 15, 18], [10, 15, 0, 0, 18]];
  const th = deg2rad(10), c = Math.cos(th), s = Math.sin(th);
  const rot = (x: number, y: number): [number, number] => [c * x - s * y, s * x + c * y];
  const cx = 500, cy = 500;
  const segs: number[] = [];
  for (const [ax, ay, bx, by] of rel) {
    const [rax, ray] = rot(ax, ay), [rbx, rby] = rot(bx, by);
    segs.push(rax + cx, ray + cy, rbx + cx, rby + cy);
  }
  const grid = new EndpointGrid(segs, 2);
  const m0: [number, number, number, number] = [1, 0, 0, 1]; // the rigid 0° guess
  const corr = gatherCorrespondences(rel, m0, cx, cy, segs, grid, 12);
  assert.ok(corr.length >= 3, `expected several correspondences, got ${corr.length}`);
  for (const [sx, sy, qx, qy] of corr) {
    const [rax, ray] = rot(sx, sy);
    assert.ok(Math.hypot(rax + cx - qx, ray + cy - qy) < 1e-6, "each correspondence should be the TRUE rotated counterpart");
  }
});

test("gatherCorrespondences skips a seed endpoint when two sheet endpoints are ambiguously close", () => {
  const rel = [[0, 0, 20, 0, 20]];
  // two sheet endpoints near (20,0)+guess, equally plausible
  const segs = [0, 0, 0, 0, 19, 1, 40, 40, 21, -1, 60, 60];
  const grid = new EndpointGrid(segs, 2);
  const corr = gatherCorrespondences(rel, [1, 0, 0, 1], 0, 0, segs, grid, 12);
  // (0,0) has an exact match; (20,0) is ambiguous between (19,1) and (21,-1)
  assert.equal(corr.length, 1, "the ambiguous endpoint should be skipped, not guessed");
  assert.deepEqual([corr[0][0], corr[0][1]], [0, 0]);
});

test("fitAffine + decomposeAffine round-trip on gatherCorrespondences output recovers the true rotation", () => {
  // 12°, not a larger angle: Phase 1 refines a placement the RIGID search
  // already proposed near — its own §3 scope note is "near-grid rotation
  // (≤ ~15°, via junction proposals)" — so the search radius (6·tol) only
  // needs to bridge a seed endpoint's displacement at a SMALL angle, not
  // discover an arbitrary one (that is Phase 2's job, a different, wider
  // candidate-generation basis).
  const rel = [[0, 0, 30, 0, 30], [30, 0, 15, 26, 30], [15, 26, 0, 0, 30], [15, 8, 15, 26, 18]];
  const trueDeg = 12;
  const th = deg2rad(trueDeg), c = Math.cos(th), s = Math.sin(th);
  const rot = (x: number, y: number): [number, number] => [c * x - s * y, s * x + c * y];
  const cx = 300, cy = 300;
  const segs: number[] = [];
  for (const [ax, ay, bx, by] of rel) {
    const [rax, ray] = rot(ax, ay), [rbx, rby] = rot(bx, by);
    segs.push(rax + cx, ray + cy, rbx + cx, rby + cy);
  }
  const grid = new EndpointGrid(segs, 2);
  const corr = gatherCorrespondences(rel, [1, 0, 0, 1], cx, cy, segs, grid, 12);
  const fit = fitAffine(corr);
  assert.ok(fit);
  const d = decomposeAffine(fit!.m);
  assert.ok(Math.abs(d.rotation_deg - trueDeg) < 1, `recovered rotation ${d.rotation_deg} vs true ${trueDeg}`);
});
