/** Browser persistence tests with controlled evidence. Not real-PDF/approval UI proof. */
import 'fake-indexeddb/auto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readinessFixture, reviewReadyScope } from './helpers/basReadinessFixture.ts';
import { engineeringFixture, uuid } from './helpers/basEngineeringFixture.ts';
import { addRevisionSourceSet } from './helpers/basRevisionFixture.ts';
import { prepareBasSnapshotApproval, readBasSnapshotPlan, verifyBasSnapshot } from '../src/lib/basSnapshot.ts';
import { createLocalStore, localStore, metaGet, metaPut } from '../src/lib/store.js';
import { annotationGeneration } from '../src/lib/annotationGeneration.js';
import { canonicalBasJson } from '../src/lib/basCanonical.ts';
import { sha256Hex } from '../src/lib/graphKeys.js';
import { BAS_SOURCE_CHUNK_BYTES, basSourceChunkKey } from '../src/lib/basSourceStorage.js';
import { createSyncStore } from '../src/lib/sync/syncStore.js';
import { buildLocalFirstStore } from '../src/lib/sync/composite.js';
import { buildSyncedWorkspaceStore } from '../src/lib/sync/workspaceComposite.js';
import { assertBasSnapshotStorageBounds } from '../src/lib/basSnapshotStore.js';

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
test('browser storage source limits retain the predeclared archive boundary without allocating giant test PDFs', () => {
  const max = 512 * 1024 ** 2;
  assert.doesNotThrow(() => assertBasSnapshotStorageBounds([{ byte_length: max }]));
  assert.throws(() => assertBasSnapshotStorageBounds([{ byte_length: max + 1 }]), /512 MiB/);
  assert.throws(() => assertBasSnapshotStorageBounds([]), /1–10000/);
  assert.doesNotThrow(() => assertBasSnapshotStorageBounds(Array.from({ length: 10000 }, () => ({ byte_length: 1 }))));
  assert.throws(() => assertBasSnapshotStorageBounds(Array.from({ length: 10001 }, () => ({ byte_length: 1 }))), /1–10000/);
});
const k = (kind: string, scope: string, ...parts: (string | number)[]) => [`bas_snapshot_${kind}_v1`, scope, ...parts] as unknown as string;
const vault = (scope: string, id: string) => ['bas_source_v1', scope, id] as unknown as string;
async function fixture(large = false) {
  const bytes = large ? new Uint8Array(BAS_SOURCE_CHUNK_BYTES + 137).fill(37) : null;
  const f = bytes ? await engineeringFixture({ sha256: await sha256Hex(bytes), byte_length: bytes.length }) : await readinessFixture();
  const workflow = bytes ? await addRevisionSourceSet(f.workflow) : f.workflow;
  const ready = await reviewReadyScope(workflow), original = bytes || (f as Awaited<ReturnType<typeof readinessFixture>>).bytes;
  const payload = { schema: 'opentakeoff.takeoff_canvas.v1', bas_workflow: ready.workflow, project_name: 'Controlled snapshot 雪',
    retained_extra: large ? 'x'.repeat(BAS_SOURCE_CHUNK_BYTES - 20) + '雪😀' + 'z'.repeat(50) : 'Original extension', shapes: [] };
  if (large) {
    const prefix = canonicalBasJson({ ...payload, retained_extra: '' }).split('"retained_extra":""')[0] + '"retained_extra":"';
    payload.retained_extra = 'x'.repeat(BAS_SOURCE_CHUNK_BYTES - new TextEncoder().encode(prefix).length - 1) + '雪😀' + 'z'.repeat(50);
  }
  const request = { operation_id: uuid(950), scope_event_id: ready.scope.event_id, reviewer: 'Controlled estimator',
    reason: 'Only the reviewed scheduled equipment', declared_at: '2026-09-10T17:00:00.000Z' };
  const io = { readSource: async () => original };
  const plan = await prepareBasSnapshotApproval(payload, request, 'operator_input', io);
  const source = ready.workflow.captures[0].sources[0];
  const { names: _names, ...retainedSource } = source;
  return { payload, request, plan, bytes: original, source: retainedSource, io };
}
async function keys() {
  return new Promise<IDBValidKey[]>((resolve, reject) => {
    const r = indexedDB.open('opentakeoff', 5);
    r.onsuccess = () => {
      const db = r.result, t = db.transaction('meta'), q = t.objectStore('meta').getAllKeys();
      t.oncomplete = () => { db.close(); resolve(q.result); }; t.onabort = () => { db.close(); reject(t.error); };
    }; r.onerror = () => reject(r.error);
  });
}
async function assertUnpublished(scope: string, f: Awaited<ReturnType<typeof fixture>>) {
  assert.deepEqual((await createLocalStore(scope).listBasSnapshots()).items, []);
  assert.equal(await createLocalStore(scope).loadBasSource(f.source), null);
  assert.ok(!(await keys()).some(key => Array.isArray(key) && key[1] === scope && String(key[0]).startsWith('bas_snapshot_')));
}

test('atomic browser save/replay keeps exact payload, originals and seal, without changing working annotations', async () => {
  const f = await fixture(), store = createLocalStore('A'); await store.saveAnnotations(f.payload);
  const before = await store.loadAnnotations();
  const add = IDBObjectStore.prototype.add; let observedDurability: string | undefined;
  IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
    if (Array.isArray(args[1]) && args[1][0] === 'bas_snapshot_seal_v1') observedDurability = this.transaction.durability;
    return add.apply(this, args);
  };
  let receipt;
  try { receipt = await store.saveBasSnapshot(f.plan, async () => f.bytes); }
  finally { IDBObjectStore.prototype.add = add; }
  assert.equal(observedDurability, 'strict'); assert.equal(receipt.durability_hint, 'strict');
  assert.equal(receipt.committed, true); assert.equal(receipt.annotations_changed, false); assert.equal(receipt.stored, 'browser_local');
  assert.deepEqual(await store.loadAnnotations(), before); assert.equal(annotationGeneration(await store.loadAnnotations()), null);
  assert.deepEqual(await store.loadBasSource(f.source), f.bytes); assert.deepEqual(await store.listSheets(), []);
  const listed = await store.listBasSnapshots(); assert.equal(listed.items.length, 1); assert.equal(listed.items[0].verification, 'not_replayed');
  const reopened = await store.loadBasSnapshot(f.plan.snapshot_id); assert.ok(reopened);
  assert.equal(readBasSnapshotPlan(reopened).mode, 'reopen');
  assert.deepEqual(readBasSnapshotPlan(reopened).record, readBasSnapshotPlan(f.plan).record);
  assert.equal(readBasSnapshotPlan(reopened).payload_json, canonicalBasJson(f.payload));
  assert.equal(await localStore.loadBasSnapshot(f.plan.snapshot_id), null); assert.deepEqual((await localStore.listBasSnapshots()).items, []);
  assert.equal(await localStore.loadBasSource(f.source), null);
});

test('same exact retry is idempotent; conflicting retry identity refuses without replacing the snapshot', async () => {
  const f = await fixture(), store = createLocalStore('A'); await store.saveAnnotations(f.payload);
  await store.saveBasSnapshot(f.plan, async () => f.bytes);
  await store.saveBasSnapshot(f.plan, async () => f.bytes);
  const other = await prepareBasSnapshotApproval(f.payload, { ...f.request, reason: 'Different declaration with reused operation' }, 'operator_input', f.io);
  await assert.rejects(store.saveBasSnapshot(other, async () => f.bytes), /conflicts/);
  assert.equal((await store.listBasSnapshots()).items.length, 1);
  assert.ok(await store.loadBasSnapshot(f.plan.snapshot_id));
  assert.ok(!(await keys()).some(key => Array.isArray(key) && key[0] === 'bas_snapshot_stage_v1'));
});

test('new approval checks saved generation and exact payload after async reads; stale retries cannot approve edits', async () => {
  const f = await fixture(), store = createLocalStore('A'); await store.saveAnnotations(f.payload);
  await assert.rejects(store.saveBasSnapshot(f.plan, async () => {
    await store.saveAnnotations({ ...f.payload, project_name: 'Edited during preparation' }); return f.bytes;
  }), /saved state was replaced/);
  await assertUnpublished('A', f);
  await store.saveAnnotations(f.payload);
  await assert.rejects(store.saveBasSnapshot(f.plan, async () => {
    await metaPut(['annotation_generation_v1', 'A'] as unknown as string, uuid(998)); return f.bytes;
  }), /saved state was replaced/);
  await assertUnpublished('A', f);
  await store.saveBasSnapshot(f.plan, async () => f.bytes, { generation: uuid(998) });
  await store.saveAnnotations({ ...f.payload, project_name: 'Newer project' }, { generation: uuid(998) });
  await assert.rejects(store.saveBasSnapshot(f.plan, async () => f.bytes, { generation: uuid(998) }), /saved state was replaced/);
  assert.ok(await store.loadBasSnapshot(f.plan.snapshot_id), 'historical reading is still valid after working-state changes');
});

test('verified historical import persists without replacing or approving current project state', async () => {
  const f = await fixture(), owned = readBasSnapshotPlan(f.plan), store = createLocalStore('B');
  await store.saveAnnotations({ schema: f.payload.schema, project_name: 'Unrelated work', shapes: [] });
  const before = await store.loadAnnotations(), reopened = await verifyBasSnapshot(f.payload, owned.record, f.io);
  await store.saveBasSnapshot(reopened, async () => f.bytes);
  assert.deepEqual(await store.loadAnnotations(), before);
  assert.equal((await store.listBasSnapshots()).items[0].current_working_state, 'not_evaluated');
  assert.ok(await store.loadBasSnapshot(f.plan.snapshot_id));
  await assert.rejects(store.saveBasSnapshot({ ...reopened }, async () => f.bytes), /owned, freshly verified/);
});

test('quota during final seal publication rolls back original, payload, metadata and operation atomically', async () => {
  const f = await fixture(), store = createLocalStore('A'); await store.saveAnnotations(f.payload);
  const add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
    if (Array.isArray(args[1]) && args[1][0] === 'bas_snapshot_seal_v1') throw new DOMException('Controlled seal quota', 'QuotaExceededError');
    return add.apply(this, args);
  };
  try { await assert.rejects(store.saveBasSnapshot(f.plan, async () => f.bytes), /Controlled seal quota/); }
  finally { IDBObjectStore.prototype.add = add; }
  await assertUnpublished('A', f); assert.deepEqual(await store.loadAnnotations(), f.payload);
  await store.saveBasSnapshot(f.plan, async () => f.bytes); assert.ok(await store.loadBasSnapshot(f.plan.snapshot_id));
});

test('late cancellation and staged corruption cannot publish an approval; staged records are cleaned', async () => {
  const f = await fixture(), store = createLocalStore('A'); await store.saveAnnotations(f.payload);
  const abort = new AbortController(), add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
    const result = add.apply(this, args);
    if (Array.isArray(args[1]) && args[1][0] === 'bas_snapshot_seal_v1') abort.abort();
    return result;
  };
  try { await assert.rejects(store.saveBasSnapshot(f.plan, async () => f.bytes, { signal: abort.signal }), /abort/i); }
  finally { IDBObjectStore.prototype.add = add; }
  await assertUnpublished('A', f);
  IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
    if (Array.isArray(args[1]) && args[1][0] === 'bas_snapshot_stage_v1' && args[1][3] === 'source') {
      const bytes = new Uint8Array((args[0] as ArrayBuffer).slice(0)); bytes[0] ^= 1; args[0] = bytes.buffer;
    }
    return add.apply(this, args);
  };
  try { await assert.rejects(store.saveBasSnapshot(f.plan, async () => f.bytes), /conflicts/); }
  finally { IDBObjectStore.prototype.add = add; }
  await assertUnpublished('A', f);
});

test('wrong input and conflicting retained original are never overwritten', async () => {
  const f = await fixture(), store = createLocalStore('A'); await store.saveAnnotations(f.payload);
  await assert.rejects(store.saveBasSnapshot(f.plan, async () => new Uint8Array(f.bytes.length)), /digest mismatch/);
  await assertUnpublished('A', f);
  const old = { schema_version: 'bas_original_pdf_v1', source: f.source, bytes: new Uint8Array(f.bytes.length).buffer };
  await metaPut(vault('A', f.source.source_id), old);
  await assert.rejects(store.saveBasSnapshot(f.plan, async () => f.bytes), /conflicts/);
  assert.deepEqual(await metaGet(vault('A', f.source.source_id)), old);
  assert.deepEqual((await store.listBasSnapshots()).items, []);
});

test('read refuses corrupted payload, seal, metadata, operation and originals instead of trusting the list', async () => {
  const f = await fixture(), store = createLocalStore('A'); await store.saveAnnotations(f.payload); await store.saveBasSnapshot(f.plan, async () => f.bytes);
  const corruptions: [string, (value: any) => any][] = [
    [k('payload_chunk', 'A', f.plan.snapshot_id, 0), value => { new Uint8Array(value)[0] ^= 1; return value; }],
    [k('record_chunk', 'A', f.plan.snapshot_id, 0), value => { new Uint8Array(value)[0] ^= 1; return value; }],
    [k('seal', 'A', f.plan.snapshot_id), value => ({ ...value, event_id: 'f'.repeat(64) })],
    [k('local', 'A', f.plan.snapshot_id), value => ({ ...value, reviewer: 'Altered metadata' })],
    [k('operation', 'A', f.request.operation_id), () => 'a'.repeat(64)],
    [basSourceChunkKey('A', f.source.source_id, 0) as unknown as string, value => { new Uint8Array(value)[0] ^= 1; return value; }],
  ];
  for (const [key, change] of corruptions) {
    const before = await metaGet(key); await metaPut(key, change(structuredClone(before)));
    await assert.rejects(store.loadBasSnapshot(f.plan.snapshot_id)); await metaPut(key, before);
  }
  assert.ok(await store.loadBasSnapshot(f.plan.snapshot_id));
});

test('multi-chunk payload/original roundtrips exact Unicode and survives ordinary save and closing a PDF', async () => {
  const f = await fixture(true), store = createLocalStore('A'); await store.saveAnnotations(f.payload);
  const wire = new TextEncoder().encode(canonicalBasJson(f.payload));
  assert.equal(wire[BAS_SOURCE_CHUNK_BYTES - 1], 0xe9); assert.equal(wire[BAS_SOURCE_CHUNK_BYTES], 0x9b, 'UTF-8 character deliberately crosses a storage chunk');
  await store.saveBasSnapshot(f.plan, async () => f.bytes);
  assert.ok(await metaGet(k('payload_chunk', 'A', f.plan.snapshot_id, 1)));
  assert.ok(await metaGet(basSourceChunkKey('A', f.source.source_id, 1) as unknown as string));
  const p = await store.loadBasSnapshot(f.plan.snapshot_id); assert.ok(p);
  assert.equal(readBasSnapshotPlan(p).payload_json, canonicalBasJson(f.payload));
  await store.addPdf(new File([new Uint8Array(f.bytes).buffer], 'controlled-original.pdf', { type: 'application/pdf' }));
  assert.ok((await store.listSheets()).some((sheet: { name: string }) => sheet.name === 'controlled-original.pdf'));
  await store.saveAnnotations({ schema: f.payload.schema, project_name: 'Replaced working import', shapes: [] });
  await store.removePdf('controlled-original.pdf');
  assert.deepEqual(await store.loadBasSource(f.source), f.bytes); assert.ok(await store.loadBasSnapshot(f.plan.snapshot_id));
});

test('bounded metadata pagination is project-scoped and never claims replayed/current approval', async () => {
  const f = await fixture(), store = createLocalStore('A'); await store.saveAnnotations(f.payload);
  await store.saveBasSnapshot(f.plan, async () => f.bytes);
  const second = await prepareBasSnapshotApproval(f.payload, { ...f.request, operation_id: uuid(951) }, 'operator_input', f.io);
  await store.saveBasSnapshot(second, async () => f.bytes);
  const one = await store.listBasSnapshots({ limit: 1 }); assert.equal(one.items.length, 1); assert.ok(one.next_cursor);
  const two = await store.listBasSnapshots({ limit: 1, after: one.next_cursor }); assert.equal(two.items.length, 1); assert.equal(two.next_cursor, null);
  assert.notEqual(one.items[0].snapshot_id, two.items[0].snapshot_id);
  await assert.rejects(store.listBasSnapshots({ limit: 101 })); await assert.rejects(store.listBasSnapshots({ after: 'invalid' }));
});

test('sync wrappers keep snapshots browser-local and reject closed scopes including an in-flight save', async () => {
  const f = await fixture(), base = createLocalStore('sync-A'); await base.saveAnnotations(f.payload);
  await metaPut('sync:sync-A:touched', true);
  let pushed = 0;
  const sync = createSyncStore({ base, folderId: 'sync-A', provider: { pull: async () => null,
    push: async () => { pushed++; return { rev: 1 }; } }, saveSnapshot: async () => ({ id: 'unused' }) }) as any;
  await sync.whenSynced();
  await sync.saveBasSnapshot(f.plan, async () => f.bytes); assert.equal(pushed, 0);
  assert.equal((await sync.listBasSnapshots()).items.length, 1); assert.ok(await sync.loadBasSnapshot(f.plan.snapshot_id));
  await assert.rejects(sync.saveBasSnapshot(f.plan, async () => { sync.dispose(); return f.bytes; }), /workspace was closed/);
  await assert.rejects(sync.listBasSnapshots(), /workspace was closed/); await assert.rejects(sync.loadBasSnapshot(f.plan.snapshot_id), /workspace was closed/);
  assert.equal(pushed, 0); assert.ok(await base.loadBasSnapshot(f.plan.snapshot_id));
});

test('snapshot saving retains a matching legacy original record without migrating or overwriting it', async () => {
  const f = await fixture(), store = createLocalStore('A'); await store.saveAnnotations(f.payload);
  await store.retainBasSource(f.payload.bas_workflow, f.source.source_id, f.bytes);
  const before = await metaGet(vault('A', f.source.source_id)); assert.equal(before.schema_version, 'bas_original_pdf_v1');
  await store.saveBasSnapshot(f.plan, async () => f.bytes);
  assert.deepEqual(await metaGet(vault('A', f.source.source_id)), before); assert.ok(await store.loadBasSnapshot(f.plan.snapshot_id));
});

test('partial staging quota cleans only this invocation and preserves an unrelated private stage', async () => {
  const f = await fixture(true), store = createLocalStore('A'); await store.saveAnnotations(f.payload);
  const unrelated = k('stage', 'A', 'unrelated-invocation', 'payload', f.plan.snapshot_id, 0);
  await metaPut(unrelated, new Uint8Array([1, 2, 3]).buffer);
  const add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
    if (Array.isArray(args[1]) && args[1][0] === 'bas_snapshot_stage_v1' && args[1][5] === 1)
      throw new DOMException('Controlled staging quota', 'QuotaExceededError');
    return add.apply(this, args);
  };
  try { await assert.rejects(store.saveBasSnapshot(f.plan, async () => f.bytes), /Controlled staging quota/); }
  finally { IDBObjectStore.prototype.add = add; }
  assert.deepEqual(await metaGet(unrelated), new Uint8Array([1, 2, 3]).buffer);
  assert.equal((await keys()).filter(key => Array.isArray(key) && String(key[0]).startsWith('bas_snapshot_')).length, 1);
  assert.deepEqual((await store.listBasSnapshots()).items, []); assert.equal(await store.loadBasSource(f.source), null);
});

test('closing sync at the final publication boundary aborts the whole pending transaction', async () => {
  const f = await fixture(), base = createLocalStore('late-close'); await base.saveAnnotations(f.payload);
  await metaPut('sync:late-close:touched', true);
  const sync = createSyncStore({ base, folderId: 'late-close', provider: { pull: async () => null,
    push: async () => { throw new Error('Must not sync snapshots'); } } }) as any;
  await sync.whenSynced();
  const add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
    const result = add.apply(this, args);
    if (Array.isArray(args[1]) && args[1][0] === 'bas_snapshot_seal_v1') sync.dispose();
    return result;
  };
  try { await assert.rejects(sync.saveBasSnapshot(f.plan, async () => f.bytes), /workspace was closed/); }
  finally { IDBObjectStore.prototype.add = add; sync.dispose(); }
  await assertUnpublished('late-close', f);
});

test('actual Drive/workspace composites bind new snapshot methods to their canonical annotation scopes', async () => {
  const f = await fixture();
  const drive = { findChild: async () => null, listChildren: async () => [], getJson: async () => null,
    putJson: async () => { throw new Error('Snapshots must remain browser-local'); }, createFolder: async () => ({ id: 'unused' }), deleteFile: async () => {} };
  const cloud = { ensureSidecarId: async () => 'sidecar', findSidecarFolder: async () => null };
  await metaPut('sync:Drive-A:touched', true); await metaPut('sync:workspace-provider:touched', true);
  const scoped = buildLocalFirstStore('Drive-A', drive, cloud) as any;
  const workspace = buildSyncedWorkspaceStore({ scope: 'workspace-provider', snapProvider: drive,
    provider: { pull: async () => null, push: async () => { throw new Error('No annotation push expected'); } },
    ensureSidecarId: cloud.ensureSidecarId, findSidecarId: cloud.findSidecarFolder }) as any;
  try {
    await Promise.all([scoped.syncBridge.whenSynced(), workspace.syncBridge.whenSynced()]);
    await createLocalStore('Drive-A').saveAnnotations(f.payload);
    await scoped.saveBasSnapshot(f.plan, async () => f.bytes);
    assert.ok(await scoped.loadBasSnapshot(f.plan.snapshot_id));
    assert.deepEqual((await workspace.listBasSnapshots()).items, []);
    await localStore.saveAnnotations(f.payload);
    await workspace.saveBasSnapshot(f.plan, async () => f.bytes);
    assert.ok(await localStore.loadBasSnapshot(f.plan.snapshot_id));
    assert.equal(await createLocalStore('workspace-provider').loadBasSnapshot(f.plan.snapshot_id), null);
    scoped.dispose(); workspace.dispose();
    await assert.rejects(scoped.listBasSnapshots(), /workspace was closed/);
    await assert.rejects(workspace.loadBasSnapshot(f.plan.snapshot_id), /workspace was closed/);
  } finally { scoped.dispose(); workspace.dispose(); }
});
