/** Controlled review declarations, not automatic interpretation or approval. */
import { revisionFixture, revisionBasis } from './basRevisionFixture.ts';
import { uuid } from './basEngineeringFixture.ts';
import { applyBasScopeReview, type BasScopeReviewRequest, type BasCoverageAction } from '../../src/lib/basScopeReview.ts';
import { buildBasDeliverableScope, type BasDeliverableScopeSpec } from '../../src/lib/basDeliverableScope.ts';
import type { BasWorkflow } from '../../src/lib/basWorkflow.ts';

export const scopeSpec = (w: BasWorkflow): BasDeliverableScopeSpec => ({
  schema_version: 'bas_deliverable_scope_spec_v1', scope_id: uuid(700), name: 'Controlled equipment deliverable',
  reason: 'Source-backed review fixture, not production ground truth', basis: revisionBasis(w),
  included: [{ claim: 'scheduled_equipment', capture_id: w.current_capture_id!, subject_id: uuid(11) }], excluded: [],
});
export const scopeRequest = (w: BasWorkflow, n: number, action: BasScopeReviewRequest['action']): BasScopeReviewRequest => ({
  operation_id: uuid(n), expected_head: w.scope_events?.at(-1)?.event_id ?? null,
  reviewer: 'Self-declared controlled reviewer', reason: 'Controlled applicability review: é→📐', action,
});
export async function scopeFixture(options: Parameters<typeof revisionFixture>[0] = {}) {
  const f = await revisionFixture(options), specification = scopeSpec(f.workflow);
  const request = scopeRequest(f.workflow, 701, { kind: 'save_scope', specification, previous_scope_event_id: null });
  const saved = await applyBasScopeReview(f.workflow, request, 'operator_input', { createdAt: '2026-09-10T10:00:00.000Z' });
  const preview = await buildBasDeliverableScope(saved.workflow, specification);
  const coverage: BasCoverageAction = { kind: 'record_coverage', scope_event_id: saved.event.event_id,
    basis: revisionBasis(saved.workflow), claim: specification.included[0], inspected_source: true,
    unit: { capture_id: saved.workflow.current_capture_id!, page_id: f.source.pages[0].page_id, span_ids: null },
    assessment: 'applicable_mapped', mapped_item_ids: [preview.claims[0].root_item_id] };
  return { ...f, ...saved, request, specification, preview, coverage };
}
