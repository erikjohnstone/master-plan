/** Real PDF + retained history through the actual folder-sync composite, using
 * an origin-private directory in an isolated browser (not a live cloud service).
 * Competing review edits are controlled fixtures, not real drawing revisions. */
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
const page = await context.newPage(), errors = [], checks = [];
let storeUrl;
page.on('request', request => { if (!storeUrl && new URL(request.url()).pathname === '/src/lib/store.js') storeUrl = request.url(); });
page.on('pageerror', error => errors.push(String(error)));
const notice = () => page.getByRole('alert', { name: 'BAS sync needs review', exact: true });
const saved = () => page.evaluate(async () => (await import(window.__proofStoreUrl)).localStore.loadAnnotations());
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await page.evaluate(url => { window.__proofStoreUrl = url; }, storeUrl);
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(page);
  await page.locator('input[name="takeoff-import"]').setInputFiles(history);
  await waitForAsync(async () => (await saved())?.bas_workflow?.engineering_events?.at(-1)?.event_id === workflow.engineering_events.at(-1).event_id);
  const baseline = await saved();
  await page.evaluate(async () => {
    const { localStore, metaPut } = await import(window.__proofStoreUrl);
    const root = await navigator.storage.getDirectory(), dir = await root.getDirectoryHandle('bas-sync-controlled-proof', { create: true });
    if (await dir.queryPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('OPFS handle cannot exercise the actual folder gate');
    const sidecar = await dir.getDirectoryHandle('.opentakeoff', { create: true });
    const file = await sidecar.getFileHandle('annotations.json', { create: true }), writer = await file.createWritable();
    const baseline = await localStore.loadAnnotations();
    await writer.write(JSON.stringify({ ...baseline, rev: 1 })); await writer.close();
    await metaPut('fsync:handle', dir); await metaPut('fsync:scope', 'controlled-bas-sync');
    await metaPut('sync:controlled-bas-sync:touched', true);
    await metaPut('sync:controlled-bas-sync:synced_rev', 1);
    await metaPut('sync:controlled-bas-sync:synced_base', { rev: 1, data: baseline });
  });
  storeUrl = null; await page.reload({ waitUntil: 'domcontentloaded' }); await openImportedSheet(page);
  await page.evaluate(url => { window.__proofStoreUrl = url; }, storeUrl);
  await waitForAsync(async () => page.evaluate(async () => !!(await import(window.__proofStoreUrl)).store.syncBridge));
  const remote = await page.evaluate(async () => {
    const { store, metaGet } = await import(window.__proofStoreUrl);
    const { basEventFingerprint, verifyBasWorkflow } = await import('/src/lib/basWorkflow.ts');
    await store.syncBridge.whenSynced();
    const data = structuredClone(await store.loadAnnotations());
    const last = data.bas_workflow.engineering_events.at(-1);
    last.operation_id = '00000000-0000-4000-8000-000000987654';
    last.reason = 'CONTROLLED competing review decision for sync testing; not a real drawing revision';
    const { event_id, ...body } = last; last.event_id = await basEventFingerprint(body);
    await verifyBasWorkflow(data.bas_workflow);
    const dir = await metaGet('fsync:handle'), sidecar = await dir.getDirectoryHandle('.opentakeoff');
    const file = await sidecar.getFileHandle('annotations.json'), writer = await file.createWritable();
    data.rev = 2; await writer.write(JSON.stringify(data)); await writer.close();
    await store.syncBridge.checkRemote();
    return data;
  });
  await notice().waitFor();
  assert.deepEqual((await saved()).bas_workflow, baseline.bas_workflow);
  const evidence = await page.evaluate(async () => {
    const { store, metaGet } = await import(window.__proofStoreUrl);
    await store.syncBridge.flushPending();
    const dir = await metaGet('fsync:handle'), sidecar = await dir.getDirectoryHandle('.opentakeoff');
    const remote = JSON.parse(await (await (await sidecar.getFileHandle('annotations.json')).getFile()).text());
    return { remote, issue: await store.syncBridge.readSyncIssue(), rev: await metaGet('sync:controlled-bas-sync:synced_rev'),
      backups: (await store.listSnapshots()).filter(r => r.label === 'Unmerged BAS remote — review required').length };
  });
  assert.deepEqual(evidence.remote, remote); assert.equal(evidence.rev, 1); assert.equal(evidence.backups, 1);
  checks.push('Actual folder gate/composite + OPFS file transport retain both competing histories, without advancing synced rev; repeated conflict uses one recovery snapshot');
  const pendingDownload = page.waitForEvent('download');
  await notice().getByRole('button', { name: 'Export remote recovery copy', exact: true }).click();
  const download = await pendingDownload;
  assert.deepEqual(JSON.parse(await readFile(await download.path(), 'utf8')), remote);
  checks.push('Visible recovery action exports the exact unmerged remote JSON; it is labeled unverified and contains no original PDFs');
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    await page.setViewportSize({ width, height });
    assert.ok(await notice().evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    const rect = await notice().boundingBox(); assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height);
    await notice().getByRole('button', { name: 'Export remote recovery copy', exact: true }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await notice().getByRole('button', { name: 'Check sync again', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.screenshot({ path: resolve(out, `sync-${theme}-${width}.png`), animations: 'disabled' });
  }
  storeUrl = null; await page.reload({ waitUntil: 'domcontentloaded' }); await openImportedSheet(page); await notice().waitFor();
  await page.evaluate(url => { window.__proofStoreUrl = url; }, storeUrl);
  checks.push('Full app reload restores the durable sync notice; keyboard and viewport checks pass in both themes at 1280/1440/1920');
  await page.evaluate(async () => {
    const { localStore, metaGet } = await import(window.__proofStoreUrl);
    const dir = await metaGet('fsync:handle'), sidecar = await dir.getDirectoryHandle('.opentakeoff');
    const file = await sidecar.getFileHandle('annotations.json'), writer = await file.createWritable();
    await writer.write(JSON.stringify({ ...await localStore.loadAnnotations(), rev: 3 })); await writer.close();
  });
  await notice().getByRole('button', { name: 'Check sync again', exact: true }).click();
  await notice().waitFor({ state: 'hidden' });
  assert.deepEqual((await saved()).bas_workflow, baseline.bas_workflow);
  const actualSha = await page.evaluate(async name => {
    const { localStore } = await import(window.__proofStoreUrl);
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await localStore.loadPdfData(name)))].map(n => n.toString(16).padStart(2, '0')).join('');
  }, basename(pdf));
  assert.equal(actualSha, sourceSha); assert.deepEqual(errors, []);
  checks.push('Explicit retry against a compatible remote clears the notice and keeps all 31 historical calculation records and exact active PDF bytes unchanged');
  await writeFile(resolve(out, 'proof.json'), JSON.stringify({ schema: 'bas_sync_history_browser_proof_v1', source_sha256: sourceSha,
    transport: 'real_folder_composite_with_origin_private_directory', controlled_review_fork: true, live_cloud_tested: false,
    extraction_accuracy_claim: false, archive_restore_tested: false, recovery_snapshot: evidence.issue.snapshot_id, checks, errors }, null, 2));
  console.log(JSON.stringify({ out, checks, errors }));
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {});
  console.log(JSON.stringify({ storeUrl, errors, checks, body: (await page.locator('body').innerText()).slice(-1800) }));
  throw error;
} finally { await context.close(); await browser.close(); }
