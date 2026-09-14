#!/usr/bin/env node
// Phase 1 annotation aid (GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md) — compute a
// real, vector-grounded tight body bbox for a human-marqueed seed rect. This
// calls fingerprintSymbol exactly as symbolsweep.ts itself does — a neutral,
// deterministic "which segments sit fully inside this rect" extraction, not
// a symbol-identity judgment — so the reported bbox is grounded in the PDF's
// own geometry, never eyeballed off a raster render and never "derived from
// engine output" in the sense the goal forbids (no match/score/accept
// decision is consulted, only raw segment containment).
//
// Usage:
//   node --import tsx scripts/annotate-body-bbox.mjs PDF PAGE X0 Y0 X1 Y1
import path from "node:path";

import { Session } from "../src/session.ts";
import { textSpans } from "../src/pdf.ts";
import { fingerprintSymbol } from "../../web/src/lib/symbolsweep.ts";

const [pdfArg, pageArg, x0, y0, x1, y1] = process.argv.slice(2);
if (!pdfArg || !pageArg || [x0, y0, x1, y1].some((v) => v === undefined)) {
  console.error("usage: annotate-body-bbox.mjs PDF PAGE X0 Y0 X1 Y1");
  process.exit(2);
}
const page = Number(pageArg);
const seedRect = [[Number(x0), Number(y0)], [Number(x1), Number(y1)]];

const session = new Session();
const source = path.resolve(pdfArg);
const loaded = await session.loadPlan(source);
const sheet = loaded.sheets[page - 1];
if (!sheet) throw new Error(`page ${page} is absent (PDF has ${loaded.sheets.length})`);

const state = session.sheet(sheet.sheet);
const geo = await session.ensureGeometry(state);
// Mirrors Session.symbolSweep's own `if (!s.spans) s.spans = textSpans(s.page);`
// exactly, so this tool's textBoxes exclusion matches what the production
// seed step actually sees.
if (!state.spans) state.spans = textSpans(state.page);
const textBoxes = state.spans.map((sp) => [sp.x0, sp.y0, sp.x1, sp.y1]);

const fp = fingerprintSymbol(geo.segs, seedRect, geo.lum, { textBoxes });
let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
for (const [ax, ay, bx, by] of fp.rel) {
  const px0 = fp.center[0] + ax, py0 = fp.center[1] + ay;
  const px1 = fp.center[0] + bx, py1 = fp.center[1] + by;
  bx0 = Math.min(bx0, px0, px1); by0 = Math.min(by0, py0, py1);
  bx1 = Math.max(bx1, px0, px1); by1 = Math.max(by1, py0, py1);
}
console.log(JSON.stringify({
  source, page, sheet: sheet.sheet, seed_rect: seedRect,
  center: [+fp.center[0].toFixed(1), +fp.center[1].toFixed(1)],
  footprint_px: +fp.footprint.toFixed(1),
  segments: fp.segments,
  dropped_glyph_segments: fp.droppedGlyphSegments ?? 0,
  body_bbox: [bx0, by0, bx1, by1].map((v) => +v.toFixed(1)),
}, null, 2));
