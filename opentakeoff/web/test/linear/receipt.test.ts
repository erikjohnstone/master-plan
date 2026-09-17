// linear/receipt.ts — Stage 6: confidence, refusal, and the trace receipt
// (#linear-takeoff WP3.6, opentakeoff-corpus/goals/LINEAR_TAKEOFF.md, plan
// §6.8). Each named factor gets its own precise fixture, isolating it from
// the others exactly the way graph.test.ts/walk.test.ts isolate one
// decision-tree branch per test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTraceReceipt, sizeWithheldRefusal, sizeConflictRefusal, REFUSAL_NO_LINEWORK, REFUSAL_NO_STROKE_FAMILY } from "../../src/lib/linear/receipt.ts";
import { buildSegmentIndex } from "../../src/lib/linear/index.ts";
import { walkBothDirections } from "../../src/lib/linear/walk.ts";
import type { StrokeFamily } from "../../src/lib/linear/strokes.ts";
import type { BoundSize, SizeConflict } from "../../src/lib/linear/sizes.ts";

function idxFor(segs: number[], pen = 4) {
  const n = segs.length >> 2;
  const meta = new Uint8Array(n).fill(pen << 4);
  return buildSegmentIndex(segs, meta, { candidate: new Uint8Array(n).fill(1) });
}
function family(over: Partial<StrokeFamily> = {}): StrokeFamily {
  return { id: 0, pen: 4, dash: 0, confidence: 0.9, evidence: ["layer-name"], ...over };
}
function bound(seg: number, wIn: number, confidence: number, placement: BoundSize["placement"] = "beside", systems: string[] = []): BoundSize {
  return { parsed: { size: { kind: "rect", w_in: wIn, h_in: 6 }, systems, raw: `${wIn}X6` }, seg, placement, confidence, factors: { orientation: 1, placement: confidence } };
}

test("buildTraceReceipt: a clean walk with layer-backed family evidence and one bound size — confidence is the min of the two real grades, no penalty factors", () => {
  const idx = idxFor([0, 0, 200, 0]);
  const walk = walkBothDirections(idx, 0, 18, {});
  const origin = buildTraceReceipt(idx, { seg: 0, x: 0, y: 0 }, walk, family({ confidence: 0.9 }), [bound(0, 12, 0.8)], [], { scaleConfirmed: true });
  assert.equal(origin.method, "traced");
  assert.equal(origin.reviewed, false);
  assert.equal(origin.confidence, 0.8, "min(0.9 family, 0.8 size)");
  assert.deepEqual(origin.confidence_factors, ["stroke-family:layer-name", "size-binding:beside"]);
  assert.equal(origin.trace.labels.length, 1);
  assert.deepEqual(origin.trace.labels[0].size, { kind: "rect", w_in: 12, h_in: 6 });
  assert.deepEqual(origin.trace.segs, walk.segs);
  assert.deepEqual(origin.trace.seed, { seg: 0, x: 0, y: 0 });
});

test("buildTraceReceipt: a bound size's own systems ride along on its label record", () => {
  const idx = idxFor([0, 0, 200, 0]);
  const walk = walkBothDirections(idx, 0, 18, {});
  const origin = buildTraceReceipt(idx, { seg: 0, x: 0, y: 0 }, walk, family(), [bound(0, 12, 0.8, "beside", ["SA"])], [], { scaleConfirmed: true });
  assert.deepEqual(origin.trace.labels[0].systems, ["SA"]);
});

test("buildTraceReceipt: no size label reachable on this run — size_missing is named but never drags confidence down (a withheld size still measures LF)", () => {
  const idx = idxFor([0, 0, 200, 0]);
  const walk = walkBothDirections(idx, 0, 18, {});
  const origin = buildTraceReceipt(idx, { seg: 0, x: 0, y: 0 }, walk, family({ confidence: 0.9 }), [], [], { scaleConfirmed: true });
  assert.equal(origin.confidence, 0.9, "size_missing contributes no numeric grade to the minimum");
  assert.ok(origin.confidence_factors.includes("size_missing"));
  assert.equal(origin.trace.labels.length, 0);
});

test("buildTraceReceipt: two labels disagreeing on a walked segment are withheld with both, per plan §6.6/§6.8", () => {
  const idx = idxFor([0, 0, 200, 0]);
  const walk = walkBothDirections(idx, 0, 18, {});
  const conflict: SizeConflict = { seg: 0, candidates: [bound(0, 12, 0.9), bound(0, 16, 0.9)] };
  const origin = buildTraceReceipt(idx, { seg: 0, x: 0, y: 0 }, walk, family(), [], [conflict], { scaleConfirmed: true });
  assert.ok(origin.confidence_factors.includes("size_withheld"));
  assert.equal(origin.trace.labels.length, 2);
  assert.ok(origin.trace.labels.every((l) => l.withheld === true));
  assert.ok(origin.trace.labels.every((l) => l.size === undefined), "a withheld label never carries a chosen size");
});

test("buildTraceReceipt: opts.labelText is keyed by the BINDING, not the segment — two conflicting labels on one segment still get their own distinct bbox each", () => {
  const idx = idxFor([0, 0, 200, 0]);
  const walk = walkBothDirections(idx, 0, 18, {});
  const small = bound(0, 12, 0.9), big = bound(0, 16, 0.9);   // same seg, deliberately distinct binding identities
  const conflict: SizeConflict = { seg: 0, candidates: [small, big] };
  const bboxes = new Map([[small, { x0: 10, y0: 10, x1: 20, y1: 20 }], [big, { x0: 90, y0: 90, x1: 100, y1: 100 }]]);
  const origin = buildTraceReceipt(idx, { seg: 0, x: 0, y: 0 }, walk, family(), [], [conflict], { scaleConfirmed: true, labelText: (b) => bboxes.get(b) });
  const smallLabel = origin.trace.labels.find((l) => l.text === "12X6");
  const bigLabel = origin.trace.labels.find((l) => l.text === "16X6");
  assert.deepEqual({ x0: smallLabel!.x0, y0: smallLabel!.y0 }, { x0: 10, y0: 10 });
  assert.deepEqual({ x0: bigLabel!.x0, y0: bigLabel!.y0 }, { x0: 90, y0: 90 });
});

test("buildTraceReceipt: a conflict on a DIFFERENT (unwalked) segment never contaminates this run's receipt", () => {
  const idx = idxFor([0, 0, 200, 0, 500, 500, 700, 500]);
  const walk = walkBothDirections(idx, 0, 18, {});   // walks only segment 0
  const conflict: SizeConflict = { seg: 1, candidates: [bound(1, 12, 0.9), bound(1, 16, 0.9)] };
  const origin = buildTraceReceipt(idx, { seg: 0, x: 0, y: 0 }, walk, family(), [], [conflict], { scaleConfirmed: true });
  assert.ok(origin.confidence_factors.includes("size_missing"), "the OTHER segment's conflict is irrelevant to this run");
  assert.equal(origin.trace.labels.length, 0);
});

test("buildTraceReceipt: an ambiguous stop is disclosed as a factor, drags confidence down, and surfaces the candidate fan", () => {
  const p = (deg: number): [number, number] => [100 * Math.cos((deg * Math.PI) / 180), 100 * Math.sin((deg * Math.PI) / 180)];
  const [x1, y1] = p(120), [x2, y2] = p(240);
  const idx = idxFor([-100, 0, 0, 0, 0, 0, x1, y1, 0, 0, x2, y2]);
  const walk = walkBothDirections(idx, 0, 18, {});
  assert.equal(walk.stops.forward.reason, "ambiguous", "sanity: this fixture is the same symmetric-Y shape walk.test.ts uses");
  const origin = buildTraceReceipt(idx, { seg: 0, x: -100, y: 0 }, walk, family({ confidence: 0.9 }), [], [], { scaleConfirmed: true });
  assert.ok(origin.confidence_factors.includes("ambiguous_stop"));
  assert.ok(origin.confidence <= 0.5);
  assert.ok(origin.trace.candidates && origin.trace.candidates.length === 2);
});

test("buildTraceReceipt: layer-unclassified fires when the family's own evidence isn't layer-name", () => {
  const idx = idxFor([0, 0, 200, 0]);
  const walk = walkBothDirections(idx, 0, 18, {});
  const origin = buildTraceReceipt(idx, { seg: 0, x: 0, y: 0 }, walk, family({ confidence: 0.9, evidence: ["pen-weight-prior"] }), [], [], { scaleConfirmed: true });
  assert.ok(origin.confidence_factors.includes("layer-unclassified"));
  assert.equal(origin.confidence, 0.6, "min(0.9 family, 0.6 layer-unclassified penalty)");
});

test("buildTraceReceipt: scale_unconfirmed fires when the caller reports a guessed, not detected, scale", () => {
  const idx = idxFor([0, 0, 200, 0]);
  const walk = walkBothDirections(idx, 0, 18, {});
  const origin = buildTraceReceipt(idx, { seg: 0, x: 0, y: 0 }, walk, family({ confidence: 0.9 }), [], [], { scaleConfirmed: false });
  assert.ok(origin.confidence_factors.includes("scale_unconfirmed"));
  assert.equal(origin.confidence, 0.7, "min(0.9 family, 0.7 scale_unconfirmed penalty)");
});

test("buildTraceReceipt: drawn_width_px records the seed segment's own device pen width, not a computed cross-check", () => {
  const idx = idxFor([0, 0, 200, 0], 6);   // pen 6 => meta byte 6<<4, so meta[0]>>4 === 6
  const walk = walkBothDirections(idx, 0, 18, {});
  const origin = buildTraceReceipt(idx, { seg: 0, x: 0, y: 0 }, walk, family(), [], [], { scaleConfirmed: true });
  assert.equal(origin.trace.drawn_width_px, 6);
});

test("refusal texts match plan §6.8 verbatim", () => {
  assert.equal(REFUSAL_NO_LINEWORK, "No routed linework under the cursor — click on a drawn duct or pipe line, or switch to manual (M)");
  assert.equal(REFUSAL_NO_STROKE_FAMILY, "This sheet's linework has no stroke family I can attribute to ductwork or piping — trace manually, or open Layers to mark one.");
  assert.equal(sizeWithheldRefusal("12x8", 16), "Size withheld: the label reads 12x8 but the drawn width is 16 in. Pick one.");
});

test("sizeConflictRefusal names both disagreeing labels", () => {
  const conflict: SizeConflict = { seg: 0, candidates: [bound(0, 12, 0.9), bound(0, 16, 0.9)] };
  assert.equal(sizeConflictRefusal(conflict), 'Size withheld: two labels disagree on this run — "12X6" vs. "16X6". Pick one.');
});
