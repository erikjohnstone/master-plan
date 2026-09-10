/** Real-PDF/public-MCP equipment assignment proof. Source keys are independent;
 * proposed scope/assignment decisions are explicit diagnostic inputs, not approvals. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Session } from '../src/session.ts';
import { buildServer } from '../server.ts';
import { compileTakeoff } from '../../web/src/lib/compileTakeoff.mjs';
import { emptyBasEquipmentRegister } from '../../web/src/lib/basEquipmentRegister.ts';
import { basEquipmentView, basAssignmentCalculationState } from '../../web/src/lib/basEquipmentReview.ts';
import { shutdownVectorGrid } from '../../web/src/lib/vectorGridClient.ts';
import { writeJsonAndExit } from './cliJson.mjs';

const [pdf, directory] = process.argv.slice(2);
assert.ok(pdf && directory, 'Usage: real Behavioral development PDF and output directory');
const out = path.resolve(directory); mkdirSync(out, { recursive: true });
const truth = JSON.parse(readFileSync(new URL('../../web/test/fixtures/bas-equipment-system-cases.json', import.meta.url), 'utf8'));
const verifyDemand = process.env.OT_BAS_DEMAND === '1';
const session = new Session(), server = buildServer(session), client = new Client({ name: 'bas-equipment-audit', version: '1' });
const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
const started = performance.now();
const phase = (name: string) => console.error(JSON.stringify({ phase: name, elapsed_ms: Math.round(performance.now() - started),
  rss_bytes: process.memoryUsage().rss, heap_bytes: process.memoryUsage().heapUsed }));
async function call(name: string, args: Record<string, unknown>, expectedError = false) {
  phase(`${name}:start`);
  // Reset/import invalidates the graph. The independently measured 29-page cold
  // graph exceeds the earlier 120-s diagnostic deadline. Give compile the same
  // explicit long-run allowance before and after import; not a server setting.
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: name === 'compile_corpus_takeoff' ? 600000 : 120000 });
  assert.equal(Boolean(result.isError), expectedError, JSON.stringify(result.content).slice(0, 1000));
  const block = result.content[0]; assert.equal(block.type, 'text');
  const data = JSON.parse((block as { text: string }).text);
  if (!expectedError) assert.deepEqual(result.structuredContent, data);
  phase(`${name}:complete`);
  return data;
}
let report;
try {
  await call('load_plan', { path: path.resolve(pdf) });
  phase('graph:start');
  const graph = await session.graphForPipeline();
  phase('graph:ready');
  const originalGraph = structuredClone(graph);
  phase('graph:clone-ready');
  const initial = await call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full' });
  const { bas_workflow: workflow, bas_equipment: summary, bas_assemblies: assemblies, bas_math: originalMath, bas_point_lists: originalPoints, path: _path, export_path: _export, ...legacy } = initial;
  assert.equal(assemblies.schema_version, 'bas_assembly_summary_v1');
  assert.equal(assemblies.installed_quantity, null);
  assert.deepEqual(legacy, compileTakeoff(session, graph, 'bas_points'));
  const capture = workflow.captures[0];
  assert.equal(capture.sources[0].sha256, truth.source_sha256);
  assert.deepEqual(capture.equipment_sources.tables, graph.tables.filter(t => t.kind === 'equipment'));
  assert.deepEqual(capture.narrative_sources, session.basSourcesForPipeline());
  const matrix = capture.points.matrices.find((m: any) => m.raw.title.text.includes(truth.point_matrix_title) && m.raw.title.text.includes(truth.system));
  assert.ok(matrix);
  const scopeId = randomUUID();
  const register = emptyBasEquipmentRegister();
  const applicabilityPage = `sha256:${truth.source_sha256}:p${truth.applicability_page}`;
  register.scopes.push({ scope_id: scopeId, building: null, level: null, system: truth.system, phase: null,
    source_span_ids: truth.membership_cases.map((c: any) => `${applicabilityPage}:s${c.span_index}`),
    reason: 'Explicit diagnostic scope from independently reviewed equipment-controlled/monitored list; building/level/phase unestablished.' });
  for (const entry of truth.membership_cases) for (const member of entry.members) {
    const matches = summary.occurrences.filter((o: any) => o.named_members?.includes(member));
    assert.equal(matches.length, 1, member);
    assert.equal(matches[0].page_id, `sha256:${truth.source_sha256}:p${truth.schedule_page}`);
    assert.equal(matches[0].installed_quantity, null);
    register.equipment.push({ equipment_id: randomUUID(), scope_id: scopeId, tag: member,
      bindings: [{ occurrence_id: matches[0].occurrence_id, member }], reason: 'Explicit binding to the source-reviewed scheduled member; not installation proof.' });
  }
  assert.equal(register.equipment.length, truth.named_members);
  register.assignments.push({ assignment_id: randomUUID(), matrix_id: matrix.matrix_id, applicability: 'system_once',
    equipment_ids: register.equipment.map(e => e.equipment_id), excluded_equipment_ids: [], sequence_region_ids: [],
    source_span_ids: register.scopes[0].source_span_ids,
    reason: 'The independently reviewed system matrix already lists these equipment and system points. Apply the matrix once, not once per named unit. SOO-region association remains separate review.' });
  const request = { operation_id: randomUUID(), capture_id: summary.capture_id, expected_head: summary.review_head,
    reason: 'Real-source equipment assignment diagnostic; Agent proposal, not operator approval', register };
  let reviewed = await call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full', bas_equipment_review: request });
  assert.deepEqual(reviewed.bas_workflow.captures, workflow.captures);
  assert.deepEqual(reviewed.bas_math, originalMath); assert.deepEqual(reviewed.bas_point_lists, originalPoints);
  assert.deepEqual(reviewed.bas_equipment.register, register);
  assert.equal(reviewed.bas_equipment.review_origin, 'agent_proposal');
  const view = await basEquipmentView(reviewed.bas_workflow, summary.capture_id);
  assert.equal(view.assignments[0].included_equipment_ids.length, 14);
  assert.equal(view.assignments[0].applicability, 'system_once');
  assert.equal(view.assignments[0].installed_quantity, null);
  assert.deepEqual(await call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full', bas_equipment_review: request }), reviewed);
  assert.deepEqual(await call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full' }), reviewed);
  if (verifyDemand) {
    const calculationRequest = { capture_id: summary.capture_id, expected_equipment_head: reviewed.bas_equipment.review_head };
    const calculated = await call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full', bas_assignment_demand: calculationRequest });
    assert.deepEqual(calculated.bas_math, originalMath); assert.deepEqual(calculated.bas_point_lists, originalPoints);
    assert.deepEqual(calculated.bas_workflow.captures, workflow.captures);
    const derived = calculated.bas_assignment_demand.result.assignments[0];
    assert.equal(derived.replication_factor, 1); assert.equal(derived.included_equipment_ids.length, 14);
    assert.deepEqual(derived.rows.flatMap((r: any) => r.observations.map((o: any) => o.original)), matrix.rows.flatMap((r: any) => r.observations));
    assert.ok(derived.rows.every((r: any) => r.observations.every((o: any) => o.original.kind === 'attribute' ? o.assigned_value === null : o.assigned_value === o.original.value)));
    assert.deepEqual(await call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full', bas_assignment_demand: calculationRequest }), calculated);
    const { bas_assignment_demand: _calculation, ...recompiled } = calculated;
    assert.deepEqual(await call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full' }), recompiled);
    reviewed = recompiled;
    await call('compile_corpus_takeoff', { kind: 'bas_points', bas_assignment_demand: { ...calculationRequest, expected_equipment_head: '0'.repeat(64) } }, true);
    assert.deepEqual(session.basWorkflow, reviewed.bas_workflow);
  }
  const retained = structuredClone(session.basWorkflow);
  await call('compile_corpus_takeoff', { kind: 'bas_points', bas_equipment_review: { ...request, operation_id: randomUUID() } }, true);
  assert.deepEqual(session.basWorkflow, retained);
  const bad = structuredClone(request); bad.operation_id = randomUUID(); bad.expected_head = reviewed.bas_equipment.review_head;
  bad.register.equipment[0].bindings[0].member = 'CH-999';
  await call('compile_corpus_takeoff', { kind: 'bas_points', bas_equipment_review: bad }, true);
  assert.deepEqual(session.basWorkflow, retained);
  await call('compile_corpus_takeoff', { kind: 'hvac_equipment', bas_equipment_review: request }, true);
  assert.deepEqual(session.basWorkflow, retained);
  const file = path.join(out, 'reviewed.takeoff.json');
  const exported = await call('export_takeoff', { path: file });
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), exported);
  await call('load_plan', { path: path.resolve(pdf) });
  await call('import_takeoff', { path: file });
  assert.deepEqual(session.basWorkflow, retained);
  assert.deepEqual(await basEquipmentView(session.basWorkflow!, summary.capture_id), view);
  const removed = await call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full', bas_equipment_review: {
    ...request, operation_id: randomUUID(), expected_head: reviewed.bas_equipment.review_head,
    register: emptyBasEquipmentRegister(), reason: 'Withdraw diagnostic assignment without deleting earlier evidence or decision' } });
  assert.equal(removed.bas_workflow.equipment_events.length, 2);
  assert.deepEqual(removed.bas_workflow.equipment_events[0], retained!.equipment_events![0]);
  assert.deepEqual(removed.bas_workflow.captures, workflow.captures);
  if (verifyDemand) {
    assert.deepEqual(removed.bas_workflow.assignment_calculations, retained!.assignment_calculations);
    assert.equal(basAssignmentCalculationState(removed.bas_workflow, summary.capture_id).status, 'stale_dependencies');
  }
  assert.deepEqual(graph, originalGraph);
  report = { ok: true, source_sha256: truth.source_sha256, source_scheduled_members: 14,
    applicability: 'system_once', installed_quantity: null, legacy_compile_exact: true, point_result_exact: true,
    legacy_math_exact: true, graph_exact: true, replay_exact: true, raw_equipment_tables: capture.equipment_sources.tables.length,
    checks: ['public MCP typed/text parity', 'source-owned candidate lookup', 'explicit scope/register/assignment', 'retry', 'ordinary recompile',
      'stale/foreign/non-BAS rejection', 'export/reset/import', 'withdrawal retaining history', ...(verifyDemand ? ['public assigned-value calculation', 'source observation parity', 'system once not 14 times', 'calculation retry', 'stale calculation rejection', 'saved calculation retained after import/withdrawal'] : [])],
    workflow_bytes: Buffer.byteLength(JSON.stringify(retained)), elapsed_ms: Math.round(performance.now() - started),
    main_process_peak_rss_bytes: process.resourceUsage().maxRSS * 1024, project_complete: false,
    limits: `Explicit 4-GiB Node allowance and 600-s MCP compile deadline; default-heap/default-deadline safety not established. ${verifyDemand ? 'Assigned listed observations calculated; not unique physical requirements or field wiring.' : 'No demand adapter proof in this run.'} No new installed proof, equipment UI, approval or real addendum test in this diagnostic.` };
  writeFileSync(path.join(out, 'checks.json'), JSON.stringify(report, null, 2));
} finally { await client.close(); await server.close(); shutdownVectorGrid(); }
await writeJsonAndExit(report);
