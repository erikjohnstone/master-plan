// The ruler that measures the app's own table boxes. A ruler that drifts from
// the one the bake-off reports is worse than no ruler, so the arithmetic is
// pinned to `boxscore.py`'s own functions by a generated fixture, and the
// assignment is pinned to be order-independent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  eob, iou, boxArea, boxUnion, pxToPt, hungarian, assignByIou, CORRECT_EOB_PT,
  type Box,
} from "../bench/boxScore.js";

const parity = JSON.parse(readFileSync(
  fileURLToPath(new URL("./fixtures/boxScoreParity.json", import.meta.url)), "utf8",
)) as { cases: { a: number[]; b: number[]; eob: number; iou: number }[] };

test("PARITY: every case agrees with boxscore.py's own iou/eob to 1e-9", () => {
  assert.ok(parity.cases.length >= 40, `${parity.cases.length} cases`);
  for (const c of parity.cases) {
    const a = c.a as Box, b = c.b as Box;
    const label = `a=${JSON.stringify(a)} b=${JSON.stringify(b)}`;
    assert.ok(Math.abs(eob(a, b) - c.eob) < 1e-9, `eob ${label}: ${eob(a, b)} vs ${c.eob}`);
    assert.ok(Math.abs(iou(a, b) - c.iou) < 1e-9, `iou ${label}: ${iou(a, b)} vs ${c.iou}`);
  }
});

test("eob is the WORST edge, not the average — a clipped schedule must not average away", () => {
  // three edges perfect, the bottom 200pt short: two rows of a twelve-row
  // schedule missing. IoU still looks respectable; EoB does not.
  const truth: Box = [100, 100, 500, 700];
  const clipped: Box = [100, 100, 500, 500];
  assert.equal(eob(truth, clipped), 200);
  assert.ok(iou(truth, clipped) > 0.6, "which is exactly why IoU@0.5 is not the bar");
  assert.ok(eob(truth, clipped) > CORRECT_EOB_PT);
});

test("eob is symmetric and zero only on an exact box", () => {
  const a: Box = [1, 2, 3, 4], b: Box = [1.5, 2, 3, 4];
  assert.equal(eob(a, b), eob(b, a));
  assert.equal(eob(a, a), 0);
  assert.equal(eob(a, b), 0.5);
});

test("iou: containment, disjoint, edge-touching, and a degenerate box", () => {
  assert.equal(iou([0, 0, 100, 100], [0, 0, 100, 100]), 1);
  assert.equal(iou([0, 0, 100, 100], [25, 25, 75, 75]), 2500 / 10000);
  assert.equal(iou([0, 0, 10, 10], [20, 20, 30, 30]), 0);
  assert.equal(iou([0, 0, 10, 10], [10, 0, 20, 10]), 0, "sharing an edge is not overlapping");
  // two zero-area boxes are unmeasurable, not perfectly agreed
  assert.equal(iou([5, 5, 5, 5], [5, 5, 5, 5]), 0);
});

test("iou survives the negative coordinates a non-origin MediaBox produces", () => {
  // 009_FL#30's page transform is [2,0,0,-2,3024,2160]; sheets like it put real
  // boxes at negative x/y, and a scorer that assumed positives would score 0.
  const a: Box = [-1512, -1080, -1000, -500];
  assert.equal(iou(a, a), 1);
  assert.ok(iou(a, [-1510, -1078, -1002, -502]) > 0.98);
  assert.equal(eob(a, [-1510, -1078, -1002, -502]), 2);
});

test("boxUnion skips malformed entries rather than dragging an edge to zero", () => {
  const cells = [
    [10, 20, 60, 34],
    { nope: true },
    [0, 0, Number.NaN, 5],
    [60, 20, 110, 40],
    [1, 2, 3],
  ];
  assert.deepEqual(boxUnion(cells), [10, 20, 110, 40]);
  assert.equal(boxUnion([]), null);
  assert.equal(boxUnion([{ x: 1 }]), null);
});

test("boxArea never goes negative on an inverted box", () => {
  assert.equal(boxArea([0, 0, 10, 10]), 100);
  assert.equal(boxArea([10, 10, 0, 0]), 0);
});

test("pxToPt divides by the scale the caller states, and refuses a bad one", () => {
  assert.deepEqual(pxToPt([2048.6, 206, 3704.6, 1474.4], 2), [1024.3, 103, 1852.3, 737.2]);
  assert.throws(() => pxToPt([0, 0, 1, 1], 0), /scale must be positive/);
  assert.throws(() => pxToPt([0, 0, 1, 1], -2), /scale must be positive/);
});

test("hungarian finds the OPTIMAL assignment, which greedy does not", () => {
  // greedy takes row 0's own best (col 0, cost 1) and is then forced into
  // cost 100 — total 101. The optimum pairs the other way: 2 + 1.5 = 3.5.
  const cost = [
    [1, 2],
    [1.5, 100],
  ];
  assert.deepEqual(hungarian(cost), [1, 0]);
});

test("hungarian handles more rows than columns and more columns than rows", () => {
  assert.deepEqual(hungarian([[1, 9], [9, 1], [5, 5]]).filter((j) => j >= 0).sort(), [0, 1]);
  const wide = hungarian([[1, 9, 9], [9, 9, 1]]);
  assert.deepEqual(wide, [0, 2]);
  assert.deepEqual(hungarian([]), []);
  assert.deepEqual(hungarian([[]]), [-1]);
});

test("assignByIou is 1-to-1 and ORDER-INDEPENDENT", () => {
  // two emitted boxes over one authored box: exactly one may claim it.
  const authored: Box[] = [[0, 0, 100, 100], [200, 0, 300, 100]];
  const emitted: Box[] = [[202, 2, 298, 98], [2, 2, 98, 98]];
  const pairs = assignByIou(emitted, authored);
  assert.equal(pairs.length, 2);
  assert.deepEqual(pairs.map((p) => [p.a, p.b]).sort(), [[0, 1], [1, 0]]);

  // reversing the emitted order must produce the same pairing of boxes
  const rev = assignByIou([emitted[1], emitted[0]], authored);
  const asPairs = (ps: typeof pairs, es: Box[]) =>
    ps.map((p) => `${JSON.stringify(es[p.a])}->${p.b}`).sort();
  assert.deepEqual(asPairs(pairs, emitted), asPairs(rev, [emitted[1], emitted[0]]));
});

test("assignByIou drops a pairing the assignment only made because nothing else was left", () => {
  const authored: Box[] = [[0, 0, 100, 100]];
  // an emitted box on the far side of the sheet — a match here would be a lie
  const emitted: Box[] = [[2000, 2000, 2100, 2100]];
  assert.deepEqual(assignByIou(emitted, authored), []);
  // and a real but poor overlap is still refused below the floor — 100pt² of
  // intersection against 19,900 of union is IoU 0.005, a corner touch
  assert.deepEqual(assignByIou([[90, 90, 190, 190]], authored, 0.3), []);
  assert.equal(assignByIou([[90, 90, 190, 190]], authored, 0.001).length, 1);
  assert.deepEqual(assignByIou([], authored), []);
  assert.deepEqual(assignByIou(emitted, []), []);
});

test("assignByIou reports the eob of the pair it chose, in the inputs' own units", () => {
  const pairs = assignByIou([[10, 10, 110, 110]], [[10, 10, 110, 113]]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].eob, 3);
  assert.ok(pairs[0].eob <= CORRECT_EOB_PT);
});
