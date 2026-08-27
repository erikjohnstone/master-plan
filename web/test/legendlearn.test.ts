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
import { findLegendGlyphs, type LegendSpan } from "../src/lib/legendlearn.ts";

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
