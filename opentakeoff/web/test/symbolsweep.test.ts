// Symbol Sweep engine — synthetic-segment contracts: exact counts on a grid of
// identical clusters, rotation/mirror behind their options, the withheld band,
// tolerance behavior, decoy rejection, determinism, and the reported work cap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sweepSymbols, fingerprintSymbol, assertDistinctiveSymbolSeed, matchSymbol, scaleFingerprint, fragmentedTagOcc, familyQuorumFragmentedTagOcc, deepHyphenChainTagOcc, familySuffixTagOcc, compoundTagOcc, hasSymbolSweepPlanTitle, hasSymbolSweepPlanEvidence, type Point, type FlatSpan, type SymbolSweepRoleSpan, type SweepMatch, type SweepWithheld } from "../src/lib/symbolsweep.ts";
import { AFFINE_MIN_SINGULAR } from "../src/lib/symbolAffine.ts";

// docs/SYMBOL-SWEEP-CLEAN-CORPUS-GOAL.md Phase A — no row `matchSymbol` ever
// returns may carry a transform whose fit has collapsed onto a point or a
// line (the real corpus mechanism behind case 11's `scale_x: 0, scale_y: 0,
// score: 1` matches): `fitAffine` now refuses such a fit outright, so this
// should hold vacuously, but it is asserted directly against real matchSymbol
// output — not just against fitAffine in isolation — everywhere a disclosed
// transform exists in this file's own established fixtures.
function assertNoCollapsedTransform(rows: ReadonlyArray<SweepMatch | SweepWithheld>): void {
  for (const row of rows) {
    if (!row.transform) continue;
    const sMin = Math.min(row.transform.scale_x, row.transform.scale_y);
    assert.ok(sMin >= AFFINE_MIN_SINGULAR * 0.999, // float slack on the disclosed (rounded) scale
      `disclosed transform has a collapsed singular value ${sMin} < ${AFFINE_MIN_SINGULAR}: ${JSON.stringify(row)}`);
  }
}

test("set sweep recognizes an exporter-fragmented discipline plan title without trusting an index row", () => {
  const fragmented: SymbolSweepRoleSpan[] = [
    { str: "MECHANICAL", x: 100, y: 900, w: 82, h: 12 },
    { str: "VENTILATION -", x: 186, y: 900, w: 104, h: 12 },
    { str: "BASEMENT PLAN - AREA 1", x: 294, y: 900, w: 175, h: 12 },
  ];
  assert.equal(hasSymbolSweepPlanTitle(fragmented), true);
  assert.equal(hasSymbolSweepPlanTitle([
    { str: "M5.01", x: 40, y: 100, w: 36, h: 10 },
    { str: "MECHANICAL FLOOR PLAN", x: 82, y: 100, w: 150, h: 10 },
  ]), false, "a sheet-index row is not the page's own plan title");
  assert.equal(hasSymbolSweepPlanTitle([
    { str: "SEE MECHANICAL FLOOR PLAN", x: 100, y: 100, w: 190, h: 10 },
  ]), false, "a reference note is not a title");
  assert.equal(hasSymbolSweepPlanTitle([
    { str: "MECHANICAL EQUIPMENT SCHEDULE", x: 100, y: 100, w: 220, h: 10 },
  ]), false, "a schedule remains outside installed-work counting");
});

test("set sweep recognizes generalized HVAC field-plan evidence but not aligned schedule columns", () => {
  const field: SymbolSweepRoleSpan[] = [
    { str: "MATCHLINE", x: 100, y: 500, w: 70, h: 12 },
    { str: "VAV-1", x: 120, y: 120, w: 42, h: 12 },
    { str: "VAV-2", x: 700, y: 650, w: 42, h: 12 },
    { str: "175 CFM", x: 180, y: 160, w: 55, h: 12 },
    { str: "220 CFM", x: 680, y: 220, w: 55, h: 12 },
    { str: "90 CFM", x: 350, y: 620, w: 48, h: 12 },
    { str: "1,100 CFM", x: 760, y: 700, w: 66, h: 12 },
  ];
  assert.equal(hasSymbolSweepPlanEvidence(field, 1000, 800), true,
    "MATCHLINE plus repeated equipment/flow annotations is plan-field evidence");

  const denseField: SymbolSweepRoleSpan[] = [];
  const schedule: SymbolSweepRoleSpan[] = [];
  for (let i = 0; i < 10; i++) {
    denseField.push(
      { str: `CV-${i + 1}`, x: 80 + (i % 5) * 180, y: 80 + Math.floor(i / 5) * 460, w: 42, h: 12 },
      { str: `${i + 1}.5 GPM`, x: 130 + (i % 5) * 180, y: 120 + Math.floor(i / 5) * 460, w: 58, h: 12 },
    );
    schedule.push(
      { str: `CV-${i + 1}`, x: 100, y: 100 + i * 45, w: 42, h: 12 },
      { str: `${i + 1}.5 GPM`, x: 500, y: 100 + i * 45, w: 58, h: 12 },
    );
  }
  assert.equal(hasSymbolSweepPlanEvidence(denseField, 1000, 800), true,
    "independently dispersed tag and flow evidence identifies a dense field plan");
  assert.equal(hasSymbolSweepPlanEvidence(schedule, 1000, 800), false,
    "aligned MARK and GPM columns remain a schedule, not installed work");
});

// The test symbol — deliberately ASYMMETRIC under every rotation and mirror:
// a 20×20 square, ONE diagonal, and a stub off the right side. Local coords,
// y down (image space).
//   sides 4×20 = 80, diagonal ≈ 28.28, stub 14 → total ≈ 122.28
//   square ≈ 65.4% of the score; diagonal ≈ 23.1%; stub ≈ 11.4%
// The weights are load-bearing: square alone (a decoy, or a rotated copy read
// without rotations) scores 0.654 < the 0.75 floor; square + diagonal (a
// mirrored copy aliasing a rotated one through the shared anti-diagonal)
// scores 0.886 < the 0.92 bar; a broken diagonal scores 0.769 — inside the
// withheld band.
const SYMBOL: [number, number, number, number][] = [
  [0, 0, 20, 0], [20, 0, 20, 20], [20, 20, 0, 20], [0, 20, 0, 0],  // square
  [0, 0, 20, 20],                                                   // diagonal
  [20, 10, 34, 10],                                                 // stub, +x
];

/** Place segment sets into one flat segs array. Each placement transforms the
 * local symbol: translate, optional rotation (deg CW, y-down frame) about the
 * local origin, optional mirror (x → −x) before rotation. */
function place(sets: { at: Point; rot?: number; mir?: boolean; sc?: number; segs?: [number, number, number, number][]; jitter?: number }[]): number[] {
  const out: number[] = [];
  for (const s of sets) {
    const th = ((s.rot ?? 0) * Math.PI) / 180;
    const c = Math.cos(th), sn = Math.sin(th);
    const k = s.sc ?? 1;   // drawn size — a detail sheet draws the same mark larger
    const tx = (x0: number, y0: number): Point => {
      const x = x0 * k, y = y0 * k;
      const mx = s.mir ? -x : x;
      return [mx * c - y * sn + s.at[0], mx * sn + y * c + s.at[1]];
    };
    for (const [ax, ay, bx, by] of s.segs ?? SYMBOL) {
      const a = tx(ax, ay), b = tx(bx, by);
      // jitter is PER-ENDPOINT and opposing (+j / −j), never uniform — a
      // uniform shift is a translation and the sweep rightly matches it
      const j = s.jitter ?? 0;
      out.push(a[0] + j, a[1], b[0] - j, b[1]);
    }
  }
  return out;
}

const RECT: [Point, Point] = [[-5, -5], [39, 25]];   // marquee around the instance at (0,0)

test("a grid of identical clusters: exact count, seed excluded, deterministic order", () => {
  const segs = place([
    { at: [0, 0] },                     // the seed instance
    { at: [100, 0] }, { at: [200, 0] },
    { at: [100, 100] }, { at: [200, 100] }, { at: [0, 100] },
  ]);
  const r = sweepSymbols(segs, RECT);
  assert.equal(r.seed.segments, 6);
  assert.equal(r.matches.length, 5, "every instance except the seed itself");
  assert.equal(r.withheld.length, 0);
  assert.ok(r.matches.every((m) => m.score === 1 && m.rotation === 0 && !m.mirrored));
  // deterministic reading order: y first, then x
  const centers = r.matches.map((m) => [m.at[1], m.at[0]]);
  assert.deepEqual(centers, [...centers].sort((a, b) => a[0] - b[0] || a[1] - b[1]), "reading order");
  const again = sweepSymbols(segs, RECT);
  assert.deepEqual(again, r, "same input, same result, byte for byte");
});

test("the same drawn symbol still matches when every target line is split into PDF subpaths", () => {
  const split = SYMBOL.flatMap(([ax, ay, bx, by]) => {
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    return [[ax, ay, mx, my], [mx, my, bx, by]] as [number, number, number, number][];
  });
  const segs = place([{ at: [0, 0] }, { at: [100, 0], segs: split }]);
  const r = sweepSymbols(segs, RECT);
  assert.equal(r.matches.length, 1);
  assert.equal(r.withheld.length, 0);
  assert.ok(r.matches[0].score >= 0.92, `split-path line-body coverage: ${r.matches[0].score}`);
  assert.ok(Math.abs(r.matches[0].at[0] - 112) <= 2, "reported at the symbol centroid, not a subpath midpoint");
});

test("candidate regions preserve in-window scores while pruning whole-sheet work", () => {
  const placements = Array.from({ length: 80 }, (_, i) => ({ at: [(i % 20) * 100, Math.floor(i / 20) * 100] as Point }));
  const segs = place(placements);
  const fp = fingerprintSymbol(segs, RECT);
  const full = matchSymbol(fp, segs);
  const target = full.matches.find((m) => m.at[0] > 900 && m.at[0] < 1100 && m.at[1] > 90 && m.at[1] < 210);
  assert.ok(target);

  const radius = 5;
  const focused = matchSymbol(fp, segs, { candidateRegions: [{ center: target.at, radius }] });
  assert.deepEqual(focused.matches, [target], "the in-window placement is scored identically");
  assert.equal(focused.withheld.length, 0);
  assert.ok(focused.candidates.considered < full.candidates.considered / 20, "irrelevant whole-sheet proposals are never scored");
});

test("rotated and mirrored copies: found when enabled, ignored when disabled", () => {
  const segs = place([
    { at: [0, 0] },
    { at: [100, 0], rot: 90 },
    { at: [200, 0], mir: true },
    { at: [300, 0] },
  ]);
  const all = sweepSymbols(segs, RECT);
  assert.equal(all.matches.length, 3);
  assert.equal(all.matches.filter((m) => m.rotation !== 0 && !m.mirrored).length, 1, "the rotated copy");
  assert.equal(all.matches.filter((m) => m.mirrored).length, 1, "the mirrored copy");
  assert.equal(all.matches.filter((m) => m.rotation === 0 && !m.mirrored).length, 1, "the plain translation");
  assert.equal(all.withheld.length, 0, "symmetry shadows of matched instances are suppressed, never listed as questions");

  const noRot = sweepSymbols(segs, RECT, { rotations: false, mirror: false });
  assert.equal(noRot.matches.length, 1, "translation only");
  // the rotated/mirrored instances share the square + nothing else usable:
  // 80/116.28 ≈ 0.688 < scoreLow, so they are ignored, not withheld
  assert.equal(noRot.withheld.length, 0);

  const mirOnly = sweepSymbols(segs, RECT, { rotations: false, mirror: true });
  assert.equal(mirOnly.matches.length, 2, "translation + mirror, no rotation");
  // the rotated copy seen through the mirror transform shares square +
  // anti-diagonal (0.886): an honest near-match, REPORTED as withheld
  assert.equal(mirOnly.withheld.length, 1);
  assert.ok(mirOnly.withheld[0].score < 0.92 && mirOnly.withheld[0].score >= 0.75);
});

test("a perturbed near-miss lands in withheld with a reason, and is never a match", () => {
  const perturbed = SYMBOL.map((s, i) => (i === 4 ? [0, 0, 26, 20] as [number, number, number, number] : s)); // diagonal endpoint off by 6px
  const segs = place([
    { at: [0, 0] },
    { at: [100, 0] },                       // clean → match
    { at: [200, 0], segs: perturbed },      // diagonal broken → ≈ 0.757 → withheld
  ]);
  const r = sweepSymbols(segs, RECT);
  assert.equal(r.matches.length, 1);
  assert.equal(r.withheld.length, 1);
  const w = r.withheld[0];
  assert.ok(w.score >= 0.75 && w.score < 0.92, `withheld band: ${w.score}`);
  assert.match(w.reason, /commit bar/);
  assert.ok(Math.abs(w.at[0] - 200 - 11.95) < 3, "reported where the near-miss sits");
  // Phase 4 of docs/SYMBOL-SWEEP-AFFINE-GOAL.md — the reason names WHICH
  // segment is missing (the ~28px diagonal, by length — the code has no
  // semantic name for it), not just the aggregate percentage.
  assert.match(w.reason, /missing the 28 px diagonal/, `reason should name the broken diagonal by length and orientation: ${w.reason}`);
  assert.match(w.reason, /% of linework\)/, `reason should quantify the missing share: ${w.reason}`);
});

test("tolerance behavior: jitter within tolPx matches, beyond it does not — and a wider tolerance recovers it", () => {
  const segs = place([
    { at: [0, 0] },
    { at: [100, 0], jitter: 0.7 },   // endpoints off ±0.7px — inside the 2px ball
    { at: [200, 0], jitter: 5 },     // endpoints off ±5px — outside it
  ]);
  const tight = sweepSymbols(segs, RECT);   // default tol 2
  assert.equal(tight.matches.length, 1, "0.7px jitter matches at tol 2");
  assert.ok(tight.matches[0].at[0] < 150);
  const wide = sweepSymbols(segs, RECT, { tolPx: 8 });
  assert.equal(wide.matches.length, 2, "5px jitter matches once the tolerance says so");
});

test("a decoy cluster sharing some segments does NOT match", () => {
  const squareOnly = SYMBOL.slice(0, 4);
  const segs = place([
    { at: [0, 0] },
    { at: [100, 0] },
    { at: [200, 0], segs: squareOnly },   // the square without diagonal/stub: ≈ 0.688
  ]);
  const r = sweepSymbols(segs, RECT);
  assert.equal(r.matches.length, 1);
  assert.equal(r.withheld.length, 0, "0.688 is below the withhold floor — not the symbol, not a near-miss");
});

test("the work ceiling is reported, never silent — a truncated count says so", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ at: [i * 50, 0] as Point }));
  const segs = place(many);
  const r = sweepSymbols(segs, RECT, { maxCandidates: 10 });
  assert.equal(r.candidates.considered, 10);
  assert.ok(r.candidates.dropped > 0, "overflow counted");
  assert.equal(r.complete, false, "a truncated count is a floor and must say so");
  const full = sweepSymbols(segs, RECT);
  assert.equal(full.candidates.dropped, 0);
  assert.equal(full.complete, true);
  assert.equal(full.matches.length, 39);
});

test("the default scores every proposal — no caller-side cap needed for a complete count (#261)", () => {
  // 40 instances of a symbol whose segment lengths repeat sheet-wide: the
  // anchor-rarity walk proposes far more placements than instances exist,
  // which is exactly the small-dense-symbol case the old 20k default bit on.
  const many = Array.from({ length: 40 }, (_, i) => ({ at: [(i % 8) * 55, Math.floor(i / 8) * 55] as Point }));
  const segs = place(many);
  const r = sweepSymbols(segs, RECT);
  assert.equal(r.complete, true, "default sweep runs to completion");
  assert.equal(r.matches.length, 39, "every instance found without touching maxCandidates");
});

test("an empty seed rect refuses with instruction, not a crash", () => {
  const segs = place([{ at: [0, 0] }]);
  assert.throws(() => sweepSymbols(segs, [[500, 500], [600, 600]]), /fully inside the seed rect/);
  // a rect edge slicing the symbol: crossing segments don't count as the
  // symbol, and here NOTHING sits fully inside — same refusal
  assert.throws(() => sweepSymbols(segs, [[-5, -5], [10, 10]]), /fully inside the seed rect/);
});

test("interactive seed distinctiveness refuses line fragments but accepts a compact closed symbol", () => {
  const twoStroke = fingerprintSymbol([
    0, 0, 18, 0,
    9, -5, 9, 5,
  ], [[-2, -7], [20, 7]]);
  assert.throws(() => assertDistinctiveSymbolSeed(twoStroke), /only 2 vector segments/);

  const openFive = fingerprintSymbol([
    0, 0, 10, 0,
    10, 0, 16, 6,
    16, 6, 22, 0,
    22, 0, 32, 0,
    16, 6, 16, 14,
  ], [[-2, -2], [34, 16]]);
  assert.throws(() => assertDistinctiveSymbolSeed(openFive), /only 5 open vector segments/);

  const triangle = fingerprintSymbol([
    0, 20, 12, 0,
    12, 0, 24, 20,
    24, 20, 0, 20,
  ], [[-2, -2], [26, 22]]);
  assert.doesNotThrow(() => assertDistinctiveSymbolSeed(triangle));
  assert.doesNotThrow(() => assertDistinctiveSymbolSeed(fingerprintSymbol(place([{ at: [0, 0] }]), RECT)));
});

// ── phase 2: fingerprint on one sheet, match on another ─────────────────────

test("cross-sheet: a fingerprint from a detail sheet finds every instance on a plan sheet", () => {
  // the "detail sheet": one instance, plus unrelated linework
  const detail = place([{ at: [400, 300] }]);
  detail.push(0, 0, 700, 0, 700, 0, 700, 500); // border runs, never the symbol
  const fp = fingerprintSymbol(detail, [[395, 295], [439, 325]]);
  assert.equal(fp.segments, 6);
  assert.ok(Math.abs(fp.center[0] - 411.95) < 0.1 && Math.abs(fp.center[1] - 310) < 0.1);

  // the "plan sheet": three instances, one rotated — different array entirely
  const plan = place([{ at: [50, 50] }, { at: [250, 50] }, { at: [100, 200], rot: 90 }]);
  const r = matchSymbol(fp, plan);
  assert.equal(r.matches.length, 3, "no seed on this sheet — every instance counts");
  assert.equal(r.matches.filter((m) => m.rotation !== 0).length, 1);
  assert.ok(r.matches.every((m) => m.score === 1));
  // deterministic: same fingerprint, same sheet, same result
  assert.deepEqual(matchSymbol(fp, plan), r);
});

test("excludeCenter suppresses the seed's own location; omitting it keeps the self-match", () => {
  const segs = place([{ at: [0, 0] }, { at: [100, 0] }]);
  const fp = fingerprintSymbol(segs, RECT);
  const withSeed = matchSymbol(fp, segs);
  assert.equal(withSeed.matches.length, 2, "no exclusion: the seed instance matches itself at 1.0");
  const excluded = matchSymbol(fp, segs, { excludeCenter: fp.center });
  assert.equal(excluded.matches.length, 1, "excluded: only the other instance");
});

test("sweepSymbols is exactly fingerprint + match with the seed excluded", () => {
  const segs = place([{ at: [0, 0] }, { at: [100, 0] }, { at: [200, 100], rot: 180 }]);
  const composed = (() => {
    const fp = fingerprintSymbol(segs, RECT);
    return matchSymbol(fp, segs, { excludeCenter: fp.center });
  })();
  const whole = sweepSymbols(segs, RECT);
  assert.deepEqual(whole.matches, composed.matches);
  assert.deepEqual(whole.withheld, composed.withheld);
  assert.deepEqual(whole.candidates, composed.candidates);
});

// ── #186: the stated size ratio ─────────────────────────────────────────────
// A detail sheet draws the same mark enlarged. Size-true matching finds nothing
// there, and finds it SILENTLY — zero matches with zero near-misses reads
// exactly like absence. The ratio is stated by the caller from two committed
// scales, never searched.

/** The seed as a detail sheet draws it: 12× (1-1/2" = 1'-0" against a 1/8"
 * plan), plus border linework that is not the symbol. */
const detail12 = (): number[] => {
  const d = place([{ at: [400, 300], sc: 12 }]);
  d.push(0, 0, 2000, 0, 2000, 0, 2000, 1500);
  return d;
};
const DETAIL12_RECT: [Point, Point] = [[380, 280], [830, 560]];

test("#186 the bug: an enlarged detail seed finds NOTHING on the plans, silently, without a ratio", () => {
  const fp = fingerprintSymbol(detail12(), DETAIL12_RECT);
  assert.equal(fp.segments, 6, "the whole symbol is fingerprinted at detail size");
  const plan = place([{ at: [50, 50] }, { at: [250, 50] }, { at: [100, 200], rot: 90 }]);
  const blind = matchSymbol(fp, plan);
  assert.equal(blind.matches.length, 0);
  assert.equal(blind.withheld.length, 0, "not even a near-miss — indistinguishable from absence");
});

test("#186 the fix: the stated ratio resizes the seed and every plan instance is found", () => {
  const fp = fingerprintSymbol(detail12(), DETAIL12_RECT);
  const plan = place([{ at: [50, 50] }, { at: [250, 50] }, { at: [100, 200], rot: 90 }]);
  const r = matchSymbol(fp, plan, { scale: 1 / 12 });
  assert.equal(r.matches.length, 3, "all three, including the rotated one");
  assert.equal(r.matches.filter((m) => m.rotation !== 0).length, 1);
  assert.ok(r.matches.every((m) => m.score === 1), "exact linework, exact score — no tolerance was loosened to get here");
  assert.equal(r.scaled?.segments, 6);
  assert.equal(r.scaled?.sub_pixel_dropped, 0);
  assert.equal(r.scaled?.tol_px, 2, "shrinking never loosens the endpoint test");
  assert.deepEqual(matchSymbol(fp, plan, { scale: 1 / 12 }), r, "deterministic");
});

test("#186 the reverse trip: a plan seed swept across an enlarged detail sheet", () => {
  const fp = fingerprintSymbol(place([{ at: [0, 0] }]), RECT);
  const detail = place([{ at: [400, 300], sc: 12 }]);
  assert.equal(matchSymbol(fp, detail).matches.length, 0, "size-true finds nothing");
  const r = matchSymbol(fp, detail, { scale: 12 });
  assert.equal(r.matches.length, 1);
  assert.equal(r.scaled?.tol_px, 24, "magnifying the seed magnifies its drawn jitter — tolerance rides UP with it");
});

test("#186 scale 1 is the pre-#186 search, bit for bit", () => {
  const segs = place([{ at: [0, 0] }, { at: [100, 0] }, { at: [200, 100], rot: 180 }]);
  const fp = fingerprintSymbol(segs, RECT);
  const plan = place([{ at: [50, 50] }, { at: [250, 50] }, { at: [100, 200], rot: 90 }]);
  const bare = matchSymbol(fp, plan);
  assert.deepEqual(matchSymbol(fp, plan, { scale: 1 }), bare);
  assert.equal(bare.scaled, undefined, "a same-scale result is the object it always was — no new key");
  assert.equal(scaleFingerprint(fp, 1), fp, "and the fingerprint is not even copied");
});

test("#186 sub-pixel detail is dropped from the score, not carried, and is disclosed", () => {
  // the detail carries a 4-px tick the plan-size mark cannot resolve: at 1/12
  // it is 0.33 px, below any honest tolerance
  const withTick = detail12();
  withTick.push(400, 300, 404, 300);
  const fp = fingerprintSymbol(withTick, DETAIL12_RECT);
  assert.equal(fp.segments, 7);
  const plan = place([{ at: [50, 50] }, { at: [250, 50] }]);
  const r = matchSymbol(fp, plan, { scale: 1 / 12 });
  assert.equal(r.scaled?.sub_pixel_dropped, 1);
  assert.equal(r.scaled?.segments, 6, "scored against what survived the trip");
  assert.equal(r.matches.length, 2);
  assert.ok(r.matches.every((m) => m.score === 1), "an unmatchable speck must not depress every real instance below the bar");
});

test("#186 refusals: a symbol that shrinks inside tolerance, a ratio no sheet pair has, a bad number", () => {
  const fp = fingerprintSymbol(place([{ at: [0, 0] }]), RECT);   // footprint ≈ 39.5 px
  const plan = place([{ at: [50, 50] }]);
  assert.throws(() => matchSymbol(fp, plan, { scale: 1 / 8 }), /inside the .* matching tolerance/,
    "≈4.9 px across is not a symbol, and every placement would score alike");
  assert.throws(() => matchSymbol(fp, plan, { scale: 200 }), /outside the sane band/);
  assert.throws(() => matchSymbol(fp, plan, { scale: 0 }), /positive, finite/);
  assert.throws(() => matchSymbol(fp, plan, { scale: Number.NaN }), /positive, finite/);
  assert.throws(() => matchSymbol(fp, plan, { scale: 2, excludeCenter: fp.center }), /means nothing on a target sheet/,
    "the seed's own location is a SOURCE-sheet point");
});

// fragmentedTagOcc (accuracy-hardening plan, this pass) — a real drawn tag
// routinely splits across multiple pdf.js text runs. Two real, DIFFERENT-
// SHAPED cases found this session motivate this: Bessemer draws "SR-1" as
// three same-row adjacent spans ("SR","-","1"); itd-d1-lab draws "EF-1" as
// two spans stacked on separate lines inside a hexagon bubble ("EF" over
// "1", no hyphen run at all). Both defeat an exact single-span match.
test("fragmentedTagOcc: Bessemer's own same-row 3-span split (\"SR\",\"-\",\"1\")", () => {
  const spans: FlatSpan[] = [
    { str: "SR", x0: 100, y0: 200, x1: 112, y1: 206 },
    { str: "-", x0: 112, y0: 200, x1: 115, y1: 206 },
    { str: "1", x0: 115, y0: 200, x1: 120, y1: 206 },
  ];
  const occ = fragmentedTagOcc(spans, "SR-1");
  assert.equal(occ.length, 1, "the three runs reconstruct into exactly one occurrence, not three or zero");
  assert.deepEqual(occ[0].bbox, [100, 200, 120, 206], "bbox spans the full reconstructed run");
});

test("fragmentedTagOcc: itd-d1-lab's own stacked 2-span split (\"EF\" over \"1\", no hyphen)", () => {
  const spans: FlatSpan[] = [
    { str: "EF", x0: 50, y0: 100, x1: 64, y1: 112 },
    { str: "1", x0: 52, y0: 112, x1: 58, y1: 124 },
  ];
  const occ = fragmentedTagOcc(spans, "EF-1");
  assert.equal(occ.length, 1, "a hyphen-insensitive, direction-agnostic chase finds the vertically-stacked run");
  assert.deepEqual(occ[0].bbox, [50, 100, 64, 124]);
});

test("fragmentedTagOcc: no false match when the tag simply isn't drawn", () => {
  const spans: FlatSpan[] = [
    { str: "EF", x0: 50, y0: 100, x1: 64, y1: 112 },
    { str: "2", x0: 52, y0: 112, x1: 58, y1: 124 },
  ];
  assert.equal(fragmentedTagOcc(spans, "EF-1").length, 0, "EF+2 must never satisfy a search for EF-1");
});

// compoundTagOcc — a single span LONGER than the key, the schedule's own
// bare key with a circuit/panel/inverter reference appended in the SAME
// PDF text run ("R1 /C-11", "E1/C-2"). A dotted numeric suffix is a sheet
// number ("P1.01", "S3.1"), not a compound instance of that short key —
// matching those lets a structural/title-block sheet steal sweep_schedule_row's
// own most-occs anchor.
test("compoundTagOcc: circuit-label remainder with space or slash delimiter counts", () => {
  const spans: FlatSpan[] = [
    { str: "R1 /C-11", x0: 10, y0: 20, x1: 80, y1: 30 },
    { str: "E1/C-2", x0: 10, y0: 40, x1: 60, y1: 50 },
    { str: "P1 /INV-2", x0: 10, y0: 60, x1: 90, y1: 70 },
  ];
  assert.equal(compoundTagOcc(spans, "R1").length, 1);
  assert.equal(compoundTagOcc(spans, "E1").length, 1);
  assert.equal(compoundTagOcc(spans, "P1").length, 1);
});

test("compoundTagOcc: a dotted numeric sheet number is not a compound instance of the short key", () => {
  const spans: FlatSpan[] = [
    { str: "S3.1", x0: 10, y0: 20, x1: 40, y1: 30 },
    { str: "S3.0", x0: 50, y0: 20, x1: 80, y1: 30 },
    { str: "P1.01", x0: 10, y0: 40, x1: 60, y1: 50 },
    { str: "P1.21", x0: 10, y0: 60, x1: 60, y1: 70 },
    { str: "S3 /C-11", x0: 10, y0: 80, x1: 80, y1: 90 },
    { str: "P1 /C-11", x0: 10, y0: 100, x1: 80, y1: 110 },
  ];
  const s3 = compoundTagOcc(spans, "S3");
  assert.equal(s3.length, 1, "S3.1/S3.0 are sheet numbers; only S3 /C-11 counts");
  assert.equal(s3[0].bbox[1], 80);
  const p1 = compoundTagOcc(spans, "P1");
  assert.equal(p1.length, 1, "P1.01/P1.21 are sheet numbers; only P1 /C-11 counts");
  assert.equal(p1[0].bbox[1], 100);
});

test("compoundTagOcc: still refuses R10/R1A as a match for R1", () => {
  const spans: FlatSpan[] = [
    { str: "R10 /C-11", x0: 10, y0: 20, x1: 80, y1: 30 },
    { str: "R1A", x0: 10, y0: 40, x1: 40, y1: 50 },
    { str: "R1", x0: 10, y0: 60, x1: 30, y1: 70 },
  ];
  assert.equal(compoundTagOcc(spans, "R1").length, 0, "exact-length and alnum-continuation spans are never compound");
});

test("fragmentedTagOcc: a parenthesized gang count is not part of the tag", () => {
  const spans: FlatSpan[] = [
    { str: "(6) LD", x0: 100, y0: 200, x1: 140, y1: 210 },
    { str: "-", x0: 140, y0: 200, x1: 144, y1: 210 },
    { str: "1", x0: 144, y0: 200, x1: 150, y1: 210 },
  ];
  assert.deepEqual(fragmentedTagOcc(spans, "LD-1")[0]?.bbox, [100, 200, 150, 210]);
});

test("familyQuorumFragmentedTagOcc: proven family skips overlapping non-prefix distractors", () => {
  const spans: FlatSpan[] = [];
  for (let i = 0; i < 4; i++) {
    const x = i * 100;
    spans.push(
      { str: "TG", x0: x, y0: 100, x1: x + 20, y1: 110 },
      { str: "-", x0: x + 20, y0: 100, x1: x + 24, y1: 110 },
      { str: "5", x0: x + 24, y0: 100, x1: x + 30, y1: 110 },
    );
  }
  spans.push(
    { str: "TG", x0: 500, y0: 100, x1: 520, y1: 110 },
    // PDF stream order places this overlapping room word first.
    { str: "WOMEN", x0: 522, y0: 99, x1: 560, y1: 109 },
    { str: "-", x0: 520, y0: 100, x1: 524, y1: 110 },
    { str: "5", x0: 524, y0: 100, x1: 530, y1: 110 },
  );
  assert.equal(fragmentedTagOcc(spans, "TG-5").length, 4);
  assert.equal(familyQuorumFragmentedTagOcc(spans, "TG-5").length, 5);
});

// deepHyphenChainTagOcc — a THIRD tier, after exact/compound AND
// fragmentedTagOcc, for a real shape past fragmentedTagOcc's own 4-hop
// budget: navfac-cherry-point-atc draws "CV-CHW-BP-M" as SEVEN same-row
// runs. Never touches fragmentedTagOcc itself — see its own header comment
// for why (a prior fix that touched fragmentedTagOcc's shared candidate-
// selection step regressed itd-d1-lab even in its most conservative form).
test("deepHyphenChainTagOcc: navfac's own 7-run same-row split (\"CV\",\"-\",\"CHW\",\"-\",\"BP\",\"-\",\"M\")", () => {
  const spans: FlatSpan[] = [
    { str: "CV", x0: 100, y0: 200, x1: 120, y1: 206 },
    { str: "-", x0: 120, y0: 200, x1: 124, y1: 206 },
    { str: "CHW", x0: 124, y0: 200, x1: 140, y1: 206 },
    { str: "-", x0: 140, y0: 200, x1: 144, y1: 206 },
    { str: "BP", x0: 144, y0: 200, x1: 156, y1: 206 },
    { str: "-", x0: 156, y0: 200, x1: 160, y1: 206 },
    { str: "M", x0: 160, y0: 200, x1: 168, y1: 206 },
  ];
  const occ = deepHyphenChainTagOcc(spans, "CV-CHW-BP-M");
  assert.equal(occ.length, 1, "the seven same-row runs reconstruct into exactly one occurrence");
  assert.deepEqual(occ[0].bbox, [100, 200, 168, 206]);
});

test("deepHyphenChainTagOcc: quarter-turned seven-run labels chain vertically", () => {
  const spans: FlatSpan[] = [
    { str: "CV", x0: 200, y0: 170, x1: 206, y1: 190 },
    { str: "-", x0: 200, y0: 164, x1: 206, y1: 170 },
    { str: "CHW", x0: 200, y0: 144, x1: 206, y1: 164 },
    { str: "-", x0: 200, y0: 138, x1: 206, y1: 144 },
    { str: "BP", x0: 200, y0: 124, x1: 206, y1: 138 },
    { str: "-", x0: 200, y0: 118, x1: 206, y1: 124 },
    { str: "T", x0: 200, y0: 110, x1: 206, y1: 118 },
  ];
  const occ = deepHyphenChainTagOcc(spans, "CV-CHW-BP-T");
  assert.equal(occ.length, 1);
  assert.deepEqual(occ[0].bbox, [200, 110, 206, 190]);
  assert.equal(occ[0].h, 6, "rotated text uses glyph thickness, not the full label length");
});

test("deepHyphenChainTagOcc: a coincidental word positioned below the start, listed earlier in the spans array, must not derail the same-row chain (the real CV-CHW-BP-M \"AS\" distractor)", () => {
  const spans: FlatSpan[] = [
    // "AS" sits directly below "CV" and appears FIRST in array order — a
    // first-array-order pick (fragmentedTagOcc's own doctrine) would grab
    // it and break the chain; nearest-by-x-distance among SAME-ROW
    // candidates only must skip it (it is not same-row at all).
    { str: "AS", x0: 100, y0: 210, x1: 116, y1: 216 },
    { str: "CV", x0: 100, y0: 200, x1: 120, y1: 206 },
    { str: "-", x0: 120, y0: 200, x1: 124, y1: 206 },
    { str: "CHW", x0: 124, y0: 200, x1: 140, y1: 206 },
    { str: "-", x0: 140, y0: 200, x1: 144, y1: 206 },
    { str: "BP", x0: 144, y0: 200, x1: 156, y1: 206 },
    { str: "-", x0: 156, y0: 200, x1: 160, y1: 206 },
    { str: "M", x0: 160, y0: 200, x1: 168, y1: 206 },
  ];
  const occ = deepHyphenChainTagOcc(spans, "CV-CHW-BP-M");
  assert.equal(occ.length, 1, "the same-row chain still resolves despite the below-row distractor appearing earlier in array order");
});

test("deepHyphenChainTagOcc: structurally gated to keys with >=2 hyphens — a single-hyphen key never reaches this function's own search at all", () => {
  const spans: FlatSpan[] = [
    { str: "US", x0: 100, y0: 200, x1: 112, y1: 206 },
    { str: "-", x0: 112, y0: 200, x1: 115, y1: 206 },
    { str: "1", x0: 115, y0: 200, x1: 120, y1: 206 },
  ];
  assert.equal(deepHyphenChainTagOcc(spans, "US-1").length, 0, "a 1-hyphen key (itd-d1-lab's own real tag shape) is gated off unconditionally, regardless of whether spans would otherwise reconstruct it");
});

test("deepHyphenChainTagOcc: no false match when the multi-hyphen tag simply isn't drawn", () => {
  const spans: FlatSpan[] = [
    { str: "CV", x0: 100, y0: 200, x1: 120, y1: 206 },
    { str: "-", x0: 120, y0: 200, x1: 124, y1: 206 },
    { str: "HHW", x0: 124, y0: 200, x1: 140, y1: 206 },
  ];
  assert.equal(deepHyphenChainTagOcc(spans, "CV-CHW-BP-M").length, 0, "CV-HHW must never satisfy a search for CV-CHW-BP-M");
});

test("familySuffixTagOcc: four complete siblings recover one nearby outlined-prefix suffix", () => {
  const spans: FlatSpan[] = [
    ...["1", "2", "3", "4", "5"].map((n, index) => ({
      str: `VAV-${n}`, x0: 100 + index * 40, y0: 100 + (index % 2) * 30,
      x1: 130 + index * 40, y1: 110 + (index % 2) * 30,
    })),
    { str: "6", x0: 210, y0: 150, x1: 216, y1: 160 },
    { str: "6", x0: 900, y0: 900, x1: 906, y1: 910 },
  ];
  const occ = familySuffixTagOcc(spans, "VAV-6");
  assert.equal(occ.length, 1);
  assert.deepEqual(occ[0].bbox, [210, 150, 216, 160]);
});

test("familySuffixTagOcc: ambiguous nearby bare suffixes remain unresolved", () => {
  const spans: FlatSpan[] = [
    ...["1", "2", "3", "4"].map((n, index) => ({
      str: `VAV-${n}`, x0: 100 + index * 40, y0: 100,
      x1: 130 + index * 40, y1: 110,
    })),
    { str: "6", x0: 150, y0: 140, x1: 156, y1: 150 },
    { str: "6", x0: 190, y0: 140, x1: 196, y1: 150 },
  ];
  assert.equal(familySuffixTagOcc(spans, "VAV-6").length, 0);
});

test("seed diagnostics: centroid and total length are the fingerprint's own", () => {
  const segs = place([{ at: [0, 0] }, { at: [100, 0] }]);
  const r = sweepSymbols(segs, RECT);
  assert.ok(Math.abs(r.seed.center[0] - 11.95) < 0.1, `length-weighted centroid x: ${r.seed.center[0]}`);
  assert.ok(Math.abs(r.seed.center[1] - 10.0) < 0.1);
  assert.ok(Math.abs(r.seed.length_px - 122.3) < 0.2);
  // the match center is the SAME construction, translated
  assert.ok(Math.abs(r.matches[0].at[0] - 111.95) < 0.1);
});

// ── SWEEP_EXTRA_MAX — richer-variant disclosure + the variant guard ──────────
// (field report: grilles / vents / registers confused; guard semantics ported
// from Spline, disclosure default preserving #259's contained-seed contract)

test("EXTRA disclosure (default): a richer variant still matches, but its extra fraction is named on the row", () => {
  // seed = plain 20×20 square; candidates: two plain squares, one square
  // carrying a diagonal (extra ≈ 28.28/80 ≈ 0.354 > the 0.30 bar)
  const sq: [number, number, number, number][] = [[0, 0, 20, 0], [20, 0, 20, 20], [20, 20, 0, 20], [0, 20, 0, 0]];
  const segs = place([
    { at: [0, 0], segs: sq },
    { at: [100, 0], segs: sq },
    { at: [200, 0], segs: sq },
    { at: [300, 0], segs: [...sq, [0, 0, 20, 20]] },   // the "register"
  ]);
  const r = sweepSymbols(segs, [[-2, -2], [22, 22]]);
  assert.equal(r.matches.length, 3, "supersets still match by default — the #259 contract");
  const suspect = r.matches.filter((m) => m.extra !== undefined);
  assert.equal(suspect.length, 1, "exactly one match is a named variant suspect");
  assert.ok(suspect[0].at[0] > 290 && suspect[0].at[0] < 330, "and it is the square-plus-diagonal");
  assert.ok((suspect[0].extra ?? 0) > 0.30 && (suspect[0].extra ?? 0) < 0.42,
    `reported extra ${suspect[0].extra} is the diagonal's share`);
  assert.ok(r.matches.filter((m) => m.at[0] < 290).every((m) => m.extra === undefined),
    "plain squares carry no extra field");
});

test("VARIANT GUARD: under variantGuard the richer variant demotes to withheld with the variant reason", () => {
  const sq: [number, number, number, number][] = [[0, 0, 20, 0], [20, 0, 20, 20], [20, 20, 0, 20], [0, 20, 0, 0]];
  const segs = place([
    { at: [0, 0], segs: sq },
    { at: [100, 0], segs: sq },
    { at: [300, 0], segs: [...sq, [0, 0, 20, 20]] },
  ]);
  const r = sweepSymbols(segs, [[-2, -2], [22, 22]], { variantGuard: true });
  assert.equal(r.matches.length, 1, "only the plain square matches under the guard");
  const demoted = r.withheld.filter((w) => /extra linework the seed lacks/.test(w.reason));
  assert.equal(demoted.length, 1, "the variant is a disclosed question, never dropped");
  assert.ok((demoted[0].extra ?? 0) > 0.30, `demoted row carries its extra (${demoted[0].extra})`);
});

// The agent surface used to spread each withheld row and then OVERWRITE
// `reason` with one flat literal, so a near-miss and a variant demotion — two
// different findings the estimator must act on differently — reached the model
// reading identically. This pins the property that flattening destroyed: the
// engine's reasons are distinguishable, and carry the numbers that make them so.
test("REASONS ARE DISTINCT: a near-miss and a variant demotion never read the same", () => {
  // the same perturbation the near-miss test above uses (diagonal endpoint off
  // by 6px → ≈0.77, inside the withheld band), plus a richer variant that the
  // guard demotes for extra ink
  const perturbed = SYMBOL.map((s, i) => (i === 4 ? [0, 0, 26, 20] as [number, number, number, number] : s));
  const segs = place([
    { at: [0, 0] },
    { at: [100, 0] },
    { at: [200, 0], segs: perturbed },
    { at: [300, 0], segs: [...SYMBOL, [0, 20, 20, 0], [0, 10, 20, 10]] as [number, number, number, number][] },
  ]);
  const r = sweepSymbols(segs, RECT, { variantGuard: true });
  const reasons = r.withheld.map((w) => w.reason);
  assert.ok(reasons.length >= 2, `expected two kinds of question, got ${reasons.length}`);
  assert.equal(new Set(reasons).size, reasons.length, `each question states its OWN finding:\n${reasons.join("\n")}`);
  assert.ok(reasons.some((x) => /commit bar/.test(x)), "the near-miss names the bar it fell under");
  assert.ok(reasons.some((x) => /extra linework the seed lacks/.test(x)), "the variant names the extra ink");
  // and every reason quantifies — a reason with no number is the flat literal
  for (const x of reasons) assert.match(x, /\d+%/, `reason states a measured percentage: ${x}`);
});

test("EXTRA: coincident duplicate ink and background runs CROSSING the footprint trip neither mode", () => {
  const sq: [number, number, number, number][] = [[0, 0, 20, 0], [20, 0, 20, 20], [20, 20, 0, 20], [0, 20, 0, 0]];
  const segs = place([
    { at: [0, 0], segs: sq },
    { at: [100, 0], segs: [...sq, ...sq] },                       // fill+stroke drawn twice
    { at: [200, 0], segs: [...sq, [-20, 10, 60, 10]] },           // a wall run crossing through
  ]);
  const guarded = sweepSymbols(segs, [[-2, -2], [22, 22]], { variantGuard: true });
  assert.equal(guarded.matches.length, 2, "duplicate-ink and crossed placements both match under the guard");
  assert.ok(guarded.matches.every((m) => m.extra === undefined), "and neither is a suspect");
});

test("VARIANT GUARD stands down in manual mode: counter-examples keep the contained-seed workflow whole (#259)", () => {
  // seed = bare square; the "drains" (square + diagonal) are wanted matches.
  // A louver-variant is excluded via counter-example (its extra ink is
  // DISJOINT from the drains', so the negative discriminates cleanly). Even
  // with variantGuard requested, negatives take over and the drains count.
  const sq: [number, number, number, number][] = [[0, 0, 20, 0], [20, 0, 20, 20], [20, 20, 0, 20], [0, 20, 0, 0]];
  const drain: [number, number, number, number][] = [...sq, [0, 0, 20, 20]];
  const louver: [number, number, number, number][] = [...sq, [0, 7, 20, 7], [0, 14, 20, 14]];
  const segs = place([
    { at: [0, 0], segs: sq },          // the seed (a bare square)
    { at: [100, 0], segs: drain },
    { at: [200, 0], segs: drain },
    { at: [300, 0], segs: louver },    // the counter-example's target
  ]);
  const fp = fingerprintSymbol(segs, [[-2, -2], [22, 22]]);
  const withNeg = matchSymbol(fp, segs, { excludeCenter: fp.center, variantGuard: true, exclude: [[[297, -3], [323, 23]]] });
  assert.equal(withNeg.matches.length, 2, "both drains count — the guard stood down for manual mode");
  assert.equal(withNeg.rejected.length, 1, "and the louver variant is the negative's rejection");
  const bare = matchSymbol(fp, segs, { excludeCenter: fp.center, variantGuard: true });
  assert.equal(bare.matches.length, 0, "without negatives the guard holds: nothing over the bar commits");
  assert.equal(bare.withheld.filter((w) => /extra linework/.test(w.reason)).length, 3,
    "drains and louver variant all come back as disclosed questions, never dropped");
});

// ── Phase 1 of docs/SYMBOL-SWEEP-AFFINE-GOAL.md — affine refinement ─────────
// opts.affine is off by default; every test above this line never sets it,
// so they also stand as the "affine absent is a no-op" proof (item (e) of
// the goal doc's §3 Phase 1 step 5) — none of them changed when this
// wiring landed.

test("affine refinement: a near-grid rotated placement withheld under the rigid search becomes a match with a disclosed transform", () => {
  // 3° off the nearest rigid guess, symbol scaled 3× so the rotation's
  // endpoint displacement clears the rigid endpoint tolerance (this is
  // near-grid refinement's own stated scope — Phase 2, not this phase,
  // is what makes an arbitrary rotation PROPOSABLE in the first place).
  const sc = 3, deg = 3;
  const rectSc: [Point, Point] = [[RECT[0][0] * sc, RECT[0][1] * sc], [RECT[1][0] * sc, RECT[1][1] * sc]];
  const segs = place([{ at: [0, 0], sc }, { at: [500, 0], sc, rot: deg }]);
  const fp = fingerprintSymbol(segs, rectSc);

  const rigid = matchSymbol(fp, segs, { excludeCenter: fp.center });
  assert.equal(rigid.matches.length, 0, "the rigid search alone should NOT commit this placement");
  assert.ok(rigid.withheld.length > 0, "but it should see SOMETHING near-miss, not silence");

  const affine = matchSymbol(fp, segs, { excludeCenter: fp.center, affine: { enabled: true } });
  assert.equal(affine.matches.length, 1, "affine refinement should recover exactly one clean match");
  const m = affine.matches[0];
  assert.ok(m.score >= 0.92, `refined score should clear the commit bar, got ${m.score}`);
  assert.ok(m.transform, "a refined match must disclose its transform (§4.1)");
  assert.ok(Math.abs(m.transform!.rotation_deg - deg) < 1, `disclosed rotation ${m.transform!.rotation_deg} vs true ${deg}`);
  assert.equal(m.transform!.via, "rigid");
  assert.equal(m.transform!.mirrored, false);
  assertNoCollapsedTransform([...affine.matches, ...affine.withheld]);
});

test("affine refinement: affine OFF is a byte-for-byte no-op vs the plain rigid search", () => {
  const sc = 3, deg = 3;
  const rectSc: [Point, Point] = [[RECT[0][0] * sc, RECT[0][1] * sc], [RECT[1][0] * sc, RECT[1][1] * sc]];
  const segs = place([{ at: [0, 0], sc }, { at: [500, 0], sc, rot: deg }]);
  const fp = fingerprintSymbol(segs, rectSc);
  const plain = matchSymbol(fp, segs, { excludeCenter: fp.center });
  const affineAbsent = matchSymbol(fp, segs, { excludeCenter: fp.center });
  assert.deepEqual(affineAbsent, plain, "identical options minus affine should be identical results");
  const affineExplicitlyOff = matchSymbol(fp, segs, { excludeCenter: fp.center, affine: { enabled: false } });
  assert.deepEqual(affineExplicitlyOff, plain, "affine.enabled:false must also be exactly the rigid result");
});

test("affine refinement: an out-of-bounds stretch is withheld with the bounds reason, never a match", () => {
  // Genuinely asymmetric open polyline (5 segments, distinct lengths, no
  // closed square) — avoids the shared SYMBOL fixture's own self-similarity
  // under non-uniform scaling, which can otherwise alias to a spurious
  // WITHIN-bounds reading tied in score with the honest out-of-bounds one.
  const ASYM: [number, number, number, number][] = [
    [0, 0, 12, 0], [12, 0, 12, 20], [12, 20, -18, 20], [-18, 20, -18, 6], [-18, 6, 2, 6],
  ];
  const placeStretched = (at: Point, sx: number, sy: number): number[] =>
    ASYM.flatMap(([ax, ay, bx, by]) => [ax * sx + at[0], ay * sy + at[1], bx * sx + at[0], by * sy + at[1]]);
  const rect: [Point, Point] = [[-23, -5], [17, 25]];
  const segs = [...placeStretched([0, 0], 1, 1), ...placeStretched([400, 0], 1.6, 1)];
  const fp = fingerprintSymbol(segs, rect);
  const affine = matchSymbol(fp, segs, { excludeCenter: fp.center, affine: { enabled: true } });
  assert.equal(affine.matches.length, 0, "a 1.6× stretch (over the default 1.5× bound) must never commit as a match");
  const perfect = affine.withheld.find((w) => w.transform && Math.abs(w.transform.scale_x - 1.6) < 0.01);
  assert.ok(perfect, `expected a withheld row disclosing the true ~1.6× fit, got: ${JSON.stringify(affine.withheld)}`);
  assert.ok(/stretch/.test(perfect!.reason) && /bar 1\.5/.test(perfect!.reason), `bounds reason should name the stretch and the bar, got: ${perfect!.reason}`);
  assertNoCollapsedTransform([...affine.matches, ...affine.withheld]);
});

// docs/SYMBOL-SWEEP-AFFINE-GOAL.md's Findings (2026-09-11, Root Cause #1) — a
// placement that only clears scoreHigh via refine()'s widened tolerance is
// physically implausible when it sits within one symbol's own footprint of
// another accepted match: no two real instances of the same symbol can be
// that close without overlapping (checked against all 47 real corpus cases'
// own ground truth before relying on it — the closest any two genuine
// same-family instances ever sit, corpus-wide, is 54.7px). Scoped ONLY to
// rows that needed the widening (`transform.tol_px > tol`), so a plain rigid
// match is never touched by this — proven directly below.
test("Phase 1 tolerance widening: a placement that only clears scoreHigh via the widened tolerance is withheld, never committed, when it sits within one footprint of another accepted match", () => {
  const sc = 3, deg = 3;
  // A pure synthetic rotation fits the affine least-squares solve PERFECTLY
  // (rms→0), so refine() re-aligns it and it scores 1.0 at the ORIGINAL 2px
  // tolerance — that's affine refinement working as intended, not the
  // widening this fix is about. Real corpus residual comes from wrong
  // correspondences, not clean geometry; a small opposing per-endpoint
  // jitter (never explainable by any single affine transform) stands in for
  // that here, forcing a genuine >2px residual so `tol_px` really is widened.
  const rectSc: [Point, Point] = [[RECT[0][0] * sc, RECT[0][1] * sc], [RECT[1][0] * sc, RECT[1][1] * sc]];
  const jitter = 1.6;
  const segs = place([
    { at: [0, 0], sc },
    { at: [500, 0], sc, rot: deg, jitter },   // isolated — nothing else nearby, stays a clean match
    { at: [1000, 0], sc, rot: deg, jitter },  // a suspect pair: both need widening AND sit
    { at: [1025, 0], sc, rot: deg, jitter },  // well under one footprint (~118px at this scale) apart
  ]);
  const fp = fingerprintSymbol(segs, rectSc);
  const r = matchSymbol(fp, segs, { excludeCenter: fp.center, affine: { enabled: true } });

  // Positions land at the symbol's own reported centroid, not exactly the
  // placement's local origin — check by RELATIVE structure (isolated vs a
  // close pair), not hardcoded absolute offsets from `at`.
  assert.equal(r.matches.length, 1, `expected only the isolated placement to commit, got matches=${JSON.stringify(r.matches)}`);
  const isolated = r.matches[0];
  assert.ok(isolated.transform && isolated.transform.tol_px > 2, "the control match should itself need the widened tolerance, or this test proves nothing");

  const suspects = r.withheld.filter((w) => /widened tolerance/.test(w.reason) && /footprint/.test(w.reason));
  assert.equal(suspects.length, 2, `expected both close placements disclosed as density-suspect, got withheld=${JSON.stringify(r.withheld)}`);
  assert.ok(
    Math.hypot(suspects[0].at[0] - suspects[1].at[0], suspects[0].at[1] - suspects[1].at[1]) < 100,
    "the two suspect readings should be near each other (that's why they're suspect)",
  );
  for (const s of suspects) {
    assert.ok(
      Math.hypot(s.at[0] - isolated.at[0], s.at[1] - isolated.at[1]) > 200,
      "a suspect reading should be far from the isolated, unaffected match, not confused with it",
    );
  }
  assertNoCollapsedTransform([...r.matches, ...r.withheld]);
});

test("Phase 1 tolerance widening: two ordinary RIGID matches (no widening needed) that sit within one footprint of each other are BOTH still committed — this check never touches pre-existing rigid-only behavior", () => {
  // Plain, unrotated copies score 1.0 under the base tolerance alone —
  // `transform` is never set (refine() is never even attempted, since a
  // rigid candidate already at scoreHigh skips it), so neither placement is
  // eligible for the density check above no matter how close together they
  // sit — exactly the safety property the fix is scoped around.
  const segs = place([{ at: [0, 0] }, { at: [500, 0] }, { at: [515, 0] }]);
  const fp = fingerprintSymbol(place([{ at: [0, 0] }]), RECT);
  const r = matchSymbol(fp, segs, { excludeCenter: fp.center });
  assert.equal(r.matches.length, 2, `expected both plain rigid matches to commit, got ${JSON.stringify(r.matches)}`);
  for (const m of r.matches) assert.ok(!m.transform, "a plain rigid match must not carry a transform");
});

// ── Phase 2 of docs/SYMBOL-SWEEP-AFFINE-GOAL.md — continuous rotation ───────
// The shared SYMBOL fixture above has its own accidental near-symmetry
// (square + one diagonal admits a real combined mirror+rotation reading),
// which is exactly the kind of confound §7.4 says to record, not route
// around silently — recorded in the goal doc's Findings. These tests use a
// genuinely asymmetric open polyline (distinct segment lengths, no near-
// symmetry) so a recovered rotation has one unambiguous right answer.
const ASYM2: [number, number, number, number][] = [
  [0, 0, 11, 0], [11, 0, 11, 23], [11, 23, -26, 23], [-26, 23, -26, 7], [-26, 7, -17, 7],
];
const placeAsym = (at: Point, deg: number, mir: boolean): number[] => {
  const th = (deg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
  return ASYM2.flatMap(([ax, ay, bx, by]) => {
    const tx = (x: number, y: number): Point => {
      const mx = mir ? -x : x;
      return [mx * c - y * s + at[0], mx * s + y * c + at[1]];
    };
    const [rax, ray] = tx(ax, ay), [rbx, rby] = tx(bx, by);
    return [rax, ray, rbx, rby];
  });
};
const asymRect: [Point, Point] = [[-31, -5], [16, 28]];

for (const deg of [30, 57, 123, 211]) {
  test(`Phase 2: an off-grid rotation invisible to the rigid search (${deg}°) is found and disclosed`, () => {
    const segs = [...placeAsym([0, 0], 0, false), ...placeAsym([400, 0], deg, false)];
    const fp = fingerprintSymbol(segs, asymRect);
    const rigid = matchSymbol(fp, segs, { excludeCenter: fp.center });
    assert.equal(rigid.matches.length, 0, `${deg}° should be off-grid enough to produce zero rigid candidates`);
    const affine = matchSymbol(fp, segs, { excludeCenter: fp.center, affine: { enabled: true } });
    assert.equal(affine.matches.length, 1, `Phase 2 should propose and match the ${deg}° instance`);
    const m = affine.matches[0];
    assert.ok(m.score >= 0.92);
    assert.ok(m.transform, "a Phase-2-discovered match must disclose its transform");
    assert.ok(Math.abs(m.transform!.rotation_deg - deg) < 3, `disclosed rotation ${m.transform!.rotation_deg} vs true ${deg}`);
    assert.equal(m.transform!.mirrored, false);
    assert.equal(m.transform!.via, "rotation", "§4.1 — a Phase-2-discovered row discloses its OWN basis, not the rigid path's");
  });
}

test("Phase 2: a mirrored + 40° placement is found with mirrored:true", () => {
  const segs = [...placeAsym([0, 0], 0, false), ...placeAsym([400, 0], 40, true)];
  const fp = fingerprintSymbol(segs, asymRect);
  const affine = matchSymbol(fp, segs, { excludeCenter: fp.center, affine: { enabled: true } });
  assert.equal(affine.matches.length, 1);
  assert.equal(affine.matches[0].mirrored, true);
  assert.ok(Math.abs(affine.matches[0].transform!.rotation_deg - 40) < 3);
});

test("Phase 2: a plain translated (0°) copy is still the rigid path's own clean match — no transform, and (the bug this test pins) no stale transform survives a merge tie against a spurious refined candidate", () => {
  const segs = [...placeAsym([0, 0], 0, false), ...placeAsym([400, 0], 0, false)];
  const fp = fingerprintSymbol(segs, asymRect);
  const affine = matchSymbol(fp, segs, { excludeCenter: fp.center, affine: { enabled: true } });
  assert.equal(affine.matches.length, 1);
  assert.equal(affine.matches[0].rotation, 0);
  assert.equal(affine.matches[0].transform, undefined, "the rigid path won this one cleanly; nothing should be disclosed");
  assert.equal(affine.matches[0].extra, undefined);
});

test("Phase 2: opts.rotations === false disables continuous rotation too, exactly as it disables the rigid 90° family today", () => {
  const segs = [...placeAsym([0, 0], 0, false), ...placeAsym([400, 0], 30, false)];
  const fp = fingerprintSymbol(segs, asymRect);
  const affine = matchSymbol(fp, segs, { excludeCenter: fp.center, rotations: false, affine: { enabled: true } });
  assert.equal(affine.matches.length, 0);
  assert.equal(affine.withheld.length, 0, "an explicit rotations:false means silence for an off-grid instance, exactly as it always has");
});

test("Phase 2: candidates.considered on a plain 0°-aligned grid does not blow up (guards the vote against a proposal explosion)", () => {
  const placements = Array.from({ length: 6 }, (_, i) => ({ at: [i * 100, 0] as Point }));
  const segs = place(placements);
  const fp = fingerprintSymbol(segs, RECT);
  const rigid = matchSymbol(fp, segs);
  const affine = matchSymbol(fp, segs, { affine: { enabled: true } });
  assert.ok(affine.candidates.considered < rigid.candidates.considered * 3,
    `affine considered=${affine.candidates.considered} vs rigid considered=${rigid.candidates.considered} — should stay well under 3×`);
  assert.equal(affine.matches.length, rigid.matches.length, "a purely 0°-aligned grid should match identically either way");
});

// ── Phase 3 of docs/SYMBOL-SWEEP-AFFINE-GOAL.md — two-segment-basis affine ──
// Phase 2's single-segment guess fixes a rotation + one implicit UNIFORM
// scale — it can never propose a genuinely anisotropic stretch or shear,
// because one correspondence pair can't distinguish "rotated θ" from
// "rotated θ AND stretched non-uniformly". These fixtures scale ASYM2 up
// (sc=10) so an anisotropic stretch displaces every segment's length well
// past the rigid search's ±2·tol band — the rigid path must see NOTHING,
// exactly like Phase 2's off-grid-rotation tests, so a match here can only
// have come from Phase 3's own candidate generation.
const placeAsymM = (at: Point, sc: number, m: readonly [number, number, number, number]): number[] =>
  ASYM2.flatMap(([ax, ay, bx, by]) => {
    const A: Point = [m[0] * ax * sc + m[1] * ay * sc + at[0], m[2] * ax * sc + m[3] * ay * sc + at[1]];
    const B: Point = [m[0] * bx * sc + m[1] * by * sc + at[0], m[2] * bx * sc + m[3] * by * sc + at[1]];
    return [A[0], A[1], B[0], B[1]];
  });
const asymRectSc: [Point, Point] = [[-310, -50], [160, 280]];
const IDENTITY: [number, number, number, number] = [1, 0, 0, 1];

test("Phase 3: an x-only 1.3× stretch invisible to both the rigid search and Phase 2 is found and disclosed", () => {
  const seed = placeAsymM([0, 0], 10, IDENTITY);
  const stretched = placeAsymM([4000, 0], 10, [1.3, 0, 0, 1]);
  const segs = [...seed, ...stretched];
  const fp = fingerprintSymbol(segs, asymRectSc);
  const rigid = matchSymbol(fp, segs, { excludeCenter: fp.center });
  assert.equal(rigid.matches.length, 0, "an anisotropic stretch this large should produce zero rigid candidates");
  const phase2Only = matchSymbol(fp, segs, { excludeCenter: fp.center, affine: { enabled: true } });
  assert.equal(phase2Only.matches.length, 0, "scaleSearch defaults false — Phase 2 alone (rotation-only) must not find this either");
  const affine = matchSymbol(fp, segs, { excludeCenter: fp.center, affine: { enabled: true, scaleSearch: true } });
  assert.equal(affine.matches.length, 1, "Phase 3 should propose and match the stretched instance");
  const m = affine.matches[0];
  assert.ok(m.score >= 0.92, `score should clear the commit bar, got ${m.score}`);
  assert.ok(m.transform, "a Phase-3-discovered match must disclose its transform");
  assert.ok(Math.abs(m.transform!.scale_x - 1.3) < 0.05, `disclosed scale_x ${m.transform!.scale_x} vs true 1.3`);
  assert.ok(Math.abs(m.transform!.scale_y - 1) < 0.05, `disclosed scale_y ${m.transform!.scale_y} vs true 1.0`);
  assert.equal(m.transform!.mirrored, false);
  assert.equal(m.transform!.via, "affine", "§4.1 — a Phase-3-discovered row discloses its OWN basis, not the rigid or rotation path's");
});

test("Phase 3: a y-only 1.3× stretch is found and disclosed (the other axis, not just x)", () => {
  const seed = placeAsymM([0, 0], 10, IDENTITY);
  const stretched = placeAsymM([4000, 0], 10, [1, 0, 0, 1.3]);
  const segs = [...seed, ...stretched];
  const fp = fingerprintSymbol(segs, asymRectSc);
  const affine = matchSymbol(fp, segs, { excludeCenter: fp.center, affine: { enabled: true, scaleSearch: true } });
  assert.equal(affine.matches.length, 1);
  const m = affine.matches[0];
  assert.ok(Math.abs(m.transform!.scale_x - 1) < 0.05, `disclosed scale_x ${m.transform!.scale_x} vs true 1.0`);
  assert.ok(Math.abs(m.transform!.scale_y - 1.3) < 0.05, `disclosed scale_y ${m.transform!.scale_y} vs true 1.3`);
});

test("Phase 3: a 1.2× x-stretch plus 8° shear is found and disclosed", () => {
  // Constructed directly from decomposeAffine's own forward definition so the
  // expected numbers are exact by construction: x-axis image kept along the
  // seed's own x-axis at length 1.2 (scale_x=1.2), y-axis image at length 1
  // (scale_y=1) turned 82° from it (angleBetween=82° ⇒ shear_deg=90−82=8°).
  const shearM: [number, number, number, number] = [1.2, Math.cos((82 * Math.PI) / 180), 0, Math.sin((82 * Math.PI) / 180)];
  const seed = placeAsymM([0, 0], 10, IDENTITY);
  const sheared = placeAsymM([4000, 0], 10, shearM);
  const segs = [...seed, ...sheared];
  const fp = fingerprintSymbol(segs, asymRectSc);
  const affine = matchSymbol(fp, segs, { excludeCenter: fp.center, affine: { enabled: true, scaleSearch: true } });
  assert.equal(affine.matches.length, 1);
  const m = affine.matches[0];
  assert.ok(Math.abs(m.transform!.scale_x - 1.2) < 0.05, `disclosed scale_x ${m.transform!.scale_x} vs true 1.2`);
  assert.ok(Math.abs(m.transform!.scale_y - 1) < 0.05, `disclosed scale_y ${m.transform!.scale_y} vs true 1.0`);
  assert.ok(Math.abs(m.transform!.shear_deg - 8) < 2, `disclosed shear_deg ${m.transform!.shear_deg} vs true 8`);
});

test("Phase 3: a 1.6× stretch (over the default 1.5× bound) is withheld with the bounds reason, never a match", () => {
  const seed = placeAsymM([0, 0], 10, IDENTITY);
  const stretched = placeAsymM([4000, 0], 10, [1.6, 0, 0, 1]);
  const segs = [...seed, ...stretched];
  const fp = fingerprintSymbol(segs, asymRectSc);
  const affine = matchSymbol(fp, segs, { excludeCenter: fp.center, affine: { enabled: true, scaleSearch: true } });
  assert.equal(affine.matches.length, 0, "a 1.6× stretch (over the default 1.5× bound) must never commit as a match");
  const perfect = affine.withheld.find((w) => w.transform && Math.abs(w.transform.scale_x - 1.6) < 0.05);
  assert.ok(perfect, `expected a withheld row disclosing the true ~1.6× fit, got: ${JSON.stringify(affine.withheld)}`);
  assert.ok(/stretch/.test(perfect!.reason) && /bar 1\.5/.test(perfect!.reason), `bounds reason should name the stretch and the bar, got: ${perfect!.reason}`);
  assert.equal(perfect!.transform!.via, "affine", "§4.1 — the out-of-bounds fit was found via Phase 3's own basis");
});

test("Phase 3: opts.rotations === false disables two-segment-basis search too, exactly as it disables the rigid family and Phase 2", () => {
  const seed = placeAsymM([0, 0], 10, IDENTITY);
  const stretched = placeAsymM([4000, 0], 10, [1.3, 0, 0, 1]);
  const segs = [...seed, ...stretched];
  const fp = fingerprintSymbol(segs, asymRectSc);
  const affine = matchSymbol(fp, segs, { excludeCenter: fp.center, rotations: false, affine: { enabled: true, scaleSearch: true } });
  assert.equal(affine.matches.length, 0);
  assert.equal(affine.withheld.length, 0, "an explicit rotations:false means silence for a stretched instance, exactly as it always has");
});

test("Phase 3: candidates.considered on a plain 0°-aligned grid does not blow up (guards the vote against a proposal explosion)", () => {
  const placements = Array.from({ length: 6 }, (_, i) => ({ at: [i * 100, 0] as Point }));
  const segs = place(placements);
  const fp = fingerprintSymbol(segs, RECT);
  const rigid = matchSymbol(fp, segs);
  const affine = matchSymbol(fp, segs, { affine: { enabled: true, scaleSearch: true } });
  assert.ok(affine.candidates.considered < rigid.candidates.considered * 3,
    `affine considered=${affine.candidates.considered} vs rigid considered=${rigid.candidates.considered} — should stay well under 3×`);
  assert.equal(affine.matches.length, rigid.matches.length, "a purely 0°-aligned grid should match identically either way");
});

// ── Phase 4 of docs/SYMBOL-SWEEP-AFFINE-GOAL.md — "changed" symbols ─────────
// A small, exact-numbers fixture (a bare 10×10 square, totalLen = 40) rather
// than the shared SYMBOL — the 30% extra-linework bar is easy to clear or
// miss by construction when the seed's own total length is a round number.
const TINY_SQUARE: [number, number, number, number][] = [
  [0, 0, 10, 0], [10, 0, 10, 10], [10, 10, 0, 10], [0, 10, 0, 0],
];
const tinySquareAt = (at: Point): number[] =>
  TINY_SQUARE.flatMap(([ax, ay, bx, by]) => [ax + at[0], ay + at[1], bx + at[0], by + at[1]]);
const tinyRect: [Point, Point] = [[-3, -3], [13, 13]];
/** A compact, 3-direction cluster of 15 short segments — well past
 * MIN_GLYPH_CLUSTER (6), each well under 4·tol (8), spanning a bbox small
 * relative to the window it sits in: a synthetic stand-in for an exploded-
 * text tag (a PDF exporter's per-glyph-stroke output), not any real letter
 * shapes — the detector only ever reasons about count/length/bbox/direction
 * diversity, never what a cluster "looks like". Placed just outside the
 * square's own top-right corner (base + [10.3..10.7, 10.5]), comfortably
 * inside both the seed rect and matchSymbol's own local extra-ink window. */
const glyphTagAt = (base: Point): [number, number, number, number][] => {
  const out: [number, number, number, number][] = [];
  for (let k = 0; k < 5; k++) {
    const x0 = base[0] + 10.3 + k * 0.1, y0 = base[1] + 10.5;
    // deliberately OFF the square's own 0°/90° edge directions (by >15°,
    // comfortably past the extra-ink direction gate's ~6° tolerance) — a
    // stroke aligned with and near a real edge's corner reads as that edge
    // merely continuing, "covered" rather than new ink, regardless of this
    // detector; that is the real, existing scoring behavior working as
    // designed, not something to route around.
    for (const deg of [20, 75, 135]) {
      const th = (deg * Math.PI) / 180;
      out.push([x0, y0, x0 + Math.cos(th) * 1.0, y0 + Math.sin(th) * 1.0]);
    }
  }
  return out;
};

test("Phase 4: a near-miss names which seed segment is missing, by length — already covered above (see 'a perturbed near-miss' test); this pins the aggregate percentage on a second, independent fixture", () => {
  // one whole side of TINY_SQUARE (len 10) simply not drawn, so the
  // instance reproduces only 30/40 = 75% — exactly the withheld band's floor.
  const broken = TINY_SQUARE.filter((_, i) => i !== 2);
  const segs = [...tinySquareAt([0, 0]), ...broken.flatMap(([ax, ay, bx, by]) => [ax + 50, ay, bx + 50, by])];
  const fp = fingerprintSymbol(tinySquareAt([0, 0]), tinyRect);
  const r = matchSymbol(fp, segs, { excludeCenter: fp.center });
  assert.equal(r.matches.length, 0, "75% is below the commit bar — a near-miss, not a match");
  assert.equal(r.withheld.length, 1);
  const w = r.withheld[0];
  assert.match(w.reason, /commit bar/);
  assert.match(w.reason, /missing the 10 px horizontal/, `reason should name the broken side by length and orientation: ${w.reason}`);
  assert.match(w.reason, /\(25% of linework\)/, `reason should quantify the missing share: ${w.reason}`);
});

test("Phase 4: an exploded tag inside the seed rect is excluded from the fingerprint's rel/totalLen when dropGlyphClusters is set", () => {
  const bareSegs = tinySquareAt([0, 0]);
  const bareFp = fingerprintSymbol(bareSegs, tinyRect);

  const tag = glyphTagAt([0, 0]);
  const taggedSegs = [...bareSegs, ...tag.flatMap((s) => s)];
  const unfiltered = fingerprintSymbol(taggedSegs, tinyRect);
  assert.ok(unfiltered.totalLen > bareFp.totalLen, "sanity: the tag really adds linework when not filtered");

  const filtered = fingerprintSymbol(taggedSegs, tinyRect, undefined, { dropGlyphClusters: true });
  assert.equal(filtered.droppedGlyphSegments, 15, "the 15-stroke exploded tag should be recognized and dropped");
  assert.deepEqual(filtered.rel, bareFp.rel, "with the tag dropped, the fingerprint is byte-for-byte the untagged one");
  assert.equal(filtered.totalLen, bareFp.totalLen);
  assert.equal(filtered.center[0], bareFp.center[0]);
  assert.equal(filtered.center[1], bareFp.center[1]);
});

test("Phase 4: a tag drawn next to a SWEPT instance (not the seed) never counts toward extra linework once dropGlyphClusters:true is passed explicitly", () => {
  const fp = fingerprintSymbol(tinySquareAt([0, 0]), tinyRect);
  const segs = [...tinySquareAt([0, 0]), ...tinySquareAt([50, 0]), ...glyphTagAt([50, 0]).flatMap((s) => s)];
  const near = (at: Point, x: number, y: number): boolean => Math.abs(at[0] - x) < 3 && Math.abs(at[1] - y) < 3;

  const withoutFilter = matchSymbol(fp, segs, { excludeCenter: fp.center, variantGuard: true });
  const taggedRow = withoutFilter.withheld.find((w) => near(w.at, 55, 5)) ?? withoutFilter.matches.find((m) => near(m.at, 55, 5));
  assert.ok(taggedRow, `expected some row near the tagged instance, got matches=${JSON.stringify(withoutFilter.matches)} withheld=${JSON.stringify(withoutFilter.withheld)}`);
  assert.ok(taggedRow!.extra !== undefined && taggedRow!.extra > 0.3,
    `expected the tag to read as substantial extra ink past the 30% bar, got ${JSON.stringify(taggedRow)}`);

  // dropGlyphClusters no longer follows affine.enabled (see docs/SYMBOL-SWEEP-AFFINE-GOAL.md's
  // Findings, 2026-09-11) — it must be requested explicitly to see the filtered behavior.
  const withFilter = matchSymbol(fp, segs, { excludeCenter: fp.center, variantGuard: true, affine: { enabled: true }, dropGlyphClusters: true });
  const cleanMatch = withFilter.matches.find((m) => near(m.at, 55, 5));
  assert.ok(cleanMatch, `expected a clean match near the tagged instance once the tag is filtered, got matches=${JSON.stringify(withFilter.matches)} withheld=${JSON.stringify(withFilter.withheld)}`);
  assert.equal(cleanMatch!.extra, undefined, "no extra should be disclosed once the exploded tag is excluded");
});

test("Phase 4: dropGlyphClusters defaults to off even with affine.enabled — a caller gets the unfiltered tag cost unless they opt in", () => {
  const fp = fingerprintSymbol(tinySquareAt([0, 0]), tinyRect);
  const segs = [...tinySquareAt([0, 0]), ...tinySquareAt([50, 0]), ...glyphTagAt([50, 0]).flatMap((s) => s)];
  const near = (at: Point, x: number, y: number): boolean => Math.abs(at[0] - x) < 3 && Math.abs(at[1] - y) < 3;
  // See docs/SYMBOL-SWEEP-AFFINE-GOAL.md's Findings (2026-09-11): a controlled
  // corpus run measured this heuristic as the larger of two confirmed causes
  // behind a real corpus regression, so it no longer turns on just because
  // affine.enabled is true — a caller must opt in with dropGlyphClusters:true.
  const withAffineOnly = matchSymbol(fp, segs, { excludeCenter: fp.center, variantGuard: true, affine: { enabled: true } });
  const taggedRow = withAffineOnly.withheld.find((w) => near(w.at, 55, 5)) ?? withAffineOnly.matches.find((m) => near(m.at, 55, 5));
  assert.ok(taggedRow, "the tag should still cost the instance with affine.enabled alone, since dropGlyphClusters is off by default");
  assert.ok(taggedRow!.extra !== undefined && taggedRow!.extra > 0.3);
});

// docs/SYMBOL-SWEEP-CLEAN-CORPUS-GOAL.md Phase E — the PDF's own text layer
// is an authoritative fact, not a geometric guess: a segment whose both
// endpoints fall inside a stated text box is excluded independent of
// dropGlyphClusters entirely. A box generously covering glyphTagAt's own
// footprint (base+[10.3..10.7, 10.5], strokes up to 1px long) with real
// margin, not a hairline fit.
const glyphTagBox = (base: Point): [number, number, number, number] =>
  [base[0] + 9, base[1] + 9, base[0] + 12, base[1] + 12];

// textBoxMask also refuses a box whose OWN dilated footprint spans too much
// of the symbol it's judged against (root-caused on real corpus data: case
// 42's thermostat bubble — see textBoxMask's own doc comment) — the SAME
// `longSide >= 0.25 * refDiag` fraction glyphClusterMask already uses. The
// bare `TINY_SQUARE` (10×10) is too small a stage for that guard: dilating
// even glyphTagBox's already-tight 3×3 box by `2·tol=4` on every side (11×11)
// already exceeds 25% of a ~16-unit window on its own, independent of
// anything about the tag itself. A 100×100 square keeps the SAME tag
// geometry (and so the SAME cluster/direction/length shape `glyphClusterMask`
// exercises) proportionally small against a size closer to a real corpus
// symbol, so these two tests use it instead of `TINY_SQUARE`.
const BIG_SQUARE: [number, number, number, number][] = [
  [0, 0, 100, 0], [100, 0, 100, 100], [100, 100, 0, 100], [0, 100, 0, 0],
];
const bigSquareAt = (at: Point): number[] =>
  BIG_SQUARE.flatMap(([ax, ay, bx, by]) => [ax + at[0], ay + at[1], bx + at[0], by + at[1]]);
const bigRect: [Point, Point] = [[-3, -3], [113, 113]];

test("Phase E: an exploded tag inside the seed rect is excluded from the fingerprint via textBoxes, with dropGlyphClusters left OFF", () => {
  const bareSegs = bigSquareAt([0, 0]);
  const bareFp = fingerprintSymbol(bareSegs, bigRect);

  // base [90, 90] + glyphTagAt's own +[10.3..10.7, 10.5] offset lands the
  // tag just past BIG_SQUARE's own top-right corner (100, 100) — the same
  // "just outside the corner" placement `glyphTagAt`'s own doc comment
  // describes, scaled to this bigger symbol.
  const tag = glyphTagAt([90, 90]);
  const taggedSegs = [...bareSegs, ...tag.flatMap((s) => s)];
  const filtered = fingerprintSymbol(taggedSegs, bigRect, undefined, { textBoxes: [glyphTagBox([90, 90])] });
  assert.equal(filtered.droppedGlyphSegments, 15, "the 15-stroke exploded tag should be recognized and dropped via the text box alone");
  assert.deepEqual(filtered.rel, bareFp.rel, "with the tag dropped, the fingerprint is byte-for-byte the untagged one");
  assert.equal(filtered.totalLen, bareFp.totalLen);
});

test("Phase E: a tag near a SWEPT instance never counts toward extra linework once textBoxes covers it, WITHOUT dropGlyphClusters", () => {
  const fp = fingerprintSymbol(bigSquareAt([0, 0]), bigRect);
  // Second instance well clear of the seed (150 units, past BIG_SQUARE's own
  // 100-unit width); its tag sits just past ITS OWN top-right corner (250, 100).
  const segs = [...bigSquareAt([0, 0]), ...bigSquareAt([150, 0]), ...glyphTagAt([240, 90]).flatMap((s) => s)];
  const near = (at: Point, x: number, y: number): boolean => Math.abs(at[0] - x) < 3 && Math.abs(at[1] - y) < 3;

  // No dropGlyphClusters anywhere in this call — proves textBoxes is its
  // own, independently-gated mechanism, not a variant of the geometric one.
  const withTextBox = matchSymbol(fp, segs, { excludeCenter: fp.center, variantGuard: true, textBoxes: [glyphTagBox([240, 90])] });
  const cleanMatch = withTextBox.matches.find((m) => near(m.at, 200, 50));
  assert.ok(cleanMatch, `expected a clean match near the tagged instance once the text box excludes the tag, got matches=${JSON.stringify(withTextBox.matches)} withheld=${JSON.stringify(withTextBox.withheld)}`);
  assert.equal(cleanMatch!.extra, undefined, "no extra should be disclosed once the text-boxed tag is excluded");
});

test("Phase E: a text box that does not cover the tag changes nothing — the exclusion is genuinely position-gated, not a blanket pass", () => {
  const fp = fingerprintSymbol(tinySquareAt([0, 0]), tinyRect);
  const segs = [...tinySquareAt([0, 0]), ...tinySquareAt([50, 0]), ...glyphTagAt([50, 0]).flatMap((s) => s)];
  const near = (at: Point, x: number, y: number): boolean => Math.abs(at[0] - x) < 3 && Math.abs(at[1] - y) < 3;
  // A text box far away from the actual tag — must not accidentally exclude it.
  const missedBox: [number, number, number, number] = [900, 900, 910, 910];
  const r = matchSymbol(fp, segs, { excludeCenter: fp.center, variantGuard: true, textBoxes: [missedBox] });
  const taggedRow = r.withheld.find((w) => near(w.at, 55, 5)) ?? r.matches.find((m) => near(m.at, 55, 5));
  assert.ok(taggedRow, `expected some row near the still-tagged instance, got matches=${JSON.stringify(r.matches)} withheld=${JSON.stringify(r.withheld)}`);
  assert.ok(taggedRow!.extra !== undefined && taggedRow!.extra > 0.3, "a text box that misses the tag entirely must not suppress its real extra-ink cost");
});

// Regression test for the real corpus failure that motivated textBoxMask's
// own `longSide >= 0.25 * refDiag` guard (cases 42 and 45 — see
// textBoxMask's doc comment): a small symbol whose own body is drawn as
// several SHORT segments (a circle/diamond's polyline chords), with a tag
// lettered literally inside it. Every one of the diamond's own 4 edges is
// individually short enough to pass the length cap alone (shortMax = 4·tol
// = 8, edges here are ~7.07), so — unlike the earlier "exploded tag beside
// the symbol" tests above — the length cap by itself does NOT protect this
// case; only the box's own size, relative to the whole symbol, does.
test("Phase E: a text box spanning most of a small symbol's own body is never trusted for exclusion, even when every one of its own edges is individually short", () => {
  // A small diamond: four ~7.07-unit edges around a 10×10 bbox (diag ≈14.14).
  const diamondSegs = [5, 10, 10, 5, 10, 5, 5, 0, 5, 0, 0, 5, 0, 5, 5, 10];
  const diamondRect: [Point, Point] = [[-2, -2], [12, 12]];
  const bare = fingerprintSymbol(diamondSegs, diamondRect);
  assert.equal(bare.rel.length, 4, "sanity: the bare diamond is exactly its 4 edges");

  // A label box covering most of the diamond's own interior — exactly the
  // "T centered in a small thermostat bubble" / "AI inside a small diamond"
  // shape real corpus data showed, not a small label off to one side.
  const bigBox: [number, number, number, number] = [2, 2, 8, 8];
  const filtered = fingerprintSymbol(diamondSegs, diamondRect, undefined, { textBoxes: [bigBox] });
  // `droppedGlyphSegments` is only present on the fingerprint when nonzero
  // (see its own field, only spread in when truthy) — absent here means zero.
  assert.equal(filtered.droppedGlyphSegments, undefined,
    "a text box spanning most of the symbol's own body must never be trusted for exclusion, no matter how short its individual edges are");
  assert.deepEqual(filtered.rel, bare.rel, "the diamond's own 4 structural edges must survive intact");
});
