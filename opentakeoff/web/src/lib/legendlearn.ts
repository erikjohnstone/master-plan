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
// segments and text spans, find structurally corroborated (glyph, caption)
// row pairs. It does NOT sweep anything itself. A discrete legend glyph is
// a visual identity reference: locate and corroborate a real plan-scale
// occurrence before using symbol_sweep. A routed-system line swatch is
// learned as legend truth but is explicitly non-seedable for EA counting.
// Pure, no PDF/DOM — segments and spans in, glyph/caption pairs out.
// Connectivity must recognize crossings and T-junctions, not merely shared
// endpoints. Legend learning only needs connected-component bounds, however;
// constructing a complete JTS overlay graph here used to dominate cold corpus
// evaluation. The local spatially indexed segment union below preserves those
// junction semantics without manufacturing every noded sub-edge.

export type Point = [number, number];

export interface LegendSpan {
  text: string;
  x0: number; y0: number; x1: number; y1: number;
}

export interface LegendGlyph {
  /** The row's own caption, exactly as drawn (whitespace-normalized). */
  caption: string;
  /** Exact bbox of the text run(s) that own `caption`, image px. Keeping
   * this next to the glyph rect makes the one-to-one assignment auditable
   * instead of asking a caller to reconstruct it from page text later. */
  caption_bbox: [Point, Point];
  /** Tight bbox around the glyph's own segments, image px. This is legend-
   * scale evidence, not automatically a valid plan-scale sweep seed. */
  rect: [Point, Point];
  /** Edges (noded) inside the glyph's own connected component — informational
   * only, a rough proxy for "how much real linework is here." */
  segments: number;
  /** Number of rows supporting the same repeated glyph/caption column.
   * This is structural evidence, not a probabilistic confidence score. */
  aligned_rows: number;
  /** Nearby heading that established a legend/symbol context, when one was
   * present. Null means the row cleared the stronger unheaded-layout bar. */
  heading: string | null;
  /** Discrete device glyphs can proceed to plan-anchor corroboration. A
   * line-style or drafting annotation is valid legend truth but is not an
   * EA-count symbol. */
  kind: "symbol" | "symbol_group" | "line_style" | "annotation" | "control_function";
  seedable: boolean;
  seed_warning?: string;
  /** Connected member boxes when a row's visual evidence is disconnected.
   * Multiple small collinear members can still be one seedable glyph; two
   * substantial independent members make the row a non-seedable
   * `symbol_group` whose variants must be anchored separately on a plan. */
  member_rects?: [Point, Point][];
}

export interface LegendLearnOptions {
  maxGlyphDimPx?: number;
  maxCaptionGapPx?: number;
  captionMergeGapPx?: number;
  maxWrapGapPx?: number;
  maxWrapIndentPx?: number;
  /** Maximum physical text lines owned by one caption. Real control legends
   * use three; the finite cap prevents same-margin abbreviation columns from
   * being swallowed. Production default: 3. */
  maxWrapLines?: number;
  /** Minimum repeated rows in one aligned glyph/caption column. Production
   * callers should keep the default. A value of 1 is useful only in small
   * geometry-focused unit fixtures. */
  minAlignedRows?: number;
  /** A headerless layout needs substantially more repeated rows than a
   * headed legend. This is the conservative escape hatch for CAD exports
   * whose section title is outlines rather than extractable text. */
  minUnheadedRows?: number;
}

export type LegendLearnStatus = "ok" | "no_rows" | "unsupported_caption_text" | "unsupported_geometry";

export function legendLearnStatus(
  segs: number[], rawSpans: LegendSpan[], glyphs: LegendGlyph[],
): { status: LegendLearnStatus; note?: string } {
  if (glyphs.length) return { status: "ok" };
  const segmentCount = Math.floor(segs.length / 4);
  const textChars = rawSpans.reduce((sum, span) => sum + span.text.trim().length, 0);
  const declaresLegend = rawSpans.some((span) => isLegendHeadingText(span.text));
  const typicalTextHeight = Math.max(6, median(rawSpans
    .map((span) => span.y1 - span.y0)
    .filter((height) => height > 2 && height <= 120)) || 12);
  const belowCaptionHeadings = rawSpans.filter((span) => isBelowCaptionLegendHeading(span.text));
  // A declared two-dimensional cell legend cannot truthfully become an
  // "empty" legend merely because the export converted its local captions
  // or symbols to non-extractable graphics. Measure the finite band beneath
  // each heading instead of the whole sheet: a P&ID may contain thousands of
  // perfectly extractable sequence-note characters elsewhere while nearly
  // every legend-cell label itself is vector-outlined. Two stray surviving
  // labels are insufficient evidence for a repeated grid.
  if (belowCaptionHeadings.length && segmentCount >= 1000) {
    const localDomainCaptions = belowCaptionHeadings.flatMap((heading) => rawSpans.filter((span) =>
      span.y0 >= heading.y1
      && span.y0 <= heading.y1 + typicalTextHeight * 30
      && span.x1 >= heading.x0 - typicalTextHeight * 5
      && span.y1 - span.y0 <= typicalTextHeight * 2.5
      && meaningfulCaption(span.text)
      && !isLegendHeadingText(span.text)
      && isHvacBasCaption(span.text),
    ));
    if (localDomainCaptions.length < 3) {
      return {
        status: "unsupported_caption_text",
        note: "This sheet declares a cell-style legend, but fewer than three local HVAC/BAS captions are present as usable PDF text while dense vector linework remains. The legend lettering is incomplete or outlined; use OCR/visual review and do not treat zero learned rows as an empty legend.",
      };
    }
    return {
      status: "unsupported_geometry",
      note: "This sheet declares a cell-style legend with usable local captions, but its graphic cells did not yield structurally corroborated vector glyphs. Use visual review and do not treat zero learned rows as an empty legend.",
    };
  }
  // Some AutoCAD exports preserve tens of thousands of vector strokes but
  // convert almost all legend lettering to outlines. The few extractable
  // spans are title-block metadata, so "0 rows" would be a false assertion.
  if (declaresLegend && rawSpans.length < 200 && segmentCount >= 1000 && textChars / segmentCount < 0.05) {
    return {
      status: "unsupported_caption_text",
      note: "This sheet declares a legend/symbol section and has dense vector linework, but its caption lettering is not present as usable PDF text (commonly AutoCAD text converted to outlines). Zero learned rows is unsupported, not an empty legend; use OCR/visual review and do not treat this result as complete.",
    };
  }
  return {
    status: "no_rows",
    note: "No structurally corroborated (glyph, caption) legend rows were detected. This may be a non-legend sheet or a layout outside the supported vector-glyph/extractable-caption path; do not interpret it as proof that the project has no symbols.",
  };
}

/** Connected components of `segs`, real-junction-aware (T-junctions, mid-edge
 * touches, crossings) — a real glyph is
 * one connected cluster of strokes; a component whose own bbox is a long
 * straight run (a table rule/column divider, not a symbol) is filtered out by
 * the caller via `looksLikeGlyph` below, not here.
 *
 * GRID STRIPPING (accuracy-hardening plan, ledger item 44): a
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
 * threshold. Strip every edge at least `gridLineMinPx` long (a real multiple
 * of the seed glyph's own bound, sized well inside that measured gap) before
 * connectivity. Such an edge cannot fit inside any bbox the caller can
 * accept as a glyph, so it is impossible output rather than evidence.
 * Removing it before JTS also prevents the ruled table from forcing a
 * whole-sheet snap-overlay operation merely to reject those edges later. */
function clusterSegments(
  segs: number[], maxGlyphDimPx: number, maxLineStyleDimPx: number,
): { components: Array<{ x0: number; y0: number; x1: number; y1: number; edges: number }>; gridPx: number } {
  if (!segs.length) return { components: [], gridPx: 0 };
  // A segment at least twice the maximum allowed glyph dimension cannot be
  // part of any component this function can return as a glyph. These are the
  // table borders/dividers that the old second pass removed only AFTER
  // feeding the entire ruled sheet through JTS noding. On a real Federal
  // legend that made GeometrySnapper spend tens of seconds intersecting ink
  // guaranteed to be rejected. Remove that impossible ink before noding;
  // every segment that could fit a returned glyph is preserved.
  // The impossible-ink threshold must also preserve the independently
  // bounded routed-line swatches. On small-text sheets a real 227px piping
  // key can exceed 2× the compact-device bound by a pixel; stripping it as
  // a table rule before classification made intact keys vanish while broken
  // keys survived. Anything above both accepted bounds is still impossible.
  const gridLineMinPx = Math.max(maxGlyphDimPx * 2, maxLineStyleDimPx * 1.05);
  const gridPx = 1.8;
  const quantize = (v: number) => Math.round(v / gridPx) * gridPx;
  type Seg = { ax: number; ay: number; bx: number; by: number; x0: number; y0: number; x1: number; y1: number };
  const strokes: Seg[] = [];
  for (let i = 0; i < segs.length; i += 4) {
    if (Math.hypot(segs[i + 2] - segs[i], segs[i + 3] - segs[i + 1]) < gridLineMinPx) {
      const ax = quantize(segs[i]), ay = quantize(segs[i + 1]);
      const bx = quantize(segs[i + 2]), by = quantize(segs[i + 3]);
      if (ax === bx && ay === by) continue;
      strokes.push({ ax, ay, bx, by, x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) });
    }
  }
  if (!strokes.length) return { components: [], gridPx };

  const parent = Array.from({ length: strokes.length }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
    (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const intersects = (a: Seg, b: Seg): boolean => {
    if (a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0) return false;
    const o1 = orient(a.ax, a.ay, a.bx, a.by, b.ax, b.ay);
    const o2 = orient(a.ax, a.ay, a.bx, a.by, b.bx, b.by);
    const o3 = orient(b.ax, b.ay, b.bx, b.by, a.ax, a.ay);
    const o4 = orient(b.ax, b.ay, b.bx, b.by, a.bx, a.by);
    return ((o1 === 0 || o2 === 0 || Math.sign(o1) !== Math.sign(o2))
      && (o3 === 0 || o4 === 0 || Math.sign(o3) !== Math.sign(o4)));
  };

  // Each retained stroke is shorter than 2*maxGlyphDimPx, so indexing its
  // bbox into maxGlyphDimPx cells keeps candidate pairs local and bounded.
  const cell = Math.max(1, maxGlyphDimPx);
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];
    const candidates = new Set<number>();
    for (let gx = Math.floor(s.x0 / cell); gx <= Math.floor(s.x1 / cell); gx++) {
      for (let gy = Math.floor(s.y0 / cell); gy <= Math.floor(s.y1 / cell); gy++) {
        const key = `${gx},${gy}`;
        for (const j of buckets.get(key) || []) candidates.add(j);
      }
    }
    for (const j of candidates) if (intersects(s, strokes[j])) union(i, j);
    for (let gx = Math.floor(s.x0 / cell); gx <= Math.floor(s.x1 / cell); gx++) {
      for (let gy = Math.floor(s.y0 / cell); gy <= Math.floor(s.y1 / cell); gy++) {
        const key = `${gx},${gy}`;
        const bucket = buckets.get(key);
        if (bucket) bucket.push(i);
        else buckets.set(key, [i]);
      }
    }
  }

  const groups = new Map<number, { x0: number; y0: number; x1: number; y1: number; edges: number }>();
  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];
    const root = find(i);
    const group = groups.get(root);
    if (group) {
      group.x0 = Math.min(group.x0, s.x0); group.y0 = Math.min(group.y0, s.y0);
      group.x1 = Math.max(group.x1, s.x1); group.y1 = Math.max(group.y1, s.y1);
      group.edges++;
    } else {
      groups.set(root, { x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1, edges: 1 });
    }
  }
  return { components: [...groups.values()], gridPx };
}

/** Is this cluster shaped like a real, compact drafting glyph rather than a
 * table rule, column divider, or border? A glyph is roughly as tall as it
 * is wide (within a generous ratio) and small relative to `maxDim` (the
 * caller's own "biggest plausible glyph" bound, e.g. a fraction of the
 * sheet's own width) — a long single or near-single-segment run is
 * neither. */
function looksLikeGlyph(
  bbox: { x0: number; y0: number; x1: number; y1: number }, segCount: number,
  maxDim: number, maxLineStyleDim: number,
): boolean {
  const w = bbox.x1 - bbox.x0, h = bbox.y1 - bbox.y0;
  if (w <= 0 && h <= 0) return false;
  // Routed-system legend keys are horizontal swatches read left-to-right
  // into a caption. A vertical one-dimensional run beside prose is a
  // diagram riser, table divider, or leader — never such a key. This exact
  // false-positive family occurs on real control-sequence sheets. Give the
  // horizontal swatch its own modestly wider bound: intact real piping keys
  // can be slightly longer than the discrete-device box, while table rules
  // remain far beyond this cap and grid stripping remains unchanged.
  if (w <= 0) return false;
  if (h <= 0) return w <= maxLineStyleDim;
  // Many CAD legends draw the system abbreviation as outlined lettering
  // directly on the line. The connected component is then a long, shallow
  // swatch rather than a one-pixel stroke (real CHWR keys are ~7.4:1).
  if (w / h >= 6) return w <= maxLineStyleDim;
  if (w > maxDim || h > maxDim) return false;
  const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
  if (aspect > 40 && segCount <= 2) return w > h;
  return true;
}

/** Keep only linework that could geometrically belong to a glyph which the
 * pairing pass below can return for one of the known captions.
 *
 * A returned glyph is at most maxGlyphDimPx wide/high, sits to a caption's
 * left within maxCaptionGapPx, and overlaps that caption's row after the
 * pairing pass's half-height expansion. The boxes below are deliberately
 * wider than those exact limits. Any segment contributing to a pairable
 * glyph intersects one such box; intersection (not endpoint containment)
 * preserves a longer stem that JTS splits at a mid-edge glyph junction.
 * Everything else is guaranteed dead work for this function. A coarse box
 * grid keeps the filter linear on 80k-segment plan/legend hybrids.
 */
function segmentsNearCaptions(
  segs: number[], spans: LegendSpan[], maxGlyphDimPx: number, maxCaptionGapPx: number,
  searchBelowCaption: ((span: LegendSpan) => boolean) | null = null,
  rightCaptionGap: ((span: LegendSpan) => number) | null = null,
): number[] {
  const boxes = spans.flatMap((s) => {
    const allowedRightGap = Math.max(maxCaptionGapPx, rightCaptionGap?.(s) ?? 0);
    const rightCaptionBox = {
      x0: s.x0 - allowedRightGap - maxGlyphDimPx,
      x1: s.x0,
      y0: s.y0 - maxGlyphDimPx * 1.5,
      y1: s.y1 + maxGlyphDimPx * 1.5,
    };
    const boxesForSpan = [rightCaptionBox];
    if (!searchBelowCaption?.(s)) return boxesForSpan;
    // RCP and device-cell legends center symbols ABOVE their descriptions.
    // Search only a finite page-scaled band above each text run. This is
    // enabled only on pages that actually declare a legend/symbol section,
    // preserving the narrow plan-sheet fast path and avoiding arbitrary
    // plan labels becoming candidate anchors.
    return [...boxesForSpan, {
      x0: s.x0 - maxGlyphDimPx,
      x1: s.x1 + maxGlyphDimPx,
      y0: s.y0 - maxGlyphDimPx - Math.min(maxCaptionGapPx, maxGlyphDimPx),
      y1: s.y0,
    }];
  });
  const CELL = 256;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    for (let gx = Math.floor(b.x0 / CELL); gx <= Math.floor(b.x1 / CELL); gx++) {
      for (let gy = Math.floor(b.y0 / CELL); gy <= Math.floor(b.y1 / CELL); gy++) {
        const key = `${gx},${gy}`;
        const entries = grid.get(key);
        if (entries) entries.push(i);
        else grid.set(key, [i]);
      }
    }
  }
  const out: number[] = [];
  for (let i = 0; i < segs.length; i += 4) {
    const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
    const sx0 = Math.min(ax, bx), sx1 = Math.max(ax, bx);
    const sy0 = Math.min(ay, by), sy1 = Math.max(ay, by);
    const candidates = new Set<number>();
    for (let gx = Math.floor(sx0 / CELL); gx <= Math.floor(sx1 / CELL); gx++) {
      for (let gy = Math.floor(sy0 / CELL); gy <= Math.floor(sy1 / CELL); gy++) {
        for (const j of grid.get(`${gx},${gy}`) || []) candidates.add(j);
      }
    }
    if ([...candidates].some((j) => {
      const b = boxes[j];
      return sx0 <= b.x1 && sx1 >= b.x0 && sy0 <= b.y1 && sy1 >= b.y0;
    })) out.push(ax, ay, bx, by);
  }
  return out;
}

/** A real caption is routinely drawn as SEVERAL separate text runs on one
 * line, not one string — confirmed live against the real Eglin AFB legend:
 * "2-WAY ELECTRIC CONTROL VALVE" arrives as three runs, "2" + "-" + "WAY
 * ELECTRIC CONTROL VALVE", with near-zero gaps between them (a font/kerning
 * boundary, not a real word break). Pairing a glyph against the FIRST such
 * fragment alone ("2") would mislabel it — merge same-row, tightly-adjacent
 * runs into one logical caption before pairing. `mergeGapPx` bounds how
 * close two runs on the same row must sit to be considered one caption
 * The adaptive production bound also admits one missing inline notation or
 * list-marker cell, while remaining well inside a real table-column gap. */
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
        if (gap > 10) {
          const left = normalizedCaption(cur.text);
          const right = normalizedCaption(s.text);
          const extendedInlineJoin = /[(:]\s*$/.test(left)
            || /^•/.test(left)
            || (/^INDICATES\b/i.test(right)
              && /(?:^|\s)[+']?[A-Z0-9][A-Z0-9./_-]{0,7}'?$/i.test(left));
          // A larger adaptive gap is reserved for an explicit inline-mark
          // or bullet/key grammar. Do not merge a terse tag inside a glyph
          // (CO) with the independent description column to its right.
          if (!extendedInlineJoin) continue;
        }
        next = j;
        break;
      }
      if (next < 0) break;
      const s = sorted[next];
      used[next] = true;
      const gap = s.x0 - cur.x1;
      const leftText = cur.text.trimEnd();
      const rightText = s.text.trimStart();
      // PDF text runs can split both at a font seam and at a real word
      // space. A seam is normally sub-pixel (CO + subscript 2, 2 + "-"),
      // whereas even a compact visible word space is a measurable fraction
      // of the local lettering height. Preserve punctuation joins, but put
      // the missing space back between two alphanumeric runs once that
      // geometric word-gap threshold is crossed. This keeps 2-WAY and CO2
      // intact while recovering CO2 SENSOR from CO + subscript 2 + SENSOR.
      const localTextHeight = Math.max(1, Math.min(
        cur.y1 - cur.y0,
        s.y1 - s.y0,
      ));
      const alphanumericBoundary = /[A-Z0-9)]$/i.test(leftText)
        && /^[A-Z0-9(]/i.test(rightText);
      const hasVisibleWordGap = gap > Math.max(1, localTextHeight * 0.12);
      const separator = gap > 10 || (alphanumericBoundary && hasVisibleWordGap) ? " " : "";
      cur = {
        text: `${cur.text}${separator}${s.text}`,
        x0: Math.min(cur.x0, s.x0), y0: Math.min(cur.y0, s.y0),
        x1: Math.max(cur.x1, s.x1), y1: Math.max(cur.y1, s.y1),
      };
    }
    out.push(cur);
  }
  return out;
}

type RectBox = { x0: number; y0: number; x1: number; y1: number };
type GlyphCandidate = { rect: [Point, Point]; segments: number; kind: "symbol" | "line_style" };
type GlyphMember = { rect: [Point, Point]; segments: number };
type PairCandidate = {
  rect: [Point, Point];
  segments: number;
  members: GlyphMember[];
  span: LegendSpan;
  caption: string;
  /** Physical caption lines already owned by this row. Pairing starts at
   * one; recovery/merge passes carry the count forward so the configured
   * wrap cap remains real even when a glyph fragment initially stole one
   * of those lines. */
  captionLines: number;
  kind: "symbol" | "line_style" | "text_symbol";
  /** True when source row rules, not proximity alone, own this pair. */
  structuredRow?: boolean;
  /** Exact horizontal-rule band that owns a structured row. Internal only:
   * it lets the structured pass repair one source row without replacing an
   * already-correct heuristic row elsewhere in the same table. */
  structuredBand?: [number, number];
  /** Source text used only when a ruled row has no usable vector member. */
  structuredTextSymbol?: string;
  /** Physical legend layout. Most legends put the caption to the glyph's
   * right; RCP/fire/electrical cell legends commonly center it below;
   * material legends commonly put the swatch to the caption's right. */
  layout: "right" | "below" | "left";
};

function glyphKind(
  rect: [Point, Point], gridPx = 1.8, segments = 1, maxGlyphDimPx = Infinity,
  rawSpans: LegendSpan[] = [],
): "symbol" | "line_style" {
  const w = rect[1][0] - rect[0][0], h = rect[1][1] - rect[0][1];
  const aspect = Math.max(w, h) / Math.max(gridPx, Math.min(w, h));
  if (w <= h) return "symbol";
  if (Math.min(w, h) <= gridPx * 2.5 && aspect >= 6) return "line_style";
  // A coded line swatch can include several outline-letter segments, but
  // it remains longer than the compact-device bound. A compact multi-edge
  // reducer with the same aspect ratio is still a discrete fitting.
  const hasEmbeddedSystemCode = rawSpans.some((span) => {
    const text = normalizedCaption(span.text);
    if (!/^[A-Z0-9./-]{1,10}$/i.test(text)) return false;
    const cx = (span.x0 + span.x1) / 2;
    const cy = (span.y0 + span.y1) / 2;
    return cx > rect[0][0] && cx < rect[1][0] && cy > rect[0][1] && cy < rect[1][1]
      && span.x0 - rect[0][0] >= gridPx * 3
      && rect[1][0] - span.x1 >= gridPx * 3;
  });
  return w > maxGlyphDimPx && aspect >= 7 && hasEmbeddedSystemCode ? "line_style" : "symbol";
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function normalizedCaption(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** A leading dash in a SYMBOL / DESCRIPTION table is a visual column
 * separator, not part of the learned identity. Keep raw normalization
 * untouched because an isolated "-" can join split identifiers (MS/TP -
 * UUKL); canonicalize only complete legend captions. */
function canonicalLegendCaption(text: string): string {
  return normalizedCaption(text).replace(/^[-–—]\s*/, "");
}

function isLegendHeadingText(text: string): boolean {
  const normalized = normalizedCaption(text);
  if (normalized.length > 80) return false;
  const words = normalized.split(/\s+/).filter(Boolean).length;
  const shortDeclarativeHeading = words <= 8
    && /\b(?:LEGEND|SYMBOLS?|NOTATIONS?)\b/i.test(normalized)
    // Definition prose inside a legend routinely says "symbol indicates".
    // Even when that fragment is only eight words long, it is a caption
    // continuation rather than a nested heading.
    && !/\b(?:SEE|REFER\s+TO|LEGEND\s+NOTES?|POSITION\s+LEGEND|NOTE\s*\d+|INDICATES?|DENOTES)\b/i.test(normalized)
    // A row can legitimately name a drafting symbol. Treating identities
    // such as CONTINUATION SYMBOL or PLAN REFERENCE NOTE SYMBOL as nested
    // headings drops their own geometry and lets them claim the rows below.
    && !isDraftingAnnotationCaption(normalized);
  return shortDeclarativeHeading
    || /^SYMBOL$/i.test(normalized)
    || /^(?:(?:CONTROL|HVAC|MECHANICAL|ELECTRICAL|SYSTEM|DEVICE|NETWORK)\s+)?COMPONENTS$/i.test(normalized)
    || /\bPOINT\s+FUNCTION(?:\s+SCHEDULE)?\b/i.test(normalized)
    || /^(?:GENERAL|LIGHTING|EQUIPMENT|DEVICES|ONE-LINE\s+DIAGRAM|POWER\s+DEVICES|POWER\s+DISTRIBUTION\s+EQUIPMENT|TELEPHONE\s*(?:&|AND)\s*DATA\s+SYSTEMS|FIRE\s+ALARM|GROUNDING\s+AND\s+LIGHTNING\s+PROTECTION|LIGHTNING\s+PROTECTION\s+AND\s+GROUNDING|ELECTRICAL\s+BOXES\s+AND\s+WIRING\s+DEVICES|ELECTRICAL\s+EQUIPMENT|LIGHT\s+CONTROLS|LIGHT\s+FIXTURES|TELECOMMUNICATIONS|SECURITY|CIRCUITING|FIRE\s+DETECTION\s+AND\s+NOTIFICATION|WIRE,?\s+CONDUIT\s+AND\s+RACEWAY|EQUIPMENT\s+CONNECTIONS)$/i.test(normalized)
    || /^(?:DUCTWORK|PIPING|(?:DUCTWORK|PIPING)\s+SYSTEM\s+ABBREVIATIONS|PIPE\s+ACCESSORY\s+TAGS?|VALVES(?:\s+AND\s+PIPING\s+ACCESSORIES)?|DUCTWORK\s+ACCESSORIES|AIR\s+DISTRIBUTION\s+DEVICES|GRILLES?[,\s]+REGISTERS?\s*(?:&|AND)\s*DIFFUSERS?(?:\s+TAGS?)?|MECHANICAL\s+EQUIPMENT\s+TAGS?|DAMPER\s+TAGS?)$/i.test(normalized);
}

/** A named MEP discipline section is stronger ownership evidence than a
 * generic SYMBOLS/GENERAL header. These labels describe a bounded symbol
 * vocabulary and may legitimately contain only one row (for example one
 * wireless-access-point mark between adjacent ruled section headings). */
function isSpecificDisciplineLegendHeading(text: string): boolean {
  return /^(?:LIGHTING|EQUIPMENT|ONE-LINE\s+DIAGRAM|POWER\s+DEVICES|POWER\s+DISTRIBUTION\s+EQUIPMENT|TELEPHONE\s*(?:&|AND)\s*DATA\s+SYSTEMS|FIRE\s+ALARM|GROUNDING\s+AND\s+LIGHTNING\s+PROTECTION|LIGHTNING\s+PROTECTION\s+AND\s+GROUNDING|ELECTRICAL\s+BOXES\s+AND\s+WIRING\s+DEVICES|ELECTRICAL\s+EQUIPMENT|LIGHT\s+CONTROLS|LIGHT\s+FIXTURES|TELECOMMUNICATIONS|SECURITY|CIRCUITING|FIRE\s+DETECTION\s+AND\s+NOTIFICATION|WIRE,?\s+CONDUIT\s+AND\s+RACEWAY|EQUIPMENT\s+CONNECTIONS)$/i.test(normalizedCaption(text));
}

/** Below-caption cell recovery is a specialized reflected-ceiling topology.
 * A generic LEGEND/SYMBOLS heading is not sufficient: ordinary mechanical
 * sheets often have a conventional right-caption legend near the top and a
 * title block or control diagram elsewhere whose boxes happen to sit above
 * short text. Restricting this alternate orientation to semantic RCP
 * headings, plus explicit P&ID symbol-legend headings, is document-general
 * (not project/page keyed) and keeps those
 * remote structures out of legend ownership. */
function isBelowCaptionLegendHeading(text: string): boolean {
  const normalized = normalizedCaption(text);
  const namesReflectedCeiling = /\bRCP\b/i.test(normalized)
    || /\bREFLECTED\s+CEILING(?:\s+PLAN)?\b/i.test(normalized);
  const namesPidSymbolLegend = /\bP\s*&\s*ID\b/i.test(normalized)
    && /\bSYMBOL\s+LEGEND\b/i.test(normalized);
  // Notes such as "refer to architectural reflected ceiling plans" are
  // common on mechanical sheets. They name another drawing but do not
  // declare local legend ownership.
  return namesPidSymbolLegend
    || (namesReflectedCeiling && /\b(?:LEGEND|SYMBOLS?)\b/i.test(normalized));
}

/** Domain evidence is required when a heading is generic (plain SYMBOLS)
 * or absent. This is deliberately a component/system vocabulary, not a
 * project token list: it separates HVAC/BAS legend captions from room-tag,
 * keynote, structural-material, design-criteria, and title-block columns. */
function isHvacBasCaption(text: string): boolean {
  return /\b(?:ACCESS\s+POINT|ACTUATOR|AIR|AIRFLOW|ALARM|ANALOG|BACNET|BAS|BOILER|BREAKER|CHILLER|CIRCUIT|COIL|CONDUCTOR|CONDUIT|CONNECTION|CONTROL|CONTROLLER|DAMPER|DDC|DIFFUSER|DIGITAL|DISCONNECT|DRIVE|DUCT(?:WORK)?|ELECTRICAL|EQUIPMENT|EXHAUST|FAN|FILTER|FIRE|FIXTURE|FLOW|GAUGE|GENERATOR|GRILLE|GROUND|GROUNDING|HEAT|HUMIDITY|INPUT|JUNCTION|LIGHTING|LOUVER|METER|MOTOR|NETWORK|OUTLET|OUTPUT|PANELBOARD|PIPE|PIPING|PNEUMATIC|POWER|PRESSURE|PUMP|RACEWAY|RECEPTACLE|REFRIGERANT|REGISTER|REGULATOR|RELAY|RETURN|SENSOR|SIGNAL|SMOKE|STEAM|SUPPLY|SWITCH|TEMPERATURE|TERMINAL|THERMOSTAT|TRANSFORMER|TRANSMITTER|VALVE|VENT|VFD|VOLTAGE|WATER|WIRE|WIRELESS)\b/i.test(normalizedCaption(text));
}

function isDomainHeading(text: string): boolean {
  return /\b(?:AIR|BAS|CONDUIT|CONNECTION|CONTROLS?|DATA|DDC|DAMPER|DEVICES?|DUCT|ELECTRICAL|EQUIPMENT|FIRE|GROUNDING|HVAC|LIGHTING|LINE|MECHANICAL|PIPING|POINT|POWER|RACEWAY|SENSING|TELEPHONE|VALVE|WIRE)\b/i.test(normalizedCaption(text));
}

/** Explicit general-drafting vocabularies are real legends even when their
 * rows are not predominantly MEP terms. They still need repeated geometry
 * and ordinary heading ownership; this predicate only removes the HVAC/BAS
 * word-density requirement after that structural proof has succeeded. */
function isGeneralDraftingLegendHeading(text: string): boolean {
  return /^(?:GENERAL(?:\s+SYMBOLS?)?|STANDARD\s+SYMBOLS|ARCHITECTURAL\s+SYMBOLS?|STANDARD\s+MATERIALS\s+LEGEND)$/i.test(normalizedCaption(text));
}

function supportsUnderlinedMultiColumnJurisdiction(text: string): boolean {
  // ARCHITECTURAL LEGEND commonly titles an abbreviation glossary. Only a
  // title that explicitly declares SYMBOLS may waive the HVAC/BAS vocabulary
  // gate for a general drafting panel.
  return /^(?:STANDARD\s+SYMBOLS|ARCHITECTURAL\s+SYMBOLS?|STANDARD\s+MATERIALS\s+LEGEND)$/i.test(normalizedCaption(text));
}

function isMaterialLegendHeading(text: string | null): boolean {
  return !!text && /\bMATERIALS?\s+LEGEND\b/i.test(normalizedCaption(text));
}

type UnderlinedLegendJurisdiction = { x0: number; x1: number; y: number };

/** Some architectural legend titles are centered over several independent
 * columns. Their real underline is the finite panel boundary: using the
 * title text bbox alone loses the outer columns, while treating every long
 * rule as jurisdiction lets an ordinary legend annex a neighboring panel. */
function underlinedLegendJurisdiction(
  heading: LegendSpan, segs: number[], typicalTextHeight: number,
): UnderlinedLegendJurisdiction | null {
  if (!supportsUnderlinedMultiColumnJurisdiction(heading.text)) return null;
  const headingCenterX = (heading.x0 + heading.x1) / 2;
  const minRuleLength = Math.max(
    typicalTextHeight * 12,
    (heading.x1 - heading.x0) * 1.5,
  );
  const horizontalTolerance = Math.max(1.5, typicalTextHeight * 0.08);
  const candidates: UnderlinedLegendJurisdiction[] = [];
  for (let i = 0; i < segs.length; i += 4) {
    const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
    if (Math.abs(ay - by) > horizontalTolerance) continue;
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx);
    const y = (ay + by) / 2;
    if (x1 - x0 < minRuleLength
      || headingCenterX < x0 - typicalTextHeight
      || headingCenterX > x1 + typicalTextHeight
      || y < heading.y1 - typicalTextHeight * 0.2
      || y > heading.y1 + typicalTextHeight * 2.5) continue;
    candidates.push({ x0, x1, y });
  }
  candidates.sort((a, b) => Math.abs(a.y - heading.y1) - Math.abs(b.y - heading.y1)
    || (b.x1 - b.x0) - (a.x1 - a.x0) || a.x0 - b.x0);
  return candidates[0] ?? null;
}

/** Material subsections are usually typography plus a long underline, not a
 * material swatch. Detect that relation geometrically so headings such as
 * WOOD or INSULATION never become rows, without maintaining a vocabulary of
 * possible construction-material section names. */
function isUnderlinedSubsectionHeading(
  span: LegendSpan, segs: number[], typicalTextHeight: number,
): boolean {
  const width = span.x1 - span.x0;
  const tolerance = Math.max(1.5, typicalTextHeight * 0.18);
  for (let i = 0; i < segs.length; i += 4) {
    const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
    if (Math.abs(ay - by) > tolerance) continue;
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx);
    const y = (ay + by) / 2;
    if (x1 - x0 < Math.max(typicalTextHeight * 5, width * 1.25)) continue;
    if (Math.abs(y - span.y1) > typicalTextHeight * 0.45) continue;
    if (x0 > span.x0 + typicalTextHeight * 0.75
      || x1 < span.x1 + typicalTextHeight * 1.5) continue;
    return true;
  }
  return false;
}

function isSectionBoundaryText(text: string): boolean {
  const normalized = normalizedCaption(text);
  if (!normalized || normalized.length > 100) return false;
  return isLegendHeadingText(normalized)
    // Mentions inside a row description are not boundaries: "see equipment
    // connection schedule" is a common legend caption. Require heading-like
    // text whose final phrase itself names the next section.
    || /^(?:(?:[A-Z0-9&/,\-]+\s+){0,5})?(?:ABBREVIATIONS?|DESIGN\s+CRITERIA|GENERAL\s+(?:PROJECT|MECHANICAL|HVAC|CONTROL)\s+NOTES?|IDENTIFICATION|INDENTIFICATION|LEGEND\s+NOTES?|SCHEDULES?|SEQUENCES?(?:\s+OF\s+OPERATIONS?)?)$/i.test(normalized)
    // Callout-key panels can sit directly beneath a real symbol legend and
    // repeat the same glyph/text column cadence. They describe how a tag is
    // structured, not additional symbol identities, so their explicit title
    // ends the preceding legend section even though it does not begin one.
    || /^(?:(?:AIR\s+DISTRIBUTION|CONTROL\s+DIAGRAM|DIFFUSER|DUCTWORK(?:\s+LINE)?|PIPING(?:\s+LINE)?)\s+CALLOUTS?|ELECTRICAL\s+LINETYPES|FEEDER\s+DESIGNATION\s+LOGIC)$/i.test(normalized);
}

/** Sequence/general-note prose can form a perfectly regular numbered
 * column. A caption-like noun phrase rarely contains several directive
 * verbs; long directive sentences routinely do. Used only as supporting
 * group evidence, never as a lone hard rejection. */
function isDirectiveProse(text: string): boolean {
  const normalized = normalizedCaption(text);
  const words = normalized.split(/\s+/).filter(Boolean).length;
  const signals = normalized.match(/\b(?:SHALL|PROVIDE|REQUIRED|REQUIREMENTS|MUST|WILL|WHERE|WHEN|UNLESS|CONTRACTOR|COORDINATE|INSTALL|MAINTAIN|REFER\s+TO|IN\s+ACCORDANCE)\b/gi)?.length ?? 0;
  return (words >= 10 && signals >= 2) || (words >= 14 && signals >= 1);
}

/** Product drawings and controller pinouts can expose a dense, repeated
 * glyph/text cadence even though every "row" is merely a terminal number,
 * jumper setting, certification mark, or wiring specification printed
 * inside one piece of hardware. These signals are used only to reject an
 * otherwise-headerless group; an explicit legend heading still owns its
 * real rows. */
function isControllerPinoutCaption(text: string): boolean {
  const normalized = normalizedCaption(text);
  const terminalAssignments = normalized.match(/(?:\b\d+\s*-\s*(?:IN|COM|AI|AO|BI|BO|DATA|GND)\b|\b(?:AI|AO|BI|BO|COM|DATA|GND)\s*-\s*\d+\b)/gi)?.length ?? 0;
  return terminalAssignments > 0
    || /\b(?:INPUT|OUTPUT|AO)\s+SETUP(?:\s+JUMPERS?)?\b/i.test(normalized)
    || /^(?:UL\s+LISTED|DRY\s+CONTACT)$/i.test(normalized)
    || /\b(?:CLASS\s*2\s+CIRCUITS?|USE\s+COPPER\s+CONDUCTORS|FOR\s+INDOOR\s+USE\s+ONLY|BACNET\s+MS\s*\/\s*TP)\b/i.test(normalized)
    || /^LBL-[A-Z0-9-]+$/i.test(normalized);
}

/** True legend rows can describe drawing-navigation/status conventions
 * rather than installed work. Preserve them as auditable legend truth, but
 * never promote them to discrete Symbol Sweep seeds. */
function isDraftingAnnotationCaption(text: string): boolean {
  const normalized = canonicalLegendCaption(text);
  if (/^ANNOTATIONS?\b/i.test(normalized)) return true;
  if (/^(?:ELECTRICAL\s+EQUIPMENT\s+FOOTPRINT\b|DUCTWORK\s+SHOWING\s+SIZE\s+AND\s+SYSTEM$|DUCT\s+SECTION\s*[-–—:]\s*(?:SUPPLY|RETURN|EXHAUST|OUTSIDE|RELIEF|TRANSFER)\b)/i.test(normalized)) return true;
  if (/^(?:FEEDER\s+REFERENCE\s+TAG|POINT\s+OF\s+CONNECTION\s*[-–—:]\s*NEW\s+TO\s+EXISTING)$/i.test(normalized)) return true;
  if (/^(?:NUMBER\s+OF\s+DETAIL\s+ON\s+SHEET|NUMBER\s+OF\s+SHEET\s+WHERE\s+DETAIL\s+APPEARS|GENERAL\s+NOTE|PLAN\s+NOTE\s+LIST|(?:SQUARE|OVAL|ROUND)\s+DUCT\s+SIZE\s+TAG\b.*|EXISTING\s+DUCT\s+TAG|DUCT\s+BEING\s+DEMOLISHED|INSULATED\s+METAL\s+PANEL|PIPE\s+(?:SIZE|SLOPE|INVERT\s+ELEVATION|EXISTING)\s+TAG\b.*|EXISTING\s+PIPE\s+TAG|R\s*\(RISE\)\s*,?\s*D\s*\(DROP\)\s*.*|(?:RECTANGULAR|ROUND)\s+(?:SUPPLY\s*\/\s*OUTSIDE|RETURN\s*\/\s*TRANSFER|EXHAUST\s*\/\s*RELIEF)\s+AIR\s+DUCT\s+(?:RISE|DROP)|PIPE\s+(?:TURNED\s+(?:UP|DOWN)(?:\s*\([^)]*\))?|OUT\s+(?:TOP|BOTTOM)))$/i.test(normalized)) return true;
  if (/^(?:SECTION\s+MARK\b.*|DETAIL\s+MARK\b.*|DRAWING\s+TITLE\b.*|DOOR\s+TAG|WINDOW\s+TAG|WALL\s+TYPE\s+TAG|SHEET\s+NOTE\s+MARK\b.*|KEY\s+NOTE\s+MARK\b.*|BREAK\s+LINES?|REVISION\s+BUBBLE\b.*|ELEVATION\s+MARK\b.*|DATUM\s+POINT|SPOT\s+ELEVATION|GRAPHICAL\s+SCALE)$/i.test(normalized)) return true;
  // Row-topology conventions describe how a routed system continues or is
  // oriented on the drawing. They are valid legend truth, but counting the
  // mark would count drafting grammar rather than an installed fitting.
  if (/^(?:CHANGE\s+IN\s+(?:PRESSURE|TEMPERATURE)|CONNECTION,?\s*(?:BOTTOM|TOP)|SLOPE\s+DIRECTION\s*\((?:DOWN|UP)\)|ELBOW,?\s*(?:\d+(?:\.\d+)?°|TURNED\s+(?:DOWN|UP))|TEE,?\s*OUTLET\s+(?:DOWN|UP)|(?:\d+(?:\.\d+)?°\s+)?PIPE\s+RISE(?:\s*\([^)]*\))?\s*\/\s*DROP(?:\s*\([^)]*\))?|(?:RECTANGULAR|ROUND|FLAT\s+OVAL)\s+DUCT\s+SECTION\s+(?:DOWN|UP)(?:\s*,.*)?|DUCT\s+ELBOW\s+(?:DOWN|UP)\s+THROUGH\b.*|(?:EXHAUST|OUTSIDE\s+AIR)\s+DUCT\s+(?:DOWN|UP)\s+THROUGH\b.*\bFAN\b.*)$/i.test(normalized)) return true;
  // Reflected-ceiling legends also explain drawing conventions and finish
  // swatches. These rows are valuable legend truth, but they do not identify
  // discrete installed devices and must never become EA sweep seeds.
  if (/^INDICATES\s+BRACKET\b/i.test(normalized)
    || /^(?:CEILING\s+HEIGHT|EXPOSED\s+CEILING)$/i.test(normalized)
    || /^(?:(?:\d+(?:\.\d+)?\s*['"]?\s*[x×]\s*\d+(?:\.\d+)?\s*['"]?\s+)?ACOUSTICAL\s+(?:TILE|PANEL).*\bCEILING|(?:GWB|GYPSUM(?:\s+BOARD)?)\s+CEILING(?:\s*\/\s*SOFFIT)?|(?:EXT(?:ERIOR)?\s+)?EIFS\b.*\bCEILING)$/i.test(normalized)) return true;
  // Structural and equipment-key legends use compact marks to explain how
  // the drawing is annotated. These captions identify drafting semantics,
  // not separately countable installed objects. Keep the patterns narrow so
  // routed-system rows such as "INDICATES EXISTING ITEM" retain their own
  // line-style classification.
  if (/^(?:INDICATES\s+(?:EQUIPMENT\s+ID|KEYED\s+SHEET\s+NOTE|\(N\)\s+OR\s+\(E\)\s+EQUIPMENT)\b|DENOTES\s+(?:TOP\s+OF\s+STEEL\s+ELEVATION|DIRECTION\s+OF\s+ROOF\s+SLOPE)\b|ARROW\s+INDICATES\s+DIRECTION\b|(?:FLOOR\s+MOUNTED\s+)?CONNECTION\s+POINT\b|(?:POSITIVE|NEGATIVE)\s+PRESSURE\s+DUCT\s+SECTION\b|DUCT\s+SIZE\b|BY\s+(?:ELECTRICAL|PLUMBING|MECHANICAL)\s+CONTRACTOR$|POINT\s+OF\s+(?:CONNECTION(?:\s+OF\s+NEW\s+TO\s+EXISTING\s+WORK)?|DISCONNECT)$|NEW\s+PIPE\s+CONNECTION$|DIRECTION\s+OF\s+PIPE\s+PITCH(?:,?\s+(?:DOWN|UP))?$|PIPE\s+(?:BREAK|CAP\s+OR\s+PLUG|DROP\s*\/\s*(?:PIPE\s+)?RISE|ELBOW(?:,?\s+(?:TURNED\s+)?(?:DOWN|UP))?|TEE(?:,?\s+(?:DOWN|HORIZONTAL|(?:TOP|BOTTOM)\s+CONNECTION(?:,.*)?))?|RISER|RISE|DROP|BRANCH,?\s+(?:TOP|BOTTOM)\s+CONNECTION)$|(?:GRILLE\s*\/\s*REGISTER\s*\/\s*DIFFUSER|EQUIPMENT)\s+TAG$|(?:RECTANGULAR\s+)?(?:EXHAUST\s*\/\s*RETURN|SUPPLY)\s+DUCTWORK\s+(?:DOWN|UP)$)/i.test(normalized)) return true;
  // Electrical schematic legends also contain topology and notation keys
  // beside real equipment/device identities. A connection dot, ground/bond
  // termination, or fixture-type tag describes how to read the drawing; it
  // is not another installed device to send into an EA sweep.
  if (/^(?:[A-Z]{1,3}\s+CONNECTION|NODE\s+OR\s+CONNECTION|BOND\s+TO\b.*\b(?:PIPE|STEEL|STRUCTURE)|LIGHTING\s+FIXTURE\s+TYPE\b.*\bFIXTURE\s+SCHEDULE)\.?$/i.test(normalized)) return true;
  return /^(?:REVISION\s+(?:REFERENCE|MARKER|NUMBER|TAG)|DETAIL\s+(?:REFERENCE|MARKER|NUMBER|TAG|CALLOUT)|DETAIL\s+VIEW\s+OR\s+MATCHING|SHEET\s+NOTE(?:\s+(?:CALLOUT|TAG))?|(?:FEEDER|(?:(?:MECHANICAL|KITCHEN)\s+)?EQUIPMENT)\s+CALL\s*OUT|HOME\s+RUN|HOMERUNS?\s+TO\s+PANEL(?:BOARD)?\b|CONDUIT,?\s*(?:VERTICAL\s+TRANSITION|CAPPED)|CAPPED\s+UNDERGROUND\s+CONDUIT(?:\s+OR\s+STUB\s*UP)?|CONDUIT\s+(?:DROP|RISE|STUB\s*UP)|DEVICE\s+LOCATED\s+AT\s+REMOTE\s+LOCATION|HATCH\s+MARKS\s+IN\s+CONDUIT\s+RUN\b.*|DENOTES\s+EXISTING\s+(?:EQUIPMENT|DEVICES?)(?:\s+OR\s+(?:EQUIPMENT|DEVICES?))?|THIS\s+NOTATION\b.*\bDENOTES\b.*\bMOUNTING\s+HEIGHT\b.*|DUCTWORK\s+(?:BREAK|OR\s+PIPING\s+RISE)|INTAKE\s+OR\s+EXHAUST|(?:DIRECTION\s+OF\s+(?:AIRFLOW|FLOW)|FLOW\s+DIRECTION)|(?:SUPPLY|RETURN,?\s+EXHAUST,?\s+OR\s+TRANSFER)\s+AIRFLOW|(?:INCLINED\s+RISE|DECLINED\s+DROP)\s+WITH\s+RESPECT\s+TO\s+AIRFLOW|(?:UPWARD|DOWNWARD)\s+DIRECTION\s+OF\s+SLOPED\s+PIPING|(?:PIPE\s+DROP\s*\/\s*PIPE\s+RISE|PIP(?:E|ING)\s+(?:UP|DOWN|CONTINUATION)|(?:SUPPLY|RETURN|EXHAUST)?\s*DUCT\s+(?:UP|DOWN)(?:\s*\([^)]*\))?)(?:\s*[.,;:])?$|NEW\s+TO\s+EXISTING\s+CONNECTION\s+POINT|SLOPE\s+PIPE\s+IN\s+DIRECTION\s+OF\s+ARROW|AIR\s+DISTRIBUTION\s+TAG|AIR\s+DEVICE\s+TYPE\.\s+REFER\s+TO\s+SCHEDULE\b.*\bAIR\s+DEVICE\s+WITH\s+(?:ROUND|RECTANGULAR)\s+NECK\s+TAG|(?:LIGHTING\s+FIXTURE|RECEPTACLE\s+DEVICE)\s+TAGS?\b|ELECTRICAL\s+EQUIPMENT\s+AND\s+TAGS\b|DEVIATIONS?\s+OF\s+(?:THE\s+)?ABOVE\s+RECEPTACLE\s+TYPES?\b|[•\-]?\s*INTERNAL\s+(?:GROUND|ARC)\s+FAULT\b|CONTROL\s+ELEMENT\s+TAG|POINT\s+NAME'?S\s+(?:IDENTIFICATION|INDENIFICATION|NUMBER)|(?:DEMOLITION|CONSTRUCTION)\s+NOTE\s+IDENTIFICATION|PLAN\s+REFERENCE\s+NOTE\s+SYMBOL|POINT\s+OF\s+(?:DEMOLITION|CONNECTION,?\s+NEW-TO-EXISTING)\b|CHANGE\s+OF\s+ELEVATION|ROOM\s+(?:TAG|NAME|NUMBER)|PLAN\s+(?:NOTE|NORTH)|CONTINUATION\s+SYMBOL|POINT\s+WHERE\s+NEW\s+CONNECTS\s+TO\s+EXISTING|AREA\s+NOT\s+IN\s+CONTRACT|ITEM\s+TO\s+BE\s+DEMOLISHED|CONNECT\s+TO\s+EXISTING|CONNECT\s+NEW\s+TO\s+EXISTING|(?:DISCONNECT|CONNECT)\s+CONDUCTORS\s+(?:FROM|TO)\s+EQUIPMENT|REMOVE\s+TO\s+THIS\s+POINT|DEMOLISH\s+TO\s+POINT\s+INDICATED|(?:EXTENTS?\s+OF\s+DEMOLITION|OBJECT\s+TO\s+BE\s+REMOVED)|DEMOLITION\b|EXISTING\s+TO\s+REMAIN|DIRECTION\s+OF\s+AIR\s*FLOW|STEEL\s+BARS\s+AS\s+REQUIRED|KEY(?:ED)?\s+(?:CONSTRUCTION\s+)?NOTE|INTERLOCK\s+TO\b|CONNECTION\s+TO\s+(?:CONDUCTOR|STRUCTURE)\b|CONNECTION\s+TO\b.*\b(?:BAS|CONTROL|DDC)\b|EQUIPMENT\s+CONNECTION\s+AS\s+NOTED\b)/i.test(normalized);
}

/** Captions that name a routed medium or drafting line convention rather
 * than one countable installed device. Geometry alone cannot distinguish a
 * hooked/dashed piping swatch from a compact symbol because CAD line keys
 * often contain end hooks and inline system codes. */
function isRoutedSystemCaption(text: string): boolean {
  const normalized = canonicalLegendCaption(text);
  // A caption may mention the medium only to locate a discrete device or
  // describe a directional marker. The terminal word PIPING must not erase
  // that stronger identity (e.g. VALVE IN VERTICAL PIPING). Do not exempt
  // every caption containing DRAIN: CONDENSATE DRAIN PIPING and STORM DRAIN
  // are themselves routed media.
  if (/\bDIRECTION\b/i.test(normalized)
    || /\b(?:ACTUATOR|CLEANOUT|DAMPER|DETECTOR|DIFFUSER|FAN|FILTER|GAUGE|GRILLE|LOUVER|METER|PANELBOARD|PUMP|REGISTER|REGULATOR|RELAY|SENSOR|STARTER|STRAINER|SWITCH|THERMOSTAT|TRANSMITTER|VALVE|VFD)\b\s+(?:IN|ON)\b.*\b(?:PIPING|LINE)(?:\s*\([^)]*\))?$/i.test(normalized)) return false;
  return /^(?:EXISTING\s+)?ELECTRICAL\s+CIRCUITING\b/i.test(normalized)
    || /\b(?:PIPING|LINE)(?:\s*\([^)]*\))?$|\b(?:SEWER|RACEWAY)$/i.test(normalized)
    || /^(?:(?:NEW|FUTURE|EXISTING)\s+)?(?:DUCTWORK|PIPING)(?:\s+(?:TO\s+(?:BE\s+)?(?:REMOVED|REMAIN)|WITH\s+(?:INSULATION|LINING)|DEMOLITION))?$/i.test(normalized)
    || /^(?:LPS\s+(?:ROOF|MAIN\s+DOWN)\s+CONDUCTOR|GROUND\s+RING\b.*\bCONDUCTOR|BRANCH\s+CIRCUIT\s+OR\s+FEEDER\s+WIRING\s+IN\s+CONDUIT\b)/i.test(normalized)
    || /^PANEL,?\s+SWITCHBOARD,?\s+OR\s+BUSD?UCT\b/i.test(normalized)
    || /^(?:VENT|DUCTWORK|STORM\s+DRAIN)$/i.test(normalized)
    || /^(?:CABLE|CABLE\s+TRAY|UNDERFLOOR\s+DUCT|J-HOOK\s+COMMUNICATION\s+PATHWAY|MULTI-OUTLET\s+ASSEMBLY\s+WITH\s+(?:DATA|POWER|VOICE|COMMUNICATIONS?)\s+(?:RECEPTACLES?|OUTLETS?))$/i.test(normalized)
    || /^(?:(?:SUPPLY|RETURN|EXHAUST|TRANSFER|OUTDOOR|OUTSIDE|CONDITIONED\s+OUTSIDE|RELIEF|GREASE\s+EXHAUST|SMOKE\s+EXHAUST|COMBUSTION)\s+AIR|EXHAUST\s+GAS\s+FLUE|CONDENSATE\s+DRAIN|REFRIGERANT\s+SUCTION\s*\/\s*LIQUID|(?:OR\s+)?PNEUMATIC|ELECTRICAL\s+WIRING)$/i.test(normalized)
    // Duct cross-section keys describe a routed shape/size convention, not
    // one installed object. Firms use both terse labels ("ROUND DUCT") and
    // dimension-qualified labels ("FLAT OVAL DUCT (WIDTH X HEIGHT)"); preserve
    // a common real-world RETANGULAR misspelling without keying to a project.
    || /^(?:(?:RECTANGULAR|RETANGULAR|ROUND|FLAT\s+OVAL)\s+DUCT(?:\s+(?:(?:RECTANGULAR|RETANGULAR|ROUND|FLAT\s+OVAL)\s+DUCT\s+)?(?:WIDTH|DIAMETER|\(\s*(?:WIDTH|DIAMETER)\b).*)?|PIPE(?:\s+PIPE\s*\(DIAMETER.*)?|FLEX(?:IBLE)?\s+DUCT|(?:\d+(?:\.\d+)?\s*["']\s+)?(?:ACOUSTICALLY\s+|INTERNALLY\s+)?LINED\s+DUCT(?:WORK)?)$/i.test(normalized)
    || /^(?:NEW\s+DUCTWORK,?\s+FIRST\s+DIMENSION\b.*|DEMOLISHED\s*\/\s*REMOVED\s+DUCTWORK,?\s+PIPING\s+AND\s*\/\s*OR\s+EQUIPMENT)$/i.test(normalized)
    || /\b(?:CHILLED|CONDENSER|HEATING|GEOTHERMAL|DOMESTIC|TEMPERED)\s+(?:(?:HOT|COLD)\s+)?WATER(?:\s+(?:SUPPLY|RETURN))?(?:\s*\([^)]*\))?$/i.test(normalized)
    || /\b(?:LOW|MEDIUM|HIGH)\s+PRESSURE\s+NATURAL\s+GAS$/i.test(normalized);
}

function isRoutedSystemLegendHeading(text: string | null): boolean {
  return !!text
    && /^(?:DUCTWORK|PIPING)(?:\s+SYSTEM)?\s+ABBREVIATIONS$/i.test(normalizedCaption(text));
}

/** Recover a routed swatch made only from many disconnected, parallel
 * strokes. Flexible-duct and flexible-pipe keys are commonly exported as a
 * comb of vertical ticks; connectivity clustering correctly leaves every
 * tick separate, but a single zero-width tick is not a glyph. A repeated,
 * same-height run immediately left of a routed-system caption is one
 * auditable line-style key. Requiring six similar strokes, a multi-letter
 * horizontal extent, and an already meaningful routed caption keeps this
 * path away from leaders, borders, ordinary hatch fills, and prose. */
function disconnectedParallelStrokeCandidates(
  segs: number[], spans: LegendSpan[], existing: GlyphCandidate[],
  typicalTextHeight: number, maxCaptionGapPx: number, maxLineStyleDimPx: number,
  pad: number,
): GlyphCandidate[] {
  type Stroke = { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; length: number };
  const vertical: Stroke[] = [];
  for (let i = 0; i < segs.length; i += 4) {
    const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
    const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
    if (dy < Math.max(4, dx * 4)) continue;
    const length = Math.hypot(dx, dy);
    if (length < typicalTextHeight * 0.4 || length > typicalTextHeight * 3.25) continue;
    vertical.push({
      x0: Math.min(ax, bx), y0: Math.min(ay, by),
      x1: Math.max(ax, bx), y1: Math.max(ay, by),
      cx: (ax + bx) / 2, cy: (ay + by) / 2, length,
    });
  }
  const recovered: GlyphCandidate[] = [];
  for (const span of spans) {
    if (!isRoutedSystemCaption(span.text)) continue;
    const captionY = (span.y0 + span.y1) / 2;
    const nearby = vertical.filter((stroke) => {
      const gap = span.x0 - stroke.x1;
      return gap >= 0 && gap <= maxCaptionGapPx + maxLineStyleDimPx
        && Math.abs(stroke.cy - captionY) <= typicalTextHeight * 1.25;
    }).sort((a, b) => a.cx - b.cx);
    const runs: Stroke[][] = [];
    for (const stroke of nearby) {
      const run = runs[runs.length - 1];
      if (!run || stroke.cx - run[run.length - 1].cx > typicalTextHeight * 1.5
        || Math.abs(stroke.cy - median(run.map((member) => member.cy))) > typicalTextHeight * 0.6
        || Math.abs(stroke.length - median(run.map((member) => member.length))) > typicalTextHeight * 0.75) {
        runs.push([stroke]);
      } else run.push(stroke);
    }
    const viable = runs.filter((run) => run.length >= 6
      && run[run.length - 1].x1 - run[0].x0 >= typicalTextHeight * 3
      && run[run.length - 1].x1 - run[0].x0 <= maxLineStyleDimPx)
      .sort((a, b) => (span.x0 - a[a.length - 1].x1) - (span.x0 - b[b.length - 1].x1));
    const run = viable[0];
    if (!run) continue;
    const rect: [Point, Point] = [[
      Math.min(...run.map((stroke) => stroke.x0)) - pad,
      Math.min(...run.map((stroke) => stroke.y0)) - pad,
    ], [
      Math.max(...run.map((stroke) => stroke.x1)) + pad,
      Math.max(...run.map((stroke) => stroke.y1)) + pad,
    ]];
    const alreadyRepresented = [...existing, ...recovered].some((candidate) => {
      const overlapW = Math.min(candidate.rect[1][0], rect[1][0]) - Math.max(candidate.rect[0][0], rect[0][0]);
      const overlapH = Math.min(candidate.rect[1][1], rect[1][1]) - Math.max(candidate.rect[0][1], rect[0][1]);
      return overlapW > 0 && overlapH > 0
        && overlapW * overlapH >= (rect[1][0] - rect[0][0]) * (rect[1][1] - rect[0][1]) * 0.6;
    });
    if (!alreadyRepresented) recovered.push({ rect, segments: run.length, kind: "line_style" });
  }
  return recovered;
}

/** A physical device can be drawn with almost no usable vector ink when its
 * identifying letter is PDF text (motorized dampers and cleanout callouts
 * are common). Preserve the installed-device identity as `symbol`, but keep
 * the sparse line fragment out of Symbol Sweep by leaving it nonseedable. */
function isDiscreteInstalledDeviceCaption(text: string): boolean {
  const normalized = canonicalLegendCaption(text);
  return /\b(?:ACTUATOR|ARRESTOR|CAP|CLEANOUT|DAMPER|DETECTOR|DIFFUSER|DRAIN|FAN|FILTER|GAUGE|GRILLE|GUIDE|HUMIDISTAT|LOUVER|METER|PANELBOARD|PUMP|PUSH\s*BUTTON|REGISTER|REGULATOR|RELAY|SENSOR|SINK|SLEEVE|STARTER|STRAINER|SWITCH|THERMOSTAT|TRANSMITTER|VALVE|VFD)\b/i.test(normalized)
    || /\b(?:MONITORING|METERING)\s+EQUIPMENT\b/i.test(normalized);
}

/** BAS legends also contain logical/sequence identities that matter to a
 * controls takeoff but are not physical plan symbols. Preserve them for
 * point/sequence reasoning while explicitly barring their diagram marks
 * from an EA Symbol Sweep. */
function isControlFunctionCaption(text: string, heading: string | null = null): boolean {
  const normalized = canonicalLegendCaption(text);
  return /\b(?:SEE\s+SEQUENCE\s+OF\s+OPERATION|REMOTE\s+GRAPHICS\s+WORKSTATION|ENERGY\s+CONTROL\s+CENTER|CONTROLLING\s+EQUIPMENT\s+ON\s+A\s+SCHEDULE)\b/i.test(normalized)
    || /^(?:AUXILIARY\s+CONTACT|(?:ANALOG|CURRENT|VOLTAGE|(?:BINARY|DIGITAL)(?:\s*\/\s*(?:BINARY|DIGITAL))?)\s+(?:INPUT|OUTPUT)(?:\s*\(DDC\s+CONTROLLER\))?|ENABLE\s*\/\s*DISABLE|SET\s+POINT|START\s*\/\s*STOP)$/i.test(normalized)
    || (/\bCONTROLS?\b/i.test(heading || "") && /^(?:RESET|DIFFERENTIAL\s+PRESSURE)$/i.test(normalized));
}

function meaningfulCaption(text: string): boolean {
  const normalized = normalizedCaption(text);
  const alnum = normalized.match(/[A-Z0-9]/gi)?.length ?? 0;
  if (alnum < 2) return false;
  // A point matrix's repeated X marks are cell values, never descriptions.
  if (/^(?:X+)(?:\s+X+)*$/i.test(normalized)) return false;
  // Ruled and unruled legend tables commonly label their two columns before
  // the first real row. An underline or border immediately to the left can
  // otherwise promote the field name itself as a fake symbol identity.
  if (/^(?:SYMBOL|NAME|DESCRIPTION|DESIGNATION|TYPE|NUMBER|SIZE|QTY|QUANTITY)$/i.test(normalized)) return false;
  return true;
}

function isScheduleFieldHeaderText(text: string): boolean {
  return /^(?:AREA\s+SERVED|SYSTEM\s+LOCATION|SERVICE|PURPOSE|TYPE|CAPACITY|FLOW|HEAD|HP|RPM|VFD|VOLTAGE|FLUID|FUEL|EFFICIENCY|MANUFACTURER(?:\s+AND\s+MODEL)?|MODEL|OPERATING\s+WEIGHT|REMARKS?)$/i.test(normalizedCaption(text));
}

const explicitLegendHeadingsCache = new WeakMap<LegendSpan[], LegendSpan[]>();
function explicitLegendHeadings(rawSpans: LegendSpan[]): LegendSpan[] {
  const cached = explicitLegendHeadingsCache.get(rawSpans);
  if (cached) return cached;
  const headings = rawSpans.filter((span) => isLegendHeadingText(span.text));
  explicitLegendHeadingsCache.set(rawSpans, headings);
  return headings;
}

type SymbolDescriptionHeader = {
  symbol: LegendSpan;
  description: LegendSpan;
  symbolColumnEnd: number;
};

/** Exact paired field headers are stronger evidence than a generic SYMBOL
 * word alone. They identify the two columns of a ruled legend table without
 * relying on a firm title, sheet number, or drawing-specific vocabulary. */
function symbolDescriptionHeaders(
  lines: LegendSpan[], typicalTextHeight: number,
): SymbolDescriptionHeader[] {
  const headers: SymbolDescriptionHeader[] = [];
  for (const symbol of lines) {
    if (!/^SYMBOL$/i.test(normalizedCaption(symbol.text))) continue;
    const symbolCenterY = (symbol.y0 + symbol.y1) / 2;
    const description = lines.filter((candidate) =>
      /^DESCRIPTION$/i.test(normalizedCaption(candidate.text))
      && candidate.x0 > symbol.x1
      && candidate.x0 - symbol.x1 <= typicalTextHeight * 32
      && Math.abs((candidate.y0 + candidate.y1) / 2 - symbolCenterY) <= typicalTextHeight * 0.6)
      .sort((a, b) => a.x0 - b.x0)[0];
    if (description) {
      const intermediateField = lines.filter((candidate) => {
        const centerY = (candidate.y0 + candidate.y1) / 2;
        return candidate.x0 > symbol.x1
          && candidate.x0 < description.x0
          && Math.abs(centerY - symbolCenterY) <= typicalTextHeight * 0.6
          && /^(?:ABBR(?:EVIATION)?S?\.?|CODE|TAG|TYPE)$/i.test(normalizedCaption(candidate.text));
      }).sort((a, b) => a.x0 - b.x0)[0];
      headers.push({
        symbol,
        description,
        symbolColumnEnd: intermediateField?.x0 ?? description.x0,
      });
    }
  }
  return headers;
}

/** A dimension string inside a duct/pipe sketch normally proves that the
 * sketch is a callout, not a standalone device symbol. In an explicitly
 * headed symbol legend, however, a same-row external description such as
 * "DUCT SIZE - FIRST SIZE IS SIDE SHOWN" is itself a legitimate drafting
 * convention and must remain auditable (but nonseedable). */
function isExplicitLegendDimensionConvention(
  rect: [Point, Point], rawSpans: LegendSpan[],
): boolean {
  const headings = explicitLegendHeadings(rawSpans);
  if (!headings.length) return false;
  const [[x0, y0], [x1, y1]] = rect;
  const cy = (y0 + y1) / 2;
  const convention = rawSpans.find((span) => {
    const sh = span.y1 - span.y0;
    return /^(?:DUCT|PIPE|CONDUIT)\s+(?:SIZE|DIMENSIONS?)\b/i.test(normalizedCaption(span.text))
      && span.x0 >= x1
      && span.x0 - x1 <= Math.max(400, sh * 25)
      && cy >= span.y0 - sh * 0.75
      && cy <= span.y1 + sh * 0.75;
  });
  if (!convention) return false;
  return headings.some((span) => span.y1 < convention.y0
    && convention.y0 - span.y1 <= Math.max(800, (convention.y1 - convention.y0) * 45)
    && span.x1 >= x0 - (convention.y1 - convention.y0) * 8
    && span.x0 <= convention.x1);
}

/** Numeric size text printed inside a legend sketch is internal evidence,
 * not its descriptive caption. CAD exports vary the notation materially:
 * 12x10, 20"X12", 20"X12"Ø, Ø18, and 18"Ø are all common. */
function isInlineDimensionValue(text: string): boolean {
  const compact = normalizedCaption(text).replace(/\s+/g, "");
  return /^Ø?(?:\d+(?:\.\d+)?|\d+\/\d+)(?:["'])?(?:(?:[X×](?:\d+(?:\.\d+)?|\d+\/\d+)(?:["'])?Ø?)|Ø)?$/i.test(compact)
    // Architectural elevations commonly use feet, inches, and an optional
    // mixed fraction. Removing spaces turns 12' - 5 1/2" into 12'-51/2".
    || /^\d+(?:\.\d+)?'(?:-\d+(?:\.\d+)?(?:-?\d+\/\d+)?")?$/.test(compact);
}

/** A long declared legend may place its dimension examples far below the
 * section title. This narrowly answers only whether one numeric run is
 * internal to a same-row routed-shape example; unlike the general outlined-
 * text guard, it cannot reclassify unrelated glyphs elsewhere on the page. */
function isInternalLegendDimensionCaption(
  dimension: LegendSpan, rect: [Point, Point], rawSpans: LegendSpan[],
): boolean {
  if (!isInlineDimensionValue(dimension.text)) return false;
  const sh = Math.max(1, dimension.y1 - dimension.y0);
  const centerY = (dimension.y0 + dimension.y1) / 2;
  const description = rawSpans.find((span) => {
    const otherCenterY = (span.y0 + span.y1) / 2;
    return span !== dimension
      && span.x0 >= dimension.x1
      && span.x0 - dimension.x1 <= sh * 30
      && Math.abs(otherCenterY - centerY) <= sh * 0.4
      && isRoutedSystemCaption(span.text);
  });
  if (!description) return false;
  return explicitLegendHeadings(rawSpans).some((heading) => heading.y1 < description.y0
    && description.y0 - heading.y1 <= Math.max(800, sh * 120)
    && heading.x1 >= rect[0][0] - sh * 8
    && heading.x0 <= description.x1
    && !rawSpans.some((boundary) => boundary !== heading
      && boundary.y0 > heading.y1
      && boundary.y1 < description.y0
      && isSectionBoundaryText(boundary.text)
      && boundary.x1 >= rect[0][0] - sh * 2
      && boundary.x0 <= description.x1));
}

/** CAD exports frequently expose the same visible lettering twice: once as
 * extractable text and once as short vector strokes. Without this guard, an
 * abbreviation's outlined letters become a fake "glyph" and the definition
 * to their right becomes its caption; point-matrix X marks fail identically.
 * A real tagged symbol (circle-T, boxed-AI, etc.) extends materially outside
 * its inner text span, so it is retained. */
type TextResemblanceContext = {
  /** Tight alphabetic device tags may fill their carrier, but this exception
   * is safe only inside an explicitly bounded symbol panel. */
  allowNearEdgeAlphaTag?: boolean;
};

function resemblesExtractedText(
  rect: [Point, Point], rawSpans: LegendSpan[], segmentCount?: number,
  context: TextResemblanceContext = {},
): boolean {
  if (isExplicitLegendDimensionConvention(rect, rawSpans)) return false;
  const [[x0, y0], [x1, y1]] = rect;
  const w = x1 - x0, h = y1 - y0;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const isTightTagCarrier = (s: LegendSpan): boolean => {
    const sw = s.x1 - s.x0, sh = s.y1 - s.y0;
    const horizontalMargin = Math.max(1.5, sh * 0.15);
    const verticalOverlap = Math.min(y1, s.y1) - Math.max(y0, s.y0);
    // A closed four-edge box around a compact PDF-text equipment tag (VFD,
    // ATS, DDC...) is the physical legend carrier, not outlined duplicate
    // lettering. PDF font metrics can protrude vertically beyond the box,
    // so require horizontal containment plus strong vertical overlap.
    const tag = normalizedCaption(s.text);
    const compactTag = /^[A-Z0-9][A-Z0-9./_-]{1,11}$/i.test(tag);
    const containsWholeTag = x0 <= s.x0 - horizontalMargin && x1 >= s.x1 + horizontalMargin;
    // Digit-bearing sensor/point tags such as CO2 can fill almost the whole
    // carrier. Exact four-edge closure and containment still distinguish
    // that box from one outlined letter inside a longer PDF-text run.
    const nearEdgeDigitTag = /\d/.test(tag)
      && /[A-Z]/i.test(tag)
      && !isInlineDimensionValue(tag)
      && x0 <= s.x0 + 0.75 && x1 >= s.x1 - 0.75;
    const nearEdgeAlphaTag = !!context.allowNearEdgeAlphaTag
      && /^[A-Z]{2,4}$/i.test(tag)
      && x0 <= s.x0 + 0.75 && x1 >= s.x1 - 0.75;
    return segmentCount === 4
      && compactTag
      && (w >= sh * 1.8 || (nearEdgeAlphaTag && w >= sh * 1.2))
      && w <= sw + sh
      && Math.abs(cx - (s.x0 + s.x1) / 2) <= sh * 0.5
      && (containsWholeTag || nearEdgeDigitTag || nearEdgeAlphaTag)
      && verticalOverlap >= Math.min(h, sh) * 0.65;
  };
  if (rawSpans.some((s) => {
    const sw = s.x1 - s.x0, sh = s.y1 - s.y0;
    if (!s.text.trim() || sw <= 0 || sh <= 0) return false;
    if (cx < s.x0 || cx > s.x1 || cy < s.y0 - sh * 0.2 || cy > s.y1 + sh * 0.2) return false;
    if (isTightTagCarrier(s)) return false;
    const tol = Math.max(1.8, Math.min(10, sh * 0.18));
    return x0 >= s.x0 - tol && x1 <= s.x1 + tol
      && y0 >= s.y0 - tol && y1 <= s.y1 + tol
      && w <= sw + 2 * tol && h <= sh + 2 * tol;
  })) return true;

  // A connected outlined abbreviation can span several extracted runs or
  // even two tightly stacked rows (e.g. 2-D / 3-D). Compare against the
  // union of every text box the component actually overlaps. A real outer
  // symbol container still protrudes beyond the union of its inner label.
  const overlaps = rawSpans.filter((s) => {
    if (!s.text.trim() || s.x1 <= s.x0 || s.y1 <= s.y0) return false;
    return s.x1 >= x0 && s.x0 <= x1 && s.y1 >= y0 && s.y0 <= y1;
  });
  if (!overlaps.length) return false;
  if (overlaps.some(isTightTagCarrier)) return false;
  const ux0 = Math.min(...overlaps.map((s) => s.x0));
  const uy0 = Math.min(...overlaps.map((s) => s.y0));
  const ux1 = Math.max(...overlaps.map((s) => s.x1));
  const uy1 = Math.max(...overlaps.map((s) => s.y1));
  const textHeight = median(overlaps.map((s) => s.y1 - s.y0));
  const tol = Math.max(2.5, Math.min(12, textHeight * 0.4));
  const unionArea = Math.max(1, (ux1 - ux0) * (uy1 - uy0));
  const componentArea = Math.max(1, w * h);
  // The bounding UNION of several sparse inner tags can fill most of a
  // carrier even though the text boxes themselves fill very little of it.
  // A real reviewed coil symbol exposed this: two tiny PDF-text "C" marks
  // sit near opposite corners of a vector box with a diagonal. Their union
  // bbox resembles the whole box, but treating that box as duplicate
  // outlined lettering deletes the physical coil row. Measure the actual
  // union area covered by the clipped text boxes before using their outer
  // bbox as text evidence. True outlined multi-run lettering substantially
  // occupies that bbox; sparse tags inside a carrier do not.
  const clipped = overlaps.map((s) => ({
    x0: Math.max(x0, s.x0), y0: Math.max(y0, s.y0),
    x1: Math.min(x1, s.x1), y1: Math.min(y1, s.y1),
  })).filter((box) => box.x1 > box.x0 && box.y1 > box.y0);
  const xs = [...new Set(clipped.flatMap((box) => [box.x0, box.x1]))].sort((a, b) => a - b);
  let coveredTextArea = 0;
  for (let i = 1; i < xs.length; i++) {
    const left = xs[i - 1], right = xs[i];
    const mid = (left + right) / 2;
    const intervals = clipped.filter((box) => box.x0 <= mid && box.x1 >= mid)
      .map((box) => [box.y0, box.y1] as [number, number])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let coveredY = 0;
    let interval: [number, number] | null = null;
    for (const next of intervals) {
      if (!interval || next[0] > interval[1]) {
        if (interval) coveredY += interval[1] - interval[0];
        interval = [...next];
      } else interval[1] = Math.max(interval[1], next[1]);
    }
    if (interval) coveredY += interval[1] - interval[0];
    coveredTextArea += (right - left) * coveredY;
  }
  if (coveredTextArea / componentArea < 0.3) return false;
  // Outline fonts can overshoot the PDF text metrics by several pixels,
  // especially across stacked runs. Relative area agreement distinguishes
  // that duplicate ink from a genuine circle/box surrounding a short tag.
  const onlyPunctuation = overlaps.every((s) => /^[#*]+$/.test(normalizedCaption(s.text)));
  return componentArea / unionArea <= (onlyPunctuation ? 2 : 1.5)
    && x0 >= ux0 - tol && x1 <= ux1 + tol && y0 >= uy0 - tol && y1 <= uy1 + tol;
}

type StructuredLegendTable = {
  left: number;
  right: number;
  symbolRight: number;
  descriptionX: number;
  top: number;
  bottom: number;
  boundaries: number[];
};

/** Recover the finite row bands of a ruled SYMBOL / DESCRIPTION table.
 * Long horizontal rules that cross both declared fields are source-level
 * row evidence: they let one table cell own all of its wrapped prose while
 * preventing adjacent cells from fusing. The bounds are inferred from the
 * sheet's own text scale and geometry, never from a page or project token. */
function structuredLegendTables(
  segs: number[], lines: LegendSpan[], typicalTextHeight: number,
): StructuredLegendTable[] {
  const headers = symbolDescriptionHeaders(lines, typicalTextHeight);
  if (!headers.length) return [];
  const horizontalRules: RectBox[] = [];
  const horizontalTolerance = Math.max(1.5, typicalTextHeight * 0.08);
  for (let i = 0; i < segs.length; i += 4) {
    const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
    if (Math.abs(ay - by) > horizontalTolerance) continue;
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx);
    if (x1 - x0 < typicalTextHeight * 8) continue;
    horizontalRules.push({ x0, x1, y0: (ay + by) / 2, y1: (ay + by) / 2 });
  }
  const tables: StructuredLegendTable[] = [];
  for (let headerIndex = 0; headerIndex < headers.length; headerIndex++) {
    const { symbol, description, symbolColumnEnd } = headers[headerIndex];
    const localRules = horizontalRules.filter((rule) =>
      rule.x0 <= symbol.x0 + typicalTextHeight * 1.5
      && symbol.x0 - rule.x0 <= typicalTextHeight * 8
      && rule.x1 >= description.x0 + typicalTextHeight * 4
      && rule.x1 - description.x0 <= typicalTextHeight * 60);
    if (localRules.length < 3) continue;
    const centerY = (symbol.y0 + symbol.y1) / 2;
    const firstBelowHeader = localRules.map((rule) => rule.y0)
      .filter((y) => y > centerY + typicalTextHeight * 0.2)
      .sort((a, b) => a - b)[0];
    if (!Number.isFinite(firstBelowHeader)) continue;
    const left = median(localRules.map((rule) => rule.x0));
    const right = median(localRules.map((rule) => rule.x1));
    const nextHeader = headers.slice(headerIndex + 1).filter((candidate) =>
      candidate.symbol.y0 > symbol.y1
      && Math.abs(candidate.symbol.x0 - symbol.x0) <= typicalTextHeight * 2
      && Math.abs(candidate.description.x0 - description.x0) <= typicalTextHeight * 2)
      .sort((a, b) => a.symbol.y0 - b.symbol.y0)[0];
    const sectionEnd = lines.filter((line) => {
      const height = line.y1 - line.y0;
      const centerX = (line.x0 + line.x1) / 2;
      return line.y0 > firstBelowHeader + typicalTextHeight * 0.5
        && (!nextHeader || line.y0 < nextHeader.symbol.y0)
        && centerX >= left && centerX <= right
        && (isSectionBoundaryText(line.text)
          // Large centered text in the DESCRIPTION side can introduce a
          // new table section. Stacked text-only marks ($3, HOA, +0'-0")
          // can be equally tall inside the SYMBOL cell and are not titles.
          || (height >= typicalTextHeight * 1.5
            && line.x0 >= description.x0 - typicalTextHeight * 0.75))
        && !/^(?:SYMBOL|DESCRIPTION)$/i.test(normalizedCaption(line.text));
    }).sort((a, b) => a.y0 - b.y0)[0];
    const stopY = Math.min(
      nextHeader?.symbol.y0 ?? Infinity,
      sectionEnd?.y0 ?? Infinity,
    );
    const mergeTolerance = Math.max(1.8, typicalTextHeight * 0.12);
    const ys = localRules.map((rule) => rule.y0)
      .filter((y) => y >= firstBelowHeader - mergeTolerance && y <= stopY + mergeTolerance)
      .sort((a, b) => a - b);
    const boundaries: number[] = [];
    for (const y of ys) {
      const last = boundaries[boundaries.length - 1];
      if (last === undefined || y - last > mergeTolerance) boundaries.push(y);
      else boundaries[boundaries.length - 1] = (last + y) / 2;
    }
    if (boundaries.length < 2) continue;
    tables.push({
      left,
      right,
      symbolRight: symbolColumnEnd - typicalTextHeight * 0.2,
      descriptionX: description.x0,
      top: boundaries[0],
      bottom: boundaries[boundaries.length - 1],
      boundaries,
    });
  }
  return tables;
}

function pairBelongsToStructuredTable(
  pair: PairCandidate, table: StructuredLegendTable,
): boolean {
  const rectCenterX = (pair.rect[0][0] + pair.rect[1][0]) / 2;
  const rectCenterY = (pair.rect[0][1] + pair.rect[1][1]) / 2;
  const captionCenterX = (pair.span.x0 + pair.span.x1) / 2;
  return rectCenterX >= table.left && rectCenterX <= table.symbolRight
    && rectCenterY >= table.top && rectCenterY <= table.bottom
    && captionCenterX >= table.descriptionX - (pair.span.y1 - pair.span.y0)
    && captionCenterX <= table.right;
}

/** Recover long vertical rules that divide independent page panels. These
 * are ownership barriers: a symbol/leader in the left legend cannot pair to
 * prose in a notes panel on the right merely because their baselines happen
 * to align. Collinear fragments are merged because CAD exporters commonly
 * split one border at intersections. */
function verticalSectionDividers(segs: number[], typicalTextHeight: number): RectBox[] {
  const tolerance = Math.max(1.5, typicalTextHeight * 0.08);
  const fragments: RectBox[] = [];
  for (let i = 0; i < segs.length; i += 4) {
    const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
    if (Math.abs(ax - bx) > tolerance) continue;
    const y0 = Math.min(ay, by), y1 = Math.max(ay, by);
    if (y1 - y0 < typicalTextHeight * 2) continue;
    fragments.push({ x0: (ax + bx) / 2, x1: (ax + bx) / 2, y0, y1 });
  }
  fragments.sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0);
  const xGroups: RectBox[][] = [];
  for (const fragment of fragments) {
    const group = xGroups.find((candidate) =>
      Math.abs(median(candidate.map((part) => part.x0)) - fragment.x0) <= tolerance);
    if (group) group.push(fragment);
    else xGroups.push([fragment]);
  }
  const dividers: RectBox[] = [];
  const addDivider = (x: number, y0: number, y1: number) => {
    // A full-height SYMBOL/DESCRIPTION grid column is not a page-panel
    // boundary. Even when its headers are outlined or absent from PDF text,
    // several row rules visibly continue well to both sides of the vertical
    // stroke. Independent panel borders may meet rules at an endpoint, but
    // they are not repeatedly crossed through their interior.
    const crossingRows: number[] = [];
    for (let i = 0; i < segs.length; i += 4) {
      const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
      if (Math.abs(ay - by) > tolerance) continue;
      const left = Math.min(ax, bx), right = Math.max(ax, bx);
      const y = (ay + by) / 2;
      if (y < y0 - tolerance || y > y1 + tolerance
        || left > x - typicalTextHeight * 2
        || right < x + typicalTextHeight * 2) continue;
      if (!crossingRows.some((candidate) => Math.abs(candidate - y) <= tolerance)) crossingRows.push(y);
    }
    if (crossingRows.length < 3) dividers.push({ x0: x, x1: x, y0, y1 });
  };
  for (const group of xGroups) {
    group.sort((a, b) => a.y0 - b.y0 || a.y1 - b.y1);
    let start = group[0]?.y0;
    let end = group[0]?.y1;
    for (const fragment of group.slice(1)) {
      if (fragment.y0 <= end + typicalTextHeight * 2) {
        end = Math.max(end, fragment.y1);
        continue;
      }
      if (end - start >= typicalTextHeight * 15) {
        const x = median(group.map((part) => part.x0));
        addDivider(x, start, end);
      }
      start = fragment.y0;
      end = fragment.y1;
    }
    if (start !== undefined && end !== undefined && end - start >= typicalTextHeight * 15) {
      const x = median(group.map((part) => part.x0));
      addDivider(x, start, end);
    }
  }
  return dividers;
}

type TagCalloutZone = {
  heading: LegendSpan;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/** Tag-key panels describe how an equipment/damper/accessory identity is
 * encoded in a drawing callout. Their geometry is not an ordinary
 * SYMBOL-at-left / DESCRIPTION-at-right table: descriptions may sit on
 * either side of a shared carrier, and a tag's identifying letter is often
 * PDF text. Keep this topology separate and conservatively non-seedable. */
function isTagCalloutHeading(text: string): boolean {
  const normalized = normalizedCaption(text);
  return isLegendHeadingText(normalized) && /\bTAGS?$/i.test(normalized);
}

function isTagIdentityCaption(text: string): boolean {
  const normalized = canonicalLegendCaption(text);
  if (!meaningfulCaption(normalized) || isSectionBoundaryText(normalized)
    || isDirectiveProse(normalized)) return false;
  return isDiscreteInstalledDeviceCaption(normalized)
    || /\b(?:EQUIPMENT|ROOFTOP\s+UNIT|VAV\s+BOX)\b/i.test(normalized);
}

function isLegendCalloutCaption(text: string): boolean {
  const normalized = canonicalLegendCaption(text);
  // This predicate is only for recovery from a shared diagram after normal
  // legend rows have already been accepted. Broad device/annotation nouns
  // turn nearby control diagrams, detail labels, and room-tag examples into
  // phantom legend rows. Restrict recovery to explicit inline note keys and
  // piping topology/fitting callouts whose leader-sharing layout motivated
  // this path; ordinary device rows remain owned by normal or TAGS pairing.
  return /^(?:GENERAL\s+NOTE|PLAN\s+NOTE\s+LIST|CONTINUATION\s+SYMBOL|POINT\s+WHERE\s+NEW\s+CONNECTS\s+TO\s+EXISTING|PIPE\s+(?:DROP|RISE|TEE|INVERT\s+ELEVATION\s+TAG)|(?:PIPE\s+)?(?:CAP|PLUG)|(?:REDUCING\s+)?(?:\d+(?:\.\d+)?\s*(?:DEGREE|°)\s+)?TEE)$/i.test(normalized);
}

function isWrappedTagIdentityContinuation(
  line: LegendSpan, lines: LegendSpan[], typicalTextHeight: number,
): boolean {
  return lines.some((previous) => previous !== line
    && previous.y1 <= line.y0 + typicalTextHeight * 0.08
    && line.y0 - previous.y1 <= typicalTextHeight * 0.42
    && Math.abs(previous.x0 - line.x0) <= typicalTextHeight * 2
    && isTagIdentityCaption(`${previous.text} ${line.text}`));
}

function isInlineKeyedDefinition(
  line: LegendSpan, lines: LegendSpan[], typicalTextHeight: number,
): boolean {
  const centerY = (line.y0 + line.y1) / 2;
  return lines.some((marker) => marker !== line
    && marker.x1 <= line.x0
    && line.x0 - marker.x1 <= typicalTextHeight * 10
    && Math.abs((marker.y0 + marker.y1) / 2 - centerY) <= typicalTextHeight * 0.6
    && /^[A-Z0-9]{1,4}[.)]?$/i.test(normalizedCaption(marker.text)));
}

function tagCalloutZones(
  segs: number[], lines: LegendSpan[], typicalTextHeight: number,
  sectionDividers: RectBox[],
  headingPredicate: (text: string, span: LegendSpan) => boolean = isTagCalloutHeading,
  claimedPairs: Array<{ span: LegendSpan; caption: string; rect?: [Point, Point] }> = [],
): TagCalloutZone[] {
  const headings = lines.filter((line) => headingPredicate(line.text, line));
  if (!headings.length) return [];
  // Dense vector sheets can contain hundreds of thousands of endpoints.
  // Feeding those through Math.min(...xs) exceeds V8's argument stack even
  // though the geometry itself is valid. Accumulate bounds in constant stack
  // space so unsupported-caption sheets remain honestly classifiable.
  let pageLeft = Infinity;
  let pageRight = -Infinity;
  let pageBottom = -Infinity;
  for (let i = 0; i < segs.length; i += 4) {
    pageLeft = Math.min(pageLeft, segs[i], segs[i + 2]);
    pageRight = Math.max(pageRight, segs[i], segs[i + 2]);
    pageBottom = Math.max(pageBottom, segs[i + 1], segs[i + 3]);
  }
  for (const line of lines) {
    pageLeft = Math.min(pageLeft, line.x0);
    pageRight = Math.max(pageRight, line.x1);
    pageBottom = Math.max(pageBottom, line.y1);
  }
  if (!Number.isFinite(pageLeft) || !Number.isFinite(pageRight)
    || !Number.isFinite(pageBottom)) return [];
  const zones: TagCalloutZone[] = [];
  for (const heading of headings) {
    const headingCenterX = (heading.x0 + heading.x1) / 2;
    const coveringDividers = sectionDividers.filter((divider) =>
      divider.y0 <= heading.y0 + typicalTextHeight * 2
      && divider.y1 >= heading.y1 - typicalTextHeight * 2);
    const leftDivider = coveringDividers.filter((divider) => divider.x0 < headingCenterX)
      .sort((a, b) => b.x0 - a.x0)[0];
    const rightDivider = coveringDividers.filter((divider) => divider.x0 > headingCenterX)
      .sort((a, b) => a.x0 - b.x0)[0];
    const left = Math.max(pageLeft, leftDivider?.x0 ?? heading.x0 - typicalTextHeight * 24);
    const right = Math.min(pageRight, rightDivider?.x0 ?? heading.x1 + typicalTextHeight * 24);
    const nextBoundary = lines.filter((line) => line !== heading
      && line.y0 > heading.y1 + typicalTextHeight * 0.2
      && isSectionBoundaryText(line.text)
      && line.x1 >= left - typicalTextHeight
      && line.x0 <= right + typicalTextHeight
      && !claimedPairs.some((pair) => [
        pair.span.x0, pair.span.y0, pair.span.x1, pair.span.y1,
      ].every((value, index) => value === [line.x0, line.y0, line.x1, line.y1][index]))
      // Generic one-word headings can also be the second line of a tag
      // identity ("EXISTING RELOCATED" / "EQUIPMENT"). A tightly stacked,
      // same-column predecessor proves continuation rather than a new panel.
      && !isWrappedTagIdentityContinuation(line, lines, typicalTextHeight)
      && !isInlineKeyedDefinition(line, lines, typicalTextHeight))
      .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)[0];
    const panelWidth = Math.max(1, right - left);
    const horizontalRuleY: number[] = [];
    for (let i = 0; i < segs.length; i += 4) {
      const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
      if (Math.abs(ay - by) > Math.max(1.5, typicalTextHeight * 0.08)) continue;
      const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx);
      const y = (ay + by) / 2;
      if (y <= heading.y1 + typicalTextHeight * 2) continue;
      const overlap = Math.max(0, Math.min(x1, right) - Math.max(x0, left));
      if (overlap >= panelWidth * 0.55) horizontalRuleY.push(y);
    }
    const bottom = Math.min(
      nextBoundary?.y0 ?? pageBottom,
      horizontalRuleY.length ? Math.min(...horizontalRuleY) : pageBottom,
    );
    if (bottom - heading.y1 >= typicalTextHeight * 2) {
      zones.push({ heading, left, right, top: heading.y1, bottom });
    }
  }
  return zones;
}

function tagCalloutPairs(
  segs: number[], lines: LegendSpan[], rawSpans: LegendSpan[],
  typicalTextHeight: number, maxGlyphDimPx: number,
  maxLineStyleDimPx: number, sectionDividers: RectBox[],
  headingPredicate: (text: string, span: LegendSpan) => boolean = isTagCalloutHeading,
  identityPredicate = isTagIdentityCaption,
  claimedPairs: Array<{ span: LegendSpan; caption: string; rect?: [Point, Point] }> = [],
): Array<{ zone: TagCalloutZone; pairs: PairCandidate[] }> {
  const zones = tagCalloutZones(
    segs, lines, typicalTextHeight, sectionDividers, headingPredicate, claimedPairs,
  );
  return zones.map((zone) => {
    const claimedGeometry = claimedPairs.flatMap((pair) => pair.rect ? [pair.rect] : []);
    const segmentAlreadyOwned = (ax: number, ay: number, bx: number, by: number): boolean =>
      claimedGeometry.some((rect) => {
        const slack = Math.max(0.75, typicalTextHeight * 0.04);
        return ax >= rect[0][0] - slack && ax <= rect[1][0] + slack
          && bx >= rect[0][0] - slack && bx <= rect[1][0] + slack
          && ay >= rect[0][1] - slack && ay <= rect[1][1] + slack
          && by >= rect[0][1] - slack && by <= rect[1][1] + slack;
      });
    const localLines = lines.filter((line) => line !== zone.heading
      && line.y0 >= zone.top - typicalTextHeight * 0.1
      && line.y1 <= zone.bottom + typicalTextHeight * 0.1
      && line.x0 >= zone.left - typicalTextHeight * 0.25
      && line.x1 <= zone.right + typicalTextHeight * 0.25
      && meaningfulCaption(line.text)
      && (!isSectionBoundaryText(line.text)
        || isWrappedTagIdentityContinuation(line, lines, typicalTextHeight)
        || isInlineKeyedDefinition(line, lines, typicalTextHeight)))
      .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    const consumed = new Set<number>();
    const captions: LegendSpan[] = [];
    for (let i = 0; i < localLines.length; i++) {
      if (consumed.has(i)) continue;
      const members = [localLines[i]];
      consumed.add(i);
      for (let step = 1; step < 3; step++) {
        const current = members[members.length - 1];
        const next = localLines.map((line, index) => ({ line, index }))
          .filter(({ line, index }) => !consumed.has(index)
            && line.y0 >= current.y1 - typicalTextHeight * 0.08
            && line.y0 - current.y1 <= typicalTextHeight * 0.42
            && Math.abs(line.x0 - members[0].x0) <= typicalTextHeight * 5)
          .sort((a, b) => (a.line.y0 - current.y1) - (b.line.y0 - current.y1)
            || Math.abs(a.line.x0 - members[0].x0) - Math.abs(b.line.x0 - members[0].x0)
            || a.index - b.index)[0];
        if (!next) break;
        const currentText = members.map((member) => member.text).join(" ");
        // Two complete identity phrases on successive baselines are two tag
        // rows, not a wrapped caption. A non-identity code/sample line may
        // still join the descriptive identity immediately beneath it.
        if (identityPredicate(currentText) && identityPredicate(next.line.text)) break;
        members.push(next.line);
        consumed.add(next.index);
      }
      const combined: LegendSpan = {
        text: members.map((member) => normalizedCaption(member.text)).join(" "),
        x0: Math.min(...members.map((member) => member.x0)),
        y0: Math.min(...members.map((member) => member.y0)),
        x1: Math.max(...members.map((member) => member.x1)),
        y1: Math.max(...members.map((member) => member.y1)),
      };
      const centerX = (combined.x0 + combined.x1) / 2;
      const centerY = (combined.y0 + combined.y1) / 2;
      const combinedText = canonicalLegendCaption(combined.text);
      const combinedWords = new Set(combinedText.toUpperCase().match(/[A-Z0-9]+/g) ?? []);
      const alreadyClaimed = claimedPairs.some((pair) => {
        const pairCenterX = (pair.span.x0 + pair.span.x1) / 2;
        const pairCenterY = (pair.span.y0 + pair.span.y1) / 2;
        if (Math.abs(pairCenterY - centerY) > typicalTextHeight * 1.5) return false;
        const pairText = canonicalLegendCaption(pair.caption);
        const pairWords = new Set(pairText.toUpperCase().match(/[A-Z0-9]+/g) ?? []);
        const sharedWords = [...combinedWords].filter((word) => pairWords.has(word)).length;
        const textRelated = pairText.includes(combinedText) || combinedText.includes(pairText)
          || sharedWords >= Math.min(2, combinedWords.size);
        const horizontalGap = pair.span.x1 < combined.x0 ? combined.x0 - pair.span.x1
          : combined.x1 < pair.span.x0 ? pair.span.x0 - combined.x1 : 0;
        const claimed = textRelated && (horizontalGap <= typicalTextHeight * 2
          || Math.abs(pairCenterX - centerX) <= typicalTextHeight * 8);
        return claimed;
      });
      if (identityPredicate(combined.text) && !alreadyClaimed) captions.push(combined);
    }

    const centers = captions.map((caption) => (caption.y0 + caption.y1) / 2)
      .sort((a, b) => a - b);
    const rowCenters: number[] = [];
    for (const center of centers) {
      const row = rowCenters.findIndex((candidate) =>
        Math.abs(candidate - center) <= typicalTextHeight * 0.8);
      if (row >= 0) rowCenters[row] = (rowCenters[row] + center) / 2;
      else rowCenters.push(center);
    }
    rowCenters.sort((a, b) => a - b);
    const zoneSegs: number[] = [];
    for (let i = 0; i < segs.length; i += 4) {
      const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
      if (segmentAlreadyOwned(ax, ay, bx, by)) continue;
      if (ax < zone.left || ax > zone.right || bx < zone.left || bx > zone.right) continue;
      if (ay < zone.top || ay > zone.bottom || by < zone.top || by > zone.bottom) continue;
      if (Math.hypot(bx - ax, by - ay) > (zone.right - zone.left) * 0.7) continue;
      zoneSegs.push(ax, ay, bx, by);
    }
    const wholeZone = clusterSegments(zoneSegs, maxGlyphDimPx, maxLineStyleDimPx);
    const enclosesTagText = (
      rect: [Point, Point], segmentCount: number,
    ): boolean => rawSpans.some((span) => {
      const text = normalizedCaption(span.text);
      const sh = span.y1 - span.y0;
      if (segmentCount < 4 || sh <= 0
        || !/^[()A-Z0-9][()A-Z0-9./_\- ]{0,15}$/i.test(text)
        || !/(?:\d|XX|[-_/()]|^[A-Z]{1,4}$)/i.test(text)) return false;
      const verticalOverlap = Math.min(rect[1][1], span.y1) - Math.max(rect[0][1], span.y0);
      return rect[0][0] <= span.x0 - sh * 0.2
        && rect[1][0] >= span.x1 + sh * 0.2
        && verticalOverlap >= sh * 0.6;
    });
    const componentRects = (
      components: typeof wholeZone.components, pad: number,
    ) => components.map((component) => {
      const rect: [Point, Point] = [[component.x0 - pad, component.y0 - pad],
        [component.x1 + pad, component.y1 + pad]];
      return { component, rect };
    }).filter(({ component, rect }) =>
      looksLikeGlyph(component, component.edges, maxGlyphDimPx, maxLineStyleDimPx)
      && (!resemblesExtractedText(rect, rawSpans, component.edges)
        || enclosesTagText(rect, component.edges)));
    const zoneComponents = componentRects(wholeZone.components, wholeZone.gridPx / 2);
    const pairs: PairCandidate[] = [];
    const usedGeometry = new Set<string>();
    for (const caption of captions) {
      const centerY = (caption.y0 + caption.y1) / 2;
      const rowIndex = rowCenters.reduce((best, value, index) =>
        Math.abs(value - centerY) < Math.abs(rowCenters[best] - centerY) ? index : best, 0);
      const previousGap = rowIndex > 0 ? rowCenters[rowIndex] - rowCenters[rowIndex - 1] : Infinity;
      const nextGap = rowIndex + 1 < rowCenters.length ? rowCenters[rowIndex + 1] - rowCenters[rowIndex] : Infinity;
      const defaultHalfBand = Math.max(typicalTextHeight * 2.5,
        Math.min(previousGap, nextGap, typicalTextHeight * 10) / 2);
      const bandTop = rowIndex > 0
        ? (rowCenters[rowIndex - 1] + rowCenters[rowIndex]) / 2
        : Math.max(zone.top, rowCenters[rowIndex] - defaultHalfBand);
      const bandBottom = rowIndex + 1 < rowCenters.length
        ? (rowCenters[rowIndex] + rowCenters[rowIndex + 1]) / 2
        : Math.min(zone.bottom, rowCenters[rowIndex] + defaultHalfBand);
      const rowSegs: number[] = [];
      for (let i = 0; i < segs.length; i += 4) {
        const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
        if (segmentAlreadyOwned(ax, ay, bx, by)) continue;
        if (ax < zone.left || ax > zone.right || bx < zone.left || bx > zone.right) continue;
        const bandSlack = typicalTextHeight * 0.25;
        if (ay < bandTop - bandSlack || ay > bandBottom + bandSlack
          || by < bandTop - bandSlack || by > bandBottom + bandSlack) continue;
        if (Math.hypot(bx - ax, by - ay) > (zone.right - zone.left) * 0.7) continue;
        rowSegs.push(ax, ay, bx, by);
      }
      const local = clusterSegments(rowSegs, maxGlyphDimPx, maxLineStyleDimPx);
      const bandHeight = Math.max(typicalTextHeight, bandBottom - bandTop);
      const localComponents = componentRects(local.components, local.gridPx / 2);
      const allComponents = [...localComponents, ...zoneComponents.filter(({ rect }) => {
        const height = rect[1][1] - rect[0][1];
        const componentCenterY = (rect[0][1] + rect[1][1]) / 2;
        const verticalBandOverlap = Math.min(rect[1][1], bandBottom)
          - Math.max(rect[0][1], bandTop);
        const horizontalCaptionOverlap = Math.min(rect[1][0], caption.x1)
          - Math.max(rect[0][0], caption.x0);
        const tallAdjacentDiagram = height >= typicalTextHeight * 1.5
          && horizontalCaptionOverlap > 0;
        return height <= bandHeight * 1.5
          && componentCenterY >= bandTop - typicalTextHeight * 5
          && componentCenterY <= bandBottom + typicalTextHeight * 5
          && (verticalBandOverlap >= 0 || tallAdjacentDiagram);
      })].filter(({ rect }, index, all) => all.findIndex((candidate) =>
        candidate.rect.flat().join(",") === rect.flat().join(",")) === index);
      const candidates = allComponents
        .filter(({ rect }) => !usedGeometry.has(rect.flat().join(",")))
        .filter(({ rect }) => {
          const w = rect[1][0] - rect[0][0];
          const h = rect[1][1] - rect[0][1];
          const overlap = Math.max(0, Math.min(rect[1][0], caption.x1) - Math.max(rect[0][0], caption.x0));
          // Description underlines are typography, not tag geometry.
          return !(h <= Math.max(3, local.gridPx * 2)
            && overlap >= Math.min(w, caption.x1 - caption.x0) * 0.7
            && Math.abs((rect[0][1] + rect[1][1]) / 2 - caption.y1) <= typicalTextHeight * 0.35);
        })
        .map(({ component, rect }) => {
          const dx = rect[1][0] < caption.x0 ? caption.x0 - rect[1][0]
            : caption.x1 < rect[0][0] ? rect[0][0] - caption.x1 : 0;
          const dy = rect[1][1] < caption.y0 ? caption.y0 - rect[1][1]
            : caption.y1 < rect[0][1] ? rect[0][1] - caption.y1 : 0;
          const rectCenterY = (rect[0][1] + rect[1][1]) / 2;
          const shallow = rect[1][1] - rect[0][1] <= Math.max(3, wholeZone.gridPx * 2);
          const sparsePenalty = component.edges <= 1 ? typicalTextHeight * 3
            : shallow && component.edges <= 3 ? typicalTextHeight * 1.5 : 0;
          const richnessCredit = Math.min(component.edges, 40) * typicalTextHeight * 0.02;
          return {
            component, rect, dx, dy,
            score: dx + dy * 2 + Math.abs(rectCenterY - centerY) * 0.1
              + sparsePenalty - richnessCredit,
          };
        }).filter((candidate) =>
          candidate.dx <= Math.max(150, typicalTextHeight * 14)
          && candidate.dy <= typicalTextHeight * 5)
        .sort((a, b) => a.score - b.score || b.component.edges - a.component.edges)[0];
      const fallbackSegment = !candidates ? (() => {
        const nearby: Array<{ rect: [Point, Point]; score: number }> = [];
        const pad = wholeZone.gridPx / 2;
        for (let i = 0; i < segs.length; i += 4) {
          const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
          if (segmentAlreadyOwned(ax, ay, bx, by)) continue;
          if (ax < zone.left || ax > zone.right || bx < zone.left || bx > zone.right) continue;
          if (ay < bandTop - typicalTextHeight * 0.25
            || ay > bandBottom + typicalTextHeight * 0.25
            || by < bandTop - typicalTextHeight * 0.25
            || by > bandBottom + typicalTextHeight * 0.25) continue;
          const length = Math.hypot(bx - ax, by - ay);
          if (length < wholeZone.gridPx * 0.5 || length > maxLineStyleDimPx) continue;
          const rect: [Point, Point] = [[Math.min(ax, bx) - pad, Math.min(ay, by) - pad],
            [Math.max(ax, bx) + pad, Math.max(ay, by) + pad]];
          if (usedGeometry.has(rect.flat().join(","))) continue;
          if (resemblesExtractedText(rect, rawSpans, 1)) continue;
          const overlap = Math.max(0,
            Math.min(rect[1][0], caption.x1) - Math.max(rect[0][0], caption.x0));
          if (overlap >= Math.min(length, caption.x1 - caption.x0) * 0.7
            && Math.abs((rect[0][1] + rect[1][1]) / 2 - caption.y1)
              <= typicalTextHeight * 0.35) continue;
          const dx = rect[1][0] < caption.x0 ? caption.x0 - rect[1][0]
            : caption.x1 < rect[0][0] ? rect[0][0] - caption.x1 : 0;
          const dy = rect[1][1] < caption.y0 ? caption.y0 - rect[1][1]
            : caption.y1 < rect[0][1] ? rect[0][1] - caption.y1 : 0;
          if (dx > Math.max(150, typicalTextHeight * 14)
            || dy > typicalTextHeight * 5) continue;
          nearby.push({ rect, score: dx + dy * 2
            + Math.abs((rect[0][1] + rect[1][1]) / 2 - centerY) * 0.1 });
        }
        return nearby.sort((a, b) => a.score - b.score)[0] ?? null;
      })() : null;
      const fallbackTag = !candidates && !fallbackSegment ? rawSpans.map((span) => {
        const text = normalizedCaption(span.text);
        if (!/^(?:[A-Z]{1,4}|[()A-Z0-9][()A-Z0-9./_\- ]{1,15})$/i.test(text)
          || !/(?:\d|XX|[-_/()]|^[A-Z0-9]{1,4}[.)]?$)/i.test(text)) return null;
        const tagCenterY = (span.y0 + span.y1) / 2;
        if (span.x0 < zone.left || span.x1 > zone.right
          || tagCenterY < bandTop || tagCenterY > bandBottom) return null;
        if (usedGeometry.has([span.x0, span.y0, span.x1, span.y1].join(","))) return null;
        const horizontalOverlap = Math.max(0,
          Math.min(span.x1, caption.x1) - Math.max(span.x0, caption.x0));
        const verticalOverlap = Math.max(0,
          Math.min(span.y1, caption.y1) - Math.max(span.y0, caption.y0));
        if (horizontalOverlap > 0 && verticalOverlap > 0) return null;
        const dx = span.x1 < caption.x0 ? caption.x0 - span.x1
          : caption.x1 < span.x0 ? span.x0 - caption.x1 : 0;
        const dy = span.y1 < caption.y0 ? caption.y0 - span.y1
          : caption.y1 < span.y0 ? span.y0 - caption.y1 : 0;
        return { span, score: dx + dy * 2 };
      }).filter((entry): entry is { span: LegendSpan; score: number } => !!entry
        && entry.score <= Math.max(150, typicalTextHeight * 14))
        .sort((a, b) => a.score - b.score || a.span.x0 - b.span.x0)[0] : null;
      const inlineKey = isDraftingAnnotationCaption(caption.text)
        ? rawSpans.filter((span) => span.x1 <= caption.x0
          && caption.x0 - span.x1 <= typicalTextHeight * 10
          && Math.abs((span.y0 + span.y1) / 2 - centerY) <= typicalTextHeight * 0.6
          && /^[A-Z0-9]{1,4}[.)]?$/i.test(normalizedCaption(span.text)))
          .sort((a, b) => (caption.x0 - a.x1) - (caption.x0 - b.x1))[0]
        : null;
      if (!inlineKey && !candidates && !fallbackSegment && !fallbackTag) continue;
      const chosenRect: [Point, Point] = inlineKey
        ? [[inlineKey.x0, inlineKey.y0], [inlineKey.x1, inlineKey.y1]]
        : candidates?.rect
        ?? fallbackSegment?.rect
        ?? [[fallbackTag!.span.x0, fallbackTag!.span.y0],
          [fallbackTag!.span.x1, fallbackTag!.span.y1]];
      const chosenSegments = inlineKey ? 0
        : candidates?.component.edges ?? (fallbackSegment ? 1 : 0);
      usedGeometry.add(chosenRect.flat().join(","));
      pairs.push({
        rect: chosenRect,
        segments: chosenSegments,
        members: [{ rect: chosenRect, segments: chosenSegments }],
        span: { ...caption },
        caption: normalizedCaption(caption.text),
        captionLines: 1,
        // The callout/tag text supplies part of the identity. Its local
        // leader/carrier geometry is auditable but cannot be swept as if it
        // were a complete plan-scale physical symbol.
        kind: "text_symbol",
        layout: "right",
      });
    }
    return { zone, pairs };
  });
}

/** Build one auditable pair per ruled table row. Vector members are gathered
 * only from that row's SYMBOL cell. When the visible mark is encoded solely
 * as PDF text (common for switch and fixture-type keys), preserve the row as
 * a nonseedable text-symbol identity for later plan-anchor corroboration. */
function structuredTablePairs(
  tables: StructuredLegendTable[], candidates: GlyphCandidate[], lines: LegendSpan[],
  rawSpans: LegendSpan[], typicalTextHeight: number,
): PairCandidate[] {
  const out: PairCandidate[] = [];
  const rectKey = (rect: [Point, Point]) => rect.flat().join(",");
  for (const table of tables) {
    const tableStart = out.length;
    for (let boundaryIndex = 1; boundaryIndex < table.boundaries.length; boundaryIndex++) {
      const top = table.boundaries[boundaryIndex - 1];
      const bottom = table.boundaries[boundaryIndex];
      if (bottom - top < typicalTextHeight * 0.4) continue;
      const descriptionLines = lines.filter((line) => {
        const centerY = (line.y0 + line.y1) / 2;
        const centerX = (line.x0 + line.x1) / 2;
        return centerY > top && centerY < bottom
          && line.x0 >= table.descriptionX - typicalTextHeight * 0.75
          && centerX < table.right
          && meaningfulCaption(line.text)
          && !isLegendHeadingText(line.text)
          && !/^(?:SYMBOL|DESCRIPTION)$/i.test(normalizedCaption(line.text));
      }).sort((a, b) => {
        const ay = (a.y0 + a.y1) / 2, by = (b.y0 + b.y1) / 2;
        return ay - by || a.x0 - b.x0;
      });
      if (!descriptionLines.length) continue;

      const members = candidates.filter((candidate) => {
        const centerX = (candidate.rect[0][0] + candidate.rect[1][0]) / 2;
        const centerY = (candidate.rect[0][1] + candidate.rect[1][1]) / 2;
        return centerX > table.left && centerX < table.symbolRight
          && centerY > top && centerY < bottom
          && !resemblesExtractedText(candidate.rect, rawSpans, candidate.segments);
      }).map((candidate): GlyphMember & { kind: GlyphCandidate["kind"] } => ({
        rect: candidate.rect,
        segments: candidate.segments,
        kind: candidate.kind,
      })).filter((member, index, all) =>
        all.findIndex((candidate) => rectKey(candidate.rect) === rectKey(member.rect)) === index)
        .sort((a, b) => a.rect[0][1] - b.rect[0][1] || a.rect[0][0] - b.rect[0][0]);

      const symbolText = rawSpans.filter((span) => {
        const centerX = (span.x0 + span.x1) / 2;
        const centerY = (span.y0 + span.y1) / 2;
        return centerX > table.left && centerX < table.symbolRight
          && centerY > top && centerY < bottom
          && /[A-Z0-9$#()+\-'".]/i.test(normalizedCaption(span.text));
      });
      if (!members.length && !symbolText.length) continue;
      const textSymbol = normalizedCaption(symbolText.map((span) => span.text).join(" "));

      const fallbackRect: [Point, Point] | null = symbolText.length ? [[
        Math.min(...symbolText.map((span) => span.x0)),
        Math.min(...symbolText.map((span) => span.y0)),
      ], [
        Math.max(...symbolText.map((span) => span.x1)),
        Math.max(...symbolText.map((span) => span.y1)),
      ]] : null;
      const pairMembers: GlyphMember[] = members.length
        ? members.map(({ rect, segments }) => ({ rect, segments }))
        : [{ rect: fallbackRect!, segments: 0 }];
      const rect: [Point, Point] = [[
        Math.min(...pairMembers.map((member) => member.rect[0][0])),
        Math.min(...pairMembers.map((member) => member.rect[0][1])),
      ], [
        Math.max(...pairMembers.map((member) => member.rect[1][0])),
        Math.max(...pairMembers.map((member) => member.rect[1][1])),
      ]];
      const caption = normalizedCaption(descriptionLines.map((line) => line.text).join(" "));
      const span: LegendSpan = {
        text: caption,
        x0: Math.min(...descriptionLines.map((line) => line.x0)),
        y0: Math.min(...descriptionLines.map((line) => line.y0)),
        x1: Math.max(...descriptionLines.map((line) => line.x1)),
        y1: Math.max(...descriptionLines.map((line) => line.y1)),
      };
      out.push({
        rect,
        segments: pairMembers.reduce((sum, member) => sum + member.segments, 0),
        members: pairMembers,
        span,
        caption,
        captionLines: descriptionLines.length,
        kind: !members.length ? "text_symbol"
          : ((rect[1][0] - rect[0][0]) >= typicalTextHeight * 3
            && (rect[1][1] - rect[0][1]) <= typicalTextHeight * 0.35)
            ? "line_style"
            : members.some((member) => member.kind === "symbol") ? "symbol" : "line_style",
        layout: "right",
        structuredRow: true,
        structuredBand: [top, bottom],
        ...(!members.length ? { structuredTextSymbol: textSymbol } : {}),
      });
    }
    const tableRows = out.splice(tableStart);
    // A whole SYMBOL column made only from alphabetic PDF-text tokens is an
    // abbreviation glossary, even if the drafter titled the panel LEGEND.
    // Mixed symbol tables remain eligible: their $/F#/height marks may be
    // text-encoded while neighboring rows provide real vector devices.
    const acronymGlossary = tableRows.length >= 6
      && tableRows.every((pair) => pair.kind === "text_symbol"
        && /^[A-Z]{1,4}\.?$/i.test(pair.structuredTextSymbol || ""));
    // Multi-letter alphabetic tokens are abbreviations or equipment tags
    // rather than vector glyph evidence. Even in a mixed table, do not turn
    // an APS/AFMS/etc. abbreviation cell into a learned symbol. A single
    // letter is different: S/T/R are common visible drawing marks and remain
    // auditable, nonseedable identities for real-plan corroboration.
    // Punctuation-bearing drawing marks ($, $3, F#, +0'-0") remain auditable
    // nonseedable identities because their visible notation is the symbol.
    const auditableRows = tableRows.filter((pair) => pair.kind !== "text_symbol"
      || !/^[A-Z]{2,4}\.?$/i.test(pair.structuredTextSymbol || ""));
    if (!acronymGlossary) out.push(...auditableRows);
  }
  return out;
}

function pairCandidates(
  candidates: GlyphCandidate[],
  spans: LegendSpan[], rawSpans: LegendSpan[], maxCaptionGapPx: number,
  typicalTextHeight: number,
  preferBelowCaption: ((span: LegendSpan) => boolean) | null = null,
  sectionDividers: RectBox[] = [], declaredTableHeaders: SymbolDescriptionHeader[] = [],
  rightCaptionGap: ((candidate: GlyphCandidate, span: LegendSpan) => number) | null = null,
  textResemblanceContext: ((candidate: GlyphCandidate) => TextResemblanceContext) | null = null,
): { pairs: PairCandidate[]; usedSpans: Set<number> } {
  type Edge = { candidate: number; span: number; score: number; gap: number };
  const edges: Edge[] = [];
  for (let ci = 0; ci < candidates.length; ci++) {
    const cand = candidates[ci];
    if (resemblesExtractedText(
      cand.rect, rawSpans, cand.segments, textResemblanceContext?.(cand),
    )) continue;
    const [[x0, y0], [x1, y1]] = cand.rect;
    const centerY = (y0 + y1) / 2;
    const margin = Math.max((y1 - y0) * 0.5, typicalTextHeight * 0.75);
    for (let si = 0; si < spans.length; si++) {
      const s = spans[si];
      if (!meaningfulCaption(s.text) || s.x0 < x1) continue;
      if (s.y1 < y0 - margin || s.y0 > y1 + margin) continue;
      const gap = s.x0 - x1;
      const allowedCaptionGap = Math.max(maxCaptionGapPx, rightCaptionGap?.(cand, s) ?? 0);
      if (gap > allowedCaptionGap) continue;
      const spanCenterY = (s.y0 + s.y1) / 2;
      const crossesIndependentPanel = sectionDividers.some((divider) => {
        const x = divider.x0;
        if (x <= x1 + typicalTextHeight * 0.1 || x >= s.x0 - typicalTextHeight * 0.1) return false;
        const top = Math.min(centerY, spanCenterY);
        const bottom = Math.max(centerY, spanCenterY);
        if (divider.y0 > top - typicalTextHeight * 2 || divider.y1 < bottom + typicalTextHeight * 2) return false;
        // SYMBOL / DESCRIPTION tables intentionally put a long vertical rule
        // between these fields. Their explicit paired headers prove that the
        // rule is an internal delimiter rather than a page-panel boundary.
        return !declaredTableHeaders.some((header) =>
          header.symbol.x1 <= x + typicalTextHeight
          && header.description.x0 >= x - typicalTextHeight
          && y0 >= header.symbol.y0 - typicalTextHeight * 0.5);
      });
      if (crossesIndependentPanel) continue;
      const short = normalizedCaption(s.text);
      const shortWords = short.split(/\s+/).length;
      const shadowedDraftingPayload = (isInlineDimensionValue(short)
        || /^[X#]+(?:[.\-/][X#]+)+$/i.test(short))
        && spans.some((other, oi) => oi !== si
          && other.x0 > s.x1
          && other.x0 - x1 <= Math.max(
            allowedCaptionGap, rightCaptionGap?.(cand, other) ?? 0,
          )
          && Math.abs((s.y0 + s.y1 - other.y0 - other.y1) / 2)
            <= typicalTextHeight * 2
          && isDraftingAnnotationCaption(other.text));
      // Example values inside a drafting mark are not globally meaningless:
      // they can be legitimate schedule/legend text elsewhere. Ignore one
      // here only when a fuller drafting identity demonstrably continues on
      // this same physical row to its right.
      if (shadowedDraftingPayload) continue;
      // A dimension value printed inside a headed legend sketch (20x10,
      // 12Ø, etc.) describes the sketch; it is not the row caption. Leave
      // the candidate available for the external DUCT/PIPE SIZE definition.
      if (isInlineDimensionValue(short)
        && (isExplicitLegendDimensionConvention(cand.rect, rawSpans)
          || isInternalLegendDimensionCaption(s, cand.rect, rawSpans))) continue;
      // Inner device qualifiers (CO, OC, AI, AO, CHWR...) often sit just
      // outside the main circle/line component and therefore look like the
      // nearest caption. When a real descriptive phrase continues on the
      // same row immediately to the right, the short token is glyph content,
      // not the row identity. A genuinely terse caption such as FAN has no
      // fuller same-row phrase and remains eligible.
      const shadowedByDescription = short.length <= 6 && shortWords <= 2 && spans.some((other, oi) => {
        if (oi === si || other.x0 <= s.x1) return false;
        const otherText = normalizedCaption(other.text);
        // A legitimate two-word description can be very short (CLEAN OUT
        // beside an internal CO tag is a reviewed example). Requiring eight
        // extra characters let the left rendition in a two-variant row pair
        // with the right rendition's inner tag, which then made the real
        // caption lose one physical member. Two words plus a five-character
        // advantage is already much stronger caption evidence than a terse
        // code while remaining unable to hide a genuine one-word caption.
        if (!meaningfulCaption(otherText) || otherText.length < short.length + 5 || otherText.split(/\s+/).length < 2) return false;
        const rowOverlap = Math.min(s.y1, other.y1) - Math.max(s.y0, other.y0);
        // Tall controller/flow-meter assemblies can contain several internal
        // tags on different baselines. Permit a description on another
        // baseline only when the fuller caption is physically owned by this
        // candidate's finite envelope. Mere nearby baselines let a BD tag
        // shadow the fuller caption of the following damper row.
        if (rowOverlap <= 0) {
          const otherCenterY = (other.y0 + other.y1) / 2;
          const envelopeSlack = typicalTextHeight * 0.25;
          // The fuller description must actually cross the candidate. The
          // terse tag may sit just outside it (for example a VFD label from
          // the previous tall assembly), but a fuller caption that is also
          // outside belongs to a neighboring row and cannot shadow the tag.
          if (otherCenterY < y0 - envelopeSlack || otherCenterY > y1 + envelopeSlack) return false;
        }
        return other.x0 - s.x0 <= Math.max(200, typicalTextHeight * 8)
          && other.x0 - x1 <= allowedCaptionGap;
      });
      if (shadowedByDescription) continue;
      // A discrete symbol can contain a thin horizontal baseline that is a
      // disconnected component of the same row (parallel transformer coils
      // and panelboard wedges are common examples). The baseline is closer
      // to the caption center than the information-rich component, so a
      // geometry-only nearest edge would incorrectly promote the baseline
      // to a routed-system line style. When a compact, multi-edge symbol
      // occupies the same horizontal envelope and the same caption row,
      // make that richer component the anchor; the row expansion pass will
      // reunite the thin members afterward.
      const embeddedInDiscreteSymbol = cand.kind === "line_style" && candidates.some((other, oi) => {
        if (oi === ci || other.kind !== "symbol" || other.segments < 2) return false;
        const otherCenterY = (other.rect[0][1] + other.rect[1][1]) / 2;
        return Math.abs(other.rect[0][0] - cand.rect[0][0]) <= typicalTextHeight * 0.5
          && Math.abs(other.rect[1][0] - cand.rect[1][0]) <= typicalTextHeight * 0.5
          && Math.abs(otherCenterY - spanCenterY) <= typicalTextHeight;
      });
      if (embeddedInDiscreteSymbol) continue;
      // Caption ownership is a row relationship, not merely whichever
      // component ends farthest to the right. A component from the next
      // row can be horizontally closer while only entering this row through
      // the deliberately generous tall-glyph margin above. Measured on a
      // real legend, the next row's actuator tag stole FLEXIBLE PIPE
      // CONNECTOR from the compact hatched fitting directly beside it. Pay
      // strongly for the caption center falling outside the component's
      // actual vertical interval, while retaining a small center tie-break
      // for two components that both genuinely occupy the row.
      const rowMiss = Math.max(0, y0 - spanCenterY, spanCenterY - y1);
      // In a headed cell legend, the same-row "caption" can actually be an
      // internal tag belonging to the neighboring cell (the reviewed RCP
      // case paired a ceiling-height bubble with the next cell's EXP tag).
      // When this candidate has a geometrically stronger centered caption
      // directly below it, let the below-caption path own the glyph. Normal
      // SYMBOL/DESCRIPTION columns have no horizontally overlapping text
      // under their glyphs and are unaffected.
      const betterCaptionBelow = !!preferBelowCaption && spans.some((other, oi) => {
        if (oi === si || !meaningfulCaption(other.text)) return false;
        if (!preferBelowCaption(other)) return false;
        const belowText = normalizedCaption(other.text);
        // A terse tag below the current row is often the identifying text
        // inside the NEXT row's carrier (CT/DP/AI), not this glyph's cell
        // caption. Require descriptive text before it can override a valid
        // right-caption edge.
        if (belowText.split(/\s+/).length < 2) return false;
        const belowGap = other.y0 - y1;
        if (belowGap < -typicalTextHeight * 0.15 || belowGap > typicalTextHeight * 5) return false;
        const horizontalMiss = Math.max(0, other.x0 - (x0 + x1) / 2, (x0 + x1) / 2 - other.x1);
        if (horizontalMiss > typicalTextHeight * 2.5) return false;
        const belowScore = Math.max(0, belowGap) + horizontalMiss * 2;
        return belowScore + typicalTextHeight * 0.5 < gap + rowMiss * 2;
      });
      if (betterCaptionBelow) continue;
      edges.push({
        candidate: ci,
        span: si,
        gap,
        score: gap + rowMiss * 2 + Math.abs(spanCenterY - centerY) * 0.1,
      });
    }
  }

  // Global nearest-edge assignment makes ownership independent of segment
  // input order. The old candidate-first loop could let an earlier, farther
  // component steal a caption from the actually nearest glyph.
  edges.sort((a, b) => a.score - b.score || a.gap - b.gap || a.candidate - b.candidate || a.span - b.span);
  const usedCandidates = new Set<number>();
  const usedSpans = new Set<number>();
  const pairs: PairCandidate[] = [];
  for (const edge of edges) {
    if (usedCandidates.has(edge.candidate)) continue;
    // A legend row commonly shows two disconnected renditions of the same
    // identity (single-line/double-line duct, plan/profile valve, etc.).
    // Both candidates' best edge is therefore the SAME caption. Once the
    // first rendition owns it, the second must remain an unpaired member for
    // expandSymbolPairs to reunite with that row; allowing it to fall through
    // to its second-best edge makes it steal the next physical caption and
    // cascades every later row downward. Each candidate gets exactly its
    // best geometrically eligible caption attempt, even when that caption is
    // already owned. This preserves true one-to-one caption ownership while
    // still allowing one row to carry multiple auditable geometry members.
    usedCandidates.add(edge.candidate);
    if (usedSpans.has(edge.span)) continue;
    usedSpans.add(edge.span);
    const cand = candidates[edge.candidate];
    const span = spans[edge.span];
    pairs.push({
      rect: cand.rect,
      segments: cand.segments,
      members: [{ rect: cand.rect, segments: cand.segments }],
      span: { ...span },
      caption: normalizedCaption(span.text),
      captionLines: 1,
      kind: cand.kind,
      layout: "right",
    });
  }
  return { pairs, usedSpans };
}

/** Pair a compact vector glyph with a caption centered BELOW it. Reflected
 * ceiling plan, fire-alarm, and device-cell legends routinely use this
 * topology instead of a SYMBOL/DESCRIPTION row. The path is intentionally
 * separate from ordinary right-caption pairing: it is enabled only on a
 * page with an explicit legend/symbol heading and later has to clear a
 * repeated headed-cell layout gate. */
function pairCandidatesBelow(
  candidates: GlyphCandidate[], spans: LegendSpan[], rawSpans: LegendSpan[],
  maxCaptionGapPx: number, typicalTextHeight: number,
  alreadyClaimed: PairCandidate[], eligibleCaption: (span: LegendSpan) => boolean = () => true,
): { pairs: PairCandidate[]; usedSpans: Set<number> } {
  type Edge = { candidate: number; span: number; score: number; gap: number };
  const rectKey = (rect: [Point, Point]) => rect.flat().join(",");
  const claimedRects = new Set(alreadyClaimed.flatMap((pair) =>
    pair.members.map((member) => rectKey(member.rect))));
  const maxVerticalGap = Math.min(maxCaptionGapPx, typicalTextHeight * 5);
  const horizontalSlack = typicalTextHeight * 2.5;
  const edges: Edge[] = [];

  for (let ci = 0; ci < candidates.length; ci++) {
    const cand = candidates[ci];
    if (claimedRects.has(rectKey(cand.rect)) || resemblesExtractedText(cand.rect, rawSpans, cand.segments)) continue;
    const [[x0, y0], [x1, y1]] = cand.rect;
    const cx = (x0 + x1) / 2;
    for (let si = 0; si < spans.length; si++) {
      const span = spans[si];
      if (!eligibleCaption(span) || !meaningfulCaption(span.text)) continue;
      // A short object label can also be a legal section title (LIGHT
      // FIXTURES is a common example). Inside an independently established
      // below-caption legend grid, glyph-above/text-below geometry resolves
      // that ambiguity. The later headed-grid gate still rejects pages with
      // no explicit RCP/P&ID legend jurisdiction.
      // Vertical/rotated section labels and table dividers are context, not
      // below-glyph descriptions.
      if (span.y1 - span.y0 > typicalTextHeight * 2.2) continue;
      const gap = span.y0 - y1;
      // PDF text boxes can descend a fraction of one lettering height into
      // the last tick/block of an otherwise visibly below-captioned cell.
      // Keep the overlap bounded well inside one line so side-by-side text
      // cannot masquerade as a below caption.
      if (gap < -typicalTextHeight * 0.35 || gap > maxVerticalGap) continue;
      const horizontalMiss = Math.max(0, span.x0 - cx, cx - span.x1);
      if (horizontalMiss > horizontalSlack) continue;
      const spanCenterX = (span.x0 + span.x1) / 2;
      edges.push({
        candidate: ci,
        span: si,
        gap: Math.max(0, gap),
        score: Math.max(0, gap) + horizontalMiss * 2
          + Math.abs(cx - spanCenterX) * 0.05,
      });
    }
  }

  edges.sort((a, b) => a.score - b.score || a.gap - b.gap
    || a.candidate - b.candidate || a.span - b.span);
  const usedCandidates = new Set<number>();
  const usedSpans = new Set<number>();
  const pairs: PairCandidate[] = [];
  for (const edge of edges) {
    if (usedCandidates.has(edge.candidate)) continue;
    usedCandidates.add(edge.candidate);
    if (usedSpans.has(edge.span)) continue;
    usedSpans.add(edge.span);
    const cand = candidates[edge.candidate];
    const span = spans[edge.span];
    pairs.push({
      rect: cand.rect,
      segments: cand.segments,
      members: [{ rect: cand.rect, segments: cand.segments }],
      span: { ...span },
      caption: normalizedCaption(span.text),
      captionLines: 1,
      kind: cand.kind,
      layout: "below",
    });
  }
  return { pairs, usedSpans };
}

type MaterialLegendGroup = {
  heading: string;
  pairs: PairCandidate[];
  zone: RectBox;
};

/** Pair a material/pattern description on the LEFT with its bordered hatch
 * swatch on the RIGHT. This is intentionally not folded into the ordinary
 * glyph-to-caption matcher: reversing that matcher globally makes one
 * column's swatch steal the next column's caption. A real underlined
 * materials heading, a repeated four-sided swatch family, row overlap, and
 * one-to-one nearest ownership all have to agree before any row is emitted. */
function materialLegendGroups(
  lines: LegendSpan[], segs: number[], typicalTextHeight: number,
  maxGlyphDimPx: number, maxCaptionGapPx: number, maxWrapGapPx: number,
  maxWrapIndentPx: number, maxWrapLines: number,
): MaterialLegendGroup[] {
  const headings = lines.filter((line) => isMaterialLegendHeading(line.text));
  const rectKey = (rect: [Point, Point]) => rect.flat().join(",");
  const width = (candidate: GlyphCandidate) => candidate.rect[1][0] - candidate.rect[0][0];
  const height = (candidate: GlyphCandidate) => candidate.rect[1][1] - candidate.rect[0][1];
  const borderedSwatches = (
    jurisdiction: UnderlinedLegendJurisdiction,
  ): GlyphCandidate[] => {
    type AxisSegment = { x0: number; y0: number; x1: number; y1: number };
    const tolerance = Math.max(1.5, typicalTextHeight * 0.12);
    const horizontal: AxisSegment[] = [];
    const vertical: AxisSegment[] = [];
    const verticalLimit = jurisdiction.y + Math.max(900, typicalTextHeight * 120);
    for (let i = 0; i < segs.length; i += 4) {
      const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
      const sx0 = Math.min(ax, bx), sx1 = Math.max(ax, bx);
      const sy0 = Math.min(ay, by), sy1 = Math.max(ay, by);
      if (sx1 < jurisdiction.x0 - typicalTextHeight || sx0 > jurisdiction.x1 + typicalTextHeight
        || sy1 < jurisdiction.y || sy0 > verticalLimit) continue;
      const length = Math.hypot(bx - ax, by - ay);
      if (Math.abs(ay - by) <= tolerance
        && length >= typicalTextHeight * 4 && length <= maxGlyphDimPx) {
        const y = (ay + by) / 2;
        horizontal.push({ x0: sx0, y0: y, x1: sx1, y1: y });
      }
      if (Math.abs(ax - bx) <= tolerance
        && length >= typicalTextHeight * 1.4 && length <= maxGlyphDimPx) {
        const x = (ax + bx) / 2;
        vertical.push({ x0: x, y0: sy0, x1: x, y1: sy1 });
      }
    }
    const unique = (entries: AxisSegment[]) => entries.filter((entry, index, all) => {
      const key = [entry.x0, entry.y0, entry.x1, entry.y1]
        .map((value) => Math.round(value / tolerance)).join(",");
      return all.findIndex((candidate) => [candidate.x0, candidate.y0, candidate.x1, candidate.y1]
        .map((value) => Math.round(value / tolerance)).join(",") === key) === index;
    });
    const hs = unique(horizontal).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0 || a.x1 - b.x1);
    const vs = unique(vertical).sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0 || a.y1 - b.y1);
    const coveredVerticalSide = (x: number, y0: number, y1: number): AxisSegment | null => {
      const pieces = vs.filter((edge) => Math.abs(edge.x0 - x) <= tolerance
        && edge.y1 >= y0 - tolerance && edge.y0 <= y1 + tolerance)
        .sort((a, b) => a.y0 - b.y0 || a.y1 - b.y1);
      let cursor = y0;
      const used: AxisSegment[] = [];
      for (const piece of pieces) {
        if (piece.y0 > cursor + tolerance) break;
        if (piece.y1 <= cursor - tolerance) continue;
        used.push(piece);
        cursor = Math.max(cursor, piece.y1);
        if (cursor >= y1 - tolerance) {
          return {
            x0: median(used.map((edge) => edge.x0)),
            y0,
            x1: median(used.map((edge) => edge.x1)),
            y1,
          };
        }
      }
      return null;
    };
    const boxes: GlyphCandidate[] = [];
    for (let topIndex = 0; topIndex < hs.length; topIndex++) {
      const top = hs[topIndex];
      for (let bottomIndex = topIndex + 1; bottomIndex < hs.length; bottomIndex++) {
        const bottom = hs[bottomIndex];
        if (bottom.y0 <= top.y0
          || Math.abs(bottom.x0 - top.x0) > tolerance
          || Math.abs(bottom.x1 - top.x1) > tolerance) continue;
        const w = (top.x1 - top.x0 + bottom.x1 - bottom.x0) / 2;
        const h = bottom.y0 - top.y0;
        if (h < typicalTextHeight * 1.4 || h > maxGlyphDimPx
          || w / Math.max(1, h) > 12) continue;
        // Pattern generators frequently split a swatch border exactly where
        // an interior hatch stroke touches it. A contiguous collinear chain
        // is the same closed-side evidence as one PDF segment; demanding one
        // unsplit primitive silently lost legitimate batt/loop hatches.
        const left = coveredVerticalSide(top.x0, top.y0, bottom.y0);
        const right = coveredVerticalSide(top.x1, top.y0, bottom.y0);
        if (!left || !right) continue;
        const rect: [Point, Point] = [[
          Math.min(top.x0, bottom.x0, left.x0), Math.min(top.y0, left.y0, right.y0),
        ], [
          Math.max(top.x1, bottom.x1, right.x0), Math.max(bottom.y0, left.y1, right.y1),
        ]];
        let segmentCount = 0;
        for (let i = 0; i < segs.length; i += 4) {
          const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
          if (ax >= rect[0][0] - tolerance && ax <= rect[1][0] + tolerance
            && bx >= rect[0][0] - tolerance && bx <= rect[1][0] + tolerance
            && ay >= rect[0][1] - tolerance && ay <= rect[1][1] + tolerance
            && by >= rect[0][1] - tolerance && by <= rect[1][1] + tolerance) segmentCount++;
        }
        boxes.push({ rect, segments: segmentCount, kind: "symbol" });
      }
    }
    return boxes.filter((candidate, index, all) => all.findIndex((other) =>
      rectKey(other.rect) === rectKey(candidate.rect)) === index);
  };

  const out: MaterialLegendGroup[] = [];
  for (const heading of headings) {
    const jurisdiction = underlinedLegendJurisdiction(heading, segs, typicalTextHeight);
    if (!jurisdiction) continue;
    const bordered = borderedSwatches(jurisdiction);

    // A materials panel is a repeated swatch vocabulary. Require a tight,
    // page-scaled dimension family so one ordinary plan rectangle near a
    // MATERIAL LEGEND note cannot establish this reversed orientation.
    // Hatch strokes can themselves form smaller closed sub-boxes inside a
    // true swatch. Prefer a containing box only when its dimensions have
    // stronger repeated support across the panel; in a genuinely ruled
    // table the repeated row cells therefore beat its one-off outer frame.
    const familySupportCache = new Map<GlyphCandidate, number>();
    const familySupport = (candidate: GlyphCandidate): number => {
      const cached = familySupportCache.get(candidate);
      if (cached !== undefined) return cached;
      const support = bordered.filter((other) =>
        Math.abs(width(other) - width(candidate)) <= Math.max(2, typicalTextHeight * 0.35, width(candidate) * 0.08)
        && Math.abs(height(other) - height(candidate)) <= Math.max(2, typicalTextHeight * 0.35, height(candidate) * 0.08)).length;
      familySupportCache.set(candidate, support);
      return support;
    };
    const supported = bordered.filter((candidate) => familySupport(candidate) >= 3);
    const swatches = supported.filter((candidate) => !supported.some((other) => {
      if (other === candidate || familySupport(other) < familySupport(candidate)) return false;
      const sameHorizontalBounds = Math.abs(other.rect[0][0] - candidate.rect[0][0]) <= typicalTextHeight * 0.12
        && Math.abs(other.rect[1][0] - candidate.rect[1][0]) <= typicalTextHeight * 0.12;
      const containsVertically = other.rect[0][1] <= candidate.rect[0][1] + typicalTextHeight * 0.12
        && other.rect[1][1] >= candidate.rect[1][1] - typicalTextHeight * 0.12;
      return sameHorizontalBounds && containsVertically
        && height(other) > height(candidate) + typicalTextHeight * 0.12;
    }))
      .sort((a, b) => a.rect[0][1] - b.rect[0][1] || a.rect[0][0] - b.rect[0][0]);
    if (swatches.length < 3) continue;

    type Edge = { candidate: number; span: number; score: number };
    const edges: Edge[] = [];
    for (let ci = 0; ci < swatches.length; ci++) {
      const candidate = swatches[ci];
      const [[x0, y0], [, y1]] = candidate.rect;
      const centerY = (y0 + y1) / 2;
      for (let si = 0; si < lines.length; si++) {
        const span = lines[si];
        const spanCenterY = (span.y0 + span.y1) / 2;
        if (!meaningfulCaption(span.text)
          || isLegendHeadingText(span.text)
          || isUnderlinedSubsectionHeading(span, segs, typicalTextHeight)
          || span.x0 < jurisdiction.x0 - typicalTextHeight
          || span.x1 > x0 + typicalTextHeight * 0.25
          || x0 - span.x1 > Math.max(maxCaptionGapPx, typicalTextHeight * 18)
          || spanCenterY < y0 - typicalTextHeight * 0.75
          || spanCenterY > y1 + typicalTextHeight * 0.75) continue;
        const horizontalGap = Math.max(0, x0 - span.x1);
        edges.push({
          candidate: ci,
          span: si,
          score: Math.abs(spanCenterY - centerY) * 4 + horizontalGap * 0.08,
        });
      }
    }
    edges.sort((a, b) => a.score - b.score || a.candidate - b.candidate || a.span - b.span);
    const usedCandidates = new Set<number>();
    const usedSpans = new Set<number>();
    const pairs: PairCandidate[] = [];
    for (const edge of edges) {
      if (usedCandidates.has(edge.candidate) || usedSpans.has(edge.span)) continue;
      usedCandidates.add(edge.candidate);
      usedSpans.add(edge.span);
      const candidate = swatches[edge.candidate];
      const span = lines[edge.span];
      pairs.push({
        rect: candidate.rect,
        segments: candidate.segments,
        members: [{ rect: candidate.rect, segments: candidate.segments }],
        span: { ...span },
        caption: normalizedCaption(span.text),
        captionLines: 1,
        kind: candidate.kind,
        layout: "left",
      });
    }
    attachWrappedCaptions(
      pairs, lines, usedSpans,
      maxWrapGapPx, maxWrapIndentPx, maxWrapLines, typicalTextHeight,
    );
    // An interior full-width hatch stroke plus split border sides can make
    // two nested candidates claim the two physical lines of one material
    // name before the ordinary unclaimed-line wrapper runs. Reunite those
    // overlapping fragments with the same bounded topology used by normal
    // multi-component legend glyphs; separate swatch rows have a real row
    // gap and remain independent.
    const mergedPairs = mergeOwnedWrapPairs(
      pairs, maxWrapGapPx, maxWrapIndentPx, maxGlyphDimPx,
      typicalTextHeight, maxWrapLines, lines,
    );
    for (const pair of mergedPairs) {
      const sameRowContainers = bordered.filter((candidate) => {
        const tolerance = typicalTextHeight * 0.15;
        const sameHorizontalBounds = Math.abs(candidate.rect[0][0] - pair.rect[0][0]) <= tolerance
          && Math.abs(candidate.rect[1][0] - pair.rect[1][0]) <= tolerance;
        const containsCurrentEvidence = candidate.rect[0][1] <= pair.rect[0][1] + tolerance
          && candidate.rect[1][1] >= pair.rect[1][1] - tolerance;
        if (!sameHorizontalBounds || !containsCurrentEvidence) return false;
        // A closed frame spanning several material rows is table/panel
        // structure, not one swatch. It cannot contain another independently
        // owned caption baseline in this same description+swatch column.
        return !mergedPairs.some((other) => other !== pair
          && Math.abs(other.rect[0][0] - candidate.rect[0][0]) <= tolerance
          && Math.abs(other.rect[1][0] - candidate.rect[1][0]) <= tolerance
          && (other.span.y0 + other.span.y1) / 2 >= candidate.rect[0][1] - tolerance
          && (other.span.y0 + other.span.y1) / 2 <= candidate.rect[1][1] + tolerance);
      }).sort((a, b) => {
        const areaA = width(a) * height(a);
        const areaB = width(b) * height(b);
        return areaB - areaA || a.rect[0][1] - b.rect[0][1];
      });
      const complete = sameRowContainers[0];
      if (!complete) continue;
      pair.rect = complete.rect;
      pair.segments = complete.segments;
      pair.members = [{ rect: complete.rect, segments: complete.segments }];
    }
    if (mergedPairs.length < 3) continue;
    out.push({
      heading: normalizedCaption(heading.text),
      pairs: mergedPairs,
      zone: {
        x0: jurisdiction.x0 - typicalTextHeight,
        x1: jurisdiction.x1 + typicalTextHeight,
        y0: jurisdiction.y,
        y1: Math.max(...swatches.map((candidate) => candidate.rect[1][1])) + typicalTextHeight * 2,
      },
    });
  }
  return out;
}

/** Collect side-by-side renditions inside one below-caption legend cell.
 * Each connected component remains auditable in member_rects. The union may
 * be wider than one compact glyph because a cell can deliberately present
 * several fixture variants, but it remains bounded by the caption/cell's
 * own width and the page-scaled glyph ceiling. */
function expandBelowCaptionPairs(
  belowPairs: PairCandidate[], candidates: GlyphCandidate[], rawSpans: LegendSpan[],
  typicalTextHeight: number, maxGlyphDimPx: number, claimedPairs: PairCandidate[],
): void {
  const rectKey = (rect: [Point, Point]) => rect.flat().join(",");
  const claimed = new Set(claimedPairs.flatMap((pair) =>
    pair.members.map((member) => rectKey(member.rect))));
  for (const pair of belowPairs) {
    const anchorCenterY = (pair.rect[0][1] + pair.rect[1][1]) / 2;
    const captionWidth = pair.span.x1 - pair.span.x0;
    const cellX0 = pair.span.x0 - typicalTextHeight * 4;
    const cellX1 = pair.span.x1 + typicalTextHeight * 4;
    for (;;) {
      let best: GlyphCandidate | null = null;
      let bestDistance = Infinity;
      for (const candidate of candidates) {
        if (claimed.has(rectKey(candidate.rect)) || resemblesExtractedText(candidate.rect, rawSpans, candidate.segments)) continue;
        if (candidate.rect[1][1] > pair.span.y0 + typicalTextHeight * 0.2) continue;
        const candidateCenterX = (candidate.rect[0][0] + candidate.rect[1][0]) / 2;
        const candidateCenterY = (candidate.rect[0][1] + candidate.rect[1][1]) / 2;
        if (candidateCenterX < cellX0 || candidateCenterX > cellX1) continue;
        if (Math.abs(candidateCenterY - anchorCenterY) > typicalTextHeight * 2.5) continue;
        const horizontalGap = candidate.rect[1][0] < pair.rect[0][0]
          ? pair.rect[0][0] - candidate.rect[1][0]
          : pair.rect[1][0] < candidate.rect[0][0]
            ? candidate.rect[0][0] - pair.rect[1][0] : 0;
        const verticalGap = candidate.rect[1][1] < pair.rect[0][1]
          ? pair.rect[0][1] - candidate.rect[1][1]
          : pair.rect[1][1] < candidate.rect[0][1]
            ? candidate.rect[0][1] - pair.rect[1][1] : 0;
        if (horizontalGap > maxGlyphDimPx || verticalGap > typicalTextHeight * 2.5) continue;
        const unionW = Math.max(pair.rect[1][0], candidate.rect[1][0])
          - Math.min(pair.rect[0][0], candidate.rect[0][0]);
        const unionH = Math.max(pair.rect[1][1], candidate.rect[1][1])
          - Math.min(pair.rect[0][1], candidate.rect[0][1]);
        const maxCellWidth = Math.max(maxGlyphDimPx * 2.25, captionWidth + typicalTextHeight * 8);
        if (unionW > maxCellWidth || unionH > maxGlyphDimPx) continue;
        const distance = Math.hypot(horizontalGap, verticalGap)
          + Math.abs(candidateCenterY - anchorCenterY) * 0.1;
        if (distance < bestDistance) { best = candidate; bestDistance = distance; }
      }
      if (!best) break;
      claimed.add(rectKey(best.rect));
      pair.members.push({ rect: best.rect, segments: best.segments });
      pair.segments += best.segments;
      if (best.kind === "symbol") pair.kind = "symbol";
      pair.rect = [
        [Math.min(pair.rect[0][0], best.rect[0][0]), Math.min(pair.rect[0][1], best.rect[0][1])],
        [Math.max(pair.rect[1][0], best.rect[1][0]), Math.max(pair.rect[1][1], best.rect[1][1])],
      ];
    }
  }
}

/** Reunite a disconnected glyph whose upper fragment was forced onto the
 * preceding text-only row after its lower fragment won the glyph's real
 * caption. This is distinct from wrapped-caption merging: the two captions
 * are separate physical rows, but the alleged upper row's geometry sits
 * closer to the lower caption and forms one compact symbol with the lower
 * row's geometry. The test is entirely page-relative (text height, row
 * centers, compact union) and never depends on caption wording. */
function mergeDownshiftedGlyphFragments(
  pairs: PairCandidate[], typicalTextHeight: number, maxGlyphDimPx: number,
  gridPx: number, rawSpans: LegendSpan[], maxLineGapPx: number,
  maxIndentDriftPx: number, maxWrapLines: number,
): PairCandidate[] {
  const sorted = [...pairs].sort((a, b) =>
    (a.span.y0 + a.span.y1) - (b.span.y0 + b.span.y1) || a.span.x0 - b.span.x0,
  );
  const consumed = new Set<number>();
  for (let lowerIndex = 0; lowerIndex < sorted.length; lowerIndex++) {
    const lower = sorted[lowerIndex];
    if (lower.kind !== "symbol") continue;
    const lowerCaptionY = (lower.span.y0 + lower.span.y1) / 2;
    for (let upperIndex = lowerIndex - 1; upperIndex >= 0; upperIndex--) {
      if (consumed.has(upperIndex)) continue;
      const upper = sorted[upperIndex];
      if (upper.kind !== "symbol") continue;
      const upperCaptionY = (upper.span.y0 + upper.span.y1) / 2;
      if (upperCaptionY >= lowerCaptionY) continue;
      if (Math.abs(upper.span.x0 - lower.span.x0) > Math.max(5, typicalTextHeight * 0.3)) continue;

      const upperGlyphY = (upper.rect[0][1] + upper.rect[1][1]) / 2;
      const ownRowDistance = Math.abs(upperGlyphY - upperCaptionY);
      const lowerRowDistance = Math.abs(upperGlyphY - lowerCaptionY);
      if (lowerRowDistance + gridPx >= ownRowDistance) continue;

      const horizontalGap = upper.rect[1][0] < lower.rect[0][0]
        ? lower.rect[0][0] - upper.rect[1][0]
        : lower.rect[1][0] < upper.rect[0][0] ? upper.rect[0][0] - lower.rect[1][0] : 0;
      const verticalGap = upper.rect[1][1] < lower.rect[0][1]
        ? lower.rect[0][1] - upper.rect[1][1]
        : lower.rect[1][1] < upper.rect[0][1] ? upper.rect[0][1] - lower.rect[1][1] : 0;
      if (horizontalGap > typicalTextHeight * 1.5 || verticalGap > typicalTextHeight * 1.25) continue;

      const union: [Point, Point] = [
        [Math.min(upper.rect[0][0], lower.rect[0][0]), Math.min(upper.rect[0][1], lower.rect[0][1])],
        [Math.max(upper.rect[1][0], lower.rect[1][0]), Math.max(upper.rect[1][1], lower.rect[1][1])],
      ];
      if (union[1][0] - union[0][0] > maxGlyphDimPx || union[1][1] - union[0][1] > maxGlyphDimPx) continue;

      lower.rect = union;
      lower.segments += upper.segments;
      lower.members.push(...upper.members);
      lower.kind = glyphKind(union, gridPx, lower.segments, maxGlyphDimPx, rawSpans);
      // Sometimes the alleged "preceding row" is actually line one of this
      // row's own wrapped caption. Global one-to-one pairing can assign a
      // disconnected fragment to that first line after the main component
      // wins line two. When the text itself is wrap-contiguous, preserve it
      // while reuniting the geometry. A genuine preceding text-only legend
      // row remains separated by a full row gap and is still discarded by
      // this fragment-recovery pass rather than promoted as a symbol.
      const captionGap = lower.span.y0 - upper.span.y1;
      const wrappedCaption = captionGap >= -1 && captionGap <= maxLineGapPx
        && Math.abs(upper.span.x0 - lower.span.x0) <= maxIndentDriftPx
        && upper.captionLines + lower.captionLines <= maxWrapLines;
      if (wrappedCaption) {
        lower.caption = normalizedCaption(`${upper.caption} ${lower.caption}`);
        lower.captionLines += upper.captionLines;
        lower.span = {
          text: lower.caption,
          x0: Math.min(upper.span.x0, lower.span.x0),
          y0: Math.min(upper.span.y0, lower.span.y0),
          x1: Math.max(upper.span.x1, lower.span.x1),
          y1: Math.max(upper.span.y1, lower.span.y1),
        };
      }
      consumed.add(upperIndex);
      break;
    }
  }
  return sorted.filter((_, index) => !consumed.has(index));
}

/** A dashed/dotted routed-system key is several disconnected vector
 * components by definition. Caption ownership selects the nearest dash;
 * expand from that anchor across the row's full collinear run so the
 * evidence rect describes the actual swatch, not an arbitrary fragment.
 * The expansion is local, gap-bounded, and capped by the same adaptive
 * glyph dimension used by candidate generation, so it cannot absorb a
 * distant table rule or the next legend column. */
function expandLineStylePairs(
  pairs: PairCandidate[],
  candidates: GlyphCandidate[],
  rawSpans: LegendSpan[], gridPx: number, typicalTextHeight: number, maxLineStyleDimPx: number,
): void {
  const maxGap = Math.max(gridPx * 3, typicalTextHeight * 1.5);
  const centerTolerance = Math.max(gridPx * 2, typicalTextHeight * 0.3);
  const sameRect = (a: [Point, Point], b: [Point, Point]) =>
    a[0][0] === b[0][0] && a[0][1] === b[0][1] && a[1][0] === b[1][0] && a[1][1] === b[1][1];

  for (const pair of pairs) {
    const pairW = pair.rect[1][0] - pair.rect[0][0];
    const pairH = pair.rect[1][1] - pair.rect[0][1];
    const pairIsLineFragment = pairW > pairH * 4 && pairH <= gridPx * 2.5;
    const horizontal = pair.rect[1][0] - pair.rect[0][0] >= pair.rect[1][1] - pair.rect[0][1];
    const hasExternalLineMember = horizontal && candidates.some((candidate) => {
      if (candidate.kind !== "line_style" || resemblesExtractedText(candidate.rect, rawSpans, candidate.segments)) return false;
      const centerDelta = Math.abs(
        (candidate.rect[0][1] + candidate.rect[1][1]) / 2 - (pair.rect[0][1] + pair.rect[1][1]) / 2,
      );
      const gap = candidate.rect[1][0] < pair.rect[0][0]
        ? pair.rect[0][0] - candidate.rect[1][0]
        : pair.rect[1][0] < candidate.rect[0][0] ? candidate.rect[0][0] - pair.rect[1][0] : 0;
      return centerDelta <= centerTolerance && gap <= maxGap
        && (candidate.rect[0][0] < pair.rect[0][0] - typicalTextHeight * 0.5
          || candidate.rect[1][0] > pair.rect[1][0] + typicalTextHeight * 0.5);
    });
    if (pair.kind !== "line_style" && !pairIsLineFragment
      && !(isRoutedSystemCaption(pair.caption) && hasExternalLineMember)) continue;
    let rect: [Point, Point] = [[...pair.rect[0]], [...pair.rect[1]]];
    let segments = pair.segments;
    const included = new Set<number>();
    for (let i = 0; i < candidates.length; i++) if (sameRect(candidates[i].rect, pair.rect)) included.add(i);

    for (;;) {
      let best = -1;
      let bestGap = Infinity;
      for (let i = 0; i < candidates.length; i++) {
        if (included.has(i)) continue;
        const candidate = candidates[i];
        const cw = candidate.rect[1][0] - candidate.rect[0][0];
        const ch = candidate.rect[1][1] - candidate.rect[0][1];
        const candidateIsLineFragment = cw > ch * 4 && ch <= gridPx * 2.5;
        if ((candidate.kind !== "line_style" && !candidateIsLineFragment) || resemblesExtractedText(candidate.rect, rawSpans, candidate.segments)) continue;
        const candidateHorizontal = candidate.rect[1][0] - candidate.rect[0][0] >= candidate.rect[1][1] - candidate.rect[0][1];
        if (candidateHorizontal !== horizontal) continue;

        let gap: number;
        let centerDelta: number;
        let unionSpan: number;
        if (horizontal) {
          if (candidate.rect[1][0] > pair.span.x0) continue;
          gap = candidate.rect[0][0] > rect[1][0]
            ? candidate.rect[0][0] - rect[1][0]
            : rect[0][0] > candidate.rect[1][0] ? rect[0][0] - candidate.rect[1][0] : 0;
          centerDelta = Math.abs(
            (candidate.rect[0][1] + candidate.rect[1][1]) / 2 - (rect[0][1] + rect[1][1]) / 2,
          );
          unionSpan = Math.max(rect[1][0], candidate.rect[1][0]) - Math.min(rect[0][0], candidate.rect[0][0]);
        } else {
          gap = candidate.rect[0][1] > rect[1][1]
            ? candidate.rect[0][1] - rect[1][1]
            : rect[0][1] > candidate.rect[1][1] ? rect[0][1] - candidate.rect[1][1] : 0;
          centerDelta = Math.abs(
            (candidate.rect[0][0] + candidate.rect[1][0]) / 2 - (rect[0][0] + rect[1][0]) / 2,
          );
          unionSpan = Math.max(rect[1][1], candidate.rect[1][1]) - Math.min(rect[0][1], candidate.rect[0][1]);
        }
        if (gap > maxGap || centerDelta > centerTolerance || unionSpan > maxLineStyleDimPx) continue;
        if (gap < bestGap) { best = i; bestGap = gap; }
      }
      if (best < 0) break;
      const candidate = candidates[best];
      included.add(best);
      segments += candidate.segments;
      pair.members.push({ rect: candidate.rect, segments: candidate.segments });
      rect = [
        [Math.min(rect[0][0], candidate.rect[0][0]), Math.min(rect[0][1], candidate.rect[0][1])],
        [Math.max(rect[1][0], candidate.rect[1][0]), Math.max(rect[1][1], candidate.rect[1][1])],
      ];
    }
    pair.rect = rect;
    pair.segments = segments;
    if (included.size >= 2) pair.kind = "line_style";
  }
}

/** Reunite one rendered rectangular carrier when PDF coordinate rounding
 * leaves its two decorated end posts and two rails as four disconnected
 * components. Proximity alone is not enough: the repair requires matching
 * end-post heights, one rail at each end, and both rails spanning nearly the
 * full distance between the posts. That topology distinguishes a real duct
 * or fitting example from neighboring symbols, table rules, and plan ink. */
function recoverSplitRectangularCarriers(
  pairs: PairCandidate[], candidates: GlyphCandidate[],
  typicalTextHeight: number, maxGlyphDimPx: number,
): void {
  const rectKey = (rect: [Point, Point]) => rect.flat().join(",");
  const owner = new Map<string, PairCandidate>();
  for (const pair of pairs) {
    for (const member of pair.members) owner.set(rectKey(member.rect), pair);
  }
  const centerX = (rect: [Point, Point]) => (rect[0][0] + rect[1][0]) / 2;
  const centerY = (rect: [Point, Point]) => (rect[0][1] + rect[1][1]) / 2;
  const width = (rect: [Point, Point]) => rect[1][0] - rect[0][0];
  const height = (rect: [Point, Point]) => rect[1][1] - rect[0][1];
  const postWidth = Math.max(8, typicalTextHeight * 0.5);
  const edgeTolerance = typicalTextHeight * 0.6;

  for (const pair of pairs) {
    if (pair.members.length !== 1 || pair.segments < 3) continue;
    const anchor = pair.members[0];
    const anchorW = width(anchor.rect), anchorH = height(anchor.rect);
    if (anchorW > postWidth
      || anchorH < typicalTextHeight * 0.8
      || anchorH > typicalTextHeight * 3.5) continue;

    const opposite = candidates.filter((candidate) => {
      if (rectKey(candidate.rect) === rectKey(anchor.rect)
        || owner.has(rectKey(candidate.rect))
        || candidate.kind !== "symbol"
        || candidate.segments < 3
        || width(candidate.rect) > postWidth) return false;
      const xGap = Math.abs(centerX(candidate.rect) - centerX(anchor.rect));
      return xGap >= typicalTextHeight * 3
        && xGap <= maxGlyphDimPx * 0.85
        && Math.abs(centerY(candidate.rect) - centerY(anchor.rect)) <= typicalTextHeight * 0.45
        && Math.abs(height(candidate.rect) - anchorH) <= typicalTextHeight * 0.5;
    }).sort((a, b) => Math.abs(centerX(a.rect) - centerX(anchor.rect))
      - Math.abs(centerX(b.rect) - centerX(anchor.rect)))[0];
    if (!opposite) continue;

    const leftPost = centerX(anchor.rect) < centerX(opposite.rect) ? anchor : opposite;
    const rightPost = leftPost === anchor ? opposite : anchor;
    const leftX = centerX(leftPost.rect), rightX = centerX(rightPost.rect);
    const postSpan = rightX - leftX;
    const topY = Math.min(leftPost.rect[0][1], rightPost.rect[0][1]);
    const bottomY = Math.max(leftPost.rect[1][1], rightPost.rect[1][1]);
    const rails = candidates.filter((candidate) => {
      if (candidate === opposite || rectKey(candidate.rect) === rectKey(anchor.rect)
        || owner.has(rectKey(candidate.rect))) return false;
      const w = width(candidate.rect), h = height(candidate.rect);
      if (w < postSpan * 0.75 || w < typicalTextHeight * 3 || w < h * 3) return false;
      if (candidate.rect[0][0] > leftX + edgeTolerance
        || candidate.rect[1][0] < rightX - edgeTolerance) return false;
      const meetsTop = candidate.rect[0][1] <= topY + edgeTolerance
        && candidate.rect[1][1] >= topY - edgeTolerance;
      const meetsBottom = candidate.rect[0][1] <= bottomY + edgeTolerance
        && candidate.rect[1][1] >= bottomY - edgeTolerance;
      return meetsTop || meetsBottom;
    });
    const topRail = rails.filter((candidate) => candidate.rect[0][1] <= topY + edgeTolerance
      && candidate.rect[1][1] >= topY - edgeTolerance)
      .sort((a, b) => Math.abs(centerY(a.rect) - topY) - Math.abs(centerY(b.rect) - topY)
        || b.segments - a.segments)[0];
    const bottomRail = rails.filter((candidate) => candidate !== topRail
      && candidate.rect[0][1] <= bottomY + edgeTolerance
      && candidate.rect[1][1] >= bottomY - edgeTolerance)
      .sort((a, b) => Math.abs(centerY(a.rect) - bottomY) - Math.abs(centerY(b.rect) - bottomY)
        || b.segments - a.segments)[0];
    if (!topRail || !bottomRail) continue;

    const recovered = [anchor, opposite, topRail, bottomRail];
    const union: [Point, Point] = [[
      Math.min(...recovered.map((member) => member.rect[0][0])),
      Math.min(...recovered.map((member) => member.rect[0][1])),
    ], [
      Math.max(...recovered.map((member) => member.rect[1][0])),
      Math.max(...recovered.map((member) => member.rect[1][1])),
    ]];
    if (width(union) > maxGlyphDimPx || height(union) > maxGlyphDimPx) continue;
    pair.members = recovered.map((member) => ({ rect: member.rect, segments: member.segments }));
    pair.rect = union;
    pair.segments = recovered.reduce((sum, member) => sum + member.segments, 0);
    for (const member of recovered) owner.set(rectKey(member.rect), pair);
  }
}

/** Grow a paired discrete-symbol row over nearby unclaimed connected
 * components on that SAME caption row. CAD legends routinely draw a dashed
 * flex-duct mark, a detached valve handle, or two side-by-side variants as
 * independent components. The row-relative vertical gate prevents a nearby
 * symbol from the next row being swallowed; the compact-union bound prevents
 * table rules or remote diagram ink from joining. Member boxes remain
 * separate so a later pass can distinguish one fragmented glyph from two
 * independently meaningful variants. */
function expandSymbolPairs(
  pairs: PairCandidate[], candidates: GlyphCandidate[], rawSpans: LegendSpan[],
  typicalTextHeight: number, maxGlyphDimPx: number,
): void {
  const rectKey = (rect: [Point, Point]) => rect.flat().join(",");
  const claimed = new Set(pairs.flatMap((pair) => pair.members.map((member) => rectKey(member.rect))));
  for (const pair of pairs) {
    if (pair.kind !== "symbol" && !isDiscreteInstalledDeviceCaption(pair.caption)) continue;
    const captionY = (pair.span.y0 + pair.span.y1) / 2;
    for (;;) {
      let best: GlyphCandidate | null = null;
      let bestDistance = Infinity;
      for (const candidate of candidates) {
        if (claimed.has(rectKey(candidate.rect))) continue;
        if (candidate.rect[1][0] > pair.span.x0 || resemblesExtractedText(candidate.rect, rawSpans, candidate.segments)) continue;
        const candidateY = (candidate.rect[0][1] + candidate.rect[1][1]) / 2;
        if (Math.abs(candidateY - captionY) > typicalTextHeight * 1.25) continue;
        const pairW = pair.rect[1][0] - pair.rect[0][0];
        const candidateW = candidate.rect[1][0] - candidate.rect[0][0];
        const overlapW = Math.max(0,
          Math.min(pair.rect[1][0], candidate.rect[1][0]) - Math.max(pair.rect[0][0], candidate.rect[0][0]),
        );
        const embeddedLineMember = candidate.kind === "line_style"
          && pairW >= typicalTextHeight * 2
          && overlapW >= Math.min(pairW, candidateW) * 0.8;
        if (candidate.kind !== "symbol" && !embeddedLineMember) continue;
        const horizontalGap = candidate.rect[1][0] < pair.rect[0][0]
          ? pair.rect[0][0] - candidate.rect[1][0]
          : pair.rect[1][0] < candidate.rect[0][0] ? candidate.rect[0][0] - pair.rect[1][0] : 0;
        const verticalGap = candidate.rect[1][1] < pair.rect[0][1]
          ? pair.rect[0][1] - candidate.rect[1][1]
          : pair.rect[1][1] < candidate.rect[0][1] ? candidate.rect[0][1] - pair.rect[1][1] : 0;
        if (horizontalGap > Math.max(typicalTextHeight * 3, maxGlyphDimPx * 0.5)
          || verticalGap > typicalTextHeight * 1.25) continue;
        const unionW = Math.max(pair.rect[1][0], candidate.rect[1][0]) - Math.min(pair.rect[0][0], candidate.rect[0][0]);
        const unionH = Math.max(pair.rect[1][1], candidate.rect[1][1]) - Math.min(pair.rect[0][1], candidate.rect[0][1]);
        if (unionW > maxGlyphDimPx || unionH > maxGlyphDimPx) continue;
        const distance = Math.hypot(horizontalGap, verticalGap) + Math.abs(candidateY - captionY) * 0.1;
        if (distance < bestDistance) { best = candidate; bestDistance = distance; }
      }
      if (!best) break;
      claimed.add(rectKey(best.rect));
      pair.members.push({ rect: best.rect, segments: best.segments });
      pair.segments += best.segments;
      if (best.kind === "symbol") pair.kind = "symbol";
      pair.rect = [
        [Math.min(pair.rect[0][0], best.rect[0][0]), Math.min(pair.rect[0][1], best.rect[0][1])],
        [Math.max(pair.rect[1][0], best.rect[1][0]), Math.max(pair.rect[1][1], best.rect[1][1])],
      ];
    }
  }
}

/** Close a compact installed-device enclosure whose side wall misses both
 * rails by a sub-grid PDF coordinate seam. The ordinary junction graph must
 * keep that wall disconnected; snapping it globally would fuse unrelated
 * plan linework. Here, two already-owned parallel rails plus one raw
 * bridging side prove the local enclosure topology, so the evidence box can
 * safely own that final stroke without weakening clustering elsewhere. */
function closeSeamedDeviceEnclosures(
  pairs: PairCandidate[], segs: number[], typicalTextHeight: number, gridPx: number,
): void {
  const pad = gridPx / 2;
  const seam = Math.max(gridPx * 1.25, typicalTextHeight * 0.08);
  const vertical: Array<[number, number, number, number]> = [];
  for (let i = 0; i < segs.length; i += 4) {
    const edge: [number, number, number, number] = [segs[i], segs[i + 1], segs[i + 2], segs[i + 3]];
    const dx = Math.abs(edge[2] - edge[0]);
    const dy = Math.abs(edge[3] - edge[1]);
    if (dx <= seam * 0.4
      && dy >= typicalTextHeight * 0.45
      && dy <= typicalTextHeight * 2.5) vertical.push(edge);
  }
  const w = (member: GlyphMember) => member.rect[1][0] - member.rect[0][0];
  const h = (member: GlyphMember) => member.rect[1][1] - member.rect[0][1];
  const cy = (member: GlyphMember) => (member.rect[0][1] + member.rect[1][1]) / 2;
  for (const pair of pairs) {
    if (!isDiscreteInstalledDeviceCaption(pair.caption) || pair.members.length < 2) continue;
    const rails = pair.members.filter((member) => member.segments <= 3
      && w(member) >= typicalTextHeight * 0.55
      && h(member) <= Math.max(gridPx * 2.5, typicalTextHeight * 0.2));
    let closure: [number, number, number, number] | null = null;
    for (let i = 0; i < rails.length && !closure; i++) {
      for (let j = i + 1; j < rails.length && !closure; j++) {
        const top = cy(rails[i]) <= cy(rails[j]) ? rails[i] : rails[j];
        const bottom = top === rails[i] ? rails[j] : rails[i];
        const separation = cy(bottom) - cy(top);
        const overlap = Math.min(top.rect[1][0], bottom.rect[1][0])
          - Math.max(top.rect[0][0], bottom.rect[0][0]);
        if (separation < typicalTextHeight * 0.45
          || separation > typicalTextHeight * 2.25
          || overlap < Math.min(w(top), w(bottom)) * 0.75) continue;
        const sides = [
          (top.rect[0][0] + bottom.rect[0][0]) / 2,
          (top.rect[1][0] + bottom.rect[1][0]) / 2,
        ];
        closure = vertical.filter((edge) => {
          const x = (edge[0] + edge[2]) / 2;
          const y0 = Math.min(edge[1], edge[3]);
          const y1 = Math.max(edge[1], edge[3]);
          const outsideCurrentEvidence = x < pair.rect[0][0] - gridPx * 0.25
            || x > pair.rect[1][0] + gridPx * 0.25;
          if (!outsideCurrentEvidence
            || x >= pair.span.x0
            || Math.min(...sides.map((side) => Math.abs(x - side))) > seam
            || y0 > cy(top) + seam
            || y1 < cy(bottom) - seam) return false;
          const edgeCx = x;
          const edgeCy = (y0 + y1) / 2;
          return !pairs.some((other) => other !== pair
            && edgeCx >= other.rect[0][0] && edgeCx <= other.rect[1][0]
            && edgeCy >= other.rect[0][1] && edgeCy <= other.rect[1][1]);
        }).sort((a, b) => {
          const ax = (a[0] + a[2]) / 2, bx = (b[0] + b[2]) / 2;
          return Math.min(...sides.map((side) => Math.abs(ax - side)))
            - Math.min(...sides.map((side) => Math.abs(bx - side)));
        })[0] ?? null;
      }
    }
    if (!closure) continue;
    const memberRect: [Point, Point] = [[
      Math.min(closure[0], closure[2]) - pad,
      Math.min(closure[1], closure[3]) - pad,
    ], [
      Math.max(closure[0], closure[2]) + pad,
      Math.max(closure[1], closure[3]) + pad,
    ]];
    pair.members.push({ rect: memberRect, segments: 1 });
    pair.segments++;
    pair.kind = "symbol";
    pair.rect = [[
      Math.min(pair.rect[0][0], memberRect[0][0]),
      Math.min(pair.rect[0][1], memberRect[0][1]),
    ], [
      Math.max(pair.rect[1][0], memberRect[1][0]),
      Math.max(pair.rect[1][1], memberRect[1][1]),
    ]];
  }
}

/** A routed baseline can be one connected component with a nearby drafting
 * leader (slope/invert/tag examples commonly touch the line at an arrow
 * point). The routed row owns the baseline; the callout row must own its
 * leader. When one dominant horizontal baseline, attached branches, and
 * separate explanatory PDF text all coexist in the same tall component,
 * trim the routed pair to that baseline before the later callout pass. This
 * is deliberately topology-based: ordinary boxed duct tags have two long
 * horizontal sides, while plain routed swatches have no attached branch. */
function trimRoutedBaselinesWithCallouts(
  pairs: PairCandidate[], segs: number[], rawSpans: LegendSpan[],
  typicalTextHeight: number, gridPx: number,
): void {
  const tolerance = Math.max(1.5, typicalTextHeight * 0.08);
  const pad = gridPx / 2;
  for (const pair of pairs) {
    if (!isRoutedSystemCaption(pair.caption)) continue;
    const original = pair.rect;
    const width = original[1][0] - original[0][0];
    const height = original[1][1] - original[0][1];
    if (width < typicalTextHeight * 4 || height < typicalTextHeight * 1.25) continue;
    const inside: Array<[number, number, number, number]> = [];
    for (let i = 0; i < segs.length; i += 4) {
      const edge: [number, number, number, number] = [
        segs[i], segs[i + 1], segs[i + 2], segs[i + 3],
      ];
      if (edge[0] < original[0][0] - tolerance || edge[0] > original[1][0] + tolerance
        || edge[2] < original[0][0] - tolerance || edge[2] > original[1][0] + tolerance
        || edge[1] < original[0][1] - tolerance || edge[1] > original[1][1] + tolerance
        || edge[3] < original[0][1] - tolerance || edge[3] > original[1][1] + tolerance) continue;
      inside.push(edge);
    }
    const longHorizontal = inside.filter(([ax, ay, bx, by]) =>
      Math.abs(ay - by) <= tolerance && Math.abs(bx - ax) >= width * 0.55);
    if (!longHorizontal.length) continue;
    const baselineYs: number[] = [];
    for (const edge of longHorizontal) {
      const y = (edge[1] + edge[3]) / 2;
      if (!baselineYs.some((candidate) => Math.abs(candidate - y) <= tolerance)) baselineYs.push(y);
    }
    if (baselineYs.length !== 1) continue;
    const baselineY = baselineYs[0];
    const branches = inside.filter(([ax, ay, bx, by]) => {
      if (Math.abs(ay - by) <= tolerance) return false;
      const y0 = Math.min(ay, by), y1 = Math.max(ay, by);
      return y1 - y0 >= typicalTextHeight * 0.45
        && y0 <= baselineY + tolerance && y1 >= baselineY - tolerance;
    });
    if (!branches.length) continue;
    const hasSeparateExplanatoryText = rawSpans.some((span) => {
      const centerX = (span.x0 + span.x1) / 2;
      const centerY = (span.y0 + span.y1) / 2;
      const isPairCaption = span.x0 >= pair.span.x0 - tolerance
        && span.x1 <= pair.span.x1 + tolerance
        && span.y0 >= pair.span.y0 - tolerance
        && span.y1 <= pair.span.y1 + tolerance;
      return !isPairCaption && meaningfulCaption(span.text)
        && centerX >= original[0][0] && centerX <= original[1][0]
        && centerY >= original[0][1] && centerY <= original[1][1] + typicalTextHeight * 0.5;
    });
    if (!hasSeparateExplanatoryText) continue;
    const baseline = longHorizontal.filter((edge) =>
      Math.abs((edge[1] + edge[3]) / 2 - baselineY) <= tolerance);
    pair.rect = [[
      Math.min(...baseline.flatMap((edge) => [edge[0], edge[2]])) - pad,
      Math.min(...baseline.flatMap((edge) => [edge[1], edge[3]])) - pad,
    ], [
      Math.max(...baseline.flatMap((edge) => [edge[0], edge[2]])) + pad,
      Math.max(...baseline.flatMap((edge) => [edge[1], edge[3]])) + pad,
    ]];
    pair.segments = baseline.length;
    pair.members = [{ rect: pair.rect, segments: pair.segments }];
    pair.kind = "line_style";
  }
}

function hasMultipleSubstantialSymbols(
  pair: PairCandidate, typicalTextHeight: number, heading: string | null,
  lines: LegendSpan[] = [],
): boolean {
  if (pair.kind !== "symbol") return false;
  // Some diagrammatic piping keys draw two fittings on one continuous pipe
  // stub, so connectivity cannot separate the two identities. The caption's
  // repeated, explicit fitting nouns still prove this is a vocabulary group
  // rather than one seedable symbol.
  if (/\bFLANGED\s+CONN(?:ECTION)?\.?\s*[\\/]\s*BLIND\s+FLANGE\b/i.test(pair.caption)) return true;
  // A mechanically interlocked N.O./N.C. pair can be one connected vector
  // component because the interlock link physically joins both switches.
  // The caption itself explicitly declares two installed identities, so it
  // remains a reviewable group even when connectivity cannot split them.
  if (/\bINTERLOCKED\b.*\bNORMALLY\s+OPEN\b.*\bNORMALLY\s+CLOSED\b.*\bSWITCHES\b/i.test(pair.caption)) return true;
  if (pair.members.length < 2) return false;
  // A below-caption cell conventionally presents side-by-side renditions
  // (fixture sizes, grille necks, strobe/horn variants) under one identity.
  // Preserve those as a non-seedable group whenever two information-rich
  // components are materially separated on the same display row. Closely
  // nested or stacked fragments remain one physical symbol.
  if (pair.layout === "below") {
    const independent = pair.members.filter((member) => member.segments >= 2);
    for (let i = 0; i < independent.length; i++) {
      for (let j = i + 1; j < independent.length; j++) {
        const a = independent[i].rect, b = independent[j].rect;
        const centerDx = Math.abs((a[0][0] + a[1][0] - b[0][0] - b[1][0]) / 2);
        const centerDy = Math.abs((a[0][1] + a[1][1] - b[0][1] - b[1][1]) / 2);
        if (centerDx >= typicalTextHeight * 1.2 && centerDy <= typicalTextHeight * 2.5) return true;
      }
    }
    return false;
  }
  // Disconnected components alone do not imply variants: a damper body,
  // blade, actuator, and duct stubs may all be separate strokes but still
  // form one installed symbol. Treat the row as a group only when its own
  // caption explicitly declares alternatives and at least two independent
  // (non-overlapping) members support that reading.
  const declaresAlternatives = /\b\d+\s*-\s*WAY\b.*\b\d+\s*-\s*WAY\b/i.test(pair.caption)
    || /^PRESSURE\s+(?:GAUGE|SENSOR),\s*TEMPERATURE\s+(?:GAUGE|SENSOR)\b/i.test(pair.caption)
    || /\b(?:DOWN\s*\/\s*UP|UP\s*\/\s*DOWN)\b/i.test(pair.caption)
    || /\bRISE\b.*\bDROP\b/i.test(pair.caption)
    || /\bACCESS\s+DOOR\b.*\bACCESS\s+PANEL\b/i.test(pair.caption)
    // Some legends put two complete physical renditions beside one shared
    // caption without literally calling them "symbols." The nouns/grammar
    // still declare the alternatives; geometry below must independently
    // prove two substantial, separated members before this can become a
    // nonseedable group.
    || /\bALONE\s+OR\b.*\bWITH\b/i.test(pair.caption)
    || /^(?:PIPING|PIPE)\s*\/\s*DUCTWORK\s+SUPPORT$/i.test(pair.caption)
    || /^TEMPERATURE\s+SENSOR\s+IN\s+WELL$/i.test(pair.caption)
    // Fixture keys commonly draw the ceiling rendition, the wall/bracket
    // rendition, and optional face/direction variants side by side under
    // one caption. Those are a vocabulary group, never one sweep template.
    || /\bINDICATES\s+BRACKET,?\s+WALL\s+MOUNTED\s+FIXTURES?\b/i.test(pair.caption)
    || /^(?:ELAPSED\s+TIME\s+METER|FLUORESCENT\s+LIGHT\s+FIXTURE|EMERGENCY\s+LIGHTING)\b/i.test(pair.caption)
    || /^CEILING-MOUNTED\s+EXIT\s+LIGHT\b/i.test(pair.caption)
    || /\b(?:ARROW,?\s+WHEN\s+USED|QUADRANT\(S\)\s+OF\s+SYMBOL)\b/i.test(pair.caption)
    || /^TYPICAL\s+FOR\s+ALL\b.*\b(?:SYMBOLS?|SIGNS?|FIXTURES?)\b/i.test(pair.caption)
    || /\bARROW\s+INDICATES\s+AIRFLOW\s+DIREC(?:TION|ITON)\b/i.test(pair.caption)
    || /\(\s*SINGLE\s*,\s*DOUBLE(?:\s*,\s*QUAD)?\s*\)/i.test(pair.caption);

  // A ruled SYMBOL / DESCRIPTION row gives stronger physical ownership
  // than a loose proximity pair. In those rows, two complete renditions
  // may share one description without the prose explicitly saying "or"
  // (elapsed-time meters and fixture plan/elevation variants are common).
  // Require two box-scale members on the same display baseline with an
  // actual horizontal gap. Nested or overlapping actuator/blade/carrier
  // pieces are still one compound symbol, and tiny terminals/ticks cannot
  // manufacture a variant group.
  if (pair.structuredRow) {
    const substantial = pair.members.filter((member) => {
      const width = member.rect[1][0] - member.rect[0][0];
      const height = member.rect[1][1] - member.rect[0][1];
      return member.segments >= 2
        && width >= typicalTextHeight * 0.65
        && height >= typicalTextHeight * 0.65;
    });
    const enclosureSlack = typicalTextHeight * 0.1;
    const oneCarrierEnclosesTheRest = substantial.some((container) =>
      substantial.every((member) => member === container
        || (member.rect[0][0] >= container.rect[0][0] - enclosureSlack
          && member.rect[1][0] <= container.rect[1][0] + enclosureSlack
          && member.rect[0][1] >= container.rect[0][1] - enclosureSlack
          && member.rect[1][1] <= container.rect[1][1] + enclosureSlack)));
    if (oneCarrierEnclosesTheRest) return false;
    for (let i = 0; i < substantial.length; i++) {
      for (let j = i + 1; j < substantial.length; j++) {
        const a = substantial[i].rect, b = substantial[j].rect;
        const horizontalGap = a[1][0] < b[0][0] ? b[0][0] - a[1][0]
          : b[1][0] < a[0][0] ? a[0][0] - b[1][0] : 0;
        const centerDy = Math.abs((a[0][1] + a[1][1] - b[0][1] - b[1][1]) / 2);
        if (horizontalGap >= typicalTextHeight * 0.15
          && centerDy <= typicalTextHeight * 1.5) return true;
      }
    }
  }
  const hasPlanDetailColumns = lines.some((plan) => {
    if (!/^PLAN\s+VIEW$/i.test(normalizedCaption(plan.text))
      || plan.y1 >= pair.span.y0) return false;
    const planCenterY = (plan.y0 + plan.y1) / 2;
    return lines.some((detail) => /^DETAIL\s+VIEW$/i.test(normalizedCaption(detail.text))
      && detail.x0 > plan.x1
      && detail.x1 <= pair.span.x0 + typicalTextHeight
      && Math.abs((detail.y0 + detail.y1) / 2 - planCenterY) <= typicalTextHeight * 0.6
      && pair.rect[0][0] >= plan.x0 - typicalTextHeight * 4
      && pair.rect[1][0] <= detail.x1 + typicalTextHeight * 4);
  });
  const hasExplicitVariantColumns = /^(?:DUCTWORK|PIPING)$/i.test(heading || "")
    || (!!heading && isSpecificDisciplineLegendHeading(heading))
    || hasPlanDetailColumns;
  if (!declaresAlternatives && !hasExplicitVariantColumns) return false;
  const independent = pair.members.filter((member) => member.segments >= 2);
  for (let i = 0; i < independent.length; i++) {
    for (let j = i + 1; j < independent.length; j++) {
      const a = independent[i].rect, b = independent[j].rect;
      const overlapW = Math.min(a[1][0], b[1][0]) - Math.max(a[0][0], b[0][0]);
      const overlapH = Math.min(a[1][1], b[1][1]) - Math.max(a[0][1], b[0][1]);
      if (overlapW > 0 && overlapH > 0) continue;
      const distance = Math.hypot(
        (a[0][0] + a[1][0] - b[0][0] - b[1][0]) / 2,
        (a[0][1] + a[1][1] - b[0][1] - b[1][1]) / 2,
      );
      if (declaresAlternatives && distance >= typicalTextHeight * 1.2) return true;
      const variantColumns = hasExplicitVariantColumns
        && Math.abs((a[0][0] + a[1][0] - b[0][0] - b[1][0]) / 2) >= typicalTextHeight * 3
        && Math.abs((a[0][1] + a[1][1] - b[0][1] - b[1][1]) / 2) <= typicalTextHeight * 1.5;
      if (variantColumns) return true;
    }
  }
  return false;
}

/** Attach a bounded number of unclaimed continuation lines. This deliberately
 * runs after glyph ownership is solved: a physical line that owns another
 * glyph is a new legend row, not a wrap merely because the two captions have
 * the same left margin. */
function attachWrappedCaptions(
  pairs: PairCandidate[], spans: LegendSpan[], usedSpans: Set<number>,
  maxLineGapPx: number, maxIndentDriftPx: number, maxWrapLines: number,
  typicalTextHeight: number,
): void {
  // Resolve every currently-adjacent unclaimed line against ALL eligible
  // rows before mutating one. Greedy pair-by-pair iteration made ownership
  // depend on reading order: a glyphless qualifier between two rows could
  // be swallowed by the first pair visited even when its center sat much
  // closer to the second row's actual glyph. Recomputing after each attach
  // still permits two/three-line chains, but each physical line goes to the
  // geometrically best row under the same finite wrap/indent gates.
  for (;;) {
    let best: { pairIndex: number; spanIndex: number; prepend: boolean; sameLine: boolean; score: number } | null = null;
    for (let si = 0; si < spans.length; si++) {
      if (usedSpans.has(si)) continue;
      const continuation = spans[si];
      if (!meaningfulCaption(continuation.text)) continue;
      const lineCenterY = (continuation.y0 + continuation.y1) / 2;
      const lineCenterX = (continuation.x0 + continuation.x1) / 2;
      for (let pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
        const pair = pairs[pairIndex];
        // Extracted text centered inside this row's own vector envelope is
        // an internal tag/value (AI, AO, FM-, 24x12, UP), not a wrapped
        // description. It may sit one physical text line below the real
        // caption and satisfy the ordinary indent/gap gates, so exclude it
        // before continuation scoring. Legitimate descriptions remain to
        // the right of the glyph envelope even when they wrap or indent.
        if (lineCenterX >= pair.rect[0][0] && lineCenterX <= pair.rect[1][0]
          && lineCenterY >= pair.rect[0][1] && lineCenterY <= pair.rect[1][1]) continue;
        const verticalOverlap = Math.min(continuation.y1, pair.span.y1)
          - Math.max(continuation.y0, pair.span.y0);
        const sameLine = verticalOverlap >= Math.min(
          continuation.y1 - continuation.y0, pair.span.y1 - pair.span.y0,
        ) * 0.6;
        const horizontalGap = continuation.x0 > pair.span.x1
          ? continuation.x0 - pair.span.x1
          : pair.span.x0 > continuation.x1 ? pair.span.x0 - continuation.x1 : 0;
        // Only append to the right. A terse PDF-text tag inside the glyph
        // (CO, DP, AI) can sit on the same baseline to the left of the true
        // description and must not be prepended as caption prose.
        const sameLineContinuation = sameLine && continuation.x0 >= pair.span.x1
          && horizontalGap <= Math.max(
            8,
            typicalTextHeight * 1.5,
            Math.min(continuation.y1 - continuation.y0, pair.span.y1 - pair.span.y0) * 1.5,
          );
        const belowGap = continuation.y0 - pair.span.y1;
        const aboveGap = pair.span.y0 - continuation.y1;
        // CAD/PDF font boxes can be taller than their baseline leading: two
        // visibly consecutive description lines may overlap by several
        // image pixels even though their centers advance by almost one full
        // text height. Treat that bounded metric overlap as vertical order,
        // not as an impossible wrap. Same-baseline fragments have little
        // center advance and remain governed by sameLineContinuation.
        const pairTextCenterY = (pair.span.y0 + pair.span.y1) / 2;
        const metricOverlapSlack = typicalTextHeight * 0.25;
        const isBelow = belowGap >= -1 || (belowGap >= -metricOverlapSlack
          && lineCenterY - pairTextCenterY >= typicalTextHeight * 0.4);
        const isAbove = aboveGap >= -1 || (aboveGap >= -metricOverlapSlack
          && pairTextCenterY - lineCenterY >= typicalTextHeight * 0.4);
        const gap = sameLineContinuation ? horizontalGap
          : Math.max(0, isBelow ? belowGap : aboveGap);
        if (!sameLineContinuation && !isBelow && !isAbove) continue;
        const glyphMiss = Math.max(0, pair.rect[0][1] - lineCenterY, lineCenterY - pair.rect[1][1]);
        // Text boxes from the same CAD line family can differ by a fraction
        // of a pixel after font metrics and image-space conversion. Keep a
        // one-pixel numerical slack around the page-scaled wrap gate; the
        // global glyph-distance score still decides between adjacent rows.
        // A third descriptive line can be intentionally spaced farther from
        // line two when it labels the same tall tag/callout; admit that only
        // after two lines are already owned and the glyph itself reaches the
        // candidate line. The geometry requirement keeps ordinary next rows
        // outside this wider, compound-caption allowance.
        const compactThirdLine = pair.captionLines > 1
          && gap <= typicalTextHeight * 1.1
          && glyphMiss <= typicalTextHeight * 0.9;
        if ((!sameLineContinuation && gap > maxLineGapPx + 1 && !compactThirdLine)
          || (!sameLineContinuation
            && Math.abs(continuation.x0 - pair.span.x0) > maxIndentDriftPx)) continue;
        // Most captions remain capped at maxWrapLines. A compound symbol
        // with leader labels can legitimately use two additional lines, but
        // only while those extra line centers remain physically crossed by
        // (or immediately beside) that same glyph's evidence box.
        const compoundLineCap = glyphMiss <= typicalTextHeight * 0.5
          && gap <= typicalTextHeight ? maxWrapLines + 2 : maxWrapLines;
        if (!sameLineContinuation && pair.captionLines >= compoundLineCap) continue;
        const glyphCenterY = (pair.rect[0][1] + pair.rect[1][1]) / 2;
        const score = (sameLineContinuation ? 0 : glyphMiss * 2)
          + gap + Math.abs(lineCenterY - glyphCenterY) * 0.05;
        if (!best || score < best.score
          || (score === best.score && (si < best.spanIndex
            || (si === best.spanIndex && pairIndex < best.pairIndex)))) {
          best = {
            pairIndex,
            spanIndex: si,
            prepend: sameLineContinuation ? false : isAbove,
            sameLine: sameLineContinuation,
            score,
          };
        }
      }
    }
    if (!best) break;
    const pair = pairs[best.pairIndex];
    const continuation = spans[best.spanIndex];
    usedSpans.add(best.spanIndex);
    pair.caption = normalizedCaption(best.prepend
      ? `${continuation.text} ${pair.caption}` : `${pair.caption} ${continuation.text}`);
    if (!best.sameLine) pair.captionLines++;
    pair.span = {
      text: pair.caption,
      x0: Math.min(pair.span.x0, continuation.x0),
      y0: Math.min(pair.span.y0, continuation.y0),
      x1: Math.max(pair.span.x1, continuation.x1),
      y1: Math.max(pair.span.y1, continuation.y1),
    };
  }
}

/** Repair a compact legend column when a text-only continuation line is
 * vertically closer to the next row's glyph than to the row it completes.
 * The next glyph then owns that continuation and its real caption is left
 * unclaimed. Rebalance only when grammar, repeated geometry, and an unused
 * replacement line inside the next glyph's row all agree. */
function rebalanceDownshiftedCaptionOwnership(
  pairs: PairCandidate[], spans: LegendSpan[], usedSpans: Set<number>,
  typicalTextHeight: number, maxWrapIndentPx: number,
): void {
  const ordered = [...pairs].sort((a, b) =>
    (a.rect[0][1] + a.rect[1][1]) - (b.rect[0][1] + b.rect[1][1])
    || a.rect[0][0] - b.rect[0][0]);
  const rebalanced = new Set<PairCandidate>();
  const completesUpper = (upper: string, continuation: string): boolean => {
    const first = normalizedCaption(upper);
    const second = normalizedCaption(continuation);
    if (second.split(/\s+/).length > 6) return false;
    return /\b(?:WITH|AND|OR|OF|FOR|THE|A|AN)\s*$/i.test(first)
      || (/\b(?:ASSEMBLY|RACEWAY|SYSTEM)\s+WITH\s+(?:POWER|DATA|VOICE|CONTROL|COMMUNICATIONS?)\s*$/i.test(first)
        && /^(?:RECEPTACLES?|OUTLETS?|CONDUCTORS?|CABLES?)$/i.test(second))
      || (/[,;:]\s*$/.test(first)
        && /^(?:ABOVE|BELOW|CEILING|FLOOR|UNDERFLOOR|WALL)\b/i.test(second))
      || (/\b(?:WALL|FLOOR|CEILING|SURFACE|EQUIPMENT)\s*$/i.test(first)
        && /^MOUNTED$/i.test(second))
      || (/\(N\s*=\s*[^)]+\)\s*$/i.test(first)
        && /^\(E\s*=\s*[^)]+\)$/i.test(second));
  };
  const ownedCaptionLines = (pair: PairCandidate): LegendSpan[] => spans.filter((span) => {
    const text = normalizedCaption(span.text);
    return !!text && pair.caption.includes(text)
      && Math.abs(span.x0 - pair.span.x0) <= maxWrapIndentPx
      && span.y0 >= pair.span.y0 - 1 && span.y1 <= pair.span.y1 + 1;
  }).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  for (const upper of ordered) {
    const upperCx = (upper.rect[0][0] + upper.rect[1][0]) / 2;
    const upperCy = (upper.rect[0][1] + upper.rect[1][1]) / 2;
    const lower = ordered.filter((candidate) => {
      const leading = ownedCaptionLines(candidate)[0];
      if (candidate === upper || rebalanced.has(candidate) || !leading
        || !completesUpper(upper.caption, leading.text)) return false;
      const candidateCx = (candidate.rect[0][0] + candidate.rect[1][0]) / 2;
      const candidateCy = (candidate.rect[0][1] + candidate.rect[1][1]) / 2;
      return candidateCy > upperCy
        && candidateCy - upperCy <= typicalTextHeight * 5
        && Math.abs(upperCx - candidateCx) <= typicalTextHeight * 1.75
        && Math.abs(upper.span.x0 - candidate.span.x0) <= maxWrapIndentPx;
    }).sort((a, b) => (a.rect[0][1] + a.rect[1][1])
      - (b.rect[0][1] + b.rect[1][1]))[0];
    if (!lower) continue;
    const lowerCy = (lower.rect[0][1] + lower.rect[1][1]) / 2;
    const owned = ownedCaptionLines(lower);
    if (owned.length > 1) {
      const [continuation, ...remaining] = owned;
      upper.caption = normalizedCaption(`${upper.caption} ${continuation.text}`);
      upper.captionLines++;
      upper.span = {
        text: upper.caption,
        x0: Math.min(upper.span.x0, continuation.x0),
        y0: Math.min(upper.span.y0, continuation.y0),
        x1: Math.max(upper.span.x1, continuation.x1),
        y1: Math.max(upper.span.y1, continuation.y1),
      };
      lower.caption = normalizedCaption(remaining.map((line) => line.text).join(" "));
      lower.captionLines = remaining.length;
      lower.span = {
        text: lower.caption,
        x0: Math.min(...remaining.map((line) => line.x0)),
        y0: Math.min(...remaining.map((line) => line.y0)),
        x1: Math.max(...remaining.map((line) => line.x1)),
        y1: Math.max(...remaining.map((line) => line.y1)),
      };
      rebalanced.add(lower);
      continue;
    }
    const replacement = spans.map((span, index) => ({ span, index }))
      .filter(({ span, index }) => !usedSpans.has(index)
        && meaningfulCaption(span.text)
        && !isLegendHeadingText(span.text)
        && span.y0 >= lower.span.y0 - typicalTextHeight * 0.1
        && span.y0 <= lower.rect[1][1] + typicalTextHeight
        && Math.abs(span.x0 - lower.span.x0) <= maxWrapIndentPx
        && Math.abs((span.y0 + span.y1) / 2 - lowerCy) <= typicalTextHeight * 1.5)
      .sort((a, b) => a.span.y0 - b.span.y0 || a.index - b.index)[0];
    if (!replacement) continue;
    upper.caption = normalizedCaption(`${upper.caption} ${lower.caption}`);
    upper.captionLines += lower.captionLines;
    upper.span = {
      text: upper.caption,
      x0: Math.min(upper.span.x0, lower.span.x0),
      y0: Math.min(upper.span.y0, lower.span.y0),
      x1: Math.max(upper.span.x1, lower.span.x1),
      y1: Math.max(upper.span.y1, lower.span.y1),
    };
    lower.caption = normalizedCaption(replacement.span.text);
    lower.captionLines = 1;
    lower.span = { ...replacement.span };
    usedSpans.add(replacement.index);
    rebalanced.add(lower);
  }
}

/** A symbol can itself be drawn as several disconnected components (the
 * display and lower indicator inside a VFD box are a real example). When a
 * wrapped caption line was therefore claimed by a second component, reunite
 * the two owned fragments into one row instead of emitting two fake rows. */
function mergeOwnedWrapPairs(
  pairs: PairCandidate[], maxLineGapPx: number, maxIndentDriftPx: number,
  maxGlyphDimPx: number, typicalTextHeight: number, maxWrapLines: number,
  rawSpans: LegendSpan[],
): PairCandidate[] {
  // Sort by reading order, not exact x. Wrapped lines routinely drift by a
  // fraction of a pixel; x-first ordering can put line 2 before line 1.
  const sorted = [...pairs].sort((a, b) => a.span.y0 - b.span.y0 || a.span.x0 - b.span.x0);
  const consumed = new Set<number>();
  const out: PairCandidate[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (consumed.has(i)) continue;
    let current = {
      ...sorted[i],
      members: [...sorted[i].members],
      span: { ...sorted[i].span },
      rect: [[...sorted[i].rect[0]], [...sorted[i].rect[1]]] as [Point, Point],
    };
    let ownedLines = current.captionLines;
    for (let j = i + 1; j < sorted.length; j++) {
      if (consumed.has(j)) continue;
      const next = sorted[j];
      // A drawn notation inserted inside prose can acquire its own compact
      // candidate and claim the text fragment after it. On the rendered
      // page this is still one caption line: "LIGHTING FIXTURE ( [bracket]
      // INDICATES ... )". Rejoin the right-hand text while leaving the
      // inline explanatory mark out of the physical seed geometry. A real
      // second legend column is separated by a much larger text gap.
      const textLineOverlap = Math.min(current.span.y1, next.span.y1)
        - Math.max(current.span.y0, next.span.y0);
      const sameCaptionLine = textLineOverlap >= Math.min(
        current.span.y1 - current.span.y0, next.span.y1 - next.span.y0,
      ) * 0.6;
      const textGap = next.span.x0 - current.span.x1;
      const inlineMarkBetweenText = sameCaptionLine
        && textGap >= 0
        && textGap <= Math.max(8, typicalTextHeight * 1.5,
          Math.min(current.span.y1 - current.span.y0, next.span.y1 - next.span.y0) * 1.5)
        && next.rect[0][0] >= current.span.x0 - typicalTextHeight * 0.25
        && next.rect[1][0] <= next.span.x0 + typicalTextHeight * 0.25;
      if (inlineMarkBetweenText) {
        consumed.add(j);
        current.caption = normalizedCaption(`${current.caption} ${next.caption}`);
        current.span = {
          text: current.caption,
          x0: Math.min(current.span.x0, next.span.x0),
          y0: Math.min(current.span.y0, next.span.y0),
          x1: Math.max(current.span.x1, next.span.x1),
          y1: Math.max(current.span.y1, next.span.y1),
        };
        continue;
      }
      // A notation/definition block may own several tightly led prose
      // lines, but it cannot absorb a following caption that independently
      // names an installed device and already owns separate glyph evidence.
      if (isDraftingAnnotationCaption(current.caption)
        && isDiscreteInstalledDeviceCaption(next.caption)) continue;
      if (ownedLines >= maxWrapLines) break;
      if (ownedLines + next.captionLines > maxWrapLines) continue;
      if (Math.abs(next.span.x0 - current.span.x0) > maxIndentDriftPx) continue;
      const semanticallyIncompleteCaption = /^ANNOTATIONS?\b/i.test(normalizedCaption(current.caption))
        || /\b(?:ASSIGNED|FOLLOWING|INCLUDING|WITH|AND|OR|TO|FROM|OF|FOR|THE|A|AN|MOUNT|SHADED|ARROWS?)\s*[:;,(-]?\s*$/i.test(current.caption)
        || /^(?:UNDER\s+CABINET)$/i.test(normalizedCaption(current.caption));
      // A location/mounting modifier can be typeset as its own physical
      // line and acquire a disconnected stroke from the same symbol. It is
      // stronger evidence than a generic trailing conjunction, but still
      // require the following line to name an actual legend object before
      // allowing the slightly wider within-glyph vertical gap.
      const nominalModifierContinuation = /^(?:UNDER|ABOVE|BELOW|SURFACE|RECESSED|SUSPENDED|WALL|CEILING|FLOOR)\b(?:\s+[A-Z0-9/-]+){0,3}$/i
        .test(normalizedCaption(current.caption))
        && /\b(?:FIXTURE|DEVICE|SENSOR|SWITCH|RECEPTACLE|OUTLET|DAMPER|VALVE|ACTUATOR|CONTROLLER|PANEL|UNIT|EQUIPMENT)\b/i
          .test(normalizedCaption(next.caption));
      const lineGap = next.span.y0 - current.span.y1;
      const textCenterAdvance = (next.span.y0 + next.span.y1
        - current.span.y0 - current.span.y1) / 2;
      const metricLineOverlap = lineGap < 0
        && lineGap >= -typicalTextHeight * 0.25
        && textCenterAdvance >= typicalTextHeight * 0.4;
      const boundedSemanticLineGap = semanticallyIncompleteCaption
        && lineGap <= typicalTextHeight * 1.25;
      if ((lineGap < 0 && !metricLineOverlap)
        || (lineGap > maxLineGapPx && !boundedSemanticLineGap)) continue;
      const cx = (current.rect[0][0] + current.rect[1][0]) / 2;
      const nx = (next.rect[0][0] + next.rect[1][0]) / 2;
      if (Math.abs(cx - nx) > maxGlyphDimPx) continue;
      // Caption leading alone cannot prove a wrap: dense legends routinely
      // place genuine one-line rows only a few pixels farther apart than
      // wrapped prose. The geometry must also look like fragments of ONE
      // compact glyph. Require a locally continuous vertical union, scaled
      // from this page's own lettering, and keep the ordinary glyph bounds
      // on both axes. Separate row symbols with the same x cadence therefore
      // stay separate even when their captions have tight leading.
      const glyphVerticalGap = next.rect[0][1] > current.rect[1][1]
        ? next.rect[0][1] - current.rect[1][1]
        : current.rect[0][1] > next.rect[1][1] ? current.rect[0][1] - next.rect[1][1] : 0;
      const glyphVerticalOverlap = Math.min(current.rect[1][1], next.rect[1][1])
        - Math.max(current.rect[0][1], next.rect[0][1]);
      const unionW = Math.max(current.rect[1][0], next.rect[1][0])
        - Math.min(current.rect[0][0], next.rect[0][0]);
      const unionH = Math.max(current.rect[1][1], next.rect[1][1])
        - Math.min(current.rect[0][1], next.rect[0][1]);
      const currentH = current.rect[1][1] - current.rect[0][1];
      const nextH = next.rect[1][1] - next.rect[0][1];
      const compactUnion = unionH <= Math.min(maxGlyphDimPx, typicalTextHeight * 2.25);
      const semanticContinuation = semanticallyIncompleteCaption
        && unionH <= Math.min(maxGlyphDimPx, typicalTextHeight * 3.6)
        && glyphVerticalGap <= typicalTextHeight * (nominalModifierContinuation ? 0.75 : 0.5);
      // A tall legitimate symbol may already exceed the ordinary compact
      // wrap height before a tiny lower indicator wins line two (smoke-
      // damper bodies and VFD displays do this). Permit that only when the
      // two geometry boxes actually touch/overlap at the page's own text
      // scale. Merely close, complete rows in a dense legend retain their
      // separate ownership even though their caption leading is wrap-like.
      const smallFragmentGap = Math.max(2, typicalTextHeight * 0.2);
      const materiallyOverlapping = glyphVerticalOverlap > Math.max(1, typicalTextHeight * 0.08);
      const hasTallBody = Math.max(currentH, nextH) >= typicalTextHeight * 2.25;
      const joinedTallFragments = materiallyOverlapping
        || (glyphVerticalGap <= smallFragmentGap
          && (glyphVerticalGap > 0 || hasTallBody));
      // Two disconnected strokes inside one schematic symbol can track the
      // same slightly-overlapping pair of description baselines. Half a
      // local text height still sits far inside the ordinary full-row
      // cadence, while recovering those one-cell fragments deterministically.
      if (glyphVerticalGap > typicalTextHeight * (nominalModifierContinuation ? 0.75 : 0.5)
        || unionW > maxGlyphDimPx
        || unionH > maxGlyphDimPx
        || (!compactUnion && !joinedTallFragments && !semanticContinuation)) continue;
      consumed.add(j);
      ownedLines += next.captionLines;
      current = {
        caption: normalizedCaption(`${current.caption} ${next.caption}`),
        captionLines: ownedLines,
        segments: current.segments + next.segments,
        members: [...current.members, ...next.members],
        rect: [
          [Math.min(current.rect[0][0], next.rect[0][0]), Math.min(current.rect[0][1], next.rect[0][1])],
          [Math.max(current.rect[1][0], next.rect[1][0]), Math.max(current.rect[1][1], next.rect[1][1])],
        ],
        span: {
          text: normalizedCaption(`${current.caption} ${next.caption}`),
          x0: Math.min(current.span.x0, next.span.x0), y0: Math.min(current.span.y0, next.span.y0),
          x1: Math.max(current.span.x1, next.span.x1), y1: Math.max(current.span.y1, next.span.y1),
        },
        kind: glyphKind([
          [Math.min(current.rect[0][0], next.rect[0][0]), Math.min(current.rect[0][1], next.rect[0][1])],
          [Math.max(current.rect[1][0], next.rect[1][0]), Math.max(current.rect[1][1], next.rect[1][1])],
        ], 1.8, current.segments + next.segments, maxGlyphDimPx, rawSpans),
        layout: current.layout,
      };
    }
    out.push(current);
  }
  return out;
}

/** A qualifier line can acquire a second, smaller component from inside the
 * row's actual glyph and masquerade as another legend identity. This happens
 * in parameterized symbols such as a receptacle whose main description is
 * followed by an indented "X = type" explanation. If the later pair's glyph
 * is geometrically contained in the earlier row's glyph, remains on the same
 * physical row, and its caption is an immediately adjacent indent, it is
 * detail owned by the primary row rather than a countable second symbol. */
function withoutContainedDetailPairs(
  pairs: PairCandidate[], typicalTextHeight: number, maxLineGapPx: number,
): PairCandidate[] {
  return pairs.filter((detail, detailIndex) => !pairs.some((primary, primaryIndex) => {
    if (primaryIndex === detailIndex || primary.span.y0 > detail.span.y0) return false;
    const captionGap = detail.span.y0 - primary.span.y1;
    const indent = detail.span.x0 - primary.span.x0;
    if (captionGap < -1 || captionGap > maxLineGapPx || indent < typicalTextHeight * 0.5
      || indent > typicalTextHeight * 4) return false;
    const primaryCenterY = (primary.rect[0][1] + primary.rect[1][1]) / 2;
    const detailCenterY = (detail.rect[0][1] + detail.rect[1][1]) / 2;
    if (Math.abs(primaryCenterY - detailCenterY) > typicalTextHeight * 0.5) return false;
    const slack = typicalTextHeight * 0.15;
    const contained = detail.rect[0][0] >= primary.rect[0][0] - slack
      && detail.rect[0][1] >= primary.rect[0][1] - slack
      && detail.rect[1][0] <= primary.rect[1][0] + slack
      && detail.rect[1][1] <= primary.rect[1][1] + slack;
    const primaryArea = Math.max(1,
      (primary.rect[1][0] - primary.rect[0][0]) * (primary.rect[1][1] - primary.rect[0][1]),
    );
    const detailArea = Math.max(1,
      (detail.rect[1][0] - detail.rect[0][0]) * (detail.rect[1][1] - detail.rect[0][1]),
    );
    return contained && primaryArea >= detailArea * 1.2;
  }));
}

function alignedGroups(pairs: PairCandidate[], glyphXTolerance: number, captionXTolerance: number): number[][] {
  // Do not use transitive union here. A network/controls diagram can contain
  // many locally similar columns whose x positions drift gradually across
  // the sheet: A aligns with B, B with C, and so on, even though A and Z are
  // unrelated. Union-find chained those into a fake 20+ row "legend".
  // Maintain a complete-link bound instead: every member of one structural
  // column must remain inside the same finite caption and glyph-center
  // envelope. Sorting plus a closest-compatible choice makes assignment
  // deterministic while still admitting a genuinely wide row whose caption
  // is indented within the measured tolerance.
  type Group = {
    indices: number[];
    captionMin: number; captionMax: number;
    glyphMin: number; glyphMax: number;
  };
  const glyphCenter = (pair: PairCandidate) => (pair.rect[0][0] + pair.rect[1][0]) / 2;
  // Seed and extend columns in reading order. Sorting by caption x first
  // let a remote, slightly-left coincidence near the bottom of a sheet
  // claim the column before its real rows were visited. Its complete-link
  // envelope could then exclude a legitimate row by a fraction of a pixel
  // even though that row sat directly between two real neighbors. Y-first
  // ordering gives locally continuous legend rows first claim while the
  // finite complete-link x envelopes still prevent gradual diagram drift.
  const ordered = pairs.map((_, index) => index).sort((a, b) => {
    const ay = (pairs[a].span.y0 + pairs[a].span.y1) / 2;
    const by = (pairs[b].span.y0 + pairs[b].span.y1) / 2;
    return ay - by
      || pairs[a].span.x0 - pairs[b].span.x0
      || glyphCenter(pairs[a]) - glyphCenter(pairs[b]);
  });
  const groups: Group[] = [];
  for (const index of ordered) {
    const captionX = pairs[index].span.x0;
    const glyphX = glyphCenter(pairs[index]);
    let best = -1;
    let bestDistance = Infinity;
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      const captionMin = Math.min(group.captionMin, captionX);
      const captionMax = Math.max(group.captionMax, captionX);
      const glyphMin = Math.min(group.glyphMin, glyphX);
      const glyphMax = Math.max(group.glyphMax, glyphX);
      if (captionMax - captionMin > captionXTolerance || glyphMax - glyphMin > glyphXTolerance) continue;
      const distance = Math.abs(captionX - (group.captionMin + group.captionMax) / 2) / Math.max(1, captionXTolerance)
        + Math.abs(glyphX - (group.glyphMin + group.glyphMax) / 2) / Math.max(1, glyphXTolerance);
      if (distance < bestDistance) { best = gi; bestDistance = distance; }
    }
    if (best < 0) {
      groups.push({ indices: [index], captionMin: captionX, captionMax: captionX, glyphMin: glyphX, glyphMax: glyphX });
    } else {
      const group = groups[best];
      group.indices.push(index);
      group.captionMin = Math.min(group.captionMin, captionX);
      group.captionMax = Math.max(group.captionMax, captionX);
      group.glyphMin = Math.min(group.glyphMin, glyphX);
      group.glyphMax = Math.max(group.glyphMax, glyphX);
    }
  }
  return groups.map((group) => group.indices);
}

/** Remove a short device tag that was drawn inside the repeated glyph
 * column and happened to have a small component immediately to its left.
 * CAD legends often label a damper actuator (BD, AD, AFMS, etc.) inside the
 * symbol itself. Such text can satisfy local left-to-right pairing, but it
 * is not in the description column learned from the surrounding rows.
 *
 * This is deliberately a one-sided, layout-derived test: a legitimately
 * wide assembly may push its description farther RIGHT, while an embedded
 * tag is a terse token shifted materially LEFT into the group's glyph
 * envelope. Long captions and small alignment jitter are never rejected. */
function withoutEmbeddedGlyphTags(
  group: PairCandidate[], typicalTextHeight: number, lines: LegendSpan[],
  allPairs: PairCandidate[], maxCaptionGapPx: number,
): PairCandidate[] {
  if (group.length < 3) return group;
  const captionStart = median(group.map((pair) => pair.span.x0));
  const glyphRights = group.map((pair) => pair.rect[1][0]).sort((a, b) => a - b);
  const glyphColumnRight = glyphRights[Math.floor((glyphRights.length - 1) * 0.9)];
  const materialLeftShift = Math.max(6, typicalTextHeight * 0.75);
  const glyphEnvelopeSlack = typicalTextHeight * 5;
  const spanKey = (span: LegendSpan) => [span.x0, span.y0, span.x1, span.y1].join(",");
  const claimedSpanKeys = new Set(allPairs.map((pair) => spanKey(pair.span)));
  return group.flatMap((pair) => {
    const caption = normalizedCaption(pair.caption);
    const terseTag = caption.length <= 8
      && /^[A-Z0-9][A-Z0-9./_-]*(?:\s+[A-Z0-9./_-]+)?$/i.test(caption);
    const internalDimension = /^\d+(?:\.\d+)?\s*(?:[x×Ø]\s*\d+(?:\.\d+)?)?(?:\s*["'])?$/i.test(caption);
    const internalDirection = /^(?:UP|DOWN)(?:\s+W\/?IN\s+FLOOR)?$/i.test(caption);
    if (!terseTag && !internalDimension && !internalDirection) return [pair];
    const shiftedIntoGlyphColumn = pair.span.x0 < captionStart - materialLeftShift
      && pair.span.x0 <= glyphColumnRight + glyphEnvelopeSlack;
    if (!shiftedIntoGlyphColumn) return [pair];

    // The internal tag may have consumed the only candidate for this row.
    // Give that geometry one bounded second chance to own an unclaimed,
    // descriptive span in the learned DESCRIPTION column. If another
    // component already owns that span, simply discard the inner duplicate.
    const [[, y0], [x1, y1]] = pair.rect;
    const margin = Math.max((y1 - y0) * 0.5, typicalTextHeight * 0.75);
    const replacement = lines.filter((line) => {
      const text = canonicalLegendCaption(line.text);
      if (!meaningfulCaption(text) || isLegendHeadingText(text) || isScheduleFieldHeaderText(text)) return false;
      if (line.x0 < captionStart - typicalTextHeight * 2 || line.x0 <= pair.span.x1) return false;
      if (line.x0 - x1 > maxCaptionGapPx) return false;
      if (line.y1 < y0 - margin || line.y0 > y1 + margin) return false;
      return text.length > 8 || text.split(/\s+/).length >= 2;
    }).sort((a, b) => {
      const ay = Math.max(0, y0 - (a.y0 + a.y1) / 2, (a.y0 + a.y1) / 2 - y1);
      const by = Math.max(0, y0 - (b.y0 + b.y1) / 2, (b.y0 + b.y1) / 2 - y1);
      return ay - by || Math.abs(a.x0 - captionStart) - Math.abs(b.x0 - captionStart);
    })[0];
    if (!replacement || claimedSpanKeys.has(spanKey(replacement))) return [];
    // Wrapped captions are represented by one enlarged synthetic span, so
    // their first physical line does not have the same bbox key. Do not let
    // an embedded tag create a duplicate row from that already-owned first
    // line merely because its raw and merged y1 values differ.
    const replacementText = canonicalLegendCaption(replacement.text);
    const ownedByWrappedPair = allPairs.some((other) => other !== pair
      && replacement.x0 >= other.span.x0 - 0.5
      && replacement.x1 <= other.span.x1 + 0.5
      && replacement.y0 >= other.span.y0 - 0.5
      && replacement.y1 <= other.span.y1 + 0.5
      && canonicalLegendCaption(other.caption).startsWith(replacementText));
    if (ownedByWrappedPair) return [];
    claimedSpanKeys.add(spanKey(replacement));
    return [{
      ...pair,
      span: { ...replacement },
      caption: canonicalLegendCaption(replacement.text),
      captionLines: 1,
    }];
  });
}

/** X alignment alone can chain a legend into an unrelated table or notes
 * panel farther down the same sheet. Split each aligned column at a real
 * vertical discontinuity. The threshold is learned from that column's own
 * row cadence and the page's own text height, so it scales across exports. */
function splitAlignedGroupVertically(
  indices: number[], pairs: PairCandidate[], lines: LegendSpan[], typicalTextHeight: number,
): number[][] {
  if (indices.length < 3) return [indices];
  const sorted = [...indices].sort((a, b) => {
    const ay = (pairs[a].span.y0 + pairs[a].span.y1) / 2;
    const by = (pairs[b].span.y0 + pairs[b].span.y1) / 2;
    return ay - by || pairs[a].span.x0 - pairs[b].span.x0;
  });
  const centers = sorted.map((index) => (pairs[index].span.y0 + pairs[index].span.y1) / 2);
  const positiveDeltas = centers.slice(1).map((center, index) => center - centers[index]).filter((delta) => delta > typicalTextHeight * 0.4);
  const cadence = median(positiveDeltas);
  const splitGap = Math.max(typicalTextHeight * 8, cadence * 3);
  const out: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const previous = pairs[sorted[i - 1]];
    const next = pairs[sorted[i]];
    const x0 = Math.min(previous.rect[0][0], previous.span.x0, next.rect[0][0], next.span.x0);
    const x1 = Math.max(previous.rect[1][0], previous.span.x1, next.rect[1][0], next.span.x1);
    const boundaryBetween = lines.some((line) => isSectionBoundaryText(line.text)
      && line.y0 > previous.span.y1 + typicalTextHeight * 0.2
      && line.y1 < next.span.y0 - typicalTextHeight * 0.2
      && line.x1 >= x0 - typicalTextHeight * 2
      && line.x0 <= x1 + typicalTextHeight * 2);
    // A parameterized legend row can be physically tall: its main caption
    // is followed by a glyphless option/key list before the next symbol.
    // That is continuous section content, not the empty vertical break used
    // to separate a legend from a notes table or diagram. Prove continuity
    // with a local, gap-bounded chain in the same description column.
    const bridgeMinX = Math.min(previous.span.x0, next.span.x0) - typicalTextHeight * 0.5;
    const bridgeMaxX = Math.max(previous.span.x0, next.span.x0) + typicalTextHeight * 8;
    const bridgeLines = lines.filter((line) => line.y0 > previous.span.y1 - 1
      && line.y1 < next.span.y0 + 1
      && line.x0 >= bridgeMinX && line.x0 <= bridgeMaxX
      && !isSectionBoundaryText(line.text))
      .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    const maxBridgeStep = typicalTextHeight * 3;
    let bridgeCursor = previous.span.y1;
    for (const line of bridgeLines) {
      if (line.y0 - bridgeCursor > maxBridgeStep) break;
      bridgeCursor = Math.max(bridgeCursor, line.y1);
    }
    const hasLocalTextBridge = next.span.y0 - bridgeCursor <= maxBridgeStep;
    if (boundaryBetween || (centers[i] - centers[i - 1] > splitGap && !hasLocalTextBridge)) out.push([]);
    out[out.length - 1].push(sorted[i]);
  }
  return out;
}

function nearbyLegendHeading(
  group: PairCandidate[], lines: LegendSpan[], segs: number[], typicalTextHeight: number,
): string | null {
  const gx0 = Math.min(...group.map((p) => p.rect[0][0]));
  const gx1 = Math.max(...group.map((p) => p.span.x1));
  const glyphCenterX = median(group.map((p) => (p.rect[0][0] + p.rect[1][0]) / 2));
  const captionColumnX = median(group.map((p) => p.span.x0));
  const firstY = Math.min(...group.map((p) => Math.min(p.rect[0][1], p.span.y0)));
  const headingBounds = new Map<LegendSpan, { x0: number; x1: number }>();
  const boundsFor = (heading: LegendSpan): { x0: number; x1: number } => {
    const cached = headingBounds.get(heading);
    if (cached) return cached;
    const underline = underlinedLegendJurisdiction(heading, segs, typicalTextHeight);
    const bounds = underline ?? { x0: heading.x0, x1: heading.x1 };
    headingBounds.set(heading, bounds);
    return bounds;
  };
  const hasCaptionColumnBridge = (heading: LegendSpan): boolean => {
    const bridgeLines = lines.filter((line) => line !== heading
      && line.y0 > heading.y1
      && line.y1 < firstY - typicalTextHeight * 0.1
      && meaningfulCaption(line.text)
      && Math.abs(line.x0 - captionColumnX) <= typicalTextHeight * 3)
      .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    // Allow several empty row-heights (dimension/text-only legend entries
    // have no pairable vector glyph) but still require repeated intermediate
    // evidence. A remote diagram with no such bridge remains rejected.
    const maxStep = typicalTextHeight * 8;
    let cursor = heading.y1;
    for (const line of bridgeLines) {
      if (line.y0 - cursor > maxStep) continue;
      cursor = Math.max(cursor, line.y1);
    }
    return firstY - cursor <= maxStep;
  };
  const horizontalDistance = (s: LegendSpan) => {
    const bounds = boundsFor(s);
    return bounds.x1 < gx0 ? gx0 - bounds.x1 : bounds.x0 > gx1 ? bounds.x0 - gx1 : 0;
  };
  const candidates = lines.filter((s) => {
    if (!isLegendHeadingText(s.text) || s.y1 > firstY + typicalTextHeight) return false;
    if (/^SYMBOL$/i.test(normalizedCaption(s.text))) {
      // In equipment schedules, SYMBOL is one field among several peers on
      // the same header row. Thin underlines beneath asset IDs otherwise pair
      // with AREA SERVED values and manufacture a fake legend column. A real
      // two-column SYMBOL/DESCRIPTION legend does not have two independent
      // schedule-field peers, and a named legend title above remains eligible.
      const centerY = (s.y0 + s.y1) / 2;
      const schedulePeers = lines.filter((other) => other !== s
        && isScheduleFieldHeaderText(other.text)
        && Math.abs((other.y0 + other.y1) / 2 - centerY) <= typicalTextHeight * 0.6
        && (other.x1 < s.x0 ? s.x0 - other.x1 : s.x1 < other.x0 ? other.x0 - s.x1 : 0)
          <= typicalTextHeight * 30);
      if (schedulePeers.length >= 2) return false;
    }
    // A heading identifies the section directly beneath it, not every
    // aligned diagram cluster hundreds of text-heights later. Real reviewed
    // loose and bordered legends place their first row within ten local text
    // heights; the larger former window let a top-right DDC legend bless a
    // separate network architecture diagram below it.
    if (firstY - s.y1 > Math.max(typicalTextHeight * 10, 120) && !hasCaptionColumnBridge(s)) return false;
    const margin = typicalTextHeight * 5;
    const bounds = boundsFor(s);
    const headingCenterX = (s.x0 + s.x1) / 2;
    const supportsGlyph = glyphCenterX >= bounds.x0 - margin && glyphCenterX <= bounds.x1 + margin;
    const supportsWholeColumn = headingCenterX >= gx0 - margin && headingCenterX <= gx1 + margin;
    if (!supportsGlyph && !supportsWholeColumn) return false;
    // A closer section title ends the preceding heading's jurisdiction.
    // Without this, "MECHANICAL PIPING LEGEND" can bless callout labels in
    // an "AIR DISTRIBUTION DEVICE IDENTIFICATION" panel underneath it.
    return !lines.some((other) => other !== s
      && isSectionBoundaryText(other.text)
      && other.y0 > s.y1 + typicalTextHeight * 0.2
      && other.y1 < firstY - typicalTextHeight * 0.2
      // A lower header in the adjacent table column must not steal this
      // column from an explicit overlapping legend heading above it.
      && horizontalDistance(other) <= horizontalDistance(s)
      && ((glyphCenterX >= other.x0 - margin && glyphCenterX <= other.x1 + margin)
        || (((other.x0 + other.x1) / 2) >= gx0 - margin && ((other.x0 + other.x1) / 2) <= gx1 + margin)));
  });
  candidates.sort((a, b) => horizontalDistance(a) - horizontalDistance(b)
    || (firstY - a.y1) - (firstY - b.y1) || a.x0 - b.x0);
  return candidates.length ? normalizedCaption(candidates[0].text) : null;
}

/** Assign below-caption cells to the explicit legend heading whose
 * horizontal jurisdiction contains them. A cell legend is a two-dimensional
 * grid rather than one repeated x-column, so ordinary alignedGroups cannot
 * establish it. Requiring an extractable heading, a finite horizontal
 * reach, repeated cells, and HVAC/BAS domain density keeps arbitrary plan
 * labels, schedules, and nearby symbology panels out. */
function headedBelowCaptionGroups(
  pairs: PairCandidate[], rightPairs: PairCandidate[], lines: LegendSpan[], segs: number[], typicalTextHeight: number,
  maxCaptionGapPx: number, minAlignedRows: number, layoutEvidenceDisabled: boolean,
): Array<{ group: PairCandidate[]; heading: string }> {
  const headings = lines.map((span, index) => ({ span, index }))
    .filter(({ span }) => isBelowCaptionLegendHeading(span.text)
      || (/^(?:STANDARD\s+SYMBOLS|ARCHITECTURAL\s+SYMBOLS?)$/i.test(normalizedCaption(span.text))
        && !!underlinedLegendJurisdiction(span, segs, typicalTextHeight)));
  const grouped = new Map<number, PairCandidate[]>();
  for (const pair of pairs) {
    const x0 = Math.min(pair.rect[0][0], pair.span.x0);
    const x1 = Math.max(pair.rect[1][0], pair.span.x1);
    const top = Math.min(pair.rect[0][1], pair.span.y0);
    const supported = headings.filter(({ span }) => {
      if (span.y1 >= top) return false;
      const underlined = underlinedLegendJurisdiction(span, segs, typicalTextHeight);
      if (underlined) {
        const margin = typicalTextHeight * 2;
        if (x0 < underlined.x0 - margin || x1 > underlined.x1 + margin
          || top - underlined.y > Math.max(900, typicalTextHeight * 100)) return false;
      }
      const horizontalGap = span.x1 < x0 ? x0 - span.x1
        : x1 < span.x0 ? span.x0 - x1 : 0;
      return horizontalGap <= Math.max(maxCaptionGapPx, typicalTextHeight * 12);
    });
    if (!supported.length) continue;
    // Prefer the nearest heading vertically, then the one most directly
    // overlapping this cell. This keeps adjacent legend panels independent.
    supported.sort((a, b) => {
      const aVertical = top - a.span.y1;
      const bVertical = top - b.span.y1;
      const aHorizontal = a.span.x1 < x0 ? x0 - a.span.x1
        : x1 < a.span.x0 ? a.span.x0 - x1 : 0;
      const bHorizontal = b.span.x1 < x0 ? x0 - b.span.x1
        : x1 < b.span.x0 ? b.span.x0 - x1 : 0;
      return aVertical - bVertical || aHorizontal - bHorizontal || a.index - b.index;
    });
    const winner = supported[0].index;
    const entries = grouped.get(winner);
    if (entries) entries.push(pair);
    else grouped.set(winner, [pair]);
  }

  const accepted: Array<{ group: PairCandidate[]; heading: string }> = [];
  for (const [headingIndex, group] of grouped) {
    const heading = normalizedCaption(lines[headingIndex].text);
    const underlinedDraftingPanel = /^(?:STANDARD\s+SYMBOLS|ARCHITECTURAL\s+SYMBOLS?)$/i.test(heading)
      && !!underlinedLegendJurisdiction(lines[headingIndex], segs, typicalTextHeight);
    const singletonDraftingAnnotation = underlinedDraftingPanel
      && group.length === 1
      && isDraftingAnnotationCaption(group[0].caption);
    if (group.length < minAlignedRows && !singletonDraftingAnnotation) continue;
    const domainRows = group.filter((pair) => isHvacBasCaption(pair.caption)).length;
    const domainFloor = Math.max(2, Math.ceil(group.length * 0.2));
    if (!layoutEvidenceDisabled && !underlinedDraftingPanel
      && !isDomainHeading(heading) && domainRows < domainFloor) continue;
    if (!layoutEvidenceDisabled && underlinedDraftingPanel
      && group.some((pair) => !isDraftingAnnotationCaption(pair.caption))) continue;

    // A two-dimensional legend can legitimately mix orientations inside the
    // same ruled panel. RCP material swatches, for example, put a large hatch
    // LEFT of its description while the device cells around them put compact
    // marks ABOVE centered descriptions. The ordinary aligned-column gate
    // sees those right-caption swatches, but a one- or two-cell material
    // subsection cannot independently satisfy its repeated-layout threshold.
    // Once the repeated below-caption cells have established this headed 2-D
    // panel, admit a right-caption pair only when its caption occupies the
    // same physical row band and its complete glyph+caption extent stays in
    // that panel's finite envelope. This derives ownership from topology,
    // never from project/page/caption exceptions.
    const augmented = [...group];
    const regionX0 = Math.min(...group.map((pair) => Math.min(pair.rect[0][0], pair.span.x0)));
    const regionX1 = Math.max(...group.map((pair) => Math.max(pair.rect[1][0], pair.span.x1)));
    const regionY0 = Math.min(...group.map((pair) => Math.min(pair.rect[0][1], pair.span.y0)));
    const regionY1 = Math.max(...group.map((pair) => Math.max(pair.rect[1][1], pair.span.y1)));
    const envelopeSlack = Math.max(typicalTextHeight * 5, maxCaptionGapPx * 0.25);
    const identity = (pair: PairCandidate) => `${pair.caption}\u0000${[
      pair.span.x0, pair.span.y0, pair.span.x1, pair.span.y1,
    ].join(",")}`;
    const area = (pair: PairCandidate) => Math.max(1,
      (pair.rect[1][0] - pair.rect[0][0]) * (pair.rect[1][1] - pair.rect[0][1]));
    const sameRowBand = (candidate: PairCandidate) => group.some((member) => {
      const overlap = Math.min(candidate.span.y1, member.span.y1)
        - Math.max(candidate.span.y0, member.span.y0);
      const candidateCenter = (candidate.span.y0 + candidate.span.y1) / 2;
      const memberCenter = (member.span.y0 + member.span.y1) / 2;
      return overlap >= -typicalTextHeight * 0.15
        || Math.abs(candidateCenter - memberCenter) <= typicalTextHeight * 1.5;
    });

    for (const right of rightPairs) {
      if (right.layout !== "right") continue;
      const duplicateIndex = augmented.findIndex((member) => identity(member) === identity(right));
      if (duplicateIndex >= 0) {
        const existing = augmented[duplicateIndex];
        // A partial hatch fragment above a caption can be a valid vertical
        // candidate while the full bordered/hatch swatch to its left is the
        // true legend evidence. Prefer the right-oriented version only when
        // it is materially richer in BOTH extent and vector content.
        if (area(right) >= area(existing) * 1.5 && right.segments > existing.segments) {
          augmented[duplicateIndex] = right;
        }
        continue;
      }
      const text = normalizedCaption(right.caption);
      if (isDirectiveProse(text)) continue;
      if (text.split(/\s+/).length < 2 && !isHvacBasCaption(text)) continue;
      const x0 = Math.min(right.rect[0][0], right.span.x0);
      const x1 = Math.max(right.rect[1][0], right.span.x1);
      const y0 = Math.min(right.rect[0][1], right.span.y0);
      const y1 = Math.max(right.rect[1][1], right.span.y1);
      if (x0 < regionX0 - envelopeSlack || x1 > regionX1 + envelopeSlack
        || y0 < regionY0 - envelopeSlack || y1 > regionY1 + envelopeSlack
        || !sameRowBand(right)) continue;
      augmented.push(right);
    }
    accepted.push({ group: augmented, heading });
  }
  return accepted;
}

/** A compact network line-key legend is commonly placed directly above a
 * much larger network architecture diagram. The diagram can accidentally
 * repeat one box+caption x-column under the line keys. Preserve a genuine
 * mixed network legend when its device rows are adjacent, but when a
 * complete leading run of line keys is followed only after a section-sized
 * vertical break by box symbols, the trailing rows belong to the diagram,
 * not the legend. This is derived from kind, order, and local text scale;
 * it contains no project/page/caption exceptions. */
function withoutTrailingNetworkDiagram(
  group: PairCandidate[], heading: string | null, typicalTextHeight: number, minAlignedRows: number,
): PairCandidate[] {
  if (!heading || !/\bNETWORK\s+LEGEND\b/i.test(heading) || group.length <= minAlignedRows) return group;
  const ordered = [...group].sort((a, b) => {
    const ay = Math.min(a.rect[0][1], a.span.y0);
    const by = Math.min(b.rect[0][1], b.span.y0);
    return ay - by || a.span.x0 - b.span.x0;
  });
  let leadingLineStyles = 0;
  while (leadingLineStyles < ordered.length && ordered[leadingLineStyles].kind === "line_style") leadingLineStyles++;
  if (leadingLineStyles < minAlignedRows || leadingLineStyles === ordered.length) return group;
  const prefix = ordered.slice(0, leadingLineStyles);
  const suffix = ordered.slice(leadingLineStyles);
  if (suffix.some((pair) => pair.kind === "line_style")) return group;
  const prefixBottom = Math.max(...prefix.map((pair) => Math.max(pair.rect[1][1], pair.span.y1)));
  const suffixTop = Math.min(...suffix.map((pair) => Math.min(pair.rect[0][1], pair.span.y0)));
  if (suffixTop - prefixBottom <= typicalTextHeight * 3) return group;
  return prefix;
}

/** Complete paragraph-sized definitions inside a named MEP legend section.
 * Nearest-line wrapping alone is insufficient when the glyph is vertically
 * centered beside a 10-15 line tag definition: it can start in the middle
 * and hit a line cap before reaching both ends. Once repeated geometry and a
 * specific section heading have established ownership, neighboring symbol
 * rows provide finite vertical boundaries. Collect only text in that learned
 * description-column envelope and never reach across the next row. */
function completeSpecificSectionCaptions(
  group: PairCandidate[], lines: LegendSpan[], heading: string | null,
  typicalTextHeight: number,
): void {
  if (!heading || !isSpecificDisciplineLegendHeading(heading) || !group.length) return;
  const ordered = [...group].sort((a, b) => {
    const ay = (a.rect[0][1] + a.rect[1][1]) / 2;
    const by = (b.rect[0][1] + b.rect[1][1]) / 2;
    return ay - by || a.span.x0 - b.span.x0;
  });
  const captionColumnX = median(ordered.map((pair) => pair.span.x0));
  const firstTop = Math.min(...ordered.map((pair) => Math.min(pair.rect[0][1], pair.span.y0)));
  const headingSpan = lines.filter((line) => normalizedCaption(line.text) === heading && line.y1 < firstTop)
    .sort((a, b) => (firstTop - a.y1) - (firstTop - b.y1))[0];
  const xMin = captionColumnX - typicalTextHeight * 0.5;
  const xMax = captionColumnX + typicalTextHeight * 10;

  for (let i = 0; i < ordered.length; i++) {
    const pair = ordered[i];
    const previousBottom = i ? Math.max(
      ordered[i - 1].rect[1][1], ordered[i - 1].span.y1,
    ) : (headingSpan?.y1 ?? pair.span.y0 - typicalTextHeight * 2);
    const nextTop = i + 1 < ordered.length ? Math.min(
      ordered[i + 1].rect[0][1], ordered[i + 1].span.y0,
    ) : pair.span.y1 + typicalTextHeight * 3;
    const yMin = previousBottom + (i ? typicalTextHeight * 0.2 : 0);
    const yMax = nextTop - (i + 1 < ordered.length ? typicalTextHeight * 0.2 : 0);
    const eligible = lines.filter((line) => {
      const centerY = (line.y0 + line.y1) / 2;
      return centerY >= yMin && centerY <= yMax
        && line.x0 >= xMin && line.x0 <= xMax
        && /[A-Z0-9]/i.test(normalizedCaption(line.text))
        && normalizedCaption(line.text) !== heading
        && !isSectionBoundaryText(line.text);
    }).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    // Start with the text the normal one-to-one pairing/wrap pass already
    // owned, then walk across ordinary line leading in either direction.
    // A separate glyphless legend row has a full row gap and stays outside.
    let blockY0 = pair.span.y0;
    let blockY1 = pair.span.y1;
    const selected = new Set<number>();
    const maxLeadingGap = Math.max(2, typicalTextHeight * 0.5);
    for (;;) {
      let changed = false;
      for (let lineIndex = 0; lineIndex < eligible.length; lineIndex++) {
        if (selected.has(lineIndex)) continue;
        const line = eligible[lineIndex];
        const gap = line.y0 > blockY1 ? line.y0 - blockY1
          : blockY0 > line.y1 ? blockY0 - line.y1 : 0;
        if (gap > maxLeadingGap) continue;
        selected.add(lineIndex);
        blockY0 = Math.min(blockY0, line.y0);
        blockY1 = Math.max(blockY1, line.y1);
        changed = true;
      }
      if (!changed) break;
    }
    const owned = eligible.filter((_, index) => selected.has(index));
    if (!owned.length) continue;
    pair.caption = normalizedCaption(owned.map((line) => line.text).join(" "));
    pair.captionLines = new Set(owned.map((line) =>
      Math.round(line.y0 / Math.max(1, typicalTextHeight * 0.25)))).size;
    pair.span = {
      text: pair.caption,
      x0: Math.min(...owned.map((line) => line.x0)),
      y0: Math.min(...owned.map((line) => line.y0)),
      x1: Math.max(...owned.map((line) => line.x1)),
      y1: Math.max(...owned.map((line) => line.y1)),
    };
  }
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
  opts: LegendLearnOptions = {},
): LegendGlyph[] {
  if (!segs.length || !rawSpans.length) return [];
  const rawTextHeight = Math.max(6, median(rawSpans
    .map((s) => s.y1 - s.y0)
    .filter((height) => height > 2 && height <= 120)) || 12);
  // Font/kerning boundaries are not always sub-pixel. A reviewed 4896px
  // CAD exports split captions at font seams and at drawn inline marks. A
  // reviewed electrical legend also emits each bullet, key, and definition
  // as separate same-line runs with 18-28px gaps at 25px lettering. Scale
  // from the local run height with a finite 32px ceiling; actual table
  // columns remain materially farther apart.
  const captionMergeGapPx = opts.captionMergeGapPx
    ?? Math.max(3, Math.min(32, rawTextHeight * 1.5));
  const lines = mergeCaptionLines(rawSpans, captionMergeGapPx);
  const spans = lines;
  const typicalTextHeight = Math.max(6, median(lines
    .map((s) => s.y1 - s.y0)
    .filter((height) => height > 2 && height <= 120)) || 12);
  // PDF image-space resolution varies materially across the corpus. Fixed
  // 80/150px bounds missed ordinary thermowells and dampers on a different
  // 5184px-wide export. Text height is the page-local ruler both the browser
  // and MCP possess, so scale the search from it with conservative caps.
  // Symbols drawn inline with pipe/duct stubs (anchors, guides, dampers)
  // routinely span about eleven local text heights even though the device
  // itself is compact. Explicit symbol legends can also contain large
  // transition/fan/tee assemblies spanning about seventeen local text
  // heights. Their declared, repeated layout supports a larger but still
  // finite 320px ceiling; headerless pages retain the conservative 220px
  // bound so plan details and schedule graphics cannot widen themselves.
  const hasExplicitLegendHeading = lines.some((line) => isLegendHeadingText(line.text));
  const hasStandardDraftingLegendHeading = lines.some((line) =>
    supportsUnderlinedMultiColumnJurisdiction(line.text));
  const declaredTableHeaders = symbolDescriptionHeaders(lines, typicalTextHeight);
  const hasSymbolDescriptionHeaderRow = declaredTableHeaders.length > 0;
  const conservativeMaxGlyphDimPx = opts.maxGlyphDimPx
    ?? Math.max(80, Math.min(220, typicalTextHeight * 12));
  const maxGlyphDimPx = opts.maxGlyphDimPx ?? (hasStandardDraftingLegendHeading
    ? Math.max(conservativeMaxGlyphDimPx, Math.min(640, typicalTextHeight * 36))
    : hasExplicitLegendHeading && hasSymbolDescriptionHeaderRow
      ? Math.max(80, Math.min(320, typicalTextHeight * 18))
      : conservativeMaxGlyphDimPx);
  const maxCaptionGapPx = opts.maxCaptionGapPx ?? Math.max(150, Math.min(320, typicalTextHeight * 14));
  const maxLineStyleDimPx = Math.max(maxGlyphDimPx * 1.6, typicalTextHeight * 20);
  // Named discipline sections often use one symbol beside a paragraph-sized
  // definition (equipment connections and receptacle-tag keys can run from
  // five to fifteen physical lines). Their explicit bounded headings provide
  // stronger ownership than an unheaded same-margin text column, so retain a
  // larger but still finite block there. Callers can always override the cap.
  const hasSpecificDisciplineSections = lines.some((line) => isSpecificDisciplineLegendHeading(line.text));
  const maxWrapLines = Math.max(1, Math.floor(opts.maxWrapLines
    ?? (hasSpecificDisciplineSections ? 16 : 3)));
  // Wrapped CAD descriptions are often centered under their first line,
  // not left-aligned. Cherry Point's reviewed damper rows indent line two
  // by 19px and line three by 52px at a 25px text height. Scale both gates
  // from the sheet's lettering, with finite caps far inside column spacing.
  const maxWrapGapPx = opts.maxWrapGapPx ?? Math.max(8, Math.min(18, typicalTextHeight * 0.45));
  const maxWrapIndentPx = opts.maxWrapIndentPx
    ?? Math.max(5, Math.min(64, typicalTextHeight * 2.5));

  const hasBelowCaptionLegendHeading = lines.some((line) => isBelowCaptionLegendHeading(line.text));
  const underlinedDraftingBelowCaptionPanels = lines.map((heading) => ({
    heading,
    jurisdiction: /^(?:STANDARD\s+SYMBOLS|ARCHITECTURAL\s+SYMBOLS?)$/i.test(normalizedCaption(heading.text))
      ? underlinedLegendJurisdiction(heading, segs, typicalTextHeight) : null,
  })).filter((entry): entry is { heading: LegendSpan; jurisdiction: UnderlinedLegendJurisdiction } =>
    !!entry.jurisdiction);
  const hasUnderlinedDraftingBelowCaptionHeading = underlinedDraftingBelowCaptionPanels.length > 0;
  const hasBelowCaptionSearch = hasBelowCaptionLegendHeading
    || hasUnderlinedDraftingBelowCaptionHeading;
  const spanInsideUnderlinedPanel = (
    span: LegendSpan,
    panels: Array<{ heading: LegendSpan; jurisdiction: UnderlinedLegendJurisdiction }>,
  ): boolean => {
    const centerX = (span.x0 + span.x1) / 2;
    return panels.some(({ jurisdiction }) => centerX >= jurisdiction.x0 - typicalTextHeight
      && centerX <= jurisdiction.x1 + typicalTextHeight
      && span.y0 > jurisdiction.y
      && span.y0 - jurisdiction.y <= Math.max(900, typicalTextHeight * 120));
  };
  const shouldSearchBelowCaption = (span: LegendSpan): boolean => hasBelowCaptionLegendHeading
    // In a standard drafting panel the alternate orientation is earned by
    // the one convention that is itself normally captioned below its
    // horizontal bar. Other annotations are right-caption rows; opening a
    // large search band above all of them can pull in a neighboring
    // abbreviations panel before normal one-to-one pairing runs.
    || (/^GRAPHICAL\s+SCALE$/i.test(normalizedCaption(span.text))
      && spanInsideUnderlinedPanel(span, underlinedDraftingBelowCaptionPanels));
  const draftingRightCaptionGap = (span: LegendSpan): number =>
    isDraftingAnnotationCaption(span.text)
      && spanInsideUnderlinedPanel(span, underlinedDraftingBelowCaptionPanels)
      ? Math.max(maxCaptionGapPx, Math.min(420, typicalTextHeight * 18))
      : maxCaptionGapPx;
  const draftingRightCaptionGapForCandidate = (
    candidate: GlyphCandidate, span: LegendSpan,
  ): number => {
    if (!isDraftingAnnotationCaption(span.text)) return maxCaptionGapPx;
    const candidateCenterX = (candidate.rect[0][0] + candidate.rect[1][0]) / 2;
    const candidateCenterY = (candidate.rect[0][1] + candidate.rect[1][1]) / 2;
    const spanCenterX = (span.x0 + span.x1) / 2;
    const samePanel = underlinedDraftingBelowCaptionPanels.some(({ jurisdiction }) =>
      candidateCenterX >= jurisdiction.x0 - typicalTextHeight
      && candidateCenterX <= jurisdiction.x1 + typicalTextHeight
      && spanCenterX >= jurisdiction.x0 - typicalTextHeight
      && spanCenterX <= jurisdiction.x1 + typicalTextHeight
      && candidateCenterY > jurisdiction.y
      && span.y0 > jurisdiction.y
      && Math.max(candidateCenterY, span.y0) - jurisdiction.y
        <= Math.max(900, typicalTextHeight * 120));
    return samePanel
      ? Math.max(maxCaptionGapPx, Math.min(420, typicalTextHeight * 18))
      : maxCaptionGapPx;
  };
  const draftingTextResemblanceContext = (
    candidate: GlyphCandidate,
  ): TextResemblanceContext => {
    const [[x0, y0], [x1, y1]] = candidate.rect;
    const centerX = (x0 + x1) / 2;
    const centerY = (y0 + y1) / 2;
    const panel = underlinedDraftingBelowCaptionPanels.find(({ jurisdiction }) =>
      centerX >= jurisdiction.x0 - typicalTextHeight
      && centerX <= jurisdiction.x1 + typicalTextHeight
      && centerY > jurisdiction.y
      && centerY - jurisdiction.y <= Math.max(900, typicalTextHeight * 120));
    if (!panel) return {};
    const panelLines = lines.filter((line) => spanInsideUnderlinedPanel(line, [panel]));
    const sameCandidateRow = (line: LegendSpan): boolean => {
      const margin = Math.max((y1 - y0) * 0.5, typicalTextHeight * 0.75);
      return line.y1 >= y0 - margin && line.y0 <= y1 + margin;
    };
    const externalIdentity = (predicate: (text: string) => boolean): boolean =>
      panelLines.some((line) => line.x0 >= x1
        && line.x0 - x1 <= Math.max(maxCaptionGapPx, Math.min(420, typicalTextHeight * 18))
        && sameCandidateRow(line)
        && predicate(line.text));
    return {
      allowNearEdgeAlphaTag: externalIdentity(isDiscreteInstalledDeviceCaption),
    };
  };
  const relevantSegs = segmentsNearCaptions(
    segs, spans, maxGlyphDimPx, maxCaptionGapPx,
    shouldSearchBelowCaption,
    draftingRightCaptionGap,
  );
  const { components: clusters, gridPx } = clusterSegments(relevantSegs, maxGlyphDimPx, maxLineStyleDimPx);
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
  const candidates: GlyphCandidate[] = [];
  for (const c of clusters) {
    if (!looksLikeGlyph(c, c.edges, maxGlyphDimPx, maxLineStyleDimPx)) continue;
    const rect: [Point, Point] = [[c.x0 - pad, c.y0 - pad], [c.x1 + pad, c.y1 + pad]];
    candidates.push({ rect, segments: c.edges, kind: glyphKind(rect, gridPx, c.edges, maxGlyphDimPx, rawSpans) });
  }
  candidates.push(...disconnectedParallelStrokeCandidates(
    relevantSegs, spans, candidates, typicalTextHeight,
    maxCaptionGapPx, maxLineStyleDimPx, pad,
  ));
  const structuredTables = structuredLegendTables(segs, lines, typicalTextHeight);
  const sectionDividers = verticalSectionDividers(segs, typicalTextHeight);
  const tagCallouts = tagCalloutPairs(
    segs, lines, rawSpans, typicalTextHeight, maxGlyphDimPx,
    maxLineStyleDimPx, sectionDividers,
  );
  const ruledPairs = structuredTablePairs(
    structuredTables, candidates, lines, rawSpans, typicalTextHeight,
  );
  const materialGroups = materialLegendGroups(
    lines, segs, typicalTextHeight, maxGlyphDimPx, maxCaptionGapPx,
    maxWrapGapPx, maxWrapIndentPx, maxWrapLines,
  );

  const paired = pairCandidates(
    candidates, spans, rawSpans, maxCaptionGapPx, typicalTextHeight,
    shouldSearchBelowCaption, sectionDividers, declaredTableHeaders,
    draftingRightCaptionGapForCandidate, draftingTextResemblanceContext,
  );
  const reunitedPairs = mergeDownshiftedGlyphFragments(
    paired.pairs, typicalTextHeight, maxGlyphDimPx, gridPx, rawSpans,
    maxWrapGapPx, maxWrapIndentPx, maxWrapLines,
  );
  recoverSplitRectangularCarriers(
    reunitedPairs, candidates, typicalTextHeight, maxGlyphDimPx,
  );
  expandLineStylePairs(reunitedPairs, candidates, rawSpans, gridPx, typicalTextHeight, maxLineStyleDimPx);
  expandSymbolPairs(reunitedPairs, candidates, rawSpans, typicalTextHeight, maxGlyphDimPx);
  closeSeamedDeviceEnclosures(reunitedPairs, segs, typicalTextHeight, gridPx);
  attachWrappedCaptions(
    reunitedPairs, spans, paired.usedSpans,
    maxWrapGapPx, maxWrapIndentPx, maxWrapLines, typicalTextHeight,
  );
  const mergedPairs = mergeOwnedWrapPairs(
    reunitedPairs,
    maxWrapGapPx,
    maxWrapIndentPx,
    maxGlyphDimPx,
    typicalTextHeight,
    maxWrapLines,
    rawSpans,
  );
  // Caption fragments can be owned by separate components of the same
  // physical glyph. Consolidate those components first; only then can a
  // downshift repair move the leading text line without duplicating or
  // discarding the lower row's actual symbol geometry.
  rebalanceDownshiftedCaptionOwnership(
    mergedPairs, spans, paired.usedSpans, typicalTextHeight, maxWrapIndentPx,
  );
  const heuristicPairs = withoutContainedDetailPairs(mergedPairs, typicalTextHeight, maxWrapGapPx);
  const replacedHeuristicPairs = new Set<PairCandidate>();
  const admittedRuledPairs: PairCandidate[] = [];
  for (const ruled of ruledPairs) {
    const table = structuredTables.find((candidate) => pairBelongsToStructuredTable(ruled, candidate));
    const band = ruled.structuredBand;
    if (!table || !band) continue;
    const occupants = heuristicPairs.filter((pair) => {
      if (!pairBelongsToStructuredTable(pair, table)) return false;
      const materiallyOverlapsBand = (y0: number, y1: number): boolean => {
        const overlap = Math.max(0, Math.min(y1, band[1]) - Math.max(y0, band[0]));
        const smallerHeight = Math.max(0.001, Math.min(y1 - y0, band[1] - band[0]));
        return overlap / smallerHeight >= 0.35;
      };
      // Center-only ownership misses a malformed heuristic pair whose glyph
      // and caption span two adjacent ruled rows: its two centers can fall on
      // the shared rule, leaving the duplicate alive beside both exact rows.
      // Material overlap assigns that candidate to every row it contaminates;
      // the exact single-band candidates then replace it deterministically.
      return materiallyOverlapsBand(pair.rect[0][1], pair.rect[1][1])
        && materiallyOverlapsBand(pair.span.y0, pair.span.y1);
    });
    const ruledCaption = canonicalLegendCaption(ruled.caption);
    const otherRuledCaptions = ruledPairs.filter((candidate) => candidate !== ruled)
      .map((candidate) => canonicalLegendCaption(candidate.caption))
      .filter((caption) => caption.length >= 4);
    const completeHeuristic = occupants.find((pair) => {
      const heuristicCaption = canonicalLegendCaption(pair.caption);
      const tolerance = typicalTextHeight * 0.2;
      const geometryInsideRow = pair.rect[0][0] >= table.left - tolerance
        && pair.rect[1][0] <= table.symbolRight + tolerance
        && pair.rect[0][1] >= band[0] - tolerance
        && pair.rect[1][1] <= band[1] + tolerance;
      // A ruled cell is a stronger ownership boundary than proximity. When
      // it contains additional disconnected vector components for the same
      // caption, the heuristic fingerprint is incomplete (ground bars,
      // dashed recessed-device rings, indicator strokes, etc.). Preserve the
      // source-complete cell geometry instead of accepting a convenient
      // subset merely because that subset already has the right label.
      const structuredAddsGeometry = ruled.members.length > pair.members.length;
      const exactAndComplete = heuristicCaption === ruledCaption
        && geometryInsideRow
        && pair.kind === ruled.kind
        && !structuredAddsGeometry;
      const containsAnotherRow = otherRuledCaptions.some((caption) =>
        caption !== ruledCaption && heuristicCaption.includes(caption));
      return exactAndComplete
        // A row-band may end before centered or hanging source prose that
        // the glyph/caption topology already owned correctly. Prefer that
        // fuller existing identity over a strict-band prefix.
        || (heuristicCaption.length > ruledCaption.length
          && heuristicCaption.includes(ruledCaption)
          && !containsAnotherRow);
    });
    if (completeHeuristic) {
      for (const occupant of occupants) {
        if (occupant !== completeHeuristic) replacedHeuristicPairs.add(occupant);
      }
      continue;
    }
    for (const occupant of occupants) replacedHeuristicPairs.add(occupant);
    admittedRuledPairs.push(ruled);
  }
  const insideTagCalloutZone = (pair: PairCandidate): boolean => {
    const centerX = (pair.span.x0 + pair.span.x1) / 2;
    const centerY = (pair.span.y0 + pair.span.y1) / 2;
    return tagCallouts.some(({ zone }) => centerX >= zone.left && centerX <= zone.right
      && centerY >= zone.top && centerY <= zone.bottom);
  };
  const insideMaterialLegendZone = (pair: PairCandidate): boolean => {
    // Once a repeated material panel owns a caption, geometry outside that
    // panel cannot steal the same text merely by pulling a combined midpoint
    // across the boundary. Caption location defines row jurisdiction here;
    // materialLegendGroups supplies the independently proven swatch.
    const centerX = (pair.span.x0 + pair.span.x1) / 2;
    const centerY = (pair.span.y0 + pair.span.y1) / 2;
    return materialGroups.some(({ zone }) => centerX >= zone.x0 && centerX <= zone.x1
      && centerY >= zone.y0 && centerY <= zone.y1);
  };
  const pairs = [
    ...heuristicPairs.filter((pair) => !replacedHeuristicPairs.has(pair)),
    ...admittedRuledPairs,
  ].filter((pair) => !insideTagCalloutZone(pair) && !insideMaterialLegendZone(pair));
  trimRoutedBaselinesWithCallouts(pairs, segs, rawSpans, typicalTextHeight, gridPx);
  const belowPaired = hasBelowCaptionSearch
    ? pairCandidatesBelow(
      candidates, spans, rawSpans, maxCaptionGapPx, typicalTextHeight,
      pairs, shouldSearchBelowCaption,
    )
    : { pairs: [] as PairCandidate[], usedSpans: new Set<number>() };
  attachWrappedCaptions(
    belowPaired.pairs, spans, belowPaired.usedSpans,
    maxWrapGapPx, maxWrapIndentPx, maxWrapLines, typicalTextHeight,
  );
  expandBelowCaptionPairs(
    belowPaired.pairs, candidates, rawSpans, typicalTextHeight,
    maxGlyphDimPx, [...pairs, ...belowPaired.pairs],
  );

  // A nearest glyph+text coincidence is not yet a legend row. Require the
  // repeated two-column topology legends actually use. This is the guard
  // against control schematics, title blocks, paragraphs, and schedule
  // matrices that all contain locally adjacent geometry and text.
  const aligned = alignedGroups(
    pairs,
    Math.max(conservativeMaxGlyphDimPx, typicalTextHeight * 3),
    // A large assembly can occupy the normal description-column start and
    // force only its own caption farther right. Its glyph center still
    // belongs to the repeated symbol column. Permit bounded caption drift
    // proportional to the same adaptive glyph cap; separate legend columns
    // remain far beyond this window.
    Math.max(8, typicalTextHeight * 1.25, conservativeMaxGlyphDimPx * 0.5),
  );
  const groups = aligned.flatMap((indices) => splitAlignedGroupVertically(indices, pairs, lines, typicalTextHeight));
  const minAlignedRows = Math.max(1, opts.minAlignedRows ?? 2);
  const minUnheadedRows = Math.max(minAlignedRows, opts.minUnheadedRows ?? 15);
  const layoutEvidenceDisabled = minAlignedRows === 1 && minUnheadedRows === 1;
  const accepted: LegendGlyph[] = [];
  const acceptPair = (pair: PairCandidate, alignedRows: number, heading: string | null) => {
    pair.caption = canonicalLegendCaption(pair.caption);
    const kind: LegendGlyph["kind"] = isMaterialLegendHeading(heading)
      ? "annotation"
      : isDraftingAnnotationCaption(pair.caption)
      ? "annotation"
      : isControlFunctionCaption(pair.caption, heading) ? "control_function"
      : isRoutedSystemLegendHeading(heading) ? "line_style"
      : isRoutedSystemCaption(pair.caption) ? "line_style"
      : pair.kind === "line_style" && isDiscreteInstalledDeviceCaption(pair.caption) ? "symbol"
      : pair.kind === "text_symbol" ? "symbol"
      : hasMultipleSubstantialSymbols(pair, typicalTextHeight, heading, lines) ? "symbol_group" : pair.kind;
    // `seedable` means this is one physical symbol identity that may enter
    // the mandatory plan-anchor corroboration stage. It does NOT authorize
    // sweeping directly from legend-scale geometry: tagged circles/boxes
    // still preserve their caption identity while the handoff locates a
    // real occurrence on a scaled plan. Only sparse line-fragment rescues,
    // grouped variants, line keys, and annotations are barred here.
    const seedable = kind === "symbol" && pair.kind === "symbol";
    const captionBbox: [Point, Point] = [[pair.span.x0, pair.span.y0], [pair.span.x1, pair.span.y1]];
    const pairWords = new Set(pair.caption.toUpperCase().match(/[A-Z0-9]+/g) ?? []);
    const duplicate = accepted.some((glyph) => {
      if (glyph.caption === pair.caption
        && glyph.caption_bbox.flat().every((value, index) => value === captionBbox.flat()[index])) return true;
      const overlapW = Math.max(0,
        Math.min(glyph.rect[1][0], pair.rect[1][0]) - Math.max(glyph.rect[0][0], pair.rect[0][0]));
      const overlapH = Math.max(0,
        Math.min(glyph.rect[1][1], pair.rect[1][1]) - Math.max(glyph.rect[0][1], pair.rect[0][1]));
      const pairArea = Math.max(1,
        (pair.rect[1][0] - pair.rect[0][0]) * (pair.rect[1][1] - pair.rect[0][1]));
      const glyphArea = Math.max(1,
        (glyph.rect[1][0] - glyph.rect[0][0]) * (glyph.rect[1][1] - glyph.rect[0][1]));
      if (overlapW * overlapH < Math.min(pairArea, glyphArea) * 0.8) return false;
      const glyphWords = new Set(glyph.caption.toUpperCase().match(/[A-Z0-9]+/g) ?? []);
      const sharedWords = [...pairWords].filter((word) => glyphWords.has(word)).length;
      return glyph.caption.includes(pair.caption) || pair.caption.includes(glyph.caption)
        || sharedWords >= Math.min(2, pairWords.size);
    });
    if (duplicate) return;
    accepted.push({
      caption: pair.caption,
      caption_bbox: captionBbox,
      rect: pair.rect,
      segments: pair.segments,
      aligned_rows: alignedRows,
      heading,
      kind,
      seedable,
      ...(pair.members.length > 1 ? { member_rects: pair.members.map((member) => member.rect) } : {}),
      ...(kind === "line_style" ? { seed_warning: "Line-style legend keys describe routed systems, not discrete EA symbols; do not send this rect to a count sweep." } : {}),
      ...(kind === "symbol" && !seedable ? { seed_warning: "This row names a physical installed-device symbol, but the usable vector evidence is only a sparse line fragment (often because its identifying letter is PDF text); preserve the identity and do not send this incomplete rect to a count sweep." } : {}),
      ...(kind === "annotation" ? { seed_warning: "Drafting/reference annotations are legend truth, not installed devices; do not send this rect to a count sweep." } : {}),
      ...(kind === "control_function" ? { seed_warning: "This row describes a BAS point, command, control-logic, or sequence function, not a physical installed-device symbol; keep it for controls reasoning and out of EA count sweeps." } : {}),
      ...(kind === "symbol_group" ? { seed_warning: "This legend row contains multiple substantial disconnected symbols or variants; anchor each intended identity separately on a real plan before counting." } : {}),
    });
  };
  for (const indices of groups) {
    let group = withoutEmbeddedGlyphTags(
      indices.map((i) => pairs[i]), typicalTextHeight, lines, pairs, maxCaptionGapPx,
    );
    if (!group.length) continue;
    const heading = nearbyLegendHeading(group, lines, segs, typicalTextHeight);
    group = withoutTrailingNetworkDiagram(group, heading, typicalTextHeight, minAlignedRows);
    completeSpecificSectionCaptions(group, lines, heading, typicalTextHeight);
    const specificDisciplineSection = !!heading && isSpecificDisciplineLegendHeading(heading);
    const generalSection = !!heading && isGeneralDraftingLegendHeading(heading)
      && group.length >= Math.max(
        minAlignedRows,
        /^GENERAL(?:\s+SYMBOLS?)?$/i.test(heading) ? 4 : 2,
      );
    // The single word EQUIPMENT also appears as a label inside tag examples,
    // schedules, and abbreviation blocks. Unlike specific headings such as
    // FIRE ALARM or ONE-LINE DIAGRAM, it needs a substantial repeated row
    // vocabulary before it can establish legend ownership on its own.
    const requiredRows = heading === "EQUIPMENT"
      ? Math.max(4, minAlignedRows)
      : specificDisciplineSection ? 1 : heading ? minAlignedRows : minUnheadedRows;
    if (group.length < requiredRows) continue;
    const domainRows = group.filter((pair) => isHvacBasCaption(pair.caption)).length;
    const directiveRows = group.filter((pair) => isDirectiveProse(pair.caption)).length;
    const controllerPinoutRows = group.filter((pair) => isControllerPinoutCaption(pair.caption)).length;
    const domainFloor = Math.max(2, Math.ceil(group.length * 0.2));
    // A domain-specific heading is enough context. Generic SYMBOL/LEGEND
    // headings and headerless repeated columns must prove that the rows are
    // actually HVAC/BAS identities, not room tags, keynotes, materials, or
    // design-criteria values. Headerless directive prose is notes/sequence
    // truth, never glyph-caption truth, even when its numbering is regular.
    if (!layoutEvidenceDisabled && !generalSection
      && (!heading || (!isDomainHeading(heading) && !specificDisciplineSection))
      && domainRows < domainFloor) continue;
    if (!layoutEvidenceDisabled && generalSection && directiveRows / group.length > 0.15) continue;
    if (!layoutEvidenceDisabled && !heading && directiveRows / group.length > 0.15) continue;
    if (!layoutEvidenceDisabled && !heading
      && controllerPinoutRows >= Math.max(3, Math.ceil(group.length * 0.3))) continue;
    for (const pair of group) acceptPair(pair, group.length, heading);
  }
  for (const material of materialGroups) {
    for (const pair of material.pairs) {
      acceptPair(pair, material.pairs.length, material.heading);
    }
  }
  for (const { zone, pairs: tagPairs } of tagCallouts) {
    if (!layoutEvidenceDisabled && tagPairs.length < minAlignedRows) continue;
    for (const pair of tagPairs) {
      acceptPair(pair, tagPairs.length, normalizedCaption(zone.heading.text));
    }
  }
  const acceptedClaims = accepted.map((glyph) => ({
    caption: glyph.caption,
    span: {
      text: glyph.caption,
      x0: glyph.caption_bbox[0][0], y0: glyph.caption_bbox[0][1],
      x1: glyph.caption_bbox[1][0], y1: glyph.caption_bbox[1][1],
    },
    rect: glyph.rect,
  }));
  const legendCallouts = tagCalloutPairs(
    segs, lines, rawSpans, typicalTextHeight, maxGlyphDimPx,
    maxLineStyleDimPx, sectionDividers,
    (text, span) => isLegendHeadingText(text) && !isTagCalloutHeading(text)
      && !isMaterialLegendHeading(text)
      // Below-caption RCP/P&ID grids have a dedicated ownership path that
      // preserves multiple renditions in one cell. A generic callout pass
      // would claim one component first and collapse the later group.
      && !isBelowCaptionLegendHeading(text)
      // Bare SYMBOL is also a ubiquitous schedule field header. Structured
      // SYMBOL/DESCRIPTION tables and normal repeated-column pairing already
      // handle legitimate uses; it cannot safely establish a callout zone.
      && !/^SYMBOL$/i.test(normalizedCaption(text))
      && (/(?:SYMBOLS?|LEGEND|NOTATIONS?|POINT\s+FUNCTION)/i.test(text)
        || span.y1 - span.y0 >= typicalTextHeight * 1.5)
      && !accepted.some((glyph) => glyph.caption_bbox.flat().every((value, index) =>
        value === [span.x0, span.y0, span.x1, span.y1][index]))
      // One text span cannot simultaneously be the centered caption of a
      // proven glyph-above cell and a new callout-zone heading. This resolves
      // object labels such as LIGHT FIXTURES without weakening ordinary
      // section-title handling elsewhere on the sheet.
      && !belowPaired.pairs.some((pair) => pair.span.x0 === span.x0
        && pair.span.y0 === span.y0 && pair.span.x1 === span.x1 && pair.span.y1 === span.y1)
      && !tagCallouts.some(({ zone }) => {
        const centerX = (span.x0 + span.x1) / 2;
        const centerY = (span.y0 + span.y1) / 2;
        return centerX >= zone.left && centerX <= zone.right
          && centerY >= zone.top && centerY <= zone.bottom;
      }),
    isLegendCalloutCaption,
    acceptedClaims,
  );
  for (const { zone, pairs: calloutPairs } of legendCallouts) {
    if (!layoutEvidenceDisabled && calloutPairs.length < minAlignedRows) continue;
    for (const pair of calloutPairs) {
      acceptPair(pair, calloutPairs.length, normalizedCaption(zone.heading.text));
    }
  }
  for (const { group, heading } of headedBelowCaptionGroups(
    belowPaired.pairs, pairs, lines, segs, typicalTextHeight, maxCaptionGapPx,
    minAlignedRows, layoutEvidenceDisabled,
  )) {
    for (const pair of group) acceptPair(pair, group.length, heading);
  }
  accepted.sort((a, b) => a.rect[0][1] - b.rect[0][1] || a.rect[0][0] - b.rect[0][0] || a.caption.localeCompare(b.caption));
  return accepted;
}
