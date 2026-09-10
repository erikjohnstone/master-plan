/** Actual folder composite + real evidence ZIP + actual Python replay. OPFS and
 * a held cross-tab lease are controlled transport/race fixtures, not live cloud. */
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
const [archive, history, output] = process.argv.slice(2);
assert.ok(archive && history && output);
const out = resolve(output); await mkdir(out);
const baseline = JSON.parse(await readFile(history, 'utf8')).bas_workflow;
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage(), errors = [], checks = [], timings = {};
const url = process.env.OT_UI_URL || 'http://127.0.0.1:5177';
let storeUrl;
page.on('request', r => { if (!storeUrl && new URL(r.url()).pathname === '/src/lib/store.js') storeUrl = r.url(); });
page.on('pageerror', e => errors.push(String(e)));
const saved = () => page.evaluate(async () => (await import(window.__proofStoreUrl)).store.loadAnnotations());
const backup = () => page.getByRole('region', { name: 'Portable evidence backup', exact: true });
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async moduleUrl => {
    const { localStore, metaPut } = await import(moduleUrl);
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('bas-sync-restore-proof', { create: true });
    if (await dir.queryPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('OPFS permission unavailable');
    const sidecar = await dir.getDirectoryHandle('.opentakeoff', { create: true });
    const writer = await (await sidecar.getFileHandle('annotations.json', { create: true })).createWritable();
    const data = await localStore.loadAnnotations(); await writer.write(JSON.stringify({ ...data, rev: 1 })); await writer.close();
    await metaPut('fsync:handle', dir); await metaPut('fsync:scope', 'controlled-bas-restore');
    await metaPut('sync:controlled-bas-restore:touched', true); await metaPut('sync:controlled-bas-restore:synced_rev', 1);
    await metaPut('sync:controlled-bas-restore:synced_base', { rev: 1, data });
  }, storeUrl);
  storeUrl = null; await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(moduleUrl => { window.__proofStoreUrl = moduleUrl; }, storeUrl);
  await waitForAsync(() => page.evaluate(async () => !!(await import(window.__proofStoreUrl)).store.syncBridge));
  await page.evaluate(async () => (await import(window.__proofStoreUrl)).store.syncBridge.whenSynced());
  await page.getByRole('button', { name: 'Restore BAS evidence backup', exact: true }).click();
  await page.locator('input[name="bas-evidence-bundle"]').setInputFiles(archive);
  await backup().getByRole('status').filter({ hasText: 'Nothing was restored' }).waitFor();
  await backup().getByRole('button', { name: 'Preview restore', exact: true }).click();
  await page.getByRole('region', { name: 'Evidence restore preview', exact: true }).waitFor();
  const before = await saved(), other = await context.newPage();
  other.on('pageerror', e => errors.push(String(e)));
  await other.goto(url, { waitUntil: 'domcontentloaded' });
  async function hold() {
    await other.evaluate(moduleUrl => {
      window.__entered = false;
      window.__held = import(moduleUrl).then(m => m.localStore.withAnnotationSync(async () => {
        window.__entered = true; await new Promise(r => { window.__release = r; });
      }));
    }, storeUrl);
    await other.waitForFunction(() => window.__entered);
  }
  async function queued() {
    await waitForAsync(() => page.evaluate(async () => (await navigator.locks.query()).pending.some(l => l.name === 'opentakeoff:annotations:""')));
  }
  await hold();
  let response = page.waitForResponse(r => new URL(r.url()).pathname === '/__ot/bas-workflow-replay');
  await page.getByRole('button', { name: 'Restore reviewed merge', exact: true }).click();
  assert.equal((await response).status(), 200); await queued();
  assert.deepEqual(await saved(), before);
  await page.screenshot({ path: resolve(out, 'waiting-for-other-tab.png'), animations: 'disabled' });
  await backup().getByRole('button', { name: 'Cancel backup operation', exact: true }).click();
  await backup().getByRole('alert').filter({ hasText: 'Restore cancelled' }).waitFor();
  assert.deepEqual(await saved(), before);
  await other.evaluate(() => window.__release()); await other.evaluate(() => window.__held);
  checks.push('Actual second-tab canonical lease delays restore after real Python replay; visible Cancel leaves canonical annotations unchanged');
  await hold(); const started = performance.now();
  response = page.waitForResponse(r => new URL(r.url()).pathname === '/__ot/bas-workflow-replay');
  await page.getByRole('button', { name: 'Restore reviewed merge', exact: true }).click();
  const replayResponse = await response; assert.equal(replayResponse.status(), 200);
  const replay = await replayResponse.json();
  assert.equal(replay.checked_records.assembly.length, 3); assert.equal(replay.checked_records.engineering.length, 28);
  await queued(); assert.deepEqual(await saved(), before);
  await other.evaluate(() => window.__release()); await other.evaluate(() => window.__held);
  await page.getByRole('status').filter({ hasText: 'Evidence backup restored.' }).waitFor({ timeout: 60000 });
  timings.local_restore_including_replay_and_held_lease_ms = Math.round(performance.now() - started);
  await page.evaluate(async () => (await import(window.__proofStoreUrl)).store.syncBridge.whenPushed());
  timings.with_sync_ms = Math.round(performance.now() - started);
  const restored = await saved(); assert.deepEqual(restored.bas_workflow, baseline);
  const proof = await page.evaluate(async () => {
    const { store, metaGet } = await import(window.__proofStoreUrl);
    const state = await store.syncBridge.readRestoreSyncStatus(), saved = await store.loadAnnotations();
    const dir = await metaGet('fsync:handle'), sidecar = await dir.getDirectoryHandle('.opentakeoff');
    const remote = JSON.parse(await (await (await sidecar.getFileHandle('annotations.json')).getFile()).text());
    const source = saved.bas_workflow.captures[0].sources[0], { names, ...identity } = source;
    const bytes = await store.loadBasSource(identity);
    return { state, remote, source_sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join(''),
      expected_sha256: source.sha256, active_sheets: await store.listSheets(), journal: await store.loadBasRestoreJournal(state.generation) };
  });
  assert.equal(proof.state.pending, false); assert.equal(proof.source_sha256, proof.expected_sha256);
  assert.deepEqual(proof.active_sheets, []); assert.deepEqual(proof.journal.previous_payload, before);
  assert.deepEqual(proof.remote, { ...restored, rev: proof.remote.rev });
  checks.push('Retry commits real backup through actual synced adapter, retains previous-state journal, all 31 records and exact PDF; annotation file confirms sync while originals stay outside active sheets');
  await backup().getByRole('button', { name: 'Retry / check restore sync', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'This restore generation has reached the sync provider.' }).waitFor();
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    await page.setViewportSize({ width, height }); await backup().scrollIntoViewIfNeeded();
    assert.ok(await backup().evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await page.screenshot({ path: resolve(out, `synced-${theme}-${width}.png`), animations: 'disabled' });
  }
  await page.getByRole('button', { name: 'Open original', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Original page 1 ready' }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: resolve(out, 'restored-original.png'), animations: 'disabled' });
  await other.close(); storeUrl = null; await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(moduleUrl => { window.__proofStoreUrl = moduleUrl; }, storeUrl);
  await waitForAsync(async () => page.evaluate(async () => !!(await import(window.__proofStoreUrl)).store.syncBridge));
  assert.deepEqual((await saved()).bas_workflow, baseline);
  assert.equal(await page.evaluate(async () => (await (await import(window.__proofStoreUrl)).store.syncBridge.readRestoreSyncStatus()).pending), false);
  checks.push('Actual original reader opens the retained source; app reload preserves exact history and confirmed restore-generation state');
  assert.deepEqual(errors, []);
  await writeFile(resolve(out, 'proof.json'), JSON.stringify({ checks, timings, errors, source_sha256: proof.source_sha256, replay,
    generation: proof.state.generation, transport_revision: proof.remote.rev,
    limitations: ['Real archived PDF/history; some engineering inputs are disclosed controlled declarations.', 'Real browser folder composite with OPFS, not live cloud or OS synchronization.', 'Cross-tab lease is controlled; no distributed lock or concurrent-server-writer guarantee.', 'Not drawing revision/approval or corpus accuracy acceptance.'] }, null, 2));
  console.log(JSON.stringify({ out, checks, timings, errors }));
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {});
  console.log(JSON.stringify({ checks, errors, body: (await page.locator('body').innerText()).slice(-2200) })); throw error;
} finally { await browser.close(); }
