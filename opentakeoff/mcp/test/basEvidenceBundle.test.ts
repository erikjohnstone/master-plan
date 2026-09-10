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
import { writeAtomicArtifact } from '../src/atomicArtifactFile.ts';
import { exportBasEvidenceBundle, inspectBasEvidenceBundleFile } from '../src/basEvidenceBundleFile.ts';
import { captureBasPoints, mergeBasWorkflows } from '../../web/src/lib/basWorkflow.ts';
import { prepareBasEvidenceBundle } from '../../web/src/lib/basEvidenceBundle.ts';
import { sha256Hex } from '../../web/src/lib/graphKeys.js';

async function capture(bytes: Uint8Array) {
  const sha256 = await sha256Hex(bytes);
  return captureBasPoints([{ source_id: `sha256:${sha256}`, sha256, byte_length: bytes.length, page_count: 1, names: ['same.pdf'] }],
    { schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1', scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [] });
}

test('atomic streaming errors, cancellation and competing targets preserve prior files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bas-bundle-atomic-')), target = join(dir, 'evidence.zip');
  await writeFile(target, 'original');
  async function* failed() { yield new Uint8Array([1]); throw new Error('source unavailable'); }
  await assert.rejects(writeAtomicArtifact(target, 'zip', failed(), true, () => {}), /unavailable/);
  assert.equal(await readFile(target, 'utf8'), 'original');
  await assert.rejects(writeAtomicArtifact(target, 'zip', [new Uint8Array([2])], true, () => { throw new Error('cancelled'); }), /cancelled/);
  assert.equal(await readFile(target, 'utf8'), 'original');
  const absent = join(dir, 'new.zip');
  async function* race() { yield new Uint8Array([1]); await writeFile(absent, 'concurrent output'); }
  await assert.rejects(writeAtomicArtifact(absent, 'zip', race(), undefined, () => {}), /EEXIST/);
  assert.equal(await readFile(absent, 'utf8'), 'concurrent output');
  assert.deepEqual((await readdir(dir)).sort(), ['evidence.zip', 'new.zip']);
});

test('public MCP bundle export/preflight has shared exact bytes, retains historical versions and leaves session unchanged', async () => {
  const session = new Session(), server = buildServer(session), client = new Client({ name: 'bundle-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  const dir = await mkdtemp(join(tmpdir(), 'bas-bundle-public-')), target = join(dir, 'backup.otbas.zip');
  const bytes = await readFile(fileURLToPath(new URL('../../demo/sample-plan.pdf', import.meta.url)));
  const loadedPath = join(dir, 'same.pdf'); await writeFile(loadedPath, bytes);
  const history = new TextEncoder().encode('%PDF-controlled-historical-bytes'), historyPath = join(dir, 'renamed-history.pdf'); await writeFile(historyPath, history);
  const history2 = new TextEncoder().encode('%PDF-controlled-historical-BYTES'), historyPath2 = join(dir, 'another-history.pdf'); await writeFile(historyPath2, history2);
  const historical = [{ bytes: history, path: historyPath, sha: await sha256Hex(history) },
    { bytes: history2, path: historyPath2, sha: await sha256Hex(history2) }];
  assert.equal(history.length, history2.length);
  // Reverse digest order forces lookup to identify a later source while finding
  // the first; this exercises the subsequent digest-indexed historical lookup.
  const paths = [...historical].sort((a, b) => b.sha.localeCompare(a.sha)).map(x => x.path);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    return { error: !!result.isError, data: JSON.parse((result.content as Array<{ text: string }>)[0].text) };
  };
  try {
    assert.equal((await call('load_plan', { path: loadedPath })).error, false);
    session.retainBasWorkflow(mergeBasWorkflows(mergeBasWorkflows(await capture(bytes), await capture(history))!, await capture(history2))!);
    const before = structuredClone(session.exportPayload());
    // Retrieval must use the loaded document's original, never a changed path.
    await writeFile(loadedPath, 'different file now occupies this path');
    assert.equal((await call('export_takeoff', { evidence_bundle_path: target })).error, true);
    await assert.rejects(stat(target), /ENOENT/);
    const reply = await call('export_takeoff', { evidence_bundle_path: target, original_pdf_paths: paths });
    assert.equal(reply.error, false, JSON.stringify(reply)); assert.deepEqual(reply.data, before);
    const prepared = await prepareBasEvidenceBundle(before), chunks: Uint8Array[] = [];
    const currentSha = await sha256Hex(bytes);
    for await (const chunk of prepared.stream(async item => item.source.sha256 === currentSha ? bytes : historical.find(h => h.sha === item.source.sha256)!.bytes)) chunks.push(chunk);
    assert.deepEqual(await readFile(target), Buffer.concat(chunks));
    const verified = await call('import_takeoff', { path: target, verify_evidence_bundle: true });
    assert.equal(verified.error, false, JSON.stringify(verified));
    assert.equal(verified.data.bas_evidence_bundle.restored, false);
    assert.equal(verified.data.bas_evidence_bundle.calculation_verification, 'not_python_replayed');
    assert.equal(verified.data.bas_evidence_bundle.manifest.sources.length, 3);
    assert.deepEqual(session.exportPayload(), before);
    const previous = await readFile(target);
    assert.equal((await call('export_takeoff', { evidence_bundle_path: target, original_pdf_paths: [historyPath] })).error, true);
    assert.equal((await call('export_takeoff', { evidence_bundle_path: target, path: join(dir, 'no.json') })).error, true);
    assert.equal((await call('export_takeoff', { original_pdf_paths: [historyPath] })).error, true);
    assert.deepEqual(await readFile(target), previous);
    assert.equal((await inspectBasEvidenceBundleFile(target)).bundle_id, prepared.bundle_id);
    // Catch in-place changes despite unchanged workflow object identity.
    const originalLoader = session.basOriginalBytes.bind(session);
    session.basOriginalBytes = async sha => { const result = await originalLoader(sha); session.conditions.push({ ...session.conditions[0], id: 'changed' }); return result; };
    await assert.rejects(exportBasEvidenceBundle(session, target, paths, true), /Workspace changed/);
    assert.deepEqual(await readFile(target), previous);
  } finally { await client.close(); await server.close(); }
});
