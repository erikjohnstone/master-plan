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
