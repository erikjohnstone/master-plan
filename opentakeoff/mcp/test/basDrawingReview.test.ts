import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Session } from '../src/session.ts';
import { buildServer } from '../server.ts';
import { runBasDrawingCommand } from '../src/basDrawingReview.ts';
import { captureBasPoints, mergeBasWorkflows } from '../../web/src/lib/basWorkflow.ts';
import { basDrawingCapturePages, suggestBasDrawingRevision, replayBasDrawingHistory } from '../../web/src/lib/basDrawingRevision.ts';
import { inspectBasDrawings } from '../../web/src/lib/basDrawingInspection.ts';
import { prepareBasDrawingAction } from '../../web/src/lib/basDrawingReview.ts';
import { prepareBasEvidenceBundle, openBasEvidenceBundle } from '../../web/src/lib/basEvidenceBundle.ts';
import { sha256Hex } from '../../web/src/lib/graphKeys.js';
import type { BasDrawingAction } from '../../web/src/lib/basDrawingContract.ts';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sample = fileURLToPath(new URL('../../demo/sample-plan.pdf', import.meta.url));
async function fixture(hash = 'a', pages = 3) {
  return captureBasPoints([{ source_id: `sha256:${hash.repeat(64)}`, sha256: hash.repeat(64), byte_length: 100, page_count: pages, names: ['controlled.pdf'] }],
    { schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1', scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [] });
}
function action(s: Session): BasDrawingAction { return { kind: 'create_source_set', name: 'Initial reviewed page set', pages: basDrawingCapturePages(s.basWorkflow!.captures[0]) }; }
async function request(s: Session, a = action(s), n = 1) {
  const p = await runBasDrawingCommand(s, { kind: 'prepare', action: a });
  if (p.kind !== 'prepare') throw new Error('Preparation expected');
  return { operation_id: uuid(n), expected_head: p.preparation.expected_head, expected_dependencies: p.preparation.expected_dependencies,
    reviewer: 'Self-declared test reviewer', reason: 'Controlled review, not a verified installed takeoff', action: a };
}

test('MCP inspect/prepare share exact browser projections without active drawings or any saved mutation', async () => {
  const s = new Session(); s.basWorkflow = await fixture(); const before = structuredClone(s.basWorkflow);
  const read = await runBasDrawingCommand(s, { kind: 'inspect', query: { capture_id: s.basWorkflow.current_capture_id, offset: 1, limit: 1 } });
  assert.equal(read.kind, 'inspect'); if (read.kind !== 'inspect') throw new Error('Inspection expected');
  assert.deepEqual(read.inspection, await inspectBasDrawings(before, { capture_id: before.current_capture_id, offset: 1, limit: 1 }));
  assert.equal(read.inspection.selected!.pages.length, 1); assert.equal(read.inspection.selected!.source_page_count, 3);
  assert.ok(read.inspection.selected!.pages[0].page_id.endsWith(':p2'));
  const prepared = await runBasDrawingCommand(s, { kind: 'prepare', action: action(s) });
  assert.equal(prepared.kind, 'prepare'); if (prepared.kind !== 'prepare') throw new Error('Preparation expected');
  assert.deepEqual(prepared.preparation, await prepareBasDrawingAction(before, action(s)));
  assert.equal(prepared.preparation.recorded, false); assert.equal(prepared.preparation.approved, false);
  assert.deepEqual(s.basWorkflow, before); assert.deepEqual(s.files, []);
});

test('record is an idempotent proposal, retains full history and rejects stale/mutated requests', async () => {
  const s = new Session(); s.basWorkflow = await fixture();
  const r = await request(s), before = structuredClone(s.basWorkflow), first = await runBasDrawingCommand(s, { kind: 'record', review: r });
  assert.equal(first.kind, 'record'); if (first.kind !== 'record') throw new Error('Record expected');
  assert.equal(first.origin, 'agent_proposal'); assert.equal(first.approved, false); assert.equal(first.persistence, 'session_only_until_export');
  assert.equal(first.source_page_count, 3); assert.equal(s.basWorkflow.drawing_events!.length, 1);
  assert.deepEqual(s.basWorkflow.captures, before.captures);
  assert.deepEqual(await runBasDrawingCommand(s, { kind: 'record', review: r }), first);
  await assert.rejects(runBasDrawingCommand(s, { kind: 'record', review: { ...r, operation_id: uuid(2) } }), /changed since/);
  await assert.rejects(runBasDrawingCommand(s, { kind: 'record', review: { ...r, reason: 'Different intent' } }), /reused/);
  await assert.rejects(runBasDrawingCommand(s, { kind: 'record', review: { ...r, origin: 'operator_input' } }), /Unrecognized/);
});

test('partial addendum preserves omitted pages and paged event inspection exposes unresolved accounting', async () => {
  const s = new Session(); s.basWorkflow = await fixture();
  await runBasDrawingCommand(s, { kind: 'record', review: await request(s) });
  const incoming = await fixture('b', 2); s.basWorkflow = mergeBasWorkflows(s.basWorkflow, incoming)!;
  const baseline = [...replayBasDrawingHistory(s.basWorkflow.captures, s.basWorkflow.drawing_events).source_sets.values()][0];
  const a = suggestBasDrawingRevision(baseline, incoming.captures[0], 'partial_addendum', 'Partial addendum');
  const unresolved = await runBasDrawingCommand(s, { kind: 'record', review: await request(s, a, 2) });
  assert.equal(unresolved.kind, 'record'); if (unresolved.kind !== 'record') throw new Error('Record expected');
  assert.equal(unresolved.source_set_id, null); assert.equal(unresolved.unresolved_pages, 2);
  const view = await runBasDrawingCommand(s, { kind: 'inspect', query: { event_id: unresolved.event_id, offset: 1, limit: 1 } });
  assert.equal(view.kind, 'inspect'); if (view.kind !== 'inspect') throw new Error('Inspection expected');
  assert.equal(view.inspection.selected!.baseline_page_count, 3); assert.equal(view.inspection.selected!.baseline.length, 1);
  assert.equal(view.inspection.selected!.incoming_page_count, 2); assert.equal(view.inspection.selected!.incoming.length, 1);
  assert.equal(view.inspection.selected!.source_page_count, null); assert.deepEqual(view.inspection.selected!.pages, []);
  a.incoming.forEach(p => { p.disposition = 'addition'; p.reason = 'Explicitly include added controlled page'; });
  const complete = await runBasDrawingCommand(s, { kind: 'record', review: await request(s, a, 3) });
  assert.equal(complete.kind, 'record'); if (complete.kind !== 'record') throw new Error('Record expected');
  assert.equal(complete.source_page_count, 5); assert.equal(s.basWorkflow.drawing_events!.length, 3);
});

test('read pagination/ownership and missing text are explicit, not a fabricated comparison or zero delta', async () => {
  const s = new Session(); s.basWorkflow = await fixture();
  const ref = basDrawingCapturePages(s.basWorkflow.captures[0])[0];
  const result = await runBasDrawingCommand(s, { kind: 'compare', before: ref, after: ref });
  assert.equal(result.kind, 'compare'); if (result.kind !== 'compare') throw new Error('Comparison expected');
  assert.equal(result.comparison.retained_text_geometry, 'unavailable'); assert.equal(result.comparison.quantity_changes, 'not_assessed');
  for (const query of [{ limit: 51 }, { offset: -1 }, { event_id: 'f'.repeat(64) }, { capture_id: 'f'.repeat(64) },
    { capture_id: ref.capture_id, event_id: 'f'.repeat(64) }]) await assert.rejects(runBasDrawingCommand(s, { kind: 'inspect', query }));
  await assert.rejects(runBasDrawingCommand(s, { kind: 'compare', before: ref, after: { ...ref, page_id: ref.page_id.replace(':p1', ':p99') } }), /not owned/);
  const empty = await runBasDrawingCommand(s, { kind: 'inspect', query: { capture_id: ref.capture_id, offset: 99 } });
  assert.equal(empty.kind, 'inspect'); if (empty.kind === 'inspect') assert.deepEqual(empty.inspection.selected!.pages, []);
  await assert.rejects(runBasDrawingCommand(new Session(), { kind: 'inspect' }), /No retained BAS workflow/);
  const oversized = new Session(); oversized.basWorkflow = await fixture('c', 25001);
  const listed = await runBasDrawingCommand(oversized, { kind: 'inspect' });
  assert.equal(listed.kind, 'inspect'); if (listed.kind === 'inspect') assert.equal(listed.inspection.captures[0].page_count, 25001);
  await assert.rejects(runBasDrawingCommand(oversized, { kind: 'inspect', query: { capture_id: oversized.basWorkflow.current_capture_id } }), /25,000-page/);
});

test('retrying an older proposal returns its own accounting without dropping later history', async () => {
  const s = new Session(); s.basWorkflow = await fixture();
  const original = await request(s), first = await runBasDrawingCommand(s, { kind: 'record', review: original });
  const smaller = action(s); if (smaller.kind !== 'create_source_set') throw new Error('Initial set expected');
  smaller.pages = smaller.pages.slice(0, 1);
  const latest = await runBasDrawingCommand(s, { kind: 'record', review: await request(s, smaller, 2) });
  const saved = structuredClone(s.basWorkflow), retried = await runBasDrawingCommand(s, { kind: 'record', review: original });
  assert.equal(first.kind, 'record'); assert.equal(latest.kind, 'record'); assert.equal(retried.kind, 'record');
  if (first.kind !== 'record' || latest.kind !== 'record' || retried.kind !== 'record') throw new Error('Record expected');
  assert.equal(retried.event_id, first.event_id); assert.equal(retried.source_page_count, 3);
  assert.equal(retried.head, latest.head); assert.equal(latest.source_page_count, 1);
  assert.deepEqual(s.basWorkflow, saved);
});

test('cancellation, concurrent in-place/capture edits and plan loads cannot accept late writes', async () => {
  const s = new Session(); s.basWorkflow = await fixture(); const r = await request(s), original = structuredClone(s.basWorkflow);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(runBasDrawingCommand(s, { kind: 'record', review: r }, abort.signal)); assert.deepEqual(s.basWorkflow, original);
  const pending = runBasDrawingCommand(s, { kind: 'record', review: r }); s.basWorkflow = structuredClone(s.basWorkflow);
  await assert.rejects(pending, /workspace changed/); assert.deepEqual(s.basWorkflow, original);
  const changed = runBasDrawingCommand(s, { kind: 'record', review: r }); s.basWorkflow.captures[0].sources[0].names[0] = 'Operator changed alias';
  await assert.rejects(changed, /workspace changed/); assert.equal(s.basWorkflow.drawing_events, undefined);
  s.basWorkflow = structuredClone(original);
  const loadRace = assert.rejects(runBasDrawingCommand(s, { kind: 'record', review: r }), /workspace changed/);
  await s.loadPlan(sample); await loadRace; assert.equal(s.basWorkflow, null);
});

test('public restored-history review, export, source inspection and new-session restore preserve the same journal', async () => {
  const bytes = new Uint8Array(await readFile(sample)), sha256 = await sha256Hex(bytes), probe = new Session(); await probe.loadPlan(sample);
  const workflow = await captureBasPoints([{ source_id: `sha256:${sha256}`, sha256, byte_length: bytes.length,
    page_count: probe.sheetList().length, names: ['sample-plan.pdf'] }], (await fixture()).captures[0].points);
  const dir = await mkdtemp(join(tmpdir(), 'bas-drawings-public-')), path = join(dir, 'input.otbas.zip');
  const payload = { schema: 'opentakeoff.takeoff_canvas.v1', bas_workflow: workflow, project_name: 'Preserve cargo', shapes: [],
    custom: { untouched: ['source review', 0, null] } };
  const prepared = await prepareBasEvidenceBundle(payload), chunks = [];
  for await (const c of prepared.stream(async () => bytes)) chunks.push(c); await writeFile(path, Buffer.concat(chunks));
  const s = new Session(), server = buildServer(s), client = new Client({ name: 'actual-drawing-review', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    assert.equal(r.isError, undefined, JSON.stringify(r));
    const text = (r.content as { text?: string }[]).find(c => c.text)?.text;
    return { data: JSON.parse(text!), response: r };
  };
  try {
    const p = (await call('import_takeoff', { path, restore_evidence_bundle: { action: 'preview' } })).data.bas_restore;
    await call('import_takeoff', { path, restore_evidence_bundle: { action: 'commit', preview_id: p.preview_id, directory: dir } });
    const read = (await call('bas_drawing_review', { command: { kind: 'inspect', query: { capture_id: workflow.current_capture_id } } })).data.result.inspection;
    const a = { kind: 'create_source_set', name: 'Public source-set review', pages: read.selected.pages.map(({ display_name: _name, ...ref }: any) => ref) };
    const basis = (await call('bas_drawing_review', { command: { kind: 'prepare', action: a } })).data.result.preparation;
    const review = { operation_id: uuid(700), expected_head: basis.expected_head, expected_dependencies: basis.expected_dependencies,
      action: a, reviewer: 'Declared public test reviewer', reason: 'Verify source-preserving public journey; not installed truth' };
    const recorded = (await call('bas_drawing_review', { command: { kind: 'record', review } })).data.result;
    assert.equal(recorded.recorded, true); assert.equal(recorded.origin, 'agent_proposal'); assert.equal(recorded.approved, false);
    const out = join(dir, 'reviewed.takeoff.json'); await call('export_takeoff', { path: out });
    const exported = JSON.parse(await readFile(out, 'utf8')); assert.deepEqual(exported.custom, payload.custom);
    assert.deepEqual(exported.bas_workflow, s.basWorkflow); assert.deepEqual(exported.bas_workflow.captures, workflow.captures);
    const image = await call('view_sheet', { sheet: a.pages[0].page_id, px: 400 });
    assert.ok((image.response.content as { type: string }[]).some(c => c.type === 'image')); assert.deepEqual(s.files, []);
    const backup = await prepareBasEvidenceBundle(exported), cargo = [];
    for await (const c of backup.stream(async () => bytes)) cargo.push(c);
    const zip = new Uint8Array(Buffer.concat(cargo)), opened = await openBasEvidenceBundle({ size: zip.length,
      async read(offset, length) { return zip.subarray(offset, offset + length); } });
    await opened.verifyOriginals(); assert.deepEqual((opened.payload as any).bas_workflow, s.basWorkflow);
    const nextArchive = join(dir, 'reviewed.otbas.zip'); await writeFile(nextArchive, zip);
    const next = new Session();
    const { restoreBasEvidenceFile } = await import('../src/basRestoreFile.ts');
    const nextPreview = await restoreBasEvidenceFile(next, nextArchive, { action: 'preview' });
    await restoreBasEvidenceFile(next, nextArchive, { action: 'commit', preview_id: nextPreview.preview_id, directory: dir });
    assert.deepEqual(next.basWorkflow, s.basWorkflow); assert.deepEqual(next.files, []);
    assert.deepEqual(await next.basOriginalBytes(sha256), bytes);
  } finally { await client.close(); await server.close(); }
});
