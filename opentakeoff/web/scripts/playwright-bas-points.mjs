// Real PDF -> production compile -> matrix UI -> actual download -> autosave/reload.
// No injected extraction/interpretation result. Corruption unit tests are separate.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';

assert.ok(process.env.OT_UI_PDF && process.env.OT_BAS_OUT, 'PDF and output directory are required');
const out = resolve(process.env.OT_BAS_OUT);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(resolve(process.env.OT_UI_PDF));
  console.log('Real PDF uploaded; waiting for graph indexing');
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 300000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(page);
  const responsePromise = page.waitForResponse(r => r.url().includes('/__ot/compile-corpus-takeoff'), { timeout: 120000 });
  const answer = await page.evaluate(() => window.__opentakeoff.compileCorpusTakeoff('bas_points', { download: false }));
  const responseText = await (await responsePromise).text();
  writeFileSync(`${out}/compile-response.ndjson`, responseText);
  writeFileSync(`${out}/answer.json`, JSON.stringify(answer, null, 2));
  const compiled = responseText.trim().split('\n').map(line => JSON.parse(line)).find(m => m.type === 'result')?.result;
  assert.ok(compiled?.bas_workflow, `Real compile must retain evidence: ${compiled?.bas_workflow_error || compiled?.bas_point_lists?.error}`);
  assert.equal(answer.error, undefined, JSON.stringify(answer));
  const region = page.getByRole('region', { name: 'Grounded point lists', exact: true });
  await region.waitFor({ state: 'visible', timeout: 30000 });
  const downloaded = page.waitForEvent('download');
  await region.getByRole('button', { name: 'Export point evidence', exact: true }).click();
  await (await downloaded).saveAs(`${out}/point-evidence.json`);
  const exported = JSON.parse(readFileSync(`${out}/point-evidence.json`, 'utf8'));
  const record = exported.bas_workflow;
  assert.equal(record.captures.length, 1);
  const capture = record.captures[0];
  assert.equal(capture.points.matrices.length, 12, 'Fort Sam source-backed matrix audit expectation');
  assert.equal(capture.points.matrices.reduce((n, m) => n + m.rows.length, 0), 193);
  const dense = [...capture.points.matrices].sort((a, b) => b.raw.headers.length - a.raw.headers.length)[0];
  await region.getByLabel('Point list', { exact: true }).selectOption(dense.matrix_id);
  const table = region.getByRole('table', { name: 'Original point-list matrix', exact: true });
  assert.equal(await table.locator('thead th').count(), dense.raw.headers.length + 1);
  assert.equal(await table.locator('tbody tr').count(), dense.raw.rows.length);
  await region.getByLabel('Find a point').fill('NO-SUCH-POINT-NEGATIVE-CONTROL');
  assert.ok(await region.getByText('No listed points match this filter. Export still contains every row.').isVisible());
  await region.getByLabel('Find a point').fill('');
  const inspect = region.getByRole('button', { name: /^Inspect point/ }).first();
  await inspect.focus(); await page.keyboard.press('Enter');
  assert.equal(await inspect.getAttribute('aria-pressed'), 'true');
  assert.ok(await region.getByRole('region', { name: 'Selected point interpretation' }).isVisible());
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : width === 1440 ? 900 : 1080 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${out}/${theme}-${width}.png` });
    }
  }
  await region.getByRole('button', { name: 'View matrix on drawing', exact: true }).click();
  await region.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__opentakeoff?.probe?.markups?.().some(m => m.source === 'takeoff_cite'), null, { timeout: 30000 });
  await page.getByText('Rendering sheet…', { exact: true }).waitFor({ state: 'hidden', timeout: 60000 });
  await page.screenshot({ path: `${out}/source.png` });
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await region.waitFor({ state: 'visible' });
  assert.equal(await region.getByLabel('Point list', { exact: true }).inputValue(), dense.matrix_id, 'Source return preserves matrix selection');
  await region.getByRole('region', { name: 'Selected point interpretation' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/selected-point-details.png` });
  // Wait for actual IndexedDB autosave, not a fixed delay or component state.
  await waitForAsync(() => page.evaluate(async id => {
    const { localStore } = await import('/src/lib/store.js');
    return (await localStore.loadAnnotations()).bas_workflow?.current_capture_id === id;
  }, record.current_capture_id), { label: 'actual IndexedDB autosave' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await region.waitFor({ state: 'visible', timeout: 30000 });
  const restoredDownload = page.waitForEvent('download');
  await region.getByRole('button', { name: 'Export point evidence' }).click();
  await (await restoredDownload).saveAs(`${out}/restored-evidence.json`);
  assert.deepEqual(JSON.parse(readFileSync(`${out}/restored-evidence.json`, 'utf8')), exported, 'Reload/export preserves complete capture');
  await page.getByRole('button', { name: 'Close takeoff', exact: true }).click();
  await page.locator('input[name="takeoff-import"]').setInputFiles(`${out}/point-evidence.json`);
  await waitForAsync(() => page.evaluate(async id => {
    const { localStore } = await import('/src/lib/store.js');
    const state = (await localStore.loadAnnotations()).bas_workflow;
    return state?.captures.length === 1 && state.current_capture_id === id;
  }, record.current_capture_id), { label: 'idempotent evidence import save' });
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await region.waitFor({ state: 'visible' });
  // A second, empty browser context proves actual import (not observing a
  // capture that already existed before the import handler ran).
  const importedPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  importedPage.on('pageerror', e => errors.push(String(e)));
  await importedPage.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await importedPage.locator('input[name="sheet-file"]').first().setInputFiles(resolve(process.env.OT_UI_PDF));
  await importedPage.waitForFunction(() => window.__opentakeoff?.graphPrewarm()?.phase === 'ready', null, { timeout: 300000 });
  await openImportedSheet(importedPage);
  assert.equal(await importedPage.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).bas_workflow), undefined);
  await importedPage.locator('input[name="takeoff-import"]').setInputFiles(`${out}/point-evidence.json`);
  await waitForAsync(() => importedPage.evaluate(async id => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).bas_workflow?.current_capture_id === id, record.current_capture_id), { label: 'fresh-context evidence import save' });
  await importedPage.locator('[data-workspace-nav="Takeoff"]').click();
  const importedRegion = importedPage.getByRole('region', { name: 'Grounded point lists', exact: true });
  await importedRegion.waitFor({ state: 'visible' });
  assert.deepEqual(await importedPage.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).bas_workflow), record);
  await importedPage.getByRole('button', { name: 'Close takeoff', exact: true }).click();
  // Controlled byte replacement: a DIFFERENT real sample PDF under the original
  // filename. This is a navigation safety fixture, not a real project addendum.
  const originalName = basename(process.env.OT_UI_PDF);
  await importedPage.locator('input[name="sheet-file"]').first().setInputFiles({ name: originalName, mimeType: 'application/pdf', buffer: readFileSync(new URL('../../demo/sample-plan.pdf', import.meta.url)) });
  await waitForAsync(() => importedPage.evaluate(async ({ name, originalHash }) => {
    const { localStore } = await import('/src/lib/store.js');
    const { sha256Hex } = await import('/src/lib/graphKeys.js');
    return await sha256Hex(await localStore.loadPdfData(name)) !== originalHash;
  }, { name: originalName, originalHash: capture.sources[0].sha256 }), { label: 'controlled source byte replacement' });
  await importedPage.locator('[data-workspace-nav="Takeoff"]').click();
  await importedRegion.waitFor({ state: 'visible' });
  await importedRegion.getByRole('button', { name: 'View matrix on drawing', exact: true }).click();
  await importedRegion.getByRole('alert').filter({ hasText: 'The original PDF version is not loaded' }).waitFor();
  assert.ok(await importedRegion.isVisible(), 'A source mismatch must not navigate or dismiss evidence');
  assert.equal(await importedPage.evaluate(() => window.__opentakeoff.probe.markups().filter(m => m.source === 'takeoff_cite').length), 0);
  await importedPage.screenshot({ path: `${out}/controlled-source-replacement.png` });
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/checks.json`, JSON.stringify({ ok: true, source: process.env.OT_UI_PDF,
    capture_id: record.current_capture_id, matrices: 12, rows: 193,
    checks: ['real production compile', 'full matrix columns/rows', 'negative filter', 'keyboard selection', 'both themes/three widths', 'byte-bound source paint', 'source return selection', 'actual autosave', 'reload/export exact parity', 'real import into an empty browser context', 'controlled same-filename/different-PDF replacement refuses source navigation'], errors }, null, 2));
  console.log('Point matrix UI, source navigation, autosave and reload/export passed');
} catch (error) {
  writeFileSync(`${out}/browser-errors.json`, JSON.stringify(errors, null, 2));
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw error;
} finally { await browser.close(); }
