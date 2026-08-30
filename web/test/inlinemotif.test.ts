// inlinemotif.ts — fingerprintInlineMotif/sweepInlineMotif (accuracy-
// hardening plan Phase 4). A register/grille mark embedded within a duct
// run has no independent whole-shape perimeter of its own, and real
// siblings of the SAME symbol type are drawn at genuinely different
// physical sizes (a bigger CFM rating is a visibly bigger hatched box) —
// measured live against the real Bessemer sample, not assumed: symbol_sweep's
// own whole-shape matchSymbol scores two real siblings at only ~76-77%,
// under the 92% commit bar. This module matches on the hatch fill's own
// real-world size and pitch instead of exact segment count.
//
// Every synthetic hatch box below is built the same way `clusterByProximity`
// itself is measured against: N short horizontal dashes stacked at a tight
// pitch — the real register's own "comb of parallel dashes" shape,
// simplified to one dash per row (hatchFamilies groups by each stroke's own
// angle/length, not how many columns compose one visual row).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprintInlineMotif, sweepInlineMotif, classifyInlineMotifMatches, corroborateInlineMotif } from "../src/lib/inlinemotif.ts";
import type { TagOcc } from "../src/lib/symbolsweep.ts";

const seg = (ax: number, ay: number, bx: number, by: number) => [ax, ay, bx, by];

/** A compact hatched box: `rows` short horizontal dashes stacked evenly
 * across height `h`, spanning width `w`, real-junction-free by design (no
 * two dashes ever touch — the real shape this module was built for). */
function hatchBox(x0: number, y0: number, w: number, h: number, rows: number): number[] {
  const out: number[] = [];
  const pitch = h / rows;
  for (let i = 0; i < rows; i++) {
    const y = y0 + i * pitch + pitch / 2;
    out.push(...seg(x0, y, x0 + w, y));
  }
  return out;
}
function metaFor(segs: number[]): Uint8Array {
  return new Uint8Array(segs.length >> 2); // all zero — plain, visible, stroked ink
}

// SEED: 60x80px box, 44 rows (well above MIN_FILL_MEMBERS=40)
const SEED = hatchBox(100, 100, 60, 80, 44);
// SIBLING: the same motif at 70% linear scale, elsewhere on the sheet
const SIBLING = hatchBox(400, 100, 42, 56, 44);
// NOISE: 8 dashes only — same signature, never real fill
const NOISE = hatchBox(700, 100, 60, 16, 8);
// DECOY: a big same-signature hatch region, genuinely different real-world
// size (a floor/wall texture region, not a register)
const DECOY = hatchBox(100, 400, 400, 600, 300);

const ALL = [...SEED, ...SIBLING, ...NOISE, ...DECOY];
const ALL_META = metaFor(ALL);

test("fingerprintInlineMotif: finds the dominant hatch cluster inside a tight seed rect, not the family's own sheet-wide bbox", () => {
  const fp = fingerprintInlineMotif(ALL, ALL_META, [[95, 95], [165, 185]], null);
  assert.ok(fp);
  assert.equal(fp!.members, 44);
  // tight around the SEED's own fill, not smeared across the whole sheet
  assert.ok(fp!.widthPx < 65 && fp!.heightPx < 85, `seed bbox: ${fp!.widthPx}x${fp!.heightPx}`);
});

test("fingerprintInlineMotif: null when the seed rect has no hatch fill inside it", () => {
  const fp = fingerprintInlineMotif(ALL, ALL_META, [[0, 0], [50, 50]], null);
  assert.equal(fp, null);
});

test("fingerprintInlineMotif: a sparse dash cluster is not a register fill — same floor as sweep", () => {
  // NOISE is 8 dashes: above the old 4-stroke "any ink" floor, below
  // MIN_FILL_MEMBERS (40). Fingerprinting it used to return a seed that
  // can never self-match (sweep drops <40) but can corroborate against
  // an unrelated dense box of similar size and steal the whole-shape path.
  const fp = fingerprintInlineMotif(ALL, ALL_META, [[695, 95], [765, 125]], null);
  assert.equal(fp, null);
});

test("corroborateInlineMotif: a sparse seed next to the tag does not corroborate via a distant dense box", () => {
  // Two "P-2" tags: the anchor sits on 8 hatch ticks (furniture, not
  // fill); the other occurrence sits on a real 44-row box of similar
  // bbox. The old 4-stroke floor let the ticks become the seed, and
  // size-tolerance then "corroborated" at the dense box — a false
  // same-tag hatch match that blocked a real whole-shape fallback.
  const ticks = hatchBox(100, 100, 40, 16, 8);
  const dense = hatchBox(400, 100, 42, 18, 44);
  const segs = [...ticks, ...dense];
  const meta = metaFor(segs);
  const anchor: TagOcc = { cx: 120, cy: 108, h: 10, bbox: [100, 100, 140, 116] };
  const corroOcc: TagOcc[] = [{ cx: 421, cy: 109, h: 10, bbox: [400, 100, 442, 118] }];
  const r = corroborateInlineMotif(segs, meta, { w: 800, h: 400 }, anchor, null, {
    segs, meta, occ: corroOcc, upp: null,
  });
  assert.equal(r, null, "sparse ticks must not become a corroborated hatch seed");
});

test("sweepInlineMotif: finds the real sibling at a different physical size, excludes the noise scrap and the same-signature decoy by size", () => {
  const fp = fingerprintInlineMotif(ALL, ALL_META, [[95, 95], [165, 185]], null)!;
  const r = sweepInlineMotif(fp, ALL, ALL_META, null, { excludeCenter: fp.center, excludeR: Math.max(fp.widthPx, fp.heightPx) });
  assert.equal(r.matches.length, 1, "exactly the sibling");
  assert.equal(r.withheld.length, 0);
  const m = r.matches[0];
  // sibling's own real 70%-scale bbox
  assert.ok(Math.abs(m.w_px - 42) < 3 && Math.abs(m.h_px - 56) < 3, `sibling px size: ${m.w_px}x${m.h_px}`);
  assert.ok(m.size_score > 0.5 && m.size_score <= 1);
});

test("sweepInlineMotif: real-world (ft) comparison, when a scale is known, is orientation-free — a 90-degree-rotated sibling still matches", () => {
  // sibling drawn ROTATED 90deg relative to seed: same real long/short
  // dimensions, but width/height swapped on the page.
  const seed = hatchBox(100, 100, 60, 80, 44);
  // a 90-rotated box of the identical real size: width/height swap, hatch
  // strokes now vertical (angle 90) instead of horizontal (angle 0)
  const rotatedSibling: number[] = [];
  {
    const rows = 44, w = 80, h = 60, x0 = 400, y0 = 100;
    const pitch = w / rows;
    for (let i = 0; i < rows; i++) {
      const x = x0 + i * pitch + pitch / 2;
      rotatedSibling.push(x, y0, x, y0 + h);
    }
  }
  const segs = [...seed, ...rotatedSibling];
  const meta = metaFor(segs);
  const upp = 1 / 40; // ft per px
  const fp = fingerprintInlineMotif(segs, meta, [[95, 95], [165, 185]], upp)!;
  assert.ok(fp);
  const r = sweepInlineMotif(fp, segs, meta, upp, { excludeCenter: fp.center, excludeR: 100 });
  assert.equal(r.matches.length, 1, "the 90-rotated, identically-sized sibling still matches");
  assert.ok(r.matches[0].size_score > 0.9, `near-identical real size: ${r.matches[0].size_score}`);
});

test("classifyInlineMotifMatches: a match carrying the row's own tag counts; a sibling's tag excludes; no tag withholds as a question", () => {
  const fp = fingerprintInlineMotif(ALL, ALL_META, [[95, 95], [165, 185]], null)!;
  const res = sweepInlineMotif(fp, ALL, ALL_META, null, { excludeCenter: fp.center, excludeR: Math.max(fp.widthPx, fp.heightPx) });
  const siblingAt = res.matches[0].at;
  const occ: TagOcc[] = [{ cx: siblingAt[0] + 5, cy: siblingAt[1] + 5, h: 10, bbox: [siblingAt[0], siblingAt[1], siblingAt[0] + 10, siblingAt[1] + 10] }];
  const cls = classifyInlineMotifMatches("SR-1", res, occ, [], 10);
  assert.equal(cls.matches.length, 1);
  assert.deepEqual(cls.matches[0].tag_at, occ[0].bbox);
  assert.equal(cls.text_only.length, 0);

  // a SIBLING row's tag sitting on the same match excludes it, named
  const clsExcluded = classifyInlineMotifMatches("SR-1", res, [], [{ key: "SR-2", cx: siblingAt[0], cy: siblingAt[1] }], 10);
  assert.equal(clsExcluded.matches.length, 0);
  assert.equal(clsExcluded.excluded.length, 1);
  assert.equal(clsExcluded.excluded[0].tag, "SR-2");

  // no tag anywhere near it — withheld as a question, never silently counted
  const clsWithheld = classifyInlineMotifMatches("SR-1", res, [], [], 10);
  assert.equal(clsWithheld.matches.length, 0);
  assert.equal(clsWithheld.withheld.length, 1);
});
