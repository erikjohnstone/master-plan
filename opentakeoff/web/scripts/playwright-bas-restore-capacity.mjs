/** Controlled binary capacity proof. No PDF parsing/accuracy claim. Reuses the
 * prior 551,119,404-byte transport fixture and predeclared 30s / 2GiB budgets. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const exec = promisify(execFile), out = resolve(process.argv[2]); await mkdir(out);
const profile = process.env.OT_CAPACITY_PERSISTENT === '1' ? await mkdtemp(resolve(tmpdir(), 'bas-restore-capacity-')) : null;
const persistent = profile ? await chromium.launchPersistentContext(profile, { executablePath: process.env.OT_BROWSER_PATH || undefined }) : null;
const browser = persistent ? persistent.browser() : await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = persistent ? await persistent.newPage() : await browser.newPage(), cdp = await browser.newBrowserCDPSession();
let restoreUrl;
// Vite may version module URLs after HMR. Use the app's actual module instance:
// private preview handles must not cross a second, independently imported copy.
page.on('request', request => { if (!restoreUrl && new URL(request.url()).pathname === '/src/lib/basRestore.ts') restoreUrl = request.url(); });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
let sampling = true, peakRss = 0, samples = 0, poll;
async function sample() {
  while (sampling) {
    const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
    const ids = processInfo.map(p => p.id).filter(id => Number.isSafeInteger(id) && id > 0);
    const { stdout } = await exec('ps', ['-o', 'rss=', '-p', ids.join(',')]);
    peakRss = Math.max(peakRss, stdout.trim().split(/\s+/).reduce((sum, n) => sum + Number(n) * 1024, 0));
    samples++; await new Promise(r => setTimeout(r, 100));
  }
}
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' }); poll = sample();
  assert.ok(restoreUrl);
  const proof = await page.evaluate(async restoreUrl => {
    const { captureBasPoints } = await import('/src/lib/basWorkflow.ts');
    const { sha256Hex } = await import('/src/lib/graphKeys.js');
    const { prepareBasRestore, replayBasRestore } = await import(restoreUrl);
    const { createLocalStore } = await import('/src/lib/store.js');
    const adapter = createLocalStore('controlled-restore-capacity');
    const sizes = [165589793, 165589793, 165589793, 54350025], sources = [];
    const make = i => new Uint8Array(sizes[i]).fill(i + 1);
    for (let i = 0; i < sizes.length; i++) {
      const sha256 = await sha256Hex(make(i));
      sources.push({ source_id: `sha256:${sha256}`, sha256, byte_length: sizes[i], page_count: 1, names: [`controlled-${i}.pdf`] });
    }
    const workflow = await captureBasPoints(sources, { schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1',
      scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: [] });
    const plan = await prepareBasRestore(await adapter.loadAnnotations(), { schema: 'opentakeoff.takeoff_canvas.v1', bas_workflow: workflow }, 'c'.repeat(64));
    await replayBasRestore(plan, async w => {
      const response = await fetch('/__ot/bas-workflow-replay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflow: w, request: {} }) });
      if (!response.ok) throw new Error('Actual Python replay failed'); return response.json();
    });
    const storage_before = await navigator.storage.estimate(), start = performance.now();
    try {
      await adapter.restoreBasEvidence(plan, async item => make(sources.findIndex(s => s.source_id === item.source.source_id)));
    } catch (error) {
      const available = [];
      for (const { names, ...source } of sources) available.push(!!(await adapter.loadBasSource(source)));
      return { failed: true, error: String(error), source_bytes: sizes.reduce((a, b) => a + b, 0), sources: sources.length,
        storage_before, storage_after: await navigator.storage.estimate(), restore_ms: performance.now() - start,
        annotations: await adapter.loadAnnotations(), journal: (await adapter.loadBasRestoreJournal(plan.operation_id)) ?? null,
        available_originals: available, active_sheets: (await adapter.listSheets()).length };
    }
    const restore_ms = performance.now() - start, verifyStart = performance.now();
    for (const { names, ...source } of sources) {
      const bytes = await adapter.loadBasSource(source);
      if (!bytes || await sha256Hex(bytes) !== source.sha256) throw new Error('Retained bytes differ');
    }
    return { source_bytes: sizes.reduce((a, b) => a + b, 0), sources: sources.length, storage_before, storage_after: await navigator.storage.estimate(), restore_ms, verify_ms: performance.now() - verifyStart,
      active_sheets: (await adapter.listSheets()).length, journal_sources: (await adapter.loadBasRestoreJournal(plan.operation_id)).sources.length };
  }, restoreUrl);
  sampling = false; await poll;
  const result = { ...proof, peak_sampled_chrome_rss_bytes: peakRss, samples, errors, browser_version: browser.version(),
    profile_mode: profile ? 'isolated_persistent' : 'private_context', retained_profile: profile,
    limits: { phase_ms: 30000, sampled_rss_bytes: 2 * 1024 ** 3 },
    disclosure: 'Controlled byte arrays, actual Python empty-history replay and browser IDB restore; not parsed PDFs or corpus accuracy. 100ms summed Chrome-process RSS, not exact instantaneous peak. Synchronous final hashing may briefly block UI on large originals.' };
  await writeFile(resolve(out, 'proof.json'), JSON.stringify(result, null, 2)); process.stdout.write(JSON.stringify(result) + '\n');
  assert.ok(!proof.failed, 'Capacity restore did not complete; inspect failure/rollback evidence');
  assert.equal(proof.source_bytes, 551119404); assert.equal(proof.journal_sources, 4); assert.equal(proof.active_sheets, 0); assert.deepEqual(errors, []);
  assert.ok(proof.restore_ms < 30000 && proof.verify_ms < 30000); assert.ok(peakRss < 2 * 1024 ** 3);
} finally { sampling = false; if (poll) await poll; await browser.close(); }
