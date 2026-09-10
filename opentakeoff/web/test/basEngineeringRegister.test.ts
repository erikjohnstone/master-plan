import test from 'node:test';
import assert from 'node:assert/strict';
import { engineeringFixture, uuid } from './helpers/basEngineeringFixture.ts';
import { validateBasEngineeringRegister, type BasEngineeringRegister } from '../src/lib/basEngineeringRegister.ts';

test('engineering ownership retains exact source text/bboxes and declared resource bindings without arithmetic', async () => {
  const f = await engineeringFixture(), before = structuredClone(f);
  const view = await validateBasEngineeringRegister(f.capture, f.equipment, f.assembly, f.register);
  assert.deepEqual(f, before);
  assert.deepEqual(view.register, f.register);
  const source = view.rating_sources.find(s => s.basis.origin === 'drawing_transcription')!;
  assert.deepEqual(source.source_spans[0].bbox_px, [10, 150, 1200, 170]);
  assert.equal(source.basis.original_text, f.source.pages[0].spans[1].text);
  assert.equal(view.project_complete, false); assert.equal(view.installed_quantity, null);
  assert.equal(view.validation_scope, 'source_and_resource_ownership_not_engineering_math');
  assert.equal('status' in view, false);
});

test('foreign sources, altered quotes, wrong equipment/component/scope and incomplete targets reject', async () => {
  const f = await engineeringFixture();
  const cases: Array<(r: BasEngineeringRegister) => void> = [
    r => { r.resources[0].source_span_ids = ['foreign-span']; },
    r => { r.resources[0].equipment_id = uuid(999); },
    r => { r.resources[0].equipment_id = uuid(12); },
    r => { r.resources[0].scope_id = uuid(999); },
    r => { r.resources[0].component_id = uuid(999); },
    r => { r.resources[0].roles = ['network_port']; },
    r => { r.resources.push(structuredClone(r.resources[0])); },
    r => { r.targets = []; },
    r => { r.targets[0].resource_ids.pop(); },
    r => { r.targets[0].resource_ids.push('foreign-resource'); },
    r => { r.targets[0].source_span_ids = ['foreign-span']; },
    r => { r.input.checks[0].equipment_ids.push(uuid(12)); },
    r => { const c = r.input.checks[0]; if (c.kind === 'signal') c.sink_modes!.basis.original_text = 'PROVIDE WITH 4-20 mA ACTUATOR'; },
    r => { const c = r.input.checks[0]; if (c.kind === 'signal') c.sink_modes!.basis.source_span_ids = [`sha256:${'b'.repeat(64)}:p1:s1`]; },
    r => { const c = r.input.checks[0]; if (c.kind === 'signal') c.sink.scope_id = uuid(999); },
  ];
  for (const corrupt of cases) {
    const register = structuredClone(f.register); corrupt(register);
    await assert.rejects(validateBasEngineeringRegister(f.capture, f.equipment, f.assembly, register));
  }
});

test('component exclusions, conditions and unknown lifecycle remain issues with the original check retained', async () => {
  const f = await engineeringFixture();
  f.assembly.components[0].disposition = 'excluded'; f.assembly.components[0].exclusion_reason = 'Controlled exclusion';
  f.assembly.components[1].condition = { status: 'unresolved', statement: 'If outside air provided', source_span_ids: [], reason: 'Controlled unknown predicate' };
  f.assembly.components[1].lifecycle = 'unknown';
  f.register.targets[0].disposition = 'excluded'; f.register.targets[0].exclusion_reason = 'Controlled excluded scope, retain outcome';
  const view = await validateBasEngineeringRegister(f.capture, f.equipment, f.assembly, f.register);
  assert.deepEqual(view.register.input, f.register.input);
  for (const code of ['engineering_component_excluded', 'engineering_component_condition_not_established',
    'engineering_component_lifecycle_unknown', 'engineering_check_explicitly_excluded']) assert.ok(view.issues.some(i => i.code === code));
});

test('no assembly is required for explicit equipment-owned endpoints, but component claims cannot lose their dependency', async () => {
  const f = await engineeringFixture();
  await assert.rejects(validateBasEngineeringRegister(f.capture, f.equipment, null, f.register), /unowned assembly/);
  f.register.resources.forEach(r => { r.component_id = null; });
  const view = await validateBasEngineeringRegister(f.capture, f.equipment, null, f.register);
  assert.deepEqual(view.register, f.register);
});
