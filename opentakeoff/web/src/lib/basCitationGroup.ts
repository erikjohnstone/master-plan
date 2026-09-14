/** SHOULD THIS BE ON THE SHARED PATH? Yes: this validates which immutable
 * source boxes a BAS citation owns. It never merges, expands, moves or infers
 * evidence; the union is exposed only as a viewport-centering aid.
 */

export type BasCitationBox = [number, number, number, number];
export interface BasCitationSpan {
  page_id: string;
  span_id?: string;
  text: string;
  bbox_px: BasCitationBox;
}

const validBox = (value: unknown): value is BasCitationBox => Array.isArray(value) && value.length === 4
  && value.every(Number.isFinite) && value[2] > value[0] && value[3] > value[1];

/** Build a UI request from exact retained spans. A malformed, foreign-page or
 * empty group refuses instead of falling back to a nearby or enclosing box.
 */
export function basCitationGroupRequest(pageId: string, rawSpans: unknown[], label: string) {
  if (!pageId || !Array.isArray(rawSpans) || !rawSpans.length || rawSpans.length > 1000) {
    throw new Error('The complete source group is unavailable; no nearby evidence was substituted.');
  }
  const spans: BasCitationSpan[] = [];
  const boxes = new Set<string>();
  for (const raw of rawSpans) {
    const span = raw as Partial<BasCitationSpan> | null;
    if (!span || (span.page_id && span.page_id !== pageId) || !validBox(span.bbox_px)) {
      throw new Error('The complete source group contains invalid or foreign-page evidence; nothing was highlighted.');
    }
    const key = JSON.stringify(span.bbox_px);
    if (boxes.has(key)) continue;
    boxes.add(key);
    spans.push({ page_id: pageId, ...(span.span_id ? { span_id: span.span_id } : {}),
      text: String(span.text || ''), bbox_px: [...span.bbox_px] as BasCitationBox });
  }
  if (!spans.length) throw new Error('The complete source group is unavailable; no nearby evidence was substituted.');
  return {
    page_id: pageId,
    sheet_id: pageId,
    bbox_px: [...spans[0].bbox_px] as BasCitationBox,
    source_spans: spans,
    value: spans.map(span => span.text).filter(Boolean).join(' '),
    citation_label: label.trim() || 'Complete source evidence',
    kind: 'source_group' as const,
  };
}

/** Exact boxes to paint. The legacy single-box request remains supported, but
 * a present source_spans array is authoritative and cannot silently collapse
 * to bbox_px when it is malformed.
 */
export function basCitationBoxes(request: unknown): BasCitationSpan[] {
  const row = request as { page_id?: unknown; sheet_id?: unknown; source_spans?: unknown; bbox_px?: unknown; value?: unknown } | null;
  const pageId = typeof row?.page_id === 'string' ? row.page_id
    : typeof row?.sheet_id === 'string' ? row.sheet_id : '';
  if (Array.isArray(row?.source_spans)) {
    return basCitationGroupRequest(pageId, row.source_spans, '').source_spans;
  }
  if (!pageId || !validBox(row?.bbox_px)) return [];
  return [{ page_id: pageId, text: String(row?.value || ''), bbox_px: [...row.bbox_px] as BasCitationBox }];
}

/** Display-only extent used to center all exact boxes in view. Never paint or
 * persist this union as source evidence.
 */
export function basCitationFocusBox(spans: BasCitationSpan[]): BasCitationBox | null {
  if (!spans.length) return null;
  return [Math.min(...spans.map(span => span.bbox_px[0])), Math.min(...spans.map(span => span.bbox_px[1])),
    Math.max(...spans.map(span => span.bbox_px[2])), Math.max(...spans.map(span => span.bbox_px[3]))];
}
