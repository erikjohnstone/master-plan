// linear/run.ts — the derived per-segment/per-vertex read of an authored
// `run` block (#linear-takeoff WP1.1, opentakeoff-corpus/goals/LINEAR_TAKEOFF.md).
// Invariants under test: LF per segment sums to the same total openLen
// already computes; turn angle is the domain convention (0 = straight,
// 90 = a square elbow, 180 = a full reversal) with a real geometric example,
// not an assumed formula; a straight-through vertex never appears in the
// vertex list at all; size carries forward from the nearest override at or
// before a segment, never guessed past the last one set; totals_by_size
// sums only sized segments; an explicit vertex_override always wins over
// the geometric guess.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRunSegments, runSizeKey, sizeLabel, type RunSize } from "../../src/lib/linear/run.ts";

test("runSizeKey: one canonical string per size kind", () => {
  assert.equal(runSizeKey({ kind: "rect", w_in: 12, h_in: 6 }), "rect:12x6");
  assert.equal(runSizeKey({ kind: "round", d_in: 8 }), "round:8");
  assert.equal(runSizeKey({ kind: "oval", major_in: 24, minor_in: 12 }), "oval:24x12");
  assert.equal(runSizeKey({ kind: "pipe", nps_in: 2 }), "pipe:2");
});

// #linear-takeoff (WP1.3/WP1.4): moved here from canvasUtil.js so React-free,
// MCP-shared consumers (xlsx.js, markedset.js, dxf.ts) can format a size
// without pulling in canvasUtil.js's own React dependency.
test("sizeLabel: one compact string per RunSize kind, the way an estimator writes it on a plan", () => {
  assert.equal(sizeLabel({ kind: "rect", w_in: 12, h_in: 6 }), "12x6");
  assert.equal(sizeLabel({ kind: "round", d_in: 8 }), "8\"ø");
  assert.equal(sizeLabel({ kind: "oval", major_in: 24, minor_in: 12 }), "24x12 oval");
  assert.equal(sizeLabel({ kind: "pipe", nps_in: 2 }), "2\" pipe");
  assert.equal(sizeLabel(null), null);
  assert.equal(sizeLabel(undefined), null);
  assert.equal(sizeLabel({ kind: "hex", w_in: 4 } as unknown as RunSize), null, "an unrecognized kind never fabricates a label");
});

test("resolveRunSegments: null for fewer than 2 points, never a zero-length placeholder", () => {
  assert.equal(resolveRunSegments([], 1, undefined), null);
  assert.equal(resolveRunSegments([[0, 0]], 1, undefined), null);
});

test("resolveRunSegments: per-segment LF sums to the same total as the run's own LF (a straight two-segment run)", () => {
  // 0 -> (100,0) -> (100,100) at upp = 0.1 ft/px: 10 ft + 10 ft = 20 ft
  const pts: [number, number][] = [[0, 0], [100, 0], [100, 100]];
  const r = resolveRunSegments(pts, 0.1, undefined)!;
  assert.equal(r.segments.length, 2);
  assert.equal(r.segments[0].lf, 10);
  assert.equal(r.segments[1].lf, 10);
  const totalFromSegments = r.segments.reduce((n, s) => n + s.lf, 0);
  assert.ok(Math.abs(totalFromSegments - 20) < 1e-9);
});

test("resolveRunSegments: turn angle is the domain convention — 0 straight, 90 a square elbow, 180 a full reversal", () => {
  // A dead-straight run: (0,0) -> (100,0) -> (200,0) — no vertex reported at all.
  const straight = resolveRunSegments([[0, 0], [100, 0], [200, 0]], 1, undefined)!;
  assert.equal(straight.vertices.length, 0, "a straight-through point is not a vertex");

  // A classic L-shaped elbow: right, then up — 90° elbow.
  const elbow90 = resolveRunSegments([[0, 0], [100, 0], [100, 100]], 1, undefined)!;
  assert.equal(elbow90.vertices.length, 1);
  assert.equal(elbow90.vertices[0].kind, "elbow");
  assert.equal(elbow90.vertices[0].angle_deg, 90);
  assert.equal(elbow90.vertices[0].angle_class, "square");

  // A 45° turn: right, then up-and-right at 45°.
  const elbow45 = resolveRunSegments([[0, 0], [100, 0], [200, 100]], 1, undefined)!;
  assert.equal(elbow45.vertices[0].angle_deg, 45);
  assert.equal(elbow45.vertices[0].angle_class, "45");

  // A full reversal: right, then back left along the same line — 180°.
  const reversal = resolveRunSegments([[0, 0], [100, 0], [0, 0]], 1, undefined)!;
  assert.equal(reversal.vertices[0].angle_deg, 180);
  assert.equal(reversal.vertices[0].angle_class, "custom");

  // A near-square corner within tolerance (±6°) still reads "square" —
  // (0,0)->(100,0)->(104,100) turns ~87.7° (computed: acos(400/10008)).
  const near90 = resolveRunSegments([[0, 0], [100, 0], [104, 100]], 1, undefined)!;
  assert.ok(near90.vertices[0].angle_deg! > 85 && near90.vertices[0].angle_deg! < 90);
  assert.equal(near90.vertices[0].angle_class, "square");
});

test("resolveRunSegments: a zero-length edge is treated as straight (no corner), never a fabricated 90°/180°", () => {
  const r = resolveRunSegments([[0, 0], [0, 0], [100, 0]], 1, undefined)!;
  assert.equal(r.vertices.length, 0);
});

test("resolveRunSegments: size carries forward from the nearest at-or-before override, never invented past the last one set", () => {
  const size12x6: RunSize = { kind: "rect", w_in: 12, h_in: 6 };
  const size16x8: RunSize = { kind: "rect", w_in: 16, h_in: 8 };
  // Four segments (5 points): size set at segment 0 (12x6) and segment 2 (16x8).
  const pts: [number, number][] = [[0, 0], [10, 0], [20, 0], [30, 0], [40, 0]];
  const r = resolveRunSegments(pts, 1, { size_overrides: { "0": size12x6, "2": size16x8 } })!;
  assert.equal(r.segments.length, 4);
  assert.deepEqual(r.segments[0].size, size12x6);
  assert.equal(r.segments[0].size_src, "manual");
  assert.deepEqual(r.segments[1].size, size12x6, "segment 1 carries segment 0's size forward");
  assert.deepEqual(r.segments[2].size, size16x8);
  assert.deepEqual(r.segments[3].size, size16x8, "segment 3 carries segment 2's size forward");
});

test("resolveRunSegments: a segment before any override is withheld, not guessed backward from a later one", () => {
  const size2in: RunSize = { kind: "pipe", nps_in: 2 };
  const pts: [number, number][] = [[0, 0], [10, 0], [20, 0]];
  const r = resolveRunSegments(pts, 1, { size_overrides: { "1": size2in } })!;
  assert.equal(r.segments[0].size, undefined);
  assert.equal(r.segments[0].size_src, "withheld");
  assert.deepEqual(r.segments[1].size, size2in);
});

test("resolveRunSegments: totals_by_size sums only sized segments, keyed canonically", () => {
  const size2in: RunSize = { kind: "pipe", nps_in: 2 };
  const size3in: RunSize = { kind: "pipe", nps_in: 3 };
  const pts: [number, number][] = [[0, 0], [10, 0], [20, 0], [30, 0]];
  const r = resolveRunSegments(pts, 0.5, { size_overrides: { "0": size2in, "2": size3in } })!;
  // seg0 (idx0, 5ft) + seg1 (idx0 carried, 5ft) = 10ft on pipe:2; seg2 (idx2, 5ft) on pipe:3
  assert.deepEqual(r.totals_by_size, { "pipe:2": 10, "pipe:3": 5 });
});

test("resolveRunSegments: an explicit vertex_override always wins over the geometric guess", () => {
  // A straight run would normally have NO vertex reported at all — force one.
  const straightPts: [number, number][] = [[0, 0], [100, 0], [200, 0]];
  const forced = resolveRunSegments(straightPts, 1, { vertex_overrides: { "1": { kind: "tee" } } })!;
  assert.equal(forced.vertices.length, 1);
  assert.equal(forced.vertices[0].kind, "tee");
  assert.equal(forced.vertices[0].manual, true);
  assert.equal(forced.vertices[0].angle_deg, undefined, "an overridden vertex doesn't carry a fabricated angle");

  // A real 90° elbow can be relabeled by an override (e.g. the user knows
  // it's actually a riser, not a plan-view elbow).
  const elbowPts: [number, number][] = [[0, 0], [100, 0], [100, 100]];
  const relabeled = resolveRunSegments(elbowPts, 1, { vertex_overrides: { "1": { kind: "riser", dir: "up" } } })!;
  assert.equal(relabeled.vertices[0].kind, "riser");
  assert.equal(relabeled.vertices[0].dir, "up");
});

test("resolveRunSegments: with no `run` argument at all, resolves geometry-only (no sizes, vertices from turns alone)", () => {
  const r = resolveRunSegments([[0, 0], [100, 0], [100, 100]], 1, undefined)!;
  assert.equal(r.segments.every((s) => s.size_src === "withheld"), true);
  assert.deepEqual(r.totals_by_size, {});
  assert.equal(r.vertices.length, 1);
});
