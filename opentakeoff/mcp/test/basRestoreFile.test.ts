import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Session } from '../src/session.ts';
import { buildServer } from '../server.ts';
import { restoreBasEvidenceFile } from '../src/basRestoreFile.ts';
import { captureBasPoints } from '../../web/src/lib/basWorkflow.ts';
import { prepareBasEvidenceBundle } from '../../web/src/lib/basEvidenceBundle.ts';
import { prepareBasRestore, readBasRestorePlan } from '../../web/src/lib/basRestore.ts';
import { sha256Hex } from '../../web/src/lib/graphKeys.js';
import { basAssemblyCalculationFingerprint } from '../../web/src/lib/basAssemblyQuantityContract.ts';

const schema = 'opentakeoff.takeoff_canvas.v1';
const sample = fileURLToPath(new URL('../../demo/sample-plan.pdf', import.meta.url));
async function fixture(bytes = new TextEncoder().encode('%PDF-controlled-byte-identity-only'), names = ['original.pdf'], extra: Record<string, unknown> = {}, pages = 1) {
  const dir = await mkdtemp(join(tmpdir(), 'bas-restore-mcp-')), path = join(dir, 'backup.otbas.zip'), sha256 = await sha256Hex(bytes);
  const workflow = await captureBasPoints([{ source_id: `sha256:${sha256}`, sha256, byte_length: bytes.length, page_count: pages, names }],
    { schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1', scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [] });
  const payload: Record<string, any> = { schema, bas_workflow: workflow, ...extra }, prepared = await prepareBasEvidenceBundle(payload), chunks = [];
  for await (const chunk of prepared.stream(async () => bytes)) chunks.push(chunk);
  await writeFile(path, Buffer.concat(chunks)); return { dir, path, sha256, bytes, payload, prepared };
}
const preview = (s: Session, f: { path: string }) => restoreBasEvidenceFile(s, f.path, { action: 'preview' });
const commit = (s: Session, f: { path: string; dir: string }, p: any, signal?: AbortSignal) => restoreBasEvidenceFile(s, f.path,
  { action: 'commit', preview_id: p.preview_id, directory: f.dir }, signal);

test('MCP restore shares exact merge, retains all cargo and originals, and does not activate old PDFs', async () => {
  const f = await fixture(undefined, undefined, { project_name: 'Operator project', units: 'metric', rfis: [{ id: 'question', text: 'why?' }],
    columns: ['source', 'answer'], custom: { deep: [1, { a: 'b' }] } });
  const s = new Session(), before = s.basRestorePayload(), p = await preview(s, f);
  assert.equal(p.restored, false); assert.deepEqual(s.basRestorePayload(), before);
  assert.deepEqual(await readdir(f.dir), ['backup.otbas.zip']);
  const expected = readBasRestorePlan(await prepareBasRestore(before, f.payload, f.prepared.bundle_id)).payload;
  const result = await commit(s, f, p);
  assert.equal(result.restored, true); assert.equal(result.approved, false); assert.equal(result.project_complete, false);
  assert.deepEqual(s.exportPayload(), expected); assert.deepEqual(s.files, []); assert.equal(s.sheetList().length, 0);
  assert.deepEqual(await s.basOriginalBytes(f.sha256), f.bytes);
  assert.deepEqual(JSON.parse(await readFile(result.takeoff_path, 'utf8')), expected);
  const old = JSON.parse(await readFile(result.previous_state_path, 'utf8')); assert.deepEqual(old.payload, before);
  assert.deepEqual(await commit(s, f, p), result);
  s.markups.push({ id: 'edited-later', text: 'retained edit' } as any);
  assert.deepEqual(s.exportPayload().custom, f.payload.custom); assert.equal(s.exportPayload().markups.length, 1);
  await assert.rejects(commit(s, f, p), /already restored/);
});

test('public preview/commit, source view and export work without loaded plans', async () => {
  const bytes = new Uint8Array(await readFile(sample)), probe = new Session(); await probe.loadPlan(sample);
  const f = await fixture(bytes, ['sample-plan.pdf'], {}, probe.sheetList().length);
  const s = new Session(), server = buildServer(s), client = new Client({ name: 'actual-restore', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { text: string }[]).find(c => typeof c.text === 'string')!.text;
    let data; try { data = JSON.parse(text); } catch { throw new Error(text); }
    return { error: !!result.isError, data, result };
  };
  try {
    const p = await call('import_takeoff', { path: f.path, restore_evidence_bundle: { action: 'preview' } });
    assert.equal(p.error, false, JSON.stringify(p.data));
    const r = await call('import_takeoff', { path: f.path, restore_evidence_bundle: { action: 'commit', preview_id: p.data.bas_restore.preview_id, directory: f.dir } });
    assert.equal(r.error, false, JSON.stringify(r.data)); assert.equal(r.data.bas_restore.restored, true);
    const exported = await call('export_takeoff', { path: join(f.dir, 'roundtrip.json') });
    assert.equal(exported.error, false, JSON.stringify(exported.data));
    assert.deepEqual(exported.data.bas_workflow, f.payload.bas_workflow);
    const viewed = await call('view_sheet', { sheet: `sha256:${f.sha256}:p1`, px: 600 });
    assert.equal(viewed.error, false, JSON.stringify(viewed.data)); assert.equal(viewed.data.added_to_active_set, false);
    assert.ok((viewed.result.content as any[]).some(c => c.type === 'image')); assert.deepEqual(s.files, []);
    assert.equal((await call('import_takeoff', { path: f.path, verify_evidence_bundle: true, restore_evidence_bundle: { action: 'preview' } })).error, true);
    // Public load with merge keeps restored historical cargo; ordinary replace
    // remains an explicit new-session operation.
    await s.loadPlan(sample, { merge: true }); assert.deepEqual(s.basWorkflow, f.payload.bas_workflow);
    await s.loadPlan(sample); assert.equal(s.basWorkflow, null);
  } finally { await client.close(); await server.close(); }
});

test('stale previews, cross-Session handles, cancellation and changed archives preserve existing state', async () => {
  const f = await fixture(), s = new Session(), p = await preview(s, f);
  await assert.rejects(commit(new Session(), f, p), /unavailable/);
  const abort = new AbortController(); abort.abort(); await assert.rejects(commit(s, f, p, abort.signal), /abort/i);
  assert.deepEqual(await readdir(f.dir), ['backup.otbas.zip']);
  s.markups.push({ id: 'operator-edit' } as any); const edited = s.basRestorePayload();
  await assert.rejects(commit(s, f, p), /Workspace changed/); assert.deepEqual(s.basRestorePayload(), edited);
  const p2 = await preview(s, f), f2 = await fixture(new TextEncoder().encode('%PDF-different-original'));
  await writeFile(f.path, await readFile(f2.path));
  await assert.rejects(commit(s, f, p2), /bundle changed/); assert.deepEqual(s.basRestorePayload(), edited);
  assert.deepEqual(await readdir(f.dir), ['backup.otbas.zip']);
});

test('merged historical sources require all exact originals; failure cleans only its private files and retry succeeds', async () => {
  const a = await fixture(), b = await fixture(new TextEncoder().encode('%PDF-second-version'), ['second.pdf']);
  const s = new Session(); s.basWorkflow = a.payload.bas_workflow;
  const before = s.basRestorePayload(), p = await preview(s, b);
  await assert.rejects(commit(s, b, p), /Original PDF unavailable/);
  assert.deepEqual(s.basRestorePayload(), before); assert.deepEqual(await readdir(b.dir), ['backup.otbas.zip']);
  const missing = join(b.dir, 'explicitly-renamed.pdf'); await writeFile(missing, a.bytes);
  const p2 = await restoreBasEvidenceFile(s, b.path, { action: 'preview', original_pdf_paths: [missing] });
  const result = await commit(s, b, p2); assert.equal(result.restored, true);
  assert.equal(s.basWorkflow!.captures.length, 2); assert.deepEqual(await s.basOriginalBytes(a.sha256), a.bytes);
  assert.equal(await readFile(missing, 'utf8'), new TextDecoder().decode(a.bytes));
});

test('concurrent edits during staging abort and leave no partial committed restore', async () => {
  const a = await fixture(), b = await fixture(new TextEncoder().encode('%PDF-second-version'), ['second.pdf']);
  const s = new Session(); s.basWorkflow = a.payload.bas_workflow;
  const p = await preview(s, b), original = s.basOriginalBytes.bind(s);
  s.basOriginalBytes = async sha => { s.markups.push({ id: 'concurrent' } as any); return sha === a.sha256 ? a.bytes : original(sha); };
  await assert.rejects(commit(s, b, p), /Workspace changed/);
  assert.equal(s.markups[0].id, 'concurrent'); assert.deepEqual(s.basWorkflow, a.payload.bas_workflow);
  assert.deepEqual(await readdir(b.dir), ['backup.otbas.zip']);
});

test('legacy first-page annotations require the exact active namesake and preserve scale/cargo parity', async () => {
  const bytes = new Uint8Array(await readFile(sample)), s = new Session(); await s.loadPlan(sample);
  const f = await fixture(bytes, ['sample-plan.pdf'], { shapes: [{ id: 'c', sheet_id: 'sample-plan.pdf', condition_id: 'cpt', measure_role: 'count', computed: { count: 1 }, verts_norm: [[0.5, 0.5]] }],
    sheets: [{ sheet_id: 'sample-plan.pdf', units_per_px: 0.1, scale_source: 'operator' }] }, s.sheetList().length);
  await assert.rejects(preview(new Session(), f), /exact original active/);
  const before = s.basRestorePayload(), p = await preview(s, f); const result = await commit(s, f, p);
  const expected = readBasRestorePlan(await prepareBasRestore(before, f.payload, f.prepared.bundle_id)).payload;
  assert.equal(result.restored, true); assert.deepEqual(s.exportPayload(), expected); assert.equal(s.sheet('sample-plan.pdf').upp, 0.1);
  assert.equal(s.shapes.length, 1); s.sheet('sample-plan.pdf').upp = 0.2;
  assert.equal(s.exportPayload().sheets[0].units_per_px, 0.2);
  // Same-ID cargo is deliberately not added by the existing shared merge.
  // A NEW annotation tests unsafe rebinding rather than a skipped duplicate.
  const wrong = await fixture(new TextEncoder().encode('%PDF-wrong-namesake'), ['sample-plan.pdf'], { shapes: [{ ...f.payload.shapes[0], id: 'new-wrong-source' }] });
  await assert.rejects(preview(s, wrong), /ambiguous|exact original active/);
});

test('retry and source reader freshly detect altered originals, payload, replay, and journal', async () => {
  const f = await fixture(), s = new Session(), p = await preview(s, f), result = await commit(s, f, p);
  const original = join(result.directory, `${f.sha256}.pdf`);
  await writeFile(original, 'tampered');
  await assert.rejects(commit(s, f, p), /length mismatch/);
  await assert.rejects(s.basOriginalBytes(f.sha256), /length mismatch/);
  await writeFile(original, f.bytes);
  for (const name of ['takeoff.json', 'replay.json', 'COMMITTED.json', 'previous-state.json']) {
    const path = join(result.directory, name), old = await readFile(path); await writeFile(path, '{}');
    await assert.rejects(commit(s, f, p), /changed|mismatch/); await writeFile(path, old);
  }
  assert.deepEqual(await commit(s, f, p), result);
  await assert.rejects(stat(join(result.directory, 'unexpected')), /ENOENT/);
});

test('in-flight loads and identical reloads invalidate previews without altering the loaded plan', async () => {
  const f = await fixture(), s = new Session(), loading = s.loadPlan(sample);
  await assert.rejects(preview(s, f), /plan is loading/); await loading;
  const p = await preview(s, f), before = s.basRestorePayload();
  await s.loadPlan(sample); assert.deepEqual(s.basRestorePayload(), before);
  await assert.rejects(commit(s, f, p), /Workspace changed/);
  assert.deepEqual(await readdir(f.dir), ['backup.otbas.zip']);
});

test('cancellation during staged source delivery and output errors leave current state unchanged', async () => {
  const a = await fixture(), b = await fixture(new TextEncoder().encode('%PDF-another')), s = new Session();
  s.basWorkflow = a.payload.bas_workflow;
  const before = s.basRestorePayload(), p = await preview(s, b), cancel = new AbortController();
  s.basOriginalBytes = async () => { cancel.abort(); return a.bytes; };
  await assert.rejects(commit(s, b, p, cancel.signal), /abort/i);
  assert.deepEqual(s.basRestorePayload(), before); assert.deepEqual(await readdir(b.dir), ['backup.otbas.zip']);
  await assert.rejects(restoreBasEvidenceFile(s, b.path, { action: 'commit', preview_id: p.preview_id, directory: b.path }), /existing local directory/);
  assert.deepEqual(s.basRestorePayload(), before);
});

test('restore cannot accept re-signed wrong historical arithmetic; real Python is mandatory', async () => {
  const payload = JSON.parse(await readFile(new URL('../../docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json', import.meta.url), 'utf8'));
  const calculation = payload.bas_workflow.assembly_calculations.find((c: any) => c.result.components.some((row: any) => row.status === 'calculated_declared_quantity'));
  calculation.result.components.find((row: any) => row.status === 'calculated_declared_quantity').assigned_quantity += 1;
  const { calculation_id: _id, ...data } = calculation;
  calculation.calculation_id = await basAssemblyCalculationFingerprint(data);
  // No ZIP with wrong original bytes is needed: prepare the same shared plan
  // then exercise the mandatory production replay before Session adoption.
  const { replayBasRestore } = await import('../../web/src/lib/basRestore.ts');
  const { verifyBasWorkflowCalculations } = await import('../src/basWorkflowReplay.ts');
  const s = new Session(), before = s.basRestorePayload(), plan = await prepareBasRestore(before, payload, 'a'.repeat(64));
  await assert.rejects(replayBasRestore(plan, verifyBasWorkflowCalculations), /does not match/);
  assert.throws(() => s.prepareBasRestoreAdoption(plan, new Map(), () => {}), /requires successful shared Python/);
  assert.deepEqual(s.basRestorePayload(), before);
});

test('existing correction-rule history survives restore and later updates round-trip without importing new rules', async () => {
  const f = await fixture(), s = new Session(); s.basWorkflow = f.payload.bas_workflow;
  s.rules = [{ id: 'prior-rule', seed_condition_id: 'prior-condition', applied_to: [], predicate: { kind: 'enclosed_subpolygon_deduct', max_area_sf: 5 } } as any];
  const before = s.basRestorePayload(), p = await preview(s, f); await commit(s, f, p);
  assert.deepEqual(s.exportPayload().rules, before.rules);
  s.rules[0].applied_to.push('later-shape');
  assert.deepEqual(s.exportPayload().rules[0].applied_to, ['later-shape']);
  assert.equal(s.basWorkflow!.captures.length, 1);
});

test('malformed native cargo cannot restore a Session whose public export would fail', async () => {
  const f = await fixture(undefined, undefined, { units: 9, conditions: [{ id: 'incomplete' }] }), s = new Session(), before = s.basRestorePayload();
  await assert.rejects(preview(s, f), /cannot round-trip through MCP.*units/);
  assert.deepEqual(s.basRestorePayload(), before); assert.deepEqual(await readdir(f.dir), ['backup.otbas.zip']);
});
