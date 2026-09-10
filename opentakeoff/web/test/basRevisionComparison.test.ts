import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonFixture } from './helpers/basRevisionComparisonFixture.ts';
import { revisionFixture, revisionBasis, addRevisionSourceSet } from './helpers/basRevisionFixture.ts';
import { prepareBasRevisionComparison, verifyBasRevisionQuantityResult } from '../src/lib/basRevisionComparison.ts';
import { applyBasEquipmentReview } from '../src/lib/basEquipmentReview.ts';
import { uuid } from './helpers/basEngineeringFixture.ts';

test('same bound identities pair deterministically without a new correspondence decision or arithmetic', async () => {
  const f = await revisionFixture(), request = { before: f.basis, after: f.basis, matches: [], added: [], removed: [], membership_reviews: [] };
  const input = structuredClone(f.workflow), p = await prepareBasRevisionComparison(f.workflow, request);
  assert.deepEqual(input, f.workflow); assert.ok(p.report.rows.every(r => r.disposition === 'matched'));
  assert.ok(p.report.rows.every(r => r.correspondence === 'exact_bound_identity' && r.declared_fields_equal));
  assert.ok(p.report.rows.every(r => r.quantities.every(q => q.delta === null)));
  assert.ok(p.numericPairs.length > 0); assert.equal(p.report.arithmetic, 'not_run'); assert.equal(p.report.approved, false);
});

test('reviewed unchanged re-export retains distinct originals while normalized declared fields/evidence remain equal', async () => {
  const f = await comparisonFixture(), p = await prepareBasRevisionComparison(f.workflow, f.request);
  assert.ok(p.report.rows.every(r => r.disposition === 'matched'));
  assert.deepEqual(p.report.rows.filter(r => !r.declared_fields_equal).map(r => [r.before!.kind, r.field_changes]), []);
  assert.ok(p.report.rows.filter(r => r.before!.source_refs.length).every(r => r.source_identity === 'different_original_references' && r.retained_evidence === 'equal'));
  assert.ok(p.numericPairs.length > 0); assert.ok(p.numericPairs.every(q => q.before === q.after));
  assert.ok(p.report.rows.every(r => r.quantities.every(q => !['different_measure', 'different_rules', 'membership_review_required'].includes(q.status))));
});

test('new PDF identity, same tags and same row positions cannot silently create correspondence or quantity changes', async () => {
  const f = await comparisonFixture(), p = await prepareBasRevisionComparison(f.workflow, { ...f.request, matches: [] });
  assert.equal(p.numericPairs.length, 0);
  assert.ok(p.report.rows.every(r => ['unresolved_before', 'unresolved_after'].includes(r.disposition)));
  assert.equal(p.report.rows.length, f.before.items.length + f.after.items.length);
});

test('changed supported SOO variable and point value are separate evidence/declared-field/quantity dimensions', async () => {
  const f = await comparisonFixture({ ai: 4, variable: 'RETURN AIR TEMPERATURE' }), p = await prepareBasRevisionComparison(f.workflow, f.request);
  const requirement = p.report.rows.find(r => r.before!.kind === 'sequence_requirement')!;
  assert.ok(requirement.field_changes.some(f => f.field === 'normalized_variable'));
  assert.equal(requirement.retained_evidence, 'changed');
  const points = p.report.rows.find(r => r.before!.kind === 'point_row')!;
  assert.ok(points.field_changes.some(f => f.field === 'observations'));
  assert.ok(p.numericPairs.some(q => q.row_id === points.row_id && q.dimension === 'declared_io:AI' && q.before === 2 && q.after === 4));
  assert.ok(points.quantities.some(q => q.status === 'unknown_value' && q.before!.value === null));
  assert.ok(points.quantities.some(q => q.status === 'not_a_quantity'));
});

test('explicit add/remove decisions show original quantities without manufacturing a zero side', async () => {
  const f = await comparisonFixture(), m = f.request.matches.find(m => f.before.items.find(i => i.item_id === m.before_item_id)!.kind === 'point_row')!;
  const request = { ...f.request, matches: f.request.matches.filter(x => x !== m),
    removed: [{ item_id: m.before_item_id, reason: 'Controlled explicit removal' }], added: [{ item_id: m.after_item_id, reason: 'Controlled explicit addition' }] };
  const p = await prepareBasRevisionComparison(f.workflow, request);
  const rows = p.report.rows.filter(r => ['added', 'removed'].includes(r.disposition)); assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.quantities.length > 0 && r.quantities.every(q => q.delta === null && (!q.before || !q.after))));
});

test('many-to-one, duplicate, foreign, cross-kind and irrelevant membership decisions reject atomically', async () => {
  const f = await comparisonFixture(), input = structuredClone(f.workflow);
  for (const change of [
    (r: typeof f.request) => { r.matches.push(r.matches[0]); },
    (r: typeof f.request) => { r.matches[1].after_item_id = r.matches[0].after_item_id; },
    (r: typeof f.request) => { r.matches[0].before_item_id = 'f'.repeat(64); },
    (r: typeof f.request) => { const first = r.matches[0], other = r.matches.find(m => f.after.items.find(i => i.item_id === m.after_item_id)!.kind !== f.before.items.find(i => i.item_id === first.before_item_id)!.kind)!;
      r.matches = [{ ...first, after_item_id: other.after_item_id }]; },
    (r: typeof f.request) => { r.membership_reviews = [{ ...r.matches[0], metric_key: 'nonexistent' }]; },
  ]) { const request = structuredClone(f.request); change(request); await assert.rejects(prepareBasRevisionComparison(f.workflow, request)); }
  assert.deepEqual(f.workflow, input);
});

test('changing a declared building behind the same scope UUID is not a same-basis component quantity comparison', async () => {
  const f = await revisionFixture(), changed = structuredClone(f.equipment); changed.scopes[0].building = 'B';
  const w = await applyBasEquipmentReview(f.workflow, { capture_id: f.workflow.current_capture_id, operation_id: uuid(501),
    expected_head: f.basis.captures[0].equipment_head, register: changed, reason: 'Explicit changed building' }, 'operator_input');
  const p = await prepareBasRevisionComparison(w, { before: f.basis, after: revisionBasis(w), matches: [], added: [], removed: [], membership_reviews: [] });
  assert.ok(p.report.rows.find(r => r.before!.kind === 'scope')!.field_changes.some(c => c.field === 'building'));
  assert.ok(p.report.rows.filter(r => r.before!.kind === 'assembly_component').every(r => r.quantities.every(q => q.status === 'stale_dependency')));
  const cross = await comparisonFixture({ building: 'B' }), paired = await prepareBasRevisionComparison(cross.workflow, cross.request);
  assert.ok(paired.report.rows.filter(r => r.before!.kind === 'assembly_component').every(r => r.quantities.every(q => q.status === 'different_measure')));
});

test('owned request snapshots, cancellation and deterministic request-order normalization', async () => {
  const f = await comparisonFixture(), request = structuredClone(f.request), saved = structuredClone(request);
  const pending = prepareBasRevisionComparison(f.workflow, request); request.matches[0].reason = 'Concurrent caller mutation';
  const a = await pending, b = await prepareBasRevisionComparison(f.workflow, { ...saved, matches: [...saved.matches].reverse() });
  assert.deepEqual(a.report, b.report); assert.equal(a.request.matches.some(m => m.reason === 'Concurrent caller mutation'), false);
  const controller = new AbortController(); controller.abort(new Error('Controlled comparison cancellation'));
  await assert.rejects(prepareBasRevisionComparison(f.workflow, saved, controller.signal), /Controlled comparison cancellation/);
});

test('partial source sets account for omitted evidence without inventing removals or numeric zeros', async () => {
  const f = await revisionFixture(), workflow = await addRevisionSourceSet(f.workflow, [0], 540);
  const request = { before: f.basis, after: revisionBasis(workflow), matches: [], added: [], removed: [], membership_reviews: [] };
  const compared = await prepareBasRevisionComparison(workflow, request);
  const outside = compared.report.rows.filter(r => r.disposition === 'outside_after');
  assert.ok(outside.length > 0); assert.ok(outside.every(r => r.before === null && r.after?.source_scope === 'outside'));
  assert.ok(compared.report.rows.filter(r => r.issues.length).every(r => r.quantities.every(q => q.delta === null)));
  await assert.rejects(prepareBasRevisionComparison(workflow, { ...request, added: [{ item_id: outside[0].after!.item_id, reason: 'Cannot include an omitted source by decision' }] }), /Outside-set/);
});

test('numeric response binding rejects omissions, substitutions, changed bases and false completion claims', async () => {
  const f = await revisionFixture(), pair = { row_id: 'a'.repeat(64), metric_key: 'AI', dimension: 'declared_io:AI', basis: 'listed_matrix_only', before: 2, after: 5 };
  const input = { pairs: [pair], point_matrices: [{ capture_id: f.workflow.current_capture_id!, matrix: f.workflow.captures[0].points.matrices[0] }] };
  const output = { schema_version: 'bas_revision_quantities_v1', rule_version: 'comparable_declared_count_deltas_1', engine: 'bas_math_v1',
    pairs: [{ ...pair, delta: 3 }], checked_point_matrices: [{ capture_id: input.point_matrices[0].capture_id, matrix_id: input.point_matrices[0].matrix.matrix_id }],
    installed_quantity: null, approved: false, project_complete: false };
  assert.deepEqual(verifyBasRevisionQuantityResult(input, output), output);
  for (const change of [
    (o: typeof output) => { o.pairs = []; }, (o: typeof output) => { o.pairs[0].after = 6; },
    (o: typeof output) => { o.pairs[0].basis = 'different'; }, (o: typeof output) => { o.checked_point_matrices = []; },
    (o: typeof output) => { o.checked_point_matrices[0].capture_id = 'f'.repeat(64); },
    (o: typeof output) => { o.approved = true; }, (o: typeof output) => { o.rule_version = 'unrecognized'; },
  ]) { const corrupt = structuredClone(output); change(corrupt); assert.throws(() => verifyBasRevisionQuantityResult(input, corrupt)); }
});
