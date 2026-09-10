import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../server.ts';
import { Session } from '../src/session.ts';
import { basWorkflowReplayMiddleware } from '../../web/vite.basAssignmentApi.js';
import { resolveTsxLoader } from '../../web/vite.corpusTakeoffApi.js';
import { prepareBasEvidenceBundle } from '../../web/src/lib/basEvidenceBundle.ts';
import { captureBasPoints } from '../../web/src/lib/basWorkflow.ts';
import { sha256Hex } from '../../web/src/lib/graphKeys.js';
import { replayBasWorkflowBatch, runBasEngineering } from '../src/basMath.ts';
import type { BasReplayRecord } from '../../web/src/lib/basWorkflowReplay.ts';
import { prepareBasWorkflowReplay, assertBasWorkflowReplayReceipt } from '../../web/src/lib/basWorkflowReplay.ts';
import { verifyBasWorkflowCalculations, basWorkflowReplayBatches, BAS_REPLAY_BATCH_LIMITS } from '../src/basWorkflowReplay.ts';
import { verifyBasWorkflow } from '../../web/src/lib/basWorkflow.ts';
import { basAssemblyCalculationFingerprint } from '../../web/src/lib/basAssemblyQuantityContract.ts';

async function retained() {
  // Previously reviewed real-source history with explicitly controlled hardware
  // declarations; not new automatic engineering interpretation or holdout input.
  return JSON.parse(await readFile(new URL('../../docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json', import.meta.url), 'utf8')).bas_workflow;
}

test('all retained historical assemblies and engineering checks replay without changing original history', async () => {
  const workflow = await retained(), before = structuredClone(workflow);
  const result = await verifyBasWorkflowCalculations(workflow);
  assert.equal(result.checked_records.assembly.length, 3); assert.equal(result.checked_records.engineering.length, 28);
  assert.equal(result.calculation_verification, 'verified_shared_python_replay'); assert.equal(result.project_complete, false);
  assert.deepEqual(await assertBasWorkflowReplayReceipt(workflow, result), result); assert.deepEqual(workflow, before);
  const missing = structuredClone(result); missing.checked_records.engineering.pop();
  await assert.rejects(assertBasWorkflowReplayReceipt(workflow, missing), /does not cover/);
  const changed = structuredClone(result); changed.workflow_sha256 = '0'.repeat(64);
  await assert.rejects(assertBasWorkflowReplayReceipt(workflow, changed), /does not cover/);
});

test('re-signed plausible assembly numbers pass lineage checks but must fail actual arithmetic replay', async () => {
  const workflow = await retained();
  const calculation = workflow.assembly_calculations.find((c: { result: { components: { status: string }[] } }) => c.result.components.some(row => row.status === 'calculated_declared_quantity'));
  assert.ok(calculation);
  const component = calculation.result.components.find((c: { status: string }) => c.status === 'calculated_declared_quantity');
  component.assigned_quantity += 1;
  const { calculation_id: _id, ...payload } = calculation;
  calculation.calculation_id = await basAssemblyCalculationFingerprint(payload);
  await verifyBasWorkflow(workflow);
  await assert.rejects(verifyBasWorkflowCalculations(workflow), /assembly result .* does not match/);
});

test('empty history is not a complete audit; cancellation/runtime failure produces no receipt', async () => {
  const empty = { schema_version: 'bas_workflow_v1', revision: 'point_captures_1', captures: [], current_capture_id: null };
  const result = await verifyBasWorkflowCalculations(empty);
  assert.equal(result.calculation_verification, 'no_saved_calculations'); assert.equal(result.project_complete, false);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(verifyBasWorkflowCalculations(empty, { signal: cancelled.signal }), /abort/i);
  await assert.rejects(verifyBasWorkflowCalculations(empty, { timeoutMs: 0 }), /timed out/);
  const workflow = await retained();
  await assert.rejects(verifyBasWorkflowCalculations(workflow, { python: '/missing/bas-python-runtime' }), /runtime unavailable/);
  const plan = await prepareBasWorkflowReplay(workflow), records = [];
  for await (const record of plan.records()) records.push(record);
  assert.equal(records.length, 31);
  assert.deepEqual(records.slice(0, 3).map(r => r.record_id), workflow.assembly_calculations.map((c: { calculation_id: string }) => c.calculation_id));
});

test('actual HTTP replay returns the exact shared receipt and rejects malformed/foreign requests', async () => {
  const workflow = await retained(), expected = await verifyBasWorkflowCalculations(workflow);
  const middleware = basWorkflowReplayMiddleware(resolveTsxLoader);
  const server = createServer((req, res) => { void middleware(req, res, () => { res.writeHead(404); res.end(); }); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/__ot/bas-workflow-replay`;
  const post = (body: string, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
  try {
    const response = await post(JSON.stringify({ workflow, request: {} }));
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), expected);
    assert.equal((await fetch(url)).status, 405);
    assert.equal((await post('{}', { Origin: 'https://foreign.invalid' })).status, 403);
    assert.equal((await post('{}', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await post('{}', { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await post('{')).status, 400);
    assert.equal((await post(JSON.stringify({ workflow: {}, request: { approve: true } }))).status, 422);
    assert.equal((await post(JSON.stringify({ padding: 'x'.repeat(32 * 1024 * 1024) }))).status, 413);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('public bundle replay is opt-in and no-calculation receipts cannot imply an audit or mutate Session', async () => {
  const bytes = new TextEncoder().encode('%PDF-controlled-source-bytes-only'), sha256 = await sha256Hex(bytes);
  const workflow = await captureBasPoints([{ source_id: `sha256:${sha256}`, sha256, byte_length: bytes.length, page_count: 1, names: ['controlled.pdf'] }],
    { schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1', scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [] });
  const session = new Session();
  const snapshot = () => structuredClone({ files: session.files, shapes: session.shapes, conditions: session.conditions, bas_workflow: session.basWorkflow });
  const before = snapshot();
  const bundle = await prepareBasEvidenceBundle({ schema: 'opentakeoff.takeoff_canvas.v1', bas_workflow: workflow }), chunks: Uint8Array[] = [];
  for await (const chunk of bundle.stream(async () => bytes)) chunks.push(chunk);
  const path = join(await mkdtemp(join(tmpdir(), 'bas-replay-public-')), 'controlled.otbas.zip');
  await writeFile(path, Buffer.concat(chunks));
  const server = buildServer(session), client = new Client({ name: 'workflow-replay-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  const call = async (args: Record<string, unknown>) => {
    const result = await client.callTool({ name: 'import_takeoff', arguments: { path, ...args } });
    return { error: !!result.isError, data: JSON.parse((result.content as Array<{ text: string }>)[0].text) };
  };
  try {
    const legacy = await call({ verify_evidence_bundle: true }); assert.equal(legacy.error, false);
    assert.equal(legacy.data.bas_evidence_bundle.calculation_verification, 'not_python_replayed');
    assert.equal('workflow_replay' in legacy.data.bas_evidence_bundle, false);
    const replay = await call({ verify_evidence_bundle: true, replay_calculations: true }); assert.equal(replay.error, false);
    assert.equal(replay.data.bas_evidence_bundle.calculation_verification, 'no_saved_calculations');
    assert.equal(replay.data.bas_evidence_bundle.restored, false);
    assert.deepEqual(replay.data.bas_evidence_bundle.workflow_replay, await verifyBasWorkflowCalculations(workflow));
    assert.equal((await call({ replay_calculations: true })).error, true);
    assert.equal((await call({ verify_evidence_bundle: false, replay_calculations: false })).error, true);
    assert.deepEqual(snapshot(), before);
    assert.throws(() => session.exportPayload(), /No plan loaded/);
  } finally { await client.close(); await server.close(); }
});

test('batch transport rejects oversize and cancellation without accepting partial records', async () => {
  await assert.rejects(replayBasWorkflowBatch([{ kind: 'engineering', record_id: 'a'.repeat(64), padding: 'x'.repeat(32 * 1024 * 1024) }] as unknown as BasReplayRecord[]), /input exceeds 32 MiB/);
  const cancel = new AbortController();
  const pending = replayBasWorkflowBatch([], { signal: cancel.signal }); cancel.abort();
  await assert.rejects(pending, /cancelled/);
  await assert.rejects(replayBasWorkflowBatch([], { timeoutMs: 1 }), /timed out/);
});

test('partitioning enforces exact encoded bytes and counts; real Python checks all records in each batch', async () => {
  const result = await runBasEngineering({ checks: [] });
  async function* records() { for (let i = 0; i < 1001; i++) yield { kind: 'engineering' as const, record_id: String(i).padStart(64, '0'), result }; }
  const lengths = [];
  for await (const batch of basWorkflowReplayBatches(records())) {
    assert.ok(Buffer.byteLength(JSON.stringify({ workflow_replay: { records: batch } })) <= BAS_REPLAY_BATCH_LIMITS.bytes);
    const replay = await replayBasWorkflowBatch(batch);
    assert.deepEqual(replay.checked_records.map(r => r.record_id), batch.map(r => r.record_id)); lengths.push(batch.length);
  }
  assert.deepEqual(lengths, [1000, 1]);
  // Controlled transport-only byte shapes, deliberately not valid engineering
  // payloads or evidence of large-project calculation coverage.
  const base = { kind: 'engineering', record_id: 'a'.repeat(64), padding: '' };
  const overhead = Buffer.byteLength(JSON.stringify({ workflow_replay: { records: [base] } }));
  const exact = { ...base, padding: 'x'.repeat(BAS_REPLAY_BATCH_LIMITS.bytes - overhead) } as unknown as BasReplayRecord;
  async function* sized() { yield exact; yield { kind: 'engineering' as const, record_id: 'b'.repeat(64), result }; }
  const sizes = [];
  for await (const batch of basWorkflowReplayBatches(sized())) sizes.push(Buffer.byteLength(JSON.stringify({ workflow_replay: { records: batch } })));
  assert.equal(sizes[0], BAS_REPLAY_BATCH_LIMITS.bytes); assert.equal(sizes.length, 2);
  async function* oversized() { yield { ...base, padding: `${(exact as unknown as { padding: string }).padding}x` } as unknown as BasReplayRecord; }
  await assert.rejects(async () => { for await (const _batch of basWorkflowReplayBatches(oversized())) assert.fail('Oversize batch yielded'); }, /size limit/);
});
