/** Shared inventory against actual Python-calculated controlled history.
 * This is integration coverage, not public MCP/UI revision completion. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { revisionFixture, revisionBasis } from '../../web/test/helpers/basRevisionFixture.ts';
import { uuid } from '../../web/test/helpers/basEngineeringFixture.ts';
import { buildBasRevisionInventory } from '../../web/src/lib/basRevisionInventory.ts';
import { calculateBasAssignments } from '../src/basAssignmentDemand.ts';
import { calculateBasAssemblies } from '../src/basAssemblyQuantities.ts';
import { applyBasEngineeringReview } from '../src/basEngineeringReview.ts';
import { applyBasEquipmentReview } from '../../web/src/lib/basEquipmentReview.ts';
import { applyBasAssemblyReview } from '../../web/src/lib/basAssemblyReview.ts';
import { verifyBasWorkflowCalculations } from '../src/basWorkflowReplay.ts';

test('pinned inventory preserves Python assignment, assembly and engineering evidence across dependency changes', async () => {
  const f = await revisionFixture(), capture_id = f.workflow.current_capture_id!, heads = f.basis.captures[0];
  const assigned = await calculateBasAssignments(f.workflow, { capture_id, expected_equipment_head: heads.equipment_head });
  const assembled = await calculateBasAssemblies(assigned.workflow, { capture_id,
    expected_equipment_head: heads.equipment_head, expected_assembly_head: heads.assembly_head });
  const engineered = await applyBasEngineeringReview(assembled.workflow, { capture_id, operation_id: uuid(210), expected_head: null,
    expected_equipment_head: heads.equipment_head, expected_assembly_head: heads.assembly_head, expected_sequence_head: heads.sequence_head,
    reason: 'Controlled compatibility input; no installed design claim', register: f.engineering }, 'operator_input');
  const workflow = engineered.workflow, basis = revisionBasis(workflow), before = await buildBasRevisionInventory(workflow, basis);
  assert.equal((await verifyBasWorkflowCalculations(workflow)).calculation_verification, 'verified_shared_python_replay');
  const quantities = before.items.filter(i => i.kind === 'assigned_observation'); assert.equal(quantities.length, 4);
  const ai = quantities.find(i => i.quantities[0].dimension === 'declared_io:AI')!;
  assert.equal(ai.quantities[0].value, 4); assert.equal(ai.quantities[0].status, 'saved_result_requires_python_replay');
  assert.equal(JSON.parse(ai.original_json).assignment.applicability, 'per_equipment');
  assert.equal(JSON.parse(ai.original_json).replication_factor, 2);
  assert.equal(quantities.find(i => i.quantities[0].dimension === 'attribute:ALARM')!.quantities[0].status, 'not_a_quantity');
  assert.equal(quantities.find(i => i.quantities[0].dimension === 'declared_io:DI')!.quantities[0].value, null);
  const check = before.items.find(i => i.kind === 'engineering_check')!;
  assert.deepEqual(JSON.parse(check.original_json).saved_result, engineered.event.result.checks[0]);
  assert.ok(check.source_refs.some(s => s.text === f.source.pages[0].spans[1].text));
  assert.equal(before.unresolved_references.length, 0); assert.equal(before.approved, false);

  const equipment = structuredClone(f.equipment);
  equipment.equipment[0].bindings[0].occurrence_id = f.candidates.tables[1].rows[0].occurrence_id;
  equipment.assignments[0].applicability = 'system_once';
  const changed = await applyBasEquipmentReview(workflow, { capture_id, operation_id: uuid(211), expected_head: heads.equipment_head,
    register: equipment, reason: 'Controlled scope/basis and original occurrence change' }, 'operator_input');
  const mixed = await buildBasRevisionInventory(changed, revisionBasis(changed));
  for (const original of before.items.filter(i => ['engineering_check', 'engineering_resource', 'assigned_observation', 'assembly_quantity'].includes(i.kind))) {
    const item = mixed.items.find(i => i.item_id === original.item_id)!;
    assert.deepEqual(item.source_refs, original.source_refs, `${item.kind} retains its old evidence`);
    assert.equal(item.original_json, original.original_json); assert.equal(item.dependency_status, 'pinned_dependencies_differ');
  }
  assert.deepEqual((await buildBasRevisionInventory(changed, basis)).items, before.items);
  const newer = await calculateBasAssignments(changed, { capture_id, expected_equipment_head: changed.equipment_events!.at(-1)!.event_id });
  const after = await buildBasRevisionInventory(newer.workflow, revisionBasis(newer.workflow));
  const next = after.items.find(i => i.kind === 'assigned_observation' && i.quantities[0].dimension === 'declared_io:AI')!;
  assert.equal(next.quantities[0].value, 2); assert.equal(JSON.parse(next.original_json).assignment.applicability, 'system_once');
  assert.equal(after.quantity_comparison, 'not_performed', 'Inventory never asserts a comparable delta across a changed basis');
  const pinned = revisionBasis(newer.workflow); pinned.captures[0].assignment_calculation_id = assigned.calculation.calculation_id;
  const historical = await buildBasRevisionInventory(newer.workflow, pinned);
  assert.equal(historical.items.find(i => i.item_id === ai.item_id)!.quantities[0].value, 4);

  const assembly = structuredClone(f.assembly); assembly.components[0].equipment_ids = [uuid(12)];
  const rebased = await applyBasAssemblyReview(newer.workflow, { capture_id, operation_id: uuid(212),
    expected_head: heads.assembly_head, expected_equipment_head: newer.workflow.equipment_events!.at(-1)!.event_id,
    register: assembly, reason: 'Controlled later component applicability' }, 'operator_input');
  const view = await buildBasRevisionInventory(rebased, revisionBasis(rebased));
  const oldQuantity = before.items.find(i => i.kind === 'assembly_quantity')!;
  assert.deepEqual(view.items.find(i => i.item_id === oldQuantity.item_id)!.source_refs, oldQuantity.source_refs);
  assert.ok(view.unresolved_references.some(r => r.item_id === oldQuantity.item_id && r.reason === 'different_selected_event'));
});
