/** Controlled transport benchmark, not PDF parsing or installed-count evidence.
 * Run each case in a fresh process to measure independent peak process RSS. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { captureBasPoints } from '../../web/src/lib/basWorkflow.ts';
import { sha256Hex } from '../../web/src/lib/graphKeys.js';
import { prepareBasEvidenceBundle } from '../../web/src/lib/basEvidenceBundle.ts';
import { writeAtomicArtifact } from '../src/atomicArtifactFile.ts';
import { inspectBasEvidenceBundleFile } from '../src/basEvidenceBundleFile.ts';
const [mode, destination] = process.argv.slice(2);
assert.ok(destination && ['single', 'multi'].includes(mode));
const out = resolve(destination); await mkdir(out);
const sizes = mode === 'single' ? [165589793] : [165589793, 165589793, 165589793, 54350025];
const sources = [];
const sourceBytes = (i: number) => new Uint8Array(sizes[i]).fill(i + 1);
for (let i = 0; i < sizes.length; i++) {
  const sha256 = await sha256Hex(sourceBytes(i));
  sources.push({ source_id: `sha256:${sha256}`, sha256, byte_length: sizes[i], page_count: 1, names: [`controlled-${i}.pdf`] });
}
const workflow = await captureBasPoints(sources, { schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1',
  scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [] });
const prepared = await prepareBasEvidenceBundle({ schema: 'opentakeoff.takeoff_canvas.v1', bas_workflow: workflow });
let loads = 0, loading = 0, peakLoading = 0, largestChunk = 0, total = 0;
const started = performance.now();
async function* stream() {
  for await (const chunk of prepared.stream(async item => {
    loads++; loading++; peakLoading = Math.max(peakLoading, loading);
    const bytes = sourceBytes(sources.findIndex(s => s.sha256 === item.source.sha256)); loading--; return bytes;
  })) { largestChunk = Math.max(largestChunk, chunk.length); total += chunk.length; yield chunk; }
}
const file = join(out, 'controlled.otbas.zip'); await writeAtomicArtifact(file, 'zip', stream(), false, () => {});
const exportMs = performance.now() - started, verifyStarted = performance.now();
const inspection = await inspectBasEvidenceBundleFile(file), verifyMs = performance.now() - verifyStarted;
const peakRssBytes = process.resourceUsage().maxRSS * 1024;
const proof = { mode, source_bytes: sizes.reduce((a, b) => a + b, 0), archive_bytes: total, export_ms: exportMs,
  verify_ms: verifyMs, peak_rss_bytes: peakRssBytes, loads, peak_concurrent_loads: peakLoading,
  largest_output_chunk: largestChunk, bundle_id: inspection.bundle_id, limits: { phase_ms: 20000, rss_bytes: 1.25 * 1024 ** 3 },
  disclosure: 'Controlled binary source transport only, not valid PDF interpretation. Node atomic file sink; browser memory not measured.' };
await writeFile(join(out, 'proof.json'), JSON.stringify(proof, null, 2)); process.stdout.write(JSON.stringify(proof) + '\n');
assert.equal(loads, sizes.length); assert.equal(peakLoading, 1); assert.ok(largestChunk <= 65536);
assert.ok(exportMs < 20000 && verifyMs < 20000); assert.ok(peakRssBytes < 1.25 * 1024 ** 3);
