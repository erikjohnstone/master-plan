/** Shared service + actual Python, not a public tool/UI or real-PDF proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessFixture, reviewReadyScope } from '../../web/test/helpers/basReadinessFixture.ts';
import { uuid, explicit } from '../../web/test/helpers/basEngineeringFixture.ts';
import { revisionFixture } from '../../web/test/helpers/basRevisionFixture.ts';
import { applyBasEngineeringReview } from '../src/basEngineeringReview.ts';
import { calculateBasAssemblies } from '../src/basAssemblyQuantities.ts';
import { calculateBasAssignments } from '../src/basAssignmentDemand.ts';
import { verifyBasWorkflowCalculations } from '../src/basWorkflowReplay.ts';
import { buildBasReadiness } from '../../web/src/lib/basReadiness.ts';
import { applyBasEquipmentReview } from '../../web/src/lib/basEquipmentReview.ts';
import { applyBasAssemblyReview } from '../../web/src/lib/basAssemblyReview.ts';
import { BAS_ASSEMBLY_ACTIVITIES } from '../../web/src/lib/basAssemblyRegister.ts';
import { sha256Hex } from '../../web/src/lib/graphKeys.js';
import type { BasWorkflow } from '../../web/src/lib/basWorkflow.ts';
const replayCalculations = (w: BasWorkflow, signal?: AbortSignal) => verifyBasWorkflowCalculations(w, { signal });

test('current declared engineering can be ready only after actual Python replay; stale inputs remain blocked', async () => {
  const f = await readinessFixture(), checked = await applyBasEngineeringReview(f.workflow, f.request, 'operator_input');
  const r = await reviewReadyScope(checked.workflow, [{ claim: 'engineering_compatibility', capture_id: checked.workflow.current_capture_id!, subject_id: 'signal-check' }]);
  const missing = await buildBasReadiness(r.workflow, r.scope.event_id, { readSource: async () => f.bytes });
  assert.equal(missing.status, 'blocked'); assert.ok(missing.blockers.some(b => b.code === 'actual_python_replay_required'));
  const result = await buildBasReadiness(r.workflow, r.scope.event_id, { readSource: async () => f.bytes, replayCalculations });
  assert.equal(result.status, 'ready_for_explicit_approval', JSON.stringify(result.blockers));
  assert.deepEqual(result.replay!.checked_records.engineering, [checked.event.event_id]);
  assert.equal(result.replay!.calculation_verification, 'verified_shared_python_replay');
  const equipment = structuredClone(f.equipment); equipment.equipment[1].reason = 'Unrelated edit but saved engineering has coarse pinned dependencies';
  const changed = await applyBasEquipmentReview(r.workflow, { operation_id: uuid(900), capture_id: r.workflow.current_capture_id,
    expected_head: r.workflow.equipment_events!.at(-1)!.event_id, register: equipment, reason: 'Coarse freshness remains disclosed' }, 'operator_input');
  const stale = await buildBasReadiness(changed, r.scope.event_id, { readSource: async () => f.bytes, replayCalculations });
  assert.equal(stale.replay!.calculation_verification, 'verified_shared_python_replay');
  assert.equal(stale.status, 'blocked'); assert.ok(stale.blockers.some(b => b.code === 'scope_saved_dependencies_stale'));
});

test('failed and not-evaluable constraints block included compatibility but remain visible outside a scheduled-only claim', async () => {
  for (const mode of ['current', null] as const) {
    const f = await readinessFixture(), register = structuredClone(f.register), check = register.input.checks[0];
    if (check.kind !== 'signal') throw new Error('Controlled signal case required');
    check.source_mode = mode === null ? null : explicit(mode);
    const checked = await applyBasEngineeringReview(f.workflow, { ...f.request, register }, 'operator_input');
    const r = await reviewReadyScope(checked.workflow, [{ claim: 'engineering_compatibility', capture_id: checked.workflow.current_capture_id!, subject_id: 'signal-check' }]);
    const result = await buildBasReadiness(r.workflow, r.scope.event_id, { readSource: async () => f.bytes, replayCalculations });
    assert.equal(result.status, 'blocked');
    assert.ok(result.blockers.some(b => b.code === `issue:engineering:constraint_${mode === null ? 'not_evaluable' : 'fail'}`));
    const equipment = await reviewReadyScope(checked.workflow);
    const outside = await buildBasReadiness(equipment.workflow, equipment.scope.event_id, { readSource: async () => f.bytes, replayCalculations });
    assert.equal(outside.status, 'ready_for_explicit_approval');
    assert.ok(outside.issues.some(i => i.issue.code.startsWith('constraint_') && i.scope === 'outside_included_claims'));
  }
});

test('explicit activity assignments and actual component quantities can be reviewed without conflating their claims', async () => {
  const f = await readinessFixture(), assembly = structuredClone(f.assembly);
  for (const [index, component] of assembly.components.entries()) component.responsibility_claims = BAS_ASSEMBLY_ACTIVITIES.map((activity, n) => ({
    claim_id: uuid(1000 + index * 10 + n), activity, assignment: 'named_party', party: 'Controlled declared contractor', source_span_ids: [],
    reason: 'Explicit test decision, not a universal contractor assumption' }));
  let w = await applyBasAssemblyReview(f.workflow, { operation_id: uuid(950), capture_id: f.workflow.current_capture_id,
    expected_head: f.workflow.assembly_events!.at(-1)!.event_id, expected_equipment_head: f.workflow.equipment_events!.at(-1)!.event_id,
    register: assembly, reason: 'All five activities declared independently' }, 'operator_input');
  w = (await calculateBasAssemblies(w, { capture_id: w.current_capture_id!, expected_equipment_head: w.equipment_events!.at(-1)!.event_id,
    expected_assembly_head: w.assembly_events!.at(-1)!.event_id })).workflow;
  const r = await reviewReadyScope(w, ['assembly_components', 'responsibilities'].map(claim => ({
    claim: claim as 'assembly_components' | 'responsibilities', capture_id: w.current_capture_id!, subject_id: uuid(30) })));
  const result = await buildBasReadiness(r.workflow, r.scope.event_id, { readSource: async () => f.bytes, replayCalculations });
  assert.equal(result.status, 'ready_for_explicit_approval', JSON.stringify(result.blockers));
  assert.equal(result.replay!.checked_records.assembly.length, 1);
  assert.equal(result.scope.inventory.items.find(i => i.kind === 'assembly_quantity' && i.subject_id === uuid(30))!.quantities[0].value, 1);
  assert.equal(result.scope.inventory.items.filter(i => i.kind === 'responsibility_claim').length, 10);
});

test('actual assigned observations keep unresolved identities, unobserved cells and unknowns blocking after replay', async () => {
  const bytes = new TextEncoder().encode('Controlled two-page byte identity; not a parsed real PDF');
  const f = await revisionFixture({ sha256: await sha256Hex(bytes), byte_length: bytes.length });
  const calculated = await calculateBasAssignments(f.workflow, { capture_id: f.workflow.current_capture_id!, expected_equipment_head: f.workflow.equipment_events!.at(-1)!.event_id });
  const r = await reviewReadyScope(calculated.workflow, [{ claim: 'assigned_points', capture_id: f.workflow.current_capture_id!, subject_id: uuid(80) }]);
  const result = await buildBasReadiness(r.workflow, r.scope.event_id, { readSource: async () => bytes, replayCalculations });
  assert.equal(result.status, 'blocked'); assert.equal(result.replay!.checked_records.assignment.length, 1);
  assert.ok(result.blockers.some(b => b.code.includes('UNIQUE_POINT_IDENTITIES_NOT_ESTABLISHED')));
  assert.ok(result.blockers.some(b => b.code.includes('CONTROLLED_AMBIGUOUS_DI')));
  assert.ok(result.scope.inventory.items.some(i => i.kind === 'assigned_observation' && i.quantities.some(q => q.dimension === 'declared_io:DI' && q.value === null)));
});

test('excluding a connected failed check does not remove its shared-resource prerequisite', async () => {
  const f = await readinessFixture(), register = structuredClone(f.register), peer = structuredClone(register.input.checks[0]);
  if (peer.kind !== 'signal') throw new Error('Controlled signal case required');
  peer.check_id = 'connected-failed-check'; peer.source_mode = explicit('current'); register.input.checks.push(peer);
  register.targets.push({ ...register.targets[0], check_id: peer.check_id, disposition: 'excluded', exclusion_reason: 'Explicit outside report target' });
  const checked = await applyBasEngineeringReview(f.workflow, { ...f.request, register }, 'operator_input');
  const r = await reviewReadyScope(checked.workflow, [{ claim: 'engineering_compatibility', capture_id: checked.workflow.current_capture_id!, subject_id: 'signal-check' }]);
  const result = await buildBasReadiness(r.workflow, r.scope.event_id, { readSource: async () => f.bytes, replayCalculations });
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(i => i.issue.code === 'constraint_fail' && i.issue.disposition === 'excluded' && i.effects.some(e => e.effect === 'blocking')));
});
