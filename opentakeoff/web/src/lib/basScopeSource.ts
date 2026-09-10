/** Shared exact retained source lookup. No interpretation or coordinate change. */
import type { BasWorkflow } from './basWorkflow.ts';
import { basCoverageUnitSchema } from './basScopeReviewContract.ts';
import { basDrawingCapturePages } from './basDrawingRevision.ts';

/** Internal caller owns/has verified its workflow. */
export function sourceForBasScopeCoverage(workflow: BasWorkflow, rawUnit: unknown) {
  const unit = basCoverageUnitSchema.parse(rawUnit), capture = workflow.captures.find(c => c.capture_id === unit.capture_id);
  if (!capture || !basDrawingCapturePages(capture).some(p => p.page_id === unit.page_id)) throw new Error('Coverage source is not owned by its exact retained capture');
  const page = capture.narrative_sources?.pages.find(p => p.page_id === unit.page_id);
  const bySpan = new Map(page?.spans.map(s => [s.span_id, s]));
  const spans = unit.span_ids ? unit.span_ids.map(id => {
    const span = bySpan.get(id); if (!span) throw new Error('Coverage span is not owned by its original page'); return span;
  }) : page?.spans ?? [];
  return { unit, text_status: page?.text_status ?? 'unavailable_legacy_capture',
    frame: page ? { width_px: page.width_px, height_px: page.height_px, rotation: page.rotation } : null,
    spans, scope: unit.span_ids === null ? 'whole_original_page' as const : 'selected_original_spans' as const };
}
