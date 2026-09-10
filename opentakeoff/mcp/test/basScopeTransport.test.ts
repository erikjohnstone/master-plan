/** Public Session/registered-tool controls; fixture judgments are not PDF truth. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Session } from '../src/session.ts';
import { buildServer } from '../server.ts';
import { runBasScopeTransport } from '../src/basScopeTransport.ts';
import { scopeFixture, scopeRequest } from '../../web/test/helpers/basScopeFixture.ts';
import { engineeringFixture, uuid } from '../../web/test/helpers/basEngineeringFixture.ts';
import { addRevisionSourceSet } from '../../web/test/helpers/basRevisionFixture.ts';
import { catalogBasScope, prepareBasScopeCoverage } from '../../web/src/lib/basScopeCatalog.ts';
import { readBasScopeDecision } from '../../web/src/lib/basScopeReview.ts';
import { basScopeTransportResultSchema } from '../../web/src/lib/basScopeTransportContract.ts';
import { readBasRevisionView } from '../../web/src/lib/basRevisionView.ts';
import { applyBasEngineeringReview } from '../src/basEngineeringReview.ts';
import { basProjectReview } from '../../web/src/lib/basProjectReview.ts';
import { verifyBasWorkflow } from '../../web/src/lib/basWorkflow.ts';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';

test('catalog/preview/prepare and bounded complete exports equal shared output without mutating the project', async () => {
  const f = await scopeFixture(), session = new Session(); session.basWorkflow = f.workflow;
  const call = (command: unknown) => runBasScopeTransport(session, command), before = structuredClone(f.workflow);
  const catalog = await call({ action: 'catalog', source_set_id: f.basis.source_set_id, query: { path: ['targets'], limit: 2 } });
  const shared = await catalogBasScope(f.workflow, { source_set_id: f.basis.source_set_id });
  assert.deepEqual(catalog.page, readBasRevisionView(shared, { path: ['targets'], limit: 2 }));
  assert.equal(catalog.verification, 'retained_inventory_history_lineage_only');
  const preview = await call({ action: 'preview', specification: f.specification, query: { path: ['claims'] } });
  assert.equal(preview.page!.total, 1); assert.equal(preview.approved, false);
  const request = { specification: f.specification, claim: f.coverage.claim, unit: f.coverage.unit };
  const prepared = await call({ action: 'prepare_coverage', request, query: { path: ['source', 'spans'], limit: 1 } });
  const expected = await prepareBasScopeCoverage(f.workflow, request);
  assert.deepEqual(prepared.page, readBasRevisionView(expected, { path: ['source', 'spans'], limit: 1 }));
  const dir = await mkdtemp(join(tmpdir(), 'bas-scope-public-')), path = join(dir, 'scope.json');
  await call({ action: 'export', view_id: prepared.view_id, path });
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), expected);
  await writeFile(path, 'Unrelated user data');
  await assert.rejects(call({ action: 'export', view_id: prepared.view_id, path }), /destroy|exists/);
  assert.equal(await readFile(path, 'utf8'), 'Unrelated user data');
  await call({ action: 'export', view_id: prepared.view_id, path, overwrite: true });
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), expected);
  assert.deepEqual(session.basWorkflow, before);
});

test('record/retry/replay/withdrawal preserve original evidence and independent findings through canonical restore', async () => {
  const f = await scopeFixture(), session = new Session(); session.basWorkflow = f.workflow;
  const before = await basProjectReview(f.workflow, f.workflow.current_capture_id!), request = scopeRequest(f.workflow, 730, f.coverage);
  const record = await runBasScopeTransport(session, { action: 'record', request });
  assert.equal(record.verification, 'shared_action_validated'); assert.equal(record.persistence, 'session_only_until_export');
  assert.equal(session.basWorkflow!.scope_events!.at(-1)!.origin, 'agent_proposal');
  assert.deepEqual(session.basWorkflow!.captures, f.workflow.captures);
  assert.deepEqual(await basProjectReview(session.basWorkflow, f.workflow.current_capture_id!), before);
  const after = structuredClone(session.basWorkflow);
  assert.equal((await runBasScopeTransport(session, { action: 'record', request })).event_id, record.event_id);
  assert.deepEqual(session.basWorkflow, after);
  session.basWorkflow = await verifyBasWorkflow(JSON.parse(canonicalBasJson(session.basWorkflow)));
  const shared = await readBasScopeDecision(session.basWorkflow, record.event_id!);
  const replay = await runBasScopeTransport(session, { action: 'replay', event_id: record.event_id, query: { path: ['original', 'value', 'source'] } });
  assert.deepEqual(replay.page, readBasRevisionView(shared, { path: ['original', 'value', 'source'] }));
  const withdrawn = await runBasScopeTransport(session, { action: 'record', request: scopeRequest(session.basWorkflow!, 731,
    { kind: 'withdraw_coverage', coverage_event_id: record.event_id! }) });
  assert.equal(withdrawn.approved, false);
  assert.equal((await readBasScopeDecision(session.basWorkflow, record.event_id!)).decision_state, 'withdrawn');
});

test('failed response paths, stale/cancelled operations and cross-session or expired views cannot save', async () => {
  const f = await scopeFixture(), session = new Session(); session.basWorkflow = f.workflow;
  const request = scopeRequest(f.workflow, 732, f.coverage), before = structuredClone(f.workflow);
  await assert.rejects(runBasScopeTransport(session, { action: 'record', request, query: { path: ['missing'] } }), /owned/);
  assert.deepEqual(session.basWorkflow, before);
  const abort = new AbortController(), cancelled = runBasScopeTransport(session, { action: 'record', request }, abort.signal);
  abort.abort(); await assert.rejects(cancelled, /abort/i); assert.deepEqual(session.basWorkflow, before);
  const raced = runBasScopeTransport(session, { action: 'record', request });
  session.basWorkflow = structuredClone(session.basWorkflow); await assert.rejects(raced, /workspace changed/);
  assert.deepEqual(session.basWorkflow, before);
  for (const patch of [{ origin: 'operator_input' }, { approved: true }, { expected_head: 'f'.repeat(64) }, { reason: '' }])
    await assert.rejects(runBasScopeTransport(session, { action: 'record', request: { ...request, ...patch } }));
  const view = await runBasScopeTransport(session, { action: 'catalog' }), other = new Session(); other.basWorkflow = session.basWorkflow;
  await assert.rejects(runBasScopeTransport(other, { action: 'read', view_id: view.view_id }), /expired|replaced/);
  const now = Date.now;
  try { Date.now = () => now() + 16 * 60 * 1000;
    await assert.rejects(runBasScopeTransport(session, { action: 'read', view_id: view.view_id }), /expired/);
  } finally { Date.now = now; }
  const ownedRequest = structuredClone(request), owned = runBasScopeTransport(session, { action: 'record', request: ownedRequest });
  ownedRequest.reason = 'Changed during await'; await owned;
  assert.equal(session.basWorkflow!.scope_events!.at(-1)!.reason, request.reason);
  await assert.rejects(runBasScopeTransport(session, { action: 'read', view_id: view.view_id }), /replaced/);
  const current = await runBasScopeTransport(session, { action: 'catalog' });
  session.basWorkflow!.scope_events![0].reason = 'In-place concurrent edit';
  await assert.rejects(runBasScopeTransport(session, { action: 'read', view_id: current.view_id }), /workspace changed/);
});

test('engineering checks enter the same catalog after actual Python calculation, without becoming approved', async () => {
  const f = await engineeringFixture(), calculated = await applyBasEngineeringReview(f.workflow, f.request, 'operator_input');
  const workflow = await addRevisionSourceSet(calculated.workflow), session = new Session(); session.basWorkflow = workflow;
  const source_set_id = workflow.drawing_events!.at(-1)!.event_id;
  const catalog = await catalogBasScope(workflow, { source_set_id });
  const check = catalog.targets.find(t => t.target.claim === 'engineering_compatibility');
  assert.ok(check); assert.equal(check.target.subject_id, f.register.input.checks[0].check_id);
  const specification = { schema_version: 'bas_deliverable_scope_spec_v1', scope_id: uuid(740), name: 'Controlled check scope',
    reason: 'Recorded capability input, not automatic design discovery', basis: catalog.basis, included: [check.target], excluded: [] };
  const view = await runBasScopeTransport(session, { action: 'preview', specification, query: { path: ['claims', 0, 'diagnostics'] } });
  assert.ok(view.page!.total > 0); assert.equal(view.approved, false);
  assert.deepEqual(session.basWorkflow!.engineering_events, workflow.engineering_events);
});

test('actual registered tool exposes the validated bounded catalog and proposal write, not a parallel implementation', async () => {
  const f = await scopeFixture(), session = new Session(); session.basWorkflow = f.workflow;
  const server = buildServer(session), client = new Client({ name: 'bas-scope-public-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  try {
    const catalog = await client.callTool({ name: 'bas_scope_review', arguments: { command: { action: 'catalog', source_set_id: f.basis.source_set_id } } });
    assert.equal(catalog.isError, undefined, JSON.stringify(catalog));
    const result = await client.callTool({ name: 'bas_scope_review', arguments: { command: { action: 'record', request: scopeRequest(f.workflow, 741, f.coverage) } } });
    assert.equal(result.isError, undefined, JSON.stringify(result));
    const data = JSON.parse((result.content as { text?: string }[]).find(c => c.text)!.text!);
    const checked = basScopeTransportResultSchema.parse(data.result);
    assert.equal(checked.event_id, session.basWorkflow!.scope_events!.at(-1)!.event_id);
    assert.ok(JSON.stringify(checked).length < 20000); assert.equal(checked.approved, false);
  } finally { await client.close(); await server.close(); }
});
