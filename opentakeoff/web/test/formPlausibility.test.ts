// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 Lane A's own disclosed
// requirement 3 — see formPlausibility.ts's own header for the full
// real-sheet reasoning (shatter count + aspect ratio).
import { test } from "node:test";
import assert from "node:assert/strict";
import { assessFormPlausibility } from "../src/lib/formPlausibility.ts";

test("form plausibility: Cherry Point #12's own real dominant-cluster case (8-way shatter, 176.584x37.052 bbox) is flagged implausible on the shatter signal", () => {
  // real numbers from this session's own PROGRESS.md investigation —
  // locked in as a regression fixture so this exact real finding can
  // never silently stop being flagged. Its real aspect ratio (≈4.77) is
  // genuinely below the default 6 threshold — verified by running this
  // test before asserting, not assumed — so only "shatter" fires here by
  // default; the aspect signal is demonstrated separately below with a
  // lowered, still-reasonable threshold.
  const r = assessFormPlausibility({ x0: 0, y0: 3130.948, x1: 176.584, y1: 3168, componentCount: 8 });
  assert.equal(r.plausibleAsSingleSymbol, false);
  assert.deepEqual(r.reasons, ["shatter"]);
  assert.ok(Math.abs(r.aspectRatio - 176.584 / 37.052) < 1e-6);
  const withLowerAspectThreshold = assessFormPlausibility(
    { x0: 0, y0: 3130.948, x1: 176.584, y1: 3168, componentCount: 8 },
    { aspectRatioThreshold: 4 },
  );
  assert.deepEqual(withLowerAspectThreshold.reasons.sort(), ["aspect", "shatter"], "at a stricter (still real) aspect threshold, this same thin real bbox also fails on shape");
});

test("form plausibility: tinker-afb-iwcs-controls.pdf#13's own real 259-way shatter case is flagged implausible on shatter alone, independent of shape", () => {
  // a compact (non-thin) bbox, isolating the shatter signal specifically.
  const r = assessFormPlausibility({ x0: 0, y0: 0, x1: 100, y1: 100, componentCount: 259 });
  assert.equal(r.plausibleAsSingleSymbol, false);
  assert.deepEqual(r.reasons, ["shatter"]);
});

test("form plausibility: a compact, low-shatter form (a plausible real symbol) is NOT flagged", () => {
  const r = assessFormPlausibility({ x0: 0, y0: 0, x1: 20, y1: 15, componentCount: 2 });
  assert.equal(r.plausibleAsSingleSymbol, true);
  assert.deepEqual(r.reasons, []);
});

test("form plausibility: shatterThreshold and aspectRatioThreshold are real, tunable knobs", () => {
  const borderline = { x0: 0, y0: 0, x1: 20, y1: 15, componentCount: 4 };
  assert.equal(assessFormPlausibility(borderline).plausibleAsSingleSymbol, true, "4 components is below the default threshold of 5");
  assert.equal(assessFormPlausibility(borderline, { shatterThreshold: 4 }).plausibleAsSingleSymbol, false, "lowering the threshold to 4 now flags it");
});

test("form plausibility: a degenerate (zero-height) bbox with real width does not crash, and reads as an extreme aspect ratio", () => {
  const r = assessFormPlausibility({ x0: 0, y0: 5, x1: 100, y1: 5, componentCount: 1 });
  assert.equal(r.aspectRatio, Infinity);
  assert.equal(r.plausibleAsSingleSymbol, false);
  assert.deepEqual(r.reasons, ["aspect"]);
});

test("form plausibility: a single point (zero width AND zero height) reads as aspect ratio 1, not NaN or Infinity", () => {
  const r = assessFormPlausibility({ x0: 5, y0: 5, x1: 5, y1: 5, componentCount: 1 });
  assert.equal(r.aspectRatio, 1);
  assert.equal(r.plausibleAsSingleSymbol, true);
});

test("form plausibility: reasons reports EXACTLY which check(s) failed, never a bare boolean with no explanation", () => {
  const shatterOnly = assessFormPlausibility({ x0: 0, y0: 0, x1: 10, y1: 10, componentCount: 10 });
  assert.deepEqual(shatterOnly.reasons, ["shatter"]);
  const aspectOnly = assessFormPlausibility({ x0: 0, y0: 0, x1: 100, y1: 1, componentCount: 1 });
  assert.deepEqual(aspectOnly.reasons, ["aspect"]);
  const both = assessFormPlausibility({ x0: 0, y0: 0, x1: 100, y1: 1, componentCount: 10 });
  assert.deepEqual(both.reasons.sort(), ["aspect", "shatter"]);
});
