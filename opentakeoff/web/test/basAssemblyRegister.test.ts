import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import { buildBasSourceContext, type BasSourceSpan } from '../src/lib/basSources.ts';
import { basPointListsSchema } from '../src/lib/basPointLists.ts';
import { captureBasEquipmentTables, buildBasEquipmentCandidates } from '../src/lib/basEquipmentEvidence.ts';
import { emptyBasEquipmentRegister } from '../src/lib/basEquipmentRegister.ts';
import { interpretBasComponentRequirements } from '../src/lib/basComponentRequirements.ts';
import { emptyBasAssemblyRegister, validateBasAssemblyRegister, type BasAssemblyComponent, type BasAssemblyRegister } from '../src/lib/basAssemblyRegister.ts';
import { captureBasEvidence, basEventFingerprint, mergeBasWorkflows, verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
import { applyBasEquipmentReview, basEquipmentHead } from '../src/lib/basEquipmentReview.ts';
import { applyBasAssemblyReview, basAssemblyHead, basAssemblyView } from '../src/lib/basAssemblyReview.ts';
import { BAS_WORKFLOW_REVISIONS, atLeastBasWorkflowRevision } from '../src/lib/basWorkflowRevision.ts';
import { createLocalStore } from '../src/lib/store.js';
import { mergeTakeoffImport, parseTakeoffImport } from '../src/lib/importTakeoff.js';

const read = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const raw = read('../../docs/bas-production/evidence/baseline/fort-sam-text.json');
const truth = read('./fixtures/bas-requirement-source-cases.json');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sources = buildBasSourceContext([{ name: 'reviewed.pdf', sha256: raw.sha256, byte_length: 924578,
  page_count: raw.pages.length, pages: raw.pages.map((p: { page: number; width: number; height: number; spans: unknown[] }) => ({
    page_number: p.page, sheet_key: `reviewed.pdf#${p.page}`, width_px: p.width, height_px: p.height, rotation: 0, spans: p.spans,
  })) }]);
assert.equal(raw.sha256, truth.source_sha256);
const schedule = sources.pages.find(p => p.page_number === truth.scope_evidence.schedule_page)!;
const named: BasSourceSpan[] = truth.scope_evidence.scheduled_members.slice(0, 2).map((item: { span: number; tag: string }) => {
  const span = schedule.spans[item.span]; assert.equal(span.text, item.tag); return span;
});
// Controlled table adapter assembled from independently reviewed original TAG
// spans. This test is not an actual graph-extraction or complete PDF workflow.
const evidence = captureBasEquipmentTables([{ kind: 'equipment', sheet: schedule.sheet_keys[0],
  title: { sheet: schedule.sheet_keys[0], text: 'Source-derived test equipment table', bbox: named[0].bbox_px }, region: [0, 0, schedule.width_px, schedule.height_px],
  headers: ['TAG'], rows: named.map(span => ({ key: span.text, sheet: schedule.sheet_keys[0], cells: { TAG: { text: span.text, bbox: span.bbox_px } } })) }]);
const candidates = await buildBasEquipmentCandidates(sources, evidence);
const points = basPointListsSchema.parse({ schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1',
  scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [] });
const equipment = emptyBasEquipmentRegister();
equipment.scopes = [{ scope_id: uuid(1), building: null, level: null, system: 'Reviewed DOAS scope', phase: null,
  source_span_ids: [], reason: 'Explicit test applicability, not inferred installed scope' }];
equipment.equipment = named.map((span, i) => ({ equipment_id: uuid(10 + i), scope_id: uuid(1), tag: span.text,
  bindings: [{ occurrence_id: candidates.tables[0].rows[i].occurrence_id, member: span.text }], reason: 'Controlled binding to original printed member' }));
const declarations = interpretBasComponentRequirements(sources).clauses;
const onPage = (page: number) => declarations.filter(c => c.page_id.endsWith(`:p${page}`)).flatMap(c => c.components);
const supply = onPage(8).find(c => c.component_kind === 'variable_frequency_drive' && c.fan_role === 'SUPPLY')!;
const exhaust = onPage(8).find(c => c.component_kind === 'variable_frequency_drive' && c.fan_role === 'EXHAUST')!;
const controller = onPage(8).find(c => c.component_kind === 'onboard_controller')!;
assert.ok(supply && exhaust && controller);
function component(n = 100, declaration = supply): BasAssemblyComponent {
  return { component_id: uuid(n), scope_id: uuid(1), equipment_ids: equipment.equipment.map(e => e.equipment_id),
    excluded_equipment_ids: [], member_exclusion_reason: null,
    label: declaration.component_kind === 'onboard_controller' ? 'Integral controller' : `${declaration.fan_role} fan VFD`,
    component_kind: declaration.component_kind, source_requirement_ids: [declaration.requirement_id], source_span_ids: [],
    quantity: { value: 1, basis: 'per_equipment', origin: 'source_declaration', reason: 'Explicit literal one; per-member applicability is this test operator decision' },
    lifecycle: 'unknown', disposition: 'included', exclusion_reason: null,
    condition: { status: 'unconditional', statement: null, source_span_ids: [], reason: 'Selected complete declarative clause; no project-completeness assertion' },
    responsibility_claims: [], responsibility_resolutions: [], reason: 'Source-reviewed test assembly, not verified installations' };
}
const register = (...components: BasAssemblyComponent[]): BasAssemblyRegister => ({ ...emptyBasAssemblyRegister(), components });
const validate = (value: unknown, members = equipment) => validateBasAssemblyRegister(sources, evidence, points, members, value);

test('real source VFD roles remain distinct and all original evidence and applicability survive review', async () => {
  const input = register(component(), component(101, exhaust)), before = structuredClone({ input, sources, equipment, evidence, points });
  const view = await validate(input);
  assert.equal(view.components.length, 2);
  assert.deepEqual(view.components.map(c => c.declarations[0].component.fan_role), ['SUPPLY', 'EXHAUST']);
  assert.ok(view.components.every(c => c.record.quantity.value === 1 && c.included_equipment_ids.length === 2));
  assert.ok(view.components.every(c => c.installed_quantity === null && c.quantity_status === 'requires_shared_python_derivation'));
  assert.ok(view.equipment_issues.some(i => i.code === 'scope_partly_unknown' && i.scope_id === uuid(1)), 'Upstream scope issues must survive assembly review');
  const key = truth.component_cases.find((c: { case_id: string }) => c.case_id === 'supply-and-exhaust-vfds-are-distinct');
  assert.ok(view.components[0].declarations[0].clause.source_spans.some(s => s.text === key.text));
  assert.equal('total' in view, false);
  assert.deepEqual(await validate(JSON.parse(JSON.stringify(input))), view);
  view.components[0].declarations[0].clause.source_spans[0].text = 'Change returned copy';
  assert.deepEqual({ input, sources, equipment, evidence, points }, before);
});

test('factory furnishing does not assign install, wiring, programming, testing or a named contractor', async () => {
  const record = component(100, controller);
  record.responsibility_claims = [{ claim_id: uuid(200), activity: 'install', assignment: 'named_party', party: 'Declared installer',
    source_span_ids: [], reason: 'Explicit test responsibility, not extracted from factory-furnished wording' }];
  const view = await validate(register(record)), activities = view.components[0].responsibilities;
  const furnishing = activities.find(a => a.activity === 'furnish')!;
  assert.equal(furnishing.assignment, 'factory_furnished'); assert.equal(furnishing.party, null);
  assert.equal(furnishing.claims[0].origin, 'source_declaration'); assert.ok(furnishing.claims[0].source_span_ids.length);
  assert.equal(activities.find(a => a.activity === 'install')!.party, 'Declared installer');
  for (const name of ['wire', 'program', 'test']) assert.equal(activities.find(a => a.activity === name)!.assignment, 'unknown');
  assert.ok(view.issues.some(i => i.code === 'responsibility_unknown' && i.activity === 'wire'));
});

test('conflicting responsibility decisions require an explicit resolution and never remove original claims', async () => {
  const record = component(100, controller);
  record.responsibility_claims = [{ claim_id: uuid(200), activity: 'furnish', assignment: 'named_party', party: 'Field controls contractor',
    source_span_ids: [], reason: 'Conflicting disclosed test input' }];
  let view = await validate(register(record));
  assert.equal(view.components[0].responsibilities[0].status, 'conflict');
  const originalClaims = structuredClone(view.components[0].responsibilities[0].claims);
  assert.equal(originalClaims.length, 2);
  record.responsibility_resolutions = [{ activity: 'furnish', selected_claim_id: originalClaims[0].claim_id, reason: 'Retain original factory basis after test review' }];
  view = await validate(register(record));
  assert.equal(view.components[0].responsibilities[0].status, 'explicit_resolution');
  assert.equal(view.components[0].responsibilities[0].assignment, 'factory_furnished');
  assert.deepEqual(view.components[0].responsibilities[0].claims, originalClaims);
  assert.ok(!view.issues.some(i => i.code === 'responsibility_conflict'));
  record.responsibility_resolutions[0].selected_claim_id = 'foreign';
  await assert.rejects(validate(register(record)), /unowned/);
  record.responsibility_resolutions[0] = { activity: 'wire', selected_claim_id: originalClaims[0].claim_id, reason: 'Wrong activity' };
  await assert.rejects(validate(register(record)), /wrong-activity/);
});

test('duplicate source consumption rejects overlap but permits separate members and reasoned exclusions', async () => {
  const a = component(), b = component(101);
  await assert.rejects(validate(register(a, b)), /overlapping/);
  a.equipment_ids = [uuid(10)]; b.equipment_ids = [uuid(11)];
  assert.equal((await validate(register(a, b))).components.length, 2);
  b.equipment_ids = [uuid(10), uuid(11)]; b.excluded_equipment_ids = [uuid(10)]; b.member_exclusion_reason = 'Separate member already accounted for';
  assert.equal((await validate(register(a, b))).components.length, 2);
  b.excluded_equipment_ids = []; b.member_exclusion_reason = null; b.disposition = 'excluded'; b.exclusion_reason = 'Explicit duplicate exclusion';
  const view = await validate(register(a, b));
  assert.equal(view.components.length, 2, 'Excluded source row retained, not silently deleted');
});

test('zero, unknown, conditions and lifecycle are retained without browser arithmetic or installed claims', async () => {
  for (const value of [0, null]) {
    const record = component(); record.quantity = { ...record.quantity, value, origin: 'explicit_decision', reason: 'Explicit bounded test value' };
    record.condition = { status: 'unresolved', statement: 'Only if a source-stated condition is established', source_span_ids: [], reason: 'Predicate not established' };
    for (const lifecycle of ['new', 'existing', 'reuse', 'demolition', 'unknown'] as const) {
      record.lifecycle = lifecycle;
      const view = await validate(register(record));
      assert.equal(view.components[0].record.quantity.value, value);
      assert.equal(view.components[0].record.lifecycle, lifecycle);
      assert.ok(view.issues.some(i => i.code === 'component_condition_unresolved'));
      assert.equal(view.issues.some(i => i.code === 'component_quantity_unknown'), value === null);
      assert.equal(view.components[0].installed_quantity, null);
    }
  }
  const a = component(), b = component(101);
  b.condition = { status: 'not_satisfied', statement: 'Conditional separate requirement', source_span_ids: [], reason: 'Predicate explicitly false in test' };
  assert.equal((await validate(register(a, b))).components[1].record.condition.status, 'not_satisfied');
});

test('source kind/quantity/role spoofing rejects while disclosed corrections retain original conflicts', async () => {
  const record = component(); record.quantity.value = 2;
  await assert.rejects(validate(register(record)), /disagrees/);
  record.quantity.origin = 'explicit_decision';
  const corrected = await validate(register(record));
  assert.equal(corrected.components[0].declarations[0].component.declared_quantity, 1);
  assert.equal(corrected.components[0].record.quantity.value, 2);
  assert.ok(corrected.issues.some(i => i.code === 'source_declaration_corrected_by_explicit_decision'));
  const roles = component(); roles.source_requirement_ids.push(exhaust.requirement_id);
  await assert.rejects(validate(register(roles)), /Distinct declared component roles/);
  const kind = component(); kind.component_kind = 'relay';
  await assert.rejects(validate(register(kind)), /disagrees/);
});

test('foreign source/member identities, invalid exclusions and counterfeit source results reject', async () => {
  const cases = [
    (c: BasAssemblyComponent) => { c.source_requirement_ids = ['foreign']; },
    (c: BasAssemblyComponent) => { c.source_requirement_ids = []; },
    (c: BasAssemblyComponent) => { c.source_span_ids = ['foreign']; },
    (c: BasAssemblyComponent) => { c.equipment_ids = [uuid(999)]; },
    (c: BasAssemblyComponent) => { c.scope_id = uuid(999); },
    (c: BasAssemblyComponent) => { c.equipment_ids.push(c.equipment_ids[0]); },
    (c: BasAssemblyComponent) => { c.excluded_equipment_ids = [uuid(999)]; c.member_exclusion_reason = 'Foreign exception'; },
    (c: BasAssemblyComponent) => { c.disposition = 'excluded'; },
    (c: BasAssemblyComponent) => { c.quantity.value = Number.MAX_SAFE_INTEGER + 1; },
  ];
  for (const alter of cases) { const record = component(); alter(record); await assert.rejects(validate(register(record))); }
  await assert.rejects(validate(register(component(), component())), /Duplicate/);
  await assert.rejects(validate({ ...register(component()), source_rule_version: 'unverified-rule' }));
  await assert.rejects(validate(register({ ...component(), installed_quantity: 2 } as BasAssemblyComponent)));
  const unownedEquipment = structuredClone(equipment); unownedEquipment.equipment[0].bindings[0].member = 'DOAS-999';
  await assert.rejects(validate(register(component()), unownedEquipment), /member/);
  const split = structuredClone(equipment); split.scopes.push({ ...split.scopes[0], scope_id: uuid(2), building: 'Another building' });
  split.equipment[1].scope_id = uuid(2);
  await assert.rejects(validate(register(component()), split), /one existing scope/);
});

test('same labels from different regions stay separate and are flagged instead of automatically merged', async () => {
  const other = onPage(7).find(c => c.component_kind === 'variable_frequency_drive' && c.fan_role === 'SUPPLY')!;
  assert.ok(other); assert.notEqual(other.requirement_id, supply.requirement_id);
  const view = await validate(register(component(), component(101, other)));
  assert.equal(view.components.length, 2);
  assert.ok(view.issues.some(i => i.code === 'possible_duplicate_component_requires_review'));
  assert.ok(view.components.every(c => c.declarations.length === 1));
});

test('explicit manual components remain decisions and invalid activity/party combinations cannot impersonate evidence', async () => {
  const record = component(); record.source_requirement_ids = []; record.quantity.origin = 'explicit_decision';
  record.component_kind = 'accessory'; record.quantity.value = null; record.label = 'User-declared unresolved accessory';
  const view = await validate(register(record));
  assert.equal(view.components[0].declarations.length, 0);
  assert.equal(view.components[0].record.quantity.origin, 'explicit_decision');
  assert.equal(view.components[0].record.quantity.value, null);
  const claim = { claim_id: uuid(200), activity: 'wire' as const, assignment: 'unknown' as const, party: null, source_span_ids: [], reason: 'Unknown wiring party' };
  for (const altered of [{ ...claim, assignment: 'factory_furnished' }, { ...claim, assignment: 'field_installed' },
    { ...claim, assignment: 'named_party' }, { ...claim, party: 'Undeclared party' }, { ...claim, origin: 'source_declaration' },
    { ...claim, source_span_ids: ['foreign'] }]) {
    await assert.rejects(validate(register({ ...record, responsibility_claims: [altered] } as BasAssemblyComponent)));
  }
  record.responsibility_claims = [claim];
  assert.equal((await validate(register(record))).components[0].responsibilities.find(a => a.activity === 'wire')!.status, 'unknown');
});

const captured = await captureBasEvidence(sources, points, evidence);
const captureId = captured.current_capture_id!;
const established = await applyBasEquipmentReview(captured, { operation_id: uuid(2000), capture_id: captureId,
  expected_head: null, reason: 'Controlled source-backed assembly test equipment', register: equipment }, 'operator_input', '2026-09-09T12:00:00.000Z');
const assemblyRequest = () => ({ operation_id: uuid(2001), capture_id: captureId, expected_head: null,
  expected_equipment_head: basEquipmentHead(established, captureId)!, reason: 'Review original VFD requirement applicability',
  register: register(component(), component(101, controller)) });

test('assembly history pins source/rule/equipment, is replayable and exact retries preserve every previous byte', async () => {
  const original = structuredClone(established), request = assemblyRequest();
  const saved = await applyBasAssemblyReview(established, request, 'operator_input');
  assert.equal(saved.revision, 'bas_assembly_5'); assert.equal(saved.assembly_events?.length, 1);
  assert.equal(saved.assembly_events![0].expected_equipment_head, request.expected_equipment_head);
  assert.equal(saved.assembly_events![0].source_interpretation_fingerprint.length, 64);
  assert.deepEqual(saved.captures, established.captures);
  assert.deepEqual(saved.equipment_events, established.equipment_events);
  assert.deepEqual(await verifyBasWorkflow(JSON.parse(JSON.stringify(saved))), saved);
  assert.deepEqual(await applyBasAssemblyReview(saved, request, 'operator_input'), saved);
  const view = await basAssemblyView(saved, captureId);
  assert.equal(view.dependency_status, 'current_dependencies'); assert.equal(view.source_status, 'active_capture');
  assert.equal(view.components[1].responsibilities[0].assignment, 'factory_furnished');
  assert.deepEqual(established, original);
  await assert.rejects(applyBasAssemblyReview(saved, { ...request, reason: 'Different request under same ID' }, 'operator_input'), /reused/);
  await assert.rejects(applyBasAssemblyReview(saved, request, 'agent_proposal'), /reused/);
  await assert.rejects(applyBasAssemblyReview(saved, { ...request, operation_id: uuid(2002) }, 'operator_input'), /changed since/);
  await assert.rejects(applyBasAssemblyReview(established, { ...request, operation_id: uuid(2000) }, 'operator_input'), /Duplicate/);
});

test('withdrawal and equipment rebase preserve old assembly members and responsibility evidence as stale history', async () => {
  const request = assemblyRequest(), saved = await applyBasAssemblyReview(established, request, 'operator_input');
  const withdrawn = await applyBasEquipmentReview(saved, { operation_id: uuid(2003), capture_id: captureId,
    expected_head: basEquipmentHead(saved, captureId), reason: 'Withdraw controlled equipment, retain assembly history',
    register: emptyBasEquipmentRegister() }, 'operator_input');
  assert.equal(withdrawn.revision, 'bas_assembly_5');
  assert.deepEqual(await verifyBasWorkflow(withdrawn), withdrawn, 'Old assembly must validate against its historical equipment event');
  const stale = await basAssemblyView(withdrawn, captureId);
  assert.equal(stale.dependency_status, 'stale_dependencies'); assert.equal(stale.components.length, 2);
  assert.deepEqual(stale.components[0].included_equipment_ids, [uuid(10), uuid(11)]);
  assert.deepEqual(await applyBasAssemblyReview(withdrawn, request, 'operator_input'), withdrawn, 'Historical retry never resurrects old equipment');
  await assert.rejects(applyBasAssemblyReview(withdrawn, { ...request, operation_id: uuid(2004), expected_head: basAssemblyHead(withdrawn, captureId) }, 'operator_input'), /Equipment decisions changed/);
  const rebase = { ...request, operation_id: uuid(2005), expected_head: basAssemblyHead(withdrawn, captureId),
    expected_equipment_head: basEquipmentHead(withdrawn, captureId)!, reason: 'Explicit removal after equipment withdrawal', register: emptyBasAssemblyRegister() };
  const rebased = await applyBasAssemblyReview(withdrawn, rebase, 'operator_input');
  assert.equal((await basAssemblyView(rebased, captureId)).components.length, 0);
  assert.equal((await basAssemblyView(rebased, captureId)).dependency_status, 'current_dependencies');
  assert.equal(rebased.assembly_events?.length, 2); assert.deepEqual(rebased.assembly_events![0], saved.assembly_events![0]);
  assert.deepEqual(rebased.captures, saved.captures);
  assert.deepEqual(await verifyBasWorkflow(rebased), rebased);
});

test('source changes retain historical assemblies without authorizing edits against inactive evidence', async () => {
  const saved = await applyBasAssemblyReview(established, assemblyRequest(), 'operator_input');
  const otherCapture = await captureBasEvidence(sources, points);
  const merged = mergeBasWorkflows(saved, otherCapture, true)!;
  assert.equal(merged.revision, 'bas_assembly_5');
  assert.equal((await basAssemblyView(merged, captureId)).source_status, 'historical_capture');
  await assert.rejects(applyBasAssemblyReview(merged, { ...assemblyRequest(), operation_id: uuid(2002), expected_head: basAssemblyHead(merged, captureId) }, 'operator_input'), /active BAS capture changed/);
  assert.deepEqual(await verifyBasWorkflow(merged), merged);
});

test('assembly fingerprints, rule/source ownership, dependency IDs and divergent imports cannot be bypassed', async () => {
  const request = assemblyRequest(), saved = await applyBasAssemblyReview(established, request, 'operator_input');
  const tampered = structuredClone(saved); tampered.assembly_events![0].register.components[0].quantity.value = 2;
  await assert.rejects(verifyBasWorkflow(tampered), /fingerprint/);
  for (const alter of [
    (w: typeof saved) => { w.assembly_events![0].source_interpretation_fingerprint = '0'.repeat(64); },
    (w: typeof saved) => { w.assembly_events![0].register.components[0].quantity.value = 2; },
    (w: typeof saved) => { w.assembly_events![0].expected_equipment_head = '0'.repeat(64); },
  ]) {
    const changed = structuredClone(saved); alter(changed);
    const { event_id: _old, ...payload } = changed.assembly_events![0];
    changed.assembly_events![0].event_id = await basEventFingerprint(payload);
    await assert.rejects(verifyBasWorkflow(changed));
  }
  const fork = await applyBasAssemblyReview(established, { ...request, operation_id: uuid(2008) }, 'operator_input');
  assert.throws(() => mergeBasWorkflows(saved, fork), /Divergent/);
  assert.throws(() => mergeBasWorkflows(saved, { ...saved, revision: 'bas_assignment_4' }), /assembly workflow revision/);
  assert.throws(() => interpretBasComponentRequirements(sources, 'future-rule'), /Unsupported/);
  for (const left of BAS_WORKFLOW_REVISIONS) for (const right of BAS_WORKFLOW_REVISIONS) {
    const result = atLeastBasWorkflowRevision(left, right);
    assert.ok(BAS_WORKFLOW_REVISIONS.indexOf(result) >= BAS_WORKFLOW_REVISIONS.indexOf(left));
    assert.ok(BAS_WORKFLOW_REVISIONS.indexOf(result) >= BAS_WORKFLOW_REVISIONS.indexOf(right));
  }
});

test('ordinary IndexedDB and takeoff import/export preserve the additive assembly workflow and proposal origin', async () => {
  const saved = await applyBasAssemblyReview(established, assemblyRequest(), 'agent_proposal');
  const store = createLocalStore('bas-assembly-review-test');
  await store.saveAnnotations({ project_name: 'Controlled assembly persistence', shapes: [], bas_workflow: saved });
  const restored = await store.loadAnnotations();
  assert.deepEqual(await verifyBasWorkflow(restored.bas_workflow), saved);
  const imported = parseTakeoffImport(JSON.stringify(restored));
  const merged = mergeTakeoffImport({ project_name: 'Keep current name', shapes: [], bas_workflow: captured }, imported);
  assert.deepEqual(await verifyBasWorkflow(merged.payload.bas_workflow), saved);
  assert.deepEqual(mergeTakeoffImport(merged.payload, imported).payload.bas_workflow, saved);
  assert.equal(saved.assembly_events![0].origin, 'agent_proposal', 'Save/import is not an operator approval');
  assert.deepEqual(mergeBasWorkflows(saved, established), saved);
  assert.deepEqual(mergeBasWorkflows(established, saved), saved);
});
