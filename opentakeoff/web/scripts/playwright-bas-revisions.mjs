/** Public revision UI over actual imported PDFs and retained real evidence.
 * The second PDF reorders original pages 9,8: controlled, not issued addendum.
 * Read-only persistence/network observations; no injected application results. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
import { verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
const [originalPdf, controlledPdf, baselineJson, output] = process.argv.slice(2);
assert.ok(originalPdf && controlledPdf && baselineJson && output);
const out = resolve(output); await mkdir(out);
const baseline = await verifyBasWorkflow(JSON.parse(await readFile(baselineJson, 'utf8')).bas_workflow);
assert.equal(baseline.drawing_events.length, 2);
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(60000);
const errors = [], checks = [], timings = {}; let storeUrl;
page.on('pageerror', e => errors.push(String(e)));
page.on('request', req => { if (!storeUrl && new URL(req.url()).pathname === '/src/lib/store.js') storeUrl = req.url(); });
const saved = () => page.evaluate(async url => (await import(url)).localStore.loadAnnotations(), storeUrl);
const workspace = page.getByRole('region', { name: 'Requirements and quantities revision', exact: true });
const reader = page.getByRole('region', { name: 'Original source reader', exact: true });
async function enter() {
  if (!await page.getByRole('button', { name: 'Review & changes', exact: true }).isVisible()) await page.locator('[data-workspace-nav="Takeoff"]').click();
  await page.getByRole('button', { name: 'Review & changes', exact: true }).click();
  if (!await workspace.isVisible()) {
    await page.getByRole('button', { name: 'Drawing changes', exact: true }).click();
    await page.getByRole('button', { name: 'Compare requirements & quantities', exact: true }).click();
  }
  await workspace.getByRole('heading', { name: 'Requirements & quantities', exact: true }).waitFor();
}
const replyFor = kind => page.waitForResponse(r => new URL(r.url()).pathname === '/__ot/bas-revision' && r.request().postDataJSON()?.request?.kind === kind);
async function compare(key) {
  const start = performance.now(), pending = replyFor('compare');
  await workspace.getByRole('button', { name: 'Compare requirements and quantities', exact: true }).click();
  const response = await pending; assert.equal(response.status(), 200); const result = await response.json();
  await workspace.getByRole('table', { name: 'Requirements and quantities comparison', exact: true }).waitFor();
  await waitForAsync(() => workspace.getByRole('button', { name: 'Compare requirements and quantities', exact: true }).isEnabled());
  timings[key] = Math.round(performance.now() - start); return result;
}
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  for (const pdf of [originalPdf, controlledPdf]) {
    await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
    await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
    assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
    await openImportedSheet(page);
  }
  await page.locator('input[name="takeoff-import"]').setInputFiles(baselineJson);
  await waitForAsync(async () => (await saved()).bas_workflow?.drawing_events?.length === 2);
  assert.deepEqual((await saved()).bas_workflow, baseline);
  await enter(); await workspace.getByRole('button', { name: 'Start comparison', exact: true }).click();
  await workspace.getByLabel('Comparison name', { exact: true }).fill('Controlled source-page revision comparison');
  await workspace.getByLabel('Reviewer (self-declared)', { exact: true }).fill('Controlled browser reviewer');
  const reason = 'Review retained Fort Sam evidence and a controlled reordering of pages 9,8; partial item correspondence, no approval or installed verification.';
  await workspace.getByLabel('Comparison review reason', { exact: true }).fill(reason);
  // Cancellation while the real transport is pending must leave no journal entry.
  let releaseRequest, intercepted;
  const held = new Promise(resolve => { intercepted = resolve; });
  await page.route('**/__ot/bas-revision', async route => { intercepted(); await new Promise(resolve => { releaseRequest = resolve; }); await route.continue().catch(() => {}); });
  await workspace.getByRole('button', { name: 'Compare requirements and quantities', exact: true }).click(); await held;
  await workspace.getByRole('button', { name: 'Cancel comparison operation', exact: true }).click(); releaseRequest();
  await page.unroute('**/__ot/bas-revision');
  await waitForAsync(() => workspace.getByRole('button', { name: 'Compare requirements and quantities', exact: true }).isEnabled());
  assert.equal((await saved()).bas_workflow.revision_events, undefined);
  const preview = await compare('initial_compare_ui_ms');
  const beforeItems = preview.report.rows.filter(r => r.before && r.before.kind === 'point_row').map(r => r.before);
  const afterItems = preview.report.rows.filter(r => r.after && r.after.kind === 'point_row').map(r => r.after);
  const before = beforeItems.find(b => b.source_scope === 'inside' && beforeItems.filter(i => i.label === b.label).length === 1
    && afterItems.filter(a => a.label === b.label && a.item_id !== b.item_id && a.source_scope === 'inside').length === 1);
  assert.ok(before, 'Real retained comparison contains an independently selectable point row on both versions');
  const after = afterItems.find(a => a.label === before.label && a.item_id !== before.item_id && a.source_scope === 'inside');
  await workspace.getByText(/^Review item correspondence ·/).click();
  await workspace.getByLabel('Pairing item kind', { exact: true }).selectOption('point_row');
  await workspace.getByLabel('Find before item', { exact: true }).fill(before.label);
  await workspace.getByLabel('Find after item', { exact: true }).fill(after.label);
  for (const [side, item] of [['Before', before], ['After', after]]) {
    const choice = workspace.getByRole('group', { name: `${side} item`, exact: true }).locator(`[data-revision-item-id="${item.item_id}"]`);
    assert.equal(await choice.count(), 1); assert.match(await choice.innerText(), /PDF page .*inside source set/);
    await choice.getByRole('radio').check();
  }
  await workspace.getByLabel('Correspondence reason', { exact: true }).fill('Controlled explicit pairing of the same printed point on reordered source pages; not name-based automatic matching.');
  await workspace.getByRole('button', { name: 'Pair selected items', exact: true }).click();
  assert.equal(await workspace.getByRole('button', { name: 'Save comparison review', exact: true }).isEnabled(), false);
  const paired = await compare('paired_compare_ui_ms');
  const row = paired.report.rows.find(r => r.before?.item_id === before.item_id && r.after?.item_id === after.item_id);
  assert.ok(row); assert.equal(row.correspondence, 'explicit_decision');
  await workspace.getByLabel('Item kind', { exact: true }).selectOption('point_row');
  await workspace.getByLabel('Find a compared item', { exact: true }).fill(before.label);
  await workspace.getByRole('table', { name: 'Requirements and quantities comparison', exact: true }).getByRole('row')
    .filter({ hasText: 'explicit decision' }).getByRole('button', { name: before.label, exact: true }).click();
  const detail = workspace.getByRole('region', { name: 'Compared item detail', exact: true });
  assert.ok(await detail.getByRole('heading', { name: before.label, exact: true }).evaluate(el => el === document.activeElement), 'Selecting an item focuses its detail heading');
  await detail.getByRole('button', { name: /^View before PDF page/ }).first().click();
  await reader.getByRole('status').filter({ hasText: /Original page \d+ ready/ }).waitFor();
  await page.screenshot({ path: resolve(out, 'original-source.png') });
  await reader.getByRole('button', { name: '← Back to takeoff', exact: true }).click();
  assert.equal(await workspace.getByLabel('Comparison review reason', { exact: true }).inputValue(), reason);
  assert.equal(await workspace.getByLabel('Find a compared item', { exact: true }).inputValue(), before.label);
  await detail.getByRole('button', { name: /^View after PDF page/ }).first().click();
  await reader.getByRole('status').filter({ hasText: /Original page \d+ ready/ }).waitFor();
  await page.screenshot({ path: resolve(out, 'controlled-source.png') });
  await reader.getByRole('button', { name: '← Back to takeoff', exact: true }).click();
  await detail.scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve(out, 'selected-item-detail.png') });
  await detail.getByRole('button', { name: 'Close item detail', exact: true }).click();
  await workspace.getByLabel('Find a compared item', { exact: true }).fill('');
  assert.ok(await workspace.getByRole('table', { name: 'Requirements and quantities comparison', exact: true }).getByRole('row').count() > 10, 'Dense point-row comparison displayed');
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    await page.setViewportSize({ width, height }); await workspace.getByRole('heading', { name: 'Requirements & quantities', exact: true }).scrollIntoViewIfNeeded();
    assert.ok(await workspace.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'No outer workspace overflow');
    await page.screenshot({ path: resolve(out, `comparison-${theme}-${width}.png`) });
  }
  const started = performance.now(), recording = replyFor('record');
  const save = workspace.getByRole('button', { name: 'Save comparison review', exact: true }); await save.focus(); await page.keyboard.press('Enter');
  assert.equal((await recording).status(), 200);
  await waitForAsync(async () => (await saved()).bas_workflow?.revision_events?.length === 1, { timeout: 60000 });
  timings.record_durable_ui_ms = Math.round(performance.now() - started);
  const final = (await saved()).bas_workflow;
  assert.deepEqual(final.captures, baseline.captures); assert.deepEqual(final.drawing_events, baseline.drawing_events);
  assert.deepEqual(final.engineering_events, baseline.engineering_events);
  assert.equal(final.revision_events[0].approved, false); assert.equal(final.revision_events[0].origin, 'operator_input');
  checks.push('Actual PDF/import, cancelled comparison, explicit pairing, stale preview rejection, original PDF source return preserves draft/filter, keyboard save and durable exact history');
  await page.reload({ waitUntil: 'domcontentloaded' }); await openImportedSheet(page); await enter();
  const reopen = replyFor('read'), reopening = performance.now();
  await workspace.getByRole('button', { name: 'Reopen Controlled source-page revision comparison', exact: true }).click();
  const readReply = await reopen; assert.equal(readReply.status(), 200); const read = await readReply.json();
  assert.equal(read.report_verification, 'matches_saved_report'); assert.deepEqual(read.report, paired.report);
  await workspace.getByRole('button', { name: 'Export complete comparison', exact: true }).waitFor();
  timings.reopen_ui_ms = Math.round(performance.now() - reopening);
  const downloading = page.waitForEvent('download'); await workspace.getByRole('button', { name: 'Export complete comparison', exact: true }).click();
  const comparisonPath = resolve(out, 'comparison.json'); await (await downloading).saveAs(comparisonPath);
  const exported = JSON.parse(await readFile(comparisonPath, 'utf8')); assert.deepEqual(exported.report, paired.report); assert.deepEqual(exported.event, final.revision_events[0]);
  await workspace.getByRole('button', { name: '← Back to page review', exact: true }).click();
  await page.getByRole('button', { name: '← Back to findings', exact: true }).click();
  await page.getByRole('button', { name: 'Equipment', exact: true }).click();
  const evidenceDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export evidence & decisions', exact: true }).click();
  const evidencePath = resolve(out, 'reviewed.takeoff.json'); await (await evidenceDownload).saveAs(evidencePath);
  assert.deepEqual(JSON.parse(await readFile(evidencePath, 'utf8')).bas_workflow, final);
  checks.push('Reload, actual Python report replay, complete comparison and workflow evidence exports retain exact source versions/decisions; six layouts, not issued-addendum proof');
  assert.deepEqual(errors, []);
  for (const key of ['initial_compare_ui_ms', 'paired_compare_ui_ms', 'reopen_ui_ms']) assert.ok(timings[key] <= 8000, `${key} exceeds predeclared 8 s retained-fixture interaction budget`);
  assert.ok(timings.record_durable_ui_ms <= 15000, 'Save through autosave exceeds predeclared 15 s retained-fixture budget');
  await writeFile(resolve(out, 'proof.json'), JSON.stringify({ checks, timings, errors, public_ui: true, real_issued_revision: false,
    controlled_hardware_inputs: true, approved: false, report_rows: paired.report.rows.length,
    explicit_pair: { before_item_id: before.item_id, after_item_id: after.item_id }, event_id: final.revision_events[0].event_id }, null, 2));
  console.log(JSON.stringify({ checks, timings, errors, out }));
} catch (e) { await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {}); await writeFile(resolve(out, 'failure.txt'), `${e.stack}\n${errors.join('\n')}`); throw e; }
finally { await browser.close(); }
