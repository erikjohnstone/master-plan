/** Built public MCP and a real saved source citation. The different same-named
 * current PDF is a controlled revision substitute, not a real addendum pair. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { prepareBasSourceView, basSourceViewRegion } from '../../web/src/lib/basSourceView.ts';
const [pdf, history, browserProof, output] = process.argv.slice(2); assert.ok(pdf && history && browserProof && output);
const out = resolve(output); await mkdir(out);
const payload = JSON.parse(await readFile(history, 'utf8'));
const browser = JSON.parse(await readFile(browserProof, 'utf8')), citation = browser.source_citation;
const request = { page_id: citation.page_id, bbox_px: citation.bbox_px };
const expected = await prepareBasSourceView(payload.bas_workflow, request);
const replacement = resolve(out, basename(pdf));
await copyFile(fileURLToPath(new URL('../test/fixtures/scanned-plan.pdf', import.meta.url)), replacement);
const client = new Client({ name: 'bas-original-source-proof', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'],
  cwd: fileURLToPath(new URL('../', import.meta.url)), stderr: 'pipe' });
let stderr = ''; transport.stderr?.on('data', b => { stderr = (stderr + b.toString()).slice(-65536); });
async function call(name: string, args: Record<string, unknown> = {}, error = false) {
  const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 60000 });
  assert.equal(!!response.isError, error, JSON.stringify(response.content).slice(0, 1000));
  const text = response.content.find(c => c.type === 'text'); assert.ok(text?.type === 'text');
  return { meta: JSON.parse(text.text), image: response.content.find(c => c.type === 'image') };
}
try {
  await client.connect(transport);
  const loaded = (await call('load_plan', { path: replacement })).meta;
  await call('import_takeoff', { path: resolve(history) });
  const before = (await call('export_takeoff')).meta;
  assert.deepEqual(before.bas_workflow, payload.bas_workflow);
  const args = { sheet: citation.page_id, px: 2000,
    region: { x0: citation.bbox_px[0], y0: citation.bbox_px[1], x1: citation.bbox_px[2], y1: citation.bbox_px[3] } };
  const absent = (await call('view_sheet', args, true)).meta;
  assert.match(JSON.stringify(absent), /Exact original PDF unavailable/);
  const wrong = (await call('view_sheet', { ...args, original_pdf_path: replacement }, true)).meta;
  assert.match(JSON.stringify(wrong), /length mismatch/);
  const start = performance.now();
  const result = await call('view_sheet', { ...args, original_pdf_path: resolve(pdf) });
  const elapsed = Math.round(performance.now() - start);
  assert.equal(result.image?.type, 'image');
  if (result.image?.type !== 'image') throw new Error('Actual PNG required');
  await writeFile(resolve(out, 'original-citation.png'), Buffer.from(result.image.data, 'base64'));
  assert.deepEqual(result.meta.original_bbox_px, citation.bbox_px); assert.equal(result.meta.page_id, citation.page_id);
  const region = basSourceViewRegion(expected, expected.frame!.width_px, expected.frame!.height_px, true);
  assert.deepEqual(result.meta.region, [region.x0, region.y0, region.x1, region.y1]);
  assert.equal(result.meta.source_byte_verification, 'verified_now'); assert.equal(result.meta.saved_frame_verification, 'verified_now');
  assert.equal(result.meta.read_only, true); assert.equal(result.meta.added_to_active_set, false);
  await call('view_sheet', { ...args, original_pdf_path: resolve(pdf), overlay: true }, true);
  assert.deepEqual((await call('export_takeoff')).meta, before);
  const current = await call('view_sheet', { sheet: loaded.sheets[0].sheet, px: 200 });
  assert.equal(current.image?.type, 'image');
  const proof = { original_source_id: expected.source.source_id, source_citation: citation, metadata: result.meta,
    view_ms: elapsed, exact_shared_region_and_bbox: true, active_same_named_pdf_unchanged: true,
    history_and_annotations_unchanged: true, missing_original_refused: true, wrong_original_refused: true,
    active_overlay_refused: true, disclosure: 'Built dist/server.js public tools; real Fort Sam history/source, controlled different same-named current PDF. No actual addendum or takeoff-completeness claim.' };
  await writeFile(resolve(out, 'proof.json'), JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof));
} catch (error) {
  await writeFile(resolve(out, 'failure.json'), JSON.stringify({ error: String(error), stack: (error as Error).stack, stderr }, null, 2)); throw error;
} finally { await client.close(); await transport.close(); }
