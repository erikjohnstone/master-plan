/** Public browser snapshot journey using a real retained corpus workflow and
 * original PDF. Review declarations are controlled, not independent BAS truth.
 * No Agent results, ready flags, snapshot objects or replay responses injected. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
import { reviewReadyScope } from '../test/helpers/basReadinessFixture.ts';
import { applyBasEquipmentReview } from '../src/lib/basEquipmentReview.ts';

const [pdfPath, retainedPath, output] = process.argv.slice(2);
assert.ok(pdfPath && retainedPath && output, 'Pass original PDF, retained takeoff and fresh output directory');
const pdf = resolve(pdfPath), out = resolve(output); assert.equal(existsSync(out), false); mkdirSync(out, { recursive: true });
const original = readFileSync(pdf), raw = readFileSync(resolve(retainedPath)), payload = JSON.parse(raw);
const originalHash = createHash('sha256').update(original).digest('hex'), workflow = payload.bas_workflow;
assert.equal(originalHash, workflow.captures[0].sources[0].sha256);
// Preserve the source workflow and original unknown decisions. Add exactly the
// same controlled scope declarations as the predeclared core performance probe.
const last = workflow.equipment_events.at(-1), register = structuredClone(last.register);
for (const scope of register.scopes) {
  scope.building ??= 'CONTROLLED TEST BUILDING'; scope.level ??= 'CONTROLLED TEST LEVEL'; scope.phase ??= 'CONTROLLED TEST PHASE';
  scope.source_span_ids = []; scope.reason = 'Controlled test declarations, not extracted project facts';
}
const declared = await applyBasEquipmentReview(workflow, { operation_id: '00000000-0000-4000-8000-000000009998',
  capture_id: last.capture_id, expected_head: last.event_id, register, reason: 'Controlled UI proof; preserve original unknown fields in history' }, 'operator_input');
const specification = workflow.scope_events.filter(e => e.action.kind === 'save_scope').at(-1).action.specification;
const included = specification.included.filter(t => t.claim === 'scheduled_equipment'); assert.equal(included.length, 2);
const prepared = await reviewReadyScope(declared, included, 2000); payload.bas_workflow = prepared.workflow;
const input = resolve(out, 'controlled-input.takeoff.json'); writeFileSync(input, JSON.stringify(payload));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage(); page.setDefaultTimeout(30000);
let storeUrl; const errors = [], timing = {}, checks = [], requests = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('request', req => {
  if (!storeUrl && new URL(req.url()).pathname === '/src/lib/store.js') storeUrl = req.url();
  if (new URL(req.url()).pathname === '/__ot/bas-workflow-replay') requests.push(req.url());
});
const saved = () => page.evaluate(async url => (await import(url)).localStore.loadAnnotations(), storeUrl);
const snapshots = page.getByRole('region', { name: 'BAS snapshots', exact: true });
async function navigate() {
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await page.getByRole('button', { name: 'Review & changes', exact: true }).click();
  await page.getByRole('button', { name: 'Snapshots', exact: true }).click(); await snapshots.waitFor();
}
async function capture(name, target) {
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    await page.setViewportSize({ width, height }); await target.scrollIntoViewIfNeeded();
    const dims = await snapshots.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
    assert.ok(dims.scroll <= dims.client + 1, `${name}: no outer horizontal overflow at ${width}`);
    await page.screenshot({ path: resolve(out, `${name}-${theme}-${width}.png`) });
  }
  await page.emulateMedia({ colorScheme: 'light' }); await page.setViewportSize({ width: 1440, height: 900 });
}
try {
  await page.goto('http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(page); await page.locator('input[name="takeoff-import"]').setInputFiles(input);
  await waitForAsync(async () => (await saved())?.bas_workflow?.scope_events?.at(-1)?.event_id === prepared.workflow.scope_events.at(-1).event_id);
  await navigate();
  await snapshots.getByLabel('Reviewed scope', { exact: true }).selectOption(prepared.scope.event_id);
  let start = performance.now(); await snapshots.getByRole('button', { name: 'Check readiness', exact: true }).focus();
  await page.keyboard.press('Enter');
  await snapshots.getByRole('group', { name: 'Explicit approval of this scope', exact: true }).waitFor({ timeout: 90000 });
  timing.readiness_ms = performance.now() - start;
  const baseline = await saved();
  assert.equal((await page.evaluate(async url => (await import(url)).localStore.listBasSnapshots(), storeUrl)).items.length, 0);
  assert.equal(await snapshots.getByRole('button', { name: 'Approve scope & save snapshot', exact: true }).isEnabled(), false);
  checks.push('Readiness does not approve; explicit reviewer, reason and confirmation required');
  await capture('prepare', snapshots.getByRole('navigation', { name: 'Snapshot sections', exact: true }));
  await snapshots.getByRole('button', { name: 'Inspect claim', exact: true }).first().click();
  const item = snapshots.getByRole('region', { name: 'Retained snapshot item', exact: true }); await item.waitFor();
  await item.getByRole('button', { name: /View original page/ }).first().click();
  const source = page.getByRole('region', { name: 'Original source reader', exact: true });
  await source.getByRole('status').filter({ hasText: /ready.*citation outlined/ }).waitFor({ timeout: 60000 });
  await page.screenshot({ path: resolve(out, 'original-citation.png') });
  await source.getByRole('button', { name: '← Back to takeoff', exact: true }).focus(); await page.keyboard.press('Escape'); await item.waitFor();
  assert.match(await page.evaluate(() => document.activeElement?.textContent), /View original page/);
  checks.push('Exact PDF citation renders in isolated reader; selected claim survives return');
  await snapshots.getByRole('button', { name: '← Back to included claims', exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Inspect claim');
  await snapshots.getByLabel('Reviewer (self-declared)', { exact: true }).fill('CONTROLLED PUBLIC UI TEST');
  await snapshots.getByLabel('Approval reason', { exact: true }).fill('Controlled snapshot transport proof on retained real evidence, not a user-approved production takeoff');
  await snapshots.getByRole('checkbox').check();
  await capture('approval', snapshots.getByRole('group', { name: 'Explicit approval of this scope', exact: true }));
  start = performance.now(); await snapshots.getByRole('button', { name: 'Approve scope & save snapshot', exact: true }).click();
  await snapshots.getByRole('region', { name: 'Verified historical snapshot', exact: true }).waitFor({ timeout: 90000 });
  timing.approve_ms = performance.now() - start;
  const list = await page.evaluate(async url => (await import(url)).localStore.listBasSnapshots(), storeUrl);
  assert.equal(list.items.length, 1); const snapshotId = list.items[0].snapshot_id;
  assert.deepEqual((await saved()).bas_workflow, baseline.bas_workflow);
  assert.deepEqual((await saved()).shapes, baseline.shapes);
  checks.push('Actual button saves separate snapshot without replacing BAS evidence or measurements');
  await capture('historical', snapshots.getByRole('region', { name: 'Verified historical snapshot', exact: true }));
  await snapshots.getByRole('button', { name: /^Findings \(/ }).click();
  assert.ok((await snapshots.getByRole('region', { name: 'snapshot findings', exact: true }).innerText()).length > 0);
  await capture('findings', snapshots.getByRole('navigation', { name: 'Snapshot sections', exact: true }));
  start = performance.now(); const download = page.waitForEvent('download');
  await snapshots.getByRole('button', { name: 'Download snapshot evidence ZIP', exact: true }).click();
  const zip = await download, zipPath = resolve(out, zip.suggestedFilename()); await zip.saveAs(zipPath); timing.export_ms = performance.now() - start;
  await page.reload(); await page.getByRole('button', { name: 'Open', exact: true }).waitFor(); await openImportedSheet(page);
  await navigate(); await snapshots.getByRole('button', { name: 'Saved snapshots', exact: true }).click();
  start = performance.now(); await snapshots.getByRole('button', { name: 'Open snapshot', exact: true }).click();
  await snapshots.getByRole('region', { name: 'Verified historical snapshot', exact: true }).waitFor({ timeout: 90000 }); timing.reopen_ms = performance.now() - start;
  checks.push('Reload and actual Open snapshot reverify original bytes and shared Python');
  await snapshots.locator('input[name="bas-snapshot-import"]').setInputFiles(zipPath);
  await snapshots.getByRole('status').filter({ hasText: 'Historical snapshot imported and verified' }).waitFor({ timeout: 90000 });
  assert.equal((await page.evaluate(async url => (await import(url)).localStore.listBasSnapshots(), storeUrl)).items.length, 1);
  checks.push('Exported snapshot imports idempotently through public UI; no duplicate approval');
  assert.ok(requests.length >= 5, 'Actual Python endpoint used for readiness, approval, export, reopen, import');
  // A fresh profile has no current workflow, annotations, PDFs or test injections.
  // Historical import must still be reachable without restoring working state.
  const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const empty = await fresh.newPage(); let freshStoreUrl;
    empty.on('request', req => { if (!freshStoreUrl && new URL(req.url()).pathname === '/src/lib/store.js') freshStoreUrl = req.url(); });
    empty.on('pageerror', e => errors.push(String(e)));
    await empty.goto('http://127.0.0.1:5177');
    const initial = await empty.evaluate(async url => ({ annotations: await (await import(url)).localStore.loadAnnotations(),
      sheets: await (await import(url)).localStore.listSheets() }), freshStoreUrl);
    await empty.getByRole('button', { name: 'Restore BAS evidence backup', exact: true }).click();
    await empty.getByRole('button', { name: 'Snapshots', exact: true }).click();
    const history = empty.getByRole('region', { name: 'BAS snapshots', exact: true });
    await history.locator('input[name="bas-snapshot-import"]').setInputFiles(zipPath);
    await history.getByRole('status').filter({ hasText: 'Historical snapshot imported and verified' }).waitFor({ timeout: 90000 });
    const after = await empty.evaluate(async url => ({ annotations: await (await import(url)).localStore.loadAnnotations(),
      sheets: await (await import(url)).localStore.listSheets(), snapshots: await (await import(url)).localStore.listBasSnapshots() }), freshStoreUrl);
    assert.deepEqual(after.annotations, initial.annotations); assert.deepEqual(after.sheets, initial.sheets);
    assert.equal(after.snapshots.items[0].snapshot_id, snapshotId);
    await history.getByRole('button', { name: /^Original PDFs \(/ }).click(); await history.getByRole('button', { name: 'Read original PDF', exact: true }).click();
    await empty.getByRole('region', { name: 'Original source reader', exact: true }).getByRole('status').filter({ hasText: /Original page 1 ready/ }).waitFor({ timeout: 60000 });
    await empty.screenshot({ path: resolve(out, 'empty-project-original.png') });
    checks.push('Fresh empty browser imports and renders original without replacing annotations or adding active counting sheets');
  } finally { await fresh.close(); }
  assert.deepEqual(errors, []);
  writeFileSync(resolve(out, 'proof.json'), JSON.stringify({ proof: 'public_browser_bas_snapshots', controlled_reviews: true,
    fresh_extraction_accuracy_claim: false, original_sha256: originalHash, retained_input_sha256: createHash('sha256').update(raw).digest('hex'),
    snapshot_id: snapshotId, browser: browser.version(), timing, checks, actual_python_requests: requests.length, errors }, null, 2));
  console.log(JSON.stringify({ out, snapshot_id: snapshotId, timing, checks: checks.length, actual_python_requests: requests.length }));
} catch (error) {
  writeFileSync(resolve(out, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack, checks, timing, errors,
    body: await page.locator('body').innerText().catch(() => '') }, null, 2));
  await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {}); throw error;
} finally { await context.close(); await browser.close(); }
