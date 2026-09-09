/** Production-boundary tests. Tiny tables are declared fixtures, not PDF truth. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { Session } from '../src/session.ts';
import { runBasMath, runBasPointLists } from '../src/basMath.ts';
import { compileProductionTakeoff } from '../src/productionTakeoff.ts';
import { compileCorpusTakeoffOutput, exportTakeoffOutput } from '../src/outputs.ts';
import { compileTakeoff } from '../../web/src/lib/compileTakeoff.mjs';
import { buildBasSourceContext } from '../../web/src/lib/basSources.ts';
import { basPointListsSchema } from '../../web/src/lib/basPointLists.ts';
import type { SheetGraph } from '../../web/src/lib/sheetgraph.ts';
import { captureBasPoints, mergeBasWorkflows, verifyBasWorkflow, type BasWorkflow } from '../../web/src/lib/basWorkflow.ts';
import { interpretBasSequences } from '../../web/src/lib/basSequenceReconciliation.ts';
import { importTakeoff } from '../src/importing.ts';

const sources = buildBasSourceContext([{ sha256: 'a'.repeat(64), byte_length: 100, name: 'fixture.pdf', page_count: 1,
  pages: [{ page_number: 1, sheet_key: 'fixture.pdf', width_px: 500, height_px: 500, rotation: 0,
    spans: [{ str: '* INDICATES POINT PULLED FROM CHILLER CONTROLLER', x0: 10, y0: 90, x1: 290, y1: 100 }] }] }]);
const graph = { available: true, sheets: [], tables: [{ sheet: 'fixture.pdf',
  title: { text: 'BAS POINT LIST', bbox: [0, 0, 300, 10] }, headers: ['POINT NAME', 'AI', 'ALARM'], region: [0, 0, 300, 100],
  rows: [{ key: '1', cells: { 'POINT NAME': { text: 'Temperature*', bbox: [0, 20, 150, 30] },
    AI: { text: 'X', bbox: [150, 20, 200, 30] }, ALARM: { text: 'X', bbox: [200, 20, 250, 30] } } }],
}], notes: [], rooms: [], unmatched_tags: [], callouts: [], buildings: [] } as unknown as SheetGraph;

test('Python point observations cross the strict shared boundary with unmodified sources', async () => {
  const payload = { sources, tables: graph.tables }, before = structuredClone(payload);
  const result = await runBasPointLists(payload);
  assert.deepEqual(payload, before);
  assert.equal(result.matrices.length, 1);
  const row = result.matrices[0].rows[0];
  assert.equal(row.status, 'interpreted');
  assert.equal(row.qualifiers[0].subject, 'CHILLER CONTROLLER');
  assert.equal(row.qualifiers[0].source.span_id, sources.pages[0].spans[0].span_id);
  assert.deepEqual(row.observations.find(o => o.channel === 'AI')?.source.bbox_px, [150, 20, 200, 30]);
  assert.equal(row.observations.find(o => o.channel === 'ALARM')?.kind, 'attribute');
  assert.equal(row.field_wiring_status, 'not_established');
  assert.equal('physical_total' in result, false);
  assert.deepEqual(await runBasPointLists(payload), result);
});

test('production BAS compile adds grounded observations without replacing legacy or math', async () => {
  const session = { basSourcesForPipeline: () => sources };
  const before = structuredClone(graph);
  const result = await compileProductionTakeoff(session, graph, 'T-BAS-01');
  assert.ok('bas_point_lists' in result, 'production must expose the source-bound result');
  const { bas_math, bas_point_lists, bas_workflow, ...legacy } = result;
  assert.equal(bas_workflow?.captures.length, 1);
  assert.deepEqual(bas_workflow?.captures[0].points, bas_point_lists);
  assert.deepEqual(legacy, compileTakeoff(session, graph, 'T-BAS-01'));
  assert.deepEqual(bas_point_lists, await runBasPointLists({ sources, tables: graph.tables }));
  assert.deepEqual(bas_math, await runBasMath({ blueprint: { tables: graph.tables, sequence_count: 0, options: {} } }));
  assert.deepEqual(z.object(compileCorpusTakeoffOutput).parse(result), result, 'MCP must retain the additive record');
  assert.deepEqual(graph, before);
  assert.deepEqual(await compileProductionTakeoff(session, graph, 'hvac_equipment'), compileTakeoff(session, graph, 'hvac_equipment'));
});

test('source failure is explicit and cannot discard a valid legacy or math result', async () => {
  const result = await compileProductionTakeoff({ basSourcesForPipeline() { throw new Error('Source pages unavailable'); } }, graph, 'bas_points');
  assert.ok('bas_point_lists' in result);
  assert.deepEqual(result.bas_point_lists, { schema_version: 'bas_point_lists_v1', status: 'unavailable',
    project_complete: false, error: 'Source pages unavailable' });
  assert.ok('bas_math' in result && 'physical_total' in result.bas_math);
  assert.equal(result.bas_math.physical_total.AI, 1);
});

test('production recompile returns retained association events; stale requests never mutate them', async () => {
  // Declared synthetic adapter fixture. The separate MCP walkthrough loads a
  // real PDF and exercises the same public create/retry/recompile/export path.
  const input = buildBasSourceContext([{ name: 'fixture.pdf', sha256: 'a'.repeat(64), byte_length: 100, page_count: 1,
    pages: [{ page_number: 1, sheet_key: 'fixture.pdf', width_px: 1000, height_px: 700, rotation: 0, spans: [
      { str: 'AIR HANDLING UNIT CONTROL SEQUENCE', x0: 10, y0: 150, x1: 450, y1: 170 },
      { str: '1. THE CONTROLLER SHALL MONITOR SUPPLY AIR TEMPERATURE AND MODULATE HOT WATER FLOW TO MAINTAIN SET POINT.', x0: 10, y0: 190, x1: 850, y1: 200 },
      { str: 'AHU-1', x0: 10, y0: 400, x1: 80, y1: 410 },
    ] }] }]);
  const session = { basWorkflow: null as BasWorkflow | null, basSourcesForPipeline: () => input,
    retainBasWorkflow(w: BasWorkflow) { this.basWorkflow = mergeBasWorkflows(this.basWorkflow, w, true); return true; } };
  const first = await compileProductionTakeoff(session, graph, 'bas_points');
  assert.ok('bas_workflow' in first && first.bas_workflow);
  const region = interpretBasSequences(input).regions.find(r => r.raw.status === 'body_detected');
  assert.ok(region);
  const request = { operation_id: '00000000-0000-4000-8000-000000000001',
    capture_id: first.bas_workflow.current_capture_id, expected_head: null,
    action: { kind: 'upsert', association: { region_id: region.region_id,
      matrix_id: first.bas_workflow.captures[0].points.matrices[0].matrix_id, reason: 'Synthetic pipeline regression association',
      equipment_references: [{ tag: 'AHU-1', span_ids: [input.pages[0].spans[2].span_id],
        scope: { building: null, level: null, system: null, phase: null } }] } } };
  const reviewed = await compileProductionTakeoff(session, graph, 'bas_points', { bas_review: request });
  assert.ok('bas_workflow' in reviewed && reviewed.bas_workflow);
  assert.equal(reviewed.bas_workflow.review_events?.length, 1);
  assert.equal(reviewed.bas_workflow.review_events[0].origin, 'agent_proposal');
  assert.deepEqual(await compileProductionTakeoff(session, graph, 'bas_points'), reviewed);
  assert.deepEqual(await compileProductionTakeoff(session, graph, 'bas_points', { bas_review: request }), reviewed);
  const retained = structuredClone(session.basWorkflow);
  await assert.rejects(compileProductionTakeoff(session, graph, 'bas_points', { bas_review: {
    ...request, operation_id: '00000000-0000-4000-8000-000000000002' } }), /changed since/);
  assert.deepEqual(session.basWorkflow, retained);
  assert.deepEqual(reviewed.bas_workflow.captures, first.bas_workflow.captures);
});

test('unowned point observations are retained even when a durable capture is impossible', async () => {
  const unowned = structuredClone(graph);
  unowned.tables[0].sheet = 'not-loaded.pdf';
  const result = await compileProductionTakeoff({ basSourcesForPipeline: () => sources }, unowned, 'bas_points');
  assert.ok('bas_point_lists' in result && result.bas_point_lists && 'matrices' in result.bas_point_lists);
  assert.equal(result.bas_point_lists.matrices.length, 1);
  assert.ok('bas_workflow_error' in result && result.bas_workflow_error);
  assert.equal('bas_workflow' in result, false);
});

test('real Session export/import retains verified captures and rejects corruption before mutation', async () => {
  const s = new Session();
  const pdf = fileURLToPath(new URL('../../demo/sample-plan.pdf', import.meta.url));
  await s.loadPlan(pdf);
  const context = s.basSourcesForPipeline();
  const points = await runBasPointLists({ sources: context, tables: [] });
  const workflow = await captureBasPoints(context.documents, points);
  s.retainBasWorkflow(workflow);
  assert.deepEqual(s.exportPayload().bas_workflow, workflow);
  assert.deepEqual(z.object(exportTakeoffOutput).parse(s.exportPayload()).bas_workflow, workflow, 'typed export must not strip the capture');
  const dir = await mkdtemp(path.join(tmpdir(), 'bas-workflow-import-'));
  const file = path.join(dir, 'takeoff.json');
  await writeFile(file, JSON.stringify(s.exportPayload()));
  const restored = new Session();
  await restored.loadPlan(pdf);
  await importTakeoff(restored, file);
  assert.deepEqual(await verifyBasWorkflow(restored.exportPayload().bas_workflow), workflow);
  await importTakeoff(restored, file);
  assert.equal(restored.basWorkflow?.captures.length, 1);
  const corrupt = structuredClone(restored.exportPayload());
  corrupt.bas_workflow!.captures[0].points.issues.push('CONTROLLED_CORRUPTION');
  await writeFile(file, JSON.stringify(corrupt));
  await assert.rejects(importTakeoff(restored, file), /fingerprint/);
  assert.deepEqual(restored.basWorkflow, workflow);
  await restored.loadPlan(pdf);
  assert.equal(restored.basWorkflow, null, 'replacing the session clears prior captures');
  const oldSourceCapture = await captureBasPoints(sources.documents, await runBasPointLists({ sources, tables: graph.tables }));
  restored.retainBasWorkflow(oldSourceCapture);
  assert.equal(restored.basWorkflow, null, 'a compile for another loaded byte set cannot populate this session');
});

test('invalid engineering policy cannot suppress valid source observations', async () => {
  const result = await compileProductionTakeoff({ basSourcesForPipeline: () => sources }, graph, 'bas_points', { bas_math: { unexpected: true } });
  assert.ok('bas_point_lists' in result && result.bas_point_lists && 'matrices' in result.bas_point_lists);
  assert.equal(result.bas_point_lists.matrices.length, 1);
  assert.ok('bas_math' in result);
  assert.equal(result.bas_math.status, 'unavailable');
});

test('real Session source context is accepted; no point table is not claimed complete', async () => {
  const session = new Session();
  await session.loadPlan(fileURLToPath(new URL('../../demo/sample-plan.pdf', import.meta.url)));
  const realSources = session.basSourcesForPipeline();
  const result = await runBasPointLists({ sources: realSources, tables: [] });
  assert.deepEqual(result.matrices, []);
  assert.equal(result.project_complete, false);
  assert.deepEqual(result.issues, ['SOURCE_DISCOVERY_COVERAGE_UNVERIFIED']);
  assert.deepEqual(session.basSourcesForPipeline(), realSources);
});

test('point transport rejects invalid source identity, oversized payload and missing runtime', async () => {
  const bad = structuredClone(sources);
  bad.pages[0].source_id = 'sha256:' + 'b'.repeat(64);
  await assert.rejects(runBasPointLists({ sources: bad, tables: graph.tables }), /Invalid BAS/);
  await assert.rejects(runBasPointLists({ sources, tables: graph.tables, padding: 'x'.repeat(32 * 1024 * 1024) }), /input exceeds 32 MiB/);
  await assert.rejects(runBasPointLists({ sources, tables: graph.tables }, { python: '/nonexistent/bas-python' }), /runtime unavailable/);
});

test('shared output schema rejects orphaned evidence, omitted rows and misleading statuses', async () => {
  const original = await runBasPointLists({ sources, tables: graph.tables });
  const mutations: Array<(r: typeof original) => void> = [
    r => { r.matrices.push(structuredClone(r.matrices[0])); },
    r => { r.matrices[0].rows = []; },
    r => { r.matrices[0].rows[0].raw.cells.AI.text = '2'; },
    r => { r.matrices[0].rows[0].observations[0].source.text = 'different'; },
    r => { r.matrices[0].rows[0].observations[0].source.page_id = sources.pages[0].page_id + '2'; },
    r => { r.matrices[0].rows[0].observations[0].source.bbox_px = [0, 0, 1, 1]; },
    r => { r.matrices[0].rows[0].observations[0].value = null; },
    r => { r.matrices[0].rows[0].qualifiers[0].subject = 'OTHER'; },
    r => { r.matrices[0].rows[0].unobserved_columns = ['AI']; },
    r => { r.matrices[0].rows[0].issues = ['UNRESOLVED']; },
  ];
  for (const mutate of mutations) {
    const result = structuredClone(original);
    mutate(result);
    assert.equal(basPointListsSchema.safeParse(result).success, false, String(mutate));
  }
  assert.deepEqual(basPointListsSchema.parse(original), original);
});
