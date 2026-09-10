/** Real PDF, ordinary import, actual inspection service and browser download.
 * Controlled saved counterparts are disclosed. Fault injection delays delivery
 * only; it never fabricates outcomes or mutates saved engineering evidence. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
import { verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
import { basEngineeringWorkbook } from '../src/lib/basEngineeringExport.ts';
import { inspectBasEngineering } from '../../mcp/src/basEngineeringReview.ts';
import { buildXlsx } from '../src/lib/xlsx.js';
import { assertProofEqual as same } from '../../mcp/scripts/helpers/proofEquality.ts';

const [pdfPath, reviewedPath, withdrawnPath, outputPath] = process.argv.slice(2);
assert.ok(pdfPath && reviewedPath && withdrawnPath && outputPath, 'Original PDF, reviewed JSON, controlled withdrawal JSON, new output directory required');
const pdf = resolve(pdfPath), imported = resolve(reviewedPath), out = resolve(outputPath);
assert.equal(existsSync(out), false); mkdirSync(out, { recursive: true });
const baseline = await verifyBasWorkflow(JSON.parse(readFileSync(imported, 'utf8')).bas_workflow);
const withdrawn = await verifyBasWorkflow(JSON.parse(readFileSync(resolve(withdrawnPath), 'utf8')).bas_workflow);
const sha = createHash('sha256').update(readFileSync(pdf)).digest('hex');
assert.ok(baseline.captures.some(c => c.sources.some(s => s.sha256 === sha)));
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], checks = [], downloads = [], start = performance.now();
page.on('pageerror', e => errors.push(String(e))); page.on('download', d => downloads.push(d));
const saved = () => page.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).bas_workflow);
const engineering = page.getByRole('region', { name: 'Engineering compatibility', exact: true });
const changes = engineering.getByRole('region', { name: 'Engineering changes', exact: true });
const workspace = page.getByRole('region', { name: 'Equipment and template assignments', exact: true });
async function hold() {
  await page.evaluate(() => {
    const original = window.fetch, gate = { held: false, ok: false, release: null, restore: () => { window.fetch = original; } };
    window.__engineeringExportGate = gate;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (!url?.includes('/__ot/bas-engineering')) return original(input, init);
      const response = await original(input, { ...init, signal: undefined }); gate.ok = response.ok;
      await new Promise(release => { gate.release = release; gate.held = true; }); return response;
    };
  });
}
async function startExport() { await engineering.getByRole('button', { name: 'Export saved engineering XLSX', exact: true }).click(); }
async function held() { await page.waitForFunction(() => window.__engineeringExportGate?.held, null, { timeout: 60000 }); assert.equal(await page.evaluate(() => window.__engineeringExportGate.ok), true); }
async function release() { await page.evaluate(() => { window.__engineeringExportGate.restore(); window.__engineeringExportGate.release(); }); await engineering.getByRole('button', { name: 'Cancel operation', exact: true }).waitFor({ state: 'hidden' }); }
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(page);
  await page.locator('input[name="takeoff-import"]').setInputFiles(imported);
  await waitForAsync(async () => (await saved())?.engineering_events?.length === baseline.engineering_events.length, { timeout: 30000 });
  same(await saved(), baseline, 'Imported history');
  await page.locator('[data-workspace-nav="Takeoff"]').click(); await page.getByRole('button', { name: 'Equipment', exact: true }).click();
  await workspace.getByRole('button', { name: 'Review saved engineering', exact: true }).click();
  await engineering.getByRole('button', { name: 'Edit check', exact: true }).click();
  const draft = 'Unsaved export test draft. Do not include in the saved workbook.';
  await changes.getByLabel('Check decision reason', { exact: true }).fill(draft);
  await hold(); await startExport(); await held();
  await engineering.getByRole('button', { name: 'Cancel operation', exact: true }).click(); await release();
  assert.equal(downloads.length, 0); same(await saved(), baseline, 'Cancelled export preserves saved history');
  assert.equal(await changes.getByLabel('Check decision reason', { exact: true }).inputValue(), draft);
  checks.push('Cancelled actual replay response produces no download and preserves draft/history');
  const download = page.waitForEvent('download'); await startExport();
  await (await download).saveAs(resolve(out, 'engineering-review.xlsx'));
  await engineering.getByRole('button', { name: 'Cancel operation', exact: true }).waitFor({ state: 'hidden' });
  const files = unzipSync(readFileSync(resolve(out, 'engineering-review.xlsx')));
  const book = await basEngineeringWorkbook(baseline, await inspectBasEngineering(baseline, baseline.current_capture_id));
  const expected = unzipSync(await buildXlsx(book.sheets));
  same(Object.keys(files), Object.keys(expected), 'Workbook parts');
  for (const key of Object.keys(files)) { assert.equal(strFromU8(files[key]), strFromU8(expected[key]), key); assert.ok(!strFromU8(files[key]).includes(draft)); }
  same(await saved(), baseline, 'Read-only export');
  assert.equal(await changes.getByLabel('Check decision reason', { exact: true }).inputValue(), draft);
  checks.push('Browser workbook matches shared/MCP projection exactly, excludes draft, preserves original history');
  writeFileSync(resolve(out, 'projection.json'), JSON.stringify(book));
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    await page.setViewportSize({ width: 1280, height: 900 });
    await engineering.getByRole('heading', { name: 'Engineering', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(out, `${theme}-1280.png`) });
  }
  await hold(); await startExport(); await held();
  await page.locator('input[name="takeoff-import"]').setInputFiles(resolve(withdrawnPath));
  await waitForAsync(async () => (await saved())?.equipment_events?.at(-1)?.event_id === withdrawn.equipment_events.at(-1).event_id, { timeout: 30000 });
  await release(); assert.equal(downloads.length, 1); same(await saved(), withdrawn, 'Late export cannot overwrite newer import');
  // Ordinary import resets detail selection to the equipment table, retaining
  // the open Takeoff dialog. Reenter its saved review through the visible UI.
  await workspace.getByRole('button', { name: 'Review saved engineering', exact: true }).click();
  assert.match(await engineering.innerText(), /changed|stale/i);
  checks.push('Newer ordinary import rejects delayed replay; no stale workbook download');
  assert.equal(errors.length, 0);
  const result = { pdf_sha256: sha, workflow_sha256: book.workflow_sha256, checks, page_errors: errors, duration_ms: Math.round(performance.now() - start) };
  writeFileSync(resolve(out, 'checks.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} catch (error) {
  writeFileSync(resolve(out, 'failure.json'), JSON.stringify({ error: String(error), stack: error.stack, checks, page_errors: errors }, null, 2));
  await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {}); throw error;
} finally { await browser.close(); }
