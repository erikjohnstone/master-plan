// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 4 gate — grouping
// raw-geometry (non-Form) Lane B bodies by repeated structural signature.
// See candidateBodyRepeatedGroups.ts's own header for the real scope-
// boundary finding this closes part of.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import { buildVectorSceneIndex } from "../src/lib/vectorSceneIndex.ts";
import { computeVectorSceneJunctions } from "../src/lib/vectorSceneRelations.ts";
import { proposeCandidateBodiesLaneB } from "../src/lib/candidateBodyLaneB.ts";
import { computePrimitiveGraphAttributes } from "../src/lib/candidateBodyLaneD.ts";
import { groupRepeatedLaneBBodies } from "../src/lib/candidateBodyRepeatedGroups.ts";

const OPS = {
  constructPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17,
} as const;
const ID = [1, 0, 0, 1, 0, 0];
type Op = [number, unknown[] | null];
const opList = (ops: Op[]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const line = (x1: number, y1: number, x2: number, y2: number): Op =>
  [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [x1, y1, x2, y2]]];

// An "L" shape at a given (dx, dy) translation — no Form XObject at all,
// deliberately, since this module exists for exactly the case Lane A
// never sees. Asymmetric legs so rotation/position genuinely exercise
// the signature rather than trivially matching by coincidence.
const lAt = (dx: number, dy: number): Op[] => [
  line(dx, dy, dx + 40, dy), line(dx + 40, dy, dx + 40, dy + 15),
];

function groupFor(ops: Op[]) {
  const geo = extractVectorGeometry(opList(ops), ID, OPS);
  const idx = buildVectorSceneIndex(geo);
  const { junctions } = computeVectorSceneJunctions(idx);
  const bodies = proposeCandidateBodiesLaneB(idx, junctions).bodies;
  const attrs = computePrimitiveGraphAttributes(idx, junctions).attributes;
  return { bodies, result: groupRepeatedLaneBBodies(bodies, attrs) };
}

test("repeated groups: a raw-geometry dense 'grid' of the SAME symbol drawn 5 times, no Form XObject at all, is grouped as one repeated group of 5", () => {
  // exactly the scope-boundary case: real symbols, real repeats, but
  // NEVER wrapped in a Form XObject — candidateBodyLaneA.ts's own
  // repeatedGroups can never see this; this module is what can.
  const ops = [0, 100, 200, 300, 400].flatMap((dx) => lAt(dx, 0));
  const { bodies, result } = groupFor(ops);
  assert.equal(bodies.length, 5, "test premise: 5 separate, disconnected Lane B bodies");
  assert.equal(result.repeatedGroups.length, 1, "all 5 identical placements form ONE repeated group");
  assert.equal(result.repeatedGroups[0].length, 5, "the group contains all 5, none missed, none double-counted");
  assert.equal(result.unsignedBodyCount, 0);
});

test("repeated groups: the same symbol placed at a DIFFERENT rotation groups with the un-rotated one (rotation invariance, inherited unchanged from candidateBodySignature.ts, proven through this module's own grouping)", () => {
  // lAt(0,0): a 40-long horizontal leg + a 15-long vertical leg — the
  // SAME L rotated 90 degrees and placed elsewhere: a 40-long VERTICAL
  // leg + a 15-long horizontal leg, drawn directly (no transform trick
  // needed) so both bodies come from ONE extraction call and one index.
  const original = lAt(0, 0);
  const rotatedElsewhere: Op[] = [line(500, 0, 500, 40), line(500, 40, 485, 40)];
  const { bodies, result } = groupFor([...original, ...rotatedElsewhere]);
  assert.equal(bodies.length, 2, "test premise: two separate, disconnected bodies");
  assert.equal(result.repeatedGroups.length, 1, "the rotated placement groups with the original — real rotation invariance, not just position invariance");
  assert.equal(result.repeatedGroups[0].length, 2);
});

test("repeated groups: a genuinely DIFFERENT shape does not get grouped with the repeated symbol", () => {
  const OTHER: Op[] = [line(1000, 0, 1010, 0), line(1010, 0, 1010, 10)]; // equal-leg corner, not the L's 40/15 asymmetry
  const ops = [...lAt(0, 0), ...lAt(100, 0), ...lAt(200, 0), ...OTHER];
  const { bodies, result } = groupFor(ops);
  assert.equal(bodies.length, 4);
  assert.equal(result.repeatedGroups.length, 1, "only the 3 real repeats form a group");
  assert.equal(result.repeatedGroups[0].length, 3);
});

test("repeated groups: no repeats at all (every body structurally distinct) reports an empty repeatedGroups, not a crash", () => {
  const ops = [...lAt(0, 0), [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [1000, 1000, 1000, 1500]]] as Op];
  const { result } = groupFor(ops);
  assert.deepEqual(result.repeatedGroups, []);
});

test("repeated groups: an empty sheet reports no groups and no unsigned bodies", () => {
  const { result } = groupFor([]);
  assert.deepEqual(result.repeatedGroups, []);
  assert.equal(result.unsignedBodyCount, 0);
});
