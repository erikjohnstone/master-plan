#!/usr/bin/env node
// Phase 1 annotation aid (GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md) — batched
// version of annotate-body-bbox.mjs: loads each PDF/page ONCE (Session.loadPlan
// is expensive) and computes a real, vector-grounded tight body bbox for many
// rects in one process, instead of re-loading the whole document per instance.
//
// Usage:
//   node --import tsx scripts/annotate-case-bboxes.mjs REQUESTS.json
//
// REQUESTS.json: { "pdf": "/abs/path.pdf", "items": [
//   { "id": "some-id", "page": 12, "rect": [[x0,y0],[x1,y1]] }, ...
// ] }
// One PDF per file (matches one ground-truth case). Multi-page ("scope: set")
// cases just vary `page` per item; each distinct page is loaded once and
// reused across all items on it.
//
// Output: JSON array, same order as `items`, each either
//   { id, ok: true, center, footprint_px, segments, dropped_glyph_segments, body_bbox }
// or (never throws mid-batch — one bad rect must not lose the rest)
//   { id, ok: false, error }
import { readFileSync } from "node:fs";
import path from "node:path";

import { Session } from "../src/session.ts";
import { textSpans } from "../src/pdf.ts";
import { fingerprintSymbol } from "../../web/src/lib/symbolsweep.ts";

const reqPath = process.argv[2];
if (!reqPath) {
  console.error("usage: annotate-case-bboxes.mjs REQUESTS.json");
  process.exit(2);
}
const req = JSON.parse(readFileSync(path.resolve(reqPath), "utf8"));
if (!req.pdf || !Array.isArray(req.items)) throw new Error("REQUESTS.json needs {pdf, items[]}");

const session = new Session();
const loaded = await session.loadPlan(path.resolve(req.pdf));

const geoCache = new Map(); // page number -> {geo, textBoxes} — geometry cache ONLY.
function sheetMetaForPage(page) {
  const sheetMeta = loaded.sheets[page - 1];
  if (!sheetMeta) throw new Error(`page ${page} is absent (PDF has ${loaded.sheets.length})`);
  return sheetMeta;
}

const results = [];
for (const item of req.items) {
  try {
    const sheetMeta = sheetMetaForPage(item.page);
    const state = session.sheet(sheetMeta.sheet);
    let entry = geoCache.get(item.page);
    if (!entry) {
      const geo = await session.ensureGeometry(state);
      if (!state.spans) state.spans = textSpans(state.page);
      const textBoxes = state.spans.map((sp) => [sp.x0, sp.y0, sp.x1, sp.y1]);
      entry = { geo, textBoxes };
      geoCache.set(item.page, entry);
    }
    const fp = fingerprintSymbol(entry.geo.segs, item.rect, entry.geo.lum, { textBoxes: entry.textBoxes });
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const [ax, ay, bx, by] of fp.rel) {
      const px0 = fp.center[0] + ax, py0 = fp.center[1] + ay;
      const px1 = fp.center[0] + bx, py1 = fp.center[1] + by;
      bx0 = Math.min(bx0, px0, px1); by0 = Math.min(by0, py0, py1);
      bx1 = Math.max(bx1, px0, px1); by1 = Math.max(by1, py0, py1);
    }
    results.push({
      id: item.id, ok: true,
      center: [+fp.center[0].toFixed(1), +fp.center[1].toFixed(1)],
      footprint_px: +fp.footprint.toFixed(1),
      segments: fp.segments,
      dropped_glyph_segments: fp.droppedGlyphSegments ?? 0,
      body_bbox: [bx0, by0, bx1, by1].map((v) => +v.toFixed(1)),
    });
  } catch (e) {
    results.push({ id: item.id, ok: false, error: String(e?.message || e), stack: process.env.DEBUG ? String(e?.stack) : undefined });
  }
}
console.log(JSON.stringify(results, null, 2));
