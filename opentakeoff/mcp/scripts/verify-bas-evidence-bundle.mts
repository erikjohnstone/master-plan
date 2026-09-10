/** Built public MCP + real browser archive. No hidden Session writes. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { openBasEvidenceBundle, prepareBasEvidenceBundle } from '../../web/src/lib/basEvidenceBundle.ts';
import { assertProofEqual as same } from './helpers/proofEquality.ts';
import { assertBasWorkflowReplayReceipt } from '../../web/src/lib/basWorkflowReplay.ts';
const [pdf, browserZip, output, forgedZip] = process.argv.slice(2); assert.ok(pdf && browserZip && output);
const out = resolve(output); await mkdir(out);
const bytes = new Uint8Array(await readFile(resolve(browserZip))), original = await readFile(resolve(pdf));
const browser = await openBasEvidenceBundle({ size: bytes.length, async read(offset, length) { return bytes.subarray(offset, offset + length); } });
await browser.verifyOriginals();
const client = new Client({ name: 'bas-evidence-bundle-proof', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'],
  cwd: fileURLToPath(new URL('../', import.meta.url)), stderr: 'pipe' });
let stderr = ''; transport.stderr?.on('data', b => { stderr = (stderr + b.toString()).slice(-65536); });
async function call(name: string, args: Record<string, unknown> = {}, error = false) {
  const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 60000 });
  assert.equal(!!response.isError, error, JSON.stringify(response.content).slice(0, 2000));
  const text = response.content.find(c => c.type === 'text'); assert.ok(text?.type === 'text');
  const parsed = JSON.parse(text.text); if (response.structuredContent) same(response.structuredContent, parsed, 'Structured/text parity'); return parsed;
}
try {
  await client.connect(transport);
  const preflight = await call('import_takeoff', { path: resolve(browserZip), verify_evidence_bundle: true });
  assert.equal(preflight.bas_evidence_bundle.bundle_id, browser.bundle_id); assert.equal(preflight.bas_evidence_bundle.restored, false);
  assert.equal(preflight.shapes_added, 0);
  const replayStart = performance.now();
  const replayed = await call('import_takeoff', { path: resolve(browserZip), verify_evidence_bundle: true, replay_calculations: true });
  const receipt = await assertBasWorkflowReplayReceipt(browser.payload.bas_workflow, replayed.bas_evidence_bundle.workflow_replay);
  assert.equal(receipt.calculation_verification, 'verified_shared_python_replay');
  assert.equal(receipt.checked_records.assembly.length, 3); assert.equal(receipt.checked_records.engineering.length, 28);
  const replayMs = Math.round(performance.now() - replayStart);
  await call('load_plan', { path: resolve(pdf) });
  const json = resolve(out, 'browser-payload.takeoff.json'); await writeFile(json, JSON.stringify(browser.payload));
  await call('import_takeoff', { path: json });
  const before = await call('export_takeoff'); same(before.bas_workflow, browser.payload.bas_workflow, 'Exact original history after ordinary JSON import');
  const target = resolve(out, 'mcp.otbas.zip'), start = performance.now();
  const exported = await call('export_takeoff', { evidence_bundle_path: target });
  const exportMs = Math.round(performance.now() - start); same(exported, before, 'Original inline export contract unchanged');
  const written = await readFile(target), chunks: Uint8Array[] = [];
  for await (const chunk of (await prepareBasEvidenceBundle(before)).stream(async () => original)) chunks.push(chunk);
  assert.deepEqual(written, Buffer.concat(chunks));
  const verified = await call('import_takeoff', { path: target, verify_evidence_bundle: true });
  const verifiedReplay = await call('import_takeoff', { path: target, verify_evidence_bundle: true, replay_calculations: true });
  same(verifiedReplay.bas_evidence_bundle.workflow_replay, receipt, 'Exact replay receipt across browser/MCP archives');
  same(verified.bas_evidence_bundle.manifest.sources, browser.manifest.sources, 'Browser/MCP exact original versions and ownership');
  await call('export_takeoff', { evidence_bundle_path: target }, true);
  if (forgedZip) {
    const byteOnly = await call('import_takeoff', { path: resolve(forgedZip), verify_evidence_bundle: true });
    assert.equal(byteOnly.bas_evidence_bundle.calculation_verification, 'not_python_replayed');
    const rejected = await call('import_takeoff', { path: resolve(forgedZip), verify_evidence_bundle: true, replay_calculations: true }, true);
    assert.match(JSON.stringify(rejected), /assembly result .* does not match shared Python replay/);
  }
  same(await call('export_takeoff'), before, 'Read-only inspection and rejected collision preserve all state');
  const result = { browser_bundle_id: browser.bundle_id, mcp_bundle_id: verified.bas_evidence_bundle.bundle_id,
    exact_shared_bytes: true, same_history_and_sources: true, source_versions: browser.manifest.sources.length,
    verified_without_loaded_plan: true, preserved_state: true, restored: false, export_ms: exportMs, replay_ms: replayMs, workflow_replay: receipt,
    forged_calculation_refused: !!forgedZip,
    disclosure: 'Built dist/server.js public MCP; JSON merge preserves legacy per-surface UI fields, so full payload/bundle IDs can differ. Sources and BAS history compare exactly.' };
  await writeFile(resolve(out, 'proof.json'), JSON.stringify(result, null, 2)); process.stdout.write(JSON.stringify(result) + '\n');
} catch (error) { await writeFile(resolve(out, 'failure.json'), JSON.stringify({ error: String(error), stderr }, null, 2)); throw error; }
finally { await client.close(); await transport.close(); await writeFile(resolve(out, 'stderr.log'), stderr); }
