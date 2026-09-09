import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import { activeBasCapture, basWorkflowSchema, canonicalBasJson, captureBasPoints, mergeBasWorkflows, resolveBasPage, verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
import { basPointListsSchema } from '../src/lib/basPointLists.ts';
import { parseTakeoffImport, mergeTakeoffImport } from '../src/lib/importTakeoff.js';
import { createLocalStore, ANN_SCHEMA } from '../src/lib/store.js';
import { basResultForCanvas } from '../src/lib/basBrowserResult.js';

const points = basPointListsSchema.parse(JSON.parse(readFileSync(new URL('../../docs/bas-production/evidence/fort-sam-point-production-compile.json', import.meta.url), 'utf8')).bas_point_lists);
const sha256 = 'c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d';
const sources = [{ source_id: `sha256:${sha256}`, sha256, byte_length: 924578, page_count: 9, names: ['Fort Sam.pdf'] }];

test('real retained point result captures, verifies and replays without mutation', async () => {
  const before = structuredClone(points), a = await captureBasPoints(sources, points);
  assert.deepEqual(await verifyBasWorkflow(a), a);
  assert.deepEqual(await captureBasPoints(sources, points), a);
  assert.equal(a.captures[0].points.matrices.length, 12);
  assert.equal(a.captures[0].points.matrices.reduce((n, m) => n + m.rows.length, 0), 193);
  assert.deepEqual(points, before);
  assert.deepEqual(mergeBasWorkflows(a, a), a);
  assert.equal(activeBasCapture(a)?.capture_id, a.current_capture_id);
});

test('display rename preserves capture identity, source text and original geometry', async () => {
  const a = await captureBasPoints(sources, points);
  const remapped = basResultForCanvas({ bas_point_lists: structuredClone(points) }, new Map([[sha256, 'Renamed.pdf']]));
  const b = await captureBasPoints([{ ...sources[0], names: ['Renamed.pdf'] }], remapped.bas_point_lists);
  assert.equal(a.current_capture_id, b.current_capture_id);
  assert.equal(mergeBasWorkflows(a, b)?.captures.length, 1);
  assert.deepEqual(a.captures[0].points.matrices[0].raw.rows, b.captures[0].points.matrices[0].raw.rows);
});

test('canonical JSON preserves exact strings and arrays; rejects non-JSON and nonfinite numbers', () => {
  assert.equal(canonicalBasJson({ z: 'é', a: [2, 1, null, true] }), '{"a":[2,1,null,true],"z":"é"}');
  assert.notEqual(canonicalBasJson('é'), canonicalBasJson('e\u0301'));
  assert.notEqual(canonicalBasJson([1, 2]), canonicalBasJson([2, 1]));
  for (const value of [undefined, NaN, Infinity, 1n, new Date()]) assert.throws(() => canonicalBasJson(value));
});

test('controlled corruption and wrong source ownership are rejected, not sanitized away', async () => {
  const a = await captureBasPoints(sources, points), bad = structuredClone(a);
  bad.captures[0].points.matrices[0].raw.title!.text += ' altered';
  await assert.rejects(verifyBasWorkflow(bad), /fingerprint mismatch/);
  assert.throws(() => mergeBasWorkflows(a, bad), /Conflicting BAS evidence/);
  assert.throws(() => basWorkflowSchema.parse({ ...a, current_capture_id: 'f'.repeat(64) }));
  const reordered = structuredClone(a);
  reordered.captures[0].points.matrices.find(m => m.rows.length > 1)!.rows.reverse();
  assert.throws(() => basWorkflowSchema.parse(reordered), /row order/);
  await assert.rejects(captureBasPoints([{ ...sources[0], page_count: 1 }], points), /not owned/);
  await assert.rejects(captureBasPoints([{ ...sources[0], sha256: 'f'.repeat(64) }], points), /digest/);
  await assert.rejects(captureBasPoints([...sources, sources[0]], points), /Duplicate/);
  assert.deepEqual(await verifyBasWorkflow(a), a, 'rejection cannot mutate the original');
});

test('a changed capture is retained separately; importing cannot change operator selection', async () => {
  const a = await captureBasPoints(sources, points), changed = structuredClone(points);
  // Controlled diagnostic change, not a real drawing revision.
  changed.issues.push('CONTROLLED_NEW_FINDING');
  const b = await captureBasPoints(sources, changed);
  assert.notEqual(a.current_capture_id, b.current_capture_id);
  const merged = mergeBasWorkflows(a, b)!;
  assert.equal(merged.captures.length, 2);
  assert.equal(merged.current_capture_id, a.current_capture_id);
  assert.equal(mergeBasWorkflows(a, b, true)?.current_capture_id, b.current_capture_id);
  assert.deepEqual(mergeBasWorkflows(merged, b), merged);
});

test('source citation binds to loaded bytes, never a reused filename', () => {
  const page = `sha256:${sha256}:p4`;
  assert.equal(resolveBasPage(page, [{ name: 'renamed.pdf', sha256 }]), 'renamed.pdf#4');
  assert.equal(resolveBasPage(`sha256:${sha256}:p1`, [{ name: 'drawing#1.pdf', sha256 }]), 'drawing#1.pdf');
  assert.equal(resolveBasPage(page, [{ name: 'Fort Sam.pdf', sha256: 'b'.repeat(64) }]), null);
  assert.equal(resolveBasPage(page, []), null);
  assert.equal(resolveBasPage(page.replace(':p4', ':p0'), sources.map(s => ({ name: 'x', sha256: s.sha256 }))), null);
});

test('project import preserves BAS-only work, merges idempotently, and rejects malformed extension', async () => {
  const a = await captureBasPoints(sources, points);
  const current = { schema: ANN_SCHEMA, project_name: 'Operator name', shapes: [], bas_workflow: a };
  const incoming = parseTakeoffImport(JSON.stringify({ schema: ANN_SCHEMA, project_name: 'Imported', bas_workflow: a }));
  const merged = mergeTakeoffImport(current, incoming);
  assert.equal(merged.note.replaced, false);
  assert.equal(merged.payload.project_name, 'Operator name');
  assert.deepEqual(merged.payload.bas_workflow, a);
  assert.deepEqual(mergeTakeoffImport(merged.payload, incoming).payload, merged.payload);
  assert.throws(() => parseTakeoffImport(JSON.stringify({ schema: ANN_SCHEMA, bas_workflow: { bad: true } })));
  assert.equal('bas_workflow' in mergeTakeoffImport({ shapes: [] }, { schema: ANN_SCHEMA }).payload, false);
});

test('real project store saves/reloads the full evidence; old snapshots have no inherited capture', async () => {
  const a = await captureBasPoints(sources, points);
  const store = createLocalStore('bas-workflow-test');
  await store.saveAnnotations({ project_name: 'BAS fixture', bas_workflow: a });
  const restored = await store.loadAnnotations();
  assert.deepEqual(await verifyBasWorkflow(restored.bas_workflow), a);
  await store.saveAnnotations({ project_name: 'Older project', shapes: [] });
  assert.equal((await store.loadAnnotations()).bas_workflow, undefined);
});
