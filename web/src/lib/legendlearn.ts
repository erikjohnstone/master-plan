// Auto-learn a job's OWN legend (accuracy-hardening plan Phase 1, pivoted
// from hand-digitizing a fixed shape library after an explicit ask: "are we
// learning new symbols as we go, or scanning the legend once and reusing
// it?"). There is no single national HVAC symbol standard — every firm
// keeps its own house legend — so the actual answer to "insanely accurate
// across the whole corpus" isn't a bigger fixed reference-shape library
// (hvacRefShapes.ts), it's reading THIS job's own legend sheet automatically
// and handing each row's real geometry to the ALREADY-EXISTING, already-
// tested sweep engine (symbolsweep.ts's fingerprintSymbol/matchSymbol/
// sweepRatio) — no hand-digitizing, no marqueeing, no fixed inventory.
//
// This module does ONLY the new work: given a legend sheet's own vector
// segments and text spans, find every (glyph, caption) row pair. It does
// NOT sweep anything itself — the caller feeds each detected rect into
// symbol_sweep (scope: "set") exactly as if a human had marqueed it,
// reusing that tool's own cross-scale ratio (#186) and refusal doctrine
// untouched. Pure, no PDF/DOM — segments and spans in, glyph/caption pairs
// out.
// Connectivity reuses buildMepGraph's own robust JTS noding (mepconnectivity.ts,
// maturity plan Phase 4) — NOT a naive endpoint-to-endpoint union-find. Found
// live, against this exact real legend: a glyph's own actuator box connects to
// its valve body by a STEM whose own endpoint lands on the MIDDLE of the box's
// bottom edge (a real T-junction), and the "bowtie" itself is drawn as two
// full corner-to-corner diagonals whose crossing point is the shape's visual
// center — nowhere a segment's own endpoint sits. A first, naive version of
// this module (endpoint-proximity clustering only) silently split every such
// glyph into 2-3 disconnected fragments, each independently paired with a
// caption — never caught by any synthetic fixture, only by testing against
// this real, messy sheet. buildMepGraph already solves exactly this class of
// problem (real CAD linework: T-junctions, mid-edge touches, near-coincident
// duplicates) via JTS's UnaryUnionOp; reused here purely for its noding,
// never for anything MEP-specific (no layers, no system classification).
import { buildMepGraph } from "./mepconnectivity.ts";

export type Point = [number, number];

export interface LegendSpan {
  text: string;
  x0: number; y0: number; x1: number; y1: number;
}

export interface LegendGlyph {
  /** The row's own caption, exactly as drawn (whitespace-normalized). */
  caption: string;
  /** Tight bbox around the glyph's own segments, image px — feed this
   * straight into symbol_sweep's own seed_rect. */
  rect: [Point, Point];
  /** Edges (noded) inside the glyph's own connected component — informational
   * only, a rough proxy for "how much real linework is here." */
  segments: number;
}

/** Connected components of a node/edge set (real-junction-aware, via
 * `buildMepGraph`'s own noding) restricted to the given edge list — shared by
 * both the first, whole-sheet pass and the second, grid-stripped pass below,
 * so the two can never silently disagree on how a component's own bbox/edge
 * count is computed. */
function componentsOf(
  nodes: Array<{ x: number; y: number }>, edges: Array<{ a: number; b: number }>,
): Array<{ x0: number; y0: number; x1: number; y1: number; edges: number }> {
  const n = nodes.length;
  if (!n) return [];
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (const e of edges) union(e.a, e.b);
  const groups = new Map<number, { nodeIdxs: number[]; edgeCount: number }>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let g = groups.get(r);
    if (!g) { g = { nodeIdxs: [], edgeCount: 0 }; groups.set(r, g); }
    g.nodeIdxs.push(i);
  }
  for (const e of edges) groups.get(find(e.a))!.edgeCount++;
  return [...groups.values()].map((g) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const i of g.nodeIdxs) {
      const nd = nodes[i];
      x0 = Math.min(x0, nd.x); x1 = Math.max(x1, nd.x);
      y0 = Math.min(y0, nd.y); y1 = Math.max(y1, nd.y);
    }
    return { x0, y0, x1, y1, edges: g.edgeCount };
  });
}

/** Connected components of `segs`, real-junction-aware (T-junctions, mid-edge
 * touches, crossings) via buildMepGraph's own robust noding — a real glyph is
 * one connected cluster of strokes; a component whose own bbox is a long
 * straight run (a table rule/column divider, not a symbol) is filtered out by
 * the caller via `looksLikeGlyph` below, not here.
 *
 * SECOND PASS, additive only (accuracy-hardening plan, ledger item 44): a
 * real, BORDERED symbol/description table (found live: itd-d1-lab's own
 * "CONTROLS LEGEND" — three ruled tables, ~22 real rows) draws its own
 * ruled grid (outer border, column divider, per-row rules) as linework that
 * routinely TOUCHES a cell's own icon, so the first pass's connectivity
 * clustering fuses the WHOLE table — every icon plus the entire grid — into
 * one giant component that `looksLikeGlyph` correctly rejects as "not a
 * compact glyph," discarding every real row inside it. Measured directly on
 * that exact real table before writing this: its own edge-length
 * distribution is sharply BIMODAL — 32 short edges (43-100px, real glyph
 * strokes and short cell rules) and 25 long ones (300px+: a column divider,
 * row-height rules, the ~758px outer border), with a clean, empty gap from
 * ~100px to ~300px between them — not a close call needing a delicate
 * threshold. So: any component that fails `looksLikeGlyph` (too big) gets
 * ONE retry — strip every edge at least `gridLineMinPx` long (a real
 * multiple of the seed glyph's own bound, sized well inside that measured
 * gap) and re-run connectivity on what's left, restricted to that
 * component's own original nodes only. Each resulting sub-component is
 * returned as an ADDITIONAL candidate alongside the originals — this can
 * only ever recover rows from a component that was already being discarded
 * whole; an already-compact, already-accepted glyph is never touched. */
function clusterSegments(
  segs: number[], maxGlyphDimPx: number,
): { components: Array<{ x0: number; y0: number; x1: number; y1: number; edges: number }>; gridPx: number } {
  if (!segs.length) return { components: [], gridPx: 0 };
  const graph = buildMepGraph(segs, {});
  if (!graph.nodes.length) return { components: [], gridPx: graph.quantGridPx };
  const first = componentsOf(graph.nodes, graph.edges);
  // sized well inside the measured real gap (~100-300px on the real table
  // this was found against) — a multiple of the caller's own glyph bound,
  // not an independent magic number.
  const gridLineMinPx = maxGlyphDimPx * 2;
  const recovered: Array<{ x0: number; y0: number; x1: number; y1: number; edges: number }> = [];
  for (const c of first) {
    if (looksLikeGlyph(c, c.edges, maxGlyphDimPx)) continue;   // already usable — no retry needed
    const inBox = new Set<number>();
    graph.nodes.forEach((nd, i) => { if (nd.x >= c.x0 && nd.x <= c.x1 && nd.y >= c.y0 && nd.y <= c.y1) inBox.add(i); });
    const strippedEdges = graph.edges.filter((e) => e.length < gridLineMinPx && inBox.has(e.a) && inBox.has(e.b));
    if (!strippedEdges.length) continue;
    for (const sub of componentsOf(graph.nodes, strippedEdges)) if (sub.edges > 0) recovered.push(sub);
  }
  return { components: [...first, ...recovered], gridPx: graph.quantGridPx };
}

/** Is this cluster shaped like a real, compact drafting glyph rather than a
 * table rule, column divider, or border? A glyph is roughly as tall as it
 * is wide (within a generous ratio) and small relative to `maxDim` (the
 * caller's own "biggest plausible glyph" bound, e.g. a fraction of the
 * sheet's own width) — a long single or near-single-segment run is
 * neither. */
function looksLikeGlyph(bbox: { x0: number; y0: number; x1: number; y1: number }, segCount: number, maxDim: number): boolean {
  const w = bbox.x1 - bbox.x0, h = bbox.y1 - bbox.y0;
  if (w <= 0 || h <= 0) return false;
  if (w > maxDim || h > maxDim) return false;
  const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
  if (aspect > 6 && segCount <= 2) return false;   // a bare rule line, not a symbol
  return true;
}

/** A real caption is routinely drawn as SEVERAL separate text runs on one
 * line, not one string — confirmed live against the real Eglin AFB legend:
 * "2-WAY ELECTRIC CONTROL VALVE" arrives as three runs, "2" + "-" + "WAY
 * ELECTRIC CONTROL VALVE", with near-zero gaps between them (a font/kerning
 * boundary, not a real word break). Pairing a glyph against the FIRST such
 * fragment alone ("2") would mislabel it — merge same-row, tightly-adjacent
 * runs into one logical caption before pairing. `mergeGapPx` bounds how
 * close two runs on the same row must sit to be considered one caption
 * (small — real word spacing is far wider than a font-kerning seam). */
function mergeCaptionLines(spans: LegendSpan[], mergeGapPx: number): LegendSpan[] {
  const sorted = [...spans].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const used = new Array(sorted.length).fill(false);
  const out: LegendSpan[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let cur = { ...sorted[i] };
    for (;;) {
      let next = -1;
      for (let j = 0; j < sorted.length; j++) {
        if (used[j]) continue;
        const s = sorted[j];
        // same row: meaningful vertical overlap with the run built so far
        const overlap = Math.min(cur.y1, s.y1) - Math.max(cur.y0, s.y0);
        if (overlap <= 0) continue;
        const gap = s.x0 - cur.x1;
        if (gap < -1 || gap > mergeGapPx) continue;   // -1: tolerate 1px overlap/rounding
        next = j;
        break;
      }
      if (next < 0) break;
      const s = sorted[next];
      used[next] = true;
      cur = {
        text: `${cur.text}${s.text}`,
        x0: Math.min(cur.x0, s.x0), y0: Math.min(cur.y0, s.y0),
        x1: Math.max(cur.x1, s.x1), y1: Math.max(cur.y1, s.y1),
      };
    }
    out.push(cur);
  }
  return out;
}

/** A real caption routinely WRAPS across two physical lines too (confirmed
 * live: "2-WAY CONTROL VALVE" / "WITH INTEGRAL THERMOSTAT" on the real
 * Eglin AFB legend, same row's own second line) — merge a merged caption
 * LINE (from mergeCaptionLines above) with the next line directly below it
 * when they share nearly the same left margin (a real wrapped caption's
 * own continuation, not an unrelated adjacent row) and sit close enough
 * vertically that no glyph-sized gap separates them. */
function mergeWrappedCaptions(lines: LegendSpan[], maxLineGapPx: number, maxIndentDriftPx: number): LegendSpan[] {
  const sorted = [...lines].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const used = new Array(sorted.length).fill(false);
  const out: LegendSpan[] = [];
  // A real caption wraps to at most a couple of lines — a whole COLUMN of
  // short, unrelated entries sharing one left margin (a real case: the
  // legend's own plain "CONTROL ABBREVIATIONS" list, dozens of rows, no
  // glyph next to any of them) must never be swallowed into one giant
  // caption just because each row sits close to the next with the same
  // indent. Capped, not unbounded.
  const MAX_WRAP_LINES = 2;
  for (let i = 0; i < sorted.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let cur = { ...sorted[i] };
    let mergedCount = 1;
    for (; mergedCount < MAX_WRAP_LINES;) {
      let next = -1;
      for (let j = 0; j < sorted.length; j++) {
        if (used[j] || j === i) continue;
        const s = sorted[j];
        if (s.y0 < cur.y1) continue;               // must sit BELOW the current line
        if (s.y0 - cur.y1 > maxLineGapPx) continue; // …and close enough to be a wrap, not a new row
        if (Math.abs(s.x0 - cur.x0) > maxIndentDriftPx) continue;   // same left margin
        next = j;
        break;
      }
      if (next < 0) break;
      const s = sorted[next];
      used[next] = true;
      mergedCount++;
      cur = {
        text: `${cur.text} ${s.text}`,
        x0: Math.min(cur.x0, s.x0), y0: Math.min(cur.y0, s.y0),
        x1: Math.max(cur.x1, s.x1), y1: Math.max(cur.y1, s.y1),
      };
    }
    out.push(cur);
  }
  return out;
}

/** Find every (glyph, caption) row pair on a legend sheet. `maxGlyphDimPx`
 * bounds how big a single glyph's own bbox may be (default: a generous but
 * real bound, tunable per sheet resolution) — segments outside every
 * cluster's own compact bbox (table borders, column dividers, the sheet's
 * own frame) are naturally excluded by `looksLikeGlyph`, not by a region
 * the caller must already know. `maxCaptionGapPx` bounds how far a
 * caption's own left edge may sit from its glyph's own right edge (same
 * row) before they're considered unrelated — real, measured legend layouts
 * (Eglin AFB) leave a real gap of ~90px between an icon and its own
 * caption at this sheet's own resolution; a real, DIFFERENT bordered-table
 * legend (itd-d1-lab's own "CONTROLS LEGEND," ledger item 44) measured
 * wider — a real 124-138px gap between a recovered SYMBOL-column icon and
 * its own DESCRIPTION-column caption, because the two columns themselves
 * sit further apart — so the default widens to comfortably cover both real,
 * measured layouts rather than the one the module was first validated
 * against; still bounded well short of a genuinely unrelated column over. */
export function findLegendGlyphs(
  segs: number[], rawSpans: LegendSpan[],
  opts: { maxGlyphDimPx?: number; maxCaptionGapPx?: number; captionMergeGapPx?: number; maxWrapGapPx?: number; maxWrapIndentPx?: number } = {},
): LegendGlyph[] {
  const maxGlyphDimPx = opts.maxGlyphDimPx ?? 80;
  const maxCaptionGapPx = opts.maxCaptionGapPx ?? 150;
  if (!segs.length || !rawSpans.length) return [];
  const lines = mergeCaptionLines(rawSpans, opts.captionMergeGapPx ?? 3);
  const spans = mergeWrappedCaptions(lines, opts.maxWrapGapPx ?? 8, opts.maxWrapIndentPx ?? 5);

  const { components: clusters, gridPx } = clusterSegments(segs, maxGlyphDimPx);
  // Real, measured bug (accuracy-hardening plan, this session): a cluster's
  // bbox here is built from buildMepGraph's own NODED node coordinates,
  // which are quantized to its solved snap grid (quantGridPx) before
  // noding ever runs — so the bbox can sit up to half a grid cell inside
  // where the glyph's own RAW drawn segments truly end. Measured live
  // against itd-d1-lab-mechanical.pdf#16's real "CONTROLS LEGEND": the
  // opposed-blade-damper glyph's real blade strokes end at y=878.16,
  // quantized to y=878.4 at this sheet's unscaled 1.8px grid. A zero-margin
  // rect built straight from that quantized bbox, fed into symbol_sweep's
  // own fingerprintSymbol (which requires BOTH endpoints strictly inside
  // the rect, by design — see symbolsweep.ts), kept only 1 of the glyph's
  // real 6 segments — a near-empty "fingerprint" that then matched almost
  // any lone stroke on a plan sheet at score 1.0 rather than corroborating
  // or refusing. Padding by half the grid that ACTUALLY produced this
  // bbox (never a fixed guessed px count — the retry ladder can coarsen
  // this grid on a dense real sheet, and the pad has to coarsen with it)
  // closes this without touching fingerprintSymbol's own, separately
  // correct "strictly inside" contract.
  const pad = gridPx / 2;
  const candidates: { rect: [Point, Point]; segments: number }[] = [];
  for (const c of clusters) {
    if (!looksLikeGlyph(c, c.edges, maxGlyphDimPx)) continue;
    candidates.push({ rect: [[c.x0 - pad, c.y0 - pad], [c.x1 + pad, c.y1 + pad]], segments: c.edges });
  }

  // Pair each candidate with the nearest caption to its RIGHT, same row
  // (vertical overlap with the glyph's own y-span, within a generous
  // margin) — real legend layout, icon then caption. A candidate with no
  // nearby caption is unlabeled and dropped; a caption claimed by more
  // than one candidate goes to the nearest one only.
  const used = new Set<number>();
  const out: LegendGlyph[] = [];
  for (const cand of candidates) {
    const [[x0, y0], [x1, y1]] = cand.rect;
    const cy0 = y0 - (y1 - y0) * 0.5, cy1 = y1 + (y1 - y0) * 0.5;
    let best = -1, bestGap = Infinity;
    for (let si = 0; si < spans.length; si++) {
      if (used.has(si)) continue;
      const s = spans[si];
      if (s.x0 < x1) continue;             // must sit to the RIGHT of the glyph
      if (s.y1 < cy0 || s.y0 > cy1) continue;   // must overlap the glyph's own row band
      const gap = s.x0 - x1;
      if (gap > maxCaptionGapPx) continue;
      if (gap < bestGap) { bestGap = gap; best = si; }
    }
    if (best < 0) continue;
    used.add(best);
    out.push({ caption: spans[best].text.trim().replace(/\s+/g, " "), rect: cand.rect, segments: cand.segments });
  }
  return out;
}
