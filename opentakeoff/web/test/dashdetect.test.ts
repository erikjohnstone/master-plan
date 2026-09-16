// dashdetect.ts (PLAN_CONNECTIVITY_SERVES.md Phase 1) — geometric detection
// of a straight dashed run from many short, gap-separated, collinear
// stroked segments. Pure, no PDF/DOM, same contract as oneclick.ts's own
// tests. Every synthetic case below is hand-built to the exact shape a real
// CAD dash export produces (measured directly against real segs in
// dashdetect.corpus.test.ts) — not a plausible-looking guess.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectDashedSegs, detectDashedRuns } from "../src/lib/dashdetect.ts";

// build a straight run of `count` dashes of length `dashLen` separated by
// `gap`, starting at (x0,y0) and running along +x.
function dashRun(x0: number, y0: number, count: number, dashLen: number, gap: number): number[] {
  const out: number[] = [];
  let x = x0;
  for (let i = 0; i < count; i++) {
    out.push(x, y0, x + dashLen, y0);
    x += dashLen + gap;
  }
  return out;
}

test("detectDashedSegs: a clean 10-dash straight run is fully flagged", () => {
  const segs = dashRun(0, 0, 10, 4, 4);
  const out = detectDashedSegs(segs);
  assert.equal(out.length, 10);
  assert.ok([...out].every((v) => v === 1), "every dash piece should be flagged");
});

test("detectDashedSegs: a single long solid segment is never flagged", () => {
  const segs = [0, 0, 200, 0];
  const out = detectDashedSegs(segs);
  assert.deepEqual([...out], [0]);
});

test("detectDashedSegs: fewer than minCount pieces (a real T-junction split) is not a dash run", () => {
  // two short collinear pieces with a small gap — the shape an incidental
  // mid-run T-junction split produces, not a real dash cadence.
  const segs = dashRun(0, 0, 2, 4, 4);
  const out = detectDashedSegs(segs);
  assert.deepEqual([...out], [0, 0]);
});

test("detectDashedSegs: a turning polyline (arc-shaped) never chains into a dash run", () => {
  // each chord turns 20 degrees from the last — never collinear, so the
  // chain never forms and nothing is flagged, regardless of length.
  const segs: number[] = [];
  let x = 0, y = 0, ang = 0;
  for (let i = 0; i < 8; i++) {
    const nx = x + 4 * Math.cos(ang), ny = y + 4 * Math.sin(ang);
    segs.push(x, y, nx, ny);
    x = nx; y = ny; ang += (20 * Math.PI) / 180;
  }
  const out = detectDashedSegs(segs);
  assert.ok([...out].every((v) => v === 0), "a turning chain must never be read as a dash run");
});

test("detectDashedSegs: one long piece in an otherwise dash-shaped chain disqualifies the whole run", () => {
  const dashes = dashRun(0, 0, 5, 4, 4);
  // append one long collinear, gap-joined segment continuing the same line
  const lastX = dashes[dashes.length - 2];
  const longSeg = [lastX + 4, 0, lastX + 4 + 120, 0];
  const segs = [...dashes, ...longSeg];
  const out = detectDashedSegs(segs);
  assert.ok([...out].every((v) => v === 0), "a mixed short+long run is not a genuine dash cadence");
});

test("detectDashedSegs: a different pen (meta) breaks the chain even when geometrically collinear", () => {
  const segs = dashRun(0, 0, 8, 4, 4);
  const meta = new Uint8Array(8);
  for (let i = 4; i < 8; i++) meta[i] = 0x10; // pen-width change for the whole second half — two genuinely different strokes
  const out = detectDashedSegs(segs, meta);
  // the split lands exactly at index 4: indices 0-3 (4 pieces, pen A) and
  // 4-7 (4 pieces, pen B) each independently reach minCount (4) and both
  // qualify on their own — a real pen change is two separate dash runs,
  // correctly classified as two, never silently merged into one.
  assert.deepEqual([...out], [1, 1, 1, 1, 1, 1, 1, 1]);
});

test("detectDashedSegs: a gap much wider than the dash length breaks the run", () => {
  const first = dashRun(0, 0, 4, 4, 4);
  // a 5th piece far away on the same line — gap >> dash length
  const second = [200, 0, 204, 0];
  const segs = [...first, ...second];
  const out = detectDashedSegs(segs);
  assert.deepEqual([...out], [1, 1, 1, 1, 0], "the far piece must not join the real dash run, and alone is below minCount");
});

test("detectDashedSegs: reversed-direction dash pieces (exporter alternates path winding) still classify as one run", () => {
  const segs: number[] = [];
  let x = 0;
  for (let i = 0; i < 6; i++) {
    if (i % 2 === 0) segs.push(x, 0, x + 4, 0);
    else segs.push(x + 4, 0, x, 0); // reversed parametric direction, same physical piece placement
    x += 8;
  }
  const out = detectDashedSegs(segs);
  assert.ok([...out].every((v) => v === 1), "collinearity must tolerate a 180-degree-flipped path direction");
});

test("detectDashedSegs: a degenerate zero-length segment amid a real dash run is bridged, not disqualifying", () => {
  const dashes = dashRun(0, 0, 4, 4, 4);
  // splice a zero-length segment in the middle
  const withDegenerate = [...dashes.slice(0, 8), 20, 0, 20, 0, ...dashes.slice(8)];
  const out = detectDashedSegs(withDegenerate);
  assert.equal(out.length, 5);
  assert.equal(out[0], 1); assert.equal(out[1], 1);
  assert.equal(out[2], 0, "the degenerate segment itself is never flagged");
  assert.equal(out[3], 1); assert.equal(out[4], 1);
});

test("detectDashedSegs: feet-true ceiling (mppf given) rejects a chain whose pieces are geometrically short-relative-to-span but not feet-true short", () => {
  // 8 pieces each 40 units long, gap 8: span = 8*(40+8) - 8 = 376, so each
  // piece is 40/376 ≈ 10.6% of the span — comfortably under the 15%
  // scale-free fraction — but at mppf=1 (1 unit = 1 real foot), 40 feet is
  // nowhere near a real ~0.25ft dash convention.
  const segs = dashRun(0, 0, 8, 40, 8);
  const scaleFree = detectDashedSegs(segs);
  assert.ok([...scaleFree].every((v) => v === 1), "without scale, the span-fraction fallback accepts this shape");
  const feetTrue = detectDashedSegs(segs, undefined, { mppf: 1 });
  assert.ok([...feetTrue].every((v) => v === 0), "with real scale known, 40ft pieces are not a real dash cadence");
});

test("detectDashedSegs: an empty or tiny segs array never throws", () => {
  assert.deepEqual([...detectDashedSegs([])], []);
  assert.deepEqual([...detectDashedSegs([0, 0, 1, 0])], [0]);
});

test("detectDashedSegs: fewer than minCount stays unflagged, but exactly minCount qualifies (boundary)", () => {
  const three = dashRun(0, 0, 3, 4, 4);
  assert.ok([...detectDashedSegs(three)].every((v) => v === 0));
  const four = dashRun(0, 0, 4, 4, 4);
  assert.ok([...detectDashedSegs(four)].every((v) => v === 1));
});

// Real-corpus-shaped regression lock (measured directly, 2026-09-15):
// extracted the real Bessemer p6 vector geometry (extractVectorGeometry,
// 38,339 segments) and ran detectDashedSegs against it. Within a generous
// box around the T-thermostat-to-EBB-1 control line the verified
// keys/bessemer.serves.csv key describes as "a continuous dashed line
// (right from the T, then a 90-degree turn straight down into the top of
// the EBB-1 symbol)", exactly 7 real segments were flagged — every one at
// the identical x=2424.2, running in regular ~18px dash+gap steps from
// y=1068.5 (T's own y=1069) down to y=1179.4 (EBB-1's own y=1177). The
// SHORT initial horizontal hop near the T circle itself never appeared as
// its own flagged run (too few real pieces to clear minCount) — only the
// longer vertical leg did, split cleanly from the horizontal leg by the
// collinearity test at the real 90-degree bend. This is the exact "a bent
// dashed path splits into independently-classified straight legs, and a
// too-short leg honestly stays unflagged rather than being force-fit"
// shape a real L-shaped control line produces — reproduced synthetically
// here (not re-loading the real 38k-segment PDF in a fast unit test) as a
// permanent regression lock for that real, measured finding.
test("detectDashedSegs: a real bent (L-shaped) control line — short horizontal leg below minCount, long vertical leg flagged — matches the measured Bessemer T-EBB1 shape", () => {
  // short horizontal leg near the T circle: only 2 pieces, below minCount —
  // must never be force-classified.
  const horizLeg = dashRun(2354, 1069, 2, 5, 4);
  // the real vertical leg: 7 pieces, x constant at 2424.2, y 1068.5->1179.4
  const vertLeg: number[] = [];
  let y = 1068.5;
  for (let i = 0; i < 7; i++) {
    const dashLen = i === 0 || i === 6 ? 6.0 : 8.9;
    vertLeg.push(2424.2, y, 2424.2, y + dashLen);
    y += dashLen + 9.2;
  }
  const segs = [...horizLeg, ...vertLeg];
  const out = detectDashedSegs(segs);
  assert.deepEqual([...out.slice(0, 2)], [0, 0], "the short horizontal leg alone must stay unflagged (below minCount)");
  assert.ok([...out.slice(2)].every((v) => v === 1), "the real 7-piece vertical leg must be fully flagged");
});

// ── detectDashedRuns (Phase 5 item 1, first increment) ───────────────────
// The run-identity output detectDashedSegs's own internal `chain` already
// computed and discarded — see dashdetect.ts's own DashDetectResult doc
// comment for why "same run" vs. "different run" is load-bearing (never
// bridge two different runIds on proximity alone).

test("detectDashedRuns: flags exactly match detectDashedSegs's own output (a pure refactor, not a behavior change)", () => {
  const segs = dashRun(0, 0, 10, 4, 4);
  const { flags } = detectDashedRuns(segs);
  assert.deepEqual([...flags], [...detectDashedSegs(segs)]);
});

test("detectDashedRuns: every piece of ONE real dash run shares the SAME runId", () => {
  const segs = dashRun(0, 0, 10, 4, 4);
  const { runIds } = detectDashedRuns(segs);
  const ids = new Set(runIds);
  assert.equal(ids.size, 1, "one continuous run must be exactly one runId");
  assert.ok(![...runIds].includes(-1), "every piece of a real run must carry a real (non -1) runId");
});

test("detectDashedRuns: two SEPARATE runs (different pens, geometrically far apart) get DIFFERENT runIds", () => {
  const runA = dashRun(0, 0, 10, 4, 4);          // meta undefined -> same pen as runB unless given metaBytes
  const runB = dashRun(1000, 1000, 10, 4, 4);    // far away, but pens differ below to force a real chain break
  const segs = [...runA, ...runB];
  const meta = new Uint8Array(20);
  for (let i = 10; i < 20; i++) meta[i] = 0x10; // a different pen width nibble breaks the chain (sameMeta check)
  const { flags, runIds } = detectDashedRuns(segs, meta);
  assert.ok([...flags].every((v) => v === 1), "both runs individually still qualify as real dash runs");
  const idsA = new Set([...runIds].slice(0, 10));
  const idsB = new Set([...runIds].slice(10, 20));
  assert.equal(idsA.size, 1);
  assert.equal(idsB.size, 1);
  assert.notEqual([...idsA][0], [...idsB][0], "two geometrically and stylistically distinct runs must never share a runId");
});

test("detectDashedRuns: a non-dash segment always carries runId -1", () => {
  const segs = [0, 0, 200, 0]; // one long solid segment, below minCount as a dash run
  const { flags, runIds } = detectDashedRuns(segs);
  assert.deepEqual([...flags], [0]);
  assert.deepEqual([...runIds], [-1]);
});
