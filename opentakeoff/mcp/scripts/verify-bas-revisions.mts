/** Built public MCP over real browser-reviewed evidence + exact original PDFs.
 * Reordered source pages and hardware inputs are controlled, not issued addenda. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { prepareBasEvidenceBundle } from '../../web/src/lib/basEvidenceBundle.ts';
import { verifyBasWorkflow } from '../../web/src/lib/basWorkflow.ts';
import { sha256Hex } from '../../web/src/lib/graphKeys.js';
import { assertProofEqual } from './helpers/proofEquality.ts';
const [input, browserComparison, originalPdf, controlledPdf, output] = process.argv.slice(2);
assert.ok(input && browserComparison && originalPdf && controlledPdf && output);
const out = resolve(output); await mkdir(out);
const payload = JSON.parse(await readFile(input, 'utf8')), expected = JSON.parse(await readFile(browserComparison, 'utf8'));
const workflow = await verifyBasWorkflow(payload.bas_workflow); assert.equal(workflow.revision_events?.length, 1);
const originals = new Map<string, Uint8Array>();
for (const path of [originalPdf, controlledPdf]) { const bytes = new Uint8Array(await readFile(path)); originals.set(await sha256Hex(bytes), bytes); }
const prepared = await prepareBasEvidenceBundle(payload), chunks: Uint8Array[] = [];
for await (const chunk of prepared.stream(async item => { const bytes = originals.get(item.source.sha256); assert.ok(bytes); return bytes; })) chunks.push(chunk);
const archivePath = resolve(out, 'browser-reviewed.otbas.zip'); await writeFile(archivePath, Buffer.concat(chunks));
const connections: { client: Client; transport: StdioClientTransport }[] = [], timings: Record<string, number> = {};
let stderr = '';
async function connect() {
  const client = new Client({ name: 'bas-revision-packaged-proof', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'], cwd: fileURLToPath(new URL('../', import.meta.url)), stderr: 'pipe' });
  transport.stderr?.on('data', b => { stderr = (stderr + b.toString()).slice(-65536); });
  connections.push({ client, transport }); await client.connect(transport); return client;
}
async function call(client: Client, name: string, args: Record<string, unknown>, error = false) {
  const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
  assert.equal(!!response.isError, error, JSON.stringify(response.content).slice(0, 1000));
  const text = response.content.find(c => c.type === 'text'); assert.ok(text?.type === 'text');
  return { data: JSON.parse(text.text), image: response.content.find(c => c.type === 'image') };
}
const revision = async (client: Client, command: unknown) => (await call(client, 'bas_drawing_review', { command: { kind: 'revision', command } })).data.result.result;
async function restore(client: Client, path: string, key: string) {
  const started = performance.now();
  const p = (await call(client, 'import_takeoff', { path, restore_evidence_bundle: { action: 'preview' } })).data.bas_restore;
  const r = (await call(client, 'import_takeoff', { path, restore_evidence_bundle: { action: 'commit', preview_id: p.preview_id, directory: out } })).data.bas_restore;
  timings[key] = Math.round(performance.now() - started); assert.equal(r.restored, true); assert.equal(r.approved, false);
  assert.equal(r.workflow_replay.calculation_verification, 'verified_shared_python_replay'); assert.deepEqual(r.active_files, []); return r;
}
try {
  const first = await connect(), listed = await first.listTools(); assert.equal(listed.tools.length, 51);
  const restored = await restore(first, archivePath, 'browser_history_restore_ms');
  assertProofEqual((await call(first, 'export_takeoff', {})).data.bas_workflow, workflow, 'exact browser review retained');
  const inspection = await revision(first, { action: 'inspect', source_set_id: expected.comparison.before.source_set_id, query: { path: ['selected_basis', 'captures'] } });
  assert.equal(inspection.page.total, expected.comparison.before.captures.length);
  const started = performance.now();
  const reopened = await revision(first, { action: 'run', operation: { kind: 'read', event_id: workflow.revision_events![0].event_id }, query: { path: ['report', 'rows'], limit: 2 } });
  timings.pinned_reopen_ms = Math.round(performance.now() - started);
  assert.equal(reopened.page.total, expected.report.rows.length); assert.equal(reopened.page.entries.length, 2);
  const path = resolve(out, 'replayed-comparison.json'); await revision(first, { action: 'export', view_id: reopened.view_id, path });
  const replayed = JSON.parse(await readFile(path, 'utf8')); assertProofEqual(replayed.report, expected.report, 'browser/packaged Python report parity');
  assert.equal(reopened.report_verification, 'matches_saved_report');
  const rowIndex = replayed.report.rows.findIndex((r: any) => r.correspondence === 'explicit_decision'); assert.ok(rowIndex >= 0);
  const startPage = performance.now();
  const rowPage = await revision(first, { action: 'read', view_id: reopened.view_id, query: { path: ['report', 'rows', rowIndex, 'quantities'] } });
  timings.cached_quantity_page_ms = Math.round(performance.now() - startPage);
  assert.equal(rowPage.page.total, replayed.report.rows[rowIndex].quantities.length);
  assert.equal(rowPage.result_fingerprint, reopened.result_fingerprint);
  for (const side of ['before', 'after']) {
    const ref = replayed.report.rows[rowIndex][side].source_refs[0];
    const viewed = await call(first, 'view_sheet', { sheet: ref.page_id, px: 1400 });
    assert.ok(viewed.image?.type === 'image'); assert.equal(viewed.data.added_to_active_set, false); assert.equal(viewed.data.source_byte_verification, 'verified_now');
    await writeFile(resolve(out, `${side}-original.png`), Buffer.from(viewed.image.data, 'base64'));
  }
  const preparedAt = performance.now();
  const preview = await revision(first, { action: 'run', operation: { kind: 'compare', comparison: expected.comparison } });
  timings.prepare_ms = Math.round(performance.now() - preparedAt);
  const review = { operation_id: crypto.randomUUID(), comparison: expected.comparison, expected_head: preview.expected_head,
    expected_report_fingerprint: preview.expected_report_fingerprint, name: 'Packaged shared-path comparison review',
    reviewer: 'Controlled MCP reviewer', reason: 'Repeat the exact browser-controlled correspondence through the packaged shared service, not installed or approval truth.' };
  const recordAt = performance.now(); const recorded = await revision(first, { action: 'run', operation: { kind: 'record', review } });
  timings.record_ms = Math.round(performance.now() - recordAt); assert.equal(recorded.approved, false);
  const after = (await call(first, 'export_takeoff', {})).data;
  assertProofEqual(after.bas_workflow.captures, workflow.captures, 'all original captures preserved');
  assertProofEqual(after.bas_workflow.revision_events[0], workflow.revision_events![0], 'browser review retained');
  assert.equal(after.bas_workflow.revision_events.length, 2); assert.equal(after.bas_workflow.revision_events[1].origin, 'agent_proposal');
  const retried = await revision(first, { action: 'run', operation: { kind: 'record', review } }); assert.equal(retried.event_id, recorded.event_id);
  const exportedPath = resolve(out, 'mcp-reviewed.otbas.zip'); await call(first, 'export_takeoff', { evidence_bundle_path: exportedPath });
  await first.close(); await connections[0].transport.close();
  const second = await connect(), restarted = await restore(second, exportedPath, 'fresh_process_restore_ms');
  assertProofEqual((await call(second, 'export_takeoff', {})).data, after, 'complete portable recovery after process restart');
  const recovered = await revision(second, { action: 'run', operation: { kind: 'read', event_id: recorded.event_id } }); assert.equal(recovered.report_verification, 'matches_saved_report');
  const proof = { timings, tools: listed.tools.length, public_built_stdio: true, browser_report_exact: true, source_view_verified: true,
    proposals_and_retry_verified: true, process_restart_recovered: true, historical_pdf_activated: false,
    checked_records: restored.workflow_replay.checked_records, restarted_checked_records: restarted.workflow_replay.checked_records,
    compared_rows: expected.report.rows.length, approved: false, real_issued_revision: false, controlled_hardware_inputs: true };
  await writeFile(resolve(out, 'proof.json'), JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof));
} catch (e) { await writeFile(resolve(out, 'failure.json'), JSON.stringify({ error: String(e), stack: (e as Error).stack, stderr }, null, 2)); throw e; }
finally { for (const { client, transport } of connections) { await client.close(); await transport.close(); } }
