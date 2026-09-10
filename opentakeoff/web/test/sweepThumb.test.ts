// Thumbnails for symbol-sweep review. The load-bearing property is that a
// tile shows the ink that is actually there — a false negative silently drops
// linework from the picture someone is about to accept a count from.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normRect, matchBox, buildSegIndex, segmentsInBox, tileLines } from "../src/lib/sweepThumb.js";

/** A little square symbol at (cx,cy), as flat [x1,y1,x2,y2,…]. */
function square(cx: number, cy: number, s = 20): number[] {
  const h = s / 2;
  return [
    cx - h, cy - h, cx + h, cy - h,
    cx + h, cy - h, cx + h, cy + h,
    cx + h, cy + h, cx - h, cy + h,
    cx - h, cy + h, cx - h, cy - h,
  ];
}

test("normRect accepts a marquee dragged in any direction", () => {
  assert.deepEqual(normRect([[10, 20], [50, 60]]), { x0: 10, y0: 20, x1: 50, y1: 60, w: 40, h: 40 });
  // dragged up-and-left — the real case, and the reason the engine does its own
  // Math.min/max on the seed rect
  assert.deepEqual(normRect([[50, 60], [10, 20]]), { x0: 10, y0: 20, x1: 50, y1: 60, w: 40, h: 40 });
  assert.equal(normRect([[10, 20], [10, 60]]), null, "zero width is not a rect");
  // The sweep stores its seed ALREADY normalized and matchBox normalizes
  // again. When this was not idempotent every thumbnail silently vanished
  // while the panel rendered fine around the hole.
  const once = normRect([[50, 60], [10, 20]]);
  assert.deepEqual(normRect(once as any), once, "normalizing twice is normalizing once");
  assert.equal(normRect({ x0: 5, y0: 5, x1: 5, y1: 9 } as any), null);
  assert.equal(normRect([[0, 0], [Number.NaN, 5]] as any), null);
  assert.equal(normRect(undefined as any), null);
});

test("matchBox is the seed footprint centred on the placement, squared for rotation", () => {
  // a 40x20 seed: a 90° instance is 20x40, so the tile has to be 40 either
  // way — the default rotationDeg (0) exercises this exactly as before
  // docs/SYMBOL-SWEEP-AFFINE-GOAL.md's continuous rotation existed.
  const b = matchBox([100, 100], [[0, 0], [40, 20]], 0);
  assert.deepEqual(b, { x0: 80, y0: 80, x1: 120, y1: 120, w: 40, h: 40 });
  const padded = matchBox([100, 100], [[0, 0], [40, 20]], 0.25);
  assert.equal(padded!.w, 60, "pad grows both sides");
  assert.equal(matchBox([0, 0], null as any), null);
  assert.equal(matchBox(undefined as any, [[0, 0], [10, 10]]), null);
});

test("matchBox at an off-grid rotation (33°) is sized to the ACTUAL rotated footprint, not just squared to max(w,h)", () => {
  // docs/SYMBOL-SWEEP-AFFINE-GOAL.md Phase 5 — an off-grid rotated instance
  // is invisible to a tile computed as if rotation only ever meant 0/90/180/
  // 270: a 40x20 seed rotated 33° has a TRUE bounding box of about
  // 40*cos33 + 20*sin33 = 44.4 wide, 40*sin33 + 20*cos33 = 38.6 tall — both
  // bigger than plain max(40,20)=40 on at least one axis. The old (pre-
  // rotationDeg) formula would have clipped real ink at this angle for the
  // wider axis; the fix must not.
  const rigid = matchBox([100, 100], [[0, 0], [40, 20]], 0, 0)!;
  const rotated = matchBox([100, 100], [[0, 0], [40, 20]], 0, 33)!;
  assert.ok(rotated.w > rigid.w, `a 33° tile must be wider than the plain 0° tile: ${rotated.w} vs ${rigid.w}`);
  const expectedW = 40 * Math.cos((33 * Math.PI) / 180) + 20 * Math.sin((33 * Math.PI) / 180);
  const expectedH = 40 * Math.sin((33 * Math.PI) / 180) + 20 * Math.cos((33 * Math.PI) / 180);
  const expectedSide = Math.max(expectedW, expectedH);
  assert.ok(Math.abs(rotated.w - expectedSide) < 0.01, `expected side ${expectedSide}, got ${rotated.w}`);
  // 90° must still equal the plain right-angle case exactly (w/h swap, same max)
  assert.deepEqual(matchBox([100, 100], [[0, 0], [40, 20]], 0, 90), rigid, "90° must match the plain rigid case exactly — no regression for the original right-angle path");
  // an unrotated square symbol at its own worst case (45°) must not clip:
  // the box must be at least the seed's own diagonal (sqrt(2)× a side)
  const sq = matchBox([0, 0], [[0, 0], [20, 20]], 0, 45)!;
  assert.ok(sq.w >= 20 * Math.SQRT2 - 0.01, `a 45°-rotated square tile must cover its own diagonal, got ${sq.w}`);
});

test("segmentsInBox finds the symbol under a match and nothing from its neighbour", () => {
  const segs = [...square(100, 100), ...square(400, 100)];
  const idx = buildSegIndex(segs, 64);
  const box = matchBox([100, 100], [[0, 0], [30, 30]])!;
  const hits = segmentsInBox(segs, idx, box);
  assert.equal(hits.length, 4, "all four edges of the near square, none of the far one");
  for (const i of hits) assert.ok(segs[i * 4] < 200, "no segment from the symbol 300px away");
});

test("a segment straddling a cell boundary is still found — the bug a naive point index has", () => {
  // one long-ish edge crossing several 64px cells
  const segs = [0, 100, 200, 100];
  const idx = buildSegIndex(segs, 64);
  // query a box in the MIDDLE of that span, containing neither endpoint
  const hits = segmentsInBox(segs, idx, { x0: 90, y0: 90, x1: 110, y1: 110, w: 20, h: 20 });
  assert.deepEqual(hits, [0]);
});

test("a sheet-spanning line goes to `wide` and is still found everywhere it passes", () => {
  const segs = [0, 500, 100000, 500];              // a border rule across the sheet
  const idx = buildSegIndex(segs, 64);
  assert.deepEqual(idx.wide, [0], "not filed into ~1500 buckets");
  assert.equal(idx.buckets.size, 0);
  assert.deepEqual(segmentsInBox(segs, idx, { x0: 400, y0: 480, x1: 460, y1: 520, w: 60, h: 40 }), [0]);
  assert.deepEqual(segmentsInBox(segs, idx, { x0: 400, y0: 900, x1: 460, y1: 960, w: 60, h: 60 }), []);
});

test("index skips malformed coordinates rather than poisoning a bucket", () => {
  const segs = [Number.NaN, 0, 10, 10, ...square(100, 100)];
  const idx = buildSegIndex(segs, 64);
  const hits = segmentsInBox(segs, idx, matchBox([100, 100], [[0, 0], [30, 30]])!);
  assert.equal(hits.length, 4);
  assert.ok(!hits.includes(0));
});

test("tileLines rebases into the tile's own coordinates for an SVG viewBox", () => {
  const segs = square(100, 100);
  const idx = buildSegIndex(segs, 64);
  const box = matchBox([100, 100], [[0, 0], [40, 40]], 0)!;   // 80..120
  const lines = tileLines(segs, segmentsInBox(segs, idx, box), box);
  assert.equal(lines.length, 4);
  for (const [ax, ay, bx, by] of lines) {
    for (const v of [ax, ay, bx, by]) assert.ok(v >= 0 && v <= box.w, `${v} inside 0..${box.w}`);
  }
  // the top edge of the square: y = 90 - 80 = 10 in tile space
  assert.ok(lines.some(([, ay, , by]) => ay === 10 && by === 10));
});

test("tileLines caps runaway tiles", () => {
  const segs: number[] = [];
  for (let i = 0; i < 900; i++) segs.push(100, 100 + i * 0.01, 110, 110);
  const idx = buildSegIndex(segs, 64);
  const box = matchBox([105, 105], [[0, 0], [40, 40]])!;
  assert.equal(tileLines(segs, segmentsInBox(segs, idx, box), box, 400).length, 400);
});

test("empty and absent inputs are safe", () => {
  const idx = buildSegIndex([], 64);
  assert.equal(idx.count, 0);
  assert.deepEqual(segmentsInBox([], idx, { x0: 0, y0: 0, x1: 1, y1: 1, w: 1, h: 1 }), []);
  assert.deepEqual(segmentsInBox([], null as any, null as any), []);
  assert.equal(buildSegIndex(undefined as any, 64).count, 0);
});

test("worst realistic sheet stays fast: 155k segments, 62 matches", () => {
  // recorded extremes: a 155,096-segment lighting sheet; 62 receptacles swept
  // on one electrical sheet
  const segs: number[] = [];
  for (let i = 0; i < 155_000; i++) {
    const x = (i * 37) % 6000, y = (i * 53) % 4300;
    segs.push(x, y, x + 8, y + 6);
  }
  const t0 = Date.now();
  const idx = buildSegIndex(segs, 64);
  const seed: [number[], number[]] = [[0, 0], [100, 100]];
  let total = 0;
  for (let m = 0; m < 62; m++) {
    const box = matchBox([(m * 91) % 6000, (m * 71) % 4300], seed)!;
    total += segmentsInBox(segs, idx, box).length;
  }
  const ms = Date.now() - t0;
  assert.ok(total > 0, "the synthetic sheet does put ink under the matches");
  assert.ok(ms < 3000, `index + 62 queries took ${ms}ms`);
});
