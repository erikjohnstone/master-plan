/** Actual MCP production compile/review/export/import, real development PDF.
 * These are explicit audit-fixture proposals, not approved operator decisions. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../server.ts';
import { Session } from '../src/session.ts';
import { basSequenceView, basReviewHead } from '../../web/src/lib/basReview.ts';
import { interpretBasSequences } from '../../web/src/lib/basSequenceReconciliation.ts';
import { shutdownVectorGrid } from '../../web/src/lib/vectorGridClient.ts';
import { writeJsonAndExit } from './cliJson.mjs';

const [pdf, outArg] = process.argv.slice(2);
assert.ok(pdf && outArg, 'Usage: real PDF and output directory');
const out = path.resolve(outArg);
mkdirSync(out, { recursive: true });
const previous = JSON.parse(readFileSync(new URL('../../docs/bas-production/evidence/point-workspace-compile.json', import.meta.url), 'utf8'));
const truth = JSON.parse(readFileSync(new URL('../../web/test/fixtures/bas-soo-monitor-cases.json', import.meta.url), 'utf8'));
const session = new Session(), server = buildServer(session);
const client = new Client({ name: 'bas-sequence-workflow-audit', version: '1' });
const [ct, st] = InMemoryTransport.createLinkedPair();
await server.connect(st); await client.connect(ct);
const started = performance.now();
async function call(name: string, args: Record<string, unknown>, error = false) {
  const res = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
  assert.equal(Boolean(res.isError), error, `${name}: ${JSON.stringify(res.content).slice(0, 1000)}`);
  const block = res.content[0]; assert.equal(block.type, 'text');
  const data = JSON.parse((block as { text: string }).text);
  if (!error) assert.deepEqual(res.structuredContent, data);
  return data;
}
let report;
try {
  await call('load_plan', { path: path.resolve(pdf) });
  const initial = await call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full' });
  const { bas_workflow: oldCapture, ...oldFields } = previous;
  const { bas_workflow: workflow, ...newFields } = initial;
  assert.deepEqual(newFields, { ...oldFields, path: null, export_path: null });
  assert.notEqual(workflow.current_capture_id, oldCapture.current_capture_id);
  assert.equal(workflow.captures[0].sources[0].sha256, truth.source_sha256);
  const source = workflow.captures[0].narrative_sources;
  assert.deepEqual(source, session.basSourcesForPipeline());
  const analysis = interpretBasSequences(source);
  const keyed = truth.reviewed_associations.find((r: any) => r.page === 8);
  const region = analysis.regions.find(r => r.page_id.endsWith(':p8') && r.title === truth.title)!;
  const matrix = workflow.captures[0].points.matrices.find((m: any) => m.page_id.endsWith(':p8'));
  const request = { operation_id: randomUUID(), capture_id: workflow.current_capture_id, expected_head: null,
    action: { kind: 'upsert', association: { region_id: region.region_id, matrix_id: matrix.matrix_id,
      reason: 'Independent original-drawing association used by the MCP diagnostic; not a takeoff approval.',
      equipment_references: [{ tag: keyed.reference_tag, span_ids: [`sha256:${truth.source_sha256}:p8:s${keyed.reference_span_index}`],
        scope: { building: null, level: null, system: null, phase: null } }] } } };
  const reviewed = await call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full', bas_review: request });
  assert.deepEqual(reviewed.bas_workflow.captures, workflow.captures);
  assert.equal(reviewed.bas_workflow.review_events.length, 1);
  assert.equal(reviewed.bas_workflow.review_events[0].origin, 'agent_proposal');
  const comparison = await basSequenceView(reviewed.bas_workflow, request.capture_id);
  assert.deepEqual(comparison.comparisons[0].requirements.map(r => r.status), ['listed', 'listed', 'not_listed_in_selected_matrix']);
  const retried = await call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full', bas_review: request });
  assert.deepEqual(retried, reviewed);
  const repeated = await call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full' });
  assert.deepEqual(repeated.bas_workflow, reviewed.bas_workflow, 'Ordinary recompile must return retained review history');
  const retained = structuredClone(session.basWorkflow);
  const stale = await call('compile_corpus_takeoff', { kind: 'bas_points', bas_review: { ...request, operation_id: randomUUID() } }, true);
  assert.match(JSON.stringify(stale), /changed since/);
  assert.deepEqual(session.basWorkflow, retained);
  const bad = structuredClone(request); bad.operation_id = randomUUID();
  (bad as any).expected_head = basReviewHead(retained!, request.capture_id);
  bad.action.association.equipment_references[0].tag = 'UNSUPPORTED-REFERENCE';
  await call('compile_corpus_takeoff', { kind: 'bas_points', bas_review: bad }, true);
  assert.deepEqual(session.basWorkflow, retained, 'Invalid source reference cannot mutate review history');
  await call('compile_corpus_takeoff', { kind: 'hvac_equipment', bas_review: request }, true);
  assert.deepEqual(session.basWorkflow, retained);
  const exported = await call('export_takeoff', { path: path.join(out, 'reviewed.takeoff.json') });
  assert.deepEqual(JSON.parse(readFileSync(path.join(out, 'reviewed.takeoff.json'), 'utf8')), exported);
  assert.deepEqual(exported.bas_workflow, retained);
  await call('load_plan', { path: path.resolve(pdf) });
  assert.equal(session.basWorkflow, null);
  await call('import_takeoff', { path: path.join(out, 'reviewed.takeoff.json') });
  assert.deepEqual(session.basWorkflow, retained);
  assert.deepEqual(await basSequenceView(session.basWorkflow!, request.capture_id), comparison);
  const removed = await call('compile_corpus_takeoff', { kind: 'bas_points', detail: 'full', bas_review: {
    operation_id: randomUUID(), capture_id: request.capture_id, expected_head: basReviewHead(retained!, request.capture_id),
    action: { kind: 'remove', region_id: region.region_id, matrix_id: matrix.matrix_id, reason: 'Withdraw diagnostic association, retaining previous evidence' } } });
  assert.equal(removed.bas_workflow.review_events.length, 2);
  assert.deepEqual(removed.bas_workflow.captures, workflow.captures);
  assert.deepEqual((await basSequenceView(removed.bas_workflow, request.capture_id)).comparisons, []);
  writeFileSync(path.join(out, 'comparison.json'), JSON.stringify(comparison, null, 2));
  report = { ok: true, source_sha256: truth.source_sha256, legacy_compile_exact: true,
    retained_source_exact: true, replay_exact: true, listed: 2, not_listed: 1,
    checks: ['actual MCP typed/text parity', 'agent proposal/create', 'idempotent retry', 'ordinary recompile retains history', 'stale request rejection', 'invalid source rejection', 'non-BAS review rejection', 'actual export', 'reset/import exact history and comparison', 'removal retains evidence'],
    elapsed_ms: Math.round(performance.now() - started), main_process_peak_rss_bytes: process.resourceUsage().maxRSS * 1024,
    workflow_bytes: Buffer.byteLength(JSON.stringify(retained)), project_complete: false };
  writeFileSync(path.join(out, 'checks.json'), JSON.stringify(report, null, 2));
} finally { await client.close(); await server.close(); shutdownVectorGrid(); }
await writeJsonAndExit(report);
