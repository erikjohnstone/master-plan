import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '../src/session.ts';
import { buildServer } from '../server.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { comparisonFixture } from '../../web/test/helpers/basRevisionComparisonFixture.ts';
import { uuid } from '../../web/test/helpers/basEngineeringFixture.ts';
import { runBasRevisionTransport } from '../src/basRevisionTransport.ts';
import { runBasRevisionOperation } from '../src/basRevisionOperations.ts';
import { readBasRevisionView, inspectBasRevisionVersions } from '../../web/src/lib/basRevisionView.ts';
import { basRevisionTransportResultSchema } from '../../web/src/lib/basRevisionTransportContract.ts';

test('bounded view retains every field/string unit, exact zero/null and safe own-property traversal', () => {
  const text = 'a'.repeat(255) + '😀' + 'b'.repeat(17000), value = { text, zero: 0, unknown: null, false: false, rows: Array.from({ length: 53 }, (_, n) => ({ row_id: `${n}`, label: `Row ${n}` })) };
  const first = readBasRevisionView(value, {});
  assert.equal(first.entries[0].preview_truncated, true); assert.equal(first.entries[0].size, text.length);
  assert.equal(first.entries[1].scalar_preview, 0); assert.equal(first.entries[2].scalar_preview, null); assert.equal(first.entries[3].scalar_preview, false);
  let reconstructed = '';
  for (let offset = 0; offset < text.length; offset += 256) reconstructed += readBasRevisionView(value, { path: ['text'], string_offset: offset, string_limit: 256 }).string_fragment;
  assert.equal(reconstructed, text);
  assert.equal(readBasRevisionView(value, { path: ['rows'], offset: 50, limit: 50 }).entries.length, 3);
  assert.equal(readBasRevisionView(value, { path: ['rows', 52, 'label'] }).string_fragment, 'Row 52');
  assert.equal(readBasRevisionView(value, { path: ['zero'] }).scalar, 0);
  for (const path of [['__proto__'], ['rows', '0'], ['rows', 54], ['text', 'length']]) assert.throws(() => readBasRevisionView(value, { path }), /owned/);
  assert.throws(() => readBasRevisionView(value, { limit: 51 }));
});

test('shared MCP transport compares once, pages/exports exact replay, atomically records and invalidates changed state', async () => {
  const f = await comparisonFixture({ ai: 4 }), session = new Session(); session.basWorkflow = f.workflow;
  const initial = structuredClone(f.workflow), call = (command: unknown, signal?: AbortSignal) => runBasRevisionTransport(session, command, signal);
  const inspect = await call({ action: 'inspect', source_set_id: f.request.before.source_set_id, query: { path: ['selected_basis', 'captures'] } });
  assert.equal(inspect.page!.entries.length, f.request.before.captures.length);
  assert.deepEqual(inspect.page, readBasRevisionView(await inspectBasRevisionVersions(f.workflow, f.request.before.source_set_id), { path: ['selected_basis', 'captures'] }));
  const expected = await runBasRevisionOperation(initial, { kind: 'compare', comparison: f.request }, 'agent_proposal');
  if (expected.kind !== 'compare') throw new Error('Expected compare');
  const comparison = await call({ action: 'run', operation: { kind: 'compare', comparison: f.request }, query: { path: ['report', 'rows'], limit: 1 } });
  assert.equal(comparison.page!.total, expected.report.rows.length); assert.equal(comparison.page!.entries.length, 1);
  assert.equal(comparison.expected_report_fingerprint, expected.expected_report_fingerprint);
  await assert.rejects(call({ action: 'read', view_id: inspect.view_id }), /replaced/);
  const detail = await call({ action: 'read', view_id: comparison.view_id, query: { path: ['report', 'rows', 0, 'quantities'] } });
  assert.deepEqual(detail.page, readBasRevisionView(expected, { path: ['report', 'rows', 0, 'quantities'] }));
  const dir = await mkdtemp(join(tmpdir(), 'bas-revision-public-')), path = join(dir, 'comparison.json');
  await call({ action: 'export', view_id: comparison.view_id, path });
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), expected);
  await assert.rejects(call({ action: 'export', view_id: comparison.view_id, path }), /exists/);
  await writeFile(path, 'Keep unrelated user data');
  await assert.rejects(call({ action: 'export', view_id: comparison.view_id, path }), /destroy/);
  assert.equal(await readFile(path, 'utf8'), 'Keep unrelated user data');
  await call({ action: 'export', view_id: comparison.view_id, path, overwrite: true });
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), expected);
  const review = { operation_id: uuid(998), comparison: f.request, expected_head: comparison.expected_head,
    expected_report_fingerprint: comparison.expected_report_fingerprint, name: 'Controlled transport revision', reviewer: 'Declared agent review', reason: 'Test controlled changed count, no approval' };
  await assert.rejects(call({ action: 'run', operation: { kind: 'record', review }, query: { path: ['absent'] } }), /owned/);
  assert.deepEqual(session.basWorkflow, initial);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(call({ action: 'run', operation: { kind: 'record', review } }, abort.signal)); assert.deepEqual(session.basWorkflow, initial);
  const recorded = await call({ action: 'run', operation: { kind: 'record', review } });
  assert.equal(session.basWorkflow!.revision_events!.length, 1); assert.equal(session.basWorkflow!.revision_events![0].origin, 'agent_proposal');
  assert.deepEqual(session.basWorkflow!.captures, initial.captures); assert.equal(recorded.approved, false);
  assert.equal((await call({ action: 'read', view_id: recorded.view_id, query: { path: ['event', 'origin'] } })).page!.string_fragment, 'agent_proposal');
  const saved = structuredClone(session.basWorkflow);
  const retry = await call({ action: 'run', operation: { kind: 'record', review } }); assert.equal(retry.event_id, recorded.event_id); assert.deepEqual(session.basWorkflow, saved);
  const replay = await call({ action: 'run', operation: { kind: 'read', event_id: recorded.event_id } });
  assert.equal(replay.report_verification, 'matches_saved_report');
  session.basWorkflow = structuredClone(session.basWorkflow);
  await assert.rejects(call({ action: 'read', view_id: replay.view_id }), /workspace changed/);
  await assert.rejects(call({ action: 'export', view_id: replay.view_id, path: join(dir, 'stale.json') }), /workspace changed/);
  await assert.rejects(readFile(join(dir, 'stale.json')), /ENOENT/);
});

test('actual registered public MCP revision command returns schema-validated bounded responses and proposal history', async () => {
  const f = await comparisonFixture(), session = new Session(); session.basWorkflow = f.workflow;
  const server = buildServer(session), client = new Client({ name: 'bas-revision-public-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  const call = async (command: unknown) => {
    const result = await client.callTool({ name: 'bas_drawing_review', arguments: { command: { kind: 'revision', command } } });
    assert.equal(result.isError, undefined, JSON.stringify(result));
    const data = JSON.parse((result.content as { text?: string }[]).find(c => c.text)!.text!);
    return basRevisionTransportResultSchema.parse(data.result.result);
  };
  try {
    const preview = await call({ action: 'run', operation: { kind: 'compare', comparison: f.request }, query: { path: ['report', 'rows'], limit: 2 } });
    assert.equal(preview.page!.entries.length, 2);
    const saved = await call({ action: 'run', operation: { kind: 'record', review: { operation_id: uuid(999), comparison: f.request,
      expected_head: preview.expected_head, expected_report_fingerprint: preview.expected_report_fingerprint,
      name: 'Public controlled comparison', reviewer: 'Declared reviewer', reason: 'Public shared path, controlled fixture' } } });
    assert.equal(saved.event_id, session.basWorkflow!.revision_events![0].event_id);
    assert.equal(saved.persistence, 'session_only_until_export'); assert.equal(saved.approved, false);
    const read = await call({ action: 'read', view_id: saved.view_id, query: { path: ['event', 'origin'] } }); assert.equal(read.page!.string_fragment, 'agent_proposal');
  } finally { await client.close(); await server.close(); }
});

test('in-flight cancellation/state replacement cannot record and expired views cannot be read', async () => {
  const f = await comparisonFixture(), session = new Session(); session.basWorkflow = f.workflow;
  const op = { kind: 'compare', comparison: f.request }, before = structuredClone(session.basWorkflow);
  const prepared = await runBasRevisionTransport(session, { action: 'run', operation: op });
  const review = { operation_id: uuid(996), comparison: f.request, expected_head: prepared.expected_head,
    expected_report_fingerprint: prepared.expected_report_fingerprint, name: 'Cancelled review', reviewer: 'Controlled reviewer', reason: 'Must not be saved' };
  const abort = new AbortController(), pending = runBasRevisionTransport(session, { action: 'run', operation: { kind: 'record', review } }, abort.signal);
  abort.abort(); await assert.rejects(pending); assert.deepEqual(session.basWorkflow, before);
  const raced = runBasRevisionTransport(session, { action: 'run', operation: { kind: 'record', review } });
  session.basWorkflow = structuredClone(session.basWorkflow); await assert.rejects(raced, /workspace changed/); assert.deepEqual(session.basWorkflow, before);
  const inspected = await runBasRevisionTransport(session, { action: 'inspect' }), now = Date.now;
  try {
    Date.now = () => now() + 16 * 60 * 1000;
    await assert.rejects(runBasRevisionTransport(session, { action: 'read', view_id: inspected.view_id }), /expired/);
  } finally { Date.now = now; }
});
