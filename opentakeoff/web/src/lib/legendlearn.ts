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
): number[] {
  const boxes = spans.map((s) => ({
    x0: s.x0 - maxCaptionGapPx - maxGlyphDimPx,
    x1: s.x0,
    y0: s.y0 - maxGlyphDimPx * 1.5,
    y1: s.y1 + maxGlyphDimPx * 1.5,
  }));
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

type RectBox = { x0: number; y0: number; x1: number; y1: number };
type GlyphCandidate = { rect: [Point, Point]; segments: number; kind: "symbol" | "line_style" };
type GlyphMember = { rect: [Point, Point]; segments: number };
type PairCandidate = {
  rect: [Point, Point];
  segments: number;
  members: GlyphMember[];
  span: LegendSpan;
  caption: string;
  kind: "symbol" | "line_style";
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
  return /\bLEGEND\b/i.test(normalized)
    || /\bSYMBOLS\b/i.test(normalized)
    || /^SYMBOL$/i.test(normalized)
    || /\bNOTATIONS?\b/i.test(normalized)
    || /\bCOMPONENTS\b/i.test(normalized)
    || /\bPOINT\s+FUNCTION(?:\s+SCHEDULE)?\b/i.test(normalized)
    || /^(?:DUCTWORK|PIPING|VALVES?(?:\s+AND\s+PIPING\s+ACCESSORIES)?|DUCTWORK\s+ACCESSORIES|AIR\s+DISTRIBUTION\s+DEVICES|GRILLES?[,\s]+REGISTERS?\s*(?:&|AND)\s*DIFFUSERS?(?:\s+TAGS?)?|MECHANICAL\s+EQUIPMENT\s+TAGS?|DAMPER\s+TAGS?)$/i.test(normalized);
}

/** Domain evidence is required when a heading is generic (plain SYMBOLS)
 * or absent. This is deliberately a component/system vocabulary, not a
 * project token list: it separates HVAC/BAS legend captions from room-tag,
 * keynote, structural-material, design-criteria, and title-block columns. */
function isHvacBasCaption(text: string): boolean {
  return /\b(?:ACTUATOR|AIR|AIRFLOW|ALARM|ANALOG|BACNET|BAS|BOILER|CHILLER|COIL|CONTROL|CONTROLLER|DAMPER|DDC|DIFFUSER|DIGITAL|DUCT|EXHAUST|FAN|FILTER|FIRE|FLOW|GAUGE|GRILLE|HEAT|HUMIDITY|INPUT|LOUVER|MOTOR|NETWORK|OUTPUT|PIPE|PIPING|PNEUMATIC|POWER|PRESSURE|PUMP|REFRIGERANT|REGISTER|RELAY|RETURN|SENSOR|SIGNAL|SMOKE|STEAM|SUPPLY|SWITCH|TEMPERATURE|THERMOSTAT|TRANSMITTER|VALVE|VENT|VFD|VOLTAGE|WATER)\b/i.test(normalizedCaption(text));
}

function isDomainHeading(text: string): boolean {
  return /\b(?:AIR|BAS|CONTROL|DDC|DAMPER|DUCT|HVAC|MECHANICAL|PIPING|POINT|SENSING|VALVE)\b/i.test(normalizedCaption(text));
}

function isSectionBoundaryText(text: string): boolean {
  const normalized = normalizedCaption(text);
  if (!normalized || normalized.length > 100) return false;
  return isLegendHeadingText(normalized)
    || /\b(?:ABBREVIATIONS?|DESIGN\s+CRITERIA|GENERAL\s+(?:PROJECT|MECHANICAL|HVAC|CONTROL)\s+NOTES?|IDENTIFICATION|INDENTIFICATION|SCHEDULES?|SEQUENCES?)\b/i.test(normalized);
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
  return /^(?:REVISION\s+(?:REFERENCE|MARKER|NUMBER|TAG)|DETAIL\s+(?:REFERENCE|MARKER|NUMBER|TAG|CALLOUT)|SHEET\s+NOTE\s+(?:CALLOUT|TAG)|AIR\s+DISTRIBUTION\s+TAG|CONTROL\s+ELEMENT\s+TAG|POINT\s+NAME'?S\s+(?:IDENTIFICATION|INDENIFICATION|NUMBER)|CHANGE\s+OF\s+ELEVATION|ROOM\s+(?:TAG|NAME|NUMBER)|PLAN\s+(?:NOTE|NORTH)|CONTINUATION\s+SYMBOL|POINT\s+WHERE\s+NEW\s+CONNECTS\s+TO\s+EXISTING|AREA\s+NOT\s+IN\s+CONTRACT|ITEM\s+TO\s+BE\s+DEMOLISHED|CONNECT\s+TO\s+EXISTING|DEMOLISH\s+TO\s+POINT\s+INDICATED|DEMOLITION\b|EXISTING\s+TO\s+REMAIN|DIRECTION\s+OF\s+AIR\s*FLOW|STEEL\s+BARS\s+AS\s+REQUIRED|KEY(?:ED)?\s+(?:CONSTRUCTION\s+)?NOTE|INTERLOCK\s+TO\b|CONNECTION\s+TO\b.*\b(?:BAS|CONTROL|DDC)\b)/i.test(normalized);
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
function resemblesExtractedText(rect: [Point, Point], rawSpans: LegendSpan[]): boolean {
  const [[x0, y0], [x1, y1]] = rect;
  const w = x1 - x0, h = y1 - y0;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (rawSpans.some((s) => {
    const sw = s.x1 - s.x0, sh = s.y1 - s.y0;
    if (!s.text.trim() || sw <= 0 || sh <= 0) return false;
    if (cx < s.x0 || cx > s.x1 || cy < s.y0 - sh * 0.2 || cy > s.y1 + sh * 0.2) return false;
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
  const ux0 = Math.min(...overlaps.map((s) => s.x0));
  const uy0 = Math.min(...overlaps.map((s) => s.y0));
  const ux1 = Math.max(...overlaps.map((s) => s.x1));
  const uy1 = Math.max(...overlaps.map((s) => s.y1));
  const textHeight = median(overlaps.map((s) => s.y1 - s.y0));
  const tol = Math.max(2.5, Math.min(12, textHeight * 0.4));
  const unionArea = Math.max(1, (ux1 - ux0) * (uy1 - uy0));
  const componentArea = Math.max(1, w * h);
  // Outline fonts can overshoot the PDF text metrics by several pixels,
  // especially across stacked runs. Relative area agreement distinguishes
  // that duplicate ink from a genuine circle/box surrounding a short tag.
  return componentArea / unionArea <= 1.5
    && x0 >= ux0 - tol && x1 <= ux1 + tol && y0 >= uy0 - tol && y1 <= uy1 + tol;
}

function pairCandidates(
  candidates: GlyphCandidate[],
  spans: LegendSpan[], rawSpans: LegendSpan[], maxCaptionGapPx: number,
  typicalTextHeight: number,
): { pairs: PairCandidate[]; usedSpans: Set<number> } {
  type Edge = { candidate: number; span: number; score: number; gap: number };
  const edges: Edge[] = [];
  for (let ci = 0; ci < candidates.length; ci++) {
    const cand = candidates[ci];
    if (resemblesExtractedText(cand.rect, rawSpans)) continue;
    const [[, y0], [x1, y1]] = cand.rect;
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
        if (!meaningfulCaption(otherText) || otherText.length < short.length + 8 || otherText.split(/\s+/).length < 2) return false;
        const rowOverlap = Math.min(s.y1, other.y1) - Math.max(s.y0, other.y0);
        if (rowOverlap <= 0 && Math.abs((s.y0 + s.y1 - other.y0 - other.y1) / 2) > typicalTextHeight * 0.6) return false;
        return other.x0 - s.x0 <= Math.max(200, typicalTextHeight * 8)
          && other.x0 - x1 <= maxCaptionGapPx;
      });
      if (shadowedByDescription) continue;
      const spanCenterY = (s.y0 + s.y1) / 2;
      edges.push({ candidate: ci, span: si, gap, score: gap + Math.abs(spanCenterY - centerY) * 0.35 });
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
    if (usedCandidates.has(edge.candidate) || usedSpans.has(edge.span)) continue;
    usedCandidates.add(edge.candidate);
    usedSpans.add(edge.span);
    const cand = candidates[edge.candidate];
    const span = spans[edge.span];
    pairs.push({
      rect: cand.rect,
      segments: cand.segments,
      members: [{ rect: cand.rect, segments: cand.segments }],
      span: { ...span },
      caption: normalizedCaption(span.text),
      kind: cand.kind,
    });
  }
  return { pairs, usedSpans };
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
  gridPx: number, rawSpans: LegendSpan[],
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
  rawSpans: LegendSpan[], gridPx: number, typicalTextHeight: number, maxGlyphDimPx: number,
): void {
  const maxGap = Math.max(gridPx * 3, typicalTextHeight * 1.5);
  const centerTolerance = Math.max(gridPx * 2, typicalTextHeight * 0.3);
  const sameRect = (a: [Point, Point], b: [Point, Point]) =>
    a[0][0] === b[0][0] && a[0][1] === b[0][1] && a[1][0] === b[1][0] && a[1][1] === b[1][1];

  for (const pair of pairs) {
    const pairW = pair.rect[1][0] - pair.rect[0][0];
    const pairH = pair.rect[1][1] - pair.rect[0][1];
    const pairIsLineFragment = pairW > pairH * 4 && pairH <= gridPx * 2.5;
    if (pair.kind !== "line_style" && !pairIsLineFragment) continue;
    const horizontal = pair.rect[1][0] - pair.rect[0][0] >= pair.rect[1][1] - pair.rect[0][1];
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
        if ((candidate.kind !== "line_style" && !candidateIsLineFragment) || resemblesExtractedText(candidate.rect, rawSpans)) continue;
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
        if (gap > maxGap || centerDelta > centerTolerance || unionSpan > maxGlyphDimPx) continue;
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
    if (pair.kind !== "symbol") continue;
    const captionY = (pair.span.y0 + pair.span.y1) / 2;
    for (;;) {
      let best: GlyphCandidate | null = null;
      let bestDistance = Infinity;
      for (const candidate of candidates) {
        if (candidate.kind !== "symbol" || claimed.has(rectKey(candidate.rect))) continue;
        if (candidate.rect[1][0] > pair.span.x0 || resemblesExtractedText(candidate.rect, rawSpans)) continue;
        const candidateY = (candidate.rect[0][1] + candidate.rect[1][1]) / 2;
        if (Math.abs(candidateY - captionY) > typicalTextHeight * 1.25) continue;
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
      pair.rect = [
        [Math.min(pair.rect[0][0], best.rect[0][0]), Math.min(pair.rect[0][1], best.rect[0][1])],
        [Math.max(pair.rect[1][0], best.rect[1][0]), Math.max(pair.rect[1][1], best.rect[1][1])],
      ];
    }
  }
}

function hasMultipleSubstantialSymbols(pair: PairCandidate, typicalTextHeight: number): boolean {
  if (pair.kind !== "symbol" || pair.members.length < 2) return false;
  // Disconnected components alone do not imply variants: a damper body,
  // blade, actuator, and duct stubs may all be separate strokes but still
  // form one installed symbol. Treat the row as a group only when its own
  // caption explicitly declares alternatives and at least two independent
  // (non-overlapping) members support that reading.
  const declaresAlternatives = /\b\d+\s*-\s*WAY\b.*\b\d+\s*-\s*WAY\b/i.test(pair.caption)
    || /\b(?:DOWN\s*\/\s*UP|UP\s*\/\s*DOWN)\b/i.test(pair.caption)
    || /\bRISE\b.*\bDROP\b/i.test(pair.caption)
    || /\bACCESS\s+DOOR\b.*\bACCESS\s+PANEL\b/i.test(pair.caption);
  if (!declaresAlternatives) return false;
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
      if (distance >= typicalTextHeight * 1.2) return true;
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
): void {
  for (const pair of pairs) {
    for (let ownedLines = 1; ownedLines < maxWrapLines; ownedLines++) {
      let best = -1;
      let bestGap = Infinity;
      let prepend = false;
      for (let si = 0; si < spans.length; si++) {
        if (usedSpans.has(si)) continue;
        const s = spans[si];
        if (!meaningfulCaption(s.text)) continue;
        const belowGap = s.y0 - pair.span.y1;
        const aboveGap = pair.span.y0 - s.y1;
        const isBelow = belowGap >= -1;
        const gap = Math.max(0, isBelow ? belowGap : aboveGap);
        if (!isBelow && aboveGap < -1) continue;
        if (gap > maxLineGapPx || Math.abs(s.x0 - pair.span.x0) > maxIndentDriftPx) continue;
        if (gap < bestGap) { best = si; bestGap = gap; prepend = !isBelow; }
      }
      if (best < 0) break;
      const continuation = spans[best];
      usedSpans.add(best);
      pair.caption = normalizedCaption(prepend ? `${continuation.text} ${pair.caption}` : `${pair.caption} ${continuation.text}`);
      pair.span = {
        text: pair.caption,
        x0: Math.min(pair.span.x0, continuation.x0),
        y0: Math.min(pair.span.y0, continuation.y0),
        x1: Math.max(pair.span.x1, continuation.x1),
        y1: Math.max(pair.span.y1, continuation.y1),
      };
    }
  }
}

/** A symbol can itself be drawn as several disconnected components (the
 * display and lower indicator inside a VFD box are a real example). When a
 * wrapped caption line was therefore claimed by a second component, reunite
 * the two owned fragments into one row instead of emitting two fake rows. */
function mergeOwnedWrapPairs(
  pairs: PairCandidate[], maxLineGapPx: number, maxIndentDriftPx: number,
  maxGlyphDimPx: number, maxWrapLines: number, rawSpans: LegendSpan[],
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
    let ownedLines = 1;
    for (let j = i + 1; j < sorted.length; j++) {
      if (ownedLines >= maxWrapLines) break;
      if (consumed.has(j)) continue;
      const next = sorted[j];
      if (Math.abs(next.span.x0 - current.span.x0) > maxIndentDriftPx) continue;
      const lineGap = next.span.y0 - current.span.y1;
      if (lineGap < 0 || lineGap > maxLineGapPx) continue;
      const cx = (current.rect[0][0] + current.rect[1][0]) / 2;
      const nx = (next.rect[0][0] + next.rect[1][0]) / 2;
      if (Math.abs(cx - nx) > maxGlyphDimPx) continue;
      consumed.add(j);
      ownedLines++;
      current = {
        caption: normalizedCaption(`${current.caption} ${next.caption}`),
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
      };
    }
    out.push(current);
  }
  return out;
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
    if (centers[i] - centers[i - 1] > splitGap || boundaryBetween) out.push([]);
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
  // CAD export split "BACNET MS/TP - UUKL NETWORK" into three same-line
  // runs with 5.8px gaps. Scale the join allowance from local lettering,
  // while the finite 10px cap remains well short of real table-column gaps.
  const captionMergeGapPx = opts.captionMergeGapPx
    ?? Math.max(3, Math.min(10, rawTextHeight * 0.35));
  const lines = mergeCaptionLines(rawSpans, captionMergeGapPx);
  const spans = lines;
  const typicalTextHeight = Math.max(6, median(lines
    .map((s) => s.y1 - s.y0)
    .filter((height) => height > 2 && height <= 120)) || 12);
  // PDF image-space resolution varies materially across the corpus. Fixed
  // 80/150px bounds missed ordinary thermowells and dampers on a different
  // 5184px-wide export. Text height is the page-local ruler both the browser
  // and MCP possess, so scale the search from it with conservative caps.
  const maxGlyphDimPx = opts.maxGlyphDimPx ?? Math.max(80, Math.min(220, typicalTextHeight * 10));
  const maxCaptionGapPx = opts.maxCaptionGapPx ?? Math.max(150, Math.min(320, typicalTextHeight * 14));
  const maxLineStyleDimPx = Math.max(maxGlyphDimPx * 1.6, typicalTextHeight * 20);

  const relevantSegs = segmentsNearCaptions(segs, spans, maxGlyphDimPx, maxCaptionGapPx);
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

  const paired = pairCandidates(candidates, spans, rawSpans, maxCaptionGapPx, typicalTextHeight);
  const reunitedPairs = mergeDownshiftedGlyphFragments(
    paired.pairs, typicalTextHeight, maxGlyphDimPx, gridPx, rawSpans,
  );
  expandLineStylePairs(reunitedPairs, candidates, rawSpans, gridPx, typicalTextHeight, maxGlyphDimPx);
  expandSymbolPairs(reunitedPairs, candidates, rawSpans, typicalTextHeight, maxGlyphDimPx);
  const maxWrapLines = Math.max(1, Math.floor(opts.maxWrapLines ?? 3));
  // Wrapped CAD descriptions are often centered under their first line,
  // not left-aligned. Cherry Point's reviewed damper rows indent line two
  // by 19px and line three by 52px at a 25px text height. Scale both gates
  // from the sheet's lettering, with finite caps far inside column spacing.
  const maxWrapGapPx = opts.maxWrapGapPx ?? Math.max(8, Math.min(18, typicalTextHeight * 0.45));
  const maxWrapIndentPx = opts.maxWrapIndentPx ?? Math.max(5, Math.min(64, typicalTextHeight * 2.5));
  attachWrappedCaptions(reunitedPairs, spans, paired.usedSpans, maxWrapGapPx, maxWrapIndentPx, maxWrapLines);
  const pairs = mergeOwnedWrapPairs(
    reunitedPairs,
    maxWrapGapPx,
    maxWrapIndentPx,
    maxGlyphDimPx,
    maxWrapLines,
    rawSpans,
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
  for (const indices of groups) {
    let group = withoutEmbeddedGlyphTags(indices.map((i) => pairs[i]), typicalTextHeight);
    if (!group.length) continue;
    const heading = nearbyLegendHeading(group, lines, typicalTextHeight);
    group = withoutTrailingNetworkDiagram(group, heading, typicalTextHeight, minAlignedRows);
    if (group.length < (heading ? minAlignedRows : minUnheadedRows)) continue;
    const domainRows = group.filter((pair) => isHvacBasCaption(pair.caption)).length;
    const directiveRows = group.filter((pair) => isDirectiveProse(pair.caption)).length;
    const domainFloor = Math.max(2, Math.ceil(group.length * 0.2));
    // A domain-specific heading is enough context. Generic SYMBOL/LEGEND
    // headings and headerless repeated columns must prove that the rows are
    // actually HVAC/BAS identities, not room tags, keynotes, materials, or
    // design-criteria values. Headerless directive prose is notes/sequence
    // truth, never glyph-caption truth, even when its numbering is regular.
    if (!layoutEvidenceDisabled && (!heading || !isDomainHeading(heading)) && domainRows < domainFloor) continue;
    if (!layoutEvidenceDisabled && !heading && directiveRows / group.length > 0.15) continue;
    for (const pair of group) {
      const kind: LegendGlyph["kind"] = pair.kind === "symbol" && isDraftingAnnotationCaption(pair.caption)
        ? "annotation"
        : pair.kind === "symbol" && isControlFunctionCaption(pair.caption, heading) ? "control_function"
        : hasMultipleSubstantialSymbols(pair, typicalTextHeight) ? "symbol_group" : pair.kind;
      accepted.push({
        caption: pair.caption,
        caption_bbox: [[pair.span.x0, pair.span.y0], [pair.span.x1, pair.span.y1]],
        rect: pair.rect,
        segments: pair.segments,
        aligned_rows: group.length,
        heading,
        kind,
        seedable: kind === "symbol",
        ...(pair.members.length > 1 ? { member_rects: pair.members.map((member) => member.rect) } : {}),
        ...(kind === "line_style" ? { seed_warning: "Line-style legend keys describe routed systems, not discrete EA symbols; do not send this rect to a count sweep." } : {}),
        ...(kind === "annotation" ? { seed_warning: "Drafting/reference annotations are legend truth, not installed devices; do not send this rect to a count sweep." } : {}),
        ...(kind === "control_function" ? { seed_warning: "This row describes a BAS point, command, control-logic, or sequence function, not a physical installed-device symbol; keep it for controls reasoning and out of EA count sweeps." } : {}),
        ...(kind === "symbol_group" ? { seed_warning: "This legend row contains multiple substantial disconnected symbols or variants; anchor each intended identity separately on a real plan before counting." } : {}),
      });
    }
  }
  accepted.sort((a, b) => a.rect[0][1] - b.rect[0][1] || a.rect[0][0] - b.rect[0][0] || a.caption.localeCompare(b.caption));
  return accepted;
}

/** Find the compact, real-junction-clustered glyph nearest a single point —
 * the plan-sheet analog of findLegendGlyphs' own clustering, generalized off
 * legend captions entirely. A real, measured symbol_sweep seed (2026-09-02,
 * itd-d1-lab-mechanical.pdf#3) required hand-reconstructing THREE coordinate
 * spaces (rendered-view px -> zoom factor -> native image px) and eyeballing
 * a crop to find one tight rect around one hexagon — that manual crop-and-
 * reverse-math workflow is exactly what this function replaces. It does NOT
 * need a caption or a legend sheet: same connectivity engine
 * (clusterSegments — real-junction-aware union-find, grid-line stripping,
 * spatially bucketed), same compact-glyph shape test (looksLikeGlyph); only
 * the caption-pairing step is dropped, since a plan-sheet seed needs a
 * tight, correct bbox around ONE connected symbol, not a label. A rough
 * click (from view_sheet, or an agent-UI marquee's own centroid) is enough —
 * this snaps to the nearest real linework cluster, it does not require the
 * click to land exactly on a stroke. Returns null (never guesses a rect out
 * of thin air) when no compact glyph-shaped component's bbox lies within
 * `maxSnapPx` of the point — the caller's own refusal names that in the
 * click's own terms, matching symbol_sweep's existing refusal doctrine. */
export function findGlyphNear(
  segs: number[], point: Point,
  opts: { maxGlyphDimPx?: number; maxSnapPx?: number } = {},
): { rect: [Point, Point]; segments: number } | null {
  const maxGlyphDimPx = opts.maxGlyphDimPx ?? 80;
  const maxSnapPx = opts.maxSnapPx ?? maxGlyphDimPx * 1.5;
  if (!segs.length) return null;
  const [px, py] = point;
  // Bound the region fed to clusterSegments to keep this cheap on a dense
  // real plan sheet (tens of thousands of segments) — same reasoning as
  // segmentsNearCaptions above, just centered on the click instead of a
  // caption's own left edge.
  const pad = maxGlyphDimPx * 2 + maxSnapPx;
  const region: number[] = [];
  for (let i = 0; i < segs.length; i += 4) {
    const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
    if (Math.min(ax, bx) > px + pad || Math.max(ax, bx) < px - pad) continue;
    if (Math.min(ay, by) > py + pad || Math.max(ay, by) < py - pad) continue;
    region.push(ax, ay, bx, by);
  }
  if (!region.length) return null;
  // maxLineStyleDimPx == maxGlyphDimPx, deliberately: that parameter exists to
  // widen acceptance to a routed-system LINE-STYLE swatch, which is a legend
  // convention, not a discrete symbol. This function resolves a plan-sheet
  // click to one glyph to seed a sweep from, and a long horizontal run there is
  // a duct, not a key — its own tests turn on exactly that (two identical
  // glyphs joined by a duct run, which must be stripped as background). Passing
  // the glyph dimension for both keeps gridLineMinPx at maxGlyphDimPx * 2,
  // which is the behaviour those tests were written against.
  const { components, gridPx } = clusterSegments(region, maxGlyphDimPx, maxGlyphDimPx);
  let best: { x0: number; y0: number; x1: number; y1: number; edges: number } | null = null;
  let bestDist = Infinity;
  for (const c of components) {
    if (!looksLikeGlyph(c, c.edges, maxGlyphDimPx, maxGlyphDimPx)) continue;
    // distance from the point to the component's own bbox — 0 when the
    // click already lands inside it
    const dx = Math.max(c.x0 - px, 0, px - c.x1);
    const dy = Math.max(c.y0 - py, 0, py - c.y1);
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  if (!best || bestDist > maxSnapPx) return null;
  const pad2 = gridPx / 2; // same half-grid pad findLegendGlyphs uses, and for the same reason (#44's quantized-bbox bug)
  return { rect: [[best.x0 - pad2, best.y0 - pad2], [best.x1 + pad2, best.y1 + pad2]], segments: best.edges };
}
