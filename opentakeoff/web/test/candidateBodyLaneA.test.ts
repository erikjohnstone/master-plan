// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 Lane A — first slice:
// grouping Form XObject invocations by a content signature computed from
// their own LOCAL (placement-inverted) geometry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { computeFormContentSignatures } from "../src/lib/candidateBodyLaneA.ts";

const OPS = {
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
  paintFormXObjectBegin: 33, paintFormXObjectEnd: 34, setStrokeRGBColor: 40,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];
const strokeRGB = (r: number, g: number, b: number): Op => [OPS.setStrokeRGBColor, [r, g, b]];
const formBegin = (matrix: number[]): Op => [OPS.paintFormXObjectBegin, [matrix, null]];
const formEnd = (): Op => [OPS.paintFormXObjectEnd, null];

// One reusable "L" shape's own local content: a 40-unit leg and a 15-unit
// leg meeting at a corner, always drawn identically inside the form.
const L_LOCAL: Op[] = [line(0, 0, 40, 0), line(40, 0, 40, 15)];

function signaturesFor(ops: Op[], opts?: Parameters<typeof computeFormContentSignatures>[2]) {
  const geo = extractVectorGeometry(opList(ops), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  return computeFormContentSignatures(idx, geo.formInvocations ?? [], opts);
}

const closedRect = (x: number, y: number, w: number, h: number): Op => [OPS.constructPath, [[OPS.rectangle], [x, y, w, h]]];

test("Lane A: page-level ink (no Form XObject at all) produces no invocation signatures", () => {
  const r = signaturesFor([line(0, 0, 10, 0)]);
  assert.deepEqual(r.invocations, []);
  assert.deepEqual(r.repeatedGroups, []);
});

test("Lane A: two placements of the SAME reusable content at different positions AND rotations sign identically", () => {
  const r = signaturesFor([
    formBegin([1, 0, 0, 1, 100, 100]), ...L_LOCAL, formEnd(),   // translated only
    formBegin([0, 1, -1, 0, 500, 500]), ...L_LOCAL, formEnd(),  // rotated 90 + translated
  ]);
  assert.equal(r.invocations.length, 2);
  assert.ok(r.invocations.every((i) => i.signature));
  assert.equal(r.invocations[0].signature!.hash, r.invocations[1].signature!.hash);
  assert.equal(r.repeatedGroups.length, 1);
  assert.deepEqual(r.repeatedGroups[0].sort(), r.invocations.map((i) => i.invocationId).sort());
});

test("Lane A: two placements of a GENUINELY DIFFERENT shape sign differently", () => {
  const OTHER: Op[] = [line(0, 0, 10, 0), line(10, 0, 10, 10)]; // equal-leg corner, not the L's 40/15 asymmetry
  const r = signaturesFor([
    formBegin([1, 0, 0, 1, 0, 0]), ...L_LOCAL, formEnd(),
    formBegin([1, 0, 0, 1, 200, 0]), ...OTHER, formEnd(),
  ]);
  assert.notEqual(r.invocations[0].signature!.hash, r.invocations[1].signature!.hash);
  assert.deepEqual(r.repeatedGroups, [], "no repeated group when nothing actually repeats");
});

test("Lane A: an invocation with no vector content (image-only or empty form) reports a null signature, not a crash", () => {
  const r = signaturesFor([formBegin([1, 0, 0, 1, 0, 0]), formEnd(), line(0, 0, 10, 0)]);
  assert.equal(r.invocations.length, 1);
  assert.equal(r.invocations[0].signature, null);
  assert.deepEqual(r.invocations[0].primitiveIds, []);
});

test("Lane A: a nested invocation is signed independently of its parent", () => {
  const r = signaturesFor([
    formBegin([1, 0, 0, 1, 0, 0]),
    line(0, 0, 5, 0),
    formBegin([1, 0, 0, 1, 50, 50]),
    ...L_LOCAL,
    formEnd(),
    formEnd(),
  ]);
  assert.equal(r.invocations.length, 2);
  const outer = r.invocations.find((i) => i.depth === 1)!;
  const inner = r.invocations.find((i) => i.depth === 2)!;
  assert.ok(outer.signature && inner.signature);
  assert.notEqual(outer.signature!.hash, inner.signature!.hash);
});

test("Lane A: white-ink (invisible) primitives are excluded from an invocation's own primitiveIds and reported as excludedInvisibleCount, not silently signed as real content", () => {
  // real-sheet finding (Cherry Point #12, see invisibleInk.ts/PROGRESS.md):
  // a Form's own content can be dominated by white-on-white masking ink
  // — this reproduces the same shape at fixture scale: one real visible
  // stroke plus two white (invisible) ones inside the same invocation.
  const r = signaturesFor([
    formBegin([1, 0, 0, 1, 0, 0]),
    line(0, 0, 40, 0),                              // visible (default black)
    strokeRGB(255, 255, 255), line(40, 0, 40, 15),  // invisible — white ink
    line(40, 15, 60, 15),                            // still white (color persists)
    formEnd(),
  ]);
  assert.equal(r.invocations.length, 1);
  assert.equal(r.invocations[0].primitiveIds.length, 1, "only the one visible primitive remains");
  assert.equal(r.invocations[0].excludedInvisibleCount, 2, "both white-ink primitives are counted as excluded, not silently dropped");
});

test("Lane A: an invocation whose content is ENTIRELY invisible ink reports a null signature (no visible content to sign), with the exclusion count still disclosed", () => {
  const r = signaturesFor([
    formBegin([1, 0, 0, 1, 0, 0]),
    strokeRGB(255, 255, 255), line(0, 0, 40, 0), line(40, 0, 40, 15),
    formEnd(),
  ]);
  assert.equal(r.invocations[0].signature, null);
  assert.deepEqual(r.invocations[0].primitiveIds, []);
  assert.equal(r.invocations[0].excludedInvisibleCount, 2);
});

test("Lane A: an invocation whose own page-space bbox touches the page's own edge is flagged touchesPageEdge, real Cherry Point Air Traffic Tower #11 shape (see this module's own header)", () => {
  // real finding: three nested axis-aligned rectangles (a title-block
  // cell's own border + an internal divider box), pure black, sitting
  // flush against the page's own left edge (x=0) and bottom edge
  // (y = the sheet's own height) -- reproduced here at the same relative
  // shape, smaller scale. A real symbol is never expected to sit flush
  // against the literal page boundary (real drawings keep a margin).
  const pageBounds = { width: 500, height: 300 };
  const r = signaturesFor([
    formBegin([1, 0, 0, 1, 0, 0]),
    closedRect(0, 280, 200, 20), // outer box: x in [0,200], y in [280,300] -- touches x=0 AND y=height(300)
    closedRect(2, 282, 196, 16), // inner divider box, inset by 2 on every side
    formEnd(),
  ]);
  assert.equal(r.invocations.length, 1);
  assert.equal(r.invocations[0].touchesPageEdge, false, "test premise: pageBounds was NOT supplied on this first call, so the flag stays false even though the shape does touch the edge");

  const r2 = signaturesFor([
    formBegin([1, 0, 0, 1, 0, 0]),
    closedRect(0, 280, 200, 20),
    closedRect(2, 282, 196, 16),
    formEnd(),
  ], { pageBounds });
  assert.equal(r2.invocations[0].touchesPageEdge, true, "with pageBounds supplied, this real title-block-cell shape is correctly flagged");
});

test("Lane A: an invocation drawn safely inside the page margins is NOT flagged touchesPageEdge, even with pageBounds supplied", () => {
  const pageBounds = { width: 500, height: 300 };
  const r = signaturesFor([
    formBegin([1, 0, 0, 1, 100, 100]), ...L_LOCAL, formEnd(), // well inside [500,300]
  ], { pageBounds });
  assert.equal(r.invocations[0].touchesPageEdge, false);
});

test("Lane A: touchesPageEdge tolerates near-edge floating-point placement (within PAGE_EDGE_TOLERANCE), not just an exact 0", () => {
  const pageBounds = { width: 500, height: 300 };
  const r = signaturesFor([
    formBegin([1, 0, 0, 1, 0.3, 0]), ...L_LOCAL, formEnd(), // x0 lands at 0.3, not exactly 0
  ], { pageBounds });
  assert.equal(r.invocations[0].touchesPageEdge, true, "0.3 units from the edge is within the disclosed tolerance, not a real margin");
});

test("Lane A: an invocation with empty primitiveIds (fully invisible or no content) is never flagged touchesPageEdge, regardless of pageBounds", () => {
  const pageBounds = { width: 500, height: 300 };
  const r = signaturesFor([formBegin([1, 0, 0, 1, 0, 0]), formEnd()], { pageBounds });
  assert.equal(r.invocations[0].primitiveIds.length, 0);
  assert.equal(r.invocations[0].touchesPageEdge, false, "nothing to test against the page edge");
});

test("Lane A: a primitive-count cap breach reports incomplete instead of a silent partial pass", () => {
  const geo = extractVectorGeometry(opList([formBegin([1, 0, 0, 1, 0, 0]), ...L_LOCAL, formEnd()]), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const r = computeFormContentSignatures(idx, geo.formInvocations ?? [], { maxPrimitives: 1 });
  assert.equal(r.incomplete, true);
  assert.deepEqual(r.invocations, []);
  assert.match(r.incompleteReason!, /exceeds the 1-primitive Lane A cap/);
});
