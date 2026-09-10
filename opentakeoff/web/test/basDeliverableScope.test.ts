import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { revisionFixture, revisionBasis, addRevisionSourceSet } from './helpers/basRevisionFixture.ts';
import { uuid } from './helpers/basEngineeringFixture.ts';
import { buildBasDeliverableScope, basDeliverableScopeSchema, basDeliverableScopeSpecSchema, assertBasScopeSize,
  BAS_SCOPE_EDGE_LIMIT, BAS_SCOPE_MEMBERSHIP_LIMIT, BAS_SCOPE_PROJECTION_BYTES,
  type BasDeliverableScopeSpec, type BasDeliverableTarget } from '../src/lib/basDeliverableScope.ts';
import { buildBasRevisionInventory } from '../src/lib/basRevisionInventory.ts';
import { applyBasEquipmentReview } from '../src/lib/basEquipmentReview.ts';
import { applyBasAssemblyReview } from '../src/lib/basAssemblyReview.ts';
import { captureBasEvidence, mergeBasWorkflows, type BasWorkflow } from '../src/lib/basWorkflow.ts';
import { canonicalBasJson } from '../src/lib/basCanonical.ts';

const spec = (w: BasWorkflow, claim: BasDeliverableTarget['claim'] = 'scheduled_equipment', subject = uuid(11)): BasDeliverableScopeSpec => ({
  schema_version: 'bas_deliverable_scope_spec_v1', scope_id: uuid(300), name: 'Controlled deliverable', reason: 'Test scope, not an approval',
  basis: revisionBasis(w), included: [{ claim, capture_id: w.current_capture_id!, subject_id: subject }], excluded: [],
});

test('scope preview retains exact originals and source links without inventing approval or quantities', async () => {
  const f = await revisionFixture(), request = spec(f.workflow), before = structuredClone(f.workflow);
  request.included.push({ ...request.included[0], claim: 'assigned_points', subject_id: uuid(80) },
    { ...request.included[0], claim: 'assembly_components', subject_id: uuid(30) },
    { ...request.included[0], claim: 'responsibilities', subject_id: uuid(30) });
  const view = await buildBasDeliverableScope(f.workflow, request);
  assert.deepEqual(view.inventory, await buildBasRevisionInventory(f.workflow, request.basis));
  assert.deepEqual(view, basDeliverableScopeSchema.parse(view)); assert.deepEqual(f.workflow, before);
  const kinds = (claim: string) => new Set<string>(view.claims.find(c => c.target.claim === claim)!.dependency_item_ids
    .map(id => view.inventory.items.find(i => i.item_id === id)!.kind));
  assert.deepEqual([...kinds('scheduled_equipment')].sort(), ['equipment', 'equipment_row', 'equipment_table', 'scope']);
  for (const kind of ['assignment', 'point_matrix', 'point_row', 'sequence_link', 'sequence_region', 'sequence_clause', 'sequence_requirement']) {
    assert.ok(kinds('assigned_points').has(kind), kind);
  }
  assert.ok(kinds('assembly_components').has('component_requirement'));
  assert.ok(kinds('responsibilities').has('responsibility_claim')); assert.ok(kinds('responsibilities').has('responsibility_resolution'));
  assert.equal(kinds('assembly_components').has('responsibility_resolution'), false, 'Responsibility reporting is a separate claim');
  assert.ok(view.claims.find(c => c.target.claim === 'assigned_points')!.diagnostics.some(d => d.code === 'missing_saved_quantity'));
  assert.equal(view.approved, false); assert.equal(view.project_complete, false); assert.equal(view.installed_quantity, null);
  assert.equal(view.coverage_verification, 'not_reviewed'); assert.equal(view.calculation_verification, 'saved_results_not_python_replayed');
  assert.equal(view.source_bytes, 'not_verified'); assert.equal(view.issue_verification, 'not_evaluated');
  const row = view.inventory.items.find(i => i.kind === 'point_row')!;
  assert.equal(row.quantities.find(q => q.dimension === 'declared_io:DI')!.value, null);
  assert.ok(view.unselected_item_ids.length > 0);
  assert.deepEqual(await buildBasDeliverableScope(f.workflow, request), view);
});

test('claim exclusion retains included prerequisites, citations, original counts and all unselected evidence', async () => {
  const f = await revisionFixture(), request = spec(f.workflow, 'assigned_points', uuid(80));
  request.excluded.push({ target: { ...request.included[0], claim: 'scheduled_equipment', subject_id: uuid(12) },
    reason: 'Equipment schedule reporting by others', consequence: 'Still a member of this declared point assignment',
    evidence: [{ capture_id: f.workflow.current_capture_id!, page_id: f.source.pages[0].page_id, span_id: f.source.pages[0].spans[0].span_id }] });
  const before = structuredClone(f.workflow), view = await buildBasDeliverableScope(f.workflow, request), exclusion = view.exclusions[0];
  assert.deepEqual(f.workflow, before); assert.equal(exclusion.effect, 'claim_omitted_prerequisites_retained');
  assert.deepEqual(exclusion.dependency_of, request.included);
  assert.ok(view.claims[0].dependency_item_ids.includes(exclusion.root_item_id));
  assert.equal(exclusion.source_refs[0].text, f.source.pages[0].spans[0].text);
  assert.deepEqual(exclusion.source_refs[0].bbox_px, f.source.pages[0].spans[0].bbox_px);
  const original = JSON.parse(view.inventory.items.find(i => i.kind === 'assignment')!.original_json);
  assert.deepEqual(original.equipment_ids, [uuid(11), uuid(12)]);
  const without = await buildBasDeliverableScope(f.workflow, { ...request, excluded: [] });
  assert.notEqual(without.claims[0].dependency_fingerprint, view.claims[0].dependency_fingerprint);
  const unrelated = spec(f.workflow); unrelated.excluded = request.excluded;
  const other = await buildBasDeliverableScope(f.workflow, unrelated);
  assert.deepEqual(other.exclusions[0].dependency_of, []);
  assert.ok(other.unselected_item_ids.includes(other.exclusions[0].root_item_id));
  assert.equal(other.claims[0].dependency_fingerprint, (await buildBasDeliverableScope(f.workflow, spec(f.workflow))).claims[0].dependency_fingerprint);
});

test('unrelated edits preserve item fingerprints, related changes invalidate them, pinned history is not rebound', async () => {
  const f = await revisionFixture(), request = spec(f.workflow), old = await buildBasDeliverableScope(f.workflow, request);
  const changed = structuredClone(f.equipment); changed.equipment[1].reason = 'Only the other equipment changes';
  let w = await applyBasEquipmentReview(f.workflow, { operation_id: uuid(301), capture_id: f.workflow.current_capture_id,
    expected_head: f.basis.captures[0].equipment_head, register: changed, reason: 'Unrelated controlled change' }, 'operator_input');
  const newer = await buildBasDeliverableScope(w, spec(w));
  assert.equal(newer.claims[0].dependency_fingerprint, old.claims[0].dependency_fingerprint);
  const pinned = await buildBasDeliverableScope(w, request);
  assert.deepEqual(pinned.claims, old.claims); assert.equal(pinned.inventory.capabilities[0].selection_status, 'historical_selection');
  changed.scopes[0].building = 'B';
  w = await applyBasEquipmentReview(w, { operation_id: uuid(302), capture_id: w.current_capture_id,
    expected_head: w.equipment_events!.at(-1)!.event_id, register: changed, reason: 'Related scope change' }, 'operator_input');
  assert.notEqual((await buildBasDeliverableScope(w, spec(w))).claims[0].dependency_fingerprint, old.claims[0].dependency_fingerprint);
});

test('assembly conditions and responsibility changes stay dependency-bound; stale registers remain explicit', async () => {
  const f = await revisionFixture(), request = spec(f.workflow, 'responsibilities', uuid(31));
  const old = await buildBasDeliverableScope(f.workflow, request), register = structuredClone(f.assembly);
  register.components[1].responsibility_claims[0].reason = 'Updated wire-scope declaration';
  let w = await applyBasAssemblyReview(f.workflow, { operation_id: uuid(301), capture_id: f.workflow.current_capture_id,
    expected_head: f.basis.captures[0].assembly_head, expected_equipment_head: f.basis.captures[0].equipment_head,
    register, reason: 'Changed applicable activity decision' }, 'operator_input');
  assert.notEqual((await buildBasDeliverableScope(w, spec(w, 'responsibilities', uuid(31)))).claims[0].dependency_fingerprint, old.claims[0].dependency_fingerprint);
  const equipment = structuredClone(f.equipment); equipment.equipment[1].reason = 'Unrelated member review';
  w = await applyBasEquipmentReview(w, { operation_id: uuid(302), capture_id: w.current_capture_id,
    expected_head: f.basis.captures[0].equipment_head, register: equipment, reason: 'New register head' }, 'operator_input');
  const view = await buildBasDeliverableScope(w, spec(w, 'assembly_components', uuid(31)));
  assert.ok(view.claims[0].diagnostics.some(d => d.code === 'saved_dependencies_stale'));
  assert.ok(view.claims[0].diagnostics.some(d => d.code === 'pinned_dependency_changed'));
  const missing = spec(w, 'assembly_components', uuid(31)); missing.basis.captures[0].equipment_head = null;
  assert.ok((await buildBasDeliverableScope(w, missing)).claims[0].diagnostics.some(d => d.code === 'pinned_dependency_unavailable'));
  const priorCondition = await buildBasDeliverableScope(w, spec(w, 'assembly_components', uuid(31)));
  register.components[1].condition = { status: 'unresolved', statement: 'Only if an unestablished predicate holds', source_span_ids: [], reason: 'Unknown condition' };
  w = await applyBasAssemblyReview(w, { operation_id: uuid(303), capture_id: w.current_capture_id,
    expected_head: w.assembly_events!.at(-1)!.event_id, expected_equipment_head: w.equipment_events!.at(-1)!.event_id,
    register, reason: 'Unresolved condition remains an original domain issue' }, 'operator_input');
  const conditional = await buildBasDeliverableScope(w, spec(w, 'assembly_components', uuid(31)));
  assert.notEqual(conditional.claims[0].dependency_fingerprint, priorCondition.claims[0].dependency_fingerprint);
  const item = conditional.inventory.items.find(i => i.item_id === conditional.claims[0].root_item_id)!;
  assert.equal(JSON.parse(item.original_json).condition.status, 'unresolved');
  assert.equal(conditional.issue_verification, 'not_evaluated');
});

test('source boundaries are diagnosed, never removed from an included dependency', async () => {
  const f = await revisionFixture(), equipment = structuredClone(f.equipment);
  equipment.equipment[0].bindings.push({ occurrence_id: f.candidates.tables[1].rows[0].occurrence_id, member: 'AHU-1' });
  let w = await applyBasEquipmentReview(f.workflow, { operation_id: uuid(301), capture_id: f.workflow.current_capture_id,
    expected_head: f.basis.captures[0].equipment_head, register: equipment, reason: 'Explicit repeated view binding' }, 'operator_input');
  w = await addRevisionSourceSet(w, [0], 302);
  const view = await buildBasDeliverableScope(w, spec(w));
  assert.ok(view.claims[0].diagnostics.some(d => d.code === 'source_outside_scope'));
  assert.ok(view.inventory.items.some(i => view.claims[0].dependency_item_ids.includes(i.item_id) && i.source_scope === 'outside'));
  assert.equal(view.project_complete, false);
});

test('strict targets, exclusions and original-page citations reject ambiguity and foreign ownership', async () => {
  const f = await revisionFixture(), request = spec(f.workflow), cite = {
    capture_id: f.workflow.current_capture_id!, page_id: f.source.pages[0].page_id, span_id: f.source.pages[0].spans[0].span_id };
  assert.throws(() => basDeliverableScopeSpecSchema.parse({ ...request, included: [] }));
  assert.throws(() => basDeliverableScopeSpecSchema.parse({ ...request, included: [...request.included, ...request.included] }), /Duplicate/);
  assert.throws(() => basDeliverableScopeSpecSchema.parse({ ...request, approved: true }));
  for (const excluded of [
    [{ target: request.included[0], reason: 'x', consequence: 'x', evidence: [cite] }],
    [{ target: { ...request.included[0], subject_id: uuid(12) }, reason: ' ', consequence: 'x', evidence: [cite] }],
    [{ target: { ...request.included[0], subject_id: uuid(12) }, reason: 'x', consequence: 'x', evidence: [] }],
    [{ target: { ...request.included[0], subject_id: uuid(12) }, reason: 'x', consequence: 'x', evidence: [cite, cite] }],
  ]) await assert.rejects(buildBasDeliverableScope(f.workflow, { ...request, excluded }));
  for (const included of [[{ ...request.included[0], capture_id: 'f'.repeat(64) }], [{ ...request.included[0], subject_id: 'AHU-1' }]]) {
    await assert.rejects(buildBasDeliverableScope(f.workflow, { ...request, included }), /not owned/);
  }
  for (const evidence of [[{ ...cite, page_id: f.source.pages[1].page_id }], [{ ...cite, capture_id: 'f'.repeat(64) }], [{ ...cite, span_id: 'wrong' }]]) {
    await assert.rejects(buildBasDeliverableScope(f.workflow, { ...request, excluded: [{
      target: { ...request.included[0], subject_id: uuid(12) }, reason: 'x', consequence: 'x', evidence }] }), /not owned/);
  }
  const page = await buildBasDeliverableScope(f.workflow, { ...request, excluded: [{ target: { ...request.included[0], subject_id: uuid(12) },
    reason: 'Whole page context', consequence: 'No evidence deletion', evidence: [{ ...cite, span_id: null }] }] });
  assert.equal(page.exclusions[0].source_refs[0].bbox_px, null);
});

test('same subject UUIDs in separate captures cannot alias or inherit exclusions', async () => {
  const f = await revisionFixture(), points = structuredClone(f.workflow.captures[0].points); points.issues.push('Controlled different capture');
  const fresh = await captureBasEvidence(f.source, points, f.workflow.captures[0].equipment_sources);
  let w = mergeBasWorkflows(f.workflow, fresh, true)!;
  w = await applyBasEquipmentReview(w, { operation_id: uuid(301), capture_id: fresh.current_capture_id,
    expected_head: null, register: f.equipment, reason: 'Separately owned controlled register' }, 'operator_input');
  w = await addRevisionSourceSet(w, [0, 3], 302);
  const request = spec(w); request.included.push({ ...request.included[0], capture_id: f.workflow.current_capture_id! });
  const view = await buildBasDeliverableScope(w, request);
  assert.equal(view.claims.length, 2); assert.notEqual(view.claims[0].root_item_id, view.claims[1].root_item_id);
  assert.notEqual(view.claims[0].dependency_fingerprint, view.claims[1].dependency_fingerprint);
});

test('request ownership, canonical restore and cancellation do not mutate records or return partial scope', async () => {
  const f = await revisionFixture(), request = spec(f.workflow), before = structuredClone(f.workflow);
  const pending = buildBasDeliverableScope(f.workflow, request); request.included[0].subject_id = 'wrong';
  f.workflow.equipment_events![0].reason = 'Caller mutation';
  const view = await pending;
  assert.equal(view.claims[0].target.subject_id, uuid(11));
  assert.deepEqual(view, await buildBasDeliverableScope(JSON.parse(canonicalBasJson(before)), spec(before)));
  await assert.rejects(buildBasDeliverableScope(f.workflow, spec(f.workflow)), /fingerprint/);
  const abort = new AbortController(); abort.abort(new Error('Controlled scope cancellation'));
  await assert.rejects(buildBasDeliverableScope(before, spec(before), abort.signal), /Controlled scope cancellation/);
});

test('predeclared relationship, membership and byte budgets fail instead of truncating', () => {
  assert.doesNotThrow(() => assertBasScopeSize(BAS_SCOPE_EDGE_LIMIT, BAS_SCOPE_MEMBERSHIP_LIMIT, BAS_SCOPE_PROJECTION_BYTES));
  assert.throws(() => assertBasScopeSize(BAS_SCOPE_EDGE_LIMIT + 1, 0, 0), /relationship/);
  assert.throws(() => assertBasScopeSize(0, BAS_SCOPE_MEMBERSHIP_LIMIT + 1, 0), /membership/);
  assert.throws(() => assertBasScopeSize(0, 0, BAS_SCOPE_PROJECTION_BYTES + 1), /16 MiB/);
  for (const value of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => assertBasScopeSize(value, 0, 0), /Invalid/);
});

test('real retained Fort Sam evidence and controlled saved Python declarations survive full scope preview unchanged', async () => {
  const raw = JSON.parse(readFileSync(new URL('../../docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json', import.meta.url), 'utf8')).bas_workflow as BasWorkflow;
  const w = await addRevisionSourceSet(raw), request = spec(w), before = canonicalBasJson(w);
  request.included = w.equipment_events!.at(-1)!.register.equipment.map(e => ({ claim: 'scheduled_equipment', capture_id: w.current_capture_id!, subject_id: e.equipment_id }));
  request.included.push(...w.assembly_events!.at(-1)!.register.components.flatMap(c => [
    { claim: 'assembly_components' as const, capture_id: w.current_capture_id!, subject_id: c.component_id },
    { claim: 'responsibilities' as const, capture_id: w.current_capture_id!, subject_id: c.component_id }]));
  request.included.push(...w.engineering_events!.at(-1)!.register.input.checks.map(c => ({
    claim: 'engineering_compatibility' as const, capture_id: w.current_capture_id!, subject_id: c.check_id })));
  const view = await buildBasDeliverableScope(w, request);
  assert.equal(canonicalBasJson(w), before); assert.equal(view.inventory.items.length, 496);
  assert.ok(view.claims.some(c => c.diagnostics.some(d => d.code === 'python_replay_required')));
  for (const c of view.claims.filter(c => c.target.claim === 'assembly_components')) {
    assert.ok(c.dependency_item_ids.some(id => view.inventory.items.find(i => i.item_id === id)!.kind === 'assembly_quantity'));
  }
  assert.equal(view.inventory.capabilities[0].narrative_discovery_complete, false);
  assert.equal(view.approved, false); assert.equal(view.project_complete, false);
});
