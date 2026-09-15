// GOAL.md's own standing rule ("real ground truth means an agent
// actually rendered the page and looked at it") caught a real gap: Lane
// A's own candidate-body content can be dominated by white-ink masking
// geometry a human never sees. See invisibleInk.ts's own header for the
// full real-sheet finding (Cherry Point #12) this module was built from.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isLikelyInvisibleInk, summarizeInvisibleInk } from "../src/lib/invisibleInk.ts";

test("invisible ink: pure white (lum 255) is flagged invisible", () => {
  assert.equal(isLikelyInvisibleInk({ lum: 255 }), true);
});

test("invisible ink: black (lum 0) is never flagged invisible", () => {
  assert.equal(isLikelyInvisibleInk({ lum: 0 }), false);
});

test("invisible ink: a mid-gray value well below the default threshold is not flagged", () => {
  assert.equal(isLikelyInvisibleInk({ lum: 128 }), false);
});

test("invisible ink: null lum (no recorded fact) is never flagged — no evidence, not treated as suspicious by default", () => {
  assert.equal(isLikelyInvisibleInk({ lum: null }), false);
});

test("invisible ink: lumThreshold is a real, tunable knob", () => {
  assert.equal(isLikelyInvisibleInk({ lum: 240 }), false, "240 is below the default 250 threshold");
  assert.equal(isLikelyInvisibleInk({ lum: 240 }, { lumThreshold: 200 }), true, "a lower threshold catches it");
});

test("invisible ink: exactly at the threshold counts as invisible (inclusive bound)", () => {
  assert.equal(isLikelyInvisibleInk({ lum: 250 }), true);
  assert.equal(isLikelyInvisibleInk({ lum: 249 }), false);
});

test("invisible ink: summarizeInvisibleInk reproduces Cherry Point #12's own real cluster-0 finding as a fixture (475 total, 463 invisible, 12 visible)", () => {
  // a synthetic idx shaped exactly like the real finding: 463 white-ink
  // primitives (lum 255) and 12 real dark ones (lum 0), matching the
  // exact counts real-sheet validation found for that cluster's biggest
  // proposal — locking this real discovery in as a regression fixture,
  // not just a one-off script finding that could silently regress.
  const primitives = [
    ...Array.from({ length: 463 }, () => ({ lum: 255 })),
    ...Array.from({ length: 12 }, () => ({ lum: 0 })),
  ];
  const idx = { primitives };
  const primitiveIds = primitives.map((_, i) => i);
  const stats = summarizeInvisibleInk(primitiveIds, idx);
  assert.deepEqual(stats, { total: 475, invisibleCount: 463, visibleCount: 12, unknownLumCount: 0 });
});

test("invisible ink: a primitive id with no matching entry in idx.primitives is skipped, not thrown on", () => {
  const idx = { primitives: [{ lum: 0 }] };
  const stats = summarizeInvisibleInk([0, 99], idx);
  assert.equal(stats.total, 2, "total reflects the requested id count");
  assert.equal(stats.visibleCount + stats.invisibleCount + stats.unknownLumCount, 1, "only the resolvable id is counted into a bucket");
});

test("invisible ink: unknownLumCount is reported separately, never folded into visible or invisible", () => {
  const idx = { primitives: [{ lum: null }, { lum: 255 }, { lum: 0 }] };
  const stats = summarizeInvisibleInk([0, 1, 2], idx);
  assert.deepEqual(stats, { total: 3, invisibleCount: 1, visibleCount: 1, unknownLumCount: 1 });
});
