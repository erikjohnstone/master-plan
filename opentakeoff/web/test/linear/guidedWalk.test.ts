// linear/guidedWalk.ts — the bench-only guided multi-hop continuation
// (#linear-takeoff GATE 3, opentakeoff-corpus/goals/LINEAR_TAKEOFF.md).
// Pure geometry tests only; the actual multi-call Session loop this feeds
// lives in bench/linear.mts and is exercised end to end by the synthetic
// "11-y-branch" corpus case (bench/linear/synthesize.mts), not here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickGuidedContinuation, nextGoldenVertex, GUIDED_ANGLE_TOL_DEG } from "../../src/lib/linear/guidedWalk.ts";

test("pickGuidedContinuation: picks the candidate closest to the golden's own direction", () => {
  const stop: [number, number] = [100, 100];
  const goldenNext: [number, number] = [100, 0];   // straight up (angle 270)
  const candidates = [
    { at: [200, 100] as [number, number], angle_deg: 0 },     // due east — wrong
    { at: [100, 0] as [number, number], angle_deg: 270 },     // due north — matches exactly
    { at: [0, 100] as [number, number], angle_deg: 180 },     // due west — wrong
  ];
  const picked = pickGuidedContinuation(stop, goldenNext, candidates);
  assert.equal(picked?.angle_deg, 270);
});

test("pickGuidedContinuation: a real fork picks the branch over the straighter main leg when the golden turns", () => {
  // A wye: incoming from the west (candidate "back" not offered — only
  // `others` ever reach this function, matching trace_run's own
  // candidates[] which never includes the segment just arrived on), one
  // leg continuing east-ish (30 deg) and one branching south-east (-60/300).
  const stop: [number, number] = [0, 0];
  const goldenNext: [number, number] = [10, 17.3];   // ~60 deg (the branch)
  const candidates = [
    { at: [10, 5.8] as [number, number], angle_deg: 30 },     // the "main" continuation
    { at: [10, 17.3] as [number, number], angle_deg: 60 },    // the branch — golden's real path
  ];
  const picked = pickGuidedContinuation(stop, goldenNext, candidates);
  assert.equal(picked?.angle_deg, 60);
});

test("pickGuidedContinuation: no candidate within tolerance is a genuine miss, not a forced guess", () => {
  const stop: [number, number] = [0, 0];
  const goldenNext: [number, number] = [0, -10];   // due south (270)
  const candidates = [
    { at: [10, 0] as [number, number], angle_deg: 0 },
    { at: [-10, 0] as [number, number], angle_deg: 180 },
  ];
  assert.equal(pickGuidedContinuation(stop, goldenNext, candidates), null);
});

test("pickGuidedContinuation: exactly at the tolerance boundary still counts, just past it does not", () => {
  const stop: [number, number] = [0, 0];
  const goldenNext: [number, number] = [1, 0];   // 0 deg
  const atBoundary = [{ at: [1, 1] as [number, number], angle_deg: GUIDED_ANGLE_TOL_DEG }];
  assert.equal(pickGuidedContinuation(stop, goldenNext, atBoundary)?.angle_deg, GUIDED_ANGLE_TOL_DEG);
  const pastBoundary = [{ at: [1, 1] as [number, number], angle_deg: GUIDED_ANGLE_TOL_DEG + 0.01 }];
  assert.equal(pickGuidedContinuation(stop, goldenNext, pastBoundary), null);
});

test("pickGuidedContinuation: no candidates at all is a miss, never throws", () => {
  assert.equal(pickGuidedContinuation([0, 0], [1, 0], []), null);
});

test("pickGuidedContinuation: a golden vertex identical to the stop point (zero-length step) refuses rather than dividing by zero", () => {
  const candidates = [{ at: [1, 0] as [number, number], angle_deg: 0 }];
  assert.equal(pickGuidedContinuation([5, 5], [5, 5], candidates), null);
});

test("nextGoldenVertex: mid-span point on a 2-vertex golden returns the far end", () => {
  const golden: [number, number][] = [[0, 0], [10, 0]];
  assert.deepEqual(nextGoldenVertex(golden, [4, 0]), [10, 0]);
});

test("nextGoldenVertex: a point exactly at an interior vertex of a 3-vertex golden returns the NEXT one, not itself", () => {
  const golden: [number, number][] = [[0, 0], [10, 0], [10, 10]];
  assert.deepEqual(nextGoldenVertex(golden, [10, 0]), [10, 10]);
});

test("nextGoldenVertex: a point off the golden's own line still projects to the nearest span and returns its far end", () => {
  const golden: [number, number][] = [[0, 0], [10, 0], [10, 10]];
  // (9.5, 5) is 0.5 from the SECOND span (10,0)-(10,10) and 5 from the
  // first (0,0)-(10,0) — unambiguously closer to the second.
  assert.deepEqual(nextGoldenVertex(golden, [9.5, 5]), [10, 10]);
});

test("nextGoldenVertex: at or past the golden's own final vertex returns null — nothing left to guide toward", () => {
  const golden: [number, number][] = [[0, 0], [10, 0]];
  assert.equal(nextGoldenVertex(golden, [10, 0]), null);
  assert.equal(nextGoldenVertex(golden, [15, 0]), null);   // past the end, clamped t=1 on the last span
});

test("nextGoldenVertex: sub-pixel rounding noise near the final vertex still reads as fully covered", () => {
  // A real trace_run point is round1'd through a wholly separate float
  // pipeline than the golden's own authored points — ~0.2px disagreement
  // at the finish line is ordinary noise, not more golden left to walk.
  const golden: [number, number][] = [[0, 0], [10, 0], [23.61, 24.97]];
  assert.equal(nextGoldenVertex(golden, [23.5, 24.9]), null);
  // Comfortably outside the tolerance is a real, unfinished gap, not noise.
  assert.deepEqual(nextGoldenVertex(golden, [20, 20]), [23.61, 24.97]);
});

test("nextGoldenVertex: a golden with fewer than 2 vertices has nothing to walk toward", () => {
  assert.equal(nextGoldenVertex([[0, 0]], [0, 0]), null);
  assert.equal(nextGoldenVertex([], [0, 0]), null);
});
