// legendlearn.ts — findLegendGlyphs (accuracy-hardening plan Phase 1,
// pivoted after an explicit ask: "are we learning symbols as we go, or
// scanning the legend once?"). There is no single national HVAC symbol
// standard — every firm keeps its own house legend — so a bigger FIXED
// reference-shape library (hvacRefShapes.ts) never scales to every firm's
// own conventions. This module does the new work only: cluster a legend
// sheet's own real vector segments into compact glyphs, real-junction-aware
// (T-junctions, mid-edge touches — via buildMepGraph's own JTS noding, not
// naive endpoint matching), and pair each with its own real caption text.
// It never sweeps anything itself — the caller feeds each result straight
// into symbol_sweep's own seed_rect (scope: "set"), reusing that
// already-tested engine untouched.
//
// Every case below is grounded in a REAL bug found live against the real
// Eglin AFB legend (federal-attachment4-mechanical.pdf#17, this project's
// own federal-mech corpus set — not committed here, corpus PDFs never
// enter the repo) during this exact work, not invented for tidiness:
// naive endpoint-only clustering silently split a real glyph into 2-3
// disconnected fragments (its own stem lands on the MIDDLE of its own
// actuator box's bottom edge — a T-junction — and its "bowtie" body is two
// full corner-to-corner diagonals crossing at the shape's visual center,
// nowhere a segment's own endpoint sits); a real caption is routinely drawn
// as several separate text runs on one line ("2" + "-" + "WAY ELECTRIC
// CONTROL VALVE"); a real caption WRAPS across two physical lines; and a
// long column-divider rule line must never be read as a glyph.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findLegendGlyphs, findGlyphNear, type LegendSpan } from "../src/lib/legendlearn.ts";
import { fingerprintSymbol, matchSymbol } from "../src/lib/symbolsweep.ts";

const seg = (ax: number, ay: number, bx: number, by: number) => [ax, ay, bx, by];
const flat = (segs: number[][]): number[] => segs.flat();

// The same real, measured "control valve" body shape as hvacRefShapes.ts —
// an actuator box (T-junction: the stem's own endpoint lands on the MIDDLE
// of the box's bottom edge, not a corner) + a diamond drawn as two
// verticals and two FULL crossing diagonals (mid-segment crossing, no
// endpoint at the visual center) — at a small, arbitrary test scale.
function controlValveGlyph(px: number, py: number): number[][] {
  const BOX = 24;
  const stemLen = 30;
  const half = 15;
  const cx = px + BOX / 2, cy = py + BOX + stemLen;
  return [
    seg(px, py, px + BOX, py), seg(px + BOX, py, px + BOX, py + BOX),
    seg(px + BOX, py + BOX, px, py + BOX), seg(px, py + BOX, px, py),
    seg(px + BOX / 2, py + BOX, cx, cy),
    seg(cx - half, cy - 10, cx - half, cy + 10),
    seg(cx - half, cy - 10, cx + half, cy + 10),
    seg(cx + half, cy + 10, cx + half, cy - 10),
    seg(cx + half, cy - 10, cx - half, cy + 10),
  ];
}

test("findLegendGlyphs: a real T-junction glyph (stem lands mid-edge, diamond has no endpoint at its own center) clusters as ONE glyph, not 2-3 disconnected fragments", () => {
  const segs = flat(controlValveGlyph(100, 100));
  const spans: LegendSpan[] = [{ text: "2-WAY ELECTRIC CONTROL VALVE", x0: 200, y0: 150, x1: 400, y1: 170 }];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "2-WAY ELECTRIC CONTROL VALVE");
  // the rect must span the WHOLE glyph — box top (y=100) through the
  // diamond's own bottom (y ≈ 100+24+30+10=164) — not just the box alone
  assert.ok(glyphs[0].rect[0][1] <= 101 && glyphs[0].rect[1][1] >= 160, "the full box+stem+diamond bbox, not a fragment");
});

test("findLegendGlyphs: a caption split into several real text runs on one line merges into one logical caption", () => {
  const segs = flat(controlValveGlyph(100, 100));
  const spans: LegendSpan[] = [
    { text: "2", x0: 200, y0: 150, x1: 208, y1: 170 },
    { text: "-", x0: 208, y0: 150, x1: 214, y1: 170 },
    { text: "WAY ELECTRIC CONTROL VALVE", x0: 214, y0: 150, x1: 400, y1: 170 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "2-WAY ELECTRIC CONTROL VALVE");
});

test("findLegendGlyphs: a caption WRAPPED across two physical lines (same left margin, small line gap) merges into one caption", () => {
  const segs = flat(controlValveGlyph(100, 100));
  const spans: LegendSpan[] = [
    { text: "2-WAY CONTROL VALVE", x0: 200, y0: 150, x1: 350, y1: 170 },
    { text: "WITH INTEGRAL THERMOSTAT", x0: 200, y0: 174, x1: 380, y1: 194 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "2-WAY CONTROL VALVE WITH INTEGRAL THERMOSTAT");
});

test("findLegendGlyphs: a wrap cannot run away across many unrelated same-margin rows (e.g. a plain abbreviations column) — capped at 2 lines", () => {
  const segs = flat(controlValveGlyph(100, 100));
  const spans: LegendSpan[] = [
    { text: "2-WAY CONTROL VALVE", x0: 200, y0: 150, x1: 350, y1: 170 },
    { text: "WITH INTEGRAL THERMOSTAT", x0: 200, y0: 174, x1: 380, y1: 194 },
    { text: "A THIRD UNRELATED ROW", x0: 200, y0: 198, x1: 380, y1: 218 },
    { text: "A FOURTH UNRELATED ROW", x0: 200, y0: 222, x1: 380, y1: 242 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "2-WAY CONTROL VALVE WITH INTEGRAL THERMOSTAT", "stops at 2 lines — never swallows the unrelated rows below");
});

test("findLegendGlyphs: a long column-divider rule line is never read as a glyph", () => {
  const segs = flat([...controlValveGlyph(100, 100), seg(0, 500, 2000, 500)]);
  const spans: LegendSpan[] = [{ text: "2-WAY ELECTRIC CONTROL VALVE", x0: 200, y0: 150, x1: 400, y1: 170 }];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1, "only the real glyph — the divider has no compact bbox and pairs with nothing");
});

test("findLegendGlyphs: two independent (glyph, caption) rows are each found and correctly labeled, not conflated", () => {
  const segs = flat([...controlValveGlyph(100, 100), ...controlValveGlyph(100, 400)]);
  const spans: LegendSpan[] = [
    { text: "2-WAY ELECTRIC CONTROL VALVE", x0: 200, y0: 150, x1: 400, y1: 170 },
    { text: "3-WAY ELECTRIC CONTROL VALVE", x0: 200, y0: 450, x1: 400, y1: 470 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 2);
  const byCaption = Object.fromEntries(glyphs.map((g) => [g.caption, g]));
  assert.ok(byCaption["2-WAY ELECTRIC CONTROL VALVE"]);
  assert.ok(byCaption["3-WAY ELECTRIC CONTROL VALVE"]);
  assert.ok(byCaption["2-WAY ELECTRIC CONTROL VALVE"].rect[0][1] < byCaption["3-WAY ELECTRIC CONTROL VALVE"].rect[0][1], "the first row's glyph sits above the second's");
});

test("findLegendGlyphs: a caption too far to the right of any glyph is never force-paired", () => {
  const segs = flat(controlValveGlyph(100, 100));
  const spans: LegendSpan[] = [{ text: "UNRELATED, FAR AWAY", x0: 3000, y0: 150, x1: 3200, y1: 170 }];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120, maxCaptionGapPx: 120 });
  assert.equal(glyphs.length, 0);
});

test("findLegendGlyphs: a caption sitting to the LEFT of a glyph (wrong reading order) is never paired", () => {
  const segs = flat(controlValveGlyph(300, 100));
  const spans: LegendSpan[] = [{ text: "SHOULD NOT PAIR", x0: 50, y0: 150, x1: 200, y1: 170 }];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 0);
});

test("findLegendGlyphs: no segments, or no spans, returns empty rather than throwing", () => {
  assert.deepEqual(findLegendGlyphs([], [{ text: "X", x0: 0, y0: 0, x1: 10, y1: 10 }]), []);
  assert.deepEqual(findLegendGlyphs(flat(controlValveGlyph(0, 0)), []), []);
});

test("findLegendGlyphs: a glyph too big to be a compact symbol (exceeds maxGlyphDimPx) is excluded", () => {
  const segs = flat(controlValveGlyph(100, 100));
  const spans: LegendSpan[] = [{ text: "2-WAY ELECTRIC CONTROL VALVE", x0: 200, y0: 150, x1: 400, y1: 170 }];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 20 });   // smaller than the real glyph's own ~74px height
  assert.equal(glyphs.length, 0);
});

// Real, found-live bug (accuracy-hardening plan, later session, ledger item
// 44): a BORDERED SYMBOL/DESCRIPTION table (a real, GENUINE, different real
// legend layout than the loose Eglin AFB one above — itd-d1-lab's own
// "CONTROLS LEGEND") draws its own ruled grid (outer border, column
// divider, per-row rules) as linework that routinely TOUCHES each row's own
// icon, so first-pass connectivity clustering fuses the WHOLE table into
// one giant component `looksLikeGlyph` correctly rejects as "too big" —
// discarding every real row inside it, not just the touching one. Measured
// directly against that real table before writing the fix: its own real
// edge-length distribution is sharply bimodal (short glyph/cell-rule edges
// at 43-100px, long grid edges at 300px+, a clean empty gap between) — not
// a close call needing a delicate threshold. The recovered icon's own real
// gap to its caption also measured wider than the Eglin AFB legend's own
// ~90px (a real 124-138px, because the two columns themselves sit further
// apart), motivating maxCaptionGapPx's own default widening from 120→150.
test("findLegendGlyphs: a bordered SYMBOL/DESCRIPTION table (icons touching the ruled grid) recovers each real row, the grid itself is never read as a glyph", () => {
  // 800×800 table, TWO columns (SYMBOL | DESCRIPTION), no row divider — each
  // icon's own stem touches the column divider at a different height, and
  // the divider's own NODED fragments between touch points (JTS splits a
  // rule wherever another rule/stem crosses it) must stay well past
  // gridLineMinPx (160 at the module's own default maxGlyphDimPx=80) or the
  // "grid" itself stays chained together through its own short fragments —
  // a real failure mode hit tried first with a smaller/row-divided table,
  // where several crossings landed close enough to leave sub-160 fragments
  // and the divider never broke; sized here so the shortest fragment
  // (top border to first stem) is a comfortable 195px, not a near miss.
  const TABLE: number[][] = [
    seg(100, 100, 900, 100), seg(900, 100, 900, 900), seg(900, 900, 100, 900), seg(100, 900, 100, 100),
    seg(500, 100, 500, 900),   // SYMBOL | DESCRIPTION column divider
  ];
  // row 1 icon: a compact 30×30 box with a short STEM reaching out to touch
  // the column divider at a real T-junction (mid-edge, not a shared corner
  // or a collinear overlap) — the same real touching shape
  // controlValveGlyph's own stem/actuator-box already uses successfully.
  const ICON1: number[][] = [
    seg(440, 280, 470, 280), seg(470, 280, 470, 310), seg(470, 310, 440, 310), seg(440, 310, 440, 280),
    seg(470, 295, 500, 295),   // stem to the column divider's own mid-edge
  ];
  // row 2 icon: same shape, same real T-junction touch, far enough below
  // row 1 that the divider fragment BETWEEN them also clears gridLineMinPx
  const ICON2: number[][] = [
    seg(440, 680, 470, 680), seg(470, 680, 470, 710), seg(470, 710, 440, 710), seg(440, 710, 440, 680),
    seg(470, 695, 500, 695),
  ];
  const segs = flat([...TABLE, ...ICON1, ...ICON2]);
  const spans: LegendSpan[] = [
    { text: "DESCRIPTION", x0: 510, y0: 105, x1: 570, y1: 120 },    // the column header itself — never a false row
    { text: "ANALOG INPUT", x0: 620, y0: 285, x1: 700, y1: 305 },   // real gap to ICON1's own x1=500: 120px
    { text: "DIGITAL INPUT", x0: 620, y0: 685, x1: 700, y1: 705 },  // real gap to ICON2's own x1=500: 120px
  ];
  const glyphs = findLegendGlyphs(segs, spans);   // module defaults: maxGlyphDimPx=80, maxCaptionGapPx=150
  const byCaption = Object.fromEntries(glyphs.map((g) => [g.caption, g]));
  assert.ok(byCaption["ANALOG INPUT"], `expected ANALOG INPUT among: ${glyphs.map((g) => g.caption).join(", ")}`);
  assert.ok(byCaption["DIGITAL INPUT"], `expected DIGITAL INPUT among: ${glyphs.map((g) => g.caption).join(", ")}`);
  assert.ok(!byCaption["DESCRIPTION"], "the column header itself must never be read as a labeled row");
  // recovered rects sit at the real icon, not the whole fused table
  assert.ok(byCaption["ANALOG INPUT"].rect[1][0] - byCaption["ANALOG INPUT"].rect[0][0] <= 80, "recovered rect is icon-sized, not table-sized");
});

// Real, MEASURED bug (accuracy-hardening plan, this session, found running
// the pipeline against itd-d1-lab-mechanical.pdf#16's real "CONTROLS
// LEGEND"): a cluster's own bbox here is built from buildMepGraph's own
// NODED node coordinates, which are quantized to its solved snap grid
// (mepconnectivity.ts's quantGridPx, 1.8px at this module's default
// unscaled call) BEFORE noding ever runs — so the bbox can land up to half
// a grid cell inside where the glyph's own RAW drawn segments truly end.
// Measured live: the real opposed-blade-damper glyph's blade strokes ended
// at y=878.16; the quantized bbox reported y0=878.4 — a zero-margin rect
// built from that, fed straight into symbol_sweep's own fingerprintSymbol
// (which requires BOTH endpoints strictly inside the rect, by design), kept
// only 1 of the glyph's real 6 segments — a near-empty, false fingerprint.
// This is the exact real cross-module contract legendlearn.ts's own header
// comment promises ("the caller feeds each result straight into
// symbol_sweep's own seed_rect... exactly as if a human had marqueed it")
// — so the regression is asserted at that contract, not an internal detail:
// EVERY raw segment belonging to a detected glyph must survive the trip
// through fingerprintSymbol using the glyph's own reported rect, for any
// glyph position, not only ones lucky enough to land on exact grid
// multiples (100 and 100+24=124 do not, by construction here).
test("findLegendGlyphs: the returned rect captures the WHOLE glyph when fed into symbol_sweep's own fingerprintSymbol — never clipped by the noding grid's own coordinate quantization", () => {
  const rawSegs = controlValveGlyph(100, 100);
  const segs = flat(rawSegs);
  const spans: LegendSpan[] = [{ text: "2-WAY ELECTRIC CONTROL VALVE", x0: 200, y0: 150, x1: 400, y1: 170 }];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  const fp = fingerprintSymbol(segs, glyphs[0].rect);
  assert.equal(fp.segments, rawSegs.length, `expected all ${rawSegs.length} real glyph segments to survive fingerprintSymbol via the detected rect, got ${fp.segments} — the rect is clipping real linework the noding grid quantized away from the raw coordinates`);
});

// findGlyphNear (2026-09-02) — the plan-sheet analog of findLegendGlyphs'
// own clustering, generalized off legend captions entirely. Built directly
// after a REAL, measured symbol_sweep seed on itd-d1-lab-mechanical.pdf#3
// required hand-reconstructing three coordinate spaces (rendered-view px ->
// zoom factor -> native image px) and eyeballing a crop to build one tight
// rect around one "EH-1" hexagon — that manual crop-and-reverse-math
// workflow is exactly what this function replaces: a single point near a
// symbol resolves to a tight seed rect automatically, same connectivity
// engine, no caption required. The fixture below mirrors that real case:
// two identical glyphs joined by a long duct-run line (stripped as
// background structure, same gridLineMinPx logic legend clustering uses),
// "nothing to confuse it" — exactly the adjacent-duplicate case that real
// D-1 Lab test (EH-1 seeded, EH-2 scored 1.0) was built to answer.
const MAX_GLYPH = 120;
function ductJoinedGlyphPair(): { segs: number[]; a: [number, number]; b: [number, number] } {
  const A = controlValveGlyph(100, 100);   // bbox roughly x:97-127, y:100-164
  const B = controlValveGlyph(400, 100);   // same shape, far enough apart
  // a long "duct run" connecting them — well over 2*MAX_GLYPH (240) so it's
  // stripped as background structure before clustering, exactly like a real
  // ruled table border or a real duct line in legendlearn's own grid-strip.
  const duct = [seg(127, 120, 400, 120)];
  return { segs: flat([...A, ...B, ...duct]), a: [112, 130], b: [412, 130] };
}

test("findGlyphNear: a click near one glyph of an adjacent identical pair resolves a rect capturing ONLY that glyph's real segments, duct line excluded", () => {
  const { segs, a } = ductJoinedGlyphPair();
  const rawA = controlValveGlyph(100, 100);
  const found = findGlyphNear(segs, a, { maxGlyphDimPx: MAX_GLYPH });
  assert.ok(found, "expected a glyph cluster near the click point");
  const fp = fingerprintSymbol(segs, found!.rect);
  assert.equal(fp.segments, rawA.length, `expected exactly the ${rawA.length} real segments of the clicked glyph, got ${fp.segments} — either the duct line leaked in or the glyph got clipped`);
});

test("findGlyphNear: seeding from a click-resolved rect on one glyph finds its real, unambiguous twin at score 1.0 — the real 'adjacent duplicate, nothing to confuse it' case", () => {
  const { segs, a } = ductJoinedGlyphPair();
  const seedFound = findGlyphNear(segs, a, { maxGlyphDimPx: MAX_GLYPH });
  assert.ok(seedFound);
  const fp = fingerprintSymbol(segs, seedFound!.rect);
  const res = matchSymbol(fp, segs, { excludeCenter: fp.center });
  assert.equal(res.matches.length, 1, `expected exactly 1 match (the twin glyph), got ${res.matches.length}`);
  assert.equal(res.matches[0].score, 1, "the real, unambiguous twin must score a perfect 1.0, not land in withheld or get missed");
});

test("findGlyphNear: a click far from any linework refuses (null), never guesses a rect", () => {
  const { segs } = ductJoinedGlyphPair();
  const found = findGlyphNear(segs, [900, 900], { maxGlyphDimPx: MAX_GLYPH });
  assert.equal(found, null);
});

test("findGlyphNear: a click just outside the glyph's own bbox still snaps to it (rough clicks are the whole point)", () => {
  const { segs, a } = ductJoinedGlyphPair();
  const rawA = controlValveGlyph(100, 100);
  const offPoint: [number, number] = [a[0] - 25, a[1] - 25];
  const found = findGlyphNear(segs, offPoint, { maxGlyphDimPx: MAX_GLYPH });
  assert.ok(found, "expected a nearby click to still snap to the glyph");
  const fp = fingerprintSymbol(segs, found!.rect);
  assert.equal(fp.segments, rawA.length);
});
