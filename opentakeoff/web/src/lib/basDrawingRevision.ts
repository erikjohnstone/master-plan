/** Shared source ownership, complete page accounting and immutable replay.
 * Consumes retained captures, never active filenames or a newer page's bbox. */
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';
import type { BasSourceContext, BasSourceDocument } from './basSources.ts';
import { BAS_DRAWING_RULE, BAS_DRAWING_PAGE_LIMIT, BAS_DRAWING_HISTORY_PAGE_LIMIT,
  type BasDrawingAction, type BasDrawingEvent, type BasDrawingPageRef } from './basDrawingContract.ts';

export interface BasDrawingCapture {
  capture_id: string; sources: BasSourceDocument[]; narrative_sources?: BasSourceContext;
}
export interface BasDrawingSourceSet {
  source_set_id: string; name: string; pages: BasDrawingPageRef[];
  origin: BasDrawingEvent['origin'];
}
export interface BasDrawingReplay {
  head: string | null; source_sets: Map<string, BasDrawingSourceSet>;
  revisions: Array<{ event_id: string; source_set_id: string | null; unresolved_pages: number }>;
}

/** Capture identity binds all retained interpretation. A set ID binds its exact
 * prior event, including source order and correspondence decisions. */
export function basDrawingDependencyFingerprint(action: BasDrawingAction) {
  const inputs = action.kind === 'create_source_set' ? { pages: action.pages }
    : { baseline_source_set_id: action.baseline_source_set_id,
      incoming_capture_id: action.incoming_capture_id, mode: action.mode };
  return sha256Hex(new TextEncoder().encode(canonicalBasJson({ rule_version: BAS_DRAWING_RULE, ...inputs })));
}

/** Enumerates original page identities, including pages with no retained text. */
export function basDrawingCapturePages(capture: BasDrawingCapture): BasDrawingPageRef[] {
  const count = capture.sources.reduce((n, s) => n + s.page_count, 0);
  if (!Number.isSafeInteger(count) || count > BAS_DRAWING_PAGE_LIMIT) throw new Error('Drawing capture exceeds the 25,000-page inventory limit');
  return [...capture.sources].sort((a, b) => a.source_id.localeCompare(b.source_id)).flatMap(s =>
    Array.from({ length: s.page_count }, (_, i) => ({ capture_id: capture.capture_id, page_id: `${s.source_id}:p${i + 1}` })));
}

/** Synchronous structural gate used by workflow parse/import/merge. Call the
 * workflow verifier for cryptographic capture/event/dependency checks as well. */
export function replayBasDrawingHistory(captures: BasDrawingCapture[], events: BasDrawingEvent[] = []): BasDrawingReplay {
  const byCapture = new Map(captures.map(c => [c.capture_id, c]));
  const inventories = new Map<string, BasDrawingPageRef[]>();
  const ownedPages = new Map<string, Set<string>>();
  const inventory = (id: string) => {
    if (!inventories.has(id)) {
      const capture = byCapture.get(id);
      if (!capture) throw new Error('Drawing review references a foreign capture');
      const pages = basDrawingCapturePages(capture);
      inventories.set(id, pages); ownedPages.set(id, new Set(pages.map(p => p.page_id)));
    }
    return inventories.get(id)!;
  };
  const own = (page: BasDrawingPageRef) => {
    inventory(page.capture_id);
    if (!ownedPages.get(page.capture_id)!.has(page.page_id)) throw new Error('Drawing page is not owned by its retained capture');
  };
  const result: BasDrawingReplay = { head: null, source_sets: new Map(), revisions: [] };
  let pageEntries = 0;
  const operations = new Set<string>(), ids = new Set<string>();
  for (const event of events) {
    if (event.expected_head !== result.head) throw new Error('Divergent or incomplete drawing review history');
    if (operations.has(event.operation_id) || ids.has(event.event_id)) throw new Error('Duplicate drawing operation/event');
    operations.add(event.operation_id); ids.add(event.event_id);
    const action = event.action;
    pageEntries += action.kind === 'create_source_set' ? action.pages.length : action.baseline.length + action.incoming.length;
    if (pageEntries > BAS_DRAWING_HISTORY_PAGE_LIMIT) throw new Error('Drawing history exceeds the 250,000 page-accounting-entry limit');
    let pages: BasDrawingPageRef[] | null;
    if (action.kind === 'create_source_set') {
      action.pages.forEach(own);
      pages = action.pages;
    } else {
      const baseline = result.source_sets.get(action.baseline_source_set_id);
      if (!baseline) throw new Error('Revision baseline must be a preceding complete source set');
      const incoming = inventory(action.incoming_capture_id);
      const baseEntries = new Map(action.baseline.map(b => [b.page.page_id, b]));
      const nextEntries = new Map(action.incoming.map(p => [p.page_id, p]));
      if (baseEntries.size !== action.baseline.length || baseEntries.size !== baseline.pages.length
        || baseline.pages.some(p => baseEntries.get(p.page_id)?.page.capture_id !== p.capture_id)) {
        throw new Error('Every baseline page must be accounted for exactly once with its original capture');
      }
      if (nextEntries.size !== action.incoming.length || nextEntries.size !== incoming.length
        || incoming.some(p => !nextEntries.has(p.page_id))) throw new Error('Every incoming page must be accounted for exactly once');
      for (const b of action.baseline) {
        if (b.disposition === 'replaced') {
          const next = b.incoming_page_id === null ? null : nextEntries.get(b.incoming_page_id);
          if (!next || next.disposition !== 'replacement' || next.baseline_page_id !== b.page.page_id) {
            throw new Error('Replacement must have a reciprocal one-to-one incoming page');
          }
        } else if (b.incoming_page_id !== null) throw new Error('Only replaced baseline pages may name an incoming replacement');
      }
      for (const next of action.incoming) {
        const base = next.baseline_page_id === null ? null : baseEntries.get(next.baseline_page_id);
        if (next.disposition === 'replacement') {
          if (!base || base.disposition !== 'replaced' || base.incoming_page_id !== next.page_id) {
            throw new Error('Incoming replacement must have a reciprocal one-to-one baseline page');
          }
        } else if (next.disposition === 'redundant') {
          if (!base || base.disposition !== 'retained' || base.page.page_id !== next.page_id) {
            throw new Error('Redundant upload must reference the identical retained physical page');
          }
        } else if (next.baseline_page_id !== null) throw new Error('Unpaired incoming pages cannot claim a baseline correspondence');
      }
      const unresolved = action.baseline.filter(b => b.disposition === 'unresolved').length
        + action.incoming.filter(p => p.disposition === 'unresolved').length;
      pages = unresolved ? null : baseline.pages.flatMap(p => {
        const b = baseEntries.get(p.page_id)!;
        return b.disposition === 'retained' ? [p] : b.disposition === 'replaced'
          ? [{ capture_id: action.incoming_capture_id, page_id: b.incoming_page_id! }] : [];
      }).concat(incoming.filter(p => nextEntries.get(p.page_id)!.disposition === 'addition'));
      result.revisions.push({ event_id: event.event_id, source_set_id: pages ? event.event_id : null, unresolved_pages: unresolved });
    }
    if (pages) {
      if (pages.length > BAS_DRAWING_PAGE_LIMIT) throw new Error('Reviewed source set exceeds the 25,000-page limit');
      if (new Set(pages.map(p => p.page_id)).size !== pages.length) throw new Error('A source set cannot include the same physical page twice');
      result.source_sets.set(event.event_id, { source_set_id: event.event_id, name: action.name,
        pages: pages.map(p => ({ ...p })), origin: event.origin });
    }
    result.head = event.event_id;
  }
  return result;
}

/** Suggestions only: no journal write, changed-byte pairing, quantity or approval.
 * Caller must show and explicitly confirm the complete accounting. */
export function suggestBasDrawingRevision(baseline: BasDrawingSourceSet, incoming: BasDrawingCapture,
  mode: 'replacement_set' | 'partial_addendum', name: string): Extract<BasDrawingAction, { kind: 'review_revision' }> {
  const next = basDrawingCapturePages(incoming), nextIds = new Set(next.map(p => p.page_id));
  const previous = new Set(baseline.pages.map(p => p.page_id));
  return { kind: 'review_revision', name, baseline_source_set_id: baseline.source_set_id,
    incoming_capture_id: incoming.capture_id, mode,
    baseline: baseline.pages.map(page => ({ page: { ...page }, incoming_page_id: null,
      disposition: nextIds.has(page.page_id) || mode === 'partial_addendum' ? 'retained' : 'unresolved',
      reason: nextIds.has(page.page_id) ? 'Same original source page; retain its existing capture binding.'
        : mode === 'partial_addendum' ? 'Absent from this partial addendum; proposed retention requires confirmation.'
          : 'No exact-source correspondence; explicit replacement, retention or removal review required.' })),
    incoming: next.map(page => ({ page_id: page.page_id,
      disposition: previous.has(page.page_id) ? 'redundant' : 'unresolved',
      baseline_page_id: previous.has(page.page_id) ? page.page_id : null,
      reason: previous.has(page.page_id) ? 'Same original source page; no additional page instance.'
        : 'New source version or page; explicit addition or correspondence review required.' })),
  };
}

/** Exact retained text/frame comparison only; no full-ink or quantity inference. */
export function compareBasDrawingPages(captures: BasDrawingCapture[], before: BasDrawingPageRef, after: BasDrawingPageRef) {
  const get = (ref: BasDrawingPageRef) => {
    const capture = captures.find(c => c.capture_id === ref.capture_id);
    if (!capture || !basDrawingCapturePages(capture).some(p => p.page_id === ref.page_id)) throw new Error('Comparison page is not owned by its retained capture');
    return capture.narrative_sources?.pages.find(p => p.page_id === ref.page_id);
  };
  const a = get(before), b = get(after);
  const content = (page: NonNullable<typeof a>) => ({ width_px: page.width_px, height_px: page.height_px,
    rotation: page.rotation, spans: page.spans.map(s => ({ text: s.text, bbox_px: s.bbox_px, rotation: s.rotation ?? null })) });
  return { before: { ...before }, after: { ...after },
    source_identity: before.page_id === after.page_id ? 'same_original_page' as const : 'different_original_page' as const,
    capture_identity: before.capture_id === after.capture_id ? 'same_capture' as const : 'different_capture' as const,
    retained_text_geometry: !a || !b || a.text_status === 'no_text' || b.text_status === 'no_text' ? 'unavailable' as const
      : canonicalBasJson(content(a)) === canonicalBasJson(content(b)) ? 'equal' as const : 'changed' as const,
    comparison_scope: 'available_retained_text_and_page_frame_only' as const,
    semantic_changes: 'not_assessed' as const, quantity_changes: 'not_assessed' as const,
    approval_impact: 'not_assessed' as const, source_bytes: 'not_verified' as const,
  };
}
