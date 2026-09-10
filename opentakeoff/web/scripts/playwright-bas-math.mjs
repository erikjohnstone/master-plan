// Real imported blueprint → production compile endpoint → shared Python math →
// actual Takeoff panel. No mocked graph, math response, or rendered component.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';

const pdf = process.env.OT_UI_PDF;
assert.ok(pdf, 'OT_UI_PDF must name the real source blueprint');
const out = resolve(process.env.OT_BAS_OUT || '/tmp/ot-bas-math');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined,
  args: process.env.OT_BROWSER_LARGE_HEAP === '1' ? ['--js-flags=--max-old-space-size=8192'] : [] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('crash', () => console.error('Browser page crashed during the real-blueprint walkthrough'));
const options = {
  // Explicit abstract demonstration policy, NOT a blueprint/owner requirement.
  hardware: { profile_id: 'DEMO · rigid 8/4/8/4 + 8 UI', rigid: { AI: 8, AO: 4, DI: 8, DO: 4 }, universal_inputs: 8 },
  spare: { basis: 'demand_addon', numerator: 15, denominator: 100 },
  licenses: [{ pool: 'default', mode: 'packs', base: 0, pack_size: 10 }],
};
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(resolve(pdf));
  console.log('Imported source; waiting for the existing graph pipeline');
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 300000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready', 'Existing graph pipeline must succeed');
  await openImportedSheet(page);
  const answer = await page.evaluate(async (policy) => window.__opentakeoff.compileCorpusTakeoff('bas_points', { download: false, bas_math: policy }), options);
  assert.equal(answer.error, undefined, JSON.stringify(answer.error));
  assert.equal(answer.bas_math?.engine, 'bas_math_v1');
  assert.notEqual(answer.bas_math.status, 'unavailable');
  assert.equal(answer.bas_math.project_complete, false);
  assert.ok(answer.bas_math.points.length > 0, 'Real source must supply typed points');
  const region = page.getByRole('region', { name: 'BAS engineering', exact: true });
  await region.waitFor({ state: 'visible' });
  for (const channel of ['AI', 'AO', 'DI', 'DO']) assert.equal(await region.locator(`[data-bas-total="${channel}"]`).textContent(), String(answer.bas_math.physical_total[channel]));
  writeFileSync(`${out}/result.json`, JSON.stringify({ source: pdf, demonstration_policy: options, answer }, null, 2));
  await page.screenshot({ path: `${out}/01-points.png` });
  console.log('Visible Takeoff totals', answer.bas_math.physical_total);
  const tab = (name) => region.getByRole('tab', { name, exact: true });
  await tab('Points').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await tab('I/O capacity').getAttribute('aria-selected'), 'true');
  assert.ok(await tab('I/O capacity').evaluate((el) => el === document.activeElement));
  await page.screenshot({ path: `${out}/02-capacity.png` });
  await tab('Licenses').click();
  await page.screenshot({ path: `${out}/03-licenses.png` });
  await region.getByRole('tab', { name: /^Issues/ }).click();
  await page.screenshot({ path: `${out}/04-issues.png` });
  await tab('Points').click();
  const downloadEvent = page.waitForEvent('download');
  await region.getByRole('button', { name: 'Export BAS JSON' }).click();
  await (await downloadEvent).saveAs(`${out}/export.json`);
  assert.deepEqual(JSON.parse(readFileSync(`${out}/export.json`, 'utf8')), answer.bas_math,
    'The actual download must preserve the complete canonical math result');
  const firstPoint = answer.bas_math.points[0];
  await region.getByRole('button', { name: 'View source', exact: true }).first().click();
  await region.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__opentakeoff?.probe?.markups?.().some((m) => m.source === 'takeoff_cite'), null, { timeout: 15000 });
  await page.getByText('Rendering sheet…', { exact: true }).waitFor({ state: 'hidden', timeout: 60000 });
  await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
  await page.screenshot({ path: `${out}/05-source.png` });
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await region.waitFor({ state: 'visible' });
  const filter = page.getByPlaceholder('Filter points or schedule rows…');
  await filter.fill('NO-SUCH-POINT-NEGATIVE-CONTROL');
  assert.ok(await region.getByText('No points match this filter. Totals still cover all requirements.').isVisible());
  await filter.fill('');
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/checks.json`, JSON.stringify({ ok: true, endpoint: '/__ot/compile-corpus-takeoff', source: pdf,
    totals: answer.bas_math.physical_total, points: answer.bas_math.points.length, first_point: firstPoint.point_id,
    checks: ['real upload', 'real production compile', 'Python response visible unchanged', 'keyboard tabs', 'JSON export equality', 'source citation paint', 'Takeoff reopen', 'filter negative control'], errors }, null, 2));
} catch (error) {
  try { await page.screenshot({ path: `${out}/failure.png` }); } catch { /* retain the original failure */ }
  throw error;
} finally {
  await browser.close();
}
