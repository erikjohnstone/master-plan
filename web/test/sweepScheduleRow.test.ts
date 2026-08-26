// sweep_schedule_row's shared engine (maturity plan Phase 3, #HVAC-crossscale):
// sweepRatio, corroborateFingerprint, classifySweepMatches — extracted from
// the MCP server's session.ts (mcp/src/session.ts, sweepScheduleRow) into
// symbolsweep.ts so the browser Agent and the MCP server call the identical
// pure engine instead of two implementations that can silently drift, same
// doctrine as fingerprintSymbol/matchSymbol themselves. Real gap this closes:
// the browser's own pre-Phase-3 port explicitly skipped corroboration and
// cross-scale matching entirely (documented in its own code comment).
//
// Same synthetic-symbol convention as symbolsweep.test.ts (asymmetric under
// every rotation/mirror, so a wrong transform is never accidentally right).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprintSymbol, sweepRatio, corroborateFingerprint, classifySweepMatches, type Point } from "../src/lib/symbolsweep.ts";

const SYMBOL: [number, number, number, number][] = [
  [0, 0, 20, 0], [20, 0, 20, 20], [20, 20, 0, 20], [0, 20, 0, 0],  // square
  [0, 0, 20, 20],                                                   // diagonal
  [20, 10, 34, 10],                                                 // stub, +x
];
function place(sets: { at: Point; rot?: number; mir?: boolean; sc?: number; segs?: [number, number, number, number][] }[]): number[] {
  const out: number[] = [];
  for (const s of sets) {
    const th = ((s.rot ?? 0) * Math.PI) / 180;
    const c = Math.cos(th), sn = Math.sin(th);
    const k = s.sc ?? 1;
    const tx = (x0: number, y0: number): Point => {
      const x = x0 * k, y = y0 * k;
      const mx = s.mir ? -x : x;
      return [mx * c - y * sn + s.at[0], mx * sn + y * c + s.at[1]];
    };
    for (const [ax, ay, bx, by] of s.segs ?? SYMBOL) {
      const a = tx(ax, ay), b = tx(bx, by);
      out.push(a[0], a[1], b[0], b[1]);
    }
  }
  return out;
}
// A tag's own text bbox, sitting just left of its marker at `at` — the same
// real-world layout sweep_schedule_row assumes (bbox padding grows from the
// tag's own height, not the marker's). h is deliberately generous (the real
// SYMBOL fixture spans 34×20 local units) so pad 1× alone comfortably
// encloses the whole marker — these tests are about corroboration/
// classification logic, not re-testing the pad ladder's own widening
// behavior (that's covered directly, see the "bare underline" test below).
const tagNear = (at: Point, h = 40): { cx: number; cy: number; h: number; bbox: [number, number, number, number] } => ({
  cx: at[0] - 5, cy: at[1] + h / 2, h, bbox: [at[0] - 10, at[1], at[0], at[1] + h],
});

// ── sweepRatio ───────────────────────────────────────────────────────────
test("sweepRatio: same object short-circuits to {scale:1, known:true} without touching upp", () => {
  const seed = { upp: null };
  assert.deepEqual(sweepRatio(seed, seed), { scale: 1, known: true });
});
test("sweepRatio: both scales known — the real ratio, upp_seed / upp_target", () => {
  assert.deepEqual(sweepRatio({ upp: 0.5 }, { upp: 0.25 }), { scale: 2, known: true });
  assert.deepEqual(sweepRatio({ upp: 0.25 }, { upp: 0.5 }), { scale: 0.5, known: true });
});
test("sweepRatio: either sheet missing a scale — 1:1 assumed, but disclosed as NOT known", () => {
  assert.deepEqual(sweepRatio({ upp: null }, { upp: 0.5 }), { scale: 1, known: false });
  assert.deepEqual(sweepRatio({ upp: 0.5 }, { upp: null }), { scale: 1, known: false });
  assert.deepEqual(sweepRatio({ upp: null }, { upp: null }), { scale: 1, known: false });
  assert.deepEqual(sweepRatio({ upp: undefined }, { upp: 0.5 }), { scale: 1, known: false });
});

// ── corroborateFingerprint ───────────────────────────────────────────────
test("corroborateFingerprint: no corroborator (tag drawn once) — first real-marker pad accepted, uncorroborated", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const r = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null);
  assert.ok(r);
  assert.equal(r!.corroborated, false);
  assert.equal(r!.fp.segments, 6, "the whole marker, not just the underline");
});

test("corroborateFingerprint: same-scale corroborator — accepts once the fingerprint recurs there", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const corroSegs = place([{ at: [500, 500] }]); // a second, same-shape instance on the corroborating sheet
  const corroOcc = [tagNear([500, 500])];
  const r = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, { segs: corroSegs, occ: corroOcc, ratio: { scale: 1, known: true } });
  assert.ok(r);
  assert.equal(r!.corroborated, true);
});

test("corroborateFingerprint: CROSS-SCALE corroborator — a plan-scale anchor corroborates against a 12x detail sheet", () => {
  // the real HVAC scenario Phase 3 exists for: two plan sheets (or a plan +
  // detail) drawn at genuinely different scales, ratio read from their own
  // committed upp — never searched.
  const anchorSegs = place([{ at: [100, 100] }]); // plan-scale anchor
  const anchor = tagNear([100, 100]);
  const corroSegs = place([{ at: [2000, 1500], sc: 12 }]); // the SAME mark drawn 12x larger on a detail sheet
  const corroOcc = [tagNear([2000, 1500], 120)]; // the tag's own text is 12x larger there too
  const ratio = sweepRatio({ upp: 1 }, { upp: 1 / 12 }); // anchor upp=1, corroborator upp=1/12 → scale 12
  assert.equal(ratio.scale, 12);
  const r = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, { segs: corroSegs, occ: corroOcc, ratio });
  assert.ok(r, "corroborates across the scale boundary using the STATED ratio, not a search");
  assert.equal(r!.corroborated, true);
});

test("corroborateFingerprint: refuses (null) when nothing ever recurs at the corroborator", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  // corroborator sheet has SOME geometry, but not a matching instance anywhere
  const corroSegs = place([{ at: [900, 900], segs: [[0, 0, 5, 0]] }]); // an unrelated stray line
  const corroOcc = [tagNear([900, 900])];
  const r = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, { segs: corroSegs, occ: corroOcc, ratio: { scale: 1, known: true } });
  assert.equal(r, null, "no repeatable marker geometry — refused, never a guessed fingerprint");
});

test("corroborateFingerprint: a bare underline/leader (< 3 segments) at pad 1 is degenerate — widens instead of accepting it", () => {
  // pad 1 around the tag catches only a short 2-segment scrap; pad 2 reaches the real marker
  const anchorSegs = [
    ...place([{ at: [100, 100], segs: [[-5, 20, 25, 20]] }]), // a lone underline right under the tag (1 segment)
    ...place([{ at: [100, 100] }]),                            // the real marker, further out
  ];
  const anchor = tagNear([100, 100]);
  const r = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null);
  assert.ok(r);
  assert.ok(r!.fp.segments >= 3, "never fingerprints the degenerate underline alone");
});

// ── classifySweepMatches ─────────────────────────────────────────────────
test("classifySweepMatches: a confident match carrying its OWN tag counts", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const sheetSegs = place([{ at: [100, 100] }, { at: [400, 400] }]);
  const occ = [tagNear([100, 100]), tagNear([400, 400])];
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, { excludeCenter: cf.fp.center });
  assert.equal(r.matches.length, 1, "the seed itself is excluded via excludeCenter, the other instance counts");
  assert.deepEqual(r.matches[0].tag_at, occ[1].bbox);
});

test("classifySweepMatches: a confident match carrying a SIBLING's tag is excluded, named", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const sheetSegs = place([{ at: [100, 100] }, { at: [400, 400] }]);
  const occ = [tagNear([100, 100])]; // ONLY T1's own tag is here — the second instance is unlabeled by T1
  const siblingOcc = [{ key: "T2", cx: 400 - 15, cy: 400 + 10 }]; // but IS labeled T2
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, siblingOcc, anchor.h, { excludeCenter: cf.fp.center });
  assert.equal(r.matches.length, 0);
  assert.equal(r.excluded.length, 1);
  assert.equal(r.excluded[0].tag, "T2");
});

test("classifySweepMatches: a confident match with no tag at all is withheld as a question, reason names the row", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const sheetSegs = place([{ at: [100, 100] }, { at: [400, 400] }]);
  const occ = [tagNear([100, 100])]; // the second instance has no tag drawn near it, from ANY row
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, { excludeCenter: cf.fp.center });
  assert.equal(r.matches.length, 0);
  assert.equal(r.withheld.length, 1);
  assert.match(r.withheld[0].reason, /carries no "T1" tag/);
});

test("classifySweepMatches: a drawn tag occurrence with no matching geometry nearby is text_only, never counted", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const sheetSegs = place([{ at: [100, 100] }]); // only the seed's own instance — nothing at [700,700]
  const occ = [tagNear([100, 100]), tagNear([700, 700])]; // but T1 is drawn (bare text) at [700,700] too
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, { excludeCenter: cf.fp.center });
  assert.equal(r.matches.length, 0, "the seed is excluded via excludeCenter — nothing else to count");
  assert.equal(r.text_only.length, 1);
  const t = tagNear([700, 700]);
  assert.deepEqual(r.text_only[0].at, [Math.round(t.cx * 10) / 10, Math.round(t.cy * 10) / 10]);
});

test("classifySweepMatches: cross-scale sweep — the fingerprint is resized per-sheet, and it says so", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  // this sheet draws the SAME mark 12x larger
  const sheetSegs = place([{ at: [2000, 1500], sc: 12 }]);
  const occ = [tagNear([2000, 1500], 120)];
  const ratio = sweepRatio({ upp: 1 }, { upp: 1 / 12 });
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, ratio, occ, [], anchor.h, {});
  assert.equal(r.matches.length, 1, "found only because the ratio resized the seed before matching");
  assert.ok(r.scaled, "a non-1 ratio discloses what it cost (#186)");
  assert.equal(r.scaled!.ratio, 12);
});
