import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { revisionFixture, revisionBasis, addRevisionSourceSet } from './helpers/basRevisionFixture.ts';
import { uuid, engineeringFixture } from './helpers/basEngineeringFixture.ts';
import { buildBasRevisionInventory, basRevisionInventorySchema, assertBasRevisionInventorySize,
  BAS_REVISION_ITEM_LIMIT, BAS_REVISION_INVENTORY_BYTES } from '../src/lib/basRevisionInventory.ts';
import { prepareBasRevisionBasis, readBasRevisionState, basRevisionBasisSchema } from '../src/lib/basRevisionBasis.ts';
import { applyBasEquipmentReview } from '../src/lib/basEquipmentReview.ts';
import { applyBasAssemblyReview } from '../src/lib/basAssemblyReview.ts';
import { captureBasEvidence, captureBasPoints, basCaptureIdentityPayload, mergeBasWorkflows, verifyBasWorkflow, type BasWorkflow } from '../src/lib/basWorkflow.ts';
import { canonicalBasJson } from '../src/lib/basCanonical.ts';

test('predeclared item and byte budgets fail explicitly at the next entry, not through truncation', () => {
  assert.doesNotThrow(() => assertBasRevisionInventorySize(BAS_REVISION_ITEM_LIMIT, BAS_REVISION_INVENTORY_BYTES));
  assert.throws(() => assertBasRevisionInventorySize(BAS_REVISION_ITEM_LIMIT + 1, 0), /100,000-item/);
  assert.throws(() => assertBasRevisionInventorySize(0, BAS_REVISION_INVENTORY_BYTES + 1), /64 MiB/);
  for (const n of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => assertBasRevisionInventorySize(n, 0), /Invalid/);
    assert.throws(() => assertBasRevisionInventorySize(0, n), /Invalid/);
  }
});

test('inventory retains raw data, source-grounded domains, quantity dimensions and component-local claims', async () => {
  const f = await revisionFixture(), before = structuredClone(f.workflow), inventory = await buildBasRevisionInventory(f.workflow, f.basis);
  assert.deepEqual(f.workflow, before); assert.deepEqual(basRevisionInventorySchema.parse(inventory), inventory);
  for (const k of ['drawing_page', 'point_matrix', 'point_row', 'sequence_region', 'sequence_clause', 'sequence_requirement', 'sequence_link',
    'equipment_table', 'equipment_row', 'scope', 'equipment', 'assignment', 'component_requirement', 'assembly_component', 'responsibility_claim', 'responsibility_resolution']) {
    assert.ok(inventory.items.some(i => i.kind === k), `Missing domain ${k}`);
  }
  const row = inventory.items.find(i => i.kind === 'point_row')!;
  assert.deepEqual(JSON.parse(row.original_json), f.workflow.captures[0].points.matrices[0].rows[0]);
  assert.deepEqual(row.quantities.map(q => [q.dimension, q.value, q.status]), [
    ['declared_io:AI', 2, 'retained_value'], ['declared_io:DI', null, 'unknown'],
    ['attribute:ALARM', 1, 'not_a_quantity'], ['software_value:AV', 1, 'retained_value'],
  ]);
  assert.ok(row.source_refs.every(s => s.page_id === f.source.pages[0].page_id));
  assert.deepEqual(row.source_refs[0].bbox_px, [10, 450, 250, 470]);
  assert.equal(row.quantities.some(q => q.dimension === 'declared_io:DO'), false, 'Missing column is not zero');
  const table = inventory.items.find(i => i.kind === 'equipment_table')!;
  assert.deepEqual(JSON.parse(table.original_json).retained_extra_metadata, { values: ['keep', 1] });
  assert.equal(JSON.parse(inventory.items.find(i => i.kind === 'equipment_row')!.original_json).raw.row_metadata, 'Keep the original, too');
  assert.deepEqual(inventory.unresolved_references, []);
  assert.ok(inventory.items.some(i => i.kind === 'responsibility_claim' && i.origin === 'source_rule'));
  assert.ok(inventory.items.some(i => i.kind === 'responsibility_claim' && i.origin === 'operator_input'));
  assert.equal(inventory.approved, false); assert.equal(inventory.source_bytes, 'not_verified');
  assert.deepEqual(await buildBasRevisionInventory(f.workflow, f.basis), inventory);
});

test('pinned basis stays historical; old assembly links never rebind to new equipment occurrences', async () => {
  const f = await revisionFixture(), old = await buildBasRevisionInventory(f.workflow, f.basis), changed = structuredClone(f.equipment);
  changed.equipment[0].bindings[0].occurrence_id = f.candidates.tables[1].rows[0].occurrence_id;
  const w = await applyBasEquipmentReview(f.workflow, { operation_id: uuid(201), capture_id: f.workflow.current_capture_id,
    expected_head: f.basis.captures[0].equipment_head, register: changed, reason: 'Controlled rebind to another source occurrence' }, 'operator_input');
  const pinned = await buildBasRevisionInventory(w, f.basis);
  assert.deepEqual(pinned.items, old.items); assert.equal(pinned.capabilities[0].selection_status, 'historical_selection');
  const current = await buildBasRevisionInventory(w, revisionBasis(w));
  const component = current.items.find(i => i.kind === 'assembly_component')!;
  assert.deepEqual(component.source_refs, old.items.find(i => i.item_id === component.item_id)!.source_refs);
  assert.equal(component.dependency_status, 'pinned_dependencies_differ');
  assert.ok(current.items.find(i => i.kind === 'equipment' && i.subject_id === uuid(11))!.source_refs.every(s => s.page_id === f.source.pages[1].page_id));
  assert.ok(current.unresolved_references.some(r => r.item_id === component.item_id && r.reason === 'different_selected_event'));
  assert.equal(current.capabilities[0].selection_status, 'current_selection', 'Current selection is not approval/freshness');
});

test('unrelated register edits preserve unaffected item content identities while event ownership changes', async () => {
  const f = await revisionFixture(), old = await buildBasRevisionInventory(f.workflow, f.basis), changed = structuredClone(f.equipment);
  changed.equipment[1].reason = 'Reconsider only the other equipment record';
  const w = await applyBasEquipmentReview(f.workflow, { operation_id: uuid(201), capture_id: f.workflow.current_capture_id,
    expected_head: f.basis.captures[0].equipment_head, register: changed, reason: 'One-item correction' }, 'operator_input');
  const newer = await buildBasRevisionInventory(w, revisionBasis(w));
  const a = old.items.find(i => i.kind === 'equipment' && i.subject_id === uuid(11))!, b = newer.items.find(i => i.item_id === a.item_id)!;
  assert.equal(a.content_fingerprint, b.content_fingerprint); assert.notEqual(a.source_event_id, b.source_event_id);
  const altered = old.items.find(i => i.kind === 'equipment' && i.subject_id === uuid(12))!;
  assert.notEqual(altered.content_fingerprint, newer.items.find(i => i.item_id === altered.item_id)!.content_fingerprint);
});

test('source selection discloses outside, crossing and unlocated records without silently filtering dependencies', async () => {
  const f = await revisionFixture(), changed = structuredClone(f.equipment);
  changed.equipment[0].bindings.push({ occurrence_id: f.candidates.tables[1].rows[0].occurrence_id, member: 'AHU-1' });
  let w = await applyBasEquipmentReview(f.workflow, { operation_id: uuid(201), capture_id: f.workflow.current_capture_id,
    expected_head: f.basis.captures[0].equipment_head, register: changed, reason: 'Controlled linked repeated occurrence' }, 'operator_input');
  w = await addRevisionSourceSet(w, [0], 202);
  const v = await buildBasRevisionInventory(w, revisionBasis(w));
  assert.equal(v.items.find(i => i.kind === 'equipment' && i.subject_id === uuid(11))!.source_scope, 'crosses_boundary');
  assert.equal(v.items.find(i => i.kind === 'scope')!.source_scope, 'unlocated');
  assert.equal(v.items.find(i => i.kind === 'drawing_page' && i.subject_id === f.source.pages[1].page_id)!.source_scope, 'outside');
  assert.ok(v.items.some(i => i.kind === 'equipment_table' && i.source_scope === 'outside'));
});

test('basis rejects foreign, duplicate and omitted capture/head selectors; null does not mean complete', async () => {
  const f = await revisionFixture(), w = f.workflow;
  assert.deepEqual(await prepareBasRevisionBasis(w, f.basis.source_set_id), f.basis);
  const bad = structuredClone(f.basis); bad.captures[0].equipment_head = 'f'.repeat(64);
  await assert.rejects(readBasRevisionState(w, bad), /unowned/);
  const omitted = { ...f.basis, captures: [] };
  await assert.rejects(readBasRevisionState(w, omitted), /exactly/);
  assert.throws(() => basRevisionBasisSchema.parse({ ...f.basis, captures: [...f.basis.captures, ...f.basis.captures] }), /Duplicate/);
  await assert.rejects(prepareBasRevisionBasis(w, 'f'.repeat(64)), /complete source set/);
  const none = structuredClone(f.basis); none.captures[0].equipment_head = null;
  const v = await buildBasRevisionInventory(w, none);
  assert.equal(v.items.some(i => i.kind === 'equipment'), false);
  assert.ok(v.items.some(i => i.kind === 'assembly_component' && i.dependency_status === 'pinned_dependencies_differ'));
  assert.ok(v.unresolved_references.some(r => r.reason === 'not_in_selected_inventory'));
  assert.equal(v.approved, false);
});

test('inventory accepts source alias renames without changing item fingerprints or capture identities', async () => {
  const f = await revisionFixture(), w = structuredClone(f.workflow), capture = w.captures[0];
  const aliases = new Map(capture.narrative_sources!.pages.flatMap(p => p.sheet_keys.map(k => [k, `${k}-renamed`] as const)));
  capture.sources[0].names = ['new-name.pdf']; capture.narrative_sources!.documents[0].names = ['new-name.pdf'];
  capture.narrative_sources!.pages.forEach(p => { p.sheet_keys = p.sheet_keys.map(k => aliases.get(k)!); });
  capture.points.matrices.forEach(m => { m.raw.sheet = aliases.get(m.raw.sheet)!;
    m.rows.forEach(r => r.observations.forEach(o => { o.source.sheet_key = aliases.get(o.source.sheet_key)!; })); });
  capture.equipment_sources!.tables.forEach(t => { t.sheet = aliases.get(t.sheet)!;
    if (t.title) t.title.sheet = aliases.get(t.title.sheet)!;
    t.rows.forEach(r => { r.sheet = aliases.get(r.sheet)!; }); });
  await verifyBasWorkflow(w);
  assert.deepEqual(basCaptureIdentityPayload(capture), basCaptureIdentityPayload(f.workflow.captures[0]));
  const before = await buildBasRevisionInventory(f.workflow, f.basis), after = await buildBasRevisionInventory(w, f.basis);
  assert.deepEqual(after.items.map(i => [i.item_id, i.content_fingerprint]), before.items.map(i => [i.item_id, i.content_fingerprint]));
  assert.notEqual(after.items.find(i => i.kind === 'equipment_table')!.original_json, before.items.find(i => i.kind === 'equipment_table')!.original_json);
});

test('legacy missing narrative/equipment evidence is unavailable, not an empty authoritative drawing', async () => {
  const f = await engineeringFixture(), legacy = await addRevisionSourceSet(await captureBasPoints(f.capture.sources, f.capture.points));
  const v = await buildBasRevisionInventory(legacy, revisionBasis(legacy));
  assert.equal(v.capabilities[0].text, 'unavailable_legacy_capture'); assert.equal(v.capabilities[0].equipment, 'unavailable_legacy_capture');
  assert.ok(v.items.every(i => i.kind === 'drawing_page')); assert.equal(v.capabilities[0].narrative_discovery_complete, false);
});

test('same equipment tags and UUIDs from distinct captures remain separately owned', async () => {
  const f = await revisionFixture(), changed = structuredClone(f.workflow.captures[0].points); changed.issues.push('Controlled later interpretation');
  const w = await captureBasEvidence(f.source, changed, f.workflow.captures[0].equipment_sources);
  let merged = mergeBasWorkflows(f.workflow, w, true)!;
  const register = structuredClone(f.equipment); register.scopes[0].building = 'B';
  merged = await applyBasEquipmentReview(merged, { operation_id: uuid(201), expected_head: null, capture_id: w.current_capture_id,
    register, reason: 'Same labels, explicitly different building' }, 'operator_input');
  merged = await addRevisionSourceSet(merged, [0, 3], 202);
  const v = await buildBasRevisionInventory(merged, revisionBasis(merged));
  const pair = v.items.filter(i => i.kind === 'equipment' && i.subject_id === uuid(11));
  assert.equal(pair.length, 2); assert.notEqual(pair[0].item_id, pair[1].item_id);
  const bad = revisionBasis(merged); bad.captures[0].equipment_head = bad.captures[1].equipment_head;
  await assert.rejects(buildBasRevisionInventory(merged, bad), /unowned/);
});

test('source requirement reuse on disjoint equipment groups keeps distinct responsibility claims', async () => {
  const f = await revisionFixture(), register = structuredClone(f.assembly), copy = structuredClone(register.components[0]);
  copy.component_id = uuid(99); copy.equipment_ids = [uuid(12)]; register.components.push(copy);
  const w = await applyBasAssemblyReview(f.workflow, { operation_id: uuid(201), capture_id: f.workflow.current_capture_id,
    expected_head: f.basis.captures[0].assembly_head, expected_equipment_head: f.basis.captures[0].equipment_head,
    register, reason: 'One explicit source declaration, disjoint applicability groups' }, 'operator_input');
  const v = await buildBasRevisionInventory(w, revisionBasis(w));
  const claims = v.items.filter(i => i.kind === 'responsibility_claim' && i.origin === 'source_rule');
  assert.equal(claims.length, 2); assert.notEqual(claims[0].item_id, claims[1].item_id); assert.deepEqual(v.unresolved_references, []);
});

test('owned input snapshot, cancellation and corrupt source records fail without partial mutation', async () => {
  const f = await revisionFixture(), original = structuredClone(f.workflow), basis = structuredClone(f.basis);
  const pending = buildBasRevisionInventory(f.workflow, basis); basis.captures[0].equipment_head = null;
  f.workflow.equipment_events![0].reason = 'Caller mutation after invocation';
  const v = await pending; assert.deepEqual(v.basis, f.basis); assert.ok(v.items.some(i => i.kind === 'equipment'));
  await assert.rejects(buildBasRevisionInventory(f.workflow, f.basis), /fingerprint/);
  const abort = new AbortController(); abort.abort(new Error('Controlled cancellation'));
  await assert.rejects(buildBasRevisionInventory(original, f.basis, abort.signal), /Controlled cancellation/);
  assert.deepEqual(original.captures, f.workflow.captures);
});

test('retained real Fort Sam plus disclosed hardware review inventory preserves original engineering and saved quantities', async () => {
  const raw = JSON.parse(readFileSync(new URL('../../docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json', import.meta.url), 'utf8')).bas_workflow as BasWorkflow;
  const w = await addRevisionSourceSet(raw), before = canonicalBasJson(w), v = await buildBasRevisionInventory(w, revisionBasis(w));
  assert.equal(canonicalBasJson(w), before);
  assert.equal(w.captures[0].sources[0].sha256, 'c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d');
  const selected = w.engineering_events!.at(-1)!;
  assert.equal(v.items.filter(i => i.kind === 'engineering_check').length, selected.register.input.checks.length);
  for (const i of v.items.filter(i => i.kind === 'engineering_check')) {
    assert.deepEqual(JSON.parse(i.original_json).check, selected.register.input.checks.find(c => c.check_id === i.subject_id));
    assert.equal(i.origin, selected.origin);
  }
  assert.ok(v.items.some(i => i.kind === 'assembly_quantity' && i.quantities.some(q => q.status === 'saved_result_requires_python_replay')));
  assert.ok(v.items.some(i => i.kind === 'sequence_clause' && JSON.parse(i.original_json).status === 'uninterpreted'));
  assert.equal(v.calculation_verification, 'saved_results_not_python_replayed'); assert.equal(v.approved, false);
});
