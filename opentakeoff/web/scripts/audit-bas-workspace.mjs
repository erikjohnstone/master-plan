// SHOULD THIS BE ON THE SHARED PATH? No: read-only UI baseline diagnostics.
// Upload/compile use the real production path. No synthetic BAS response.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';

assert.ok(process.env.OT_UI_PDF, 'OT_UI_PDF is required');
assert.ok(process.env.OT_BAS_OUT, 'OT_BAS_OUT is required');
const out = resolve(process.env.OT_BAS_OUT);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, colorScheme: 'light' });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const observations = [];
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(resolve(process.env.OT_UI_PDF));
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 300000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(page);
  const answer = await page.evaluate(() => window.__opentakeoff.compileCorpusTakeoff('bas_points', { download: false }));
  assert.ok(answer.bas_math?.points?.length > 0, 'Real blueprint must produce point rows');
  const region = page.getByRole('region', { name: 'BAS engineering', exact: true });
  await region.waitFor({ state: 'visible' });
  // OS preference uses the actual theme subscription, not a CSS override.
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const layout = await region.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const table = el.querySelector('table');
        return { region: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          firstTableY: table?.getBoundingClientRect().y ?? null,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth, viewportHeight: innerHeight };
      });
      const screenshot = `${theme}-${viewport.width}.png`;
      await page.screenshot({ path: `${out}/${screenshot}` });
      observations.push({ theme, viewport, layout, screenshot });
    }
  }
  const beforeReload = await page.evaluate(() => window.__opentakeoff.lastCorpusTakeoff());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__opentakeoff?.lastCorpusTakeoff === 'function');
  const afterReload = await page.evaluate(() => window.__opentakeoff.lastCorpusTakeoff());
  writeFileSync(`${out}/observations.json`, JSON.stringify({
    scope: 'Baseline observations, not production acceptance assertions; isolated browser context',
    source: process.env.OT_UI_PDF, physicalTotal: answer.bas_math.physical_total,
    observations, persistedBasResult: !!afterReload?.bas_math,
    hadBasResultBeforeReload: !!beforeReload?.bas_math, errors,
  }, null, 2));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ screenshots: observations.length, persistedBasResult: !!afterReload?.bas_math }));
} finally { await browser.close(); }
