/** Actual UI upload/import, page review, source reader, persistence and export.
 * Incoming PDF is a clearly labeled source-derived 9,8 page-order fixture,
 * compiled by the actual shared pipeline. Not a real issued addendum. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
import { verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
import { replayBasDrawingHistory, compareBasDrawingPages } from '../src/lib/basDrawingRevision.ts';
const [originalPdf, baselineJson, fixtureDir, output] = process.argv.slice(2);
assert.ok(originalPdf && baselineJson && fixtureDir && output);
const out = resolve(output); await mkdir(out);
const baseline = await verifyBasWorkflow(JSON.parse(await readFile(baselineJson, 'utf8')).bas_workflow);
const incoming = await verifyBasWorkflow(JSON.parse(await readFile(resolve(fixtureDir, 'controlled-revision.takeoff.json'), 'utf8')).bas_workflow);
const fixture = JSON.parse(await readFile(resolve(fixtureDir, 'fixture-proof.json'), 'utf8'));
assert.deepEqual(fixture.selected_original_pages, [9, 8]);
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(60000);
const errors = [], checks = [], timings = {}; let storeUrl;
page.on('pageerror', e => errors.push(String(e)));
page.on('request', req => { if (!storeUrl && new URL(req.url()).pathname === '/src/lib/store.js') storeUrl = req.url(); });
const saved = () => page.evaluate(async url => (await import(url)).localStore.loadAnnotations(), storeUrl);
const workspace = page.getByRole('region', { name: 'Drawing changes', exact: true });
const reader = page.getByRole('region', { name: 'Original source reader', exact: true });
async function enter() {
  if (!await page.getByRole('button', { name: 'Review & changes', exact: true }).isVisible()) await page.locator('[data-workspace-nav="Takeoff"]').click();
  await page.getByRole('button', { name: 'Review & changes', exact: true }).click();
  if (!await workspace.isVisible()) await page.getByRole('button', { name: 'Drawing changes', exact: true }).click();
  await workspace.getByRole('button', { name: 'New source set', exact: true }).waitFor();
}
async function record(count) {
  const start = performance.now();
  await workspace.getByRole('button', { name: 'Preview page accounting', exact: true }).click();
  await workspace.getByRole('button', { name: 'Record page accounting', exact: true }).waitFor();
  await waitForAsync(() => workspace.getByRole('button', { name: 'Record page accounting', exact: true }).isEnabled());
  await workspace.getByRole('button', { name: 'Record page accounting', exact: true }).focus(); await page.keyboard.press('Enter');
  await waitForAsync(async () => (await saved()).bas_workflow?.drawing_events?.length === count, { timeout: 60000 });
  await workspace.getByRole('button', { name: 'New source set', exact: true }).waitFor();
  timings[`preview_record_${count}_durable_ms`] = Math.round(performance.now() - start);
}
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(originalPdf);
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready'); await openImportedSheet(page);
  await page.locator('input[name="takeoff-import"]').setInputFiles(baselineJson);
  await waitForAsync(async () => (await saved()).bas_workflow?.engineering_events?.length === baseline.engineering_events.length);
  await enter(); await workspace.getByRole('button', { name: 'New source set', exact: true }).click();
  await workspace.getByLabel('Source-set name', { exact: true }).fill('Baseline nine-page source set');
  await workspace.getByLabel('Reviewer (self-declared)', { exact: true }).fill('Controlled browser reviewer');
  await workspace.getByLabel('Decision reason', { exact: true }).fill('Review the original nine PDF pages; controlled operator decision, not installation proof.');
  const checkboxes = workspace.getByRole('checkbox'); assert.equal(await checkboxes.count(), 9);
  // Selection order is explicit source-set data. Toggle the final page so the
  // declared 1–9 baseline remains in that order when it is selected again.
  await checkboxes.last().uncheck(); assert.match(await workspace.innerText(), /8 selected pages/); await checkboxes.last().check();
  assert.equal((await saved()).bas_workflow.drawing_events, undefined);
  await workspace.getByRole('button', { name: 'Preview page accounting', exact: true }).click();
  await waitForAsync(() => workspace.getByRole('button', { name: 'Record page accounting', exact: true }).isEnabled());
  await workspace.getByLabel('Decision reason', { exact: true }).fill('Reviewed original nine-page source set; no approval claim.');
  assert.equal(await workspace.getByRole('button', { name: 'Record page accounting', exact: true }).isEnabled(), false);
  const draftReason = await workspace.getByLabel('Decision reason', { exact: true }).inputValue();
  await workspace.getByRole('table', { name: 'Drawing page accounting', exact: true }).getByRole('button').first().click();
  await reader.getByRole('status').filter({ hasText: /Original page 1 ready/ }).waitFor();
  await reader.getByRole('button', { name: '← Back to takeoff', exact: true }).click();
  assert.equal(await workspace.getByLabel('Decision reason', { exact: true }).inputValue(), draftReason);
  await record(1);
  const first = (await saved()).bas_workflow;
  assert.deepEqual(first.captures, baseline.captures); assert.deepEqual(first.engineering_events, baseline.engineering_events);
  const initialPages = [...replayBasDrawingHistory(first.captures, first.drawing_events).source_sets.values()][0].pages;
  assert.deepEqual(initialPages.map(p => Number(p.page_id.split(':p').at(-1))), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  checks.push('Initial source selection, draft/source return, preview invalidation and keyboard-recorded durable source set');
  await page.keyboard.press('Escape');
  await page.locator('input[name="sheet-file"]').first().setInputFiles(resolve(fixtureDir, 'controlled-reordered-source-pages.pdf'));
  await waitForAsync(async () => page.evaluate(async url => (await (await import(url)).localStore.listSheets()).some(s => s.name === 'controlled-reordered-source-pages.pdf'), storeUrl));
  await openImportedSheet(page);
  await page.locator('input[name="takeoff-import"]').setInputFiles(resolve(fixtureDir, 'controlled-revision.takeoff.json'));
  await waitForAsync(async () => (await saved()).bas_workflow?.captures.some(c => c.capture_id === incoming.current_capture_id));
  await enter(); await workspace.getByLabel('Evidence capture', { exact: true }).selectOption(incoming.current_capture_id);
  await workspace.getByLabel('Incoming delivery', { exact: true }).selectOption('partial_addendum');
  await workspace.getByRole('button', { name: 'Start revision review', exact: true }).click();
  await workspace.getByLabel('Source-set name', { exact: true }).fill('Controlled reordered pages 9 and 8');
  await workspace.getByLabel('Reviewer (self-declared)', { exact: true }).fill('Controlled browser reviewer');
  await workspace.getByLabel('Decision reason', { exact: true }).fill('Controlled source-derived reordering: incoming page 2 replaces baseline page 8, incoming page 1 replaces baseline page 9. Retain baseline pages 1–7.');
  for (let i = 1; i <= 7; i++) assert.equal(await workspace.getByLabel(`Disposition for baseline page ${i}`, { exact: true }).inputValue(), 'retained');
  const sourceId = incoming.captures[0].sources[0].source_id;
  await workspace.getByLabel('Disposition for baseline page 8', { exact: true }).selectOption('replaced');
  await workspace.getByLabel('Replacement for baseline page 8', { exact: true }).selectOption(`${sourceId}:p2`);
  await workspace.getByLabel('Disposition for baseline page 9', { exact: true }).selectOption('replaced');
  await workspace.getByLabel('Replacement for baseline page 9', { exact: true }).selectOption(`${sourceId}:p1`);
  await workspace.getByRole('button', { name: 'Compare retained evidence', exact: true }).first().click();
  const comparison = workspace.getByRole('region', { name: 'Retained page comparison', exact: true });
  assert.match(await comparison.innerText(), /different original page/); assert.match(await comparison.innerText(), /Not assessed/);
  await comparison.getByRole('button', { name: 'Open incoming original', exact: true }).click();
  await reader.getByRole('status').filter({ hasText: /Original page 2 ready/ }).waitFor();
  await page.screenshot({ path: resolve(out, 'incoming-source.png') });
  await reader.getByRole('button', { name: '← Back to takeoff', exact: true }).click();
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    await page.setViewportSize({ width, height }); await workspace.getByRole('heading', { name: 'Drawing changes', exact: true }).scrollIntoViewIfNeeded();
    assert.ok(await workspace.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Drawing workspace has no horizontal overflow');
    await page.screenshot({ path: resolve(out, `review-${theme}-${width}.png`) });
  }
  await workspace.getByRole('button', { name: 'Preview page accounting', exact: true }).scrollIntoViewIfNeeded();
  await workspace.getByRole('button', { name: 'Preview page accounting', exact: true }).click();
  await waitForAsync(() => workspace.getByRole('button', { name: 'Record page accounting', exact: true }).isEnabled());
  await page.screenshot({ path: resolve(out, 'review-preview.png') });
  await record(2);
  const final = (await saved()).bas_workflow, sets = [...replayBasDrawingHistory(final.captures, final.drawing_events).source_sets.values()];
  assert.equal(sets.length, 2); assert.equal(sets[1].pages.length, 9);
  assert.deepEqual(sets[1].pages.slice(0, 7), sets[0].pages.slice(0, 7));
  assert.deepEqual(sets[1].pages.slice(7).map(p => p.page_id), [`${sourceId}:p2`, `${sourceId}:p1`]);
  assert.deepEqual(final.captures.find(c => c.capture_id === baseline.current_capture_id), baseline.captures[0]);
  assert.deepEqual(final.engineering_events, baseline.engineering_events);
  const equal = compareBasDrawingPages(final.captures, sets[0].pages[7], sets[1].pages[7]);
  assert.equal(equal.retained_text_geometry, 'equal'); assert.equal(equal.quantity_changes, 'not_assessed');
  checks.push('Actual source-derived PDF import, explicit cross-page pairing, partial retention, exact source reader and six layouts');
  await page.reload({ waitUntil: 'domcontentloaded' }); await openImportedSheet(page); await enter();
  await workspace.getByRole('button', { name: 'Controlled reordered pages 9 and 8', exact: true }).click();
  assert.match(await workspace.innerText(), /9 pages in the resulting source set/);
  assert.deepEqual((await saved()).bas_workflow, final);
  await workspace.getByRole('button', { name: '← Back to findings', exact: true }).click();
  await page.getByRole('button', { name: 'Equipment', exact: true }).click();
  const exported = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export evidence & decisions', exact: true }).click();
  const exportPath = resolve(out, 'reviewed.takeoff.json'); await (await exported).saveAs(exportPath);
  assert.deepEqual(JSON.parse(await readFile(exportPath, 'utf8')).bas_workflow, final);
  checks.push('Reload and actual public browser evidence export preserve both correspondence events and all prior data');
  assert.deepEqual(errors, []);
  await writeFile(resolve(out, 'proof.json'), JSON.stringify({ checks, timings, errors, fixture,
    final_source_sets: sets.map(s => ({ id: s.source_set_id, pages: s.pages })), comparison: equal,
    public_ui: true, real_issued_revision: false, approved: false, quantity_delta_proof: false }, null, 2));
  console.log(JSON.stringify({ checks, timings, errors, out }));
} catch (e) { await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {}); await writeFile(resolve(out, 'failure.txt'), `${e.stack}\n${errors.join('\n')}`); throw e; }
finally { await browser.close(); }
