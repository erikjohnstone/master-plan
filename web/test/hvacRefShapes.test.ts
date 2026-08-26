// hvacRefShapes.ts + matchAgainstLibrary (symbolsweep.ts) — maturity plan
// Phase 2, #HVAC-3: seed a match from a hand-authored reference shape
// instead of requiring a human to marquee a real instance first. Real,
// measured numbers below — this file is also the record of a real bug this
// work caught before shipping: an earlier version of hvacRefShapes.ts gave
// the ball valve's lever handle nearly the SAME length as the gate valve's
// stem (only the angle differed), and at this library's own real-world
// scale that scored a false 1.0 MATCH against a bare gate valve — fixed by
// making the handle clearly, measurably longer (see hvacRefShapes.ts's own
// comment). The tests below pin the corrected, measured behavior so that
// regression can't creep back in unnoticed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchAgainstLibrary } from "../src/lib/symbolsweep.ts";
import { GATE_VALVE, BALL_VALVE, HVAC_REF_SHAPES } from "../src/lib/hvacRefShapes.ts";

// A target "sheet" at a known, committed scale (1 ft real-world per 96 image
// px — an arbitrary but fixed convention, chosen only so the real-world-inch
// math is independently checkable: 1 in = 8 image px). Two real gate valves
// and one real ball valve, drawn at exactly the reference shapes' own
// real-world-inch geometry converted through that same ratio — proving the
// scale-conversion math end-to-end, not just the matcher in isolation.
const UPP = 1 / 96;
const PX_PER_IN = 1 / (UPP * 12);   // = 8

function bowtiePx(px: number, py: number, w: number, h: number): number[] {
  const hw = w / 2;
  return [
    px + 0, py + 0, px + hw, py + h / 2,
    px + hw, py + h / 2, px + 0, py + h,
    px + 0, py + h, px + 0, py + 0,
    px + w, py + 0, px + hw, py + h / 2,
    px + hw, py + h / 2, px + w, py + h,
    px + w, py + h, px + w, py + 0,
  ];
}
const W = 6 * PX_PER_IN, H = 3.5 * PX_PER_IN, STEM = 3.25 * PX_PER_IN, HANDLE = 4.5 * PX_PER_IN;
const gateAt = (px: number, py: number) => [...bowtiePx(px, py, W, H), px + W / 2, py + H / 2, px + W / 2, py + H / 2 - STEM];
const ballAt = (px: number, py: number) => [...bowtiePx(px, py, W, H), px + W / 2, py + H / 2, px + W / 2 + HANDLE * 0.8, py + H / 2 - HANDLE * 0.6];

const segs = [...gateAt(100, 100), ...gateAt(300, 100), ...ballAt(200, 300)];

test("matchAgainstLibrary: GATE_VALVE finds the 2 real gate valves, withholds (never matches) the ball valve", () => {
  const [gate] = matchAgainstLibrary(segs, [GATE_VALVE], UPP);
  assert.equal(gate.name, "gate valve");
  assert.equal(gate.result.matches.length, 2, "exactly the 2 real gate valve instances");
  assert.ok(gate.result.matches.every((m) => m.score === 1));
  assert.equal(gate.result.withheld.length, 1, "the ball valve — a real near-miss, never silently promoted");
  assert.ok(gate.result.withheld[0].score > 0.75 && gate.result.withheld[0].score < 0.92);
});

test("matchAgainstLibrary: BALL_VALVE finds the 1 real ball valve, withholds (never matches) either gate valve", () => {
  const [ball] = matchAgainstLibrary(segs, [BALL_VALVE], UPP);
  assert.equal(ball.name, "ball valve");
  assert.equal(ball.result.matches.length, 1);
  assert.equal(ball.result.matches[0].score, 1);
  assert.ok(ball.result.withheld.length >= 1, "at least one gate valve instance surfaces as a near-miss, not a false match");
  assert.ok(ball.result.withheld.every((w) => w.score > 0.75 && w.score < 0.92));
  assert.ok(!ball.result.matches.some((m) => Math.abs(m.at[0] - 124) < 5 || Math.abs(m.at[0] - 324) < 5), "neither gate valve position is ever reported as a match");
});

test("matchAgainstLibrary: refuses without a committed scale, rather than guessing one", () => {
  assert.throws(() => matchAgainstLibrary(segs, [GATE_VALVE], null), /No committed scale/);
  assert.throws(() => matchAgainstLibrary(segs, [GATE_VALVE], undefined), /No committed scale/);
});

test("matchAgainstLibrary: one call against the whole library reports every shape, independently scored", () => {
  const results = matchAgainstLibrary(segs, HVAC_REF_SHAPES, UPP);
  assert.equal(results.length, HVAC_REF_SHAPES.length);
  const byName = Object.fromEntries(results.map((r) => [r.name, r.result]));
  assert.equal(byName["gate valve"].matches.length, 2);
  assert.equal(byName["ball valve"].matches.length, 1);
});

test("HVAC_REF_SHAPES: every entry has a name and non-empty real-world-inch geometry", () => {
  assert.ok(HVAC_REF_SHAPES.length >= 2);
  for (const ref of HVAC_REF_SHAPES) {
    assert.ok(ref.name.trim().length > 0);
    assert.ok(ref.segsIn.length > 0 && ref.segsIn.length % 4 === 0);
  }
});
