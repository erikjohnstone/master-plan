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
  if (w / h >= 7) return w <= maxLineStyleDim;
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
  includeBelowCaptions = false,
): number[] {
  const boxes = spans.flatMap((s) => {
    const rightCaptionBox = {
      x0: s.x0 - maxCaptionGapPx - maxGlyphDimPx,
      x1: s.x0,
      y0: s.y0 - maxGlyphDimPx * 1.5,
      y1: s.y1 + maxGlyphDimPx * 1.5,
    };
    if (!includeBelowCaptions) return [rightCaptionBox];
    // RCP and device-cell legends center symbols ABOVE their descriptions.
    // Search only a finite page-scaled band above each text run. This is
    // enabled only on pages that actually declare a legend/symbol section,
    // preserving the narrow plan-sheet fast path and avoiding arbitrary
    // plan labels becoming candidate anchors.
    return [rightCaptionBox, {
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
      const separator = s.x0 - cur.x1 > 10 ? " " : "";
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
  kind: "symbol" | "line_style";
  /** Physical legend layout. Most legends put the caption to the glyph's
   * right; RCP/fire/electrical cell legends commonly center it below. */
  layout: "right" | "below";
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

function isLegendHeadingText(text: string): boolean {
  const normalized = normalizedCaption(text);
  if (normalized.length > 80) return false;
  const words = normalized.split(/\s+/).filter(Boolean).length;
  const shortDeclarativeHeading = words <= 8
    && /\b(?:LEGEND|SYMBOLS?|NOTATIONS?)\b/i.test(normalized)
    // Definition prose inside a legend routinely says "symbol indicates".
    // Even when that fragment is only eight words long, it is a caption
    // continuation rather than a nested heading.
    && !/\b(?:SEE|REFER\s+TO|LEGEND\s+NOTES?|NOTE\s*\d+|INDICATES?)\b/i.test(normalized);
  return shortDeclarativeHeading
    || /^SYMBOL$/i.test(normalized)
    || /^(?:(?:CONTROL|HVAC|MECHANICAL|ELECTRICAL|SYSTEM|DEVICE|NETWORK)\s+)?COMPONENTS$/i.test(normalized)
    || /\bPOINT\s+FUNCTION(?:\s+SCHEDULE)?\b/i.test(normalized)
    || /^(?:GENERAL|LIGHTING|EQUIPMENT|ONE-LINE\s+DIAGRAM|POWER\s+DEVICES|POWER\s+DISTRIBUTION\s+EQUIPMENT|TELEPHONE\s*(?:&|AND)\s*DATA\s+SYSTEMS|FIRE\s+ALARM|LIGHTNING\s+PROTECTION\s+AND\s+GROUNDING|WIRE,?\s+CONDUIT\s+AND\s+RACEWAY|EQUIPMENT\s+CONNECTIONS)$/i.test(normalized)
    || /^(?:DUCTWORK|PIPING|(?:DUCTWORK|PIPING)\s+SYSTEM\s+ABBREVIATIONS|VALVES?(?:\s+AND\s+PIPING\s+ACCESSORIES)?|DUCTWORK\s+ACCESSORIES|AIR\s+DISTRIBUTION\s+DEVICES|GRILLES?[,\s]+REGISTERS?\s*(?:&|AND)\s*DIFFUSERS?(?:\s+TAGS?)?|MECHANICAL\s+EQUIPMENT\s+TAGS?|DAMPER\s+TAGS?)$/i.test(normalized);
}

/** A named MEP discipline section is stronger ownership evidence than a
 * generic SYMBOLS/GENERAL header. These labels describe a bounded symbol
 * vocabulary and may legitimately contain only one row (for example one
 * wireless-access-point mark between adjacent ruled section headings). */
function isSpecificDisciplineLegendHeading(text: string): boolean {
  return /^(?:LIGHTING|EQUIPMENT|ONE-LINE\s+DIAGRAM|POWER\s+DEVICES|POWER\s+DISTRIBUTION\s+EQUIPMENT|TELEPHONE\s*(?:&|AND)\s*DATA\s+SYSTEMS|FIRE\s+ALARM|LIGHTNING\s+PROTECTION\s+AND\s+GROUNDING|WIRE,?\s+CONDUIT\s+AND\s+RACEWAY|EQUIPMENT\s+CONNECTIONS)$/i.test(normalizedCaption(text));
}

/** Below-caption cell recovery is a specialized reflected-ceiling topology.
 * A generic LEGEND/SYMBOLS heading is not sufficient: ordinary mechanical
 * sheets often have a conventional right-caption legend near the top and a
 * title block or control diagram elsewhere whose boxes happen to sit above
 * short text. Restricting this alternate orientation to semantic RCP
 * headings is document-general (not project/page keyed) and keeps those
 * remote structures out of legend ownership. */
function isBelowCaptionLegendHeading(text: string): boolean {
  const normalized = normalizedCaption(text);
  const namesReflectedCeiling = /\bRCP\b/i.test(normalized)
    || /\bREFLECTED\s+CEILING(?:\s+PLAN)?\b/i.test(normalized);
  // Notes such as "refer to architectural reflected ceiling plans" are
  // common on mechanical sheets. They name another drawing but do not
  // declare local legend ownership.
  return namesReflectedCeiling && /\b(?:LEGEND|SYMBOLS?)\b/i.test(normalized);
}

/** Domain evidence is required when a heading is generic (plain SYMBOLS)
 * or absent. This is deliberately a component/system vocabulary, not a
 * project token list: it separates HVAC/BAS legend captions from room-tag,
 * keynote, structural-material, design-criteria, and title-block columns. */
function isHvacBasCaption(text: string): boolean {
  return /\b(?:ACCESS\s+POINT|ACTUATOR|AIR|AIRFLOW|ALARM|ANALOG|BACNET|BAS|BOILER|BREAKER|CHILLER|CIRCUIT|COIL|CONDUCTOR|CONDUIT|CONNECTION|CONTROL|CONTROLLER|DAMPER|DDC|DIFFUSER|DIGITAL|DISCONNECT|DRIVE|DUCT|ELECTRICAL|EQUIPMENT|EXHAUST|FAN|FILTER|FIRE|FIXTURE|FLOW|GAUGE|GENERATOR|GRILLE|GROUND|GROUNDING|HEAT|HUMIDITY|INPUT|JUNCTION|LIGHTING|LOUVER|METER|MOTOR|NETWORK|OUTLET|OUTPUT|PANELBOARD|PIPE|PIPING|PNEUMATIC|POWER|PRESSURE|PUMP|RACEWAY|RECEPTACLE|REFRIGERANT|REGISTER|REGULATOR|RELAY|RETURN|SENSOR|SIGNAL|SMOKE|STEAM|SUPPLY|SWITCH|TEMPERATURE|TERMINAL|THERMOSTAT|TRANSFORMER|TRANSMITTER|VALVE|VENT|VFD|VOLTAGE|WATER|WIRE|WIRELESS)\b/i.test(normalizedCaption(text));
}

function isDomainHeading(text: string): boolean {
  return /\b(?:AIR|BAS|CONDUIT|CONNECTION|CONTROL|DATA|DDC|DAMPER|DUCT|ELECTRICAL|EQUIPMENT|FIRE|GROUNDING|HVAC|LIGHTING|MECHANICAL|PIPING|POINT|POWER|RACEWAY|SENSING|TELEPHONE|VALVE|WIRE)\b/i.test(normalizedCaption(text));
}

function isSectionBoundaryText(text: string): boolean {
  const normalized = normalizedCaption(text);
  if (!normalized || normalized.length > 100) return false;
  return isLegendHeadingText(normalized)
    // Mentions inside a row description are not boundaries: "see equipment
    // connection schedule" is a common legend caption. Require heading-like
    // text whose final phrase itself names the next section.
    || /^(?:(?:[A-Z0-9&/,\-]+\s+){0,5})?(?:ABBREVIATIONS?|DESIGN\s+CRITERIA|GENERAL\s+(?:PROJECT|MECHANICAL|HVAC|CONTROL)\s+NOTES?|IDENTIFICATION|INDENTIFICATION|LEGEND\s+NOTES?|SCHEDULES?|SEQUENCES?(?:\s+OF\s+OPERATIONS?)?)$/i.test(normalized);
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

/** True legend rows can describe drawing-navigation/status conventions
 * rather than installed work. Preserve them as auditable legend truth, but
 * never promote them to discrete Symbol Sweep seeds. */
function isDraftingAnnotationCaption(text: string): boolean {
  const normalized = normalizedCaption(text).replace(/^[\s\-–—]+/, "");
  // Reflected-ceiling legends also explain drawing conventions and finish
  // swatches. These rows are valuable legend truth, but they do not identify
  // discrete installed devices and must never become EA sweep seeds.
  if (/^INDICATES\s+BRACKET\b/i.test(normalized)
    || /^(?:CEILING\s+HEIGHT|EXPOSED\s+CEILING)$/i.test(normalized)
    || /^(?:(?:\d+(?:\.\d+)?\s*['"]?\s*[x×]\s*\d+(?:\.\d+)?\s*['"]?\s+)?ACOUSTICAL\s+(?:TILE|PANEL).*\bCEILING|(?:GWB|GYPSUM(?:\s+BOARD)?)\s+CEILING(?:\s*\/\s*SOFFIT)?|(?:EXT(?:ERIOR)?\s+)?EIFS\b.*\bCEILING)$/i.test(normalized)) return true;
  return /^(?:REVISION\s+(?:REFERENCE|MARKER|NUMBER|TAG)|DETAIL\s+(?:REFERENCE|MARKER|NUMBER|TAG|CALLOUT)|SHEET\s+NOTE(?:\s+(?:CALLOUT|TAG))?|(?:FEEDER|(?:MECHANICAL\s+)?EQUIPMENT)\s+CALLOUT|HOME\s+RUN|HOMERUNS?\s+TO\s+PANEL(?:BOARD)?\b|CONDUIT,?\s*(?:VERTICAL\s+TRANSITION|CAPPED)|DUCTWORK\s+(?:BREAK|OR\s+PIPING\s+RISE)|INTAKE\s+OR\s+EXHAUST|(?:DIRECTION\s+OF\s+(?:AIRFLOW|FLOW)|FLOW\s+DIRECTION)|(?:SUPPLY|RETURN,?\s+EXHAUST,?\s+OR\s+TRANSFER)\s+AIRFLOW|(?:INCLINED\s+RISE|DECLINED\s+DROP)\s+WITH\s+RESPECT\s+TO\s+AIRFLOW|(?:UPWARD|DOWNWARD)\s+DIRECTION\s+OF\s+SLOPED\s+PIPING|NEW\s+TO\s+EXISTING\s+CONNECTION\s+POINT|SLOPE\s+PIPE\s+IN\s+DIRECTION\s+OF\s+ARROW|AIR\s+DISTRIBUTION\s+TAG|AIR\s+DEVICE\s+TYPE\.\s+REFER\s+TO\s+SCHEDULE\b.*\bAIR\s+DEVICE\s+WITH\s+(?:ROUND|RECTANGULAR)\s+NECK\s+TAG|(?:LIGHTING\s+FIXTURE|RECEPTACLE\s+DEVICE)\s+TAGS?\b|ELECTRICAL\s+EQUIPMENT\s+AND\s+TAGS\b|DEVIATIONS?\s+OF\s+(?:THE\s+)?ABOVE\s+RECEPTACLE\s+TYPES?\b|[•\-]?\s*INTERNAL\s+(?:GROUND|ARC)\s+FAULT\b|CONTROL\s+ELEMENT\s+TAG|POINT\s+NAME'?S\s+(?:IDENTIFICATION|INDENIFICATION|NUMBER)|(?:DEMOLITION|CONSTRUCTION)\s+NOTE\s+IDENTIFICATION|PLAN\s+REFERENCE\s+NOTE\s+SYMBOL|POINT\s+OF\s+(?:DEMOLITION|CONNECTION,?\s+NEW-TO-EXISTING)\b|CHANGE\s+OF\s+ELEVATION|ROOM\s+(?:TAG|NAME|NUMBER)|PLAN\s+(?:NOTE|NORTH)|CONTINUATION\s+SYMBOL|POINT\s+WHERE\s+NEW\s+CONNECTS\s+TO\s+EXISTING|AREA\s+NOT\s+IN\s+CONTRACT|ITEM\s+TO\s+BE\s+DEMOLISHED|CONNECT\s+TO\s+EXISTING|CONNECT\s+NEW\s+TO\s+EXISTING|(?:DISCONNECT|CONNECT)\s+CONDUCTORS\s+(?:FROM|TO)\s+EQUIPMENT|REMOVE\s+TO\s+THIS\s+POINT|DEMOLISH\s+TO\s+POINT\s+INDICATED|DEMOLITION\b|EXISTING\s+TO\s+REMAIN|DIRECTION\s+OF\s+AIR\s*FLOW|STEEL\s+BARS\s+AS\s+REQUIRED|KEY(?:ED)?\s+(?:CONSTRUCTION\s+)?NOTE|INTERLOCK\s+TO\b|CONNECTION\s+TO\s+(?:CONDUCTOR|STRUCTURE)\b|CONNECTION\s+TO\b.*\b(?:BAS|CONTROL|DDC)\b|EQUIPMENT\s+CONNECTION\s+AS\s+NOTED\b)/i.test(normalized);
}

/** Captions that name a routed medium or drafting line convention rather
 * than one countable installed device. Geometry alone cannot distinguish a
 * hooked/dashed piping swatch from a compact symbol because CAD line keys
 * often contain end hooks and inline system codes. */
function isRoutedSystemCaption(text: string): boolean {
  const normalized = normalizedCaption(text);
  // A caption may mention the medium only to locate a discrete device or
  // describe a directional marker. The terminal word PIPING must not erase
  // that stronger identity (e.g. VALVE IN VERTICAL PIPING). Do not exempt
  // every caption containing DRAIN: CONDENSATE DRAIN PIPING and STORM DRAIN
  // are themselves routed media.
  if (/\bDIRECTION\b/i.test(normalized)
    || /\b(?:ACTUATOR|CLEANOUT|DAMPER|DETECTOR|DIFFUSER|FAN|FILTER|GAUGE|GRILLE|LOUVER|METER|PANELBOARD|PUMP|REGISTER|REGULATOR|RELAY|SENSOR|STARTER|STRAINER|SWITCH|THERMOSTAT|TRANSMITTER|VALVE|VFD)\b\s+(?:IN|ON)\b.*\b(?:PIPING|LINE)$/i.test(normalized)) return false;
  return /\b(?:PIPING|LINE|SEWER)$/i.test(normalized)
    || /^(?:LPS\s+(?:ROOF|MAIN\s+DOWN)\s+CONDUCTOR|GROUND\s+RING\b.*\bCONDUCTOR|BRANCH\s+CIRCUIT\s+OR\s+FEEDER\s+WIRING\s+IN\s+CONDUIT\b)/i.test(normalized)
    || /^PANEL,?\s+SWITCHBOARD,?\s+OR\s+BUSD?UCT\b/i.test(normalized)
    || /^(?:VENT|DUCTWORK|STORM\s+DRAIN)$/i.test(normalized)
    || /^(?:(?:SUPPLY|RETURN|EXHAUST|TRANSFER|OUTDOOR)\s+AIR|CONDENSATE\s+DRAIN|REFRIGERANT\s+SUCTION\s*\/\s*LIQUID)$/i.test(normalized)
    || /^(?:RECTANGULAR\s+DUCT(?:\s+RECTANGULAR\s+DUCT\s+WIDTH.*)?|ROUND\s+DUCT(?:\s+ROUND\s+DUCT\s+DIAMETER.*)?|PIPE(?:\s+PIPE\s*\(DIAMETER.*)?|FLEXIBLE\s+DUCT|ACOUSTICALLY\s+LINED\s+DUCTWORK)$/i.test(normalized)
    || /\b(?:CHILLED|CONDENSER|HEATING|GEOTHERMAL|DOMESTIC|TEMPERED)\s+(?:(?:HOT|COLD)\s+)?WATER(?:\s+(?:SUPPLY|RETURN))?(?:\s*\([^)]*\))?$/i.test(normalized)
    || /\b(?:LOW|MEDIUM|HIGH)\s+PRESSURE\s+NATURAL\s+GAS$/i.test(normalized);
}

/** A physical device can be drawn with almost no usable vector ink when its
 * identifying letter is PDF text (motorized dampers and cleanout callouts
 * are common). Preserve the installed-device identity as `symbol`, but keep
 * the sparse line fragment out of Symbol Sweep by leaving it nonseedable. */
function isDiscreteInstalledDeviceCaption(text: string): boolean {
  return /\b(?:ACTUATOR|ARRESTOR|CLEANOUT|DAMPER|DETECTOR|DIFFUSER|DRAIN|FAN|FILTER|GAUGE|GRILLE|HUMIDISTAT|LOUVER|METER|PANELBOARD|PUMP|REGISTER|REGULATOR|RELAY|SENSOR|SINK|STARTER|STRAINER|SWITCH|THERMOSTAT|TRANSMITTER|VALVE|VFD)\b/i.test(normalizedCaption(text));
}

/** BAS legends also contain logical/sequence identities that matter to a
 * controls takeoff but are not physical plan symbols. Preserve them for
 * point/sequence reasoning while explicitly barring their diagram marks
 * from an EA Symbol Sweep. */
function isControlFunctionCaption(text: string, heading: string | null = null): boolean {
  const normalized = normalizedCaption(text);
  return /\b(?:SEE\s+SEQUENCE\s+OF\s+OPERATION|REMOTE\s+GRAPHICS\s+WORKSTATION|ENERGY\s+CONTROL\s+CENTER|CONTROLLING\s+EQUIPMENT\s+ON\s+A\s+SCHEDULE)\b/i.test(normalized)
    || /^(?:AUXILIARY\s+CONTACT|(?:ANALOG|BINARY|DIGITAL|CURRENT|VOLTAGE)\s+(?:INPUT|OUTPUT)|ENABLE\s*\/\s*DISABLE|SET\s+POINT|START\s*\/\s*STOP)$/i.test(normalized)
    || (/\bCONTROLS?\b/i.test(heading || "") && /^(?:RESET|DIFFERENTIAL\s+PRESSURE)$/i.test(normalized));
}

function meaningfulCaption(text: string): boolean {
  const normalized = normalizedCaption(text);
  const alnum = normalized.match(/[A-Z0-9]/gi)?.length ?? 0;
  if (alnum < 2) return false;
  // A point matrix's repeated X marks are cell values, never descriptions.
  if (/^(?:X+)(?:\s+X+)*$/i.test(normalized)) return false;
  return true;
}

/** CAD exports frequently expose the same visible lettering twice: once as
 * extractable text and once as short vector strokes. Without this guard, an
 * abbreviation's outlined letters become a fake "glyph" and the definition
 * to their right becomes its caption; point-matrix X marks fail identically.
 * A real tagged symbol (circle-T, boxed-AI, etc.) extends materially outside
 * its inner text span, so it is retained. */
function resemblesExtractedText(
  rect: [Point, Point], rawSpans: LegendSpan[], segmentCount?: number,
): boolean {
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
    return segmentCount === 4
      && /^[A-Z0-9][A-Z0-9./_-]{1,11}$/i.test(normalizedCaption(s.text))
      && w >= sh * 1.8
      && w <= sw + sh
      && Math.abs(cx - (s.x0 + s.x1) / 2) <= sh * 0.5
      && x0 <= s.x0 - horizontalMargin && x1 >= s.x1 + horizontalMargin
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
  return componentArea / unionArea <= 1.5
    && x0 >= ux0 - tol && x1 <= ux1 + tol && y0 >= uy0 - tol && y1 <= uy1 + tol;
}

function pairCandidates(
  candidates: GlyphCandidate[],
  spans: LegendSpan[], rawSpans: LegendSpan[], maxCaptionGapPx: number,
  typicalTextHeight: number, preferBelowCaptions = false,
): { pairs: PairCandidate[]; usedSpans: Set<number> } {
  type Edge = { candidate: number; span: number; score: number; gap: number };
  const edges: Edge[] = [];
  for (let ci = 0; ci < candidates.length; ci++) {
    const cand = candidates[ci];
    if (resemblesExtractedText(cand.rect, rawSpans, cand.segments)) continue;
    const [[x0, y0], [x1, y1]] = cand.rect;
    const centerY = (y0 + y1) / 2;
    const margin = Math.max((y1 - y0) * 0.5, typicalTextHeight * 0.75);
    for (let si = 0; si < spans.length; si++) {
      const s = spans[si];
      if (!meaningfulCaption(s.text) || s.x0 < x1) continue;
      if (s.y1 < y0 - margin || s.y0 > y1 + margin) continue;
      const gap = s.x0 - x1;
      if (gap > maxCaptionGapPx) continue;
      const short = normalizedCaption(s.text);
      const shortWords = short.split(/\s+/).length;
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
        if (rowOverlap <= 0 && Math.abs((s.y0 + s.y1 - other.y0 - other.y1) / 2) > typicalTextHeight * 0.6) return false;
        return other.x0 - s.x0 <= Math.max(200, typicalTextHeight * 8)
          && other.x0 - x1 <= maxCaptionGapPx;
      });
      if (shadowedByDescription) continue;
      const spanCenterY = (s.y0 + s.y1) / 2;
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
      const betterCaptionBelow = preferBelowCaptions && spans.some((other, oi) => {
        if (oi === si || !meaningfulCaption(other.text) || isLegendHeadingText(other.text)) return false;
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
  alreadyClaimed: PairCandidate[],
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
      if (!meaningfulCaption(span.text) || isLegendHeadingText(span.text)) continue;
      // Vertical/rotated section labels and table dividers are context, not
      // below-glyph descriptions.
      if (span.y1 - span.y0 > typicalTextHeight * 2.2) continue;
      const gap = span.y0 - y1;
      if (gap < -typicalTextHeight * 0.15 || gap > maxVerticalGap) continue;
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

function hasMultipleSubstantialSymbols(
  pair: PairCandidate, typicalTextHeight: number, heading: string | null,
): boolean {
  if (pair.kind !== "symbol" || pair.members.length < 2) return false;
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
    || /\b(?:DOWN\s*\/\s*UP|UP\s*\/\s*DOWN)\b/i.test(pair.caption)
    || /\bRISE\b.*\bDROP\b/i.test(pair.caption)
    || /\bACCESS\s+DOOR\b.*\bACCESS\s+PANEL\b/i.test(pair.caption)
    // Fixture keys commonly draw the ceiling rendition, the wall/bracket
    // rendition, and optional face/direction variants side by side under
    // one caption. Those are a vocabulary group, never one sweep template.
    || /\bINDICATES\s+BRACKET,?\s+WALL\s+MOUNTED\s+FIXTURES?\b/i.test(pair.caption)
    || /\b(?:ARROW,?\s+WHEN\s+USED|QUADRANT\(S\)\s+OF\s+SYMBOL)\b/i.test(pair.caption);
  const hasExplicitVariantColumns = /^(?:DUCTWORK|PIPING)$/i.test(heading || "")
    || (!!heading && isSpecificDisciplineLegendHeading(heading));
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
      for (let pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
        const pair = pairs[pairIndex];
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
        const isBelow = belowGap >= -1;
        const gap = sameLineContinuation ? horizontalGap
          : Math.max(0, isBelow ? belowGap : aboveGap);
        if (!sameLineContinuation && !isBelow && aboveGap < -1) continue;
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
            prepend: sameLineContinuation ? false : !isBelow,
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
      if (ownedLines >= maxWrapLines) break;
      if (ownedLines + next.captionLines > maxWrapLines) continue;
      if (Math.abs(next.span.x0 - current.span.x0) > maxIndentDriftPx) continue;
      const lineGap = next.span.y0 - current.span.y1;
      if (lineGap < 0 || lineGap > maxLineGapPx) continue;
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
      const semanticContinuation = isDraftingAnnotationCaption(current.caption)
        && /\b(?:ASSIGNED|FOLLOWING|INCLUDING|WITH|AND|OR|TO|FROM|OF|FOR|THE)\s*[:;,(-]?\s*$/i.test(current.caption)
        && unionH <= Math.min(maxGlyphDimPx, typicalTextHeight * 3.25)
        && glyphVerticalGap <= typicalTextHeight * 0.5;
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
      if (glyphVerticalGap > typicalTextHeight * 0.4
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
function withoutEmbeddedGlyphTags(group: PairCandidate[], typicalTextHeight: number): PairCandidate[] {
  if (group.length < 3) return group;
  const captionStart = median(group.map((pair) => pair.span.x0));
  const glyphRights = group.map((pair) => pair.rect[1][0]).sort((a, b) => a - b);
  const glyphColumnRight = glyphRights[Math.floor((glyphRights.length - 1) * 0.9)];
  const materialLeftShift = Math.max(6, typicalTextHeight * 0.75);
  const glyphEnvelopeSlack = typicalTextHeight * 0.25;
  return group.filter((pair) => {
    const caption = normalizedCaption(pair.caption);
    const terseTag = caption.length <= 8
      && /^[A-Z0-9][A-Z0-9./_-]*(?:\s+[A-Z0-9./_-]+)?$/.test(caption);
    if (!terseTag) return true;
    const shiftedIntoGlyphColumn = pair.span.x0 < captionStart - materialLeftShift
      && pair.span.x0 <= glyphColumnRight + glyphEnvelopeSlack;
    return !shiftedIntoGlyphColumn;
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

function nearbyLegendHeading(group: PairCandidate[], lines: LegendSpan[], typicalTextHeight: number): string | null {
  const gx0 = Math.min(...group.map((p) => p.rect[0][0]));
  const gx1 = Math.max(...group.map((p) => p.span.x1));
  const glyphCenterX = median(group.map((p) => (p.rect[0][0] + p.rect[1][0]) / 2));
  const captionColumnX = median(group.map((p) => p.span.x0));
  const firstY = Math.min(...group.map((p) => Math.min(p.rect[0][1], p.span.y0)));
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
  const candidates = lines.filter((s) => {
    if (!isLegendHeadingText(s.text) || s.y1 > firstY + typicalTextHeight) return false;
    // A heading identifies the section directly beneath it, not every
    // aligned diagram cluster hundreds of text-heights later. Real reviewed
    // loose and bordered legends place their first row within ten local text
    // heights; the larger former window let a top-right DDC legend bless a
    // separate network architecture diagram below it.
    if (firstY - s.y1 > Math.max(typicalTextHeight * 10, 120) && !hasCaptionColumnBridge(s)) return false;
    const margin = typicalTextHeight * 5;
    const headingCenterX = (s.x0 + s.x1) / 2;
    const supportsGlyph = glyphCenterX >= s.x0 - margin && glyphCenterX <= s.x1 + margin;
    const supportsWholeColumn = headingCenterX >= gx0 - margin && headingCenterX <= gx1 + margin;
    if (!supportsGlyph && !supportsWholeColumn) return false;
    // A closer section title ends the preceding heading's jurisdiction.
    // Without this, "MECHANICAL PIPING LEGEND" can bless callout labels in
    // an "AIR DISTRIBUTION DEVICE IDENTIFICATION" panel underneath it.
    return !lines.some((other) => other !== s
      && isSectionBoundaryText(other.text)
      && other.y0 > s.y1 + typicalTextHeight * 0.2
      && other.y1 < firstY - typicalTextHeight * 0.2
      && ((glyphCenterX >= other.x0 - margin && glyphCenterX <= other.x1 + margin)
        || (((other.x0 + other.x1) / 2) >= gx0 - margin && ((other.x0 + other.x1) / 2) <= gx1 + margin)));
  });
  const horizontalDistance = (s: LegendSpan) => s.x1 < gx0 ? gx0 - s.x1 : s.x0 > gx1 ? s.x0 - gx1 : 0;
  candidates.sort((a, b) => (firstY - a.y1) - (firstY - b.y1) || horizontalDistance(a) - horizontalDistance(b) || a.x0 - b.x0);
  return candidates.length ? normalizedCaption(candidates[0].text) : null;
}

/** Assign below-caption cells to the explicit legend heading whose
 * horizontal jurisdiction contains them. A cell legend is a two-dimensional
 * grid rather than one repeated x-column, so ordinary alignedGroups cannot
 * establish it. Requiring an extractable heading, a finite horizontal
 * reach, repeated cells, and HVAC/BAS domain density keeps arbitrary plan
 * labels, schedules, and nearby symbology panels out. */
function headedBelowCaptionGroups(
  pairs: PairCandidate[], rightPairs: PairCandidate[], lines: LegendSpan[], typicalTextHeight: number,
  maxCaptionGapPx: number, minAlignedRows: number, layoutEvidenceDisabled: boolean,
): Array<{ group: PairCandidate[]; heading: string }> {
  const headings = lines.map((span, index) => ({ span, index }))
    .filter(({ span }) => isLegendHeadingText(span.text));
  const grouped = new Map<number, PairCandidate[]>();
  for (const pair of pairs) {
    const x0 = Math.min(pair.rect[0][0], pair.span.x0);
    const x1 = Math.max(pair.rect[1][0], pair.span.x1);
    const top = Math.min(pair.rect[0][1], pair.span.y0);
    const supported = headings.filter(({ span }) => {
      if (span.y1 >= top) return false;
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
    if (group.length < minAlignedRows) continue;
    const heading = normalizedCaption(lines[headingIndex].text);
    const domainRows = group.filter((pair) => isHvacBasCaption(pair.caption)).length;
    const domainFloor = Math.max(2, Math.ceil(group.length * 0.2));
    if (!layoutEvidenceDisabled && !isDomainHeading(heading) && domainRows < domainFloor) continue;

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
  // itself is compact. Keep the finite 220px ceiling, but allow that real
  // row topology instead of clipping at the former ten-height bound.
  const maxGlyphDimPx = opts.maxGlyphDimPx ?? Math.max(80, Math.min(220, typicalTextHeight * 12));
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
  const maxWrapIndentPx = opts.maxWrapIndentPx ?? Math.max(5, Math.min(64, typicalTextHeight * 2.5));

  const hasBelowCaptionLegendHeading = lines.some((line) => isBelowCaptionLegendHeading(line.text));
  const relevantSegs = segmentsNearCaptions(
    segs, spans, maxGlyphDimPx, maxCaptionGapPx, hasBelowCaptionLegendHeading,
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

  const paired = pairCandidates(
    candidates, spans, rawSpans, maxCaptionGapPx, typicalTextHeight,
    hasBelowCaptionLegendHeading,
  );
  const reunitedPairs = mergeDownshiftedGlyphFragments(
    paired.pairs, typicalTextHeight, maxGlyphDimPx, gridPx, rawSpans,
    maxWrapGapPx, maxWrapIndentPx, maxWrapLines,
  );
  expandLineStylePairs(reunitedPairs, candidates, rawSpans, gridPx, typicalTextHeight, maxLineStyleDimPx);
  expandSymbolPairs(reunitedPairs, candidates, rawSpans, typicalTextHeight, maxGlyphDimPx);
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
  const pairs = withoutContainedDetailPairs(mergedPairs, typicalTextHeight, maxWrapGapPx);
  const belowPaired = hasBelowCaptionLegendHeading
    ? pairCandidatesBelow(
      candidates, spans, rawSpans, maxCaptionGapPx, typicalTextHeight,
      pairs,
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
    Math.max(maxGlyphDimPx, typicalTextHeight * 3),
    // A large assembly can occupy the normal description-column start and
    // force only its own caption farther right. Its glyph center still
    // belongs to the repeated symbol column. Permit bounded caption drift
    // proportional to the same adaptive glyph cap; separate legend columns
    // remain far beyond this window.
    Math.max(8, typicalTextHeight * 1.25, maxGlyphDimPx * 0.5),
  );
  const groups = aligned.flatMap((indices) => splitAlignedGroupVertically(indices, pairs, lines, typicalTextHeight));
  const minAlignedRows = Math.max(1, opts.minAlignedRows ?? 2);
  const minUnheadedRows = Math.max(minAlignedRows, opts.minUnheadedRows ?? 15);
  const layoutEvidenceDisabled = minAlignedRows === 1 && minUnheadedRows === 1;
  const accepted: LegendGlyph[] = [];
  const acceptPair = (pair: PairCandidate, alignedRows: number, heading: string | null) => {
    const kind: LegendGlyph["kind"] = isDraftingAnnotationCaption(pair.caption)
      ? "annotation"
      : isControlFunctionCaption(pair.caption, heading) ? "control_function"
      : isRoutedSystemCaption(pair.caption) ? "line_style"
      : pair.kind === "line_style" && isDiscreteInstalledDeviceCaption(pair.caption) ? "symbol"
      : hasMultipleSubstantialSymbols(pair, typicalTextHeight, heading) ? "symbol_group" : pair.kind;
    // `seedable` means this is one physical symbol identity that may enter
    // the mandatory plan-anchor corroboration stage. It does NOT authorize
    // sweeping directly from legend-scale geometry: tagged circles/boxes
    // still preserve their caption identity while the handoff locates a
    // real occurrence on a scaled plan. Only sparse line-fragment rescues,
    // grouped variants, line keys, and annotations are barred here.
    const seedable = kind === "symbol" && pair.kind === "symbol";
    const captionBbox: [Point, Point] = [[pair.span.x0, pair.span.y0], [pair.span.x1, pair.span.y1]];
    const duplicate = accepted.some((glyph) => glyph.caption === pair.caption
      && glyph.caption_bbox.flat().every((value, index) => value === captionBbox.flat()[index]));
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
    let group = withoutEmbeddedGlyphTags(indices.map((i) => pairs[i]), typicalTextHeight);
    if (!group.length) continue;
    const heading = nearbyLegendHeading(group, lines, typicalTextHeight);
    group = withoutTrailingNetworkDiagram(group, heading, typicalTextHeight, minAlignedRows);
    completeSpecificSectionCaptions(group, lines, heading, typicalTextHeight);
    const specificDisciplineSection = !!heading && isSpecificDisciplineLegendHeading(heading);
    const generalSection = heading === "GENERAL" && group.length >= 4;
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
    const domainFloor = Math.max(2, Math.ceil(group.length * 0.2));
    // A domain-specific heading is enough context. Generic SYMBOL/LEGEND
    // headings and headerless repeated columns must prove that the rows are
    // actually HVAC/BAS identities, not room tags, keynotes, materials, or
    // design-criteria values. Headerless directive prose is notes/sequence
    // truth, never glyph-caption truth, even when its numbering is regular.
    if (!layoutEvidenceDisabled && !generalSection
      && (!heading || !isDomainHeading(heading)) && domainRows < domainFloor) continue;
    if (!layoutEvidenceDisabled && generalSection && directiveRows / group.length > 0.15) continue;
    if (!layoutEvidenceDisabled && !heading && directiveRows / group.length > 0.15) continue;
    for (const pair of group) acceptPair(pair, group.length, heading);
  }
  for (const { group, heading } of headedBelowCaptionGroups(
    belowPaired.pairs, pairs, lines, typicalTextHeight, maxCaptionGapPx,
    minAlignedRows, layoutEvidenceDisabled,
  )) {
    for (const pair of group) acceptPair(pair, group.length, heading);
  }
  accepted.sort((a, b) => a.rect[0][1] - b.rect[0][1] || a.rect[0][0] - b.rect[0][0] || a.caption.localeCompare(b.caption));
  return accepted;
}
