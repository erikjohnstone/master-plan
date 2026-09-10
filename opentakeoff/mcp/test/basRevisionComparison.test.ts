/** Actual Python process integration over controlled revision correspondence.
 * Not a public UI/MCP or independent issued-addendum acceptance claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonFixture } from '../../web/test/helpers/basRevisionComparisonFixture.ts';
import { revisionFixture, revisionBasis, addRevisionSourceSet } from '../../web/test/helpers/basRevisionFixture.ts';
import { uuid } from '../../web/test/helpers/basEngineeringFixture.ts';
import { compareBasRevisions, basRevisionNumericBatches } from '../src/basRevisionComparison.ts';
import { prepareBasRevisionComparison, type BasRevisionComparisonRequest } from '../../web/src/lib/basRevisionComparison.ts';
import { calculateBasAssignments } from '../src/basAssignmentDemand.ts';
import { calculateBasAssemblies } from '../src/basAssemblyQuantities.ts';
import { applyBasEquipmentReview } from '../../web/src/lib/basEquipmentReview.ts';
import { captureBasEvidence, verifyBasWorkflow } from '../../web/src/lib/basWorkflow.ts';
import { basAssemblyCalculationFingerprint } from '../../web/src/lib/basAssemblyQuantityContract.ts';
import { runBasRevisionQuantities } from '../src/basMath.ts';
import { defaultBasRevisionBasis } from '../../web/src/lib/basRevisionBasis.ts';
import { buildBasRevisionInventory } from '../../web/src/lib/basRevisionInventory.ts';
import { applyBasEngineeringReview } from '../src/basEngineeringReview.ts';
import { controlledEngineeringCases } from './helpers/basEngineeringCases.ts';
import { BAS_REPLAY_BATCH_LIMITS } from '../src/basWorkflowReplay.ts';

test('actual Python compares known listed counts while preserving unknowns, attributes, originals and changed SOO', async () => {
  const f = await comparisonFixture({ ai: 4, variable: 'RETURN AIR TEMPERATURE' }), before = structuredClone(f.workflow);
  const result = await compareBasRevisions(f.workflow, f.request);
  const row = result.rows.find(r => r.before?.kind === 'point_row')!;
  const ai = row.quantities.find(q => q.before?.dimension === 'declared_io:AI')!;
  assert.equal(ai.status, 'calculated'); assert.equal(ai.delta, 2); assert.equal(ai.before!.value, 2); assert.equal(ai.after!.value, 4);
  assert.equal(row.quantities.find(q => q.before?.dimension === 'declared_io:DI')!.delta, null);
  assert.equal(row.quantities.find(q => q.before?.dimension === 'attribute:ALARM')!.status, 'not_a_quantity');
  assert.equal(result.checked_point_matrices.length, 2);
  assert.equal(result.calculation_verification, 'no_selected_saved_calculations');
  assert.equal(result.source_bytes, 'not_verified'); assert.equal(result.approved, false); assert.deepEqual(f.workflow, before);
  const unchanged = await comparisonFixture(), equal = await compareBasRevisions(unchanged.workflow, unchanged.request);
  assert.ok(equal.rows.every(r => r.quantities.every(q => q.delta === null || q.delta === 0)));
});

test('changed included membership needs an explicit confirmation; changing applicability cannot use that override', async () => {
  const f = await revisionFixture(), capture_id = f.workflow.current_capture_id!;
  const first = await calculateBasAssignments(f.workflow, { capture_id, expected_equipment_head: f.basis.captures[0].equipment_head });
  const before = revisionBasis(first.workflow), register = structuredClone(f.equipment);
  register.assignments[0].excluded_equipment_ids = [uuid(12)];
  const changed = await applyBasEquipmentReview(first.workflow, { capture_id, operation_id: uuid(510), expected_head: before.captures[0].equipment_head,
    register, reason: 'Controlled explicit exception' }, 'operator_input');
  const second = await calculateBasAssignments(changed, { capture_id, expected_equipment_head: changed.equipment_events!.at(-1)!.event_id });
  const request: BasRevisionComparisonRequest = { before, after: revisionBasis(second.workflow), matches: [], removed: [], added: [], membership_reviews: [] };
  const preview = await prepareBasRevisionComparison(second.workflow, request);
  const rows = preview.report.rows.filter(r => r.before?.kind === 'assigned_observation' && r.quantities.some(q => q.status === 'membership_review_required'));
  assert.equal(rows.length, 2, 'Known AI and AV values need confirmation; unknown DI and ALARM never become comparable');
  request.membership_reviews = rows.flatMap(r => r.quantities.filter(q => q.status === 'membership_review_required').map(q => ({ before_item_id: r.before!.item_id,
    after_item_id: r.after!.item_id, metric_key: q.metric_key, reason: 'Compare the same declared per-equipment measure over the reviewed exception' })));
  const compared = await compareBasRevisions(second.workflow, request);
  const ai = compared.rows.find(r => r.before?.kind === 'assigned_observation' && r.quantities[0].before?.dimension === 'declared_io:AI')!.quantities[0];
  assert.equal(ai.delta, -2); assert.equal(ai.status, 'calculated'); assert.ok(ai.membership_review_reason);
  assert.equal(compared.checked_saved_records.filter(r => r.kind === 'assignment').length, 2);

  const changedBasis = structuredClone(register); changedBasis.assignments[0].applicability = 'system_once';
  const third = await applyBasEquipmentReview(second.workflow, { capture_id, operation_id: uuid(511), expected_head: request.after.captures[0].equipment_head,
    register: changedBasis, reason: 'Explicit different denominator' }, 'operator_input');
  const derived = await calculateBasAssignments(third, { capture_id, expected_equipment_head: third.equipment_events!.at(-1)!.event_id });
  const incompatible = { ...request, after: revisionBasis(derived.workflow), membership_reviews: [] };
  const refusedDelta = await compareBasRevisions(derived.workflow, incompatible);
  assert.ok(refusedDelta.rows.filter(r => r.before?.kind === 'assigned_observation').every(r => r.quantities.every(q => q.status !== 'calculated')));
  await assert.rejects(compareBasRevisions(derived.workflow, { ...incompatible, membership_reviews: request.membership_reviews }), /does not target/);
});

test('a re-signed saved assembly calculation cannot create a successful comparison', async () => {
  const f = await revisionFixture(), capture_id = f.workflow.current_capture_id!;
  const calculated = await calculateBasAssemblies(f.workflow, { capture_id, expected_equipment_head: f.basis.captures[0].equipment_head,
    expected_assembly_head: f.basis.captures[0].assembly_head });
  const corrupt = structuredClone(calculated.workflow), calculation = corrupt.assembly_calculations![0];
  calculation.result.components[0].assigned_quantity = 999;
  const { calculation_id: _id, ...payload } = calculation; calculation.calculation_id = await basAssemblyCalculationFingerprint(payload);
  await verifyBasWorkflow(corrupt); // Deliberately proves lineage is insufficient.
  const basis = revisionBasis(corrupt);
  await assert.rejects(compareBasRevisions(corrupt, { before: basis, after: basis, matches: [], removed: [], added: [], membership_reviews: [] }), /does not match shared Python replay/);
});

test('reviewing correspondence cannot subtract different point variables after template replication', async () => {
  const f = await comparisonFixture({ pointName: 'RETURN AIR TEMPERATURE' });
  let workflow = f.workflow;
  for (const capture of workflow.captures) workflow = (await calculateBasAssignments({ ...workflow, current_capture_id: capture.capture_id }, {
    capture_id: capture.capture_id,
    expected_equipment_head: workflow.equipment_events!.find(e => e.capture_id === capture.capture_id)!.event_id,
  })).workflow;
  const before = defaultBasRevisionBasis(workflow, f.request.before.source_set_id), after = defaultBasRevisionBasis(workflow, f.request.after.source_set_id);
  const a = (await buildBasRevisionInventory(workflow, before)).items.filter(i => i.kind === 'assigned_observation');
  const b = (await buildBasRevisionInventory(workflow, after)).items.filter(i => i.kind === 'assigned_observation');
  assert.equal(a.length, 4); assert.equal(b.length, 4);
  const request = { ...f.request, before, after, matches: [...f.request.matches,
    ...a.map((item, i) => ({ before_item_id: item.item_id, after_item_id: b[i].item_id, reason: 'Controlled explicit old/new variable correspondence' }))] };
  const compared = await compareBasRevisions(workflow, request);
  const ai = compared.rows.find(r => r.before?.kind === 'assigned_observation' && r.quantities[0].before?.dimension === 'declared_io:AI')!;
  assert.equal(ai.quantities[0].status, 'different_measure'); assert.equal(ai.quantities[0].delta, null);
});

for (const family of ['signal', 'analog', 'loading', 'contact', 'pulse', 'power', 'mechanical', 'allocation', 'expansion', 'serial', 'ip'])
test(`reviewed ${family} resource renaming is distinct from changed engineering constraints`, async () => {
  const f = await revisionFixture(), capture_id = f.workflow.current_capture_id!, heads = f.basis.captures[0];
  const { cases } = controlledEngineeringCases([uuid(11), uuid(12)], uuid(1)), register = cases[family];
  const request = { capture_id, operation_id: uuid(530), expected_head: null, expected_equipment_head: heads.equipment_head,
    expected_assembly_head: heads.assembly_head, expected_sequence_head: heads.sequence_head,
    reason: 'Controlled explicit engineering checks', register };
  const first = await applyBasEngineeringReview(f.workflow, request, 'operator_input'), before = revisionBasis(first.workflow);
  const replacements = new Map([...register.resources.map(r => [r.resource_id, `revised-${r.resource_id}`] as const),
    ...register.input.checks.map(c => [c.check_id, `revised-${c.check_id}`] as const)]);
  // Exact controlled fixture tokens, not a production ID rewriting heuristic.
  const rename = (v: unknown): unknown => typeof v === 'string' ? replacements.get(v) ?? v : Array.isArray(v) ? v.map(rename)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'label' ? x : rename(x)])) : v;
  const second = await applyBasEngineeringReview(first.workflow, { ...request, operation_id: uuid(531), expected_head: first.event.event_id,
    register: rename(register) }, 'operator_input');
  const after = revisionBasis(second.workflow), a = await buildBasRevisionInventory(second.workflow, before), b = await buildBasRevisionInventory(second.workflow, after);
  const selections = [...register.resources.map(r => ({ kind: 'engineering_resource', id: r.resource_id })),
    ...register.input.checks.map(c => ({ kind: 'engineering_check', id: c.check_id }))];
  const matches = selections.map(s => ({ before_item_id: a.items.find(i => i.kind === s.kind && i.subject_id === s.id)!.item_id,
    after_item_id: b.items.find(i => i.kind === s.kind && i.subject_id === replacements.get(s.id))!.item_id,
    reason: 'Explicit controlled one-to-one resource/check identity review' }));
  const compared = await compareBasRevisions(second.workflow, { before, after, matches, added: [], removed: [], membership_reviews: [] });
  const rows = compared.rows.filter(r => r.before?.kind === 'engineering_check');
  assert.equal(rows.length, register.input.checks.length);
  for (const row of rows) {
    assert.equal(row.declared_fields_equal, true, JSON.stringify(row.field_changes));
    assert.equal(row.saved_output_equal, JSON.stringify(JSON.parse(row.before!.original_json).saved_result) === JSON.stringify(JSON.parse(row.after!.original_json).saved_result));
    if (family === 'ip') {
      assert.equal(row.saved_output_equal, false);
      assert.notEqual(JSON.parse(row.before!.original_json).saved_result.network_calculation.ip.closet_id,
        JSON.parse(row.after!.original_json).saved_result.network_calculation.ip.closet_id, 'Exact original output identity is still retained');
    }
  }
  assert.equal(compared.checked_saved_records.filter(r => r.kind === 'engineering').length, 2);
});

test('rebinding an equipment UUID to a different source occurrence requires membership comparison review', async () => {
  const f = await revisionFixture(), capture_id = f.workflow.current_capture_id!, heads = f.basis.captures[0];
  const first = await calculateBasAssignments(f.workflow, { capture_id, expected_equipment_head: heads.equipment_head });
  const before = revisionBasis(first.workflow), register = structuredClone(f.equipment);
  register.equipment[0].bindings[0].occurrence_id = f.candidates.tables[1].rows[0].occurrence_id;
  const rebound = await applyBasEquipmentReview(first.workflow, { capture_id, expected_head: heads.equipment_head, operation_id: uuid(550),
    register, reason: 'Controlled change to the source occurrence behind a reused equipment UUID' }, 'operator_input');
  const second = await calculateBasAssignments(rebound, { capture_id, expected_equipment_head: rebound.equipment_events!.at(-1)!.event_id });
  const result = await compareBasRevisions(second.workflow, { before, after: revisionBasis(second.workflow), matches: [], added: [], removed: [], membership_reviews: [] });
  const ai = result.rows.find(r => r.before?.kind === 'assigned_observation' && r.quantities[0].before?.dimension === 'declared_io:AI')!;
  assert.equal(ai.quantities[0].status, 'membership_review_required'); assert.equal(ai.quantities[0].delta, null);
});

test('numeric byte batching includes the exact UTF-8 envelope and refuses a single oversized record', async () => {
  const f = await revisionFixture(), matrix = structuredClone(f.workflow.captures[0].points.matrices[0]);
  const packet = { pairs: [], point_matrices: [{ capture_id: f.workflow.current_capture_id!, matrix }] };
  matrix.raw.title!.text = '';
  const overhead = Buffer.byteLength(JSON.stringify({ revision_quantities: packet }));
  const padding = BAS_REPLAY_BATCH_LIMITS.bytes - overhead;
  matrix.raw.title!.text = 'µ'.repeat(Math.floor(padding / 2)) + 'x'.repeat(padding % 2);
  assert.equal(Buffer.byteLength(JSON.stringify({ revision_quantities: packet })), BAS_REPLAY_BATCH_LIMITS.bytes);
  const two = [...basRevisionNumericBatches('point_matrices', [packet.point_matrices[0], packet.point_matrices[0]])];
  assert.deepEqual(two.map(p => p.point_matrices.length), [1, 1]);
  assert.ok(two.every(p => Buffer.byteLength(JSON.stringify({ revision_quantities: p })) === BAS_REPLAY_BATCH_LIMITS.bytes));
  matrix.raw.title!.text += 'x';
  assert.throws(() => [...basRevisionNumericBatches('point_matrices', packet.point_matrices)], /One revision numeric record exceeds/);
});

test('a re-signed point capture with a plausible wrong count fails original-cell interpretation checks', async () => {
  const f = await revisionFixture(), points = structuredClone(f.workflow.captures[0].points);
  points.matrices[0].rows[0].observations[0].value = 999;
  const w = await addRevisionSourceSet(await captureBasEvidence(f.source, points, f.workflow.captures[0].equipment_sources));
  await verifyBasWorkflow(w); const basis = revisionBasis(w);
  await assert.rejects(compareBasRevisions(w, { before: basis, after: basis, matches: [], removed: [], added: [], membership_reviews: [] }), /value differs from source/);
});

test('numeric batching preserves exact inputs across count limits and duplicate/runtime/cancellation failures return no report', async () => {
  const pairs = Array.from({ length: 1001 }, (_, n) => ({ row_id: n.toString(16).padStart(64, '0'), metric_key: 'count', dimension: 'named_scheduled_members',
    basis: 'literal_row_membership', before: 2, after: 1 }));
  const batches = [...basRevisionNumericBatches('pairs', pairs)]; assert.deepEqual(batches.map(b => b.pairs.length), [1000, 1]);
  assert.deepEqual(batches.flatMap(b => b.pairs), pairs);
  const result = await runBasRevisionQuantities(batches[0]); assert.equal(result.pairs.length, 1000); assert.ok(result.pairs.every(p => p.delta === -1));
  await assert.rejects(runBasRevisionQuantities({ pairs: [pairs[0], pairs[0]], point_matrices: [] }), /Duplicate/);
  const f = await comparisonFixture(), before = structuredClone(f.workflow);
  await assert.rejects(compareBasRevisions(f.workflow, f.request, { python: '/not-a-runtime' }), /runtime unavailable/);
  const controller = new AbortController(); controller.abort(new Error('Controlled cancellation'));
  await assert.rejects(compareBasRevisions(f.workflow, f.request, { signal: controller.signal }), /Controlled cancellation/);
  await assert.rejects(compareBasRevisions(f.workflow, f.request, { timeoutMs: 0 }), /timed out/);
  for (const timeoutMs of [NaN, Infinity, -1, 1.5]) await assert.rejects(compareBasRevisions(f.workflow, f.request, { timeoutMs }), /timeout must/);
  assert.deepEqual(f.workflow, before);
});
