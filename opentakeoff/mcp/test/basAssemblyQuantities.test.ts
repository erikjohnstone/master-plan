/** Controlled source-shaped cases at the real shared service/Python boundary.
 * These are not an actual uploaded-PDF or public-tool/UI walkthrough. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { buildBasSourceContext } from '../../web/src/lib/basSources.ts';
import { captureBasEquipmentTables, buildBasEquipmentCandidates } from '../../web/src/lib/basEquipmentEvidence.ts';
import { captureBasEvidence, verifyBasWorkflow, mergeBasWorkflows, basWorkflowSchema } from '../../web/src/lib/basWorkflow.ts';
import { emptyBasEquipmentRegister } from '../../web/src/lib/basEquipmentRegister.ts';
import { applyBasEquipmentReview, basEquipmentHead } from '../../web/src/lib/basEquipmentReview.ts';
import { interpretBasComponentRequirements } from '../../web/src/lib/basComponentRequirements.ts';
import { emptyBasAssemblyRegister, type BasAssemblyRegister } from '../../web/src/lib/basAssemblyRegister.ts';
import { applyBasAssemblyReview, basAssemblyHead, basAssemblyView, basAssemblyCalculationState } from '../../web/src/lib/basAssemblyReview.ts';
import { buildBasAssemblyQuantityInput, verifyBasAssemblyQuantityResult, assertBasAssemblyCalculationUpdate, basAssemblyCalculationSchema } from '../../web/src/lib/basAssemblyQuantityContract.ts';
import { calculateBasAssemblies } from '../src/basAssemblyQuantities.ts';
import { runBasAssemblyQuantities, runBasPointLists } from '../src/basMath.ts';
import { compileProductionTakeoff } from '../src/productionTakeoff.ts';
import { basAssemblySummarySchema } from '../../web/src/lib/basAssemblyReview.ts';
import type { SheetGraph } from '../../web/src/lib/sheetgraph.ts';
import { basAssemblyMiddleware } from '../../web/vite.basAssignmentApi.js';
import { resolveTsxLoader } from '../../web/vite.corpusTakeoffApi.js';
import { createLocalStore } from '../../web/src/lib/store.js';
import { parseTakeoffImport, mergeTakeoffImport } from '../../web/src/lib/importTakeoff.js';
// The browser package owns this test-only dependency; do not add a production
// MCP dependency or replace the real browser persistence implementation.
createRequire(new URL('../../web/package.json', import.meta.url))('fake-indexeddb/auto');

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function fixture(componentList = false) {
  const source = buildBasSourceContext([{ sha256: 'a'.repeat(64), byte_length: 1, name: 'controlled.pdf', page_count: 1,
    pages: [{ page_number: 1, sheet_key: 'controlled.pdf', width_px: 1800, height_px: 1000, rotation: 0,
      spans: [{ str: 'AHU-1 THRU AHU-3', x0: 10, y0: 10, x1: 200, y1: 20 },
        { str: 'AHU CONTROL SEQUENCE', x0: 10, y0: 150, x1: 300, y1: 170 },
        { str: componentList ? '1. EACH AHU WILL BE PROVIDED WITH A DUAL TECHNOLOGY OCCUPANCY SENSOR AND A DOWNSTREAM STATIC PRESSURE SENSOR.'
          : '1. THE AHU SHALL BE PROVIDED WITH A FACTORY FURNISHED ON-BOARD BACNET CONTROLLER.', x0: 10, y0: 190, x1: 1600, y1: 210 }] }] }]);
  const box = [10, 10, 200, 20];
  const tables = [{ kind: 'equipment', sheet: 'controlled.pdf',
    title: { sheet: 'controlled.pdf', text: 'AHU SCHEDULE', bbox: box }, headers: ['TAG'], region: [0, 0, 300, 100],
    rows: [{ key: 'AHUS', sheet: 'controlled.pdf', cells: { TAG: { text: 'AHU-1 THRU AHU-3', bbox: box } } }] }];
  const evidence = captureBasEquipmentTables(tables);
  const points = await runBasPointLists({ sources: source, tables });
  const candidates = await buildBasEquipmentCandidates(source, evidence);
  const captured = await captureBasEvidence(source, points, evidence);
  const equipment = emptyBasEquipmentRegister();
  equipment.scopes = [{ scope_id: uuid(1), building: 'A', level: '1', system: 'AHUs', phase: null, source_span_ids: [], reason: 'Controlled scope decision' }];
  equipment.equipment = [1, 2, 3].map(n => ({ equipment_id: uuid(10 + n), scope_id: uuid(1), tag: `AHU-${n}`,
    bindings: [{ occurrence_id: candidates.tables[0].rows[0].occurrence_id, member: `AHU-${n}` }], reason: 'Controlled retained member binding' }));
  const registered = await applyBasEquipmentReview(captured, { operation_id: uuid(20), capture_id: captured.current_capture_id,
    expected_head: null, reason: 'Controlled equipment register', register: equipment }, 'operator_input');
  const sourceRule = componentList ? 'explicit_component_declarations_2' : 'explicit_component_declarations_1';
  const declaration = interpretBasComponentRequirements(source, sourceRule).clauses.flatMap(c => c.components)[0];
  assert.equal(declaration.component_kind, componentList ? 'sensor' : 'onboard_controller');
  const assembly: BasAssemblyRegister = { ...emptyBasAssemblyRegister(), source_rule_version: sourceRule, components: [{ component_id: uuid(30), scope_id: uuid(1),
    equipment_ids: equipment.equipment.map(e => e.equipment_id), excluded_equipment_ids: [], member_exclusion_reason: null,
    label: componentList ? 'Dual technology occupancy sensor' : 'Controller', component_kind: declaration.component_kind, source_requirement_ids: [declaration.requirement_id], source_span_ids: [],
    quantity: { value: 1, basis: 'per_equipment', origin: 'source_declaration', reason: 'Literal one; controlled per-member applicability decision' },
    lifecycle: 'unknown', disposition: 'included', exclusion_reason: null,
    condition: { status: 'unconditional', statement: null, source_span_ids: [], reason: 'Unconditional controlled declaration' },
    responsibility_claims: [], responsibility_resolutions: [], reason: 'Controlled assembly applicability' }] };
  const workflow = await applyBasAssemblyReview(registered, { operation_id: uuid(40), capture_id: registered.current_capture_id,
    expected_head: null, expected_equipment_head: basEquipmentHead(registered, registered.current_capture_id!),
    reason: 'Controlled assembly decision', register: assembly }, 'operator_input');
  const request = { capture_id: workflow.current_capture_id!, expected_equipment_head: basEquipmentHead(workflow, workflow.current_capture_id!)!,
    expected_assembly_head: basAssemblyHead(workflow, workflow.current_capture_id!)! };
  const graph = { available: true, tables, sheets: [], notes: [], rooms: [], unmatched_tags: [], callouts: [], buildings: [] } as unknown as SheetGraph;
  return { workflow, request, equipment, assembly, source, graph };
}

test('actual shared Python service retains source decisions, exact multiplication, replay and idempotent retries', async () => {
  const { workflow, request } = await fixture(), before = structuredClone(workflow);
  const result = await calculateBasAssemblies(workflow, request);
  assert.deepEqual(workflow, before);
  assert.equal(result.workflow.revision, 'bas_assembly_5');
  const row = result.calculation.result.components[0];
  assert.equal(row.assigned_quantity, 3); assert.equal(row.replication_factor, 3);
  assert.equal(row.installed_quantity, null); assert.equal(result.calculation.result.unique_physical_total, null);
  assert.deepEqual(row.original, workflow.assembly_events![0].register.components[0]);
  assert.deepEqual(result.workflow.captures, workflow.captures);
  assert.deepEqual(result.workflow.equipment_events, workflow.equipment_events);
  assert.deepEqual(result.workflow.assembly_events, workflow.assembly_events);
  assert.deepEqual(await verifyBasWorkflow(JSON.parse(JSON.stringify(result.workflow))), result.workflow);
  assert.deepEqual((await calculateBasAssemblies(result.workflow, request, { python: '/not-a-runtime' })).workflow, result.workflow);
  assert.equal(basAssemblyCalculationState(result.workflow, request.capture_id).status, 'current_dependencies');
  assert.equal((await basAssemblyView(result.workflow, request.capture_id)).components[0].responsibilities[0].assignment, 'factory_furnished');
});

test('a reviewed source-rule transition invalidates the old calculation but preserves exact v1 history and quantity evidence', async () => {
  const { workflow, request, assembly } = await fixture();
  const original = await calculateBasAssemblies(workflow, request);
  const upgraded = await applyBasAssemblyReview(original.workflow, { operation_id: uuid(42), capture_id: request.capture_id,
    expected_head: request.expected_assembly_head, expected_equipment_head: request.expected_equipment_head,
    reason: 'Explicit source-rule review, same owned components',
    register: { ...assembly, source_rule_version: 'explicit_component_declarations_2' } }, 'operator_input');
  assert.equal(basAssemblyCalculationState(upgraded, request.capture_id).status, 'stale_dependencies');
  await assert.rejects(calculateBasAssemblies(upgraded, request), /decisions changed/);
  const updatedRequest = { ...request, expected_assembly_head: basAssemblyHead(upgraded, request.capture_id)! };
  const second = await calculateBasAssemblies(upgraded, updatedRequest);
  assert.equal(second.calculation.result.source_rule_version, 'explicit_component_declarations_2');
  assert.deepEqual(second.calculation.result.components, original.calculation.result.components);
  assert.deepEqual(second.workflow.assembly_calculations![0], original.calculation);
  assert.deepEqual(second.workflow.assembly_events![0], original.workflow.assembly_events![0]);
  assert.deepEqual(await verifyBasWorkflow(JSON.parse(JSON.stringify(second.workflow))), second.workflow);
  assert.deepEqual((await calculateBasAssemblies(second.workflow, updatedRequest, { python: '/not-a-runtime' })).workflow, second.workflow);
});

test('different sensor roles stay separate through shared validation and Python while same-kind source merges reject', async () => {
  const { workflow, request, assembly, source } = await fixture(true);
  const pressure = interpretBasComponentRequirements(source, 'explicit_component_declarations_2').clauses.flatMap(c => c.components)
    .find(c => 'component_role' in c && c.component_role === 'downstream_static_pressure')!;
  assert.ok(pressure);
  const merged = structuredClone(assembly); merged.components[0].source_requirement_ids.push(pressure.requirement_id);
  const review = { operation_id: uuid(43), capture_id: request.capture_id, expected_head: request.expected_assembly_head,
    expected_equipment_head: request.expected_equipment_head, reason: 'Controlled separate sensor role test', register: merged };
  await assert.rejects(applyBasAssemblyReview(workflow, review, 'operator_input'), /Distinct declared component roles/);
  const separate = structuredClone(assembly);
  separate.components.push({ ...structuredClone(assembly.components[0]), component_id: uuid(31), label: 'Downstream static pressure sensor',
    source_requirement_ids: [pressure.requirement_id] });
  const saved = await applyBasAssemblyReview(workflow, { ...review, register: separate }, 'operator_input');
  const result = await calculateBasAssemblies(saved, { ...request, expected_assembly_head: basAssemblyHead(saved, request.capture_id) });
  assert.deepEqual(result.calculation.result.components.map(c => c.assigned_quantity), [3, 3]);
  assert.equal(result.calculation.result.installed_quantity, null);
  assert.ok((await basAssemblyView(saved, request.capture_id)).components.every(c => c.responsibilities.every(r => r.assignment === 'unknown')));
  const corrected = structuredClone(merged); corrected.components[0].quantity.origin = 'explicit_decision';
  const explicit = await applyBasAssemblyReview(workflow, { ...review, register: corrected }, 'operator_input');
  assert.ok((await basAssemblyView(explicit, request.capture_id)).issues.some(i => i.code === 'source_declaration_corrected_by_explicit_decision'));
});

test('edits and equipment withdrawal retain stale results; import order cannot masquerade as current', async () => {
  const { workflow, request, assembly } = await fixture();
  const first = await calculateBasAssemblies(workflow, request);
  const editedAssembly = structuredClone(assembly);
  editedAssembly.components[0].excluded_equipment_ids = [uuid(12)]; editedAssembly.components[0].member_exclusion_reason = 'Controlled member exception';
  const edited = await applyBasAssemblyReview(first.workflow, { operation_id: uuid(41), capture_id: request.capture_id,
    expected_head: request.expected_assembly_head, expected_equipment_head: request.expected_equipment_head,
    reason: 'Exclude one member with all history retained', register: editedAssembly }, 'operator_input');
  assert.equal(basAssemblyCalculationState(edited, request.capture_id).status, 'stale_dependencies');
  await assert.rejects(calculateBasAssemblies(edited, request), /decisions changed/);
  const second = await calculateBasAssemblies(edited, { ...request, expected_assembly_head: basAssemblyHead(edited, request.capture_id) });
  assert.equal(second.calculation.result.components[0].assigned_quantity, 2);
  assert.deepEqual(second.workflow.assembly_calculations![0], first.calculation);
  assert.deepEqual(await verifyBasWorkflow(mergeBasWorkflows(first.workflow, second.workflow)), second.workflow);
  const reordered = { ...second.workflow, assembly_calculations: [...second.workflow.assembly_calculations!].reverse() };
  assert.equal(basAssemblyCalculationState(reordered, request.capture_id).latest?.calculation_id, second.calculation.calculation_id);
  const withdrawn = await applyBasEquipmentReview(second.workflow, { operation_id: uuid(21), capture_id: request.capture_id,
    expected_head: request.expected_equipment_head, reason: 'Withdraw equipment only', register: emptyBasEquipmentRegister() }, 'operator_input');
  assert.equal(basAssemblyCalculationState(withdrawn, request.capture_id).status, 'stale_dependencies');
  assert.deepEqual(await verifyBasWorkflow(withdrawn), withdrawn);
  await assert.rejects(calculateBasAssemblies(withdrawn, { ...request, expected_equipment_head: basEquipmentHead(withdrawn, request.capture_id),
    expected_assembly_head: basAssemblyHead(withdrawn, request.capture_id) }), /decisions changed/);
});

test('ordinary store/export/import retains calculations, original evidence and unrelated workflow fields', async () => {
  const { workflow, request } = await fixture();
  const { workflow: calculated } = await calculateBasAssemblies(workflow, request);
  const store = createLocalStore('bas-assembly-quantity-test');
  await store.saveAnnotations({ project_name: 'Controlled quantities', shapes: [], bas_workflow: calculated });
  const saved = await store.loadAnnotations();
  assert.deepEqual(await verifyBasWorkflow(saved.bas_workflow), calculated);
  const imported = parseTakeoffImport(JSON.stringify(saved));
  const merged = mergeTakeoffImport({ project_name: 'Existing project', shapes: [], bas_workflow: workflow }, imported);
  assert.deepEqual(await verifyBasWorkflow(merged.payload.bas_workflow), calculated);
  assert.deepEqual(mergeTakeoffImport(merged.payload, imported).payload.bas_workflow, calculated);
});

test('corrupt source copies, hidden unknowns, dropped history and mismatched responses reject', async () => {
  const { workflow, request, equipment, assembly } = await fixture();
  const calculated = await calculateBasAssemblies(workflow, request);
  const input = await buildBasAssemblyQuantityInput(workflow.captures[0], equipment, request.expected_equipment_head, assembly, request.expected_assembly_head);
  for (const alter of [
    (r: typeof calculated.calculation.result) => { r.components[0].original.quantity.value = 20; },
    (r: typeof calculated.calculation.result) => { r.components = []; },
    (r: typeof calculated.calculation.result) => { r.components[0].included_equipment_ids = []; },
    (r: typeof calculated.calculation.result) => { r.components[0].issues = []; },
    (r: typeof calculated.calculation.result) => { r.assembly_head = '0'.repeat(64); },
    (r: typeof calculated.calculation.result) => { r.components[0].eligibility = 'excluded_component'; },
  ]) {
    const changed = structuredClone(calculated.calculation.result); alter(changed);
    assert.throws(() => verifyBasAssemblyQuantityResult(input, changed));
  }
  const corrupt = structuredClone(calculated.workflow);
  corrupt.assembly_calculations![0].result.components[0].assigned_quantity = 300;
  await assert.rejects(verifyBasWorkflow(corrupt), /fingerprint/);
  const omitted = { ...calculated.workflow, equipment_events: [] };
  assert.throws(() => assertBasAssemblyCalculationUpdate(workflow, omitted, calculated.calculation, request), /omitted/);
  assert.throws(() => assertBasAssemblyCalculationUpdate(workflow, calculated.workflow, calculated.calculation, { ...request, expected_equipment_head: '0'.repeat(64) }), /different/);
});

test('unknown quantities survive exclusion, and unsafe products/cancelled transport never produce accepted totals', async () => {
  const { workflow, request, equipment, assembly } = await fixture();
  const input = await buildBasAssemblyQuantityInput(workflow.captures[0], equipment, request.expected_equipment_head, assembly, request.expected_assembly_head);
  const component = input.assembly_register.components[0];
  component.quantity.origin = 'explicit_decision'; component.quantity.value = null;
  component.disposition = 'excluded'; component.exclusion_reason = 'Controlled exclusion of unknown count';
  const result = verifyBasAssemblyQuantityResult(input, await runBasAssemblyQuantities(input));
  assert.equal(result.components[0].assigned_quantity, null); assert.equal(result.components[0].status, 'quantity_unknown');
  const fakeZero = structuredClone(result); fakeZero.components[0].assigned_quantity = 0;
  assert.throws(() => verifyBasAssemblyQuantityResult(input, fakeZero), /unknown/);
  component.disposition = 'included'; component.exclusion_reason = null; component.quantity.value = Number.MAX_SAFE_INTEGER;
  await assert.rejects(runBasAssemblyQuantities(input), /exact numeric range/);
  await assert.rejects(runBasAssemblyQuantities(input, { timeoutMs: 1 }), /timed out/);
  const controller = new AbortController(); controller.abort(new Error('Controlled cancellation'));
  await assert.rejects(calculateBasAssemblies(workflow, request, { signal: controller.signal }), /cancellation/);
  assert.equal(workflow.assembly_calculations, undefined);
});

test('production compile exposes owned declarations, persists assembly review/calculation, and preserves legacy output', async () => {
  const { workflow, request, assembly, source, graph } = await fixture();
  const session = { basWorkflow: workflow, basSourcesForPipeline: () => source,
    retainBasWorkflow(next: typeof workflow) { this.basWorkflow = next; return true; } };
  const beforeGraph = structuredClone(graph);
  const baseline = await compileProductionTakeoff(session, graph, 'bas_points');
  assert.ok('bas_assemblies' in baseline);
  const summary = basAssemblySummarySchema.parse(baseline.bas_assemblies);
  assert.equal(summary.source_requirements.length, 1);
  assert.equal(summary.source_requirements[0].requirement_id, assembly.components[0].source_requirement_ids[0]);
  assert.equal(summary.installed_quantity, null);
  const edited = structuredClone(assembly);
  edited.components[0].excluded_equipment_ids = [uuid(12)]; edited.components[0].member_exclusion_reason = 'Controlled public exception';
  const review = { operation_id: uuid(50), capture_id: request.capture_id, expected_head: request.expected_assembly_head,
    expected_equipment_head: request.expected_equipment_head, register: edited, reason: 'Controlled public assembly review' };
  const result = await compileProductionTakeoff(session, graph, 'bas_points', { bas_assembly_review: review });
  assert.ok('bas_assemblies' in result);
  const current = basAssemblySummarySchema.parse(result.bas_assemblies);
  assert.equal(current.review_origin, 'agent_proposal');
  const calculated = await compileProductionTakeoff(session, graph, 'bas_points', { bas_assembly_quantities: { ...request, expected_assembly_head: current.review_head } });
  assert.ok('bas_assembly_quantities' in calculated && calculated.bas_assembly_quantities);
  assert.equal(calculated.bas_assembly_quantities.result.components[0].assigned_quantity, 2);
  assert.deepEqual(graph, beforeGraph);
  assert.ok('bas_math' in calculated && 'bas_math' in baseline);
  assert.deepEqual(calculated.bas_math, baseline.bas_math);
  assert.ok('bas_point_lists' in calculated && 'bas_point_lists' in baseline && 'bas_workflow' in calculated);
  assert.deepEqual(calculated.bas_point_lists, baseline.bas_point_lists);
  assert.deepEqual(calculated.bas_workflow, session.basWorkflow);
  assert.deepEqual(session.basWorkflow.captures, workflow.captures);
  const stable = structuredClone(session.basWorkflow);
  await compileProductionTakeoff(session, graph, 'bas_points', { bas_assembly_review: review });
  assert.deepEqual(session.basWorkflow, stable, 'Exact public retry must not duplicate the review or calculation');
  await assert.rejects(compileProductionTakeoff(session, graph, 'bas_points', { bas_assembly_quantities: request }), /changed/);
  assert.deepEqual(session.basWorkflow, stable);
  await assert.rejects(compileProductionTakeoff(session, graph, 'hvac_equipment', { bas_assembly_review: review }), /only available/);
});

test('actual assembly HTTP bridge matches shared Python and rejects malformed, foreign and stale requests', async () => {
  const { workflow, request } = await fixture(), before = structuredClone(workflow);
  const middleware = basAssemblyMiddleware(resolveTsxLoader);
  const server = createServer((req, res) => { void middleware(req, res, () => { res.writeHead(404); res.end(); }); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/__ot/bas-assembly-quantities`;
  const post = (body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const reply = await post({ workflow, request }); assert.equal(reply.status, 200);
    const response = z.object({ workflow: basWorkflowSchema, calculation: basAssemblyCalculationSchema }).strict().parse(await reply.json());
    assertBasAssemblyCalculationUpdate(workflow, response.workflow, response.calculation, request);
    assert.deepEqual(await verifyBasWorkflow(response.workflow), response.workflow);
    assert.deepEqual(response.calculation.result, (await calculateBasAssemblies(workflow, request)).calculation.result);
    const retry = await post({ workflow: response.workflow, request }); assert.equal(retry.status, 200);
    assert.deepEqual(await retry.json(), response);
    assert.equal((await post({ workflow, request: { ...request, expected_assembly_head: '0'.repeat(64) } })).status, 422);
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.invalid' }, body: '{}' })).status, 403);
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
    assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 415);
    assert.equal((await fetch(url)).status, 405);
    assert.deepEqual(workflow, before);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('concurrent or replaced Session cannot accept an older assembly calculation', async () => {
  const { workflow, request, equipment, source, graph } = await fixture();
  const newer = await applyBasEquipmentReview(workflow, { operation_id: uuid(90), capture_id: request.capture_id,
    expected_head: request.expected_equipment_head, register: equipment, reason: 'Controlled concurrent equipment review' }, 'operator_input');
  let current = workflow, reads = 0;
  const session = { basSourcesForPipeline: () => source,
    get basWorkflow() { const value = current; if (++reads === 1) queueMicrotask(() => { current = newer; }); return value; },
    retainBasWorkflow(value: typeof workflow) { current = value; return true; } };
  await assert.rejects(compileProductionTakeoff(session, graph, 'bas_points', { bas_assembly_quantities: request }), /workspace changed/);
  assert.deepEqual(current, newer); assert.equal(current.assembly_calculations, undefined);
  const replaced = { basWorkflow: workflow, basSourcesForPipeline: () => source, retainBasWorkflow() { return false; } };
  await assert.rejects(compileProductionTakeoff(replaced, graph, 'bas_points', { bas_assembly_quantities: request }), /drawing set changed/);
  assert.deepEqual(replaced.basWorkflow, workflow);
});
