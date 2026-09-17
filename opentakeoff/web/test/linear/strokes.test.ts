// linear/strokes.ts — stroke classification, Stage 1 of the trace engine
// (#linear-takeoff WP3.1, opentakeoff-corpus/goals/LINEAR_TAKEOFF.md, plan
// §6.2). Exclusion checks are tested individually against real fixtures
// (not mocked), then family classification's two implemented evidence
// grades (a: layer name, c: pen-weight prior) against synthetic corpora
// shaped like the real ones (Bessemer pen 4, ITD pen 3, Weld M-HVAC-DUCT).
import { test } from "node:test";
import assert from "node:assert/strict";
import { strokeExclusionMask, classifyStrokeFamilies, classifyStrokes } from "../../src/lib/linear/strokes.ts";
import { SEG_CLIP, SEG_FILLONLY, type SubPath, type TextMark } from "../../src/lib/oneclick.ts";
import { networkWallSegs } from "../../src/lib/wallnetwork.ts";
import type { LayerInfo } from "../../src/lib/layers.ts";

const FTPX = 18;   // this codebase's own calibration constant (oneclick.ts's CAL_MPPF)

function straightLine(len = 100): { segs: number[]; meta: Uint8Array } {
  return { segs: [0, 0, len, 0], meta: new Uint8Array([4 << 4]) };
}

// A verified positive wall-vouch fixture: a double-line rectangular room
// (outer + inner ring, 6in wall at 18 px/ft) — confirmed against
// networkWallSegs directly (every one of its 8 segments vouches) before use
// here, exactly the discipline the rest of this codebase's tests hold real
// geometric algorithms to.
function wallRoomFixture(): { segs: number[]; meta: Uint8Array } {
  const W = 20 * FTPX, H = 15 * FTPX, t = 0.5 * FTPX;
  const segs = [
    0, 0, W, 0, W, 0, W, H, W, H, 0, H, 0, H, 0, 0,
    t, t, W - t, t, W - t, t, W - t, H - t, W - t, H - t, t, H - t, t, H - t, t, t,
  ];
  const n = segs.length >> 2;
  const meta = new Uint8Array(n).fill(4 << 4);
  return { segs, meta };
}

test("strokeExclusionMask: SEG_CLIP and SEG_FILLONLY segments are always excluded", () => {
  const segs = [0, 0, 100, 0, 0, 10, 100, 10];
  const meta = new Uint8Array([SEG_CLIP, SEG_FILLONLY]);
  const exclude = strokeExclusionMask({ segs, meta });
  assert.deepEqual([...exclude], [1, 1]);
});

test("strokeExclusionMask: layer roles finish-pattern(2)/annotation(3)/hidden(6) exclude; demolition(5) and boundary(1) survive", () => {
  // six well-separated, non-closed horizontal lines — far enough apart (500px)
  // that they can't cluster into an accidental hatch row, and never a closed
  // loop, so the wall-vouch fallback (also active here, layerSignal omitted)
  // can't fire either. This test isolates ONLY the layer-role check.
  const segs = Array.from({ length: 6 }, (_, i) => [0, i * 500, 100, i * 500]).flat();
  const meta = new Uint8Array(6).fill(1 << 4);   // one segment each, no clip/fillonly flags
  const roleCodes = new Uint8Array([0, 1, 2, 3, 5, 6]);  // unknown, boundary, finish-pattern, annotation, demolition, hidden
  const exclude = strokeExclusionMask({ segs, meta, roleCodes });
  assert.deepEqual([...exclude], [0, 0, 1, 1, 0, 1], "only 2/3/6 exclude — 5 (demolition) must survive for status classification");
});

test("strokeExclusionMask: a hatch row is excluded", () => {
  const segs: number[] = [];
  for (let x = 100; x <= 300; x += 4) segs.push(x, 100, x, 500);   // ≥5 short-pitch parallel rows — classifyHatchSegs's own minimum
  const n = segs.length >> 2;
  const meta = new Uint8Array(n).fill(1 << 4);
  const exclude = strokeExclusionMask({ segs, meta, ftPx: FTPX });
  assert.equal(exclude[Math.floor(n / 2)], 1, "an interior hatch row excludes");
});

test("strokeExclusionMask: a text-box frame excludes when subpaths/texts/ftPx are all given, survives without them", () => {
  const segs = [0, 0, 40, 0, 40, 0, 40, 20, 40, 20, 0, 20, 0, 20, 0, 0];   // a small closed 40x20 px box
  const meta = new Uint8Array(4).fill(1 << 4);
  const subpaths: SubPath[] = [{ i0: 0, i1: 4, x0: 0, y0: 0, x1: 40, y1: 20, closed: true, flags: 0, fillLum: 255 }];
  const texts: TextMark[] = [{ x: 2, y: 10, w: 36, h: 10 }];   // fills most of the box
  const withText = strokeExclusionMask({ segs, meta, subpaths, texts, ftPx: FTPX, layerSignal: "strong" });
  assert.deepEqual([...withText], [1, 1, 1, 1], "a text-filled small box excludes as a tag frame");
  // layerSignal: "strong" isolates the tag-box check alone — this exact box
  // is ALSO a closed loop with real corners, which networkWallSegs's own
  // scale-unknown fallback (mppf 0) independently vouches for (verified
  // directly against networkWallSegs before writing this assertion); a
  // "none"/"weak" signal here would conflate that fallback with what this
  // test actually isolates: classifyTagBoxSegs's own no-scale contract.
  const withoutFtPx = strokeExclusionMask({ segs, meta, subpaths, texts, layerSignal: "strong" });
  assert.deepEqual([...withoutFtPx], [0, 0, 0, 0], "classifyTagBoxSegs's own no-scale contract: no ftPx, no exclusion");
});

test("strokeExclusionMask: wall-vouched ink excludes when the layer signal isn't strong, survives when it is", () => {
  const { segs, meta } = wallRoomFixture();
  const vouched = networkWallSegs(segs, meta, 1, FTPX);
  assert.ok([...vouched].every((v) => v === 1), "fixture sanity: every segment of this room genuinely vouches");

  for (const layerSignal of [undefined, "none", "weak"] as const) {
    const exclude = strokeExclusionMask({ segs, meta, ftPx: FTPX, ...(layerSignal ? { layerSignal } : {}) });
    assert.deepEqual([...exclude], [...vouched], `layerSignal ${layerSignal ?? "(omitted)"}: wall-vouch fallback runs`);
  }
  const strong = strokeExclusionMask({ segs, meta, ftPx: FTPX, layerSignal: "strong" });
  assert.deepEqual([...strong], new Array(8).fill(0), "a strong layer signal skips the geometric wall-vouch fallback entirely");
});

test("strokeExclusionMask: an isolated straight stroke is never wall-vouched", () => {
  const { segs, meta } = straightLine(200);
  const exclude = strokeExclusionMask({ segs, meta, ftPx: FTPX });
  assert.deepEqual([...exclude], [0]);
});

// ── family classification ───────────────────────────────────────────────

test("classifyStrokeFamilies: groups candidates by (pen, dash, layer, lum, colour) — distinct pens never merge", () => {
  const segs = [0, 0, 100, 0, 0, 10, 100, 10, 0, 20, 100, 20];
  const meta = new Uint8Array([4 << 4, 4 << 4, 3 << 4]);  // two pen-4, one pen-3
  const candidate = new Uint8Array([1, 1, 1]);
  const { family, families } = classifyStrokeFamilies({ segs, meta, candidate });
  assert.equal(families.length, 2, "pen 4 and pen 3 are distinct families");
  assert.equal(family[0], family[1], "identical (pen,dash,layer,lum,colour) merges into one family");
  assert.notEqual(family[0], family[2]);
});

test("classifyStrokeFamilies: excluded (non-candidate) segments carry family -1 and are never counted", () => {
  const segs = [0, 0, 100, 0, 0, 10, 100, 10];
  const meta = new Uint8Array([4 << 4, 4 << 4]);
  const candidate = new Uint8Array([1, 0]);
  const { family, families } = classifyStrokeFamilies({ segs, meta, candidate });
  assert.equal(family[1], -1);
  assert.equal(families.length, 1);
});

test("classifyStrokeFamilies: grade (a) — a layer classified ductwork at confidence ≥ 0.85 wins outright, evidence ['layer-name']", () => {
  const segs = [0, 0, 100, 0, 0, 10, 100, 10];
  const meta = new Uint8Array([4 << 4, 4 << 4]);
  const candidate = new Uint8Array([1, 1]);
  const layerOf = new Int32Array([0, 0]);
  const layerIds = ["ocg-1"];
  const layers: LayerInfo[] = [{ id: "ocg-1", name: "M-HVAC-DUCT", role: "unknown", confidence: 0, visible: true, seg_count: 2 }];
  const { families } = classifyStrokeFamilies({ segs, meta, candidate, layerOf, layerIds, layers });
  assert.equal(families.length, 1);
  assert.equal(families[0].system, "ductwork");
  assert.deepEqual(families[0].evidence, ["layer-name"]);
  assert.ok(families[0].confidence >= 0.85);
});

test("classifyStrokeFamilies: grade (a) refuses below the confidence floor — DUCTWORK_WEAK ('HVAC') never wins outright", () => {
  const segs = [0, 0, 3, 3];   // short AND diagonal: ineligible for the grade-(c) pen-weight prior too, isolating this assertion to grade (a) alone
  const meta = new Uint8Array([4 << 4]);
  const candidate = new Uint8Array([1]);
  const layerOf = new Int32Array([0]);
  const layerIds = ["ocg-1"];
  const layers: LayerInfo[] = [{ id: "ocg-1", name: "M-HVAC", role: "unknown", confidence: 0, visible: true, seg_count: 1 }];
  const { families } = classifyStrokeFamilies({ segs, meta, candidate, layerOf, layerIds, layers });
  assert.equal(families[0].evidence.length, 0, "generic HVAC (confidence 0.5) sits below the 0.85 grade-(a) floor");
  assert.equal(families[0].system, undefined);
});

test("classifyStrokeFamilies: grade (c) — the heaviest non-modal pen clearing the noise floor wins the pen-weight prior (Bessemer-shaped: real duct pen buried under a much larger background pen)", () => {
  const segs: number[] = [];
  const meta: number[] = [];
  // pen 1 (modal): the sheet's own background/architectural convention — far
  // more candidates than any real MEP family, none of them long/axis-scored
  // here (irrelevant to the prior — only their COUNT matters, for modal
  // detection), matching the real corpus finding that raw volume, not
  // length, is what makes a pen "modal."
  for (let i = 0; i < 40; i++) segs.push(i, i, i + 1, i + 2), meta.push(1 << 4);
  // pen 4: 12 long axis-aligned segments — clears the PEN_NOISE_FLOOR (10).
  for (let i = 0; i < 12; i++) segs.push(0, i * 5, 10 * FTPX, i * 5), meta.push(4 << 4);
  // pen 2: only 3 long axis-aligned segments — non-modal, but below the
  // noise floor, so it must never win even though nothing else competes for it.
  for (let i = 0; i < 3; i++) segs.push(0, 1000 + i * 5, 10 * FTPX, 1000 + i * 5), meta.push(2 << 4);
  const n = segs.length >> 2;
  const candidate = new Uint8Array(n).fill(1);
  const { families } = classifyStrokeFamilies({ segs, meta: new Uint8Array(meta), candidate, ftPx: FTPX });
  const winner = families.find((f) => f.evidence.includes("pen-weight-prior"));
  assert.ok(winner, "some family wins the prior");
  assert.equal(winner!.pen, 4, "pen 4 wins: not modal, and its 12 long-axis segments clear the noise floor pen 2's 3 do not");
  assert.equal(winner!.system, undefined, "pen weight alone never resolves WHICH system — that's the estimator's or grade (a)/(b)'s job");
  assert.equal(winner!.confidence, 0.5);
  for (const f of families) if (f !== winner) assert.equal(f.evidence.length, 0);
});

test("classifyStrokeFamilies: a short or diagonal-only family never wins the pen-weight prior, however heavy its pen", () => {
  const segs = [0, 0, 3, 3];       // short AND diagonal — fails both the length and axis-dominance floor
  const meta = new Uint8Array([15 << 4]);   // heaviest possible pen
  const candidate = new Uint8Array([1]);
  const { families } = classifyStrokeFamilies({ segs, meta, candidate, ftPx: FTPX });
  assert.equal(families[0].evidence.length, 0);
});

test("classifyStrokes: end to end — exclusion feeds candidate, families reflect only survivors (Weld-shaped: a real classified duct layer amid excluded annotation ink)", () => {
  // segment 0: pen 4 on M-HVAC-DUCT (survives, classifies grade a)
  // segment 1: pen 4 on M-ANNO (annotation role code 3 — excluded before family classification ever sees it)
  const segs = [0, 0, 200, 0, 0, 50, 200, 50];
  const meta = new Uint8Array([4 << 4, 4 << 4]);
  const layerOf = new Int32Array([0, 1]);
  const layerIds = ["duct", "anno"];
  const layers: LayerInfo[] = [
    { id: "duct", name: "M-HVAC-DUCT", role: "unknown", confidence: 0, visible: true, seg_count: 1 },
    { id: "anno", name: "M-ANNO", role: "annotation", confidence: 0.85, visible: true, seg_count: 1 },
  ];
  const roleCodes = new Uint8Array([0, 3]);   // unknown, annotation
  const result = classifyStrokes({ segs, meta, roleCodes, layerOf, layerIds, layers, ftPx: FTPX });
  assert.deepEqual([...result.candidate], [1, 0]);
  assert.equal(result.family[1], -1);
  assert.equal(result.families.length, 1, "the excluded annotation segment never forms its own family");
  assert.equal(result.families[0].system, "ductwork");
  assert.equal(result.families[0].layer, "duct");
});
