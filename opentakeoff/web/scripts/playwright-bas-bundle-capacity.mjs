/** Isolated controlled browser transport, no PDF parsing or actual plan upload. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const exec = promisify(execFile), out = resolve(process.argv[2]); await mkdir(out);
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage(), cdp = await browser.newBrowserCDPSession();
let peakRss = 0, sampling = true, samples = 0; const errors = [];
page.on('pageerror', e => errors.push(String(e)));
async function sample() {
  while (sampling) {
    const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
    const ids = processInfo.map(p => p.id).filter(id => Number.isSafeInteger(id) && id > 0);
    const { stdout } = await exec('ps', ['-o', 'rss=', '-p', ids.join(',')]);
    const rss = stdout.trim().split(/\s+/).reduce((sum, n) => sum + Number(n) * 1024, 0);
    peakRss = Math.max(peakRss, rss); samples++; await new Promise(resolve => setTimeout(resolve, 100));
  }
}
let poll;
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' }); poll = sample();
  const proof = await page.evaluate(async () => {
    const { captureBasPoints } = await import('/src/lib/basWorkflow.ts');
    const { sha256Hex } = await import('/src/lib/graphKeys.js');
    const { prepareBasEvidenceBundle, openBasEvidenceBundle } = await import('/src/lib/basEvidenceBundle.ts');
    const { createBasEvidenceBundleBlob } = await import('/src/lib/basEvidenceBundleBrowser.js');
    const sizes = [165589793, 165589793, 165589793, 54350025], sources = [];
    const make = i => new Uint8Array(sizes[i]).fill(i + 1);
    for (let i = 0; i < sizes.length; i++) { const sha256 = await sha256Hex(make(i));
      sources.push({ source_id: `sha256:${sha256}`, sha256, byte_length: sizes[i], page_count: 1, names: [`controlled-${i}.pdf`] }); }
    const workflow = await captureBasPoints(sources, { schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1',
      scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [] });
    const prepared = await prepareBasEvidenceBundle({ schema: 'opentakeoff.takeoff_canvas.v1', bas_workflow: workflow });
    const start = performance.now();
    const blob = await createBasEvidenceBundleBlob(prepared, async item => make(sources.findIndex(s => s.sha256 === item.source.sha256)), () => {});
    const exportMs = performance.now() - start, verifyStart = performance.now();
    const read = await openBasEvidenceBundle({ size: blob.size,
      async read(offset, length) { return new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()); } });
    await read.verifyOriginals();
    return { source_bytes: sizes.reduce((a, b) => a + b, 0), archive_bytes: blob.size, export_ms: exportMs,
      verify_ms: performance.now() - verifyStart, bundle_id: read.bundle_id, sources: read.manifest.sources.length };
  });
  sampling = false; await poll;
  const result = { ...proof, peak_sampled_chrome_rss_bytes: peakRss, samples, errors,
    limits: { phase_ms: 30000, sampled_rss_bytes: 2 * 1024 ** 3 },
    disclosure: 'Controlled binary inputs, actual browser Blob delivery helper and shared verification. 100ms summed Chrome-process RSS samples including setup; not a loaded 30-PDF canvas or exact instantaneous peak.' };
  await writeFile(resolve(out, 'proof.json'), JSON.stringify(result, null, 2)); process.stdout.write(JSON.stringify(result) + '\n');
  assert.equal(proof.source_bytes, 551119404); assert.equal(proof.sources, 4); assert.deepEqual(errors, []);
  assert.ok(proof.export_ms < 30000 && proof.verify_ms < 30000); assert.ok(peakRss < 2 * 1024 ** 3);
} finally { sampling = false; if (poll) await poll; await browser.close(); }
