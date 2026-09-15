// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 — proposal fusion:
// dedup by primitive overlap and body identity, never center distance
// alone; preserve which lanes voted; deterministic top-K ordering.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { computeVectorSceneJunctions } from "../src/lib/vectorSceneRelations.ts";
import { proposeCandidateBodiesLaneB } from "../src/lib/candidateBodyLaneB.ts";
import { computeFormContentSignatures } from "../src/lib/candidateBodyLaneA.ts";
import { fuseProposals } from "../src/lib/candidateProposalFusion.ts";

const OPS = {
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
  paintFormXObjectBegin: 33, paintFormXObjectEnd: 34,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];
const closedRect = (x: number, y: number, w: number, h: number): Op =>
  [OPS.constructPath, [[OPS.rectangle], [x, y, w, h]]];
const formBegin = (matrix: number[]): Op => [OPS.paintFormXObjectBegin, [matrix, null]];
const formEnd = (): Op => [OPS.paintFormXObjectEnd, null];

function fuseFor(ops: Op[], laneAOpts?: Parameters<typeof computeFormContentSignatures>[2]) {
  const geo = extractVectorGeometry(opList(ops), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const { bodies } = proposeCandidateBodiesLaneB(idx, junctions);
  const laneA = computeFormContentSignatures(idx, geo.formInvocations ?? [], laneAOpts);
  return { idx, bodies, laneA, fused: fuseProposals(idx, bodies, laneA.invocations) };
}

test("proposal fusion: a body seen ONLY by Lane B (no Form XObject at all) is a single-lane proposal", () => {
  const { fused } = fuseFor([closedRect(0, 0, 10, 10)]);
  assert.equal(fused.length, 1);
  assert.deepEqual(fused[0].votingLanes, ["B"]);
  assert.ok(fused[0].evidence.laneB && !fused[0].evidence.laneA);
});

test("proposal fusion: the SAME ink discovered by both Lane B (connectivity) and Lane A (it sits inside a Form XObject) fuses into ONE proposal voted by both", () => {
  const { fused } = fuseFor([formBegin(ID), closedRect(0, 0, 10, 10), formEnd()]);
  assert.equal(fused.length, 1, "one physical body, not two separate proposals for the same ink");
  assert.deepEqual(fused[0].votingLanes.slice().sort(), ["A", "B"]);
  assert.ok(fused[0].evidence.laneA && fused[0].evidence.laneB);
  assert.equal(fused[0].primitiveIds.length, 4, "the union is still just the rectangle's own 4 edges — nothing was double-counted");
});

test("proposal fusion: a Form invocation flagged touchesPageEdge (real title-block/border furniture, see candidateBodyLaneA.ts's own header) does NOT get the Lane A boost -- its matching Lane B body stands alone instead of fusing into an [A,B] proposal", () => {
  const pageBounds = { width: 100, height: 100 };
  const { fused } = fuseFor(
    [formBegin(ID), closedRect(0, 0, 10, 10), formEnd()], // touches x=0 and y=0 -- real page-edge furniture
    { pageBounds },
  );
  assert.equal(fused.length, 1, "the underlying ink is still proposed -- just by Lane B alone, not boosted by Lane A");
  assert.deepEqual(fused[0].votingLanes, ["B"], "no Lane A vote for a page-edge-flagged invocation");
  assert.ok(!fused[0].evidence.laneA && fused[0].evidence.laneB);
});

test("proposal fusion: the SAME shape as the page-edge exclusion test above still fuses normally when pageBounds is NOT supplied -- the exclusion is opt-in by the caller's own upstream choice, not a hardcoded behavior change", () => {
  const { fused } = fuseFor([formBegin(ID), closedRect(0, 0, 10, 10), formEnd()]); // no pageBounds this time
  assert.equal(fused.length, 1);
  assert.deepEqual(fused[0].votingLanes.slice().sort(), ["A", "B"], "without pageBounds, touchesPageEdge defaults false and this fuses exactly as the pre-existing 'same ink' test above expects");
});

test("proposal fusion: two SEPARATE, non-overlapping bodies never merge just because they are both real", () => {
  const { fused } = fuseFor([closedRect(0, 0, 10, 10), closedRect(1000, 1000, 10, 10)]);
  assert.equal(fused.length, 2);
  assert.ok(fused.every((f) => f.votingLanes.length === 1));
});

test("proposal fusion: an invocation whose own primitives are only a SMALL PART of a much larger Lane B body stays a separate A-only proposal — low overlap is not fused just because the sets intersect", () => {
  // the form's own one primitive is real, but the SAME primitive also
  // belongs (via shared endpoints) to a much bigger 5-primitive Lane B
  // body — Jaccard(1-of-5, 1-of-1) = 1/5 = 0.2, well under the default
  // 0.5 threshold, so this correctly does NOT collapse into one fusion.
  const { fused } = fuseFor([
    formBegin(ID), line(0, 0, 10, 0), formEnd(),
    // an open zigzag chain (no revisited point, so no accidental
    // degree-3 T-junction splitting it) — five segments, one Lane B
    // component, corner-to-corner.
    line(10, 0, 20, 0), line(20, 0, 20, 10), line(20, 10, 10, 10), line(10, 10, 0, 10),
  ]);
  const aOnly = fused.find((f) => f.votingLanes.length === 1 && f.evidence.laneA);
  const bOnly = fused.find((f) => f.votingLanes.length === 1 && f.evidence.laneB);
  assert.ok(aOnly, "the low-overlap Lane A invocation surfaces on its own, not silently absorbed or dropped");
  assert.ok(bOnly, "and the bigger Lane B body it was too small a fraction of also surfaces on its own");
  assert.equal(aOnly!.primitiveIds.length, 1);
  assert.equal(bOnly!.primitiveIds.length, 5);
});

test("proposal fusion: ordering ranks more-voted proposals first, ties broken by primitive count", () => {
  const { fused } = fuseFor([
    formBegin(ID), closedRect(0, 0, 10, 10), formEnd(),  // A+B, 4 primitives
    closedRect(1000, 0, 30, 30),                          // B only, 4 primitives
  ]);
  assert.equal(fused[0].votingLanes.length, 2, "the two-lane proposal ranks first");
  assert.equal(fused[1].votingLanes.length, 1);
  // ids are reassigned densely after sorting
  assert.deepEqual(fused.map((f) => f.id), [0, 1]);
});

test("proposal fusion: a Lane A invocation exhaustively partitioned by TWO Lane B bodies fuses with only the BEST one — the other stays its own distinct proposal, never a duplicate", () => {
  // real bug found on tinker-afb-iwcs-controls.pdf#13: one Form's own
  // primitives split cleanly into two separate Lane B connected
  // components (no junction between them, e.g. two disjoint rectangles
  // in one Form) — the ORIGINAL fusion let BOTH bodies independently
  // "win" a merge with the same Lane A invocation, producing two
  // FusedProposals with byte-for-byte IDENTICAL primitiveIds.
  const { fused } = fuseFor([
    formBegin(ID), closedRect(0, 0, 10, 10), closedRect(100, 0, 10, 10), formEnd(),
  ]);
  // exactly 2 proposals: one ["A","B"] merge (best body) + one ["B"]-only
  // (the other body) — never two identical ["A","B"] duplicates.
  assert.equal(fused.length, 2, "one A+B merge and one B-only proposal, not a duplicated A+B pair");
  const merged = fused.find((f) => f.votingLanes.length === 2)!;
  const bOnly = fused.find((f) => f.votingLanes.length === 1)!;
  assert.ok(merged && bOnly, "exactly one merged and one B-only proposal");
  assert.equal(bOnly.votingLanes[0], "B");
  assert.notDeepEqual(merged.primitiveIds.slice().sort(), bOnly.primitiveIds.slice().sort(), "the two proposals must never end up with the identical primitive set");
  // the merged proposal's own primitiveIds still covers BOTH rectangles
  // (Lane A's own full 8-primitive set, same as before this fix for the
  // WINNING body) — only the DUPLICATE second copy is gone, not real
  // information.
  assert.equal(merged.primitiveIds.length, 8);
  assert.equal(bOnly.primitiveIds.length, 4, "the losing body keeps its own real 4-primitive identity, not silently dropped");
});

test("proposal fusion: an empty sheet fuses to nothing", () => {
  const { fused } = fuseFor([]);
  assert.deepEqual(fused, []);
});

test("proposal fusion: omitting laneCBodies entirely reproduces the exact pre-Lane-C behavior -- every existing 3-argument call is unaffected", () => {
  const { idx, bodies, laneA } = fuseFor([formBegin(ID), closedRect(0, 0, 10, 10), formEnd()]);
  const withoutLaneC = fuseProposals(idx, bodies, laneA.invocations);
  const withEmptyLaneC = fuseProposals(idx, bodies, laneA.invocations, []);
  assert.deepEqual(withoutLaneC, withEmptyLaneC);
});

test("proposal fusion: a Lane C body with no overlap at all becomes its own independent ['C'] proposal", () => {
  const { idx, bodies, laneA } = fuseFor([closedRect(0, 0, 10, 10)]);
  const laneCBody = { id: 7, primitiveIds: [], x0: 1000, y0: 1000, x1: 1010, y1: 1010 };
  const fused = fuseProposals(idx, bodies, laneA.invocations, [laneCBody]);
  assert.equal(fused.length, 2, "the original Lane B proposal plus the new independent Lane C one");
  const cOnly = fused.find((f) => f.votingLanes.length === 1 && f.evidence.laneC);
  assert.ok(cOnly);
  assert.deepEqual(cOnly!.votingLanes, ["C"]);
  assert.equal(cOnly!.evidence.laneC!.bodyId, 7, "the caller-assigned id on the laneCBodies entry is preserved");
});

test("proposal fusion: a Lane C body that is a NEAR-TOTAL duplicate of an existing Lane B proposal is MERGED into it, not left as a separate, self-tying competitor -- the real bug this module's own header discloses (45-slac-m63-analog-input-callouts's own seed instance: an already-correct, uncontested Lane B body turned into an unresolvable empty tie by its own byte-for-byte Lane C duplicate)", () => {
  // a second, disconnected line is real, separate Lane B evidence of its
  // OWN (never touching the rect) -- included only so the Lane C body
  // below can reference a real extra primitive id without crashing bbox
  // computation; it must stay untouched by the rect+C merge.
  const { idx, bodies, laneA } = fuseFor([closedRect(0, 0, 10, 10), line(1000, 1000, 1010, 1000)]);
  const rectBody = bodies.find((b) => b.primitiveIds.length === 4)!;
  const lineBody = bodies.find((b) => b.primitiveIds.length === 1)!;
  const extraId = lineBody.primitiveIds[0];
  // 4 of 5 primitives shared with the rect's own Lane B proposal --
  // Jaccard 4/5 = 0.8, near-total overlap, the SAME dedup rule the Lane
  // A/B merge above already applies, now extended to Lane C.
  const laneCBody = { id: 3, primitiveIds: [...rectBody.primitiveIds, extraId], x0: -5, y0: -5, x1: 1010, y1: 1000 };
  const fused = fuseProposals(idx, bodies, laneA.invocations, [laneCBody]);
  assert.equal(fused.length, 2, "the merged rect+C body, plus the totally unrelated separate line body untouched -- never one proposal, since two real distinct physical things are here");
  const merged = fused.find((f) => f.evidence.laneC)!;
  const untouched = fused.find((f) => f !== merged)!;
  assert.deepEqual(merged.votingLanes, ["B", "C"], "the rect's own Lane B proposal absorbed Lane C's near-duplicate, not left to contest it");
  assert.ok(merged.evidence.laneB && merged.evidence.laneC);
  assert.deepEqual(merged.primitiveIds.slice().sort((a, b) => a - b), [...rectBody.primitiveIds, extraId].sort((a, b) => a - b), "the union of both lanes' own ink, nothing dropped");
  assert.deepEqual(untouched.votingLanes, ["B"], "the separate line body is real, distinct Lane B evidence -- untouched by the rect's own merge");
  assert.deepEqual(untouched.primitiveIds, lineBody.primitiveIds);
});

test("proposal fusion: a Lane C body that SWEEPS a Lane B fragment as a SMALL part of a much larger region stays its OWN independent proposal -- low Jaccard against any one fragment it covers, never merged, preserving Lane C's whole point (recovering fragmentation Lane B alone cannot)", () => {
  // a big swept region containing one real fragment's own 4 primitives
  // plus 20 other real (never dereferenced-and-crashing on a fake id)
  // primitives -- Jaccard 4/24 is well under the merge threshold.
  const manyOps = [closedRect(0, 0, 10, 10)];
  for (let i = 0; i < 20; i++) manyOps.push(line(2000 + i * 20, 2000, 2010 + i * 20, 2000));
  const { idx, bodies, laneA } = fuseFor(manyOps);
  const sweptBody = bodies[0];
  const otherIds = idx.primitives.map((_, i) => i).filter((i) => !sweptBody.primitiveIds.includes(i));
  const laneCBody = { id: 9, primitiveIds: [...sweptBody.primitiveIds, ...otherIds], x0: -5, y0: -5, x1: 2410, y1: 2010 };
  const fused = fuseProposals(idx, bodies, laneA.invocations, [laneCBody]);
  assert.equal(fused.length, bodies.length + 1, "every original Lane B fragment survives, plus the Lane C sweep as its own independent proposal");
  const cOnly = fused.find((f) => f.votingLanes.length === 1 && f.evidence.laneC);
  assert.ok(cOnly, "the sweep never merges into any one small fragment it covers");
  assert.equal(cOnly!.primitiveIds.length, laneCBody.primitiveIds.length);
});
