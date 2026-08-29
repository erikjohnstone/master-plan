// Symbol Sweep engine — synthetic-segment contracts: exact counts on a grid of
// identical clusters, rotation/mirror behind their options, the withheld band,
// tolerance behavior, decoy rejection, determinism, and the reported work cap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sweepSymbols, fingerprintSymbol, matchSymbol, scaleFingerprint, fragmentedTagOcc, deepHyphenChainTagOcc, compoundTagOcc, type Point, type FlatSpan } from "../src/lib/symbolsweep.ts";

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
