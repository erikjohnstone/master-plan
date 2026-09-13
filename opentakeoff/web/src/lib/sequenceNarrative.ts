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
const SOO_TITLE_RE = /^(?=.{8,180}$)(?:[A-Z0-9][A-Z0-9 /&(),.'\-–—]{0,110}\s+[-–—:]?\s*)?(?:SEQUENCES?\s+OF\s+(?:OPERATIONS?|CONTROL)|CONTROLS?\s+(?:SEQUENCES?|NARRATIVE)|CONTROL\s+SEQUENCE)(?:\s*[-–—:]\s*[A-Z0-9][A-Z0-9 /&(),.'\-–—]{0,70}|\s*\([^)]{1,70}\))?[:.]?$/i;
const NON_TITLE_SENTENCE_RE = /\b(?:SHALL|WHEN|VERIFY|PROVIDE|PERFORM|DESCRIBED|RELATED|DISABLED|ADEQUACY|ACCURACY|REFER(?:ENCE)?|SEE|INSTALL|APPLIES|REQUIRED|ACHIEVE|ACCOMPLISH|ACCORDANCE)\b/i;
const DETAIL_TITLE_RE = /\b(?:CONTROL(?:\s+SYSTEM)?\s+(?:SCHEMATIC|DIAGRAM)|RISER(?:\s+DIAGRAM)?|SEQUENCES?\s+OF\s+OPERATIONS?)\b/i;
const SECTION_RE = /^(?:(?:\d+|[A-Z])\s*[.)]\s+|(?:GENERAL|DESCRIPTION|SYSTEM\s+DESCRIPTION|OCCUPIED(?:\s+MODE)?|UNOCCUPIED(?:\s+MODE)?|START(?:UP)?|SHUTDOWN|WARM[- ]?UP|COOL[- ]?DOWN|HEATING(?:\s+MODE)?|COOLING(?:\s+MODE)?|HUMIDIFICATION(?:\s+MODE)?|DEHUMIDIFICATION(?:\s+MODE)?|ALARMS?|SAFETIES|FAILURE\s+MODES?|POINTS?\s+LIST)\b[^.]{0,100}:?)/i;
const TITLE_BLOCK_RE = /^(?:SHEET|DRAWING|PROJECT|DATE|REV(?:ISION)?|DESIGNED|DRAWN|CHECKED|APPROVED|LICENSED|BID\s+SET|ISSUED\s+FOR)\b/i;

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
    if (possible[0]) candidates.push(possible[0]);
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
    .map(center)
    .map(([x]) => x)
    .filter((x) => Math.abs(x - cx) > laneSeparation);
  const left = otherLanes.filter((x) => x < cx).sort((a, b) => b - a)[0];
  const right = otherLanes.filter((x) => x > cx).sort((a, b) => a - b)[0];
  // A single wide detail routinely uses several prose columns.  The generous
  // expansion is bounded by neighboring same-row detail titles and the title
  // block margin, not by an arbitrary table shape.
  // A single wide construction detail may use several prose columns, with
  // long lines emitted as adjacent PDF spans. Preserve that reach; authored
  // neighboring sequence and schedule headings provide the lane barriers.
  const expandedLeft = title.x - width * 0.34;
  const expandedRight = title.x + title.w + width * 0.34;
  return [
    Math.max(width * 0.015, left == null ? expandedLeft : Math.max((left + cx) / 2, title.x - width * 0.08)),
    Math.min(width * 0.93, right == null ? expandedRight : Math.min((right + cx) / 2, title.x + title.w + width * 0.08)),
  ];
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

function linesInRegion(spans: GraphSpan[], bounds: Bbox, width: number): GraphSpan[] {
  const [x0, y0, x1, y1] = bounds;
  return spans.filter((span) => isHorizontalText(span)
    && isProse(span, width)
    && overlapX(span, x0, x1)
    && span.y + (span.h || 0) >= y0
    && span.y <= y1);
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
    const numbered = text.match(/^((?:\d+|[A-Z])\s*[.)])\s*(.*)$/);
    const headingLike = SECTION_RE.test(text) && (
      numbered != null
      || /:$/.test(text)
      || (text.length <= 105 && !/[.!?]$/.test(text))
    );
    if (!current || headingLike) {
      const heading = numbered?.[1] || (headingLike ? text.replace(/:\s*$/, "") : "Narrative");
      const initialBody = numbered?.[2] || (headingLike ? "" : text);
      current = {
        heading,
        body: initialBody,
        evidence: [{ sheet, text, bbox: bboxOf(span) }],
      };
      sections.push(current);
    } else {
      current.body = `${current.body}${current.body ? " " : ""}${text}`;
      current.evidence.push({ sheet, text, bbox: bboxOf(span) });
    }
  }
  return sections.filter((section) => clean(section.body).length >= 8 || section.evidence.length > 1);
}

/** Extract authored free-form SOO blocks from positioned spans. */
export function extractSequenceNarratives(sheets: SheetSpans[]): NarrativeSequenceBlock[] {
  const out: NarrativeSequenceBlock[] = [];
  for (const sheet of sheets) {
    const rawTitles = sequenceTitleSpans(sheet.spans);
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
    const titleByText = new Map<string, GraphSpan>();
    for (const title of filteredTitles) {
      const key = clean(title.str).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
      const prior = titleByText.get(key);
      if (!prior || (title.h || 0) > (prior.h || 0)) titleByText.set(key, title);
    }
    const titles = [...titleByText.values()];
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
      const [x0, x1] = horizontalBounds(title, [...titles, ...structuralLaneMarkers], width, height);
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
      const aboveRegion: Bbox = [x0, vb.above[0], x1, vb.above[1]];
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
        return /^(?:\d+|[A-Z])\s*[.)](?:\s+|$)/.test(text)
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
  // A drawing often prints the same title twice: once over the narrative and
  // once as the numbered detail caption (or again in the vertical title
  // block). Vertical copies were excluded above; choose one evidence-rich
  // horizontal block per normalized title and sheet. Larger authored title
  // text wins ties, then the block containing more positioned evidence.
  const best = new Map<string, NarrativeSequenceBlock>();
  const score = (block: NarrativeSequenceBlock) => {
    const titleHeight = block.title_evidence.bbox[3] - block.title_evidence.bbox[1];
    const evidence = block.sections.reduce((sum, section) => sum + section.evidence.length, 0);
    return titleHeight * 1000 + evidence;
  };
  for (const block of out) {
    const key = `${block.sheet}|${clean(block.title).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()}`;
    const prior = best.get(key);
    if (!prior || score(block) > score(prior)) best.set(key, block);
  }
  return [...best.values()];
}
