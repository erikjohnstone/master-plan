import 'fake-indexeddb/auto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareBasRestore, readBasRestorePlan, replayBasRestore, basRestoreJson } from '../src/lib/basRestore.ts';
import { prepareBasWorkflowReplay } from '../src/lib/basWorkflowReplay.ts';
import { captureBasPoints, mergeBasWorkflows } from '../src/lib/basWorkflow.ts';
import { basPointListsSchema } from '../src/lib/basPointLists.ts';
import { sha256Hex } from '../src/lib/graphKeys.js';
import { localStore, createLocalStore, emptyAnnotations, metaGet, metaPut } from '../src/lib/store.js';
import { annotationGeneration } from '../src/lib/annotationGeneration.js';
import { BAS_SOURCE_CHUNK_BYTES, basSourceChunkKey } from '../src/lib/basSourceStorage.js';

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
const bundle = 'c'.repeat(64);
const points = basPointListsSchema.parse({ schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1',
  scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [] });
async function fixture(text = '%PDF-controlled-original', name = 'original.pdf') {
  const bytes = new TextEncoder().encode(text), sha256 = await sha256Hex(bytes);
  const source = { source_id: `sha256:${sha256}`, sha256, byte_length: bytes.length, page_count: 2 };
  const workflow = await captureBasPoints([{ ...source, names: [name] }], points);
  return { bytes, source, payload: { schema: emptyAnnotations().schema, bas_workflow: workflow } };
}
// Unit stub for EMPTY histories only. Actual Python replay is separately an
// integration gate; this does not claim arithmetic coverage from injected output.
async function emptyReplay(workflow: any) {
  const prepared = await prepareBasWorkflowReplay(workflow);
  assert.ok(Object.values(prepared.checked_records).every(ids => ids.length === 0));
  return { schema_version: 'bas_workflow_replay_v1', rule_version: 'saved_bas_calculations_1',
    workflow_sha256: prepared.workflow_sha256, checked_records: prepared.checked_records,
    calculation_verification: 'no_saved_calculations', project_complete: false };
}
async function prepared(current: any, incoming: any) {
  const plan = await prepareBasRestore(current, incoming, bundle); await replayBasRestore(plan, emptyReplay); return plan;
}
const restore = (plan: any, bytes: Uint8Array, options: any = {}) => localStore.restoreBasEvidence(plan, async () => bytes, options);
const vaultKey = (id: string) => ['bas_source_v1', '', id] as unknown as string;

test('shared preview owns exact inputs, preserves operator state and verifies merged history before replay', async () => {
  const a = await fixture(), b = await fixture('%PDF-another');
  const current = { ...emptyAnnotations(), ...a.payload, project_name: 'Keep this name' }, incoming = { ...b.payload, project_name: 'Imported name' };
  const pending = prepareBasRestore(current, incoming, bundle); incoming.project_name = 'Mutation';
  const plan = await pending, owned = readBasRestorePlan(plan);
  assert.equal(owned.payload.project_name, 'Keep this name'); assert.equal(plan.preview.originals, 2);
  assert.equal(owned.payload.bas_workflow.captures.length, 2);
  owned.payload.project_name = 'Cannot mutate'; assert.equal(readBasRestorePlan(plan).payload.project_name, 'Keep this name');
  assert.throws(() => readBasRestorePlan(plan, true), /requires successful shared Python/);
  assert.throws(() => readBasRestorePlan({ ...plan }), /preview is no longer/);
  await assert.rejects(replayBasRestore(plan, async workflow => ({ ...await emptyReplay(workflow), workflow_sha256: 'f'.repeat(64) })), /exact saved workflow/);
  let captureCount = 0;
  await replayBasRestore(plan, async workflow => { captureCount = workflow.captures.length; return emptyReplay(workflow); });
  assert.equal(captureCount, 2); assert.equal(readBasRestorePlan(plan, true).replay?.project_complete, false);
});

test('actual IDB restore publishes every original, unchanged history, previous-state journal and new save generation together', async () => {
  const a = await fixture(), b = await fixture('%PDF-second-source');
  const current = { ...emptyAnnotations(), ...a.payload, project_name: 'Operator name' };
  await localStore.saveAnnotations(current);
  const plan = await prepared(await localStore.loadAnnotations(), b.payload);
  const result: any = await localStore.restoreBasEvidence(plan, async (item: any) => item.source.source_id === a.source.source_id ? a.bytes : b.bytes);
  assert.equal(result.restored, true); assert.equal(result.approved, false);
  const saved = await localStore.loadAnnotations();
  assert.equal(annotationGeneration(saved), plan.operation_id);
  assert.equal(saved.project_name, 'Operator name'); assert.equal(saved.bas_workflow.captures.length, 2);
  assert.deepEqual(await localStore.loadBasSource(a.source), a.bytes);
  assert.deepEqual(await localStore.loadBasSource(b.source), b.bytes);
  assert.deepEqual(await localStore.listSheets(), [], 'historical originals are not active counting sheets');
  const journal = await localStore.loadBasRestoreJournal(plan.operation_id);
  assert.deepEqual(journal.previous_payload, current); assert.equal(journal.sources.length, 2); assert.equal(journal.approved, false);
  await assert.rejects(localStore.saveAnnotations(current), /saved state was replaced/);
  await localStore.saveAnnotations({ ...saved, project_name: 'New edit' }, { generation: plan.operation_id });
  assert.deepEqual(await localStore.loadBasRestoreJournal(plan.operation_id), journal, 'ordinary saves cannot discard restore journal');
});

test('same operation retry is idempotent; newer edits cannot be reset by retry', async () => {
  const a = await fixture(), plan = await prepared(emptyAnnotations(), a.payload);
  await restore(plan, a.bytes); const journal = await localStore.loadBasRestoreJournal(plan.operation_id);
  await restore(plan, a.bytes); assert.deepEqual(await localStore.loadBasRestoreJournal(plan.operation_id), journal);
  await localStore.saveAnnotations({ ...await localStore.loadAnnotations(), project_name: 'Later' }, { generation: plan.operation_id });
  await assert.rejects(restore(plan, a.bytes), /saved state was replaced/);
  assert.equal((await localStore.loadAnnotations()).project_name, 'Later');
});

test('stale preview, failed replay, cancellation and missing original leave annotations, originals and journal unchanged', async () => {
  const a = await fixture(), before = emptyAnnotations(), plan = await prepared(before, a.payload);
  const unverified = await prepareBasRestore(before, a.payload, bundle);
  await assert.rejects(restore(unverified, a.bytes), /requires successful shared Python/);
  await assert.rejects(restore(plan, new Uint8Array()), /length mismatch/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(restore(plan, a.bytes, { signal: controller.signal }), /abort/i);
  assert.deepEqual(await localStore.loadAnnotations(), before); assert.equal(await localStore.loadBasSource(a.source), null);
  assert.equal(await localStore.loadBasRestoreJournal(plan.operation_id), undefined);
  await localStore.saveAnnotations({ ...before, project_name: 'Intervening' });
  await assert.rejects(restore(plan, a.bytes), /saved state was replaced/);
  assert.equal((await localStore.loadAnnotations()).project_name, 'Intervening');
  assert.equal(await localStore.loadBasSource(a.source), null);
});

test('quota or injected late transaction abort rolls back sources, payload, generation and journal; retry succeeds', async () => {
  const a = await fixture(), plan = await prepared(emptyAnnotations(), a.payload), add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function(value: any, key?: IDBValidKey) {
    if (Array.isArray(key) && key[0] === 'bas_restore_journal_v1') throw new DOMException('Controlled quota', 'QuotaExceededError');
    return add.call(this, value, key);
  };
  try { await assert.rejects(restore(plan, a.bytes), /Controlled quota/); }
  finally { IDBObjectStore.prototype.add = add; }
  assert.deepEqual(await localStore.loadAnnotations(), emptyAnnotations()); assert.equal(await localStore.loadBasSource(a.source), null);
  assert.equal(await localStore.loadBasRestoreJournal(plan.operation_id), undefined);
  await restore(plan, a.bytes); assert.deepEqual(await localStore.loadBasSource(a.source), a.bytes);
});

test('staged tampering and existing corrupt vault records are not promoted or overwritten', async () => {
  const a = await fixture(), plan = await prepared(emptyAnnotations(), a.payload), add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function(value: any, key?: IDBValidKey) {
    if (Array.isArray(key) && key[0] === 'bas_restore_stage_chunk_v1') { value = structuredClone(value); new Uint8Array(value)[0] ^= 1; }
    return add.call(this, value, key);
  };
  try { await assert.rejects(restore(plan, a.bytes), /conflicts with verified evidence/); }
  finally { IDBObjectStore.prototype.add = add; }
  assert.deepEqual(await localStore.loadAnnotations(), emptyAnnotations());
  await metaPut(vaultKey(a.source.source_id), { schema_version: 'broken', source: a.source, bytes: a.bytes.buffer });
  const corrupt = await metaGet(vaultKey(a.source.source_id));
  await assert.rejects(restore(plan, a.bytes), /conflicts with verified evidence/);
  assert.deepEqual(await metaGet(vaultKey(a.source.source_id)), corrupt);
});

test('bare first-page and numbered annotations require exact loaded originals, not a matching filename or cached hash', async () => {
  const a = await fixture(), b = await fixture('%PDF-changed-namesake');
  const incoming = { ...a.payload, shapes: [{ id: 'a', sheet_id: 'original.pdf' }], markups: [{ id: 'b', sheet_id: 'original.pdf#2' }] };
  const plan = await prepared(emptyAnnotations(), incoming);
  assert.deepEqual(plan.preview.legacy_files, ['original.pdf']);
  await assert.rejects(restore(plan, a.bytes), /Open the exact archived original/);
  await localStore.addPdf(new File([b.bytes], 'original.pdf'));
  await assert.rejects(restore(plan, a.bytes), /newer namesake/);
  await localStore.addPdf(new File([a.bytes], 'original.pdf'));
  await restore(plan, a.bytes);
  assert.deepEqual((await localStore.loadAnnotations()).shapes, incoming.shapes);
  assert.deepEqual((await localStore.loadAnnotations()).markups, incoming.markups);
});

test('ambiguous historical aliases, foreign first-page references and out-of-range pages refuse without guessing', async () => {
  const a = await fixture(), b = await fixture('%PDF-changed-namesake');
  const both = { ...a.payload, bas_workflow: mergeBasWorkflows(a.payload.bas_workflow, b.payload.bas_workflow), shapes: [{ id: 'x', sheet_id: 'original.pdf' }] };
  await assert.rejects(prepareBasRestore(emptyAnnotations(), both, bundle), /unambiguous original/);
  await assert.rejects(prepareBasRestore(emptyAnnotations(), { ...a.payload, shapes: [{ id: 'x', sheet_id: 'foreign' }] }, bundle), /unambiguous original/);
  await assert.rejects(prepareBasRestore(emptyAnnotations(), { ...a.payload, shapes: [{ id: 'x', sheet_id: 'original.pdf#3' }] }, bundle), /outside the archived/);
});

test('unchanged unrelated operator geometry is preserved without claiming it came from the incoming BAS backup', async () => {
  const a = await fixture(), current = { ...emptyAnnotations(), shapes: [{ id: 'x', sheet_id: 'unrelated.pdf' }] };
  const plan = await prepared(current, a.payload);
  assert.deepEqual(plan.preview.legacy_files, []); assert.deepEqual(readBasRestorePlan(plan).payload.shapes, current.shapes);
});

test('numeric colors and saved view tabs are not annotation provenance or active-source requirements', async () => {
  const a = await fixture();
  const incoming = { ...a.payload, conditions: [{ id: 'cond', color: '#475569', fill: '#123456' }], sheet_tabs: ['original.pdf'] };
  const plan = await prepared(emptyAnnotations(), incoming);
  assert.deepEqual(plan.preview.legacy_files, []);
  await restore(plan, a.bytes); assert.deepEqual((await localStore.loadAnnotations()).conditions, incoming.conditions);
  assert.deepEqual(await localStore.listSheets(), []);
});

test('project-local publication and generation never bleed into another project', async () => {
  const a = await fixture(), A = createLocalStore('Project A'), B = createLocalStore('Project B');
  const plan = await prepared(await A.loadAnnotations(), a.payload);
  await A.restoreBasEvidence(plan, async () => a.bytes);
  assert.equal(annotationGeneration(await A.loadAnnotations()), plan.operation_id);
  assert.equal(annotationGeneration(await B.loadAnnotations()), null);
  assert.equal(await B.loadBasSource(a.source), null); assert.equal(await localStore.loadBasSource(a.source), null);
  assert.equal(await B.loadBasRestoreJournal(plan.operation_id), undefined);
  assert.equal(basRestoreJson(await B.loadAnnotations()), basRestoreJson(emptyAnnotations()));
});

test('multi-chunk originals restore, reopen and retain idempotently; missing or corrupted chunks never verify', async () => {
  const bytes = new Uint8Array(BAS_SOURCE_CHUNK_BYTES + 17).fill(23), sha256 = await sha256Hex(bytes);
  const source = { source_id: `sha256:${sha256}`, sha256, byte_length: bytes.length, page_count: 1 };
  const workflow = await captureBasPoints([{ ...source, names: ['large.pdf'] }], points);
  const plan = await prepared(emptyAnnotations(), { schema: emptyAnnotations().schema, bas_workflow: workflow });
  await restore(plan, bytes);
  assert.deepEqual(await localStore.loadBasSource(source), bytes);
  assert.equal((await localStore.retainBasSource(workflow, source.source_id, bytes)).retained, false);
  const chunkKey = basSourceChunkKey('', source.source_id, 1) as unknown as string;
  await metaPut(chunkKey, new Uint8Array(17).fill(24).buffer);
  await assert.rejects(localStore.loadBasSource(source), /digest mismatch/);
  await assert.rejects(localStore.retainBasSource(workflow, source.source_id, bytes), /chunks conflict/);
  await assert.rejects(restore(plan, bytes), /conflicts with verified evidence/, 'an old success journal cannot bypass fresh source verification on retry');
  const another = await prepared(await localStore.loadAnnotations(), { schema: emptyAnnotations().schema, bas_workflow: workflow });
  await assert.rejects(restore(another, bytes, { generation: plan.operation_id }), /conflicts with verified evidence/);
  await metaPut(chunkKey, new Uint8Array().buffer);
  await assert.rejects(localStore.loadBasSource(source), /missing or corrupt/);
});

test('ordinary original retention uses bounded chunks too and remains readable after closing the active PDF', async () => {
  const bytes = new Uint8Array(BAS_SOURCE_CHUNK_BYTES + 3).fill(31), sha256 = await sha256Hex(bytes);
  const source = { source_id: `sha256:${sha256}`, sha256, byte_length: bytes.length, page_count: 1 };
  const workflow = await captureBasPoints([{ ...source, names: ['retained.pdf'] }], points);
  await localStore.saveAnnotations({ bas_workflow: workflow });
  await localStore.addPdf(new File([bytes], 'retained.pdf'));
  assert.equal((await localStore.retainBasSource(workflow, source.source_id, bytes)).retained, true);
  assert.equal((await localStore.retainBasSource(workflow, source.source_id, bytes)).retained, false);
  await localStore.removePdf('retained.pdf');
  assert.deepEqual(await localStore.loadBasSource(source), bytes);
});
