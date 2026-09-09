// Actual PDF upload plus ordinary import of a previously exported real workflow.
// This is presentation QA, not a new extraction/quantity or full accessibility proof.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';

assert.ok(process.env.OT_UI_PDF && process.env.OT_BAS_REVIEWED && process.env.OT_BAS_OUT);
const expected = JSON.parse(readFileSync(resolve(process.env.OT_BAS_REVIEWED), 'utf8')).bas_workflow;
assert.ok(expected.assignment_calculations?.length > 0, 'Use a real previously verified exported calculation');
const out = resolve(process.env.OT_BAS_OUT); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], readings = [];
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(resolve(process.env.OT_UI_PDF));
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(page);
  await page.locator('input[name="takeoff-import"]').setInputFiles(resolve(process.env.OT_BAS_REVIEWED));
  const saved = () => page.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).bas_workflow);
  await waitForAsync(async () => (await saved())?.assignment_calculations?.length === expected.assignment_calculations.length,
    { timeout: 30000, label: 'real exported calculation imported' });
  assert.deepEqual(await saved(), expected);
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await page.getByRole('button', { name: 'Equipment', exact: true }).click();
  const workspace = page.getByRole('region', { name: 'Equipment and template assignments', exact: true });
  await workspace.getByLabel('Equipment table view').selectOption('register');
  await workspace.getByRole('table', { name: 'Equipment table', exact: true }).getByRole('button', { name: 'CH-1', exact: true }).click();
  const reader = workspace.locator('details[aria-label="Assigned listed values"]');
  if (!(await reader.evaluate(element => element.open))) await reader.locator(':scope > summary').click();
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    for (const width of [1280, 1920]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 1080 });
      await reader.getByRole('table', { name: 'Assigned value derivation' }).scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const measurements = await reader.evaluate(element => {
        const rgba = color => {
          const match = /^rgba?\(([^)]+)\)$/.exec(color);
          if (!match) throw new Error(`Unsupported computed color: ${color}`);
          const components = match[1].split(',').map(Number);
          return [...components.slice(0, 3), components[3] ?? 1];
        };
        const luminance = color => color.slice(0, 3).map(c => c / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
          .reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0);
        const background = element => {
          if (!element) throw new Error('No opaque background found');
          const style = getComputedStyle(element);
          if (Number(style.opacity) !== 1) throw new Error('Opacity needs separate contrast accounting');
          const color = rgba(style.backgroundColor);
          if (color[3] === 1) return color;
          const parent = background(element.parentElement);
          return [...color.slice(0, 3).map((value, i) => value * color[3] + parent[i] * (1 - color[3])), 1];
        };
        return [...element.querySelectorAll(':scope > summary, :scope > p, th, td, td small, td button')].filter(node => node.innerText.trim()).map(node => {
          const fg = rgba(getComputedStyle(node).color), bg = background(node);
          if (fg[3] !== 1) throw new Error('Nonopaque text needs separate contrast accounting');
          const a = luminance(fg), b = luminance(bg);
          return { element: node.tagName, text: node.innerText.slice(0, 90), ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
        });
      });
      assert.ok(measurements.length > 20);
      const result = { theme, width, measured: measurements.length, minimum_ratio: Math.min(...measurements.map(m => m.ratio)), failures: measurements.filter(m => m.ratio < 4.5) };
      readings.push(result);
      writeFileSync(`${out}/contrast.json`, JSON.stringify(readings, null, 2));
      await page.screenshot({ path: `${out}/${theme}-${width}.png` });
      assert.equal(result.failures.length, 0, `${theme}/${width}: normal text needs at least 4.5:1 without rounding`);
    }
  }
  assert.deepEqual(await saved(), expected, 'Reader presentation never changes evidence or calculation');
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/checks.json`, JSON.stringify({ ok: true, restored_calculations: expected.assignment_calculations.length,
    checks: ['actual PDF upload', 'ordinary real-workflow import', 'source/result exact preservation', 'both themes/two widths', 'normal text contrast at least 4.5:1', 'no page overflow'], readings, errors }, null, 2));
} finally { await browser.close(); }
