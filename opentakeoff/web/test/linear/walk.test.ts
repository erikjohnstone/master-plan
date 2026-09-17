// linear/walk.ts — the bidirectional walker, the final piece of Stage 3
// (#linear-takeoff WP3.4, opentakeoff-corpus/goals/LINEAR_TAKEOFF.md, plan
// §6.4). Each stop reason and vertex kind gets its own precise synthetic
// chain, built the same way graph.test.ts's node-type fixtures were.
import { test } from "node:test";
import assert from "node:assert/strict";
import { walkOneDirection, walkBothDirections } from "../../src/lib/linear/walk.ts";
import { buildSegmentIndex } from "../../src/lib/linear/index.ts";

function idxFor(segs: number[], pens?: number[]) {
  const n = segs.length >> 2;
  const meta = new Uint8Array(n);
  if (pens) for (let i = 0; i < n; i++) meta[i] = pens[i] << 4;
  const candidate = new Uint8Array(n).fill(1);
  return buildSegmentIndex(segs, meta, { candidate });
}

test("walkOneDirection: a straight chain of collinear segments walks to the far dead end, no vertices recorded", () => {
  const idx = idxFor([0, 0, 100, 0, 100, 0, 200, 0, 200, 0, 300, 0]);   // 3 collinear segments in a row
  const result = walkOneDirection(idx, 0, 1, 18, {});   // seed on segment 0, walking away from its second end (100,0)
  assert.deepEqual(result.stop, { reason: "dead_end", x: 300, y: 0 });
  assert.equal(result.vertices.length, 0);
  assert.equal(result.length, 300);
  assert.deepEqual(result.points, [[0, 0], [100, 0], [200, 0], [300, 0]]);
});

test("walkOneDirection: an isolated single segment is a dead end at zero hops beyond the seed", () => {
  const idx = idxFor([0, 0, 100, 0]);
  const result = walkOneDirection(idx, 0, 1, 18, {});
  assert.equal(result.stop.reason, "dead_end");
  assert.equal(result.hops, 1);
  assert.deepEqual(result.points, [[0, 0], [100, 0]]);
});

test("walkOneDirection: a 90° elbow records the vertex and continues along the turn", () => {
  const idx = idxFor([0, 0, 100, 0, 100, 0, 100, 100]);   // horizontal then turns up
  const result = walkOneDirection(idx, 0, 1, 18, {});
  assert.equal(result.vertices.length, 1);
  assert.deepEqual(result.vertices[0], { kind: "elbow", x: 100, y: 0, turnDeg: 90, angleClass: "90" });
  assert.equal(result.stop.reason, "dead_end");
  assert.deepEqual(result.stop, { reason: "dead_end", x: 100, y: 100 });
});

test("walkOneDirection: arriving at a tee via the through-pair continues onto the other through member, recording the branch", () => {
  const idx = idxFor([0, 0, 100, 0, 100, 0, 200, 0, 100, 0, 100, 100]);   // seg0->seg1 straight through at (100,0); seg2 branches up
  const result = walkOneDirection(idx, 0, 1, 18, {});
  assert.equal(result.vertices.length, 1);
  assert.equal(result.vertices[0].kind, "tee");
  assert.equal(result.vertices[0].branchSeg, 2);
  assert.deepEqual(result.points, [[0, 0], [100, 0], [200, 0]]);
  assert.equal(result.stop.reason, "dead_end");
});

test("walkOneDirection: arriving at a tee VIA the branch stops immediately with branch_joins_main — the main is its own run", () => {
  const idx = idxFor([100, 0, 100, 100, 0, 0, 100, 0, 100, 0, 200, 0]);   // seg0 is the branch: end0=(100,0) is the tee point, end1=(100,100) is where we start; seg1/seg2 form the main
  const result = walkOneDirection(idx, 0, 0, 18, {});   // atEnd=0: arrive AT (100,0), having walked seg0 from (100,100)
  assert.deepEqual(result.stop, { reason: "branch_joins_main", x: 100, y: 0 });
  assert.equal(result.vertices.length, 0, "no vertex recorded — the walk never continues onto the main");
});

test("walkOneDirection: a crossing records the vertex and continues straight through, never turning onto the crossing segment", () => {
  const idx = idxFor([0, 0, 100, 0, 100, 0, 200, 0, 50, -50, 150, 50]);   // our own horizontal run through (100,0); a diagonal duct crosses there
  const result = walkOneDirection(idx, 0, 1, 18, {});
  assert.equal(result.vertices.length, 1);
  assert.equal(result.vertices[0].kind, "crossing");
  assert.deepEqual(result.points, [[0, 0], [100, 0], [200, 0]], "the walk stayed on its own straight line, never detoured onto the diagonal");
  assert.equal(result.stop.reason, "dead_end");
});

test("walkOneDirection: a family change (pen jumps by more than 1) stops the walk rather than crossing onto the other system", () => {
  const idx = idxFor([0, 0, 100, 0, 100, 0, 200, 0], [4, 1]);   // pen 4 then pen 1 — a 3-nibble jump, well past the ±1 tolerance
  const result = walkOneDirection(idx, 0, 1, 18, {});
  assert.deepEqual(result.stop, { reason: "family_change", x: 100, y: 0 });
  assert.deepEqual(result.points, [[0, 0], [100, 0]], "the walk never advances onto the mismatched segment");
});

test("walkOneDirection: a pen within ±1 nibble is the SAME family — the walk continues, not a family_change", () => {
  const idx = idxFor([0, 0, 100, 0, 100, 0, 200, 0], [4, 5]);   // pen 4 then pen 5 — within tolerance
  const result = walkOneDirection(idx, 0, 1, 18, {});
  assert.equal(result.stop.reason, "dead_end");
  assert.equal(result.length, 200);
});

test("walkOneDirection: a dash-code mismatch is a family change even with an identical pen", () => {
  const segs = [0, 0, 100, 0, 100, 0, 200, 0];
  const n = 2;
  const meta = new Uint8Array(n).fill(4 << 4);
  const dash = new Uint8Array([0, 1]);   // solid then dashed
  const idx = buildSegmentIndex(segs, meta, { candidate: new Uint8Array(n).fill(1) });
  const result = walkOneDirection(idx, 0, 1, 18, { dash });
  assert.equal(result.stop.reason, "family_change");
});

test("walkOneDirection: an end near the page bounds reports sheet_edge instead of dead_end", () => {
  const idx = idxFor([0, 0, 100, 0]);
  const result = walkOneDirection(idx, 0, 1, 18, {}, { pageBounds: { minX: 0, minY: 0, maxX: 100, maxY: 200 }, sheetEdgeTolPx: 3 });
  assert.equal(result.stop.reason, "sheet_edge");
});

test("walkOneDirection: an ambiguous junction (a symmetric Y, no collinear pair) stops and reports the candidate fan", () => {
  const p = (deg: number): [number, number] => [100 * Math.cos(deg * Math.PI / 180), 100 * Math.sin(deg * Math.PI / 180)];
  const [x1, y1] = p(120), [x2, y2] = p(240);
  const idx = idxFor([-100, 0, 0, 0, 0, 0, x1, y1, 0, 0, x2, y2]);   // seed leg at 0° (arriving at the origin), plus two more legs at 120°/240°
  const result = walkOneDirection(idx, 0, 1, 18, {});
  assert.equal(result.stop.reason, "ambiguous");
  assert.equal(result.stop.candidates!.length, 2);
});

test("walkOneDirection: the hop cap stops a walk that would otherwise continue forever", () => {
  const segs: number[] = [];
  for (let i = 0; i < 20; i++) segs.push(i * 100, 0, (i + 1) * 100, 0);   // 20 collinear segments in a row
  const idx = idxFor(segs);
  const result = walkOneDirection(idx, 0, 1, 18, {}, { maxHops: 5 });
  assert.equal(result.stop.reason, "cap");
  assert.ok(result.hops >= 5);
});

test("walkBothDirections: combines both directions into one continuous chain, the seed's own length counted once", () => {
  const idx = idxFor([-100, 0, 0, 0, 0, 0, 100, 0]);   // seed is segment 1 (0,0)-(100,0); segment 0 extends it backward
  const result = walkBothDirections(idx, 1, 18, {});
  assert.deepEqual(result.points, [[-100, 0], [0, 0], [100, 0]]);
  assert.equal(result.length, 200);
  assert.equal(result.stops.forward.reason, "dead_end");
  assert.equal(result.stops.backward.reason, "dead_end");
});
