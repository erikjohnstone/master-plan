import 'fake-indexeddb/auto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { basSourceInventory, prepareBasSourceRetention, verifyBasSourceBytes } from '../src/lib/basSourceRetention.ts';
import { captureBasPoints, mergeBasWorkflows, canonicalBasJson } from '../src/lib/basWorkflow.ts';
import { basPointListsSchema } from '../src/lib/basPointLists.ts';
import { sha256Hex } from '../src/lib/graphKeys.js';
import { localStore, createLocalStore, metaPut, metaGet } from '../src/lib/store.js';
import { findBasOriginal } from '../src/lib/basSourceBrowser.js';

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
const points = basPointListsSchema.parse({ schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1',
  scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [] });
// Small controlled bytes exercise storage/identity, not PDF parser correctness.
async function fixture(text = '%PDF-controlled-original', name = 'same-name.pdf', issue = '') {
  const bytes = new TextEncoder().encode(text), sha256 = await sha256Hex(bytes);
  const source = { source_id: `sha256:${sha256}`, sha256, byte_length: bytes.byteLength, page_count: 1 };
  const workflow = await captureBasPoints([{ ...source, names: [name] }], { ...points, issues: issue ? [issue] : [] });
  return { bytes, source, workflow };
}
const key = (project: string, sourceId: string) => ['bas_source_v1', project, sourceId] as unknown as string;

test('shared inventory preserves historical versions, deduplicates physical bytes and treats names as aliases only', async () => {
  const a = await fixture(), renamed = await fixture(undefined, 'renamed.pdf', 'controlled other capture');
  const revised = await fixture('%PDF-controlled-revised');
  const workflow = mergeBasWorkflows(mergeBasWorkflows(a.workflow, renamed.workflow), revised.workflow)!;
  const before = canonicalBasJson(workflow), inventory = await basSourceInventory(workflow);
  assert.equal(inventory.length, 2);
  const original = inventory.find(i => i.source.source_id === a.source.source_id)!;
  assert.deepEqual(original.names, ['renamed.pdf', 'same-name.pdf']);
  assert.equal(original.capture_ids.length, 2);
  assert.notEqual(inventory[0].source.source_id, inventory[1].source.source_id);
  assert.equal(canonicalBasJson(workflow), before);
  assert.equal('approval' in inventory[0], false);
});

test('shared ownership rejects foreign IDs, corrupt workflow and conflicting same-digest physical metadata', async () => {
  const a = await fixture();
  await assert.rejects(prepareBasSourceRetention(a.workflow, `sha256:${'f'.repeat(64)}`, a.bytes), /not owned/);
  const corrupt = structuredClone(a.workflow); corrupt.captures[0].points.issues.push('tampered');
  await assert.rejects(basSourceInventory(corrupt), /fingerprint/);
  const changed = await captureBasPoints([{ ...a.source, page_count: 2, names: ['same-name.pdf'] }], points);
  await assert.rejects(basSourceInventory(mergeBasWorkflows(a.workflow, changed)), /Conflicting physical metadata/);
});

test('byte verifier checks exact length/digest, bounded views, type and caller mutation before await', async () => {
  const a = await fixture();
  const padded = new Uint8Array(a.bytes.length + 8); padded.set(a.bytes, 4);
  assert.deepEqual(await verifyBasSourceBytes(a.source, padded.subarray(4, -4)), a.bytes);
  await assert.rejects(verifyBasSourceBytes(a.source, padded), /length mismatch/);
  const wrong = a.bytes.slice(); wrong[0] ^= 1;
  await assert.rejects(verifyBasSourceBytes(a.source, wrong), /digest mismatch/);
  await assert.rejects(verifyBasSourceBytes({ ...a.source, sha256: 'f'.repeat(64) }, a.bytes), /digest disagrees/);
  await assert.rejects(verifyBasSourceBytes(a.source, 'fake' as unknown as Uint8Array), /must be PDF bytes/);
  const owned = a.bytes.slice(), pending = verifyBasSourceBytes(a.source, owned); owned.fill(0);
  assert.deepEqual(await pending, a.bytes);
});

test('IDB retains original through same-name replacement and close; retry is idempotent and no annotation changes', async () => {
  const a = await fixture(), revised = await fixture('%PDF-controlled-revised');
  const annotation = { project_name: 'Original', bas_workflow: a.workflow, shapes: [{ id: 'preserve' }] };
  await localStore.saveAnnotations(annotation);
  const before = await localStore.loadAnnotations();
  await localStore.addPdf(new File([a.bytes], 'same-name.pdf'));
  assert.equal((await localStore.retainBasSource(a.workflow, a.source.source_id, a.bytes)).retained, true);
  assert.equal((await localStore.retainBasSource(a.workflow, a.source.source_id, a.bytes)).retained, false);
  await localStore.addPdf(new File([revised.bytes], 'same-name.pdf'));
  await localStore.removePdf('same-name.pdf');
  assert.equal((await localStore.listPdfRevisions('same-name.pdf')).length, 0);
  assert.deepEqual(await createLocalStore().loadBasSource(a.source), a.bytes);
  assert.deepEqual(await localStore.loadAnnotations(), before);
  const read = await localStore.loadBasSource(a.source); read!.fill(0);
  assert.deepEqual(await localStore.loadBasSource(a.source), a.bytes, 'consumer mutation cannot corrupt stored bytes');
});

test('retained originals are isolated by project, including delimiter-like names and anonymous scope', async () => {
  const a = await fixture(), A = createLocalStore('A'), B = createLocalStore('A:bas_source_v1');
  await A.saveAnnotations({ bas_workflow: a.workflow });
  await B.saveAnnotations({ bas_workflow: a.workflow });
  await A.retainBasSource(a.workflow, a.source.source_id, a.bytes);
  assert.deepEqual(await A.loadBasSource(a.source), a.bytes);
  assert.equal(await B.loadBasSource(a.source), null);
  assert.equal(await localStore.loadBasSource(a.source), null);
  assert.equal(createLocalStore(''), localStore);
});

test('stale/missing persisted workflow and foreign sources refuse without creating records', async () => {
  const a = await fixture(), changed = await fixture(undefined, undefined, 'changed');
  await assert.rejects(localStore.retainBasSource(a.workflow, a.source.source_id, a.bytes), /not yet saved/);
  await localStore.saveAnnotations({ bas_workflow: changed.workflow });
  await assert.rejects(localStore.retainBasSource(a.workflow, a.source.source_id, a.bytes), /workflow changed/);
  assert.equal(await localStore.loadBasSource(a.source), null);
  assert.deepEqual((await localStore.loadAnnotations()).bas_workflow, changed.workflow);
});

test('a concurrent persisted edit during verification wins; retention does not overwrite it', async () => {
  const a = await fixture(), changed = await fixture(undefined, undefined, 'new revision');
  await localStore.saveAnnotations({ bas_workflow: a.workflow });
  const pending = localStore.retainBasSource(a.workflow, a.source.source_id, a.bytes);
  const rejected = assert.rejects(pending, /workflow changed/);
  await localStore.saveAnnotations({ bas_workflow: changed.workflow });
  await rejected;
  assert.equal(await localStore.loadBasSource(a.source), null);
  assert.deepEqual((await localStore.loadAnnotations()).bas_workflow, changed.workflow);
});

test('caller mutation during lazy import cannot alter the retained original or expected workflow', async () => {
  const a = await fixture(), original = a.bytes.slice();
  await localStore.saveAnnotations({ bas_workflow: a.workflow });
  const pending = localStore.retainBasSource(a.workflow, a.source.source_id, a.bytes);
  a.bytes.fill(0); a.workflow.captures[0].points.issues.push('caller mutation');
  await pending;
  assert.deepEqual(await localStore.loadBasSource(a.source), original);
  assert.deepEqual((await localStore.loadAnnotations()).bas_workflow.captures[0].points.issues, []);
});

test('corrupted existing bytes/metadata are refused on load/retry and never silently overwritten', async () => {
  const a = await fixture(); await localStore.saveAnnotations({ bas_workflow: a.workflow });
  await localStore.retainBasSource(a.workflow, a.source.source_id, a.bytes);
  const record = await metaGet(key('', a.source.source_id)); new Uint8Array(record.bytes)[0] ^= 1;
  await metaPut(key('', a.source.source_id), record);
  await assert.rejects(localStore.loadBasSource(a.source), /digest mismatch/);
  await assert.rejects(localStore.retainBasSource(a.workflow, a.source.source_id, a.bytes), /not overwritten/);
  assert.deepEqual(await metaGet(key('', a.source.source_id)), record);
  record.source.byte_length++; await metaPut(key('', a.source.source_id), record);
  await assert.rejects(localStore.loadBasSource(a.source), /metadata is corrupt/);
});

test('transaction abort after request success does not report retention; existing original survives and retry works', async () => {
  const a = await fixture(), b = await fixture('%PDF-other-original');
  const workflow = mergeBasWorkflows(a.workflow, b.workflow)!;
  await localStore.saveAnnotations({ bas_workflow: workflow });
  await localStore.retainBasSource(workflow, a.source.source_id, a.bytes);
  const add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args) {
    const request = add.apply(this, args);
    if (Array.isArray(args[1]) && args[1][0] === 'bas_source_v1') request.addEventListener('success', () => this.transaction.abort());
    return request;
  };
  try { await assert.rejects(localStore.retainBasSource(workflow, b.source.source_id, b.bytes), /aborted/); }
  finally { IDBObjectStore.prototype.add = add; }
  assert.equal(await localStore.loadBasSource(b.source), null);
  assert.deepEqual(await localStore.loadBasSource(a.source), a.bytes);
  assert.equal((await localStore.retainBasSource(workflow, b.source.source_id, b.bytes)).retained, true);
});

test('quota failure keeps all prior evidence and saved history; no implicit cleanup', async () => {
  const a = await fixture(), b = await fixture('%PDF-other-original');
  const workflow = mergeBasWorkflows(a.workflow, b.workflow)!;
  await localStore.saveAnnotations({ bas_workflow: workflow });
  await localStore.retainBasSource(workflow, a.source.source_id, a.bytes);
  const add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args) {
    if (Array.isArray(args[1]) && args[1][0] === 'bas_source_v1') throw new DOMException('Controlled quota failure', 'QuotaExceededError');
    return add.apply(this, args);
  };
  try { await assert.rejects(localStore.retainBasSource(workflow, b.source.source_id, b.bytes), { name: 'QuotaExceededError' }); }
  finally { IDBObjectStore.prototype.add = add; }
  assert.equal(await localStore.loadBasSource(b.source), null);
  assert.deepEqual(await localStore.loadBasSource(a.source), a.bytes);
  assert.deepEqual((await localStore.loadAnnotations()).bas_workflow, workflow);
});

test('browser lookup finds renamed exact bytes and historical originals without accepting a newer namesake', async () => {
  const a = await fixture(), b = await fixture('%PDF-controlled-revised');
  const item = (await basSourceInventory(a.workflow))[0];
  await localStore.addPdf(new File([a.bytes], 'same-name.pdf'));
  await localStore.addPdf(new File([b.bytes], 'same-name.pdf'));
  assert.deepEqual(await findBasOriginal(localStore, item), a.bytes, 'old revision, not current namesake');
  await localStore.removePdf('same-name.pdf');
  await localStore.addPdf(new File([a.bytes], 'renamed.pdf'));
  assert.deepEqual(await findBasOriginal(localStore, item), a.bytes, 'rename resolved by actual bytes');
  await localStore.removePdf('renamed.pdf');
  await localStore.addPdf(new File([b.bytes], 'same-name.pdf'));
  await assert.rejects(findBasOriginal(localStore, item), /newer file with the same name is not a substitute/);
});

test('browser lookup stops after a project change and never treats failed source reads as verified absence', async () => {
  const a = await fixture(), item = (await basSourceInventory(a.workflow))[0];
  let current = true;
  await assert.rejects(findBasOriginal({ async listSheets() { current = false; return [{ name: 'same-name.pdf' }]; },
    async loadPdfData() { throw new Error('must not run'); } }, item, () => current), /workspace changed/);
  await assert.rejects(findBasOriginal({ async listSheets() { return [{ name: 'same-name.pdf' }]; },
    async loadPdfData() { throw new Error('offline'); } }, item), /1 source reads also failed/);
});
