import 'fake-indexeddb/auto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore, localStore, emptyAnnotations, metaGet, metaPut } from '../src/lib/store.js';
import { createSyncStore } from '../src/lib/sync/syncStore.js';
import { annotationGeneration, isAnnotationConflict } from '../src/lib/annotationGeneration.js';
import { prepareBasRestore, replayBasRestore } from '../src/lib/basRestore.ts';
import { prepareBasWorkflowReplay } from '../src/lib/basWorkflowReplay.ts';
import { captureBasPoints } from '../src/lib/basWorkflow.ts';
import { basPointListsSchema } from '../src/lib/basPointLists.ts';
import { sha256Hex } from '../src/lib/graphKeys.js';

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
const key = (scope: string, field: string) => `sync:${scope}:${field}`;
const doc = (name: string) => ({ ...emptyAnnotations(), project_name: name });
async function fixture(label: string) {
  const bytes = new TextEncoder().encode(`%PDF-controlled-${label}`), sha256 = await sha256Hex(bytes);
  const source = { source_id: `sha256:${sha256}`, sha256, byte_length: bytes.length, page_count: 1 };
  const points = basPointListsSchema.parse({ schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1',
    scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [] });
  const workflow = await captureBasPoints([{ ...source, names: [`${label}.pdf`] }], points);
  return { bytes, source, payload: { ...doc(label), bas_workflow: workflow } };
}
async function planFor(base: any, incoming: any) {
  const plan = await prepareBasRestore(await base.loadAnnotations(), incoming, 'c'.repeat(64));
  // Controlled empty-history receipt, not a substitute for real Python/browser proof.
  await replayBasRestore(plan, async workflow => {
    const p = await prepareBasWorkflowReplay(workflow);
    assert.ok(Object.values(p.checked_records).every(ids => ids.length === 0));
    return { schema_version: 'bas_workflow_replay_v1', rule_version: 'saved_bas_calculations_1', workflow_sha256: p.workflow_sha256,
      checked_records: p.checked_records, calculation_verification: 'no_saved_calculations', project_complete: false };
  });
  return plan;
}
function provider(initial: any = null) {
  return { remote: structuredClone(initial), offline: false, pushed: [] as any[], holdPush: null as null | (() => Promise<void>),
    async pull() { if (this.offline) throw new Error('Controlled offline'); return structuredClone(this.remote); },
    async push(data: any, { expectedRev }: any) {
      await this.holdPush?.(); if (this.offline) throw new Error('Controlled offline');
      if (expectedRev !== null && this.remote?.rev !== expectedRev) return { conflict: true, remote: structuredClone(this.remote) };
      this.remote = { rev: (expectedRev ?? this.remote?.rev ?? 0) + 1, data: structuredClone(data) };
      this.pushed.push(structuredClone(data)); return { rev: this.remote.rev };
    } };
}
async function harness(scope = 'A', initial?: any) {
  const base = createLocalStore(scope), remote = provider(initial), snapshots: any[] = [];
  await metaPut(key(scope, 'touched'), true);
  const make = (overrides: any = {}) => createSyncStore({ base, provider: remote, folderId: scope,
    saveSnapshot: async (label, payload) => { snapshots.push({ label, payload: structuredClone(payload) }); return { id: String(snapshots.length) }; }, ...overrides }) as any;
  const sync = make(); await sync.whenSynced();
  return { base, remote, snapshots, make, sync };
}
async function queued(scope: string) {
  const name = `opentakeoff:annotations:${JSON.stringify(scope)}`;
  // Event-loop handshakes, no timer-based assumption about a race window.
  for (let n = 0; n < 1000; n++) {
    if ((await navigator.locks.query()).pending?.some(lock => lock.name === name)) return;
    await new Promise<void>(r => setImmediate(r));
  }
  assert.fail('Expected a queued same-scope operation');
}

test('checkpoint adoption atomically owns payload, revision and ancestor; abort rolls all back', async () => {
  const base = createLocalStore('A'); await base.saveAnnotations(doc('before'));
  const state = { scope: 'A', values: { synced_rev: 2, synced_base: { rev: 2, data: doc('after') } } };
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
    if (args[1] === key('A', 'synced_base')) throw new DOMException('Controlled quota', 'QuotaExceededError');
    return put.apply(this, args);
  };
  try { await assert.rejects(base.saveAnnotations(doc('after'), { expectedPayload: doc('before'), syncState: state }), /Controlled quota/); }
  finally { IDBObjectStore.prototype.put = put; }
  assert.deepEqual(await base.loadAnnotations(), doc('before')); assert.equal(await metaGet(key('A', 'synced_rev')), undefined);
  const save = base.saveAnnotations(doc('after'), { expectedPayload: doc('before'), syncState: state });
  state.values.synced_rev = 99; state.values.synced_base.data.project_name = 'mutated'; await save;
  assert.deepEqual(await base.loadAnnotations(), doc('after')); assert.equal(await metaGet(key('A', 'synced_rev')), 2);
  assert.deepEqual(await metaGet(key('A', 'synced_base')), { rev: 2, data: doc('after') });
});

test('old-generation push checkpoint cannot acknowledge or clear a newer restore', async () => {
  const f = await fixture('restore'), base = createLocalStore('A'), plan = await planFor(base, f.payload);
  await base.restoreBasEvidence(plan, async () => f.bytes);
  await metaPut(key('A', 'marker'), { new: true });
  await assert.rejects(base.commitAnnotationSync({ scope: 'A', values: { generation: null, synced_rev: 8 }, remove: ['marker'] }), isAnnotationConflict);
  assert.equal(await metaGet(key('A', 'synced_rev')), undefined); assert.deepEqual(await metaGet(key('A', 'marker')), { new: true });
  assert.equal(annotationGeneration(await base.loadAnnotations()), plan.operation_id);
});

test('restore queues behind an active push through its metadata; normal local saves remain independent', { timeout: 10000 }, async () => {
  const h = await harness(), f = await fixture('incoming');
  const entered = deferred(), release = deferred();
  h.remote.holdPush = async () => { entered.resolve(); await release.promise; };
  await h.sync.saveAnnotations(doc('operator')); await entered.promise;
  await h.sync.saveAnnotations(doc('latest operator')); // must not await the held network
  const plan = await planFor(h.base, f.payload); let loaded = false;
  const restoring = h.sync.restoreBasEvidence(plan, async () => { loaded = true; return f.bytes; });
  await queued('A'); assert.equal(loaded, false); assert.equal(annotationGeneration(await h.base.loadAnnotations()), null);
  release.resolve(); const result = await restoring; assert.equal(result.sync, 'pending');
  await h.sync.whenPushed();
  assert.equal((await h.sync.readRestoreSyncStatus()).pending, false);
  assert.deepEqual(h.remote.remote.data, await h.base.loadAnnotations());
  assert.equal(await metaGet(key('A', 'generation')), plan.operation_id);
  assert.deepEqual((await h.base.loadBasRestoreJournal(plan.operation_id)).previous_payload, doc('latest operator'));
  assert.deepEqual(await h.base.loadBasSource(f.source), f.bytes);
});

test('queued restore cancellation changes nothing and the same preview can retry after release', { timeout: 10000 }, async () => {
  const base = createLocalStore('A'), f = await fixture('cancel'), plan = await planFor(base, f.payload);
  const entered = deferred(), release = deferred(), held = base.withAnnotationSync(async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  const controller = new AbortController(); let loaded = false;
  const restoring = base.restoreBasEvidence(plan, async () => { loaded = true; return f.bytes; }, { signal: controller.signal });
  const rejected = assert.rejects(restoring, { name: 'AbortError' });
  await queued('A'); controller.abort(); await rejected;
  assert.equal(loaded, false); assert.deepEqual(await base.loadAnnotations(), emptyAnnotations());
  assert.equal(await base.loadBasRestoreJournal(plan.operation_id), undefined);
  release.resolve(); await held;
  await base.restoreBasEvidence(plan, async () => f.bytes);
  assert.equal(annotationGeneration(await base.loadAnnotations()), plan.operation_id);
});

test('stale preview waiting on another operation cannot overwrite an ordinary save', { timeout: 10000 }, async () => {
  const base = createLocalStore('A'), f = await fixture('stale'), plan = await planFor(base, f.payload);
  const entered = deferred(), release = deferred(), held = base.withAnnotationSync(async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  const restoring = base.restoreBasEvidence(plan, async () => f.bytes), rejected = assert.rejects(restoring, isAnnotationConflict);
  await queued('A'); await base.saveAnnotations(doc('later edit')); release.resolve(); await held; await rejected;
  assert.deepEqual(await base.loadAnnotations(), doc('later edit')); assert.equal(await base.loadBasSource(f.source), null);
});

test('canonical scope coordinates different transport instances; other projects do not share its lock', { timeout: 10000 }, async () => {
  const entered = deferred(), release = deferred(), held = localStore.withAnnotationSync(async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  const f = await fixture('anonymous'), plan = await planFor(localStore, f.payload);
  const restoring = localStore.restoreBasEvidence(plan, async () => f.bytes); await queued('');
  let independent = false; await createLocalStore('B').withAnnotationSync(async () => { independent = true; });
  assert.equal(independent, true);
  let pulls = 0;
  const sync = createSyncStore({ base: localStore, folderId: 'different-transport-id', provider: {
    async pull() { pulls++; return null; }, async push() { return { rev: 1 }; } } }) as any;
  assert.equal(pulls, 0); release.resolve(); await held; await restoring; await sync.whenSynced(); await sync.whenPushed();
  assert.equal((await sync.readRestoreSyncStatus()).pending, false);
});

test('offline restore survives restart and an old success marker; retry pushes exact restored annotations', async () => {
  const h = await harness(), f = await fixture('offline'), plan = await planFor(h.base, f.payload);
  h.remote.offline = true;
  await metaPut(key('A', 'marker'), { targetRev: 4, baseRev: 3 });
  await h.sync.restoreBasEvidence(plan, async () => f.bytes); await h.sync.whenPushed();
  assert.equal((await h.sync.readRestoreSyncStatus()).pending, true); assert.equal(await metaGet(key('A', 'generation')), undefined);
  const restarted = h.make(); await restarted.whenSynced(); await restarted.whenPushed();
  assert.equal((await restarted.readRestoreSyncStatus()).pending, true); assert.deepEqual(h.remote.pushed, []);
  h.remote.offline = false; await restarted.checkRemote(); await restarted.whenPushed();
  assert.deepEqual(h.remote.remote.data, await h.base.loadAnnotations());
  assert.equal((await restarted.readRestoreSyncStatus()).pending, false); assert.equal(await metaGet(key('A', 'marker')), undefined);
  assert.deepEqual(await h.base.loadBasSource(f.source), f.bytes);
});

test('unknown ancestry after restore keeps operator state and both histories; exact remote recovery is retained', async () => {
  const f = await fixture('local'), r = await fixture('remote'), h = await harness();
  const plan = await planFor(h.base, f.payload);
  h.remote.offline = true; await h.sync.restoreBasEvidence(plan, async () => f.bytes); await h.sync.whenPushed();
  h.remote.remote = { rev: 7, data: r.payload }; h.remote.offline = false;
  await h.sync.checkRemote(); await h.sync.whenPushed();
  const result = await h.base.loadAnnotations();
  assert.equal(result.project_name, 'local'); assert.equal(result.bas_workflow.captures.length, 2);
  assert.deepEqual(h.remote.remote.data, result); assert.equal((await h.sync.readRestoreSyncStatus()).pending, false);
  assert.deepEqual(h.snapshots.find(s => s.label === 'Restore sync remote backup').payload, r.payload);
  assert.equal(await h.base.loadBasSource(r.source), null, 'annotation sync does not claim to deliver PDFs');
});

test('adoption callback and atomic checkpoint settle before a queued restore starts', { timeout: 10000 }, async () => {
  const r = await fixture('remote'), f = await fixture('restore'), h = await harness('A');
  const entered = deferred(), release = deferred(), order: string[] = [], save = h.base.saveAnnotations;
  h.base.saveAnnotations = async (payload: any, options: any) => {
    await save(payload, options);
    if (options?.syncState) { entered.resolve(); await release.promise; }
  };
  const sync = h.make({ onRemoteUpdate: () => order.push('adopt callback') }); await sync.whenSynced();
  h.remote.remote = { rev: 2, data: r.payload }; const checking = sync.checkRemote(); await entered.promise;
  assert.equal(await metaGet(key('A', 'synced_rev')), 2);
  const plan = await planFor(h.base, f.payload);
  const restoring = sync.restoreBasEvidence(plan, async (item: any) => { order.push('restore source'); return item.source.source_id === r.source.source_id ? r.bytes : f.bytes; });
  await queued('A'); release.resolve(); await checking; await restoring; await sync.whenPushed();
  assert.equal(order[0], 'adopt callback'); assert.ok(order.includes('restore source'));
  assert.equal((await h.base.loadAnnotations()).bas_workflow.captures.length, 2);
  assert.equal(await metaGet(key('A', 'generation')), plan.operation_id);
});

test('closed sync coordinator does not send a newly restored workspace to the old transport', { timeout: 10000 }, async () => {
  const h = await harness(), f = await fixture('later'), entered = deferred(), release = deferred();
  h.remote.holdPush = async () => { entered.resolve(); await release.promise; };
  await h.sync.saveAnnotations(doc('old connection')); await entered.promise;
  const plan = await planFor(h.base, f.payload);
  const restoring = h.base.restoreBasEvidence(plan, async () => f.bytes); await queued('A');
  h.sync.dispose(); release.resolve(); await restoring; await h.sync.whenPushed();
  assert.equal(h.remote.pushed.length, 1); assert.deepEqual(h.remote.pushed[0], doc('old connection'));
  await assert.rejects(h.sync.saveAnnotations(doc('wrong connection')), /closed/);
  await assert.rejects(h.sync.restoreBasEvidence(plan, async () => f.bytes), /closed/);
  assert.equal((await h.sync.readRestoreSyncStatus()).pending, true);
});

test('mount recovery holds the same lease through confirmation before a local-only restore can publish', { timeout: 10000 }, async () => {
  const base = createLocalStore('recovery'), f = await fixture('restore'), remote = provider({ rev: 2, data: doc('before') });
  await base.saveAnnotations(doc('before'));
  await metaPut(key('recovery', 'touched'), true); await metaPut(key('recovery', 'marker'), { targetRev: 2, baseRev: 1 });
  const entered = deferred(), release = deferred(), pull = remote.pull.bind(remote);
  remote.pull = async () => { entered.resolve(); await release.promise; return pull(); };
  const sync = createSyncStore({ base, provider: remote, folderId: 'recovery' }) as any;
  await entered.promise;
  const plan = await planFor(base, f.payload), restoring = base.restoreBasEvidence(plan, async () => f.bytes);
  await queued('recovery'); assert.equal(await base.loadBasRestoreJournal(plan.operation_id), undefined);
  release.resolve(); await sync.whenSynced(); await restoring;
  assert.equal(await metaGet(key('recovery', 'synced_rev')), 2);
  assert.equal((await sync.readRestoreSyncStatus()).pending, true, 'old confirmed push must not acknowledge a later local-only restore');
  assert.equal(annotationGeneration(await base.loadAnnotations()), plan.operation_id);
});
