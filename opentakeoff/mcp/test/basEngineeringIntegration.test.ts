/** Controlled sources through actual HTTP/CLI/Python and production compile.
 * Not a real-PDF or hands-on public MCP-client acceptance substitute. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { engineeringFixture, uuid } from '../../web/test/helpers/basEngineeringFixture.ts';
import { basEngineeringMiddleware } from '../../web/vite.basAssignmentApi.js';
import { resolveTsxLoader } from '../../web/vite.corpusTakeoffApi.js';
import { assertBasEngineeringUpdate, assertBasEngineeringInspection, basEngineeringSummarySchema, basEngineeringHeads } from '../../web/src/lib/basEngineeringReview.ts';
import { basEngineeringReviewEventSchema } from '../../web/src/lib/basEngineeringRegister.ts';
import { verifyBasWorkflow, captureBasEvidence, basWorkflowSchema } from '../../web/src/lib/basWorkflow.ts';
import { applyBasEquipmentReview } from '../../web/src/lib/basEquipmentReview.ts';
import { applyBasAssemblyReview } from '../../web/src/lib/basAssemblyReview.ts';
import { applyBasEngineeringReview } from '../src/basEngineeringReview.ts';
import { runBasPointLists } from '../src/basMath.ts';
import { compileProductionTakeoff } from '../src/productionTakeoff.ts';
import type { SheetGraph } from '../../web/src/lib/sheetgraph.ts';

test('HTTP engineering review/replay matches shared Python and binds precisely to the submitted history', async () => {
  const { workflow, request } = await engineeringFixture(), before = structuredClone(workflow);
  const middleware = basEngineeringMiddleware(resolveTsxLoader);
  const server = createServer((req, res) => { void middleware(req, res, () => { res.writeHead(404); res.end(); }); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/__ot/bas-engineering`;
  const post = (body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const reply = await post({ workflow, request: { action: 'review', request } });
    assert.equal(reply.status, 200); const response = z.object({ workflow: basWorkflowSchema, event: basEngineeringReviewEventSchema }).strict().parse(await reply.json());
    const saved = await verifyBasWorkflow(response.workflow), event = basEngineeringReviewEventSchema.parse(response.event);
    assertBasEngineeringUpdate(workflow, saved, event, request, 'operator_input');
    assert.deepEqual(event.result, (await applyBasEngineeringReview(workflow, request, 'operator_input')).event.result);
    assert.deepEqual(workflow, before, 'Transport preview cannot mutate the submitted workspace');
    const replay = await post({ workflow: saved, request: { action: 'inspect', request: { capture_id: request.capture_id } } });
    assert.equal(replay.status, 200); const inspected = z.object({ workflow: basWorkflowSchema, view: z.record(z.unknown()) }).strict().parse(await replay.json());
    await assertBasEngineeringInspection(saved, inspected.workflow, inspected.view, request.capture_id);
    assert.equal(inspected.view.calculation_verification, 'verified_shared_python_replay');
    assert.equal(inspected.view.project_complete, false);
    await assert.rejects(assertBasEngineeringInspection(saved, inspected.workflow, { ...inspected.view, project_complete: true }, request.capture_id));
    await assert.rejects(assertBasEngineeringInspection(saved, before, inspected.view, request.capture_id));
    await assert.rejects(assertBasEngineeringInspection(saved, inspected.workflow, { ...inspected.view, issues: [{ code: 'substituted' }] }, request.capture_id));
    const retry = await post({ workflow: saved, request: { action: 'review', request } });
    assert.equal(retry.status, 200); assert.deepEqual(await retry.json(), response);
    assert.equal((await post({ workflow, request: { action: 'review', request: { ...request, expected_equipment_head: '0'.repeat(64) } } })).status, 422);
    const wrongSource = structuredClone(request); wrongSource.register.resources[0].source_span_ids = ['foreign-span'];
    assert.equal((await post({ workflow, request: { action: 'review', request: wrongSource } })).status, 422);
    const foreignHistory = structuredClone(saved); foreignHistory.captures[0].narrative_sources!.pages[0].spans[0].text = 'Changed unowned text';
    assert.equal((await post({ workflow: foreignHistory, request: { action: 'inspect', request: { capture_id: request.capture_id } } })).status, 422);
    assert.equal((await post({ workflow, request: { action: 'review', request, result: event.result } })).status, 422);
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.invalid' }, body: '{}' })).status, 403);
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
    assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 415);
    assert.equal((await fetch(url)).status, 405);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

async function productionFixture() {
  const f = await engineeringFixture();
  const points = await runBasPointLists({ sources: f.source, tables: f.tables });
  const captured = await captureBasEvidence(f.source, points, f.capture.equipment_sources);
  let workflow = await applyBasEquipmentReview(captured, { operation_id: uuid(20), capture_id: captured.current_capture_id,
    expected_head: null, register: f.equipment, reason: 'Controlled production-source equipment review' }, 'operator_input');
  workflow = await applyBasAssemblyReview(workflow, { operation_id: uuid(40), capture_id: workflow.current_capture_id,
    expected_head: null, expected_equipment_head: basEngineeringHeads(workflow, workflow.current_capture_id!).equipment,
    register: f.assembly, reason: 'Controlled production-source assembly review' }, 'operator_input');
  const heads = basEngineeringHeads(workflow, workflow.current_capture_id!);
  const request = { ...f.request, capture_id: workflow.current_capture_id!, expected_equipment_head: heads.equipment!, expected_assembly_head: heads.assembly };
  const graph = { available: true, tables: f.tables, sheets: [], notes: [], rooms: [], unmatched_tags: [], callouts: [], buildings: [] } as unknown as SheetGraph;
  return { ...f, workflow, request, graph };
}

test('production compile records engineering proposals and replay without changing legacy tables, math or evidence', async () => {
  const { workflow, request, source, graph } = await productionFixture(), beforeGraph = structuredClone(graph);
  const session = { basWorkflow: workflow, basSourcesForPipeline: () => source, retainBasWorkflow(next: typeof workflow) { this.basWorkflow = next; return true; } };
  const baseline = await compileProductionTakeoff(session, graph, 'bas_points');
  assert.equal('bas_engineering' in baseline, false);
  const result = await compileProductionTakeoff(session, graph, 'bas_points', { bas_engineering_review: request });
  assert.ok('bas_engineering' in result);
  const summary = basEngineeringSummarySchema.parse(result.bas_engineering);
  assert.equal(summary.event!.origin, 'agent_proposal'); assert.equal(summary.event!.result.status, 'pass');
  assert.equal(summary.calculation_verification, 'verified_shared_python_replay');
  assert.equal(summary.installed_quantity, null); assert.equal(summary.project_complete, false);
  const read = await compileProductionTakeoff(session, graph, 'bas_points');
  assert.ok('bas_engineering' in read);
  assert.equal(basEngineeringSummarySchema.parse(read.bas_engineering).calculation_verification, 'requires_python_replay');
  const inspected = await compileProductionTakeoff(session, graph, 'bas_points', { bas_engineering_inspect: { capture_id: request.capture_id } });
  assert.ok('bas_engineering' in inspected);
  assert.equal(basEngineeringSummarySchema.parse(inspected.bas_engineering).calculation_verification, 'verified_shared_python_replay');
  const stripEngineering = (value: unknown) => {
    const { bas_workflow: _workflow, bas_engineering: _engineering, ...rest } = z.record(z.unknown()).parse(value); return rest;
  };
  assert.deepEqual(stripEngineering(result), stripEngineering(baseline));
  assert.deepEqual(graph, beforeGraph); assert.deepEqual(session.basWorkflow.captures, workflow.captures);
  assert.deepEqual(session.basWorkflow.equipment_events, workflow.equipment_events);
  assert.deepEqual(session.basWorkflow.assembly_events, workflow.assembly_events);
  const stable = structuredClone(session.basWorkflow);
  await compileProductionTakeoff(session, graph, 'bas_points', { bas_engineering_review: request });
  assert.deepEqual(session.basWorkflow, stable);
  await assert.rejects(compileProductionTakeoff(session, graph, 'hvac_equipment', { bas_engineering_review: request }), /only available/);
  await assert.rejects(compileProductionTakeoff(session, graph, 'bas_points', { bas_engineering_inspect: { capture_id: '0'.repeat(64) } }));
  assert.deepEqual(session.basWorkflow, stable);
});

test('engineering public calls reject concurrent Session edits and a replaced drawing set', async () => {
  const { workflow, request, source, graph, equipment } = await productionFixture();
  const newer = await applyBasEquipmentReview(workflow, { operation_id: uuid(90), capture_id: request.capture_id,
    expected_head: request.expected_equipment_head, register: equipment, reason: 'Controlled concurrent review' }, 'operator_input');
  for (const options of [{ bas_engineering_review: request }, { bas_engineering_inspect: { capture_id: request.capture_id } }]) {
    let current = workflow, reads = 0;
    const session = { basSourcesForPipeline: () => source,
      get basWorkflow() { const value = current; if (++reads === 1) queueMicrotask(() => { current = newer; }); return value; },
      retainBasWorkflow(next: typeof workflow) { current = next; return true; } };
    await assert.rejects(compileProductionTakeoff(session, graph, 'bas_points', options), /workspace changed/);
    assert.deepEqual(current, newer);
    const replaced = { basWorkflow: workflow, basSourcesForPipeline: () => source, retainBasWorkflow() { return false; } };
    await assert.rejects(compileProductionTakeoff(replaced, graph, 'bas_points', options), /drawing set changed/);
    assert.deepEqual(replaced.basWorkflow, workflow);
  }
});
