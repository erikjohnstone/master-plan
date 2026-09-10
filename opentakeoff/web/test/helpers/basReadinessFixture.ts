/** Controlled declared evidence and bytes, NOT a real extracted PDF. */
import { engineeringFixture, uuid } from './basEngineeringFixture.ts';
import { addRevisionSourceSet, revisionBasis } from './basRevisionFixture.ts';
import { scopeRequest } from './basScopeFixture.ts';
import { sha256Hex } from '../../src/lib/graphKeys.js';
import { applyBasScopeReview } from '../../src/lib/basScopeReview.ts';
import { buildBasDeliverableScope, type BasDeliverableScopeSpec } from '../../src/lib/basDeliverableScope.ts';
import type { BasWorkflow } from '../../src/lib/basWorkflow.ts';

export async function readinessFixture() {
  const bytes = new TextEncoder().encode('Controlled byte identity for readiness tests. Not a parsed or real PDF.');
  const f = await engineeringFixture({ sha256: await sha256Hex(bytes), byte_length: bytes.length });
  const workflow = await addRevisionSourceSet(f.workflow);
  return { ...f, workflow, bytes };
}

export async function reviewReadyScope(workflow: BasWorkflow, included?: BasDeliverableScopeSpec['included'], n = 800) {
  const specification: BasDeliverableScopeSpec = { schema_version: 'bas_deliverable_scope_spec_v1', scope_id: uuid(n),
    name: 'Explicit controlled scoped deliverable', reason: 'Controlled acceptance test, not production ground truth',
    basis: revisionBasis(workflow), included: included ?? [{ claim: 'scheduled_equipment', capture_id: workflow.current_capture_id!, subject_id: uuid(11) }], excluded: [] };
  const saved = await applyBasScopeReview(workflow, scopeRequest(workflow, ++n, { kind: 'save_scope', specification, previous_scope_event_id: null }), 'operator_input');
  workflow = saved.workflow;
  const view = await buildBasDeliverableScope(workflow, specification);
  for (const claim of view.claims) for (const page of workflow.captures.find(c => c.capture_id === claim.target.capture_id)!.narrative_sources!.pages) {
    const result = await applyBasScopeReview(workflow, scopeRequest(workflow, ++n, { kind: 'record_coverage',
      scope_event_id: saved.event.event_id, basis: specification.basis, claim: claim.target,
      unit: { capture_id: claim.target.capture_id, page_id: page.page_id, span_ids: null },
      inspected_source: true, assessment: 'applicable_mapped', mapped_item_ids: claim.dependency_item_ids }), 'operator_input');
    workflow = result.workflow;
  }
  return { workflow, scope: saved.event, specification, view };
}
