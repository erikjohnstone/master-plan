/** Actual canvas autosave, two editors and export recovery. A controlled atomic
 * IDB replacement supplies the future restore boundary; this does NOT claim
 * an implemented ZIP restoration or an engineering/source interpretation test. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
const [pdf, history, output] = process.argv.slice(2);
assert.ok(pdf && history && output);
const out = resolve(output); await mkdir(out);
const original = await readFile(pdf), sourceSha = createHash('sha256').update(original).digest('hex');
const workflow = JSON.parse(await readFile(history, 'utf8')).bas_workflow;
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const errors = [], checks = [], page = await context.newPage(); let storeUrl;
context.on('page', p => p.on('pageerror', e => errors.push(String(e))));
page.on('pageerror', e => errors.push(String(e)));
page.on('request', req => { if (!storeUrl && new URL(req.url()).pathname === '/src/lib/store.js') storeUrl = req.url(); });
const saved = p => p.evaluate(async () => (await import('/src/lib/store.js')).localStore.loadAnnotations());
const alert = p => p.getByRole('alert', { name: 'Unsaved version conflict', exact: true });
async function report(p) {
  await p.getByTitle('More — guide, appearance, schedule import, project moves', { exact: true }).click();
  await p.getByRole('menuitem', { name: 'Measurement report', exact: true }).click();
  return p.locator('input[name="project-name"]');
}
try {
  const url = process.env.OT_UI_URL || 'http://127.0.0.1:5177';
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(page);
  await page.locator('input[name="takeoff-import"]').setInputFiles(history);
  await waitForAsync(async () => (await saved(page))?.bas_workflow?.engineering_events?.at(-1)?.event_id === workflow.engineering_events.at(-1).event_id);
  await (await report(page)).fill('Saved baseline');
  await waitForAsync(async () => (await saved(page)).project_name === 'Saved baseline');
  const baseline = await saved(page);
  const other = await context.newPage(); await other.goto(url, { waitUntil: 'domcontentloaded' });
  await openImportedSheet(other);
  const otherName = await report(other);
  assert.equal(await otherName.inputValue(), 'Saved baseline');

  // Hold the real autosave AFTER its debounce captured {payload,generation}.
  await page.evaluate(async url => {
    const { store } = await import(url), originalSave = store.saveAnnotations;
    store.saveAnnotations = async (...args) => {
      window.__fencedSavePending = { generation: args[1]?.generation, name: args[0]?.project_name };
      await new Promise(r => { window.__releaseFencedSave = r; });
      return originalSave(...args);
    };
  }, storeUrl);
  await page.locator('input[name="project-name"]').fill('Unsaved primary edit');
  await page.waitForFunction(() => window.__fencedSavePending?.name === 'Unsaved primary edit');
  assert.equal(await page.evaluate(() => window.__fencedSavePending.generation), null);
  await other.evaluate(async () => {
    const { localStore } = await import('/src/lib/store.js');
    const before = await localStore.loadAnnotations();
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('opentakeoff', 4); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    try { await new Promise((resolve, reject) => {
      const t = db.transaction('meta', 'readwrite'), os = t.objectStore('meta');
      os.put({ ...before, project_name: 'Controlled restored state' }, 'annotations');
      os.put('00000000-0000-4000-8000-000000000001', ['annotation_generation_v1', '']);
      t.oncomplete = resolve; t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
    }); } finally { db.close(); }
  });
  await page.evaluate(() => window.__releaseFencedSave());
  await alert(page).waitFor();
  assert.equal((await saved(page)).project_name, 'Controlled restored state');
  assert.equal(await page.locator('input[name="project-name"]').inputValue(), 'Unsaved primary edit');
  checks.push('Actual captured/debounced autosave refused after controlled atomic replacement; editor data preserved');
  await page.getByTitle('Back to the canvas (Esc)', { exact: true }).click();
  const pendingDownload = page.waitForEvent('download');
  await alert(page).getByRole('button', { name: 'Export unsaved takeoff', exact: true }).click();
  const downloaded = await pendingDownload, recovered = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
  assert.equal(recovered.project_name, 'Unsaved primary edit'); assert.deepEqual(recovered.bas_workflow, baseline.bas_workflow);
  assert.equal((await saved(page)).project_name, 'Controlled restored state');
  checks.push('Persistent recovery action exports unsaved editor data and unchanged BAS history without overwriting saved state');

  await otherName.fill('Unsaved second editor'); await alert(other).waitFor();
  assert.equal((await saved(other)).project_name, 'Controlled restored state');
  await other.getByTitle('Back to the canvas (Esc)', { exact: true }).click();
  checks.push('Separate previously loaded browser tab is also fenced; unrelated reads do not upgrade its token');
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    await other.emulateMedia({ colorScheme: theme }); await other.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    await other.setViewportSize({ width, height });
    assert.ok(await alert(other).evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    const rect = await alert(other).boundingBox(); assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height);
    await alert(other).getByRole('button', { name: 'Export unsaved takeoff', exact: true }).focus();
    assert.equal(await alert(other).getByRole('button', { name: 'Export unsaved takeoff', exact: true }).evaluate(el => el === document.activeElement), true);
    await other.screenshot({ path: resolve(out, `conflict-${theme}-${width}.png`), animations: 'disabled' });
  }
  page.on('dialog', d => d.accept());
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    alert(page).getByRole('button', { name: 'Reload saved version', exact: true }).click()]);
  await openImportedSheet(page);
  const freshName = await report(page); assert.equal(await freshName.inputValue(), 'Controlled restored state');
  await freshName.fill('Fresh editor saved'); await waitForAsync(async () => (await saved(page)).project_name === 'Fresh editor saved');
  assert.equal(await alert(page).count(), 0);
  assert.deepEqual((await saved(page)).bas_workflow, baseline.bas_workflow);
  const actualSha = await page.evaluate(async name => {
    const { localStore } = await import('/src/lib/store.js');
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await localStore.loadPdfData(name)))].map(n => n.toString(16).padStart(2, '0')).join('');
  }, basename(pdf));
  assert.equal(actualSha, sourceSha); assert.deepEqual(errors, []);
  checks.push('Explicit reload hydrates the new token; fresh edits persist normally; exact PDF and complete BAS history unchanged');
  await writeFile(resolve(out, 'proof.json'), JSON.stringify({ schema: 'annotation_generation_browser_proof_v1',
    source_sha256: sourceSha, controlled_replacement: true, archive_restore_tested: false, errors, checks }, null, 2));
  console.log(JSON.stringify({ out, checks, errors }));
} finally { await context.close(); await browser.close(); }
