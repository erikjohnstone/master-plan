/** Controlled source/assignment fixtures; no claim of independent PDF truth. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { runBasPointLists, runBasAssignmentDemand } from '../src/basMath.ts';
import { calculateBasAssignments } from '../src/basAssignmentDemand.ts';
import { buildBasSourceContext } from '../../web/src/lib/basSources.ts';
import { captureBasEquipmentTables, buildBasEquipmentCandidates } from '../../web/src/lib/basEquipmentEvidence.ts';
import { captureBasEvidence, verifyBasWorkflow, mergeBasWorkflows, basWorkflowSchema } from '../../web/src/lib/basWorkflow.ts';
import { applyBasEquipmentReview, basEquipmentHead, basAssignmentCalculationState } from '../../web/src/lib/basEquipmentReview.ts';
import { basAssignmentInputFingerprint, buildBasAssignmentDemandInput, verifyBasAssignmentDemandResult, basAssignmentCalculationSchema, assertBasAssignmentUpdate } from '../../web/src/lib/basAssignmentDemandContract.ts';
import { emptyBasEquipmentRegister } from '../../web/src/lib/basEquipmentRegister.ts';
import { compileProductionTakeoff } from '../src/productionTakeoff.ts';
import type { SheetGraph } from '../../web/src/lib/sheetgraph.ts';
import { basAssignmentMiddleware } from '../../web/vite.basAssignmentApi.js';
import { resolveTsxLoader } from '../../web/vite.corpusTakeoffApi.js';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function fixture() {
  const sources = buildBasSourceContext([{ sha256: 'a'.repeat(64), byte_length: 100, name: 'fixture.pdf', page_count: 1,
    pages: [{ page_number: 1, sheet_key: 'fixture.pdf', width_px: 1000, height_px: 1000, rotation: 0,
      spans: [{ str: 'AHU-1 THRU AHU-3', x0: 10, y0: 10, x1: 200, y1: 20 }] }] }]);
  const box = [10, 30, 100, 40];
  const tables = [{ sheet: 'fixture.pdf', title: { text: 'BAS POINTS LIST', bbox: box }, region: [0, 0, 500, 200],
    headers: ['POINT NAME', 'AI', 'AV', 'ALARM'], rows: [{ key: '1', cells: {
      'POINT NAME': { text: 'Supply temperature', bbox: box }, AI: { text: '2', bbox: box },
      AV: { text: '3', bbox: box }, ALARM: { text: 'X', bbox: box },
    } }] }, { kind: 'equipment', sheet: 'fixture.pdf', title: { sheet: 'fixture.pdf', text: 'AHU SCHEDULE', bbox: box },
    headers: ['TAG'], region: [0, 200, 500, 400], rows: [{ key: 'AHUS', sheet: 'fixture.pdf', cells: { TAG: { text: 'AHU-1 THRU AHU-3', bbox: box } } }] }];
  const points = await runBasPointLists({ sources, tables });
  const equipment = captureBasEquipmentTables(tables);
  const candidates = await buildBasEquipmentCandidates(sources, equipment);
  const initial = await captureBasEvidence(sources, points, equipment);
  const register = emptyBasEquipmentRegister();
  register.scopes = [{ scope_id: uuid(1), building: 'A', level: '1', system: 'AHUs', phase: 'new', source_span_ids: [], reason: 'Controlled scope' }];
  register.equipment = [1, 2, 3].map(n => ({ equipment_id: uuid(10 + n), scope_id: uuid(1), tag: `AHU-${n}`,
    bindings: [{ occurrence_id: candidates.tables[0].rows[0].occurrence_id, member: `AHU-${n}` }], reason: 'Controlled source-backed member' }));
  register.assignments = [{ assignment_id: uuid(20), matrix_id: points.matrices[0].matrix_id, applicability: 'per_equipment',
    equipment_ids: register.equipment.map(e => e.equipment_id), excluded_equipment_ids: [], source_span_ids: [], sequence_region_ids: [], reason: 'Controlled per-unit applicability' }];
  const workflow = await applyBasEquipmentReview(initial, { operation_id: uuid(30), capture_id: initial.current_capture_id, expected_head: null,
    reason: 'Controlled assignment decision', register }, 'operator_input', '2026-09-09T18:00:00.000Z');
  const request = { capture_id: workflow.current_capture_id!, expected_equipment_head: basEquipmentHead(workflow, workflow.current_capture_id!)! };
  const graph = { available: true, tables, sheets: [], notes: [], rooms: [], unmatched_tags: [], callouts: [], buildings: [] } as unknown as SheetGraph;
  return { workflow, request, sources, graph };
}

test('shared Python calculation preserves evidence, history, replay and exclusion staleness', async () => {
  const { workflow, request } = await fixture(), before = structuredClone(workflow);
  const computed = await calculateBasAssignments(workflow, request, { createdAt: '2026-09-09T18:01:00.000Z' });
  assert.deepEqual(workflow, before);
  assert.deepEqual(computed.workflow.captures, workflow.captures);
  assert.deepEqual(computed.workflow.equipment_events, workflow.equipment_events);
  assert.equal(computed.workflow.revision, 'bas_assignment_4');
  const assignment = computed.calculation.result.assignments[0];
  assert.equal(assignment.replication_factor, 3);
  assert.equal(assignment.known_listed_io_subtotal.AI, 6);
  assert.deepEqual(assignment.known_listed_software_subtotals, [{ channel: 'AV', known_listed_value: 9 }]);
  assert.equal(assignment.rows[0].observations.find(o => o.original.kind === 'attribute')?.assigned_value, null);
  assert.equal(basAssignmentCalculationState(computed.workflow, request.capture_id).status, 'current_dependencies');
  assert.deepEqual(await verifyBasWorkflow(JSON.parse(JSON.stringify(computed.workflow))), computed.workflow);
  assert.deepEqual((await calculateBasAssignments(computed.workflow, request, { python: '/not-a-runtime' })).workflow, computed.workflow, 'Exact dependency retry uses the verified retained result');
  const register = structuredClone(workflow.equipment_events![0].register);
  register.assignments[0].excluded_equipment_ids = [register.equipment[1].equipment_id];
  const edited = await applyBasEquipmentReview(computed.workflow, { operation_id: uuid(31), capture_id: request.capture_id,
    expected_head: request.expected_equipment_head, reason: 'Controlled exception', register }, 'operator_input');
  assert.equal(edited.revision, 'bas_assignment_4');
  assert.equal(basAssignmentCalculationState(edited, request.capture_id).status, 'stale_dependencies');
  await assert.rejects(calculateBasAssignments(edited, request), /changed/);
  const next = await calculateBasAssignments(edited, { ...request, expected_equipment_head: basEquipmentHead(edited, request.capture_id) });
  assert.equal(next.calculation.result.assignments[0].known_listed_io_subtotal.AI, 4);
  assert.deepEqual(next.workflow.assignment_calculations![0], computed.calculation);
  assert.equal(next.workflow.assignment_calculations!.length, 2);
  assert.equal(basAssignmentCalculationState({ ...next.workflow, assignment_calculations: [...next.workflow.assignment_calculations!].reverse() }, request.capture_id).status, 'current_dependencies');
  assert.deepEqual(await verifyBasWorkflow(mergeBasWorkflows(computed.workflow, next.workflow)), next.workflow);
});

test('corrupt values, changed sources, foreign dependencies and missing observations reject', async () => {
  const { workflow, request } = await fixture();
  const computed = await calculateBasAssignments(workflow, request);
  const changed = structuredClone(computed.workflow);
  changed.assignment_calculations![0].result.assignments[0].known_listed_io_subtotal.AI = 600;
  await assert.rejects(verifyBasWorkflow(changed), /fingerprint/);
  const input = await buildBasAssignmentDemandInput(workflow.captures[0], workflow.equipment_events![0].register, request.expected_equipment_head);
  const corrupt = structuredClone(computed.calculation.result);
  corrupt.assignments[0].rows[0].observations[0].original.source.text = 'fabricated';
  assert.throws(() => verifyBasAssignmentDemandResult(input, corrupt), /source/);
  const omitted = structuredClone(computed.calculation.result);
  omitted.assignments[0].rows[0].observations.pop();
  assert.throws(() => verifyBasAssignmentDemandResult(input, omitted), /evidence/);
  await assert.rejects(calculateBasAssignments(workflow, { ...request, capture_id: 'b'.repeat(64) }), /changed/);
  await assert.rejects(calculateBasAssignments(workflow, request, { python: '/not-a-runtime' }), /unavailable/);
  const control = new AbortController(); control.abort();
  await assert.rejects(calculateBasAssignments(workflow, request, { signal: control.signal }), /abort/i);
  assert.equal(workflow.assignment_calculations, undefined);
});

test('calculation acceptance rejects dropped history, changed evidence and mismatched response records', async () => {
  const { workflow, request } = await fixture();
  const first = await calculateBasAssignments(workflow, request);
  const register = structuredClone(workflow.equipment_events![0].register);
  register.assignments[0].excluded_equipment_ids = [register.equipment[0].equipment_id];
  const edited = await applyBasEquipmentReview(first.workflow, { operation_id: uuid(32), capture_id: request.capture_id,
    expected_head: request.expected_equipment_head, reason: 'Second controlled calculation', register }, 'operator_input');
  const nextRequest = { ...request, expected_equipment_head: basEquipmentHead(edited, request.capture_id)! };
  const second = await calculateBasAssignments(edited, nextRequest);
  assert.doesNotThrow(() => assertBasAssignmentUpdate(edited, second.workflow, second.calculation, nextRequest));
  assert.doesNotThrow(() => assertBasAssignmentUpdate(second.workflow, second.workflow, second.calculation, nextRequest));
  // Individually valid data is insufficient: accepting it would lose history.
  const missingEarlier = await verifyBasWorkflow({ ...second.workflow, assignment_calculations: [second.calculation] });
  assert.throws(() => assertBasAssignmentUpdate(edited, missingEarlier, second.calculation, nextRequest), /omitted/);
  assert.throws(() => assertBasAssignmentUpdate(edited, { ...second.workflow, current_capture_id: null }, second.calculation, nextRequest), /omitted/);
  const changed = structuredClone(second.workflow);
  changed.captures[0].sources[0].names = ['unexpected rewritten source'];
  assert.throws(() => assertBasAssignmentUpdate(edited, changed, second.calculation, nextRequest), /evidence/);
  const mismatch = structuredClone(second.calculation);
  mismatch.result.assignments[0].known_listed_io_subtotal.AI += 1;
  assert.throws(() => assertBasAssignmentUpdate(edited, second.workflow, mismatch, nextRequest), /earlier results/);
  assert.throws(() => assertBasAssignmentUpdate(second.workflow, second.workflow, mismatch, nextRequest), /retained result/);
  assert.throws(() => assertBasAssignmentUpdate(edited, second.workflow, second.calculation, request), /different evidence/);
});

test('filename aliases do not change input identity; authored sheet columns do', async () => {
  const { workflow, request } = await fixture();
  const input = await buildBasAssignmentDemandInput(workflow.captures[0], workflow.equipment_events![0].register, request.expected_equipment_head);
  const renamed = structuredClone(input);
  for (const matrix of renamed.points.matrices) {
    matrix.raw.sheet = 'renamed.pdf';
    for (const row of matrix.rows) for (const obs of row.observations) obs.source.sheet_key = 'renamed.pdf';
  }
  assert.equal(await basAssignmentInputFingerprint(renamed), await basAssignmentInputFingerprint(input));
  // The column is authored content, not the table's navigation alias.
  renamed.points.matrices[0].raw.rows[0].cells.sheet = { text: 'changed source column', bbox: null };
  assert.notEqual(await basAssignmentInputFingerprint(renamed), await basAssignmentInputFingerprint(input));
});

test('new transport rejects unsafe products and cancellation without a fake total', async () => {
  const { workflow, request } = await fixture();
  const input = await buildBasAssignmentDemandInput(workflow.captures[0], workflow.equipment_events![0].register, request.expected_equipment_head);
  const matrix = input.points.matrices[0], row = matrix.rows[0];
  const obs = row.observations.find(o => o.channel === 'AI')!;
  obs.value = Number.MAX_SAFE_INTEGER; obs.source.text = String(obs.value);
  row.raw.cells.AI.text = matrix.raw.rows[0].cells.AI.text = String(obs.value);
  await assert.rejects(runBasAssignmentDemand(input), /exact numeric range/);
  const abort = new AbortController();
  const pending = runBasAssignmentDemand(input, { signal: abort.signal });
  abort.abort(); await assert.rejects(pending, /cancelled/);
});

test('production compile persists derived result and leaves legacy math/graph exact', async () => {
  const { workflow, request, sources, graph } = await fixture();
  const session = { basWorkflow: workflow, basSourcesForPipeline: () => sources,
    retainBasWorkflow(w: typeof workflow) { this.basWorkflow = w; return true; } };
  const baseline = await compileProductionTakeoff(session, graph, 'bas_points');
  const before = structuredClone(graph);
  const result = await compileProductionTakeoff(session, graph, 'bas_points', { bas_assignment_demand: request });
  assert.ok('bas_assignment_demand' in result && result.bas_assignment_demand);
  assert.ok('bas_math' in baseline);
  assert.deepEqual(result.bas_math, baseline.bas_math);
  assert.deepEqual(graph, before);
  assert.ok('bas_point_lists' in result && 'bas_point_lists' in baseline && 'bas_workflow' in result);
  assert.deepEqual(result.bas_point_lists, baseline.bas_point_lists);
  assert.deepEqual(result.bas_workflow, session.basWorkflow);
  const stable = structuredClone(session.basWorkflow);
  await assert.rejects(compileProductionTakeoff(session, graph, 'bas_points', { bas_assignment_demand: { ...request, expected_equipment_head: 'b'.repeat(64) } }), /changed/);
  assert.deepEqual(session.basWorkflow, stable);
  await assert.rejects(compileProductionTakeoff(session, graph, 'hvac_equipment', { bas_assignment_demand: request }), /only available/);
});

test('actual HTTP bridge uses shared service and refuses foreign-origin and malformed bodies', async () => {
  const { workflow, request } = await fixture();
  const middleware = basAssignmentMiddleware(resolveTsxLoader);
  const server = createServer((req, res) => { void middleware(req, res, () => { res.writeHead(404); res.end(); }); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/__ot/bas-assignment-demand`;
  try {
    const reply = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflow, request }) });
    assert.equal(reply.status, 200);
    const result = z.object({ workflow: basWorkflowSchema, calculation: basAssignmentCalculationSchema }).strict().parse(await reply.json());
    assert.equal(result.calculation.result.assignments[0].known_listed_io_subtotal.AI, 6);
    assert.deepEqual(await verifyBasWorkflow(result.workflow), result.workflow);
    const direct = await calculateBasAssignments(workflow, request);
    assert.deepEqual(result.calculation.result, direct.calculation.result);
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.invalid' }, body: '{}' })).status, 403);
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
    assert.equal((await fetch(url)).status, 405);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('concurrent Session decision cannot be overwritten by an older calculation', async () => {
  const { workflow, request, sources, graph } = await fixture();
  const register = structuredClone(workflow.equipment_events![0].register);
  register.assignments[0].excluded_equipment_ids = [register.equipment[0].equipment_id];
  const newer = await applyBasEquipmentReview(workflow, { operation_id: uuid(99), capture_id: request.capture_id,
    expected_head: request.expected_equipment_head, reason: 'Concurrent controlled exception', register }, 'operator_input');
  let current = workflow, reads = 0;
  const session = { basSourcesForPipeline: () => sources,
    get basWorkflow() { const value = current; if (++reads === 1) queueMicrotask(() => { current = newer; }); return value; },
    retainBasWorkflow(value: typeof workflow) { current = value; return true; } };
  await assert.rejects(compileProductionTakeoff(session, graph, 'bas_points', { bas_assignment_demand: request }), /workspace changed/);
  assert.deepEqual(current, newer);
  assert.equal(current.assignment_calculations, undefined);
});
