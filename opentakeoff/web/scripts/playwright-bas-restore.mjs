/** Actual real-PDF backup, fresh-context restore and exact archived source view.
 * The retained history includes controlled, declared hardware; it is not proof
 * that hardware ratings were automatically inferred from the drawing. */
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
const [pdf, history, output] = process.argv.slice(2);
assert.ok(pdf && history && output);
const out = resolve(output); await mkdir(out);
const bytes = await readFile(pdf), sha = createHash('sha256').update(bytes).digest('hex');
const baseline = JSON.parse(await readFile(history, 'utf8')).bas_workflow;
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const url = process.env.OT_UI_URL || 'http://127.0.0.1:5177';
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const errors = [], checks = [], timings = {};
let page = await context.newPage(); page.on('pageerror', e => errors.push(String(e)));
const saved = p => p.evaluate(async () => (await import('/src/lib/store.js')).localStore.loadAnnotations());
async function originals(p, hasHistory) {
  const recovery = p.getByRole('button', { name: 'Restore BAS evidence backup', exact: true });
  if (!hasHistory) { await recovery.waitFor(); await recovery.click(); return; }
  if (await recovery.isVisible()) { await recovery.click(); return; }
  await p.locator('[data-workspace-nav="Takeoff"]').click();
  await p.getByRole('button', { name: 'Review & changes', exact: true }).click();
  if (hasHistory) await p.getByRole('button', { name: 'Original PDFs', exact: true }).click();
}
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(page);
  await page.locator('input[name="takeoff-import"]').setInputFiles(history);
  await waitForAsync(async () => (await saved(page))?.bas_workflow?.engineering_events?.at(-1)?.event_id === baseline.engineering_events.at(-1).event_id);
  await originals(page, true);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download evidence bundle', exact: true }).click();
  const archive = resolve(out, 'real-pdf-backup.otbas.zip'); await (await pending).saveAs(archive);
  checks.push('Real PDF loaded/indexed and retained BAS history exported by actual UI');
  const target = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await target.newPage(); page.on('pageerror', e => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await originals(page, false);
  const before = await saved(page);
  await page.locator('input[name="bas-evidence-bundle"]').setInputFiles(archive);
  const backup = page.getByRole('region', { name: 'Portable evidence backup', exact: true });
  await backup.getByRole('status').filter({ hasText: 'Nothing was restored' }).waitFor();
  await backup.getByRole('button', { name: 'Preview restore', exact: true }).click();
  await page.getByRole('region', { name: 'Evidence restore preview', exact: true }).waitFor();
  assert.deepEqual(await saved(page), before);
  await page.screenshot({ path: resolve(out, 'restore-preview.png'), animations: 'disabled' });
  await backup.getByRole('button', { name: 'Discard preview', exact: true }).click();
  assert.deepEqual(await saved(page), before);
  checks.push('Fresh empty project can verify and preview the backup; discard changes nothing');
  await backup.getByRole('button', { name: 'Preview restore', exact: true }).click();
  let release, intercepted = false;
  await page.route('**/__ot/bas-workflow-replay', async route => {
    intercepted = true; await new Promise(resolve => { release = resolve; }); await route.continue().catch(() => {});
  });
  await page.getByRole('button', { name: 'Restore reviewed merge', exact: true }).click();
  await waitForAsync(() => intercepted);
  await backup.getByRole('button', { name: 'Cancel backup operation', exact: true }).click();
  await backup.getByRole('alert').filter({ hasText: 'Restore cancelled' }).waitFor();
  release(); await page.unroute('**/__ot/bas-workflow-replay');
  assert.deepEqual(await saved(page), before);
  checks.push('Controlled delayed HTTP request cancelled through actual restore UI; saved state remains unchanged');
  const started = performance.now();
  const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === '/__ot/bas-workflow-replay');
  await page.getByRole('button', { name: 'Restore reviewed merge', exact: true }).click();
  const response = await responsePromise; assert.equal(response.status(), 200);
  const replay = await response.json();
  assert.equal(replay.checked_records.assembly.length, 3); assert.equal(replay.checked_records.engineering.length, 28);
  await page.getByRole('status').filter({ hasText: 'Evidence backup restored.' }).waitFor({ timeout: 60000 });
  timings.restore_ms = Math.round(performance.now() - started);
  const restored = await saved(page); assert.deepEqual(restored.bas_workflow, baseline);
  const verification = await page.evaluate(async sourceId => {
    const { localStore } = await import('/src/lib/store.js');
    const { annotationGeneration } = await import('/src/lib/annotationGeneration.js');
    const data = await localStore.loadAnnotations(), token = annotationGeneration(data);
    const source = data.bas_workflow.captures[0].sources.find(s => s.source_id === sourceId);
    const { names, ...identity } = source;
    const original = await localStore.loadBasSource(identity);
    const digest = await crypto.subtle.digest('SHA-256', original);
    return { token, journal: await localStore.loadBasRestoreJournal(token), active: await localStore.listSheets(),
      sha: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') };
  }, `sha256:${sha}`);
  assert.equal(verification.sha, sha); assert.deepEqual(verification.active, []);
  assert.deepEqual(verification.journal.previous_payload, before); assert.equal(verification.journal.approved, false);
  checks.push('Actual HTTP/Python replays all 31 retained calculations; atomic restore preserves exact history, source bytes and previous-state journal');
  checks.push('Restored originals stay out of active counting sheets; generation fences older editors');
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    await page.setViewportSize({ width, height });
    const region = page.getByRole('region', { name: 'Original BAS PDFs', exact: true });
    assert.ok(await region.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await page.screenshot({ path: resolve(out, `restored-${theme}-${width}.png`), animations: 'disabled' });
  }
  await page.getByRole('button', { name: 'Open original', exact: true }).click();
  await page.getByRole('region', { name: 'Original source reader', exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole('status').filter({ hasText: 'Original page 1 ready' }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: resolve(out, 'restored-original.png'), animations: 'disabled' });
  assert.deepEqual(await saved(page), restored);
  checks.push('Actual Open original action resolves the restored PDF without loading it into the active plan set');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Restore BAS evidence backup', exact: true }).or(page.locator('[data-workspace-nav="Takeoff"]')).first().waitFor();
  await originals(page, true);
  await page.getByRole('button', { name: 'Verify retained copy', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Retained original · bytes verified now' }).waitFor();
  assert.deepEqual((await saved(page)).bas_workflow, baseline);
  checks.push('Reload preserves history and exact retained originals');
  assert.deepEqual(errors, []);
  await writeFile(resolve(out, 'proof.json'), JSON.stringify({ checks, timings, errors, source_sha256: sha, replay,
    operation_id: verification.token, limitations: ['Original is a real PDF; some retained hardware inputs are controlled operator declarations.', 'Browser-local restore only in this proof; not MCP/sync or complete workflow E acceptance.'] }, null, 2));
  process.stdout.write(JSON.stringify({ checks, timings, errors, out }) + '\n');
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure.png'), animations: 'disabled' });
  await writeFile(resolve(out, 'failure.txt'), String(error) + '\n' + await page.locator('body').innerText());
  throw error;
} finally { await browser.close(); }
