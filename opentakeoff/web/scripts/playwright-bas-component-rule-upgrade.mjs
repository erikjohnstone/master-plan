import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
import { verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
import { basAssemblyCalculationState, basAssemblySummary } from '../src/lib/basAssemblyReview.ts';

assert.ok(process.env.OT_UI_PDF && process.env.OT_BAS_REVIEWED && process.env.OT_BAS_OUT);
const expected = JSON.parse(readFileSync(resolve(process.env.OT_BAS_REVIEWED), 'utf8')).bas_workflow;
assert.ok(expected.assembly_events.length && expected.assembly_calculations.length);
assert.equal(expected.assembly_events.at(-1).register.source_rule_version, 'explicit_component_declarations_1');
const truth = JSON.parse(readFileSync(new URL('../test/fixtures/bas-requirement-source-cases.json', import.meta.url), 'utf8'));
assert.equal(expected.captures[0].sources[0].sha256, truth.source_sha256);
const out = resolve(process.env.OT_BAS_OUT); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], layouts = [], started = performance.now();
page.on('pageerror', e => errors.push(String(e)));
const saved = p => p.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).bas_workflow);
const workspace = p => p.getByRole('region', { name: 'Equipment and template assignments', exact: true });
const assembly = p => p.getByRole('region', { name: 'Assembly and responsibilities', exact: true });
async function upload(p) {
  await p.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await p.locator('input[name="sheet-file"]').first().setInputFiles(resolve(process.env.OT_UI_PDF));
  await p.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
  assert.equal(await p.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(p);
}
async function enter(p) {
  await p.locator('[data-workspace-nav="Takeoff"]').click();
  await p.getByRole('button', { name: 'Equipment', exact: true }).click();
  await workspace(p).getByLabel('Equipment table view').selectOption('register');
  await workspace(p).getByRole('table', { name: 'Equipment table', exact: true }).getByRole('button', { name: 'DOAS-1', exact: true }).click();
  await workspace(p).getByRole('button', { name: 'Assembly & responsibilities', exact: true }).click();
  await assembly(p).waitFor();
}
async function exportRecord(p, name) {
  const download = p.waitForEvent('download');
  await workspace(p).getByRole('button', { name: 'Export evidence & decisions', exact: true }).click();
  await (await download).saveAs(`${out}/${name}.takeoff.json`);
  return JSON.parse(readFileSync(`${out}/${name}.takeoff.json`, 'utf8')).bas_workflow;
}
try {
  await upload(page);
  await page.locator('input[name="takeoff-import"]').setInputFiles(resolve(process.env.OT_BAS_REVIEWED));
  await waitForAsync(async () => (await saved(page))?.assembly_events?.length === expected.assembly_events.length,
    { timeout: 30000, label: 'ordinary v1 review import' });
  assert.deepEqual(await saved(page), expected);
  await enter(page);
  await assembly(page).getByRole('button', { name: 'Review expanded component rules', exact: true }).focus(); await page.keyboard.press('Enter');
  const pending = assembly(page).getByRole('region', { name: 'Pending assembly changes', exact: true });
  await pending.waitFor();
  const candidates = assembly(page).getByRole('region', { name: 'Drawing component declarations', exact: true });
  await candidates.getByLabel('Find declarations').fill('VAV TERMINAL UNIT');
  assert.equal(await candidates.getByRole('row').count(), 5, 'Four declared components, not four new registered devices');
  for (const role of ['terminal equipment control', 'dual technology occupancy', 'downstream static pressure', 'primary modulating supply air']) {
    assert.equal(await candidates.getByRole('rowheader').filter({ hasText: role }).count(), 1);
  }
  assert.deepEqual(await saved(page), expected, 'Staging has not accepted a rule or fabricated applicability');
  const originalWording = candidates.locator('details').first();
  assert.equal(await candidates.locator('details[open]').count(), 0);
  await originalWording.locator('summary').focus(); await page.keyboard.press('Enter');
  await waitForAsync(async () => await originalWording.getAttribute('open') !== null, { timeout: 5000, label: 'keyboard source disclosure' });
  assert.equal(await originalWording.getByRole('button', { name: 'View PDF p.7', exact: true }).count(), 4);
  await candidates.getByRole('button', { name: 'View PDF p.7', exact: true }).nth(1).focus(); await page.keyboard.press('Enter');
  await workspace(page).waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__opentakeoff.probe.markups().some(m => m.source === 'takeoff_cite'));
  await page.getByText('Rendering sheet…', { exact: true }).waitFor({ state: 'hidden', timeout: 60000 });
  await page.screenshot({ path: `${out}/source.png` });
  await page.locator('[data-workspace-nav="Takeoff"]').click(); await pending.waitFor();
  assert.equal(await candidates.getByLabel('Find declarations').inputValue(), 'VAV TERMINAL UNIT');
  assert.notEqual(await originalWording.getAttribute('open'), null, 'Source disclosure survives citation return');
  await originalWording.locator('summary').focus(); await page.keyboard.press('Space');
  await waitForAsync(async () => await originalWording.getAttribute('open') === null, { timeout: 5000, label: 'keyboard source collapse' });
  await pending.getByLabel('Overall assembly change reason').fill('Review expanded explicit-list rules; retain original DOAS assignments and do not assume VAV applicability');
  await pending.getByRole('button', { name: 'Preview all pending assembly changes', exact: true }).focus(); await page.keyboard.press('Enter');
  await pending.getByRole('button', { name: 'Save all assembly changes', exact: true }).focus(); await page.keyboard.press('Enter');
  await waitForAsync(async () => (await saved(page))?.assembly_events?.length === expected.assembly_events.length + 1,
    { timeout: 30000, label: 'explicit rule transition saved' });
  await pending.waitFor({ state: 'hidden' });
  const upgraded = await verifyBasWorkflow(await saved(page));
  assert.deepEqual(upgraded.assembly_events.slice(0, -1), expected.assembly_events);
  assert.deepEqual(upgraded.assembly_events.at(-1).register.components, expected.assembly_events.at(-1).register.components);
  assert.equal(basAssemblyCalculationState(upgraded, upgraded.current_capture_id).status, 'stale_dependencies');
  await assembly(page).getByRole('button', { name: 'Calculate assembly quantities', exact: true }).click();
  await waitForAsync(async () => (await saved(page))?.assembly_calculations?.length === expected.assembly_calculations.length + 1,
    { timeout: 60000, label: 'v2 shared Python result saved' });
  const calculated = await verifyBasWorkflow(await saved(page));
  assert.deepEqual(calculated.captures, expected.captures);
  assert.deepEqual(calculated.equipment_events, expected.equipment_events);
  assert.deepEqual(calculated.assembly_calculations.slice(0, -1), expected.assembly_calculations);
  assert.equal(calculated.assembly_calculations.at(-1).result.source_rule_version, 'explicit_component_declarations_2');
  assert.deepEqual(calculated.assembly_calculations.at(-1).result.components, expected.assembly_calculations.at(-1).result.components);
  assert.equal((await basAssemblySummary(calculated, calculated.current_capture_id)).source_requirements.filter(c => c.component_role).length, 4);
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : width === 1440 ? 900 : 1080 });
      await candidates.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const density = await candidates.getByRole('region', { name: 'Scrollable drawing component declarations', exact: true }).evaluate(el => ({
        height: el.clientHeight, contentHeight: el.scrollHeight, collapsedSources: el.querySelectorAll('details:not([open])').length,
        rows: el.querySelectorAll('tbody tr').length,
      }));
      assert.equal(density.rows, 4); assert.equal(density.collapsedSources, 4);
      assert.ok(density.contentHeight <= density.height + 1, 'All four original components fit without inner vertical scrolling');
      layouts.push({ theme, width, ...density });
      await page.screenshot({ path: `${out}/${theme}-${width}.png` });
    }
  }
  assert.deepEqual(await exportRecord(page, 'upgraded'), calculated);
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.deepEqual(await saved(page), calculated);
  const fresh = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  fresh.on('pageerror', e => errors.push(String(e))); await upload(fresh);
  await fresh.locator('input[name="takeoff-import"]').setInputFiles(`${out}/upgraded.takeoff.json`);
  await waitForAsync(async () => (await saved(fresh))?.assembly_events?.length === calculated.assembly_events.length,
    { timeout: 30000, label: 'fresh v2 import with original history' });
  assert.deepEqual(await saved(fresh), calculated); await enter(fresh);
  assert.equal(await assembly(fresh).getByRole('button', { name: 'Review expanded component rules', exact: true }).count(), 0);
  assert.deepEqual(await exportRecord(fresh, 'reimported'), calculated);
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/checks.json`, JSON.stringify({ ok: true, source_sha256: truth.source_sha256,
    elapsed_ms: Math.round(performance.now() - started), new_candidates: 4, newly_assigned_components: 0, layouts,
    checks: ['original upload/ordinary v1 import', 'explicit keyboard rule review', 'four source roles', 'source paint/return with draft preserved',
      'v1 history exact', 'stale calculation', 'shared Python v2 response', 'both themes/three widths/compact full list', 'keyboard disclosure/state restoration', 'reload/fresh import/export'],
    limits: 'Rule-transition proof, not automatic VAV applicability, installed counts, new VAV equipment registration or full-goal completion.', errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  writeFileSync(`${out}/failure.json`, JSON.stringify({ error: String(error), errors }, null, 2)); throw error;
} finally { await browser.close(); }
