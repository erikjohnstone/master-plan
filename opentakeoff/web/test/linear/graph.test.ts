// linear/graph.ts — the local, lazy run graph, Stage 3 of the trace engine
// (#linear-takeoff WP3.3, opentakeoff-corpus/goals/LINEAR_TAKEOFF.md, plan
// §6.3). Each node-type test is a precise synthetic geometric fixture
// built to land exactly in the case under test — the plan's own
// degree/deviation decision tree, exercised case by case, including the
// two angle-band gaps (8°-30°, 150°-180°) the plan leaves unspecified
// (both fall to "ambiguous", the stated catch-all).
import { test } from "node:test";
import assert from "node:assert/strict";
import { frontier, weldTolerancePx } from "../../src/lib/linear/graph.ts";
import { buildSegmentIndex } from "../../src/lib/linear/index.ts";

function idxFor(segs: number[]) {
  const n = segs.length >> 2;
  const candidate = new Uint8Array(n).fill(1);
  return buildSegmentIndex(segs, new Uint8Array(n), { candidate });
}

test("weldTolerancePx: the arrangement.ts floor at low ppf, scales up on a fine sheet", () => {
  assert.equal(weldTolerancePx(0), 0.75);
  assert.equal(weldTolerancePx(18), 0.75);      // 0.02*18 = 0.36, still below the floor
  assert.equal(weldTolerancePx(100), 2);        // 0.02*100 = 2, above the floor
});

test("frontier: degree 1 — a single incident segment is an end", () => {
  const idx = idxFor([-100, 0, 0, 0]);   // one segment, its second end at the origin
  const node = frontier(idx, 0, 0, 18);
  assert.equal(node.type, "end");
  assert.equal(node.incident.length, 1);
});

test("frontier: degree 2, dead straight — a collinear join (dash gap / CAD split)", () => {
  const idx = idxFor([-100, 0, 0, 0, 0, 0, 100, 0]);   // two collinear horizontal segments meeting at the origin
  const node = frontier(idx, 0, 0, 18);
  assert.equal(node.type, "collinear");
});

test("frontier: degree 2, 90° turn — elbow, angleClass '90'", () => {
  const idx = idxFor([-100, 0, 0, 0, 0, 0, 0, 100]);   // horizontal in, vertical out
  const node = frontier(idx, 0, 0, 18);
  assert.equal(node.type, "elbow");
  assert.equal(node.elbow!.angleClass, "90");
  assert.ok(Math.abs(node.elbow!.turnDeg - 90) < 1e-9);
});

test("frontier: degree 2, 45° turn — elbow, angleClass '45'", () => {
  const idx = idxFor([-100, 0, 0, 0, 0, 0, 100, 100]);   // horizontal in, 45° diagonal out
  const node = frontier(idx, 0, 0, 18);
  assert.equal(node.type, "elbow");
  assert.equal(node.elbow!.angleClass, "45");
});

test("frontier: degree 2, 60° turn — elbow, angleClass 'custom' (not within ±6° of 45 or 90)", () => {
  const bx = 100 * Math.cos(60 * Math.PI / 180), by = 100 * Math.sin(60 * Math.PI / 180);
  const idx = idxFor([-100, 0, 0, 0, 0, 0, bx, by]);
  const node = frontier(idx, 0, 0, 18);
  assert.equal(node.type, "elbow");
  assert.equal(node.elbow!.angleClass, "custom");
});

test("frontier: degree 2, 15° deviation — the unspecified 8°-30° gap is ambiguous, not collinear or elbow", () => {
  const bx = 100 * Math.cos(15 * Math.PI / 180), by = 100 * Math.sin(15 * Math.PI / 180);
  const idx = idxFor([-100, 0, 0, 0, 0, 0, bx, by]);
  const node = frontier(idx, 0, 0, 18);
  assert.equal(node.type, "ambiguous");
});

test("frontier: degree 3 with one collinear through-pair — a tee, the odd one out is the branch", () => {
  const idx = idxFor([-100, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 100]);   // through: seg0/seg1 horizontal; branch: seg2 vertical
  const node = frontier(idx, 0, 0, 18);
  assert.equal(node.type, "tee");
  const branchSeg = node.incident[node.tee!.branch].seg;
  assert.equal(branchSeg, 2, "the vertical segment (index 2) is the branch, not part of the through-pair");
});

test("frontier: degree 3, no collinear pair (a symmetric Y) — ambiguous, no tee forced", () => {
  const p = (deg: number): [number, number] => [100 * Math.cos(deg * Math.PI / 180), 100 * Math.sin(deg * Math.PI / 180)];
  const [x0, y0] = p(0), [x1, y1] = p(120), [x2, y2] = p(240);
  const idx = idxFor([0, 0, x0, y0, 0, 0, x1, y1, 0, 0, x2, y2]);
  const node = frontier(idx, 0, 0, 18);
  assert.equal(node.type, "ambiguous");
});

test("frontier: our own straight through-pair plus one interior crossing segment — a crossing, not a junction", () => {
  const idx = idxFor([
    -100, 0, 0, 0, 0, 0, 100, 0,     // our own run: straight through the origin
    -50, -50, 50, 50,                 // a different duct's diagonal, passing through the origin's interior — no endpoint here
  ]);
  const node = frontier(idx, 0, 0, 18);
  assert.equal(node.type, "crossing");
  assert.equal(node.crossing.length, 1);
  assert.equal(node.crossing[0].seg, 2);
});

test("frontier: four segments each ending exactly at the node, two disjoint collinear pairs — a pure endpoint crossing", () => {
  const idx = idxFor([-100, 0, 0, 0, 0, 0, 100, 0, 0, -100, 0, 0, 0, 0, 0, 100]);   // horizontal pair + vertical pair, all 4 ends at the origin
  const node = frontier(idx, 0, 0, 18);
  assert.equal(node.type, "crossing");
  assert.equal(node.incident.length, 4);
  assert.equal(node.crossing.length, 0, "every end genuinely lands here — nothing merely passes through");
});

test("frontier: filterFn changes the classification — excluding the branch turns a tee into a plain collinear join", () => {
  const idx = idxFor([-100, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 100]);   // same tee fixture as above
  const withBranch = frontier(idx, 0, 0, 18);
  assert.equal(withBranch.type, "tee");
  const withoutBranch = frontier(idx, 0, 0, 18, (seg) => seg !== 2);
  assert.equal(withoutBranch.type, "collinear");
  assert.equal(withoutBranch.incident.length, 2);
});
