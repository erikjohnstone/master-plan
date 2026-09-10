/** Real PDF/source history and actual reader UI. Same-name replacement, missing
 * vault and delayed read below are explicitly controlled storage faults. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { basProjectReview } from '../src/lib/basProjectReview.ts';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
const [pdf, archive, output] = process.argv.slice(2);
assert.ok(pdf && archive && output); const out = resolve(output); await mkdir(out);
const original = await readFile(pdf), sha = createHash('sha256').update(original).digest('hex');
const workflow = JSON.parse(await readFile(archive, 'utf8')).bas_workflow;
const findings = await basProjectReview(workflow, workflow.current_capture_id);
const issue = findings.issues.find(i => i.code === 'responsibility_unknown' && i.evidence[0]?.bbox_px);
assert.ok(issue); const evidence = issue.evidence[0];
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [], timings = {}, errors = []; let storeUrl;
page.on('pageerror', e => errors.push(String(e)));
page.on('request', req => { if (!storeUrl && new URL(req.url()).pathname === '/src/lib/store.js') storeUrl = req.url(); });
const saved = () => page.evaluate(async () => (await import('/src/lib/store.js')).localStore.loadAnnotations());
const reader = page.getByRole('region', { name: 'Original source reader', exact: true });
const originals = page.getByRole('region', { name: 'Original BAS PDFs', exact: true });
const review = page.getByRole('region', { name: 'Project BAS review', exact: true });
const ready = () => reader.getByRole('status').filter({ hasText: /Original page \d+ ready/ }).waitFor({ timeout: 60000 });
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(page);
  await page.locator('input[name="takeoff-import"]').setInputFiles(archive);
  await waitForAsync(async () => (await saved())?.bas_workflow?.engineering_events?.at(-1)?.event_id === workflow.engineering_events.at(-1).event_id);
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await page.getByRole('button', { name: 'Review & changes', exact: true }).click();
  await page.getByRole('button', { name: 'Original PDFs', exact: true }).click();
  await originals.getByRole('button', { name: 'Retain original', exact: true }).click();
  await originals.getByText('Retained original · bytes verified now', { exact: true }).waitFor();
  const before = await saved();
  let started = performance.now();
  await originals.getByRole('button', { name: 'Open original', exact: true }).click(); await ready();
  timings.original_open_ms = Math.round(performance.now() - started);
  assert.equal(await reader.locator('canvas').count(), 1);
  await reader.getByRole('button', { name: 'Next page', exact: true }).click();
  await reader.getByRole('status').filter({ hasText: 'Original page 2 ready' }).waitFor();
  await reader.getByRole('button', { name: 'Previous page', exact: true }).click();
  await reader.getByRole('status').filter({ hasText: 'Original page 1 ready' }).waitFor();
  await reader.getByRole('button', { name: '← Back to takeoff', exact: true }).click();
  assert.equal(await originals.getByRole('button', { name: 'Open original', exact: true }).evaluate(el => el === document.activeElement), true);
  assert.deepEqual(await saved(), before);
  checks.push('Actual original-reader open, next/previous page, keyboard-focus return; complete saved payload unchanged');

  // Controlled transport setup in this fresh test-only browser profile: replace
  // the current filename with a different valid PDF, then delete its revision
  // trail. The retained original is the only remaining source of the old bytes.
  const replacement = [...await readFile(new URL('../../mcp/test/fixtures/scanned-plan.pdf', import.meta.url))];
  await page.evaluate(async ({ replacement, name }) => {
    const { localStore } = await import('/src/lib/store.js');
    await localStore.removePdf(name);
    await localStore.addPdf(new File([new Uint8Array(replacement)], name, { type: 'application/pdf' }));
  }, { replacement, name: basename(pdf) });
  await page.reload({ waitUntil: 'domcontentloaded' }); await openImportedSheet(page);
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await page.getByRole('button', { name: 'Review & changes', exact: true }).click();
  await review.getByLabel('Find a finding', { exact: true }).fill(issue.title);
  await review.locator(`[data-finding-id="${issue.occurrence_id}"]`).click();
  const detail = review.getByRole('region', { name: 'Selected BAS finding', exact: true });
  const sourceButton = detail.getByRole('button', { name: /View PDF page/ }).first();
  const currentBefore = await saved();
  started = performance.now(); await sourceButton.click(); await ready();
  timings.historical_citation_open_ms = Math.round(performance.now() - started);
  await reader.locator('summary').click();
  assert.ok((await reader.innerText()).includes(evidence.page_id));
  assert.ok((await reader.innerText()).includes(JSON.stringify(evidence.bbox_px)));
  assert.ok((await reader.innerText()).includes('Saved page frame verified'));
  await reader.locator('summary').click();
  assert.equal(await reader.getByLabel('Original PDF page', { exact: true }).inputValue(), evidence.page_id.split(':p').at(-1));
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    await page.setViewportSize({ width, height });
    assert.ok(await reader.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    const rect = await reader.locator('canvas').boundingBox();
    assert.ok(rect && rect.width > 100 && rect.height > 10 && rect.x >= 0 && rect.y + rect.height <= height);
    await page.screenshot({ path: resolve(out, `citation-${theme}-${width}.png`) });
  }
  await reader.getByRole('button', { name: 'Whole page', exact: true }).click(); await ready();
  await page.screenshot({ path: resolve(out, 'historical-whole-page.png') });
  await reader.getByRole('button', { name: 'Focus citation', exact: true }).click(); await ready();
  await reader.getByLabel('Source display size', { exact: true }).selectOption('2');
  const scroll = reader.getByRole('region', { name: 'Scrollable original PDF', exact: true });
  assert.ok(await scroll.evaluate(el => el.scrollWidth > el.clientWidth));
  await reader.getByLabel('Source display size', { exact: true }).selectOption('fit');
  await reader.getByRole('button', { name: '← Back to takeoff', exact: true }).click();
  assert.equal(await sourceButton.evaluate(el => el === document.activeElement), true);
  assert.equal(await review.getByLabel('Find a finding', { exact: true }).inputValue(), issue.title);
  await sourceButton.click(); await ready();
  await reader.getByRole('region', { name: 'Scrollable original PDF', exact: true }).focus();
  await page.keyboard.press('Escape'); await reader.waitFor({ state: 'hidden' });
  assert.equal(await sourceButton.evaluate(el => el === document.activeElement), true);
  assert.deepEqual((await saved()).bas_workflow, workflow);
  assert.deepEqual((await saved()).shapes, currentBefore.shapes); assert.deepEqual((await saved()).markups, currentBefore.markups);
  const actualLoaded = await page.evaluate(async () => {
    const { localStore } = await import('/src/lib/store.js'); const rows = await localStore.listSheets();
    return Promise.all(rows.map(async row => ({ name: row.name, bytes: [...await localStore.loadPdfData(row.name)] })));
  });
  assert.equal(actualLoaded.length, 1); assert.deepEqual(actualLoaded[0].bytes, replacement);
  checks.push('Old citation after controlled same-name replacement opens retained exact version/frame; current PDF, shapes, markups and BAS history untouched; six layouts and zoom reviewed');

  // Delay the actual retained-byte read, cancel the reader, then complete it.
  await page.evaluate(async url => {
    const { store } = await import(url), originalRead = store.loadBasSource;
    window.__sourceReadOriginal = originalRead;
    store.loadBasSource = async (...args) => { window.__sourceReadPending = true; await new Promise(r => { window.__sourceReadRelease = r; }); return originalRead(...args); };
  }, storeUrl);
  await sourceButton.click(); await reader.waitFor();
  await page.waitForFunction(() => window.__sourceReadPending === true);
  await reader.getByRole('button', { name: '← Back to takeoff', exact: true }).click();
  await page.evaluate(async url => { (await import(url)).store.loadBasSource = window.__sourceReadOriginal; window.__sourceReadRelease(); }, storeUrl);
  await detail.waitFor(); assert.equal(await reader.count(), 0);
  checks.push('Controlled pending retained read cancelled by Back never mounts a late reader or loses detail context');

  // Corrupt only this test profile's retained source. A valid newer namesake
  // still must not be substituted or painted with the old citation.
  await page.evaluate(async sha => {
    const { metaGet, metaPut } = await import('/src/lib/store.js');
    const key = ['bas_source_v1', '', `sha256:${sha}`], value = await metaGet(key); new Uint8Array(value.bytes)[0] ^= 1; await metaPut(key, value);
  }, sha);
  await sourceButton.click(); await reader.getByRole('alert').filter({ hasText: 'digest mismatch' }).waitFor();
  assert.equal(await reader.locator('canvas').count(), 0);
  await page.screenshot({ path: resolve(out, 'corrupt-original-refused.png') });
  assert.ok(await reader.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  assert.deepEqual((await saved()).bas_workflow, workflow); assert.deepEqual(errors, []);
  checks.push('Corrupt retained original refuses without rendering a newer namesake or rewriting history');
  const proof = { checks, timings, errors, pdf_sha256: sha, source_citation: evidence, saved_history_unchanged: true };
  await writeFile(resolve(out, 'proof.json'), JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof));
} catch (error) {
  await writeFile(resolve(out, 'failure.json'), JSON.stringify({ error: String(error), stack: error.stack, checks, timings, errors }, null, 2));
  await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {}); throw error;
} finally { await browser.close(); }
