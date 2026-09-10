import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../server.ts';
import { Session } from '../src/session.ts';
import { viewBasOriginalSource } from '../src/basSourceView.ts';
import { captureBasEvidence } from '../../web/src/lib/basWorkflow.ts';
import { basPointListsSchema } from '../../web/src/lib/basPointLists.ts';
import { prepareBasSourceView, basSourceViewRegion } from '../../web/src/lib/basSourceView.ts';

const sample = fileURLToPath(new URL('../../demo/sample-plan.pdf', import.meta.url));
const different = fileURLToPath(new URL('./fixtures/scanned-plan.pdf', import.meta.url));
const points = basPointListsSchema.parse({ schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1',
  scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [] });
async function fixture() {
  const session = new Session(); await session.loadPlan(sample);
  const source = session.basSourcesForPipeline();
  session.basWorkflow = await captureBasEvidence(source, points);
  const request = { page_id: source.pages[0].page_id, bbox_px: [20, 20, 200, 100] as [number, number, number, number] };
  return { session, source, request };
}

test('original-source render and UI contract agree without changing active Session data', async () => {
  const { session, source, request } = await fixture();
  const before = structuredClone(session.exportPayload()), sheets = session.sheetList();
  const result = await viewBasOriginalSource(session, request, { px: 400 });
  const view = await prepareBasSourceView(before.bas_workflow, request);
  const region = basSourceViewRegion(view, source.pages[0].width_px, source.pages[0].height_px, true);
  assert.deepEqual(result.meta.region, [region.x0, region.y0, region.x1, region.y1]);
  assert.deepEqual(result.meta.original_bbox_px, request.bbox_px);
  assert.equal(result.meta.source_byte_verification, 'verified_now'); assert.equal(result.meta.saved_frame_verification, 'verified_now');
  assert.equal(result.meta.added_to_active_set, false); assert.equal(result.meta.read_only, true);
  assert.ok(result.png.byteLength > 100); assert.deepEqual([...result.png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(session.exportPayload(), before); assert.deepEqual(session.sheetList(), sheets);
});

test('historical source outside the active set opens by explicit path and leaves current drawings unchanged', async () => {
  const { session, request } = await fixture(), workflow = session.basWorkflow!;
  await session.loadPlan(different); session.basWorkflow = workflow;
  const before = structuredClone(session.exportPayload()), sheets = session.sheetList(), sources = session.basSourcesForPipeline();
  await assert.rejects(viewBasOriginalSource(session, request), /Exact original PDF unavailable/);
  await assert.rejects(viewBasOriginalSource(session, request, { originalPath: different }), /length mismatch/);
  const result = await viewBasOriginalSource(session, request, { originalPath: sample, px: 200 });
  assert.equal(result.meta.page_id, request.page_id);
  assert.deepEqual(session.exportPayload(), before); assert.deepEqual(session.sheetList(), sheets);
  assert.deepEqual(session.basSourcesForPipeline(), sources, 'historical source must not enter future extraction or counting');
});

test('foreign pages, frame drift, corrupt bytes, cancellation and changed context refuse before a successful image', async () => {
  const { session, source, request } = await fixture();
  await assert.rejects(viewBasOriginalSource(session, { ...request, page_id: request.page_id.replace(':p1', ':p999') }), /not owned/);
  const original = session.basOriginalBytes.bind(session);
  session.basOriginalBytes = async hash => { const bytes = (await original(hash))!; bytes[0] ^= 1; return bytes; };
  await assert.rejects(viewBasOriginalSource(session, request), /digest mismatch/);
  session.basOriginalBytes = original;
  const drift = structuredClone(source); drift.pages[0].rotation += 90;
  session.basWorkflow = await captureBasEvidence(drift, points);
  await assert.rejects(viewBasOriginalSource(session, request), /frame disagrees/);
  session.basWorkflow = await captureBasEvidence(source, points);
  await assert.rejects(viewBasOriginalSource(session, request, { signal: AbortSignal.abort() }), { name: 'AbortError' });
  session.basOriginalBytes = async hash => { const bytes = await original(hash); session.basWorkflow = null; return bytes; };
  await assert.rejects(viewBasOriginalSource(session, request), /workspace changed/);
});

test('public MCP view_sheet keeps legacy rendering and rejects active-overlay options in source mode', async () => {
  const { session, request } = await fixture();
  const server = buildServer(session), client = new Client({ name: 'source-view-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  try {
    const original = await client.callTool({ name: 'view_sheet', arguments: { sheet: request.page_id, px: 200,
      region: { x0: 20, y0: 20, x1: 200, y1: 100 } } });
    assert.equal(original.isError, undefined); assert.equal((original.content as { type: string }[])[0].type, 'image');
    for (const extras of [{ overlay: true }, { grid: 'auto' }, { marks: {} }]) {
      const refusal = await client.callTool({ name: 'view_sheet', arguments: { sheet: request.page_id, ...extras } });
      assert.equal(refusal.isError, true);
    }
    const legacy = await client.callTool({ name: 'view_sheet', arguments: { sheet: session.files[0], px: 200 } });
    assert.equal(legacy.isError, undefined); assert.equal((legacy.content as { type: string }[])[0].type, 'image');
    const wrong = await client.callTool({ name: 'view_sheet', arguments: { sheet: session.files[0], original_pdf_path: sample } });
    assert.equal(wrong.isError, true);
  } finally { await client.close(); await server.close(); }
});
