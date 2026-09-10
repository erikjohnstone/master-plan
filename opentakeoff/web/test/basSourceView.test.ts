import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBasSourceContext } from '../src/lib/basSources.ts';
import { basPointListsSchema } from '../src/lib/basPointLists.ts';
import { captureBasEvidence, captureBasPoints, mergeBasWorkflows } from '../src/lib/basWorkflow.ts';
import { prepareBasSourceView, assertBasSourceViewFrame, basSourceViewRegion } from '../src/lib/basSourceView.ts';

const points = basPointListsSchema.parse({ schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1',
  scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [] });
const id = `sha256:${'a'.repeat(64)}:p1`;
const frame = { width_px: 800, height_px: 600, rotation: 90 };
async function fixture(overrides = {}) {
  const source = buildBasSourceContext([{ name: 'same.pdf', sha256: 'a'.repeat(64), byte_length: 10, page_count: 1,
    pages: [{ page_number: 1, sheet_key: 'same.pdf', ...frame, spans: [], ...overrides }] }]);
  return { source, workflow: await captureBasEvidence(source, points) };
}

test('exact historical page, unchanged bbox and frame survive aliases/current capture changes', async () => {
  const a = await fixture(), b = await fixture();
  b.source.documents[0].names = ['renamed.pdf']; b.source.pages[0].sheet_keys = ['renamed.pdf'];
  const renamed = await captureBasEvidence(b.source, { ...points, issues: ['other capture'] });
  const workflow = mergeBasWorkflows(a.workflow, renamed)!;
  const before = structuredClone(workflow), bbox_px: [number, number, number, number] = [10, 20, 100, 70];
  const view = await prepareBasSourceView(workflow, { page_id: id, bbox_px });
  assert.deepEqual(view.bbox_px, bbox_px); assert.notEqual(view.bbox_px, bbox_px);
  assert.deepEqual(view.names, ['renamed.pdf', 'same.pdf']); assert.deepEqual(view.frame, frame);
  assertBasSourceViewFrame(view, { page_count: 1, ...frame });
  assert.deepEqual(workflow, before); assert.equal('approval' in view, false);
  assert.deepEqual(basSourceViewRegion(view, 800, 600, false), { x0: 0, y0: 0, x1: 800, y1: 600 });
  assert.deepEqual(basSourceViewRegion(view, 800, 600, true), { x0: 0, y0: 0, x1: 124, y1: 94 });
  assert.deepEqual(view.bbox_px, bbox_px, 'display padding never changes the source box');
});

test('foreign, malformed, missing, noninteger and unsafe page identities refuse', async () => {
  const { workflow } = await fixture();
  for (const page_id of [id.replace(':p1', ':p2'), id.replace('aaaa', 'bbbb'), id.replace(':p1', ':p9007199254740993')]) {
    await assert.rejects(prepareBasSourceView(workflow, { page_id }), /not owned/);
  }
  for (const page_id of ['same.pdf', id.replace(':p1', ':p01'), id.replace(':p1', ':p0'), id.replace(':p1', ':p1.1')]) {
    await assert.rejects(prepareBasSourceView(workflow, { page_id }));
  }
  for (const bbox_px of [[-1, 0, 5, 5], [0, 0, 801, 5], [0, 0, 1, 601], [2, 0, 1, 5], [0, 0, 0, 5]]) {
    await assert.rejects(prepareBasSourceView(workflow, { page_id: id, bbox_px }), /outside/);
  }
  await assert.rejects(prepareBasSourceView(workflow, { page_id: id, bbox_px: [0, 0, Infinity, 5] }));
});

test('rotated dimensions, page count and re-signed conflicting saved frames refuse, never auto-fit', async () => {
  const { workflow } = await fixture(), other = await fixture({ rotation: 0 });
  await assert.rejects(prepareBasSourceView(mergeBasWorkflows(workflow, other.workflow), { page_id: id }), /Conflicting saved frames/);
  const view = await prepareBasSourceView(workflow, { page_id: id });
  for (const actual of [{ ...frame, width_px: 600, height_px: 800 }, { ...frame, rotation: 0 }, { ...frame, width_px: 800.01 }]) {
    assert.throws(() => assertBasSourceViewFrame(view, { page_count: 1, ...actual }), /disagrees/);
  }
  assert.throws(() => assertBasSourceViewFrame(view, { ...frame, page_count: 2 }), /page count/);
  assert.throws(() => assertBasSourceViewFrame(view, { ...frame, page_count: 1, width_px: NaN }), /invalid/);
});

test('legacy captures allow exact whole-page review, not guessed bbox transforms', async () => {
  const { source } = await fixture(), workflow = await captureBasPoints(source.documents, points);
  const view = await prepareBasSourceView(workflow, { page_id: id });
  assert.equal(view.frame, null); assert.equal(view.bbox_px, null);
  assertBasSourceViewFrame(view, { ...frame, page_count: 1 });
  await assert.rejects(prepareBasSourceView(workflow, { page_id: id, bbox_px: [0, 0, 10, 10] }), /Saved page frame unavailable/);
});

test('corrupt history and caller mutation cannot change a pending original-source request', async () => {
  const { workflow } = await fixture(), request = { page_id: id, bbox_px: [0, 0, 10, 10] };
  const pending = prepareBasSourceView(workflow, request);
  request.bbox_px[2] = 900; workflow.captures[0].points.issues.push('tamper');
  assert.deepEqual((await pending).bbox_px, [0, 0, 10, 10]);
  await assert.rejects(prepareBasSourceView(workflow, { page_id: id }), /fingerprint/);
});

test('source review limits are checked before opening or allocating original PDF bytes', async () => {
  const { source } = await fixture();
  source.documents[0].byte_length = 512 * 1024 * 1024;
  const atLimit = await captureBasPoints(source.documents, points);
  assert.equal((await prepareBasSourceView(atLimit, { page_id: id })).source.byte_length, 512 * 1024 * 1024);
  source.documents[0].byte_length++;
  await assert.rejects(prepareBasSourceView(await captureBasPoints(source.documents, points), { page_id: id }), /512 MiB/);
});
