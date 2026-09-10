import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyBasAssemblyRegister, type BasAssemblyComponent } from '../src/lib/basAssemblyRegister.ts';
import { stageAssemblyComponent, stageAssemblyWithdrawal, assemblyPreviewReady } from '../src/components/basAssemblyEditorState.ts';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const component = (n: number): BasAssemblyComponent => ({ component_id: uuid(n), scope_id: uuid(10), equipment_ids: [uuid(20)],
  excluded_equipment_ids: [], member_exclusion_reason: null, label: `Controlled component ${n}`, component_kind: 'sensor',
  source_requirement_ids: [], source_span_ids: [], quantity: { value: null, basis: 'per_equipment', origin: 'explicit_decision', reason: 'Controlled unknown quantity' },
  lifecycle: 'unknown', disposition: 'included', exclusion_reason: null,
  condition: { status: 'unresolved', statement: 'Unestablished predicate', source_span_ids: [], reason: 'Controlled pending review' },
  responsibility_claims: [], responsibility_resolutions: [], reason: 'Controlled draft, not PDF truth' });

test('multiple assembly repairs stage independently without mutating any saved source or sibling record', () => {
  const original = { ...emptyBasAssemblyRegister(), components: [component(1), component(2)] }, before = structuredClone(original);
  const edited = { ...component(1), equipment_ids: [uuid(21)] };
  const first = stageAssemblyComponent(original, edited);
  assert.deepEqual(original, before);
  assert.deepEqual(first.components[1], original.components[1]);
  const second = stageAssemblyComponent(first, { ...component(2), equipment_ids: [uuid(22)] });
  assert.deepEqual(second.components.map(c => c.equipment_ids), [[uuid(21)], [uuid(22)]]);
  assert.deepEqual(first.components[1], original.components[1]);
  edited.equipment_ids.push(uuid(23));
  assert.deepEqual(first.components[0].equipment_ids, [uuid(21)]);
  // Staging intentionally cannot claim shared ownership validation: these fake
  // member IDs are only a local form draft until the whole register is checked.
  assert.equal('validated' in second, false);
  assert.throws(() => stageAssemblyComponent(original, { ...component(1), reason: '' }));
});

test('withdrawal requires an explicit reason and never alters the retained record', () => {
  const original = { ...emptyBasAssemblyRegister(), components: [component(1), component(2)] }, before = structuredClone(original);
  assert.throws(() => stageAssemblyWithdrawal(original, uuid(1), '  '), /why/);
  assert.throws(() => stageAssemblyWithdrawal(original, uuid(99), 'Controlled reason'), /not in/);
  const next = stageAssemblyWithdrawal(original, uuid(1), 'Equipment removed; retain source history');
  assert.deepEqual(next.components.map(c => c.component_id), [uuid(2)]);
  next.components[0].equipment_ids.push(uuid(99));
  assert.deepEqual(original, before);
});

test('a changed component, pending register, or source invalidates the complete preview', () => {
  const draft = { record: component(1) }, batch = { register: emptyBasAssemblyRegister(), reason: 'Pending repairs' };
  assert.equal(assemblyPreviewReady(null, undefined, undefined, false), false);
  assert.equal(assemblyPreviewReady({ input: undefined, batch: undefined }, undefined, undefined, false), false);
  const preview = { input: draft, batch };
  assert.equal(assemblyPreviewReady(preview, draft, batch, false), true);
  assert.equal(assemblyPreviewReady(preview, draft, { ...batch }, false), false);
  assert.equal(assemblyPreviewReady(preview, { ...draft }, batch, false), false);
  assert.equal(assemblyPreviewReady(preview, draft, batch, true), false);
  assert.equal(assemblyPreviewReady({ input: null, batch }, null, batch, false), true);
});
