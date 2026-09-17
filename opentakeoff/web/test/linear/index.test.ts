// linear/index.ts — the segment spatial index, Stage 2 of the trace engine
// (#linear-takeoff WP3.2, opentakeoff-corpus/goals/LINEAR_TAKEOFF.md, plan
// §6.3/§6.11). Correctness of the EXACT nearest-segment query under a real
// tie/false-lead scenario is the load-bearing test here: flatbush's own
// `neighbors()` orders candidates by box distance, a lower bound on true
// point-to-segment distance, never the true distance itself — a naive
// "take the first K and stop" implementation would be WRONG whenever a
// segment's bbox corner sits closer to the query point than the segment's
// own occupied line ever does (any diagonal segment does this).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSegmentIndex, nearestSegment, segmentsInBox, endpointsNear, serializeSegmentIndex, deserializeSegmentIndex, hitTolerancePx } from "../../src/lib/linear/index.ts";
function classesFor(n: number, candidateIdx: number[], family?: Int16Array): { candidate: Uint8Array; family?: Int16Array | null } {
  const candidate = new Uint8Array(n);
  for (const i of candidateIdx) candidate[i] = 1;
  return { candidate, family: family ?? null };
}

test("buildSegmentIndex: indexes only candidate segments; candidateToSeg maps back to original indices", () => {
  const segs = [0, 0, 10, 0, 100, 100, 110, 100, 200, 200, 210, 200];   // 3 segments
  const meta = new Uint8Array(3);
  const idx = buildSegmentIndex(segs, meta, classesFor(3, [0, 2]));   // exclude segment 1
  assert.equal(idx.numCandidates, 2);
  assert.deepEqual([...idx.candidateToSeg], [0, 2]);
});

test("buildSegmentIndex: an all-excluded sheet never throws, and every query returns nothing", () => {
  const segs = [0, 0, 10, 0];
  const meta = new Uint8Array(1);
  const idx = buildSegmentIndex(segs, meta, classesFor(1, []));
  assert.equal(idx.numCandidates, 0);
  assert.equal(nearestSegment(idx, 0, 0, 100), null);
  assert.deepEqual(segmentsInBox(idx, -100, -100, 100, 100), []);
  assert.deepEqual(endpointsNear(idx, 0, 0, 100), []);
});

test("nearestSegment: exact hit on a simple case — projection point, t, and distance all correct", () => {
  const segs = [0, 0, 100, 0];   // one horizontal segment
  const meta = new Uint8Array(1);
  const idx = buildSegmentIndex(segs, meta, classesFor(1, [0]));
  const hit = nearestSegment(idx, 40, 10, 100)!;
  assert.equal(hit.seg, 0);
  assert.equal(hit.t, 0.4);
  assert.equal(hit.px, 40); assert.equal(hit.py, 0);
  assert.equal(hit.dist, 10);
});

test("nearestSegment: null beyond maxDist", () => {
  const segs = [0, 0, 100, 0];
  const idx = buildSegmentIndex(segs, new Uint8Array(1), classesFor(1, [0]));
  assert.equal(nearestSegment(idx, 40, 1000, 5), null);
});

test("nearestSegment: filterFn excludes a candidate that would otherwise win", () => {
  const segs = [0, 0, 100, 0, 0, 50, 100, 50];   // seg 0 closer, seg 1 farther
  const idx = buildSegmentIndex(segs, new Uint8Array(2), classesFor(2, [0, 1]));
  const unfiltered = nearestSegment(idx, 50, 5, 100)!;
  assert.equal(unfiltered.seg, 0);
  const filtered = nearestSegment(idx, 50, 5, 100, (seg) => seg !== 0)!;
  assert.equal(filtered.seg, 1);
});

// A real tie/false-lead scenario: 12 diagonal segments, each from (D,0) to
// (0,D) for D = 10, 20, ..., 120 — every one of their bboxes is [0,0]-[D,D],
// so EVERY one has box-distance 0 to the origin (a tie at the strongest
// possible lower bound), while their TRUE perpendicular distance from the
// origin to the line x+y=D is D/sqrt(2), strictly increasing with D. The
// D=10 segment (true nearest, dist ≈ 7.07) has no reason to be among
// whichever 8 flatbush's internal tie-break happens to return first — this
// is exactly the box-distance-vs-true-distance mismatch nearestSegment's
// own incremental-widening exists to resolve correctly.
test("nearestSegment: the true global minimum wins even when 12 candidates tie at box-distance zero (forces widening past the initial K)", () => {
  const segs: number[] = [];
  for (let d = 10; d <= 120; d += 10) segs.push(d, 0, 0, d);
  const n = segs.length >> 2;
  const idx = buildSegmentIndex(segs, new Uint8Array(n), classesFor(n, Array.from({ length: n }, (_, i) => i)));
  const hit = nearestSegment(idx, 0, 0, 1000)!;
  assert.equal(hit.seg, 0, "the D=10 segment (index 0) is the true nearest, however flatbush orders the box-distance ties");
  assert.ok(Math.abs(hit.dist - 10 / Math.sqrt(2)) < 1e-9);
});

test("segmentsInBox: returns candidates overlapping the box, respects filterFn", () => {
  const segs = [0, 0, 10, 10, 100, 100, 110, 110, 1000, 1000, 1010, 1010];
  const idx = buildSegmentIndex(segs, new Uint8Array(3), classesFor(3, [0, 1, 2]));
  assert.deepEqual(segmentsInBox(idx, -5, -5, 15, 15), [0]);
  assert.deepEqual(segmentsInBox(idx, -5, -5, 115, 115).sort(), [0, 1]);
  assert.deepEqual(segmentsInBox(idx, -5, -5, 115, 115, (seg) => seg !== 1), [0]);
});

test("endpointsNear: reports which end (0 = first point, 1 = second) welded, not just that one did", () => {
  const segs = [0, 0, 100, 0, 100, 0, 100, 100];   // an L: seg0 ends where seg1 starts, at (100,0)
  const idx = buildSegmentIndex(segs, new Uint8Array(2), classesFor(2, [0, 1]));
  const near = endpointsNear(idx, 100, 0, 1).sort((a, b) => a.seg - b.seg);
  assert.deepEqual(near, [{ seg: 0, end: 1 }, { seg: 1, end: 0 }]);
});

test("serializeSegmentIndex / deserializeSegmentIndex: round-trips to an index that answers the same queries", () => {
  const segs = [0, 0, 100, 0, 0, 50, 100, 50];
  const meta = new Uint8Array(2);
  const idx = buildSegmentIndex(segs, meta, classesFor(2, [0, 1]));
  const { payload, transfer } = serializeSegmentIndex(idx);
  assert.equal(transfer.length, 3);
  for (const b of transfer) assert.ok(b instanceof ArrayBuffer);
  assert.equal(payload.numCandidates, 2);

  const restored = deserializeSegmentIndex(segs, meta, null, payload);
  const original = nearestSegment(idx, 50, 5, 100)!;
  const roundTripped = nearestSegment(restored, 50, 5, 100)!;
  assert.deepEqual(roundTripped, original);
});

test("hitTolerancePx: the larger of the zoom-scaled aim radius and half the stroke plus a half-pixel floor", () => {
  assert.equal(hitTolerancePx(1, 0), 11);          // hairline at 1x: the 11px aim radius wins
  assert.equal(hitTolerancePx(2, 0), 5.5);         // zoomed in 2x: 11/2
  assert.equal(hitTolerancePx(5, 8), 4.5);         // zoomed in 5x (11/5 = 2.2): an 8px-wide stroke's own half-width wins
  assert.equal(hitTolerancePx(0, 0), 11, "zoom <= 0 defensively floors to 1x, never divides by zero or goes negative");
});
