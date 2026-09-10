/** Actual Python + shared review journal; not a public-client walkthrough. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { revisionFixture, addRevisionSourceSet, revisionBasis } from '../../web/test/helpers/basRevisionFixture.ts';
import { engineeringFixture, uuid, explicit } from '../../web/test/helpers/basEngineeringFixture.ts';
import { scopeRequest } from '../../web/test/helpers/basScopeFixture.ts';
import { applyBasScopeReview, readBasScopeDecision } from '../../web/src/lib/basScopeReview.ts';
import { buildBasDeliverableScope, type BasDeliverableScopeSpec } from '../../web/src/lib/basDeliverableScope.ts';
import { basProjectReview } from '../../web/src/lib/basProjectReview.ts';
import { calculateBasAssignments } from '../src/basAssignmentDemand.ts';
import { applyBasEngineeringReview } from '../src/basEngineeringReview.ts';
import { verifyBasWorkflowCalculations } from '../src/basWorkflowReplay.ts';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';

test('actual Python assigned quantities/unknowns replay unchanged after scope review and canonical restoration', async () => {
  const f = await revisionFixture(), calculated = await calculateBasAssignments(f.workflow, {
    capture_id: f.workflow.current_capture_id!, expected_equipment_head: f.workflow.equipment_events!.at(-1)!.event_id });
  const w = calculated.workflow, capture_id = w.current_capture_id!;
  const spec: BasDeliverableScopeSpec = { schema_version: 'bas_deliverable_scope_spec_v1', scope_id: uuid(700),
    name: 'Controlled assigned-points scope', reason: 'Retained demand and unknowns, not installed count', basis: revisionBasis(w),
    included: [{ claim: 'assigned_points', capture_id, subject_id: uuid(80) }], excluded: [] };
  const before = await verifyBasWorkflowCalculations(w);
  const scope = await applyBasScopeReview(w, scopeRequest(w, 701, { kind: 'save_scope', specification: spec, previous_scope_event_id: null }), 'operator_input');
  const view = await buildBasDeliverableScope(scope.workflow, spec);
  const saved = await applyBasScopeReview(scope.workflow, scopeRequest(scope.workflow, 702, { kind: 'record_coverage',
    scope_event_id: scope.event.event_id, basis: spec.basis, claim: spec.included[0], inspected_source: true,
    unit: { capture_id, page_id: f.source.pages[0].page_id, span_ids: null },
    assessment: 'applicable_mapped', mapped_item_ids: [view.claims[0].root_item_id] }), 'operator_input');
  const restored = JSON.parse(canonicalBasJson(saved.workflow));
  const receipt = await verifyBasWorkflowCalculations(restored);
  assert.equal(receipt.calculation_verification, 'verified_shared_python_replay');
  assert.deepEqual(receipt.checked_records, before.checked_records);
  assert.notEqual(receipt.workflow_sha256, before.workflow_sha256); assert.equal(receipt.project_complete, false);
  assert.deepEqual(restored.assignment_calculations, w.assignment_calculations);
  const after = await buildBasDeliverableScope(restored, spec);
  const rows = after.inventory.items.filter(i => i.kind === 'assigned_observation');
  assert.ok(rows.some(i => i.quantities.some(q => q.dimension === 'declared_io:AI' && q.value === 4)));
  assert.ok(rows.some(i => i.quantities.some(q => q.dimension === 'declared_io:DI' && q.value === null)));
  assert.equal((await readBasScopeDecision(restored, saved.event.event_id)).state, 'current_dependencies');
  const recalculated = await calculateBasAssignments(restored, { capture_id, expected_equipment_head: w.equipment_events!.at(-1)!.event_id });
  assert.deepEqual(recalculated.workflow.scope_events, saved.workflow.scope_events);
  assert.equal(recalculated.workflow.revision, 'bas_scope_10');
});

test('not-applicable review never clears an actual failed engineering check; later Python changes stale its dependencies', async () => {
  const f = await engineeringFixture(), register = structuredClone(f.register), check = register.input.checks[0];
  if (check.kind !== 'signal') throw new Error('Expected controlled signal fixture');
  check.source_mode = explicit('current');
  const failed = await applyBasEngineeringReview(f.workflow, { ...f.request, register }, 'operator_input');
  const w = await addRevisionSourceSet(failed.workflow), capture_id = w.current_capture_id!;
  const spec: BasDeliverableScopeSpec = { schema_version: 'bas_deliverable_scope_spec_v1', scope_id: uuid(700),
    name: 'Controlled compatibility scope', reason: 'Failed physical constraint remains visible', basis: revisionBasis(w), excluded: [],
    included: [{ claim: 'engineering_compatibility', capture_id, subject_id: check.check_id }] };
  const before = await basProjectReview(w, capture_id); assert.ok(before.issues.some(i => i.code === 'constraint_fail'));
  const scope = await applyBasScopeReview(w, scopeRequest(w, 701, { kind: 'save_scope', specification: spec, previous_scope_event_id: null }), 'operator_input');
  const saved = await applyBasScopeReview(scope.workflow, scopeRequest(scope.workflow, 702, { kind: 'record_coverage',
    scope_event_id: scope.event.event_id, basis: spec.basis, claim: spec.included[0], inspected_source: true,
    unit: { capture_id, page_id: f.source.pages[0].page_id, span_ids: null }, assessment: 'not_applicable', mapped_item_ids: [] }), 'operator_input');
  assert.deepEqual(await basProjectReview(saved.workflow, capture_id), before);
  const receipt = await verifyBasWorkflowCalculations(saved.workflow); assert.equal(receipt.project_complete, false);
  check.source_mode = explicit('voltage');
  const changed = await applyBasEngineeringReview(saved.workflow, { ...f.request, register,
    operation_id: uuid(703), expected_head: failed.event.event_id }, 'operator_input');
  assert.deepEqual(changed.workflow.scope_events, saved.workflow.scope_events); assert.equal(changed.workflow.revision, 'bas_scope_10');
  const read = await readBasScopeDecision(changed.workflow, saved.event.event_id);
  assert.equal(read.state, 'changed_dependencies'); assert.equal(read.approved, false);
  const original = await buildBasDeliverableScope(changed.workflow, spec);
  const root = original.inventory.items.find(i => i.item_id === original.claims[0].root_item_id)!;
  assert.equal(JSON.parse(root.original_json).saved_result.status, 'fail', 'Historical source never rebound to later passing input');
  await verifyBasWorkflowCalculations(changed.workflow);
});
