/**
 * Free-form Sequence of Operations extraction.
 *
 * Construction details commonly put the detail title UNDER the prose block,
 * while specification-style sheets put the heading ABOVE it.  This pass
 * scores both directions, partitions side-by-side details by their title
 * centers, and retains the actual positioned spans.  It does not interpret
 * prose as I/O or invent control intent; it only makes the authored narrative
 * available to the shared Session graph with exact page/bbox evidence.
 */
import type { Bbox, GraphSpan, SheetSpans } from "./sheetgraph.ts";

export interface NarrativeSpanEvidence {
  sheet: string;
  text: string;
  bbox: Bbox;
}

export interface NarrativeSequenceSection {
  heading: string;
  body: string;
  evidence: NarrativeSpanEvidence[];
}

export interface NarrativeSequenceBlock {
  id: string;
  sheet: string;
  title: string;
  title_evidence: NarrativeSpanEvidence;
  region: Bbox;
  direction: "above_title" | "below_title";
  status: "extracted" | "title_only";
  sections: NarrativeSequenceSection[];
}

const SOO_PHRASE_RE = /\b(?:SEQUENCES?\s+OF\s+(?:OPERATIONS?|CONTROL)|CONTROLS?\s+(?:SEQUENCES?|NARRATIVE)|CONTROL\s+SEQUENCE)\b/i;
const SOO_TITLE_RE = /^(?=.{8,180}$)(?:[A-Z0-9][A-Z0-9 /&(),.'\-–—]{0,110}\s+[-–—:]?\s*)?(?:SEQUENCES?\s+OF\s+(?:OPERATIONS?|CONTROL)|CONTROLS?\s+(?:SEQUENCES?|NARRATIVE)|CONTROL\s+SEQUENCE)(?:\s*[-–—:]\s*[A-Z0-9][A-Z0-9 /&(),.'\-–—]{0,70}|\s*\([^)]{1,70}\)|\s+[A-Z0-9][A-Z0-9/.\-]{1,35})?[:.]?$/i;
const NON_TITLE_SENTENCE_RE = /\b(?:SHALL|WHEN|VERIFY|PROVIDE|PERFORM|DESCRIBED|RELATED|DISABLED|ADEQUACY|ACCURACY|REFER(?:ENCE)?|SEE|INSTALL|APPLIES|REQUIRED|ACHIEVE|ACCOMPLISH|ACCORDANCE)\b/i;
const DETAIL_TITLE_RE = /\b(?:CONTROL(?:\s+SYSTEM)?\s+(?:SCHEMATIC|DIAGRAM)|RISER(?:\s+DIAGRAM)?|SEQUENCES?\s+OF\s+OPERATIONS?)\b/i;
const SECTION_RE = /^(?:(?:\d+|[A-Z])\s*[.)]\s+|(?:GENERAL|DESCRIPTION|SYSTEM\s+DESCRIPTION|OCCUPIED(?:\s+MODE)?|UNOCCUPIED(?:\s+MODE)?|START(?:UP)?|SHUTDOWN|WARM[- ]?UP|COOL[- ]?DOWN|HEATING(?:\s+MODE)?|COOLING(?:\s+MODE)?|HUMIDIFICATION(?:\s+MODE)?|DEHUMIDIFICATION(?:\s+MODE)?|ALARMS?|SAFETIES|FAILURE\s+MODES?|POINTS?\s+LIST)\b[^.]{0,100}:?)/i;
const TITLE_BLOCK_RE = /^(?:SHEET|DRAWING|PROJECT|DATE|REV(?:ISION)?|DESIGNED|DRAWN|CHECKED|APPROVED|LICENSED|BID\s+SET|ISSUED\s+FOR)\b/i;
const NUMBERED_SECTION_RE = /^((?:\d+(?:\.\d+){1,8}(?:[.)])?|(?:\d+|[A-Z])\s*[.)]))\s*(.*)$/i;
const EXACT_SECTION_HEADING_RE = /^(?:(?:GENERAL|DESCRIPTION|SYSTEM\s+DESCRIPTION|OPERATION|PROOFS?|ALARMS?|SAFETIES|SAFETIES\s*\/\s*ALARMS|FAILURE\s+MODES?|DDC\s+HARDWARE\s+RESET|SET\s*POINTS?|POINTS?\s+LIST)|(?:[A-Z0-9][A-Z0-9 /&,'’()\-–—]{0,80}\s+)?(?:OCCUPIED|UNOCCUPIED|START(?:UP)?|SHUTDOWN|WARM[- ]?UP|COOL[- ]?DOWN|HEATING|COOLING|HUMIDIFICATION|DEHUMIDIFICATION|HEAT\s+RELIEF)\s+MODE(?:\s+OF\s+OPERATION)?)\s*:?$/i;

const clean = (value: unknown): string => String(value || "").replace(/\s+/g, " ").trim();
const bboxOf = (span: GraphSpan): Bbox => [span.x, span.y, span.x + (span.w || 0), span.y + (span.h || 0)];
const center = (span: GraphSpan): [number, number] => [span.x + (span.w || 0) / 2, span.y + (span.h || 0) / 2];

function isStructuralLaneHeading(text: string): boolean {
  if (text.length < 8 || text.length > 180 || SOO_PHRASE_RE.test(text)) return false;
  // SOO prose contains many schedule references. Only title-like equipment,
  // I/O, and points-list phrases may act as column barriers; reset schedules,
  // weekly schedules, and parenthetical cross-references remain narrative.
  if (/\b(?:SHALL|INDICATED|FOLLOWING|WEEKLY|HOLIDAY|RESET|ADJUSTABLE|BASED)\b/i.test(text)) return false;
  if (/^\(|[.)]$/.test(text)) return false;
  if (/\bPOINT(?:S|\s+FUNCTION)?\s+(?:SCHEDULE|LIST)\b/i.test(text)) return true;
  return /\b(?:EQUIPMENT|CONTROL\s+VALVE|VALVE|DAMPER(?:\s+ACTUATOR)?|ACTUATOR|AIR\s+HANDLING\s+UNIT|AHU|CHILLER|BOILER|PUMP|FAN|VAV|TERMINAL\s+UNIT|UNIT\s+HEATER|COIL|LOUVER|GRILLE|DIFFUSER|REGISTER)\s+SCHEDULE\b/i.test(text);
}

function isPointListLaneHeading(text: string): boolean {
  return /\b(?:POINT(?:S|\s+FUNCTION)?\s+(?:SCHEDULE|LIST)|DDC\s+POINTS?\s+LIST|I\/?O\s+LIST)\b/i.test(text)
    && !/\b(?:SHALL|REFER|SEE|AS\s+SHOWN)\b/i.test(text);
}

function pointListBoundaryAbove(title: GraphSpan, spans: GraphSpan[], x0: number, x1: number,
  y0: number): number | null {
  const tableHeader = /^(?:MARK|DESCRIPTION|ALARM|TREND|ANALOG\s+(?:INPUT|OUTPUT)|BINARY\s+(?:INPUT|OUTPUT)|DIGITAL\s+(?:INPUT|OUTPUT)|AI|AO|BI|BO|DI|DO)$/i;
  const requirement = /\b(?:SHALL|MUST|WHEN|IF|PROVIDE|ENABLE|DISABLE|MODULATE|MAINTAIN|ENERGI[ZS]E|DEENERGI[ZS]E)\b/i;
  const candidates = spans
    .filter((span) => isHorizontalText(span) && isPointListLaneHeading(clean(span.str)))
    .filter((span) => {
      const [cx] = center(span);
      return cx >= x0 && cx <= x1 && span.y > y0 && span.y < title.y;
    })
    .sort((a, b) => b.y - a.y);
  for (const marker of candidates) {
    const below = spans.filter((span) => {
      const [cx] = center(span);
      return isHorizontalNarrativeFragment(span)
        && cx >= x0 && cx <= x1
        && span.y >= marker.y + (marker.h || 0)
        && span.y + (span.h || 0) <= title.y;
    });
    const headers = new Set(below.map((span) => clean(span.str).toUpperCase()).filter((text) => tableHeader.test(text)));
    if (headers.size >= 2 && !below.some((span) => requirement.test(clean(span.str)))) {
      // Region membership is edge-inclusive, so stop just above the authored
      // heading's top edge rather than retaining the heading as prose.
      return marker.y - Math.max(0.5, (marker.h || 0) * 0.05);
    }
  }
  return null;
}

export function isSequenceNarrativeHeading(text: unknown): boolean {
  const value = clean(text);
  if (value.length < 8 || value.length > 180 || !SOO_TITLE_RE.test(value)) return false;
  // Drawing prose mentions sequences constantly ("install hardware to perform
  // this sequence", "verify the adequacy of the sequence", etc.). Those are
  // requirements inside a sequence, never headings. Keeping this lexical gate
  // to sentence verbs—not project vocabulary—prevents a paragraph from
  // spawning its own phantom SOO block.
  return !NON_TITLE_SENTENCE_RE.test(value);
}

function isHorizontalText(span: GraphSpan): boolean {
  if (Math.abs(Number(span.rot || 0)) > 0.08) return false;
  if (/^[-–—:]$/.test(clean(span.str))) return true;
  return (span.w || 0) >= Math.max(1, (span.h || 0) * 0.7);
}

function isHorizontalNarrativeFragment(span: GraphSpan): boolean {
  if (isHorizontalText(span)) return true;
  // A single horizontal glyph such as the T in PH-DA-T-LL is naturally
  // narrower than its font height. Rotation metadata, when present, remains
  // authoritative. Keep this exception body-only so a numbered detail bubble
  // cannot be absorbed into a nearby SOO title.
  return Math.abs(Number(span.rot || 0)) <= 0.08 && /^[A-Z0-9]$/i.test(clean(span.str));
}

/** A controls curve/chart is sometimes titled only `CONTROL SEQUENCE`.  Its
 * axes and state labels are valuable diagram evidence, but they are not an
 * authored prose sequence.  Reject only the strongly evidenced chart shape:
 * several nearby curve labels and no nearby requirement sentence.  A normal
 * heading followed by `THE BAS SHALL ...` remains a narrative. */
export function isControlCurveChartHeading(title: GraphSpan, spans: GraphSpan[]): boolean {
  if (!/^CONTROLS?\s+SEQUENCE[:.]?$/i.test(clean(title.str))) return false;
  const h = Math.max(1, title.h || 0);
  const left = title.x - Math.max((title.w || 0) * 1.4, h * 10);
  const right = title.x + (title.w || 0) + Math.max((title.w || 0) * 1.4, h * 10);
  const top = title.y + (title.h || 0);
  const bottom = top + h * 12;
  const nearby = spans.filter((span) => span !== title
    && isHorizontalNarrativeFragment(span)
    && span.y >= top - h * 0.2
    && span.y <= bottom
    && center(span)[0] >= left
    && center(span)[0] <= right)
    .map((span) => clean(span.str));
  const chartLabel = /^(?:ROOM\s+TEMPERATURE|ZONE\s+SET\s*POINT|HEATING|COOLING|HEAT|COOL|VALVE\s+(?:OPEN|CLOSED)|HEATING\s+VALVE|CONTROL\s+DAMPER|DAMPER\s+.+\s+POSITION|DEADBAND|\([+-]?\s*°?F\)|[+-]?\d+(?:\.\d+)?\s*°?F(?:\s*\(\s*ADJ\.?\s*\))?)$/i;
  const requirementSentence = /\b(?:SHALL|MUST|WHEN|IF|PROVIDE|ENABLE|DISABLE|MODULATE|MAINTAIN|COMMAND(?:ED)?|ENERGI[ZS]E|DEENERGI[ZS]E)\b/i;
  return nearby.filter((text) => chartLabel.test(text)).length >= 5
    && !nearby.some((text) => requirementSentence.test(text));
}

function normalizedHeading(text: unknown): string {
  return clean(text).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function horizontalOverlapRatio(a: GraphSpan, b: GraphSpan): number {
  const overlap = Math.max(0, Math.min(a.x + (a.w || 0), b.x + (b.w || 0)) - Math.max(a.x, b.x));
  return overlap / Math.max(1, Math.min(a.w || 0, b.w || 0));
}

/** Collapse only the familiar small narrative-heading / larger detail-caption
 * pair.  Equal-sized repeated titles are separate authored regions until
 * proven otherwise; title text alone is never a physical identity. */
function hasDetailScaleCaption(title: GraphSpan, spans: GraphSpan[]): boolean {
  const bottom = title.y + (title.h || 0);
  const reach = Math.max(12, (title.h || 0) * 1.8);
  const leftTolerance = Math.max(12, (title.h || 0) * 1.5);
  return spans.some((span) => {
    const text = clean(span.str);
    return /^(?:SCALE\s*:|NOT\s+(?:DRAWN\s+)?TO\s+SCALE\b|N\.?T\.?S\.?$)/i.test(text)
      && span.y >= bottom - Math.max(2, (title.h || 0) * 0.1)
      && span.y <= bottom + reach
      && Math.abs(span.x - title.x) <= leftTolerance;
  });
}

function hasRequirementProseBetween(a: GraphSpan, b: GraphSpan, spans: GraphSpan[]): boolean {
  const upper = a.y <= b.y ? a : b;
  const lower = upper === a ? b : a;
  const x0 = Math.min(upper.x, lower.x);
  const x1 = Math.max(upper.x + (upper.w || 0), lower.x + (lower.w || 0));
  const lanePadding = Math.max(24, Math.min(upper.w || 0, lower.w || 0) * 0.12);
  const requirement = /\b(?:SHALL|MUST|WHEN|IF|ENABLE|DISABLE|MODULATE|MAINTAIN|ENERGI[ZS]E|DEENERGI[ZS]E)\b/i;
  return spans.some((span) => {
    const [cx] = center(span);
    return span.y >= upper.y + (upper.h || 0)
      && span.y + (span.h || 0) <= lower.y
      && cx >= x0 - lanePadding
      && cx <= x1 + lanePadding
      && requirement.test(clean(span.str));
  });
}

function collapseHeadingCaptionPairs(titles: GraphSpan[], spans: GraphSpan[]): GraphSpan[] {
  const retained: GraphSpan[] = [];
  for (const title of [...titles].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const index = retained.findIndex((prior) => {
      if (normalizedHeading(prior.str) !== normalizedHeading(title.str)) return false;
      const heightRatio = Math.max(prior.h || 1, title.h || 1) / Math.max(1, Math.min(prior.h || 1, title.h || 1));
      if (horizontalOverlapRatio(prior, title) < 0.5) return false;
      if (heightRatio >= 1.4) return true;
      // Some construction sheets repeat a small narrative heading above the
      // prose and a numbered detail caption below it at a similar font size.
      // `SCALE:` is explicit evidence that one occurrence is the detail
      // caption. Requiring control prose between the two prevents equal-text
      // titles in neighboring physical details from being merged by name.
      const priorIsCaption = hasDetailScaleCaption(prior, spans);
      const titleIsCaption = hasDetailScaleCaption(title, spans);
      return priorIsCaption !== titleIsCaption
        && hasRequirementProseBetween(prior, title, spans);
    });
    if (index < 0) {
      retained.push(title);
      continue;
    }
    const prior = retained[index];
    const priorIsCaption = hasDetailScaleCaption(prior, spans);
    const titleIsCaption = hasDetailScaleCaption(title, spans);
    if (titleIsCaption || (!priorIsCaption && (title.h || 0) > (prior.h || 0))) retained[index] = title;
  }
  return retained;
}

/**
 * PDF generators routinely split a visible heading into adjacent text spans:
 * "CHILLED WATER SYSTEM" + "-" + "SEQUENCE OF OPERATION". Build the
 * displayed same-line phrase before classifying it, otherwise every such
 * heading collapses to the useless title "SEQUENCE OF OPERATION". The join is
 * purely geometric and bounded to contiguous, similarly-sized horizontal
 * spans; it cannot bridge columns or consume body text on another baseline.
 */
function sequenceTitleSpans(spans: GraphSpan[]): GraphSpan[] {
  const horizontal = spans.filter(isHorizontalText);
  const candidates: GraphSpan[] = [];
  for (const seed of horizontal.filter((span) => SOO_PHRASE_RE.test(clean(span.str)))) {
    const seedCy = seed.y + (seed.h || 0) / 2;
    const line = horizontal
      .filter((span) => {
        const cy = span.y + (span.h || 0) / 2;
        const heightRatio = Math.max(span.h || 1, seed.h || 1) / Math.max(1, Math.min(span.h || 1, seed.h || 1));
        return Math.abs(cy - seedCy) <= Math.max(3, (seed.h || 0) * 0.55) && heightRatio <= 1.8;
      })
      .sort((a, b) => a.x - b.x);
    const seedText = clean(seed.str);
    const bareSequencePhrase = /^(?:SEQUENCES?\s+OF\s+(?:OPERATIONS?|CONTROL)|CONTROLS?\s+(?:SEQUENCES?|NARRATIVE)|CONTROL\s+SEQUENCE)[:.]?$/i.test(seedText);
    if (bareSequencePhrase) {
      const abbreviation = horizontal.some((span) => {
        if (!/^SOO$/i.test(clean(span.str))) return false;
        const cy = span.y + (span.h || 0) / 2;
        const gap = seed.x - (span.x + (span.w || 0));
        return Math.abs(cy - seedCy) <= Math.max(3, (seed.h || 0) * 0.6) && gap >= 0 && gap <= Math.max(120, (seed.h || 0) * 5);
      });
      if (abbreviation) continue; // abbreviation legend: "SOO = Sequence of Operation"
      const continuation = horizontal.some((span) => {
        const bottom = span.y + (span.h || 0);
        const verticalGap = seed.y - bottom;
        return span !== seed
          && verticalGap >= 0 && verticalGap <= Math.max(8, (seed.h || 0) * 0.8)
          && Math.abs(span.x - seed.x) <= Math.max(24, (seed.h || 0) * 1.5)
          && /(?:\b(?:AND|OR|THE|OF|TO|FOR|INCLUDING)|[,;:])$/i.test(clean(span.str));
      });
      if (continuation) continue; // wrapped sentence/bullet, not a heading
    }
    const at = line.indexOf(seed);
    if (at < 0) continue;
    const maxGap = Math.max(18, (seed.h || 0) * 1.8);
    let left = at;
    while (left > 0 && line[left].x - (line[left - 1].x + (line[left - 1].w || 0)) <= maxGap) left--;
    let right = at;
    while (right + 1 < line.length && line[right + 1].x - (line[right].x + (line[right].w || 0)) <= maxGap) right++;

    const possible: GraphSpan[] = [];
    for (let start = left; start <= at; start++) {
      for (let end = at; end <= right; end++) {
        const window = line.slice(start, end + 1);
        let text = clean(window.map((span) => clean(span.str)).join(" "))
          .replace(/\s+([:.,)])/g, "$1")
          .replace(/([(])\s+/g, "$1")
          .replace(/^\d+\s*[.)]\s+/, "");
        if (!isSequenceNarrativeHeading(text)) continue;
        const x0 = Math.min(...window.map((span) => span.x));
        const y0 = Math.min(...window.map((span) => span.y));
        const x1 = Math.max(...window.map((span) => span.x + (span.w || 0)));
        const y1 = Math.max(...window.map((span) => span.y + (span.h || 0)));
        possible.push({ ...seed, str: text, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
    }
    // Prefer the complete visible heading over the seed's generic suffix.
    possible.sort((a, b) => clean(b.str).length - clean(a.str).length || (b.w || 0) - (a.w || 0));
    let title = possible[0];
    if (!title) continue;
    // Large detail captions are often wrapped immediately before the line
    // containing "SEQUENCE OF OPERATION". Recover only a same-left-edge,
    // similarly sized, uppercase prefix whose combined text is itself a valid
    // sequence heading. This keeps the evidence box source-geometric while
    // preventing generic suffixes such as "SEQUENCE OF OPERATION" or
    // "TEMPERATURE SEQUENCE OF OPERATION" from becoming the system identity.
    for (let depth = 0; depth < 2; depth++) {
      const prefixes = horizontal.filter((span) => {
        if (SOO_PHRASE_RE.test(clean(span.str))) return false;
        const text = clean(span.str);
        if (text.length < 3 || text.length > 100 || text !== text.toUpperCase()
          || NON_TITLE_SENTENCE_RE.test(text) || /[.!?:;]$/.test(text)) return false;
        const heightRatio = Math.max(span.h || 1, seed.h || 1) / Math.max(1, Math.min(span.h || 1, seed.h || 1));
        const verticalGap = title.y - (span.y + (span.h || 0));
        const leftTolerance = Math.max(18, (seed.h || 0) * 0.45);
        return heightRatio <= 1.4
          && verticalGap >= -Math.max(4, (seed.h || 0) * 0.25)
          && verticalGap <= Math.max(14, (seed.h || 0) * 0.75)
          && Math.abs(span.x - title.x) <= leftTolerance
          && isSequenceNarrativeHeading(`${text} ${clean(title.str)}`);
      }).sort((a, b) => b.y - a.y || Math.abs(a.x - title.x) - Math.abs(b.x - title.x));
      const prefix = prefixes[0];
      if (!prefix) break;
      const x0 = Math.min(prefix.x, title.x), y0 = Math.min(prefix.y, title.y);
      const x1 = Math.max(prefix.x + (prefix.w || 0), title.x + (title.w || 0));
      const y1 = Math.max(prefix.y + (prefix.h || 0), title.y + (title.h || 0));
      title = { ...title, str: `${clean(prefix.str)} ${clean(title.str)}`, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    candidates.push(title);
  }
  const seen = new Set<string>();
  return candidates.filter((span) => {
    const key = `${clean(span.str).toUpperCase()}@${Math.round(span.x)}@${Math.round(span.y)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isProse(span: GraphSpan, pageWidth: number): boolean {
  const text = clean(span.str);
  if (text.length < 7 || text.length > 800) return false;
  if (SOO_PHRASE_RE.test(text) || DETAIL_TITLE_RE.test(text)) return false;
  if (/^(?:NOT (?:DRAWN )?TO SCALE\b|SCALE\s*:|N\.?T\.?S\.?$)/i.test(text)) return false;
  if (TITLE_BLOCK_RE.test(text) && text.length < 80) return false;
  if (/^(?:\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Z]\d{1,3}(?:\.\d+)?)$/.test(text)) return false;
  if ((span.w || 0) > pageWidth * 0.92) return false;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length >= 2 || SECTION_RE.test(text);
}

function horizontalBounds(title: GraphSpan, laneMarkers: GraphSpan[], width: number, height: number): [number, number] {
  const [cx] = center(title);
  // A primary sheet sequence title at the upper-left governs the multi-column
  // narrative beneath it. A later embedded sequence heading in column three
  // is not a side-by-side peer and must not truncate the parent to column one.
  // Stop before the conventional right-side title-block/notes strip.
  if (title.y <= height * 0.12 && title.x <= width * 0.25) {
    return [width * 0.015, width * 0.82];
  }
  // A lone narrow sequence detail placed in the far-right drawing column
  // should not absorb adjacent mechanical details simply because no second
  // sequence title exists to form a lane boundary.
  if (title.x >= width * 0.6 && (title.w || 0) <= width * 0.25) {
    return [Math.max(width * 0.015, title.x - width * 0.03), width * 0.93];
  }
  const laneSeparation = width * 0.08;
  // Use title lanes across the whole sheet, not only titles sharing a row.
  // Stacked details keep the same lane; a left-side sequence and a shorter
  // right-side sequence must still partition their prose even when their
  // underlined titles sit at different y coordinates.
  const otherLanes = laneMarkers
    .filter((other) => other !== title)
    .map((span) => ({ span, x: center(span)[0] }))
    .filter(({ x }) => Math.abs(x - cx) > laneSeparation);
  const left = otherLanes.filter(({ x }) => x < cx).sort((a, b) => b.x - a.x)[0];
  const right = otherLanes.filter(({ x }) => x > cx).sort((a, b) => a.x - b.x)[0];
  // A single wide detail routinely uses several prose columns.  The generous
  // expansion is bounded by neighboring same-row detail titles and the title
  // block margin, not by an arbitrary table shape.
  // A single wide construction detail may use several prose columns, with
  // long lines emitted as adjacent PDF spans. Preserve that reach; authored
  // neighboring sequence and schedule headings provide the lane barriers.
  const expandedLeft = title.x - width * 0.34;
  const expandedRight = title.x + title.w + width * 0.34;
  const leftBoundary = left == null ? expandedLeft
    : SOO_PHRASE_RE.test(clean(left.span.str))
      ? Math.max((left.x + cx) / 2, title.x - width * 0.08)
      : cx - left.x > width * 0.45
        ? left.span.x + (left.span.w || 0) + width * 0.02
        : Math.max((left.x + cx) / 2, title.x - width * 0.08);
  const rightBoundary = right == null ? expandedRight
    : SOO_PHRASE_RE.test(clean(right.span.str))
      ? Math.min((right.x + cx) / 2, title.x + title.w + width * 0.08)
      : right.x - cx > width * 0.45
        // A far-side schedule heading is usually centered over a wide table.
        // Reserve the table's left-side footprint, not only the title glyphs.
        ? right.span.x - width * 0.15
        : Math.min((right.x + cx) / 2, title.x + title.w + width * 0.08);
  return [Math.max(width * 0.015, leftBoundary), Math.min(width * 0.93, rightBoundary)];
}

function verticalBounds(title: GraphSpan, titles: GraphSpan[], x0: number, x1: number, height: number): {
  above: [number, number]; below: [number, number];
} {
  const [cx, cy] = center(title);
  const sameLane = titles
    .filter((other) => other !== title)
    .filter((other) => {
      const [ox] = center(other);
      return ox >= x0 && ox <= x1 && Math.abs(ox - cx) <= (x1 - x0) * 0.65;
    });
  const previous = sameLane.map(center).map(([, y]) => y).filter((y) => y < cy).sort((a, b) => b - a)[0];
  const next = sameLane.map(center).map(([, y]) => y).filter((y) => y > cy).sort((a, b) => a - b)[0];
  const aboveReach = Math.max(height * 0.64, title.y * 0.9);
  const belowReach = Math.max(height * 0.64, (height - (title.y + title.h)) * 0.9);
  return {
    above: [Math.max(0, previous == null ? title.y - aboveReach : (previous + cy) / 2), title.y],
    below: [title.y + title.h, Math.min(height, next == null ? title.y + title.h + belowReach : (next + cy) / 2)],
  };
}

function overlapX(span: GraphSpan, x0: number, x1: number): boolean {
  const cx = span.x + (span.w || 0) / 2;
  return cx >= x0 && cx <= x1;
}

type NarrativeLineSpan = GraphSpan & { sourceFragments?: GraphSpan[] };

/**
 * A visible narrative line is often split at punctuation or font-subset
 * boundaries (for example "(DOAHSF" + "-" + "S)").  Reassemble only
 * contiguous fragments on the same baseline before deciding whether the line
 * is prose.  The original fragments remain attached so downstream evidence
 * maps to the exact source spans instead of citing an invented merged box.
 */
function narrativeLineSpans(spans: GraphSpan[]): NarrativeLineSpan[] {
  if (spans.length < 2) return spans;
  const ordered = [...spans].sort((a, b) => {
    const ay = a.y + (a.h || 0) / 2;
    const by = b.y + (b.h || 0) / 2;
    return ay - by || a.x - b.x;
  });
  const rows: Array<{ cy: number; h: number; spans: GraphSpan[] }> = [];
  const maxHeight = ordered.reduce((height, span) => Math.max(height, span.h || 0), 0);
  for (const span of ordered) {
    const cy = span.y + (span.h || 0) / 2;
    const h = Math.max(1, span.h || 0);
    let row: typeof rows[number] | undefined;
    for (let index = rows.length - 1; index >= 0; index--) {
      if (cy - rows[index].cy > Math.max(1, maxHeight) * 0.25) break;
      if (Math.abs(cy - rows[index].cy) <= Math.min(h, rows[index].h) * 0.25) {
        row = rows[index];
        break;
      }
    }
    if (row) row.spans.push(span);
    else rows.push({ cy, h, spans: [span] });
  }

  const result: NarrativeLineSpan[] = [];
  const emit = (fragments: GraphSpan[]) => {
    if (fragments.length === 1) {
      result.push(fragments[0]);
      return;
    }
    let text = "";
    for (const [index, fragment] of fragments.entries()) {
      const previous = fragments[index - 1];
      const gap = previous ? fragment.x - (previous.x + (previous.w || 0)) : 0;
      const minHeight = previous ? Math.max(1, Math.min(fragment.h || 0, previous.h || 0)) : 1;
      if (previous && gap > minHeight * 0.12 && !/\s$/.test(text) && !/^\s/.test(fragment.str)) text += " ";
      text += fragment.str;
    }
    const x0 = Math.min(...fragments.map((fragment) => fragment.x));
    const y0 = Math.min(...fragments.map((fragment) => fragment.y));
    const x1 = Math.max(...fragments.map((fragment) => fragment.x + (fragment.w || 0)));
    const y1 = Math.max(...fragments.map((fragment) => fragment.y + (fragment.h || 0)));
    result.push({ ...fragments[0], str: text, x: x0, y: y0, w: x1 - x0, h: y1 - y0, sourceFragments: fragments });
  };

  for (const row of rows) {
    const rowSpans = row.spans.sort((a, b) => a.x - b.x);
    let group: GraphSpan[] = [];
    for (const span of rowSpans) {
      const previous = group.at(-1);
      if (previous) {
        const minHeight = Math.max(1, Math.min(span.h || 0, previous.h || 0));
        const gap = span.x - (previous.x + (previous.w || 0));
        // Large gaps are independent columns/cells. Materially overlapping
        // runs are ambiguous overprints, not a safe readable line.
        const nearDashContinuation = /^[-–—]$/.test(clean(span.str)) && gap <= minHeight * 0.3;
        // A PDF font/subset transition can leave a normal inter-word gap even
        // though both runs form one visible sentence. A true neighboring
        // column is separated by materially more than one text height.
        if ((gap > minHeight * 1.25 && !nearDashContinuation) || gap < -minHeight * 0.25) {
          emit(group);
          group = [];
        }
      }
      group.push(span);
    }
    if (group.length) emit(group);
  }
  return result;
}

function linesInRegion(spans: GraphSpan[], bounds: Bbox, width: number): GraphSpan[] {
  const [x0, y0, x1, y1] = bounds;
  const positioned = spans.filter((span) => isHorizontalNarrativeFragment(span)
    && span.y + (span.h || 0) >= y0
    && span.y <= y1);
  // Reconstruct a visually contiguous PDF line before applying the lane
  // boundary. Otherwise the boundary can retain "(PH-DA" while clipping the
  // abutting "-T-LL)" fragments of the same authored tag. The join itself
  // cannot bridge a column-sized gap, and the complete line center must still
  // belong to this narrative lane.
  const lane = narrativeLineSpans(positioned)
    .filter((span) => ((span as NarrativeLineSpan).sourceFragments || [span])
      .some((fragment) => overlapX(fragment, x0, x1)));
  return lane.filter((span, index) => {
    if (isProse(span, width)) return true;
    const text = clean(span.str);
    const previous = lane[index - 1];
    if (!previous || !/^[A-Z0-9][A-Z0-9()/%°'&+.-]{1,60}[.!?,;:]?$/i.test(text)) return false;
    const previousText = clean(previous.str);
    const gap = span.y - (previous.y + (previous.h || 0));
    const h = Math.max(1, Math.min(span.h || 0, previous.h || 0));
    // Admit a one-token wrapped completion only when it is the immediate,
    // same-indent continuation of a real sentence that has not terminated.
    // This recovers source text such as "SHALL BE" + "DISABLED." without
    // promoting isolated diagram labels or instrument tags into prose.
    return previousText.length >= 24
      && !/[.!?:;]$/.test(previousText)
      && gap >= -h * 0.2 && gap <= h * 0.65
      && Math.abs(span.x - previous.x) <= h * 0.8;
  });
}

/** Bottom-caption details can have a legend, network diagram, or other detail
 * far above their actual SOO prose in the same horizontal lane. When the
 * authored narrative begins with GENERAL/DESCRIPTION after a material blank
 * separation, use that source geometry as the upper boundary. The lower
 * cluster must contain multiple explicit control requirements; an isolated
 * label can never clip otherwise valid prose. */
function openingSectionBoundaryAbove(title: GraphSpan, spans: GraphSpan[], bounds: Bbox,
  width: number): number | null {
  const lines = linesInRegion(spans, bounds, width)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (lines.length < 4) return null;
  const medianHeight = [...lines].map((line) => Math.max(1, line.h || 0))
    .sort((a, b) => a - b)[Math.floor(lines.length / 2)] || 1;
  const minimumGap = Math.max(medianHeight * 3, Math.max(1, title.h || 0) * 1.15);
  const opening = /^(?:GENERAL|DESCRIPTION|SYSTEM\s+DESCRIPTION)\s*:?$/i;
  const requirement = /\b(?:SHALL|MUST|WHEN|IF|PROVIDE|ENABLE|DISABLE|MODULATE|MAINTAIN|ENERGI[ZS]E|DEENERGI[ZS]E|MONITOR|CONTROL)\b/i;
  const candidates = lines.filter((line) => opening.test(clean(line.str))).sort((a, b) => b.y - a.y);
  for (const candidate of candidates) {
    const previous = lines.filter((line) => line !== candidate
      && line.y + (line.h || 0) <= candidate.y).at(-1);
    if (!previous || candidate.y - (previous.y + (previous.h || 0)) < minimumGap) continue;
    const lower = lines.filter((line) => line.y >= candidate.y && line.y < title.y);
    if (lower.length < 3 || lower.filter((line) => requirement.test(clean(line.str))).length < 2) continue;
    return candidate.y - Math.max(0.5, (candidate.h || 0) * 0.05);
  }
  return null;
}

function proseScore(lines: GraphSpan[]): number {
  return lines.reduce((score, span) => {
    const text = clean(span.str);
    const sentence = /[.:;]$/.test(text) || /\b(?:SHALL|WHEN|IF|PROVIDE|CONTROL|ENABLE|DISABLE|MAINTAIN)\b/i.test(text);
    return score + Math.min(text.length, 240) * (sentence ? 1 : 0.35);
  }, 0);
}

function readingOrder(lines: GraphSpan[], regionWidth: number): GraphSpan[] {
  if (lines.length < 2) return [...lines];
  const medianHeight = [...lines].map((s) => Math.max(s.h || 0, 8)).sort((a, b) => a - b)[Math.floor(lines.length / 2)] || 12;
  const tolerance = Math.min(regionWidth * 0.18, Math.max(90, medianHeight * 14));
  const columns: Array<{ anchor: number; lines: GraphSpan[] }> = [];
  for (const span of [...lines].sort((a, b) => a.x - b.x || a.y - b.y)) {
    let best = columns
      .map((column, index) => ({ index, distance: Math.abs(span.x - column.anchor) }))
      .filter((row) => row.distance <= tolerance)
      .sort((a, b) => a.distance - b.distance)[0];
    if (!best) {
      columns.push({ anchor: span.x, lines: [span] });
      continue;
    }
    const column = columns[best.index];
    column.lines.push(span);
    column.anchor = column.lines.reduce((sum, line) => sum + line.x, 0) / column.lines.length;
  }
  columns.sort((a, b) => a.anchor - b.anchor);
  return columns.flatMap((column) => column.lines.sort((a, b) => a.y - b.y || a.x - b.x));
}

function sectionsFromLines(sheet: string, lines: GraphSpan[], regionWidth: number): NarrativeSequenceSection[] {
  const ordered = readingOrder(lines, regionWidth);
  const sections: NarrativeSequenceSection[] = [];
  let current: NarrativeSequenceSection | null = null;
  for (const span of ordered) {
    const text = clean(span.str);
    const numbered = text.match(NUMBERED_SECTION_RE);
    const headingLike = numbered != null || EXACT_SECTION_HEADING_RE.test(text);
    const evidence = ((span as NarrativeLineSpan).sourceFragments || [span])
      .map((fragment) => ({ sheet, text: clean(fragment.str), bbox: bboxOf(fragment) }));
    if (!current || headingLike) {
      const heading = numbered?.[1] || (headingLike ? text.replace(/:\s*$/, "") : "Narrative");
      const initialBody = numbered?.[2] || (headingLike ? "" : text);
      current = {
        heading,
        body: initialBody,
        evidence,
      };
      sections.push(current);
    } else {
      current.body = `${current.body}${current.body ? " " : ""}${text}`;
      current.evidence.push(...evidence);
    }
  }
  return sections.filter((section) => clean(section.body).length >= 8
    || section.evidence.length > 1
    || (/^\d+(?:\.\d+)+/.test(section.heading) && clean(section.body).length >= 3));
}

/** Extract authored free-form SOO blocks from positioned spans. */
export function extractSequenceNarratives(sheets: SheetSpans[]): NarrativeSequenceBlock[] {
  const out: NarrativeSequenceBlock[] = [];
  for (const sheet of sheets) {
    const rawTitles = sequenceTitleSpans(sheet.spans)
      .filter((title) => !isControlCurveChartHeading(title, sheet.spans));
    const hasPrimary = rawTitles.some((title) => !/^(?:(?:OCCUPIED|UNOCCUPIED|STARTUP|SHUTDOWN|HEATING|COOLING)\s+)?MODE\s+SEQUENCE\b/i.test(clean(title.str)));
    const filteredTitles = rawTitles.filter((title) => {
      // "UNOCCUPIED MODE SEQUENCE" is normally a subsection inside a larger
      // equipment/system sequence on the same sheet, not an independent BAS
      // deliverable. Preserve it when it is the only authored sequence, but
      // do not double-count it beside a real primary title.
      if (hasPrimary && /^(?:(?:OCCUPIED|UNOCCUPIED|STARTUP|SHUTDOWN|HEATING|COOLING)\s+)?MODE\s+SEQUENCE\b/i.test(clean(title.str))) return false;
      // Some sequences contain smaller cross-reference headings such as
      // "POWERED VAV BOX CONTROL SEQUENCE" above a much larger numbered
      // detail title. If their horizontal lanes overlap and a primary title
      // is at least 1.5x taller, the smaller text is subordinate prose—not a
      // boundary that should clip the main narrative to title-only.
      const tx1 = title.x + (title.w || 0);
      const nestedUnderLargerTitle = rawTitles.some((other) => {
        if (other === title || (other.h || 0) < (title.h || 0) * 1.5) return false;
        const ox1 = other.x + (other.w || 0);
        const overlap = Math.max(0, Math.min(tx1, ox1) - Math.max(title.x, other.x));
        return overlap >= Math.min(title.w || 0, other.w || 0) * 0.5;
      });
      return !nestedUnderLargerTitle;
    });
    // Collapse a repeated narrative-heading/detail-caption pair before
    // vertical boundaries are computed. If deduplication happens afterward,
    // the discarded duplicate still bisects the retained block and silently
    // drops half of the authored sequence.
    const titles = collapseHeadingCaptionPairs(filteredTitles, sheet.spans);
    if (!titles.length) continue;
    const width = Math.max(1, ...sheet.spans.map((span) => span.x + (span.w || 0)));
    const height = Math.max(1, ...sheet.spans.map((span) => span.y + (span.h || 0)));
    // Table/points-list headings are authored lane markers. When a narrative
    // and a schedule share a row, their heading centers provide a reliable
    // separator even though both sets of text are inside the broad vertical
    // reach of the SOO title.
    const structuralLaneMarkers = sheet.spans.filter((span) => {
      const text = clean(span.str);
      return isHorizontalText(span)
        && isStructuralLaneHeading(text);
    });
    for (const title of titles) {
      let [x0, x1] = horizontalBounds(title, [...titles, ...structuralLaneMarkers], width, height);
      const vb = verticalBounds(title, titles, x0, x1, height);
      const titleKey = clean(title.str).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
      const duplicates = filteredTitles.filter((candidate) =>
        candidate !== title
        && clean(candidate.str).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim() === titleKey);
      const upperCaption = duplicates
        .filter((candidate) => candidate.y < title.y)
        .sort((a, b) => b.y - a.y)[0];
      const lowerCaption = duplicates
        .filter((candidate) => candidate.y > title.y)
        .sort((a, b) => a.y - b.y)[0];
      // Repeated headings frequently bracket the authored narrative: a small
      // label immediately above the prose and a larger numbered detail title
      // immediately below it. Use those real duplicate positions as exact
      // content boundaries rather than either dropping half the narrative or
      // absorbing the unrelated detail stacked above/below it.
      if (upperCaption) vb.above[0] = Math.max(vb.above[0], upperCaption.y + (upperCaption.h || 0));
      if (lowerCaption) vb.below[1] = Math.min(vb.below[1], lowerCaption.y);
      const titleWords = new Set(clean(title.str).toUpperCase()
        .replace(SOO_PHRASE_RE, "")
        .split(/[^A-Z0-9]+/)
        .filter((word) => word.length >= 3 && !["SYSTEM", "THE", "AND"].includes(word)));
      const matchingDetailCaptionAbove = sheet.spans
        .filter((span) => {
          const text = clean(span.str).toUpperCase();
          if (text.length < 8 || text.length > 180
            || !/\b(?:DETAIL|SCHEMATIC|DIAGRAM)\b/.test(text)
            || NON_TITLE_SENTENCE_RE.test(text)) return false;
          const [, titleCy] = center(title);
          const [spanCx, spanCy] = center(span);
          if (spanCy >= titleCy || titleCy - spanCy > height * 0.55 || spanCx < x0 || spanCx > x1) return false;
          const overlap = [...titleWords].filter((word) => text.includes(word)).length;
          return overlap >= Math.min(2, titleWords.size);
        })
        .sort((a, b) => b.y - a.y)[0];
      // Some authored detail cells place a schematic/detail first, its caption
      // below the linework, then the SOO prose and the SOO caption at the very
      // bottom. The matching upstream detail caption is an exact boundary:
      // without it, short diagram labels ("PANEL TEMP", "MS1 AUX", etc.) are
      // falsely retained as narrative evidence. Shared title tokens are needed
      // so an unrelated adjacent detail cannot clip the sequence.
      if (matchingDetailCaptionAbove) {
        const captionBottom = matchingDetailCaptionAbove.y + (matchingDetailCaptionAbove.h || 0);
        vb.above[0] = Math.max(vb.above[0], captionBottom + Math.max(1, (matchingDetailCaptionAbove.h || 0) * 0.15));
        const numberedSteps = sheet.spans
          .filter((span) => {
            const text = clean(span.str);
            const spanCy = span.y + (span.h || 0) / 2;
            return NUMBERED_SECTION_RE.test(text)
              && overlapX(span, x0, x1)
              && spanCy > captionBottom
              && spanCy < title.y;
          })
          .sort((a, b) => a.y - b.y || a.x - b.x);
        const firstNumberedStep = numberedSteps[0];
        if (firstNumberedStep) {
          // Retain the section heading immediately above the numbered prose,
          // while dropping residual labels from the schematic that overlap
          // the detail-caption baseline.
          const headingReach = Math.max((firstNumberedStep.h || 0) * 2, (title.h || 0) * 1.2);
          vb.above[0] = Math.max(vb.above[0], firstNumberedStep.y - headingReach);
          const firstRowTolerance = Math.max(3, (firstNumberedStep.h || 0) * 0.6);
          const firstRowMarkers = numberedSteps.filter((span) => Math.abs(span.y - firstNumberedStep.y) <= firstRowTolerance);
          if (firstRowMarkers.length >= 2) {
            const rightmostMarker = Math.max(...firstRowMarkers.map((span) => span.x));
            x1 = Math.min(x1, rightmostMarker + width * 0.1);
          }
        }
      }
      const openingBoundary = openingSectionBoundaryAbove(title, sheet.spans,
        [x0, vb.above[0], x1, vb.above[1]], width);
      if (openingBoundary != null) vb.above[0] = Math.max(vb.above[0], openingBoundary);
      // An under-detail sequence may share its lane with a points table placed
      // immediately above the bottom sequence caption. When the intervening
      // block has multiple explicit table headers and no requirement prose,
      // the point-list heading is an authored boundary: keep the table in the
      // point-list pipeline and out of the SOO body.
      const pointListTop = pointListBoundaryAbove(title, sheet.spans, x0, x1, vb.above[0]);
      if (pointListTop != null) vb.above[1] = Math.min(vb.above[1], pointListTop);
      const matchingControlCaptionBelow = sheet.spans
        .filter((span) => {
          const text = clean(span.str).toUpperCase();
          if (!/\bCONTROL(?:\s+SYSTEM)?\s+(?:SCHEMATIC|DIAGRAM)\b/.test(text)) return false;
          const [, titleCy] = center(title);
          const [spanCx, spanCy] = center(span);
          if (spanCy <= titleCy || spanCy - titleCy > height * 0.5 || spanCx < x0 || spanCx > x1) return false;
          const overlap = [...titleWords].filter((word) => text.includes(word)).length;
          return overlap >= Math.min(2, titleWords.size);
        })
        .sort((a, b) => a.y - b.y)[0];
      // A controls-detail cell commonly has the exact shape:
      // sequence heading -> numbered prose -> matching control-diagram
      // caption. The caption is an authored lower boundary. Without it, a
      // sparse cell can absorb a points schedule or unrelated detail in the
      // next row even though every retained evidence bbox is individually
      // valid.
      if (matchingControlCaptionBelow) {
        vb.below[1] = Math.min(vb.below[1], matchingControlCaptionBelow.y);
      }
      const pairedSchematicBelow = matchingControlCaptionBelow != null;
      // A wrapped title's first line contains no SOO phrase on its own and can
      // otherwise pass the prose filter. End just before the complete title
      // evidence box so no title fragment is duplicated into the body.
      const aboveRegion: Bbox = [x0, vb.above[0], x1,
        Math.min(vb.above[1], title.y - Math.max(0.5, (title.h || 0) * 0.01))];
      const belowRegion: Bbox = [x0, vb.below[0], x1, vb.below[1]];
      const above = linesInRegion(sheet.spans, aboveRegion, width);
      const below = linesInRegion(sheet.spans, belowRegion, width);
      // Numbering is often emitted as its own tiny PDF text span ("1.") and
      // therefore intentionally fails isProse(). Inspect the raw positioned
      // spans for this direction cue while still using prose-only spans for
      // the extracted body.
      const nearbyBelow = sheet.spans.filter((span) =>
        overlapX(span, x0, x1)
        && span.y >= title.y + title.h
        && span.y <= title.y + title.h + Math.max(120, title.h * 3));
      const belowStartsAuthoredSection = nearbyBelow.some((span) => {
        const text = clean(span.str);
        return NUMBERED_SECTION_RE.test(text)
          || /^(?:GENERAL|DESCRIPTION|SYSTEM\s+DESCRIPTION|OCCUPIED(?:\s+MODE)?|UNOCCUPIED(?:\s+MODE)?|START(?:UP)?|SHUTDOWN|HEATING(?:\s+MODE)?|COOLING(?:\s+MODE)?|ALARMS?|SAFETIES|SET\s*POINTS?)\b[^.]{0,80}:?$/i.test(text);
      });
      // A numbered/labelled section immediately below a heading is strong
      // authored reading-order evidence. It beats a large amount of unrelated
      // prose elsewhere above the same column (dense controls sheets commonly
      // stack several sequences). A paired schematic directly below remains
      // the explicit exception: in that construction-detail convention the
      // sequence prose is intentionally printed above its caption.
      const useAbove = (pairedSchematicBelow && !belowStartsAuthoredSection)
        || (!belowStartsAuthoredSection && proseScore(above) >= proseScore(below));
      const lines = useAbove ? above : below;
      const region = useAbove ? aboveRegion : belowRegion;
      const sections = sectionsFromLines(sheet.key, lines, x1 - x0);
      const text = clean(title.str);
      out.push({
        id: `narrative:${sheet.key}:${Math.round(title.x)}:${Math.round(title.y)}`,
        sheet: sheet.key,
        title: text,
        title_evidence: { sheet: sheet.key, text, bbox: bboxOf(title) },
        region,
        direction: useAbove ? "above_title" : "below_title",
        status: sections.length ? "extracted" : "title_only",
        sections,
      });
    }
  }
  return out;
}
