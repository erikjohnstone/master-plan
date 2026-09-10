import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Session } from '../src/session.ts';
import { buildServer } from '../server.ts';
import { runBasIssueTransport } from '../src/basIssueTransport.ts';
import { engineeringFixture, uuid } from '../../web/test/helpers/basEngineeringFixture.ts';
import { inspectBasIssueReview, readBasIssueDecision } from '../../web/src/lib/basIssueReview.ts';
import { applyBasEquipmentReview } from '../../web/src/lib/basEquipmentReview.ts';
import { basIssueTransportResultSchema } from '../../web/src/lib/basIssueTransportContract.ts';
import { readBasRevisionView } from '../../web/src/lib/basRevisionView.ts';
import { verifyBasWorkflow } from '../../web/src/lib/basWorkflow.ts';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';

async function fixture() {
  const f = await engineeringFixture(), register = structuredClone(f.equipment); register.scopes[0].building = '';
  const workflow = await applyBasEquipmentReview(f.workflow, { operation_id: uuid(100), capture_id: f.workflow.current_capture_id,
    expected_head: f.workflow.equipment_events!.at(-1)!.event_id, reason: 'Controlled unknown building',
    register: { ...register, scopes: register.scopes.map(s => ({ ...s, building: null })) } }, 'operator_input');
  const session = new Session(); session.basWorkflow = workflow;
  const inspect = await runBasIssueTransport(session, { action: 'inspect' });
  const shared = await inspectBasIssueReview(workflow, workflow.current_capture_id!);
  const finding = shared.project_review.issues.find(i => i.code === 'scope_partly_unknown')!; assert.ok(finding);
  const request = { operation_id: uuid(101), capture_id: inspect.capture_id, expected_head: inspect.head, expected_basis: inspect.basis,
    reviewer: 'Controlled self-declared reviewer', reason: 'Correct the controlled missing scope',
    action: { kind: 'begin_correction' as const, issue_key: finding.issue_key, occurrence_id: finding.occurrence_id } };
  return { f, session, inspect, shared, finding, request };
}

test('bounded issue transport retains original findings, pages/exports exact results and never waives blockers', async () => {
  const { session, inspect, shared, request } = await fixture(), initial = structuredClone(session.basWorkflow);
  const call = (command: unknown) => runBasIssueTransport(session, command);
  assert.equal(inspect.verification, 'current_findings_history_lineage_only');
  assert.deepEqual((await call({ action: 'read', view_id: inspect.view_id, query: { path: ['project_review', 'issues'], limit: 1 } })).page,
    readBasRevisionView(shared, { path: ['project_review', 'issues'], limit: 1 }));
  await assert.rejects(call({ action: 'record', request, query: { path: ['missing'] } }), /owned/);
  assert.deepEqual(session.basWorkflow, initial);
  const recorded = await call({ action: 'record', request });
  assert.equal(recorded.approved, false); assert.equal(recorded.project_complete, false);
  assert.equal(session.basWorkflow!.issue_events![0].origin, 'agent_proposal');
  assert.deepEqual(session.basWorkflow!.captures, initial!.captures);
  assert.deepEqual((await inspectBasIssueReview(session.basWorkflow, request.capture_id)).project_review, shared.project_review);
  await assert.rejects(call({ action: 'read', view_id: inspect.view_id }), /replaced/);
  const after = structuredClone(session.basWorkflow);
  assert.equal((await call({ action: 'record', request })).event_id, recorded.event_id);
  assert.deepEqual(session.basWorkflow, after);
  const replay = await call({ action: 'replay', event_id: recorded.event_id });
  assert.equal(replay.verification, 'shared_projection_replayed');
  const expected = await readBasIssueDecision(after, recorded.event_id!);
  const dir = await mkdtemp(join(tmpdir(), 'bas-issues-public-')), path = join(dir, 'issue.json');
  await call({ action: 'export', view_id: replay.view_id, path });
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), expected);
  await writeFile(path, 'Unrelated user data');
  await assert.rejects(call({ action: 'export', view_id: replay.view_id, path }), /destroy|exists/);
  assert.equal(await readFile(path, 'utf8'), 'Unrelated user data');
  await call({ action: 'export', view_id: replay.view_id, path, overwrite: true });
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), expected);
});

test('public issue correction, absence, canonical reopen and reappearance preserve the original observation', async () => {
  const { session, request, finding } = await fixture();
  const observed = await runBasIssueTransport(session, { action: 'record', request });
  const change = async (building: string | null, n: number) => {
    const w = session.basWorkflow!, register = structuredClone(w.equipment_events!.at(-1)!.register);
    register.scopes[0].building = building;
    session.basWorkflow = await applyBasEquipmentReview(w, { operation_id: uuid(n), capture_id: w.current_capture_id,
      expected_head: w.equipment_events!.at(-1)!.event_id, register, reason: 'Controlled actual scope edit' }, 'operator_input');
  };
  await change('A', 102);
  const current = await runBasIssueTransport(session, { action: 'inspect', query: { path: ['decisions', 0, 'state'] } });
  assert.equal(current.page!.string_fragment, 'not_reported_needs_review');
  const absent = await runBasIssueTransport(session, { action: 'record', request: { ...request, operation_id: uuid(103),
    expected_head: current.head, expected_basis: current.basis, action: { kind: 'record_not_reported', observation_id: observed.event_id } } });
  session.basWorkflow = await verifyBasWorkflow(JSON.parse(canonicalBasJson(session.basWorkflow)));
  const replay = await runBasIssueTransport(session, { action: 'replay', event_id: absent.event_id });
  assert.deepEqual((await runBasIssueTransport(session, { action: 'read', view_id: replay.view_id, query: { path: ['original_finding'] } })).page,
    readBasRevisionView({ original_finding: finding }, { path: ['original_finding'] }));
  await change(null, 104);
  const reopened = await runBasIssueTransport(session, { action: 'inspect', query: { path: ['decisions', 0, 'state'] } });
  assert.equal(reopened.page!.string_fragment, 'reopened');
  const withdrawn = await runBasIssueTransport(session, { action: 'record', request: { ...request, operation_id: uuid(105),
    expected_head: reopened.head, expected_basis: reopened.basis, action: { kind: 'withdraw', decision_id: absent.event_id } } });
  assert.equal(withdrawn.approved, false); assert.equal(session.basWorkflow!.issue_events!.length, 3);
});

test('cancel, caller mutation, stale state, invalid actions, expired/replaced/cross-session views cannot adopt writes', async () => {
  const { session, request, inspect } = await fixture(), initial = structuredClone(session.basWorkflow);
  const abort = new AbortController(), pending = runBasIssueTransport(session, { action: 'record', request }, abort.signal);
  abort.abort(); await assert.rejects(pending, /abort/i); assert.deepEqual(session.basWorkflow, initial);
  const raced = runBasIssueTransport(session, { action: 'record', request });
  session.basWorkflow = structuredClone(session.basWorkflow); await assert.rejects(raced, /workspace changed/);
  assert.deepEqual(session.basWorkflow, initial);
  await assert.rejects(runBasIssueTransport(session, { action: 'read', view_id: inspect.view_id }), /workspace changed/);
  for (const patch of [{ approved: true }, { origin: 'operator_input' }, { expected_head: '0'.repeat(64) },
    { action: { ...request.action, occurrence_id: '0'.repeat(64) } }, { reason: '' }]) {
    await assert.rejects(runBasIssueTransport(session, { action: 'record', request: { ...request, ...patch } }));
    assert.deepEqual(session.basWorkflow, initial);
  }
  const view = await runBasIssueTransport(session, { action: 'inspect' }), other = new Session(); other.basWorkflow = session.basWorkflow;
  await assert.rejects(runBasIssueTransport(other, { action: 'read', view_id: view.view_id }), /expired|replaced/);
  const now = Date.now;
  try { Date.now = () => now() + 16 * 60 * 1000;
    await assert.rejects(runBasIssueTransport(session, { action: 'read', view_id: view.view_id }), /expired/);
  } finally { Date.now = now; }
  const ownedRequest = structuredClone(request), owned = runBasIssueTransport(session, { action: 'record', request: ownedRequest });
  ownedRequest.reason = 'Changed during await'; await owned;
  assert.equal(session.basWorkflow!.issue_events![0].reason, request.reason);
});

test('actual registered MCP tool returns validated bounded proposal history, not raw workflow payloads', async () => {
  const { session, request } = await fixture(), server = buildServer(session);
  const client = new Client({ name: 'bas-issue-public-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  try {
    const result = await client.callTool({ name: 'bas_issue_review', arguments: { command: { action: 'record', request } } });
    assert.equal(result.isError, undefined, JSON.stringify(result));
    const data = JSON.parse((result.content as { text?: string }[]).find(c => c.text)!.text!);
    const checked = basIssueTransportResultSchema.parse(data.result);
    assert.equal(checked.event_id, session.basWorkflow!.issue_events![0].event_id);
    assert.equal(checked.persistence, 'session_only_until_export');
    assert.ok(JSON.stringify(checked).length < 20000);
    const invalid = await client.callTool({ name: 'bas_issue_review', arguments: { command: { action: 'record', request: { ...request, approved: true } } } });
    assert.equal(invalid.isError, true); assert.equal(session.basWorkflow!.issue_events!.length, 1);
  } finally { await client.close(); await server.close(); }
});
