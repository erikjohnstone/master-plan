// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 6 first slice — one
// evidence graph per sheet/local region (requirement 1): tag tokens,
// candidate bodies, leaders, legend references, schedule identities,
// system/carrier attachments, plus the minimal candidate edges
// connecting them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { buildSheetEvidenceGraph } from "../src/lib/evidenceGraph.ts";

const OPS = {
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];
const closedRect = (x: number, y: number, w: number, h: number): Op =>
  [OPS.constructPath, [[OPS.rectangle], [x, y, w, h]]];
const span = (str: string, x0: number, y0: number, w = 32, h = 17) => ({ str, x0, y0, x1: x0 + w, y1: y0 + h });

function buildIdx(ops: Op[]) {
  const geo = extractVectorGeometry(opList(ops), ID, OPS);
  return buildVectorSceneIndex(geo);
}

test("evidence graph: a tag token adjacent to a candidate body produces a real tag<->body edge, carrying via and distance -- never a single collapsed confidence", () => {
  // the same "FD1" adjacency fixture symbolLabels.test.ts's own suite
  // already proves works via plain adjacency (a small rect body at the
  // body's own SEPARATE real location, not coincident with the tag's
  // own text box -- labelPlacements refuses a candidate sitting inside
  // its own naming token's box, by design, so the two must differ).
  const idx = buildIdx([closedRect(93, 125, 10, 10)]);
  const body = { id: 0, primitiveIds: idx.primitives.map((_, i) => i), x0: 93, y0: 125, x1: 103, y1: 135 };
  const graph = buildSheetEvidenceGraph(idx, [body], [span("FD1", 90, 92, 12)], [], undefined, [], []);
  assert.equal(graph.tags.length, 1);
  assert.equal(graph.tags[0].label, "FD1");
  assert.equal(graph.bodies.length, 1);
  assert.equal(graph.tagBodyEdges.length, 1);
  assert.equal(graph.tagBodyEdges[0].tagId, graph.tags[0].id);
  assert.equal(graph.tagBodyEdges[0].bodyId, graph.bodies[0].id);
  assert.equal(graph.tagBodyEdges[0].via, "adjacent");
  assert.ok(graph.tagBodyEdges[0].distancePx >= 0);
});

test("evidence graph: a tag far from every candidate body produces NO tag<->body edge -- never a forced/guessed match", () => {
  const idx = buildIdx([closedRect(0, 0, 10, 10)]);
  const body = { id: 0, primitiveIds: idx.primitives.map((_, i) => i), x0: 0, y0: 0, x1: 10, y1: 10 };
  const graph = buildSheetEvidenceGraph(idx, [body], [span("P-7", 5000, 5000)], [], undefined, [], []);
  assert.equal(graph.tagBodyEdges.length, 0);
});

test("evidence graph: a tag matching a schedule row's own key produces a tag<->schedule edge, via the SAME markid.ts normalization schedule reconciliation already uses -- never a bespoke string comparison", () => {
  const idx = buildIdx([closedRect(0, 0, 10, 10)]);
  const graph = buildSheetEvidenceGraph(
    idx, [], [span("CD-1", 0, 0)], [], undefined, [],
    [{ key: "CD-1", sheet: "M101", cells: { TYPE: { text: "Ceiling Diffuser" } } }],
  );
  assert.equal(graph.tagScheduleEdges.length, 1);
  assert.equal(graph.tagScheduleEdges[0].tagId, graph.tags[0].id);
  assert.equal(graph.tagScheduleEdges[0].scheduleId, graph.schedules[0].id);
});

test("evidence graph: hyphen/space variants still match a schedule row (markid.ts's own normalization), but an unrelated key does not", () => {
  const idx = buildIdx([closedRect(0, 0, 10, 10)]);
  const graph = buildSheetEvidenceGraph(
    idx, [], [span("CD1", 0, 0)], [], undefined, [],
    [
      { key: "CD-1", sheet: "M101", cells: {} },
      { key: "AHU-2", sheet: "M101", cells: {} },
    ],
  );
  assert.equal(graph.tagScheduleEdges.length, 1);
  assert.equal(graph.tagScheduleEdges[0].scheduleId, 0);
});

test("evidence graph: a tag matching a legend caption produces a tag<->legend edge", () => {
  const idx = buildIdx([closedRect(0, 0, 10, 10)]);
  const graph = buildSheetEvidenceGraph(
    idx, [], [span("CD-1", 0, 0)], [], undefined,
    [{ caption: "CD-1", primitiveIds: [], rect: [[0, 0], [10, 10]] }],
    [],
  );
  assert.equal(graph.tagLegendEdges.length, 1);
  assert.equal(graph.tagLegendEdges[0].tagId, graph.tags[0].id);
  assert.equal(graph.tagLegendEdges[0].legendId, graph.legends[0].id);
});

test("evidence graph: requirement 2 -- a body with zero primitives is marked ineligible as empty-body, but its own tag<->body edge STAYS in the graph for display (the goal's own 'may be displayed but cannot steal a tag')", () => {
  const idx = buildIdx([closedRect(93, 125, 10, 10)]);
  const body = { id: 0, primitiveIds: [], x0: 93, y0: 125, x1: 103, y1: 135 };
  const graph = buildSheetEvidenceGraph(idx, [body], [span("FD1", 90, 92, 12)], [], undefined, [], []);
  assert.deepEqual(graph.bodies[0].ineligibleReasons, ["empty-body"]);
  assert.equal(graph.tagBodyEdges.length, 1, "the edge is not removed -- only the body is marked ineligible");
});

test("evidence graph: requirement 2 -- a body the caller discloses as still-contested (an unresolved Phase 4 cluster) is marked ineligible as a conflicting candidate", () => {
  const idx = buildIdx([closedRect(93, 125, 10, 10)]);
  const body = { id: 0, primitiveIds: idx.primitives.map((_, i) => i), x0: 93, y0: 125, x1: 103, y1: 135, contested: true };
  const graph = buildSheetEvidenceGraph(idx, [body], [], [], undefined, [], []);
  assert.deepEqual(graph.bodies[0].ineligibleReasons, ["conflicting-candidate"]);
});

test("evidence graph: requirement 2 -- an ordinary non-empty, uncontested body is fully eligible (empty reasons list, not merely absent)", () => {
  const idx = buildIdx([closedRect(93, 125, 10, 10)]);
  const body = { id: 0, primitiveIds: idx.primitives.map((_, i) => i), x0: 93, y0: 125, x1: 103, y1: 135 };
  const graph = buildSheetEvidenceGraph(idx, [body], [], [], undefined, [], []);
  assert.deepEqual(graph.bodies[0].ineligibleReasons, []);
});

test("evidence graph: a body made of only ONE subpath has no carrier comparison to make -- honestly null, never a guessed false", () => {
  const idx = buildIdx([closedRect(0, 0, 10, 10)]);
  const body = { id: 0, primitiveIds: idx.primitives.map((_, i) => i), x0: 0, y0: 0, x1: 10, y1: 10 };
  const graph = buildSheetEvidenceGraph(idx, [body], [], [], undefined, [], []);
  assert.equal(graph.bodies[0].carrierAttachment, null);
});

test("evidence graph: a body combining a small glyph subpath with a MUCH longer run identifies the long run as carrier-like ink, reusing carrierClassification.ts's own real signal", () => {
  const idx = buildIdx([closedRect(0, 0, 10, 10), line(0, 100, 100, 100)]);
  const body = { id: 0, primitiveIds: idx.primitives.map((_, i) => i), x0: 0, y0: 0, x1: 100, y1: 100 };
  const graph = buildSheetEvidenceGraph(idx, [body], [], [], undefined, [], []);
  const attachment = graph.bodies[0].carrierAttachment;
  assert.ok(attachment);
  assert.equal(attachment!.hasCarrierLikeInk, true);
  // the long line is primitive id 4 (the rect's own 4 edges are ids 0-3)
  assert.deepEqual(attachment!.carrierPrimitiveIds, [4]);
});

test("evidence graph: with no tags, no bodies, no legend, no schedule rows at all, every list is honestly empty -- never a crash", () => {
  const idx = buildIdx([]);
  const graph = buildSheetEvidenceGraph(idx, [], [], [], undefined, [], []);
  assert.deepEqual(graph, { tags: [], bodies: [], legends: [], schedules: [], tagBodyEdges: [], tagScheduleEdges: [], tagLegendEdges: [] });
});

test("evidence graph: two candidate bodies each get their OWN tag<->body edge when each has its own real nearby tag -- one tag never silently claims two bodies", () => {
  const idx = buildIdx([closedRect(93, 125, 10, 10), closedRect(893, 125, 10, 10)]);
  const bodies = [
    { id: 0, primitiveIds: [0, 1, 2, 3], x0: 93, y0: 125, x1: 103, y1: 135 },
    { id: 1, primitiveIds: [4, 5, 6, 7], x0: 893, y0: 125, x1: 903, y1: 135 },
  ];
  const graph = buildSheetEvidenceGraph(idx, bodies, [span("FD1", 90, 92, 12), span("FD2", 890, 92, 12)], [], undefined, [], []);
  assert.equal(graph.tagBodyEdges.length, 2);
  const byBody = new Map(graph.tagBodyEdges.map((e) => [e.bodyId, e.tagId]));
  const tagLabel = (id: number) => graph.tags.find((t) => t.id === id)!.label;
  assert.equal(tagLabel(byBody.get(0)!), "FD1");
  assert.equal(tagLabel(byBody.get(1)!), "FD2");
});
