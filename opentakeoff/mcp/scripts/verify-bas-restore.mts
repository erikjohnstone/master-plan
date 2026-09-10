/** Actual built public MCP restore from a browser-created real-PDF backup. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { withBasEvidenceBundleFile } from '../src/basEvidenceBundleFile.ts';
import { prepareBasRestore, readBasRestorePlan } from '../../web/src/lib/basRestore.ts';
import { prepareBasSourceView, basSourceViewRegion } from '../../web/src/lib/basSourceView.ts';
import { Session } from '../src/session.ts';
import { assertProofEqual } from './helpers/proofEquality.ts';

const [input, citationProof, output] = process.argv.slice(2); assert.ok(input && citationProof && output);
const out = resolve(output); await mkdir(out);
const archivePath = resolve(input), source = await withBasEvidenceBundleFile(archivePath, () => {}, async archive => {
  await archive.verifyOriginals(); return { payload: archive.payload, bundle_id: archive.bundle_id };
});
const citation = JSON.parse(await readFile(citationProof, 'utf8')).source_citation;
const expected = readBasRestorePlan(await prepareBasRestore(new Session().basRestorePayload(), source.payload, source.bundle_id)).payload;
const sourceView = await prepareBasSourceView(source.payload.bas_workflow, { page_id: citation.page_id, bbox_px: citation.bbox_px });
const processes: { client: Client; transport: StdioClientTransport }[] = [];
let stderr = '';
async function connect() {
  const client = new Client({ name: 'bas-restore-proof', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'],
    cwd: fileURLToPath(new URL('../', import.meta.url)), stderr: 'pipe' });
  transport.stderr?.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(-65536); });
  await client.connect(transport); processes.push({ client, transport }); return client;
}
async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 60000 });
  assert.equal(!!response.isError, false, JSON.stringify(response.content).slice(0, 1000));
  const text = response.content.find(c => c.type === 'text'); assert.ok(text?.type === 'text');
  return { data: JSON.parse(text.text), image: response.content.find(c => c.type === 'image') };
}
async function restore(client: Client, path: string) {
  const start = performance.now();
  const preview = (await call(client, 'import_takeoff', { path, restore_evidence_bundle: { action: 'preview' } })).data.bas_restore;
  const previewMs = Math.round(performance.now() - start);
  assert.equal(preview.restored, false); assert.deepEqual(preview.preview.legacy_files, []);
  const result = (await call(client, 'import_takeoff', { path,
    restore_evidence_bundle: { action: 'commit', preview_id: preview.preview_id, directory: out } })).data.bas_restore;
  const commitMs = Math.round(performance.now() - start) - previewMs;
  assert.equal(result.restored, true); assert.equal(result.approved, false); assert.equal(result.project_complete, false);
  assert.deepEqual(result.active_files, []);
  assert.equal(result.workflow_replay.checked_records.assembly.length, 3);
  assert.equal(result.workflow_replay.checked_records.engineering.length, 28);
  assert.equal(result.workflow_replay.calculation_verification, 'verified_shared_python_replay');
  assertProofEqual((await call(client, 'export_takeoff')).data, expected, 'exact restored shared payload');
  return { result, elapsed_ms: Math.round(performance.now() - start), preview_ms: previewMs, commit_ms: commitMs };
}
try {
  const first = await connect(), restored = await restore(first, archivePath);
  const args = { sheet: citation.page_id, px: 2000,
    region: { x0: citation.bbox_px[0], y0: citation.bbox_px[1], x1: citation.bbox_px[2], y1: citation.bbox_px[3] } };
  const viewed = await call(first, 'view_sheet', args); assert.equal(viewed.image?.type, 'image');
  if (viewed.image?.type !== 'image') throw new Error('Expected an actual source image');
  await writeFile(resolve(out, 'restored-citation.png'), Buffer.from(viewed.image.data, 'base64'));
  assert.deepEqual(viewed.data.original_bbox_px, citation.bbox_px);
  const region = basSourceViewRegion(sourceView, sourceView.frame!.width_px, sourceView.frame!.height_px, true);
  assert.deepEqual(viewed.data.region, [region.x0, region.y0, region.x1, region.y1]);
  assert.equal(viewed.data.source_byte_verification, 'verified_now'); assert.equal(viewed.data.saved_frame_verification, 'verified_now');
  assert.equal(viewed.data.added_to_active_set, false);
  assertProofEqual((await call(first, 'export_takeoff')).data, expected, 'source view preserves restored payload');
  const merged = await restore(first, archivePath);
  // Kill the original process. A new process must recover from durable output,
  // not an in-memory replay receipt or retained PDF buffer.
  await first.close(); await processes[0].transport.close();
  const second = await connect(), restarted = await restore(second, restored.result.restored_bundle_path);
  const secondView = await call(second, 'view_sheet', args); assert.equal(secondView.image?.type, 'image');
  assertProofEqual(secondView.data, viewed.data, 'restarted exact source frame/citation');
  const proof = { input_bundle_id: source.bundle_id, source_citation: citation, metadata: viewed.data,
    first_restore_ms: restored.elapsed_ms, existing_history_restore_ms: merged.elapsed_ms, restarted_restore_ms: restarted.elapsed_ms,
    phase_ms: { first: { preview: restored.preview_ms, commit: restored.commit_ms },
      existing_history: { preview: merged.preview_ms, commit: merged.commit_ms }, restart: { preview: restarted.preview_ms, commit: restarted.commit_ms } },
    shared_payload_exact: true, browser_created_bundle: true, process_restart_recovered: true,
    no_historical_pdf_activated: true, replay: restored.result.workflow_replay,
    first_directory: restored.result.directory, restarted_directory: restarted.result.directory,
    disclosure: 'Built dist/server.js, public preview/commit/export/view_sheet. Real Fort Sam PDF/history and browser-created backup. Some retained hardware declarations are controlled operator inputs; no real-addendum, automatic installed quantity, approval or full-goal completion claim.' };
  await writeFile(resolve(out, 'proof.json'), JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof));
} catch (error) {
  await writeFile(resolve(out, 'failure.json'), JSON.stringify({ error: String(error), stack: (error as Error).stack, stderr }, null, 2)); throw error;
} finally { for (const { client, transport } of processes) { await client.close(); await transport.close(); } }
