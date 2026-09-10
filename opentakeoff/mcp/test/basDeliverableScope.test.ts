/** Shared compiler + actual Python checks. Not a public-tool/UI or real-PDF run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineeringFixture, uuid, explicit } from '../../web/test/helpers/basEngineeringFixture.ts';
import { addRevisionSourceSet, revisionBasis, revisionFixture } from '../../web/test/helpers/basRevisionFixture.ts';
import { applyBasEngineeringReview } from '../src/basEngineeringReview.ts';
import { calculateBasAssignments } from '../src/basAssignmentDemand.ts';
import { buildBasDeliverableScope, type BasDeliverableScopeSpec } from '../../web/src/lib/basDeliverableScope.ts';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';
import type { BasWorkflow } from '../../web/src/lib/basWorkflow.ts';
import { applyBasEquipmentReview } from '../../web/src/lib/basEquipmentReview.ts';
import type { BasEquipmentRegister } from '../../web/src/lib/basEquipmentRegister.ts';
import { controlledEngineeringCases } from './helpers/basEngineeringCases.ts';
const spec = (w: BasWorkflow): BasDeliverableScopeSpec => ({ schema_version: 'bas_deliverable_scope_spec_v1', scope_id: uuid(300),
  name: 'Controlled check scope', reason: 'Declared checks only, not installed-design verification', basis: revisionBasis(w), excluded: [],
  included: [{ claim: 'engineering_compatibility', capture_id: w.current_capture_id!, subject_id: 'signal-check' }] });

test('actual Python checks: disconnected changes preserve fingerprints; connected excluded failures remain dependencies', async () => {
  const f = await engineeringFixture();
  let saved = await applyBasEngineeringReview(f.workflow, f.request, 'operator_input');
  let w = await addRevisionSourceSet(saved.workflow), view = await buildBasDeliverableScope(w, spec(w));
  const initial = view.claims[0].dependency_fingerprint, register = structuredClone(f.register), check = structuredClone(register.input.checks[0]);
  if (check.kind !== 'signal') throw new Error('Expected signal control fixture');
  check.check_id = 'disconnected-check'; check.equipment_ids = [uuid(12)];
  check.source = { endpoint_id: 'other-output', equipment_id: uuid(12), scope_id: uuid(1) };
  check.sink = { endpoint_id: 'other-input', equipment_id: uuid(12), scope_id: uuid(1) };
  register.input.checks.push(check);
  register.resources.push(...['other-output', 'other-input'].map(resource_id => ({ resource_id, equipment_id: uuid(12), scope_id: uuid(1),
    component_id: null, roles: ['endpoint' as const], label: resource_id, source_span_ids: [], reason: 'Disconnected explicit resource' })));
  register.targets.push({ check_id: check.check_id, resource_ids: ['other-output', 'other-input'], source_span_ids: [],
    disposition: 'included', exclusion_reason: null, reason: 'Independent controlled check' });
  saved = await applyBasEngineeringReview(w, { ...f.request, operation_id: uuid(301), expected_head: saved.event.event_id, register }, 'operator_input');
  w = saved.workflow; view = await buildBasDeliverableScope(w, spec(w));
  assert.equal(view.claims[0].dependency_fingerprint, initial);
  const unrelated = view.inventory.items.find(i => i.kind === 'engineering_check' && i.subject_id === check.check_id)!;
  assert.ok(view.unselected_item_ids.includes(unrelated.item_id));
  const peer = structuredClone(register.input.checks[0]);
  if (peer.kind !== 'signal') throw new Error('Expected signal control fixture');
  peer.check_id = 'shared-resource-check'; peer.source_mode = explicit('current');
  register.input.checks.push(peer);
  register.targets.push({ ...register.targets[0], check_id: peer.check_id, disposition: 'excluded',
    exclusion_reason: 'Outside own engineering target; must not hide shared failure', reason: 'Explicit shared endpoint' });
  saved = await applyBasEngineeringReview(w, { ...f.request, operation_id: uuid(302), expected_head: saved.event.event_id, register }, 'operator_input');
  w = saved.workflow; const request = spec(w);
  request.excluded.push({ target: { ...request.included[0], subject_id: peer.check_id }, reason: 'Omit its independent report claim',
    consequence: 'Retain its failed shared-resource comparison as a prerequisite', evidence: [{ capture_id: w.current_capture_id!,
      page_id: f.source.pages[0].page_id, span_id: f.source.pages[0].spans[1].span_id }] });
  const before = canonicalBasJson(w); view = await buildBasDeliverableScope(w, request);
  assert.equal(canonicalBasJson(w), before); assert.notEqual(view.claims[0].dependency_fingerprint, initial);
  const retained = view.inventory.items.find(i => i.kind === 'engineering_check' && i.subject_id === peer.check_id)!;
  assert.ok(view.claims[0].dependency_item_ids.includes(retained.item_id));
  assert.equal(JSON.parse(retained.original_json).saved_result.status, 'fail');
  assert.equal(JSON.parse(retained.original_json).target.disposition, 'excluded');
  assert.deepEqual(view.exclusions[0].dependency_of, request.included);
  assert.ok(view.claims[0].diagnostics.some(d => d.code === 'python_replay_required'));
  assert.equal(view.approved, false); assert.equal(view.issue_verification, 'not_evaluated');
  assert.deepEqual(view, await buildBasDeliverableScope(JSON.parse(canonicalBasJson(w)), request));
});

test('actual Python assignment observations retain group membership and unknowns through deliverable exclusion', async () => {
  const f = await revisionFixture();
  const calculated = await calculateBasAssignments(f.workflow, { capture_id: f.workflow.current_capture_id!,
    expected_equipment_head: f.workflow.equipment_events!.at(-1)!.event_id });
  const w = calculated.workflow, request = spec(w);
  request.included = [{ claim: 'assigned_points', capture_id: w.current_capture_id!, subject_id: uuid(80) }];
  request.excluded = [{ target: { claim: 'scheduled_equipment', capture_id: w.current_capture_id!, subject_id: uuid(12) },
    reason: 'Do not report its separate inventory claim', consequence: 'No change to shared assigned demand',
    evidence: [{ capture_id: w.current_capture_id!, page_id: f.source.pages[0].page_id, span_id: null }] }];
  const before = canonicalBasJson(w), view = await buildBasDeliverableScope(w, request);
  assert.equal(canonicalBasJson(w), before);
  assert.equal(view.claims[0].diagnostics.some(d => d.code === 'missing_saved_quantity'), false);
  const rows = view.inventory.items.filter(i => i.kind === 'assigned_observation' && view.claims[0].dependency_item_ids.includes(i.item_id));
  assert.ok(rows.length > 0);
  assert.ok(rows.some(i => i.quantities.some(q => q.dimension === 'declared_io:DI' && q.value === null)));
  assert.ok(rows.some(i => i.quantities.some(q => q.dimension === 'declared_io:AI' && q.value === 4)));
  for (const row of rows) assert.deepEqual(JSON.parse(row.original_json).included_equipment_ids, [uuid(11), uuid(12)]);
  assert.deepEqual(view.exclusions[0].dependency_of, request.included);
  assert.equal(view.calculation_verification, 'saved_results_not_python_replayed', 'Preview cannot claim it performed the preceding service calculation');
});

test('an actually calculated empty matrix is distinct from a missing calculation and is never interpreted as complete', async () => {
  const f = await engineeringFixture({ withSequence: true });
  const register: BasEquipmentRegister = structuredClone(f.equipment);
  register.assignments = [{ assignment_id: uuid(80), matrix_id: f.capture.points.matrices[0].matrix_id,
    equipment_ids: [uuid(11)], excluded_equipment_ids: [], source_span_ids: [], sequence_region_ids: [],
    applicability: 'per_equipment', reason: 'Controlled empty template, no discovery-completeness claim' }];
  let w = await applyBasEquipmentReview(f.workflow, { operation_id: uuid(301), capture_id: f.workflow.current_capture_id,
    expected_head: f.workflow.equipment_events!.at(-1)!.event_id, register, reason: 'Empty-template control' }, 'operator_input');
  w = await addRevisionSourceSet(w);
  const request = spec(w); request.included = [{ claim: 'assigned_points', capture_id: w.current_capture_id!, subject_id: uuid(80) }];
  const missing = await buildBasDeliverableScope(w, request);
  assert.ok(missing.claims[0].diagnostics.some(d => d.code === 'missing_saved_quantity'));
  const saved = await calculateBasAssignments(w, { capture_id: w.current_capture_id!, expected_equipment_head: w.equipment_events!.at(-1)!.event_id });
  const result = await buildBasDeliverableScope(saved.workflow, { ...request, basis: revisionBasis(saved.workflow) });
  assert.ok(result.claims[0].diagnostics.some(d => d.code === 'empty_saved_quantity'));
  assert.equal(result.claims[0].diagnostics.some(d => d.code === 'missing_saved_quantity'), false);
  assert.equal(result.project_complete, false); assert.equal(result.approved, false);
});

test('actual shared-pool load additions invalidate expansion dependencies without hiding an excluded load owner', async () => {
  const f = await engineeringFixture(), register = controlledEngineeringCases([uuid(11), uuid(12)], uuid(1)).cases.expansion;
  const expansion = register.input.checks.find(c => c.kind === 'expansion')!, power = register.input.checks.find(c => c.kind === 'power')!;
  if (expansion.kind !== 'expansion' || power.kind !== 'power') throw new Error('Expected coupled expansion / power fixture');
  let saved = await applyBasEngineeringReview(f.workflow, { ...f.request, register }, 'operator_input');
  let w = await addRevisionSourceSet(saved.workflow), request = spec(w);
  request.included[0].subject_id = expansion.check_id;
  request.excluded = [{ target: { claim: 'scheduled_equipment', capture_id: w.current_capture_id!, subject_id: uuid(12) },
    reason: 'Other party equipment report', consequence: 'All its supply loads still participate in included compatibility checks',
    evidence: [{ capture_id: w.current_capture_id!, page_id: f.source.pages[0].page_id, span_id: null }] }];
  const before = await buildBasDeliverableScope(w, request), fingerprint = before.claims[0].dependency_fingerprint;
  const oldPowerItem = before.inventory.items.find(i => i.kind === 'engineering_check' && i.subject_id === power.check_id)!;
  assert.ok(before.claims[0].dependency_item_ids.includes(oldPowerItem.item_id));
  assert.equal(JSON.parse(oldPowerItem.original_json).saved_result.status, 'pass');
  // A new connected load exceeds the explicitly declared 50 VA operating pool.
  // Only the shared Python engine evaluates the new 75 VA case.
  power.loads.push({ ...structuredClone(power.loads[0]), load_id: 'additional-load' });
  power.scenarios[0].states.push({ load_id: 'additional-load', state: explicit('operating') });
  register.resources.push({ resource_id: 'additional-load', equipment_id: uuid(12), scope_id: uuid(1), component_id: null,
    roles: ['load'], label: 'Additional controlled shared load', source_span_ids: [], reason: 'Explicit new pool member' });
  register.targets.find(t => t.check_id === power.check_id)!.resource_ids.push('additional-load');
  saved = await applyBasEngineeringReview(w, { ...f.request, operation_id: uuid(301), expected_head: saved.event.event_id, register }, 'operator_input');
  w = saved.workflow; request = { ...request, basis: revisionBasis(w) };
  const after = await buildBasDeliverableScope(w, request);
  assert.notEqual(after.claims[0].dependency_fingerprint, fingerprint);
  const powerItem = after.inventory.items.find(i => i.item_id === oldPowerItem.item_id)!;
  assert.equal(JSON.parse(powerItem.original_json).saved_result.status, 'fail');
  assert.equal(JSON.parse(powerItem.original_json).check.loads.length, 3);
  const expansionItem = after.inventory.items.find(i => i.item_id === after.claims[0].root_item_id)!;
  assert.equal(JSON.parse(expansionItem.original_json).saved_result.status, 'fail');
  assert.ok(after.claims[0].dependency_item_ids.includes(after.exclusions[0].root_item_id));
  assert.deepEqual(after.exclusions[0].dependency_of, request.included);
  assert.equal(after.approved, false);
});
