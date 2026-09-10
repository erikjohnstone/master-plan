import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { buildBasSourceContext } from '../src/lib/basSources.ts';
import { basPointListsSchema } from '../src/lib/basPointLists.ts';
import { captureBasEquipmentTables, buildBasEquipmentCandidates } from '../src/lib/basEquipmentEvidence.ts';
import { emptyBasEquipmentRegister, validateBasEquipmentRegister, type BasEquipmentRegister } from '../src/lib/basEquipmentRegister.ts';
import { applyBasEquipmentReview, basEquipmentHead, basEquipmentView } from '../src/lib/basEquipmentReview.ts';
import { captureBasEvidence, mergeBasWorkflows, verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
import { createLocalStore } from '../src/lib/store.js';
import { mergeTakeoffImport, parseTakeoffImport } from '../src/lib/importTakeoff.js';
import { compareBasSequenceMatrix, interpretBasSequences } from '../src/lib/basSequenceReconciliation.ts';
import { basEquipmentSummary } from '../src/lib/basEquipmentReview.ts';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sourceId = `sha256:${'a'.repeat(64)}`, pageId = `${sourceId}:p1`;
const box = [10, 10, 20, 20] as [number, number, number, number];
const sources = buildBasSourceContext([{ sha256: 'a'.repeat(64), name: 'x.pdf', byte_length: 100, page_count: 1,
  pages: [{ page_number: 1, sheet_key: 'x.pdf', width_px: 1000, height_px: 1000, rotation: 0,
    spans: [{ str: 'AHU-1 THRU AHU-2', x0: 10, y0: 10, x1: 150, y1: 20 },
      { str: 'SEQUENCE OF OPERATION', x0: 10, y0: 150, x1: 400, y1: 170 },
      { str: '1. THE CONTROLLER SHALL MONITOR SUPPLY AIR TEMPERATURE AND MODULATE HOT WATER FLOW TO MAINTAIN SET POINT.', x0: 10, y0: 190, x1: 850, y1: 200 },
    ] }] }]);
const rawRow = { key: 'SUPPLY AIR TEMP', cells: { 'POINT NAME': { text: 'SUPPLY AIR TEMP', bbox: box }, AI: { text: '1', bbox: box } } };
const points = basPointListsSchema.parse({ schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1',
  scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [{ matrix_id: 'matrix-1',
    source_id: sourceId, page_id: pageId, raw: { sheet: 'x.pdf', title: { text: 'BAS POINTS', bbox: box },
      headers: ['POINT NAME', 'AI'], region: box, rows: [rawRow] }, header_rows: 0, header_sources: [], notes: [], issues: [],
    quantity_basis: 'listed_matrix_only', rows: [{ row_id: 'point-1', local_key: rawRow.key, name: rawRow.key, raw: rawRow,
      status: 'interpreted', observations: [{ kind: 'declared_io', channel: 'AI', value: 1, status: 'read',
        source: { source_id: sourceId, page_id: pageId, sheet_key: 'x.pdf', column: 'AI', span_id: null, text: '1', bbox_px: box } }],
      qualifiers: [], issues: [], uninterpreted_columns: [], unobserved_columns: [], field_wiring_status: 'not_established' }] }] });
const equipment = captureBasEquipmentTables([{ kind: 'equipment', sheet: 'x.pdf', title: { sheet: 'x.pdf', text: 'AHU SCHEDULE', bbox: box },
  headers: ['TAG'], region: box, rows: [{ key: 'AHUS', sheet: 'x.pdf', cells: { TAG: { text: 'AHU-1 THRU AHU-2', bbox: box } } }] }]);
const candidates = await buildBasEquipmentCandidates(sources, equipment);
const occurrence = candidates.tables[0].rows[0].occurrence_id;
const initial = await captureBasEvidence(sources, points, equipment);
function register(): BasEquipmentRegister {
  return { schema_version: 'bas_equipment_register_v1', scopes: [{ scope_id: uuid(1), building: 'A', level: '1', system: 'AHUs',
    phase: 'new', source_span_ids: [], reason: 'Explicit controlled test scope; not extracted labels' }],
    equipment: [1, 2].map(n => ({ equipment_id: uuid(10 + n), scope_id: uuid(1), tag: `AHU-${n}`,
      bindings: [{ occurrence_id: occurrence, member: `AHU-${n}` }], reason: 'Select the exact printed scheduled member' })),
    assignments: [{ assignment_id: uuid(20), matrix_id: 'matrix-1', applicability: 'per_equipment',
      equipment_ids: [uuid(11), uuid(12)], excluded_equipment_ids: [], sequence_region_ids: [], source_span_ids: [`${pageId}:s0`],
      reason: 'Controlled per-equipment assignment, not an automatically interpreted PDF instruction' }] };
}
const validate = (value: unknown) => validateBasEquipmentRegister(sources, equipment, points, value);
const request = () => ({ operation_id: uuid(100), capture_id: initial.current_capture_id!, expected_head: null,
  reason: 'Record controlled test assignment', register: register() });

test('equipment capture extends persistence without rewriting older source captures or points', async () => {
  const legacy = await captureBasEvidence(sources, points);
  assert.equal(initial.revision, 'bas_equipment_3');
  assert.equal(legacy.revision, 'bas_evidence_2');
  assert.notEqual(initial.current_capture_id, legacy.current_capture_id);
  assert.deepEqual(initial.captures[0].points, legacy.captures[0].points);
  const merged = mergeBasWorkflows(legacy, initial, true)!;
  assert.equal(merged.captures.length, 2);
  assert.deepEqual(merged.captures[0], legacy.captures[0]);
  assert.deepEqual(await verifyBasWorkflow(merged), merged);
  const changed = structuredClone(initial);
  changed.captures[0].equipment_sources!.tables[0].rows[0].cells.TAG.text = 'AHU-3';
  await assert.rejects(verifyBasWorkflow(changed), /fingerprint/);
});

test('source-backed per-unit/system-once applicability retains exclusions and does not multiply in JS', async () => {
  const state = register();
  let view = await validate(state);
  assert.deepEqual(view.assignments[0].included_equipment_ids, [uuid(11), uuid(12)]);
  assert.equal(view.assignments[0].quantity_basis, 'scheduled_named_members');
  assert.equal(view.assignments[0].installed_quantity, null);
  assert.equal('physical_total' in view, false);
  state.assignments[0].applicability = 'system_once';
  state.assignments[0].excluded_equipment_ids = [uuid(12)];
  view = await validate(state);
  assert.deepEqual(view.assignments[0].included_equipment_ids, [uuid(11)]);
  assert.deepEqual(state.equipment.map(e => e.tag), ['AHU-1', 'AHU-2'], 'An exception cannot remove source equipment');
  state.assignments[0].excluded_equipment_ids.push(uuid(11));
  view = await validate(state);
  assert.deepEqual(view.assignments[0].included_equipment_ids, []);
  assert.ok(view.issues.some(i => i.code === 'all_members_explicitly_excluded'));
});

test('three-way equipment/SOO/points link reuses the exact existing comparator and retains source and scope', async () => {
  const state = register(), region = interpretBasSequences(sources).regions.find(r => r.raw.status === 'body_detected')!;
  assert.ok(region);
  state.assignments[0].sequence_region_ids = [region.region_id];
  const view = await validate(state);
  const actual = view.assignments[0].sequence_comparisons[0];
  assert.deepEqual(actual, { region_id: region.region_id, ...compareBasSequenceMatrix(region, points.matrices[0]) });
  assert.equal(actual.requirements.length, 1);
  assert.equal(actual.requirements[0].status, 'listed');
  assert.deepEqual(actual.requirements[0].listed_rows.map(r => r.row_id), ['point-1']);
  assert.deepEqual(view.assignments[0].included_equipment_ids, [uuid(11), uuid(12)]);
  const reviewed = await applyBasEquipmentReview(initial, { ...request(), register: state }, 'operator_input');
  const summary = await basEquipmentSummary(reviewed, initial.current_capture_id!);
  assert.equal(summary.sequence_comparisons.length, 1);
  assert.deepEqual(summary.sequence_comparisons[0].included_equipment_ids, [uuid(11), uuid(12)]);
  assert.deepEqual(summary.sequence_comparisons[0].requirements[0].source_span_ids, actual.requirements[0].source_spans.map(s => s.span_id));
  assert.equal(summary.sequence_comparisons[0].requirements[0].installed_quantity, null);
  assert.deepEqual(await basEquipmentSummary(await verifyBasWorkflow(reviewed), initial.current_capture_id!), summary);
});

test('foreign members, missing scopes, duplicate bindings and evidence cannot become assignments', async () => {
  const cases = [
    (r: BasEquipmentRegister) => { r.equipment[0].bindings[0].member = 'AHU-999'; },
    (r: BasEquipmentRegister) => { r.equipment[0].bindings[0].occurrence_id = 'foreign'; },
    (r: BasEquipmentRegister) => { r.scopes = []; },
    (r: BasEquipmentRegister) => { r.equipment[1].tag = 'AHU-1'; r.equipment[1].bindings = r.equipment[0].bindings; },
    (r: BasEquipmentRegister) => { r.assignments[0].matrix_id = 'foreign'; },
    (r: BasEquipmentRegister) => { r.assignments[0].excluded_equipment_ids = [uuid(999)]; },
    (r: BasEquipmentRegister) => { r.assignments[0].source_span_ids = [`${pageId}:s999`]; },
    (r: BasEquipmentRegister) => { r.assignments[0].sequence_region_ids = ['foreign']; },
    (r: BasEquipmentRegister) => { r.assignments[0].equipment_ids.push(uuid(11)); },
  ];
  for (const change of cases) { const state = register(); change(state); await assert.rejects(validate(state)); }
  const unknown = register(); unknown.scopes[0].building = null;
  assert.ok((await validate(unknown)).issues.some(i => i.code === 'scope_partly_unknown'));
});

test('same-matrix double application and system/per-unit mixing cannot inflate demand', async () => {
  const state = register();
  state.assignments.push({ ...structuredClone(state.assignments[0]), assignment_id: uuid(21) });
  await assert.rejects(validate(state), /more than once/);
  state.assignments[0].equipment_ids = [uuid(11)]; state.assignments[1].equipment_ids = [uuid(12)];
  assert.equal((await validate(state)).assignments.length, 2, 'Disjoint per-unit assignments are valid');
  state.assignments[0].applicability = 'system_once';
  await assert.rejects(validate(state), /system matrix/);
  state.scopes.push({ ...state.scopes[0], scope_id: uuid(2), building: 'B' });
  state.equipment[1].scope_id = uuid(2);
  assert.equal((await validate(state)).assignments.length, 2, 'Explicitly different scopes stay separate');
  state.assignments = [register().assignments[0]];
  await assert.rejects(validate(state), /one explicitly established scope/);
});

test('equipment decisions replay exactly, reject stale/corrupt operations, and retain withdrawn history', async () => {
  const r = request();
  const reviewed = await applyBasEquipmentReview(initial, r, 'operator_input', '2026-09-09T18:00:00.000Z');
  assert.deepEqual(reviewed.captures, initial.captures);
  assert.deepEqual(await verifyBasWorkflow(reviewed), reviewed);
  assert.deepEqual(await applyBasEquipmentReview(reviewed, r, 'operator_input'), reviewed);
  await assert.rejects(applyBasEquipmentReview(reviewed, { ...r, operation_id: uuid(101) }, 'operator_input'), /changed since/);
  await assert.rejects(applyBasEquipmentReview(reviewed, { ...r, reason: 'Changed meaning' }, 'operator_input'), /reused/);
  await assert.rejects(applyBasEquipmentReview(reviewed, r, 'agent_proposal'), /reused/);
  const corrupt = structuredClone(reviewed); corrupt.equipment_events![0].register.equipment[0].tag = 'AHU-999';
  await assert.rejects(verifyBasWorkflow(corrupt), /fingerprint/);
  const removed = await applyBasEquipmentReview(reviewed, { ...r, operation_id: uuid(102),
    expected_head: basEquipmentHead(reviewed, r.capture_id), register: emptyBasEquipmentRegister(), reason: 'Withdraw the controlled register' }, 'operator_input');
  assert.equal(removed.equipment_events?.length, 2);
  assert.equal((await basEquipmentView(removed, r.capture_id)).register.equipment.length, 0);
  assert.deepEqual(removed.equipment_events![0], reviewed.equipment_events![0]);
  assert.deepEqual(removed.captures, initial.captures);
  const fork = await applyBasEquipmentReview(initial, { ...r, operation_id: uuid(103) }, 'operator_input');
  assert.throws(() => mergeBasWorkflows(reviewed, fork), /Divergent/);
});

test('actual local persistence/import/export retain equipment identities, evidence and decision history', async () => {
  const reviewed = await applyBasEquipmentReview(initial, request(), 'agent_proposal');
  const store = createLocalStore('bas-equipment-review-test');
  await store.saveAnnotations({ project_name: 'Equipment fixture', shapes: [], bas_workflow: reviewed });
  const saved = await store.loadAnnotations();
  assert.deepEqual(await verifyBasWorkflow(saved.bas_workflow), reviewed);
  const imported = parseTakeoffImport(JSON.stringify(saved));
  const merged = mergeTakeoffImport({ project_name: 'Preserve current project', shapes: [] }, imported);
  assert.deepEqual(await verifyBasWorkflow(merged.payload.bas_workflow), reviewed);
  assert.deepEqual(mergeTakeoffImport(merged.payload, imported).payload.bas_workflow, reviewed);
  assert.equal(reviewed.equipment_events![0].origin, 'agent_proposal', 'A proposal is not promoted to operator approval');
});
