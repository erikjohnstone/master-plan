/** Built public MCP correspondence over the actual browser review export.
 * Source-derived reordered pages are controlled fixtures, not issued revisions. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { prepareBasEvidenceBundle } from '../../web/src/lib/basEvidenceBundle.ts';
import { inspectBasDrawings } from '../../web/src/lib/basDrawingInspection.ts';
import { compareBasDrawingPages, replayBasDrawingHistory, suggestBasDrawingRevision } from '../../web/src/lib/basDrawingRevision.ts';
import { verifyBasWorkflow } from '../../web/src/lib/basWorkflow.ts';
import { sha256Hex } from '../../web/src/lib/graphKeys.js';
import { assertProofEqual } from './helpers/proofEquality.ts';

const [input, originalPdf, derivativePdf, output] = process.argv.slice(2);
assert.ok(input && originalPdf && derivativePdf && output);
const out = resolve(output); await mkdir(out);
const payload = JSON.parse(await readFile(input, 'utf8'));
const workflow = await verifyBasWorkflow(payload.bas_workflow);
assert.equal(workflow.drawing_events?.length, 2);
const originals = new Map<string, Uint8Array>();
for (const path of [originalPdf, derivativePdf]) { const bytes = new Uint8Array(await readFile(path)); originals.set(await sha256Hex(bytes), bytes); }
const prepared = await prepareBasEvidenceBundle(payload), chunks: Uint8Array[] = [];
for await (const chunk of prepared.stream(async item => {
  const bytes = originals.get(item.source.sha256); assert.ok(bytes, 'Exact fixture bytes available'); return bytes;
})) chunks.push(chunk);
const archivePath = resolve(out, 'browser-reviewed.otbas.zip'); await writeFile(archivePath, Buffer.concat(chunks));
const connections: { client: Client; transport: StdioClientTransport }[] = [];
const timings: Record<string, number> = {}; let stderr = '';
async function connect() {
  const client = new Client({ name: 'bas-drawing-packaged-proof', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'],
    cwd: fileURLToPath(new URL('../', import.meta.url)), stderr: 'pipe' });
  transport.stderr?.on('data', b => { stderr = (stderr + b.toString()).slice(-65536); });
  connections.push({ client, transport }); await client.connect(transport); return client;
}
async function call(client: Client, name: string, args: Record<string, unknown> = {}, error = false) {
  const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
  assert.equal(!!response.isError, error, JSON.stringify(response.content).slice(0, 1000));
  const text = response.content.find(c => c.type === 'text'); assert.ok(text?.type === 'text');
  return { data: JSON.parse(text.text), image: response.content.find(c => c.type === 'image') };
}
async function restore(client: Client, path: string, name: string) {
  const start = performance.now();
  const p = (await call(client, 'import_takeoff', { path, restore_evidence_bundle: { action: 'preview' } })).data.bas_restore;
  const result = (await call(client, 'import_takeoff', { path,
    restore_evidence_bundle: { action: 'commit', preview_id: p.preview_id, directory: out } })).data.bas_restore;
  timings[name] = Math.round(performance.now() - start);
  assert.equal(result.restored, true); assert.equal(result.approved, false); assert.deepEqual(result.active_files, []);
  assert.equal(result.workflow_replay.calculation_verification, 'verified_shared_python_replay');
  return result;
}
try {
  const first = await connect();
  const listed = await first.listTools(); assert.equal(listed.tools.length, 51);
  assert.ok(listed.tools.some(t => t.name === 'bas_drawing_review'));
  const restored = await restore(first, archivePath, 'browser_history_restore_ms');
  const before = (await call(first, 'export_takeoff')).data;
  assertProofEqual(before.bas_workflow, workflow, 'browser correspondence restored exactly');
  const page = (await call(first, 'bas_drawing_review', { command: { kind: 'inspect', query: { offset: 0, limit: 1 } } })).data.result.inspection;
  assertProofEqual(page, await inspectBasDrawings(workflow, { offset: 0, limit: 1 }), 'packaged read matches shared browser projection');
  assert.equal(page.event_count, 2); assert.equal(page.events.length, 1);
  const sets = [...replayBasDrawingHistory(workflow.captures, workflow.drawing_events).source_sets.values()];
  const baseline = sets[1], incoming = workflow.captures.find(c => c.capture_id === baseline.pages.at(-1)!.capture_id)!;
  const action = suggestBasDrawingRevision(baseline, incoming, 'partial_addendum', 'Same-original duplicate delivery — controlled MCP review');
  const start = performance.now();
  const preparation = (await call(first, 'bas_drawing_review', { command: { kind: 'prepare', action } })).data.result.preparation;
  assert.equal(preparation.source_page_count, 9); assert.equal(preparation.recorded, false);
  const review = { operation_id: crypto.randomUUID(), action, expected_head: preparation.expected_head,
    expected_dependencies: preparation.expected_dependencies, reviewer: 'Controlled packaged-MCP reviewer',
    reason: 'Exact same-original incoming pages are redundant; retain all nine reviewed pages. No installed-count or approval claim.' };
  const recorded = (await call(first, 'bas_drawing_review', { command: { kind: 'record', review } })).data.result;
  timings.prepare_record_ms = Math.round(performance.now() - start);
  assert.equal(recorded.origin, 'agent_proposal'); assert.equal(recorded.approved, false); assert.equal(recorded.source_page_count, 9);
  assertProofEqual((await call(first, 'bas_drawing_review', { command: { kind: 'record', review } })).data.result, recorded, 'exact public retry');
  await call(first, 'bas_drawing_review', { command: { kind: 'record', review: { ...review, operation_id: crypto.randomUUID() } } }, true);
  const after = (await call(first, 'export_takeoff')).data;
  const { drawing_events: _old, revision: _oldRevision, ...oldCargo } = workflow;
  const { drawing_events: _new, revision: _newRevision, ...newCargo } = after.bas_workflow;
  assertProofEqual(newCargo, oldCargo, 'all original BAS evidence and decisions unchanged');
  assertProofEqual(after.bas_workflow.drawing_events.slice(0, 2), workflow.drawing_events, 'original browser history retained');
  const nextSets = [...replayBasDrawingHistory(after.bas_workflow.captures, after.bas_workflow.drawing_events).source_sets.values()];
  assert.deepEqual(nextSets.at(-1)!.pages, baseline.pages);
  const beforePage = sets[0].pages[7], afterPage = baseline.pages[7];
  const compared = (await call(first, 'bas_drawing_review', { command: { kind: 'compare', before: beforePage, after: afterPage } })).data.result.comparison;
  assertProofEqual(compared, compareBasDrawingPages(workflow.captures, beforePage, afterPage), 'public comparison parity');
  assert.equal(compared.retained_text_geometry, 'equal'); assert.equal(compared.quantity_changes, 'not_assessed');
  for (const [name, ref] of [['baseline', beforePage], ['incoming', afterPage]] as const) {
    const viewed = await call(first, 'view_sheet', { sheet: ref.page_id, px: 1400 });
    assert.ok(viewed.image?.type === 'image'); assert.equal(viewed.data.added_to_active_set, false);
    assert.equal(viewed.data.source_byte_verification, 'verified_now');
    await writeFile(resolve(out, `${name}-original.png`), Buffer.from(viewed.image.data, 'base64'));
  }
  const exportedPath = resolve(out, 'mcp-reviewed.otbas.zip');
  await call(first, 'export_takeoff', { evidence_bundle_path: exportedPath });
  await first.close(); await connections[0].transport.close();
  const second = await connect(), restarted = await restore(second, exportedPath, 'fresh_process_restore_ms');
  assertProofEqual((await call(second, 'export_takeoff')).data, after, 'durable exported history after process restart');
  const proof = { timings, tools: listed.tools.length, public_built_stdio: true, browser_history_exact: true,
    source_view_and_proposals_verified: true, process_restart_recovered: true, no_historical_pdf_activated: true,
    comparison: compared, records: after.bas_workflow.drawing_events.length,
    checked_records: restored.workflow_replay.checked_records, restarted_checked_records: restarted.workflow_replay.checked_records,
    disclosure: 'Real Fort Sam PDF plus controlled source-derived reordered pages. Prior hardware declarations include controlled operator inputs. No real issued revision, installed quantity, approval or full-goal completion proof.' };
  await writeFile(resolve(out, 'proof.json'), JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof));
} catch (error) {
  await writeFile(resolve(out, 'failure.json'), JSON.stringify({ error: String(error), stack: (error as Error).stack, stderr }, null, 2)); throw error;
} finally { for (const { client, transport } of connections) { await client.close(); await transport.close(); } }
