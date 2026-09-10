import test from 'node:test';
import assert from 'node:assert/strict';
import { engineeringFixture, uuid } from './helpers/basEngineeringFixture.ts';
import { prepareBasEquipmentRegisterValidator, validateBasEquipmentRegister, type BasEquipmentRegister } from '../src/lib/basEquipmentRegister.ts';
import { prepareBasAssemblyRegisterValidator, validateBasAssemblyRegister } from '../src/lib/basAssemblyRegister.ts';
import { BAS_COMPONENT_SOURCE_RULE_V2 } from '../src/lib/basComponentRequirements.ts';
import { basEventFingerprint, captureBasEvidence, mergeBasWorkflows, verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
import { applyBasEquipmentReview } from '../src/lib/basEquipmentReview.ts';
import { applyBasAssemblyReview } from '../src/lib/basAssemblyReview.ts';
import { buildBasEquipmentCandidates } from '../src/lib/basEquipmentEvidence.ts';
import { buildBasAssemblyQuantityInput, assemblyQuantityInputForValidatedRegisters } from '../src/lib/basAssemblyQuantityContract.ts';

test('prepared equipment validation preserves views and isolates input/output mutation across calls', async () => {
  const f = await engineeringFixture({ withSequence: true });
  const evidence = structuredClone(f.capture.equipment_sources!);
  evidence.tables[0].metadata = { nested: ['retained original metadata'] };
  const source = structuredClone(f.source), points = structuredClone(f.capture.points);
  const register = structuredClone(f.equipment);
  const candidates = await buildBasEquipmentCandidates(source, evidence);
  for (const equipment of register.equipment) equipment.bindings[0].occurrence_id = candidates.tables[0].rows[0].occurrence_id;
  const expected = await validateBasEquipmentRegister(source, evidence, points, register);
  const pending = prepareBasEquipmentRegisterValidator(source, evidence, points);
  evidence.tables[0].rows[0].cells.TAG.text = 'FORGED';
  (evidence.tables[0].metadata as { nested: string[] }).nested[0] = 'FORGED';
  source.pages[0].spans[0].text = 'FORGED'; points.matrices.length = 0;
  const validate = await pending;
  const first = validate(register);
  assert.deepEqual(first, expected);
  first.candidates.tables[0].rows[0].membership!.members!.length = 0;
  (first.candidates.tables[0].raw.metadata as { nested: string[] }).nested[0] = 'FORGED';
  first.register.scopes[0].building = 'FORGED'; first.issues.length = 0;
  assert.deepEqual(validate(register), expected);
  const bad: BasEquipmentRegister = structuredClone(register); bad.equipment[0].bindings[0].member = 'AHU-99';
  assert.throws(() => validate(bad), /retained member|owned printed member/);
  bad.equipment[0].bindings[0].member = 'AHU-1'; bad.scopes[0].source_span_ids = ['foreign'];
  assert.throws(() => validate(bad), /foreign source span/);
  assert.deepEqual(validate(register), expected, 'A rejected call must not poison the next validation');
});

test('prepared assembly validation pins equipment/source inputs and validates every rule/register', async () => {
  const f = await engineeringFixture();
  const source = structuredClone(f.source), equipment = structuredClone(f.equipment);
  const expected = await validateBasAssemblyRegister(source, f.capture.equipment_sources!, f.capture.points, equipment, f.assembly);
  const pending = prepareBasAssemblyRegisterValidator(source, f.capture.equipment_sources!, f.capture.points, equipment);
  equipment.equipment.length = 0; source.pages[0].spans.length = 0;
  const validate = await pending;
  const first = validate(f.assembly);
  assert.deepEqual(first, expected);
  first.components[0].record.equipment_ids.length = 0; first.equipment_issues.push({ code: 'FORGED' });
  assert.deepEqual(validate(f.assembly), expected);
  const v2 = { ...f.assembly, source_rule_version: BAS_COMPONENT_SOURCE_RULE_V2 };
  assert.deepEqual(validate(v2), await validateBasAssemblyRegister(f.source, f.capture.equipment_sources!, f.capture.points, f.equipment, v2));
  assert.deepEqual(validate(f.assembly), expected, 'Switching rule versions must not reuse another interpretation');
  const bad = structuredClone(f.assembly); bad.components[0].source_requirement_ids = ['fabricated'];
  assert.throws(() => validate(bad), /source requirement is unavailable/);
  bad.components[0].source_requirement_ids = []; bad.components[0].equipment_ids = [uuid(999)];
  assert.throws(() => validate(bad), /registered equipment/);
  assert.throws(() => validate({ ...f.assembly, source_rule_version: 'future_rule' }), /Invalid enum/);
  assert.deepEqual(validate(f.assembly), expected);
});

test('workflow context reuse still rejects a rehashed invalid later equipment or assembly event', async () => {
  const f = await engineeringFixture();
  let workflow = await applyBasAssemblyReview(f.workflow, { capture_id: f.capture.capture_id, operation_id: uuid(61),
    expected_head: f.workflow.assembly_events![0].event_id, expected_equipment_head: f.workflow.equipment_events![0].event_id,
    register: f.assembly, reason: 'Same pinned historical head' }, 'operator_input');
  workflow = await applyBasEquipmentReview(workflow, { capture_id: f.capture.capture_id, operation_id: uuid(60),
    expected_head: f.workflow.equipment_events![0].event_id, register: f.equipment, reason: 'Second controlled event' }, 'operator_input');
  assert.deepEqual(await verifyBasWorkflow(workflow), workflow);
  const badEquipment = structuredClone(workflow), e = badEquipment.equipment_events!.at(-1)!;
  e.register.scopes[0].source_span_ids = ['foreign'];
  const { event_id: _equipmentId, ...equipmentPayload } = e;
  e.event_id = await basEventFingerprint(equipmentPayload);
  await assert.rejects(verifyBasWorkflow(badEquipment), /foreign source span/);
  const badAssembly = structuredClone(workflow), a = badAssembly.assembly_events!.at(-1)!;
  a.register.components[0].source_requirement_ids = ['fabricated'];
  const { event_id: _assemblyId, ...assemblyPayload } = a;
  a.event_id = await basEventFingerprint(assemblyPayload);
  await assert.rejects(verifyBasWorkflow(badAssembly), /source requirement is unavailable/);
  const badInterpretation = structuredClone(workflow), interpreted = badInterpretation.assembly_events!.at(-1)!;
  interpreted.source_interpretation_fingerprint = '0'.repeat(64);
  const { event_id: _interpretationId, ...interpretationPayload } = interpreted;
  interpreted.event_id = await basEventFingerprint(interpretationPayload);
  await assert.rejects(verifyBasWorkflow(badInterpretation), /source interpretation changed/);
});

test('workflow contexts do not transfer source members across different captures', async () => {
  const f = await engineeringFixture(), other = await engineeringFixture({ sha256: 'b'.repeat(64) });
  const second = await captureBasEvidence(other.source, other.capture.points, other.capture.equipment_sources);
  const merged = mergeBasWorkflows(f.workflow, second, true)!;
  const workflow = await applyBasEquipmentReview(merged, { capture_id: second.current_capture_id, operation_id: uuid(70),
    expected_head: null, register: other.equipment, reason: 'Separate controlled source version' }, 'operator_input');
  assert.deepEqual(await verifyBasWorkflow(workflow), workflow);
  const bad = structuredClone(workflow), event = bad.equipment_events!.at(-1)!;
  event.register.equipment[0].bindings = f.equipment.equipment[0].bindings;
  const { event_id: _id, ...payload } = event; event.event_id = await basEventFingerprint(payload);
  await assert.rejects(verifyBasWorkflow(bad), /owned printed member/);
});

test('assembly context changes with equipment head and cannot keep a removed member alive', async () => {
  const f = await engineeringFixture(), equipment = structuredClone(f.equipment);
  equipment.equipment = equipment.equipment.filter(e => e.equipment_id !== uuid(11));
  let workflow = await applyBasEquipmentReview(f.workflow, { capture_id: f.capture.capture_id, operation_id: uuid(80),
    expected_head: f.workflow.equipment_events![0].event_id, register: equipment, reason: 'Remove controlled member' }, 'operator_input');
  workflow = await applyBasAssemblyReview(workflow, { capture_id: f.capture.capture_id, operation_id: uuid(81),
    expected_head: f.workflow.assembly_events![0].event_id, expected_equipment_head: workflow.equipment_events!.at(-1)!.event_id,
    register: { ...f.assembly, components: [] }, reason: 'New assembly under changed membership' }, 'operator_input');
  assert.deepEqual(await verifyBasWorkflow(workflow), workflow);
  const bad = structuredClone(workflow), event = bad.assembly_events!.at(-1)!;
  event.register = f.assembly;
  const { event_id: _id, ...payload } = event; event.event_id = await basEventFingerprint(payload);
  await assert.rejects(verifyBasWorkflow(bad), /registered equipment/);
});

test('verified-history calculation projection exactly matches the public validated builder', async () => {
  const f = await engineeringFixture();
  const equipmentHead = f.workflow.equipment_events![0].event_id, assemblyHead = f.workflow.assembly_events![0].event_id;
  const expected = await buildBasAssemblyQuantityInput(f.capture, f.equipment, equipmentHead, f.assembly, assemblyHead);
  assert.deepEqual(assemblyQuantityInputForValidatedRegisters(f.capture.capture_id, f.equipment, equipmentHead, f.assembly, assemblyHead), expected);
  const bad = structuredClone(f.assembly); bad.components[0].source_requirement_ids = ['fabricated'];
  await assert.rejects(buildBasAssemblyQuantityInput(f.capture, f.equipment, equipmentHead, bad, assemblyHead), /source requirement is unavailable/);
});
