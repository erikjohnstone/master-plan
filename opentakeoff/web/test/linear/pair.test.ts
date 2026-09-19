// linear/pair.ts (#linear-takeoff WP4.1, minimal slice) — findParallelPartner
// only. Full pair-following is not built; see the file's own header.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findParallelPartner } from "../../src/lib/linear/pair.ts";
import { buildSegmentIndex } from "../../src/lib/linear/index.ts";

function idxFor(segs: number[]) {
  const n = segs.length >> 2;
  const candidate = new Uint8Array(n).fill(1);
  return buildSegmentIndex(segs, new Uint8Array(n), { candidate });
}

const PPF = 18; // 18 px/ft, matching this suite's own convention elsewhere

test("findParallelPartner: a clean double-line duct rail (offset 18px, full overlap) is found", () => {
  const idx = idxFor([
    0, 0, 100, 0,     // seg0: the rail we're checking
    0, 18, 100, 18,   // seg1: its own twin, 18px away, same span
  ]);
  assert.equal(findParallelPartner(idx, 0, PPF), 1);
});

test("findParallelPartner: two segments that CROSS at an angle are never a twin, however close", () => {
  const idx = idxFor([
    0, 0, 100, 0,       // seg0: horizontal
    50, -50, 50, 50,    // seg1: a real crossing duct, perpendicular, passing right through
  ]);
  assert.equal(findParallelPartner(idx, 0, PPF), null);
});

test("findParallelPartner: parallel but too far apart (beyond the 96in*ppf plan-named max) is not a twin", () => {
  const farPx = 96 * PPF + 50; // just past the max offset
  const idx = idxFor([
    0, 0, 100, 0,
    0, farPx, 100, farPx,
  ]);
  assert.equal(findParallelPartner(idx, 0, PPF), null);
});

test("findParallelPartner: parallel and close, but barely overlapping (a short adjacent stub) is not a twin", () => {
  const idx = idxFor([
    0, 0, 100, 0,     // seg0: 0..100
    95, 18, 200, 18,  // seg1: 95..200 -- only 5 of seg0's own 100px length overlaps, 5%
  ]);
  assert.equal(findParallelPartner(idx, 0, PPF), null);
});

test("findParallelPartner: parallel and close, but DIVERGING offset (a real transition, not a constant-width rail) is not a twin", () => {
  const idx = idxFor([
    0, 0, 100, 0,      // seg0: horizontal at y=0
    0, 4, 100, 60,     // seg1: starts 4px away, ends 60px away -- a real converging/diverging duct wall, not a parallel rail
  ]);
  assert.equal(findParallelPartner(idx, 0, PPF), null);
});

test("findParallelPartner: no nearby geometry at all returns null", () => {
  const idx = idxFor([0, 0, 100, 0]);
  assert.equal(findParallelPartner(idx, 0, PPF), null);
});

test("findParallelPartner: a real twin still found when it is the segment's own REVERSE direction (drawn the other way)", () => {
  const idx = idxFor([
    0, 0, 100, 0,      // seg0: left to right
    100, 18, 0, 18,    // seg1: right to left, same span, 18px away
  ]);
  assert.equal(findParallelPartner(idx, 0, PPF), 1);
});

test("findParallelPartner: filterFn excludes an otherwise-qualifying twin", () => {
  const idx = idxFor([
    0, 0, 100, 0,
    0, 18, 100, 18,
  ]);
  assert.equal(findParallelPartner(idx, 0, PPF, (seg) => seg !== 1), null);
});
