/** Browser orchestration with controlled no-calculation source fixtures.
 * The transport double is explicit; real Python/UI proof is separate. */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readinessFixture, reviewReadyScope } from './helpers/basReadinessFixture.ts';
import { uuid } from './helpers/basEngineeringFixture.ts';
import { scopeRequest } from './helpers/basScopeFixture.ts';
import { applyBasScopeReview } from '../src/lib/basScopeReview.ts';
import { createLocalStore, setActiveStore } from '../src/lib/store.js';
import { createBasSnapshotBrowser, replayBasSnapshotInBrowser } from '../src/lib/basSnapshotBrowser.js';
import { prepareBasWorkflowReplay, BAS_WORKFLOW_REPLAY_RULE } from '../src/lib/basWorkflowReplay.ts';
import { readBasSnapshotPlan } from '../src/lib/basSnapshot.ts';
import { canonicalBasJson } from '../src/lib/basCanonical.ts';
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); setActiveStore(); });
const declaration = { operation_id: uuid(975), reviewer: 'Controlled browser unit test', reason: 'No real PDF or real operator approval', declared_at: '2026-09-10T20:00:00.000Z' };
async function noCalculationTransport(_url: unknown, request: RequestInit = {}) {
  const plan = await prepareBasWorkflowReplay(JSON.parse(String(request.body)).workflow);
  assert.ok(Object.values(plan.checked_records).every(ids => ids.length === 0), 'Test transport cannot replay calculations');
  return Response.json({ schema_version: 'bas_workflow_replay_v1', rule_version: BAS_WORKFLOW_REPLAY_RULE,
    workflow_sha256: plan.workflow_sha256, checked_records: plan.checked_records,
    calculation_verification: 'no_saved_calculations', project_complete: false });
}
async function setup() {
  const f = await readinessFixture(), r = await reviewReadyScope(f.workflow), adapter = createLocalStore('browser-snapshot');
  const payload = { schema: 'opentakeoff.takeoff_canvas.v1', shapes: [], project_name: 'Controlled project', bas_workflow: r.workflow };
  await adapter.saveAnnotations(payload); await adapter.retainBasSource(r.workflow, r.workflow.captures[0].sources[0].source_id, f.bytes);
  const live = { payload, generation: null as string | null, pending: false, busy: false };
  setActiveStore(adapter);
  let calls = 0;
  const client = createBasSnapshotBrowser({ adapter, readWorkspace: () => live, fetcher: async (...args: Parameters<typeof noCalculationTransport>) => { calls++; return noCalculationTransport(...args); } });
  return { ...f, ...r, payload, live, adapter, client, calls: () => calls };
}
test('browser preview, explicit save, fresh reopen and export/import preserve original data and historical-only guarantees', async () => {
  const f = await setup(), before = await f.adapter.loadAnnotations();
  const preview = await f.client.preview(f.scope.event_id);
  assert.equal(preview.readiness.status, 'ready_for_explicit_approval');
  assert.equal((await f.client.list()).items.length, 0); assert.equal(f.calls(), 1);
  const saved = await f.client.approve(preview, declaration);
  assert.equal(saved.receipt.committed, true); assert.equal(saved.current_working_state, 'not_evaluated');
  assert.equal(f.calls(), 2); assert.deepEqual(await f.adapter.loadAnnotations(), before);
  const reopened = await f.client.open(saved.record.snapshot_id);
  assert.deepEqual(reopened.record, saved.record); assert.equal(f.calls(), 3);
  const exported = await f.client.export(saved.record.snapshot_id); assert.equal(f.calls(), 4);
  assert.match(exported.filename, /\.otbas-snapshot.zip$/);
  const target = createLocalStore('independent-project'); setActiveStore(target);
  await target.saveAnnotations({ schema: 'opentakeoff.takeoff_canvas.v1', shapes: [], project_name: 'Keep existing work' });
  const unrelated = await target.loadAnnotations();
  const receiver = createBasSnapshotBrowser({ adapter: target, readWorkspace: () => ({ pending: true, busy: true }), fetcher: noCalculationTransport });
  const imported = await receiver.import(exported.blob);
  assert.equal(imported.record.snapshot_id, saved.record.snapshot_id);
  assert.deepEqual(await target.loadAnnotations(), unrelated); assert.equal((await receiver.list()).items.length, 1);
  assert.deepEqual(readBasSnapshotPlan(imported.plan).record, readBasSnapshotPlan(saved.plan).record);
  assert.deepEqual(await target.listSheets(), []); f.client.dispose(); receiver.dispose();
});
test('preview refuses unsaved, busy, mismatched saved data and generation without any snapshot write', async () => {
  const f = await setup();
  for (const flag of ['pending', 'busy'] as const) {
    f.live[flag] = true; await assert.rejects(f.client.preview(f.scope.event_id), /unsaved work/); f.live[flag] = false;
  }
  f.live.generation = uuid(976); await assert.rejects(f.client.preview(f.scope.event_id), /Saved data/); f.live.generation = null;
  f.live.payload.project_name = 'Not saved'; await assert.rejects(f.client.preview(f.scope.event_id), /Saved data/);
  assert.equal(f.calls(), 0); assert.equal((await f.client.list()).items.length, 0);
});
test('modified/forged preview and changed live inputs cannot approve different data', async () => {
  const f = await setup(), preview = await f.client.preview(f.scope.event_id);
  await assert.rejects(f.client.approve(structuredClone(preview), declaration), /Check readiness/);
  preview.readiness.scope.specification.name = 'Mutated display';
  f.live.payload.project_name = 'Changed during review';
  await assert.rejects(f.client.approve(preview, declaration), /workspace changed/);
  f.live.payload.project_name = 'Controlled project';
  const result = await f.client.approve(preview, declaration);
  assert.notEqual(result.readiness.scope.specification.name, 'Mutated display');
  assert.equal(JSON.parse(readBasSnapshotPlan(result.plan).payload_json).project_name, 'Controlled project');
});
test('original-byte failure, service unavailability and false receipt never publish approval', async () => {
  const f = await setup();
  const absent = createBasSnapshotBrowser({ adapter: { ...f.adapter, loadBasSource: async () => null }, readWorkspace: () => f.live,
    isActive: () => true, fetcher: noCalculationTransport });
  await assert.rejects(absent.preview(f.scope.event_id), /original PDF unavailable/);
  for (const fetcher of [async () => new Response('offline', { status: 503 }), async () => Response.json({ approved: true }),
    async () => Response.json({ error: 'Shared test service refused' }, { status: 500 })]) {
    const client = createBasSnapshotBrowser({ adapter: f.adapter, readWorkspace: () => f.live, fetcher });
    await assert.rejects(client.preview(f.scope.event_id));
    assert.equal((await f.client.list()).items.length, 0); client.dispose();
  }
});
test('a blocked preview cannot be made approvable by changing its displayed status', async () => {
  const f = await setup();
  const removed = await applyBasScopeReview(f.live.payload.bas_workflow, scopeRequest(f.live.payload.bas_workflow, 978,
    { kind: 'withdraw_coverage', coverage_event_id: f.live.payload.bas_workflow.scope_events!.at(-1)!.event_id }), 'operator_input');
  f.live.payload.bas_workflow = removed.workflow; await f.adapter.saveAnnotations(f.live.payload);
  const preview = await f.client.preview(f.scope.event_id); assert.equal(preview.readiness.status, 'blocked');
  preview.readiness.status = 'ready_for_explicit_approval'; preview.readiness.blockers = [];
  await assert.rejects(f.client.approve(preview, declaration), /snapshot is blocked/);
  assert.equal((await f.client.list()).items.length, 0);
});
test('project switch, dispose and cancellation during transport invalidate operations without annotation writes', async () => {
  for (const change of ['switch', 'dispose', 'abort', 'edit'] as const) {
    const f = await setup(), before = canonicalBasJson(await f.adapter.loadAnnotations()), controller = new AbortController();
    const preview = await f.client.preview(f.scope.event_id);
    if (change === 'switch') setActiveStore(createLocalStore('elsewhere'));
    if (change === 'dispose') f.client.dispose();
    if (change === 'abort') controller.abort();
    if (change === 'edit') f.live.payload.project_name = 'Late edit';
    await assert.rejects(f.client.approve(preview, declaration, { signal: controller.signal }));
    assert.equal((await f.adapter.listBasSnapshots()).items.length, 0);
    assert.equal(canonicalBasJson(await f.adapter.loadAnnotations()), before);
  }
  const f = await setup(), controller = new AbortController();
  const client = createBasSnapshotBrowser({ adapter: f.adapter, readWorkspace: () => f.live, fetcher: async (...args: Parameters<typeof noCalculationTransport>) => {
    const response = await noCalculationTransport(...args); controller.abort(); return response;
  } });
  await assert.rejects(client.preview(f.scope.event_id, { signal: controller.signal }));
  assert.equal((await f.adapter.listBasSnapshots()).items.length, 0);
});
test('historical import rejects a non-snapshot archive before storage', async () => {
  const f = await setup();
  await assert.rejects(f.client.import(new Blob(['not an archive'])), /archive size/);
  assert.equal((await f.adapter.listBasSnapshots()).items.length, 0);
});
test('edits arriving during approval replay fail before the atomic save', async () => {
  const f = await setup(); let calls = 0;
  const client = createBasSnapshotBrowser({ adapter: f.adapter, readWorkspace: () => f.live,
    fetcher: async (...args: Parameters<typeof noCalculationTransport>) => {
      const response = await noCalculationTransport(...args); if (++calls === 2) f.live.pending = true; return response;
    } });
  const preview = await client.preview(f.scope.event_id);
  await assert.rejects(client.approve(preview, declaration), /unsaved work/);
  assert.equal((await f.adapter.listBasSnapshots()).items.length, 0);
});
test('client creation during remount is fresh while an old disposed preview stays unusable', async () => {
  const f = await setup(), old = await f.client.preview(f.scope.event_id); f.client.dispose();
  const next = createBasSnapshotBrowser({ adapter: f.adapter, readWorkspace: () => f.live, fetcher: noCalculationTransport });
  await assert.rejects(next.approve(old, declaration), /Check readiness/);
  const preview = await next.preview(f.scope.event_id); assert.equal((await next.approve(preview, declaration)).receipt.committed, true);
});
test('browser replay sends only the owned workflow to the existing endpoint and respects cancellation', async () => {
  const f = await setup(), abort = new AbortController();
  await replayBasSnapshotInBrowser(f.workflow, abort.signal, async (url: unknown, request: RequestInit = {}) => {
    assert.equal(url, '/__ot/bas-workflow-replay'); assert.equal(request.signal, abort.signal);
    assert.deepEqual(JSON.parse(String(request.body)), { workflow: f.workflow, request: {} }); return noCalculationTransport(url, request);
  });
  abort.abort(); await assert.rejects(replayBasSnapshotInBrowser(f.workflow, abort.signal, async () => { throw new Error('Must not fetch'); }), /abort/i);
});
