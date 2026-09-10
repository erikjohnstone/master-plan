import 'fake-indexeddb/auto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { localStore, createLocalStore, ANN_SCHEMA, emptyAnnotations, metaGet, metaPut } from '../src/lib/store.js';
import { annotationGeneration, attachAnnotationGeneration, isAnnotationConflict } from '../src/lib/annotationGeneration.js';
import { createSyncStore } from '../src/lib/sync/syncStore.js';

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
const versionKey = (project = '') => ['annotation_generation_v1', project] as unknown as string;
const doc = (name: string) => ({ ...emptyAnnotations(), project_name: name });

// Controlled transaction boundary for the future archive commit. This is NOT
// an archive restore test: no ZIP, Python replay, source staging or UI is faked
// into a claim of an implemented restoration journey.
async function controlledReplacement(project: string, payload: object, generation: string) {
  await createLocalStore(project).loadAnnotations();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('opentakeoff', 4); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction('meta', 'readwrite'), os = t.objectStore('meta');
      os.put(payload, project ? `annotations:${project}` : 'annotations');
      os.put(generation, ['annotation_generation_v1', project]);
      t.oncomplete = () => resolve(); t.onabort = () => reject(t.error); t.onerror = () => reject(t.error);
    });
  } finally { db.close(); }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

test('legacy projects keep their JSON contract; generation is non-enumerable, per read and not exported', async () => {
  await localStore.saveAnnotations(doc('before'));
  const before = await localStore.loadAnnotations();
  assert.equal(annotationGeneration(before), null);
  await controlledReplacement('', doc('after'), first);
  const after = await localStore.loadAnnotations();
  assert.equal(annotationGeneration(after), first);
  assert.equal(annotationGeneration(before), null, 'unrelated read cannot upgrade an older editor');
  assert.deepEqual(after, doc('after'));
  assert.equal(JSON.stringify(after), JSON.stringify(doc('after')));
  assert.equal(annotationGeneration(structuredClone(after)), null);
  assert.equal(annotationGeneration({ ...after }), null);
  await localStore.saveSnapshot('no transport token', after);
  assert.equal(annotationGeneration((await localStore.getSnapshot((await localStore.listSnapshots())[0].id)).payload), null);
});

test('v4 preserves v3 data and prevents an older blind-writer build from reopening the database', async () => {
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('opentakeoff', 3);
    r.onupgradeneeded = () => {
      const db = r.result; db.createObjectStore('meta'); db.createObjectStore('pdfs', { keyPath: 'name' });
      db.createObjectStore('snapshots', { keyPath: 'id' }); db.createObjectStore('pdf_revs', { keyPath: 'key' }).createIndex('name', 'name');
    };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  await new Promise<void>((resolve, reject) => {
    const t = old.transaction('meta', 'readwrite'); t.objectStore('meta').put(doc('v3 work'), 'annotations');
    t.oncomplete = () => resolve(); t.onabort = () => reject(t.error);
  });
  let notified = false;
  old.onversionchange = () => { notified = true; old.close(); };
  assert.deepEqual(await localStore.loadAnnotations(), doc('v3 work'));
  assert.equal(notified, true);
  await assert.rejects(new Promise((resolve, reject) => {
    const r = indexedDB.open('opentakeoff', 3); r.onsuccess = () => { r.result.close(); resolve(null); }; r.onerror = () => reject(r.error);
  }), { name: 'VersionError' });
  assert.deepEqual(await localStore.loadAnnotations(), doc('v3 work'));
});

test('a stale queued save, untokened writer and old unmount flush cannot overwrite a replacement', async () => {
  const loaded = await localStore.loadAnnotations(), queued = { payload: doc('old editor'), generation: annotationGeneration(loaded) };
  await controlledReplacement('', doc('restored'), first);
  await assert.rejects(localStore.saveAnnotations(queued.payload, { generation: queued.generation }), isAnnotationConflict);
  await assert.rejects(localStore.saveAnnotations(doc('untokened')), isAnnotationConflict);
  await localStore.loadAnnotations(); // unrelated reader must not authorize the queue
  await assert.rejects(localStore.saveAnnotations(queued.payload, { generation: queued.generation }), isAnnotationConflict);
  assert.deepEqual(await localStore.loadAnnotations(), doc('restored'));
});

test('fresh editor saves repeatedly; successive replacements invalidate only older generations', async () => {
  await controlledReplacement('', doc('restored'), first);
  const loaded = await localStore.loadAnnotations();
  await localStore.saveAnnotations(doc('edit 1'), { generation: annotationGeneration(loaded) });
  await localStore.saveAnnotations(doc('edit 2'), { generation: annotationGeneration(loaded) });
  await controlledReplacement('', doc('restored again'), second);
  await assert.rejects(localStore.saveAnnotations(doc('old'), { generation: annotationGeneration(loaded) }), isAnnotationConflict);
  const latest = await localStore.loadAnnotations();
  await localStore.saveAnnotations(doc('new'), { generation: annotationGeneration(latest) });
  assert.deepEqual(await localStore.loadAnnotations(), doc('new'));
});

test('save generations are scoped by exact project, including delimiter-like project names', async () => {
  const A = createLocalStore('A'), B = createLocalStore('A:annotations');
  await controlledReplacement('A', doc('A'), first);
  await B.saveAnnotations(doc('B'));
  await localStore.saveAnnotations(doc('anonymous'));
  await assert.rejects(A.saveAnnotations(doc('wrong project token'), { generation: annotationGeneration(await B.loadAnnotations()) }), isAnnotationConflict);
  assert.equal(annotationGeneration(await A.loadAnnotations()), first);
  assert.equal(annotationGeneration(await B.loadAnnotations()), null);
  assert.equal(annotationGeneration(await localStore.loadAnnotations()), null);
});

test('corrupt persisted generation refuses load and blind writes rather than treating it as legacy', async () => {
  await localStore.saveAnnotations(doc('preserve'));
  await metaPut(versionKey(), { corrupt: true });
  await assert.rejects(localStore.loadAnnotations(), /save version/);
  await assert.rejects(localStore.saveAnnotations(doc('drop')), isAnnotationConflict);
  assert.deepEqual(await metaGet('annotations'), doc('preserve'));
  assert.throws(() => attachAnnotationGeneration({}, 'bad version'), /save version/);
});

test('same-transaction CAS catches ordinary intervening edits and does not change generation', async () => {
  await controlledReplacement('', doc('before'), first);
  const expected = await localStore.loadAnnotations(), generation = annotationGeneration(expected);
  await localStore.saveAnnotations(doc('user edit'), { generation });
  await assert.rejects(localStore.saveAnnotations(doc('late adopt'), { generation, expectedPayload: expected }), isAnnotationConflict);
  const current = await localStore.loadAnnotations();
  await localStore.saveAnnotations(doc('checked adopt'), { generation, expectedPayload: current });
  assert.deepEqual(await localStore.loadAnnotations(), doc('checked adopt'));
  assert.equal(annotationGeneration(await localStore.loadAnnotations()), first);
});

test('save owns payload and CAS before awaits; undefined optional fields keep JSON omission semantics', async () => {
  const expected = { ...doc('before'), optional: undefined };
  await localStore.saveAnnotations(expected);
  const payload = doc('new'), pending = localStore.saveAnnotations(payload, { expectedPayload: expected });
  payload.project_name = 'mutated'; expected.project_name = 'mutated';
  await pending;
  assert.deepEqual(await localStore.loadAnnotations(), doc('new'));
});

test('transaction abort after put success cannot report a successful save or alter the previous state', async () => {
  await controlledReplacement('', doc('before'), first);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
    const req = put.apply(this, args);
    if (args[1] === 'annotations') req.addEventListener('success', () => this.transaction.abort());
    return req;
  };
  try { await assert.rejects(localStore.saveAnnotations(doc('aborted'), { generation: first })); }
  finally { IDBObjectStore.prototype.put = put; }
  assert.deepEqual(await localStore.loadAnnotations(), doc('before'));
  assert.equal(annotationGeneration(await localStore.loadAnnotations()), first);
  await localStore.saveAnnotations(doc('retry'), { generation: first });
});

test('sync forwards the captured token and does not push a refused stale write', async () => {
  const base = createLocalStore('A'); let pushes = 0;
  const provider = { async pull() { return null; }, async push() { pushes++; return { rev: 1 }; } };
  const sync = createSyncStore({ base, provider, folderId: 'A' }) as any;
  await sync.whenSynced();
  await controlledReplacement('A', doc('restored'), first);
  await assert.rejects(sync.saveAnnotations(doc('stale'), { generation: null }), isAnnotationConflict);
  await sync.whenPushed(); assert.equal(pushes, 0);
  await sync.saveAnnotations(doc('fresh'), { generation: first });
  await sync.whenPushed(); assert.equal(pushes, 1);
  assert.deepEqual(await base.loadAnnotations(), doc('fresh'));
});

test('remote seed discovered before replacement cannot adopt afterward or signal a stale hydrate', async () => {
  const base = createLocalStore('A'), entered = deferred<void>(), response = deferred<any>(), updates: any[] = [];
  const provider = { async pull() { entered.resolve(); return response.promise; }, async push() { return { rev: 1 }; } };
  const sync = createSyncStore({ base, provider, folderId: 'A', onRemoteUpdate: value => updates.push(value) }) as any;
  await entered.promise;
  await controlledReplacement('A', doc('restored'), first);
  response.resolve({ data: doc('old response'), rev: 4 }); await sync.whenSynced();
  assert.deepEqual(await base.loadAnnotations(), doc('restored'));
  assert.equal(await metaGet('sync:A:synced_rev'), undefined);
  assert.equal(updates.length, 0);
});

test('busy-deferred remote check cannot cross a replacement boundary; fresh check may reconcile', async () => {
  const base = createLocalStore('A'); await base.saveAnnotations(doc('local')); await metaPut('sync:A:touched', true);
  let busy = true, remote: any = { data: doc('remote'), rev: 5 }; const updates: any[] = [];
  const provider = { async pull() { return remote; }, async push() { return { rev: 6 }; } };
  const sync = createSyncStore({ base, provider, folderId: 'A', isBusy: () => busy,
    onRemoteUpdate: value => updates.push(value), saveSnapshot: async () => {} }) as any;
  await sync.whenSynced(); await sync.checkRemote();
  await controlledReplacement('A', doc('restored'), first);
  busy = false; await sync.flushPending();
  assert.deepEqual(await base.loadAnnotations(), doc('restored')); assert.equal(updates.length, 0);
  remote = { data: doc('freshly fetched remote'), rev: 7 }; await sync.checkRemote();
  assert.deepEqual(await base.loadAnnotations(), doc('freshly fetched remote'));
  assert.equal(annotationGeneration(updates[0]), first);
});

test('replacement during a conflict backup prevents both adopt and notification', async () => {
  const base = createLocalStore('A'); await base.saveAnnotations(doc('local')); await metaPut('sync:A:touched', true);
  const updates: any[] = [];
  const provider = { async pull() { return { data: doc('remote'), rev: 5 }; }, async push() { return { rev: 6 }; } };
  const sync = createSyncStore({ base, provider, folderId: 'A', onRemoteUpdate: value => updates.push(value),
    saveSnapshot: async () => { await controlledReplacement('A', doc('restored'), first); } }) as any;
  await sync.whenSynced(); await sync.checkRemote();
  assert.deepEqual(await base.loadAnnotations(), doc('restored')); assert.equal(updates.length, 0);
  assert.equal(await metaGet('sync:A:synced_rev'), undefined);
  await sync.flushPending(); assert.equal(updates.length, 0);
});

test('fresh post-replacement seed carries the correct token, without adding a JSON field', async () => {
  await controlledReplacement('A', doc('local'), first); const updates: any[] = [];
  const provider = { async pull() { return { data: doc('remote'), rev: 2 }; }, async push() { return { rev: 3 }; } };
  const sync = createSyncStore({ base: createLocalStore('A'), provider, folderId: 'A', onRemoteUpdate: value => updates.push(value) }) as any;
  await sync.whenSynced();
  assert.deepEqual(updates[0], doc('remote')); assert.equal(annotationGeneration(updates[0]), first);
  assert.equal((await createLocalStore('A').loadAnnotations()).schema, ANN_SCHEMA);
});
