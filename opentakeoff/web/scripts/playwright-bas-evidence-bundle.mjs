/** Real PDF and saved BAS history through actual import/download/file-selection
 * UI. Controlled adapter delays below exercise cancellation and stale state;
 * they are not claimed as ordinary user interactions or extraction evidence. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
import { openBasEvidenceBundle, prepareBasEvidenceBundle } from '../src/lib/basEvidenceBundle.ts';
import { assertBasWorkflowReplayReceipt } from '../src/lib/basWorkflowReplay.ts';
import { basAssemblyCalculationFingerprint } from '../src/lib/basAssemblyQuantityContract.ts';
const [pdf, archive, output, mcpBundle] = process.argv.slice(2);
assert.ok(pdf && archive && output); const out = resolve(output); await mkdir(out);
const original = await readFile(pdf), baseline = JSON.parse(await readFile(archive, 'utf8')).bas_workflow;
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], checks = [], timings = {}; let downloads = 0;
let appStoreUrl;
page.on('request', request => { const url = new URL(request.url());
  if (url.pathname === '/src/lib/store.js' && !appStoreUrl) appStoreUrl = request.url(); });
page.on('pageerror', error => errors.push(String(error))); page.on('download', () => downloads++);
const saved = () => page.evaluate(async () => (await import('/src/lib/store.js')).localStore.loadAnnotations());
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(page);
  await page.locator('input[name="takeoff-import"]').setInputFiles(archive);
  await waitForAsync(async () => (await saved())?.bas_workflow?.engineering_events?.at(-1)?.event_id === baseline.engineering_events.at(-1).event_id, { timeout: 30000 });
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await page.getByRole('button', { name: 'Review & changes', exact: true }).click();
  await page.getByRole('button', { name: 'Original PDFs', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Original BAS PDFs', exact: true });
  const backup = page.getByRole('region', { name: 'Portable evidence backup', exact: true });
  const before = await saved(); const started = performance.now();
  const pending = page.waitForEvent('download', { timeout: 60000 });
  await backup.getByRole('button', { name: 'Download evidence bundle', exact: true }).click();
  await (await pending).saveAs(resolve(out, 'browser.otbas.zip')); timings.export_ms = Math.round(performance.now() - started);
  const bytes = new Uint8Array(await readFile(resolve(out, 'browser.otbas.zip')));
  const opened = await openBasEvidenceBundle({ size: bytes.length, async read(offset, length) { return bytes.subarray(offset, offset + length); } });
  await opened.verifyOriginals(); assert.deepEqual(opened.payload, before);
  assert.deepEqual(opened.payload.bas_workflow, baseline);
  const sha = createHash('sha256').update(original).digest('hex');
  assert.deepEqual(await opened.readSource(`sha256:${sha}`), new Uint8Array(original));
  const chunks = [];
  for await (const chunk of (await prepareBasEvidenceBundle(before)).stream(async item => { assert.equal(item.source.sha256, sha); return original; })) chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks), Buffer.from(bytes), 'UI emits exact shared deterministic archive');
  await backup.getByRole('button', { name: 'Verify evidence bundle', exact: true }).click();
  // File input is the actual picker entry point; setting it is Playwright's
  // upload mechanism, not an injected application result.
  await page.locator('input[name="bas-evidence-bundle"]').setInputFiles(resolve(out, 'browser.otbas.zip'));
  await backup.getByRole('status').filter({ hasText: 'Nothing was restored' }).waitFor();
  assert.deepEqual(await saved(), before);
  checks.push('Actual download/picker verification; exact shared archive, saved payload and original digest; zero state mutation');
  const replayStart = performance.now(), responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/__ot/bas-workflow-replay');
  await backup.getByRole('button', { name: 'Replay saved calculations', exact: true }).click();
  const replayResponse = await responsePromise; assert.equal(replayResponse.status(), 200);
  const replay = await assertBasWorkflowReplayReceipt(baseline, await replayResponse.json());
  await backup.getByRole('status').filter({ hasText: 'Saved calculations match shared Python' }).waitFor({ timeout: 60000 });
  timings.replay_ms = Math.round(performance.now() - replayStart);
  assert.equal(replay.checked_records.assembly.length, 3); assert.equal(replay.checked_records.engineering.length, 28);
  assert.deepEqual(await saved(), before);
  checks.push('Actual UI/HTTP/Python replay covers all 31 retained historical calculations without changing saved history or implying approval');
  if (mcpBundle) {
    const mcpBytes = new Uint8Array(await readFile(mcpBundle));
    const expectedMcp = await openBasEvidenceBundle({ size: mcpBytes.length, async read(offset, length) { return mcpBytes.subarray(offset, offset + length); } });
    await page.locator('input[name="bas-evidence-bundle"]').setInputFiles(mcpBundle);
    await backup.getByRole('status').filter({ hasText: expectedMcp.bundle_id }).waitFor();
    assert.deepEqual(await saved(), before);
    checks.push('Built MCP archive verified through actual browser file input without restoration');
  }
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    await page.setViewportSize({ width, height });
    assert.ok(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await page.screenshot({ path: resolve(out, `backup-${theme}-${width}.png`) });
  }
  // Real saved calculation forgery: structurally valid history + valid archive
  // hashes must still fail actual Python. This is a controlled negative, not a
  // change to the real-PDF fixture or a mocked calculation response.
  const forged = structuredClone(before), calculation = forged.bas_workflow.assembly_calculations.find(c => c.result.components.some(row => row.status === 'calculated_declared_quantity'));
  assert.ok(calculation); calculation.result.components.find(row => row.status === 'calculated_declared_quantity').assigned_quantity += 1;
  const { calculation_id: _id, ...calculationPayload } = calculation;
  calculation.calculation_id = await basAssemblyCalculationFingerprint(calculationPayload);
  const forgedChunks = [];
  for await (const chunk of (await prepareBasEvidenceBundle(forged)).stream(async () => original)) forgedChunks.push(chunk);
  const forgedPath = resolve(out, 'wrong-calculation.otbas.zip'); await writeFile(forgedPath, Buffer.concat(forgedChunks));
  await page.locator('input[name="bas-evidence-bundle"]').setInputFiles(forgedPath);
  await backup.getByRole('status').filter({ hasText: 'Nothing was restored' }).waitFor();
  await backup.getByRole('button', { name: 'Replay saved calculations', exact: true }).click();
  await backup.getByRole('alert').filter({ hasText: 'does not match shared Python replay' }).waitFor({ timeout: 60000 });
  assert.deepEqual(await saved(), before);
  checks.push('Valid archive with re-signed wrong assembly quantity passes byte inspection but actual UI/Python replay rejects it');
  await page.screenshot({ path: resolve(out, 'replay-refused.png') });
  await page.locator('input[name="bas-evidence-bundle"]').setInputFiles(resolve(out, 'browser.otbas.zip'));
  await backup.getByRole('status').filter({ hasText: 'Nothing was restored' }).waitFor();
  let releaseReplay, interceptedReplay = false;
  await page.route('**/__ot/bas-workflow-replay', async route => {
    interceptedReplay = true; await new Promise(resolve => { releaseReplay = resolve; });
    await route.continue().catch(() => {});
  });
  await backup.getByRole('button', { name: 'Replay saved calculations', exact: true }).click();
  await waitForAsync(() => interceptedReplay, { timeout: 30000 });
  await backup.getByRole('button', { name: 'Cancel backup operation', exact: true }).click();
  await backup.getByRole('alert').filter({ hasText: 'Cancelled' }).waitFor();
  releaseReplay(); await page.unroute('**/__ot/bas-workflow-replay');
  assert.deepEqual(await saved(), before);
  checks.push('Controlled pending HTTP transport + actual UI cancel accepts no replay and changes no saved state');
  // Controlled transport pause: cancel through the real UI before publishing.
  await page.evaluate(async url => { const adapter = (await import(url)).store;
    const real = adapter.loadAnnotations.bind(adapter); window.__bundleLoad = real;
    adapter.loadAnnotations = async () => { await new Promise(resolve => { window.__bundleRelease = resolve; }); return real(); };
  }, appStoreUrl);
  await backup.getByRole('button', { name: 'Download evidence bundle', exact: true }).click();
  await page.waitForFunction(() => typeof window.__bundleRelease === 'function');
  await backup.getByRole('button', { name: 'Cancel backup operation', exact: true }).click();
  await page.evaluate(() => window.__bundleRelease());
  await backup.getByRole('alert').filter({ hasText: 'Cancelled' }).waitFor();
  assert.equal(downloads, 1);
  await page.evaluate(async url => { (await import(url)).store.loadAnnotations = window.__bundleLoad; }, appStoreUrl);
  checks.push('Controlled slow storage + actual cancellation leaves no extra download');
  // Controlled concurrent save between the export's first and final reads.
  await page.evaluate(async url => { const adapter = (await import(url)).store; let reads = 0;
    adapter.loadAnnotations = async () => {
      const payload = await window.__bundleLoad();
      if (++reads === 2) { payload.project_name = 'Controlled concurrent save'; await adapter.saveAnnotations(payload); }
      return payload;
    };
  }, appStoreUrl);
  await backup.getByRole('button', { name: 'Download evidence bundle', exact: true }).click();
  await backup.getByRole('alert').filter({ hasText: 'Saved workspace changed' }).waitFor();
  assert.equal(downloads, 1); assert.equal((await saved()).project_name, 'Controlled concurrent save');
  await page.evaluate(async ({ url, before }) => { const adapter = (await import(url)).store;
    adapter.loadAnnotations = window.__bundleLoad; await adapter.saveAnnotations(before);
  }, { url: appStoreUrl, before });
  checks.push('Controlled concurrent persisted save rejected at publication boundary, with no extra download');
  const corrupt = bytes.slice(); corrupt[40] ^= 1; await writeFile(resolve(out, 'corrupt.otbas.zip'), corrupt);
  await page.locator('input[name="bas-evidence-bundle"]').setInputFiles(resolve(out, 'corrupt.otbas.zip'));
  await backup.getByRole('alert').filter({ hasText: 'headers disagree' }).waitFor(); assert.deepEqual(await saved(), before);
  checks.push('Corrupt archive refused without state mutation');
  assert.deepEqual(errors, []);
  await writeFile(resolve(out, 'proof.json'), JSON.stringify({ checks, timings, errors, workflow_replay: replay, bundle_id: opened.bundle_id,
    archive_sha256: createHash('sha256').update(bytes).digest('hex'), source_sha256: sha, archive_bytes: bytes.length }, null, 2));
  process.stdout.write(JSON.stringify({ checks, timings, errors, out }) + '\n');
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure.png') });
  await writeFile(resolve(out, 'failure.txt'), String(error) + '\n' + await page.locator('body').innerText());
  throw error;
} finally { await browser.close(); }
