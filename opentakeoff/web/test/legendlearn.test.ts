// legendlearn.ts — findLegendGlyphs (accuracy-hardening plan Phase 1,
// pivoted after an explicit ask: "are we learning symbols as we go, or
// scanning the legend once?"). There is no single national HVAC symbol
// standard — every firm keeps its own house legend — so a bigger FIXED
// reference-shape library (hvacRefShapes.ts) never scales to every firm's
// own conventions. This module does the new work only: cluster a legend
// sheet's own real vector segments into compact glyphs, real-junction-aware
// (T-junctions, mid-edge touches — via buildMepGraph's own JTS noding, not
// naive endpoint matching), and pair each with its own real caption text.
// It never sweeps anything itself. The learned geometry is evidence used to
// locate and corroborate a real plan-scale occurrence; routed line styles
// are explicitly non-seedable for discrete EA counting.
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
import { findLegendGlyphs, legendLearnStatus, type LegendSpan } from "../src/lib/legendlearn.ts";
import { fingerprintSymbol } from "../src/lib/symbolsweep.ts";

const seg = (ax: number, ay: number, bx: number, by: number) => [ax, ay, bx, by];
const flat = (segs: number[][]): number[] => segs.flat();
// Most tests below isolate clustering/pairing with only one synthetic row.
// Production callers keep the detector's repeated-layout defaults; these
// fixtures opt out so each low-level behavior remains independently tested.
const isolated = { minAlignedRows: 1, minUnheadedRows: 1 } as const;

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
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
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
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "2-WAY ELECTRIC CONTROL VALVE");
});

test("findLegendGlyphs: PDF font seams keep a subscript attached while restoring the following visible word space", () => {
  const segs = flat(controlValveGlyph(100, 100));
  const spans: LegendSpan[] = [
    { text: "CO", x0: 200, y0: 150, x1: 223, y1: 170 },
    // The subscript arrives later in PDF reading order and almost touches CO.
    { text: "2", x0: 223.1, y0: 158, x1: 229, y1: 171 },
    // SENSOR starts a real word space after the completed CO2 token.
    { text: "SENSOR", x0: 234, y0: 150, x1: 305, y1: 170 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "CO2 SENSOR");
});

test("findLegendGlyphs: a drawn inline mark may split one caption line without joining the next table column", () => {
  const segs = flat([
    ...controlValveGlyph(100, 100),
    seg(386, 152, 400, 152), seg(400, 152, 400, 170),
  ]);
  const spans: LegendSpan[] = [
    { text: "LIGHTING FIXTURE (", x0: 220, y0: 150, x1: 380, y1: 174 },
    // The missing inline bracket is vector geometry; its text runs retain a
    // bounded one-text-height gap on the same physical baseline.
    { text: "INDICATES BRACKET, WALL MOUNTED FIXTURES)", x0: 410, y0: 150, x1: 790, y1: 174 },
    { text: "UNRELATED TABLE COLUMN", x0: 900, y0: 150, x1: 1120, y1: 174 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "LIGHTING FIXTURE ( INDICATES BRACKET, WALL MOUNTED FIXTURES)");
});

test("findLegendGlyphs: sheet-scaled same-line joining preserves a separated network qualifier without crossing real columns", () => {
  const segs = flat([...controlValveGlyph(100, 100), ...controlValveGlyph(100, 300)]);
  const spans: LegendSpan[] = [
    { text: "DDC NETWORK LEGEND", x0: 70, y0: 20, x1: 430, y1: 45 },
    { text: "BACNET MS/TP", x0: 220, y0: 145, x1: 350, y1: 170 },
    { text: "-", x0: 356, y0: 145, x1: 362, y1: 170 },
    { text: "UUKL NETWORK", x0: 368, y0: 145, x1: 510, y1: 170 },
    { text: "GENERIC NETWORK", x0: 220, y0: 345, x1: 390, y1: 370 },
    // A real separate column remains far beyond the adaptive <=10px join.
    { text: "GENERAL NOTES", x0: 600, y0: 345, x1: 760, y1: 370 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.equal(glyphs[0].caption, "BACNET MS/TP-UUKL NETWORK");
  assert.equal(glyphs[1].caption, "GENERIC NETWORK");
});

test("findLegendGlyphs: separated bullet key and definition runs become one readable caption line", () => {
  const segs = flat(controlValveGlyph(100, 100));
  const spans: LegendSpan[] = [
    { text: "POWER DEVICES", x0: 70, y0: 20, x1: 350, y1: 45 },
    { text: "'GFI'", x0: 220, y0: 150, x1: 260, y1: 175 },
    { text: "INDICATES GROUND-FAULT PROTECTION", x0: 284, y0: 150, x1: 610, y1: 175 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs[0].caption, "'GFI' INDICATES GROUND-FAULT PROTECTION");
});

test("findLegendGlyphs: definition prose containing 'symbol indicates' remains caption text, not a heading", () => {
  const segs = flat(controlValveGlyph(100, 100));
  const spans: LegendSpan[] = [
    { text: "LIGHTING", x0: 70, y0: 20, x1: 250, y1: 45 },
    { text: "EXIT LIGHTING FIXTURE. FILLED IN", x0: 220, y0: 110, x1: 540, y1: 130 },
    { text: "QUADRANT(S) OF SYMBOL INDICATES NUMBER AND ORIENTATION OF", x0: 220, y0: 134, x1: 760, y1: 154 },
    { text: "ILLUMINATED FACES.", x0: 220, y0: 158, x1: 390, y1: 178 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs[0].caption,
    "EXIT LIGHTING FIXTURE. FILLED IN QUADRANT(S) OF SYMBOL INDICATES NUMBER AND ORIENTATION OF ILLUMINATED FACES.");
});

test("findLegendGlyphs: a caption WRAPPED across two physical lines (same left margin, small line gap) merges into one caption", () => {
  const segs = flat(controlValveGlyph(100, 100));
  const spans: LegendSpan[] = [
    { text: "2-WAY CONTROL VALVE", x0: 200, y0: 150, x1: 350, y1: 170 },
    { text: "WITH INTEGRAL THERMOSTAT", x0: 200, y0: 174, x1: 380, y1: 194 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "2-WAY CONTROL VALVE WITH INTEGRAL THERMOSTAT");
});

test("findLegendGlyphs: a wrap cannot run away across many unrelated same-margin rows (e.g. a plain abbreviations column) — capped at 3 lines", () => {
  const segs = flat(controlValveGlyph(100, 100));
  const spans: LegendSpan[] = [
    { text: "2-WAY CONTROL VALVE", x0: 200, y0: 150, x1: 350, y1: 170 },
    { text: "WITH INTEGRAL THERMOSTAT", x0: 200, y0: 174, x1: 380, y1: 194 },
    { text: "A THIRD UNRELATED ROW", x0: 200, y0: 198, x1: 380, y1: 218 },
    { text: "A FOURTH UNRELATED ROW", x0: 200, y0: 222, x1: 380, y1: 242 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "2-WAY CONTROL VALVE WITH INTEGRAL THERMOSTAT A THIRD UNRELATED ROW", "stops at 3 lines — never swallows the whole unrelated column below");
});

test("findLegendGlyphs: a real three-line control caption is owned completely", () => {
  const segs = flat([...controlValveGlyph(100, 100), ...controlValveGlyph(100, 300)]);
  const spans: LegendSpan[] = [
    { text: "CONTROL DRAWING LEGEND", x0: 70, y0: 20, x1: 390, y1: 45 },
    { text: "MOTORIZED DAMPER WITH ACTUATOR", x0: 220, y0: 120, x1: 460, y1: 140 },
    { text: "TWO-WAY OR MODULATING.", x0: 220, y0: 143, x1: 420, y1: 163 },
    { text: "SEE DETAILS", x0: 220, y0: 166, x1: 320, y1: 186 },
    { text: "CONTROL VALVE", x0: 220, y0: 320, x1: 360, y1: 340 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120, maxWrapGapPx: 8 });
  assert.equal(glyphs[0].caption, "MOTORIZED DAMPER WITH ACTUATOR TWO-WAY OR MODULATING. SEE DETAILS");
  assert.deepEqual(glyphs[0].caption_bbox, [[220, 120], [460, 186]]);
});

test("findLegendGlyphs: a spaced third caption line is retained only when the same tall glyph reaches it", () => {
  const tallTag = [
    seg(100, 100, 140, 100), seg(140, 100, 140, 170),
    seg(140, 170, 100, 170), seg(100, 170, 100, 100),
  ];
  const spans: LegendSpan[] = [
    { text: "AIR DEVICE TYPE. REFER TO SCHEDULE", x0: 200, y0: 100, x1: 500, y1: 120 },
    { text: "NECK DIAMETER (INCHES)", x0: 200, y0: 124, x1: 410, y1: 144 },
    // Deliberately beyond maxWrapGapPx from line two, but still crossed by
    // the same tag geometry. This is one compound legend identity.
    { text: "AIR DEVICE WITH ROUND NECK TAG", x0: 200, y0: 158, x1: 470, y1: 178 },
  ];
  const glyphs = findLegendGlyphs(flat(tallTag), spans, { ...isolated, maxGlyphDimPx: 120, maxWrapGapPx: 8 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "AIR DEVICE TYPE. REFER TO SCHEDULE NECK DIAMETER (INCHES) AIR DEVICE WITH ROUND NECK TAG");
  assert.equal(glyphs[0].kind, "annotation", "a tag-format key explains drafting notation; it is not an installed device identity");
  assert.equal(glyphs[0].seedable, false);
});

test("findLegendGlyphs: leader labels physically crossing one compound glyph can extend its caption to five lines", () => {
  const compound = [
    seg(100, 100, 150, 100), seg(150, 100, 150, 196),
    seg(150, 196, 100, 196), seg(100, 196, 100, 100),
  ];
  const texts = [
    "ACTIVE THROW DIRECTION (TYP)",
    "INACTIVE / BLOCKED DIRECTION (TYP)",
    "CEILING SUPPLY AIR DEVICE WITH",
    "2-WAY DIRECTIONAL THROW",
    "(OTHER CONFIGURATIONS SIMILAR)",
  ];
  const spans: LegendSpan[] = texts.map((text, index) => ({
    text, x0: 200, y0: 100 + index * 24, x1: 500, y1: 120 + index * 24,
  }));
  const glyphs = findLegendGlyphs(flat(compound), spans, { ...isolated, maxGlyphDimPx: 120, maxWrapGapPx: 8 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, texts.join(" "));
});

test("findLegendGlyphs: centered and indented damper-description wraps remain one row at the sheet's text scale", () => {
  const segs = flat([...controlValveGlyph(100, 100), ...controlValveGlyph(100, 350)]);
  const spans: LegendSpan[] = [
    { text: "CONTROL SCHEMATIC SYMBOLS", x0: 70, y0: 20, x1: 500, y1: 45 },
    { text: "MOTORIZED SMOKE DAMPER (SD) OR MOTORIZED", x0: 220, y0: 145, x1: 650, y1: 170 },
    { text: "FIRE-SMOKE DAMPER (FSD), PARALLEL BLADE", x0: 272, y0: 173, x1: 650, y1: 198 },
    { text: "NORMALLY OPEN OR CLOSED AS SHOWN", x0: 240, y0: 201, x1: 610, y1: 226 },
    { text: "CONTROL VALVE", x0: 220, y0: 395, x1: 390, y1: 420 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 2);
  assert.equal(glyphs[0].caption, "MOTORIZED SMOKE DAMPER (SD) OR MOTORIZED FIRE-SMOKE DAMPER (FSD), PARALLEL BLADE NORMALLY OPEN OR CLOSED AS SHOWN");
  assert.deepEqual(glyphs[0].caption_bbox, [[220, 145], [650, 226]]);
});

test("findLegendGlyphs: a long column-divider rule line is never read as a glyph", () => {
  const segs = flat([...controlValveGlyph(100, 100), seg(0, 500, 2000, 500)]);
  const spans: LegendSpan[] = [{ text: "2-WAY ELECTRIC CONTROL VALVE", x0: 200, y0: 150, x1: 400, y1: 170 }];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1, "only the real glyph — the divider has no compact bbox and pairs with nothing");
});

test("findLegendGlyphs: two independent (glyph, caption) rows are each found and correctly labeled, not conflated", () => {
  const segs = flat([...controlValveGlyph(100, 100), ...controlValveGlyph(100, 400)]);
  const spans: LegendSpan[] = [
    { text: "2-WAY ELECTRIC CONTROL VALVE", x0: 200, y0: 150, x1: 400, y1: 170 },
    { text: "3-WAY ELECTRIC CONTROL VALVE", x0: 200, y0: 450, x1: 400, y1: 470 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 2);
  const byCaption = Object.fromEntries(glyphs.map((g) => [g.caption, g]));
  assert.ok(byCaption["2-WAY ELECTRIC CONTROL VALVE"]);
  assert.ok(byCaption["3-WAY ELECTRIC CONTROL VALVE"]);
  assert.ok(byCaption["2-WAY ELECTRIC CONTROL VALVE"].rect[0][1] < byCaption["3-WAY ELECTRIC CONTROL VALVE"].rect[0][1], "the first row's glyph sits above the second's");
});

test("findLegendGlyphs: a second rendition cannot fall past its own text-only qualifier and steal the next physical row", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 24, y), seg(x + 24, y, x + 24, y + 20),
    seg(x + 24, y + 20, x, y + 20), seg(x, y + 20, x, y),
  ];
  const segs = flat([
    ...box(100, 100), ...box(150, 100),
    ...box(100, 180), ...box(150, 180),
  ]);
  const spans: LegendSpan[] = [
    { text: "RECTANGULAR DUCT", x0: 220, y0: 100, x1: 390, y1: 120 },
    // A text-only parameter line under the same two drawn variants is a
    // legitimate continuation of row one, but it has no independent vector
    // identity. It must not inherit row one's spare variant and then keep
    // cascading into the next physical symbol row.
    { text: "RECTANGULAR DUCT WIDTHxHEIGHT (INCHES)", x0: 220, y0: 126, x1: 560, y1: 146 },
    { text: "RECTANGULAR SUPPLY DUCT TURN DOWN", x0: 220, y0: 180, x1: 520, y1: 200 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120, maxWrapGapPx: 10 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "RECTANGULAR DUCT RECTANGULAR DUCT WIDTHxHEIGHT (INCHES)",
    "RECTANGULAR SUPPLY DUCT TURN DOWN",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.member_rects?.length === 2));
});

test("findLegendGlyphs: tight leading does not merge two complete physical legend rows", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 124, y), seg(124, y, 124, y + 20),
    seg(124, y + 20, 100, y + 20), seg(100, y + 20, 100, y),
  ];
  const segs = flat([...box(100), ...box(130)]);
  const spans: LegendSpan[] = [
    { text: "HYDRONIC PIPE TURN DOWN", x0: 200, y0: 100, x1: 430, y1: 120 },
    { text: "HYDRONIC PIPE TURN UP", x0: 200, y0: 124, x1: 410, y1: 144 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120, maxWrapGapPx: 8 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "HYDRONIC PIPE TURN DOWN", "HYDRONIC PIPE TURN UP",
  ]);
});

test("findLegendGlyphs: an unclaimed middle caption joins the nearest glyph row, independent of pair order", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 124, y), seg(124, y, 124, y + 20),
    seg(124, y + 20, 100, y + 20), seg(100, y + 20, 100, y),
  ];
  const segs = flat([...box(100), ...box(156)]);
  const spans: LegendSpan[] = [
    { text: "MANUAL AIR VENT", x0: 200, y0: 100, x1: 370, y1: 120 },
    // This line has no independently pairable component, but it sits next
    // to the lower row's geometry and is the first line of that row.
    { text: "METERED BALANCING VALVE", x0: 200, y0: 140, x1: 450, y1: 160 },
    { text: "W/ PRESSURE TAPS", x0: 200, y0: 164, x1: 380, y1: 184 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120, maxWrapGapPx: 20 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "MANUAL AIR VENT", "METERED BALANCING VALVE W/ PRESSURE TAPS",
  ]);
});

test("findLegendGlyphs: a terse tag embedded inside the repeated glyph column is not promoted to its own legend row", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 200, y), seg(200, y, 200, y + 30),
    seg(200, y + 30, 100, y + 30), seg(100, y + 30, 100, y),
  ];
  const segs = flat([
    ...box(100), ...box(220), ...box(340),
    // A detached actuator stem immediately left of an internal "BD" tag.
    // Local pairing alone can mistake this for a fourth legend identity.
    seg(160, 285, 170, 285), seg(165, 270, 165, 285),
  ]);
  const spans: LegendSpan[] = [
    { text: "MECHANICAL LEGEND", x0: 80, y0: 30, x1: 360, y1: 55 },
    { text: "SUPPLY AIR DAMPER", x0: 240, y0: 105, x1: 420, y1: 125 },
    { text: "RETURN AIR DAMPER", x0: 240, y0: 225, x1: 420, y1: 245 },
    { text: "BD", x0: 180, y0: 270, x1: 200, y1: 290 },
    { text: "BACKDRAFT DAMPER", x0: 240, y0: 345, x1: 420, y1: 365 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120, maxCaptionGapPx: 150 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "SUPPLY AIR DAMPER", "RETURN AIR DAMPER", "BACKDRAFT DAMPER",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.aligned_rows === 3), "the embedded tag cannot inflate structural row evidence");
});

test("findLegendGlyphs: a caption too far to the right of any glyph is never force-paired", () => {
  const segs = flat(controlValveGlyph(100, 100));
  const spans: LegendSpan[] = [{ text: "UNRELATED, FAR AWAY", x0: 3000, y0: 150, x1: 3200, y1: 170 }];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120, maxCaptionGapPx: 120 });
  assert.equal(glyphs.length, 0);
});

test("findLegendGlyphs: a caption sitting to the LEFT of a glyph (wrong reading order) is never paired", () => {
  const segs = flat(controlValveGlyph(300, 100));
  const spans: LegendSpan[] = [{ text: "SHOULD NOT PAIR", x0: 50, y0: 150, x1: 200, y1: 170 }];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 0);
});

test("findLegendGlyphs: no segments, or no spans, returns empty rather than throwing", () => {
  assert.deepEqual(findLegendGlyphs([], [{ text: "X", x0: 0, y0: 0, x1: 10, y1: 10 }]), []);
  assert.deepEqual(findLegendGlyphs(flat(controlValveGlyph(0, 0)), []), []);
});

test("findLegendGlyphs: a glyph too big to be a compact symbol (exceeds maxGlyphDimPx) is excluded", () => {
  const segs = flat(controlValveGlyph(100, 100));
  const spans: LegendSpan[] = [{ text: "2-WAY ELECTRIC CONTROL VALVE", x0: 200, y0: 150, x1: 400, y1: 170 }];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 20 });   // smaller than the real glyph's own ~74px height
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
  const glyphs = findLegendGlyphs(segs, spans, isolated);   // geometry defaults, layout quorum disabled for this 2-row fixture
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
// This is the exact geometry contract consumers rely on when comparing a
// legend glyph against a plan-scale occurrence, so the regression is
// asserted at that boundary rather than as an internal detail:
// EVERY raw segment belonging to a detected glyph must survive the trip
// through fingerprintSymbol using the glyph's own reported rect, for any
// glyph position, not only ones lucky enough to land on exact grid
// multiples (100 and 100+24=124 do not, by construction here).
test("findLegendGlyphs: the returned rect captures the WHOLE glyph when fed into symbol_sweep's own fingerprintSymbol — never clipped by the noding grid's own coordinate quantization", () => {
  const rawSegs = controlValveGlyph(100, 100);
  const segs = flat(rawSegs);
  const spans: LegendSpan[] = [{ text: "2-WAY ELECTRIC CONTROL VALVE", x0: 200, y0: 150, x1: 400, y1: 170 }];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  const fp = fingerprintSymbol(segs, glyphs[0].rect);
  assert.equal(fp.segments, rawSegs.length, `expected all ${rawSegs.length} real glyph segments to survive fingerprintSymbol via the detected rect, got ${fp.segments} — the rect is clipping real linework the noding grid quantized away from the raw coordinates`);
});

test("findLegendGlyphs: production mode requires a repeated legend layout and returns exact caption ownership evidence", () => {
  const segs = flat([...controlValveGlyph(100, 100), ...controlValveGlyph(100, 400)]);
  const spans: LegendSpan[] = [
    { text: "CONTROL SYMBOLS", x0: 80, y0: 30, x1: 390, y1: 55 },
    { text: "2-WAY CONTROL VALVE", x0: 200, y0: 150, x1: 360, y1: 170 },
    { text: "3-WAY CONTROL VALVE", x0: 200, y0: 450, x1: 360, y1: 470 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 2);
  assert.deepEqual(glyphs[0].caption_bbox, [[200, 150], [360, 170]]);
  assert.equal(glyphs[0].aligned_rows, 2);
  assert.equal(glyphs[0].heading, "CONTROL SYMBOLS");
});

test("findLegendGlyphs: a ruled domain legend title owns every repeated column inside its finite header rule", () => {
  const row = (x: number, y: number) => [
    seg(x, y, x + 30, y), seg(x + 30, y, x + 30, y + 30),
    seg(x + 30, y + 30, x, y + 30), seg(x, y + 30, x, y),
  ];
  const segs = flat([
    // The title text is deliberately narrow and left-aligned, while its
    // finite ruled panel spans both independent symbol/description columns.
    seg(80, 55, 720, 55), seg(80, 320, 720, 320),
    ...row(100, 100), ...row(100, 180), ...row(100, 260),
    ...row(420, 100), ...row(420, 180), ...row(420, 260),
  ]);
  const spans: LegendSpan[] = [
    { text: "HVAC LEGEND", x0: 100, y0: 20, x1: 250, y1: 40 },
    { text: "SUPPLY DIFFUSER", x0: 160, y0: 105, x1: 300, y1: 125 },
    { text: "RETURN GRILLE", x0: 160, y0: 185, x1: 285, y1: 205 },
    { text: "EXHAUST GRILLE", x0: 160, y0: 265, x1: 300, y1: 285 },
    { text: "MANUAL VOLUME DAMPER", x0: 480, y0: 105, x1: 680, y1: 125 },
    { text: "MOTORIZED DAMPER", x0: 480, y0: 185, x1: 650, y1: 205 },
    { text: "SMOKE DAMPER", x0: 480, y0: 265, x1: 620, y1: 285 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 80 });
  assert.equal(glyphs.length, 6);
  assert.ok(glyphs.every((glyph) => glyph.heading === "HVAC LEGEND"));
  assert.deepEqual(glyphs.map((glyph) => glyph.aligned_rows), [3, 3, 3, 3, 3, 3]);
});

test("findLegendGlyphs: a title in one cell of a shared header row owns every symbol column in its divided body", () => {
  const row = (x: number, y: number) => [
    seg(x, y, x + 30, y), seg(x + 30, y, x + 30, y + 30),
    seg(x + 30, y + 30, x, y + 30), seg(x, y + 30, x, y),
  ];
  const segs = flat([
    // One rule spans an adjacent abbreviations cell and the symbol cell.
    // Full-height dividers plus the symbol cell's own bottom rule provide
    // the finite jurisdiction for the right-hand title.
    seg(50, 60, 900, 60), seg(50, 20, 900, 20),
    seg(50, 20, 50, 500), seg(300, 20, 300, 500), seg(900, 20, 900, 500),
    seg(300, 500, 900, 500),
    ...row(340, 100), ...row(340, 180),
    ...row(540, 100), ...row(540, 180),
    ...row(740, 100), ...row(740, 180),
  ]);
  const spans: LegendSpan[] = [
    { text: "MECHANICAL FLOOR PLAN SYMBOLS", x0: 430, y0: 28, x1: 750, y1: 52 },
    { text: "CONTROL VALVE", x0: 390, y0: 105, x1: 510, y1: 125 },
    { text: "PRESSURE SENSOR", x0: 390, y0: 185, x1: 525, y1: 205 },
    { text: "FIRE DAMPER", x0: 590, y0: 105, x1: 700, y1: 125 },
    { text: "SMOKE DAMPER", x0: 590, y0: 185, x1: 720, y1: 205 },
    { text: "SUPPLY DIFFUSER", x0: 790, y0: 105, x1: 890, y1: 125 },
    { text: "RETURN GRILLE", x0: 790, y0: 185, x1: 890, y1: 205 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 80 });
  assert.equal(glyphs.length, 6);
  assert.ok(glyphs.every((glyph) => glyph.heading === "MECHANICAL FLOOR PLAN SYMBOLS"));
});

test("findLegendGlyphs: a REFERENCE SYMBOLS panel row-slices shared callout leaders as annotations", () => {
  const segs = flat([
    seg(50, 60, 700, 60), seg(50, 560, 700, 560),
    seg(50, 20, 50, 560), seg(700, 20, 700, 560),
    // One intentionally over-tall connected spine cannot be an ordinary
    // compact glyph. Each definition owns only its unique final leader.
    seg(240, 80, 240, 500),
    seg(240, 110, 290, 110), seg(240, 230, 290, 230),
    seg(240, 350, 290, 350), seg(240, 470, 290, 470),
  ]);
  const glyphs = findLegendGlyphs(segs, [
    { text: "REFERENCE SYMBOLS", x0: 220, y0: 25, x1: 480, y1: 48 },
    { text: "SECTION NUMBER", x0: 300, y0: 100, x1: 450, y1: 120 },
    { text: "DRAWING NUMBER WHERE DRAWN", x0: 300, y0: 220, x1: 570, y1: 240 },
    { text: "DETAIL NUMBER", x0: 300, y0: 340, x1: 440, y1: 360 },
    { text: "KEY NOTE", x0: 300, y0: 460, x1: 390, y1: 480 },
  ]);
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "SECTION NUMBER", "DRAWING NUMBER WHERE DRAWN", "DETAIL NUMBER", "KEY NOTE",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.heading === "REFERENCE SYMBOLS"
    && glyph.kind === "annotation" && !glyph.seedable && glyph.segments === 1));
  assert.ok(glyphs.every((glyph) => glyph.rect[0][0] <= 240.5
    && glyph.rect[1][0] >= 289.5));
});

test("findLegendGlyphs: a hash placeholder printed inside a drafting callout is not a definition row", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 140, y), seg(140, y, 140, y + 30),
    seg(140, y + 30, 100, y + 30), seg(100, y + 30, 100, y),
  ];
  const glyphs = findLegendGlyphs(flat([
    ...box(100), ...box(160), ...box(220),
  ]), [
    { text: "GENERAL SYMBOLS LEGEND", x0: 60, y0: 30, x1: 330, y1: 55 },
    { text: "KEY NOTE SYMBOL", x0: 200, y0: 105, x1: 360, y1: 125 },
    { text: "SECTION", x0: 200, y0: 165, x1: 280, y1: 185 },
    { text: "DRAWING #", x0: 200, y0: 225, x1: 300, y1: 245 },
  ], { maxGlyphDimPx: 80 });

  assert.deepEqual(glyphs.map((glyph) => glyph.caption), ["KEY NOTE SYMBOL", "SECTION"]);
  assert.ok(glyphs.every((glyph) => glyph.kind === "annotation" && !glyph.seedable));
});

test("findLegendGlyphs: a ruled domain title does not let a remote shared callout diagram merge distinct fitting identities", () => {
  const segs = flat([
    // A finite panel border proves horizontal jurisdiction, but there is no
    // caption-column chain from this title to the remote callout diagram.
    seg(50, 60, 800, 60), seg(50, 800, 800, 800),
    seg(500, 470, 590, 470),
    // One connected diagram spans both tee labels, just like a piping key
    // whose separate leaders describe two different branches.
    seg(440, 510, 590, 510), seg(500, 490, 500, 585),
    seg(500, 535, 555, 585), seg(555, 585, 590, 585),
  ]);
  const glyphs = findLegendGlyphs(segs, [
    { text: "MECHANICAL PIPING SYMBOLS", x0: 100, y0: 20, x1: 390, y1: 42 },
    { text: "PLUG", x0: 620, y0: 461, x1: 670, y1: 481 },
    { text: "REDUCING 45", x0: 620, y0: 515, x1: 745, y1: 535 },
    { text: "DEGREE TEE", x0: 620, y0: 537, x1: 730, y1: 557 },
    { text: "45 DEGREE TEE", x0: 620, y0: 569, x1: 760, y1: 589 },
  ]);
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "PLUG", "REDUCING 45 DEGREE TEE", "45 DEGREE TEE",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.heading === "MECHANICAL PIPING SYMBOLS"));
  assert.ok(glyphs.every((glyph) => !glyph.seedable));
});

test("findLegendGlyphs: centered DESCRIPTION cells share their declared ruled-table column and inherit the named drafting parent", () => {
  const rowBox = (y: number) => [
    seg(120, y + 25, 150, y + 25), seg(150, y + 25, 150, y + 55),
    seg(150, y + 55, 120, y + 55), seg(120, y + 55, 120, y + 25),
  ];
  const segs = flat([
    seg(80, 10, 700, 10), seg(700, 10, 700, 620),
    seg(700, 620, 80, 620), seg(80, 620, 80, 10),
    seg(80, 55, 700, 55), seg(80, 95, 700, 95),
    seg(80, 195, 700, 195), seg(80, 295, 700, 295),
    seg(80, 395, 700, 395), seg(80, 495, 700, 495), seg(80, 595, 700, 595),
    seg(300, 55, 300, 620),
    ...rowBox(100), ...rowBox(200), ...rowBox(300), ...rowBox(400),
  ]);
  const spans: LegendSpan[] = [
    { text: "GENERAL SYMBOLS LEGEND", x0: 190, y0: 20, x1: 560, y1: 42 },
    { text: "SYMBOL", x0: 130, y0: 65, x1: 205, y1: 85 },
    { text: "DESCRIPTION", x0: 400, y0: 65, x1: 530, y1: 85 },
    // These are visibly centered in one DESCRIPTION cell, so their literal
    // left edges intentionally vary far beyond ordinary caption jitter.
    { text: "KEY NOTE SYMBOL", x0: 365, y0: 125, x1: 535, y1: 145 },
    { text: "EQUIPMENT TAG", x0: 410, y0: 225, x1: 550, y1: 245 },
    { text: "SECTION", x0: 455, y0: 325, x1: 535, y1: 345 },
    { text: "DETAIL", x0: 330, y0: 425, x1: 400, y1: 445 },
    // Its midpoint lies in DESCRIPTION, but the sentence begins back inside
    // SYMBOL. A cell divider is a hard ownership boundary, so this is prose,
    // not a text-only fifth legend row.
    { text: "ALL DATA SHALL BE ADJUSTABLE FROM THE OPERATOR WORKSTATION", x0: 180, y0: 525, x1: 650, y1: 545 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 80 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "KEY NOTE SYMBOL", "EQUIPMENT TAG", "SECTION", "DETAIL",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.heading === "GENERAL SYMBOLS LEGEND"));
  assert.ok(glyphs.every((glyph) => glyph.kind === "annotation" && !glyph.seedable));
  assert.ok(glyphs.every((glyph) => glyph.aligned_rows === 4));
});

test("findLegendGlyphs: a double-stroked bottom border does not turn an open-row legend into one giant structured row", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 140, y), seg(140, y, 140, y + 40),
    seg(140, y + 40, 100, y + 40), seg(100, y + 40, 100, y),
  ];
  const segs = flat([
    seg(50, 90, 700, 90),
    // These two plot strokes are one visual bottom border. Their 4px gap is
    // far smaller than a text row, so it cannot prove an internal row band.
    seg(50, 500, 700, 500), seg(50, 504, 700, 504),
    seg(250, 50, 250, 504),
    ...box(140), ...box(260), ...box(380),
  ]);
  const glyphs = findLegendGlyphs(segs, [
    { text: "ELECTRICAL SYMBOL LEGEND", x0: 70, y0: 20, x1: 430, y1: 45 },
    { text: "SYMBOL", x0: 100, y0: 60, x1: 180, y1: 82 },
    { text: "DESCRIPTION", x0: 330, y0: 60, x1: 470, y1: 82 },
    { text: "CURRENT TRANSFORMER", x0: 330, y0: 148, x1: 540, y1: 170 },
    { text: "DISCONNECT SWITCH", x0: 330, y0: 268, x1: 530, y1: 290 },
    { text: "VARIABLE FREQUENCY DRIVE", x0: 330, y0: 388, x1: 610, y1: 410 },
  ]);
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "CURRENT TRANSFORMER", "DISCONNECT SWITCH", "VARIABLE FREQUENCY DRIVE",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.aligned_rows === 3));
});

test("findLegendGlyphs: a ruled SYMBOL-ABBR-DESCRIPTION table keeps code cells out of learned captions", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 140, y), seg(140, y, 140, y + 40),
    seg(140, y + 40, 100, y + 40), seg(100, y + 40, 100, y),
  ];
  const segs = flat([
    ...[55, 100, 200, 300, 400].map((y) => seg(50, y, 700, y)),
    seg(50, 55, 50, 400), seg(200, 55, 200, 400),
    seg(300, 55, 300, 400), seg(700, 55, 700, 400),
    ...box(125), ...box(225), ...box(325),
  ]);
  const glyphs = findLegendGlyphs(segs, [
    { text: "MECHANICAL SYMBOL LIST", x0: 80, y0: 20, x1: 390, y1: 42 },
    { text: "SYMBOL", x0: 95, y0: 65, x1: 175, y1: 85 },
    { text: "ABBR", x0: 220, y0: 65, x1: 275, y1: 85 },
    { text: "DESCRIPTION", x0: 390, y0: 65, x1: 530, y1: 85 },
    { text: "CV", x0: 220, y0: 135, x1: 250, y1: 155 },
    { text: "CONTROL VALVE", x0: 350, y0: 135, x1: 500, y1: 155 },
    { text: "FD", x0: 220, y0: 235, x1: 250, y1: 255 },
    { text: "FIRE DAMPER", x0: 350, y0: 235, x1: 480, y1: 255 },
    { text: "DPS", x0: 220, y0: 335, x1: 260, y1: 355 },
    { text: "DIFFERENTIAL PRESSURE SENSOR", x0: 350, y0: 335, x1: 650, y1: 355 },
  ]);
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "CONTROL VALVE", "FIRE DAMPER", "DIFFERENTIAL PRESSURE SENSOR",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.heading === "SYMBOL"));
});

test("findLegendGlyphs: embedded system codes make repeated shallow carriers routed line keys, never countable devices", () => {
  const codedKey = (y: number) => [
    seg(100, y, 230, y), seg(230, y, 230, y + 22),
    seg(230, y + 22, 100, y + 22), seg(100, y + 22, 100, y),
    seg(100, y + 11, 230, y + 11),
  ];
  const segs = flat([...codedKey(100), ...codedKey(150), ...codedKey(200)]);
  const spans: LegendSpan[] = [
    { text: "MECHANICAL SYMBOL LIST", x0: 80, y0: 20, x1: 370, y1: 40 },
    { text: "CS15", x0: 140, y0: 101, x1: 190, y1: 121 },
    { text: "CLEAN STEAM-NUMBER INDICATES PRESSURE IN PSIG.", x0: 250, y0: 101, x1: 680, y1: 121 },
    { text: "DPP", x0: 150, y0: 151, x1: 185, y1: 171 },
    { text: "DRAIN", x0: 250, y0: 151, x1: 315, y1: 171 },
    { text: "PD", x0: 155, y0: 201, x1: 180, y1: 221 },
    { text: "PUMPED DISCHARGE", x0: 250, y0: 201, x1: 430, y1: 221 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 160 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "CLEAN STEAM-NUMBER INDICATES PRESSURE IN PSIG.", "DRAIN", "PUMPED DISCHARGE",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.kind === "line_style" && !glyph.seedable));
});

test("findLegendGlyphs: a printed route code between two line halves yields one full description row", () => {
  const splitKey = (y: number) => [seg(100, y, 180, y), seg(250, y, 330, y)];
  const segs = flat([...splitKey(100), ...splitKey(160), ...splitKey(220)]);
  const spans: LegendSpan[] = [
    { text: "HVAC & PIPING LEGEND", x0: 80, y0: 20, x1: 330, y1: 42 },
    { text: "HPS (PSIG)", x0: 185, y0: 90, x1: 245, y1: 110 },
    { text: "HIGH PRESSURE STEAM", x0: 380, y0: 90, x1: 590, y1: 110 },
    { text: "LPS (PSIG)", x0: 185, y0: 150, x1: 245, y1: 170 },
    { text: "LOW PRESSURE STEAM", x0: 380, y0: 150, x1: 580, y1: 170 },
    { text: "CS (PSIG)", x0: 190, y0: 210, x1: 240, y1: 230 },
    { text: "CLEAN STEAM", x0: 380, y0: 210, x1: 505, y1: 230 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 160 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "HIGH PRESSURE STEAM", "LOW PRESSURE STEAM", "CLEAN STEAM",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.rect[0][0] <= 100.5
    && glyph.rect[1][0] >= 329.5
    && glyph.kind === "line_style" && !glyph.seedable));
});

test("findLegendGlyphs: a side-braced AIR SYSTEMS triad preserves every hatch key as routed truth", () => {
  const box = (y: number, diagonal: "up" | "down" | "both") => [
    seg(100, y, 140, y), seg(140, y, 140, y + 40),
    seg(140, y + 40, 100, y + 40), seg(100, y + 40, 100, y),
    ...(diagonal === "up" || diagonal === "both" ? [seg(100, y + 40, 140, y)] : []),
    ...(diagonal === "down" || diagonal === "both" ? [seg(100, y, 140, y + 40)] : []),
  ];
  const segs = flat([
    seg(50, 60, 700, 60), seg(50, 300, 700, 300),
    seg(50, 20, 50, 300), seg(700, 20, 700, 300),
    ...box(90, "both"), ...box(150, "up"), ...box(210, "down"),
  ]);
  const glyphs = findLegendGlyphs(segs, [
    { text: "MECHANICAL FLOOR PLAN SYMBOLS", x0: 170, y0: 25, x1: 520, y1: 48 },
    { text: "SUPPLY", x0: 180, y0: 100, x1: 250, y1: 120 },
    { text: "RETURN", x0: 180, y0: 160, x1: 250, y1: 180 },
    { text: "EXHAUST", x0: 180, y0: 220, x1: 260, y1: 240 },
    { text: "AIR SYSTEMS", x0: 350, y0: 160, x1: 470, y1: 180 },
  ]);
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), ["SUPPLY", "RETURN", "EXHAUST"]);
  assert.ok(glyphs.every((glyph) => glyph.heading === "AIR SYSTEMS"
    && glyph.kind === "line_style" && !glyph.seedable));
});

test("findLegendGlyphs: an embedded device tag in a shallow carrier cannot demote a physical device to a routed line key", () => {
  const taggedCarrier = (y: number) => [
    seg(100, y, 230, y), seg(230, y, 230, y + 22),
    seg(230, y + 22, 100, y + 22), seg(100, y + 22, 100, y),
    seg(100, y + 11, 230, y + 11),
  ];
  const segs = flat([...taggedCarrier(100), ...taggedCarrier(150), ...taggedCarrier(200)]);
  const spans: LegendSpan[] = [
    { text: "MECHANICAL SYMBOL LIST", x0: 80, y0: 20, x1: 370, y1: 40 },
    { text: "PG", x0: 150, y0: 101, x1: 180, y1: 121 },
    { text: "PRESSURE GAUGE", x0: 250, y0: 101, x1: 420, y1: 121 },
    { text: "H", x0: 158, y0: 151, x1: 172, y1: 171 },
    { text: "HUMIDIFIER", x0: 250, y0: 151, x1: 365, y1: 171 },
    { text: "ST", x0: 152, y0: 201, x1: 178, y1: 221 },
    { text: "STEAM TRAP", x0: 250, y0: 201, x1: 360, y1: 221 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 160 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "PRESSURE GAUGE", "HUMIDIFIER", "STEAM TRAP",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.kind === "symbol"));
});

test("findLegendGlyphs: duct-section and directional drafting keys stay auditable but never countable", () => {
  const segs = flat([
    ...controlValveGlyph(100, 100), ...controlValveGlyph(100, 200),
    ...controlValveGlyph(100, 300), ...controlValveGlyph(100, 400),
  ]);
  const captions = [
    "RISE IN DIRECTION OF AIR FLOW",
    "SUPPLY/OUTSIDE AIR DUCT SECTION",
    "PITCH PIPE IN DIRECTION",
    "DIRECTION OF FLOW IN PIPE",
  ];
  const spans: LegendSpan[] = captions.map((text, index) => ({
    text, x0: 220, y0: 145 + index * 100, x1: 520, y1: 165 + index * 100,
  }));
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), captions);
  assert.ok(glyphs.every((glyph) => glyph.kind === "annotation" && !glyph.seedable));
});

test("findLegendGlyphs: duct rise, offset, and airflow keys are drafting conventions, not devices", () => {
  const box = (y: number) => [
    seg(100, y, 140, y), seg(140, y, 140, y + 30),
    seg(140, y + 30, 100, y + 30), seg(100, y + 30, 100, y),
  ];
  const captions = [
    "VERTICAL DUCT RISE", "VERTICAL DUCT DROP", "DROP OR RISE",
    "CONNECT OUT OF TOP", "OF AIR FLOW 45° OFFSETS",
    "RETURN OR EXHAUST AIR FLOW", "SUPPLY OR OUTSIDE AIR FLOW",
  ];
  const glyphs = findLegendGlyphs(flat(captions.flatMap((_, index) => box(100 + index * 50))), [
    { text: "MECHANICAL FLOOR PLAN SYMBOLS", x0: 80, y0: 20, x1: 430, y1: 42 },
    ...captions.map((text, index): LegendSpan => ({
      text, x0: 200, y0: 105 + index * 50, x1: 470, y1: 125 + index * 50,
    })),
  ], { maxGlyphDimPx: 100 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), captions);
  assert.ok(glyphs.every((glyph) => glyph.kind === "annotation" && !glyph.seedable));
});

test("findLegendGlyphs: a physical pipe cap remains a countable fitting identity", () => {
  const segs = flat(controlValveGlyph(100, 100));
  const spans: LegendSpan[] = [
    { text: "PIPE CAP", x0: 220, y0: 145, x1: 310, y1: 165 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, isolated);
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].kind, "symbol");
  assert.equal(glyphs[0].seedable, true);
});

test("findLegendGlyphs: common CAD font seams inside MEP words are repaired without changing caption geometry", () => {
  const segs = flat(controlValveGlyph(100, 100));
  const spans: LegendSpan[] = [
    { text: "M ANUAL VOLUM E DAM PER W ITH TEM PERATURE SENSO R", x0: 200, y0: 150, x1: 650, y1: 170 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs[0].caption, "MANUAL VOLUME DAMPER WITH TEMPERATURE SENSOR");
  assert.deepEqual(glyphs[0].caption_bbox, [[200, 150], [650, 170]]);
});

test("findLegendGlyphs: vector-outlined abbreviations beside definitions are text, not learned symbols", () => {
  const segs: number[][] = [];
  const spans: LegendSpan[] = [
    { text: "CONTROL SYMBOLS", x0: 70, y0: 20, x1: 390, y1: 45 },
  ];
  for (let row = 0; row < 10; row++) {
    const y = 100 + row * 40;
    // A rectangular proxy for the CAD strokes forming the extractable
    // abbreviation. Its bbox coincides with the abbreviation text bbox.
    segs.push(seg(100, y, 124, y), seg(124, y, 124, y + 20), seg(124, y + 20, 100, y + 20), seg(100, y + 20, 100, y));
    spans.push(
      { text: `A${row}`, x0: 100, y0: y, x1: 124, y1: y + 20 },
      { text: `ABBREVIATION DEFINITION ${row}`, x0: 200, y0: y, x1: 390, y1: y + 20 },
    );
  }
  assert.deepEqual(findLegendGlyphs(flat(segs), spans), []);
});

test("findLegendGlyphs: stacked vector-outline text with CAD metric overshoot is not a glyph for the next column", () => {
  const segs = flat([
    seg(97, 97, 303, 97), seg(303, 97, 303, 153),
    seg(303, 153, 97, 153), seg(97, 153, 97, 97),
  ]);
  const spans: LegendSpan[] = [
    { text: "CHILLED WATER RETURN", x0: 100, y0: 100, x1: 300, y1: 122 },
    { text: "PIPING", x0: 100, y0: 128, x1: 160, y1: 150 },
    { text: "AD AFF", x0: 350, y0: 110, x1: 420, y1: 132 },
  ];
  assert.deepEqual(findLegendGlyphs(segs, spans, isolated), []);
});

test("findLegendGlyphs: sparse PDF-text tags inside a vector carrier do not make the physical symbol look like outlined text", () => {
  const coil = flat([
    seg(100, 100, 140, 100), seg(140, 100, 140, 180),
    seg(140, 180, 100, 180), seg(100, 180, 100, 100),
    seg(140, 100, 100, 180),
  ]);
  const spans: LegendSpan[] = [
    // The outer bbox of these two sparse tags nearly fills the carrier,
    // exactly like the reviewed cooling/heating-coil marks on a real sheet.
    { text: "C", x0: 103, y0: 102, x1: 113, y1: 122 },
    { text: "C", x0: 125, y0: 154, x1: 135, y1: 174 },
    { text: "COOLING COIL", x0: 220, y0: 125, x1: 350, y1: 145 },
  ];
  const glyphs = findLegendGlyphs(coil, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "COOLING COIL");
  assert.equal(glyphs[0].kind, "symbol");
  assert.equal(glyphs[0].seedable, true, "one physical identity may proceed to the mandatory plan-anchor stage");
  assert.ok(glyphs[0].rect[0][1] <= 100 && glyphs[0].rect[1][1] >= 180);
});

test("findLegendGlyphs: a snug four-edge carrier around a PDF-text equipment tag remains a physical glyph", () => {
  const segs = flat([
    seg(100, 100, 160, 100), seg(160, 100, 160, 125),
    seg(160, 125, 100, 125), seg(100, 125, 100, 100),
  ]);
  const spans: LegendSpan[] = [
    // Font ascent protrudes above the carrier just as it does in CAD-exported
    // boxed VFD/ATS tags; horizontal margins still prove an outer box.
    { text: "VFD", x0: 108, y0: 96, x1: 152, y1: 124 },
    { text: "VARIABLE FREQUENCY DRIVE", x0: 220, y0: 102, x1: 490, y1: 124 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 100 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "VARIABLE FREQUENCY DRIVE");
  assert.equal(glyphs[0].kind, "symbol");
  assert.equal(glyphs[0].seedable, true);
});

test("findLegendGlyphs: a square four-edge carrier survives when a two-letter device tag fills its width", () => {
  const segs = flat([
    seg(100, 100, 130, 100), seg(130, 100, 130, 130),
    seg(130, 130, 100, 130), seg(100, 130, 100, 100),
  ]);
  const spans: LegendSpan[] = [
    { text: "MD", x0: 101, y0: 105, x1: 129, y1: 125 },
    { text: "MOTION DETECTOR", x0: 200, y0: 105, x1: 370, y1: 125 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, isolated);
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "MOTION DETECTOR");
  assert.equal(glyphs[0].kind, "symbol");
  assert.equal(glyphs[0].seedable, true);
});

test("findLegendGlyphs: a placeholder value inside a leader cannot steal its wrapped drafting-key caption", () => {
  const segs = flat([
    seg(100, 115, 210, 115), seg(100, 115, 112, 107), seg(100, 115, 112, 123),
  ]);
  const spans: LegendSpan[] = [
    { text: "XXXXX.X", x0: 214, y0: 100, x1: 278, y1: 120 },
    { text: "KEY NOTE MARK", x0: 310, y0: 100, x1: 450, y1: 120 },
    { text: "WITH LEADER", x0: 310, y0: 124, x1: 430, y1: 144 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 140, maxWrapGapPx: 8 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "KEY NOTE MARK WITH LEADER");
  assert.equal(glyphs[0].kind, "annotation");
  assert.equal(glyphs[0].seedable, false);
});

test("findLegendGlyphs: a dense point matrix's vector X marks never become glyph-caption rows", () => {
  const segs: number[][] = [];
  const spans: LegendSpan[] = [{ text: "BMS POINT FUNCTION SCHEDULE", x0: 60, y0: 20, x1: 450, y1: 45 }];
  for (let row = 0; row < 12; row++) {
    const y = 100 + row * 30;
    segs.push(seg(100, y, 116, y + 16), seg(116, y, 100, y + 16));
    spans.push(
      { text: "X", x0: 100, y0: y, x1: 116, y1: y + 16 },
      { text: `CHILLED WATER POINT ${row}`, x0: 190, y0: y, x1: 390, y1: y + 16 },
    );
  }
  assert.deepEqual(findLegendGlyphs(flat(segs), spans), []);
});

test("findLegendGlyphs: two coincidental diagram labels are rejected even when another part of the sheet has a legend heading", () => {
  const segs = flat([...controlValveGlyph(1000, 300), ...controlValveGlyph(1000, 600)]);
  const spans: LegendSpan[] = [
    { text: "CONTROLS LEGEND", x0: 80, y0: 30, x1: 390, y1: 55 },
    { text: "SUPPLY AIR", x0: 1100, y0: 350, x1: 1220, y1: 370 },
    { text: "RETURN AIR", x0: 1100, y0: 650, x1: 1220, y1: 670 },
  ];
  assert.deepEqual(findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 }), []);
});

test("findLegendGlyphs: one caption is owned by the geometrically nearest eligible glyph, deterministically", () => {
  const far = controlValveGlyph(100, 100);
  const near = controlValveGlyph(190, 100);
  const spans: LegendSpan[] = [{ text: "CONTROL VALVE", x0: 300, y0: 150, x1: 430, y1: 170 }];
  const glyphs = findLegendGlyphs(flat([...far, ...near]), spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  assert.ok(glyphs[0].rect[0][0] > 180, "the nearer right-hand glyph owns the caption");
});

test("findLegendGlyphs: a horizontally closer component from the next row cannot steal a caption from the glyph occupying its actual row", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const segs = flat([
    ...box(100, 100, 140, 120),
    // The following row's component ends much closer to the caption x, but
    // begins below the caption's own vertical band. The former gap-heavy
    // score chose this wrong component and then dropped the legitimate row.
    ...box(160, 136, 190, 176),
  ]);
  const spans: LegendSpan[] = [
    { text: "FLEXIBLE PIPE CONNECTOR", x0: 200, y0: 98, x1: 430, y1: 122 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120, maxCaptionGapPx: 150 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "FLEXIBLE PIPE CONNECTOR");
  assert.ok(glyphs[0].rect[1][0] < 150, "the component in the caption's actual row owns it");
});

test("findLegendGlyphs: a thin baseline embedded in a richer same-row icon cannot turn the icon into a routed line style", () => {
  const segs = flat([
    seg(100, 90, 180, 90), seg(180, 90, 180, 100),
    seg(180, 100, 100, 100), seg(100, 100, 100, 90),
    // Disconnected baseline closer to the caption center than the richer
    // component, as in transformer and panelboard legend glyphs.
    seg(100, 106, 180, 106),
  ]);
  const spans: LegendSpan[] = [
    { text: "TRANSFORMER", x0: 220, y0: 102, x1: 350, y1: 122 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].kind, "symbol");
  assert.equal(glyphs[0].seedable, true);
  assert.ok(glyphs[0].rect[1][1] > 105, "the thin baseline remains part of the complete icon evidence");
});

test("findLegendGlyphs: an indented qualifier using a nested glyph component is detail, not a duplicate symbol row", () => {
  const outer = [
    seg(100, 96, 150, 96), seg(150, 96, 150, 126),
    seg(150, 126, 100, 126), seg(100, 126, 100, 96),
  ];
  const inner = [
    seg(110, 100, 140, 100), seg(140, 100, 140, 120),
    seg(140, 120, 110, 120), seg(110, 120, 110, 100),
  ];
  const spans: LegendSpan[] = [
    { text: "SPECIAL PURPOSE RECEPTACLE", x0: 220, y0: 100, x1: 470, y1: 120 },
    { text: "= TYPE", x0: 280, y0: 124, x1: 350, y1: 144 },
  ];
  const glyphs = findLegendGlyphs(flat([...outer, ...inner]), spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), ["SPECIAL PURPOSE RECEPTACLE"]);
});

test("findLegendGlyphs: a glyphless option list bridges a tall parameterized row to the rest of its legend column", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 140, y), seg(140, y, 140, y + 20),
    seg(140, y + 20, 100, y + 20), seg(100, y + 20, 100, y),
  ];
  const segs = flat([...box(100), ...box(500), ...box(580), ...box(660)]);
  const spans: LegendSpan[] = [
    { text: "CONTROL SYMBOLS", x0: 70, y0: 20, x1: 390, y1: 45 },
    { text: "WALL SWITCH", x0: 220, y0: 100, x1: 350, y1: 120 },
    ...Array.from({ length: 9 }, (_, index) => ({
      text: `X = OPTION ${index + 1}`,
      x0: 250,
      y0: 140 + index * 40,
      x1: 390,
      y1: 160 + index * 40,
    })),
    { text: "DAMPER ACTUATOR", x0: 220, y0: 500, x1: 390, y1: 520 },
    { text: "PRESSURE SENSOR", x0: 220, y0: 580, x1: 390, y1: 600 },
    { text: "CONTROL VALVE", x0: 220, y0: 660, x1: 370, y1: 680 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "WALL SWITCH", "DAMPER ACTUATOR", "PRESSURE SENSOR", "CONTROL VALVE",
  ]);
});

test("findLegendGlyphs: an inner short qualifier cannot steal the fuller same-row description", () => {
  const segs = flat([...controlValveGlyph(100, 100), ...controlValveGlyph(100, 300)]);
  const spans: LegendSpan[] = [
    { text: "CONTROL SYMBOLS", x0: 80, y0: 20, x1: 390, y1: 45 },
    { text: "CO", x0: 170, y0: 145, x1: 190, y1: 165 },
    { text: "CARBON MONOXIDE TRANSMITTER", x0: 220, y0: 145, x1: 470, y1: 165 },
    { text: "OC", x0: 170, y0: 345, x1: 190, y1: 365 },
    { text: "OCCUPANCY SENSOR", x0: 220, y0: 345, x1: 380, y1: 365 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), ["CARBON MONOXIDE TRANSMITTER", "OCCUPANCY SENSOR"]);
});

test("findLegendGlyphs: one variant's terse inner tag cannot claim the other variant or hide it from a short two-word caption", () => {
  const box = (x: number): number[][] => [
    seg(x, 100, x + 24, 100), seg(x + 24, 100, x + 24, 120),
    seg(x + 24, 120, x, 120), seg(x, 120, x, 100),
  ];
  const spans: LegendSpan[] = [
    { text: "PIPING", x0: 70, y0: 20, x1: 330, y1: 45 },
    { text: "CO", x0: 104, y0: 115, x1: 120, y1: 135 },
    { text: "CO", x0: 214, y0: 115, x1: 230, y1: 135 },
    { text: "CLEAN OUT", x0: 300, y0: 100, x1: 390, y1: 120 },
  ];
  const glyphs = findLegendGlyphs(flat([...box(100), ...box(210)]), spans, { ...isolated, maxGlyphDimPx: 180 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "CLEAN OUT");
  assert.equal(glyphs[0].kind, "symbol_group");
  assert.equal(glyphs[0].seedable, false);
  assert.equal(glyphs[0].member_rects?.length, 2);
});

test("findLegendGlyphs: a centered heading supports the full glyph-to-caption column span, not only the glyph x-coordinate", () => {
  const segs = flat([...controlValveGlyph(100, 100), ...controlValveGlyph(100, 300)]);
  const spans: LegendSpan[] = [
    { text: "CONTROL SYMBOLS", x0: 260, y0: 20, x1: 430, y1: 45 },
    { text: "CONTROL VALVE", x0: 300, y0: 145, x1: 450, y1: 165 },
    { text: "DAMPER ACTUATOR", x0: 300, y0: 345, x1: 460, y1: 365 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 2);
  assert.ok(glyphs.every((glyph) => glyph.heading === "CONTROL SYMBOLS"));
});

test("findLegendGlyphs: a centered underlined STANDARD SYMBOLS heading owns each repeated column across the declared panel", () => {
  const segs = flat([
    seg(60, 52, 950, 52),
    ...controlValveGlyph(100, 100), ...controlValveGlyph(100, 200),
    ...controlValveGlyph(600, 100), ...controlValveGlyph(600, 200),
  ]);
  const spans: LegendSpan[] = [
    { text: "STANDARD SYMBOLS", x0: 260, y0: 20, x1: 440, y1: 40 },
    { text: "DOOR TAG", x0: 220, y0: 145, x1: 310, y1: 165 },
    { text: "WINDOW TAG", x0: 220, y0: 245, x1: 330, y1: 265 },
    { text: "OCCUPANCY SENSOR", x0: 720, y0: 145, x1: 910, y1: 165 },
    { text: "SMOKE DETECTOR", x0: 720, y0: 245, x1: 890, y1: 265 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "DOOR TAG", "OCCUPANCY SENSOR", "WINDOW TAG", "SMOKE DETECTOR",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.heading === "STANDARD SYMBOLS"));
  assert.deepEqual(glyphs.map((glyph) => [glyph.kind, glyph.seedable]), [
    ["annotation", false], ["symbol", true], ["annotation", false], ["symbol", true],
  ]);
});

test("findLegendGlyphs: a bounded GENERAL PROJECT SYMBOLOGY panel owns mixed caption-below and right-caption drafting cells", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 30, y), seg(x + 30, y, x + 30, y + 30),
    seg(x + 30, y + 30, x, y + 30), seg(x, y + 30, x, y),
  ];
  const segs = flat([
    // The title nearly fills this compact panel; the owning rule is wider,
    // but not one-and-a-half times the rendered title width.
    seg(60, 55, 560, 55),
    ...box(100, 100), ...box(400, 100),
    ...box(100, 260), ...box(100, 340), ...box(100, 420),
    // Adjacent note graphics remain outside the semantic below-caption path.
    ...box(100, 500),
  ]);
  const spans: LegendSpan[] = [
    { text: "GENERAL PROJECT SYMBOLOGY", x0: 100, y0: 20, x1: 500, y1: 40 },
    { text: "NEW WORK KEYNOTE", x0: 60, y0: 150, x1: 170, y1: 170 },
    { text: "DEMOLITION KEYNOTE", x0: 345, y0: 150, x1: 485, y1: 170 },
    // Instructional labels inside the example graphic are closer to the
    // glyph, but the repeated right-aligned column owns row identity.
    { text: "SECTION NUMBER", x0: 180, y0: 265, x1: 330, y1: 285 },
    { text: "SHEET WHERE SHOWN", x0: 180, y0: 345, x1: 350, y1: 365 },
    { text: "ROOM DESIGNATION", x0: 380, y0: 265, x1: 540, y1: 285 },
    { text: "BUILDING SECTION", x0: 380, y0: 345, x1: 540, y1: 365 },
    // Right alignment, not a shared x start, owns this longer identity.
    { text: "DETAIL, SECTION, ELEVATION TITLE", x0: 250, y0: 425, x1: 540, y1: 445 },
    { text: "GENERAL PHASE EXECUTION", x0: 90, y0: 550, x1: 330, y1: 570 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "NEW WORK KEYNOTE", "DEMOLITION KEYNOTE", "ROOM DESIGNATION", "BUILDING SECTION",
    "DETAIL, SECTION, ELEVATION TITLE",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.heading === "GENERAL PROJECT SYMBOLOGY"));
  assert.ok(glyphs.every((glyph) => glyph.kind === "annotation" && !glyph.seedable));
});

test("findLegendGlyphs: an unruled STRUCTURAL LEGEND is valid drafting truth while an adjacent abbreviation glossary stays glyphless", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 140, y), seg(140, y, 140, y + 25),
    seg(140, y + 25, 100, y + 25), seg(100, y + 25, 100, y),
  ];
  const captions = [
    "COLUMN REFERENCE LINE (CENTERLINE OF COLUMN)",
    "SLOPE DIRECTION",
    "BRICK",
    "CONCRETE MASONRY UNIT (CMU)",
  ];
  const segs = flat([
    // Outer/header/bottom rules do not make the open body one giant row.
    seg(60, 10, 690, 10), seg(60, 90, 690, 90), seg(60, 460, 690, 460),
    ...captions.flatMap((_, index) => box(120 + index * 80)),
  ]);
  const spans: LegendSpan[] = [
    { text: "STRUCTURAL LEGEND", x0: 70, y0: 20, x1: 310, y1: 45 },
    { text: "SYMBOL", x0: 80, y0: 60, x1: 170, y1: 80 },
    { text: "DESCRIPTION", x0: 220, y0: 60, x1: 370, y1: 80 },
    ...captions.map((text, index): LegendSpan => ({
      text, x0: 220, y0: 123 + index * 80, x1: 650, y1: 143 + index * 80,
    })),
    { text: "STRUCTURAL ABBREVIATIONS", x0: 760, y0: 20, x1: 1080, y1: 45 },
    { text: "AB ANCHOR BOLT", x0: 760, y0: 103, x1: 940, y1: 123 },
    { text: "AFF ABOVE FINISHED FLOOR", x0: 760, y0: 183, x1: 1040, y1: 203 },
  ];
  const glyphs = findLegendGlyphs(
    segs,
    spans,
    { maxGlyphDimPx: 120 },
  );
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), captions);
  assert.ok(glyphs.every((glyph) => glyph.heading === "STRUCTURAL LEGEND"));
  assert.ok(glyphs.every((glyph) => glyph.kind === "annotation" && !glyph.seedable));
});

test("findLegendGlyphs: an underline cannot widen an ordinary controls heading into a separate peer column", () => {
  const segs = flat([
    seg(60, 52, 950, 52),
    ...controlValveGlyph(100, 100), ...controlValveGlyph(100, 200),
    ...controlValveGlyph(600, 100), ...controlValveGlyph(600, 200),
  ]);
  const spans: LegendSpan[] = [
    { text: "CONTROL DEVICE LEGEND", x0: 260, y0: 20, x1: 440, y1: 40 },
    { text: "CONTROL VALVE", x0: 220, y0: 145, x1: 390, y1: 165 },
    { text: "PRESSURE SENSOR", x0: 220, y0: 245, x1: 410, y1: 265 },
    { text: "DAMPER ACTUATOR", x0: 720, y0: 145, x1: 900, y1: 165 },
    { text: "TEMPERATURE SENSOR", x0: 720, y0: 245, x1: 930, y1: 265 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120, minUnheadedRows: 2 });
  assert.equal(glyphs.find((glyph) => glyph.caption === "CONTROL VALVE")?.heading, "CONTROL DEVICE LEGEND");
  assert.equal(glyphs.find((glyph) => glyph.caption === "PRESSURE SENSOR")?.heading, "CONTROL DEVICE LEGEND");
  assert.equal(glyphs.find((glyph) => glyph.caption === "DAMPER ACTUATOR")?.heading, null);
  assert.equal(glyphs.find((glyph) => glyph.caption === "TEMPERATURE SENSOR")?.heading, null);
});

test("findLegendGlyphs: three mixed callout labels beneath GENERAL do not become a drafting legend", () => {
  const segs = flat([
    ...controlValveGlyph(100, 100), ...controlValveGlyph(100, 200), ...controlValveGlyph(100, 300),
  ]);
  const spans: LegendSpan[] = [
    { text: "GENERAL", x0: 70, y0: 20, x1: 300, y1: 40 },
    { text: "FEEDER NAME", x0: 220, y0: 145, x1: 360, y1: 165 },
    { text: "PANEL NAME", x0: 220, y0: 245, x1: 350, y1: 265 },
    { text: "CIRCUIT #", x0: 220, y0: 345, x1: 330, y1: 365 },
  ];
  assert.deepEqual(findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 }), []);
});

test("findLegendGlyphs: rows in an underlined materials legend are auditable annotations, never count seeds", () => {
  const segs = flat([
    seg(60, 52, 950, 52),
    ...controlValveGlyph(600, 100), ...controlValveGlyph(600, 200),
  ]);
  const spans: LegendSpan[] = [
    { text: "STANDARD MATERIALS LEGEND", x0: 260, y0: 20, x1: 500, y1: 40 },
    { text: "FINISHED WOOD", x0: 720, y0: 145, x1: 870, y1: 165 },
    { text: "PLYWOOD - SMALL SCALE", x0: 720, y0: 245, x1: 930, y1: 265 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), ["FINISHED WOOD", "PLYWOOD - SMALL SCALE"]);
  assert.ok(glyphs.every((glyph) => glyph.heading === "STANDARD MATERIALS LEGEND"));
  assert.ok(glyphs.every((glyph) => glyph.kind === "annotation" && glyph.seedable === false));
});

test("findLegendGlyphs: an architectural elevation value inside a wide drafting row cannot steal the SPOT ELEVATION identity", () => {
  const segs = flat([
    seg(60, 52, 760, 52),
    ...controlValveGlyph(100, 100), seg(127, 164, 380, 164),
    ...controlValveGlyph(100, 210),
  ]);
  const spans: LegendSpan[] = [
    { text: "STANDARD SYMBOLS", x0: 250, y0: 20, x1: 430, y1: 40 },
    { text: "DATUM POINT", x0: 410, y0: 145, x1: 535, y1: 165 },
    { text: "12' - 5 1/2\"", x0: 150, y0: 255, x1: 255, y1: 275 },
    { text: "SPOT ELEVATION", x0: 410, y0: 255, x1: 565, y1: 275 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 320 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), ["DATUM POINT", "SPOT ELEVATION"]);
  assert.ok(glyphs.every((glyph) => glyph.kind === "annotation" && glyph.seedable === false));
});

test("findLegendGlyphs: one below-caption GRAPHICAL SCALE is owned only by an explicitly underlined drafting panel", () => {
  const box = (x: number, y: number, w: number, h: number): number[][] => [
    seg(x, y, x + w, y), seg(x + w, y, x + w, y + h),
    seg(x + w, y + h, x, y + h), seg(x, y + h, x, y),
  ];
  const bars = flat([
    seg(60, 52, 650, 52),
    ...box(100, 100, 100, 25), ...box(200, 125, 100, 25),
    ...box(300, 100, 180, 25), ...box(480, 125, 100, 25),
  ]);
  const spans: LegendSpan[] = [
    { text: "STANDARD SYMBOLS", x0: 250, y0: 20, x1: 430, y1: 40 },
    { text: "SECOND LEVEL", x0: 610, y0: 108, x1: 735, y1: 128 },
    // Real PDF font boxes can overlap the last tick by part of one text line.
    { text: "GRAPHICAL SCALE", x0: 240, y0: 145, x1: 400, y1: 165 },
  ];
  const glyphs = findLegendGlyphs(bars, spans);
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "GRAPHICAL SCALE");
  assert.equal(glyphs[0].heading, "STANDARD SYMBOLS");
  assert.ok(glyphs[0].rect[0][0] <= 100 && glyphs[0].rect[1][0] >= 580,
    "the evidence covers the complete disconnected scale bar");
  assert.equal(glyphs[0].kind, "annotation");
  assert.deepEqual(findLegendGlyphs(bars.slice(4), spans.slice(1)), [],
    "one arbitrary bar over text without a declared panel is not a legend");
});

test("findLegendGlyphs: an underlined ARCHITECTURAL LEGEND abbreviation glossary cannot use the tight-tag carrier exception", () => {
  const segs: number[][] = [seg(60, 52, 760, 52)];
  const spans: LegendSpan[] = [
    { text: "ARCHITECTURAL LEGEND", x0: 250, y0: 20, x1: 470, y1: 40 },
  ];
  for (let row = 0; row < 8; row++) {
    const y = 100 + row * 50;
    segs.push(
      seg(100, y, 142, y), seg(142, y, 142, y + 20),
      seg(142, y + 20, 100, y + 20), seg(100, y + 20, 100, y),
    );
    spans.push(
      { text: `A${String.fromCharCode(65 + row)}`, x0: 100, y0: y, x1: 142, y1: y + 20 },
      { text: `AIR SENSOR DEFINITION ${row + 1}`, x0: 200, y0: y, x1: 450, y1: y + 20 },
    );
  }
  assert.deepEqual(findLegendGlyphs(flat(segs), spans), []);
});

test("findLegendGlyphs: repeated material swatches pair rightward, merge wrapped names, and reject underlined subsection titles", () => {
  const box = (x: number, y: number, splitLeft = false): number[][] => [
    seg(x, y, x + 110, y), seg(x + 110, y, x + 110, y + 60),
    seg(x + 110, y + 60, x, y + 60),
    ...(splitLeft
      ? [seg(x, y + 60, x, y + 30), seg(x, y + 30, x, y)]
      : [seg(x, y + 60, x, y)]),
    seg(x, y, x + 110, y + 60),
  ];
  const segs = flat([
    seg(60, 52, 760, 52),
    seg(70, 94, 230, 94), seg(430, 94, 570, 94),
    ...box(250, 110, true), ...box(250, 210),
    ...box(600, 110), ...box(600, 210),
  ]);
  const spans: LegendSpan[] = [
    { text: "STANDARD MATERIALS LEGEND", x0: 220, y0: 20, x1: 500, y1: 40 },
    { text: "EARTHWORKS", x0: 70, y0: 70, x1: 175, y1: 90 },
    { text: "WOOD", x0: 430, y0: 70, x1: 490, y1: 90 },
    { text: "EARTH /", x0: 90, y0: 115, x1: 165, y1: 135 },
    { text: "COMPACT FILL", x0: 90, y0: 139, x1: 210, y1: 159 },
    { text: "SAND", x0: 90, y0: 225, x1: 145, y1: 245 },
    { text: "FINISHED WOOD", x0: 440, y0: 125, x1: 565, y1: 145 },
    { text: "PLYWOOD - SMALL SCALE", x0: 440, y0: 225, x1: 585, y1: 245 },
  ];
  const glyphs = findLegendGlyphs(segs, spans);
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "EARTH / COMPACT FILL", "FINISHED WOOD", "SAND", "PLYWOOD - SMALL SCALE",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.rect[0][0] >= 248),
    "each caption owns the bordered swatch to its right, never a preceding underline");
  assert.ok(glyphs.every((glyph) => glyph.heading === "STANDARD MATERIALS LEGEND"
    && glyph.kind === "annotation" && glyph.seedable === false));
  assert.ok(!glyphs.some((glyph) => /EARTHWORKS|^WOOD$/.test(glyph.caption)));
});

test("findLegendGlyphs: a declared standard drafting panel admits bounded large reference marks without widening ordinary sheets", () => {
  const largeBox = (y: number): number[][] => [
    seg(100, y, 360, y), seg(360, y, 360, y + 220),
    seg(360, y + 220, 100, y + 220), seg(100, y + 220, 100, y),
  ];
  const segs = flat([
    seg(60, 52, 950, 52),
    ...largeBox(100), ...largeBox(400),
  ]);
  const spans: LegendSpan[] = [
    { text: "STANDARD SYMBOLS", x0: 260, y0: 20, x1: 440, y1: 40 },
    { text: "SECTION MARK - SEE SHEET", x0: 400, y0: 190, x1: 650, y1: 210 },
    { text: "REVISION BUBBLE AND REVISION TAG", x0: 400, y0: 490, x1: 740, y1: 510 },
  ];
  const glyphs = findLegendGlyphs(segs, spans);
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "SECTION MARK - SEE SHEET", "REVISION BUBBLE AND REVISION TAG",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.kind === "annotation" && glyph.seedable === false));

  const withoutDeclaration = findLegendGlyphs(segs, spans.slice(1));
  assert.deepEqual(withoutDeclaration, [], "the larger search bound is earned by the explicit standard legend");
});

test("findLegendGlyphs: a legend heading cannot bless a separate distant diagram cluster merely because it spans that x position", () => {
  const segs = flat([
    ...controlValveGlyph(100, 100), ...controlValveGlyph(100, 200),
    ...controlValveGlyph(500, 500), ...controlValveGlyph(500, 600),
  ]);
  const spans: LegendSpan[] = [
    { text: "CONTROL SYMBOLS", x0: 70, y0: 20, x1: 800, y1: 45 },
    { text: "CONTROL VALVE", x0: 220, y0: 145, x1: 390, y1: 165 },
    { text: "PRESSURE SENSOR", x0: 220, y0: 245, x1: 410, y1: 265 },
    { text: "TO FACP", x0: 620, y0: 545, x1: 710, y1: 565 },
    { text: "B-AAC", x0: 620, y0: 645, x1: 700, y1: 665 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), ["CONTROL VALVE", "PRESSURE SENSOR"]);
});

test("findLegendGlyphs: a compact network line-key legend does not absorb aligned equipment boxes from the architecture diagram below it", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 200, y), seg(200, y, 200, y + 60),
    seg(200, y + 60, 100, y + 60), seg(100, y + 60, 100, y),
  ];
  const segs = flat([
    seg(100, 100, 250, 100),
    seg(100, 160, 145, 160), seg(165, 160, 205, 160), seg(225, 160, 250, 160),
    seg(100, 220, 250, 220),
    ...box(400), ...box(560), ...box(720), ...box(880),
  ]);
  const spans: LegendSpan[] = [
    { text: "DDC NETWORK LEGEND", x0: 70, y0: 20, x1: 430, y1: 45 },
    { text: "BACNET IP", x0: 300, y0: 90, x1: 400, y1: 110 },
    { text: "BACNET MS/TP", x0: 300, y0: 150, x1: 440, y1: 170 },
    { text: "GENERIC NETWORK", x0: 300, y0: 210, x1: 470, y1: 230 },
    // Same glyph and caption columns, but after a section-sized gap and as
    // boxes rather than routed-system keys: these are architecture nodes.
    { text: "MONITORING POINTS", x0: 300, y0: 420, x1: 470, y1: 440 },
    { text: "EF-4", x0: 300, y0: 580, x1: 350, y1: 600 },
    { text: "FC-4", x0: 300, y0: 740, x1: 350, y1: 760 },
    { text: "UH-4", x0: 300, y0: 900, x1: 350, y1: 920 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120, maxCaptionGapPx: 150 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), ["BACNET IP", "BACNET MS/TP", "GENERIC NETWORK"]);
  assert.ok(glyphs.every((glyph) => glyph.kind === "line_style" && glyph.aligned_rows === 3));
});

test("findLegendGlyphs: a remote slightly-left coincidence cannot poison a real repeated column and strand an intervening row", () => {
  const realRows = [100, 220, 340, 460];
  const segs = flat([
    ...realRows.flatMap((y) => controlValveGlyph(100, y)),
    // This unrelated lower pair is x-compatible with the real column but
    // begins slightly left. X-first greedy grouping used to seed from it,
    // expanding the envelope just enough to strand the final real row.
    ...controlValveGlyph(-40, 1000),
  ]);
  const spans: LegendSpan[] = [
    { text: "CONTROL SYMBOLS", x0: 70, y0: 20, x1: 430, y1: 45 },
    { text: "CONTROL VALVE", x0: 220, y0: 145, x1: 390, y1: 165 },
    { text: "PRESSURE SENSOR", x0: 220, y0: 265, x1: 410, y1: 285 },
    { text: "DAMPER ACTUATOR", x0: 220, y0: 385, x1: 410, y1: 405 },
    { text: "STARTER", x0: 226, y0: 505, x1: 310, y1: 525 },
    { text: "BUILDING AUTOMATION PROTOCOL", x0: 116, y0: 1045, x1: 390, y1: 1065 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120, maxCaptionGapPx: 150 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "CONTROL VALVE", "PRESSURE SENSOR", "DAMPER ACTUATOR", "STARTER",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.aligned_rows === 4));
});

test("findLegendGlyphs: glyphless rows in the same caption column bridge one long legend section to its heading", () => {
  const segs = flat([
    ...controlValveGlyph(100, 100), ...controlValveGlyph(100, 200),
    ...controlValveGlyph(100, 600), ...controlValveGlyph(100, 700),
  ]);
  const spans: LegendSpan[] = [
    { text: "MECHANICAL LEGEND", x0: 70, y0: 20, x1: 430, y1: 45 },
    { text: "CONTROL VALVE", x0: 220, y0: 145, x1: 390, y1: 165 },
    { text: "PRESSURE SENSOR", x0: 220, y0: 245, x1: 410, y1: 265 },
    { text: "RECTANGULAR DUCT DIMENSIONS", x0: 220, y0: 325, x1: 500, y1: 345 },
    { text: "FLAT OVAL DUCT DIMENSIONS", x0: 220, y0: 405, x1: 490, y1: 425 },
    { text: "ROUND DUCT DIMENSIONS", x0: 220, y0: 485, x1: 460, y1: 505 },
    { text: "FLEXIBLE DUCT", x0: 220, y0: 645, x1: 390, y1: 665 },
    { text: "FIRE DAMPER", x0: 220, y0: 745, x1: 390, y1: 765 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "CONTROL VALVE", "PRESSURE SENSOR", "FLEXIBLE DUCT", "FIRE DAMPER",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.heading === "MECHANICAL LEGEND"));
});

test("findLegendGlyphs: disconnected symbol fragments that steal two wrapped lines reunite as one auditable row despite fractional indent drift", () => {
  const segs = flat([
    seg(100, 100, 124, 100), seg(124, 100, 124, 120), seg(124, 120, 100, 120), seg(100, 120, 100, 100),
    seg(102, 126, 122, 126), seg(122, 126, 122, 142), seg(122, 142, 102, 142), seg(102, 142, 102, 126),
  ]);
  const spans: LegendSpan[] = [
    { text: "VARIABLE FREQUENCY", x0: 200.7, y0: 100, x1: 370, y1: 120 },
    { text: "DRIVE (VFD)", x0: 200, y0: 123, x1: 300, y1: 143 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxWrapGapPx: 8 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "VARIABLE FREQUENCY DRIVE (VFD)");
  assert.deepEqual(glyphs[0].caption_bbox, [[200, 100], [370, 143]]);
  assert.ok(glyphs[0].rect[1][1] >= 142, "the returned seed rect owns both disconnected fragments");
});

test("findLegendGlyphs: a touching lower indicator rejoins a tall symbol even when the complete glyph exceeds two text lines", () => {
  const tallBody = [
    seg(100, 80, 140, 80), seg(140, 80, 140, 170),
    seg(140, 170, 100, 170), seg(100, 170, 100, 80),
  ];
  const lowerIndicator = [seg(100, 172, 140, 172)];
  const spans: LegendSpan[] = [
    { text: "MOTORIZED SMOKE DAMPER", x0: 200, y0: 120, x1: 430, y1: 140 },
    { text: "NORMALLY OPEN OR CLOSED", x0: 200, y0: 144, x1: 420, y1: 164 },
  ];
  const glyphs = findLegendGlyphs(flat([...tallBody, ...lowerIndicator]), spans, {
    ...isolated, maxGlyphDimPx: 120, maxWrapGapPx: 8,
  });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "MOTORIZED SMOKE DAMPER NORMALLY OPEN OR CLOSED");
  assert.ok(glyphs[0].rect[0][1] <= 80 && glyphs[0].rect[1][1] >= 172);
});

test("findLegendGlyphs: touching complete valve rows remain separate when the upper glyph is not a page-scale tall body", () => {
  // Adjacent legend symbols can share an exact padded y boundary. That is
  // not enough to turn the second row into a wrapped caption line owned by
  // the first row, even when the upper valve includes a raised actuator.
  const upperValveBody = [
    seg(100, 90, 140, 90), seg(140, 90, 140, 110),
    seg(140, 110, 100, 110), seg(100, 110, 100, 90),
  ];
  const upperValveActuator = [
    seg(112, 115, 128, 115), seg(128, 115, 128, 125),
    seg(128, 125, 112, 125), seg(112, 125, 112, 115),
  ];
  const lowerValve = [
    seg(100, 126, 140, 126), seg(140, 126, 140, 144),
    seg(140, 144, 100, 144), seg(100, 144, 100, 126),
  ];
  const spans: LegendSpan[] = [
    { text: "BUTTERFLY VALVE", x0: 200, y0: 95, x1: 365, y1: 115 },
    { text: "CHECK VALVE", x0: 200, y0: 125, x1: 330, y1: 145 },
  ];
  const glyphs = findLegendGlyphs(flat([
    ...upperValveBody, ...upperValveActuator, ...lowerValve,
  ]), spans, {
    ...isolated, maxGlyphDimPx: 120, maxWrapGapPx: 12,
  });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), ["BUTTERFLY VALVE", "CHECK VALVE"]);
});

test("findLegendGlyphs: a disconnected glyph cannot donate one fragment to the preceding text-only legend row", () => {
  // Real Cherry Point failure: two disconnected diagonal runs form one
  // flexible-duct mark. The lower fragment wins FLEXIBLE ROUND DUCT, then
  // one-to-one assignment used to promote the upper fragment as the prior
  // ROUND DUCT DIMENSION row even though that row's mark is text, not a
  // countable vector symbol.
  const segs = flat([
    seg(100, 138, 112, 144),
    seg(96, 150, 120, 158),
  ]);
  const spans: LegendSpan[] = [
    { text: "ROUND DUCT DIMENSION", x0: 200, y0: 100, x1: 390, y1: 125 },
    { text: "FLEXIBLE ROUND DUCT", x0: 200, y0: 150, x1: 380, y1: 170 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "FLEXIBLE ROUND DUCT");
  assert.ok(glyphs[0].rect[0][1] <= 138 && glyphs[0].rect[1][1] >= 158, "both disconnected strokes are one returned glyph");
  assert.equal(glyphs[0].segments, 2);
});

test("findLegendGlyphs: a disconnected glyph fragment cannot erase line one of its own three-line caption", () => {
  // Both fragments sit on line two's physical row. The closer fragment wins
  // line two; one-to-one ownership gives the other fragment line one. When
  // geometry recovery reunites them, all three wrap lines must survive.
  const smallBox = (x: number): number[][] => [
    seg(x, 105, x + 20, 105), seg(x + 20, 105, x + 20, 125),
    seg(x + 20, 125, x, 125), seg(x, 125, x, 105),
  ];
  const segs = flat([...smallBox(100), ...smallBox(130)]);
  const spans: LegendSpan[] = [
    { text: "CONCENTRIC SQUARE TO", x0: 200, y0: 80, x1: 390, y1: 100 },
    { text: "ROUND", x0: 200, y0: 103, x1: 260, y1: 123 },
    { text: "TRANSITION", x0: 200, y0: 126, x1: 300, y1: 146 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxWrapGapPx: 8 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "CONCENTRIC SQUARE TO ROUND TRANSITION");
  assert.deepEqual(glyphs[0].caption_bbox, [[200, 80], [390, 146]]);
});

test("findLegendGlyphs: two substantial inline variants are one auditable, non-seedable symbol group", () => {
  const segs = flat([
    ...controlValveGlyph(100, 100),
    ...controlValveGlyph(185, 100),
  ]);
  const spans: LegendSpan[] = [
    { text: "3-WAY, 2-WAY CONTROL VALVE", x0: 330, y0: 145, x1: 570, y1: 170 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 260 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].kind, "symbol_group");
  assert.equal(glyphs[0].seedable, false);
  assert.equal(glyphs[0].member_rects?.length, 2);
  assert.match(glyphs[0].seed_warning || "", /anchor each intended identity separately/i);
});

test("findLegendGlyphs: a wide assembly may indent its own caption without falling out of the repeated legend column", () => {
  const pump = [
    seg(80, 300, 190, 300), seg(190, 300, 190, 360),
    seg(190, 360, 80, 360), seg(80, 360, 80, 300),
    seg(95, 315, 175, 345), seg(95, 345, 175, 315),
  ];
  const segs = flat([
    ...controlValveGlyph(100, 80),
    ...controlValveGlyph(100, 180),
    ...pump,
  ]);
  const spans: LegendSpan[] = [
    { text: "CONTROL DRAWING LEGEND", x0: 60, y0: 20, x1: 360, y1: 45 },
    { text: "CONTROL VALVE", x0: 220, y0: 125, x1: 360, y1: 145 },
    { text: "DAMPER ACTUATOR", x0: 220, y0: 225, x1: 380, y1: 245 },
    // Indented to clear the wider assembly, but still the same symbol column.
    { text: "PUMP", x0: 300, y0: 320, x1: 350, y1: 340 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 160 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), ["CONTROL VALVE", "DAMPER ACTUATOR", "PUMP"]);
  assert.equal(glyphs[2].aligned_rows, 3);
  assert.equal(glyphs[2].heading, "CONTROL DRAWING LEGEND");
});

test("legendLearnStatus: a declared symbol sheet with dense outlined CAD lettering is unsupported, never reported as a trustworthy empty legend", () => {
  const spans: LegendSpan[] = [{ text: "MECHANICAL SYMBOLS AND ABBREVIATIONS", x0: 10, y0: 10, x1: 300, y1: 30 }];
  const denseOutlinedPage = Array.from({ length: 1200 }, (_, index) => seg(index % 100, Math.floor(index / 100), index % 100 + 1, Math.floor(index / 100) + 1)).flat();
  const status = legendLearnStatus(denseOutlinedPage, spans, []);
  assert.equal(status.status, "unsupported_caption_text");
  assert.match(status.note || "", /unsupported|not present as usable PDF text/i);
});

test("legendLearnStatus: a dense P&ID cell legend with only two surviving local captions reports outlined caption text", () => {
  const spans: LegendSpan[] = [
    { text: "P&ID SYMBOL LEGEND:", x0: 100, y0: 100, x1: 400, y1: 130 },
    { text: "BACKFLOW PREVENTER", x0: 120, y0: 500, x1: 300, y1: 520 },
    { text: "SOLENOID VALVE", x0: 350, y0: 500, x1: 500, y1: 520 },
    // Extractable prose elsewhere on the same sheet must not hide the local
    // legend-caption failure.
    { text: "THE BAS SHALL MONITOR PUMP PRESSURE AND WATER FLOW", x0: 900, y0: 200, x1: 1400, y1: 220 },
  ];
  const densePage = Array.from({ length: 1200 }, (_, index) =>
    seg(index % 100, Math.floor(index / 100), index % 100 + 1, Math.floor(index / 100) + 1)).flat();
  const status = legendLearnStatus(densePage, spans, []);
  assert.equal(status.status, "unsupported_caption_text");
  assert.match(status.note || "", /fewer than three local|outlined/i);
});

test("findLegendGlyphs: routed-system line-style keys are learned but explicitly barred from discrete EA counting", () => {
  const segs = flat([
    seg(100, 100, 250, 100),
    seg(100, 160, 150, 160), seg(170, 160, 210, 160), seg(230, 160, 250, 160),
  ]);
  const spans: LegendSpan[] = [
    { text: "PIPING SYMBOLS", x0: 70, y0: 30, x1: 390, y1: 55 },
    { text: "CHILLED WATER SUPPLY", x0: 300, y0: 90, x1: 500, y1: 110 },
    { text: "HOT WATER RETURN", x0: 300, y0: 150, x1: 470, y1: 170 },
  ];
  const glyphs = findLegendGlyphs(segs, spans);
  assert.equal(glyphs.length, 2);
  assert.ok(glyphs.every((glyph) => glyph.kind === "line_style" && glyph.seedable === false));
  assert.match(glyphs[0].seed_warning || "", /not discrete EA symbols|do not send/i);
  const dashed = glyphs.find((glyph) => glyph.caption === "HOT WATER RETURN");
  assert.ok(dashed);
  assert.ok(dashed.rect[0][0] < 100 && dashed.rect[1][0] > 250, "the evidence rect owns the entire disconnected dashed swatch");
  assert.equal(dashed.segments, 3, "all three disconnected dashes belong to the learned line-style row");
});

test("findLegendGlyphs: an explicit LINE SYMBOLS section owns construction-status line keys", () => {
  const segs = flat([
    seg(100, 100, 250, 100),
    seg(100, 150, 140, 150), seg(160, 150, 200, 150), seg(220, 150, 250, 150),
    seg(100, 200, 250, 200),
    seg(100, 250, 115, 250), seg(130, 250, 145, 250), seg(160, 250, 175, 250),
    seg(190, 250, 205, 250), seg(220, 250, 235, 250),
  ]);
  const spans: LegendSpan[] = [
    { text: "LINE SYMBOLS", x0: 70, y0: 20, x1: 300, y1: 45 },
    { text: "LIGHT/SCREENED SOLID LINES INDICATE EXISTING TO REMAIN", x0: 300, y0: 90, x1: 780, y1: 110 },
    { text: "HEAVY DASHED LINES INDICATE EXISTING TO BE REMOVED", x0: 300, y0: 140, x1: 760, y1: 160 },
    { text: "HEAVY CONTINUOUS LINES INDICATE NEW WORK", x0: 300, y0: 190, x1: 690, y1: 210 },
    { text: "LIGHT DOT LINES INDICATE FUTURE WORK", x0: 300, y0: 240, x1: 650, y1: 260 },
  ];
  const glyphs = findLegendGlyphs(segs, spans);
  assert.equal(glyphs.length, 4);
  assert.ok(glyphs.every((glyph) => glyph.heading === "LINE SYMBOLS"));
  assert.ok(glyphs.every((glyph) => glyph.kind === "line_style" && glyph.seedable === false));
});

test("findLegendGlyphs: a chain of very short dashes is classified from the full swatch, not one arbitrary dash", () => {
  const segs = flat([
    seg(100, 100, 108, 100), seg(118, 100, 126, 100), seg(136, 100, 144, 100),
    seg(100, 150, 108, 150), seg(118, 150, 126, 150), seg(136, 150, 144, 150),
  ]);
  const spans: LegendSpan[] = [
    { text: "CONTROL SYMBOLS", x0: 70, y0: 20, x1: 300, y1: 45 },
    { text: "LINE VOLTAGE POWER", x0: 180, y0: 90, x1: 360, y1: 110 },
    { text: "LOW VOLTAGE SIGNAL", x0: 180, y0: 140, x1: 360, y1: 160 },
  ];
  const glyphs = findLegendGlyphs(segs, spans);
  assert.equal(glyphs.length, 2);
  assert.ok(glyphs.every((glyph) => glyph.kind === "line_style" && glyph.seedable === false && glyph.segments === 3));
  assert.ok(glyphs.every((glyph) => glyph.rect[0][0] < 100 && glyph.rect[1][0] > 144));
});

test("findLegendGlyphs: a compact multi-segment reducer remains a seedable symbol despite a shallow aspect ratio", () => {
  const reducer = [
    seg(100, 100, 175, 100), seg(100, 100, 112, 110),
    seg(112, 110, 175, 110), seg(175, 100, 175, 110),
  ];
  const spans: LegendSpan[] = [
    { text: "MECHANICAL LEGEND", x0: 70, y0: 20, x1: 320, y1: 45 },
    { text: "ECCENTRIC REDUCER", x0: 220, y0: 92, x1: 390, y1: 112 },
    { text: "PIPE REDUCER", x0: 220, y0: 142, x1: 350, y1: 162 },
  ];
  const second = reducer.map(([ax, ay, bx, by]) => seg(ax, ay + 50, bx, by + 50));
  const glyphs = findLegendGlyphs(flat([...reducer, ...second]), spans, { maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 2);
  assert.ok(glyphs.every((glyph) => glyph.kind === "symbol" && glyph.seedable === true));
});

test("findLegendGlyphs: an intact routed-system swatch may be modestly longer than a discrete glyph without admitting table rules", () => {
  const segs = flat([
    seg(100, 100, 365, 100),
    seg(100, 160, 365, 160),
    seg(20, 230, 700, 230), // true table rule: remains impossible output
  ]);
  const spans: LegendSpan[] = [
    { text: "MECHANICAL PIPING LEGEND", x0: 70, y0: 20, x1: 430, y1: 45 },
    { text: "CHILLED WATER SUPPLY", x0: 410, y0: 90, x1: 610, y1: 110 },
    { text: "CHILLED WATER RETURN", x0: 410, y0: 150, x1: 610, y1: 170 },
    { text: "NOT A LEGEND ROW", x0: 730, y0: 220, x1: 900, y1: 240 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 220 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), ["CHILLED WATER SUPPLY", "CHILLED WATER RETURN"]);
  assert.ok(glyphs.every((glyph) => glyph.kind === "line_style" && glyph.seedable === false));
});

test("findLegendGlyphs: domain system-abbreviation sections are line-key legends, not plain abbreviation tables", () => {
  const segs = flat([
    seg(100, 100, 260, 100), seg(100, 160, 260, 160),
    seg(100, 300, 260, 300), seg(100, 360, 260, 360),
  ]);
  const spans: LegendSpan[] = [
    { text: "DUCTWORK SYSTEM ABBREVIATIONS", x0: 70, y0: 20, x1: 430, y1: 45 },
    { text: "SUPPLY AIR", x0: 300, y0: 90, x1: 430, y1: 110 },
    { text: "RETURN AIR", x0: 300, y0: 150, x1: 430, y1: 170 },
    { text: "PIPING SYSTEM ABBREVIATIONS", x0: 70, y0: 220, x1: 430, y1: 245 },
    { text: "ACID WASTE", x0: 300, y0: 290, x1: 430, y1: 310 },
    { text: "NITROGEN", x0: 300, y0: 350, x1: 410, y1: 370 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "SUPPLY AIR", "RETURN AIR", "ACID WASTE", "NITROGEN",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.kind === "line_style" && !glyph.seedable));
});

test("findLegendGlyphs: an explicit HVAC piping-systems legend makes every routed swatch nonseedable", () => {
  const segs = flat([
    ...controlValveGlyph(100, 100), ...controlValveGlyph(100, 200),
    ...controlValveGlyph(100, 300),
  ]);
  const captions = [
    "REFRIGERANT LIQUID, SUCTION, & HOT GAS BYPASS",
    "STEAM- LOW PRESSURE OR ATMOSPHERIC",
    "CONDENSATE",
  ];
  const spans: LegendSpan[] = [
    { text: "HVAC PIPING SYSTEMS LEGEND", x0: 70, y0: 20, x1: 390, y1: 45 },
    ...captions.map((text, index) => ({
      text, x0: 220, y0: 145 + index * 100, x1: 650, y1: 165 + index * 100,
    })),
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), captions);
  assert.ok(glyphs.every((glyph) => glyph.kind === "line_style" && !glyph.seedable));
});

test("findLegendGlyphs: common master-MEP section titles own bounded circuiting and security vocabularies", () => {
  const segs = flat([
    seg(100, 100, 260, 100), seg(100, 160, 260, 160),
    ...controlValveGlyph(100, 300), ...controlValveGlyph(100, 380),
  ]);
  const spans: LegendSpan[] = [
    { text: "CIRCUITING", x0: 70, y0: 20, x1: 230, y1: 45 },
    { text: "ELECTRICAL CIRCUITING IN WALL", x0: 300, y0: 90, x1: 590, y1: 110 },
    { text: "ELECTRICAL CIRCUITING UNDERGROUND", x0: 300, y0: 150, x1: 650, y1: 170 },
    { text: "SECURITY", x0: 70, y0: 230, x1: 220, y1: 255 },
    { text: "CARD READER", x0: 200, y0: 345, x1: 340, y1: 365 },
    { text: "MOTION DETECTOR", x0: 200, y0: 425, x1: 370, y1: 445 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 180 });
  assert.deepEqual(glyphs.map((glyph) => [glyph.caption, glyph.heading, glyph.kind]), [
    ["ELECTRICAL CIRCUITING IN WALL", "CIRCUITING", "line_style"],
    ["ELECTRICAL CIRCUITING UNDERGROUND", "CIRCUITING", "line_style"],
    ["CARD READER", "SECURITY", "symbol"],
    ["MOTION DETECTOR", "SECURITY", "symbol"],
  ]);
});

test("findLegendGlyphs: an ANNOTATIONS convention row stays auditable and cannot seed a device count", () => {
  const segs = flat([
    ...controlValveGlyph(100, 100), ...controlValveGlyph(100, 200),
  ]);
  const spans: LegendSpan[] = [
    { text: "LIGHT CONTROLS", x0: 70, y0: 20, x1: 260, y1: 45 },
    { text: "ANNOTATIONS ('X') TYP FOR ALL SWITCH TYPES", x0: 200, y0: 145, x1: 620, y1: 165 },
    { text: "OCCUPANCY SENSOR SWITCH", x0: 200, y0: 245, x1: 450, y1: 265 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.deepEqual(glyphs.map((glyph) => [glyph.caption, glyph.kind, glyph.seedable]), [
    ["ANNOTATIONS ('X') TYP FOR ALL SWITCH TYPES", "annotation", false],
    ["OCCUPANCY SENSOR SWITCH", "symbol", true],
  ]);
});

test("findLegendGlyphs: a routed line with an outlined system code embedded in it remains a non-seedable line style", () => {
  const codedLine = [
    seg(100, 100, 365, 100),
    // Proxy for outlined CHWS lettering intersecting the line. Its text box
    // is also extractable, matching the duplicate text+outline CAD export.
    seg(210, 88, 250, 88), seg(250, 88, 250, 112),
    seg(250, 112, 210, 112), seg(210, 112, 210, 88),
  ];
  const spans: LegendSpan[] = [
    { text: "MECHANICAL PIPING LEGEND", x0: 70, y0: 20, x1: 430, y1: 45 },
    { text: "CHWS", x0: 210, y0: 88, x1: 250, y1: 112 },
    { text: "CHILLED WATER SUPPLY PIPING", x0: 410, y0: 88, x1: 680, y1: 112 },
    { text: "HHWS", x0: 210, y0: 148, x1: 250, y1: 172 },
    { text: "HEATING HOT WATER SUPPLY PIPING", x0: 410, y0: 148, x1: 720, y1: 172 },
  ];
  const second = codedLine.map(([ax, ay, bx, by]) => seg(ax, ay + 60, bx, by + 60));
  const glyphs = findLegendGlyphs(flat([...codedLine, ...second]), spans, { maxGlyphDimPx: 220 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), ["CHILLED WATER SUPPLY PIPING", "HEATING HOT WATER SUPPLY PIPING"]);
  assert.ok(glyphs.every((glyph) => glyph.kind === "line_style" && glyph.seedable === false));
});

test("findLegendGlyphs: repeated vertical diagram risers beside sequence prose are not horizontal routed-system legend keys", () => {
  const segs: number[][] = [];
  const spans: LegendSpan[] = [];
  for (let row = 0; row < 15; row++) {
    const y = 100 + row * 45;
    segs.push(seg(100, y, 100, y + 30));
    spans.push({ text: `SEQUENCE STEP ${row + 1} SHALL MODULATE THE VALVE`, x0: 180, y0: y + 5, x1: 520, y1: y + 25 });
  }
  assert.deepEqual(findLegendGlyphs(flat(segs), spans), []);
});

test("findLegendGlyphs: a heading cannot bless an unrelated aligned criteria table below a vertical section break", () => {
  const segs: number[][] = [];
  const spans: LegendSpan[] = [
    { text: "CONTROL SYMBOLS", x0: 70, y0: 20, x1: 330, y1: 45 },
    { text: "HVAC DESIGN CRITERIA", x0: 70, y0: 525, x1: 390, y1: 555 },
  ];
  for (let row = 0; row < 3; row++) {
    const y = 100 + row * 100;
    segs.push(...controlValveGlyph(100, y));
    spans.push({ text: ["CONTROL VALVE", "DAMPER ACTUATOR", "PRESSURE SENSOR"][row], x0: 220, y0: y + 20, x1: 390, y1: y + 40 });
  }
  // Same apparent columns, but a separate design-criteria panel after a
  // section-sized gap. These are values beside small table-cell graphics,
  // not additional legend rows.
  for (let row = 0; row < 15; row++) {
    const y = 600 + row * 35;
    segs.push(seg(100, y, 125, y), seg(125, y, 125, y + 18), seg(125, y + 18, 100, y + 18), seg(100, y + 18, 100, y));
    spans.push({ text: `${50 + row}% RH`, x0: 220, y0: y, x1: 290, y1: y + 18 });
  }
  const glyphs = findLegendGlyphs(flat(segs), spans, { maxGlyphDimPx: 120 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), ["CONTROL VALVE", "DAMPER ACTUATOR", "PRESSURE SENSOR"]);
  assert.ok(glyphs.every((glyph) => glyph.aligned_rows === 3));
});

test("findLegendGlyphs: a headerless numbered general-notes column is not a symbol legend even when it has HVAC words", () => {
  const segs: number[][] = [];
  const spans: LegendSpan[] = [];
  for (let row = 0; row < 18; row++) {
    const y = 80 + row * 45;
    segs.push(seg(100, y, 125, y), seg(125, y, 125, y + 22), seg(125, y + 22, 100, y + 22), seg(100, y + 22, 100, y));
    spans.push({ text: `CONTRACTOR SHALL PROVIDE AND INSTALL CONTROL VALVE ${row + 1} WHERE REQUIRED`, x0: 180, y0: y, x1: 650, y1: y + 22 });
  }
  assert.deepEqual(findLegendGlyphs(flat(segs), spans), []);
});

test("findLegendGlyphs: gradual x drift across a diagram cannot transitively chain unrelated columns into one headerless legend", () => {
  const segs: number[][] = [];
  const spans: LegendSpan[] = [];
  for (let row = 0; row < 15; row++) {
    const y = 80 + row * 45;
    const captionX = 250 + row * 50;
    const glyphX = captionX - 100;
    segs.push(
      seg(glyphX, y, glyphX + 20, y), seg(glyphX + 20, y, glyphX + 20, y + 20),
      seg(glyphX + 20, y + 20, glyphX, y + 20), seg(glyphX, y + 20, glyphX, y),
    );
    spans.push({ text: `CONTROL DAMPER ${row + 1}`, x0: captionX, y0: y, x1: captionX + 180, y1: y + 20 });
  }
  assert.deepEqual(findLegendGlyphs(flat(segs), spans, { maxGlyphDimPx: 120, maxCaptionGapPx: 150 }), []);
});

test("findLegendGlyphs: drafting references and control-link tags remain auditable annotations but can never seed EA counts", () => {
  const segs = flat([
    ...controlValveGlyph(100, 100),
    ...controlValveGlyph(100, 300),
    ...controlValveGlyph(100, 500),
    ...controlValveGlyph(100, 700),
    ...controlValveGlyph(100, 900),
    ...controlValveGlyph(100, 1100),
    ...controlValveGlyph(100, 1300),
    ...controlValveGlyph(100, 1500),
  ]);
  const spans: LegendSpan[] = [
    { text: "HVAC SYMBOL LEGEND", x0: 70, y0: 20, x1: 390, y1: 45 },
    { text: "REVISION REFERENCE", x0: 220, y0: 145, x1: 390, y1: 165 },
    { text: "DETAIL REFERENCE", x0: 220, y0: 345, x1: 390, y1: 365 },
    { text: "SHEET NOTE CALLOUT", x0: 220, y0: 545, x1: 390, y1: 565 },
    { text: "INTERLOCK TO FAN", x0: 220, y0: 745, x1: 390, y1: 765 },
    { text: "CONNECTION TO DDC BY T.C.", x0: 220, y0: 945, x1: 470, y1: 965 },
    { text: "CONTROL ELEMENT TAG", x0: 220, y0: 1145, x1: 440, y1: 1165 },
    { text: "POINT NAME'S IDENTIFICATION (CORRESPONDS TO CONTROL ABBREVIATIONS)", x0: 220, y0: 1345, x1: 760, y1: 1365 },
    { text: "POINT NAME'S INDENIFICATION (AS DRAWN WITH A SOURCE TYPO)", x0: 220, y0: 1545, x1: 720, y1: 1565 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 8);
  assert.ok(glyphs.every((glyph) => glyph.kind === "annotation" && glyph.seedable === false));
  assert.ok(glyphs.every((glyph) => /not installed devices/i.test(glyph.seed_warning || "")));
});

test("findLegendGlyphs: routing conventions and equipment callouts are annotations, not installed-device sweep seeds", () => {
  const captions = [
    "SHEET NOTE",
    "CONDUIT, VERTICAL TRANSITION",
    "CONDUIT CAPPED",
    "HOME RUN",
    "FEEDER CALLOUT",
    "MECHANICAL EQUIPMENT CALLOUT",
    "DUCTWORK BREAK",
    "DUCTWORK OR PIPING RISE",
    "INTAKE OR EXHAUST",
    "DIRECTION OF AIRFLOW",
    "DIRECTION OF FLOW",
    "SUPPLY AIRFLOW",
    "RETURN, EXHAUST, OR TRANSFER AIRFLOW",
    "INCLINED RISE WITH RESPECT TO AIRFLOW",
    "DECLINED DROP WITH RESPECT TO AIRFLOW",
    "FLOW DIRECTION",
    "DOWNWARD DIRECTION OF SLOPED PIPING",
    "NEW TO EXISTING CONNECTION POINT",
    "SLOPE PIPE IN DIRECTION OF ARROW",
    "CONSTRUCTION NOTE IDENTIFICATION",
    "POINT OF DEMOLITION",
    "POINT OF CONNECTION, NEW-TO-EXISTING",
    "LIGHTING FIXTURE TAGS. 'A' INDICATES FIXTURE TYPE.",
    "RECEPTACLE DEVICE TAG: 'GFI' INDICATES PROTECTION.",
    "DEVIATIONS OF THE ABOVE RECEPTACLE TYPES",
    "• INTERNAL ARC FAULT (AFI) PROTECTION.",
    "ELECTRICAL EQUIPMENT AND TAGS",
    "CONNECTION TO CONDUCTOR",
    "CONNECTION TO STRUCTURE",
    "HOMERUNS TO PANEL. PANEL AND CIRCUIT DESIGNATIONS AS INDICATED.",
    "EQUIPMENT CONNECTION AS NOTED. PROVIDE REQUIRED COMPONENTS.",
    "REMOVE TO THIS POINT",
    "CONNECT NEW TO EXISTING",
  ];
  const segs = flat(captions.flatMap((_, index) => controlValveGlyph(100, 100 + index * 200)));
  const spans: LegendSpan[] = [
    { text: "CONTROL SYMBOLS", x0: 70, y0: 20, x1: 390, y1: 45 },
    ...captions.map((text, index) => ({ text, x0: 220, y0: 145 + index * 200, x1: 500, y1: 165 + index * 200 })),
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), captions);
  assert.ok(glyphs.every((glyph) => glyph.kind === "annotation" && glyph.seedable === false));
});

test("findLegendGlyphs: electrical conductor keys remain learned but cannot seed installed-device counts", () => {
  const captions = [
    "LPS ROOF CONDUCTOR",
    "LPS MAIN DOWN CONDUCTOR",
    "GROUND RING (EARTH ELECTRODE SUBSYSTEM) CONDUCTOR",
    "BRANCH CIRCUIT OR FEEDER WIRING IN CONDUIT. CONDUCTORS AS INDICATED.",
  ];
  const segs = flat(captions.flatMap((_, index) => [
    seg(100, 100 + index * 100, 210, 100 + index * 100),
  ]));
  const spans: LegendSpan[] = captions.map((text, index) => ({
    text, x0: 250, y0: 90 + index * 100, x1: 720, y1: 110 + index * 100,
  }));
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 160 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), captions);
  assert.ok(glyphs.every((glyph) => glyph.kind === "line_style" && glyph.seedable === false));
});

test("findLegendGlyphs: named electrical sections preserve side-by-side physical variants as a nonseedable group", () => {
  const segs = flat([
    ...controlValveGlyph(100, 100),
    ...controlValveGlyph(230, 100),
  ]);
  const spans: LegendSpan[] = [
    { text: "LIGHTING", x0: 70, y0: 20, x1: 250, y1: 45 },
    { text: "EMERGENCY LIGHTING FIXTURE", x0: 420, y0: 145, x1: 690, y1: 170 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 320 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].kind, "symbol_group");
  assert.equal(glyphs[0].seedable, false);
});

test("findLegendGlyphs: a fixture caption that declares a bracket rendition cannot collapse its variants into one sweep seed", () => {
  const segs = flat([
    ...controlValveGlyph(100, 100),
    ...controlValveGlyph(185, 100),
  ]);
  const spans: LegendSpan[] = [{
    text: "LIGHTING FIXTURE (INDICATES BRACKET, WALL MOUNTED FIXTURES)",
    x0: 330, y0: 145, x1: 810, y1: 170,
  }];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 260 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].kind, "symbol_group");
  assert.equal(glyphs[0].seedable, false);
});

test("findLegendGlyphs: routed-medium captions keep hooked solid swatches out of discrete EA sweeps", () => {
  const captions = [
    "CHILLED WATER SUPPLY", "DOMESTIC COLD WATER (CW)", "STORM DRAIN",
    "SUPPLY AIR", "RETURN AIR", "CONDENSATE DRAIN", "REFRIGERANT SUCTION/LIQUID",
    "RECTANGULAR DUCT RECTANGULAR DUCT WIDTHxHEIGHT (INCHES)",
    "PIPE PIPE (DIAMETER AND SYSTEM ABBREVIATION)",
    "FLEXIBLE DUCT", "ACOUSTICALLY LINED DUCTWORK", "CABLE TRAY",
    "UNDERFLOOR DUCT", "J-HOOK COMMUNICATION PATHWAY",
    "MULTI-OUTLET ASSEMBLY WITH DATA RECEPTACLES", "CABLE",
    "EXISTING ELECTRICAL CIRCUITING IN WALL, UNDERFLOOR OR ABOVE CEILING",
  ];
  const segs = flat(captions.flatMap((_, index) => [
    seg(100, 100 + index * 100, 200, 100 + index * 100),
    seg(200, 100 + index * 100, 200, 120 + index * 100),
    seg(200, 120 + index * 100, 100, 120 + index * 100),
    seg(100, 120 + index * 100, 100, 100 + index * 100),
  ]));
  const spans: LegendSpan[] = captions.map((text, index) => ({
    text, x0: 240, y0: 100 + index * 100, x1: 440, y1: 120 + index * 100,
  }));
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), captions);
  assert.ok(glyphs.every((glyph) => glyph.kind === "line_style" && glyph.seedable === false));
});

test("findLegendGlyphs: a device located in piping remains a discrete symbol, not a routed medium", () => {
  const segs = flat(controlValveGlyph(100, 100));
  const spans: LegendSpan[] = [
    { text: "VALVE IN VERTICAL PIPING", x0: 220, y0: 145, x1: 450, y1: 165 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, isolated);
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].kind, "symbol");
  assert.equal(glyphs[0].seedable, true);
});

test("findLegendGlyphs: a routed dashed swatch expands left from a compact end hook", () => {
  const segs = flat([
    seg(100, 110, 125, 110), seg(135, 110, 160, 110),
    seg(180, 100, 200, 100), seg(200, 100, 200, 120),
    seg(200, 120, 180, 120), seg(180, 120, 180, 100),
  ]);
  const spans: LegendSpan[] = [
    { text: "CONDENSATE DRAIN LINE", x0: 220, y0: 100, x1: 430, y1: 120 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].kind, "line_style");
  assert.ok(glyphs[0].rect[0][0] < 110, "the evidence covers the complete dashed swatch, not only its end hook");
});

test("findLegendGlyphs: a sparse physical device stays a symbol identity but cannot seed a sweep", () => {
  const segs = flat([seg(100, 110, 125, 110), seg(135, 110, 160, 110)]);
  const spans: LegendSpan[] = [
    { text: "MOTORIZED DAMPER", x0: 220, y0: 100, x1: 390, y1: 120 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].kind, "symbol");
  assert.equal(glyphs[0].seedable, false);
  assert.match(glyphs[0].seed_warning || "", /sparse line fragment/i);
});

test("findLegendGlyphs: a line-fragment anchor recovers nearby discrete device geometry before seedability is decided", () => {
  const segs = flat([
    seg(100, 110, 180, 110),
    seg(120, 118, 140, 138), seg(140, 138, 120, 138), seg(120, 138, 120, 118),
  ]);
  const spans: LegendSpan[] = [
    { text: "STRAINER", x0: 220, y0: 100, x1: 320, y1: 120 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].kind, "symbol");
  assert.equal(glyphs[0].seedable, true);
  assert.ok(glyphs[0].segments >= 4);
});

test("findLegendGlyphs: a quantization-split wide duct carrier reunites both end posts and parallel rails", () => {
  const rowY = 1700;
  const endPost = (x: number, y0: number, y1: number, direction: -1 | 1): number[][] => {
    const mid = (y0 + y1) / 2;
    return [
      seg(x, y0, x, mid - 4),
      seg(x, mid - 4, x + direction * 2, mid - 2),
      seg(x + direction * 2, mid - 2, x - direction * 2, mid + 2),
      seg(x - direction * 2, mid + 2, x, mid + 4),
      seg(x, mid + 4, x, y1),
    ];
  };
  const segs = flat([
    ...endPost(100, rowY, rowY + 40, -1),
    ...endPost(240, rowY, rowY + 40, 1),
    // The 3px endpoint gaps reproduce CAD coordinates that quantize into
    // four disconnected components even though the rendered carrier closes.
    // The row is also deliberately 80+ text heights below its heading, as
    // it was in the real long mechanical legend that exposed this bug.
    seg(103, rowY, 237, rowY),
    seg(103, rowY + 40, 237, rowY + 40),
  ]);
  const spans: LegendSpan[] = [
    { text: "HVAC SYMBOLS", x0: 70, y0: 20, x1: 250, y1: 40 },
    { text: "20\"X12\"", x0: 140, y0: rowY + 10, x1: 205, y1: rowY + 30 },
    { text: "FLAT OVAL DUCT (WIDTH X HEIGHT)", x0: 280, y0: rowY + 10, x1: 560, y1: rowY + 30 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 220 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption, "FLAT OVAL DUCT (WIDTH X HEIGHT)");
  assert.equal(glyphs[0].kind, "line_style");
  assert.equal(glyphs[0].seedable, false);
  assert.ok(glyphs[0].rect[0][0] < 100 && glyphs[0].rect[1][0] > 240,
    "the evidence spans both rendered end posts, not only the nearest edge");
  assert.ok(glyphs[0].rect[0][1] < rowY + 1 && glyphs[0].rect[1][1] > rowY + 39,
    "the evidence spans both parallel rails");
  assert.ok((glyphs[0].member_rects?.length ?? 0) >= 4,
    "all disconnected carrier components remain auditable");
});

test("findLegendGlyphs: a generic tagged carrier remains one physical identity eligible for mandatory plan-anchor corroboration", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 140, y), seg(140, y, 140, y + 30),
    seg(140, y + 30, 100, y + 30), seg(100, y + 30, 100, y),
  ];
  const segs = flat([...box(100), ...box(180)]);
  const spans: LegendSpan[] = [
    { text: "CONTROL DEVICE LEGEND", x0: 70, y0: 20, x1: 420, y1: 45 },
    { text: "CT", x0: 110, y0: 105, x1: 130, y1: 125 },
    { text: "CURRENT TRANSMITTER", x0: 220, y0: 105, x1: 430, y1: 125 },
    { text: "DP", x0: 110, y0: 185, x1: 130, y1: 205 },
    { text: "DIFFERENTIAL PRESSURE SENSOR", x0: 220, y0: 185, x1: 500, y1: 205 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 2);
  assert.ok(glyphs.every((glyph) => glyph.kind === "symbol" && glyph.seedable));
  assert.ok(glyphs.every((glyph) => !glyph.seed_warning));
});

test("findLegendGlyphs: an inner actuator tag does not block a geometry-rich physical assembly from direct seeding", () => {
  const damper = (y: number): number[][] => [
    seg(100, y + 20, 210, y + 20),
    seg(130, y, 150, y + 40), seg(150, y, 130, y + 40),
    seg(160, y + 5, 180, y + 5), seg(180, y + 5, 180, y + 25),
    seg(180, y + 25, 160, y + 25), seg(160, y + 25, 160, y + 5),
  ];
  const segs = flat([...damper(90), ...damper(190)]);
  const spans: LegendSpan[] = [
    { text: "CONTROL DEVICE LEGEND", x0: 70, y0: 20, x1: 420, y1: 45 },
    { text: "M", x0: 165, y0: 98, x1: 175, y1: 118 },
    { text: "MOTORIZED OPPOSED BLADE DAMPER", x0: 240, y0: 100, x1: 520, y1: 120 },
    { text: "M", x0: 165, y0: 198, x1: 175, y1: 218 },
    { text: "MOTORIZED PARALLEL BLADE DAMPER", x0: 240, y0: 200, x1: 520, y1: 220 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 140 });
  assert.equal(glyphs.length, 2);
  assert.ok(glyphs.every((glyph) => glyph.kind === "symbol" && glyph.seedable));
  assert.ok(glyphs.every((glyph) => !glyph.seed_warning));
});

test("findLegendGlyphs: explicit single-line and double-line section variants are a nonseedable symbol group", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 24, y), seg(x + 24, y, x + 24, y + 20),
    seg(x + 24, y + 20, x, y + 20), seg(x, y + 20, x, y),
  ];
  const segs = flat([
    ...box(100, 100), ...box(210, 100),
    ...box(100, 180), ...box(210, 180),
  ]);
  const spans: LegendSpan[] = [
    { text: "DUCTWORK", x0: 70, y0: 20, x1: 330, y1: 45 },
    { text: "SUPPLY DUCT TURN DOWN", x0: 300, y0: 100, x1: 520, y1: 120 },
    { text: "RETURN DUCT TURN DOWN", x0: 300, y0: 180, x1: 520, y1: 200 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 180 });
  assert.equal(glyphs.length, 2);
  assert.ok(glyphs.every((glyph) => glyph.kind === "symbol_group" && !glyph.seedable));
  assert.ok(glyphs.every((glyph) => glyph.member_rects?.length === 2));
});

test("findLegendGlyphs: inline pipe devices may span eleven text heights without being clipped as oversized", () => {
  const inlineDevice = (y: number): number[][] => [
    seg(100, y + 20, 310, y + 20),
    seg(200, y, 210, y), seg(210, y, 210, y + 40),
    seg(210, y + 40, 200, y + 40), seg(200, y + 40, 200, y),
  ];
  const segs = flat([...inlineDevice(90), ...inlineDevice(190)]);
  const spans: LegendSpan[] = [
    { text: "CONTROL SYMBOLS", x0: 70, y0: 20, x1: 440, y1: 45 },
    { text: "PIPE ANCHOR", x0: 340, y0: 100, x1: 470, y1: 120 },
    { text: "PIPE GUIDE", x0: 340, y0: 200, x1: 460, y1: 220 },
  ];
  const glyphs = findLegendGlyphs(segs, spans);
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), ["PIPE ANCHOR", "PIPE GUIDE"]);
  assert.ok(glyphs.every((glyph) => glyph.kind === "symbol" && glyph.seedable));
});

test("findLegendGlyphs: a headed two-dimensional RCP legend pairs multiple columns of symbols with centered captions below", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 30, y), seg(x + 30, y, x + 30, y + 30),
    seg(x + 30, y + 30, x, y + 30), seg(x, y + 30, x, y),
  ];
  const segs = flat([
    ...box(100, 100), ...box(300, 100),
    ...box(100, 260), ...box(300, 260),
  ]);
  const spans: LegendSpan[] = [
    { text: "RCP LEGEND", x0: 80, y0: 20, x1: 380, y1: 45 },
    { text: "SUPPLY GRILLE", x0: 75, y0: 150, x1: 165, y1: 170 },
    { text: "RETURN GRILLE", x0: 270, y0: 150, x1: 370, y1: 170 },
    { text: "SMOKE DETECTOR", x0: 70, y0: 310, x1: 170, y1: 330 },
    { text: "OCCUPANCY SENSOR", x0: 265, y0: 310, x1: 375, y1: 330 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 80 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "SUPPLY GRILLE", "RETURN GRILLE", "SMOKE DETECTOR", "OCCUPANCY SENSOR",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.heading === "RCP LEGEND" && glyph.aligned_rows === 4));
});

test("findLegendGlyphs: the same below-caption cell grid without an explicit legend heading is rejected", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 30, y), seg(x + 30, y, x + 30, y + 30),
    seg(x + 30, y + 30, x, y + 30), seg(x, y + 30, x, y),
  ];
  const segs = flat([...box(100, 100), ...box(300, 100), ...box(100, 260)]);
  const spans: LegendSpan[] = [
    { text: "SUPPLY GRILLE", x0: 75, y0: 150, x1: 165, y1: 170 },
    { text: "RETURN GRILLE", x0: 270, y0: 150, x1: 370, y1: 170 },
    { text: "SMOKE DETECTOR", x0: 70, y0: 310, x1: 170, y1: 330 },
  ];
  assert.deepEqual(findLegendGlyphs(segs, spans, { maxGlyphDimPx: 80 }), []);
});

test("findLegendGlyphs: a generic mechanical legend heading cannot annex a remote below-caption title block", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 30, y), seg(x + 30, y, x + 30, y + 30),
    seg(x + 30, y + 30, x, y + 30), seg(x, y + 30, x, y),
  ];
  const segs = flat([
    ...box(100, 100), ...box(100, 180),
    ...box(600, 600), ...box(800, 600),
  ]);
  const spans: LegendSpan[] = [
    { text: "MECHANICAL SYMBOLS", x0: 70, y0: 20, x1: 430, y1: 45 },
    { text: "SUPPLY AIR SENSOR", x0: 220, y0: 105, x1: 410, y1: 125 },
    { text: "RETURN AIR SENSOR", x0: 220, y0: 185, x1: 410, y1: 205 },
    { text: "REFER TO ARCHITECTURAL REFLECTED CEILING PLANS FOR EXACT DEVICE LOCATIONS", x0: 500, y0: 400, x1: 1100, y1: 420 },
    // Repeated boxes above text elsewhere on the sheet are not owned by the
    // normal right-caption legend merely because that legend has a heading.
    { text: "PROJECT NO", x0: 570, y0: 650, x1: 690, y1: 670 },
    { text: "DRAWING NO", x0: 770, y0: 650, x1: 890, y1: 670 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 80 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "SUPPLY AIR SENSOR", "RETURN AIR SENSOR",
  ]);
});

test("findLegendGlyphs: named electrical sections own their rows, including a bounded one-row subsection", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 30, y), seg(x + 30, y, x + 30, y + 30),
    seg(x + 30, y + 30, x, y + 30), seg(x, y + 30, x, y),
  ];
  const segs = flat([...box(100, 100), ...box(100, 180), ...box(500, 340)]);
  const spans: LegendSpan[] = [
    { text: "FIRE ALARM", x0: 70, y0: 20, x1: 300, y1: 45 },
    { text: "DUCT SMOKE DETECTOR", x0: 220, y0: 105, x1: 430, y1: 125 },
    { text: "SMOKE DETECTOR, CEILING MOUNTED", x0: 220, y0: 185, x1: 520, y1: 205 },
    { text: "TELEPHONE & DATA SYSTEMS", x0: 470, y0: 260, x1: 850, y1: 285 },
    { text: "WIRELESS ACCESS POINT LOCATION", x0: 620, y0: 345, x1: 900, y1: 365 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 80 });
  assert.deepEqual(glyphs.map((glyph) => [glyph.caption, glyph.heading, glyph.aligned_rows]), [
    ["DUCT SMOKE DETECTOR", "FIRE ALARM", 2],
    ["SMOKE DETECTOR, CEILING MOUNTED", "FIRE ALARM", 2],
    ["WIRELESS ACCESS POINT LOCATION", "TELEPHONE & DATA SYSTEMS", 1],
  ]);
});

test("findLegendGlyphs: compact EQUIPMENT and ONE-LINE DIAGRAM sections are bounded symbol vocabularies", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 30, y), seg(x + 30, y, x + 30, y + 30),
    seg(x + 30, y + 30, x, y + 30), seg(x, y + 30, x, y),
  ];
  const segs = flat([
    ...box(100, 100), ...box(100, 180), ...box(100, 260), ...box(100, 340),
    ...box(500, 340), ...box(500, 420),
  ]);
  const spans: LegendSpan[] = [
    { text: "EQUIPMENT", x0: 70, y0: 20, x1: 260, y1: 45 },
    { text: "JUNCTION BOX", x0: 220, y0: 105, x1: 380, y1: 125 },
    { text: "VARIABLE FREQUENCY DRIVE", x0: 220, y0: 185, x1: 500, y1: 205 },
    { text: "PANELBOARD, BRANCH", x0: 220, y0: 265, x1: 450, y1: 285 },
    { text: "DISCONNECT SWITCH", x0: 220, y0: 345, x1: 430, y1: 365 },
    { text: "ONE-LINE DIAGRAM", x0: 470, y0: 260, x1: 760, y1: 285 },
    { text: "CIRCUIT BREAKER", x0: 620, y0: 345, x1: 800, y1: 365 },
    { text: "TRANSFORMER", x0: 620, y0: 425, x1: 760, y1: 445 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 80 });
  assert.deepEqual(glyphs.map((glyph) => [glyph.caption, glyph.heading]), [
    ["JUNCTION BOX", "EQUIPMENT"],
    ["VARIABLE FREQUENCY DRIVE", "EQUIPMENT"],
    ["PANELBOARD, BRANCH", "EQUIPMENT"],
    ["DISCONNECT SWITCH", "EQUIPMENT"],
    ["CIRCUIT BREAKER", "ONE-LINE DIAGRAM"],
    ["TRANSFORMER", "ONE-LINE DIAGRAM"],
  ]);
});

test("findLegendGlyphs: a bare EQUIPMENT label cannot bless a two-row tag example", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 150, y), seg(150, y, 150, y + 20),
    seg(150, y + 20, 100, y + 20), seg(100, y + 20, 100, y),
  ];
  const spans: LegendSpan[] = [
    { text: "EQUIPMENT", x0: 70, y0: 20, x1: 260, y1: 45 },
    { text: "VAV-XX TYPE", x0: 220, y0: 100, x1: 390, y1: 120 },
    { text: "NUMBER", x0: 220, y0: 140, x1: 320, y1: 160 },
  ];
  assert.deepEqual(findLegendGlyphs(flat([...box(100), ...box(140)]), spans), []);
});

test("findLegendGlyphs: explanatory prose containing 'components' cannot impersonate a section heading", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 130, y), seg(130, y, 130, y + 30),
    seg(130, y + 30, 100, y + 30), seg(100, y + 30, 100, y),
  ];
  const segs = flat([...box(100), ...box(180)]);
  const spans: LegendSpan[] = [
    { text: "EQUIPMENT CONNECTIONS", x0: 70, y0: 20, x1: 400, y1: 45 },
    { text: "EQUIPMENT MARK - SEE EQUIPMENT CONNECTION SCHEDULE SHEET EP701.", x0: 220, y0: 60, x1: 760, y1: 80 },
    { text: "REQUIRED COMPONENTS FOR THE OPERATION OF THE EQUIPMENT MUST BE", x0: 220, y0: 105, x1: 760, y1: 125 },
    { text: "JUNCTION BOX", x0: 220, y0: 185, x1: 350, y1: 205 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 80 });
  assert.equal(glyphs.length, 2);
  assert.ok(glyphs.every((glyph) => glyph.heading === "EQUIPMENT CONNECTIONS"));
  assert.doesNotMatch(glyphs[0].caption, /EQUIPMENT MARK/);
});

test("findLegendGlyphs: a named equipment section retains a long wrapped definition without consuming the next symbol row", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 130, y), seg(130, y, 130, y + 30),
    seg(130, y + 30, 100, y + 30), seg(100, y + 30, 100, y),
  ];
  const segs = flat([...box(150), ...box(330)]);
  const spans: LegendSpan[] = [
    { text: "EQUIPMENT CONNECTIONS", x0: 70, y0: 20, x1: 400, y1: 45 },
    { text: "EQUIPMENT CONNECTION AS NOTED.", x0: 300, y0: 80, x1: 600, y1: 100 },
    { text: "DISCONNECT SWITCHES, STARTERS, AND OTHER", x0: 300, y0: 104, x1: 680, y1: 124 },
    { text: "REQUIRED COMPONENTS FOR OPERATION MUST BE", x0: 220, y0: 128, x1: 610, y1: 148 },
    { text: "FURNISHED BY THE MECHANICAL CONTRACTOR.", x0: 220, y0: 152, x1: 590, y1: 172 },
    { text: "PROVIDE CONDUIT AND WIRING FROM SOURCE", x0: 220, y0: 176, x1: 590, y1: 196 },
    { text: "RATING (SEE LEGEND NOTE 5).", x0: 220, y0: 200, x1: 500, y1: 220 },
    { text: "TO THE FINAL EQUIPMENT CONNECTION.", x0: 220, y0: 224, x1: 540, y1: 244 },
    { text: "JUNCTION BOX", x0: 220, y0: 335, x1: 350, y1: 355 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 80 });
  assert.equal(glyphs.length, 2);
  assert.match(glyphs[0].caption, /^EQUIPMENT CONNECTION AS NOTED\./);
  assert.match(glyphs[0].caption, /SEE LEGEND NOTE 5/);
  assert.match(glyphs[0].caption, /FINAL EQUIPMENT CONNECTION\.$/);
  assert.equal(glyphs[1].caption, "JUNCTION BOX");
});

test("findLegendGlyphs: an incomplete drafting sentence reunites a tightly stacked tag fragment with its wrapped definition", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 150, y), seg(150, y, 150, y + 20),
    seg(150, y + 20, 100, y + 20), seg(100, y + 20, 100, y),
  ];
  const segs = flat([...box(100), ...box(128)]);
  const spans: LegendSpan[] = [
    { text: "EQUIPMENT CONNECTIONS", x0: 70, y0: 20, x1: 360, y1: 45 },
    { text: "HOMERUN TO PANELBOARD. NUMERALS ADJACENT TO ARROW HEADS INDICATE ASSIGNED", x0: 220, y0: 100, x1: 760, y1: 120 },
    { text: "PANEL AND CIRCUIT NUMBERS. SEE PANEL SCHEDULE.", x0: 220, y0: 124, x1: 610, y1: 144 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { ...isolated, maxGlyphDimPx: 100 });
  assert.equal(glyphs.length, 1);
  assert.equal(glyphs[0].caption,
    "HOMERUN TO PANELBOARD. NUMERALS ADJACENT TO ARROW HEADS INDICATE ASSIGNED PANEL AND CIRCUIT NUMBERS. SEE PANEL SCHEDULE.");
  assert.equal(glyphs[0].kind, "annotation");
  assert.equal(glyphs[0].seedable, false);
});

test("findLegendGlyphs: neighboring cell tags cannot steal descriptive below captions, and RCP conventions stay nonseedable", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 30, y), seg(x + 30, y, x + 30, y + 30),
    seg(x + 30, y + 30, x, y + 30), seg(x, y + 30, x, y),
  ];
  const segs = flat([...box(100, 100), ...box(300, 100), ...box(500, 100)]);
  const spans: LegendSpan[] = [
    { text: "MECHANICAL RCP LEGEND", x0: 80, y0: 20, x1: 580, y1: 45 },
    // Same-row terse tags belong to neighboring/internal cell notation.
    { text: "EXP", x0: 190, y0: 105, x1: 225, y1: 125 },
    { text: "CLG", x0: 390, y0: 105, x1: 425, y1: 125 },
    { text: "CEILING HEIGHT", x0: 70, y0: 150, x1: 170, y1: 170 },
    { text: "EXPOSED CEILING", x0: 265, y0: 150, x1: 375, y1: 170 },
    { text: "SMOKE DETECTOR", x0: 465, y0: 150, x1: 575, y1: 170 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 80 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "CEILING HEIGHT", "EXPOSED CEILING", "SMOKE DETECTOR",
  ]);
  assert.deepEqual(glyphs.slice(0, 2).map((glyph) => [glyph.kind, glyph.seedable]), [
    ["annotation", false], ["annotation", false],
  ]);
});

test("findLegendGlyphs: a headed RCP cell keeps side-by-side variants as one nonseedable symbol group", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 24, y), seg(x + 24, y, x + 24, y + 24),
    seg(x + 24, y + 24, x, y + 24), seg(x, y + 24, x, y),
  ];
  const segs = flat([...box(80, 100), ...box(130, 100), ...box(320, 100)]);
  const spans: LegendSpan[] = [
    { text: "RCP LEGEND", x0: 60, y0: 20, x1: 380, y1: 45 },
    { text: "SUPPLY GRILLE", x0: 70, y0: 150, x1: 180, y1: 170 },
    { text: "SMOKE DETECTOR", x0: 280, y0: 150, x1: 390, y1: 170 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 80 });
  assert.equal(glyphs.length, 2);
  assert.equal(glyphs[0].caption, "SUPPLY GRILLE");
  assert.equal(glyphs[0].kind, "symbol_group");
  assert.equal(glyphs[0].seedable, false);
  assert.equal(glyphs[0].member_rects?.length, 2);
});

test("findLegendGlyphs: a mixed RCP panel prefers a complete right-caption hatch over a sparse above-caption fragment", () => {
  const box = (x: number, y: number, size = 30): number[][] => [
    seg(x, y, x + size, y), seg(x + size, y, x + size, y + size),
    seg(x + size, y + size, x, y + size), seg(x, y + size, x, y),
  ];
  const fullHatch = box(100, 300, 70);
  const sparseTopFragment = [seg(218, 280, 240, 280), seg(220, 282, 238, 282)];
  const segs = flat([
    ...box(100, 100), ...box(320, 100), ...box(520, 250),
    ...fullHatch, ...sparseTopFragment,
  ]);
  const spans: LegendSpan[] = [
    { text: "RCP LEGEND", x0: 60, y0: 20, x1: 600, y1: 45 },
    { text: "SUPPLY GRILLE", x0: 70, y0: 150, x1: 170, y1: 170 },
    { text: "SMOKE DETECTOR", x0: 285, y0: 150, x1: 390, y1: 170 },
    { text: "OCCUPANCY SENSOR", x0: 480, y0: 300, x1: 590, y1: 320 },
    { text: "GWB CEILING / SOFFIT", x0: 250, y0: 300, x1: 430, y1: 320 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 90 });
  const hatch = glyphs.find((glyph) => glyph.caption === "GWB CEILING / SOFFIT");
  assert.ok(hatch);
  assert.equal(glyphs.length, 4);
  assert.ok(hatch.rect[0][0] <= 100 && hatch.rect[0][1] <= 300
    && hatch.rect[1][0] >= 170 && hatch.rect[1][1] >= 370,
  "the complete bordered hatch is retained, not only its sparse top fragment");
  assert.equal(hatch.kind, "annotation");
  assert.equal(hatch.seedable, false);
  assert.ok(glyphs.every((glyph) => glyph.aligned_rows === 4));
});

test("findLegendGlyphs: an adjacent table's lower SYMBOL header cannot steal a GENERAL SYMBOLS column", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 130, y), seg(130, y, 130, y + 30),
    seg(130, y + 30, 100, y + 30), seg(100, y + 30, 100, y),
  ];
  const segs = flat([...box(100), ...box(180), ...box(260), ...box(340)]);
  const spans: LegendSpan[] = [
    { text: "GENERAL SYMBOLS", x0: 70, y0: 20, x1: 350, y1: 45 },
    // A neighboring legend table may put its column header lower and just
    // outside this column's caption envelope.
    { text: "SYMBOL", x0: 470, y0: 65, x1: 550, y1: 90 },
    { text: "ACCESS DOOR", x0: 220, y0: 105, x1: 350, y1: 125 },
    { text: "CONNECT TO EXISTING", x0: 220, y0: 185, x1: 400, y1: 205 },
    { text: "EXTENTS OF DEMOLITION", x0: 220, y0: 265, x1: 450, y1: 285 },
    { text: "OBJECT TO BE REMOVED", x0: 220, y0: 345, x1: 450, y1: 365 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 80 });
  assert.deepEqual(glyphs.map((glyph) => [glyph.caption, glyph.heading]), [
    ["ACCESS DOOR", "GENERAL SYMBOLS"],
    ["CONNECT TO EXISTING", "GENERAL SYMBOLS"],
    ["EXTENTS OF DEMOLITION", "GENERAL SYMBOLS"],
    ["OBJECT TO BE REMOVED", "GENERAL SYMBOLS"],
  ]);
  assert.deepEqual(glyphs.map((glyph) => [glyph.kind, glyph.seedable]), [
    ["symbol", true], ["annotation", false],
    ["annotation", false], ["annotation", false],
  ]);
});

test("findLegendGlyphs: table field labels are never promoted as symbol identities", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 130, y), seg(130, y, 130, y + 25),
    seg(130, y + 25, 100, y + 25), seg(100, y + 25, 100, y),
  ];
  const segs = flat([...box(80), ...box(140), ...box(200)]);
  const spans: LegendSpan[] = [
    { text: "PIPING SYMBOLS (DIAGRAMMATIC)", x0: 70, y0: 20, x1: 500, y1: 45 },
    { text: "NAME", x0: 220, y0: 82, x1: 280, y1: 102 },
    { text: "GLOBE VALVE", x0: 220, y0: 142, x1: 360, y1: 162 },
    { text: "FLOW METER", x0: 220, y0: 202, x1: 350, y1: 222 },
  ];
  assert.deepEqual(findLegendGlyphs(segs, spans).map((glyph) => glyph.caption), [
    "GLOBE VALVE", "FLOW METER",
  ]);
});

test("findLegendGlyphs: a schedule SYMBOL field cannot bless asset underlines as legend keys", () => {
  const segs = flat(Array.from({ length: 6 }, (_, index) =>
    seg(100, 140 + index * 60, 145, 140 + index * 60)));
  const spans: LegendSpan[] = [
    { text: "NEW PUMP SCHEDULE", x0: 70, y0: 20, x1: 520, y1: 45 },
    { text: "SYMBOL", x0: 90, y0: 75, x1: 160, y1: 95 },
    { text: "AREA SERVED", x0: 220, y0: 75, x1: 350, y1: 95 },
    { text: "TYPE", x0: 420, y0: 75, x1: 470, y1: 95 },
    ...Array.from({ length: 6 }, (_, index): LegendSpan => ({
      text: index < 2 ? "HOT WATER LOOP" : index < 4 ? "BOILER PUMP" : "CHILLED WATER LOOP",
      x0: 220, y0: 130 + index * 60, x1: 390, y1: 150 + index * 60,
    })),
  ];
  assert.deepEqual(findLegendGlyphs(segs, spans), []);
});

test("findLegendGlyphs: a FILTER TYPE DIAGRAMS section cannot inherit a remote component caption as its heading", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 140, y), seg(140, y, 140, y + 60),
    seg(140, y + 60, 100, y + 60), seg(100, y + 60, 100, y),
  ];
  const glyphs = findLegendGlyphs(flat([...box(600), ...box(700), ...box(800)]), [
    // FIRE ALARM is a legitimate earlier component identity that also looks
    // heading-like. A chain of intervening component names makes it
    // vertically reachable unless the explicit diagram title ends it.
    { text: "FIRE ALARM", x0: 220, y0: 200, x1: 330, y1: 220 },
    { text: "VARIABLE FREQUENCY DRIVE", x0: 220, y0: 280, x1: 480, y1: 300 },
    { text: "ELECTRIC TO PNEUMATIC SWITCH", x0: 220, y0: 360, x1: 500, y1: 380 },
    { text: "OCCUPANCY SENSOR", x0: 220, y0: 440, x1: 410, y1: 460 },
    { text: "RELAY", x0: 220, y0: 520, x1: 290, y1: 540 },
    { text: "FILTER TYPE DIAGRAMS", x0: 80, y0: 555, x1: 350, y1: 575 },
    { text: "FILTER", x0: 220, y0: 615, x1: 290, y1: 635 },
    { text: "BAG FILTER", x0: 220, y0: 715, x1: 330, y1: 735 },
    { text: "ROLL FILTER", x0: 220, y0: 815, x1: 340, y1: 835 },
  ]);
  assert.deepEqual(glyphs, []);
});

test("findLegendGlyphs: a callout-key panel ends the symbol legend above it", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 130, y), seg(130, y, 130, y + 25),
    seg(130, y + 25, 100, y + 25), seg(100, y + 25, 100, y),
  ];
  const segs = flat([...box(80), ...box(140), ...box(260), ...box(320)]);
  const spans: LegendSpan[] = [
    { text: "PIPING SYMBOLS (PLAN)", x0: 70, y0: 20, x1: 400, y1: 45 },
    { text: "PIPE CAP", x0: 220, y0: 82, x1: 330, y1: 102 },
    { text: "GLOBE VALVE", x0: 220, y0: 142, x1: 360, y1: 162 },
    { text: "DIFFUSER CALLOUTS", x0: 70, y0: 200, x1: 360, y1: 225 },
    { text: "NECK SIZE CFM", x0: 220, y0: 262, x1: 380, y1: 282 },
    { text: "DESCRIPTION", x0: 220, y0: 322, x1: 350, y1: 342 },
  ];
  assert.deepEqual(findLegendGlyphs(segs, spans).map((glyph) => glyph.caption), [
    "PIPE CAP", "GLOBE VALVE",
  ]);
});

test("findLegendGlyphs: routed demolition/status swatches and riser marks cannot seed EA sweeps", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 160, y), seg(160, y, 160, y + 20),
    seg(160, y + 20, 100, y + 20), seg(100, y + 20, 100, y),
  ];
  const segs = flat([
    ...box(80), ...box(140), ...box(200), ...box(260),
    ...box(320), ...box(380), ...box(440), ...box(500), ...box(560),
  ]);
  const spans: LegendSpan[] = [
    { text: "DUCTWORK SYMBOLS", x0: 70, y0: 20, x1: 390, y1: 45 },
    { text: "DUCTWORK TO BE REMOVED", x0: 220, y0: 82, x1: 470, y1: 102 },
    { text: "DUCTWORK TO REMAIN", x0: 220, y0: 142, x1: 440, y1: 162 },
    { text: "NEW DUCTWORK", x0: 220, y0: 202, x1: 380, y1: 222 },
    { text: "DUCTWORK WITH LINING", x0: 220, y0: 262, x1: 450, y1: 282 },
    { text: "DRAIN PIPING (CONDENSATE)", x0: 220, y0: 322, x1: 490, y1: 342 },
    { text: "DUCT DOWN (SEE TAG FOR SYSTEM)", x0: 220, y0: 382, x1: 540, y1: 402 },
    { text: "SUPPLY DUCT UP", x0: 220, y0: 442, x1: 390, y1: 462 },
    { text: "PIPE DROP/PIPE RISE", x0: 220, y0: 502, x1: 430, y1: 522 },
    { text: "PIPE CONTINUATION", x0: 220, y0: 562, x1: 420, y1: 582 },
  ];
  const glyphs = findLegendGlyphs(segs, spans);
  assert.deepEqual(glyphs.slice(0, 5).map((glyph) => [glyph.kind, glyph.seedable]), [
    ["line_style", false], ["line_style", false],
    ["line_style", false], ["line_style", false], ["line_style", false],
  ]);
  assert.ok(glyphs.slice(5).every((glyph) => glyph.kind === "annotation" && !glyph.seedable));
});

test("findLegendGlyphs: two named fittings on one continuous pipe stub are a nonseedable group", () => {
  const segs = flat([
    seg(100, 100, 200, 100), seg(100, 120, 200, 120),
    seg(140, 95, 140, 125), seg(190, 95, 190, 125),
  ]);
  const spans: LegendSpan[] = [
    { text: "PIPING SYMBOLS (PLAN)", x0: 70, y0: 20, x1: 400, y1: 45 },
    { text: "FLANGED CONN./BLIND FLANGE", x0: 260, y0: 101, x1: 540, y1: 121 },
  ];
  const [glyph] = findLegendGlyphs(segs, spans, { minAlignedRows: 1 });
  assert.ok(glyph);
  assert.equal(glyph.kind, "symbol_group");
  assert.equal(glyph.seedable, false);
});

test("findLegendGlyphs: a sparse pipe-sleeve carrier stays a physical identity but cannot seed a sweep", () => {
  const segs = flat([
    seg(100, 110, 250, 110),
    seg(165, 104, 185, 104),
  ]);
  const spans: LegendSpan[] = [
    { text: "PIPING", x0: 70, y0: 20, x1: 170, y1: 45 },
    { text: "PIPE SLEEVE", x0: 310, y0: 101, x1: 450, y1: 121 },
  ];
  const [glyph] = findLegendGlyphs(segs, spans, { minAlignedRows: 1 });
  assert.ok(glyph);
  assert.equal(glyph.kind, "symbol");
  assert.equal(glyph.seedable, false);
});

test("findLegendGlyphs: a near-edge multi-character tag still proves a four-edge physical carrier", () => {
  const segs = flat([
    seg(100, 100, 142, 100), seg(142, 100, 142, 120),
    seg(142, 120, 100, 120), seg(100, 120, 100, 100),
  ]);
  const spans: LegendSpan[] = [
    { text: "CO2", x0: 100.4, y0: 101, x1: 140, y1: 119 },
    { text: "CO2 SENSOR", x0: 220, y0: 101, x1: 350, y1: 121 },
  ];
  const [glyph] = findLegendGlyphs(segs, spans, { minAlignedRows: 1, minUnheadedRows: 1 });
  assert.ok(glyph);
  assert.equal(glyph.caption, "CO2 SENSOR");
  assert.equal(glyph.kind, "symbol");
  assert.equal(glyph.seedable, true);
});

test("findLegendGlyphs: outlined alpha tag strokes touching a closed carrier do not erase the component row", () => {
  const segs = flat([
    seg(100, 100, 140, 100), seg(140, 100, 140, 123),
    seg(140, 123, 100, 123), seg(100, 123, 100, 100),
    // Duplicate outlined lettering touches the carrier's right edge, making
    // the connected component richer than the ordinary exact four-edge box.
    seg(105, 101, 140, 101), seg(140, 101, 140, 123),
    seg(140, 123, 105, 123),
  ]);
  const spans: LegendSpan[] = [
    { text: "CONTROL ELECTRICAL COMPONENTS", x0: 70, y0: 20, x1: 440, y1: 45 },
    { text: "CSR", x0: 105, y0: 101, x1: 139, y1: 123 },
    { text: "CURRENT SENSING RELAY", x0: 220, y0: 103, x1: 450, y1: 123 },
  ];
  const [glyph] = findLegendGlyphs(segs, spans, { minAlignedRows: 1, minUnheadedRows: 1 });
  assert.ok(glyph);
  assert.equal(glyph.caption, "CURRENT SENSING RELAY");
  assert.equal(glyph.kind, "symbol");
  assert.equal(glyph.seedable, true);
});

test("findLegendGlyphs: a boxed duct dimension is a callout value, not a physical carrier", () => {
  const segs = flat([
    seg(100, 100, 150, 100), seg(150, 100, 150, 125),
    seg(150, 125, 100, 125), seg(100, 125, 100, 100),
  ]);
  const spans: LegendSpan[] = [
    { text: "12x10", x0: 100.5, y0: 101, x1: 149.5, y1: 124 },
    { text: "RECTANGULAR DUCT DIMENSIONS (INCHES)", x0: 220, y0: 102, x1: 600, y1: 124 },
  ];
  assert.deepEqual(findLegendGlyphs(segs, spans, { minAlignedRows: 1, minUnheadedRows: 1 }), []);
});

test("findLegendGlyphs: an explicitly headed duct-size convention remains auditable but cannot seed a sweep", () => {
  const segs = flat([
    // The left dimension arrow is its own compact component; the internal
    // 20x10 value begins just to its right and used to steal caption ownership
    // before the external DUCT SIZE description could pair.
    seg(100, 100, 115, 100), seg(115, 100, 115, 120),
    seg(115, 120, 100, 120), seg(100, 120, 100, 100),
  ]);
  const spans: LegendSpan[] = [
    { text: "MECHANICAL SYMBOL LEGEND", x0: 70, y0: 20, x1: 500, y1: 45 },
    { text: "20x10", x0: 120, y0: 101, x1: 175, y1: 119 },
    { text: "DUCT SIZE - FIRST SIZE IS SIDE SHOWN", x0: 260, y0: 101, x1: 650, y1: 121 },
  ];
  const [glyph] = findLegendGlyphs(segs, spans, { minAlignedRows: 1 });
  assert.ok(glyph);
  assert.equal(glyph.caption, "DUCT SIZE - FIRST SIZE IS SIDE SHOWN");
  assert.equal(glyph.kind, "annotation");
  assert.equal(glyph.seedable, false);
});

test("findLegendGlyphs: a headerless controller product pinout is not a symbol legend", () => {
  const captions = [
    "1 - IN 0 / MSET 2 - COM 3 - IN 1",
    "4 - IN 2 VLC-1188E BO 0 - 27",
    "5 - COM 6 - IN 3 GND - 28",
    "8 - 24 VDC NO BO'S - 10VA",
    "24VAC LOADS @ 0.5A MAX GND - 33",
    "FUSE: AGC-6 AMP FAST CLASS 2 CIRCUITS ONLY",
    "9 - IN 4 10 - COM BO 4 - 34",
    "11 - IN 5 12 - IN 6 BO 5 - 36",
    "13 - COM 14 - IN 7 AO 0 - 40",
    "INPUT SETUP JUMPERS",
    "0 - 10VDC 0 - 5VDC OR 4-20mA",
    "DRY CONTACT",
    "UL LISTED",
    "17 - IN 8 18 - COM AO 2 - 43",
    "LBL-VLC-1188-A",
  ];
  const segs = flat(captions.flatMap((_, index) => [
    seg(100, 100 + index * 40, 130, 100 + index * 40),
    seg(130, 100 + index * 40, 130, 120 + index * 40),
    seg(130, 120 + index * 40, 100, 120 + index * 40),
    seg(100, 120 + index * 40, 100, 100 + index * 40),
  ]));
  const spans: LegendSpan[] = captions.map((text, index) => ({
    text, x0: 220, y0: 101 + index * 40, x1: 620, y1: 121 + index * 40,
  }));
  assert.deepEqual(findLegendGlyphs(segs, spans), []);
});

test("findLegendGlyphs: contractor keys and pipe-topology conventions are annotations", () => {
  const captions = [
    "BY ELECTRICAL CONTRACTOR",
    "BY PLUMBING CONTRACTOR",
    "BY MECHANICAL CONTRACTOR",
    "POINT OF CONNECTION",
    "POINT OF DISCONNECT",
    "PIPE BREAK",
    "PIPE CAP OR PLUG",
    "PIPE ELBOW DOWN",
    "PIPE BRANCH, TOP CONNECTION",
    "DIRECTION OF PIPE PITCH, DOWN",
    "NEW PIPE CONNECTION",
    "PIPE DROP/RISE",
    "PIPE ELBOW, TURNED UP",
    "PIPE TEE, BOTTOM CONNECTION, 45° OR 90° ELBOW",
    "PIPE TEE, DOWN",
    "PIPE TEE, HORIZONTAL",
    "GRILLE/REGISTER/DIFFUSER TAG",
    "RECTANGULAR EXHAUST/RETURN DUCTWORK DOWN",
    "RECTANGULAR SUPPLY DUCTWORK UP",
    "EQUIPMENT TAG",
    "POINT OF CONNECTION OF NEW TO EXISTING WORK",
  ];
  const box = (y: number): number[][] => [
    seg(100, y, 140, y), seg(140, y, 140, y + 20),
    seg(140, y + 20, 100, y + 20), seg(100, y + 20, 100, y),
  ];
  const glyphs = findLegendGlyphs(
    flat(captions.flatMap((_, index) => box(100 + index * 40))),
    [
      { text: "CONTROLS SYMBOL LEGEND", x0: 70, y0: 20, x1: 450, y1: 45 },
      ...captions.map((text, index): LegendSpan => ({
        text, x0: 220, y0: 101 + index * 40, x1: 600, y1: 121 + index * 40,
      })),
    ],
  );
  assert.equal(glyphs.length, captions.length);
  assert.ok(glyphs.every((glyph) => glyph.kind === "annotation" && !glyph.seedable));
});

test("findLegendGlyphs: vector duplicate punctuation may overshoot PDF text metrics without becoming a symbol", () => {
  const segs = flat([
    seg(100, 100, 111, 100), seg(111, 100, 111, 125),
    seg(111, 125, 100, 125), seg(100, 125, 100, 100),
  ]);
  const spans: LegendSpan[] = [
    { text: "#", x0: 101, y0: 100, x1: 110, y1: 120 },
    { text: "OPTIONAL NUMBER DESIGNATION", x0: 220, y0: 102, x1: 500, y1: 122 },
  ];
  assert.deepEqual(findLegendGlyphs(segs, spans, { minAlignedRows: 1, minUnheadedRows: 1 }), []);
});

test("findLegendGlyphs: an explicit P&ID symbol legend supports a repeated below-caption valve grid", () => {
  const box = (x: number): number[][] => [
    seg(x, 100, x + 30, 100), seg(x + 30, 100, x + 30, 130),
    seg(x + 30, 130, x, 130), seg(x, 130, x, 100),
  ];
  const segs = flat([...box(100), ...box(300), ...box(500)]);
  const spans: LegendSpan[] = [
    { text: "P&ID SYMBOL LEGEND:", x0: 60, y0: 20, x1: 600, y1: 45 },
    { text: "BALL VALVE", x0: 70, y0: 150, x1: 165, y1: 170 },
    { text: "GLOBE VALVE", x0: 265, y0: 150, x1: 370, y1: 170 },
    { text: "CHECK VALVE", x0: 465, y0: 150, x1: 570, y1: 170 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 80 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "BALL VALVE", "GLOBE VALVE", "CHECK VALVE",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.heading === "P&ID SYMBOL LEGEND:"));
});

test("findLegendGlyphs: a singular VALVE diagram label cannot own adjacent I/O callouts", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 140, y), seg(140, y, 140, y + 20),
    seg(140, y + 20, 100, y + 20), seg(100, y + 20, 100, y),
  ];
  const segs = flat([...box(100), ...box(160), ...box(220)]);
  const spans: LegendSpan[] = [
    { text: "VALVE", x0: 70, y0: 20, x1: 150, y1: 45 },
    { text: "DO", x0: 220, y0: 102, x1: 245, y1: 122 },
    { text: "VFD SPEED", x0: 220, y0: 162, x1: 320, y1: 182 },
    { text: "AI", x0: 220, y0: 222, x1: 245, y1: 242 },
  ];
  assert.deepEqual(findLegendGlyphs(segs, spans), []);
});

test("findLegendGlyphs: shallow elevation keys remain annotation rows in a structural legend", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 140, y), seg(140, y, 140, y + 25),
    seg(140, y + 25, 100, y + 25), seg(100, y + 25, 100, y),
  ];
  const segs = flat([
    ...box(100), ...box(180),
    seg(100, 260, 343, 260), seg(343, 260, 343, 296),
    seg(343, 296, 100, 296), seg(100, 296, 100, 260),
    ...box(340), ...box(420),
  ]);
  const spans: LegendSpan[] = [
    { text: "LEGEND", x0: 70, y0: 20, x1: 180, y1: 45 },
    { text: "INDICATES EQUIPMENT ID - SEE PLAN", x0: 380, y0: 103, x1: 700, y1: 123 },
    { text: "INDICATES KEYED SHEET NOTE - SEE PLAN", x0: 380, y0: 183, x1: 740, y1: 203 },
    { text: "DENOTES TOP OF STEEL ELEVATION AT COL. OR RIDGE", x0: 380, y0: 267, x1: 840, y1: 287 },
    { text: "DENOTES DIRECTION OF ROOF SLOPE", x0: 380, y0: 343, x1: 720, y1: 363 },
    { text: "INDICATES (N) OR (E) EQUIPMENT - SEE PLAN", x0: 380, y0: 423, x1: 800, y1: 443 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 220 });
  assert.equal(glyphs.length, 5);
  assert.ok(glyphs.every((glyph) => glyph.kind === "annotation" && !glyph.seedable));
});

test("findLegendGlyphs: device-legend callouts stay annotations and surface raceway stays a routed key", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 150, y), seg(150, y, 150, y + 20),
    seg(150, y + 20, 100, y + 20), seg(100, y + 20, 100, y),
  ];
  const captions = [
    "ARROW INDICATES DIRECTION TO BE SHOWN ON SIGN.",
    "CONNECTION POINT TO EQUIPMENT SPECIFIED, ELECTRICAL CONTRACTOR TO MAKE FINAL CONNECTION.",
    "FLOOR MOUNTED CONNECTION POINT, SEE NOTE ABOVE FOR REQUIREMENTS",
    "MECHANICAL EQUIPMENT CALL OUT",
    "KITCHEN EQUIPMENT CALLOUT",
    "SURFACE MULTI-OUTLET RACEWAY",
  ];
  const segs = flat(captions.flatMap((_, index) => box(100 + index * 60)));
  const spans: LegendSpan[] = [
    { text: "DEVICES", x0: 70, y0: 20, x1: 180, y1: 45 },
    ...captions.map((text, index): LegendSpan => ({
      text, x0: 220, y0: 102 + index * 60, x1: 760, y1: 122 + index * 60,
    })),
  ];
  const glyphs = findLegendGlyphs(segs, spans);
  assert.equal(glyphs.length, 6);
  assert.ok(glyphs.every((glyph) => glyph.heading === "DEVICES" && !glyph.seedable));
  assert.ok(glyphs.slice(0, 5).every((glyph) => glyph.kind === "annotation"));
  assert.equal(glyphs[5].kind, "line_style");
});

test("findLegendGlyphs: BAS software and sequence functions are preserved but never become EA sweep seeds", () => {
  const segs = flat([
    ...controlValveGlyph(100, 100),
    ...controlValveGlyph(100, 300),
    ...controlValveGlyph(100, 500),
    ...controlValveGlyph(100, 700),
    ...controlValveGlyph(100, 900),
    ...controlValveGlyph(100, 1100),
    ...controlValveGlyph(100, 1300),
    ...controlValveGlyph(100, 1500),
    ...controlValveGlyph(100, 1700),
    ...controlValveGlyph(100, 1900),
    ...controlValveGlyph(100, 2100),
    ...controlValveGlyph(100, 2300),
  ]);
  const spans: LegendSpan[] = [
    { text: "CONTROLS SYMBOLS", x0: 70, y0: 20, x1: 330, y1: 45 },
    { text: "TEMPERATURE CONTROLLER. SEE SEQUENCE OF OPERATION", x0: 220, y0: 145, x1: 650, y1: 165 },
    { text: "INTEGRATE CONTROL POINT ON REMOTE GRAPHICS WORKSTATION AT ENERGY CONTROL CENTER", x0: 220, y0: 345, x1: 780, y1: 365 },
    { text: "TIME CLOCK CONTROLLING EQUIPMENT ON A SCHEDULE", x0: 220, y0: 545, x1: 650, y1: 565 },
    { text: "AUXILIARY CONTACT", x0: 220, y0: 745, x1: 430, y1: 765 },
    { text: "ANALOG INPUT", x0: 220, y0: 945, x1: 390, y1: 965 },
    { text: "BINARY OUTPUT", x0: 220, y0: 1145, x1: 410, y1: 1165 },
    { text: "CURRENT INPUT", x0: 220, y0: 1345, x1: 400, y1: 1365 },
    { text: "VOLTAGE OUTPUT", x0: 220, y0: 1545, x1: 420, y1: 1565 },
    { text: "ENABLE / DISABLE", x0: 220, y0: 1745, x1: 420, y1: 1765 },
    { text: "START/STOP", x0: 220, y0: 1945, x1: 370, y1: 1965 },
    { text: "RESET", x0: 220, y0: 2145, x1: 310, y1: 2165 },
    { text: "DIFFERENTIAL PRESSURE", x0: 220, y0: 2345, x1: 470, y1: 2365 },
  ];
  const glyphs = findLegendGlyphs(segs, spans, { maxGlyphDimPx: 120 });
  assert.equal(glyphs.length, 12);
  assert.ok(
    glyphs.every((glyph) => glyph.kind === "control_function" && glyph.seedable === false),
    JSON.stringify(glyphs.map((glyph) => ({ caption: glyph.caption, kind: glyph.kind, seedable: glyph.seedable }))),
  );
  assert.ok(glyphs.every((glyph) => /control logic|sequence function/i.test(glyph.seed_warning || "")));
});

test("findLegendGlyphs: a structured symbol-description legend admits bounded oversized assemblies without widening loose discovery", () => {
  const assembly = (y: number): number[][] => [
    seg(100, y, 370, y), seg(370, y, 370, y + 50),
    seg(370, y + 50, 100, y + 50), seg(100, y + 50, 100, y),
  ];
  const segs = flat([...assembly(100), ...assembly(260)]);
  const rows: LegendSpan[] = [
    { text: "DUCTWORK SOUND ATTENUATOR", x0: 400, y0: 115, x1: 650, y1: 140 },
    { text: "INLINE CENTRIFUGAL FAN", x0: 400, y0: 275, x1: 620, y1: 300 },
  ];
  const headed = findLegendGlyphs(segs, [
    { text: "HVAC SYMBOL LEGEND", x0: 80, y0: 20, x1: 680, y1: 50 },
    { text: "SYMBOL", x0: 100, y0: 60, x1: 175, y1: 82 },
    { text: "DESCRIPTION", x0: 400, y0: 60, x1: 530, y1: 82 },
    ...rows,
  ]);
  assert.deepEqual(headed.map((glyph) => glyph.caption), [
    "DUCTWORK SOUND ATTENUATOR", "INLINE CENTRIFUGAL FAN",
  ]);
  assert.deepEqual(
    findLegendGlyphs(segs, rows, { minUnheadedRows: 1 }),
    [],
    "the same 270px assemblies remain above the conservative headerless cap",
  );
  assert.deepEqual(
    findLegendGlyphs(segs, [
      { text: "HVAC SYMBOL LEGEND", x0: 80, y0: 20, x1: 680, y1: 50 },
      ...rows,
    ]),
    [],
    "a loose heading alone cannot enlarge every drawing component on the page",
  );
});

test("findLegendGlyphs: a neighboring terse tag cannot release the wrong prior-row member", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const glyphs = findLegendGlyphs(flat([
    ...box(100, 100, 150, 140),
    ...box(160, 88, 168, 152),
    ...box(178, 100, 228, 140),
    ...box(100, 180, 228, 220),
  ]), [
    { text: "MECHANICAL LEGEND", x0: 80, y0: 20, x1: 500, y1: 45 },
    { text: "MANUAL BALANCE DAMPER", x0: 300, y0: 108, x1: 540, y1: 130 },
    { text: "BD", x0: 170, y0: 148, x1: 195, y1: 168 },
    { text: "BACKDRAFT DAMPER", x0: 300, y0: 188, x1: 490, y1: 210 },
  ], { maxGlyphDimPx: 150 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "MANUAL BALANCE DAMPER", "BACKDRAFT DAMPER",
  ]);
  assert.ok(glyphs[0].rect[0][0] <= 100 && glyphs[0].rect[1][0] >= 228);
  assert.ok(glyphs[0].rect[0][1] <= 88 && glyphs[0].rect[1][1] >= 152);
  assert.equal(glyphs[0].member_rects?.length, 3);
});

test("findLegendGlyphs: disconnected parallel strokes recover one flexible-duct line key", () => {
  const strokes = Array.from({ length: 8 }, (_, index) =>
    seg(100 + index * 12, 100, 100 + index * 12, 124));
  const [glyph] = findLegendGlyphs(flat(strokes), [
    { text: "HVAC SYMBOL LEGEND", x0: 70, y0: 20, x1: 420, y1: 45 },
    { text: "FLEXIBLE DUCT", x0: 250, y0: 102, x1: 390, y1: 124 },
  ], { minAlignedRows: 1 });
  assert.ok(glyph);
  assert.equal(glyph.caption, "FLEXIBLE DUCT");
  assert.equal(glyph.kind, "line_style");
  assert.equal(glyph.seedable, false);
  assert.equal(glyph.segments, 8);
});

test("findLegendGlyphs: lower internal controller tags cannot consume the next tall assembly's caption", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const glyphs = findLegendGlyphs(flat([
    ...box(100, 100, 200, 220),
    ...box(100, 260, 160, 380),
  ]), [
    { text: "CONTROL SYMBOLS", x0: 70, y0: 20, x1: 500, y1: 45 },
    { text: "VARIABLE FREQUENCY DRIVE", x0: 350, y0: 160, x1: 590, y1: 180 },
    { text: "VFD", x0: 205, y0: 230, x1: 240, y1: 250 },
    { text: "FM-", x0: 180, y0: 300, x1: 215, y1: 320 },
    { text: "FLOW METER (FM)", x0: 350, y0: 300, x1: 520, y1: 320 },
  ]);
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "VARIABLE FREQUENCY DRIVE", "FLOW METER (FM)",
  ]);
});

test("findLegendGlyphs: table delimiters are removed only from completed captions", () => {
  const segs = flat([...controlValveGlyph(100, 100), ...controlValveGlyph(100, 300)]);
  const glyphs = findLegendGlyphs(segs, [
    { text: "HVAC SYMBOL LEGEND", x0: 70, y0: 20, x1: 430, y1: 45 },
    { text: "-FLOW METER", x0: 220, y0: 145, x1: 370, y1: 165 },
    { text: "— CHILLED WATER SUPPLY", x0: 220, y0: 345, x1: 470, y1: 365 },
  ], { maxGlyphDimPx: 120 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), ["FLOW METER", "CHILLED WATER SUPPLY"]);
  assert.equal(glyphs[0].kind, "symbol");
  assert.equal(glyphs[1].kind, "line_style");
});

test("findLegendGlyphs: pipe topology, duct-state keys, and BAS I/O receive nonseedable semantics", () => {
  const annotations = [
    "CHANGE IN PRESSURE",
    "RECTANGULAR DUCT SECTION UP, EXHAUST",
    "CONNECTION, TOP",
    "ELBOW, 90°",
    "TEE, OUTLET DOWN",
    "45° PIPE RISE (R) / DROP (D)",
    "NUMBER OF DETAIL ON SHEET",
    "NUMBER OF SHEET WHERE DETAIL APPEARS",
    "ROUND DUCT SIZE TAG (WIDTH X HEIGHT)",
    "PIPE SLOPE TAG (1/8\"/FT)",
    "RECTANGULAR SUPPLY/OUTSIDE AIR DUCT RISE",
    "ROUND RETURN/TRANSFER AIR DUCT DROP",
    "PIPE TURNED DOWN (T)",
    "PIPE OUT BOTTOM",
    "R (RISE), D (DROP) ARROW",
    "INSULATED METAL PANEL",
  ];
  const lineStyles = [
    "1\" INTERNALLY LINED DUCTWORK",
    "FLAT OVAL DUCT",
    "FLAT OVAL DUCT (WIDTH X HEIGHT)",
    "RETANGULAR DUCT (WIDTH X HEIGHT)",
    "ROUND DUCT",
    "CONDITIONED OUTSIDE AIR",
    "RELIEF AIR",
    "EXHAUST GAS FLUE",
    "FLEX DUCT",
    "NEW DUCTWORK, FIRST DIMENSION IS SIDE SHOWN",
    "DEMOLISHED/REMOVED DUCTWORK, PIPING AND/OR EQUIPMENT",
  ];
  const controls = [
    "BINARY / DIGITAL INPUT",
    "BINARY / DIGITAL OUTPUT",
    "ANALOG INPUT (DDC CONTROLLER)",
    "BINARY OUTPUT (DDC CONTROLLER)",
  ];
  const captions = [...annotations, ...lineStyles, ...controls];
  const glyphs = findLegendGlyphs(
    flat(captions.flatMap((_, index) => controlValveGlyph(100, 100 + index * 200))),
    [
      { text: "HVAC SYMBOL LEGEND", x0: 70, y0: 20, x1: 450, y1: 45 },
      ...captions.map((text, index): LegendSpan => ({
        text, x0: 220, y0: 145 + index * 200, x1: 700, y1: 165 + index * 200,
      })),
    ],
    { maxGlyphDimPx: 120 },
  );
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), captions);
  assert.deepEqual(glyphs.map((glyph) => glyph.kind), [
    ...annotations.map(() => "annotation"),
    ...lineStyles.map(() => "line_style"),
    ...controls.map(() => "control_function"),
  ]);
  assert.ok(glyphs.every((glyph) => !glyph.seedable));
});

test("findLegendGlyphs: independently drawn support, sensor, and monitoring alternatives remain symbol groups", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 45, y), seg(x + 45, y, x + 45, y + 45),
    seg(x + 45, y + 45, x, y + 45), seg(x, y + 45, x, y),
  ];
  const captions = [
    "PIPING/DUCTWORK SUPPORT",
    "TEMPERATURE SENSOR IN WELL",
    "AIR FLOW MONITORING STATION ALONE OR AIR FLOW MONITORING STATION WITH 2-POSITION MOTORIZED DAMPER",
  ];
  const segs = flat(captions.flatMap((_, index) => [
    ...box(100, 100 + index * 180), ...box(220, 100 + index * 180),
  ]));
  const glyphs = findLegendGlyphs(segs, [
    { text: "HVAC SYMBOL LEGEND", x0: 70, y0: 20, x1: 720, y1: 45 },
    ...captions.map((text, index): LegendSpan => ({
      text, x0: 340, y0: 112 + index * 180, x1: 1050, y1: 137 + index * 180,
    })),
  ], { maxGlyphDimPx: 280 });
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), captions);
  assert.ok(glyphs.every((glyph) => glyph.kind === "symbol_group" && !glyph.seedable));
  assert.ok(glyphs.every((glyph) => glyph.member_rects?.length === 2));
});

test("findLegendGlyphs: consecutive caption baselines may overlap in PDF font metrics without losing a wrapped line", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const glyphs = findLegendGlyphs(flat([
    ...box(100, 100, 150, 150),
    ...box(100, 205, 150, 255),
  ]), [
    { text: "ELECTRICAL SYMBOL LEGEND", x0: 70, y0: 20, x1: 520, y1: 45 },
    // These two physical baselines advance by 22px, but their 25px PDF text
    // boxes overlap vertically by 3px. The rendered page clearly shows two
    // consecutive lines in the same table cell.
    { text: "FULL VOLTAGE NONREVERSING MOTOR STARTER OR", x0: 220, y0: 98, x1: 670, y1: 123 },
    { text: "CONTACTOR NUMBER DESIGNATES NEMA SIZE.", x0: 220, y0: 120, x1: 610, y1: 145 },
    { text: "VARIABLE FREQUENCY DRIVE", x0: 220, y0: 215, x1: 480, y1: 240 },
  ]);
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "FULL VOLTAGE NONREVERSING MOTOR STARTER OR CONTACTOR NUMBER DESIGNATES NEMA SIZE.",
    "VARIABLE FREQUENCY DRIVE",
  ]);
});

test("findLegendGlyphs: a ruled SYMBOL-DESCRIPTION cell keeps deeply indented explanation lines", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const glyphs = findLegendGlyphs(flat([
    ...[55, 85, 200, 240, 330].map((y) => seg(50, y, 700, y)),
    ...box(100, 100, 150, 150),
    ...box(100, 260, 150, 310),
  ]), [
    { text: "ELECTRICAL SYMBOL LEGEND", x0: 70, y0: 20, x1: 650, y1: 45 },
    { text: "SYMBOL", x0: 100, y0: 60, x1: 175, y1: 84 },
    { text: "DESCRIPTION", x0: 220, y0: 60, x1: 360, y1: 84 },
    { text: "NOTC", x0: 105, y0: 76, x1: 150, y1: 101 },
    { text: "MOTOR CONTROL CONTACT - TIME DELAY", x0: 220, y0: 100, x1: 550, y1: 125 },
    { text: "NORMALLY OPEN WITH INSTANT CLOSING AND", x0: 220, y0: 122, x1: 620, y1: 147 },
    { text: "TIME DELAY OPENING.", x0: 335, y0: 144, x1: 530, y1: 169 },
    { text: "VARIABLE FREQUENCY DRIVE", x0: 220, y0: 270, x1: 490, y1: 295 },
  ]);
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "MOTOR CONTROL CONTACT - TIME DELAY NORMALLY OPEN WITH INSTANT CLOSING AND TIME DELAY OPENING.",
    "VARIABLE FREQUENCY DRIVE",
  ]);
});

test("findLegendGlyphs: disconnected fragments that claim overlapping caption baselines reunite as one table row", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const glyphs = findLegendGlyphs(flat([
    seg(100, 110, 145, 110),
    seg(100, 122, 145, 122),
    ...box(100, 230, 150, 280),
  ]), [
    { text: "ELECTRICAL SYMBOL LEGEND", x0: 70, y0: 20, x1: 650, y1: 45 },
    { text: "SYMBOL", x0: 100, y0: 60, x1: 175, y1: 84 },
    { text: "DESCRIPTION", x0: 220, y0: 60, x1: 360, y1: 84 },
    { text: "FULL VOLTAGE NONREVERSING MOTOR STARTER OR", x0: 220, y0: 98, x1: 670, y1: 123 },
    { text: "CONTACTOR NUMBER DESIGNATES NEMA SIZE.", x0: 220, y0: 120, x1: 610, y1: 145 },
    { text: "VARIABLE FREQUENCY DRIVE", x0: 220, y0: 240, x1: 490, y1: 265 },
  ]);
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "FULL VOLTAGE NONREVERSING MOTOR STARTER OR CONTACTOR NUMBER DESIGNATES NEMA SIZE.",
    "VARIABLE FREQUENCY DRIVE",
  ]);
});

test("findLegendGlyphs: ruled table bands own one full description and preserve text-only symbol cells", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const rules = [55, 85, 165, 245, 325, 405].map((y) => seg(50, y, 700, y));
  const glyphs = findLegendGlyphs(flat([
    ...rules,
    ...box(100, 100, 150, 145),
    ...box(100, 185, 150, 225),
  ]), [
    { text: "ELECTRICAL SYMBOL LEGEND", x0: 50, y0: 5, x1: 700, y1: 35 },
    { text: "SYMBOL", x0: 90, y0: 56, x1: 170, y1: 80 },
    { text: "DESCRIPTION", x0: 220, y0: 56, x1: 360, y1: 80 },
    { text: "NOTC", x0: 105, y0: 95, x1: 150, y1: 120 },
    { text: "MOTOR STARTER OR", x0: 220, y0: 95, x1: 410, y1: 120 },
    { text: "CONTACTOR, NEMA SIZE 5", x0: 220, y0: 117, x1: 470, y1: 142 },
    { text: "VARIABLE FREQUENCY DRIVE", x0: 220, y0: 190, x1: 490, y1: 215 },
    { text: "$", x0: 110, y0: 270, x1: 122, y1: 295 },
    { text: "SINGLE POLE SWITCH", x0: 220, y0: 270, x1: 430, y1: 295 },
    { text: "APS", x0: 105, y0: 350, x1: 145, y1: 375 },
    { text: "AIRFLOW PROVING SWITCH", x0: 220, y0: 350, x1: 470, y1: 375 },
  ]);
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "MOTOR STARTER OR CONTACTOR, NEMA SIZE 5",
    "VARIABLE FREQUENCY DRIVE",
    "SINGLE POLE SWITCH",
  ]);
  assert.equal(glyphs[2].kind, "symbol");
  assert.equal(glyphs[2].seedable, false);
  assert.deepEqual(glyphs[2].rect, [[110, 270], [122, 295]]);
});

test("findLegendGlyphs: ruled cells retain disconnected components omitted by the nearest heuristic glyph", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const glyphs = findLegendGlyphs(flat([
    ...[55, 85, 200, 300].map((y) => seg(50, y, 700, y)),
    ...box(100, 100, 150, 125),
    seg(105, 140, 145, 140),
    seg(112, 150, 138, 150),
    seg(120, 160, 130, 160),
    ...box(100, 220, 150, 260),
  ]), [
    { text: "ELECTRICAL SYMBOL LEGEND", x0: 50, y0: 5, x1: 700, y1: 35 },
    { text: "SYMBOL", x0: 90, y0: 56, x1: 170, y1: 80 },
    { text: "DESCRIPTION", x0: 220, y0: 56, x1: 360, y1: 80 },
    { text: "GROUND CONNECTION", x0: 220, y0: 108, x1: 430, y1: 133 },
    { text: "VARIABLE FREQUENCY DRIVE", x0: 220, y0: 228, x1: 490, y1: 253 },
  ]);
  assert.equal(glyphs.length, 2);
  assert.equal(glyphs[0].caption, "GROUND CONNECTION");
  assert.equal(glyphs[0].kind, "symbol");
  assert.ok(glyphs[0].rect[0][0] <= 100 && glyphs[0].rect[0][1] <= 100);
  assert.ok(glyphs[0].rect[1][0] >= 150 && glyphs[0].rect[1][1] >= 160);
  assert.equal(glyphs[0].member_rects?.length, 4);
});

test("findLegendGlyphs: a full-height panel divider blocks legend geometry from stealing adjacent notes prose", () => {
  const box = (x0: number, y0: number): number[][] => [
    seg(x0, y0, x0 + 50, y0), seg(x0 + 50, y0, x0 + 50, y0 + 35),
    seg(x0 + 50, y0 + 35, x0, y0 + 35), seg(x0, y0 + 35, x0, y0),
  ];
  const glyphs = findLegendGlyphs(flat([
    ...box(100, 100), ...box(100, 200),
    ...box(430, 300), ...box(430, 400),
    seg(510, 50, 510, 480),
  ]), [
    { text: "MECHANICAL PIPING SYMBOLS", x0: 50, y0: 10, x1: 500, y1: 40 },
    { text: "CHILLED WATER SUPPLY", x0: 220, y0: 105, x1: 430, y1: 130 },
    { text: "CHILLED WATER RETURN", x0: 220, y0: 205, x1: 430, y1: 230 },
    { text: "INSTALL ALL EQUIPMENT IN ACCORDANCE WITH THE SPECIFICATIONS", x0: 550, y0: 305, x1: 1080, y1: 330 },
    { text: "COORDINATE ALL WORK WITH OTHER TRADES", x0: 550, y0: 405, x1: 930, y1: 430 },
  ]);
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "CHILLED WATER SUPPLY",
    "CHILLED WATER RETURN",
  ]);
});

test("findLegendGlyphs: selector position legends and notation definitions do not terminate ruled tables", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const rules = [55, 85, 165, 245, 345].map((y) => seg(50, y, 760, y));
  const glyphs = findLegendGlyphs(flat([
    ...rules,
    ...box(100, 100, 150, 145),
    ...box(100, 185, 150, 225),
    ...box(100, 265, 150, 325),
  ]), [
    { text: "ELECTRICAL SYMBOL LEGEND", x0: 50, y0: 5, x1: 700, y1: 35 },
    { text: "SYMBOL", x0: 90, y0: 56, x1: 170, y1: 80 },
    { text: "DESCRIPTION", x0: 220, y0: 56, x1: 360, y1: 80 },
    { text: "3 POSITION SELECTOR SWITCH HAND - OFF - AUTO,", x0: 220, y0: 95, x1: 670, y1: 120 },
    { text: "POSITION LEGEND: X=CLOSED O=OPEN", x0: 220, y0: 117, x1: 560, y1: 142 },
    { text: "VARIABLE FREQUENCY DRIVE", x0: 220, y0: 190, x1: 490, y1: 215 },
    { text: "THIS NOTATION ADJACENT TO A DEVICE DENOTES", x0: 220, y0: 265, x1: 650, y1: 290 },
    { text: "MOUNTING HEIGHT ABOVE FINISHED FLOOR.", x0: 220, y0: 287, x1: 610, y1: 312 },
  ]);
  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "3 POSITION SELECTOR SWITCH HAND - OFF - AUTO, POSITION LEGEND: X=CLOSED O=OPEN",
    "VARIABLE FREQUENCY DRIVE",
    "THIS NOTATION ADJACENT TO A DEVICE DENOTES MOUNTING HEIGHT ABOVE FINISHED FLOOR.",
  ]);
});

test("findLegendGlyphs: ruled rows group independent same-baseline renditions but not nested compound parts", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const rules = [55, 85, 165, 245, 325].map((y) => seg(50, y, 760, y));
  const glyphs = findLegendGlyphs(flat([
    ...rules,
    ...box(90, 105, 125, 145),
    ...box(150, 105, 190, 145),
    ...box(90, 185, 125, 225),
    ...box(150, 185, 190, 225),
    ...box(100, 260, 170, 315),
    ...box(108, 272, 132, 303),
    ...box(138, 272, 162, 303),
  ]), [
    { text: "ELECTRICAL SYMBOL LEGEND", x0: 50, y0: 5, x1: 700, y1: 35 },
    { text: "SYMBOL", x0: 90, y0: 56, x1: 170, y1: 80 },
    { text: "DESCRIPTION", x0: 220, y0: 56, x1: 360, y1: 80 },
    { text: "ELAPSED TIME METER", x0: 220, y0: 110, x1: 440, y1: 135 },
    { text: "DATA OUTLET (SINGLE, DOUBLE)", x0: 220, y0: 190, x1: 520, y1: 215 },
    { text: "EMERGENCY STOP PUSH BUTTON", x0: 220, y0: 275, x1: 520, y1: 300 },
  ]);
  assert.deepEqual(glyphs.map((glyph) => [glyph.caption, glyph.kind, glyph.seedable]), [
    ["ELAPSED TIME METER", "symbol_group", false],
    ["DATA OUTLET (SINGLE, DOUBLE)", "symbol_group", false],
    ["EMERGENCY STOP PUSH BUTTON", "symbol", true],
  ]);
  assert.equal(glyphs[0].member_rects?.length, 2);
  assert.equal(glyphs[1].member_rects?.length, 2);
  assert.equal(glyphs[2].member_rects?.length, 3);
});

test("findLegendGlyphs: electrical routing and notation rows remain auditable annotations", () => {
  const captions = [
    "DEVICE LOCATED AT REMOTE LOCATION.",
    "HATCH MARKS IN CONDUIT RUN DENOTES NUMBER OF CONDUCTORS.",
    "DENOTES EXISTING EQUIPMENT OR DEVICES",
    "THIS NOTATION ADJACENT TO WALL OUTLET SYMBOL DENOTES MOUNTING HEIGHT ABOVE FINISHED FLOOR.",
    "CAPPED UNDERGROUND CONDUIT OR STUBBUP",
    "CONDUIT DROP",
    "CONDUIT RISE",
    "DETAIL VIEW OR MATCHING",
    "LTC CONNECTION",
    "MC CONNECTION",
    "NODE OR CONNECTION",
    "BOND TO METALLIC WATER PIPE",
    "BOND TO BUILDING STEEL",
    "LIGHTING FIXTURE TYPE - SEE FIXTURE SCHEDULE.",
    "ELECTRICAL EQUIPMENT FOOTPRINT. SEE SCHEDULE FOR EQUIPMENT ID.",
    "DUCTWORK SHOWING SIZE AND SYSTEM",
    "DUCT SECTION-SUPPLY/OUTSIDE AIR",
    "DUCT SECTION-RETURN AIR",
    "DUCT SECTION-EXHAUST AIR",
    "FEEDER REFERENCE TAG",
    "POINT OF CONNECTION-NEW TO EXISTING",
  ];
  const glyphs = findLegendGlyphs(flat(captions.flatMap((_, index) => {
    const y = 100 + index * 60;
    return [
      seg(100, y, 150, y), seg(150, y, 150, y + 20),
      seg(150, y + 20, 100, y + 20), seg(100, y + 20, 100, y),
    ];
  })), [
    { text: "DEVICES", x0: 70, y0: 20, x1: 180, y1: 45 },
    ...captions.map((text, index) => {
      const y = 100 + index * 60;
      return { text, x0: 220, y0: y + 2, x1: 760, y1: y + 22 };
    }),
  ]);
  assert.equal(glyphs.length, captions.length);
  assert.deepEqual(glyphs.map((glyph) => glyph.kind), captions.map(() => "annotation"));
  assert.deepEqual(glyphs.map((glyph) => glyph.seedable), captions.map(() => false));
});

test("findLegendGlyphs: a two-sided DAMPER TAGS panel row-slices shared carriers without cross-column theft", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 30, y), seg(x + 30, y, x + 30, y + 24),
    seg(x + 30, y + 24, x, y + 24), seg(x, y + 24, x, y),
  ];
  const ys = [100, 190, 280];
  const glyphs = findLegendGlyphs(flat([
    seg(20, 0, 20, 500), seg(700, 0, 700, 500),
    // Each column has one shared vertical carrier. Ordinary connected-
    // component pairing sees a panel-scale object; row slicing must retain
    // the six independent callout identities around it.
    seg(250, 70, 250, 340), seg(430, 70, 430, 340),
    ...ys.flatMap((y) => [...box(235, y), ...box(415, y)]),
  ]), [
    { text: "DAMPER TAGS", x0: 260, y0: 20, x1: 440, y1: 40 },
    ...["FIRE DAMPER", "SMOKE DAMPER", "COMBINATION FIRE/SMOKE DAMPER"]
      .map((text, index): LegendSpan => ({
        text, x0: 60, y0: ys[index] + 2, x1: 210, y1: ys[index] + 22,
      })),
    ...["MANUAL BALANCING DAMPER", "BACKDRAFT DAMPER", "MOTORIZED DAMPER"]
      .map((text, index): LegendSpan => ({
        text, x0: 470, y0: ys[index] + 2, x1: 660, y1: ys[index] + 22,
      })),
  ], { maxGlyphDimPx: 120 });

  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "FIRE DAMPER", "MANUAL BALANCING DAMPER",
    "SMOKE DAMPER", "BACKDRAFT DAMPER",
    "COMBINATION FIRE/SMOKE DAMPER", "MOTORIZED DAMPER",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.kind === "symbol" && !glyph.seedable));
  assert.equal(new Set(glyphs.map((glyph) => glyph.rect.flat().join(","))).size, 6,
    "each tag row owns distinct local geometry");
});

test("findLegendGlyphs: PIPE ACCESSORY TAGS preserve code plus description blocks in two columns", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 30, y), seg(x + 30, y, x + 30, y + 32),
    seg(x + 30, y + 32, x, y + 32), seg(x, y + 32, x, y),
  ];
  const glyphs = findLegendGlyphs(flat([
    seg(20, 0, 20, 430), seg(700, 0, 700, 430),
    ...box(235, 100), ...box(415, 100),
    ...box(235, 230), ...box(415, 230),
  ]), [
    { text: "PIPE ACCESSORY TAGS", x0: 240, y0: 20, x1: 460, y1: 40 },
    { text: "2\" M-CNTRL", x0: 55, y0: 96, x1: 180, y1: 116 },
    { text: "MOTORIZED CONTROL VALVE", x0: 55, y0: 119, x1: 210, y1: 139 },
    { text: "2\" BALANCING", x0: 470, y0: 96, x1: 590, y1: 116 },
    { text: "BALANCING VALVE", x0: 470, y0: 119, x1: 620, y1: 139 },
    { text: "2\" CHECK", x0: 55, y0: 226, x1: 160, y1: 246 },
    { text: "CHECK VALVE", x0: 55, y0: 249, x1: 175, y1: 269 },
    { text: "2\" BUTTERFLY", x0: 470, y0: 226, x1: 600, y1: 246 },
    { text: "BUTTERFLY VALVE", x0: 470, y0: 249, x1: 630, y1: 269 },
  ], { maxGlyphDimPx: 120 });

  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "2\" M-CNTRL MOTORIZED CONTROL VALVE",
    "2\" BALANCING BALANCING VALVE",
    "2\" CHECK CHECK VALVE",
    "2\" BUTTERFLY BUTTERFLY VALVE",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.kind === "symbol" && !glyph.seedable));
  assert.equal(new Set(glyphs.map((glyph) => glyph.rect.flat().join(","))).size, 4);
});

test("findLegendGlyphs: text-only note keys remain rows and CONTINUATION SYMBOL cannot become a nested heading", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 35, y), seg(x + 35, y, x + 35, y + 25),
    seg(x + 35, y + 25, x, y + 25), seg(x, y + 25, x, y),
  ];
  const glyphs = findLegendGlyphs(flat([
    seg(20, 0, 20, 450), seg(700, 0, 700, 450),
    ...box(100, 100), ...box(100, 180),
  ]), [
    { text: "GENERAL SYMBOLS", x0: 50, y0: 20, x1: 260, y1: 40 },
    { text: "CONTINUATION SYMBOL", x0: 220, y0: 103, x1: 430, y1: 123 },
    { text: "POINT WHERE NEW CONNECTS TO EXISTING", x0: 220, y0: 183, x1: 600, y1: 203 },
    { text: "A.", x0: 100, y0: 263, x1: 120, y1: 283 },
    { text: "GENERAL NOTE", x0: 220, y0: 263, x1: 360, y1: 283 },
    { text: "1.", x0: 100, y0: 343, x1: 120, y1: 363 },
    { text: "PLAN NOTE LIST", x0: 220, y0: 343, x1: 370, y1: 363 },
  ], { maxGlyphDimPx: 120 });

  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "CONTINUATION SYMBOL",
    "POINT WHERE NEW CONNECTS TO EXISTING",
    "GENERAL NOTE",
    "PLAN NOTE LIST",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.kind === "annotation" && !glyph.seedable));
  assert.ok(glyphs.every((glyph) => glyph.heading === "GENERAL SYMBOLS"));
  assert.deepEqual(glyphs.slice(2).map((glyph) => glyph.segments), [0, 0]);
});

test("findLegendGlyphs: a shared piping callout diagram yields distinct, nonseedable identities", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 28, y), seg(x + 28, y, x + 28, y + 22),
    seg(x + 28, y + 22, x, y + 22), seg(x, y + 22, x, y),
  ];
  const ys = [100, 170, 240, 310];
  const glyphs = findLegendGlyphs(flat([
    seg(20, 0, 20, 450), seg(700, 0, 700, 450),
    // A zig-zag carrier connects the physical examples across row bands;
    // it is diagram content rather than a straight panel divider.
    seg(300, 80, 310, 145), seg(310, 145, 300, 215),
    seg(300, 215, 310, 285), seg(310, 285, 300, 355),
    ...ys.flatMap((y, index) => [
      ...box(index % 2 ? 282 : 300, y),
      ...box(index % 2 ? 310 : 282, y),
    ]),
  ]), [
    { text: "MECHANICAL PIPING SYMBOLS", x0: 190, y0: 20, x1: 510, y1: 40 },
    { text: "PIPE DROP", x0: 60, y0: 102, x1: 180, y1: 122 },
    { text: "PIPE RISE", x0: 480, y0: 102, x1: 590, y1: 122 },
    { text: "PIPE TEE", x0: 60, y0: 172, x1: 180, y1: 192 },
    { text: "PLUG", x0: 480, y0: 172, x1: 550, y1: 192 },
    { text: "CAP", x0: 60, y0: 242, x1: 130, y1: 262 },
    { text: "45 DEGREE TEE", x0: 480, y0: 242, x1: 640, y1: 262 },
    { text: "REDUCING 45 DEGREE TEE", x0: 60, y0: 312, x1: 245, y1: 332 },
  ], { maxGlyphDimPx: 120 });

  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "PIPE DROP", "PIPE RISE", "PIPE TEE", "PLUG", "CAP",
    "45 DEGREE TEE", "REDUCING 45 DEGREE TEE",
  ]);
  assert.deepEqual(glyphs.map((glyph) => glyph.kind), [
    "annotation", "annotation", "annotation", "symbol", "symbol", "symbol", "symbol",
  ]);
  assert.ok(glyphs.every((glyph) => !glyph.seedable));
  assert.equal(new Set(glyphs.map((glyph) => glyph.rect.flat().join(","))).size, 7,
    "one callout identity cannot reuse another row's exact geometry");
});

test("findLegendGlyphs: a shared BAS point-tag diagram owns three distinct leader definitions", () => {
  const glyphs = findLegendGlyphs(flat([
    // Finite jurisdiction for the named component panel.
    seg(100, 60, 700, 60),
    // An ordinary wrapped row whose first line also resembles a section
    // heading. Its accepted caption ownership must keep the zone open.
    seg(120, 100, 160, 100), seg(160, 100, 160, 130),
    seg(160, 130, 120, 130), seg(120, 130, 120, 100),
    // This row-local carrier spans over half, but not all, of the panel and
    // therefore cannot impersonate a full-width lower boundary.
    seg(220, 180, 570, 180),
    // Three final leader segments from one shared tag/circle explanation.
    seg(460, 225, 500, 225),
    seg(470, 305, 500, 305),
    seg(465, 385, 500, 385),
  ]), [
    { text: "CONTROL ELECTRICAL COMPONENTS", x0: 110, y0: 20, x1: 390, y1: 40 },
    { text: "FIRE ALARM", x0: 220, y0: 100, x1: 310, y1: 110 },
    { text: "CONTROL PANEL", x0: 220, y0: 112, x1: 330, y1: 122 },
    { text: "POINT NAME'S IDENTIFICATION", x0: 520, y0: 220, x1: 680, y1: 230 },
    { text: "(CORRESPONDS TO CONTROL", x0: 520, y0: 232, x1: 670, y1: 242 },
    { text: "ABBREVIATIONS)", x0: 520, y0: 244, x1: 620, y1: 254 },
    { text: "POINT NAME'S NUMBER", x0: 520, y0: 300, x1: 650, y1: 310 },
    { text: "(CONSECUTIVELY COUNTED IN RESPECT TO", x0: 520, y0: 312, x1: 690, y1: 322 },
    { text: "CONTROL ABBREVIATIONS)", x0: 520, y0: 324, x1: 660, y1: 334 },
    { text: "POINT NUMBER", x0: 520, y0: 380, x1: 610, y1: 390 },
    { text: "(CONSECUTIVELY", x0: 520, y0: 392, x1: 620, y1: 402 },
    { text: "COUNTED)", x0: 520, y0: 404, x1: 580, y1: 414 },
    { text: "FILTER TYPE DIAGRAMS", x0: 110, y0: 470, x1: 300, y1: 490 },
  ], { ...isolated, maxGlyphDimPx: 120 });

  const points = glyphs.filter((glyph) => /^POINT\b/.test(glyph.caption));
  assert.deepEqual(points.map((glyph) => glyph.caption), [
    "POINT NAME'S IDENTIFICATION (CORRESPONDS TO CONTROL ABBREVIATIONS)",
    "POINT NAME'S NUMBER (CONSECUTIVELY COUNTED IN RESPECT TO CONTROL ABBREVIATIONS)",
    "POINT NUMBER (CONSECUTIVELY COUNTED)",
  ]);
  assert.deepEqual(points.map((glyph) => [glyph.kind, glyph.seedable]), [
    ["annotation", false], ["annotation", false], ["annotation", false],
  ]);
  assert.equal(new Set(points.map((glyph) => glyph.rect.flat().join(","))).size, 3,
    "each definition owns its own leader terminus");
  assert.ok(points.every((glyph) => glyph.heading === "CONTROL ELECTRICAL COMPONENTS"));
  assert.ok(glyphs.every((glyph) => glyph.caption !== "FILTER TYPE DIAGRAMS"));
});

test("findLegendGlyphs: a routed baseline and its attached invert leader receive one-to-one geometry", () => {
  const glyphs = findLegendGlyphs(flat([
    seg(100, 100, 360, 100),
    seg(180, 100, 180, 135),
    seg(174, 118, 180, 100), seg(186, 118, 180, 100),
    seg(180, 135, 195, 135),
  ]), [
    { text: "PIPING SYMBOLS", x0: 70, y0: 20, x1: 450, y1: 45 },
    { text: "BELOW GROUND PIPING", x0: 400, y0: 92, x1: 620, y1: 112 },
    { text: "INVERT: -10'-0\"", x0: 200, y0: 116, x1: 330, y1: 136 },
    { text: "PIPE INVERT ELEVATION TAG", x0: 400, y0: 140, x1: 650, y1: 160 },
  ], { ...isolated, maxGlyphDimPx: 300 });

  assert.deepEqual(glyphs.map((glyph) => [glyph.caption, glyph.kind, glyph.seedable]), [
    ["BELOW GROUND PIPING", "line_style", false],
    ["PIPE INVERT ELEVATION TAG", "annotation", false],
  ]);
  assert.notDeepEqual(glyphs[0].rect, glyphs[1].rect);
  assert.ok(glyphs[0].rect[1][1] < glyphs[1].rect[1][1],
    "the routed row owns only the baseline while the callout owns its leader");
});

test("findLegendGlyphs: explicit PLAN VIEW and DETAIL VIEW columns create groups only for dual-rendition rows", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 30, y), seg(x + 30, y, x + 30, y + 30),
    seg(x + 30, y + 30, x, y + 30), seg(x, y + 30, x, y),
  ];
  const glyphs = findLegendGlyphs(flat([
    ...box(100, 110), ...box(200, 110),
    ...box(200, 210),
  ]), [
    { text: "VALVE AND FITTING SYMBOLS", x0: 50, y0: 10, x1: 350, y1: 35 },
    { text: "PLAN VIEW", x0: 75, y0: 60, x1: 155, y1: 80 },
    { text: "DETAIL VIEW", x0: 180, y0: 60, x1: 285, y1: 80 },
    { text: "GLOBE VALVE", x0: 320, y0: 115, x1: 470, y1: 135 },
    { text: "UNION", x0: 320, y0: 215, x1: 390, y1: 235 },
  ], { maxGlyphDimPx: 160 });

  assert.deepEqual(glyphs.map((glyph) => [glyph.caption, glyph.kind, glyph.seedable]), [
    ["GLOBE VALVE", "symbol_group", false],
    ["UNION", "symbol", true],
  ]);
  assert.equal(glyphs[0].member_rects?.length, 2);
  assert.equal(glyphs[1].member_rects, undefined);
});

test("findLegendGlyphs: a downshifted continuation is rebalanced after one lower glyph's fragments consolidate", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const glyphs = findLegendGlyphs(flat([
    ...box(100, 100, 136, 138),
    // The lower device has disconnected internal strokes. In a compact
    // column they can separately claim BYPASS and INVERTER before the
    // physical glyph is consolidated.
    ...box(102, 149, 133, 178),
    seg(106, 155, 117, 155), seg(106, 159, 117, 159),
    ...box(100, 215, 136, 247),
  ]), [
    { text: "ELECTRICAL SCHEMATIC/GENERAL SYMBOLS", x0: 60, y0: 30, x1: 430, y1: 55 },
    { text: "UNINTERRUPTIBLE POWER SUPPLY WITH", x0: 220, y0: 114, x1: 560, y1: 133 },
    { text: "BYPASS", x0: 220, y0: 136, x1: 295, y1: 155 },
    { text: "INVERTER", x0: 220, y0: 156, x1: 315, y1: 175 },
    { text: "RECTIFIER", x0: 220, y0: 220, x1: 315, y1: 239 },
  ], { ...isolated, maxGlyphDimPx: 120 });

  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "UNINTERRUPTIBLE POWER SUPPLY WITH BYPASS",
    "INVERTER",
    "RECTIFIER",
  ]);
});

test("findLegendGlyphs: a standalone mounting modifier and its object name keep one physical legend identity", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const glyphs = findLegendGlyphs(flat([
    ...box(100, 100, 174, 107),
    ...box(118, 120, 156, 126),
    ...box(100, 190, 135, 215),
  ]), [
    { text: "LIGHT FIXTURES", x0: 60, y0: 30, x1: 250, y1: 55 },
    { text: "UNDER CABINET", x0: 220, y0: 95, x1: 375, y1: 114 },
    { text: "LIGHT FIXTURE", x0: 220, y0: 117, x1: 360, y1: 136 },
    { text: "TRACK LIGHT", x0: 220, y0: 192, x1: 340, y1: 211 },
  ], { ...isolated, maxGlyphDimPx: 120 });

  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "UNDER CABINET LIGHT FIXTURE",
    "TRACK LIGHT",
  ]);
  assert.equal(glyphs[0].member_rects?.length, 2);
});

test("findLegendGlyphs: a routed assembly's object noun is rebalanced away from the next installed device", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const glyphs = findLegendGlyphs(flat([
    ...box(80, 100, 190, 108),
    ...box(112, 132, 154, 156),
    ...box(110, 205, 158, 235),
  ]), [
    { text: "ELECTRICAL EQUIPMENT", x0: 60, y0: 30, x1: 300, y1: 55 },
    { text: "MULTI-OUTLET ASSEMBLY WITH POWER", x0: 220, y0: 89, x1: 560, y1: 108 },
    { text: "RECEPTACLES", x0: 220, y0: 111, x1: 350, y1: 130 },
    { text: "AUTOMATIC TRANSFER SWITCH", x0: 220, y0: 133, x1: 500, y1: 152 },
    { text: "VARIABLE FREQUENCY DRIVE", x0: 220, y0: 210, x1: 490, y1: 229 },
  ], { ...isolated, maxGlyphDimPx: 140 });

  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "MULTI-OUTLET ASSEMBLY WITH POWER RECEPTACLES",
    "AUTOMATIC TRANSFER SWITCH",
    "VARIABLE FREQUENCY DRIVE",
  ]);
  assert.equal(glyphs[0].kind, "line_style");
  assert.equal(glyphs[0].seedable, false);
});

test("findLegendGlyphs: a compact notation block cannot absorb the following installed-device row", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const glyphs = findLegendGlyphs(flat([
    ...box(100, 100, 140, 130),
    ...box(102, 144, 138, 174),
    ...box(100, 220, 140, 250),
  ]), [
    { text: "ELECTRICAL EQUIPMENT", x0: 60, y0: 30, x1: 300, y1: 55 },
    { text: "ANNOTATIONS-WP DENOTES WEATHERPROOF,", x0: 220, y0: 91, x1: 600, y1: 110 },
    { text: "FA (xA) DENOTES FUSE RATING", x0: 220, y0: 113, x1: 500, y1: 132 },
    { text: "EMERGENCY SHUT DOWN PUSHBUTTON", x0: 220, y0: 145, x1: 570, y1: 164 },
    { text: "VARIABLE FREQUENCY DRIVE", x0: 220, y0: 225, x1: 490, y1: 244 },
  ], { ...isolated, maxGlyphDimPx: 120 });

  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "ANNOTATIONS-WP DENOTES WEATHERPROOF, FA (xA) DENOTES FUSE RATING",
    "EMERGENCY SHUT DOWN PUSHBUTTON",
    "VARIABLE FREQUENCY DRIVE",
  ]);
  assert.deepEqual(glyphs.map((glyph) => glyph.seedable), [false, true, true]);
});

test("findLegendGlyphs: a typical-all variants row is a nonseedable symbol group", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const [glyph] = findLegendGlyphs(flat([
    ...box(100, 100, 125, 125), ...box(145, 100, 170, 125),
  ]), [
    { text: "LIGHT FIXTURES", x0: 60, y0: 30, x1: 260, y1: 55 },
    {
      text: "TYPICAL FOR ALL EXIT SIGNS. ARROWS INDICATE DIRECTION OF TRAVEL.",
      x0: 220, y0: 102, x1: 760, y1: 122,
    },
  ], { ...isolated, maxGlyphDimPx: 120 });

  assert.ok(glyph);
  assert.equal(glyph.kind, "symbol_group");
  assert.equal(glyph.seedable, false);
  assert.equal(glyph.member_rects?.length, 2);
});

test("findLegendGlyphs: mounting words downshifted onto following equipment rows return to their own captions", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const glyphs = findLegendGlyphs(flat([
    ...box(100, 100, 132, 128),
    ...box(100, 145, 132, 173),
    ...box(100, 190, 132, 218),
  ]), [
    { text: "ELECTRICAL BOXES AND WIRING DEVICES", x0: 60, y0: 30, x1: 430, y1: 55 },
    { text: "SPECIAL EQUIPMENT CONNECTION-WALL", x0: 220, y0: 91, x1: 570, y1: 110 },
    { text: "MOUNTED", x0: 220, y0: 113, x1: 310, y1: 132 },
    { text: "SPECIAL EQUIPMENT CONNECTION-FLOOR", x0: 220, y0: 136, x1: 580, y1: 155 },
    { text: "MOUNTED", x0: 220, y0: 158, x1: 310, y1: 177 },
    { text: "SPECIAL EQUIPMENT CONNECTION-CEILING OR EQUIPMENT MOUNTED", x0: 220, y0: 181, x1: 760, y1: 200 },
  ], { ...isolated, maxGlyphDimPx: 120 });

  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "SPECIAL EQUIPMENT CONNECTION-WALL MOUNTED",
    "SPECIAL EQUIPMENT CONNECTION-FLOOR MOUNTED",
    "SPECIAL EQUIPMENT CONNECTION-CEILING OR EQUIPMENT MOUNTED",
  ]);
});

test("findLegendGlyphs: explicit paired alternatives and optional direction marks cannot become one sweep seed", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const interlocked = findLegendGlyphs(flat([
    ...box(100, 100, 130, 130), ...box(130, 100, 160, 130),
  ]), [
    { text: "ELECTRICAL SCHEMATIC/GENERAL SYMBOLS", x0: 60, y0: 30, x1: 440, y1: 55 },
    {
      text: "INTERLOCKED NORMALLY OPEN (NO) & NORMALLY CLOSED (NC) DISCONNECT SWITCHES",
      x0: 220, y0: 102, x1: 800, y1: 122,
    },
  ], { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(interlocked[0]?.kind, "symbol_group");
  assert.equal(interlocked[0]?.seedable, false);

  const diffuser = findLegendGlyphs(flat([
    ...box(100, 200, 135, 235),
    seg(142, 214, 165, 214), seg(158, 208, 165, 214), seg(158, 220, 165, 214),
  ]), [
    { text: "MECHANICAL PLAN SYMBOLS", x0: 60, y0: 130, x1: 350, y1: 155 },
    {
      text: "DIFFUSER, SQUARE OR RECTANGULAR. ARROW INDICATES AIRFLOW DIRECITON.",
      x0: 220, y0: 202, x1: 760, y1: 222,
    },
  ], { ...isolated, maxGlyphDimPx: 120 });
  assert.equal(diffuser[0]?.kind, "symbol_group");
  assert.equal(diffuser[0]?.seedable, false);
});

test("findLegendGlyphs: monitoring equipment expands a misleading line fragment into its full discrete symbol", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const [glyph] = findLegendGlyphs(flat([
    // The description baseline is closest to this lone top stroke, while
    // the adjacent coil and enclosure carry the actual symbol identity.
    // The right wall misses both rails by a sub-grid PDF coordinate seam.
    seg(132, 100, 152, 100),
    seg(132, 122, 152, 122),
    seg(153.4, 101.4, 153.4, 120.6),
    ...box(100, 94, 124, 122),
  ]), [
    { text: "ELECTRICAL SCHEMATIC/GENERAL SYMBOLS", x0: 60, y0: 30, x1: 440, y1: 55 },
    { text: "CIRCUIT MONITORING EQUIPMENT", x0: 220, y0: 101, x1: 520, y1: 121 },
  ], { ...isolated, maxGlyphDimPx: 120 });

  assert.ok(glyph);
  assert.equal(glyph.kind, "symbol");
  assert.equal(glyph.seedable, true);
  assert.ok(glyph.rect[0][0] <= 100 && glyph.rect[1][0] >= 154.2,
    "the evidence must own the device components, not only the nearest line");
});

test("findLegendGlyphs: a heading-like object name remains a caption inside a proven RCP cell grid", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [
    seg(x0, y0, x1, y0), seg(x1, y0, x1, y1),
    seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
  ];
  const glyphs = findLegendGlyphs(flat([
    ...box(100, 100, 135, 135), ...box(300, 100, 335, 135),
    ...box(100, 260, 135, 295), ...box(300, 260, 335, 295),
  ]), [
    { text: "RCP LEGEND", x0: 60, y0: 30, x1: 380, y1: 55 },
    { text: "LIGHT FIXTURES", x0: 75, y0: 150, x1: 175, y1: 170 },
    { text: "EMERGENCY EGRESS LIGHT FIXTURES", x0: 255, y0: 150, x1: 390, y1: 170 },
    { text: "SMOKE DETECTOR", x0: 75, y0: 310, x1: 175, y1: 330 },
    { text: "OCCUPANCY SENSOR", x0: 255, y0: 310, x1: 390, y1: 330 },
  ], { maxGlyphDimPx: 100 });

  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "LIGHT FIXTURES",
    "EMERGENCY EGRESS LIGHT FIXTURES",
    "SMOKE DETECTOR",
    "OCCUPANCY SENSOR",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.heading === "RCP LEGEND"));
});

test("findLegendGlyphs: adjacent complete drafting actions remain separate rows", () => {
  const box = (y: number): number[][] => [
    seg(100, y, 140, y), seg(140, y, 140, y + 30),
    seg(140, y + 30, 100, y + 30), seg(100, y + 30, 100, y),
  ];
  const glyphs = findLegendGlyphs(flat([
    ...box(100), ...box(145),
  ]), [
    { text: "GENERAL", x0: 60, y0: 30, x1: 180, y1: 55 },
    { text: "REMOVE TO THIS POINT", x0: 220, y0: 104, x1: 430, y1: 124 },
    { text: "CONNECT NEW TO EXISTING", x0: 220, y0: 149, x1: 470, y1: 169 },
  ], { ...isolated, maxGlyphDimPx: 100 });

  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "REMOVE TO THIS POINT",
    "CONNECT NEW TO EXISTING",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.kind === "annotation" && !glyph.seedable));
});

test("findLegendGlyphs: a side-titled HVAC zone grid pairs left hatch swatches and stays nonseedable", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 40, y), seg(x + 40, y, x + 40, y + 40),
    seg(x + 40, y + 40, x, y + 40), seg(x, y + 40, x, y),
    seg(x, y, x + 40, y + 40),
  ];
  const rows = [
    ["AHU-1", 100, 100], ["VAV-1", 300, 100], ["FCU-1", 500, 100],
    ["AHU-2", 100, 170], ["VAV-2", 300, 170], ["FCU-2", 500, 170],
  ] as const;
  const glyphs = findLegendGlyphs(flat(rows.flatMap(([, x, y]) => box(x, y))), [
    { text: "HVAC ZONE LEGEND", x0: 760, y0: 105, x1: 960, y1: 130 },
    ...rows.map(([text, x, y]): LegendSpan => ({
      text, x0: x + 55, y0: y + 5, x1: x + 125, y1: y + 35,
    })),
  ]);

  assert.deepEqual(glyphs.map((glyph) => glyph.caption), [
    "AHU-1", "VAV-1", "FCU-1", "AHU-2", "VAV-2", "FCU-2",
  ]);
  assert.ok(glyphs.every((glyph) => glyph.heading === "HVAC ZONE LEGEND"
    && glyph.kind === "annotation" && glyph.seedable === false));
  assert.deepEqual(glyphs[0].rect, [[100, 100], [140, 140]]);
});

test("findLegendGlyphs: repeated plan tags and hatch boxes without a zone-legend title are not a zone legend", () => {
  const box = (x: number, y: number): number[][] => [
    seg(x, y, x + 40, y), seg(x + 40, y, x + 40, y + 40),
    seg(x + 40, y + 40, x, y + 40), seg(x, y + 40, x, y),
  ];
  const rows = [
    ["VAV-1", 100, 100], ["VAV-2", 300, 100],
    ["VAV-3", 100, 170], ["VAV-4", 300, 170],
  ] as const;
  const glyphs = findLegendGlyphs(flat(rows.flatMap(([, x, y]) => box(x, y))),
    rows.map(([text, x, y]): LegendSpan => ({
      text, x0: x + 55, y0: y + 5, x1: x + 125, y1: y + 35,
    })));
  assert.deepEqual(glyphs, []);
});

test("findLegendGlyphs: dense vector sheets compute callout bounds without overflowing the argument stack", () => {
  const dense: number[] = [];
  for (let index = 0; index < 70_000; index++) {
    const y = 10_000 + index;
    dense.push(10_000, y, 10_010, y);
  }
  assert.doesNotThrow(() => findLegendGlyphs(dense, [
    { text: "MECHANICAL SYMBOLS", x0: 20, y0: 20, x1: 300, y1: 45 },
  ]));
});
