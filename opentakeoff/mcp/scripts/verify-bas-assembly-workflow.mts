/** Actual original-PDF/public-MCP journey. Expected source facts are keyed
 * independently; applicability, conflicts and edits are disclosed test inputs. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Session } from '../src/session.ts';
import { buildServer } from '../server.ts';
import { compileTakeoff } from '../../web/src/lib/compileTakeoff.mjs';
import { emptyBasEquipmentRegister } from '../../web/src/lib/basEquipmentRegister.ts';
import { emptyBasAssemblyRegister } from '../../web/src/lib/basAssemblyRegister.ts';
import { basAssemblyView, basAssemblyCalculationState } from '../../web/src/lib/basAssemblyReview.ts';
import { shutdownVectorGrid } from '../../web/src/lib/vectorGridClient.ts';
import { writeJsonAndExit } from './cliJson.mjs';

const [pdf, directory] = process.argv.slice(2);
const upgradeRule = process.env.OT_BAS_COMPONENT_RULE === '2';
assert.ok(pdf && directory, 'Usage: original Fort Sam development PDF and new output directory');
const out = resolve(directory); mkdirSync(out, { recursive: true });
const truth = JSON.parse(readFileSync(new URL('../../web/test/fixtures/bas-requirement-source-cases.json', import.meta.url), 'utf8'));
const session = new Session(), server = buildServer(session), client = new Client({ name: 'bas-assembly-verification', version: '1' });
const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
const started = performance.now(); let lastPhase = 'start';
const phase = (name: string) => { lastPhase = name; console.error(JSON.stringify({ phase: name,
  elapsed_ms: Math.round(performance.now() - started), rss_bytes: process.memoryUsage().rss })); };
async function call(name: string, args: Record<string, unknown>, expectedError = false) {
  phase(`${name}:start`);
  const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 600000 });
  assert.equal(Boolean(response.isError), expectedError, JSON.stringify(response.content).slice(0, 1500));
  const block = response.content[0]; assert.equal(block.type, 'text');
  const data = JSON.parse((block as { text: string }).text);
  if (!expectedError) assert.deepEqual(response.structuredContent, data);
  phase(`${name}:complete`); return data;
}
const compile = (options: Record<string, unknown> = {}, expectedError = false) => call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full', ...options }, expectedError);
let report;
try {
  await call('load_plan', { path: resolve(pdf) });
  phase('graph:start'); const graph = await session.graphForPipeline(); phase('graph:ready');
  const originalGraph = structuredClone(graph);
  const initial = await compile();
  const { bas_workflow: workflow, bas_equipment: equipmentSummary, bas_assemblies: sourceSummary,
    bas_math: math, bas_point_lists: points, path: _path, export_path: _export, ...legacy } = initial;
  assert.deepEqual(legacy, compileTakeoff(session, graph, 'bas_points'));
  const capture = workflow.captures[0]; assert.equal(capture.sources[0].sha256, truth.source_sha256);
  assert.deepEqual(capture.narrative_sources, session.basSourcesForPipeline());
  const equipment = emptyBasEquipmentRegister(), scopeId = randomUUID();
  const pageId = `sha256:${truth.source_sha256}:p8`, captionId = `${pageId}:s${truth.scope_evidence.diagram_caption_span}`;
  equipment.scopes.push({ scope_id: scopeId, building: null, level: null, system: 'Reviewed DOAS pair', phase: null,
    source_span_ids: [captionId], reason: 'Controlled applicability from independently reviewed M-512 DOAS 1&2 caption, not installation proof' });
  for (const tag of ['DOAS-1', 'DOAS-2']) {
    const occurrences = equipmentSummary.occurrences.filter((o: any) => o.named_members?.includes(tag)
      && o.page_id === `sha256:${truth.source_sha256}:p${truth.scope_evidence.schedule_page}`);
    assert.equal(occurrences.length, 1, tag);
    assert.equal(occurrences[0].page_id, `sha256:${truth.source_sha256}:p9`);
    const occurrence = occurrences[0], sourceTable = capture.equipment_sources.tables[occurrence.table_index];
    const span = capture.narrative_sources.pages.find((p: any) => p.page_number === truth.scope_evidence.schedule_page).spans
      .find((s: any) => s.source_index === truth.scope_evidence.scheduled_members.find((m: any) => m.tag === tag).span);
    const cell = sourceTable.rows[occurrence.row_index].cells[occurrence.mark_columns[0]];
    assert.equal(cell.text, tag);
    assert.ok(span.bbox_px[0] >= cell.bbox[0] && span.bbox_px[1] >= cell.bbox[1] && span.bbox_px[2] <= cell.bbox[2] && span.bbox_px[3] <= cell.bbox[3]);
    equipment.equipment.push({ equipment_id: randomUUID(), scope_id: scopeId, tag,
      bindings: [{ occurrence_id: occurrences[0].occurrence_id, member: tag }], reason: 'Bind the independently reviewed schedule member' });
  }
  const registered = await compile({ bas_equipment_review: { operation_id: randomUUID(), capture_id: capture.capture_id,
    expected_head: null, reason: 'Controlled source-backed equipment scope', register: equipment } });
  const sources = sourceSummary.source_requirements.filter((r: any) => r.page_id === pageId);
  const sourceChecks = [
    { kind: 'variable_frequency_drive', role: 'SUPPLY', span: 174, label: 'Supply fan VFD' },
    { kind: 'variable_frequency_drive', role: 'EXHAUST', span: 174, label: 'Exhaust fan VFD' },
    { kind: 'onboard_controller', role: null, span: 188, label: 'Onboard controller' },
  ];
  const assembly = emptyBasAssemblyRegister();
  for (const fact of sourceChecks) {
    const matches = sources.filter((r: any) => r.component_kind === fact.kind && r.fan_role === fact.role);
    assert.equal(matches.length, 1, fact.label); assert.ok(matches[0].source_span_ids.includes(`${pageId}:s${fact.span}`));
    assembly.components.push({ component_id: randomUUID(), scope_id: scopeId, equipment_ids: equipment.equipment.map(e => e.equipment_id),
      excluded_equipment_ids: [], member_exclusion_reason: null, label: fact.label,
      component_kind: fact.kind as 'variable_frequency_drive' | 'onboard_controller', source_requirement_ids: [matches[0].requirement_id], source_span_ids: [captionId],
      quantity: { value: 1, basis: 'per_equipment', origin: 'source_declaration', reason: 'One explicit component per reviewed DOAS member; fan roles stay distinct' },
      lifecycle: 'unknown', disposition: 'included', exclusion_reason: null,
      condition: { status: 'unconditional', statement: null, source_span_ids: [captionId], reason: 'Controlled applicability of the unconditional declaration' },
      responsibility_claims: [], responsibility_resolutions: [], reason: `Reviewed ${fact.label}; no installed or field-wiring inference` });
  }
  const reviewRequest = { operation_id: randomUUID(), capture_id: capture.capture_id, expected_head: null,
    expected_equipment_head: registered.bas_equipment.review_head, register: assembly, reason: 'Controlled source-backed assembly proposal for the reviewed pair' };
  let reviewed = await compile({ bas_assembly_review: reviewRequest });
  assert.equal(reviewed.bas_assemblies.review_origin, 'agent_proposal');
  assert.deepEqual(reviewed.bas_workflow.captures, workflow.captures);
  assert.deepEqual(reviewed.bas_assemblies.register, assembly);
  const view = await basAssemblyView(reviewed.bas_workflow, capture.capture_id);
  const responsibilities = view.components.find(c => c.record.label === 'Onboard controller')!.responsibilities;
  assert.equal(responsibilities.find(r => r.activity === 'furnish')!.assignment, 'factory_furnished');
  assert.ok(responsibilities.filter(r => r.activity !== 'furnish').every(r => r.assignment === 'unknown'));
  assert.deepEqual(await compile({ bas_assembly_review: reviewRequest }), reviewed);
  const calculationRequest = { capture_id: capture.capture_id, expected_equipment_head: registered.bas_equipment.review_head,
    expected_assembly_head: reviewed.bas_assemblies.review_head };
  const calculated = await compile({ bas_assembly_quantities: calculationRequest });
  assert.deepEqual(calculated.bas_assembly_quantities.result.components.map((c: any) => c.assigned_quantity), [2, 2, 2]);
  assert.equal(calculated.bas_assembly_quantities.result.unique_physical_total, null);
  assert.deepEqual(calculated.bas_math, math); assert.deepEqual(calculated.bas_point_lists, points);
  assert.deepEqual(calculated.bas_workflow.captures, workflow.captures);
  assert.deepEqual(await compile({ bas_assembly_quantities: calculationRequest }), calculated);
  const { bas_assembly_quantities: _calculation, ...replayed } = calculated;
  assert.deepEqual(await compile(), replayed);
  const retained = structuredClone(session.basWorkflow);
  await compile({ bas_assembly_quantities: { ...calculationRequest, expected_assembly_head: '0'.repeat(64) } }, true);
  assert.deepEqual(session.basWorkflow, retained);
  const forged = structuredClone(assembly); forged.components[0].quantity.value = 20;
  await compile({ bas_assembly_review: { ...reviewRequest, operation_id: randomUUID(), expected_head: reviewed.bas_assemblies.review_head, register: forged } }, true);
  assert.deepEqual(session.basWorkflow, retained);
  const file = resolve(out, 'reviewed.takeoff.json');
  const exported = await call('export_takeoff', { path: file }); assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), exported);
  await call('load_plan', { path: resolve(pdf) }); await call('import_takeoff', { path: file });
  assert.deepEqual(session.basWorkflow, retained);
  assert.deepEqual(await basAssemblyView(session.basWorkflow!, capture.capture_id), view);
  const edited = structuredClone(assembly); edited.components[0].excluded_equipment_ids = [equipment.equipment[1].equipment_id];
  edited.components[0].member_exclusion_reason = 'Controlled member exception, not a drawing change';
  reviewed = await compile({ bas_assembly_review: { ...reviewRequest, operation_id: randomUUID(), expected_head: calculationRequest.expected_assembly_head,
    register: edited, reason: 'Controlled source-preserving component exception' } });
  assert.equal(basAssemblyCalculationState(reviewed.bas_workflow, capture.capture_id).status, 'stale_dependencies');
  assert.deepEqual(reviewed.bas_workflow.assembly_calculations, retained!.assembly_calculations);
  let recomputed = await compile({ bas_assembly_quantities: { ...calculationRequest, expected_assembly_head: reviewed.bas_assemblies.review_head } });
  assert.deepEqual(recomputed.bas_assembly_quantities.result.components.map((c: any) => c.assigned_quantity), [1, 2, 2]);
  if (upgradeRule) {
    const old = structuredClone(recomputed);
    const upgraded = await compile({ bas_assembly_review: { ...reviewRequest, operation_id: randomUUID(), expected_head: recomputed.bas_assemblies.review_head,
      register: { ...edited, source_rule_version: 'explicit_component_declarations_2' },
      reason: 'Explicit rule transition; preserve old DOAS applicability and do not infer VAV installations' } });
    assert.deepEqual(upgraded.bas_workflow.assembly_events.slice(0, -1), old.bas_workflow.assembly_events);
    assert.deepEqual(upgraded.bas_workflow.assembly_calculations, old.bas_workflow.assembly_calculations);
    assert.equal(basAssemblyCalculationState(upgraded.bas_workflow, capture.capture_id).status, 'stale_dependencies');
    const list = upgraded.bas_assemblies.source_requirements.filter((c: any) => c.component_role);
    const fact = truth.component_cases.find((c: any) => c.case_id === 'vav-explicit-components-not-actuator-or-io-inference');
    assert.deepEqual(list.map((c: any) => c.component_role), ['terminal_equipment_control', 'dual_technology_occupancy', 'downstream_static_pressure', 'primary_modulating_supply_air']);
    for (const item of list) {
      assert.equal(item.page_id, `sha256:${truth.source_sha256}:p${fact.page}`);
      assert.deepEqual(item.source_span_ids, fact.source_spans.map((i: number) => `${item.page_id}:s${i}`));
      assert.equal(item.declared_quantity, 1);
    }
    recomputed = await compile({ bas_assembly_quantities: { ...calculationRequest, expected_assembly_head: upgraded.bas_assemblies.review_head } });
    assert.equal(recomputed.bas_assembly_quantities.result.source_rule_version, 'explicit_component_declarations_2');
    assert.deepEqual(recomputed.bas_assembly_quantities.result.components, old.bas_assembly_quantities.result.components);
    assert.deepEqual(recomputed.bas_workflow.captures, old.bas_workflow.captures);
    assert.deepEqual(recomputed.bas_math, math); assert.deepEqual(recomputed.bas_point_lists, points);
    const upgradedFile = resolve(out, 'upgraded.takeoff.json');
    await call('export_takeoff', { path: upgradedFile });
    const retainedV2 = structuredClone(session.basWorkflow);
    await call('load_plan', { path: resolve(pdf) }); await call('import_takeoff', { path: upgradedFile });
    assert.deepEqual(session.basWorkflow, retainedV2);
  }
  const withdrawn = await compile({ bas_equipment_review: { operation_id: randomUUID(), capture_id: capture.capture_id,
    expected_head: registered.bas_equipment.review_head, register: emptyBasEquipmentRegister(), reason: 'Controlled full equipment withdrawal; preserve all assembly evidence' } });
  assert.equal(withdrawn.bas_assemblies.dependency_status, 'stale_dependencies');
  assert.deepEqual(withdrawn.bas_workflow.assembly_calculations, recomputed.bas_workflow.assembly_calculations);
  assert.equal((await basAssemblyView(withdrawn.bas_workflow, capture.capture_id)).components.length, 3);
  await compile({ bas_assembly_quantities: { ...calculationRequest, expected_equipment_head: withdrawn.bas_equipment.review_head,
    expected_assembly_head: withdrawn.bas_assemblies.review_head } }, true);
  assert.deepEqual(session.basWorkflow, withdrawn.bas_workflow);
  await call('export_takeoff', { path: resolve(out, 'withdrawn.takeoff.json') });
  assert.deepEqual(graph, originalGraph);
  report = { ok: true, source_sha256: truth.source_sha256, selected_members: ['DOAS-1', 'DOAS-2'], components: 3,
    ...(upgradeRule ? { explicit_rule_upgrade: true, new_source_candidates: 4, newly_assigned_components: 0 } : {}),
    assigned_contributions: [2, 2, 2], installed_quantity: null, graph_exact: true, legacy_compile_exact: true,
    legacy_math_exact: true, point_result_exact: true, replay_exact: true,
    checks: ['actual PDF/public typed and text output parity', 'independently keyed declaration spans and schedule members',
      'source-owned equipment and assembly proposals', 'distinct VFD roles', 'factory furnish only', 'shared Python quantities',
      'retry/replay', 'forged source quantity and stale head rejection', 'export/reset/import', 'exception and retained stale result',
      'equipment withdrawal retains readable history'],
    elapsed_ms: Math.round(performance.now() - started), main_process_peak_rss_bytes: process.resourceUsage().maxRSS * 1024,
    node_heap_limit_bytes: getHeapStatistics().heap_size_limit, workflow_bytes: Buffer.byteLength(JSON.stringify(session.basWorkflow)),
    limits: '600-second diagnostic tool deadline; heap limit recorded, not assumed. Controlled scope/exception decisions, not automatic applicability, installed count, commissioning or full-goal completion.' };
  writeFileSync(resolve(out, 'checks.json'), JSON.stringify(report, null, 2));
} catch (error) {
  writeFileSync(resolve(out, 'checks.json'), JSON.stringify({ ok: false, phase: lastPhase, error: String(error) }, null, 2)); throw error;
} finally { await client.close(); await server.close(); shutdownVectorGrid(); }
await writeJsonAndExit(report);
