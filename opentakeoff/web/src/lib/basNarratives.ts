/** SHOULD THIS BE ON THE SHARED PATH? Yes: BAS source discovery/accounting.
 * A text-only lane alongside graph/table extraction, not a VectorGrid change.
 * All reconstructed text is a reading aid; immutable source spans are authority.
 */
import type { BasSourceContext, BasSourcePage, BasSourceSpan } from './basSources.ts';

type Box = BasSourceSpan['bbox_px'];
export interface BasNarrativeLine {
  line_id: string;
  span_ids: string[];
  bbox_px: Box;
  text: string;
  geometry_status: 'ordered' | 'inline_label_overlap' | 'overlapping_spans';
}
export interface BasNarrativeParagraph {
  kind: 'paragraph';
  block_id: string;
  marker: string | null;
  indent_px: number;
  lines: BasNarrativeLine[];
}
export interface BasNarrativeInset {
  kind: 'columnar';
  block_id: string;
  /** A source-layout candidate, not a typed/normalized engineering table. */
  interpretation_status: 'uninterpreted';
  rows: BasNarrativeLine[][];
}
export type BasNarrativeBlock = BasNarrativeParagraph | BasNarrativeInset;
export interface BasNarrativeRegion {
  region_id: string;
  page_id: string;
  status: 'body_detected' | 'heading_only' | 'segmentation_conflict';
  interpretation_status: 'uninterpreted';
  title: string;
  heading: BasNarrativeLine;
  heading_context: BasNarrativeLine[];
  blocks: BasNarrativeBlock[];
  bbox_px: Box;
  boundary: 'next_heading' | 'vertical_gap' | 'font_change' | 'ambiguous_lines' | 'non_narrative_label' | 'end_of_aligned_text';
  review_required: true;
}
export interface BasNarrativePage {
  page_id: string;
  text_status: BasSourcePage['text_status'];
  regions: BasNarrativeRegion[];
  /** Exhaustive, disjoint span partition. Unassigned is NOT irrelevant/empty. */
  accounting: {
    body_region_span_ids: string[];
    heading_only_span_ids: string[];
    ambiguous_span_ids: string[];
    unassigned_horizontal_span_ids: string[];
    unsupported_span_ids: string[];
    blank_span_ids: string[];
  };
}
export interface BasNarrativeDiscovery {
  schema_version: 'bas_narrative_discovery_v1';
  rule_version: 'horizontal_headed_regions_v1';
  coordinate_frame: 'image_px';
  discovery_complete: false;
  interpretation_complete: false;
  pages: BasNarrativePage[];
  limitations: string[];
}

const height = (b: Box) => b[3] - b[1];
const centerY = (b: Box) => (b[1] + b[3]) / 2;
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const union = (boxes: Box[]): Box => [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])),
  Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))];
const horizontal = (s: BasSourceSpan) => ((s.rotation ?? 0) % 360 + 360) % 360 === 0
  && height(s.bbox_px) > 0 && s.bbox_px[2] > s.bbox_px[0];
const marker = (text: string): string | null => text.match(/^(\d+(?:\.\d+)*(?:[.)])?|[A-Za-z][.)]|\((?:[A-Za-z]|\d{1,3}|[ivxIVX]{1,6})\))\s+/)?.[1] ?? null;

/** Deliberately stricter than the legacy table-title presence detector: a prose
 * sentence merely mentioning a sequence is not a new heading/region. */
export function isBasNarrativeHeading(value: string): boolean {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length > 180 || /[.!?]\s+[A-Za-z]|\b(?:SHALL|MUST|REFER|SEE|FOLLOWING)\b/i.test(text)) return false;
  return /\b(?:CONTROL\s+SEQUENCES?|SYSTEM\s+OPERATION\s+SEQUENCES?|CONTROLS?\s+NARRATIVE|SEQUENCES?\s+OF\s+(?:OPERATIONS?|CONTROL))\s*(?:\((?:CONTINUED|CONT['’]?D)\))?\s*:?[\s]*$/i.test(text)
    || /^SEQUENCES?\s+OF\s+(?:OPERATIONS?|CONTROL)\s*[:–—-]?\s+[\w ()/,&-]+:?$/i.test(text);
}

/** Geometric line grouping is page-local and does not modify the raw adapter.
 * Split large horizontal gaps so independent columns do not share a line. */
function pageLines(page: BasSourcePage): BasNarrativeLine[] {
  const spans = page.spans.filter(s => s.text.trim() && horizontal(s)).sort((a, b) =>
    centerY(a.bbox_px) - centerY(b.bbox_px) || a.bbox_px[0] - b.bbox_px[0] || a.source_index - b.source_index);
  const rows: Array<{ cy: number; h: number; spans: BasSourceSpan[] }> = [];
  const maxH = spans.reduce((h, s) => Math.max(h, height(s.bbox_px)), 0);
  for (const span of spans) {
    const cy = centerY(span.bbox_px), h = height(span.bbox_px);
    let row: typeof rows[number] | undefined;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (cy - rows[i].cy > maxH * 0.25) break;
      if (Math.abs(cy - rows[i].cy) <= Math.min(h, rows[i].h) * 0.25) { row = rows[i]; break; }
    }
    if (row) row.spans.push(span);
    else rows.push({ cy, h, spans: [span] });
  }
  const lines: BasNarrativeLine[] = [];
  const emit = (group: BasSourceSpan[]) => {
    let text = '';
    let overlapping = false, labelOverlap = false;
    group.forEach((span, i) => {
      const gap = i ? span.bbox_px[0] - group[i - 1].bbox_px[2] : 0;
      const minH = i ? Math.min(height(span.bbox_px), height(group[i - 1].bbox_px)) : 0;
      const previousWidth = i ? group[i - 1].bbox_px[2] - group[i - 1].bbox_px[0] : 0;
      // PDF text-run boxes can slightly overlap at a bold inline label even
      // when the printed text is readable. Keep that condition explicit; do
      // not forgive a duplicated/overlaid sentence or heading.
      const inlineLabel = i > 0 && (/:\s*$/.test(text) || /^\s*:/.test(span.text)) && gap < 0
        && -gap <= Math.min(minH * 3.2, previousWidth * 0.15);
      if (inlineLabel) labelOverlap = true;
      else if (i && gap < -minH * 0.25) overlapping = true;
      // Only inserted inter-fragment spaces; source text is retained verbatim.
      if (i && (gap > minH * 0.12 || (inlineLabel && !/^\s*:/.test(span.text)))
          && !/\s$/.test(text) && !/^\s/.test(span.text)) text += ' ';
      text += span.text;
    });
    lines.push({ line_id: `${page.page_id}:line${Math.min(...group.map(s => s.source_index))}`,
      span_ids: group.map(s => s.span_id), bbox_px: union(group.map(s => s.bbox_px)), text,
      geometry_status: overlapping ? 'overlapping_spans' : labelOverlap ? 'inline_label_overlap' : 'ordered' });
  };
  for (const row of rows) {
    const ordered = row.spans.sort((a, b) => a.bbox_px[0] - b.bbox_px[0] || a.source_index - b.source_index);
    let group: BasSourceSpan[] = [];
    for (const span of ordered) {
      const previous = group.at(-1);
      if (previous && span.bbox_px[0] - previous.bbox_px[2] > Math.min(height(span.bbox_px), height(previous.bbox_px)) * 2.2) {
        emit(group); group = [];
      }
      group.push(span);
    }
    if (group.length) emit(group);
  }
  return lines.sort((a, b) => centerY(a.bbox_px) - centerY(b.bbox_px) || a.bbox_px[0] - b.bbox_px[0] || compareId(a.line_id, b.line_id));
}

function paragraphs(lines: BasNarrativeLine[], left: number): BasNarrativeParagraph[] {
  const out: BasNarrativeParagraph[] = [];
  for (const line of lines) {
    const current = out.at(-1), label = marker(line.text.trim());
    const previous = current?.lines.at(-1);
    if (!current || label || (previous && centerY(line.bbox_px) - centerY(previous.bbox_px) > height(previous.bbox_px) * 1.8)) {
      out.push({ kind: 'paragraph', block_id: `${line.line_id}:paragraph`, marker: label,
        indent_px: line.bbox_px[0] - left, lines: [line] });
    } else current.lines.push(line);
  }
  return out;
}

export function basNarrativeRegionLines(region: BasNarrativeRegion): BasNarrativeLine[] {
  return [...region.heading_context, region.heading, ...region.blocks.flatMap(block => block.kind === 'paragraph' ? block.lines : block.rows.flat())];
}

function headingContext(heading: BasNarrativeLine, lines: BasNarrativeLine[]): BasNarrativeLine[] {
  const h = height(heading.bbox_px);
  const previous = lines.filter(l => centerY(l.bbox_px) < centerY(heading.bbox_px)
    && centerY(heading.bbox_px) - centerY(l.bbox_px) <= h * 1.5
    && Math.abs(l.bbox_px[0] - heading.bbox_px[0]) <= h * 0.3
    && height(l.bbox_px) / h >= 0.8 && height(l.bbox_px) / h <= 1.2).at(-1);
  if (!previous || previous.geometry_status !== 'ordered' || previous.text.length > 120
      || previous.text !== previous.text.toUpperCase() || previous.text.trim().split(/\s+/).length < 2
      || /[:.!?]|\b(?:SHALL|MUST|REFER|SEE|NOT)\b/.test(previous.text) || isBasNarrativeHeading(previous.text)) return [];
  return [previous];
}

function shortCell(line: BasNarrativeLine): boolean {
  const text = line.text.trim();
  return line.geometry_status === 'ordered' && text.length <= 65 && text.split(/\s+/).length <= 8
    && !/^(?:[A-Za-z][.)]|\d+[.)])\s*$/.test(text) && !/\b(?:SHALL|MUST|WILL)\b/i.test(text);
}

/** Keep small, repeated-column insets separate from prose. Header text runs
 * may share a line, so recover their original fragments only after matching
 * two subsequent column rows. No values or engineering relationships inferred. */
function blocksFromRows(rows: BasNarrativeLine[][], page: BasSourcePage, left: number): BasNarrativeBlock[] {
  const blocks: BasNarrativeBlock[] = [];
  let pending: BasNarrativeLine[] = [];
  const spans = new Map(page.spans.map(s => [s.span_id, s]));
  const flush = () => { blocks.push(...paragraphs(pending, left)); pending = []; };
  const compatible = (a: BasNarrativeLine[], b: BasNarrativeLine[]) => a.length === b.length
    && a.every((cell, i) => Math.abs(cell.bbox_px[0] - b[i].bbox_px[0]) <= height(cell.bbox_px) * 0.8
      || Math.min(cell.bbox_px[2], b[i].bbox_px[2]) > Math.max(cell.bbox_px[0], b[i].bbox_px[0]));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], next = rows[i + 1];
    if (row.length > 1 && row.length <= 4 && row.every(shortCell) && next && next.every(shortCell) && compatible(row, next)) {
      const insetRows: BasNarrativeLine[][] = [row];
      while (rows[i + 1] && rows[i + 1].every(shortCell) && compatible(insetRows.at(-1)!, rows[i + 1])) insetRows.push(rows[++i]);
      const previous = pending.at(-1);
      if (previous && centerY(row[0].bbox_px) - centerY(previous.bbox_px) < height(row[0].bbox_px) * 1.8) {
        const fragments = previous.span_ids.map(id => spans.get(id)!);
        const cells: BasNarrativeLine[] = fragments.map(s => ({ line_id: `${previous.line_id}:fragment${s.source_index}`,
          span_ids: [s.span_id], bbox_px: [...s.bbox_px], text: s.text, geometry_status: 'ordered' }));
        if (cells.length === row.length && cells.every(shortCell) && cells.every((cell, j) =>
          Math.min(cell.bbox_px[2], row[j].bbox_px[2]) > Math.max(cell.bbox_px[0], row[j].bbox_px[0]))) {
          pending.pop(); insetRows.unshift(cells);
        }
      }
      flush();
      blocks.push({ kind: 'columnar', block_id: `${insetRows[0][0].line_id}:inset`, interpretation_status: 'uninterpreted', rows: insetRows });
    } else if (row.length === 1) pending.push(row[0]);
    else {
      flush();
      blocks.push({ kind: 'columnar', block_id: `${row[0].line_id}:inset`, interpretation_status: 'uninterpreted', rows: [row] });
    }
  }
  flush();
  return blocks;
}

function discoverRegion(page: BasSourcePage, heading: BasNarrativeLine, lines: BasNarrativeLine[]): BasNarrativeRegion {
  const h = height(heading.bbox_px), x = heading.bbox_px[0];
  const aligned = lines.filter(line => centerY(line.bbox_px) > centerY(heading.bbox_px) + h * 0.5
    && line.bbox_px[0] >= x - h * 0.6 && line.bbox_px[0] <= x + h * 6);
  const body: BasNarrativeLine[] = [];
  const bodyRows: BasNarrativeLine[][] = [];
  let boundary: BasNarrativeRegion['boundary'] = 'end_of_aligned_text';
  let bodyH = h;
  for (let i = 0; i < aligned.length; i++) {
    const line = aligned[i], previous = body.at(-1) ?? heading;
    if (heading.geometry_status === 'overlapping_spans' || line.geometry_status === 'overlapping_spans') { boundary = 'ambiguous_lines'; break; }
    if (centerY(line.bbox_px) - centerY(previous.bbox_px) > bodyH * 3.3) { boundary = 'vertical_gap'; break; }
    if (isBasNarrativeHeading(line.text)) { boundary = 'next_heading'; break; }
    const ratio = height(line.bbox_px) / bodyH;
    if (ratio < (body.length ? 0.8 : 0.3) || ratio > 1.3) { boundary = 'font_change'; break; }
    const next = aligned[i + 1];
    if (next && Math.abs(centerY(next.bbox_px) - centerY(line.bbox_px)) < height(line.bbox_px) * 0.5) {
      const row = [line];
      while (aligned[i + 1] && Math.abs(centerY(aligned[i + 1].bbox_px) - centerY(line.bbox_px)) < height(line.bbox_px) * 0.5) row.push(aligned[++i]);
      if (!body.length || row.length > 4 || !row.every(shortCell)) { boundary = 'ambiguous_lines'; break; }
      body.push(...row); bodyRows.push(row); continue;
    }
    if (!body.length) {
      // Reject caption scale/diagram labels. A short labeled subsection can
      // lead a real body, e.g. "1. DOAS:". It is not itself a counted device.
      if (/^(?:NOT (?:DRAWN )?TO SCALE\b|SCALE\s*:|N\.?T\.?S\.?$)/i.test(line.text.trim())
          || (!marker(line.text.trim()) && line.text.trim().split(/\s+/).length < 4)) {
        boundary = 'non_narrative_label'; break;
      }
      bodyH = height(line.bbox_px);
    }
    body.push(line); bodyRows.push([line]);
  }
  const context = headingContext(heading, lines);
  const blocks = blocksFromRows(bodyRows, page, x);
  // A lone fragmented row cannot establish the inset's structure.
  const incompleteInset = blocks.some(block => block.kind === 'columnar' && block.rows.length < 2);
  return { region_id: `${heading.line_id}:narrative`, page_id: page.page_id,
    status: boundary === 'ambiguous_lines' || incompleteInset || heading.geometry_status === 'overlapping_spans' ? 'segmentation_conflict' : body.length ? 'body_detected' : 'heading_only',
    interpretation_status: 'uninterpreted', title: [...context, heading].map(l => l.text).join('\n'),
    heading, heading_context: context, blocks,
    bbox_px: union([...context.map(l => l.bbox_px), heading.bbox_px, ...body.map(line => line.bbox_px)]), boundary, review_required: true };
}

/** Input is the validated buildBasSourceContext / Session snapshot. No I/O or
 * model calls, no table/quantity output, no cross-page implicit continuation. */
export function discoverBasNarratives(context: BasSourceContext): BasNarrativeDiscovery {
  const pages = context.pages.map(page => {
    const lines = pageLines(page);
    const regions = lines.filter(line => isBasNarrativeHeading(line.text)).map(heading => discoverRegion(page, heading, lines));
    const overlapping = new Set(lines.filter(line => line.geometry_status === 'overlapping_spans').flatMap(line => line.span_ids));
    const owners = new Map<string, BasNarrativeRegion[]>();
    for (const region of regions) {
      for (const line of basNarrativeRegionLines(region)) {
        for (const id of line.span_ids) owners.set(id, [...(owners.get(id) ?? []), region]);
      }
    }
    for (const list of owners.values()) if (list.length > 1) for (const region of list) region.status = 'segmentation_conflict';
    const accounting: BasNarrativePage['accounting'] = { body_region_span_ids: [], heading_only_span_ids: [],
      ambiguous_span_ids: [], unassigned_horizontal_span_ids: [], unsupported_span_ids: [], blank_span_ids: [] };
    for (const span of page.spans) {
      const list = owners.get(span.span_id);
      if (list?.some(r => r.status === 'segmentation_conflict')) accounting.ambiguous_span_ids.push(span.span_id);
      else if (list?.length) accounting[list[0].status === 'body_detected' ? 'body_region_span_ids' : 'heading_only_span_ids'].push(span.span_id);
      else if (!span.text.trim()) accounting.blank_span_ids.push(span.span_id);
      else if (!horizontal(span) || overlapping.has(span.span_id)) accounting.unsupported_span_ids.push(span.span_id);
      else accounting.unassigned_horizontal_span_ids.push(span.span_id);
    }
    return { page_id: page.page_id, text_status: page.text_status, regions, accounting };
  });
  return { schema_version: 'bas_narrative_discovery_v1', rule_version: 'horizontal_headed_regions_v1',
    coordinate_frame: 'image_px', discovery_complete: false, interpretation_complete: false, pages,
    limitations: [
      'Discovers explicit, horizontal, left-aligned sequence headings and nearby aligned text. All regions require boundary review; body_detected does not mean completely discovered or interpreted.',
      'Unassigned text may contain requirements, general notes, unlabeled prose, tables or diagrams. No detected heading is not proof of no SOO.',
      'Rotated/degenerate text is accounted for but not interpreted. Textless pages need source review; no OCR or raster inference is performed.',
      'Repeated titles stay separate. Continuation and equipment applicability require explicit evidence or reviewed assignment; no automatic cross-page merge or installed count.',
    ] };
}
